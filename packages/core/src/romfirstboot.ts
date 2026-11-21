// Mise en route d'une ROM sans mémoire (21/11/2026). PinMAME garde la mémoire de la machine
// (réglages, crédits, records, volume) dans <pinmame>\nvram\<rom>.nv et ne l'écrit qu'en
// s'arrêtant. À la toute première partie d'une table, il n'y en a pas : la ROM démarre comme
// une machine dont la pile est morte, affiche « FACTORY SETTINGS RESTORED » et attend le bouton
// Échap de la porte du monnayeur ; les pièces sonnent mais ne donnent aucun crédit. Le joueur
// quittait, relançait, et la seconde partie était normale. Vu sur les trois tables à ROM d'une
// borne d'essai (première partie abandonnée au bout de 28 s à 1 min, relancée aussitôt), et déjà
// sous PinUP Popper.
//
// Mesuré au banc libpinmame sur taf_l7 (The Addams Family) : mémoire vierge, sans Échap, pièces
// et Start ignorés, l'afficheur reste sur « FACTORY SETTINGS RESTORED » ; Échap à 12 s, arrêt
// propre à 22 s émulées (23,5 s réelles) : PinmameStop écrit taf_l7.nv (8 238 octets) en 0,5 s ;
// avec cette mémoire, sans Échap, mode démo dès 11 s, crédits pris, partie lancée au Start.
//
// Cyber Pinball fait donc lui-même cette première mise en route, sans écran ni son, dans un
// processus à part (app/src/rom-first-boot.ts, le même enregistreur que la Musique de la ROM),
// sur une copie des ROM, puis pose la mémoire obtenue dans le dossier de PinMAME de la table, si
// elle y manque toujours (une mémoire présente n'est jamais remplacée) : en tâche de fond dès
// qu'une table à ROM sans mémoire est vue, et avant la partie si elle manque encore.
//
// Ce module ne fait rien tourner : il dit quoi presser et quand, quelle mémoire manque, et la pose.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { romKey } from './romlibrary';
import { ROM_AUDIO_PLAN, PINMAME_KEYS } from './romaudio';

/** Calendrier de la mise en route, en secondes émulées. */
export const ROM_BOOT_PLAN = {
  /** Billes posées dans la gouttière (une machine qui cherche ses billes démarre quand même, mais autant la poser au repos). */
  ballsAt: ROM_AUDIO_PLAN.ballsAt,
  /** Échap (« 7 » de VPinMAME) : passe l'écran « réglages d'usine rétablis » d'une mémoire vierge. */
  escapeAt: ROM_AUDIO_PLAN.escapeAt,
  /** Arrêt propre : PinMAME écrit la mémoire en s'arrêtant. */
  stopAt: 22,
  press: ROM_AUDIO_PLAN.press,
} as const;

/** Tentatives d'office avant d'abandonner une ROM qui échoue (elle reste réessayée avant chaque partie). */
export const ROM_BOOT_MAX_TRIES = 2;

const pressedAt = (t: number, at: number): boolean => t >= at && t < at + ROM_BOOT_PLAN.press;

/** La touche est-elle tenue à cet instant émulé ? Seulement Échap : ni pièce ni Start, la mémoire reste celle d'une machine au repos. */
export function romBootKeyPressed(key: number, t: number): boolean {
  return key === PINMAME_KEYS.escape && ROM_BOOT_PLAN.escapeAt.some((at) => pressedAt(t, at));
}

/** Lecture du clavier par PinMAME utile à cet instant (autour des appuis seulement, comme pour la musique). */
export function romBootKeyboardWanted(t: number): boolean {
  return ROM_BOOT_PLAN.escapeAt.some((at) => t > at - 0.2 && t < at + ROM_BOOT_PLAN.press + 0.4);
}

/** La mémoire qui manque à une table : sa ROM, le .nv attendu, le dossier de PinMAME où il va. */
export interface RomMemoryNeed {
  rom: string;
  pinmameDir: string;
  /** <pinmameDir>\nvram\<rom>.nv */
  file: string;
}

/** Le .nv d'une ROM dans un dossier de PinMAME. */
export function romMemoryFile(pinmameDir: string, rom: string): string {
  return path.join(pinmameDir, 'nvram', `${rom.trim().toLowerCase()}.nv`);
}

/**
 * La mémoire manque-t-elle ? La ROM chargée par la table (la première de `roms`, alias déjà
 * résolus) et son dossier de PinMAME (tablePinmameDir) ; undefined si elle est là, ou si on ne
 * sait pas où elle irait.
 */
export function romMemoryMissing(input: { roms: readonly string[]; pinmameDir: string | undefined }): RomMemoryNeed | undefined {
  const rom = input.roms.map((r) => r.trim().toLowerCase()).find((r) => /^[a-z0-9_-]{1,32}$/.test(r));
  if (!rom || !input.pinmameDir) return undefined;
  const file = romMemoryFile(input.pinmameDir, rom);
  return fs.existsSync(file) ? undefined : { rom, pinmameDir: input.pinmameDir, file };
}

/**
 * Pose la mémoire obtenue au banc (`from`, le .nv du dossier de travail) là où la table la lit,
 * seulement si elle y manque encore : une mémoire apparue entre-temps (une partie jouée, un
 * réglage) n'est jamais remplacée. 'present' : déjà là ; 'none' : le banc n'a rien écrit.
 */
export function adoptRomMemory(from: string, need: RomMemoryNeed): 'adopted' | 'present' | 'none' {
  if (fs.existsSync(need.file)) return 'present';
  let data: Buffer;
  try {
    // lecture entière : mémoire d'une ROM (.nv), quelques ko
    data = fs.readFileSync(from);
  } catch {
    return 'none';
  }
  if (!data.length) return 'none';
  fs.mkdirSync(path.dirname(need.file), { recursive: true });
  writeFileAtomic(need.file, data);
  return 'adopted';
}

// ---------------------------------------------------------------------------
// État : <données>\mises-en-route-rom.json, par ROM

export interface RomBootRecord {
  result: 'ok' | 'failed';
  at: string;
  tries: number;
  detail?: string;
}

export type RomBootState = Record<string, RomBootRecord>;

const stateFile = (dataDir: string) => path.join(dataDir, 'mises-en-route-rom.json');

export function readRomBootState(dataDir: string): RomBootState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(dataDir), 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as RomBootState) : {};
  } catch {
    return {};
  }
}

export function writeRomBootState(dataDir: string, state: RomBootState): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(stateFile(dataDir), JSON.stringify(state, null, 1) + '\n');
}

/** Note une tentative (une mise en route interrompue par une partie n'en est pas une). */
export function noteRomBoot(state: RomBootState, rom: string, outcome: { result: 'ok' | 'failed'; detail?: string }, now = new Date()): RomBootState {
  const key = romKey(rom);
  const tries = outcome.result === 'ok' ? 0 : (state[key]?.tries ?? 0) + 1;
  return { ...state, [key]: { ...outcome, at: now.toISOString(), tries } };
}

/** À mettre en route d'office ? Pas une ROM qui a échoué ROM_BOOT_MAX_TRIES fois de suite (avant une partie, toujours). */
export function romBootWanted(state: RomBootState, rom: string): boolean {
  const r = state[romKey(rom)];
  return !r || r.result === 'ok' || r.tries < ROM_BOOT_MAX_TRIES;
}
