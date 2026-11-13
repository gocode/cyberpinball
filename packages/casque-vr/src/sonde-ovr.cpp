// Sonde LibOVR de Cyber Pinball (13 novembre 2026) : un client invisible du runtime de Meta, dans un processus à
// part, qui ne dessine rien, ne prend ni le regard ni l'affichage, et ne change aucun comportement. Elle écrit sur
// sa sortie ce que Link donne à un tel client, pour décider d'après des relevés réels :
//   - la limite du Quest dans l'espace de suivi (contour extérieur et aire de jeu), repère physique possible ;
//   - la tête et les manettes, et l'état brut des boutons (clics des joysticks compris), au menu comme pendant
//     une partie de VPX, sans avoir le regard d'OpenXR.
//   cyberpinball-sonde-ovr.exe --ovr <LibOVRRT64_1.dll>
// La DLL est celle que Meta installe avec son runtime (le dossier du runtime OpenXR actif) : rien de Meta n'est
// livré avec Cyber Pinball. Les quelques fonctions et structures sont décrites ici à la main, au minimum, pour
// appeler la DLL (interopérabilité) ; les tampons sont plus grands que nécessaire, seuls les premiers champs sont
// lus. Au banc, la DLL est le runtime factice (packages/casque-vr/test/runtime-factice.cpp), qui les exporte aussi.
//
// Lignes écrites (une par fait, « ovr … ») :
//   ovr charge <dll> | ovr absent <raison>          la DLL et ses fonctions
//   ovr init <code> [<message>]                      ovr_Initialize (client invisible)
//   ovr session <code> [<message>]                   ovr_Create (casque branché ou non)
//   ovr etat visible=… casque=… porte=… regard=…     à chaque changement (ovr_GetSessionStatus)
//   ovr origine <code> sol|yeux                      espace de suivi demandé au niveau du sol
//   ovr contour exterieur|aire n=<points> dims=<l>x<p> pts=<x>,<z> …   à chaque changement, casque porté
//   ovr tete <x> <y> <z> <lacet> suivi=<bits>        toutes les 5 s, casque porté
//   ovr empreinte n=<points> centre=<x>,<z> cap=<lacet>   le contour extérieur, relu à chaque relevé de tête
//   ovr points n=<points> <x>,<z> …                  le contour extérieur complet, au millimètre, à chaque changement
//                                                    (pour l'ancrage de Cyber Pinball, pas pour le journal)
//   ovr manettes <xg> <yg> <zg> suivi=<bits> <xd> <yd> <zd> suivi=<bits>
//   ovr entrees <code> type=<manettes>               à chaque changement du résultat de ovr_GetInputState
//   ovr bouton <nom> 1|0                             chaque appui et relâchement, casque porté ou non
//   ovr saut dt=<ms> angle=<rad> deplacement=<tx>,<tz> sol=<dy> rotation=<deg> de=<x>,<y>,<z>,<lacet> a=<x>,<y>,<z>,<lacet>
//                                                    l'espace de suivi qui saute sous la tête (Link recentre) : deux
//                                                    relevés suivis consécutifs, à quelques millisecondes, la tête
//                                                    téléportée ; la transformation du saut (p' = R(angle) p + t)
//   ovr saut-refuse raison=<…> …                     un bond de la tête qui ne passe pas les garde-fous (une fois par s)
//   ovr test-limite code=<r> tete=<distance> calcule=<distance> ecart=<cm> points=<cm> n=<testés>
//                                                    ovr_TestBoundary (distance de la tête à la limite, par le runtime)
//                                                    face à la distance calculée sur le contour lu, et l'écart le
//                                                    plus grand des points lus testés par ovr_TestBoundaryPoint : un
//                                                    contour lu périmé, ou d'un autre espace, s'y voit

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <timeapi.h>
#pragma comment(lib, "winmm.lib")

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

namespace {

// --- Ce que la DLL attend (décrit à la main, au minimum) ----------------------------------------------------
struct Vec3
{
   float x, y, z;
};
struct Quat
{
   float x, y, z, w;
};
struct Pose
{
   Quat orientation;
   Vec3 position;
};
// Paramètres d'ovr_Initialize : drapeaux, version mineure demandée, rappel du journal, donnée, délai (64 bits).
struct InitParams
{
   uint32_t flags;
   uint32_t requestedMinorVersion;
   void* logCallback;
   uintptr_t userData;
   uint32_t connectionTimeoutMs;
   uint32_t pad;
};
constexpr uint32_t INIT_REQUEST_VERSION = 0x4;
constexpr uint32_t INIT_INVISIBLE = 0x10;
struct Luid
{
   char reserved[8];
};
// État de la session : une suite d'octets booléens (visible, casque présent, casque porté, …, regard d'entrée).
struct SessionStatus
{
   char isVisible, hmdPresent, hmdMounted, displayLost, shouldQuit, shouldRecenter, hasInputFocus, overlayPresent, depthRequested;
   char rest[55];
};
// État du suivi : pose de la tête (88 octets avec vitesses et instant), drapeaux, poses des deux mains, drapeaux.
struct TrackingState
{
   unsigned char bytes[512];
   Pose head() const { return *reinterpret_cast<const Pose*>(bytes); }
   unsigned headFlags() const { return *reinterpret_cast<const unsigned*>(bytes + 88); }
   Pose hand(int h) const { return *reinterpret_cast<const Pose*>(bytes + 96 + 88 * h); }
   unsigned handFlags(int h) const { return *reinterpret_cast<const unsigned*>(bytes + 272 + 4 * h); }
};
// Entrées des manettes : instant, boutons, touchers, gâchettes, poignées, joysticks, type (suivi de champs non lus).
struct InputState
{
   double time;
   unsigned buttons;
   unsigned touches;
   float indexTrigger[2];
   float handTrigger[2];
   float thumbstick[2][2];
   unsigned controllerType;
   unsigned char rest[256];
};
constexpr unsigned CONTROLLER_TOUCH = 0x3;
constexpr unsigned BOUNDARY_OUTER = 0x1;
constexpr unsigned BOUNDARY_PLAY_AREA = 0x100;
constexpr unsigned DEVICE_HMD = 0x1;
// Résultat d'ovr_TestBoundary et d'ovr_TestBoundaryPoint : déclenché, distance, point le plus proche, sa normale.
struct BoundaryTestResult
{
   char isTriggering;
   char pad[3];
   float closestDistance;
   Vec3 closestPoint;
   Vec3 closestPointNormal;
};
struct ErrorInfo
{
   int result;
   char text[512];
};

using Session = void*;
using FnInitialize = int (*)(const InitParams*);
using FnShutdown = void (*)();
using FnCreate = int (*)(Session*, Luid*);
using FnDestroy = void (*)(Session);
using FnGetSessionStatus = int (*)(Session, SessionStatus*);
using FnGetTrackingState = TrackingState (*)(Session, double, char);
using FnGetInputState = int (*)(Session, unsigned, InputState*);
using FnGetBoundaryGeometry = int (*)(Session, unsigned, Vec3*, int*);
using FnGetBoundaryDimensions = int (*)(Session, unsigned, Vec3*);
using FnSetTrackingOriginType = int (*)(Session, int);
using FnGetTimeInSeconds = double (*)();
using FnGetLastErrorInfo = void (*)(ErrorInfo*);
using FnTestBoundary = int (*)(Session, unsigned, unsigned, BoundaryTestResult*);
using FnTestBoundaryPoint = int (*)(Session, const Vec3*, unsigned, BoundaryTestResult*);

struct Api
{
   FnInitialize initialize = nullptr;
   FnShutdown shutdown = nullptr;
   FnCreate create = nullptr;
   FnDestroy destroy = nullptr;
   FnGetSessionStatus sessionStatus = nullptr;
   FnGetTrackingState trackingState = nullptr;
   FnGetInputState inputState = nullptr;
   FnGetBoundaryGeometry boundaryGeometry = nullptr;
   FnGetBoundaryDimensions boundaryDimensions = nullptr;
   FnSetTrackingOriginType setOrigin = nullptr;
   FnGetTimeInSeconds time = nullptr;
   FnGetLastErrorInfo lastError = nullptr;
   FnTestBoundary testBoundary = nullptr;
   FnTestBoundaryPoint testBoundaryPoint = nullptr;
} api;

std::atomic<bool> quit { false };

void say(const std::string& line)
{
   std::cout << line << '\n' << std::flush;
}

std::string lastError()
{
   if (!api.lastError)
      return "";
   ErrorInfo e {};
   api.lastError(&e);
   e.text[sizeof(e.text) - 1] = 0;
   std::string s = e.text;
   for (char& c : s)
      if (c == '\n' || c == '\r')
         c = ' ';
   return s;
}

std::string fmt(float v)
{
   char b[32];
   std::snprintf(b, sizeof(b), "%.3f", v);
   return b;
}

float yawOf(const Quat& q)
{
   // Le regard (-z) tourné par l'orientation, projeté au sol : son cap autour de la verticale.
   const float fx = -2.f * (q.x * q.z + q.w * q.y);
   const float fz = -(1.f - 2.f * (q.x * q.x + q.y * q.y));
   return std::atan2(-fx, -fz);
}

std::vector<Vec3> outerPoints(Session s);

/** Un vecteur tourné par une orientation. */
Vec3 rotate(const Quat& q, const Vec3& v)
{
   const Vec3 u { q.x, q.y, q.z };
   const Vec3 c1 { u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x };
   const Vec3 c2 { u.y * c1.z - u.z * c1.y, u.z * c1.x - u.x * c1.z, u.x * c1.y - u.y * c1.x };
   return { v.x + 2.f * (q.w * c1.x + c2.x), v.y + 2.f * (q.w * c1.y + c2.y), v.z + 2.f * (q.w * c1.z + c2.z) };
}

/** Le tangage (regard au-dessus de l'horizon) et le roulis (oreille droite au-dessus), radians. */
float pitchOf(const Quat& q)
{
   return std::asin(std::clamp(rotate(q, { 0.f, 0.f, -1.f }).y, -1.f, 1.f));
}
float rollOf(const Quat& q)
{
   return std::asin(std::clamp(rotate(q, { 1.f, 0.f, 0.f }).y, -1.f, 1.f));
}

/** Un angle ramené dans ]-pi, pi]. */
float wrap(float a)
{
   while (a > 3.14159265f)
      a -= 6.2831853f;
   while (a <= -3.14159265f)
      a += 6.2831853f;
   return a;
}

/** La distance d'un point du sol au contour fermé (segments), et le point le plus proche. */
float contourDistance(const std::vector<Vec3>& pts, float x, float z, float& cx, float& cz)
{
   float best = 1e9f;
   for (size_t i = 0; i < pts.size(); i++)
   {
      const Vec3& a = pts[i];
      const Vec3& b = pts[(i + 1) % pts.size()];
      const float dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz;
      const float t = len > 0.f ? std::clamp(((x - a.x) * dx + (z - a.z) * dz) / len, 0.f, 1.f) : 0.f;
      const float px = a.x + t * dx, pz = a.z + t * dz, d = std::hypot(x - px, z - pz);
      if (d < best)
         best = d, cx = px, cz = pz;
   }
   return best;
}

/**
 * Le test de la limite par le runtime, face au contour lu (piste du 13 novembre 2026 : le contour lu pouvait être
 * périmé, ou dans un autre espace, quand l'origine saute) : distance de la tête à la limite selon ovr_TestBoundary,
 * celle calculée sur le contour lu, et l'écart le plus grand de huit points lus testés par ovr_TestBoundaryPoint
 * (sur la limite du runtime, ils sont à zéro). Rien si le runtime n'a pas ces fonctions.
 */
std::string boundaryTest(Session s, const Pose& head)
{
   if (!api.testBoundary)
      return "ovr test-limite absent";
   BoundaryTestResult r {};
   const int code = api.testBoundary(s, DEVICE_HMD, BOUNDARY_OUTER, &r);
   std::string line = "ovr test-limite code=" + std::to_string(code);
   if (code < 0)
      return line + " " + lastError();
   const std::vector<Vec3> pts = outerPoints(s);
   float cx = 0, cz = 0;
   const float mine = pts.empty() ? -1.f : contourDistance(pts, head.position.x, head.position.z, cx, cz);
   line += " tete=" + fmt(r.closestDistance) + " proche=" + fmt(r.closestPoint.x) + "," + fmt(r.closestPoint.z) + " calcule=" + fmt(mine) + " proche-calcule=" + fmt(cx) + "," + fmt(cz)
      + " ecart=" + fmt(100.f * std::fabs(std::fabs(r.closestDistance) - mine));
   if (api.testBoundaryPoint && !pts.empty())
   {
      float worst = 0.f;
      int tested = 0;
      for (size_t i = 0; i < pts.size(); i += std::max<size_t>(1, pts.size() / 8))
      {
         BoundaryTestResult p {};
         if (api.testBoundaryPoint(s, &pts[i], BOUNDARY_OUTER, &p) < 0)
            continue;
         worst = std::max(worst, std::fabs(p.closestDistance));
         tested++;
      }
      line += " points=" + fmt(100.f * worst) + " n=" + std::to_string(tested);
   }
   return line;
}

/**
 * Le saut de l'espace de suivi vu dans le flux de la tête (piste du 13 novembre 2026) : une tête ne se téléporte pas.
 * Deux relevés suivis (15) consécutifs, à moins de JUMP_MAX_DT_S, et la tête bondit de plus de JUMP_MIN_M ou
 * tourne de plus de JUMP_MIN_YAW : si le tangage et le roulis restent continus (un recentrage ne touche que le
 * lacet, la position et le sol), le bond est la transformation du saut, dite telle quelle. Mesure seulement.
 */
struct HeadSample
{
   double t = 0;
   Pose pose {};
   unsigned flags = 0;
   bool valid = false;
};
constexpr double JUMP_MAX_DT_S = 0.025;
constexpr float JUMP_MIN_M = 0.05f;
constexpr float JUMP_MIN_YAW = 10.f * 3.14159265f / 180.f;
constexpr float JUMP_MAX_TILT = 2.f * 3.14159265f / 180.f;

std::string poseText(const Pose& p)
{
   return fmt(p.position.x) + "," + fmt(p.position.y) + "," + fmt(p.position.z) + "," + fmt(yawOf(p.orientation));
}

/** Un saut mesuré (« ovr saut … »), un bond refusé (« ovr saut-refuse … »), ou rien. */
std::string headJump(const HeadSample& a, const HeadSample& b)
{
   const float dyaw = wrap(yawOf(b.pose.orientation) - yawOf(a.pose.orientation));
   const float dpos = std::hypot(b.pose.position.x - a.pose.position.x, b.pose.position.z - a.pose.position.z);
   if (dpos <= JUMP_MIN_M && std::fabs(dyaw) <= JUMP_MIN_YAW)
      return "";
   const double dt = b.t - a.t;
   const float dpitch = std::fabs(pitchOf(b.pose.orientation) - pitchOf(a.pose.orientation));
   const float droll = std::fabs(rollOf(b.pose.orientation) - rollOf(a.pose.orientation));
   char ms[32];
   std::snprintf(ms, sizeof(ms), "%.1f", dt * 1000.0);
   const std::string seen = " dt=" + std::string(ms) + " bond=" + fmt(100.f * dpos) + "cm," + fmt(dyaw * 57.29578f) + "deg de=" + poseText(a.pose) + " a=" + poseText(b.pose);
   if (a.flags != 15 || b.flags != 15)
      return "ovr saut-refuse raison=suivi-incomplet suivi=" + std::to_string(a.flags) + "/" + std::to_string(b.flags) + seen;
   if (dt > JUMP_MAX_DT_S)
      return "ovr saut-refuse raison=intervalle-long" + seen;
   if (dpitch > JUMP_MAX_TILT || droll > JUMP_MAX_TILT)
      return "ovr saut-refuse raison=tangage-ou-roulis tangage=" + fmt(dpitch * 57.29578f) + " roulis=" + fmt(droll * 57.29578f) + seen;
   // La rotation qui mène le regard d'avant au regard d'après (au sol), puis la translation qui mène la tête.
   const Vec3 fa = rotate(a.pose.orientation, { 0.f, 0.f, -1.f }), fb = rotate(b.pose.orientation, { 0.f, 0.f, -1.f });
   const float angle = std::atan2(fa.x * fb.z - fa.z * fb.x, fa.x * fb.x + fa.z * fb.z);
   const float c = std::cos(angle), s = std::sin(angle);
   const float tx = b.pose.position.x - (c * a.pose.position.x - s * a.pose.position.z);
   const float tz = b.pose.position.z - (s * a.pose.position.x + c * a.pose.position.z);
   char line[256];
   std::snprintf(line, sizeof(line), "ovr saut angle=%.5f deplacement=%.4f,%.4f sol=%.4f rotation=%.1f", angle, tx, tz, b.pose.position.y - a.pose.position.y, angle * 57.29578f);
   return line + seen;
}

template <typename F>
bool load(HMODULE dll, const char* name, F& out)
{
   out = reinterpret_cast<F>(GetProcAddress(dll, name));
   return out != nullptr;
}

/** La limite (contour extérieur ou aire de jeu) : nombre de points, dimensions et points (au plus 64, réduits). */
std::string boundary(Session s, unsigned type)
{
   int count = 0;
   const int r = api.boundaryGeometry(s, type, nullptr, &count);
   std::string line = std::string(type == BOUNDARY_OUTER ? "contour exterieur" : "aire") + " code=" + std::to_string(r) + " n=" + std::to_string(count);
   if (r < 0 || count <= 0)
      return line;
   std::vector<Vec3> pts(static_cast<size_t>(count));
   api.boundaryGeometry(s, type, pts.data(), &count);
   Vec3 dims {};
   if (api.boundaryDimensions && api.boundaryDimensions(s, type, &dims) >= 0)
      line += " dims=" + fmt(dims.x) + "x" + fmt(dims.z) + " haut=" + fmt(dims.y);
   line += " pts=";
   const int step = std::max(1, count / 64);
   for (int i = 0; i < count; i += step)
      line += (i ? " " : "") + fmt(pts[static_cast<size_t>(i)].x) + "," + fmt(pts[static_cast<size_t>(i)].z);
   return line;
}

/** Le contour extérieur complet (vide si la limite n'en donne pas). */
std::vector<Vec3> outerPoints(Session s)
{
   int count = 0;
   if (api.boundaryGeometry(s, BOUNDARY_OUTER, nullptr, &count) < 0 || count <= 0)
      return {};
   std::vector<Vec3> pts(static_cast<size_t>(count));
   if (api.boundaryGeometry(s, BOUNDARY_OUTER, pts.data(), &count) < 0)
      return {};
   pts.resize(static_cast<size_t>(std::max(0, count)));
   return pts;
}

/** Le contour complet au millimètre, pour Cyber Pinball (« ovr points … »). */
std::string pointsLine(const std::vector<Vec3>& pts)
{
   std::string line = "ovr points n=" + std::to_string(pts.size());
   char b[48];
   for (const Vec3& p : pts)
   {
      std::snprintf(b, sizeof(b), " %.4f,%.4f", p.x, p.z);
      line += b;
   }
   return line;
}

/** L'empreinte du contour : son centre et le cap de son premier point vu du centre (relu, ou figé). */
std::string footprint(const std::vector<Vec3>& pts)
{
   if (pts.empty())
      return "ovr empreinte n=0";
   double cx = 0, cz = 0;
   for (const Vec3& p : pts)
      cx += p.x, cz += p.z;
   cx /= static_cast<double>(pts.size());
   cz /= static_cast<double>(pts.size());
   const double cap = std::atan2(pts[0].z - cz, pts[0].x - cx);
   return "ovr empreinte n=" + std::to_string(pts.size()) + " centre=" + fmt(static_cast<float>(cx)) + "," + fmt(static_cast<float>(cz)) + " cap=" + fmt(static_cast<float>(cap));
}

struct ButtonName
{
   unsigned bit;
   const char* name;
};
// Les bits des boutons des manettes Touch dans l'état des entrées.
constexpr ButtonName BUTTONS[] = { { 0x1, "a" }, { 0x2, "b" }, { 0x4, "clic-joystick-droit" }, { 0x100, "x" }, { 0x200, "y" }, { 0x400, "clic-joystick-gauche" },
   { 0x100000, "menu" } };

} // namespace

int main(int argc, char** argv)
{
   std::string dllPath;
   for (int i = 1; i + 1 < argc; i++)
      if (std::string(argv[i]) == "--ovr")
         dllPath = argv[i + 1];
   if (dllPath.empty())
   {
      say("ovr absent pas de dll indiquee (--ovr)");
      return 2;
   }
   // Cyber Pinball ferme l'entrée en partant : la sonde s'arrête avec lui.
   std::thread([] {
      std::string l;
      while (std::getline(std::cin, l))
         if (l == "fin")
            break;
      quit = true;
   }).detach();

   const std::wstring wide(dllPath.begin(), dllPath.end());
   HMODULE dll = LoadLibraryExW(wide.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
   if (!dll)
   {
      say("ovr absent dll non chargee (erreur " + std::to_string(GetLastError()) + ") " + dllPath);
      return 3;
   }
   const bool ok = load(dll, "ovr_Initialize", api.initialize) && load(dll, "ovr_Shutdown", api.shutdown) && load(dll, "ovr_Create", api.create)
      && load(dll, "ovr_Destroy", api.destroy) && load(dll, "ovr_GetSessionStatus", api.sessionStatus) && load(dll, "ovr_GetTrackingState", api.trackingState)
      && load(dll, "ovr_GetInputState", api.inputState) && load(dll, "ovr_GetBoundaryGeometry", api.boundaryGeometry) && load(dll, "ovr_GetTimeInSeconds", api.time);
   load(dll, "ovr_GetBoundaryDimensions", api.boundaryDimensions);
   load(dll, "ovr_SetTrackingOriginType", api.setOrigin);
   load(dll, "ovr_GetLastErrorInfo", api.lastError);
   load(dll, "ovr_TestBoundary", api.testBoundary);
   load(dll, "ovr_TestBoundaryPoint", api.testBoundaryPoint);
   if (!ok)
   {
      say("ovr absent fonctions manquantes dans " + dllPath);
      return 4;
   }
   say("ovr charge " + dllPath);
   // Le flux de la tête relu toutes les quelques millisecondes (headJump) : minuterie à 1 ms pour la sonde seule.
   timeBeginPeriod(1);

   // Client invisible ; la version 1.43 demandée d'abord, sinon sans version.
   InitParams params {};
   params.flags = INIT_INVISIBLE | INIT_REQUEST_VERSION;
   params.requestedMinorVersion = 43;
   int r = -1;
   while (!quit)
   {
      r = api.initialize(&params);
      if (r < 0)
      {
         params.flags = INIT_INVISIBLE;
         r = api.initialize(&params);
      }
      say("ovr init " + std::to_string(r) + (r < 0 ? " " + lastError() : std::string(params.flags & INIT_REQUEST_VERSION ? " version 1.43" : " sans version")));
      if (r >= 0)
         break;
      for (int i = 0; i < 150 && !quit; i++)
         Sleep(100);
   }

   // Casque absent : nouvel essai toutes les 10 s, dit au journal seulement quand le résultat change.
   int lastCreate = 1;
   while (!quit)
   {
      Session session = nullptr;
      Luid luid {};
      r = api.create(&session, &luid);
      if (r != lastCreate)
         say("ovr session " + std::to_string(r) + (r < 0 ? " " + lastError() : std::string()));
      lastCreate = r;
      if (r < 0)
      {
         for (int i = 0; i < 100 && !quit; i++)
            Sleep(100);
         continue;
      }
      if (api.setOrigin)
      {
         const int o = api.setOrigin(session, 1);
         say("ovr origine " + std::to_string(o) + " sol");
      }
      SessionStatus last {};
      bool first = true;
      int lastInput = 1;
      unsigned lastButtons = 0;
      bool triggers[2] {};
      std::string lastOuter, lastArea;
      ULONGLONG poseAt = 0, boundaryAt = 0, refusedAt = 0;
      HeadSample prevHead;
      LARGE_INTEGER freq;
      QueryPerformanceFrequency(&freq);
      while (!quit)
      {
         SessionStatus st {};
         api.sessionStatus(session, &st);
         if (first || st.isVisible != last.isVisible || st.hmdPresent != last.hmdPresent || st.hmdMounted != last.hmdMounted || st.hasInputFocus != last.hasInputFocus)
         {
            say(std::string("ovr etat visible=") + (st.isVisible ? "1" : "0") + " casque=" + (st.hmdPresent ? "1" : "0") + " porte=" + (st.hmdMounted ? "1" : "0")
               + " regard=" + (st.hasInputFocus ? "1" : "0"));
            if (st.hmdMounted && !last.hmdMounted)
            {
               poseAt = 0;
               lastOuter.clear();
               lastArea.clear();
               boundaryAt = 0;
            }
         }
         first = false;
         last = st;
         if (st.shouldQuit)
         {
            say("ovr session a quitter");
            break;
         }
         const ULONGLONG now = GetTickCount64();
         // La limite, toutes les 2 s, dite quand elle change (casque porté : le Quest la donne alors).
         if (st.hmdMounted && now - boundaryAt >= 2000)
         {
            boundaryAt = now;
            const std::string outer = boundary(session, BOUNDARY_OUTER), area = boundary(session, BOUNDARY_PLAY_AREA);
            if (outer != lastOuter)
            {
               say("ovr " + outer);
               say(pointsLine(outerPoints(session)));
            }
            if (area != lastArea)
               say("ovr " + area);
            lastOuter = outer;
            lastArea = area;
         }
         // Tête et manettes, toutes les 5 s, casque porté.
         if (st.hmdMounted && now - poseAt >= 5000)
         {
            poseAt = now;
            const TrackingState ts = api.trackingState(session, api.time(), 0);
            const Pose h = ts.head();
            say("ovr tete " + fmt(h.position.x) + " " + fmt(h.position.y) + " " + fmt(h.position.z) + " " + fmt(yawOf(h.orientation)) + " suivi=" + std::to_string(ts.headFlags()));
            say(footprint(outerPoints(session)));
            say(boundaryTest(session, h));
            std::string m = "ovr manettes";
            for (int k = 0; k < 2; k++)
            {
               const Pose p = ts.hand(k);
               m += " " + fmt(p.position.x) + " " + fmt(p.position.y) + " " + fmt(p.position.z) + " suivi=" + std::to_string(ts.handFlags(k));
            }
            say(m);
         }
         // La tête à chaque tour (environ 200 fois par seconde), casque présent : le saut de l'espace de suivi se voit
         // entre deux relevés consécutifs (headJump). Rien au journal hors des sauts.
         if (st.hmdPresent)
         {
            LARGE_INTEGER qpc;
            QueryPerformanceCounter(&qpc);
            const TrackingState ts = api.trackingState(session, api.time(), 0);
            HeadSample cur;
            cur.t = static_cast<double>(qpc.QuadPart) / static_cast<double>(freq.QuadPart);
            cur.pose = ts.head();
            cur.flags = ts.headFlags() & 15u;
            cur.valid = true;
            if (prevHead.valid)
            {
               const std::string jump = headJump(prevHead, cur);
               if (jump.rfind("ovr saut ", 0) == 0)
               {
                  say(jump);
                  say(boundaryTest(session, cur.pose));
               }
               else if (!jump.empty() && now - refusedAt >= 1000)
               {
                  refusedAt = now;
                  say(jump);
               }
            }
            prevHead = cur;
         }
         else
            prevHead.valid = false;

         // Boutons bruts, à chaque changement.
         InputState in {};
         const int ir = api.inputState(session, CONTROLLER_TOUCH, &in);
         if (ir != lastInput)
            say("ovr entrees " + std::to_string(ir) + " type=" + std::to_string(in.controllerType));
         lastInput = ir;
         if (ir >= 0)
         {
            for (const ButtonName& b : BUTTONS)
               if ((in.buttons ^ lastButtons) & b.bit)
                  say(std::string("ovr bouton ") + b.name + ((in.buttons & b.bit) ? " 1" : " 0"));
            lastButtons = in.buttons;
            for (int k = 0; k < 2; k++)
            {
               const bool down = in.indexTrigger[k] > (triggers[k] ? 0.4f : 0.6f);
               if (down != triggers[k])
                  say(std::string("ovr bouton gachette-") + (k ? "droite" : "gauche") + (down ? " 1" : " 0"));
               triggers[k] = down;
            }
         }
         Sleep(4);
      }
      api.destroy(session);
   }
   api.shutdown();
   say("ovr fin");
   return 0;
}
