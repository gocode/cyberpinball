// Banc du relevé des arrêts (src/arrets.h), sans VPX : code de sortie 0 si tout va bien.
// 1. Comptes : le comptage par module et la ligne écrite.
// 2. ReleveArrets en vrai : un fil « des images » qui tourne à 100 Hz, puis s'arrête 300 ms dans une fonction de cet
//    exécutable (calcul) et 300 ms dans Windows (Sleep) ; le relevé doit dire où.
// 3. Le fil « RenderThread » relevé en même temps : la boucle de jeu attend, le rendu calcule (VPX 10.8 en BGFX).
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include "arrets.h"

using namespace cyberpinball;

static int echecs = 0;
#define VERIFIE(c) do { if (!(c)) { std::printf("ECHEC ligne %d : %s\n", __LINE__, #c); echecs++; } } while (0)

static volatile double puits = 0.0;

/**
 * Du calcul pendant `ms` millisecondes, dans le code de ce banc. L'horloge est lue rarement (une fois par 100 000
 * racines, une fraction de milliseconde) : lue toutes les 2000, elle passait par Windows (ntdll) si souvent qu'un
 * fil préempté sous charge y était surpris la plupart du temps, au retour de l'appel (26/11/2026).
 */
__declspec(noinline) static void calcul(int ms)
{
   const auto fin = std::chrono::steady_clock::now() + std::chrono::milliseconds(ms);
   double x = 1.0;
   while (std::chrono::steady_clock::now() < fin)
      for (int i = 0; i < 100000; i++)
         x = std::sqrt(x + i);
   puits = x;
}

/**
 * Le fil des images du banc passe devant les autres programmes, comme la boucle de jeu de VPX : sur une machine
 * chargée, ses écarts courts restent courts (« rien n'est dit »), et ses arrêts sont ceux qu'il fait lui-même.
 */
static void filDesImages() { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST); }

/**
 * Les fils du banc se nomment en démarrant, et le relevé les liste au début (puis une fois par seconde). Sur une
 * machine chargée, un fil créé n'avait pas encore tourné : relevé sous « tid… », ou pas du tout (26/11/2026).
 */
static void attendreNoms(const std::atomic<int>& nommes, int n)
{
   while (nommes.load() < n)
      std::this_thread::yield();
}

int main()
{
   {
      Comptes c;
      char ligne[256];
      c.dire(ligne, sizeof(ligne));
      VERIFIE(ligne[0] == '\0');
      for (int i = 0; i < 6; i++)
         c.ajouter("vbscript.dll", "VPinballX64.exe", "VPinballX64.exe", 0x1234);
      for (int i = 0; i < 2; i++)
         c.ajouter("ntdll.dll", "plugin-flexdmd64.dll", "plugin-flexdmd64.dll", 0x40);
      c.ajouter("ntdll.dll", "-", "", 0);
      c.dire(ligne, sizeof(ligne));
      std::printf("%s\n", ligne);
      VERIFIE(std::strcmp(ligne, "9 samples: in vbscript.dll 6, ntdll.dll 3; under VPinballX64.exe 6, plugin-flexdmd64.dll 2, - 1; top VPinballX64.exe+0x1234 (6)") == 0);
      // Une ligne trop courte reste terminée.
      char court[12];
      c.dire(court, sizeof(court));
      VERIFIE(std::strlen(court) == sizeof(court) - 1);
      // Plus de noms que de places : le reste compte comme « other ».
      Comptes d;
      for (int i = 0; i < Comptes::NOMS + 5; i++)
      {
         const std::string nom = "m" + std::to_string(i) + ".dll";
         d.ajouter(nom.c_str(), nom.c_str(), "", 0);
      }
      VERIFIE(d.releves() == Comptes::NOMS + 5);
      d.dire(ligne, sizeof(ligne));
      VERIFIE(std::strstr(ligne, "other 6") != nullptr);
   }
   {
      ReleveArrets releve;
      std::string surCalcul, surSleep, horsArret;
      std::thread images([&]
      {
         filDesImages();
         VERIFIE(releve.demarrer());
         char ou[448];
         auto image = [&](bool aCoup) -> std::string
         {
            releve.image(aCoup, ou, sizeof(ou));
            return ou;
         };
         for (int i = 0; i < 30; i++)
         {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            horsArret += image(false);
         }
         image(false);
         calcul(300);
         surCalcul = image(true);
         Sleep(300);
         surSleep = image(true);
         // Un écart court qui n'est pas un à-coup : rien n'est dit.
         std::this_thread::sleep_for(std::chrono::milliseconds(10));
         horsArret += image(true);
         releve.arreter();
      });
      images.join();
      std::printf("calcul : %s\nSleep  : %s\n", surCalcul.c_str(), surSleep.c_str());
      VERIFIE(horsArret.empty());
      VERIFIE(surCalcul.find("banc-arrets.exe") != std::string::npos);
      VERIFIE(surCalcul.find(" samples: in banc-arrets.exe") != std::string::npos);
      VERIFIE(surCalcul.find("; top banc-arrets.exe+0x") != std::string::npos);
      // Dans Sleep, le fil est dans Windows (ntdll) ; sur sa pile, sous ce banc.
      VERIFIE(surSleep.find(" samples: in ntdll.dll") != std::string::npos);
      VERIFIE(surSleep.find("; under banc-arrets.exe") != std::string::npos);
      VERIFIE(std::atoi(surCalcul.c_str()) >= 20);
      VERIFIE(surCalcul.find("render thread") == std::string::npos);
   }
   {
      // Le cas de VPX 10.8 en BGFX (rapport du 21/11/2026) : la boucle de jeu attend en dormant pendant que le fil
      // « RenderThread » calcule. Le relevé doit dire aussi où était ce fil-là.
      ReleveArrets releve;
      releve.suivreAussi(L"RenderThread");
      std::atomic<bool> calculer { false }, commence { false }, fini { false };
      std::atomic<int> nommes { 0 };
      std::thread rendu([&]
      {
         SetThreadDescription(GetCurrentThread(), L"RenderThread");
         nommes++;
         while (!fini.load())
         {
            if (calculer.load())
            {
               commence.store(true);
               calcul(300);
               calculer.store(false);
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
         }
      });
      attendreNoms(nommes, 1);
      std::string attente;
      std::thread images([&]
      {
         filDesImages();
         VERIFIE(releve.demarrer());
         char ou[900];
         // Des images jusqu'à ce que le relevé ait trouvé le rendu (la recherche est lente sur une machine chargée).
         for (int i = 0; i < 20 || !releve.filsCherches(); i++)
         {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            releve.image(false, ou, sizeof(ou));
         }
         calculer.store(true);
         // L'à-coup commence le calcul lancé : sous charge, le réveil du rendu (dans Windows) n'en fait pas partie.
         while (!commence.load())
            std::this_thread::yield();
         releve.image(false, ou, sizeof(ou));
         while (calculer.load())
            Sleep(1); // la boucle de jeu attend le rendu
         releve.image(true, ou, sizeof(ou));
         attente = ou;
         releve.arreter();
      });
      images.join();
      fini.store(true);
      rendu.join();
      std::printf("attente du rendu : %s\n", attente.c_str());
      const size_t r = attente.find(" | render thread ");
      VERIFIE(r != std::string::npos);
      // Côté boucle de jeu : Windows (Sleep) ; côté rendu : le calcul de ce banc.
      VERIFIE(attente.find(" samples: in ntdll.dll") < r);
      VERIFIE(r != std::string::npos && attente.find(" samples: in banc-arrets.exe", r) != std::string::npos);
      VERIFIE(r != std::string::npos && attente.find("; top banc-arrets.exe+0x", r) != std::string::npos);
   }
   {
      // StallThreads = 1 (rapport du 21/11/2026, The Matrix) : la boucle de jeu attend un verrou tenu par un autre fil
      // qui calcule ; le relevé de tous les fils doit le nommer, et ne rien dire des fils qui dorment.
      ReleveArrets releve;
      releve.suivreTous(true);
      std::mutex verrou;
      std::atomic<bool> tenir { false }, tenu { false }, fini { false };
      std::atomic<int> nommes { 0 };
      std::thread travailleur([&]
      {
         SetThreadDescription(GetCurrentThread(), L"Travailleur.CmdQueue");
         nommes++;
         while (!fini.load())
         {
            if (tenir.load())
            {
               std::lock_guard l(verrou);
               tenu.store(true);
               calcul(300);
               tenir.store(false);
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
         }
      });
      std::thread dormeur([&]
      {
         SetThreadDescription(GetCurrentThread(), L"Dormeur");
         nommes++;
         while (!fini.load())
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
      });
      attendreNoms(nommes, 2);
      std::string attente;
      std::thread images([&]
      {
         filDesImages();
         VERIFIE(releve.demarrer());
         char ou[2048];
         // Des images jusqu'à ce que le relevé ait listé les autres fils (la recherche est lente sur une machine chargée).
         for (int i = 0; i < 20 || !releve.filsCherches(); i++)
         {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            releve.image(false, ou, sizeof(ou));
         }
         tenir.store(true);
         while (!tenu.load())
            std::this_thread::yield();
         // L'à-coup commence le verrou pris : sous charge, le réveil du travailleur (dans Windows) n'en fait pas partie.
         releve.image(false, ou, sizeof(ou));
         {
            std::lock_guard l(verrou); // la boucle de jeu attend le verrou, comme Render du lecteur PuP
         }
         releve.image(true, ou, sizeof(ou));
         attente = ou;
         releve.arreter();
      });
      images.join();
      fini.store(true);
      travailleur.join();
      dormeur.join();
      std::printf("verrou tenu ailleurs : %s\n", attente.c_str());
      const size_t t = attente.find(" | thread Travailleur.CmdQueue ");
      VERIFIE(t != std::string::npos);
      VERIFIE(t != std::string::npos && attente.find(" samples: in banc-arrets.exe", t) != std::string::npos);
      VERIFIE(attente.find("Dormeur") == std::string::npos);
   }
   std::printf(echecs ? "%d echec(s)\n" : "tout va bien\n", echecs);
   return echecs ? 1 : 0;
}
