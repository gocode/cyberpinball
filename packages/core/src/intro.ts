// Ouverture au démarrage : quand Cyber Pinball s'ouvre, chaque écran de la borne (plateau,
// fronton, topper, DMD ou FullDMD) joue son animation d'ouverture, puis garde sa dernière
// image ; le premier bouton (ou un clic) affiche la roue. Pendant la lecture aussi : un bouton
// passe l'ouverture.
//
// Chaque écran a l'animation de Cyber Pinball, dessinée par le rendu (app/renderer/intro.js) :
// elle fait partie de l'application et ne s'efface jamais. L'utilisateur peut la remplacer par
// une image ou une vidéo, et ajouter une musique de fond, indépendante des animations : des
// fichiers rangés comme les défauts de la borne, <racine>\media\(IntroPlayfield).mp4… Revenir à
// l'animation de Cyber Pinball garde son fichier (choix « default »), qu'il peut reprendre.
//
// Tout se décide ici, sans Electron : app/src/frontend.ts pose la phase « intro » au démarrage
// et envoie à chaque fenêtre sa part (introMediaView) ; app/src/intro-menu.ts règle le tout.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import type { FlipperEdge, RoleId, Rotation } from './model';

/** Écrans qui ont une ouverture : le DMD de la borne joue celle de l'afficheur 4:1 ou celle du FullDMD. */
export const INTRO_SCREENS = ['playfield', 'backglass', 'topper', 'dmd', 'fulldmd'] as const;
export type IntroScreen = (typeof INTRO_SCREENS)[number];
/** Ce que l'utilisateur peut remplacer : chaque écran, et la musique de fond. */
export type IntroSlot = IntroScreen | 'music';
export const INTRO_SLOTS: readonly IntroSlot[] = [...INTRO_SCREENS, 'music'];

/** Type de chaque fichier, entre parenthèses dans son nom : <racine>\media\(IntroPlayfield).mp4. */
export const INTRO_FILE_TYPES: Readonly<Record<IntroSlot, string>> = {
  playfield: 'IntroPlayfield',
  backglass: 'IntroBackglass',
  topper: 'IntroTopper',
  dmd: 'IntroDMD',
  fulldmd: 'IntroFullDMD',
  music: 'IntroAudio',
};

const VIDEO_FORMATS = ['mp4', 'webm', 'm4v'] as const;
const IMAGE_FORMATS = ['png', 'apng', 'webp', 'jpg', 'jpeg', 'gif'] as const;
const AUDIO_FORMATS = ['mp3', 'ogg', 'm4a', 'flac', 'wav'] as const;

/** Formats acceptés, par ordre de préférence quand plusieurs fichiers conviennent : la vidéo d'abord. */
export function introFormats(slot: IntroSlot): readonly string[] {
  return slot === 'music' ? AUDIO_FORMATS : [...VIDEO_FORMATS, ...IMAGE_FORMATS];
}

export type IntroFileKind = 'image' | 'video' | 'audio';

export function introFileKind(file: string): IntroFileKind | undefined {
  const ext = path.extname(file).slice(1).toLowerCase();
  if ((VIDEO_FORMATS as readonly string[]).includes(ext)) return 'video';
  if ((IMAGE_FORMATS as readonly string[]).includes(ext)) return 'image';
  if ((AUDIO_FORMATS as readonly string[]).includes(ext)) return 'audio';
  return undefined;
}

export const INTRO_SLOT_LABELS: Readonly<Record<IntroSlot, string>> = {
  get playfield() {
    return t('Plateau');
  },
  get backglass() {
    return t('Fronton');
  },
  get topper() {
    return t('Topper');
  },
  get dmd() {
    return t('Afficheur (DMD)');
  },
  get fulldmd() {
    return t('Afficheur large (FullDMD)');
  },
  get music() {
    return t('Musique de fond');
  },
};

/** Ce que joue l'animation de Cyber Pinball sur chaque écran, en une phrase. */
export const INTRO_DEFAULT_DETAILS: Readonly<Record<IntroScreen, string>> = {
  get playfield() {
    return t('Une étincelle monte, s’embrase au cœur et déploie des fils de lumière, puis la marque se forme ; les fils tournent ensuite lentement');
  },
  get backglass() {
    return t('Le fronton s’allume comme ses lampes à la mise sous tension, puis la marque, lettre par lettre');
  },
  get topper() {
    return t('Un trait de lumière traverse le topper et y laisse le logo et la marque');
  },
  get dmd() {
    return t('Les points s’allument, la bille traverse l’afficheur, puis la marque en points');
  },
  get fulldmd() {
    return t('Le cadre de lampes s’allume, la bille traverse l’afficheur, la marque, puis PRESS START');
  },
};

// ---------------------------------------------------------------------------
// Réglages, dans <données>\medias.json (champ intro)

/**
 * Choix d'un écran : « auto », le fichier de l'utilisateur s'il y en a un, sinon l'animation
 * de Cyber Pinball ; « default », l'animation de Cyber Pinball, le fichier gardé. Pour la
 * musique, « default » veut dire aucune musique.
 */
export type IntroChoice = 'auto' | 'default';

export interface IntroSettings {
  /** Ouverture jouée au démarrage (par défaut). */
  enabled: boolean;
  screens: Record<IntroScreen, IntroChoice>;
  music: IntroChoice;
}

export const DEFAULT_INTRO_SETTINGS: IntroSettings = {
  enabled: true,
  screens: { playfield: 'auto', backglass: 'auto', topper: 'auto', dmd: 'auto', fulldmd: 'auto' },
  music: 'auto',
};

const choiceOf = (value: unknown): IntroChoice => (value === 'default' ? 'default' : 'auto');

/** Réglages lus d'un objet quelconque (fichier écrit à la main, version plus ancienne). */
export function normalizeIntroSettings(raw: unknown): IntroSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const screens = (r.screens && typeof r.screens === 'object' ? r.screens : {}) as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_INTRO_SETTINGS.enabled,
    screens: Object.fromEntries(INTRO_SCREENS.map((s) => [s, choiceOf(screens[s])])) as Record<IntroScreen, IntroChoice>,
    music: choiceOf(r.music),
  };
}

/** Choix d'un emplacement. */
export function introChoice(settings: IntroSettings, slot: IntroSlot): IntroChoice {
  return slot === 'music' ? settings.music : settings.screens[slot];
}

/** Réglages avec un emplacement changé. */
export function withIntroChoice(settings: IntroSettings, slot: IntroSlot, choice: IntroChoice): IntroSettings {
  return slot === 'music' ? { ...settings, music: choice } : { ...settings, screens: { ...settings.screens, [slot]: choice } };
}

/**
 * Tout revient aux animations de Cyber Pinball, sans musique : les fichiers de l'utilisateur
 * restent dans <racine>\media, prêts à être repris. L'ouverture reste jouée ou coupée.
 */
export function introDefaults(settings: IntroSettings): IntroSettings {
  return { ...settings, screens: Object.fromEntries(INTRO_SCREENS.map((s) => [s, 'default'])) as Record<IntroScreen, IntroChoice>, music: 'default' };
}

// ---------------------------------------------------------------------------
// Fichiers de l'utilisateur, dans <racine>\media

/** Fichiers trouvés pour un emplacement, le préféré d'abord (la vidéo avant l'image). */
export type IntroFiles = Partial<Record<IntroSlot, string[]>>;

/**
 * Fichiers d'ouverture de <racine>\media : « (IntroPlayfield).mp4 », « (IntroAudio) ambiance.ogg ».
 * Un format qui ne convient pas à l'emplacement (une image pour la musique) est ignoré.
 */
export function introFiles(mediaDir: string): IntroFiles {
  let names: string[];
  try {
    names = fs.readdirSync(mediaDir);
  } catch {
    return {};
  }
  const found: IntroFiles = {};
  for (const slot of INTRO_SLOTS) {
    const type = INTRO_FILE_TYPES[slot].toLowerCase();
    const formats = introFormats(slot);
    const files = names.filter((name) => {
      const m = /^\(([^()]+)\)[^\\/]*\.([^.]+)$/.exec(name);
      return m && m[1]!.toLowerCase() === type && formats.includes(m[2]!.toLowerCase());
    });
    if (!files.length) continue;
    const rank = (name: string) => formats.indexOf(path.extname(name).slice(1).toLowerCase());
    found[slot] = files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((name) => path.join(mediaDir, name));
  }
  return found;
}

/** Ce que joue un emplacement : l'animation de Cyber Pinball (ou aucune musique), ou un fichier. */
export type IntroSource = { source: 'default'; kept?: string } | { source: 'file'; file: string; kind: IntroFileKind };

/** `kept` : le fichier de l'utilisateur, gardé alors que l'animation de Cyber Pinball est choisie. */
export function introSource(settings: IntroSettings, files: IntroFiles, slot: IntroSlot): IntroSource {
  const file = files[slot]?.[0];
  const kind = file ? introFileKind(file) : undefined;
  if (!file || !kind) return { source: 'default' };
  return introChoice(settings, slot) === 'default' ? { source: 'default', kept: file } : { source: 'file', file, kind };
}

/** Nom du fichier rangé pour un emplacement : « (IntroPlayfield).mp4 ». */
export function introFileName(slot: IntroSlot, from: string): string {
  return `(${INTRO_FILE_TYPES[slot]})${path.extname(from).toLowerCase()}`;
}

/** Le fichier convient-il à l'emplacement ? */
export function introAccepts(slot: IntroSlot, file: string): boolean {
  return introFormats(slot).includes(path.extname(file).slice(1).toLowerCase());
}

/**
 * Fichier choisi pour un emplacement : copié dans <racine>\media sous son nom ; ceux qu'il
 * remplace partent à la corbeille (jamais effacés). Les animations de Cyber Pinball, elles, ne
 * sont pas des fichiers : rien ne peut les retirer.
 */
export function introPlaceOps(mediaDir: string, slot: IntroSlot, from: string, files: IntroFiles): ({ op: 'trash'; path: string } | { op: 'copy'; from: string; to: string })[] {
  const to = path.join(mediaDir, introFileName(slot, from));
  const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  if (same(from, to)) return [];
  return [...(files[slot] ?? []).map((file) => ({ op: 'trash' as const, path: file })), { op: 'copy' as const, from, to }];
}

// ---------------------------------------------------------------------------
// Quand l'ouverture se joue

/**
 * Au démarrage du menu seulement, quand il arrive sur le menu des tables : pas sur un message
 * à traiter (VPX absent, boutons à refaire…), ni au choix d'une configuration, ni après une
 * relance du menu par lui-même (langue, configuration : --sans-ouverture), ni sous
 * l'autopilote des essais, sauf CYBERPINBALL_OUVERTURE=1.
 */
export function introAtStartup(opts: { settings: IntroSettings; landing: string; argv: readonly string[]; env: NodeJS.ProcessEnv }): boolean {
  if (!opts.settings.enabled || opts.landing !== 'menu') return false;
  if (opts.argv.includes(INTRO_SKIP_FLAG)) return false;
  if (opts.env.CYBERPINBALL_OUVERTURE === '1') return true;
  if (opts.env.CYBERPINBALL_OUVERTURE === '0') return false;
  return !opts.env.CYBERPINBALL_AUTOPILOT && !opts.env.CYBERPINBALL_STRESS;
}

/** Relance du menu par lui-même (langue, configuration) : la borne était déjà ouverte. */
export const INTRO_SKIP_FLAG = '--sans-ouverture';

/**
 * Rythme des animations de Cyber Pinball, en millisecondes depuis le départ de l'ouverture
 * (toutes les fenêtres prêtes). Envoyé aux fenêtres avec leur état : app/renderer/intro.js ne
 * garde aucun temps à lui, sauf le plateau, dont le shader (app/renderer/intro-shaders.js) écrit sa
 * propre partition sur ce rythme : une étincelle monte (250–1 250 ms) pendant que la bille traverse
 * le DMD, l'ignition du plateau tombe avec l'allumage du fronton (1 250 ms), sa marque se forme de
 * 1 950 à 2 900 ms, le reflet passe avec celui des autres marques (sheen), tout est figé à `end`.
 */
export const INTRO_TIMELINE = {
  /** DMD et FullDMD : mise sous tension des points (ou du cadre de lampes). */
  dmdPower: 250,
  /** La bille traverse l'afficheur de bas en haut. */
  dmdPass: 950,
  dmdPassLength: 260,
  /** La marque se dessine derrière un trait de balayage. */
  dmdBrand: 1350,
  dmdBrandLength: 900,
  /** FullDMD : PRESS START sous la marque. */
  dmdPress: 2500,
  /** Fronton : ses lampes s'allument en vacillant, puis l'illustration et la marque. */
  backglassPower: 1250,
  backglassBrand: 1950,
  /** Topper : un trait de lumière le traverse. */
  topperSweep: 2300,
  topperSweepLength: 700,
  /** Reflet qui passe sur chaque marque, une fois. */
  sheen: 3400,
  sheenLength: 700,
  /** Tout est posé : chaque écran garde sa dernière image, le plateau continue en boucle (intro.js). */
  end: 4100,
  /** L'invite à appuyer sur un bouton paraît sur le plateau. */
  hint: 4300,
} as const;

export type IntroTimeline = typeof INTRO_TIMELINE;

// ---------------------------------------------------------------------------
// Ce que montre chaque fenêtre

/** Animation de Cyber Pinball d'un écran, nom du composant de app/renderer/intro.js. */
export type IntroFallback = 'intro-playfield' | 'intro-backglass' | 'intro-topper' | 'intro-dmd' | 'intro-fulldmd';

export const INTRO_FALLBACKS: Readonly<Record<IntroScreen, IntroFallback>> = {
  playfield: 'intro-playfield',
  backglass: 'intro-backglass',
  topper: 'intro-topper',
  dmd: 'intro-dmd',
  fulldmd: 'intro-fulldmd',
};

/** Écran d'ouverture d'un rôle de la borne ; le DMD selon l'écran du DMD (roleMediaType : DMD ou FullDMD). */
export function introScreenOf(role: RoleId, dmdType: 'DMD' | 'FullDMD'): IntroScreen {
  return role === 'dmd' ? (dmdType === 'FullDMD' ? 'fulldmd' : 'dmd') : role;
}

/** Type de média du même écran (rotation, remplissage, journal des erreurs de lecture). */
const MEDIA_TYPE_OF: Readonly<Record<IntroScreen, 'Playfield' | 'Backglass' | 'Topper' | 'DMD' | 'FullDMD'>> = {
  playfield: 'Playfield',
  backglass: 'Backglass',
  topper: 'Topper',
  dmd: 'DMD',
  fulldmd: 'FullDMD',
};

/** Part d'une fenêtre dans l'ouverture : de quoi la couche de média (media.js) joue l'écran. */
export interface IntroView {
  role: RoleId;
  screen: IntroScreen;
  type: (typeof MEDIA_TYPE_OF)[IntroScreen];
  source: 'default' | 'fallback';
  url?: string;
  kind?: 'image' | 'video';
  fit: 'cover' | 'contain';
  rotation: Rotation;
  orient?: { edge: FlipperEdge; halfTurn: boolean };
  /** Animation de Cyber Pinball : jouée sans fichier, et à la place d'un fichier illisible. */
  fallback: IntroFallback;
  card: { title: string };
  brand: true;
  intro: { id: number; startedAt?: number; timeline: IntroTimeline; rotation: Rotation };
}

/**
 * Vue d'un écran pour la couche de média de sa fenêtre. Fichier de l'utilisateur : joué une
 * fois, sa dernière image gardée (media.js, option once) ; le plateau en `cover`, tourné
 * d'après le bord des flippers comme son média. Sinon l'animation de Cyber Pinball, tournée
 * pour le joueur par le rendu (rotation de la mise en page du plateau).
 */
export function introMediaView(opts: {
  role: RoleId;
  screen: IntroScreen;
  source: IntroSource;
  run: { id: number; startedAt?: number };
  rotation: Rotation;
  edge: FlipperEdge;
  url: (file: string) => string;
  /** Fenêtre du plateau au bureau (en largeur) : l'ouverture du fronton, dressée pour le joueur. */
  desktop?: boolean;
}): IntroView {
  const { role, screen, source } = opts;
  const playfield = screen === 'playfield';
  const view: IntroView = {
    role,
    screen,
    type: MEDIA_TYPE_OF[screen],
    source: 'fallback',
    fit: playfield ? 'cover' : 'contain',
    rotation: 0,
    fallback: INTRO_FALLBACKS[screen],
    card: { title: '' },
    brand: true,
    intro: { id: opts.run.id, startedAt: opts.run.startedAt, timeline: INTRO_TIMELINE, rotation: role === 'playfield' ? opts.rotation : 0 },
  };
  if (source.source === 'file' && source.kind !== 'audio') {
    view.source = 'default';
    view.url = opts.url(source.file);
    view.kind = source.kind;
    if (playfield) view.orient = { edge: opts.edge, halfTurn: false };
    else if (opts.desktop) view.rotation = opts.rotation;
  }
  return view;
}

/**
 * Déroulé de l'ouverture dans le processus principal : un numéro (un nouveau départ repart de
 * zéro), l'heure du départ une fois toutes les fenêtres prêtes, et où revenir au premier bouton.
 */
export class IntroRun {
  private run?: { id: number; startedAt?: number; returnTo: 'menu' | 'library' };
  private count = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Ouverture posée : au démarrage (retour à la roue), ou « Voir l'ouverture » (retour aux réglages). */
  begin(returnTo: 'menu' | 'library', ready = false): void {
    this.run = { id: ++this.count, returnTo, startedAt: ready ? this.now() : undefined };
  }

  /** Toutes les fenêtres sont prêtes : les animations partent maintenant (une fois). */
  start(): boolean {
    if (!this.run || this.run.startedAt !== undefined) return false;
    this.run.startedAt = this.now();
    return true;
  }

  /** Premier bouton : l'ouverture s'arrête ; où revenir. */
  end(): 'menu' | 'library' | undefined {
    const back = this.run?.returnTo;
    this.run = undefined;
    return back;
  }

  get active(): boolean {
    return Boolean(this.run);
  }

  get started(): boolean {
    return this.run?.startedAt !== undefined;
  }

  get returnTo(): 'menu' | 'library' | undefined {
    return this.run?.returnTo;
  }

  get current(): { id: number; startedAt?: number } | undefined {
    return this.run && { id: this.run.id, startedAt: this.run.startedAt };
  }
}
