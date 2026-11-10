// license:GPLv3+
//
// Plugin VPX « CyberPinball » : la pause dans le casque.
//
// Pendant une partie dans le casque, c'est VPX qui tient l'affichage, et son interface est collée aux
// yeux. Ce plugin dessine la pause dans la scène, sur le fronton : VPX 10.8.1 pose en VR un fronton
// (flasher en rendu externe, fenêtre Backglass, player.cpp) qui dessine les « rendus annexes » des
// plugins, en 3D, à sa place dans la pièce (flasher.cpp). Le premier rendu qui dessine l'emporte, par
// priorité ([Backglass] Priority.<id> dans l'INI).
//
// - Bouton Pause : VPX met en pause lui-même ; le plugin le constate (temps de jeu arrêté) et montre
//   « Reprendre » / « Quitter » (joystick ou flippers pour choisir, Valider pour confirmer, le rappel des
//   touches dessous) ; appui tenu 1,5 s, la partie quitte, une jauge circulaire se remplit (pause.h).
// - Jamais avalés : Pause, Échap (ExitGame), le menu de VPX, une action inconnue ; plugin passif si la
//   table des actions ne correspond pas à VPX (pause.h, essai du 10 novembre 2026).
// - Quitter est garanti : ExitGame, puis la fermeture de la fenêtre de VPX si la partie tourne encore.
// - Fronton : la pause seulement pendant l'appui tenu ou le menu ouvert ; sinon il rend la main à
//   B2S ou PuP. En dernier recours (rien d'autre ne dessine), un fond opaque plutôt que du vide.
// - Hors du casque (fenêtre du fronton d'une borne, rendu 2D), il ne dessine jamais. Cyber Pinball ne
//   l'active d'ailleurs que dans l'INI des parties dans le casque ([Plugin.CyberPinball] Enable = 1).
//
// Réglages ([Plugin.CyberPinball], écrits par Cyber Pinball dans la langue de l'application) :
//   Pause, Resume, Quit, Help (rappel des touches, lignes séparées par « · »), ResumeHint : les libellés.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "MsgPlugin.h"
#include "VPXPlugin.h"
#include "pause.h"

using namespace cyberpinball;

namespace {

const MsgPluginAPI* msgApi = nullptr;
VPXPluginAPI* vpxApi = nullptr;
uint32_t endpointId = 0;
unsigned int getVpxApiId = 0, onGameStartId = 0, onGameEndId = 0, onPrepareFrameId = 0, onActionId = 0, getAuxRendererId = 0, auxChangedId = 0;

MSGPI_STRING_VAL_SETTING(libellePause, "Pause", "Pause label", "Title of the pause screen", true, "Pause", 64);
MSGPI_STRING_VAL_SETTING(libelleReprendre, "Resume", "Resume label", "Resume choice", true, "Resume", 64);
MSGPI_STRING_VAL_SETTING(libelleQuitter, "Quit", "Quit label", "Quit choice", true, "Quit", 64);
MSGPI_STRING_VAL_SETTING(libelleAide, "Help", "Help label", "Keys reminder under the choices, lines split by a middle dot", true, "Stick: choose \xC2\xB7 A: confirm", 128);
MSGPI_STRING_VAL_SETTING(libelleRappel, "ResumeHint", "Resume hint", "Shown when resuming did not take", true, "Pause button: resume", 64);

double maintenant()
{
   return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

bool enPartie = false;
Pause pause;
bool relacherSortie = false;
// Dernière demande de dessin du fronton par VPX : une table sans fronton dans sa scène (pièce VR à
// fronton en image, sans flasher en rendu externe) ne la demande jamais ; la pause passe alors par
// la notification de VPX, moins lisible mais présente.
double derniereDemande = -1.0;
bool notifiee = false;

/** La table des actions (commandeVpx1081) vaut pour VPX 10.8.1 ; une autre version : plugin passif. */
bool versionConnue()
{
   wchar_t exe[MAX_PATH] {};
   if (!GetModuleFileNameW(nullptr, exe, MAX_PATH))
      return false;
   DWORD h = 0;
   const DWORD n = GetFileVersionInfoSizeW(exe, &h);
   if (!n)
      return false;
   std::vector<uint8_t> info(n);
   VS_FIXEDFILEINFO* v = nullptr;
   UINT l = 0;
   if (!GetFileVersionInfoW(exe, 0, n, info.data()) || !VerQueryValueW(info.data(), L"\\", reinterpret_cast<void**>(&v), &l) || !v)
      return false;
   return HIWORD(v->dwFileVersionMS) == 10 && LOWORD(v->dwFileVersionMS) == 8 && HIWORD(v->dwFileVersionLS) == 1;
}

void injecter(int action, bool presse)
{
   if (!vpxApi)
      return;
   VPXInputState etat {};
   const uint64_t bit = 1ull << action;
   etat.actionMask = bit;
   vpxApi->GetInputState(&etat);
   etat.actionMask = bit;
   if (presse)
      etat.actionState |= bit;
   else
      etat.actionState &= ~bit;
   vpxApi->SetInputState(&etat);
}

/** Les fenêtres de VPX (SDL) de ce processus, la plus grande d'abord (le playfield, ou son aperçu en VR). */
std::vector<HWND> fenetresVpx()
{
   struct Trouvees
   {
      std::vector<std::pair<long long, HWND>> l;
   } t;
   EnumWindows(
      [](HWND w, LPARAM p) -> BOOL
      {
         DWORD pid = 0;
         GetWindowThreadProcessId(w, &pid);
         wchar_t classe[64] {};
         GetClassNameW(w, classe, 64);
         if (pid == GetCurrentProcessId() && wcsncmp(classe, L"SDL_app", 7) == 0)
         {
            RECT r {};
            GetWindowRect(w, &r);
            reinterpret_cast<Trouvees*>(p)->l.push_back({ static_cast<long long>(r.right - r.left) * (r.bottom - r.top), w });
         }
         return TRUE;
      },
      reinterpret_cast<LPARAM>(&t));
   std::sort(t.l.begin(), t.l.end(), [](const auto& a, const auto& b) { return a.first > b.first; });
   std::vector<HWND> out;
   for (const auto& e : t.l)
      out.push_back(e.second);
   return out;
}

/**
 * Reprendre : VPX ne laisse pas un plugin injecter l'action Pause (VPXPluginAPIImpl, m_actionMap[VPXACTION_Pause]
 * commenté), mais lit le clavier de toutes ses fenêtres en VR (Player::ProcessOSMessages, IsVR()) : la touche
 * Pause de VPX ([Input] Mapping.Pause = Key;19, P) postée à sa fenêtre. Second moyen : la même touche par
 * SendInput, seulement si VPX a le premier plan (jamais dans une autre application).
 */
void reprendreVpx(int essai)
{
   constexpr UINT P = 0x19; // code de balayage de P
   if (essai == 1)
   {
      const std::vector<HWND> w = fenetresVpx();
      if (w.empty())
         return;
      PostMessageW(w.front(), WM_KEYDOWN, 'P', 1 | (P << 16));
      PostMessageW(w.front(), WM_KEYUP, 'P', 1 | (P << 16) | (1u << 30) | (1u << 31));
      return;
   }
   DWORD pid = 0;
   GetWindowThreadProcessId(GetForegroundWindow(), &pid);
   if (pid != GetCurrentProcessId())
      return;
   INPUT in[2] {};
   for (INPUT& i : in)
   {
      i.type = INPUT_KEYBOARD;
      i.ki.wScan = static_cast<WORD>(P);
      i.ki.dwFlags = KEYEVENTF_SCANCODE;
   }
   in[1].ki.dwFlags |= KEYEVENTF_KEYUP;
   SendInput(2, in, sizeof(INPUT));
}

/**
 * Quitter, garanti : d'abord l'action ExitGame (ce que fait Échap : le script de la table la voit), puis,
 * si la partie tourne encore, la fermeture de la fenêtre de VPX (SDL_EVENT_WINDOW_CLOSE_REQUESTED : la
 * partie s'arrête, quel que soit le menu ouvert ou le réglage des manettes).
 */
void quitterPartie(int essai)
{
   if (essai == 1)
   {
      injecter(api::ExitGame, true);
      relacherSortie = true;
      return;
   }
   for (HWND w : fenetresVpx())
      PostMessageW(w, WM_CLOSE, 0, 0);
}

void appliquer(const Ordre& o)
{
   if (o.reprendre)
      reprendreVpx(o.reprendre);
   if (o.quitter)
      quitterPartie(o.quitter);
}

void MSGPIAPI onAction(const unsigned int, void*, void* data)
{
   auto* ev = static_cast<VPXActionEvent*>(data);
   if (!enPartie || !ev)
      return;
   // OnActionChanged donne le numéro interne de l'action (InputManager), pas une VPXAction.
   int liee = -1;
   const Commande c = commandeVpx1081(static_cast<int>(ev->action), liee);
   // Table vérifiée à chaque action que VPX lie à l'API : en désaccord, le plugin devient passif.
   if (pause.estFiable() && liee >= 0 && vpxApi)
   {
      VPXInputState etat {};
      etat.actionMask = 1ull << liee;
      vpxApi->GetInputState(&etat);
      if ((etat.actionMask & (1ull << liee)) && (((etat.actionState >> liee) & 1) != 0) != (ev->isPressed != 0))
      {
         pause.passif();
         vpxApi->PushNotification("Cyber Pinball : pause du casque coupee (actions de VPX inattendues)", 4000);
      }
   }
   if (pause.avaler(c))
      ev->enableVPXProcessing = 0;
   appliquer(pause.action(c, ev->isPressed != 0, maintenant()));
}

void MSGPIAPI onPrepareFrame(const unsigned int, void*, void*)
{
   if (!enPartie || !vpxApi)
      return;
   if (relacherSortie)
   {
      relacherSortie = false;
      injecter(api::ExitGame, false);
   }
   const double t = maintenant();
   appliquer(pause.image(t, vpxApi->GetGameTime()));
   if (!pause.affichee(t))
      notifiee = false;
   else if (!notifiee && t - derniereDemande > 0.3)
   {
      notifiee = true;
      const std::string message = pause.menuVisible() ? std::string(libellePause_Val) + " : " + libelleReprendre_Val + " / " + libelleQuitter_Val : std::string(libelleQuitter_Val) + " ...";
      vpxApi->PushNotification(message.c_str(), 2500);
   }
}

void MSGPIAPI onGameStart(const unsigned int, void*, void*)
{
   pause.remiseAZero();
   if (!versionConnue())
      pause.passif();
   relacherSortie = false;
   notifiee = false;
   enPartie = true;
}

void MSGPIAPI onGameEnd(const unsigned int, void*, void*)
{
   enPartie = false;
   pause.remiseAZero();
}

// --- Dessin sur le fronton ------------------------------------------------------------------

struct Image
{
   VPXTexture tex = nullptr;
   int l = 0, h = 0;
   std::string texte;
};

VPXTexture blanc = nullptr;
Image titre, reprendre, quitter, marque, rappel;
Image aide[3];
int lignesAide = 0;

void preparer(Image& img, const char* texte, int echelle)
{
   if (img.tex && img.texte == texte)
      return;
   std::vector<uint8_t> px = libelle(texte, echelle, img.l, img.h);
   vpxApi->UpdateTexture(&img.tex, img.l, img.h, VPXTEXFMT_sRGBA8, px.data());
   img.texte = texte;
}

void preparerTout()
{
   if (!blanc)
   {
      const uint8_t px[4 * 4] = { 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255 };
      vpxApi->UpdateTexture(&blanc, 2, 2, VPXTEXFMT_sRGBA8, px);
   }
   preparer(titre, libellePause_Val, 8);
   preparer(reprendre, libelleReprendre_Val, 8);
   preparer(quitter, libelleQuitter_Val, 8);
   preparer(marque, "Cyber Pinball", 6);
   preparer(rappel, libelleRappel_Val, 6);
   // Le rappel des touches, une ligne par morceau séparé par « · ».
   const std::string aideTexte = libelleAide_Val;
   lignesAide = 0;
   size_t debut = 0;
   while (lignesAide < 3 && debut <= aideTexte.size())
   {
      const size_t fin = aideTexte.find("\xC2\xB7", debut);
      std::string ligne = aideTexte.substr(debut, fin == std::string::npos ? std::string::npos : fin - debut);
      while (!ligne.empty() && ligne.front() == ' ')
         ligne.erase(ligne.begin());
      while (!ligne.empty() && ligne.back() == ' ')
         ligne.pop_back();
      if (!ligne.empty())
         preparer(aide[lignesAide++], ligne.c_str(), 6);
      if (fin == std::string::npos)
         break;
      debut = fin + 2;
   }
}

// Le fronton dessiné dans un repère de 1000 × 750 (4:3, comme celui que VPX pose en VR).
constexpr float L = 1000.f, H = 750.f;

void rectangle(VPXRenderContext2D* ctx, float x, float y, float w, float h, float r, float g, float b, float a = 1.f, float rotation = 0.f)
{
   ctx->DrawImage(ctx, blanc, r, g, b, a, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, rotation, x, y, w, h);
}

/** Un libellé centré en (cx, cy), haut de `hauteur`, réduit s'il dépasse la largeur utile. */
void texte(VPXRenderContext2D* ctx, const Image& img, float cx, float cy, float hauteur, float r, float g, float b)
{
   constexpr float LARGEUR_UTILE = 940.f;
   float w = hauteur * static_cast<float>(img.l) / static_cast<float>(img.h);
   if (w > LARGEUR_UTILE)
   {
      hauteur *= LARGEUR_UTILE / w;
      w = LARGEUR_UTILE;
   }
   ctx->DrawImage(ctx, img.tex, r, g, b, 1.f, 0.f, 0.f, static_cast<float>(img.l), static_cast<float>(img.h), 0.f, 0.f, 0.f, cx - w / 2.f, cy - hauteur / 2.f, w, hauteur);
}

// Couleurs de la direction artistique : noir sarcelle, vert signal, encre atténuée.
constexpr float FOND[3] = { 0.02f, 0.06f, 0.07f };
constexpr float SIGNAL[3] = { 0.55f, 0.89f, 0.23f };
constexpr float ENCRE[3] = { 0.85f, 0.9f, 0.9f };
constexpr float TERNE[3] = { 0.3f, 0.36f, 0.37f };

int MSGPIAPI dessinerPause(VPXRenderContext2D* ctx, void*)
{
   // Hors du casque (fenêtre 2D du fronton d'une borne) : jamais.
   if (!ctx || ctx->is2D || !vpxApi || !enPartie)
      return 0;
   const double t = maintenant();
   derniereDemande = t;
   const bool tenu = pause.jaugeVisible(t);
   if (!pause.affichee(t))
      return 0;
   preparerTout();
   ctx->srcWidth = L;
   ctx->srcHeight = H;
   rectangle(ctx, 0.f, 0.f, L, H, FOND[0], FOND[1], FOND[2]);
   if (tenu)
   {
      // Jauge : un cercle de 48 traits qui se remplit en vert ; « Quitter » au milieu.
      const float cx = L / 2.f, cy = H / 2.f, rayon = 260.f;
      constexpr int N = 48;
      const int pleins = static_cast<int>(std::floor(pause.jauge(t) * N + 1e-6));
      for (int i = 0; i < N; i++)
      {
         const float a = -1.5707963f + 6.2831853f * static_cast<float>(i) / N;
         const float w = 22.f, h = 34.f;
         const float* c = i < pleins ? SIGNAL : TERNE;
         rectangle(ctx, cx + rayon * std::cos(a) - w / 2.f, cy + rayon * std::sin(a) - h / 2.f, w, h, c[0], c[1], c[2], 1.f, a * 57.29578f + 90.f);
      }
      texte(ctx, quitter, cx, cy, 110.f, ENCRE[0], ENCRE[1], ENCRE[2]);
      return 1;
   }
   // Menu : « Pause », les deux choix (le choisi en vert, encadré), puis le rappel des touches en gros.
   texte(ctx, titre, L / 2.f, 95.f, 100.f, ENCRE[0], ENCRE[1], ENCRE[2]);
   const bool r = pause.choix() == Choix::Reprendre;
   const float yChoisi = r ? 275.f : 415.f;
   rectangle(ctx, 120.f, yChoisi - 62.f, L - 240.f, 124.f, SIGNAL[0], SIGNAL[1], SIGNAL[2], 0.18f);
   texte(ctx, reprendre, L / 2.f, 275.f, 92.f, r ? SIGNAL[0] : TERNE[0], r ? SIGNAL[1] : TERNE[1], r ? SIGNAL[2] : TERNE[2]);
   texte(ctx, quitter, L / 2.f, 415.f, 92.f, r ? TERNE[0] : SIGNAL[0], r ? TERNE[1] : SIGNAL[1], r ? TERNE[2] : SIGNAL[2]);
   if (pause.repriseEchouee())
      texte(ctx, rappel, L / 2.f, 600.f, 64.f, SIGNAL[0], SIGNAL[1], SIGNAL[2]);
   else
      for (int i = 0; i < lignesAide; i++)
         texte(ctx, aide[i], L / 2.f, (lignesAide == 1 ? 600.f : 560.f + 90.f * static_cast<float>(i)), 64.f, ENCRE[0], ENCRE[1], ENCRE[2]);
   return 1;
}

int MSGPIAPI dessinerFond(VPXRenderContext2D* ctx, void*)
{
   // Dernier recours, dans le casque seulement : un fond opaque plutôt que du vide.
   if (!ctx || ctx->is2D || !vpxApi)
      return 0;
   preparerTout();
   ctx->srcWidth = L;
   ctx->srcHeight = H;
   rectangle(ctx, 0.f, 0.f, L, H, FOND[0], FOND[1], FOND[2]);
   texte(ctx, marque, L / 2.f, H / 2.f, 60.f, TERNE[0], TERNE[1], TERNE[2]);
   return 1;
}

void MSGPIAPI onGetAuxRenderer(const unsigned int, void*, void* data)
{
   auto* msg = static_cast<GetAncillaryRendererMsg*>(data);
   if (!msg || msg->window != VPXWINDOW_Backglass)
      return;
   static AncillaryRendererDef pauseDef { "CyberPinball.Pause", "Pause (Cyber Pinball)", "Pause and quit gauge in the headset", nullptr, dessinerPause };
   static AncillaryRendererDef fondDef { "CyberPinball.Fond", "Background (Cyber Pinball)", "Opaque background when nothing else draws the backglass in the headset", nullptr, dessinerFond };
   for (AncillaryRendererDef* def : { &pauseDef, &fondDef })
   {
      if (msg->count < msg->maxEntryCount && msg->entries)
         msg->entries[msg->count] = *def;
      msg->count++;
   }
}

} // namespace

MSGPI_EXPORT void MSGPIAPI CyberPinballPluginLoad(const uint32_t sessionId, const MsgPluginAPI* api)
{
   msgApi = api;
   endpointId = sessionId;
   msgApi->RegisterSetting(endpointId, &libellePause);
   msgApi->RegisterSetting(endpointId, &libelleReprendre);
   msgApi->RegisterSetting(endpointId, &libelleQuitter);
   msgApi->RegisterSetting(endpointId, &libelleAide);
   msgApi->RegisterSetting(endpointId, &libelleRappel);
   msgApi->BroadcastMsg(endpointId, getVpxApiId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_MSG_GET_API), &vpxApi);
   msgApi->SubscribeMsg(endpointId, onGameStartId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_GAME_START), onGameStart, nullptr);
   msgApi->SubscribeMsg(endpointId, onGameEndId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_GAME_END), onGameEnd, nullptr);
   msgApi->SubscribeMsg(endpointId, onPrepareFrameId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_PREPARE_FRAME), onPrepareFrame, nullptr);
   msgApi->SubscribeMsg(endpointId, onActionId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_ACTION_CHANGED), onAction, nullptr);
   msgApi->SubscribeMsg(endpointId, getAuxRendererId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_MSG_GET_AUX_RENDERER), onGetAuxRenderer, nullptr);
   // VPX relit la liste des rendus annexes.
   msgApi->BroadcastMsg(endpointId, auxChangedId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_AUX_RENDERER_CHG), nullptr);
}

MSGPI_EXPORT void MSGPIAPI CyberPinballPluginUnload()
{
   enPartie = false;
   msgApi->UnsubscribeMsg(onGameStartId, onGameStart, nullptr);
   msgApi->UnsubscribeMsg(onGameEndId, onGameEnd, nullptr);
   msgApi->UnsubscribeMsg(onPrepareFrameId, onPrepareFrame, nullptr);
   msgApi->UnsubscribeMsg(onActionId, onAction, nullptr);
   msgApi->UnsubscribeMsg(getAuxRendererId, onGetAuxRenderer, nullptr);
   msgApi->BroadcastMsg(endpointId, auxChangedId, nullptr);
   if (vpxApi)
      for (VPXTexture* t : { &blanc, &titre.tex, &reprendre.tex, &quitter.tex, &marque.tex, &rappel.tex, &aide[0].tex, &aide[1].tex, &aide[2].tex })
         if (*t)
         {
            vpxApi->DeleteTexture(*t);
            *t = nullptr;
         }
   for (unsigned int id : { getVpxApiId, onGameStartId, onGameEndId, onPrepareFrameId, onActionId, getAuxRendererId, auxChangedId })
      msgApi->ReleaseMsgID(id);
   vpxApi = nullptr;
   msgApi = nullptr;
}
