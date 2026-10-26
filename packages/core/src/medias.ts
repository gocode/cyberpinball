// Médias de présentation des jeux : catalogue des types, recherche du fichier à
// montrer pour une table, dimensions lues dans l'en-tête des fichiers.
// Conception : docs/recherche/medias.md, § 5.
//
// Rangement (proposition de VPX 10.8.1, docs/FileLayout.md l. 117-126) : les
// médias d'un jeu vont dans <dossier de la table>\medias\, sous le nom
// « (Type) <nom>.ext ». Les défauts de la borne sont dans <racine>\media\, un seul
// exemplaire, sous le nom « (Type).ext ».

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { layoutOf } from './locations';
import { edgeRotation, type Cabinet, type FlipperEdge, type RoleId, type Rotation } from './model';
import { readInfo, type TableEntry, type TableInfoFile } from './tables';
import { dmdKindForRatio, dmdKindOf } from './dmdscreen';

/** Types de VPX, tels qu'ils apparaissent entre parenthèses dans les noms de fichiers. */
export type MediaType =
  | 'Wheel'
  | 'Playfield'
  | 'Backglass'
  | 'DMD'
  | 'FullDMD'
  | 'Topper'
  | 'Loading'
  | 'Audio'
  | 'AudioLaunch'
  | 'GameInfo'
  | 'GameHelp'
  | 'Other'
  | 'RealDMD'
  | 'RealColorDMD';

/** Moments où le menu montre un média (§ 5.2). */
export type MediaMoment = 'browse' | 'sheet' | 'loading' | 'game' | 'attract';

export const MOMENT_LABELS: Record<MediaMoment, string> = {
  get browse() {
    return t('Navigation');
  },
  get sheet() {
    return t('Fiche, sur demande');
  },
  get loading() {
    return t('Chargement');
  },
  get game() {
    return t('Partie');
  },
  get attract() {
    return t('Attente');
  },
};

/** Où le média est montré : un rôle de la borne, ou la sortie audio du menu. */
export type MediaTarget = RoleId | 'audio';

export type MediaKind = 'image' | 'video' | 'audio';

/**
 * Repli intégré, dessiné par l'application quand aucun fichier n'est trouvé
 * (composants de app/renderer/fallback.js). « none » : rien, ou le silence.
 */
export type MediaFallback =
  | 'wheel-title'
  | 'playfield-gradient'
  | 'backglass-card'
  | 'dmd-dots'
  | 'topper-logo'
  | 'loading-screen'
  | 'info-sheet'
  | 'game-controls'
  | 'none';

export interface MediaTypeInfo {
  type: MediaType;
  /** Libellé de l'interface ; le type reste le nom de fichier. */
  label: string;
  /** Fonction du média, en une phrase, affichée partout où le type apparaît. */
  description: string;
  /** Absent : pas de rôle chez nous (lu, gardé, ignoré). */
  target?: MediaTarget;
  moments: readonly MediaMoment[];
  /** Extensions acceptées, sans point, par ordre de préférence quand plusieurs fichiers conviennent. */
  formats: readonly string[];
  /** Plusieurs pages (prospectus, règles). */
  pages: boolean;
  /** Média du playfield tourné d'après playfield.flipperEdge. */
  orientable: boolean;
  /** Remplissage de l'écran ; on ne déforme jamais une image. */
  fit?: 'cover' | 'contain';
  fallback: MediaFallback;
  /** Ce que montre le repli, pour le gestionnaire. */
  fallbackLabel: string;
  /** Noms du même média chez les autres frontends (correspondance du § 2.2). */
  aliases: {
    /** Dossier d'écran de PinUP Popper (POPMedia\<émulateur>\<dossier>\<jeu>.ext). */
    popper: readonly string[];
    /** Dossier de PinballX (Media\Visual Pinball\<dossier>\<jeu>.ext). */
    pinballx: readonly string[];
    /** Nom fixe de VPinFE dans medias\, par ordre de préférence. */
    vpinfe: readonly string[];
  };
}

const IMAGE_FORMATS = ['png', 'apng', 'webp', 'jpg', 'jpeg', 'gif'] as const;
const VIDEO_FORMATS = ['mp4', 'webm', 'm4v'] as const;
const AUDIO_FORMATS = ['mp3', 'ogg', 'm4a', 'flac', 'wav'] as const;
/** Un écran animé : la vidéo d'abord, l'image sinon. */
const SCREEN_FORMATS = [...VIDEO_FORMATS, ...IMAGE_FORMATS] as const;
const SCREEN_MOMENTS: readonly MediaMoment[] = ['browse', 'loading', 'game', 'attract'];

/**
 * Formats que le menu (Electron 44.5.1, Chromium 152) ne lit pas : les anciens
 * formats de Popper. flv, f4v, avi et mov vérifiés par canPlayType ; wmv, mpg et
 * mpeg absents de la liste des formats de Chromium (chromium.org/audio-video).
 * Le médecin les signale.
 */
export const UNREADABLE_FORMATS: readonly string[] = ['flv', 'f4v', 'avi', 'mov', 'wmv', 'mpg', 'mpeg'];

export const MEDIA_TYPES: readonly MediaTypeInfo[] = [
  {
    type: 'Wheel',
    get label() {
      return t('Logo');
    },
    get description() {
      return t('Logo du jeu sur fond transparent, qui identifie la table dans la liste du menu.');
    },
    target: 'playfield',
    moments: ['browse', 'attract'],
    formats: ['apng', 'png', 'webp', 'gif'],
    pages: false,
    orientable: false,
    fit: 'contain',
    fallback: 'wheel-title',
    get fallbackLabel() {
      return t('Titre en texte stylisé');
    },
    aliases: { popper: ['Wheel'], pinballx: ['Wheel Images'], vpinfe: ['wheel.png'] },
  },
  {
    type: 'Playfield',
    get label() {
      return t('Plateau');
    },
    get description() {
      return t('La table qui joue, en fond du menu derrière la liste.');
    },
    target: 'playfield',
    moments: ['browse', 'attract'],
    formats: SCREEN_FORMATS,
    pages: false,
    orientable: true,
    fit: 'cover',
    fallback: 'playfield-gradient',
    get fallbackLabel() {
      return t('Verre fumé sarcelle, discret');
    },
    aliases: {
      popper: ['PlayField'],
      pinballx: ['Table Videos', 'Table Images'],
      vpinfe: ['table.mp4', 'table.png', 'fss.png'],
    },
  },
  {
    type: 'Backglass',
    get label() {
      return t('Fronton');
    },
    get description() {
      return t("L'image ou l'animation du fronton du jeu.");
    },
    target: 'backglass',
    moments: SCREEN_MOMENTS,
    formats: SCREEN_FORMATS,
    pages: false,
    orientable: false,
    fit: 'contain',
    fallback: 'backglass-card',
    get fallbackLabel() {
      return t('Carte générée : titre, fabricant, année');
    },
    aliases: { popper: ['Backglass'], pinballx: ['Backglass Videos', 'Backglass Images'], vpinfe: ['bg.mp4', 'bg.png'] },
  },
  {
    type: 'DMD',
    get label() {
      return t('Afficheur');
    },
    get description() {
      return t("Animation de l'afficheur 4:1 du jeu.");
    },
    target: 'dmd',
    moments: SCREEN_MOMENTS,
    formats: SCREEN_FORMATS,
    pages: false,
    orientable: false,
    fit: 'contain',
    fallback: 'dmd-dots',
    get fallbackLabel() {
      return t('Titre en points sur la grille 128×32');
    },
    aliases: { popper: ['DMD'], pinballx: ['DMD Videos', 'DMD Images'], vpinfe: [] },
  },
  {
    type: 'FullDMD',
    get label() {
      return t('Afficheur large');
    },
    get description() {
      return t('Animation 16:9 pour un écran DMD large.');
    },
    target: 'dmd',
    moments: SCREEN_MOMENTS,
    formats: SCREEN_FORMATS,
    pages: false,
    orientable: false,
    fit: 'contain',
    fallback: 'dmd-dots',
    get fallbackLabel() {
      return t('Titre en points sur la grille 128×32');
    },
    // Le dmd.png de VPinFE et de VPinMediaDB est un FullDMD 16:9 (§ 3.1).
    aliases: { popper: ['Menu'], pinballx: ['FullDMD Videos'], vpinfe: ['dmd.mp4', 'dmd.png'] },
  },
  {
    type: 'Topper',
    label: 'Topper',
    get description() {
      return t('Animation du bandeau au-dessus du fronton.');
    },
    target: 'topper',
    moments: SCREEN_MOMENTS,
    formats: SCREEN_FORMATS,
    pages: false,
    orientable: false,
    fit: 'contain',
    fallback: 'topper-logo',
    get fallbackLabel() {
      return t('Logo animé de Cyber Pinball avec le fabricant et l’année');
    },
    aliases: { popper: ['Topper'], pinballx: ['Topper Videos', 'Topper Images'], vpinfe: [] },
  },
  {
    type: 'Loading',
    get label() {
      return t('Chargement');
    },
    get description() {
      return t('Vidéo jouée pendant que VPX charge la table.');
    },
    target: 'playfield',
    moments: ['loading'],
    formats: VIDEO_FORMATS,
    pages: false,
    orientable: true,
    fit: 'cover',
    fallback: 'loading-screen',
    get fallbackLabel() {
      return t('Écran de chargement : titre et barre d’attente');
    },
    aliases: { popper: ['Loading'], pinballx: ['Loading Videos'], vpinfe: [] },
  },
  {
    type: 'Audio',
    get label() {
      return t('Musique du jeu');
    },
    get description() {
      return t('Musique jouée tant que la table est sélectionnée.');
    },
    target: 'audio',
    moments: ['browse', 'attract'],
    formats: AUDIO_FORMATS,
    pages: false,
    orientable: false,
    fallback: 'none',
    get fallbackLabel() {
      return t('Silence (ou la musique d’ambiance de la borne, si elle existe)');
    },
    aliases: { popper: ['Audio'], pinballx: ['Table Audio'], vpinfe: ['audio.mp3'] },
  },
  {
    type: 'AudioLaunch',
    get label() {
      return t('Son de lancement');
    },
    get description() {
      return t('Son court au lancement.');
    },
    target: 'audio',
    moments: ['loading'],
    formats: AUDIO_FORMATS,
    pages: false,
    orientable: false,
    fallback: 'none',
    get fallbackLabel() {
      return t('Aucun');
    },
    aliases: { popper: ['AudioLaunch'], pinballx: ['Launch Audio'], vpinfe: [] },
  },
  {
    type: 'GameInfo',
    get label() {
      return t('Prospectus');
    },
    get description() {
      return t('Une ou plusieurs pages de présentation du jeu, sur demande.');
    },
    target: 'playfield',
    moments: ['sheet'],
    formats: [...IMAGE_FORMATS, 'mp4'],
    pages: true,
    orientable: false,
    fit: 'contain',
    fallback: 'info-sheet',
    get fallbackLabel() {
      return t('Fiche générée depuis le .info : titre, fabricant, année, auteurs');
    },
    aliases: { popper: ['GameInfo'], pinballx: ['Flyer Images'], vpinfe: ['flyer.png'] },
  },
  {
    type: 'GameHelp',
    get label() {
      return t('Règles');
    },
    get description() {
      return t('Une ou plusieurs cartes de règles, sur demande.');
    },
    target: 'playfield',
    moments: ['sheet'],
    formats: [...IMAGE_FORMATS, 'mp4'],
    pages: true,
    orientable: false,
    fit: 'contain',
    fallback: 'game-controls',
    get fallbackLabel() {
      return t('Commandes de la partie');
    },
    aliases: { popper: ['GameHelp'], pinballx: ['Instruction Cards'], vpinfe: [] },
  },
  {
    type: 'Other',
    get label() {
      return t('Autre');
    },
    get description() {
      return t('Média sans écran chez Cyber Pinball : lu, gardé, ignoré.');
    },
    moments: [],
    formats: SCREEN_FORMATS,
    pages: false,
    orientable: false,
    fallback: 'none',
    get fallbackLabel() {
      return t('Aucun');
    },
    aliases: { popper: ['Other2'], pinballx: [], vpinfe: [] },
  },
  {
    type: 'RealDMD',
    get label() {
      return t('DMD physique');
    },
    get description() {
      return t('Image pour un DMD physique, que Cyber Pinball ne gère pas : lue, gardée, ignorée.');
    },
    moments: [],
    formats: SCREEN_FORMATS,
    pages: false,
    orientable: false,
    fallback: 'none',
    get fallbackLabel() {
      return t('Aucun');
    },
    aliases: { popper: [], pinballx: ['Real DMD Images', 'Real DMD Videos'], vpinfe: ['realdmd.png'] },
  },
  {
    type: 'RealColorDMD',
    get label() {
      return t('DMD physique couleur');
    },
    get description() {
      return t('Image pour un DMD physique en couleur, que Cyber Pinball ne gère pas : lue, gardée, ignorée.');
    },
    moments: [],
    formats: SCREEN_FORMATS,
    pages: false,
    orientable: false,
    fallback: 'none',
    get fallbackLabel() {
      return t('Aucun');
    },
    aliases: {
      popper: [],
      pinballx: ['Real DMD Color Images', 'Real DMD Color Videos'],
      vpinfe: ['realdmd-color.png'],
    },
  },
];

const BY_TYPE = new Map(MEDIA_TYPES.map((t) => [t.type.toLowerCase(), t]));

export function mediaTypeInfo(type: MediaType): MediaTypeInfo {
  return BY_TYPE.get(type.toLowerCase())!;
}

/** Type écrit dans un nom de fichier, quelle que soit la casse ; undefined s'il est inconnu. */
export function parseMediaType(raw: string): MediaType | undefined {
  return BY_TYPE.get(raw.trim().toLowerCase())?.type;
}

/** Type correspondant à un dossier de Popper ou de PinballX (« Wheel Images », « Menu »…). */
export function mediaTypeFromFolder(frontend: 'popper' | 'pinballx', folder: string): MediaType | undefined {
  const name = folder.trim().toLowerCase();
  return MEDIA_TYPES.find((t) => t.aliases[frontend].some((a) => a.toLowerCase() === name))?.type;
}

/** Type correspondant à un nom fixe de VPinFE (« bg.png »). */
export function mediaTypeFromVpinfe(fileName: string): MediaType | undefined {
  const name = fileName.trim().toLowerCase();
  return MEDIA_TYPES.find((t) => t.aliases.vpinfe.includes(name))?.type;
}

/** Image, vidéo ou son, d'après l'extension ; undefined pour un format inconnu. */
export function mediaKind(file: string): MediaKind | undefined {
  const ext = extOf(file);
  if ((IMAGE_FORMATS as readonly string[]).includes(ext)) return 'image';
  if ((VIDEO_FORMATS as readonly string[]).includes(ext) || UNREADABLE_FORMATS.includes(ext)) return 'video';
  if ((AUDIO_FORMATS as readonly string[]).includes(ext)) return 'audio';
  return undefined;
}

export function isAcceptedFormat(type: MediaType, file: string): boolean {
  return mediaTypeInfo(type).formats.includes(extOf(file));
}

function extOf(file: string): string {
  return path.extname(file).slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Noms des fichiers

/** Dossier des médias d'une table : <dossier de la table>\medias. */
export function tableMediaDir(table: TableEntry): string {
  return path.join(table.folder, 'medias');
}

/** Nom du .vpx sans extension : premier nom cherché (règle commune de VPX, FileLayout l. 58-61). */
function vpxName(table: TableEntry): string {
  return path.basename(table.file).replace(/\.vpx$/i, '');
}

/** La table a son propre dossier (et pas en vrac à la racine des tables). */
function inOwnFolder(table: TableEntry): boolean {
  return table.id.includes('/');
}

/**
 * Noms cherchés pour une table, dans l'ordre : le .vpx, puis le dossier. Une table
 * en vrac à la racine des tables n'a que le premier.
 */
export function mediaNames(table: TableEntry): string[] {
  const names = [vpxName(table)];
  const folder = path.basename(table.folder);
  if (inOwnFolder(table) && folder.toLowerCase() !== names[0]!.toLowerCase()) names.push(folder);
  return names;
}

/**
 * Nom sous lequel Cyber Pinball écrit un média : toujours « (Type) <nom du
 * dossier>.ext », pour qu'il serve à toutes les versions du jeu rangées dans le
 * dossier (le nom du .vpx pour une table en vrac). Page 2 et suivantes : « … 2.ext ».
 */
export function mediaFileName(table: TableEntry, type: MediaType, ext: string, page = 1): string {
  const name = inOwnFolder(table) ? path.basename(table.folder) : vpxName(table);
  const suffix = page > 1 ? ` ${page}` : '';
  return `(${mediaTypeInfo(type).type}) ${name}${suffix}.${ext.replace(/^\./, '').toLowerCase()}`;
}

export function mediaWritePath(table: TableEntry, type: MediaType, ext: string, page = 1): string {
  return path.join(tableMediaDir(table), mediaFileName(table, type, ext, page));
}

/** « (Type) nom suite.ext » -> type, nom avec suite, extension ; undefined sans « (Type) » connu. */
export function parseMediaFileName(fileName: string): { type: MediaType; stem: string; ext: string } | undefined {
  const m = /^\(([^()]+)\)\s*(.*?)\.([^.]+)$/.exec(fileName);
  if (!m) return undefined;
  const type = parseMediaType(m[1]!);
  return type ? { type, stem: m[2]!.trim(), ext: m[3]!.toLowerCase() } : undefined;
}

/**
 * Le nom (sans « (Type) ») désigne-t-il ce jeu ? Page 1 : nom exact. Pages
 * suivantes : le nom suivi d'un numéro (« Nom 2 », « Nom_02 », « Nom02 » comme
 * chez Popper). Un nom plus long (« T2 » contre « T2 (Williams 1991) ») ne
 * correspond pas.
 */
export function pageOf(stem: string, name: string): number | undefined {
  const s = stem.toLowerCase();
  const n = name.toLowerCase();
  if (s === n) return 1;
  if (!s.startsWith(n)) return undefined;
  const m = /^[ _-]?(\d{1,3})$/.exec(stem.slice(name.length));
  return m ? Number(m[1]) : undefined;
}

function comparePages(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
  } catch {
    return [];
  }
}

/** Ce que contient medias\ d'une table : chaque fichier rattaché à un type et à un nom. */
export interface TableMediaFile {
  file: string;
  /** Absent : ni « (Type) », ni nom de VPinFE. */
  type?: MediaType;
  /** Par quel nom il a été reconnu ; « other-name » : « (Type) » d'un autre nom que le .vpx ou le dossier. */
  match?: 'vpx-name' | 'folder-name' | 'vpinfe' | 'other-name';
  /** Numéro de page, 1 pour la première. */
  page?: number;
  /** Format lu par le menu pour ce type. */
  accepted: boolean;
}

/**
 * Inventaire de medias\ d'une table, pour le gestionnaire (T8) et le médecin
 * (T11) : nom qui ne correspond ni au .vpx ni au dossier, format illisible.
 */
export function scanTableMedias(table: TableEntry): TableMediaFile[] {
  const dir = tableMediaDir(table);
  const names = mediaNames(table);
  const out: TableMediaFile[] = [];
  for (const name of listDir(dir).sort(comparePages)) {
    const file = path.join(dir, name);
    const parsed = parseMediaFileName(name);
    if (parsed) {
      let match: TableMediaFile['match'] = 'other-name';
      let page: number | undefined;
      for (const [i, n] of names.entries()) {
        page = pageOf(parsed.stem, n);
        if (page !== undefined) {
          match = i === 0 ? 'vpx-name' : 'folder-name';
          break;
        }
      }
      out.push({ file, type: parsed.type, match, page: page ?? 1, accepted: isAcceptedFormat(parsed.type, name) });
      continue;
    }
    const vpinfe = mediaTypeFromVpinfe(name);
    if (vpinfe) out.push({ file, type: vpinfe, match: 'vpinfe', page: 1, accepted: true });
    else out.push({ file, accepted: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Résolution

/** Image extraite du .directb2s : celle du fronton (BackglassOnImage, sinon Off), ou DMDImage. */
export type B2sImageKind = 'backglass' | 'dmd';

/**
 * Point d'accroche de la tâche T4 (packages/core/src/b2simage.ts) : chemin de
 * l'image du .directb2s de la table, déjà extraite dans <racine>\data\cache\medias,
 * ou undefined. Synchrone : la lecture du .directb2s (des dizaines de Mo) se fait
 * ailleurs, en tâche de fond ; tant qu'elle n'est pas faite, la recherche passe à
 * l'étape suivante.
 */
export type B2sImageProvider = (table: TableEntry, kind: B2sImageKind) => string | undefined;

/** Étape de la recherche (§ 5.3) qui a fourni le média. */
export type MediaSource = 'vpx-name' | 'folder-name' | 'vpinfe' | 'b2s' | 'default' | 'fallback';

export interface ResolvedMedia {
  /** Type demandé. */
  type: MediaType;
  /** Type du fichier trouvé : FullDMD à la place de DMD, et inversement. Absent pour le repli intégré. */
  foundType?: MediaType;
  source: MediaSource;
  /** Pages dans l'ordre (une seule hors prospectus et règles) ; vide pour le repli intégré. */
  files: string[];
  /** Première page. */
  file?: string;
  kind?: MediaKind;
  /** Repli intégré à dessiner quand files est vide. */
  fallback?: MediaFallback;
  fit?: 'cover' | 'contain';
  /**
   * Rotation horaire à appliquer au média pour qu'il soit droit vu du joueur.
   * Toujours 0 hors des médias orientables (Playfield, Loading).
   */
  rotation: Rotation;
  /** Dimensions de la première page, quand elles ont été mesurées (médias orientables, ou `measure`). */
  dimensions?: MediaDimensions;
  /** Fichiers qui portaient le bon nom mais dans un format que le menu ne lit pas (flv, avi…). */
  skipped: string[];
}

export interface ResolveOptions {
  /** Image du .directb2s (tâche T4). Sans elle, l'étape 4 est sautée. */
  b2sImage?: B2sImageProvider;
  /**
   * Bord des flippers dans l'image Windows du playfield (currentFlipperEdge, ou
   * cabinet.playfield.flipperEdge). Défaut : celui du modèle de borne, sinon en bas.
   */
  flipperEdge?: FlipperEdge;
  cabinet?: Cabinet;
  /** Cache des dimensions ; sans lui, chaque appel relit les en-têtes. */
  dimensions?: MediaDimensionCache;
  /** Mesurer aussi les médias non orientables. */
  measure?: boolean;
  /** Demi-tours mémorisés (sinon lus dans table.info). */
  memory?: MediaMemory;
}

/** Un fichier par type, ou toutes les pages ; les formats illisibles sont mis de côté. */
function pick(info: MediaTypeInfo, candidates: { file: string; page: number }[], skipped: string[]): string[] {
  const ok: { file: string; page: number }[] = [];
  for (const c of candidates) {
    if (info.formats.includes(extOf(c.file))) ok.push(c);
    else skipped.push(c.file);
  }
  if (ok.length === 0) return [];
  if (info.pages) {
    return ok
      .sort((a, b) => a.page - b.page || comparePages(path.basename(a.file), path.basename(b.file)))
      .map((c) => c.file);
  }
  const first = ok.filter((c) => c.page === 1);
  if (first.length === 0) return [];
  const rank = (f: string) => info.formats.indexOf(extOf(f));
  return [first.sort((a, b) => rank(a.file) - rank(b.file))[0]!.file];
}

/** Étapes 1 à 3 pour un type : nom du .vpx, nom du dossier, noms de VPinFE. */
function findInTable(table: TableEntry, info: MediaTypeInfo, files: string[], skipped: string[]): { source: MediaSource; files: string[] } | undefined {
  const dir = tableMediaDir(table);
  const parsed = files.map((f) => ({ f, p: parseMediaFileName(f) })).filter((x) => x.p?.type === info.type);
  for (const [i, name] of mediaNames(table).entries()) {
    const candidates: { file: string; page: number }[] = [];
    for (const { f, p } of parsed) {
      const page = pageOf(p!.stem, name);
      if (page !== undefined) candidates.push({ file: path.join(dir, f), page });
    }
    const found = pick(info, candidates, skipped);
    if (found.length) return { source: i === 0 ? 'vpx-name' : 'folder-name', files: found };
  }
  for (const alias of info.aliases.vpinfe) {
    const f = files.find((x) => x.toLowerCase() === alias);
    if (f) return { source: 'vpinfe', files: [path.join(dir, f)] };
  }
  return undefined;
}

/** Étape 5 : <racine>\media\(Type).*, avec pages « (Type) 2.png ». */
function findDefault(root: string, info: MediaTypeInfo, skipped: string[]): string[] {
  const dir = layoutOf(root).media;
  const candidates: { file: string; page: number }[] = [];
  for (const f of listDir(dir)) {
    const m = /^\(([^()]+)\)\s*(.*?)\.[^.]+$/.exec(f);
    if (!m || parseMediaType(m[1]!) !== info.type) continue;
    const page = pageOf(m[2]!, '');
    if (page !== undefined) candidates.push({ file: path.join(dir, f), page });
  }
  return pick(info, candidates, skipped);
}

/** Autre type d'afficheur, essayé avant les défauts : FullDMD réduit pour un DMD, et inversement. */
function dmdPartner(type: MediaType): MediaType | undefined {
  return type === 'DMD' ? 'FullDMD' : type === 'FullDMD' ? 'DMD' : undefined;
}

/**
 * Média à montrer pour une table, dans l'ordre du § 5.3 :
 * 1. medias\(Type) <nom du .vpx>.* ; 2. medias\(Type) <nom du dossier>.* ;
 * 3. noms de VPinFE dans medias\ ; 4. image du .directb2s (fronton ; DMDImage pour
 * l'afficheur) ; 5. <racine>\media\(Type).* ; 6. repli intégré.
 * Pour DMD et FullDMD, l'autre type est essayé aux étapes 1 à 3 avant l'étape 4.
 */
export function resolveMedia(table: TableEntry, root: string, type: MediaType, options: ResolveOptions = {}): ResolvedMedia {
  const info = mediaTypeInfo(type);
  const partner = dmdPartner(info.type);
  const files = listDir(tableMediaDir(table));
  const skipped: string[] = [];
  const done = (source: MediaSource, found: string[], foundType: MediaType) =>
    finish(table, info, { source, files: found, foundType, skipped }, options);

  const own = findInTable(table, info, files, skipped);
  if (own) return done(own.source, own.files, info.type);
  if (partner) {
    const other = findInTable(table, mediaTypeInfo(partner), files, skipped);
    if (other) return done(other.source, other.files, partner);
  }
  const b2sKind: B2sImageKind | undefined = info.type === 'Backglass' ? 'backglass' : partner ? 'dmd' : undefined;
  if (b2sKind && options.b2sImage) {
    const image = options.b2sImage(table, b2sKind);
    if (image && fs.existsSync(image)) return done('b2s', [image], info.type);
  }
  const byDefault = findDefault(root, info, skipped);
  if (byDefault.length) return done('default', byDefault, info.type);
  if (partner) {
    const other = findDefault(root, mediaTypeInfo(partner), skipped);
    if (other.length) return done('default', other, partner);
  }
  return { type: info.type, source: 'fallback', files: [], fallback: info.fallback, fit: info.fit, rotation: 0, skipped };
}

function finish(
  table: TableEntry,
  info: MediaTypeInfo,
  found: { source: MediaSource; files: string[]; foundType: MediaType; skipped: string[] },
  options: ResolveOptions,
): ResolvedMedia {
  const file = found.files[0]!;
  const kind = mediaKind(file);
  const result: ResolvedMedia = {
    type: info.type,
    foundType: found.foundType,
    source: found.source,
    files: found.files,
    file,
    kind,
    fit: info.fit,
    rotation: 0,
    skipped: found.skipped,
  };
  if (info.orientable || options.measure) {
    result.dimensions = options.dimensions ? options.dimensions.get(file) : readMediaDimensions(file);
  }
  if (info.orientable) {
    const edge = options.flipperEdge ?? options.cabinet?.playfield?.flipperEdge ?? 'bottom';
    const memory = options.memory ?? mediaMemory(table.info);
    result.rotation = playfieldMediaRotation(result.dimensions, edge, memory.halfTurn?.[info.type] === true);
  }
  return result;
}

/**
 * Média de chaque rôle de la borne : Playfield, Backglass, Topper, et pour le DMD
 * le type de son écran, FullDMD ou DMD seul (dmdMediaType).
 */
export function resolveRoleMedia(table: TableEntry, root: string, role: RoleId, options: ResolveOptions = {}): ResolvedMedia {
  return resolveMedia(table, root, roleMediaType(role, options.cabinet), options);
}

/** Type de média de l'écran d'un rôle : Playfield, Backglass, Topper, et DMD ou FullDMD selon l'écran du DMD. */
export function roleMediaType(role: RoleId, cabinet?: Cabinet): MediaType {
  return role === 'playfield' ? 'Playfield' : role === 'backglass' ? 'Backglass' : role === 'topper' ? 'Topper' : (cabinet && dmdMediaType(cabinet)) ?? 'DMD';
}

// ---------------------------------------------------------------------------
// DMD ou FullDMD

/** Type d'afficheur pour des proportions (grand côté sur petit côté) : DMD à partir de 8:3. */
export function dmdTypeForRatio(ratio: number): 'DMD' | 'FullDMD' {
  return dmdKindForRatio(ratio) === 'dmd' ? 'DMD' : 'FullDMD';
}

/**
 * DMD ou FullDMD selon l'écran du rôle dmd : le type dit par l'utilisateur (« Écran du DMD »,
 * assistant), sinon les proportions réelles de sa zone (écran entier, bande sous le fronton,
 * incrustation dans le playfield). undefined sans rôle dmd, ou si son écran n'est pas dans le modèle.
 */
export function dmdMediaType(cabinet: Cabinet): 'DMD' | 'FullDMD' | undefined {
  const kind = dmdKindOf(cabinet);
  return kind === undefined ? undefined : kind === 'dmd' ? 'DMD' : 'FullDMD';
}

// ---------------------------------------------------------------------------
// Orientation des médias du playfield

/**
 * Bord des flippers dans le fichier : en bas pour un fichier en portrait, à droite
 * pour un fichier en paysage (standard de Popper et de VPinMediaDB, vérifié sur
 * table.png). Un fichier carré ou non mesuré est pris pour un portrait.
 */
export function mediaFlipperEdge(dimensions: { width: number; height: number } | undefined): FlipperEdge {
  return dimensions && dimensions.width > dimensions.height ? 'right' : 'bottom';
}

/**
 * Rotation horaire qui amène les flippers du fichier sur le bord des flippers de
 * l'écran, plus un demi-tour si l'utilisateur l'a forcé pour ce média.
 */
export function playfieldMediaRotation(
  dimensions: { width: number; height: number } | undefined,
  screenEdge: FlipperEdge,
  halfTurn = false,
): Rotation {
  const turn = edgeRotation(screenEdge) - edgeRotation(mediaFlipperEdge(dimensions)) + (halfTurn ? 180 : 0);
  return (((turn % 360) + 360) % 360) as Rotation;
}

// ---------------------------------------------------------------------------
// Mémoire de Cyber Pinball dans le .info : CyberPinball.medias

export interface MediaMemory {
  /** Demi-tour forcé dans le gestionnaire, par média orientable. */
  halfTurn?: Partial<Record<MediaType, boolean>>;
  /** Volume relatif du jeu, en pour cent (100 : inchangé). */
  volume?: number;
  /** Provenance des fichiers téléchargés, par type (mediadb.ts). */
  sources?: Partial<Record<MediaType, MediaOrigin>>;
  [key: string]: unknown;
}

/** D'où vient un média téléchargé : écrit dans CyberPinball.medias.sources du .info. */
export interface MediaOrigin {
  /** « VPinMediaDB » */
  origin: string;
  /** Adresse du fichier téléchargé. */
  url: string;
  /** Date du téléchargement (ISO). */
  date: string;
  /** Identifiant VPS du jeu dans la source. */
  vpsId?: string;
  /** Clé de l'index : « 1k/table_video », « wheel »… */
  key?: string;
  md5?: string;
  /** Nom du fichier rangé dans medias\ : la source ne vaut que tant qu'il est là. */
  file?: string;
}

export function mediaMemory(info: TableInfoFile): MediaMemory {
  const own = info.CyberPinball as { medias?: MediaMemory } | undefined;
  return own?.medias && typeof own.medias === 'object' ? own.medias : {};
}

/** Le .info avec la mémoire des médias remplacée, les autres champs conservés. */
export function setMediaMemory<T extends TableInfoFile>(info: T, memory: MediaMemory): T {
  const own = { ...(info.CyberPinball as { [key: string]: unknown } | undefined) };
  return { ...info, CyberPinball: { ...own, medias: memory } };
}

/**
 * Force (ou retire) le demi-tour d'un média orientable et l'écrit dans le .info
 * (infoFileFor), en conservant tous ses autres champs. Renvoie le .info écrit.
 */
export function saveHalfTurn(infoFile: string, type: MediaType, halfTurn: boolean): TableInfoFile {
  const info = readInfo(infoFile);
  const memory = mediaMemory(info);
  const turns = { ...memory.halfTurn };
  if (halfTurn) turns[type] = true;
  else delete turns[type];
  const next: MediaMemory = { ...memory, halfTurn: turns };
  if (Object.keys(turns).length === 0) delete next.halfTurn;
  const written = setMediaMemory(info, next);
  const tmp = `${infoFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(written, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, infoFile);
  return written;
}

// ---------------------------------------------------------------------------
// Dimensions lues dans l'en-tête, sans dépendance

export interface MediaDimensions {
  /** Largeur et hauteur affichées (orientation EXIF et matrice de la piste vidéo appliquées). */
  width: number;
  height: number;
  /** Image animée (APNG, GIF ou WebP animés) ; absent quand on ne sait pas. */
  animated?: boolean;
}

/** Octets lus au début d'un fichier image, assez pour trouver la taille. */
const IMAGE_HEAD = 256 * 1024;

/** Dimensions d'une image ou d'une vidéo, lues dans l'en-tête ; undefined si illisible. */
export function readMediaDimensions(file: string): MediaDimensions | undefined {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return undefined;
  }
  try {
    const head = readAt(fd, 0, IMAGE_HEAD);
    return (
      pngDimensions(head) ??
      jpegDimensions(head) ??
      webpDimensions(head) ??
      gifDimensions(head) ??
      (isIsoBmff(head) ? mp4Dimensions(fd) : undefined) ??
      webmDimensions(head)
    );
  } catch {
    return undefined;
  } finally {
    fs.closeSync(fd);
  }
}

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  const n = fs.readSync(fd, buf, 0, length, position);
  return buf.subarray(0, n);
}

function pngDimensions(b: Buffer): MediaDimensions | undefined {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return undefined;
  // APNG : un chunk acTL avant le premier IDAT.
  let animated = false;
  for (let p = 8; p + 8 <= b.length; ) {
    const len = b.readUInt32BE(p);
    const kind = b.toString('latin1', p + 4, p + 8);
    if (kind === 'acTL') animated = true;
    if (kind === 'IDAT' || kind === 'IEND') break;
    p += 12 + len;
  }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), animated };
}

function jpegDimensions(b: Buffer): MediaDimensions | undefined {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let orientation = 1;
  for (let p = 2; p + 4 <= b.length; ) {
    if (b[p] !== 0xff) return undefined;
    const marker = b[p + 1]!;
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    const len = b.readUInt16BE(p + 2);
    if (marker === 0xe1 && b.toString('latin1', p + 4, p + 10) === 'Exif\0\0') {
      orientation = exifOrientation(b.subarray(p + 10, p + 2 + len)) ?? orientation;
    }
    // SOF0 à SOF15, sauf DHT (C4), JPG (C8) et DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (p + 9 > b.length) return undefined;
      const height = b.readUInt16BE(p + 5);
      const width = b.readUInt16BE(p + 7);
      // Orientations 5 à 8 : l'image est affichée couchée (Chromium applique l'EXIF).
      return orientation >= 5 ? { width: height, height: width, animated: false } : { width, height, animated: false };
    }
    p += 2 + len;
  }
  return undefined;
}

function exifOrientation(tiff: Buffer): number | undefined {
  if (tiff.length < 8) return undefined;
  const le = tiff.toString('latin1', 0, 2) === 'II';
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return undefined;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiff.length) return undefined;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return undefined;
}

function webpDimensions(b: Buffer): MediaDimensions | undefined {
  if (b.length < 25 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return undefined;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk !== 'VP8L' && b.length < 30) return undefined;
  if (chunk === 'VP8X') {
    const animated = (b[20]! & 0x02) !== 0;
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), animated };
  }
  if (chunk === 'VP8 ') {
    // Trame clé : signature 9D 01 2A, puis largeur et hauteur sur 14 bits.
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, animated: false };
  }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, animated: false };
  }
  return undefined;
}

function gifDimensions(b: Buffer): MediaDimensions | undefined {
  if (b.length < 10 || !/^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return undefined;
  // Un GIF animé porte l'extension NETSCAPE2.0 (boucle) ; heuristique suffisante pour l'affichage.
  const animated = b.includes('NETSCAPE2.0', 0, 'latin1');
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), animated };
}

// MP4 (ISO BMFF) : boîtes moov > trak > tkhd, lues par positions sans charger le
// fichier ; moov est souvent à la fin quand la vidéo n'est pas « faststart ».

function isIsoBmff(b: Buffer): boolean {
  return b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp';
}

interface Box {
  type: string;
  start: number;
  /** Début du contenu. */
  body: number;
  end: number;
}

function* boxes(fd: number, start: number, end: number): Generator<Box> {
  let p = start;
  while (p + 8 <= end) {
    const h = readAt(fd, p, 16);
    if (h.length < 8) return;
    let size = h.readUInt32BE(0);
    const type = h.toString('latin1', 4, 8);
    let body = p + 8;
    if (size === 1) {
      if (h.length < 16) return;
      size = Number(h.readBigUInt64BE(8));
      body = p + 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < body - p) return;
    yield { type, start: p, body, end: Math.min(p + size, end) };
    p += size;
  }
}

function mp4Dimensions(fd: number): MediaDimensions | undefined {
  const size = fs.fstatSync(fd).size;
  const moov = [...boxes(fd, 0, size)].find((b) => b.type === 'moov');
  if (!moov) return undefined;
  for (const trak of boxes(fd, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue;
    const tkhd = [...boxes(fd, trak.body, trak.end)].find((b) => b.type === 'tkhd');
    if (!tkhd) continue;
    const t = readAt(fd, tkhd.body, Math.min(tkhd.end - tkhd.body, 104));
    // Version 0 : dates sur 32 bits ; version 1 : sur 64 bits.
    const matrix = t[0] === 1 ? 52 : 40;
    if (t.length < matrix + 44) continue;
    // Largeur et hauteur en virgule fixe 16.16 ; nulles pour une piste audio.
    const width = Math.round(t.readUInt32BE(matrix + 36) / 65536);
    const height = Math.round(t.readUInt32BE(matrix + 40) / 65536);
    if (!(width > 0 && height > 0)) continue;
    // Matrice de présentation : a = 0 et b = ±1 pour une vidéo tournée d'un quart de tour (téléphone).
    const a = t.readInt32BE(matrix);
    const bCoef = t.readInt32BE(matrix + 4);
    const quarter = a === 0 && Math.abs(bCoef) === 0x10000;
    return quarter ? { width: height, height: width, animated: true } : { width, height, animated: true };
  }
  return undefined;
}

// WebM (EBML) : Segment > Tracks > TrackEntry > Video > PixelWidth, PixelHeight.

const EBML_SEGMENT = 0x18538067;
const EBML_TRACKS = 0x1654ae6b;
const EBML_TRACK_ENTRY = 0xae;
const EBML_VIDEO = 0xe0;
const EBML_PIXEL_WIDTH = 0xb0;
const EBML_PIXEL_HEIGHT = 0xba;

function ebmlVint(b: Buffer, p: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | undefined {
  const first = b[p];
  if (first === undefined || first === 0) return undefined;
  let length = 1;
  while (!(first & (0x80 >> (length - 1)))) length++;
  if (p + length > b.length) return undefined;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === (0xff >> length);
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[p + i]!;
    if (b[p + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function webmDimensions(b: Buffer): MediaDimensions | undefined {
  if (b.length < 4 || b.readUInt32BE(0) !== 0x1a45dfa3) return undefined;
  let width: number | undefined;
  let height: number | undefined;
  const walk = (start: number, end: number): void => {
    for (let p = start; p < end && p < b.length; ) {
      const id = ebmlVint(b, p, true);
      if (!id) return;
      const size = ebmlVint(b, p + id.length, false);
      if (!size) return;
      const body = p + id.length + size.length;
      const stop = size.unknown ? Math.min(end, b.length) : Math.min(body + size.value, end);
      if ([EBML_SEGMENT, EBML_TRACKS, EBML_TRACK_ENTRY, EBML_VIDEO].includes(id.value)) walk(body, stop);
      else if (id.value === EBML_PIXEL_WIDTH) width ??= b.readUIntBE(body, size.value);
      else if (id.value === EBML_PIXEL_HEIGHT) height ??= b.readUIntBE(body, size.value);
      if (width !== undefined && height !== undefined) return;
      p = stop;
    }
  };
  walk(0, b.length);
  return width && height ? { width, height, animated: true } : undefined;
}

/**
 * Dimensions mesurées, gardées tant que la date et la taille du fichier ne
 * changent pas. Avec un fichier (<racine>\data\cache\medias\dimensions.json),
 * le cache survit au redémarrage : save() l'écrit.
 */
export class MediaDimensionCache {
  private entries = new Map<string, { mtimeMs: number; size: number; dimensions: MediaDimensions | null }>();
  private dirty = false;

  constructor(private readonly file?: string) {
    if (!file) return;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { mtimeMs: number; size: number; dimensions: MediaDimensions | null }>;
      for (const [key, value] of Object.entries(saved)) this.entries.set(key, value);
    } catch {
      // Cache absent ou abîmé : on remesure.
    }
  }

  /** Fichier du cache sous une racine Cyber Pinball. */
  static fileFor(root: string): string {
    return path.join(layoutOf(root).data, 'cache', 'medias', 'dimensions.json');
  }

  get(file: string): MediaDimensions | undefined {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return undefined;
    }
    const key = path.resolve(file).toLowerCase();
    const known = this.entries.get(key);
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known.dimensions ?? undefined;
    const dimensions = readMediaDimensions(file);
    this.entries.set(key, { mtimeMs: stat.mtimeMs, size: stat.size, dimensions: dimensions ?? null });
    this.dirty = true;
    return dimensions;
  }

  save(): void {
    if (!this.file || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries)) + '\n', 'utf8');
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }
}

/** Page d'un nom de média pour un jeu (import des médias, T9). */
export { pageOf as mediaPageOf };
