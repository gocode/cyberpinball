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
#pragma once

struct KnownDmdUtil
{
  const char* sha256;  // en minuscules
  const char* vpx;     // version de VPX qui l'installe
};

constexpr KnownDmdUtil kKnownDmdUtil[] = {
    {"6cbed170fd4671a33d716a02b50528659b0c9456af67157d11e19da2386a8569", "VPX 10.8.1-5436"},
};
