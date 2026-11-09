// license:GPLv3+
//
// Fausse Kinect10.dll pour les essais de la Vision 3D sans capteur (CYBERPINBALL_KINECT_DLL) :
// mêmes fonctions et même structure NUI_SKELETON_FRAME que le pilote de Microsoft (NuiApi.h,
// NuiSensor.h du SDK 1.8). Un squelette suivi, tête à 1,2 m dans l'axe ; après 40 images, la tête
// passe 10 cm vers la droite du joueur (x positif dans le repère du capteur).

#include <cstdint>
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

}

NUI_EXPORT int32_t __stdcall NuiInitialize(uint32_t flags) { initialise = (flags & 8) != 0; images = 0; return initialise ? 0 : -1; }
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
   SkeletonData& s = frame->skeletons[2]; // pas forcément le premier
   s.trackingState = 2; // NUI_SKELETON_TRACKED
   s.joints[3] = { images > 40 ? 0.10f : 0.f, 0.f, 1.2f, 1.f }; // NUI_SKELETON_POSITION_HEAD
   s.jointStates[3] = 2;
   return 0;
}
