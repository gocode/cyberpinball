// Banc de la cadence des images (src/cadence.h), sans VPX : code de sortie 0 si tout va bien.
#include <cmath>
#include <cstdio>
#include <cstring>
#include "cadence.h"

using namespace cyberpinball;

static int echecs = 0;
#define VERIFIE(c) do { if (!(c)) { std::printf("ECHEC ligne %d : %s\n", __LINE__, #c); echecs++; } } while (0)

/** Des images à `hz` de `de` à `a` ; rend le nombre d'à-coups signalés. */
static int images(Cadence& c, double de, double a, double hz)
{
   int n = 0;
   for (double t = de; t < a - 1e-9; t += 1.0 / hz)
      n += c.image(t) ? 1 : 0;
   return n;
}

int main()
{
   {
      // Partie régulière à 60 Hz : 60 images par seconde, médiane 17 ms, rien en retard, aucun à-coup.
      Cadence c;
      VERIFIE(images(c, 0.0, 65.0, 60.0) == 0);
      VERIFIE(std::fabs(c.imagesParSeconde() - 60.0) < 0.5);
      VERIFIE(c.centile(0.5) == 17);
      VERIFIE(c.centile(0.99) == 17);
      VERIFIE(c.enRetard() == 0.0);
      VERIFIE(c.aCoups() == 0);
      VERIFIE(std::fabs(c.duree() - 60.0) < 0.1);
      VERIFIE(std::fabs(c.pireFenetre() - 60.0) < 0.5);
   }
   {
      // Les cinq premières secondes (préparation de la table) ne comptent pas, même très lentes.
      Cadence c;
      images(c, 0.0, 4.9, 2.0);
      images(c, 5.0, 25.0, 60.0);
      VERIFIE(c.plusLong() < 0.02);
      VERIFIE(c.aCoups() == 0);
   }
   {
      // À-coups : trois arrêts de 250 ms au milieu d'une partie à 60 Hz.
      Cadence c;
      double t = 0.0;
      int signales = 0;
      for (int arret = 0; arret < 3; arret++)
      {
         signales += images(c, t, t + 10.0, 60.0);
         t += 10.0 + 0.25;
      }
      signales += images(c, t, t + 10.0, 60.0);
      VERIFIE(signales == 3);
      VERIFIE(c.aCoups() == 3);
      VERIFIE(c.plusLong() > 0.24 && c.plusLong() < 0.27);
      VERIFIE(c.enRetard() > 0.0 && c.enRetard() < 0.01);
   }
   {
      // Une table qui rame par moments : 20 s à 60 Hz, 20 s à 30 Hz. La pire fenêtre dit 30, la moyenne entre les deux,
      // un quart des images (celles à 33 ms) en retard sur la médiane.
      Cadence c;
      images(c, 0.0, 25.0, 60.0);
      images(c, 25.0, 45.0, 30.0);
      VERIFIE(c.pireFenetre() > 29.0 && c.pireFenetre() < 31.0);
      VERIFIE(c.imagesParSeconde() > 40.0 && c.imagesParSeconde() < 50.0);
      VERIFIE(c.enRetard() > 0.3 && c.enRetard() < 0.4);
      VERIFIE(c.centile(0.95) >= 33);
   }
   {
      // Partie trop courte pour une fenêtre entière : -1 ; le bilan a la forme que relit Cyber Pinball.
      Cadence c;
      images(c, 0.0, 9.0, 60.0);
      VERIFIE(c.pireFenetre() < 0.0);
      char ligne[256];
      c.bilan(ligne, sizeof(ligne), "end");
      VERIFIE(std::strncmp(ligne, "Cadence end: frames=", 20) == 0);
      VERIFIE(std::strstr(ligne, " fps=60.0 ") != nullptr);
      VERIFIE(std::strstr(ligne, " worst10s=-1.0fps") != nullptr);
      std::printf("%s\n", ligne);
   }
   {
      // Remise à zéro : une nouvelle partie repart de rien.
      Cadence c;
      images(c, 0.0, 30.0, 30.0);
      c.remiseAZero();
      VERIFIE(c.ecarts() == 0 && c.plusLong() == 0.0);
   }
   {
      // En direct (mode débogage) : une ligne par seconde, la forme que relit Cyber Pinball (debogage.ts).
      CadenceDirecte d;
      int lignes = 0;
      char ligne[200] = "";
      double precedente = -1.0;
      // Trois secondes à 60 Hz, puis un arrêt de 300 ms : la ligne suivante le dit.
      for (double t = 0.0; t < 3.0; t += 1.0 / 60.0)
      {
         if (precedente >= 0.0 && d.ecart(t, t - precedente))
         {
            d.ligne(ligne, sizeof(ligne), t, 2048);
            lignes++;
         }
         precedente = t;
      }
      VERIFIE(lignes >= 2 && lignes <= 3);
      VERIFIE(std::strncmp(ligne, "Cadence live: fps=", 18) == 0);
      VERIFIE(std::strstr(ligne, " p50=17ms ") != nullptr);
      VERIFIE(std::strstr(ligne, " stalls=0 ") != nullptr);
      VERIFIE(std::strstr(ligne, " mem=2048MB") != nullptr);
      double t = 3.0;
      bool dite = false;
      d.ecart(t + 0.3, 0.3);
      t += 0.3;
      for (; t < 5.0 && !dite; t += 1.0 / 60.0)
         if (d.ecart(t, 1.0 / 60.0))
         {
            d.ligne(ligne, sizeof(ligne), t, 100);
            dite = true;
         }
      VERIFIE(dite);
      VERIFIE(std::strstr(ligne, " stalls=1 ") != nullptr);
      VERIFIE(std::strstr(ligne, " max=300ms ") != nullptr);
      std::printf("%s\n", ligne);
   }
   std::printf(echecs ? "banc de la cadence : %d echec(s)\n" : "banc de la cadence : tout va bien\n", echecs);
   return echecs ? 1 : 0;
}
