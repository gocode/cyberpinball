// Mode débogage (Menu système > Ma borne > Santé et sauvegardes > Mode débogage) : les mesures de tous les
// écrans de la borne en direct, par-dessus un seul d'entre eux (23/11/2026, après le
// signalement d'un joueur qui voyait sa table ramer). Pour constater un ralentissement de ses yeux : cadence
// de chaque fenêtre du front-end hors partie, cadence de VPX en partie, temps de chargement, processeur,
// mémoire, carte graphique ; et les rejoindre au rapport envoyé à l'équipe.
//
// Ce module est la logique seule (réglage, choix de l'écran, échantillons d'une minute à l'autre, lecture
// des lignes du plugin de VPX, texte de ce que la fenêtre montre) ; la collecte et la fenêtre sont dans
// app/src/debogage.ts, la page dans app/renderer/debogage.js.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { locale, t } from './i18n';
import { ROLES, type RoleId } from './model';

// ---------------------------------------------------------------------------
// Réglage

export const DEBUG_MODES = ['off', 'compact', 'detailed'] as const;
export type DebugMode = (typeof DEBUG_MODES)[number];

/** L'écran qui porte les mesures : `auto`, ou un rôle de la borne. */
export type DebugScreen = 'auto' | RoleId;
export const DEBUG_SCREENS: readonly DebugScreen[] = ['auto', 'backglass', 'dmd', 'topper', 'playfield'];

export interface DebugSettings {
  mode: DebugMode;
  screen: DebugScreen;
  /** Aussi pendant les parties (par-dessus VPX, sans lui prendre la main). Jamais dans le casque. */
  inGame: boolean;
  /** Les mesures des dernières minutes rejoignent le rapport technique. */
  attach: boolean;
}

export const DEBUG_DEFAULTS: Readonly<DebugSettings> = { mode: 'off', screen: 'auto', inGame: true, attach: true };

export function normalizeDebugSettings(raw: unknown): DebugSettings {
  const r = (raw ?? {}) as Partial<Record<keyof DebugSettings, unknown>>;
  return {
    mode: DEBUG_MODES.find((m) => m === r.mode) ?? DEBUG_DEFAULTS.mode,
    screen: DEBUG_SCREENS.find((s) => s === r.screen) ?? DEBUG_DEFAULTS.screen,
    inGame: typeof r.inGame === 'boolean' ? r.inGame : DEBUG_DEFAULTS.inGame,
    attach: typeof r.attach === 'boolean' ? r.attach : DEBUG_DEFAULTS.attach,
  };
}

const settingsFile = (dataDir: string) => path.join(dataDir, 'debogage.json');

/** Illisible ou absent : désactivé, comme avant. */
export function readDebugSettings(dataDir: string): DebugSettings {
  try {
    return normalizeDebugSettings(JSON.parse(fs.readFileSync(settingsFile(dataDir), 'utf8')));
  } catch {
    return { ...DEBUG_DEFAULTS };
  }
}

export function writeDebugSettings(dataDir: string, settings: DebugSettings): void {
  writeFileAtomic(settingsFile(dataDir), JSON.stringify(normalizeDebugSettings(settings), null, 2));
}

export function nextDebugMode(mode: DebugMode): DebugMode {
  return DEBUG_MODES[(DEBUG_MODES.indexOf(mode) + 1) % DEBUG_MODES.length]!;
}

export function nextDebugScreen(screen: DebugScreen): DebugScreen {
  return DEBUG_SCREENS[(DEBUG_SCREENS.indexOf(screen) + 1) % DEBUG_SCREENS.length]!;
}

export function debugModeLabel(mode: DebugMode): string {
  return mode === 'off' ? t('désactivé') : mode === 'compact' ? t('compact') : t('détaillé');
}

export function debugScreenLabel(screen: DebugScreen): string {
  return screen === 'auto' ? t('automatique') : (ROLES.find((r) => r.id === screen)?.label ?? screen);
}

/**
 * L'écran qui porte les mesures. Automatique : le backglass, sinon le DMD, sinon le playfield (le plus
 * loin des mains et des flippers). Un écran choisi mais absent de la borne revient à l'automatique.
 */
export function chooseDebugRole(screen: DebugScreen, available: readonly RoleId[]): RoleId | undefined {
  if (screen !== 'auto' && available.includes(screen)) return screen;
  return (['backglass', 'dmd', 'playfield'] as const).find((r) => available.includes(r)) ?? available[0];
}

export type DebugLayout = 'bar' | 'compact' | 'detailed' | 'reduced';

/**
 * La forme de ce qui s'affiche sur cet écran : le DMD ne porte qu'une bande (il est trop petit pour le
 * détail) ; le détaillé du playfield en partie est réduit, pour ne pas cacher la table.
 */
export function debugLayout(mode: DebugMode, role: RoleId, inGame: boolean): DebugLayout | undefined {
  if (mode === 'off') return undefined;
  if (role === 'dmd') return 'bar';
  if (mode === 'compact') return 'compact';
  return role === 'playfield' && inGame ? 'reduced' : 'detailed';
}

// ---------------------------------------------------------------------------
// Échantillons : un par seconde

export type DebugPhase = 'menu' | 'loading' | 'playing';

export interface DebugScreenSample {
  /** Images par seconde de la fenêtre du front-end (hors partie). */
  fps?: number;
  /** Plus longue image de la seconde (ms). */
  worstMs?: number;
  /** Fréquence de l'écran (Hz). */
  hz?: number;
  width: number;
  height: number;
}

/** Ce que le plugin de VPX dit de la dernière seconde d'une partie (ligne « Cadence live »). */
export interface LiveCadence {
  fps: number;
  p50: number;
  p99: number;
  max: number;
  /** À-coups (écarts de 100 ms et plus) dans la seconde. */
  stalls: number;
  /** Mémoire privée de VPX (Mo). */
  memMb?: number;
}

export interface DebugSample {
  /** Date.now(). */
  at: number;
  phase: DebugPhase;
  table?: string;
  /** Charge du processeur de tout le PC (%). */
  cpu?: number;
  ramUsedMb: number;
  ramTotalMb: number;
  /** Cyber Pinball : sa part du processeur (% du PC) et sa mémoire. */
  app?: { cpu?: number; memMb?: number };
  /** VPX en partie : sa part du processeur (% du PC) et sa mémoire. */
  vpx?: { cpu?: number; memMb?: number };
  screens: Partial<Record<RoleId, DebugScreenSample>>;
  game?: LiveCadence;
}

/** Les dernières minutes : une mesure par seconde, au plus `max`. */
export class DebugRing {
  private readonly list: DebugSample[] = [];
  constructor(readonly max = 600) {}
  push(sample: DebugSample): void {
    this.list.push(sample);
    if (this.list.length > this.max) this.list.splice(0, this.list.length - this.max);
  }
  samples(): readonly DebugSample[] {
    return this.list;
  }
  last(): DebugSample | undefined {
    return this.list[this.list.length - 1];
  }
  /** Les `n` dernières secondes. */
  tail(n: number): DebugSample[] {
    return this.list.slice(-n);
  }
  clear(): void {
    this.list.length = 0;
  }
}

/** Le fichier joint au rapport : les mesures telles quelles, rien de personnel (jamais un chemin ni un nom). */
export function debugReportJson(ring: DebugRing, meta: { version: string; at: number }): string | undefined {
  const samples = ring.samples();
  if (!samples.length) return undefined;
  return JSON.stringify({ format: 1, version: meta.version, at: new Date(meta.at).toISOString(), seconds: samples.length, samples }, null, 1);
}

// ---------------------------------------------------------------------------
// Lignes du plugin de VPX (dmd-suivi.cpp), relues dans vpinball.log

/** « Cadence live: fps=119.3 p50=8ms p99=11ms max=14ms stalls=0 mem=2100MB », une par seconde (réglage du plugin). */
export function parseLiveCadence(line: string): LiveCadence | undefined {
  const at = line.indexOf('Cadence live:');
  if (at < 0) return undefined;
  const body = line.slice(at + 'Cadence live:'.length);
  const num = (key: string): number | undefined => {
    const m = new RegExp(`\\b${key}=(-?[\\d.]+)`).exec(body);
    return m ? Number(m[1]) : undefined;
  };
  const fps = num('fps');
  const p50 = num('p50');
  const p99 = num('p99');
  const max = num('max');
  const stalls = num('stalls');
  if (fps === undefined || p50 === undefined || p99 === undefined || max === undefined || stalls === undefined) return undefined;
  const memMb = num('mem');
  return { fps, p50, p99, max, stalls, ...(memMb !== undefined && memMb >= 0 ? { memMb } : {}) };
}

export interface StallLine {
  ms: number;
  /** Seconde de la partie. */
  atS: number;
  /** Le module où était le fil des images (« MPCLIENT.DLL »), s'il est dit. */
  module?: string;
}

/** « Cadence: stall of 850 ms at 123.4s; main thread in MPCLIENT.DLL 7 ; … » : un à-coup, au moment où il arrive. */
export function parseStallLine(line: string): StallLine | undefined {
  const m = /Cadence: stall of (\d+) ms at ([\d.]+)s(.*)$/.exec(line);
  if (!m) return undefined;
  const module = /\bin ([\w.\-+]+) \d+/.exec(m[3] ?? '')?.[1];
  return { ms: Number(m[1]), atS: Number(m[2]), ...(module ? { module } : {}) };
}

/** Ce que l'attente d'un module veut dire, pour le joueur ; undefined : rien d'assez sûr pour le dire. */
export function stallCause(module: string | undefined): string | undefined {
  if (!module) return undefined;
  const m = module.toLowerCase();
  if (/mpclient|amsi|mpoav/.test(m)) return t('l’antivirus de Windows analysait le script de la table');
  if (/vbscript/.test(m)) return t('le script de la table travaillait');
  if (/avcodec|swscale|avformat|avutil/.test(m)) return t('une vidéo se décodait');
  if (/nvwgf2|nvoglv|nvd3d|amdxx|atidx|aticfx|igd|ig9icd|dxgi|d3d11|d3d12/.test(m)) return t('la carte graphique n’a pas suivi');
  if (/plugin-pup/.test(m)) return t('le PuP-Pack chargeait un média');
  return undefined;
}

// ---------------------------------------------------------------------------
// Ce que la fenêtre montre

export type DebugTone = 'ok' | 'av' | 'ko';

/** Une cadence jugée sur celle visée : 90 % et plus va bien, 60 % et plus est ralentie. */
export function fpsTone(fps: number, target: number | undefined): DebugTone {
  if (!target || target <= 0) return 'ok';
  const ratio = fps / target;
  return ratio >= 0.9 ? 'ok' : ratio >= 0.6 ? 'av' : 'ko';
}

const worse = (a: DebugTone | undefined, b: DebugTone | undefined): DebugTone | undefined => (a === 'ko' || b === 'ko' ? 'ko' : a === 'av' || b === 'av' ? 'av' : (a ?? b));

export interface DebugMediaTime {
  role: RoleId;
  /** « vidéo », « image »… (déjà traduit). */
  kind?: string;
  ms: number;
}

export interface DebugLaunchStep {
  label: string;
  detail?: string;
  /** Durée de l'étape (ms) ; absente : pas commencée. */
  ms?: number;
  /** En cours (l'étape qui attend). */
  current?: boolean;
}

export interface DebugInput {
  mode: DebugMode;
  role: RoleId;
  phase: DebugPhase;
  inGame: boolean;
  now: number;
  /** Depuis quand la phase dure (Date.now()). */
  since: number;
  table?: string;
  samples: readonly DebugSample[];
  /** Écrans de la borne : définition et fréquence. */
  screens: { role: RoleId; width: number; height: number; hz?: number }[];
  gpu?: { name: string; vramMb?: number };
  /** Le pré-réglage de qualité de VPX en vigueur (déjà traduit) ; absent : non connu. */
  quality?: string;
  /** Cadence visée par VPX (Hz de l'écran du playfield, ou son maximum réglé). */
  target?: number;
  /** Partie calée sur un écran annexe plus lent (readScreenCap). */
  cap?: { name: string; hz: number };
  stall?: { ms: number; at: number; cause?: string };
  launch?: { steps: DebugLaunchStep[]; previousMs?: number };
  media?: { table: string; rows: DebugMediaTime[] };
}

export interface DebugPart {
  text: string;
  /** Ce qui s'écrit plus discret après le texte (l'unité). */
  muted?: string;
  tone?: DebugTone;
}

export interface DebugBar {
  /** Images par seconde de la seconde (0 si inconnue). */
  v: number;
  tone: DebugTone;
  stall: boolean;
}

export interface DebugCell {
  text: string;
  tone?: DebugTone;
}

export type DebugBlock =
  | {
      kind: 'cadence';
      title: string;
      sub: string;
      value: string;
      unit: string;
      tone?: DebugTone;
      status: string;
      statusTone?: DebugTone;
      about: string;
      bars: DebugBar[];
      /** Fréquence de l'échelle des barres (haut du graphe). */
      scale: number;
      axis: [string, string, string];
      stats: { label: string; value: string; tone?: DebugTone }[];
      alert?: { tone: DebugTone; text: string };
    }
  | { kind: 'screens'; title: string; sub?: string; cols: string[]; rows: { name: string; detail?: string; absent?: boolean; cells: DebugCell[] }[]; alert?: { tone: DebugTone; text: string } }
  | { kind: 'kv'; title: string; sub?: string; rows: { k: string; s?: string; v: string; tone?: DebugTone; total?: boolean }[] }
  | { kind: 'chrono'; title: string; sub: string; rows: { state: 'ok' | 'current' | 'wait'; k: string; small?: string; v: string }[]; note?: string };

export interface DebugView {
  layout: DebugLayout;
  /** La pastille de la ligne compacte : le pire état de ce qui est mesuré. */
  tone: DebugTone;
  parts: DebugPart[];
  head: { name: string; context: string; time: string };
  blocks: DebugBlock[];
}

/** Au-delà, la cadence dite par VPX n'est plus montrée (plugin qui ne la dit plus, partie en pause) : « – ». */
export const GAME_FRESH_MS = 3500;

const ROLE_SHORT: Record<RoleId, string> = { playfield: 'PF', backglass: 'BG', dmd: 'DMD', topper: 'TOP' };

function num(n: number, digits = 0, fixed = false): string {
  return n.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: fixed ? digits : 0 });
}

/** 140 ms, 1,9 s. */
export function debugDuration(ms: number): string {
  return ms < 1000 ? `${num(Math.round(ms))} ms` : `${num(Math.round(ms / 100) / 10, 1, true)} s`;
}

/** 4:12, ou 4,6 s sous la minute. */
function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const gb = (mb: number) => `${num(Math.round(mb / 102.4) / 10, 1)} ${t('Go')}`;
const memText = (mb: number) => (mb >= 1024 ? gb(mb) : `${num(Math.round(mb))} ${t('Mo')}`);

function cpuTone(pct: number): DebugTone {
  return pct >= 85 ? 'ko' : pct >= 70 ? 'av' : 'ok';
}
function ramTone(used: number, total: number): DebugTone {
  const share = total > 0 ? used / total : 0;
  return share >= 0.92 ? 'ko' : share >= 0.8 ? 'av' : 'ok';
}
function timeTone(ms: number): DebugTone {
  return ms >= 1000 ? 'ko' : ms >= 300 ? 'av' : 'ok';
}

/** La médiane d'une liste (0 si vide). */
function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Les barres de la dernière minute : une par seconde, la plus récente à droite. */
export function cadenceBars(samples: readonly DebugSample[], target: number | undefined, seconds = 60): DebugBar[] {
  const games = samples.filter((s) => s.game).slice(-seconds);
  return games.map((s) => ({ v: Math.round(s.game!.fps), tone: fpsTone(s.game!.fps, target), stall: s.game!.stalls > 0 }));
}

/**
 * Tout ce que la fenêtre montre, déjà en texte : la page ne calcule rien. Une seule fonction pour les trois
 * densités (bande, compact, détaillé) ; le détaillé réduit (playfield en partie) en garde le haut.
 */
export function buildDebugView(input: DebugInput): DebugView | undefined {
  const layout = debugLayout(input.mode, input.role, input.inGame);
  if (!layout) return undefined;
  const last = input.samples[input.samples.length - 1];
  const game = input.phase === 'playing';
  const loading = input.phase === 'loading';
  const hzOf = (role: RoleId) => input.screens.find((s) => s.role === role)?.hz;
  const target = input.target ?? hzOf('playfield');
  const ramUsed = last?.ramUsedMb ?? 0;
  const ramTotal = last?.ramTotalMb ?? 0;
  const cpu = last?.cpu;
  // La dernière cadence dite par VPX, si elle est récente : un échantillon sans ligne neuve ne l'efface pas aussitôt.
  const lastGame = [...input.samples].reverse().find((s) => s.game && input.now - s.at <= GAME_FRESH_MS)?.game;
  const vpxMem = last?.vpx?.memMb ?? lastGame?.memMb;

  // ----- Compact et bande
  const parts: DebugPart[] = [];
  let tone: DebugTone = 'ok';
  const recent = input.samples.slice(-60);
  if (game) {
    const g = lastGame;
    const fpsT = g ? fpsTone(g.fps, target) : 'ok';
    const stalls = recent.reduce((n, s) => n + (s.game?.stalls ?? 0), 0);
    tone = worse(fpsT, stalls ? 'av' : undefined) ?? 'ok';
    parts.push(g ? { text: `VPX ${num(Math.round(g.fps))}`, muted: target ? `${t('i/s')} · ${num(Math.round(target))} Hz` : t('i/s'), tone: fpsT === 'ok' ? undefined : fpsT } : { text: 'VPX', muted: t('en attente de la cadence') });
    parts.push({ text: `${t('À-coups')} ${num(stalls)}`, muted: layout === 'bar' ? undefined : '/ min', tone: stalls ? 'av' : undefined });
  } else if (loading) {
    parts.push({ text: `${t('Lancement')} ${debugDuration(input.now - input.since)}`, muted: input.launch?.steps.find((s) => s.current)?.label });
  } else {
    const shown = ROLES.map((r) => r.id).filter((id) => last?.screens[id]?.fps !== undefined);
    for (const id of shown) tone = worse(tone, fpsTone(last!.screens[id]!.fps!, hzOf(id))) ?? tone;
    parts.push({ text: shown.length ? shown.map((id) => `${ROLE_SHORT[id]} ${num(Math.round(last!.screens[id]!.fps!))}`).join(' · ') : t('Mesure en cours'), muted: shown.length ? t('i/s') : undefined, tone: tone === 'ok' ? undefined : tone });
  }
  if (cpu !== undefined) {
    const ct = cpuTone(cpu);
    tone = worse(tone, ct === 'ko' ? 'av' : undefined) ?? tone;
    parts.push({ text: `${'CPU'} ${num(Math.round(cpu))} %`, tone: ct === 'ok' ? undefined : ct });
  }
  if (game && vpxMem !== undefined) parts.push({ text: `${'RAM VPX'} ${memText(vpxMem)}` });
  else if (ramTotal) parts.push({ text: `${'RAM'} ${num(Math.round((ramUsed / ramTotal) * 100))} %`, tone: ramTone(ramUsed, ramTotal) === 'ok' ? undefined : ramTone(ramUsed, ramTotal) });

  const context = game ? `${t('Partie')} · ${input.table ?? ''}` : loading ? `${t('Lancement')} · ${input.table ?? ''}` : t('Écran des tables');
  const time = loading ? debugDuration(input.now - input.since) : clock(input.now - input.since);
  const view: DebugView = { layout, tone, parts, head: { name: t('DÉBOGAGE'), context: context.replace(/ · $/, ''), time }, blocks: [] };
  if (layout === 'bar' || layout === 'compact') return view;

  // ----- Détaillé
  if (game) {
    const bars = cadenceBars(input.samples, target);
    const lastG = lastGame;
    const stalls = recent.reduce((n, s) => n + (s.game?.stalls ?? 0), 0);
    const seconds = input.samples.filter((s) => s.game).slice(-60);
    const fpsT = lastG ? fpsTone(lastG.fps, target) : 'ok';
    const p50 = Math.round(median(seconds.map((s) => s.game!.p50)));
    const p99 = Math.round(Math.max(0, ...seconds.map((s) => s.game!.p99)));
    const max = Math.round(Math.max(0, ...seconds.map((s) => s.game!.max)));
    const lowShare = seconds.length ? seconds.filter((s) => fpsTone(s.game!.fps, target) !== 'ok').length / seconds.length : 0;
    let status = t('Fluide');
    let statusTone: DebugTone | undefined;
    if (fpsT !== 'ok' || lowShare > 0.5) {
      status = t('Cadence basse');
      statusTone = fpsT === 'ok' ? 'av' : fpsT;
    } else if (stalls) {
      status = stalls === 1 ? t('1 à-coup en 1 min') : t('{n} à-coups en 1 min', { n: stalls });
      statusTone = 'av';
    }
    const recentStall = input.stall && input.now - input.stall.at <= 60_000 ? input.stall : undefined;
    let alert: { tone: DebugTone; text: string } | undefined;
    if (input.cap) alert = { tone: 'ko', text: t('Calée sur {name} ({hz} Hz) : VPX attend l’écran le plus lent. Passe-le à une fréquence plus haute dans Windows, ou joue avec le VPX de Cyber Pinball.', { name: input.cap.name, hz: num(input.cap.hz) }) };
    else if (recentStall) {
      const ago = Math.max(0, Math.round((input.now - recentStall.at) / 1000));
      alert = { tone: recentStall.ms >= 300 ? 'ko' : 'av', text: `${t('À-coup de {ms} ms, il y a {s} s', { ms: num(recentStall.ms), s: num(ago) })}${recentStall.cause ? ` : ${recentStall.cause}` : ''}.` };
    }
    view.blocks.push({
      kind: 'cadence',
      title: t('CADENCE DE VPX'),
      sub: t('dernière minute'),
      value: lastG ? num(Math.round(lastG.fps)) : '–',
      unit: t('i/s'),
      ...(fpsT !== 'ok' ? { tone: fpsT } : {}),
      status,
      ...(statusTone ? { statusTone } : {}),
      about: target ? t('Playfield à {hz} Hz', { hz: num(Math.round(target)) }) : '',
      bars,
      scale: Math.max(1, Math.round(target ?? Math.max(60, ...bars.map((b) => b.v)))),
      axis: [t('−60 s'), t('−30 s'), t('maintenant')],
      stats: [
        { label: t('Image médiane'), value: `${num(p50)} ms` },
        { label: t('99 % sous'), value: `${num(p99)} ms`, ...(p99 >= 64 ? { tone: 'av' as const } : {}) },
        stalls || max >= 100 ? { label: t('Plus long'), value: `${num(max)} ms`, ...(max >= 100 ? { tone: (max >= 300 ? 'ko' : 'av') as DebugTone } : {}) } : { label: t('À-coups'), value: '0' },
      ],
      ...(alert ? { alert } : {}),
    });
    if (layout === 'detailed') {
      view.blocks.push({
        kind: 'screens',
        title: t('ÉCRANS'),
        cols: [t('Écran'), 'Hz', t('Définition')],
        rows: ROLES.map((r) => {
          const s = input.screens.find((x) => x.role === r.id);
          return s ? { name: r.label, cells: [{ text: s.hz ? num(Math.round(s.hz)) : '–' }, { text: `${s.width} × ${s.height}` }] } : { name: r.label, absent: true, cells: [{ text: '–' }, { text: t('pas d’écran') }] };
        }),
      });
    }
  } else if (loading) {
    const steps = input.launch?.steps ?? [];
    view.blocks.push({
      kind: 'chrono',
      title: t('CHARGEMENT'),
      sub: t('depuis le Start'),
      rows: steps.map((s) => ({ state: s.current ? 'current' : s.ms === undefined ? 'wait' : 'ok', k: s.label, ...(s.detail ? { small: s.detail } : {}), v: s.ms === undefined ? '–' : debugDuration(s.ms) })),
      ...(input.launch?.previousMs ? { note: t('Lancement précédent de cette table : {time}.', { time: debugDuration(input.launch.previousMs) }) } : {}),
    });
  } else {
    // Hors partie : chaque fenêtre du front-end, puis le chargement des médias de la table choisie.
    view.blocks.push({
      kind: 'screens',
      title: t('ÉCRANS'),
      sub: t('10 dernières secondes'),
      cols: [t('Écran'), 'Hz', t('Cadence'), t('Pire image')],
      rows: ROLES.map((r) => {
        const info = input.screens.find((x) => x.role === r.id);
        const s = last?.screens[r.id];
        if (!info) return { name: r.label, absent: true, detail: t('pas d’écran'), cells: [{ text: '–' }, { text: '–' }, { text: '–' }] };
        const hz = info.hz;
        const tn = s?.fps !== undefined ? fpsTone(s.fps, hz) : undefined;
        const wt: DebugTone | undefined = s?.worstMs === undefined ? undefined : s.worstMs >= 250 ? 'ko' : s.worstMs >= 80 ? 'av' : undefined;
        return {
          name: r.label,
          detail: `${info.width} × ${info.height}`,
          cells: [{ text: hz ? num(Math.round(hz)) : '–' }, { text: s?.fps !== undefined ? `${num(Math.round(s.fps))} ${t('i/s')}` : '–', ...(tn && tn !== 'ok' ? { tone: tn } : {}) }, { text: s?.worstMs !== undefined ? `${num(Math.round(s.worstMs))} ms` : '–', ...(wt ? { tone: wt } : {}) }],
        };
      }),
    });
    if (input.media?.rows.length) {
      const total = Math.max(...input.media.rows.map((r) => r.ms));
      view.blocks.push({
        kind: 'kv',
        title: t('CHARGEMENT'),
        sub: input.media.table,
        rows: [
          ...input.media.rows.map((r) => ({ k: ROLES.find((x) => x.id === r.role)?.label ?? r.role, ...(r.kind ? { s: r.kind } : {}), v: debugDuration(r.ms), ...(timeTone(r.ms) !== 'ok' ? { tone: timeTone(r.ms) } : {}) })),
          { k: t('Table à l’écran après l’appui'), v: debugDuration(total), ...(timeTone(total) !== 'ok' ? { tone: timeTone(total) } : {}), total: true },
        ],
      });
    }
  }

  // Système : toujours en bas.
  const system: Extract<DebugBlock, { kind: 'kv' }>['rows'] = [];
  const mine = game ? last?.vpx : last?.app;
  const mineName = game || loading ? 'VPX' : 'Cyber Pinball';
  if (cpu !== undefined) system.push({ k: t('Processeur'), ...(mine?.cpu !== undefined ? { s: `${mineName} ${num(Math.round(mine.cpu))} %` } : {}), v: `${num(Math.round(cpu))} %`, ...(cpuTone(cpu) !== 'ok' ? { tone: cpuTone(cpu) } : {}) });
  if (ramTotal) system.push({ k: t('Mémoire'), ...(game && vpxMem !== undefined ? { s: `VPX ${memText(vpxMem)}` } : last?.app?.memMb !== undefined ? { s: `Cyber Pinball ${memText(last.app.memMb)}` } : {}), v: `${gb(ramUsed)} / ${gb(ramTotal)}`, ...(ramTone(ramUsed, ramTotal) !== 'ok' ? { tone: ramTone(ramUsed, ramTotal) } : {}) });
  if (input.gpu) system.push({ k: t('Carte graphique'), s: input.gpu.name, v: input.gpu.vramMb ? gb(input.gpu.vramMb) : '–' });
  if (layout === 'detailed' && input.quality) system.push({ k: t('Pré-réglage VPX'), v: input.quality });
  if (system.length) view.blocks.push({ kind: 'kv', title: t('SYSTÈME'), rows: system });
  return view;
}
