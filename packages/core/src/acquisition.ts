// Acquisition de nouvelles tables et de ce qu'elles demandent (docs/recherche/acquisition.md,
// étapes A3 à A7) : catalogue de la base VPS, version conseillée, liste de ce qu'il faut
// pour une borne (table, fronton, ROM, PuP-Pack…), liste d'attente de ce que
// l'utilisateur récupère, rattachement d'un fichier téléchargé à ce qu'il attendait,
// provenance notée dans le .info et mises à jour disponibles.
//
// Cyber Pinball ne télécharge rien à la place de l'utilisateur : presque tous les liens
// de VPS mènent à des pages de forum qui demandent un compte, dont les conditions
// interdisent les robots et le ré-hébergement, et aucun fabricant n'autorise la
// diffusion des ROM pour l'émulation (§ 3 et § 6 de la recherche). L'application montre
// ce qu'il faut, ouvre la bonne page, voit arriver le fichier et le range.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Cabinet } from './model';
import { dmdMediaType } from './medias';
import type { TableInfoFile } from './tables';
import { matchVps, searchVps, vpsKey, type VpsDb, type VpsGame, type VpsLink, type VpsTableFile } from './vps';

// ---------------------------------------------------------------------------
// Hôtes des liens

export type LinkHostId = 'vpuniverse' | 'vpforums' | 'pinballnirvana' | 'pinsound' | 'mega' | 'gdrive' | 'dropbox' | 'stern' | 'ipdb' | 'youtube' | 'other';

export interface LinkHost {
  id: LinkHostId;
  /** Nom montré : « vpuniverse.com ». */
  label: string;
  /** Il faut un compte pour télécharger (constaté le 22/10/2026, § 3 de la recherche). */
  account: boolean;
}

const HOSTS: { id: LinkHostId; pattern: RegExp; label: string; account: boolean }[] = [
  { id: 'vpuniverse', pattern: /(^|\.)vpuniverse\.com$/i, label: 'vpuniverse.com', account: true },
  { id: 'vpforums', pattern: /(^|\.)vpforums\.org$/i, label: 'vpforums.org', account: true },
  { id: 'pinballnirvana', pattern: /(^|\.)pinballnirvana\.com$/i, label: 'pinballnirvana.com', account: true },
  { id: 'pinsound', pattern: /(^|\.)pinsound-community\.org$/i, label: 'pinsound-community.org', account: true },
  { id: 'mega', pattern: /(^|\.)mega\.(nz|io)$/i, label: 'mega.nz', account: false },
  { id: 'gdrive', pattern: /^drive\.google\.com$/i, label: 'Google Drive', account: false },
  { id: 'dropbox', pattern: /(^|\.)dropbox\.com$/i, label: 'Dropbox', account: false },
  { id: 'stern', pattern: /(^|\.)sternpinball\.com$/i, label: 'sternpinball.com', account: true },
  { id: 'ipdb', pattern: /(^|\.)ipdb\.org$/i, label: 'ipdb.org', account: false },
  { id: 'youtube', pattern: /(^|\.)(youtube\.com|youtu\.be)$/i, label: 'YouTube', account: false },
];

/** Hôte d'un lien de VPS, et s'il faut un compte pour y télécharger. */
export function linkHost(url: string): LinkHost {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return { id: 'other', label: url, account: false };
  }
  const known = HOSTS.find((h) => h.pattern.test(host));
  return known ? { id: known.id, label: known.label, account: known.account } : { id: 'other', label: host.replace(/^www\./, ''), account: false };
}

/**
 * Clé de la fiche d'un fichier, stable quelle que soit la forme de l'adresse :
 * « vpu:21723 » (vpuniverse.com/files/file/21723-…), « vpf:7318 » (showfile=7318),
 * « pn:4321 » (pinballnirvana.com/forums/resources/<slug>.4321). Sert à rattacher un
 * téléchargement à ce qu'on attendait : la chaîne de redirections passe par la fiche.
 */
export function pageKey(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = linkHost(url).id;
  if (host === 'vpuniverse' || host === 'pinsound') {
    const m = /\/files\/file\/(\d+)/.exec(u.pathname) ?? /[?&/]file\/(\d+)/.exec(u.search + u.pathname);
    return m ? `${host === 'vpuniverse' ? 'vpu' : 'pinsound'}:${m[1]}` : undefined;
  }
  if (host === 'vpforums') {
    const id = u.searchParams.get('showfile') ?? u.searchParams.get('id');
    return id && /^\d+$/.test(id) ? `vpf:${id}` : undefined;
  }
  if (host === 'pinballnirvana') {
    const m = /\/resources\/(?:[^/]*\.)?(\d+)/.exec(u.pathname);
    return m ? `pn:${m[1]}` : undefined;
  }
  return undefined;
}

/** Liens d'un fichier qui ne sont pas signalés morts, dans l'ordre de VPS. */
export function liveLinks(file: { urls?: VpsLink[] }): VpsLink[] {
  return (file.urls ?? []).filter((l) => typeof l.url === 'string' && /^https?:\/\//i.test(l.url) && !l.broken);
}

// ---------------------------------------------------------------------------
// Catalogue

/** Versions VPX d'un jeu, la plus récemment mise à jour d'abord. */
export function vpxVersions(game: VpsGame): VpsTableFile[] {
  return (game.tableFiles ?? [])
    .filter((f) => f && (f.tableFormat ?? 'VPX').toUpperCase() === 'VPX')
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

const hasFeature = (file: { features?: string[] }, feature: string) => (file.features ?? []).some((f) => f.toLowerCase() === feature.toLowerCase());

/** Cette version se joue sans ROM : jeu électromécanique ou mécanique, ou version marquée « no ROM ». */
export function versionWithoutRom(game: VpsGame, file: VpsTableFile): boolean {
  return /^(EM|PM)$/i.test(game.type ?? '') || hasFeature(file, 'no ROM');
}

/** Au moins une version VPX se joue sans ROM (960 jeux sur 2 366 le 22/10/2026). */
export function playableWithoutRom(game: VpsGame): boolean {
  return vpxVersions(game).some((f) => versionWithoutRom(game, f));
}

export type CatalogKind = 'all' | 'ss' | 'em' | 'original' | 'norom';
export type CatalogState = 'all' | 'missing' | 'installed';
export type CatalogSort = 'name' | 'recent';

export interface CatalogFilter {
  /** Titre, initiales, nom de ROM. */
  text?: string;
  kind?: CatalogKind;
  state?: CatalogState;
  vr?: boolean;
  pup?: boolean;
  sort?: CatalogSort;
}

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  all: 'tous les jeux',
  ss: 'électroniques',
  em: 'électromécaniques',
  original: 'créations originales',
  norom: 'sans ROM à trouver',
};

export const CATALOG_STATE_LABELS: Record<CatalogState, string> = {
  all: 'installés ou non',
  missing: 'pas encore installés',
  installed: 'déjà installés',
};

/**
 * Jeux du catalogue : ceux qui ont au moins une version VPX, filtrés et triés. Avec un
 * texte, l'ordre est celui de la recherche (le plus ressemblant d'abord).
 */
export function catalog(db: VpsDb, filter: CatalogFilter, installed: Set<string>): VpsGame[] {
  const keep = (g: VpsGame) => {
    if (!vpxVersions(g).length) return false;
    switch (filter.kind ?? 'all') {
      case 'ss':
        if (!/^SS$/i.test(g.type ?? '')) return false;
        break;
      case 'em':
        if (!/^(EM|PM)$/i.test(g.type ?? '')) return false;
        break;
      case 'original':
        if (!/^original$/i.test(g.manufacturer ?? '')) return false;
        break;
      case 'norom':
        if (!playableWithoutRom(g)) return false;
        break;
    }
    if (filter.state === 'installed' && !installed.has(g.id)) return false;
    if (filter.state === 'missing' && installed.has(g.id)) return false;
    if (filter.vr && !vpxVersions(g).some((f) => hasFeature(f, 'VR'))) return false;
    if (filter.pup && !(g.pupPackFiles?.length || vpxVersions(g).some((f) => hasFeature(f, 'incl. PuP')))) return false;
    return true;
  };
  const text = filter.text?.trim();
  if (text) return searchVps(db, text, 60).map((c) => c.game).filter(keep);
  const games = db.games.filter(keep);
  if ((filter.sort ?? 'name') === 'recent') return games.sort((a, b) => lastUpdate(b) - lastUpdate(a));
  return games.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', ignorePunctuation: true }) || (a.year ?? 0) - (b.year ?? 0));
}

/** Dernière nouveauté d'un jeu : la plus récente de ses versions VPX. */
export function lastUpdate(game: VpsGame): number {
  return Math.max(0, ...vpxVersions(game).map((f) => f.updatedAt ?? 0));
}

/** Jeux VPS des tables installées : identifiant du .info, ou provenance notée. */
export function installedGames(infos: TableInfoFile[]): Set<string> {
  const ids = new Set<string>();
  for (const info of infos) {
    const id = typeof info.Info?.VPSId === 'string' ? info.Info.VPSId.trim() : '';
    if (id) ids.add(id);
    const source = tableSourceOf(info);
    if (source) ids.add(source.vpsGameId);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Version conseillée

export interface VersionAdvice {
  file: VpsTableFile;
  /** Pourquoi celle-ci, en clair. */
  reasons: string[];
}

/** Collectif VPW (VPin Workshop) : tables refaites à fond, physique nFozzy, sons Fleep. */
const isVpw = (f: VpsTableFile) => (f.authors ?? []).some((a) => vpsKey(a) === 'vpw');

/**
 * Version conseillée d'un jeu : parmi celles qui ont encore un lien, pas un MOD (une
 * reprise personnelle d'une autre version) si l'on peut, VPW de préférence, la plus
 * récemment mise à jour. undefined si aucune version n'a de lien vivant.
 */
export function recommendVersion(game: VpsGame): VersionAdvice | undefined {
  const versions = vpxVersions(game).filter((f) => liveLinks(f).length);
  if (!versions.length) return undefined;
  const score = (f: VpsTableFile) => (hasFeature(f, 'MOD') ? -2 : 0) + (isVpw(f) ? 1 : 0);
  const best = [...versions].sort((a, b) => score(b) - score(a) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]!;
  const reasons: string[] = [];
  if (isVpw(best)) reasons.push('table de VPW (VPin Workshop), refaite à fond');
  if (!hasFeature(best, 'MOD')) reasons.push('version d’origine, pas un MOD');
  if (best === versions[0]) reasons.push('la plus récemment mise à jour');
  else if (best.updatedAt) reasons.push(`mise à jour le ${formatDay(best.updatedAt)}`);
  if (versions.length > 1) reasons.push(`${versions.length - 1} autre${versions.length > 2 ? 's' : ''} version${versions.length > 2 ? 's' : ''} au choix`);
  return { file: best, reasons };
}

export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** « VPW, Sixtoe 1.25 » */
export function versionLabel(file: { authors?: string[]; version?: string }): string {
  const authors = (file.authors ?? []).slice(0, 3).join(', ') + ((file.authors?.length ?? 0) > 3 ? '…' : '');
  return [authors, file.version].filter(Boolean).join(' ') || 'version sans auteur';
}

// ---------------------------------------------------------------------------
// Ce qu'il faut pour une version

export type NeedKind = 'table' | 'b2s' | 'rom' | 'pup' | 'altsound' | 'altcolor' | 'music' | 'topper' | 'pov';

export const NEED_LABELS: Record<NeedKind, string> = {
  table: 'Table',
  b2s: 'Fronton (.directb2s)',
  rom: 'ROM',
  pup: 'PuP-Pack',
  altsound: 'Sons remasterisés (altsound)',
  altcolor: 'Couleurs du DMD (altcolor)',
  music: 'Musique',
  topper: 'Topper',
  pov: 'Point de vue (POV)',
};

export type NeedState = 'have' | 'included' | 'todo' | 'optional' | 'useless' | 'unavailable';

export interface Need {
  kind: NeedKind;
  /** Indispensable pour jouer. */
  required: boolean;
  state: NeedState;
  /** Ce qu'il faut savoir, en clair : « dans la bibliothèque », « fournie avec la table »… */
  detail: string;
  /** Fichiers de VPS qui conviennent, le plus adapté d'abord. */
  files: VpsTableFile[];
  /** ROM : noms possibles (t2_l8). */
  roms?: string[];
}

/** Écrans de la borne qui changent ce qu'il faut : fronton, afficheur, topper. */
export interface CabinetScreens {
  backglass: boolean;
  /** Afficheur : absent, étroit (4:1) ou large (16:9). */
  dmd: 'none' | 'small' | 'full';
  topper: boolean;
}

export function cabinetScreens(cabinet: Cabinet | undefined): CabinetScreens {
  if (!cabinet) return { backglass: true, dmd: 'full', topper: false };
  const dmd = cabinet.roles.dmd ? (dmdMediaType(cabinet) === 'DMD' ? 'small' : 'full') : 'none';
  return { backglass: Boolean(cabinet.roles.backglass), dmd, topper: Boolean(cabinet.roles.topper) };
}

export interface NeedContext {
  screens: CabinetScreens;
  /** ROM présentes (bibliothèque et tables), noms en minuscules. */
  roms: Set<string>;
  /** La table de cette version est déjà installée. */
  installed?: boolean;
}

const withLinks = <T extends { urls?: VpsLink[] }>(files: T[] | undefined): T[] => (files ?? []).filter((f) => liveLinks(f).length);
const recent = (a: { updatedAt?: number }, b: { updatedAt?: number }) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

/**
 * Ce qu'il faut pour jouer cette version sur cette borne, sans rien télécharger :
 * la table, le fronton (sauf s'il est fourni avec la table, ou sans écran de fronton),
 * la ROM (sauf jeu sans ROM ou ROM fournie), puis les compléments facultatifs.
 */
export function requirements(game: VpsGame, version: VpsTableFile, ctx: NeedContext): Need[] {
  const needs: Need[] = [];
  needs.push({
    kind: 'table',
    required: true,
    state: ctx.installed ? 'have' : liveLinks(version).length ? 'todo' : 'unavailable',
    detail: ctx.installed ? 'déjà installée sur cette borne' : liveLinks(version).length ? `${versionLabel(version)}, à récupérer` : 'aucun lien vivant pour cette version : choisissez-en une autre',
    files: [version],
  });

  // Fronton : celui qui convient aux écrans de la borne d'abord.
  const b2s = withLinks(game.b2sFiles).map((f) => f as VpsTableFile);
  const fits = (f: VpsTableFile) => (ctx.screens.dmd === 'full' ? hasFeature(f, 'FullDMD') || hasFeature(f, '3Screens') : ctx.screens.dmd === 'small' ? hasFeature(f, '3Screens') : hasFeature(f, '2Screens'));
  b2s.sort((a, b) => Number(fits(b)) - Number(fits(a)) || recent(a, b));
  if (hasFeature(version, 'incl. B2S')) needs.push({ kind: 'b2s', required: false, state: 'included', detail: 'fourni avec la table', files: [] });
  else if (!ctx.screens.backglass) needs.push({ kind: 'b2s', required: false, state: 'useless', detail: 'cette borne n’a pas d’écran de fronton', files: b2s });
  else if (b2s.length) needs.push({ kind: 'b2s', required: false, state: 'todo', detail: `conseillé : ${b2s.length} fronton${b2s.length > 1 ? 's' : ''}, ${fits(b2s[0]!) ? 'le premier va avec les écrans de la borne' : 'aucun annoncé pour les écrans de la borne'}`, files: b2s });
  else needs.push({ kind: 'b2s', required: false, state: 'unavailable', detail: 'aucun fronton connu de VPS : le menu en dessinera un', files: [] });

  // ROM.
  if (!versionWithoutRom(game, version)) {
    const roms = [...new Set((game.romFiles ?? []).map((r) => (r.version ?? '').trim()).filter(Boolean))];
    const present = roms.filter((r) => ctx.roms.has(r.toLowerCase()));
    if (hasFeature(version, 'incl. ROM')) needs.push({ kind: 'rom', required: true, state: 'included', detail: 'fournie avec la table', files: [], roms });
    else if (present.length) needs.push({ kind: 'rom', required: true, state: 'have', detail: `${present.join(', ')} : déjà sur la borne`, files: [], roms });
    else {
      const files = withLinks(game.romFiles).map((r) => ({ ...r, id: r.id ?? `rom:${r.version}` }) as VpsTableFile).sort(recent);
      needs.push({
        kind: 'rom',
        required: true,
        state: files.length ? 'todo' : 'unavailable',
        detail: roms.length ? `${roms.join(' ou ')} : à récupérer, si vous y avez droit` : 'nom inconnu de VPS : le script de la table le dira une fois installée',
        files,
        roms,
      });
    }
  }

  // Compléments facultatifs.
  const optional = (kind: NeedKind, files: VpsTableFile[] | undefined, detail: string, included?: string) => {
    if (included && hasFeature(version, included)) return needs.push({ kind, required: false, state: 'included', detail: 'fourni avec la table', files: [] });
    const usable = withLinks(files).sort(recent);
    if (usable.length) needs.push({ kind, required: false, state: 'optional', detail, files: usable });
  };
  optional('pup', game.pupPackFiles, 'facultatif : vidéos sur le fronton et l’afficheur pendant la partie', 'incl. PuP');
  optional('altsound', game.altSoundFiles, 'facultatif : sons du jeu remasterisés');
  if (ctx.screens.dmd !== 'none') optional('altcolor', game.altColorFiles, 'facultatif : DMD en couleurs');
  optional('music', game.soundFiles, 'facultatif : musique pour la table');
  if (ctx.screens.topper) optional('topper', game.topperFiles, 'facultatif : animation du topper');
  optional('pov', game.povFiles, 'facultatif : réglage du point de vue de la caméra');
  return needs;
}

// ---------------------------------------------------------------------------
// Liste d'attente

export type WaitState = 'waiting' | 'received' | 'installed';

export interface WaitItem {
  /** Identifiant stable : « <jeu>:<fichier> ». */
  id: string;
  gameId: string;
  /** « Terminator 2 - Judgment Day (Williams 1991) » */
  gameLabel: string;
  kind: NeedKind;
  /** Fichier VPS attendu (table, fronton, ROM…). */
  fileId: string;
  /** « VPW, G5k 1.25 » */
  label: string;
  version?: string;
  authors?: string[];
  /** Mise à jour du fichier chez VPS au moment de l'ajout (pour les mises à jour). */
  updatedAt?: number;
  /** Page ouverte pour le récupérer, et sa clé (pageKey). */
  page: string;
  pageKey?: string;
  /** ROM attendue (nom du zip). */
  rom?: string;
  addedAt: string;
  state: WaitState;
  received?: { file: string; at: string; via: 'window' | 'watch' | 'manual'; url?: string };
}

export interface WaitList {
  items: WaitItem[];
  /** Avertissement du catalogue lu et accepté (date ISO). */
  noticeAcceptedAt?: string;
  /** Surveiller le dossier Téléchargements tant que quelque chose est attendu (choix de l'utilisateur). */
  watchDownloads?: boolean;
  /** « Récupérer » télécharge directement avec la connexion gardée, sans montrer la page (choix de l'utilisateur). */
  directDownload?: boolean;
}

/** Avertissement montré au premier usage du catalogue. */
export const ACQUISITION_NOTICE =
  'Les tables appartiennent à leurs auteurs, les ROM aux fabricants des jeux. Cyber Pinball ne télécharge rien à votre place : il ouvre les pages, vous vous connectez et téléchargez vous-même, puis il range ce que vous avez récupéré. Aucun fabricant n’autorise la diffusion de ses ROM pour l’émulation : ne récupérez une ROM que si vous y avez droit.';

/** <données>\acquisition.json */
export function waitListFile(dataDir: string): string {
  return path.join(dataDir, 'acquisition.json');
}

export function loadWaitList(dataDir: string): WaitList {
  try {
    const raw = JSON.parse(fs.readFileSync(waitListFile(dataDir), 'utf8').replace(/^﻿/, '')) as { items?: unknown };
    const items = Array.isArray(raw.items) ? raw.items.filter((i): i is WaitItem => Boolean(i) && typeof (i as WaitItem).id === 'string' && typeof (i as WaitItem).gameId === 'string') : [];
    const r = raw as WaitList;
    const list: WaitList = { items };
    if (typeof r.noticeAcceptedAt === 'string') list.noticeAcceptedAt = r.noticeAcceptedAt;
    if (r.watchDownloads === true) list.watchDownloads = true;
    if (r.directDownload === true) list.directDownload = true;
    return list;
  } catch {
    return { items: [] };
  }
}

export function saveWaitList(dataDir: string, list: WaitList): void {
  const file = waitListFile(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** Ajoute (ou remet en attente) le fichier d'un besoin ; renvoie l'élément. */
export function addToWaitList(list: WaitList, game: VpsGame, need: Need, file: VpsTableFile, page: string, now = new Date()): WaitItem {
  const id = `${game.id}:${file.id}`;
  const existing = list.items.find((i) => i.id === id);
  if (existing) {
    if (existing.state === 'installed') existing.state = 'waiting';
    existing.page = page;
    existing.pageKey = pageKey(page);
    return existing;
  }
  const item: WaitItem = {
    id,
    gameId: game.id,
    gameLabel: game.manufacturer && game.year ? `${game.name} (${game.manufacturer} ${game.year})` : game.name,
    kind: need.kind,
    fileId: file.id,
    label: need.kind === 'rom' ? (file.version ?? 'ROM') : versionLabel(file),
    version: file.version,
    authors: file.authors,
    updatedAt: file.updatedAt,
    page,
    pageKey: pageKey(page),
    rom: need.kind === 'rom' ? file.version : undefined,
    addedAt: now.toISOString(),
    state: 'waiting',
  };
  list.items.push(item);
  return item;
}

/** Fichiers en cours d'écriture par un navigateur : jamais un téléchargement fini. */
export function isPartialDownload(name: string): boolean {
  return /\.(crdownload|part|partial|tmp|download|opdownload)$/i.test(name) || /^~\$|^\.~/.test(name);
}

/** Extensions de ce qu'on récupère pour une table. */
const RECEIVABLE = /\.(vpx|directb2s|zip|7z|rar|mp3|ogg|wav|pov|pac|vni|pal|crz|cromc)$/i;

export interface DownloadFacts {
  /** Adresses de la chaîne de redirections, de la page au fichier (fenêtre « Récupérer »). */
  urls?: string[];
  /** Nom du fichier reçu. */
  filename: string;
}

/**
 * Élément de la liste d'attente auquel revient un fichier reçu : d'abord par la fiche
 * traversée (chaîne de redirections de la fenêtre « Récupérer »), sinon par son nom
 * (zip au nom de la ROM, .directb2s, nom du jeu rapproché de la base VPS), parmi les
 * éléments encore attendus. undefined si rien ne correspond sans doute possible.
 */
export function matchDownload(list: WaitList, d: DownloadFacts, vps?: VpsDb): WaitItem | undefined {
  const waiting = list.items.filter((i) => i.state === 'waiting');
  if (!waiting.length || isPartialDownload(d.filename) || !RECEIVABLE.test(d.filename)) return undefined;
  const keys = new Set((d.urls ?? []).map(pageKey).filter((k): k is string => Boolean(k)));
  const byPage = waiting.filter((i) => i.pageKey && keys.has(i.pageKey));
  if (byPage.length === 1) return byPage[0];
  const base = d.filename.replace(/\.[^.]+$/, '');
  const ext = path.extname(d.filename).toLowerCase();
  // Zip au nom de la ROM attendue.
  const rom = waiting.find((i) => i.kind === 'rom' && i.rom && i.rom.toLowerCase() === base.toLowerCase());
  if (rom) return rom;
  const kinds: NeedKind[] = ext === '.vpx' ? ['table'] : ext === '.directb2s' ? ['b2s'] : ext === '.pov' ? ['pov'] : /\.(mp3|ogg|wav)$/.test(ext) ? ['music'] : /\.(pac|vni|pal|crz|cromc)$/.test(ext) ? ['altcolor'] : ['table', 'b2s', 'pup', 'altsound', 'altcolor', 'music', 'topper', 'pov'];
  const candidates = (byPage.length ? byPage : waiting).filter((i) => kinds.includes(i.kind));
  if (candidates.length === 1 && (byPage.length || candidates[0]!.kind !== 'table' || ext === '.vpx' || ext === '.directb2s')) {
    // Un seul attendu de cette sorte : encore faut-il que le nom ne désigne pas un autre jeu.
    if (!vps) return candidates[0];
  }
  if (!vps) return undefined;
  const games = new Set(matchVps(vps, { names: [d.filename] }, { deep: true, max: 5 }).candidates.filter((c) => c.score >= 0.6).map((c) => c.game.id));
  const ofGame = candidates.filter((i) => games.has(i.gameId));
  if (ofGame.length === 1) return ofGame[0];
  // Plusieurs attendus du même jeu (table et PuP-Pack en zip) : le nom tranche s'il le dit.
  const named = ofGame.filter((i) => (i.kind === 'pup' ? /pup/i.test(d.filename) : i.kind === 'altsound' ? /alt.?sound/i.test(d.filename) : i.kind === 'altcolor' ? /serum|pac|colou?r|vni/i.test(d.filename) : i.kind === 'table' ? !/pup|alt.?sound|serum|b2s|backglass|topper|wheel|media/i.test(d.filename) : false));
  return named.length === 1 ? named[0] : undefined;
}

/** Marque un élément reçu, avec le fichier et d'où il vient. */
export function markReceived(item: WaitItem, file: string, via: 'window' | 'watch' | 'manual', now = new Date(), url?: string): void {
  item.state = 'received';
  item.received = { file, at: now.toISOString(), via, url };
}

// ---------------------------------------------------------------------------
// Provenance dans le .info, mises à jour

/** CyberPinball.source du .info : d'où vient la table installée. */
export interface TableSource {
  origin: 'VPS';
  vpsGameId: string;
  vpsFileId: string;
  version?: string;
  authors?: string[];
  /** Mise à jour du fichier chez VPS quand il a été récupéré. */
  updatedAt?: number;
  page?: string;
  installedAt: string;
}

export function tableSourceOf(info: TableInfoFile): TableSource | undefined {
  const own = info.CyberPinball as { source?: TableSource } | undefined;
  const s = own?.source;
  return s && typeof s === 'object' && typeof s.vpsGameId === 'string' && typeof s.vpsFileId === 'string' ? s : undefined;
}

export function setTableSource(info: TableInfoFile, source: TableSource): TableInfoFile {
  const own = (info.CyberPinball && typeof info.CyberPinball === 'object' ? info.CyberPinball : {}) as Record<string, unknown>;
  return { ...info, Info: { ...info.Info, VPSId: source.vpsGameId }, CyberPinball: { ...own, source } };
}

/** Compare deux numéros de version (« 1.2.10 » après « 1.2.9 ») ; NaN s'ils ne sont pas comparables. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.toLowerCase().replace(/^v/, '').split(/[._-]/).map((p) => /^\d+/.exec(p)?.[0]);
  const pa = parts(a);
  const pb = parts(b);
  if (pa.some((p) => p === undefined) || pb.some((p) => p === undefined)) return Number.NaN;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number(pa[i] ?? 0);
    const y = Number(pb[i] ?? 0);
    if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
    if (x !== y) return x - y;
  }
  return 0;
}

export interface TableUpdate {
  game: VpsGame;
  /** Version installée, et celle que VPS donne aujourd'hui pour le même fichier. */
  installed: { version?: string; updatedAt?: number };
  latest: VpsTableFile;
  /** Pourquoi : « version 1.25 → 1.3 », « mise à jour le … ». */
  reason: string;
}

/**
 * Mise à jour disponible pour une table : le fichier VPS dont elle vient (provenance
 * notée à l'installation, ou recréation reconnue d'après l'auteur et la version écrits
 * dans la table) a une version plus récente, ou a été mis à jour depuis.
 */
export function tableUpdate(vps: VpsDb, from: { source?: TableSource; vpsGameId?: string; tableFileId?: string; version?: string }): TableUpdate | undefined {
  const gameId = from.source?.vpsGameId ?? from.vpsGameId;
  const fileId = from.source?.vpsFileId ?? from.tableFileId;
  const game = gameId ? vps.games.find((g) => g.id === gameId) : undefined;
  const latest = game && fileId ? (game.tableFiles ?? []).find((f) => f.id === fileId) : undefined;
  if (!game || !latest) return undefined;
  const version = from.source?.version ?? from.version;
  const cmp = version && latest.version ? compareVersions(latest.version, version) : Number.NaN;
  if (cmp > 0) return { game, installed: { version, updatedAt: from.source?.updatedAt }, latest, reason: `version ${version} → ${latest.version}` };
  if (Number.isNaN(cmp) && from.source?.updatedAt && latest.updatedAt && latest.updatedAt > from.source.updatedAt) {
    return { game, installed: { version, updatedAt: from.source.updatedAt }, latest, reason: `mise à jour chez VPS le ${formatDay(latest.updatedAt)}` };
  }
  return undefined;
}
