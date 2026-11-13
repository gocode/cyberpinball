// license:GPLv3+
//
// Quand dire à VPX que la fenêtre du DMD a changé de taille (plugin « CyberPinballDmd », dmd-suivi.cpp).
//
// Le plugin ScoreView de VPX 10.8.1 choisit sa mise en page (.scv) à son premier rendu, sur la taille de
// sa fenêtre, et ne la rechoisit que sur « Controller.OnDisplaysChanged » (ScoreView.cpp, OnResChanged,
// m_invalidBestLayout). Le plugin diffuse ce message quand la taille cliente de la fenêtre change :
// - tout de suite, au plus une fois tous les ECART_MIN_S (un réglage tenu au joystick change la taille
//   à chaque image) ;
// - puis une seconde fois quand la taille n'a plus bougé depuis CONFIRMATION_S : VPX peut rendre encore
//   une image à l'ancienne taille de sa surface après la première diffusion ; ScoreView rechoisirait alors
//   sur l'ancienne taille, et la garderait.
// Une fenêtre sans taille (réduite) ne compte pas. Logique seule : banc dans test/banc-suivi-dmd.cpp.

#pragma once

namespace cyberpinball
{

class SuiviTaille
{
public:
   static constexpr double ECART_MIN_S = 0.1;
   static constexpr double CONFIRMATION_S = 0.3;

   /** Taille cliente de la fenêtre vue à l'instant `t` (secondes) ; true : diffuser maintenant. */
   bool vue(int l, int h, double t)
   {
      if (l <= 0 || h <= 0)
         return false;
      if (l != m_l || h != m_h)
      {
         m_l = l;
         m_h = h;
         m_changeA = t;
         m_confirme = false;
         if (t - m_diffuseA < ECART_MIN_S)
            return false;
         m_diffuseA = t;
         return true;
      }
      if (m_confirme || t - m_changeA < CONFIRMATION_S)
         return false;
      m_confirme = true;
      m_diffuseA = t;
      return true;
   }

   /** Nouvelle partie, ou fenêtre perdue : la prochaine taille vue est diffusée. */
   void remiseAZero() { *this = SuiviTaille {}; }

   int largeur() const { return m_l; }
   int hauteur() const { return m_h; }

private:
   int m_l = -1, m_h = -1;
   double m_changeA = 0.0;
   double m_diffuseA = -1e9;
   bool m_confirme = true;
};

} // namespace cyberpinball
