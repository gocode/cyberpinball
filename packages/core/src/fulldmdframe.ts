// Habillage FullDMD en partie : le média (FullDMD) d'une table (VPinMediaDB, PinUP Popper)
// dessine souvent une illustration en haut et un cadre en bas, avec une image figée du DMD
// dedans. Au menu, Cyber Pinball le montre sur tout l'écran du FullDMD. En partie, VPX 10.8.1
// ouvre sa fenêtre ScoreView sur ce même écran : sans image FullDMD dans le .directb2s (plugin
// B2S) ni écran 5 du PuP-Pack, c'est le plugin ScoreView qui la remplit, et il ne sait pas
// dessiner de fond (plugins/scoreview, commit af26b2d93 : « - Image » refusé, « Not yet
// supported »). Le DMD s'étirait donc sur tout l'écran, sans l'habillage (The Walking Dead,
// 26 octobre 2026).
//
// La fenêtre du menu reste derrière VPX pendant la partie (fond de partie) : il suffit de
// poser la fenêtre ScoreView dans le cadre de l'habillage, pour cette table seulement
// ([ScoreView] du .ini de la table, que VPX lit par-dessus VPinballX.ini), et l'habillage
// reste visible autour. Le cadre est cherché dans l'image (detectDmdFrame) ; l'utilisateur
// l'ajuste en partie, dans le menu de VPX (« ScoreView Display », « Save as Table Override »),
// et sa place est ensuite respectée.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { IniDocument } from './ini';
import type { MediaSource, MediaType } from './medias';
import type { DmdKind, Rect } from './model';
import { decodePng, type RgbaImage } from './png';
import type { TableInfoFile } from './tables';
import type { ZonePlacement } from './zones';

/** Rectangle en fractions de l'image (0 à 1). */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Largeur de travail : les cadres se voient très bien à cette taille, et la recherche reste rapide. */
const WORK_WIDTH = 480;
/** Écart de couleur (0 à 255, plus grand écart des trois composantes) qui fait un bord. */
const EDGE_DELTA = 48;
/** Part de chacun des quatre côtés qui doit être un bord. */
const SIDE_COVER = 0.8;
/** Largeur minimale du cadre, en part de l'image : un cadre de DMD occupe presque toute la largeur. */
const MIN_FRAME_WIDTH = 0.4;
/** Hauteur minimale du cadre, en part de l'image. */
const MIN_FRAME_HEIGHT = 0.12;
/** Proportions de l'intérieur du cadre : un DMD 4:1 (128 × 32), à quelques bords près. */
const MIN_ASPECT = 2.5;
const MAX_ASPECT = 6.5;
/** Lignes et colonnes candidates gardées, les plus marquées d'abord. */
const MAX_CANDIDATES = 48;
/** Épaisseur maximale de la bordure du cadre (traits parallèles), en part de l'image. */
const BORDER = 0.05;
/** Trous tolérés dans un trait (pointillés, coins arrondis), en pixels de travail. */
const STROKE_GAP = 3;

interface Work {
  width: number;
  height: number;
  /** RVB, 3 octets par pixel. */
  rgb: Uint8Array;
}

/** Image réduite à WORK_WIDTH par moyenne des pixels (un cadre en pointillés devient un trait). */
function shrink(img: RgbaImage): Work {
  const factor = Math.max(1, img.width / WORK_WIDTH);
  const width = Math.max(1, Math.round(img.width / factor));
  const height = Math.max(1, Math.round(img.height / factor));
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * img.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * img.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * img.width + xx) * 4;
          // Transparence sur du noir : c'est ainsi que l'écran la montre.
          const a = img.data[o + 3]! / 255;
          r += img.data[o]! * a;
          g += img.data[o + 1]! * a;
          b += img.data[o + 2]! * a;
          n++;
        }
      }
      const o = (y * width + x) * 3;
      rgb[o] = r / n;
      rgb[o + 1] = g / n;
      rgb[o + 2] = b / n;
    }
  }
  return { width, height, rgb };
}

function delta(w: Work, a: number, b: number): number {
  const p = a * 3;
  const q = b * 3;
  return Math.max(Math.abs(w.rgb[p]! - w.rgb[q]!), Math.abs(w.rgb[p + 1]! - w.rgb[q + 1]!), Math.abs(w.rgb[p + 2]! - w.rgb[q + 2]!));
}

/**
 * Bords entre deux lignes (ou deux colonnes) voisines : edges[b][i] vaut 1 quand la ligne b
 * diffère nettement de la ligne b - 1 au point i. Un néon flou se mesure sur deux pas, et
 * un trait penché ou baveux d'un pixel est toléré (une ligne de part et d'autre). Renvoie les
 * sommes cumulées de chaque frontière, pour mesurer un côté d'un coup.
 */
function boundaries(w: Work, horizontal: boolean): Int32Array[] {
  const count = horizontal ? w.height : w.width;
  const length = horizontal ? w.width : w.height;
  const at = (line: number, i: number) => (horizontal ? line * w.width + i : i * w.width + line);
  const raw: Uint8Array[] = [];
  for (let b = 0; b < count; b++) {
    const row = new Uint8Array(length);
    if (b > 0) {
      for (let i = 0; i < length; i++) {
        let d = delta(w, at(b - 1, i), at(b, i));
        if (b >= 2) d = Math.max(d, delta(w, at(b - 2, i), at(b, i)));
        if (b + 1 < count) d = Math.max(d, delta(w, at(b - 1, i), at(b + 1, i)));
        row[i] = d > EDGE_DELTA ? 1 : 0;
      }
    }
    raw.push(row);
  }
  return raw.map((_, b) => {
    const sums = new Int32Array(length + 1);
    for (let i = 0; i < length; i++) {
      const on = raw[b]![i]! || (b > 0 && raw[b - 1]![i]!) || (b + 1 < count && raw[b + 1]![i]!) ? 1 : 0;
      sums[i + 1] = sums[i]! + on;
    }
    return sums;
  });
}

/** Plus long trait d'une frontière : points de bord qui se suivent, à STROKE_GAP trous près. */
function longestStroke(sums: Int32Array): number {
  let best = 0;
  let start = -1;
  let last = -1;
  for (let i = 0; i < sums.length - 1; i++) {
    if (sums[i + 1]! === sums[i]!) continue;
    if (start < 0 || i - last > STROKE_GAP + 1) start = i;
    last = i;
    best = Math.max(best, last - start + 1);
  }
  return best;
}

/**
 * Frontières qui portent un long trait (au moins `min` points), les MAX_CANDIDATES plus
 * longs. Le nombre total de points ne suffit pas : une illustration fouillée a des colonnes
 * pleines de petits bords, qui évinçaient les côtés du cadre (The Walking Dead).
 */
function candidates(sums: Int32Array[], min: number): number[] {
  return sums
    .map((s, b) => ({ b, n: b > 0 ? longestStroke(s) : 0 }))
    .filter((c) => c.n >= min)
    .sort((a, c) => c.n - a.n)
    .slice(0, MAX_CANDIDATES)
    .map((c) => c.b)
    .sort((a, c) => a - c);
}

const cover = (sums: Int32Array, from: number, to: number) => (sums[to]! - sums[from]!) / Math.max(1, to - from);

/**
 * Intérieur du cadre du DMD dans une image FullDMD, en fractions de l'image ; undefined
 * quand l'image n'a pas de cadre (vidéo de jeu, illustration seule). Le cadre est un
 * rectangle dont les quatre côtés sont des bords francs (SIDE_COVER), presque aussi large
 * que l'image, aux proportions d'un DMD. Un cadre a souvent plusieurs traits (néon double,
 * filet doré) : on garde le plus grand rectangle trouvé, puis le plus petit qui tient dedans à
 * moins d'une épaisseur de bordure (BORDER) de chaque côté : l'intérieur du cadre, là où l'image
 * montre un DMD figé, et pas un trait du dessin de ce DMD.
 */
export function detectDmdFrame(img: RgbaImage): FrameRect | undefined {
  if (img.width < 16 || img.height < 16) return undefined;
  const w = shrink(img);
  const rows = boundaries(w, true);
  const cols = boundaries(w, false);
  const tops = candidates(rows, Math.round(w.width * MIN_FRAME_WIDTH * SIDE_COVER));
  const sides = candidates(cols, Math.round(w.height * MIN_FRAME_HEIGHT * SIDE_COVER));
  const found: { l: number; t: number; r: number; b: number; area: number }[] = [];
  for (let i = 0; i < tops.length; i++) {
    for (let j = i + 1; j < tops.length; j++) {
      const t = tops[i]!;
      const b = tops[j]!;
      const h = b - t;
      if (h < w.height * MIN_FRAME_HEIGHT) continue;
      for (let k = 0; k < sides.length; k++) {
        for (let m = k + 1; m < sides.length; m++) {
          const l = sides[k]!;
          const r = sides[m]!;
          const width = r - l;
          if (width < w.width * MIN_FRAME_WIDTH) continue;
          const aspect = width / h;
          if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
          if (cover(rows[t]!, l, r) < SIDE_COVER || cover(rows[b]!, l, r) < SIDE_COVER) continue;
          if (cover(cols[l]!, t, b) < SIDE_COVER || cover(cols[r]!, t, b) < SIDE_COVER) continue;
          found.push({ l, t, r, b, area: width * h });
        }
      }
    }
  }
  if (!found.length) return undefined;
  const outer = found.reduce((a, c) => (c.area > a.area ? c : a));
  const inner = found
    .filter((c) => c.l >= outer.l && c.r <= outer.r && c.t >= outer.t && c.b <= outer.b)
    .filter((c) => c.l - outer.l <= w.width * BORDER && outer.r - c.r <= w.width * BORDER && c.t - outer.t <= w.height * BORDER && outer.b - c.b <= w.height * BORDER)
    .reduce((a, c) => (c.area < a.area ? c : a));
  return { x: inner.l / w.width, y: inner.t / w.height, width: (inner.r - inner.l) / w.width, height: (inner.b - inner.t) / w.height };
}

/** Recouvrement de deux rectangles : surface commune sur surface réunie. */
export function frameOverlap(a: FrameRect, b: FrameRect): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const common = x * y;
  const union = a.width * a.height + b.width * b.height - common;
  return union > 0 ? common / union : 0;
}

/**
 * Cadre d'une vidéo, d'après plusieurs de ses images : celui que la majorité d'entre elles
 * montre au même endroit (moyenne de celles-là). Un cadre vu une seule fois (une scène qui
 * passe) n'en est pas un.
 */
export function agreeingFrame(frames: (FrameRect | undefined)[]): FrameRect | undefined {
  const seen = frames.filter((f): f is FrameRect => f !== undefined);
  const need = Math.floor(frames.length / 2) + 1;
  for (const f of seen) {
    const close = seen.filter((g) => frameOverlap(f, g) >= 0.85);
    if (close.length < need) continue;
    const mean = (key: keyof FrameRect) => close.reduce((s, g) => s + g[key], 0) / close.length;
    return { x: mean('x'), y: mean('y'), width: mean('width'), height: mean('height') };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Cadre d'un média, mémorisé

/** Moments d'une vidéo où chercher le cadre, en part de sa durée. */
export const VIDEO_FRAME_TIMES: readonly number[] = [0.1, 0.35, 0.6, 0.85];

/** Cadre trouvé dans un média (null : cherché, pas de cadre), et taille du média. */
export interface FrameRecord {
  frame: FrameRect | null;
  width: number;
  height: number;
}

interface FrameCacheFile {
  version: 1;
  entries: Record<string, FrameRecord>;
}

/** Fichier des cadres trouvés, dans le cache de Cyber Pinball (<racine>\data\cache). */
export function frameCacheFile(dataDir: string): string {
  return path.join(dataDir, 'cache', 'fulldmd-cadres.json');
}

/** Clé d'un média : chemin, taille et date ; un média remplacé est cherché à nouveau. */
export function frameCacheKey(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    return crypto.createHash('sha1').update(`${path.resolve(file).toLowerCase()}|${stat.size}|${Math.round(stat.mtimeMs)}`).digest('hex').slice(0, 20);
  } catch {
    return undefined;
  }
}

function readFrameCache(cacheFile: string): FrameCacheFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as FrameCacheFile;
    if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === 'object') return parsed;
  } catch {
    // Absent ou abîmé : on cherche à nouveau.
  }
  return { version: 1, entries: {} };
}

/** Cadre déjà cherché pour ce média ; undefined s'il ne l'a jamais été (ou a changé depuis). */
export function cachedFrame(cacheFile: string, media: string): FrameRecord | undefined {
  const key = frameCacheKey(media);
  return key ? readFrameCache(cacheFile).entries[key] : undefined;
}

export function storeFrame(cacheFile: string, media: string, record: FrameRecord): void {
  const key = frameCacheKey(media);
  if (!key) return;
  const cache = readFrameCache(cacheFile);
  cache.entries[key] = record;
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const tmp = `${cacheFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1) + '\n', 'utf8');
  fs.renameSync(tmp, cacheFile);
}

/** Cadre d'une image PNG lue sur le disque (sans navigateur) ; undefined si elle n'est pas lisible ainsi. */
export function pngFrame(file: string): FrameRecord | undefined {
  if (!/\.png$/i.test(file)) return undefined;
  let img: RgbaImage | undefined;
  try {
    img = decodePng(fs.readFileSync(file));
  } catch {
    return undefined;
  }
  return img ? { frame: detectDmdFrame(img) ?? null, width: img.width, height: img.height } : undefined;
}

// ---------------------------------------------------------------------------
// Habillage en partie : faut-il, et où poser la fenêtre du DMD

/** Ce qui décide de l'habillage d'une table en partie. */
export interface FullDmdInput {
  /** Type de l'écran du DMD (dmdKindOf) ; l'habillage ne concerne qu'un FullDMD. */
  dmdKind: DmdKind | undefined;
  /** Façon dont VPX affiche la fenêtre du DMD (zonePlacement) ; undefined sans rôle dmd. */
  placement: ZonePlacement | undefined;
  /** Zone du DMD en pixels, relative à son écran (vpxRect). */
  zone: Rect | undefined;
  /** Média montré au menu sur l'écran du DMD (resolveRoleMedia) : son fichier, son type trouvé, d'où il vient. */
  media?: { file: string; type?: MediaType; source: MediaSource };
  /** Cadre cherché dans ce média ; undefined : pas encore cherché (vidéo). */
  frame: FrameRecord | undefined;
  /** La table dessine un DMD (ROM, FlexDMD, UltraDMD : ScriptFacts.drawsDmd) ; undefined : script inconnu. */
  drawsDmd: boolean | undefined;
  /** Le .directb2s a une image FullDMD : le plugin B2S la montre lui-même, le DMD incrusté. */
  b2sFullDmd: boolean;
  /** Un PuP-Pack dessine dans la fenêtre du DMD pendant la partie (écran 5 ou 1, Priority.PUP ≠ 0). */
  pupInDmdWindow: boolean;
}

export type FullDmdReason = 'notFullDmd' | 'embedded' | 'noMedia' | 'notAnalysed' | 'noFrame' | 'noDmd' | 'b2s' | 'pup';

export type FullDmdPlan = { dressed: true; window: Rect; frame: FrameRect } | { dressed: false; reason: FullDmdReason };

/**
 * Habillage FullDMD de cette table en partie : la fenêtre du DMD posée dans le cadre du média
 * FullDMD, ou pourquoi non. Rien ne change (fenêtre du DMD sur toute sa zone) quand :
 * - l'écran est un DMD seul, ou le DMD est incrusté dans le playfield ;
 * - le média de l'écran n'est pas un FullDMD de la table (repli, image du .directb2s, DMD réduit) ;
 * - le .directb2s ou le PuP-Pack habillent déjà la fenêtre du DMD ;
 * - la table ne dessine pas de DMD (rien à poser dans le cadre) ;
 * - aucun cadre n'a été trouvé dans ce média (vidéo de jeu, illustration seule).
 */
export function fullDmdPlan(input: FullDmdInput): FullDmdPlan {
  const no = (reason: FullDmdReason): FullDmdPlan => ({ dressed: false, reason });
  if (input.dmdKind !== 'fulldmd' || !input.zone || !input.placement) return no('notFullDmd');
  if (input.placement === 'embedded') return no('embedded');
  if (!input.media || input.media.type !== 'FullDMD' || input.media.source === 'b2s' || input.media.source === 'fallback') return no('noMedia');
  if (input.b2sFullDmd) return no('b2s');
  if (input.pupInDmdWindow) return no('pup');
  if (input.drawsDmd === false) return no('noDmd');
  if (!input.frame) return no('notAnalysed');
  if (!input.frame.frame) return no('noFrame');
  return { dressed: true, window: frameWindow(input.zone, input.frame, input.frame.frame), frame: input.frame.frame };
}

/**
 * Fenêtre du DMD posée sur le cadre, en pixels de l'écran : le média est montré entier dans
 * la zone, centré (object-fit: contain, comme au menu), et le cadre suit.
 */
export function frameWindow(zone: Rect, media: { width: number; height: number }, frame: FrameRect): Rect {
  const scale = Math.min(zone.width / media.width, zone.height / media.height);
  const left = zone.x + (zone.width - media.width * scale) / 2;
  const top = zone.y + (zone.height - media.height * scale) / 2;
  const x = Math.round(left + frame.x * media.width * scale);
  const y = Math.round(top + frame.y * media.height * scale);
  return {
    x,
    y,
    width: Math.round(left + (frame.x + frame.width) * media.width * scale) - x,
    height: Math.round(top + (frame.y + frame.height) * media.height * scale) - y,
  };
}

/** Phrase courte de la raison, pour le journal et le diagnostic. */
export function fullDmdReasonLabel(reason: FullDmdReason): string {
  switch (reason) {
    case 'notFullDmd':
      return t('l’écran du DMD n’est pas un FullDMD');
    case 'embedded':
      return t('DMD incrusté dans le playfield');
    case 'noMedia':
      return t('pas de média FullDMD pour cette table');
    case 'notAnalysed':
      return t('média FullDMD pas encore analysé');
    case 'noFrame':
      return t('aucun cadre de DMD dans le média FullDMD');
    case 'noDmd':
      return t('la table ne dessine pas de DMD');
    case 'b2s':
      return t('le .directb2s montre déjà son FullDMD');
    case 'pup':
      return t('le PuP-Pack occupe la fenêtre du DMD');
  }
}

// ---------------------------------------------------------------------------
// Fenêtre du DMD dans le .ini de la table

const SECTION = 'ScoreView';
/** Clés de la fenêtre du DMD qu'écrit l'habillage. */
const DRESS_KEYS = { fullScreen: 'ScoreViewFullScreen', x: 'ScoreViewWndX', y: 'ScoreViewWndY', width: 'ScoreViewWidth', height: 'ScoreViewHeight' } as const;
/** Toute clé qui place la fenêtre du DMD (Output, Display, FullScreen, position, taille). */
const PLACE_KEY = /^ScoreView(Output|Display|FullScreen|WndX|WndY|Width|Height)$/i;

/** Place de la fenêtre du DMD écrite pour la table seule, telle que le .ini de la table la donne. */
export interface TableDmdWindow {
  /** Clés de placement non vides du .ini de la table. */
  keys: string[];
  fullScreen?: string;
  rect?: Rect;
}

export function tableDmdWindow(doc: IniDocument): TableDmdWindow {
  const keys = doc
    .entries()
    .filter((e) => e.section.toLowerCase() === SECTION.toLowerCase() && PLACE_KEY.test(e.key) && e.value.trim() !== '')
    .map((e) => e.key);
  const num = (key: string) => {
    const raw = doc.get(SECTION, key)?.trim();
    const n = raw === undefined || raw === '' ? NaN : Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const [x, y, width, height] = [DRESS_KEYS.x, DRESS_KEYS.y, DRESS_KEYS.width, DRESS_KEYS.height].map(num);
  const result: TableDmdWindow = { keys };
  const fullScreen = doc.get(SECTION, DRESS_KEYS.fullScreen)?.trim();
  if (fullScreen) result.fullScreen = fullScreen;
  if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) result.rect = { x, y, width, height };
  return result;
}

const sameRect = (a: Rect | undefined, b: Rect | undefined) => !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** La place écrite est celle de l'habillage (record), sans rien d'autre : Cyber Pinball la gère. */
export function isDressWindow(current: TableDmdWindow, record: Rect | undefined): boolean {
  const ours = Object.values(DRESS_KEYS).map((k) => k.toLowerCase());
  return !!record && current.fullScreen === '0' && sameRect(current.rect, record) && current.keys.every((k) => ours.includes(k.toLowerCase()));
}

/** Ce qu'il advient de la fenêtre du DMD dans le .ini de la table avant la partie. */
export type DressState =
  /** Fenêtre posée (ou déplacée) dans le cadre. */
  | 'placed'
  /** Déjà à sa place, ou rien à faire. */
  | 'unchanged'
  /** Place réglée par l'utilisateur dans le menu de VPX : respectée. */
  | 'kept'
  /** Plus d'habillage : la place écrite par Cyber Pinball est retirée. */
  | 'restored';

export interface DressUpdate {
  state: DressState;
  /** Nouveau contenu du .ini ; undefined : rien à écrire. '' : le fichier n'a plus rien. */
  content?: string;
  /** Place à retenir dans le .info (CyberPinball.fullDmd.window) ; null : à oublier ; undefined : inchangée. */
  record?: Rect | null;
}

/**
 * Fenêtre du DMD dans le .ini de la table, d'après le plan d'habillage et la place que Cyber
 * Pinball y a écrite la dernière fois (record). Une place que l'utilisateur a réglée en partie
 * (menu de VPX, « Save as Table Override ») n'est jamais touchée : elle diffère de record.
 */
export function dressUpdate(iniText: string, plan: FullDmdPlan, record: Rect | undefined): DressUpdate {
  const doc = IniDocument.parse(iniText);
  const current = tableDmdWindow(doc);
  const ours = isDressWindow(current, record);
  if (plan.dressed) {
    if (current.keys.length && !ours) return { state: 'kept', record: record ? null : undefined };
    if (ours && sameRect(current.rect, plan.window)) return { state: 'unchanged' };
    doc.set(SECTION, DRESS_KEYS.fullScreen, '0');
    doc.set(SECTION, DRESS_KEYS.x, String(plan.window.x));
    doc.set(SECTION, DRESS_KEYS.y, String(plan.window.y));
    doc.set(SECTION, DRESS_KEYS.width, String(plan.window.width));
    doc.set(SECTION, DRESS_KEYS.height, String(plan.window.height));
    return { state: 'placed', content: doc.toString(), record: plan.window };
  }
  if (!ours) return { state: 'unchanged', record: record && !current.keys.length ? null : undefined };
  for (const key of Object.values(DRESS_KEYS)) doc.remove(SECTION, key);
  return { state: 'restored', content: doc.entries().length ? doc.toString() : '', record: null };
}

/** Place écrite par l'habillage, retenue dans le .info de la table. */
export function dressRecord(info: TableInfoFile): Rect | undefined {
  const own = info.CyberPinball as { fullDmd?: { window?: Rect } } | undefined;
  const w = own?.fullDmd?.window;
  return w && [w.x, w.y, w.width, w.height].every((v) => typeof v === 'number' && Number.isFinite(v)) ? { x: w.x, y: w.y, width: w.width, height: w.height } : undefined;
}

/** .info avec la place retenue (null : oubliée), tous les autres champs gardés. */
export function withDressRecord<T extends TableInfoFile>(info: T, record: Rect | null): T {
  const own = { ...((info.CyberPinball as Record<string, unknown> | undefined) ?? {}) };
  if (record) own.fullDmd = { window: record };
  else delete own.fullDmd;
  const next = { ...info } as T;
  if (Object.keys(own).length) (next as TableInfoFile).CyberPinball = own;
  else delete (next as TableInfoFile).CyberPinball;
  return next;
}

// ---------------------------------------------------------------------------
// Le DMD de la partie couvre-t-il l'habillage ?

/** Au-delà de cette part de l'habillage recouverte, le joueur ne le voit plus. */
export const DRESS_COVERED = 0.5;

/**
 * Part de l'habillage (la zone du DMD hors du cadre) qu'une fenêtre recouvre : 1 pour le défaut
 * signalé sur la borne (DMD étiré sur tout l'écran, 26 octobre 2026), 0 pour une fenêtre dans le cadre.
 */
export function dressCoverage(window: Rect, zone: Rect, frame: Rect): number {
  const overlap = (a: Rect, b: Rect) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const dressing = zone.width * zone.height - overlap(frame, zone);
  if (dressing <= 0) return 0;
  const left = Math.max(window.x, zone.x);
  const top = Math.max(window.y, zone.y);
  const clipped: Rect = { x: left, y: top, width: Math.max(0, Math.min(window.x + window.width, zone.x + zone.width) - left), height: Math.max(0, Math.min(window.y + window.height, zone.y + zone.height) - top) };
  return (clipped.width * clipped.height - overlap(clipped, frame)) / dressing;
}
