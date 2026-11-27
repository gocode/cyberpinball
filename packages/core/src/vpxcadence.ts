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

/** Ce que fait un antivirus quand le fil des images y attend : vbscript.dll lui envoie chaque texte compilé (AMSI). */
const SCANS = 'qui analyse du code compilé par le script (ExecuteGlobal, Execute, Eval)'; // i18n-ignore : journal

/**
 * Ce que fait un module quand le fil des images de VPX y attend (noms en minuscules). Les antivirus tiers s'installent
 * comme fournisseur AMSI (McAfee : mc-sec-plugin-x64.dll, relevé de Jax34 le 27/11/2026, ~785 ms par blocage) : même
 * cause que Defender, d'où le même constat, avec le nom de l'antivirus quand on le reconnaît. Un nom inconnu mais qui
 * contient « amsi » est un fournisseur AMSI. Évite « mfc*.dll » : ce sont les bibliothèques MFC de Microsoft.
 */
const STALL_PLACES: readonly [RegExp, string][] = [
  [/^(mpclient|mpoav|amsi)\.dll$/, `l'antivirus de Windows, ${SCANS}`], // i18n-ignore : journal
  [/^(mc-sec-plugin[\w-]*|mfe\w*|mcshield|mcafee\w*)\.dll$/, `l'antivirus McAfee, ${SCANS}`], // i18n-ignore : journal
  [/^(aswhook|aswamsi|snxhk|avghook)\.dll$/, `l'antivirus Avast ou AVG, ${SCANS}`], // i18n-ignore : journal
  [/^(atcuf\w*|bdhkm\w*|bdamsi)\.dll$/, `l'antivirus Bitdefender, ${SCANS}`], // i18n-ignore : journal
  [/^(klhk\w*|kloehook\w*|klamsi\w*)\.dll$/, `l'antivirus Kaspersky, ${SCANS}`], // i18n-ignore : journal
  [/^(eamsi|ehdrv\w*)\.dll$/, `l'antivirus ESET, ${SCANS}`], // i18n-ignore : journal
  [/^(mbam\w*|mbae\w*)\.dll$/, `l'antivirus Malwarebytes, ${SCANS}`], // i18n-ignore : journal
  [/^sophos\w*\.dll$/, `l'antivirus Sophos, ${SCANS}`], // i18n-ignore : journal
  [/^[\w-]*amsi[\w-]*\.dll$/, `un antivirus tiers (fournisseur AMSI), ${SCANS}`], // i18n-ignore : journal
  [/^vbscript\.dll$/, 'le script de la table'], // i18n-ignore : journal
  [/^(avcodec|avformat|avutil|swscale|swresample)[-\w]*\.dll$/, "le décodage d'une vidéo"], // i18n-ignore : journal
  [/^(nvoglv|nvwgf2um|nvd3dum|igd|amdxx|atiu|aticfx|d3d1[01]|dxgi)[\w]*\.dll$/, 'le pilote de la carte graphique'], // i18n-ignore : journal
  // VPX 10.8 en BGFX : la boucle de jeu attend le fil du rendu en dormant par tranches de 0,1 ms (player.cpp,
  // MultithreadedGameLoop : uOverSleep → SDL_DelayNS). Rapport du 21/11/2026 : 64 % des relevés là, le blocage ailleurs.
  [/^sdl3?\d*\.dll$/, 'une pause de VPX, qui attend le fil du rendu'], // i18n-ignore : journal
];

/** Fonctions de Windows où un fil ne fait qu'attendre : pour le fil du rendu, on regarde alors qui l'a appelé. */
const WAITING = /^(ntdll|kernelbase|kernel32|win32u)\.dll$/i;

type Place = { module: string; share: number; samples: number; what?: string };

/** Le module le plus vu d'une liste « A n, B m » cumulée sur plusieurs lignes. */
function addCounts(counts: Map<string, number>, list: string): number {
  let total = 0;
  for (const m of list.matchAll(/([^,]+?) (\d+)(?:,|$)/g)) {
    const name = m[1]!.trim();
    const n = Number(m[2]);
    counts.set(name, (counts.get(name) ?? 0) + n);
    total += n;
  }
  return total;
}

function topPlace(counts: Map<string, number>, total: number): Place | undefined {
  if (!total) return undefined;
  const [module, samples] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
  const what = STALL_PLACES.find(([re]) => re.test(module.toLowerCase()))?.[1];
  return { module, share: samples / total, samples: total, ...(what ? { what } : {}) };
}

/**
 * Où était le fil des images de VPX pendant les à-coups d'une partie, d'après les lignes « Cadence: stall … ; main thread
 * N samples: … under A n, B m » du plugin du DMD (arrets.h) : le module le plus relevé sur la pile, sa part des relevés,
 * et ce qu'il fait quand il est connu. `render` : le fil du rendu (« | render thread … », plugin du 21/11/2026), par le
 * module où il était, ou celui qui l'a appelé quand il attendait dans Windows. undefined : pas de relevé.
 */
export function stallPlace(lines: readonly string[]): (Place & { render?: Place }) | undefined {
  const main = new Map<string, number>();
  const renderIn = new Map<string, number>();
  const renderUnder = new Map<string, number>();
  let total = 0;
  let renderTotal = 0;
  for (const line of lines) {
    if (!line.includes('Cadence: stall of ')) continue;
    const [mainPart, renderPart] = line.split(' | render thread ');
    const under = /; main thread \d+ samples: .*?; under ([^;]+)/.exec(mainPart!)?.[1];
    if (under) total += addCounts(main, under);
    const r = renderPart && /^\d+ samples: in ([^;]+); under ([^;(]+)/.exec(renderPart);
    if (r) {
      renderTotal += addCounts(renderIn, r[1]!);
      addCounts(renderUnder, r[2]!);
    }
  }
  const place = topPlace(main, total);
  if (!place) return undefined;
  let render = topPlace(renderIn, renderTotal);
  if (render && WAITING.test(render.module)) {
    const caller = topPlace(renderUnder, [...renderUnder.values()].reduce((a, b) => a + b, 0));
    if (caller && caller.module !== '-') render = caller;
  }
  // « Attend le fil du rendu » ne vaut que pour la boucle de jeu.
  if (render?.what && /^sdl/i.test(render.module)) delete render.what;
  return { ...place, ...(render ? { render } : {}) };
}

/** Ligne du journal de la borne qui dit où VPX attendait pendant les à-coups ; undefined sans relevé. */
export function stallPlaceJournal(table: string, lines: readonly string[]): string | undefined {
  const place = stallPlace(lines);
  if (!place) return undefined;
  const pct = (p: Place) => Math.round(p.share * 100);
  const render = place.render ? ` ; le fil du rendu était surtout dans ${place.render.module} (${pct(place.render)} % de ${place.render.samples} relevés)${place.render.what ? `, ${place.render.what}` : ''}` : ''; // i18n-ignore : journal
  return `À-coups de la partie (${table}) : le fil des images de VPX était surtout dans ${place.module} (${pct(place)} % de ${place.samples} relevés)${place.what ? `, ${place.what}` : ''}${render}.`; // i18n-ignore : journal
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

// --- Écran annexe qui bride la partie ------------------------------------------------------------------------------
//
// VPX 10.8.1 (BGFX) dessine toutes ses fenêtres (playfield, backglass du plugin B2S, ScoreView, topper) dans une seule
// chaîne de rendu, présentées ensemble à chaque image : l'écran le plus lent impose sa fréquence au playfield.
// Rapports du 20/11/2026 : playfield à 120 Hz, backglass à 50 Hz → 51 images/s sur toutes les tables à backglass, et
// 119 sur les autres ; autre borne, écrans annexes à 60 Hz → exactement 60. Le médecin disait « la table rame » : la
// table n'y était pour rien. VPX le corrige après la 10.8.1-5436 (commits d73557d et f832180 de novembre 2026 : chaque
// fenêtre annexe suit son propre écran). VPX écrit chaque fenêtre au lancement :
//   Window #1 (1920x1080) was created on display 32W_LCD_TV [1920x1080 50Hz SDL_PIXELFORMAT_XRGB8888]

/** Une fenêtre que VPX a ouverte pour la partie, et la fréquence de son écran. */
export interface VpxWindow {
  display: string;
  hz: number;
  playfield: boolean;
}

const WINDOW = /Window #\d+ \(\d+x\d+\) was created on display (.+?) \[\d+x\d+ ([\d.]+)Hz/;

/**
 * Les fenêtres de la partie. Le playfield est celle que VPX crée juste avant de dire sa synchronisation (il la règle
 * sur cet écran) ; sans cette ligne (casque), la première.
 */
export function readVpxWindows(lines: readonly string[]): VpxWindow[] {
  const out: VpxWindow[] = [];
  let found = false;
  for (const line of lines) {
    const w = WINDOW.exec(line);
    if (w) out.push({ display: w[1]!, hz: Number(w[2]), playfield: false });
    else if (!found && out.length && line.includes('Synchronization mode: ')) {
      out[out.length - 1]!.playfield = true;
      found = true;
    }
  }
  if (out.length && !found) out[0]!.playfield = true;
  return out;
}

/** L'écran annexe dont la fréquence a fixé celle de la partie. */
export interface ScreenCap {
  display: string;
  hz: number;
}

/** La partie suit un écran annexe quand sa cadence moyenne tombe dans cette marge autour de la fréquence de l'écran. */
export const CAP_LOW = 0.85;
export const CAP_HIGH = 1.1;

/**
 * L'écran annexe (backglass, ScoreView, topper) plus lent que la cadence visée, sur lequel la partie s'est calée.
 * undefined : aucun écran annexe plus lent, ou une cadence sans rapport avec sa fréquence (la table rame vraiment).
 */
export function readScreenCap(lines: readonly string[], c: VpxCadence | undefined, targetFps: number | undefined): ScreenCap | undefined {
  if (!c || !targetFps || targetFps <= 0) return undefined;
  const slower = readVpxWindows(lines)
    .filter((w) => !w.playfield && w.hz > 0 && w.hz < targetFps * 0.95)
    .sort((a, b) => a.hz - b.hz);
  // Calée sur un écran, la partie sort ses images au rythme de cet écran : médiane d'au moins 3/4 de sa période (16 à
  // 17 ms pour 60 Hz, 17 ms pour 50 Hz sur un playfield à 120 Hz). Rapport du 21/11/2026 : Daredevil à 62,5 i/s de
  // moyenne, médiane 8 ms et 49 arrêts de l'antivirus, avait été dite « bridée à 60 Hz » par la seule moyenne.
  const w = slower.find((s) => c.fps >= s.hz * CAP_LOW && c.fps <= s.hz * CAP_HIGH && c.p50 >= (1000 / s.hz) * 0.75);
  return w ? { display: w.display, hz: w.hz } : undefined;
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

/**
 * Partie bridée par un écran annexe : jugée sur la fréquence de cet écran, sans les images en retard (calées sur deux
 * fréquences, les images alternent deux durées : la moitié paraît « en retard » sur la médiane sans l'être).
 */
export function cadenceVerdict(c: VpxCadence, targetFps = 60, cap?: ScreenCap): CadenceVerdict | undefined {
  if (c.durationS < CADENCE_MIN_S || targetFps <= 0) return undefined;
  const goal = cap ? cap.hz : targetFps;
  const slow = c.fps < goal * SLOW_AVERAGE || (c.worst10s !== undefined && c.worst10s < goal * SLOW_WORST) || (!cap && c.late >= SLOW_LATE);
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
  /** Autres programmes de borne ouverts pendant la partie (programsDuringGame, coexistence.ts). */
  others?: string[];
  /** Écran annexe sur lequel la partie s'est calée (readScreenCap) : slow et stutters sont jugés sur sa fréquence. */
  cap?: ScreenCap;
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
export function recordGameCadence(logsDir: string, file: string, c: VpxCadence, targetFps: number | undefined, at = new Date(), vr = false, others: string[] = [], cap?: ScreenCap): TableCadenceEntry | undefined {
  const verdict = cadenceVerdict(c, targetFps ?? 60, cap);
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
    ...(others.length ? { others } : {}),
    ...(cap ? { cap } : {}),
  };
  const rest = readCadenceLog(logsDir).filter((g) => !sameFile(g.file, file));
  const mine = [entry, ...tableCadence(logsDir, file)].slice(0, CADENCE_PER_TABLE);
  // Les tables jouées le plus récemment sont gardées.
  const kept = new Set<string>();
  for (const g of [...rest].sort((a, b) => b.at.localeCompare(a.at))) if (kept.size < CADENCE_TABLES - 1) kept.add(g.file.toLowerCase());
  const games = [...mine, ...rest.filter((g) => kept.has(g.file.toLowerCase()))];
  fs.mkdirSync(logsDir, { recursive: true });
  writeFileAtomic(path.join(logsDir, CADENCE_FILE), JSON.stringify({ version: 1, games } satisfies CadenceLog, null, 1) + '\n');
  return entry;
}

const fr = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** La ligne du journal de la borne (en français, pour le diagnostic à distance). */
export function cadenceJournal(table: string, c: VpxCadence, targetFps: number | undefined, others: readonly string[] = [], cap?: ScreenCap): string {
  const verdict = cadenceVerdict(c, targetFps ?? 60, cap);
  const base = !verdict ? 'trop courte pour juger' : verdict.slow ? (verdict.stutters ? 'RAME, avec des à-coups' : 'RAME') : verdict.stutters ? 'À-COUPS' : 'tenue'; // i18n-ignore : journal
  const judged = cap ? `BRIDÉE par l'écran « ${cap.display} » à ${fr(cap.hz)} Hz (${base})` : base; // i18n-ignore : journal
  const target = targetFps ? `${fr(targetFps)} visées` : 'une cible inconnue'; // i18n-ignore : journal
  const worst = c.worst10s !== undefined ? `, pire fenêtre de 10 s à ${fr(c.worst10s)} images/s` : ''; // i18n-ignore : journal
  const step = c.phase === 'running' ? ' (bilan d’étape : VPX arrêté avant la fin)' : ''; // i18n-ignore : journal
  const head = `Cadence de la partie (${table}) : ${judged} — ${fr(c.fps)} images/s pour ${target}, `; // i18n-ignore : journal
  const body = `médiane ${c.p50} ms, 99e centile ${c.p99} ms, pire écart ${c.max} ms, ${fr(c.late)} % d'images en retard, ${c.stalls} à-coup(s)`; // i18n-ignore : journal
  const mem = c.memMB !== undefined ? `, mémoire de VPX ${c.memMB} Mo` : ''; // i18n-ignore : journal
  const open = others.length ? ` ; ouverts pendant la partie : ${others.join(', ')}` : ''; // i18n-ignore : journal
  return `${head}${body}${worst}${mem} ; ${fr(c.durationS)} s mesurées${step}${open}.`; // i18n-ignore : journal
}
