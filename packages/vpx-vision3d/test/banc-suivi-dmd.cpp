// Banc du suivi de la fenêtre du DMD (src/suivi-dmd.h), sans VPX : code de sortie 0 si tout va bien.
#include <cstdio>
#include "suivi-dmd.h"

using namespace cyberpinball;

static int echecs = 0;
#define VERIFIE(c) do { if (!(c)) { std::printf("ECHEC ligne %d : %s\n", __LINE__, #c); echecs++; } } while (0)

/** Des images à 60 Hz de `de` à `a`, fenêtre l × h ; rend le nombre de diffusions. */
static int images(SuiviTaille& s, double de, double a, int l, int h)
{
   int n = 0;
   for (double t = de; t <= a + 1e-9; t += 1.0 / 60.0)
      n += s.vue(l, h, t) ? 1 : 0;
   return n;
}

int main()
{
   {
      // Première taille vue : diffusée, puis confirmée une fois ; plus rien tant qu'elle ne bouge pas.
      SuiviTaille s;
      VERIFIE(s.vue(512, 128, 0.0));
      VERIFIE(images(s, 1.0 / 60.0, 0.29, 512, 128) == 0);
      VERIFIE(images(s, 0.30, 0.35, 512, 128) == 1);
      VERIFIE(images(s, 0.36, 10.0, 512, 128) == 0);
      VERIFIE(s.largeur() == 512 && s.hauteur() == 128);
   }
   {
      // Une nouvelle taille : diffusée tout de suite, puis confirmée.
      SuiviTaille s;
      images(s, 0.0, 2.0, 512, 128);
      VERIFIE(s.vue(768, 128, 2.5));
      VERIFIE(images(s, 2.5 + 1.0 / 60.0, 2.79, 768, 128) == 0);
      VERIFIE(images(s, 2.8, 3.0, 768, 128) == 1);
      VERIFIE(images(s, 3.0, 6.0, 768, 128) == 0);
   }
   {
      // Réglage tenu : une taille par image pendant une seconde. Au plus une diffusion tous les 0,1 s, puis la
      // dernière taille confirmée une fois l'appui relâché.
      SuiviTaille s;
      images(s, 0.0, 1.0, 512, 128);
      int n = 0;
      int l = 512;
      for (double t = 1.0; t <= 2.0 + 1e-9; t += 1.0 / 60.0)
         n += s.vue(l += 4, 128, t) ? 1 : 0;
      VERIFIE(n >= 9 && n <= 11);
      VERIFIE(images(s, 2.0 + 1.0 / 60.0, 2.29, l, 128) == 0);
      VERIFIE(images(s, 2.30, 2.4, l, 128) == 1);
      VERIFIE(s.largeur() == l);
   }
   {
      // Fenêtre réduite (0 × 0) : ignorée, la taille d'avant n'est pas oubliée.
      SuiviTaille s;
      images(s, 0.0, 1.0, 512, 128);
      VERIFIE(images(s, 1.0, 2.0, 0, 0) == 0);
      VERIFIE(images(s, 2.0, 3.0, 512, 128) == 0);
   }
   {
      // Remise à zéro (nouvelle partie, fenêtre recréée) : la même taille est de nouveau diffusée.
      SuiviTaille s;
      images(s, 0.0, 1.0, 512, 128);
      s.remiseAZero();
      VERIFIE(s.vue(512, 128, 5.0));
   }
   std::printf(echecs ? "banc du suivi du DMD : %d echec(s)\n" : "banc du suivi du DMD : tout va bien\n", echecs);
   return echecs ? 1 : 0;
}
