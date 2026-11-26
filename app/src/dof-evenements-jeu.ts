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
// Un relais impossible, qui ne s'initialise pas ou qui s'arrête en cours de partie passe au profil générique
// (s'il est voulu) : la table n'est jamais muette pour une panne du relais. Une table crue « à ROM » dont
// PinMAME ne démarre pas y passe aussi, en cours de partie (led-rom.ts, frontend.ts).

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DOF_EVENT_DEFAULTS,
  DOF_TAP_ENV,
  LED_ALL,
  LED_LEVEL_SCALE,
  ledLevelFromLinear,
  ledLevelGain,
  addDofTap,
  classifyDofScript,
  createDofScene,
  createLaunchDetector,
  dofEventClass,
  dofScenePalette,
  dofTapReach,
  parseTapChunk,
  readLedAnimations,
  type CabinetLeds,
  type DofEventClass,
  type DofEventSettings,
  type DofZone,
} from '@cyberpinball/core';
import { startDofRelay, vpxDofDll, type DofRelay, type DofRelayJob } from './dof-relais';
import type { LedService } from './led-live';

const SETTINGS_FILE = 'dof-evenements.json';
const BACKUP = '.cyberpinball-avant';

export function loadEventSettings(dataDir: string): DofEventSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, SETTINGS_FILE), 'utf8')) as Partial<DofEventSettings> & { scale?: unknown };
    // Fichier d'avant la courbe perçue (sans `scale`) : son intensité était linéaire, reprise au cran qui donne la même lumière.
    const stored = typeof raw.intensity === 'number' && Number.isFinite(raw.intensity) ? Math.max(0, Math.min(100, Math.round(raw.intensity))) : undefined;
    const intensity = stored === undefined ? DOF_EVENT_DEFAULTS.intensity : raw.scale === LED_LEVEL_SCALE ? stored : ledLevelFromLinear(stored);
    return { enabled: raw.enabled === true, intensity, ...(raw.originals === false ? { originals: false } : {}), ...(raw.romFallback === false ? { romFallback: false } : {}) };
  } catch {
    return { ...DOF_EVENT_DEFAULTS };
  }
}

export function saveEventSettings(dataDir: string, settings: DofEventSettings): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, SETTINGS_FILE), JSON.stringify({ ...settings, scale: LED_LEVEL_SCALE }));
}

/**
 * Force des effets en partie (gain linéaire, 0..1) : l'intensité des événements, jamais au-dessus de la
 * luminosité maximale des animations LED (retour d'essai du 25/11/2026 : réglée basse au menu, la partie
 * l'ignorait). Les deux sont des % perçus : le plus bas passe par la même courbe que les animations, la
 * partie ne paraît donc jamais plus forte que le menu.
 */
export function gameLedGain(dataDir: string): number {
  return ledLevelGain(Math.min(loadEventSettings(dataDir).intensity, readLedAnimations(dataDir).brightness));
}

/** Ligne de journal à la fin d'une partie en effets génériques : événements reçus et part du temps allumé. */
export function ledGameSummary(seen: ReadonlyMap<string, number>, frames: number, litFrames: number): string {
  const total = [...seen.values()].reduce((s, n) => s + n, 0);
  const kinds = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  const share = frames ? Math.round((100 * litFrames) / frames) : 0;
  return `Effets LED sans DOF : fin de partie, ${total} événement(s)${kinds ? ` (${kinds})` : ''}, bandes allumées ${share} % du temps.`; // i18n-ignore : journal
}

/** Boutons de la borne qui ont un effet même quand le script de la table n'appelle pas DOF. */
export type DofButton = 'leftFlipper' | 'rightFlipper' | 'plunger' | 'start';

export interface DofTapDeps {
  dataDir: string;
  /** Bandes décrites dans Cabinet.xml ; undefined : pas de LED adressables. */
  leds(): CabinetLeds | undefined;
  service: Pick<LedService, 'configure' | 'start' | 'setFrame' | 'blackout' | 'stop' | 'gameStarted'> & Partial<Pick<LedService, 'gameReleased'>>;
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
  /** Le port des LED est-il à Cyber Pinball (effets sans ROM), et non à DOF ? Change si le relais échoue. */
  ownsLeds(): boolean;
}

/** Fichier d'écoute d'une partie, ouvert avant le lancement de VPX (son nom part dans l'environnement). */
export interface DofTapFile {
  file: string;
  env: Record<string, string>;
}

/** Nouveau fichier d'écoute, vide, pour une partie. */
function tapFile(): string {
  const file = path.join(os.tmpdir(), `cyberpinball-dof-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(file, '');
  return file;
}

/**
 * Pose l'écoute et ouvre le fichier de la partie, même pour une table à ROM : si PinMAME ne démarre pas
 * (led-rom.ts), la partie passe aux effets sans ROM avec ce fichier. undefined : écoute impossible.
 */
export function openTap(vpxExe: string): DofTapFile | undefined {
  if (!installTap(vpxExe)) return undefined;
  try {
    const file = tapFile();
    return { file, env: { [DOF_TAP_ENV]: file } };
  } catch {
    return undefined;
  }
}

/** Effets sans ROM possibles : voulus par le joueur, et des bandes décrites. */
function genericAllowed(deps: DofTapDeps): boolean {
  return loadEventSettings(deps.dataDir).enabled && Boolean(deps.leds()?.strips.length);
}

/** Délai laissé à libdof pour s'initialiser, une fois le port rendu. */
const RELAY_READY_MS = 30_000;

/**
 * Relais vers libdof : port des LED rendu, puis initialisation (sans rien attendre ici). Un relais qui ne
 * s'initialise pas ou s'arrête en cours de partie laisse la place aux effets sans ROM, s'ils sont voulus.
 * undefined : relais impossible (VPX sans plugin DOF, config DOF introuvable).
 */
function startRelayGame(deps: DofTapDeps, vpxExe: string, rom: string, table: string, tap: DofTapFile, about: DofTapTable): DofTapGame | undefined {
  const dll = vpxDofDll(vpxExe);
  const base = deps.dof?.()?.base;
  if (!dll || !base) return undefined;
  const prefix = `DOF de la table originale (${rom}) :`; // i18n-ignore : journal
  const relay = (deps.startRelay ?? startDofRelay)({ dll, base, table, rom, tap: tap.file }, deps.log);
  let stopped = false;
  let ready = false;
  let generic: { stop(): void } | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const fail = (why: string) => {
    if (stopped || generic) return;
    if (readyTimer) clearTimeout(readyTimer);
    const allowed = genericAllowed(deps);
    deps.log(`${prefix} ${why} : ${allowed ? 'effets sans ROM à la place' : 'LED éteintes (effets sans ROM coupés, ou pas de bandes décrites)'}.`); // i18n-ignore : journal
    relay.stop();
    if (!allowed) return;
    // Le port n'est libre qu'une fois le relais sorti.
    void relay.done.then(() => {
      if (!stopped && !generic) generic = startGenericGame(deps, tap, about, { takeBack: true, fromEnd: true });
    });
  };
  // Le port des LED est peut-être ouvert (animations du menu) : libdof ne l'aurait pas.
  deps.service.gameStarted().then(
    () => begin(),
    () => begin(),
  );
  function begin() {
    if (stopped) return;
    relay.begin();
    if (!relay.ready) return;
    readyTimer = setTimeout(() => fail(`libdof ne s'est pas initialisée en ${RELAY_READY_MS / 1000} s`), RELAY_READY_MS); // i18n-ignore : journal
    readyTimer.unref?.();
  }
  void relay.ready?.then((ok) => {
    if (ok) {
      ready = true;
      if (readyTimer) clearTimeout(readyTimer);
    } else fail('relais sorti avant que libdof ne soit prête'); // i18n-ignore : journal
  });
  if (relay.ready) void relay.done.then(() => ready && fail('relais arrêté en cours de partie')); // i18n-ignore : journal
  deps.log(`${prefix} relais vers libdof.`); // i18n-ignore : journal
  logTapReach(deps, about.script);
  return {
    env: tap.env,
    ownsLeds: () => Boolean(generic),
    stop() {
      stopped = true;
      if (readyTimer) clearTimeout(readyTimer);
      relay.stop();
      generic?.stop();
      // Le relais lit encore la fin du fichier : effacé quand il est sorti.
      void relay.done.finally(() => fs.rmSync(tap.file, { force: true }));
    },
  };
}

/**
 * Au journal, quand les appels DOF du script joué ne passent pas par controller.vbs : écoute branchée dans la Sub DOF
 * du script (scriptcompat.ts, dofTapOwnSub), ou appels qu'aucune écoute ne voit (26/11/2026 : Stranger Things,
 * 312 appels DOF dans sa propre Sub DOF, LED muettes sans aucune trace).
 */
function logTapReach(deps: Pick<DofTapDeps, 'log'>, script: string | undefined): void {
  if (!script) return;
  const reach = dofTapReach(script);
  if (reach === 'table') deps.log('Écoute DOF : branchée dans la Sub DOF du script de la table.'); // i18n-ignore : journal
  else if (reach === 'missed') deps.log('Écoute DOF : les appels DOF du script n’atteignent aucune écoute (Sub DOF du script non retouchée, ou venue d’ailleurs que controller.vbs) : LED sans les événements de la table.'); // i18n-ignore : journal
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

export interface StartTapOptions {
  /** Fichier d'écoute déjà ouvert (openTap), dont le nom est déjà parti dans l'environnement de VPX. */
  tap?: DofTapFile;
  /** Partie en cours dont le port avait été rendu à DOF (gameStarted) : Cyber Pinball le reprend. */
  takeBack?: boolean;
}

/**
 * Au lancement d'une partie dont `tapMode` a dit le mode : pose l'écoute, puis lance le relais, ou ouvre
 * les LED du profil générique (sans attendre : le lancement de VPX ne patiente jamais). undefined : rien à faire.
 * Relais impossible ou en échec : profil générique à la place, s'il est voulu.
 *
 * Profil générique : chaque événement DOF du script prend le rôle que lui donne le script de la table
 * (classifyDofScript), les boutons de la borne (flippers, lanceur, Start) et la tirette du lanceur
 * analogique ont leur effet même si le script n'appelle pas DOF, et les bandes reçoivent une image par
 * 1/30 s (dof-scene.ts) aux couleurs de la table.
 */
export function startTap(deps: DofTapDeps, vpxExe: string, mode: DofTapMode = { kind: 'generique' }, table = '', about: DofTapTable = {}, options: StartTapOptions = {}): DofTapGame | undefined {
  const tap = options.tap ?? openTap(vpxExe);
  if (!tap) return undefined;
  const drop = () => {
    if (!options.tap) fs.rmSync(tap.file, { force: true });
  };
  let takeBack = options.takeBack === true;
  if (mode.kind === 'relais') {
    const relayed = startRelayGame(deps, vpxExe, mode.rom, table, tap, about);
    if (relayed) return relayed;
    const allowed = genericAllowed(deps);
    deps.log(`DOF de la table originale (${mode.rom}) : relais impossible (${vpxDofDll(vpxExe) ? 'config DOF introuvable' : 'VPX sans plugin DOF'}) : ${allowed ? 'effets sans ROM à la place' : 'LED éteintes'}.`); // i18n-ignore : journal
    if (!allowed) return void drop();
    // Le port a pu être rendu à DOF pour le relais prévu.
    takeBack = true;
  }
  const generic = startGenericGame(deps, tap, about, { takeBack, fromEnd: false });
  if (!generic) return void drop();
  return { env: tap.env, ownsLeds: () => true, stop: () => generic.stop() };
}

/** Profil générique sur le fichier d'écoute : undefined sans bandes décrites. */
function startGenericGame(deps: DofTapDeps, tap: DofTapFile, about: DofTapTable, how: { takeBack: boolean; fromEnd: boolean }): { stop(): void } | undefined {
  const leds = deps.leds();
  if (!leds) return undefined;
  const file = tap.file;
  let stopped = false;
  const open = async () => {
    if (how.takeBack) {
      // Après un gameStarted en cours ou fini : port fermé, puis repris.
      await deps.service.gameStarted().catch(() => undefined);
      deps.service.gameReleased?.();
    }
    if (stopped) return;
    deps.service.configure(leds);
    await deps.service.start();
  };
  open().catch((e: Error) => deps.log(`Effets LED sans DOF : ${e.message}`)); // i18n-ignore : journal
  const gain = gameLedGain(deps.dataDir);
  const palette = dofScenePalette(about.color, about.colors);
  const scene = createDofScene(palette, gain);
  let classes: Map<number, DofEventClass> | undefined;
  try {
    classes = about.script ? classifyDofScript(about.script) : undefined;
  } catch {
    classes = undefined;
  }
  const strips = leds.strips.map((s) => ({ name: s.name, width: s.width, height: s.height, arrangement: s.arrangement }));
  // Bilan de la partie, au journal à l'arrêt : de quoi voir après coup si les bandes sont restées allumées
  // et quels événements sont arrivés (retour d'essai du 25/11/2026 : « reste tout le temps allumé »).
  const seen = new Map<string, number>();
  let frames = 0;
  let litFrames = 0;
  const play = (c: DofEventClass, on: boolean) => {
    if (on) seen.set(c.kind, (seen.get(c.kind) ?? 0) + 1);
    return on ? scene.trigger(c.kind, c.side, Date.now()) : scene.release(c.kind, c.side, Date.now());
  };
  const stopButtons = deps.watchButtons?.((button, down) => {
    // Lanceur : la bille part quand le bouton est relâché.
    if (button === 'plunger') return void (down ? undefined : play(BUTTON_EVENTS.plunger, true));
    play(BUTTON_EVENTS[button], down);
  });
  const launched = createLaunchDetector();
  // Repli en cours de partie : ce que le relais a déjà reçu n'est pas rejoué d'un coup.
  let offset = 0;
  if (how.fromEnd) {
    try {
      offset = fs.statSync(file).size;
    } catch {
      offset = 0;
    }
  }
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
      let lit = false;
      for (const s of strips) {
        const frame = scene.render(s, now);
        lit ||= frame.some((v) => v > 0);
        deps.service.setFrame(s.name, frame, 'ambient');
      }
      frames++;
      if (lit) litFrames++;
    }
  }, 15);
  const known = classes ? [...classes.values()].filter((c) => c.kind !== 'other').length : 0;
  const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  deps.log(`Effets LED sans DOF : écoute des événements de la table (${classes?.size ?? 0} dans le script, ${known} reconnus${deps.watchButtons ? ', boutons de la borne' : ''}), couleurs ${hex(palette.primary)} ${hex(palette.secondary)} ${hex(palette.accent)}, gain de luminosité ${(gain * 100).toFixed(1)} % de la lumière.`); // i18n-ignore : journal
  logTapReach(deps, about.script);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(poll);
      deps.log(ledGameSummary(seen, frames, litFrames));
      stopButtons?.();
      deps.service.blackout();
      void deps.service.stop();
      fs.rmSync(file, { force: true });
    },
  };
}
