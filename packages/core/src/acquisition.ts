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
import { formatDate, formatList, t, tn } from './i18n';
import { dmdMediaType } from './medias';
import { romContent } from './romzip';
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
/**
 * Fichiers que le jeu doit proposer (avec un lien vivant) : fronton, ROM, PuP-Pack…, une
 * version VR, ou des médias sur VPinMediaDB (index passé à catalog()).
 */
export type CatalogSupport = 'any' | 'b2s' | 'rom' | 'pup' | 'altsound' | 'altcolor' | 'music' | 'topper' | 'pov' | 'vr' | 'media';
/** Site où se télécharge la table (ou les fichiers du filtre « Fichiers ») ; « free » : sans compte. */
export type CatalogSite = 'all' | 'vpuniverse' | 'vpforums' | 'pinballnirvana' | 'free';

export const CATALOG_KINDS: readonly CatalogKind[] = ['all', 'norom', 'ss', 'em', 'original'];
export const CATALOG_STATES: readonly CatalogState[] = ['missing', 'all', 'installed'];
export const CATALOG_SUPPORTS: readonly CatalogSupport[] = ['any', 'b2s', 'rom', 'pup', 'altsound', 'altcolor', 'music', 'topper', 'pov', 'vr', 'media'];
export const CATALOG_SITES: readonly CatalogSite[] = ['all', 'vpuniverse', 'vpforums', 'pinballnirvana', 'free'];

export interface CatalogFilter {
  /** Titre, initiales, nom de ROM. */
  text?: string;
  kind?: CatalogKind;
  state?: CatalogState;
  vr?: boolean;
  pup?: boolean;
  support?: CatalogSupport;
  site?: CatalogSite;
  sort?: CatalogSort;
}

/** Ce que catalog() ne trouve pas dans la base VPS : jeux qui ont des médias sur VPinMediaDB (identifiants VPS). */
export interface CatalogExtras {
  media?: ReadonlySet<string>;
}

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  get all() {
    return t('tous les jeux');
  },
  get ss() {
    return t('électroniques');
  },
  get em() {
    return t('électromécaniques');
  },
  get original() {
    return t('créations originales');
  },
  get norom() {
    return t('sans ROM à trouver');
  },
};

export const CATALOG_STATE_LABELS: Record<CatalogState, string> = {
  get all() {
    return t('installés ou non');
  },
  get missing() {
    return t('pas encore installés');
  },
  get installed() {
    return t('déjà installés');
  },
};

export const CATALOG_SUPPORT_LABELS: Record<CatalogSupport, string> = {
  get any() {
    return t('peu importe');
  },
  get b2s() {
    return t('avec un fronton (.directb2s)');
  },
  get rom() {
    return t('avec sa ROM');
  },
  get pup() {
    return t('avec un PuP-Pack');
  },
  get altsound() {
    return t('avec des sons remasterisés');
  },
  get altcolor() {
    return t('avec des couleurs de DMD');
  },
  get music() {
    return t('avec une musique');
  },
  get topper() {
    return t('avec un topper');
  },
  get pov() {
    return t('avec un point de vue (POV)');
  },
  get vr() {
    return t('jouable en VR');
  },
  get media() {
    return t('avec des médias sur VPinMediaDB');
  },
};

export const CATALOG_SITE_LABELS: Record<CatalogSite, string> = {
  get all() {
    return t('tous les sites');
  },
  vpuniverse: 'vpuniverse.com',
  vpforums: 'vpforums.org',
  pinballnirvana: 'pinballnirvana.com',
  get free() {
    return t('sans compte (Google Drive, MEGA, Dropbox, GitHub…)');
  },
};

/** Hôtes qui ne servent pas de fichier à télécharger : une vidéo, une fiche d'IPDB. */
const NOT_A_DOWNLOAD = new Set<LinkHostId>(['youtube', 'ipdb']);

/** Le lien mène-t-il au site choisi ? « free » : un site qui ne demande pas de compte. */
export function linkOnSite(url: string, site: CatalogSite): boolean {
  if (site === 'all') return true;
  const host = linkHost(url);
  if (site === 'free') return !host.account && !NOT_A_DOWNLOAD.has(host.id);
  return host.id === site;
}

/**
 * Fichiers d'un jeu que vise le filtre « Fichiers » : ceux du genre choisi, ou les
 * versions VPX (tous genres, VR). Un PuP-Pack fourni avec la table compte. undefined
 * pour les médias de VPinMediaDB, qui ne sont pas dans la base VPS.
 */
export function supportFiles(game: VpsGame, support: CatalogSupport): VpsTableFile[] | undefined {
  switch (support) {
    case 'any':
      return vpxVersions(game);
    case 'b2s':
      return game.b2sFiles ?? [];
    case 'rom':
      return (game.romFiles ?? []).map((r) => ({ ...r, id: r.id ?? `rom:${r.version}` }) as VpsTableFile);
    case 'pup':
      return [...(game.pupPackFiles ?? []), ...vpxVersions(game).filter((f) => hasFeature(f, 'incl. PuP'))];
    case 'altsound':
      return game.altSoundFiles ?? [];
    case 'altcolor':
      return game.altColorFiles ?? [];
    case 'music':
      return game.soundFiles ?? [];
    case 'topper':
      return game.topperFiles ?? [];
    case 'pov':
      return game.povFiles ?? [];
    case 'vr':
      return vpxVersions(game).filter((f) => hasFeature(f, 'VR'));
    case 'media':
      return undefined;
  }
}

/**
 * Jeux du catalogue : ceux qui ont au moins une version VPX, filtrés et triés. Avec un
 * texte, l'ordre est celui de la recherche (le plus ressemblant d'abord). Le filtre
 * « Fichiers » demande au moins un fichier de ce genre avec un lien vivant ; le site,
 * un tel lien sur ce site (les versions VPX quand le filtre « Fichiers » n'en vise pas).
 * Sans index de VPinMediaDB (`extras.media`), le filtre de ses médias ne garde rien.
 */
export function catalog(db: VpsDb, filter: CatalogFilter, installed: Set<string>, extras: CatalogExtras = {}): VpsGame[] {
  const support = filter.support ?? 'any';
  const site = filter.site ?? 'all';
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
    if (support === 'media' && !extras.media?.has(g.id)) return false;
    const files = supportFiles(g, support) ?? vpxVersions(g);
    const live = files.filter((f) => liveLinks(f).length);
    if (support !== 'any' && support !== 'media' && !live.length) return false;
    if (site !== 'all' && !live.some((f) => liveLinks(f).some((l) => linkOnSite(l.url, site)))) return false;
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
  if (isVpw(best)) reasons.push(t('table de VPW (VPin Workshop), refaite à fond'));
  if (!hasFeature(best, 'MOD')) reasons.push(t('version d’origine, pas un MOD'));
  if (best === versions[0]) reasons.push(t('la plus récemment mise à jour'));
  else if (best.updatedAt) reasons.push(t('mise à jour le {date}', { date: formatDay(best.updatedAt) }));
  if (versions.length > 1) reasons.push(tn(versions.length - 1, '{n} autre version au choix', '{n} autres versions au choix'));
  return { file: best, reasons };
}

export function formatDay(ms: number): string {
  return formatDate(ms, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** « VPW, Sixtoe 1.25 » */
export function versionLabel(file: { authors?: string[]; version?: string }): string {
  const authors = (file.authors ?? []).slice(0, 3).join(', ') + ((file.authors?.length ?? 0) > 3 ? '…' : '');
  return [authors, file.version].filter(Boolean).join(' ') || t('version sans auteur');
}

// ---------------------------------------------------------------------------
// Ce qu'il faut pour une version

export type NeedKind = 'table' | 'b2s' | 'rom' | 'pup' | 'altsound' | 'altcolor' | 'music' | 'topper' | 'pov';

export const NEED_LABELS: Record<NeedKind, string> = {
  get table() {
    return t('Table');
  },
  get b2s() {
    return t('Fronton (.directb2s)');
  },
  rom: 'ROM',
  pup: 'PuP-Pack',
  get altsound() {
    return t('Sons remasterisés (altsound)');
  },
  get altcolor() {
    return t('Couleurs du DMD (altcolor)');
  },
  get music() {
    return t('Musique');
  },
  topper: 'Topper',
  get pov() {
    return t('Point de vue (POV)');
  },
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
    detail: ctx.installed
      ? t('déjà installée sur cette borne')
      : liveLinks(version).length
        ? t('{version}, à récupérer', { version: versionLabel(version) })
        : t('aucun lien vivant pour cette version : choisissez-en une autre'),
    files: [version],
  });

  // Fronton : celui qui convient aux écrans de la borne d'abord.
  const b2s = withLinks(game.b2sFiles).map((f) => f as VpsTableFile);
  const fits = (f: VpsTableFile) => (ctx.screens.dmd === 'full' ? hasFeature(f, 'FullDMD') || hasFeature(f, '3Screens') : ctx.screens.dmd === 'small' ? hasFeature(f, '3Screens') : hasFeature(f, '2Screens'));
  b2s.sort((a, b) => Number(fits(b)) - Number(fits(a)) || recent(a, b));
  if (hasFeature(version, 'incl. B2S')) needs.push({ kind: 'b2s', required: false, state: 'included', detail: t('fourni avec la table'), files: [] });
  else if (!ctx.screens.backglass) needs.push({ kind: 'b2s', required: false, state: 'useless', detail: t('cette borne n’a pas d’écran de fronton'), files: b2s });
  else if (b2s.length) {
    const detail = fits(b2s[0]!)
      ? tn(b2s.length, 'conseillé : {n} fronton, le premier va avec les écrans de la borne', 'conseillé : {n} frontons, le premier va avec les écrans de la borne')
      : tn(b2s.length, 'conseillé : {n} fronton, aucun annoncé pour les écrans de la borne', 'conseillé : {n} frontons, aucun annoncé pour les écrans de la borne');
    needs.push({ kind: 'b2s', required: false, state: 'todo', detail, files: b2s });
  } else needs.push({ kind: 'b2s', required: false, state: 'unavailable', detail: t('aucun fronton connu de VPS : le menu en dessinera un'), files: [] });

  // ROM.
  if (!versionWithoutRom(game, version)) {
    const roms = [...new Set((game.romFiles ?? []).map((r) => (r.version ?? '').trim()).filter(Boolean))];
    const present = roms.filter((r) => ctx.roms.has(r.toLowerCase()));
    if (hasFeature(version, 'incl. ROM')) needs.push({ kind: 'rom', required: true, state: 'included', detail: t('fournie avec la table'), files: [], roms });
    else if (present.length) needs.push({ kind: 'rom', required: true, state: 'have', detail: t('{roms} : déjà sur la borne', { roms: present.join(', ') }), files: [], roms });
    else {
      const files = withLinks(game.romFiles).map((r) => ({ ...r, id: r.id ?? `rom:${r.version}` }) as VpsTableFile).sort(recent);
      needs.push({
        kind: 'rom',
        required: true,
        state: files.length ? 'todo' : 'unavailable',
        detail: roms.length ? t('{roms} : à récupérer, si vous y avez droit', { roms: formatList(roms, 'or') }) : t('nom inconnu de VPS : le script de la table le dira une fois installée'),
        files,
        roms,
      });
    }
  }

  // Compléments facultatifs.
  const optional = (kind: NeedKind, files: VpsTableFile[] | undefined, detail: string, included?: string) => {
    if (included && hasFeature(version, included)) return needs.push({ kind, required: false, state: 'included', detail: t('fourni avec la table'), files: [] });
    const usable = withLinks(files).sort(recent);
    if (usable.length) needs.push({ kind, required: false, state: 'optional', detail, files: usable });
  };
  optional('pup', game.pupPackFiles, t('facultatif : vidéos sur le fronton et l’afficheur pendant la partie'), 'incl. PuP');
  optional('altsound', game.altSoundFiles, t('facultatif : sons du jeu remasterisés'));
  if (ctx.screens.dmd !== 'none') optional('altcolor', game.altColorFiles, t('facultatif : DMD en couleurs'));
  optional('music', game.soundFiles, t('facultatif : musique pour la table'));
  if (ctx.screens.topper) optional('topper', game.topperFiles, t('facultatif : animation du topper'));
  optional('pov', game.povFiles, t('facultatif : réglage du point de vue de la caméra'));
  return needs;
}

/**
 * Installation rapide d'une version : ce qui est récupéré d'office pour jouer (l'indispensable
 * à récupérer et le fronton conseillé, le premier fichier de chacun), et l'indispensable
 * introuvable, qui l'empêche (une autre version, ou la fiche, ligne par ligne).
 */
export function quickNeeds(needs: Need[]): { get: Need[]; blocked: Need[] } {
  return {
    get: needs.filter((n) => n.state === 'todo' && n.files.length > 0 && (n.required || n.kind === 'b2s')),
    blocked: needs.filter((n) => n.required && n.state === 'unavailable'),
  };
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
  received?: ReceivedFile;
  /** Table installée pour laquelle on le récupère (parcours « Ce qu'il manque pour jouer », journey.ts). */
  table?: string;
}

export interface ReceivedFile {
  file: string;
  at: string;
  via: 'window' | 'watch' | 'manual';
  url?: string;
  /** Ce que contient le fichier, reconnu à la réception (classifyContent). */
  content?: ContentKind;
  /** « 14 images, 9 vidéos, aucun .vpx » */
  summary?: string;
}

/** Fichier reçu sans élément : rien n'y correspondait, il ne convenait pas, ou il a été retiré d'un élément. */
export interface StrayFile {
  file: string;
  at: string;
  via: 'window' | 'watch' | 'manual';
  url?: string;
  content?: ContentKind;
  /** « 14 images, 9 vidéos, aucun .vpx » */
  summary?: string;
  /** Élément auquel il semblait revenir, refusé faute de convenir (confirmation demandée). */
  expected?: string;
  /** Élément attendu auquel il conviendrait. */
  suggested?: string;
}

export interface WaitList {
  items: WaitItem[];
  /** Fichiers reçus sans élément, gardés pour être rattachés plus tard. */
  strays?: StrayFile[];
  /** Avertissement du catalogue lu et accepté (date ISO). */
  noticeAcceptedAt?: string;
  /** Surveiller le dossier Téléchargements tant que quelque chose est attendu (choix de l'utilisateur). */
  watchDownloads?: boolean;
  /** « Récupérer » télécharge directement avec la connexion gardée, sans montrer la page (choix de l'utilisateur). */
  directDownload?: boolean;
}

/** Avertissement montré au premier usage du catalogue. */
export function acquisitionNotice(): string {
  return t(
    'Les tables appartiennent à leurs auteurs, les ROM aux fabricants des jeux. Cyber Pinball ne télécharge rien à votre place : il ouvre les pages, vous vous connectez et téléchargez vous-même, puis il range ce que vous avez récupéré. Aucun fabricant n’autorise la diffusion de ses ROM pour l’émulation : ne récupérez une ROM que si vous y avez droit.',
  );
}

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
    const strays = Array.isArray(r.strays) ? r.strays.filter((s): s is StrayFile => Boolean(s) && typeof s.file === 'string' && typeof s.at === 'string') : [];
    if (strays.length) list.strays = strays;
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

/**
 * Ajoute (ou remet en attente) le fichier d'un besoin ; renvoie l'élément. `table` : la
 * table installée à qui il manque (parcours « Ce qu'il manque pour jouer »).
 */
export function addToWaitList(list: WaitList, game: VpsGame, need: Pick<Need, 'kind'> & Partial<Need>, file: VpsTableFile, page: string, now = new Date(), table?: string): WaitItem {
  const id = `${game.id}:${file.id}`;
  const existing = list.items.find((i) => i.id === id);
  if (existing) {
    if (existing.state === 'installed') existing.state = 'waiting';
    existing.page = page;
    existing.pageKey = pageKey(page);
    if (table) existing.table = table;
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
  if (table) item.table = table;
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
  /** Ce qu'il contient (classifyContent, archive listée) ; sans lui, son extension seule. */
  content?: ContentKind;
}

// ---------------------------------------------------------------------------
// Ce que contient un fichier reçu

/** Sorte d'un fichier reçu : celle d'un besoin, un pack de médias du frontend, ou on ne sait pas. */
export type ContentKind = NeedKind | 'media' | 'unknown';

/** « un pack de médias » : ce qu'est le fichier, en clair. */
export const CONTENT_LABELS: Record<ContentKind, string> = {
  get table() {
    return t('une table');
  },
  get b2s() {
    return t('un fronton (.directb2s)');
  },
  get rom() {
    return t('une ROM');
  },
  get pup() {
    return t('un PuP-Pack');
  },
  get altsound() {
    return t('des sons remasterisés (altsound)');
  },
  get altcolor() {
    return t('des couleurs de DMD (Serum, VNI)');
  },
  get music() {
    return t('de la musique');
  },
  get topper() {
    return t('une animation de topper');
  },
  get pov() {
    return t('un point de vue (POV)');
  },
  get media() {
    return t('un pack de médias');
  },
  get unknown() {
    return t('un contenu non reconnu');
  },
};

/** Ce qu'un élément attend, en clair : « un .vpx, ou une archive qui en contient un ». */
export const EXPECTED_LABELS: Record<NeedKind, string> = {
  get table() {
    return t('un .vpx, ou une archive qui en contient un');
  },
  get b2s() {
    return t('un .directb2s, ou une archive qui en contient un');
  },
  get rom() {
    return t('une ROM : un .zip de fichiers de puces, sans dossier');
  },
  get pup() {
    return t('un PuP-Pack : une archive avec des fichiers .pup');
  },
  get altsound() {
    return t('une archive avec altsound.csv ou g-sound.csv');
  },
  get altcolor() {
    return t('un fichier Serum (.cRZ) ou VNI (.vni, .pal, .pac)');
  },
  get music() {
    return t('des fichiers audio (.mp3, .ogg, .wav)');
  },
  get topper() {
    return t('une vidéo ou une image de topper');
  },
  get pov() {
    return t('un fichier .pov');
  },
};

const AUDIO = /\.(mp3|ogg|wav|flac)$/i;
const COLORS = /\.(pac|vni|pal|crz|crom|cromc)$/i;
const IMAGES = /\.(png|jpe?g|gif|apng|bmp|webp)$/i;
const VIDEOS = /\.(mp4|f4v|avi|mkv|webm|mov|wmv|flv)$/i;
const ARCHIVES = /\.(zip|7z|rar)$/i;

/**
 * Ce que contient un fichier reçu, d'après son nom et, pour une archive, la liste de ce
 * qu'elle contient (entries ; undefined : pas une archive, ou illisible). Une table
 * l'emporte sur ce qu'elle fournit avec elle (fronton, ROM) ; un PuP-Pack sur ses vidéos.
 */
export function classifyContent(name: string, entries?: string[]): ContentKind {
  const lower = name.toLowerCase();
  if (!ARCHIVES.test(lower) || !entries) {
    if (lower.endsWith('.vpx')) return 'table';
    if (lower.endsWith('.directb2s')) return 'b2s';
    if (lower.endsWith('.pov')) return 'pov';
    if (AUDIO.test(lower)) return 'music';
    if (COLORS.test(lower)) return 'altcolor';
    if (IMAGES.test(lower) || VIDEOS.test(lower)) return /topper/i.test(name) ? 'topper' : 'media';
    return 'unknown';
  }
  const files = entries.map((e) => e.replace(/\\/g, '/')).filter((e) => !e.endsWith('/'));
  const base = (e: string) => e.slice(e.lastIndexOf('/') + 1).toLowerCase();
  const has = (test: (e: string) => boolean) => files.some((e) => test(e.toLowerCase()));
  if (has((e) => e.endsWith('.vpx'))) return 'table';
  if (has((e) => e.endsWith('.directb2s'))) return 'b2s';
  if (has((e) => e.endsWith('.pup') || e.includes('pupvideos/'))) return 'pup';
  if (files.some((e) => ['altsound.csv', 'g-sound.csv'].includes(base(e)))) return 'altsound';
  if (has((e) => COLORS.test(e))) return 'altcolor';
  // Une ROM : des puces, toutes dans un même dossier, quel que soit le format (romzip.ts).
  if (romContent(entries)) return 'rom';
  if (has((e) => e.endsWith('.pov'))) return 'pov';
  const media = files.filter((e) => IMAGES.test(e) || VIDEOS.test(e)).length;
  if (!media && has((e) => AUDIO.test(e))) return 'music';
  if (media) return /topper/i.test(name) && !/media.?pack/i.test(name) ? 'topper' : 'media';
  return 'unknown';
}

/** « 14 images, 9 vidéos, aucun .vpx » : ce que contient une archive, pour qu'on juge soi-même. */
export function contentSummary(name: string, entries?: string[]): string | undefined {
  if (!ARCHIVES.test(name) || !entries) return undefined;
  const files = entries.map((e) => e.replace(/\\/g, '/')).filter((e) => !e.endsWith('/'));
  const count = (re: RegExp) => files.filter((e) => re.test(e)).length;
  const [vpx, b2s, pup, images, videos, sounds] = [/\.vpx$/i, /\.directb2s$/i, /\.pup$/i, IMAGES, VIDEOS, AUDIO].map(count) as [number, number, number, number, number, number];
  const shown = [
    vpx ? tn(vpx, '{n} .vpx', '{n} .vpx') : '',
    b2s ? tn(b2s, '{n} .directb2s', '{n} .directb2s') : '',
    pup ? tn(pup, '{n} fichier .pup', '{n} fichiers .pup') : '',
    images ? tn(images, '{n} image', '{n} images') : '',
    videos ? tn(videos, '{n} vidéo', '{n} vidéos') : '',
    sounds ? tn(sounds, '{n} son', '{n} sons') : '',
  ].filter(Boolean);
  if (!shown.length) shown.push(tn(files.length, '{n} fichier', '{n} fichiers'));
  if (!vpx) shown.push(t('aucun .vpx'));
  return shown.join(', ');
}

/**
 * Ce fichier convient-il à ce qu'attend l'élément ? 'unknown' quand on ne sait pas ce
 * qu'il contient (archive illisible) : on le prend alors sans pouvoir le vérifier.
 */
export function contentFits(kind: NeedKind, content: ContentKind | undefined): 'yes' | 'no' | 'unknown' {
  if (!content || content === 'unknown') return 'unknown';
  if (content === kind) return 'yes';
  // Un topper se distribue comme une vidéo, tout comme les médias du frontend.
  if (kind === 'topper' && content === 'media') return 'yes';
  return 'no';
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
  const content = d.content ?? classifyContent(d.filename);
  // Une fiche de forum propose parfois plusieurs fichiers (la table et son pack de médias) :
  // la fiche traversée ne suffit pas quand le contenu dit autre chose.
  const byPage = waiting.filter((i) => i.pageKey && keys.has(i.pageKey));
  if (byPage.length === 1 && contentFits(byPage[0]!.kind, content) !== 'no') return byPage[0];
  const base = d.filename.replace(/\.[^.]+$/, '');
  const ext = path.extname(d.filename).toLowerCase();
  // Zip au nom de la ROM attendue (s'il contient bien une ROM, quand on l'a lu).
  const rom = waiting.find((i) => i.kind === 'rom' && i.rom && i.rom.toLowerCase() === base.toLowerCase());
  if (rom && contentFits('rom', content) !== 'no') return rom;
  // Contenu reconnu : seuls les éléments qu'il peut remplir ; sinon d'après l'extension.
  const kinds: NeedKind[] =
    content !== 'unknown'
      ? (['table', 'b2s', 'rom', 'pup', 'altsound', 'altcolor', 'music', 'topper', 'pov'] as NeedKind[]).filter((k) => contentFits(k, content) === 'yes')
      : ext === '.vpx' ? ['table'] : ext === '.directb2s' ? ['b2s'] : ext === '.pov' ? ['pov'] : /\.(mp3|ogg|wav)$/.test(ext) ? ['music'] : /\.(pac|vni|pal|crz|cromc)$/.test(ext) ? ['altcolor'] : ['table', 'b2s', 'pup', 'altsound', 'altcolor', 'music', 'topper', 'pov'];
  const candidates = (byPage.length ? byPage : waiting).filter((i) => kinds.includes(i.kind));
  if (candidates.length === 1 && (byPage.length || candidates[0]!.kind !== 'table' || ext === '.vpx' || ext === '.directb2s' || content === 'table')) {
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

/** Marque un élément reçu, avec le fichier, d'où il vient et ce qu'il contient. */
export function markReceived(item: WaitItem, file: string, via: 'window' | 'watch' | 'manual', now = new Date(), url?: string, content?: { content?: ContentKind; summary?: string }): void {
  item.state = 'received';
  item.received = { file, at: now.toISOString(), via, url };
  if (content?.content) item.received.content = content.content;
  if (content?.summary) item.received.summary = content.summary;
}

export interface Placement {
  /** Élément auquel revient le fichier : celui qu'il remplit, ou celui qu'on attendait et qu'il ne remplit pas. */
  item?: WaitItem;
  /**
   * fits : il convient ; unknown : contenu illisible, pris sans vérification ; mismatch : il
   * ne convient pas à l'élément (confirmation à demander) ; none : rien ne lui correspond.
   */
  verdict: 'fits' | 'unknown' | 'mismatch' | 'none';
  /** Élément attendu du même jeu auquel il conviendrait, à proposer. */
  better?: WaitItem;
}

/**
 * Où ranger un fichier reçu : l'élément qu'il remplit (matchDownload), sinon celui pour
 * lequel la fenêtre « Récupérer » était ouverte (opened, même déjà reçu : on récupère de
 * nouveau), en vérifiant que le contenu convient. Un pack de médias reçu pour la table
 * n'est jamais rangé d'office : verdict « mismatch », avec l'élément qui lui irait.
 */
export function placeDownload(list: WaitList, d: DownloadFacts, vps?: VpsDb, opened?: string): Placement {
  const content = d.content ?? classifyContent(d.filename);
  const matched = matchDownload(list, { ...d, content }, vps);
  const open = opened ? list.items.find((i) => i.id === opened && i.state !== 'installed') : undefined;
  const item = matched ?? (open && !isPartialDownload(d.filename) && RECEIVABLE.test(d.filename) ? open : undefined);
  const fit = item ? contentFits(item.kind, content) : 'no';
  const better = !item || fit === 'no' ? betterItem(list, content, item?.gameId) : undefined;
  if (!item) return better ? { verdict: 'none', better } : { verdict: 'none' };
  if (fit === 'no') return better ? { item, verdict: 'mismatch', better } : { item, verdict: 'mismatch' };
  return { item, verdict: fit === 'yes' ? 'fits' : 'unknown' };
}

/** Seul élément attendu du jeu que ce contenu remplirait. */
function betterItem(list: WaitList, content: ContentKind, gameId: string | undefined): WaitItem | undefined {
  if (!gameId || content === 'unknown') return undefined;
  const fits = list.items.filter((i) => i.gameId === gameId && i.state === 'waiting' && contentFits(i.kind, content) === 'yes');
  return fits.length === 1 ? fits[0] : undefined;
}

/** Garde un fichier reçu de côté, sans élément (rien n'y correspondait, ou on l'a retiré d'un élément). */
export function setAside(list: WaitList, received: Omit<StrayFile, 'at'> & { at?: string }, now = new Date()): StrayFile {
  const strays = (list.strays ??= []);
  const existing = strays.find((s) => samePathText(s.file, received.file));
  const stray: StrayFile = { ...received, at: received.at ?? now.toISOString() };
  for (const key of Object.keys(stray) as (keyof StrayFile)[]) if (stray[key] === undefined) delete stray[key];
  if (existing) Object.assign(existing, stray);
  else strays.push(stray);
  return existing ?? stray;
}

/** Retire un fichier de ceux gardés de côté (rattaché, mis à la corbeille, oublié). */
export function forgetStray(list: WaitList, file: string): void {
  list.strays = (list.strays ?? []).filter((s) => !samePathText(s.file, file));
  if (!list.strays.length) delete list.strays;
}

const samePathText = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/**
 * Rattache un fichier à un élément (réaffectation, remplacement, fichier gardé de côté) :
 * l'élément devient reçu ; le fichier qu'il avait, s'il en avait un autre, est gardé de côté.
 * Renvoie ce fichier remplacé.
 */
export function attachFile(list: WaitList, item: WaitItem, file: Omit<ReceivedFile, 'at'> & { at?: string }, now = new Date()): string | undefined {
  const previous = item.received && !samePathText(item.received.file, file.file) ? item.received : undefined;
  forgetStray(list, file.file);
  // Le même fichier ne remplit pas deux éléments : celui qui l'avait redevient attendu.
  for (const other of list.items) if (other !== item && other.state === 'received' && other.received && samePathText(other.received.file, file.file)) clearItem(list, other, false);
  if (previous) setAside(list, { file: previous.file, via: previous.via, url: previous.url, content: previous.content, summary: previous.summary, at: previous.at });
  markReceived(item, file.file, file.via, file.at ? new Date(file.at) : now, file.url, file);
  // L'élément a son fichier : les fichiers gardés de côté ne lui sont plus une question.
  for (const s of list.strays ?? []) {
    if (s.expected === item.id) delete s.expected;
    if (s.suggested === item.id) delete s.suggested;
  }
  return previous?.file;
}

/** Déplace le fichier reçu d'un élément vers un autre ; le premier redevient attendu. */
export function reassignFile(list: WaitList, from: WaitItem, to: WaitItem, now = new Date()): void {
  const received = from.received;
  if (!received || from === to) return;
  clearItem(list, from, false);
  attachFile(list, to, received, now);
}

/**
 * Vide un élément reçu : il redevient attendu. keep : le fichier est gardé de côté (à
 * rattacher plus tard) ; sinon il est renvoyé, pour la corbeille. Renvoie le fichier.
 */
export function clearItem(list: WaitList, item: WaitItem, keep: boolean): string | undefined {
  const received = item.received;
  item.state = 'waiting';
  delete item.received;
  if (!received) return undefined;
  if (keep) setAside(list, { file: received.file, via: received.via, url: received.url, content: received.content, summary: received.summary, at: received.at });
  return received.file;
}

/** Ne plus attendre un élément ; son fichier reçu est gardé de côté (keep) ou renvoyé, pour la corbeille. */
export function removeItem(list: WaitList, item: WaitItem, keep: boolean): string | undefined {
  const file = item.state === 'received' ? clearItem(list, item, keep) : undefined;
  list.items = list.items.filter((i) => i !== item);
  for (const s of list.strays ?? []) {
    if (s.expected === item.id) delete s.expected;
    if (s.suggested === item.id) delete s.suggested;
  }
  return file;
}

/**
 * Retire un jeu entier de la liste d'attente (les tables installées n'en dépendent pas) ;
 * renvoie les fichiers reçus de ses éléments, que l'appelant garde ou met à la corbeille.
 */
export function removeGame(list: WaitList, gameId: string): string[] {
  const files: string[] = [];
  for (const item of list.items.filter((i) => i.gameId === gameId)) {
    const file = removeItem(list, item, false);
    if (file) files.push(file);
  }
  return files;
}

export interface WaitProblem {
  item: WaitItem;
  /** mismatch : le fichier reçu ne convient pas ; missing : il a disparu (déplacé ou effacé). */
  problem: 'mismatch' | 'missing';
  content?: ContentKind;
  /** Élément attendu du même jeu auquel le fichier conviendrait. */
  better?: WaitItem;
}

/**
 * Éléments reçus à corriger : fichier disparu, ou qui ne convient pas à l'élément (un pack
 * de médias rangé comme table, par exemple par une version qui ne vérifiait rien).
 * contentOf : ce que contient un fichier (noté à la réception, ou lu par l'appelant).
 */
export function waitListProblems(list: WaitList, contentOf: (item: WaitItem) => ContentKind | undefined, exists: (file: string) => boolean = fs.existsSync): WaitProblem[] {
  const problems: WaitProblem[] = [];
  for (const item of list.items) {
    if (item.state !== 'received' || !item.received) continue;
    if (!exists(item.received.file)) {
      problems.push({ item, problem: 'missing' });
      continue;
    }
    const content = contentOf(item) ?? item.received.content;
    if (contentFits(item.kind, content) !== 'no') continue;
    const better = betterItem(list, content!, item.gameId);
    problems.push(better ? { item, problem: 'mismatch', content, better } : { item, problem: 'mismatch', content });
  }
  return problems;
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
  if (cmp > 0) return { game, installed: { version, updatedAt: from.source?.updatedAt }, latest, reason: t('version {from} → {to}', { from: version ?? '', to: latest.version ?? '' }) };
  if (Number.isNaN(cmp) && from.source?.updatedAt && latest.updatedAt && latest.updatedAt > from.source.updatedAt) {
    return { game, installed: { version, updatedAt: from.source.updatedAt }, latest, reason: t('mise à jour chez VPS le {date}', { date: formatDay(latest.updatedAt) }) };
  }
  return undefined;
}
