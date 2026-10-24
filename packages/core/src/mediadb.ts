// Téléchargement des médias depuis VPinMediaDB (tâche T10, docs/recherche/medias.md
// § 3.1, § 3.4 et § 5.5), à la demande de l'utilisateur seulement : jeu par jeu
// depuis le gestionnaire des médias, ou pour les tables à qui il en manque depuis le
// menu système.
//
// VPinMediaDB (github.com/superhac/vpinmediadb) range un dossier par identifiant VPS
// et publie un index, vpinmdb.json, qui donne pour chaque jeu l'adresse et le MD5 de
// chaque fichier. Le dépôt ne déclare aucune licence : Cyber Pinball n'en livre rien,
// le dit en clair au premier usage et dans chaque plan, et note la source de chaque
// fichier dans le .info (CyberPinball.medias.sources).
//
// Format de l'index relevé le 21/10/2026 (1 156 jeux, 1,7 Mo) :
//   { "<idVPS>": { "1k": { "bg", "dmd", "table", "fss", "table_video", "dmd_video" },
//                  "4k": { "table", "fss" },
//                  "wheel", "cab", "flyer", "audio", "realdmd", "realdmd_color",
//                  "version" } }
// chaque adresse étant suivie de sa somme « <clé>_md5 ». Seuls le plateau (table) et
// l'image pour un seul écran (fss) existent en 4k.
//
// Rien n'arrive dans medias\ avant d'être complet et vérifié : chaque fichier est
// reçu sous un nom provisoire dans <racine>\downloads\vpinmediadb, son MD5 comparé à
// celui de l'index, puis seulement rangé ; un téléchargement interrompu ou invalide
// est effacé. Un média remplacé part à la corbeille.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyOps, samePath, type FileOp } from './fileops';
import { formatDate, formatNumber, t } from './i18n';
import type { Cabinet } from './model';
import { mediaCompetitors, ownMediaPages } from './mediaedit';
import {
  isAcceptedFormat,
  mediaFileName,
  mediaKind,
  mediaMemory,
  mediaTypeInfo,
  setMediaMemory,
  tableMediaDir,
  type MediaKind,
  type MediaMemory,
  type MediaOrigin,
  type MediaType,
  type ResolveOptions,
} from './medias';
import { readInfo, type TableEntry } from './tables';
import { matchVps, vpsLabel, vpsSiblings, type VpsDb, type VpsGame } from './vps';
import { roleZone } from './zones';

// ---------------------------------------------------------------------------
// Source et avertissement

export const MEDIADB_NAME = 'VPinMediaDB';
export const MEDIADB_REPO = 'superhac/vpinmediadb';
export const MEDIADB_REPO_URL = 'https://github.com/superhac/vpinmediadb';
export const MEDIADB_INDEX_URL = 'https://raw.githubusercontent.com/superhac/vpinmediadb/main/vpinmdb.json';

/**
 * Avertissement en français, tel qu'il est noté dans <données>\mediadb.json avec la date
 * d'acceptation (texte de référence, qui ne suit pas la langue). À l'écran : mediaDbNotice().
 */
export const MEDIADB_NOTICE =
  'VPinMediaDB ne déclare aucune licence : ses médias appartiennent à leurs auteurs, et les images des jeux à leurs fabricants. Usage personnel, sur votre borne seulement : ne les redistribuez pas.'; // i18n-ignore : texte de référence noté dans mediadb.json ; à l'écran, mediaDbNotice()

/** Avertissement montré au premier usage et en tête de chaque plan, dans la langue de l'interface. */
export function mediaDbNotice(): string {
  return t('VPinMediaDB ne déclare aucune licence : ses médias appartiennent à leurs auteurs, et les images des jeux à leurs fabricants. Usage personnel, sur votre borne seulement : ne les redistribuez pas.');
}

/** « VPinMediaDB (github.com/superhac/vpinmediadb) », pour citer la source. */
export const MEDIADB_CITATION = `${MEDIADB_NAME} (${MEDIADB_REPO_URL.replace(/^https:\/\//, '')})`;

/** D'où viennent l'index et les fichiers ; les tests le remplacent par un serveur local. */
export interface MediaDbSource {
  indexUrl: string;
  /** Débuts d'adresse acceptés pour un fichier : un index altéré ne fait rien télécharger d'ailleurs. */
  filePrefixes: string[];
}

export const MEDIADB_SOURCE: MediaDbSource = {
  indexUrl: MEDIADB_INDEX_URL,
  filePrefixes: [`${MEDIADB_REPO_URL}/`, `https://raw.githubusercontent.com/${MEDIADB_REPO}/`],
};

export const MEDIADB_INDEX_FILE = 'vpinmdb.json';
const META_FILE = 'vpinmdb.meta.json';
const SIZES_FILE = 'vpinmdb.sizes.json';
/** Dossier de réception, sous downloads : fichiers en cours et aperçus vérifiés. */
export const MEDIADB_STAGING_DIR = 'vpinmediadb';

/** Au-delà, on demande à GitHub si l'index a changé (réponse 304 s'il n'a pas changé). */
const CHECK_EVERY_MS = 12 * 3600_000;
/** Sans aucun octet reçu pendant ce temps, le téléchargement est abandonné. */
const STALL_MS = 30_000;

// ---------------------------------------------------------------------------
// Index

export type MediaDbQuality = '1k' | '4k';

export interface MediaDbFile {
  url: string;
  /** Somme MD5 donnée par l'index (32 caractères hexadécimaux en minuscules). */
  md5?: string;
}

export interface MediaDbEntry {
  /** Identifiant VPS du jeu. */
  id: string;
  /** Version du dossier selon l'index (change quand un fichier change). */
  version?: string;
  /** Fichiers par clé : « 1k/table », « 4k/table », « wheel »… */
  files: Record<string, MediaDbFile>;
}

export interface MediaDb {
  entries: Map<string, MediaDbEntry>;
  /** Date du téléchargement de l'index en cache. */
  downloadedAt?: Date;
  /** Dernière fois que GitHub a confirmé l'index. */
  checkedAt?: Date;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{2,40}$/;
const MD5_PATTERN = /^[0-9a-f]{32}$/i;
const QUALITIES: readonly MediaDbQuality[] = ['1k', '4k'];

/**
 * Index lu d'un objet quelconque. Les entrées et adresses invalides sont ignorées :
 * identifiant qui n'en est pas un, adresse hors du dépôt, MD5 mal formé (le fichier
 * est alors gardé, sans vérification possible). undefined si rien n'est utilisable.
 */
export function parseMediaDbIndex(raw: unknown, source: MediaDbSource = MEDIADB_SOURCE): MediaDb | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const entries = new Map<string, MediaDbEntry>();
  const allowed = (url: unknown): url is string => typeof url === 'string' && source.filePrefixes.some((p) => url.startsWith(p)) && !url.includes('..');
  const md5Of = (group: Record<string, unknown>, key: string) => {
    const value = group[`${key}_md5`];
    return typeof value === 'string' && MD5_PATTERN.test(value) ? value.toLowerCase() : undefined;
  };
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ID_PATTERN.test(id) || !value || typeof value !== 'object') continue;
    const game = value as Record<string, unknown>;
    const files: Record<string, MediaDbFile> = {};
    const add = (group: Record<string, unknown>, prefix: string) => {
      for (const [key, url] of Object.entries(group)) {
        if (key.endsWith('_md5') || key === 'version' || !allowed(url)) continue;
        files[prefix + key] = { url, md5: md5Of(group, key) };
      }
    };
    add(game, '');
    for (const q of QUALITIES) {
      const group = game[q];
      if (group && typeof group === 'object') add(group as Record<string, unknown>, `${q}/`);
    }
    if (!Object.keys(files).length) continue;
    entries.set(id, { id, version: typeof game.version === 'string' ? game.version : undefined, files });
  }
  return entries.size ? { entries } : undefined;
}

interface Meta {
  etag?: string;
  downloadedAt?: string;
  checkedAt?: string;
  indexUrl?: string;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

function readMeta(downloadsDir: string): Meta {
  try {
    return readJson(path.join(downloadsDir, META_FILE)) as Meta;
  } catch {
    return {};
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** Index en cache dans downloads, ou undefined s'il n'a jamais été téléchargé (ou est illisible). */
export function loadMediaDb(downloadsDir: string, source: MediaDbSource = MEDIADB_SOURCE): MediaDb | undefined {
  const file = path.join(downloadsDir, MEDIADB_INDEX_FILE);
  try {
    const db = parseMediaDbIndex(readJson(file), source);
    if (!db) return undefined;
    const meta = readMeta(downloadsDir);
    db.downloadedAt = meta.downloadedAt ? new Date(meta.downloadedAt) : fs.statSync(file).mtime;
    if (meta.checkedAt) db.checkedAt = new Date(meta.checkedAt);
    return db;
  } catch {
    return undefined;
  }
}

export interface MediaDbRefreshOptions {
  /** Pour les tests : fetch de remplacement. */
  fetch?: typeof fetch;
  now?: Date;
  /** Vérifie même si la dernière vérification a moins de 12 heures. */
  force?: boolean;
  timeoutMs?: number;
  source?: MediaDbSource;
}

export type MediaDbRefreshStatus = 'fresh' | 'unchanged' | 'updated' | 'offline';

export interface MediaDbRefresh {
  status: MediaDbRefreshStatus;
  /** Raison de l'échec (sans réseau, réponse invalide…). */
  message?: string;
}

/**
 * Met à jour l'index en cache, au plus toutes les 12 heures : GitHub répond 304 s'il
 * n'a pas changé (ETag). Ne lève jamais d'erreur : sans réseau, ou si la réponse est
 * invalide, le cache existant reste tel quel et sert.
 */
export async function refreshMediaDb(downloadsDir: string, opts: MediaDbRefreshOptions = {}): Promise<MediaDbRefresh> {
  const source = opts.source ?? MEDIADB_SOURCE;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? new Date();
  const file = path.join(downloadsDir, MEDIADB_INDEX_FILE);
  const meta = readMeta(downloadsDir);
  // L'index d'une autre adresse (essais) ne vaut pas pour celle-ci.
  const cached = fs.existsSync(file) && (meta.indexUrl ?? source.indexUrl) === source.indexUrl;
  if (cached && !opts.force && meta.checkedAt && now.getTime() - Date.parse(meta.checkedAt) < CHECK_EVERY_MS) return { status: 'fresh' };
  try {
    const headers: Record<string, string> = {};
    if (cached && meta.etag) headers['If-None-Match'] = meta.etag;
    const response = await doFetch(source.indexUrl, { headers, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
    if (response.status === 304 && cached) {
      writeJsonAtomic(path.join(downloadsDir, META_FILE), { ...meta, checkedAt: now.toISOString() });
      return { status: 'unchanged' };
    }
    if (!response.ok) throw new Error(t('HTTP {status} pour {url}', { status: response.status, url: source.indexUrl }));
    const text = await response.text();
    if (!parseMediaDbIndex(JSON.parse(text), source)) throw new Error(t('l’index téléchargé n’a pas le format attendu'));
    fs.mkdirSync(downloadsDir, { recursive: true });
    const part = `${file}.part`;
    fs.writeFileSync(part, text, 'utf8');
    fs.renameSync(part, file);
    writeJsonAtomic(path.join(downloadsDir, META_FILE), {
      etag: response.headers.get('etag') ?? undefined,
      downloadedAt: now.toISOString(),
      checkedAt: now.toISOString(),
      indexUrl: source.indexUrl,
    } satisfies Meta);
    return { status: 'updated' };
  } catch (error) {
    const err = error as Error;
    return { status: 'offline', message: err.name === 'TimeoutError' ? t('GitHub ne répond pas') : err.message };
  }
}

// ---------------------------------------------------------------------------
// Avertissement lu une fois

/** <données>\mediadb.json : date à laquelle l'avertissement a été lu et accepté. */
export function mediaDbNoticeFile(dataDir: string): string {
  return path.join(dataDir, 'mediadb.json');
}

/** Date d'acceptation de l'avertissement, ou undefined s'il n'a jamais été montré. */
export function mediaDbNoticeAccepted(dataDir: string): string | undefined {
  try {
    const accepted = (readJson(mediaDbNoticeFile(dataDir)) as { noticeAcceptedAt?: unknown }).noticeAcceptedAt;
    return typeof accepted === 'string' ? accepted : undefined;
  } catch {
    return undefined;
  }
}

export function acceptMediaDbNotice(dataDir: string, now = new Date()): void {
  writeJsonAtomic(mediaDbNoticeFile(dataDir), { noticeAcceptedAt: now.toISOString(), notice: MEDIADB_NOTICE, source: MEDIADB_REPO_URL });
}

// ---------------------------------------------------------------------------
// 1k ou 4k

/** Réglage global (MenuMediaSettings.downloadQuality) : d'après l'écran, ou imposé. */
export type MediaDbQualitySetting = 'auto' | MediaDbQuality;

export const MEDIADB_QUALITY_SETTINGS: readonly MediaDbQualitySetting[] = ['auto', '1k', '4k'];

export const MEDIADB_QUALITY_LABELS: Record<MediaDbQualitySetting, string> = {
  get auto() {
    return t('automatique');
  },
  '1k': '1k',
  '4k': '4k',
};

/** Plus grand côté de l'écran du plateau au-delà duquel on prend le 4k (un écran 4K en a 3 840). */
export const MEDIADB_4K_ABOVE = 2560;

export interface MediaDbQualityChoice {
  quality: MediaDbQuality;
  /** Pourquoi, en clair : « écran du plateau 3 840 × 2 160 », « imposé par le réglage ». */
  reason: string;
}

/**
 * Qualité téléchargée : imposée par le réglage, sinon d'après la taille, dans la
 * configuration active, de la zone du rôle playfield (seul le plateau existe en 4k).
 */
export function mediaDbQuality(setting: MediaDbQualitySetting, cabinet?: Cabinet): MediaDbQualityChoice {
  if (setting === '1k' || setting === '4k') return { quality: setting, reason: t('imposé par le réglage « Qualité téléchargée »') };
  const fingerprint = cabinet?.roles.playfield;
  const screen = fingerprint ? cabinet!.screens.find((s) => s.fingerprint === fingerprint) : undefined;
  if (!screen) return { quality: '1k', reason: t('pas d’écran du plateau dans le modèle de borne') };
  const zone = roleZone(cabinet!, 'playfield');
  const width = Math.round(screen.widthPx * zone.width);
  const height = Math.round(screen.heightPx * zone.height);
  const size = t('écran du plateau {width} × {height}', { width: formatNumber(width), height: formatNumber(height) });
  return Math.max(width, height) > MEDIADB_4K_ABOVE ? { quality: '4k', reason: size } : { quality: '1k', reason: t('{size} : le 1k suffit', { size }) };
}

// ---------------------------------------------------------------------------
// Correspondance avec une table

export type MediaDbHow = 'vps-id' | 'vps-sibling' | 'vps-title' | 'deep';

export const MEDIADB_HOW_LABELS: Record<MediaDbHow, string> = {
  get 'vps-id'() {
    return t('l’identifiant VPS du .info');
  },
  get 'vps-sibling'() {
    return t('une autre édition du jeu de l’identifiant VPS');
  },
  get 'vps-title'() {
    return t('le nom de la table (titre, initiales, fabricant, année)');
  },
  get deep() {
    return t('la recherche approfondie');
  },
};

export interface MediaDbCandidate {
  entry: MediaDbEntry;
  game?: VpsGame;
  /** Pourquoi ce jeu, en clair (recherche approfondie). */
  reasons?: string[];
}

export interface MediaDbMatch {
  /** Jeux de VPinMediaDB qui peuvent convenir, le plus probable d'abord. */
  candidates: MediaDbCandidate[];
  how?: MediaDbHow;
  /** Le premier est sûr : identifiant VPS du .info, ou titre reconnu sans hésitation. */
  confident: boolean;
  /** Identifiant VPS lu dans le .info. */
  vpsId?: string;
  /** Pourquoi rien n'est trouvé, en clair. */
  reason?: string;
}

/**
 * Jeu de VPinMediaDB pour une table : par l'identifiant VPS du .info, sinon par le
 * titre, le fabricant et l'année rapprochés de la base VPS (qui donne l'identifiant).
 * Un identifiant VPS connu mais absent de VPinMediaDB ne mène pas à un autre jeu.
 */
export function matchMediaDb(db: MediaDb, table: TableEntry, vps?: VpsDb): MediaDbMatch {
  const vpsId = typeof table.info.Info?.VPSId === 'string' ? table.info.Info.VPSId.trim() : '';
  if (vpsId) {
    const entry = db.entries.get(vpsId);
    const game = vps?.games.find((g) => g.id === vpsId);
    if (entry) return { candidates: [{ entry, game }], how: 'vps-id', confident: true, vpsId };
    // Pas de médias pour cette édition : les autres éditions du même jeu (Pro, Premium, LE) ont souvent les mêmes images.
    const siblings = game && vps ? vpsSiblings(vps, game).flatMap((g) => (db.entries.has(g.id) ? [{ entry: db.entries.get(g.id)!, game: g, reasons: [t('autre édition de {game}', { game: vpsLabel(game) })] }] : [])) : [];
    if (siblings.length) return { candidates: siblings, how: 'vps-sibling', confident: false, vpsId };
    return { candidates: [], confident: false, vpsId, reason: t('VPinMediaDB n’a pas de médias pour ce jeu (identifiant VPS {id}).', { id: vpsId }) };
  }
  if (!vps) return { candidates: [], confident: false, reason: t('Ce jeu n’a pas d’identifiant VPS, et la base VPS n’est pas disponible pour le reconnaître à son titre.') };
  const label = table.manufacturer && table.year ? `${table.title} (${table.manufacturer} ${table.year})` : table.title;
  const names = [label, path.basename(table.file), ...(table.id.includes('/') ? [path.basename(table.folder)] : [])];
  const m = matchVps(vps, { names });
  const candidates = m.candidates.flatMap((c) => {
    const entry = db.entries.get(c.game.id);
    return entry ? [{ entry, game: c.game }] : [];
  });
  if (!candidates.length) {
    return {
      candidates,
      confident: false,
      reason: m.candidates.length ? t('VPinMediaDB n’a pas de médias pour {game}.', { game: vpsLabel(m.candidates[0]!.game) }) : t('Aucun jeu de la base VPS ne ressemble à ce titre.'),
    };
  }
  return { candidates, how: 'vps-title', confident: m.confident && candidates[0]!.entry.id === m.candidates[0]!.game.id };
}

// ---------------------------------------------------------------------------
// Ce que VPinMediaDB propose, type par type

interface AssetRule {
  /** Clé de l'index, sans le dossier de qualité. */
  key: string;
  /** Existe en 1k et en 4k : la qualité choisie d'abord, l'autre sinon. */
  byQuality?: boolean;
  /** Image du même média, plus légère, pour l'aperçu d'une vidéo ou d'une image 4k. */
  preview?: string;
}

/**
 * Correspondance avec nos types, la variante préférée d'abord : une vidéo avant
 * l'image, comme dans le catalogue (« un écran animé : la vidéo d'abord »).
 * dmd.png est un FullDMD 16:9 (§ 3.1). Non repris : cab (photo du meuble), fss
 * (plateau et fronton sur un seul écran), realdmd (DMD physique, ignoré chez nous).
 */
const RULES: readonly { type: MediaType; variants: readonly AssetRule[] }[] = [
  { type: 'Wheel', variants: [{ key: 'wheel' }] },
  { type: 'Playfield', variants: [{ key: 'table_video', preview: 'table' }, { key: 'table', byQuality: true, preview: 'table' }] },
  { type: 'Backglass', variants: [{ key: 'bg' }] },
  { type: 'FullDMD', variants: [{ key: 'dmd_video', preview: 'dmd' }, { key: 'dmd' }] },
  { type: 'GameInfo', variants: [{ key: 'flyer' }] },
  { type: 'Audio', variants: [{ key: 'audio' }] },
];

/** Types que VPinMediaDB peut fournir, dans l'ordre du gestionnaire. */
export const MEDIADB_TYPES: readonly MediaType[] = RULES.map((r) => r.type);

export interface MediaDbOffer {
  type: MediaType;
  /** Clé de l'index : « 4k/table », « wheel »… */
  key: string;
  file: MediaDbFile;
  kind: MediaKind;
  ext: string;
  /** Dossier de qualité du fichier ; absent pour les fichiers sans variante (logo, prospectus…). */
  quality?: MediaDbQuality;
  /** Image légère du même média (1k), pour l'aperçu ; absent pour le son. */
  preview?: MediaDbFile;
}

function extOfUrl(url: string): string {
  return path.posix.extname(new URL(url).pathname).slice(1).toLowerCase();
}

/** Fichier d'une clé, en préférant la qualité demandée ; undefined s'il n'existe pas. */
function lookup(entry: MediaDbEntry, key: string, quality: MediaDbQuality, byQuality = false): { key: string; file: MediaDbFile; quality?: MediaDbQuality } | undefined {
  const order = byQuality ? [quality, quality === '1k' ? '4k' : '1k'] : ['1k', '4k'];
  for (const q of order) {
    const file = entry.files[`${q}/${key}`];
    if (file) return { key: `${q}/${key}`, file, quality: byQuality ? (q as MediaDbQuality) : undefined };
  }
  const file = entry.files[key];
  return file ? { key, file } : undefined;
}

/** Variantes disponibles pour chaque type, la préférée d'abord ; les types absents du jeu sont omis. */
export function mediaDbOffers(entry: MediaDbEntry, quality: MediaDbQuality): { type: MediaType; variants: MediaDbOffer[] }[] {
  const out: { type: MediaType; variants: MediaDbOffer[] }[] = [];
  for (const rule of RULES) {
    const variants: MediaDbOffer[] = [];
    for (const v of rule.variants) {
      const found = lookup(entry, v.key, quality, v.byQuality);
      if (!found) continue;
      const ext = extOfUrl(found.file.url);
      const kind = mediaKind(`x.${ext}`);
      if (!kind || !isAcceptedFormat(rule.type, `x.${ext}`)) continue;
      const preview = kind === 'audio' ? undefined : v.preview ? (lookup(entry, v.preview, '1k', true)?.file ?? (kind === 'image' ? found.file : undefined)) : found.file;
      variants.push({ type: rule.type, key: found.key, file: found.file, kind, ext, quality: found.quality, preview });
    }
    if (variants.length) out.push({ type: rule.type, variants });
  }
  return out;
}

/** « vidéo », « image 4k », « son », pour le plan. */
export function mediaDbOfferLabel(offer: MediaDbOffer): string {
  const kind = offer.kind === 'video' ? t('vidéo') : offer.kind === 'audio' ? t('son') : t('image');
  return offer.quality ? `${kind} ${offer.quality}` : kind;
}

// ---------------------------------------------------------------------------
// Proposition pour une table

export interface MediaDbProposal {
  type: MediaType;
  variants: MediaDbOffer[];
  /** Variante retenue par défaut ; undefined : rien (le jeu a déjà son média, ou il est à jour). */
  selected?: number;
  /** Fichiers du jeu montrés aujourd'hui pour ce type (medias\ seulement, pas les replis). */
  current: string[];
  /** Fichiers qui partent à la corbeille si l'on télécharge : celui d'aujourd'hui et les autres de ce type au nom du jeu. */
  replaces: string[];
  /** Le fichier d'aujourd'hui vient déjà de VPinMediaDB, avec le même contenu. */
  upToDate: boolean;
  /** Le fichier d'aujourd'hui vient de VPinMediaDB, qui en a une autre version. */
  update: boolean;
  /** Provenance du fichier d'aujourd'hui, notée lors d'un téléchargement précédent. */
  origin?: MediaOrigin;
}

export interface MediaDbProposeOptions {
  root: string;
  /** Proposer seulement les types que le jeu n'a pas (menu système : jamais de remplacement). */
  missingOnly?: boolean;
  resolve?: ResolveOptions;
}

/**
 * Ce que VPinMediaDB peut apporter à une table, type par type, et ce qui serait
 * retenu par défaut : les types qui manquent, et les fichiers déjà venus de
 * VPinMediaDB dont le contenu a changé. Un média que l'utilisateur a mis lui-même
 * n'est jamais retenu d'office : le plan propose de le remplacer, en le disant.
 */
export function proposeMediaDb(table: TableEntry, entry: MediaDbEntry, quality: MediaDbQuality, opts: MediaDbProposeOptions): MediaDbProposal[] {
  const memory = mediaMemory(table.info);
  const out: MediaDbProposal[] = [];
  for (const { type, variants } of mediaDbOffers(entry, quality)) {
    const current = ownMediaPages(table, opts.root, type, opts.resolve);
    if (opts.missingOnly && current.length) continue;
    const replaces = [...new Map([...current, ...mediaCompetitors(table, type)].map((f) => [f.toLowerCase(), f])).values()];
    const origin = originOf(memory, type);
    const fromDb = Boolean(origin && origin.origin === MEDIADB_NAME && current.length === 1 && (!origin.file || path.basename(current[0]!) === origin.file));
    const upToDate = fromDb && variants.some((v) => v.file.md5 !== undefined && v.file.md5 === origin!.md5);
    // Même variante qu'au dernier téléchargement (vidéo ou image, 1k ou 4k), contenu changé sur le dépôt.
    const sameKey = fromDb && !upToDate ? variants.findIndex((v) => v.key === origin!.key) : -1;
    const selected = !current.length ? 0 : sameKey >= 0 ? sameKey : undefined;
    out.push({ type, variants, selected, current, replaces, upToDate, update: sameKey >= 0, origin });
  }
  return out;
}

function originOf(memory: MediaMemory, type: MediaType): MediaOrigin | undefined {
  const value = memory.sources?.[type];
  return value && typeof value === 'object' && typeof value.origin === 'string' && typeof value.url === 'string' ? value : undefined;
}

/**
 * Provenance notée pour ce fichier de la table, s'il vient d'un téléchargement ;
 * undefined si le fichier a été remplacé depuis par un autre (nom différent).
 */
export function mediaOriginOf(table: TableEntry, type: MediaType, file: string | undefined): MediaOrigin | undefined {
  const origin = originOf(mediaMemory(table.info), type);
  if (!origin || !file) return undefined;
  return !origin.file || origin.file.toLowerCase() === path.basename(file).toLowerCase() ? origin : undefined;
}

/** « VPinMediaDB (github.com/superhac/vpinmediadb), téléchargé le 21/10/2026 » */
export function mediaOriginLabel(origin: MediaOrigin): string {
  const date = new Date(origin.date);
  const source = origin.origin === MEDIADB_NAME ? MEDIADB_CITATION : origin.origin;
  if (Number.isNaN(date.getTime())) return source;
  return t('{source}, téléchargé le {date}', { source, date: formatDate(date, { day: '2-digit', month: '2-digit', year: 'numeric' }) });
}

// ---------------------------------------------------------------------------
// Poids des fichiers

export interface MediaDbSizeOptions {
  fetch?: typeof fetch;
  /** Fichier de cache des tailles (par MD5), dans downloads. */
  downloadsDir?: string;
  concurrency?: number;
  timeoutMs?: number;
  onProgress?(done: number, total: number): void;
}

/**
 * Poids de chaque fichier, demandé à GitHub (requête HEAD, sans rien télécharger) et
 * gardé par MD5 dans downloads. Un fichier dont la taille est inconnue (sans réseau)
 * est absent du résultat.
 */
export async function mediaDbSizes(files: MediaDbFile[], opts: MediaDbSizeOptions = {}): Promise<Map<string, number>> {
  const doFetch = opts.fetch ?? fetch;
  const cacheFile = opts.downloadsDir ? path.join(opts.downloadsDir, SIZES_FILE) : undefined;
  let cache: Record<string, number> = {};
  if (cacheFile) {
    try {
      cache = readJson(cacheFile) as Record<string, number>;
    } catch {
      cache = {};
    }
  }
  const out = new Map<string, number>();
  const unique = [...new Map(files.map((f) => [f.url, f])).values()];
  const todo: MediaDbFile[] = [];
  for (const f of unique) {
    const known = f.md5 ? cache[f.md5] : undefined;
    if (typeof known === 'number' && known > 0) out.set(f.url, known);
    else todo.push(f);
  }
  let done = unique.length - todo.length;
  opts.onProgress?.(done, unique.length);
  let changed = false;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const f = todo[next++]!;
      try {
        const response = await doFetch(f.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
        const size = Number(response.headers.get('content-length'));
        if (response.ok && Number.isFinite(size) && size > 0) {
          out.set(f.url, size);
          if (f.md5) {
            cache[f.md5] = size;
            changed = true;
          }
        }
      } catch {
        // Sans réseau : taille inconnue, le plan le dit.
      }
      opts.onProgress?.(++done, unique.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, todo.length)) }, worker));
  if (cacheFile && changed) writeJsonAtomic(cacheFile, cache);
  return out;
}

// ---------------------------------------------------------------------------
// Téléchargement vérifié

export interface MediaDbDownloadOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Sans octet reçu pendant ce temps, abandon (30 s par défaut). */
  stallMs?: number;
  onData?(received: number, total: number | undefined): void;
}

export class MediaDbDownloadError extends Error {
  constructor(
    message: string,
    readonly reason: 'network' | 'http' | 'md5' | 'size' | 'aborted',
  ) {
    super(message);
  }
}

function md5OfFile(file: string): string {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Télécharge un fichier vers `dest` : reçu sous « dest.part », taille et MD5 vérifiés,
 * puis renommé. En cas d'échec (réseau, réponse HTTP, taille, MD5, abandon), le
 * fichier partiel est effacé : il ne reste rien, et une MediaDbDownloadError est levée.
 */
export async function downloadMediaDbFile(file: MediaDbFile, dest: string, opts: MediaDbDownloadOptions = {}): Promise<{ size: number; md5: string }> {
  const doFetch = opts.fetch ?? fetch;
  const part = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const stall = new AbortController();
  const signal = opts.signal ? AbortSignal.any([opts.signal, stall.signal]) : stall.signal;
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => stall.abort(new MediaDbDownloadError(t('plus rien ne vient de GitHub'), 'network')), opts.stallMs ?? STALL_MS);
  };
  let handle: fs.promises.FileHandle | undefined;
  try {
    arm();
    let response: Response;
    try {
      response = await doFetch(file.url, { redirect: 'follow', signal });
    } catch (error) {
      throw toDownloadError(error, signal);
    }
    if (!response.ok || !response.body) throw new MediaDbDownloadError(`HTTP ${response.status}`, 'http');
    const header = Number(response.headers.get('content-length'));
    const total = Number.isFinite(header) && header > 0 ? header : undefined;
    const hash = crypto.createHash('md5');
    handle = await fs.promises.open(part, 'w');
    let received = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        hash.update(value);
        await handle.write(value);
        received += value.byteLength;
        opts.onData?.(received, total);
      }
    } catch (error) {
      throw toDownloadError(error, signal);
    }
    await handle.close();
    handle = undefined;
    if (total !== undefined && received !== total) throw new MediaDbDownloadError(t('reçu {received} octets sur {total}', { received: formatNumber(received), total: formatNumber(total) }), 'size');
    const md5 = hash.digest('hex');
    if (file.md5 && md5 !== file.md5) throw new MediaDbDownloadError(t('somme MD5 différente de celle de l’index : fichier abîmé ou modifié sur le dépôt'), 'md5');
    fs.rmSync(dest, { force: true });
    fs.renameSync(part, dest);
    return { size: received, md5 };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    fs.rmSync(part, { force: true });
    throw error instanceof MediaDbDownloadError ? error : toDownloadError(error, signal);
  } finally {
    clearTimeout(timer);
  }
}

function toDownloadError(error: unknown, signal: AbortSignal): MediaDbDownloadError {
  if (error instanceof MediaDbDownloadError) return error;
  if (signal.aborted && signal.reason instanceof MediaDbDownloadError) return signal.reason;
  if (signal.aborted) return new MediaDbDownloadError(t('téléchargement annulé'), 'aborted');
  return new MediaDbDownloadError((error as Error)?.message ?? String(error), 'network');
}

/** Dossier de réception : <downloads>\vpinmediadb. */
export function mediaDbStagingDir(downloadsDir: string): string {
  return path.join(downloadsDir, MEDIADB_STAGING_DIR);
}

/** Fichier reçu et vérifié, nommé d'après son MD5 (ou son adresse) : un aperçu déjà reçu sert au téléchargement. */
export function mediaDbStagedFile(stagingDir: string, file: MediaDbFile): string {
  const name = file.md5 ?? crypto.createHash('md5').update(file.url).digest('hex');
  return path.join(stagingDir, `${name}.${extOfUrl(file.url) || 'bin'}`);
}

/**
 * Le fichier, reçu une fois et vérifié, dans le dossier de réception ; réutilisé
 * s'il y est déjà avec le bon MD5 (aperçu reçu pour le plan).
 */
export async function stageMediaDbFile(stagingDir: string, file: MediaDbFile, opts: MediaDbDownloadOptions = {}): Promise<{ path: string; size: number; md5: string; reused: boolean }> {
  const dest = mediaDbStagedFile(stagingDir, file);
  if (fs.existsSync(dest)) {
    const md5 = md5OfFile(dest);
    if (!file.md5 || md5 === file.md5) return { path: dest, size: fs.statSync(dest).size, md5, reused: true };
    fs.rmSync(dest, { force: true });
  }
  const got = await downloadMediaDbFile(file, dest, opts);
  return { path: dest, ...got, reused: false };
}

/**
 * Vide le dossier de réception : fichiers partiels d'un téléchargement interrompu
 * (arrêt de la borne), et aperçus de plus d'un jour ou de ceux donnés.
 */
export function cleanMediaDbStaging(stagingDir: string, opts: { keep?: string[]; now?: Date; remove?: string[] } = {}): void {
  const now = (opts.now ?? new Date()).getTime();
  let names: string[];
  try {
    names = fs.readdirSync(stagingDir);
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(stagingDir, name);
    if (opts.keep?.some((k) => samePath(k, file))) continue;
    let old = false;
    try {
      old = now - fs.statSync(file).mtimeMs > 24 * 3600_000;
    } catch {
      continue;
    }
    if (name.endsWith('.part') || old || opts.remove?.some((r) => samePath(r, file))) fs.rmSync(file, { force: true, recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Rangement dans la table

export interface MediaDbChoice {
  offer: MediaDbOffer;
  /** Fichiers du jeu qui partent à la corbeille (MediaDbProposal.replaces). */
  replaces: string[];
}

export interface MediaDbInstallContext {
  /** Fichier .info de la table (infoFileFor), lu et réécrit avec ses autres champs. */
  infoFile: string;
  trashDir: string;
  stagingDir: string;
  /** Identifiant VPS du jeu de VPinMediaDB, noté avec la source. */
  entry: MediaDbEntry;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  now?: Date;
  /** Avant chaque fichier, puis à chaque morceau reçu. */
  onProgress?(p: { index: number; total: number; type: MediaType; received: number; size?: number }): void;
}

export interface MediaDbInstalled {
  type: MediaType;
  file: string;
  size: number;
  /** Fichiers mis à la corbeille. */
  trashed: string[];
}

export interface MediaDbInstallResult {
  installed: MediaDbInstalled[];
  failed: { type: MediaType; reason: string }[];
  /** .info réécrit (sources, demi-tour retiré). */
  infoFile?: string;
}

/**
 * Télécharge les médias choisis, un par un pour un débit modéré, et range chacun
 * dès qu'il est vérifié : les anciens fichiers de ce type à la corbeille, le nouveau
 * sous « (Type) <nom du dossier>.ext ». Un échec n'empêche pas les suivants et ne
 * laisse rien. Puis le .info note la source de chaque fichier rangé (origine,
 * adresse, date, MD5) et retire le demi-tour forcé d'un plateau remplacé : le
 * nouveau fichier suit le standard (paysage, flippers à droite), que le menu tourne
 * de lui-même.
 */
export async function installMediaDb(table: TableEntry, choices: MediaDbChoice[], ctx: MediaDbInstallContext): Promise<MediaDbInstallResult> {
  const installed: MediaDbInstalled[] = [];
  const failed: { type: MediaType; reason: string }[] = [];
  const total = choices.length;
  for (const [index, choice] of choices.entries()) {
    const { offer } = choice;
    ctx.onProgress?.({ index, total, type: offer.type, received: 0 });
    let staged: Awaited<ReturnType<typeof stageMediaDbFile>>;
    try {
      staged = await stageMediaDbFile(ctx.stagingDir, offer.file, {
        fetch: ctx.fetch,
        signal: ctx.signal,
        onData: (received, size) => ctx.onProgress?.({ index, total, type: offer.type, received, size }),
      });
    } catch (error) {
      failed.push({ type: offer.type, reason: (error as Error).message });
      if (ctx.signal?.aborted) break;
      continue;
    }
    const target = path.join(tableMediaDir(table), mediaFileName(table, offer.type, offer.ext));
    const ops: FileOp[] = choice.replaces.filter((f) => fs.existsSync(f)).map((f) => ({ op: 'trash', path: f }));
    ops.push({ op: 'move', from: staged.path, to: target });
    try {
      applyOps(ops, { trashDir: ctx.trashDir });
    } catch (error) {
      fs.rmSync(staged.path, { force: true });
      failed.push({ type: offer.type, reason: t('rangement impossible : {message}', { message: (error as Error).message }) });
      continue;
    }
    installed.push({ type: offer.type, file: target, size: staged.size, trashed: ops.filter((o) => o.op === 'trash').map((o) => (o as { path: string }).path) });
  }
  if (!installed.length) return { installed, failed };
  const info = readInfo(ctx.infoFile);
  const memory = mediaMemory(info);
  const date = (ctx.now ?? new Date()).toISOString();
  const sources: NonNullable<MediaMemory['sources']> = { ...memory.sources };
  const turns = { ...memory.halfTurn };
  for (const done of installed) {
    const offer = choices.find((c) => c.offer.type === done.type)!.offer;
    sources[done.type] = {
      origin: MEDIADB_NAME,
      url: offer.file.url,
      date,
      vpsId: ctx.entry.id,
      key: offer.key,
      md5: offer.file.md5,
      file: path.basename(done.file),
    };
    if (mediaTypeInfo(done.type).orientable) delete turns[done.type];
  }
  const next: MediaMemory = { ...memory, sources };
  if (Object.keys(turns).length) next.halfTurn = turns;
  else delete next.halfTurn;
  applyOps([{ op: 'write', path: ctx.infoFile, content: JSON.stringify(setMediaMemory(info, next), null, 2) + '\n' }], { trashDir: ctx.trashDir });
  return { installed, failed, infoFile: ctx.infoFile };
}
