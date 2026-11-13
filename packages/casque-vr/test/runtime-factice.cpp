// Runtime OpenXR factice : le banc d'essai du compagnon du casque, sans casque ni fenêtre (13 novembre 2026 :
// chaque correctif de la VR partait sans avoir tourné sur un runtime, le joueur servait de banc).
//
// Une DLL que le compagnon charge à la place du chargeur de VPX (--chargeur), ou qu'un chargeur OpenXR
// charge comme runtime (manifeste runtime-factice.json, XR_RUNTIME_JSON pour un seul processus). Elle
// joue un scénario écrit dans un fichier texte, au fil de l'horloge, et note tout ce que l'application
// fait dans une trace. Rien n'est affiché : les images rendues vont dans des textures Direct3D 11
// que personne ne montre.
//
// Ce qu'elle reproduit, d'après les journaux du PinCab (Meta Quest Link, 12 et 13 novembre 2026) :
// - casque retiré : FOCUSED → VISIBLE → SYNCHRONIZED → STOPPING ; l'application appelle xrEndSession,
//   la session passe IDLE ; casque remis : READY sur la même session (comme VPX la reprend) ;
// - limite fixe : aucune limite de pièce lisible (xrGetReferenceSpaceBoundsRect rend
//   XR_SPACE_BOUNDS_UNAVAILABLE), et l'origine de la pièce déplacée sans événement ;
// - boutons, gâchettes et joysticks des manettes Touch, poses de la tête et des manettes.
//
// Variables d'environnement :
//   CYBERPINBALL_XR_SCENARIO  fichier du scénario (une ligne par instant : « <ms> <verbe> <arguments> »)
//   CYBERPINBALL_XR_DEBUT     instant zéro du scénario (millisecondes depuis 1970), commun aux processus
//   CYBERPINBALL_XR_DEBUT_FICHIER  sinon : l'instant zéro est celui de la première session créée, écrit ici
//   CYBERPINBALL_XR_TRACE     fichier où la trace est ajoutée (« <ms> <pid> <ce qui se passe> »)
//
// Verbes du scénario :
//   porte 1|0                       casque mis ou retiré
//   absent 1|0                      casque débranché (xrGetSystem : XR_ERROR_FORM_FACTOR_UNAVAILABLE)
//   reprise auto|manuelle           casque remis : la session reprend seule (défaut), ou attend « choisir »
//   choisir                         l'application est rechoisie dans l'accueil de Link (READY)
//   limite fixe | limite piece L P  limite du Quest
//   origine X Z LACET [evenement]   origine de la pièce dans le monde (le Quest recentre) ; avec
//                                   « evenement », XrEventDataReferenceSpaceChangePending est envoyé
//   tete X Y Z LACET                tête dans le monde (mètres, radians)
//   manette gauche|droite X Y Z     bout de la manette dans le monde (sa prise : 8 cm en arrière, 3 cm au-dessus)
//   suivie gauche|droite 1|0        la manette suivie ou non
//   bouton <chemin> 1|0             un bouton (chemin OpenXR complet, /user/hand/…/click)
//   valeur <chemin> V               un axe ou une gâchette (/user/hand/…/value, …/x, …/y)
//   quitter                         le runtime met fin à la session (EXITING)

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>

#define XR_USE_PLATFORM_WIN32
#define XR_USE_GRAPHICS_API_D3D11
#define XR_NO_PROTOTYPES
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <deque>
#include <fstream>
#include <map>
#include <mutex>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")

namespace {

// --- Interface entre chargeur et runtime (loader_interfaces.h de Khronos, version 1) ----------------
enum XrLoaderInterfaceStructs
{
   XR_LOADER_INTERFACE_STRUCT_UNINTIALIZED = 0,
   XR_LOADER_INTERFACE_STRUCT_LOADER_INFO,
   XR_LOADER_INTERFACE_STRUCT_API_LAYER_REQUEST,
   XR_LOADER_INTERFACE_STRUCT_RUNTIME_REQUEST,
};
struct XrNegotiateLoaderInfo
{
   XrLoaderInterfaceStructs structType;
   uint32_t structVersion;
   size_t structSize;
   uint32_t minInterfaceVersion;
   uint32_t maxInterfaceVersion;
   XrVersion minApiVersion;
   XrVersion maxApiVersion;
};
struct XrNegotiateRuntimeRequest
{
   XrLoaderInterfaceStructs structType;
   uint32_t structVersion;
   size_t structSize;
   uint32_t runtimeInterfaceVersion;
   XrVersion runtimeApiVersion;
   PFN_xrGetInstanceProcAddr getInstanceProcAddr;
};

// --- Géométrie -----------------------------------------------------------------------------------
XrQuaternionf yawQuat(float yaw) { return { 0.f, std::sin(yaw / 2.f), 0.f, std::cos(yaw / 2.f) }; }
XrQuaternionf mul(const XrQuaternionf& a, const XrQuaternionf& b)
{
   return { a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z };
}
XrQuaternionf conj(const XrQuaternionf& q) { return { -q.x, -q.y, -q.z, q.w }; }
XrVector3f rot(const XrQuaternionf& q, const XrVector3f& v)
{
   const XrQuaternionf p { v.x, v.y, v.z, 0.f };
   const XrQuaternionf r = mul(mul(q, p), conj(q));
   return { r.x, r.y, r.z };
}
XrPosef compose(const XrPosef& a, const XrPosef& b) // a puis b exprimé dans a
{
   const XrVector3f t = rot(a.orientation, b.position);
   return { mul(a.orientation, b.orientation), { a.position.x + t.x, a.position.y + t.y, a.position.z + t.z } };
}
XrPosef inverse(const XrPosef& a)
{
   const XrQuaternionf q = conj(a.orientation);
   const XrVector3f t = rot(q, a.position);
   return { q, { -t.x, -t.y, -t.z } };
}
XrPosef identity() { return { { 0, 0, 0, 1 }, { 0, 0, 0 } }; }

// --- État du monde et du scénario ----------------------------------------------------------------
struct Step
{
   long long ms;
   std::string verb;
   std::vector<std::string> args;
   bool done = false;
};

struct World
{
   bool worn = true, absent = false, manualResume = false, chosen = false, quit = false;
   bool roomscale = false;
   float roomW = 0.f, roomD = 0.f;
   XrPosef origin = identity(); // origine de la pièce (STAGE) dans le monde
   XrPosef head { { 0, 0, 0, 1 }, { 0.f, 1.6f, 0.f } };
   XrVector3f tip[2] { { -0.3f, 1.0f, -0.35f }, { 0.3f, 1.0f, -0.35f } };
   bool tracked[2] { true, true };
   std::map<std::string, float> inputs; // chemins → valeur (bouton : 0 ou 1)
};

std::mutex lock;
World world;
std::vector<Step> steps;
std::string tracePath;
long long epochStart = 0;
bool initialised = false;

long long nowEpochMs()
{
   FILETIME ft;
   GetSystemTimeAsFileTime(&ft);
   ULARGE_INTEGER u;
   u.LowPart = ft.dwLowDateTime;
   u.HighPart = ft.dwHighDateTime;
   return static_cast<long long>((u.QuadPart - 116444736000000000ULL) / 10000ULL);
}
/** Fichier où l'instant zéro est écrit à la première session créée (commun aux processus du compagnon). */
std::string startFile;

/** Millisecondes depuis l'instant zéro ; 0 tant que la première session n'est pas créée. */
long long scenarioMs()
{
   if (!epochStart && !startFile.empty())
   {
      std::ifstream f(startFile);
      long long v = 0;
      if (f >> v)
         epochStart = v;
   }
   return epochStart ? nowEpochMs() - epochStart : 0;
}

/** La première session créée fixe l'instant zéro du scénario (un compagnon lent à démarrer ne le décale pas). */
void startClock()
{
   if (epochStart || startFile.empty())
      return;
   epochStart = nowEpochMs();
   std::ofstream f(startFile);
   f << epochStart;
}

void trace(const std::string& what)
{
   if (tracePath.empty())
      return;
   FILE* f = nullptr;
   if (fopen_s(&f, tracePath.c_str(), "ab") == 0 && f)
   {
      std::fprintf(f, "%lld %lu %s\n", scenarioMs(), GetCurrentProcessId(), what.c_str());
      std::fclose(f);
   }
}

std::string env(const char* name)
{
   char buf[2048] {};
   const DWORD n = GetEnvironmentVariableA(name, buf, sizeof buf);
   return n && n < sizeof buf ? std::string(buf, n) : std::string();
}

void init()
{
   if (initialised)
      return;
   initialised = true;
   tracePath = env("CYBERPINBALL_XR_TRACE");
   startFile = env("CYBERPINBALL_XR_DEBUT_FICHIER");
   const std::string start = env("CYBERPINBALL_XR_DEBUT");
   epochStart = !start.empty() ? std::stoll(start) : startFile.empty() ? nowEpochMs() : 0;
   std::ifstream file(env("CYBERPINBALL_XR_SCENARIO"));
   std::string line;
   while (std::getline(file, line))
   {
      if (line.empty() || line[0] == '#')
         continue;
      std::istringstream in(line);
      Step s;
      if (!(in >> s.ms >> s.verb))
         continue;
      std::string a;
      while (in >> a)
         s.args.push_back(a);
      steps.push_back(s);
   }
   trace("runtime charge, scenario de " + std::to_string(steps.size()) + " etapes");
}

// --- Objets OpenXR ---------------------------------------------------------------------------------
struct Instance;
struct Session;

struct ActionSet
{
   std::string name;
};
struct Action
{
   ActionSet* set;
   std::string name;
   XrActionType type;
   bool lastBool = false;
   float lastFloat = 0.f;
   bool changedBool = false, changedFloat = false;
};
struct Swapchain
{
   Session* session;
   std::vector<ID3D11Texture2D*> images;
   uint32_t next = 0;
};
enum class SpaceKind { Reference, Action };
struct Space
{
   Session* session;
   SpaceKind kind;
   XrReferenceSpaceType ref = XR_REFERENCE_SPACE_TYPE_STAGE;
   Action* action = nullptr;
   XrPosef offset = identity();
};

struct Instance
{
   std::vector<std::string> paths { "" };
   std::map<std::string, XrPath> pathIds;
   // Liaisons proposées : profil → (action → chemins)
   std::map<XrPath, std::map<Action*, std::vector<XrPath>>> bindings;
   std::vector<Session*> sessions;
};

struct Session
{
   Instance* instance;
   ID3D11Device* device = nullptr;
   XrSessionState state = XR_SESSION_STATE_UNKNOWN;
   bool running = false, exitRequested = false, attached = false, profileSaid = false;
   bool wasWorn = true;
   std::deque<XrEventDataBuffer> events;
   std::set<Action*> attachedActions;
   long long frames = 0;
   XrTime lastDisplay = 0;
};

std::deque<XrEventDataBuffer> instanceEvents;

XrPath pathOf(Instance* inst, const std::string& s)
{
   if (auto it = inst->pathIds.find(s); it != inst->pathIds.end())
      return it->second;
   const XrPath id = inst->paths.size();
   inst->paths.push_back(s);
   inst->pathIds[s] = id;
   return id;
}

const char* stateName(XrSessionState s)
{
   switch (s)
   {
   case XR_SESSION_STATE_IDLE: return "IDLE";
   case XR_SESSION_STATE_READY: return "READY";
   case XR_SESSION_STATE_SYNCHRONIZED: return "SYNCHRONIZED";
   case XR_SESSION_STATE_VISIBLE: return "VISIBLE";
   case XR_SESSION_STATE_FOCUSED: return "FOCUSED";
   case XR_SESSION_STATE_STOPPING: return "STOPPING";
   case XR_SESSION_STATE_LOSS_PENDING: return "LOSS_PENDING";
   case XR_SESSION_STATE_EXITING: return "EXITING";
   default: return "UNKNOWN";
   }
}

XrTime nowXr()
{
   LARGE_INTEGER c, f;
   QueryPerformanceCounter(&c);
   QueryPerformanceFrequency(&f);
   return static_cast<XrTime>(static_cast<double>(c.QuadPart) * 1e9 / static_cast<double>(f.QuadPart));
}

void setState(Session* s, XrSessionState st)
{
   s->state = st;
   XrEventDataBuffer b { XR_TYPE_EVENT_DATA_BUFFER };
   auto* e = reinterpret_cast<XrEventDataSessionStateChanged*>(&b);
   e->type = XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED;
   e->next = nullptr;
   e->session = reinterpret_cast<XrSession>(s);
   e->state = st;
   e->time = nowXr();
   s->events.push_back(b);
   trace(std::string("etat ") + stateName(st));
}

/** Le casque mis : la session reprend (ou attend d'être rechoisie), puis elle a le regard. */
void wearOn(Session* s)
{
   if (s->state == XR_SESSION_STATE_IDLE && !s->exitRequested && (!world.manualResume || world.chosen))
      setState(s, XR_SESSION_STATE_READY);
   else if (s->running && s->state == XR_SESSION_STATE_SYNCHRONIZED)
   {
      setState(s, XR_SESSION_STATE_VISIBLE);
      setState(s, XR_SESSION_STATE_FOCUSED);
   }
}

/** Le casque retiré : comme Link, la session descend jusqu'à STOPPING (l'application doit la terminer). */
void wearOff(Session* s)
{
   if (!s->running)
      return;
   if (s->state == XR_SESSION_STATE_FOCUSED)
      setState(s, XR_SESSION_STATE_VISIBLE);
   if (s->state == XR_SESSION_STATE_VISIBLE)
      setState(s, XR_SESSION_STATE_SYNCHRONIZED);
   if (s->state == XR_SESSION_STATE_SYNCHRONIZED)
      setState(s, XR_SESSION_STATE_STOPPING);
}

float num(const Step& s, size_t i, float d = 0.f) { return i < s.args.size() ? std::stof(s.args[i]) : d; }

/** Les étapes du scénario arrivées à leur heure ; `silent` au chargement (rien n'existait encore). */
void advance(bool silent = false)
{
   const long long t = scenarioMs();
   for (Step& st : steps)
   {
      if (st.done || st.ms > t)
         continue;
      st.done = true;
      if (!silent)
         trace("scenario " + st.verb + (st.args.empty() ? "" : " " + st.args[0]));
      if (st.verb == "porte")
         world.worn = num(st, 0) != 0.f;
      else if (st.verb == "absent")
         world.absent = num(st, 0) != 0.f;
      else if (st.verb == "reprise")
         world.manualResume = !st.args.empty() && st.args[0] == "manuelle";
      else if (st.verb == "choisir")
         world.chosen = true;
      else if (st.verb == "limite")
      {
         world.roomscale = !st.args.empty() && st.args[0] == "piece";
         world.roomW = num(st, 1), world.roomD = num(st, 2);
      }
      else if (st.verb == "origine")
      {
         const XrPosef before = world.origin;
         world.origin = { yawQuat(num(st, 2)), { num(st, 0), 0.f, num(st, 1) } };
         if (!silent && st.args.size() > 3 && st.args[3] == "evenement")
         {
            XrEventDataBuffer b { XR_TYPE_EVENT_DATA_BUFFER };
            auto* e = reinterpret_cast<XrEventDataReferenceSpaceChangePending*>(&b);
            e->type = XR_TYPE_EVENT_DATA_REFERENCE_SPACE_CHANGE_PENDING;
            e->referenceSpaceType = XR_REFERENCE_SPACE_TYPE_STAGE;
            e->changeTime = nowXr();
            e->poseValid = XR_TRUE;
            e->poseInPreviousSpace = compose(inverse(before), world.origin);
            instanceEvents.push_back(b);
         }
      }
      else if (st.verb == "tete")
         world.head = { yawQuat(num(st, 3)), { num(st, 0), num(st, 1), num(st, 2) } };
      else if (st.verb == "manette")
      {
         const int h = !st.args.empty() && st.args[0] == "droite" ? 1 : 0;
         world.tip[h] = { num(st, 1), num(st, 2), num(st, 3) };
      }
      else if (st.verb == "suivie")
      {
         const int h = !st.args.empty() && st.args[0] == "droite" ? 1 : 0;
         world.tracked[h] = num(st, 1) != 0.f;
      }
      else if (st.verb == "bouton" || st.verb == "valeur")
      {
         if (!st.args.empty())
            world.inputs[st.args[0]] = num(st, 1);
      }
      else if (st.verb == "quitter")
         world.quit = true;
   }
}

/** Le scénario avancé, puis chaque session suit le casque. */
void step(Instance* inst)
{
   advance();
   for (Session* s : inst->sessions)
   {
      if (world.quit && s->state != XR_SESSION_STATE_EXITING && s->state != XR_SESSION_STATE_STOPPING)
      {
         s->exitRequested = true;
         if (s->running)
            wearOff(s);
         else
            setState(s, XR_SESSION_STATE_EXITING);
         continue;
      }
      if (world.worn != s->wasWorn)
      {
         s->wasWorn = world.worn;
         if (world.worn)
            wearOn(s);
         else
            wearOff(s);
      }
      else if (world.worn && world.chosen && s->state == XR_SESSION_STATE_IDLE)
         wearOn(s);
   }
}

// --- Fonctions ------------------------------------------------------------------------------------
XrResult XRAPI_CALL enumerateExtensions(const char*, uint32_t cap, uint32_t* count, XrExtensionProperties* props)
{
   static const char* names[] = { XR_KHR_D3D11_ENABLE_EXTENSION_NAME, XR_KHR_COMPOSITION_LAYER_DEPTH_EXTENSION_NAME, XR_KHR_COMPOSITION_LAYER_COLOR_SCALE_BIAS_EXTENSION_NAME };
   *count = 3;
   if (!cap)
      return XR_SUCCESS;
   if (cap < 3)
      return XR_ERROR_SIZE_INSUFFICIENT;
   for (uint32_t i = 0; i < 3; i++)
   {
      strcpy_s(props[i].extensionName, names[i]);
      props[i].extensionVersion = 1;
   }
   return XR_SUCCESS;
}

XrResult XRAPI_CALL enumerateLayers(uint32_t, uint32_t* count, XrApiLayerProperties*)
{
   *count = 0;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL createInstance(const XrInstanceCreateInfo* ci, XrInstance* out)
{
   std::lock_guard<std::mutex> g(lock);
   init();
   advance(true);
   *out = reinterpret_cast<XrInstance>(new Instance());
   trace(std::string("instance ") + ci->applicationInfo.applicationName);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL destroyInstance(XrInstance i)
{
   std::lock_guard<std::mutex> g(lock);
   delete reinterpret_cast<Instance*>(i);
   trace("instance detruite");
   return XR_SUCCESS;
}

XrResult XRAPI_CALL getInstanceProperties(XrInstance, XrInstanceProperties* p)
{
   strcpy_s(p->runtimeName, "Banc Cyber Pinball");
   p->runtimeVersion = XR_MAKE_VERSION(1, 0, 0);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL getSystem(XrInstance, const XrSystemGetInfo*, XrSystemId* id)
{
   std::lock_guard<std::mutex> g(lock);
   advance();
   if (world.absent)
      return XR_ERROR_FORM_FACTOR_UNAVAILABLE;
   *id = 1;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL getD3D11Requirements(XrInstance, XrSystemId, XrGraphicsRequirementsD3D11KHR* req)
{
   IDXGIFactory1* factory = nullptr;
   if (FAILED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(&factory))))
      return XR_ERROR_RUNTIME_FAILURE;
   IDXGIAdapter1* adapter = nullptr;
   if (FAILED(factory->EnumAdapters1(0, &adapter)))
   {
      factory->Release();
      return XR_ERROR_RUNTIME_FAILURE;
   }
   DXGI_ADAPTER_DESC1 d;
   adapter->GetDesc1(&d);
   req->adapterLuid = d.AdapterLuid;
   req->minFeatureLevel = D3D_FEATURE_LEVEL_11_0;
   adapter->Release();
   factory->Release();
   return XR_SUCCESS;
}

XrResult XRAPI_CALL resultToString(XrInstance, XrResult r, char buffer[XR_MAX_RESULT_STRING_SIZE])
{
   const char* s = r == XR_SUCCESS ? "XR_SUCCESS" : r == XR_ERROR_FORM_FACTOR_UNAVAILABLE ? "XR_ERROR_FORM_FACTOR_UNAVAILABLE" : r == XR_SESSION_LOSS_PENDING ? "XR_SESSION_LOSS_PENDING" : "XR_ERROR";
   strcpy_s(buffer, XR_MAX_RESULT_STRING_SIZE, s);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL createSession(XrInstance i, const XrSessionCreateInfo* ci, XrSession* out)
{
   std::lock_guard<std::mutex> g(lock);
   advance();
   auto* inst = reinterpret_cast<Instance*>(i);
   auto* s = new Session();
   s->instance = inst;
   for (auto* n = static_cast<const XrBaseInStructure*>(ci->next); n; n = n->next)
      if (n->type == XR_TYPE_GRAPHICS_BINDING_D3D11_KHR)
         s->device = reinterpret_cast<const XrGraphicsBindingD3D11KHR*>(n)->device;
   if (!s->device)
   {
      delete s;
      return XR_ERROR_GRAPHICS_DEVICE_INVALID;
   }
   inst->sessions.push_back(s);
   startClock();
   trace("session creee");
   setState(s, XR_SESSION_STATE_IDLE);
   s->wasWorn = world.worn;
   // Une session neuve prend le casque s'il est porté (au PinCab : READY en 0 à 4 s) ; « reprise manuelle »
   // ne vaut que pour une session arrêtée qui reprend.
   if (world.worn)
      setState(s, XR_SESSION_STATE_READY);
   *out = reinterpret_cast<XrSession>(s);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL destroySession(XrSession h)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   auto& list = s->instance->sessions;
   list.erase(std::remove(list.begin(), list.end(), s), list.end());
   trace("session detruite images=" + std::to_string(s->frames));
   delete s;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL beginSession(XrSession h, const XrSessionBeginInfo*)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   if (s->state != XR_SESSION_STATE_READY)
   {
      trace(std::string("begin refuse etat=") + stateName(s->state));
      return XR_ERROR_SESSION_NOT_READY;
   }
   s->running = true;
   trace("begin");
   setState(s, XR_SESSION_STATE_SYNCHRONIZED);
   if (world.worn)
   {
      setState(s, XR_SESSION_STATE_VISIBLE);
      setState(s, XR_SESSION_STATE_FOCUSED);
      if (s->attached && !s->profileSaid)
      {
         s->profileSaid = true;
         XrEventDataBuffer b { XR_TYPE_EVENT_DATA_BUFFER };
         auto* e = reinterpret_cast<XrEventDataInteractionProfileChanged*>(&b);
         e->type = XR_TYPE_EVENT_DATA_INTERACTION_PROFILE_CHANGED;
         e->session = h;
         s->events.push_back(b);
      }
   }
   return XR_SUCCESS;
}

XrResult XRAPI_CALL endSession(XrSession h)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   if (s->state != XR_SESSION_STATE_STOPPING)
   {
      trace(std::string("end refuse etat=") + stateName(s->state));
      return XR_ERROR_SESSION_NOT_STOPPING;
   }
   s->running = false;
   trace("end");
   setState(s, XR_SESSION_STATE_IDLE);
   if (s->exitRequested)
      setState(s, XR_SESSION_STATE_EXITING);
   else if (world.worn && !world.manualResume)
      setState(s, XR_SESSION_STATE_READY);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL requestExitSession(XrSession h)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   s->exitRequested = true;
   trace("sortie demandee");
   if (s->running)
   {
      if (s->state == XR_SESSION_STATE_FOCUSED)
         setState(s, XR_SESSION_STATE_VISIBLE);
      if (s->state == XR_SESSION_STATE_VISIBLE)
         setState(s, XR_SESSION_STATE_SYNCHRONIZED);
      setState(s, XR_SESSION_STATE_STOPPING);
   }
   else
      setState(s, XR_SESSION_STATE_EXITING);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL pollEvent(XrInstance i, XrEventDataBuffer* out)
{
   std::lock_guard<std::mutex> g(lock);
   auto* inst = reinterpret_cast<Instance*>(i);
   step(inst);
   if (!instanceEvents.empty())
   {
      // Changement de pièce : pour chaque session.
      XrEventDataBuffer b = instanceEvents.front();
      instanceEvents.pop_front();
      if (!inst->sessions.empty())
         reinterpret_cast<XrEventDataReferenceSpaceChangePending*>(&b)->session = reinterpret_cast<XrSession>(inst->sessions.front());
      *out = b;
      return XR_SUCCESS;
   }
   for (Session* s : inst->sessions)
      if (!s->events.empty())
      {
         *out = s->events.front();
         s->events.pop_front();
         return XR_SUCCESS;
      }
   return XR_EVENT_UNAVAILABLE;
}

XrResult XRAPI_CALL waitFrame(XrSession h, const XrFrameWaitInfo*, XrFrameState* fs)
{
   auto* s = reinterpret_cast<Session*>(h);
   {
      std::lock_guard<std::mutex> g(lock);
      if (!s->running)
         return XR_ERROR_SESSION_NOT_RUNNING;
   }
   Sleep(11);
   std::lock_guard<std::mutex> g(lock);
   step(s->instance);
   const XrDuration period = 13'888'889;
   s->lastDisplay = std::max(nowXr() + period, s->lastDisplay + period);
   fs->predictedDisplayTime = s->lastDisplay;
   fs->predictedDisplayPeriod = period;
   fs->shouldRender = s->state == XR_SESSION_STATE_VISIBLE || s->state == XR_SESSION_STATE_FOCUSED ? XR_TRUE : XR_FALSE;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL beginFrame(XrSession h, const XrFrameBeginInfo*)
{
   auto* s = reinterpret_cast<Session*>(h);
   return s->running ? XR_SUCCESS : XR_ERROR_SESSION_NOT_RUNNING;
}

XrResult XRAPI_CALL endFrame(XrSession h, const XrFrameEndInfo* info)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   if (!s->running)
      return XR_ERROR_SESSION_NOT_RUNNING;
   s->frames++;
   if (s->frames == 1 || s->frames % 360 == 0)
      trace("image " + std::to_string(s->frames) + " couches=" + std::to_string(info->layerCount));
   return XR_SUCCESS;
}

XrResult XRAPI_CALL enumerateReferenceSpaces(XrSession, uint32_t cap, uint32_t* count, XrReferenceSpaceType* types)
{
   *count = 3;
   if (!cap)
      return XR_SUCCESS;
   if (cap < 3)
      return XR_ERROR_SIZE_INSUFFICIENT;
   types[0] = XR_REFERENCE_SPACE_TYPE_VIEW;
   types[1] = XR_REFERENCE_SPACE_TYPE_LOCAL;
   types[2] = XR_REFERENCE_SPACE_TYPE_STAGE;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL createReferenceSpace(XrSession h, const XrReferenceSpaceCreateInfo* ci, XrSpace* out)
{
   auto* sp = new Space { reinterpret_cast<Session*>(h), SpaceKind::Reference, ci->referenceSpaceType, nullptr, ci->poseInReferenceSpace };
   *out = reinterpret_cast<XrSpace>(sp);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL createActionSpace(XrSession h, const XrActionSpaceCreateInfo* ci, XrSpace* out)
{
   auto* sp = new Space { reinterpret_cast<Session*>(h), SpaceKind::Action, XR_REFERENCE_SPACE_TYPE_STAGE, reinterpret_cast<Action*>(ci->action), ci->poseInActionSpace };
   *out = reinterpret_cast<XrSpace>(sp);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL destroySpace(XrSpace s)
{
   delete reinterpret_cast<Space*>(s);
   return XR_SUCCESS;
}

/** Le chemin lié à une action pour le profil Touch (le seul que le banc simule), ou "". */
std::string boundPath(Session* s, Action* a)
{
   Instance* inst = s->instance;
   const XrPath touch = pathOf(inst, "/interaction_profiles/oculus/touch_controller");
   auto it = inst->bindings.find(touch);
   if (it == inst->bindings.end())
      return "";
   auto b = it->second.find(a);
   return b == it->second.end() || b->second.empty() ? "" : inst->paths[b->second.front()];
}

/** La pose d'un espace dans le monde, et s'il est suivi. */
bool worldPose(Space* sp, XrPosef& out)
{
   if (sp->kind == SpaceKind::Reference)
   {
      XrPosef o = sp->ref == XR_REFERENCE_SPACE_TYPE_VIEW ? world.head
         : sp->ref == XR_REFERENCE_SPACE_TYPE_LOCAL       ? XrPosef { world.origin.orientation, { world.origin.position.x, 1.6f, world.origin.position.z } }
                                                          : world.origin;
      out = compose(o, sp->offset);
      return true;
   }
   const std::string path = boundPath(sp->session, sp->action);
   const int h = path.find("/user/hand/right") == 0 ? 1 : path.find("/user/hand/left") == 0 ? 0 : -1;
   if (h < 0 || !world.tracked[h])
      return false;
   XrPosef p { { 0, 0, 0, 1 }, world.tip[h] };
   if (path.find("/grip/pose") != std::string::npos)
      p.position = { p.position.x, p.position.y + 0.03f, p.position.z + 0.08f };
   out = compose(p, sp->offset);
   return true;
}

XrResult XRAPI_CALL locateSpace(XrSpace space, XrSpace baseSpace, XrTime, XrSpaceLocation* loc)
{
   std::lock_guard<std::mutex> g(lock);
   XrPosef a, b;
   if (!worldPose(reinterpret_cast<Space*>(space), a) || !worldPose(reinterpret_cast<Space*>(baseSpace), b))
   {
      loc->locationFlags = 0;
      return XR_SUCCESS;
   }
   loc->pose = compose(inverse(b), a);
   loc->locationFlags = XR_SPACE_LOCATION_POSITION_VALID_BIT | XR_SPACE_LOCATION_ORIENTATION_VALID_BIT | XR_SPACE_LOCATION_POSITION_TRACKED_BIT | XR_SPACE_LOCATION_ORIENTATION_TRACKED_BIT;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL locateViews(XrSession, const XrViewLocateInfo* info, XrViewState* vs, uint32_t cap, uint32_t* count, XrView* views)
{
   std::lock_guard<std::mutex> g(lock);
   *count = 2;
   if (!cap)
      return XR_SUCCESS;
   XrPosef base;
   worldPose(reinterpret_cast<Space*>(info->space), base);
   const XrPosef head = compose(inverse(base), world.head);
   vs->viewStateFlags = XR_VIEW_STATE_POSITION_VALID_BIT | XR_VIEW_STATE_ORIENTATION_VALID_BIT | XR_VIEW_STATE_POSITION_TRACKED_BIT | XR_VIEW_STATE_ORIENTATION_TRACKED_BIT;
   for (uint32_t e = 0; e < 2 && e < cap; e++)
   {
      views[e].pose = compose(head, XrPosef { { 0, 0, 0, 1 }, { e ? 0.032f : -0.032f, 0.f, 0.f } });
      views[e].fov = { -0.785f, 0.785f, 0.785f, -0.785f };
   }
   return XR_SUCCESS;
}

XrResult XRAPI_CALL enumerateViewConfigurationViews(XrInstance, XrSystemId, XrViewConfigurationType, uint32_t cap, uint32_t* count, XrViewConfigurationView* v)
{
   *count = 2;
   if (!cap)
      return XR_SUCCESS;
   for (uint32_t i = 0; i < 2 && i < cap; i++)
   {
      v[i].recommendedImageRectWidth = v[i].maxImageRectWidth = 512;
      v[i].recommendedImageRectHeight = v[i].maxImageRectHeight = 512;
      v[i].recommendedSwapchainSampleCount = v[i].maxSwapchainSampleCount = 1;
   }
   return XR_SUCCESS;
}

XrResult XRAPI_CALL enumerateSwapchainFormats(XrSession, uint32_t cap, uint32_t* count, int64_t* formats)
{
   static const int64_t list[] = { DXGI_FORMAT_R8G8B8A8_UNORM_SRGB, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_D32_FLOAT };
   *count = 5;
   if (!cap)
      return XR_SUCCESS;
   for (uint32_t i = 0; i < 5 && i < cap; i++)
      formats[i] = list[i];
   return XR_SUCCESS;
}

DXGI_FORMAT typeless(DXGI_FORMAT f)
{
   switch (f)
   {
   case DXGI_FORMAT_R8G8B8A8_UNORM:
   case DXGI_FORMAT_R8G8B8A8_UNORM_SRGB: return DXGI_FORMAT_R8G8B8A8_TYPELESS;
   case DXGI_FORMAT_B8G8R8A8_UNORM:
   case DXGI_FORMAT_B8G8R8A8_UNORM_SRGB: return DXGI_FORMAT_B8G8R8A8_TYPELESS;
   case DXGI_FORMAT_D32_FLOAT: return DXGI_FORMAT_R32_TYPELESS;
   default: return f;
   }
}

XrResult XRAPI_CALL createSwapchain(XrSession h, const XrSwapchainCreateInfo* ci, XrSwapchain* out)
{
   auto* s = reinterpret_cast<Session*>(h);
   auto* sc = new Swapchain { s };
   const bool depth = (ci->usageFlags & XR_SWAPCHAIN_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT) != 0;
   D3D11_TEXTURE2D_DESC d {};
   d.Width = ci->width;
   d.Height = ci->height;
   d.MipLevels = 1;
   d.ArraySize = ci->arraySize;
   d.Format = typeless(static_cast<DXGI_FORMAT>(ci->format));
   d.SampleDesc.Count = 1;
   d.Usage = D3D11_USAGE_DEFAULT;
   d.BindFlags = depth ? D3D11_BIND_DEPTH_STENCIL | D3D11_BIND_SHADER_RESOURCE : D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
   for (int i = 0; i < 3; i++)
   {
      ID3D11Texture2D* t = nullptr;
      if (FAILED(s->device->CreateTexture2D(&d, nullptr, &t)))
      {
         for (auto* x : sc->images)
            x->Release();
         delete sc;
         return XR_ERROR_SWAPCHAIN_FORMAT_UNSUPPORTED;
      }
      sc->images.push_back(t);
   }
   *out = reinterpret_cast<XrSwapchain>(sc);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL destroySwapchain(XrSwapchain h)
{
   auto* sc = reinterpret_cast<Swapchain*>(h);
   for (auto* t : sc->images)
      t->Release();
   delete sc;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL enumerateSwapchainImages(XrSwapchain h, uint32_t cap, uint32_t* count, XrSwapchainImageBaseHeader* images)
{
   auto* sc = reinterpret_cast<Swapchain*>(h);
   *count = static_cast<uint32_t>(sc->images.size());
   if (!cap)
      return XR_SUCCESS;
   auto* d3d = reinterpret_cast<XrSwapchainImageD3D11KHR*>(images);
   for (uint32_t i = 0; i < *count && i < cap; i++)
      d3d[i].texture = sc->images[i];
   return XR_SUCCESS;
}

XrResult XRAPI_CALL acquireSwapchainImage(XrSwapchain h, const XrSwapchainImageAcquireInfo*, uint32_t* index)
{
   auto* sc = reinterpret_cast<Swapchain*>(h);
   *index = sc->next;
   sc->next = (sc->next + 1) % static_cast<uint32_t>(sc->images.size());
   return XR_SUCCESS;
}

XrResult XRAPI_CALL waitSwapchainImage(XrSwapchain, const XrSwapchainImageWaitInfo*) { return XR_SUCCESS; }
XrResult XRAPI_CALL releaseSwapchainImage(XrSwapchain, const XrSwapchainImageReleaseInfo*) { return XR_SUCCESS; }

XrResult XRAPI_CALL stringToPath(XrInstance i, const char* s, XrPath* out)
{
   std::lock_guard<std::mutex> g(lock);
   *out = pathOf(reinterpret_cast<Instance*>(i), s);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL pathToString(XrInstance i, XrPath p, uint32_t cap, uint32_t* count, char* buf)
{
   std::lock_guard<std::mutex> g(lock);
   auto* inst = reinterpret_cast<Instance*>(i);
   if (p >= inst->paths.size())
      return XR_ERROR_PATH_INVALID;
   const std::string& s = inst->paths[p];
   *count = static_cast<uint32_t>(s.size() + 1);
   if (!cap)
      return XR_SUCCESS;
   if (cap < *count)
      return XR_ERROR_SIZE_INSUFFICIENT;
   std::memcpy(buf, s.c_str(), s.size() + 1);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL createActionSet(XrInstance, const XrActionSetCreateInfo* ci, XrActionSet* out)
{
   *out = reinterpret_cast<XrActionSet>(new ActionSet { ci->actionSetName });
   return XR_SUCCESS;
}

XrResult XRAPI_CALL createAction(XrActionSet set, const XrActionCreateInfo* ci, XrAction* out)
{
   *out = reinterpret_cast<XrAction>(new Action { reinterpret_cast<ActionSet*>(set), ci->actionName, ci->actionType });
   return XR_SUCCESS;
}

XrResult XRAPI_CALL suggestBindings(XrInstance i, const XrInteractionProfileSuggestedBinding* sb)
{
   std::lock_guard<std::mutex> g(lock);
   auto* inst = reinterpret_cast<Instance*>(i);
   auto& map = inst->bindings[sb->interactionProfile];
   map.clear();
   for (uint32_t k = 0; k < sb->countSuggestedBindings; k++)
      map[reinterpret_cast<Action*>(sb->suggestedBindings[k].action)].push_back(sb->suggestedBindings[k].binding);
   return XR_SUCCESS;
}

XrResult XRAPI_CALL attachActionSets(XrSession h, const XrSessionActionSetsAttachInfo* info)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   if (s->attached)
      return XR_ERROR_ACTIONSETS_ALREADY_ATTACHED;
   s->attached = true;
   for (auto& [profile, actions] : s->instance->bindings)
      for (auto& [action, paths] : actions)
         for (uint32_t k = 0; k < info->countActionSets; k++)
            if (action->set == reinterpret_cast<ActionSet*>(info->actionSets[k]))
               s->attachedActions.insert(action);
   trace("actions attachees " + std::to_string(s->attachedActions.size()));
   return XR_SUCCESS;
}

float inputOf(Session* s, Action* a)
{
   const std::string path = boundPath(s, a);
   if (path.empty())
      return 0.f;
   if (auto it = world.inputs.find(path); it != world.inputs.end())
      return it->second;
   return 0.f;
}

XrResult XRAPI_CALL syncActions(XrSession h, const XrActionsSyncInfo*)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   if (s->state != XR_SESSION_STATE_FOCUSED)
      return XR_SESSION_NOT_FOCUSED;
   for (Action* a : s->attachedActions)
   {
      const float v = inputOf(s, a);
      const bool b = v > 0.5f;
      a->changedBool = b != a->lastBool;
      a->changedFloat = v != a->lastFloat;
      a->lastBool = b;
      a->lastFloat = v;
   }
   return XR_SUCCESS;
}

XrResult XRAPI_CALL getActionStateBoolean(XrSession h, const XrActionStateGetInfo* gi, XrActionStateBoolean* st)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   auto* a = reinterpret_cast<Action*>(gi->action);
   st->isActive = s->state == XR_SESSION_STATE_FOCUSED && !boundPath(s, a).empty() ? XR_TRUE : XR_FALSE;
   st->currentState = st->isActive && a->lastBool ? XR_TRUE : XR_FALSE;
   st->changedSinceLastSync = st->isActive && a->changedBool ? XR_TRUE : XR_FALSE;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL getActionStateFloat(XrSession h, const XrActionStateGetInfo* gi, XrActionStateFloat* st)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   auto* a = reinterpret_cast<Action*>(gi->action);
   st->isActive = s->state == XR_SESSION_STATE_FOCUSED && !boundPath(s, a).empty() ? XR_TRUE : XR_FALSE;
   st->currentState = st->isActive ? a->lastFloat : 0.f;
   st->changedSinceLastSync = st->isActive && a->changedFloat ? XR_TRUE : XR_FALSE;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL getCurrentInteractionProfile(XrSession h, XrPath, XrInteractionProfileState* st)
{
   std::lock_guard<std::mutex> g(lock);
   auto* s = reinterpret_cast<Session*>(h);
   st->interactionProfile = s->attached ? pathOf(s->instance, "/interaction_profiles/oculus/touch_controller") : XR_NULL_PATH;
   return XR_SUCCESS;
}

XrResult XRAPI_CALL getBoundsRect(XrSession, XrReferenceSpaceType type, XrExtent2Df* bounds)
{
   std::lock_guard<std::mutex> g(lock);
   if (type == XR_REFERENCE_SPACE_TYPE_STAGE && world.roomscale)
   {
      *bounds = { world.roomW, world.roomD };
      return XR_SUCCESS;
   }
   *bounds = { 0.f, 0.f };
   return XR_SPACE_BOUNDS_UNAVAILABLE;
}

XrResult XRAPI_CALL getInstanceProcAddr(XrInstance, const char* name, PFN_xrVoidFunction* fn);

const std::map<std::string, PFN_xrVoidFunction>& table()
{
   static const std::map<std::string, PFN_xrVoidFunction> t = {
#define F(n, f) { n, reinterpret_cast<PFN_xrVoidFunction>(f) }
      F("xrGetInstanceProcAddr", getInstanceProcAddr),
      F("xrEnumerateInstanceExtensionProperties", enumerateExtensions),
      F("xrEnumerateApiLayerProperties", enumerateLayers),
      F("xrCreateInstance", createInstance),
      F("xrDestroyInstance", destroyInstance),
      F("xrGetInstanceProperties", getInstanceProperties),
      F("xrGetSystem", getSystem),
      F("xrGetD3D11GraphicsRequirementsKHR", getD3D11Requirements),
      F("xrResultToString", resultToString),
      F("xrCreateSession", createSession),
      F("xrDestroySession", destroySession),
      F("xrBeginSession", beginSession),
      F("xrEndSession", endSession),
      F("xrRequestExitSession", requestExitSession),
      F("xrPollEvent", pollEvent),
      F("xrWaitFrame", waitFrame),
      F("xrBeginFrame", beginFrame),
      F("xrEndFrame", endFrame),
      F("xrEnumerateReferenceSpaces", enumerateReferenceSpaces),
      F("xrCreateReferenceSpace", createReferenceSpace),
      F("xrCreateActionSpace", createActionSpace),
      F("xrDestroySpace", destroySpace),
      F("xrLocateSpace", locateSpace),
      F("xrLocateViews", locateViews),
      F("xrEnumerateViewConfigurationViews", enumerateViewConfigurationViews),
      F("xrEnumerateSwapchainFormats", enumerateSwapchainFormats),
      F("xrCreateSwapchain", createSwapchain),
      F("xrDestroySwapchain", destroySwapchain),
      F("xrEnumerateSwapchainImages", enumerateSwapchainImages),
      F("xrAcquireSwapchainImage", acquireSwapchainImage),
      F("xrWaitSwapchainImage", waitSwapchainImage),
      F("xrReleaseSwapchainImage", releaseSwapchainImage),
      F("xrStringToPath", stringToPath),
      F("xrPathToString", pathToString),
      F("xrCreateActionSet", createActionSet),
      F("xrCreateAction", createAction),
      F("xrSuggestInteractionProfileBindings", suggestBindings),
      F("xrAttachSessionActionSets", attachActionSets),
      F("xrSyncActions", syncActions),
      F("xrGetActionStateBoolean", getActionStateBoolean),
      F("xrGetActionStateFloat", getActionStateFloat),
      F("xrGetCurrentInteractionProfile", getCurrentInteractionProfile),
      F("xrGetReferenceSpaceBoundsRect", getBoundsRect),
#undef F
   };
   return t;
}

XrResult XRAPI_CALL getInstanceProcAddr(XrInstance, const char* name, PFN_xrVoidFunction* fn)
{
   const auto& t = table();
   if (auto it = t.find(name); it != t.end())
   {
      *fn = it->second;
      return XR_SUCCESS;
   }
   *fn = nullptr;
   return XR_ERROR_FUNCTION_UNSUPPORTED;
}

} // namespace

extern "C" __declspec(dllexport) XrResult XRAPI_CALL xrGetInstanceProcAddr(XrInstance instance, const char* name, PFN_xrVoidFunction* fn)
{
   return getInstanceProcAddr(instance, name, fn);
}

extern "C" __declspec(dllexport) XrResult XRAPI_CALL xrNegotiateLoaderRuntimeInterface(const XrNegotiateLoaderInfo* info, XrNegotiateRuntimeRequest* req)
{
   if (!info || !req || info->structType != XR_LOADER_INTERFACE_STRUCT_LOADER_INFO || req->structType != XR_LOADER_INTERFACE_STRUCT_RUNTIME_REQUEST)
      return XR_ERROR_INITIALIZATION_FAILED;
   req->runtimeInterfaceVersion = 1;
   req->runtimeApiVersion = XR_API_VERSION_1_0;
   req->getInstanceProcAddr = getInstanceProcAddr;
   return XR_SUCCESS;
}
