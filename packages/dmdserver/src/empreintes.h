// Les dmdutil64.dll que cyberpinball-dmdserver accepte, par leur empreinte SHA-256, pour chaque version de VPX.
//
// Ce programme appelle les classes C++ de la DLL de VPX à travers les en-têtes de vendor/ : la disposition
// de ces classes doit être exactement la leur. Une autre version de libdmdutil peut garder les mêmes
// fonctions et changer cette disposition (un réglage ajouté à Config suffit) : seule l'empreinte le dit
// sûrement. Une DLL inconnue arrête le serveur avant tout chargement (code 6) ; VPX garde alors le DMD
// en partie, comme sans le serveur.
//
// Une ligne par dmdutil64.dll connue (une version de VPX peut en avoir plusieurs : une ligne chacune), avec le
// commit de libdmdutil qu'elle contient. Le serveur n'accepte que celles de kVendorLibdmdutil, le commit des
// en-têtes de vendor/ avec lesquels il est construit : une DLL d'un autre commit est refusée (code 6) même
// connue, sa disposition des classes pouvant différer.
//
// Nouvelle version de VPX (packages/installer/components.json) : ajouter sa ligne avec l'empreinte que donne
// « cyberpinball-dmdserver --verifier -d <VPX>\plugins\dmdutil » et le commit de libdmdutil qu'elle épingle
// (LIBDMDUTIL_SHA de platforms/config.sh de VPX). Même commit que kVendorLibdmdutil : rien d'autre. Un autre :
// recopier les en-têtes de vendor/ à ce commit, refaire dmdutil64.def, changer kVendorLibdmdutil, recompiler
// (le serveur ne servira alors plus que cette version-là). Le test de packages/core/src/test/dmdserver.test.ts
// exige une ligne pour la version de VPX installée.
//
// pin2dmd : cette DLL pilote-t-elle un PIN2DMD elle-même ? À relever dans le binaire, jamais d'après le
// source seul : appels à libusb_init dans le désassemblage (dumpbin /disasm), noms « PIN2DMD XL » parmi ses
// chaînes. false : le serveur pilote la carte lui-même (src/pin2dmd.h), et VPX ne l'atteint qu'à travers
// lui ; packages/core/src/dmdserver.ts (PIN2DMD_ONLY_THROUGH_SERVER) doit dire la même chose, le test le
// vérifie.
#pragma once

struct KnownDmdUtil
{
  const char* sha256;      // en minuscules ; vide : pas encore relevée, la DLL de cette version est refusée (code 6)
  const char* vpx;         // version de VPX qui l'installe
  const char* libdmdutil;  // commit de libdmdutil de cette DLL (7 caractères)
  bool pin2dmd;            // libdmdutil compilé avec DMDUTIL_ENABLE_PIN2DMD
};

// Commit de libdmdutil des en-têtes de vendor/ (vendor/PROVENANCE.txt) : seules ses DLL sont acceptées.
constexpr const char* kVendorLibdmdutil = "3485e2e";

constexpr KnownDmdUtil kKnownDmdUtil[] = {
    // libdmdutil 3485e2e : DMDUTIL_ENABLE_PIN2DMD jamais défini par son CMakeLists.txt, aucun appel à libusb.
    {"6cbed170fd4671a33d716a02b50528659b0c9456af67157d11e19da2386a8569", "VPX 10.8.1-5436", "3485e2e", false},
    // TODO VPX 10.9.0-6948 (mode d'essai) : empreinte à relever sur le dmdutil64.dll de son zip, pas encore
    // téléchargé. Elle ne suffira pas : VPX 10.9.0 (28919b5df) épingle libdmdutil 6b8f711, dont Config, DMD et
    // DMDServer n'ont plus la disposition de 3485e2e (réglages PinDMD3 et DMDExtStream, fils des clients) ; ce
    // serveur, construit sur 3485e2e, la refusera tant qu'il n'aura pas un second jeu d'en-têtes. pin2dmd : à
    // relever dans le binaire (libdmdutil f924569 a corrigé DMDUTIL_ENABLE_PIN2DMD en amont).
    {"", "VPX 10.9.0-6948", "6b8f711", false},
};
