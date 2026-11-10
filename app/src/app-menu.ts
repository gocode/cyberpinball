// Pas de menu d'application. Sans menu défini, Electron en pose un par défaut (Fichier, Édition,
// Affichage, Fenêtre), invisible dans les fenêtres sans cadre de la borne mais dont les raccourcis
// restent actifs : une touche qu'une page ne traite pas (Ctrl+A, Ctrl+R, Ctrl+W, Ctrl+Maj+I…) les
// déclenche.
//
// Le 10/11/2026, sur le PinCab (0.1.9-essai.30), c'est ce qui faisait tomber tout Cyber Pinball quand
// on tapait au téléphone dans la page de connexion de Google : le texte complet passe par Ctrl+A
// (phone-remote.ts) ; la page ne le traitant pas, Ctrl+A remontait au rôle « Tout sélectionner »
// du menu par défaut, dont le code (dans Electron) appelle isFocused() sur chaque contenu ; sur une
// vue cachée hors écran (offscreen, sans fenêtre : les lectures de page en arrière-plan de
// « Récupérer »), isFocused() lit un pointeur nul (aura::Window::GetToplevelWindow) et le
// processus principal tombe. Prouvé par le rapport de Crashpad du PinCab, symbolisé avec les
// symboles d'Electron 44.5.1, et reproduit à l'identique (même instruction, même pile).
//
// Les raccourcis d'édition des champs (Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+Z) n'en dépendent pas sous
// Windows : la page les traite elle-même. Garde-fou : packages/core/src/test/saisie-robuste.test.ts.

import { Menu } from 'electron';

/** À appeler avant app.whenReady : Electron ne pose alors pas son menu par défaut. */
export function noApplicationMenu(): void {
  Menu.setApplicationMenu(null);
}
