// license:GPLv3+
//
// Nos plugins et les deux API de plugins de VPX : 10.8.1 (vendor/vpx-10.8.1) et 10.9.0 (vendor/vpx-10.9.0).
//
// Le même source est construit une fois par jeu d'en-têtes (CMakeLists.txt, plugins_vpx_pour), avec
// CYBERPINBALL_VPX_API = 100801 ou 100900 (majeure × 10000 + mineure × 100 + correctif). Ce qui change d'une
// API à l'autre sans que les en-têtes le cachent passe ici, et seulement ici : jamais de copie du code d'un
// plugin. Le reste vient des en-têtes eux-mêmes (noms des messages suffixés « :1 », champ « version » en tête
// des API).
//
// Hors de src/ : commun aux trois plugins, il n'appartient à aucun (packages/installer/src/vpx-own-plugins.ts)
// et ne déclare aucun réglage.

#pragma once

#include <cstring>

#include "MsgPlugin.h"
#include "VPXPlugin.h" // inclut ControllerPlugin.h

#ifndef CYBERPINBALL_VPX_API
#error "CYBERPINBALL_VPX_API : 100801 ou 100900 (packages/vpx-vision3d/CMakeLists.txt)"
#endif

// Les en-têtes trouvés sont bien ceux de l'API demandée : MSGPI_SETTING_TYPE_FOLDER n'existe que depuis 10.9.0.
#if CYBERPINBALL_VPX_API >= 100900 && !defined(MSGPI_SETTING_TYPE_FOLDER)
#error "CYBERPINBALL_VPX_API = 100900, mais les en-têtes de VPX sont ceux de 10.8.1 (vendor/vpx-10.9.0 attendu)"
#elif CYBERPINBALL_VPX_API < 100900 && defined(MSGPI_SETTING_TYPE_FOLDER)
#error "CYBERPINBALL_VPX_API = 100801, mais les en-têtes de VPX sont ceux de 10.9.0 (vendor/vpx-10.8.1 attendu)"
#endif

namespace cyberpinball::vpx {

/** Version de VPX pour laquelle cette DLL est construite. */
constexpr int API_MAJEURE = CYBERPINBALL_VPX_API / 10000;
constexpr int API_MINEURE = (CYBERPINBALL_VPX_API / 100) % 100;
constexpr int API_CORRECTIF = CYBERPINBALL_VPX_API % 100;
// Le plugin de la pause compare ces nombres au numéro de fichier de VPX (versionDeVpx) : mal décodés, il resterait passif.
static_assert(API_MAJEURE == 10 && (API_MINEURE == 8 || API_MINEURE == 9), "CYBERPINBALL_VPX_API mal formé : 100801 ou 100900 attendu");

#if CYBERPINBALL_VPX_API >= 100900
/** Ce que reçoit la fonction d'image d'une source d'affichage : le contexte de la source (10.9.0). */
using ArgImage = void*;
/** L'image courante d'une source d'affichage d'un autre plugin. */
inline DisplayFrame imageDe(const DisplaySrcId& s) { return s.GetRenderFrame(s.callContext); }
/** Les champs propres à l'API d'une source publiée par nos plugins (10.9.0 : son contexte, inutilisé ici). */
inline void completerSource(DisplaySrcId& s) { s.callContext = nullptr; }
#else
/** Ce que reçoit la fonction d'image d'une source d'affichage : l'identifiant de la source (10.8.1). */
using ArgImage = CtlResId;
inline DisplayFrame imageDe(const DisplaySrcId& s) { return s.GetRenderFrame(s.id); }
/** 10.8.1 : une source publiée est son propre groupe. */
inline void completerSource(DisplaySrcId& s) { s.groupId = s.id; }
#endif

/**
 * Le rendu des scores de VPX (les DMD et afficheurs des contrôleurs, dans les fenêtres annexes) : plugin
 * « ScoreView » en 10.8.1, renommé « Nixie » en 10.9.0. Les deux noms valent l'un pour l'autre : l'ordre
 * des rendus écrit par Cyber Pinball (DmdOrder…) peut dire l'un ou l'autre.
 */
inline bool estRenduScores(const char* id) { return id && (std::strcmp(id, "ScoreView") == 0 || std::strcmp(id, "Nixie") == 0); }

/** Deux ids de rendus annexes désignent le même rendu (égaux, ou tous deux le rendu des scores). */
inline bool memeRendu(const char* a, const char* b)
{
   return a && b && (std::strcmp(a, b) == 0 || (estRenduScores(a) && estRenduScores(b)));
}

/** Les bancs qui jouent le rôle de VPX : le champ « version » des API (10.9.0) vaut 1, comme chez VPX. */
template <class Api> void marquerVersion(Api& api)
{
   if constexpr (requires { api.version; })
      api.version = 1;
}

} // namespace cyberpinball::vpx
