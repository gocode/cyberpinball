// Runtime Visual C++ de Microsoft, installé par l'installeur de Cyber Pinball s'il manque à Windows.
//
//   CyberPinball.exe <racine>\app\resources\app\dist\runtime-vc.js <racine>\downloads   (ELECTRON_RUN_AS_NODE=1)
//
// VPX ne démarre pas sans lui, et la bibliothèque SDL de VPX, qui lit les boutons et le lanceur d'un
// Pinscape ou d'un encodeur en mode manette, ne se charge pas non plus. Son installation demande
// l'accord de Windows, sur le bureau sécurisé, où les boutons de la borne ne peuvent rien : c'est
// donc l'installeur qui la fait, à un moment où l'utilisateur a forcément une souris et un clavier
// (il vient de cliquer sur « Installer »), et avant le premier assistant, qui relève les boutons
// (packages/core/src/first-run.ts). La même fonction que le menu (ensureVcRuntime, vc-runtime.ts) :
// téléchargement vérifié depuis l'adresse figée du manifeste, ou fichier déjà déposé dans downloads\
// par l'installeur complet, signature de Microsoft vérifiée, installateur officiel sans fenêtre.
//
// Code de sortie : 0 runtime prêt (déjà là ou installé), 2 accord de Windows refusé ou sans réponse,
// 1 autre échec. L'installeur l'écrit dans son journal ; le menu repropose l'installation au besoin.

import { ensureVcRuntime } from './vc-runtime';

const downloads = process.argv[2];
if (!downloads) {
  console.error('Usage : CyberPinball.exe runtime-vc.js <dossier downloads> (ELECTRON_RUN_AS_NODE=1)'); // i18n-ignore : usage
  process.exit(1);
}

ensureVcRuntime(downloads, { onStep: (line) => console.log(line) })
  .then((result) => {
    if (result.ok) console.log(result.already ? 'Runtime Visual C++ : déjà installé.' : 'Runtime Visual C++ : installé.'); // i18n-ignore : journal de l'installeur
    else console.error(`Runtime Visual C++ : pas installé (${result.reason}).`); // i18n-ignore : journal de l'installeur
    process.exit(result.ok ? 0 : result.cancelled ? 2 : 1);
  })
  .catch((error: Error) => {
    console.error(`Runtime Visual C++ : pas installé (${error.message}).`); // i18n-ignore : journal de l'installeur
    process.exit(1);
  });
