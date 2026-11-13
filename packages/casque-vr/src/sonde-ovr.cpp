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
//   ovr manettes <xg> <yg> <zg> suivi=<bits> <xd> <yd> <zd> suivi=<bits>
//   ovr entrees <code> type=<manettes>               à chaque changement du résultat de ovr_GetInputState
//   ovr bouton <nom> 1|0                             chaque appui et relâchement, casque porté ou non

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

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
   if (!ok)
   {
      say("ovr absent fonctions manquantes dans " + dllPath);
      return 4;
   }
   say("ovr charge " + dllPath);

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
      ULONGLONG poseAt = 0, boundaryAt = 0;
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
               say("ovr " + outer);
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
            std::string m = "ovr manettes";
            for (int k = 0; k < 2; k++)
            {
               const Pose p = ts.hand(k);
               m += " " + fmt(p.position.x) + " " + fmt(p.position.y) + " " + fmt(p.position.z) + " suivi=" + std::to_string(ts.handFlags(k));
            }
            say(m);
         }
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
         Sleep(20);
      }
      api.destroy(session);
   }
   api.shutdown();
   say("ovr fin");
   return 0;
}
