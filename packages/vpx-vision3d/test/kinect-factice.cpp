// license:GPLv3+
//
// Fausse Kinect10.dll pour les essais de la Vision 3D sans capteur (CYBERPINBALL_KINECT_DLL) :
// mêmes fonctions et même structure NUI_SKELETON_FRAME que le pilote de Microsoft (NuiApi.h,
// NuiSensor.h du SDK 1.8). Un squelette suivi, tête à 1,2 m dans l'axe ; après 40 images, la tête
// passe 10 cm vers la droite du joueur (x positif dans le repère du capteur).
//
// Comme la vraie Kinect (essais de la mise en route) :
//   KINECT_FACTICE_INIT_MS   NuiInitialize prend ce temps (la vraie : une demi-seconde à une seconde)
//   KINECT_FACTICE_REPERAGE  images sans squelette avant que la tête soit repérée (mode assis : il
//                            faut que le joueur bouge)
// FacticeInitialisations() : nombre d'appels à NuiInitialize (capteur gardé allumé entre parties).

#include <windows.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>

#define NUI_EXPORT extern "C" __declspec(dllexport)

namespace {

struct Vector4 { float x, y, z, w; };

struct SkeletonData
{
   int32_t trackingState;
   uint32_t trackingId, enrollmentIndex, userIndex;
   Vector4 position;
   Vector4 joints[20];
   int32_t jointStates[20];
   uint32_t qualityFlags;
};

struct SkeletonFrame
{
   int64_t timeStamp;
   uint32_t frameNumber, flags;
   Vector4 floorClipPlane, normalToGravity;
   SkeletonData skeletons[6];
};

static_assert(sizeof(SkeletonData) == 436, "NUI_SKELETON_DATA : 436 octets");
static_assert(sizeof(SkeletonFrame) == 2664, "NUI_SKELETON_FRAME : 2664 octets");

bool initialise = false;
uint32_t images = 0;
int32_t elevation = 0;
int32_t initialisations = 0;

uint32_t envNombre(const char* nom)
{
   const char* v = std::getenv(nom);
   return v ? static_cast<uint32_t>(std::strtoul(v, nullptr, 10)) : 0;
}

}

NUI_EXPORT int32_t __stdcall NuiInitialize(uint32_t flags)
{
   if (const uint32_t ms = envNombre("KINECT_FACTICE_INIT_MS"))
      Sleep(ms);
   ++initialisations;
   initialise = (flags & 8) != 0;
   images = 0;
   return initialise ? 0 : -1;
}
NUI_EXPORT int32_t __stdcall FacticeInitialisations() { return initialisations; }
NUI_EXPORT void __stdcall NuiShutdown() { initialise = false; }
NUI_EXPORT int32_t __stdcall NuiSkeletonTrackingEnable(void*, uint32_t) { return initialise ? 0 : -1; }
NUI_EXPORT int32_t __stdcall NuiCameraElevationGetAngle(int32_t* degres) { *degres = elevation; return 0; }
NUI_EXPORT int32_t __stdcall NuiCameraElevationSetAngle(int32_t degres) { elevation = degres; return 0; }

NUI_EXPORT int32_t __stdcall NuiSkeletonGetNextFrame(uint32_t, SkeletonFrame* frame)
{
   if (!initialise) return -1;
   std::memset(frame, 0, sizeof(*frame));
   frame->frameNumber = ++images;
   frame->floorClipPlane = { 0.f, 1.f, 0.f, 1.1f };
   const uint32_t reperage = envNombre("KINECT_FACTICE_REPERAGE");
   if (images <= reperage)
      return 0; // personne de repéré encore
   const uint32_t vues = images - reperage;
   SkeletonData& s = frame->skeletons[2]; // pas forcément le premier
   s.trackingState = 2; // NUI_SKELETON_TRACKED
   s.joints[3] = { vues > 40 ? 0.10f : 0.f, 0.f, 1.2f, 1.f }; // NUI_SKELETON_POSITION_HEAD
   s.jointStates[3] = 2;
   return 0;
}
