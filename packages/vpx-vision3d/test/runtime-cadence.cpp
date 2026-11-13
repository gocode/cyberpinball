// Runtime OpenXR factice à cadence exacte : le runtime factice du compagnon (packages/casque-vr/test/
// runtime-factice.cpp), inchangé, dont l'attente d'une image (Sleep(11) dans xrWaitFrame) est remplacée par
// une attente calée sur une grille de 72 images par seconde, mesurée à l'horloge de précision.
//
// Pourquoi : Sleep dépend de la minuterie de Windows (1 ms demandée par VPX, 15,6 ms quand Windows l'ignore),
// et Sleep(11) plafonne le banc sous les 72 images par seconde d'un casque. Avec la grille, le banc mesure la
// cadence que VPX tient vraiment (scripts/banc-vpx.mjs --cadence exacte), avec et sans le plugin, ses
// captures, sa garde de la minuterie.
//
// L'attente cède le processeur (Sleep(0)) sans jamais dormir : un cœur occupé le temps du banc, rien d'autre.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

namespace {

/** Attend la prochaine case de la grille à 72 Hz ; `ms` (l'attente d'origine) n'est pas utilisé. */
void attendreCase(DWORD)
{
   static LARGE_INTEGER freq {};
   static LONGLONG origine = 0;
   if (!freq.QuadPart)
   {
      QueryPerformanceFrequency(&freq);
      LARGE_INTEGER t {};
      QueryPerformanceCounter(&t);
      origine = t.QuadPart;
   }
   const double periode = static_cast<double>(freq.QuadPart) / 72.0;
   LARGE_INTEGER t {};
   QueryPerformanceCounter(&t);
   const LONGLONG prochaine = origine + static_cast<LONGLONG>((static_cast<LONGLONG>(static_cast<double>(t.QuadPart - origine) / periode) + 1) * periode);
   while (t.QuadPart < prochaine)
   {
      SwitchToThread();
      QueryPerformanceCounter(&t);
   }
}

} // namespace

// La seule attente du runtime factice : celle de xrWaitFrame.
#define Sleep(ms) attendreCase(ms)
#include "../../casque-vr/test/runtime-factice.cpp"
