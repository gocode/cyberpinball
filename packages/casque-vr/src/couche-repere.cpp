// Couche d'API OpenXR « XR_APILAYER_CYBERPINBALL_repere » : en partie, la table de VPX reste à sa place quand le Quest
// remet l'origine de la pièce sur la tête (casque remis : essai réel du 13 novembre 2026, 23:50-23:52, trois remises en
// partie, la table fausse dans le casque jusqu'à la partie suivante ; VPX 10.8.1 ne relit pas sa place en jeu).
//
// Chargée pour les seules parties de Cyber Pinball dans le casque, dans le seul processus de VPX : Cyber Pinball pose
// XR_API_LAYER_PATH (dossier de ce manifeste) et XR_ENABLE_API_LAYERS au lancement ; rien n'est installé pour le poste.
// CYBERPINBALL_REPERE : le fichier de la correction, réécrit par Cyber Pinball à chaque saut mesuré par sa sonde :
//   journal <chemin>                  (facultatif : ce que fait la couche, relu par Cyber Pinball après la partie)
//   saut <angle> <tx> <tz> <sol>      la composée des sauts depuis le lancement de VPX (p' = R(angle) p + t, x' = c x - s z)
//
// Comment. VPX place sa table dans l'espace de la pièce (STAGE) d'après son INI, lu au lancement. Après une remise
// d'origine, un point de la pièce de coordonnées p avant le saut a p' = J p après. La couche rend à VPX, à la place de
// son espace STAGE, un espace dont les coordonnées sont celles d'avant les sauts : STAGE avec la pose P = J (rotation
// de -angle autour de la verticale, position tx, sol, tz). Elle le substitue partout où VPX passe son espace : vues
// (xrLocateViews), manettes et têtes (xrLocateSpace), couches de l'image (xrEndFrame). La correction est prise au
// début de chaque image (xrWaitFrame) et tenue toute l'image : les vues et la couche soumise sont du même espace.
//
// Prudence : au moindre doute (fichier illisible, espace refusé par le runtime), la couche ne substitue rien et laisse
// tout passer : VPX joue comme sans elle. Elle ne fait jamais échouer un appel de VPX.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#define XR_NO_PROTOTYPES
#include <openxr/openxr.h>

#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// Interface entre le chargeur OpenXR et une couche (spécification OpenXR, « API Layer Interaction »).

extern "C" {
typedef enum XrLoaderInterfaceStructs
{
   XR_LOADER_INTERFACE_STRUCT_UNINTIALIZED = 0,
   XR_LOADER_INTERFACE_STRUCT_LOADER_INFO,
   XR_LOADER_INTERFACE_STRUCT_API_LAYER_REQUEST,
   XR_LOADER_INTERFACE_STRUCT_RUNTIME_REQUEST,
   XR_LOADER_INTERFACE_STRUCT_API_LAYER_CREATE_INFO,
   XR_LOADER_INTERFACE_STRUCT_API_LAYER_NEXT_INFO,
   XR_LOADER_INTERFACE_STRUCTS_MAX_ENUM = 0x7FFFFFFF
} XrLoaderInterfaceStructs;

#define XR_LOADER_INFO_STRUCT_VERSION 1
#define XR_API_LAYER_INFO_STRUCT_VERSION 1
#define XR_API_LAYER_MAX_SETTINGS_PATH_SIZE 512
#define XR_CURRENT_LOADER_API_LAYER_VERSION 1

typedef struct XrNegotiateLoaderInfo
{
   XrLoaderInterfaceStructs structType;
   uint32_t structVersion;
   size_t structSize;
   uint32_t minInterfaceVersion;
   uint32_t maxInterfaceVersion;
   XrVersion minApiVersion;
   XrVersion maxApiVersion;
} XrNegotiateLoaderInfo;

struct XrApiLayerCreateInfo;
typedef XrResult(XRAPI_PTR* PFN_xrCreateApiLayerInstance)(const XrInstanceCreateInfo* info, const struct XrApiLayerCreateInfo* apiLayerInfo, XrInstance* instance);

typedef struct XrNegotiateApiLayerRequest
{
   XrLoaderInterfaceStructs structType;
   uint32_t structVersion;
   size_t structSize;
   uint32_t layerInterfaceVersion;
   XrVersion layerApiVersion;
   PFN_xrGetInstanceProcAddr getInstanceProcAddr;
   PFN_xrCreateApiLayerInstance createApiLayerInstance;
} XrNegotiateApiLayerRequest;

typedef struct XrApiLayerNextInfo
{
   XrLoaderInterfaceStructs structType;
   uint32_t structVersion;
   size_t structSize;
   char layerName[XR_MAX_API_LAYER_NAME_SIZE];
   PFN_xrGetInstanceProcAddr nextGetInstanceProcAddr;
   PFN_xrCreateApiLayerInstance nextCreateApiLayerInstance;
   struct XrApiLayerNextInfo* next;
} XrApiLayerNextInfo;

typedef struct XrApiLayerCreateInfo
{
   XrLoaderInterfaceStructs structType;
   uint32_t structVersion;
   size_t structSize;
   void* loaderInstance;
   char settings_file_location[XR_API_LAYER_MAX_SETTINGS_PATH_SIZE];
   XrApiLayerNextInfo* nextInfo;
} XrApiLayerCreateInfo;
}

namespace {

const char* const LAYER_NAME = "XR_APILAYER_CYBERPINBALL_repere";

// --- Journal (facultatif) : une ligne horodatée par événement, jamais une ligne par image.
std::mutex logMutex;
std::string logPath;
void journal(const std::string& line)
{
   std::lock_guard<std::mutex> lock(logMutex);
   if (logPath.empty())
      return;
   std::ofstream out(logPath, std::ios::app);
   SYSTEMTIME t;
   GetLocalTime(&t);
   char stamp[32];
   sprintf_s(stamp, "%02d:%02d:%02d.%03d ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds);
   out << stamp << line << "\n";
}

std::string fmt(double v, int digits = 4)
{
   char b[48];
   std::snprintf(b, sizeof b, "%.*f", digits, v);
   return b;
}

// --- La correction : la composée des sauts depuis le lancement de VPX.
struct Correction
{
   double angle = 0, tx = 0, tz = 0, dy = 0;
   bool identity() const { return std::fabs(angle) < 1e-6 && std::fabs(tx) < 1e-5 && std::fabs(tz) < 1e-5 && std::fabs(dy) < 1e-5; }
   bool operator!=(const Correction& o) const { return angle != o.angle || tx != o.tx || tz != o.tz || dy != o.dy; }
   /** La pose de l'ancien repère dans le nouveau : rotation de -angle autour de la verticale, puis (tx, sol, tz). */
   XrPosef pose() const
   {
      const double h = -0.5 * angle;
      XrPosef p {};
      p.orientation = { 0.f, static_cast<float>(std::sin(h)), 0.f, static_cast<float>(std::cos(h)) };
      p.position = { static_cast<float>(tx), static_cast<float>(dy), static_cast<float>(tz) };
      return p;
   }
};

std::wstring settingsFile;

/** Le fichier de la correction : vrai s'il a été lu (même sans saut : correction nulle). */
bool readCorrection(Correction& c)
{
   std::ifstream file(settingsFile);
   if (!file)
      return false;
   Correction read;
   std::string line;
   while (std::getline(file, line))
   {
      std::istringstream in(line);
      std::string word;
      in >> word;
      if (word == "saut")
      {
         Correction j;
         if (in >> j.angle >> j.tx >> j.tz >> j.dy && std::isfinite(j.angle) && std::isfinite(j.tx) && std::isfinite(j.tz) && std::isfinite(j.dy))
            read = j;
         else
            return false;
      }
      else if (word == "journal")
      {
         std::string p;
         std::getline(in >> std::ws, p);
         std::lock_guard<std::mutex> lock(logMutex);
         logPath = p;
      }
   }
   c = read;
   return true;
}

XrQuaternionf mul(const XrQuaternionf& a, const XrQuaternionf& b)
{
   return { a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z };
}
XrVector3f rotate(const XrQuaternionf& q, const XrVector3f& v)
{
   const XrQuaternionf p { v.x, v.y, v.z, 0.f };
   const XrQuaternionf c { -q.x, -q.y, -q.z, q.w };
   const XrQuaternionf r = mul(mul(q, p), c);
   return { r.x, r.y, r.z };
}
/** `b` exprimée dans `a`, ramenée au repère de `a` (a puis b). */
XrPosef compose(const XrPosef& a, const XrPosef& b)
{
   const XrVector3f t = rotate(a.orientation, b.position);
   return { mul(a.orientation, b.orientation), { a.position.x + t.x, a.position.y + t.y, a.position.z + t.z } };
}

// --- Fonctions suivantes de la chaîne.
PFN_xrGetInstanceProcAddr nextGetInstanceProcAddr = nullptr;
PFN_xrCreateReferenceSpace nextCreateReferenceSpace = nullptr;
PFN_xrDestroySpace nextDestroySpace = nullptr;
PFN_xrDestroySession nextDestroySession = nullptr;
PFN_xrWaitFrame nextWaitFrame = nullptr;
PFN_xrLocateViews nextLocateViews = nullptr;
PFN_xrLocateSpace nextLocateSpace = nullptr;
PFN_xrEndFrame nextEndFrame = nullptr;
// Situer plusieurs espaces d'un coup (OpenXR 1.1, ou XR_KHR_locate_spaces) : seulement si le runtime les a.
PFN_xrLocateSpaces nextLocateSpaces = nullptr;
PFN_xrLocateSpacesKHR nextLocateSpacesKHR = nullptr;

// --- Les espaces de la pièce créés par VPX, et leur remplaçant corrigé.
struct Room
{
   XrSession session = XR_NULL_HANDLE;
   XrReferenceSpaceType type = XR_REFERENCE_SPACE_TYPE_STAGE;
   XrPosef pose {};
   XrSpace corrected = XR_NULL_HANDLE; // nul : correction nulle, l'espace de VPX tel quel
};

std::mutex stateMutex;
bool enabled = false;
std::map<XrSpace, Room> rooms;
std::vector<XrSpace> retired; // remplaçants d'une correction passée, détruits à l'image suivante
Correction applied;           // la correction tenue pour l'image en cours
DWORD polledAt = 0;
FILETIME seenWrite {};
unsigned corrections = 0;
bool saidFailure = false, saidOtherSpace = false, saidLayerType = false;

/** L'espace à donner au runtime à la place de celui de VPX (lui-même hors substitution). */
XrSpace substitute(XrSpace s)
{
   auto it = rooms.find(s);
   return it != rooms.end() && it->second.corrected != XR_NULL_HANDLE ? it->second.corrected : s;
}

/** Les remplaçants pour la correction `c` ; faux si le runtime en refuse un (rien n'est alors substitué). */
bool rebuild(const Correction& c)
{
   for (auto& [space, room] : rooms)
      if (room.corrected != XR_NULL_HANDLE)
      {
         retired.push_back(room.corrected);
         room.corrected = XR_NULL_HANDLE;
      }
   if (c.identity())
      return true;
   const XrPosef p = c.pose();
   for (auto& [space, room] : rooms)
   {
      XrReferenceSpaceCreateInfo ci { XR_TYPE_REFERENCE_SPACE_CREATE_INFO };
      ci.referenceSpaceType = room.type;
      ci.poseInReferenceSpace = compose(p, room.pose);
      XrSpace made = XR_NULL_HANDLE;
      if (XR_FAILED(nextCreateReferenceSpace(room.session, &ci, &made)))
      {
         for (auto& [s2, r2] : rooms)
            if (r2.corrected != XR_NULL_HANDLE)
            {
               retired.push_back(r2.corrected);
               r2.corrected = XR_NULL_HANDLE;
            }
         return false;
      }
      room.corrected = made;
   }
   return true;
}

/** Au début de chaque image : la correction relue si son fichier a changé (au plus tous les 50 ms), puis tenue. */
void latch()
{
   for (XrSpace s : retired)
      nextDestroySpace(s);
   retired.clear();
   const DWORD now = GetTickCount();
   if (now - polledAt < 50)
      return;
   polledAt = now;
   WIN32_FILE_ATTRIBUTE_DATA a {};
   if (!GetFileAttributesExW(settingsFile.c_str(), GetFileExInfoStandard, &a))
      return;
   if (CompareFileTime(&a.ftLastWriteTime, &seenWrite) == 0)
      return;
   Correction c;
   if (!readCorrection(c))
      return; // fichier en cours d'écriture : relu à l'image suivante
   seenWrite = a.ftLastWriteTime;
   if (!(c != applied))
      return;
   if (rooms.empty())
   {
      applied = c;
      return;
   }
   if (!rebuild(c))
   {
      if (!saidFailure)
         journal("espace corrigé refusé par le runtime : correction abandonnée, VPX garde son espace");
      saidFailure = true;
      applied = Correction {};
      return;
   }
   applied = c;
   corrections++;
   journal("correction appliquée (" + std::to_string(corrections) + ") : angle=" + fmt(c.angle, 5) + " deplacement=" + fmt(c.tx) + "," + fmt(c.tz) + " sol=" + fmt(c.dy)
      + " sur " + std::to_string(rooms.size()) + " espace(s) de VPX");
}

// ---------------------------------------------------------------------------
// Fonctions interceptées.

XRAPI_ATTR XrResult XRAPI_CALL layerCreateReferenceSpace(XrSession session, const XrReferenceSpaceCreateInfo* info, XrSpace* space)
{
   const XrResult r = nextCreateReferenceSpace(session, info, space);
   if (XR_FAILED(r) || !info)
      return r;
   std::lock_guard<std::mutex> lock(stateMutex);
   // Les espaces fixés à la pièce bougent avec son origine ; VIEW suit la tête, rien à corriger.
   if (info->referenceSpaceType == XR_REFERENCE_SPACE_TYPE_STAGE || info->referenceSpaceType == XR_REFERENCE_SPACE_TYPE_LOCAL)
   {
      Room& room = rooms[*space];
      room.session = session;
      room.type = info->referenceSpaceType;
      room.pose = info->poseInReferenceSpace;
      journal(std::string("espace de VPX suivi : ") + (room.type == XR_REFERENCE_SPACE_TYPE_STAGE ? "STAGE" : "LOCAL"));
      if (!applied.identity() && !rebuild(applied))
      {
         journal("espace corrigé refusé par le runtime : correction abandonnée, VPX garde son espace");
         applied = Correction {};
      }
   }
   else if (info->referenceSpaceType != XR_REFERENCE_SPACE_TYPE_VIEW && !saidOtherSpace)
   {
      saidOtherSpace = true;
      journal("espace de type " + std::to_string(static_cast<int>(info->referenceSpaceType)) + " créé par VPX : pas corrigé");
   }
   return r;
}

XRAPI_ATTR XrResult XRAPI_CALL layerDestroySpace(XrSpace space)
{
   {
      std::lock_guard<std::mutex> lock(stateMutex);
      auto it = rooms.find(space);
      if (it != rooms.end())
      {
         if (it->second.corrected != XR_NULL_HANDLE)
            nextDestroySpace(it->second.corrected);
         rooms.erase(it);
      }
   }
   return nextDestroySpace(space);
}

XRAPI_ATTR XrResult XRAPI_CALL layerDestroySession(XrSession session)
{
   {
      std::lock_guard<std::mutex> lock(stateMutex);
      for (auto it = rooms.begin(); it != rooms.end();)
         if (it->second.session == session)
         {
            if (it->second.corrected != XR_NULL_HANDLE)
               nextDestroySpace(it->second.corrected);
            it = rooms.erase(it);
         }
         else
            ++it;
      for (XrSpace s : retired)
         nextDestroySpace(s);
      retired.clear();
   }
   return nextDestroySession(session);
}

XRAPI_ATTR XrResult XRAPI_CALL layerWaitFrame(XrSession session, const XrFrameWaitInfo* info, XrFrameState* state)
{
   const XrResult r = nextWaitFrame(session, info, state);
   std::lock_guard<std::mutex> lock(stateMutex);
   latch();
   return r;
}

XRAPI_ATTR XrResult XRAPI_CALL layerLocateViews(XrSession session, const XrViewLocateInfo* info, XrViewState* state, uint32_t capacity, uint32_t* count, XrView* views)
{
   if (!info)
      return nextLocateViews(session, info, state, capacity, count, views);
   XrViewLocateInfo mine = *info;
   {
      std::lock_guard<std::mutex> lock(stateMutex);
      mine.space = substitute(info->space);
   }
   return nextLocateViews(session, &mine, state, capacity, count, views);
}

XRAPI_ATTR XrResult XRAPI_CALL layerLocateSpace(XrSpace space, XrSpace baseSpace, XrTime time, XrSpaceLocation* location)
{
   XrSpace a, b;
   {
      std::lock_guard<std::mutex> lock(stateMutex);
      a = substitute(space);
      b = substitute(baseSpace);
   }
   return nextLocateSpace(a, b, time, location);
}

/** Les espaces à situer et la base, remplacés ; `next` fait le reste. */
template <typename Next>
XrResult locateSpaces(Next next, XrSession session, const XrSpacesLocateInfo* info, XrSpaceLocations* locations)
{
   if (!info || !info->spaces || !info->spaceCount)
      return next(session, info, locations);
   XrSpacesLocateInfo mine = *info;
   std::vector<XrSpace> spaces(info->spaces, info->spaces + info->spaceCount);
   {
      std::lock_guard<std::mutex> lock(stateMutex);
      mine.baseSpace = substitute(info->baseSpace);
      for (XrSpace& sp : spaces)
         sp = substitute(sp);
   }
   mine.spaces = spaces.data();
   return next(session, &mine, locations);
}

XRAPI_ATTR XrResult XRAPI_CALL layerLocateSpaces(XrSession session, const XrSpacesLocateInfo* info, XrSpaceLocations* locations)
{
   return locateSpaces(nextLocateSpaces, session, info, locations);
}

XRAPI_ATTR XrResult XRAPI_CALL layerLocateSpacesKHR(XrSession session, const XrSpacesLocateInfo* info, XrSpaceLocations* locations)
{
   return locateSpaces(nextLocateSpacesKHR, session, info, locations);
}

XRAPI_ATTR XrResult XRAPI_CALL layerEndFrame(XrSession session, const XrFrameEndInfo* info)
{
   if (!info || !info->layerCount)
      return nextEndFrame(session, info);
   // Les couches de VPX recopiées, leur espace remplacé (projection et quad : celles que VPX soumet).
   std::vector<XrCompositionLayerProjection> projections;
   std::vector<XrCompositionLayerQuad> quads;
   std::vector<const XrCompositionLayerBaseHeader*> layers(info->layers, info->layers + info->layerCount);
   projections.reserve(info->layerCount);
   quads.reserve(info->layerCount);
   bool changed = false;
   {
      std::lock_guard<std::mutex> lock(stateMutex);
      for (auto& l : layers)
      {
         if (!l)
            continue;
         const XrSpace mine = substitute(l->space);
         if (mine == l->space)
            continue;
         if (l->type == XR_TYPE_COMPOSITION_LAYER_PROJECTION)
         {
            projections.push_back(*reinterpret_cast<const XrCompositionLayerProjection*>(l));
            projections.back().space = mine;
            l = reinterpret_cast<const XrCompositionLayerBaseHeader*>(&projections.back());
            changed = true;
         }
         else if (l->type == XR_TYPE_COMPOSITION_LAYER_QUAD)
         {
            quads.push_back(*reinterpret_cast<const XrCompositionLayerQuad*>(l));
            quads.back().space = mine;
            l = reinterpret_cast<const XrCompositionLayerBaseHeader*>(&quads.back());
            changed = true;
         }
         else if (!saidLayerType)
         {
            saidLayerType = true;
            journal("couche d'image de type " + std::to_string(static_cast<int>(l->type)) + " : laissée dans l'espace de VPX");
         }
      }
   }
   if (!changed)
      return nextEndFrame(session, info);
   XrFrameEndInfo mine = *info;
   mine.layers = layers.data();
   return nextEndFrame(session, &mine);
}

XRAPI_ATTR XrResult XRAPI_CALL layerGetInstanceProcAddr(XrInstance instance, const char* name, PFN_xrVoidFunction* function)
{
   const std::string n = name ? name : "";
#define HOOK(fn, ours)                                                    \
   if (n == #fn)                                                          \
   {                                                                      \
      *function = reinterpret_cast<PFN_xrVoidFunction>(ours);              \
      return XR_SUCCESS;                                                  \
   }
   HOOK(xrGetInstanceProcAddr, layerGetInstanceProcAddr)
   if (enabled)
   {
      HOOK(xrCreateReferenceSpace, layerCreateReferenceSpace)
      HOOK(xrDestroySpace, layerDestroySpace)
      HOOK(xrDestroySession, layerDestroySession)
      HOOK(xrWaitFrame, layerWaitFrame)
      HOOK(xrLocateViews, layerLocateViews)
      HOOK(xrLocateSpace, layerLocateSpace)
      HOOK(xrEndFrame, layerEndFrame)
      // Situer plusieurs espaces d'un coup : substitué aussi, si le runtime l'a (sinon son refus est rendu tel quel).
      if (n == "xrLocateSpaces" || n == "xrLocateSpacesKHR")
      {
         PFN_xrVoidFunction got = nullptr;
         const XrResult r = nextGetInstanceProcAddr(instance, name, &got);
         if (XR_FAILED(r) || !got)
         {
            *function = got;
            return r;
         }
         if (n == "xrLocateSpaces")
            nextLocateSpaces = reinterpret_cast<PFN_xrLocateSpaces>(got);
         else
            nextLocateSpacesKHR = reinterpret_cast<PFN_xrLocateSpacesKHR>(got);
         *function = n == "xrLocateSpaces" ? reinterpret_cast<PFN_xrVoidFunction>(layerLocateSpaces) : reinterpret_cast<PFN_xrVoidFunction>(layerLocateSpacesKHR);
         journal("VPX situe aussi par " + n + " : substitué");
         return XR_SUCCESS;
      }
   }
#undef HOOK
   return nextGetInstanceProcAddr(instance, name, function);
}

XRAPI_ATTR XrResult XRAPI_CALL layerCreateApiLayerInstance(const XrInstanceCreateInfo* info, const XrApiLayerCreateInfo* layerInfo, XrInstance* instance)
{
   if (!layerInfo || !layerInfo->nextInfo)
      return XR_ERROR_INITIALIZATION_FAILED;
   XrApiLayerCreateInfo chained = *layerInfo;
   chained.nextInfo = layerInfo->nextInfo->next;
   nextGetInstanceProcAddr = layerInfo->nextInfo->nextGetInstanceProcAddr;
   const XrResult r = layerInfo->nextInfo->nextCreateApiLayerInstance(info, &chained, instance);
   if (XR_FAILED(r))
      return r;
   wchar_t buffer[2048];
   const DWORD n = GetEnvironmentVariableW(L"CYBERPINBALL_REPERE", buffer, 2048);
   settingsFile = n && n < 2048 ? std::wstring(buffer, n) : std::wstring();
   Correction start;
   enabled = !settingsFile.empty() && readCorrection(start);
#define LOAD(fn, var) nextGetInstanceProcAddr(*instance, #fn, reinterpret_cast<PFN_xrVoidFunction*>(&var));
   LOAD(xrCreateReferenceSpace, nextCreateReferenceSpace)
   LOAD(xrDestroySpace, nextDestroySpace)
   LOAD(xrDestroySession, nextDestroySession)
   LOAD(xrWaitFrame, nextWaitFrame)
   LOAD(xrLocateViews, nextLocateViews)
   LOAD(xrLocateSpace, nextLocateSpace)
   LOAD(xrEndFrame, nextEndFrame)
#undef LOAD
   if (enabled && (!nextCreateReferenceSpace || !nextDestroySpace || !nextDestroySession || !nextWaitFrame || !nextLocateViews || !nextLocateSpace || !nextEndFrame))
   {
      enabled = false;
      journal("fonctions OpenXR manquantes : la couche laisse tout passer");
   }
   else if (enabled)
   {
      // La correction déjà écrite au lancement (un saut pendant le chargement) vaut dès la première image.
      applied = start;
      journal("couche chargée par VPX" + std::string(start.identity() ? "" : " (correction de départ : angle=" + fmt(start.angle, 5) + ")"));
   }
   return r;
}

} // namespace

extern "C" __declspec(dllexport) XrResult XRAPI_CALL xrNegotiateLoaderApiLayerInterface(const XrNegotiateLoaderInfo* loaderInfo, const char* layerName,
   XrNegotiateApiLayerRequest* request)
{
   if (!loaderInfo || !request || loaderInfo->structType != XR_LOADER_INTERFACE_STRUCT_LOADER_INFO || loaderInfo->structVersion != XR_LOADER_INFO_STRUCT_VERSION
      || loaderInfo->structSize != sizeof(XrNegotiateLoaderInfo) || request->structType != XR_LOADER_INTERFACE_STRUCT_API_LAYER_REQUEST
      || request->structVersion != XR_API_LAYER_INFO_STRUCT_VERSION || request->structSize != sizeof(XrNegotiateApiLayerRequest)
      || loaderInfo->minInterfaceVersion > XR_CURRENT_LOADER_API_LAYER_VERSION || loaderInfo->maxInterfaceVersion < XR_CURRENT_LOADER_API_LAYER_VERSION
      || (layerName && std::strcmp(layerName, LAYER_NAME) != 0))
      return XR_ERROR_INITIALIZATION_FAILED;
   request->layerInterfaceVersion = XR_CURRENT_LOADER_API_LAYER_VERSION;
   request->layerApiVersion = XR_MAKE_VERSION(1, 0, 0);
   request->getInstanceProcAddr = layerGetInstanceProcAddr;
   request->createApiLayerInstance = layerCreateApiLayerInstance;
   return XR_SUCCESS;
}
