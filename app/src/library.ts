// Gestion des tables dans l'interface : fiche, modification des informations,
// médecin, suppression et ajout. Aucune manipulation de fichier pour l'utilisateur :
// chaque action montre d'abord ce qu'elle va faire, et ce qui est retiré ou
// remplacé part dans la corbeille de la racine.
// Pilotage aux boutons de la borne (flippers : choisir, Start : valider, Exit :
// revenir), au clavier ou à la souris (clics envoyés par le rendu).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { dialog, type BrowserWindow, type Input } from 'electron';
import {
  CONFIG_KEY,
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
  pupMemory,
  refreshVpsDb,
  removalTargets,
  romSpace,
  romsToTidy,
  sameFile,
  sameValue,
  savedValue,
  sheetPages,
  SHEET_PAGE_TYPES,
  stepViewValue,
  isViewAdjustChanged,
  viewAdjustInactive,
  viewChoices,
  samePath,
  scanRomLibrary,
  sizeOf,
  trashDirFor,
  unusedRoms,
  updateInfo,
  vpsLabel,
  ARCHIVE_EXT,
  type Finding,
  type ImportPlan,
  type KnownTable,
  type NavigationKeys,
  type PackPlan,
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
} from '@cyberpinball/core';
import { prepareImport, type PreparedImport } from './archives';
import { cachedScript, readScript, rememberScript, type ScriptResult } from './vbs';
import { LayoutReport } from './layout-check';
import { createCatalog } from './catalog';
import { createMediaDownload } from './media-download';
import { createMediaSearch } from './media-search';
import { createMediaImport } from './media-import';
import { createMedias, type MediaView } from './library-medias';
import { isShown, refuseOffscreen } from './offscreen';
import { iniTarget, openViewAdjust, refreshNotes, saveViewAdjust, writeTrialIni, type ViewAdjust } from './view-adjust';

const MANUFACTURERS = [
  'Williams', 'Bally', 'Gottlieb', 'Stern', 'Data East', 'Sega', 'Midway', 'Capcom', 'Atari', 'Zaccaria',
  'Premier', 'Alvin G.', 'Spooky', 'Jersey Jack', 'Chicago Gaming', 'American Pinball', 'Original',
];
const OTHER_MANUFACTURER = 'Autre (saisir le nom)…';

const KEYBOARD = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  'É', 'È', 'À', 'Ç', '-', "'", '&', '.', ':', '!', '?',
  'Espace', 'Effacer', 'Maj', 'OK', 'Annuler',
];
const NUMPAD = [...'0123456789', 'Effacer', '−', '+', 'OK', 'Annuler'];

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
   * Partie d'essai sur un autre .ini de table (« Ajuster la vue »), sans statistiques ;
   * undefined si elle n'a pas démarré pour une raison que le menu affiche (écrans à revoir).
   */
  tryTable?(table: TableEntry, tableIni: string): Promise<{ ok: boolean; message?: string } | undefined>;
  /** Journal de VPX (vpinball.log), lu par le médecin pour les PuP-Packs. */
  vpxLogFile?(): string | undefined;
  quit(): void;
  /** Touches des boutons de la borne (flippers, Start, Exit), avec celles d'un clavier. */
  keys(): NavigationKeys;
  windows(): Map<RoleId, BrowserWindow>;
  broadcast(): void;
  /** Dossier Téléchargements surveillé pour la liste d'attente (essais : un dossier du bac à sable). */
  downloadsDir?(): string;
}

/** Entrée du menu système (Exit dans le menu). La session des réglages peut y ajouter la sienne. */
export interface SystemItem {
  label: string;
  detail?: string;
  run: () => void;
}

export type UiAction =
  | { type: 'activate'; index: number }
  | { type: 'editor'; index: number }
  /** Choix d'un réglage de l'écran « Ajuster la vue ». */
  | { type: 'adjust'; index: number }
  | { type: 'drop'; paths: string[] }
  | { type: 'key'; code: string }
  /** Roue dentée du menu : menu et configuration, quels que soient les boutons. */
  | { type: 'config' }
  | { type: 'wheel'; offset: number };

export type Tone = 'error' | 'warning' | 'info' | 'ok' | 'quiet';
export interface Row {
  text: string;
  detail?: string;
  tone?: Tone;
  badges?: string[];
  /** Ligne rattachée à une action : surlignée quand l'action est choisie. */
  action?: number;
}
export interface Section {
  title?: string;
  rows: Row[];
  more?: number;
}
export interface Action {
  label: string;
  detail?: string;
  tone?: Tone;
  run: () => void | Promise<void>;
}
/** Écran décrit : titre, sections, actions (flippers pour choisir, Start pour valider) et retour (Exit). */
export interface Built {
  heading: string;
  subheading?: string;
  lead?: string;
  sections: Section[];
  actions: Action[];
  back: () => void;
  /** Cartes des médias d'un jeu, chacune rattachée à une action (library-medias.ts). */
  media?: MediaView;
  /** Fichiers glissés sur la fenêtre quand cet écran est affiché ; sans lui, c'est un ajout de table. */
  drop?: (paths: string[]) => void;
}

type Field = 'Title' | 'Manufacturer' | 'Year';
type Editor =
  /** Sans `field` : saisie libre d'un écran « prompt ». */
  | { kind: 'text'; field?: Field; label: string; value: string; cursor: number; shift: boolean; typed: boolean }
  | { kind: 'choice'; field: Field; label: string; choices: string[]; cursor: number }
  | { kind: 'number'; field: Field; label: string; value: number; typed: string; cursor: number };

type Screen =
  | { kind: 'system' }
  | { kind: 'sheet'; file: string; flash?: string }
  /** Prospectus ou règles de la table, page par page (flippers : page précédente ou suivante). */
  | { kind: 'pages'; file: string; type: SheetPageType; index: number }
  | { kind: 'edit'; file: string; fields: { Title: string; Manufacturer: string; Year?: number }; editor?: Editor }
  | { kind: 'doctor'; file: string; findings?: Finding[]; script?: ScriptResult; log: string[]; queue: string[]; afterImport: boolean }
  | { kind: 'remove'; file: string }
  /** « Ajuster la vue » : les flippers changent la valeur ; Exit ouvre le menu (`menu`) pour enregistrer, essayer ou annuler. */
  | { kind: 'view'; file: string; adjust: ViewAdjust; menu: boolean; notice?: { text: string; tone: Tone } }
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
      /** Fichiers récupérés depuis le catalogue : le jeu VPS est déjà choisi, la provenance notée après l'installation. */
      acquisition?: { gameId: string; items: WaitItem[] };
    }
  | { kind: 'addChoice'; plan: AddPlan; key: string }
  | { kind: 'addPupChoice'; plan: AddPlan; key: string }
  /** Bibliothèque de ROM : vue globale. */
  | { kind: 'roms'; scan?: RomLibraryScan }
  /** Rangement des ROM existantes dans la bibliothèque : plan à valider. */
  | { kind: 'romMigrate'; scan?: RomLibraryScan; choices: Map<string, string> }
  | { kind: 'notice'; heading: string; lines: string[]; then: () => void }
  /** Écran décrit hors de la gestion des tables (configurations de la borne), recalculé à chaque affichage. */
  | { kind: 'custom'; build: () => Built }
  /** Saisie d'un texte au clavier à l'écran ; `done` reçoit undefined à l'annulation. */
  | { kind: 'prompt'; heading: string; lead?: string; editor: Editor; done: (value: string | undefined) => void };

type EditorScreen = Extract<Screen, { kind: 'edit' | 'prompt' }>;

type AddPlan = Extract<Screen, { kind: 'addPlan' }>;
type ViewScreen = Extract<Screen, { kind: 'view' }>;
type PagesScreen = Extract<Screen, { kind: 'pages' }>;

export function createLibrary(host: LibraryHost) {
  let screen: Screen | undefined;
  let cursor = 0;
  // Opérations longues en cours (l'installation enchaîne sur l'analyse) et leur message.
  let busyCount = 0;
  let busy: string | undefined;
  const systemItems: SystemItem[] = [
    { label: 'Ajouter une table', detail: 'Depuis le dossier d’import, une clé USB ou ce PC', run: () => openAdd() },
    { label: 'Trouver une table (catalogue VPS)', detail: 'Chaque jeu, ses versions, ce qu’il faut pour cette borne ; vous récupérez les fichiers vous-même', run: () => catalogUi.open() },
    {
      label: 'Liste d’attente',
      get detail() {
        return `Tables et compléments récupérés : ${catalogUi.summary()}`;
      },
      run: () => catalogUi.openWaitList(),
    },
    { label: 'Mises à jour des tables', detail: 'Nouvelles versions des tables installées, d’après la base VPS', run: () => catalogUi.openUpdates() },
    { label: 'Comptes des sites', detail: 'vpuniverse.com, vpforums.org… : connexion gardée, téléchargement direct', run: () => catalogUi.openAccounts() },
    { label: 'Bibliothèque de ROM', detail: 'Chaque ROM, ses tables, sa taille ; inutilisées et absentes', run: () => openRoms() },
    { label: 'Ranger les ROM dans la bibliothèque', detail: 'Une seule copie par ROM, liée dans chaque table', run: () => openRomMigration() },
    { label: 'Reprendre les médias de PinUP Popper / PinballX', detail: 'Logos, vidéos, frontons… copiés dans chaque table', run: () => mediaImport.open() },
    { label: 'Médias manquants : chercher sur VPinMediaDB', detail: 'Logos, plateaux, frontons… téléchargés pour les tables à qui il en manque', run: () => mediaDownload.openMissing() },
    { label: 'Quitter Cyber Pinball', run: () => host.quit() },
  ];

  const layout = () => (host.root ? layoutOf(host.root) : undefined);
  const tablesDir = () => layout()?.tables ?? '';
  const find = (file: string) => host.tables().find((t) => samePath(t.file, file));
  const mediaImport = createMediaImport({
    tablesDir: () => layout()?.tables,
    trashRoot: () => layout()?.trash,
    tables: () => host.tables(),
    romsOf: (t) => cachedScript(t.file, host.dataDir)?.roms ?? [],
    vps: () => vpsForImport(),
    pickDirectory: async () => {
      const win = host.windows().get('playfield');
      const options: Electron.OpenDialogOptions = { title: 'Dossier de PinUP Popper ou de PinballX', properties: ['openDirectory'] };
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      win?.focus();
      return result.canceled ? undefined : result.filePaths[0];
    },
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
    busy = 'Téléchargement de la base VPS (environ 8 Mo, une seule fois)…';
    host.broadcast();
    await refreshVps();
    return load();
  }

  function go(next: Screen, at = 0): void {
    screen = next;
    cursor = at;
    host.enter();
    host.broadcast();
  }

  function leave(): void {
    screen = undefined;
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
      screen = { kind: 'notice', heading: 'Opération interrompue', lines: [err.message], then: leave };
      cursor = 0;
    } finally {
      if (--busyCount === 0) busy = undefined;
      host.broadcast();
    }
  }

  // ---------- Ouvertures ----------

  function openSystem(): void {
    go({ kind: 'system' });
  }

  /** Écran fourni par l'appelant (configurations de la borne) ; ses actions ouvrent les écrans suivants. */
  function openCustom(build: () => Built, at = 0): void {
    go({ kind: 'custom', build }, at);
  }

  /** Saisie d'un nom avec le clavier à l'écran (ou un vrai clavier). */
  function openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void {
    go({ kind: 'prompt', heading, lead, editor: { kind: 'text', label, value, cursor: 0, shift: false, typed: false }, done });
  }

  function openNotice(heading: string, lines: string[], then: () => void = leave): void {
    go({ kind: 'notice', heading, lines, then });
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
  const mediaSearch = createMediaSearch({ host, layout, tablesDir, progress, vps: () => vpsForImport() });

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
    openSystem: () => openSystem(),
    openNotice: (heading, lines, then) => openNotice(heading, lines, then),
    vps: () => vpsForImport(),
    search: mediaSearch,
    install: (paths, acquisition) => startImport(paths, 'copy', acquisition),
    downloadsDir: host.downloadsDir,
  });
  if (layout()) catalogUi.start();

  // Téléchargement depuis VPinMediaDB, depuis l'écran « Médias » ou le menu système.
  const mediaDownload = createMediaDownload({
    host,
    layout,
    tablesDir,
    find,
    openCustom: (build, at) => openCustom(build, at),
    openSystem: () => openSystem(),
    openNotice: (heading, lines, then) => openNotice(heading, lines, then),
    task: (message, work) => task(message, work),
    progress,
    cursor: () => cursor,
    search: mediaSearch,
    prompt: (heading, label, value, done, lead) => openPrompt(heading, label, value, done, lead),
  });

  // Écran « Médias » de la fiche : logo, fronton, vidéos, règles…
  const medias = createMedias({
    host,
    layout,
    tablesDir,
    find,
    show: (build, at) => openCustom(build, at),
    cursor: () => cursor,
    sheet: (table, flash) => openSheet(table, flash),
    leave: () => leave(),
    download: (table, back) => mediaDownload.openTable(table, back),
    proposals: {
      search: mediaSearch,
      task: (message, work) => task(message, work),
      progress,
      prompt: (heading, label, value, done, lead) => openPrompt(heading, label, value, done, lead),
      withNotice: (then, back) => mediaDownload.withNotice(then, back),
    },
  });

  function openAdd(): void {
    if (!layout()) {
      go({ kind: 'notice', heading: 'Cyber Pinball n’est pas installé', lines: ['Lancez « Installer » depuis le lanceur : il crée le dossier des tables et le dossier d’import.'], then: leave });
      return;
    }
    fs.mkdirSync(layout()!.import, { recursive: true });
    // La base VPS se met à jour pendant qu'on choisit les fichiers.
    void refreshVps();
    go({ kind: 'addSource' });
  }

  function openDoctor(file: string, queue: string[] = [], afterImport = false): void {
    go({ kind: 'doctor', file, log: [], queue, afterImport });
    void analyse();
  }

  async function analyse(): Promise<void> {
    if (screen?.kind !== 'doctor') return;
    const current = screen;
    await task('Analyse de la table…', async () => {
      const table = find(current.file);
      if (!table) throw new Error('Cette table n’existe plus.');
      const exe = host.vpxExe();
      const script = exe ? await readScript(exe, table.file, host.dataDir) : undefined;
      // Lire le script a pu faire passer une fenêtre de VPX devant le menu.
      host.windows().get('playfield')?.focus();
      current.script = script;
      current.findings = diagnose(table, {
        tablesDir: tablesDir(),
        script,
        logsDir: path.join(host.dataDir, 'logs'),
        cabinet: pupCabinet(loadCabinet(host.dataDir)),
        vpxLog: readLog(host.vpxLogFile?.()),
        otherPackNames: otherPackNames(table),
        romLibrary: layout()?.roms,
      });
      cursor = 0;
    });
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
    for (const [i, t] of unknown.entries()) {
      busy = `Lecture du script de ${path.basename(t.file)} (${i + 1}/${unknown.length})…`;
      host.broadcast();
      await readScript(exe, t.file, host.dataDir);
    }
    if (unknown.length) host.windows().get('playfield')?.focus();
  }

  function openRoms(): void {
    if (!layout()) return openAdd();
    const s: Extract<Screen, { kind: 'roms' }> = { kind: 'roms' };
    go(s);
    void task('Inventaire des ROM…', async () => {
      await readUnknownScripts();
      busy = 'Inventaire des ROM…';
      host.broadcast();
      s.scan = scanRomLibrary(layout()!.roms, romTables());
    });
  }

  function openRomMigration(): void {
    if (!layout()) return openAdd();
    const s: Extract<Screen, { kind: 'romMigrate' }> = { kind: 'romMigrate', choices: new Map() };
    go(s);
    void task('Recherche des ROM à ranger…', async () => {
      await readUnknownScripts();
      busy = 'Comparaison des ROM (empreintes)…';
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

  function build(): Built {
    switch (screen!.kind) {
      case 'system':
        return {
          heading: 'Menu et configuration',
          sections: [],
          actions: [...systemItems.map((i) => ({ label: i.label, detail: i.detail, run: i.run })), { label: 'Retour aux tables', run: leave }],
          back: leave,
        };
      case 'sheet':
        return buildSheet(screen as Extract<Screen, { kind: 'sheet' }>);
      case 'pages':
        return buildPages(screen as PagesScreen);
      case 'edit':
        return buildEdit(screen as Extract<Screen, { kind: 'edit' }>);
      case 'doctor':
        return buildDoctor(screen as Extract<Screen, { kind: 'doctor' }>);
      case 'remove':
        return buildRemove(screen as Extract<Screen, { kind: 'remove' }>);
      case 'view':
        return buildView(screen as ViewScreen);
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
        return { heading: s.heading, sections: [{ rows: s.lines.map((text) => ({ text })) }], actions: [{ label: 'Continuer', run: s.then }], back: s.then };
      }
      case 'custom':
        return (screen as Extract<Screen, { kind: 'custom' }>).build();
      case 'prompt': {
        const s = screen as Extract<Screen, { kind: 'prompt' }>;
        return { heading: s.heading, lead: s.lead, sections: [], actions: [{ label: 'Annuler', run: () => s.done(undefined) }], back: () => s.done(undefined) };
      }
    }
  }

  function buildSheet(s: Extract<Screen, { kind: 'sheet' }>): Built {
    const table = find(s.file);
    if (!table) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour au menu', run: leave }], back: leave };
    const own = !samePath(table.folder, tablesDir());
    const inv = inventory(table.file, own);
    const user = table.info.User ?? {};
    const stats: Row[] = [{ text: user.StartCount ? `Jouée ${user.StartCount} fois` : 'Jamais jouée' }];
    if (user.LastRun) stats.push({ text: `Dernière partie le ${new Date(user.LastRun).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}` });
    if (user.RunTime) stats.push({ text: `Temps de jeu : ${formatDuration(user.RunTime)}` });

    const script = cachedScript(table.file, host.dataDir);
    const romMissing = script?.usesPinmame && script.roms.length > 0 && !script.roms.some((r) => inv.roms.some((f) => f.toLowerCase() === `${r.toLowerCase()}.zip`));
    const list = (items: string[], none = 'aucun') => (items.length ? items.join(', ') : none);
    const files: Row[] = [
      { text: 'Table', detail: path.basename(table.file) + (inv.versions.length > 1 ? ` (${inv.versions.length} versions dans le dossier)` : ''), tone: 'ok' },
      { text: 'Backglass', detail: inv.backglass ?? (inv.strayBackglasses.length ? `mal nommé : ${inv.strayBackglasses[0]}` : 'aucun'), tone: inv.backglass ? 'ok' : inv.strayBackglasses.length ? 'warning' : 'quiet' },
      {
        text: 'ROM',
        detail: romMissing
          ? `${script!.roms[0]}.zip absente`
          : list(
              inv.roms.map((r) => {
                const name = r.replace(/\.zip$/i, '');
                const library = layout()?.roms;
                const linked = library && sameFile(path.join(table.folder, 'pinmame', 'roms', r), path.join(library, r));
                return linked ? `${name} (bibliothèque)` : name;
              }),
              script && !script.usesPinmame ? 'pas nécessaire' : 'aucune',
            ),
        tone: romMissing ? 'error' : inv.roms.length ? 'ok' : 'quiet',
      },
      ...(script?.dmdFolder
        ? [
            {
              text: 'Contenu du DMD',
              detail: dmdPresent(table.folder, script.dmdFolder) ? script.dmdFolder : `dossier ${script.dmdFolder} absent`,
              tone: dmdPresent(table.folder, script.dmdFolder) ? ('ok' as const) : ('error' as const),
            },
          ]
        : []),
      {
        text: 'Vidéos PuP',
        detail: list(inv.pup.map((p) => {
          const option = pupMemory(table.info, p)?.option;
          return option ? `${p} (${option})` : p;
        }), 'aucune'),
        tone: inv.pup.length ? 'ok' : 'quiet',
      },
      { text: 'Couleurs DMD', detail: list([...inv.serum.map((x) => `${x} (Serum)`), ...inv.vni.map((x) => `${x} (VNI)`)], 'aucune'), tone: inv.serum.length || inv.vni.length ? 'ok' : 'quiet' },
      { text: 'Sons alternatifs', detail: list(inv.altsound), tone: inv.altsound.length ? 'ok' : 'quiet' },
      { text: 'Musique', detail: inv.music ? `${inv.music} fichier${inv.music > 1 ? 's' : ''}` : 'aucune', tone: inv.music ? 'ok' : 'quiet' },
      { text: 'Réglages propres', detail: inv.tableIni ? 'oui' : 'non', tone: inv.tableIni ? 'ok' : 'quiet' },
      mediaRow(table),
    ];
    if (inv.scriptOverride) files.push({ text: 'Script remplacé', detail: 'un .vbs remplace le script de la table', tone: 'warning' });
    if (inv.crashReports.length) files.push({ text: 'Plantage', detail: `rapport laissé par VPX (${inv.crashReports.join(', ')})`, tone: 'warning' });

    return {
      heading: table.title,
      subheading: [table.manufacturer, table.year].filter(Boolean).join(' · ') || undefined,
      lead: s.flash ?? table.version,
      sections: [
        { title: 'Statistiques', rows: stats },
        { title: 'Fichiers', rows: files },
      ],
      actions: [
        {
          label: 'Jouer',
          run: () => {
            screen = undefined;
            host.play(table);
          },
        },
        ...SHEET_PAGE_TYPES.map((type) => pagesAction(table, type)),
        { label: 'Modifier les informations', detail: 'Titre, fabricant, année', run: () => openEdit(table) },
        { label: 'Médias du jeu', detail: 'Logo, fronton, vidéos, règles : ce que le menu montre', run: () => medias.open(table) },
        { label: 'Ajuster la vue', detail: 'Monter, descendre ou cadrer la table à l’écran', run: () => openView(table) },
        ...(host.tableSettings
          ? [{ label: 'Réglages de cette table', detail: 'Vue, son… pour cette table seulement', run: () => host.tableSettings!(table) }]
          : []),
        { label: 'Diagnostiquer et réparer', run: () => openDoctor(table.file) },
        { label: 'Supprimer la table', detail: 'Mise à la corbeille', tone: 'error', run: () => go({ kind: 'remove', file: table.file }) },
        { label: 'Retour au menu', run: leave },
      ],
      back: leave,
    };
  }

  // ---------- Prospectus et règles, page par page ----------

  const pagesOf = (table: TableEntry, type: SheetPageType) => sheetPages(table, host.root, host.dataDir, type);

  /** « Prospectus : 2 pages » ; sans fichier, ce que montre le repli. */
  function pagesAction(table: TableEntry, type: SheetPageType): Action {
    const n = pagesOf(table, type).length;
    return {
      label: mediaTypeInfo(type).label,
      detail: n ? `${n} page${n > 1 ? 's' : ''}` : type === 'GameInfo' ? 'Fiche générée : titre, fabricant, année' : 'Commandes de la partie',
      run: () => go({ kind: 'pages', file: table.file, type, index: 0 }),
    };
  }

  function buildPages(s: PagesScreen): Built {
    const table = find(s.file);
    const back = () => (table ? openSheet(table) : leave());
    if (!table) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour au menu', run: leave }], back };
    const count = Math.max(1, pagesOf(table, s.type).length);
    s.index = Math.min(s.index, count - 1);
    const turn = (step: number) => {
      s.index = (s.index + step + count) % count;
      host.broadcast();
    };
    const label = mediaTypeInfo(s.type).label;
    return {
      heading: table.title,
      subheading: count > 1 ? `${label} · page ${s.index + 1} sur ${count}` : label,
      sections: [],
      actions: [
        ...(count > 1 ? [{ label: '‹ Page précédente', run: () => turn(-1) }, { label: 'Page suivante ›', run: () => turn(1) }] : []),
        { label: 'Retour à la fiche', run: back },
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
      keys: s.type === 'GameHelp' ? gameKeys(loadCabinet(host.dataDir)?.buttons) : undefined,
    };
  }

  /** « Médias : 4 sur 11 fournis par le jeu ; replis pour les autres » */
  function mediaRow(table: TableEntry): Row {
    const own = layout() ? MANAGED_MEDIA_TYPES.filter((type) => ownMediaPages(table, host.root!, type).length).length : 0;
    return {
      text: 'Médias',
      detail: own ? `${own} sur ${MANAGED_MEDIA_TYPES.length} fournis par le jeu ; replis pour les autres` : 'aucun : le menu montre ses replis',
      tone: own ? 'ok' : 'quiet',
    };
  }

  // ---------- Ajuster la vue ----------

  function openView(table: TableEntry): void {
    const adjust = openViewAdjust(table);
    if ('problem' in adjust) return go({ kind: 'notice', heading: 'Ajuster la vue', lines: [adjust.problem], then: () => openSheet(table) });
    go({ kind: 'view', file: table.file, adjust, menu: false });
  }

  function buildView(s: ViewScreen): Built {
    const table = find(s.file);
    if (!table) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour au menu', run: leave }], back: leave };
    const changed = isViewAdjustChanged(s.adjust.items);
    const resume = () => {
      s.menu = false;
    };
    const actions: Action[] = s.menu
      ? [
          {
            label: 'Enregistrer pour cette table',
            detail: changed ? path.basename(s.adjust.location.writePath) : 'Rien n’a changé',
            tone: 'ok',
            run: () => saveView(s, table),
          },
          ...(host.tryTable && host.vpxExe()
            ? [{ label: 'Essayer sur la table', detail: 'Une partie avec ces valeurs, puis retour ici ; rien n’est enregistré', run: () => tryView(s, table) }]
            : []),
          { label: 'Revenir au réglage général', detail: 'Retire la vue propre à cette table', run: () => resetView(s, table) },
          { label: 'Continuer le réglage', run: resume },
          changed ? { label: 'Quitter sans enregistrer', tone: 'error', run: () => openSheet(table) } : { label: 'Retour à la fiche', run: () => openSheet(table) },
        ]
      : [];
    return {
      heading: 'Ajuster la vue',
      subheading: table.title,
      lead: 'Pour cette table seulement ; les autres gardent le réglage général.',
      sections: [],
      actions,
      back: s.menu
        ? resume
        : () => {
            s.menu = true;
            s.notice = undefined;
            cursor = 0;
          },
    };
  }

  function viewKey(s: ViewScreen, input: Input): boolean {
    const KEYS = host.keys();
    const is = (group: string[]) => group.includes(input.code);
    const adjust = s.adjust;
    // Flipper droit (ou flèche haut) : la valeur augmente, la table monte.
    const delta = is(KEYS.next) ? (input.code === 'ArrowDown' ? -1 : 1) : is(KEYS.previous) ? (input.code === 'ArrowUp' ? 1 : -1) : 0;
    if (delta) {
      const item = adjust.items[adjust.index]!;
      item.value = stepViewValue(item, delta);
      refreshNotes(adjust);
      s.notice = undefined;
    } else if (is(KEYS.confirm)) {
      adjust.index = (adjust.index + 1) % adjust.items.length;
      s.notice = undefined;
    } else if (is(KEYS.exit)) build().back();
    else return false;
    host.broadcast();
    return true;
  }

  function saveView(s: ViewScreen, table: TableEntry): void {
    try {
      const changed = saveViewAdjust(s.adjust);
      openSheet(table, changed ? 'Vue enregistrée pour cette table.' : 'Vue inchangée.');
    } catch (error) {
      s.menu = false;
      s.notice = { tone: 'error', text: `Enregistrement impossible : ${(error as Error).message}` };
    }
  }

  function resetView(s: ViewScreen, table: TableEntry): void {
    for (const item of s.adjust.items) item.value = item.general;
    s.menu = false;
    try {
      const changed = saveViewAdjust(s.adjust);
      const reread = openViewAdjust(table, s.adjust.index);
      if (!('problem' in reread)) s.adjust = reread;
      s.notice = changed
        ? { tone: 'ok', text: 'Réglage général rétabli : cette table n’a plus de vue propre.' }
        : { tone: 'ok', text: 'Cette table suivait déjà le réglage général.' };
    } catch (error) {
      s.notice = { tone: 'error', text: `Enregistrement impossible : ${(error as Error).message}` };
    }
  }

  /** Partie sur un .ini d'essai, puis retour sur l'écran avec les mêmes valeurs. */
  async function tryView(s: ViewScreen, table: TableEntry): Promise<void> {
    s.menu = false;
    let trial: string;
    try {
      trial = writeTrialIni(s.adjust);
    } catch (error) {
      s.notice = { tone: 'error', text: `Essai impossible : ${(error as Error).message}` };
      return;
    }
    const result = await host.tryTable!(table, trial);
    fs.rmSync(trial, { force: true });
    if (!result) return;
    s.notice = result.ok
      ? { tone: 'info', text: 'Essai terminé. Enregistrer (Exit) pour garder ces valeurs, ou continuer à les changer.' }
      : { tone: 'error', text: `L’essai n’a pas pu se dérouler : ${result.message ?? 'erreur inconnue'}` };
    go(s);
  }

  function adjustView(s: ViewScreen) {
    const adjust = s.adjust;
    const KEYS = host.keys();
    return {
      menu: s.menu,
      notice: s.notice,
      notes: adjust.notes,
      file: iniTarget(adjust),
      keys: { previous: KEYS.previous[0], next: KEYS.next[0] },
      items: adjust.items.map((item, index) => {
        const choices = viewChoices(item);
        const own = item.table !== undefined && !sameValue(item.def, item.table, item.general);
        const stateId = !sameValue(item.def, item.value, savedValue(item)) ? 'changed' : own ? 'own' : 'general';
        return {
          label: item.spec.label,
          help: item.spec.help,
          value: item.spec.format(item.value),
          general: item.spec.format(item.general),
          stateId,
          state: { changed: 'modifié, pas enregistré', own: 'propre à cette table', general: 'réglage général' }[stateId],
          active: index === adjust.index,
          inactive: viewAdjustInactive(item, adjust.items),
          at: Math.max(0, choices.findIndex((v) => sameValue(item.def, v, item.value))),
          steps: choices.length,
          // Peu de choix : on les montre tous ; sinon une jauge entre les bornes.
          options: choices.length <= 3 ? choices.map((v) => item.spec.format(v)) : undefined,
          min: item.spec.format(choices[0]!),
          max: item.spec.format(choices.at(-1)!),
        };
      }),
    };
  }

  function openEdit(table: TableEntry): void {
    go({ kind: 'edit', file: table.file, fields: { Title: table.title, Manufacturer: table.manufacturer ?? '', Year: table.year } });
  }

  function buildEdit(s: Extract<Screen, { kind: 'edit' }>): Built {
    const table = find(s.file);
    const back = () => (table ? openSheet(table) : leave());
    if (!table) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour', run: back }], back };
    const infoFile = infoFileFor(table, tablesDir());
    const f = s.fields;
    return {
      heading: 'Modifier les informations',
      subheading: table.title,
      lead: `Enregistrées dans « ${path.basename(infoFile)} », partagé avec les autres frontends ; les autres informations du fichier sont conservées.`,
      sections: [],
      actions: [
        { label: 'Titre', detail: f.Title || '—', run: () => openEditor(s, 'Title') },
        { label: 'Fabricant', detail: f.Manufacturer || '—', run: () => openEditor(s, 'Manufacturer') },
        { label: 'Année', detail: f.Year ? String(f.Year) : '—', run: () => openEditor(s, 'Year') },
        {
          label: 'Enregistrer',
          tone: 'ok',
          run: () => {
            updateInfo(infoFile, { Title: f.Title, Manufacturer: f.Manufacturer, Year: f.Year });
            host.reload(table.file);
            const updated = find(table.file);
            if (updated) openSheet(updated, 'Informations enregistrées.');
            else leave();
          },
        },
        { label: 'Annuler', run: back },
      ],
      back,
    };
  }

  function openEditor(s: Extract<Screen, { kind: 'edit' }>, field: Field): void {
    if (field === 'Title') {
      s.editor = { kind: 'text', field, label: 'Titre', value: s.fields.Title, cursor: 0, shift: false, typed: false };
    } else if (field === 'Manufacturer') {
      const choices = [...new Set([s.fields.Manufacturer, ...MANUFACTURERS].filter(Boolean)), OTHER_MANUFACTURER];
      s.editor = { kind: 'choice', field, label: 'Fabricant', choices, cursor: Math.max(0, choices.indexOf(s.fields.Manufacturer)) };
    } else {
      s.editor = { kind: 'number', field, label: 'Année', value: s.fields.Year ?? new Date().getFullYear(), typed: '', cursor: NUMPAD.indexOf('OK') };
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
      else if (table) openSheet(table);
      else leave();
    };
    if (!table) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour', run: next }], back: next };
    const findings = s.findings ?? [];
    const actions: Action[] = [];
    const rows: Row[] = findings.map((f) => {
      const row: Row = { text: f.title, detail: f.detail, tone: f.severity };
      if (f.fix) {
        row.action = actions.length;
        actions.push({ label: f.fix.label, detail: 'Réparer', tone: f.severity, run: () => repair(s, [f]) });
      }
      return row;
    });
    const fixable = findings.filter((f) => f.fix);
    if (fixable.length > 1) actions.push({ label: 'Tout réparer', detail: `${fixable.length} corrections`, run: () => repair(s, fixable) });
    actions.push({ label: 'Analyser à nouveau', run: () => void analyse() });
    actions.push({ label: s.queue.length ? 'Table suivante' : 'Retour à la fiche', run: next });
    // Hors de son dossier, la ROM n'est pas vérifiée (PinMAME la cherche alors ailleurs).
    const romChecked = !findings.some((f) => f.code === 'outsideFolder');
    if (s.findings && !findings.length) rows.push({ text: 'Aucun problème détecté', detail: scriptNote(s.script), tone: 'ok' });
    else if (s.findings && romChecked && s.script && !('error' in s.script) && !findings.some((f) => f.code.startsWith('rom'))) {
      rows.push({ text: 'ROM', detail: scriptNote(s.script), tone: 'ok' });
    }
    // Pack trouvé sous le nom que le plugin cherche, sans constat : on le dit aussi.
    if (s.findings && romChecked && s.script && !('error' in s.script) && !findings.some((f) => f.code.startsWith('pup'))) {
      const present = inventory(table.file, true).pup;
      const pack = expectedPackNames(s.script).map((n) => present.find((p) => p.toLowerCase() === n.toLowerCase())).find(Boolean);
      const option = pack ? pupMemory(table.info, pack)?.option : undefined;
      if (pack) rows.push({ text: 'PuP-Pack', detail: `pupvideos\\${pack}${option ? `, ${option}` : ''} : rangé là où le plugin PUP le cherche.`, tone: 'ok' });
    }
    const sections: Section[] = [];
    if (s.log.length) sections.push({ title: 'Réparé', rows: s.log.map((text) => ({ text, tone: 'ok' as const })) });
    sections.push({ title: 'Constats', rows });
    return {
      heading: s.afterImport ? 'Vérification de la table ajoutée' : 'Diagnostic',
      subheading: [table.title, path.basename(table.file)].join(' · '),
      lead: s.findings && fixable.length ? 'Chaque correction dit ce qu’elle fait ; ce qui est retiré part dans la corbeille.' : undefined,
      sections,
      actions,
      back: next,
    };
  }

  function repair(s: Extract<Screen, { kind: 'doctor' }>, findings: Finding[]): void {
    const table = find(s.file);
    if (!table) return;
    const trashDir = trashDirFor(layout()!.trash, `Médecin ${path.basename(table.folder)}`);
    for (const f of findings) {
      applyOps(f.fix!.ops, { trashDir });
      s.log.push(f.fix!.label);
      for (const op of f.fix!.ops) {
        if (op.op !== 'move') continue;
        // Dossier vidé par le déplacement (« roms » mal placé…), et table qui a changé de place.
        if (!samePath(path.dirname(op.from), table.folder)) pruneEmptyDirs(path.dirname(op.from), table.folder);
        if (samePath(op.from, s.file)) s.file = op.to;
      }
    }
    host.reload(s.file);
    void analyse();
  }

  function buildRoms(s: Extract<Screen, { kind: 'roms' }>): Built {
    const back = () => openSystem();
    const scan = s.scan;
    if (!scan) return { heading: 'Bibliothèque de ROM', sections: [], actions: [{ label: 'Retour au menu', run: back }], back };
    const unused = unusedRoms(scan);
    const missing = missingRoms(scan);
    const tidy = romsToTidy(scan);
    const stored = scan.entries.filter((e) => e.stored && !unused.includes(e));
    const space = romSpace(scan);
    const actions: Action[] = [];
    const tidyAction = tidy.length ? actions.push({ label: 'Ranger les ROM dans la bibliothèque', detail: `${tidy.length} ROM copiée${tidy.length > 1 ? 's' : ''}, hors de la bibliothèque ou pas liée${tidy.length > 1 ? 's' : ''}`, tone: 'warning', run: () => openRomMigration() }) - 1 : undefined;
    const addAction = missing.length ? actions.push({ label: 'Ajouter', detail: `${missing.length} ROM absente${missing.length > 1 ? 's' : ''} : dossier d’import, clé USB ou ce PC`, run: () => openAdd() }) - 1 : undefined;
    const unusedRows: Row[] = unused.map((e) => ({
      text: e.name,
      detail: `${formatSize(e.stored!.size)} · aucune table ne l’a ni ne l’attend`,
      tone: 'quiet',
      action: actions.push({ label: `Mettre « ${e.name} » à la corbeille`, detail: formatSize(e.stored!.size), run: () => trashRoms([e]) }) - 1,
    }));
    if (unused.length > 1) {
      const total = unused.reduce((sum, e) => sum + e.stored!.size, 0);
      actions.push({ label: 'Mettre toutes les ROM inutilisées à la corbeille', detail: `${unused.length} ROM · ${formatSize(total)}`, run: () => trashRoms(unused) });
    }
    actions.push({ label: 'Actualiser', run: () => openRoms() }, { label: 'Retour au menu', run: back });

    const sections: Section[] = [];
    if (missing.length) {
      sections.push({
        title: `Attendues mais absentes (${missing.length})`,
        rows: missing.map((e) => ({ text: e.name, detail: `Demandée par ${e.uses.map((u) => u.table.title).join(', ')} : la table ne démarre pas sans elle.`, tone: 'error', action: addAction })),
      });
    }
    if (tidy.length) {
      sections.push({ title: `À ranger (${tidy.length})`, rows: tidy.map((e) => ({ text: e.name, detail: tidyDetail(e), tone: 'warning', action: tidyAction })) });
    }
    if (unused.length) sections.push({ title: `Inutilisées (${unused.length})`, rows: unusedRows });
    const shown = stored.slice(0, 40);
    if (shown.length || !unused.length) {
      sections.push({
        title: `Dans la bibliothèque (${stored.length})`,
        rows: shown.length
          ? shown.map((e) => {
              const tables = e.uses.map((u) => u.table.title);
              const linked = e.uses.every((u) => u.state === 'linked');
              return {
                text: e.name,
                detail: `${tables.join(', ')} · ${formatSize(e.stored!.size)}`,
                badges: [`${tables.length} table${tables.length > 1 ? 's' : ''}`],
                tone: linked ? ('ok' as const) : ('warning' as const),
              };
            })
          : [{ text: 'Aucune ROM pour le moment', detail: 'Les ROM ajoutées avec « Ajouter une table » y sont rangées.', tone: 'quiet' }],
        more: stored.length - shown.length,
      });
    }
    if (scan.unread.length) {
      sections.push({
        rows: [
          {
            text: `${scan.unread.length} table${scan.unread.length > 1 ? 's' : ''} dont le script n’a pas été lu`,
            detail: `${scan.unread.map((t) => t.title).join(', ')} : VPX n’est pas installé ou n’a pas pu lire le script. Leur ROM n’est connue que si elle est dans leur dossier.`,
            tone: 'quiet',
          },
        ],
      });
    }
    const saved = space.logical - space.physical;
    return {
      heading: 'Bibliothèque de ROM',
      subheading: scan.library,
      lead: `${stored.length + unused.length} ROM dans la bibliothèque · ${formatSize(space.physical)} sur le disque${saved > 0 ? ` · les liens physiques économisent ${formatSize(saved)}` : ''}. Chaque table a dans son dossier un lien vers la ROM de la bibliothèque : le même fichier, sans place en plus.`,
      sections,
      actions,
      back,
    };
  }

  /** « copie dans Terminator 2 · pas liée dans Terminator 2 VPW » : ce qui reste à faire pour une ROM. */
  function tidyDetail(e: RomEntry): string {
    const labels: Partial<Record<RomState, string>> = {
      copy: 'copie dans',
      different: 'autre version dans',
      outside: 'hors de la bibliothèque, dans',
      notLinked: 'pas liée dans',
      missing: 'à lier aussi dans',
    };
    const parts = Object.entries(labels).flatMap(([state, label]) => {
      const tables = e.uses.filter((u) => u.state === state).map((u) => u.table.title);
      return tables.length ? [`${label} ${tables.join(', ')}`] : [];
    });
    const size = e.stored?.size ?? e.uses.find((u) => u.file)?.file?.size;
    return [...parts, ...(size ? [formatSize(size)] : [])].join(' · ');
  }

  function trashRoms(entries: RomEntry[]): void {
    const trashDir = trashDirFor(layout()!.trash, 'ROM inutilisées');
    applyOps(entries.map((e) => ({ op: 'trash', path: e.stored!.path })), { trashDir });
    const n = entries.length;
    go({ kind: 'notice', heading: `${n} ROM mise${n > 1 ? 's' : ''} à la corbeille`, lines: [entries.map((e) => e.name).join(', '), trashDir], then: () => openRoms() });
  }

  function buildRomMigrate(s: Extract<Screen, { kind: 'romMigrate' }>): Built {
    const back = () => openSystem();
    if (!s.scan) return { heading: 'Ranger les ROM', sections: [], actions: [{ label: 'Retour au menu', run: back }], back };
    const plan = planRomMigration(s.scan, s.choices);
    if (!plan.items.length) {
      return {
        heading: 'Rien à ranger',
        subheading: plan.library,
        lead: 'Chaque ROM est dans la bibliothèque, et chaque table qui la joue en a un lien.',
        sections: [],
        actions: [{ label: 'Voir la bibliothèque de ROM', run: () => openRoms() }, { label: 'Retour au menu', run: back }],
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
        badges: [item.stores ? 'entre dans la bibliothèque' : 'déjà dans la bibliothèque', `${item.links.length} lien${item.links.length > 1 ? 's' : ''}`],
        tone: item.versions.length > 1 ? 'warning' : undefined,
      });
      if (item.versions.length > 1) {
        const others = item.versions.filter((_, i) => i !== item.keep);
        const next = item.versions[(item.keep + 1) % item.versions.length]!;
        rows.push({
          text: `${item.versions.length} versions différentes de ${item.name}`,
          detail: `Gardée : ${versionLabel(kept)}, ${item.decided ? 'choisie' : 'la plus récente'}. À la corbeille : ${others.map(versionLabel).join(' ; ')}.`,
          badges: [item.decided ? 'choisie' : 'la plus récente'],
          tone: 'warning',
          action: 2 + choiceActions.length,
        });
        choiceActions.push({
          label: `Garder plutôt ${versionLabel(next)}`,
          detail: item.name,
          run: () => {
            s.choices.set(item.key, next.hash);
            host.broadcast();
          },
        });
      }
    }
    const summary: Row[] = [{ text: `Libère ${formatSize(plan.freed)}`, detail: 'Copies identiques remplacées par des liens physiques vers la bibliothèque.', tone: 'ok' }];
    if (plan.trashed) summary.push({ text: `${formatSize(plan.trashed)} à la corbeille`, detail: 'Versions écartées, récupérables dans la corbeille.', tone: 'warning' });
    if (plan.crossVolume.length) {
      summary.push({
        text: `${plan.crossVolume.length} table${plan.crossVolume.length > 1 ? 's' : ''} sur un autre disque`,
        detail: `Un lien physique ne relie que deux dossiers d’un même disque : ${plan.crossVolume.map((t) => t.title).join(', ')} ${plan.crossVolume.length > 1 ? 'reçoivent' : 'reçoit'} une copie.`,
        tone: 'warning',
      });
    }
    return {
      heading: 'Ranger les ROM',
      subheading: plan.library,
      lead: 'Chaque ROM est gardée une fois dans la bibliothèque ; chaque table reçoit à la place de sa copie un lien physique (le même fichier, sans place en plus). Rien ne bouge avant « Ranger ».',
      sections: [
        { title: 'Résultat', rows: summary },
        { title: `ROM (${plan.items.length})`, rows: rows.slice(0, 40), more: rows.length - Math.min(rows.length, 40) },
      ],
      actions: [
        { label: 'Ranger', detail: `${plan.items.length} ROM · libère ${formatSize(plan.freed)}`, tone: 'ok', run: () => migrateRoms(s) },
        { label: 'Annuler', run: back },
        ...choiceActions,
      ],
      back,
    };
  }

  /** « rangée depuis Terminator 2 · copie remplacée dans T2 mod · lien ajouté dans T2 VPW · libère 459 ko » */
  function migrationDetail(item: RomMigration): string {
    const parts: string[] = [];
    if (item.stores) parts.push(`rangée depuis ${path.basename(path.dirname(path.dirname(path.dirname(item.stores))))}`);
    const groups: [string, (l: RomMigration['links'][number]) => boolean][] = [
      ['copie remplacée par un lien dans', (l) => l.content === 'same' && l.was !== 'linked'],
      ['autre version remplacée dans', (l) => l.content === 'other'],
      ['lien ajouté dans', (l) => l.content === 'none'],
      ['lien refait dans', (l) => l.content === 'same' && l.was === 'linked'],
    ];
    for (const [label, match] of groups) {
      const tables = item.links.filter((l) => match(l) && !(item.stores && l.to.toLowerCase() === item.stores.toLowerCase())).map((l) => l.table.title + (l.copy ? ' (copie, autre disque)' : ''));
      if (tables.length) parts.push(`${label} ${tables.join(', ')}`);
    }
    if (item.freed) parts.push(`libère ${formatSize(item.freed)}`);
    return parts.join(' · ');
  }

  function migrateRoms(s: Extract<Screen, { kind: 'romMigrate' }>): void {
    void task('Rangement des ROM…', () => {
      const plan = planRomMigration(s.scan!, s.choices);
      const before = romSpace(s.scan!);
      const trashDir = trashDirFor(layout()!.trash, 'ROM rangées');
      for (const item of plan.items) applyOps(item.ops, { trashDir });
      const scan = scanRomLibrary(layout()!.roms, romTables());
      const after = romSpace(scan);
      const links = plan.items.reduce((n, i) => n + i.links.length, 0);
      const lines = [
        `${plan.items.length} ROM rangée${plan.items.length > 1 ? 's' : ''} dans ${layout()!.roms}, ${links} lien${links > 1 ? 's' : ''} dans les tables.`,
        `Place des ROM sur le disque : ${formatSize(before.physical)} avant, ${formatSize(after.physical)} après, soit ${formatSize(before.physical - after.physical)} de moins${plan.trashed ? ` (dont ${formatSize(plan.trashed)} de versions écartées, encore dans la corbeille)` : ''}.`,
      ];
      if (fs.existsSync(trashDir)) lines.push(`Corbeille : ${trashDir}`);
      const left = romsToTidy(scan).length;
      if (left) lines.push(`${left} ROM restent à ranger : voir la bibliothèque de ROM.`);
      screen = { kind: 'notice', heading: 'ROM rangées', lines, then: () => openRoms() };
      cursor = 0;
    });
  }

  /** « celle de Terminator 2 (12 octobre 2026, 459 ko) » */
  function versionLabel(v: RomMigration['versions'][number]): string {
    const others = v.tables.length - 1;
    const where = v.inLibrary ? 'celle de la bibliothèque' : `celle de ${v.tables[0]}${others > 0 ? ` et ${others} autre${others > 1 ? 's' : ''}` : ''}`;
    return `${where} (${new Date(v.file.mtimeMs).toLocaleDateString('fr-FR', { dateStyle: 'long' })}, ${formatSize(v.file.size)})`;
  }

  function buildRemove(s: Extract<Screen, { kind: 'remove' }>): Built {
    const table = find(s.file);
    if (!table) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour', run: leave }], back: leave };
    const back = () => openSheet(table);
    const targets = removalTargets(table, tablesDir());
    const total = targets.paths.reduce((sum, p) => sum + sizeOf(p), 0);
    return {
      heading: `Supprimer « ${table.title} » ?`,
      subheading: table.version,
      lead: `Rien n’est effacé : ${targets.whole ? 'le dossier de la table part' : 'ces fichiers partent'} dans la corbeille (${layout()!.trash}), d’où l’on peut ${targets.whole ? 'le' : 'les'} récupérer.`,
      sections: [
        {
          title: targets.whole ? 'Dossier mis à la corbeille' : 'Fichiers mis à la corbeille (les autres versions restent)',
          rows: targets.paths.map((p) => ({ text: path.relative(tablesDir(), p), detail: formatSize(sizeOf(p)) })),
        },
        { rows: [{ text: `Total : ${formatSize(total)}`, tone: 'quiet' }] },
      ],
      actions: [
        { label: 'Annuler', run: back },
        {
          label: 'Mettre à la corbeille',
          tone: 'error',
          run: () => {
            const trashDir = trashDirFor(layout()!.trash, `Table ${table.title}`);
            applyOps(targets.paths.map((p) => ({ op: 'trash', path: p })), { trashDir });
            host.reload();
            go({ kind: 'notice', heading: `« ${table.title} » est dans la corbeille`, lines: [trashDir], then: leave });
          },
        },
      ],
      back,
    };
  }

  function buildAddSource(): Built {
    const importDir = layout()!.import;
    const entries = listImport();
    const rows: Row[] = entries.map((name) => {
      const p = path.join(importDir, name);
      const dir = fs.statSync(p).isDirectory();
      const kind = dir ? 'Dossier' : ARCHIVE_EXT.has(path.extname(name).toLowerCase()) ? 'Archive' : KIND_LABELS[classifyFile(name)];
      return { text: name, detail: `${kind} · ${formatSize(sizeOf(p))}` };
    });
    const actions: Action[] = [];
    if (entries.length) {
      actions.push({
        label: 'Importer le contenu du dossier d’import',
        detail: `${entries.length} élément${entries.length > 1 ? 's' : ''}`,
        run: () => startImport(entries.map((e) => path.join(importDir, e)), 'move'),
      });
    }
    actions.push(
      { label: 'Choisir des fichiers sur ce PC…', detail: 'Tables, backglass, ROM, archives zip', run: () => void pick('openFile') },
      { label: 'Choisir un dossier sur ce PC…', run: () => void pick('openDirectory') },
      { label: 'Actualiser', run: () => host.broadcast() },
      { label: 'Retour', run: leave },
    );
    return {
      heading: 'Ajouter une table',
      lead: 'Sur la borne : copiez les fichiers de la table dans le dossier d’import (depuis une clé USB, par exemple). Sur un PC : choisissez-les, ou glissez-les sur cette fenêtre. Rien n’est installé avant que vous ayez validé le plan.',
      sections: [{ title: `Dossier d’import : ${importDir}`, rows: rows.length ? rows : [{ text: 'Vide pour le moment', tone: 'quiet' }] }],
      actions,
      back: leave,
    };
  }

  function listImport(): string[] {
    try {
      return fs.readdirSync(layout()!.import).filter((n) => !n.startsWith('.'));
    } catch {
      return [];
    }
  }

  async function pick(kind: 'openFile' | 'openDirectory'): Promise<void> {
    const win = host.windows().get('playfield');
    const options: Electron.OpenDialogOptions = {
      title: 'Ajouter une table',
      properties: kind === 'openFile' ? ['openFile', 'multiSelections'] : ['openDirectory', 'multiSelections'],
      filters:
        kind === 'openFile'
          ? [
              { name: 'Fichiers de table', extensions: ['vpx', 'directb2s', 'zip', '7z', 'rar', 'vbs', 'ini', 'pov', 'info', 'crz', 'cromc', 'vni', 'pal', 'pac', 'mp3', 'ogg', 'wav'] },
              { name: 'Médias (logos, vidéos, images)', extensions: ['png', 'apng', 'webp', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'm4v', 'mp3', 'ogg', 'm4a', 'flac', 'wav'] },
              { name: 'Tous les fichiers', extensions: ['*'] },
            ]
          : undefined,
    };
    // Une boîte de dialogue native s'ouvrirait sur les écrans du poste.
    if (refuseOffscreen('Choisir des fichiers dans une boîte de dialogue')) return;
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    win?.focus();
    if (!result.canceled && result.filePaths.length) startImport(result.filePaths, 'copy');
  }

  /** Point d'entrée de l'ajout : dossier d'import, sélection de fichiers ou glisser-déposer. */
  function startImport(paths: string[], mode: 'move' | 'copy', acquisition?: AddPlan['acquisition']): void {
    if (!layout()) return openAdd();
    const s: AddPlan = { kind: 'addPlan', mode, scripts: new Map(), existing: [], vpsChoices: new Map(), pupChoices: new Map(), romChoices: new Map(), cabinet: pupCabinet(loadCabinet(host.dataDir)), acquisition };
    go(s);
    void task('Analyse des fichiers…', async () => {
      s.prepared = await prepareImport(paths, mode, path.join(host.dataDir, 'staging'));
      // Le script de chaque table dit quelle ROM lui revient.
      const exe = host.vpxExe();
      if (exe) {
        for (const vpx of s.prepared.sources.flatMap((src) => listVpx(src.path))) {
          busy = `Lecture du script de ${path.basename(vpx)}…`;
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
      // Jeu incertain ou option de PuP-Pack à trancher : on demande d'abord.
      const first = pendingChoices(s)[0];
      if (first) {
        screen = choiceScreen(s, first);
        cursor = 0;
      } else cursor = planCursor(s);
    });
  }

  /** Tables installées dans leur dossier, une par dossier, avec ce que disent les scripts déjà lus. */
  function knownTables(): KnownTable[] {
    const existing = host
      .tables()
      .filter((t) => !samePath(t.folder, tablesDir()))
      .map((t): KnownTable => {
        const facts = cachedScript(t.file, host.dataDir);
        return { folder: t.folder, title: t.title, roms: facts?.roms ?? [], dmdFolder: facts?.dmdFolder, pupNames: expectedPackNames(facts), vpsId: t.info.Info?.VPSId };
      });
    // Une table a une entrée par version : un seul dossier suffit.
    const unique = existing.filter((t, i) => existing.findIndex((o) => samePath(o.folder, t.folder)) === i);
    for (const t of unique) {
      const versions = existing.filter((o) => samePath(o.folder, t.folder));
      t.roms = [...new Set(versions.flatMap((o) => o.roms))];
      t.pupNames = [...new Set(versions.flatMap((o) => o.pupNames ?? []))];
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
    const t = s.plan?.tables.find((x) => x.vps?.key === c.key);
    if (!t?.vps) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour au plan', run: back }], back };
    const v = t.vps;
    const decide = (choice: string | null) => {
      s.vpsChoices.set(v.key, choice);
      replan(s);
      const next = pendingChoices(s)[0];
      if (next) go(choiceScreen(s, next));
      else go(s, planCursor(s));
    };
    const files = t.steps.filter((st) => st.kind === 'table' || st.kind === 'backglass').map((st) => ({ text: st.source, badges: [KIND_LABELS[st.kind]] }));
    const chosenId = v.decided ? (v.chosen?.game.id ?? null) : undefined;
    const actions: Action[] = v.candidates.map((cand) => ({
      label: vpsLabel(cand.game),
      detail: [
        cand.score ? `ressemblance ${Math.round(cand.score * 100)} %` : undefined,
        cand.table ? `table de ${tableLabel(cand.table)}` : vpxCount(cand.game.tableFiles),
        cand.game.id === chosenId ? 'choix actuel' : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: cand.game.id === chosenId ? 'ok' : undefined,
      run: () => decide(cand.game.id),
    }));
    actions.push({
      label: `Garder « ${v.fromFiles.folderName} »`,
      detail: chosenId === null ? 'Nom déduit des fichiers · choix actuel' : 'Nom déduit des fichiers, si le jeu n’est pas dans la liste',
      tone: chosenId === null ? 'ok' : undefined,
      run: () => decide(null),
    });
    return {
      heading: 'Quel jeu est-ce ?',
      subheading: t.isNew ? undefined : `Complément pour ${path.relative(tablesDir(), t.folder)}`,
      lead: `${v.confident ? 'La base VPS (Virtual Pinball Spreadsheet) a reconnu ce jeu ; vous pouvez en choisir un autre.' : 'La base VPS (Virtual Pinball Spreadsheet) propose plusieurs jeux pour ces fichiers.'} Le jeu choisi donne le nom du dossier et les informations de la table. Rien n’est installé avant « Installer ».`,
      sections: [{ title: 'Fichiers de la table', rows: files }],
      actions,
      back,
    };
  }

  function buildPupChoice(c: Extract<Screen, { kind: 'addPupChoice' }>): Built {
    const s = c.plan;
    const back = () => go(s, planCursor(s));
    const found = packOf(s, c.key);
    if (!found) return { heading: 'PuP-Pack introuvable', sections: [], actions: [{ label: 'Retour au plan', run: back }], back };
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
      detail: [traitsLabel(v), v.label === proposed ? (pack.decided ? 'choix actuel' : 'proposée') : undefined].filter(Boolean).join(' · '),
      tone: v.label === proposed ? 'ok' : undefined,
      run: () => decide(v.label),
    }));
    const rows: Row[] = pack.failedBats.map((b) => ({
      text: `« ${b.bat} » non reconnu`,
      detail: `${b.reason} : il n’est pas exécuté. Choisissez l’option parmi les dossiers trouvés dans le pack.`,
      tone: 'warning' as const,
    }));
    rows.push({
      text: s.cabinet ? `Borne : ${describePupCabinet(s.cabinet)}` : 'Borne non configurée',
      detail: s.cabinet ? 'Option proposée d’après les écrans de la borne.' : 'Lancez l’assistant de configuration pour que l’option soit choisie d’office.',
      tone: 'quiet',
    });
    return {
      heading: 'Quelle option du PuP-Pack ?',
      subheading: `pupvideos\\${pack.name} · ${path.relative(tablesDir(), table.folder)}`,
      lead: 'Le pack propose plusieurs dispositions des écrans. Cyber Pinball recopie les fichiers de l’option choisie, comme le ferait son .bat, sans jamais l’exécuter ; l’option est retenue pour les mises à jour du pack. Rien n’est installé avant « Installer ».',
      sections: [{ title: 'Pack', rows }],
      actions,
      back,
    };
  }

  /** Lignes du plan qui détaillent un PuP-Pack, et l'action « Changer l'option ». */
  function packRows(s: AddPlan, pack: PackPlan, actionIndex: number, choiceActions: Action[]): Row[] {
    const rows: Row[] = [];
    if (pack.nameFrom === 'folder') {
      rows.push({ text: `Nom du pack non vérifié : pupvideos\\${pack.name}`, detail: 'Le script de la table n’a pas pu être lu : le pack garde le nom de son dossier. Le médecin le vérifiera.', tone: 'warning' });
    } else if (pack.origin.toLowerCase() !== pack.name.toLowerCase()) {
      rows.push({ text: `PuP-Pack renommé « ${pack.name} »`, detail: `C’est le nom que charge la table ; « ${pack.origin} » n’aurait jamais été trouvé.`, tone: 'quiet' });
    }
    if (pack.flattened) rows.push({ text: 'Dossier en trop retiré', detail: 'Le plugin PUP lit screens.pup à la racine du pack.', tone: 'quiet' });
    if (pack.replaces) rows.push({ text: 'Remplace le pack installé', detail: 'L’ancien dossier part entier à la corbeille : aucun mélange d’anciens et de nouveaux fichiers.', tone: 'warning' });
    if (pack.variants.length) {
      const v = pack.choice.chosen!;
      const why = pack.decided
        ? 'choisie'
        : pack.choice.reason === 'remembered'
          ? 'reprise de l’installation précédente'
          : pack.choice.reason === 'only'
            ? 'seule option du pack'
            : pack.choice.reason === 'cabinet' && s.cabinet
              ? `d’après la borne : ${describePupCabinet(s.cabinet)}`
              : 'à vérifier : borne non configurée';
      const sure = pack.decided || (pack.choice.confident && !pack.failedBats.length);
      const row: Row = { text: `Option du pack : ${v.label}`, detail: `${pack.decided ? 'choisie dans la liste' : why} · ${v.copies.length} fichier${v.copies.length > 1 ? 's' : ''} recopié${v.copies.length > 1 ? 's' : ''}, aucun .bat exécuté`, badges: [sure ? (pack.decided ? 'choisie' : 'd’office') : 'à vérifier'], tone: sure ? 'ok' : 'warning' };
      if (pack.variants.length > 1) {
        row.action = actionIndex;
        choiceActions.push({ label: 'Changer l’option du PuP-Pack', detail: pack.name, run: () => go({ kind: 'addPupChoice', plan: s, key: pack.key }, Math.max(0, pack.variants.indexOf(v))) });
      }
      rows.push(row);
    }
    for (const b of pack.failedBats) rows.push({ text: `« ${b.bat} » non reconnu`, detail: `${b.reason} : jamais exécuté. Options proposées d’après les dossiers du pack.`, tone: 'warning' });
    if (pack.noPupFiles) rows.push({ text: 'Pack sans fichier .pup', detail: 'C’est le script de la table qui le pilote.', tone: 'quiet' });
    if (pack.junk.length) rows.push({ text: `${pack.junk.length} fichier${pack.junk.length > 1 ? 's' : ''} inutile${pack.junk.length > 1 ? 's' : ''} retiré${pack.junk.length > 1 ? 's' : ''}`, detail: '._*, .DS_Store, MP4 vides', tone: 'quiet' });
    return rows;
  }

  function buildAddPlan(s: AddPlan): Built {
    const cancel = () => {
      if (s.prepared) fs.rmSync(s.prepared.staging, { recursive: true, force: true });
      if (s.mode === 'move') go({ kind: 'addSource' });
      else leave();
    };
    const sections: Section[] = [];
    const plan = s.plan;
    // Après « Installer » et « Annuler » : changer le jeu VPS d'une table.
    const choiceActions: Action[] = [];
    for (const error of s.prepared?.errors ?? []) sections.push({ rows: [{ text: error, tone: 'error' }] });
    if (plan && !s.vps && plan.tables.some((t) => t.steps.some((st) => st.kind === 'table'))) {
      sections.push({ rows: [{ text: 'Base VPS indisponible : noms déduits des fichiers', detail: vpsProblem ? `Téléchargement impossible (${vpsProblem}). Elle sera téléchargée au prochain ajout.` : undefined, tone: 'quiet' }] });
    }
    for (const t of plan?.tables ?? []) {
      const rows: Row[] = [];
      const vpsRow = t.vps && vpsPlanRow(t);
      if (vpsRow) {
        rows.push(vpsRow);
        if (t.vps!.candidates.length) {
          vpsRow.action = 2 + choiceActions.length;
          const chosen = t.vps!.candidates.findIndex((c) => c.game.id === t.vps!.chosen?.game.id);
          const key = t.vps!.key;
          choiceActions.push({
            label: t.vps!.chosen ? 'Changer le jeu' : 'Choisir le jeu',
            detail: path.basename(t.folder),
            run: () => go({ kind: 'addChoice', plan: s, key }, chosen >= 0 ? chosen : t.vps!.decided ? t.vps!.candidates.length : 0),
          });
        }
      }
      for (const step of t.steps) {
        // Média reconnu : son libellé (Logo, Fronton…) plutôt que « Médias du frontend ».
        const badges = [step.media ? mediaTypeInfo(step.media.type).label : KIND_LABELS[step.kind]];
        if (step.renamed) badges.push('renommé');
        if (step.replaces) badges.push(step.pack ? 'remplace l’existant' : step.isDir ? 'complète l’existant' : 'remplace l’existant');
        rows.push({ text: step.source, detail: `→ ${step.target}`, badges, tone: step.replaces && (!step.isDir || step.pack) ? 'warning' : undefined });
        if (step.pack) rows.push(...packRows(s, step.pack, 2 + choiceActions.length, choiceActions));
      }
      const authors = t.info.Info?.Authors?.length ? ` · ${shortList(t.info.Info.Authors)}` : '';
      rows.push({ text: 'Informations', detail: `→ ${path.basename(t.infoFile)} (${[t.info.Info?.Title, t.info.Info?.Manufacturer, t.info.Info?.Year].filter(Boolean).join(', ')}${authors})`, badges: ['.info'] });
      for (const w of t.warnings) rows.push({ text: w, tone: 'warning' });
      const shown = rows.slice(0, 16);
      sections.push({
        title: `${t.isNew ? 'Nouvelle table' : 'Complément pour'} : ${path.relative(tablesDir(), t.folder)}`,
        rows: shown,
        more: rows.length - shown.length,
      });
    }
    if (plan?.roms.length) {
      const rows = plan.roms.flatMap((r) => romPlanRows(s, r, () => 2 + choiceActions.length, choiceActions));
      const shown = rows.slice(0, 16);
      sections.push({ title: `ROM → bibliothèque (${layout()!.roms})`, rows: shown, more: rows.length - shown.length });
    }
    if (plan?.leftovers.length) sections.push({ title: 'Non importé', rows: plan.leftovers.map((l) => ({ text: l.source, detail: l.reason, tone: 'quiet' })) });
    if (plan?.ignored.length) sections.push({ rows: [{ text: `${plan.ignored.length} fichier${plan.ignored.length > 1 ? 's' : ''} ignoré${plan.ignored.length > 1 ? 's' : ''} (rapports de plantage, cache…)`, tone: 'quiet' }] });

    const tableCount = plan?.tables.length ?? 0;
    const romCount = plan?.roms.length ?? 0;
    const count = tableCount + romCount;
    const what = [tableCount > 1 || (tableCount && romCount) ? `${tableCount} table${tableCount > 1 ? 's' : ''}` : '', romCount ? `${romCount} ROM` : ''].filter(Boolean).join(' · ');
    const actions: Action[] = count
      ? [
          { label: 'Installer', detail: what || undefined, tone: 'ok', run: () => install(s) },
          { label: 'Annuler', run: cancel },
          ...choiceActions,
        ]
      : [{ label: 'Retour', run: cancel }];
    return {
      heading: count ? 'Plan d’installation' : 'Rien à installer',
      lead: !plan
        ? undefined
        : count
          ? s.mode === 'move'
            ? 'Les fichiers quittent le dossier d’import ; les archives déballées et les fichiers remplacés vont à la corbeille.'
            : 'Les fichiers sont copiés : vos fichiers d’origine ne sont pas modifiés. Les fichiers remplacés vont à la corbeille.'
          : 'Aucune table (.vpx) ni complément reconnu dans cette sélection.',
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
        ? 'remplace celle de la bibliothèque'
        : 'entre dans la bibliothèque'
      : !incoming
        ? 'déjà dans la bibliothèque'
        : r.versions.length > 1
          ? 'version de la bibliothèque gardée'
          : 'identique à celle de la bibliothèque';
    const rows: Row[] = [
      {
        text: kept.inLibrary ? r.name : kept.label,
        detail: `→ ${path.relative(layout()!.root, r.to)} · ${formatSize(kept.size)}`,
        badges: ['ROM', status],
        tone: !kept.inLibrary && stored ? 'warning' : undefined,
      },
    ];
    const states = { new: 'liée', copy: 'copie remplacée par un lien', different: 'autre version remplacée', linked: 'déjà liée' } as const;
    const links = r.links.map((l) => `${path.basename(l.folder)} (${states[l.state]}${l.copy ? ', copie : autre disque' : ''})`);
    rows.push(
      links.length
        ? { text: `Liée dans ${r.links.length} table${r.links.length > 1 ? 's' : ''}`, detail: links.join(' · '), tone: 'quiet' }
        : { text: 'Aucune table installée ne la demande encore', detail: 'Rangée dans la bibliothèque : elle sera liée à l’ajout de sa table.', tone: 'quiet' },
    );
    if (r.versions.length > 1) {
      const date = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { dateStyle: 'long' });
      const label = (v: RomImport['versions'][number]) => `${v.inLibrary ? 'celle de la bibliothèque' : `l’importée (${v.label})`}, ${date(v.mtimeMs)}, ${formatSize(v.size)}`;
      const next = r.versions[(r.keep + 1) % r.versions.length]!;
      rows.push({
        text: `${r.versions.length} versions différentes de ${r.name}`,
        detail: `Gardée : ${label(kept)} (${r.decided ? 'choisie' : 'la plus récente'}). L’autre va à la corbeille.`,
        badges: [r.decided ? 'choisie' : 'la plus récente'],
        tone: 'warning',
        action: nextAction(),
      });
      choiceActions.push({
        label: next.inLibrary ? 'Garder la ROM de la bibliothèque' : 'Garder la ROM importée',
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
  function vpsPlanRow(t: TablePlan): Row {
    const v = t.vps!;
    if (v.chosen) {
      return {
        text: `Base VPS : ${vpsLabel(v.chosen.game)}`,
        detail: v.chosen.table ? `Table de ${tableLabel(v.chosen.table)}` : undefined,
        badges: [v.decided ? 'choisi' : `sûr à ${Math.round(v.chosen.score * 100)} %`],
        tone: 'ok',
      };
    }
    if (!v.candidates.length) return { text: 'Base VPS : jeu absent', detail: 'Nom déduit des fichiers', tone: 'quiet' };
    return {
      text: v.decided ? 'Base VPS : nom déduit des fichiers' : 'Base VPS : jeu incertain',
      detail: v.decided ? 'Choisi à la place des propositions de la base' : `${v.candidates.length} proposition${v.candidates.length > 1 ? 's' : ''} ; sans choix, le nom est déduit des fichiers`,
      badges: [v.decided ? 'choisi' : 'à choisir'],
      tone: v.decided ? 'quiet' : 'warning',
    };
  }

  function install(s: AddPlan): void {
    const plan = s.plan!;
    const prepared = s.prepared!;
    void task('Installation…', () => {
      const trashDir = trashDirFor(layout()!.trash, 'Remplacé à l’import');
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
      if (s.acquisition) noteSource(s.acquisition, checked);
      const [first, ...rest] = checked;
      if (first) openDoctor(first, rest, true);
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
        applyOps([{ op: 'write', path: infoFile, content: JSON.stringify(next, null, 2) + '\n' }], { trashDir: trashDirFor(layout()!.trash, 'Remplacé à l’import') });
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
    if (screen.kind === 'view' && !screen.menu) return viewKey(screen, input);
    if (screen.kind === 'pages') return pagesKey(screen, input);
    const built = build();
    const n = built.actions.length;
    // Tab / Maj+Tab : se déplacer au clavier quels que soient les boutons relevés.
    if (input.code === CONFIG_KEY) cursor = (cursor + (input.shift ? -1 : 1) + n) % n;
    else if (is(KEYS.previous)) cursor = (cursor - 1 + n) % n;
    else if (is(KEYS.next)) cursor = (cursor + 1) % n;
    else if (is(KEYS.confirm)) void built.actions[cursor]?.run();
    else if (is(KEYS.exit)) built.back();
    else return false;
    host.broadcast();
    return true;
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
    if (choice === OTHER_MANUFACTURER) {
      s.editor = { kind: 'text', field: 'Manufacturer', label: 'Fabricant', value: s.fields.Manufacturer, cursor: 0, shift: false, typed: false };
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
      if (key === 'Annuler') return closeEditor(s, false);
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
    if (key === 'Annuler') return closeEditor(s, false);
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
      if (!action.paths.length) return;
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
    } else if (action.type === 'adjust' && screen.kind === 'view') {
      if (!screen.adjust.items[action.index]) return;
      screen.adjust.index = action.index;
      screen.menu = false;
      host.broadcast();
    } else if (action.type === 'activate') {
      const built = build();
      if (!built.actions[action.index]) return;
      cursor = action.index;
      host.broadcast();
      void built.actions[action.index]!.run();
    }
  }

  // ---------- Vue envoyée au rendu ----------

  function view() {
    if (!screen) return undefined;
    const built = build();
    cursor = Math.min(cursor, Math.max(0, built.actions.length - 1));
    const editorView = (screen.kind === 'edit' || screen.kind === 'prompt') && screen.editor ? viewEditor(screen.editor) : undefined;
    return {
      screen: screen.kind,
      heading: built.heading,
      subheading: built.subheading,
      lead: built.lead,
      sections: built.sections,
      actions: built.actions.map(({ label, detail, tone }) => ({ label, detail, tone })),
      media: built.media,
      cursor,
      busy,
      editor: editorView,
      adjust: screen.kind === 'view' ? adjustView(screen) : undefined,
      pages: screen.kind === 'pages' ? pagesView(screen) : undefined,
      hint: screen.kind === 'view' && !screen.menu
        ? 'Flippers : changer la valeur · Start : réglage suivant · Exit : enregistrer, essayer ou annuler'
        : screen.kind === 'pages'
        ? built.actions.length > 1
          ? 'Flippers : page précédente ou suivante · Start : page suivante · Exit : retour à la fiche'
          : 'Start ou Exit : retour à la fiche'
        : editorView
        ? editorView.kind === 'choice'
          ? 'Flippers : choisir · Start : valider · Exit : annuler'
          : 'Flippers : choisir une touche · Start : la taper · Exit : annuler · ou tapez au clavier, Entrée pour valider'
        : 'Flippers ou Tab : choisir · Start ou Entrée : valider · Exit ou Échap : revenir · souris',
    };
  }

  function viewEditor(e: Editor) {
    if (e.kind === 'choice') return { kind: e.kind, label: e.label, keys: e.choices, cursor: e.cursor, value: undefined as string | undefined };
    if (e.kind === 'number') return { kind: e.kind, label: e.label, keys: NUMPAD, cursor: e.cursor, value: String(e.value) };
    const wordStart = e.value === '' || e.value.endsWith(' ');
    const upper = wordStart !== e.shift;
    const keys = KEYBOARD.map((k) => (k.length === 1 ? (upper ? k : k.toLowerCase()) : k));
    return { kind: e.kind, label: e.label, keys, cursor: e.cursor, value: e.value, shift: e.shift };
  }

  // ---------- Mode sans opérateur ----------

  /**
   * Rejoue une suite d'étapes et capture le playfield après chacune, dans
   * CYBERPINBALL_CAPTURE, puis quitte. Étapes : un code de touche (ShiftRight,
   * Digit1, Escape…), « type:texte », « drag » (fichiers survolant la fenêtre : le
   * cadre de dépôt), « drop:chemin|chemin », « wait:ms », « click:sélecteur CSS »
   * (vrai clic de souris, qui passe par le rendu), et « action:libellé » (l'action de
   * l'écran affiché qui porte ce libellé, ou qui commence par lui : une démonstration
   * ne dépend pas du rang des actions, qui change quand on en ajoute une), et
   * « until:phase » (attendre que le menu passe à cette phase, playing ou menu par
   * exemple, deux minutes au plus : une démonstration ne parie pas sur la durée des
   * étapes, qui varie avec le nombre d'écrans et leur définition).
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
    const key = (code: string, k = '') => pressKey({ type: 'keyDown', code, key: k, shift: false, control: false, alt: false, meta: false } as Input);
    for (const [i, step] of ['depart', ...steps].entries()) {
      if (i > 0) {
        if (step.startsWith('type:')) for (const ch of step.slice(5)) key(ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`, ch);
        else if (step === 'drag') await dragEvent(playfield, 'dragover');
        else if (step.startsWith('drop:')) await dragEvent(playfield, 'dragleave').then(() => handleAction({ type: 'drop', paths: step.slice(5).split('|') }));
        else if (step.startsWith('wait:')) await delay(Number(step.slice(5)));
        else if (step.startsWith('until:')) {
          const wanted = step.slice(6);
          for (let waited = 0; phase() !== wanted && waited < 120_000; waited += 100) await delay(100);
          if (phase() !== wanted) console.log(`Autopilote : phase « ${wanted} » jamais atteinte (encore « ${phase()} » après deux minutes).`);
        }
        else if (step.startsWith('click:')) await click(playfield, step.slice(6));
        else if (step.startsWith('action:')) activateByLabel(step.slice(7));
        else key(step);
      }
      await delay(150);
      for (let waited = 0; busy && waited < 120_000; waited += 100) await delay(100);
      await delay(400);
      const name = `${String(i).padStart(2, '0')}-${step.replace(/[^\w-]+/g, '_').slice(0, 40)}`;
      for (const [role, win] of host.windows()) {
        if (win === playfield || isShown(win)) await layout.check(win.webContents, win === playfield ? name : `${name} (${role})`);
      }
      if (!captureDir) continue;
      const sound = await playfield.webContents.executeJavaScript('window.CyberMenuAudio?.status?.()').catch(() => undefined);
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
    const exact = actions.findIndex((a) => a.label === wanted);
    const index = exact >= 0 ? exact : actions.findIndex((a) => a.label.startsWith(wanted));
    if (index < 0) return console.log(`Autopilote : aucune action « ${wanted} » sur cet écran (${actions.map((a) => a.label).join(' · ') || 'aucune action'}).`);
    handleAction({ type: 'activate', index });
  }

  return {
    systemItems,
    openSystem,
    openCustom,
    openPrompt,
    openNotice,
    openSheet,
    openAdd,
    /** Ferme la gestion des tables (une entrée du menu système qui affiche ensuite un message). */
    leave,
    handleKey,
    handleAction,
    view,
    autopilot,
    /** Catalogue et fenêtre « Récupérer » (démonstrations). */
    catalog: catalogUi,
    isActive: () => screen !== undefined,
  };
}

/** Clic de souris au centre de l'élément désigné, comme le ferait l'utilisateur. */
async function click(win: BrowserWindow, selector: string): Promise<void> {
  const center = (await win.webContents.executeJavaScript(
    // Une ligne hors de la vue (liste qui défile) y est d'abord ramenée, comme à la molette.
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView({ block: 'nearest' }); const r = el?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`,
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

/** « topper · DMD séparé · 16:9 » : ce que vise une option de PuP-Pack. */
function traitsLabel(v: PupVariant): string {
  const t = v.traits;
  const parts: string[] = [];
  if (t.desktop) parts.push('bureau, un seul écran');
  if (t.unsupported) parts.push('non géré par le plugin PUP');
  if (t.topper !== undefined) parts.push(t.topper ? 'topper' : 'sans topper');
  if (t.dmd) parts.push({ separate: 'DMD sur son écran', backglass: 'DMD dans le backglass', none: 'sans DMD' }[t.dmd]);
  if (t.fullDmd !== undefined) parts.push(t.fullDmd ? 'FullDMD' : 'DMD réel');
  const ratios: Record<string, string> = { '1.78': '16:9', '2.33': '21:9', '1.33': '4:3', '1.25': '5:4', '1.00': '1:1' };
  if (t.ratios.length) parts.push(t.ratios.map((r) => ratios[r.toFixed(2)] ?? r.toFixed(2)).join(' ou '));
  return parts.join(' · ') || 'disposition non décrite';
}

function scriptNote(script: ScriptResult | undefined): string | undefined {
  if (!script) return 'ROM non vérifiée : VPX n’est pas installé.';
  if ('error' in script) return undefined;
  if (!script.usesPinmame) return 'La table n’utilise pas de ROM.';
  return `ROM ${script.roms.join(' ou ')} présente.`;
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
  return n ? `${n} table${n > 1 ? 's' : ''} VPX dans VPS` : 'aucune table VPX dans VPS';
}

function shortList(names: string[], max = 3): string {
  return names.length > max ? `${names.slice(0, max).join(', ')}…` : names.join(', ');
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
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
