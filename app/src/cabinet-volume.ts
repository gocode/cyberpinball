// Volume de la borne (packages/core/src/cabinetvolume.ts) : Volume −, Volume + et Muet règlent le son
// de Windows sur les sorties de la configuration, au menu comme pendant une partie, et une pastille
// le montre au milieu du haut du plateau, tournée vers le joueur, le temps d'un appui.
//
// Les boutons sont lus ici, quelle que soit la fenêtre au premier plan (VPX pendant une partie) :
// touches du clavier par GetAsyncKeyState (keysDown), boutons du joystick par le sondage de SDL
// (watchJoystickButtons), comme la combinaison des réglages en partie (in-game-menu.ts). VPX n'a
// plus de touche pour ses propres actions de volume (buttons.ts, vpxVolumeSettings).
//
// La pastille est une fenêtre transparente, sans focus, que les clics traversent et qu'aucune
// capture ne voit (game-notice.ts, overlay) : elle ne prend jamais la main à VPX ni au menu.
//
// Hors écran (essais sans opérateur), le son de Windows n'est jamais touché : un volume simulé, et les
// appuis arrivent par les fenêtres du menu (autopilote), GetAsyncKeyState ne voyant rien.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MUTE_HOLD_MS,
  VOLUME_BADGE_MS,
  VOLUME_BADGE_MUTED_MS,
  VOLUME_BADGE_SIZE,
  VOLUME_BUTTONS,
  VolumeButtons,
  WINDOWS_VOLUME_KEYS,
  buttonKeys,
  gameNoticeBounds,
  volumeAfter,
  volumeLogLine,
  volumeView,
  windowsVk,
  type CabinetButtons,
  type OutputVolume,
  type Rect,
  type Rotation,
  type VolumeButton,
  type VolumeCommand,
} from '@cyberpinball/core';
import { keysDown, readEndpointVolumes, writeEndpointVolumes } from '@cyberpinball/win-displays';
import type { Input } from 'electron';
import { alive, dispose, overlay, raise, type Overlay } from './game-notice';
import { joystickButtonsHeld, watchJoystickButtons } from './joystick-input';
import { checkLayout } from './layout-check';
import { isShown, OFFSCREEN } from './offscreen';

/** Sondage des boutons : assez vif pour un appui bref, comme la combinaison des réglages en partie. */
const POLL_MS = 25;
/** Touche multimédia : Windows règle le son, la pastille lit le résultat juste après. */
const WINDOWS_SETTLE_MS = 80;
/** La configuration (boutons, sorties) relue au plus souvent : cabinet.json ne change pas en partie. */
const CONFIG_TTL_MS = 2000;
/** La fenêtre de la pastille, vide, se ferme après ce temps sans appui. */
const IDLE_CLOSE_MS = 60_000;

export interface CabinetVolumeOptions {
  /** Boutons et sorties audio de la configuration branchée (relus de temps en temps). */
  config(): { buttons: CabinetButtons | undefined; outputs: string[] };
  /** Zone du plateau (pixels physiques) et sens de sa mise en page : où se pose la pastille. */
  place(): { zone: Rect; rotation: Rotation } | undefined;
  /** Essais sans opérateur : captures de la pastille (CYBERPINBALL_CAPTURE). */
  captureDir?: string;
  log(line: string): void;
}

export interface CabinetVolume {
  /** Hors écran : un appui ou un relâchement arrivé à une fenêtre du menu (autopilote). */
  windowInput(input: Input): void;
  /** Le son est coupé : la pastille le rappelle (retour au menu, démarrage). */
  remindIfMuted(): void;
  stop(): void;
}

/** Volume simulé des essais : une sortie, 50 %. */
const simulated: OutputVolume[] = [{ id: 'essai', level: 0.5, muted: false }];

function readVolumes(ids: string[]): OutputVolume[] {
  if (OFFSCREEN) return simulated.map((o) => ({ ...o }));
  return readEndpointVolumes(ids);
}

function writeVolumes(outputs: OutputVolume[]): void {
  if (OFFSCREEN) {
    simulated.splice(0, simulated.length, ...outputs.map((o) => ({ ...o })));
    return;
  }
  writeEndpointVolumes(outputs);
}

export function startCabinetVolume(opts: CabinetVolumeOptions): CabinetVolume {
  const buttons = new VolumeButtons();
  let cached: { at: number; keys: CabinetButtons; outputs: string[] } | undefined;
  /** Sorties telles qu'avant l'appui de Volume − : Volume − maintenu y revient, son coupé ou rétabli. */
  let beforeDown: OutputVolume[] | undefined;
  /** Hors écran : codes tenus d'après les fenêtres du menu. */
  const windowHeld = new Set<string>();
  /** Touches multimédia vues enfoncées (Windows règle le son, la pastille suit). */
  const windowsHeld = new Set<string>();
  let badge: Overlay | undefined;
  /** Dernier état de la pastille : celle qui finit de se charger montre le plus récent. */
  let latest: object | undefined;
  let hideTimer: NodeJS.Timeout | undefined;
  let failed = false;
  const captured = new Set<string>();

  function config() {
    const now = Date.now();
    if (!cached || now - cached.at > CONFIG_TTL_MS) {
      const c = opts.config();
      cached = { at: now, keys: buttonKeys(c.buttons), outputs: c.outputs };
    }
    return cached;
  }

  /** Les boutons de volume tenus maintenant, et les touches multimédia (laissées à Windows). */
  function pressed(keys: CabinetButtons): { down: Set<VolumeButton>; windows: Set<string> } {
    const down = new Set<VolumeButton>();
    const windows = new Set<string>();
    const codes = VOLUME_BUTTONS.map((id) => [id, keys[id]] as const).filter((e): e is readonly [VolumeButton, string] => Boolean(e[1]));
    if (!codes.length) return { down, windows };
    const joystick = new Set(joystickButtonsHeld());
    const vks = codes.map(([, c]) => windowsVk(c)).filter((vk): vk is number => vk !== undefined);
    let keyboard: number[] = [];
    try {
      keyboard = !OFFSCREEN && vks.length ? keysDown(vks) : [];
    } catch {
      // API de Windows indisponible : seuls les joysticks comptent.
    }
    for (const [id, code] of codes) {
      const held = code.startsWith('SDLJoy_') ? joystick.has(code) : OFFSCREEN ? windowHeld.has(code) : keyboard.includes(windowsVk(code)!);
      if (!held) continue;
      if (WINDOWS_VOLUME_KEYS.includes(code)) windows.add(code);
      else down.add(id);
    }
    return { down, windows };
  }

  function poll(): void {
    const c = config();
    const { down, windows } = pressed(c.keys);
    for (const command of buttons.update(down, Date.now())) apply(command, c);
    // Touche multimédia : Windows a déjà réglé le son, la pastille montre ce qu'il en est.
    for (const code of windows) if (!windowsHeld.has(code)) setTimeout(() => show(readSafe(c.outputs), 'windows', c.keys), WINDOWS_SETTLE_MS);
    windowsHeld.clear();
    for (const code of windows) windowsHeld.add(code);
  }

  function readSafe(ids: string[]): OutputVolume[] {
    try {
      return readVolumes(ids);
    } catch (error) {
      if (!failed) opts.log(`Volume de la borne : son de Windows illisible (${(error as Error).message}).`); // i18n-ignore : journal
      failed = true;
      return [];
    }
  }

  function apply(command: VolumeCommand, c: { keys: CabinetButtons; outputs: string[] }): void {
    const now = readSafe(c.outputs);
    if (!now.length) return;
    if (command === 'down') beforeDown = now;
    const next = volumeAfter(now, command, command === 'hold' ? beforeDown : undefined);
    try {
      writeVolumes(next);
    } catch (error) {
      opts.log(`Volume de la borne : réglage refusé par Windows (${(error as Error).message}).`); // i18n-ignore : journal
      return;
    }
    show(next, command, c.keys);
  }

  function show(outputs: OutputVolume[], command: VolumeCommand | 'windows' | 'reminder', keys: CabinetButtons): void {
    const view = volumeView(outputs, Boolean(keys.volumeMute));
    if (!view) return;
    opts.log(volumeLogLine(outputs, command));
    const place = opts.place();
    if (!place) return;
    const unit = Math.min(place.zone.width, place.zone.height) / 1080;
    const size = { width: Math.round(VOLUME_BADGE_SIZE.width * unit), height: Math.round(VOLUME_BADGE_SIZE.height * unit) };
    const bounds = gameNoticeBounds(place.zone, place.rotation, size, Math.round(VOLUME_BADGE_SIZE.margin * unit), 'top-center');
    const key = JSON.stringify([bounds, place.rotation]);
    latest = { view: { mode: 'volume', ...view }, rotation: place.rotation };
    const send = (o: Overlay) => {
      o.win.webContents.send('notice:state', latest);
      // Une fenêtre de VPX (ou du menu) passée devant depuis : la pastille repasse devant.
      raise(o);
      capture(o, view.muted ? 'coupe' : 'niveau');
    };
    if (alive(badge) && badge.key !== key) dispose(badge);
    if (!alive(badge)) badge = overlay(bounds, key, (o) => send(o));
    else if (badge.loaded) send(badge);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, view.muted ? VOLUME_BADGE_MUTED_MS : VOLUME_BADGE_MS);
  }

  /**
   * La pastille s'efface : la fenêtre reste, vide, transparente et traversée par les clics, prête pour
   * l'appui suivant ; sans appui pendant IDLE_CLOSE_MS, elle se ferme. Jamais hide() : une fenêtre
   * masquée laisserait voir le bureau (screencover.test.ts).
   */
  function hide(): void {
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      dispose(badge);
      badge = undefined;
    }, IDLE_CLOSE_MS);
    latest = { view: undefined };
    if (alive(badge) && badge.loaded) badge.win.webContents.send('notice:state', latest);
  }

  /** Essais : une capture de chaque état, et le garde-fou de mise en page. */
  function capture(o: Overlay, state: string): void {
    if (!opts.captureDir || captured.has(state)) return;
    captured.add(state);
    setTimeout(async () => {
      if (!alive(o)) return;
      fs.mkdirSync(opts.captureDir!, { recursive: true });
      fs.writeFileSync(path.join(opts.captureDir!, `volume-borne-${state}.png`), (await o.win.webContents.capturePage()).toPNG()); // i18n-ignore : nom de fichier des essais
      const problems = await checkLayout(o.win.webContents);
      opts.log(`Pastille du volume (${state}) : ${problems.length ? problems.join(' ; ') : 'mise en page conforme'}.`); // i18n-ignore : journal
    }, 300);
  }

  const stopWatch = watchJoystickButtons(() => poll());
  const timer = setInterval(poll, POLL_MS);
  timer.unref();
  const c = config();
  const where = c.outputs.length ? `${c.outputs.length} sortie(s) de la configuration` : 'sortie par défaut de Windows'; // i18n-ignore : journal
  const present = VOLUME_BUTTONS.filter((id) => c.keys[id]).map((id) => `${id} ${c.keys[id]}`); // i18n-ignore : journal
  opts.log(`Volume de la borne : ${present.length ? present.join(', ') : 'aucun bouton de volume'} ; ${where}${OFFSCREEN ? ', volume simulé (hors écran)' : ''} ; Volume − maintenu ${MUTE_HOLD_MS} ms : son coupé ou rétabli.`); // i18n-ignore : journal

  return {
    windowInput(input) {
      if (!OFFSCREEN) return;
      if (input.type === 'keyDown') windowHeld.add(input.code);
      else if (input.type === 'keyUp') windowHeld.delete(input.code);
      poll();
    },
    remindIfMuted() {
      const c = config();
      const now = readSafe(c.outputs);
      if (now[0]?.muted) show(now, 'reminder', c.keys);
    },
    stop() {
      clearInterval(timer);
      stopWatch();
      if (hideTimer) clearTimeout(hideTimer);
      dispose(badge);
    },
  };
}
