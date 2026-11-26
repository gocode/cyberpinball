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
//
// Une fenêtre peut être active pour Electron sans avoir le clavier (foreground.ts) : à chaque
// appui, le clavier doit suivre, sinon la fenêtre reprend le premier plan de Windows. Sans
// cela, une borne qui mélange touches du clavier et boutons du joystick ne relève plus que
// les boutons du joystick.

import * as path from 'node:path';
import { BrowserWindow, type Input } from 'electron';
import { hatValue, joystickCode, type AxisReading, type HatDirection } from '@cyberpinball/core';
import { openJoysticks, sdlLibraryIn, type JoystickDevice, type JoystickReader } from '@cyberpinball/win-displays';
import { keyboardFollows } from './foreground';
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
const listeners = new Map<BrowserWindow, { listener: Listener; accepts: () => boolean }>();
let reader: JoystickReader | undefined;
let status: JoystickStatus = { state: 'off' };
let timer: NodeJS.Timeout | undefined;
let nextTry = 0;
/** Bouton tenu : prochaine répétition. */
const held = new Map<string, number>();

/**
 * Remet à `listener` les boutons du joystick appuyés et relâchés pendant que `win` a le
 * focus, sous la forme d'un Input de before-input-event (keyDown, keyUp). `accepts` peut
 * suspendre une fenêtre sans couper les observateurs globaux (Exit, réglages en partie).
 */
export function onJoystickInput(win: BrowserWindow, listener: Listener, accepts: () => boolean = () => true): void {
  listeners.set(win, { listener, accepts });
  win.once('closed', () => listeners.delete(win));
  start();
}

/** Écouteurs de tous les boutons, quelle que soit la fenêtre au premier plan. */
const watchers = new Set<(code: string, down: boolean) => void>();

/**
 * Chaque bouton du joystick appuyé ou relâché, même quand VPX a le premier plan (une partie :
 * la combinaison qui ouvre les réglages en partie, in-game-menu.ts). Rend de quoi arrêter.
 */
export function watchJoystickButtons(listener: (code: string, down: boolean) => void): () => void {
  watchers.add(listener);
  start();
  return () => watchers.delete(listener);
}

/** Boutons du joystick tenus en ce moment (jetons de VPX). */
export function joystickButtonsHeld(): string[] {
  return [...held.keys()];
}

/**
 * VPX vient d'être installé, ou le runtime Visual C++ que sa bibliothèque SDL importe : les joysticks
 * se relisent tout de suite. Sans cela, une bibliothèque qui n'avait pas pu se charger (runtime
 * absent) le restait jusqu'au redémarrage, et VPX installé n'était vu qu'au sondage suivant.
 */
export function retryJoysticks(): JoystickStatus {
  if (!reader) {
    status = { state: 'off' };
    open();
    start();
  }
  return joystickStatus();
}

/** Ce que l'étape « Boutons » dit des joysticks. */
export function joystickStatus(): JoystickStatus {
  if (status.state === 'ready' && reader) return { ...status, devices: reader.devices() };
  return status;
}

/** Joystick virtuel de SDL des essais sans opérateur, attaché au premier appui. */
let virtualId: number | undefined;
const VIRTUAL_NAME = 'Cyber Pinball (joystick virtuel)'; // i18n-ignore : nom de périphérique SDL des essais
const VIRTUAL_PINSCAPE_NAME = 'mjrnet Pinscape Controller (joystick virtuel)'; // i18n-ignore : nom de périphérique SDL des essais

/** Ce que les appuis de l'autopilote attendent du sondage : chaque changement lu, une fois remis aux fenêtres. */
const readWaiters = new Set<(device: string, down: boolean) => void>();

/**
 * Un appui de l'autopilote sur un joystick virtuel : `press`, puis `release` dès que le sondage a lu
 * l'appui et l'a remis aux fenêtres, jamais au bout d'un délai ; la promesse se résout quand le
 * relâchement est lu à son tour. Bancs du 26/11/2026 : sur une machine chargée, la pause de 50 ms
 * entre l'appui et le relâchement durait plusieurs secondes ; le bouton restait tenu pour l'assistant,
 * qui ouvrait « Quitter sans enregistrer ? » (maintien) ou le répétait. Faux si rien n'est lu.
 */
function pressAndRelease(name: string, press: () => void, release: () => void): Promise<boolean> {
  const device = reader?.devices().find((d) => d.name === name)?.id;
  if (!device) return Promise.resolve(false);
  return new Promise((resolve) => {
    let pressed = false;
    // Garde-fou d'un sondage arrêté, pas une attente : l'appui est rendu dès qu'il est lu.
    const stuck = setTimeout(() => finish(false), 60_000);
    const finish = (ok: boolean) => {
      clearTimeout(stuck);
      readWaiters.delete(waiter);
      resolve(ok);
    };
    const waiter = (from: string, down: boolean) => {
      if (from !== device) return;
      if (down && !pressed) {
        pressed = true;
        release();
      } else if (!down && pressed) finish(true);
    };
    readWaiters.add(waiter);
    press();
  });
}

/**
 * Essai sans opérateur (autopilote « Joy<n> ») : le bouton `button` (numéro SDL, à partir
 * de 0) d'un joystick virtuel de SDL est appuyé puis relâché, et arrive aux fenêtres par
 * le même chemin qu'un vrai Pinscape. Faux si SDL n'est pas lisible (VPX absent).
 */
export async function pressVirtualButton(button: number): Promise<boolean> {
  start();
  if (!reader && status.state !== 'error') open();
  if (!reader) return false;
  const r = reader;
  const id = (virtualId ??= r.attachVirtual(VIRTUAL_NAME, 32, 0, 1));
  return pressAndRelease(VIRTUAL_NAME, () => r.pressVirtual(id, button, true), () => r.pressVirtual(id, button, false));
}

/**
 * Essai sans opérateur (autopilote « JoyCroix:up ») : la croix du même joystick virtuel est
 * poussée dans la direction `direction` puis relâchée, comme la croix d'une manette en XInput.
 */
export async function pressVirtualHat(direction: HatDirection): Promise<boolean> {
  start();
  if (!reader && status.state !== 'error') open();
  if (!reader) return false;
  const r = reader;
  const id = (virtualId ??= r.attachVirtual(VIRTUAL_NAME, 32, 0, 1));
  return pressAndRelease(VIRTUAL_NAME, () => r.moveVirtualHat(id, 0, hatValue([direction])), () => r.moveVirtualHat(id, 0, 0));
}

/**
 * Position des axes de chaque joystick (lanceur analogique, accéléromètre), lue au dernier
 * sondage ; vide sans VPX ou sans joystick à axes.
 */
export function joystickAxes(): AxisReading[] {
  start();
  if (!reader && status.state !== 'error' && Date.now() >= nextTry) open();
  return reader ? reader.axes() : [];
}

/** Pinscape virtuel des essais sans opérateur (six axes, comme un KL25Z en « X/Y/Z + RX/RY/RZ »). */
let virtualPinscape: number | undefined;

/**
 * Essai sans opérateur (autopilote « Axe2:0.9 ») : l'axe `axis` d'un Pinscape virtuel de SDL
 * prend la valeur `value` (-1 à 1), lue par le même chemin qu'un vrai lanceur. Faux si SDL
 * n'est pas lisible (VPX absent).
 */
export function moveVirtualAxis(axis: number, value: number): boolean {
  start();
  if (!reader && status.state !== 'error') open();
  if (!reader) return false;
  virtualPinscape ??= reader.attachVirtual(VIRTUAL_PINSCAPE_NAME, 32, 6);
  reader.moveVirtual(virtualPinscape, axis, value);
  return true;
}

/**
 * Essai sans opérateur (autopilote « Pinscape9 ») : le bouton `button` du Pinscape virtuel des
 * axes, appuyé puis relâché, comme un balancier câblé sur la carte qui porte l'accéléromètre.
 */
export async function pressVirtualPinscapeButton(button: number): Promise<boolean> {
  if (!moveVirtualAxis(0, 0)) return false;
  const r = reader!;
  const id = virtualPinscape!;
  return pressAndRelease(VIRTUAL_PINSCAPE_NAME, () => r.pressVirtual(id, button, true), () => r.pressVirtual(id, button, false));
}

/**
 * Sondage tout de suite, avant de conclure qu'un bouton est tenu : un bouton relâché pendant que le
 * processus était occupé (machine chargée) n'est lu qu'au sondage suivant, qui pouvait passer après
 * la minuterie du maintien ; son relâchement est ainsi remis avant la décision.
 */
export function readJoysticksNow(): void {
  if (timer && reader) tick();
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
  if (focused && listeners.has(focused)) return listeners.get(focused)!.accepts() ? focused : undefined;
  if (!OFFSCREEN) return undefined;
  return [...listeners.keys()].reverse().find((w) => !w.isDestroyed() && isShown(w) && listeners.get(w)!.accepts());
}

function send(code: string, type: 'keyDown' | 'keyUp', isAutoRepeat = false): void {
  const win = target();
  if (!win) return;
  // Le clavier va là où vont les boutons du joystick.
  if (type === 'keyDown' && !isAutoRepeat) keyboardFollows(win, `le bouton ${code} du joystick allait à Cyber Pinball`); // i18n-ignore : console
  listeners.get(win)!.listener({ type, code, key: '', isAutoRepeat, shift: false, control: false, alt: false, meta: false } as Input);
}

function tick(): void {
  if (!reader) {
    if (status.state !== 'error' && Date.now() >= nextTry) open();
    if (!reader) return;
  }
  const now = Date.now();
  for (const e of reader.poll()) {
    const code = joystickCode(e.device, e.button, e.axis);
    for (const watcher of watchers) watcher(code, e.down);
    if (e.down) {
      held.set(code, now + REPEAT_DELAY_MS);
      send(code, 'keyDown');
    } else {
      held.delete(code);
      send(code, 'keyUp');
    }
    for (const waiter of [...readWaiters]) waiter(e.device, e.down);
  }
  for (const [code, at] of held) {
    if (now < at) continue;
    held.set(code, now + REPEAT_EVERY_MS);
    send(code, 'keyDown', true);
  }
}
