// Banc de la pause dans le casque (src/pause.h), sans VPX : code de sortie 0 si tout va bien.
#define _CRT_SECURE_NO_WARNINGS
#include <cmath>
#include <cstdio>
#include <cstring>
#include "pause.h"

using namespace cyberpinball;

static int echecs = 0;
#define VERIFIE(c) do { if (!(c)) { std::printf("ECHEC ligne %d : %s\n", __LINE__, #c); echecs++; } } while (0)

// Numéros internes des actions dans VPX 10.8.1 (InputManager::CreateInputActions).
enum : int { FLIPPER_G = 0, FLIPPER_D = 1, MAGNA_G = 4, MAGNA_D = 5, UI_HAUT = 6, UI_BAS = 7, UI_GAUCHE = 8, LANCER = 10, CREDIT = 15, START = 19, PAUSE = 22, SORTIE = 24, MENU_VPX = 25, VR_CENTRER = 40, VR_MANETTES = 47, CUSTOM1 = 52, CUSTOM2 = 53 };

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
      if (o.quitter || o.reprendre || o.pause || o.caler)
         dernier = o;
   }
   return dernier;
}

int main(int argc, char** argv)
{
   // La table : le numéro interne, pas l'énumération de l'API (15 est le crédit, pas la Pause).
   int liee = 0;
   VERIFIE(commandeVpx1081(PAUSE, liee) == Commande::Pause && liee == -1);
   // Crédit : B des manettes du casque (XRInputHandler), « retour » du réglage des écrans ; MagnaSave : la taille.
   VERIFIE(commandeVpx1081(CREDIT, liee) == Commande::Retour && liee == api::AddCredit);
   VERIFIE(commandeVpx1081(MAGNA_G, liee) == Commande::Moins && liee == api::LeftMagnaSave && cmd(MAGNA_D) == Commande::Plus);
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
   for (int id = -1; id < 60; id++)
   {
      const Commande c = cmd(id);
      const bool jamais = c == Commande::Pause || c == Commande::Sortie || c == Commande::Interface || c == Commande::Inconnue;
      VERIFIE(p.avaler(c) == !jamais);
   }

   // Quatre choix : Reprendre, Ajuster les écrans, Caler la borne, Quitter ; joystick, flippers et poignées pour aller de l'un à l'autre.
   p.action(cmd(UI_BAS), true, 1.5);
   VERIFIE(p.choix() == Choix::Ajuster);
   p.action(cmd(UI_BAS), true, 1.52);
   VERIFIE(p.choix() == Choix::Caler);
   p.action(cmd(UI_BAS), true, 1.55);
   VERIFIE(p.choix() == Choix::Quitter);
   p.action(cmd(UI_BAS), true, 1.56);
   VERIFIE(p.choix() == Choix::Quitter);
   p.action(cmd(UI_HAUT), true, 1.6);
   VERIFIE(p.choix() == Choix::Caler);
   p.action(cmd(FLIPPER_G), true, 1.7);
   VERIFIE(p.choix() == Choix::Ajuster);
   p.action(cmd(FLIPPER_G), true, 1.72);
   VERIFIE(p.choix() == Choix::Reprendre);
   p.action(cmd(FLIPPER_D), true, 1.75);
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
   p.action(cmd(UI_BAS), true, 4.12);
   p.action(cmd(UI_BAS), true, 4.15);
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
   // PNG des captures : signature, et une image de 3 × 2 écrite si un chemin est donné (relue par pause-vr.test.ts).
   const std::vector<uint8_t> rgb { 255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90 };
   const std::vector<uint8_t> png = encoderPng(3, 2, rgb);
   VERIFIE(png.size() > 57 && png[0] == 137 && png[1] == 'P' && png[12] == 'I' && png[13] == 'H');
   if (argc > 1)
   {
      FILE* f = std::fopen(argv[1], "wb");
      VERIFIE(f != nullptr);
      if (f)
      {
         std::fwrite(png.data(), 1, png.size(), f);
         std::fclose(f);
      }
   }
   // DMD de la pièce VR : une texture posée en logiciel dans l'image RGB publiée à VPX (jamais un cadre gris).
   {
      std::vector<uint8_t> dmd(static_cast<size_t>(8) * 4 * 3, 0);
      // 2 × 1 RGBA : rouge opaque, vert à moitié transparent, étirée sur toute l'image 8 × 4.
      const uint8_t px2[] = { 255, 0, 0, 255, 0, 255, 0, 128 };
      TextureLue tex { 2, 1, FormatTexture::Rgba8, px2 };
      poserTexture(dmd, 8, 4, tex, 1.f, 1.f, 1.f, 1.f, 0.f, 0.f, 2.f, 1.f, 0.f, 0.f, 8.f, 4.f);
      VERIFIE(dmd[0] == 255 && dmd[1] == 0 && dmd[2] == 0);                           // gauche : rouge
      VERIFIE(dmd[(3 * 8 + 7) * 3 + 1] >= 127 && dmd[(3 * 8 + 7) * 3 + 1] <= 129); // droite : vert à moitié sur du noir
      // Teinte et alpha global, en RGB 8 bits, seulement dans le rectangle donné (et coupé aux bords).
      const uint8_t blanc[] = { 200, 200, 200 };
      TextureLue b { 1, 1, FormatTexture::Rgb8, blanc };
      std::vector<uint8_t> z(static_cast<size_t>(8) * 4 * 3, 0);
      poserTexture(z, 8, 4, b, 1.f, 0.5f, 0.f, 0.5f, 0.f, 0.f, 1.f, 1.f, 6.f, 2.f, 10.f, 10.f);
      VERIFIE(z[(2 * 8 + 6) * 3] == 100 && z[(2 * 8 + 6) * 3 + 1] == 50 && z[(2 * 8 + 6) * 3 + 2] == 0);
      VERIFIE(z[(1 * 8 + 6) * 3] == 0 && z[(2 * 8 + 5) * 3] == 0);
      // 565 et luminance ; rien sans données ni surface.
      const uint16_t bleu = 31;
      TextureLue t565 { 1, 1, FormatTexture::Rgb565, &bleu };
      poserTexture(z, 8, 4, t565, 1.f, 1.f, 1.f, 1.f, 0.f, 0.f, 1.f, 1.f, 0.f, 0.f, 1.f, 1.f);
      VERIFIE(z[0] == 0 && z[2] == 255);
      const float gris = 0.5f;
      TextureLue lum { 1, 1, FormatTexture::Lum32F, &gris };
      poserTexture(z, 8, 4, lum, 1.f, 1.f, 1.f, 1.f, 0.f, 0.f, 1.f, 1.f, 1.f, 0.f, 1.f, 1.f);
      VERIFIE(z[3] == 128);
      const std::vector<uint8_t> avant = z;
      poserTexture(z, 8, 4, TextureLue {}, 1.f, 1.f, 1.f, 1.f, 0.f, 0.f, 1.f, 1.f, 0.f, 0.f, 8.f, 4.f);
      poserTexture(z, 8, 4, b, 1.f, 1.f, 1.f, 1.f, 0.f, 0.f, 1.f, 1.f, 0.f, 0.f, 0.f, 4.f);
      VERIFIE(z == avant);
      static_assert(SALLE_DMD_L * 9 == SALLE_DMD_H * 16, "DMD de la pièce VR en 16:9, comme le FullDMD de PuP");
   }
   // Remplir un cadre (toute source, toute table) : proportions gardées, rogné au plus ROGNE_MAX, posé en bas.
   {
      // PuP 4:3 dans un fronton 16:10 : plein en largeur et en hauteur à 12 % près, rien de déformé.
      const Rect a = remplir(1024.f, 768.f, 1600.f, 1000.f, { 0.f, 0.f, 1024.f, 768.f });
      VERIFIE(std::fabs(a.l / a.h - 1024.f / 768.f) < 1e-3f);
      VERIFIE(couverture(a, 1600.f, 1000.f) >= REMPLI_MIN);
      // Même forme : exactement le cadre.
      const Rect b = remplir(1600.f, 1000.f, 1600.f, 1000.f, { 0.f, 0.f, 1600.f, 1000.f });
      VERIFIE(std::fabs(b.x) < 1e-3f && std::fabs(b.y) < 1e-3f && std::fabs(b.l - 1600.f) < 1e-2f && std::fabs(b.h - 1000.f) < 1e-2f);
      // Forme très différente (DMD 4:1 dans un 16:9) : des bandes, jamais plus de 12 % rogné ; posé en bas, centré.
      const Rect c = remplir(128.f, 32.f, 1600.f, 900.f, { 0.f, 0.f, 128.f, 32.f });
      VERIFIE(c.l <= 1600.f / (1.f - ROGNE_MAX) + 0.5f && std::fabs(c.y + c.h - 900.f) < 0.5f);
      VERIFIE(std::fabs(c.x + c.l / 2.f - 800.f) < 0.5f);
      // Le réglage du joueur : décalage en part du cadre, taille autour de la place calculée.
      const Rect d = remplir(1600.f, 1000.f, 1600.f, 1000.f, { 0.f, 0.f, 1600.f, 1000.f }, { 0.1f, -0.05f, 0.9f });
      VERIFIE(std::fabs(d.l - 1440.f) < 0.5f && std::fabs(d.x - (80.f + 160.f)) < 0.5f && std::fabs(d.y - (100.f - 50.f)) < 0.5f);
      // Mesure du remplissage : un cadre mal rempli se voit.
      VERIFIE(couverture({ 0.f, 0.f, 800.f, 1000.f }, 1600.f, 1000.f) < REMPLI_MIN);
      VERIFIE(std::fabs(couverture({ -100.f, 0.f, 1800.f, 1200.f }, 1600.f, 1000.f) - 1.f) < 1e-4f);
      VERIFIE(couverture(englober({ 0.f, 0.f, 0.f, 0.f }, { 10.f, 10.f, 20.f, 20.f }), 100.f, 100.f) > 0.039f);
      // Réglage lu de l'INI : point décimal, bornes ; sinon le neutre.
      const Reglage g = lireReglage("0.05,-0.1,1.2");
      VERIFIE(std::fabs(g.dx - 0.05f) < 1e-4f && std::fabs(g.dy + 0.1f) < 1e-4f && std::fabs(g.taille - 1.2f) < 1e-4f);
      VERIFIE(lireReglage("0,0,9").taille == 1.f && lireReglage("abc").taille == 1.f && lireReglage("0,0").taille == 1.f);
   }
   // « Ajuster les écrans » : choix de l'écran, réglage en direct aux joysticks et poignées, A garde, B revient.
   {
      Pause q;
      double j = 0.0;
      images(q, 0.0, 1.0, true, j);
      images(q, 1.0, 1.4, false, j); // pause : le menu paraît
      q.dmdAjustable(true);
      q.action(cmd(UI_BAS), true, 1.5);
      q.action(cmd(START), true, 1.6);
      VERIFIE(q.etape() == Etape::ChoixEcran && q.ecran() == Ecran::Fronton);
      q.action(cmd(UI_BAS), true, 1.7);
      VERIFIE(q.ecran() == Ecran::Dmd);
      q.action(cmd(UI_HAUT), true, 1.75);
      q.action(cmd(START), true, 1.8);
      VERIFIE(q.etape() == Etape::Reglage);
      q.action(cmd(MAGNA_D), true, 1.9);
      q.action(cmd(UI_HAUT), true, 2.0);
      q.action(cmd(FLIPPER_D), true, 2.1);
      VERIFIE(std::fabs(q.reglage(Ecran::Fronton).taille - 1.02f) < 1e-4f && q.reglage(Ecran::Fronton).dy < 0.f && q.reglage(Ecran::Fronton).dx > 0.f);
      // B : rien n'est gardé, retour au choix de l'écran.
      VERIFIE(q.avaler(cmd(CREDIT)));
      Ordre b = q.action(cmd(CREDIT), true, 2.2);
      VERIFIE(!b.garder && q.etape() == Etape::ChoixEcran && q.reglage(Ecran::Fronton).taille == 1.f);
      // A : gardé (à enregistrer pour la table).
      q.action(cmd(START), true, 2.3);
      q.action(cmd(MAGNA_G), true, 2.4);
      b = q.action(cmd(START), true, 2.5);
      VERIFIE(b.garder && std::fabs(q.reglage(Ecran::Fronton).taille - 0.98f) < 1e-4f && q.etape() == Etape::ChoixEcran);
      q.action(cmd(CREDIT), true, 2.6);
      VERIFIE(q.etape() == Etape::Menu && q.menuVisible());
      // Sans DMD à ajuster : le fronton seul.
      Pause u;
      images(u, 0.0, 1.0, true, j);
      images(u, 1.0, 1.4, false, j);
      u.action(cmd(UI_BAS), true, 1.5);
      u.action(cmd(START), true, 1.6);
      u.action(cmd(UI_BAS), true, 1.7);
      VERIFIE(u.ecran() == Ecran::Fronton);
      // Hors du menu, le crédit (B) reste un crédit.
      Pause v;
      VERIFIE(!v.avaler(cmd(CREDIT)));
   }
   // Caler la borne en partie : les deux joysticks enfoncés ensemble (Custom1, Custom2), tenus CALAGE_HOLD_S (3 s).
   {
      constexpr double H = CALAGE_HOLD_S;
      static_assert(H == 3.0, "3 s : demande du joueur, 12 novembre 2026");
      // Les porteurs : les numéros 52 et 53 de VPX 10.8.1, toujours avalés (rien pour la table) ; VRCenter et
      // l'alignement de VPX sur les manettes ne sont jamais pris pour les leurs.
      VERIFIE(cmd(CUSTOM1) == Commande::CalageG && cmd(CUSTOM2) == Commande::CalageD);
      VERIFIE(cmd(VR_CENTRER) == Commande::Inconnue && cmd(VR_MANETTES) == Commande::Inconnue && cmd(54) == Commande::Inconnue);
      VERIFIE(estGachette(FLIPPER_G) && estGachette(1) && !estGachette(2) && !estGachette(3) && !estGachette(UI_GAUCHE) && !estGachette(-1));
      Pause c;
      double j = 0.0;
      images(c, 0.0, 1.0, true, j);
      VERIFIE(c.avaler(cmd(CUSTOM1)) && c.avaler(cmd(CUSTOM2)) && !c.avaler(cmd(LANCER)));
      // Un seul joystick enfoncé, même longtemps : rien.
      c.action(cmd(CUSTOM1), true, 1.0);
      Ordre rc = images(c, 1.0, 3.0, true, j);
      VERIFIE(!rc.pause && !c.jaugeCalageVisible(3.0) && !c.affichee(3.0));
      // Les deux, appui court (lâché à 2 s, avant les 3 s) : la jauge paraît, se remplit, puis s'efface ; la partie continue.
      c.action(cmd(CUSTOM2), true, 3.0);
      VERIFIE(!c.jaugeCalageVisible(3.1) && c.jaugeCalageVisible(3.3) && c.affichee(3.3));
      VERIFIE(c.jaugeCalage(3.0 + H / 2) > 0.49 && c.jaugeCalage(3.0 + H / 2) < 0.51);
      rc = images(c, 3.0, 5.0, true, j);
      VERIFIE(!rc.pause);
      c.action(cmd(CUSTOM2), false, 5.0);
      rc = images(c, 5.0, 7.0, true, j);
      VERIFIE(!rc.pause && !c.vpxEnPause() && !c.menuVisible() && !c.affichee(7.0));
      // Tenus 3 s en jouant : la pause demandée une fois, puis le calage dès que VPX s'arrête.
      c.action(cmd(CUSTOM2), true, 8.0);
      rc = images(c, 8.0, 8.0 + H - 0.1, true, j);
      VERIFIE(!rc.pause);
      rc = images(c, 8.0 + H - 0.1, 8.0 + H + 0.1, true, j);
      VERIFIE(rc.pause && !rc.caler);
      rc = images(c, 8.0 + H + 0.1, 12.0, false, j);
      VERIFIE(!rc.pause && c.vpxEnPause() && c.menuVisible() && c.etape() == Etape::Calage);
      c.action(cmd(CUSTOM1), false, 12.0);
      c.action(cmd(CUSTOM2), false, 12.0);
      // Étape du calage : le joystick ne cale pas, la gâchette si (autant de fois qu'on veut) ; flippers avalés.
      VERIFIE(c.avaler(cmd(FLIPPER_G)) && c.avaler(cmd(START)) && !c.avaler(cmd(PAUSE)));
      rc = c.action(cmd(UI_GAUCHE), true, 12.1);
      VERIFIE(!rc.caler && c.calagesFaits() == 0);
      rc = c.action(cmd(FLIPPER_G), true, 12.2, estGachette(FLIPPER_G));
      VERIFIE(rc.caler && c.calagesFaits() == 1);
      // La même gâchette enfoncée à fond : le second temps du flipper (action 2) ne cale pas une seconde fois.
      rc = c.action(cmd(2), true, 12.25, estGachette(2));
      VERIFIE(!rc.caler && c.calagesFaits() == 1);
      // Les deux gâchettes pressées ensemble (une main sur chaque coin) : un seul calage.
      rc = c.action(cmd(FLIPPER_D), true, 12.25, estGachette(FLIPPER_D));
      VERIFIE(!rc.caler && c.calagesFaits() == 1);
      // Une nouvelle pression, plus tard : un second calage.
      rc = c.action(cmd(FLIPPER_D), true, 12.75, estGachette(FLIPPER_D));
      VERIFIE(rc.caler && c.calagesFaits() == 2 && c.etape() == Etape::Calage);
      // A : la partie reprend (premier moyen), le calage reste.
      rc = c.action(cmd(START), true, 12.9);
      VERIFIE(rc.reprendre == 1 && !rc.caler);
      images(c, 12.9, 13.5, true, j);
      VERIFIE(!c.menuVisible() && !c.vpxEnPause());
      // Depuis le menu de la pause : « Caler la borne » (troisième choix), sans combinaison.
      images(c, 13.5, 14.0, false, j);
      VERIFIE(c.menuVisible() && c.etape() == Etape::Menu);
      c.action(cmd(UI_BAS), true, 14.1);
      c.action(cmd(UI_BAS), true, 14.2);
      VERIFIE(c.choix() == Choix::Caler);
      c.action(cmd(START), true, 14.3);
      VERIFIE(c.etape() == Etape::Calage && c.calagesFaits() == 0);
      // La combinaison tenue pendant la pause : le calage directement, sans redemander la pause.
      Pause d;
      double k = 0.0;
      images(d, 0.0, 1.0, true, k);
      images(d, 1.0, 1.4, false, k);
      d.action(cmd(CUSTOM1), true, 1.4);
      d.action(cmd(CUSTOM2), true, 1.4);
      rc = images(d, 1.4, 1.4 + H - 0.2, false, k);
      VERIFIE(d.etape() == Etape::Menu);
      rc = images(d, 1.4 + H - 0.2, 1.4 + H + 0.2, false, k);
      VERIFIE(!rc.pause && d.etape() == Etape::Calage);
      // Mode passif (actions inattendues) : la combinaison ne fait rien.
      Pause e;
      double m = 0.0;
      e.passif();
      images(e, 0.0, 1.0, true, m);
      e.action(cmd(CUSTOM1), true, 1.0);
      e.action(cmd(CUSTOM2), true, 1.0);
      rc = images(e, 1.0, 1.0 + H + 1.0, true, m);
      VERIFIE(!rc.pause && !e.avaler(cmd(CUSTOM1)) && !e.jaugeCalageVisible(2.0));
      // Pause demandée qui ne vient jamais : oubliée, pas de calage surgi à la pause suivante.
      Pause f;
      double n = 0.0;
      images(f, 0.0, 1.0, true, n);
      f.action(cmd(CUSTOM1), true, 1.0);
      f.action(cmd(CUSTOM2), true, 1.0);
      rc = images(f, 1.0, 1.0 + H + 0.1, true, n);
      VERIFIE(rc.pause);
      f.action(cmd(CUSTOM1), false, 1.0 + H + 0.1);
      f.action(cmd(CUSTOM2), false, 1.0 + H + 0.1);
      images(f, 1.0 + H + 0.1, 1.0 + H + 3.0, true, n);
      images(f, 1.0 + H + 3.0, 1.0 + H + 3.5, false, n);
      VERIFIE(f.menuVisible() && f.etape() == Etape::Menu);
   }
   std::printf(echecs ? "banc de la pause : %d echec(s)\n" : "banc de la pause : tout va bien\n", echecs);
   return echecs ? 1 : 0;
}
