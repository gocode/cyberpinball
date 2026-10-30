// Nombre de billes par partie d'une table, pour classer les parties en direct (décision du
// 29/10/2026 : 3 billes contre 5, les scores ne se comparent pas ; personne n'est refusé, le score
// passe hors classement). Jamais deviné : une table dont on ne trouve pas le réglage a un nombre
// « inconnu », qui ne juge rien.
//
// Trois sources, relevées sur la borne le 29/10/2026 :
// - Le script d'une table originale : « Const BallsPerGame = 3 » hors des procédures (GOTG, The
//   Goonies, The Matrix).
// - Le menu de service des tables de VPW (Game of Thrones) : « DMDMenu(n).Setup "BALL PER GAME",
//   kDMDStd_BallsPerGame, 3, … », la valeur choisie enregistrée dans VPReg.stg sous
//   « DMDStd_<kDMDStd_BallsPerGame> » (vide : la valeur par défaut).
// - La ROM PinMAME : le réglage « Balls Per Game » dans sa mémoire, <table>\pinmame\nvram\<rom>.nv
//   ou le dossier PinMAME commun, lu d'après la carte de cette ROM du projet Pinball Memory Maps
//   (https://github.com/tomlogic/pinball-memory-maps, licence ODbL : « This program makes use of
//   content from the Pinball Memory Maps project »). Sans .nv, la table n'a pas encore tourné : la
//   ROM part de son réglage d'usine, la valeur par défaut de la carte. Les cartes se téléchargent à
//   la demande et restent en cache ; toutes ne décrivent pas les réglages (Stern SAM : non).

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Un nombre de billes plausible. */
export const isBallCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10;

export type BallSource = 'script' | 'service' | 'rom';

export interface BallCount {
  balls: number;
  source: BallSource;
}

// ---------------------------------------------------------------------------
// Le script et VPReg.stg

const NAME = /^(?:g_?|gs|n|i)?balls_?per_?game$/i;

/**
 * Ce que le script dit du nombre de billes : une valeur écrite hors des procédures
 * (« Const BallsPerGame = 3 »), ou le réglage du menu de service de VPW (sa clé dans VPReg.stg
 * et sa valeur par défaut).
 */
export function scriptBallSetting(script: string): { balls?: number; service?: { key: string; fallback: number } } {
  let depth = 0;
  let balls: number | undefined;
  let constant: string | undefined;
  let fallback: number | undefined;
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.replace(/'.*$/, '').trim();
    if (/^end\s+(sub|function|property)\b/i.test(line)) depth = Math.max(0, depth - 1);
    else if (/^((public|private)\s+)?(sub|function|property\s+(get|let|set))\s/i.test(line)) depth++;
    for (const statement of line.split(':').map((s) => s.trim())) {
      const assigned = /^(?:(?:public|private|dim)\s+)?(?:const\s+)?([a-z_][a-z0-9_]*)\s*=\s*(\d+)$/i.exec(statement);
      if (assigned && depth === 0 && NAME.test(assigned[1]!) && balls === undefined) balls = Number(assigned[2]);
      const key = /^const\s+kDMDStd_BallsPerGame\s*=\s*(&h[0-9a-f]+|\d+)$/i.exec(statement);
      if (key) constant = String(key[1]!.toLowerCase().startsWith('&h') ? parseInt(key[1]!.slice(2), 16) : Number(key[1]));
      const setup = /\.Setup\s+"[^"]*"\s*,\s*kDMDStd_BallsPerGame\s*,\s*(\d+)/i.exec(statement);
      if (setup) fallback = Number(setup[1]);
    }
  }
  return {
    ...(isBallCount(balls) ? { balls } : {}),
    ...(constant !== undefined && isBallCount(fallback) ? { service: { key: `DMDStd_${constant}`, fallback } } : {}),
  };
}

// ---------------------------------------------------------------------------
// La ROM : cartes de Pinball Memory Maps

export const MEMORY_MAPS_BASE = 'https://raw.githubusercontent.com/tomlogic/pinball-memory-maps/main/';
/** L'index (ROM → carte) se revérifie au plus une fois par semaine ; une carte, par mois. */
const INDEX_EVERY_MS = 7 * 24 * 3600_000;
const MAP_EVERY_MS = 30 * 24 * 3600_000;

export interface AdjustmentEntry {
  label?: unknown;
  start?: unknown;
  length?: unknown;
  encoding?: unknown;
  default?: unknown;
  endian?: unknown;
  nibble?: unknown;
}

interface MemoryRegion {
  type?: unknown;
  address?: unknown;
  size?: unknown;
  nibble?: unknown;
}

export interface RomMemory {
  map: { adjustments?: Record<string, Record<string, AdjustmentEntry>>; _metadata?: { platform?: unknown } };
  platform: { endian?: unknown; memory_layout?: MemoryRegion[] };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && /^(0x[0-9a-f]+|\d+)$/i.test(v) ? Number(v) : undefined);

/** Le réglage « Balls Per Game » que décrit la carte (livestate.ts le lit aussi pendant la partie). */
export function romBallsEntry(memory: RomMemory): AdjustmentEntry | undefined {
  const isBalls = (e: AdjustmentEntry | undefined) => typeof e?.label === 'string' && /^balls?\s*(per|\/)\s*game$/i.test(e.label.trim());
  // Dans les réglages d'abord ; certaines cartes (The Walking Dead, twd_160h) ne le mettent que dans
  // « game_state » (ball_count).
  const state = (memory.map as { game_state?: Record<string, unknown> }).game_state;
  const fromState = state && typeof state === 'object' ? (state.ball_count as AdjustmentEntry | undefined) : undefined;
  return (
    Object.values(memory.map.adjustments ?? {})
      .flatMap((group) => Object.values(group ?? {}))
      .find(isBalls) ?? (fromState && typeof fromState === 'object' && (isBalls(fromState) || fromState.label === undefined) ? fromState : undefined)
  );
}

/**
 * Billes par partie d'après la carte de la ROM et son .nv (undefined : pas de .nv, la ROM part
 * de son réglage d'usine). Seuls les réglages en octets entiers d'une seule zone de NVRAM se
 * lisent ; une carte qui ne décrit pas ce réglage, ou un encodage inconnu : rien.
 */
export function romBallsPerGame(memory: RomMemory, nv: Buffer | undefined): number | undefined {
  const entry = romBallsEntry(memory);
  if (!entry) return undefined;
  if (!nv) return isBallCount(entry.default) ? entry.default : undefined;
  const start = num(entry.start);
  const length = num(entry.length) ?? 1;
  const nvram = (memory.platform.memory_layout ?? []).filter((r) => r.type === 'nvram');
  const region = nvram.length === 1 ? nvram[0]! : undefined;
  const base = num(region?.address);
  const size = num(region?.size);
  if (start === undefined || !region || base === undefined || size === undefined || length < 1 || length > 4) return undefined;
  if ((region.nibble ?? 'both') !== 'both' || (entry.nibble ?? 'both') !== 'both') return undefined;
  const offset = start - base;
  if (offset < 0 || offset + length > size || offset + length > nv.length) return undefined;
  const bytes = nv.subarray(offset, offset + length);
  const little = (entry.endian ?? memory.platform.endian) === 'little';
  const ordered = little ? [...bytes].reverse() : [...bytes];
  let value: number;
  if (entry.encoding === 'int') value = ordered.reduce((n, b) => n * 256 + b, 0);
  else if (entry.encoding === 'bcd') value = ordered.reduce((n, b) => n * 100 + (b >> 4) * 10 + (b & 15), 0);
  else return undefined;
  return isBallCount(value) ? value : undefined;
}

export interface MemoryMapOptions {
  fetch?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
}

/**
 * Carte d'une ROM et de sa plateforme, depuis le cache (<cacheDir>) ou téléchargées ; undefined
 * si le projet n'a pas de carte pour cette ROM, ou sans réseau et sans cache. Ne lève jamais.
 */
export async function loadRomMemory(cacheDir: string, rom: string, opts: MemoryMapOptions = {}): Promise<RomMemory | undefined> {
  const name = rom.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) return undefined;
  const index = await cachedJson<Record<string, unknown>>(cacheDir, 'index.json', 'index.json', INDEX_EVERY_MS, opts);
  const mapPath = index?.[name];
  if (typeof mapPath !== 'string' || !/^maps\/[a-z0-9_./-]+\.json$/i.test(mapPath) || mapPath.includes('..')) return undefined;
  const map = await cachedJson<RomMemory['map']>(cacheDir, mapPath, mapPath.replace(/\//g, '_'), MAP_EVERY_MS, opts);
  const platformName = map?._metadata?.platform;
  if (!map || typeof platformName !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(platformName)) return undefined;
  const platform = await cachedJson<RomMemory['platform']>(cacheDir, `platforms/${platformName}.json`, `platform_${platformName}.json`, MAP_EVERY_MS, opts);
  return platform ? { map, platform } : undefined;
}

/** Un fichier du projet : le cache s'il est récent, sinon téléchargé (l'ancien cache sans réseau). */
async function cachedJson<T>(cacheDir: string, remote: string, local: string, everyMs: number, opts: MemoryMapOptions): Promise<T | undefined> {
  const file = path.join(cacheDir, local);
  const now = opts.now ?? new Date();
  let cached: T | undefined;
  try {
    cached = JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    if (now.getTime() - fs.statSync(file).mtimeMs < everyMs) return cached;
  } catch {
    cached = undefined;
  }
  try {
    const response = await (opts.fetch ?? fetch)(MEMORY_MAPS_BASE + remote, { redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    if (response.status === 404) return undefined;
    if (!response.ok) return cached;
    const text = await response.text();
    const value = JSON.parse(text) as T;
    if (!value || typeof value !== 'object') return cached;
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(`${file}.part`, text, 'utf8');
    fs.renameSync(`${file}.part`, file);
    return value;
  } catch {
    return cached;
  }
}

// ---------------------------------------------------------------------------
// Une table

export interface BallCountInput {
  /** ROM PinMAME que joue le script. */
  roms: readonly string[];
  /** Script écrit dans la table (readVpxScript). */
  script?: string;
  /** Valeurs enregistrées par la table (VPReg.stg : stockage → clé → valeur). */
  saved?: Map<string, Map<string, string>>;
  /** Le .nv de cette ROM, s'il existe. */
  nv(rom: string): Buffer | undefined;
  /** Carte de cette ROM (loadRomMemory). */
  memory(rom: string): Promise<RomMemory | undefined>;
}

/** Nombre de billes par partie d'une table : la ROM d'abord (elle compte), puis le script ; undefined si inconnu. */
export async function tableBallCount(input: BallCountInput): Promise<BallCount | undefined> {
  for (const rom of input.roms) {
    const memory = await input.memory(rom);
    const balls = memory ? romBallsPerGame(memory, input.nv(rom)) : undefined;
    if (balls) return { balls, source: 'rom' };
  }
  if (input.roms.length || !input.script) return undefined;
  const setting = scriptBallSetting(input.script);
  if (setting.service) {
    // Le menu de service : la valeur enregistrée (une seule table dans ce VPReg.stg en tient une), sinon celle par défaut.
    const values = [...(input.saved?.values() ?? [])].map((v) => v.get(setting.service!.key)).filter((v): v is string => !!v && /^\d+$/.test(v.trim()));
    const saved = values.length === 1 ? Number(values[0]) : undefined;
    const balls = isBallCount(saved) ? saved : setting.service.fallback;
    return { balls, source: 'service' };
  }
  return setting.balls ? { balls: setting.balls, source: 'script' } : undefined;
}
