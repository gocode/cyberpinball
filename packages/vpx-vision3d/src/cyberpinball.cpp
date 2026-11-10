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
// - Fronton cadré : le rendu suivant (PuP, B2S) appelé à travers un contexte qui garde ses proportions.
// - Son des vidéos de PuP : les fenêtres que VPX ne dessine pas en VR (ScoreView, topper) sont dessinées
//   à vide à chaque image, sans quoi leur décodage piétine et le son arrive haché.
// - Fronton : la pause seulement pendant l'appui tenu ou le menu ouvert ; sinon il rend la main à
//   B2S ou PuP. En dernier recours (rien d'autre ne dessine), un fond opaque plutôt que du vide.
// - Hors du casque (fenêtre du fronton d'une borne, rendu 2D), il ne dessine jamais. Cyber Pinball ne
//   l'active d'ailleurs que dans l'INI des parties dans le casque ([Plugin.CyberPinball] Enable = 1).
//
// Réglages ([Plugin.CyberPinball], écrits par Cyber Pinball dans la langue de l'application) :
//   Pause, Resume, Quit, Help (rappel des touches, lignes séparées par « · »), ResumeHint : les libellés ;
//   Order : les rendus du fronton à cadrer, dans l'ordre ; PupRatio : la forme du fronton de PuP ;
//   Zone : la partie visible du fronton (fronton-vr.ts) ; LogFile, CaptureDir : mesures et captures.

#define _CRT_SECURE_NO_WARNINGS
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <algorithm>
#include <chrono>
#include <cstring>
#include <map>
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
MSGPI_STRING_VAL_SETTING(ordreFronton, "Order", "Backglass order", "Backglass renderers drawn framed by the plugin, in order (ids, comma separated)", true, "PUP,B2S", 256);
MSGPI_FLOAT_VAL_SETTING(pupRatio, "PupRatio", "PuP backglass ratio", "Width over height of the PuP backglass", true, 0.5f, 4.f, 0.01f, 1.7778f);
MSGPI_STRING_VAL_SETTING(zoneFronton, "Zone", "Visible backglass area", "Left,top,right,bottom fractions of the backglass that the VR room leaves visible", true, "0,0,1,1", 64);
MSGPI_STRING_VAL_SETTING(fichierMesures, "LogFile", "Measures file", "Where the plugin writes its measures, empty for none", true, "", 1024);
MSGPI_STRING_VAL_SETTING(dossierCaptures, "CaptureDir", "Captures folder", "Where the plugin saves captures of the VR preview, empty for none", true, "", 1024);

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

// --- Son des vidéos de PuP dans le casque ----------------------------------------------------
//
// VPX 10.8.1 ne rend pas les fenêtres annexes en VR (player.cpp : « Ancillary windows are not yet supported
// while in VR mode ») : un écran de PuP que rien ne dessine dans la scène (FullDMD sur le ScoreView, topper,
// et le fronton quand la pièce VR en a un en image) n'est jamais dessiné. Or le lecteur de PuP règle son
// décodage sur les images dessinées (PUPMediaPlayer::Run : « the synchronization entirely rely on the fact
// that HandleVideoFrame will block, waiting for a free slot in the circular frame buffer ») : sans dessin,
// le décodage avance par à-coups, le son de ces vidéos n'a plus d'avance et arrive haché (essai du
// 10 novembre 2026, The Matrix). Le plugin fait dessiner à vide, à chaque image, chaque fenêtre de PuP que
// VPX n'a pas demandée : une petite surface, des fonctions de dessin qui ne font rien.

struct Pompe
{
   VPXWindowId fenetre;
   AncillaryRendererDef pup {};
   bool trouve = false;
   double essai = -10.0;
   double dessineeA = -10.0; // dernière fois que VPX a demandé cette fenêtre (rendu « Veille »)
};
Pompe pompes[] = { { VPXWINDOW_Backglass }, { VPXWINDOW_ScoreView }, { VPXWINDOW_Topper } };
int pompees = 0; // fenêtres pompées à la dernière image (journal)

void MSGPIAPI rienImage(VPXRenderContext2D*, VPXTexture, float, float, float, float, float, float, float, float, float, float, float, float, float, float, float) { }
void MSGPIAPI rienAfficheur(VPXRenderContext2D*, VPXDisplayRenderStyle, VPXTexture, float, float, float, float, float, float, float, float, float, float, float, VPXTexture, float, float, float, float, float,
   float, float, float, float, float, float, float, float)
{
}
void MSGPIAPI rienSegments(VPXRenderContext2D*, VPXSegDisplayRenderStyle, VPXSegDisplayHint, VPXTexture, float, float, float, float, float, float, float, float, float, float, float, SegElementType,
   const float*, float, float, float, float, float, float, float, float, float, float, float, float, float)
{
}

void chercherPup(Pompe& p, double t)
{
   if (p.trouve || t - p.essai < 1.0)
      return;
   p.essai = t;
   AncillaryRendererDef entrees[16] {};
   GetAncillaryRendererMsg m { p.fenetre, 16, 0, entrees };
   msgApi->BroadcastMsg(endpointId, getAuxRendererId, &m);
   for (unsigned int i = 0; i < m.count && i < 16; i++)
      if (entrees[i].id && std::strcmp(entrees[i].id, "PUP") == 0 && entrees[i].Render)
      {
         p.pup = entrees[i];
         p.trouve = true;
      }
}

/** À chaque image : les fenêtres de PuP que VPX n'a pas dessinées depuis 0,3 s sont dessinées à vide. */
void pomper(double t)
{
   pompees = 0;
   for (Pompe& p : pompes)
   {
      const double demandee = p.fenetre == VPXWINDOW_Backglass ? derniereDemande : p.dessineeA;
      if (t - demandee < 0.3)
         continue;
      chercherPup(p, t);
      if (!p.trouve)
         continue;
      VPXRenderContext2D ctx {};
      ctx.window = p.fenetre;
      ctx.is2D = 1;
      ctx.outWidth = ctx.srcWidth = 320.f;
      ctx.outHeight = ctx.srcHeight = 180.f;
      ctx.DrawImage = rienImage;
      ctx.DrawDisplay = rienAfficheur;
      ctx.DrawSegDisplay = rienSegments;
      p.pup.Render(&ctx, p.pup.context);
      pompees++;
   }
}

/** Veille sur le ScoreView et le topper : note que VPX les dessine (un flasher de la pièce VR), sans rien dessiner. */
int MSGPIAPI veiller(VPXRenderContext2D* ctx, void*)
{
   if (ctx)
      for (Pompe& p : pompes)
         if (p.fenetre == ctx->window)
            p.dessineeA = maintenant();
   return 0;
}

// --- Mesures et captures (essai du casque) ------------------------------------------------------
//
// Pour juger sur pièces (essai du 10 novembre 2026 : fronton coupé, vidéos de PuP hachées) : toutes les 5 s,
// le plugin écrit ce qu'il mesure dans [Plugin.CyberPinball] LogFile (Cyber Pinball le reporte au journal) :
// images de VPX par seconde et plus grand écart entre deux, fois où VPX dessine le fronton, fois où PuP
// dessine, nouvelles images de la vidéo de PuP la plus active (texture changée à la même place : PuP en
// crée une neuve à chaque image, PUPMediaPlayer::Render), vitesse du temps de jeu, fenêtres pompées. Et il
// capture deux fois par partie la fenêtre d'aperçu VR de VPX (8 s après le début, puis au premier menu de
// pause), sans rien montrer à l'écran (PrintWindow ; si l'image est noire, la zone de l'écran sous la
// fenêtre), en PNG dans [Plugin.CyberPinball] CaptureDir. Lignes en ASCII « clé=valeur ».

struct Mesures
{
   double debut = -1.0, fenetre = -1.0, derniere = -1.0, ecartMax = 0.0, jeu0 = 0.0;
   int images = 0, frontons = 0, pup = 0, pompees = 0;
   std::map<uint64_t, std::pair<VPXTexture, int>> videos; // place dessinée -> dernière texture, changements
   bool captureDebut = false, capturePause = false;
   double menuDepuis = -1.0;
};
Mesures mesures;

std::wstring large(const char* utf8)
{
   const int n = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, nullptr, 0);
   std::wstring w(n > 0 ? n - 1 : 0, L'\0');
   if (n > 1)
      MultiByteToWideChar(CP_UTF8, 0, utf8, -1, w.data(), n);
   return w;
}

void ecrire(const std::string& ligne)
{
   if (!fichierMesures_Val[0])
      return;
   FILE* f = _wfopen(large(fichierMesures_Val).c_str(), L"ab");
   if (!f)
      return;
   std::fputs(ligne.c_str(), f);
   std::fputs("\n", f);
   std::fclose(f);
}

void noterVideo(VPXTexture tex, float x, float y, float w, float h)
{
   const uint64_t cle = (static_cast<uint64_t>(static_cast<uint16_t>(x)) << 48) | (static_cast<uint64_t>(static_cast<uint16_t>(y)) << 32)
      | (static_cast<uint64_t>(static_cast<uint16_t>(w)) << 16) | static_cast<uint64_t>(static_cast<uint16_t>(h));
   auto& v = mesures.videos[cle];
   if (v.first != tex)
   {
      v.first = tex;
      v.second++;
   }
}

/** À chaque image : compte, et toutes les 5 s, la ligne de mesures. */
void mesurer(double t, double jeu)
{
   if (mesures.debut < 0.0)
   {
      mesures.debut = mesures.fenetre = t;
      mesures.jeu0 = jeu;
   }
   if (mesures.derniere >= 0.0)
      mesures.ecartMax = std::max(mesures.ecartMax, t - mesures.derniere);
   mesures.derniere = t;
   mesures.images++;
   mesures.pompees += pompees;
   const double duree = t - mesures.fenetre;
   if (duree < 5.0)
      return;
   int video = 0;
   for (const auto& [cle, v] : mesures.videos)
      video = std::max(video, v.second);
   char ligne[512];
   std::snprintf(ligne, sizeof(ligne), "mesure t=%.0f vpx=%.1f ecart_ms=%.0f fronton=%.1f pup=%.1f video=%.1f jeu=%.2f pompees=%.1f zone=%s", t - mesures.debut, mesures.images / duree,
      mesures.ecartMax * 1000.0, mesures.frontons / duree, mesures.pup / duree, video / duree, (jeu - mesures.jeu0) / duree, mesures.pompees / duree, zoneFronton_Val);
   ecrire(ligne);
   mesures.fenetre = t;
   mesures.jeu0 = jeu;
   mesures.images = mesures.frontons = mesures.pup = mesures.pompees = 0;
   mesures.ecartMax = 0.0;
   for (auto& [cle, v] : mesures.videos)
      v.second = 0;
}

// --- Cadrage du fronton dans le casque -------------------------------------------------------
//
// VPX dessine un rendu annexe sur toute la surface du flasher du fronton, quelle que soit sa forme : le
// fronton que VPX pose en VR est en 4:3 (1,2 × la largeur de la table, player.cpp), et le contenu y est
// étiré (B2S : son image ; PuP : son écran racine posé sur toute la surface, PUPManager::Render). Le plugin,
// en tête des rendus du fronton, appelle lui-même le rendu suivant (l'ordre écrit par Cyber Pinball,
// [Plugin.CyberPinball] Order) à travers un contexte intermédiaire : ce que le rendu dessine dans sa propre
// surface (srcWidth × srcHeight) est posé, proportions gardées, centré, dans le fronton ; les bandes restent
// noires (le flasher dessine d'abord un fond noir, flasher.cpp). PuP ne connaît pas sa forme : celle de son
// fronton lui est donnée ([Plugin.CyberPinball] PupRatio, 16:9 par défaut).

struct Cadre
{
   VPXRenderContext2D* dehors = nullptr; // le vrai contexte de VPX
   VPXRenderContext2D dedans {};         // celui que voit le rendu appelé
   Rect zone {};                         // la partie visible du fronton, dans la surface du flasher
   bool pup = false;                     // le rendu appelé est PuP (mesure de ses vidéos)
};
Cadre cadre;

/** Un nombre « 0.5333 » (point décimal, quelle que soit la langue du système). */
float lireNombre(const char*& p)
{
   while (*p == ' ' || *p == ',')
      p++;
   float v = 0.f, f = 0.f;
   bool chiffre = false;
   for (; (*p >= '0' && *p <= '9') || *p == '.'; p++)
   {
      if (*p == '.')
         f = 1.f;
      else
      {
         chiffre = true;
         if (f > 0.f)
            v += (*p - '0') * (f *= 0.1f);
         else
            v = v * 10.f + (*p - '0');
      }
   }
   return chiffre ? v : -1.f;
}

/**
 * La partie visible du fronton ([Plugin.CyberPinball] Zone, calculée par Cyber Pinball d'après la pièce VR de
 * la table, fronton-vr.ts), dans la surface du flasher ; tout le fronton si elle manque ou ne tient pas debout.
 */
Rect zoneVisible(const VPXRenderContext2D* ctx)
{
   const char* p = zoneFronton_Val;
   float l = lireNombre(p), t = lireNombre(p), r = lireNombre(p), b = lireNombre(p);
   if (l < 0.f || t < 0.f || r > 1.001f || b > 1.001f || r - l < 0.1f || b - t < 0.1f)
      l = 0.f, t = 0.f, r = 1.f, b = 1.f;
   return { l * ctx->outWidth, t * ctx->outHeight, (r - l) * ctx->outWidth, (b - t) * ctx->outHeight };
}

/** Rectangle (x, y, l, h) de la surface du rendu appelé, dans celle du fronton : proportions gardées, centré. */
void placer(float x, float y, float l, float h, float& X, float& Y, float& L2, float& H2)
{
   const Rect r = cadrer(cadre.dedans.srcWidth, cadre.dedans.srcHeight, cadre.zone.l, cadre.zone.h, { x, y, l, h });
   X = cadre.zone.x + r.x;
   Y = cadre.zone.y + r.y;
   L2 = r.l;
   H2 = r.h;
}

void MSGPIAPI cadreImage(VPXRenderContext2D*, VPXTexture texture, float tintR, float tintG, float tintB, float alpha, float texX, float texY, float texW, float texH, float pivotX, float pivotY,
   float rotation, float srcX, float srcY, float srcW, float srcH)
{
   float x, y, w, h;
   placer(srcX, srcY, srcW, srcH, x, y, w, h);
   if (cadre.pup)
      noterVideo(texture, x, y, w, h);
   cadre.dehors->DrawImage(cadre.dehors, texture, tintR, tintG, tintB, alpha, texX, texY, texW, texH, pivotX, pivotY, rotation, x, y, w, h);
}

void MSGPIAPI cadreAfficheur(VPXRenderContext2D*, VPXDisplayRenderStyle style, VPXTexture glassTex, float glassTintR, float glassTintG, float glassTintB, float glassRoughness, float glassAreaX,
   float glassAreaY, float glassAreaW, float glassAreaH, float glassAmbientR, float glassAmbientG, float glassAmbientB, VPXTexture dispTex, float dispTintR, float dispTintG, float dispTintB,
   float brightness, float alpha, float dispPadL, float dispPadT, float dispPadR, float dispPadB, float srcX, float srcY, float srcW, float srcH)
{
   float x, y, w, h;
   placer(srcX, srcY, srcW, srcH, x, y, w, h);
   cadre.dehors->DrawDisplay(cadre.dehors, style, glassTex, glassTintR, glassTintG, glassTintB, glassRoughness, glassAreaX, glassAreaY, glassAreaW, glassAreaH, glassAmbientR, glassAmbientG,
      glassAmbientB, dispTex, dispTintR, dispTintG, dispTintB, brightness, alpha, dispPadL, dispPadT, dispPadR, dispPadB, x, y, w, h);
}

void MSGPIAPI cadreSegments(VPXRenderContext2D*, VPXSegDisplayRenderStyle style, VPXSegDisplayHint shapeHint, VPXTexture glassTex, float glassTintR, float glassTintG, float glassTintB,
   float glassRoughness, float glassAreaX, float glassAreaY, float glassAreaW, float glassAreaH, float glassAmbientR, float glassAmbientG, float glassAmbientB, SegElementType type,
   const float* state, float dispTintR, float dispTintG, float dispTintB, float brightness, float alpha, float dispPadL, float dispPadT, float dispPadR, float dispPadB, float srcX, float srcY,
   float srcW, float srcH)
{
   float x, y, w, h;
   placer(srcX, srcY, srcW, srcH, x, y, w, h);
   cadre.dehors->DrawSegDisplay(cadre.dehors, style, shapeHint, glassTex, glassTintR, glassTintG, glassTintB, glassRoughness, glassAreaX, glassAreaY, glassAreaW, glassAreaH, glassAmbientR,
      glassAmbientG, glassAmbientB, type, state, dispTintR, dispTintG, dispTintB, brightness, alpha, dispPadL, dispPadT, dispPadR, dispPadB, x, y, w, h);
}

/** Les rendus du fronton, dans l'ordre écrit par Cyber Pinball (« PUP,B2S »), relus à chaque changement. */
struct Suivant
{
   std::string id;
   AncillaryRendererDef def {};
   bool trouve = false;
};
std::vector<Suivant> suivants;
std::string ordreLu;
double suivantsCherchesA = -10.0;

void chercherSuivants(double t)
{
   if (ordreLu != ordreFronton_Val)
   {
      ordreLu = ordreFronton_Val;
      suivants.clear();
      size_t debut = 0;
      while (debut < ordreLu.size())
      {
         const size_t fin = ordreLu.find(',', debut);
         const std::string id = ordreLu.substr(debut, fin == std::string::npos ? std::string::npos : fin - debut);
         if (!id.empty() && id.rfind("CyberPinball.", 0) != 0)
            suivants.push_back({ id });
         if (fin == std::string::npos)
            break;
         debut = fin + 1;
      }
      suivantsCherchesA = -10.0;
   }
   bool manque = false;
   for (const Suivant& s : suivants)
      manque |= !s.trouve;
   if (!manque || t - suivantsCherchesA < 1.0)
      return;
   suivantsCherchesA = t;
   AncillaryRendererDef entrees[16] {};
   GetAncillaryRendererMsg m { VPXWINDOW_Backglass, 16, 0, entrees };
   msgApi->BroadcastMsg(endpointId, getAuxRendererId, &m);
   for (Suivant& s : suivants)
      for (unsigned int i = 0; i < m.count && i < 16; i++)
         if (entrees[i].id && s.id == entrees[i].id && entrees[i].Render)
         {
            s.def = entrees[i];
            s.trouve = true;
         }
}

/**
 * Le fronton hors de la pause : le premier rendu de l'ordre qui dessine, cadré. 0 si aucun (VPX continue
 * alors sa propre liste, jusqu'au fond opaque).
 */
int dessinerCadre(VPXRenderContext2D* ctx, double t)
{
   chercherSuivants(t);
   for (const Suivant& s : suivants)
   {
      if (!s.trouve)
         continue;
      cadre.dehors = ctx;
      cadre.dedans = *ctx;
      cadre.zone = zoneVisible(ctx);
      cadre.pup = s.id == "PUP";
      cadre.dedans.outWidth = cadre.zone.l;
      cadre.dedans.outHeight = cadre.zone.h;
      cadre.dedans.DrawImage = cadreImage;
      cadre.dedans.DrawDisplay = cadreAfficheur;
      cadre.dedans.DrawSegDisplay = cadreSegments;
      // PuP pose son écran racine sur toute sa surface (srcWidth = outWidth) : la forme de son fronton.
      if (s.id == "PUP")
      {
         const float ratio = pupRatio_Val > 0.1f ? pupRatio_Val : 16.f / 9.f;
         if (cadre.zone.l / cadre.zone.h < ratio)
            cadre.dedans.outHeight = cadre.zone.l / ratio;
         else
            cadre.dedans.outWidth = cadre.zone.h * ratio;
      }
      cadre.dedans.srcWidth = cadre.dedans.outWidth;
      cadre.dedans.srcHeight = cadre.dedans.outHeight;
      // Le fronton du rendu appelé s'étend sur la surface de VPX telle qu'elle est : srcWidth/srcHeight de dehors.
      ctx->srcWidth = ctx->outWidth;
      ctx->srcHeight = ctx->outHeight;
      const int dessine = s.def.Render(&cadre.dedans, s.def.context);
      cadre.dehors = nullptr;
      if (dessine)
      {
         if (cadre.pup)
            mesures.pup++;
         return 1;
      }
   }
   return 0;
}

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

/** Écrit une image RGB en PNG (encoderPng, pause.h). */
bool ecrirePng(const std::wstring& chemin, int w, int h, const std::vector<uint8_t>& rgb)
{
   const std::vector<uint8_t> png = encoderPng(w, h, rgb);
   FILE* f = _wfopen(chemin.c_str(), L"wb");
   if (!f)
      return false;
   const bool ok = std::fwrite(png.data(), 1, png.size(), f) == png.size();
   std::fclose(f);
   return ok;
}

/** La fenêtre d'aperçu VR de VPX, capturée à moitié de sa taille, en PNG ; rien n'est montré à l'écran. */
void capturer(const char* nom)
{
   if (!dossierCaptures_Val[0])
      return;
   const std::vector<HWND> fenetres = fenetresVpx();
   if (fenetres.empty())
   {
      ecrire(std::string("capture nom=") + nom + " resultat=aucune_fenetre");
      return;
   }
   const HWND w = fenetres.front();
   RECT rc {};
   GetClientRect(w, &rc);
   const int L2 = rc.right - rc.left, H2 = rc.bottom - rc.top;
   if (L2 < 4 || H2 < 4)
      return;
   HDC dcFenetre = GetDC(w);
   HDC dc = CreateCompatibleDC(dcFenetre);
   HBITMAP bmp = CreateCompatibleBitmap(dcFenetre, L2, H2);
   HGDIOBJ ancien = SelectObject(dc, bmp);
   BITMAPINFO bi {};
   bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
   bi.bmiHeader.biWidth = L2;
   bi.bmiHeader.biHeight = -H2;
   bi.bmiHeader.biPlanes = 1;
   bi.bmiHeader.biBitCount = 32;
   bi.bmiHeader.biCompression = BI_RGB;
   std::vector<uint8_t> px(static_cast<size_t>(L2) * H2 * 4);
   const auto lire = [&]() -> double
   {
      GetDIBits(dc, bmp, 0, H2, px.data(), &bi, DIB_RGB_COLORS);
      double s = 0.0;
      for (size_t i = 0; i < px.size(); i += 4 * 97)
         s += px[i] + px[i + 1] + px[i + 2];
      return s / (3.0 * (px.size() / (4 * 97) + 1));
   };
   constexpr UINT PW_RENDERFULLCONTENT_ = 0x00000002;
   PrintWindow(w, dc, PW_CLIENTONLY | PW_RENDERFULLCONTENT_);
   double lum = lire();
   const char* source = "fenetre";
   if (lum < 2.0)
   {
      // Image noire (rendu DirectX que PrintWindow ne voit pas) : ce que l'écran montre sous la fenêtre.
      POINT p { 0, 0 };
      ClientToScreen(w, &p);
      HDC ecran = GetDC(nullptr);
      BitBlt(dc, 0, 0, L2, H2, ecran, p.x, p.y, SRCCOPY);
      ReleaseDC(nullptr, ecran);
      lum = lire();
      source = "ecran";
   }
   SelectObject(dc, ancien);
   DeleteObject(bmp);
   DeleteDC(dc);
   ReleaseDC(w, dcFenetre);
   // Moitié de la taille (moyenne de 2 × 2), en RGB.
   const int l = L2 / 2, h = H2 / 2;
   std::vector<uint8_t> rgb(static_cast<size_t>(l) * h * 3);
   for (int y = 0; y < h; y++)
      for (int x = 0; x < l; x++)
         for (int c = 0; c < 3; c++)
         {
            int s = 0;
            for (int dy = 0; dy < 2; dy++)
               for (int dx = 0; dx < 2; dx++)
                  s += px[(static_cast<size_t>(2 * y + dy) * L2 + 2 * x + dx) * 4 + (2 - c)];
            rgb[(static_cast<size_t>(y) * l + x) * 3 + c] = static_cast<uint8_t>(s / 4);
         }
   SYSTEMTIME st {};
   GetLocalTime(&st);
   wchar_t fichier[64];
   swprintf(fichier, 64, L"\\vr-%04d%02d%02d-%02d%02d%02d-", st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
   const std::wstring chemin = large(dossierCaptures_Val) + fichier + large(nom) + L".png";
   const bool ok = ecrirePng(chemin, l, h, rgb);
   char ligne[256];
   std::snprintf(ligne, sizeof(ligne), "capture nom=%s source=%s luminosite=%.0f taille=%dx%d resultat=%s", nom, source, lum, l, h, ok ? "ok" : "echec");
   ecrire(ligne);
}

/** Les deux captures d'une partie : 8 s après le début, et au premier menu de pause affiché 0,6 s. */
void capturesDuJour(double t)
{
   if (!mesures.captureDebut && mesures.debut >= 0.0 && t - mesures.debut >= 8.0)
   {
      mesures.captureDebut = true;
      capturer("debut");
   }
   if (pause.menuVisible())
   {
      if (mesures.menuDepuis < 0.0)
         mesures.menuDepuis = t;
      if (!mesures.capturePause && t - mesures.menuDepuis >= 0.6)
      {
         mesures.capturePause = true;
         capturer("pause");
      }
   }
   else
      mesures.menuDepuis = -1.0;
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
   const double jeu = vpxApi->GetGameTime();
   appliquer(pause.image(t, jeu));
   pomper(t);
   mesurer(t, jeu);
   capturesDuJour(t);
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
   for (Pompe& p : pompes)
      p = Pompe { p.fenetre };
   ordreLu.clear();
   mesures = Mesures {};
   ecrire(std::string("debut zone=") + zoneFronton_Val + " ordre=" + ordreFronton_Val);
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

// La pause dessinée dans un repère de 1000 × 750 (4:3), posé proportions gardées dans la partie visible du
// fronton (zoneVisible), centré : `cible` est ce repère dans la surface du flasher.
constexpr float L = 1000.f, H = 750.f;
Rect cible { 0.f, 0.f, L, H };

/** Prépare le dessin : surface du flasher, zone visible remplie du fond, repère de la pause placé dedans. */
void poser(VPXRenderContext2D* ctx, const float* fond)
{
   ctx->srcWidth = ctx->outWidth;
   ctx->srcHeight = ctx->outHeight;
   const Rect zone = zoneVisible(ctx);
   const Rect r = cadrer(L, H, zone.l, zone.h, { 0.f, 0.f, L, H });
   cible = { zone.x + r.x, zone.y + r.y, r.l, r.h };
   ctx->DrawImage(ctx, blanc, fond[0], fond[1], fond[2], 1.f, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, 0.f, zone.x, zone.y, zone.l, zone.h);
}

void rectangle(VPXRenderContext2D* ctx, float x, float y, float w, float h, float r, float g, float b, float a = 1.f, float rotation = 0.f)
{
   const float s = cible.l / L;
   ctx->DrawImage(ctx, blanc, r, g, b, a, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, rotation, cible.x + x * s, cible.y + y * s, w * s, h * s);
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
   const float s = cible.l / L;
   ctx->DrawImage(ctx, img.tex, r, g, b, 1.f, 0.f, 0.f, static_cast<float>(img.l), static_cast<float>(img.h), 0.f, 0.f, 0.f, cible.x + (cx - w / 2.f) * s, cible.y + (cy - hauteur / 2.f) * s, w * s,
      hauteur * s);
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
   mesures.frontons++;
   const bool tenu = pause.jaugeVisible(t);
   if (!pause.affichee(t))
      return dessinerCadre(ctx, t);
   preparerTout();
   poser(ctx, FOND);
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
   poser(ctx, FOND);
   texte(ctx, marque, L / 2.f, H / 2.f, 60.f, TERNE[0], TERNE[1], TERNE[2]);
   return 1;
}

void MSGPIAPI onGetAuxRenderer(const unsigned int, void*, void* data)
{
   auto* msg = static_cast<GetAncillaryRendererMsg*>(data);
   if (!msg)
      return;
   static AncillaryRendererDef pauseDef { "CyberPinball.Pause", "Pause (Cyber Pinball)", "Pause and quit gauge in the headset, backglass framed", nullptr, dessinerPause };
   static AncillaryRendererDef fondDef { "CyberPinball.Fond", "Background (Cyber Pinball)", "Opaque background when nothing else draws the backglass in the headset", nullptr, dessinerFond };
   static AncillaryRendererDef veilleDef { "CyberPinball.Veille", "Watch (Cyber Pinball)", "Notes that VPX draws this window in the headset, draws nothing", nullptr, veiller };
   const auto ajouter = [msg](const AncillaryRendererDef& def)
   {
      if (msg->count < msg->maxEntryCount && msg->entries)
         msg->entries[msg->count] = def;
      msg->count++;
   };
   if (msg->window == VPXWINDOW_Backglass)
   {
      ajouter(pauseDef);
      ajouter(fondDef);
   }
   else if (msg->window == VPXWINDOW_ScoreView || msg->window == VPXWINDOW_Topper)
      ajouter(veilleDef);
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
   msgApi->RegisterSetting(endpointId, &ordreFronton);
   msgApi->RegisterSetting(endpointId, &pupRatio);
   msgApi->RegisterSetting(endpointId, &zoneFronton);
   msgApi->RegisterSetting(endpointId, &fichierMesures);
   msgApi->RegisterSetting(endpointId, &dossierCaptures);
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
