// Banc de la pause dans le casque (src/pause.h), sans VPX : code de sortie 0 si tout va bien.
#include <cstdio>
#include "pause.h"

using namespace cyberpinball;

static int echecs = 0;
#define VERIFIE(c) do { if (!(c)) { std::printf("ECHEC ligne %d : %s\n", __LINE__, #c); echecs++; } } while (0)

// Numéros internes des actions dans VPX 10.8.1 (InputManager::CreateInputActions).
enum : int { FLIPPER_G = 0, FLIPPER_D = 1, MAGNA_G = 4, UI_HAUT = 6, UI_BAS = 7, LANCER = 10, CREDIT = 15, START = 19, PAUSE = 22, SORTIE = 24, MENU_VPX = 25 };

static Commande cmd(int id)
{
   int liee = 0;
   return commandeVpx1081(id, liee);
}

/** Des images à 90 Hz de `de` à `a` ; le temps de jeu avance si `joue`. */
static Ordre images(Pause& p, double de, double a, bool joue, double& jeu)
{
   Ordre dernier;
   for (double t = de; t <= a + 1e-9; t += 1.0 / 90.0)
   {
      if (joue)
         jeu += 1.0 / 90.0;
      const Ordre o = p.image(t, jeu);
      if (o.quitter || o.reprendre)
         dernier = o;
   }
   return dernier;
}

int main()
{
   // La table : le numéro interne, pas l'énumération de l'API (15 est le crédit, pas la Pause).
   int liee = 0;
   VERIFIE(commandeVpx1081(PAUSE, liee) == Commande::Pause && liee == -1);
   VERIFIE(commandeVpx1081(CREDIT, liee) == Commande::Jeu && liee == api::AddCredit);
   VERIFIE(commandeVpx1081(SORTIE, liee) == Commande::Sortie && liee == api::ExitGame);
   VERIFIE(commandeVpx1081(START, liee) == Commande::Valider && liee == api::StartGame);
   VERIFIE(cmd(MENU_VPX) == Commande::Interface && cmd(UI_HAUT) == Commande::Haut && cmd(UI_BAS) == Commande::Bas);
   VERIFIE(cmd(-1) == Commande::Inconnue && cmd(26) == Commande::Inconnue && cmd(400) == Commande::Inconnue);

   // Partie qui tourne : aucun menu, rien n'est avalé.
   Pause p;
   double jeu = 0.0;
   images(p, 0.0, 1.0, true, jeu);
   VERIFIE(!p.vpxEnPause() && !p.menuVisible() && !p.affichee(1.0));
   for (int id = -1; id < 40; id++)
      VERIFIE(!p.avaler(cmd(id)));

   // Pause (VPX la met lui-même) : le temps de jeu s'arrête, le menu paraît sur « Reprendre ».
   p.action(Commande::Pause, true, 1.0);
   p.action(Commande::Pause, false, 1.1);
   images(p, 1.0, 1.4, false, jeu);
   VERIFIE(p.vpxEnPause() && p.menuVisible() && p.choix() == Choix::Reprendre && !p.jaugeVisible(1.4));

   // INVARIANT : menu ouvert, Pause, la sortie, le menu de VPX et l'inconnu passent toujours ; le reste est gardé.
   for (int id = -1; id < 40; id++)
   {
      const Commande c = cmd(id);
      const bool jamais = c == Commande::Pause || c == Commande::Sortie || c == Commande::Interface || c == Commande::Inconnue;
      VERIFIE(p.avaler(c) == !jamais);
   }

   // Joystick vers le bas : « Quitter » ; vers le haut : « Reprendre » ; les flippers aussi.
   p.action(cmd(UI_BAS), true, 1.5);
   VERIFIE(p.choix() == Choix::Quitter);
   p.action(cmd(UI_HAUT), true, 1.6);
   VERIFIE(p.choix() == Choix::Reprendre);
   p.action(cmd(FLIPPER_D), true, 1.7);
   VERIFIE(p.choix() == Choix::Quitter);
   p.action(cmd(MAGNA_G), true, 1.8);
   VERIFIE(p.choix() == Choix::Reprendre);

   // Valider sur « Reprendre » : premier moyen ; sans effet, le second à 0,5 s, puis le rappel du bouton Pause.
   Ordre o = p.action(cmd(START), true, 2.0);
   VERIFIE(o.reprendre == 1 && !o.quitter);
   o = images(p, 2.0, 2.6, false, jeu);
   VERIFIE(o.reprendre == 2);
   images(p, 2.6, 3.3, false, jeu);
   VERIFIE(p.repriseEchouee() && p.menuVisible());
   // La reprise prend (bouton Pause, VPX la lève) : le menu s'efface, plus rien n'est avalé.
   images(p, 3.3, 3.6, true, jeu);
   VERIFIE(!p.vpxEnPause() && !p.menuVisible() && !p.avaler(cmd(FLIPPER_G)));

   // Valider sur « Quitter » : la sortie, redemandée plus fermement tant que la partie tourne.
   images(p, 3.6, 4.0, false, jeu);
   VERIFIE(p.menuVisible());
   p.action(cmd(UI_BAS), true, 4.1);
   o = p.action(cmd(START), true, 4.2);
   VERIFIE(o.quitter == 1 && p.quitteDemande() && !p.menuVisible());
   for (int id = -1; id < 40; id++)
      VERIFIE(!p.avaler(cmd(id))); // sortie demandée : plus rien n'est retenu
   o = images(p, 4.2, 5.1, false, jeu);
   VERIFIE(o.quitter == 2);

   // Appui tenu : la jauge paraît après 0,2 s, se remplit ; à 1,5 s la partie quitte, une seule fois.
   p.remiseAZero();
   jeu = 0.0;
   images(p, 10.0, 10.5, true, jeu);
   p.action(Commande::Pause, true, 10.5);
   VERIFIE(!p.jaugeVisible(10.6) && p.jaugeVisible(10.8));
   VERIFIE(p.jauge(11.25) > 0.49 && p.jauge(11.25) < 0.51);
   o = images(p, 10.5, 11.9, false, jeu);
   VERIFIE(o.quitter == 0);
   o = p.image(12.0, jeu);
   VERIFIE(o.quitter == 1 && p.quitteDemande());

   // Lâcher avant 1,5 s : rien ne quitte ; la pause de VPX reste, avec son menu.
   p.remiseAZero();
   jeu = 0.0;
   images(p, 20.0, 20.5, true, jeu);
   p.action(Commande::Pause, true, 20.5);
   o = images(p, 20.5, 21.4, false, jeu);
   p.action(Commande::Pause, false, 21.4);
   o = images(p, 21.4, 23.0, false, jeu);
   VERIFIE(!o.quitter && !p.quitteDemande() && p.menuVisible());

   // Le menu de VPX ouvert (bouton X) : la pause de Cyber Pinball s'efface, ses flippers ne sont pas pris.
   p.remiseAZero();
   jeu = 0.0;
   images(p, 30.0, 30.5, true, jeu);
   p.action(Commande::Interface, true, 30.5);
   images(p, 30.5, 31.0, false, jeu);
   VERIFIE(p.vpxEnPause() && !p.menuVisible() && !p.avaler(cmd(FLIPPER_G)));
   // Le jeu reprend une seconde : le menu de VPX est fermé, la pause suivante a de nouveau son menu.
   images(p, 31.0, 32.5, true, jeu);
   images(p, 32.5, 33.0, false, jeu);
   VERIFIE(p.menuVisible());

   // Temps de jeu jamais vu avancer (rien de sûr) : jamais de menu, rien d'avalé.
   p.remiseAZero();
   jeu = 0.0;
   images(p, 40.0, 42.0, false, jeu);
   VERIFIE(!p.vpxEnPause() && !p.menuVisible() && !p.avaler(cmd(FLIPPER_G)));

   // Passif (table en désaccord avec VPX) : plus rien d'avalé, menu ou pas.
   p.remiseAZero();
   jeu = 0.0;
   images(p, 50.0, 50.5, true, jeu);
   images(p, 50.5, 51.0, false, jeu);
   VERIFIE(p.menuVisible() && p.avaler(cmd(FLIPPER_G)));
   p.passif();
   for (int id = -1; id < 40; id++)
      VERIFIE(!p.avaler(cmd(id)));
   VERIFIE(p.action(cmd(START), true, 51.1).reprendre == 0);

   // Fronton cadré : un fronton de PuP 16:9 (1920 × 1080) dans celui de VPX en VR (4:3, 1200 × 900) :
   // toute la largeur, 675 de haut, centré (bandes de 112,5 en haut et en bas) ; une image B2S 3:4 : toute la hauteur.
   Rect r = cadrer(1920.f, 1080.f, 1200.f, 900.f, { 0.f, 0.f, 1920.f, 1080.f });
   VERIFIE(r.x == 0.f && r.l == 1200.f && r.h == 675.f && r.y == 112.5f);
   r = cadrer(1920.f, 1080.f, 1200.f, 900.f, { 960.f, 540.f, 0.f, 0.f });
   VERIFIE(r.x == 600.f && r.y == 450.f);
   r = cadrer(768.f, 1024.f, 1200.f, 900.f, { 0.f, 0.f, 768.f, 1024.f });
   VERIFIE(r.y == 0.f && r.h == 900.f && r.l == 675.f && r.x == 262.5f);
   // Même forme : rien ne change ; surface inconnue : laissée telle quelle.
   r = cadrer(1000.f, 750.f, 1000.f, 750.f, { 10.f, 20.f, 30.f, 40.f });
   VERIFIE(r.x == 10.f && r.y == 20.f && r.l == 30.f && r.h == 40.f);
   r = cadrer(0.f, 0.f, 1000.f, 750.f, { 1.f, 2.f, 3.f, 4.f });
   VERIFIE(r.x == 1.f && r.h == 4.f);

   static_assert(QUIT_HOLD_S == 1.5, "appui tenu de 1,5 s");
   // Libellés : capitales sans accent, en pixels blancs ; « : » et « · » ont leur glyphe.
   VERIFIE(capitales("Reprendre") == "REPRENDRE" && capitales("\xC3\xA9tape") == "ETAPE");
   VERIFIE(capitales("Joystick : choisir \xC2\xB7 A") == "JOYSTICK : CHOISIR * A");
   VERIFIE(glyphe(':')[1] != 0 && glyphe('*')[3] != 0 && glyphe(' ')[3] == 0);
   int l = 0, h = 0;
   const auto px = libelle("Quit", 4, l, h);
   VERIFIE(l == (4 * 6 - 1) * 4 && h == 28 && px.size() == static_cast<size_t>(l) * h * 4);
   std::printf(echecs ? "banc de la pause : %d echec(s)\n" : "banc de la pause : tout va bien\n", echecs);
   return echecs ? 1 : 0;
}
