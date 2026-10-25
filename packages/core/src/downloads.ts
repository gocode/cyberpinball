// Téléchargements de Cyber Pinball : tout ce qui a été téléchargé aboutit sous
// <racine>\downloads, rangé par provenance :
//   acquisition\               fenêtre « Récupérer » et téléchargement direct (liste d'attente)
//   sites\<site>-<fiche>\fichiers\   médias des sites communautaires (sites\recus.json)
//   sites\web\<clé>\fichiers\  recherche sur le web depuis un média (sites\web.json)
//   vpinmediadb\               fichiers de VPinMediaDB, nommés d'après leur MD5 (effacés après un jour)
//   cyberpinball\              installeurs des mises à jour de Cyber Pinball
//   <archive>.zip              archives des composants (VPX), gardées pour réinstaller sans réseau
// Les index (vpsdb.json, vpinmdb.json…), les relevés et les aperçus sont internes : ni
// listés, ni vidés.
//
// L'inventaire dit, pour chaque fichier, d'où il vient et à quoi il sert : la liste
// d'attente (reçu, installé, gardé de côté), les relevés des sites, l'index de
// VPinMediaDB, et le journal des utilisations (downloads\journal.json), où l'interface
// note ce qu'on a fait d'un fichier repris par le sélecteur.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONTENT_LABELS, clearItem, forgetStray, isPartialDownload, linkHost, loadWaitList, NEED_LABELS, type WaitList } from './acquisition';
import { formatSize, moveToTrash, samePath, trashDirFor } from './fileops';
import { formatDate, t, tn } from './i18n';
import type { MediaDb } from './mediadb';
import { mediaTypeInfo, type MediaType } from './medias';
import { mediaSite, type SiteReceipt, type WebReceipt } from './mediasites';
import { readJsonFile } from './store';

/** D'où vient un fichier. */
export type DownloadOrigin = 'acquisition' | 'site' | 'web' | 'vpinmediadb' | 'update' | 'component' | 'windows' | 'other';

/** Nature d'un fichier, d'après son nom (et ce qu'on sait de son contenu). */
export type DownloadKind = 'table' | 'b2s' | 'rom' | 'image' | 'video' | 'audio' | 'archive' | 'installer' | 'other';

/** À quoi il sert : installé, attendu, gardé de côté, repris, gardé pour plus tard, rien. */
export type DownloadUseState = 'installed' | 'waiting' | 'aside' | 'used' | 'kept' | 'none';

export interface DownloadUse {
  state: DownloadUseState;
  /** « Installé avec Medieval Madness », « Attendu : ROM de Terminator 2 »… */
  text: string;
}

export interface DownloadEntry {
  file: string;
  name: string;
  size: number;
  mtimeMs: number;
  origin: DownloadOrigin;
  /** Site ou hôte d'où il vient : « vpforums.org », « VPForums », « github.com ». */
  source?: string;
  /** Adresse de la page ou du fichier, quand on la connaît. */
  url?: string;
  /** Nom parlant quand le nom du fichier ne dit rien (VPinMediaDB : un MD5). */
  label?: string;
  kind: DownloadKind;
  use: DownloadUse;
  /** Élément de la liste d'attente qui l'a reçu. */
  waitItem?: string;
  /** Hors de la zone de Cyber Pinball (Téléchargements de Windows) : jamais vidé par « Tout vider ». */
  outside?: boolean;
}

/** Utilisation notée dans le journal : un fichier repris pour une table, un média… */
export interface DownloadNote {
  file: string;
  at: string;
  text: string;
}

const JOURNAL = 'journal.json';

export function downloadJournalFile(downloadsDir: string): string {
  return path.join(downloadsDir, JOURNAL);
}

function readNotes(downloadsDir: string): DownloadNote[] {
  const file = downloadJournalFile(downloadsDir);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = readJsonFile(file) as { notes?: unknown };
    return Array.isArray(raw.notes) ? (raw.notes as DownloadNote[]).filter((n) => n && typeof n.file === 'string' && typeof n.text === 'string') : [];
  } catch {
    return [];
  }
}

/** Note ce qu'on a fait d'un fichier téléchargé (la plus récente utilisation est montrée). */
export function noteDownloadUse(downloadsDir: string, file: string, text: string, now = new Date()): void {
  const notes = readNotes(downloadsDir).filter((n) => fs.existsSync(n.file));
  notes.push({ file: path.resolve(file), at: now.toISOString(), text });
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.writeFileSync(downloadJournalFile(downloadsDir), `${JSON.stringify({ notes: notes.slice(-500) }, null, 2)}\n`, 'utf8');
}

/** Le fichier est-il dans la zone de téléchargements (et pas dans un dossier interne) ? */
export function insideDownloads(downloadsDir: string, file: string): boolean {
  const rel = path.relative(path.resolve(downloadsDir), path.resolve(file));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Fichiers internes de la zone : index et métadonnées à la racine (vpsdb.json, vpinmdb.json…),
 * relevés et aperçus des sites, réceptions en cours. Chemin relatif à downloads.
 */
export function isInternalDownload(rel: string): boolean {
  const parts = rel.split(/[\\/]/);
  const name = parts.at(-1) ?? '';
  if (isPartialDownload(name) || /\.part$/i.test(name)) return true;
  if (parts.length === 1) return /\.json$/i.test(name);
  if (parts[0]!.toLowerCase() === 'sites') {
    if (parts.length === 2 && /\.json$/i.test(name)) return true;
    if (parts[1]!.toLowerCase() === 'apercus') return true;
  }
  // Réception en cours d'un site ou du web (sites\…\recu\).
  return parts.slice(0, -1).some((p) => p.toLowerCase() === 'recu');
}

const KIND_PATTERNS: [DownloadKind, RegExp][] = [
  ['table', /\.vpx$/i],
  ['b2s', /\.directb2s$/i],
  ['image', /\.(png|apng|jpe?g|gif|webp|bmp)$/i],
  ['video', /\.(mp4|m4v|webm|f4v|avi|mkv|mov|wmv|flv)$/i],
  ['audio', /\.(mp3|ogg|wav|flac|m4a)$/i],
  ['archive', /\.(zip|7z|rar)$/i],
  ['installer', /\.(exe|msi)$/i],
];

/** Nature d'un fichier d'après son nom ; une archive reconnue comme ROM est une ROM. */
export function downloadKind(name: string, content?: string): DownloadKind {
  const kind = KIND_PATTERNS.find(([, re]) => re.test(name))?.[0] ?? 'other';
  if (kind === 'archive' && content === 'rom') return 'rom';
  if (kind === 'archive' && content === 'table') return 'table';
  if (kind === 'archive' && content === 'b2s') return 'b2s';
  return kind;
}

export const DOWNLOAD_KIND_LABELS: Record<DownloadKind, string> = {
  get table() {
    return t('Table');
  },
  get b2s() {
    return t('Fronton');
  },
  rom: 'ROM',
  get image() {
    return t('Image');
  },
  get video() {
    return t('Vidéo');
  },
  get audio() {
    return t('Son');
  },
  get archive() {
    return t('Archive');
  },
  get installer() {
    return t('Installeur');
  },
  get other() {
    return t('Fichier');
  },
};

export const DOWNLOAD_ORIGIN_LABELS: Record<DownloadOrigin, string> = {
  get acquisition() {
    return t('« Récupérer »');
  },
  get site() {
    return t('médias du site');
  },
  get web() {
    return t('recherche sur le web');
  },
  get vpinmediadb() {
    return 'VPinMediaDB';
  },
  get update() {
    return t('mise à jour de Cyber Pinball');
  },
  get component() {
    return t('installation de VPX');
  },
  get windows() {
    return t('Téléchargements de Windows');
  },
  other: 'Cyber Pinball',
};

/** Type de média d'une clé de l'index de VPinMediaDB (« 1k/table », « wheel »…). */
function mediaDbKeyType(key: string): MediaType | undefined {
  const base = key.replace(/^(1k|4k)\//, '');
  const map: Record<string, MediaType> = { wheel: 'Wheel', table: 'Playfield', table_video: 'Playfield', bg: 'Backglass', dmd: 'FullDMD', dmd_video: 'FullDMD', flyer: 'GameInfo', audio: 'Audio' };
  return map[base];
}

/** Fichiers de VPinMediaDB par MD5 (nom des fichiers reçus) : jeu VPS et type de média. */
export function mediaDbFilesByMd5(db: MediaDb | undefined): Map<string, { gameId: string; type?: MediaType }> {
  const out = new Map<string, { gameId: string; type?: MediaType }>();
  for (const entry of db?.entries.values() ?? []) {
    for (const [key, file] of Object.entries(entry.files)) if (file.md5) out.set(file.md5, { gameId: entry.id, type: mediaDbKeyType(key) });
  }
  return out;
}

export interface DownloadSources {
  downloadsDir: string;
  /** Dossier des données : la liste d'attente (acquisition.json) y est. */
  dataDir?: string;
  /** Liste d'attente en mémoire (sinon lue dans dataDir). */
  waitList?: WaitList;
  /** Index de VPinMediaDB et nom des jeux VPS, pour nommer les fichiers de vpinmediadb\. */
  mediaDb?: MediaDb;
  gameName?: (vpsId: string) => string | undefined;
  /** Nom d'une table d'après son fichier .vpx (« Medieval Madness »). */
  tableName?: (file: string) => string | undefined;
  /** Dossier Téléchargements de Windows et depuis quand en montrer les fichiers. */
  windows?: { dir: string; since: Date };
}

function readArray<T>(file: string): T[] {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = readJsonFile(file);
    return Array.isArray(raw) ? (raw as T[]) : [];
  } catch {
    return [];
  }
}

function walk(dir: string, depth: number, out: string[]): void {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of names) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (depth > 0) walk(full, depth - 1, out);
    } else if (d.isFile()) out.push(full);
  }
}

const tableLabel = (file: string, tableName?: (file: string) => string | undefined) => tableName?.(file) ?? path.basename(file, path.extname(file));

/**
 * Inventaire des téléchargements, du plus récent au plus ancien : chaque fichier de la
 * zone (hors index et réceptions en cours), d'où il vient et à quoi il sert ; avec
 * `windows`, les fichiers récents du dossier Téléchargements de Windows, marqués `outside`.
 */
export function downloadInventory(src: DownloadSources): DownloadEntry[] {
  const dir = path.resolve(src.downloadsDir);
  const list = src.waitList ?? (src.dataDir ? loadWaitList(src.dataDir) : { items: [] });
  const key = (f: string) => path.resolve(f).toLowerCase();
  const received = new Map(list.items.filter((i) => i.received).map((i) => [key(i.received!.file), i]));
  const strays = new Map((list.strays ?? []).map((s) => [key(s.file), s]));
  const notes = new Map<string, DownloadNote>();
  for (const n of readNotes(dir)) notes.set(key(n.file), n);
  const siteFiles = new Map<string, SiteReceipt>();
  for (const r of readArray<SiteReceipt>(path.join(dir, 'sites', 'recus.json'))) for (const f of r.files ?? []) siteFiles.set(key(f.file), r);
  const webFiles = new Map<string, WebReceipt>();
  for (const r of readArray<WebReceipt>(path.join(dir, 'sites', 'web.json'))) for (const f of r.files ?? []) webFiles.set(key(f.file), r);
  const md5s = mediaDbFilesByMd5(src.mediaDb);

  const describe = (file: string, origin: DownloadOrigin, stat: fs.Stats, outside = false): DownloadEntry => {
    const k = key(file);
    const name = path.basename(file);
    const entry: DownloadEntry = { file, name, size: stat.size, mtimeMs: stat.mtimeMs, origin, kind: downloadKind(name), use: { state: 'none', text: t('Sans usage connu') } };
    if (outside) entry.outside = true;
    const item = received.get(k);
    const stray = strays.get(k);
    if (item) {
      entry.waitItem = item.id;
      entry.kind = downloadKind(name, item.received!.content ?? item.kind);
      const url = item.received!.url ?? item.page;
      if (url) Object.assign(entry, { url, source: linkHost(url).label });
      const what = NEED_LABELS[item.kind];
      entry.use =
        item.state === 'installed'
          ? { state: 'installed', text: item.table ? t('Installé avec {table}', { table: tableLabel(item.table, src.tableName) }) : t('Installé : {kind} de {game}', { kind: what, game: item.gameLabel }) }
          : { state: 'waiting', text: t('À installer : {kind} de {game}', { kind: what, game: item.gameLabel }) };
    } else if (stray) {
      entry.kind = downloadKind(name, stray.content);
      if (stray.url) Object.assign(entry, { url: stray.url, source: linkHost(stray.url).label });
      entry.use = { state: 'aside', text: stray.content && stray.content !== 'unknown' ? t('Gardé de côté : {content}', { content: CONTENT_LABELS[stray.content] }) : t('Gardé de côté') };
    }
    const site = siteFiles.get(k);
    const web = webFiles.get(k);
    if (site) {
      Object.assign(entry, { origin: 'site', url: site.url, source: mediaSite(site.site)?.name ?? site.site });
      entry.use = { state: 'kept', text: t('Reçu pour : {type} · {title}', { type: mediaTypeInfo(site.type)?.label ?? site.type, title: site.title }) };
    } else if (web) {
      Object.assign(entry, { origin: 'web', url: web.url });
      if (web.url) entry.source = linkHost(web.url).label;
      entry.use = { state: 'kept', text: t('Cherché pour : {type} de {table}', { type: mediaTypeInfo(web.type)?.label ?? web.type, table: tableLabel(web.table, src.tableName) }) };
    }
    if (origin === 'vpinmediadb') {
      entry.source = 'github.com';
      const md5 = path.basename(name, path.extname(name)).toLowerCase();
      const known = md5s.get(md5);
      const game = known ? (src.gameName?.(known.gameId) ?? known.gameId) : undefined;
      const type = known?.type ? mediaTypeInfo(known.type)?.label : undefined;
      if (game) entry.label = type ? `${type} · ${game}` : game;
      entry.use = { state: 'kept', text: game ? t('Média de VPinMediaDB pour {game}, effacé après un jour', { game }) : t('Reçu de VPinMediaDB, effacé après un jour') };
    } else if (origin === 'update') {
      entry.source = 'github.com';
      entry.use = { state: 'kept', text: t('Installeur gardé pour réinstaller cette version') };
    } else if (origin === 'component') {
      entry.source = 'github.com';
      entry.use = { state: 'kept', text: t('Gardée pour réinstaller VPX sans réseau') };
    }
    const note = notes.get(k);
    if (note && entry.use.state !== 'installed' && entry.use.state !== 'waiting') entry.use = { state: 'used', text: note.text };
    return entry;
  };

  const out: DownloadEntry[] = [];
  const files: string[] = [];
  walk(dir, 6, files);
  for (const file of files) {
    const rel = path.relative(dir, file);
    if (isInternalDownload(rel)) continue;
    const top = rel.split(/[\\/]/)[0]!.toLowerCase();
    const single = !/[\\/]/.test(rel);
    const origin: DownloadOrigin =
      top === 'acquisition'
        ? 'acquisition'
        : top === 'sites'
          ? rel.split(/[\\/]/)[1]?.toLowerCase() === 'web'
            ? 'web'
            : 'site'
          : top === 'vpinmediadb'
            ? 'vpinmediadb'
            : top === 'cyberpinball'
              ? 'update'
              : single && /vpinball/i.test(rel)
                ? 'component'
                : 'other';
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    out.push(describe(file, origin, stat));
  }
  if (src.windows) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(src.windows.dir);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (isPartialDownload(name) || /^desktop\.ini$/i.test(name) || name.startsWith('.')) continue;
      const file = path.join(src.windows.dir, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.mtimeMs < src.windows.since.getTime()) continue;
      out.push(describe(file, 'windows', stat, true));
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
}

export type DownloadSort = 'date' | 'name' | 'size';
export const DOWNLOAD_SORTS: readonly DownloadSort[] = ['date', 'name', 'size'];
export const DOWNLOAD_SORT_LABELS: Record<DownloadSort, string> = {
  get date() {
    return t('date');
  },
  get name() {
    return t('nom');
  },
  get size() {
    return t('taille');
  },
};

export function sortDownloads(entries: DownloadEntry[], sort: DownloadSort): DownloadEntry[] {
  const byName = (a: DownloadEntry, b: DownloadEntry) => (a.label ?? a.name).localeCompare(b.label ?? b.name, undefined, { sensitivity: 'base', numeric: true });
  const cmp: Record<DownloadSort, (a: DownloadEntry, b: DownloadEntry) => number> = {
    date: (a, b) => b.mtimeMs - a.mtimeMs || byName(a, b),
    name: byName,
    size: (a, b) => b.size - a.size || byName(a, b),
  };
  return [...entries].sort(cmp[sort]);
}

/** « vpforums.org · « Récupérer » · 24/10/2026 · 1,5 Mo » */
export function downloadLine(e: DownloadEntry): string {
  const where = e.origin === 'windows' ? DOWNLOAD_ORIGIN_LABELS.windows : [e.source, DOWNLOAD_ORIGIN_LABELS[e.origin]].filter(Boolean).join(' · ');
  return [where, formatDate(e.mtimeMs, { day: 'numeric', month: 'short', year: 'numeric' }), formatSize(e.size)].join(' · ');
}

/** Total des fichiers : « 11 fichiers · 1,4 Go ». */
export function downloadTotals(entries: DownloadEntry[]): { count: number; bytes: number } {
  return { count: entries.length, bytes: entries.reduce((n, e) => n + e.size, 0) };
}

/**
 * Ce que la liste d'attente perd quand ces fichiers partent : gardés de côté oubliés ;
 * éléments reçus et pas encore installés redevenus attendus (renvoyés). Un élément installé
 * garde sa trace : sa table n'a plus besoin du fichier.
 */
export function forgetDownloads(list: WaitList, files: string[]): { waiting: string[] } {
  const waiting: string[] = [];
  for (const file of files) {
    forgetStray(list, file);
    for (const item of list.items) {
      if (item.state === 'received' && item.received && samePath(item.received.file, file)) {
        clearItem(list, item, false);
        waiting.push(item.id);
      }
    }
  }
  return { waiting };
}

/**
 * Met ces fichiers à la corbeille de Cyber Pinball (un dossier daté, nommé `label`) et
 * retire les dossiers vides laissés dans la zone. Renvoie les fichiers déplacés.
 */
export function trashDownloads(files: string[], ctx: { downloadsDir: string; trashRoot: string; label: string; now?: Date }): string[] {
  const trashDir = trashDirFor(ctx.trashRoot, ctx.label, ctx.now);
  const moved: string[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    fs.mkdirSync(trashDir, { recursive: true });
    moveToTrash(file, { trashDir });
    moved.push(file);
    // Dossiers vides laissés par un envoi déballé (sites\<site>-<fiche>\fichiers\…).
    let parent = path.dirname(file);
    while (insideDownloads(ctx.downloadsDir, parent) && !['acquisition', 'sites', 'vpinmediadb', 'cyberpinball'].includes(path.relative(ctx.downloadsDir, parent).toLowerCase())) {
      try {
        if (fs.readdirSync(parent).length) break;
        fs.rmdirSync(parent);
      } catch {
        break;
      }
      parent = path.dirname(parent);
    }
  }
  return moved;
}

/** Fichiers que « Tout vider » met à la corbeille : ceux de la zone, jamais ceux de Windows. */
export function emptiableDownloads(entries: DownloadEntry[]): DownloadEntry[] {
  return entries.filter((e) => !e.outside);
}

/** Résumé d'un vidage : « 11 fichiers, 1,4 Go ». */
export function downloadsSummary(entries: DownloadEntry[]): string {
  const { count, bytes } = downloadTotals(entries);
  return tn(count, '{n} fichier, {size}', '{n} fichiers, {size}', { size: formatSize(bytes) });
}
