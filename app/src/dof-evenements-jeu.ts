// Une partie sur une table sans ROM, que le plugin DOF de VPX 10.8 ne prend pas en charge (il n'initialise
// libdof qu'avec une ROM PinMAME). controller.vbs de VPX recopie les « DOF n, état » du script dans un
// fichier (packages/core/src/dof-evenements.ts), lu pendant la partie de l'une de deux façons :
// - relais : une table originale dont la config DOF de la borne a la ligne (nom B2S, cGameName). Un
//   processus à part (relais-dof.ts, dof-relais.ts) initialise la libdof de VPX avec ce nom et lui passe
//   les événements : tous les effets du configtool, sur tout le matériel. Le port des LED est rendu à
//   libdof avant qu'elle s'initialise. Allumé par défaut, coupé par le réglage « originals ».
// - générique : sinon, et si le joueur l'a voulu, le pilote des LED (led-live.ts) joue les effets de
//   dof-scene.ts sur les bandes décrites : événements du script (rôle lu dans le script), boutons de la
//   borne et lanceur analogique. Le port série des LED reste alors à Cyber Pinball pour cette partie.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DOF_EVENT_DEFAULTS,
  DOF_TAP_ENV,
  LED_ALL,
  addDofTap,
  classifyDofScript,
  createDofScene,
  createLaunchDetector,
  dofEventClass,
  dofScenePalette,
  parseTapChunk,
  type CabinetLeds,
  type DofEventClass,
  type DofEventSettings,
  type DofZone,
} from '@cyberpinball/core';
import { startDofRelay, vpxDofDll, type DofRelay, type DofRelayJob } from './dof-relais';
import type { LedService } from './led-live';

const SETTINGS_FILE = 'dof-evenements.json';
const BACKUP = '.cyberpinball-avant';
/** Intensités proposées par le menu. */
export const DOF_EVENT_LEVELS = [30, 50, 70, 100] as const;

export function loadEventSettings(dataDir: string): DofEventSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, SETTINGS_FILE), 'utf8')) as Partial<DofEventSettings>;
    const intensity = typeof raw.intensity === 'number' ? Math.max(0, Math.min(100, raw.intensity)) : DOF_EVENT_DEFAULTS.intensity;
    return { enabled: raw.enabled === true, intensity, ...(raw.originals === false ? { originals: false } : {}), ...(raw.romFallback === false ? { romFallback: false } : {}) };
  } catch {
    return { ...DOF_EVENT_DEFAULTS };
  }
}

export function saveEventSettings(dataDir: string, settings: DofEventSettings): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, SETTINGS_FILE), JSON.stringify(settings));
}

/** Boutons de la borne qui ont un effet même quand le script de la table n'appelle pas DOF. */
export type DofButton = 'leftFlipper' | 'rightFlipper' | 'plunger' | 'start';

export interface DofTapDeps {
  dataDir: string;
  /** Bandes décrites dans Cabinet.xml ; undefined : pas de LED adressables. */
  leds(): CabinetLeds | undefined;
  service: Pick<LedService, 'configure' | 'start' | 'setFrame' | 'blackout' | 'stop' | 'gameStarted'>;
  /** Boutons de la borne pendant la partie (VPX au premier plan) : `on(bouton, appuyé)` ; rend de quoi arrêter. */
  watchButtons?(on: (button: DofButton, down: boolean) => void): () => void;
  /** Tirette du lanceur analogique : 0 au repos, 1 tirée à fond ; undefined sans lanceur analogique. */
  plungerPull?(): number | undefined;
  log(line: string): void;
  /** Config DOF de la borne : base de libdof (préférences de VPX, séparateur final) et ROM qui y ont une ligne. */
  dof?(): { base: string; has(rom: string): boolean } | undefined;
  /** Remplaçable par les essais. */
  startRelay?(job: DofRelayJob, log: (line: string) => void): DofRelay;
}

export type DofTapMode = { kind: 'relais'; rom: string } | { kind: 'generique' };

/** Ce que fera une partie : relais vers libdof, profil générique, ou rien (table à ROM : le plugin DOF de VPX s'en charge). */
export function tapMode(deps: DofTapDeps, table: { hasRom: boolean; b2sName?: string }): DofTapMode | undefined {
  if (table.hasRom) return undefined;
  const settings = loadEventSettings(deps.dataDir);
  if (table.b2sName && settings.originals !== false && deps.dof?.()?.has(table.b2sName)) return { kind: 'relais', rom: table.b2sName };
  return settings.enabled && deps.leds()?.strips.length ? { kind: 'generique' } : undefined;
}

/** Le port des LED reste-t-il à Cyber Pinball pendant cette partie (profil générique) ? */
export function tapPlanned(deps: DofTapDeps, hasRom: boolean, b2sName?: string): boolean {
  return tapMode(deps, { hasRom, b2sName })?.kind === 'generique';
}

/** Les bandes d'une zone : par leur nom (gauche, droite), sinon toutes. */
export function zoneTarget(leds: CabinetLeds, zone: DofZone): string {
  const re = zone === 'left' ? /gauche|left|\bg\b|\bl\b/i : zone === 'right' ? /droit|right|\bd\b|\br\b/i : undefined;
  return (re && leds.strips.find((s) => re.test(s.name))?.name) || LED_ALL;
}

/** Retouche controller.vbs de VPX (copie d'origine gardée à côté, une seule fois) ; false si l'écoute n'a pas pu être posée. */
export function installTap(vpxExe: string): boolean {
  try {
    const file = path.join(path.dirname(vpxExe), 'scripts', 'controller.vbs');
    const text = fs.readFileSync(file, 'latin1');
    const patched = addDofTap(text);
    if (patched === undefined) return false;
    if (patched !== text) {
      if (!fs.existsSync(file + BACKUP)) fs.writeFileSync(file + BACKUP, text, 'latin1');
      fs.writeFileSync(file, patched, 'latin1');
    }
    return true;
  } catch {
    return false;
  }
}

export interface DofTapGame {
  /** À passer à VPX (variables d'environnement de la partie). */
  env: Record<string, string>;
  stop(): void;
}

/** Nouveau fichier d'écoute, vide, pour une partie. */
function tapFile(): string {
  const file = path.join(os.tmpdir(), `cyberpinball-dof-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(file, '');
  return file;
}

/** Relais vers libdof : écoute posée, port des LED rendu, puis initialisation (sans rien attendre ici). */
function startRelayGame(deps: DofTapDeps, vpxExe: string, rom: string, table: string): DofTapGame | undefined {
  const dll = vpxDofDll(vpxExe);
  const base = deps.dof?.()?.base;
  if (!dll || !base || !installTap(vpxExe)) return undefined;
  const file = tapFile();
  const relay = (deps.startRelay ?? startDofRelay)({ dll, base, table, rom, tap: file }, deps.log);
  // Le port des LED est peut-être ouvert (animations du menu) : libdof ne l'aurait pas.
  deps.service.gameStarted().then(
    () => relay.begin(),
    () => relay.begin(),
  );
  deps.log(`DOF de la table originale (${rom}) : relais vers libdof.`); // i18n-ignore : journal
  return {
    env: { [DOF_TAP_ENV]: file },
    stop() {
      relay.stop();
      // Le relais lit encore la fin du fichier : effacé quand il est sorti.
      void relay.done.finally(() => fs.rmSync(file, { force: true }));
    },
  };
}

/** Ce que la partie sait de la table pour ses effets : son script (rôle des événements) et sa couleur. */
export interface DofTapTable {
  script?: string;
  /** Couleur de la table (#rrggbb), d'où la palette des effets quand ses couleurs mesurées manquent. */
  color?: string;
  /** Couleurs dominantes mesurées de la table (TableTints, jusqu'à quatre) : celles de la roue et du DMD. */
  colors?: string[];
}

const BUTTON_EVENTS: Readonly<Record<DofButton, DofEventClass>> = {
  leftFlipper: { kind: 'flipper', side: 'left' },
  rightFlipper: { kind: 'flipper', side: 'right' },
  // Le couloir du lanceur est à droite sur presque toutes les tables.
  plunger: { kind: 'launch', side: 'right' },
  start: { kind: 'game-start', side: 'center' },
};

/**
 * Au lancement d'une partie dont `tapMode` a dit le mode : pose l'écoute, puis lance le relais, ou ouvre
 * les LED du profil générique (sans attendre : le lancement de VPX ne patiente jamais). undefined : rien à faire.
 *
 * Profil générique : chaque événement DOF du script prend le rôle que lui donne le script de la table
 * (classifyDofScript), les boutons de la borne (flippers, lanceur, Start) et la tirette du lanceur
 * analogique ont leur effet même si le script n'appelle pas DOF, et les bandes reçoivent une image par
 * 1/30 s (dof-scene.ts) aux couleurs de la table.
 */
export function startTap(deps: DofTapDeps, vpxExe: string, mode: DofTapMode = { kind: 'generique' }, table = '', about: DofTapTable = {}): DofTapGame | undefined {
  if (mode.kind === 'relais') return startRelayGame(deps, vpxExe, mode.rom, table);
  const leds = deps.leds();
  if (!leds || !installTap(vpxExe)) return undefined;
  const file = tapFile();
  deps.service.configure(leds);
  deps.service.start().catch((e: Error) => deps.log(`Effets LED sans DOF : ${e.message}`)); // i18n-ignore : journal
  const settings = loadEventSettings(deps.dataDir);
  const scene = createDofScene(dofScenePalette(about.color, about.colors), settings.intensity / 100);
  let classes: Map<number, DofEventClass> | undefined;
  try {
    classes = about.script ? classifyDofScript(about.script) : undefined;
  } catch {
    classes = undefined;
  }
  const strips = leds.strips.map((s) => ({ name: s.name, width: s.width, height: s.height, arrangement: s.arrangement }));
  const play = (c: DofEventClass, on: boolean) => (on ? scene.trigger(c.kind, c.side, Date.now()) : scene.release(c.kind, c.side, Date.now()));
  const stopButtons = deps.watchButtons?.((button, down) => {
    // Lanceur : la bille part quand le bouton est relâché.
    if (button === 'plunger') return void (down ? undefined : play(BUTTON_EVENTS.plunger, true));
    play(BUTTON_EVENTS[button], down);
  });
  const launched = createLaunchDetector();
  let offset = 0;
  let rest = '';
  let lastFrame = 0;
  const poll = setInterval(() => {
    const now = Date.now();
    const pull = deps.plungerPull?.();
    if (pull !== undefined && launched(pull, now)) play(BUTTON_EVENTS.plunger, true);
    try {
      const size = fs.statSync(file).size;
      if (size > offset) {
        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(size - offset);
        fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        offset = size;
        const { events, rest: tail } = parseTapChunk(rest + buf.toString('latin1'));
        rest = tail;
        for (const ev of events) play(dofEventClass(classes, ev.number), ev.state >= 1);
      }
    } catch {
      // Fichier pas encore là ou en cours d'écriture : au prochain tour.
    }
    // Une image par 1/30 s au plus (le pilote n'en envoie pas plus).
    if (now - lastFrame >= 33) {
      lastFrame = now;
      for (const s of strips) deps.service.setFrame(s.name, scene.render(s, now), 'ambient');
    }
  }, 15);
  const known = classes ? [...classes.values()].filter((c) => c.kind !== 'other').length : 0;
  deps.log(`Effets LED sans DOF : écoute des événements de la table (${classes?.size ?? 0} dans le script, ${known} reconnus${deps.watchButtons ? ', boutons de la borne' : ''}).`); // i18n-ignore : journal
  return {
    env: { [DOF_TAP_ENV]: file },
    stop() {
      clearInterval(poll);
      stopButtons?.();
      deps.service.blackout();
      void deps.service.stop();
      fs.rmSync(file, { force: true });
    },
  };
}
