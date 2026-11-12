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
//   Zone : la partie visible du fronton (fronton-vr.ts) ; LogFile, CaptureDir : mesures et captures ;
//   RoomDmd : la source publiée pour le cadre DMD de la pièce VR de la table (PUP, image, ou aucune).

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
MSGPI_STRING_VAL_SETTING(ordreDmd, "DmdOrder", "DMD order", "DMD renderers drawn by the plugin under the backglass, in order (ids, comma separated)", true, "PUP,ScoreView,B2S", 256);
MSGPI_FLOAT_VAL_SETTING(bandeDmd, "DmdBand", "DMD band", "Height of the DMD band under the backglass, part of the visible backglass (0: none)", true, 0.f, 0.5f, 0.01f, 0.f);
MSGPI_STRING_VAL_SETTING(imageFronton, "BackglassImage", "Backglass image", "Image drawn when no renderer draws the backglass", true, "", 1024);
MSGPI_STRING_VAL_SETTING(imageDmd, "DmdImage", "DMD image", "Image drawn when no renderer draws the DMD", true, "", 1024);
MSGPI_STRING_VAL_SETTING(zoneFronton, "Zone", "Visible backglass area", "Left,top,right,bottom fractions of the backglass that the VR room leaves visible", true, "0,0,1,1", 64);
MSGPI_STRING_VAL_SETTING(fichierMesures, "LogFile", "Measures file", "Where the plugin writes its measures, empty for none", true, "", 1024);
MSGPI_STRING_VAL_SETTING(dossierCaptures, "CaptureDir", "Captures folder", "Where the plugin saves captures of the VR preview, empty for none", true, "", 1024);
MSGPI_FLOAT_VAL_SETTING(pupDmdRatio, "PupDmdRatio", "PuP DMD ratio", "Width over height of the PuP DMD screen, until learned from what PuP draws", true, 0.5f, 8.f, 0.01f, 1.7778f);
MSGPI_STRING_VAL_SETTING(reglagesEcrans, "Screens", "Screens adjustment", "Player adjustment, saved for the table: fronton=dx,dy,size;dmd=dx,dy,size", true, "", 128);
MSGPI_STRING_VAL_SETTING(idTable, "TableId", "Table id", "Table id written in the measures (no spaces)", true, "", 256);
MSGPI_STRING_VAL_SETTING(libelleAjuster, "AdjustLabel", "Adjust label", "Pause choice that adjusts the screens", true, "Adjust screens", 64);
MSGPI_STRING_VAL_SETTING(libelleEcranFronton, "BackglassLabel", "Backglass label", "Name of the backglass screen", true, "Backglass", 64);
MSGPI_STRING_VAL_SETTING(libelleEcranDmd, "DmdLabel", "DMD label", "Name of the DMD screen", true, "DMD", 64);
MSGPI_STRING_VAL_SETTING(aideChoixEcran, "AdjustChooseHelp", "Choose screen help", "Keys reminder while choosing the screen", true, "Stick: choose - A: adjust - B: back", 128);
MSGPI_STRING_VAL_SETTING(aideReglage, "AdjustHelp", "Adjust help", "Keys reminder while adjusting", true, "Sticks: position - Grips: size - A: keep - B: back", 128);

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

/**
 * Remplissage de chaque cadre à sa dernière image (part de sa zone visible couverte par la source, -1 : rien
 * dessiné), écrit avec les mesures : Cyber Pinball dit au journal et dans la santé de la borne un cadre mal
 * rempli (sous REMPLI_MIN), avant que le joueur le voie.
 */
struct Remplissage
{
   float fronton = -1.f, dmd = -1.f, salle = -1.f;
};
Remplissage remplissage;

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
   char ligne[640];
   std::snprintf(ligne, sizeof(ligne), "mesure t=%.0f vpx=%.1f ecart_ms=%.0f fronton=%.1f pup=%.1f video=%.1f jeu=%.2f pompees=%.1f zone=%s remplir_fronton=%.2f remplir_dmd=%.2f remplir_salle=%.2f",
      t - mesures.debut, mesures.images / duree, mesures.ecartMax * 1000.0, mesures.frontons / duree, mesures.pup / duree, video / duree, (jeu - mesures.jeu0) / duree, mesures.pompees / duree,
      zoneFronton_Val, remplissage.fronton, remplissage.dmd, remplissage.salle);
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
   Reglage reglage {};                   // réglage du joueur pour ce cadre (pause, « Ajuster les écrans »)
   Rect couvert {};                      // ce que le rendu a couvert, dans la zone : la mesure du remplissage
};
Cadre cadre;

/**
 * Proportions apprises de PuP, par fenêtre (0 fronton, 1 DMD) : PuP pose son écran racine sur toute la surface
 * qu'on lui donne, quelle que soit sa forme ; la plus grande image qu'il pose sur toute la surface (vidéo de
 * fond, cadre du pack) dit la forme pour laquelle le pack est fait (The Matrix : trop petit dans le fronton,
 * 12 novembre 2026, avec un 16:9 supposé). Apprise en partie, reprise par Cyber Pinball à la suivante.
 */
float appris[2] = { 0.f, 0.f };
float apprisAire[2] = { 0.f, 0.f };

void apprendre(VPXWindowId fenetre, float ratio, float aire)
{
   const int i = fenetre == VPXWINDOW_Backglass ? 0 : 1;
   if (aire <= apprisAire[i] || ratio < 0.25f || ratio > 8.f)
      return;
   apprisAire[i] = aire;
   if (appris[i] > 0.f && std::fabs(ratio - appris[i]) / appris[i] < 0.03f)
      return;
   appris[i] = ratio;
   char ligne[96];
   std::snprintf(ligne, sizeof(ligne), "ratio fenetre=%s valeur=%.3f", i == 0 ? "fronton" : "dmd", ratio);
   ecrire(ligne);
}

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
   const Rect r = remplir(cadre.dedans.srcWidth, cadre.dedans.srcHeight, cadre.zone.l, cadre.zone.h, { x, y, l, h }, cadre.reglage);
   cadre.couvert = englober(cadre.couvert, r);
   X = cadre.zone.x + r.x;
   Y = cadre.zone.y + r.y;
   L2 = r.l;
   H2 = r.h;
}

void MSGPIAPI cadreImage(VPXRenderContext2D*, VPXTexture texture, float tintR, float tintG, float tintB, float alpha, float texX, float texY, float texW, float texH, float pivotX, float pivotY,
   float rotation, float srcX, float srcY, float srcW, float srcH)
{
   float x, y, w, h;
   if (cadre.pup && texW >= 64.f && texH >= 32.f && srcX <= 1.f && srcY <= 1.f && srcW >= cadre.dedans.srcWidth - 1.f && srcH >= cadre.dedans.srcHeight - 1.f)
      apprendre(cadre.dedans.window, texW / texH, texW * texH);
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

/**
 * Une chaîne de rendus d'une fenêtre annexe, dans l'ordre écrit par Cyber Pinball (fronton : « PUP,B2S » ;
 * DMD : « PUP,ScoreView,B2S »), relue à chaque changement de l'ordre.
 */
struct Suivant
{
   std::string id;
   AncillaryRendererDef def {};
   bool trouve = false;
};
struct Chaine
{
   VPXWindowId fenetre;
   std::vector<Suivant> suivants;
   std::string lu;
   double chercheA = -10.0;
};
Chaine chaineFronton { VPXWINDOW_Backglass };
Chaine chaineDmd { VPXWINDOW_ScoreView };

void chercher(Chaine& c, const char* ordre, double t)
{
   if (c.lu != ordre)
   {
      c.lu = ordre;
      c.suivants.clear();
      size_t debut = 0;
      while (debut < c.lu.size())
      {
         const size_t fin = c.lu.find(',', debut);
         const std::string id = c.lu.substr(debut, fin == std::string::npos ? std::string::npos : fin - debut);
         if (!id.empty() && id.rfind("CyberPinball.", 0) != 0)
            c.suivants.push_back({ id });
         if (fin == std::string::npos)
            break;
         debut = fin + 1;
      }
      c.chercheA = -10.0;
   }
   bool manque = false;
   for (const Suivant& s : c.suivants)
      manque |= !s.trouve;
   if (!manque || t - c.chercheA < 1.0)
      return;
   c.chercheA = t;
   AncillaryRendererDef entrees[16] {};
   GetAncillaryRendererMsg m { c.fenetre, 16, 0, entrees };
   msgApi->BroadcastMsg(endpointId, getAuxRendererId, &m);
   for (Suivant& s : c.suivants)
      for (unsigned int i = 0; i < m.count && i < 16; i++)
         if (entrees[i].id && s.id == entrees[i].id && entrees[i].Render)
         {
            s.def = entrees[i];
            s.trouve = true;
         }
}

/**
 * Le premier rendu de la chaîne qui dessine, cadré dans `cible` (surface du flasher) ; `ctx` nul : essai sans
 * rien dessiner (fonctions de dessin vides), pour savoir si une source existe. Rend l'id du rendu, ou "".
 */
std::string rendre(VPXRenderContext2D* ctx, Chaine& c, const Rect& cible, double t, Reglage g = {}, float* rempli = nullptr)
{
   for (const Suivant& s : c.suivants)
   {
      if (!s.trouve)
         continue;
      VPXRenderContext2D essai {};
      VPXRenderContext2D* dehors = ctx;
      if (!ctx)
      {
         essai.is2D = 1;
         essai.outWidth = essai.srcWidth = cible.l;
         essai.outHeight = essai.srcHeight = cible.h;
         essai.DrawImage = rienImage;
         essai.DrawDisplay = rienAfficheur;
         essai.DrawSegDisplay = rienSegments;
         dehors = &essai;
      }
      cadre.dehors = dehors;
      cadre.dedans = *dehors;
      cadre.dedans.window = c.fenetre;
      cadre.zone = cible;
      cadre.pup = s.id == "PUP";
      cadre.reglage = g;
      cadre.couvert = {};
      cadre.dedans.outWidth = cible.l;
      cadre.dedans.outHeight = cible.h;
      cadre.dedans.DrawImage = cadreImage;
      cadre.dedans.DrawDisplay = cadreAfficheur;
      cadre.dedans.DrawSegDisplay = cadreSegments;
      // PuP pose son écran racine sur toute sa surface (srcWidth = outWidth) : la forme de son écran, apprise
      // de ce qu'il dessine, sinon celle de la partie précédente (PupRatio, PupDmdRatio), sinon 16:9.
      if (cadre.pup)
      {
         const int i = c.fenetre == VPXWINDOW_Backglass ? 0 : 1;
         const float defaut = i == 0 ? pupRatio_Val : pupDmdRatio_Val;
         const float ratio = appris[i] > 0.1f ? appris[i] : (defaut > 0.1f ? defaut : 16.f / 9.f);
         if (cible.l / cible.h < ratio)
            cadre.dedans.outHeight = cible.l / ratio;
         else
            cadre.dedans.outWidth = cible.h * ratio;
      }
      cadre.dedans.srcWidth = cadre.dedans.outWidth;
      cadre.dedans.srcHeight = cadre.dedans.outHeight;
      if (ctx)
      {
         ctx->srcWidth = ctx->outWidth;
         ctx->srcHeight = ctx->outHeight;
      }
      const int dessine = s.def.Render(&cadre.dedans, s.def.context);
      cadre.dehors = nullptr;
      if (cadre.pup)
         for (Pompe& p : pompes)
            if (p.fenetre == c.fenetre)
               p.dessineeA = t; // PuP vient de dessiner cette fenêtre : pas une seconde fois à vide
      if (dessine)
      {
         if (cadre.pup && ctx && c.fenetre == VPXWINDOW_Backglass)
            mesures.pup++;
         if (rempli)
            *rempli = couverture(cadre.couvert, cible.l, cible.h);
         return s.id;
      }
   }
   return "";
}

/** Une image de Cyber Pinball (fronton, DMD), lue une fois : [Plugin.CyberPinball] BackglassImage, DmdImage. */
struct ImageFichier
{
   std::string chemin;
   VPXTexture tex = nullptr;
   float l = 0.f, h = 0.f;
};
ImageFichier imageDuFronton, imageDuDmd;

bool charger(ImageFichier& img, const char* chemin)
{
   if (img.chemin != chemin)
   {
      if (img.tex && vpxApi)
         vpxApi->DeleteTexture(img.tex);
      img = ImageFichier { chemin };
      if (!chemin[0] || !vpxApi)
         return false;
      FILE* f = _wfopen(large(chemin).c_str(), L"rb");
      if (!f)
      {
         ecrire(std::string("image introuvable ") + chemin);
         return false;
      }
      std::vector<uint8_t> octets;
      uint8_t bloc[65536];
      size_t n;
      while ((n = std::fread(bloc, 1, sizeof(bloc), f)) > 0)
         octets.insert(octets.end(), bloc, bloc + n);
      std::fclose(f);
      img.tex = octets.empty() ? nullptr : vpxApi->CreateTexture(octets.data(), static_cast<int>(octets.size()));
      if (const VPXTextureInfo* info = img.tex ? vpxApi->GetTextureInfo(img.tex) : nullptr)
      {
         img.l = static_cast<float>(info->width);
         img.h = static_cast<float>(info->height);
      }
      ecrire(std::string("image ") + (img.tex ? "lue " : "illisible ") + chemin);
   }
   return img.tex && img.l > 0.f && img.h > 0.f;
}

/** Une image posée dans `cible` comme toute source (remplir) ; rend la part de la cible couverte. */
float dessinerImage(VPXRenderContext2D* ctx, const ImageFichier& img, const Rect& cible, Reglage g = {})
{
   const Rect r = remplir(img.l, img.h, cible.l, cible.h, { 0.f, 0.f, img.l, img.h }, g);
   ctx->srcWidth = ctx->outWidth;
   ctx->srcHeight = ctx->outHeight;
   ctx->DrawImage(ctx, img.tex, 1.f, 1.f, 1.f, 1.f, 0.f, 0.f, img.l, img.h, 0.f, 0.f, 0.f, cible.x + r.x, cible.y + r.y, r.l, r.h);
   return couverture(r, cible.l, cible.h);
}

/** Le DMD a-t-il une source qui dessine ? Essai à vide toutes les 0,5 s tant qu'aucune n'a été vue. */
bool dmdVu = false;
double dmdEssaiA = -10.0;
// Les cadres à la dernière image, dans la surface du flasher : le contour de « Ajuster les écrans ».
Rect rectFronton {}, rectDmd {};
std::string dmdSource, frontonSource;

void fondDans(VPXRenderContext2D* ctx, const Rect& r);

/**
 * Le fronton hors de la pause, toutes sources dans l'ordre (règle du 12 novembre 2026 : toute table en VR
 * a un fronton et un DMD, quelle que soit sa source) :
 * - fronton : la chaîne (PuP, B2S…), sinon l'image du fronton de Cyber Pinball, sinon le fond ;
 * - DMD, quand Cyber Pinball réserve sa bande (DmdBand, fronton posé par VPX) : la chaîne (PuP, ScoreView
 *   pour PinMAME, FlexDMD, UltraDMD, AlphaDMD ; B2S), sinon l'image du DMD de Cyber Pinball. La bande ne paraît
 *   que si une source y dessine : jamais de cadre vide.
 * 0 si rien ne dessine (VPX continue alors sa propre liste, jusqu'au fond opaque).
 */
int dessinerCadre(VPXRenderContext2D* ctx, double t)
{
   chercher(chaineFronton, ordreFronton_Val, t);
   chercher(chaineDmd, ordreDmd_Val, t);
   const Rect zone = zoneVisible(ctx);
   Rect fronton = zone, dmd {};
   const bool bande = bandeDmd_Val > 0.01f;
   const bool imageDmd = bande && charger(imageDuDmd, imageDmd_Val);
   if (bande && !dmdVu && t - dmdEssaiA >= 0.5)
   {
      dmdEssaiA = t;
      dmdVu = !rendre(nullptr, chaineDmd, { 0.f, 0.f, zone.l, zone.h * bandeDmd_Val }, t).empty();
   }
   if (bande && (dmdVu || imageDmd))
   {
      const float hd = zone.h * bandeDmd_Val;
      dmd = { zone.x, zone.y + zone.h - hd, zone.l, hd };
      fronton.h -= hd;
   }
   float rf = -1.f, rd = -1.f;
   std::string f = rendre(ctx, chaineFronton, fronton, t, pause.reglage(Ecran::Fronton), &rf);
   if (f.empty() && charger(imageDuFronton, imageFronton_Val))
   {
      rf = dessinerImage(ctx, imageDuFronton, fronton, pause.reglage(Ecran::Fronton));
      f = "image";
   }
   std::string d;
   if (dmd.h > 0.f)
   {
      d = rendre(ctx, chaineDmd, dmd, t, pause.reglage(Ecran::Dmd), &rd);
      if (d.empty() && imageDmd)
      {
         rd = dessinerImage(ctx, imageDuDmd, dmd, pause.reglage(Ecran::Dmd));
         d = "image";
      }
      if (!d.empty() && f.empty())
      {
         fondDans(ctx, fronton);
         f = "fond";
      }
   }
   remplissage.fronton = f.empty() || f == "fond" ? -1.f : rf;
   remplissage.dmd = d.empty() ? -1.f : rd;
   rectFronton = fronton;
   rectDmd = dmd;
   if (f != frontonSource || d != dmdSource)
   {
      frontonSource = f;
      dmdSource = d;
      ecrire("sources fronton=" + (f.empty() ? std::string("aucune") : f) + " dmd=" + (d.empty() ? std::string(bande ? "aucune" : "sans_bande") : d));
   }
   return f.empty() && d.empty() ? 0 : 1;
}

// --- DMD de la pièce VR -----------------------------------------------------------------------
//
// Le cadre DMD qu'une pièce VR pose dans sa scène (flasher en mode DMD) ne montre, dans VPX 10.8.1, qu'une
// source d'affichage de contrôleur (« ctrl://default/display » : la plus grande, ResURIResolver) : PinMAME,
// FlexDMD, UltraDMD. Le plugin PuP n'en publie aucune, et son FullDMD ne va que dans la fenêtre ScoreView,
// que VPX ne rend jamais en VR : le cadre restait gris (City Hunter, 12 novembre 2026 ; la pièce VR de la
// table montre le FullDMD de PuP). Le plugin publie donc sa propre source, 512 × 288 (plus grande que tout
// DMD de ROM : elle l'emporte) : [Plugin.CyberPinball] RoomDmd « PUP », l'écran DMD de PuP (racine 5, sinon
// 1) dessiné en logiciel, sinon l'image du DMD de Cyber Pinball ; « image », l'image seule ; vide, aucune
// source (le DMD de la ROM ou de FlexDMD remplit le cadre). Cyber Pinball ne l'écrit que pour une table à
// pièce VR qui a un cadre DMD (vr-sources.ts, roomDmdSetting), jamais avec la bande DMD sous le fronton.

MSGPI_FLOAT_VAL_SETTING(salleRatio, "RoomDmdRatio", "VR room DMD ratio", "Width over height of the DMD frame of the table's VR room (its flasher)", true, 0.5f, 8.f, 0.01f, 1.7778f);
MSGPI_STRING_VAL_SETTING(salleDmd, "RoomDmd", "VR room DMD", "Display source published for the DMD frame of the table's VR room: PUP, image, or empty for none", true, "", 16);

struct SalleDmd
{
   bool active = false;
   std::vector<uint8_t> images[2];
   int courante = 0;
   unsigned int id = 0;
   double renduA = -10.0;
   std::string source = "?";
   DWORD fil = 0; // fil de VPX qui prépare les images (onPrepareFrame) : le seul qui redessine
   int l = SALLE_DMD_L, h = SALLE_DMD_H; // à la forme du cadre de la pièce (RoomDmdRatio)
};
SalleDmd salle;
Chaine chaineSalle { VPXWINDOW_ScoreView };
unsigned int getDisplaysId = 0, displaysChangedId = 0;

void MSGPIAPI salleImage(VPXRenderContext2D* ctx, VPXTexture texture, float tintR, float tintG, float tintB, float alpha, float texX, float texY, float texW, float texH, float, float, float,
   float srcX, float srcY, float srcW, float srcH)
{
   const VPXTextureInfo* info = texture && vpxApi ? vpxApi->GetTextureInfo(texture) : nullptr;
   if (!info || !info->data)
      return;
   const float sx = ctx->srcWidth > 0.f ? ctx->outWidth / ctx->srcWidth : 1.f;
   const float sy = ctx->srcHeight > 0.f ? ctx->outHeight / ctx->srcHeight : 1.f;
   const TextureLue t { info->width, info->height, static_cast<FormatTexture>(info->format), info->data };
   poserTexture(salle.images[salle.courante], salle.l, salle.h, t, tintR, tintG, tintB, alpha, texX, texY, texW, texH, srcX * sx, srcY * sy, srcW * sx, srcH * sy);
}

/** Une image neuve du DMD de la pièce : PuP, sinon l'image du DMD ; noire si rien ne dessine. */
void redessinerSalle(double t)
{
   salle.courante ^= 1;
   std::vector<uint8_t>& img = salle.images[salle.courante];
   img.assign(static_cast<size_t>(salle.l) * salle.h * 3, 0);
   VPXRenderContext2D c {};
   c.window = VPXWINDOW_ScoreView;
   c.is2D = 1;
   c.outWidth = c.srcWidth = static_cast<float>(salle.l);
   c.outHeight = c.srcHeight = static_cast<float>(salle.h);
   c.DrawImage = salleImage;
   c.DrawDisplay = rienAfficheur;
   c.DrawSegDisplay = rienSegments;
   const Rect tout { 0.f, 0.f, c.outWidth, c.outHeight };
   std::string s;
   if (std::strcmp(salleDmd_Val, "PUP") == 0)
   {
      // PuP seul : le rendu ScoreView (DMD de la ROM) lirait cette source même, en boucle.
      chercher(chaineSalle, "PUP", t);
      s = rendre(&c, chaineSalle, tout, t, pause.reglage(Ecran::Dmd), &remplissage.salle);
   }
   if (s.empty() && charger(imageDuDmd, imageDmd_Val))
   {
      remplissage.salle = dessinerImage(&c, imageDuDmd, tout, pause.reglage(Ecran::Dmd));
      s = "image";
   }
   if (s.empty())
      remplissage.salle = 0.f; // cadre noir : mal rempli, dit au journal
   salle.id++;
   if (s != salle.source)
   {
      salle.source = s;
      ecrire("salle dmd=" + (s.empty() ? std::string("aucune") : s));
   }
}

/** Image du DMD de la pièce demandée par VPX (flasher en mode DMD) : redessinée au plus 30 fois par seconde. */
DisplayFrame MSGPIAPI imageSalle(const CtlResId)
{
   const double t = maintenant();
   // Seulement depuis le fil de VPX, hors d'un autre rendu (le cadre du fronton est global) : sinon la dernière.
   if (enPartie && GetCurrentThreadId() == salle.fil && !cadre.dehors && t - salle.renduA >= 1.0 / 30.0)
   {
      salle.renduA = t;
      redessinerSalle(t);
   }
   if (salle.images[salle.courante].size() != static_cast<size_t>(salle.l) * salle.h * 3)
      salle.images[salle.courante].assign(static_cast<size_t>(salle.l) * salle.h * 3, 0);
   return { salle.id, salle.images[salle.courante].data() };
}

void MSGPIAPI onGetDisplays(const unsigned int, void*, void* data)
{
   auto* m = static_cast<GetDisplaySrcMsg*>(data);
   if (!m || !salle.active)
      return;
   if (m->count < m->maxEntryCount && m->entries)
   {
      DisplaySrcId& e = m->entries[m->count];
      e = DisplaySrcId {};
      e.id.endpointId = endpointId;
      e.id.resId = 0;
      e.groupId = e.id;
      e.width = static_cast<unsigned int>(salle.l);
      e.height = static_cast<unsigned int>(salle.h);
      e.hardware = CTLPI_DISPLAY_HARDWARE_LCD_DISPLAY;
      e.frameFormat = CTLPI_DISPLAY_FORMAT_SRGB888;
      e.GetRenderFrame = imageSalle;
   }
   m->count++;
}

/** Publie (ou retire) la source du DMD de la pièce, et le dit à VPX. */
void publierSalle(bool active)
{
   if (salle.active == active)
      return;
   salle.active = active;
   msgApi->BroadcastMsg(endpointId, displaysChangedId, nullptr);
   ecrire(std::string("salle source=") + (active ? salleDmd_Val : "retiree"));
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
   if (o.garder)
   {
      const Reglage a = pause.reglage(Ecran::Fronton), b = pause.reglage(Ecran::Dmd);
      char ligne[160];
      std::snprintf(ligne, sizeof(ligne), "reglage fronton=%.3f,%.3f,%.3f dmd=%.3f,%.3f,%.3f", a.dx, a.dy, a.taille, b.dx, b.dy, b.taille);
      ecrire(ligne);
   }
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
   salle.fil = GetCurrentThreadId();
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
   chaineFronton = Chaine { VPXWINDOW_Backglass };
   chaineDmd = Chaine { VPXWINDOW_ScoreView };
   dmdVu = false;
   dmdEssaiA = -10.0;
   dmdSource.clear();
   frontonSource.clear();
   mesures = Mesures {};
   ecrire(std::string("debut zone=") + zoneFronton_Val + " ordre=" + ordreFronton_Val + " table=" + (idTable_Val[0] ? idTable_Val : "?"));
   // Réglages des écrans enregistrés pour cette table (« fronton=dx,dy,taille;dmd=… »).
   {
      const std::string tout = reglagesEcrans_Val;
      size_t debut = 0;
      while (debut < tout.size())
      {
         const size_t fin = tout.find(';', debut);
         const std::string part = tout.substr(debut, fin == std::string::npos ? std::string::npos : fin - debut);
         if (part.rfind("fronton=", 0) == 0)
            pause.poserReglage(Ecran::Fronton, lireReglage(part.substr(8)));
         else if (part.rfind("dmd=", 0) == 0)
            pause.poserReglage(Ecran::Dmd, lireReglage(part.substr(4)));
         if (fin == std::string::npos)
            break;
         debut = fin + 1;
      }
   }
   pause.dmdAjustable(bandeDmd_Val > 0.01f || salleDmd_Val[0] != 0);
   appris[0] = appris[1] = 0.f;
   apprisAire[0] = apprisAire[1] = 0.f;
   remplissage = Remplissage {};
   rectFronton = rectDmd = Rect {};
   {
      const float ratio = salleRatio_Val > 0.4f ? salleRatio_Val : 16.f / 9.f;
      salle.l = SALLE_DMD_L;
      salle.h = std::max(32, std::min(512, static_cast<int>(std::lround(SALLE_DMD_L / ratio))));
   }
   chaineSalle = Chaine { VPXWINDOW_ScoreView };
   salle.source = "?";
   salle.renduA = -10.0;
   enPartie = true;
   publierSalle(salleDmd_Val[0] != 0);
}

void MSGPIAPI onGameEnd(const unsigned int, void*, void*)
{
   enPartie = false;
   pause.remiseAZero();
   publierSalle(false);
}

// --- Dessin sur le fronton ------------------------------------------------------------------

struct Image
{
   VPXTexture tex = nullptr;
   int l = 0, h = 0;
   std::string texte;
};

VPXTexture blanc = nullptr;
Image titre, reprendre, quitter, marque, rappel, ajuster, etapeAjuster, aideAjuster;
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
   preparer(ajuster, libelleAjuster_Val, 8);
   {
      const Etape e = pause.etape();
      const std::string nom = pause.ecran() == Ecran::Dmd ? libelleEcranDmd_Val : libelleEcranFronton_Val;
      preparer(etapeAjuster, (std::string(libelleAjuster_Val) + " : " + nom).c_str(), 6);
      preparer(aideAjuster, e == Etape::Reglage ? aideReglage_Val : aideChoixEcran_Val, 6);
   }
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

int dessinerAjustement(VPXRenderContext2D* ctx, double t);

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
   if (!tenu && pause.etape() != Etape::Menu)
      return dessinerAjustement(ctx, t);
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
   // Menu : « Pause », les trois choix (le choisi en vert, encadré), puis le rappel des touches en gros.
   texte(ctx, titre, L / 2.f, 90.f, 96.f, ENCRE[0], ENCRE[1], ENCRE[2]);
   const Choix ch = pause.choix();
   const float ys[3] = { 235.f, 350.f, 465.f };
   const Image* items[3] = { &reprendre, &ajuster, &quitter };
   const Choix ordre[3] = { Choix::Reprendre, Choix::Ajuster, Choix::Quitter };
   for (int i = 0; i < 3; i++)
   {
      const bool choisi = ch == ordre[i];
      if (choisi)
         rectangle(ctx, 120.f, ys[i] - 52.f, L - 240.f, 104.f, SIGNAL[0], SIGNAL[1], SIGNAL[2], 0.18f);
      const float* c = choisi ? SIGNAL : TERNE;
      texte(ctx, *items[i], L / 2.f, ys[i], 80.f, c[0], c[1], c[2]);
   }
   if (pause.repriseEchouee())
      texte(ctx, rappel, L / 2.f, 600.f, 64.f, SIGNAL[0], SIGNAL[1], SIGNAL[2]);
   else
      for (int i = 0; i < lignesAide; i++)
         texte(ctx, aide[i], L / 2.f, (lignesAide == 1 ? 620.f : 590.f + 75.f * static_cast<float>(i)), 56.f, ENCRE[0], ENCRE[1], ENCRE[2]);
   return 1;
}

/** Le contour d'un rectangle de la surface du flasher, épaisseur `e`. */
void contour(VPXRenderContext2D* ctx, const Rect& r, float e, const float* c)
{
   ctx->DrawImage(ctx, blanc, c[0], c[1], c[2], 1.f, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, 0.f, r.x, r.y, r.l, e);
   ctx->DrawImage(ctx, blanc, c[0], c[1], c[2], 1.f, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, 0.f, r.x, r.y + r.h - e, r.l, e);
   ctx->DrawImage(ctx, blanc, c[0], c[1], c[2], 1.f, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, 0.f, r.x, r.y, e, r.h);
   ctx->DrawImage(ctx, blanc, c[0], c[1], c[2], 1.f, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, 0.f, r.x + r.l - e, r.y, e, r.h);
}

/**
 * « Ajuster les écrans » (pause) : les vrais cadres, avec le réglage en cours en direct, le contour vert de
 * l'écran choisi, et en haut l'étape et le rappel des touches (joysticks : position, poignées : taille, A
 * garde, B revient). Le réglage est enregistré pour la table (ligne « reglage » des mesures).
 */
int dessinerAjustement(VPXRenderContext2D* ctx, double t)
{
   preparerTout();
   if (!dessinerCadre(ctx, t))
      poser(ctx, FOND);
   ctx->srcWidth = ctx->outWidth;
   ctx->srcHeight = ctx->outHeight;
   const Rect zone = zoneVisible(ctx);
   const Rect rr = cadrer(L, H, zone.l, zone.h, { 0.f, 0.f, L, H });
   cible = { zone.x + rr.x, zone.y + rr.y, rr.l, rr.h };
   const Rect c = pause.ecran() == Ecran::Dmd ? rectDmd : rectFronton;
   if (c.l > 0.f && c.h > 0.f)
      contour(ctx, c, std::max(2.f, zone.l * 0.006f), SIGNAL);
   rectangle(ctx, 0.f, 0.f, L, 175.f, FOND[0], FOND[1], FOND[2], 0.8f);
   texte(ctx, etapeAjuster, L / 2.f, 55.f, 64.f, SIGNAL[0], SIGNAL[1], SIGNAL[2]);
   texte(ctx, aideAjuster, L / 2.f, 130.f, 44.f, ENCRE[0], ENCRE[1], ENCRE[2]);
   return 1;
}

/** Le fond opaque et la marque, dans un rectangle de la surface du flasher (fronton sans source, DMD présent). */
void fondDans(VPXRenderContext2D* ctx, const Rect& r)
{
   preparerTout();
   ctx->srcWidth = ctx->outWidth;
   ctx->srcHeight = ctx->outHeight;
   ctx->DrawImage(ctx, blanc, FOND[0], FOND[1], FOND[2], 1.f, 0.f, 0.f, 2.f, 2.f, 1.f, 1.f, 0.f, r.x, r.y, r.l, r.h);
   const float h = r.h * 0.12f, w = h * static_cast<float>(marque.l) / static_cast<float>(marque.h);
   ctx->DrawImage(ctx, marque.tex, TERNE[0], TERNE[1], TERNE[2], 1.f, 0.f, 0.f, static_cast<float>(marque.l), static_cast<float>(marque.h), 0.f, 0.f, 0.f, r.x + (r.l - w) / 2.f, r.y + (r.h - h) / 2.f, w, h);
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
   msgApi->RegisterSetting(endpointId, &ordreDmd);
   msgApi->RegisterSetting(endpointId, &bandeDmd);
   msgApi->RegisterSetting(endpointId, &imageFronton);
   msgApi->RegisterSetting(endpointId, &imageDmd);
   msgApi->RegisterSetting(endpointId, &fichierMesures);
   msgApi->RegisterSetting(endpointId, &dossierCaptures);
   msgApi->RegisterSetting(endpointId, &salleDmd);
   msgApi->RegisterSetting(endpointId, &salleRatio);
   for (auto* reglage : { &pupDmdRatio })
      msgApi->RegisterSetting(endpointId, reglage);
   for (auto* reglage : { &reglagesEcrans, &idTable, &libelleAjuster, &libelleEcranFronton, &libelleEcranDmd, &aideChoixEcran, &aideReglage })
      msgApi->RegisterSetting(endpointId, reglage);
   msgApi->BroadcastMsg(endpointId, getVpxApiId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_MSG_GET_API), &vpxApi);
   msgApi->SubscribeMsg(endpointId, onGameStartId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_GAME_START), onGameStart, nullptr);
   msgApi->SubscribeMsg(endpointId, onGameEndId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_GAME_END), onGameEnd, nullptr);
   msgApi->SubscribeMsg(endpointId, onPrepareFrameId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_PREPARE_FRAME), onPrepareFrame, nullptr);
   msgApi->SubscribeMsg(endpointId, onActionId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_ACTION_CHANGED), onAction, nullptr);
   msgApi->SubscribeMsg(endpointId, getAuxRendererId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_MSG_GET_AUX_RENDERER), onGetAuxRenderer, nullptr);
   msgApi->SubscribeMsg(endpointId, getDisplaysId = msgApi->GetMsgID(CTLPI_NAMESPACE, CTLPI_DISPLAY_GET_SRC_MSG), onGetDisplays, nullptr);
   displaysChangedId = msgApi->GetMsgID(CTLPI_NAMESPACE, CTLPI_DISPLAY_ON_SRC_CHG_MSG);
   // VPX relit la liste des rendus annexes.
   msgApi->BroadcastMsg(endpointId, auxChangedId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_AUX_RENDERER_CHG), nullptr);
}

MSGPI_EXPORT void MSGPIAPI CyberPinballPluginUnload()
{
   enPartie = false;
   publierSalle(false);
   msgApi->UnsubscribeMsg(getDisplaysId, onGetDisplays, nullptr);
   msgApi->UnsubscribeMsg(onGameStartId, onGameStart, nullptr);
   msgApi->UnsubscribeMsg(onGameEndId, onGameEnd, nullptr);
   msgApi->UnsubscribeMsg(onPrepareFrameId, onPrepareFrame, nullptr);
   msgApi->UnsubscribeMsg(onActionId, onAction, nullptr);
   msgApi->UnsubscribeMsg(getAuxRendererId, onGetAuxRenderer, nullptr);
   msgApi->BroadcastMsg(endpointId, auxChangedId, nullptr);
   if (vpxApi)
      for (VPXTexture* t : { &blanc, &titre.tex, &reprendre.tex, &quitter.tex, &marque.tex, &rappel.tex, &ajuster.tex, &etapeAjuster.tex, &aideAjuster.tex, &aide[0].tex, &aide[1].tex, &aide[2].tex, &imageDuFronton.tex, &imageDuDmd.tex })
         if (*t)
         {
            vpxApi->DeleteTexture(*t);
            *t = nullptr;
         }
   for (unsigned int id : { getVpxApiId, onGameStartId, onGameEndId, onPrepareFrameId, onActionId, getAuxRendererId, auxChangedId, getDisplaysId, displaysChangedId })
      msgApi->ReleaseMsgID(id);
   vpxApi = nullptr;
   msgApi = nullptr;
}
