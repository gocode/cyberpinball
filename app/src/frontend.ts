// Menu des tables : une fenêtre par écran de la borne, pilotée aux boutons.
// Lancer une table : écran de chargement avec les commandes, VPX en -Play par-dessus
// les fenêtres du menu (qui restent derrière lui, en fond de partie), puis retour au
// menu avec reprise du premier plan.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, globalShortcut, ipcMain, session, type Input, type Rectangle } from 'electron';
import {
  ArcadeHours,
  CONFIG_KEY,
  STOP_IDLE_FALLBACK_MS,
  STOP_NOTICE_MS,
  arcadeHoursClock,
  powerSimulated,
  powerTexts,
  powerUnavailable,
  SYSTEM_ITEMS,
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
  defaultMediaView,
  watchMediaChanges,
  type MediaWatch,
  isServedMedia,
  loadMenuMediaSettings,
  mediaPathFromUrl,
  menuAudioOutput,
  menuSound,
  AttractMode,
  attractMemory,
  momentScreen,
  pickAttractTable,
  samePath,
  screensTable,
  tableContents,
  occupiedRoles,
  confusableRoles,
  vpxWindowMoves,
  saveMenuMediaSettings,
  tableMediaVolume,
  newRecords,
  uiSoundCue,
  LaunchCinema,
  type CinemaView,
  type PowerAction,
  type PowerOutcome,
  type StopNotice,
  type UiSoundId,
  type MenuMediaSettings,
  type MenuMoment,
  type MenuPhase,
  type RoleRect,
  type Rect,
  type AncillaryRoleId,
  type CabinetButtons,
  type CabinetTilt,
  type ConfigurationSelection,
  type ManualEdit,
  type ObservedDisplay,
  type RoleId,
  type Rotation,
  type ScreenSurface,
  type ScreenZone,
  liveDressCoverage,
  DRESS_COVERED,
  type TableDressing,
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
  accelerator,
  shownKeys,
  matchesShortcut,
  shortcutKeys,
  shortcutLabel,
  SHORTCUTS,
  GuestMode,
  type GuestDoor,
  cachedFrame,
  frameCacheFile,
  liveDmdArea,
  readTableRecords,
  vpRegFile,
  playStats,
  presenceTable,
  socialNetMode,
  type DmdAnimationName,
  type DmdAnimationOptions,
  type FrameRecord,
  type HighScore,
  type TableRecords,
  type LegacyOrientation,
} from '@cyberpinball/core';
import { bringToFront, foregroundWindow, listWindows, moveWindow, visibleWindowsOf } from '@cyberpinball/win-displays';
import { observedDisplays } from './displays';
import { browserScreenFor } from './browser-screen';
import { createWindow, isShown, OFFSCREEN, primaryRect, refuseOffscreen, windowRect } from './offscreen';
import { installVpx, vpxArchivePresent } from './install-vpx';
import { launchVpx, simulateVpx, vpxPrefDir, type LaunchResult } from './launcher';
import { createLibrary, type ActionShortcut, type SystemItem, type UiAction } from './library';
import { cachedScript } from './vbs';
import { mediaFrame, prepareDressing } from './fulldmd';
import { LiveDmd, type LiveDmdAnimationHandle } from './live-dmd';
import { createConverter } from './media-convert';
import { onKeyInput } from './key-input';
import { onJoystickInput } from './joystick-input';
import { locations, vpxInstall, vpxProfile } from './paths';
import { activeVpxIni, syncConfiguration } from './vpx-ini';
import { createConfigurationsMenu } from './configurations-menu';
import { coverDisplay, hideCovered, minimizeCovered } from './cover-display';
import { DesktopMode } from './desktop-mode';
import { answerLegacy, legacyDesktopTurned, orientationForDesktop, orientationFromDesktop, takeOrientationProblems } from './display-orientation';
import { acceptFrontends, unacceptedFrontends } from './frontend-gate';
import { hideTaskbars, isVeil, nameScreen, relaunchCovered, restoreTaskbars, setDesktopMode, takeCoverIncidents } from './screen-guard';
import { describeReset, resetButtons } from './buttons-reset';
import { menuRotation, openSettings } from './settings';
import { serveMedias } from './media-protocol';
import { createMenuSettings } from './menu-settings';
import { createLanguageMenu } from './language-menu';
import { createUpdatesMenu } from './updates-menu';
import { createGuestMenu } from './guest-menu';
import { createFriendsMenu } from './friends-menu';
import { createFirewallRule } from './firewall-rule';
import { createFriendContent } from './friend-content';
import { createLiveGames } from './live-game';
import { createSocialNet } from './social-net';
import { seedSimulatedFriends, simulatedPlayersWanted, startSimulatedPlayers } from './social-demo';
import { createDedicatedMenu } from './dedicated-menu';
import { createDedicatedSystem } from './dedicated-system';
import { handOverOnQuit, shellSession } from './dedicated-session';
import { createPowerMenu } from './power';
import { readWakeDevices } from './arcade-hours';

/**
 * Touches du menu : celles des boutons de l'interface (étape « Boutons de l'interface »
 * de l'assistant, sinon les flippers, Start et Exit du jeu), les flèches, Entrée et
 * Échap d'un clavier, et H et R tant qu'aucun bouton ne les envoie (interfaceKeys).
 */
function menuKeysFor(cabinet: ButtonsSource) {
  return interfaceKeys(cabinet);
}

/** Raccourci d'une entrée du menu système d'après des touches de l'interface (R, H) : celles en vigueur sur cette borne. */
function interfaceShortcut(codes: string[]): ActionShortcut | undefined {
  if (!codes.length) return undefined;
  return { keys: shownKeys(codes), matches: (input) => !input.control && !input.alt && !input.meta && codes.includes(input.code) };
}

/** Boutons de la borne, du jeu et de l'interface, relus au démarrage du menu (les étapes « Boutons » relancent l'application). */
let buttons: CabinetButtons | undefined;
/** Tilt de l'étape « Tilt » : l'aide-mémoire de la partie dit le balancier simulé. */
let tilt: CabinetTilt | undefined;
let navigation: NavigationButtons | undefined;
let KEYS = menuKeysFor(undefined);

/** Aide-mémoire « Dans le menu », avec les touches de cette borne. */
function menuKeys(): [string, string][] {
  // Boutons de l'interface : par défaut les flippers, Start et Exit du jeu.
  const keys = navigationButtons({ buttons, navigation });
  const or = (codes: string[]) => formatList(codes.map(keyLabel), 'or');
  // En mode invité, seulement ce qui marche : chaque ligne passe par sa porte.
  const rows: [GuestDoor, string, string][] = [
    ['menu.choose', t('Choisir une table'), t('Précédent / Suivant ({left} / {right}) ou flèches', { left: keyLabel(keys.previous), right: keyLabel(keys.next) })],
    ['menu.sheet', guest.active ? t('Fiche de la table (Jouer, Prospectus, Règles)') : t('Fiche de la table (Jouer, Modifier…)'), `Start (${or(KEYS.confirm.filter((k) => k !== 'NumpadEnter'))})`],
    ...(KEYS.help.length ? [['menu.commands', t('Afficher les commandes'), or(KEYS.help)] as [GuestDoor, string, string]] : []),
    ['menu.vpx-settings', t('Réglages de VPX'), KEYS.settings.length ? t('{keys}, ou Exit puis « Réglages de VPX »', { keys: or(KEYS.settings) }) : t('Exit puis « Réglages de VPX »')],
    ['menu.system', t('Menu et configuration (tables, réglages, boutons, écrans, Bureau Windows, quitter)'), t('Exit ({keys}), Tab, ou clic sur ⚙ en haut à droite', { keys: or(KEYS.exit) })],
    ['shortcut.desktop', t('Bureau Windows (tous les écrans du PC), puis retour au menu'), shortcutLabel(SHORTCUTS.desktop)],
    ['game.force-stop', t('Arrêter une partie bloquée'), shortcutLabel(SHORTCUTS.forceStop)],
  ];
  return rows.filter(([door]) => guest.allows(door)).map(([, what, how]) => [what, how]);
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
    // Mode invité : Exit n'ouvre pas le menu système.
    ...(guest.allows('menu.system') ? [[t('Exit : menu'), KEYS.exit[0]] as [string, string]] : []),
  ];
}

/**
 * Titre de la fenêtre du playfield, tel qu'openWindows l'a donné (rôles qu'elle dessine,
 * dans la langue de l'interface) : showMenuAgain la retrouve par lui.
 */
let playfieldTitle = 'Cyber Pinball';

type Phase = MenuPhase;

interface Message {
  title: string;
  lines: string[];
  /** Ce que fait Start sur ce message. */
  action?: 'wizard' | 'install-vpx' | 'addTable' | 'manualEdits' | 'buttons' | 'interface' | 'otherFrontend' | 'journey' | 'power' | 'orientation';
  /** Table d'une partie échouée : Start ouvre « Ce qu'il manque pour jouer » (action 'journey'). */
  table?: string;
}

/**
 * Porte de Start sur chaque message (mode invité, GUEST_DOORS) : fermée, Start ne fait rien et
 * Exit ferme le message sans rien faire d'autre. Un message nouveau doit dire la sienne.
 */
const MESSAGE_DOORS: Record<NonNullable<Message['action']>, GuestDoor> = {
  wizard: 'message.wizard',
  'install-vpx': 'message.install-vpx',
  addTable: 'message.add-table',
  manualEdits: 'message.manual-edits',
  buttons: 'message.buttons',
  interface: 'message.interface',
  otherFrontend: 'message.other-frontend',
  journey: 'message.journey',
  power: 'message.power',
  orientation: 'message.orientation',
};

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
/**
 * Recalage des fenêtres annexes de VPX pendant la partie (vpxWindowMoves) : rôles qu'il peut
 * confondre, écran de chaque rôle et écrans branchés, déplacements déjà faits par fenêtre.
 */
let realign: { confused: RoleId[]; screens: Partial<Record<RoleId, Rect>>; displays: Rect[]; moves: Map<bigint, number> } | undefined;
/** Une fenêtre que VPX remet sans cesse sur le mauvais écran n'est plus déplacée après ce nombre d'essais. */
const REALIGN_TRIES = 3;

// Médias des jeux (docs/recherche/medias.md, § 5) : résolus au démarrage du menu, quand
// le modèle de la borne et la rotation du playfield sont connus.
let medias: MenuMedias | undefined;
/** Guet des dossiers des tables et des médias : tout changement se voit aussitôt sur chaque écran. */
let mediaWatch: MediaWatch | undefined;
let mediaSettings: MenuMediaSettings = loadMenuMediaSettings(loc.dataDir);
const mediaErrorLog = mediaErrorsFile(path.join(loc.dataDir, 'logs'));
/** Tables voisines dont les médias sont préchargés par chaque fenêtre. */
const PRELOAD_OFFSETS = [1, -1, 2, -2];
/** Nom Windows de la sortie audio du menu (celle du fronton), relu au démarrage du menu. */
let audioOutput: string | undefined;
/** Numéro du lancement en cours : le son de lancement est joué une fois par lancement. */
let launchCount = 0;
/**
 * Lancement en cinéma (cinema.ts) : l'état de la chorégraphie, que chaque fenêtre joue d'elle-même
 * (viewFor, cinemaFor). Rien ici ne l'attend : VPX part quand il partait, le relais vient du lanceur.
 */
const cinema = new LaunchCinema();

/**
 * Mode attente (§ 5.2) : après le délai réglé sans bouton, une table tirée au hasard toutes
 * les N secondes, avec ses médias, au volume réduit ou coupé. Le premier bouton (ou clic) y
 * met fin sans rien faire d'autre : la sélection reste celle d'avant, rien n'est lancé.
 */
const attract = new AttractMode({
  delayMs: () => mediaSettings.attractDelay * 1000,
  intervalMs: () => mediaSettings.attractInterval * 1000,
  onEnter: () => showAttractTable(),
  // Écrans noirs la nuit (horaire) : plus de table qui change sous le voile, rien ne tourne pour rien.
  onNext: () => (hours.night() && mediaSettings.hours.nightDim >= 100 ? undefined : showAttractTable()),
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

/** Réglages de VPX ouverts par-dessus le menu ; `about` : la table réglée (réglages d'une table, depuis sa fiche). */
let vpxSettingsOpen: { about?: TableEntry } | undefined;

/**
 * Table dont les écrans de la borne montrent les médias, et dont on entend la musique
 * (screensTable) ; undefined : l'affichage par défaut de Cyber Pinball, en silence. Hors du
 * menu des tables, seul un écran qui parle d'une table la garde (fiche, médias du jeu…).
 */
function screensSubject(): TableEntry | undefined {
  const find = (file: string | undefined) => (file ? tables.find((t) => samePath(t.file, file)) : undefined);
  return screensTable({
    phase: state.phase,
    help: state.help,
    selected: attractTable() ?? tables[state.index],
    playing,
    about: state.phase === 'library' ? find(library.table()) : state.phase === 'message' ? find(state.message?.table) : undefined,
    overlay: vpxSettingsOpen,
  });
}

/**
 * Mode invité (guestmode.ts) : gardé d'un démarrage à l'autre. Chaque porte d'entrée du menu
 * passe par lui ; la combinaison de déverrouillage suit les boutons de la borne.
 */
const guest = new GuestMode({
  dataDir: loc.dataDir,
  buttons: () => buttons,
  onChange: () => broadcast(),
  onUnlock: () => console.log('Mode invité : déverrouillé par la combinaison des boutons.'),
});
/** Cyber Pinball se ferme lui-même (quitter, relance, arrêt de Windows) : le mode invité laisse fermer ses fenêtres. */
let closing = false;

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
  audioOutput: () => audioOutput,
  openBrowserScreen: (back) => configurations.openBrowserScreen(undefined, back),
  broadcast: () => broadcast(),
  installVpx: () => {
    library.leave();
    startVpxInstall();
  },
  setup: () => void relaunchWizard(),
  guest,
  displays: () => observedDisplays(),
  vpxVersion: () => vpxInstall(loc)?.version,
});
// Santé de la borne : premier relevé peu après le démarrage, puis toutes les 30 minutes (pastille
// rouge) ; jamais pendant une partie ni son chargement.
library.watchHealth(() => state.phase === 'loading' || state.phase === 'playing');
// Configurations de la borne : la configuration active est nommée dans le sous-menu.
const configurations = createConfigurationsMenu({
  loc,
  displays: () => observedDisplays(),
  // Son « Retour » ramène au sous-menu « Configuration de la borne », d'où l'on vient.
  library: { ...library, openSystem: () => openCabinetSetup() },
  relaunch: (newConfiguration) => (newConfiguration ? relaunchWizard(undefined, true) : relaunchMenu()),
});
// Le menu système (Exit) donne aussi accès aux réglages de VPX et à la configuration de la borne ;
// l'arbre des rubriques (systemmenu.ts, core) dit où va chaque entrée.
// Les démonstrations désignent les entrées par leur libellé (data-label), pas par leur rang.
library.provideSystemItem('vpx-settings', {
  get detail() {
    return t('Son, vue, performances, pour toutes les tables');
  },
  get shortcut() {
    return interfaceShortcut(KEYS.settings);
  },
  run: () => openVpxSettings(),
});
library.provideSystemItem('cabinet', {
  get detail() {
    return t('Boutons, écrans, playfield, disposition, son : chaque étape seule, ou l’assistant complet');
  },
  // Le sous-menu porte la pastille de ses entrées.
  get attention() {
    return cabinetSetupItems().some((i) => i.attention);
  },
  run: () => openCabinetSetup(),
});

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
    heading: SYSTEM_ITEMS.cabinet.label,
    icon: SYSTEM_ITEMS.cabinet.icon,
    lead: t('Chaque étape se refait seule, puis revient au menu des tables. « Quitter sans enregistrer » (ou Exit maintenu 2 s) en sort sans rien changer.'),
    sections: [],
    actions: [...cabinetSetupItems().map((i) => ({ label: i.label, detail: i.detail, icon: i.icon, attention: i.attention, run: i.run })), { label: t('Retour'), icon: 'back', run: () => library.openSystem() }],
    back: () => library.openSystem(),
    // La sélection va d'office sur l'entrée qui attend l'utilisateur (pastille rouge).
  }), Math.max(0, cabinetSetupItems().findIndex((i) => i.attention)));
}
// Médias, son et attente (musique, volumes, mode attente, médias pendant la partie) : un écran à part.
library.provideSystemItem(
  'menu-media',
  createMenuSettings({
    library,
    settings: () => mediaSettings,
    save: (next) => {
      mediaSettings = next;
      attract.reschedule();
      hours.update();
      try {
        saveMenuMediaSettings(loc.dataDir, mediaSettings);
      } catch (error) {
        console.log(`Médias : réglage non enregistré (${(error as Error).message}).`);
      }
      broadcast();
    },
    output: () => audioOutput,
    preview: (id) => playUiSound(id),
    wakeDevices: () => wakeDevices(),
    sleepAllowed: () => !powerUnavailable('sleep', power.capabilities()),
  }),
);
// Langue de l'interface : le choix relance le menu, comme un changement de configuration.
library.provideSystemItem('language', createLanguageMenu({ library, relaunch: () => relaunchMenu() }));
// Mise à jour de Cyber Pinball : recherche discrète en arrière-plan (pastille rouge), installation à la demande.
const updates = createUpdatesMenu({
  loc,
  version: app.getVersion(),
  exeDir: path.dirname(process.execPath),
  appDir: app.getAppPath(),
  silent: OFFSCREEN,
  library,
  broadcast: () => broadcast(),
  // Borne dédiée : Shell Launcher ne relance rien, l'installeur relance lui-même Cyber Pinball.
  quit: () => {
    handOverOnQuit();
    quit();
  },
  // Essais hors écran : seulement vers leur site d'essai, jamais vers GitHub.
  background: !OFFSCREEN || Boolean(process.env.CYBERPINBALL_MAJ_URL),
});
library.provideSystemItem('updates', updates.systemItem);
// Aide-mémoire des boutons : aussi ici, puisque le pied du menu ne nomme que Flippers, Start et Exit.
library.provideSystemItem('controls', {
  get detail() {
    return t('Les boutons du menu et de la partie');
  },
  get shortcut() {
    return interfaceShortcut(KEYS.help);
  },
  run: () => {
    state = tables.length ? { ...state, phase: 'menu', help: true } : { ...state, phase: 'message', message: noTables() };
    broadcast();
  },
});
// Borne dédiée (Shell Launcher) : Cyber Pinball à la place du bureau Windows pour ce compte,
// désactivée par défaut. Quand il est le shell de la session, « Ouvrir l'Explorateur Windows »
// remplace « Bureau Windows » (il n'y a pas de bureau sans Explorateur), et « Quitter » le
// relance : sans lui, l'écran resterait noir.
const dedicatedSystem = createDedicatedSystem(loc.dataDir);
const dedicated = createDedicatedMenu({
  library,
  system: dedicatedSystem,
  dataDir: loc.dataDir,
  // L'exécutable installé ; depuis les sources, seulement avec Windows simulé (démonstrations).
  command: () => (app.isPackaged ? [process.execPath] : dedicatedSystem.simulated ? [process.execPath, app.getAppPath()] : undefined),
  shellSession: shellSession(),
  desktopKeys: shortcutLabel(SHORTCUTS.desktop),
  showDesktop: () => void showDesktop(),
});
library.provideSystemItem('dedicated', dedicated.dedicatedItem);
if (shellSession()) {
  library.provideSystemItem('explorer', dedicated.explorerItem);
  library.provideSystemItem('quit', {
    label: t('Redémarrer Cyber Pinball'),
    get detail() {
      return t('Cyber Pinball est le shell de Windows : il revient aussitôt');
    },
    run: () => relaunchMenu(),
  });
} else library.provideSystemItem('desktop', {
  get detail() {
    return t('Libère tous les écrans du PC ; {keys} ou le bouton de Cyber Pinball dans la barre des tâches ramène le menu', { keys: shortcutLabel(SHORTCUTS.desktop) });
  },
  // Touches lues dans la définition du raccourci (SHORTCUTS) : celles que reconnaissent handleKey et le raccourci global.
  get shortcut() {
    return { keys: shortcutKeys(SHORTCUTS.desktop), matches: (input: Input) => matchesShortcut(input, SHORTCUTS.desktop) };
  },
  run: () => showDesktop(),
});
// Mode invité : on joue, rien d'autre ; l'écran de l'entrée dit la combinaison qui déverrouille.
library.provideSystemItem('guest-mode', createGuestMenu({ library, guest, buttons: () => buttons }));

// Réseau des bornes (Menu système > Amis) : partage activé par défaut, démarré avec le menu ;
// jamais le vrai réseau pendant un essai sans opérateur (socialNetMode), ni le vrai pare-feu.
const socialMode = socialNetMode(process.env);
// Démonstration (docs\demo-amis.ps1) : un ami hors ligne écrit avant le démarrage, des bornes fictives après.
const socialDemo = socialMode === 'simulated' && simulatedPlayersWanted(process.env);
if (socialDemo) seedSimulatedFriends(loc.dataDir);
let stopSimulatedPlayers: (() => Promise<void>) | undefined;
let socialRedraw: NodeJS.Timeout | undefined;
/** Un ami qui arrive, une demande reçue, un transfert qui avance : l'écran se redessine, au plus quatre fois par seconde. */
function socialChanged(): void {
  socialRedraw ??= setTimeout(() => {
    socialRedraw = undefined;
    if (!closing) broadcast();
  }, 250);
}
const socialNet = createSocialNet({ dataDir: loc.dataDir, mode: socialMode, log: (line) => console.log(line), onChange: socialChanged });
const socialFirewall = createFirewallRule({ exe: process.execPath, simulated: socialMode !== 'public', log: (line) => console.log(line) });
const romsOf = (table: TableEntry) => cachedScript(table.file, loc.dataDir)?.roms ?? [];
// Bibliothèque partagée entre amis : la mienne servie si je la partage, la leur et leurs médias.
/** L'inventaire du dossier d'une table, celui de « Fichiers de la table » : ses parties, à transmettre ou déjà là. */
function tableInventory(table: TableEntry) {
  if (!loc.root) return undefined;
  const script = cachedScript(table.file, loc.dataDir);
  const facts = script && !('error' in script) ? { usesPinmame: script.usesPinmame, roms: script.roms, dmdFolder: script.dmdFolder } : undefined;
  return tableContents(table.file, { ownFolder: !samePath(table.folder, layoutOf(loc.root).tables), romLibrary: layoutOf(loc.root).roms, script: facts });
}
const friendContent = createFriendContent({
  net: socialNet,
  dataDir: loc.dataDir,
  tables: () => tables,
  root: () => loc.root,
  romsOf,
  contents: tableInventory,
  onChange: socialChanged,
  log: (line) => console.log(line),
});
/** Le menu des tables est à l'écran : une invitation peut s'y afficher sans rien interrompre. */
const liveCanShow = () => !closing && state.phase === 'menu';
// Partie en direct : invitation, départ commun, puis la table lancée ici comme par Start.
const liveGames = createLiveGames({
  net: socialNet,
  dataDir: loc.dataDir,
  tables: () => tables,
  romsOf,
  busy: () => playing !== undefined || state.phase === 'loading' || state.phase === 'playing',
  onInvite: (invite) => {
    playUiSound('coin');
    if (liveCanShow()) friendsMenu.live.openInvite(invite.id, () => library.leave());
  },
  play: async (table, onPlaying) => {
    // Le départ commun ferme l'écran ouvert (le compte à rebours), comme Start sur une table.
    if (library.isActive()) library.leave();
    state = { ...state, index: Math.max(0, tables.indexOf(table)) };
    const report = await play(table, process.env.CYBERPINBALL_AUTOPILOT ? 10_000 : undefined, undefined, { onPlaying });
    // De retour au menu : les résultats, qui se complètent à mesure que les autres reviennent.
    if (report && state.phase === 'menu') setImmediate(() => friendsMenu.live.open(() => library.leave()));
    return report ? { ok: report.result.ok, seconds: report.result.seconds, records: report.entered.map((s) => ({ score: s.score, rank: s.rank, ...(s.initials ? { initials: s.initials } : {}) })) } : undefined;
  },
  onChange: () => {
    socialChanged();
    // Le compte à rebours et l'annulation s'affichent d'eux-mêmes ; dans la gestion des tables aussi, une fois la partie acceptée.
    friendsMenu.live.follow(() => !closing && (state.phase === 'menu' || state.phase === 'library'), () => library.leave());
  },
  log: (line) => console.log(line),
});
const friendsMenu = createFriendsMenu({
  library: {
    ...library,
    catalogFor: (identity) => (identity.vpsId ? library.catalog.openGame(identity.vpsId) : library.catalog.openSearch(identity.title)),
  },
  net: socialNet,
  firewall: socialFirewall,
  content: friendContent,
  games: liveGames,
  tables: () => tables,
  romsOf,
  root: () => loc.root,
  redraw: socialChanged,
  contents: tableInventory,
  // Une table reçue arrive dans les données avant d'être rangée : la place se compte là.
  freeSpace: () => {
    try {
      const st = fs.statfsSync(loc.dataDir);
      return st.bavail * st.bsize;
    } catch {
      return undefined;
    }
  },
});
library.provideSystemItem('friends', friendsMenu.items.friends);
library.provideSystemItem('find-player', friendsMenu.items['find-player']);
library.provideSystemItem('friend-requests', friendsMenu.items['friend-requests']);
library.provideSystemItem('badges', friendsMenu.items.badges);
library.provideSystemItem('sharing', friendsMenu.items.sharing);

/** Horloge de l'horaire et des actions programmées : celle du PC, décalée seulement dans un essai qui le demande. */
const hoursClock = arcadeHoursClock(process.env, powerSimulated(process.env));

// Éteindre, mettre en veille, redémarrer (app/src/power.ts) : une confirmation, puis un écran
// noir sur chaque écran le temps que Windows prenne la main ; le menu garde ses fenêtres.
const power = createPowerMenu({
  library,
  clock: hoursClock,
  prepare: async (_action, title, line) => {
    library.leave();
    state = { ...state, phase: 'message', help: false, message: { title, lines: [line], action: 'power' } };
    broadcast();
    saveSettings();
    restoreTaskbars();
    // Le temps que chaque écran peigne l'écran noir avant que Windows n'agisse.
    await delay(600);
  },
  finish: (action, outcome) => powerFinished(action, outcome),
  clearNotice: () => (state = { ...state, banner: undefined }),
  log: (line) => console.log(line),
});

/** Après une action d'alimentation, demandée au menu ou faite par l'horaire : réveil, refus de Windows, fin d'un essai. */
function powerFinished(action: PowerAction, outcome: PowerOutcome): void {
  const menu = () => (state = tables.length ? { ...state, phase: 'menu', message: undefined } : { ...state, phase: 'message', message: noTables() });
  if (outcome.simulated) {
    menu();
    showBanner(powerTexts(action).simulated);
  } else if (outcome.ok) {
    // Réveil après la veille : le menu, tel qu'il était.
    menu();
    broadcast();
  } else {
    const titles = { shutdown: t('La borne ne s’est pas éteinte'), sleep: t('La borne ne s’est pas mise en veille'), restart: t('La borne n’a pas redémarré') };
    state = { ...state, phase: 'message', message: { title: titles[action], lines: [outcome.problem ?? t('Windows n’a pas dit pourquoi.')] } };
    broadcast();
  }
}

/**
 * Horaire de la borne (packages/core/src/arcadehours.ts) : la nuit, en attente, un voile noir
 * sur chaque écran et l'attente muette ; à l'heure dite, si personne ne joue, 30 s de préavis
 * puis la veille ou l'extinction, par le module d'alimentation (écran noir, réglages
 * enregistrés, simulée en essai). Le moindre bouton retire le préavis.
 */
const hours = new ArcadeHours({
  control: power.control,
  settings: () => mediaSettings.hours,
  idle: () => stopIdle(),
  notice: (notice) => {
    stopNotice = notice;
    broadcast();
  },
  changed: () => broadcast(),
  done: (action, outcome) => powerFinished(action, outcome),
  log: (line) => console.log(line),
  clock: hoursClock,
});
/** Préavis d'arrêt affiché, s'il y en a un. */
let stopNotice: StopNotice | undefined;

/**
 * Borne libre pour l'arrêt de l'horaire : au menu (ni partie, ni chargement, ni bureau, ni
 * action d'alimentation en cours), en mode attente ou assez longtemps sans bouton.
 */
function stopIdle(): boolean {
  if (desktop.active || state.phase === 'loading' || state.phase === 'playing' || power.control.busy) return false;
  if (state.phase === 'message' && state.message?.action === 'power') return false;
  return attract.active || attract.idleFor() >= Math.max(STOP_IDLE_FALLBACK_MS, mediaSettings.attractDelay * 1000);
}

/** Boutons qui peuvent réveiller la borne, relus au plus toutes les minutes (un périphérique branché entre-temps). */
let wakeList: { at: number; devices?: string[] | null; pending?: boolean } = { at: 0 };
function wakeDevices(): string[] | null | undefined {
  if (!wakeList.pending && Date.now() - wakeList.at > 60_000) {
    wakeList = { ...wakeList, pending: true };
    void readWakeDevices(powerSimulated(process.env)).then((devices) => {
      wakeList = { at: Date.now(), devices };
      broadcast();
    });
  }
  return wakeList.devices;
}
library.provideSystemItem('sleep', power.items.sleep);
library.provideSystemItem('restart', power.items.restart);
library.provideSystemItem('shutdown', power.items.shutdown);

/**
 * Mode bureau : chaque fenêtre de Cyber Pinball (menu, voiles du gardien des écrans, et toute
 * autre ouverte) quitte son écran, quel que soit leur nombre (desktop-mode.ts).
 */
const desktop = new DesktopMode<BrowserWindow>({
  windows: () => BrowserWindow.getAllWindows(),
  isShown,
  isVeil,
  hideVeil: hideCovered,
  showVeil: (win) => win.showInactive(),
  minimizeWindow: minimizeCovered,
  restoreWindow: (win) => win.restore(),
  raiseWindow: (win) => win.moveTop(),
});
/** Au bureau : range ce qui reviendrait sur un écran, et suit le retour d'une fenêtre rouverte. */
let desktopWatch: NodeJS.Timeout | undefined;
/** Proposition de rendre à Windows l'orientation du bureau, en attente de réponse. */
let legacyOrientation: LegacyOrientation | undefined;
const DESKTOP_WATCH_MS = 500;

/**
 * Menu système > « Borne » > « Bureau Windows », ou son raccourci depuis le menu : tous les écrans du PC
 * se libèrent, le bureau et les barres des tâches reviennent. Le même raccourci (global tant
 * que dure le mode bureau), le bouton du playfield dans la barre des tâches ou Alt+Tab
 * ramènent le menu sur tous ses écrans (restoreFromDesktop).
 */
function showDesktop(): boolean {
  if (desktop.active || state.phase === 'loading' || state.phase === 'playing') return true;
  library.leave();
  // Borne dédiée : sans Explorateur, il n'y a pas de bureau ; une fenêtre de fichiers en tient
  // lieu (sous Shell Launcher, explorer.exe n'ouvre que cela, sans barre des tâches).
  if (shellSession() && !dedicatedSystem.explorerShown()) dedicatedSystem.openExplorer();
  setDesktopMode(true);
  const away = desktop.enter();
  // Le bureau dans l'orientation de Windows, le temps d'y travailler.
  orientationForDesktop();
  console.log(`Mode bureau : ${away.length} fenêtres de Cyber Pinball rangées (${away.filter(isVeil).length} voiles), tous les écrans libres.`);
  if (!OFFSCREEN && !globalShortcut.register(accelerator(SHORTCUTS.desktop), () => restoreFromDesktop())) {
    console.warn(`Mode bureau : ${shortcutLabel(SHORTCUTS.desktop)} est déjà pris par un autre programme ; la barre des tâches ramène le menu.`);
  }
  desktopWatch = setInterval(() => {
    if (desktop.reopened()) return restoreFromDesktop();
    for (const win of desktop.clear()) console.warn(`Mode bureau : « ${win.getTitle()} » était revenue sur son écran, de nouveau rangée.`);
  }, DESKTOP_WATCH_MS);
  broadcast();
  return true;
}

/** Retour du bureau : chaque écran retrouve son voile puis sa fenêtre, le menu reprend la main. */
function restoreFromDesktop(): void {
  if (!desktop.active) return;
  clearInterval(desktopWatch);
  if (!OFFSCREEN) globalShortcut.unregister(accelerator(SHORTCUTS.desktop));
  // L'orientation de jeu revient ; un quart de tour change la taille des écrans, le menu rouvre ses fenêtres.
  const moved = orientationFromDesktop();
  desktop.leave();
  setDesktopMode(false);
  console.log('Mode bureau : retour au menu.');
  if (moved) return relaunchMenu();
  // Rappelé par le raccourci global, depuis une autre application : Windows ne laisse pas toujours le focus.
  void takeForeground();
  broadcast();
}

/** Menu système > « Borne » > « Configuration de la borne » > « Touches par défaut des encodeurs » : le menu suit aussitôt ces touches. */
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
  ipcMain.on('ready', () => {
    broadcast();
    // Fenêtre (re)chargée : elle n'a pas encore l'image du DMD vivant.
    liveDmd.resend();
  });
  ipcMain.on('media-error', (_event, error: MediaErrorReport) => recordMediaError(error));
  ipcMain.on('action', (_event, action: UiAction) => {
    // Un clic en mode attente y met fin, sans autre effet ; de même pour le préavis d'arrêt de l'horaire.
    const noticed = hours.activity();
    if (attract.activity() || noticed) return void leaveAttract();
    if (action.type === 'key') handleKey({ type: 'keyDown', code: action.code, key: '' } as Input);
    // Roue dentée (ou cadenas, en mode invité).
    else if (action.type === 'config') guest.knock('menu.system') && openConfig();
    else if (action.type === 'wheel' && state.phase === 'menu' && tables.length) {
      if (action.offset === 0) guest.knock('menu.sheet') && library.openSheet(tables[state.index]!);
      else if (guest.knock('menu.choose')) moveSelection(action.offset);
      broadcast();
    } else library.handleAction(action);
  });

  const install = vpxInstall(loc);
  const { assignments, problem, manual, choose, selection } = syncScreens();
  tables = loc.root ? scanTables(layoutOf(loc.root).tables) : [];
  // Configuration à choisir : le menu s'ouvre droit sur l'écran principal, avec les boutons de la dernière utilisée.
  const cabinet = loadCabinet(loc.dataDir);
  menuDmdKind = cabinet && !choose ? dmdKindOf(cabinet) : undefined;
  // Rotation d'après l'écran du playfield tel que Windows le décrit maintenant : une
  // orientation changée hors de l'assistant fait aussi tourner le menu.
  rotation = menuRotation(choose ? undefined : cabinet, choose ? undefined : assignments.playfield);
  buttons = cabinet?.buttons;
  tilt = cabinet?.tilt;
  navigation = cabinet?.navigation;
  KEYS = menuKeysFor(cabinet);
  audioOutput = choose ? undefined : menuAudioOutput(cabinet)?.friendlyName;
  medias = new MenuMedias({ root: loc.root, dataDir: loc.dataDir, cabinet: choose ? undefined : cabinet, rotation, onChange: () => broadcast() });
  serveMedias(() => medias!.allowedDirs(tables));
  // Média ajouté, remplacé ou supprimé, table ajoutée, renommée ou supprimée, par
  // n'importe quel chemin (Cyber Pinball ou à la main) : relu et renvoyé aux fenêtres.
  if (loc.root) {
    const layout = layoutOf(loc.root);
    mediaWatch = watchMediaChanges({
      dirs: [layout.tables, layout.media],
      onChange: (changes) => {
        if (changes.has('tables')) reloadTables();
        else medias?.invalidate();
        broadcast();
      },
    });
  }
  app.on('before-quit', () => {
    closing = true;
    guest.dispose();
    mediaWatch?.close();
    saveSettings();
    attract.dispose();
    hours.dispose();
    liveDmd.dispose();
    void stopSimulatedPlayers?.();
    friendContent.stop();
    liveGames.stop();
    void socialNet.stop();
  });

  menuAssignments = choose ? {} : assignments;
  openWindows(assignments, cabinet && !choose ? cabinetZones(cabinet) : {});
  // Horaire de la borne : nuit et arrêt programmé, d'après les réglages de medias.json.
  hours.start();
  // Réseau des bornes : présence aux amis, annuaire ; un échec s'affiche dans « Partage et réseau ».
  void socialNet.start().then(async () => {
    socialNet.checkBadges(playStats(tables));
    // La règle du pare-feu, lue sans élévation : « Partage et réseau » dit si elle manque.
    if (socialMode !== 'off') void socialFirewall.check().catch(() => undefined);
    if (socialDemo) stopSimulatedPlayers = await startSimulatedPlayers(socialNet, loc.dataDir, () => tables, (line) => console.log(line));
  });
  for (const f of selection?.findings ?? []) console.log(`Configuration de la borne : ${f.message}`);
  // Bande DMD seule sur un écran large, jamais tranchée : l'utilisateur dit une fois ce qu'est l'écran.
  // Orientation des écrans : ce que le démarrage (ou la dernière fermeture) n'a pas pu rendre.
  const orientationProblems = takeOrientationProblems();
  if (orientationProblems.length) showBanner(orientationProblems.join(' '));
  const legacy = choose ? undefined : legacyDesktopTurned();
  if (cabinet && !choose && dmdKindQuestion(cabinet)) showBanner(t('Écran du DMD à vérifier : FullDMD ou DMD seul ? Menu système > Borne > Configuration de la borne > Écran du DMD.'));
  if (selection?.previous && selection.configuration) showBanner(t('Configuration « {name} » reconnue (avant : « {previous} »).', { name: selection.configuration.name, previous: selection.previous.name }));
  // Après une mise à jour : la nouvelle version est-elle là ?
  const updateNotice = updates.startupNotice();
  updates.startBackgroundChecks();
  if (updateNotice) showBanner(updateNotice);
  if (guest.active) console.log('Mode invité : actif (réglage gardé) ; le menu système et les réglages sont fermés.');
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
  else if (legacy) {
    // Borne configurée avant le 27/10/2026 : Windows garde l'orientation de jeu, bureau compris.
    legacyOrientation = legacy;
    state = {
      ...state,
      phase: 'message',
      message: {
        title: t('Bureau Windows tourné par Cyber Pinball'),
        lines: [
          t('Une version précédente de l’assistant a tourné l’écran du playfield dans Windows ({playing}°) et l’y a laissé : hors de Cyber Pinball, le bureau et le menu Démarrer de cet écran sont tournés aussi.', { playing: legacy.playing }),
          t('Désormais, Cyber Pinball ne le tourne que pendant qu’il est ouvert, et rend son orientation à Windows en sortant. Les tables restent dans le même sens.'),
          t('Start : rendre à Windows l’orientation {origin}° (l’écran clignote deux fois) · Exit : garder {playing}° pour le bureau', { origin: legacy.origin, playing: legacy.playing }),
        ],
        action: 'orientation',
      },
    };
  } else if (!install) {
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
  if (autopilot && !stress) void library.autopilot(autopilot.split(','), process.env.CYBERPINBALL_CAPTURE, (input) => (input.type === 'keyUp' ? handleKeyUp(input) : handleKey(input)), () => state.phase);
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
  // Dossier des tables ou des médias créé depuis le démarrage (première table) : guetté aussi.
  mediaWatch?.rearm();
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
  // Journal : sens de la partie, écrans à revoir (le menu n'en montre que les points bloquants).
  for (const f of plan.findings.filter((f) => f.severity === 'warning')) console.log(`Synchronisation : ${f.message}`);
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
    // Relâchements compris (combinaison du mode invité) : onKeyInput les fait arriver (key-input.ts).
    onKeyInput(win, handleKey, handleKeyUp);
    // Boutons d'un joystick (Pinscape…) : comme des touches.
    onJoystickInput(win, (input) => (input.type === 'keyDown' ? handleKey(input) : handleKeyUp(input)));
    // Mode invité : Alt+F4 ne ferme pas le menu. Cyber Pinball seul se ferme (quitter, relance), et Windows à son arrêt.
    win.on('close', (event) => {
      if (!closing && !guest.knock('window.close')) event.preventDefault();
    });
    win.on('query-session-end', () => (closing = true));
    // Seule la mise en page du playfield pivote : la fenêtre garde les bornes de l'écran.
    const turn = role.id === 'playfield' ? rotation : 0;
    win.loadFile(path.join(__dirname, '..', 'renderer', 'frontend.html'), { query: { role: role.id, rotation: String(turn), zones: JSON.stringify(parts), ...(playfield && { playfield: JSON.stringify(playfield) }) } });
    win.once('ready-to-show', () => {
      win.show();
      if (role.id === 'playfield') win.focus();
    });
    // Une fenêtre en plein écran qui revient de la barre des tâches émet « enter-full-screen »,
    // pas « restore » (Electron, Windows). Seul le playfield a un bouton dans la barre des
    // tâches ; Alt+Tab rouvre aussi les autres.
    win.on('restore', () => restoreFromDesktop());
    win.on('enter-full-screen', () => restoreFromDesktop());
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

/**
 * Combinaison de déverrouillage du mode invité : écoutée dans le menu, ses fiches et ses
 * messages ; jamais pendant une partie ni son chargement, ni au bureau.
 */
function unlockListening(): boolean {
  return state.phase !== 'loading' && state.phase !== 'playing' && !desktop.active;
}

/** Touche ou bouton relâché : seule la combinaison de déverrouillage s'en sert. */
function handleKeyUp(input: Input): void {
  guest.input(input.code, false, unlockListening());
}

/**
 * Touches et boutons du menu. En mode invité, chaque porte (GUEST_DOORS) laisse passer ou non :
 * fermée, rien ne se passe que l'indice « Verrouillé » près du cadenas.
 */
function handleKey(input: Input): boolean {
  const is = (group: string[]) => group.includes(input.code);
  // Un bouton de la combinaison appuyé pendant qu'un autre est tenu ne fait rien d'autre.
  if (guest.input(input.code, true, unlockListening())) return true;
  if (input.control && input.code === 'KeyQ') return guest.knock('shortcut.quit') ? quit() : true;
  // Extinction, veille ou redémarrage en cours : plus rien ne se choisit.
  if (state.phase === 'message' && state.message?.action === 'power') return true;
  // Raccourci du mode bureau, de n'importe quel écran du menu (sauf pendant une partie) ; une fenêtre rouverte au bureau le reçoit aussi : retour.
  if (matchesShortcut(input, SHORTCUTS.desktop)) return desktop.active ? (restoreFromDesktop(), true) : guest.knock('shortcut.desktop') ? showDesktop() : true;
  // N'importe quel bouton en mode attente y met fin, sans autre effet ; sinon il remet le compte à zéro.
  // Le préavis d'arrêt de l'horaire aussi : la borne reste allumée tant qu'on joue.
  const noticed = hours.activity();
  if (attract.activity() || noticed) return leaveAttract();

  // Tab : menu et configuration, quels que soient les boutons relevés (dans le menu, Tab s'y déplace).
  if (input.code === CONFIG_KEY && ['menu', 'message', 'confirmQuit'].includes(state.phase)) return guest.knock('menu.system') ? openConfig() : true;

  switch (state.phase) {
    case 'loading':
    case 'playing':
      return true;
    case 'library':
      return library.handleKey(input);
    case 'message':
      if (!is(KEYS.confirm) && !is(KEYS.exit)) return false;
      // Mode invité, action du message fermée : Start ne la fait pas ; Exit ferme le message sans rien changer.
      if (state.message?.action && !guest.allows(MESSAGE_DOORS[state.message.action])) {
        if (is(KEYS.confirm)) guest.knock(MESSAGE_DOORS[state.message.action]);
        else if (tables.length) state = { ...state, phase: 'menu', message: undefined };
        else guest.knock('menu.system');
        break;
      }
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
      if (state.message?.action === 'orientation' && legacyOrientation) {
        const report = answerLegacy(legacyOrientation, is(KEYS.confirm));
        legacyOrientation = undefined;
        state = { ...state, phase: tables.length ? 'menu' : 'message', message: tables.length ? undefined : noTables() };
        if (report.problems.length) showBanner(report.problems.join(' '));
        else if (is(KEYS.confirm)) showBanner(t('Orientation rendue à Windows : le bureau sera droit après Cyber Pinball.'));
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
      if (is(KEYS.confirm)) return guest.knock('shortcut.quit') ? quit() : true;
      state = { ...state, phase: 'menu' };
      break;
    case 'menu':
      if (is(KEYS.help)) guest.knock('menu.commands') && (state = { ...state, help: !state.help });
      else if (state.help && is(KEYS.exit)) state = { ...state, help: false };
      else if (is(KEYS.previous)) guest.knock('menu.choose') && moveSelection(-1);
      else if (is(KEYS.next)) guest.knock('menu.choose') && moveSelection(1);
      else if (is(KEYS.confirm)) guest.knock('menu.sheet') && library.openSheet(tables[state.index]!);
      else if (is(KEYS.settings)) guest.knock('menu.vpx-settings') && openVpxSettings();
      else if (is(KEYS.exit)) guest.knock('menu.system') && library.openSystem();
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

/**
 * Aucune fenêtre de Cyber Pinball ne reste « toujours au premier plan » pendant une partie :
 * elle passerait devant les fenêtres de VPX où le plugin PUP dessine (fronton, DMD, topper), et
 * l'on entendrait le PuP-Pack sans le voir. « Récupérer » est la seule à l'être
 * (acquire-window.ts) : fermée au lancement, son historique est gardé pour la rouvrir.
 * pupvisible.test.ts vérifie qu'aucune autre fenêtre de l'application ne se met au premier plan.
 */
function closeTopmostWindows(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || !win.isAlwaysOnTop()) continue;
    console.log(`Partie : « ${win.getTitle()} » fermée, elle restait au premier plan devant VPX.`);
    win.close();
  }
}

export interface PlayReport {
  result: LaunchResult;
  focusReturned: boolean;
  /** Scores entrés au tableau d'honneur de la table pendant la partie. */
  entered: HighScore[];
}

/**
 * Partie d'une table. En mode réglage de l'affichage (`display`), VPX démarre son menu ouvert
 * sur le cadrage ; la partie ne compte pas dans les statistiques et, à la fin, l'écran qui
 * l'a demandée (la fiche) reprend la main.
 */
async function play(table: TableEntry, autoStopAfterMs?: number, mode?: 'display', hooks: { onPlaying?(): void } = {}): Promise<PlayReport | undefined> {
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
    pendingPlay = { frontends: others, play: () => play(table, autoStopAfterMs, mode, hooks) };
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
  guest.releaseAll();
  state = { ...state, phase: 'loading', help: false };
  launchCount++;
  const pressedAt = Date.now();
  // Lancement en cinéma, pour une vraie partie : la chorégraphie part au Start, dans les fenêtres
  // du menu ; elle ne retarde rien de ce qui suit (cinema.test.ts).
  if (mediaSettings.cinema && !displayMode) cinema.start(launchCount, { title: table.title, manufacturer: table.manufacturer, year: table.year, logo: medias?.wheel(table) });
  broadcast();
  // La pièce tombe au Start d'une vraie partie (pas au réglage de l'affichage), avant que VPX ne prenne les écrans.
  if (!displayMode) playUiSound('coin');
  // Records d'avant la partie (VPReg.stg de la table, highscores.ts), pour savoir au retour si l'un est tombé (knocker).
  const recordsBefore = readTableRecords(table);
  const loadingMs = Number(process.env.CYBERPINBALL_LOADING_MS ?? 2500);
  await delay(Math.min(400, loadingMs));
  const captured = Date.now();
  await capture('chargement');
  // Captures des essais sans opérateur (CYBERPINBALL_CAPTURE) : comptées à part dans le journal du lancement.
  const captureMs = Date.now() - captured;
  await delay(Math.max(0, loadingMs - 400));

  // Les écrans ont pu bouger depuis le démarrage du menu, la configuration de la borne aussi.
  const preparing = Date.now();
  const { problem, choose, selection, assignments } = syncScreens();
  if (choose || problem) {
    displayMode = false;
    cinema.stop();
  }
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
  closeTopmostWindows();
  // Habillage FullDMD : le DMD de VPX posé dans le cadre du média FullDMD, que le fond de partie montre autour.
  dressing = loc.root
    ? await prepareDressing(table, {
        root: loc.root,
        dataDir: loc.dataDir,
        cabinet: loadCabinet(loc.dataDir),
        facts: cachedScript(table.file, loc.dataDir),
        converter: (converter ??= createConverter()),
        trashDir: trashDirFor(layoutOf(loc.root).trash, `Avant la partie ${path.basename(table.folder)}`), // i18n-ignore : nom de dossier
      })
    : undefined;

  // Les fenêtres du menu restent derrière VPX, sans jamais lui prendre le focus : l'écran de
  // chargement jusqu'à ce que sa fenêtre de jeu s'affiche, puis le fond de partie de chaque
  // écran (viewFor). Celui que VPX n'occupe pas (topper, backglass sans .directb2s) reste couvert.
  playing = table;
  realign = simulated === undefined ? realignPlan(assignments) : undefined;
  hideTaskbars();
  const startedAt = new Date();
  const onPlaying = () => {
    state = { ...state, phase: 'playing' };
    // Les amis voient la table en cours, en temps réel (pas pendant un réglage de l'affichage).
    if (!displayMode) socialNet.setPresence({ status: 'playing', table: presenceTable(table), since: new Date().toISOString() });
    hooks.onPlaying?.();
    watchOccupied(simulated?.split(',').filter((r): r is RoleId => ROLES.some((x) => x.id === r)));
    broadcast();
    if (autoStopAfterMs) setTimeout(() => game.stop(), autoStopAfterMs);
  };
  // VPX prend la main (sa fenêtre de jeu au premier plan, dit le lanceur) : le coup de bobine, une fois.
  const onForeground = () => {
    if (cinema.handover()) playUiSound('coil');
  };
  // Ce qui a pris le temps du Start au lancement : rien d'autre que l'écran de chargement et la préparation (docs\demo-cinema.ps1).
  console.log(`Lancement : VPX lancé ${Date.now() - pressedAt} ms après le Start (écran de chargement ${loadingMs} ms${captureMs ? `, captures des essais ${captureMs} ms` : ''}, préparation ${Date.now() - preparing} ms ; lancement en cinéma ${cinema.running ? 'joué' : 'coupé'}).`);
  const game =
    simulated !== undefined
      ? simulateVpx({ onPlaying, onForeground })
      : launchVpx({ exe: install.exe, ini: activeVpxIni(loc), table: table.file, display: displayMode, vpxPrefDir: vpxPrefDir(install.version), onPlaying, onForeground });
  // Une partie simulée ne prend aucun raccourci global au poste.
  if (simulated === undefined) globalShortcut.register(accelerator(SHORTCUTS.forceStop), () => guest.knock('game.force-stop') && game.stop());
  const result = await game.done;
  if (simulated === undefined) globalShortcut.unregister(accelerator(SHORTCUTS.forceStop));
  cinema.stop();
  stopWatchOccupied();
  socialNet.setPresence({ status: 'menu', since: new Date().toISOString() });
  playing = undefined;
  dressing = undefined;
  displayMode = false;

  // Les barres des tâches reviennent avant que le menu reprenne le premier plan : redevenu
  // fenêtre plein écran active, il les fait repasser derrière lui.
  restoreTaskbars();
  const focusReturned = await showMenuAgain();
  // Fenêtres de l'éditeur de VPX masquées ou fermées pendant la partie : rien à faire
  // pour le joueur, mais le signe qu'un réglage ou une version de VPX a changé.
  for (const notice of result.notices) console.log(`VPX (${table.id}) : ${notice}`);

  if (mode === 'display') return { result, focusReturned, entered: [] };
  // Un score entré au tableau d'honneur pendant la partie : le knocker sonne au retour au menu.
  const entered = result.ok ? newRecords(recordsBefore, readTableRecords(table)) : [];
  for (const s of entered) console.log(`Record (${table.id}) : ${s.score}${s.initials ? ` (${s.initials})` : ''}, place ${s.rank}.`);
  if (result.ok) {
    // Les parties du test automatique ne comptent pas dans les statistiques.
    if (!autoStopAfterMs) recordPlay(table, startedAt, result.seconds);
    tables = tables.map((t) => (t.id === table.id ? { ...t, info: readInfo(t.infoFile) } : t));
    // Pour les amis : les records entrés au tableau, la partie, puis les badges qu'ils valent.
    if (!autoStopAfterMs) {
      const seen = presenceTable(table);
      for (const s of [...entered].sort((a, b) => a.rank - b.rank)) socialNet.publish({ kind: 'record', table: seen, score: s.score, rank: s.rank, ...(s.initials ? { initials: s.initials } : {}) });
      if (result.seconds >= 60) socialNet.publish({ kind: 'played', table: seen, seconds: Math.round(result.seconds) });
      socialNet.checkBadges(playStats(tables));
    }
    const unseen = simulated === undefined ? joystickMessage(install.version) : undefined;
    state = unseen ? { ...state, phase: 'message', message: unseen } : { ...state, phase: 'menu' };
  } else {
    state = { ...state, phase: 'message', message: explain(result, table) };
  }
  // Configuration de la borne changée juste avant la partie : VPX avait déjà les bons
  // écrans, le menu les reprend en redémarrant.
  if (selection?.previous && result.ok) relaunchMenu();
  broadcast();
  if (entered.length) playUiSound('knocker');
  return { result, focusReturned, entered };
}

/** Table en cours de partie : chaque fenêtre affiche son fond de partie. */
let playing: TableEntry | undefined;
/** Habillage FullDMD de la partie en cours (fulldmd.ts) : l'écran du DMD le garde autour du DMD de VPX. */
let dressing: TableDressing | undefined;
/** Le DMD de VPX a déjà été vu sur l'habillage pendant cette partie (signalé une fois). */
let dressCoveredSeen = false;
/** Convertisseur hors écran : images des vidéos FullDMD, pour y chercher le cadre du DMD. */
let converter: ReturnType<typeof createConverter> | undefined;
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
  dressCoveredSeen = false;
  const check = () => {
    try {
      let stack = listWindows((w) => w.visible);
      if (realignVpxWindows(stack)) stack = listWindows((w) => w.visible);
      update(occupiedRoles(roleRects, stack, process.pid));
      watchDressing(stack);
    } catch {
      // Pile des fenêtres illisible un instant : le dernier constat reste.
    }
  };
  check();
  occupiedWatch = setInterval(check, OCCUPIED_CHECK_MS);
}

/**
 * Habillage FullDMD : une fenêtre de VPX (ou de PinMAME, d'un PuP-Pack) qui le recouvre en
 * partie est signalée dans le journal, une fois par partie : la place du DMD que VPX a prise
 * n'est pas celle du .ini de la table (fulldmdtable.ts, liveDressCoverage).
 */
function watchDressing(stack: ReturnType<typeof listWindows>): void {
  const dmd = roleRects.find((r) => r.role === 'dmd');
  if (!dressing?.plan.dressed || !dmd || dressCoveredSeen) return;
  const share = liveDressCoverage(stack, process.pid, dmd.rect, dressing);
  if (share < DRESS_COVERED) return;
  dressCoveredSeen = true;
  console.log(`Partie : le DMD de VPX recouvre ${Math.round(share * 100)} % de l’habillage FullDMD (${playing?.id ?? '?'}) ; fiche de la table > Diagnostic pour le remettre dans le cadre.`);
}

function stopWatchOccupied(): void {
  if (occupiedWatch) clearInterval(occupiedWatch);
  occupiedWatch = undefined;
  occupied = new Set();
  realign = undefined;
}

/**
 * Rôles que VPX peut ouvrir sur l'écran d'un autre (confusableRoles : VPX 10.8.1 et deux écrans
 * du même nom) ; undefined quand il n'y en a pas, et rien n'est jamais déplacé.
 */
function realignPlan(assignments: Partial<Record<RoleId, ObservedDisplay>>): typeof realign {
  const observed = observedDisplays();
  const confused = confusableRoles(assignments, observed, profile.displayIdFormat);
  if (!confused.length) return undefined;
  console.log(`Partie : VPX repère les écrans par leur seul nom et peut confondre ceux de ${confused.join(', ')} ; ses fenêtres seront ramenées sur leur écran.`);
  const screens: Partial<Record<RoleId, Rect>> = {};
  for (const role of confused) if (assignments[role]) screens[role] = assignments[role]!.bounds;
  return { confused, screens, displays: observed.map((d) => d.bounds), moves: new Map() };
}

/**
 * Ramène sur l'écran de leur rôle les fenêtres annexes de VPX qu'il a ouvertes sur un autre
 * (vpxWindowMoves), à la même taille, sans les activer. Renvoie true si une fenêtre a bougé.
 */
function realignVpxWindows(stack: ReturnType<typeof listWindows>): boolean {
  if (!realign) return false;
  let moved = false;
  for (const { window, role, to } of vpxWindowMoves(stack.filter((w) => w.pid !== process.pid), realign.screens, realign.confused, realign.displays)) {
    const tries = (realign.moves.get(window.handle) ?? 0) + 1;
    realign.moves.set(window.handle, tries);
    if (tries > REALIGN_TRIES) {
      if (tries === REALIGN_TRIES + 1) console.log(`Partie : VPX remet sans cesse « ${window.title} » hors de l'écran du rôle ${role} ; elle est laissée où il la met.`);
      continue;
    }
    moved = moveWindow(window, to.x, to.y) || moved;
    console.log(`Partie : « ${window.title} » ramenée sur l'écran du rôle ${role} (${window.rect.x}, ${window.rect.y} → ${to.x}, ${to.y}).`);
  }
  return moved;
}

/** Le menu, resté derrière VPX, reprend le premier plan ; renvoie true s'il est bien revenu. */
async function showMenuAgain(): Promise<boolean> {
  for (const win of windows.values()) if (!isShown(win)) win.show();
  return takeForeground();
}

/** Le playfield prend le premier plan (après une partie, ou au retour du bureau depuis une autre application). */
async function takeForeground(): Promise<boolean> {
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
  // Réglages généraux : rien d'une table sur les écrans de la borne ; réglages d'une table : ses médias.
  vpxSettingsOpen = { about: table };
  broadcast();
  // À la fermeture de l'application, le playfield peut être détruit avant les réglages.
  void openSettings(target, { bounds: playfield?.getBounds(), rotation, onClose: () => playfield && !playfield.isDestroyed() && playfield.focus() }).then(() => {
    vpxSettingsOpen = undefined;
    broadcast();
  });
}

/**
 * Roue dentée ou Tab : menu et configuration, depuis le menu des tables et ses
 * messages, même quand les boutons relevés ne répondent plus comme prévu.
 */
function openConfig(): boolean {
  if (state.phase === 'loading' || state.phase === 'playing') return true;
  // Extinction, veille ou redémarrage en cours : la roue dentée n'ouvre plus rien.
  if (state.phase === 'message' && state.message?.action === 'power') return true;
  state = { ...state, help: false };
  library.openSystemRoot();
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
  closing = true;
  app.quit();
  return true;
}

/** Ce que le menu garde d'un démarrage à l'autre : avant de quitter, d'éteindre ou de mettre en veille. */
function saveSettings(): void {
  medias?.save();
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
  // Écran qui ne parle d'aucune table (menu système, réglages, aide, messages) : l'affichage par défaut de Cyber Pinball.
  const subject = screensSubject();
  const defaults = Object.fromEntries(roles.map((r) => [r, medias ? medias.defaultMedia(r) : defaultMediaView(r)]));
  const preload =
    !shown && table && subject === table && medias && tables.length > 1
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
    // Couleur des points des afficheurs dessinés par Cyber Pinball (DMD du menu, replis dmd et fullDmd).
    dmdColor: mediaSettings.dmdColor,
    // DMD du menu vivant : où poser les points dans la zone du DMD de cette fenêtre (absent : DMD classique).
    liveDmd: liveDmdView(role),
    medias: subject ? mediasOf(subject) : defaults,
    preload,
    // Lancement en cinéma : la part de cette fenêtre (le plateau d'où part le logo, le fronton où il se pose).
    cinema: state.phase === 'loading' ? cinemaFor(role) : undefined,
    // Chargement : la vidéo Loading du jeu (ou son repli), plein écran en borne, dans le cadre du plateau au bureau.
    loading: state.phase === 'loading' && role === 'playfield' && medias && table ? medias.typeMedia(playing ?? table, 'playfield', 'Loading') : undefined,
    // Fronton du jeu choisi (image Backglass), en fond du menu au bureau, à côté du plateau.
    backglass: role === 'playfield' && medias && table && !shown ? medias.typeMedia(table, 'backglass', 'Backglass') : undefined,
    // Mode invité : un message dont l'action est fermée n'en propose pas (son pied dit « Revenir au menu »).
    message: state.message?.action && !guest.allows(MESSAGE_DOORS[state.message.action]) ? { ...state.message, action: undefined } : state.message,
    banner: state.banner,
    // Mode invité : cadenas, indice « Verrouillé », anneau du déverrouillage (dessinés par le playfield).
    guest: guest.view(),
    /** Pastille rouge sur la roue dentée : une entrée du menu système attend l'utilisateur. */
    attention: library.attention(),
    library: state.phase === 'library' ? library.view() : undefined,
    // Mode attente : la table montrée, son logo, et l'invite du playfield.
    attract: shown ? { ...describe(shown), wheel: medias?.wheel(shown) } : undefined,
    // Horaire : voile noir de la nuit (0 à 1) sur chaque écran, en attente seulement.
    night: shown && hours.night() ? mediaSettings.hours.nightDim / 100 : 0,
    // Préavis d'arrêt (dessiné par le playfield) : son heure dans l'horloge de la fenêtre.
    stop: stopNotice ? { action: stopNotice.action, endsAt: Date.now() + (stopNotice.endsAt - hoursClock.now()), ms: STOP_NOTICE_MS } : undefined,
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
            play: Object.fromEntries(roles.map((r) => [r, momentScreen('game', r, { game: mediaSettings.game, occupied: occupied.has(r), dressed: r === 'dmd' && dressing?.plan.dressed }).play])),
          }
        : undefined,
    // Le son du menu ne sort que d'une fenêtre : celle du playfield.
    sound: role === 'playfield' ? soundView() : undefined,
    gameKeys: gameKeys(buttons, tilt),
    // Aide-mémoire du chargement : au bureau toujours ; en borne, celui du réglage de l'affichage seulement (display).
    loadingKeys: displayMode ? { title: t('Réglage de l’affichage'), rows: displayKeys(buttons), display: true } : { title: t('Commandes de la partie'), rows: gameKeys(buttons, tilt), display: false },
    menuKeys: menuKeys(),
    footer: menuFooter(),
    nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0], help: KEYS.help[0] },
  };
}

/** Part d'une fenêtre dans le lancement en cinéma : le logo part du plateau, se pose sur le fronton (sa fenêtre ou sa zone). */
function cinemaFor(role: RoleId): CinemaView | undefined {
  const roles = windowRoles.get(role) ?? [role];
  return cinema.view({ depart: role === 'playfield', arrivee: roles.includes('backglass') });
}

/** Table voisine dans le menu des tables (boutons, roue cliquée) : le solénoïde claque à chaque table. */
function moveSelection(offset: number): void {
  const index = (state.index + offset + tables.length * 10) % tables.length;
  if (index === state.index) return;
  state = { ...state, index };
  playUiSound('solenoid');
}

/**
 * Son de l'interface (uisounds.ts), joué par la fenêtre du playfield (renderer/ui-sounds.js)
 * sur la sortie du son du menu : seulement s'il est activé, et jamais pendant une partie.
 */
function playUiSound(id: UiSoundId): void {
  const cue = uiSoundCue(id, mediaSettings, moment());
  const win = windows.get('playfield');
  if (cue && win && !win.isDestroyed()) win.webContents.send('ui-sound', cue);
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
  // Hors du menu des tables, seule la table dont parle l'écran ouvert se fait entendre (screensSubject),
  // et rien quand cet écran fait écouter des sons (propositions, sons de la table) : un seul son à la fois.
  const table = state.phase === 'library' && library.previewsSound() ? undefined : screensSubject();
  const now = moment();
  const plan =
    table && medias
      ? menuSound(now, now === 'attract' && hours.night() ? { ...mediaSettings, attractSound: 'muted' } : mediaSettings, { music: medias.sound(table, 'Audio'), launch: now === 'loading' ? medias.sound(table, 'AudioLaunch') : undefined }, tableMediaVolume(table))
      : { video: 0 };
  return { ...plan, launchId: plan.launch ? launchCount : undefined, output: audioOutput };
}

// ---------------------------------------------------------------------------
// DMD du menu vivant (live-dmd.ts, packages/core/src/livedmd.ts) : pendant la navigation,
// l'écran du DMD montre l'afficheur à points dessiné par Cyber Pinball (titre, PRESS START,
// records, média DMD, horloge, crédits) ; « classique » dans Médias, son et attente revient au
// média seul. Rien pendant la partie : VPX a l'afficheur.

const liveDmd = new LiveDmd({
  send: (shot) => {
    const win = dmdWindow();
    if (win && !win.isDestroyed()) win.webContents.send('dmd', shot);
  },
});
/** Animation jouée sur le DMD pendant le lancement d'une table : « lancement » (cinéma) ou « chargement ». */
let loadingDmd: LiveDmdAnimationHandle | undefined;
/** Records lus de chaque table, relus quand son VPReg.stg change (après une partie). */
const recordsCache = new Map<string, { stamp: string; records?: TableRecords }>();
/** Cadre de chaque média FullDMD par adresse (elle change avec le fichier), une fois lu ou cherché. */
const dmdFrames = new Map<string, FrameRecord | undefined>();
/** Écran du DMD de la borne : FullDMD ou DMD seul (dmdKindOf), lu au démarrage du menu. */
let menuDmdKind: DmdKind | undefined;

/**
 * Joue une animation sur le DMD du menu (« chargement »…), par-dessus l'alternance ; sans
 * effet visible si le DMD du menu est classique ou s'il n'y a pas d'écran du DMD.
 */
export function playDmdAnimation(name: DmdAnimationName, options?: DmdAnimationOptions): LiveDmdAnimationHandle {
  return liveDmd.play(name, options);
}

/** Fenêtre qui dessine le rôle dmd (sa propre fenêtre, ou celle de l'écran qu'il partage). */
function dmdWindow(): BrowserWindow | undefined {
  for (const [role, roles] of windowRoles) if (roles.includes('dmd')) return windows.get(role);
  return undefined;
}

/** Le DMD vivant se montre : réglé ainsi, un écran du DMD, ni partie ni mode bureau. */
function liveDmdOn(): boolean {
  return mediaSettings.dmd === 'live' && Boolean(dmdWindow()) && state.phase !== 'playing' && !desktop.active;
}

function tableRecords(table: TableEntry): TableRecords | undefined {
  const file = vpRegFile(table);
  let stamp = 'absent';
  try {
    const st = fs.statSync(file);
    stamp = `${st.size}:${st.mtimeMs}`;
  } catch {
    // Pas de VPReg.stg : la table n'a rien enregistré.
  }
  const known = recordsCache.get(table.file);
  if (known?.stamp === stamp) return known.records;
  const records = stamp === 'absent' ? undefined : readTableRecords(table);
  recordsCache.set(table.file, { stamp, records });
  return records;
}

/**
 * Cadre du DMD dans un média FullDMD, s'il a déjà été cherché (fulldmd-cadres.json) ; sinon
 * cherché une fois en arrière-plan, et les fenêtres sont prévenues quand il est trouvé.
 */
function knownDmdFrame(url: string): FrameRecord | undefined {
  if (dmdFrames.has(url)) return dmdFrames.get(url);
  const file = mediaPathFromUrl(url);
  const known = file ? cachedFrame(frameCacheFile(loc.dataDir), file) : undefined;
  dmdFrames.set(url, known);
  if (file && !known) {
    void mediaFrame(file, loc.dataDir, (converter ??= createConverter())).then((found) => {
      dmdFrames.set(url, found);
      if (found?.frame) broadcast();
    });
  }
  return known;
}

/**
 * Place des points dans la zone du DMD de cette fenêtre : dans le cadre du média FullDMD (le
 * média se voit autour, framed), sinon la bande 4:1 centrée sur du noir. undefined : DMD
 * classique, ou la fenêtre n'a pas le DMD.
 */
function liveDmdView(role: RoleId): { area: ReturnType<typeof liveDmdArea>; framed: boolean } | undefined {
  if (!liveDmdOn() || !(windowRoles.get(role) ?? [role]).includes('dmd')) return undefined;
  const table = screensSubject();
  // FullDMD sans table : la marque sur toute la grille de 160 × 90 du repli (fallback.js, fullDmd),
  // pas une bande 4:1 entre deux aplats noirs (revue du directeur artistique, 27/10/2026).
  if (!table && menuDmdKind === 'fulldmd' && state.phase !== 'loading') return undefined;
  const view = table && medias ? medias.roleMedia(table, 'dmd') : undefined;
  const fullDmd = menuDmdKind === 'fulldmd' && (view?.found ?? view?.type) === 'FullDMD';
  const record = fullDmd && view?.url ? knownDmdFrame(view.url) : undefined;
  const rect = roleRects.find((r) => r.role === 'dmd')?.rect;
  const framed = Boolean(record?.frame);
  return { area: liveDmdArea(framed ? record : undefined, rect ?? { width: 16, height: 9 }), framed };
}

/** Programme du DMD vivant d'après l'état du menu : la table montrée, le chargement, la partie. */
function syncLiveDmd(): void {
  if (!liveDmdOn()) {
    loadingDmd?.stop();
    loadingDmd = undefined;
    return liveDmd.pause();
  }
  // Chargement : l'animation du lancement en cinéma (le logo traverse l'afficheur, puis le titre et la bille), sinon celle du chargement.
  const launch = cinema.subject;
  if (state.phase === 'loading') loadingDmd ??= launch ? liveDmd.play('lancement', { label: launch.title }) : liveDmd.play('chargement');
  else {
    loadingDmd?.stop();
    loadingDmd = undefined;
  }
  const table = screensSubject();
  if (!table) liveDmd.show('', undefined);
  else {
    const records = tableRecords(table);
    const media = medias?.roleMedia(table, 'dmd').url;
    // Une autre table, ou la même dont les records ou le média ont changé : l'alternance repart du titre.
    const key = JSON.stringify([table.file, records?.scores, records?.credits, media]);
    liveDmd.show(key, { title: table.title, manufacturer: table.manufacturer, year: table.year, records, hasMedia: Boolean(media) });
  }
  liveDmd.resume();
}

function broadcast(): void {
  syncLiveDmd();
  // Le mode attente n'est permis que sur le menu des tables (ni aide, ni fiche, ni message, ni partie).
  attract.allow(state.phase === 'menu' && !state.help && tables.length > 0 && !desktop.active);
  if (!attract.active) attractIndex = undefined;
  for (const [role, win] of windows) {
    if (!win.isDestroyed()) win.webContents.send('state', viewFor(role));
  }
}
