// Les dmdutil64.dll que cyberpinball-dmdserver accepte, par leur empreinte SHA-256.
//
// Ce programme appelle les classes C++ de la DLL de VPX à travers les en-têtes de vendor/ : la disposition
// de ces classes doit être exactement la leur. Une autre version de libdmdutil peut garder les mêmes
// fonctions et changer cette disposition (un réglage ajouté à Config suffit) : seule l'empreinte le dit
// sûrement. Une DLL inconnue arrête le serveur avant tout chargement (code 6) ; VPX garde alors le DMD
// en partie, comme sans le serveur.
//
// Nouvelle version de VPX (packages/installer/components.json) : recopier les en-têtes de vendor/ au commit
// de libdmdutil qu'elle épingle, refaire dmdutil64.def, ajouter ici l'empreinte que donne
// « cyberpinball-dmdserver --verifier -d <VPX>\plugins\dmdutil », recompiler. Le test de
// packages/core/src/test/dmdserver.test.ts exige une ligne pour la version de VPX installée.
//
// pin2dmd : cette DLL pilote-t-elle un PIN2DMD elle-même ? À relever dans le binaire, jamais d'après le
// source seul : appels à libusb_init dans le désassemblage (dumpbin /disasm), noms « PIN2DMD XL » parmi ses
// chaînes. false : le serveur pilote la carte lui-même (src/pin2dmd.h), et VPX ne l'atteint qu'à travers
// lui ; packages/core/src/dmdserver.ts (PIN2DMD_ONLY_THROUGH_SERVER) doit dire la même chose, le test le
// vérifie.
#pragma once

struct KnownDmdUtil
{
  const char* sha256;  // en minuscules
  const char* vpx;     // version de VPX qui l'installe
  bool pin2dmd;        // libdmdutil compilé avec DMDUTIL_ENABLE_PIN2DMD
};

constexpr KnownDmdUtil kKnownDmdUtil[] = {
    // libdmdutil 3485e2e : DMDUTIL_ENABLE_PIN2DMD jamais défini par son CMakeLists.txt, aucun appel à libusb.
    {"6cbed170fd4671a33d716a02b50528659b0c9456af67157d11e19da2386a8569", "VPX 10.8.1-5436", false},
};
