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
//   ovr pouls casque=0|1 porte=0|1                   chaque seconde : la sonde vit (pour Cyber Pinball, pas pour le journal)
//   ovr session refaite raison=<…>                   session perdue (erreur d'état ou d'entrées, affichage perdu, casque
//                                                    absent pour elle depuis 10 s, fin demandée) : LibOVR refait de zéro
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
//                                                    seule la signature de la remise d'origine du Quest est un saut :
//                                                    arrivée à l'origine même, cap nul (9 fois sur 9 le 13 novembre 2026)
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
   // La vitesse de la tête (ovrPoseStatef : pose, vitesse angulaire, vitesse linéaire, dans l'espace de suivi).
   Vec3 headAngularVelocity() const { return *reinterpret_cast<const Vec3*>(bytes + 28); }
   Vec3 headLinearVelocity() const { return *reinterpret_cast<const Vec3*>(bytes + 40); }
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
/** « contour » reçu de Cyber Pinball (session neuve de son compagnon) : le contour redit, même inchangé. */
std::atomic<bool> wantContour { false };

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
   Vec3 angular {}, linear {};
   unsigned flags = 0;
   bool valid = false;
};
/**
 * Deux relevés au plus à cet intervalle (s) : la tête d'avant est d'abord avancée par sa vitesse (LibOVR la donne),
 * le bond est l'écart à cette tête prévue ; ainsi une tête qui tourne vite n'est pas un saut, et des relevés espacés
 * par une machine chargée (50 ms vus au banc) restent mesurables.
 */
constexpr double JUMP_MAX_DT_S = 0.06;
constexpr float JUMP_MIN_M = 0.05f;
constexpr float JUMP_MIN_YAW = 10.f * 3.14159265f / 180.f;
constexpr float JUMP_MAX_TILT = 3.f * 3.14159265f / 180.f;
// La remise d'origine du Quest : la tête arrive à l'origine même, cap nul (relevés réels du 13 novembre 2026, 9 sur 9 :
// « a=0.000,1.679,0.000,-0.000 »). Tout autre bond est refusé : les rafales du casque tenu en main, basculé vers ±90° de
// tangage, font tourner le cap tiré du quaternion de 10 à 160° en quelques millisecondes sans que la tête bouge.
constexpr float JUMP_ORIGIN_M = 0.02f;
constexpr float JUMP_ORIGIN_YAW = 2.f * 3.14159265f / 180.f;
// Au-delà de ce tangage, le cap du regard projeté au sol n'a plus de sens.
constexpr float JUMP_MAX_PITCH = 60.f * 3.14159265f / 180.f;

std::string poseText(const Pose& p)
{
   return fmt(p.position.x) + "," + fmt(p.position.y) + "," + fmt(p.position.z) + "," + fmt(yawOf(p.orientation));
}

/** La tête d'avant avancée de `dt` par sa vitesse : position, et lacet tourné de la vitesse autour de la verticale. */
Pose predict(const HeadSample& a, double dt)
{
   Pose p = a.pose;
   const float t = static_cast<float>(dt);
   p.position = { p.position.x + a.linear.x * t, p.position.y + a.linear.y * t, p.position.z + a.linear.z * t };
   const float h = 0.5f * a.angular.y * t;
   const Quat turn { 0.f, std::sin(h), 0.f, std::cos(h) };
   const Quat& q = a.pose.orientation;
   p.orientation = { turn.w * q.x + turn.y * q.z, turn.w * q.y + turn.y * q.w, turn.w * q.z - turn.y * q.x, turn.w * q.w - turn.y * q.y };
   return p;
}

/** Un saut mesuré : la ligne, sa transformation (p' = R(angle) p + t) et la tête d'avant prévue à l'instant d'après. */
struct Jump
{
   bool accepted = false;
   std::string line;
   float angle = 0, tx = 0, tz = 0;
   Pose before {};
};

/** Un saut mesuré (« ovr saut … »), un bond refusé (« ovr saut-refuse … »), ou rien. */
Jump headJump(const HeadSample& first, const HeadSample& b);
std::string headJumpLine(const HeadSample& first, const HeadSample& b, Jump& out)
{
   const double dt = b.t - first.t;
   // La tête d'avant, là où sa vitesse l'aurait menée au second relevé.
   HeadSample a = first;
   a.pose = predict(first, dt);
   const float dyaw = wrap(yawOf(b.pose.orientation) - yawOf(a.pose.orientation));
   const float dpos = std::hypot(b.pose.position.x - a.pose.position.x, b.pose.position.z - a.pose.position.z);
   if (dpos <= JUMP_MIN_M && std::fabs(dyaw) <= JUMP_MIN_YAW)
      return "";
   const float dpitch = std::fabs(pitchOf(b.pose.orientation) - pitchOf(a.pose.orientation));
   const float droll = std::fabs(rollOf(b.pose.orientation) - rollOf(a.pose.orientation));
   char ms[32];
   std::snprintf(ms, sizeof(ms), "%.1f", dt * 1000.0);
   const std::string seen = " dt=" + std::string(ms) + " bond=" + fmt(100.f * dpos) + "cm," + fmt(dyaw * 57.29578f) + "deg de=" + poseText(a.pose) + " a=" + poseText(b.pose);
   if (a.flags != 15 || b.flags != 15)
      return "ovr saut-refuse raison=suivi-incomplet suivi=" + std::to_string(a.flags) + "/" + std::to_string(b.flags) + seen;
   if (dt > JUMP_MAX_DT_S)
      return "ovr saut-refuse raison=intervalle-long" + seen;
   const float pa = pitchOf(a.pose.orientation), pb = pitchOf(b.pose.orientation);
   if (std::fabs(pa) > JUMP_MAX_PITCH || std::fabs(pb) > JUMP_MAX_PITCH)
      return "ovr saut-refuse raison=tete-inclinee tangage=" + fmt(pa * 57.29578f) + "/" + fmt(pb * 57.29578f) + seen;
   if (std::hypot(b.pose.position.x, b.pose.position.z) > JUMP_ORIGIN_M || std::fabs(yawOf(b.pose.orientation)) > JUMP_ORIGIN_YAW)
      return "ovr saut-refuse raison=arrivee-hors-origine" + seen;
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
   out.accepted = true;
   out.angle = angle, out.tx = tx, out.tz = tz, out.before = a.pose;
   return line + seen;
}

Jump headJump(const HeadSample& first, const HeadSample& b)
{
   Jump j;
   j.line = headJumpLine(first, b, j);
   return j;
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
   for (int i = 1; i < argc; i++)
      if (std::string(argv[i]) == "--ovr" && i + 1 < argc)
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
      {
         if (!l.empty() && l.back() == '\r')
            l.pop_back();
         if (l == "fin")
            break;
         if (l == "contour")
            wantContour = true;
      }
      quit = true;
      // Un appel à LibOVR qui ne rend plus la main (runtime bloqué) ne retient pas la sonde : 3 s après la fin
      // demandée, ou Cyber Pinball parti (entrée fermée), elle sort d'elle-même, jamais orpheline.
      Sleep(3000);
      ExitProcess(0);
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
   // Et réveillée à l'heure même quand la machine est chargée (VPX en partie, 108 ms vus au banc sous charge) : elle ne
   // fait presque rien à chaque tour, une priorité au-dessus de la normale ne retire rien aux autres.
   SetPriorityClass(GetCurrentProcess(), ABOVE_NORMAL_PRIORITY_CLASS);

   // Le pouls, chaque seconde, où qu'en soit la sonde : Cyber Pinball la sait vivante, et sait si elle a le casque.
   ULONGLONG pulseAt = 0;
   const auto pulse = [&pulseAt](bool present, bool mounted) {
      const ULONGLONG now = GetTickCount64();
      if (now - pulseAt < 1000)
         return;
      pulseAt = now;
      say(std::string("ovr pouls casque=") + (present ? "1" : "0") + " porte=" + (mounted ? "1" : "0"));
   };
   const auto pause = [&pulse](int ms) {
      for (int i = 0; i < ms / 100 && !quit; i++)
      {
         pulse(false, false);
         Sleep(100);
      }
   };

   // Essai réel du 13 novembre 2026 : Link coupé puis revenu, l'ancienne session LibOVR ne voyait plus le casque
   // (« casque=0 », une seule erreur d'entrées -3003), la sonde muette toute une séance. Désormais toute session perdue
   // est refaite de zéro (ovr_Shutdown, ovr_Initialize, ovr_Create), dit au journal quand la raison change.
   InitParams params {};
   bool live = false;
   int lastInit = 1, lastCreate = 1;
   std::string lastWhy;
   while (!quit)
   {
      int r = 0;
      if (!live)
      {
         // Client invisible ; la version 1.43 demandée d'abord, sinon sans version.
         params.flags = INIT_INVISIBLE | INIT_REQUEST_VERSION;
         params.requestedMinorVersion = 43;
         r = api.initialize(&params);
         if (r < 0)
         {
            params.flags = INIT_INVISIBLE;
            r = api.initialize(&params);
         }
         if (r != lastInit)
            say("ovr init " + std::to_string(r) + (r < 0 ? " " + lastError() : std::string(params.flags & INIT_REQUEST_VERSION ? " version 1.43" : " sans version")));
         lastInit = r;
         if (r < 0)
         {
            pause(3000);
            continue;
         }
         live = true;
      }
      Session session = nullptr;
      Luid luid {};
      r = api.create(&session, &luid);
      if (r != lastCreate)
         say("ovr session " + std::to_string(r) + (r < 0 ? " " + lastError() : std::string()));
      lastCreate = r;
      if (r < 0)
      {
         // Service de Meta perdu (erreurs -3000 à -3999) : LibOVR refait de zéro ; casque absent : nouvel essai.
         if (r <= -3000 && r > -4000)
         {
            api.shutdown();
            live = false;
         }
         pause(3000);
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
      ULONGLONG poseAt = 0, boundaryAt = 0, refusedAt = 0, absentSince = 0;
      std::string why;
      HeadSample prevHead;
      LARGE_INTEGER freq;
      QueryPerformanceFrequency(&freq);
      while (!quit)
      {
         SessionStatus st {};
         const int sr = api.sessionStatus(session, &st);
         if (sr < 0)
         {
            why = "etat code=" + std::to_string(sr);
            break;
         }
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
         pulse(st.hmdPresent, st.hmdMounted);
         if (st.shouldQuit)
         {
            why = "fin-demandee";
            break;
         }
         if (st.displayLost)
         {
            why = "affichage-perdu";
            break;
         }
         const ULONGLONG now = GetTickCount64();
         // Casque absent pour cette session depuis 10 s : elle a pu rester d'une connexion de Link passée.
         absentSince = st.hmdPresent ? 0 : absentSince ? absentSince : now;
         if (absentSince && now - absentSince >= 10000)
         {
            why = "casque-absent";
            break;
         }
         if (st.hmdPresent)
            lastWhy.clear();
         // Session neuve du compagnon de Cyber Pinball : le contour redit, même inchangé.
         if (wantContour.exchange(false))
         {
            lastOuter.clear();
            boundaryAt = 0;
         }
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
            cur.angular = ts.headAngularVelocity();
            cur.linear = ts.headLinearVelocity();
            cur.flags = ts.headFlags() & 15u;
            cur.valid = true;
            if (prevHead.valid)
            {
               const Jump jump = headJump(prevHead, cur);
               if (jump.accepted)
               {
                  say(jump.line);
                  say(boundaryTest(session, cur.pose));
               }
               else if (!jump.line.empty() && now - refusedAt >= 1000)
               {
                  refusedAt = now;
                  say(jump.line);
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
         // Service de Meta perdu (-3003 vu le 13 novembre 2026 à la coupure de Link) : la session ne reviendra pas.
         if (ir <= -3000 && ir > -4000)
         {
            why = "entrees code=" + std::to_string(ir);
            break;
         }
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
      if (quit)
         break;
      // Refaite de zéro ; dit quand la raison change (Link coupé longtemps : une seule ligne, pas une toutes les 10 s).
      if (why != lastWhy)
      {
         say("ovr session refaite raison=" + why);
         lastInit = lastCreate = 1;
      }
      lastWhy = why;
      api.shutdown();
      live = false;
      pause(1000);
   }
   if (live)
      api.shutdown();
   say("ovr fin");
   return 0;
}
