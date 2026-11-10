// license:GPLv3+
//
// Pause dans le casque (plugin VPX « CyberPinball ») : logique pure, sans VPX, testée par le banc.
//
// Bouton Pause : un appui court ouvre la pause (« Reprendre » / « Quitter »), un appui tenu
// QUIT_HOLD_S quitte la partie, avec une jauge qui se remplit ; lâcher avant annule.

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace cyberpinball {

/** Durée d'appui sur Pause pour quitter (secondes). */
constexpr double QUIT_HOLD_S = 1.5;

enum class Choix { Reprendre, Quitter };

/** Ce que la pause demande à VPX après un événement. */
struct Ordre
{
   bool pauserVpx = false;   // mettre VPX en pause (action Pause injectée)
   bool reprendreVpx = false; // sortir VPX de la pause
   bool quitter = false;     // quitter la partie (action ExitGame injectée)
};

class Pause
{
public:
   bool ouverte() const { return menu; }
   bool appuiEnCours() const { return appui; }
   Choix choix() const { return selection; }
   /** Remplissage de la jauge (0 à 1) pendant l'appui tenu. */
   double jauge(double maintenant) const
   {
      if (!appui)
         return 0.0;
      const double t = (maintenant - debut) / QUIT_HOLD_S;
      return t < 0.0 ? 0.0 : (t > 1.0 ? 1.0 : t);
   }
   /** Le fronton est à la pause : pendant l'appui tenu ou le menu ouvert, sinon il est rendu aux autres. */
   bool affichee() const { return menu || (appui && !quitte); }

   Ordre bouton(bool presse, double maintenant)
   {
      Ordre o;
      if (presse)
      {
         if (!appui)
         {
            appui = true;
            debut = maintenant;
         }
         return o;
      }
      if (!appui)
         return o;
      appui = false;
      if (quitte)
         return o;
      // Appui court : ouvre la pause, ou la ferme (reprendre).
      if (menu)
      {
         menu = false;
         o.reprendreVpx = true;
      }
      else
      {
         menu = true;
         selection = Choix::Reprendre;
         o.pauserVpx = true;
      }
      return o;
   }

   /** À chaque image : l'appui tenu assez longtemps quitte. */
   Ordre image(double maintenant)
   {
      Ordre o;
      if (appui && !quitte && maintenant - debut >= QUIT_HOLD_S)
      {
         quitte = true;
         menu = false;
         o.quitter = true;
      }
      return o;
   }

   /** Dans le menu : flippers pour choisir, valider (Start) pour confirmer. */
   void gauche()
   {
      if (menu)
         selection = Choix::Reprendre;
   }
   void droite()
   {
      if (menu)
         selection = Choix::Quitter;
   }
   Ordre valider()
   {
      Ordre o;
      if (!menu)
         return o;
      menu = false;
      if (selection == Choix::Quitter)
      {
         quitte = true;
         o.quitter = true;
      }
      else
         o.reprendreVpx = true;
      return o;
   }

   void remiseAZero() { *this = Pause {}; }

private:
   bool appui = false;
   bool menu = false;
   bool quitte = false;
   double debut = 0.0;
   Choix selection = Choix::Reprendre;
};

// Police 5 × 7, capitales A-Z, chiffres et espace : les libellés en très gros, sans fichier d'image.
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
