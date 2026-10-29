// Gestion des tables dans l'interface : fiche, modification des informations,
// médecin, suppression et ajout. Aucune manipulation de fichier pour l'utilisateur :
// chaque action montre d'abord ce qu'elle va faire, et ce qui est retiré ou
// remplacé part dans la corbeille de la racine.
// Pilotage aux boutons de la borne (flippers : choisir, Start : valider, Exit :
// revenir), au clavier ou à la souris (clics envoyés par le rendu).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, type BrowserWindow, type Input, type Rectangle } from 'electron';
import {
  CONFIG_KEY,
  isSystemGroup,
  SYSTEM_GROUP_IDS,
  SYSTEM_GROUPS,
  SYSTEM_ITEM_IDS,
  SYSTEM_ITEMS,
  SYSTEM_ROOT,
  systemEntry,
  systemPathOf,
  type SystemEntryId,
  type SystemGroupId,
  type SystemItemId,
  variantTraitsLabel,
  tablePupPacks,
  pupOptionOps,
  checkAppliedOption,
  missingSources,
  type TableContents,
  type TablePupPack,
  findTableIni,
  readTextIfExists,
  applyImport,
  applyOps,
  applyRomImport,
  readInfo,
  setTableSource,
  type WaitItem,
  classifyFile,
  describePupCabinet,
  diagnose,
  expectedPackNames,
  formatSize,
  gameKeys,
  infoFileFor,
  inventory,
  KIND_LABELS,
  layoutOf,
  MANAGED_MEDIA_TYPES,
  ownMediaPages,
  loadCabinet,
  loadVpsDb,
  mediaTypeInfo,
  missingRoms,
  moveToTrash,
  planImport,
  planRomMigration,
  pruneEmptyDirs,
  pupCabinet,
  repairPupForPlay,
  nameKey,
  pageKey,
  pupMemory,
  refreshVpsDb,
  removalTargets,
  romSpace,
  romsToTidy,
  sameFile,
  sheetPages,
  SHEET_PAGE_TYPES,
  samePath,
  tableGame,
  partWebQuery,
  tableSourceOf,
  scanRomLibrary,
  sizeOf,
  trashDirFor,
  unusedRoms,
  updateInfo,
  vpsLabel,
  NEED_LABELS,
  mediaDbNotice,
  ARCHIVE_EXT,
  downloadInventory,
  createDownloadManager,
  downloadsPill,
  downloadsSummary,
  emptiableDownloads,
  resolveReturn,
  returnLabel,
  summarize,
  summaryText,
  SYSTEM_ROOT_ENTRIES,
  type DownloadJob,
  type DownloadJobKind,
  type DownloadReturn,
  type DownloadScreen,
  type DownloadSourceKind,
  type DownloadTransport,
  type ReturnWorld,
  loadMediaDb,
  MEDIADB_INDEX_FILE,
  tableFilter,
  type MediaDb,
  formatDate,
  formatDateTime,
  formatList,
  formatNumber,
  language,
  playBlockers,
  romBlockers,
  messagesOf,
  t,
  tn,
  type Finding,
  type AddScreenId,
  type IconName,
  type ImportPlan,
  type KnownTable,
  type NavigationKeys,
  type ObservedDisplay,
  type PackPlan,
  type PlayfieldOrientation,
  type PupCabinet,
  type PupVariant,
  type RoleId,
  type RomEntry,
  type RomImport,
  type RomLibraryScan,
  type RomMigration,
  type RomState,
  type RomTable,
  type ScriptFacts,
  type SheetPageType,
  type TableEntry,
  type TablePlan,
  type VpsDb,
  type VpsRefresh,
  type VpsTableFile,
  type GuestDoor,
  type GuestMode,
  actionIds,
  anchorOf,
  followCursor,
  resolveActivation,
  enterList,
  holdMove,
  leaveList,
  rememberZones,
  screenZones,
  switchZone,
  zoneOf,
  zoneStep,
  type ZoneMemory,
  type Zones,
  type FocusAnchor,
  knownVpsId,
  type RecordedRole,
  type RecordingSettings,
} from '@cyberpinball/core';
import { prepareImport, type PreparedImport } from './archives';
import { cachedScript, readScript, rememberScript, type ScriptResult } from './vbs';
import { LayoutReport } from './layout-check';
import { createCatalog } from './catalog';
import { createGameParts } from './game-parts';
import type { RecordingOutcome } from './game-recording';
import { createRecordingMenu } from './recording-menu';
import { createJourney } from './journey';
import { createMediaDownload, mediaOffersLabel, type MediaDbGameOffer } from './media-download';
import { createMediaSearch } from './media-search';
import { createConverter } from './media-convert';
import { analyseDressing } from './fulldmd';
import { createMediaSites } from './media-sites';
import { createMediaImport } from './media-import';
import { createMedias, playsSoundPreview, type MediaView } from './library-medias';
import { createTableFiles } from './table-files';
import { createFilePicker, type PickRequest } from './file-picker';
import { createDownloadsScreen } from './downloads-screen';
import { createDownloadCenter } from './download-center';
import { httpTransport } from './download-sources';
import { createHealth, type HealthView } from './health';
import { isShown, refuseOffscreen } from './offscreen';

const MANUFACTURERS = [
  'Williams', 'Bally', 'Gottlieb', 'Stern', 'Data East', 'Sega', 'Midway', 'Capcom', 'Atari', 'Zaccaria',
  'Premier', 'Alvin G.', 'Spooky', 'Jersey Jack', 'Chicago Gaming', 'American Pinball', 'Original',
];
const otherManufacturer = () => t('Autre (saisir le nom)…');

// Touches du clavier à l'écran : celles de commande sont des identifiants, keyLabel les affiche.
const KEYBOARD = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  'É', 'È', 'À', 'Ç', '-', "'", '&', '.', ':', '!', '?', // i18n-ignore : lettres du clavier
  'Espace', 'Effacer', 'Maj', 'OK', 'Annuler', // i18n-ignore : identifiants des touches
];
const NUMPAD = [...'0123456789', 'Effacer', '−', '+', 'OK', 'Annuler']; // i18n-ignore : identifiants des touches

/** Libellé affiché d'une touche du clavier à l'écran. */
function keyLabel(key: string): string {
  switch (key) {
    case 'Espace':
      return t('Espace');
    case 'Effacer':
      return t('Effacer');
    case 'Maj':
      return t('Maj');
    case 'Annuler': // i18n-ignore : identifiant de touche
      return t('Annuler');
    default:
      return key;
  }
}

export interface LibraryHost {
  root: string | undefined;
  dataDir: string;
  vpxExe(): string | undefined;
  tables(): TableEntry[];
  /** Relit les tables et sélectionne celle-ci dans le menu. */
  reload(selectFile?: string): void;
  /** La gestion des tables prend la main sur le menu (phase « library »). */
  enter(): void;
  /** Retour au menu. */
  leave(): void;
  play(table: TableEntry): void;
  /** Réglages de VPX propres à cette table (écran des réglages, settings.ts). */
  tableSettings?(table: TableEntry): void;
  /**
   * « Jouer avec un ami » (live-game-menu.ts) : l'entrée de la fiche, active quand un ami est en
   * ligne, grisée avec sa raison sinon ; `back` rouvre la fiche.
   */
  playWithFriend?(table: TableEntry, back: () => void): Action;
  /**
   * Partie de réglage de l'affichage (« Régler l'affichage en partie ») : VPX démarre la table
   * menu ouvert sur le cadrage, sans statistiques ; undefined si elle n'a pas démarré pour une
   * raison que le menu affiche (écrans à revoir).
   */
  adjustDisplay?(table: TableEntry): Promise<{ ok: boolean; message?: string } | undefined>;
  /**
   * « Jouer et enregistrer » : la partie, l'enregistrement armé (game-recording.ts). Au retour,
   * le menu ouvre l'écran de l'enregistrement (recording.result).
   */
  playAndRecord?(table: TableEntry, settings: RecordingSettings): void;
  /** Écrans que la borne peut filmer en plus du plateau : fronton, DMD (ceux qu'elle a). */
  recordableRoles?(): RecordedRole[];
  /** Journal de VPX (vpinball.log), lu par le médecin pour les PuP-Packs. */
  vpxLogFile?(): string | undefined;
  /** Playfield de la borne et VPinballX.ini actif : le médecin y juge le sens d'une table. */
  playfieldOrientation?(): PlayfieldOrientation | undefined;
  quit(): void;
  /** Touches des boutons de la borne (flippers, Start, Exit), avec celles d'un clavier. */
  keys(): NavigationKeys;
  /** Touches qui basculent entre la liste de contenu d'un écran et ses actions : les MagnaSave, F6 (zoneSwitchKeys). */
  zoneKeys?(): string[];
  windows(): Map<RoleId, BrowserWindow>;
  /**
   * Écran du navigateur intégré (fenêtre « Récupérer »), en coordonnées Electron, et ce que
   * son bandeau en dit (écran choisi pas branché, playfield tourné).
   */
  browserScreen?(): { bounds: Rectangle; notice?: string } | undefined;
  /** Nom Windows de la sortie audio du menu (menuAudioOutput), pour le son des pages de « Récupérer ». */
  audioOutput?(): string | undefined;
  /** Choix de l'écran du navigateur intégré pour la configuration active ; Retour mène à `back`. */
  openBrowserScreen?(back: () => void): void;
  broadcast(): void;
  /** Dossier Téléchargements surveillé pour la liste d'attente (essais : un dossier du bac à sable). */
  downloadsDir?(): string;
  /** Bureau, raccourci du sélecteur de fichiers (essais : un dossier du bac à sable). */
  desktopDir?(): string;
  /** Télécharge et installe VPX, progression à l'écran (parcours « Ce qu'il manque pour jouer »). */
  installVpx?(): void;
  /** Assistant de la borne : écrans, boutons, son. */
  setup?(): void;
  /** Écrans branchés (displays.ts) : la santé de la borne les compare à la configuration retenue. */
  displays?(): ObservedDisplay[];
  /** Version de VPX installée et active ; undefined : pas installé. */
  vpxVersion?(): string | undefined;
  /** Espace d'un lecteur (essais : lecteurs simulés) ; sans lui, celui du vrai lecteur. */
  diskSpace?(dir: string): { free: number; total: number } | undefined;
  /** Mode invité : seules la fiche, ses pages et les actions à porte ouverte passent (guestmode.ts). */
  guest: Pick<GuestMode, 'active' | 'allows' | 'knock'>;
  /**
   * Un téléchargement fini que son écran n'a pas repris : au menu des tables, la notification du
   * menu le dit (menu-notices.ts) ; sur un écran plein, un bandeau bref (`text`).
   */
  notify?(text: string, job?: DownloadJob): void;
  /** La file des téléchargements a changé (progression, état) : la pastille ou l'écran se redessinent. */
  downloadsChanged?(): void;
}

/** Entrée du menu système (Exit dans le menu). La session des réglages peut y ajouter la sienne. */
export interface SystemItem {
  label: string;
  detail?: string;
  /** Icône de l'entrée (registre app/renderer/icons.js) : chaque entrée du menu système a la sienne. */
  icon: IconName;
  /** Quelque chose attend l'utilisateur ici (une mise à jour disponible…) : pastille rouge, jusque sur la roue dentée. */
  attention?: boolean;
  /** Raccourci clavier qui fait la même chose sans passer par le menu (ActionShortcut). */
  shortcut?: ActionShortcut;
  run: () => void;
}

/**
 * Entrée du menu système fournie par l'application : son nom et son icône viennent de l'arbre
 * des rubriques (SYSTEM_ITEMS, core) ; `label` seulement pour un nom qui change (la langue).
 */
export type ProvidedSystemItem = Omit<SystemItem, 'label' | 'icon'> & { readonly label?: string };

/**
 * Raccourci clavier d'une entrée de menu : les touches à montrer, une touche cerclée chacune
 * (« Ctrl », « Maj », « D »), et ce qui le reconnaît. Les deux viennent de la définition du
 * raccourci (SHORTCUTS, touches de l'interface) : ce qui est affiché est ce qui marche.
 */
export interface ActionShortcut {
  keys: string[];
  matches(input: Input): boolean;
}

export type UiAction =
  /** `id` : identité de l'action cliquée (focus.ts), pour valider cet élément même si la liste a bougé. */
  | { type: 'activate'; index: number; id?: string }
  | { type: 'editor'; index: number }
  | { type: 'drop'; paths: string[] }
  | { type: 'key'; code: string }
  /** Bouton « ‹ Retour » de l'en-tête : comme Exit, sans redescendre au bas de la liste. */
  | { type: 'back' }
  /** Roue dentée du menu : menu et configuration, quels que soient les boutons. */
  | { type: 'config' }
  /** Pastille des téléchargements du menu des tables : le gestionnaire de téléchargements. */
  | { type: 'downloads' }
  /** Pastille des amis en ligne, notification d'un ami (Mes amis) ou d'une demande (Demandes d'amis). */
  | { type: 'friends' }
  | { type: 'friend-requests' }
  /** Repère de la liste de contenu (« Sortir de la liste », « Revenir à la liste ») : comme MagnaSave. */
  | { type: 'zone' }
  | { type: 'wheel'; offset: number };

export type Tone = 'error' | 'warning' | 'info' | 'ok' | 'quiet';
export interface Row {
  text: string;
  detail?: string;
  tone?: Tone;
  badges?: string[];
  /** Ligne rattachée à une action : surlignée quand l'action est choisie. */
  action?: number;
  /** Ligne à choisir (un fichier, un élément de la liste d'attente) : son action n'est pas répétée dans la liste des actions. */
  pick?: boolean;
  /** Icône devant le texte (registre app/renderer/icons.js). */
  icon?: IconName;
  /** Repère neutre (filet clair) : l'emplacement ouvert, un fichier coché ; jamais en vert, réservé au choix courant. */
  current?: boolean;
  /** Seconde ligne, mot et signe : à quoi sert un fichier (« ✓ Installé avec… », « ! À installer… »). */
  note?: { text: string; sign: string; tone: Tone };
  /** Barre d'un téléchargement sous la ligne (Téléchargements) : `value` de 0 à 1, absente si la taille est inconnue. */
  progress?: { value?: number; tone?: Tone };
  /** Schéma de l'écran du DMD à droite de la ligne (« Écran du DMD ») : FullDMD ou DMD seul en bande. */
  figure?: 'fulldmd' | 'dmd';
}
export interface Section {
  title?: string;
  /**
   * Liste d'options (deux ou trois réglages au choix, « Ce que montre cet écran ») : ses lignes à
   * choisir ne forment pas une liste de contenu (listzones.ts), Exit y revient en arrière.
   */
  options?: boolean;
  /** Rôle de la section, pour la mise en page d'un écran (classe kind-<kind>) : « places », « entries »… */
  kind?: string;
  rows: Row[];
  more?: number;
}
export interface Action {
  label: string;
  detail?: string;
  tone?: Tone;
  /** Icône devant le libellé (registre app/renderer/icons.js) ; dans un même écran, deux actions n'ont jamais la même. */
  icon?: IconName;
  /** Pastille rouge à côté du libellé : cette action attend l'utilisateur. */
  attention?: boolean;
  /** Raccourci clavier de l'action, montré à droite du libellé ; il la déclenche aussi depuis son menu. */
  shortcut?: ActionShortcut;
  /** Porte de l'action en mode invité (GUEST_DOORS) : sans porte, ou porte fermée, l'invité ne la voit pas. */
  door?: GuestDoor;
  /**
   * Identité stable de l'élément (une proposition, un fichier) : le curseur le suit quand
   * la liste change, et un clic le valide où qu'il soit (focus.ts). Sans clé, le libellé
   * sert d'identité s'il est unique dans l'écran.
   */
  key?: string;
  /** Issue vers le web de cet écran d'ajout ou de choix (« Chercher sur le web… », ADD_SCREENS). */
  web?: AddScreenId;
  run: () => void | Promise<void>;
}

/** Action de la fiche : chacune déclare sa porte, ouverte ou fermée à l'invité (le compilateur l'exige). */
type SheetAction = Action & { door: GuestDoor };
/** Écran décrit : titre, sections, actions (flippers pour choisir, Start pour valider) et retour (Exit). */
export interface Built {
  heading: string;
  /** Icône du titre : celle de l'entrée qui a ouvert l'écran, pour s'y retrouver. */
  icon?: IconName;
  subheading?: string;
  lead?: string;
  sections: Section[];
  actions: Action[];
  back: () => void;
  /** Cartes des médias d'un jeu, chacune rattachée à une action (library-medias.ts). */
  media?: MediaView;
  /** Fichiers glissés sur la fenêtre quand cet écran est affiché ; sans lui, c'est un ajout de table. */
  drop?: (paths: string[]) => void;
  /** Mise en page propre à l'écran (classe lib-<variant>) : « files » (fichiers d'une table), « facts » (libellé et valeur). */
  variant?: string;
  /** Parcours « Ce qu'il manque pour jouer » (journey.ts) : progression et étapes numérotées, à la place des sections. */
  journey?: JourneyView;
  /** Santé de la borne (health.ts) : bilan et lignes, chacune rattachée à son action, à la place des sections. */
  health?: HealthView;
  /** Bandeau d'aide propre à l'écran (sélecteur de fichiers : Exit remonte d'un dossier). */
  hint?: string;
}

/** Ce que le rendu montre du parcours d'une table (app/renderer/library.js, renderJourney). */
export interface JourneyView {
  /** « Étape 3 sur 4 » et « 2 étapes réglées · 1 indispensable à faire · 1 amélioration proposée ». */
  position: string;
  summary: string;
  /** Ce qui vient de se passer : fichier reçu, réparé, installé. */
  notice?: { text: string; tone: Tone };
  /** Le chemin jusqu'à « Jouer », numéroté ; puis « Pour aller plus loin », sans numéro. */
  steps: JourneyStepView[];
  extrasTitle: string;
  extras: JourneyStepView[];
}

export interface JourneyStepView {
  /** Rang dans le chemin ; absent pour une amélioration. */
  n?: number;
  title: string;
  detail: string;
  /** À savoir avant de choisir (étape courante seulement). */
  note?: string;
  state: string;
  /** Mot et signe de l'état : jamais la couleur seule. */
  word: string;
  sign: string;
  tone: Tone;
  current: boolean;
  /** Première action de l'étape : un clic sur l'étape la déclenche. */
  action?: number;
}

type Field = 'Title' | 'Manufacturer' | 'Year';
type Editor =
  /** Sans `field` : saisie libre d'un écran « prompt ». */
  | { kind: 'text'; field?: Field; label: string; value: string; cursor: number; shift: boolean; typed: boolean }
  | { kind: 'choice'; field: Field; label: string; choices: string[]; cursor: number }
  | { kind: 'number'; field: Field; label: string; value: number; typed: string; cursor: number };

type Screen =
  /** Menu système : une rubrique, ou ses rubriques (racine). */
  | { kind: 'system'; group?: SystemGroupId }
  | { kind: 'sheet'; file: string; flash?: string; pup?: TablePupPack[]; contents?: TableContents }
  /** Options des PuP-Packs de la table (fiche > « PuP-Pack »). */
  | { kind: 'pupOptions'; file: string; flash?: string; pup?: TablePupPack[] }
  /** Prospectus ou règles de la table, page par page (flippers : page précédente ou suivante). */
  | { kind: 'pages'; file: string; type: SheetPageType; index: number }
  | { kind: 'edit'; file: string; fields: { Title: string; Manufacturer: string; Year?: number }; editor?: Editor }
  /** `added` : ce que l'ajout a fait en plus de ranger les fichiers (médias de VPinMediaDB), montré à la vérification. */
  /** `back` : l'écran qui l'a ouvert (Santé de la borne), à la place de la fiche. */
  | { kind: 'doctor'; file: string; findings?: Finding[]; script?: ScriptResult; log: string[]; queue: string[]; afterImport: boolean; added?: Row[]; back?: () => void }
  | { kind: 'remove'; file: string }
  | { kind: 'addSource' }
  | {
      kind: 'addPlan';
      prepared?: PreparedImport;
      plan?: ImportPlan;
      mode: 'move' | 'copy';
      scripts: Map<string, ScriptFacts>;
      existing: KnownTable[];
      /** Base VPS utilisée pour ce plan (absente : jamais téléchargée et pas de réseau). */
      vps?: VpsDb;
      /** Jeu choisi par table (TableVps.key) : identifiant VPS, ou null pour le nom des fichiers. */
      vpsChoices: Map<string, string | null>;
      /** Option choisie par PuP-Pack (PackPlan.key). */
      pupChoices: Map<string, string>;
      /** Écrans de la borne, pour l'option des PuP-Packs. */
      cabinet?: PupCabinet;
      /** Version gardée par ROM (RomImport.key) : empreinte du contenu choisi. */
      romChoices: Map<string, string>;
      /** Fichiers récupérés depuis le catalogue : le jeu VPS est déjà choisi, la provenance notée après l'installation ; `quick` : installation rapide. */
      acquisition?: { gameId: string; items: WaitItem[]; quick?: boolean };
      /** Ajout fait depuis le parcours de cette table (« Ce qu'il manque pour jouer ») : on y revient ensuite. */
      journey?: string;
      /** Ouvert depuis l'entonnoir (fichiers choisis sur ce PC) : « Annuler » y revient. */
      fromHub?: boolean;
      /** Dossier de la table installée à qui tout revient (parties du jeu, Téléchargements : « Ajouter à »). */
      target?: string;
      /** « Annuler » revient là (l'écran des parties du jeu, le fichier de Téléchargements). */
      back?: () => void;
      /**
       * Médias de VPinMediaDB pour les nouvelles tables du plan, téléchargés juste après
       * l'installation (seulement ceux qui manquent). `games` : par identifiant VPS ;
       * `wanted` : le choix de l'utilisateur (oui d'office) ; `problem` : index indisponible.
       */
      medias?: { wanted: boolean; games: Map<string, MediaDbGameOffer>; problem?: string };
    }
  | { kind: 'addChoice'; plan: AddPlan; key: string }
  | { kind: 'addPupChoice'; plan: AddPlan; key: string }
  /** Bibliothèque de ROM : vue globale. */
  | { kind: 'roms'; scan?: RomLibraryScan }
  /** Rangement des ROM existantes dans la bibliothèque : plan à valider. */
  | { kind: 'romMigrate'; scan?: RomLibraryScan; choices: Map<string, string> }
  /** `table` : la table dont parle l'écran (tableOf), pour les écrans de la borne. */
  | { kind: 'notice'; heading: string; lines: string[]; then: () => void; table?: string }
  /** Écran décrit hors de la gestion des tables (configurations de la borne), recalculé à chaque affichage. */
  | { kind: 'custom'; build: () => Built; table?: string }
  /** Saisie d'un texte au clavier à l'écran ; `done` reçoit undefined à l'annulation. */
  | { kind: 'prompt'; heading: string; lead?: string; editor: Editor; done: (value: string | undefined) => void; table?: string };

type EditorScreen = Extract<Screen, { kind: 'edit' | 'prompt' }>;

/** Écrans d'une table : son titre est le nom du jeu, sans l'icône de la partie du menu d'où l'on vient. */
const TABLE_SCREENS: readonly Screen['kind'][] = ['sheet', 'pupOptions', 'pages', 'edit', 'doctor', 'remove'];

/**
 * Table dont parle un écran : les écrans de la borne gardent ses médias (screensTable de
 * packages/core). Les écrans d'une table la portent ; un écran décrit (médias du jeu, fichiers,
 * parcours…) la déclare à son ouverture (openCustom) ; une saisie ou un message garde celle de
 * l'écran d'où il s'ouvre. Tout autre écran n'en a pas : l'affichage par défaut de Cyber Pinball.
 */
function tableOf(s: Screen | undefined): string | undefined {
  if (!s) return undefined;
  if (TABLE_SCREENS.includes(s.kind)) return (s as Extract<Screen, { file: string }>).file;
  if (s.kind === 'custom' || s.kind === 'notice' || s.kind === 'prompt') return s.table;
  return undefined;
}

/** Écrans ouverts à l'invité, par leur porte : la fiche, le prospectus et les règles. Tout autre écran est fermé. */
const GUEST_SCREENS: Partial<Record<Screen['kind'], GuestDoor>> = { sheet: 'menu.sheet', pages: 'sheet.read' };

type AddPlan = Extract<Screen, { kind: 'addPlan' }>;
type PagesScreen = Extract<Screen, { kind: 'pages' }>;

export function createLibrary(host: LibraryHost) {
  let screen: Screen | undefined;
  let cursor = 0;
  /** Ce que la dernière vue montrait sous le curseur : il le suit si la liste change (focus.ts). */
  let anchor: FocusAnchor | undefined;
  /**
   * Zones de l'écran (listzones.ts) : d'où l'on est entré dans la liste de contenu, où on l'a
   * quittée ; oublié à l'ouverture d'un autre écran. `letter` : initiale du dernier saut par lettre
   * (flipper tenu), montrée tant que le flipper reste tenu.
   */
  let zoneMemory: { screen: unknown; memory: ZoneMemory; letter?: string } = { screen: undefined, memory: {} };
  /** Flipper tenu : depuis quand, et le dernier saut par lettre. */
  let hold: { code: string; since: number; jumped: number } | undefined;
  /** MagnaSave (ou F6) appuyé seul : la bascule se fait au relâchement, jamais sur le Ctrl d'un raccourci (Ctrl+Maj+D). */
  let zonePress: string | undefined;
  /** L'écran affiché fait écouter des sons (propositions, sons de la table) : relevé à chaque vue. */
  let soundPreview = false;
  // Opérations longues en cours (l'installation enchaîne sur l'analyse) et leur message.
  let busyCount = 0;
  let busy: string | undefined;
  /**
   * Icône de l'entrée du menu système d'où l'on vient : les écrans qui suivent (catalogue,
   * ajout, ROM, médias…) la portent en titre quand ils n'en déclarent pas, pour qu'on sache
   * dans quelle partie du menu on est. Oubliée au retour au menu système ou aux tables.
   */
  let section: IconName | undefined;
  /**
   * Entrées du menu système, par identifiant : l'arbre des rubriques (systemmenu.ts, core) les
   * range ; frontend.ts et les autres écrans y ajoutent les leurs (provideSystemItem).
   */
  const systemItems = new Map<SystemItemId, ProvidedSystemItem>([
    [
      // Une seule entrée pour toutes les façons d'ajouter une table : l'entonnoir (openAdd).
      'add-table',
      {
        get detail() {
          const ready = catalogUi.ready().length;
          return ready
            ? tn(ready, 'Fichier, dossier, catalogue en ligne… · {n} jeu prêt à installer', 'Fichier, dossier, catalogue en ligne… · {n} jeux prêts à installer')
            : t('Fichier, dossier, clé USB, catalogue en ligne, récupérés, mises à jour');
        },
        // Des fichiers reçus attendent leur installation : pastille rouge.
        get attention() {
          return catalogUi.ready().length > 0;
        },
        run: () => openAdd(),
      },
    ],
    [
      'downloads',
      {
        // Ce qui arrive, et le premier téléchargement prêt avec l'écran où il ramène.
        get detail() {
          const jobs = downloads.jobs();
          const s = summarize(jobs);
          const ready = jobs.find((j) => j.state === 'done' && !j.delivered);
          if (ready) return t('{summary} · prêt : {screen}', { summary: summaryText(s), screen: returnLabel(resolveReturn(ready, downloadWorld).to, downloadWorld) });
          return jobs.length ? summaryText(s) : t('Ce qui arrive des sites et des amis, et ce qui est gardé');
        },
        // Un téléchargement fini attend qu'on y revienne, ou un bloqué qu'on s'en occupe : pastille rouge.
        get attention() {
          const s = summarize(downloads.jobs());
          return s.ready > 0 || s.failed > 0;
        },
        run: () => openDownloads(),
      },
    ],
    ['roms', { get detail() { return t('Chaque ROM, ses tables, sa taille ; inutilisées et absentes'); }, run: () => openRoms() }],
    ['rom-migration', { get detail() { return t('Réunir les ROM dans la bibliothèque : une copie partagée par les tables'); }, run: () => openRomMigration() }],
    ['media-import', { get detail() { return t('Copier les logos, vidéos et frontons de PinUP Popper ou PinballX dans les dossiers des tables'); }, run: () => mediaImport.open() }],
    ['missing-media', { get detail() { return t('Chercher sur VPinMediaDB les logos, plateaux et frontons qui manquent aux tables'); }, run: () => mediaDownload.openMissing() }],
    ['quit', { run: () => host.quit() }],
  ]);
  /**
   * Rubrique du menu système où l'on est (undefined : la racine), et la dernière entrée choisie :
   * « Retour » des écrans qui s'en ouvrent y ramène, la sélection sur cette entrée.
   */
  let systemGroup: SystemGroupId | undefined;
  let systemChosen: SystemEntryId | undefined;
  /**
   * Écran qui a ouvert une entrée du menu système hors du menu (la santé de la borne ouvre
   * « Médias manquants », la configuration de la borne…) : le « Retour » de cette entrée, qui
   * appelle openSystem, y ramène. Oublié au retour aux tables et à la roue dentée.
   */
  let systemReturn: (() => void) | undefined;

  /** Ajoute une entrée du menu système ; l'arbre des rubriques (systemmenu.ts, core) dit où elle va. */
  function provideSystemItem(id: SystemItemId, item: ProvidedSystemItem): void {
    systemItems.set(id, item);
  }

  const layout = () => (host.root ? layoutOf(host.root) : undefined);
  const tablesDir = () => layout()?.tables ?? '';
  const find = (file: string) => host.tables().find((t) => samePath(t.file, file));
  const mediaImport = createMediaImport({
    tablesDir: () => layout()?.tables,
    trashRoot: () => layout()?.trash,
    tables: () => host.tables(),
    romsOf: (t) => cachedScript(t.file, host.dataDir)?.roms ?? [],
    vps: () => vpsForImport(),
    pickDirectory: async () => (await pickPaths({ title: t('Dossier de PinUP Popper ou de PinballX'), icon: 'import', purpose: t('Reprise des médias d’un autre frontend'), mode: 'folder', start: 'desktop' }))?.[0],
    openCustom: (build, at) => openCustom(build, at),
    openSystem: () => openSystem(),
    openNotice: (heading, lines) => openNotice(heading, lines),
    task: (message, work) => task(message, work),
    progress: (message) => {
      busy = message;
      host.broadcast();
    },
    reload: () => host.reload(),
  });

  // Base VPS : lue dans downloads au premier ajout, mise à jour en arrière-plan.
  let vpsDb: VpsDb | undefined;
  let vpsLoaded = false;
  let vpsRefresh: Promise<VpsRefresh> | undefined;
  /** Raison du dernier échec de mise à jour (sans réseau…). */
  let vpsProblem: string | undefined;

  function refreshVps(): Promise<VpsRefresh> {
    const dir = layout()?.downloads;
    if (!dir) return Promise.resolve({ status: 'offline' });
    vpsRefresh ??= refreshVpsDb(dir)
      .then((result) => {
        if (result.status === 'updated') vpsLoaded = false;
        vpsProblem = result.status === 'offline' ? result.message : undefined;
        return result;
      })
      .finally(() => (vpsRefresh = undefined));
    return vpsRefresh;
  }

  /** Base pour un ajout : le cache tout de suite (mis à jour pour la fois suivante), sinon le premier téléchargement. */
  async function vpsForImport(): Promise<VpsDb | undefined> {
    const dir = layout()!.downloads;
    const load = () => {
      if (!vpsLoaded) {
        vpsDb = loadVpsDb(dir);
        vpsLoaded = true;
      }
      return vpsDb;
    };
    if (load()) {
      void refreshVps();
      return vpsDb;
    }
    busy = t('Téléchargement de la base VPS (environ 8 Mo, une seule fois)…');
    host.broadcast();
    await refreshVps();
    return load();
  }

  function go(next: Screen, at = 0): void {
    // Mode invité : un écran fermé ne s'ouvre pas, le cadenas le dit.
    if (!host.guest.knock(GUEST_SCREENS[next.kind])) return;
    screen = next;
    cursor = at;
    host.enter();
    host.broadcast();
  }

  function leave(): void {
    screen = undefined;
    section = undefined;
    systemGroup = undefined;
    systemChosen = undefined;
    systemReturn = undefined;
    host.leave();
    host.broadcast();
  }

  /** Opération longue : l'écran affiche le message et ignore les touches. */
  async function task(message: string, work: () => Promise<void> | void): Promise<void> {
    busyCount++;
    busy = message;
    host.broadcast();
    await new Promise((resolve) => setTimeout(resolve, 60));
    try {
      await work();
    } catch (error) {
      const err = error as Error;
      screen = { kind: 'notice', heading: t('Opération interrompue'), lines: [err.message], then: leave };
      cursor = 0;
    } finally {
      if (--busyCount === 0) busy = undefined;
      host.broadcast();
    }
  }

  // ---------- Ouvertures ----------

  /**
   * Menu système. Depuis les tables (Exit, roue dentée) : ses rubriques. Depuis un écran qui
   * s'en est ouvert (son « Retour ») : la rubrique d'où l'on venait, sur l'entrée choisie.
   */
  function openSystem(): void {
    if (!screen) systemGroup = systemChosen = systemReturn = undefined;
    const back = systemReturn;
    systemReturn = undefined;
    if (back) return back();
    openSystemGroup(systemGroup, systemChosen);
  }

  /** Les rubriques du menu système, quel que soit l'écran ouvert (roue dentée). */
  function openSystemRoot(): void {
    systemReturn = undefined;
    openSystemGroup(undefined);
  }

  /** Une entrée du menu système ouverte depuis un autre écran : son « Retour » ramène à `back`. */
  function runSystemItem(id: SystemItemId, back: () => void): void {
    const item = systemItems.get(id);
    if (!item) return back();
    section = SYSTEM_ITEMS[id].icon;
    systemReturn = back;
    item.run();
  }

  /** Entrées d'une rubrique (de la racine : ses raccourcis, Téléchargements, puis les rubriques) que l'application fournit. */
  function systemEntries(group: SystemGroupId | undefined): SystemEntryId[] {
    return (group ? SYSTEM_GROUPS[group].entries : SYSTEM_ROOT_ENTRIES).filter((id) => isSystemGroup(id) || systemItems.has(id));
  }

  /** Une entrée attend l'utilisateur (pastille rouge) ; une rubrique, dès que l'une des siennes. */
  function systemAttention(id: SystemEntryId): boolean {
    return isSystemGroup(id) ? systemEntries(id).some(systemAttention) : Boolean(systemItems.get(id)?.attention);
  }

  /** Ouvre une rubrique, la sélection sur `at`, sinon sur la première entrée à pastille. */
  function openSystemGroup(group: SystemGroupId | undefined, at?: SystemEntryId): void {
    section = undefined;
    systemGroup = group;
    const entries = systemEntries(group);
    const chosen = at ? entries.indexOf(at) : -1;
    go({ kind: 'system', group }, chosen >= 0 ? chosen : Math.max(0, entries.findIndex(systemAttention)));
  }

  /** Entrée du menu système : une rubrique s'ouvre ; une entrée fournie fait ce qu'elle fait. */
  function runSystemEntry(id: SystemEntryId): void {
    // Mode invité : aucune entrée du menu système, par quelque chemin qu'on y arrive (clic, autopilote).
    if (!host.guest.knock('menu.system')) return;
    systemChosen = id;
    if (isSystemGroup(id)) return openSystemGroup(id);
    section = SYSTEM_ITEMS[id].icon;
    systemItems.get(id)!.run();
  }

  /** Remonte d'un cran : la rubrique parente (ou la racine), la sélection sur celle qu'on quitte. */
  function systemUp(group: SystemGroupId): void {
    const path = systemPathOf(group) ?? [];
    systemChosen = group;
    openSystemGroup(path.at(-1), group);
  }

  /**
   * Écran fourni par l'appelant (configurations de la borne) ; ses actions ouvrent les écrans
   * suivants. `table` : la table dont il parle (ses médias, ses fichiers…), sinon aucune.
   */
  function openCustom(build: () => Built, at = 0, table?: string): void {
    go({ kind: 'custom', build, table }, at);
  }

  /** Saisie d'un nom avec le clavier à l'écran (ou un vrai clavier). */
  function openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void {
    go({ kind: 'prompt', heading, lead, editor: { kind: 'text', label, value, cursor: 0, shift: false, typed: false }, done, table: tableOf(screen) });
  }

  function openNotice(heading: string, lines: string[], then: () => void = leave): void {
    go({ kind: 'notice', heading, lines, then, table: tableOf(screen) });
  }

  function openSheet(table: TableEntry, flash?: string): void {
    go({ kind: 'sheet', file: table.file, flash });
  }

  const progress = (message: string) => {
    busy = message;
    host.broadcast();
  };

  // Index de VPinMediaDB, recherche approfondie du jeu et aperçus, partagés par le plan
  // automatique et les propositions de chaque média.
  const mediaSearch = createMediaSearch({ host, layout, tablesDir, progress, vps: () => vpsForImport(), downloads: () => downloads });

  // ---------- Gestionnaire de téléchargements ----------
  // Tout ce qui arrive, d'un site ou d'un ami (packages/core/src/downloadmanager.ts) : la file
  // survit au redémarrage, chaque téléchargement repart seul quand sa source revient, et ramène à
  // l'écran d'où il a été demandé. Les fonctions des amis (finisseurs, retour à leur bibliothèque)
  // et leur transport sont posés par friends-menu.ts et frontend.ts.
  /** Ce qu'on fait d'un téléchargement fini, par sorte : vrai s'il a été rendu à son écran (ouvert). */
  const downloadFinishers = new Map<DownloadJobKind, (job: DownloadJob) => boolean>();
  /** « Revenir à… » d'un téléchargement fini, par sorte : vrai s'il l'a rendu (sinon l'écran d'origine s'ouvre). */
  const downloadDeliverers = new Map<DownloadJobKind, (job: DownloadJob) => boolean>();
  const returnOpeners = new Map<DownloadScreen, (back: DownloadReturn) => void>();
  let downloadFriends: { has(key: string): boolean; name(key: string): string | undefined } | undefined;
  const downloadWorld: ReturnWorld = {
    hasTable: (file) => Boolean(find(file)),
    hasFriend: (key) => downloadFriends?.has(key) ?? false,
    tableTitle: (file) => find(file)?.title,
    friendName: (key) => downloadFriends?.name(key),
  };
  const downloads = createDownloadManager({
    dataDir: host.dataDir,
    transports: { http: httpTransport() },
    finished: (job) => {
      // Rendu de lui-même (son écran est ouvert) ; sinon une notification ou un bandeau le dit, la pastille le garde « prêt ».
      if (downloadFinishers.get(job.kind)?.(job)) return;
      host.notify?.(t('Téléchargement terminé : {title}. Téléchargements, dans le menu système, pour y revenir.', { title: job.title }), job);
    },
    onChange: () => host.downloadsChanged?.(),
    log: (line) => console.log(line),
  });

  /** L'écran où ramène un téléchargement, rouvert ; un écran qui n'existe plus mène au gestionnaire. */
  function openReturn(back: DownloadReturn): void {
    const table = 'table' in back && back.screen !== 'friend-library' ? find(back.table) : undefined;
    switch (back.screen) {
      case 'table-medias':
        return table ? medias.open(table) : downloadCenter.open();
      case 'game-parts':
        return table ? gameParts.open(table) : downloadCenter.open();
      case 'table-sheet':
        return table ? openSheet(table) : downloadCenter.open();
      case 'wait-list':
        return catalogUi.openWaitList(() => downloadCenter.open());
      case 'updates':
        return systemItems.has('updates') ? runSystemItem('updates', () => downloadCenter.open()) : downloadCenter.open();
      case 'friend-library': {
        const opener = returnOpeners.get('friend-library');
        return opener ? opener(back) : downloadCenter.open();
      }
      case 'downloads':
        return downloadCenter.open();
    }
  }

  /**
   * « Revenir à… » : l'écran d'origine, avec ce qui a été reçu (médias dans le brouillon, table
   * au plan d'ajout) ; s'il n'existe plus, un message le dit, puis son repli.
   */
  function deliverDownload(job: DownloadJob): void {
    const r = resolveReturn(job, downloadWorld);
    if (job.state === 'done') downloads.delivered(job.id);
    if (r.lost) return openNotice(t('Écran d’origine introuvable'), [r.lost, t('Retour vers : {screen}', { screen: returnLabel(r.to, downloadWorld) })], () => openReturn(r.to));
    if (job.state === 'done' && downloadDeliverers.get(job.kind)?.(job)) return;
    openReturn(r.to);
  }

  /** « 23 fichiers, 4,1 Go conservés » : relu au plus toutes les cinq secondes (l'inventaire parcourt le disque). */
  let filesDetail: { at: number; text: string } | undefined;
  const downloadCenter = createDownloadCenter({
    manager: downloads,
    show: (build, at) => openCustom(build, at),
    world: downloadWorld,
    deliver: (job) => deliverDownload(job),
    files: {
      detail: () => {
        if (!filesDetail || Date.now() - filesDetail.at > 5000) filesDetail = { at: Date.now(), text: t('{summary} conservés', { summary: downloadsSummary(emptiableDownloads(inventoryOf(false))) }) };
        return filesDetail.text;
      },
      open: (back) => downloadsUi.open(back),
    },
    back: () => openSystem(),
  });

  // Trouver une table : catalogue VPS, fenêtre « Récupérer », liste d'attente, mises à jour.
  const catalogUi = createCatalog({
    host,
    layout,
    tablesDir,
    show: (build, at) => openCustom(build, at),
    cursor: () => cursor,
    task: (message, work) => task(message, work),
    progress,
    prompt: (heading, label, value, done, lead) => openPrompt(heading, label, value, done, lead),
    home: () => openAdd(),
    openNotice: (heading, lines, then) => openNotice(heading, lines, then),
    vps: () => vpsForImport(),
    search: mediaSearch,
    // Récupérés pour une table installée : tout lui revient (un PuP-Pack, un fronton…).
    install: (paths, acquisition, journey) => startImport(paths, 'copy', acquisition, journey, false, journey && find(journey) ? path.dirname(journey) : undefined),
    downloadsDir: host.downloadsDir,
    addFiles: (paths) => startImport(paths, 'copy', undefined, undefined, true),
    openJourney: (file) => journeyUi.open(file),
    pick: (request) => pickPaths(request),
    downloads,
  });
  if (layout()) catalogUi.start();
  // Les pages des sites reprennent par le navigateur intégré, dans la même session de cookies.
  downloads.setTransport('site', catalogUi.acquirer.siteTransport);

  /**
   * « Chercher sur le web… » des écrans de médias d'une table : ce qui est téléchargé revient
   * à ce jeu, dans la partie que dit son contenu (médias du menu, PuP-Pack, fronton…).
   */
  const webForTable = (screen: AddScreenId) => (table: TableEntry, back: () => void) =>
    catalogUi.webAction(screen, { query: partWebQuery(table.title, 'media'), target: { gameId: knownVpsId(table.info), gameLabel: table.title, kind: 'media', table: table.file } }, back);

  // Ce qu'il manque pour jouer : parcours guidé d'une table jusqu'à « Jouer ».
  const journeyUi = createJourney({
    host,
    find,
    show: (build, at, table) => openCustom(build, at, table),
    cursor: () => cursor,
    task: (message, work) => task(message, work),
    vps: () => vpsForImport(),
    analyse: (table) => analyseTable(table),
    repair: (table, findings) => applyFixes(table, findings),
    catalog: catalogUi,
    sheet: (table, flash) => openSheet(table, flash),
    doctor: (table) => openDoctor(table.file),
    pickFiles: (journey) => void pick('files', journey),
    install: (paths, acquisition, journey) => startImport(paths, 'copy', acquisition, journey, false, journey && find(journey) ? path.dirname(journey) : undefined),
    drop: (paths, journey) => startImport(paths, 'copy', undefined, journey),
  });

  // Médias des sites communautaires (VPForums, VPUniverse), dans la session de « Récupérer ».
  const mediaSites = createMediaSites({
    acquirer: catalogUi.acquirer,
    downloadsDir: () => layout()?.downloads,
    changed: () => host.broadcast(),
    // Recherche libre : ce qui arrive dans Téléchargements de Windows pendant ce temps (navigateur de l'utilisateur).
    windowsDownloads: () => host.downloadsDir?.() ?? app.getPath('downloads'),
  });

  // Téléchargement depuis VPinMediaDB, depuis l'écran « Médias » ou le menu système.
  const mediaDownload = createMediaDownload({
    host,
    layout,
    tablesDir,
    find,
    openCustom: (build, at, table) => openCustom(build, at, table),
    openSystem: () => openSystem(),
    openNotice: (heading, lines, then) => openNotice(heading, lines, then),
    task: (message, work) => task(message, work),
    progress,
    cursor: () => cursor,
    search: mediaSearch,
    prompt: (heading, label, value, done, lead) => openPrompt(heading, label, value, done, lead),
    webGame: webForTable('mediadb'),
    downloads,
  });

  // Santé de la borne (Menu système > Borne) : relevé en tâche de fond, gardé ; une page de bilan.
  const health = createHealth({
    host,
    layout,
    doctor: () => quickDoctor(),
    media: (pause) => mediaDownload.offlineSurvey(pause),
    openCustom: (build, at) => openCustom(build, at),
    openSystem: () => openSystem(),
    runSystemItem: (id, back) => runSystemItem(id, back),
    openDoctor: (file, back) => openDoctor(file, [], false, undefined, back),
    showing: (build) => screen?.kind === 'custom' && screen.build === build,
  });
  provideSystemItem('health', {
    get detail() {
      return health.summary();
    },
    // Un point bloquant au dernier relevé : pastille rouge, jusqu'à la roue dentée.
    get attention() {
      return health.attention();
    },
    run: () => health.open(),
  });

  // Écran « Médias » de la fiche : logo, fronton, vidéos, règles…
  const medias = createMedias({
    host,
    layout,
    tablesDir,
    find,
    show: (build, at, table) => openCustom(build, at, table),
    cursor: () => cursor,
    sheet: (table, flash) => openSheet(table, flash),
    leave: () => leave(),
    pick: (request) => pickPaths(request),
    download: (table, back) => mediaDownload.openTable(table, back),
    webGame: webForTable('medias'),
    proposals: {
      search: mediaSearch,
      task: (message, work) => task(message, work),
      progress,
      prompt: (heading, label, value, done, lead) => openPrompt(heading, label, value, done, lead),
      withNotice: (then, back) => mediaDownload.withNotice(then, back),
      sites: mediaSites,
      convert: createConverter(),
    },

  });

  // Section « Fichiers » de la fiche : tout le dossier de la table, fichier par fichier.
  const tableFiles = createTableFiles({
    layout,
    tablesDir,
    find,
    script: (table) => cachedScript(table.file, host.dataDir),
    show: (build, at, table) => openCustom(build, at, table),
    sheet: (table) => openSheet(table),
    doctor: (table) => openDoctor(table.file),
    roms: () => openRoms(),
    leave: () => leave(),
  });

  // « Jouer et enregistrer » de la fiche, et l'écran du retour de la partie enregistrée.
  const recording = createRecordingMenu({
    dataDir: host.dataDir,
    root: host.root,
    layout,
    tablesDir,
    find,
    cabinet: () => loadCabinet(host.dataDir),
    roles: () => host.recordableRoles?.() ?? [],
    show: (build, at, table) => openCustom(build, at, table),
    cursor: () => cursor,
    sheet: (table, flash) => openSheet(table, flash),
    leave: () => leave(),
    play: (table, settings) => {
      screen = undefined;
      host.playAndRecord?.(table, settings);
    },
    reload: (file) => host.reload(file),
  });

  // « Parties du jeu » de la fiche : chaque partie ajoutée, remplacée, réaffectée ou retirée.
  const gameParts = createGameParts({
    layout,
    tablesDir,
    find,
    tables: () => host.tables(),
    script: (table) => cachedScript(table.file, host.dataDir),
    show: (build, at, table) => openCustom(build, at, table),
    isShowing: (build) => screen?.kind === 'custom' && screen.build === build,
    cursor: () => cursor,
    sheet: (table) => openSheet(table),
    leave: () => leave(),
    task: (message, work) => task(message, work),
    vps: () => vpsForImport(),
    // Le jeu que la table désigne, même sans identifiant dans son .info (script non relu ici).
    identify: async (table) => {
      const vps = await vpsForImport();
      return vps ? tableGame(vps, table, await mediaSearch.evidence(table, false)) : { leads: [] };
    },
    setGame: (table, gameId) => {
      const infoFile = infoFileFor(table, tablesDir());
      const info = readInfo(infoFile);
      applyOps([{ op: 'write', path: infoFile, content: JSON.stringify({ ...info, Info: { ...info.Info, VPSId: gameId } }, null, 2) + '\n' }], { trashDir: trashDirFor(layout()!.trash, 'Remplacé à l’import') }); // i18n-ignore : nom de dossier
      host.reload(table.file);
    },
    prompt: (heading, label, value, done, lead) => openPrompt(heading, label, value, done, lead),
    catalog: catalogUi,
    sites: mediaSites,
    install: (paths, table, back) => installTo(paths, table, back),
    pick: (request) => pickPaths(request),
    pupOptions: (table) => go({ kind: 'pupOptions', file: table.file }),
    medias: (table) => medias.open(table),
    reload: (file) => host.reload(file),
  });

  // ---------- Téléchargements et sélecteur de fichiers ----------

  /** Index de VPinMediaDB pour nommer les fichiers de downloads\vpinmediadb, relu quand il change. */
  let mediaDbCache: { mtimeMs: number; db?: MediaDb } | undefined;
  function mediaDbForNames(dir: string): MediaDb | undefined {
    try {
      if (!fs.readdirSync(path.join(dir, 'vpinmediadb')).length) return undefined;
      const mtimeMs = fs.statSync(path.join(dir, MEDIADB_INDEX_FILE)).mtimeMs;
      if (mediaDbCache?.mtimeMs !== mtimeMs) {
        mediaDbCache = { mtimeMs, db: loadMediaDb(dir) };
        // Les noms des jeux viennent de la base VPS : lue une fois, si elle est là.
        if (!vpsLoaded) {
          vpsDb = loadVpsDb(dir);
          vpsLoaded = true;
        }
      }
      return mediaDbCache.db;
    } catch {
      return undefined;
    }
  }

  /** Inventaire des téléchargements ; `windows` : avec les fichiers du dernier mois de Téléchargements de Windows. */
  function inventoryOf(windows = false) {
    const l = layout();
    if (!l) return [];
    const winDir = host.downloadsDir?.() ?? app.getPath('downloads');
    return downloadInventory({
      downloadsDir: l.downloads,
      waitList: catalogUi.waitList(),
      mediaDb: mediaDbForNames(l.downloads),
      gameName: (id) => vpsDb?.games.find((g) => g.id === id)?.name,
      tableName: (file) => find(file)?.title,
      windows: windows && winDir ? { dir: winDir, since: new Date(Date.now() - 30 * 24 * 3600_000) } : undefined,
    });
  }

  /** Table de l'écran d'où s'ouvre le sélecteur de fichiers (un média de cette table à choisir) : il la garde. */
  let pickerTable: string | undefined;
  const picker = createFilePicker({
    layout,
    show: (build, at) => openCustom(build, at, pickerTable),
    cursor: () => cursor,
    inventory: () => inventoryOf(false),
    windowsDownloads: host.downloadsDir,
    desktop: host.desktopDir,
    broadcast: () => host.broadcast(),
  });

  /**
   * Choisir des fichiers ou un dossier dans le sélecteur de Cyber Pinball ; undefined à
   * l'abandon, et l'écran d'où l'on vient revient tel quel (curseur compris).
   */
  function pickPaths(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined> {
    const from = screen;
    const at = cursor;
    pickerTable = tableOf(from);
    const restore = () => {
      pickerTable = undefined;
      if (from) {
        screen = from;
        cursor = at;
        host.broadcast();
      } else leave();
    };
    return new Promise((resolve) =>
      picker.open({
        ...request,
        done: (paths) => {
          restore();
          resolve(paths);
        },
        cancel: () => {
          restore();
          resolve(undefined);
        },
      }),
    );
  }

  const downloadsUi = createDownloadsScreen({
    layout,
    show: (build, at) => openCustom(build, at),
    inventory: (windows) => inventoryOf(windows),
    forget: (files) => {
      mediaSites.forget();
      return catalogUi.forgetFiles(files);
    },
    install: (paths) => startImport(paths, 'copy'),
    inspect: (file) => catalogUi.inspect(file),
    suggest: (file) => suggestGame(file),
    tables: () => ownTables(),
    games: () => catalogUi.games(),
    addToTable: (paths, table) => installTo(paths, table, () => downloadsUi.open()),
    attachToGame: (file, gameId, kind, back) => catalogUi.attachToGame(file, gameId, kind, back),
    web: (screen, back) => catalogUi.webAction(screen, { query: partWebQuery('table'), received: (file) => startImport([file], 'copy') }, back),
    task: (message, work) => task(message, work),
    back: () => downloadCenter.open('files'),
  });

  /**
   * Plan d'ajout de ces fichiers à une table installée choisie (parties du jeu, Téléchargements).
   * Un fichier reçu dans la liste d'attente y est marqué installé ensuite, comme par « Installer ».
   */
  function installTo(paths: string[], table: TableEntry, back?: () => void): void {
    const got = catalogUi.waitList().items.filter((i) => i.state === 'received' && i.received && paths.some((p) => samePath(p, i.received!.file)));
    const gameId = got[0]?.gameId;
    const acquisition = gameId ? { gameId, items: got.filter((i) => i.gameId === gameId) } : undefined;
    startImport(paths, 'copy', acquisition, undefined, false, table.folder, back);
  }

  /** Tables installées dans leur propre dossier, une par dossier (celles qui peuvent recevoir une partie). */
  function ownTables(): TableEntry[] {
    const own = host.tables().filter((x) => !samePath(x.folder, tablesDir()));
    return own.filter((x, i) => own.findIndex((o) => samePath(o.folder, x.folder)) === i);
  }

  /**
   * Jeu auquel revient sans doute un fichier téléchargé : celui de la liste d'attente qui l'a
   * reçu, ou dont un élément vient de la même page ; sinon la table installée dont le titre est
   * dans son nom (« TheMatrixPupPack.zip »). Sa table installée, s'il en a une.
   */
  function suggestGame(file: string): { table?: TableEntry; game?: { gameId: string; label: string } } {
    const l = catalogUi.waitList();
    const stray = l.strays?.find((s) => samePath(s.file, file));
    const key = stray?.url ? pageKey(stray.url) : undefined;
    const item = l.items.find((i) => i.received && samePath(i.received.file, file)) ?? (key ? l.items.find((i) => i.pageKey === key) : undefined) ?? l.items.find((i) => i.id === stray?.expected || i.id === stray?.suggested);
    const tables = ownTables();
    if (item) {
      const table = (item.table ? tables.find((x) => samePath(x.file, item.table!)) : undefined) ?? tables.find((x) => knownVpsId(x.info) === item.gameId);
      return table ? { table } : { game: { gameId: item.gameId, label: item.gameLabel } };
    }
    const name = nameKey(path.basename(file).replace(/\.[^.]+$/, ''));
    const named = tables.filter((x) => nameKey(x.title).length >= 4 && name.includes(nameKey(x.title))).sort((a, b) => nameKey(b.title).length - nameKey(a.title).length);
    return named[0] ? { table: named[0] } : {};
  }

  /** Le gestionnaire de téléchargements (Menu système > Téléchargements, et sa première entrée). */
  function openDownloads(focus?: string): void {
    section = 'download';
    downloadCenter.open(focus);
  }

  function openAdd(): void {
    if (!layout()) {
      go({ kind: 'notice', heading: t('Cyber Pinball n’est pas installé'), lines: [t('Lancez « Installer » depuis le lanceur : il crée le dossier des tables et le dossier d’import.')], then: leave });
      return;
    }
    fs.mkdirSync(layout()!.import, { recursive: true });
    // La base VPS se met à jour pendant qu'on choisit les fichiers.
    void refreshVps();
    go({ kind: 'addSource' });
  }

  function openDoctor(file: string, queue: string[] = [], afterImport = false, added?: Row[], back?: () => void): void {
    go({ kind: 'doctor', file, log: [], queue, afterImport, added, back });
    void analyse();
  }

  async function analyse(): Promise<void> {
    if (screen?.kind !== 'doctor') return;
    const current = screen;
    await task(t('Analyse de la table…'), async () => {
      const table = find(current.file);
      if (!table) throw new Error(t('Cette table n’existe plus.'));
      const { script, findings } = await analyseTable(table);
      current.script = script;
      current.findings = findings;
      cursor = 0;
    });
  }

  /** Convertisseur hors écran du diagnostic : images des vidéos FullDMD (habillage). */
  let dressConverter: ReturnType<typeof createConverter> | undefined;

  /**
   * Script de la table (lu par VPX, sinon la dernière lecture gardée) et constats du médecin.
   * Sert au diagnostic et au parcours « Ce qu'il manque pour jouer ».
   */
  async function analyseTable(table: TableEntry): Promise<{ script?: ScriptResult; findings: Finding[] }> {
    const exe = host.vpxExe();
    const script = exe ? await readScript(exe, table.file, host.dataDir) : cachedScript(table.file, host.dataDir);
    // Lire le script a pu faire passer une fenêtre de VPX devant le menu.
    if (exe) host.windows().get('playfield')?.focus();
    const cabinet = loadCabinet(host.dataDir);
    // Habillage FullDMD : cadre du média FullDMD (cherché une fois), place du DMD dans le .ini de la table.
    const dressing = host.root
      ? await analyseDressing(table, { root: host.root, dataDir: host.dataDir, cabinet, facts: script && !('error' in script) ? script : undefined, converter: (dressConverter ??= createConverter()) })
      : undefined;
    const findings = diagnose(table, {
      tablesDir: tablesDir(),
      script,
      logsDir: path.join(host.dataDir, 'logs'),
      cabinet: pupCabinet(cabinet),
      dressing,
      vpxLog: readLog(host.vpxLogFile?.()),
      otherPackNames: otherPackNames(table),
      romLibrary: layout()?.roms,
      orientation: host.playfieldOrientation?.(),
    });
    return { script, findings };
  }

  /**
   * Médecin sans lancer VPX ni convertir de vidéo, pour la santé de la borne : le script déjà
   * lu (undefined s'il ne l'a jamais été), sans l'habillage FullDMD. Modèle de borne, journal
   * de VPX et sens du playfield sont lus une fois pour tout le relevé.
   */
  function quickDoctor(): (table: TableEntry) => Finding[] | undefined {
    const cabinet = pupCabinet(loadCabinet(host.dataDir));
    const vpxLog = readLog(host.vpxLogFile?.());
    const orientation = host.playfieldOrientation?.();
    return (table) => {
      const script = cachedScript(table.file, host.dataDir);
      if (!script) return undefined;
      return diagnose(table, {
        tablesDir: tablesDir(),
        script,
        logsDir: path.join(host.dataDir, 'logs'),
        cabinet,
        vpxLog,
        otherPackNames: otherPackNames(table),
        romLibrary: layout()?.roms,
        orientation,
      });
    };
  }

  /** Applique les corrections du médecin ; renvoie le fichier de la table, qui a pu changer de place. */
  function applyFixes(table: TableEntry, findings: Finding[]): string {
    let file = table.file;
    const trashDir = trashDirFor(layout()!.trash, `Médecin ${path.basename(table.folder)}`); // i18n-ignore : nom de dossier
    for (const f of findings) {
      applyOps(f.fix!.ops, { trashDir });
      for (const op of f.fix!.ops) {
        if (op.op !== 'move') continue;
        // Dossier vidé par le déplacement (« roms » mal placé…), et table qui a changé de place.
        if (!samePath(path.dirname(op.from), table.folder)) pruneEmptyDirs(path.dirname(op.from), table.folder);
        if (samePath(op.from, file)) file = op.to;
      }
    }
    host.reload(file);
    return file;
  }

  // ---------- Bibliothèque de ROM ----------

  /** Tables installées dans leur dossier, avec les ROM que demandent leurs scripts (déjà lus). */
  function romTables(): RomTable[] {
    const own = host.tables().filter((t) => !samePath(t.folder, tablesDir()));
    const out: RomTable[] = [];
    for (const t of own) {
      if (out.some((o) => samePath(o.folder, t.folder))) continue;
      const versions = own.filter((o) => samePath(o.folder, t.folder));
      const facts = versions.map((v) => cachedScript(v.file, host.dataDir));
      const roms = facts.every(Boolean) ? [...new Set(facts.flatMap((f) => (f!.usesPinmame ? f!.roms : [])))] : undefined;
      out.push({ folder: t.folder, title: path.basename(t.folder), roms });
    }
    return out;
  }

  /** Lit les scripts pas encore lus (VPX -ExtractVBS, environ 1 s chacun) : c'est eux qui disent quelle ROM sert à quoi. */
  async function readUnknownScripts(): Promise<void> {
    const exe = host.vpxExe();
    if (!exe) return;
    const unknown = host.tables().filter((t) => !samePath(t.folder, tablesDir()) && !cachedScript(t.file, host.dataDir));
    for (const [i, table] of unknown.entries()) {
      busy = t('Lecture du script de {file} ({i}/{count})…', { file: path.basename(table.file), i: i + 1, count: unknown.length });
      host.broadcast();
      await readScript(exe, table.file, host.dataDir);
    }
    if (unknown.length) host.windows().get('playfield')?.focus();
  }

  function openRoms(): void {
    if (!layout()) return openAdd();
    const s: Extract<Screen, { kind: 'roms' }> = { kind: 'roms' };
    go(s);
    void task(t('Inventaire des ROM…'), async () => {
      await readUnknownScripts();
      busy = t('Inventaire des ROM…');
      host.broadcast();
      s.scan = scanRomLibrary(layout()!.roms, romTables());
    });
  }

  function openRomMigration(): void {
    if (!layout()) return openAdd();
    const s: Extract<Screen, { kind: 'romMigrate' }> = { kind: 'romMigrate', choices: new Map() };
    go(s);
    void task(t('Recherche des ROM à ranger…'), async () => {
      await readUnknownScripts();
      busy = t('Comparaison des ROM (empreintes)…');
      host.broadcast();
      s.scan = scanRomLibrary(layout()!.roms, romTables());
    });
  }

  /** Packs attendus par les autres versions du dossier (pupvideos est partagé) ; undefined si l'une n'a pas été lue. */
  function otherPackNames(table: TableEntry): string[] | undefined {
    const others = host.tables().filter((t) => samePath(t.folder, table.folder) && !samePath(t.file, table.file));
    const names: string[] = [];
    for (const other of others) {
      const facts = cachedScript(other.file, host.dataDir);
      if (!facts) return undefined;
      names.push(...expectedPackNames(facts));
    }
    return names;
  }

  // ---------- Écrans ----------

  /** Menu système : les rubriques (racine), ou les entrées d'une rubrique. */
  function buildSystem(group: SystemGroupId | undefined): Built {
    const actions: Action[] = systemEntries(group).map((id) => {
      const entry = systemEntry(id);
      const item = isSystemGroup(id) ? undefined : systemItems.get(id);
      return {
        label: item?.label ?? entry.label,
        detail: isSystemGroup(id) ? SYSTEM_GROUPS[id].detail : item?.detail,
        icon: entry.icon,
        attention: systemAttention(id),
        shortcut: item?.shortcut,
        run: () => runSystemEntry(id),
      };
    });
    if (!group) return { heading: t('Menu système'), icon: 'gear', sections: [], actions: [...actions, { label: t('Retour aux tables'), icon: 'back', run: leave }], back: leave };
    const up = () => systemUp(group);
    const g = SYSTEM_GROUPS[group];
    return { heading: g.label, icon: g.icon, sections: [], actions: [...actions, { label: t('Retour'), icon: 'back', run: up }], back: up };
  }

  /** L'écran affiché ; en mode invité, sans les actions dont la porte est fermée (ou qui n'en ont pas). */
  function build(): Built {
    const built = buildScreen();
    return host.guest.active ? { ...built, actions: built.actions.filter((a) => host.guest.allows(a.door)) } : built;
  }

  function buildScreen(): Built {
    switch (screen!.kind) {
      case 'system':
        return buildSystem((screen as Extract<Screen, { kind: 'system' }>).group);
      case 'sheet':
        return buildSheet(screen as Extract<Screen, { kind: 'sheet' }>);
      case 'pupOptions':
        return buildPupOptions(screen as Extract<Screen, { kind: 'pupOptions' }>);
      case 'pages':
        return buildPages(screen as PagesScreen);
      case 'edit':
        return buildEdit(screen as Extract<Screen, { kind: 'edit' }>);
      case 'doctor':
        return buildDoctor(screen as Extract<Screen, { kind: 'doctor' }>);
      case 'remove':
        return buildRemove(screen as Extract<Screen, { kind: 'remove' }>);
      case 'addSource':
        return buildAddSource();
      case 'addPlan':
        return buildAddPlan(screen as AddPlan);
      case 'addChoice':
        return buildChoice(screen as Extract<Screen, { kind: 'addChoice' }>);
      case 'addPupChoice':
        return buildPupChoice(screen as Extract<Screen, { kind: 'addPupChoice' }>);
      case 'roms':
        return buildRoms(screen as Extract<Screen, { kind: 'roms' }>);
      case 'romMigrate':
        return buildRomMigrate(screen as Extract<Screen, { kind: 'romMigrate' }>);
      case 'notice': {
        const s = screen as Extract<Screen, { kind: 'notice' }>;
        return { heading: s.heading, sections: [{ rows: s.lines.map((text) => ({ text })) }], actions: [{ label: t('Continuer'), run: s.then }], back: s.then };
      }
      case 'custom':
        return (screen as Extract<Screen, { kind: 'custom' }>).build();
      case 'prompt': {
        const s = screen as Extract<Screen, { kind: 'prompt' }>;
        return { heading: s.heading, lead: s.lead, sections: [], actions: [{ label: t('Annuler'), run: () => s.done(undefined) }], back: () => s.done(undefined) };
      }
    }
  }

  function buildSheet(s: Extract<Screen, { kind: 'sheet' }>): Built {
    const table = find(s.file);
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au menu'), door: 'sheet.back', run: leave }], back: leave };
    const own = !samePath(table.folder, tablesDir());
    const inv = inventory(table.file, own);
    const user = table.info.User ?? {};
    // Statistiques sur une ligne : la fiche tient sur l'écran, en borne comme au bureau.
    const played = [user.LastRun ? t('dernière partie le {date}', { date: formatDateTime(user.LastRun) }) : undefined, user.RunTime ? t('{duration} de jeu', { duration: formatDuration(user.RunTime) }) : undefined].filter(Boolean).join(' · ');
    const stats: Row[] = [{ text: user.StartCount ? tn(user.StartCount, 'Jouée {n} fois', 'Jouée {n} fois') : t('Jamais jouée'), detail: played || undefined }];

    const script = cachedScript(table.file, host.dataDir);
    // Seule la ROM peut empêcher de jouer (playable.ts) : la règle du médecin, sans relire la table.
    const romMissing = Boolean(script?.usesPinmame && romBlockers(table.folder, script.roms, layout()?.roms).length);
    // Résumé borné : une ligne par sorte présente, une pour les absentes, une pour ce qui est à
    // vérifier ; trois noms au plus par ligne. Le détail de chaque fichier est dans « Fichiers ».
    const list = (items: string[]) => (items.length > 3 ? t('{names} et {n} autres', { names: items.slice(0, 2).join(', '), n: items.length - 2 }) : items.join(', '));
    const files: Row[] = [{ text: t('Table'), detail: path.basename(table.file) + (inv.versions.length > 1 ? t(' ({n} versions dans le dossier)', { n: inv.versions.length }) : ''), tone: 'ok' }];
    const absent: string[] = [];
    const check: string[] = [];
    if (inv.backglass) files.push({ text: 'Backglass', detail: inv.backglass, tone: 'ok' });
    else absent.push('backglass');
    if (inv.strayBackglasses.length) check.push(tn(inv.strayBackglasses.length, '{n} backglass mal nommé', '{n} backglass mal nommés'));
    if (romMissing) files.push({ text: 'ROM', detail: t('{rom}.zip absente', { rom: script!.roms[0]! }), tone: 'error' });
    else if (!inv.roms.length && script?.usesPinmame && script.roms.length) files.push({ text: 'ROM', detail: t('{rom} (bibliothèque ou alias)', { rom: formatList(script.roms, 'or') }), tone: 'ok' });
    else if (inv.roms.length) {
      const library = layout()?.roms;
      const names = inv.roms.map((r) => {
        const name = r.replace(/\.zip$/i, '');
        const linked = library && sameFile(path.join(table.folder, 'pinmame', 'roms', r), path.join(library, r));
        return linked ? t('{name} (bibliothèque)', { name }) : name;
      });
      files.push({ text: 'ROM', detail: list(names), tone: 'ok' });
    } else if (!script || script.usesPinmame) absent.push('ROM');
    if (script?.dmdFolder) {
      const present = dmdPresent(table.folder, script.dmdFolder);
      files.push({ text: t('Contenu du DMD'), detail: present ? script.dmdFolder : t('dossier {folder} absent (facultatif)', { folder: script.dmdFolder }), tone: present ? 'ok' : 'warning' });
    }
    const pup = inv.pup.map((p) => {
      const option = pupMemory(table.info, p)?.option;
      return option ? `${p} (${option})` : p;
    });
    if (pup.length) files.push({ text: t('Vidéos PuP'), detail: list(pup), tone: 'ok' });
    else absent.push(t('vidéos PuP'));
    const colors = [...inv.serum.map((x) => `${x} (Serum)`), ...inv.vni.map((x) => `${x} (VNI)`)];
    if (colors.length) files.push({ text: t('Couleurs DMD'), detail: list(colors), tone: 'ok' });
    else absent.push(t('couleurs DMD'));
    if (inv.altsound.length) files.push({ text: t('Sons alternatifs'), detail: list(inv.altsound), tone: 'ok' });
    else absent.push(t('sons alternatifs'));
    if (inv.music) files.push({ text: t('Musique'), detail: tn(inv.music, '{n} fichier', '{n} fichiers'), tone: 'ok' });
    else absent.push(t('musique'));
    if (inv.tableIni) files.push({ text: t('Réglages propres'), detail: t('oui'), tone: 'ok' });
    else absent.push(t('réglages propres'));
    files.push(mediaRow(table));
    if (inv.scriptPatched) files.push({ text: t('Script adapté'), detail: t('PuP-Pack allumé par Cyber Pinball'), tone: 'ok' });
    if (inv.scriptOverride) check.push(t('un .vbs remplace le script de la table'));
    if (inv.crashReports.length) check.push(t('un rapport de plantage laissé par VPX'));
    if (absent.length) files.push({ text: t('Absents'), detail: absent.join(', '), tone: 'quiet' });
    if (check.length) files.push({ text: t('À vérifier'), detail: check.join(', '), tone: 'warning' });
    s.contents ??= tableFiles.contentsOf(table);
    const contents = s.contents;
    // Ce qui empêche de jouer (la ROM), déjà connu sans relire la table ; ou un parcours commencé
    // et pas fini. Le contenu du DMD manquant est proposé, après « Jouer », jamais en tête.
    const dmdMissing = Boolean(script?.dmdFolder && !dmdPresent(table.folder, script.dmdFolder));
    const started = journeyUi.position(table.file);
    const missing: SheetAction[] =
      romMissing || (started && !started.ready)
        ? [
            {
              label: t('Ce qu’il manque pour jouer'),
              detail:
                started && !started.ready && started.position
                  ? t('Reprendre : {position}', { position: started.position })
                  : t('ROM {rom} absente : où la trouver, étape par étape', { rom: script!.roms[0]! }),
              tone: 'ok',
              attention: true,
              door: 'sheet.missing',
              run: () => journeyUi.open(table.file),
            },
          ]
        : [];
    const further: SheetAction[] =
      dmdMissing && !missing.length ? [{ label: t('Pour aller plus loin'), detail: t('Contenu du DMD absent (facultatif) : le récupérer'), icon: 'download', door: 'sheet.further', run: () => journeyUi.open(table.file) }] : [];
    // Mode invité : la fiche sert à jouer ; les fichiers de la table (noms, ROM, replis) n'y sont pas montrés.
    const guest = host.guest.active;
    const actions: SheetAction[] = [
      ...missing,
      {
        label: t('Jouer'),
        icon: 'play',
        door: 'sheet.play',
        run: () => {
          screen = undefined;
          host.play(table);
        },
      },
      ...(host.playWithFriend ? [{ ...host.playWithFriend(table, () => openSheet(table)), door: 'sheet.friends' as const }] : []),
      ...further,
      ...SHEET_PAGE_TYPES.map((type) => pagesAction(table, type)),
      { label: t('Modifier les informations'), detail: t('Titre, fabricant, année'), icon: 'edit', door: 'sheet.edit', run: () => openEdit(table) },
      { label: t('Médias du jeu'), detail: t('Logo, fronton, vidéos, règles : ce que le menu montre'), icon: 'image', door: 'sheet.medias', run: () => medias.open(table) },
      { label: t('Parties du jeu'), detail: t('Table, PuP-Pack, fronton, ROM… : ajouter, remplacer, retirer'), icon: 'table-add', door: 'sheet.parts', run: () => gameParts.open(table) },
      { label: t('Fichiers de la table'), detail: tableFiles.summary(contents), tone: contents.problems ? 'warning' : undefined, icon: 'folder', door: 'sheet.files', run: () => tableFiles.open(table, 0, contents) },
      ...pupAction(table, s),
      ...(host.playAndRecord && host.vpxExe()
        ? [{ label: t('Jouer et enregistrer'), detail: t('Filmer la partie pour la présentation de la table sur la roue'), icon: 'record' as const, door: 'sheet.record' as const, run: () => recording.setup(table) }]
        : []),
      ...(host.adjustDisplay && host.vpxExe()
        ? [{ label: t('Régler l’affichage en partie'), detail: t('Cadrage, fronton, DMD, topper : sur la table lancée, dans le menu de VPX'), icon: 'frame' as const, door: 'sheet.display' as const, run: () => adjustDisplay(table) }]
        : []),
      ...(host.tableSettings
        ? [{ label: t('Réglages de cette table'), detail: t('Son, jeu… pour cette table seulement'), icon: 'sliders' as const, door: 'sheet.table-settings' as const, run: () => host.tableSettings!(table) }]
        : []),
      { label: t('Diagnostiquer et réparer'), icon: 'pulse', door: 'sheet.doctor', run: () => openDoctor(table.file) },
      { label: t('Supprimer la table'), detail: t('Mise à la corbeille'), tone: 'error', icon: 'trash', door: 'sheet.remove', run: () => go({ kind: 'remove', file: table.file }) },
      { label: t('Retour au menu'), icon: 'back', door: 'sheet.back', run: leave },
    ];

    return {
      heading: table.title,
      subheading: [table.manufacturer, table.year].filter(Boolean).join(' · ') || undefined,
      lead: s.flash ?? table.version,
      sections: [{ title: t('Statistiques'), rows: stats }, ...(guest ? [] : [{ title: t('Fichiers'), rows: files }])],
      actions,
      back: leave,
    };
  }

  // ---------- Prospectus et règles, page par page ----------

  const pagesOf = (table: TableEntry, type: SheetPageType) => sheetPages(table, host.root, host.dataDir, type);

  /** « Prospectus : 2 pages » ; sans fichier, ce que montre le repli. */
  function pagesAction(table: TableEntry, type: SheetPageType): SheetAction {
    const n = pagesOf(table, type).length;
    return {
      label: mediaTypeInfo(type).label,
      door: 'sheet.read',
      icon: type === 'GameInfo' ? 'info' : 'rules',
      detail: n ? tn(n, '{n} page', '{n} pages') : type === 'GameInfo' ? t('Fiche générée : titre, fabricant, année') : t('Commandes de la partie'),
      run: () => go({ kind: 'pages', file: table.file, type, index: 0 }),
    };
  }

  function buildPages(s: PagesScreen): Built {
    const table = find(s.file);
    const back = () => (table ? openSheet(table) : leave());
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au menu'), door: 'sheet.back', run: leave }], back };
    const count = Math.max(1, pagesOf(table, s.type).length);
    s.index = Math.min(s.index, count - 1);
    const turn = (step: number) => {
      s.index = (s.index + step + count) % count;
      host.broadcast();
    };
    const label = mediaTypeInfo(s.type).label;
    return {
      heading: table.title,
      subheading: count > 1 ? t('{label} · page {page} sur {count}', { label, page: s.index + 1, count }) : label,
      sections: [],
      // Lire, page par page : ouvert à l'invité comme la fiche.
      actions: [
        ...(count > 1 ? [{ label: t('‹ Page précédente'), door: 'sheet.read' as const, run: () => turn(-1) }, { label: t('Page suivante ›'), door: 'sheet.read' as const, run: () => turn(1) }] : []),
        { label: t('Retour à la fiche'), door: 'sheet.read', run: back },
      ],
      back,
    };
  }

  /** Flippers : page précédente ou suivante ; Start : page suivante, puis la fiche après la dernière ; Exit : la fiche. */
  function pagesKey(s: PagesScreen, input: Input): boolean {
    const KEYS = host.keys();
    const is = (group: string[]) => group.includes(input.code);
    const table = find(s.file);
    const count = table ? Math.max(1, pagesOf(table, s.type).length) : 1;
    if (is(KEYS.previous) || is(KEYS.next)) s.index = (s.index + (is(KEYS.previous) ? -1 : 1) + count) % count;
    else if (is(KEYS.confirm) && s.index < count - 1) s.index++;
    else if (is(KEYS.confirm) || is(KEYS.exit)) build().back();
    else return false;
    host.broadcast();
    return true;
  }

  /** Ce que dessine le rendu : la page, ou le repli (fiche générée, commandes de la partie). */
  function pagesView(s: PagesScreen) {
    const table = find(s.file);
    if (!table) return undefined;
    const pages = pagesOf(table, s.type);
    const authors = table.info.Info?.Authors?.filter((a) => typeof a === 'string' && a.trim());
    // Commandes de la partie : celles de la borne (boutons, tilt) ; une borne sans modèle a les touches par défaut.
    const cabinet = s.type === 'GameHelp' ? loadCabinet(host.dataDir) : undefined;
    return {
      type: s.type,
      index: s.index,
      count: Math.max(1, pages.length),
      page: pages[s.index],
      fallback: pages.length ? undefined : s.type === 'GameInfo' ? ('info-sheet' as const) : ('game-controls' as const),
      card: {
        title: table.title,
        manufacturer: table.manufacturer,
        year: table.year,
        authors: authors?.length ? authors.join(', ') : undefined,
        description: typeof table.info.Info?.Description === 'string' ? table.info.Info.Description : undefined,
        version: table.version,
      },
      keys: s.type === 'GameHelp' ? gameKeys(cabinet?.buttons, cabinet?.tilt) : undefined,
    };
  }

  /** « Médias : 4 sur 11 fournis par le jeu ; replis pour les autres » */
  function mediaRow(table: TableEntry): Row {
    const own = layout() ? MANAGED_MEDIA_TYPES.filter((type) => ownMediaPages(table, host.root!, type).length).length : 0;
    return {
      text: t('Médias'),
      detail: own ? t('{own} sur {count} fournis par le jeu ; replis pour les autres', { own, count: MANAGED_MEDIA_TYPES.length }) : t('aucun : le menu montre ses replis'),
      tone: own ? 'ok' : 'quiet',
    };
  }

  // ---------- Options des PuP-Packs ----------

  /**
   * PuP-Packs de la table qui ont des options, lus une fois par écran (l'analyse d'un pack
   * parcourt ses dossiers) : la fiche montre l'option appliquée, signale celle qui
   * conviendrait mieux à la borne, et ouvre l'écran des options.
   */
  function pupPacksOf(table: TableEntry, s: { pup?: TablePupPack[] }): TablePupPack[] {
    s.pup ??= tablePupPacks(table, pupCabinet(loadCabinet(host.dataDir)));
    return s.pup;
  }

  function pupAction(table: TableEntry, s: { pup?: TablePupPack[] }): SheetAction[] {
    const packs = pupPacksOf(table, s);
    if (!packs.length) return [];
    const unsuited = packs.some((p) => p.recommended && p.applied !== p.recommended && p.memory?.chosen !== 'user');
    const applied = packs.map((p) => p.applied?.label ?? t('aucune option appliquée')).join(' · ');
    return [
      {
        label: 'PuP-Pack', // i18n-ignore : nom propre
        icon: 'pup',
        detail: unsuited ? t('{applied} · une autre option convient mieux à la borne', { applied }) : applied,
        tone: unsuited ? 'warning' : undefined,
        door: 'sheet.pup',
        run: () => go({ kind: 'pupOptions', file: table.file }),
      },
    ];
  }

  function buildPupOptions(s: Extract<Screen, { kind: 'pupOptions' }>): Built {
    const table = find(s.file);
    const back = () => (table ? openSheet(table) : leave());
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au menu'), run: leave }], back: leave };
    const packs = pupPacksOf(table, s);
    const cabinet = pupCabinet(loadCabinet(host.dataDir));
    const sections: Section[] = packs.map((p) => ({
      title: packs.length > 1 ? p.pack : t('Options du pack {pack}', { pack: p.pack }),
      rows: [
        {
          text: t('Appliquée'),
          detail: !p.applied
            ? t('aucune : les fichiers de la racine ne sont ceux d’aucune option')
            : p.incomplete
              ? t('{option}, en partie seulement ({differences})', { option: p.applied.label, differences: p.incomplete.join(', ') })
              : p.applied.label,
          tone: !p.applied || p.incomplete ? ('warning' as const) : undefined,
        },
        // Options aux fichiers identiques : rien sur le disque ne dit laquelle est en place.
        ...(p.twins.length
          ? [{ text: t('Mêmes fichiers'), detail: t('{list} : rien ne la distingue de l’appliquée', { list: p.twins.map((v) => `« ${v.label} »`).join(', ') }), tone: 'info' as const }]
          : []),
        {
          text: t('Pour cette borne'),
          detail: !cabinet
            ? t('borne pas encore configurée')
            : p.recommended
              ? t('{option} ({cabinet})', { option: p.recommended.label, cabinet: describePupCabinet(cabinet) })
              : p.candidates
                ? t('pas de choix net entre « {first} » et « {second} » ({cabinet}) : à essayer', { first: p.candidates[0].label, second: p.candidates[1].label, cabinet: describePupCabinet(cabinet) })
                : t('pas de choix net : à essayer'),
          // Vert seulement si l'option conseillée est en place ; sans choix net, une information.
          tone: !cabinet ? undefined : !p.recommended ? 'info' : p.recommended !== p.applied ? 'warning' : 'ok',
        },
      ],
    }));
    const actions: Action[] = packs.flatMap((p) =>
      p.variants.map((v) => {
        const state = v === p.applied ? (p.incomplete ? t('appliquée en partie') : t('appliquée')) : p.twins.includes(v) ? t('mêmes fichiers que l’appliquée') : undefined;
        const advice = v === p.recommended ? t('conseillée pour la borne') : undefined;
        return {
          label: packs.length > 1 ? `${p.pack} : ${v.label}` : v.label,
          detail: [traitsLabel(v), state, advice].filter(Boolean).join(' · '),
          tone: v === p.applied && !p.incomplete ? ('ok' as const) : undefined,
          run: () => applyPupOption(s, table, p, v),
        };
      }),
    );
    actions.push(
      {
        label: t('Jouer'),
        detail: t('Voir l’option appliquée sur la borne'),
        run: () => {
          screen = undefined;
          host.play(table);
        },
      },
      { label: t('Retour à la fiche'), run: back },
    );
    return {
      heading: 'PuP-Pack', // i18n-ignore : nom propre
      subheading: table.title,
      lead: s.flash ?? t('Chaque option est une disposition des écrans prévue par l’auteur du pack. Start l’applique ; elle sert dès la prochaine partie.'),
      sections,
      actions,
      back,
    };
  }

  /**
   * Applique une option : ses fichiers recopiés (les remplacés et ceux que son .bat supprime
   * partent à la corbeille, d'où l'on revient à l'état d'avant), le choix retenu dans le .info,
   * marqué comme choisi ici (le médecin ne le remet plus en cause). La réussite n'est
   * annoncée qu'après relecture du pack : l'option doit être reconnue en place (appliedOption),
   * sinon le message dit ce qui manque.
   */
  function applyPupOption(s: Extract<Screen, { kind: 'pupOptions' }>, table: TableEntry, pack: TablePupPack, variant: PupVariant): void {
    if (variant === pack.applied && !pack.incomplete && pack.memory?.chosen === 'user') {
      s.flash = t('« {option} » est déjà appliquée.', { option: variant.label });
      return host.broadcast();
    }
    // Un fichier de l'option manque : rien n'est touché, plutôt qu'un pack à moitié changé.
    const missing = missingSources(pack.root, variant);
    if (missing.length) {
      s.flash = t('« {option} » non appliquée, rien n’a changé : {files} introuvable dans le pack.', { option: variant.label, files: formatList(missing.slice(0, 3), 'and') });
      s.pup = undefined;
      return host.broadcast();
    }
    const trashDir = trashDirFor(layout()!.trash, `PuP-Pack ${path.basename(table.folder)}`); // i18n-ignore : nom de dossier
    try {
      applyOps(pupOptionOps(table, pack.root, pack.pack, variant, { ...(pack.memory ?? {}), chosen: 'user' }), { trashDir });
      const check = checkAppliedOption(pack.root, variant.label);
      const done = t('« {option} » appliquée : elle sert dès la prochaine partie. « Jouer » pour la voir.', { option: variant.label });
      s.flash = !check.ok
        ? t('« {option} » n’est pas en place après la copie : {reason}.', { option: variant.label, reason: check.reasons.join(', ') })
        : fs.existsSync(trashDir)
          ? t('{message} L’état d’avant est dans la corbeille de Cyber Pinball ({folder}).', { message: done, folder: path.basename(trashDir) })
          : done;
    } catch (error) {
      s.flash = t('Option non appliquée : {message}', { message: (error as Error).message });
    }
    s.pup = undefined;
    host.reload(table.file);
    host.broadcast();
  }

  // ---------- Régler l'affichage en partie ----------

  /**
   * La table lancée en mode réglage (VPX -PovEdit : son menu ouvert sur le cadrage), puis
   * retour à la fiche. Ce que VPX a enregistré pour la table seule se lit dans son .ini ;
   * ce qu'il a enregistré pour toutes les tables, le démarrage suivant le signale.
   */
  async function adjustDisplay(table: TableEntry): Promise<void> {
    const ini = findTableIni(table.file).path;
    const before = readTextIfExists(ini);
    const result = await host.adjustDisplay!(table);
    if (!result) return;
    if (!result.ok) return openSheet(table, t('Le réglage de l’affichage n’a pas pu se dérouler : {message}', { message: result.message ?? t('erreur inconnue') }));
    const after = readTextIfExists(ini);
    openSheet(table, after !== before ? t('Affichage enregistré pour cette table ({file}).', { file: path.basename(ini) }) : t('Rien n’a été enregistré pour cette table seule.'));
  }

  function openEdit(table: TableEntry): void {
    go({ kind: 'edit', file: table.file, fields: { Title: table.title, Manufacturer: table.manufacturer ?? '', Year: table.year } });
  }

  function buildEdit(s: Extract<Screen, { kind: 'edit' }>): Built {
    const table = find(s.file);
    const back = () => (table ? openSheet(table) : leave());
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour'), run: back }], back };
    const infoFile = infoFileFor(table, tablesDir());
    const f = s.fields;
    return {
      heading: t('Modifier les informations'),
      subheading: table.title,
      lead: t('Enregistrées dans « {file} », partagé avec les autres frontends ; les autres informations du fichier sont conservées.', { file: path.basename(infoFile) }),
      sections: [],
      actions: [
        { label: t('Titre'), detail: f.Title || '—', run: () => openEditor(s, 'Title') },
        { label: t('Fabricant'), detail: f.Manufacturer || '—', run: () => openEditor(s, 'Manufacturer') },
        { label: t('Année'), detail: f.Year ? String(f.Year) : '—', run: () => openEditor(s, 'Year') },
        {
          label: t('Enregistrer'),
          tone: 'ok',
          run: () => {
            updateInfo(infoFile, { Title: f.Title, Manufacturer: f.Manufacturer, Year: f.Year });
            host.reload(table.file);
            const updated = find(table.file);
            if (updated) openSheet(updated, t('Informations enregistrées.'));
            else leave();
          },
        },
        { label: t('Annuler'), run: back },
      ],
      back,
    };
  }

  function openEditor(s: Extract<Screen, { kind: 'edit' }>, field: Field): void {
    if (field === 'Title') {
      s.editor = { kind: 'text', field, label: t('Titre'), value: s.fields.Title, cursor: 0, shift: false, typed: false };
    } else if (field === 'Manufacturer') {
      const choices = [...new Set([s.fields.Manufacturer, ...MANUFACTURERS].filter(Boolean)), otherManufacturer()];
      s.editor = { kind: 'choice', field, label: t('Fabricant'), choices, cursor: Math.max(0, choices.indexOf(s.fields.Manufacturer)) };
    } else {
      s.editor = { kind: 'number', field, label: t('Année'), value: s.fields.Year ?? new Date().getFullYear(), typed: '', cursor: NUMPAD.indexOf('OK') };
    }
    host.broadcast();
  }

  function closeEditor(s: EditorScreen, save: boolean): void {
    const e = s.editor;
    if (s.kind === 'prompt') {
      const value = e?.kind === 'text' ? e.value.trim() : '';
      s.done(save && value ? value : undefined);
      host.broadcast();
      return;
    }
    if (save && e) {
      if (e.kind === 'text') {
        if (e.field === 'Title') s.fields.Title = e.value.trim() || s.fields.Title;
        else s.fields.Manufacturer = e.value.trim();
      } else if (e.kind === 'number') s.fields.Year = e.value;
    }
    s.editor = undefined;
    host.broadcast();
  }

  function buildDoctor(s: Extract<Screen, { kind: 'doctor' }>): Built {
    const table = find(s.file);
    const next = () => {
      const [following, ...rest] = s.queue;
      if (following) openDoctor(following, rest, s.afterImport);
      else if (s.back) s.back();
      else if (table) openSheet(table);
      else leave();
    };
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour'), run: next }], back: next };
    const findings = s.findings ?? [];
    const actions: Action[] = [];
    // Un constat qui empêche de jouer (la ROM seule, playable.ts) : le parcours mène jusqu'à « Jouer ».
    if (playBlockers(findings).length) {
      actions.push({ label: t('Ce qu’il manque pour jouer'), detail: t('Étape par étape, jusqu’à « Jouer »'), tone: 'ok', run: () => journeyUi.open(table.file) });
    }
    const rows: Row[] = findings.map((f) => {
      const row: Row = { text: f.title, detail: f.detail, tone: f.severity };
      if (f.fix) {
        row.action = actions.length;
        actions.push({ label: f.fix.label, detail: t('Réparer'), tone: f.severity, run: () => repair(s, [f]) });
      }
      return row;
    });
    const fixable = findings.filter((f) => f.fix);
    if (fixable.length > 1) actions.push({ label: t('Tout réparer'), detail: tn(fixable.length, '{n} correction', '{n} corrections'), run: () => repair(s, fixable) });
    actions.push({ label: t('Analyser à nouveau'), run: () => void analyse() });
    actions.push({ label: s.queue.length ? t('Table suivante') : s.back ? t('Retour') : t('Retour à la fiche'), run: next });
    // Hors de son dossier, la ROM n'est pas vérifiée (PinMAME la cherche alors ailleurs).
    const romChecked = !findings.some((f) => f.code === 'outsideFolder');
    if (s.findings && !findings.length) rows.push({ text: t('Aucun problème détecté'), detail: scriptNote(s.script), tone: 'ok' });
    else if (s.findings && romChecked && s.script && !('error' in s.script) && !findings.some((f) => f.code.startsWith('rom'))) {
      rows.push({ text: 'ROM', detail: scriptNote(s.script), tone: 'ok' });
    }
    // Pack trouvé sous le nom que le plugin cherche, sans constat : on le dit aussi.
    if (s.findings && romChecked && s.script && !('error' in s.script) && !findings.some((f) => f.code.startsWith('pup'))) {
      const present = inventory(table.file, true).pup;
      const pack = expectedPackNames(s.script).map((n) => present.find((p) => p.toLowerCase() === n.toLowerCase())).find(Boolean);
      const option = pack ? pupMemory(table.info, pack)?.option : undefined;
      if (pack) rows.push({ text: 'PuP-Pack', detail: t('{folder} : rangé là où le plugin PUP le cherche.', { folder: `pupvideos\\${pack}${option ? `, ${option}` : ''}` }), tone: 'ok' });
    }
    const sections: Section[] = [];
    if (s.added?.length) sections.push({ title: t('Ajouté avec la table'), rows: s.added });
    if (s.log.length) sections.push({ title: t('Réparé'), rows: s.log.map((text) => ({ text, tone: 'ok' as const })) });
    sections.push({ title: t('Constats'), rows });
    return {
      heading: s.afterImport ? t('Vérification de la table ajoutée') : t('Diagnostic'),
      subheading: [table.title, path.basename(table.file)].join(' · '),
      lead: s.findings && fixable.length ? t('Chaque correction dit ce qu’elle fait ; ce qui est retiré part dans la corbeille.') : undefined,
      sections,
      actions,
      back: next,
    };
  }

  function repair(s: Extract<Screen, { kind: 'doctor' }>, findings: Finding[]): void {
    const table = find(s.file);
    if (!table) return;
    s.file = applyFixes(table, findings);
    s.log.push(...findings.map((f) => f.fix!.label));
    void analyse();
  }

  function buildRoms(s: Extract<Screen, { kind: 'roms' }>): Built {
    const back = () => openSystem();
    const scan = s.scan;
    if (!scan) return { heading: t('Bibliothèque de ROM'), sections: [], actions: [{ label: t('Retour au menu'), run: back }], back };
    const unused = unusedRoms(scan);
    const missing = missingRoms(scan);
    const tidy = romsToTidy(scan);
    const stored = scan.entries.filter((e) => e.stored && !unused.includes(e));
    const space = romSpace(scan);
    const actions: Action[] = [];
    const tidyAction = tidy.length ? actions.push({ label: t('Ranger les ROM dans la bibliothèque'), detail: tn(tidy.length, '{n} ROM copiée, hors de la bibliothèque ou pas liée', '{n} ROM copiées, hors de la bibliothèque ou pas liées'), tone: 'warning', run: () => openRomMigration() }) - 1 : undefined;
    const addAction = missing.length ? actions.push({ label: t('Ajouter'), detail: tn(missing.length, '{n} ROM absente : téléchargements, clé USB ou ce PC', '{n} ROM absentes : téléchargements, clé USB ou ce PC'), run: () => void pick('rom') }) - 1 : undefined;
    const unusedRows: Row[] = unused.map((e) => ({
      text: e.name,
      detail: t('{size} · aucune table ne l’a ni ne l’attend', { size: formatSize(e.stored!.size) }),
      tone: 'quiet',
      action: actions.push({ label: t('Mettre « {name} » à la corbeille', { name: e.name }), detail: formatSize(e.stored!.size), run: () => trashRoms([e]) }) - 1,
    }));
    if (unused.length > 1) {
      const total = unused.reduce((sum, e) => sum + e.stored!.size, 0);
      actions.push({ label: t('Mettre toutes les ROM inutilisées à la corbeille'), detail: t('{n} ROM · {size}', { n: formatNumber(unused.length), size: formatSize(total) }), run: () => trashRoms(unused) });
    }
    actions.push(catalogUi.webAction('roms', { query: partWebQuery('pinmame', 'rom'), received: (file) => startImport([file], 'copy') }, () => openRoms()));
    actions.push({ label: t('Actualiser'), run: () => openRoms() }, { label: t('Retour au menu'), run: back });

    const sections: Section[] = [];
    if (missing.length) {
      sections.push({
        title: t('Attendues mais absentes ({n})', { n: missing.length }),
        rows: missing.map((e) => ({ text: e.name, detail: t('Demandée par {tables} : la table ne démarre pas sans elle.', { tables: e.uses.map((u) => u.table.title).join(', ') }), tone: 'error', action: addAction })),
      });
    }
    if (tidy.length) {
      sections.push({ title: t('À ranger ({n})', { n: tidy.length }), rows: tidy.map((e) => ({ text: e.name, detail: tidyDetail(e), tone: 'warning', action: tidyAction })) });
    }
    if (unused.length) sections.push({ title: t('Inutilisées ({n})', { n: unused.length }), rows: unusedRows });
    const shown = stored.slice(0, 40);
    if (shown.length || !unused.length) {
      sections.push({
        title: t('Dans la bibliothèque ({n})', { n: stored.length }),
        rows: shown.length
          ? shown.map((e) => {
              const tables = e.uses.map((u) => u.table.title);
              const linked = e.uses.every((u) => u.state === 'linked');
              return {
                text: e.name,
                detail: `${tables.join(', ')} · ${formatSize(e.stored!.size)}`,
                badges: [tn(tables.length, '{n} table', '{n} tables')],
                tone: linked ? ('ok' as const) : ('warning' as const),
              };
            })
          : [{ text: t('Aucune ROM pour le moment'), detail: t('Les ROM ajoutées avec « Ajouter une table » y sont rangées.'), tone: 'quiet' }],
        more: stored.length - shown.length,
      });
    }
    if (scan.unread.length) {
      sections.push({
        rows: [
          {
            text: tn(scan.unread.length, '{n} table dont le script n’a pas été lu', '{n} tables dont le script n’a pas été lu'),
            detail: t('{tables} : VPX n’est pas installé ou n’a pas pu lire le script. Leur ROM n’est connue que si elle est dans leur dossier.', { tables: scan.unread.map((u) => u.title).join(', ') }),
            tone: 'quiet',
          },
        ],
      });
    }
    const saved = space.logical - space.physical;
    return {
      heading: t('Bibliothèque de ROM'),
      subheading: scan.library,
      lead: t('{n} ROM dans la bibliothèque · {size} sur le disque{saved}. Chaque table a dans son dossier un lien vers la ROM de la bibliothèque : le même fichier, sans place en plus.', {
        n: formatNumber(stored.length + unused.length),
        size: formatSize(space.physical),
        saved: saved > 0 ? t(' · les liens physiques économisent {size}', { size: formatSize(saved) }) : '',
      }),
      sections,
      actions,
      back,
    };
  }

  /** « copie dans Terminator 2 · pas liée dans Terminator 2 VPW » : ce qui reste à faire pour une ROM. */
  function tidyDetail(e: RomEntry): string {
    const labels: Partial<Record<RomState, (tables: string) => string>> = {
      copy: (tables) => t('copie dans {tables}', { tables }),
      different: (tables) => t('autre version dans {tables}', { tables }),
      outside: (tables) => t('hors de la bibliothèque, dans {tables}', { tables }),
      notLinked: (tables) => t('pas liée dans {tables}', { tables }),
      missing: (tables) => t('à lier aussi dans {tables}', { tables }),
    };
    const parts = Object.entries(labels).flatMap(([state, label]) => {
      const tables = e.uses.filter((u) => u.state === state).map((u) => u.table.title);
      return tables.length ? [label(tables.join(', '))] : [];
    });
    const size = e.stored?.size ?? e.uses.find((u) => u.file)?.file?.size;
    return [...parts, ...(size ? [formatSize(size)] : [])].join(' · ');
  }

  function trashRoms(entries: RomEntry[]): void {
    const trashDir = trashDirFor(layout()!.trash, 'ROM inutilisées'); // i18n-ignore : nom de dossier
    applyOps(entries.map((e) => ({ op: 'trash', path: e.stored!.path })), { trashDir });
    const n = entries.length;
    go({ kind: 'notice', heading: tn(n, '{n} ROM mise à la corbeille', '{n} ROM mises à la corbeille'), lines: [entries.map((e) => e.name).join(', '), trashDir], then: () => openRoms() });
  }

  function buildRomMigrate(s: Extract<Screen, { kind: 'romMigrate' }>): Built {
    const back = () => openSystem();
    if (!s.scan) return { heading: t('Ranger les ROM'), sections: [], actions: [{ label: t('Retour au menu'), run: back }], back };
    const plan = planRomMigration(s.scan, s.choices);
    if (!plan.items.length) {
      return {
        heading: t('Rien à ranger'),
        subheading: plan.library,
        lead: t('Chaque ROM est dans la bibliothèque, et chaque table qui la joue en a un lien.'),
        sections: [],
        actions: [{ label: t('Voir la bibliothèque de ROM'), run: () => openRoms() }, { label: t('Retour au menu'), run: back }],
        back,
      };
    }
    const choiceActions: Action[] = [];
    const rows: Row[] = [];
    for (const item of plan.items) {
      const kept = item.versions[item.keep]!;
      rows.push({
        text: item.name,
        detail: migrationDetail(item),
        badges: [item.stores ? t('entre dans la bibliothèque') : t('déjà dans la bibliothèque'), tn(item.links.length, '{n} lien', '{n} liens')],
        tone: item.versions.length > 1 ? 'warning' : undefined,
      });
      if (item.versions.length > 1) {
        const others = item.versions.filter((_, i) => i !== item.keep);
        const next = item.versions[(item.keep + 1) % item.versions.length]!;
        rows.push({
          text: t('{n} versions différentes de {name}', { n: item.versions.length, name: item.name }),
          detail: t('Gardée : {kept}, {why}. À la corbeille : {others}.', { kept: versionLabel(kept), why: item.decided ? t('choisie') : t('la plus récente'), others: others.map(versionLabel).join(' ; ') }),
          badges: [item.decided ? t('choisie') : t('la plus récente')],
          tone: 'warning',
          action: 2 + choiceActions.length,
        });
        choiceActions.push({
          label: t('Garder plutôt {version}', { version: versionLabel(next) }),
          detail: item.name,
          run: () => {
            s.choices.set(item.key, next.hash);
            host.broadcast();
          },
        });
      }
    }
    const summary: Row[] = [{ text: t('Libère {size}', { size: formatSize(plan.freed) }), detail: t('Copies identiques remplacées par des liens physiques vers la bibliothèque.'), tone: 'ok' }];
    if (plan.trashed) summary.push({ text: t('{size} à la corbeille', { size: formatSize(plan.trashed) }), detail: t('Versions écartées, récupérables dans la corbeille.'), tone: 'warning' });
    if (plan.crossVolume.length) {
      summary.push({
        text: tn(plan.crossVolume.length, '{n} table sur un autre disque', '{n} tables sur un autre disque'),
        detail: tn(
          plan.crossVolume.length,
          'Un lien physique ne relie que deux dossiers d’un même disque : {tables} reçoit une copie.',
          'Un lien physique ne relie que deux dossiers d’un même disque : {tables} reçoivent une copie.',
          { tables: plan.crossVolume.map((v) => v.title).join(', ') },
        ),
        tone: 'warning',
      });
    }
    return {
      heading: t('Ranger les ROM'),
      subheading: plan.library,
      lead: t('Chaque ROM est gardée une fois dans la bibliothèque ; chaque table reçoit à la place de sa copie un lien physique (le même fichier, sans place en plus). Rien ne bouge avant « Ranger ».'),
      sections: [
        { title: t('Résultat'), rows: summary },
        { title: `ROM (${plan.items.length})`, rows: rows.slice(0, 40), more: rows.length - Math.min(rows.length, 40) },
      ],
      actions: [
        { label: t('Ranger'), detail: t('{n} ROM · libère {size}', { n: formatNumber(plan.items.length), size: formatSize(plan.freed) }), tone: 'ok', run: () => migrateRoms(s) },
        { label: t('Annuler'), run: back },
        ...choiceActions,
      ],
      back,
    };
  }

  /** « rangée depuis Terminator 2 · copie remplacée dans T2 mod · lien ajouté dans T2 VPW · libère 459 ko » */
  function migrationDetail(item: RomMigration): string {
    const parts: string[] = [];
    if (item.stores) parts.push(t('rangée depuis {table}', { table: path.basename(path.dirname(path.dirname(path.dirname(item.stores)))) }));
    const groups: [(tables: string) => string, (l: RomMigration['links'][number]) => boolean][] = [
      [(tables) => t('copie remplacée par un lien dans {tables}', { tables }), (l) => l.content === 'same' && l.was !== 'linked'],
      [(tables) => t('autre version remplacée dans {tables}', { tables }), (l) => l.content === 'other'],
      [(tables) => t('lien ajouté dans {tables}', { tables }), (l) => l.content === 'none'],
      [(tables) => t('lien refait dans {tables}', { tables }), (l) => l.content === 'same' && l.was === 'linked'],
    ];
    for (const [label, match] of groups) {
      const tables = item.links.filter((l) => match(l) && !(item.stores && l.to.toLowerCase() === item.stores.toLowerCase())).map((l) => l.table.title + (l.copy ? t(' (copie, autre disque)') : ''));
      if (tables.length) parts.push(label(tables.join(', ')));
    }
    if (item.freed) parts.push(t('libère {size}', { size: formatSize(item.freed) }));
    return parts.join(' · ');
  }

  function migrateRoms(s: Extract<Screen, { kind: 'romMigrate' }>): void {
    void task(t('Rangement des ROM…'), () => {
      const plan = planRomMigration(s.scan!, s.choices);
      const before = romSpace(s.scan!);
      const trashDir = trashDirFor(layout()!.trash, 'ROM rangées'); // i18n-ignore : nom de dossier
      for (const item of plan.items) applyOps(item.ops, { trashDir });
      const scan = scanRomLibrary(layout()!.roms, romTables());
      const after = romSpace(scan);
      const links = plan.items.reduce((n, i) => n + i.links.length, 0);
      const lines = [
        tn(plan.items.length, '{n} ROM rangée dans {dir}, {links} dans les tables.', '{n} ROM rangées dans {dir}, {links} dans les tables.', {
          dir: layout()!.roms,
          links: tn(links, '{n} lien', '{n} liens'),
        }),
        t('Place des ROM sur le disque : {before} avant, {after} après, soit {saved} de moins{trashed}.', {
          before: formatSize(before.physical),
          after: formatSize(after.physical),
          saved: formatSize(before.physical - after.physical),
          trashed: plan.trashed ? t(' (dont {size} de versions écartées, encore dans la corbeille)', { size: formatSize(plan.trashed) }) : '',
        }),
      ];
      if (fs.existsSync(trashDir)) lines.push(t('Corbeille : {dir}', { dir: trashDir }));
      const left = romsToTidy(scan).length;
      if (left) lines.push(tn(left, '{n} ROM reste à ranger : voir la bibliothèque de ROM.', '{n} ROM restent à ranger : voir la bibliothèque de ROM.'));
      screen = { kind: 'notice', heading: t('ROM rangées'), lines, then: () => openRoms() };
      cursor = 0;
    });
  }

  /** « celle de Terminator 2 (12 octobre 2026, 459 ko) » */
  function versionLabel(v: RomMigration['versions'][number]): string {
    const others = v.tables.length - 1;
    const first = v.tables[0] ?? '';
    const where = v.inLibrary
      ? t('celle de la bibliothèque')
      : others > 0
        ? tn(others, 'celle de {table} et {n} autre', 'celle de {table} et {n} autres', { table: first })
        : t('celle de {table}', { table: first });
    return `${where} (${formatDate(v.file.mtimeMs)}, ${formatSize(v.file.size)})`;
  }

  function buildRemove(s: Extract<Screen, { kind: 'remove' }>): Built {
    const table = find(s.file);
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour'), run: leave }], back: leave };
    const back = () => openSheet(table);
    const targets = removalTargets(table, tablesDir());
    const total = targets.paths.reduce((sum, p) => sum + sizeOf(p), 0);
    return {
      heading: t('Supprimer « {title} » ?', { title: table.title }),
      subheading: table.version,
      lead: targets.whole
        ? t('Rien n’est effacé : le dossier de la table part dans la corbeille ({trash}), d’où l’on peut le récupérer.', { trash: layout()!.trash })
        : t('Rien n’est effacé : ces fichiers partent dans la corbeille ({trash}), d’où l’on peut les récupérer.', { trash: layout()!.trash }),
      sections: [
        {
          title: targets.whole ? t('Dossier mis à la corbeille') : t('Fichiers mis à la corbeille (les autres versions restent)'),
          rows: targets.paths.map((p) => ({ text: path.relative(tablesDir(), p), detail: formatSize(sizeOf(p)) })),
        },
        { rows: [{ text: t('Total : {size}', { size: formatSize(total) }), tone: 'quiet' }] },
      ],
      actions: [
        { label: t('Annuler'), run: back },
        {
          label: t('Mettre à la corbeille'),
          tone: 'error',
          run: () => {
            const trashDir = trashDirFor(layout()!.trash, `Table ${table.title}`); // i18n-ignore : nom de dossier
            applyOps(targets.paths.map((p) => ({ op: 'trash', path: p })), { trashDir });
            host.reload();
            go({ kind: 'notice', heading: t('« {title} » est dans la corbeille', { title: table.title }), lines: [trashDir], then: leave });
          },
        },
      ],
      back,
    };
  }

  /**
   * Entonnoir « Ajouter une table » : toutes les façons d'ajouter une table, au même
   * endroit. D'abord ce qui est prêt (fichiers reçus d'un jeu, dossier d'import), en un
   * clic jusqu'au plan ; puis le catalogue en ligne, les fichiers de ce PC, ce qui a été
   * récupéré et attend, les mises à jour et les comptes des sites.
   */
  function buildAddSource(): Built {
    const importDir = layout()!.import;
    const entries = listImport();
    const ready = catalogUi.ready();
    const actions: Action[] = [];
    const sections: Section[] = [];
    if (ready.length) {
      const rows = ready.slice(0, 3).map((g): Row => {
        // Un fichier reçu qui ne convient pas (un pack de médias pour la table) : à corriger avant ;
        // « Installer » ouvre alors l'élément à corriger (liste d'attente, catalog.ts).
        // Un fichier à corriger reste à part : il ne retient pas l'installation du reste.
        const wrong = g.problems.map((p) => t('{kind} : {problem}', { kind: NEED_LABELS[p.item.kind], problem: p.text }));
        const ready = g.items.filter((i) => !g.problems.some((p) => p.item === i));
        const row: Row = { text: g.label, detail: [...ready.map((i) => t('{kind} : {label}', { kind: NEED_LABELS[i.kind], label: i.label })), ...wrong].join(' · '), badges: [wrong.length ? t('À corriger à part') : t('Reçu')], tone: wrong.length ? 'warning' : 'ok', action: actions.length };
        // Une icône par entrée d'un menu : seulement quand un seul jeu est prêt.
        actions.push({
          label: t('Installer : {game}', { game: g.label }),
          detail: tn(ready.length, '{n} fichier reçu : voir le plan', '{n} fichiers reçus : voir le plan'),
          tone: 'ok',
          icon: ready.length === 1 ? 'check' : undefined,
          run: () => catalogUi.installGame(g.gameId),
        });
        return row;
      });
      sections.push({ title: t('Prêt à installer'), rows, more: ready.length - rows.length });
    }
    const importAction = entries.length ? actions.length : undefined;
    if (entries.length) {
      actions.push({
        label: t('Importer le contenu du dossier d’import'),
        detail: tn(entries.length, '{n} élément', '{n} éléments'),
        icon: 'usb',
        run: () => startImport(entries.map((e) => path.join(importDir, e)), 'move'),
      });
    }
    const rows: Row[] = entries.map((name) => {
      const p = path.join(importDir, name);
      const dir = fs.statSync(p).isDirectory();
      const kind = dir ? t('Dossier') : ARCHIVE_EXT.has(path.extname(name).toLowerCase()) ? t('Archive') : KIND_LABELS[classifyFile(name)];
      return { text: name, detail: `${kind} · ${formatSize(sizeOf(p))}`, action: importAction };
    });
    sections.push({
      // Le chemin en clair, pas dans le titre : en capitales, il prendrait trois lignes.
      title: t('Dossier d’import'),
      rows: rows.length ? rows.slice(0, 12) : [{ text: t('Vide pour le moment'), detail: t('{dir} : copiez-y les fichiers d’une table (depuis une clé USB), ils apparaissent ici.', { dir: importDir }), tone: 'quiet' }],
      more: rows.length - Math.min(rows.length, 12),
    });
    actions.push(
      { label: t('Trouver une table en ligne'), detail: t('Catalogue VPS : versions, filtres, installation rapide'), icon: 'search', run: () => catalogUi.open() },
      { label: t('Reprendre un fichier téléchargé'), detail: downloadsDetail(), icon: 'download', run: () => void pick('downloads') },
      { label: t('Choisir des fichiers…'), detail: t('Clé USB, Téléchargements, Bureau, disques ; ou glissez-les ici'), icon: 'import', run: () => void pick('files') },
      { label: t('Choisir un dossier…'), detail: t('Tout le dossier d’une table, depuis une clé USB ou un disque'), icon: 'folder', run: () => void pick('folder') },
      { label: t('Récupérés et attendus'), detail: catalogUi.summary(), icon: 'inbox', run: () => catalogUi.openWaitList(() => openAdd()) },
      { label: t('Mises à jour des tables'), detail: t('Nouvelles versions des tables installées'), icon: 'refresh', run: () => catalogUi.openUpdates() },
      { label: t('Comptes des sites'), detail: t('vpuniverse.com, vpforums.org… : connexions gardées'), icon: 'account', run: () => catalogUi.openAccounts() },
      catalogUi.webAction('add.funnel', { query: partWebQuery('table', 'table'), received: (file) => startImport([file], 'copy', undefined, undefined, true) }, () => openAdd()),
      { label: t('Retour'), icon: 'back', run: () => openSystem() },
    );
    return {
      heading: t('Ajouter une table'),
      subheading: [ready.length ? tn(ready.length, '{n} jeu prêt à installer', '{n} jeux prêts à installer') : undefined, entries.length ? tn(entries.length, '{n} élément dans le dossier d’import', '{n} éléments dans le dossier d’import') : undefined]
        .filter(Boolean)
        .join(' · ') || undefined,
      lead: t('Toutes les façons d’ajouter une table, au même endroit. Sur la borne : copiez les fichiers dans le dossier d’import (depuis une clé USB) ; sur un PC : choisissez-les, ou glissez-les sur cette fenêtre. Rien n’est installé avant que vous ayez validé le plan.'),
      sections,
      actions,
      back: () => openSystem(),
    };
  }

  /** « 4 fichiers de table déjà reçus » : ce que l'entonnoir peut reprendre sans rien télécharger. */
  function downloadsDetail(): string {
    const filter = tableFilter();
    const n = inventoryOf(false).filter((e) => filter.extensions.includes(path.extname(e.name).slice(1).toLowerCase())).length;
    return n ? tn(n, 'Téléchargements de Cyber Pinball : {n} fichier, sans le télécharger de nouveau', 'Téléchargements de Cyber Pinball : {n} fichiers, sans les télécharger de nouveau') : t('Téléchargements de Cyber Pinball : rien pour le moment');
  }

  function listImport(): string[] {
    try {
      return fs.readdirSync(layout()!.import).filter((n) => !n.startsWith('.'));
    } catch {
      return [];
    }
  }

  /**
   * Choisir des fichiers (ou un dossier) pour l'ajout, dans le sélecteur de Cyber Pinball : les
   * téléchargements de Cyber Pinball d'abord quand ils ont ce qu'il faut. `journey` : fichier
   * choisi pour une table à qui il manque quelque chose ; son parcours reprend après l'installation.
   */
  async function pick(kind: 'files' | 'folder' | 'downloads' | 'rom', journey?: string): Promise<void> {
    const request: Omit<PickRequest, 'done' | 'cancel'> =
      kind === 'folder'
        ? { title: t('Choisir un dossier'), icon: 'folder', purpose: t('Ajout d’une table'), mode: 'folder' }
        : kind === 'rom'
          ? { title: t('Choisir des ROM'), icon: 'chip', purpose: t('Ajout d’une ROM'), mode: 'files', filter: { label: t('ROM et archives'), extensions: ['zip', '7z', 'rar'] }, start: 'cp' }
          : { title: t('Choisir des fichiers'), icon: 'import', purpose: journey ? t('Ajout de ce qu’il manque à {table}', { table: find(journey)?.title ?? path.basename(journey) }) : t('Ajout d’une table'), mode: 'files-or-folder', filter: tableFilter(), start: kind === 'downloads' ? 'cp' : undefined };
    const paths = await pickPaths(request);
    if (paths?.length) startImport(paths, 'copy', undefined, journey, !journey);
  }

  /**
   * Point d'entrée de l'ajout : dossier d'import, sélection de fichiers, glisser-déposer,
   * fichiers reçus du catalogue. `journey` : ajout fait depuis le parcours d'une table, on y
   * revient après l'installation ; `fromHub` : « Annuler » revient à l'entonnoir.
   */
  function startImport(paths: string[], mode: 'move' | 'copy', acquisition?: AddPlan['acquisition'], journey?: string, fromHub = false, target?: string, back?: () => void): void {
    if (!layout()) return openAdd();
    const s: AddPlan = { kind: 'addPlan', mode, scripts: new Map(), existing: [], vpsChoices: new Map(), pupChoices: new Map(), romChoices: new Map(), cabinet: pupCabinet(loadCabinet(host.dataDir)), acquisition, journey, fromHub, target, back };
    go(s);
    void task(t('Analyse des fichiers…'), async () => {
      s.prepared = await prepareImport(paths, mode, path.join(host.dataDir, 'staging'));
      // Le script de chaque table dit quelle ROM lui revient.
      const exe = host.vpxExe();
      if (exe) {
        for (const vpx of s.prepared.sources.flatMap((src) => listVpx(src.path))) {
          busy = t('Lecture du script de {file}…', { file: path.basename(vpx) });
          host.broadcast();
          const facts = await readScript(exe, vpx, host.dataDir);
          if (!('error' in facts)) s.scripts.set(vpx.toLowerCase(), facts);
        }
        host.windows().get('playfield')?.focus();
      }
      s.existing = knownTables();
      if (s.prepared.sources.some((src) => listVpx(src.path).length)) s.vps = await vpsForImport();
      replan(s);
      // Récupéré depuis le catalogue : le jeu est celui qu'on a choisi, inutile de le redemander.
      if (acquisition && s.vps?.games.some((g) => g.id === acquisition.gameId)) {
        for (const t of s.plan?.tables ?? []) if (t.vps && !s.vpsChoices.has(t.vps.key)) s.vpsChoices.set(t.vps.key, acquisition.gameId);
        replan(s);
      }
      // Une ROM se lie dans toutes les tables qui la jouent : il faut connaître la ROM de chacune.
      if (s.plan?.roms.length && host.tables().some((t) => !samePath(t.folder, tablesDir()) && !cachedScript(t.file, host.dataDir))) {
        await readUnknownScripts();
        s.existing = knownTables();
        replan(s);
      }
      await planMedias(s);
      // Jeu incertain ou option de PuP-Pack à trancher : on demande d'abord.
      const first = pendingChoices(s)[0];
      if (first) {
        screen = choiceScreen(s, first);
        cursor = 0;
      } else cursor = planCursor(s);
    });
  }

  /** Jeux VPS des nouvelles tables du plan (une table, pas un complément) : ceux dont VPinMediaDB peut apporter les médias. */
  function planMediaIds(s: AddPlan): string[] {
    const ids = (s.plan?.tables ?? []).filter((tp) => tp.isNew && tp.steps.some((st) => st.kind === 'table')).map((tp) => tp.vps?.chosen?.game.id);
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
  }

  /**
   * Médias de VPinMediaDB pour les nouvelles tables du plan : ce que l'index a pour chaque
   * jeu et leur poids, montrés dans le plan et retenus d'office (installation « en un clic » :
   * la table, puis ses médias). Rien n'est téléchargé avant « Installer ».
   */
  async function planMedias(s: AddPlan): Promise<void> {
    const ids = planMediaIds(s).filter((id) => !s.medias?.games.has(id));
    if (!ids.length) return;
    busy = t('Médias de VPinMediaDB…');
    host.broadcast();
    const found = await mediaDownload.forGames(ids);
    s.medias = { wanted: s.medias?.wanted ?? true, games: new Map([...(s.medias?.games ?? []), ...found.games]), problem: found.problem };
  }

  /** Lignes du plan pour les médias de VPinMediaDB, et l'action qui les retient ou non. */
  function mediaPlanRows(s: AddPlan, actionIndex: number, choiceActions: Action[]): Row[] {
    const ids = planMediaIds(s);
    if (!s.medias || !ids.length) return [];
    const offers = ids.flatMap((id) => (s.medias!.games.get(id) ? [s.medias!.games.get(id)!] : []));
    if (!offers.length) {
      return [s.medias.problem ? { text: t('Médias de VPinMediaDB indisponibles'), detail: s.medias.problem, tone: 'quiet' } : { text: t('VPinMediaDB n’a pas de médias pour ce jeu'), detail: t('« Médias du jeu », sur la fiche, en propose d’autres sources.'), tone: 'quiet' }];
    }
    const wanted = s.medias.wanted;
    const rows: Row[] = offers.map((o) => ({
      text: mediaOffersLabel(o.offers),
      detail: [tn(o.offers.length, '{n} média', '{n} médias'), o.unknown ? t('{size} et plus', { size: formatSize(o.bytes) }) : formatSize(o.bytes), t('seulement ceux qui manquent, aucun n’est remplacé')].join(' · '),
      badges: [wanted ? t('oui') : t('non')],
      tone: wanted ? 'ok' : 'quiet',
      action: actionIndex,
    }));
    rows.push({ text: t('Aucune licence'), detail: mediaDbNotice(), tone: 'quiet' });
    choiceActions.push({
      icon: 'image-download',
      label: wanted ? t('Médias de VPinMediaDB : oui') : t('Médias de VPinMediaDB : non'),
      detail: wanted ? t('Start : non, la table seule') : t('Start : oui, après l’installation'),
      run: () => {
        s.medias!.wanted = !wanted;
        host.broadcast();
      },
    });
    return rows;
  }

  /** Nombre de médias que le plan téléchargera après l'installation. */
  function plannedMedias(s: AddPlan): number {
    if (!s.medias?.wanted) return 0;
    return planMediaIds(s).reduce((n, id) => n + (s.medias!.games.get(id)?.offers.length ?? 0), 0);
  }

  /** Tables installées dans leur dossier, une par dossier, avec ce que disent les scripts déjà lus. */
  function knownTables(): KnownTable[] {
    const existing = host
      .tables()
      .filter((t) => !samePath(t.folder, tablesDir()))
      .map((t): KnownTable => {
        const facts = cachedScript(t.file, host.dataDir);
        return {
          folder: t.folder,
          title: t.title,
          roms: facts?.roms ?? [],
          dmdFolder: facts?.dmdFolder,
          pupNames: expectedPackNames(facts),
          vpsId: knownVpsId(t.info),
          pupOff: facts?.pup?.disabledBy ? [t.file] : [],
        };
      });
    // Une table a une entrée par version : un seul dossier suffit.
    const unique = existing.filter((t, i) => existing.findIndex((o) => samePath(o.folder, t.folder)) === i);
    for (const t of unique) {
      const versions = existing.filter((o) => samePath(o.folder, t.folder));
      t.roms = [...new Set(versions.flatMap((o) => o.roms))];
      t.pupNames = [...new Set(versions.flatMap((o) => o.pupNames ?? []))];
      t.pupOff = versions.flatMap((o) => o.pupOff ?? []);
    }
    return unique;
  }

  function replan(s: AddPlan): void {
    s.plan = planImport(s.prepared!.sources, {
      tablesDir: tablesDir(),
      scripts: s.scripts,
      existing: s.existing,
      vps: s.vps,
      vpsChoices: s.vpsChoices,
      cabinet: s.cabinet,
      pupChoices: s.pupChoices,
      romLibrary: layout()!.roms,
      romChoices: s.romChoices,
      vpsGame: s.acquisition?.gameId,
      target: s.target,
    });
  }

  type Pending = { kind: 'vps' | 'pup'; key: string };

  /**
   * Ce que l'utilisateur doit encore trancher : jeu VPS incertain, option de
   * PuP-Pack incertaine ou dont un .bat n'a pas pu être lu.
   */
  function pendingChoices(s: AddPlan): Pending[] {
    const pending: Pending[] = [];
    for (const t of s.plan?.tables ?? []) {
      if (t.vps && !t.vps.confident && !t.vps.decided && t.vps.candidates.length) pending.push({ kind: 'vps', key: t.vps.key });
      for (const p of t.steps.flatMap((st) => (st.pack ? [st.pack] : []))) {
        if (!p.decided && p.variants.length > 1 && (!p.choice.confident || p.failedBats.length)) pending.push({ kind: 'pup', key: p.key });
      }
    }
    return pending;
  }

  function choiceScreen(s: AddPlan, pending: Pending): Screen {
    return pending.kind === 'vps' ? { kind: 'addChoice', plan: s, key: pending.key } : { kind: 'addPupChoice', plan: s, key: pending.key };
  }

  function packOf(s: AddPlan, key: string): { table: TablePlan; pack: PackPlan } | undefined {
    for (const table of s.plan?.tables ?? []) {
      const pack = table.steps.find((st) => st.pack?.key === key)?.pack;
      if (pack) return { table, pack };
    }
    return undefined;
  }

  /** Si l'import remplace un fichier existant, c'est « Annuler » qui est proposé d'abord. */
  function planCursor(s: AddPlan): number {
    const romReplaces = s.plan?.roms.some((r) => r.links.some((l) => l.state === 'different') || (!r.versions[r.keep]!.inLibrary && r.versions.some((v) => v.inLibrary)));
    return romReplaces || s.plan?.tables.some((t) => t.steps.some((st) => st.replaces && !st.isDir)) ? 1 : 0;
  }

  function buildChoice(c: Extract<Screen, { kind: 'addChoice' }>): Built {
    const s = c.plan;
    const back = () => go(s, planCursor(s));
    const tp = s.plan?.tables.find((x) => x.vps?.key === c.key);
    if (!tp?.vps) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au plan'), run: back }], back };
    const v = tp.vps;
    const decide = (choice: string | null) => {
      s.vpsChoices.set(v.key, choice);
      replan(s);
      const next = pendingChoices(s)[0];
      if (next) go(choiceScreen(s, next));
      else go(s, planCursor(s));
      // Un autre jeu : ses médias de VPinMediaDB.
      if (s.medias && planMediaIds(s).some((id) => !s.medias!.games.has(id))) void task(t('Médias de VPinMediaDB…'), () => planMedias(s));
    };
    const files = tp.steps.filter((st) => st.kind === 'table' || st.kind === 'backglass').map((st) => ({ text: st.source, badges: [KIND_LABELS[st.kind]] }));
    const chosenId = v.decided ? (v.chosen?.game.id ?? null) : undefined;
    const actions: Action[] = v.candidates.map((cand) => ({
      label: vpsLabel(cand.game),
      detail: [
        cand.score ? t('ressemblance {percent} %', { percent: Math.round(cand.score * 100) }) : undefined,
        cand.table ? t('table de {authors}', { authors: tableLabel(cand.table) }) : vpxCount(cand.game.tableFiles),
        cand.game.id === chosenId ? t('choix actuel') : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: cand.game.id === chosenId ? 'ok' : undefined,
      run: () => decide(cand.game.id),
    }));
    actions.push({
      label: t('Garder « {name} »', { name: v.fromFiles.folderName }),
      detail: chosenId === null ? t('Nom déduit des fichiers · choix actuel') : t('Nom déduit des fichiers, si le jeu n’est pas dans la liste'),
      tone: chosenId === null ? 'ok' : undefined,
      run: () => decide(null),
    });
    return {
      heading: t('Quel jeu est-ce ?'),
      subheading: tp.isNew ? undefined : t('Complément pour {folder}', { folder: path.relative(tablesDir(), tp.folder) }),
      lead: v.confident
        ? t('La base VPS (Virtual Pinball Spreadsheet) a reconnu ce jeu ; vous pouvez en choisir un autre. Le jeu choisi donne le nom du dossier et les informations de la table. Rien n’est installé avant « Installer ».')
        : t('La base VPS (Virtual Pinball Spreadsheet) propose plusieurs jeux pour ces fichiers. Le jeu choisi donne le nom du dossier et les informations de la table. Rien n’est installé avant « Installer ».'),
      sections: [{ title: t('Fichiers de la table'), rows: files }],
      actions,
      back,
    };
  }

  function buildPupChoice(c: Extract<Screen, { kind: 'addPupChoice' }>): Built {
    const s = c.plan;
    const back = () => go(s, planCursor(s));
    const found = packOf(s, c.key);
    if (!found) return { heading: t('PuP-Pack introuvable'), sections: [], actions: [{ label: t('Retour au plan'), run: back }], back };
    const { table, pack } = found;
    const decide = (label: string) => {
      s.pupChoices.set(pack.key, label);
      replan(s);
      const next = pendingChoices(s)[0];
      if (next) go(choiceScreen(s, next));
      else go(s, planCursor(s));
    };
    const proposed = pack.choice.chosen?.label;
    const actions: Action[] = pack.variants.map((v) => ({
      label: v.label,
      detail: [traitsLabel(v), v.label === proposed ? (pack.decided ? t('choix actuel') : t('proposée')) : undefined].filter(Boolean).join(' · '),
      tone: v.label === proposed ? 'ok' : undefined,
      run: () => decide(v.label),
    }));
    const rows: Row[] = pack.failedBats.map((b) => ({
      text: t('« {bat} » non reconnu', { bat: b.bat }),
      detail: t('{reason} : il n’est pas exécuté. Choisissez l’option parmi les dossiers trouvés dans le pack.', { reason: b.reason ?? '' }),
      tone: 'warning' as const,
    }));
    rows.push({
      text: s.cabinet ? t('Borne : {cabinet}', { cabinet: describePupCabinet(s.cabinet) }) : t('Borne non configurée'),
      detail: s.cabinet ? t('Option proposée d’après les écrans de la borne.') : t('Lancez l’assistant de configuration pour que l’option soit choisie d’office.'),
      tone: 'quiet',
    });
    return {
      heading: t('Quelle option du PuP-Pack ?'),
      subheading: `pupvideos\\${pack.name} · ${path.relative(tablesDir(), table.folder)}`,
      lead: t('Le pack propose plusieurs dispositions des écrans. Cyber Pinball recopie les fichiers de l’option choisie, comme le ferait son .bat, sans jamais l’exécuter ; l’option est retenue pour les mises à jour du pack. Rien n’est installé avant « Installer ».'),
      sections: [{ title: t('Pack'), rows }],
      actions,
      back,
    };
  }

  /** Lignes du plan qui détaillent un PuP-Pack, et l'action « Changer l'option ». */
  function packRows(s: AddPlan, pack: PackPlan, actionIndex: number, choiceActions: Action[]): Row[] {
    const rows: Row[] = [];
    if (pack.nameFrom === 'folder') {
      rows.push({ text: t('Nom du pack non vérifié : {folder}', { folder: `pupvideos\\${pack.name}` }), detail: t('Le script de la table n’a pas pu être lu : le pack garde le nom de son dossier. Le médecin le vérifiera.'), tone: 'warning' });
    } else if (pack.origin.toLowerCase() !== pack.name.toLowerCase()) {
      rows.push({ text: t('PuP-Pack renommé « {name} »', { name: pack.name }), detail: t('C’est le nom que charge la table ; « {origin} » n’aurait jamais été trouvé.', { origin: pack.origin }), tone: 'quiet' });
    }
    if (pack.flattened) rows.push({ text: t('Dossier en trop retiré'), detail: t('Le plugin PUP lit screens.pup à la racine du pack.'), tone: 'quiet' });
    if (pack.replaces) rows.push({ text: t('Remplace le pack installé'), detail: t('L’ancien dossier part entier à la corbeille : aucun mélange d’anciens et de nouveaux fichiers.'), tone: 'warning' });
    if (pack.variants.length) {
      const v = pack.choice.chosen!;
      const why = pack.decided
        ? t('choisie')
        : pack.choice.reason === 'remembered'
          ? t('reprise de l’installation précédente')
          : pack.choice.reason === 'only'
            ? t('seule option du pack')
            : pack.choice.reason === 'cabinet' && s.cabinet
              ? t('d’après la borne : {cabinet}', { cabinet: describePupCabinet(s.cabinet) })
              : t('à vérifier : borne non configurée');
      const sure = pack.decided || (pack.choice.confident && !pack.failedBats.length);
      const copied = tn(v.copies.length, '{n} fichier recopié, aucun .bat exécuté', '{n} fichiers recopiés, aucun .bat exécuté');
      const row: Row = { text: t('Option du pack : {option}', { option: v.label }), detail: `${pack.decided ? t('choisie dans la liste') : why} · ${copied}`, badges: [sure ? (pack.decided ? t('choisie') : t('d’office')) : t('à vérifier')], tone: sure ? 'ok' : 'warning' };
      if (pack.variants.length > 1) {
        row.action = actionIndex;
        choiceActions.push({ label: t('Changer l’option du PuP-Pack'), detail: pack.name, run: () => go({ kind: 'addPupChoice', plan: s, key: pack.key }, Math.max(0, pack.variants.indexOf(v))) });
      }
      rows.push(row);
    }
    for (const b of pack.failedBats) rows.push({ text: t('« {bat} » non reconnu', { bat: b.bat }), detail: t('{reason} : jamais exécuté. Options proposées d’après les dossiers du pack.', { reason: b.reason ?? '' }), tone: 'warning' });
    if (pack.noPupFiles) rows.push({ text: t('Pack sans fichier .pup'), detail: t('C’est le script de la table qui le pilote.'), tone: 'quiet' });
    if (pack.junk.length) rows.push({ text: tn(pack.junk.length, '{n} fichier inutile retiré', '{n} fichiers inutiles retirés'), detail: t('._*, .DS_Store, MP4 vides'), tone: 'quiet' });
    return rows;
  }

  function buildAddPlan(s: AddPlan): Built {
    const cancel = () => {
      if (s.prepared) fs.rmSync(s.prepared.staging, { recursive: true, force: true });
      if (s.back) s.back();
      else if (s.journey && find(s.journey)) journeyUi.open(s.journey);
      else if (s.mode === 'move' || s.fromHub || s.acquisition) go({ kind: 'addSource' });
      else leave();
    };
    const sections: Section[] = [];
    const plan = s.plan;
    // Après « Installer » et « Annuler » : changer le jeu VPS d'une table.
    const choiceActions: Action[] = [];
    for (const error of s.prepared?.errors ?? []) sections.push({ rows: [{ text: error, tone: 'error' }] });
    if (plan && !s.vps && plan.tables.some((t) => t.steps.some((st) => st.kind === 'table'))) {
      sections.push({ rows: [{ text: t('Base VPS indisponible : noms déduits des fichiers'), detail: vpsProblem ? t('Téléchargement impossible ({problem}). Elle sera téléchargée au prochain ajout.', { problem: vpsProblem }) : undefined, tone: 'quiet' }] });
    }
    for (const tp of plan?.tables ?? []) {
      const rows: Row[] = [];
      const vpsRow = tp.vps && vpsPlanRow(tp);
      if (vpsRow) {
        rows.push(vpsRow);
        if (tp.vps!.candidates.length) {
          vpsRow.action = 2 + choiceActions.length;
          const chosen = tp.vps!.candidates.findIndex((c) => c.game.id === tp.vps!.chosen?.game.id);
          const key = tp.vps!.key;
          choiceActions.push({
            label: tp.vps!.chosen ? t('Changer le jeu') : t('Choisir le jeu'),
            detail: path.basename(tp.folder),
            run: () => go({ kind: 'addChoice', plan: s, key }, chosen >= 0 ? chosen : tp.vps!.decided ? tp.vps!.candidates.length : 0),
          });
        }
      }
      for (const step of tp.steps) {
        // Média reconnu : son libellé (Logo, Fronton…) plutôt que « Médias du frontend ».
        const badges = [step.media ? mediaTypeInfo(step.media.type).label : KIND_LABELS[step.kind]];
        if (step.renamed) badges.push(t('renommé'));
        if (step.replaces) badges.push(step.pack ? t('remplace l’existant') : step.isDir ? t('complète l’existant') : t('remplace l’existant'));
        rows.push({ text: step.source, detail: `→ ${step.target}`, badges, tone: step.replaces && (!step.isDir || step.pack) ? 'warning' : undefined });
        if (step.pack) rows.push(...packRows(s, step.pack, 2 + choiceActions.length, choiceActions));
      }
      const authors = tp.info.Info?.Authors?.length ? ` · ${shortList(tp.info.Info.Authors)}` : '';
      rows.push({ text: t('Informations'), detail: `→ ${path.basename(tp.infoFile)} (${[tp.info.Info?.Title, tp.info.Info?.Manufacturer, tp.info.Info?.Year].filter(Boolean).join(', ')}${authors})`, badges: ['.info'] });
      for (const w of tp.warnings) rows.push({ text: w, tone: 'warning' });
      const shown = rows.slice(0, 16);
      sections.push({
        title: tp.isNew ? t('Nouvelle table : {folder}', { folder: path.relative(tablesDir(), tp.folder) }) : t('Complément pour : {folder}', { folder: path.relative(tablesDir(), tp.folder) }),
        rows: shown,
        more: rows.length - shown.length,
      });
    }
    const mediaRows = mediaPlanRows(s, 2 + choiceActions.length, choiceActions);
    if (mediaRows.length) sections.push({ title: t('Médias de VPinMediaDB, après l’installation'), rows: mediaRows });
    if (plan?.roms.length) {
      const rows = plan.roms.flatMap((r) => romPlanRows(s, r, () => 2 + choiceActions.length, choiceActions));
      const shown = rows.slice(0, 16);
      sections.push({ title: t('ROM → bibliothèque ({dir})', { dir: layout()!.roms }), rows: shown, more: rows.length - shown.length });
    }
    if (plan?.leftovers.length) sections.push({ title: t('Non importé'), rows: plan.leftovers.map((l) => ({ text: l.source, detail: l.reason, tone: 'quiet' })) });
    if (plan?.ignored.length) sections.push({ rows: [{ text: tn(plan.ignored.length, '{n} fichier ignoré (rapports de plantage, cache…)', '{n} fichiers ignorés (rapports de plantage, cache…)'), tone: 'quiet' }] });

    const tableCount = plan?.tables.length ?? 0;
    const romCount = plan?.roms.length ?? 0;
    const count = tableCount + romCount;
    const mediaCount = count ? plannedMedias(s) : 0;
    const what = [
      tableCount > 1 || (tableCount && (romCount || mediaCount)) ? tn(tableCount, '{n} table', '{n} tables') : '',
      romCount ? t('{n} ROM', { n: formatNumber(romCount) }) : '',
      mediaCount ? tn(mediaCount, '{n} média', '{n} médias') : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const actions: Action[] = count
      ? [
          { label: t('Installer'), detail: what || undefined, tone: 'ok', run: () => install(s) },
          { label: t('Annuler'), run: cancel },
          ...choiceActions,
        ]
      : [{ label: t('Retour'), run: cancel }];
    return {
      heading: count ? t('Plan d’installation') : t('Rien à installer'),
      subheading: s.acquisition?.quick && count ? t('Installation rapide : vérifiez, puis « Installer »') : undefined,
      lead: !plan
        ? undefined
        : count
          ? s.mode === 'move'
            ? t('Les fichiers quittent le dossier d’import ; les archives déballées et les fichiers remplacés vont à la corbeille.')
            : t('Les fichiers sont copiés : vos fichiers d’origine ne sont pas modifiés. Les fichiers remplacés vont à la corbeille.')
          : t('Aucune table (.vpx) ni complément reconnu dans cette sélection.'),
      sections,
      actions,
      back: cancel,
    };
  }

  /** Lignes du plan pour une ROM : ce qui entre dans la bibliothèque, les tables liées, la version gardée. */
  function romPlanRows(s: AddPlan, r: RomImport, nextAction: () => number, choiceActions: Action[]): Row[] {
    const kept = r.versions[r.keep]!;
    const stored = r.versions.find((v) => v.inLibrary);
    const incoming = r.versions.filter((v) => !v.inLibrary).length + r.unused.length > 0;
    const status = !kept.inLibrary
      ? stored
        ? t('remplace celle de la bibliothèque')
        : t('entre dans la bibliothèque')
      : !incoming
        ? t('déjà dans la bibliothèque')
        : r.versions.length > 1
          ? t('version de la bibliothèque gardée')
          : t('identique à celle de la bibliothèque');
    const rows: Row[] = [
      {
        text: kept.inLibrary ? r.name : kept.label,
        detail: `→ ${path.relative(layout()!.root, r.to)} · ${formatSize(kept.size)}`,
        badges: ['ROM', status],
        tone: !kept.inLibrary && stored ? 'warning' : undefined,
      },
    ];
    // ROM reconnue d'après son contenu : dans un sous-dossier (refaite à plat), ou sous un autre nom.
    const rom = r.name.replace(/\.zip$/i, '');
    for (const rec of r.recognized) {
      const same = rec.hash === kept.hash;
      if (!same) continue;
      const stored = kept.inLibrary ? t('Même contenu que la ROM de la bibliothèque, qui reste en place.') : undefined;
      if (rec.folder) {
        rows.push({
          text: t('ROM {rom} reconnue dans le dossier « {folder} »', { rom, folder: rec.folder }),
          detail: stored ?? t('Rangée dans la bibliothèque, refaite à plat : PinMAME ne lit que les fichiers à la racine du zip.'),
          tone: 'ok',
        });
      }
      if (rec.renamedFrom) {
        rows.push({
          text: t('ROM {rom} reconnue dans « {from} »', { rom, from: rec.renamedFrom }),
          detail: stored ?? t('Rangée sous le nom {name}, celui que la table demande à PinMAME.', { name: r.name }),
          tone: 'ok',
        });
      }
    }
    const states = { new: t('liée'), copy: t('copie remplacée par un lien'), different: t('autre version remplacée'), linked: t('déjà liée') } as const;
    const links = r.links.map((l) => `${path.basename(l.folder)} (${states[l.state]}${l.copy ? t(', copie : autre disque') : ''})`);
    rows.push(
      links.length
        ? { text: tn(r.links.length, 'Liée dans {n} table', 'Liée dans {n} tables'), detail: links.join(' · '), tone: 'quiet' }
        : { text: t('Aucune table installée ne la demande encore'), detail: t('Rangée dans la bibliothèque : elle sera liée à l’ajout de sa table.'), tone: 'quiet' },
    );
    if (r.versions.length > 1) {
      const label = (v: RomImport['versions'][number]) => `${v.inLibrary ? t('celle de la bibliothèque') : t('l’importée ({name})', { name: v.label })}, ${formatDate(v.mtimeMs)}, ${formatSize(v.size)}`;
      const next = r.versions[(r.keep + 1) % r.versions.length]!;
      rows.push({
        text: t('{n} versions différentes de {name}', { n: r.versions.length, name: r.name }),
        detail: t('Gardée : {kept} ({why}). L’autre va à la corbeille.', { kept: label(kept), why: r.decided ? t('choisie') : t('la plus récente') }),
        badges: [r.decided ? t('choisie') : t('la plus récente')],
        tone: 'warning',
        action: nextAction(),
      });
      choiceActions.push({
        label: next.inLibrary ? t('Garder la ROM de la bibliothèque') : t('Garder la ROM importée'),
        detail: r.name,
        run: () => {
          s.romChoices.set(r.key, next.hash);
          replan(s);
          host.broadcast();
        },
      });
    }
    return rows;
  }

  /** Ligne « Base VPS » d'une table du plan : jeu retenu, à choisir, ou absent. */
  function vpsPlanRow(table: TablePlan): Row {
    const v = table.vps!;
    if (v.chosen) {
      return {
        text: t('Base VPS : {game}', { game: vpsLabel(v.chosen.game) }),
        detail: v.chosen.table ? t('Table de {authors}', { authors: tableLabel(v.chosen.table) }) : undefined,
        badges: [v.decided ? t('choisi') : t('sûr à {percent} %', { percent: Math.round(v.chosen.score * 100) })],
        tone: 'ok',
      };
    }
    if (!v.candidates.length) return { text: t('Base VPS : jeu absent'), detail: t('Nom déduit des fichiers'), tone: 'quiet' };
    return {
      text: v.decided ? t('Base VPS : nom déduit des fichiers') : t('Base VPS : jeu incertain'),
      detail: v.decided ? t('Choisi à la place des propositions de la base') : tn(v.candidates.length, '{n} proposition ; sans choix, le nom est déduit des fichiers', '{n} propositions ; sans choix, le nom est déduit des fichiers'),
      badges: [v.decided ? t('choisi') : t('à choisir')],
      tone: v.decided ? 'quiet' : 'warning',
    };
  }

  function install(s: AddPlan): void {
    const plan = s.plan!;
    const prepared = s.prepared!;
    void task(t('Installation…'), async () => {
      const trashDir = trashDirFor(layout()!.trash, 'Remplacé à l’import'); // i18n-ignore : nom de dossier
      const cleanupRoots = [layout()!.import, prepared.staging];
      const checked: string[] = [];
      for (const t of plan.tables) {
        applyImport(t, { trashDir, cleanupRoots });
        for (const step of t.steps.filter((st) => st.kind === 'table')) {
          const facts = s.scripts.get(step.from.toLowerCase());
          if (facts) rememberScript(step.to, facts, host.dataDir);
          checked.push(step.to);
        }
        if (!t.steps.some((st) => st.kind === 'table')) {
          const first = host.tables().find((e) => samePath(e.folder, t.folder));
          if (first) checked.push(first.file);
        }
      }
      // Les ROM, une fois les dossiers des nouvelles tables créés : bibliothèque, puis liens.
      for (const r of plan.roms) {
        applyRomImport(r, { trashDir, cleanupRoots });
        for (const link of r.links) {
          if (link.state === 'linked' || checked.some((f) => samePath(path.dirname(f), link.folder))) continue;
          const first = host.tables().find((e) => samePath(e.folder, link.folder));
          if (first) checked.push(first.file);
        }
      }
      for (const archive of prepared.archives) if (archive.mode === 'move' && fs.existsSync(archive.path)) moveToTrash(archive.path, { trashDir });
      fs.rmSync(prepared.staging, { recursive: true, force: true });
      host.reload(checked[0]);
      // Les réparations des PuP-Packs que le menu fait avant chaque partie (PUP_PLAY_REPAIRS), faites
      // dès l'installation : pack renommé et lancé, option, images nommées comme des vidéos…
      const borne = pupCabinet(loadCabinet(host.dataDir));
      for (const file of checked) {
        const table = find(file);
        if (!table) continue;
        try {
          repairPupForPlay(table, { tablesDir: layout()!.tables, script: cachedScript(file, host.dataDir), cabinet: borne }, { trashDir });
        } catch (error) {
          console.log(`PuP-Pack (${table.id}) : réparation à l'installation impossible (${(error as Error).message}).`); // i18n-ignore : journal
        }
      }
      if (s.acquisition) noteSource(s.acquisition, checked);
      // Puis les médias de VPinMediaDB retenus dans le plan : ceux qui manquent aux nouvelles tables.
      const added: Row[] = [];
      if (plannedMedias(s)) {
        busy = t('Médias de VPinMediaDB…');
        host.broadcast();
        const got = await mediaDownload.fillMissing(checked);
        if (got.installed) added.push({ text: tn(got.installed, '{n} média de VPinMediaDB rangé', '{n} médias de VPinMediaDB rangés'), detail: t('{size} · source notée dans le .info de la table', { size: formatSize(got.bytes) }), tone: 'ok' });
        if (got.failed.length) added.push({ text: t('Médias non téléchargés (rien n’a été laissé)'), detail: got.failed.join(' · '), tone: 'warning' });
      }
      // Depuis le parcours d'une table : on y revient, il revérifie la table.
      if (s.journey && find(s.journey)) return journeyUi.open(s.journey, { text: t('Installé. La table est revérifiée.'), tone: 'ok' });
      const [first, ...rest] = checked;
      if (first) openDoctor(first, rest, true, added);
      else leave();
    });
  }

  /**
   * Après l'installation de fichiers récupérés depuis le catalogue : provenance dans le
   * .info de chaque table du jeu (CyberPinball.source : jeu et fichier VPS, version,
   * date), pour les mises à jour ; éléments de la liste d'attente marqués installés.
   */
  function noteSource(acquisition: NonNullable<AddPlan['acquisition']>, files: string[]): void {
    const table = acquisition.items.find((i) => i.kind === 'table');
    if (table) {
      for (const file of files) {
        const entry = find(file);
        if (!entry || (entry.info.Info?.VPSId && entry.info.Info.VPSId !== acquisition.gameId)) continue;
        const infoFile = infoFileFor(entry, tablesDir());
        const info = readInfo(infoFile);
        const next = setTableSource(info, {
          origin: 'VPS',
          vpsGameId: acquisition.gameId,
          vpsFileId: table.fileId,
          version: table.version,
          authors: table.authors,
          updatedAt: table.updatedAt,
          page: table.page,
          installedAt: new Date().toISOString(),
        });
        applyOps([{ op: 'write', path: infoFile, content: JSON.stringify(next, null, 2) + '\n' }], { trashDir: trashDirFor(layout()!.trash, 'Remplacé à l’import') }); // i18n-ignore : nom de dossier
      }
      host.reload(files[0]);
    }
    catalogUi.installed(acquisition.items);
  }

  // ---------- Touches et souris ----------

  function handleKey(input: Input): boolean {
    if (!screen) return false;
    if (busy) return true;
    const KEYS = host.keys();
    const is = (group: string[]) => group.includes(input.code);
    if ((screen.kind === 'edit' || screen.kind === 'prompt') && screen.editor) {
      editorKey(screen, input);
      host.broadcast();
      return true;
    }
    if (screen.kind === 'pages') return pagesKey(screen, input);
    const built = build();
    const n = built.actions.length;
    const ids = actionIds(built.actions);
    // Start valide l'élément que la dernière vue montrait sous le curseur, même si la liste a bougé.
    cursor = followCursor(ids, cursor, screen, anchor);
    const zones = screenZones(built, n);
    // MagnaSave (F6) : la bascule attend le relâchement ; une autre touche entre-temps l'annule.
    if (zones && (host.zoneKeys?.() ?? []).includes(input.code)) {
      if (!input.isAutoRepeat) zonePress = input.code;
      return true;
    }
    zonePress = undefined;
    const moving = is(KEYS.previous) || is(KEYS.next);
    if (!moving || !input.isAutoRepeat || hold?.code !== input.code) hold = moving && !input.isAutoRepeat ? { code: input.code, since: Date.now(), jumped: 0 } : undefined;
    zoneMemory.letter = undefined;
    // Tab / Maj+Tab : se déplacer au clavier quels que soient les boutons relevés.
    if (input.code === CONFIG_KEY) cursor = zoneStep(zones, n, cursor, input.shift ? -1 : 1);
    else if (moving) {
      const dir = is(KEYS.previous) ? -1 : 1;
      // Flipper tenu sur un écran à zones : il reste dans la sienne, s'arrête à son bout, puis accélère (par lettre sur une liste triée par nom).
      if (zones && hold && input.isAutoRepeat) {
        const now = Date.now();
        const moved = holdMove(zones, built.actions.map((a) => a.label), cursor, dir, now - hold.since, now - hold.jumped);
        if (moved.letter !== undefined) {
          if (moved.cursor !== cursor) hold.jumped = now;
          zoneMemory.letter = moved.letter;
        }
        cursor = moved.cursor;
      } else cursor = zoneStep(zones, n, cursor, dir);
    } else if (is(KEYS.confirm)) void built.actions[cursor]?.run();
    // Exit dans la liste de contenu : retour aux actions de l'écran ; Exit dans les actions : l'écran se ferme.
    else if (is(KEYS.exit)) {
      if (zones && zoneOf(zones, cursor) === 'list') cursor = leaveList(zones, ids, zonesMemory(), backIndex(built));
      else built.back();
    } else {
      // Raccourci d'une entrée (affiché à droite de son libellé) : elle, sans s'y déplacer.
      const hit = built.actions.find((a) => a.shortcut?.matches(input));
      if (!hit) return false;
      void hit.run();
    }
    host.broadcast();
    return true;
  }

  /** Touche relâchée : la bascule de MagnaSave (F6), et la fin d'un flipper tenu (l'initiale montrée s'efface). */
  function handleKeyUp(input: Input): void {
    if (!screen || busy) return;
    if (hold?.code === input.code) {
      hold = undefined;
      if (zoneMemory.letter !== undefined) {
        zoneMemory.letter = undefined;
        host.broadcast();
      }
    }
    if (zonePress !== input.code) return;
    zonePress = undefined;
    handleAction({ type: 'zone' });
  }

  /** Mémoire des zones de l'écran affiché : oubliée quand un autre écran s'ouvre. */
  function zonesMemory(): ZoneMemory {
    if (zoneMemory.screen !== screen) zoneMemory = { screen, memory: {} };
    return zoneMemory.memory;
  }

  /** Rang de l'action qui fait la même chose qu'Exit (« Retour », « Annuler »…), s'il y en a une. */
  function backIndex(built: Built): number | undefined {
    const at = built.actions.findIndex((a) => a.run === built.back);
    return at >= 0 ? at : undefined;
  }

  /**
   * Repère de la liste de contenu pour le rendu : où est le choix, et ce que font Exit et MagnaSave.
   * `listCursor` : l'élément de la liste où l'on est, ou celui où MagnaSave ramènera (le détail
   * d'une galerie reste le sien sur les actions de l'écran).
   */
  function zoneView(zones: Zones | undefined, ids: (string | undefined)[]) {
    if (!zones) return undefined;
    const active = zoneOf(zones, cursor);
    return {
      active,
      listCursor: active === 'list' ? cursor : enterList(zones, ids, zonesMemory()),
      position: active === 'list' ? zones.list.indexOf(cursor) + 1 : undefined,
      total: zones.list.length,
      letter: active === 'list' ? zoneMemory.letter : undefined,
      tag: active === 'list' ? { key: 'Exit', text: t('Sortir de la liste') } : { key: 'MagnaSave', text: t('Revenir à la liste') },
    };
  }

  function editorKey(s: EditorScreen, input: Input): void {
    const e = s.editor!;
    const KEYS = host.keys();
    const is = (group: string[]) => group.includes(input.code);
    // Caractère tapé sur un vrai clavier. Un bouton de la borne qui pilote le clavier
    // à l'écran (Start, sur 1 par défaut ; flippers) ne tape rien, sauf quand on a
    // commencé à taper ou qu'on l'obtient avec Maj (le 1 d'un clavier AZERTY).
    const char = input.key && input.key.length === 1 ? input.key : undefined;
    const button = [KEYS.previous[0], KEYS.next[0], KEYS.confirm[0]].includes(input.code);
    const typing = e.kind !== 'choice' && char !== undefined && (!button || ('typed' in e && Boolean(e.typed)) || Boolean(input.shift));
    if (is(KEYS.exit)) return closeEditor(s, false);
    if (e.kind === 'text') {
      if (typing) {
        e.value += char;
        e.typed = true;
      } else if (input.code === 'Backspace') e.value = e.value.slice(0, -1);
      else if (input.code === 'Enter' || input.code === 'NumpadEnter') closeEditor(s, true);
      else if (is(KEYS.previous) && !e.typed) e.cursor = (e.cursor - 1 + KEYBOARD.length) % KEYBOARD.length;
      else if (is(KEYS.next) && !e.typed) e.cursor = (e.cursor + 1) % KEYBOARD.length;
      else if (is(KEYS.confirm)) pressKey(s, e.cursor);
    } else if (e.kind === 'choice') {
      if (is(KEYS.previous)) e.cursor = (e.cursor - 1 + e.choices.length) % e.choices.length;
      else if (is(KEYS.next)) e.cursor = (e.cursor + 1) % e.choices.length;
      else if (is(KEYS.confirm)) chooseManufacturer(s as Extract<Screen, { kind: 'edit' }>, e.choices[e.cursor]!);
    } else {
      if (typing && /\d/.test(char!)) {
        e.typed = (e.typed + char).slice(-4);
        e.value = Number(e.typed);
      } else if (input.code === 'Backspace') {
        e.typed = e.typed.slice(0, -1);
        if (e.typed) e.value = Number(e.typed);
      } else if (input.code === 'Enter' || input.code === 'NumpadEnter') closeEditor(s, true);
      else if (is(KEYS.previous)) e.cursor = (e.cursor - 1 + NUMPAD.length) % NUMPAD.length;
      else if (is(KEYS.next)) e.cursor = (e.cursor + 1) % NUMPAD.length;
      else if (is(KEYS.confirm)) pressKey(s, e.cursor);
    }
  }

  function chooseManufacturer(s: Extract<Screen, { kind: 'edit' }>, choice: string): void {
    if (choice === otherManufacturer()) {
      s.editor = { kind: 'text', field: 'Manufacturer', label: t('Fabricant'), value: s.fields.Manufacturer, cursor: 0, shift: false, typed: false };
      return;
    }
    s.fields.Manufacturer = choice;
    closeEditor(s, false);
  }

  /** Touche du clavier à l'écran (bouton Start ou clic). */
  function pressKey(s: EditorScreen, index: number): void {
    const e = s.editor!;
    if (e.kind === 'choice') return chooseManufacturer(s as Extract<Screen, { kind: 'edit' }>, e.choices[index]!);
    if (e.kind === 'number') {
      e.cursor = index;
      const key = NUMPAD[index]!;
      if (key === 'OK') return closeEditor(s, true);
      if (key === 'Annuler') return closeEditor(s, false); // i18n-ignore : identifiant de touche
      if (key === '−' || key === '+') {
        e.value += key === '+' ? 1 : -1;
        e.typed = '';
      } else if (key === 'Effacer') {
        e.typed = e.typed.slice(0, -1);
        if (e.typed) e.value = Number(e.typed);
      } else {
        e.typed = (e.typed + key).slice(-4);
        e.value = Number(e.typed);
      }
      return;
    }
    e.cursor = index;
    const key = KEYBOARD[index]!;
    if (key === 'OK') return closeEditor(s, true);
    if (key === 'Annuler') return closeEditor(s, false); // i18n-ignore : identifiant de touche
    if (key === 'Effacer') e.value = e.value.slice(0, -1);
    else if (key === 'Maj') e.shift = !e.shift;
    else {
      const ch = key === 'Espace' ? ' ' : key;
      // Majuscule en début de mot, minuscule ailleurs ; Maj inverse pour un caractère.
      const wordStart = e.value === '' || e.value.endsWith(' ');
      e.value += wordStart !== e.shift ? ch.toUpperCase() : ch.toLowerCase();
      e.shift = false;
    }
  }

  function handleAction(action: UiAction): void {
    if (busy) return;
    if (action.type === 'drop') {
      if (!action.paths.length || !host.guest.knock('files.drop')) return;
      // Sur l'écran des médias d'un jeu, un fichier déposé est un média de ce jeu.
      const onScreen = screen ? build().drop : undefined;
      if (onScreen) onScreen(action.paths);
      else startImport(action.paths, 'copy');
      return;
    }
    if (!screen) return;
    if (action.type === 'editor' && (screen.kind === 'edit' || screen.kind === 'prompt') && screen.editor) {
      pressKey(screen, action.index);
      host.broadcast();
    } else if (action.type === 'back') {
      if ((screen.kind === 'edit' || screen.kind === 'prompt') && screen.editor) closeEditor(screen, false);
      else build().back();
      host.broadcast();
    } else if (action.type === 'zone') {
      if (screen.kind === 'pages' || ((screen.kind === 'edit' || screen.kind === 'prompt') && screen.editor)) return;
      const built = build();
      const zones = screenZones(built, built.actions.length);
      if (!zones) return;
      const ids = actionIds(built.actions);
      cursor = switchZone(zones, ids, followCursor(ids, cursor, screen, anchor), zonesMemory(), backIndex(built));
      host.broadcast();
    } else if (action.type === 'activate') {
      const built = build();
      // L'élément cliqué, où qu'il soit maintenant ; disparu entre-temps : rien, l'écran se redessine.
      const index = resolveActivation(actionIds(built.actions), action.index, action.id);
      if (index === undefined) return host.broadcast();
      cursor = index;
      host.broadcast();
      void built.actions[index]!.run();
    }
  }

  // ---------- Vue envoyée au rendu ----------

  function view() {
    if (!screen) return undefined;
    const built = build();
    const ids = actionIds(built.actions);
    cursor = followCursor(ids, cursor, screen, anchor);
    const zones = screenZones(built, built.actions.length);
    // Passage d'une zone à l'autre, par n'importe quel geste (flipper, MagnaSave, Exit, clic) : retenu pour y revenir.
    if (zones && anchor?.screen === screen && anchor.cursor < built.actions.length) {
      const memory = zonesMemory();
      zoneMemory.memory = rememberZones(zones, memory, { index: anchor.cursor, id: anchor.id }, cursor);
    }
    anchor = anchorOf(screen, cursor, ids, Boolean(busy));
    warnUnkeyed(built, ids);
    const zone = zoneView(zones, ids);
    soundPreview = playsSoundPreview(built.media);
    const editorView = (screen.kind === 'edit' || screen.kind === 'prompt') && screen.editor ? viewEditor(screen.editor) : undefined;
    // « Chercher sur le web… » n'a son icône que dans un menu à icônes : seule, elle décalerait tous les libellés.
    const iconMenu = built.actions.some((a) => a.icon && !a.web);
    return {
      screen: screen.kind,
      heading: built.heading,
      icon: built.icon ?? (TABLE_SCREENS.includes(screen.kind) ? undefined : section),
      subheading: built.subheading,
      lead: built.lead,
      sections: built.sections,
      back: backLabel(built),
      actions: built.actions.map(({ label, detail, tone, icon, web, attention, shortcut }, i) => ({ label, detail, tone, icon: web && !iconMenu ? undefined : icon, attention: attention || undefined, keys: shortcut?.keys.length ? shortcut.keys : undefined, id: ids[i] })),
      media: built.media,
      variant: built.variant,
      journey: built.journey,
      health: built.health,
      zone,
      cursor,
      busy,
      editor: editorView,
      pages: screen.kind === 'pages' ? pagesView(screen) : undefined,
      hint: screen.kind === 'pages'
        ? built.actions.length > 1
          ? t('Flippers : page précédente ou suivante · Start : page suivante · Exit : retour à la fiche')
          : t('Start ou Exit : retour à la fiche')
        : editorView
        ? editorView.kind === 'choice'
          ? t('Flippers : choisir · Start : valider · Exit : annuler')
          : t('Flippers : choisir une touche · Start : la taper · Exit : annuler · ou tapez au clavier, Entrée pour valider')
        : zone?.active === 'list'
          ? t('Flippers : parcourir, tenus pour aller vite · Start ou Entrée : valider · Exit ou Échap : sortir de la liste · MagnaSave ou F6 : actions de l’écran')
          : `${built.hint ?? t('Flippers ou Tab : choisir · Start ou Entrée : valider · Exit ou Échap : revenir · souris')}${zone ? ` · ${t('MagnaSave ou F6 : la liste')}` : ''}`,
    };
  }

  /**
   * Cartes sans identité (deux propositions au même libellé, sans clé) : le curseur ne
   * peut les suivre que par leur rang, et une liste qui bouge ferait valider une autre
   * carte (focus.ts). Signalé une fois par écran dans le journal, pour le corriger.
   */
  const unkeyedWarned = new Set<string>();
  function warnUnkeyed(built: Built, ids: (string | undefined)[]): void {
    const loose = (built.media?.cards ?? []).filter((c) => c.action !== undefined && ids[c.action] === undefined);
    if (!loose.length || unkeyedWarned.has(built.heading)) return;
    unkeyedWarned.add(built.heading);
    console.warn(`Écran « ${built.heading} » : ${loose.length} carte(s) sans identité (clé ou libellé unique) ; le curseur les suit par leur rang.`);
  }

  /**
   * Libellé du bouton de retour en tête d'écran : celui de l'action qui fait la même chose
   * qu'Exit (« Retour à la fiche », « Annuler »…), sinon « Retour ». Aucun quand cette action
   * est la seule de l'écran (un message à lire, « Continuer ») : elle est déjà sous la main.
   */
  function backLabel(built: Built): string | undefined {
    const same = built.actions.find((a) => a.run === built.back);
    if (same && built.actions.length === 1) return undefined;
    return same?.label ?? t('Retour');
  }

  function viewEditor(e: Editor) {
    if (e.kind === 'choice') return { kind: e.kind, label: e.label, keys: e.choices, cursor: e.cursor, value: undefined as string | undefined };
    if (e.kind === 'number') return { kind: e.kind, label: e.label, keys: NUMPAD.map(keyLabel), cursor: e.cursor, value: String(e.value) };
    const wordStart = e.value === '' || e.value.endsWith(' ');
    const upper = wordStart !== e.shift;
    const keys = KEYBOARD.map((k) => (k.length === 1 ? (upper ? k : k.toLowerCase()) : keyLabel(k)));
    // La touche Maj est repérée par son rang : son libellé suit la langue.
    return { kind: e.kind, label: e.label, keys, cursor: e.cursor, value: e.value, shift: e.shift, shiftKey: KEYBOARD.indexOf('Maj') };
  }

  // ---------- Mode sans opérateur ----------

  /**
   * Rejoue une suite d'étapes et capture le playfield après chacune, dans
   * CYBERPINBALL_CAPTURE, puis quitte. Étapes : un code de touche (ShiftRight,
   * Digit1, Escape…), « type:texte », « drag » (fichiers survolant la fenêtre : le
   * cadre de dépôt), « drop:chemin|chemin », « wait:ms », « click:sélecteur CSS »
   * (vrai clic de souris, qui passe par le rendu), et « action:libellé » (l'action de
   * l'écran affiché qui porte ce libellé, qui commence par lui ou le contient : une démonstration
   * ne dépend pas du rang des actions, qui change quand on en ajoute une), et
   * « until:phase » (attendre que le menu passe à cette phase, playing ou menu par
   * exemple, deux minutes au plus : une démonstration ne parie pas sur la durée des
   * étapes, qui varie avec le nombre d'écrans et leur définition), « copy:source|destination »
   * et « remove:chemin » (fichier posé ou retiré pendant que le menu tourne, comme à la main :
   * le guet des dossiers, mediawatch.ts, doit le faire voir sans redémarrer), « hold:code » et
   * « release:code » (bouton tenu puis relâché : combinaison de déverrouillage du mode invité ;
   * une touche simple est appuyée puis relâchée).
   * Le garde-fou de mise en page inspecte chaque écran, pas seulement le playfield.
   */
  async function autopilot(steps: string[], captureDir: string | undefined, pressKey: (input: Input) => void, phase: () => string): Promise<void> {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const playfield = host.windows().get('playfield');
    if (!playfield) return host.quit();
    if (playfield.webContents.isLoading()) await new Promise<void>((resolve) => playfield.webContents.once('did-finish-load', () => resolve()));
    await delay(1200);
    if (captureDir) fs.mkdirSync(captureDir, { recursive: true });
    const layout = new LayoutReport(captureDir);
    // Ce que joue le son du menu après chaque étape (fenêtres muettes hors écran : rien ne s'entend).
    const sounds: string[] = [];
    const send = (type: 'keyDown' | 'keyUp', code: string, k = '') => pressKey({ type, code, key: k, shift: false, control: false, alt: false, meta: false } as Input);
    const key = (code: string, k = '') => {
      send('keyDown', code, k);
      send('keyUp', code, k);
    };
    for (const [i, step] of ['depart', ...steps].entries()) {
      if (i > 0) {
        if (step.startsWith('type:')) for (const ch of step.slice(5)) key(ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`, ch);
        else if (step === 'drag') await dragEvent(playfield, 'dragover');
        // Retour au menu des tables d'un coup, d'où qu'on soit dans la gestion des tables (une liste à deux zones demande deux Exit).
        else if (step === 'leave') leave();
        else if (step.startsWith('drop:')) await dragEvent(playfield, 'dragleave').then(() => handleAction({ type: 'drop', paths: step.slice(5).split('|') }));
        else if (step.startsWith('wait:')) await delay(Number(step.slice(5)));
        else if (step.startsWith('until:')) {
          const wanted = step.slice(6);
          for (let waited = 0; phase() !== wanted && waited < 120_000; waited += 100) await delay(100);
          if (phase() !== wanted) console.log(`Autopilote : phase « ${wanted} » jamais atteinte (encore « ${phase()} » après deux minutes).`);
        }
        else if (step.startsWith('click:')) await click(playfield, step.slice(6));
        else if (step.startsWith('copy:')) {
          const [from, to] = step.slice(5).split('|') as [string, string];
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.copyFileSync(from, to);
        } else if (step.startsWith('remove:')) fs.rmSync(step.slice(7), { force: true });
        else if (step.startsWith('action:')) activateByLabel(step.slice(7));
        else if (step.startsWith('hold:')) send('keyDown', step.slice(5));
        else if (step.startsWith('release:')) send('keyUp', step.slice(8));
        else if (/^((Control|Shift|Alt)\+)+\w+$/.test(step)) {
          // Combinaison (« Control+Shift+KeyD ») : le raccourci tel que le clavier l'envoie.
          const parts = step.split('+');
          pressKey({ type: 'keyDown', code: parts.at(-1)!, key: '', control: parts.includes('Control'), shift: parts.includes('Shift'), alt: parts.includes('Alt'), meta: false } as Input);
        } else key(step);
      }
      await delay(150);
      for (let waited = 0; busy && waited < 120_000; waited += 100) await delay(100);
      await delay(400);
      const name = `${String(i).padStart(2, '0')}-${step.replace(/[^\w-]+/g, '_').slice(0, 40)}`;
      for (const [role, win] of host.windows()) {
        if (win === playfield || isShown(win)) await layout.check(win.webContents, win === playfield ? name : `${name} (${role})`);
      }
      if (!captureDir) continue;
      // Avec les sons de l'interface déjà joués (ui-sounds.js) : son, volume, fenêtre muette pendant la partie.
      const sound = await playfield.webContents
        .executeJavaScript('window.CyberMenuAudio && { ...window.CyberMenuAudio.status(), interface: window.CyberUiSounds?.status?.() }')
        .catch(() => undefined);
      if (sound) {
        // Et ce que montre chaque écran (couches de médias : élément, fichier, lecture).
        const screens: Record<string, unknown> = {};
        for (const [role, win] of host.windows()) {
          if (isShown(win)) screens[role] = await win.webContents.executeJavaScript('window.cyberEtat?.()').catch(() => undefined);
        }
        sounds.push(`${name} : ${JSON.stringify({ ...sound, ecrans: screens })}`);
      }
      fs.writeFileSync(path.join(captureDir, `${name}.png`), (await playfield.webContents.capturePage()).toPNG());
      // Les autres écrans à part (ecrans\), pour ne pas changer ce que comptent les démonstrations.
      for (const [role, win] of host.windows()) {
        if (win === playfield || !isShown(win)) continue;
        fs.mkdirSync(path.join(captureDir, 'ecrans'), { recursive: true });
        fs.writeFileSync(path.join(captureDir, 'ecrans', `${name}-${role}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    layout.save();
    if (captureDir && sounds.length) fs.writeFileSync(path.join(captureDir, 'son.txt'), `${sounds.join('\n')}\n`, 'utf8');
    host.quit();
  }

  /** Étape « action:libellé » de l'autopilote ; une action introuvable est signalée (les démonstrations la cherchent). */
  function activateByLabel(wanted: string): void {
    const actions = screen ? build().actions : [];
    // Les démonstrations nomment l'action en français (la clé du catalogue) : dans une
    // autre langue, on cherche aussi sa traduction, et celles des libellés qu'elle commence.
    const catalog = messagesOf(language());
    const names = [wanted, catalog[wanted]].filter((n): n is string => Boolean(n));
    const starts = Object.entries(catalog)
      .filter(([source]) => source !== wanted && source.startsWith(wanted))
      .map(([, text]) => text.split('{')[0]!)
      .filter(Boolean);
    const exact = actions.findIndex((a) => names.includes(a.label));
    const prefix = exact >= 0 ? exact : actions.findIndex((a) => names.some((n) => a.label.startsWith(n)));
    const start = prefix >= 0 ? prefix : actions.findIndex((a) => starts.some((n) => a.label.startsWith(n)));
    // Ou qui le contient : un libellé à virgule (« Médias, son et attente ») ne s'écrit pas en
    // entier, les étapes de CYBERPINBALL_AUTOPILOT étant séparées par des virgules.
    const index = start >= 0 ? start : actions.findIndex((a) => names.some((n) => a.label.includes(n)));
    // Entrée du menu système rangée dans une autre rubrique : on y va, comme on l'aurait ouverte
    // (les démonstrations nomment l'entrée, pas le chemin, qui change quand l'arbre change).
    if (index < 0 && screen?.kind === 'system') {
      const label = (id: SystemEntryId) => (isSystemGroup(id) ? systemEntry(id).label : (systemItems.get(id)?.label ?? systemEntry(id).label));
      const ids = [...SYSTEM_GROUP_IDS, ...SYSTEM_ITEM_IDS].filter((id) => isSystemGroup(id) || systemItems.has(id));
      const found = ids.find((id) => names.includes(label(id))) ?? ids.find((id) => names.some((n) => label(id).startsWith(n))) ?? ids.find((id) => names.some((n) => label(id).includes(n)));
      const trail = found && systemPathOf(found);
      if (found && trail) {
        systemChosen = found;
        openSystemGroup(trail.at(-1), found);
        return runSystemEntry(found);
      }
    }
    if (index < 0) return console.log(`Autopilote : aucune action « ${wanted} » sur cet écran (${actions.map((a) => a.label).join(' · ') || 'aucune action'}).`);
    handleAction({ type: 'activate', index });
  }

  return {
    provideSystemItem,
    /** Santé de la borne : premier relevé peu après le démarrage, puis toutes les 30 minutes, sauf pendant `quiet` (une partie). */
    watchHealth: (quiet?: () => boolean) => health.watch(quiet),
    /** Santé de la borne : relevé, page (essais). */
    health,
    openSystem,
    openSystemRoot,
    openCustom,
    openPrompt,
    openNotice,
    openSheet,
    openAdd,
    /** Opération longue : le message à l'écran, les touches ignorées (borne dédiée : l'autorisation de Windows). */
    task,
    /** Ferme la gestion des tables (une entrée du menu système qui affiche ensuite un message). */
    leave,
    handleKey,
    handleKeyUp,
    handleAction,
    view,
    autopilot,
    /** Catalogue et fenêtre « Récupérer » (démonstrations). */
    catalog: catalogUi,
    /** Enregistrement d'une partie : l'écran du retour (aperçu, utiliser pour la roue, garder, jeter). */
    recordingResult: (outcome: RecordingOutcome) => recording.result(outcome),
    /** Ce qu'il manque pour jouer : parcours d'une table (fiche, partie échouée, médecin). */
    openJourney: (file: string) => journeyUi.open(file),
    /** Médias reçus d'un ami : ceux de la table s'ouvrent, ces fichiers dans le brouillon (library-medias.ts). */
    openMediasWith: medias.openWith,
    /**
     * Table reçue d'un ami (friend-content.ts) : son dossier passe par le plan d'ajout, comme une
     * table téléchargée ; vers `table` quand on l'a déjà (les parties prises remplacent les nôtres).
     */
    installReceived: (dir: string, table?: TableEntry, back?: () => void) => startImport([dir], 'move', undefined, undefined, false, table?.folder, back),
    isActive: () => screen !== undefined,
    /** L'écran fait écouter des sons : la musique du menu se tait (un seul son à la fois). */
    previewsSound: () => screen !== undefined && soundPreview,
    /** Table dont parle l'écran ouvert (fiche, médias du jeu, fichiers, parcours…) : ses médias restent sur les écrans de la borne. */
    table: () => tableOf(screen),
    /** Une entrée du menu système attend l'utilisateur : pastille rouge sur la roue dentée. */
    attention: () => SYSTEM_ROOT_ENTRIES.some(systemAttention),
    /** L'écran décrit affiché est celui-ci (un transfert qui finit sous les yeux de l'utilisateur). */
    isShowing: (build: () => Built) => screen?.kind === 'custom' && screen.build === build,
    /** Gestionnaire de téléchargements : la file, son écran, et ce que les autres écrans y posent. */
    downloads: {
      manager: downloads,
      /** Le gestionnaire, depuis le menu des tables (pastille) : « Retour » y ramène. */
      open: (focus?: string) => {
        if (!host.guest.knock('menu.system')) return;
        const from = screen;
        systemChosen = 'downloads';
        systemReturn = from ? undefined : () => leave();
        openDownloads(focus);
      },
      /** La pastille du menu des tables ; undefined quand il n'y a rien à suivre. */
      pill: () => downloadsPill(summarize(downloads.jobs())),
      finisher: (kind: DownloadJobKind, fn: (job: DownloadJob) => boolean) => void downloadFinishers.set(kind, fn),
      deliverer: (kind: DownloadJobKind, fn: (job: DownloadJob) => boolean) => void downloadDeliverers.set(kind, fn),
      opener: (screenName: DownloadScreen, fn: (back: DownloadReturn) => void) => void returnOpeners.set(screenName, fn),
      friends: (f: { has(key: string): boolean; name(key: string): string | undefined }) => void (downloadFriends = f),
      setTransport: (kind: DownloadSourceKind, transport: DownloadTransport) => downloads.setTransport(kind, transport),
      /** « Revenir à… » d'un téléchargement (écran de transfert des amis). */
      deliver: (job: DownloadJob) => deliverDownload(job),
      /** L'écran où ramène un téléchargement (« Annuler » du plan d'ajout d'une table reçue). */
      openReturn: (back: DownloadReturn) => openReturn(back),
    },
  };
}

/** Clic de souris au centre de l'élément désigné, comme le ferait l'utilisateur. */
/** Vrai clic de souris au centre de l'élément (autopilote du menu et des réglages de VPX). */
export async function click(win: BrowserWindow, selector: string): Promise<void> {
  const center = (await win.webContents.executeJavaScript(
    // Une ligne hors de la vue (liste qui défile) y est d'abord ramenée, comme à la molette :
    // un geste, pas un défilement inattendu pour le garde-fou (scroll-keeper.js).
    `(() => { if (typeof CyberScroll === 'object') CyberScroll.gesture(); const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView({ block: 'nearest' }); const r = el?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`,
  )) as [number, number] | null;
  if (!center) {
    console.log(`Autopilote : aucun élément ne correspond à « ${selector} ».`);
    return;
  }
  const [x, y] = center.map(Math.round) as [number, number];
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
}

/** Événement de glisser-déposer dans le rendu (un vrai dépôt de fichiers ne se simule pas). */
async function dragEvent(win: BrowserWindow, type: 'dragover' | 'dragleave'): Promise<void> {
  await win.webContents.executeJavaScript(`document.dispatchEvent(new DragEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true }))`);
}

/** Contenu de vpinball.log, ou undefined s'il est illisible. */
function readLog(file: string | undefined): string | undefined {
  if (!file) return undefined;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** « topper · DMD séparé · 16:9 » : ce que vise une option de PuP-Pack (packages/core). */
const traitsLabel = variantTraitsLabel;

function scriptNote(script: ScriptResult | undefined): string | undefined {
  if (!script) return t('ROM non vérifiée : VPX n’est pas installé.');
  if ('error' in script) return undefined;
  if (!script.usesPinmame) return t('La table n’utilise pas de ROM.');
  return t('ROM {roms} présente.', { roms: formatList(script.roms, 'or') });
}

/** « G5k, VPW v1.25 (mod) » : version de la table d'après VPS. */
function tableLabel(table: VpsTableFile): string {
  const isMod = (table.features ?? []).some((f) => f.toUpperCase() === 'MOD');
  return [table.authors?.length ? shortList(table.authors) : undefined, table.version ? `v${table.version.replace(/^v/i, '')}` : undefined, isMod ? '(mod)' : undefined]
    .filter(Boolean)
    .join(' ');
}

/** « 12 tables VPX dans VPS » : aide à reconnaître le jeu le plus courant. */
function vpxCount(files: VpsTableFile[] | undefined): string {
  const n = (files ?? []).filter((f) => (f.tableFormat ?? 'VPX').toUpperCase() === 'VPX').length;
  return n ? tn(n, '{n} table VPX dans VPS', '{n} tables VPX dans VPS') : t('aucune table VPX dans VPS');
}

function shortList(names: string[], max = 3): string {
  return names.length > max ? `${names.slice(0, max).join(', ')}…` : names.join(', ');
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('{n} min', { n: minutes });
  return t('{h} h {m}', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
}

/** Le dossier DMD que charge le script est-il à côté de la table (casse ignorée) ? */
function dmdPresent(folder: string, dmdFolder: string): boolean {
  try {
    return fs.readdirSync(folder, { withFileTypes: true }).some((d) => d.isDirectory() && d.name.toLowerCase() === dmdFolder.toLowerCase());
  } catch {
    return false;
  }
}

function listVpx(p: string): string[] {
  try {
    if (!fs.statSync(p).isDirectory()) return p.toLowerCase().endsWith('.vpx') ? [p] : [];
    return fs
      .readdirSync(p, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.vpx'))
      .map((d) => path.join(d.parentPath, d.name));
  } catch {
    return [];
  }
}
