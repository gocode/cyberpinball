// license:GPLv3+
//
// Où était VPX pendant un à-coup (plugin « CyberPinballDmd », dmd-suivi.cpp).
//
// Le bilan de la cadence (cadence.h) dit qu'une partie s'arrête, pas pourquoi : chez un joueur (rapport du
// 18/11/2026, Daredevil), des rafales d'arrêts de 800 ms sans une ligne dans vpinball.log. Tant qu'une image tarde
// (plus de SEUIL_MS depuis la précédente), un fil de veille relève toutes les quelques millisecondes où en est le fil
// qui prépare les images : il le suspend un instant, lit ses registres et copie le haut de sa pile, le relance, puis
// range l'adresse en cours (« dans ») et le premier module hors de Windows trouvé sur la pile (« sous ») par module
// (DLL ou exécutable). À l'à-coup, la ligne du journal le dit : « in vbscript.dll 60, ntdll.dll 20 ; under
// VPinballX64.exe 70… ; top VPinballX64.exe+0x12ab30 » (position à rapprocher des symboles de la version de VPX).
// Rien n'est relevé tant que les images arrivent à l'heure.
// Le fil du rendu aussi (rapport du 21/11/2026) : avec BGFX, VPX 10.8 dessine dans un fil à part, « RenderThread »
// (RenderDevice.cpp), et la boucle de jeu l'attend en dormant par tranches de 0,1 ms (uOverSleep → SDL_DelayNS) tant
// qu'il n'a pas pris l'image précédente. Un arrêt du rendu ne montrait donc que « SDL364.dll » côté boucle de jeu. Ce
// fil, retrouvé par son nom, est relevé en même temps ; la ligne ajoute « | render thread N samples: … ».
// Sûreté : pendant que le fil est suspendu, la veille n'appelle rien qui prenne un verrou de l'espace utilisateur
// (ni allocation, ni chargeur, ni journal) : GetThreadContext, VirtualQuery et une copie dans un tampon fait
// d'avance. Tout le reste (modules, comptes) se fait une fois le fil relancé.
// Logique de comptage seule (sans Windows) : Comptes, banc dans test/banc-arrets.cpp.

#pragma once

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>

namespace cyberpinball
{

/** Les relevés d'un arrêt, comptés par nom de module ; et la position la plus vue. */
class Comptes
{
public:
   static constexpr int NOMS = 12;
   static constexpr int POSITIONS = 48;

   void ajouter(const char* dans, const char* sous, const char* modulePosition, uint64_t position)
   {
      m_releves++;
      // Actif : le fil était ailleurs que dans les attentes de Windows (ntdll, win32u, KERNELBASE).
      if (dans && std::strcmp(dans, "ntdll.dll") != 0 && std::strcmp(dans, "win32u.dll") != 0 && std::strcmp(dans, "KERNELBASE.dll") != 0)
         m_actifs++;
      compter(m_dans, dans);
      compter(m_sous, sous);
      if (!modulePosition || !*modulePosition)
         return;
      for (Position& p : m_positions)
         if (p.n && p.adresse == position && std::strcmp(p.module, modulePosition) == 0)
         {
            p.n++;
            return;
         }
      for (Position& p : m_positions)
         if (!p.n)
         {
            p = Position {};
            std::snprintf(p.module, sizeof(p.module), "%s", modulePosition);
            p.adresse = position;
            p.n = 1;
            return;
         }
   }

   int releves() const { return m_releves; }
   /** Relevés où le fil travaillait (hors attentes de Windows). */
   int actifs() const { return m_actifs; }

   /** « N samples: in a 60, b 20; under c 70; top c+0x1234 (40) » ; vide sans relevé. */
   void dire(char* ligne, size_t taille) const
   {
      if (!taille)
         return;
      ligne[0] = '\0';
      if (!m_releves)
         return;
      size_t n = 0;
      auto ajoute = [&](const char* format, auto... valeurs)
      {
         if (n < taille)
         {
            const int k = std::snprintf(ligne + n, taille - n, format, valeurs...);
            if (k > 0)
               n = std::min(taille - 1, n + static_cast<size_t>(k));
         }
      };
      ajoute("%d samples: in", m_releves);
      liste(m_dans, ajoute);
      ajoute("; under");
      liste(m_sous, ajoute);
      const Position* haut = nullptr;
      for (const Position& p : m_positions)
         if (p.n && (!haut || p.n > haut->n))
            haut = &p;
      if (haut)
         ajoute("; top %s+0x%llx (%d)", haut->module, static_cast<unsigned long long>(haut->adresse), haut->n);
   }

   void remiseAZero() { *this = Comptes {}; }

private:
   struct Nom
   {
      char nom[64];
      int n;
   };
   struct Position
   {
      char module[64];
      uint64_t adresse;
      int n;
   };

   static void compter(Nom (&noms)[NOMS], const char* nom)
   {
      const char* const vrai = (nom && *nom) ? nom : "?";
      for (Nom& x : noms)
         if (x.n && std::strcmp(x.nom, vrai) == 0)
         {
            x.n++;
            return;
         }
      for (Nom& x : noms)
         if (!x.n)
         {
            std::snprintf(x.nom, sizeof(x.nom), "%s", vrai);
            x.n = 1;
            return;
         }
      // Plus de place : le reste compte comme « other ».
      Nom& dernier = noms[NOMS - 1];
      std::snprintf(dernier.nom, sizeof(dernier.nom), "%s", "other");
      dernier.n++;
   }

   template <typename F> static void liste(const Nom (&noms)[NOMS], F& ajoute)
   {
      // Les plus vus d'abord, quatre au plus.
      bool dit[NOMS] {};
      for (int rang = 0; rang < 4; rang++)
      {
         int meilleur = -1;
         for (int i = 0; i < NOMS; i++)
            if (noms[i].n && !dit[i] && (meilleur < 0 || noms[i].n > noms[meilleur].n))
               meilleur = i;
         if (meilleur < 0)
            break;
         dit[meilleur] = true;
         ajoute(rang ? ", %s %d" : " %s %d", noms[meilleur].nom, noms[meilleur].n);
      }
   }

   Nom m_dans[NOMS] {};
   Nom m_sous[NOMS] {};
   Position m_positions[POSITIONS] {};
   int m_releves = 0;
   int m_actifs = 0;
};

} // namespace cyberpinball

#ifdef _WIN32

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <psapi.h>
#include <tlhelp32.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <thread>
#include <utility>

namespace cyberpinball::detail
{
/** La partie exécutable (sections de code) du module chargé à `base` ; false si ses en-têtes ne se lisent pas (module
 *  déchargé entre-temps : la lecture est gardée). */
inline bool partieExecutable(uintptr_t base, uintptr_t& debut, uintptr_t& fin)
{
   debut = fin = 0;
   __try
   {
      const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
      if (dos->e_magic != IMAGE_DOS_SIGNATURE)
         return false;
      const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS*>(base + dos->e_lfanew);
      if (nt->Signature != IMAGE_NT_SIGNATURE)
         return false;
      const IMAGE_SECTION_HEADER* section = IMAGE_FIRST_SECTION(nt);
      for (WORD s = 0; s < nt->FileHeader.NumberOfSections; s++, section++)
         if (section->Characteristics & IMAGE_SCN_MEM_EXECUTE)
         {
            const uintptr_t d = base + section->VirtualAddress;
            const DWORD taille = section->Misc.VirtualSize > section->SizeOfRawData ? section->Misc.VirtualSize : section->SizeOfRawData;
            const uintptr_t f = d + taille;
            debut = debut ? (d < debut ? d : debut) : d;
            fin = f > fin ? f : fin;
         }
      return debut != 0;
   }
   __except (EXCEPTION_EXECUTE_HANDLER)
   {
      return false;
   }
}
} // namespace cyberpinball::detail

namespace cyberpinball
{

/** Le fil de veille : relève où en est le fil des images pendant qu'une image tarde. */
class ReleveArrets
{
public:
   static constexpr int SEUIL_MS = 40;
   static constexpr int PERIODE_MS = 4;
   static constexpr int MAX_PAR_ARRET = 400;

   ~ReleveArrets() { arreter(); }

   /** À appeler depuis le fil qui prépare les images (le fil suivi). */
   bool demarrer()
   {
      arreter();
      if (!DuplicateHandle(GetCurrentProcess(), GetCurrentThread(), GetCurrentProcess(), &m_fil, THREAD_SUSPEND_RESUME | THREAD_GET_CONTEXT | THREAD_QUERY_INFORMATION, FALSE, 0))
      {
         m_fil = nullptr;
         return false;
      }
      LARGE_INTEGER f;
      QueryPerformanceFrequency(&f);
      m_frequence = f.QuadPart;
      m_derniere.store(0);
      m_fin.store(false);
      {
         const std::lock_guard<std::mutex> verrou(m_verrou);
         m_comptes.remiseAZero();
         m_arret = 0;
      }
      m_aPrendre.store(false);
      m_filsCherches.store(!m_nomRendu && !m_tous);
      m_veille = std::thread([this] { veiller(); });
      m_idVeille = GetThreadId(m_veille.native_handle());
      if (m_nomRendu || m_tous)
         m_chercheur = std::thread([this] { chercher(); });
      return true;
   }

   void arreter()
   {
      m_fin.store(true);
      if (m_veille.joinable())
         m_veille.join();
      if (m_chercheur.joinable())
         m_chercheur.join();
      if (m_fil)
         CloseHandle(m_fil);
      m_fil = nullptr;
      if (m_rendu)
         CloseHandle(m_rendu);
      m_rendu = nullptr;
      if (m_renduPret)
         CloseHandle(m_renduPret);
      m_renduPret = nullptr;
      m_aPrendre.store(false);
      m_filsCherches.store(false);
      fermerAutres();
      m_derniere.store(0);
   }

   /** Nom du second fil relevé pendant un arrêt (celui du rendu de VPX) ; à appeler avant demarrer(). */
   void suivreAussi(const wchar_t* nom) { m_nomRendu = nom; }

   /**
    * Les fils à relever en plus (rendu, autres) ont été cherchés une première fois et pris par le fil de veille, et le
    * rendu trouvé. Pour le banc : la recherche prend des centaines de ms sur une machine chargée ; un arrêt provoqué
    * avant sa fin n'était relevé que sur le fil des images (26/11/2026).
    */
   bool filsCherches() const { return m_filsCherches.load(); }

   /**
    * Banc et essais seulement ([Plugin.CyberPinballDmd] StallThreads = 1) : pendant un arrêt, tous les autres fils du
    * processus sont relevés aussi, et la ligne nomme ceux qui travaillaient (« | thread <nom> … »). Rapport du 21/11/2026
    * (The Matrix) : la boucle de jeu attendait un verrou du plugin PuP sans dire quel fil le tenait. Désactivé par
    * défaut : suspendre tous les fils (son compris) n'a pas sa place dans les parties des joueurs.
    */
   void suivreTous(bool oui)
   {
      m_tous = oui;
      // Sur le tas, et seulement s'il sert : 64 fils et leurs comptes pèsent plus de 300 Ko (deux listes : la relevée
      // et celle que prépare le chercheur).
      if (oui && !m_autres)
      {
         m_autres = std::make_unique<AutreFil[]>(AUTRES);
         m_autresPrets = std::make_unique<AutreFil[]>(AUTRES);
      }
   }

   /**
    * Une image vient d'être préparée (fil suivi). Si l'écart qu'elle termine est un à-coup (`aCoup`), écrit dans
    * `ligne` où était le fil pendant l'attente, puis « | render thread … » pour le second fil (vide sans relevé) ;
    * sinon, oublie les relevés de cet écart.
    */
   void image(bool aCoup, char* ligne, size_t taille)
   {
      if (taille)
         ligne[0] = '\0';
      LARGE_INTEGER t;
      QueryPerformanceCounter(&t);
      {
         const std::lock_guard<std::mutex> verrou(m_verrou);
         if (aCoup && m_arret && m_arret == m_derniere.load())
         {
            m_comptes.dire(ligne, taille);
            const size_t n = std::strlen(ligne);
            if (n && m_comptesRendu.releves() && n + 20 < taille)
            {
               std::snprintf(ligne + n, taille - n, " | render thread ");
               const size_t m = std::strlen(ligne);
               m_comptesRendu.dire(ligne + m, taille - m);
            }
            direAutres(ligne, taille);
         }
         m_comptes.remiseAZero();
         m_comptesRendu.remiseAZero();
         for (int i = 0; i < m_nAutres; i++)
            m_autres[i].comptes.remiseAZero();
         m_arret = 0;
      }
      m_derniere.store(t.QuadPart);
   }

private:
   struct Module
   {
      uintptr_t debut, fin; // la partie exécutable (sections de code)
      uintptr_t base;
      char nom[64];
      bool windows;
   };
   static constexpr int MODULES = 512;
   static constexpr size_t PILE = 32 * 1024;

   void veiller()
   {
      // Une minuterie fine le temps de la partie : sans elle, Sleep(4) dure 15,6 ms.
      timeBeginPeriodSur();
      // Au-dessus des fils de la partie : ce fil dort presque tout le temps, mais quand la machine est chargée
      // (antivirus, décodage, compilation), un fil de priorité normale attend son tour derrière les autres et ne
      // relève presque plus rien de l'à-coup qu'il devait expliquer (banc du 26/11/2026 sous charge : 15 relevés
      // pour 300 ms au lieu d'une soixantaine). Les profileurs par échantillons font de même.
      SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
      while (!m_fin.load())
      {
         Sleep(PERIODE_MS);
         const int64_t derniere = m_derniere.load();
         if (!derniere || !m_fil)
            continue;
         LARGE_INTEGER t;
         QueryPerformanceCounter(&t);
         if ((t.QuadPart - derniere) * 1000 < static_cast<int64_t>(SEUIL_MS) * m_frequence)
         {
            // Les fils à relever se cherchent sur un autre fil (chercher) : la recherche fait un instantané de tous les
            // fils de la machine, qui prend des centaines de ms quand elle est chargée. Faite ici, elle aveuglait la
            // veille : un arrêt qui commençait pendant la recherche n'était pas relevé du tout (bancs du 25 et du
            // 26/11/2026 sous charge : à-coup de 300 ms sans un seul relevé). La veille prend seulement la liste
            // prête, entre les arrêts : elle ne change jamais au milieu d'un arrêt.
            if (m_aPrendre.load(std::memory_order_acquire))
               prendreFils();
            continue;
         }
         if (m_parArret.first == derniere && m_parArret.second >= MAX_PAR_ARRET)
            continue;
         if (m_parArret.first != derniere)
            m_parArret = { derniere, 0 };
         m_parArret.second++;
         releve(derniere, m_fil, m_comptes);
         if (m_rendu)
            releve(derniere, m_rendu, m_comptesRendu);
         for (int i = 0; i < m_nAutres; i++)
            releve(derniere, m_autres[i].h, m_autres[i].comptes);
      }
      timeEndPeriodSur();
   }

   struct AutreFil
   {
      HANDLE h;
      char nom[48];
      Comptes comptes; // sous m_verrou
   };
   static constexpr int AUTRES = 64;

   void fermerAutres()
   {
      const std::lock_guard<std::mutex> verrou(m_verrou);
      for (int i = 0; i < m_nAutres; i++)
         CloseHandle(m_autres[i].h);
      m_nAutres = 0;
      for (int i = 0; i < m_nAutresPrets; i++)
         CloseHandle(m_autresPrets[i].h);
      m_nAutresPrets = 0;
   }

   /**
    * Le fil chercheur, de priorité normale : cherche le fil du rendu (il naît après la première image : cherché tant
    * qu'il n'est pas trouvé) et, pour suivreTous, la liste des autres fils, refaite chaque seconde. Il prépare ce qu'il
    * trouve (m_renduPret, m_autresPrets) et le donne à la veille par m_aPrendre ; il ne touche jamais à ce qu'elle relève.
    */
   void chercher()
   {
      DWORD idRendu = 0;
      while (!m_fin.load())
      {
         // Tant que m_aPrendre est levé, ce qui est prêt appartient à la veille : attendre qu'elle l'ait pris.
         if (!m_aPrendre.load(std::memory_order_acquire))
         {
            if (m_nomRendu && !idRendu)
            {
               m_renduPret = ouvrirFilNomme(m_nomRendu);
               if (m_renduPret)
                  idRendu = GetThreadId(m_renduPret);
            }
            if (m_tous && m_autresPrets)
               listerAutres(idRendu);
            m_aPrendre.store(true, std::memory_order_release);
            if (!m_tous && idRendu)
               return; // le rendu trouvé, plus rien à chercher
         }
         for (int i = 0; i < 50 && !m_fin.load(); i++)
            Sleep(20);
      }
   }

   /** La veille prend ce que le chercheur a préparé (entre les arrêts) ; l'ancienne liste lui revient, à fermer. */
   void prendreFils()
   {
      {
         const std::lock_guard<std::mutex> verrou(m_verrou);
         if (m_renduPret)
         {
            m_rendu = m_renduPret;
            m_renduPret = nullptr;
            m_comptesRendu.remiseAZero();
         }
         if (m_tous && m_autres && m_autresPrets)
         {
            std::swap(m_autres, m_autresPrets);
            std::swap(m_nAutres, m_nAutresPrets);
         }
      }
      m_filsCherches.store(!m_nomRendu || m_rendu);
      m_aPrendre.store(false, std::memory_order_release);
   }

   /** Tous les fils du processus sauf la veille, le chercheur, la boucle de jeu et le rendu, avec leur nom, dans m_autresPrets (chercheur seul). */
   void listerAutres(DWORD idRendu)
   {
      for (int i = 0; i < m_nAutresPrets; i++)
         CloseHandle(m_autresPrets[i].h);
      m_nAutresPrets = 0;
      using GetDescription = HRESULT(WINAPI*)(HANDLE, PWSTR*);
      static const auto getDescription = reinterpret_cast<GetDescription>(GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "GetThreadDescription"));
      HANDLE instantane = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
      if (instantane == INVALID_HANDLE_VALUE)
         return;
      const DWORD moi = GetCurrentProcessId();
      const DWORD fil = GetThreadId(m_fil);
      THREADENTRY32 e { sizeof(e) };
      for (BOOL encore = Thread32First(instantane, &e); encore && m_nAutresPrets < AUTRES; encore = Thread32Next(instantane, &e))
      {
         if (e.th32OwnerProcessID != moi || e.th32ThreadID == GetCurrentThreadId() || e.th32ThreadID == m_idVeille || e.th32ThreadID == fil || e.th32ThreadID == idRendu)
            continue;
         HANDLE h = OpenThread(THREAD_SUSPEND_RESUME | THREAD_GET_CONTEXT | THREAD_QUERY_INFORMATION | THREAD_QUERY_LIMITED_INFORMATION, FALSE, e.th32ThreadID);
         if (!h)
            continue;
         AutreFil& a = m_autresPrets[m_nAutresPrets++];
         a.h = h;
         a.comptes.remiseAZero();
         std::snprintf(a.nom, sizeof(a.nom), "tid%lu", static_cast<unsigned long>(e.th32ThreadID));
         PWSTR description = nullptr;
         if (getDescription && SUCCEEDED(getDescription(h, &description)) && description && *description)
         {
            WideCharToMultiByte(CP_UTF8, 0, description, -1, a.nom, sizeof(a.nom), nullptr, nullptr);
            a.nom[sizeof(a.nom) - 1] = '\0';
         }
         if (description)
            LocalFree(description);
      }
      CloseHandle(instantane);
   }

   /** « | thread <nom> N samples: … » pour les trois fils qui ont le plus travaillé pendant l'arrêt (sous m_verrou). */
   void direAutres(char* ligne, size_t taille)
   {
      bool dit[AUTRES] {};
      for (int rang = 0; rang < 3; rang++)
      {
         int meilleur = -1;
         for (int i = 0; i < m_nAutres; i++)
            if (!dit[i] && m_autres[i].comptes.actifs() * 4 >= m_autres[i].comptes.releves() && m_autres[i].comptes.actifs() > 0
               && (meilleur < 0 || m_autres[i].comptes.actifs() > m_autres[meilleur].comptes.actifs()))
               meilleur = i;
         if (meilleur < 0)
            return;
         dit[meilleur] = true;
         const size_t n = std::strlen(ligne);
         if (n + 80 >= taille)
            return;
         std::snprintf(ligne + n, taille - n, " | thread %s ", m_autres[meilleur].nom);
         const size_t m = std::strlen(ligne);
         m_autres[meilleur].comptes.dire(ligne + m, taille - m);
      }
   }

   /** Le fil de ce processus qui porte ce nom (SetThreadDescription), ouvert pour être relevé ; nullptr sinon. */
   static HANDLE ouvrirFilNomme(const wchar_t* nom)
   {
      using GetDescription = HRESULT(WINAPI*)(HANDLE, PWSTR*);
      static const auto getDescription = reinterpret_cast<GetDescription>(GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "GetThreadDescription"));
      if (!getDescription)
         return nullptr;
      HANDLE instantane = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
      if (instantane == INVALID_HANDLE_VALUE)
         return nullptr;
      HANDLE trouve = nullptr;
      THREADENTRY32 fil { sizeof(fil) };
      const DWORD moi = GetCurrentProcessId();
      for (BOOL encore = Thread32First(instantane, &fil); encore && !trouve; encore = Thread32Next(instantane, &fil))
      {
         if (fil.th32OwnerProcessID != moi || fil.th32ThreadID == GetCurrentThreadId())
            continue;
         HANDLE h = OpenThread(THREAD_SUSPEND_RESUME | THREAD_GET_CONTEXT | THREAD_QUERY_INFORMATION | THREAD_QUERY_LIMITED_INFORMATION, FALSE, fil.th32ThreadID);
         if (!h)
            continue;
         PWSTR description = nullptr;
         if (SUCCEEDED(getDescription(h, &description)) && description && std::wcscmp(description, nom) == 0)
            trouve = h;
         if (description)
            LocalFree(description);
         if (h != trouve)
            CloseHandle(h);
      }
      CloseHandle(instantane);
      return trouve;
   }

   void releve(int64_t arret, HANDLE cible, Comptes& comptes)
   {
      // --- Fil suivi suspendu : rien qui prenne un verrou. ---
      if (SuspendThread(cible) == static_cast<DWORD>(-1))
         return;
      CONTEXT contexte {};
      contexte.ContextFlags = CONTEXT_CONTROL | CONTEXT_INTEGER;
      size_t copie = 0;
      uintptr_t ip = 0;
      if (GetThreadContext(cible, &contexte))
      {
#if defined(_M_X64)
         ip = static_cast<uintptr_t>(contexte.Rip);
         const uintptr_t sp = static_cast<uintptr_t>(contexte.Rsp);
#elif defined(_M_ARM64)
         ip = static_cast<uintptr_t>(contexte.Pc);
         const uintptr_t sp = static_cast<uintptr_t>(contexte.Sp);
#else
         const uintptr_t sp = 0;
#endif
         MEMORY_BASIC_INFORMATION mbi {};
         if (sp && VirtualQuery(reinterpret_cast<void*>(sp), &mbi, sizeof(mbi)) && mbi.State == MEM_COMMIT)
         {
            const uintptr_t finRegion = reinterpret_cast<uintptr_t>(mbi.BaseAddress) + mbi.RegionSize;
            copie = std::min(PILE, static_cast<size_t>(finRegion - sp));
            std::memcpy(m_pile, reinterpret_cast<const void*>(sp), copie);
         }
      }
      ResumeThread(cible);
      // --- Fil suivi relancé. ---
      if (!ip)
         return;
      const Module* dans = trouver(ip);
      const Module* sous = (dans && !dans->windows) ? dans : nullptr;
      uintptr_t positionSous = sous ? ip : 0;
      for (size_t i = 0; !sous && i + sizeof(uintptr_t) <= copie; i += sizeof(uintptr_t))
      {
         uintptr_t valeur;
         std::memcpy(&valeur, m_pile + i, sizeof(valeur));
         const Module* m = trouver(valeur);
         if (m && !m->windows)
         {
            sous = m;
            positionSous = valeur;
         }
      }
      const std::lock_guard<std::mutex> verrou(m_verrou);
      if (m_arret != arret)
      {
         m_comptes.remiseAZero();
         m_comptesRendu.remiseAZero();
         for (int i = 0; i < m_nAutres; i++)
            m_autres[i].comptes.remiseAZero();
         m_arret = arret;
      }
      comptes.ajouter(dans ? dans->nom : "?", sous ? sous->nom : "-", sous ? sous->nom : "", sous ? positionSous - sous->base : 0);
   }

   /** Le module dont la partie exécutable contient `adresse` ; la liste est relue une fois par arrêt au plus. */
   const Module* trouver(uintptr_t adresse)
   {
      for (int i = 0; i < m_modules; i++)
         if (adresse >= m_liste[i].debut && adresse < m_liste[i].fin)
            return &m_liste[i];
      if (m_relue == m_parArret.first)
         return nullptr;
      m_relue = m_parArret.first;
      relireModules();
      for (int i = 0; i < m_modules; i++)
         if (adresse >= m_liste[i].debut && adresse < m_liste[i].fin)
            return &m_liste[i];
      return nullptr;
   }

   void relireModules()
   {
      HMODULE modules[MODULES];
      DWORD octets = 0;
      m_modules = 0;
      if (!K32EnumProcessModules(GetCurrentProcess(), modules, sizeof(modules), &octets))
         return;
      wchar_t windows[MAX_PATH] {};
      const UINT longueurWindows = GetWindowsDirectoryW(windows, MAX_PATH);
      const int n = std::min(MODULES, static_cast<int>(octets / sizeof(HMODULE)));
      for (int i = 0; i < n && m_modules < MODULES; i++)
      {
         wchar_t chemin[MAX_PATH] {};
         if (!K32GetModuleFileNameExW(GetCurrentProcess(), modules[i], chemin, MAX_PATH))
            continue;
         const auto base = reinterpret_cast<uintptr_t>(modules[i]);
         uintptr_t debut = 0, fin = 0;
         if (!detail::partieExecutable(base, debut, fin))
            continue;
         Module& m = m_liste[m_modules++];
         m.debut = debut;
         m.fin = fin;
         m.base = base;
         m.windows = longueurWindows && _wcsnicmp(chemin, windows, longueurWindows) == 0;
         const wchar_t* nom = wcsrchr(chemin, L'\\');
         nom = nom ? nom + 1 : chemin;
         WideCharToMultiByte(CP_UTF8, 0, nom, -1, m.nom, sizeof(m.nom), nullptr, nullptr);
         m.nom[sizeof(m.nom) - 1] = '\0';
      }
   }

   // timeBeginPeriod sans lier winmm à la construction : chargée si présente.
   void timeBeginPeriodSur()
   {
      m_winmm = LoadLibraryW(L"winmm.dll");
      if (m_winmm)
         if (auto f = reinterpret_cast<UINT(WINAPI*)(UINT)>(GetProcAddress(m_winmm, "timeBeginPeriod")))
            f(1);
   }
   void timeEndPeriodSur()
   {
      if (!m_winmm)
         return;
      if (auto f = reinterpret_cast<UINT(WINAPI*)(UINT)>(GetProcAddress(m_winmm, "timeEndPeriod")))
         f(1);
      FreeLibrary(m_winmm);
      m_winmm = nullptr;
   }

   HANDLE m_fil = nullptr;
   HANDLE m_rendu = nullptr; // fil de veille seul (et arreter, une fois la veille finie)
   const wchar_t* m_nomRendu = nullptr;
   Comptes m_comptesRendu; // sous m_verrou
   bool m_tous = false;
   std::unique_ptr<AutreFil[]> m_autres; // poignées : fil de veille (et arreter) ; comptes : sous m_verrou
   int m_nAutres = 0;
   // Préparés par le chercheur, à lui tant que m_aPrendre est baissé, à la veille quand il est levé.
   HANDLE m_renduPret = nullptr;
   std::unique_ptr<AutreFil[]> m_autresPrets;
   int m_nAutresPrets = 0;
   std::atomic<bool> m_aPrendre { false };
   std::thread m_chercheur;
   DWORD m_idVeille = 0;
   HMODULE m_winmm = nullptr;
   int64_t m_frequence = 1;
   std::atomic<int64_t> m_derniere { 0 };
   std::atomic<bool> m_fin { false };
   std::atomic<bool> m_filsCherches { false };
   std::thread m_veille;
   std::mutex m_verrou;
   Comptes m_comptes; // sous m_verrou
   int64_t m_arret = 0; // sous m_verrou : l'écart que décrivent les comptes (heure de l'image qui l'a ouvert)
   std::pair<int64_t, int> m_parArret { 0, 0 }; // fil de veille seul
   int64_t m_relue = -1; // fil de veille seul
   Module m_liste[MODULES] {};
   int m_modules = 0;
   unsigned char m_pile[PILE] {};
};

} // namespace cyberpinball

#endif
