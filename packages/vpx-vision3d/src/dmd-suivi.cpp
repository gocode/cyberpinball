// license:GPLv3+
//
// Plugin VPX « CyberPinballDmd » : le DMD remplit sa fenêtre quand elle change de taille en partie.
//
// Dans le menu en partie, Cyber Pinball redimensionne la fenêtre « Visual Pinball Score View » de VPX à chaque
// réglage du DMD (largeur, hauteur, format : in-game-menu.ts, setWindowBounds, SetWindowPos d'un autre processus).
// Deux choses l'empêchaient de remplir sa nouvelle place avant la partie suivante (banc du 13 novembre 2026) :
// 1. SDL : la fenêtre est sans bordure et non redimensionnable (Window.cpp : SDL_WINDOW_BORDERLESS). Le SDL 3 de VPX
//    10.8.1 (SDL_windowsevents.c, WM_NCCALCSIZE) garde alors sa zone cliente à la taille que SDL lui connaît : le
//    cadre de la fenêtre change, pas la surface où VPX dessine, et VPX n'apprend jamais la nouvelle taille (ni
//    SDL_EVENT_WINDOW_RESIZED, ni Window::OnResized, ni nouvelle swapchain). Le plugin voit le cadre différer de la
//    zone cliente et donne la taille à SDL (SDL_SetWindowSize, sur le fil principal, dans le processus de VPX) :
//    SDL l'applique, VPX la reçoit et refait la surface de la fenêtre (RenderDevice, swapchain des fenêtres annexes).
// 2. ScoreView garde la mise en page (.scv) choisie à son premier rendu, à l'ancienne forme, et ne la rechoisit que
//    sur « Controller.OnDisplaysChanged » (ScoreView.cpp, OnResChanged). Le plugin regarde, à chaque image, la
//    taille cliente de la fenêtre, et diffuse ce message quand elle change (suivi-dmd.h).
//
// Le message est sûr : VPX le diffuse lui-même au début et à la fin de chaque partie et à chaque DMD de flasher
// ajouté ou retiré (VPXPluginAPIImpl::UpdateDMDSource). Ses abonnés relisent la liste des sources et reprennent
// la même : DMDUtil, Serum, VNI, PinMAME, flux d'événements de B2S, ScoreView et tout ResURIResolver ; PuP ne
// l'écoute pas. Rien d'autre : pas de rendu, pas de touche, pas de minuterie ; SDL n'est appelé que quand le cadre
// de la fenêtre a été changé de l'extérieur. Activé dans toutes les parties (Plugin.CyberPinballDmd,
// components.json), dans le casque compris, où la fenêtre n'est pas dessinée.
//
// Réglages ([Plugin.CyberPinballDmd]) :
//   LogFile : journal du plugin (vide : aucun) ;
//   Probe   : 1, sonde du banc (scripts/banc-dmd.mjs) : un rendu de la fenêtre Score View, placé devant ScoreView
//             ([ScoreView] Priority.CyberPinballDmd), qui le laisse dessiner et mesure la part de la fenêtre que
//             l'afficheur remplit, et un relevé des images. Jamais écrit par Cyber Pinball : sans lui, le plugin
//             ne dessine rien ;
//   Follow  : 1 par défaut ; 0, ni taille donnée à SDL ni diffusion ; 2, la taille donnée à SDL sans diffusion (le banc
//             compare les trois).

#define _CRT_SECURE_NO_WARNINGS
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>

#include "MsgPlugin.h"
#include "VPXPlugin.h"
#include "ControllerPlugin.h"
#include "suivi-dmd.h"

using namespace cyberpinball;

namespace {

const MsgPluginAPI* msgApi = nullptr;
VPXPluginAPI* vpxApi = nullptr;
uint32_t endpointId = 0;
unsigned int getVpxApiId = 0, onGameStartId = 0, onGameEndId = 0, onPrepareFrameId = 0, displaysChangedId = 0, getAuxRendererId = 0, auxChangedId = 0;

MSGPI_STRING_VAL_SETTING(fichierJournal, "LogFile", "Log file", "Where the plugin writes what it does, empty for none", true, "", 1024);
MSGPI_INT_VAL_SETTING(sondeActive, "Probe", "Probe", "1: measures how much of the Score View window the DMD fills (test bench)", true, 0, 1, 0);
MSGPI_INT_VAL_SETTING(suiviActif, "Follow", "Follow", "1: gives SDL the size set from outside and tells ScoreView (default); 0: neither; 2: SDL only (test bench, to compare)", true, 0, 2, 1);

constexpr wchar_t TITRE[] = L"Visual Pinball Score View";

double maintenant()
{
   return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

bool enPartie = false;
double debut = 0.0;

void ecrire(const char* ligne)
{
   if (!fichierJournal_Val[0])
      return;
   const int n = MultiByteToWideChar(CP_UTF8, 0, fichierJournal_Val, -1, nullptr, 0);
   std::wstring chemin(n > 0 ? n - 1 : 0, L'\0');
   if (n > 1)
      MultiByteToWideChar(CP_UTF8, 0, fichierJournal_Val, -1, chemin.data(), n);
   FILE* f = _wfopen(chemin.c_str(), L"ab");
   if (!f)
      return;
   std::fputs(ligne, f);
   std::fputc('\n', f);
   std::fclose(f);
}

// --- SDL 3 de VPX (SDL364.dll), déjà chargé dans le processus ----------------------------------

struct SDL_Window;
using SdlGetWindows = SDL_Window** (__cdecl*)(int*);
using SdlGetWindowProperties = uint32_t(__cdecl*)(SDL_Window*);
using SdlGetPointerProperty = void* (__cdecl*)(uint32_t, const char*, void*);
using SdlGetWindowSize = bool(__cdecl*)(SDL_Window*, int*, int*);
using SdlSetWindowSize = bool(__cdecl*)(SDL_Window*, int, int);
using SdlFree = void(__cdecl*)(void*);

struct Sdl
{
   bool essaye = false, ok = false;
   SdlGetWindows getWindows = nullptr;
   SdlGetWindowProperties getWindowProperties = nullptr;
   SdlGetPointerProperty getPointerProperty = nullptr;
   SdlGetWindowSize getWindowSize = nullptr;
   SdlSetWindowSize setWindowSize = nullptr;
   SdlFree libere = nullptr;
};
Sdl sdl;

/** Les fonctions de SDL, cherchées une fois ; false : introuvables (le plugin ne fait alors que diffuser). */
bool chargerSdl()
{
   if (sdl.essaye)
      return sdl.ok;
   sdl.essaye = true;
   HMODULE m = GetModuleHandleW(L"SDL364.dll");
   if (!m)
      m = GetModuleHandleW(L"SDL3.dll");
   if (!m)
   {
      ecrire("sdl absent");
      return false;
   }
   sdl.getWindows = reinterpret_cast<SdlGetWindows>(GetProcAddress(m, "SDL_GetWindows"));
   sdl.getWindowProperties = reinterpret_cast<SdlGetWindowProperties>(GetProcAddress(m, "SDL_GetWindowProperties"));
   sdl.getPointerProperty = reinterpret_cast<SdlGetPointerProperty>(GetProcAddress(m, "SDL_GetPointerProperty"));
   sdl.getWindowSize = reinterpret_cast<SdlGetWindowSize>(GetProcAddress(m, "SDL_GetWindowSize"));
   sdl.setWindowSize = reinterpret_cast<SdlSetWindowSize>(GetProcAddress(m, "SDL_SetWindowSize"));
   sdl.libere = reinterpret_cast<SdlFree>(GetProcAddress(m, "SDL_free"));
   sdl.ok = sdl.getWindows && sdl.getWindowProperties && sdl.getPointerProperty && sdl.getWindowSize && sdl.setWindowSize && sdl.libere;
   ecrire(sdl.ok ? "sdl ok" : "sdl incomplet");
   return sdl.ok;
}

/** La fenêtre SDL de cette fenêtre Windows (propriété « SDL.window.win32.hwnd »). */
SDL_Window* fenetreSdl(HWND hwnd)
{
   if (!chargerSdl())
      return nullptr;
   int n = 0;
   SDL_Window** liste = sdl.getWindows(&n);
   if (!liste)
      return nullptr;
   SDL_Window* trouvee = nullptr;
   for (int i = 0; i < n && !trouvee; i++)
      if (sdl.getPointerProperty(sdl.getWindowProperties(liste[i]), "SDL.window.win32.hwnd", nullptr) == hwnd)
         trouvee = liste[i];
   sdl.libere(liste);
   return trouvee;
}

// --- La fenêtre Score View de ce processus ---------------------------------------------------

struct Fenetre
{
   HWND hwnd = nullptr;
   SDL_Window* sdl = nullptr;
   double chercheeA = -10.0;
};
Fenetre fenetre;
SuiviTaille suivi;
int diffusions = 0;
int tailles = 0;
int appelsSonde = 0;

BOOL CALLBACK essayer(HWND hwnd, LPARAM param)
{
   DWORD pid = 0;
   GetWindowThreadProcessId(hwnd, &pid);
   if (pid != GetCurrentProcessId())
      return TRUE;
   wchar_t titre[64] {};
   GetWindowTextW(hwnd, titre, 64);
   if (std::wcscmp(titre, TITRE) != 0)
      return TRUE;
   *reinterpret_cast<HWND*>(param) = hwnd;
   return FALSE;
}

/** La fenêtre, cherchée au plus une fois par seconde tant qu'elle n'existe pas (Output = 0 : jamais). */
HWND laFenetre(double t)
{
   if (fenetre.hwnd && IsWindow(fenetre.hwnd))
      return fenetre.hwnd;
   if (fenetre.hwnd)
   {
      fenetre.hwnd = nullptr;
      fenetre.sdl = nullptr;
      suivi.remiseAZero();
   }
   if (t - fenetre.chercheeA < 1.0)
      return nullptr;
   fenetre.chercheeA = t;
   HWND trouvee = nullptr;
   EnumWindows(essayer, reinterpret_cast<LPARAM>(&trouvee));
   fenetre.hwnd = trouvee;
   return trouvee;
}

/**
 * Fenêtre sans bordure : son cadre et sa zone cliente ont la même taille. Un cadre différent est une taille posée de
 * l'extérieur (Cyber Pinball) que SDL n'a pas prise : elle lui est donnée, en points de SDL (la zone cliente, en
 * pixels, sur la taille que SDL lui connaît, donne l'échelle de l'écran).
 */
void donnerTaille(HWND hwnd, int l, int h, int cadreL, int cadreH, double t)
{
   if (cadreL <= 0 || cadreH <= 0 || l <= 0 || h <= 0 || (cadreL == l && cadreH == h))
      return;
   if (!fenetre.sdl)
      fenetre.sdl = fenetreSdl(hwnd);
   if (!fenetre.sdl)
      return;
   int sl = 0, sh = 0;
   if (!sdl.getWindowSize(fenetre.sdl, &sl, &sh) || sl <= 0 || sh <= 0)
      return;
   const int voulueL = static_cast<int>(std::lround(cadreL * static_cast<double>(sl) / l));
   const int voulueH = static_cast<int>(std::lround(cadreH * static_cast<double>(sh) / h));
   if (voulueL <= 0 || voulueH <= 0 || (voulueL == sl && voulueH == sh))
      return;
   // Une demande par taille, redite au plus toutes les 0,5 s si SDL ne l'a pas prise.
   static int demandeeL = 0, demandeeH = 0;
   static double demandeeA = -10.0;
   if (voulueL == demandeeL && voulueH == demandeeH && t - demandeeA < 0.5)
      return;
   demandeeL = voulueL;
   demandeeH = voulueH;
   demandeeA = t;
   const bool ok = sdl.setWindowSize(fenetre.sdl, voulueL, voulueH);
   // Le cadre a déjà cette taille : le SetWindowPos de SDL ne change rien, et Windows ne recalcule pas la zone
   // cliente. Recalcul demandé (WM_NCCALCSIZE, où SDL pose la taille en attente), sans bouger ni activer.
   SetWindowPos(hwnd, nullptr, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_NOACTIVATE);
   tailles++;
   char ligne[192];
   std::snprintf(ligne, sizeof(ligne), "taille t=%.2f cadre=%dx%d client=%dx%d sdl=%dx%d->%dx%d resultat=%s", t - debut, cadreL, cadreH, l, h, sl, sh, voulueL, voulueH, ok ? "ok" : "refuse");
   ecrire(ligne);
}

void MSGPIAPI onPrepareFrame(const unsigned int, void*, void*)
{
   if (!enPartie)
      return;
   const double t = maintenant();
   // Banc : les images comptées, dites toutes les 2 s (VPX qui ne rend plus se voit).
   static int images = 0;
   static double imagesA = -10.0;
   images++;
   HWND hwnd = laFenetre(t);
   if (sondeActive_Val && t - imagesA >= 2.0)
   {
      imagesA = t;
      RECT c {}, w {};
      if (hwnd)
      {
         GetClientRect(hwnd, &c);
         GetWindowRect(hwnd, &w);
      }
      char ligne[192];
      std::snprintf(ligne, sizeof(ligne), "images t=%.2f n=%d sonde=%d hwnd=%p client=%ldx%ld fenetre=%ldx%ld", t - debut, images, appelsSonde, static_cast<void*>(hwnd), c.right - c.left, c.bottom - c.top, w.right - w.left, w.bottom - w.top);
      ecrire(ligne);
   }
   if (!hwnd || !suiviActif_Val)
      return;
   RECT r {}, cadre {};
   if (!GetClientRect(hwnd, &r) || !GetWindowRect(hwnd, &cadre) || IsIconic(hwnd))
      return;
   donnerTaille(hwnd, r.right - r.left, r.bottom - r.top, cadre.right - cadre.left, cadre.bottom - cadre.top, t);
   if (!suivi.vue(r.right - r.left, r.bottom - r.top, t) || suiviActif_Val == 2)
      return;
   diffusions++;
   msgApi->BroadcastMsg(endpointId, displaysChangedId, nullptr);
   char ligne[128];
   std::snprintf(ligne, sizeof(ligne), "diffusion t=%.2f fenetre=%dx%d n=%d", t - debut, suivi.largeur(), suivi.hauteur(), diffusions);
   ecrire(ligne);
}

// --- Sonde du banc : part de la fenêtre remplie par l'afficheur --------------------------------

struct Sonde
{
   AncillaryRendererDef scoreView {};
   bool trouve = false;
   double chercheA = -10.0;
   VPXRenderContext2D* dehors = nullptr;
   float x0 = 0.f, y0 = 0.f, x1 = 0.f, y1 = 0.f;
   bool vu = false;
   float dernier = -2.f;
   int dernierL = 0, dernierH = 0;
   double ditA = -10.0;
   float brut[6] {}; // le dernier afficheur dessiné : x, y, l, h, et la surface source (l, h) posée par ScoreView
};
Sonde sonde;

void noter(VPXRenderContext2D* ctx, float x, float y, float w, float h)
{
   if (ctx->srcWidth <= 0.f || ctx->srcHeight <= 0.f)
      return;
   // Dans la fenêtre seulement : ce qui déborde ne la remplit pas.
   const float l = std::max(0.f, x / ctx->srcWidth), hh = std::max(0.f, y / ctx->srcHeight);
   const float r = std::min(1.f, (x + w) / ctx->srcWidth), b = std::min(1.f, (y + h) / ctx->srcHeight);
   if (r <= l || b <= hh)
      return;
   sonde.brut[0] = x;
   sonde.brut[1] = y;
   sonde.brut[2] = w;
   sonde.brut[3] = h;
   sonde.brut[4] = ctx->srcWidth;
   sonde.brut[5] = ctx->srcHeight;
   if (!sonde.vu)
   {
      sonde.x0 = l;
      sonde.y0 = hh;
      sonde.x1 = r;
      sonde.y1 = b;
      sonde.vu = true;
      return;
   }
   sonde.x0 = std::min(sonde.x0, l);
   sonde.y0 = std::min(sonde.y0, hh);
   sonde.x1 = std::max(sonde.x1, r);
   sonde.y1 = std::max(sonde.y1, b);
}

void suivre(VPXRenderContext2D* ctx)
{
   sonde.dehors->srcWidth = ctx->srcWidth;
   sonde.dehors->srcHeight = ctx->srcHeight;
}

void MSGPIAPI sondeImage(VPXRenderContext2D* ctx, VPXTexture texture, float tr, float tg, float tb, float a, float tx, float ty, float tw, float th, float px, float py, float rot, float x, float y, float w,
   float h)
{
   suivre(ctx);
   sonde.dehors->DrawImage(sonde.dehors, texture, tr, tg, tb, a, tx, ty, tw, th, px, py, rot, x, y, w, h);
}

void MSGPIAPI sondeAfficheur(VPXRenderContext2D* ctx, VPXDisplayRenderStyle style, VPXTexture glass, float gr, float gg, float gb, float rough, float gx, float gy, float gw, float gh, float ar, float ag, float ab,
   VPXTexture disp, float dr, float dg, float db, float bright, float alpha, float pl, float pt, float pr, float pb, float x, float y, float w, float h)
{
   suivre(ctx);
   noter(ctx, x, y, w, h);
   sonde.dehors->DrawDisplay(sonde.dehors, style, glass, gr, gg, gb, rough, gx, gy, gw, gh, ar, ag, ab, disp, dr, dg, db, bright, alpha, pl, pt, pr, pb, x, y, w, h);
}

void MSGPIAPI sondeSegments(VPXRenderContext2D* ctx, VPXSegDisplayRenderStyle style, VPXSegDisplayHint hint, VPXTexture glass, float gr, float gg, float gb, float rough, float gx, float gy, float gw, float gh,
   float ar, float ag, float ab, SegElementType type, const float* state, float dr, float dg, float db, float bright, float alpha, float pl, float pt, float pr, float pb, float x, float y, float w, float h)
{
   suivre(ctx);
   noter(ctx, x, y, w, h);
   sonde.dehors->DrawSegDisplay(sonde.dehors, style, hint, glass, gr, gg, gb, rough, gx, gy, gw, gh, ar, ag, ab, type, state, dr, dg, db, bright, alpha, pl, pt, pr, pb, x, y, w, h);
}

int MSGPIAPI rendreSonde(VPXRenderContext2D* ctx, void*)
{
   appelsSonde++;
   if (!ctx || !ctx->is2D || ctx->window != VPXWINDOW_ScoreView || !enPartie)
      return 0;
   const double t = maintenant();
   if (!sonde.trouve && t - sonde.chercheA >= 1.0)
   {
      sonde.chercheA = t;
      AncillaryRendererDef entrees[16] {};
      GetAncillaryRendererMsg m { VPXWINDOW_ScoreView, 16, 0, entrees };
      msgApi->BroadcastMsg(endpointId, getAuxRendererId, &m);
      for (unsigned int i = 0; i < m.count && i < 16; i++)
         if (entrees[i].id && std::strcmp(entrees[i].id, "ScoreView") == 0 && entrees[i].Render)
         {
            sonde.scoreView = entrees[i];
            sonde.trouve = true;
         }
   }
   if (!sonde.trouve)
      return 0;
   VPXRenderContext2D dedans = *ctx;
   dedans.DrawImage = sondeImage;
   dedans.DrawDisplay = sondeAfficheur;
   dedans.DrawSegDisplay = sondeSegments;
   sonde.dehors = ctx;
   sonde.vu = false;
   const int rendu = sonde.scoreView.Render(&dedans, sonde.scoreView.context);
   ctx->srcWidth = dedans.srcWidth;
   ctx->srcHeight = dedans.srcHeight;
   const float rempli = sonde.vu ? (sonde.x1 - sonde.x0) * (sonde.y1 - sonde.y0) : -1.f;
   const int l = static_cast<int>(std::lround(ctx->outWidth)), h = static_cast<int>(std::lround(ctx->outHeight));
   if (std::fabs(rempli - sonde.dernier) > 0.005f || l != sonde.dernierL || h != sonde.dernierH || t - sonde.ditA > 2.0)
   {
      sonde.dernier = rempli;
      sonde.dernierL = l;
      sonde.dernierH = h;
      sonde.ditA = t;
      char ligne[320];
      std::snprintf(ligne, sizeof(ligne), "sonde t=%.2f sortie=%dx%d rempli=%.3f zone=%.3f,%.3f,%.3f,%.3f afficheur=%.1f,%.1f,%.1f,%.1f source=%.1fx%.1f", t - debut, l, h, rempli, sonde.x0, sonde.y0, sonde.x1,
         sonde.y1, sonde.brut[0], sonde.brut[1], sonde.brut[2], sonde.brut[3], sonde.brut[4], sonde.brut[5]);
      ecrire(ligne);
   }
   return rendu;
}

void MSGPIAPI onGetAuxRenderer(const unsigned int, void*, void* data)
{
   auto* msg = static_cast<GetAncillaryRendererMsg*>(data);
   if (!msg || !sondeActive_Val || msg->window != VPXWINDOW_ScoreView)
      return;
   static AncillaryRendererDef def { "CyberPinballDmd", "DMD probe (Cyber Pinball)", "Test bench: lets ScoreView draw and measures how much of the window it fills", nullptr, rendreSonde };
   if (msg->count < msg->maxEntryCount && msg->entries)
      msg->entries[msg->count] = def;
   msg->count++;
}

void MSGPIAPI onGameStart(const unsigned int, void*, void*)
{
   enPartie = true;
   debut = maintenant();
   fenetre = Fenetre {};
   suivi.remiseAZero();
   diffusions = 0;
   tailles = 0;
   sonde = Sonde {};
   char ligne[64];
   std::snprintf(ligne, sizeof(ligne), "debut suivi=%d sonde=%d", static_cast<int>(suiviActif_Val), static_cast<int>(sondeActive_Val));
   ecrire(ligne);
}

void MSGPIAPI onGameEnd(const unsigned int, void*, void*)
{
   enPartie = false;
   fenetre = Fenetre {};
   char ligne[64];
   std::snprintf(ligne, sizeof(ligne), "fin diffusions=%d tailles=%d", diffusions, tailles);
   ecrire(ligne);
}

} // namespace

MSGPI_EXPORT void MSGPIAPI CyberPinballDmdPluginLoad(const uint32_t sessionId, const MsgPluginAPI* api)
{
   msgApi = api;
   endpointId = sessionId;
   msgApi->RegisterSetting(endpointId, &fichierJournal);
   msgApi->RegisterSetting(endpointId, &sondeActive);
   msgApi->RegisterSetting(endpointId, &suiviActif);
   msgApi->BroadcastMsg(endpointId, getVpxApiId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_MSG_GET_API), &vpxApi);
   displaysChangedId = msgApi->GetMsgID(CTLPI_NAMESPACE, CTLPI_DISPLAY_ON_SRC_CHG_MSG);
   msgApi->SubscribeMsg(endpointId, onGameStartId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_GAME_START), onGameStart, nullptr);
   msgApi->SubscribeMsg(endpointId, onGameEndId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_GAME_END), onGameEnd, nullptr);
   msgApi->SubscribeMsg(endpointId, onPrepareFrameId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_PREPARE_FRAME), onPrepareFrame, nullptr);
   msgApi->SubscribeMsg(endpointId, getAuxRendererId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_MSG_GET_AUX_RENDERER), onGetAuxRenderer, nullptr);
   // La sonde (banc seulement) : VPX relit la liste des rendus annexes.
   auxChangedId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_AUX_RENDERER_CHG);
   if (sondeActive_Val)
      msgApi->BroadcastMsg(endpointId, auxChangedId, nullptr);
}

MSGPI_EXPORT void MSGPIAPI CyberPinballDmdPluginUnload()
{
   enPartie = false;
   msgApi->UnsubscribeMsg(onGameStartId, onGameStart, nullptr);
   msgApi->UnsubscribeMsg(onGameEndId, onGameEnd, nullptr);
   msgApi->UnsubscribeMsg(onPrepareFrameId, onPrepareFrame, nullptr);
   msgApi->UnsubscribeMsg(getAuxRendererId, onGetAuxRenderer, nullptr);
   if (sondeActive_Val)
      msgApi->BroadcastMsg(endpointId, auxChangedId, nullptr);
   for (unsigned int id : { getVpxApiId, onGameStartId, onGameEndId, onPrepareFrameId, displaysChangedId, getAuxRendererId, auxChangedId })
      msgApi->ReleaseMsgID(id);
   vpxApi = nullptr;
   msgApi = nullptr;
}
