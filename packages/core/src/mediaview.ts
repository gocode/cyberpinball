// Médias dans les fenêtres du menu (tâche T2 de docs/recherche/medias.md, § 5.5) :
// ce que chaque rôle affiche pour une table, l'adresse par laquelle le rendu lit
// le fichier, les dossiers que cette adresse peut atteindre, le réglage « médias
// pendant la partie » et les erreurs de lecture remontées par le rendu.
//
// Tout ce qui se décide ici est testable sans Electron ; app/src/media-protocol.ts
// sert les fichiers, app/renderer/media.js les affiche.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { b2sCacheDir, b2sImages } from './b2simage';
import { t } from './i18n';
import { layoutOf } from './locations';
import { MEDIADB_QUALITY_SETTINGS, type MediaDbQualitySetting } from './mediadb';
import {
  MEDIA_TYPES,
  MediaDimensionCache,
  mediaKind,
  mediaMemory,
  resolveMedia,
  resolveRoleMedia,
  roleMediaType,
  tableMediaDir,
  type B2sImageKind,
  type MediaFallback,
  type MediaSource,
  type MediaType,
  type ResolvedMedia,
} from './medias';
import { ROLES, type Cabinet, type FlipperEdge, type RoleId, type Rotation } from './model';
import { companion } from './tablefiles';
import type { TableEntry } from './tables';

// ---------------------------------------------------------------------------
// Adresse des fichiers

/** Protocole par lequel les fenêtres du menu lisent les médias (app/src/media-protocol.ts). */
export const MEDIA_SCHEME = 'cyber-media';

/**
 * Adresse d'un média pour le rendu. Le chemin complet est encodé d'un bloc ;
 * `?v=` change avec la date et la taille du fichier, pour qu'un média remplacé
 * sous le même nom ne soit pas repris du cache de Chromium.
 */
export function mediaUrl(file: string): string {
  const full = path.resolve(file);
  let version = '';
  try {
    const stat = fs.statSync(full);
    version = `?v=${Math.round(stat.mtimeMs).toString(36)}-${stat.size.toString(36)}`;
  } catch {
    // Fichier disparu entre la recherche et l'adresse : le rendu signalera l'erreur de lecture.
  }
  return `${MEDIA_SCHEME}://fichier/${encodeURIComponent(full)}${version}`;
}

/** Chemin désigné par une adresse de mediaUrl, ou undefined si elle n'en est pas une. */
export function mediaPathFromUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.hostname !== 'fichier') return undefined;
  let file: string;
  try {
    file = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return undefined;
  }
  if (!file || file.includes('\0') || !path.isAbsolute(file)) return undefined;
  return path.resolve(file);
}

/** Extensions servies : celles que le catalogue accepte pour un type, et rien d'autre. */
export const SERVED_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set(MEDIA_TYPES.flatMap((t) => t.formats));

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  apng: 'image/apng',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

export function mediaContentType(file: string): string {
  return CONTENT_TYPES[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

function sameDir(a: string, b: string): boolean {
  const norm = (p: string) => {
    const full = path.resolve(p).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? full.toLowerCase() : full;
  };
  return norm(a) === norm(b);
}

/**
 * Le protocole sert-il ce fichier ? Il doit être directement dans un des dossiers
 * autorisés (pas dans un sous-dossier : la recherche des médias n'y descend jamais),
 * avec une extension de média. Le chemin est normalisé avant la comparaison :
 * « medias\..\..\x.png » sort du dossier et est refusé. Un flux de données
 * alternatif (« x.png:flux ») n'a pas d'extension de média et est refusé aussi.
 */
export function isServedMedia(file: string, allowedDirs: readonly string[]): boolean {
  if (!file || file.includes('\0') || !path.isAbsolute(file)) return false;
  const full = path.resolve(file);
  if (!SERVED_MEDIA_EXTENSIONS.has(path.extname(full).slice(1).toLowerCase())) return false;
  const dir = path.dirname(full);
  return allowedDirs.some((allowed) => sameDir(dir, allowed));
}

/**
 * Dossiers que le protocole peut lire : medias\ de chaque table, <racine>\media\
 * (défauts de la borne) et le cache des images du .directb2s. Les replis intégrés sont
 * dessinés par le rendu (fallback.js) : aucun fichier de l'application à servir.
 */
export function allowedMediaDirs(opts: { root?: string; dataDir: string; tables: readonly TableEntry[] }): string[] {
  const dirs = opts.tables.map(tableMediaDir);
  if (opts.root) dirs.push(layoutOf(opts.root).media);
  dirs.push(b2sCacheDir(opts.dataDir));
  return [...new Map(dirs.map((d) => [path.resolve(d).toLowerCase(), d])).values()];
}

// ---------------------------------------------------------------------------
// Ce que montre chaque rôle

/** Textes des replis intégrés (app/renderer/fallback.js, tâche T3). */
export interface MediaCard {
  title: string;
  manufacturer?: string;
  year?: number;
}

export interface MediaView {
  role: RoleId;
  /** Type demandé ; `found` : celui du fichier (FullDMD à la place de DMD…). */
  type: MediaType;
  found?: MediaType;
  source: MediaSource;
  /** Absent : repli intégré. */
  url?: string;
  kind?: 'image' | 'video';
  /** `cover` pour le fond du playfield, `contain` sur fond noir ailleurs. */
  fit: 'cover' | 'contain';
  /** Rotation horaire dans le repère de l'écran (fenêtre non pivotée). */
  rotation: Rotation;
  /**
   * Média orientable dont les dimensions n'ont pas pu être lues : le rendu
   * recalcule la rotation d'après la taille réelle de l'image ou de la vidéo.
   */
  orient?: { edge: FlipperEdge; halfTurn: boolean };
  fallback?: MediaFallback;
  card: MediaCard;
  /** Affichage par défaut de Cyber Pinball (defaultMediaView) : l'écran ne parle d'aucune table. */
  brand?: boolean;
}

/** Bord des flippers dans l'image Windows du playfield, d'après la rotation du menu. */
export function edgeOfRotation(rotation: Rotation): FlipperEdge {
  return ({ 0: 'bottom', 90: 'left', 180: 'top', 270: 'right' } as const)[rotation];
}

export function mediaCard(table: TableEntry): MediaCard {
  return { title: table.title, manufacturer: table.manufacturer, year: table.year };
}

/** Résultat de resolveMedia mis en forme pour le rendu. */
export function toMediaView(table: TableEntry, role: RoleId, resolved: ResolvedMedia, edge: FlipperEdge): MediaView {
  const kind = resolved.kind === 'image' || resolved.kind === 'video' ? resolved.kind : undefined;
  const view: MediaView = {
    role,
    type: resolved.type,
    found: resolved.foundType,
    source: resolved.source,
    fit: resolved.fit ?? (role === 'playfield' ? 'cover' : 'contain'),
    rotation: resolved.rotation,
    card: mediaCard(table),
  };
  // Un son (ou un format inconnu) ne s'affiche pas : repli, comme sans fichier.
  if (resolved.file && kind) {
    view.url = mediaUrl(resolved.file);
    view.kind = kind;
    const orientable = MEDIA_TYPES.find((t) => t.type === resolved.type)?.orientable;
    if (orientable && !resolved.dimensions) {
      view.orient = { edge, halfTurn: mediaMemory(table.info).halfTurn?.[resolved.type] === true };
    }
  } else {
    view.source = 'fallback';
    view.fallback = resolved.fallback ?? MEDIA_TYPES.find((t) => t.type === resolved.type)?.fallback ?? 'none';
    view.rotation = 0;
  }
  return view;
}

/**
 * Affichage par défaut de Cyber Pinball sur l'écran d'un rôle, quand l'écran ouvert ne parle
 * d'aucune table (menu système, réglages, aide, messages : screensTable de menumoments.ts).
 * C'est le repli intégré du rôle sans titre de jeu, qui dessine la marque (app/renderer/fallback.js) :
 * fronton « CYBER PINBALL » sous son verre fumé, afficheur avec le logo et la marque en points
 * (DMD ou FullDMD selon son écran), topper avec le logo et la marque, plateau en verre fumé.
 * Jamais un fichier : ni image, ni vidéo, ni son d'une table ne reste à l'écran.
 */
export function defaultMediaView(role: RoleId, cabinet?: Cabinet): MediaView {
  const type = roleMediaType(role, cabinet);
  return {
    role,
    type,
    source: 'fallback',
    fallback: MEDIA_TYPES.find((t) => t.type === type)?.fallback ?? 'none',
    fit: role === 'playfield' ? 'cover' : 'contain',
    rotation: 0,
    card: { title: '' },
    brand: true,
  };
}

export interface MenuMediaOptions {
  root: string | undefined;
  dataDir: string;
  /** Modèle de la borne : choix DMD ou FullDMD selon les proportions de l'écran. */
  cabinet?: Cabinet;
  /** Rotation de la mise en page du playfield (menuRotation) : donne le bord des flippers. */
  rotation: Rotation;
  /** Extraire l'image du .directb2s en tâche de fond (défaut : oui). */
  b2s?: boolean;
  /** Une image du .directb2s vient d'être extraite : l'état est à renvoyer aux fenêtres. */
  onChange?: () => void;
  /** Durée de vie des résultats : filet quand le guet des dossiers (mediawatch.ts) est impossible (défaut : 10 s). */
  ttlMs?: number;
  now?: () => number;
}

/**
 * Image du .directb2s d'une table. `stale` : médias changés depuis (invalidate), le
 * .directb2s est relu en tâche de fond ; en attendant, l'image d'avant reste montrée
 * (jamais de repli intercalé, qui ferait clignoter le fronton).
 */
type B2sEntry = { state: 'pending' | 'done'; backglass?: string; dmd?: string; stale?: boolean };

function isRole(what: RoleId | MediaType): what is RoleId {
  return ROLES.some((r) => r.id === what);
}

/**
 * Médias du menu : résolution mémorisée par table et par type, image du
 * .directb2s extraite une table à la fois en tâche de fond, dimensions gardées en
 * cache sur disque.
 */
export class MenuMedias {
  private readonly memo = new Map<string, { at: number; value: ResolvedMedia }>();
  private readonly b2s = new Map<string, B2sEntry>();
  private readonly queue: { key: string; file: string }[] = [];
  private extracting = false;
  private readonly dimensions: MediaDimensionCache;
  private readonly edge: FlipperEdge;
  private readonly now: () => number;

  constructor(private readonly opts: MenuMediaOptions) {
    this.dimensions = new MediaDimensionCache(opts.root ? MediaDimensionCache.fileFor(opts.root) : undefined);
    this.edge = edgeOfRotation(opts.rotation);
    this.now = opts.now ?? Date.now;
  }

  /** Média d'un rôle pour une table (dmd : DMD ou FullDMD selon son écran). */
  roleMedia(table: TableEntry, role: RoleId): MediaView {
    return toMediaView(table, role, this.resolve(table, role), this.edge);
  }

  /** Affichage par défaut de Cyber Pinball sur l'écran d'un rôle (defaultMediaView), DMD ou FullDMD selon la borne. */
  defaultMedia(role: RoleId): MediaView {
    return defaultMediaView(role, this.opts.cabinet);
  }

  /** Média d'un type donné sur l'écran d'un rôle : la vidéo de chargement (Loading) du playfield. */
  typeMedia(table: TableEntry, role: RoleId, type: MediaType): MediaView {
    return toMediaView(table, role, this.resolve(table, type), this.edge);
  }

  /** Logo du jeu pour la liste du menu, s'il existe (sinon le titre en texte). */
  wheel(table: TableEntry): string | undefined {
    const resolved = this.resolve(table, 'Wheel');
    return resolved.file && resolved.kind === 'image' ? mediaUrl(resolved.file) : undefined;
  }

  /** Musique du jeu (Audio) ou son de lancement (AudioLaunch) : adresse du fichier, s'il existe. */
  sound(table: TableEntry, type: 'Audio' | 'AudioLaunch'): string | undefined {
    const resolved = this.resolve(table, type);
    return resolved.file && resolved.kind === 'audio' ? mediaUrl(resolved.file) : undefined;
  }

  /** Dossiers servis par le protocole pour ces tables. */
  allowedDirs(tables: readonly TableEntry[]): string[] {
    return allowedMediaDirs({ root: this.opts.root, dataDir: this.opts.dataDir, tables });
  }

  /**
   * Oublie les résultats (tables relues, médias ajoutés, remplacés ou supprimés, guet des
   * dossiers : mediawatch.ts) ; les .directb2s déjà lus seront relus, un ajouté trouvé.
   */
  invalidate(): void {
    this.memo.clear();
    for (const entry of this.b2s.values()) if (entry.state === 'done') entry.stale = true;
  }

  /** Écrit le cache des dimensions. */
  save(): void {
    try {
      this.dimensions.save();
    } catch {
      // Racine en lecture seule : le cache se refera.
    }
  }

  /** `what` : un rôle (playfield, dmd…) ou un type (Wheel, Loading, Audio…) ; les deux ne se confondent pas. */
  private resolve(table: TableEntry, what: RoleId | MediaType): ResolvedMedia {
    const key = `${table.file.toLowerCase()}|${what}`;
    const known = this.memo.get(key);
    const ttl = this.opts.ttlMs ?? 10_000;
    if (known && this.now() - known.at < ttl) return known.value;
    const options = {
      cabinet: this.opts.cabinet,
      flipperEdge: this.edge,
      dimensions: this.dimensions,
      b2sImage: this.opts.b2s === false ? undefined : (t: TableEntry, kind: B2sImageKind) => this.b2sImage(t, kind),
    };
    // Sans racine (bac à sable vide) : pas de défauts de la borne, les médias des tables restent lus.
    const root = this.opts.root ?? path.join(this.opts.dataDir, 'sans-racine');
    const value = isRole(what) ? resolveRoleMedia(table, root, what, options) : resolveMedia(table, root, what, options);
    this.memo.set(key, { at: this.now(), value });
    return value;
  }

  /** Point d'accroche de resolveMedia (étape 4) : synchrone, l'extraction se fait à part. */
  private b2sImage(table: TableEntry, kind: B2sImageKind): string | undefined {
    const key = table.file.toLowerCase();
    const entry = this.b2s.get(key);
    if (entry && !entry.stale) return entry[kind];
    const base = path.basename(table.file).replace(/\.vpx$/i, '');
    const file = companion(table.folder, base, table.id.includes('/'), '.directb2s');
    if (!file) {
      this.b2s.set(key, { state: 'done' });
      return undefined;
    }
    // Relecture : l'image d'avant reste montrée jusqu'à la fin (le cache des images la rend vite).
    this.b2s.set(key, { state: 'pending', backglass: entry?.backglass, dmd: entry?.dmd });
    this.queue.push({ key, file });
    void this.extractNext();
    return entry?.[kind];
  }

  /** Une extraction à la fois : un .directb2s fait souvent des dizaines de Mo. */
  private async extractNext(): Promise<void> {
    if (this.extracting) return;
    const job = this.queue.shift();
    if (!job) return;
    this.extracting = true;
    try {
      const images = await b2sImages(job.file, b2sCacheDir(this.opts.dataDir));
      const before = this.b2s.get(job.key);
      const after = { state: 'done' as const, backglass: images.backglass?.file, dmd: images.dmd?.file };
      this.b2s.set(job.key, after);
      // Rendu redemandé seulement si l'image a changé (relecture après invalidate : souvent la même).
      if (before?.backglass !== after.backglass || before?.dmd !== after.dmd) {
        for (const k of [...this.memo.keys()]) if (k.startsWith(`${job.key}|`)) this.memo.delete(k);
        this.opts.onChange?.();
      }
    } catch {
      // Illisible (copie en cours) : l'image d'avant reste ; le prochain changement relira.
      const before = this.b2s.get(job.key);
      this.b2s.set(job.key, { state: 'done', backglass: before?.backglass, dmd: before?.dmd });
    } finally {
      this.extracting = false;
      void this.extractNext();
    }
  }

  /** Extractions encore à faire (pour les essais). */
  get pendingB2s(): number {
    return this.queue.length + (this.extracting ? 1 : 0);
  }
}

// ---------------------------------------------------------------------------
// Prospectus et règles, sur demande depuis la fiche (§ 5.2, moment « fiche »)

/** Types montrés page par page depuis la fiche d'une table. */
export const SHEET_PAGE_TYPES = ['GameInfo', 'GameHelp'] as const;
export type SheetPageType = (typeof SHEET_PAGE_TYPES)[number];

/** Une page du prospectus ou des règles, telle que le rendu la lit. */
export interface SheetPage {
  url: string;
  kind: 'image' | 'video';
}

/**
 * Pages du prospectus (GameInfo) ou des règles (GameHelp) d'une table, dans l'ordre de
 * resolveMedia (la page sans numéro d'abord). Vide : la fiche dessine le repli du
 * catalogue (fiche générée depuis le .info, commandes de la partie).
 */
export function sheetPages(table: TableEntry, root: string | undefined, dataDir: string, type: SheetPageType): SheetPage[] {
  const resolved = resolveMedia(table, root ?? path.join(dataDir, 'sans-racine'), type);
  return resolved.files.flatMap((file) => {
    const kind = mediaKind(file);
    return kind === 'image' || kind === 'video' ? [{ url: mediaUrl(file), kind }] : [];
  });
}

// ---------------------------------------------------------------------------
// Réglage « médias pendant la partie » (§ 5.4)

/** Écrans libres pendant une partie : média animé, première image figée, ou noir. */
export type GameMediaMode = 'animated' | 'still' | 'off';

export const GAME_MEDIA_MODES: readonly GameMediaMode[] = ['still', 'animated', 'off'];

export const GAME_MEDIA_LABELS: Record<GameMediaMode, string> = {
  get animated() {
    return t('animés');
  },
  get still() {
    return t('figés');
  },
  get off() {
    return t('éteints');
  },
};

/** Son du mode attente : coupé, ou réduit (ATTRACT_SOUND_FACTOR de menumoments.ts). */
export type AttractSound = 'muted' | 'reduced';

/**
 * Présentation des tables dans le menu : une des roues de logos dessinées pour le menu
 * (Médaillons par défaut), ou la liste des titres.
 */
export type MenuLayout = 'medaillons' | 'bandeau' | 'minimal' | 'arche' | 'list';

export const MENU_LAYOUTS: readonly MenuLayout[] = ['medaillons', 'bandeau', 'minimal', 'arche', 'list'];

export const MENU_LAYOUT_LABELS: Record<MenuLayout, string> = {
  get medaillons() {
    return t('roue Médaillons');
  },
  get bandeau() {
    return t('roue Bandeau');
  },
  get minimal() {
    return t('roue Minimaliste');
  },
  get arche() {
    return t('roue Arche');
  },
  get list() {
    return t('liste');
  },
};

/**
 * Valeur lue de medias.json : une roue des versions précédentes (« wheel », Reflet, Ruban de
 * verre, Orbites) devient la roue par défaut.
 */
function menuLayoutOf(value: unknown, fallback: MenuLayout): MenuLayout {
  return MENU_LAYOUTS.includes(value as MenuLayout) ? (value as MenuLayout) : fallback;
}

/**
 * DMD du menu : vivant (Cyber Pinball dessine l'afficheur à points : titre, records, PRESS
 * START, horloge, crédits, média DMD ; livedmd.ts), ou classique (le média DMD de la table,
 * sinon le DMD généré qui fait défiler le titre).
 */
export type MenuDmdMode = 'live' | 'classic';

export const MENU_DMD_MODES: readonly MenuDmdMode[] = ['live', 'classic'];

export const MENU_DMD_LABELS: Record<MenuDmdMode, string> = {
  get live() {
    return t('vivant');
  },
  get classic() {
    return t('classique');
  },
};

/** Réglages globaux des médias et du son du menu (§ 5.4), dans <données>\medias.json. */
export interface MenuMediaSettings {
  /** Figés par défaut : une image fixe ne coûte rien au GPU pendant que VPX joue. */
  game: GameMediaMode;
  /** Musique du jeu (Audio) pendant la navigation : coupée par défaut, pour une borne silencieuse. */
  music: boolean;
  /** Volumes en pour cent, avant le volume relatif du jeu (CyberPinball.medias.volume du .info). */
  musicVolume: number;
  /** Son de la vidéo du plateau dans le menu ; 0 : muette (défaut). */
  videoVolume: number;
  /** Son de lancement (AudioLaunch) et son de la vidéo de chargement (Loading). */
  launchVolume: number;
  /** Sons de l'interface (clic de solénoïde, pièce, knocker : uisounds.ts) ; joués par défaut. */
  uiSounds: boolean;
  /** Leur volume en pour cent, sur la sortie du menu. */
  uiSoundsVolume: number;
  /** Secondes sans bouton avant le mode attente ; 0 : jamais. */
  attractDelay: number;
  /** Secondes entre deux tables tirées au hasard en mode attente. */
  attractInterval: number;
  attractSound: AttractSound;
  /** Roue de logos (une des cinq) ou liste de titres, dans le menu des tables. */
  menuLayout: MenuLayout;
  /** Qualité téléchargée depuis VPinMediaDB : d'après l'écran du plateau (défaut), ou imposée. */
  downloadQuality: MediaDbQualitySetting;
  /** DMD du menu : vivant par défaut, classique pour revenir au média seul. */
  dmd: MenuDmdMode;
}

export const DEFAULT_MENU_MEDIA_SETTINGS: MenuMediaSettings = {
  game: 'still',
  music: false,
  musicVolume: 60,
  videoVolume: 0,
  launchVolume: 80,
  uiSounds: true,
  uiSoundsVolume: 50,
  attractDelay: 300,
  attractInterval: 20,
  attractSound: 'muted',
  menuLayout: 'medaillons',
  downloadQuality: 'auto',
  dmd: 'live',
};

/** <données>\medias.json */
export function menuMediaSettingsFile(dataDir: string): string {
  return path.join(dataDir, 'medias.json');
}

/** Entier dans [min, max], sinon la valeur par défaut (fichier écrit à la main, version plus ancienne). */
function intIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Réglages lus d'un objet quelconque : chaque champ absent ou invalide prend sa valeur par défaut. */
export function normalizeMenuMediaSettings(raw: unknown): MenuMediaSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_MENU_MEDIA_SETTINGS;
  return {
    game: GAME_MEDIA_MODES.includes(r.game as GameMediaMode) ? (r.game as GameMediaMode) : d.game,
    music: typeof r.music === 'boolean' ? r.music : d.music,
    musicVolume: intIn(r.musicVolume, 0, 100, d.musicVolume),
    videoVolume: intIn(r.videoVolume, 0, 100, d.videoVolume),
    launchVolume: intIn(r.launchVolume, 0, 100, d.launchVolume),
    uiSounds: typeof r.uiSounds === 'boolean' ? r.uiSounds : d.uiSounds,
    uiSoundsVolume: intIn(r.uiSoundsVolume, 0, 100, d.uiSoundsVolume),
    attractDelay: intIn(r.attractDelay, 0, 24 * 3600, d.attractDelay),
    attractInterval: intIn(r.attractInterval, 3, 3600, d.attractInterval),
    attractSound: r.attractSound === 'reduced' || r.attractSound === 'muted' ? r.attractSound : d.attractSound,
    menuLayout: menuLayoutOf(r.menuLayout, d.menuLayout),
    downloadQuality: MEDIADB_QUALITY_SETTINGS.includes(r.downloadQuality as MediaDbQualitySetting) ? (r.downloadQuality as MediaDbQualitySetting) : d.downloadQuality,
    dmd: MENU_DMD_MODES.includes(r.dmd as MenuDmdMode) ? (r.dmd as MenuDmdMode) : d.dmd,
  };
}

export function loadMenuMediaSettings(dataDir: string): MenuMediaSettings {
  try {
    return normalizeMenuMediaSettings(JSON.parse(fs.readFileSync(menuMediaSettingsFile(dataDir), 'utf8').replace(/^﻿/, '')));
  } catch {
    return { ...DEFAULT_MENU_MEDIA_SETTINGS };
  }
}

export function saveMenuMediaSettings(dataDir: string, settings: MenuMediaSettings): void {
  const file = menuMediaSettingsFile(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** Mode suivant, dans l'ordre de GAME_MEDIA_MODES (choix au bouton Start dans le menu système). */
export function nextGameMediaMode(mode: GameMediaMode): GameMediaMode {
  return GAME_MEDIA_MODES[(GAME_MEDIA_MODES.indexOf(mode) + 1) % GAME_MEDIA_MODES.length]!;
}

// Erreurs de lecture : journal unique dans mediaerrors.ts (recordMediaError), lu par le médecin.
