// Banc du relevé des arrêts (src/arrets.h), sans VPX : code de sortie 0 si tout va bien.
// 1. Comptes : le comptage par module et la ligne écrite.
// 2. ReleveArrets en vrai : un fil « des images » qui tourne à 100 Hz, puis s'arrête 300 ms dans une fonction de cet
//    exécutable (calcul) et 300 ms dans Windows (Sleep) ; le relevé doit dire où.
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <thread>
#include "arrets.h"

using namespace cyberpinball;

static int echecs = 0;
#define VERIFIE(c) do { if (!(c)) { std::printf("ECHEC ligne %d : %s\n", __LINE__, #c); echecs++; } } while (0)

static volatile double puits = 0.0;

/** Du calcul pendant `ms` millisecondes, dans le code de ce banc. */
__declspec(noinline) static void calcul(int ms)
{
   const auto fin = std::chrono::steady_clock::now() + std::chrono::milliseconds(ms);
   double x = 1.0;
   while (std::chrono::steady_clock::now() < fin)
      for (int i = 0; i < 2000; i++)
         x = std::sqrt(x + i);
   puits = x;
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
   }
   std::printf(echecs ? "%d echec(s)\n" : "tout va bien\n", echecs);
   return echecs ? 1 : 0;
}
