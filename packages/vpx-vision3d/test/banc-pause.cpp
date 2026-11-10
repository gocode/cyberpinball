// Banc de la pause dans le casque (src/pause.h), sans VPX : code de sortie 0 si tout va bien.
#include <cstdio>
#include "pause.h"

using namespace cyberpinball;

static int echecs = 0;
#define VERIFIE(c) do { if (!(c)) { std::printf("ECHEC ligne %d : %s\n", __LINE__, #c); echecs++; } } while (0)

int main()
{
   // Appui court : la pause s'ouvre (VPX mis en pause), sur « Reprendre ».
   Pause p;
   VERIFIE(!p.bouton(true, 10.0).pauserVpx);
   VERIFIE(!p.affichee() || p.jauge(10.0) == 0.0);
   Ordre o = p.bouton(false, 10.3);
   VERIFIE(o.pauserVpx && !o.quitter && p.ouverte() && p.choix() == Choix::Reprendre);
   // Flipper droit : « Quitter » ; gauche : « Reprendre » ; valider sur Reprendre : VPX reprend.
   p.droite();
   VERIFIE(p.choix() == Choix::Quitter);
   p.gauche();
   o = p.valider();
   VERIFIE(o.reprendreVpx && !o.quitter && !p.ouverte() && !p.affichee());
   // Valider sur Quitter : la partie quitte.
   p.bouton(true, 20.0);
   p.bouton(false, 20.2);
   p.droite();
   o = p.valider();
   VERIFIE(o.quitter);
   // Appui tenu : la jauge se remplit ; à 1,5 s, la partie quitte, une seule fois.
   p.remiseAZero();
   p.bouton(true, 30.0);
   VERIFIE(p.image(30.7).quitter == false);
   VERIFIE(p.jauge(30.75) > 0.49 && p.jauge(30.75) < 0.51 && p.affichee());
   VERIFIE(p.image(30.0 + QUIT_HOLD_S).quitter);
   VERIFIE(!p.image(31.8).quitter);
   o = p.bouton(false, 32.0);
   VERIFIE(!o.pauserVpx && !o.reprendreVpx);
   // Lâcher avant 1,5 s : annulé, rien ne quitte (la pause s'ouvre, comme un appui court).
   p.remiseAZero();
   p.bouton(true, 40.0);
   VERIFIE(!p.image(41.4).quitter);
   o = p.bouton(false, 41.4);
   VERIFIE(!o.quitter && o.pauserVpx);
   static_assert(QUIT_HOLD_S == 1.5, "appui tenu de 1,5 s");
   // Libellés : capitales sans accent, en pixels blancs.
   VERIFIE(capitales("Reprendre") == "REPRENDRE" && capitales("\xC3\xA9tape") == "ETAPE");
   int l = 0, h = 0;
   const auto px = libelle("Quit", 4, l, h);
   VERIFIE(l == (4 * 6 - 1) * 4 && h == 28 && px.size() == static_cast<size_t>(l) * h * 4);
   std::printf(echecs ? "banc de la pause : %d echec(s)\n" : "banc de la pause : tout va bien\n", echecs);
   return echecs ? 1 : 0;
}
