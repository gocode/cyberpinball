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
// - Bouton Pause : appui court, la pause (« Reprendre » / « Quitter », flippers pour choisir, valider
//   pour confirmer) ; appui tenu 1,5 s, la partie quitte, une jauge circulaire se remplit ; lâcher
//   avant annule (pause.h).
// - Fronton : la pause seulement pendant l'appui tenu ou le menu ouvert ; sinon il rend la main à
//   B2S ou PuP. En dernier recours (rien d'autre ne dessine), un fond opaque plutôt que du vide.
// - Hors du casque (fenêtre du fronton d'une borne, rendu 2D), il ne dessine jamais. Cyber Pinball ne
//   l'active d'ailleurs que dans l'INI des parties dans le casque ([Plugin.CyberPinball] Enable = 1).
//
// Réglages ([Plugin.CyberPinball], écrits par Cyber Pinball dans la langue de l'application) :
//   Pause, Resume, Quit, Hold : les libellés.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

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

double maintenant()
{
   return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

bool enPartie = false;
Pause pause;
// Actions injectées par le plugin, attendues en retour dans OnActionChanged : VPX les traite.
int pausesInjectees = 0;
bool relacherPause = false, relacherSortie = false;
// Délai avant de montrer la jauge : un appui court (ouvrir la pause) ne la fait pas clignoter.
constexpr double JAUGE_APRES_S = 0.2;
// Dernière demande de dessin du fronton par VPX : une table sans fronton dans sa scène (pièce VR à
// fronton en image, sans flasher en rendu externe) ne la demande jamais ; la pause passe alors par
// la notification de VPX, moins lisible mais présente.
double derniereDemande = -1.0;
bool notifiee = false;

void injecter(VPXAction action, bool presse)
{
   if (!vpxApi)
      return;
   VPXInputState etat {};
   vpxApi->GetInputState(&etat);
   const uint64_t bit = 1ull << action;
   etat.actionMask |= bit;
   if (presse)
      etat.actionState |= bit;
   else
      etat.actionState &= ~bit;
   vpxApi->SetInputState(&etat);
}

void appliquer(const Ordre& o)
{
   if (o.pauserVpx || o.reprendreVpx)
   {
      // VPX bascule sa pause à l'appui : un appui injecté, relâché à l'image suivante.
      pausesInjectees++;
      injecter(VPXACTION_Pause, true);
      relacherPause = true;
   }
   if (o.quitter)
   {
      injecter(VPXACTION_ExitGame, true);
      relacherSortie = true;
   }
}

void MSGPIAPI onAction(const unsigned int, void*, void* data)
{
   auto* ev = static_cast<VPXActionEvent*>(data);
   if (!enPartie || !ev)
      return;
   if (ev->action == VPXACTION_Pause)
   {
      if (pausesInjectees > 0 && ev->isPressed)
      {
         pausesInjectees--; // la nôtre : VPX la traite
         return;
      }
      if (relacherPause && !ev->isPressed)
         return;
      ev->enableVPXProcessing = 0;
      appliquer(pause.bouton(ev->isPressed != 0, maintenant()));
      return;
   }
   // Menu de la pause ouvert : flippers et valider le pilotent, rien n'arrive à la table.
   if (pause.ouverte())
   {
      if (ev->isPressed)
      {
         if (ev->action == VPXACTION_LeftFlipper || ev->action == VPXACTION_LeftMagnaSave)
            pause.gauche();
         else if (ev->action == VPXACTION_RightFlipper || ev->action == VPXACTION_RightMagnaSave)
            pause.droite();
         else if (ev->action == VPXACTION_StartGame)
            appliquer(pause.valider());
      }
      if (ev->action != VPXACTION_ExitGame && ev->action != VPXACTION_InGameUI && ev->action != VPXACTION_OpenInGameUI)
         ev->enableVPXProcessing = 0;
   }
}

void MSGPIAPI onPrepareFrame(const unsigned int, void*, void*)
{
   if (!enPartie)
      return;
   if (relacherPause)
   {
      relacherPause = false;
      injecter(VPXACTION_Pause, false);
   }
   if (relacherSortie)
   {
      relacherSortie = false;
      injecter(VPXACTION_ExitGame, false);
   }
   appliquer(pause.image(maintenant()));
   const double t = maintenant();
   const bool visible = pause.ouverte() || pause.appuiEnCours();
   if (!visible)
      notifiee = false;
   else if (!notifiee && vpxApi && t - derniereDemande > 0.3)
   {
      notifiee = true;
      const std::string message = pause.ouverte() ? std::string(libellePause_Val) + " : " + libelleReprendre_Val + " / " + libelleQuitter_Val : std::string(libelleQuitter_Val) + " ...";
      vpxApi->PushNotification(message.c_str(), 2500);
   }
}

void MSGPIAPI onGameStart(const unsigned int, void*, void*)
{
   pause.remiseAZero();
   pausesInjectees = 0;
   relacherPause = relacherSortie = false;
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
Image titre, reprendre, quitter, marque;

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
}

// Le fronton dessiné dans un repère de 1000 × 750 (4:3, comme celui que VPX pose en VR).
constexpr float L = 1000.f, H = 750.f;

void rectangle(VPXRenderContext2D* ctx, float x, float y, float w, float h, float r, float g, float b, float a = 1.f, float rotation = 0.f)
{
   ctx->DrawImage(ctx, blanc, r, g, b, a, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, rotation, x, y, w, h);
}

/** Un libellé centré en (cx, cy), haut de `hauteur`. */
void texte(VPXRenderContext2D* ctx, const Image& img, float cx, float cy, float hauteur, float r, float g, float b)
{
   const float w = hauteur * static_cast<float>(img.l) / static_cast<float>(img.h);
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
   const bool tenu = pause.appuiEnCours() && pause.jauge(t) * QUIT_HOLD_S >= JAUGE_APRES_S;
   if (!pause.ouverte() && !tenu)
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
   // Menu : « Pause », puis les deux choix, le choisi en vert.
   texte(ctx, titre, L / 2.f, 150.f, 130.f, ENCRE[0], ENCRE[1], ENCRE[2]);
   const bool r = pause.choix() == Choix::Reprendre;
   texte(ctx, reprendre, L / 2.f, 390.f, 110.f, r ? SIGNAL[0] : TERNE[0], r ? SIGNAL[1] : TERNE[1], r ? SIGNAL[2] : TERNE[2]);
   texte(ctx, quitter, L / 2.f, 570.f, 110.f, r ? TERNE[0] : SIGNAL[0], r ? TERNE[1] : SIGNAL[1], r ? TERNE[2] : SIGNAL[2]);
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
      for (VPXTexture* t : { &blanc, &titre.tex, &reprendre.tex, &quitter.tex, &marque.tex })
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
