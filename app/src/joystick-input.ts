// Boutons de joystick de la borne (Pinscape sur KL25Z, encodeur en mode manette), remis aux
// fenêtres comme des touches. La bibliothèque SDL de VPX les lit (win-displays/joystick.ts) ;
// chaque appui arrive à la fenêtre qui a le focus avec, pour KeyboardEvent.code, le jeton
// de VPX du bouton (« SDLJoy_<GUID>_1;3 »), que buttons.ts sait relever, nommer, comparer
// aux touches de la borne et écrire dans [Input]. Toute l'interface, qui lit des codes de
// touche, suit donc les boutons du joystick sans rien savoir d'eux.
//
// Comme une touche du clavier, un bouton tenu se répète (isAutoRepeat) : un flipper tenu
// fait défiler le menu. Aucune fenêtre de Cyber Pinball au premier plan (une partie de
// VPX) : les appuis ne vont nulle part.

import * as path from 'node:path';
import { BrowserWindow, type Input } from 'electron';
import { joystickCode } from '@cyberpinball/core';
import { openJoysticks, sdlLibraryIn, type JoystickDevice, type JoystickReader } from '@cyberpinball/win-displays';
import { isShown, OFFSCREEN } from './offscreen';
import { locations, vpxInstall } from './paths';

/** Sondage des boutons : 100 fois par seconde, comme une boucle de jeu. */
const POLL_MS = 10;
/** Sans VPX (pas encore installé) ou sans SDL, nouvel essai au bout de ce délai. */
const RETRY_MS = 5000;
/** Répétition d'un bouton tenu : délai puis cadence, ceux du clavier de Windows par défaut. */
const REPEAT_DELAY_MS = 500;
const REPEAT_EVERY_MS = 33;

export type JoystickStatus =
  | { state: 'off' }
  | { state: 'no-vpx' }
  | { state: 'error'; error: string }
  | { state: 'ready'; version: string; devices: JoystickDevice[] };

type Listener = (input: Input) => void;

/** Fenêtres qui reçoivent les boutons, par ordre d'inscription. */
const listeners = new Map<BrowserWindow, Listener>();
let reader: JoystickReader | undefined;
let status: JoystickStatus = { state: 'off' };
let timer: NodeJS.Timeout | undefined;
let nextTry = 0;
/** Bouton tenu : prochaine répétition. */
const held = new Map<string, number>();

/**
 * Remet à `listener` les boutons du joystick appuyés et relâchés pendant que `win` a le
 * focus, sous la forme d'un Input de before-input-event (keyDown, keyUp).
 */
export function onJoystickInput(win: BrowserWindow, listener: Listener): void {
  listeners.set(win, listener);
  win.once('closed', () => listeners.delete(win));
  start();
}

/** Ce que l'étape « Boutons » dit des joysticks. */
export function joystickStatus(): JoystickStatus {
  if (status.state === 'ready' && reader) return { ...status, devices: reader.devices() };
  return status;
}

/** Joystick virtuel de SDL des essais sans opérateur, attaché au premier appui. */
let virtualId: number | undefined;

/**
 * Essai sans opérateur (autopilote « Joy<n> ») : le bouton `button` (numéro SDL, à partir
 * de 0) d'un joystick virtuel de SDL est appuyé puis relâché, et arrive aux fenêtres par
 * le même chemin qu'un vrai Pinscape. Faux si SDL n'est pas lisible (VPX absent).
 */
export async function pressVirtualButton(button: number): Promise<boolean> {
  start();
  if (!reader && status.state !== 'error') open();
  if (!reader) return false;
  virtualId ??= reader.attachVirtual('Cyber Pinball (joystick virtuel)', 32);
  const pause = () => new Promise((resolve) => setTimeout(resolve, POLL_MS * 5));
  reader.pressVirtual(virtualId, button, true);
  await pause();
  reader.pressVirtual(virtualId, button, false);
  await pause();
  return true;
}

function start(): void {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  // Le sondage ne retient pas l'application : elle se ferme avec sa dernière fenêtre.
  timer.unref();
}

function open(): void {
  nextTry = Date.now() + RETRY_MS;
  const install = vpxInstall(locations());
  // Essais : la bibliothèque d'un VPX installé ailleurs que dans le bac à sable.
  const dll = process.env.CYBERPINBALL_SDL ?? (install && sdlLibraryIn(path.dirname(install.exe)));
  if (!dll) {
    status = { state: 'no-vpx' };
    return;
  }
  try {
    reader = openJoysticks(dll);
    status = { state: 'ready', version: reader.version, devices: reader.devices() };
    const names = status.devices.map((d) => `${d.name} (${d.id}, ${d.buttons} boutons)`).join(', ') || 'aucun'; // i18n-ignore : console
    console.log(`Joysticks : SDL ${reader.version} de VPX, ${names}`); // i18n-ignore : console
  } catch (error) {
    status = { state: 'error', error: (error as Error).message };
    console.warn(`Joysticks illisibles : ${status.error}`); // i18n-ignore : console
  }
}

/** Fenêtre qui reçoit les boutons : celle qui a le focus ; hors écran, la dernière affichée. */
function target(): BrowserWindow | undefined {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && listeners.has(focused)) return focused;
  if (!OFFSCREEN) return undefined;
  return [...listeners.keys()].reverse().find((w) => !w.isDestroyed() && isShown(w));
}

function send(code: string, type: 'keyDown' | 'keyUp', isAutoRepeat = false): void {
  const win = target();
  if (!win) return;
  listeners.get(win)!({ type, code, key: '', isAutoRepeat, shift: false, control: false, alt: false, meta: false } as Input);
}

function tick(): void {
  if (!reader) {
    if (status.state !== 'error' && Date.now() >= nextTry) open();
    if (!reader) return;
  }
  const now = Date.now();
  for (const e of reader.poll()) {
    const code = joystickCode(e.device, e.button);
    if (e.down) {
      held.set(code, now + REPEAT_DELAY_MS);
      send(code, 'keyDown');
    } else {
      held.delete(code);
      send(code, 'keyUp');
    }
  }
  for (const [code, at] of held) {
    if (now < at) continue;
    held.set(code, now + REPEAT_EVERY_MS);
    send(code, 'keyDown', true);
  }
}
