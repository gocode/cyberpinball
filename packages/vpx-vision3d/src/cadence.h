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

/**
 * La cadence de la dernière seconde, dite en direct (mode débogage de Cyber Pinball, 23/11/2026) : l'affichage
 * du mode débogage relit « Cadence live: ... » dans vpinball.log, une ligne par seconde, au lieu d'attendre le
 * bilan de la minute. Allumée seulement quand Cyber Pinball le demande (variable d'environnement de VPX
 * CYBERPINBALL_CADENCE_DIRECTE) : sans elle, aucune ligne de plus dans le journal. Compte tout depuis la première
 * image (pas de démarrage ignoré : le chargement lent d'une table est justement ce qu'on veut voir).
 */
class CadenceDirecte
{
public:
   static constexpr double PERIODE_S = 1.0;
   static constexpr int MAX_ECARTS = 512;

   /** Un écart entre deux images (secondes) arrivé à l'instant `t` ; true : une seconde est finie, `ligne` la dit. */
   bool ecart(double t, double ecartS)
   {
      if (m_debut < 0.0)
         m_debut = t - ecartS;
      const int ms = static_cast<int>(ecartS * 1000.0 + 0.5);
      if (m_n < MAX_ECARTS)
         m_ecarts[m_n++] = ms;
      m_images++;
      if (ms >= A_COUP_MS)
         m_aCoups++;
      m_plusLong = std::max(m_plusLong, ms);
      return t - m_debut >= PERIODE_S;
   }

   /** La ligne de la seconde finie, puis la seconde suivante commence à `t`. */
   void ligne(char* ligne, size_t taille, double t, int memoireMo)
   {
      const double duree = std::max(0.001, t - m_debut);
      int tries[MAX_ECARTS];
      const int n = m_n;
      std::copy(m_ecarts, m_ecarts + n, tries);
      std::sort(tries, tries + n);
      const int p50 = n ? tries[n / 2] : 0;
      const int p99 = n ? tries[std::min(n - 1, static_cast<int>(n * 0.99))] : 0;
      std::snprintf(ligne, taille, "Cadence live: fps=%.1f p50=%dms p99=%dms max=%dms stalls=%d mem=%dMB", m_images / duree, p50, p99, m_plusLong, m_aCoups, memoireMo);
      remiseAZero(t);
   }

   void remiseAZero(double t = -1.0)
   {
      m_debut = t;
      m_n = 0;
      m_images = 0;
      m_aCoups = 0;
      m_plusLong = 0;
   }

private:
   static constexpr int A_COUP_MS = Cadence::A_COUP_MS;
   double m_debut = -1.0;
   int m_n = 0, m_images = 0, m_aCoups = 0, m_plusLong = 0;
   int m_ecarts[MAX_ECARTS] {};
};

} // namespace cyberpinball
