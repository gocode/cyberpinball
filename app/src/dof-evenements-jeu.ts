// Une partie sur une table sans ROM, que le plugin DOF de VPX 10.8 ne prend pas en charge (il n'initialise
// libdof qu'avec une ROM PinMAME). controller.vbs de VPX recopie les « DOF n, état » du script dans un
// fichier (packages/core/src/dof-evenements.ts), lu pendant la partie de l'une de deux façons :
// - relais : une table originale dont la config DOF de la borne a la ligne (nom B2S, cGameName). Un
//   processus à part (relais-dof.ts, dof-relais.ts) initialise la libdof de VPX avec ce nom et lui passe
//   les événements : tous les effets du configtool, sur tout le matériel. Le port des LED est rendu à
//   libdof avant qu'elle s'initialise. Allumé par défaut, coupé par le réglage « originals ».
// - générique : sinon, et si le joueur l'a voulu, le pilote des LED (led-live.ts) joue un profil simple
//   sur les bandes décrites. Le port série des LED reste alors à Cyber Pinball pour cette partie.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DOF_EVENT_DEFAULTS,
  DOF_TAP_ENV,
  LED_ALL,
  LED_BLACK,
  addDofTap,
  effectFor,
  hexToRgb,
  parseTapChunk,
  releaseFor,
  type CabinetLeds,
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
    return { enabled: raw.enabled === true, intensity, ...(raw.originals === false ? { originals: false } : {}) };
  } catch {
    return { ...DOF_EVENT_DEFAULTS };
  }
}

export function saveEventSettings(dataDir: string, settings: DofEventSettings): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, SETTINGS_FILE), JSON.stringify(settings));
}

export interface DofTapDeps {
  dataDir: string;
  /** Bandes décrites dans Cabinet.xml ; undefined : pas de LED adressables. */
  leds(): CabinetLeds | undefined;
  service: Pick<LedService, 'configure' | 'start' | 'setColor' | 'blackout' | 'stop' | 'gameStarted'>;
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

/**
 * Au lancement d'une partie dont `tapMode` a dit le mode : pose l'écoute, puis lance le relais, ou ouvre
 * les LED du profil générique (sans attendre : le lancement de VPX ne patiente jamais). undefined : rien à faire.
 */
export function startTap(deps: DofTapDeps, vpxExe: string, mode: DofTapMode = { kind: 'generique' }, table = ''): DofTapGame | undefined {
  if (mode.kind === 'relais') return startRelayGame(deps, vpxExe, mode.rom, table);
  const leds = deps.leds();
  if (!leds || !installTap(vpxExe)) return undefined;
  const file = tapFile();
  deps.service.configure(leds);
  deps.service.start().catch((e: Error) => deps.log(`Effets LED sans DOF : ${e.message}`)); // i18n-ignore : journal
  let offset = 0;
  let rest = '';
  const timers = new Map<string, NodeJS.Timeout>();
  const black = (zone: DofZone) => deps.service.setColor(zoneTarget(leds, zone), LED_BLACK, 'ambient');
  const poll = setInterval(() => {
    try {
      const size = fs.statSync(file).size;
      if (size <= offset) return;
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      offset = size;
      const { events, rest: tail } = parseTapChunk(rest + buf.toString('latin1'));
      rest = tail;
      const settings = loadEventSettings(deps.dataDir);
      for (const ev of events) {
        const effect = effectFor(ev, settings);
        if (effect) {
          const target = zoneTarget(leds, effect.zone);
          deps.service.setColor(target, hexToRgb(effect.color), 'ambient');
          if (effect.mode === 'pulse') {
            clearTimeout(timers.get(target));
            timers.set(target, setTimeout(() => black(effect.zone), effect.durationMs));
          }
        } else {
          const zone = releaseFor(ev, settings);
          if (zone) black(zone);
        }
      }
    } catch {
      // Fichier pas encore là ou en cours d'écriture : au prochain tour.
    }
  }, 25);
  deps.log('Effets LED sans DOF : écoute des événements de la table.'); // i18n-ignore : journal
  return {
    env: { [DOF_TAP_ENV]: file },
    stop() {
      clearInterval(poll);
      for (const t of timers.values()) clearTimeout(t);
      deps.service.blackout();
      void deps.service.stop();
      fs.rmSync(file, { force: true });
    },
  };
}
