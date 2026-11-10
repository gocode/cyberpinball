// license:GPLv3+
//
// Pause dans le casque (plugin VPX « CyberPinball ») : logique pure, sans VPX, testée par le banc.
//
// La pause est celle de VPX : le bouton Pause (action Pause de VPX) la met et la lève lui-même ; le
// plugin la constate (le temps de jeu de VPX s'arrête) et montre alors « Reprendre » / « Quitter » sur
// le fronton. Le joystick (ou les flippers) choisit, Valider (action Start) confirme. Le bouton Pause
// tenu QUIT_HOLD_S quitte la partie, avec une jauge qui se remplit.
//
// Invariant (essai du 10 novembre 2026, partie bloquée) : le plugin n'avale JAMAIS Pause, la sortie
// (Échap, ExitGame) ni le menu de VPX, ni une action qu'il ne reconnaît pas avec certitude ; si la
// table des actions ne correspond pas à la version de VPX, il n'avale plus rien du tout (passif).
// Cause du blocage : OnActionChanged donne le numéro INTERNE de l'action (InputManager), pas une
// VPXAction ; le plugin les confondait (15, « Pause » pour lui, est le crédit dans VPX), ouvrait son
// menu au crédit et avalait alors la vraie Pause (22) et la vraie sortie (24).

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace cyberpinball {

/** Durée d'appui sur Pause pour quitter (secondes). */
constexpr double QUIT_HOLD_S = 1.5;
/** La jauge ne paraît qu'après ce délai : un appui court (pause) ne la fait pas clignoter. */
constexpr double JAUGE_APRES_S = 0.2;
/** VPX est en pause quand son temps de jeu n'avance plus depuis ce délai (il avance à chaque image). */
constexpr double PAUSE_APRES_S = 0.15;
/** Reprendre : deuxième moyen après ce délai, puis le rappel « Pause : reprendre » après REPRISE_ECHEC_S. */
constexpr double REPRISE_RELANCE_S = 0.5;
constexpr double REPRISE_ECHEC_S = 1.2;
/** Quitter : nouvelle demande (de plus en plus ferme) tant que la partie tourne encore. */
constexpr double SORTIE_RELANCE_S = 0.8;

/** Ce qu'une action de VPX représente pour la pause. */
enum class Commande
{
   Pause,     // le bouton Pause : VPX met en pause ou reprend lui-même ; tenu, quitter
   Valider,   // Start : confirme le choix
   Haut,      // joystick vers le haut : « Reprendre »
   Bas,       // joystick vers le bas : « Quitter »
   Gauche,    // flipper, MagnaSave gauches : « Reprendre »
   Droite,    // flipper, MagnaSave droits : « Quitter »
   Jeu,       // une action de la table (lancer, secousses, crédit…) : gardée pendant le menu
   Sortie,    // ExitGame (Échap) : jamais avalée
   Interface, // le menu de VPX : jamais avalé
   Inconnue,  // tout le reste : jamais avalée
};

/** Les actions de l'API des plugins (VPXPlugin.h, enum VPXAction), dans leur ordre. */
namespace api {
enum : int
{
   LeftFlipper, RightFlipper, StagedLeftFlipper, StagedRightFlipper, LeftMagnaSave, RightMagnaSave, LaunchBall, LeftNudge, CenterNudge, RightNudge,
   Tilt, AddCredit, AddCredit2, StartGame, Lockbar, Pause, PerfOverlay, OpenInGameUI, ExitGame, InGameUI,
};
}

/**
 * VPX 10.8.1 : une action par son numéro interne (ordre de création dans InputManager::CreateInputActions,
 * révision 5436) ; `api` reçoit l'action de l'API des plugins que VPX y lie (m_actionMap, pour vérifier la
 * table pendant la partie), ou -1 quand VPX ne la lie pas (Pause, les UI*).
 */
inline Commande commandeVpx1081(int id, int& lieeA)
{
   static const struct { Commande c; int api; } table[] = {
      { Commande::Gauche, api::LeftFlipper },        // 0 LeftFlipper
      { Commande::Droite, api::RightFlipper },       // 1 RightFlipper
      { Commande::Gauche, api::StagedLeftFlipper },  // 2 LeftStagedFlipper
      { Commande::Droite, api::StagedRightFlipper }, // 3 RightStagedFlipper
      { Commande::Gauche, api::LeftMagnaSave },      // 4 LeftMagna
      { Commande::Droite, api::RightMagnaSave },     // 5 RightMagna
      { Commande::Haut, -1 },                        // 6 UIUp (joystick vers le haut)
      { Commande::Bas, -1 },                         // 7 UIDown
      { Commande::Gauche, -1 },                      // 8 UILeft
      { Commande::Droite, -1 },                      // 9 UIRight
      { Commande::Jeu, api::LaunchBall },            // 10 LaunchBall
      { Commande::Jeu, api::LeftNudge },             // 11 LeftNudge
      { Commande::Jeu, api::RightNudge },            // 12 RightNudge
      { Commande::Jeu, api::CenterNudge },           // 13 CenterNudge
      { Commande::Jeu, api::Tilt },                  // 14 Tilt
      { Commande::Jeu, api::AddCredit },             // 15 Credit1
      { Commande::Jeu, api::AddCredit2 },            // 16 Credit2
      { Commande::Jeu, -1 },                         // 17 Credit3
      { Commande::Jeu, -1 },                         // 18 Credit4
      { Commande::Valider, api::StartGame },         // 19 Start
      { Commande::Jeu, -1 },                         // 20 ExtraBall
      { Commande::Jeu, api::Lockbar },               // 21 Lockbar
      { Commande::Pause, -1 },                       // 22 Pause
      { Commande::Inconnue, -1 },                    // 23 PerfOverlay
      { Commande::Sortie, api::ExitGame },           // 24 ExitGame
      { Commande::Interface, api::OpenInGameUI },    // 25 InGameUI
   };
   if (id < 0 || id >= static_cast<int>(sizeof(table) / sizeof(table[0])))
   {
      lieeA = -1;
      return Commande::Inconnue;
   }
   lieeA = table[id].api;
   return table[id].c;
}

enum class Choix { Reprendre, Quitter };

/** Ce que la pause demande au plugin. */
struct Ordre
{
   int reprendre = 0; // essai de reprise : 1 le premier moyen, 2 le second (0 rien)
   int quitter = 0;   // demande de sortie : 1 la première (ExitGame), 2 et plus de plus en plus ferme
};

class Pause
{
public:
   /** Le plugin n'est plus sûr des actions (table et VPX en désaccord) : il n'avale plus rien. */
   void passif() { fiable = false; }
   bool estFiable() const { return fiable; }

   bool vpxEnPause() const { return enPause; }
   bool menuVisible() const { return menu && !quitte; }
   bool appuiEnCours() const { return appui; }
   bool quitteDemande() const { return quitte; }
   Choix choix() const { return selection; }
   /** La reprise demandée n'a pas pris : le menu rappelle le bouton Pause. */
   bool repriseEchouee() const { return echecReprise; }
   /** Remplissage de la jauge (0 à 1) pendant l'appui tenu. */
   double jauge(double t) const
   {
      if (!appui)
         return 0.0;
      const double r = (t - debut) / QUIT_HOLD_S;
      return r < 0.0 ? 0.0 : (r > 1.0 ? 1.0 : r);
   }
   bool jaugeVisible(double t) const { return appui && !quitte && t - debut >= JAUGE_APRES_S; }
   /** Le fronton est à la pause : jauge ou menu, sinon il est rendu aux autres. */
   bool affichee(double t) const { return jaugeVisible(t) || menuVisible(); }

   /**
    * L'invariant : jamais Pause, la sortie, le menu de VPX ni une action inconnue ; le reste seulement
    * pendant le menu de la pause, et jamais une fois la sortie demandée ni en mode passif.
    */
   bool avaler(Commande c) const
   {
      if (!fiable || quitte)
         return false;
      if (c == Commande::Pause || c == Commande::Sortie || c == Commande::Interface || c == Commande::Inconnue)
         return false;
      return menuVisible();
   }

   /** Une action de VPX (numéro déjà traduit). */
   Ordre action(Commande c, bool presse, double t)
   {
      Ordre o;
      switch (c)
      {
      case Commande::Pause:
         interfaceVpx = false;
         if (presse && !appui)
         {
            appui = true;
            debut = t;
         }
         else if (!presse)
            appui = false;
         return o;
      case Commande::Interface:
         // Le menu de VPX s'ouvre (ou recule) : la pause de Cyber Pinball s'efface devant lui.
         if (presse)
         {
            interfaceVpx = true;
            menu = false;
         }
         return o;
      default: break;
      }
      if (!menuVisible() || !presse || !fiable)
         return o;
      switch (c)
      {
      case Commande::Haut:
      case Commande::Gauche: selection = Choix::Reprendre; break;
      case Commande::Bas:
      case Commande::Droite: selection = Choix::Quitter; break;
      case Commande::Valider:
         if (selection == Choix::Quitter)
            o.quitter = demanderSortie(t);
         else
         {
            debutReprise = t;
            essaisReprise = 1;
            echecReprise = false;
            o.reprendre = 1;
         }
         break;
      default: break;
      }
      return o;
   }

   /** À chaque image : `tempsJeu` est le temps de jeu de VPX (GetGameTime), arrêté pendant sa pause. */
   Ordre image(double t, double tempsJeu)
   {
      Ordre o;
      if (dernierTemps >= 0.0 && tempsJeu > dernierTemps)
      {
         if (!vuAvancer)
            debutAvance = t;
         vuAvancer = true;
         derniereAvance = t;
         if (debutAvance < 0.0)
            debutAvance = t;
      }
      dernierTemps = tempsJeu;
      // Pas de temps de jeu qui avance encore vu : rien ne dit que VPX est en pause (jamais de menu à tort).
      const bool avant = enPause;
      enPause = vuAvancer && t - derniereAvance > PAUSE_APRES_S;
      if (enPause)
         debutAvance = -1.0;
      else if (avant)
         debutAvance = t;
      // Menu de VPX : oublié quand le jeu tourne depuis une seconde.
      if (interfaceVpx && !enPause && debutAvance >= 0.0 && t - debutAvance > 1.0)
         interfaceVpx = false;
      if (enPause && !avant && !interfaceVpx && !quitte)
      {
         menu = true;
         selection = Choix::Reprendre;
         echecReprise = false;
         essaisReprise = 0;
      }
      if (!enPause)
      {
         menu = false;
         essaisReprise = 0;
      }
      // Appui tenu assez longtemps : la partie quitte.
      if (appui && !quitte && t - debut >= QUIT_HOLD_S)
         o.quitter = demanderSortie(t);
      // Reprise demandée qui n'a pas pris : le second moyen, puis le rappel du bouton Pause.
      if (menu && essaisReprise == 1 && t - debutReprise >= REPRISE_RELANCE_S)
      {
         essaisReprise = 2;
         o.reprendre = 2;
      }
      else if (menu && essaisReprise == 2 && t - debutReprise >= REPRISE_ECHEC_S)
      {
         essaisReprise = 3;
         echecReprise = true;
      }
      // Sortie demandée, partie toujours là : on redemande, plus fermement.
      if (quitte && t - derniereSortie >= SORTIE_RELANCE_S)
      {
         derniereSortie = t;
         o.quitter = ++essaisSortie;
      }
      return o;
   }

   void remiseAZero() { *this = Pause {}; }

private:
   int demanderSortie(double t)
   {
      quitte = true;
      menu = false;
      derniereSortie = t;
      essaisSortie = 1;
      return 1;
   }

   bool fiable = true;
   bool appui = false;
   bool menu = false;
   bool quitte = false;
   bool enPause = false;
   bool interfaceVpx = false;
   bool vuAvancer = false;
   bool echecReprise = false;
   double debut = 0.0;
   double dernierTemps = -1.0;
   double derniereAvance = 0.0;
   double debutAvance = -1.0;
   double debutReprise = 0.0;
   double derniereSortie = 0.0;
   int essaisReprise = 0;
   int essaisSortie = 0;
   Choix selection = Choix::Reprendre;
};

// Police 5 × 7, capitales A-Z, chiffres, espace et « : . - / · » : les libellés en très gros, sans fichier d'image.
inline const uint8_t* glyphe(char c)
{
   static const uint8_t lettres[26][7] = {
      { 0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11 }, // A
      { 0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E }, // B
      { 0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E }, // C
      { 0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E }, // D
      { 0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F }, // E
      { 0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10 }, // F
      { 0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F }, // G
      { 0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11 }, // H
      { 0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E }, // I
      { 0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C }, // J
      { 0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11 }, // K
      { 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F }, // L
      { 0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11 }, // M
      { 0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11 }, // N
      { 0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E }, // O
      { 0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10 }, // P
      { 0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D }, // Q
      { 0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11 }, // R
      { 0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E }, // S
      { 0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04 }, // T
      { 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E }, // U
      { 0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04 }, // V
      { 0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A }, // W
      { 0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11 }, // X
      { 0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04 }, // Y
      { 0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F }, // Z
   };
   static const uint8_t chiffres[10][7] = {
      { 0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E }, { 0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E },
      { 0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F }, { 0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E },
      { 0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02 }, { 0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E },
      { 0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E }, { 0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08 },
      { 0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E }, { 0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C },
   };
   static const uint8_t blanc[7] = { 0 };
   static const uint8_t deuxPoints[7] = { 0x00, 0x0C, 0x0C, 0x00, 0x0C, 0x0C, 0x00 };
   static const uint8_t point[7] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C };
   static const uint8_t tiret[7] = { 0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00 };
   static const uint8_t barre[7] = { 0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10 };
   static const uint8_t milieu[7] = { 0x00, 0x00, 0x0E, 0x0E, 0x0E, 0x00, 0x00 };
   switch (c)
   {
   case ':': return deuxPoints;
   case '.': return point;
   case '-': return tiret;
   case '/': return barre;
   case '*': return milieu; // « · » (capitales())
   default: break;
   }
   if (c >= 'a' && c <= 'z')
      c = static_cast<char>(c - 'a' + 'A');
   if (c >= 'A' && c <= 'Z')
      return lettres[c - 'A'];
   if (c >= '0' && c <= '9')
      return chiffres[c - '0'];
   return blanc;
}

/** Les lettres accentuées (UTF-8) ramenées à leur capitale sans accent : É → E, À → A, Ç → C… */
inline std::string capitales(const std::string& s)
{
   std::string out;
   for (size_t i = 0; i < s.size(); i++)
   {
      const unsigned char c = static_cast<unsigned char>(s[i]);
      if (c == 0xC3 && i + 1 < s.size())
      {
         const unsigned char d = static_cast<unsigned char>(s[++i]) | 0x20; // minuscule
         out += d >= 0xA0 && d <= 0xA5 ? 'A' : d == 0xA7 ? 'C' : d >= 0xA8 && d <= 0xAB ? 'E' : d >= 0xAC && d <= 0xAF ? 'I' : d >= 0xB2 && d <= 0xB6 ? 'O' : d >= 0xB9 && d <= 0xBC ? 'U' : ' ';
      }
      else if (c == 0xC2 && i + 1 < s.size() && static_cast<unsigned char>(s[i + 1]) == 0xB7)
      {
         i++;
         out += '*'; // « · », un point centré (glyphe())
      }
      else if (c < 0x80)
         out += static_cast<char>(c >= 'a' && c <= 'z' ? c - 'a' + 'A' : c);
   }
   return out;
}

/**
 * Un libellé en pixels RGBA (blanc sur transparent), `echelle` pixels par point de la police, un
 * point d'espace entre les lettres : largeur et hauteur rendues dans `l` et `h`.
 */
inline std::vector<uint8_t> libelle(const std::string& texte, int echelle, int& l, int& h)
{
   const std::string t = capitales(texte);
   const int n = static_cast<int>(t.size());
   l = n > 0 ? (n * 6 - 1) * echelle : echelle;
   h = 7 * echelle;
   std::vector<uint8_t> px(static_cast<size_t>(l) * h * 4, 0);
   for (int i = 0; i < n; i++)
   {
      const uint8_t* g = glyphe(t[i]);
      for (int y = 0; y < 7; y++)
         for (int x = 0; x < 5; x++)
            if (g[y] & (0x10 >> x))
               for (int dy = 0; dy < echelle; dy++)
                  for (int dx = 0; dx < echelle; dx++)
                  {
                     const size_t p = (static_cast<size_t>(y * echelle + dy) * l + (i * 6 + x) * echelle + dx) * 4;
                     px[p] = px[p + 1] = px[p + 2] = px[p + 3] = 255;
                  }
   }
   return px;
}

} // namespace cyberpinball
