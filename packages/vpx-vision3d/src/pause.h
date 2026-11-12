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
/**
 * Durée d'appui des deux joysticks enfoncés ensemble pour caler la borne en partie (secondes) : les deux
 * clics des joysticks ne servent à rien d'autre (manettes.ts, CALIBRATION_COMBO), et un geste en jouant ne
 * la déclenche pas (demande du 12 novembre 2026 : 3 s, plus long que Quitter).
 */
constexpr double CALAGE_HOLD_S = 3.0;
/** Images laissées à VPX entre son alignement sur les manettes et son arrêt (VRDevice::RenderFrame, à chaque image). */
constexpr int CALAGE_IMAGES = 4;
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
   Gauche,    // flipper gauche, joystick à gauche : choix précédent ; réglage : à gauche
   Droite,    // flipper droit, joystick à droite : choix suivant ; réglage : à droite
   Moins,     // MagnaSave gauche (poignée) : comme Gauche au menu ; réglage : plus petit
   Plus,      // MagnaSave droit (poignée) : comme Droite au menu ; réglage : plus grand
   Retour,    // crédit (B des manettes du casque) : revient d'un cran du réglage des écrans
   Jeu,       // une action de la table (lancer, secousses, crédit…) : gardée pendant le menu
   CalageG,   // clic du joystick gauche (porteur Custom1, sans autre fonction) : moitié de la combinaison du calage
   CalageD,   // clic du joystick droit (porteur Custom2) : l'autre moitié
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
/** Les gâchettes (flippers, et leur second temps : actions 0 à 3) : elles calent la borne à l'étape du calage. */
inline bool estGachette(int id) { return id >= 0 && id <= 3; }

inline Commande commandeVpx1081(int id, int& lieeA)
{
   static const struct { Commande c; int api; } table[] = {
      { Commande::Gauche, api::LeftFlipper },        // 0 LeftFlipper
      { Commande::Droite, api::RightFlipper },       // 1 RightFlipper
      { Commande::Gauche, api::StagedLeftFlipper },  // 2 LeftStagedFlipper
      { Commande::Droite, api::StagedRightFlipper }, // 3 RightStagedFlipper
      { Commande::Moins, api::LeftMagnaSave },       // 4 LeftMagna
      { Commande::Plus, api::RightMagnaSave },       // 5 RightMagna
      { Commande::Haut, -1 },                        // 6 UIUp (joystick vers le haut)
      { Commande::Bas, -1 },                         // 7 UIDown
      { Commande::Gauche, -1 },                      // 8 UILeft
      { Commande::Droite, -1 },                      // 9 UIRight
      { Commande::Jeu, api::LaunchBall },            // 10 LaunchBall
      { Commande::Jeu, api::LeftNudge },             // 11 LeftNudge
      { Commande::Jeu, api::RightNudge },            // 12 RightNudge
      { Commande::Jeu, api::CenterNudge },           // 13 CenterNudge
      { Commande::Jeu, api::Tilt },                  // 14 Tilt
      { Commande::Retour, api::AddCredit },          // 15 Credit1 (B des manettes du casque, XRInputHandler)
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
      // 26 VolumeDown … 51 ToggleStereo : jamais avalées.
      { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, // 26-29
      { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, // 30-33
      { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, // 34-37
      { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, // 38-41
      { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, // 42-45
      { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 }, // 46-49
      { Commande::Inconnue, -1 }, { Commande::Inconnue, -1 },                                                         // 50-51
      { Commande::CalageG, -1 },                     // 52 Custom1 (clic du joystick gauche, lié par Cyber Pinball)
      { Commande::CalageD, -1 },                     // 53 Custom2 (clic du joystick droit)
   };
   if (id < 0 || id >= static_cast<int>(sizeof(table) / sizeof(table[0])))
   {
      lieeA = -1;
      return Commande::Inconnue;
   }
   lieeA = table[id].api;
   return table[id].c;
}

/**
 * Fronton cadré : un rectangle (x, y, l, h) de la surface d'un rendu (sw × sh) posé dans celle du fronton
 * (W × H), proportions gardées, centré ; les bandes restent au fond du fronton.
 */
struct Rect
{
   float x, y, l, h;
};
inline Rect cadrer(float sw, float sh, float W, float H, Rect r)
{
   if (sw <= 0.f || sh <= 0.f)
      return r;
   const float s = (W / sw < H / sh) ? W / sw : H / sh;
   const float ox = (W - sw * s) / 2.f, oy = (H - sh * s) / 2.f;
   return { ox + r.x * s, oy + r.y * s, r.l * s, r.h * s };
}

/**
 * DMD de la pièce VR (règle du 12 novembre 2026 : le cadre DMD d'une pièce VR ne reste jamais gris). VPX
 * 10.8.1 n'y montre qu'une source d'affichage de contrôleur (flasher en mode DMD, « ctrl://default/display »,
 * la plus grande) ; le plugin PuP n'en publie aucune et son FullDMD n'est dessiné que dans la fenêtre
 * ScoreView, jamais rendue en VR (City Hunter : un cadre gris). Le plugin publie donc la sienne : l'écran
 * DMD de PuP (ou l'image du DMD) dessiné en logiciel dans une image RGB, ici.
 */
constexpr int SALLE_DMD_L = 512, SALLE_DMD_H = 288;

/** Texture lue en mémoire (VPXTextureInfo) ; formats dans l'ordre de VPXTextureFormat. */
enum class FormatTexture { Lum32F = 0, Rgb8 = 1, Rgba8 = 2, Rgb565 = 3 };
struct TextureLue
{
   unsigned int l = 0, h = 0;
   FormatTexture format = FormatTexture::Rgba8;
   const void* data = nullptr;
};

/**
 * La partie (texX, texY, texW, texH) d'une texture posée dans le rectangle (dx, dy, dw, dh) d'une image RGB
 * L × H : échantillon au plus proche, teinte et alpha (celui de la texture compris), mélange sur le fond.
 */
inline void poserTexture(std::vector<uint8_t>& rgb, int L, int H, const TextureLue& t, float tr, float tg, float tb, float alpha, float texX, float texY, float texW, float texH, float dx,
   float dy, float dw, float dh)
{
   if (!t.data || t.l == 0 || t.h == 0 || dw <= 0.f || dh <= 0.f || texW == 0.f || texH == 0.f || alpha <= 0.f || rgb.size() < static_cast<size_t>(L) * H * 3)
      return;
   auto borne = [](float v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : static_cast<int>(v); };
   const int x0 = borne(dx, 0, L), x1 = borne(dx + dw + 0.999f, 0, L), y0 = borne(dy, 0, H), y1 = borne(dy + dh + 0.999f, 0, H);
   const float teinte[3] = { tr, tg, tb };
   for (int y = y0; y < y1; y++)
   {
      const float v = texY + (static_cast<float>(y) + 0.5f - dy) / dh * texH;
      if (v < 0.f || v >= static_cast<float>(t.h))
         continue;
      const unsigned int ty = static_cast<unsigned int>(v);
      for (int x = x0; x < x1; x++)
      {
         const float u = texX + (static_cast<float>(x) + 0.5f - dx) / dw * texW;
         if (u < 0.f || u >= static_cast<float>(t.l))
            continue;
         const size_t i = static_cast<size_t>(ty) * t.l + static_cast<unsigned int>(u);
         float c[3], a = 1.f;
         switch (t.format)
         {
         case FormatTexture::Lum32F:
            c[0] = c[1] = c[2] = static_cast<const float*>(t.data)[i] * 255.f;
            break;
         case FormatTexture::Rgb8:
            for (int k = 0; k < 3; k++)
               c[k] = static_cast<const uint8_t*>(t.data)[i * 3 + k];
            break;
         case FormatTexture::Rgba8:
            for (int k = 0; k < 3; k++)
               c[k] = static_cast<const uint8_t*>(t.data)[i * 4 + k];
            a = static_cast<const uint8_t*>(t.data)[i * 4 + 3] / 255.f;
            break;
         case FormatTexture::Rgb565:
         {
            const uint16_t p = static_cast<const uint16_t*>(t.data)[i];
            c[0] = ((p >> 11) & 31) * 255.f / 31.f;
            c[1] = ((p >> 5) & 63) * 255.f / 63.f;
            c[2] = (p & 31) * 255.f / 31.f;
            break;
         }
         }
         a *= alpha;
         if (a <= 0.f)
            continue;
         if (a > 1.f)
            a = 1.f;
         uint8_t* d = &rgb[(static_cast<size_t>(y) * L + x) * 3];
         for (int k = 0; k < 3; k++)
         {
            float s = c[k] * teinte[k];
            s = s > 255.f ? 255.f : s < 0.f ? 0.f : s;
            d[k] = static_cast<uint8_t>(d[k] + (s - d[k]) * a + 0.5f);
         }
      }
   }
}

/**
 * Remplir un cadre (règle du 12 novembre 2026 : chaque source, PuP, B2S, DMD, image, remplit la partie
 * visible de son cadre, pour toute table, sans valeur propre à une table). Le rectangle (x, y, l, h) d'une
 * surface sw × sh posé dans un cadre W × H : proportions gardées, le cadre rempli en rognant au plus
 * ROGNE_MAX de la source sur un axe (au-delà, des bandes : jamais de forme trahie). Centré en largeur, posé
 * en bas quand il reste de la hauteur (le fronton repose sur le DMD, comme sur une borne), centré quand il
 * est rogné. `g` : le réglage du joueur (décalage en part du cadre, taille), appliqué par-dessus.
 */
constexpr float ROGNE_MAX = 0.12f;

struct Reglage
{
   float dx = 0.f, dy = 0.f, taille = 1.f;
};
constexpr float REGLAGE_PAS = 0.01f, REGLAGE_PAS_TAILLE = 0.02f, REGLAGE_TAILLE_MIN = 0.5f, REGLAGE_TAILLE_MAX = 1.6f, REGLAGE_DECALAGE_MAX = 0.5f;

inline Rect remplir(float sw, float sh, float W, float H, Rect r, Reglage g = {})
{
   if (sw <= 0.f || sh <= 0.f || W <= 0.f || H <= 0.f)
      return r;
   const float contenir = (W / sw < H / sh) ? W / sw : H / sh;
   const float couvrir = (W / sw > H / sh) ? W / sw : H / sh;
   const float limite = contenir / (1.f - ROGNE_MAX);
   const float s = (couvrir < limite ? couvrir : limite) * g.taille;
   const float w = sw * s, h = sh * s;
   const float ox = (W - w) / 2.f + g.dx * W;
   const float oy = (h <= H ? H - h : (H - h) / 2.f) + g.dy * H;
   return { ox + r.x * s, oy + r.y * s, r.l * s, r.h * s };
}

/** Part du cadre W × H couverte par le rectangle r (0 à 1) : la mesure du remplissage. */
inline float couverture(const Rect& r, float W, float H)
{
   if (W <= 0.f || H <= 0.f)
      return 0.f;
   const float x0 = r.x > 0.f ? r.x : 0.f, y0 = r.y > 0.f ? r.y : 0.f;
   const float x1 = r.x + r.l < W ? r.x + r.l : W, y1 = r.y + r.h < H ? r.y + r.h : H;
   return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) / (W * H) : 0.f;
}

/** Un cadre bien rempli : au moins cette part (sinon dit au journal et dans la santé de la borne). */
constexpr float REMPLI_MIN = 0.85f;

/** Le rectangle qui englobe deux autres (l = 0 : vide). */
inline Rect englober(const Rect& a, const Rect& b)
{
   if (a.l <= 0.f || a.h <= 0.f)
      return b;
   if (b.l <= 0.f || b.h <= 0.f)
      return a;
   const float x0 = a.x < b.x ? a.x : b.x, y0 = a.y < b.y ? a.y : b.y;
   const float x1 = a.x + a.l > b.x + b.l ? a.x + a.l : b.x + b.l, y1 = a.y + a.h > b.y + b.h ? a.y + a.h : b.y + b.h;
   return { x0, y0, x1 - x0, y1 - y0 };
}

/** Réglage « dx,dy,taille » lu d'un texte (point décimal) ; le neutre s'il ne tient pas debout. */
inline Reglage lireReglage(const std::string& texte)
{
   float v[3] = { 0.f, 0.f, 1.f };
   size_t debut = 0;
   for (int i = 0; i < 3; i++)
   {
      const size_t fin = texte.find(',', debut);
      const std::string part = texte.substr(debut, fin == std::string::npos ? std::string::npos : fin - debut);
      // Point décimal quelle que soit la langue du système (strtof suivrait la locale).
      float x = 0.f, f = 0.f;
      bool chiffre = false, negatif = false;
      size_t k = 0;
      if (k < part.size() && (part[k] == '-' || part[k] == '+'))
         negatif = part[k++] == '-';
      for (; k < part.size(); k++)
      {
         const char ch = part[k];
         if (ch == '.' && f == 0.f)
            f = 1.f;
         else if (ch >= '0' && ch <= '9')
         {
            chiffre = true;
            if (f > 0.f)
               x += (ch - '0') * (f *= 0.1f);
            else
               x = x * 10.f + (ch - '0');
         }
         else
            return {};
      }
      if (!chiffre)
         return {};
      if (negatif)
         x = -x;
      v[i] = x;
      if (fin == std::string::npos && i < 2)
         return {};
      debut = fin == std::string::npos ? texte.size() : fin + 1;
   }
   if (v[0] < -REGLAGE_DECALAGE_MAX || v[0] > REGLAGE_DECALAGE_MAX || v[1] < -REGLAGE_DECALAGE_MAX || v[1] > REGLAGE_DECALAGE_MAX || v[2] < REGLAGE_TAILLE_MIN || v[2] > REGLAGE_TAILLE_MAX)
      return {};
   return { v[0], v[1], v[2] };
}

/** Les écrans que le joueur peut ajuster dans la pause. */
enum class Ecran { Fronton = 0, Dmd = 1 };

enum class Choix { Reprendre, Ajuster, Caler, Quitter };
/** Les choix du menu de la pause, dans leur ordre à l'écran. */
constexpr Choix CHOIX[4] = { Choix::Reprendre, Choix::Ajuster, Choix::Caler, Choix::Quitter };

/** Où en est la pause : le menu, le choix de l'écran à ajuster, son réglage, ou le calage de la borne. */
enum class Etape { Menu, ChoixEcran, Reglage, Calage };

/** Ce que la pause demande au plugin. */
struct Ordre
{
   int reprendre = 0; // essai de reprise : 1 le premier moyen, 2 le second (0 rien)
   int quitter = 0;   // demande de sortie : 1 la première (ExitGame), 2 et plus de plus en plus ferme
   bool garder = false; // réglage d'un écran validé (A) : à enregistrer pour cette table
   bool pause = false;  // mettre VPX en pause (combinaison du calage tenue pendant le jeu)
   bool caler = false;  // aligner la table de VPX sur les manettes, maintenant (gâchette à l'étape du calage)
};

class Pause
{
public:
   /** Le plugin n'est plus sûr des actions (table et VPX en désaccord) : il n'avale plus rien. */
   void passif() { fiable = false; }
   bool estFiable() const { return fiable; }

   bool vpxEnPause() const { return enPause; }
   Etape etape() const { return menuVisible() ? etapeCourante : Etape::Menu; }
   Ecran ecran() const { return ecranChoisi; }
   /** Le DMD est-il là à ajuster (bande sous le fronton, cadre de la pièce) ? Sinon, le fronton seul. */
   void dmdAjustable(bool oui) { dmdPresent = oui; }
   bool dmdAjustable() const { return dmdPresent; }
   /** Les réglages enregistrés de la table ([Plugin.CyberPinball] Adjust), en début de partie. */
   void poserReglage(Ecran e, Reglage g) { reglages[static_cast<int>(e)] = g; }
   /** Le réglage en vigueur : celui en cours de réglage (aperçu en direct), sinon l'enregistré. */
   Reglage reglage(Ecran e) const
   {
      return etape() == Etape::Reglage && ecranChoisi == e ? brouillon : reglages[static_cast<int>(e)];
   }
   bool menuVisible() const { return menu && !quitte; }
   bool appuiEnCours() const { return appui; }
   /** La combinaison du calage (deux joysticks enfoncés) : tenue, remplissage de sa jauge, visible. */
   bool comboTenue() const { return comboG && comboD && !quitte; }
   double jaugeCalage(double t) const
   {
      if (!comboTenue() || comboDeclenche)
         return 0.0;
      const double r = (t - debutCombo) / CALAGE_HOLD_S;
      return r < 0.0 ? 0.0 : (r > 1.0 ? 1.0 : r);
   }
   bool jaugeCalageVisible(double t) const { return comboTenue() && !comboDeclenche && fiable && t - debutCombo >= JAUGE_APRES_S; }
   /** Calages faits depuis l'ouverture de l'étape du calage (la table est déjà sur la barre). */
   int calagesFaits() const { return calages; }
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
   bool affichee(double t) const { return jaugeVisible(t) || jaugeCalageVisible(t) || menuVisible(); }

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
      // Les porteurs de la combinaison n'ont pas d'autre rôle : jamais rien pour la table.
      if (c == Commande::CalageG || c == Commande::CalageD)
         return true;
      return menuVisible();
   }

   /** Une action de VPX (numéro déjà traduit) ; `gachette` : un flipper (estGachette). */
   Ordre action(Commande c, bool presse, double t, bool gachette = false)
   {
      Ordre o;
      switch (c)
      {
      case Commande::CalageG:
      case Commande::CalageD:
         (c == Commande::CalageG ? comboG : comboD) = presse;
         if (comboG && comboD && presse)
         {
            debutCombo = t;
            comboDeclenche = false;
         }
         return o;
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
      if (etapeCourante == Etape::Calage)
      {
         // Gâchette : la table de VPX s'aligne sur les manettes posées sur la barre avant (autant de fois
         // qu'on veut) ; A ou B : la partie reprend, le dernier calage reste.
         if (gachette)
         {
            calages++;
            o.caler = true;
         }
         else if (c == Commande::Valider || c == Commande::Retour)
            o.reprendre = lancerReprise(t);
         return o;
      }
      if (etapeCourante == Etape::ChoixEcran)
      {
         switch (c)
         {
         case Commande::Haut:
         case Commande::Gauche:
         case Commande::Moins: ecranChoisi = Ecran::Fronton; break;
         case Commande::Bas:
         case Commande::Droite:
         case Commande::Plus:
            if (dmdPresent)
               ecranChoisi = Ecran::Dmd;
            break;
         case Commande::Valider:
            brouillon = reglages[static_cast<int>(ecranChoisi)];
            etapeCourante = Etape::Reglage;
            break;
         case Commande::Retour: etapeCourante = Etape::Menu; break;
         default: break;
         }
         return o;
      }
      if (etapeCourante == Etape::Reglage)
      {
         auto borner = [](float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; };
         switch (c)
         {
         case Commande::Haut: brouillon.dy = borner(brouillon.dy - REGLAGE_PAS, -REGLAGE_DECALAGE_MAX, REGLAGE_DECALAGE_MAX); break;
         case Commande::Bas: brouillon.dy = borner(brouillon.dy + REGLAGE_PAS, -REGLAGE_DECALAGE_MAX, REGLAGE_DECALAGE_MAX); break;
         case Commande::Gauche: brouillon.dx = borner(brouillon.dx - REGLAGE_PAS, -REGLAGE_DECALAGE_MAX, REGLAGE_DECALAGE_MAX); break;
         case Commande::Droite: brouillon.dx = borner(brouillon.dx + REGLAGE_PAS, -REGLAGE_DECALAGE_MAX, REGLAGE_DECALAGE_MAX); break;
         case Commande::Moins: brouillon.taille = borner(brouillon.taille - REGLAGE_PAS_TAILLE, REGLAGE_TAILLE_MIN, REGLAGE_TAILLE_MAX); break;
         case Commande::Plus: brouillon.taille = borner(brouillon.taille + REGLAGE_PAS_TAILLE, REGLAGE_TAILLE_MIN, REGLAGE_TAILLE_MAX); break;
         case Commande::Valider:
            reglages[static_cast<int>(ecranChoisi)] = brouillon;
            o.garder = true;
            etapeCourante = Etape::ChoixEcran;
            break;
         case Commande::Retour: etapeCourante = Etape::ChoixEcran; break;
         default: break;
         }
         return o;
      }
      int i = 0;
      while (i < 3 && CHOIX[i] != selection)
         i++;
      switch (c)
      {
      case Commande::Haut:
      case Commande::Gauche:
      case Commande::Moins: selection = CHOIX[i > 0 ? i - 1 : 0]; break;
      case Commande::Bas:
      case Commande::Droite:
      case Commande::Plus: selection = CHOIX[i < 3 ? i + 1 : 3]; break;
      case Commande::Valider:
         if (selection == Choix::Quitter)
            o.quitter = demanderSortie(t);
         else if (selection == Choix::Ajuster)
         {
            etapeCourante = Etape::ChoixEcran;
            ecranChoisi = Ecran::Fronton;
         }
         else if (selection == Choix::Caler)
            ouvrirCalage();
         else
            o.reprendre = lancerReprise(t);
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
         etapeCourante = Etape::Menu;
         selection = Choix::Reprendre;
         echecReprise = false;
         essaisReprise = 0;
         // Pause demandée par la combinaison du calage : la partie s'arrête directement sur le calage.
         if (calageAttendu)
            ouvrirCalage();
      }
      // Combinaison du calage tenue assez longtemps : la pause (si la partie tourne), puis le calage.
      if (comboTenue() && !comboDeclenche && fiable && t - debutCombo >= CALAGE_HOLD_S)
      {
         comboDeclenche = true;
         if (menuVisible())
            ouvrirCalage();
         else if (!enPause)
         {
            calageAttendu = true;
            o.pause = true;
         }
      }
      if (!enPause)
      {
         menu = false;
         essaisReprise = 0;
         // Une pause demandée qui ne vient pas en 2 s : oubliée (jamais de calage surgi plus tard).
         if (calageAttendu && t - debutCombo > CALAGE_HOLD_S + 2.0)
            calageAttendu = false;
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

   /** Nouvelle partie : tout repart (les réglages des écrans sont reposés ensuite depuis l'INI). */
   void remiseAZero() { *this = Pause {}; }

private:
   void ouvrirCalage()
   {
      etapeCourante = Etape::Calage;
      calageAttendu = false;
      calages = 0;
   }

   int lancerReprise(double t)
   {
      debutReprise = t;
      essaisReprise = 1;
      echecReprise = false;
      return 1;
   }

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
   Etape etapeCourante = Etape::Menu;
   Ecran ecranChoisi = Ecran::Fronton;
   bool dmdPresent = false;
   bool comboG = false, comboD = false, comboDeclenche = false, calageAttendu = false;
   double debutCombo = 0.0;
   int calages = 0;
   Reglage reglages[2] {};
   Reglage brouillon {};
};

// PNG sans compression (blocs « stockés » de deflate) : les captures de diagnostic du plugin, sans bibliothèque.
inline uint32_t crc32Png(const uint8_t* d, size_t n)
{
   uint32_t c = 0xFFFFFFFFu;
   for (size_t i = 0; i < n; i++)
   {
      c ^= d[i];
      for (int k = 0; k < 8; k++)
         c = (c >> 1) ^ (0xEDB88320u & (0u - (c & 1u)));
   }
   return c ^ 0xFFFFFFFFu;
}

/** Une image RGB (w × h × 3 octets) en fichier PNG. */
inline std::vector<uint8_t> encoderPng(int w, int h, const std::vector<uint8_t>& rgb)
{
   std::vector<uint8_t> brut;
   brut.reserve(static_cast<size_t>(h) * (static_cast<size_t>(w) * 3 + 1));
   for (int y = 0; y < h; y++)
   {
      brut.push_back(0);
      brut.insert(brut.end(), rgb.begin() + static_cast<size_t>(y) * w * 3, rgb.begin() + static_cast<size_t>(y + 1) * w * 3);
   }
   std::vector<uint8_t> z { 0x78, 0x01 };
   uint32_t a = 1, b = 0;
   for (uint8_t v : brut)
   {
      a = (a + v) % 65521;
      b = (b + a) % 65521;
   }
   size_t pos = 0;
   do
   {
      const size_t n = brut.size() - pos < 65535 ? brut.size() - pos : 65535;
      z.push_back(pos + n >= brut.size() ? 1 : 0);
      z.push_back(static_cast<uint8_t>(n));
      z.push_back(static_cast<uint8_t>(n >> 8));
      z.push_back(static_cast<uint8_t>(~n));
      z.push_back(static_cast<uint8_t>(~n >> 8));
      z.insert(z.end(), brut.begin() + pos, brut.begin() + pos + n);
      pos += n;
   } while (pos < brut.size());
   const uint32_t adler = (b << 16) | a;
   for (int k = 3; k >= 0; k--)
      z.push_back(static_cast<uint8_t>(adler >> (8 * k)));
   std::vector<uint8_t> out { 137, 80, 78, 71, 13, 10, 26, 10 };
   const auto u32 = [&out](uint32_t v)
   {
      for (int k = 3; k >= 0; k--)
         out.push_back(static_cast<uint8_t>(v >> (8 * k)));
   };
   const auto bloc = [&](const char* type, const std::vector<uint8_t>& d)
   {
      u32(static_cast<uint32_t>(d.size()));
      const size_t debut = out.size();
      out.insert(out.end(), type, type + 4);
      out.insert(out.end(), d.begin(), d.end());
      u32(crc32Png(out.data() + debut, out.size() - debut));
   };
   std::vector<uint8_t> ihdr(13, 0);
   for (int k = 0; k < 4; k++)
   {
      ihdr[k] = static_cast<uint8_t>(static_cast<uint32_t>(w) >> (24 - 8 * k));
      ihdr[4 + k] = static_cast<uint8_t>(static_cast<uint32_t>(h) >> (24 - 8 * k));
   }
   ihdr[8] = 8; // 8 bits par composante
   ihdr[9] = 2; // RGB
   bloc("IHDR", ihdr);
   bloc("IDAT", z);
   bloc("IEND", {});
   return out;
}

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
