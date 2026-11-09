// Menu des tables : une fenêtre par écran de la borne, pilotée aux boutons.
// Lancer une table : écran de chargement avec les commandes, VPX en -Play par-dessus
// les fenêtres du menu (qui restent derrière lui, en fond de partie), puis retour au
// menu avec reprise du premier plan.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, globalShortcut, ipcMain, session, shell, type Input, type Rectangle } from 'electron';
import {
  ArcadeHours,
  CONFIG_KEY,
  STOP_IDLE_FALLBACK_MS,
  STOP_NOTICE_MS,
  arcadeHoursClock,
  badgeLabel,
  downloadReasonText,
  avatarsDir,
  avatarView,
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
  zoneSwitchKeys,
  WHEEL_START_HOLD_MS,
  LOADING_SLOW_MS,
  advanceLoadingStep,
  loadingStepLabel,
  type LoadingStep,
  navigationButtons,
  navigationProblems,
  type ButtonsSource,
  type HeadsetSource,
  HEADSET_BUTTONS,
  language,
  calibrateMenuText,
  calibrationSetting,
  cabinetPlaceFileName,
  freePlace,
  eyeHeightProblem,
  isCalibrated,
  placeVpxSettings,
  roomMoved,
  calibrationGap,
  calibrationProblem,
  lockbarMarks,
  lockbarPlace,
  lockbarVpxSettings,
  type CabinetPlace,
  type CalibrationSetting,
  type CalibrationStep,
  type Point3,
  type HeadsetButton,
  vrCenterKey,
  vrHasSavedPlace,
  type NavigationButtons,
  joysticksInVpxLog,
  joysticksUnseenByVpx,
  keepManualEdits,
  layoutOf,
  overlayCoveredBy,
  liveBoardView,
  LIVE_GO_SHOW_MS,
  LIVE_READY_SIGNAL_MS,
  parseLiveState,
  liveReadyOverdue,
  type LiveBoardScreens,
  loadCabinet,
  playfieldOrientation,
  readInfo,
  isFavorite,
  setFavorite,
  infoFileFor,
  buttonKeys,
  readTextIfExists,
  IniDocument,
  recordPlay,
  ROLES,
  saveCabinet,
  scanTables,
  ShuffleKeys,
  sortTables,
  startIndex,
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
  DMD_TABLE_COLOR,
  effectiveDmdColor,
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
  VPX_ANCILLARY_WINDOWS,
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
  type NoticeView,
  type NoticeZone,
  type SystemItemId,
  noticeZone,
  type ZoneScreen,
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
  type GroupRecord,
  type HostSetting,
  type LiveGameState,
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
  repairScriptAfterStop,
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
  readHostSettings,
  loadedRoms,
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
  edgeOfRotation,
  edgeRotation,
  orientationFacts,
  recordedMediaType,
  type RecordedRole,
  type RecordingSettings,
  IntroRun,
  INTRO_SKIP_FLAG,
  introAtStartup,
  introFiles,
  introMediaView,
  introScreenOf,
  introSound,
  introSource,
  mediaUrl,
  type IntroFiles,
  volumeOutputIds,
  diagnoseVpxFailure,
  readVpxScript as readTableScript,
  diskSpace,
  loadSocial,
  type RemoteButton,
  vrMenuText,
  megabytes,
  vision3dGameReport,
  vision3dPluginLog,
  vision3dMenuText,
  vision3dReadiness,
  type Vision3dHardware,
  type Vision3dSourceKind,
  type IconName,
  boardKey,
  countryOfLocale,
  type PlayedScore,
  jukeboxSummary,
  jukeboxWheel,
  jukeboxWheelMove,
  JUKEBOX_WHEEL_KEY,
} from '@cyberpinball/core';
import { bringToFront, foregroundWindow, listWindows, moveWindow, visibleWindowsOf } from '@cyberpinball/win-displays';
import { observedDisplays } from './displays';
import { browserScreenFor } from './browser-screen';
import { createWindow, isShown, OFFSCREEN, primaryRect, refuseOffscreen, whenReadyToShow, windowRect } from './offscreen';
import { quitWithWindow } from './app-lifetime';
import { handleSecondLaunch } from './single-instance';
import { installVpx, vpxArchivePresent } from './install-vpx';
import { armRecording, type RecordingOutcome, type RecordingRun, type RecordingScreen } from './game-recording';
import { launchVpx, simulateVpx, vpxPrefDir, type LaunchResult } from './launcher';
import { watchGameLoad, type GameLoadWatch } from './game-load';
import { createLibrary, type ActionShortcut, type Row, type SystemItem, type UiAction } from './library';
import { createMenuDmd } from './menu-dmd';
import { cachedScript } from './vbs';
import { mediaFrame, prepareDressing } from './fulldmd';
import { LiveDmd, type LiveDmdAnimationHandle } from './live-dmd';
import { DmdWheels } from './dmd-wheel';
import { createConverter } from './media-convert';
import { onKeyInput } from './key-input';
import { onJoystickInput } from './joystick-input';
import { locations, vpxInstall, vpxProfile } from './paths';
import { loadPlugins } from './plugins';
import { activeVpxIni, syncConfiguration } from './vpx-ini';
import { createConfigurationsMenu } from './configurations-menu';
import { coverDisplay, hideCovered, minimizeCovered } from './cover-display';
import { DesktopMode } from './desktop-mode';
import { answerLegacy, legacyDesktopTurned, orientationForDesktop, orientationFromDesktop, takeOrientationProblems } from './display-orientation';
import { acceptFrontends, otherFrontendsOnThisPc, unacceptedFrontends } from './frontend-gate';
import { hideTaskbars, isVeil, nameScreen, onScreensSettled, recoverScreens, relaunchCovered, restoreTaskbars, setDesktopMode, settleScreens, takeCoverIncidents } from './screen-guard';
import { describeReset, resetButtons } from './buttons-reset';
import { forcedRotation, menuRotation, openSettings } from './settings';
import { allowJukebox, allowPreview, serveMedias } from './media-protocol';
import { createJukeboxPlayer, type JukeboxMessage } from './jukebox-player';
import { createAvatarMenu } from './avatar-menu';
import { createMenuSettings } from './menu-settings';
import { createIntroMenu } from './intro-menu';
import { createLanguageMenu } from './language-menu';
import { createBackupsMenu } from './backups-menu';
import { ejectDrive } from './drive-eject';
import { freezeWrites } from './write-freeze';
import { listDrives } from './file-picker';
import { createUpdatesMenu } from './updates-menu';
import { createGuestMenu } from './guest-menu';
import { createCollectionsItem, createCollectionsMenu } from './collections-menu';
import { createFriendsMenu } from './friends-menu';
import { createFirewallRule } from './firewall-rule';
import { guardFirewall } from './firewall-guard';
import { createFriendContent } from './friend-content';
import { friendTransport } from './download-sources';
import { createGameNotices } from './game-notice';
import { createInGameMenu, prepareDmdPlace } from './in-game-menu';
import { startCabinetVolume, type CabinetVolume } from './cabinet-volume';
import { createBallCounts } from './ball-count';
import { createTableScores } from './table-scores';
import { createTableRankings } from './table-rankings';
import { createTableDoubles } from './table-double';
import { inspectorFor, vpxFirewallTargets } from './vpx-inspector';
import { scriptDmdWatch, simulatedDmdWatch, watchVpxDmd, type DmdWatch } from './dmd-watch';
import { readLiveScoresSettings, writeLiveScoresSettings } from './live-scores-setting';
import { readQuietInGame, writeQuietInGame } from './quiet-in-game-setting';
import { centerWhenStarted, prepareVrGame, probeVr, readVrMode, rememberVrSettings, writeIniSettings, writeVrCalibration, writeVrMode, type VrGame } from './vr';
import { HEADSET_TRIAL_DIR, HeadsetMenu, readCabinetPlace } from './casque';
import { downloadKinectDriver, HeadTracker, installKinectDriver, installVision3dPlugin, probeVision3d, readVision3d, vision3dPluginFiles, writeVision3d } from './vision3d';
import { findComponent } from '@cyberpinball/installer';
import { closeHeadsetViews, isHeadsetView, openHeadsetViews, sendToHeadsetViews, setHeadsetPainting, type HeadsetPage } from './casque-vues';
import { createLiveScoresMenu } from './live-scores-menu';
import { createLiveGames, type LiveProgress, type LiveStartGate } from './live-game';
import { createSocialNet } from './social-net';
import { createMenuNotices } from './menu-notices';
import { createActivityMenu } from './activity-menu';
import { seedSimulatedFriends, simulatedPlayersWanted, startSimulatedPlayers } from './social-demo';
import { createDedicatedMenu } from './dedicated-menu';
import { TableTints } from './table-tint';
import { createDedicatedSystem } from './dedicated-system';
import { handOverOnQuit, shellSession } from './dedicated-session';
import { createPowerMenu } from './power';
import { readWakeDevices } from './arcade-hours';
import { createPhoneRemote, phoneRemoteMode } from './phone-remote';

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
    ...(collections.locked()
      ? []
      : [['menu.collections', t('Changer de collection (Toutes, Favoris, Récentes, un fabricant, une décennie…)'), t('MagnaSave gauche ou droit, ou clic sur le repère au-dessus de la roue')] as [GuestDoor, string, string]]),
    // Start sur la roue (réglage « Start sur la roue ») : la fiche, ou la partie, la fiche passant alors à Start maintenu (et F6).
    ...(wheelPlays()
      ? ([
          ['sheet.play', t('Jouer la table choisie'), `Start (${or(KEYS.confirm.filter((k) => k !== 'NumpadEnter'))})`],
          // Une ligne chacune : l'aide-mémoire tient à l'écran sans rien pousser hors de la fenêtre (bureau en 1080p).
          ['menu.sheet', t('Fiche de la table'), sheetKeys().length ? t('Start maintenu, ou {keys}', { keys: or(sheetKeys()) }) : t('Start maintenu')],
        ] as [GuestDoor, string, string][])
      : ([['menu.sheet', guest.active ? t('Fiche de la table (Jouer, Prospectus, Règles)') : t('Fiche de la table (Jouer, Modifier…)'), `Start (${or(KEYS.confirm.filter((k) => k !== 'NumpadEnter'))})`]] as [GuestDoor, string, string][])),
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
  const magna = collectionKeys();
  // Médaillon Juke-box : Start ouvre le lecteur (ou l'invitation à importer).
  if (onJukebox())
    return [
      [t('Flippers : choisir')],
      ...(!collections.locked() && (magna.previous.length || magna.next.length) ? [[t('MagnaSave : collections')] as [string]] : []),
      [library.jukebox.store().playlists.length ? t('Start : ouvrir') : t('Start : importer'), KEYS.confirm[0]],
      ...(guest.allows('menu.system') ? [[t('Exit : menu'), KEYS.exit[0]] as [string, string]] : []),
    ];
  return [
    [t('Flippers : choisir')],
    // Mode invité qui impose une collection : les MagnaSave n'y font rien, l'aide n'en parle pas.
    ...(!collections.locked() && (magna.previous.length || magna.next.length) ? [[t('MagnaSave : collections')] as [string]] : []),
    // « Jouer directement » : Start joue ; tenu, la fiche (les MagnaSave restent aux collections). Deux repères courts : un seul long passait sur trois lignes en borne.
    ...(wheelPlays()
      ? ([
          [t('Start : jouer'), KEYS.confirm[0]],
          [t('Start tenu : fiche'), sheetKeys()[0]],
        ] as [string, string?][])
      : ([[t('Start : fiche'), KEYS.confirm[0]]] as [string, string?][])),
    // Mode invité : Exit n'ouvre pas le menu système.
    ...(guest.allows('menu.system') ? [[t('Exit : menu'), KEYS.exit[0]] as [string, string]] : []),
  ];
}

/**
 * Lancement en cours (loadingprogress.ts) : l'étape observée, l'heure du Start, `slow` passé
 * LOADING_SLOW_MS (le cartouche paraît), `stop` une fois VPX lancé, `stopped` quand Exit ou
 * Ctrl+Maj+K l'a arrêté. Effacé quand la table est à l'écran.
 */
let launch: { step: LoadingStep; since: number; slow: boolean; timer: NodeJS.Timeout; stop?: () => void; stopped?: boolean } | undefined;

function startLaunch(): void {
  endLaunch();
  const since = Date.now();
  launch = {
    step: 'prepare',
    since,
    slow: false,
    timer: setTimeout(() => {
      if (!launch || launch.since !== since || state.phase !== 'loading') return;
      launch.slow = true;
      console.log(`Lancement : la table n'est pas à l'écran ${LOADING_SLOW_MS / 1000} s après le Start (${launch.step}) ; le chargement le dit.`); // i18n-ignore : journal
      broadcast();
    }, LOADING_SLOW_MS),
  };
}

/** Étape vue pendant le lancement : le cartouche la dit, s'il est là. */
function launchStep(step: LoadingStep): void {
  if (!launch) return;
  const next = advanceLoadingStep(launch.step, step);
  if (next === launch.step) return;
  launch.step = next;
  if (launch.slow) broadcast();
}

function endLaunch(): void {
  if (launch) clearTimeout(launch.timer);
  launch = undefined;
}

/** Exit ou Ctrl+Maj+K pendant un chargement : VPX se ferme s'il est lancé, sinon il ne le sera pas. */
function stopLaunch(): void {
  if (!launch || launch.stopped) return;
  launch.stopped = true;
  console.log(`Lancement : arrêté pendant le chargement (${launch.step}, ${Math.round((Date.now() - launch.since) / 1000)} s après le Start).`); // i18n-ignore : journal
  launch.stop?.();
  broadcast();
}

/**
 * Touches qui ouvrent aussi la fiche en « jouer directement » : celles qui basculent les zones d'un
 * écran (F6 d'un clavier), sauf les MagnaSave de la borne, qui changent de collection sur la roue.
 */
function sheetKeys(): string[] {
  const magna = collectionKeys();
  return zoneSwitchKeys({ buttons, navigation }).filter((k) => !magna.previous.includes(k) && !magna.next.includes(k));
}

/** Réglage « Start sur la roue » sur « jouer directement » (tableorder.ts, WHEEL_STARTS). */
function wheelPlays(): boolean {
  return mediaSettings.wheelStart === 'play';
}

/**
 * Start appuyé sur la roue en « jouer directement » : relâché avant WHEEL_START_HOLD_MS, la
 * partie ; tenu jusque-là, la fiche s'ouvre sans attendre le relâchement (un appui qui dure
 * ne lance jamais une partie par surprise).
 */
let wheelPress: { code: string; file: string; timer: NodeJS.Timeout } | undefined;

function cancelWheelPress(): void {
  if (wheelPress) clearTimeout(wheelPress.timer);
  wheelPress = undefined;
}

/** Start sur la roue : la fiche (réglage par défaut), ou la partie de la table choisie. */
function wheelConfirm(table: TableEntry, sheet: boolean): void {
  cancelWheelPress();
  if (sheet) {
    if (guest.knock('menu.sheet')) library.openSheet(table);
  } else if (guest.knock('sheet.play')) {
    state = { ...state, index: Math.max(0, tables.indexOf(table)) };
    void play(table, process.env.CYBERPINBALL_AUTOPILOT ? Number(process.env.CYBERPINBALL_PARTIE_MS) || 10_000 : undefined);
  }
}

/** Start enfoncé sur la roue, en « jouer directement » : la minuterie de l'appui maintenu. */
function pressWheelStart(code: string): void {
  const table = tables[state.index];
  if (!table) return;
  cancelWheelPress();
  wheelPress = {
    code,
    file: table.file,
    timer: setTimeout(() => {
      wheelPress = undefined;
      // Toujours sur la roue, toujours la même table : la fiche.
      if (state.phase === 'menu' && tables[state.index]?.file === table.file) {
        wheelConfirm(table, true);
        broadcast();
      }
    }, WHEEL_START_HOLD_MS),
  };
}

/** Start relâché avant la minuterie : la partie de la table sur laquelle il a été enfoncé. */
function releaseWheelStart(code: string): void {
  if (wheelPress?.code !== code) return;
  const table = tables.find((x) => x.file === wheelPress!.file);
  cancelWheelPress();
  if (state.phase !== 'menu' || !table) return;
  wheelConfirm(table, false);
  broadcast();
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
  action?: 'wizard' | 'install-vpx' | 'addTable' | 'manualEdits' | 'buttons' | 'interface' | 'otherFrontend' | 'journey' | 'replay' | 'live' | 'power' | 'orientation';
  /**
   * Table d'une partie échouée : Start ouvre « Ce qu'il manque pour jouer » (action 'journey'), ou la
   * relance quand rien ne manque (action 'replay' : le script de la table ou VPX s'est arrêté).
   */
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
  replay: 'message.replay',
  live: 'message.live',
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
  /** Le médaillon Juke-box est choisi dans la roue (jukebox-screens.ts) ; la table choisie reste en mémoire dessous. */
  jukebox?: boolean;
}

const loc = locations();
const { profile } = vpxProfile(loc);
let tables: TableEntry[] = [];
// Ordre mélangé : tiré au démarrage, gardé jusqu'au prochain (tableorder.ts).
const shuffleKeys = new ShuffleKeys();
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
/** Les pages du menu, écran par écran (pixels physiques) : rendues aussi pour le casque (casque-vues.ts). */
let headsetPages: HeadsetPage[] = [];
/** Rôles que VPX occupe pendant la partie (sa fenêtre passe devant la nôtre) : figés, quel que soit le réglage. */
let occupied = new Set<RoleId>();
/** Écrans que VPX a occupés depuis le début de la partie en cours : la bande ne s'y pose plus. */
let occupiedThisGame = new Set<RoleId>();
/** Le DMD de la partie entre amis en cours, lu par l'inspector de VPX (dmd-watch.ts). */
let dmdWatch: DmdWatch | undefined;
let occupiedWatch: NodeJS.Timeout | undefined;
/** Relecture des fenêtres pendant la partie : B2S, DMD et PuP s'ouvrent après la fenêtre de jeu. */
const OCCUPIED_CHECK_MS = 2000;
/** Au retour d'une partie, délai avant le second contrôle des écrans (le temps qu'ils se posent). */
const SCREENS_SETTLE_MS = 1500;
/**
 * Recalage des fenêtres annexes de VPX pendant la partie (vpxWindowMoves) : rôles qu'il peut
 * confondre, écran de chaque rôle et écrans branchés, déplacements déjà faits par fenêtre.
 */
let realign: { confused: RoleId[]; screens: Partial<Record<RoleId, Rect>>; displays: Rect[]; moves: Map<bigint, number> } | undefined;
/** Une fenêtre que VPX remet sans cesse sur le mauvais écran n'est plus déplacée après ce nombre d'essais. */
const REALIGN_TRIES = 3;

// Médias des jeux : résolus au démarrage du menu, quand
// le modèle de la borne et la rotation du playfield sont connus.
let medias: MenuMedias | undefined;
/**
 * Médias du menu dessiné pour le casque (casque-vues.ts) : le playfield y est en portrait
 * (headsetTurn), son fond s'oriente donc d'après ce bord des flippers, pas celui de l'écran du PC.
 */
let headsetMedias: MenuMedias | undefined;
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
 * Ouverture au démarrage (intro.ts) : chaque écran joue son animation, puis garde sa dernière
 * image ; le premier bouton (ou un clic) affiche la roue, ou revient aux réglages après « Voir
 * l'ouverture ». Les animations partent quand toutes les fenêtres sont prêtes (introReady).
 */
const introRun = new IntroRun();
/** Fenêtres du menu qui ont dit « prête » (webContents.id) : l'ouverture part quand toutes le sont. */
const introReady = new Set<number>();
/** Au plus ce délai après l'ouverture des fenêtres : une fenêtre qui ne répond pas ne la retient pas. */
const INTRO_READY_MAX_MS = 5000;
/** Fichiers d'ouverture de <racine>\media, relus quand ce dossier change (guet des médias) ou qu'un fichier est rangé. */
let introFileCache: IntroFiles | undefined;
/** Constats brefs arrivés pendant l'ouverture : montrés sur la roue, pas par-dessus les animations. */
let pendingBanners: string[] = [];

function introFilesNow(): IntroFiles {
  return (introFileCache ??= loc.root ? introFiles(layoutOf(loc.root).media) : {});
}

/** Pose l'ouverture : au démarrage (retour à la roue), ou « Voir l'ouverture » (retour aux réglages). */
function beginIntro(returnTo: 'menu' | 'library'): void {
  // Fenêtres déjà prêtes (« Voir l'ouverture ») : les animations partent tout de suite.
  introRun.begin(returnTo, returnTo === 'library');
  state = { ...state, phase: 'intro', help: false };
  broadcast();
}

/** Une fenêtre est prête : quand toutes le sont, les animations partent ensemble. */
function introWindowReady(id: number): void {
  introReady.add(id);
  const all = [...windows.values()].every((w) => w.isDestroyed() || introReady.has(w.webContents.id));
  if (all && introRun.start()) broadcast();
}

/** Premier bouton pendant l'ouverture : la roue (ou les réglages), et rien d'autre. */
function leaveIntro(): boolean {
  const back = introRun.end();
  if (back === 'library') state = { ...state, phase: 'library' };
  else state = tables.length ? { ...state, phase: 'menu' } : { ...state, phase: 'message', message: noTables() };
  broadcast();
  const banners = pendingBanners;
  pendingBanners = [];
  for (const text of banners) showBanner(text);
  return true;
}

/** Part de l'ouverture d'une fenêtre : l'écran de chaque rôle qu'elle dessine, et l'invite du plateau. */
function introFor(role: RoleId) {
  const run = introRun.current;
  if (!run) return undefined;
  const files = introFilesNow();
  const dmdType = medias?.defaultMedia('dmd').type === 'FullDMD' ? 'FullDMD' : 'DMD';
  const edge = edgeOfRotation(rotation);
  const viewOf = (r: RoleId, desktop = false) => {
    const screen = desktop ? 'backglass' : introScreenOf(r, dmdType);
    return introMediaView({ role: r, screen, source: introSource(mediaSettings.intro, files, screen), run, rotation, edge, url: mediaUrl, desktop });
  };
  const roles = windowRoles.get(role) ?? [role];
  return {
    id: run.id,
    startedAt: run.startedAt,
    screens: Object.fromEntries(roles.map((r) => [r, viewOf(r)])),
    // Plateau en largeur (poste de bureau) : l'ouverture du fronton, plein écran.
    desktop: role === 'playfield' ? viewOf('playfield', true) : undefined,
    hint: introRun.returnTo === 'library' ? t('Appuyez sur un bouton pour revenir aux réglages') : t('Appuyez sur un bouton pour choisir une table'),
  };
}

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
  // La table tirée vient de la collection active (Favoris, un fabricant…), comme la roue.
  const shelf = collections.shelf().tables;
  if (!shelf.length) return;
  const avoid = [tables[state.index], ...attractRecent.map((i) => tables[i])].map((x) => (x ? shelf.indexOf(x) : -1)).filter((i) => i >= 0);
  attractIndex = tables.indexOf(shelf[pickAttractTable(shelf.length, avoid)]!);
  attractRecent = [...attractRecent, attractIndex].slice(-attractMemory(shelf.length));
  console.log(`Mode attente : ${tables[attractIndex]!.id} (collection ${collections.current().id}).`); // i18n-ignore : journal
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
    selected: attractTable() ?? (onJukebox() ? undefined : tables[state.index]),
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

/**
 * Collections du menu des tables (collections-menu.ts) : la roue ne montre que celles de la
 * collection active ; les MagnaSave en changent ; le mode invité peut en imposer une.
 */
const collections = createCollectionsMenu({
  dataDir: loc.dataDir,
  tables: () => tables,
  selected: () => tables[state.index],
  select: (table) => {
    const index = tables.indexOf(table);
    if (index >= 0) state = { ...state, index };
  },
  // Réseau coupé (essais) : « Avec mes amis en ligne » le dit, grisée.
  ...(socialNetMode(process.env) === 'off' ? {} : { friends: (list: readonly TableEntry[]) => friendsMenu.live.playableWithFriends(list) }),
  guestCollection: () => guest.collection,
  startIndex: (list) => startIndex(list, mediaSettings.startTable),
  redraw: () => broadcast(),
});

/**
 * Disposition du menu sur le playfield : au bureau (zone en largeur, vue du joueur) ou en borne
 * (en hauteur), comme le rendu la choisit (frontend.js, syncMenuShape).
 */
function playfieldLandscape(): boolean {
  const win = windows.get('playfield');
  if (!win || win.isDestroyed()) return false;
  const { width, height } = win.getContentBounds();
  const turned = rotation === 90 || rotation === 270;
  return turned ? height > width : width > height;
}

/** Touches des MagnaSave au menu des tables : collection précédente (gauche), suivante (droite) ; jamais un bouton de l'interface. */
function collectionKeys(): { previous: string[]; next: string[] } {
  const keys = buttonKeys(buttons);
  const taken = new Set([...KEYS.previous, ...KEYS.next, ...KEYS.confirm, ...KEYS.exit, ...KEYS.help, ...KEYS.settings, ...Object.values(keys).filter(Boolean)]);
  // MagnaSave relevé ; sinon (bouton facultatif passé à l'étape « Boutons ») sa touche par défaut
  // d'un clavier (Ctrl gauche, Ctrl droit), si aucun autre bouton ne l'a prise, comme le mode invité.
  const own = (recorded: string | undefined, fallback: string) => (recorded && ![...KEYS.previous, ...KEYS.next, ...KEYS.confirm, ...KEYS.exit, ...KEYS.help, ...KEYS.settings].includes(recorded) ? [recorded] : !recorded && !taken.has(fallback) ? [fallback] : []);
  return { previous: own(keys.leftMagna, 'ControlLeft'), next: own(keys.rightMagna, 'ControlRight') };
}

/** Au démarrage, dans le journal : les touches qui changent de collection (une borne où rien ne répond s'explique). */
function logCollectionKeys(): void {
  const keys = collectionKeys();
  const name = (codes: string[]) => (codes.length ? codes.map(keyLabel).join(', ') : 'aucune'); // i18n-ignore : journal
  console.log(`Touches des collections : MagnaSave gauche → ${name(keys.previous)}, droit → ${name(keys.next)} ; aussi Menu système > Tables > Collections.`); // i18n-ignore : journal
}

/** MagnaSave ou clic sur le repère : la collection voisine (ou celle cliquée dans la liste). Mode invité restreint : le cadenas. */
function changeCollection(how: { step: -1 | 1 } | { id: string }): void {
  if (collections.locked()) {
    guest.knock('menu.collection-locked');
    return;
  }
  if (!guest.knock('menu.collections')) return;
  const changed = 'id' in how ? collections.choose(how.id) : collections.step(how.step);
  if (changed) playUiSound('solenoid');
}

// Fiche, ajout, médecin et suppression des tables (library.ts).
// Redessin de la file des téléchargements (downloadsChanged) : déclarés avant la gestion des tables, qui la crée.
let downloadsRedraw: NodeJS.Timeout | undefined;
let downloadsShown: string | undefined;
// Télécommande du téléphone (phone-remote.ts) : le navigateur intégré, puis tout le menu (setMenu,
// plus bas) ; réseau local réel en usage normal, si la règle du pare-feu de Cyber Pinball est
// posée ; 127.0.0.1 pendant un essai.
/** Fichier qui arrive du téléphone : le bandeau du menu et l'écran de la télécommande le suivent. */
let phoneUpload: { name: string; received: number; size: number } | undefined;
const phoneRemote = createPhoneRemote({
  mode: () => phoneRemoteMode(process.env),
  firewall: async () => socialFirewall.state() ?? (await socialFirewall.check()),
  fromSources: !app.isPackaged,
});
const library = createLibrary({
  root: loc.root,
  dataDir: loc.dataDir,
  // Essais : le Bureau du sélecteur de fichiers est un dossier du bac à sable (CYBERPINBALL_BUREAU),
  // jamais celui du poste, dont les noms de fichiers finiraient dans les captures.
  ...(process.env.CYBERPINBALL_BUREAU ? { desktopDir: () => process.env.CYBERPINBALL_BUREAU! } : {}),
  vpxExe: () => vpxInstall(loc)?.exe,
  tables: () => tables,
  reload: (file) => reloadTables(file),
  enter: () => (state = { ...state, phase: 'library', help: false, message: undefined }),
  leave: () => (state = tables.length ? { ...state, phase: 'menu' } : { ...state, phase: 'message', message: noTables() }),
  play: (table) => {
    state = { ...state, index: Math.max(0, tables.indexOf(table)) };
    // Sans opérateur, la partie s'arrête seule après 10 s, ou CYBERPINBALL_PARTIE_MS (et ne compte pas dans les statistiques).
    void play(table, process.env.CYBERPINBALL_AUTOPILOT ? Number(process.env.CYBERPINBALL_PARTIE_MS) || 10_000 : undefined);
  },
  // Jouer et enregistrer : la même partie, l'enregistrement armé ; son écran s'ouvre au retour.
  playAndRecord: (table, settings) => {
    state = { ...state, index: Math.max(0, tables.indexOf(table)) };
    // Sans opérateur, la partie dure le délai et la durée de l'enregistrement, plus 3 s (fin à la
    // durée) ; CYBERPINBALL_PARTIE_MS la raccourcit, pour une fin par la sortie de la table.
    const unattended = process.env.CYBERPINBALL_AUTOPILOT ? Number(process.env.CYBERPINBALL_PARTIE_MS) || (settings.delay + settings.duration + 3) * 1000 : undefined;
    void play(table, unattended, undefined, { record: settings });
  },
  recordableRoles: () => (['backglass', 'dmd'] as RecordedRole[]).filter((role) => menuAssignments[role]),
  tableSettings: (table) => openVpxSettings(table),
  playWithFriend: (table, back) => friendsMenu.live.sheetAction(table, back),
  scores: (table, period) => tableScores.board(table, period),
  rankings: (table, scope, period) => tableRankings.view(table, scope, period),
  hideScore: (id) => socialNet.hideScore(id),
  hidePlayer: (key) => socialNet.hidePlayer(key),
  // « Ajouter aux favoris » sur la fiche : User.Favorite du .info (celui de la table, sinon celui du dossier).
  menuDmd: { detail: (table) => menuDmd.detail(table), open: (table, back) => menuDmd.open(table, back) },
  favorite: (table, on) => {
    if (!loc.root) return;
    setFavorite(infoFileFor(table, layoutOf(loc.root).tables), on);
    console.log(`Favoris : ${table.id} ${on ? 'ajoutée' : 'retirée'}.`); // i18n-ignore : journal
    reloadTables(table.file);
  },
  adjustDisplay: async (table) => {
    state = { ...state, index: Math.max(0, tables.indexOf(table)) };
    const report = await play(table, process.env.CYBERPINBALL_AUTOPILOT ? 10_000 : undefined, 'display');
    return report?.result;
  },
  vpxLogFile: () => {
    const install = vpxInstall(loc);
    return install ? path.join(vpxPrefDir(install.version), 'vpinball.log') : undefined;
  },
  pupFolder: () => IniDocument.parse(readTextIfExists(activeVpxIni(loc)) ?? '').get('Plugin.PUP', 'PUPFolder'),
  playfieldOrientation: () => {
    const cabinet = loadCabinet(loc.dataDir);
    return cabinet ? playfieldOrientation(cabinet, observedDisplays(), readTextIfExists(activeVpxIni(loc))) : undefined;
  },
  quit: () => void quit(),
  keys: () => KEYS,
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  windows: () => windows,
  browserScreen: () => browserScreenRect(),
  audioOutput: () => audioOutput,
  phoneRemote,
  phoneUpload: () => phoneUpload,
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
  // Un téléchargement fini : au menu des tables, la notification du menu (selon son réglage) ; sur
  // un écran plein, le bandeau, et la notification ne le redira pas au retour (un seul mécanisme).
  notify: (text, job) => {
    if (job && state.phase === 'menu') return;
    if (job) menuNotices.said('download-done', job.id);
    showBanner(text);
  },
  downloadsChanged: () => downloadsChanged(),
  jukeboxChanged: () => broadcast(),
  // La vue du lecteur YouTube n'est pas dans la capture de sa fenêtre : à part (« en-ligne »).
  captureExtras: async () => {
    const png = await jukeboxPlayer.onlineCapture();
    return png ? [{ name: 'en-ligne', png }] : [];
  },
});

/**
 * Juke-box (jukebox-player.ts) : le médaillon en tête de chaque collection de la roue, et le mode
 * Juke-box (la liste sur le plateau, le clip sur le fronton, le spectre sur le DMD). Exit ramène à la
 * roue, la musique s'arrête.
 */
const jukeboxPlayer = createJukeboxPlayer({
  library: () => library.jukebox,
  windows: () => windows,
  windowRoles: () => windowRoles,
  desk: () => playfieldLandscape(),
  output: () => audioOutput,
  allow: (file) => allowJukebox(file),
  leave: () => {
    state = { ...state, phase: tables.length ? 'menu' : 'message', jukebox: true, ...(tables.length ? {} : { message: noTables() }) };
  },
  redraw: () => broadcast(),
  dmd: (name, animation) => liveDmd.custom(name, animation),
  dmdOn: () => Boolean(dmdWindow()) && state.phase !== 'playing' && state.phase !== 'intro' && !desktop.active,
  banner: (text) => showBanner(text),
  log: (line) => console.log(line),
  keys: () => ({ ...KEYS, playlistPrevious: collectionKeys().previous, playlistNext: collectionKeys().next }),
  ...(process.env.CYBERPINBALL_JUKEBOX_EN_LIGNE ? { fakeOnline: process.env.CYBERPINBALL_JUKEBOX_EN_LIGNE } : {}),
  // « Gestion du Juke-box » : sa gestion (étape 4, library.jukeboxMenu) sur la playlist montrée ; sans elle, le menu système.
  manage: (playlist) => {
    if (!guest.knock('menu.system')) return;
    const menu = jukeboxMenu();
    if (menu) menu.open(playlist);
    else openConfig();
    broadcast();
  },
});

/** La gestion des playlists (étape 4), quand elle est là : ouverte sur une playlist, ou sur l'import. */
function jukeboxMenu(): { open(playlist?: string): void } | undefined {
  const menu = (library as { jukeboxMenu?: { open?: unknown } }).jukeboxMenu;
  return typeof menu?.open === 'function' ? (menu as { open(playlist?: string): void }) : undefined;
}
// Une playlist qui attendait un téléchargement : « Revenir au Juke-box » rouvre le lecteur sur elle.
library.downloads.opener('jukebox', (back) => openJukebox('playlist' in back && typeof back.playlist === 'string' ? back.playlist : undefined));

/** Le médaillon Juke-box est dans la roue (réglage « Juke-box dans la roue », Menu système > Médias). */
function jukeboxShown(): boolean {
  return mediaSettings.jukebox;
}

/** Le médaillon est choisi dans la roue (pas en mode attente, qui montre une table). */
function onJukebox(): boolean {
  return jukeboxShown() && Boolean(state.jukebox) && !attractTable();
}

/** Ce que le menu dit du médaillon choisi : son titre et ses chiffres, comme le fabricant · année d'une table. */
function jukeboxCard() {
  const store = library.jukebox.store();
  const summary = store.playlists.length ? jukeboxSummary(store) : t('Aucune playlist · Start pour importer');
  return { title: t('Juke-box'), subtitle: summary, jukebox: true, favorite: false, plays: 0 };
}

/** Ouvre le mode Juke-box (Start sur le médaillon, retour d'un téléchargement), sur une playlist si elle est dite. */
function openJukebox(playlist?: string): void {
  // Aucune playlist : Start ouvre la gestion, où l'on en crée ou en importe une (sinon, l'invitation du lecteur).
  const menu = jukeboxMenu();
  if (menu && !library.jukebox.store().playlists.length && state.phase !== 'library') {
    if (!guest.knock('menu.system')) return;
    cancelWheelPress();
    menu.open();
    broadcast();
    return;
  }
  if (state.phase === 'library') library.leave();
  cancelWheelPress();
  collections.hidePanel();
  state = { ...state, phase: 'jukebox', help: false, message: undefined, jukebox: true };
  jukeboxPlayer.open(playlist);
  broadcast();
}

// Santé de la borne : premier relevé peu après le démarrage, puis toutes les 30 minutes (pastille
// rouge) ; jamais pendant une partie ni son chargement.
library.watchHealth(() => state.phase === 'loading' || state.phase === 'playing');
// Le téléphone pilote le menu quand « Récupérer » est fermé : ses boutons passent par handleKey
// (portes du mode invité comprises, jamais la combinaison de déverrouillage), son texte remplace
// celui du clavier à l'écran, un fichier envoyé arrive dans le dossier d'import (porte phone.files).
let phoneUploadShown = 0;
let phoneRedraw = false;
phoneRemote.setMenu({
  phase: () => (state.phase === 'loading' || state.phase === 'playing' ? 'game' : 'menu'),
  screen: () => remoteScreen(),
  field: () => (state.phase === 'library' ? library.remoteField() : undefined),
  button: (b, down, repeat) => remoteButton(b, down, repeat),
  setText: (value) => state.phase === 'library' && library.remoteSet(value),
  enter: () => state.phase === 'library' && library.remoteEnter(),
  uploadDir: () =>
    !guest.knock('phone.files')
      ? { refused: t('Indisponible en mode invité.') }
      : loc.root
        ? { dir: layoutOf(loc.root).import }
        : { refused: t('Aucun dossier de Cyber Pinball sur cette borne.') },
  uploading: (p) => {
    const was = phoneUpload;
    phoneUpload = p;
    // Le bandeau du menu suit l'envoi (l'écran de la télécommande a sa propre barre), quatre fois par seconde au plus.
    const text = p && !(state.phase === 'library' && library.remoteSurfaces().menu) ? phoneUploadBanner(p) : undefined;
    if (text) state = { ...state, banner: text };
    else if (was && state.banner === phoneUploadBanner(was)) state = { ...state, banner: undefined };
    const now = Date.now();
    if (p && now - phoneUploadShown < 250) return;
    phoneUploadShown = now;
    broadcast();
  },
  uploaded: (name) => showBanner(t('Reçu du téléphone : {name}, dans le dossier d’import', { name }), 'add-table'),
  // Le bloc de la télécommande a changé : un redessin, après le geste en cours (jamais pendant broadcast).
  changed: () => {
    if (phoneRedraw) return;
    phoneRedraw = true;
    setImmediate(() => {
      phoneRedraw = false;
      broadcast();
    });
  },
});

/** En tête de la page du téléphone : l'écran du menu affiché et ce qui y est choisi. */
function remoteScreen(): { title: string; item?: string; zone?: string } {
  if (state.phase === 'loading' || state.phase === 'playing') return { title: playing?.title ?? tables[state.index]?.title ?? t('Partie en cours') };
  if (state.phase === 'library') return library.remoteScreen() ?? { title: t('Menu système') };
  if (state.phase === 'message') return { title: state.message?.title ?? '' };
  if (state.phase === 'confirmQuit') return { title: t('Quitter Cyber Pinball ?') };
  // Juke-box : MagnaSave y passe à la playlist suivante.
  if (state.phase === 'jukebox') return { title: t('Juke-box'), zone: t('Playlist suivante') };
  // La roue : la collection active, la table choisie ; MagnaSave y passe à la collection suivante.
  return { title: collections.current().label || t('Menu des tables'), item: tables[state.index]?.title, zone: collections.locked() ? undefined : t('Collection suivante') };
}

/**
 * La touche d'un bouton de la borne sur cette borne (interfaceKeys, zoneSwitchKeys), comme une vraie
 * touche, pour un bouton tenu ailleurs qu'à la borne (téléphone, manettes du casque). `repeat` :
 * flipper tenu.
 */
function buttonInput(b: RemoteButton, down: boolean, repeat: boolean): Input | undefined {
  // MagnaSave : sur la roue, le droit (collection suivante, collections-menu.ts) ; ailleurs, la bascule entre la liste et les actions d'un écran.
  const zone = state.phase === 'menu' || state.phase === 'jukebox' ? (collectionKeys().next[0] ?? zoneSwitchKeys({ buttons, navigation })[0]) : zoneSwitchKeys({ buttons, navigation })[0];
  const code = b === 'zone' ? zone : KEYS[b][0];
  if (!code) return undefined;
  return { type: down ? 'keyDown' : 'keyUp', code, key: '', isAutoRepeat: repeat, isComposing: false, shift: false, control: false, alt: false, meta: false, location: 0, modifiers: [] } as unknown as Input;
}

/** Un bouton de la borne tenu au téléphone : sa touche, remise à handleKey comme une vraie touche. */
function remoteButton(b: RemoteButton, down: boolean, repeat: boolean): void {
  const input = buttonInput(b, down, repeat);
  if (!input) return;
  if (down) handleKey(input, true);
  else handleKeyUp(input, true);
}

/** Un bouton des manettes du casque : sa touche, remise à handleKey comme celle d'un bouton de la borne. */
function headsetKey(b: RemoteButton, down: boolean, repeat: boolean): void {
  const input = buttonInput(b, down, repeat);
  if (!input) return;
  if (down) handleKey(input);
  else handleKeyUp(input);
}

/** Boutons des manettes du casque tenus (casque.ts) ; les flippers se répètent comme ceux de la borne. */
const headsetHolds = new Map<HeadsetButton, NodeJS.Timeout | undefined>();
const HEADSET_REPEAT_DELAY_MS = 400;
const HEADSET_REPEAT_MS = 70;

/**
 * Manettes du casque : chaque bouton tient au menu celui de la borne (HEADSET_BUTTONS : gâchettes =
 * flippers, A = Start, B = Exit, poignées = MagnaSave), par le même chemin que les boutons de la
 * borne : ni le téléphone ni sa combinaison n'y entrent.
 */
function headsetButton(name: HeadsetButton, down: boolean): void {
  const b = HEADSET_BUTTONS[name];
  const held = headsetHolds.has(name);
  clearTimeout(headsetHolds.get(name));
  headsetHolds.delete(name);
  if (!down) {
    if (held) headsetKey(b, false, false);
    return;
  }
  headsetKey(b, true, false);
  if (b !== 'previous' && b !== 'next') return void headsetHolds.set(name, undefined);
  const again = (wait: number) =>
    headsetHolds.set(
      name,
      setTimeout(() => {
        headsetKey(b, true, true);
        again(HEADSET_REPEAT_MS);
      }, wait),
    );
  again(HEADSET_REPEAT_DELAY_MS);
}

/** Casque retiré, menu de Meta ouvert ou compagnon parti : plus aucun bouton des manettes n'est tenu. */
function releaseHeadsetButtons(): void {
  for (const name of [...headsetHolds.keys()]) headsetButton(name, false);
}

/** Bandeau du menu pendant un envoi du téléphone. */
function phoneUploadBanner(p: { name: string; received: number; size: number }): string {
  const pct = p.size ? Math.floor((p.received / p.size) * 100) : 0;
  return t('Réception depuis le téléphone · {pct} % · {name}', { pct, name: p.name });
}
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
          options: true,
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
/** Enregistre les réglages des médias et les applique (état renvoyé aux fenêtres). */
function saveMediaSettings(next: MenuMediaSettings): void {
  const reorder = next.tableOrder !== mediaSettings.tableOrder;
  mediaSettings = next;
  // Ordre changé : les tables se rangent autrement, la table choisie reste la même.
  if (reorder) {
    const current = tables[state.index];
    tables = sortTables(tables, next.tableOrder, shuffleKeys);
    state = { ...state, index: Math.max(0, current ? tables.indexOf(current) : 0) };
  }
  attract.reschedule();
  hours.update();
  try {
    saveMenuMediaSettings(loc.dataDir, mediaSettings);
  } catch (error) {
    console.log(`Médias : réglage non enregistré (${(error as Error).message}).`);
  }
  broadcast();
}
// Ouverture au démarrage : jouée ou coupée, l'animation de Cyber Pinball ou un fichier par écran, la musique de fond.
const introMenu = createIntroMenu({
  library,
  settings: () => mediaSettings.intro,
  save: (intro) => saveMediaSettings({ ...mediaSettings, intro }),
  mediaDir: () => (loc.root ? layoutOf(loc.root).media : undefined),
  trashRoot: () => (loc.root ? layoutOf(loc.root).trash : undefined),
  files: () => introFilesNow(),
  filesChanged: () => {
    introFileCache = undefined;
    medias?.invalidate();
    headsetMedias?.invalidate();
  },
  screens: () => {
    const dmdType = medias?.defaultMedia('dmd').type === 'FullDMD' ? 'FullDMD' : 'DMD';
    return new Set([...windowRoles.values()].flat().map((r) => introScreenOf(r, dmdType)));
  },
  preview: () => beginIntro('library'),
});
// Médias, son et attente (musique, volumes, mode attente, médias pendant la partie) : un écran à part.
library.provideSystemItem(
  'menu-media',
  createMenuSettings({
    library,
    settings: () => mediaSettings,
    save: (next) => saveMediaSettings(next),
    output: () => audioOutput,
    preview: (id) => playUiSound(id),
    wakeDevices: () => wakeDevices(),
    sleepAllowed: () => !powerUnavailable('sleep', power.capabilities()),
    intro: introMenu,
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
  downloads: library.downloads.manager,
  // Activité récente : une version plus récente, une fois par version ; au démarrage, la mise à jour faite ou manquée.
  available: (version, current) => {
    if (!activityMenu.entries().some((e) => e.kind === 'update-available' && e.key === version)) activityMenu.note({ kind: 'update-available', facts: { key: version, version, previous: current } });
  },
  outcome: (o) => activityMenu.note({ kind: o.installed ? 'update-installed' : 'update-failed', facts: { key: o.to, version: o.to, previous: o.previous } }),
  // Borne dédiée : Shell Launcher ne relance rien, l'installeur relance lui-même Cyber Pinball.
  quit: () => {
    handOverOnQuit();
    quit();
  },
  // Essais hors écran : seulement vers leur site d'essai, jamais vers GitHub.
  background: !OFFSCREEN || Boolean(process.env.CYBERPINBALL_MAJ_URL),
});
library.provideSystemItem('updates', updates.systemItem);
// Sauvegardes : sur une clé USB ou un disque, à la demande ou chaque semaine (réglages et scores) ;
// la restauration prépare ses fichiers puis relance le menu, qui les pose au démarrage (restore-on-start.ts).
const backups = createBackupsMenu({
  library,
  broadcast: () => broadcast(),
  root: loc.root,
  dataDir: loc.dataDir,
  trashRoot: loc.root ? layoutOf(loc.root).trash : path.join(loc.dataDir, 'trash'),
  version: app.getVersion(),
  cabinetName: () => {
    try {
      return loadSocial(loc.dataDir).name || undefined;
    } catch {
      return undefined;
    }
  },
  listDrives: () => listDrives(),
  diskSpace: (dir) => diskSpace(dir),
  eject: (drive) => ejectDrive(drive, OFFSCREEN),
  // Les fichiers restaurés sont posés par le nouveau processus : celui-ci n'écrit plus rien jusqu'à sa fin.
  relaunch: () => {
    freezeWrites([loc.root ?? loc.dataDir, loc.dataDir], [path.join(loc.dataDir, 'logs')]);
    relaunchMenu();
  },
  notify: (text) => showBanner(text),
});
library.provideSystemItem('backups', backups.systemItem);
{
  const restored = backups.restoredNotice();
  if (restored) setTimeout(() => showBanner(restored, 'backups'), 4000).unref();
  // Fichiers encore ouverts par l'ancien processus au démarrage (une vidéo en lecture) : reposés une fois qu'il est fermé.
  for (const delay of [20_000, 60_000]) setTimeout(() => backups.retryPendingRestore(), delay).unref();
  // Sauvegarde automatique : regardée chaque minute, faite quand la borne est libre.
  setInterval(() => void backups.autoTick(backupFree()).catch((error: Error) => console.error(`Sauvegarde automatique : ${error.message}`)), 60_000).unref(); // i18n-ignore : journal
}
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
// remplace « Bureau Windows » (il n'y a pas de bureau sans Explorateur), et « Quitter » disparaît :
// sans lui, l'écran resterait noir ; « Redémarrer Cyber Pinball » reste.
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
  otherFrontends: () => {
    const others = otherFrontendsOnThisPc();
    return others.length ? frontendNames(others) : undefined;
  },
});
library.provideSystemItem('dedicated', dedicated.dedicatedItem);
library.provideSystemItem('startup', dedicated.startupItem);
if (shellSession()) {
  library.provideSystemItem('explorer', dedicated.explorerItem);
  library.withdrawSystemItem('quit');
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
// Ferme et rouvre Cyber Pinball, le PC allumé : la même relance couverte que la langue ou une
// configuration (aucun écran ne montre le bureau entre les deux), sans l'ouverture du démarrage.
library.provideSystemItem('relaunch', {
  get detail() {
    return t('Ferme puis rouvre Cyber Pinball ; le PC reste allumé');
  },
  run: () => relaunchMenu(),
});
// Collections de la roue : aussi au menu système, pour une borne dont les MagnaSave ne répondent pas.
library.provideSystemItem('collections', createCollectionsItem({ collections, library }));
// Mode invité : on joue, rien d'autre ; l'écran de l'entrée dit la combinaison qui déverrouille.
library.provideSystemItem('guest-mode', createGuestMenu({
  collections: () => ({ choices: collections.list().filter((c) => c.tables.length).map((c) => ({ id: c.id, label: c.label, count: c.tables.length })), active: collections.current().id }), library, guest, buttons: () => buttons }));

// Réseau des bornes (Menu système > Amis) : partage activé par défaut, démarré avec le menu ;
// jamais le vrai réseau pendant un essai sans opérateur (socialNetMode), ni le vrai pare-feu.
const socialMode = socialNetMode(process.env);
// Démonstration : un ami hors ligne écrit avant le démarrage, des bornes fictives après.
const socialDemo = socialMode === 'simulated' && simulatedPlayersWanted(process.env);
if (socialDemo) seedSimulatedFriends(loc.dataDir);
let stopSimulatedPlayers: (() => Promise<void>) | undefined;
let socialRedraw: NodeJS.Timeout | undefined;
/** Un ami qui arrive, une demande reçue, un transfert qui avance : l'écran se redessine, au plus quatre fois par seconde. */
function socialChanged(): void {
  socialRedraw ??= setTimeout(() => {
    socialRedraw = undefined;
    if (closing) return;
    menuNotices.observe();
    broadcast();
  }, 250);
}
const socialNet = createSocialNet({
  dataDir: loc.dataDir,
  mode: socialMode,
  log: (line) => console.log(line),
  onChange: socialChanged,
  // Le pays par défaut des classements : la région de Windows (format régional, sinon langues préférées).
  systemLocale: () => [app.getSystemLocale(), ...app.getPreferredSystemLanguages()].find((l) => countryOfLocale(l)),
});

/**
 * La file des téléchargements a changé. Un écran de la gestion des tables (le gestionnaire, une
 * réception) se redessine au plus quatre fois par seconde ; le menu des tables seulement quand ce
 * que dit sa pastille change (le pourcentage entier), pour ne pas déranger ses vidéos.
 */
function downloadsChanged(): void {
  downloadsRedraw ??= setTimeout(() => {
    downloadsRedraw = undefined;
    if (closing) return;
    menuNotices.observe();
    const pill = JSON.stringify(library.downloads.pill() ?? null);
    if (state.phase === 'library' || pill !== downloadsShown) {
      downloadsShown = pill;
      broadcast();
    }
  }, 250);
}
// Et la règle qui ferme VPX au réseau (l'inspector des parties entre amis), pour sa version active.
const socialFirewall = createFirewallRule({ exe: process.execPath, simulated: socialMode !== 'public', vpx: () => vpxFirewallTargets(vpxInstall(loc)?.exe), log: (line) => console.log(line) });
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
  // Un partiel ou une table reçue que la file des téléchargements reprendra : le ménage l'épargne.
  keep: (file) => library.downloads.manager.owns(file),
  // La version stricte de mes tables, donnée aux amis avant qu'ils invitent : celle de mes invitations.
  versionOf: (table) => liveGames.versionOf(table),
  log: (line) => console.log(line),
});
// Gestionnaire de téléchargements : un ami est une source ; il reprend dès que l'ami est relié.
library.downloads.setTransport('friend', friendTransport(friendContent, socialNet));
library.downloads.friends({
  has: (key) => socialNet.state().friends.some((f) => f.key === key),
  name: (key) => socialNet.state().friends.find((f) => f.key === key)?.name,
});
// Pastille des amis en ligne et notifications discrètes (menu-notices.ts), une à la fois, sur
// chaque écran selon sa zone (noticezone.ts, currentZone) : partout dans Cyber Pinball, et en
// partie ce qui compte, par-dessus VPX (essai réel du 04/11/2026).
/**
 * « Masquer les notifications pendant les parties » (Menu système > Amis, quiet-in-game-setting.ts) :
 * désactivé par défaut ; activé, rien ne s'affiche ni ne sonne pendant une partie.
 */
let quietInGame = readQuietInGame(loc.dataDir);
/**
 * Activité récente (Menu système > Activité récente, activity-menu.ts) : chaque notification en
 * entier, affichée ou retenue, gardée d'un démarrage à l'autre ; ce que Start y fait passe par les
 * écrans des amis, de la partie entre amis, des téléchargements et du menu système.
 */
const activityMenu = createActivityMenu({
  dataDir: loc.dataDir,
  library: {
    openCustom: (build, at) => library.openCustom(build, at),
    openSystem: () => library.openSystem(),
    cursor: () => library.cursor(),
    isShowing: (build) => library.isShowing(build),
    runSystemItem: (id, back) => library.runSystemItem(id, back),
    hasSystemItem: (id) => library.hasSystemItem(id),
    openDownloads: (focus) => library.downloads.open(focus),
  },
  hasDownload: (id) => library.downloads.manager.jobs().some((j) => j.id === id),
  friends: {
    isFriend: (key) => socialNet.state().friends.some((f) => f.key === key),
    online: (key) => socialNet.online(key),
    playing: (key) => socialNet.presenceOf(key)?.status === 'playing',
    incoming: (key) => socialNet.state().incoming.some((r) => r.key === key),
    openFriend: (key, back) => friendsMenu.openFriend(key, back),
    openRequests: (back) => friendsMenu.openRequests(back),
    avatar: (key, name) => avatarView(key, name, socialNet.avatarFile(key)),
  },
  live: {
    hasInvite: (id) => liveGames.invites().some((i) => i.id === id),
    inviteEnd: (id) => liveGames.inviteEnd(id),
    openInvite: (id, back) => friendsMenu.live.openInvite(id, back),
    current: () => liveGames.current(),
    open: (back) => friendsMenu.live.open(back),
    inHistory: (id) => friendsMenu.history.has(id),
    openHistory: (id, back) => friendsMenu.history.openGame(id, back),
  },
  // La pastille de la roue dentée et de l'entrée suit le non lu.
  changed: () => {
    if (!closing && state.phase !== 'playing' && state.phase !== 'loading') broadcast();
  },
  log: (line) => console.log(line),
});
library.provideSystemItem('activity', activityMenu.item);
const menuNotices = createMenuNotices({
  social: socialNet,
  jobs: () => library.downloads.manager.jobs(),
  reason: (j) => downloadReasonText(j),
  badgeLabel,
  mode: () => mediaSettings.notices,
  zone: () => currentZone(),
  redraw: () => {
    if (!closing) broadcast();
  },
  // La partie entre amis et les invitations : jamais ce que l'écran de la partie ou de l'invitation
  // dit déjà, ni ce que la bande de la partie en cours montre déjà.
  live: {
    game: () => liveGames.current(),
    invites: () => liveGames.invites(),
    me: () => socialNet.state().key.publicKey,
    onScreen: () => friendsMenu.live.onScreen(),
    inviteOnScreen: (id) => friendsMenu.live.inviteOnScreen(id),
    inviteEnd: (id) => liveGames.inviteEnd(id),
    band: () => state.phase === 'playing' && !!playing && liveBoardUp(),
  },
  sound: (id) => playUiSound(id),
  activity: { record: (events, quiet) => activityMenu.record(events, quiet), shown: (events) => activityMenu.shown(events) },
  log: (line) => console.log(line),
});
/**
 * Une invitation qui arrive s'ouvre d'elle-même : sur la roue, comme avant ; dans le menu système
 * (chacun de ses sous-écrans) et sur l'aide des commandes, par-dessus, « Répondre plus tard » ou
 * « Retour » rendant l'écran tel qu'il était (library.interrupt). Ailleurs (message, confirmation,
 * mode attente, opération longue, saisie), la notification l'annonce et l'entrée du menu système
 * y mène. Pendant une partie : la carte sur le plateau (game-notice.ts).
 */
function openArrivedInvite(id: string): boolean {
  if (closing || guest.active || desktop.active) return false;
  if (state.phase === 'menu' && !attract.active) {
    if (state.help) state = { ...state, help: false };
    friendsMenu.live.openInvite(id, () => library.leave());
    return true;
  }
  if (state.phase === 'library') return library.interrupt((back) => friendsMenu.live.openInvite(id, back));
  return false;
}
// Partie en direct : invitation, départ commun, puis la table lancée ici comme par Start.
// Billes par partie (ROM, script, menu de service) : une partie en direct ne classe pas 5 billes contre 3.
const ballCounts = createBallCounts({ dataDir: loc.dataDir, romsOf, pinmameDirs: () => (loc.root ? [path.join(loc.root, 'pinmame')] : []) });
// Tableau des scores de chaque table : les scores de chaque partie, datés (table-scores.ts).
const tableScores = createTableScores({
  dataDir: loc.dataDir,
  romsOf,
  pinmameDirs: () => (loc.root ? [path.join(loc.root, 'pinmame')] : []),
  changed: () => broadcast(),
  log: (line) => console.log(line),
});
// Classements des amis, du pays et du monde au tableau des scores : la version exacte de chaque table, calculée une fois.
const tableRankings = createTableRankings({
  net: socialNet,
  versionOf: (table) => liveGames.versionOf(table),
  ballsOf: async (table) => (await ballCounts.of(table))?.balls,
  changed: () => broadcast(),
});
// Une partie entre amis se joue sur un double de la table : sa mémoire de ROM, ses records et ses
// réglages habituels ne sont jamais ouverts en écriture (table-double.ts). Ceux d'une partie
// interrompue par un plantage partent au démarrage.
const tableDoubles = createTableDoubles({
  root: () => loc.root,
  tablesDir: () => (loc.root ? layoutOf(loc.root).tables : undefined),
  romsOf,
  // Les cartes mémoire des ROM, mises en cache par ball-count.ts : le tableau d'une table à ROM.
  memoryCacheDir: path.join(loc.dataDir, 'cache', 'cartes-memoire'),
  // Copié dans le double, l'inspector activé, quand il sert à la partie (Stern SAM) : jamais modifié.
  cabinetIni: () => activeVpxIni(loc),
  log: (line) => console.log(line),
});
tableDoubles.sweep();
const liveGames = createLiveGames({
  net: socialNet,
  dataDir: loc.dataDir,
  appVersion: app.getVersion(),
  tables: () => tables,
  romsOf,
  ballsOf: async (table) => (await ballCounts.of(table))?.balls,
  // Mes réglages (mémoire et interrupteurs de la ROM, valeurs enregistrées) pour le double de chaque invité.
  settingsOf: (table) => readHostSettings({ folder: table.folder, roms: loadedRoms(table.folder, romsOf(table)), ...(loc.root ? { pinmameDir: path.join(loc.root, 'pinmame') } : {}) }),
  // Ma table aura-t-elle un relevé (départ automatique, score en direct) ? Dit avant la partie : choix, salon, invitation.
  // Hors écran, la partie simulée en décide (aucun vrai script) : sans relevé seulement si on le lui demande.
  manualOf: async (table) => {
    await new Promise((resolve) => setImmediate(resolve));
    if (OFFSCREEN && process.env.CYBERPINBALL_PARTIE_SIMULEE !== undefined) return SIMULATED_MANUAL ? 'script' : undefined;
    return tableDoubles.manualOf(table, socialFirewall.vpxState() === 'closed');
  },
  // Le carillon d'invitation sonne au menu comme pendant une partie ; en partie, la notification
  // se pose sur le plateau, par-dessus VPX : quitter sa partie ramène au menu, où l'invitation s'ouvre.
  onInvite: (invite) => {
    // Pendant une partie, notifications masquées : ni carillon ni carte ; l'invitation attend au menu, où elle s'ouvre au retour.
    if (playing && quietInGame) return void console.log(`Invitation pendant la partie : ${invite.host.name}, ${invite.title}, gardée pour le menu (notifications masquées pendant les parties).`); // i18n-ignore : journal
    playUiSound('invite');
    if (playing) gameNotices.show(invite);
    else if (!openArrivedInvite(invite.id)) console.log(`Invitation de ${invite.host.name} : annoncée par la notification (écran « ${zoneScreen()} » laissé tel quel).`); // i18n-ignore : journal
  },
  play: async (table, onPlaying, settings, board, progress, gate) => {
    // Le départ commun ferme l'écran ouvert (le compte à rebours), comme Start sur une table.
    if (library.isActive()) library.leave();
    state = { ...state, index: Math.max(0, tables.indexOf(table)) };
    const report = await play(table, process.env.CYBERPINBALL_AUTOPILOT ? 10_000 : undefined, undefined, { onPlaying, double: `${Date.now().toString(36)}`, ...(settings ? { settings } : {}), ...(board ? { board } : {}), ...(progress ? { onProgress: progress } : {}), ...(gate ? { gate } : {}) });
    // De retour au menu : les résultats, qui se complètent à mesure que les autres reviennent.
    if (report && state.phase === 'menu') setImmediate(() => friendsMenu.live.open(() => library.leave()));
    if (!report) return undefined;
    // Une partie qui a tourné compte comme jouée, même si VPX a planté ou rendu un code d'erreur en se fermant
    // (essai du 30/10/2026 : « La partie n'a pas démarré de son côté » après plusieurs minutes de jeu).
    const played = report.result.ok || report.result.seconds >= PLAYED_SECONDS;
    if (played && !report.result.ok) console.log(`Partie entre amis : VPX s'est mal fermé (${report.result.message ?? report.result.failure}), mais la partie a tourné ${Math.round(report.result.seconds)} s : jouée.`); // i18n-ignore : journal
    return {
      ok: played,
      seconds: report.result.seconds,
      records: report.entered.map((s) => ({ score: s.score, rank: s.rank, ...(s.initials ? { initials: s.initials } : {}) })),
      ...(report.live?.score !== undefined ? { score: report.live.score } : {}),
      ...(report.live?.multi ? { multi: true } : {}),
    };
  },
  onChange: () => {
    socialChanged();
    showLiveBoard();
    // Le compte à rebours et l'annulation s'affichent d'eux-mêmes ; dans la gestion des tables aussi, une fois la partie acceptée.
    friendsMenu.live.follow(() => !closing && (state.phase === 'menu' || state.phase === 'library'), () => library.leave());
  },
  log: (line) => console.log(line),
});
// Volume −, Volume + et Muet : le son de Windows, au menu comme en partie (cabinet-volume.ts).
let cabinetVolume: CabinetVolume | undefined;
// Fiche > « DMD sur la roue » : le DMD du menu affiché ou masqué pour chaque table, et sa place (menu-dmd.ts).
const menuDmd = createMenuDmd({
  dataDir: loc.dataDir,
  configuration: () => menuConfiguration,
  auto: (table) => autoDmdPlace(table),
  unseen: () =>
    mediaSettings.dmd !== 'live'
      ? t('« DMD du menu » est réglé sur « classique » : la roue montre le média DMD de la table, sans points (Menu système > Médias > « Médias, son et attente »).')
      : undefined,
  keys: () => {
    const magna = zoneSwitchKeys({ buttons, navigation });
    const b = buttonKeys(buttons);
    const only = (code: string | undefined) => (code && magna.includes(code) ? [code] : []);
    return { previous: KEYS.previous, next: KEYS.next, confirm: KEYS.confirm, exit: KEYS.exit, up: only(b.leftMagna), down: only(b.rightMagna) };
  },
  library: { openCustom: (build, at, table) => library.openCustom(build, at, table), openSheet: (table, flash) => library.openSheet(table, flash) },
  broadcast: () => broadcast(),
  log: (line) => console.log(line),
});
// Les deux MagnaSave pendant la partie : position du DMD, puis le menu de VPX (in-game-menu.ts).
const inGameMenu = createInGameMenu({ log: (line) => console.log(line), allowed: () => guest.allows('game.settings') });
// Invitation reçue pendant la partie : carte discrète dans le coin du plateau (game-notice.ts).
const gameNotices = createGameNotices({
  place: playfieldPlace,
  boardScreens: liveBoardScreens,
  dmdColor: () => menuDmdColor(),
  scoresSettings: () => readLiveScoresSettings(loc.dataDir, playing?.id),
  dmdVerdict: () => dmdWatch?.verdict(),
  dmdUnreadable: () => (dmdWatch ? dmdWatch.unreadable() : 'inspector de VPX non activé pour cette partie (pare-feu de VPX non autorisé ?)'), // i18n-ignore : journal
  // Hors écran, la pile des fenêtres est celle du vrai bureau : rien à y chercher.
  coveredBy: (win) => (OFFSCREEN ? undefined : describeCover(win)),
  invites: () => liveGames.invites(),
  avatar: (key, name) => avatarView(key, name, socialNet.avatarFile(key)),
  captureDir: process.env.CYBERPINBALL_CAPTURE,
  log: (line) => console.log(line),
});
// Mon avatar (avatar-menu.ts) : une image à soi, recadrée aux boutons, que les amis voient partout.
const avatarMenu = createAvatarMenu({
  library,
  net: socialNet,
  convert: () => (converter ??= createConverter()),
  allowPreview,
  dataDir: loc.dataDir,
  browse: (url, received) => {
    library.catalog.acquirer.show({
      url,
      game: t('Mon avatar'),
      expected: t('Une image : photo, dessin, logo'),
      host: t('Recherche libre · image que vous choisissez'),
      status: t('Clic droit sur une image : « Télécharger cette image ». Elle revient à « Mon avatar » pour le recadrage. Fermer (Échap) garde la page.'),
      search: { query: t('avatar flipper'), engine: 'images' },
      claim: {
        dir: path.join(avatarsDir(loc.dataDir), 'recadrage', 'recu'),
        title: t('Mon avatar'),
        done: (r) => {
          if ('error' in r) return;
          // L'image est là : le navigateur se ferme, le recadrage s'ouvre dans le menu.
          library.catalog.acquirer.close();
          received(r.file);
        },
      },
    });
    return undefined;
  },
});
library.provideSystemItem('avatar', {
  get detail() {
    return avatarMenu.detail();
  },
  run: () => avatarMenu.open(() => library.openSystem()),
});
const friendsMenu = createFriendsMenu({
  library: {
    ...library,
    catalogFor: (identity) => (identity.vpsId ? library.catalog.openGame(identity.vpsId) : library.catalog.openSearch(identity.title)),
  },
  net: socialNet,
  avatarMenu,
  firewall: socialFirewall,
  content: friendContent,
  downloads: library.downloads,
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
library.provideSystemItem('game-history', friendsMenu.items['game-history']);
library.provideSystemItem('find-player', friendsMenu.items['find-player']);
library.provideSystemItem('friend-requests', friendsMenu.items['friend-requests']);
library.provideSystemItem('badges', friendsMenu.items.badges);
library.provideSystemItem('sharing', friendsMenu.items.sharing);
// « Ajouter une table > Depuis un ami… » : la bibliothèque d'un ami, ses tables absentes d'abord.
library.provideAddFromFriend(friendsMenu.addFromFriend);
// « Masquer les notifications pendant les parties » : Start bascule, le curseur reste sur l'entrée.
library.provideSystemItem('quiet-in-game', {
  get detail() {
    return quietInGame
      ? t('Activé · connexion d’un ami, demande de rejoindre une partie, etc. : rien pendant une partie, tout reste au menu')
      : t('Désactivé · connexion d’un ami, demande de rejoindre une partie, etc.');
  },
  run: () => {
    quietInGame = !quietInGame;
    writeQuietInGame(loc.dataDir, quietInGame);
    console.log(`Notifications pendant les parties : ${quietInGame ? 'masquées' : 'affichées'}.`); // i18n-ignore : journal
    library.openSystem();
  },
});
// « Réalité virtuelle » (Menu système > Borne, vr.ts) : désactivée, ou les tables dans le casque quand il
// est prêt. Sans runtime OpenXR, l'entrée reste visible, grisée avec sa raison ; Start n'y change rien.
let vrMode = readVrMode(loc.dataDir);
// Le menu dans le casque (casque.ts) : les écrans de la borne montrés dans le casque, hors partie.
let headset: HeadsetMenu | undefined;
/** Partie en cours : le casque est à VPX. */
let headsetPaused = false;
library.provideSystemItem('vr', {
  // En plein essai (casque, menu dans le casque) : badge « BÊTA » dans tous ses états.
  badge: 'beta',
  get label() {
    return vrMenuText(vrMode, probeVr()).label;
  },
  get detail() {
    return vrMenuText(vrMode, probeVr(), headset?.state).detail;
  },
  get tone() {
    return vrMenuText(vrMode, probeVr()).unavailable ? ('quiet' as const) : undefined;
  },
  run: () => {
    const readiness = probeVr();
    if (!readiness.ready) return void library.openSystem();
    vrMode = vrMode === 'auto' ? 'off' : 'auto';
    writeVrMode(loc.dataDir, vrMode);
    console.log(`Réalité virtuelle : ${vrMode === 'auto' ? `activée (${readiness.runtime})` : 'désactivée'}.`); // i18n-ignore : journal
    library.openSystem();
  },
});

// « Vision 3D » (Menu système > Borne, vision3d.ts) : la perspective des tables suit la tête du joueur,
// par une webcam ou une Kinect pour Xbox 360. Sans capteur, l'entrée reste visible, grisée avec sa
// raison ; une Kinect sans pilote propose de l'installer (chez Microsoft, avec l'accord de Windows).
let vision3d = readVision3d(loc.dataDir);
const headTracker = new HeadTracker({ dataDir: loc.dataDir, appDir: path.join(__dirname, '..'), log: (line) => console.log(line) });
/** Capteurs branchés, relus au plus toutes les deux secondes (le menu relit ses entrées à chaque image). */
let vision3dProbe: { at: number; hardware: Vision3dHardware } | undefined;
function vision3dHardware(fresh = false): Vision3dHardware {
  if (fresh || !vision3dProbe || Date.now() - vision3dProbe.at > 2000) vision3dProbe = { at: Date.now(), hardware: probeVision3d() };
  return vision3dProbe.hardware;
}
const vision3dPluginMissing = () => !vision3dPluginFiles(path.join(__dirname, '..'));
const kinectDriverMb = () => megabytes(findComponent('kinect-runtime-1.8').size);
const vision3dText = () => vision3dMenuText(vision3d, vision3dReadiness(vision3dHardware(), vision3d.source), { driverMb: kinectDriverMb(), pluginMissing: vision3dPluginMissing() });
library.provideSystemItem('vision3d', {
  badge: 'beta',
  get label() {
    return vision3dText().label;
  },
  get detail() {
    return vision3dText().detail;
  },
  get tone() {
    return vision3dText().unavailable ? ('quiet' as const) : undefined;
  },
  run: () => {
    if (vision3dPluginMissing()) return void library.openSystem();
    vision3dHardware(true);
    openVision3dScreen();
  },
});

/** Essai du capteur hors partie : positions vues, et quand il s'arrête de lui-même (la caméra ne reste pas allumée). */
let vision3dTest: { until: number; seen: number; last?: { x: number; y: number; z: number }; timer: NodeJS.Timeout } | undefined;
const VISION3D_TEST_MS = 20_000;

function stopVision3dTest(): void {
  if (!vision3dTest) return;
  clearInterval(vision3dTest.timer);
  vision3dTest = undefined;
  headTracker.stop();
}

/**
 * Écran « Vision 3D » : où en est le capteur (prêt, ou pourquoi pas, en clair), l'activer, l'essayer
 * sans lancer de table, installer ou réinstaller le pilote de la Kinect, ouvrir « Isolation du noyau ».
 */
function openVision3dScreen(at = 0): void {
  const back = () => {
    stopVision3dTest();
    library.openSystem();
  };
  library.openCustom(() => {
    const hw = vision3dHardware();
    const readiness = vision3dReadiness(hw, vision3d.source);
    const rows: Row[] = [
      readiness.ready
        ? { icon: 'check', text: t('{sensor} prête', { sensor: readiness.label }), ...(readiness.note && { detail: readiness.note }), tone: 'ok' as const }
        : { icon: 'alert', text: readiness.reason, tone: 'warning' as const },
      { icon: 'eye', text: vision3d.mode === 'on' ? t('Vision 3D activée : la perspective des tables suit votre tête') : t('Vision 3D désactivée'), tone: vision3d.mode === 'on' ? ('ok' as const) : ('quiet' as const) },
    ];
    if (vision3dLastGame && !vision3dTest) rows.push({ icon: vision3dLastGame.ok ? 'check' : 'alert', text: vision3dLastGame.text, tone: vision3dLastGame.ok ? ('ok' as const) : ('warning' as const) });
    if (vision3dTest) {
      const failure = headTracker.failureReason;
      const last = vision3dTest.last;
      rows.push(
        failure
          ? { icon: 'alert', text: t('Essai : le capteur ne répond pas ({reason})', { reason: failure }), tone: 'warning' as const }
          : last && headTracker.state === 'tracking'
            ? {
                icon: 'pulse',
                text: t('Essai : tête vue à {d} m', { d: (last.z / 100).toLocaleString(language() === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 2 }) }),
                detail: t('{x} cm à droite, {y} cm en hauteur (depuis le capteur) · penchez-vous : les valeurs suivent', { x: Math.round(last.x), y: Math.round(last.y) }),
                tone: 'ok' as const,
              }
            : { icon: 'pulse', text: vision3dTest.seen ? t('Essai : tête perdue, revenez devant le capteur') : t('Essai : capteur allumé, mettez-vous devant lui…'), tone: 'info' as const },
      );
    }
    const actions: { label: string; detail?: string; icon: IconName; run: () => void }[] = [];
    if (readiness.ready) {
      actions.push({
        label: vision3d.mode === 'on' ? t('Désactiver la Vision 3D') : t('Activer la Vision 3D'),
        icon: 'eye',
        run: () => {
          vision3d = { ...readVision3d(loc.dataDir), mode: vision3d.mode === 'on' ? 'off' : 'on' };
          writeVision3d(loc.dataDir, vision3d);
          console.log(`Vision 3D : ${vision3d.mode === 'on' ? `activée (${readiness.label})` : 'désactivée'}.`); // i18n-ignore : journal
          openVision3dScreen(library.cursor());
        },
      });
      actions.push({
        label: vision3dTest ? t('Arrêter l’essai') : t('Tester le capteur'),
        detail: vision3dTest ? undefined : t('Sans lancer de table : la position de votre tête, en direct, pendant {s} s', { s: VISION3D_TEST_MS / 1000 }),
        icon: 'pulse',
        run: () => (vision3dTest ? (stopVision3dTest(), openVision3dScreen(library.cursor())) : startVision3dTest(readiness.source)),
      });
    }
    if (!readiness.ready && readiness.installKinectDriver) {
      actions.push({ label: t('Installer le pilote de la Kinect'), detail: t('{mb} Mo, téléchargé chez Microsoft ; l’installer vaut acceptation de sa licence', { mb: kinectDriverMb() }), icon: 'download', run: () => void installKinect() });
    } else if (hw.kinect1 && hw.kinect1Driver && !hw.memoryIntegrity) {
      actions.push({ label: t('Réinstaller le pilote de la Kinect'), detail: t('Si la Kinect ne répond pas malgré son pilote ; Windows demande son accord'), icon: 'refresh', run: () => void installKinect() });
    }
    if (!readiness.ready && readiness.memoryIntegrity) {
      actions.push({
        label: t('Ouvrir « Isolation du noyau »'),
        detail: t('Dans Sécurité Windows : vous décidez ; puis redémarrez le PC'),
        icon: 'lock',
        run: () => {
          console.log('Vision 3D : ouverture de « Isolation du noyau » (Sécurité Windows).'); // i18n-ignore : journal
          stopVision3dTest();
          // Les écrans libérés d'abord (Bureau Windows) : la page ne s'ouvre pas derrière le menu.
          showDesktop();
          void shell.openExternal('windowsdefender://coreisolation');
        },
      });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: SYSTEM_ITEMS.vision3d.label,
      icon: SYSTEM_ITEMS.vision3d.icon,
      lead: t('La perspective des tables suit votre tête, comme une fenêtre ouverte sur le plateau. Une webcam suffit ; une Kinect pour Xbox 360 vise seule votre tête. Les images restent sur ce PC.'),
      sections: [{ rows }],
      actions,
      back,
    };
  }, at);
}

/** Bilan de la dernière partie avec Vision 3D, montré dans l'écran « Vision 3D » et noté au journal. */
let vision3dLastGame: { ok: boolean; text: string } | undefined;

function noteVision3dGame(logFile: string, from: number): void {
  let text = '';
  try {
    const all = fs.readFileSync(logFile);
    // VPX recommence son journal à chaque lancement : plus court qu'avant, il est tout neuf.
    text = all.subarray(all.length >= from ? from : 0).toString('utf8');
  } catch {
    text = '';
  }
  const { sent, failure } = headTracker.summary();
  vision3dLastGame = vision3dGameReport(vision3dPluginLog(text), sent, failure);
  console.log(`Vision 3D : ${vision3dLastGame.text}`); // i18n-ignore : journal (texte déjà traduit)
}

/** « Tester le capteur » : allumé hors partie, l'écran suit la tête en direct, puis s'éteint seul. */
function startVision3dTest(source: Vision3dSourceKind): void {
  stopVision3dTest();
  const timer = setInterval(() => {
    if (!vision3dTest) return;
    if (Date.now() > vision3dTest.until || playing || launch) stopVision3dTest();
    openVision3dScreen(library.cursor());
  }, 300);
  vision3dTest = { until: Date.now() + VISION3D_TEST_MS, seen: 0, timer };
  headTracker.test(source, vision3d, (p) => {
    if (!vision3dTest) return;
    vision3dTest.seen++;
    vision3dTest.last = p;
  });
  openVision3dScreen(library.cursor());
}

/** Le pilote de la Kinect : téléchargé chez Microsoft, signature vérifiée, installé avec l'accord de Windows ; puis la Vision 3D s'active. */
async function installKinect(): Promise<void> {
  if (!loc.root) return;
  const downloads = layoutOf(loc.root).downloads;
  let file: string | undefined;
  await library.task(t('Téléchargement du pilote de la Kinect chez Microsoft ({mb} Mo)…', { mb: kinectDriverMb() }), async () => {
    file = await downloadKinectDriver(downloads, library.downloads.manager);
  });
  if (!file) return;
  let installed = false;
  await library.task(t('Autorisation demandée à Windows : répondez dans la fenêtre « Contrôle de compte d’utilisateur »…'), async () => {
    const result = await installKinectDriver(file!);
    console.log(`Vision 3D : pilote de la Kinect ${result.ok ? 'installé' : `pas installé (${result.reason})`}.`); // i18n-ignore : journal
    if (!result.ok) throw new Error(result.cancelled ? t('Autorisation refusée dans la fenêtre de Windows : rien n’a changé') : t('Pilote de la Kinect pas installé : {reason}', { reason: result.reason }));
    installed = true;
  });
  if (!installed) return;
  vision3d = { ...readVision3d(loc.dataDir), mode: 'on' };
  writeVision3d(loc.dataDir, vision3d);
  vision3dHardware(true);
  openVision3dScreen();
}

/**
 * Partie avec Vision 3D : le capteur à allumer, ou undefined (désactivée, aucun capteur prêt, partie
 * en VR, réglage de l'affichage). Le plugin est remis dans VPX avant chaque partie s'il a changé.
 */
function prepareVision3d(vpxExe: string, inVr: boolean): Vision3dSourceKind | undefined {
  const plugin = installVision3dPlugin(path.dirname(vpxExe), path.join(__dirname, '..'));
  if (plugin === 'installed') console.log('Vision 3D : plugin copié dans VPX.'); // i18n-ignore : journal
  if (vision3d.mode !== 'on' || inVr) return undefined;
  if (plugin === 'missing') {
    console.log('Vision 3D : activée, mais plugin absent de cette version ; partie sans suivi de la tête.'); // i18n-ignore : journal
    return undefined;
  }
  const readiness = vision3dReadiness(vision3dHardware(true), vision3d.source);
  if (!readiness.ready) {
    console.log(`Vision 3D : activée mais indisponible (${readiness.reason}) ; partie sans suivi de la tête.`); // i18n-ignore : journal
    return undefined;
  }
  return readiness.source;
}

// « Caler la borne » (Menu système > Borne, après « Réalité virtuelle ») : la borne du casque et les
// tables de VPX posées sur la vraie barre avant, touchée aux manettes (calage.ts). Grisée, avec sa
// raison, tant que le menu n'est pas dans le casque. Aussi : les deux poignées tenues 3 s.
library.provideSystemItem('vr-calibrate', {
  get detail() {
    return calibrateMenuText({ vrReady: probeVr().ready, headset: headset?.state, place: headset?.place(), setting: headsetSetting() }).detail;
  },
  get tone() {
    return calibrateUnavailable() ? ('quiet' as const) : undefined;
  },
  run: () => (calibrateUnavailable() ? library.openSystem() : openCalibration()),
});

/** Le chemin de casque.json : la place de la borne du casque, seule pose de la borne (menu et parties). */
function headsetPlaceFile(): string {
  // Un calage par configuration : le bureau et la borne n'ont ni la même pièce ni la même limite du Quest.
  return path.join(loc.dataDir, 'vr', cabinetPlaceFileName(menuConfiguration));
}

/** Vraie borne devant le joueur (barre avant à toucher), ou bureau (placement libre) : selon la configuration active. */
function headsetSetting(): CalibrationSetting {
  return calibrationSetting(rotation);
}

/** Hauteur des yeux dite par le compagnon (sol mal réglé), et limite du Quest changée depuis le calage. */
let headsetEyes: number | undefined;
let roomNotice = false;
/** Calage déjà proposé d'office pendant cette session (Exit le referme ; il revient à la suivante). */
let calibrationOffered = false;

/** Calage proposé d'office dans le casque : borne pas calée, ou limite du Quest changée (`again`). */
function offerCalibration(again = false): void {
  if ((calibrationOffered && !again) || calibration || playing || launch || calibrateUnavailable() || !headset?.worn) return;
  calibrationOffered = true;
  console.log(`Casque : calage de la borne proposé d'office (${again ? 'limite du Quest changée' : 'borne pas encore calée'}).`); // i18n-ignore : journal
  openCalibration();
}

function calibrateUnavailable(): boolean {
  return calibrateMenuText({ vrReady: probeVr().ready, headset: headset?.state }).unavailable;
}

/** Calage en cours : les points touchés (coin gauche, coin droit, milieu), la place proposée, et où revenir. */
let calibration: { points: Partial<Record<CalibrationStep, Point3>>; place?: CabinetPlace; back: 'menu' | 'system'; placing?: boolean } | undefined;

function openCalibration(): void {
  if (!headset || calibration || playing || launch) return;
  calibration = { points: {}, back: state.phase === 'menu' ? 'menu' : 'system' };
  headset.calibrate(true);
  console.log('Casque : calage de la borne ouvert.'); // i18n-ignore : journal
  showCalibration();
}

/** L'écran du calage, à l'étape où il en est (ou ce qui ne va pas, et il reprend au coin gauche). */
function showCalibration(problem?: string): void {
  const c = calibration;
  if (!c) return;
  const p = c.points;
  const cancel = t('Exit : annuler');
  let lines: string[];
  // Avant les coins : ce qui fausserait le calage (limite changée, sol du Quest mal réglé).
  const notices = [
    ...(roomNotice ? [t('La limite du Quest a changé depuis le calage : la borne n’est sans doute plus sur la vraie. Recalez-la.')] : []),
    ...(!p.right && eyeHeightProblem(headsetEyes) ? [eyeHeightProblem(headsetEyes)!] : []),
    ...(!p.left && !isCalibrated(headset?.place()) && headsetSetting() === 'borne' ? [t('Pas encore calée : la borne du casque et les tables doivent être posées sur la vraie avant de jouer.')] : []),
    ...(!p.left && !isCalibrated(headset?.place()) && headsetSetting() === 'bureau' ? [t('Pas encore posée : la borne du casque et les tables doivent avoir leur place avant de jouer.')] : []),
  ];
  if (problem) lines = [...notices, problem, cancel];
  else if (c.placing) lines = [t('Pose de la borne devant vous…')];
  // Au bureau, pas de barre avant à toucher : la borne se pose où regarde le joueur, ou sur le bord du bureau.
  else if (!p.left && headsetSetting() === 'bureau')
    lines = [
      ...notices,
      t('Pas de vraie borne devant vous : la borne du casque se pose où vous voulez, puis ne bouge plus.'),
      t('Regardez droit devant vous, debout ou assis comme pour jouer, puis Start : la borne se pose ici, sa barre avant 30 cm devant vous, à 88 cm du sol.'),
      t('Ou touchez du bout de la manette le bord gauche puis le bord droit du bureau, gâchette appuyée : la barre avant s’y pose.'),
      t('Start : poser la borne ici · Exit : annuler'),
    ];
  else if (!p.left) lines = [...notices, t('Posez le bout de la manette sur le coin gauche de la vraie barre avant, puis appuyez sur la gâchette.'), cancel];
  else if (!p.right) lines = [...notices, t('Coin gauche pris. Posez le bout de la manette sur le coin droit, puis appuyez sur la gâchette.'), cancel];
  else if (!p.middle) lines = [t('Coin droit pris : la borne du casque s’est posée sur la barre avant. Pour vérifier, touchez le milieu de la barre avant, gâchette appuyée.'), t('Start : garder sans vérifier · Exit : annuler')];
  else {
    const gap = Math.round(calibrationGap(p.left, p.right, p.middle) * 10) / 10;
    lines = [
      t('Barre avant de {w} cm, à {h} cm du sol ; le milieu touché est à {gap} cm du milieu calé.', { w: Math.round((c.place?.lockbarWidth ?? 0) * 100), h: Math.round((c.place?.lockbarHeight ?? 0) * 100), gap: gap.toLocaleString(language() === 'en' ? 'en-US' : 'fr-FR') }),
      t('Les plots verts marquent les coins de la barre avant virtuelle : ils doivent tomber sur les vrais.'),
      t('Start : garder · Exit : annuler'),
    ];
  }
  state = { ...state, phase: 'message', help: false, message: { title: t('Caler la borne'), lines } };
  broadcast();
}

/** Un point touché, gâchette appuyée (compagnon : « pointe ») : coin gauche, coin droit, puis le milieu (retouchable). */
function calibrationPoint(point: Point3, room: boolean): void {
  const c = calibration;
  if (!c) return;
  if (!room) {
    c.points = {};
    return showCalibration(t('Le casque n’a pas d’espace de la pièce (limite du Quest non définie) : le calage ne tiendrait pas d’une session à l’autre. Définissez la limite dans le Quest, puis recommencez.'));
  }
  const p = c.points;
  if (!p.left) p.left = point;
  else if (!p.right) {
    const problem = calibrationProblem(p.left, point);
    if (problem) {
      c.points = {};
      return showCalibration(problem);
    }
    p.right = point;
    // La borne du casque vient aussitôt sur la barre avant, ses coins marqués : de quoi juger avant de garder.
    c.place = lockbarPlace(p.left, p.right);
    headset?.showPlace(c.place);
    headset?.setMarks(lockbarMarks(c.place.lockbarWidth ?? 0));
  } else p.middle = point;
  showCalibration();
}

/** Pendant le calage : Start garde (les deux coins pris), Exit annule ; les flippers ne déplacent rien. */
function calibrationKey(input: Input): boolean {
  if (input.isAutoRepeat) return true;
  if (KEYS.exit.includes(input.code)) closeCalibration(false);
  else if (KEYS.confirm.includes(input.code) && calibration?.place) closeCalibration(true);
  // Au bureau, avant tout point : Start pose la borne où regarde le joueur (recentrage, puis « centre »).
  else if (KEYS.confirm.includes(input.code) && calibration && !calibration.points.left && !calibration.placing && headsetSetting() === 'bureau') {
    calibration.placing = true;
    showCalibration();
    headset?.recenter();
  }
  return true;
}

/** Recentrage demandé par « poser la borne ici » : la place du regard, barre avant à hauteur de borne, gardée. */
function calibrationCentre(gaze: { x: number; z: number; yaw: number }): void {
  const c = calibration;
  if (!c?.placing) return;
  c.place = freePlace(gaze);
  closeCalibration(true);
}

/**
 * Fin du calage. Gardé : la place de la borne du casque (casque.json) et celle de la table de VPX
 * (INI de la VR : [PlayerVR] Orientation, TableX/Y/Z ; [Player] LockbarWidth/Height). Annulé : la
 * borne revient à sa place gardée.
 */
function closeCalibration(keep: boolean): void {
  const c = calibration;
  if (!c) return;
  calibration = undefined;
  headset?.calibrate(false);
  headset?.setMarks([]);
  const { left, right, middle } = c.points;
  if (keep && c.place) {
    // La limite du Quest est gardée avec le calage : si elle change, le calage est proposé de nouveau.
    const place: CabinetPlace = { ...c.place, ...(headset?.room && { room: headset.room }), ...(headsetSetting() === 'bureau' && { free: true }) };
    headset?.showPlace(place, true);
    roomNotice = false;
    try {
      writeVrCalibration(loc.dataDir, left && right ? lockbarVpxSettings(left, right) : placeVpxSettings(place));
    } catch (error) {
      console.warn(`Casque : calage pas écrit dans l’INI de la VR (${(error as Error).message}).`); // i18n-ignore : journal
    }
    const gap = !left || !right ? ', posée sur le regard du joueur' : middle ? `, milieu touché à ${calibrationGap(left, right, middle).toFixed(1)} cm du milieu calé` : ', milieu pas vérifié'; // i18n-ignore : journal
    console.log(`Casque : borne ${place.free ? 'posée au bureau' : 'calée'} (${menuConfiguration ?? 'configuration unique'}), barre avant de ${Math.round((place.lockbarWidth ?? 0) * 100)} cm à ${Math.round((place.lockbarHeight ?? 0) * 100)} cm du sol${gap}.`); // i18n-ignore : journal
  } else {
    headset?.showPlace(undefined);
    console.log('Casque : calage de la borne annulé.'); // i18n-ignore : journal
  }
  if (c.back === 'menu') {
    state = { ...state, phase: 'menu', message: undefined };
    broadcast();
  } else library.openSystem();
}

/**
 * Rotation du playfield quand le menu est dans le casque : en portrait, comme sur une borne, même
 * sur un écran posé en paysage (demande du 9 novembre 2026). Un playfield déjà tourné (borne) garde
 * la sienne ; sinon un quart de tour, le bord des flippers à gauche de l'image.
 */
function headsetTurn(): Rotation {
  return rotation === 0 || rotation === 180 ? 90 : rotation;
}

/**
 * Ce que le casque montre (casque.ts) : chaque rôle du menu, son rectangle sur le bureau et la
 * taille réelle de son écran (modèle de la borne).
 */
function headsetSources(): HeadsetSource[] {
  const cabinet = loadCabinet(loc.dataDir);
  return roleRects.map(({ role, rect }) => {
    const screen = cabinet?.screens.find((s) => s.fingerprint === cabinet.roles[role]);
    return {
      role,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      ...(screen && { screenCm: { width: screen.widthCm, height: screen.heightCm }, screenPx: { width: screen.widthPx, height: screen.heightPx } }),
    };
  });
}

/**
 * Partie en VR (vr.ts) : l'INI préparé pour VPX, ou undefined (désactivée, aucun runtime OpenXR,
 * préparation impossible) : la partie se joue alors comme d'habitude, sur les écrans.
 */
function prepareVr(tableFile: string, doubleIni: string | undefined): VrGame | undefined {
  if (vrMode !== 'auto') return undefined;
  const readiness = probeVr();
  if (!readiness.ready) {
    console.log(`Réalité virtuelle : activée mais indisponible (${readiness.reason}) ; partie sur les écrans.`); // i18n-ignore : journal
    return undefined;
  }
  try {
    const vr = prepareVrGame({ dataDir: loc.dataDir, baseIni: doubleIni ?? activeVpxIni(loc), tableFile, inPlace: Boolean(doubleIni) });
    const details = [vr.room ? 'pièce VR de la table' : 'fronton ajouté par VPX', ...(vr.carried ? [`${vr.carried} réglage(s) de la VR repris`] : []), ...vr.changes]; // i18n-ignore : journal
    // Une seule pose : la table de VPX où est la borne du casque (calée ou non), à chaque partie.
    const place = readCabinetPlace(headsetPlaceFile());
    if (place) {
      const settings = placeVpxSettings(place);
      writeIniSettings(vr.ini, settings);
      details.push(`place de la borne du casque${isCalibrated(place) ? ' calée' : ''} : ${settings.map((s) => `${s.key} ${s.value}`).join(', ')}`); // i18n-ignore : journal
    }
    console.log(`Réalité virtuelle : ${readiness.runtime}, INI de la partie ${vr.ini} (${details.join(' ; ')}).`); // i18n-ignore : journal
    return vr;
  } catch (error) {
    console.log(`Réalité virtuelle : préparation impossible (${(error as Error).message}) ; partie sur les écrans.`); // i18n-ignore : journal
    return undefined;
  }
}
// Scores des amis pendant la partie : la place de la bande, au choix du joueur (live-scores-menu.ts).
library.provideSystemItem(
  'live-scores',
  createLiveScoresMenu({
    library,
    get: () => readLiveScoresSettings(loc.dataDir),
    set: (settings) => writeLiveScoresSettings(loc.dataDir, settings),
    cabinet: () => ({
      backglass: Boolean(menuAssignments.backglass),
      topper: Boolean(menuAssignments.topper),
      dmd: roleRects.some((r) => r.role === 'dmd'),
      inspector: socialFirewall.vpxState() === 'closed',
    }),
  }),
);

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
    restoreTaskbars('power');
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

/** Sans bouton depuis 30 s, au menu : une sauvegarde automatique peut se faire (« dès que possible »). */
const BACKUP_IDLE_MS = 30_000;
/**
 * Borne libre pour une sauvegarde automatique : au menu (ni partie, ni chargement, ni bureau, ni
 * action d'alimentation), sans bouton depuis 30 s ; une partie lancée pendant la copie l'arrête.
 */
function backupFree(): boolean {
  if (desktop.active || state.phase === 'loading' || state.phase === 'playing' || power.control.busy) return false;
  if (state.phase === 'message' && state.message?.action === 'power') return false;
  return attract.active || attract.idleFor() >= BACKUP_IDLE_MS;
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
  // Les barres des tâches, visibles au bureau, repassent derrière le menu.
  void takeForeground().then(() => settleScreens('desktop-back'));
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
  // Extensions signées du dossier plugins des données (plugins.ts) : chargées une fois, journal déjà ouvert, avant les écrans qui les appellent.
  loadPlugins(loc.dataDir);
  // Cyber Pinball relancé alors que le menu est ouvert : le menu revient (mode bureau quitté,
  // premier plan) ; pendant une partie, VPX garde l'écran.
  handleSecondLaunch(() => {
    if (desktop.active) return restoreFromDesktop();
    if (state.phase === 'playing' || state.phase === 'loading') return;
    void showMenuAgain();
  });
  // Chromium ne donne le nom des sorties audio, et n'autorise setSinkId (sortie du fronton
  // pour la musique du menu), qu'avec ces permissions ; les pages du menu sont locales.
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'speaker-selection');
  ipcMain.on('ready', (event) => {
    // Une fenêtre rendue pour le casque : elle reçoit l'état, sans compter pour l'ouverture.
    if (isHeadsetView(event.sender)) return broadcast();
    if (introRun.active) introWindowReady(event.sender.id);
    broadcast();
    // Fenêtre (re)chargée : elle n'a pas encore l'image du DMD vivant.
    liveDmd.resend();
  });
  ipcMain.on('media-error', (event, error: MediaErrorReport) => !isHeadsetView(event.sender) && recordMediaError(error));
  // Juke-box : temps, fin, erreur et niveaux du morceau en cours, place du clip (jukebox-player.ts) ;
  // jamais d'une fenêtre du casque (sa copie du clip, muette, ne commande rien).
  ipcMain.on('jukebox', (event, message: JukeboxMessage) => !isHeadsetView(event.sender) && jukeboxPlayer.message(message));
  ipcMain.on('action', (event, action: UiAction) => {
    // Les fenêtres du casque ne reçoivent aucun geste ; leurs mesures ne valent pas pour les écrans.
    if (isHeadsetView(event.sender)) return;
    // Mesure du texte par le rendu (zone de lecture) : pas un geste, elle ne réveille rien.
    if (action.type === 'reading') return library.handleAction(action);
    // Un clic en mode attente y met fin, sans autre effet ; de même pour le préavis d'arrêt de l'horaire.
    const noticed = hours.activity();
    if (attract.activity() || noticed) return void leaveAttract();
    // Un clic pendant l'ouverture affiche la roue, comme un bouton.
    if (state.phase === 'intro') return void leaveIntro();
    // Clic sur « Start : jouer » de la roue : un clic n'a pas de durée, il joue tout de suite.
    if (action.type === 'key' && state.phase === 'menu' && !state.help && wheelPlays() && KEYS.confirm.includes(action.code) && tables[state.index] && !onJukebox()) wheelConfirm(tables[state.index]!, false), broadcast();
    else if (action.type === 'key') handleKey({ type: 'keyDown', code: action.code, key: '' } as Input);
    // Roue dentée (ou cadenas, en mode invité).
    else if (action.type === 'config') guest.knock('menu.system') && openConfig();
    // Pastille des téléchargements du menu des tables.
    else if (action.type === 'downloads') {
      if (state.phase === 'menu' && guest.knock('menu.system')) library.downloads.open();
    }
    // Pastille des amis en ligne, notification d'un ami ou d'une demande : l'écran qu'elle annonce.
    else if (action.type === 'friends' || action.type === 'friend-requests') {
      if (state.phase === 'menu' && guest.knock('menu.system')) friendsMenu.items[action.type].run();
    }
    // Nouvelle de la partie entre amis (au menu des tables ou dans le menu système) : l'écran de la partie.
    else if (action.type === 'live-game') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) friendsMenu.live.open(() => library.leave());
    }
    // Résumé « 4 nouveautés » : Activité récente, qui dit chacune en entier ; Retour ramène où l'on était.
    else if (action.type === 'activity') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) activityMenu.open(state.phase === 'menu' ? () => library.leave() : undefined);
    }
    else if (action.type === 'collections' && state.phase === 'menu' && tables.length) {
      changeCollection(typeof action.id === 'string' ? { id: action.id } : { step: action.step === -1 ? -1 : 1 });
      broadcast();
    }
    else if (action.type === 'jukebox') {
      if (state.phase === 'jukebox') jukeboxPlayer.click(action);
    }
    else if (action.type === 'wheel' && state.phase === 'menu' && tables.length) {
      // Clic sur la table au centre : comme Start (la fiche, ou la partie en « jouer directement ») ; le médaillon Juke-box : le lecteur.
      if (action.offset === 0 && onJukebox()) return void openJukebox();
      if (action.offset === 0) wheelConfirm(tables[state.index]!, !wheelPlays());
      else if (guest.knock('menu.choose')) moveSelection(action.offset);
      broadcast();
    } else library.handleAction(action);
  });

  const install = vpxInstall(loc);
  const { assignments, problem, manual, choose, selection } = syncScreens();
  tables = scanOrdered();
  // Table au démarrage : la première de l'ordre choisi, une au hasard, ou la dernière jouée.
  state = { ...state, index: startIndex(tables, mediaSettings.startTable) };
  // Collection gardée du dernier démarrage (ou imposée par le mode invité) : la table de départ y est prise.
  collections.start();
  logCollectionKeys();
  // Configuration à choisir : le menu s'ouvre droit sur l'écran principal, avec les boutons de la dernière utilisée.
  const cabinet = loadCabinet(loc.dataDir);
  menuDmdKind = cabinet && !choose ? dmdKindOf(cabinet) : undefined;
  menuConfiguration = cabinet && !choose ? cabinet.id : undefined;
  // Rotation d'après l'écran du playfield tel que Windows le décrit maintenant : une
  // orientation changée hors de l'assistant fait aussi tourner le menu.
  rotation = menuRotation(choose ? undefined : cabinet, choose ? undefined : assignments.playfield);
  buttons = cabinet?.buttons;
  tilt = cabinet?.tilt;
  navigation = cabinet?.navigation;
  KEYS = menuKeysFor(cabinet);
  audioOutput = choose ? undefined : menuAudioOutput(cabinet)?.friendlyName;
  // Les boutons de volume règlent le son de toute la borne (Windows), sur les sorties de l'étape « Son ».
  cabinetVolume = startCabinetVolume({
    config: () => {
      const current = loadCabinet(loc.dataDir);
      return { buttons: current?.buttons, outputs: choose ? [] : volumeOutputIds(current?.audio) };
    },
    place: playfieldPlace,
    captureDir: process.env.CYBERPINBALL_CAPTURE,
    log: (line) => console.log(line),
  });
  medias = new MenuMedias({ root: loc.root, dataDir: loc.dataDir, cabinet: choose ? undefined : cabinet, rotation, onChange: () => broadcast() });
  // Couleur de chaque table (table-tint.ts) : mesurée par le convertisseur hors écran, une fois par média.
  // La teinte passe aussi au halo des cadres de la borne dans le casque (casque.ts).
  tints = new TableTints({
    dataDir: loc.dataDir,
    converter: () => (converter ??= createConverter()),
    onChange: () => {
      broadcast();
      headset?.tintChanged();
    },
  });
  // Les avatars des joueurs (avatar.ts) se lisent aussi par le protocole des médias.
  serveMedias(() => [...medias!.allowedDirs(tables), avatarsDir(loc.dataDir)]);

  // Média ajouté, remplacé ou supprimé, table ajoutée, renommée ou supprimée, par
  // n'importe quel chemin (Cyber Pinball ou à la main) : relu et renvoyé aux fenêtres.
  if (loc.root) {
    const layout = layoutOf(loc.root);
    mediaWatch = watchMediaChanges({
      dirs: [layout.tables, layout.media],
      onChange: (changes) => {
        introFileCache = undefined;
        if (changes.has('tables')) reloadTables();
        else medias?.invalidate();
        headsetMedias?.invalidate();
        broadcast();
      },
    });
  }
  app.on('before-quit', () => {
    closing = true;
    headset?.dispose();
    // Le téléphone apprend que Cyber Pinball se ferme ; plus rien n'écoute.
    phoneRemote.close();
    cabinetVolume?.stop();
    guest.dispose();
    mediaWatch?.close();
    saveSettings();
    attract.dispose();
    hours.dispose();
    liveDmd.dispose();
    dmdWheels.dispose();
    void stopSimulatedPlayers?.();
    // La file est écrite ; ce qui tournait reprendra au prochain démarrage, là où il en était.
    library.downloads.manager.stop();
    friendContent.stop();
    liveGames.stop();
    void socialNet.stop();
  });

  menuAssignments = choose ? {} : assignments;
  openWindows(assignments, cabinet && !choose ? cabinetZones(cabinet) : {});
  // Écran débranché puis rebranché hors partie : chaque fenêtre du menu reprend le sien. Pendant
  // un lancement ou une partie, rien ne bouge (le premier plan va à VPX) : la reprise se fait au retour.
  onScreensSettled(() => playing || launch || recoverScreens('displays'));
  headset = new HeadsetMenu({
    appDir: path.join(__dirname, '..'),
    wanted: () => !headsetPaused && !closing && (Boolean(HEADSET_TRIAL_DIR) || (vrMode === 'auto' && probeVr().ready)),
    loader: () => {
      const exe = vpxInstall(loc)?.exe;
      const loader = exe && path.join(path.dirname(exe), 'openxr_loader64.dll');
      return loader && fs.existsSync(loader) ? loader : undefined;
    },
    sources: () => headsetSources(),
    playfieldRotation: () => headsetTurn(),
    tint: () => tints?.current()?.color,
    snapshotDir: path.join(loc.dataDir, 'logs', 'casque'),
    placeFile: headsetPlaceFile(),
    onStateChange: () => {
      // Casque porté : les écrans rendus pour lui dessinent, ceux du PC se reposent ; retiré, l'inverse.
      setHeadsetPainting(Boolean(headset?.worn));
      if (!headset?.worn) releaseHeadsetButtons();
      // Compagnon parti pendant le calage : rien à garder.
      if (calibration && !headset?.running) closeCalibration(false);
      // Borne pas encore calée : le calage s'ouvre d'office dans le casque, avant la navigation.
      if (headset?.worn && !isCalibrated(headset.place())) offerCalibration();
      broadcast();
    },
    openViews: () => {
      headsetMedias ??= loc.root ? new MenuMedias({ root: loc.root, dataDir: loc.dataDir, cabinet: loadCabinet(loc.dataDir), rotation: headsetTurn(), onChange: () => broadcast() }) : undefined;
      openHeadsetViews(headsetPages, {
        appDir: path.join(__dirname, '..'),
        playfieldRotation: headsetTurn(),
        onTexture: (surface, texture) => (headset ? headset.relay(surface, texture) : texture.release()),
        log: (line) => console.log(line),
      });
      // Chaque rôle : la page qui le porte, et sa place dedans.
      return roleRects.flatMap(({ role, rect }) => {
        const page = headsetPages.find((p) => p.role === role) ?? headsetPages.find((p) => rect.x >= p.bounds.x && rect.y >= p.bounds.y && rect.x + rect.width <= p.bounds.x + p.bounds.width && rect.y + rect.height <= p.bounds.y + p.bounds.height);
        const b = page?.bounds;
        return page && b ? [{ role, surface: page.role, fx: (rect.x - b.x) / b.width, fy: (rect.y - b.y) / b.height, fw: rect.width / b.width, fh: rect.height / b.height }] : [];
      });
    },
    closeViews: () => closeHeadsetViews(),
    onButton: (button, down) => headsetButton(button, down),
    onPoint: (_hand, point, room) => calibrationPoint(point, room),
    onGesture: () => (calibrateUnavailable() ? undefined : openCalibration()),
    onCentre: (gaze) => calibrationCentre(gaze),
    onEyes: (eyes) => {
      headsetEyes = eyes;
      if (calibration) showCalibration();
    },
    onRoom: (room, changed) => {
      const place = headset?.place();
      if (!changed && !(isCalibrated(place) && roomMoved(place?.room, room))) return;
      console.warn('Casque : la limite du Quest a changé depuis le calage ; calage de la borne proposé.'); // i18n-ignore : journal
      roomNotice = true;
      offerCalibration(true);
    },
    log: (line) => console.log(line),
  });
  headset.watch();
  // Horaire de la borne : nuit et arrêt programmé, d'après les réglages de medias.json.
  hours.start();
  // Réseau des bornes : présence aux amis, annuaire ; un échec s'affiche dans « Partage et réseau ».
  void socialNet.start().then(async () => {
    socialNet.checkBadges(playStats(tables));
    // Les règles du pare-feu, à chaque démarrage et après une mise à jour : lues, écrites au
    // journal, reposées d'elles-mêmes par la tâche de réparation si l'une manque (firewall-guard.ts).
    // Ce qui reste à reposer reste visible : « Partage et réseau », la présence des amis ; et juste
    // après une mise à jour, l'écran « Pare-feu de Windows », jamais au milieu d'une partie.
    if (socialMode !== 'off') void checkFirewallAtStart().catch(() => undefined);
    if (socialDemo) stopSimulatedPlayers = await startSimulatedPlayers(socialNet, loc.dataDir, () => tables, (line) => console.log(line));
  });
  for (const f of selection?.findings ?? []) console.log(`Configuration de la borne : ${f.message}`);
  // Bande DMD seule sur un écran large, jamais tranchée : l'utilisateur dit une fois ce qu'est l'écran.
  // Orientation des écrans : ce que le démarrage (ou la dernière fermeture) n'a pas pu rendre.
  const orientationProblems = takeOrientationProblems();
  if (orientationProblems.length) showBanner(orientationProblems.join(' '), 'cabinet');
  const legacy = choose ? undefined : legacyDesktopTurned();
  if (cabinet && !choose && dmdKindQuestion(cabinet)) showBanner(t('Écran du DMD à vérifier : FullDMD ou DMD seul ? Menu système > Borne > Configuration de la borne > Écran du DMD.'), 'cabinet');
  if (selection?.previous && selection.configuration) showBanner(t('Configuration « {name} » reconnue (avant : « {previous} »).', { name: selection.configuration.name, previous: selection.previous.name }), 'cabinet');
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

  // Ouverture : quand le démarrage arrive sur le menu des tables, avant la roue.
  if (!choose && introAtStartup({ settings: mediaSettings.intro, landing: state.phase, argv: process.argv, env: process.env })) {
    beginIntro('menu');
    // Une fenêtre qui ne dit jamais « prête » ne retient pas les autres.
    setTimeout(() => introRun.start() && broadcast(), INTRO_READY_MAX_MS);
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

/** Les tables du disque, dans l'ordre choisi pour le menu. */
function scanOrdered(): TableEntry[] {
  return loc.root ? sortTables(scanTables(layoutOf(loc.root).tables), mediaSettings.tableOrder, shuffleKeys) : [];
}

function noTables(): Message {
  return { title: t('Aucune table'), lines: [t('Start : ajouter une table.'), t('Exit : menu.')], action: 'addTable' };
}

/** Relit les tables après un ajout, une réparation ou une suppression, en gardant la sélection. */
function reloadTables(selectFile?: string): void {
  const current = tables[state.index]?.file;
  tables = scanOrdered();
  // Médias ajoutés, remplacés ou supprimés avec les tables : tout est recherché à nouveau.
  medias?.invalidate();
  headsetMedias?.invalidate();
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
  headsetPages = surfaces.map((s) => ({ role: s.role, bounds: { ...s.display.bounds }, parts: s.parts, ...(s.playfield ? { playfield: s.playfield } : {}) }));
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
    // Fermée depuis Windows (bouton de la barre des tâches, Alt+F4) : tout Cyber Pinball se ferme
    // avec elle, ses autres fenêtres et ses voiles compris ; rien ne reste dans le gestionnaire des tâches.
    quitWithWindow(win, title);
    // Seule la mise en page du playfield pivote : la fenêtre garde les bornes de l'écran.
    const turn = role.id === 'playfield' ? rotation : 0;
    win.loadFile(path.join(__dirname, '..', 'renderer', 'frontend.html'), { query: { role: role.id, rotation: String(turn), zones: JSON.stringify(parts), ...(playfield && { playfield: JSON.stringify(playfield) }) } });
    // Au plus tard après READY_TO_SHOW_MAX_MS : un démarrage lent laissait le menu invisible (06/11/2026).
    whenReadyToShow(win, () => {
      win.show();
      if (role.id !== 'playfield') return;
      win.focus();
      settleScreens('start');
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

/**
 * Touche ou bouton relâché : la combinaison de déverrouillage, et la bascule des zones (MagnaSave, F6).
 * `fromPhone` : relâché au téléphone (remoteButton), qui ne compte pas dans la combinaison.
 */
function handleKeyUp(input: Input, fromPhone = false): void {
  if (!fromPhone) {
    cabinetVolume?.windowInput(input);
    guest.input(input.code, false, unlockListening());
  }
  // Roue en « jouer directement » : Start relâché tôt lance la partie (au téléphone aussi).
  releaseWheelStart(input.code);
  // Gestion des tables : MagnaSave (F6) relâché bascule entre la liste et les actions de l'écran.
  if (state.phase === 'library') library.handleKeyUp(input);
}

/**
 * Touches et boutons du menu. En mode invité, chaque porte (GUEST_DOORS) laisse passer ou non :
 * fermée, rien ne se passe que l'indice « Verrouillé » près du cadenas.
 */
function handleKey(input: Input, fromPhone = false): boolean {
  if (!fromPhone) cabinetVolume?.windowInput(input);
  const is = (group: string[]) => group.includes(input.code);
  // Un bouton de la combinaison appuyé pendant qu'un autre est tenu ne fait rien d'autre. Le
  // téléphone n'y entre pas : on ne déverrouille le mode invité qu'à la borne.
  if (!fromPhone && guest.input(input.code, true, unlockListening())) return true;
  if (input.control && input.code === 'KeyQ') return guest.knock('shortcut.quit') ? quit() : true;
  // Extinction, veille ou redémarrage en cours : plus rien ne se choisit.
  if (state.phase === 'message' && state.message?.action === 'power') return true;
  // Calage de la borne aux manettes : Start garde, Exit annule, rien d'autre.
  if (calibration) return calibrationKey(input);
  // Menu montré dans le casque : la touche de recentrage de VPX (5 du pavé) remet la borne devant le joueur.
  if (input.code === 'Numpad5' && !input.isAutoRepeat && headset?.state === 'shown') {
    headset.recenter();
    console.log('Casque : borne recentrée sur le regard du joueur (5 du pavé).'); // i18n-ignore : journal
    return true;
  }
  // Raccourci du mode bureau, de n'importe quel écran du menu (sauf pendant une partie) ; une fenêtre rouverte au bureau le reçoit aussi : retour.
  if (matchesShortcut(input, SHORTCUTS.desktop)) return desktop.active ? (restoreFromDesktop(), true) : guest.knock('shortcut.desktop') ? showDesktop() : true;
  // N'importe quel bouton en mode attente y met fin, sans autre effet ; sinon il remet le compte à zéro.
  // Le préavis d'arrêt de l'horaire aussi : la borne reste allumée tant qu'on joue.
  const noticed = hours.activity();
  if (attract.activity() || noticed) return leaveAttract();
  // Ouverture : n'importe quel bouton affiche la roue (pendant la lecture aussi), sans autre effet.
  if (state.phase === 'intro') return leaveIntro();

  // Un téléphone a lu le QR de l'écran affiché (télécommande, clavier à l'écran) : Start et Exit
  // sont à lui, jamais à l'écran derrière. Start l'accepte, Exit le refuse.
  if (!fromPhone && !input.isAutoRepeat && state.phase === 'library' && (phoneRemote.pendingOn('menu') || phoneRemote.pendingOn('keyboard'))) {
    if (is(KEYS.confirm)) {
      phoneRemote.accept();
      broadcast();
      return true;
    }
    if (is(KEYS.exit)) {
      phoneRemote.refuse();
      broadcast();
      return true;
    }
  }

  // Tab : menu et configuration, quels que soient les boutons relevés (dans le menu, Tab s'y déplace).
  if (input.code === CONFIG_KEY && ['menu', 'message', 'confirmQuit'].includes(state.phase)) return guest.knock('menu.system') ? openConfig() : true;

  switch (state.phase) {
    case 'loading':
      // Ctrl+Maj+K arrête le lancement ; Exit aussi, une fois que le chargement tarde et le dit.
      if (matchesShortcut(input, SHORTCUTS.forceStop) || (launch?.slow && is(KEYS.exit))) {
        if (guest.knock('game.force-stop')) stopLaunch();
      }
      return true;
    case 'playing':
      return true;
    case 'library':
      return library.handleKey(input);
    // Juke-box : flippers, Start, MagnaSave, Exit (jukebox-player.ts), qui redessine lui-même.
    case 'jukebox':
      return jukeboxPlayer.handleKey(input);
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
      // VPX arrêté par le script de la table (rien ne manque) : Start la relance.
      if (state.message?.action === 'replay' && is(KEYS.confirm)) {
        const again = tables.find((x) => x.file === state.message?.table);
        state = { ...state, phase: 'menu', message: undefined };
        if (again) {
          state = { ...state, index: Math.max(0, tables.indexOf(again)) };
          void play(again);
          return true;
        }
        break;
      }
      // VPX arrêté pendant une partie entre amis : Start ouvre la partie (les autres continuent, les résultats y arrivent).
      if (state.message?.action === 'live' && is(KEYS.confirm)) {
        state = { ...state, phase: 'menu', message: undefined };
        friendsMenu.live.open(() => library.leave());
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
      // Un autre bouton pendant que Start est tenu (« jouer directement ») : l'appui ne lance plus rien.
      if (wheelPress && input.code !== wheelPress.code) cancelWheelPress();
      if (is(KEYS.help)) guest.knock('menu.commands') && (state = { ...state, help: !state.help });
      else if (state.help && is(KEYS.exit)) state = { ...state, help: false };
      else if (is(KEYS.previous)) guest.knock('menu.choose') && moveSelection(-1);
      else if (is(KEYS.next)) guest.knock('menu.choose') && moveSelection(1);
      else if (is(KEYS.confirm) && onJukebox()) {
        // Médaillon Juke-box : Start ouvre le lecteur (rien ne démarre seul).
        if (!input.isAutoRepeat) openJukebox();
        return true;
      } else if (is(KEYS.confirm)) {
        // « Jouer directement » : l'appui attend son relâchement (partie) ou sa durée (fiche) ; la répétition d'une touche tenue n'y change rien.
        if (!wheelPlays()) wheelConfirm(tables[state.index]!, true);
        else if (!input.isAutoRepeat) pressWheelStart(input.code);
      } else if (is(KEYS.settings)) !onJukebox() && guest.knock('menu.vpx-settings') && openVpxSettings();
      else if (is(KEYS.exit)) guest.knock('menu.system') && library.openSystem();
      else if (is(collectionKeys().previous)) changeCollection({ step: -1 });
      else if (is(collectionKeys().next)) changeCollection({ step: 1 });
      // « Jouer directement » : F6 d'un clavier ouvre aussi la fiche (les MagnaSave de la borne changent de collection).
      else if (wheelPlays() && is(sheetKeys()) && !onJukebox()) {
        if (!input.isAutoRepeat) wheelConfirm(tables[state.index]!, true);
      }
      else return false;
      break;
  }
  broadcast();
  return true;
}

/**
 * Réparations avant une partie (doctor.ts, PUP_PLAY_REPAIRS) : script que le core.vbs actuel
 * arrête (vpmInit appelé deux fois), puis PuP-Packs : pack mal rangé,
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
 * Partie arrêtée par une boîte de dialogue qui trahit un script que le core.vbs actuel refuse
 * (scriptcompat.ts, vpmInit appelé deux fois) : le .vbs de Cyber Pinball est corrigé aussitôt,
 * la partie suivante démarre. Renvoie ce qui a été fait, pour le message.
 */
function repairScriptStop(table: TableEntry, message: string): string | undefined {
  if (!loc.root) return undefined;
  const layout = layoutOf(loc.root);
  try {
    const done = repairScriptAfterStop(
      table,
      { tablesDir: layout.tables, script: cachedScript(table.file, loc.dataDir) },
      { trashDir: trashDirFor(layout.trash, `Après la partie ${path.basename(table.folder)}`) }, // i18n-ignore : nom de dossier
      message,
    );
    if (!done) return undefined;
    console.log(`Script (${table.id}) : ${done.title} → ${done.fix!.label}`); // i18n-ignore : journal
    return done.fix!.label;
  } catch (error) {
    console.log(`Script (${table.id}) : correction après la partie impossible (${(error as Error).message}).`); // i18n-ignore : journal
    return undefined;
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
  /** Partie entre amis : le dernier état lu par le relevé du double (score final, plusieurs joueurs). */
  live?: { score?: number; multi?: boolean };
}

/**
 * Relevé simulé d'une partie simulée (hors écran) : la table prête après une seconde ; départ une
 * seconde après « partez » (`goAt` : quand le fichier du double a été posé), le score qui monte,
 * trois billes, puis la partie finie deux secondes avant l'arrêt prévu. La ligne passe par
 * parseLiveState, comme celle d'une vraie table : avant la partie, joueur, nombre de joueurs et score
 * y sont vides, comme sur The Goonies et The Matrix, qui ne les posent qu'au Start (04/11/2026).
 */
function simulatedLiveState(startedAt: number, durationMs: number, goAt: () => number | undefined): () => LiveGameState | undefined {
  return () => {
    const ready = Date.now() - startedAt >= 1000;
    const go = goAt();
    const elapsed = go === undefined ? 0 : Date.now() - go;
    const playing = Math.max(0, elapsed - 1000);
    const span = Math.max(1000, durationMs - 3000);
    const started = elapsed >= 1000;
    const values = started ? `joueurs=1;joueur=1;bille=${Math.min(3, 1 + Math.floor((playing / span) * 3))};billes=3;score=${Math.floor(playing / 500) * 12_340}` : 'joueurs=;joueur=;bille=4;billes=3;score=';
    return parseLiveState(`jeu=${started && playing < span ? 1 : 0};vu=${started ? 1 : 0};${values};pret=${ready ? 1 : 0}`); // i18n-ignore : clés du relevé
  };
}

/** Une partie qui a tourné au moins ce temps compte comme jouée, même si VPX s'est mal fermé. */
const PLAYED_SECONDS = 20;
/** La partie finie (initiales saisies), VPX se ferme après ce délai : le temps de voir son score. */
const LIVE_CLOSE_AFTER_MS = 4000;
/**
 * La table à l'écran, la bande d'une partie entre amis attend ce temps : VPX ouvre son fronton
 * (B2S), son DMD ou son PuP-Pack un peu après le plateau, et la bande posée sur un écran qu'il
 * prend ensuite changerait aussitôt de place (démonstration du 30/10/2026).
 */
const LIVE_BOARD_SETTLE_MS = 3000;
/** Heure où la table de la partie en cours est arrivée à l'écran (Date.now()). */
let playingSince = 0;
/** Partie entre amis sur une table sans relevé : Start n'y est pas bloqué, le joueur l'appuie au « Partez ! ». */
let liveManual = false;
/** Hors écran : la partie simulée joue une table sans relevé (CYBERPINBALL_PARTIE_SIMULEE_SANS_RELEVE, démonstration « sans-releve »). */
const SIMULATED_MANUAL = OFFSCREEN && !!process.env.CYBERPINBALL_PARTIE_SIMULEE_SANS_RELEVE;

/**
 * Partie d'une table. En mode réglage de l'affichage (`display`), VPX démarre son menu ouvert
 * sur le cadrage ; la partie ne compte pas dans les statistiques et, à la fin, l'écran qui
 * l'a demandée (la fiche) reprend la main.
 */
async function play(table: TableEntry, autoStopAfterMs?: number, mode?: 'display', hooks: { onPlaying?(): void; record?: RecordingSettings; double?: string; settings?: HostSetting[]; board?: GroupRecord[]; onProgress?(p: LiveProgress): void; gate?: LiveStartGate } = {}): Promise<PlayReport | undefined> {
  const install = vpxInstall(loc);
  if (!install) return undefined;
  // Une sauvegarde automatique cède la place (elle reprendra au prochain moment libre) ; une sauvegarde
  // à la main ou une restauration en cours : la partie écrirait ses scores pendant la copie.
  await backups.yieldToGame();
  const copying = backups.busy();
  if (copying) {
    state = { ...state, phase: 'message', help: false, message: { title: t('Partie impossible pour l’instant'), lines: [copying, t('Start ou Exit : revenir au menu.')] } };
    broadcast();
    return undefined;
  }
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
  // Partie entre amis : la règle du pare-feu de VPX relue pendant le chargement, pour l'inspector de VPX (vpx-inspector.ts).
  const inspectorReady = hooks.double && !displayMode && simulated === undefined ? inspectorFor(socialFirewall, (line) => console.log(line)) : Promise.resolve(undefined);
  guest.releaseAll();
  state = { ...state, phase: 'loading', help: false };
  startLaunch();
  launchCount++;
  const pressedAt = Date.now();
  // Lancement en cinéma, pour une vraie partie : la chorégraphie part au Start, dans les fenêtres
  // du menu ; elle ne retarde rien de ce qui suit (cinema.test.ts).
  if (mediaSettings.cinema && !displayMode) cinema.start(launchCount, { title: table.title, manufacturer: table.manufacturer, year: table.year, logo: medias?.wheel(table) });
  broadcast();
  // La pièce tombe au Start d'une vraie partie (pas au réglage de l'affichage), avant que VPX ne prenne les écrans.
  if (!displayMode) playUiSound('coin');
  // Records d'avant la partie (VPReg.stg de la table, highscores.ts), pour savoir au retour si l'un est tombé (knocker).
  // Pour une partie entre amis, relus dans le double une fois fait (réglages de l'hôte, records du groupe).
  let recordsBefore = readTableRecords(table);
  // La mémoire des ROM au départ : au retour, les scores de la partie s'y lisent (tableau des scores).
  const scoresBefore = mode === 'display' ? undefined : tableScores.snapshot(table);
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
  // Position du DMD réglée en partie pour cette table et cette configuration (in-game-menu.ts) : par-dessus l'habillage.
  const configuration = loadCabinet(loc.dataDir);
  if (configuration) {
    try {
      const placed = prepareDmdPlace(table, { cabinet: configuration, displays: observedDisplays(), dataDir: loc.dataDir, format: profile.displayIdFormat });
      if (placed) console.log(placed);
    } catch (error) {
      console.log(`Position du DMD (${table.id}) : préparation impossible (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  // Arrêté pendant la préparation (Exit, Ctrl+Maj+K) : VPX n'est pas lancé, rien n'a changé.
  if (launch?.stopped) {
    endLaunch();
    dressing = undefined;
    displayMode = false;
    cinema.stop();
    state = { ...state, phase: 'menu' };
    broadcast();
    return undefined;
  }

  // Partie entre amis : VPX joue un double de la table, fait après les préparations ci-dessus ; le
  // dossier habituel n'est jamais ouvert en écriture. Sans double possible, pas de partie : jamais
  // de repli sur le dossier habituel.
  // L'inspector de VPX lui est proposé si la règle du pare-feu qui ferme VPX au réseau est posée (lue pendant le chargement).
  const inspector = await inspectorReady;
  // Il sert aussi à lire le DMD quand « Scores sur le DMD » est activé (pour cette table).
  const readDmd = readLiveScoresSettings(loc.dataDir, table.id).dmd;
  const doubled = hooks.double && !displayMode ? tableDoubles.start(table, hooks.double, hooks.settings, hooks.board, inspector && { ...inspector, dmd: readDmd }) : undefined;
  if (doubled && !doubled.ok) {
    console.log(`Partie entre amis (${table.id}) : pas de double, partie non lancée (${doubled.reason}).`);
    dressing = undefined;
    cinema.stop();
    state = { ...state, phase: 'message', message: { title: t('Partie entre amis impossible sur cette table : {reason}', { reason: doubled.reason }), lines: [t('Votre table habituelle reste intacte : rien n’a été lancé.')] } };
    broadcast();
    return undefined;
  }
  const double = doubled?.ok ? doubled.double : undefined;
  const played = double?.table ?? table;
  if (double) recordsBefore = double.records();
  // Départ commun (livestart.ts) : une table sans relevé est prête dès qu'elle est à l'écran ; c'est au joueur d'appuyer sur Start au signal.
  // Hors écran, la partie simulée joue une table sans relevé si on le lui demande (démonstration « sans-releve »).
  liveManual = !!double && (simulated === undefined ? !double.live : SIMULATED_MANUAL);
  // Quand « partez » a été posé dans le double (la partie simulée part de là).
  let goneAt: number | undefined;
  // La table à l'écran : une borne ne se dit pas prête avant (journal du 31/10/2026, borne chargée :
  // « prête » 0,2 s avant que sa table paraisse, la carte de l'attente pas encore là).
  let onScreen = false;
  // Essais (arrêt automatique) : « Partez ! » couvre le début de la partie ; elle dure d'autant plus.
  const liveRunMs = (autoStopAfterMs ?? 10_000) + (hooks.gate ? LIVE_GO_SHOW_MS : 0);

  // Les fenêtres du menu restent derrière VPX, sans jamais lui prendre le focus : l'écran de
  // chargement jusqu'à ce que sa fenêtre de jeu s'affiche, puis le fond de partie de chaque
  // écran (viewFor). Celui que VPX n'occupe pas (topper, backglass sans .directb2s) reste couvert.
  playing = table;
  realign = simulated === undefined ? realignPlan(assignments) : undefined;
  hideTaskbars();
  settleScreens('game');
  // Jouer et enregistrer : armé avant le lancement ; le délai part quand la table est à l'écran.
  const recording = hooks.record && !displayMode ? armGameRecording(table, hooks.record, simulated !== undefined) : undefined;
  const startedAt = new Date();
  const onPlaying = () => {
    // Avant tout ce qui peut redessiner la bande d'une partie entre amis (hooks.onPlaying : le statut part aux autres).
    playingSince = Date.now();
    state = { ...state, phase: 'playing' };
    // La table à l'écran : le chargement est fini, son cartouche avec lui.
    endLaunch();
    // Journal des écrans : la pile des fenêtres, la fenêtre de jeu de VPX affichée (le gardien des barres n'y touche pas).
    settleScreens('vpx');
    // Les amis voient la table en cours, en temps réel (pas pendant un réglage de l'affichage).
    if (!displayMode) socialNet.setPresence({ status: 'playing', table: presenceTable(table), since: new Date().toISOString() });
    hooks.onPlaying?.();
    watchOccupied(simulated?.split(',').filter((r): r is RoleId => ROLES.some((x) => x.id === r)));
    if (simulated === undefined && !gameLoad) gameLoad = watchGameLoad(game.pid);
    // Partie sur les écrans (VPX n'a pas pris le casque) : le compagnon n'a plus de relève à attendre.
    if (!playedVr && headset?.running) void headset.stop();
    broadcast();
    setTimeout(showLiveBoard, LIVE_BOARD_SETTLE_MS);
    onScreen = true;
    if (liveManual) hooks.gate?.ready({ manual: true });
    if (vrGame) console.log(playedVr ? `Réalité virtuelle (${table.id}) : partie dans le casque.` : `Réalité virtuelle (${table.id}) : casque pas prêt, partie sur les écrans.`); // i18n-ignore : journal
    if (vision3dSource && configuration) headTracker.start(vision3dSource, configuration.id, vision3d);
    // Les deux MagnaSave ouvrent désormais les réglages en partie (position du DMD, puis menu de VPX ; en VR, celui de VPX dans le casque).
    if (configuration) inGameMenu.arm({ pid: game.pid, table, cabinet: configuration, displays: observedDisplays(), place: playfieldPlace(), configurationIni: vrGame?.ini ?? activeVpxIni(loc), dataDir: loc.dataDir, vr: playedVr, ...(vision3dSource && { vision3d: { state: () => headTracker.state, recenter: () => headTracker.recenter() } }) });
    // Partie entre amis : l'arrêt automatique (essais) se compte depuis « partez ».
    if (autoStopAfterMs && !hooks.gate) setTimeout(() => game.stop(), autoStopAfterMs);
  };
  // VPX prend la main (sa fenêtre de jeu au premier plan, dit le lanceur) : le coup de bobine, une fois.
  const onForeground = () => {
    if (cinema.handover()) playUiSound('coil');
    recording?.shown();
  };
  // Ce qui a pris le temps du Start au lancement : rien d'autre que l'écran de chargement et la préparation.
  console.log(`Lancement : VPX lancé ${Date.now() - pressedAt} ms après le Start (écran de chargement ${loadingMs} ms${captureMs ? `, captures des essais ${captureMs} ms` : ''}, préparation ${Date.now() - preparing} ms ; lancement en cinéma ${cinema.running ? 'joué' : 'coupé'}).`);
  // Les fenêtres de VPX paraissent avant celle du jeu : le cartouche du chargement le dit.
  const onWindows = () => launchStep('windows');
  // Réalité virtuelle (vr.ts) : activée et un runtime OpenXR présent, VPX reçoit un INI à part, la VR
  // en « Autodetect » (dans le casque s'il est prêt, sinon sur les écrans). Jamais pour régler l'affichage.
  const vrGame = simulated === undefined && !displayMode ? prepareVr(played.file, double?.ini) : undefined;
  // Vision 3D (vision3d.ts) : le capteur s'allume quand la table est à l'écran, s'éteint à la fin.
  const vision3dSource = simulated === undefined && !displayMode ? prepareVision3d(install.exe, Boolean(vrGame)) : undefined;
  // Bilan de la Vision 3D : ce que VPX écrira de son module dans vpinball.log, à partir d'ici.
  const vision3dLog = path.join(vpxPrefDir(install.version), 'vpinball.log');
  const vision3dLogFrom = vision3dSource && fs.existsSync(vision3dLog) ? fs.statSync(vision3dLog).size : 0;
  // Le menu dans le casque passe la main sans écran intermédiaire : le compagnon garde le casque
  // (chargement compris) jusqu'à ce que VPX le prenne, puis fond au noir et s'arrête (casque.ts).
  if (simulated === undefined && headset?.running) {
    headsetPaused = true;
    headset.handOver();
  }
  let playedVr = false;
  // Charge du PC pendant la partie (game-load.ts) : notée au journal à la fin.
  let gameLoad: GameLoadWatch | undefined;
  // Sans place enregistrée par VPX, la table est recentrée sur le regard du joueur une fois lancée.
  const vrText = vrGame ? readTextIfExists(vrGame.ini) : '';
  // Plus aucun recentrage automatique dès que la borne du casque a une place : seulement si rien n'en donne.
  const vrCenter = vrGame && !readCabinetPlace(headsetPlaceFile()) && !vrHasSavedPlace(vrText) ? vrCenterKey(vrText) : undefined;
  const vpxLog = path.join(vpxPrefDir(install.version), 'vpinball.log');
  const vpxLogOffset = vrCenter && fs.existsSync(vpxLog) ? fs.statSync(vpxLog).size : 0;
  let stopCentering: (() => void) | undefined;
  // La fenêtre de jeu est l'aperçu de la VR (launcher.ts) : la partie est dans le casque.
  const onVr = () => {
    playedVr = true;
    if (vrCenter) stopCentering = centerWhenStarted({ logFile: vpxLog, fromOffset: vpxLogOffset, pid: () => game.pid, key: vrCenter, log: (line) => console.log(line) });
  };
  // Hors écran, un chargement simulé qui tarde (CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS) montre le cartouche.
  const simulatedLoadMs = Number(process.env.CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS) || undefined;
  const game =
    simulated !== undefined
      ? simulateVpx({ onPlaying, onForeground, onWindows, ...(simulatedLoadMs ? { loadMs: simulatedLoadMs } : {}) })
      : launchVpx({ exe: install.exe, ini: vrGame?.ini ?? double?.ini ?? activeVpxIni(loc), table: played.file, display: displayMode, vpxPrefDir: vpxPrefDir(install.version), onVr, onPlaying, onForeground, onWindows });
  if (launch) {
    launch.stop = () => game.stop();
    launchStep('launched');
    // Arrêt demandé pendant la préparation, juste après le contrôle : VPX se ferme aussitôt lancé.
    if (launch.stopped) game.stop();
  }
  // Départ commun : la carte de l'attente se charge, cachée, pendant que VPX charge la table ; elle
  // paraît dès la première vue, même quand l'attente ne dure qu'un instant (borne lente à créer ses fenêtres).
  if (hooks.gate) gameNotices.prepareWait(liveGames.waitView({ manual: liveManual }));
  // Une partie simulée ne prend aucun raccourci global au poste.
  if (simulated === undefined) globalShortcut.register(accelerator(SHORTCUTS.forceStop), () => guest.knock('game.force-stop') && game.stop());
  // Partie entre amis : l'état de jeu que le relevé du double écrit (livestate.ts), deux fois par seconde ;
  // score et bille partent aux autres ; la partie finie (initiales saisies), VPX se ferme seul.
  let live: { score?: number; multi?: boolean } | undefined;
  let overAt: number | undefined;
  // Hors écran, la partie simulée n'exécute aucun script : son relevé est simulé, pour la bande et la fin de partie.
  const liveSource = double?.live ? () => double.liveState() : simulated !== undefined && double && !liveManual ? simulatedLiveState(Date.now(), liveRunMs, () => goneAt) : undefined;
  // Le DMD de la table, lu par l'inspector de VPX : les scores des amis ne s'y posent que sur son écran de score (dmdscore.ts).
  // Une table sans PinMAME (FlexDMD) : jamais son image par l'inspector, le rythme de la partie d'après le relevé.
  dmdWatch = !readDmd || !double ? undefined : simulated !== undefined ? simulatedDmdWatch() : double.dmdByScript && double.live ? scriptDmdWatch() : double.inspectorPort ? watchVpxDmd(double.inspectorPort, (line) => console.log(line)) : undefined;
  // Départ commun (livestart.ts) : la table prête (le relevé répond « pret »), elle le dit aux
  // autres ; au « partez », le fichier du double que le relevé surveille : alors seulement, crédit et Start.
  // Le relevé a dit « prêt » (ou la partie est partie), ou le garde-fou l'a fait à sa place.
  let readySeen = false;
  let readyForced = false;
  const watchLive = double
    ? setInterval(() => {
        const st = liveSource?.();
        dmdWatch?.game({ inGame: Boolean(st?.inGame), ...(st ? { score: st.score } : {}) });
        if (onScreen && (st?.ready || st?.started)) hooks.gate?.ready();
        // Garde-fou (livestart.ts) : la table à l'écran, le relevé ne dit toujours pas « prêt » ; le journal
        // dit pourquoi (sa dernière ligne), et la table se dit prête : personne n'attend sans fin.
        readySeen ||= Boolean(st?.ready || st?.started);
        if (onScreen && hooks.gate && !liveManual && !readySeen && !readyForced && liveReadyOverdue(playingSince, Date.now())) {
          readyForced = true;
          const line = double.liveLine()?.trim();
          const why = line === undefined ? 'aucune ligne écrite par le relevé' : st ? `« pret=0 » : ${line.slice(0, 160)}` : `ligne illisible : ${line.slice(0, 160)}`; // i18n-ignore : journal
          console.log(`Départ commun (${table.id}) : table à l'écran depuis ${LIVE_READY_SIGNAL_MS / 1000} s, le relevé ne dit pas « prêt » (${why}) : prête quand même.`); // i18n-ignore : journal
          hooks.gate.ready();
        }
        if (goneAt === undefined && (!hooks.gate || hooks.gate.go())) {
          goneAt = Date.now();
          double.go();
          if (autoStopAfterMs && hooks.gate) setTimeout(() => game.stop(), liveRunMs);
        }
        if (!st?.started) return;
        live = { score: st.score, multi: (live?.multi ?? false) || st.players > 1 };
        hooks.onProgress?.({ score: st.score, ball: st.ball, balls: st.balls, players: st.players });
        if (st.inGame) return void (overAt = undefined);
        overAt ??= Date.now();
        if (Date.now() - overAt >= LIVE_CLOSE_AFTER_MS) {
          console.log(`Partie entre amis (${table.id}) : partie terminée (${st.score} points), VPX se ferme.`); // i18n-ignore : journal
          clearInterval(watchLive);
          game.stop();
        }
      }, 500)
    : undefined;
  const result = await game.done;
  if (watchLive) clearInterval(watchLive);
  gameNotices.close();
  inGameMenu.disarm();
  const load = gameLoad?.stop(playedVr ? 'casque' : 'ecrans');
  if (load) console.log(load);
  if (vision3dSource) noteVision3dGame(vision3dLog, vision3dLogFrom);
  headTracker.stop();
  stopCentering?.();
  headsetPaused = false;
  // Arrêté pendant le chargement : ni partie comptée, ni message d'échec, la roue.
  const stoppedLoading = launch?.stopped === true;
  endLaunch();
  dmdWatch?.stop();
  dmdWatch = undefined;
  // Partie en VR dans le double : la place de la table que VPX y a enregistrée sert à la suivante, avant que le double parte.
  if (vrGame && double?.ini) {
    try {
      rememberVrSettings(loc.dataDir, vrGame.ini);
    } catch (error) {
      console.log(`Réalité virtuelle : réglages de la partie pas gardés (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }
  // Les records de la partie, lus où VPX les a écrits (le double, pour une partie entre amis) ; puis le double s'en va.
  const recordsAfter = double ? double.records() : readTableRecords(played);
  double?.finish();
  recording?.gameEnded();
  if (simulated === undefined) globalShortcut.unregister(accelerator(SHORTCUTS.forceStop));
  cinema.stop();
  stopWatchOccupied();
  socialNet.setPresence({ status: 'menu', since: new Date().toISOString() });
  playing = undefined;
  dressing = undefined;
  displayMode = false;

  // Les barres des tâches reviennent, chacune rangée sous la fenêtre du menu de son écran, puis le
  // playfield reprend le premier plan. L'Explorateur ne range derrière une fenêtre plein écran que
  // la barre de l'écran qui a le premier plan : celles du DMD et du fronton, jamais au premier
  // plan, restaient devant. Le gardien des barres repasse une fois le menu revenu (taskbarguard.ts).
  // Borne lancée au démarrage de Windows : elles restent masquées (restoresTaskbarsAt).
  restoreTaskbars('game-end');
  const focusReturned = await showMenuAgain();
  settleScreens('return');
  // Écran débranché puis rebranché par Windows pendant la partie : la fenêtre de son rôle, chassée
  // ou cachée sous un voile neuf, le reprend ; contrôlé de nouveau une fois les écrans posés.
  recoverScreens('return');
  setTimeout(() => playing || recoverScreens('return'), SCREENS_SETTLE_MS);
  // Son coupé pendant la partie (ou avant) : la pastille le rappelle au retour.
  cabinetVolume?.remindIfMuted();
  // Les fichiers de l'enregistrement : rendus quelques instants après la fermeture de VPX.
  const recorded = recording ? await recording.finished : undefined;
  // Fenêtres de l'éditeur de VPX masquées ou fermées pendant la partie : rien à faire
  // pour le joueur, mais le signe qu'un réglage ou une version de VPX a changé.
  for (const notice of result.notices) console.log(`VPX (${table.id}) : ${notice}`);

  if (stoppedLoading) {
    state = { ...state, phase: 'menu' };
    broadcast();
    return { result, focusReturned, entered: [] };
  }
  if (mode === 'display') return { result, focusReturned, entered: [] };
  // Un score entré au tableau d'honneur pendant la partie : le knocker sonne au retour au menu.
  const entered = result.ok ? newRecords(recordsBefore, recordsAfter) : [];
  for (const s of entered) console.log(`Record (${table.id}) : ${s.score}${s.initials ? ` (${s.initials})` : ''}, place ${s.rank}.`);
  if (result.ok) {
    // Les parties du test automatique ne comptent pas dans les statistiques.
    if (!autoStopAfterMs) recordPlay(table, startedAt, result.seconds);
    // Les scores de la partie, datés, au tableau des scores de la table ; sans retarder le retour au menu.
    if (!autoStopAfterMs && scoresBefore) {
      tableScores
        .finish(table, scoresBefore, double ? { live: { ...(live?.score ? { score: live.score } : {}) } } : { recordsBefore, recordsAfter })
        .then(async (kept) => {
          if (kept.length) broadcast();
          await publishScores(table, kept, Boolean(double && live?.multi));
        })
        .catch((error: Error) => console.log(`Tableau des scores (${table.id}) : partie non gardée (${error.message}).`)); // i18n-ignore : journal
    }
    tables = tables.map((t) => (t.id === table.id ? { ...t, info: readInfo(t.infoFile) } : t));
    // Pour les amis : les records entrés au tableau, la partie, puis les badges qu'ils valent.
    // Une erreur ici (écriture refusée de social.json, essai réel du 01/11/2026) ne perd jamais la
    // partie : son résultat, celui d'une partie entre amis compris, est rendu quand même.
    if (!autoStopAfterMs) {
      try {
        const seen = presenceTable(table);
        // Pas pour une partie entre amis : son tableau est celui du groupe, posé dans le double, pas celui de la table.
        if (!double) for (const s of [...entered].sort((a, b) => a.rank - b.rank)) socialNet.publish({ kind: 'record', table: seen, score: s.score, rank: s.rank, ...(s.initials ? { initials: s.initials } : {}) });
        if (result.seconds >= 60) socialNet.publish({ kind: 'played', table: seen, seconds: Math.round(result.seconds) });
        socialNet.checkBadges(playStats(tables));
      } catch (error) {
        console.log(`Partie (${table.id}) : nouvelles pour les amis et badges pas mis à jour (${(error as Error).message}) ; la partie compte quand même.`); // i18n-ignore : journal
      }
    }
    const unseen = simulated === undefined ? joystickMessage(install.version) : undefined;
    state = unseen ? { ...state, phase: 'message', message: unseen } : { ...state, phase: 'menu' };
    // Partie enregistrée : son écran (aperçu, utiliser pour la roue, garder, jeter) avant la roue.
    if (recorded && !unseen) showRecording({ ...recorded, table: tables.find((t) => t.id === table.id) ?? recorded.table });
  } else {
    const repaired = result.failure === 'dialog' && result.message ? repairScriptStop(table, result.message) : undefined;
    state = { ...state, phase: 'message', message: explain(result, table, repaired, Boolean(double)) };
  }
  // Configuration de la borne changée juste avant la partie : VPX avait déjà les bons
  // écrans, le menu les reprend en redémarrant.
  if (selection?.previous && result.ok) relaunchMenu();
  broadcast();
  // Le knocker : un score entré au tableau ; entre amis, seulement le record du groupe battu (la première place).
  if (double ? entered.some((s) => s.rank === 1 && (hooks.board?.length ?? 0) > 0) : entered.length) playUiSound('knocker');
  // Une invitation reçue pendant la partie, encore valable : elle s'ouvre au retour au menu.
  const invite = state.phase === 'menu' && !liveGames.current() ? liveGames.invites()[0] : undefined;
  if (invite) friendsMenu.live.openInvite(invite.id, () => library.leave());
  // La partie entre amis s'est finie pendant celle d'une autre table (on avait fini avant les
  // autres) : ses résultats, pas encore vus, s'ouvrent au retour ; la notification l'a annoncé.
  else if (!hooks.double && state.phase === 'menu' && friendsMenu.live.unseenResults()) friendsMenu.live.open(() => library.leave());
  return { result, focusReturned, entered, ...(live ? { live } : {}) };
}

/**
 * Classements national et mondial (rankings.ts) : les scores d'une partie seul à la table, sur sa
 * version exacte (empreintes du .vpx et du script) et son nombre de billes. Jamais en mode invité,
 * ni une partie à plusieurs (on ne sait pas qui joue après le joueur 1).
 */
async function publishScores(table: TableEntry, kept: readonly PlayedScore[], multi: boolean): Promise<void> {
  const solo = kept.filter((p) => !p.of);
  if (guest.active || multi || !solo.length) return;
  const board = boardKey(await liveGames.versionOf(table));
  if (!board) return;
  const balls = (await ballCounts.of(table))?.balls;
  for (const p of solo) {
    const sent = socialNet.publishScore({ board, ...(balls ? { balls } : {}), table: presenceTable(table), score: p.score, at: p.at, how: p.how });
    if (sent) console.log(`Classements (${table.id}) : ${p.score} publié (${balls ? `${balls} billes` : 'billes inconnues'}).`); // i18n-ignore : journal
  }
}

/** La bande de la partie entre amis est (ou va être) sur les écrans : la partie lancée, celle d'une autre table comprise. */
function liveBoardUp(): boolean {
  const phase = liveGames.current()?.phase;
  return phase === 'playing' || phase === 'countdown';
}

/**
 * Pendant la partie entre amis, la table à l'écran : la bande de la partie, chaque joueur, son
 * score et sa bille, là où elle ne cache pas la bille (game-notice.ts, liveBoardPlacement).
 */
function showLiveBoard(): void {
  const current = liveGames.current();
  const settled = Date.now() - playingSince >= LIVE_BOARD_SETTLE_MS;
  // L'attente du départ commun d'abord, sur le plateau ; la bande vient après « Partez ! » (livestart.ts).
  const wait = playing && state.phase === 'playing' && current ? liveGames.waitView({ manual: liveManual }) : undefined;
  gameNotices.wait(wait);
  gameNotices.board(!wait && playing && state.phase === 'playing' && settled && current ? liveBoardView(current, socialNet.state().key.publicKey) : undefined);
}

/**
 * Ce que la partie laisse à la bande, en pixels physiques : la place du DMD de VPX (celle de
 * l'habillage FullDMD, sinon la zone du DMD), les écrans que VPX n'occupe pas (fronton sans
 * .directb2s, topper : occupiedRoles, relu toutes les 2 s), et le plateau en dernier recours.
 */
function liveBoardScreens(): LiveBoardScreens {
  const rect = (role: RoleId) => roleRects.find((r) => r.role === role)?.rect;
  const screen = menuAssignments.dmd?.bounds;
  const framed = dressing?.plan.dressed && screen ? dressing.plan.window : undefined;
  const dmd = framed && screen ? { x: screen.x + framed.x, y: screen.y + framed.y, width: framed.width, height: framed.height } : rect('dmd');
  // Un écran que VPX a pris pendant cette partie reste à lui : à la fermeture de VPX, la bande sautait
  // un instant sur le fronton qu'il venait de rendre (journal du 31/10/2026).
  const free = (['backglass', 'topper'] as const).flatMap((role) => {
    const zone = rect(role);
    return zone && !occupiedThisGame.has(role) ? [{ role, zone }] : [];
  });
  const backglass = rect('backglass');
  const topper = rect('topper');
  return { playfield: playfieldPlace(), ...(dmd ? { dmd } : {}), dmdReadable: dmdWatch?.readable() ?? false, free, zones: { ...(backglass ? { backglass } : {}), ...(topper ? { topper } : {}) } };
}

/** La fenêtre de VPX, PuP, B2S… qui passe devant une fenêtre de la bande, décrite pour le journal. */
function describeCover(win: BrowserWindow): string | undefined {
  try {
    const by = overlayCoveredBy(listWindows((w) => w.visible), win.getNativeWindowHandle().readBigUInt64LE(0), process.pid);
    return by ? `« ${by.title || '(sans titre)'} » (${by.className}, processus ${by.pid}${by.topmost ? ', au premier plan permanent' : ''})` : undefined; // i18n-ignore : journal
  } catch {
    return undefined;
  }
}

/** Zone du plateau à l'écran, en pixels physiques, et le sens de sa mise en page : où se pose une notification pendant la partie. */
function playfieldPlace(): { zone: Rect; rotation: Rotation } | undefined {
  const display = menuAssignments.playfield;
  if (!display) return undefined;
  const cabinet = loadCabinet(loc.dataDir);
  const zone = cabinet ? cabinetZones(cabinet)?.playfield : undefined;
  const r = zone ? zoneRect(zone, display.bounds) : { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height };
  return { zone: { x: display.bounds.x + r.x, y: display.bounds.y + r.y, width: r.width, height: r.height }, rotation: playing && cabinet ? playedRotation(cabinet) : rotation };
}

/**
 * Pendant la partie, le sens où VPX dessine vraiment la table (flippers du bord `played`,
 * gameorientation.ts), celui de l'enregistrement : il peut différer du menu quand VPX tourne la
 * table autrement. Relu une fois par partie ; un bord forcé (essais) est celui du menu.
 */
let played: { table: TableEntry; rotation: Rotation } | undefined;
function playedRotation(cabinet: Cabinet): Rotation {
  if (played && played.table === playing) return played.rotation;
  const edge = forcedRotation() === undefined ? orientationFacts(cabinet, observedDisplays())?.played : undefined;
  const value = edge ? edgeRotation(edge) : rotation;
  if (playing) played = { table: playing, rotation: value };
  return value;
}

/**
 * Enregistrement d'une partie (« Jouer et enregistrer ») : les écrans filmés, chacun dans la zone
 * où VPX le dessine ; le plateau, avec le bord où VPX met les flippers (le sens de la partie).
 */
function armGameRecording(table: TableEntry, settings: RecordingSettings, simulated: boolean): RecordingRun | undefined {
  const cabinet = loadCabinet(loc.dataDir);
  const zones = cabinet ? cabinetZones(cabinet) : undefined;
  // Le sens où VPX dessinera la table ; un bord forcé (CYBERPINBALL_FLIPPERS, essais) est celui du menu.
  const edge = (forcedRotation() === undefined && cabinet && orientationFacts(cabinet, observedDisplays())?.played) || edgeOfRotation(rotation);
  const screens: RecordingScreen[] = [];
  for (const role of settings.roles) {
    const display = menuAssignments[role];
    if (!display) continue;
    const zone = zones?.[role];
    const r = zone ? zoneRect(zone, display.bounds) : { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height };
    screens.push({
      role,
      type: recordedMediaType(role, cabinet),
      display: display.bounds,
      zone: { x: display.bounds.x + r.x, y: display.bounds.y + r.y, width: r.width, height: r.height },
      ...(role === 'playfield' && { edge }),
    });
  }
  if (!screens.some((s) => s.role === 'playfield')) {
    console.log(`Enregistrement (${table.id}) : pas d'écran du plateau retrouvé, rien n'est filmé.`);
    return undefined;
  }
  const run = armRecording({ table, settings, screens, rotation, synthetic: simulated, dataDir: loc.dataDir, captureDir: process.env.CYBERPINBALL_CAPTURE });
  run.events.on('recording-start', () => console.log(`Enregistrement (${table.id}) : événement de début.`));
  run.events.on('recording-end', (e: { reason: string }) => console.log(`Enregistrement (${table.id}) : événement de fin (${e.reason}).`));
  return run;
}

/** Écran du retour d'une partie enregistrée, dans la gestion des tables. */
function showRecording(outcome: RecordingOutcome): void {
  library.recordingResult(outcome);
}

/** Table en cours de partie : chaque fenêtre affiche son fond de partie. */
let playing: TableEntry | undefined;
/** Habillage FullDMD de la partie en cours (fulldmd.ts) : l'écran du DMD le garde autour du DMD de VPX. */
let dressing: TableDressing | undefined;
/** Fenêtres annexes de VPX vues réduites pendant cette partie (signalées une fois chacune, minimizedVpxWindows). */
let minimizedSeen = new Set<string>();
/** Le DMD de VPX a déjà été vu sur l'habillage pendant cette partie (signalé une fois). */
let dressCoveredSeen = false;
/** Convertisseur hors écran : images des vidéos FullDMD, pour y chercher le cadre du DMD. */
let converter: ReturnType<typeof createConverter> | undefined;
/** Couleur de chaque table au menu (table-tint.ts), créée avec les médias du menu. */
let tints: TableTints | undefined;
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
    for (const role of next) occupiedThisGame.add(role);
    console.log(`Partie : écrans occupés par VPX : ${[...occupied].join(', ') || 'aucun'}.`);
    broadcast();
    // Un écran que VPX prend ou rend : la bande de la partie entre amis change de place.
    showLiveBoard();
  };
  occupiedThisGame = new Set();
  minimizedSeen = new Set();
  if (simulated) return update(simulated);
  dressCoveredSeen = false;
  const check = () => {
    try {
      let stack = listWindows((w) => w.visible);
      if (realignVpxWindows(stack)) stack = listWindows((w) => w.visible);
      minimizedVpxWindows(stack);
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

/**
 * Fenêtre annexe de VPX (fronton, DMD, topper) réduite pendant la partie : son écran ne montre
 * que le fond de Cyber Pinball, et elle n'est jamais ramenée (vpxWindowMoves laisse les fenêtres
 * réduites). Cause connue : deux fenêtres plein écran de VPX sur un même écran, SDL réduisant la
 * première (vpxSettingsFor, `confused`). Signalé une fois par fenêtre et par partie.
 */
function minimizedVpxWindows(stack: ReturnType<typeof listWindows>): void {
  for (const w of stack) {
    if (w.pid === process.pid || !w.minimized || !Object.hasOwn(VPX_ANCILLARY_WINDOWS, w.title) || minimizedSeen.has(w.title)) continue;
    minimizedSeen.add(w.title);
    const role = VPX_ANCILLARY_WINDOWS[w.title as keyof typeof VPX_ANCILLARY_WINDOWS];
    console.log(`[avertissement] Partie : « ${w.title} » est réduite par Windows : l'écran du rôle ${role} ne montre pas ce que VPX y dessine (fronton, DMD ou PuP-Pack). Deux fenêtres plein écran de VPX sur un même écran ?`);
  }
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

/** Le .vbs que VPX joue à côté de la table, s'il y en a un (même nom que le .vpx). */
function tableScriptFile(table: TableEntry): string | undefined {
  const base = path.basename(table.file, path.extname(table.file)).toLowerCase();
  try {
    const name = fs.readdirSync(path.dirname(table.file)).find((f) => f.toLowerCase() === `${base}.vbs`);
    return name ? path.join(path.dirname(table.file), name) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Le script de la table, pour citer la ligne en faute : son .vbs, sinon celui du .vpx. Les ajouts de
 * Cyber Pinball (relevé, reconnaissance PupCapture, interrupteurs) ne déplacent aucune ligne : le
 * numéro donné par VPX pour le double est celui de la table.
 */
function tableScriptText(table: TableEntry): string | undefined {
  const vbs = tableScriptFile(table);
  try {
    return vbs ? fs.readFileSync(vbs, 'latin1') : readTableScript(table.file);
  } catch {
    return undefined;
  }
}

/**
 * Partie échouée : ce qu'en dit VPX, puis Start mène à « Ce qu'il manque pour jouer », qui
 * relit la table, dit ce qui manque et où le trouver. Seule la ROM empêche une table de
 * démarrer (playable.ts) ; un script arrêté par un DMD sans son dossier est signalé comme
 * tel, le dossier restant proposé (« Pour aller plus loin »), pas exigé. `repaired` : le script
 * vient d'être corrigé pour le core.vbs actuel (repairScriptStop), la partie suivante démarre.
 */
function explain(result: LaunchResult, table: TableEntry, repaired?: string, live = false): Message {
  // Arrêt reconnu dans le journal de VPX (vpxfailure.ts) : la vraie raison, et Start relance la
  // table, ou ouvre la partie entre amis ; jamais « ce qu'il manque pour jouer », rien ne manque.
  const known = repaired ? undefined : diagnoseVpxFailure(result.logTail, result.exitCode, path.basename(tableScriptFile(table) ?? table.file), tableScriptText(table));
  if (known) {
    console.log(known.journal);
    const lines = [...known.lines];
    if (live) lines.push(t('Partie entre amis : les autres continuent ; votre score compte jusqu’à l’arrêt.'));
    lines.push(...result.notices);
    if (result.logTail.length) lines.push(t('Fin du journal de VPX :'), ...result.logTail.slice(-5));
    return { title: known.title, lines, action: live ? 'live' : 'replay', table: table.file };
  }
  const lines = [result.message ?? t('Erreur inconnue.')];
  if (repaired) lines.push(t('Cyber Pinball a corrigé le script de la table ({fix}) : relancez-la.', { fix: repaired }));
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
    library.downloads.manager,
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
  // La borne était déjà ouverte : pas d'ouverture à la relance.
  // app.exit ferme l'ancien processus sans before-quit : ce qu'il garde est enregistré ici.
  saveSettings();
  relaunchCovered([...process.argv.slice(1).filter((a) => a !== INTRO_SKIP_FLAG), INTRO_SKIP_FLAG]);
}

/** Les règles du pare-feu au démarrage (firewall-guard.ts) ; après une mise à jour, l'écran qui demande de les reposer. */
async function checkFirewallAtStart(): Promise<void> {
  const update = updates.justInstalled();
  const report = await guardFirewall(socialFirewall, { ...(update ? { update } : {}), log: (line) => console.log(line) });
  if (socialFirewall.simulated || !report.problems.length) return;
  if (update && state.phase === 'menu' && !guest.active && !closing) friendsMenu.openFirewall(() => library.leave());
  else showBanner(t('Pare-feu de Windows : {reason}. Menu système > Amis > Partage et réseau.', { reason: report.problems[0]!.reason }), 'sharing');
}

/**
 * Constat bref en haut du menu, qui s'efface seul : il ne demande aucun bouton. `note` : il entre
 * aussi à Activité récente, Start y ouvrant l'entrée du menu système qu'il nomme (un constat du
 * démarrage) ; la réponse immédiate à un geste (orientation rendue, veille simulée) n'y entre pas.
 */
function showBanner(text: string, note?: SystemItemId): void {
  if (note) activityMenu.note({ kind: 'note', facts: { key: text, text, item: note } });
  // Pendant l'ouverture, il attend la roue : rien ne se pose sur les animations.
  if (state.phase === 'intro') return void pendingBanners.push(text);
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

function viewFor(role: RoleId, m: MenuMedias | undefined = medias) {
  // En mode attente, chaque écran montre la table tirée au hasard ; la sélection ne bouge pas.
  const shown = attractTable();
  // La roue, la liste et le compteur : les tables de la collection active (sa place ramène la sélection dedans).
  const shelf = collections.shelf(state.phase === 'menu');
  const list = shelf.tables;
  const at = shelf.index;
  const table = shown ?? tables[state.index];
  // Le logo n'est cherché que pour la liste, dessinée par le playfield.
  const wheel = (t: TableEntry) => (role === 'playfield' ? m?.wheel(t) : undefined);
  const describe = (t: TableEntry) => ({
    title: t.title,
    manufacturer: t.manufacturer,
    year: t.year,
    subtitle: [t.manufacturer, t.year].filter(Boolean).join(' · '),
    version: t.version,
    plays: t.info.User?.StartCount ?? 0,
    lastRun: t.info.User?.LastRun,
    favorite: isFavorite(t.info),
    wheel: wheel(t),
  });
  // Voisines de la table choisie, pour la liste et la roue : identité stable (le fichier),
  // titre, fabricant et année (logo de repli de la roue), version et logo.
  const neighbor = (t: TableEntry, offset: number) => ({ offset, key: t.file, title: t.title, manufacturer: t.manufacturer, year: t.year, version: t.version, wheel: wheel(t) });
  // Neuf places : sept visibles (roue Médaillons), et une de chaque côté d'où les logos entrent ;
  // moins de neuf entrées : chacune une seule fois (aucune répétée pour remplir), réparties de part
  // et d'autre du choix, en boucle comme la liste. Le médaillon Juke-box en tête de la collection
  // (jukebox-screens.ts), compté dans le compteur ; pas en mode attente, qui montre une table.
  const ring = jukeboxWheel({ tables: list.length, at, shown: jukeboxShown() && !shown, selected: onJukebox() });
  const neighbors = ring.places.map((p) => ('jukebox' in p ? { offset: p.offset, key: JUKEBOX_WHEEL_KEY, title: t('Juke-box'), jukebox: true } : neighbor(list[p.table]!, p.offset)));
  // Média de chaque rôle de cette fenêtre (le sien et ceux de ses zones), et ceux des voisines à précharger.
  const roles = windowRoles.get(role) ?? [role];
  const mediasOf = (t: TableEntry) => (m ? Object.fromEntries(roles.map((r) => [r, m!.roleMedia(t, r)])) : {});
  // Écran qui ne parle d'aucune table (menu système, réglages, aide, messages) : l'affichage par défaut de Cyber Pinball.
  const subject = screensSubject();
  const defaults = Object.fromEntries(roles.map((r) => [r, m ? m.defaultMedia(r) : defaultMediaView(r)]));
  const preload =
    !shown && table && subject === table && m && list.length > 1
      ? [...new Set(PRELOAD_OFFSETS.map((o) => list[(at + o + list.length * 10) % list.length]!))]
          .filter((t) => t !== table)
          .flatMap((t) => roles.map((r) => m!.roleMedia(t, r)))
          .filter((v) => v.url)
      : [];
  return {
    role,
    phase: state.phase,
    help: state.help,
    count: ring.count,
    position: ring.position,
    table: !shown && onJukebox() ? jukeboxCard() : table ? describe(table) : undefined,
    neighbors,
    // Repère de la collection active, partout où le menu des tables est dessiné (sous une fiche aussi :
    // sa zone ne bouge jamais), et la liste des collections quelques secondes après un MagnaSave, au menu seulement.
    ...(role === 'playfield' && tables.length ? collections.view(mediaSettings.menuLayout === 'list' ? 'list' : playfieldLandscape() ? 'desk' : 'band', state.phase === 'menu') : {}),
    menuLayout: mediaSettings.menuLayout,
    // Couleur des points des afficheurs dessinés par Cyber Pinball (DMD du menu, replis dmd et fullDmd).
    dmdColor: menuDmdColor(),
    // Couleur de la table montrée (table-tint.ts) : l'ambiance du menu ; absente, la sarcelle de la marque.
    tint: mediaSettings.tableColor ? tints?.current()?.color : undefined,
    // DMD du menu vivant : où poser les points dans la zone du DMD de cette fenêtre (absent : DMD classique).
    liveDmd: liveDmdView(role),
    medias: subject ? mediasOf(subject) : defaults,
    preload,
    // Ouverture au démarrage : l'écran de chaque rôle de cette fenêtre, et l'invite du plateau.
    intro: state.phase === 'intro' ? introFor(role) : undefined,
    // Lancement en cinéma : la part de cette fenêtre (le plateau d'où part le logo, le fronton où il se pose).
    cinema: state.phase === 'loading' ? cinemaFor(role) : undefined,
    // Chargement : la vidéo Loading du jeu (ou son repli), plein écran en borne, dans le cadre du plateau au bureau.
    loading: state.phase === 'loading' && role === 'playfield' && m && table ? m.typeMedia(playing ?? table, 'playfield', 'Loading') : undefined,
    // Chargement qui tarde (loadingprogress.ts) : l'étape vue, l'heure du Start (le rendu compte les secondes), comment arrêter.
    slow:
      state.phase === 'loading' && role === 'playfield' && launch?.slow
        ? launch.stopped
          ? { step: t('Arrêt demandé : VPX se ferme'), since: launch.since }
          : { step: loadingStepLabel(launch.step), since: launch.since, stop: t('{keys} ou Exit : arrêter', { keys: shortcutLabel(SHORTCUTS.forceStop) }) }
        : undefined,
    // Fronton du jeu choisi (image Backglass), en fond du menu au bureau, à côté du plateau.
    backglass: role === 'playfield' && m && table && !shown && !onJukebox() ? m.typeMedia(table, 'backglass', 'Backglass') : undefined,
    // Mode invité : un message dont l'action est fermée n'en propose pas (son pied dit « Revenir au menu »).
    message: state.message?.action && !guest.allows(MESSAGE_DOORS[state.message.action]) ? { ...state.message, action: undefined } : state.message,
    banner: state.banner,
    // Mode invité : cadenas, indice « Verrouillé », anneau du déverrouillage (dessinés par le playfield).
    guest: guest.view(),
    /** Pastille rouge sur la roue dentée : une entrée du menu système attend l'utilisateur. */
    attention: library.attention(),
    /** Pastille des téléchargements, à gauche de la roue dentée (menu des tables). */
    downloads: role === 'playfield' && state.phase === 'menu' ? library.downloads.pill() : undefined,
    // Amis en ligne et notification du moment, à gauche de la pastille des téléchargements
    // (jamais en mode invité ; la file décide seule du reste : menu-notices.ts).
    ...(role === 'playfield' ? menuCorner() : {}),
    library: state.phase === 'library' ? library.view() : undefined,
    // Mode attente : la table montrée, son logo, et l'invite du playfield.
    attract: shown ? { ...describe(shown), wheel: m?.wheel(shown) } : undefined,
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
    // Juke-box : l'affiche du médaillon choisi, ou le lecteur (liste, clip, cartel).
    jukebox: jukeboxPlayer.view(role, state.phase === 'menu' && !state.help && onJukebox()),
    gameKeys: gameKeys(buttons, tilt),
    // Aide-mémoire du chargement : au bureau toujours ; en borne, celui du réglage de l'affichage seulement (display).
    loadingKeys: displayMode ? { title: t('Réglage de l’affichage'), rows: displayKeys(buttons), display: true } : { title: t('Commandes de la partie'), rows: gameKeys(buttons, tilt), display: false },
    menuKeys: menuKeys(),
    footer: menuFooter(),
    nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0], help: KEYS.help[0] },
  };
}

/**
 * L'écran du moment, pour la zone des notifications (noticezone.ts) : nommé ici, une seule fois,
 * pour la file, le coin dessiné par la fenêtre du plateau et la ligne posée par-dessus VPX ou le
 * navigateur intégré. Le mode invité n'y change rien : une notification informe, et ce qu'elle
 * ouvre passe par le cadenas (guest.knock).
 */
function zoneScreen(): ZoneScreen {
  if (desktop.active) return 'desktop';
  if (state.phase === 'playing' || state.phase === 'loading') return state.phase;
  if (state.phase === 'intro') return 'intro';
  if (state.phase === 'message' && state.message?.action === 'power') return 'power';
  if (state.phase === 'jukebox') return 'jukebox';
  if (library.browserOpen() && browserOnPlayfield()) return 'browser';
  if (attract.active) return 'attract';
  if (state.phase === 'library') return 'library';
  if (state.phase === 'confirmQuit') return 'confirmQuit';
  if (state.phase === 'message') return 'message';
  if (state.help) return 'help';
  return 'menu';
}

/** La zone des notifications de l'écran du moment. */
function currentZone(): NoticeZone {
  return noticeZone(zoneScreen(), { quietInGame, banner: !!state.banner, stopNotice: !!stopNotice, closing });
}

/** Le navigateur intégré couvre l'écran du plateau (sinon le menu système reste visible dessous). */
function browserOnPlayfield(): boolean {
  const at = browserScreenRect()?.bounds;
  const pf = menuAssignments.playfield?.bounds;
  if (!at || !pf) return true;
  return at.x < pf.x + pf.width && pf.x < at.x + at.width && at.y < pf.y + pf.height && pf.y < at.y + at.height;
}

/**
 * La zone des notifications (fenêtre du plateau) : amis en ligne et notification, dans le coin du
 * menu des tables ou sur la ligne de la roue dentée d'un écran plein (`zone`) ; par-dessus VPX
 * ou le navigateur intégré, une ligne posée sur eux (game-notice.ts).
 */
function menuCorner(): { zone?: 'corner' | 'head'; friendsOnline?: { count: number; title: string; searching?: boolean }; notice?: NoticeView } {
  const zone = currentZone();
  // La file avance à chaque rendu : une notification ouverte part quand l'écran ne s'y prête plus.
  const corner = menuNotices.view();
  const over = zone.place === 'over' && corner.notice ? corner.notice : undefined;
  // Le navigateur : en bas de sa page, jamais sur sa barre (adresse, téléchargements) ; VPX : le coin haut du joueur.
  const browser = zoneScreen() === 'browser' ? browserScreenRect()?.bounds : undefined;
  gameNotices.line(over, browser ? { zone: browser, rotation: 0, corner: 'bottom-left' } : undefined);
  if (zone.place !== 'corner' && zone.place !== 'head') return {};
  return { zone: zone.place, ...corner };
}

/** Part d'une fenêtre dans le lancement en cinéma : le logo part du plateau, se pose sur le fronton (sa fenêtre ou sa zone). */
function cinemaFor(role: RoleId): CinemaView | undefined {
  const roles = windowRoles.get(role) ?? [role];
  return cinema.view({ depart: role === 'playfield', arrivee: roles.includes('backglass') });
}

/** Table voisine dans le menu des tables (boutons, roue cliquée) : le solénoïde claque à chaque table. */
function moveSelection(offset: number): void {
  // Un flipper ferme la liste des collections, et change de table quand même.
  collections.hidePanel();
  if (jukeboxShown()) {
    // Le médaillon Juke-box en tête de la collection : il se choisit comme une table.
    const shelf = collections.shelf();
    const target = jukeboxWheelMove({ tables: shelf.tables.length, at: shelf.index, shown: true, selected: onJukebox() }, offset);
    if (!target) return;
    if ('jukebox' in target) {
      if (state.jukebox) return;
      state = { ...state, jukebox: true };
      return playUiSound('solenoid');
    }
    const picked = collections.move(target.table - shelf.index);
    const index = picked ? tables.indexOf(picked) : -1;
    if (index < 0 || (index === state.index && !state.jukebox)) return;
    state = { ...state, index, jukebox: false };
    return playUiSound('solenoid');
  }
  const next = collections.move(offset);
  const index = next ? tables.indexOf(next) : -1;
  if (index < 0 || index === state.index) return;
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
  // Ouverture : la musique de fond choisie, sinon le son de la vidéo d'ouverture du plateau.
  if (state.phase === 'intro') {
    const music = introSource(mediaSettings.intro, introFilesNow(), 'music');
    return { ...introSound(mediaSettings, music.source === 'file' ? mediaUrl(music.file) : undefined), launchId: undefined, output: audioOutput };
  }
  const now = moment();
  const plan =
    table && medias
      ? menuSound(now, now === 'attract' && hours.night() ? { ...mediaSettings, attractSound: 'muted' } : mediaSettings, { music: medias.sound(table, 'Audio'), launch: now === 'loading' ? medias.sound(table, 'AudioLaunch') : undefined }, tableMediaVolume(table))
      : { video: 0 };
  return { ...plan, launchId: plan.launch ? launchCount : undefined, output: audioOutput };
}

// ---------------------------------------------------------------------------
// DMD du menu vivant (live-dmd.ts, packages/core/src/livedmd.ts, dmdscenes.ts) : pendant la
// navigation, l'écran du DMD montre l'afficheur à points dessiné par Cyber Pinball (le détail de
// la wheel à l'arrivée, titre, PRESS START, records, un intermède de jeu un cycle sur deux,
// horloge, crédits) ; « classique » dans Médias, son et attente revient au média seul. Rien
// pendant la partie : VPX a l'afficheur.

const liveDmd = new LiveDmd({
  send: (shot) => {
    const win = dmdWindow();
    if (win && !win.isDestroyed()) win.webContents.send('dmd', shot);
  },
});
/** Wheels des tables en points, lues en arrière-plan (dmd-wheel.ts) ; l'état est renvoyé quand une arrive. */
const dmdWheels = new DmdWheels({ converter: () => (converter ??= createConverter()), onReady: () => broadcast() });
/** Table montrée sur le DMD vivant, et sa place dans la roue : le glissement suit le sens de la roue. */
let dmdShown: { file: string; index: number } | undefined;
/** Animation jouée sur le DMD pendant le lancement d'une table : « lancement » (cinéma) ou « chargement ». */
let loadingDmd: LiveDmdAnimationHandle | undefined;
/** Records lus de chaque table, relus quand son VPReg.stg change (après une partie). */
const recordsCache = new Map<string, { stamp: string; records?: TableRecords }>();
/** Cadre de chaque média FullDMD par adresse (elle change avec le fichier), une fois lu ou cherché. */
const dmdFrames = new Map<string, FrameRecord | undefined>();
/** Écran du DMD de la borne : FullDMD ou DMD seul (dmdKindOf), lu au démarrage du menu. */
let menuDmdKind: DmdKind | undefined;
/** Configuration de la borne branchée (DMD sur la roue : réglages par configuration puis par table). */
let menuConfiguration: string | undefined;

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
  return (mediaSettings.dmd === 'live' || jukeboxDmd()) && Boolean(dmdWindow()) && state.phase !== 'playing' && state.phase !== 'intro' && !desktop.active;
}

/** Le DMD est au Juke-box : son médaillon choisi dans la roue, ou le lecteur ouvert (points même en DMD classique). */
function jukeboxDmd(): boolean {
  return state.phase === 'jukebox' || (state.phase === 'menu' && !state.help && onJukebox());
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
 * Place automatique des points pour une table (liveDmdArea) : dans le cadre du média FullDMD
 * (framed : le média se voit autour), sinon la bande 4:1 centrée. undefined : pas d'écran du DMD.
 */
function autoDmdPlace(table: TableEntry | undefined): { zone: ReturnType<typeof liveDmdArea>; size: { width: number; height: number }; framed: boolean; media: boolean } | undefined {
  const rect = roleRects.find((r) => r.role === 'dmd')?.rect;
  if (!rect && !dmdWindow()) return undefined;
  const size = rect ? { width: rect.width, height: rect.height } : { width: 16, height: 9 };
  const view = table && medias ? medias.roleMedia(table, 'dmd') : undefined;
  const fullDmd = menuDmdKind === 'fulldmd' && (view?.found ?? view?.type) === 'FullDMD';
  const record = fullDmd && view?.url ? knownDmdFrame(view.url) : undefined;
  const framed = Boolean(record?.frame);
  return { zone: liveDmdArea(framed ? record : undefined, size), size, framed, media: fullDmd && Boolean(view?.url) };
}

/**
 * Place des points dans la zone du DMD de cette fenêtre : le réglage de la table pour la roue
 * (menu-dmd.ts : place réglée, ou masqué), sinon la place automatique. framed : le média de la
 * zone se voit autour des points (cadre trouvé, ou place réglée sur un média FullDMD). hidden : les
 * points ne se dessinent pas, la zone montre son média seul. editing : réglage en cours, un cadre
 * et sa légende autour des points. undefined : DMD classique, ou la fenêtre n'a pas le DMD.
 */
function liveDmdView(role: RoleId): { area: ReturnType<typeof liveDmdArea>; framed: boolean; hidden?: boolean; editing?: string } | undefined {
  if (!liveDmdOn() || !(windowRoles.get(role) ?? [role]).includes('dmd')) return undefined;
  // Juke-box : la bande 4:1 à sa place automatique, sur du noir (le spectre, JUKE-BOX).
  if (jukeboxDmd()) {
    const auto = autoDmdPlace(undefined);
    return auto ? { area: auto.zone, framed: false } : undefined;
  }
  const table = screensSubject();
  // FullDMD sans table : la marque sur toute la grille de 160 × 90 du repli (fallback.js, fullDmd),
  // pas une bande 4:1 entre deux aplats noirs (revue du directeur artistique, 27/10/2026).
  if (!table && menuDmdKind === 'fulldmd' && state.phase !== 'loading') return undefined;
  const auto = autoDmdPlace(table)!;
  // Chargement : l'animation du lancement se montre toujours, à la place automatique.
  if (!table || state.phase === 'loading') return { area: auto.zone, framed: auto.framed };
  const spot = menuDmd.spot(table, auto.zone, state.phase === 'library');
  const { aspect: _aspect, ...area } = spot.zone;
  // Points déplacés hors de la place automatique, sur un média FullDMD : le média se voit autour
  // (pendant le réglage aussi : l'aperçu est ce que la roue montrera une fois enregistré).
  const moved = (['x', 'y', 'width', 'height'] as const).some((k) => Math.abs(spot.zone[k] - auto.zone[k]) > 1e-6);
  return {
    area,
    framed: auto.framed || (moved && auto.media),
    ...(spot.hidden && { hidden: true }),
    ...(spot.editing && { editing: spot.editing }),
  };
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
  if (!table) {
    dmdShown = undefined;
    liveDmd.show('', undefined);
  } else {
    const records = tableRecords(table);
    const wheelUrl = medias?.wheel(table);
    const wheel = dmdWheels.get(wheelUrl, wheelUrl ? mediaPathFromUrl(wheelUrl) : undefined);
    // Sens de la roue : vers la table suivante (1) ou la précédente (−1), par le plus court chemin.
    const index = tables.indexOf(table);
    const n = tables.length;
    const step = dmdShown && index >= 0 && dmdShown.index >= 0 && n ? (((index - dmdShown.index) % n) + n) % n : 0;
    const dir = step > n / 2 ? -1 : 1;
    dmdShown = { file: table.file, index };
    // Une autre table, ou la même dont les records ont changé : l'alternance repart du titre.
    const key = JSON.stringify([table.file, records?.scores, records?.credits]);
    liveDmd.show(key, { title: table.title, manufacturer: table.manufacturer, year: table.year, records, wheel }, dir);
  }
  liveDmd.resume();
}

/** Points des afficheurs dessinés : la couleur réglée, ou celle de la table montrée (« couleur de la table »). */
function menuDmdColor(): string {
  return effectiveDmdColor(mediaSettings.dmdColor, tints?.current()?.dmd);
}

/**
 * Teinte de la table que montrent les écrans (table-tint.ts) : ses médias, dans l'ordre fronton
 * (l'image allumée du .directb2s comprise), logo, plateau. Mesurée seulement si l'ambiance ou le
 * DMD s'en servent ; la clé change avec la table et avec ses médias (adresse datée, mediaUrl).
 */
function followTint(): void {
  if (!tints) return;
  const used = mediaSettings.tableColor || mediaSettings.dmdColor === DMD_TABLE_COLOR;
  const table = used && medias ? screensSubject() : undefined;
  if (!table || !medias) return tints.follow(undefined);
  const urls = [medias.roleMedia(table, 'backglass').url, medias.wheel(table), medias.roleMedia(table, 'playfield').url];
  const files = urls.map((u) => (u ? mediaPathFromUrl(u) : undefined)).filter((f): f is string => Boolean(f));
  tints.follow({ key: JSON.stringify([table.file, ...urls]), files });
}

function broadcast(): void {
  // Le Juke-box se ferme, musique arrêtée, dès qu'on quitte son écran, par quelque chemin que ce soit
  // (Exit, partie lancée du téléphone, extinction…) ; sauf au bureau, vers la gestion (menu système) :
  // la musique y continue, en fond, jusqu'au retour à la roue ou au lecteur.
  if (state.phase !== 'jukebox' && jukeboxPlayer.active()) {
    if (state.phase === 'library' && playfieldLandscape()) jukeboxPlayer.toBackground();
    else jukeboxPlayer.close();
  }
  // Casque porté et ses écrans rendus pour lui : ceux du PC n'affichent plus que « Dans le casque ».
  const inHeadset = Boolean(headset?.worn && headset.viewsFlowing);
  followTint();
  syncLiveDmd();
  jukeboxPlayer.syncDmd(state.phase === 'menu' && !state.help && onJukebox());
  // Le mode attente n'est permis que sur le menu des tables (ni aide, ni fiche, ni message, ni partie).
  attract.allow(state.phase === 'menu' && !state.help && tables.length > 0 && !desktop.active);
  if (!attract.active) attractIndex = undefined;
  for (const [role, win] of windows) {
    if (!win.isDestroyed()) win.webContents.send('state', inHeadset ? { ...viewFor(role), inHeadset: true } : viewFor(role));
  }
  sendToHeadsetViews((role) => viewFor(role, headsetMedias ?? medias));
  // Télécommande du téléphone : le QR vit tant que l'écran qui le montre est affiché ; le téléphone suit l'écran.
  const surfaces = state.phase === 'library' && !desktop.active ? library.remoteSurfaces() : { menu: false, keyboard: false };
  phoneRemote.show('menu', surfaces.menu);
  phoneRemote.show('keyboard', surfaces.keyboard);
  phoneRemote.menuChanged();
}
