// Crédits de la communauté (décidés le 12/11/2026) : qui a fait la table, son habillage (fronton,
// PuP-Pack, couleurs et sons du DMD, musique, topper, point de vue), les médias du menu, les règles.
// Ici, sans Electron ni disque : la provenance des pièces gardée dans le .info, ce qu'on en tire
// pour la page « Crédits » d'une table, la ligne de la roue (« par TastyWasps »), celle du mode
// attente, et le classement des auteurs d'une borne (« La communauté »).
//
// D'où viennent les noms, du plus sûr au moins sûr :
// - la provenance notée à l'installation depuis le catalogue (CyberPinball.source pour la table,
//   CyberPinball.parts pour le reste) : le fichier VPS installé, ses auteurs, sa version, sa page ;
// - pour la table seule : le fichier VPS reconnu d'après l'auteur et la version écrits dans la table
//   par son auteur, sinon Info.Authors (rempli à l'import), sinon le texte de l'auteur tel quel ;
// - la base VPS pour la vraie machine (fabricant, année, concepteurs).
// Une pièce présente dont on ne sait rien reste dite, « Auteur non renseigné » avec la raison :
// jamais un nom deviné (le premier fronton de la base n'est pas forcément celui qui est installé).

import { tableSourceOf, type NeedKind, type TableSource } from './acquisition';
import { formatList, t, tn } from './i18n';
import type { TableInfoFile } from './tables';
import { vpsKey, type VpsGame, type VpsTableFile } from './vps';

// ---------------------------------------------------------------------------
// Provenance des pièces, dans le .info

/** Pièces d'un jeu créditées à part de la table (la ROM appartient au fabricant, les médias ont leur propre provenance). */
export const CREDITED_PARTS = ['b2s', 'pup', 'altcolor', 'altsound', 'music', 'topper', 'pov'] as const satisfies readonly NeedKind[];
export type CreditedPart = (typeof CREDITED_PARTS)[number];

/** CyberPinball.parts.<sorte> du .info : d'où vient une pièce installée depuis le catalogue. */
export interface PartProvenance {
  vpsFileId?: string;
  version?: string;
  authors?: string[];
  /** Page d'où le fichier a été récupéré (VPUniverse, VPForums…). */
  page?: string;
  /** Précision de la base (« Animated Glass Orb », « French Altsound »). */
  comment?: string;
  installedAt: string;
}

const isCredited = (kind: string): kind is CreditedPart => (CREDITED_PARTS as readonly string[]).includes(kind);

/** Provenance notée des pièces de la table ; les entrées mal formées sont ignorées. */
export function partSourcesOf(info: TableInfoFile): Partial<Record<CreditedPart, PartProvenance>> {
  const own = info.CyberPinball as { parts?: Record<string, unknown> } | undefined;
  const out: Partial<Record<CreditedPart, PartProvenance>> = {};
  if (!own?.parts || typeof own.parts !== 'object') return out;
  for (const [kind, raw] of Object.entries(own.parts)) {
    if (!isCredited(kind) || !raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.installedAt !== 'string') continue;
    const authors = Array.isArray(s.authors) ? s.authors.filter((a): a is string => typeof a === 'string' && Boolean(a.trim())) : undefined;
    out[kind] = {
      installedAt: s.installedAt,
      ...(typeof s.vpsFileId === 'string' ? { vpsFileId: s.vpsFileId } : {}),
      ...(typeof s.version === 'string' ? { version: s.version } : {}),
      ...(authors?.length ? { authors } : {}),
      ...(typeof s.page === 'string' ? { page: s.page } : {}),
      ...(typeof s.comment === 'string' ? { comment: s.comment } : {}),
    };
  }
  return out;
}

/** Le .info avec ces pièces notées (une pièce remplacée prend la place de l'ancienne), le reste conservé. */
export function setPartSources(info: TableInfoFile, patch: Partial<Record<CreditedPart, PartProvenance>>): TableInfoFile {
  const own = (info.CyberPinball && typeof info.CyberPinball === 'object' ? info.CyberPinball : {}) as Record<string, unknown>;
  const parts = own.parts && typeof own.parts === 'object' ? (own.parts as Record<string, unknown>) : {};
  return { ...info, CyberPinball: { ...own, parts: { ...parts, ...patch } } };
}

/** Ce qu'une installation depuis le catalogue sait de chaque fichier (WaitItem, acquisition.ts). */
export interface InstalledItem {
  kind: NeedKind;
  fileId?: string;
  version?: string;
  authors?: string[];
  page?: string;
}

/** Provenance des pièces créditées d'une installation (la table a la sienne : TableSource). */
export function partSourcesFrom(items: readonly InstalledItem[], game: VpsGame | undefined, now = new Date()): Partial<Record<CreditedPart, PartProvenance>> {
  const out: Partial<Record<CreditedPart, PartProvenance>> = {};
  for (const item of items) {
    if (!isCredited(item.kind)) continue;
    const file = item.fileId ? filesOf(game, item.kind).find((f) => f.id === item.fileId) : undefined;
    const authors = item.authors?.length ? item.authors : file?.authors;
    out[item.kind] = {
      installedAt: now.toISOString(),
      ...(item.fileId && !item.fileId.startsWith('recu-') ? { vpsFileId: item.fileId } : {}),
      ...((item.version ?? file?.version) ? { version: item.version ?? file?.version } : {}),
      ...(authors?.length ? { authors: [...authors] } : {}),
      ...((item.page || urlOf(file)) ? { page: item.page || urlOf(file) } : {}),
      ...(file?.comment ? { comment: file.comment } : {}),
    };
  }
  return out;
}

const PART_FILES: Record<CreditedPart, keyof VpsGame> = {
  b2s: 'b2sFiles',
  pup: 'pupPackFiles',
  altcolor: 'altColorFiles',
  altsound: 'altSoundFiles',
  music: 'soundFiles',
  topper: 'topperFiles',
  pov: 'povFiles',
};

function filesOf(game: VpsGame | undefined, kind: CreditedPart | 'table'): VpsTableFile[] {
  if (!game) return [];
  const list = kind === 'table' ? game.tableFiles : (game[PART_FILES[kind]] as VpsTableFile[] | undefined);
  return Array.isArray(list) ? list : [];
}

// ---------------------------------------------------------------------------
// Noms et sites

const urlOf = (f: Pick<VpsTableFile, 'urls'> | undefined): string | undefined => f?.urls?.find((u) => u.url && !u.broken)?.url ?? f?.urls?.[0]?.url;

/** « VPUniverse », « VPForums », « YouTube », sinon le nom du site (« pinballnirvana.com »). */
export function creditSite(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return undefined;
  }
  if (host.endsWith('vpuniverse.com')) return 'VPUniverse';
  if (host.endsWith('vpforums.org')) return 'VPForums';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'YouTube';
  if (host.endsWith('github.com') || host.endsWith('github.io')) return 'GitHub';
  return host;
}

/**
 * Auteurs écrits dans la table par son auteur (« JPSalas, Rothbauerw & others », « g5k / VPW ») :
 * un nom par élément, sans « & others » ni « et al. ».
 */
export function splitAuthors(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\s*(?:,|;|\/|&|\+|\band\b|\bet\b)\s*/i)
    .map((a) => a.replace(/^(?:by|par)\s+/i, '').trim())
    .filter((a) => a && !/^(?:others?|al\.?|co\.?|autres?|team)$/i.test(a));
}

/** « TastyWasps », « TastyWasps et JPSalas », « TastyWasps, JPSalas, Cyberpez et 11 autres » : `max` noms au plus. */
export function namesLabel(names: readonly string[], max = 3): string {
  if (names.length <= max + 1) return formatList(names);
  const rest = names.length - max;
  return tn(rest, '{names} et {n} autre', '{names} et {n} autres', { names: names.slice(0, max).join(', ') });
}

// ---------------------------------------------------------------------------
// Les auteurs de la table

export interface TableAuthorsInput {
  game?: VpsGame;
  source?: TableSource;
  /** Info.Authors du .info (rempli à l'import depuis VPS). */
  infoAuthors?: readonly string[];
  /** Auteur et version écrits dans la table (vpxinfo.ts). */
  vpxAuthor?: string;
  vpxVersion?: string;
}

export interface TableAuthors {
  authors: string[];
  version?: string;
  url?: string;
  comment?: string;
  /** D'où viennent les noms : le fichier installé, reconnu chez VPS, le .info, la table elle-même. */
  from: 'installed' | 'recognized' | 'info' | 'table' | 'unknown';
}

/** Qui a fait la recréation installée, du plus sûr au moins sûr. */
export function tableAuthors(input: TableAuthorsInput): TableAuthors {
  const files = filesOf(input.game, 'table');
  const source = input.source;
  if (source?.authors?.length) {
    const file = files.find((f) => f.id === source.vpsFileId);
    return { authors: [...source.authors], version: source.version ?? file?.version, url: source.page || urlOf(file), comment: file?.comment, from: 'installed' };
  }
  const written = splitAuthors(input.vpxAuthor);
  const keys = new Set(written.map(vpsKey).filter((k) => k.length >= 2));
  if (keys.size && files.length) {
    const byAuthor = files.filter((f) => (f.authors ?? []).some((a) => keys.has(vpsKey(a))));
    const sameVersion = input.vpxVersion ? byAuthor.filter((f) => f.version && vpsKey(f.version) === vpsKey(input.vpxVersion!)) : [];
    // Avec la version, une seule recréation ; sans elle, l'auteur seul ne suffit que s'il n'en a fait qu'une de ce jeu.
    const file = sameVersion.length === 1 ? sameVersion[0] : byAuthor.length === 1 ? byAuthor[0] : undefined;
    if (file?.authors?.length) return { authors: [...file.authors], version: file.version ?? input.vpxVersion, url: urlOf(file), comment: file.comment, from: 'recognized' };
  }
  const info = (input.infoAuthors ?? []).filter((a) => typeof a === 'string' && a.trim());
  if (info.length) return { authors: [...info], version: input.vpxVersion, from: 'info' };
  if (written.length) return { authors: written, version: input.vpxVersion, from: 'table' };
  return { authors: [], from: 'unknown' };
}

/** Auteur principal, pour la roue : le premier cité (VPS et les auteurs mettent l'équipe principale en tête). */
export function leadAuthor(info: TableInfoFile, vpxAuthor?: string): string | undefined {
  const source = tableSourceOf(info)?.authors?.find((a) => a.trim());
  if (source) return source.trim();
  const fromInfo = info.Info?.Authors?.find((a) => typeof a === 'string' && a.trim());
  if (fromInfo) return fromInfo.trim();
  return splitAuthors(vpxAuthor)[0];
}

// ---------------------------------------------------------------------------
// La page « Crédits »

export type CreditKind = 'design' | 'program' | 'table' | CreditedPart | 'media' | 'rules' | 'video';

export interface CreditRow {
  kind: CreditKind;
  /** Rôle, à gauche : « Recréation VPX », « Fronton ». */
  role: string;
  /** Auteurs ; vide quand on ne les connaît pas (voir `unknown`) ou qu'un texte les remplace. */
  authors: string[];
  /** À la place des auteurs : « Data East », « Filmée sur cette borne ». */
  text?: string;
  /** « version 1.05 · VPUniverse ». */
  detail?: string;
  /** Page à ouvrir au téléphone (QR code). */
  url?: string;
  /** Auteurs inconnus : pourquoi. */
  unknown?: string;
}

export type CreditGroupId = 'machine' | 'table' | 'dressing' | 'menu' | 'rules';

export interface CreditGroup {
  id: CreditGroupId;
  title: string;
  rows: CreditRow[];
}

/** Un média du menu dont la provenance est notée (mediadb.ts, MediaOrigin). */
export interface MediaCredit {
  /** « Vidéo du plateau », « Logo de la roue ». */
  label: string;
  /** « VPinMediaDB », « VPUniverse », « Cette borne ». */
  origin: string;
  authors?: string[];
  url?: string;
  /** « téléchargé le 21/10/2026 ». */
  detail?: string;
  /** Média fait sur cette borne (Jouer et enregistrer, capture) : pas d'auteur à citer. */
  own?: boolean;
}

/** Une source des règles (table-rules.ts) : carte, feuille de règles, vidéo d'explication, guide. */
export interface RulesCredit {
  kind: 'rules' | 'video';
  label: string;
  /** Site ou titre, quand les auteurs ne sont pas connus (« The Pinball Primer »). */
  text?: string;
  authors?: string[];
  url?: string;
  detail?: string;
}

export interface TableCreditsInput extends TableAuthorsInput {
  manufacturer?: string;
  year?: number;
  /** ROM du script (« bttf_a28 »), quand la table en demande une. */
  rom?: string;
  parts: Partial<Record<CreditedPart, PartProvenance>>;
  /**
   * Pièces présentes dans le dossier de la table, notées ou non ; `false` : absente (une pièce notée
   * puis retirée n'est plus créditée) ; non dit : on ne sait pas (topper, point de vue ; lecture rapide).
   */
  present: Partial<Record<CreditedPart, boolean>>;
  medias: readonly MediaCredit[];
  rules: readonly RulesCredit[];
}

export const CREDIT_ROLES: Record<CreditedPart, string> = {
  get b2s() {
    return t('Fronton');
  },
  pup: 'PuP-Pack',
  get altcolor() {
    return t('Couleurs du DMD');
  },
  get altsound() {
    return t('Sons remasterisés');
  },
  get music() {
    return t('Musique');
  },
  topper: 'Topper',
  get pov() {
    return t('Point de vue');
  },
};

const versionDetail = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
const versionText = (version: string | undefined) => (version ? t('version {version}', { version }) : undefined);

/** Les groupes de la page « Crédits », de la vraie machine aux règles ; un groupe vide n'est pas montré. */
export function tableCredits(input: TableCreditsInput): CreditGroup[] {
  const groups: CreditGroup[] = [];
  const game = input.game;
  const manufacturer = game?.manufacturer ?? input.manufacturer;
  const year = game?.year ?? input.year;

  const machine: CreditRow[] = [];
  const designers = (game?.designers ?? []).filter((d) => d.trim());
  if (designers.length) machine.push({ kind: 'design', role: t('Conception'), authors: designers, detail: versionDetail([manufacturer, year].filter(Boolean).join(', ') || undefined, t('la vraie machine')) });
  if (input.rom) machine.push({ kind: 'program', role: t('Programme'), authors: [], text: manufacturer ?? t('Le fabricant de la machine'), detail: t('ROM {rom} · jouée par PinMAME', { rom: input.rom }) });
  if (machine.length) groups.push({ id: 'machine', title: t('La machine'), rows: machine });

  const who = tableAuthors(input);
  const tableRow: CreditRow = who.authors.length
    ? { kind: 'table', role: t('Recréation VPX'), authors: who.authors, detail: versionDetail(who.comment, versionText(who.version), creditSite(who.url)), url: who.url }
    : { kind: 'table', role: t('Recréation VPX'), authors: [], unknown: t('Ni la table ni la base VPS ne le disent') };
  groups.push({ id: 'table', title: t('La table'), rows: [tableRow] });

  const dressing: CreditRow[] = [];
  for (const kind of CREDITED_PARTS) {
    if (input.present[kind] === false) continue;
    const source = input.parts[kind];
    if (source?.authors?.length) {
      dressing.push({ kind, role: CREDIT_ROLES[kind], authors: source.authors, detail: versionDetail(source.comment, versionText(source.version), creditSite(source.page)), url: source.page });
    } else if (source || input.present[kind]) {
      dressing.push({
        kind,
        role: CREDIT_ROLES[kind],
        authors: [],
        unknown: source ? t('La base VPS ne cite pas d’auteur') : t('Installé avant que Cyber Pinball note les auteurs, ou à la main'),
        url: source?.page,
      });
    }
  }
  if (dressing.length) groups.push({ id: 'dressing', title: t('L’habillage'), rows: dressing });

  const menu: CreditRow[] = input.medias.map((m) =>
    m.own
      ? { kind: 'media', role: m.label, authors: [], text: m.origin, detail: m.detail }
      : m.authors?.length
        ? { kind: 'media', role: m.label, authors: m.authors, detail: versionDetail(m.origin, m.detail), url: m.url }
        : { kind: 'media', role: m.label, authors: [], text: m.origin, detail: versionDetail(t('auteur non renseigné'), m.detail), url: m.url },
  );
  if (menu.length) groups.push({ id: 'menu', title: t('Le menu'), rows: menu });

  const rules: CreditRow[] = input.rules.map((r) => ({ kind: r.kind, role: r.label, authors: r.authors ?? [], ...(r.authors?.length ? {} : { text: r.text ?? t('Auteur non renseigné') }), detail: r.detail, url: r.url }));
  if (rules.length) groups.push({ id: 'rules', title: t('Règles et explications'), rows: rules });
  return groups;
}

/** Ce qu'une ligne montre en texte : les auteurs (abrégés), sinon son texte, sinon « Auteur non renseigné ». */
export function creditText(row: CreditRow, max = 3): string {
  if (row.authors.length) return namesLabel(row.authors, max);
  return row.text ?? t('Auteur non renseigné');
}

/** Résumé de la fiche : « Table de TastyWasps, JPSalas et 12 autres · fronton de HauntFreaks ». */
export function creditsSummary(groups: readonly CreditGroup[]): string {
  const rows = groups.flatMap((g) => g.rows);
  const table = rows.find((r) => r.kind === 'table' && r.authors.length);
  const b2s = rows.find((r) => r.kind === 'b2s' && r.authors.length);
  const parts = [table ? t('Table de {names}', { names: namesLabel(table.authors, 2) }) : undefined, b2s ? t('fronton de {names}', { names: namesLabel(b2s.authors, 1) }) : undefined].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return t('Qui a fait la table, son habillage, ses médias et ses règles');
}

/** Les crédits du mode attente : table, fronton, couleurs, ceux qu'on connaît. */
export function attractCredits(groups: readonly CreditGroup[]): { role: string; names: string }[] {
  const rows = groups.flatMap((g) => g.rows).filter((r) => r.authors.length);
  const pick: [CreditKind, () => string][] = [
    ['table', () => t('Table')],
    ['b2s', () => t('Fronton')],
    ['altcolor', () => t('Couleurs')],
  ];
  return pick.flatMap(([kind, role]) => {
    const row = rows.find((r) => r.kind === kind);
    return row ? [{ role: role(), names: namesLabel(row.authors, kind === 'table' ? 2 : 1) }] : [];
  });
}

// ---------------------------------------------------------------------------
// La communauté

export interface CommunityAuthor {
  name: string;
  /** Contributions sur la borne (une par pièce). */
  count: number;
  /** « 8 frontons · 4 tables », du rôle le plus fréquent au moins fréquent. */
  roles: string;
  /** Tables de la borne où il est crédité (titres). */
  tables: string[];
}

const ROLE_COUNT: Partial<Record<CreditKind, (n: number) => string>> = {
  table: (n) => tn(n, '{n} table', '{n} tables'),
  b2s: (n) => tn(n, '{n} fronton', '{n} frontons'),
  pup: (n) => tn(n, '{n} PuP-Pack', '{n} PuP-Packs'),
  altcolor: (n) => tn(n, '{n} colorisation', '{n} colorisations'),
  altsound: (n) => tn(n, '{n} jeu de sons', '{n} jeux de sons'),
  music: (n) => tn(n, '{n} musique', '{n} musiques'),
  topper: (n) => tn(n, '{n} topper', '{n} toppers'),
  pov: (n) => tn(n, '{n} point de vue', '{n} points de vue'),
  media: (n) => tn(n, '{n} média', '{n} médias'),
  rules: (n) => tn(n, '{n} carte de règles', '{n} cartes de règles'),
  video: (n) => tn(n, '{n} explication', '{n} explications'),
};

/**
 * Les auteurs d'une borne, des plus présents aux moins présents (puis par nom) : chaque pièce
 * créditée compte une fois. La vraie machine (concepteurs, fabricant) n'en fait pas partie.
 */
export function communityAuthors(tables: readonly { title: string; groups: readonly CreditGroup[] }[]): CommunityAuthor[] {
  const tally = new Map<string, { name: string; count: number; roles: Map<CreditKind, number>; tables: Set<string> }>();
  for (const table of tables) {
    for (const row of table.groups.flatMap((g) => (g.id === 'machine' ? [] : g.rows))) {
      for (const author of row.authors) {
        const key = vpsKey(author) || author.toLowerCase();
        const one = tally.get(key) ?? { name: author.trim(), count: 0, roles: new Map(), tables: new Set() };
        one.count++;
        one.roles.set(row.kind, (one.roles.get(row.kind) ?? 0) + 1);
        one.tables.add(table.title);
        tally.set(key, one);
      }
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((one) => ({
      name: one.name,
      count: one.count,
      roles: [...one.roles]
        .sort((a, b) => b[1] - a[1])
        .map(([kind, n]) => ROLE_COUNT[kind]?.(n))
        .filter(Boolean)
        .join(' · '),
      tables: [...one.tables].sort((a, b) => a.localeCompare(b)),
    }));
}
