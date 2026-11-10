// license:GPLv3+
//
// Vision 3D : calcul du point de vue de VPX à partir du déplacement de la tête.
//
// Ce fichier ne dépend ni de Windows ni de VPX : il est testé seul par le banc
// (test/banc.cpp).
//
// Repère du déplacement reçu (en centimètres, depuis la position neutre du
// joueur, mesurée au calibrage) :
//   x : vers la droite du joueur
//   y : vers le haut (verticale réelle)
//   z : horizontal, de l'écran (ou du capteur) vers le joueur
//
// Repère « joueur » de VPX (réglages Player X/Y/Z, mode Window) : depuis le bas
// de l'écran du plateau, X à droite, Y vers le joueur (le repère des tables : y croît
// du haut du plateau vers les flippers ; la caméra est en m_bottom + viewY,
// ViewSetup::ComputeMVP), Z vers le haut. Constaté sur la borne le 10/11/2026 : avec
// Y inversé, reculer la tête tordait le plateau vers l'avant. VPX le convertit en position de vue par une rotation
// autour de X (pente de la vitre moins inclinaison de l'écran), puis en unités
// VPX (VPXPlugin.h, CMTOVPU). On applique la même conversion au seul
// déplacement : la position neutre reste exactement celle que VPX a calculée.

#pragma once

#include <cmath>
#include <cstring>

namespace vision3d {

// Modes de vue de VPX (ViewSetup::ViewLayoutMode).
enum ModeVue { MODE_LEGACY = 0, MODE_CAMERA = 1, MODE_WINDOW = 2 };

struct Vec3 { float x, y, z; };

// 1 unité VPX = 1,0625 pouce / 50 (VPXPlugin.h).
inline float cmVersVpu(float cm) { return cm * (float)(50. / (2.54 * 1.0625)); }

// Déplacement de la tête (repère reçu) vers le repère joueur de VPX.
inline Vec3 versRepereJoueur(const Vec3& d) { return Vec3{ d.x, d.z, d.y }; }

// Rotation autour de X à la manière de VPX (Matrix3D::SetRotateX, vecteur ligne).
inline Vec3 tourneX(const Vec3& v, float angle)
{
   const float c = std::cos(angle), s = std::sin(angle);
   return Vec3{ v.x, c * v.y - s * v.z, s * v.y + c * v.z };
}

// Paramètres de la vue de base, lus au début de la partie.
struct VueDeBase
{
   int mode;                 // ModeVue
   Vec3 vue;                 // viewX, viewY, viewZ (unités VPX)
   float hauteurTable;       // VPXTableInfo::tableHeight (= m_bottom)
   float vitreHaut, vitreBas; // windowTopZOfs, windowBottomZOfs
   float inclinaisonEcran;   // degrés
};

// Position de vue pour un déplacement de tête donné.
// gain : amplification (1 = mouvement réel). En mode Window, 1 donne la
// perspective physiquement juste ; en mode Camera (bureau), c'est un effet
// approché, réglable.
inline Vec3 vuePourDeplacement(const VueDeBase& base, const Vec3& deplacementCm, float gain)
{
   const Vec3 d{ deplacementCm.x * gain, deplacementCm.y * gain, deplacementCm.z * gain };
   if (base.mode == MODE_WINDOW)
   {
      const float angle = std::atan2(base.vitreHaut - base.vitreBas, base.hauteurTable)
                        - base.inclinaisonEcran * 3.14159265358979f / 180.f;
      const Vec3 j = tourneX(versRepereJoueur(d), angle);
      return Vec3{ base.vue.x + cmVersVpu(j.x), base.vue.y + cmVersVpu(j.y), base.vue.z + cmVersVpu(j.z) };
   }
   // Modes Camera et Legacy : la caméra suit la tête (droite, vers le joueur, haut).
   return Vec3{ base.vue.x + cmVersVpu(d.x), base.vue.y + cmVersVpu(d.z), base.vue.z + cmVersVpu(d.y) };
}

// Retour progressif à la vue neutre quand le capteur se tait : facteur appliqué
// au dernier déplacement reçu, selon le silence écoulé (secondes).
inline float attenuationSilence(double silence)
{
   const double debut = 0.3, duree = 0.7;
   if (silence <= debut) return 1.f;
   if (silence >= debut + duree) return 0.f;
   const double t = (silence - debut) / duree;
   return (float)(1. - t * t * (3. - 2. * t)); // lissage doux
}

// Paquet UDP au format d'opentrack : 6 doubles (x, y, z en cm, lacet,
// tangage, roulis en degrés), petit-boutiste, 48 octets.
constexpr int TAILLE_PAQUET = 48;

inline bool lirePaquet(const unsigned char* data, int taille, Vec3& sortie)
{
   if (taille != TAILLE_PAQUET) return false;
   double v[3];
   std::memcpy(v, data, sizeof(v)); // Windows x64 et ARM64 sont petit-boutistes
   for (int i = 0; i < 3; i++)
      if (!std::isfinite(v[i]) || std::fabs(v[i]) > 200.) return false; // ± 2 m au plus
   sortie = Vec3{ (float)v[0], (float)v[1], (float)v[2] };
   return true;
}

} // namespace vision3d
