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
//
// La cause commune reste : tout clic dans un menu natif passe par webContents.getFocusedWebContents()
// (Menu._executeCommand, dans Electron), qui appelle isFocused() sur chaque page vivante. Le
// 16/11/2026, sur le poste de développement (0.1.14-essai.4), « Mon avatar » > « Chercher une image
// sur le web… », clic droit sur une image, « Télécharger cette image » : tout Cyber Pinball tombait,
// même pile (Menu::ExecuteCommand → WebContents::IsFocused → GetToplevelWindow). La page hors écran
// du convertisseur (media-convert.ts), restée ouverte après la musique de la ROM, suffisait ; après
// une relance, sans conversion encore faite, le même geste passait. Aucune page hors écran ne peut
// avoir le focus : focusSafeLookup() les écarte de cette recherche, pour tout menu natif présent et à
// venir. Garde-fous : packages/core/src/test/focus-hors-ecran.test.ts, de bout en bout dans Electron.

import { Menu, webContents, type WebContents } from 'electron';

/** À appeler avant app.whenReady : Electron ne pose alors pas son menu par défaut. */
export function noApplicationMenu(): void {
  Menu.setApplicationMenu(null);
}

/**
 * La page qui a le focus, comme Electron la cherche (une <webview> l'emporte sur la page qui la
 * contient), sans jamais interroger une page détruite ni une page hors écran : isFocused() y lit un
 * pointeur nul et le processus principal tombe.
 */
export function focusedWebContents(all: readonly WebContents[]): WebContents | null {
  let focused: WebContents | null = null;
  for (const contents of all) {
    if (contents.isDestroyed() || contents.isOffscreen() || !contents.isFocused()) continue;
    focused ??= contents;
    if (contents.getType() === 'webview') return contents;
  }
  return focused;
}

/** À appeler au démarrage, avant tout menu : la recherche d'Electron remplacée par focusedWebContents. */
export function focusSafeLookup(): void {
  webContents.getFocusedWebContents = () => focusedWebContents(webContents.getAllWebContents());
}
