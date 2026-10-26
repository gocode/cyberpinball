// Menu des tables : une fenêtre par écran de la borne, pilotée aux boutons.
// Lancer une table : écran de chargement avec les commandes, VPX en -Play par-dessus
// les fenêtres du menu (qui restent derrière lui, en fond de partie), puis retour au
// menu avec reprise du premier plan.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, globalShortcut, ipcMain, session, type BrowserWindow, type Input, type Rectangle } from 'electron';
import {
  CONFIG_KEY,
  WIZARD_STEPS,
  buttonProblems,
  formatManualEdit,
  gameKeys,
  displayKeys,
  keyLabel,
  interfaceKeys,
  navigationButtons,
  navigationProblems,
  type ButtonsSource,
  type NavigationButtons,
  joysticksInVpxLog,
  joysticksUnseenByVpx,
  keepManualEdits,
  layoutOf,
  loadCabinet,
  playfieldOrientation,
  readInfo,
  readTextIfExists,
  recordPlay,
  ROLES,
  saveCabinet,
  scanTables,
  cabinetRoleLabel,
  cabinetZones,
  dmdKindChoices,
  dmdKindOf,
  dmdKindQuestion,
  dmdScreen,
  ratioLabel,
  roleZone,
  withDmdKind,
  type Cabinet,
  type DmdKind,
  type RoleInfo,
  screenSurfaces,
  zoneRect,
  mediaErrorsFile,
  recordMediaError as logMediaError,
  MenuMedias,
  isServedMedia,
  loadMenuMediaSettings,
  mediaPathFromUrl,
  menuAudioOutput,
  menuSound,
  AttractMode,
  attractMemory,
  momentScreen,
  pickAttractTable,
  occupiedRoles,
  saveMenuMediaSettings,
  tableMediaVolume,
  type MenuMediaSettings,
  type MenuMoment,
  type RoleRect,
  type AncillaryRoleId,
  type CabinetButtons,
  type ConfigurationSelection,
  type ManualEdit,
  type ObservedDisplay,
  type RoleId,
  type Rotation,
  type ScreenSurface,
  type ScreenZone,
  type TableEntry,
  type MediaTarget,
  type MediaType,
  formatList,
  frontendNames,
  t,
  type OtherFrontend,
  pupCabinet,
  repairPupForPlay,
  trashDirFor,
} from '@cyberpinball/core';
import { bringToFront, foregroundWindow, listWindows, visibleWindowsOf } from '@cyberpinball/win-displays';
import { observedDisplays } from './displays';
import { browserScreenFor } from './browser-screen';
import { createWindow, isShown, OFFSCREEN, primaryRect, refuseOffscreen, windowRect } from './offscreen';
import { installVpx, vpxArchivePresent } from './install-vpx';
import { launchVpx, simulateVpx, vpxPrefDir, type LaunchResult } from './launcher';
import { createLibrary, type SystemItem, type UiAction } from './library';
import { cachedScript } from './vbs';
import { onJoystickInput } from './joystick-input';
import { locations, vpxInstall, vpxProfile } from './paths';
import { activeVpxIni, syncConfiguration } from './vpx-ini';
import { createConfigurationsMenu } from './configurations-menu';
import { coverDisplay, minimizeCovered } from './cover-display';
import { acceptFrontends, unacceptedFrontends } from './frontend-gate';
import { allowDesktop, hideTaskbars, nameScreen, relaunchCovered, restoreTaskbars, takeCoverIncidents } from './screen-guard';
import { describeReset, resetButtons } from './buttons-reset';
import { menuRotation, openSettings } from './settings';
import { serveMedias } from './media-protocol';
import { createMenuSettings } from './menu-settings';
import { createLanguageMenu } from './language-menu';
import { createUpdatesMenu } from './updates-menu';

/**
 * Touches du menu : celles des boutons de l'interface (étape « Boutons de l'interface »
 * de l'assistant, sinon les flippers, Start et Exit du jeu), les flèches, Entrée et
 * Échap d'un clavier, et H et R tant qu'aucun bouton ne les envoie (interfaceKeys).
 */
function menuKeysFor(cabinet: ButtonsSource) {
  return interfaceKeys(cabinet);
}

/** Boutons de la borne, du jeu et de l'interface, relus au démarrage du menu (les étapes « Boutons » relancent l'application). */
let buttons: CabinetButtons | undefined;
let navigation: NavigationButtons | undefined;
let KEYS = menuKeysFor(undefined);

/** Aide-mémoire « Dans le menu », avec les touches de cette borne. */
function menuKeys(): [string, string][] {
  // Boutons de l'interface : par défaut les flippers, Start et Exit du jeu.
  const keys = navigationButtons({ buttons, navigation });
  const or = (codes: string[]) => formatList(codes.map(keyLabel), 'or');
  return [
    [t('Choisir une table'), t('Précédent / Suivant ({left} / {right}) ou flèches', { left: keyLabel(keys.previous), right: keyLabel(keys.next) })],
    [t('Fiche de la table (Jouer, Modifier…)'), `Start (${or(KEYS.confirm.filter((k) => k !== 'NumpadEnter'))})`],
    ...(KEYS.help.length ? [[t('Afficher les commandes'), or(KEYS.help)] as [string, string]] : []),
    [t('Réglages de VPX'), KEYS.settings.length ? t('{keys}, ou Exit puis « Réglages de VPX »', { keys: or(KEYS.settings) }) : t('Exit puis « Réglages de VPX »')],
    [t('Menu et configuration (tables, réglages, boutons, écrans, Bureau Windows, quitter)'), t('Exit ({keys}), Tab, ou clic sur ⚙ en haut à droite', { keys: or(KEYS.exit) })],
    [t('Arrêter une partie bloquée'), t('Ctrl+Maj+K')],
  ];
}

/**
 * Pied du menu : chaque commande est aussi cliquable (code de la touche équivalente). Les
 * boutons nommés par leur rôle seulement (Flippers, Start, Exit) : un nom de touche
 * (« Bouton 14 du joystick ») ne tient pas dans un badge, et l'aide-mémoire et les réglages
 * de VPX s'ouvrent aussi depuis le menu système (Exit).
 */
function menuFooter(): [string, string?][] {
  return [
    [t('Flippers : choisir')],
    [t('Start : fiche'), KEYS.confirm[0]],
    [t('Exit : menu'), KEYS.exit[0]],
  ];
}

const FORCE_STOP_SHORTCUT = 'Control+Shift+K';
/**
 * Titre de la fenêtre du playfield, tel qu'openWindows l'a donné (rôles qu'elle dessine,
 * dans la langue de l'interface) : showMenuAgain la retrouve par lui.
 */
let playfieldTitle = 'Cyber Pinball';

type Phase = 'menu' | 'loading' | 'playing' | 'message' | 'confirmQuit' | 'library';

interface Message {
  title: string;
  lines: string[];
  /** Ce que fait Start sur ce message. */
  action?: 'wizard' | 'install-vpx' | 'addTable' | 'manualEdits' | 'buttons' | 'interface' | 'otherFrontend' | 'journey';
  /** Table d'une partie échouée : Start ouvre « Ce qu'il manque pour jouer » (action 'journey'). */
  table?: string;
}

interface State {
  phase: Phase;
  index: number;
  help: boolean;
  message?: Message;
  /** Constat bref en haut du menu (configuration de la borne changée), effacé après quelques secondes. */
  banner?: string;
}

const loc = locations();
const { profile } = vpxProfile(loc);
let tables: TableEntry[] = [];
let windows = new Map<RoleId, BrowserWindow>();
/** Rotation des fenêtres du playfield, pour un joueur placé au bord des flippers. */
let rotation: Rotation = 0;
/** Écran de chaque rôle de la borne, au démarrage du menu (écran du navigateur intégré). */
let menuAssignments: Partial<Record<RoleId, ObservedDisplay>> = {};
let state: State = { phase: 'menu', index: 0, help: false };
/** Rôles dessinés par chaque fenêtre : le sien (playfield) et ceux de ses zones. */
let windowRoles = new Map<RoleId, RoleId[]>();
/** Zone de chaque rôle à l'écran, en pixels physiques : pour savoir lesquels VPX occupe pendant la partie. */
let roleRects: RoleRect[] = [];
/** Rôles que VPX occupe pendant la partie (sa fenêtre passe devant la nôtre) : figés, quel que soit le réglage. */
let occupied = new Set<RoleId>();
let occupiedWatch: NodeJS.Timeout | undefined;
/** Relecture des fenêtres pendant la partie : B2S, DMD et PuP s'ouvrent après la fenêtre de jeu. */
const OCCUPIED_CHECK_MS = 2000;

// Médias des jeux (docs/recherche/medias.md, § 5) : résolus au démarrage du menu, quand
// le modèle de la borne et la rotation du playfield sont connus.
let medias: MenuMedias | undefined;
let mediaSettings: MenuMediaSettings = loadMenuMediaSettings(loc.dataDir);
const mediaErrorLog = mediaErrorsFile(path.join(loc.dataDir, 'logs'));
/** Tables voisines dont les médias sont préchargés par chaque fenêtre. */
const PRELOAD_OFFSETS = [1, -1, 2, -2];
/** Nom Windows de la sortie audio du menu (celle du fronton), relu au démarrage du menu. */
let audioOutput: string | undefined;
/** Numéro du lancement en cours : le son de lancement est joué une fois par lancement. */
let launchCount = 0;

/**
 * Mode attente (§ 5.2) : après le délai réglé sans bouton, une table tirée au hasard toutes
 * les N secondes, avec ses médias, au volume réduit ou coupé. Le premier bouton (ou clic) y
 * met fin sans rien faire d'autre : la sélection reste celle d'avant, rien n'est lancé.
 */
const attract = new AttractMode({
  delayMs: () => mediaSettings.attractDelay * 1000,
  intervalMs: () => mediaSettings.attractInterval * 1000,
  onEnter: () => showAttractTable(),
  onNext: () => showAttractTable(),
});
/** Table montrée en attente, et les dernières montrées (évitées au tirage). */
let attractIndex: number | undefined;
let attractRecent: number[] = [];

function showAttractTable(): void {
  if (!tables.length) return;
  attractIndex = pickAttractTable(tables.length, [state.index, ...attractRecent]);
  attractRecent = [...attractRecent, attractIndex].slice(-attractMemory(tables.length));
  broadcast();
}

/** Premier bouton en attente : retour au menu tel qu'il était, le bouton n'a pas d'autre effet. */
function leaveAttract(): boolean {
  attractIndex = undefined;
  attractRecent = [];
  broadcast();
  return true;
}

/** Table montrée en mode attente, s'il est en cours. */
function attractTable(): TableEntry | undefined {
  return attract.active && attractIndex !== undefined ? tables[attractIndex] : undefined;
}

// Fiche, ajout, médecin et suppression des tables (library.ts).
const library = createLibrary({
  root: loc.root,
  dataDir: loc.dataDir,
  vpxExe: () => vpxInstall(loc)?.exe,
  tables: () => tables,
  reload: (file) => reloadTables(file),
  enter: () => (state = { ...state, phase: 'library', help: false, message: undefined }),
  leave: () => (state = tables.length ? { ...state, phase: 'menu' } : { ...state, phase: 'message', message: noTables() }),
  play: (table) => {
    state = { ...state, index: Math.max(0, tables.indexOf(table)) };
    // Sans opérateur, la partie s'arrête seule après 10 s (et ne compte pas dans les statistiques).
    void play(table, process.env.CYBERPINBALL_AUTOPILOT ? 10_000 : undefined);
  },
  tableSettings: (table) => openVpxSettings(table),
  adjustDisplay: async (table) => {
    state = { ...state, index: Math.max(0, tables.indexOf(table)) };
    const report = await play(table, process.env.CYBERPINBALL_AUTOPILOT ? 10_000 : undefined, 'display');
    return report?.result;
  },
  vpxLogFile: () => {
    const install = vpxInstall(loc);
    return install ? path.join(vpxPrefDir(install.version), 'vpinball.log') : undefined;
  },
  playfieldOrientation: () => {
    const cabinet = loadCabinet(loc.dataDir);
    return cabinet ? playfieldOrientation(cabinet, observedDisplays(), readTextIfExists(activeVpxIni(loc))) : undefined;
  },
  quit: () => void quit(),
  keys: () => KEYS,
  windows: () => windows,
  browserScreen: () => browserScreenRect(),
  openBrowserScreen: (back) => configurations.openBrowserScreen(undefined, back),
  broadcast: () => broadcast(),
  installVpx: () => {
    library.leave();
    startVpxInstall();
  },
  setup: () => void relaunchWizard(),
});
// Configurations de la borne : la configuration active est nommée dans le sous-menu.
const configurations = createConfigurationsMenu({
  loc,
  displays: () => observedDisplays(),
  // Son « Retour » ramène au sous-menu « Configuration de la borne », d'où l'on vient.
  library: { ...library, openSystem: () => openCabinetSetup() },
  relaunch: (newConfiguration) => (newConfiguration ? relaunchWizard(undefined, true) : relaunchMenu()),
});
// Le menu système (Exit) donne aussi accès aux réglages de VPX et à la configuration de la borne.
// Les démonstrations désignent les entrées par leur libellé (data-label), pas par leur rang.
library.systemItems.splice(
  1,
  0,
  {
    icon: 'sliders',
    get label() {
      return t('Réglages de VPX');
    },
    get detail() {
      return t('Son, vue, performances, pour toutes les tables');
    },
    run: () => openVpxSettings(),
  },
  {
    icon: 'cabinet',
    get label() {
      return t('Configuration de la borne');
    },
    get detail() {
      return t('Boutons, écrans, playfield, disposition, son : chaque étape seule, ou l’assistant complet');
    },
    // Le sous-menu porte la pastille de ses entrées.
    get attention() {
      return cabinetSetupItems().some((i) => i.attention);
    },
    run: () => openCabinetSetup(),
  },
);

/**
 * Sous-menu « Configuration de la borne » : chaque étape de l'assistant se refait
 * seule (WIZARD_STEPS, core) et revient au menu, enregistrée ou non ; puis l'assistant
 * complet, les touches par défaut et les configurations de la borne.
 */
function cabinetSetupItems(): SystemItem[] {
  const steps: SystemItem[] = WIZARD_STEPS.map((step) => ({ label: step.label, detail: step.detail, icon: step.icon, run: () => relaunchWizard(step.flag) }));
  // « Écran du DMD » après la disposition des écrans, quand la borne a un DMD.
  const dmd = dmdScreenItem();
  if (dmd) steps.splice(WIZARD_STEPS.findIndex((s) => s.id === 'disposition') + 1, 0, dmd);
  return [
    ...steps,
    { label: t('Assistant complet'), detail: t('Toutes les étapes à la suite : boutons, écrans, playfield, disposition, son'), icon: 'wizard', run: () => relaunchWizard() },
    { label: t('Touches par défaut des encodeurs'), detail: t('Si les boutons ne répondent plus comme prévu (aussi à la souris)'), icon: 'keyboard', run: () => resetButtonsFromMenu() },
    configurations.systemItem,
  ];
}

/**
 * « Écran du DMD » : FullDMD ou DMD seul, dit une fois pour toutes. Pastille rouge tant
 * qu'une bande DMD seule sur un écran large reste sans réponse (dmdKindQuestion).
 */
function dmdScreenItem(): SystemItem | undefined {
  const cabinet = loadCabinet(loc.dataDir);
  if (!cabinet?.roles.dmd) return undefined;
  return {
    icon: 'dmd',
    label: t('Écran du DMD'),
    detail: t('FullDMD 16:9 ou DMD seul : ce que montre l’écran du DMD'),
    attention: Boolean(dmdKindQuestion(cabinet)),
    run: () => openDmdScreen(),
  };
}

/**
 * Écran « Écran du DMD » : l'état actuel (ambigu : « À vérifier »), puis les deux réponses avec
 * leur schéma. Start enregistre le choix (zone ajustée seulement si elle n'a pas la bonne forme,
 * withDmdKind) et relance le menu : ses fenêtres, VPinballX.ini et les PuP-Packs suivent.
 */
function openDmdScreen(): void {
  library.openCustom(() => {
    const cabinet = loadCabinet(loc.dataDir);
    const back = () => openCabinetSetup();
    if (!cabinet?.roles.dmd) return { heading: t('Écran du DMD'), icon: 'dmd', sections: [], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
    const question = dmdKindQuestion(cabinet);
    const current = dmdKindOf(cabinet);
    const screen = dmdScreen(cabinet);
    const choices = dmdKindChoices(cabinet);
    const state = question
      ? { text: t('Le DMD occupe une bande {zone} au milieu de l’écran « {screen} » ({ratio}), qui ne montre rien d’autre. Est-ce un FullDMD ?', { zone: ratioLabel(question.zoneRatio), screen: question.screen, ratio: ratioLabel(question.screenRatio) }), tone: 'warning' as const }
      : {
          text:
            current === 'fulldmd'
              ? screen
                ? t('L’écran « {screen} » est un FullDMD.', { screen: screen.label })
                : t('L’écran du DMD est un FullDMD.')
              : screen
                ? t('L’écran « {screen} » montre le DMD seul.', { screen: screen.label })
                : t('L’écran du DMD montre le DMD seul.'),
          detail: screen ? t('Zone du DMD : {ratio}.', { ratio: ratioLabel(zoneAspect(cabinet, screen)) }) : undefined,
          tone: 'info' as const,
        };
    const choose = (kind: DmdKind) => () => {
      saveCabinet(loc.dataDir, withDmdKind(cabinet, kind));
      relaunchMenu();
    };
    const all: { kind: DmdKind; label: string; detail: string; icon: 'image' | 'dmd' }[] = [
      { kind: 'fulldmd', label: t('C’est un FullDMD'), detail: t('Tout l’écran 16:9 : média FullDMD, écran 5 des PuP-Packs, DMD du jeu incrusté'), icon: 'image' },
      { kind: 'dmd', label: t('C’est un DMD seul'), detail: question ? t('Garder la bande : le DMD du jeu seul, du noir autour') : t('Une bande 4:1 : le DMD du jeu seul, du noir autour'), icon: 'dmd' },
    ];
    const offered = all.filter((c) => choices.includes(c.kind));
    // Une réponse déjà enregistrée est « Actuel » ; une forme seulement déduite ne l'est pas encore.
    const answered = cabinet.dmdKind ?? (question ? undefined : current);
    return {
      heading: t('Écran du DMD'),
      icon: 'dmd',
      lead: t('Un FullDMD montre le média FullDMD du jeu et l’écran 5 des PuP-Packs, avec le DMD du jeu incrusté. Un DMD seul ne montre que le DMD, en bande 4:1.'),
      sections: [
        { rows: [{ text: state.text, ...(state.detail && { detail: state.detail }), tone: state.tone }] },
        {
          title: t('Ce que montre cet écran'),
          kind: 'dmd-kinds',
          rows: offered.map((c, i) => ({ text: c.label, detail: c.detail, icon: c.icon, action: i, pick: true, figure: c.kind, ...(answered === c.kind && { badges: [t('Actuel')] }) })),
        },
      ],
      actions: [...offered.map((c) => ({ label: c.label, detail: c.detail, icon: c.icon, run: choose(c.kind) })), { label: t('Retour'), icon: 'back' as const, run: back }],
      back,
    };
  });
}

/** Proportions de la zone du DMD, largeur sur hauteur. */
function zoneAspect(cabinet: Cabinet, screen: { widthPx: number; heightPx: number }): number {
  const zone = roleZone(cabinet, 'dmd');
  return (zone.width * screen.widthPx) / (zone.height * screen.heightPx);
}

function openCabinetSetup(): void {
  library.openCustom(() => ({
    heading: t('Configuration de la borne'),
    icon: 'cabinet',
    lead: t('Chaque étape se refait seule, puis revient au menu des tables. « Quitter sans enregistrer » (ou Exit maintenu 2 s) en sort sans rien changer.'),
    sections: [],
    actions: [...cabinetSetupItems().map((i) => ({ label: i.label, detail: i.detail, icon: i.icon, attention: i.attention, run: i.run })), { label: t('Retour'), icon: 'back', run: () => library.openSystem() }],
    back: () => library.openSystem(),
    // La sélection va d'office sur l'entrée qui attend l'utilisateur (pastille rouge).
  }), Math.max(0, cabinetSetupItems().findIndex((i) => i.attention)));
}
// Médias, son et attente (musique, volumes, mode attente, médias pendant la partie) : un écran à part.
library.systemItems.splice(
  library.systemItems.length - 1,
  0,
  createMenuSettings({
    library,
    settings: () => mediaSettings,
    save: (next) => {
      mediaSettings = next;
      attract.reschedule();
      try {
        saveMenuMediaSettings(loc.dataDir, mediaSettings);
      } catch (error) {
        console.log(`Médias : réglage non enregistré (${(error as Error).message}).`);
      }
      broadcast();
    },
    output: () => audioOutput,
  }),
);
// Langue de l'interface : le choix relance le menu, comme un changement de configuration.
library.systemItems.splice(library.systemItems.length - 1, 0, createLanguageMenu({ library, relaunch: () => relaunchMenu() }));
// Mise à jour de Cyber Pinball : recherche discrète en arrière-plan (pastille rouge), installation à la demande.
const updates = createUpdatesMenu({
  loc,
  version: app.getVersion(),
  exeDir: path.dirname(process.execPath),
  appDir: app.getAppPath(),
  silent: OFFSCREEN,
  library,
  broadcast: () => broadcast(),
  quit: () => quit(),
  // Essais hors écran : seulement vers leur site d'essai, jamais vers GitHub.
  background: !OFFSCREEN || Boolean(process.env.CYBERPINBALL_MAJ_URL),
});
library.systemItems.splice(library.systemItems.length - 1, 0, updates.systemItem);
// Aide-mémoire des boutons : aussi ici, puisque le pied du menu ne nomme que Flippers, Start et Exit.
library.systemItems.splice(library.systemItems.length - 1, 0, {
  icon: 'gamepad',
  get label() {
    return t('Commandes de la borne');
  },
  get detail() {
    return t('Les boutons du menu et de la partie');
  },
  run: () => {
    state = tables.length ? { ...state, phase: 'menu', help: true } : { ...state, phase: 'message', message: noTables() };
    broadcast();
  },
});
// Juste avant « Quitter Cyber Pinball ».
library.systemItems.splice(library.systemItems.length - 1, 0, {
  icon: 'desktop',
  get label() {
    return t('Bureau Windows');
  },
  get detail() {
    return t('Réduit Cyber Pinball ; son bouton dans la barre des tâches le rouvre');
  },
  run: () => showDesktop(),
});

/**
 * Menu système > « Bureau Windows » : toutes les fenêtres se réduisent, le bureau et la
 * barre des tâches reviennent. Le bouton du playfield dans la barre des tâches (ou Alt+Tab)
 * rouvre le menu sur tous les écrans (restoreFromDesktop).
 */
function showDesktop(): void {
  library.leave();
  onDesktop = true;
  allowDesktop('Bureau Windows'); // i18n-ignore : raison gardée par le gardien des écrans, jamais affichée
  for (const win of windows.values()) minimizeCovered(win);
}

/** Fenêtres réduites par « Bureau Windows », en attente du retour du playfield. */
let onDesktop = false;

/** Le playfield revient du bureau : les autres écrans le suivent, le menu reprend la main. */
function restoreFromDesktop(): void {
  if (!onDesktop) return;
  onDesktop = false;
  allowDesktop(undefined);
  for (const win of windows.values()) if (win.isMinimized()) win.restore();
  windows.get('playfield')?.focus();
}

/** Menu système > « Touches par défaut des encodeurs » : le menu suit aussitôt ces touches. */
function resetButtonsFromMenu(): void {
  const reset = resetButtons();
  if (!reset) return;
  buttons = reset.cabinet.buttons;
  navigation = reset.cabinet.navigation;
  KEYS = menuKeysFor(reset.cabinet);
  library.leave();
  state = { ...state, phase: 'message', message: { title: t('Touches par défaut des encodeurs remises'), lines: describeReset(reset) } };
  broadcast();
}

export function startFrontend(): void {
  // Chromium ne donne le nom des sorties audio, et n'autorise setSinkId (sortie du fronton
  // pour la musique du menu), qu'avec ces permissions ; les pages du menu sont locales.
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'speaker-selection');
  ipcMain.on('ready', () => broadcast());
  ipcMain.on('media-error', (_event, error: MediaErrorReport) => recordMediaError(error));
  ipcMain.on('action', (_event, action: UiAction) => {
    // Un clic en mode attente y met fin, sans autre effet.
    if (attract.activity()) return void leaveAttract();
    if (action.type === 'key') handleKey({ type: 'keyDown', code: action.code, key: '' } as Input);
    else if (action.type === 'config') openConfig();
    else if (action.type === 'wheel' && state.phase === 'menu' && tables.length) {
      if (action.offset === 0) library.openSheet(tables[state.index]!);
      else state = { ...state, index: (state.index + action.offset + tables.length * 10) % tables.length };
      broadcast();
    } else library.handleAction(action);
  });

  const install = vpxInstall(loc);
  const { assignments, problem, manual, choose, selection } = syncScreens();
  tables = loc.root ? scanTables(layoutOf(loc.root).tables) : [];
  // Configuration à choisir : le menu s'ouvre droit sur l'écran principal, avec les boutons de la dernière utilisée.
  const cabinet = loadCabinet(loc.dataDir);
  // Rotation d'après l'écran du playfield tel que Windows le décrit maintenant : une
  // orientation changée hors de l'assistant fait aussi tourner le menu.
  rotation = menuRotation(choose ? undefined : cabinet, choose ? undefined : assignments.playfield);
  buttons = cabinet?.buttons;
  navigation = cabinet?.navigation;
  KEYS = menuKeysFor(cabinet);
  audioOutput = choose ? undefined : menuAudioOutput(cabinet)?.friendlyName;
  medias = new MenuMedias({ root: loc.root, dataDir: loc.dataDir, cabinet: choose ? undefined : cabinet, rotation, onChange: () => broadcast() });
  serveMedias(() => medias!.allowedDirs(tables));
  app.on('before-quit', () => {
    medias?.save();
    attract.dispose();
  });

  menuAssignments = choose ? {} : assignments;
  openWindows(assignments, cabinet && !choose ? cabinetZones(cabinet) : {});
  for (const f of selection?.findings ?? []) console.log(`Configuration de la borne : ${f.message}`);
  // Bande DMD seule sur un écran large, jamais tranchée : l'utilisateur dit une fois ce qu'est l'écran.
  if (cabinet && !choose && dmdKindQuestion(cabinet)) showBanner(t('Écran du DMD à vérifier : FullDMD ou DMD seul ? Menu système > Configuration de la borne > Écran du DMD.'));
  if (selection?.previous && selection.configuration) showBanner(t('Configuration « {name} » reconnue (avant : « {previous} »).', { name: selection.configuration.name, previous: selection.previous.name }));
  // Après une mise à jour : la nouvelle version est-elle là ?
  const updateNotice = updates.startupNotice();
  updates.startBackgroundChecks();
  if (updateNotice) showBanner(updateNotice);
  if (choose) configurations.openChooser();
  else if (problem) state = { ...state, phase: 'message', message: problem };
  else if (manual) state = { ...state, phase: 'message', message: manual };
  else if (buttons && buttonProblems(buttons).length) {
    // Relevé inutilisable : le menu suit déjà les touches par défaut (buttonKeys).
    state = {
      ...state,
      phase: 'message',
      message: {
        title: t('Boutons de la borne à refaire'),
        lines: [...buttonProblems(buttons), t('Les touches par défaut des encodeurs servent en attendant.'), t('Start : refaire l’étape « Boutons » · Exit : menu')],
        action: 'buttons',
      },
    };
  } else if (navigation && navigationProblems(navigation).length) {
    // Boutons de l'interface inutilisables : le menu suit déjà les flippers, Start et Exit du jeu (navigationButtons).
    state = {
      ...state,
      phase: 'message',
      message: {
        title: t('Boutons de l’interface à refaire'),
        lines: [...navigationProblems(navigation), t('Les flippers, Start et Exit du jeu servent en attendant.'), t('Start : refaire l’étape « Boutons de l’interface » · Exit : menu')],
        action: 'interface',
      },
    };
  }
  else if (!install) {
    state = {
      ...state,
      phase: 'message',
      message: loc.root
        ? {
            title: t("VPX n'est pas installé"),
            lines: [
              vpxArchivePresent(loc.root)
                ? t('Cyber Pinball a besoin de Visual Pinball X pour jouer. Son archive est déjà sur la borne : l’installation se passe de connexion.')
                : t('Cyber Pinball a besoin de Visual Pinball X pour jouer (téléchargement d’environ 173 Mo).'),
              t('Start : l’installer maintenant · Exit : plus tard'),
            ],
            action: 'install-vpx',
          }
        : { title: t("VPX n'est pas installé"), lines: [t('Lancez « Installer » depuis le lanceur, puis revenez ici.')] },
    };
  } else if (tables.length === 0) {
    state = { ...state, phase: 'message', message: noTables() };
  }

  const stress = process.env.CYBERPINBALL_STRESS;
  // L'endurance lance de vraies parties : jamais hors écran.
  if (stress && refuseOffscreen(t('Le test d’endurance'))) {
    process.exitCode = 1;
    return void quit();
  }
  if (stress && install) void runStress(stress, process.env.CYBERPINBALL_TABLE);
  const autopilot = process.env.CYBERPINBALL_AUTOPILOT;
  if (autopilot && !stress) void library.autopilot(autopilot.split(','), process.env.CYBERPINBALL_CAPTURE, (input) => handleKey(input), () => state.phase);
}

function noTables(): Message {
  return { title: t('Aucune table'), lines: [t('Start : ajouter une table.'), t('Exit : menu.')], action: 'addTable' };
}

/** Relit les tables après un ajout, une réparation ou une suppression, en gardant la sélection. */
function reloadTables(selectFile?: string): void {
  const current = tables[state.index]?.file;
  tables = loc.root ? scanTables(layoutOf(loc.root).tables) : [];
  // Médias ajoutés, remplacés ou supprimés avec les tables : tout est recherché à nouveau.
  medias?.invalidate();
  const wanted = selectFile ?? current;
  const index = tables.findIndex((t) => t.file.toLowerCase() === wanted?.toLowerCase());
  state = { ...state, index: index >= 0 ? index : Math.min(state.index, Math.max(0, tables.length - 1)) };
}

/**
 * Relit les écrans et remet VPinballX.ini d'accord avec eux : c'est ce qui rend
 * la borne insensible aux renumérotations de Windows.
 */
function syncScreens(overwriteManual = false): {
  assignments: Partial<Record<RoleId, ObservedDisplay>>;
  problem?: Message;
  manual?: Message;
  /** La configuration de la borne est à choisir : rien n'a été écrit. */
  choose?: boolean;
  selection?: ConfigurationSelection;
} {
  // Reconnaît d'abord la configuration branchée, puis synchronise son VPinballX.ini.
  const { selection, sync } = syncConfiguration(observedDisplays(), profile, overwriteManual);
  if (!sync) return { assignments: {}, choose: true, selection };
  const { plan } = sync;
  const blocking = plan.findings.filter((f) => f.severity === 'blocking');
  if (blocking.length) {
    return {
      assignments: plan.assignments,
      selection,
      problem: {
        title: t('Écrans à revoir'),
        lines: [
          ...blocking.map((f) => f.message),
          t('Configuration {summary}', { summary: selection!.summary }),
          t('Start : relancer l’assistant d’écrans · Exit : menu (Configurations de la borne pour en changer).'),
        ],
        action: 'wizard',
      },
    };
  }
  pendingManualEdits = plan.manualEdits;
  if (plan.manualEdits.length === 0) return { assignments: plan.assignments, selection };
  return {
    assignments: plan.assignments,
    selection,
    manual: {
      title: t('VPinballX.ini modifié à la main'),
      lines: [
        ...plan.manualEdits.map(formatManualEdit),
        t('Cyber Pinball n’a rien écrasé.'),
        t('Start : garder ces valeurs · Exit : remettre celles de Cyber Pinball'),
      ],
      action: 'manualEdits',
    },
  };
}

/** Clés gérées changées à la main, en attente du choix de l'utilisateur. */
let pendingManualEdits: ManualEdit[] = [];

/** Start : la taille revient dans le modèle, le reste est laissé à l'utilisateur. Exit : on réécrit. */
function resolveManualEdits(keep: boolean): void {
  if (keep) {
    const cabinet = loadCabinet(loc.dataDir)!;
    saveCabinet(loc.dataDir, keepManualEdits(cabinet, pendingManualEdits, readTextIfExists(activeVpxIni(loc))));
    syncScreens();
  } else syncScreens(true);
  pendingManualEdits = [];
}

/**
 * Écran du navigateur intégré (fenêtre « Récupérer ») : celui du rôle choisi dans la
 * configuration (« Écran du navigateur intégré »), relu à chaque ouverture ; en automatique
 * ou quand il n'est pas branché, le playfield si le menu n'y est pas tourné, sinon le plus
 * grand autre écran du menu (browserScreenFor). Sans écran de la borne (configuration à
 * choisir), les fenêtres du menu, chacune sur tout son écran.
 */
function browserScreenRect(): { bounds: Rectangle; notice?: string } | undefined {
  const fallback = () => [...windows].filter(([, w]) => !w.isDestroyed()).map(([role, w]) => ({ role, bounds: w.getBounds() }));
  return browserScreenFor(menuAssignments, rotation, loadCabinet(loc.dataDir)?.browserScreen, fallback);
}

/**
 * Une fenêtre par écran de la borne. Les rôles qui partagent un écran (backglass
 * et DMD sur le fronton, DMD incrusté dans le playfield) sont dessinés dans la
 * même fenêtre, chacun dans sa zone, là où VPX les affichera pendant la partie.
 */
function openWindows(assignments: Partial<Record<RoleId, ObservedDisplay>>, zones: Partial<Record<RoleId, ScreenZone>>): void {
  windows = new Map();
  windowRoles = new Map();
  const surfaces = screenSurfaces(assignments, zones);
  const cabinet = loadCabinet(loc.dataDir);
  const labelOf = (role: RoleInfo) => ({ ...role, label: cabinetRoleLabel(cabinet, role.id, role.label) });
  roleRects = surfaces.flatMap((s) => {
    const d = s.display.bounds;
    const own = s.role === 'playfield' ? [{ role: s.role, rect: { ...d } }] : [];
    const parts = s.parts.map((p) => {
      const r = zoneRect(p.zone, d);
      return { role: p.role, rect: { x: d.x + r.x, y: d.y + r.y, width: r.width, height: r.height } };
    });
    return [...own, ...parts];
  });
  // Sans playfield retrouvé, le menu s'affiche quand même sur l'écran principal.
  const pages = [
    ...(assignments.playfield ? [] : [{ role: 'playfield' as RoleId, bounds: primaryRect(), parts: [] as ScreenSurface['parts'], playfield: undefined }]),
    ...surfaces.map((s) => ({ role: s.role, bounds: windowRect(s.display.bounds), parts: s.parts, playfield: s.playfield })),
  ];
  for (const { role: id, bounds, parts, playfield } of pages) {
    const role = labelOf(ROLES.find((r) => r.id === id)!);
    const title = `Cyber Pinball — ${formatList([role, ...parts.filter((p) => p.role !== id).map((p) => labelOf(ROLES.find((r) => r.id === p.role)!))].map((r) => r.label))}`;
    if (role.id === 'playfield') playfieldTitle = title;
    const win = createWindow({
      title,
      frame: false,
      show: false,
      skipTaskbar: role.id !== 'playfield',
      backgroundColor: '#030807',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        // Les boutons passent par le processus principal : la page ne voit jamais de geste du
        // joueur, et la musique du menu ne démarrerait pas sans cela.
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    coverDisplay(win, bounds);
    nameScreen(bounds, role.label);
    win.on('page-title-updated', (e) => e.preventDefault());
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && handleKey(input)) event.preventDefault();
    });
    // Boutons d'un joystick (Pinscape…) : comme des touches.
    onJoystickInput(win, (input) => input.type === 'keyDown' && handleKey(input));
    // Seule la mise en page du playfield pivote : la fenêtre garde les bornes de l'écran.
    const turn = role.id === 'playfield' ? rotation : 0;
    win.loadFile(path.join(__dirname, '..', 'renderer', 'frontend.html'), { query: { role: role.id, rotation: String(turn), zones: JSON.stringify(parts), ...(playfield && { playfield: JSON.stringify(playfield) }) } });
    win.once('ready-to-show', () => {
      win.show();
      if (role.id === 'playfield') win.focus();
    });
    // Une fenêtre en plein écran qui revient de la barre des tâches émet « enter-full-screen »,
    // pas « restore » (Electron, Windows).
    if (role.id === 'playfield') {
      win.on('restore', () => restoreFromDesktop());
      win.on('enter-full-screen', () => restoreFromDesktop());
    }
    windows.set(role.id, win);
    windowRoles.set(role.id, [...(role.id === 'playfield' ? (['playfield'] as RoleId[]) : []), ...parts.map((p) => p.role)]);
  }
}

/** Erreur de lecture envoyée par media.js : rien n'y est fiable avant vérification. */
interface MediaErrorReport {
  url?: unknown;
  role?: unknown;
  type?: unknown;
  message?: unknown;
  /** MediaError.code d'une vidéo ou d'un son. */
  code?: unknown;
  /** true pour une image illisible. */
  image?: unknown;
}

/**
 * Erreur de lecture d'un média, remontée par une fenêtre (media.js) : gardée pour le
 * médecin. Seule une adresse du protocole des médias, vers un dossier autorisé, est retenue.
 */
function recordMediaError(error: MediaErrorReport): void {
  const file = typeof error?.url === 'string' ? mediaPathFromUrl(error.url) : undefined;
  if (!file || !medias || !isServedMedia(file, medias.allowedDirs(tables))) return;
  const message = typeof error.message === 'string' ? error.message : t('Erreur de lecture');
  try {
    const entry = logMediaError(mediaErrorLog, {
      file,
      role: typeof error.role === 'string' ? (error.role as MediaTarget) : undefined,
      type: typeof error.type === 'string' ? (error.type as MediaType) : undefined,
      code: typeof error.code === 'number' ? error.code : undefined,
      image: error.image === true,
      message,
    });
    if (entry?.count === 1) console.log(`Médias : ${message} : ${file}`);
  } catch {
    // Dossier de données en lecture seule : l'erreur n'est pas gardée.
  }
}

function handleKey(input: Input): boolean {
  const is = (group: string[]) => group.includes(input.code);
  if (input.control && input.code === 'KeyQ') return quit();
  // N'importe quel bouton en mode attente y met fin, sans autre effet ; sinon il remet le compte à zéro.
  if (attract.activity()) return leaveAttract();

  // Tab : menu et configuration, quels que soient les boutons relevés (dans le menu, Tab s'y déplace).
  if (input.code === CONFIG_KEY && ['menu', 'message', 'confirmQuit'].includes(state.phase)) return openConfig();

  switch (state.phase) {
    case 'loading':
    case 'playing':
      return true;
    case 'library':
      return library.handleKey(input);
    case 'message':
      if (!is(KEYS.confirm) && !is(KEYS.exit)) return false;
      if (is(KEYS.confirm) && state.message?.action === 'wizard') return relaunchWizard();
      if (is(KEYS.confirm) && state.message?.action === 'install-vpx') return startVpxInstall();
      if (is(KEYS.confirm) && state.message?.action === 'buttons') return relaunchWizard('--boutons');
      if (is(KEYS.confirm) && state.message?.action === 'interface') return relaunchWizard('--interface');
      if (state.message?.action === 'manualEdits') {
        resolveManualEdits(is(KEYS.confirm));
        state = { ...state, phase: tables.length ? 'menu' : 'message', message: tables.length ? undefined : noTables() };
        break;
      }
      if (state.message?.action === 'otherFrontend') {
        const run = pendingPlay;
        pendingPlay = undefined;
        state = { ...state, phase: 'menu', message: undefined };
        if (is(KEYS.confirm) && run) {
          acceptFrontends(run.frontends);
          void run.play();
          return true;
        }
        break;
      }
      if (state.message?.action === 'addTable') {
        if (is(KEYS.confirm)) library.openAdd();
        else library.openSystem();
        return true;
      }
      if (state.message?.action === 'journey' && state.message.table && is(KEYS.confirm)) {
        library.openJourney(state.message.table);
        return true;
      }
      if (tables.length) state = { ...state, phase: 'menu', message: undefined };
      // « Plus tard » sur l'installation de VPX, sans table : l'invite d'ajout, sinon le Start suivant lancerait le téléchargement.
      else if (state.message?.action === 'install-vpx') state = { ...state, message: noTables() };
      break;
    case 'confirmQuit':
      if (is(KEYS.confirm)) return quit();
      state = { ...state, phase: 'menu' };
      break;
    case 'menu':
      if (is(KEYS.help)) state = { ...state, help: !state.help };
      else if (state.help && is(KEYS.exit)) state = { ...state, help: false };
      else if (is(KEYS.previous)) state = { ...state, index: (state.index - 1 + tables.length) % tables.length };
      else if (is(KEYS.next)) state = { ...state, index: (state.index + 1) % tables.length };
      else if (is(KEYS.confirm)) library.openSheet(tables[state.index]!);
      else if (is(KEYS.settings)) openVpxSettings();
      else if (is(KEYS.exit)) library.openSystem();
      else return false;
      break;
  }
  broadcast();
  return true;
}

/**
 * Réparations des PuP-Packs avant une partie (doctor.ts, PUP_PLAY_REPAIRS) : pack mal rangé,
 * option qui laisse le fronton vide ou faite pour une autre borne, script qui coupe le pack.
 * Seuls le pack et le .vbs de Cyber Pinball changent ; l'ancien va à la corbeille.
 */
function preparePupPack(table: TableEntry): void {
  if (!loc.root) return;
  const layout = layoutOf(loc.root);
  try {
    const done = repairPupForPlay(
      table,
      { tablesDir: layout.tables, script: cachedScript(table.file, loc.dataDir), cabinet: pupCabinet(loadCabinet(loc.dataDir)) },
      { trashDir: trashDirFor(layout.trash, `Avant la partie ${path.basename(table.folder)}`) }, // i18n-ignore : nom de dossier
    );
    for (const f of done) console.log(`PuP-Pack (${table.id}) : ${f.title} → ${f.fix!.label}`);
  } catch (error) {
    console.log(`PuP-Pack (${table.id}) : réparation avant la partie impossible (${(error as Error).message}).`);
  }
}

export interface PlayReport {
  result: LaunchResult;
  focusReturned: boolean;
}

/**
 * Partie d'une table. En mode réglage de l'affichage (`display`), VPX démarre son menu ouvert
 * sur le cadrage ; la partie ne compte pas dans les statistiques et, à la fin, l'écran qui
 * l'a demandée (la fiche) reprend la main.
 */
async function play(table: TableEntry, autoStopAfterMs?: number, mode?: 'display'): Promise<PlayReport | undefined> {
  const install = vpxInstall(loc);
  if (!install) return undefined;
  // Hors écran, une partie simulée (CYBERPINBALL_PARTIE_SIMULEE : rôles qu'elle occupe,
  // « backglass,dmd », ou vide) montre chargement, partie et retour sans lancer VPX.
  const simulated = OFFSCREEN ? process.env.CYBERPINBALL_PARTIE_SIMULEE : undefined;
  const refused = simulated === undefined ? refuseOffscreen(t('Lancer une partie de VPX')) : undefined;
  if (refused) {
    state = { ...state, phase: 'message', help: false, message: { title: t('Partie impossible hors écran'), lines: [refused, t('Start ou Exit : revenir au menu.')] } };
    broadcast();
    return undefined;
  }

  // Un autre menu de borne ouvert depuis (PinUP Popper…) réagirait aussi aux boutons pendant la partie.
  const others = unacceptedFrontends();
  if (others.length) {
    const names = frontendNames(others);
    pendingPlay = { frontends: others, play: () => play(table, autoStopAfterMs, mode) };
    state = {
      ...state,
      phase: 'message',
      help: false,
      message:
        others.length > 1
          ? {
              title: t('{names} sont ouverts', { names }),
              lines: [
                t('Pendant la partie, {names} réagiraient aussi aux boutons de la borne et pourraient prendre les écrans ou l’afficheur DMD.', { names }),
                t('Fermez {names} depuis leur menu (Quitter), puis relancez la partie.', { names }),
                t('Start : jouer quand même · Exit : revenir au menu'),
              ],
              action: 'otherFrontend',
            }
          : {
              title: t('{names} est ouvert', { names }),
              lines: [
                t('Pendant la partie, {names} réagirait aussi aux boutons de la borne et pourrait prendre les écrans ou l’afficheur DMD.', { names }),
                t('Fermez {names} depuis son menu (Quitter), puis relancez la partie.', { names }),
                t('Start : jouer quand même · Exit : revenir au menu'),
              ],
              action: 'otherFrontend',
            },
    };
    broadcast();
    return undefined;
  }

  // Dès le chargement : son écran rappelle les boutons du menu de VPX, pas ceux du jeu.
  displayMode = mode === 'display';
  state = { ...state, phase: 'loading', help: false };
  launchCount++;
  broadcast();
  const loadingMs = Number(process.env.CYBERPINBALL_LOADING_MS ?? 2500);
  await delay(Math.min(400, loadingMs));
  await capture('chargement');
  await delay(Math.max(0, loadingMs - 400));

  // Les écrans ont pu bouger depuis le démarrage du menu, la configuration de la borne aussi.
  const { problem, choose, selection } = syncScreens();
  if (choose || problem) displayMode = false;
  if (choose) {
    configurations.openChooser(t('Avant de jouer, choisissez la configuration branchée : elle décide des écrans de VPX.'));
    return undefined;
  }
  if (problem) {
    state = { ...state, phase: 'message', message: problem };
    broadcast();
    return undefined;
  }

  // PuP-Pack : ce qui l'empêcherait de s'afficher est réglé avant la partie, sans rien demander.
  preparePupPack(table);

  // Les fenêtres du menu restent derrière VPX, sans jamais lui prendre le focus : l'écran de
  // chargement jusqu'à ce que sa fenêtre de jeu s'affiche, puis le fond de partie de chaque
  // écran (viewFor). Celui que VPX n'occupe pas (topper, backglass sans .directb2s) reste couvert.
  playing = table;
  hideTaskbars();
  const startedAt = new Date();
  const onPlaying = () => {
    state = { ...state, phase: 'playing' };
    watchOccupied(simulated?.split(',').filter((r): r is RoleId => ROLES.some((x) => x.id === r)));
    broadcast();
    if (autoStopAfterMs) setTimeout(() => game.stop(), autoStopAfterMs);
  };
  const game =
    simulated !== undefined
      ? simulateVpx({ onPlaying })
      : launchVpx({ exe: install.exe, ini: activeVpxIni(loc), table: table.file, display: displayMode, vpxPrefDir: vpxPrefDir(install.version), onPlaying });
  // Une partie simulée ne prend aucun raccourci global au poste.
  if (simulated === undefined) globalShortcut.register(FORCE_STOP_SHORTCUT, () => game.stop());
  const result = await game.done;
  if (simulated === undefined) globalShortcut.unregister(FORCE_STOP_SHORTCUT);
  stopWatchOccupied();
  playing = undefined;
  displayMode = false;

  // Les barres des tâches reviennent avant que le menu reprenne le premier plan : redevenu
  // fenêtre plein écran active, il les fait repasser derrière lui.
  restoreTaskbars();
  const focusReturned = await showMenuAgain();
  // Fenêtres de l'éditeur de VPX masquées ou fermées pendant la partie : rien à faire
  // pour le joueur, mais le signe qu'un réglage ou une version de VPX a changé.
  for (const notice of result.notices) console.log(`VPX (${table.id}) : ${notice}`);

  if (mode === 'display') return { result, focusReturned };
  if (result.ok) {
    // Les parties du test automatique ne comptent pas dans les statistiques.
    if (!autoStopAfterMs) recordPlay(table, startedAt, result.seconds);
    tables = tables.map((t) => (t.id === table.id ? { ...t, info: readInfo(t.infoFile) } : t));
    const unseen = simulated === undefined ? joystickMessage(install.version) : undefined;
    state = unseen ? { ...state, phase: 'message', message: unseen } : { ...state, phase: 'menu' };
  } else {
    state = { ...state, phase: 'message', message: explain(result, table) };
  }
  // Configuration de la borne changée juste avant la partie : VPX avait déjà les bons
  // écrans, le menu les reprend en redémarrant.
  if (selection?.previous && result.ok) relaunchMenu();
  broadcast();
  return { result, focusReturned };
}

/** Table en cours de partie : chaque fenêtre affiche son fond de partie. */
let playing: TableEntry | undefined;
/** Partie lancée pour régler l'affichage : le chargement rappelle les boutons du menu de VPX. */
let displayMode = false;

/** Partie retenue par l'avertissement « autre menu ouvert », lancée sur Start. */
let pendingPlay: { frontends: OtherFrontend[]; play: () => Promise<PlayReport | undefined> } | undefined;

/**
 * Pendant la partie, relit la pile des fenêtres de Windows toutes les 2 s : un rôle dont la
 * zone passe sous une fenêtre d'un autre processus (VPX, son B2S, PinMAME, PuP) est occupé,
 * et son fond de partie reste figé. Partie simulée : les rôles donnés. Rien n'est montré
 * ni mis au premier plan : seul l'état des fenêtres change.
 */
function watchOccupied(simulated: RoleId[] | undefined): void {
  const update = (roles: RoleId[]) => {
    const next = new Set(roles);
    if (next.size === occupied.size && [...next].every((r) => occupied.has(r))) return;
    occupied = next;
    console.log(`Partie : écrans occupés par VPX : ${[...occupied].join(', ') || 'aucun'}.`);
    broadcast();
  };
  if (simulated) return update(simulated);
  const check = () => {
    try {
      update(occupiedRoles(roleRects, listWindows((w) => w.visible), process.pid));
    } catch {
      // Pile des fenêtres illisible un instant : le dernier constat reste.
    }
  };
  check();
  occupiedWatch = setInterval(check, OCCUPIED_CHECK_MS);
}

function stopWatchOccupied(): void {
  if (occupiedWatch) clearInterval(occupiedWatch);
  occupiedWatch = undefined;
  occupied = new Set();
}

/** Le menu, resté derrière VPX, reprend le premier plan ; renvoie true s'il est bien revenu. */
async function showMenuAgain(): Promise<boolean> {
  for (const win of windows.values()) if (!isShown(win)) win.show();
  const playfield = windows.get('playfield');
  playfield?.focus();
  // Hors écran, aucune fenêtre n'a de premier plan à reprendre.
  if (OFFSCREEN) return true;
  const ours = () => foregroundWindow()?.pid === process.pid;
  for (let attempt = 0; attempt < 10 && !ours(); attempt++) {
    await delay(150);
    const target = visibleWindowsOf(process.pid).find((w) => w.title === playfieldTitle);
    if (target) bringToFront(target);
  }
  return ours();
}

/**
 * Boutons de joystick de la borne que VPX n'a pas trouvés à cette partie (vpinball.log) alors
 * qu'il voyait d'autres joysticks : Cyber Pinball et VPX ne nomment pas le joystick de la même
 * façon, et ces boutons ne répondent pas en jeu. Le relevé est à refaire.
 */
function joystickMessage(version: string): Message | undefined {
  const log = readTextIfExists(path.join(vpxPrefDir(version), 'vpinball.log'));
  if (!log) return undefined;
  const seen = joysticksInVpxLog(log);
  const unseen = joysticksUnseenByVpx(loadCabinet(loc.dataDir)?.buttons, seen);
  if (!unseen.length) return undefined;
  console.warn(`Joysticks des boutons absents de vpinball.log : ${unseen.join(', ')} ; VPX a vu ${seen.map((j) => `${j.name} (${j.id})`).join(', ')}`); // i18n-ignore : console
  return {
    title: t('Boutons du joystick introuvables dans VPX'),
    lines: [
      t('VPX a vu {seen}, mais pas le joystick des boutons relevés ({unseen}) : ces boutons n’ont pas répondu pendant la partie.', { seen: formatList(seen.map((j) => j.name), 'and'), unseen: unseen.join(', ') }),
      t('Start : refaire l’étape « Boutons » · Exit : menu'),
    ],
    action: 'buttons',
  };
}

/**
 * Partie échouée : ce qu'en dit VPX, puis Start mène à « Ce qu'il manque pour jouer », qui
 * relit la table, dit ce qui manque et où le trouver. Seule la ROM empêche une table de
 * démarrer (playable.ts) ; un script arrêté par un DMD sans son dossier est signalé comme
 * tel, le dossier restant proposé (« Pour aller plus loin »), pas exigé.
 */
function explain(result: LaunchResult, table: TableEntry): Message {
  const lines = [result.message ?? t('Erreur inconnue.')];
  if (result.message && /can't start game/i.test(result.message)) {
    lines.push(t('La ROM de cette table est introuvable : elle doit être dans le dossier pinmame\\roms de la table.'));
  }
  const dmdFolder = cachedScript(table.file, loc.dataDir)?.dmdFolder;
  const scriptStopped = /type (mismatch|incompatible)/i.test([result.message ?? '', ...result.logTail].join('\n'));
  if (dmdFolder && scriptStopped && !fs.existsSync(path.join(table.folder, dmdFolder))) {
    lines.push(t('Le script s’est arrêté sur le DMD qu’il dessine : son dossier « {folder} » manque. Start : le récupérer (« Pour aller plus loin »).', { folder: dmdFolder }));
  }
  lines.push(...result.notices);
  if (result.logTail.length) lines.push(t('Fin du journal de VPX :'), ...result.logTail.slice(-5));
  return { title: t('La partie n’a pas pu se dérouler'), lines, action: 'journey', table: table.file };
}

/**
 * Test sans opérateur du critère du jalon 2 : N lancements d'affilée, chacun
 * arrêté après S secondes de jeu, en vérifiant que le menu reprend le premier plan.
 * CYBERPINBALL_STRESS="N,S", CYBERPINBALL_TABLE = morceau du nom de la table.
 */
async function runStress(spec: string, tableFilter?: string): Promise<void> {
  const [count = 5, seconds = 10] = spec.split(',').map(Number);
  const index = tableFilter ? tables.findIndex((t) => t.id.toLowerCase().includes(tableFilter.toLowerCase())) : 0;
  if (index < 0) {
    console.log(`Aucune table ne correspond à « ${tableFilter} ».`);
    return void quit();
  }
  await delay(2000);
  state = { ...state, index };
  broadcast();
  await delay(300);
  await capture('menu');
  state = { ...state, help: true };
  broadcast();
  await delay(300);
  await capture('commandes');
  state = { ...state, help: false };
  const runs: { run: number; ok: boolean; failure?: string; load?: number; played: number; focus: boolean; notices: string[]; uncovered: string[] }[] = [];
  takeCoverIncidents();
  for (let run = 1; run <= count; run++) {
    const report = await play(tables[index]!, seconds * 1000);
    const r = report?.result;
    runs.push({
      run,
      ok: Boolean(r?.ok),
      failure: r?.failure,
      load: r?.loadSeconds,
      played: r?.seconds ?? 0,
      focus: Boolean(report?.focusReturned),
      notices: r?.notices ?? [],
      // Constats du gardien des écrans pendant ce lancement (chargement, partie, retour).
      uncovered: takeCoverIncidents(),
    });
    const last = runs.at(-1)!;
    console.log(
      `#${run} ${last.ok ? 'ok' : `ÉCHEC (${last.failure}: ${r?.message ?? ''})`} chargement ${last.load?.toFixed(1) ?? '-'} s, jeu ${last.played.toFixed(1)} s, retour du focus : ${last.focus ? 'oui' : 'NON'}, autres fenêtres de VPX : ${last.notices.length || 'aucune'}, écrans découverts : ${last.uncovered.length || 'aucun'}`,
    );
    if (state.phase === 'message') state = { ...state, phase: 'menu', message: undefined };
    await delay(1500);
  }
  const okRuns = runs.filter((r) => r.ok && r.focus).length;
  console.log(`Bilan : ${okRuns}/${count} lancements réussis avec retour du focus.`);
  const uncovered = runs.filter((r) => r.uncovered.length).length;
  console.log(`Écrans : ${uncovered ? `${uncovered}/${count} lancements avec un écran découvert` : 'toujours couverts'}.`);
  const logDir = path.join(loc.dataDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, `stress-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(runs, null, 2));
  quit();
}

/** Captures d'écran pour les tests sans opérateur (CYBERPINBALL_CAPTURE = dossier). */
async function capture(step: string): Promise<void> {
  const dir = process.env.CYBERPINBALL_CAPTURE;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  for (const [role, win] of windows) {
    if (!isShown(win)) continue;
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${step}-${role}.png`), image.toPNG());
  }
}

/** Téléchargement de VPX depuis l'écran, avec la progression sur le playfield. */
function startVpxInstall(): boolean {
  const root = loc.root!;
  const show = (lines: string[], action?: Message['action']) => {
    state = { ...state, phase: 'message', message: { title: t('Installation de VPX'), lines, action } };
    broadcast();
  };
  show([t('Préparation…')]);
  installVpx(root, (p) =>
    show([t('Téléchargement : {percent} % ({received} / {total} Mo)', { percent: p.percent, received: p.receivedMb, total: p.totalMb }), t('Ne débranchez pas la borne.')]),
  )
    .then((version) => {
      reloadTables();
      const done = t('Visual Pinball X {version} est installé et vérifié.', { version });
      if (tables.length) show([done, t('Start ou Exit : aller aux tables.')]);
      else {
        // Pas encore de table : on enchaîne sur l'ajout.
        state = { ...state, phase: 'message', message: { ...noTables(), lines: [done, ...noTables().lines] } };
        broadcast();
      }
    })
    .catch((error: Error) => show([t('L’installation a échoué : {error}', { error: error.message }), t('Start : réessayer · Exit : plus tard')], 'install-vpx'));
  return true;
}

/**
 * Réglages de VPX par-dessus le menu (ou la fiche) : généraux, ou propres à une
 * table. Le focus revient au playfield à la fermeture.
 */
function openVpxSettings(table?: TableEntry): void {
  const playfield = windows.get('playfield');
  const target = table ? ({ scope: 'table', table } as const) : ({ scope: 'global' } as const);
  // À la fermeture de l'application, le playfield peut être détruit avant les réglages.
  void openSettings(target, { bounds: playfield?.getBounds(), rotation, onClose: () => playfield && !playfield.isDestroyed() && playfield.focus() });
}

/**
 * Roue dentée ou Tab : menu et configuration, depuis le menu des tables et ses
 * messages, même quand les boutons relevés ne répondent plus comme prévu.
 */
function openConfig(): boolean {
  if (state.phase === 'loading' || state.phase === 'playing') return true;
  state = { ...state, help: false };
  library.openSystem();
  return true;
}

/** Assistant complet, ou seulement l'une de ses étapes (option de WIZARD_STEPS : --boutons, --son…) ; ou une nouvelle configuration. */
function relaunchWizard(stepFlag?: string, newConfiguration = false): boolean {
  relaunchCovered([...process.argv.slice(1), '--assistant', ...(stepFlag ? [stepFlag] : []), ...(newConfiguration ? ['--nouvelle-configuration'] : [])]);
  return true;
}

/** Relance le menu : une autre configuration de la borne rouvre ses fenêtres sur ses écrans. */
function relaunchMenu(): void {
  // Par le gardien des écrans, comme toute relance : aucun écran ne montre le bureau entre les deux.
  relaunchCovered(process.argv.slice(1));
}

/** Constat bref en haut du menu, qui s'efface seul : il ne demande aucun bouton. */
function showBanner(text: string): void {
  state = { ...state, banner: text };
  broadcast();
  setTimeout(() => {
    state = { ...state, banner: undefined };
    broadcast();
  }, 12_000);
}

function quit(): boolean {
  app.quit();
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function viewFor(role: RoleId) {
  // En mode attente, chaque écran montre la table tirée au hasard ; la sélection ne bouge pas.
  const shown = attractTable();
  const table = shown ?? tables[state.index];
  // Le logo n'est cherché que pour la liste, dessinée par le playfield.
  const wheel = (t: TableEntry) => (role === 'playfield' ? medias?.wheel(t) : undefined);
  const describe = (t: TableEntry) => ({
    title: t.title,
    manufacturer: t.manufacturer,
    year: t.year,
    subtitle: [t.manufacturer, t.year].filter(Boolean).join(' · '),
    version: t.version,
    plays: t.info.User?.StartCount ?? 0,
    lastRun: t.info.User?.LastRun,
    wheel: wheel(t),
  });
  // Voisines de la table choisie, pour la liste et la roue : identité stable (le fichier),
  // titre, fabricant et année (logo de repli de la roue), version et logo.
  const neighbor = (t: TableEntry, offset: number) => ({ offset, key: t.file, title: t.title, manufacturer: t.manufacturer, year: t.year, version: t.version, wheel: wheel(t) });
  // Neuf places : sept visibles (roue Médaillons), et une de chaque côté d'où les logos entrent.
  const neighbors = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
    .filter(() => tables.length > 0)
    .map((offset) => neighbor(tables[(state.index + offset + tables.length * 10) % tables.length]!, offset));
  // Média de chaque rôle de cette fenêtre (le sien et ceux de ses zones), et ceux des voisines à précharger.
  const roles = windowRoles.get(role) ?? [role];
  const mediasOf = (t: TableEntry) => (medias ? Object.fromEntries(roles.map((r) => [r, medias!.roleMedia(t, r)])) : {});
  const preload =
    !shown && table && medias && tables.length > 1
      ? [...new Set(PRELOAD_OFFSETS.map((o) => tables[(state.index + o + tables.length * 10) % tables.length]!))]
          .filter((t) => t !== table)
          .flatMap((t) => roles.map((r) => medias!.roleMedia(t, r)))
          .filter((v) => v.url)
      : [];
  return {
    role,
    phase: state.phase,
    help: state.help,
    count: tables.length,
    position: state.index + 1,
    table: table ? describe(table) : undefined,
    // Moins de neuf tables : chacune une seule fois (aucune répétée pour remplir), réparties de
    // part et d'autre de la table choisie, en boucle comme la liste : la roue reste centrée.
    neighbors: tables.length >= 9 ? neighbors : tables.map((t, i) => neighbor(t, ((i - state.index + tables.length * 2 + Math.floor((tables.length - 1) / 2)) % tables.length) - Math.floor((tables.length - 1) / 2))),
    menuLayout: mediaSettings.menuLayout,
    medias: table ? mediasOf(table) : {},
    preload,
    // Chargement : la vidéo Loading du jeu sous les commandes de la partie, sur le playfield.
    loading: state.phase === 'loading' && role === 'playfield' && medias && table ? medias.typeMedia(playing ?? table, 'playfield', 'Loading') : undefined,
    // Fronton du jeu choisi (image Backglass), en fond du menu au bureau, à côté du plateau.
    backglass: role === 'playfield' && medias && table && !shown ? medias.typeMedia(table, 'backglass', 'Backglass') : undefined,
    message: state.message,
    banner: state.banner,
    /** Pastille rouge sur la roue dentée : une entrée du menu système attend l'utilisateur. */
    attention: library.attention(),
    library: state.phase === 'library' ? library.view() : undefined,
    // Mode attente : la table montrée, son logo, et l'invite du playfield.
    attract: shown ? { ...describe(shown), wheel: medias?.wheel(shown) } : undefined,
    // Partie en cours (fenêtre de jeu de VPX à l'écran) : fond de partie de chaque rôle de
    // l'écran, selon « médias pendant la partie » et ce que VPX occupe. Avant, au chargement,
    // les écrans gardent les médias du jeu, animés, jusqu'à ce que VPX les recouvre.
    game:
      playing && state.phase === 'playing'
        ? {
            role,
            table: describe(playing),
            file: playing.file,
            mode: mediaSettings.game,
            medias: mediasOf(playing),
            play: Object.fromEntries(roles.map((r) => [r, momentScreen('game', r, { game: mediaSettings.game, occupied: occupied.has(r) }).play])),
          }
        : undefined,
    // Le son du menu ne sort que d'une fenêtre : celle du playfield.
    sound: role === 'playfield' ? soundView() : undefined,
    gameKeys: gameKeys(buttons),
    loadingKeys: displayMode ? { title: t('Réglage de l’affichage'), rows: displayKeys(buttons) } : { title: t('Commandes de la partie'), rows: gameKeys(buttons) },
    menuKeys: menuKeys(),
    footer: menuFooter(),
    nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0], help: KEYS.help[0] },
  };
}

/** Moment du menu, pour le son : chargement, partie, ou navigation (fiche et messages compris). */
function moment(): MenuMoment {
  if (attractTable()) return 'attract';
  return state.phase === 'playing' ? 'game' : state.phase === 'loading' ? 'loading' : 'browse';
}

/**
 * Ce que joue la fenêtre du playfield (app/renderer/menu-audio.js) : musique du jeu choisi,
 * son de lancement, volume du son de sa vidéo, sur la sortie du fronton.
 */
function soundView() {
  const table = playing ?? attractTable() ?? tables[state.index];
  const now = moment();
  const plan =
    table && medias
      ? menuSound(now, mediaSettings, { music: medias.sound(table, 'Audio'), launch: now === 'loading' ? medias.sound(table, 'AudioLaunch') : undefined }, tableMediaVolume(table))
      : { video: 0 };
  return { ...plan, launchId: plan.launch ? launchCount : undefined, output: audioOutput };
}

function broadcast(): void {
  // Le mode attente n'est permis que sur le menu des tables (ni aide, ni fiche, ni message, ni partie).
  attract.allow(state.phase === 'menu' && !state.help && tables.length > 0 && !onDesktop);
  if (!attract.active) attractIndex = undefined;
  for (const [role, win] of windows) {
    if (!win.isDestroyed()) win.webContents.send('state', viewFor(role));
  }
}
