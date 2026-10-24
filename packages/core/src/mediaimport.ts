// Import des médias de présentation (tâche T9 de docs/recherche/medias.md, § 5.5).
//
// Dans une archive, une sélection ou l'installation d'un autre frontend, on
// reconnaît les médias rangés à la manière de PinUP Popper
// (POPMedia\<émulateur>\<Wheel, Backglass…>\<jeu>.ext), de PinballX
// (Media\<système>\<Wheel Images, Table Videos…>\<jeu>.ext), de VPinFE
// (medias\bg.png…), ou déjà nommés « (Type) <nom>.ext ». Chacun est attribué à
// son jeu (nom, ROM, titre, base VPS), puis rangé sous « (Type) <nom du
// dossier>.ext » dans <table>\medias\ (§ 5.3). Un média du même type déjà
// présent part à la corbeille. Les formats que le menu ne lit pas (flv, f4v,
// avi, mov) sont signalés et jamais rangés. Rien ne bouge avant que
// l'utilisateur ait validé le plan ; une installation existante est copiée,
// jamais déplacée.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { moveToTrash, samePath, type OpContext } from './fileops';
import { t } from './i18n';
import {
  isAcceptedFormat,
  mediaKind,
  mediaPageOf,
  mediaTypeFromFolder,
  mediaTypeFromVpinfe,
  mediaTypeInfo,
  parseMediaFileName,
  UNREADABLE_FORMATS,
  type MediaType,
} from './medias';
import { nameKey } from './tablefiles';
import { parseTableName, type TableEntry } from './tables';
import { matchVps, type VpsDb } from './vps';

/** D'où vient la façon de ranger un média : un autre frontend, ou le nom « (Type) » de VPX. */
export type MediaFrontend = 'popper' | 'pinballx' | 'vpinfe' | 'vpx';

export const FRONTEND_LABELS: Record<MediaFrontend, string> = {
  popper: 'PinUP Popper',
  pinballx: 'PinballX',
  vpinfe: 'VPinFE',
  get vpx() {
    return t('nom « (Type) »');
  },
};

/** Dossier rencontré en parcourant une arborescence, qui dit comment lire les fichiers qu'il contient. */
export type MediaFolder =
  /** Dossier d'un type chez Popper ou PinballX : chaque fichier porte le nom du jeu. */
  | {
      kind: 'type';
      frontend: 'popper' | 'pinballx';
      type: MediaType;
      /** Émulateur (POPMedia\<émulateur>\…, Media\<système>\…) ; absent hors de ces arborescences. */
      emulator?: string;
      /** Rang des pages : prospectus de PinballX rangés en Front, Back, Inside1… */
      order: number;
    }
  /** medias\ d'une table : noms « (Type) » et noms fixes de VPinFE. */
  | { kind: 'medias'; owner?: string };

export interface RecognizedMedia {
  type: MediaType;
  frontend: MediaFrontend;
  /** Nom du jeu porté par le fichier ; absent pour un nom fixe de VPinFE hors du dossier d'une table. */
  game?: string;
  /** Extension, sans point, en minuscules. */
  ext: string;
  /** Rang des pages et des doublons (0 d'abord). */
  order: number;
  emulator?: string;
  /** Média d'un autre émulateur que Visual Pinball (Future Pinball, Pinball FX…) : jamais rangé. */
  foreign: boolean;
}

// Noms de dossiers de Popper qui ne peuvent rien désigner d'autre. Les autres
// (DMD, Audio, Backglass, Topper, Loading, Menu) ne sont reconnus que sous
// POPMedia ou à côté d'un de ceux-ci : un dossier « DMD » seul dans une archive
// est plus souvent le contenu FlexDMD d'une table.
const DISTINCTIVE_POPPER = new Set(['wheel', 'playfield', 'audiolaunch', 'gameinfo', 'gamehelp', 'other2']);

/** Sous-dossiers des prospectus de PinballX (Media\Flyer Images\Front…), dans l'ordre des pages. */
const PINBALLX_FLYER_PAGES = /^(front|back|inside\s*(\d+))$/i;

/** Dossiers jamais parcourus dans une installation : les PuP-Packs ont aussi des dossiers « Backglass », « Topper »… */
const SKIPPED_DIRS = new Set(['pupvideos', 'recordings', '__macosx', '.git']);

/**
 * Dossier de médias d'un frontend, ou undefined. parents : dossiers au-dessus
 * (du plus haut au plus proche), siblings : dossiers voisins, pour reconnaître
 * un dossier de Popper au nom ambigu sorti de son POPMedia.
 */
export function mediaFolder(name: string, parents: readonly string[] = [], siblings: readonly string[] = []): MediaFolder | undefined {
  const lower = name.trim().toLowerCase();
  if (lower === 'medias') return { kind: 'medias', owner: parents.at(-1) };
  const pinballx = mediaTypeFromFolder('pinballx', name);
  if (pinballx) return { kind: 'type', frontend: 'pinballx', type: pinballx, emulator: emulatorUnder(parents, 'media'), order: 0 };
  const popper = mediaTypeFromFolder('popper', name);
  if (!popper) return undefined;
  const underPopMedia = parents.some((p) => p.toLowerCase() === 'popmedia');
  const distinctive = (n: string) => DISTINCTIVE_POPPER.has(n.trim().toLowerCase());
  if (!underPopMedia && !distinctive(name) && !siblings.some((s) => s !== name && distinctive(s))) return undefined;
  return { kind: 'type', frontend: 'popper', type: popper, emulator: emulatorUnder(parents, 'popmedia'), order: 0 };
}

/** Sous-dossier d'un dossier de médias qui en fait encore partie (prospectus de PinballX), ou undefined. */
export function mediaSubFolder(folder: MediaFolder, name: string): MediaFolder | undefined {
  if (folder.kind !== 'type' || folder.frontend !== 'pinballx' || folder.type !== 'GameInfo') return undefined;
  const m = PINBALLX_FLYER_PAGES.exec(name.trim());
  if (!m) return undefined;
  const order = m[1]!.toLowerCase() === 'front' ? 0 : m[1]!.toLowerCase() === 'back' ? 1 : 1 + Number(m[2]);
  return { ...folder, order };
}

/** Émulateur : dossier entre POPMedia (ou Media) et le dossier du type. */
function emulatorUnder(parents: readonly string[], top: string): string | undefined {
  const at = parents.findLastIndex((p) => p.toLowerCase() === top);
  return at >= 0 && at + 1 < parents.length ? parents[at + 1] : undefined;
}

/** Visual Pinball (X ou 9) : les seuls médias que la borne reprend. */
function isVisualPinball(emulator: string | undefined): boolean {
  return !emulator || /visual\s*pinball|vpinball|^vpx?\d*$/i.test(emulator.trim());
}

/**
 * Média reconnu d'après son nom et son dossier, ou undefined. Un nom « (Type) … »
 * est reconnu partout ; un nom de Popper ou de PinballX seulement dans le dossier
 * de son type ; un nom fixe de VPinFE seulement dans medias\.
 */
export function recognizeMedia(fileName: string, folder?: MediaFolder): RecognizedMedia | undefined {
  if (!mediaKind(fileName)) return undefined;
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const stem = fileName.slice(0, fileName.length - ext.length - 1).trim();
  const parsed = parseMediaFileName(fileName);
  if (parsed) return { type: parsed.type, frontend: 'vpx', game: parsed.stem || undefined, ext, order: 0, foreign: false };
  if (folder?.kind === 'type') {
    return { type: folder.type, frontend: folder.frontend, game: stem, ext, order: folder.order, emulator: folder.emulator, foreign: !isVisualPinball(folder.emulator) };
  }
  if (folder?.kind === 'medias') {
    const type = mediaTypeFromVpinfe(fileName);
    if (type) return { type, frontend: 'vpinfe', game: folder.owner, ext, order: 0, foreign: false };
  }
  return undefined;
}

/**
 * Noms de jeu à essayer pour un fichier : le nom tel quel, puis sans numéro de
 * page (« Elvis01 » de Popper, « Nom (Fabricant Année) 2 »). « Apollo 13 » ou
 * « Terminator 2 » gardent leur chiffre.
 */
export function mediaGameNames(game: string | undefined): string[] {
  if (!game) return [];
  const names = [game];
  const m = /^(.*\))\s*[ _-]?\d{1,3}$/.exec(game) ?? /^(.*[^\d\s_-])\d{2}$/.exec(game);
  if (m && m[1]!.trim()) names.push(m[1]!.trim());
  return names;
}

// ---------------------------------------------------------------------------
// Rangement dans medias\ d'une table

/** Où vont les médias d'une table. */
export interface MediaDestination {
  /** <dossier de la table>\medias. */
  dir: string;
  /** Nom écrit : « (Type) <name>.ext » (nom du dossier, ou du .vpx pour une table en vrac). */
  name: string;
  /** Noms sous lesquels la table a déjà des médias (.vpx et dossier) : ceux du même type sont remplacés. */
  names: string[];
}

export interface IncomingMedia {
  from: string;
  /** D'où vient le fichier, pour l'affichage. */
  source: string;
  media: RecognizedMedia;
  size?: number;
}

export interface PlannedMedia {
  from: string;
  source: string;
  type: MediaType;
  /** Page, 1 pour la première. */
  page: number;
  frontend: MediaFrontend;
  /** Nom écrit dans medias\. */
  target: string;
  to: string;
  renamed: boolean;
  /** Un média de ce type est déjà là : l'ancien part à la corbeille. */
  replaces: boolean;
  /** Fichiers du même type remplacés (autre extension, autres pages) : à la corbeille avant la copie. */
  trash: string[];
  size?: number;
}

export interface SkippedMedia {
  from: string;
  source: string;
  type?: MediaType;
  reason: string;
  /** Format que le menu ne lit pas (flv, f4v, avi, mov). */
  unreadable?: boolean;
}

/** Nom d'un média rangé : « (Type) <nom>[ page].ext », comme mediaFileName. */
export function mediaTargetName(name: string, type: MediaType, ext: string, page = 1): string {
  return `(${type}) ${name}${page > 1 ? ` ${page}` : ''}.${ext.replace(/^\./, '').toLowerCase()}`;
}

/**
 * Plan des médias d'une table : un fichier par type (le meilleur format, Visual
 * Pinball X d'abord), toutes les pages pour le prospectus et les règles. Les
 * médias du même type déjà rangés sont remplacés ; les formats illisibles, les
 * formats non prévus pour le type, les autres émulateurs et les doublons sont
 * mis de côté avec leur raison.
 */
export function arrangeMedias(dest: MediaDestination, incoming: IncomingMedia[]): { planned: PlannedMedia[]; skipped: SkippedMedia[] } {
  const planned: PlannedMedia[] = [];
  const skipped: SkippedMedia[] = [];
  const byType = new Map<MediaType, IncomingMedia[]>();
  for (const m of incoming) {
    const { media } = m;
    const info = mediaTypeInfo(media.type);
    const skip = (reason: string, unreadable = false) => skipped.push({ from: m.from, source: m.source, type: media.type, reason, ...(unreadable ? { unreadable } : {}) });
    if (media.foreign) skip(t('Média de « {emulator} », un autre émulateur que Visual Pinball : non repris.', { emulator: media.emulator ?? '' }));
    else if (UNREADABLE_FORMATS.includes(media.ext)) {
      skip(t('Format {ext} : le menu ne sait pas le lire. Non rangé ; convertissez-le en mp4 (ou webm) puis importez-le de nouveau.', { ext: media.ext }), true);
    } else if (!isAcceptedFormat(media.type, `x.${media.ext}`)) skip(t('Format {ext} non prévu pour « {type} » (attendu : {formats}). Non rangé.', { ext: media.ext, type: info.label, formats: info.formats.join(', ') }));
    else byType.set(media.type, [...(byType.get(media.type) ?? []), m]);
  }

  const existing = listFiles(dest.dir);
  for (const [type, list] of byType) {
    const info = mediaTypeInfo(type);
    const rank = (m: IncomingMedia) => info.formats.indexOf(m.media.ext);
    const emulatorRank = (m: IncomingMedia) => (!m.media.emulator ? 0 : /\bx\b|vpx/i.test(m.media.emulator) ? 0 : 1);
    const byName = (a: IncomingMedia, b: IncomingMedia) => path.basename(a.from).localeCompare(path.basename(b.from), 'fr', { numeric: true, sensitivity: 'base' });
    let kept: IncomingMedia[];
    if (info.pages) {
      kept = [...list].sort((a, b) => emulatorRank(a) - emulatorRank(b) || a.media.order - b.media.order || byName(a, b));
    } else {
      const sorted = [...list].sort((a, b) => emulatorRank(a) - emulatorRank(b) || rank(a) - rank(b) || a.media.order - b.media.order || byName(a, b));
      kept = sorted.slice(0, 1);
      for (const m of sorted.slice(1)) {
        skipped.push({ from: m.from, source: m.source, type, reason: t('Doublon : « {file} » est gardé pour « {type} ».', { file: path.basename(sorted[0]!.from), type: info.label }) });
      }
    }
    const targets = kept.map((m, i) => mediaTargetName(dest.name, type, m.media.ext, i + 1));
    // Tout média de ce type déjà rangé sous un nom de la table est remplacé : l'import apporte le jeu complet.
    const replaced = existing.filter((f) => {
      const p = parseMediaFileName(f);
      return p?.type === type && dest.names.some((n) => mediaPageOf(p.stem, n) !== undefined);
    });
    kept.forEach((m, i) => {
      const to = path.join(dest.dir, targets[i]!);
      const trash = i === 0 ? replaced.filter((f) => !targets.some((target) => samePath(target, f))).map((f) => path.join(dest.dir, f)) : [];
      planned.push({
        from: m.from,
        source: m.source,
        type,
        page: i + 1,
        frontend: m.media.frontend,
        target: targets[i]!,
        to,
        renamed: path.basename(m.from) !== targets[i],
        replaces: trash.length > 0 || fs.existsSync(to),
        trash,
        ...(m.size !== undefined ? { size: m.size } : {}),
      });
    });
  }
  const order = (t: MediaType) => MEDIA_ORDER.indexOf(t);
  planned.sort((a, b) => order(a.type) - order(b.type) || a.page - b.page);
  return { planned, skipped };
}

const MEDIA_ORDER: MediaType[] = ['Wheel', 'Playfield', 'Backglass', 'DMD', 'FullDMD', 'Topper', 'Loading', 'Audio', 'AudioLaunch', 'GameInfo', 'GameHelp', 'Other', 'RealDMD', 'RealColorDMD'];

/**
 * Copie les médias d'un plan validé : les anciens du même type partent d'abord à
 * la corbeille. Les fichiers d'origine ne sont jamais déplacés.
 */
export async function copyPlannedMedias(
  planned: PlannedMedia[],
  ctx: OpContext,
  onProgress?: (done: number, total: number, current: PlannedMedia) => void,
): Promise<void> {
  if (!planned.length) return;
  for (const [i, m] of planned.entries()) {
    onProgress?.(i, planned.length, m);
    for (const old of m.trash) if (fs.existsSync(old)) moveToTrash(old, ctx);
    fs.mkdirSync(path.dirname(m.to), { recursive: true });
    if (fs.existsSync(m.to)) moveToTrash(m.to, ctx);
    await fs.promises.copyFile(m.from, m.to);
  }
  onProgress?.(planned.length, planned.length, planned.at(-1)!);
}

// ---------------------------------------------------------------------------
// Rapprochement d'un média et d'une table installée

/** Table installée, telle que l'import des médias la voit. */
export interface InstalledTable {
  folder: string;
  title: string;
  manufacturer?: string;
  year?: number;
  dest: MediaDestination;
  vpsId?: string;
  /** ROM que jouent ses scripts (déjà lus), pour les médias nommés d'après la ROM. */
  roms: string[];
}

/**
 * Tables installées, une par dossier (toutes ses versions) ; une table en vrac
 * à la racine des tables a sa propre entrée, nommée comme son .vpx.
 */
export function installedTables(entries: TableEntry[], romsOf: (t: TableEntry) => string[] = () => []): InstalledTable[] {
  const out: InstalledTable[] = [];
  for (const t of entries) {
    const own = t.id.includes('/');
    const vpx = path.basename(t.file).replace(/\.vpx$/i, '');
    const existing = own ? out.find((o) => samePath(o.folder, t.folder)) : undefined;
    if (existing) {
      if (!existing.dest.names.some((n) => n.toLowerCase() === vpx.toLowerCase())) existing.dest.names.push(vpx);
      existing.roms = [...new Set([...existing.roms, ...romsOf(t)])];
      existing.vpsId ??= t.info.Info?.VPSId;
      continue;
    }
    const name = own ? path.basename(t.folder) : vpx;
    out.push({
      folder: t.folder,
      title: t.info.Info?.Title ?? t.title,
      manufacturer: t.info.Info?.Manufacturer ?? t.manufacturer,
      year: t.info.Info?.Year ?? t.year,
      dest: { dir: path.join(t.folder, 'medias'), name, names: own && name.toLowerCase() !== vpx.toLowerCase() ? [name, vpx] : [name] },
      vpsId: t.info.Info?.VPSId,
      roms: romsOf(t),
    });
  }
  return out;
}

/** Comment un média a été rattaché à sa table. */
export type MediaMatchHow = 'name' | 'rom' | 'title' | 'vps';

export const MATCH_LABELS: Record<MediaMatchHow, string> = {
  get name() {
    return t('nom de la table');
  },
  rom: 'ROM',
  get title() {
    return t('titre');
  },
  get vps() {
    return t('base VPS');
  },
};

export type MediaGameMatch = { table: InstalledTable; how: MediaMatchHow } | { ambiguous: InstalledTable[] } | undefined;

/**
 * Table d'un nom de jeu (nom du fichier chez Popper et PinballX) : nom exact du
 * .vpx ou du dossier, puis ROM, puis titre (fabricant et année départagent),
 * puis jeu reconnu par la base VPS. Plusieurs tables possibles : ambigu, rien
 * n'est rangé.
 */
export function matchMediaGame(game: string, tables: InstalledTable[], vps?: VpsDb): MediaGameMatch {
  const names = mediaGameNames(game);
  const one = (found: InstalledTable[], how: MediaMatchHow): MediaGameMatch =>
    found.length === 1 ? { table: found[0]!, how } : found.length > 1 ? { ambiguous: found } : undefined;
  for (const n of names) {
    const r = one(tables.filter((t) => t.dest.names.some((x) => x.toLowerCase() === n.toLowerCase())), 'name');
    if (r) return r;
  }
  for (const n of names) {
    const r = one(tables.filter((t) => t.roms.some((x) => x.toLowerCase() === n.toLowerCase())), 'rom');
    if (r) return r;
  }
  for (const n of names) {
    const p = parseTableName(n);
    const key = nameKey(p.title);
    if (key.length < 2) continue;
    let found = tables.filter((t) => nameKey(t.title) === key);
    if (found.length > 1 && p.manufacturer) found = found.filter((t) => !t.manufacturer || nameKey(t.manufacturer) === nameKey(p.manufacturer!));
    if (found.length > 1 && p.year) found = found.filter((t) => !t.year || t.year === p.year);
    const r = one(found, 'title');
    if (r) return r;
  }
  if (vps) {
    for (const n of names) {
      const m = matchVps(vps, { names: [n] });
      if (!m.confident) continue;
      const id = m.candidates[0]!.game.id;
      const r = one(tables.filter((t) => t.vpsId === id), 'vps');
      if (r) return r;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Reprise d'une installation de Popper ou de PinballX

export interface InstallationScan {
  root: string;
  /** Frontends dont on a trouvé des médias. */
  frontends: ('popper' | 'pinballx')[];
  files: IncomingMedia[];
  /** Dossiers non repris (autres émulateurs), avec leur nombre de fichiers. */
  ignored: { source: string; reason: string; count: number }[];
}

/**
 * Médias d'une installation existante : le dossier choisi peut être PinUPSystem,
 * POPMedia, le dossier d'un émulateur, celui d'un type, ou le dossier de
 * PinballX (ou son Media). Les PuP-Packs (PUPVideos) ne sont pas parcourus.
 */
export function scanInstallation(root: string, maxDepth = 6): InstallationScan {
  const scan: InstallationScan = { root, frontends: [], files: [], ignored: [] };
  const abs = path.resolve(root);
  const ancestors = abs.split(/[\\/]+/).filter(Boolean);
  const foreign = new Map<string, { source: string; reason: string; count: number }>();
  const start = mediaFolder(ancestors.at(-1) ?? '', ancestors.slice(0, -1));
  const walk = (dir: string, parents: string[], folder: MediaFolder | undefined, depth: number) => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const siblings = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
    for (const d of dirents) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (SKIPPED_DIRS.has(d.name.toLowerCase())) continue;
        const inner = folder ? mediaSubFolder(folder, d.name) : mediaFolder(d.name, parents, siblings);
        if (inner) walk(p, [...parents, d.name], inner, depth + 1);
        else if (!folder && depth < maxDepth) walk(p, [...parents, d.name], undefined, depth + 1);
        continue;
      }
      if (!d.isFile()) continue;
      const media = recognizeMedia(d.name, folder);
      if (!media) continue;
      const source = path.relative(abs, p) || d.name;
      if (media.foreign) {
        const key = `${media.frontend}:${media.emulator}`;
        const entry = foreign.get(key) ?? { source: media.emulator!, reason: t('{frontend} : autre émulateur que Visual Pinball, non repris.', { frontend: FRONTEND_LABELS[media.frontend] }), count: 0 };
        entry.count++;
        foreign.set(key, entry);
        continue;
      }
      if ((media.frontend === 'popper' || media.frontend === 'pinballx') && !scan.frontends.includes(media.frontend)) scan.frontends.push(media.frontend);
      let size: number | undefined;
      try {
        size = fs.statSync(p).size;
      } catch {
        size = undefined;
      }
      scan.files.push({ from: p, source, media, ...(size !== undefined ? { size } : {}) });
    }
  };
  walk(abs, ancestors, start, 0);
  scan.ignored = [...foreign.values()];
  return scan;
}

export interface InstallationTablePlan {
  table: InstalledTable;
  /** Comment ses médias ont été rattachés (une fois chaque manière). */
  how: MediaMatchHow[];
  planned: PlannedMedia[];
  skipped: SkippedMedia[];
  bytes: number;
}

export interface InstallationPlan {
  root: string;
  frontends: ('popper' | 'pinballx')[];
  tables: InstallationTablePlan[];
  /** Jeux sans table installée, ou qui en désignent plusieurs : rien n'est copié. */
  unmatched: { game: string; sources: string[]; reason: string }[];
  ignored: InstallationScan['ignored'];
  /** Médias copiés et leur taille totale. */
  count: number;
  bytes: number;
}

/** Plan de reprise : chaque média rapproché de sa table, rangé comme à l'import. */
export function planInstallationMedias(scan: InstallationScan, tables: InstalledTable[], opts: { vps?: VpsDb } = {}): InstallationPlan {
  const matches = new Map<string, MediaGameMatch>();
  const perTable = new Map<InstalledTable, { files: IncomingMedia[]; how: Set<MediaMatchHow> }>();
  const unmatched = new Map<string, InstallationPlan['unmatched'][number]>();
  for (const file of scan.files) {
    const game = file.media.game ?? '';
    const key = game.toLowerCase();
    if (!matches.has(key)) matches.set(key, game ? matchMediaGame(game, tables, opts.vps) : undefined);
    const match = matches.get(key);
    if (match && 'table' in match) {
      const entry = perTable.get(match.table) ?? { files: [], how: new Set<MediaMatchHow>() };
      entry.files.push(file);
      entry.how.add(match.how);
      perTable.set(match.table, entry);
      continue;
    }
    const label = mediaGameNames(game).at(-1) ?? game;
    const reason =
      match && 'ambiguous' in match
        ? t('Plusieurs tables possibles ({tables}) : rien n’est copié.', { tables: match.ambiguous.map((a) => path.basename(a.folder)).join(', ') })
        : t('Aucune table installée ne porte ce nom : rien n’est copié.');
    const entry = unmatched.get(label.toLowerCase()) ?? { game: label, sources: [], reason };
    entry.sources.push(file.source);
    unmatched.set(label.toLowerCase(), entry);
  }

  const planned: InstallationTablePlan[] = [];
  for (const [table, { files, how }] of perTable) {
    const result = arrangeMedias(table.dest, files);
    planned.push({ table, how: [...how], ...result, bytes: result.planned.reduce((sum, m) => sum + (m.size ?? 0), 0) });
  }
  planned.sort((a, b) => a.table.dest.name.localeCompare(b.table.dest.name, 'fr', { sensitivity: 'base' }));
  return {
    root: scan.root,
    frontends: scan.frontends,
    tables: planned,
    unmatched: [...unmatched.values()].sort((a, b) => a.game.localeCompare(b.game, 'fr', { sensitivity: 'base' })),
    ignored: scan.ignored,
    count: planned.reduce((n, t) => n + t.planned.length, 0),
    bytes: planned.reduce((n, t) => n + t.bytes, 0),
  };
}

/**
 * Installations connues sur ce PC (emplacements par défaut de Popper et de
 * PinballX) : proposées avant le choix d'un dossier.
 */
export function knownInstallations(drives: string[] = ['C:', 'D:', 'E:']): { frontend: 'popper' | 'pinballx'; path: string }[] {
  const found: { frontend: 'popper' | 'pinballx'; path: string }[] = [];
  for (const drive of drives) {
    for (const dir of [`${drive}\\vPinball\\PinUPSystem\\POPMedia`, `${drive}\\PinUPSystem\\POPMedia`, `${drive}\\Visual Pinball\\PinUPSystem\\POPMedia`]) {
      if (isDir(dir)) found.push({ frontend: 'popper', path: dir });
    }
    for (const dir of [`${drive}\\PinballX\\Media`, `${drive}\\Program Files (x86)\\PinballX\\Media`, `${drive}\\Games\\PinballX\\Media`]) {
      if (isDir(dir)) found.push({ frontend: 'pinballx', path: dir });
    }
  }
  return found;
}

/** Place libre sur le disque de dir (le premier dossier existant en remontant), ou undefined. */
export function freeSpace(dir: string): number | undefined {
  let at = path.resolve(dir);
  while (!fs.existsSync(at)) {
    const up = path.dirname(at);
    if (up === at) return undefined;
    at = up;
  }
  try {
    const s = fs.statfsSync(at);
    return s.bavail * s.bsize;
  } catch {
    return undefined;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
  } catch {
    return [];
  }
}
