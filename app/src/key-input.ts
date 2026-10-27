// Touches du clavier d'une fenêtre, appui et relâchement, remis au processus principal.
//
// Annuler l'appui d'une touche dans before-input-event (event.preventDefault) fait aussi
// disparaître son relâchement : Chromium ignore tout ce que la touche produit ensuite, jusqu'à
// l'appui suivant (RenderWidgetHostImpl, suppress_events_until_keydown_). Octobre 2026 : le
// relevé des boutons, qui compte une touche quand on la relâche, ne recevait plus aucune
// touche du clavier, alors que les boutons du joystick, remis sans passer par Chromium
// (joystick-input.ts), se relevaient ; le mode invité du menu tenait pour enfoncée une touche
// relâchée depuis longtemps.
//
// Une fenêtre qui a besoin des relâchements passe donc par onKeyInput : l'appui traité n'y est
// pas annulé, c'est la page qui l'annule (preload.ts, phase de capture) après avoir demandé
// ici s'il a été traité. Le relâchement suit alors son cours jusqu'à before-input-event.
// La page ne voit toujours aucun geste du joueur ; une touche que le processus principal
// laisse passer garde son effet ordinaire, comme avant.

import { ipcMain, type BrowserWindow, type Input, type WebContents } from 'electron';

/** Question de la page (preload.ts) : « cet appui a-t-il été traité ? » */
export const KEY_HANDLED_CHANNEL = 'key-handled';

/** Pour chaque page inscrite, le dernier appui de chaque touche : traité ou non. */
const decisions = new WeakMap<WebContents, Map<string, boolean>>();

// Une page sans onKeyInput (fenêtre qui annule ses appuis elle-même) : rien à annuler de plus.
ipcMain.on(KEY_HANDLED_CHANNEL, (event, code: string) => {
  event.returnValue = decisions.get(event.sender)?.get(code) ?? false;
});

/**
 * Remet à `down` les appuis du clavier de `win` (vrai : traité, la page ne le voit pas) et à
 * `up` tous leurs relâchements, y compris ceux des appuis traités.
 */
export function onKeyInput(win: BrowserWindow, down: (input: Input) => boolean, up: (input: Input) => void): void {
  const contents = win.webContents;
  const handled = new Map<string, boolean>();
  decisions.set(contents, handled);
  contents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown') handled.set(input.code, down(input));
    else if (input.type === 'keyUp') up(input);
  });
}

/**
 * Touche du clavier (KeyboardEvent.code) au format de webContents.sendInputEvent (keyCode
 * d'Electron), pour la rejouer par le même chemin qu'une vraie touche : essais sans opérateur.
 * Undefined pour une touche que sendInputEvent ne sait pas produire.
 */
export function sendableKey(code: string): string | undefined {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  if (/^F\d{1,2}$/.test(code)) return code;
  const named: Record<string, string> = {
    Enter: 'Enter',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Space: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Minus: '-',
    Equal: '=',
    Slash: '/',
    Semicolon: ';',
    Comma: ',',
    Period: '.',
  };
  return named[code];
}
