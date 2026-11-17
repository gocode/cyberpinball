// Cadence des images d'une partie, relue dans vpinball.log.
//
// Le plugin « CyberPinballDmd » (packages/vpx-vision3d/src/cadence.h), chargé dans toutes les parties, écrit toutes
// les minutes puis à la fin de la partie une ligne de bilan :
//   Cadence end: frames=3512 duration=61.2s fps=57.4 p50=17ms p95=18ms p99=33ms max=412ms late=2.1% stalls=5 worst10s=41.2fps
// et chaque à-coup (au moins 100 ms entre deux images) au moment où il arrive. VPX dit au lancement la cadence qu'il
// vise (« Synchronization mode: 3 with maximum FPS: 60, display FPS: 60 »). Une table « qui rame » se voit enfin dans
// le journal de la borne et dans les rapports (17/11/2026 : des tables reprises d'une autre installation ramaient sur
// une borne, aucun rapport ne disait de combien).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';

/** Le bilan d'une partie, tel que le plugin l'écrit. */
export interface VpxCadence {
  /** `end` : partie finie ; `running` : dernier bilan d'étape (VPX arrêté avant la fin, plantage). */
  phase: 'end' | 'running';
  frames: number;
  durationS: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  /** Plus long écart entre deux images (ms). */
  max: number;
  /** Part des images en retard sur la médiane (%). */
  late: number;
  /** À-coups : écarts d'au moins 100 ms. */
  stalls: number;
  /** Pire fenêtre de 10 s (images par seconde) ; undefined si la partie n'en a pas eu une entière. */
  worst10s?: number;
  /** Mémoire privée de VPX (Mo) au moment du bilan. */
  memMB?: number;
}

const LINE = /Cadence (end|running): frames=(\d+) duration=([\d.]+)s fps=([\d.]+) p50=(\d+)ms p95=(\d+)ms p99=(\d+)ms max=(\d+)ms late=([\d.]+)% stalls=(\d+) worst10s=(-?[\d.]+)fps(?: mem=(-?\d+)MB)?/;

export function parseVpxCadence(line: string): VpxCadence | undefined {
  const m = LINE.exec(line);
  if (!m) return undefined;
  const n = (i: number) => Number(m[i]);
  const worst = n(11);
  const mem = m[12] !== undefined ? n(12) : -1;
  return {
    phase: m[1] as VpxCadence['phase'],
    frames: n(2),
    durationS: n(3),
    fps: n(4),
    p50: n(5),
    p95: n(6),
    p99: n(7),
    max: n(8),
    late: n(9),
    stalls: n(10),
    ...(worst >= 0 ? { worst10s: worst } : {}),
    ...(mem >= 0 ? { memMB: mem } : {}),
  };
}

/**
 * Mémoire prise par VPX pendant la partie : du premier bilan (une minute de jeu) au dernier. Une table qui en prend
 * sans cesse finit par planter. undefined : moins de deux bilans avec la mémoire.
 */
export function vpxMemoryGrowth(lines: readonly string[]): { fromMB: number; toMB: number; minutes: number } | undefined {
  const seen = lines.map(parseVpxCadence).filter((c): c is VpxCadence => c?.memMB !== undefined);
  if (seen.length < 2) return undefined;
  const first = seen[0]!;
  const last = seen[seen.length - 1]!;
  return { fromMB: first.memMB!, toMB: last.memMB!, minutes: Math.max(0, (last.durationS - first.durationS) / 60) };
}

/** Le dernier bilan des lignes données (celles d'une partie) : celui de fin, sinon le dernier d'étape. */
export function readVpxCadence(lines: readonly string[]): VpxCadence | undefined {
  let last: VpxCadence | undefined;
  for (const line of lines) {
    if (!line.includes('Cadence ')) continue;
    const c = parseVpxCadence(line);
    if (c) last = c;
  }
  return last;
}

/**
 * La cadence que VPX vise, lue au lancement : la plus petite de son maximum (0 ou moins : sans limite) et de celle de
 * l'écran. undefined : ligne absente (autre version de VPX).
 */
export function readVpxTargetFps(lines: readonly string[]): number | undefined {
  let target: number | undefined;
  for (const line of lines) {
    const m = /Synchronization mode: \d+ with maximum FPS: (-?[\d.]+), display FPS: ([\d.]+)/.exec(line);
    if (!m) continue;
    const max = Number(m[1]);
    const display = Number(m[2]);
    target = max > 0 && display > 0 ? Math.min(max, display) : display > 0 ? display : max > 0 ? max : undefined;
  }
  return target;
}

/** Ce que la cadence dit de la partie. */
export interface CadenceVerdict {
  /** La partie n'a pas tenu la cadence visée (moyenne, pire moment ou images en retard). */
  slow: boolean;
  /** Arrêts visibles : au moins STALLS_SEEN à-coups, et au moins un par minute. */
  stutters: boolean;
}

/** Moyenne sous 90 % de la cadence visée. */
export const SLOW_AVERAGE = 0.9;
/** Pire fenêtre de 10 s sous 75 % de la cadence visée. */
export const SLOW_WORST = 0.75;
/** Au moins 10 % d'images en retard sur la médiane. */
export const SLOW_LATE = 10;
export const STALLS_SEEN = 3;
/** Partie trop courte pour juger (premières secondes non comptées) : sous 20 s. */
export const CADENCE_MIN_S = 20;

export function cadenceVerdict(c: VpxCadence, targetFps = 60): CadenceVerdict | undefined {
  if (c.durationS < CADENCE_MIN_S || targetFps <= 0) return undefined;
  const slow = c.fps < targetFps * SLOW_AVERAGE || (c.worst10s !== undefined && c.worst10s < targetFps * SLOW_WORST) || c.late >= SLOW_LATE;
  const stutters = c.stalls >= STALLS_SEEN && c.stalls / (c.durationS / 60) >= 1;
  return { slow, stutters };
}

// --- Relevé par table : <données>\logs\cadence-parties.json ------------------------------------------------------
//
// Écrit après chaque partie par le processus principal, lu par le médecin (Santé, fiche de la table) : les dernières
// parties de chaque table, pour dire « cette table rame sur cette borne » sans attendre un rapport.

export const CADENCE_FILE = 'cadence-parties.json';
/** Parties gardées par table, les plus récentes. */
export const CADENCE_PER_TABLE = 3;
/** Tables gardées au plus. */
export const CADENCE_TABLES = 400;

export interface TableCadenceEntry {
  /** Fichier .vpx joué. */
  file: string;
  /** Date ISO 8601 de la fin de la partie. */
  at: string;
  targetFps?: number;
  fps: number;
  worst10s?: number;
  p99: number;
  max: number;
  late: number;
  stalls: number;
  durationS: number;
  slow: boolean;
  stutters: boolean;
  /** Partie dans le casque. */
  vr?: boolean;
}

interface CadenceLog {
  version: 1;
  games: TableCadenceEntry[];
}

const sameFile = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function readCadenceLog(logsDir: string): TableCadenceEntry[] {
  try {
    const log = JSON.parse(fs.readFileSync(path.join(logsDir, CADENCE_FILE), 'utf8')) as CadenceLog;
    return Array.isArray(log.games) ? log.games.filter((g) => typeof g?.file === 'string' && typeof g.fps === 'number') : [];
  } catch {
    return [];
  }
}

/** Les dernières parties jugées de cette table, la plus récente d'abord. */
export function tableCadence(logsDir: string, file: string): TableCadenceEntry[] {
  return readCadenceLog(logsDir)
    .filter((g) => sameFile(g.file, file))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Range le bilan d'une partie ; undefined (rien d'écrit) quand la partie était trop courte pour juger. */
export function recordGameCadence(logsDir: string, file: string, c: VpxCadence, targetFps: number | undefined, at = new Date(), vr = false): TableCadenceEntry | undefined {
  const verdict = cadenceVerdict(c, targetFps ?? 60);
  if (!verdict) return undefined;
  const entry: TableCadenceEntry = {
    file,
    at: at.toISOString(),
    ...(targetFps ? { targetFps } : {}),
    fps: c.fps,
    ...(c.worst10s !== undefined ? { worst10s: c.worst10s } : {}),
    p99: c.p99,
    max: c.max,
    late: c.late,
    stalls: c.stalls,
    durationS: c.durationS,
    slow: verdict.slow,
    stutters: verdict.stutters,
    ...(vr ? { vr: true } : {}),
  };
  const others = readCadenceLog(logsDir).filter((g) => !sameFile(g.file, file));
  const mine = [entry, ...tableCadence(logsDir, file)].slice(0, CADENCE_PER_TABLE);
  // Les tables jouées le plus récemment sont gardées.
  const kept = new Set<string>();
  for (const g of [...others].sort((a, b) => b.at.localeCompare(a.at))) if (kept.size < CADENCE_TABLES - 1) kept.add(g.file.toLowerCase());
  const games = [...mine, ...others.filter((g) => kept.has(g.file.toLowerCase()))];
  fs.mkdirSync(logsDir, { recursive: true });
  writeFileAtomic(path.join(logsDir, CADENCE_FILE), JSON.stringify({ version: 1, games } satisfies CadenceLog, null, 1) + '\n');
  return entry;
}

const fr = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** La ligne du journal de la borne (en français, pour le diagnostic à distance). */
export function cadenceJournal(table: string, c: VpxCadence, targetFps: number | undefined): string {
  const verdict = cadenceVerdict(c, targetFps ?? 60);
  const judged = !verdict ? 'trop courte pour juger' : verdict.slow ? (verdict.stutters ? 'RAME, avec des à-coups' : 'RAME') : verdict.stutters ? 'À-COUPS' : 'tenue'; // i18n-ignore : journal
  const target = targetFps ? `${fr(targetFps)} visées` : 'une cible inconnue'; // i18n-ignore : journal
  const worst = c.worst10s !== undefined ? `, pire fenêtre de 10 s à ${fr(c.worst10s)} images/s` : ''; // i18n-ignore : journal
  const step = c.phase === 'running' ? ' (bilan d’étape : VPX arrêté avant la fin)' : ''; // i18n-ignore : journal
  const head = `Cadence de la partie (${table}) : ${judged} — ${fr(c.fps)} images/s pour ${target}, `; // i18n-ignore : journal
  const body = `médiane ${c.p50} ms, 99e centile ${c.p99} ms, pire écart ${c.max} ms, ${fr(c.late)} % d'images en retard, ${c.stalls} à-coup(s)`; // i18n-ignore : journal
  const mem = c.memMB !== undefined ? `, mémoire de VPX ${c.memMB} Mo` : ''; // i18n-ignore : journal
  return `${head}${body}${worst}${mem} ; ${fr(c.durationS)} s mesurées${step}.`; // i18n-ignore : journal
}
