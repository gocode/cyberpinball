// license:GPLv3+
//
// Minuterie de Windows pendant une partie dans le casque : la garde et la sonde.
//
// VPX demande une minuterie d'une milliseconde (timeBeginPeriod, wintimer.cpp) : ses attentes par Sleep en
// dépendent, comme celles de l'émulation de la ROM et du runtime OpenXR chargé dans son processus.
// Windows 11 peut ne plus honorer cette demande pour un processus dont aucune fenêtre n'est visible
// (fenêtres masquées, réduites ou recouvertes) : ses attentes retombent à la résolution par défaut,
// 15,6 ms. Or, en réalité virtuelle, l'image de VPX part dans le casque : sur le bureau, il ne lui reste
// qu'une fenêtre d'aperçu, que Cyber Pinball réduit à un timbre sous son propre écran.
//
// Mesuré sur une borne le 13 novembre 2026 :
// - 23 parties dans le casque sur 23 tombaient de 69 à 28,1 images par seconde, huit secondes après leur
//   première image (l'instant d'une capture du plugin, qui visait une fenêtre cachée de VPX), quelle que
//   soit la table, le plus grand écart entre deux images à 48 ms ;
// - dans un processus de sonde, Sleep(1) dure 1,4 ms avec timeBeginPeriod(1), 15,4 ms dès que la demande
//   est ignorée (IGNORE_TIMER_RESOLUTION dans l'état), et de nouveau 1,4 ms avec la garde ci-dessous ; une
//   attente sur minuterie haute résolution (celle de SDL) reste à 0,6 ms dans tous les cas ;
// - 28 images par seconde, c'est 7 images pour 16 battements de 15,6 ms ; trois battements font 47 ms.
// Reste à mesurer dans VPX même, sur une borne : c'est l'essai de cadence du plugin (CadenceTest).
//
// - La garde : SetProcessInformation(ProcessPowerThrottling) avec IGNORE_TIMER_RESOLUTION retiré de
//   l'état, la façon documentée par Microsoft de dire que les demandes de minuterie de ce processus
//   comptent toujours, fenêtres visibles ou non. Sans effet avant Windows 11 (l'appel est refusé, et
//   rien n'y bride la minuterie).
// - La sonde : un fil à part mesure, quatre fois par seconde, ce que dure vraiment Sleep(1) (1 à 2 ms
//   quand la demande de VPX est honorée, 15,6 ms sinon). Le plugin l'écrit dans ses mesures : le retour du
//   défaut se lit au journal de Cyber Pinball, sans rien coûter à l'image (aucune attente dans la boucle
//   de VPX).

#pragma once

#include <windows.h>

#include <algorithm>
#include <atomic>
#include <mutex>
#include <thread>

namespace cyberpinball {

// Windows 11 (SDK 22000) : absent des en-têtes plus anciens.
constexpr ULONG MINUTERIE_IGNOREE = 0x4; // PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION

/** Au-dessus, Sleep(1) ne dure plus une à deux millisecondes : la demande de minuterie de VPX est ignorée. */
constexpr double MINUTERIE_DEGRADEE_MS = 5.0;

enum class Minuterie
{
   Systeme, // Windows décide (son comportement par défaut : ignorée quand aucune fenêtre n'est visible)
   Gardee,  // les demandes de minuterie du processus comptent toujours
   Ignoree, // les demandes sont ignorées : ce que Windows fait à un processus sans fenêtre visible (banc d'essai)
};

/** Règle la façon dont Windows traite les demandes de minuterie de ce processus ; faux si Windows refuse. */
inline bool reglerMinuterie(Minuterie m)
{
   PROCESS_POWER_THROTTLING_STATE etat {};
   etat.Version = PROCESS_POWER_THROTTLING_CURRENT_VERSION;
   etat.ControlMask = m == Minuterie::Systeme ? 0 : MINUTERIE_IGNOREE;
   etat.StateMask = m == Minuterie::Ignoree ? MINUTERIE_IGNOREE : 0;
   return SetProcessInformation(GetCurrentProcess(), ProcessPowerThrottling, &etat, sizeof(etat)) != FALSE;
}

/** Ce que dure Sleep(1), mesuré par un fil à part pendant la partie. */
class SondeMinuterie
{
public:
   ~SondeMinuterie() { arreter(); }

   void demarrer()
   {
      arreter();
      m_fin = CreateEventW(nullptr, TRUE, FALSE, nullptr);
      if (!m_fin)
         return;
      {
         std::lock_guard<std::mutex> g(m_verrou);
         m_somme = 0.0;
         m_n = 0;
      }
      m_derniere = -1.0;
      m_fil = std::thread([this] { tourner(); });
   }

   void arreter()
   {
      if (m_fil.joinable())
      {
         SetEvent(m_fin);
         m_fil.join();
      }
      if (m_fin)
      {
         CloseHandle(m_fin);
         m_fin = nullptr;
      }
   }

   /** Durée moyenne de Sleep(1) depuis le dernier appel, en millisecondes (-1 : rien de mesuré), remise à zéro. */
   double relever()
   {
      std::lock_guard<std::mutex> g(m_verrou);
      const double moyenne = m_n ? m_somme / m_n : -1.0;
      m_somme = 0.0;
      m_n = 0;
      return moyenne;
   }

   /**
    * Durée de Sleep(1) tenue sur les quatre dernières mesures (une seconde), en millisecondes : la plus courte
    * des quatre (-1 : pas encore quatre mesures). Une mesure isolée s'allonge quand le processeur est chargé ; une
    * minuterie ignorée allonge toutes les mesures.
    */
   double derniere() const { return m_derniere.load(); }

private:
   void tourner()
   {
      LARGE_INTEGER freq {};
      QueryPerformanceFrequency(&freq);
      double recentes[4] {};
      unsigned rang = 0;
      while (WaitForSingleObject(m_fin, 250) == WAIT_TIMEOUT)
      {
         // Le premier Sleep cale sur un battement ; les deux suivants durent chacun un battement entier.
         Sleep(1);
         LARGE_INTEGER a {}, b {};
         QueryPerformanceCounter(&a);
         Sleep(1);
         Sleep(1);
         QueryPerformanceCounter(&b);
         const double ms = static_cast<double>(b.QuadPart - a.QuadPart) * 1000.0 / static_cast<double>(freq.QuadPart) / 2.0;
         recentes[rang++ % 4] = ms;
         if (rang >= 4)
            m_derniere = std::min(std::min(recentes[0], recentes[1]), std::min(recentes[2], recentes[3]));
         std::lock_guard<std::mutex> g(m_verrou);
         m_somme += ms;
         m_n++;
      }
   }

   std::thread m_fil;
   HANDLE m_fin = nullptr;
   std::mutex m_verrou;
   double m_somme = 0.0;
   int m_n = 0;
   std::atomic<double> m_derniere { -1.0 };
};

} // namespace cyberpinball
