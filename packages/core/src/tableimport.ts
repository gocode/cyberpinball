// Ajout de tables : à partir de fichiers, de dossiers ou d'archives déjà
// déballées, on établit un plan (ce qui va où, ce qui est renommé ou remplacé),
// que l'utilisateur valide avant que rien ne bouge. Les archives sont déballées
// par l'application (tar de Windows) ; ici tout est indépendant de Windows.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { bestMatch, pupMemory, setPupMemory, tableFolderName, type ScriptFacts } from './doctor';
import { applyOps, isInside, moveToTrash, pruneEmptyDirs, samePath, sameVolume, type FileOp, type OpContext } from './fileops';
import {
  arrangeMedias,
  mediaFolder,
  mediaGameNames,
  mediaSubFolder,
  recognizeMedia,
  type IncomingMedia,
  type MediaFolder,
  type MediaFrontend,
  type RecognizedMedia,
} from './mediaimport';
import type { MediaType } from './medias';
import {
  analysePack,
  chooseVariant,
  expectedPackNames,
  findPackRoot,
  isPackRoot,
  type BatReport,
  type PupCabinet,
  type PupVariant,
  type VariantChoice,
} from './puppack';
import { listRoms, romFile, romHash, romKey, sameRomFile, tableRomsDir } from './romlibrary';
import { classifyDir, classifyFile, nameKey, type FileKind } from './tablefiles';
import { parseTableName, readInfo, type TableInfoFile } from './tables';
import { ipdbIdOf, matchVps, type VpsCandidate, type VpsDb } from './vps';

export interface ImportSource {
  /** Fichier ou dossier sur le disque (une archive déjà déballée est un dossier). */
  path: string;
  /** Nom montré à l'utilisateur : celui de l'archive d'origine pour un dossier déballé. */
  label?: string;
  /** move : on vide le dossier d'import ; copy : on ne touche pas aux fichiers de l'utilisateur. */
  mode: 'move' | 'copy';
  /** Dossier déballé d'une archive : c'est un paquet, même s'il ne contient qu'un fichier. */
  unpacked?: boolean;
}

/** Table déjà installée, pour y ranger un complément (ROM, vidéos PuP…). */
export interface KnownTable {
  folder: string;
  title: string;
  roms: string[];
  /** Dossier DMD que charge son script (ProjectFolder de FlexDMD ou UltraDMD). */
  dmdFolder?: string;
  /** Noms de PuP-Pack attendus par ses scripts (B2SInit, ROM…). */
  pupNames?: string[];
  /** Jeu VPS de son .info : le dossier est retrouvé même si VPS lui donne un autre nom. */
  vpsId?: string;
}

export interface PlanOptions {
  tablesDir: string;
  /** Script de chaque .vpx à importer (clé : chemin en minuscules), lu par l'application. */
  scripts?: Map<string, ScriptFacts>;
  existing?: KnownTable[];
  /** Base VPS : nom du dossier et informations d'après le jeu reconnu. */
  vps?: VpsDb;
  /**
   * Choix de l'utilisateur, par table (clé TableVps.key) : identifiant du jeu VPS,
   * ou null pour garder le nom déduit des fichiers.
   */
  vpsChoices?: Map<string, string | null>;
  /** Écrans de la borne : choix d'office de l'option des PuP-Packs. */
  cabinet?: PupCabinet;
  /** Option choisie par l'utilisateur, par pack (clé PackPlan.key). */
  pupChoices?: Map<string, string>;
  /**
   * Bibliothèque de ROM (<racine>\pinmame\roms) : une ROM importée y est rangée,
   * puis liée dans chaque table qui la joue. Absente : la ROM va dans la table.
   */
  romLibrary?: string;
  /** Version gardée par ROM (clé RomImport.key) : empreinte du contenu choisi. */
  romChoices?: Map<string, string>;
}

/** Une version d'une ROM : celle de la bibliothèque ou une ROM importée. */
export interface RomImportVersion {
  hash: string;
  size: number;
  mtimeMs: number;
  /** « bibliothèque », ou d'où vient le fichier importé. */
  label: string;
  inLibrary: boolean;
  /** Fichier importé qui porte ce contenu. */
  from?: string;
  mode?: 'move' | 'copy';
}

/** Ce que l'import fait d'une ROM, avec la bibliothèque : rangée une fois, liée partout où elle sert. */
export interface RomImport {
  key: string;
  /** Nom du fichier (« t2_l8.zip »). */
  name: string;
  /** Chemin dans la bibliothèque. */
  to: string;
  /** Contenus en présence, du plus récent au plus ancien. */
  versions: RomImportVersion[];
  /** Version gardée (index dans versions) : la plus récente, sauf choix de l'utilisateur. */
  keep: number;
  decided: boolean;
  /** Fichiers importés qui ne servent pas (doublons, version écartée) : corbeille s'ils sont déplacés. */
  unused: { from: string; source: string; mode: 'move' | 'copy' }[];
  /**
   * Tables qui recevront un lien. state : new (absente de la table), copy (copie identique
   * remplacée), different (autre version remplacée, corbeille), linked (déjà liée, rien à faire).
   * copy vrai : la table est sur un autre volume, elle reçoit une copie.
   */
  links: { folder: string; title: string; to: string; state: 'new' | 'copy' | 'different' | 'linked'; copy: boolean }[];
  ops: FileOp[];
}

/** Ce que l'import fait d'un PuP-Pack (docs/recherche/pup-packs.md, § 4.2). */
export interface PackPlan {
  /** Clé du pack dans le plan (destination en minuscules), pour retenir le choix. */
  key: string;
  /** Nom du dossier d'origine du pack. */
  origin: string;
  /** Nom du dossier dans pupvideos : celui que le plugin cherchera. */
  name: string;
  /** D'où vient le nom : le script de la table, ou le dossier faute de mieux. */
  nameFrom: 'script' | 'folder';
  /** Noms que le plugin essaiera, d'après les scripts. */
  expected: string[];
  /** Le pack était dans un dossier de trop (« rom\rom », dossier d'archive). */
  flattened: boolean;
  /** Pack déjà installé, remplacé en entier (l'ancien part à la corbeille). */
  replaces?: string;
  variants: PupVariant[];
  /** .bat d'options lus sans succès : jamais exécutés. */
  failedBats: BatReport[];
  choice: VariantChoice;
  /** L'utilisateur a choisi l'option. */
  decided: boolean;
  /** Fichiers inutiles retirés : ._*, .DS_Store, MP4 vides (relatifs au pack). */
  junk: string[];
  /** Le pack n'a pas de .pup et aucune option : seul le script peut le piloter. */
  noPupFiles: boolean;
}

/** Ce que la base VPS dit d'une nouvelle table. */
export interface TableVps {
  /** Clé de la table dans le plan (premier .vpx), pour retenir le choix. */
  key: string;
  /** Propositions, la plus probable d'abord. */
  candidates: VpsCandidate[];
  /** Le premier jeu est sûr : retenu sans demander. */
  confident: boolean;
  /** Jeu retenu (sûr ou choisi) ; absent : nom déduit des fichiers. */
  chosen?: VpsCandidate;
  /** L'utilisateur a choisi (un jeu, ou le nom des fichiers). */
  decided: boolean;
  /** Nom déduit des fichiers, proposé quand le jeu est absent de la base. */
  fromFiles: { title: string; manufacturer?: string; year?: number; folderName: string };
}

export interface ImportStep {
  kind: FileKind;
  from: string;
  /** D'où vient l'élément, pour l'affichage : « Terminator2.zip › t2_l8.zip ». */
  source: string;
  to: string;
  /** Destination relative au dossier de la table, pour l'affichage. */
  target: string;
  mode: 'move' | 'copy';
  isDir: boolean;
  renamed: boolean;
  /** Un fichier existant sera remplacé (et mis à la corbeille), ou un dossier complété. */
  replaces: boolean;
  /** PuP-Pack : nom, option, nettoyage. */
  pack?: PackPlan;
  /**
   * Média de présentation reconnu (Popper, PinballX, VPinFE, « (Type) ») : rangé
   * sous « medias\(Type) <dossier>.ext ». trash : médias du même type déjà là,
   * mis à la corbeille avant (autre extension, autres pages).
   */
  media?: { type: MediaType; page: number; frontend: MediaFrontend; trash: string[] };
}

export interface TablePlan {
  title: string;
  manufacturer?: string;
  year?: number;
  folderName: string;
  folder: string;
  /** false : complément pour une table déjà installée. */
  isNew: boolean;
  steps: ImportStep[];
  infoFile: string;
  info: TableInfoFile;
  /** Fichiers .info apportés par l'import, fusionnés dans infoFile. */
  infoSources: { from: string; mode: 'move' | 'copy' }[];
  roms: string[];
  warnings: string[];
  /** Absent sans base VPS, et pour un complément sans table. */
  vps?: TableVps;
}

export interface ImportPlan {
  tables: TablePlan[];
  /** Éléments qu'on ne sait pas rattacher à une table : laissés où ils sont. */
  leftovers: { source: string; reason: string }[];
  ignored: string[];
  /** ROM rangées dans la bibliothèque et liées dans les tables (vide sans bibliothèque). */
  roms: RomImport[];
}

interface Item {
  path: string;
  isDir: boolean;
  kind: FileKind;
  parents: string[];
  pkg: number;
  source: string;
  mode: 'move' | 'copy';
  /** Nom d'origine d'un dossier déballé (archive qui ne contient que le pack). */
  name?: string;
  /** Média de présentation reconnu d'après son nom et son dossier. */
  media?: RecognizedMedia;
}

interface Game {
  vpx: Item[];
  others: Item[];
  key: string;
  title: string;
  manufacturer?: string;
  year?: number;
  folderName: string;
  folder: string;
  isNew: boolean;
  roms: string[];
  /** Dossiers DMD que chargent les scripts de ses versions. */
  dmdFolders: string[];
  /** Noms de PuP-Pack attendus d'après les scripts. */
  pupNames: string[];
  vps?: TableVps;
  /** Jeu VPS retenu, ou celui du .info d'une table installée. */
  vpsId?: string;
}

export function planImport(sources: ImportSource[], opts: PlanOptions): ImportPlan {
  const items: Item[] = [];
  const ignored: string[] = [];
  const dmdFolders = [
    ...[...(opts.scripts?.values() ?? [])].map((f) => f.dmdFolder),
    ...(opts.existing ?? []).map((k) => k.dmdFolder),
  ].filter((d): d is string => Boolean(d));
  sources.forEach((src, pkg) => collect(src, pkg, items, ignored, dmdFolders));

  const packages = sources.map((src) => ({ name: src.label ?? path.basename(src.path), isPack: src.unpacked || isDir(src.path) }));
  const games = groupGames(items.filter((i) => i.kind === 'table'), items, packages, opts);
  const leftovers: ImportPlan['leftovers'] = [];

  // Avec la bibliothèque, une ROM n'appartient pas à une table : elle va à la bibliothèque.
  const romItems: { item: Item; owner?: Game }[] = [];
  for (const item of items.filter((i) => i.kind !== 'table')) {
    const game = assign(item, games, packages, opts.vps);
    if (opts.romLibrary && item.kind === 'rom' && !item.isDir) romItems.push({ item, owner: game });
    else if (game) game.others.push(item);
    else leftovers.push({ source: item.source, reason: 'Je ne sais pas à quelle table il appartient : il reste où il est.' });
  }

  const planned = games.filter((g) => g.vpx.length || g.others.length);
  const roms = opts.romLibrary ? planRoms(romItems, games, planned, opts.romLibrary, opts.romChoices) : [];
  const linked = (g: Game) => roms.filter((r) => r.links.some((l) => samePath(l.folder, g.folder))).map((r) => r.key);
  return { tables: planned.map((g) => buildTablePlan(g, opts, linked(g))), leftovers, ignored, roms };
}

/**
 * ROM de l'import : chacune entre dans la bibliothèque (la version la plus récente,
 * ou celle choisie, si la bibliothèque en a déjà une autre), puis est liée dans
 * toutes les tables qui la jouent : celles dont le script la demande et qui n'en ont
 * aucune, celles qui en ont déjà une copie, et celle à laquelle l'import la destine.
 * Une nouvelle table dont la ROM est déjà dans la bibliothèque la reçoit aussi.
 */
function planRoms(romItems: { item: Item; owner?: Game }[], games: Game[], planned: Game[], library: string, choices = new Map<string, string>()): RomImport[] {
  const stored = listRoms(library);
  const byKey = new Map<string, { item: Item; owner?: Game }[]>();
  for (const r of romItems) {
    const key = romKey(path.basename(r.item.path));
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  // ROM déjà dans la bibliothèque que demande une table de l'import, sans l'avoir ni la recevoir.
  for (const g of planned) {
    const present = listRoms(tableRomsDir(g.folder));
    if (!g.roms.length || g.roms.some((r) => byKey.has(romKey(r)) || present.has(romKey(r)))) continue;
    const inLibrary = g.roms.find((r) => stored.has(romKey(r)));
    if (inLibrary && !byKey.has(romKey(inLibrary))) byKey.set(romKey(inLibrary), []);
  }

  const result: RomImport[] = [];
  for (const [key, incoming] of byKey) {
    const storedFile = stored.get(key);
    const name = storedFile ? path.basename(storedFile.path) : path.basename(incoming[0]!.item.path);
    const to = path.join(library, name);
    const versions: RomImportVersion[] = [];
    if (storedFile) versions.push({ hash: romHash(storedFile), size: storedFile.size, mtimeMs: storedFile.mtimeMs, label: 'bibliothèque', inLibrary: true });
    for (const { item } of incoming) {
      const file = romFile(item.path);
      if (!file) continue;
      const hash = romHash(file);
      if (!versions.some((v) => v.hash === hash)) versions.push({ hash, size: file.size, mtimeMs: file.mtimeMs, label: item.source, inLibrary: false, from: item.path, mode: item.mode });
    }
    // La plus récente d'abord ; à date égale, celle de la bibliothèque.
    versions.sort((a, b) => b.mtimeMs - a.mtimeMs || Number(b.inLibrary) - Number(a.inLibrary));
    const chosen = choices.get(key);
    const picked = chosen ? versions.findIndex((v) => v.hash === chosen) : -1;
    const keep = picked >= 0 ? picked : 0;
    const kept = versions[keep]!;

    const ops: FileOp[] = [];
    // La version gardée entre dans la bibliothèque ; l'ancienne y part à la corbeille.
    if (!kept.inLibrary) ops.push({ op: kept.mode!, from: kept.from!, to });
    const unused = incoming
      .filter(({ item }) => item.path !== kept.from)
      .map(({ item }) => ({ from: item.path, source: item.source, mode: item.mode }));
    for (const u of unused) if (u.mode === 'move') ops.push({ op: 'trash', path: u.from });

    // Tables qui la jouent : déjà une copie, demandée par le script sans en avoir aucune, ou destinataire de l'import.
    const links: RomImport['links'] = [];
    const owners = new Set(incoming.map((r) => r.owner).filter((g): g is Game => Boolean(g)));
    for (const g of games) {
      const present = listRoms(tableRomsDir(g.folder));
      const own = present.get(key);
      const wants = g.roms.some((r) => romKey(r) === key) && !g.roms.some((r) => present.has(romKey(r)));
      if (!own && !wants && !owners.has(g)) continue;
      const target = own?.path ?? path.join(tableRomsDir(g.folder), name);
      let state: RomImport['links'][number]['state'] = 'new';
      if (own) {
        if (kept.inLibrary && storedFile && sameRomFile(own, storedFile)) state = 'linked';
        else state = romHash(own) === kept.hash ? 'copy' : 'different';
      }
      links.push({ folder: g.folder, title: g.title, to: target, state, copy: !sameVolume(library, g.folder) });
      if (state !== 'linked') ops.push({ op: 'link', from: to, to: target });
    }
    result.push({ key, name, to, versions, keep, decided: picked >= 0, unused, links, ops });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Range une ROM du plan dans la bibliothèque et la lie dans ses tables (après applyImport des tables). */
export function applyRomImport(rom: RomImport, ctx: ImportContext): void {
  applyOps(rom.ops, ctx);
  for (const from of [rom.versions[rom.keep]?.from, ...rom.unused.map((u) => u.from)]) {
    if (!from) continue;
    const root = ctx.cleanupRoots.find((r) => isInside(from, r));
    if (root) pruneEmptyDirs(path.dirname(from), root);
  }
}

function collect(src: ImportSource, pkg: number, items: Item[], ignored: string[], dmdFolders: string[]): void {
  const label = src.label ?? path.basename(src.path);
  const push = (p: string, dir: boolean, kind: FileKind, parents: string[], source: string, media?: RecognizedMedia) => {
    if (kind === 'ignored') ignored.push(source);
    else items.push({ path: p, isDir: dir, kind, parents, pkg, source, mode: src.mode, ...(media ? { media } : {}) });
  };
  // Dossiers au-dessus d'une sélection (« …\POPMedia\Visual Pinball X\Wheel ») : ils disent comment lire les médias.
  const above = src.unpacked ? [] : path.resolve(src.path).split(/[\\/]+/).filter(Boolean).slice(0, -1);
  if (!isDir(src.path)) {
    const name = path.basename(src.path);
    const media = src.unpacked ? undefined : recognizeMedia(name, mediaFolder(above.at(-1) ?? '', above.slice(0, -1)));
    push(src.path, false, media ? 'media' : classifyFile(name), [], label, media);
    return;
  }
  const isDmdFolder = (name: string) => dmdFolders.some((d) => d.toLowerCase() === name.toLowerCase());
  const start = src.unpacked || isDmdFolder(path.basename(src.path)) ? undefined : mediaFolder(path.basename(src.path), above);
  const own = src.unpacked || start ? undefined : classifyDir(path.basename(src.path), src.path, [], dmdFolders);
  const context = src.unpacked ? [] : [...above, path.basename(src.path)];
  if (own) {
    push(src.path, true, own, [], label);
    return;
  }
  // Archive qui contient directement le pack (screens.pup à sa racine) : elle lui donne son nom.
  if (src.unpacked && isPackRoot(src.path) && !fs.readdirSync(src.path).some((f) => f.toLowerCase().endsWith('.vpx'))) {
    items.push({ path: src.path, isDir: true, kind: 'pup', parents: [], pkg, source: label, mode: src.mode, name: label.replace(/\.(zip|7z|rar)$/i, '') });
    return;
  }
  // Les médias rangés à la Popper, à la PinballX ou dans medias\ sont lus fichier par fichier.
  const walk = (dir: string, parents: string[], folder?: MediaFolder) => {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const siblings = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
    for (const dirent of dirents) {
      const p = path.join(dir, dirent.name);
      const source = [label, ...parents, dirent.name].join(' › ');
      if (dirent.isDirectory()) {
        const inner = folder
          ? mediaSubFolder(folder, dirent.name)
          : isDmdFolder(dirent.name)
            ? undefined
            : mediaFolder(dirent.name, [...context, ...parents], siblings);
        if (inner) {
          walk(p, [...parents, dirent.name], inner);
          continue;
        }
        const kind = classifyDir(dirent.name, p, parents, dmdFolders);
        if (kind) push(p, true, kind, parents, source);
        else walk(p, [...parents, dirent.name]);
      } else {
        const media = recognizeMedia(dirent.name, folder);
        push(p, false, media ? 'media' : classifyFile(dirent.name, parents), parents, source, media);
      }
    }
  };
  walk(src.path, [], start);
}

/** Les .vpx d'un même jeu (même titre, ou même paquet) forment une seule table. */
function groupGames(vpx: Item[], items: Item[], packages: { name: string; isPack: boolean }[], opts: PlanOptions): Game[] {
  const groups: Item[][] = [];
  for (const item of vpx) {
    const key = vpxKey(item);
    const group = groups.find((g) => g.some((o) => vpxKey(o) === key || (o.pkg === item.pkg && packages[item.pkg]!.isPack)));
    if (group) group.push(item);
    else groups.push([item]);
  }
  const games = groups.map((group) => describeGame(group, items, packages, opts));
  // Tables existantes : un complément (ROM seule, vidéos PuP…) peut leur être destiné.
  for (const known of opts.existing ?? []) {
    if (games.some((g) => samePath(g.folder, known.folder))) continue;
    games.push({
      vpx: [],
      others: [],
      key: nameKey(known.title),
      title: known.title,
      folderName: path.basename(known.folder),
      folder: known.folder,
      isNew: false,
      roms: known.roms,
      dmdFolders: known.dmdFolder ? [known.dmdFolder] : [],
      pupNames: known.pupNames ?? [],
      vpsId: known.vpsId,
    });
  }
  return games;
}

function vpxKey(item: Item): string {
  return nameKey(parseTableName(path.basename(item.path, path.extname(item.path))).title);
}

function describeGame(vpx: Item[], items: Item[], packages: { name: string; isPack: boolean }[], opts: PlanOptions): Game {
  const candidates = [
    ...vpx.map((v) => path.basename(v.path, path.extname(v.path))),
    ...new Set(vpx.filter((v) => packages[v.pkg]!.isPack).map((v) => packages[v.pkg]!.name.replace(/\.(zip|7z|rar)$/i, ''))),
    ...vpx.flatMap((v) => v.parents),
  ].map(parseTableName);
  // Le nom le plus complet (fabricant et année), puis le plus lisible (avec des espaces).
  const best = [...candidates].sort((a, b) => score(b) - score(a))[0]!;
  const manufacturer = best.manufacturer ?? candidates.find((c) => c.manufacturer)?.manufacturer;
  const year = best.year ?? candidates.find((c) => c.year)?.year;
  const fromFiles = { title: best.title, manufacturer, year, folderName: tableFolderName(best.title, manufacturer, year) };
  const roms = [...new Set(vpx.flatMap((v) => opts.scripts?.get(v.path.toLowerCase())?.roms ?? []))];
  const dmdFolders = vpx.map((v) => opts.scripts?.get(v.path.toLowerCase())?.dmdFolder).filter((d): d is string => Boolean(d));
  const pupNames = uniqueNames(vpx.flatMap((v) => expectedPackNames(opts.scripts?.get(v.path.toLowerCase()))));
  const vps = opts.vps ? describeVps(vpx, items, packages, roms, fromFiles, opts) : undefined;
  // Le jeu VPS retenu donne le nom ; sinon, celui déduit des fichiers.
  const game = vps?.chosen?.game;
  const named = game ? { title: game.name, manufacturer: game.manufacturer, year: game.year } : fromFiles;
  const folderName = tableFolderName(named.title, named.manufacturer, named.year);
  const keys = [nameKey(named.title), nameKey(fromFiles.title)];
  const folders = [folderName, fromFiles.folderName].map((f) => f.toLowerCase());
  const known = (opts.existing ?? []).find(
    (k) => (game && k.vpsId === game.id) || folders.includes(path.basename(k.folder).toLowerCase()) || keys.includes(nameKey(k.title)),
  );
  return {
    vpx,
    others: [],
    key: nameKey(fromFiles.title),
    title: known?.title ?? named.title,
    manufacturer: named.manufacturer,
    year: named.year,
    folderName: known ? path.basename(known.folder) : folderName,
    folder: known?.folder ?? path.join(opts.tablesDir, folderName),
    isNew: !known,
    roms: [...new Set([...roms, ...(known?.roms ?? [])])],
    dmdFolders: [...new Set([...dmdFolders, ...(known?.dmdFolder ? [known.dmdFolder] : [])])],
    pupNames: uniqueNames([...pupNames, ...(known?.pupNames ?? [])]),
    vps,
    vpsId: game?.id ?? known?.vpsId,
  };
}

/** Jeu VPS d'une table : reconnu d'après ses fichiers et sa ROM, ou choisi par l'utilisateur. */
function describeVps(
  vpx: Item[],
  items: Item[],
  packages: { name: string; isPack: boolean }[],
  roms: string[],
  fromFiles: TableVps['fromFiles'],
  opts: PlanOptions,
): TableVps {
  const pkgs = new Set(vpx.map((v) => v.pkg));
  // Le backglass du même paquet porte souvent le nom complet (« Terminator2(Williams1991) »).
  const backglasses = items.filter((i) => i.kind === 'backglass' && pkgs.has(i.pkg) && packages[i.pkg]!.isPack);
  const names = [
    ...vpx.map((v) => path.basename(v.path)),
    ...backglasses.map((b) => path.basename(b.path)),
    ...[...pkgs].filter((p) => packages[p]!.isPack).map((p) => packages[p]!.name),
    ...vpx.flatMap((v) => v.parents),
  ];
  const match = matchVps(opts.vps!, { names, roms });
  const key = vpx[0]!.path.toLowerCase();
  const choice = opts.vpsChoices?.get(key);
  let chosen = match.confident ? match.candidates[0] : undefined;
  if (choice === null) chosen = undefined;
  else if (choice) {
    const game = opts.vps!.games.find((g) => g.id === choice);
    chosen = match.candidates.find((c) => c.game.id === choice) ?? (game ? { game, score: 0 } : chosen);
  }
  return { key, candidates: match.candidates, confident: match.confident, chosen, decided: choice !== undefined, fromFiles };
}

function score(p: { title: string; manufacturer?: string; year?: number }): number {
  return (p.manufacturer ? 4 : 0) + (p.year ? 4 : 0) + (p.title.includes(' ') ? 2 : 0) + Math.min(p.title.length, 40) / 100;
}

function assign(item: Item, games: Game[], packages: { name: string; isPack: boolean }[], vps?: VpsDb): Game | undefined {
  // 1. Dans le même paquet qu'une seule table.
  const inPackage = games.filter((g) => g.vpx.some((v) => v.pkg === item.pkg));
  if (inPackage.length === 1 && packages[item.pkg]!.isPack) return inPackage[0];
  if (item.media) return assignMedia(item.media, games, vps);
  // 2. Nommé comme la ROM d'une table (ROM, couleurs, sons alternatifs, vidéos PuP),
  // ou comme le pack que son script charge.
  const name = (item.kind === 'pup' ? packOrigin(item) : path.basename(item.path).replace(/\.[^.]+$/, '')).toLowerCase();
  const parent = (item.parents.at(-1) ?? '').toLowerCase();
  const byRom = games.find((g) => g.roms.some((r) => r.toLowerCase() === name || (parent && r.toLowerCase() === parent)));
  if (byRom) return byRom;
  // Dossier DMD que charge le script d'une table, même nommé un peu autrement (« GooniesDMD »).
  if (item.kind === 'dmdFolder') {
    const own = dmdStem(path.basename(item.path));
    const close = (d: string) => {
      const wanted = dmdStem(d);
      return wanted === own || (Math.min(wanted.length, own.length) >= 4 && (wanted.includes(own) || own.includes(wanted)));
    };
    const byDmd =
      games.find((g) => g.dmdFolders.some((d) => d.toLowerCase() === path.basename(item.path).toLowerCase())) ??
      games.find((g) => g.dmdFolders.some(close));
    if (byDmd) return byDmd;
  }
  if (item.kind === 'pup') {
    const byPack = games.find((g) => g.pupNames.some((n) => n.toLowerCase() === name));
    if (byPack) return byPack;
  }
  // 3. Nommé comme la table.
  const key = nameKey(parseTableName(name).title);
  if (key.length >= 3) {
    const byName = games.find((g) => g.key.length >= 3 && (key === g.key || key.startsWith(g.key) || g.key.startsWith(key)));
    if (byName) return byName;
  }
  // 4. Une seule nouvelle table dans l'import : tout lui revient.
  const fresh = games.filter((g) => g.isNew);
  return fresh.length === 1 ? fresh[0] : undefined;
}

/**
 * Jeu d'un média d'après le nom qu'il porte (nom du jeu chez Popper et PinballX,
 * « (Type) <nom> », dossier de la table pour VPinFE) : nom d'un .vpx ou du
 * dossier, ROM, titre, jeu reconnu par la base VPS. Un média nommé d'après un
 * jeu absent de l'import reste où il est ; un média sans nom de jeu (bg.png
 * seul) revient à la seule nouvelle table de l'import.
 */
function assignMedia(media: RecognizedMedia, games: Game[], vps?: VpsDb): Game | undefined {
  const names = mediaGameNames(media.game);
  if (!names.length) {
    const fresh = games.filter((g) => g.isNew);
    return fresh.length === 1 ? fresh[0] : undefined;
  }
  const lower = names.map((n) => n.toLowerCase());
  const only = (found: Game[]) => (found.length === 1 ? found[0] : undefined);
  const stem = (v: Item) => path.basename(v.path, path.extname(v.path)).toLowerCase();
  const byName = only(games.filter((g) => lower.includes(g.folderName.toLowerCase()) || g.vpx.some((v) => lower.includes(stem(v)))));
  if (byName) return byName;
  const byRom = only(games.filter((g) => g.roms.some((r) => lower.includes(r.toLowerCase()))));
  if (byRom) return byRom;
  for (const n of names) {
    const key = nameKey(parseTableName(n).title);
    if (key.length < 3) continue;
    const byTitle =
      only(games.filter((g) => key === g.key || key === nameKey(g.title))) ??
      only(games.filter((g) => g.key.length >= 3 && (key.startsWith(g.key) || g.key.startsWith(key))));
    if (byTitle) return byTitle;
  }
  if (vps) {
    for (const n of names) {
      const m = matchVps(vps, { names: [n] });
      const byVps = m.confident ? only(games.filter((g) => g.vpsId === m.candidates[0]!.game.id)) : undefined;
      if (byVps) return byVps;
    }
  }
  return undefined;
}

/** Nom d'un dossier DMD sans son suffixe : « TheGooniesDMD » → « thegoonies ». */
function dmdStem(name: string): string {
  return nameKey(name).replace(/(ultradmd|flexdmd|dmd)$/, '');
}

/** linkedRoms : ROM (clés) que la bibliothèque liera dans cette table. */
function buildTablePlan(game: Game, opts: PlanOptions, linkedRoms: string[] = []): TablePlan {
  const steps: ImportStep[] = [];
  const warnings: string[] = [];
  const infoSources: TablePlan['infoSources'] = [];
  const vpxBases = [
    ...game.vpx.map((v) => path.basename(v.path, path.extname(v.path)).toLowerCase()),
    ...listSafe(game.folder)
      .filter((f) => f.toLowerCase().endsWith('.vpx'))
      .map((f) => f.slice(0, -4).toLowerCase()),
  ];
  const add = (item: Item, target: string, from = item.path): ImportStep | undefined => {
    const to = path.join(game.folder, target);
    if (steps.some((s) => samePath(s.to, to))) {
      warnings.push(`${item.source} : un autre fichier va déjà à « ${target} », celui-ci reste où il est.`);
      return undefined;
    }
    const base = path.basename(from);
    const step: ImportStep = {
      kind: item.kind,
      from,
      source: item.source,
      to,
      target,
      mode: item.mode,
      isDir: item.isDir,
      renamed: path.basename(target) !== base,
      replaces: fs.existsSync(to),
    };
    steps.push(step);
    return step;
  };
  // Un fichier sans place connue garde sa position par rapport au .vpx de son paquet :
  // un sous-dossier que le script charge (images, sons, DMD) n'est pas vidé à la racine.
  const keepPlace = (item: Item, name: string): string => {
    const home = game.vpx
      .filter((v) => v.pkg === item.pkg && v.parents.length <= item.parents.length && v.parents.every((p, i) => p.toLowerCase() === item.parents[i]!.toLowerCase()))
      .sort((a, b) => b.parents.length - a.parents.length)[0];
    if (home) return path.join(...item.parents.slice(home.parents.length), name);
    if (item.parents.length) {
      warnings.push(`« ${name} » était dans « ${item.parents.join('\\')} » : il est rangé à la racine de la table. Si la table ne le trouve pas, rangez-le à la main.`);
    }
    return name;
  };

  // Le .info est nommé comme le dossier : il vaut pour toutes les versions.
  const infoFile = path.join(game.folder, `${game.folderName}.info`);
  const info: TableInfoFile = readInfo(infoFile);

  for (const item of game.vpx) add(item, path.basename(item.path));

  // Backglass : celui qui est nommé comme une table reste tel quel ; le meilleur des
  // autres prend le nom du dossier, partagé entre toutes les versions de la table.
  const b2s = game.others.filter((i) => i.kind === 'backglass');
  const named = b2s.filter((i) => vpxBases.includes(path.basename(i.path, path.extname(i.path)).toLowerCase()));
  for (const item of named) add(item, path.basename(item.path));
  const rest = b2s.filter((i) => !named.includes(i));
  if (rest.length) {
    const bestName = bestMatch(
      rest.map((i) => path.basename(i.path)),
      [game.title, ...game.vpx.map((v) => path.basename(v.path))],
    );
    const best = rest.find((i) => path.basename(i.path) === bestName)!;
    if (!named.length) add(best, `${game.folderName}.directb2s`);
    for (const item of rest.filter((i) => named.length || i !== best)) {
      warnings.push(`Backglass supplémentaire « ${path.basename(item.path)} » : VPX ne l'affichera pas, il est rangé quand même.`);
      add(item, path.basename(item.path));
    }
  }

  const incomingMedias: IncomingMedia[] = [];
  for (const item of game.others) {
    const name = path.basename(item.path);
    const stem = name.replace(/\.[^.]+$/, '');
    switch (item.kind) {
      case 'backglass':
        break;
      case 'rom':
        add(item, path.join('pinmame', 'roms', name));
        break;
      case 'nvram':
        add(item, path.join('pinmame', 'nvram', name));
        break;
      case 'pinmame': {
        const at = item.parents.findIndex((p) => p.toLowerCase() === 'pinmame');
        add(item, path.join('pinmame', ...item.parents.slice(at + 1), name));
        break;
      }
      case 'pup':
        planPack(item, game, opts, info, add);
        break;
      case 'altsound':
        add(item, path.join('altsound', name));
        break;
      case 'serum':
      case 'vni':
        add(item, item.isDir ? path.join(item.kind, name) : path.join(item.kind, stem, name));
        break;
      case 'media':
        // Média reconnu : renommé « (Type) <dossier> », plus bas avec les autres du même type.
        if (item.media) incomingMedias.push({ from: item.path, source: item.source, media: item.media });
        else add(item, item.isDir ? 'medias' : path.join('medias', name));
        break;
      case 'music':
        add(item, item.isDir ? 'music' : path.join('music', name));
        break;
      case 'script':
        if (!item.isDir && vpxBases.includes(stem.toLowerCase())) {
          item.kind = 'scriptOverride';
          warnings.push(`« ${name} » remplace le script de la table : gardez-le seulement si l'auteur le demande.`);
          add(item, name);
        } else add(item, item.isDir ? 'scripts' : path.join('scripts', name));
        break;
      case 'tableIni':
      case 'pov': {
        if (vpxBases.includes(stem.toLowerCase())) add(item, name);
        else if (game.vpx.length === 1 && nameKey(parseTableName(stem).title).startsWith(game.key.slice(0, 4))) {
          add(item, `${path.basename(game.vpx[0]!.path, '.vpx')}${path.extname(name)}`);
        } else add(item, name);
        break;
      }
      case 'info':
        infoSources.push({ from: item.path, mode: item.mode });
        break;
      case 'user':
        add(item, 'user');
        break;
      case 'dmdFolder':
        // Le script charge un nom précis : un dossier nommé autrement (« GooniesDMD ») prend ce nom.
        add(item, item.isDir && game.dmdFolders.length === 1 ? game.dmdFolders[0]! : keepPlace(item, name));
        break;
      default:
        add(item, keepPlace(item, name));
    }
  }

  // Médias : un par type (toutes les pages du prospectus et des règles), l'ancien du même type à la corbeille.
  if (incomingMedias.length) {
    const vpxNames = [...new Set([...game.vpx.map((v) => path.basename(v.path, path.extname(v.path))), ...listSafe(game.folder).filter((f) => /\.vpx$/i.test(f)).map((f) => f.slice(0, -4))])];
    const dest = { dir: path.join(game.folder, 'medias'), name: game.folderName, names: [game.folderName, ...vpxNames] };
    const { planned, skipped } = arrangeMedias(dest, incomingMedias);
    for (const m of planned) {
      const item = game.others.find((i) => i.path === m.from)!;
      const step = add(item, path.join('medias', m.target));
      if (!step) continue;
      step.media = { type: m.type, page: m.page, frontend: m.frontend, trash: m.trash };
      step.replaces = m.replaces;
    }
    for (const s of skipped) warnings.push(`${s.source} : ${s.reason}`);
  }

  for (const src of infoSources) {
    const extra = readInfo(src.from);
    info.Info = { ...extra.Info, ...info.Info };
    if (extra.User && !info.User) info.User = extra.User;
  }
  info.Info = { ...info.Info };
  info.Info.Title ??= game.title;
  if (game.manufacturer) info.Info.Manufacturer ??= game.manufacturer;
  if (game.year) info.Info.Year ??= game.year;
  if (game.vps?.chosen) {
    const { game: vps, table } = game.vps.chosen;
    info.Info.VPSId ??= vps.id;
    if (table?.authors?.length) info.Info.Authors ??= [...table.authors];
    const ipdb = ipdbIdOf(vps);
    if (ipdb) info.Info.IPDBId ??= ipdb;
  }
  // Option et nom d'origine de chaque pack : l'option est réappliquée à la mise à jour du pack.
  for (const pack of steps.flatMap((s) => (s.pack ? [s.pack] : []))) {
    const memory = { ...(pack.choice.chosen ? { option: pack.choice.chosen.label } : {}), origin: pack.origin };
    info.CyberPinball = setPupMemory(info, pack.name, memory).CyberPinball;
  }

  const romsPresent = [...steps.filter((s) => s.kind === 'rom').map((s) => path.basename(s.to, '.zip').toLowerCase()), ...linkedRoms];
  const romsInstalled = listSafe(path.join(game.folder, 'pinmame', 'roms')).map((f) => f.replace(/\.zip$/i, '').toLowerCase());
  if (game.roms.length && !game.roms.some((r) => romsPresent.includes(r.toLowerCase()) || romsInstalled.includes(r.toLowerCase()))) {
    warnings.push(`La ROM « ${game.roms[0]} » n'est pas dans l'import : la table ne démarrera pas sans elle.`);
  }
  if (!game.isNew && !game.vpx.length && !steps.length) warnings.push('Rien à ajouter à cette table.');

  return {
    title: info.Info.Title ?? game.title,
    manufacturer: game.manufacturer,
    year: game.year,
    folderName: game.folderName,
    folder: game.folder,
    isNew: game.isNew && !fs.existsSync(game.folder),
    steps,
    infoFile,
    info,
    infoSources,
    roms: game.roms,
    warnings,
    vps: game.vps,
  };
}

export interface ImportContext extends OpContext {
  /** Dossiers sources à nettoyer une fois vidés (dossier d'import, dossier de déballage). */
  cleanupRoots: string[];
}

/** Exécute le plan validé d'une table. */
export function applyImport(plan: TablePlan, ctx: ImportContext): void {
  fs.mkdirSync(plan.folder, { recursive: true });
  const ops: FileOp[] = [];
  for (const s of plan.steps) {
    // Un pack se remplace en entier : jamais de mélange d'anciens et de nouveaux fichiers.
    if (s.pack?.replaces && fs.existsSync(s.pack.replaces)) ops.push({ op: 'trash', path: s.pack.replaces });
    for (const old of s.media?.trash ?? []) if (fs.existsSync(old)) ops.push({ op: 'trash', path: old });
    ops.push({ op: s.mode, from: s.from, to: s.to });
    if (s.pack) ops.push(...packOps(s.to, s.pack));
  }
  applyOps(ops, ctx);
  const tmp = `${plan.infoFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(plan.info, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, plan.infoFile);
  for (const src of plan.infoSources) {
    if (src.mode === 'move' && fs.existsSync(src.from) && !samePath(src.from, plan.infoFile)) moveToTrash(src.from, ctx);
  }
  for (const step of [...plan.steps, ...plan.infoSources.map((s) => ({ from: s.from, mode: s.mode }))]) {
    if (step.mode !== 'move') continue;
    const root = ctx.cleanupRoots.find((r) => isInside(step.from, r));
    if (root) pruneEmptyDirs(path.dirname(step.from), root);
  }
}

/** Une fois le pack en place : retrait des fichiers inutiles, puis l'option retenue, recopiée comme le ferait son .bat. */
function packOps(dir: string, pack: PackPlan): FileOp[] {
  const v = pack.choice.chosen;
  return [
    ...pack.junk.map((j) => ({ op: 'delete' as const, path: path.join(dir, j) })),
    ...(v?.copies ?? []).map((c) => ({ op: 'copy' as const, from: path.join(dir, c.from), to: path.join(dir, c.to) })),
    ...(v?.deletes ?? []).map((d) => ({ op: 'trash' as const, path: path.join(dir, d) })),
  ];
}

type AddStep = (item: Item, target: string, from?: string) => ImportStep | undefined;

/** Nom d'origine d'un pack : celui de sa vraie racine, ou de l'archive qui ne contenait que lui. */
function packOrigin(item: Item): string {
  const root = findPackRoot(item.path) ?? item.path;
  return item.name && samePath(root, item.path) ? item.name : path.basename(root);
}

/**
 * Range un PuP-Pack dans pupvideos\<nom attendu> : nom lu dans le script (B2SInit,
 * puis la ROM), imbrications aplaties, fichiers inutiles retirés, option choisie
 * d'office d'après la borne ou reprise de l'installation précédente.
 */
function planPack(item: Item, game: Game, opts: PlanOptions, info: TableInfoFile, add: AddStep): void {
  const root = findPackRoot(item.path) ?? item.path;
  const origin = packOrigin(item);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const expected = game.pupNames;
  const name = expected.find((n) => same(n, origin)) ?? expected[0] ?? origin;
  const pupvideos = path.join(game.folder, 'pupvideos');
  const existing = listSafe(pupvideos).find((f) => same(f, name));
  const step = add(item, path.join('pupvideos', name), root);
  if (!step) return;
  const analysis = analysePack(root);
  const key = step.to.toLowerCase();
  const picked = opts.pupChoices?.get(key);
  const remembered = existing ? pupMemory(info, name)?.option : undefined;
  let choice = chooseVariant(analysis.variants, opts.cabinet, remembered);
  const chosen = picked ? analysis.variants.find((v) => v.label === picked) : undefined;
  if (chosen) choice = { chosen, confident: true, reason: choice.reason };
  step.renamed = path.basename(step.to) !== origin;
  step.replaces = Boolean(existing);
  step.pack = {
    key,
    origin,
    name,
    nameFrom: expected.length ? 'script' : 'folder',
    expected,
    flattened: !samePath(root, item.path),
    replaces: existing ? path.join(pupvideos, existing) : undefined,
    variants: analysis.variants,
    failedBats: analysis.bats.filter((b) => !b.ok),
    choice,
    decided: Boolean(chosen),
    junk: analysis.junk,
    noPupFiles: !analysis.pupFiles.length && !analysis.variants.length,
  };
}

function uniqueNames(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  return out;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
