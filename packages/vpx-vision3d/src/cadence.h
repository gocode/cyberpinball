// license:GPLv3+
//
// Cadence des images d'une partie (plugin « CyberPinballDmd », dmd-suivi.cpp), écrite dans vpinball.log.
//
// Une table « qui rame » ne laissait aucune trace : ni le journal de VPX, ni les rapports ne disaient combien
// d'images par seconde la partie tenait (rapports du 17/11/2026, tables reprises d'une autre installation). Le
// plugin compte les images (VPXPI_EVT_ON_PREPARE_FRAME, une par image rendue) et range l'écart entre deux images
// dans un histogramme à la milliseconde : médiane, 95e et 99e centiles, plus long écart, part des images en retard
// (plus de 1,5 fois la médiane), à-coups (au moins A_COUP_MS), et la pire fenêtre de FENETRE_S secondes. Les
// DEMARRAGE_S premières secondes (préparation de la table, premières vidéos) ne comptent pas.
// Cyber Pinball relit la ligne de bilan (packages/core/src/vpxcadence.ts) : même forme, mêmes clés.
// Logique seule : banc dans test/banc-cadence.cpp.

#pragma once

#include <algorithm>
#include <cstdio>

namespace cyberpinball
{

class Cadence
{
public:
   static constexpr double DEMARRAGE_S = 5.0;
   static constexpr double FENETRE_S = 10.0;
   static constexpr int A_COUP_MS = 100;
   static constexpr int MAX_MS = 2000;

   /** Une image rendue à l'instant `t` (secondes, horloge monotone). true : cet écart est un à-coup. */
   bool image(double t)
   {
      if (m_debut < 0.0)
         m_debut = t;
      if (t - m_debut < DEMARRAGE_S)
      {
         m_precedente = t;
         return false;
      }
      if (m_precedente < 0.0 || m_fenetreDebut < 0.0)
      {
         m_precedente = t;
         m_premiere = t;
         m_fenetreDebut = t;
         m_fenetreImages = 0;
         return false;
      }
      const double ecart = t - m_precedente;
      m_precedente = t;
      m_dernier = ecart;
      const int ms = std::clamp(static_cast<int>(ecart * 1000.0 + 0.5), 0, MAX_MS);
      m_histo[ms]++;
      m_ecarts++;
      m_derniere = t;
      m_plusLong = std::max(m_plusLong, ecart);
      const bool aCoup = ms >= A_COUP_MS;
      if (aCoup)
         m_aCoups++;
      m_fenetreImages++;
      if (t - m_fenetreDebut >= FENETRE_S)
      {
         const double ips = m_fenetreImages / (t - m_fenetreDebut);
         if (m_pireFenetre < 0.0 || ips < m_pireFenetre)
            m_pireFenetre = ips;
         m_fenetreDebut = t;
         m_fenetreImages = 0;
      }
      return aCoup;
   }

   int ecarts() const { return m_ecarts; }
   int aCoups() const { return m_aCoups; }
   double duree() const { return m_ecarts ? m_derniere - m_premiere : 0.0; }
   double imagesParSeconde() const { return duree() > 0.0 ? m_ecarts / duree() : 0.0; }
   double plusLong() const { return m_plusLong; }
   double dernierEcart() const { return m_dernier; }
   double tempsDePartie(double t) const { return m_debut < 0.0 ? 0.0 : t - m_debut; }

   /** Écart (ms) sous lequel tombe la part `p` (0..1) des écarts. */
   int centile(double p) const
   {
      if (!m_ecarts)
         return 0;
      const long long rang = std::max(1LL, static_cast<long long>(p * m_ecarts + 0.999999));
      long long vus = 0;
      for (int ms = 0; ms <= MAX_MS; ms++)
         if ((vus += m_histo[ms]) >= rang)
            return ms;
      return MAX_MS;
   }

   /** Part (0..1) des écarts de plus de 1,5 fois la médiane : images en retard sur la cadence de la partie. */
   double enRetard() const
   {
      if (!m_ecarts)
         return 0.0;
      const int seuil = std::max(1, centile(0.5)) * 3 / 2;
      long long n = 0;
      for (int ms = seuil + 1; ms <= MAX_MS; ms++)
         n += m_histo[ms];
      return static_cast<double>(n) / m_ecarts;
   }

   /** Pire fenêtre de FENETRE_S secondes (images par seconde) ; -1 si la partie n'en a pas eu une entière. */
   double pireFenetre() const { return m_pireFenetre; }

   /** La ligne de bilan, relue par Cyber Pinball (vpxcadence.ts). */
   void bilan(char* ligne, size_t taille, const char* quand) const
   {
      std::snprintf(ligne, taille, "Cadence %s: frames=%d duration=%.1fs fps=%.1f p50=%dms p95=%dms p99=%dms max=%dms late=%.1f%% stalls=%d worst10s=%.1ffps", quand, m_ecarts, duree(),
         imagesParSeconde(), centile(0.5), centile(0.95), centile(0.99), static_cast<int>(m_plusLong * 1000.0 + 0.5), enRetard() * 100.0, m_aCoups, m_pireFenetre);
   }

   void remiseAZero() { *this = Cadence {}; }

private:
   double m_debut = -1.0, m_precedente = -1.0, m_premiere = -1.0, m_derniere = -1.0, m_dernier = 0.0;
   double m_plusLong = 0.0;
   double m_fenetreDebut = -1.0, m_pireFenetre = -1.0;
   int m_fenetreImages = 0;
   int m_ecarts = 0, m_aCoups = 0;
   int m_histo[MAX_MS + 1] {};
};

} // namespace cyberpinball
