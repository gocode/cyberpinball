// Volume de la ROM d'une table (décision du 17/11/2026, signalé par un joueur : Monster Bash
// presque muet). Les machines WPC et une partie des Stern SAM gardent leur volume dans leur
// mémoire (<pinmame>\nvram\<rom>.nv), pas dans VPX : sans mémoire, la ROM joue son volume
// d'usine (12 sur 31 en WPC, faible à côté des bruits de la table) ; pour le changer, il fallait
// ouvrir la porte du monnayeur en partie et appuyer sur − ou +, ce que personne ne sait.
//
// Cyber Pinball le lit d'après la carte de la ROM (Pinball Memory Maps, romscores.ts), le dit sur
// la fiche, dans le diagnostic et la santé, le règle dans « Réglages de cette table » > Son, et
// monte de lui-même un volume d'usine faible au volume conseillé, hors partie, sommes de contrôle
// refaites. Un volume que le joueur a choisi (ici, ou à la porte pendant une partie) est gardé.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import type { RomMemory } from './ballcount';
import { buttonKeys, keyLabel } from './buttons';
import { t } from './i18n';
import type { CabinetButtons } from './model';
import { readRomVolume, romMasterVolume, writeRomVolume, type RomVolumeSpot } from './romscores';

/**
 * Volume d'usine des WPC, que leur carte ne donne pas : mesuré au banc libpinmame le 17/11/2026 sur
 * The Addams Family (taf_l7, 1992) et Monster Bash (mb_106b, 1998) : sans mémoire, la ROM le pose
 * au démarrage. Le système des WPC est commun à toutes leurs machines.
 */
export const WPC_FACTORY_VOLUME = 12;

/** Volume d'usine de cette ROM : celui de la carte, sinon celui des WPC ; undefined si inconnu. */
export function romFactoryVolume(memory: RomMemory, spot: RomVolumeSpot): number | undefined {
  if (spot.factory !== undefined) return spot.factory;
  return /^williams-wpc/i.test(String(memory.map._metadata?.platform ?? '')) && WPC_FACTORY_VOLUME <= spot.max ? WPC_FACTORY_VOLUME : undefined;
}

/**
 * Volume conseillé et seuil du volume bas, d'après la plage de la ROM (jamais d'après une borne) :
 * bas sous la moitié de la plage, conseillé aux trois quarts. WPC : bas sous 16, conseillé 23 ;
 * Stern SAM : bas sous 32, conseillé 47 (leur volume d'usine, 40, n'est pas bas).
 */
export function romVolumeAdvice(spot: Pick<RomVolumeSpot, 'min' | 'max'>): { recommended: number; lowBelow: number } {
  const span = spot.max - spot.min;
  return { recommended: spot.min + Math.round(span * 0.75), lowBelow: spot.min + Math.ceil(span / 2) };
}

/** Ce qu'on sait du volume de la ROM d'une table. */
export type RomVolumeStatus =
  /** Pas de volume réglable dans la mémoire : pas de carte, ou la carte ne le situe pas. */
  | { kind: 'none'; rom?: string; reason: string }
  | {
      /**
       * absent : pas encore de mémoire (la ROM la crée à la première partie, au volume d'usine) ;
       * blank : bloc du volume vierge ou somme fausse (la ROM remettra son volume d'usine) ;
       * set : le volume que la ROM jouera.
       */
      kind: 'absent' | 'blank' | 'set';
      rom: string;
      /** Le .nv de la ROM (à créer quand `absent`). */
      file: string;
      memory: RomMemory;
      spot: RomVolumeSpot;
      factory?: number;
      /** `set` : la valeur gardée. */
      value?: number;
      recommended: number;
      lowBelow: number;
    };

/** Le volume que la ROM jouera à la prochaine partie (le volume d'usine, s'il est connu, sans mémoire). */
export function romVolumeNow(s: RomVolumeStatus): number | undefined {
  if (s.kind === 'none') return undefined;
  return s.kind === 'set' ? s.value : s.factory;
}

/** Le volume est-il celui d'usine (pas de mémoire, bloc vierge, ou la valeur d'usine) ? */
export function isFactoryRomVolume(s: RomVolumeStatus): boolean {
  if (s.kind === 'none') return false;
  return s.kind !== 'set' || (s.factory !== undefined && s.value === s.factory);
}

/** Bas : sous la moitié de la plage (volume d'usine inconnu sans mémoire : on ne sait pas). */
export function isLowRomVolume(s: RomVolumeStatus): boolean {
  const now = romVolumeNow(s);
  return s.kind !== 'none' && now !== undefined && now < s.lowBelow;
}

/**
 * Le dossier de PinMAME où la table garde sa mémoire : `<table>\pinmame` quand elle y a ses ROM,
 * sinon le dossier PinMAME commun (même règle que readHostSettings et le double de table).
 */
export function tablePinmameDir(folder: string, shared: string | undefined): string | undefined {
  const own = path.join(folder, 'pinmame');
  try {
    if (fs.statSync(path.join(own, 'roms')).isDirectory()) return own;
  } catch {
    // Pas de ROM à côté de la table : le dossier commun.
  }
  return shared;
}

/**
 * L'état du volume pour les ROM de la table (celles que PinMAME charge, alias compris) : la première
 * dont la carte situe le volume. `memory` rend la carte en cache (cachedRomMemory), sans réseau.
 */
export function romVolumeStatus(input: { roms: readonly string[]; pinmameDir: string | undefined; memory(rom: string): RomMemory | undefined }): RomVolumeStatus {
  const roms = [...new Set(input.roms.map((r) => r.trim().toLowerCase()).filter((r) => /^[a-z0-9_-]{1,32}$/.test(r)))];
  if (!roms.length) return { kind: 'none', reason: t('la table ne joue pas de ROM') };
  let first: RomVolumeStatus | undefined;
  for (const rom of roms) {
    const memory = input.memory(rom);
    if (!memory) {
      first ??= { kind: 'none', rom, reason: t('carte mémoire de {rom} pas encore connue', { rom }) };
      continue;
    }
    const spot = romMasterVolume(memory);
    if (!spot) {
      first ??= { kind: 'none', rom, reason: t('{rom} ne garde pas son volume dans une mémoire que Cyber Pinball sait lire', { rom }) };
      continue;
    }
    if (!input.pinmameDir) return { kind: 'none', rom, reason: t('dossier de PinMAME introuvable') };
    const file = path.join(input.pinmameDir, 'nvram', `${rom}.nv`);
    const factory = romFactoryVolume(memory, spot);
    const base = { rom, file, memory, spot, ...(factory !== undefined ? { factory } : {}), ...romVolumeAdvice(spot) };
    let nv: Buffer | undefined;
    try {
      // lecture entière : mémoire d'une ROM (.nv), quelques ko
      nv = fs.readFileSync(file);
    } catch {
      return { kind: 'absent', ...base };
    }
    const read = readRomVolume(memory, nv);
    if (!read) return { kind: 'none', rom, reason: t('mémoire de {rom} plus courte que sa carte', { rom }) };
    return 'value' in read ? { kind: 'set', ...base, value: read.value } : { kind: 'blank', ...base };
  }
  return first ?? { kind: 'none', reason: t('la table ne joue pas de ROM') };
}

/**
 * Écrit ce volume dans la mémoire de la ROM, hors partie : relue juste avant (jamais une copie
 * ancienne : des records ont pu s'y écrire depuis), sommes refaites, écriture atomique. Pas de
 * mémoire (`absent`) : rien à écrire, la ROM la crée à sa première partie.
 */
export function setRomVolume(s: RomVolumeStatus, value: number): { ok: true } | { ok: false; reason: string } {
  if (s.kind === 'none') return { ok: false, reason: s.reason };
  let nv: Buffer;
  try {
    // lecture entière : mémoire d'une ROM (.nv), quelques ko
    nv = fs.readFileSync(s.file);
  } catch {
    return { ok: false, reason: t('pas encore de mémoire : la ROM la crée à sa première partie') };
  }
  const out = writeRomVolume(s.memory, nv, value);
  if (!out.ok) return out;
  writeFileAtomic(s.file, out.data);
  return { ok: true };
}

/**
 * Le geste de la machine, avec les vraies touches de la borne : porte du monnayeur, puis − ou +
 * pendant la partie. undefined si l'un des trois boutons n'a pas de touche.
 */
export function romVolumeGesture(buttons: CabinetButtons | undefined): string | undefined {
  const keys = buttonKeys(buttons);
  if (!keys.coinDoor || !keys.serviceDown || !keys.serviceUp) return undefined;
  return t('pendant la partie, ouvrir la porte du monnayeur ({door}), puis − ({down}) ou + ({up})', { door: keyLabel(keys.coinDoor), down: keyLabel(keys.serviceDown), up: keyLabel(keys.serviceUp) });
}

// ---------------------------------------------------------------------------
// Choix du joueur : <données>\volumes-rom.json, par fichier .nv

/** Le volume que le joueur a choisi pour chaque mémoire (« Réglages de cette table », ou la porte en partie). */
export type RomVolumeChoices = Record<string, number>;

export const ROM_VOLUME_FILE = 'volumes-rom.json';
const key = (file: string) => path.resolve(file).toLowerCase();

export function readRomVolumeChoices(dataDir: string): RomVolumeChoices {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, ROM_VOLUME_FILE), 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) >= 0 && (e[1] as number) <= 255));
  } catch {
    return {};
  }
}

export function romVolumeChoice(choices: RomVolumeChoices, file: string): number | undefined {
  return choices[key(file)];
}

/** Retient (ou oublie, `undefined` : retour à l'automatique) le choix du joueur pour cette mémoire. */
export function saveRomVolumeChoice(dataDir: string, file: string, value: number | undefined): void {
  const choices = readRomVolumeChoices(dataDir);
  if (value === undefined) delete choices[key(file)];
  else choices[key(file)] = value;
  writeFileAtomic(path.join(dataDir, ROM_VOLUME_FILE), JSON.stringify(choices, null, 1) + '\n');
}

/**
 * Le volume à poser avant la partie, ou undefined (rien à faire) : le choix du joueur s'il n'est
 * plus en place ; sinon, en automatique, le volume conseillé à la place d'un volume d'usine bas.
 * Jamais sans mémoire (la ROM la crée) ; un volume bas qui n'est pas celui d'usine (réglé ailleurs,
 * peut-être voulu) n'est que signalé (constat « Volume de la ROM bas » du médecin).
 */
export function romVolumeTarget(s: RomVolumeStatus, choice: number | undefined): number | undefined {
  if (s.kind === 'none' || s.kind === 'absent') return undefined;
  if (choice !== undefined) return choice >= s.spot.min && choice <= s.spot.max && (s.kind !== 'set' || s.value !== choice) ? choice : undefined;
  return isFactoryRomVolume(s) && isLowRomVolume(s) ? s.recommended : undefined;
}

/**
 * Après la partie : le volume a-t-il changé à la porte (− ou +) ? Le nouveau devient le choix du
 * joueur, gardé ensuite. `before` : l'état lu avant la partie (après le volume posé). Un volume qui
 * reste celui d'usine après une première partie n'est pas un choix.
 */
export function romVolumeChangedInGame(before: RomVolumeStatus, after: RomVolumeStatus): number | undefined {
  if (after.kind !== 'set' || before.kind === 'none') return undefined;
  if (before.kind === 'set') return before.value !== after.value ? after.value : undefined;
  return after.factory !== undefined && after.value !== after.factory ? after.value : undefined;
}

/** « 12 sur 31 » */
export function romVolumeText(value: number, spot: Pick<RomVolumeSpot, 'max'>): string {
  return t('{value} sur {max}', { value, max: spot.max });
}

/**
 * Une ligne pour la fiche de la table : le volume que la ROM jouera, et ce que Cyber Pinball en fait.
 * `tone` warning : bas et pas réglé par le joueur (le constat du médecin le propose aussi).
 */
export function romVolumeLine(s: RomVolumeStatus, choice: number | undefined): { detail: string; tone: 'ok' | 'warning' | 'quiet'; low: boolean } | undefined {
  if (s.kind === 'none') return undefined;
  const target = romVolumeTarget(s, choice);
  const now = romVolumeNow(s);
  const low = isLowRomVolume(s);
  if (s.kind === 'absent') {
    return s.factory !== undefined && s.factory < s.lowBelow && choice === undefined
      ? { detail: t('d’usine, {now} (faible) : monté à {to} dès la fin de la première partie', { now: romVolumeText(s.factory, s.spot), to: s.recommended }), tone: 'quiet', low: false }
      : { detail: s.factory !== undefined ? t('d’usine, {now}', { now: romVolumeText(s.factory, s.spot) }) : t('d’usine'), tone: 'quiet', low: false };
  }
  if (target !== undefined) {
    const from = now !== undefined ? romVolumeText(now, s.spot) : t('d’usine');
    return { detail: choice !== undefined ? t('{from} : remis à {to} (ton réglage) avant la partie', { from, to: target }) : t('{from}, d’usine, faible : monté à {to} avant la partie', { from, to: target }), tone: 'ok', low: false };
  }
  if (now === undefined) return { detail: t('d’usine'), tone: 'quiet', low: false };
  if (choice !== undefined) return { detail: t('{now} (ton réglage)', { now: romVolumeText(now, s.spot) }), tone: 'ok', low: false };
  return low ? { detail: t('{now} : bas', { now: romVolumeText(now, s.spot) }), tone: 'warning', low: true } : { detail: romVolumeText(now, s.spot), tone: 'ok', low: false };
}
