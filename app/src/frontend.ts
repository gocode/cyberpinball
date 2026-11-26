import * as fs from 'node:fs';
import { prepareClassicPov } from './vpx-launch-compat';
import { findWheelTable } from './wheel-table';
import * as path from 'node:path';
import { app, BrowserWindow, globalShortcut, ipcMain, powerMonitor, session, webContents, type Input, type Rectangle, type WebContents } from 'electron';
import {
  otherVpxFor,
  otherVpxLabel,
  otherVpxRefusal,
  readOtherVpx,
  readVpxFileVersion,
  tableTooNew,
  tooNewRefusal,
  joystickStartCode,
  relaunchEnabled,
  saveRelaunchEnabled,
  START_HOLD_MS,
  loadDedicatedRecord,
  loadPrereleaseSetting,
  createKeptPhones,
  ArcadeHours,
  CONFIG_KEY,
  STOP_IDLE_FALLBACK_MS,
  STOP_NOTICE_MS,
  arcadeHoursClock,
  badgeLabel,
  eventLater,
  eventText,
  CHAT_REACTIONS,
  type ChatReaction,
  type Reaction,
  type RemoteGroupAct,
  type RemoteInstantAct,
  type RankingScope,
  type RemotePage,
  type ScorePeriod,
  downloadReasonLater,
  downloadReasonText,
  avatarsDir,
  avatarView,
  BADGES,
  badgeDefinition,
  badgeShape,
  FAMILY_BACKDROP,
  RARITY_XP,
  rarityLabel,
  levelOf,
  weekKey,
  tableKey,
  weekXp,
  tierLabel,
  type AvatarView,
  profileWelcomeDue,
  powerSimulated,
  powerTexts,
  powerUnavailable,
  SYSTEM_ITEMS,
  WIZARD_STEPS,
  buttonProblems,
  formatManualEdit,
  gameKeys,
  displayKeys,
  joystickButton,
  keyLabel,
  interfaceKeys,
  collectionKeys as cabinetCollectionKeys,
  menuButton,
  zoneSwitchKeys,
  listenKeys as magnaListenKeys,
  WHEEL_START_HOLD_MS,
  LOADING_SLOW_MS,
  advanceLoadingStep,
  loadingStepLabel,
  type LoadingStep,
  navigationButtons,
  navigationProblems,
  type ButtonsSource,
  eyeHeightProblem,
  isCalibrated,
  airLinkOverWifi,
  writeFileAtomic,
  recordingIniText,
  recordingIniCarryBack,
  screensFallbackGaps,
  screensFallbackViewMode,
  emptyPlayedPlaylists,
  pupVideosDir,
  activePacks,
  missingPackFiles,
  headsetAudioOutput,
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
  ledsFromCabinet,
  dofScenePalette,
  refreshDofFallback,
  dofRomNumbers,
  joystickButtonsUnrecorded,
  playfieldOrientation,
  FRAMING_STYLE_KEYS,
  ownedId,
  pinballFxCommand,
  pinballFx3DirectFailureHint,
  pinballFx3FirstRunMessage,
  pinballFx3OrientationChange,
  takePinballFx3OrientationNotice,
  playsOnWindowsOrientation,
  resolveMedia,
  pinballFx3LaunchCommand,
  pinballFx3ShortGameMessage,
  isZenEmulator,
  futurePinballCommandLine,
  PINUP_DISPLAY_EXE,
  PINUP_PLAYER_PROCESSES,
  ZEN_GAMES,
  type ZenGameKey,
  readInfo,
  isFavorite,
  TABLE_ENGINES,
  setFavorite,
  infoFileFor,
  placeMissingMedia,
  PINBALLFX3_BACKGLASS_PAGE,
  PINBALLFX3_BACKGLASS_TITLE,
  buttonKeys,
  windowsVk,
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
  sameZone,
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
  hushForMoment,
  AttractMode,
  attractMemory,
  momentScreen,
  pickAttractTable,
  samePath,
  screensTable,
  tableContents,
  occupiedRoles,
  surfaceRoleRects,
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
  type NewsReach,
  isSystemGroup,
  hiddenInLocalPlay,
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
  type PresenceTable,
  type VcRuntimeStatus,
  type MediaTarget,
  type MediaType,
  formatList,
  programsDuringGame,
  frontendNames,
  t,
  tLater,
  say,
  type StoredText,
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
  loadRecordingSettings,
  saveRecordingSettings,
  type RecordingSettings,
  INTRO_TIMELINE,
  IntroRun,
  type IntroView,
  INTRO_SKIP_FLAG,
  createModifierChords,
  isAppShortcut,
  type MenuResume,
  readResume,
  resumeArg,
  withoutResume,
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
  crashSignature,
  vpxExitName,
  readVpxScript as readTableScript,
  diskSpace,
  loadSocial,
  type RemoteButton,
  intensityLabel,
  nextIntensity,
  boardKey,
  sanctionOf,
  lastRunOf,
  countryOfLocale,
  type PlayedScore,
  jukeboxSummary,
  medallionWheel,
  medallionWheelMove,
  type Medallion,
  JUKEBOX_WHEEL_KEY,
  COMMUNITY_WHEEL_KEY,
  ARENA_WHEEL_KEY,
  COLLECTIONS_WHEEL_KEY,
  remoteMenuTarget,
  toRemoteEntry,
  tn,
  shownCrowd,
  invitedOf,
  welcomeLine,
  type RoomId,
  REMOTE_ENTRIES_MAX,
  isJukeboxAction,
  type RemoteJukeboxOp,
  countryName,
  locale,
  endCardView,
  type EndCardView,
  mentions,
  maskWords,
  jukeboxRoutes,
  type JukeboxAudioRoute,
  accountCopiesDir,
  RELAY_ORIGIN,
  writeAccountBundle,
  type AccountCopy,
  applyPinballFxRotation,
  applyPinballFxCabinet,
  pinballFxCabinetLayout,
  mediaKind,
  formatDateTime,
} from '@cyberpinball/core';
import { bringToFront, foregroundWindow, keysDown, listWindows, moveWindow, probeDisplayLinks, processIdsByName, runningProcessNames, setWindowBounds, visibleWindowsOf, type WindowInfo } from '@cyberpinball/win-displays';
import { applyFuturePinballScreens, describeFuturePinballScreenChanges } from './futurepinball-screens';
import { logFuturePinballLaunch, logFuturePinballLibraries, logFuturePinballView } from './futurepinball-diagnostics';
import { closePupStartedDuringGame, detectFuturePinball, futurePinballBamMenu, futurePinballButtonKeys, futurePinballNudgeKeys, futurePinballPlan, placeDmdMirror, placeFuturePinballWindow, placePupWindows, placeVirtualDmd, startDmdMirror } from './futurepinball-play';
import { bridgeNudgeKeys } from './nudge-keys';
import { observedDisplays, simulatedDisplays } from './displays';
import { browserScreenFor } from './browser-screen';
import { createWindow, isShown, OFFSCREEN, primaryRect, refuseOffscreen, whenReadyToShow, windowRect } from './offscreen';
import { quitWithWindow } from './app-lifetime';
import { handleSecondLaunch } from './single-instance';
import { installVpx, vpxArchivePresent } from './install-vpx';
import { describeVcRuntime, ensureVcRuntime, vcRuntimeReady } from './vc-runtime';
import { armRecording, type RecordingOutcome, type RecordingRun, type RecordingScreen } from './game-recording';
import { launchVpx, simulateVpx, vpxPrefDir, type LaunchResult } from './launcher';
import { lastLaunchLogPath, rememberLaunch } from './launch-evidence';
import { restoreVpxFiles, vpxChangedFiles, vpxFilesStatus } from './vpx-integrity';
import { launchPinballFx, runningPinballFx, ZEN_LAUNCH_GAMES } from './pinballfx-launcher';
import { detectPinballFx, detectPinballFx3 } from './pinballfx-install';
import { bridgeZenKeys } from './zen-keys';
import { fetchAllPinballFx3Backglasses, preparePinballFx3Backglass } from './pinballfx3-backglass';
import { watchGameLoad, type GameLoadWatch } from './game-load';
import { createLibrary, type ActionShortcut, type SystemItem, type UiAction } from './library';
import { createFeedbackService } from './feedback-service';
import { noteCrashOutcome } from './feedback-menu';
import { onAppCrash } from './uncaught';
import { createMenuDmd } from './menu-dmd';
import { cachedScript } from './vbs';
import { readVpxLogTail, vpxLogPath } from './dmd-hints';
import { mediaFrame, prepareDressing } from './fulldmd';
import { LiveDmd, type LiveDmdAnimationHandle } from './live-dmd';
import { applyMenuDmdServer, handDmdToVpx, menuDmdServer } from './dmd-server';
import { DmdWheels } from './dmd-wheel';
import { createConverter } from './media-convert';
import { RomFirstBoot } from './rom-first-boot';
import { RomMusic } from './rom-music';
import { onKeyInput } from './key-input';
import { joystickAxes, onJoystickInput, retryJoysticks, watchJoystickButtons } from './joystick-input';
import { locations, trialVpxAllowedHere, vpxInstall, vpxProfile } from './paths';
import { createVpxTrialMenu } from './vpx-essai-menu';
import { createVpxPresetsMenu, prepareQuality, qualityAfterGame, qualityMachine } from './qualite-vpx';
import { createFramingMenu } from './cadrage-menu';
import { createFramingPreviews } from './framing-preview';
import { loadPlugins } from './plugins';
import { activeVpxIni, audioOutputs, syncConfiguration, usbDevices } from './vpx-ini';
import { createConfigurationsMenu } from './configurations-menu';
import { coverDisplay, coverReport, hideCovered, minimizeCovered, recoverExact } from './cover-display';
import { DesktopMode } from './desktop-mode';
import { answerLegacy, legacyDesktopTurned, orientationAfterGame, orientationForDesktop, orientationForGame, orientationFromDesktop, playfieldOrigin, takeOrientationProblems } from './display-orientation';
import { acceptFrontends, otherFrontendsOnThisPc, unacceptedFrontends } from './frontend-gate';
import { hideTaskbars, isVeil, nameScreen, onScreensSettled, recoverScreens, relaunchCovered, restoreTaskbars, setDesktopMode, setScreensBusy, settleScreens, takeCoverIncidents } from './screen-guard';
import { followScreens, watchGameWindows } from './game-screens';
import { buttonsBackup, describeReset, describeRestore, resetButtons, resetCheck, resetConsequences, restoreButtons } from './buttons-reset';
import { forcedRotation, menuRotation, openSettings, romVolumeControl } from './settings';
import { allowJukebox, allowPreview, serveMedias } from './media-protocol';
import { startJukeboxMedia, stopJukeboxMedia, streamUrl } from './jukebox-media-server';
import { createJukeboxPlayer, type JukeboxMessage } from './jukebox-player';
import { createAvatarMenu } from './avatar-menu';
import { createProfileWelcome } from './profile-welcome';
import { createInvitationsService, createMachineTag } from './invitations-service';
import { createMenuSettings } from './menu-settings';
import { createWheelSettings } from './wheel-settings';
import { WheelRepeat } from './wheel-repeat';
import { WheelThumbs } from './wheel-thumbs';
import { screenPaceLine } from './screen-pace';
import { createJukeboxSettings } from './jukebox-settings';
import { createIntroMenu } from './intro-menu';
import { createLanguageMenu } from './language-menu';
import { createTermsMenu } from './terms-menu';
import { createBackupsMenu } from './backups-menu';
import { ejectDrive } from './drive-eject';
import { freezeWrites } from './write-freeze';
import { listDrives } from './file-picker';
import { createUpdatesMenu } from './updates-menu';
import { createGuestMenu } from './guest-menu';
import { collectionsPoster, createCollectionsItem, createCollectionsMenu, tableCollectionsAction } from './collections-menu';
import { createFriendsMenu } from './friends-menu';
import { createChatService } from './chat-service';
import { deleteAccount, eraseAccountFiles } from './account-delete';
import { createAccountMenu } from './account-menu';
import { createAccountService, httpTransport } from './account-service';
import { createChatMenu } from './chat-menu';
import { createGroupService } from './group-service';
import { createGroupsMenu } from './groups-menu';
import { createProfileMenu } from './profile-menu';
import { createPhoneCommunity } from './phone-community';
import { createCommunityMenu } from './community-menu';
import { createCommunityHub, type CommunityRoomPeek, type CommunityThread } from './community-hub';
import { createArenaMenu } from './arena-menu';
import { createInstantMenu } from './instant-menu';
import { createRoomsMenu } from './rooms-menu';
import { createRankingsMenu, type RemoteAllTables } from './rankings-menu';
import { createDailyTables } from './daily-tables';
import { createPlaceTaken } from './place-taken';
import { createGameReturn } from './game-return';
import { createChallengeService } from './challenge-service';
import { createChallengesMenu, challengeTableOf, type ChallengeCandidate } from './challenges-menu';
import { createDailyTablesMenu } from './daily-tables-menu';
import { createTableSocial } from './table-social';
import { loadingObjective, type LoadingObjectiveView } from './loading-objective';
import { createFirewallRule } from './firewall-rule';
import { guardFirewall } from './firewall-guard';
import { createMdnsResponder } from './mdns-responder';
import { createFriendContent } from './friend-content';
import { friendTransport } from './download-sources';
import { createGameNotices } from './game-notice';
import { createEndCard } from './carte-fin-partie';
import { createInGameMenu, prepareDmdPlace } from './in-game-menu';
import { startCabinetVolume, type CabinetVolume } from './cabinet-volume';
import { createNightMode, type NightMode } from './modenuit';
import { createNightModeMenu } from './modenuit-menu';
import { createBallCounts } from './ball-count';
import { createRomVolumes } from './rom-volume';
import { createTableScores } from './table-scores';
import { createTableRankings, playerStatus } from './table-rankings';
import { createRemoteRanks } from './remote-ranks';
import { createTableDoubles } from './table-double';
import { inspectorFor, vpxFirewallTargets } from './vpx-inspector';
import { prepareSoloInspector, restoreSoloInspector, type SoloInspectorSetup } from './solo-inspector-setup';
import { watchSoloScores, type SoloScoreWatch } from './solo-score-watch';
import { scriptDmdWatch, simulatedDmdWatch, watchVpxDmd, type DmdWatch } from './dmd-watch';
import { readLiveScoresSettings, writeLiveScoresSettings } from './live-scores-setting';
import { readQuietInGame, writeQuietInGame } from './quiet-in-game-setting';
import { centerWhenStarted, probeVr, rememberVrSettings, restoreVrTableIni, writeIniSettings,  } from './vr';
import { HEADSET_TRIAL_DIR, HeadsetMenu, readCabinetPlace } from './casque';
import { DMD_PLUGIN, installVpxPlugin } from './vpx-plugins';
import { installVpxCorrige, installVpxCorrigeAtStartup, vpxCorrigeInPlace } from './vpx-corrige';
import { prepareVpxClr } from './vpx-clr';
import { askElevation } from './uac-confirm';
import { createVision3dMenu } from './vision3d-menu';
import { createAnaglyphMenu } from './anaglyph-menu';
import { readAnaglyph } from './anaglyph';
import { nvidia3dVisionFacts, refreshNvidiaDriver, stereoFor } from './nvidia-3dvision';
import { createDebug } from './debogage';
import { createDebugMenu } from './debogage-menu';
import { noteGameCadence, vpxLogSize } from './game-cadence';
import { shrinkDmdVideos } from './dmd-video-shrink';
import { createVrFrontend } from './vr-frontend';
import { closeHeadsetViews, isHeadsetView, openHeadsetViews, sendToHeadsetViews, setHeadsetPainting, type HeadsetPage } from './casque-vues';
import { createLiveScoresMenu } from './live-scores-menu';
import { createLiveGames, type LiveProgress, type LiveStartGate } from './live-game';
import { createLevelTracker, type GameReport } from './level-tracker';
import { createLevelMenu } from './level-menu';
import { createSocialNet } from './social-net';
import { createMenuNotices } from './menu-notices';
import { createActivityMenu, type MessageKind } from './activity-menu';
import { createTeamThreads } from './team-threads';
import { headsetWanted, language as uiLanguage, loadFeedbackState as loadFeedbackStateFile, type FeedbackPerson as FeedbackSigner } from '@cyberpinball/core';
import { createInboxMenu, type InboxLink, type InboxThread } from './inbox-menu';
import { createLocalPlayItem } from './local-play';
import { createNewsMenu } from './news-menu';
import { createSystemSearch } from './system-search-menu';
import { demoCharter, seedSimulatedFriends, simulatedPlayersWanted, startSimulatedPlayers } from './social-demo';
import { createDedicatedMenu } from './dedicated-menu';
import { TableTints } from './table-tint';
import { createDedicatedSystem } from './dedicated-system';
import { handOverOnQuit, shellSession } from './dedicated-session';
import { syncRelaunchWatcher, watchDesktopButton, watchStartHold } from './start-relaunch';
import { createPowerMenu } from './power';
import { readWakeDevices } from './arcade-hours';
import { createLedService } from './led-live';
import { loadEventSettings, startTap, tapMode, tapPlanned, type DofButton, type DofTapDeps } from './dof-evenements-jeu';
import { createLedAnimations } from './led-animations';
import { readDof } from './dof-files';
import { type CabinetLeds } from '@cyberpinball/core';
import { createPhoneRelay } from './phone-relay';
import { createPhoneRemote, phoneRemoteMode, type MenuEntries, type MenuEntry, type RemoteCommunity, type RemoteJukebox } from './phone-remote';

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
    ['menu.system', t('Menu système (tables, réglages, boutons, écrans, Bureau Windows, quitter)'), t('Exit ({keys}), Tab, ou clic sur ⚙ en haut à droite', { keys: or(KEYS.exit) })],
    ['shortcut.desktop', t('Bureau Windows (tous les écrans du PC), puis retour au front-end'), formatList([...KEYS.desktop.map(keyLabel), shortcutLabel(SHORTCUTS.desktop)], 'or')],
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
  // Médaillons Communauté, Arène et Collections : Start ouvre l'accueil, l'écran de l'Arène, ou la liste des collections.
  if (onCommunity() || onArena() || onCollections())
    return [
      [t('Flippers : choisir')],
      ...(!collections.locked() && (magna.previous.length || magna.next.length) ? [[t('MagnaSave : collections')] as [string]] : []),
      [t('Start : ouvrir'), KEYS.confirm[0]],
      ...(guest.allows('menu.system') ? [[t('Exit : Menu système'), KEYS.exit[0]] as [string, string]] : []),
    ];
  // Médaillon Juke-box : Start ouvre le lecteur (ou l'invitation à importer).
  if (onJukebox())
    return [
      [t('Flippers : choisir')],
      ...(!collections.locked() && (magna.previous.length || magna.next.length) ? [[t('MagnaSave : collections')] as [string]] : []),
      [library.jukebox.store().playlists.length ? t('Start : ouvrir') : t('Start : importer'), KEYS.confirm[0]],
      ...(guest.allows('menu.system') ? [[t('Exit : Menu système'), KEYS.exit[0]] as [string, string]] : []),
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
    ...(guest.allows('menu.system') ? [[t('Exit : Menu système'), KEYS.exit[0]] as [string, string]] : []),
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
  debug.launchBegin();
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
  debug.launchStep(step);
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
/** Bouton tenu sur la roue : une table toutes les 100 ms au plus (wheel-repeat.ts). */
const wheelRepeat = new WheelRepeat();

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

export interface Message {
  title: string;
  lines: string[];
  /**
   * Partie échouée : un flipper ouvre « Envoyer un rapport aux développeurs », ce problème rappelé
   * (feedback-menu.ts) ; `consent` : la question des rapports automatiques est à poser en quittant
   * (premier plantage) ; `notified` : le rapport automatique est parti, l'écran le dit et le flipper
   * n'ajoute plus que des détails.
   */
  report?: { about: string; table: string; signature: string; consent?: boolean; notified?: boolean };
  /** Ce que fait Start sur ce message. */
  action?: 'wizard' | 'install-vpx' | 'addTable' | 'manualEdits' | 'buttons' | 'interface' | 'otherFrontend' | 'zenFirstRun' | 'journey' | 'replay' | 'live' | 'power' | 'orientation';
  /**
   * Table d'une partie échouée : Start ouvre « Ce qu'il manque pour jouer » (action 'journey'), ou la
   * relance quand rien ne manque (action 'replay' : le script de la table ou VPX s'est arrêté).
   */
  table?: string;
  /**
   * Dans le casque : la consigne du moment, en très gros au milieu du regard (fronton), avec les boutons
   * en rappel ; un problème ou l'état seulement s'il y en a (calage de la borne).
   */
  prompt?: {
    text: string;
    keys: string;
    problem?: string;
    status?: string;
    /** Le schéma des manettes (schema-manettes.js), ces commandes en vert ; profil Touch seulement. */
    schema?: string[];
    /** Le début de `keys` à mettre en vert, la commande que montre le schéma. */
    keysLead?: string;
    /** En bas : le geste qui sert à tout moment (le calage : recaler d'un geste), avec son petit schéma. */
    band?: { schema?: string[]; text: string; detail: string };
  };
  /**
   * Une étape de l'assistant des manettes (planche validée le 13 novembre 2026) : l'étape, la fonction en grand,
   * le schéma avec le bouton proposé en vert, la ligne « Proposé : A · appuyez sur le bouton voulu », le retour.
   */
  wizard?: { header: string; step: string; schema?: string[]; proposedLabel?: string; proposed?: string; hint: string; back?: string; problem?: string };
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
  zenFirstRun: 'message.zen-first-run',
  journey: 'message.journey',
  replay: 'message.replay',
  live: 'message.live',
  power: 'message.power',
  orientation: 'message.orientation',
};

export interface State {
  phase: Phase;
  index: number;
  help: boolean;
  message?: Message;
  /** Constat bref en haut du menu (configuration de la borne changée), effacé après quelques secondes. */
  banner?: string;
  /**
   * Le médaillon choisi dans la roue (jukebox-screens.ts : Juke-box, Communauté, Collections) ; la
   * table choisie reste en mémoire dessous. Absent : une table.
   */
  medallion?: Medallion;
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
/** La phase de la dernière diffusion : un passage de « playing » à autre chose est un retour de partie (broadcast). */
let broadcastPhase: State['phase'] = state.phase;
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
 * Musique tirée des ROM (rom-music.ts) : repli de la musique du jeu pour les tables à ROM qui n'en
 * ont pas, enregistrée en tâche de fond ; s'arrête dès qu'une partie se prépare.
 */
let romMusic: RomMusic | undefined;
/**
 * Mise en route des ROM sans mémoire (rom-first-boot.ts) : sans elle, la première partie d'une table
 * à ROM s'arrêtait sur « réglages d'usine rétablis », pièces refusées. D'office en tâche de fond, et
 * avant la partie si la mémoire manque encore.
 */
let romFirstBoot: RomFirstBoot | undefined;
/**
 * Médias du menu dessiné pour le casque (casque-vues.ts) : le playfield y est en portrait
 * (headsetTurn), son fond s'oriente donc d'après ce bord des flippers, pas celui de l'écran du PC.
 */
let headsetMedias: MenuMedias | undefined;
/** Guet des dossiers des tables et des médias : tout changement se voit aussitôt sur chaque écran. */
let mediaWatch: MediaWatch | undefined;
let mediaSettings: MenuMediaSettings = loadMenuMediaSettings(loc.dataDir);
/** Mode nuit (modenuit.ts), créé plus bas, après l'horaire ; déclaré ici car des fermetures plus haut le lisent. */
let nightMode: NightMode | undefined;
const mediaErrorLog = mediaErrorsFile(path.join(loc.dataDir, 'logs'));
/** Tables voisines dont les médias sont préchargés par chaque fenêtre. */
const PRELOAD_OFFSETS = [1, -1, 2, -2];
/** Nom Windows de la sortie audio du menu (celle du fronton), relu au démarrage du menu. */
let audioOutput: string | undefined;

/**
 * La sortie audio du casque (Link, SteamVR, casque branché) : cherchée tant qu'on ne l'a pas (Link peut
 * se brancher après le lancement), gardée une fois trouvée ; le journal le dit à chaque changement.
 */
let headsetAudio: string | undefined;
let headsetAudioSaid: string | undefined | null = null;
/** Dernière recherche infructueuse : pas plus d'une lecture des sorties de Windows toutes les 30 s. */
let headsetAudioSearched = 0;

function findHeadsetAudio(): string | undefined {
  if (!headsetAudio && Date.now() - headsetAudioSearched > 30_000) {
    headsetAudioSearched = Date.now();
    headsetAudio = headsetAudioOutput(audioOutputs())?.friendlyName;
  }
  if (headsetAudioSaid !== headsetAudio) {
    headsetAudioSaid = headsetAudio;
    console.log(headsetAudio ? `Son dans le casque : sortie « ${headsetAudio} » de Windows.` : 'Son dans le casque : aucune sortie audio de casque dans Windows (Link, SteamVR, casque branché) ; le son reste sur la sortie de la configuration.'); // i18n-ignore : journal
  }
  return headsetAudio;
}

/**
 * La sortie du son du menu (musique, sons de l'interface, Juke-box) : celle du casque quand le menu est
 * dans le casque, sinon celle de la configuration (étape « Son »).
 */
function menuOutput(): string | undefined {
  return vrFront.headset?.inUse ? (findHeadsetAudio() ?? audioOutput) : audioOutput;
}
/**
 * Sorties du son du Juke-box (Réglages du Juke-box). Casque en usage : tout le son va dans le casque
 * (menuOutput), les sorties de la borne attendent.
 */
function jukeboxAudioRoutes(): JukeboxAudioRoute[] {
  return jukeboxRoutes(vrFront.headset?.inUse ? { outputs: [] } : mediaSettings.jukeboxAudio, menuOutput());
}
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
/** Écrans du premier démarrage à ouvrir à la fin de l'ouverture : conditions d'utilisation, profil de joueur. */
let pendingStartupScreens: { terms: boolean; welcome: boolean } | undefined;

function introFilesNow(): IntroFiles {
  return (introFileCache ??= loc.root ? introFiles(layoutOf(loc.root).media) : {});
}

/** Pose l'ouverture : au démarrage (retour à la roue), ou « Voir l'ouverture » (retour aux réglages). */
function beginIntro(returnTo: 'menu' | 'library'): void {
  // Fenêtres déjà prêtes (« Voir l'ouverture ») : les animations partent tout de suite.
  introRun.begin(returnTo, returnTo === 'library');
  state = { ...state, phase: 'intro', help: false };
  // « Voir l'ouverture » : elle part tout de suite, son souffle avec elle.
  if (returnTo === 'library') introStarted();
  else broadcast();
}

/** Une fenêtre est prête : quand toutes le sont, les animations partent ensemble. */
function introWindowReady(id: number): void {
  introReady.add(id);
  const all = [...windows.values()].every((w) => w.isDestroyed() || introReady.has(w.webContents.id));
  if (all && introRun.start()) introStarted();
}

/** Les animations de l'ouverture partent : l'état aux fenêtres, et le souffle de l'ouverture. */
function introStarted(): void {
  broadcast();
  // Une musique d'ouverture choisie par le joueur a la parole : le souffle se tait.
  // Son accord tombe sur l'ignition du plateau, à l'horloge des animations (startedAt), pas à l'arrivée du message.
  const startedAt = introRun.current?.startedAt;
  if (introSource(mediaSettings.intro, introFilesNow(), 'music').source !== 'file') playUiSound('intro', startedAt === undefined ? undefined : startedAt + INTRO_TIMELINE.ignition);
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
  if (pendingStartupScreens) {
    const pending = pendingStartupScreens;
    pendingStartupScreens = undefined;
    openStartupScreens(pending);
  }
  return true;
}

/** Ouverture du plateau au bureau : le fichier du fronton choisi par le joueur, sinon l'animation du plateau. */
function desktopIntro(viewOf: (r: RoleId, desktop?: boolean) => IntroView): IntroView {
  const own = introSource(mediaSettings.intro, introFilesNow(), 'backglass');
  if (own.source === 'file' && own.kind !== 'audio') return viewOf('playfield', true);
  const view = viewOf('playfield');
  return { ...view, source: 'fallback', url: undefined, kind: undefined, orient: undefined, fallback: 'intro-playfield' };
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
    // Plateau en largeur (poste de bureau) : l'ouverture « Soie » du plateau, couchée en largeur
    // (le shader se plie à toutes les proportions) ; une image ou une vidéo d'ouverture du fronton
    // choisie par le joueur garde sa place, plein écran.
    desktop: role === 'playfield' ? desktopIntro(viewOf) : undefined,
    hint: introRun.returnTo === 'library' ? t('Appuie sur un bouton pour revenir aux réglages') : t('Appuie sur un bouton pour choisir une table'),
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
    selected: attractTable() ?? (onMedallion() ? undefined : tables[state.index]),
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
    if (index >= 0) state = { ...state, index }; // garde le médaillon : la table de la collection, recalée aussi pendant le dessin de la roue
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
  // Boutons choisis dans Menu système > Tables > Collections : ils passent avant les MagnaSave.
  const nav = [...KEYS.previous, ...KEYS.next, ...KEYS.confirm, ...KEYS.exit];
  const chosen = collections.keys();
  if (chosen?.previous && chosen.next && !nav.includes(chosen.previous) && !nav.includes(chosen.next)) return { previous: [chosen.previous], next: [chosen.next] };
  // MagnaSave relevé ; sinon (bouton facultatif passé à l'étape « Boutons ») sa touche par défaut
  // d'un clavier (Ctrl gauche, Ctrl droit), si aucun autre bouton ne l'a prise, comme le mode invité.
  return cabinetCollectionKeys({ buttons, navigation }, KEYS);
}

/**
 * « Boutons des collections » (Menu système > Tables > Collections) : l'écran attend deux appuis, la
 * collection précédente puis la suivante ; n'importe quel bouton de la borne ou touche du clavier,
 * sauf les flippers, Start et Exit (ils restent à cet écran : choisir « Remettre les MagnaSave »,
 * revenir). Une borne dont les MagnaSave ne répondent pas y choisit les siens (PinCab, 10/11/2026).
 */
let collectionCapture: { previous?: string; refused?: string; back: () => void } | undefined;

function startCollectionCapture(back: () => void): void {
  collectionCapture = { back };
  const done = () => {
    collectionCapture = undefined;
    back();
  };
  library.openCustom(() => {
    const c = collectionCapture;
    const chosen = collections.keys();
    return {
      heading: t('Boutons des collections'),
      icon: 'button',
      lead: !c ? '' : c.previous ? t('Appuie maintenant sur le bouton de la collection suivante.') : t('Appuie sur le bouton qui affichera la collection précédente, sur la roue.'),
      sections: [
        {
          rows: [
            { text: t('Collection précédente'), detail: c?.previous ? keyLabel(c.previous) : t('en attente d’un appui'), icon: 'chevron-left', tone: c?.previous ? 'ok' : 'info' },
            { text: t('Collection suivante'), detail: c?.previous ? t('en attente d’un appui') : '—', icon: 'chevron-right', tone: 'info' },
            ...(c?.refused ? [{ text: c.refused, tone: 'warning' as const, icon: 'alert' as const }] : []),
            { text: t('Les flippers, Start et Exit restent à cet écran : ils ne peuvent pas changer de collection.'), tone: 'quiet' as const },
          ],
        },
      ],
      actions: [
        ...(chosen
          ? [
              {
                label: t('Remettre les MagnaSave'),
                detail: t('Les boutons choisis sont oubliés'),
                icon: 'restore' as const,
                run: () => {
                  collections.setKeys(undefined);
                  done();
                },
              },
            ]
          : []),
        { label: t('Annuler'), icon: 'back', run: done },
      ],
      back: done,
    };
  });
}

/** Un appui pendant le choix des boutons des collections : true s'il a été pris. */
function captureCollectionKey(input: Input): boolean {
  const c = collectionCapture;
  if (!c || state.phase !== 'library' || input.isAutoRepeat) return false;
  if ([...KEYS.previous, ...KEYS.next, ...KEYS.confirm, ...KEYS.exit].includes(input.code)) return false;
  // Modificateurs seuls d'un clavier (Maj, Ctrl, Alt) : acceptés, ce sont les MagnaSave d'un encodeur.
  if (c.previous && input.code === c.previous) {
    collectionCapture = { ...c, refused: t('{key} est déjà la collection précédente : un autre bouton.', { key: keyLabel(input.code) }) };
  } else if (!c.previous) {
    collectionCapture = { back: c.back, previous: input.code };
  } else {
    collections.setKeys({ previous: c.previous, next: input.code });
    console.log(`Touches des collections : choisies, ${keyLabel(c.previous)} / ${keyLabel(input.code)}.`); // i18n-ignore : journal
    collectionCapture = undefined;
    c.back();
  }
  broadcast();
  return true;
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
// Réseau des bornes (Menu système > Communauté) : partage activé par défaut, démarré avec le menu ;
// jamais le vrai réseau pendant un essai sans opérateur (socialNetMode), ni le vrai pare-feu.
const socialMode = socialNetMode(process.env);
// La règle du pare-feu de Cyber Pinball (et celle qui ferme VPX au réseau, l'inspector des parties
// entre amis, pour sa version active). Déclarée avant la télécommande, qui la lit dès son réveil : un
// téléphone gardé la réveille au démarrage (0.1.9-essai.66 : lue avant d'exister, `undefined` dans
// l'application assemblée, et la télécommande restait « Indisponible »). avant-declaration.test.ts.
const socialFirewall = createFirewallRule({ exe: process.execPath, simulated: socialMode !== 'public', vpx: () => vpxFirewallTargets(vpxInstall(loc)?.exe), log: (line) => console.log(line) });
/** Fichier qui arrive du téléphone : le bandeau du menu et l'écran de la télécommande le suivent. */
let phoneUpload: { name: string; received: number; size: number } | undefined;
const keptPhones = createKeptPhones(loc.dataDir, { log: (line) => console.log(line) });
// L'adresse stable par Internet (phone-relay.ts) : seulement sur le vrai réseau local, jamais pendant un essai.
const phoneRelay = phoneRemoteMode(process.env) === 'lan' ? createPhoneRelay({ kept: keptPhones, ...(process.env.CYBERPINBALL_RELAIS ? { origin: process.env.CYBERPINBALL_RELAIS } : {}), log: (line) => console.log(line) }) : undefined;
const phoneRemote = createPhoneRemote({
  kept: keptPhones,
  ...(phoneRelay ? { relay: phoneRelay } : {}),
  // Le nom de la borne sur le réseau local (« cyberpinball.local »), par le répondeur de Cyber Pinball.
  names: createMdnsResponder({ log: (line) => console.log(line), preferred: () => keptPhones.localName(), remember: (name) => keptPhones.noteLocalName(name) }),
  mode: () => phoneRemoteMode(process.env),
  firewall: async () => socialFirewall.state() ?? (await socialFirewall.check()),
  fromSources: !app.isPackaged,
});
// Retours des joueurs (feedback-service.ts) : propositions publiques, votes, rapports privés chiffrés.
// La clé du joueur (réseau des amis) signe les propositions et les votes : une voix par borne.
const feedbackService = createFeedbackService({
  dataDir: loc.dataDir,
  key: () => socialNet.state().key,
  // Mon pseudo et mon pays, signés avec mes propositions et mes votes : le tableau me nomme.
  who: () => {
    const country = socialNet.country();
    return { name: socialNet.state().name, ...(country ? { country } : {}) };
  },
  ...(process.env.CYBERPINBALL_RELAIS ? { origin: process.env.CYBERPINBALL_RELAIS } : {}),
  // Essais : un service en mémoire (rien ne sort sur le vrai réseau), avec les propositions de départ du fichier donné.
  ...(process.env.CYBERPINBALL_RETOURS_SIMULES !== undefined || process.env.CYBERPINBALL_RESEAU === 'simule' || OFFSCREEN ? { simulated: process.env.CYBERPINBALL_RETOURS_SIMULES ?? '' } : {}),
  changed: () => library.feedback?.changed(),
  log: (line) => console.log(line),
  // Mes retours et propositions comptent pour les badges de la Communauté ; une idée passée « fait » s'annonce.
  contributed: (shipped) => {
    levelTracker.socialChanged();
    if (shipped.length) menuNotices.push(shipped.map((p) => ({ kind: 'idea-shipped' as const, key: `idea|${p.id}`, at: Date.now(), subject: p.title })));
  },
});
/** Mon pseudo et mon pays : signés avec mes propositions, joints à mes rapports sauf anonymat. */
function feedbackWho(): FeedbackSigner {
  const country = socialNet.country();
  return { name: socialNet.state().name, ...(country ? { country } : {}) };
}
// Dialogue avec l'équipe (team-threads.ts, 21/11/2026) : chaque rapport ouvre un fil où l'équipe peut
// répondre ; une réponse s'annonce partout (notification, pastille des messages en attente).
const teamThreads = createTeamThreads({
  dataDir: loc.dataDir,
  service: feedbackService,
  version: app.getVersion(),
  language: () => uiLanguage(),
  // Le réglage et le numéro de borne relus du fichier des retours, que le menu des retours tient à jour.
  borne: () => loadFeedbackStateFile(loc.dataDir).borne,
  anonymous: () => loadFeedbackStateFile(loc.dataDir).anonymous,
  who: () => feedbackWho(),
  changed: () => {
    library.teamThreadsMenu?.changed();
    broadcast();
  },
  // Les réponses publiques sur mes propositions y entrent aussi, à chaque relève (team-threads.ts, noteProposals).
  arrived: (added) => menuNotices.push(added.map((a) => ({ kind: 'team-reply' as const, key: a.line.id, at: Date.now(), subject: a.thread.title, extra: a.line.text.replace(/\s*\n\s*/g, ' ') }))),
  log: (line) => console.log(line),
});
// Volume de la ROM (rom-volume.ts) : lu sur la fiche, réglé dans « Réglages de cette table », posé avant
// la partie. Déclaré avant la bibliothèque, qui le lit ; les ROM d'après le script déjà lu de la table.
const romVolumes = createRomVolumes({ dataDir: loc.dataDir, romsOf: (table) => cachedScript(table.file, loc.dataDir)?.roms ?? [], sharedPinmame: () => (loc.root ? path.join(loc.root, 'pinmame') : undefined), log: (line) => console.log(line) });
// Aperçus du cadrage rendus par VPX (framing-preview.ts) et style de la borne : déclarés avant la bibliothèque, qui les
// lit (Point de vue d'une table), et l'écran « Cadrage des tables » (cadrage-menu.ts).
const framingHost = {
  previews: createFramingPreviews({ dataDir: loc.dataDir, vpxExe: () => vpxInstall(loc)?.exe, log: (line) => console.log(line), allow: (file) => allowPreview(file) }),
  orientation: () => currentPlayfieldOrientation(),
  keepTop: () => Boolean(profile.keepTopFraming),
  rom: (table: TableEntry) => cachedScript(table.file, loc.dataDir)?.roms[0],
  pinmame: () => (loc.root ? path.join(loc.root, 'pinmame') : undefined),
  refresh: () => broadcast(),
  log: (line: string) => console.log(line),
  current: () => loadCabinet(loc.dataDir)?.framing,
};
// LED adressables hors partie : le port série est rendu à DOF dès qu'une partie se prépare (broadcast).
const ledService = createLedService({ log: (line) => console.warn(line) });
// Partie sur une table sans ROM (dof-evenements-jeu.ts) : relais vers libdof pour une table originale que la
// config DOF connaît, sinon profil générique (le port reste alors à Cyber Pinball pour elle seule).
// La config DOF se relit au plus toutes les 5 s (lue à chaque état envoyé pendant une partie).
let dofSetupMemo: { at: number; setup: ReturnType<typeof readDof> } | undefined;
const dofSetupNow = () => {
  if (!dofSetupMemo || Date.now() - dofSetupMemo.at > 5000) dofSetupMemo = { at: Date.now(), setup: readDof(loc) };
  return dofSetupMemo.setup;
};
/** Configuration de la borne relue au plus toutes les 5 s (la tirette du lanceur se lit 60 fois par seconde). */
let cabinetMemo: { at: number; cabinet: ReturnType<typeof loadCabinet> } | undefined;
const loadCabinetMemo = () => {
  if (!cabinetMemo || Date.now() - cabinetMemo.at > 5000) cabinetMemo = { at: Date.now(), cabinet: loadCabinet(loc.dataDir) };
  return cabinetMemo.cabinet;
};
const dofTapDeps: DofTapDeps = {
  dataDir: loc.dataDir,
  leds: () => {
    const cabinet = dofSetupNow()?.cabinet;
    return cabinet ? ledsFromCabinet(cabinet) : undefined;
  },
  service: ledService,
  log: (line) => console.log(line),
  // Profil générique : flippers, lanceur et Start de la borne (clavier par Windows, joystick par SDL), même
  // quand VPX a le premier plan ; tirette du lanceur analogique lue sur son axe.
  watchButtons: (on) => {
    const keys = buttonKeys(loadCabinet(loc.dataDir)?.buttons);
    const wanted: DofButton[] = ['leftFlipper', 'rightFlipper', 'plunger', 'start'];
    const codes = wanted.map((b) => [b, keys[b]] as const).filter((e): e is readonly [DofButton, string] => Boolean(e[1]));
    const joy = new Map(codes.filter(([, c]) => c.startsWith('SDLJoy_')).map(([b, c]) => [c, b]));
    const vk = codes.flatMap(([b, c]) => (c.startsWith('SDLJoy_') || windowsVk(c) === undefined ? [] : [[b, windowsVk(c)!] as const]));
    const down = new Set<DofButton>();
    const timer = setInterval(() => {
      if (!vk.length) return;
      let held: number[];
      try {
        held = keysDown(vk.map(([, v]) => v));
      } catch {
        return; // API de Windows indisponible
      }
      for (const [b, v] of vk) {
        const now = held.includes(v);
        if (now === down.has(b)) continue;
        if (now) down.add(b);
        else down.delete(b);
        on(b, now);
      }
    }, 15);
    const stopJoy = joy.size ? watchJoystickButtons((code, pressed) => joy.has(code) && on(joy.get(code)!, pressed)) : undefined;
    return () => {
      clearInterval(timer);
      stopJoy?.();
    };
  },
  plungerPull: () => {
    const sensor = loadCabinetMemo()?.analog?.plunger;
    if (!sensor) return undefined;
    const v = joystickAxes().find((a) => a.device === sensor.device)?.values[sensor.axis];
    return v === undefined ? undefined : Math.max(0, sensor.reversed ? -v : v);
  },
  dof: () => {
    const setup = dofSetupNow();
    return setup ? { base: path.dirname(setup.dir) + path.sep, has: (rom) => dofRomNumbers(setup.ini, rom).length > 0 } : undefined;
  },
};
const b2sNameOf = (table: TableEntry) => cachedScript(table.file, loc.dataDir)?.b2sName;
// Table à ROM : avant que libdof ne lise sa config, le repli (dof-repli.ts) écrit directoutputconfig99.ini,
// des effets pour les bandes de LED aux ROM dont la config n'en a presque pas (riches : laissées telles
// quelles). Les ROM de la bibliothèque se relisent au plus toutes les 10 min ; la table lancée prend ses couleurs.
let libraryRomsMemo: { at: number; roms: string[] } | undefined;
function refreshRomFallback(table: TableEntry): void {
  try {
    const setup = readDof(loc);
    if (!setup) return;
    if (!libraryRomsMemo || Date.now() - libraryRomsMemo.at > 600_000) libraryRomsMemo = { at: Date.now(), roms: [...new Set(tables.flatMap((t) => romsOf(t)))] };
    const played = [...new Set([...romsOf(table), ...loadedRoms(table.folder, romsOf(table))])];
    const tint = tints?.current()?.color;
    const p = dofScenePalette(tint, tints?.current()?.leds);
    const colors = [p.primary, p.accent, p.secondary].map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`);
    const playedSet = new Set(played.map((r) => r.toLowerCase()));
    const result = refreshDofFallback(setup, [...libraryRomsMemo.roms, ...played], {
      enabled: loadEventSettings(loc.dataDir).romFallback !== false,
      ...(tint ? { palette: (rom: string) => (playedSet.has(rom.toLowerCase()) ? colors : undefined) } : {}),
    });
    if (result.refused) console.warn(`[dof] repli : ${result.refused}`);
    if (result.wrote || result.removed || result.cabinetUpdated) {
      const added = result.plan?.added.filter((a) => playedSet.has(a.rom.toLowerCase())) ?? [];
      console.log(`[dof] repli ${result.removed ? 'retiré' : 'écrit'} (${result.file}) : ${result.plan?.added.length ?? 0} ROM complétée(s), ${result.plan?.rich.length ?? 0} laissée(s) ; table lancée : ${added.map((a) => `${a.rom} (${a.before} effet(s) d'origine)`).join(', ') || 'config riche'}.`);
      dofSetupMemo = undefined;
    }
  } catch (error) {
    console.warn(`[dof] repli impossible : ${(error as Error).message}`);
  }
}
// Animations des LED hors partie (led-animations.ts) : ambiance de la roue et des écrans, jamais pendant une partie.
// Les bandes décrites se relisent au plus toutes les 5 s (la lecture touche le disque).
let savedLedsMemo: { at: number; leds: CabinetLeds | undefined } | undefined;
const ledAnimations = createLedAnimations({
  service: ledService,
  dataDir: loc.dataDir,
  idleFor: () => attract.idleFor(),
  leds: () => {
    if (!savedLedsMemo || Date.now() - savedLedsMemo.at > 5000) {
      const setup = readDof(loc);
      savedLedsMemo = { at: Date.now(), leds: setup?.cabinet ? ledsFromCabinet(setup.cabinet) : undefined };
    }
    return savedLedsMemo.leds;
  },
  log: (line) => console.warn(line),
});

const library = createLibrary({
  leds: ledService,
  ledAnimations,
  feedbackService,
  teamThreads,
  feedbackWho: () => feedbackWho(),
  romMusic: () => romMusic,
  vrNetwork: () => vrFront.vrNetworkFacts(),
  glasses3d: () => nvidia3dVisionChosen(),
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
    // Sans opérateur, la partie s'arrête seule après 10 s, ou CYBERPINBALL_PARTIE_MS (et ne compte pas dans les statistiques).
    void play(table, process.env.CYBERPINBALL_AUTOPILOT ? Number(process.env.CYBERPINBALL_PARTIE_MS) || 10_000 : undefined);
  },
  // Jouer et enregistrer : la même partie, l'enregistrement armé ; son écran s'ouvre au retour.
  playAndRecord: (table, settings) => {
    // Sans opérateur, la partie dure le délai et la durée de l'enregistrement, plus 3 s (fin à la
    // durée) ; CYBERPINBALL_PARTIE_MS la raccourcit, pour une fin par la sortie de la table.
    const unattended = process.env.CYBERPINBALL_AUTOPILOT ? Number(process.env.CYBERPINBALL_PARTIE_MS) || (settings.delay + settings.duration + 3) * 1000 : undefined;
    void play(table, unattended, undefined, { record: settings });
  },
  recordableRoles: () => (['backglass', 'dmd'] as RecordedRole[]).filter((role) => menuAssignments[role]),
  tableSettings: (table) => openVpxSettings(table),
  romVolume: (table) => romVolumes.view(table),
  playWithFriend: (table, back) => friendsMenu.live.sheetAction(table, back),
  localPlay: () => localPlay(),
  ...(socialNetMode(process.env) === 'off' ? {} : { instantGame: (table: TableEntry, back: () => void) => instantMenu.sheetAction(table, back) }),
  // La fiche côté joueurs (table-social.ts) : « Sur cette table », l'objectif, « Jouer ensemble… » ; fermée en invité et en jeu local.
  ...(socialNetMode(process.env) === 'off' ? {} : { tableSocial: (table: TableEntry, back: () => void) => (socialClosed() ? undefined : tableSocial.sheet(table, back)) }),
  scores: (table, period) => tableScores.board(table, period),
  rankings: (table, scope, period) => tableRankings.view(table, scope, period),
  hideScore: (id) => socialNet.hideScore(id),
  hidePlayer: (key) => socialNet.hidePlayer(key),
  // « Ajouter aux favoris » sur la fiche : User.Favorite du .info (celui de la table, sinon celui du dossier).
  menuDmd: { detail: (table) => menuDmd.detail(table), open: (table, back) => menuDmd.open(table, back) },
  // « Ajouter à une collection… » sur la fiche (library, créée plus bas, n'est lue qu'à l'appel).
  tableCollections: (table, back) => tableCollectionsAction({ collections, library, redraw: () => broadcast() })(table, back),
  favorite: (table, on) => {
    if (!loc.root) return;
    setFavorite(infoFileFor(table, layoutOf(loc.root).tables), on);
    console.log(`Favoris : ${table.id} ${on ? 'ajoutée' : 'retirée'}.`); // i18n-ignore : journal
    reloadTables(table.file);
  },
  adjustDisplay: async (table) => {
    const report = await play(table, process.env.CYBERPINBALL_AUTOPILOT ? 10_000 : undefined, 'display');
    return report?.result;
  },
  vpxLogFile: () => {
    const previous = lastLaunchLogPath();
    if (previous) return previous;
    const install = vpxInstall(loc);
    return install ? path.join(vpxPrefDir(install.version), 'vpinball.log') : undefined;
  },
  debugReport: () => debug.report(),
  pupFolder: () => IniDocument.parse(readTextIfExists(activeVpxIni(loc)) ?? '').get('Plugin.PUP', 'PUPFolder'),
  playfieldOrientation: () => currentPlayfieldOrientation(),
  // Aperçus du cadrage (cadrage-menu.ts).
  framing: () => framingHost,
  quit: () => void quit(),
  keys: () => KEYS,
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  windows: () => windows,
  landscape: () => playfieldLandscape(),
  // Exit de la gestion du Juke-box : le lecteur, sur la playlist choisie.
  jukeboxPlayer: (playlist) => openJukebox(playlist),
  // « Réglages du Juke-box » depuis sa gestion : Exit y ramène.
  jukeboxSettings: (back) => jukeboxSettings.open(back),
  browserScreen: () => browserScreenRect(),
  takeForeground: () => void takeForeground(),
  // MagnaSave droit : écouter un morceau à l'import ; seulement si le gauche est là pour changer de zone.
  listenKeys: () => magnaListenKeys({ buttons, navigation }),
  // Pré-écoute des morceaux à l'import (gestion du Juke-box), sur le fronton : le lecteur YouTube du Juke-box.
  jukeboxPreview: {
    play: (youtube) => {
      jukeboxPlayer.preview(youtube);
      broadcast();
    },
    stop: () => {
      jukeboxPlayer.preview(undefined);
      broadcast();
    },
    seek: (delta) => jukeboxPlayer.previewSeek(delta),
    state: () => jukeboxPlayer.previewState(),
  },
  audioOutput: () => menuOutput(),
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
  // Fiche technique : connexion et fréquences des vrais écrans ; aucune avec des écrans simulés (essais).
  displayLinks: () => (simulatedDisplays() ? [] : probeDisplayLinks()),
  techApp: () => {
    const social = socialNet.state();
    const status = socialNet.status();
    return {
      mode: desktop.active ? 'desktop' : 'cabinet',
      prerelease: loadPrereleaseSetting(loc.dataDir),
      dedicated: loadDedicatedRecord(loc.dataDir)?.state === 'active',
      friends: !social.enabled ? 'off' : status.internet || status.lan ? 'connected' : 'offline',
      phones: phoneRemote.keptPhones().length,
    };
  },
  reportFriends: () => {
    const social = socialNet.state();
    if (!social.enabled || guest.active) return undefined;
    return social.friends.map((f) => ({ key: f.key, name: f.name, online: socialNet.online(f.key) }));
  },
  sendFriendReport: (key, text) => chatService.send(key, text),
  reportNames: () => {
    const social = socialNet.state();
    return [social.name, ...social.friends.map((f) => f.name)];
  },
  listDrives: () => listDrives(),
  ejectDrive: (drive) => ejectDrive(drive, OFFSCREEN),
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
  output: () => menuOutput(),
  routes: () => jukeboxAudioRoutes(),
  allow: (file) => allowJukebox(file),
  streamUrl: (file) => streamUrl(file),
  leave: () => {
    state = { ...state, phase: tables.length ? 'menu' : 'message', medallion: 'jukebox', ...(tables.length ? {} : { message: noTables() }) };
  },
  redraw: () => broadcast(),
  dmd: (name, animation) => liveDmd.custom(name, animation),
  dmdOn: () => Boolean(dmdWindow()) && state.phase !== 'playing' && state.phase !== 'intro' && !desktop.active,
  visualizer: () => ({ mode: mediaSettings.jukeboxVisualizer, color: menuDmdColor() }),
  banner: (text) => showBanner(text),
  log: (line) => console.log(line),
  // Les boutons de la roue, résolus comme sur la roue (menuButton) ; les codes de la borne gardent leur rôle (une flèche relevée reste un flipper).
  keys: () => ({
    keys: KEYS,
    collections: collectionKeys(),
    cabinet: [...Object.values(buttonKeys(buttons)), ...Object.values(navigationButtons({ buttons, navigation }))].filter((k): k is string => Boolean(k)),
    // MagnaSave relevés à l'étape « Boutons », ou boutons des collections choisis (sinon Ctrl gauche et droit d'un clavier, que la borne n'envoie pas forcément).
    magnaRecorded: Boolean(buttons?.leftMagna || buttons?.rightMagna || collections.keys()?.previous),
  }),
  ...(process.env.CYBERPINBALL_JUKEBOX_EN_LIGNE ? { fakeOnline: process.env.CYBERPINBALL_JUKEBOX_EN_LIGNE } : {}),
  // « Gestion du Juke-box » : sa gestion (étape 4, library.jukeboxMenu) sur la playlist montrée ; sans elle, le menu système.
  manage: (playlist) => {
    if (!guest.knock('menu.system')) return;
    setTimeout(() => diagnosePlayfield('Gestion du Juke-box'), 600); // i18n-ignore : journal
    const menu = jukeboxMenu();
    if (menu) menu.open(playlist);
    else openConfig();
    broadcast();
  },
});

/** La gestion du Juke-box est à l'écran : le fronton garde l'affiche du Juke-box, le DMD ses points (jamais vides). */
function jukeboxManaging(): boolean {
  const menu = (library as { jukeboxMenu?: { active?: () => boolean } }).jukeboxMenu;
  return state.phase === 'library' && Boolean(menu?.active?.());
}

/** La gestion des playlists (étape 4), quand elle est là : ouverte sur une playlist, ou sur l'import. */
function jukeboxMenu(): { open(playlist?: string): void } | undefined {
  const menu = (library as { jukeboxMenu?: { open?: unknown } }).jukeboxMenu;
  return typeof menu?.open === 'function' ? (menu as { open(playlist?: string): void }) : undefined;
}
// Une playlist qui attendait un téléchargement : « Revenir au Juke-box » rouvre le lecteur sur elle.
library.downloads.opener('jukebox', (back) => openJukebox('playlist' in back && typeof back.playlist === 'string' ? back.playlist : undefined));

/** Le médaillon Juke-box est dans la roue (réglage « Juke-box dans la roue », Menu système > Tables > Roue). */
function jukeboxShown(): boolean {
  return mediaSettings.jukebox;
}

/** Le médaillon est choisi dans la roue (pas en mode attente, qui montre une table). */
function onJukebox(): boolean {
  return jukeboxShown() && state.medallion === 'jukebox' && !attractTable();
}

/** Le médaillon Communauté est dans la roue (réglage « Communauté dans la roue ») ; jamais en mode invité, qui ferme la communauté, ni en jeu local. */
function communityShown(): boolean {
  return mediaSettings.community && !guest.active && !localPlay();
}

/**
 * « Jouer en local » (Menu système > Communauté, localplay.ts) : toute la partie sociale retirée,
 * niveaux compris. Le réseau des bornes est arrêté (social-net.ts) ; ici, ce qui se montre.
 */
function localPlay(): boolean {
  return socialNet.state().localPlay === true;
}

/** La Communauté est fermée : mode invité, ou jeu local. */
function socialClosed(): boolean {
  return guest.active || localPlay();
}

/** Le médaillon Communauté est choisi dans la roue. */
function onCommunity(): boolean {
  return communityShown() && state.medallion === 'community' && !attractTable();
}

/**
 * Le médaillon Arène est dans la roue (réglage « Arène dans la roue ») ; comme la Communauté, jamais
 * en mode invité ni en jeu local (« Jouer en local » retire toute la partie sociale, niveaux compris).
 */
function arenaShown(): boolean {
  return mediaSettings.arena && !socialClosed();
}

/** Le médaillon Arène est choisi dans la roue. */
function onArena(): boolean {
  return arenaShown() && state.medallion === 'arena' && !attractTable();
}

/**
 * Le médaillon Collections est dans la roue (réglage « Collections dans la roue ») ; pas quand le
 * mode invité impose une collection ou ferme le choix des collections.
 */
function collectionsShown(): boolean {
  return mediaSettings.collectionsMedallion && !collections.locked() && guest.allows('menu.collections');
}

/** Le médaillon Collections est choisi dans la roue. */
function onCollections(): boolean {
  return collectionsShown() && state.medallion === 'collections' && !attractTable();
}

/** Un médaillon (Juke-box, Communauté, Arène, Collections) est choisi : rien de ce qui parle d'une table ne s'applique. */
function onMedallion(): boolean {
  return onJukebox() || onCommunity() || onArena() || onCollections();
}

/**
 * Les médaillons en tête de la roue, dans l'ordre : le Juke-box, la Communauté, l'Arène (21/11/2026),
 * puis les Collections (le plus près des tables).
 */
function wheelLeads(): Medallion[] {
  return [
    ...(jukeboxShown() ? (['jukebox'] as const) : []),
    ...(communityShown() ? (['community'] as const) : []),
    ...(arenaShown() ? (['arena'] as const) : []),
    ...(collectionsShown() ? (['collections'] as const) : []),
  ];
}

function selectedMedallion(): Medallion | undefined {
  return onJukebox() ? 'jukebox' : onCommunity() ? 'community' : onArena() ? 'arena' : onCollections() ? 'collections' : undefined;
}

/**
 * La roue passe sur cette table : son rang, et plus aucun médaillon choisi. Tout ce qui agit sur une
 * table (la jouer, l'installer, la reprendre après une relance) passe par là : un médaillon resté
 * choisi dessus donnait son nom au chargement et la roue revenait sur lui après la partie (installée
 * depuis la Bibliothèque pendant que la roue montrait la Communauté, 17/11/2026). Garder le médaillon
 * en changeant de rang est un choix qui se dit sur la ligne (« garde le médaillon : <raison> »).
 */
function pointAtTable(table: TableEntry | number): void {
  const index = typeof table === 'number' ? table : tables.indexOf(table);
  state = { ...state, index: Math.max(0, index), medallion: undefined };
}

/** Ce que le menu dit du médaillon Collections : combien il y en a, et celle que montre la roue. */
function collectionsCard() {
  const list = collections.list().filter((c) => c.tables.length);
  const shown = collections.current();
  return { title: t('Collections'), subtitle: [tn(list.length, '{n} collection', '{n} collections'), t('Affichée : {collection}', { collection: shown.label })].join(' · '), collectionsMedallion: true, favorite: false, plays: 0 };
}

/**
 * Start sur le médaillon Collections : la liste des collections (la même que Menu système ›
 * Collections) ; Start sur l'une l'affiche sur la roue, sur sa table ; Exit revient au médaillon.
 */
function openCollectionsMedallion(): void {
  if (!guest.knock('menu.collections')) return;
  cancelWheelPress();
  collectionsItem.openFromWheel(
    () => library.leave(),
    () => {
      state = { ...state, medallion: undefined };
      library.leave();
      playUiSound('solenoid');
    },
  );
  broadcast();
}

/** Ce que le menu dit du médaillon Communauté : joueurs en ligne, amis en ligne. */
function communityCard() {
  const s = communityMenu.summary();
  // Les joueurs en ligne au-delà de cinq seulement (shownCrowd) ; mes amis en ligne, toujours.
  const online = shownCrowd(s.online);
  const parts = socialNet.state().enabled ? [...(online ? [tn(online, '{n} joueur en ligne', '{n} joueurs en ligne')] : []), ...(s.friends ? [tn(s.friends, '{n} ami', '{n} amis')] : [])] : [t('Partage désactivé')];
  return { title: t('Communauté'), subtitle: parts.length ? parts.join(' · ') : t('Joueurs, salons, classements.'), community: true, favorite: false, plays: 0 };
}

/** Start sur le médaillon Communauté : l'accueil (Joueurs en ligne, Messages, Salon, Classements) ; Exit revient à la roue. */
function openCommunity(): void {
  if (!guest.knock('menu.system')) return;
  cancelWheelPress();
  communityMenu.openHome(() => library.leave());
  broadcast();
}

/** Ce que le menu dit du médaillon Arène : mon niveau, les parties ouvertes sur mes tables. */
function arenaCard() {
  const c = arenaMenu.card();
  return { title: c.title, subtitle: c.subtitle, arena: true, favorite: false, plays: 0 };
}

/** Start sur le médaillon Arène : son écran à onglets (arena-menu.ts) ; Exit revient à la roue. */
function openArena(): void {
  if (!guest.knock('menu.system')) return;
  cancelWheelPress();
  arenaMenu.openHome(() => library.leave());
  broadcast();
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
  // Retour de la gestion : le lecteur gardé en fond ne se ferme pas au passage (la lecture reprend).
  if (state.phase === 'library') {
    reopeningJukebox = true;
    try {
      library.leave();
    } finally {
      reopeningJukebox = false;
    }
  }
  cancelWheelPress();
  const fresh = !jukeboxPlayer.active();
  state = { ...state, phase: 'jukebox', help: false, message: undefined, medallion: 'jukebox' };
  jukeboxPlayer.open(playlist);
  broadcast();
  if (fresh) diagnosePlayfield('Juke-box');
}

/**
 * Une ligne du journal sur le playfield, à l'ouverture du Juke-box ou de sa gestion : l'écran (zone, zone
 * de travail, mise à l'échelle, rotation), la fenêtre et son contenu, la page (taille, devicePixelRatio).
 * Une fenêtre qui ne couvre pas exactement son écran s'y recale, et le journal le dit (lecteur rogné à
 * droite sur une borne à plusieurs mises à l'échelle, 10/11/2026).
 */
function diagnosePlayfield(label: string): void {
  const win = windows.get('playfield');
  if (!win || win.isDestroyed()) return;
  const report = recoverExact(win) ?? coverReport(win).text;
  const line = (page?: number[]) =>
    console.log(`${label} : playfield, ${report}${page ? ` ; page ${page[0]} × ${page[1]}, devicePixelRatio ${page[2]}${page[3]! > page[0]! + 1 || page[4]! > page[1]! + 1 ? `, contenu ${page[3]} × ${page[4]} : déborde` : ''}` : ''}.`); // i18n-ignore : journal
  win.webContents
    .executeJavaScript('[innerWidth, innerHeight, devicePixelRatio, document.documentElement.scrollWidth, document.documentElement.scrollHeight]')
    .then((page: number[]) => line(page))
    .catch(() => line());
}

/** Le Juke-box se rouvre depuis sa gestion : broadcast ne ferme pas le lecteur gardé en fond. */
let reopeningJukebox = false;

// VPX corrigé posé dès le démarrage (vpx-corrige.ts), avant le premier relevé de la fiche et de la santé.
installVpxCorrigeAtStartup(vpxInstall(loc), path.join(__dirname, '..'));
prepareVpxClr(vpxInstall(loc)?.exe);
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
  // Pendant une partie, seulement les réglages en partie ouverts (VPX a les boutons sinon).
  button: (b, down, repeat) => (state.phase === 'playing' ? down && inGameMenu.isOpen() && inGameMenu.button(b, repeat) : remoteButton(b, down, repeat)),
  entries: (opts) => remoteEntries(opts?.media),
  menus: () => library.remoteMenus(),
  open: (id) => remoteOpen(id),
  // Classements au téléphone (remote-ranks.ts) : le tableau des scores de la borne, en lecture seule ;
  // la table choisie sur la roue ou lancée d'abord ; en mode invité, la porte et la collection de la borne.
  ranks: createRemoteRanks({
    tables: () => (guest.active && collections.locked() ? collections.shelf(false).tables : tables),
    current: () => playing ?? tables[state.index],
    scores: (table, period) => tableScores.board(table, period),
    rankings: (table, scope, period) => tableRankings.view(table, scope, period),
    closed: () => (guest.allows('sheet.scores') ? undefined : t('Fermés en mode invité.')),
    images: phoneRemote.images,
    // « Toutes les tables » : le calcul de l'écran « Tables » de la borne (rankings-menu.ts).
    all: (scope, period) => remoteAllTables(scope, period),
  }),
  // Messagerie pendant une partie : lire et répondre au téléphone, sans toucher aux boutons de VPX ; jamais en mode invité.
  chat: () => (guest.active ? undefined : chatMenu.remoteChat()),
  // Juke-box au téléphone : le lecteur de la borne, ses commandes comme des clics à la borne.
  jukebox: () => remoteJukebox(),
  jukeboxAct: (op, key, fraction) => remoteJukeboxAct(op, key, fraction),
  // Communauté au téléphone (messages, amis) : au menu, et pendant une partie si le réglage le permet ; jamais en mode invité.
  community: (open, profile, room, page) => remoteCommunity(open, profile, room, page),
  activityAct: (act, ref) => remoteActivityAct(act, ref),
  profileAct: (key, act) => remoteProfileAct(key, act),
  friendAnswer: (key, yes) => remoteFriendAnswer(key, yes),
  groupAct: (act, g, key) => remoteGroupAct(act, g, key),
  instantAct: (act, opts) => remoteInstantAct(act, opts),
  roomSend: (text, room) => remoteRoomSend(text, room),
  roomAct: (room, line, act, reason) => remoteRoomAct(room, line, act, reason),
  chatSend: (key, text) => {
    if (!phoneMayWrite()) return;
    if (key.startsWith('g:')) groupService.send(key.slice(2), text);
    else chatService.send(key, text);
  },
  // « En train d'écrire » depuis un champ du téléphone (typing.ts) : chaque service vérifie l'ami, le groupe, le salon.
  typing: (key, on, room) => {
    if (on && !phoneMayWrite()) return;
    if (key === undefined) {
      if (guest.active || !socialNet.state().enabled) return;
      const r = roomsMenu.remote(room);
      socialNet.roomTyping(r.room, on && !r.blocked);
    } else if (key.startsWith('g:')) groupService.typing(key.slice(2), on);
    else chatService.typing(key, on);
  },
  chatReact: (key, target, kind) => {
    if (!phoneMayWrite() || !(CHAT_REACTIONS as readonly string[]).includes(kind)) return;
    if (key.startsWith('g:')) groupService.react(key.slice(2), target, kind as Reaction);
    else chatService.react(key, target, kind as ChatReaction);
  },
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
  uploaded: (name) => showBanner(tLater('Reçu du téléphone : {name}, dans le dossier d’import', { name }), 'add-table'),
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

/** Le Juke-box pour l'onglet du téléphone : le lecteur ouvert (même en fond, pendant sa gestion), sinon le médaillon. */
function remoteJukebox(): RemoteJukebox {
  const card = jukeboxCard();
  if (state.phase === 'loading' || state.phase === 'playing') return { open: false, title: card.title, detail: card.subtitle, reason: t('Après la partie') };
  if (!jukeboxShown()) return { open: false, title: card.title, reason: t('Masqué de la roue : réglage « Juke-box dans la roue »') };
  const view = jukeboxPlayer.remoteView(REMOTE_ENTRIES_MAX);
  const time = jukeboxPlayer.time();
  return { open: Boolean(view), title: card.title, detail: card.subtitle, ...(view ? { view } : {}), ...(time ? { time } : {}) };
}

/**
 * Une commande du Juke-box venue du téléphone, comme un clic ou un bouton à la borne : ouvrir le
 * Juke-box (comme Start sur le médaillon, mêmes portes), une ligne (la choisir, ou l'ouvrir), lire
 * un morceau d'un toucher, remonter, pause, aléatoire, répétition, avancer, précédent, suivant, la
 * gestion, quitter.
 */
function remoteJukeboxAct(op: RemoteJukeboxOp, key?: string, fraction?: number): void {
  if (!remoteWakes() || state.phase === 'loading' || state.phase === 'playing' || !jukeboxShown()) return;
  if (op === 'open') {
    if (state.phase === 'jukebox') return;
    if (state.phase === 'menu' && !guest.knock('menu.choose')) return;
    return openJukebox();
  }
  // La gestion : déjà ouverte, rien ; lecteur fermé, elle s'ouvre comme depuis le menu système.
  if (op === 'manage' && state.phase === 'library') return;
  if (op === 'manage' && !jukeboxPlayer.active()) {
    const menu = jukeboxMenu();
    if (!menu || !guest.knock('menu.system')) return;
    cancelWheelPress();
    menu.open();
    return void broadcast();
  }
  if (!jukeboxPlayer.active()) return;
  // Le lecteur en fond pendant sa gestion : il revient d'abord à l'écran, comme au retour de la gestion.
  if (state.phase !== 'jukebox') openJukebox();
  switch (op) {
    case 'row':
      if (key) jukeboxPlayer.click({ op: 'row', key });
      break;
    case 'play': {
      // Un morceau touché au téléphone se lit d'un coup : choisi, puis Start, comme deux touchers à la borne.
      if (!key) break;
      const before = jukeboxPlayer.state();
      const chosen = before?.level === 'tracks' && before.selected[before.shown] === key;
      jukeboxPlayer.click({ op: 'row', key });
      if (before?.level === 'tracks' && !chosen && !isJukeboxAction(key)) jukeboxPlayer.click({ op: 'row', key });
      break;
    }
    case 'seek':
      if (fraction !== undefined) jukeboxPlayer.click({ op: 'seek-to', fraction });
      break;
    case 'next':
    case 'prev':
      jukeboxPlayer.skip(op === 'next' ? 1 : -1);
      break;
    default:
      jukeboxPlayer.click({ op });
  }
  broadcast();
}

/** Le téléphone peut-il écrire : jamais en mode invité ; pendant une partie, seulement si « Messagerie au téléphone pendant la partie » le permet. */
function phoneMayWrite(): boolean {
  if (guest.active) return false;
  const playing = state.phase === 'loading' || state.phase === 'playing';
  return !playing || chatService.state().phoneInGame;
}

/** En tête de la page du téléphone : l'écran du menu affiché et ce qui y est choisi. */
function remoteScreen(): { title: string; item?: string; zone?: string } {
  if (state.phase === 'loading' || state.phase === 'playing') return { title: playing?.title ?? tables[state.index]?.title ?? t('Partie en cours') };
  if (state.phase === 'library') return library.remoteScreen() ?? { title: t('Menu système') };
  if (state.phase === 'message') return { title: state.message?.title ?? '' };
  if (state.phase === 'confirmQuit') return { title: t('Quitter Cyber Pinball ?') };
  // Juke-box : MagnaSave y passe à la playlist suivante, dans une playlist ouverte et si la borne a ce bouton.
  if (state.phase === 'jukebox') return { title: t('Juke-box'), ...(jukeboxPlayer.level() === 'tracks' && collectionKeys().next.length ? { zone: t('Playlist suivante') } : {}) };
  // La roue : la collection active, la table choisie ; MagnaSave y passe à la collection suivante.
  return { title: collections.current().label || t('Écran des tables'), item: tables[state.index]?.title, zone: collections.locked() ? undefined : t('Collection suivante') };
}

// --- Accès direct depuis le téléphone (remote-menus.ts) ---------------------------------------
// Le téléphone montre l'écran de la borne et ses entrées, et tous les menus ; chaque geste passe par
// le même chemin qu'un clic ou un bouton de la borne (portes du mode invité comprises).

/** Un toucher sur la liste du téléphone : comme un clic à la borne, il met d'abord fin au mode attente (et à l'ouverture). */
function remoteWakes(): boolean {
  const noticed = hours.activity();
  if (attract.activity() || noticed) {
    leaveAttract();
    return false;
  }
  if (state.phase === 'intro') {
    leaveIntro();
    return false;
  }
  return true;
}

/** Un appui bref d'un bouton de la borne, pour une entrée du téléphone qui le remplace (Start, Exit d'un message). */
function remotePress(b: 'confirm' | 'exit'): void {
  remoteButton(b, true, false);
  remoteButton(b, false, false);
}

/** L'écran que montre la borne, pour la liste du téléphone. */
function remoteEntries(media = false): MenuEntries {
  const none = (title: string, note: string): MenuEntries => ({ kind: 'none', title, items: [], current: -1, note });
  if (state.phase === 'loading') return none(remoteScreen().title, t('La partie se charge.'));
  if (state.phase === 'playing') return inGameEntries();
  if (state.phase === 'library') return library.remoteEntries() ?? none(t('Menu système'), '');
  if (state.phase === 'menu') return wheelEntries(media);
  if (state.phase === 'jukebox') return none(t('Juke-box'), t('Le Juke-box se pilote dans l’onglet Juke-box du téléphone, ou avec les boutons : flippers pour choisir, Start pour écouter, Exit pour revenir à la roue.'));
  if (state.phase === 'intro') return { kind: 'none', title: t('Ouverture'), items: [{ label: t('Passer l’ouverture'), icon: 'chevron-right', pick: () => void remoteWakes() }], current: -1 };
  if (state.phase === 'confirmQuit') {
    const items: MenuEntry[] = [
      { ...toRemoteEntry({ label: t('Quitter Cyber Pinball'), icon: 'exit', ...(guest.allows('shortcut.quit') ? {} : { tone: 'quiet', detail: t('Fermé en mode invité') }) }), pick: () => remotePress('confirm') },
      { ...toRemoteEntry({ label: t('Annuler'), icon: 'back', back: true }), pick: () => remotePress('exit') },
    ];
    return { kind: 'screen', title: t('Quitter Cyber Pinball ?'), items, current: -1 };
  }
  // Un message : Start fait son action (si sa porte est ouverte), Exit le ferme ; rien pendant une extinction.
  const message = state.message;
  if (!message || message.action === 'power') return none(message?.title ?? '', t('Rien à faire ici depuis le téléphone.'));
  const items: MenuEntry[] = [];
  if (message.action && guest.allows(MESSAGE_DOORS[message.action])) items.push({ ...toRemoteEntry({ label: t('Valider (Start)'), detail: message.lines[0], icon: 'start' }), pick: () => remotePress('confirm') });
  if (message.report && library.feedback) {
    const r = message.report;
    items.push({
      ...toRemoteEntry(
        r.notified
          ? { label: t('Ajouter des détails pour les développeurs'), detail: t('Ils ont été prévenus de ce plantage'), icon: 'edit' }
          : { label: t('Envoyer un rapport aux développeurs'), detail: t('Chiffré, anonymisé, ce problème rappelé'), icon: 'report' },
      ),
      pick: () => openFailureReport(r),
    });
  }
  items.push({ ...toRemoteEntry({ label: t('Fermer (Exit)'), icon: 'close', back: true }), pick: () => remotePress('exit') });
  return { kind: 'screen', title: message.title, items, current: -1 };
}

/**
 * Partie échouée : « Envoyer un rapport aux développeurs », ou « Ajouter des détails » quand le rapport
 * automatique est déjà parti. En revenant, la question des rapports automatiques si elle reste à poser
 * (premier plantage), sinon la roue.
 */
function openFailureReport(r: NonNullable<Message['report']>): void {
  const feedback = library.feedback;
  if (!feedback) return;
  const back = () => (r.consent && feedback.consent() === 'ask' ? feedback.askConsent(r.signature, r.table, r.about, () => library.leave()) : library.leave());
  feedback.openSendReport({ about: r.about, table: r.table, signature: r.signature, ...(r.notified ? { notified: true } : {}) }, back);
}

/**
 * Le menu des tables : le médaillon du Juke-box s'il est dans la roue, puis les tables de la
 * collection montrée. Toucher une table la choisit sur la roue ; la toucher encore fait Start
 * (sa fiche, ou la partie en « jouer directement »).
 */
function wheelEntries(media = false): MenuEntries {
  const shelf = collections.shelf();
  const choose = guest.allows('menu.choose');
  const items: MenuEntry[] = [];
  const leads = wheelLeads();
  if (leads.includes('jukebox')) items.push({ ...toRemoteEntry({ label: t('Juke-box'), detail: jukeboxCard().subtitle, icon: 'jukebox' }), pick: () => remotePickJukebox() });
  if (leads.includes('community')) items.push({ ...toRemoteEntry({ label: t('Communauté'), detail: communityCard().subtitle, icon: 'friends' }), pick: () => remotePickCommunity() });
  if (leads.includes('arena')) items.push({ ...toRemoteEntry({ label: t('Arène'), detail: arenaCard().subtitle, icon: 'trophy' }), pick: () => remotePickArena() });
  if (leads.includes('collections')) items.push({ ...toRemoteEntry({ label: t('Collections'), detail: collectionsCard().subtitle, icon: 'star' }), pick: () => remotePickCollections() });
  for (const table of shelf.tables) {
    const file = table.file;
    // Les images de la table, lues à la demande dans les médias de la borne (une table ajoutée a les siennes) :
    // son médaillon toujours ; l'image de son fronton seulement quand le téléphone montre la grille.
    const wheel = medias?.wheel(table);
    const backglass = media ? medias?.roleMedia(table, 'backglass') : undefined;
    const art = { ...(wheel ? { wheel } : {}), ...(backglass?.kind === 'image' && backglass.url ? { media: backglass.url } : {}) };
    items.push({ ...toRemoteEntry({ label: table.title, detail: [table.manufacturer, table.year].filter(Boolean).join(' · '), ...(choose ? {} : { tone: 'quiet' }) }), ...(art.wheel || art.media ? { art } : {}), pick: () => remotePickTable(file) });
  }
  // Les collections de la roue, à choisir au téléphone comme MagnaSave à la borne ; imposée en mode invité.
  const list = collections.list().filter((c) => c.tables.length);
  const shown = collections.current();
  const locked = collections.locked() ? t('Collection imposée en mode invité') : undefined;
  const choices = {
    items: list.map((c) => ({ label: c.label, detail: tn(c.tables.length, '{n} table', '{n} tables'), ...(locked ? {} : { pick: () => remoteChooseCollection(c.id) }) })),
    current: list.findIndex((c) => c.id === shown.id),
    ...(locked ? { locked } : {}),
  };
  const chosen = selectedMedallion();
  const current = chosen ? leads.indexOf(chosen) : shelf.tables.length ? leads.length + shelf.index : -1;
  const again = wheelPlays() ? t('Touche une table pour la choisir, puis touche-la encore pour jouer.') : t('Touche une table pour la choisir, puis touche-la encore pour ouvrir sa fiche.');
  return { kind: 'wheel', title: collections.current().label || t('Écran des tables'), icon: 'tables', items, current, note: items.length ? again : t('Aucune table dans cette collection.'), collections: choices };
}

/** Une collection choisie au téléphone : comme un clic sur la ligne de la liste des collections à la borne. */
function remoteChooseCollection(id: string): void {
  if (!remoteWakes() || state.phase !== 'menu') return;
  if (collections.choose(id)) {
    state = { ...state, medallion: undefined };
    playUiSound('solenoid');
  }
  broadcast();
}

/** Une table touchée au téléphone : choisie sur la roue, ou, déjà choisie, Start. */
function remotePickTable(file: string): void {
  if (!remoteWakes() || state.phase !== 'menu') return;
  const index = tables.findIndex((x) => x.file === file);
  if (index < 0) return;
  if (index === state.index && !onMedallion()) {
    wheelConfirm(tables[index]!, !wheelPlays());
    return void broadcast();
  }
  if (!guest.knock('menu.choose')) return;
  const shelf = collections.shelf();
  const at = shelf.tables.findIndex((x) => x.file === file);
  if (at < 0) return;
  const picked = collections.move(at - shelf.index);
  pointAtTable(picked ?? index);
  playUiSound('solenoid');
  broadcast();
}

/** Le médaillon du Juke-box touché : choisi, ou, déjà choisi, ouvert. */
function remotePickJukebox(): void {
  if (!remoteWakes() || state.phase !== 'menu' || !jukeboxShown()) return;
  if (onJukebox()) return void openJukebox();
  if (!guest.knock('menu.choose')) return;
  state = { ...state, medallion: 'jukebox' };
  playUiSound('solenoid');
  broadcast();
}

/** Les joueurs en ligne qui ne sont pas mes amis, pour « Joueurs » au téléphone : jamais la table, leur pays en clair. */
/** La Communauté au téléphone : conversations, fil ouvert, Joueurs et profil ouvert ; jamais en mode invité. */
function remoteCommunity(open: string | undefined, profile: string | undefined, room: string | undefined, page: RemotePage | undefined): RemoteCommunity {
  if (guest.active) return { closed: t('Fermée en mode invité.'), unread: 0, rows: [] };
  if (localPlay()) return { closed: t('Retirée : la borne joue en local (Menu système › Communauté › Réglages de la communauté › Jouer en local).'), unread: 0, rows: [] };
  // Mes groupes en tête des conversations ; leur fil s'ouvre par « g:<id> ».
  const groups = groupsMenu.remote(open);
  const chat = chatMenu.remoteCommunity(open?.startsWith('g:') ? undefined : open);
  // Joueurs (demandes, filtres, groupes) et le profil ouvert : phone-community.ts.
  const shown = profile ? phoneCommunity.profile(profile) : undefined;
  return { ...chat, rows: [...groups.rows, ...chat.rows], unread: chat.unread + groups.unread, ...(groups.thread ? { thread: groups.thread } : {}), people: communityMenu.remotePeople(REMOTE_ENTRIES_MAX), ...(shown ? { profile: shown } : {}), ...remoteRoom(room), groups: groupsMenu.remoteGroups(), instant: instantMenu.remote(), ...remoteLevel(page) };
}

/** Mon niveau en résumé, la page de niveau ouverte au téléphone, et la cloche de l'Activité récente (son journal quand sa feuille est ouverte). */
function remoteLevel(page: RemotePage | undefined) {
  const shown = page === 'level' || page === 'badges' || page === 'rules' ? { page: { kind: page, view: levelMenu.remotePage(page) } } : {};
  return { level: levelMenu.remoteSummary(), activity: activityMenu.remote(page === 'activity'), ...shown };
}

/** Une ligne de l'Activité récente touchée au téléphone (activity-menu.ts), ou tout effacer ; jamais en mode invité. */
function remoteActivityAct(act: 'open' | 'clear', ref: string | undefined): void {
  if (guest.active) return;
  if (act === 'clear') return activityMenu.remoteClear();
  // Un écran à la borne : pas pendant une partie.
  if (ref && !remoteBusy()) activityMenu.remoteOpen(ref, () => library.leave());
}

/** « Toutes les tables » au téléphone : le calcul de l'écran « Tables » de la borne (rankings-menu.ts). */
function remoteAllTables(scope: RankingScope, period: ScorePeriod): RemoteAllTables {
  return rankingsMenu.remoteTables(scope, period);
}

/** Un geste fait au téléphone sur un groupe (groups-menu.ts, remoteAct) ; jamais en mode invité. */
function remoteGroupAct(act: RemoteGroupAct, g: string | undefined, key: string | undefined): void {
  if (!guest.active) groupsMenu.remoteAct(act, g, key, () => library.leave());
}

/** Un geste fait au téléphone sur les parties en direct (instant-menu.ts, remoteAct) ; jamais en mode invité. */
function remoteInstantAct(act: RemoteInstantAct, opts: { id?: string; table?: string; count?: number; key?: string }): void {
  if (!guest.active) instantMenu.remoteAct(act, opts, () => library.leave());
}

/** Pourquoi la borne n'ouvre pas d'écran pour le téléphone en ce moment (une partie) ; undefined : elle peut. */
function remoteBusy(): string | undefined {
  return state.phase === 'playing' || state.phase === 'loading' ? t('Pendant une partie : à la fin de celle-ci') : undefined;
}

/** Une action du profil montré au téléphone (phone-community.ts) ; jamais en mode invité. */
function remoteProfileAct(key: string, act: string): void {
  if (!guest.active) phoneCommunity.act(key, act);
}

/** Accepter ou refuser une demande d'ami depuis Joueurs ; jamais en mode invité. */
function remoteFriendAnswer(key: string, yes: boolean): void {
  if (!guest.active) phoneCommunity.answer(key, yes);
}

/** Le salon par pays pour le téléphone (rooms-menu.ts) : celui ouvert à la borne, sinon le salon par défaut. */
function remoteRoom(room: string | undefined) {
  return socialNet.state().enabled ? { room: roomsMenu.remote(room) } : {};
}

/** Une ligne écrite au téléphone dans ce salon ; jamais en mode invité. */
function remoteRoomSend(text: string, room: string | undefined): void {
  if (guest.active || !socialNet.state().enabled) return;
  const r = roomsMenu.remote(room);
  if (!r.blocked) roomsMenu.write(r.room, text);
}

/** Un geste fait au téléphone sur une ligne d'un salon (rooms-menu.ts, remoteAct) ; jamais en mode invité. */
function remoteRoomAct(room: string, line: string, act: string, reason: string | undefined): void {
  if (guest.active || !socialNet.state().enabled) return;
  roomsMenu.remoteAct(room, line, act, reason);
}

/** Le médaillon Communauté touché au téléphone : choisi, ou, déjà choisi, ouvert. */
function remotePickCommunity(): void {
  if (!remoteWakes() || state.phase !== 'menu' || !communityShown()) return;
  if (onCommunity()) return void openCommunity();
  if (!guest.knock('menu.choose')) return;
  state = { ...state, medallion: 'community' };
  playUiSound('solenoid');
  broadcast();
}

/** Le médaillon Arène touché au téléphone : choisi, ou, déjà choisi, ouvert (son écran à onglets, à la borne). */
function remotePickArena(): void {
  if (!remoteWakes() || state.phase !== 'menu' || !arenaShown()) return;
  if (onArena()) return void openArena();
  if (!guest.knock('menu.choose')) return;
  state = { ...state, medallion: 'arena' };
  playUiSound('solenoid');
  broadcast();
}

/** Le médaillon Collections touché au téléphone : choisi, ou, déjà choisi, ouvert (la liste des collections). */
function remotePickCollections(): void {
  if (!remoteWakes() || state.phase !== 'menu' || !collectionsShown()) return;
  if (onCollections()) return void openCollectionsMedallion();
  if (!guest.knock('menu.choose')) return;
  state = { ...state, medallion: 'collections' };
  playUiSound('solenoid');
  broadcast();
}

/**
 * Pendant une partie : les réglages en partie, s'ils sont ouverts (lignes à toucher, boutons du
 * téléphone actifs), sinon de quoi les ouvrir, comme les deux MagnaSave (ou pourquoi c'est impossible).
 */
function inGameEntries(): MenuEntries {
  const title = remoteScreen().title;
  const open = inGameMenu.remote();
  if (open) return { kind: 'ingame', title: open.title, note: open.note, items: open.items.map((i) => ({ ...toRemoteEntry({ label: i.label, detail: i.detail, tone: i.quiet ? 'quiet' : undefined }), ...(i.pick ? { pick: i.pick } : {}) })), current: open.current, buttons: true };
  return { kind: 'none', title, items: [], current: -1, note: t('Les commandes reviennent à la fin de la partie.'), inGame: inGameMenu.openable() };
}

/**
 * Un menu ouvert directement depuis le téléphone, par son identifiant : une entrée ou une rubrique
 * du menu système (fermé à l'invité), le menu des tables, ou les réglages en partie. Un identifiant
 * inconnu, un menu fermé, une partie en cours (hors réglages en partie) : rien.
 */
function remoteOpen(id: string): void {
  const target = remoteMenuTarget(id);
  if (!target) return void console.log('Télécommande : menu inconnu demandé, ignoré.'); // i18n-ignore : journal
  if (target.kind === 'in-game') {
    if (state.phase === 'playing' && inGameMenu.openable() === true && !inGameMenu.isOpen()) inGameMenu.open();
    return;
  }
  if (state.phase === 'playing' || state.phase === 'loading') return;
  // Extinction, veille ou redémarrage en cours : rien ne s'ouvre plus (comme la roue dentée).
  if (state.phase === 'message' && state.message?.action === 'power') return;
  if (!remoteWakes()) return;
  if (target.kind === 'wheel') {
    // La roue, d'où qu'on soit au menu (le Juke-box se ferme au redessin, comme par Exit).
    if (state.phase === 'library') library.leave();
    else if (tables.length && (state.phase === 'jukebox' || state.phase === 'confirmQuit' || state.phase === 'message')) state = { ...state, phase: 'menu', message: undefined, help: false };
    return void broadcast();
  }
  // Le menu système : fermé à l'invité ; le téléphone ne déverrouille rien (et la borne ne montre pas de cadenas pour lui).
  if (!guest.allows('menu.system')) return void console.log('Télécommande : menu système fermé en mode invité, rien d’ouvert.'); // i18n-ignore : journal
  state = { ...state, help: false };
  if (!library.openSystemEntry(target.id)) console.log(`Télécommande : « ${id} » non fourni sur cette borne, rien d’ouvert.`); // i18n-ignore : journal
  broadcast();
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
  library: { ...library, openSystem: () => openCabinetSetup(4) },
  relaunch: (newConfiguration) => (newConfiguration ? relaunchWizard(undefined, true) : relaunchMenu()),
});
// Langue de l'interface : dans Ma borne > Configuration de la borne (cabinetSetupItems, 20/11/2026) ; le
// choix relance le menu, comme un changement de configuration. Son « Retour » ramène à la configuration.
const languageItem = createLanguageMenu({ library: { ...library, openSystem: () => openCabinetSetup(3) }, relaunch: () => relaunchMenu() });
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
    return t('Boutons, écrans, son, langue, configurations, ou l’assistant complet');
  },
  // Le sous-menu porte la pastille de ses entrées.
  get attention() {
    return cabinetSetupItems().some((i) => i.attention);
  },
  run: () => openCabinetSetup(),
});

/** Une étape de l'assistant, refaite seule ; elle revient au menu, enregistrée ou non. */
function wizardStepItem(id: (typeof WIZARD_STEPS)[number]['id']): SystemItem {
  const step = WIZARD_STEPS.find((s) => s.id === id)!;
  return { label: step.label, detail: step.detail, icon: step.icon, run: () => relaunchWizard(step.flag) };
}

/**
 * « Boutons » de la Configuration de la borne : chaque relevé de l'assistant, puis la remise aux
 * touches par défaut, refusée sur une borne à joystick, confirmée ailleurs (buttons-reset.ts).
 */
function buttonSetupItems(): SystemItem[] {
  const check = resetCheck();
  const backup = buttonsBackup();
  return [
    ...(['boutons', 'interface', 'lanceur', 'tilt'] as const).map(wizardStepItem),
    ...(backup
      ? [{ label: t('Rétablir les boutons d’avant'), detail: t('Relevé remplacé le {date} par les touches par défaut des encodeurs', { date: formatDateTime(backup.at) }), icon: 'restore' as const, run: () => restoreButtonsFromMenu() }]
      : []),
    {
      label: t('Touches par défaut des encodeurs'),
      detail: check.state === 'refused' ? t('Indisponible : les boutons de cette borne sont des boutons de joystick') : t('Pour une borne aux boutons de clavier ; demande confirmation'),
      icon: 'keyboard',
      ...(check.state === 'refused' ? { tone: 'quiet' as const } : {}),
      run: () => openButtonsReset(),
    },
  ];
}

/** « Écrans » de la Configuration de la borne : écrans, playfield, disposition, et l'écran du DMD quand la borne en a un. */
function screenSetupItems(): SystemItem[] {
  const dmd = dmdScreenItem();
  return [...(['ecrans', 'playfield', 'disposition'] as const).map(wizardStepItem), ...(dmd ? [dmd] : [])];
}

/**
 * Sous-menu « Configuration de la borne » (20/11/2026 : six lignes au lieu de treize) : Boutons et
 * Écrans regroupent leurs étapes, puis le son, la langue de la borne, les configurations et
 * l'assistant complet. Une étape qui attend l'utilisateur met sa pastille sur son groupe.
 */
function cabinetSetupItems(): SystemItem[] {
  const buttonsPart = buttonSetupItems();
  const screensPart = screenSetupItems();
  return [
    { label: t('Boutons'), detail: t('Boutons du jeu et de l’interface, lanceur analogique, tilt, touches par défaut'), icon: 'button', attention: buttonsPart.some((i) => i.attention), run: () => openCabinetPart('buttons') },
    { label: t('Écrans'), detail: t('Écrans, playfield, disposition, écran du DMD'), icon: 'screens', attention: screensPart.some((i) => i.attention), run: () => openCabinetPart('screens') },
    wizardStepItem('son'),
    { label: languageItem.label ?? t('Langue / Language'), detail: languageItem.detail, icon: 'language', run: () => languageItem.run() },
    // Copiée : ses accesseurs (la configuration active, lue sur le disque) sont lus une fois, ici.
    { ...configurations.systemItem },
    { label: t('Assistant complet'), detail: t('Toutes les étapes à la suite : boutons, écrans, playfield, disposition, son'), icon: 'wizard', run: () => relaunchWizard() },
  ];
}

/** Boutons ou Écrans de la Configuration de la borne ; « Retour » ramène à la configuration, sur ce groupe. */
function openCabinetPart(part: 'buttons' | 'screens'): void {
  // Lu à l'ouverture de l'écran (relevés, écrans, VPX) et gardé pour les touches qui suivent (library.kept).
  const items = () => library.kept(`cabinet:${part}`, () => (part === 'buttons' ? buttonSetupItems() : screenSetupItems()));
  const up = () => openCabinetSetup(part === 'buttons' ? 0 : 1);
  library.openCustom(
    () => ({
      heading: part === 'buttons' ? t('Boutons') : t('Écrans'),
      icon: part === 'buttons' ? 'button' : 'screens',
      subheading: SYSTEM_ITEMS.cabinet.label,
      lead: t('Chaque étape se refait seule, puis revient à l’écran des tables. Exit maintenu 2 s (ou le bouton « Quitter sans enregistrer » des boutons de l’interface) en sort sans rien changer, à toute étape.'),
      sections: [],
      actions: [...items().map((i) => ({ label: i.label, detail: i.detail, icon: i.icon, attention: i.attention, ...(i.tone ? { tone: i.tone } : {}), run: i.run })), { label: t('Retour'), icon: 'back', run: up }],
      back: up,
    }),
    Math.max(0, items().findIndex((i) => i.attention)),
  );
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

// « Écran du DMD » dans Borne > DMD : son retour ramène à la rubrique ; sans écran de DMD, grisée avec sa raison.
library.provideSystemItem('dmd-screen', {
  get detail() {
    const cabinet = loadCabinet(loc.dataDir);
    if (!cabinet?.roles.dmd) return t('Indisponible : la borne n’a pas d’écran de DMD (assistant d’écrans, étape « Disposition »)');
    return t('FullDMD 16:9 ou DMD seul : ce que montre l’écran du DMD');
  },
  get tone() {
    return loadCabinet(loc.dataDir)?.roles.dmd ? undefined : ('quiet' as const);
  },
  get attention() {
    const cabinet = loadCabinet(loc.dataDir);
    return Boolean(cabinet?.roles.dmd && dmdKindQuestion(cabinet));
  },
  run: () => (loadCabinet(loc.dataDir)?.roles.dmd ? openDmdScreen(() => library.openSystem()) : library.openSystem()),
});

/**
 * Écran « Écran du DMD » : l'état actuel (ambigu : « À vérifier »), puis les deux réponses avec
 * leur schéma. Start enregistre le choix (zone ajustée seulement si elle n'a pas la bonne forme,
 * withDmdKind) et relance le menu : ses fenêtres, VPinballX.ini et les PuP-Packs suivent.
 */
function openDmdScreen(back: () => void = () => openCabinetPart('screens')): void {
  library.openCustom(() => {
    const cabinet = loadCabinet(loc.dataDir);
    if (!cabinet?.roles.dmd) return { heading: t('Écran du DMD'), icon: 'dmd', sections: [], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
    const question = dmdKindQuestion(cabinet);
    const current = dmdKindOf(cabinet);
    const screen = dmdScreen(cabinet);
    const choices = dmdKindChoices(cabinet);
    const state = question
      ? { text: t('Le DMD occupe une zone {zone} de l’écran « {screen} » ({ratio}), qui ne montre rien d’autre. Est-ce un FullDMD ou un DMD seul ?', { zone: ratioLabel(question.zoneRatio), screen: question.screen, ratio: ratioLabel(question.screenRatio) }), tone: 'warning' as const }
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
    // DMD seul : une zone placée à la main est gardée telle quelle (withDmdKind), sinon une bande 4:1.
    const keepsZone = sameZone(roleZone(withDmdKind(cabinet, 'dmd'), 'dmd'), roleZone(cabinet, 'dmd'));
    const all: { kind: DmdKind; label: string; detail: string; icon: 'image' | 'dmd' }[] = [
      { kind: 'fulldmd', label: t('C’est un FullDMD'), detail: t('Tout l’écran 16:9 : média FullDMD, écran 5 des PuP-Packs, DMD du jeu incrusté'), icon: 'image' },
      { kind: 'dmd', label: t('C’est un DMD seul'), detail: keepsZone ? t('Garder la bande : le DMD du jeu seul, du noir autour') : t('Une bande 4:1 : le DMD du jeu seul, du noir autour'), icon: 'dmd' },
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

function openCabinetSetup(at?: number): void {
  library.openCustom(() => ({
    heading: SYSTEM_ITEMS.cabinet.label,
    icon: SYSTEM_ITEMS.cabinet.icon,
    lead: t('Chaque étape se refait seule, puis revient à l’écran des tables. Exit maintenu 2 s (ou le bouton « Quitter sans enregistrer » des boutons de l’interface) en sort sans rien changer, à toute étape.'),
    sections: [],
    // Lu à l'ouverture (relevés, écrans, VPX) et gardé pour les touches qui suivent (library.kept).
    actions: [...library.kept('cabinet:setup', cabinetSetupItems).map((i) => ({ label: i.label, detail: i.detail, icon: i.icon, attention: i.attention, ...(i.tone ? { tone: i.tone } : {}), run: i.run })), { label: t('Retour'), icon: 'back', run: () => library.openSystem() }],
    back: () => library.openSystem(),
    // La sélection va d'office sur l'entrée qui attend l'utilisateur (pastille rouge), sinon sur celle d'où l'on revient.
  }), at ?? Math.max(0, cabinetSetupItems().findIndex((i) => i.attention)));
}
/** Enregistre les réglages des médias et les applique (état renvoyé aux fenêtres). */
function saveMediaSettings(next: MenuMediaSettings): void {
  const reorder = next.tableOrder !== mediaSettings.tableOrder;
  mediaSettings = next;
  // Ordre changé : les tables se rangent autrement, la table choisie reste la même.
  if (reorder) {
    const current = tables[state.index];
    tables = sortTables(tables, next.tableOrder, shuffleKeys);
    state = { ...state, index: Math.max(0, current ? tables.indexOf(current) : 0) }; // garde le médaillon : la même table, rangée autrement
  }
  attract.reschedule();
  hours.update();
  try {
    saveMenuMediaSettings(loc.dataDir, mediaSettings);
  } catch (error) {
    console.log(`Médias : réglage non enregistré (${(error as Error).message}).`);
  }
  nightMode?.refresh();
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
// Mode nuit : l'écran des réglages (modenuit-menu.ts).
const nightModeMenu = createNightModeMenu({
  library,
  settings: () => mediaSettings.nightMode,
  save: (next) => saveMediaSettings({ ...mediaSettings, nightMode: next }),
  on: () => nightMode?.on() ?? false,
  toggle: () => nightMode?.toggle() ?? false,
  dofRefusal: () => nightMode?.dofRefusal(),
});
// Médias, son et attente (musique, volumes, mode attente, médias pendant la partie) : un écran à part.
const menuSettings = createMenuSettings({
  library,
  settings: () => mediaSettings,
  save: (next) => saveMediaSettings(next),
  output: () => menuOutput(),
  preview: (id) => playUiSound(id),
  wakeDevices: () => wakeDevices(),
  sleepAllowed: () => !powerUnavailable('sleep', power.capabilities()),
  intro: introMenu,
  nightMode: nightModeMenu,
  recording: {
    quality: () => library.kept('recording-quality', () => loadRecordingSettings(loc.dataDir).quality),
    setQuality: (quality) => {
      try {
        saveRecordingSettings(loc.dataDir, { ...loadRecordingSettings(loc.dataDir), quality });
        console.log(`Enregistrement : qualité ${quality}.`);
      } catch (error) {
        console.log(`Enregistrement : qualité non enregistrée (${(error as Error).message}).`);
      }
      broadcast();
    },
  },
});
library.provideSystemItem('menu-media', menuSettings.item);
// Borne > DMD : le DMD du menu et sa couleur, avec l'écran du DMD et le DMD réel (tous les réglages du DMD ensemble).
library.provideSystemItem('menu-dmd', menuSettings.menuDmd);
library.provideSystemItem('dmd-color', menuSettings.dmdColor);
// Roue des tables (Tables > Roue) : présentation, ordre, Start, logos animés, couleur, Juke-box ; dans medias.json aussi.
library.provideSystemItem('wheel', createWheelSettings({ library, settings: () => mediaSettings, save: (next) => saveMediaSettings(next) }));
// Réglages du Juke-box (Médias > Réglages du Juke-box, et depuis sa gestion) : sorties du son, visualiseur, médaillon.
const jukeboxSettings = createJukeboxSettings({
  library,
  settings: () => mediaSettings,
  save: (next) => saveMediaSettings(next),
  outputs: () => audioOutputs(),
  menuOutput: () => menuOutput(),
  place: (name) => jukeboxOutputPlace(name),
  test: (route) => {
    const win = windows.get('playfield');
    if (win && !win.isDestroyed()) win.webContents.send('jukebox-audio-test', route);
    console.log(`Juke-box : extrait d'essai sur « ${route.output || 'sortie par défaut'} ».`); // i18n-ignore : journal
  },
});
// Les réglages du Juke-box s'ouvrent depuis son écran (jukebox-menu.ts, openSettings) : plus d'entrée à part (20/11/2026).

/** Ce que la borne fait d'une sortie audio (étape « Son ») : fronton, playfield, sortie par défaut de Windows. */
function jukeboxOutputPlace(name: string): string | undefined {
  const audio = loadCabinet(loc.dataDir)?.audio;
  const places: string[] = [];
  for (const [role, label] of [['backglass', t('fronton')], ['playfield', t('playfield')]] as const) {
    const id = audio?.roles[role];
    const out = id ? audio!.outputs.find((o) => o.endpointId.toLowerCase() === id.toLowerCase()) : undefined;
    if (out && (out.lastSeen?.friendlyName ?? out.label) === name) places.push(label);
  }
  if (audioOutputs()?.find((o) => o.friendlyName === name)?.isDefault) places.push(t('sortie par défaut de Windows'));
  return places.length ? places.join(', ') : undefined;
}
// Pré-réglages de qualité de VPX (qualite-vpx.ts) : Auto, Performance, Équilibré, Qualité, Ultra.
library.provideSystemItem('vpx-presets', createVpxPresetsMenu({ library, dataDir: () => loc.dataDir, iniPath: () => activeVpxIni(loc) }).item);
// Cadrage des tables (cadrage-menu.ts) : le style de la borne, choisi sur une image de sa table rendue par VPX.
library.provideSystemItem(
  'vpx-framing',
  createFramingMenu({
    ...framingHost,
    library,
    sampleTable: () => [tables[state.index], ...tables].find((x) => x?.emulator === 'vpx' && fs.existsSync(x.file)),
    choose: (style) => {
      const cabinet = loadCabinet(loc.dataDir);
      if (!cabinet) return;
      saveCabinet(loc.dataDir, { ...cabinet, framing: style });
      // Le joueur vient de choisir : ses clés de cadrage sont réécrites, même changées à la main avant.
      syncConfiguration(observedDisplays(), profile, (id) => FRAMING_STYLE_KEYS.some((k) => id === ownedId('Player', k)));
    },
  }).item,
);
// VPX d'essai (vpx-essai.ts) : seulement avec la clé développeur de cette machine, sinon l'entrée n'existe pas.
if (trialVpxAllowedHere()) {
  library.provideSystemItem('vpx-trial', createVpxTrialMenu({ library, root: () => loc.root, dataDir: () => loc.dataDir, relaunch: () => relaunchMenu() }).item);
}
// Conditions d'utilisation : à accepter au démarrage tant que la version en cours ne l'est pas, à relire ici.
const termsMenu = createTermsMenu({ library, dataDir: loc.dataDir, quit: () => void quit() });
library.provideSystemItem('terms', termsMenu.systemItem);
// La communauté : les auteurs des tables de la borne, les logiciels, les sites (credits-menu.ts).
library.provideSystemItem('community', library.credits.systemItem);
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
  // Mise à jour automatique au lancement : jamais pendant une partie.
  busy: () => state.phase === 'loading' || state.phase === 'playing',
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
    return t('Les boutons du front-end et de la partie');
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
    // Le bouton « Bureau Windows » de la borne, s'il a été relevé : il ouvre le bureau, et le referme s'il est de joystick (watchDesktopButton).
    const own = KEYS.desktop[0];
    const button = own ? t('Bouton de la borne : {button}', { button: keyLabel(own) }) + ' · ' : '';
    const keys = own && joystickButton(own) ? formatList([t('{button} de nouveau', { button: keyLabel(own) }), shortcutLabel(SHORTCUTS.desktop)], 'or') : shortcutLabel(SHORTCUTS.desktop);
    return button + (startHoldCode()
      ? t('Libère tous les écrans du PC ; un appui long sur Start, {keys} ou le bouton de Cyber Pinball dans la barre des tâches ramène le front-end', { keys })
      : t('Libère tous les écrans du PC ; {keys} ou le bouton de Cyber Pinball dans la barre des tâches ramène le front-end', { keys }));
  },
  // Touches lues dans la définition du raccourci (SHORTCUTS) : celles que reconnaissent handleKey et le raccourci global.
  get shortcut() {
    return { keys: shortcutKeys(SHORTCUTS.desktop), matches: (input: Input) => matchesShortcut(input, SHORTCUTS.desktop) };
  },
  run: () => showDesktop(),
});
// Ferme et rouvre Cyber Pinball, le PC allumé : la même relance couverte que la langue ou une
// configuration (aucun écran ne montre le bureau entre les deux), avec l'ouverture du démarrage.
library.provideSystemItem('relaunch', {
  get detail() {
    return t('Ferme puis rouvre Cyber Pinball ; le PC reste allumé');
  },
  run: () => relaunchMenu(true),
});
// Relance par Start (start-relaunch.ts) : un appui long sur Start, bouton de joystick, rouvre
// Cyber Pinball fermé (veilleur au démarrage de Windows) ou le menu depuis le bureau.
library.provideSystemItem('start-relaunch', {
  get label() {
    if (shellSession()) return t('Relance par Start');
    return relaunchEnabled(loc.dataDir) ? t('Relance par Start : oui') : t('Relance par Start : non');
  },
  get detail() {
    if (shellSession()) return t('Inutile en borne dédiée : Cyber Pinball y est relancé de lui-même');
    if (!joystickStartCode(buttons)) return t('Start doit être un bouton de joystick (Pinscape, encodeur en mode manette) : relève-le dans l’étape « Boutons »');
    return relaunchEnabled(loc.dataDir)
      ? t('Appui long ({seconds} s) sur Start : rouvre Cyber Pinball fermé, ou le front-end depuis le bureau Windows', { seconds: START_HOLD_MS / 1000 })
      : t('Désactivée : Start ne rouvre pas Cyber Pinball depuis Windows');
  },
  get tone() {
    return shellSession() || !joystickStartCode(buttons) ? ('quiet' as const) : undefined;
  },
  run: () => {
    if (shellSession() || !joystickStartCode(buttons)) return;
    saveRelaunchEnabled(loc.dataDir, !relaunchEnabled(loc.dataDir));
    applyRelaunchWatcher();
    broadcast();
  },
});
// Collections de la roue : aussi au menu système, pour une borne dont les MagnaSave ne répondent pas.
// Le médaillon Collections de la roue ouvre la même liste (openCollectionsMedallion).
const collectionsItem = createCollectionsItem({
  collections,
  library,
  keysLabel: () => {
    const keys = collectionKeys();
    return keys.previous.length && keys.next.length ? `${keyLabel(keys.previous[0]!)} / ${keyLabel(keys.next[0]!)}` : undefined;
  },
  captureKeys: (back) => startCollectionCapture(back),
});
library.provideSystemItem('collections', collectionsItem);
// Mode invité : on joue, rien d'autre ; l'écran de l'entrée dit la combinaison qui déverrouille.
library.provideSystemItem('guest-mode', createGuestMenu({
  collections: () => ({ choices: collections.list().filter((c) => c.tables.length).map((c) => ({ id: c.id, label: c.label, count: c.tables.length })), active: collections.current().id }), library, guest, buttons: () => buttons }));

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
    // Un ami revenu en ligne : la messagerie lui envoie ce qui l'attendait (chat-service.ts).
    chatService.observe();
    // Un membre d'un groupe revenu : ses lignes manquantes s'échangent (group-service.ts).
    groupService.observe();
    // Une charte reçue a pu faire de cette borne un modérateur (ou le contraire).
    syncModerationItem();
    menuNotices.observe();
    // Une conversation lue (fil d'un ami, groupe, salon) : ses lignes d'Activité récente aussi.
    activityMenu.settle();
    // Nouvel ami, « J'aime » ou réaction reçus : leurs XP (level-tracker.ts).
    levelTracker.socialChanged();
    broadcast();
  }, 250);
}
// Démonstration de la modération (réseau simulé seulement) : la charte d'essai où cette borne est modératrice.
const socialCharter = socialDemo ? demoCharter(loc.dataDir) : undefined;
// Empreinte de cette machine pour les personnes invitées (invitations-service.ts) : lue avant le réseau, qui la demande.
const machineTagOf = createMachineTag((line) => console.log(line));
const socialNet = createSocialNet({
  ...(socialCharter ? { charter: socialCharter } : {}),
  dataDir: loc.dataDir,
  // Une ligne écrite au salon : la présence du jour compte pour le niveau.
  onOwnLine: () => levelTracker.roomMessage(),
  mode: socialMode,
  log: (line) => console.log(line),
  onChange: socialChanged,
  // Un compte supprimé par son joueur (forget.ts) : ses conversations partent aussi.
  onForget: (keys) => {
    chatService.forget(keys);
    groupService.forget(keys);
  },
  // Le pays par défaut des classements : la région de Windows (format régional, sinon langues préférées).
  // Avant « ready », Electron lève une exception (minuterie du réseau partie pendant un lancement retardé, 25/11/2026).
  systemLocale: () => (app.isReady() ? [app.getSystemLocale(), ...app.getPreferredSystemLanguages()].find((l) => countryOfLocale(l)) : undefined),
  // Personnes invitées (invitations.ts) : l'empreinte de cette machine, et la notification quand une
  // personne que j'ai invitée finit sa première partie.
  machine: machineTagOf,
  onInvited: (list) => menuNotices.push(list.map((i) => ({ kind: 'player-invited' as const, key: `invited|${i.me}`, at: Date.now(), who: i.name, player: i.me }))),
  // Des scores relayés : un joueur vient-il de me passer devant (place-taken.ts) ?
  onScores: (fresh) => placeTaken.scores(fresh),
  // Un « J'aime » sur mon activité publique : la notification, regroupée, au menu.
  onLike: (likes) => {
    const mine = socialNet.publicCard(socialNet.state().key.publicKey);
    menuNotices.push(likes.map((l) => {
      const e = mine?.events.find((x) => x.id === l.event);
      return { kind: 'player-like' as const, key: `${l.from}|${l.event}`, at: Date.now(), who: l.name, player: l.from, ...(e ? { subject: eventLater(e) } : {}) };
    }));
  },
});
// Plantages de Cyber Pinball (uncaught.ts) : rapport automatique avec l’accord donné au premier plantage
// de VPX (la question n’est jamais posée pour eux : une exception ne montre rien à l’écran). Les rapports
// restés en attente repartent peu après le démarrage, puis toutes les 30 minutes.
onAppCrash((c) => library.feedback?.crashed(crashSignature('app', c.code, c.detail), undefined, c.about));
feedbackService.watch();
teamThreads.watch();
// Messagerie entre amis (Menu système > Communauté > Messages) : un message pour un ami absent attend et
// part à son retour ; l'arrivée d'un message passe par les notifications (menu-notices.ts).
/** Le DMD annonce un message arrivé au menu pendant ce temps (« MESSAGE DE NOVA »), puis reprend son affichage. */
const DMD_MESSAGE_MS = 4000;
let dmdMessage: { text: string; until: number } | undefined;
const chatService = createChatService({
  net: socialNet,
  dataDir: loc.dataDir,
  onChange: () => socialChanged(),
  // Un message arrivé : la notification (au menu, dans le menu système, et par-dessus VPX en partie).
  onArrive: (key, lines) => {
    const who = socialNet.state().friends.find((f) => f.key === key)?.name ?? key.slice(0, 8);
    // Au menu (jamais en partie : le DMD est au jeu), le DMD l'annonce quelques secondes.
    if (state.phase !== 'playing' && state.phase !== 'loading' && !guest.active) {
      dmdMessage = { text: t('Message de {name}', { name: who }), until: Date.now() + DMD_MESSAGE_MS };
      broadcast();
      setTimeout(() => !closing && broadcast(), DMD_MESSAGE_MS + 100);
    }
    menuNotices.push(lines.map((l) => ({ kind: 'friend-message' as const, key: l.id, at: Date.now(), who, player: key, extra: (l.text ?? '').replace(/\s*\n\s*/g, ' ') })));
  },
  log: (line) => console.log(line),
});
// Groupes (Communauté > Groupes) : les bornes des membres s'échangent leurs lignes ;
// un message ou une invitation passe par les notifications (menu-notices.ts).
const groupService = createGroupService({
  net: socialNet,
  dataDir: loc.dataDir,
  onChange: () => socialChanged(),
  onOwnLine: () => levelTracker.roomMessage(),
  onArrive: (view, lines) => {
    if (guest.active || groupsMenu.shown() === view.id) return;
    menuNotices.push(lines.map((l) => ({ kind: 'group-message' as const, key: l.id, at: Date.now(), who: l.name, player: l.by, thread: view.id, subject: view.name, extra: (l.body.k === 'msg' ? l.body.text : '').replace(/\s*\n\s*/g, ' ') })));
  },
  // Un membre me mentionne (citations.ts) : sa notification à elle, même groupe en sourdine.
  onMention: (view, lines) => {
    if (guest.active || groupsMenu.shown() === view.id) return;
    menuNotices.push(lines.map((l) => ({ kind: 'group-mention' as const, key: l.id, at: Date.now(), who: l.name, player: l.by, thread: view.id, subject: view.name, extra: (l.body.k === 'msg' ? l.body.text : '').replace(/\s*\n\s*/g, ' ') })));
  },
  onInvite: (invitation, view) => {
    if (guest.active) return;
    const who = socialNet.state().friends.find((f) => f.key === invitation.from)?.name ?? invitation.from.slice(0, 8);
    menuNotices.push([{ kind: 'group-invite' as const, key: `${view.id}|${invitation.arrived}`, at: Date.now(), who, player: invitation.from, subject: view.name }]);
  },
  log: (line) => console.log(line),
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
// Dans un écran de la gestion des tables (bibliothèque d'un ami, sa table) : lu à son ouverture, gardé pour les touches (library.kept).
const romsOf = (table: TableEntry) => library.kept(`roms:${table.file}`, () => cachedScript(table.file, loc.dataDir)?.roms ?? []);
/** Table à ROM pour les LED : une table PinMAME dont le nom de ROM n'a pas été trouvé en est une (DOF de VPX garde le port). */
const hasRomOf = (table: TableEntry) => romsOf(table).length > 0 || cachedScript(table.file, loc.dataDir)?.usesPinmame === true;
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
 * « Masquer les notifications pendant les parties » (Menu système > Communauté, quiet-in-game-setting.ts) :
 * désactivé par défaut ; activé, rien ne s'affiche ni ne sonne pendant une partie.
 */
let quietInGame = readQuietInGame(loc.dataDir);
/**
 * Activité récente (Menu système > Activité récente, activity-menu.ts) : chaque notification en
 * entier, affichée ou retenue, gardée d'un démarrage à l'autre ; ce que Start y fait passe par les
 * écrans des amis, de la partie entre amis, des téléchargements et du menu système.
 */
/** L'écran des défis (challenges-menu.ts), créé plus bas : Activité récente le lit ici. */
let challengeScreens: { gone(id: string): string | undefined; open(id: string, back: () => void): void } | undefined;
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
  // Une ligne de messages : ce qui attend encore dans sa conversation, et l'ouvrir (Messages en attente).
  threads: { pending: (kind, thread) => threadPending(kind, thread), open: (kind, thread, back) => openThread(kind, thread, back) },
  // Une place prise (place-taken.ts) : Start reprend ma place, la table lancée.
  places: { reach: (key) => placeTaken.reach(key) },
  // Un défi (challenges-menu.ts) : Start ouvre son écran.
  challenges: { gone: (id) => (challengeScreens ? challengeScreens.gone(id) : t('Ce défi n’est plus sur cette borne.')), open: (id, back) => challengeScreens?.open(id, back) },
  // La pastille de la roue dentée et de l'entrée suit le non lu.
  changed: () => {
    if (!closing && state.phase !== 'playing' && state.phase !== 'loading') broadcast();
  },
  log: (line) => console.log(line),
});
library.provideSystemItem('activity', activityMenu.item);
/**
 * Nouveautés (Menu système > Aide et infos > Nouveautés, news-menu.ts) : les grandes nouveautés, choisies à la main,
 * en chronologie ; « Essayer » mène à chaque fonction, son « Retour » ramenant à la nouveauté.
 */
const newsMenu = createNewsMenu({
  dataDir: loc.dataDir,
  library: { openCustom: (build, at) => library.openCustom(build, at), openSystem: () => library.openSystem() },
  reach: (target, back) => newsReach(target, back),
  // Les sept réactions sur chaque nouveauté, comptées par le service des retours (une par borne).
  reactions: {
    of: (item) => feedbackService.news.of(item),
    net: () => feedbackService.news.net(),
    refresh: () => feedbackService.news.refreshIfOld(),
    react: (item, kind) => feedbackService.news.react(item, kind),
    closed: () => (guest.active ? t('Réagir est fermé en mode invité') : undefined),
  },
  changed: () => {
    if (!closing && state.phase !== 'playing' && state.phase !== 'loading') broadcast();
  },
  log: (line) => console.log(line),
});
library.provideSystemItem('news', newsMenu.item);

// Aide et infos > Rechercher, et une lettre tapée dans le Menu système (system-search-menu.ts).
createSystemSearch({ library });

/** Où « Essayer » mène depuis une nouveauté, ou pourquoi pas maintenant. */
function newsReach(target: NewsReach, back: () => void): { run?: () => void; gone?: string } {
  if (guest.active) return { gone: t('Indisponible en mode invité') };
  // En jeu local, ce qui touche aux autres joueurs et aux niveaux est retiré (localplay.ts).
  const local = t('Indisponible : la borne joue en local (Communauté › Jouer en local)');
  switch (target.kind) {
    case 'system':
      if (isSystemGroup(target.id)) return { run: () => void library.openSystemEntry(target.id) };
      if (!library.hasSystemItem(target.id)) return { gone: t('Indisponible sur cette borne') };
      if (hiddenInLocalPlay(target.id as SystemItemId, localPlay())) return { gone: local };
      return { run: () => library.runSystemItem(target.id as SystemItemId, back) };
    case 'community': {
      if (localPlay()) return { gone: local };
      if (!socialNet.state().enabled) return { gone: t('Indisponible : partage désactivé (Partage et réseau)') };
      const open = { home: () => communityMenu.openHome(back), instant: () => instantMenu.open(back), groups: () => groupsMenu.open(back), daily: () => dailyTablesMenu.open(back) }[target.door];
      return { run: open };
    }
    case 'level':
      return localPlay() ? { gone: local } : { run: () => levelMenu.open(back) };
    // L'écran de l'Arène (arena-menu.ts) : son Exit revient d'où l'on vient.
    case 'arena':
      return localPlay() ? { gone: local } : { run: () => arenaMenu.openHome(back) };
    case 'jukebox':
      return { run: () => openJukebox() };
    case 'sheet': {
      const table = tables[state.index];
      if (!table) return { gone: t('Choisis d’abord une table sur la roue') };
      if (target.part === 'pov') {
        if (table.emulator !== 'vpx') return { gone: t('Indisponible : choisis une table VPX sur la roue') };
        return { run: () => library.openPov(table, back) };
      }
      if (target.part === 'credits') return { run: () => library.credits.open(table) };
      if (target.part === 'scores') return { run: () => library.openScores(table, 'world', 'week', back) };
      return { run: () => library.openSheet(table) };
    }
  }
}
const menuNotices = createMenuNotices({
  social: socialNet,
  jobs: () => library.downloads.manager.jobs(),
  reason: (j) => downloadReasonLater(j),
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
  // Le son d'un message suit « Son des messages » (Réglages de la messagerie).
  messages: { unread: (key) => chatService.state().conversations[key]?.unread ?? 0, onScreen: (key) => chatMenu.threadOnScreen(key), sound: () => chatService.state().sound },
  // Créé plus bas : la file ne le lit qu'à l'affichage, une fois tout en place.
  rooms: { onScreen: (room) => roomsMenu.inRoom() === room, unread: (id) => roomsMenu.lineUnread(id) },
  log: (line) => console.log(line),
});
/**
 * Une invitation qui arrive s'ouvre d'elle-même : sur la roue, comme avant ; dans le menu système
 * (chacun de ses sous-écrans) et sur l'aide des commandes, par-dessus, « Répondre plus tard » ou
 * « Retour » rendant l'écran tel qu'il était (library.interrupt). Ailleurs (message, confirmation,
 * mode attente, opération longue, saisie), la notification l'annonce et l'entrée du menu système
 * y mène. Pendant une partie : la carte sur le plateau (game-notice.ts).
 */
/**
 * Pastille du coin d'état cliquée (téléchargements, amis, badges, carte du joueur) : l'écran
 * qu'elle annonce, depuis la roue (ou son aide) comme depuis un écran plein, où le coin est aussi
 * (17/11/2026). Son « Retour » ramène là d'où l'on vient : la roue, ou l'écran plein tel qu'il
 * était (library.interrupt, comme une invitation). Rien sur un message ou une confirmation, qui
 * attendent leur réponse, ni pendant une opération longue ou une saisie.
 */
function openFromCorner(open: (back: () => void) => void): void {
  if (state.phase === 'menu') {
    if (!guest.knock('menu.system')) return;
    if (state.help) state = { ...state, help: false };
    open(() => library.leave());
  } else if (state.phase === 'library' && guest.knock('menu.system')) library.interrupt(open);
}

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
  // Scores relevés : l'écran ouvert (fiche, Classements) relit ce qu'il montre (library.ts, kept).
  changed: () => (library.isActive() ? library.changed() : broadcast()),
  log: (line) => console.log(line),
});
// Classements des amis, du pays et du monde au tableau des scores : la version exacte de chaque table, calculée une fois.
const tableRankings = createTableRankings({
  net: socialNet,
  versionOf: (table) => liveGames.versionOf(table),
  ballsOf: async (table) => (await ballCounts.of(table))?.balls,
  // Le niveau de ma ligne : mes XP d'aujourd'hui (le suivi du niveau, créé plus bas, n'est lu qu'à l'affichage).
  myXp: () => levelTracker.state().xp,
  changed: () => (library.isActive() ? library.changed() : broadcast()),
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
// Un arrêt brutal pendant une partie seul : le VPinballX.ini et memmaps remis comme avant (solo-inspector-setup.ts).
restoreSoloInspector(loc.dataDir, (line) => console.log(line));
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
    if (playing && quietInGame) return void console.log(`Invitation pendant la partie : ${invite.host.name}, ${invite.title}, gardée pour le front-end (notifications masquées pendant les parties).`); // i18n-ignore : journal
    playUiSound('invite');
    if (playing) gameNotices.show(invite);
    else if (!openArrivedInvite(invite.id)) console.log(`Invitation de ${invite.host.name} : annoncée par la notification (écran « ${zoneScreen()} » laissé tel quel).`); // i18n-ignore : journal
  },
  play: async (table, onPlaying, settings, board, progress, gate) => {
    // Le départ commun ferme l'écran ouvert (le compte à rebours), comme Start sur une table.
    if (library.isActive()) library.leave();
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
  // Une partie en ligne finie : ses XP au niveau du joueur.
  onFinished: (entry) => levelTracker.liveFinished(entry),
  log: (line) => console.log(line),
});
// Niveau du joueur (level-tracker.ts, décidé le 17/11/2026) : XP des parties, des parties en ligne,
// du salon et des amis ; badges ; classements de la semaine ; le moment montré au retour d'une partie.
// Rien ne compte en mode invité ni pendant un essai sans opérateur.
const levelTracker = createLevelTracker({
  dataDir: loc.dataDir,
  net: socialNet,
  tables: () => tables,
  history: () => liveGames.history(),
  groups: () => ({ count: groupService.groups().length, wins: 0 }),
  contributions: () => feedbackService.contributions(),
  active: () => !guest.active && !process.env.CYBERPINBALL_AUTOPILOT,
  changed: () => socialChanged(),
  log: (line) => console.log(line),
});
// Tables du jour (daily-tables.ts, engagement du 21/11/2026) : mes parties par version de table, jointes
// à ma carte publique ; les tables du jour, le record du jour et l'objectif d'une table (écran des
// Classements, fiche, chargement ; l'Arène s'en sert aussi).
const dailyTables = createDailyTables({
  dataDir: loc.dataDir,
  net: socialNet,
  myXp: () => levelTracker.state().xp,
  tables: () => tables,
  versionOf: (table) => tableRankings.version(table),
  myBest: (table) => myTableBest(table),
  log: (line) => console.log(line),
});
dailyTables.start();
// Place prise (place-taken.ts, 21/11/2026) : un joueur passe devant moi sur une version que j'ai jouée ;
// la notification, sa ligne d'Activité, et l'action du moment de l'Arène. Rien en jeu local ni en invité.
const placeTaken = createPlaceTaken({
  daily: dailyTables,
  push: (events) => menuNotices.push(events),
  journal: () => activityMenu.entries(),
  closed: () => socialClosed(),
  play: (table) => playFromNotice(table),
  log: (line) => console.log(line),
});

// Défis asynchrones (challenge-service.ts, 22/11/2026) : mes défis, leurs notes signées par le réseau des
// bornes, les notifications, les XP du vainqueur. Rien en jeu local ni en mode invité.
const challengeService = createChallengeService({
  dataDir: loc.dataDir,
  net: socialNet,
  refused: (key) => socialNet.state().blocked.includes(key) || sanctionOf(socialNet.moderation().acts, key, new Date())?.kind === 'ban',
  won: (table) => levelTracker.challengeWon(table),
  push: (events) => menuNotices.push(events),
  closed: () => socialClosed(),
  changed: () => (library.isActive() ? library.changed() : broadcast()),
  log: (line) => console.log(line),
});

/** Mon meilleur score relevé par Cyber Pinball sur une version exacte : publié aux classements, ou sur une de mes tables de cette version. */
function myVersionBest(v: { board: string; balls?: number }): number | undefined {
  const me = socialNet.state().key.publicKey;
  let best = 0;
  for (const s of socialNet.rankings().scores) if (s.key === me && s.board === v.board && (s.balls ?? 0) === (v.balls ?? 0) && s.score > best) best = s.score;
  for (const table of tables) {
    const x = tableRankings.version(table);
    if (x.state === 'ok' && x.board === v.board && (x.balls ?? 0) === (v.balls ?? 0)) best = Math.max(best, myTableBest(table) ?? 0);
  }
  return best || undefined;
}

/** Les joueurs à défier sur une version : mes amis d'abord, puis les joueurs classés dessus, du meilleur score au moins bon. */
function challengeCandidates(v: { board: string; balls?: number }): ChallengeCandidate[] {
  const s = socialNet.state();
  const me = s.key.publicKey;
  const ranked = new Map<string, { name: string; country?: string; score: number }>();
  for (const sc of socialNet.rankings().scores) {
    if (sc.key === me || sc.board !== v.board || (sc.balls ?? 0) !== (v.balls ?? 0)) continue;
    const had = ranked.get(sc.key);
    if (!had || sc.score > had.score) ranked.set(sc.key, { name: sc.name, ...(sc.country ? { country: sc.country } : {}), score: sc.score });
  }
  const refused = (key: string) => s.blocked.includes(key) || sanctionOf(socialNet.moderation().acts, key, new Date())?.kind === 'ban';
  const friends: ChallengeCandidate[] = s.friends.filter((f) => !refused(f.key)).map((f) => ({ key: f.key, name: f.name, friend: true, ...(ranked.get(f.key) ? { score: ranked.get(f.key)!.score } : {}) }));
  const others: ChallengeCandidate[] = [...ranked.entries()]
    .filter(([key]) => !refused(key) && !s.friends.some((f) => f.key === key))
    .sort((a, b) => b[1].score - a[1].score)
    .map(([key, p]) => ({ key, name: p.name, ...(p.country ? { country: p.country } : {}), friend: false, score: p.score }));
  return [...friends, ...others];
}

/** Une table lancée hors de la roue (« Reprendre ma place », « Rejouer ») : l'écran ouvert se ferme d'abord. */
function playFromNotice(table: TableEntry): void {
  if (state.phase !== 'menu' && state.phase !== 'library') return;
  if (library.isActive()) library.leave();
  void play(table);
}

/** Mon record sur une table : le meilleur relevé par le niveau, ou une partie de cette borne au tableau des scores. */
function myTableBest(table: TableEntry): number | undefined {
  const best = levelTracker.state().bests[tableKey(presenceTable(table))] ?? 0;
  const played = tableScores.board(table, 'all').lines.find((l) => l.at)?.score ?? 0;
  return Math.max(best, played) || undefined;
}
// Volume −, Volume + et Muet : le son de Windows, au menu comme en partie (cabinet-volume.ts).
let cabinetVolume: CabinetVolume | undefined;
// Fiche > « DMD sur la roue » : le DMD du menu affiché ou masqué pour chaque table, et sa place (menu-dmd.ts).
const menuDmd = createMenuDmd({
  dataDir: loc.dataDir,
  configuration: () => menuConfiguration,
  auto: (table) => autoDmdPlace(table),
  unseen: () =>
    mediaSettings.dmd !== 'live'
      ? t('« DMD du front-end » est réglé sur « classique » : la roue montre le média DMD de la table, sans points (Menu système > Tables > « Son et mode attente »).')
      : undefined,
  keys: () => {
    // Les MagnaSave lus comme sur la roue : relevés, sinon Ctrl gauche et Ctrl droit.
    const magna = cabinetCollectionKeys({ buttons, navigation }, KEYS);
    return { previous: KEYS.previous, next: KEYS.next, confirm: KEYS.confirm, exit: KEYS.exit, up: magna.previous, down: magna.next };
  },
  library: { openCustom: (build, at, table) => library.openCustom(build, at, table), openSheet: (table, flash) => library.openSheet(table, flash) },
  broadcast: () => broadcast(),
  log: (line) => console.log(line),
});
// Les deux MagnaSave pendant la partie : position du DMD, puis le menu de VPX (in-game-menu.ts).
const inGameMenu = createInGameMenu({ log: (line) => console.log(line), allowed: () => guest.allows('game.settings'), changed: () => phoneRemote.menuChanged() });
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
// Fin d'une partie solo lue en direct : le score et les classements, par-dessus VPX (carte-fin-partie.ts).
const endCard = createEndCard({ place: playfieldPlace, captureDir: process.env.CYBERPINBALL_CAPTURE, log: (line) => console.log(line) });
/** Flip gauche sur la carte : VPX se ferme, puis le choix du joueur à défier s'ouvre sur cette table. */
let challengeAfterGame: TableEntry | undefined;
// Mode débogage (debogage.ts) : les mesures de tous les écrans en direct, par-dessus un seul d'entre eux ; éteint, rien ne tourne.
let debugGpu: { at: number; gpu: { name: string; vramMb?: number } | undefined } | undefined;
const debug = createDebug({
  dataDir: loc.dataDir,
  version: app.getVersion(),
  place: (role) => {
    if (role === 'playfield') return playfieldPlace();
    const rect = roleRects.find((r) => r.role === role)?.rect;
    return rect ? { zone: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, rotation: 0 } : undefined;
  },
  displays: observedDisplays,
  phase: () => (state.phase === 'playing' ? 'playing' : state.phase === 'loading' ? 'loading' : 'menu'),
  // Une partie dans le casque : le mode débogage n'a rien à montrer sur les écrans.
  vr: () => vrFront.vrGameStop !== undefined,
  // Au bureau, la fenêtre se retire : remise devant par la mesure, elle ferait revenir le front-end (desktop-mode.ts, reopened).
  desktop: () => desktop.active,
  windows: () => windows,
  table: () => (state.phase === 'playing' || state.phase === 'loading' ? playing?.title : tables[state.index]?.title),
  // La carte graphique vient de la fiche technique (un fichier) : relue au plus toutes les cinq minutes.
  gpu: () => {
    if (!debugGpu || Date.now() - debugGpu.at > 300_000) {
      const machine = qualityMachine(loc.dataDir);
      debugGpu = { at: Date.now(), gpu: machine.gpu ? { name: machine.gpu, ...(machine.vramMb ? { vramMb: machine.vramMb } : {}) } : undefined };
    }
    return debugGpu.gpu;
  },
  coveredBy: (win) => (OFFSCREEN ? undefined : describeCover(win)),
  captureDir: process.env.CYBERPINBALL_CAPTURE,
  log: (line) => console.log(line),
});
createDebugMenu({ debug, library });
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
      host: t('Recherche libre · image que tu choisis'),
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
// Démarrage du menu : pseudo obligatoire tant qu'il n'est pas choisi, avatar proposé (profile-welcome.ts).
// « Qui vous a fait découvrir Cyber Pinball ? » (invitations-service.ts) : à l'accueil du profil et dans « Mon profil public ».
const invitationsService = createInvitationsService({ library, net: socialNet, played: () => levelTracker.played() });
// Mon compte (account-service.ts, account-menu.ts) : copie de secours hors de la racine, code de
// récupération, coffre chiffré et mot de passe, reprise d'un compte. Jamais le vrai service pendant un
// essai (hors écran, réseau simulé ou coupé) : le coffre y est indisponible, la copie de secours reste
// dans le bac à sable (accountCopiesDir).
const accountService = createAccountService({
  dataDir: loc.dataDir,
  copiesDir: accountCopiesDir(loc),
  key: () => socialNet.state().key,
  ...(OFFSCREEN || process.env.CYBERPINBALL_RESEAU === 'simule' || socialMode === 'off' ? {} : { transport: httpTransport(process.env.CYBERPINBALL_RELAIS ?? RELAY_ORIGIN) }),
  changed: () => socialChanged(),
  log: (line) => console.log(line),
});
/** Le menu « Mon compte », créé plus bas (il a besoin du menu Amis) : l'écran de bienvenue le lit ici. */
let accountEntry: { openCopy(copy: AccountCopy, back: () => void): void; openRestore(back: () => void): void } | undefined;
const profileWelcome = createProfileWelcome({
  library,
  net: socialNet,
  avatarMenu,
  invite: invitationsService.entry,
  // Mon compte : le compte d'une installation d'avant (copie de secours de ce PC), et « J'ai déjà un compte ».
  account: { offer: () => accountService.offer(), openCopy: (copy, back) => accountEntry?.openCopy(copy, back), openRestore: (back) => accountEntry?.openRestore(back) },
});

/**
 * Écrans du démarrage, dans l'ordre : les conditions d'utilisation à accepter, puis « Votre profil
 * de joueur » ; enfin la suite du démarrage telle qu'elle était : le message qui attendait
 * (installer VPX, ajouter une table) ou la roue.
 */
function openStartupScreens(screens: { terms: boolean; welcome: boolean }): void {
  const landing = state;
  const resume = () => {
    library.leave();
    if (landing.phase === 'message' && landing.message) state = { ...state, phase: 'message', message: landing.message };
    broadcast();
  };
  const welcome = () => (screens.welcome ? profileWelcome.open(resume) : resume());
  if (screens.terms) termsMenu.ask(welcome);
  else if (screens.welcome) welcome();
}

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
  chat: { openThread: (key, back) => chatMenu.openThread(key, back), writeDetail: (key) => chatMenu.writeDetail(key) },
  profile: { open: (key, back) => profileMenu.openProfile(key, back) },
  // « Mes amis » : l'onglet Amis de « Joueurs » (community-menu.ts, 21/11/2026).
  players: (back) => communityMenu.openPlayers(back, 'friends'),
  // Supprimer mon compte (account-delete.ts) : retours, avis d'oubli, fichiers, puis redémarrage avec une clé neuve.
  account: {
    forgetFeedback: () => feedbackService.forgetMe(),
    erase: async (feedback) => {
      const report = await deleteAccount({ forgetNetwork: () => socialNet.forgetMe(), stopChat: () => chatService.stop(), dataDir: loc.dataDir }, feedback);
      // Comme après une restauration : plus rien ne réécrit le compte effacé (état encore en mémoire) jusqu'au redémarrage.
      freezeWrites([loc.root ?? loc.dataDir, loc.dataDir], [path.join(loc.dataDir, 'logs')]);
      return report;
    },
    relaunch: () => relaunchMenu(),
  },
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
const chatMenu = createChatMenu({
  library,
  net: socialNet,
  chat: chatService,
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  openProfile: (key, back) => profileMenu.openProfile(key, back),
  openFind: () => friendsMenu.openFind(),
  openSharing: () => friendsMenu.items.sharing.run(),
  block: (key) => socialNet.block(key),
});
library.provideSystemItem('messages', chatMenu.item);
// Profil public et « J'aime » (profile-menu.ts) : celui des autres joueurs, et le mien.
/** Bloquer un joueur : plus de connexion avec sa borne, son fil effacé (profil de la borne et du téléphone). */
function blockPlayer(key: string): void {
  socialNet.block(key);
  chatService.clear(key);
}
/** La roue sur une table (un rival de l'Arène, un record d'un profil) : comme une table touchée au téléphone. */
const wheelTable = {
  has: (table: PresenceTable) => Boolean(shelfTableOf(table)),
  go: (table: PresenceTable) => {
    const entry = shelfTableOf(table);
    if (!entry) return;
    const shelf = collections.shelf();
    const picked = collections.move(shelf.tables.indexOf(entry) - shelf.index);
    pointAtTable(picked ?? entry);
    library.leave();
    playUiSound('solenoid');
    broadcast();
  },
};
const profileMenu = createProfileMenu({
  badgeFacts: () => levelTracker.facts(),
  navKeys: () => KEYS,
  library,
  net: socialNet,
  // Le profil en écran à onglets (22/11/2026) : MagnaSave change d'onglet ; mon profil ouvre les rubriques du Menu système.
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  myLevel: () => levelTracker.view().level,
  system: { open: (group, back) => library.openSystemGroupFrom(group, back) },
  openSharing: (back) => library.runSystemItem('sharing', back),
  table: wheelTable,
  commonTables: (key) => communityMenu.everyone().find((p) => p.key === key)?.commonTables,
  welcome: (name) => roomsMenu.write(roomsMenu.defaultRoom(), welcomeLine(name)),
  // Le seul écran d'un joueur (17/11/2026) : la relation y ajoute présence, bibliothèque et demandes d'ami.
  relation: (key, name, ctx) => friendsMenu.playerPart(key, name, ctx),
  writeDetail: (key) => chatMenu.writeDetail(key),
  block: (key) => blockPlayer(key),
  openThread: (key, back) => chatMenu.openThread(key, back),
  // Ses groupes publics (17/11/2026) : connus de cette borne par l'annuaire ; jamais un groupe privé.
  groups: {
    of: (key) => groupService.publicGroupsOf(key).map(({ view, mine }) => ({ id: view.id, name: view.name, members: view.members.length, ...(view.week ? { week: view.week.table.title } : {}), mine })),
    open: (id, mine, back) => (mine ? groupsMenu.openGroup(id, back) : groupsMenu.openPublic(id, back)),
  },
  invite: invitationsService.entry,
});
library.provideSystemItem('public-profile', profileMenu.item);
// Le profil d'un joueur au téléphone (phone-community.ts) : celui de la borne, ses actions par leur identité.
const phoneCommunity = createPhoneCommunity({
  profiles: profileMenu,
  net: socialNet,
  block: (key) => blockPlayer(key),
  refresh: () => phoneRemote?.menuChanged(),
});
// Salons par pays (rooms-menu.ts) : le journal, écrire, les options d'une ligne, les règles, les réglages de la communauté.
const roomsMenu = createRoomsMenu({
  library,
  net: socialNet,
  openProfile: (key, back) => profileMenu.openProfile(key, back),
  currentTable: () => tables[state.index],
  phoneLinked: () => phoneRemote?.connected() === 'menu',
});
library.provideSystemItem('community-settings', roomsMenu.settingsItem);
// Groupes (groups-menu.ts) : la porte de l'accueil Communauté, la liste, un groupe, les invitations.
const groupsMenu = createGroupsMenu({
  library,
  net: socialNet,
  groups: groupService,
  tables: () => tables,
  wheel: (table) => medias?.wheel(table),
  play: (table) => {
    void play(table);
  },
  openProfile: (key, back) => profileMenu.openProfile(key, back),
  openSharing: (back) => library.runSystemItem('sharing', back),
  busy: () => remoteBusy(),
});
// Modération : l'entrée n'existe que pour un modérateur de la charte (elle peut changer : relue à chaque changement du réseau).
let moderationShown = false;
function syncModerationItem(): void {
  const on = socialNet.amModerator();
  if (on === moderationShown) return;
  moderationShown = on;
  if (on) library.provideSystemItem('moderation', roomsMenu.moderationItem);
  else library.withdrawSystemItem('moderation');
}
syncModerationItem();
// Un signalement reçu (modérateur) : la notification, au menu.
socialNet.onReports((reports) => {
  syncModerationItem();
  menuNotices.push(reports.map((r) => ({ kind: 'room-report' as const, key: r.id, at: Date.now(), who: r.name, player: r.line.key, subject: roomsMenu.roomName(r.line.room), extra: `${r.line.name} : ${r.line.text}` })));
});
// Mon pseudo cité dans un salon qui n'est pas à l'écran : la notification (au menu ; en partie, si le réglage le permet).
socialNet.onRoomLines((lines) => {
  const s = socialNet.rooms();
  const name = socialNet.state().name;
  if (guest.active) return;
  const playingNow = state.phase === 'playing' || state.phase === 'loading';
  if (playingNow && !s.mentionsInGame) return;
  const hits = lines.filter((l) => !s.ignored.includes(l.key) && mentions(l.text, name) && roomsMenu.shown() !== l.room);
  if (hits.length) menuNotices.push(hits.map((l) => ({ kind: 'room-mention' as const, key: l.id, at: Date.now(), who: l.name, player: l.key, thread: l.room, subject: roomsMenu.roomName(l.room), extra: s.filter ? maskWords(l.text) : l.text })));
  // Les autres lignes de mes salons (16/11/2026) : au menu seulement, tenues jusqu'à deux minutes (NoticeRule.holdMs).
  if (playingNow) return;
  const news = roomsMenu.newsOf(lines);
  if (news.length) menuNotices.push(news.map((l) => ({ kind: 'room-line' as const, key: `${l.room}|${l.id}`, at: Date.now(), who: l.name, player: l.key, subject: roomsMenu.roomName(l.room), extra: s.filter ? maskWords(l.text) : l.text })));
});
// Classements > Tables du jour (daily-tables-menu.ts) : les plus jouées, le record du jour, ma place ; Start lance la table.
const dailyTablesMenu = createDailyTablesMenu({
  library,
  service: dailyTables,
  tables: () => tables,
  play: (table) => {
    if (library.isActive()) library.leave();
    void play(table);
  },
  versionHolders: (board) => friendsMenu.versionHolders(board),
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  openSharing: (back) => library.runSystemItem('sharing', back),
});
// Défis (challenges-menu.ts) : l'onglet de l'Arène, « Défier un joueur… », l'écran d'un défi, défier depuis un profil.
const challengesMenu = createChallengesMenu({
  library,
  service: challengeService,
  localFor: (line) => dailyTables.localFor(line),
  face: (p) => avatarView(p.key, p.name, socialNet.avatarFile(p.key)),
  versionHolders: (board) => friendsMenu.versionHolders(board),
  play: (table) => playFromNotice(table),
  versionOf: (table) => tableRankings.version(table),
  myBest: (v) => myVersionBest(v),
  candidates: (v) => challengeCandidates(v),
  recentTables: () => [...tables].filter((x) => lastRunOf(x) > 0).sort((a, b) => lastRunOf(b) - lastRunOf(a)),
  sharingOff: () => !socialNet.state().enabled,
  openSharing: (back) => library.runSystemItem('sharing', back),
});
// Activité récente (créée plus haut) : Start sur la ligne d'un défi ouvre son écran.
challengeScreens = {
  gone: (id) => challengeService.unavailable() ?? (challengeService.get(id) ? undefined : t('Ce défi n’est plus sur cette borne.')),
  open: (id, back) => challengesMenu.openChallenge(id, back),
};
// La fiche d'une table côté joueurs (table-social.ts) : « Sur cette table », l'objectif, « Jouer ensemble… ».
const tableSocial = createTableSocial({
  library,
  service: dailyTables,
  net: socialNet,
  myBest: (table) => myTableBest(table),
  groupsOf: (table) => groupsMenu.weekOf(table),
  playWithFriend: (table, back) => friendsMenu.live.sheetAction(table, back),
  instantGame: (table, back) => instantMenu.sheetAction(table, back),
  joinInstant: (board, back) => instantMenu.joinOn(board, back),
  challenge: (table, back) => challengesMenu.sheetAction(table, back),
});
// Classements de toutes mes tables (rankings-menu.ts) : la porte « Classements » de l'accueil Communauté.
const rankingsMenu = createRankingsMenu({
  library,
  daily: { detail: () => dailyTablesMenu.detail(), open: (back) => dailyTablesMenu.open(back) },
  tables: () => tables,
  local: (table, period) => tableScores.board(table, period),
  network: (table, scope, period) => tableRankings.view(table, scope, period),
  // Classement des joueurs par XP (playerranking.ts) : les cartes publiques reçues, et moi.
  players: {
    state: () => {
      const s = socialNet.state();
      const country = socialNet.country();
      const levels = levelTracker.state();
      const at = new Date();
      const key = s.key.publicKey;
      const avatar = socialNet.publicCard(key)?.avatar;
      return {
        enabled: s.enabled,
        ...(country ? { country } : {}),
        friends: new Set(s.friends.map((f) => f.key)),
        me: { key, name: s.name, ...(country ? { country } : {}), ...(avatar ? { avatar } : {}), xp: levels.xp, week: { of: weekKey(at), xp: weekXp(levels, at) } },
      };
    },
    cards: () => socialNet.publicCards(),
    firstSeen: (key) => socialNet.cardFirstSeen(key),
    face: (p) => avatarView(p.key, p.name, socialNet.avatarFile(p.key) ?? (p.avatar ? socialNet.rankingAvatar(p.key, p.avatar) : undefined)),
    status: (key) => playerStatus(socialNet, socialNet.state(), key, new Date()),
  },
  keys: () => KEYS,
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  openSharing: (back) => library.runSystemItem('sharing', back),
  // Un changement arrivé pendant la limite de cadence des classements : relu à sa fin.
  redraw: () => (library.isActive() ? library.changed() : broadcast()),
});
// Communauté (community-menu.ts) : l'accueil du médaillon de la roue, et « Joueurs en ligne », amis ou non.
// Parties en direct (instant-menu.ts) : ouvertes à tous, dans la Communauté et sur la fiche d'une table.
const instantMenu = createInstantMenu({
  library,
  net: socialNet,
  games: liveGames,
  live: friendsMenu.live,
  tables: () => tables,
  selected: () => tables[state.index],
  busy: () => remoteBusy(),
  openSharing: (back) => library.runSystemItem('sharing', back),
  redraw: () => broadcast(),
});
// Mon niveau et Mes badges (level-menu.ts) : le récap, en tête de l'accueil Communauté.
const levelMenu = createLevelMenu({
  library,
  net: socialNet,
  levels: levelTracker,
  openProfile: (back) => profileMenu.openMine(back),
});

const accountMenu = createAccountMenu({
  library,
  net: socialNet,
  service: accountService,
  level: () => {
    const v = levelTracker.view();
    return { level: v.level, xp: levelTracker.state().xp };
  },
  openDelete: (back) => friendsMenu.openDeleteAccount(back),
  // Reprendre un compte : réseau et messagerie arrêtés (rien n'y réécrit le compte d'avant), ses
  // fichiers effacés, le paquet posé, les écritures gelées comme après une restauration, puis le redémarrage.
  apply: async (bundle) => {
    accountService.stop();
    await socialNet.stop();
    chatService.stop();
    eraseAccountFiles(loc.dataDir);
    writeAccountBundle(loc.dataDir, bundle);
    freezeWrites([loc.root ?? loc.dataDir, loc.dataDir], [path.join(loc.dataDir, 'logs')]);
    console.log('Mon compte : compte repris, redémarrage'); // i18n-ignore : journal
    relaunchMenu();
  },
});
library.provideSystemItem('account', accountMenu.items.account);
library.provideSystemItem('player-name', accountMenu.items['player-name']);
library.provideSystemItem('country', accountMenu.items.country);
library.provideSystemItem('account-privacy', accountMenu.items['account-privacy']);
library.provideSystemItem('account-delete', accountMenu.items['account-delete']);
accountEntry = accountMenu;
accountService.start();
const communityMenu = createCommunityMenu({
  level: {
    detail: () => levelMenu.detail(),
    avatar: () => ({ ...avatarView(socialNet.state().key.publicKey, socialNet.state().name, socialNet.avatarFile(socialNet.state().key.publicKey)), level: levelTracker.view().level }),
    open: (back) => levelMenu.open(back),
    // L'affiche du plateau : mon niveau et mes XP de la semaine.
    view: () => ({ ...levelOf(levelTracker.state().xp), week: weekXp(levelTracker.state(), new Date()) }),
  },
  instant: { door: () => instantMenu.door(), open: (back) => instantMenu.open(back) },
  rooms: { door: () => roomsMenu.door(), glance: () => roomsMenu.glance(), peek: () => communityRoomPeek(), problem: () => communityRoomProblem(), open: (back) => roomsMenu.openDefault(back) },
  groups: { door: () => groupsMenu.door(), open: (back) => groupsMenu.open(back), mine: () => communityGroups() },
  friends: {
    detail: () => friendsMenu.items.friends.detail ?? '',
    attention: () => Boolean(friendsMenu.items['friend-requests'].attention || friendsMenu.items.friends.attention),
    find: () => friendsMenu.openFind(),
    requests: (back) => friendsMenu.openRequests(back),
    pending: (here) => friendsMenu.live.pendingAction(here),
  },
  // Le médaillon ouvre l'écran à onglets (community-hub.ts, 21/11/2026).
  hub: { openHome: (back) => communityHub.openHome(back) },
  myLevel: () => levelTracker.view().level,
  library,
  net: socialNet,
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  tables: () => tables,
  // Le logo de roue d'une table : les médaillons des tables en commun avec un joueur.
  wheel: (table) => medias?.wheel(table),
  openProfile: (key, back) => profileMenu.openProfile(key, back),
  messages: {
    detail: () => chatMenu.item.detail ?? '',
    attention: () => Boolean(chatMenu.item.attention),
    quiet: () => chatMenu.item.tone === 'quiet',
    open: (back) => library.runSystemItem('messages', back),
    waiting: () => communityWaiting(),
  },
  rankings: { detail: () => rankingsMenu.detail(), open: (back) => rankingsMenu.open(back), standing: () => rankingsMenu.standing() },
  openSharing: (back) => library.runSystemItem('sharing', back),
});
library.provideSystemItem('online-players', communityMenu.item);
// L'accueil du médaillon est la rubrique Communauté (systemmenu.ts) : ses entrées venues de community-menu.ts.
{
  const home = communityMenu.homeItems;
  if (home['my-level']) library.provideSystemItem('my-level', home['my-level']);
  if (home.instant) library.provideSystemItem('instant', home.instant);
  if (home.groups) library.provideSystemItem('groups', home.groups);
  if (home.rooms) library.provideSystemItem('rooms', home.rooms);
  if (home.rankings) library.provideSystemItem('rankings', home.rankings);
}

// Communauté à onglets (community-hub.ts, 21/11/2026) : l'écran du médaillon. Ici, seulement ce qu'il
// lit des services : les conversations qui attendent, mes groupes, le salon de mon pays.
/** Une conversation des Messages en attente (inboxThreads), telle que la Communauté la montre. */
function communityThreadOf(x: InboxThread): CommunityThread | undefined {
  const last = x.last ? { ...(x.last.who ? { who: x.last.who } : {}), text: x.last.text, at: x.last.at } : undefined;
  if (x.kind === 'friend-message')
    return { kind: 'friend', id: x.id, key: x.id, name: x.name, unread: x.unread, ...(last ? { last } : {}), open: (back) => chatMenu.openThread(x.id, back), reply: (text) => chatService.send(x.id, text) };
  if (x.kind === 'group-message') return communityGroups().find((g) => g.id === x.id);
  if (x.kind === 'room-mention') return { kind: 'room', id: x.id, name: x.name, unread: x.unread, ...(last ? { last } : {}), open: (back) => roomsMenu.openRoom(x.id as RoomId, back) };
  return undefined;
}
function communityWaiting(): CommunityThread[] {
  return inboxThreads()
    .filter((x) => !x.muted)
    .map(communityThreadOf)
    .filter((x): x is CommunityThread => Boolean(x))
    .sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
}
/** Les conversations à deux les plus récentes (messagerie entre amis). */
function communityRecent(max: number): CommunityThread[] {
  const s = socialNet.state();
  const out: CommunityThread[] = [];
  for (const [key, c] of Object.entries(chatService.state().conversations)) {
    const friend = s.friends.find((f) => f.key === key);
    const line = c.lines.at(-1);
    if (!friend || !line?.text) continue;
    out.push({ kind: 'friend', id: key, key, name: friend.name, unread: c.unread, last: { ...(line.out ? { who: s.name } : {}), text: oneLine(line.text), at: Date.parse(line.at) }, open: (back) => chatMenu.openThread(key, back), reply: (text) => chatService.send(key, text) });
  }
  return out.sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0)).slice(0, max);
}
/** Mes groupes : le dernier message, la table de la semaine, et y répondre. */
function communityGroups(): CommunityThread[] {
  const me = socialNet.state().key.publicKey;
  return groupService
    .groups()
    .filter(({ entry }) => !entry.gone)
    .map(({ entry, view }): CommunityThread => {
      const last = [...entry.lines].reverse().find((l) => l.body.k === 'msg');
      const text = last?.body.k === 'msg' ? oneLine(last.body.text) : undefined;
      return {
        kind: 'group',
        id: view.id,
        name: view.name,
        unread: entry.muted ? 0 : entry.unread,
        ...(last && text ? { last: { who: last.by === me ? socialNet.state().name : last.name, text, at: Date.parse(last.at) } } : {}),
        ...(view.week ? { detail: t('Table de la semaine : {table}', { table: view.week.table.title }) } : {}),
        open: (back) => groupsMenu.openGroup(view.id, back),
        reply: (text) => 'line' in groupService.send(view.id, text),
      };
    })
    .sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
}
/** Pourquoi le salon de mon pays est fermé (partage, salons coupés) ; undefined : ouvert. */
function communityRoomProblem(): string | undefined {
  const door = roomsMenu.door();
  return door.quiet ? door.detail : undefined;
}
/** Le salon de mon pays d'un coup d'œil (rooms-menu.ts, remote) : ses lignes, ses phrases, les autres salons. */
function communityRoomPeek(): CommunityRoomPeek {
  const r = roomsMenu.remote();
  const present = shownCrowd(r.present ?? 0);
  return {
    id: r.room,
    name: r.name,
    ...(present ? { present } : {}),
    lines: r.lines.filter((l) => l.kind !== 'masked').map((l) => ({ time: l.time, nick: l.nick ?? '', hue: l.hue ?? 0, text: l.text, ...(l.kind === 'mention' ? { kind: 'mention' as const } : l.kind === 'own' ? { kind: 'own' as const } : {}) })),
    phrases: r.phrases,
    ...(r.blocked ? { blocked: r.blocked } : {}),
    others: (r.rooms ?? []).filter((x) => x.room !== r.room).map((x) => ({ id: x.room, name: x.name, ...(x.present ? { present: x.present } : {}) })),
  };
}
const communityHub = createCommunityHub({
  library,
  openSharing: (back) => library.runSystemItem('sharing', back),
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  net: socialNet,
  myLevel: () => levelTracker.view().level,
  players: {
    online: () => communityMenu.players(),
    everyone: () => communityMenu.everyone(),
    sharedTables: (key) => communityMenu.sharedTables(key),
    open: (back, tab) => communityMenu.openPlayers(back, tab),
    detail: () => communityMenu.item.detail ?? '',
  },
  profile: { open: (key, back) => profileMenu.openProfile(key, back), openMine: (back) => profileMenu.openMine(back) },
  friends: { find: () => friendsMenu.openFind(), requests: (back) => friendsMenu.openRequests(back) },
  messages: { waiting: () => communityWaiting(), recent: (max) => communityRecent(max), open: (back) => library.runSystemItem('messages', back), detail: () => chatMenu.item.detail ?? '' },
  groups: { mine: () => communityGroups(), open: (back) => groupsMenu.open(back), door: () => groupsMenu.door() },
  room: {
    peek: () => communityRoomPeek(),
    problem: () => communityRoomProblem(),
    write: (text) => roomsMenu.write(roomsMenu.defaultRoom(), text),
    open: (back) => roomsMenu.openDefault(back),
    openRoom: (id, back) => roomsMenu.openRoom(id as RoomId, back),
  },
  invite: {
    count: () => {
      const key = socialNet.state().key.publicKey;
      const card = socialNet.publicCard(key);
      return card ? invitedOf(key, card.invited, card.invitedTotal).count : 0;
    },
  },
  navKeys: () => KEYS,
});

// Arène (arena-menu.ts, 21/11/2026) : le médaillon de ce qui se joue contre les autres. Son affiche et
// son écran à onglets ; la rubrique Arène du Menu système range Parties en direct, Classements et
// Progression (fournis ci-dessus et par level-menu.ts).
/** Une table des classements (son nom, sa référence VPS) dans la collection montrée par la roue. */
function shelfTableOf(table: PresenceTable): TableEntry | undefined {
  return findWheelTable(collections.shelf().tables, table);
}
const arenaMenu = createArenaMenu({
  library,
  net: socialNet,
  levels: levelTracker,
  instant: instantMenu,
  rankings: rankingsMenu,
  daily: { detail: () => dailyTablesMenu.detail(), open: (back, from) => dailyTablesMenu.open(back, from) },
  level: levelMenu,
  history: { open: (back) => library.runSystemItem('game-history', back) },
  players: () => communityMenu.players(),
  // La roue sur la table d'un rival ou d'un record : comme une table touchée au téléphone.
  table: wheelTable,
  // La place qu'on vient de me prendre (place-taken.ts) : l'action du moment ; « Reprendre ma place » lance la table.
  places: {
    current: () => placeTaken.current(),
    retake: (taken) => {
      const entry = placeTaken.tableOf(taken);
      return entry ? () => playFromNotice(entry) : undefined;
    },
  },
  // « Lui écrire » : le fil de la messagerie, entre amis seulement.
  write: (key, back) => (socialNet.state().friends.some((f) => f.key === key) ? { run: () => chatMenu.openThread(key, back) } : { off: t('Entre amis seulement') }),
  // Les défis (challenges-menu.ts) : l'onglet « Défis », les cartes « Défi de … », la page de l'affiche, « Défier ».
  challenges: challengesMenu,
  navKeys: () => KEYS,
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
});
// Retour de partie (game-return.ts, 21/11/2026) : après une partie qui apporte du neuf, le score, les XP,
// le joueur dépassé et la suite ; avant le moment des badges, qui l'attend.
const gameReturn = createGameReturn({
  library,
  daily: dailyTables,
  friends: {
    isFriend: (key) => socialNet.state().friends.some((f) => f.key === key),
    send: (key, text) => chatService.send(key, text),
  },
  play: (table) => playFromNotice(table),
  // « Défier {nom} » : le joueur dépassé, avec le score de cette partie, sur sa version exacte.
  challenge: (rival, f, reopen) => challengesMenu.button({ key: rival.key, name: rival.name, ...(rival.country ? { country: rival.country } : {}) }, f.version ? challengeTableOf(f.version, presenceTable(f.table).title, presenceTable(f.table).vpsId) : undefined, f.report.best, 'game', 'challenge', reopen),
  zoneKeys: () => zoneSwitchKeys({ buttons, navigation }),
  canOpen: () => state.phase === 'menu' && !playing && !attract.active && !socialClosed() && !library.isActive(),
  log: (line) => console.log(line),
});

/** Un message sur une ligne : ses retours à la ligne deviennent des espaces. */
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ');

/**
 * Messages en attente (inbox-menu.ts, 17/11/2026) : les conversations où des messages attendent,
 * une ligne chacune (fil d'un ami, discussion d'un groupe, mentions dans un salon), et les accès
 * rapides de la communauté. Ouvert par la pastille des messages du coin d'état.
 */
function inboxThreads(): InboxThread[] {
  if (guest.active) return [];
  const s = socialNet.state();
  const me = s.key.publicKey;
  const out: InboxThread[] = [];
  const chat = chatService.state();
  if (chat.enabled) {
    for (const [key, c] of Object.entries(chat.conversations)) {
      const friend = s.friends.find((f) => f.key === key);
      if (!friend || !c.unread) continue;
      const last = [...c.lines].reverse().find((l) => !l.out && l.text);
      out.push({ kind: 'friend-message', id: key, name: friend.name, unread: c.unread, ...(c.muted ? { muted: true } : {}), ...(last?.text ? { last: { text: oneLine(last.text), at: Date.parse(last.at) } } : {}), avatar: avatarView(key, friend.name, socialNet.avatarFile(key)) });
    }
  }
  for (const { entry, view } of groupService.groups()) {
    if (!entry.unread || entry.gone) continue;
    const last = [...entry.lines].reverse().find((l) => l.by !== me && l.body.k === 'msg');
    const text = last?.body.k === 'msg' ? last.body.text : undefined;
    out.push({ kind: 'group-message', id: view.id, name: view.name, unread: entry.unread, ...(entry.muted ? { muted: true } : {}), ...(last && text ? { last: { who: last.name, text: oneLine(text), at: Date.parse(last.at) } } : {}) });
  }
  for (const r of roomsMenu.mentionThreads()) out.push({ kind: 'room-mention', id: r.room, name: r.name, unread: r.count, last: r.last });
  // Les réponses de l'équipe à mes rapports et à mes propositions (team-threads.ts).
  for (const x of teamThreads.visible()) {
    if (!x.unread) continue;
    const last = [...x.lines].reverse().find((l) => l.from === 'team');
    out.push({ kind: 'team-message', id: x.fil, name: x.title || t('Équipe Cyber Pinball'), unread: x.unread, ...(last ? { last: { who: t('Équipe Cyber Pinball'), text: oneLine(last.text), at: last.at } } : {}) });
  }
  return out;
}

/** Messages non lus d'une conversation ; undefined : elle n'existe plus (plus ami, groupe quitté). */
function threadPending(kind: MessageKind, thread: string): number | undefined {
  if (kind === 'friend-message') return socialNet.state().friends.some((f) => f.key === thread) ? (chatService.state().conversations[thread]?.unread ?? 0) : undefined;
  if (kind === 'group-message') {
    const entry = groupService.entry(thread);
    return !entry || entry.gone ? undefined : entry.unread;
  }
  if (kind === 'team-message') return teamThreads.thread(thread)?.unread;
  return roomsMenu.mentionThreads().find((r) => r.room === thread)?.count ?? 0;
}

/** Ouvre une conversation là où elle se tient ; son « Retour » vers `back`. */
function openThread(kind: MessageKind, thread: string, back: () => void): void {
  if (kind === 'friend-message') chatMenu.openThread(thread, back);
  else if (kind === 'group-message') groupsMenu.openGroup(thread, back);
  else if (kind === 'team-message') library.teamThreadsMenu?.openThread(thread, back);
  else roomsMenu.openRoom(thread, back);
}

/** Les accès rapides de la communauté, sous les conversations. */
function inboxLinks(): InboxLink[] {
  const rooms = roomsMenu.door();
  const groups = groupsMenu.door();
  return [
    { label: t('Messages'), detail: chatMenu.item.detail ?? '', icon: 'message', open: (back) => library.runSystemItem('messages', back) },
    { label: t('Groupes'), detail: groups.detail, icon: 'group', ...(groups.attention ? { attention: true } : {}), open: (back) => groupsMenu.open(back) },
    { label: rooms.label, detail: rooms.detail, icon: 'globe', open: (back) => roomsMenu.openDefault(back) },
    { label: t('Joueurs'), detail: friendsMenu.items.friends.detail ?? '', icon: 'friends', ...(friendsMenu.items['friend-requests'].attention ? { attention: true } : {}), open: (back) => communityMenu.openPlayers(back, 'friends') },
    { label: t('Activité récente'), detail: activityMenu.item.detail ?? '', icon: 'bell', open: (back) => activityMenu.open(back) },
  ];
}

const inboxMenu = createInboxMenu({
  library: { openCustom: (build, at) => library.openCustom(build, at) },
  threads: inboxThreads,
  open: openThread,
  links: inboxLinks,
});
library.provideSystemItem('game-history', friendsMenu.items['game-history']);
library.provideSystemItem('badges', levelMenu.badgesItem);
library.provideSystemItem('sharing', friendsMenu.items.sharing);
// « Jouer en local » (localplay.ts), au bout de la rubrique Communauté : activé, elle ne garde que lui.
library.provideSystemItem('local-play', createLocalPlayItem({ net: socialNet, library, redraw: () => broadcast() }));
// « Ajouter une table > Depuis un ami… » : la bibliothèque d'un ami, ses tables absentes d'abord.
library.provideAddFromFriend(friendsMenu.addFromFriend);
// « Masquer les notifications pendant les parties » : Start bascule, le curseur reste sur l'entrée.
library.provideSystemItem('quiet-in-game', {
  get detail() {
    return quietInGame
      ? t('Activé · connexion d’un ami, demande de rejoindre une partie, etc. : rien pendant une partie, tout reste dans le front-end')
      : t('Désactivé · connexion d’un ami, demande de rejoindre une partie, etc.');
  },
  run: () => {
    quietInGame = !quietInGame;
    writeQuietInGame(loc.dataDir, quietInGame);
    console.log(`Notifications pendant les parties : ${quietInGame ? 'masquées' : 'affichées'}.`); // i18n-ignore : journal
    library.openSystem();
  },
});
// Réalité virtuelle (vr-frontend.ts) : réglages, casque, manettes, calage, réseau de Link, parties dans le casque.
const vrFront = createVrFrontend({
  auditTurn,
  broadcast,
  buttonInput,
  findHeadsetAudio,
  handleKey,
  handleKeyUp,
  get KEYS() {
    return KEYS;
  },
  get launch() {
    return launch;
  },
  library,
  loc,
  get menuConfiguration() {
    return menuConfiguration;
  },
  get playing() {
    return playing;
  },
  get roleRects() {
    return roleRects;
  },
  get rotation() {
    return rotation;
  },
  showBanner,
  get state() {
    return state;
  },
  set state(value) {
    state = value;
  },
  get tables() {
    return tables;
  },
});

// « Vision 3D » (Menu système > Ma borne, vision3d-menu.ts) : la perspective des tables suit la tête du joueur.
const vision3dMenu = createVision3dMenu({
  loc,
  library,
  playing: () => playing !== undefined,
  launching: () => launch !== undefined,
  vrMode: () => vrFront.vrMode,
  headsetDetected: () => vrFront.headsetDetected(),
  showDesktop: () => showDesktop(),
});
const { headTracker, setVision3dTuning, prepareVision3d, warmVision3d, noteVision3dGame } = vision3dMenu;
// « Lunettes 3D » (même rubrique, anaglyph-menu.ts) : la table en relief avec des lunettes à filtres colorés.
const anaglyphMenu = createAnaglyphMenu({
  dataDir: loc.dataDir,
  library,
  keys: () => KEYS,
  vision3dOn: () => vision3dMenu.setting().mode === 'on',
  vrOn: () => vrFront.vrMode === 'auto',
  nvidia: (fresh, inis) => nvidia3dVision(fresh, inis),
  refreshNvidia: () => refreshNvidiaDriver(),
  stereo: (wanted) => stereoFor(wanted),
  flatNotice: (issue) => menuNotices.push([{ kind: 'stereo-flat' as const, key: `stereo-flat|${issue.id}|${issue.title}`, at: Date.now(), subject: issue.title }]),
  vpxLog: () => {
    const install = vpxInstall(loc);
    return lastLaunchLogPath() ?? (install ? path.join(vpxPrefDir(install.version), 'vpinball.log') : undefined);
  },
});
/**
 * Lunettes actives NVIDIA 3D Vision (nvidia-3dvision.ts) : pilote, émetteur, écran du playfield, VPX en place.
 * `inis` : les réglages qu'une partie lira (table d'abord) ; sinon le VPinballX.ini en vigueur.
 */
function nvidia3dVision(fresh = false, inis?: string[]) {
  return nvidia3dVisionFacts({ usb: () => usbDevices(), inis: () => inis ?? [activeVpxIni(loc)], vpx: () => vpxInstall(loc) }, fresh);
}
/**
 * Pour la santé de la borne : relevé seulement quand les lunettes NVIDIA sont choisies et activées (lu sur
 * disque). Le pilote relu d'abord sans bloquer : sinon une sonde synchrone figeait le front-end plusieurs
 * secondes à chaque relevé (15 s après le démarrage, puis toutes les 30 min).
 */
async function nvidia3dVisionChosen() {
  const s = readAnaglyph(loc.dataDir);
  if (s.mode !== 'on' || s.kind !== 'nvidia') return undefined;
  await refreshNvidiaDriver();
  return nvidia3dVision();
}


/** Une partie se prépare ou se joue : les relevés au journal attendent. */
function auditWaits(): boolean {
  return state.phase === 'intro' || state.phase === 'loading' || state.phase === 'playing';
}

/**
 * Entre deux tables d'un relevé au journal (auditVrBackglass, auditPupPacks) : rend la main aux
 * boutons et aux fenêtres, et attend la fin de la partie s'il y en a une. Ces relevés lisaient
 * toutes les tables d'une traite, 60 s après le démarrage, en figeant l'écran des tables pendant
 * plusieurs secondes, ou le lancement d'une table (17/11/2026).
 */
async function auditTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  while (auditWaits()) await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
}

/**
 * Relevé des PuP-Packs installés, une fois par lancement, au journal (règle globale : une panne d'un pack
 * devient un contrôle de tous). Fichiers nommés par le pack et absents, playlists que le pack joue vraiment
 * mais vides (emptyPlayedPlaylists) ; jamais bloquant : le diagnostic de la table propose de recompléter
 * le pack (« Ce qu'il manque pour jouer », étape PuP-Pack).
 */
async function auditPupPacks(): Promise<void> {
  const found: string[] = [];
  let packs = 0;
  for (const table of tables.filter((t) => t.emulator === 'vpx')) {
    await auditTurn();
    const folder = path.dirname(table.file);
    const pupvideos = pupVideosDir(folder);
    if (!pupvideos) continue;
    let script: string | undefined;
    for (const name of activePacks(folder)) {
      const root = path.join(pupvideos, name);
      if (!fs.existsSync(path.join(root, 'triggers.pup')) && !fs.existsSync(path.join(root, 'playlists.pup'))) continue;
      packs++;
      script ??= readTableScript(table.file) ?? '';
      const missing = missingPackFiles(root);
      const empty = emptyPlayedPlaylists(root, script);
      if (missing.length || empty.length) found.push(`${table.title} (${name}) : ${[...(missing.length ? [`${missing.length} fichier(s) absent(s), ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? '…' : ''}`] : []), ...(empty.length ? [`playlist(s) jouée(s) mais vide(s), ${empty.join(', ')}`] : [])].join(' ; ')}`); // i18n-ignore : journal
    }
  }
  console.log(`PuP-Packs : ${packs} pack(s) contrôlé(s), ${found.length} incomplet(s)${found.length ? ` : ${found.join(' | ')} ; « Ce qu’il manque pour jouer » propose de les recompléter` : ''}.`); // i18n-ignore : journal
}


// Scores des amis pendant la partie : la place de la bande, au choix du joueur (live-scores-menu.ts).
library.provideSystemItem(
  'live-scores',
  createLiveScoresMenu({
    library,
    get: () => library.kept('scores-en-partie', () => readLiveScoresSettings(loc.dataDir)),
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
  changed: () => {
    nightMode?.refresh(); // la nuit de l'horaire commence ou finit : le mode nuit lié à l'horaire suit
    broadcast();
  },
  done: (action, outcome) => powerFinished(action, outcome),
  log: (line) => console.log(line),
  clock: hoursClock,
});
/** Mode nuit (modenuit.ts) : volume, LED, voile des écrans, et toys/LED en partie (variante DOF). */
nightMode = createNightMode({
  settings: () => mediaSettings.nightMode,
  scheduleNight: () => hours.night(),
  journalFile: path.join(loc.dataDir, 'modenuit.json'),
  outputs: () => volumeOutputIds(loadCabinet(loc.dataDir)?.audio),
  dofSetup: () => readDof(loc),
  ledMaster: (level) => ledService.setMaster(level),
  changed: () => broadcast(),
  save: (next) => saveMediaSettings({ ...mediaSettings, nightMode: next }),
  log: (line) => console.log(line),
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
const desktop = new DesktopMode<BrowserWindow, WebContents>({
  windows: () => BrowserWindow.getAllWindows(),
  contents: () => webContents.getAllWebContents(),
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
/** Au bureau : l'appui long sur Start qui ramène le menu (watchStartHold). */
let desktopStartHold: (() => void) | undefined;
/** Au bureau : le bouton « Bureau Windows » de la borne, de joystick, qui ramène le menu (watchDesktopButton). */
let desktopButton: (() => void) | undefined;
/** Proposition de rendre à Windows l'orientation du bureau, en attente de réponse. */
let legacyOrientation: LegacyOrientation | undefined;
const DESKTOP_WATCH_MS = 500;
/** Veilleur de la relance par Start mis en place ce délai après le démarrage du menu. */
const RELAUNCH_SYNC_DELAY_MS = 15_000;

/** Le bouton Start de la borne pour la relance par Start : un bouton de joystick, la relance voulue. */
function startHoldCode(): string | undefined {
  return relaunchEnabled(loc.dataDir) ? joystickStartCode(buttons) : undefined;
}

/** Veilleur de la relance par Start dans l'état voulu (raccourci du dossier Démarrage, processus). */
function applyRelaunchWatcher(): void {
  if (OFFSCREEN) return;
  syncRelaunchWatcher({ dataDir: loc.dataDir, startupDir: dedicatedSystem.startupDir(), wanted: !shellSession() && Boolean(startHoldCode()) });
}

/**
 * Menu système > « Quitter ou éteindre » > « Bureau Windows », ou son raccourci depuis le menu : tous les écrans du PC
 * se libèrent, le bureau et les barres des tâches reviennent. Le même raccourci (global tant
 * que dure le mode bureau), le bouton du playfield dans la barre des tâches ou Alt+Tab
 * ramènent le menu sur tous ses écrans (restoreFromDesktop).
 *
 * L'écran ouvert reste tel quel (16/11/2026) : on revient du bureau là où on l'avait quitté (la
 * rubrique « Borne » sur « Bureau Windows », la Vision 3D…), jamais sur la roue faute de mieux.
 * Une relance au retour (quart de tour de l'écran) reprend la même place (relaunchMenu).
 */
function showDesktop(): boolean {
  if (desktop.active || state.phase === 'loading' || state.phase === 'playing') return true;
  // Borne dédiée : sans Explorateur, il n'y a pas de bureau ; une fenêtre de fichiers en tient
  // lieu (sous Shell Launcher, explorer.exe n'ouvre que cela, sans barre des tâches).
  if (shellSession() && !dedicatedSystem.explorerShown()) dedicatedSystem.openExplorer();
  setDesktopMode(true);
  const away = desktop.enter();
  // Le bureau dans l'orientation de Windows, le temps d'y travailler.
  orientationForDesktop();
  console.log(`Mode bureau : ${away.length} fenêtres de Cyber Pinball rangées (${away.filter(isVeil).length} voiles), tous les écrans libres, ${desktop.silenced} pages muettes.`);
  if (!OFFSCREEN && !globalShortcut.register(accelerator(SHORTCUTS.desktop), () => restoreFromDesktop())) {
    console.warn(`Mode bureau : ${shortcutLabel(SHORTCUTS.desktop)} est déjà pris par un autre programme ; la barre des tâches ramène le front-end.`);
  }
  const startCode = startHoldCode();
  if (startCode) desktopStartHold = watchStartHold(startCode, () => restoreFromDesktop());
  const buttonCode = KEYS.desktop.find((code) => joystickButton(code));
  if (buttonCode) desktopButton = watchDesktopButton(buttonCode, () => restoreFromDesktop());
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
  desktopStartHold?.();
  desktopStartHold = undefined;
  desktopButton?.();
  desktopButton = undefined;
  if (!OFFSCREEN) globalShortcut.unregister(accelerator(SHORTCUTS.desktop));
  // L'orientation de jeu revient ; un quart de tour change la taille des écrans, le menu rouvre ses fenêtres.
  const moved = orientationFromDesktop();
  desktop.leave();
  setDesktopMode(false);
  console.log('Mode bureau : retour au front-end.');
  if (moved) return relaunchMenu();
  // Rappelé par le raccourci global, depuis une autre application : Windows ne laisse pas toujours le focus.
  // Les barres des tâches, visibles au bureau, repassent derrière le menu.
  void takeForeground().then(() => settleScreens('desktop-back'));
  broadcast();
}

/**
 * Menu système > « Ma borne » > « Configuration de la borne » > « Boutons » > « Touches par défaut des encodeurs » : ce
 * qu'elle fait, puis Annuler (présélectionné) ou Remplacer. Sur une borne aux boutons de joystick, la
 * raison du refus et l'étape « Boutons » à la place : ses boutons ne répondraient plus.
 */
function openButtonsReset(): void {
  const check = resetCheck();
  if (check.state === 'none') return;
  library.openCustom(() =>
    check.state === 'refused'
      ? {
          heading: t('Touches par défaut des encodeurs'),
          icon: 'keyboard',
          lead: check.reason,
          sections: [],
          actions: [
            { label: t('Retour'), icon: 'back', run: () => openCabinetSetup() },
            { label: WIZARD_STEPS.find((s) => s.flag === '--boutons')!.label, icon: 'wizard', run: () => void relaunchWizard('--boutons') },
          ],
          back: () => openCabinetSetup(),
        }
      : {
          heading: t('Remplacer les boutons par les touches par défaut ?'),
          icon: 'keyboard',
          lead: resetConsequences(),
          sections: [],
          actions: [
            { label: t('Annuler'), icon: 'close', run: () => openCabinetSetup() },
            { label: t('Remplacer'), tone: 'warning', icon: 'keyboard', run: () => resetButtonsFromMenu() },
          ],
          back: () => openCabinetSetup(),
        },
  );
}

/** Remise confirmée : le menu suit aussitôt ces touches. */
function resetButtonsFromMenu(): void {
  const reset = resetButtons('Menu système'); // i18n-ignore : journal
  if (!reset) return;
  followButtons(reset.cabinet);
  state = { ...state, phase: 'message', message: { title: t('Touches par défaut des encodeurs remises'), lines: describeReset(reset) } };
  broadcast();
}

/** Menu système > « Ma borne » > « Configuration de la borne » > « Boutons » > « Rétablir les boutons d’avant » : le relevé gardé par la dernière remise. */
function restoreButtonsFromMenu(): void {
  const reset = restoreButtons();
  if (!reset) return;
  followButtons(reset.cabinet);
  state = { ...state, phase: 'message', message: { title: t('Boutons d’avant rétablis'), lines: describeRestore(reset) } };
  broadcast();
}

function followButtons(cabinet: Cabinet): void {
  buttons = cabinet.buttons;
  navigation = cabinet.navigation;
  KEYS = menuKeysFor(cabinet);
  library.leave();
  // La relance par Start suit le Start de ce relevé (bouton de joystick ou non).
  applyRelaunchWatcher();
}

export function startFrontend(): void {
  // Extensions signées du dossier plugins des données (plugins.ts) : chargées une fois, journal déjà ouvert, avant les écrans qui les appellent.
  loadPlugins(loc.dataDir);
  // Cyber Pinball relancé alors que le menu est ouvert : le menu revient (mode bureau quitté,
  // premier plan) ; pendant une partie, VPX garde l'écran.
  // Au bureau, une page ouverte entre-temps (morceau suivant du juke-box…) naît muette.
  app.on('web-contents-created', (_e, contents) => desktop.silence(contents));
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
  // Fluidité de l'écran des tables relevée par le plateau (cadence-ecran.js) : une ligne au journal.
  ipcMain.on('screen-pace', (event, pace: unknown) => {
    if (isHeadsetView(event.sender)) return;
    const line = screenPaceLine(pace);
    if (line) console.log(line);
  });
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
    // Réveil d'un clic dans le vide (souris-roue.js) : rien d'autre à faire quand l'écran ne dormait plus.
    if (action.type === 'wake') return;
    // Clic sur « Start : jouer » de la roue : un clic n'a pas de durée, il joue tout de suite.
    if (action.type === 'key' && state.phase === 'menu' && !state.help && wheelPlays() && KEYS.confirm.includes(action.code) && tables[state.index] && !onMedallion()) wheelConfirm(tables[state.index]!, false), broadcast();
    else if (action.type === 'key') handleKey({ type: 'keyDown', code: action.code, key: '' } as Input);
    // Roue dentée (ou cadenas, en mode invité).
    else if (action.type === 'config') guest.knock('menu.system') && openConfig();
    // Pastille des téléchargements.
    else if (action.type === 'downloads') openFromCorner((back) => library.downloads.open(undefined, back));
    // Pastille des amis en ligne, notification d'un ami ou d'une demande : l'écran qu'elle annonce.
    else if (action.type === 'friends') openFromCorner((back) => communityMenu.openPlayers(back, 'friends'));
    else if (action.type === 'friend-requests') openFromCorner((back) => friendsMenu.openRequests(back));
    // Carte du joueur (coin d'état) : Mon niveau ; pastille des badges : Mes badges.
    else if (action.type === 'level') openFromCorner((back) => levelMenu.open(back));
    else if (action.type === 'badges') openFromCorner((back) => levelMenu.openBadges(back));
    // Le moment d'un badge ou d'un niveau, vu : il ne revient plus.
    else if (action.type === 'level-seen') levelTracker.seen();
    // « J'aime » sur mon activité : Mon profil public, qui dit qui a aimé.
    else if (action.type === 'my-profile') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) profileMenu.openMine(state.phase === 'menu' ? () => library.leave() : undefined);
    }
    // Message d'un ami : son fil (celui du dernier message non lu), sinon la liste des conversations.
    else if (action.type === 'moderation') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) roomsMenu.openModeration(state.phase === 'menu' ? () => library.leave() : () => library.openSystem());
    }
    else if (action.type === 'rooms') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) roomsMenu.openMention(state.phase === 'menu' ? () => library.leave() : () => library.openSystem());
    }
    else if (action.type === 'groups') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) groupsMenu.openNews(state.phase === 'menu' ? () => library.leave() : () => library.openSystem());
    }
    // Pastille des messages en attente : l'écran qui les réunit.
    else if (action.type === 'inbox') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) inboxMenu.open(state.phase === 'menu' ? () => library.leave() : () => library.openSystem());
    }
    // Réponse de l'équipe : l'échange qui l'attend (le plus récent non lu), sinon la liste des échanges.
    else if (action.type === 'team-threads') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system') && library.teamThreadsMenu) {
        const back = state.phase === 'menu' ? () => library.leave() : () => library.openSystem();
        const waiting = teamThreads.visible().find((x) => x.unread);
        if (waiting) library.teamThreadsMenu.openThread(waiting.fil, back);
        else library.teamThreadsMenu.openList(back);
      }
    }
    else if (action.type === 'messages') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) chatMenu.openUnread(state.phase === 'menu' ? () => library.leave() : undefined);
    }
    // Nouvelle de la partie entre amis (au menu des tables ou dans le menu système) : l'écran de la partie.
    else if (action.type === 'live-game') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) friendsMenu.live.open(() => library.leave());
    }
    // Place prise : « Reprendre ma place », la table lancée ; absente de la borne, Activité récente dit pourquoi.
    else if (action.type === 'place-taken') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) {
        const run = action.key ? placeTaken.reach(action.key).run : undefined;
        if (run) run();
        else activityMenu.open(state.phase === 'menu' ? () => library.leave() : undefined);
      }
    }
    // Un défi : son écran (challenges-menu.ts) ; sans défi nommé, Activité récente.
    else if (action.type === 'challenge') {
      if ((state.phase === 'menu' || state.phase === 'library') && guest.knock('menu.system')) {
        const back = state.phase === 'menu' ? () => library.leave() : () => library.openSystem();
        if (typeof action.id === 'string' && challengeService.get(action.id)) challengesMenu.openChallenge(action.id, back);
        else activityMenu.open(state.phase === 'menu' ? () => library.leave() : undefined);
      }
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
      if (action.offset === 0 && onCommunity()) return void openCommunity();
      if (action.offset === 0 && onArena()) return void openArena();
      if (action.offset === 0 && onCollections()) return void openCollectionsMedallion();
      if (action.offset === 0) wheelConfirm(tables[state.index]!, !wheelPlays());
      else if (guest.knock('menu.choose')) moveSelection(action.offset);
      broadcast();
    } else library.handleAction(action);
  });

  const install = vpxInstall(loc);
  let runtime: VcRuntimeStatus | undefined;
  const { assignments, problem, manual, choose, selection } = syncScreens();
  tables = scanOrdered();
  // Table au démarrage : la première de l'ordre choisi, une au hasard, ou la dernière jouée.
  state = { ...state, index: startIndex(tables, mediaSettings.startTable) }; // garde le médaillon : celui du démarrage (Juke-box) se pose ensuite
  // Collection gardée du dernier démarrage (ou imposée par le mode invité) : la table de départ y est prise.
  collections.start();
  logCollectionKeys();
  // Configuration à choisir : le menu s'ouvre droit sur l'écran principal, avec les boutons de la dernière utilisée.
  const cabinet = loadCabinet(loc.dataDir);
  menuDmdKind = cabinet && !choose ? dmdKindOf(cabinet) : undefined;
  menuConfiguration = cabinet && !choose ? cabinet.id : undefined;
  // DMD réel dans le menu (bêta) : dmdserver lancé caché si « Image du menu : oui » et un DMD est allumé.
  applyMenuDmdServer();
  // Rotation d'après l'écran du playfield tel que Windows le décrit maintenant : une
  // orientation changée hors de l'assistant fait aussi tourner le menu.
  rotation = menuRotation(choose ? undefined : cabinet, choose ? undefined : assignments.playfield);
  buttons = cabinet?.buttons;
  tilt = cabinet?.tilt;
  navigation = cabinet?.navigation;
  KEYS = menuKeysFor(cabinet);
  // Le veilleur de la relance par Start suit le Start relevé ; relancé ici s'il ne tourne pas (après une mise à jour).
  // Après l'ouverture : tasklist et le raccourci ne la retardent pas.
  setTimeout(applyRelaunchWatcher, RELAUNCH_SYNC_DELAY_MS).unref();
  audioOutput = choose ? undefined : menuAudioOutput(cabinet)?.friendlyName;
  // Mode nuit : ce qu'un plantage a laissé (volume, config DOF) est remis, puis le mode se réapplique s'il est voulu.
  nightMode?.recover();
  nightMode?.refresh();
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
  romFirstBoot ??= new RomFirstBoot({
    dataDir: loc.dataDir,
    root: () => loc.root,
    tables: () => tables,
    busy: () => state.phase === 'loading' || state.phase === 'playing' || desktop.active,
    // Hors écran (essais sans opérateur), rien d'office : seulement avant une partie.
    automatic: !OFFSCREEN,
    log: (line) => console.log(line),
  });
  romMusic ??= new RomMusic({
    dataDir: loc.dataDir,
    root: () => loc.root,
    tables: () => tables,
    // Une mise en route de ROM passe d'abord : la musique attend qu'elle ait fini.
    busy: () => state.phase === 'loading' || state.phase === 'playing' || desktop.active || romFirstBoot?.active() === true,
    converter: () => (converter ??= createConverter()),
    onChange: (recorded) => {
      // Une musique de plus : la musique des jeux est recherchée de nouveau, tout de suite.
      if (recorded) {
        medias?.invalidate();
        headsetMedias?.invalidate();
      }
      broadcast();
    },
    // Hors écran (essais sans opérateur), rien d'office : seulement ce que l'écran demande.
    automatic: !OFFSCREEN,
    log: (line) => console.log(line),
  });
  medias = new MenuMedias({ root: loc.root, dataDir: loc.dataDir, cabinet: choose ? undefined : cabinet, rotation, romAudio: (table) => romMusic?.file(table), onChange: () => broadcast() });
  // Couleur de chaque table (table-tint.ts) : mesurée par le convertisseur hors écran, une fois par média.
  // La teinte passe aussi au halo des cadres de la borne dans le casque (casque.ts).
  tints = new TableTints({
    dataDir: loc.dataDir,
    converter: () => (converter ??= createConverter()),
    onChange: () => {
      broadcast();
      vrFront.headset?.tintChanged();
    },
  });
  // Logos de la roue réduits à leur taille d'affichage (wheel-thumbs.ts), jamais pendant une partie.
  wheelThumbs = new WheelThumbs({
    dataDir: loc.dataDir,
    converter: () => (converter ??= createConverter()),
    idle: () => state.phase !== 'playing' && state.phase !== 'loading',
    log: (line) => console.log(line),
  });
  // Les avatars des joueurs (avatar.ts) et les miniatures de la roue se lisent aussi par le protocole des médias.
  serveMedias(() => [...medias!.allowedDirs(tables), avatarsDir(loc.dataDir), wheelThumbs!.dir]);
  // Morceaux du Juke-box lus hors du processus principal (jukebox-media-server.ts).
  startJukeboxMedia({ log: (line) => console.log(line) });
  app.on('will-quit', () => stopJukeboxMedia());

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
        // L'écran de la gestion des tables ouvert relit ce qu'il montre (ses lectures sont gardées, library.ts).
        library.changed();
        broadcast();
      },
    });
  }
  app.on('before-quit', () => {
    closing = true;
    ledAnimations.dispose();
    nightMode?.stop();
    void ledService.stop();
    // dmdserver ne survit pas au menu : VPX lancé ailleurs retrouverait le DMD en direct.
    menuDmdServer().stop();
    vrFront.headset?.dispose();
    vrFront.ovrProbe.set(false);
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
  // Écran qui change de place ou de définition (un jeu en plein écran exclusif, partie comprise) :
  // chaque fenêtre suit d'abord l'écran de son rôle (game-screens.ts).
  onScreensSettled(() => {
    followMenuScreens();
    return playing || launch || recoverScreens('displays');
  });
  // Pendant une partie ou un lancement, VPX couvre les écrans : le voile seul y est normal.
  setScreensBusy(() => Boolean(playing || launch));
  vrFront.headset = new HeadsetMenu({
    appDir: path.join(__dirname, '..'),
    wanted: () =>
      headsetWanted({
        paused: vrFront.headsetPaused,
        closing,
        trial: Boolean(HEADSET_TRIAL_DIR),
        vrAuto: vrFront.vrMode === 'auto',
        gameBusy: Boolean(playing || launch),
        running: Boolean(vrFront.headset?.running),
        ready: () => probeVr().ready,
      }),
    loader: () => {
      const exe = vpxInstall(loc)?.exe;
      const loader = exe && path.join(path.dirname(exe), 'openxr_loader64.dll');
      return loader && fs.existsSync(loader) ? loader : undefined;
    },
    sources: () => vrFront.headsetSources(),
    playfieldRotation: () => vrFront.headsetTurn(),
    // Tailles réelles des écrans seulement sur une vraie borne calée ; ailleurs, les proportions d'une borne.
    standardHead: () => vrFront.headsetSetting() === 'bureau' || !isCalibrated(vrFront.headset?.place()),
    tint: () => tints?.current()?.color,
    snapshotDir: path.join(loc.dataDir, 'logs', 'casque'),
    placeFile: vrFront.headsetPlaceFile(),
    contour: () => vrFront.roomFrame.effective(),
    keyDir: path.join(loc.dataDir, 'vr'),
    onStateChange: () => {
      // Casque porté : les écrans rendus pour lui dessinent ; retiré, ils se reposent, et les écrans du PC
      // restent sur « Dans le casque » tant que le compagnon le garde (HeadsetMenu.inUse).
      setHeadsetPainting(Boolean(vrFront.headset?.worn));
      if (!vrFront.headset?.worn) vrFront.releaseHeadsetButtons();
      // Session du casque : le réseau relevé au port ; casque retiré au menu, la session finit, l'avertissement
      // « Air Link sur un PC en Wi-Fi » pourra revenir à la suivante.
      if (vrFront.headset?.worn && !vrFront.headsetWornBefore) vrFront.refreshVrNetwork();
      if (vrFront.headset?.worn && !vrFront.headsetWornBefore) vrFront.calibrationComboTip();
      // Casque remis : l'ancrage sur le contour effectif (un contour rafraîchi pendant qu'il ne l'était pas).
      if (vrFront.headset?.worn && !vrFront.headsetWornBefore) {
        const r = vrFront.anchorCheck();
        if (vrFront.portWatch?.refreshed && r) vrFront.portWatch.contour = r;
      }
      if (!vrFront.headset?.worn && vrFront.headsetWornBefore && !playing && !launch) vrFront.airLinkWarned = false;
      vrFront.headsetWornBefore = Boolean(vrFront.headset?.worn);
      // Compagnon parti pendant le calage : rien à garder.
      if (vrFront.calibration && !vrFront.headset?.running) vrFront.closeCalibration();
      // Manettes sans réglage pour cette configuration, puis borne pas encore calée : l'assistant et le
      // calage s'ouvrent d'office dans le casque, avant la navigation.
      if (vrFront.headset?.worn) vrFront.offerControllerWizard();
      if (vrFront.headset?.worn) vrFront.offerCalibration('premier-port');
      // Compagnon parti pendant l'assistant : rien à garder.
      if (vrFront.controllerWizard && !vrFront.headset?.running) vrFront.closeControllerWizard(false);
      broadcast();
    },
    openViews: () => {
      headsetMedias ??= loc.root ? new MenuMedias({ root: loc.root, dataDir: loc.dataDir, cabinet: loadCabinet(loc.dataDir), rotation: vrFront.headsetTurn(), romAudio: (table) => romMusic?.file(table), onChange: () => broadcast() }) : undefined;
      openHeadsetViews(headsetPages, {
        appDir: path.join(__dirname, '..'),
        playfieldRotation: vrFront.headsetTurn(),
        onTexture: (surface, texture) => (vrFront.headset ? vrFront.headset.relay(surface, texture) : texture.release()),
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
    onButton: (button, down) => vrFront.headsetButton(button, down),
    onProfile: () => vrFront.offerControllerWizard(),
    onPoints: (points, room, head, pressed, grips) => vrFront.calibrationPoints(points, room, head, pressed, grips),
    onOriginReset: (afterRemoval) => vrFront.headsetOriginReset(afterRemoval),
    onPutBackOn: () => {
      vrFront.checkStaleCalibration();
      vrFront.headsetPutBackOn();
    },
    onStationary: () => vrFront.roomscaleTip(),
    onLost: (inGame) => vrFront.headsetLost(inGame),
    onHead: (head) => vrFront.headInGame(head),
    onReady: () => vrFront.companionReady(),
    onCentre: (gaze) => vrFront.calibrationCentre(gaze),
    onEyes: (eyes) => {
      vrFront.headsetEyes = eyes;
      if (vrFront.calibration) vrFront.showCalibration();
    },
    onRoom: () => vrFront.checkStaleCalibration(),
    onRoomRestart: (eyes) => {
      vrFront.roomStale = Boolean(eyeHeightProblem(eyes));
      console.log(`Casque : session neuve après le changement de pièce, yeux à ${eyes.toFixed(2)} m${vrFront.roomStale ? ' : le sol de la pièce d’origine est faux, les applications qui démarrent la reçoivent ainsi' : ''}.`); // i18n-ignore : journal
      if (vrFront.calibration) vrFront.showCalibration();
      else if (vrFront.roomStale) vrFront.offerCalibration('piece-perimee');
    },
    log: (line) => console.log(line),
  });
  vrFront.headset.watch();
  // Les images du schéma pour la pause en partie, préparées d'avance (prepareVr est synchrone).
  vrFront.readyCalibrateImage(false);
  vrFront.readyCalibrateImage(true);
  // Sonde LibOVR (sonde-ovr.ts) : mesure seulement, tant que la réalité virtuelle est activée.
  vrFront.ovrProbe.set(vrFront.vrMode === 'auto');
  // Horaire de la borne : nuit et arrêt programmé, d'après les réglages de medias.json.
  hours.start();
  // Diagnostic : les tables dont le fronton serait vide dans le casque (capture de PuP, sans flasher du fronton),
  // et les PuP-Packs incomplets (fichiers absents, playlists jouées mais vides).
  // Table par table, en rendant la main entre deux, et jamais pendant une partie (auditTurn).
  setTimeout(() => {
    void (async () => {
      await vrFront.auditVrBackglass();
      await auditPupPacks();
    })().catch((error: unknown) => console.warn(`Relevés du démarrage interrompus : ${String(error)}`)); // i18n-ignore : journal
  }, 60_000);
  // Réseau des bornes : présence aux amis, annuaire ; un échec s'affiche dans « Partage et réseau ».
  void socialNet.start().then(async () => {
    levelTracker.start();
    // Les défis : mes notes redites à chaque bonjour, les nouvelles et les échéances (challenge-service.ts).
    challengeService.start();
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
  if (orientationProblems.length) showBanner(orientationProblems, 'cabinet');
  const legacy = choose ? undefined : legacyDesktopTurned();
  if (cabinet && !choose && dmdKindQuestion(cabinet)) showBanner(tLater('Écran du DMD à vérifier : FullDMD ou DMD seul ? Menu système > Ma borne > Configuration de la borne > Écrans > Écran du DMD.'), 'cabinet');
  if (selection?.previous && selection.configuration) showBanner(tLater('Configuration « {name} » reconnue (avant : « {previous} »).', { name: selection.configuration.name, previous: selection.previous.name }), 'cabinet');
  // Après une mise à jour : la nouvelle version est-elle là ?
  const updateNotice = updates.startupNotice();
  updates.startBackgroundChecks();
  // Réveil du PC : les minuteries n'ont pas compté la veille, une recherche tout de suite.
  powerMonitor.on('resume', () => updates.checkSoon());
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
        lines: [...buttonProblems(buttons), t('Les touches par défaut des encodeurs servent en attendant.'), t('Start : refaire l’étape « Boutons » · Exit : Menu système')],
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
        lines: [...navigationProblems(navigation), t('Les flippers, Start et Exit du jeu servent en attendant.'), t('Start : refaire l’étape « Boutons de l’interface » · Exit : Menu système')],
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
        : { title: t("VPX n'est pas installé"), lines: [t('Lance « Installer » depuis le lanceur, puis reviens ici.')] },
    };
  } else if (loc.root && !(runtime = vcRuntimeReady()).ok) {
    // Windows neuf : VPX est là, mais pas le runtime Visual C++ sans lequel il ne démarre pas (vc-runtime.ts).
    console.log(`Runtime Visual C++ insuffisant pour VPX au démarrage : ${describeVcRuntime(runtime)}.`); // i18n-ignore : journal
    state = { ...state, phase: 'message', message: vcRuntimeMessage(runtime) };
  } else if (tables.length === 0) {
    state = { ...state, phase: 'message', message: noTables() };
  }

  // Pseudo pas encore choisi (premier démarrage, juste après l'assistant de l'installation, ou profil
  // resté au nom d'office) : il est obligatoire, l'écran du profil passe avant la suite. Jamais en
  // mode invité ; pas pendant un essai sans opérateur, sauf demandé.
  const unattended = Boolean(process.env.CYBERPINBALL_AUTOPILOT || process.env.CYBERPINBALL_STRESS);
  const welcome = !choose && !guest.active && (!unattended || process.env.CYBERPINBALL_PROFIL === '1') && profileWelcomeDue(socialNet.state());
  // Conditions d'utilisation pas encore acceptées dans leur version en cours (installation sans
  // l'installeur, texte changé par une mise à jour) : avant tout le reste. Jamais en mode invité
  // (la borne n'est pas à l'invité) ; pas pendant un essai sans opérateur, sauf demandé.
  const terms = !choose && !guest.active && (!unattended || process.env.CYBERPINBALL_CONDITIONS === '1') && termsMenu.due();
  const startupScreens = terms || welcome ? { terms, welcome } : undefined;

  // Ouverture : quand le démarrage arrive sur le menu des tables, avant la roue.
  if (!choose && introAtStartup({ settings: mediaSettings.intro, landing: state.phase, argv: process.argv, env: process.env })) {
    beginIntro('menu');
    // Une fenêtre qui ne dit jamais « prête » ne retient pas les autres.
    setTimeout(() => introRun.start() && introStarted(), INTRO_READY_MAX_MS);
    // Conditions et profil attendent la fin de l'ouverture : rien ne se pose sur les animations.
    pendingStartupScreens = startupScreens;
  } else if (startupScreens) openStartupScreens(startupScreens);
  // Relance par le menu lui-même (retour du bureau, langue…) : la table et la rubrique d'avant.
  resumeMenuPlace(readResume(process.argv), Boolean(startupScreens));

  const stress = process.env.CYBERPINBALL_STRESS;
  // L'endurance lance de vraies parties : jamais hors écran.
  if (stress && refuseOffscreen(t('Le test d’endurance'))) {
    process.exitCode = 1;
    return void quit();
  }
  if (stress && install) void runStress(stress, process.env.CYBERPINBALL_TABLE);
  const autopilot = process.env.CYBERPINBALL_AUTOPILOT;
  if (autopilot && !stress) {
    // Une étape qui lève (capture, page détruite) arrête l'essai, dit pourquoi et ferme l'application :
    // sans cela, l'application restait ouverte et la démonstration attendait sans fin.
    const replay = library.autopilot(autopilot.split(','), process.env.CYBERPINBALL_CAPTURE, (input) => (input.type === 'keyUp' ? handleKeyUp(input) : handleKey(input)), () => state.phase);
    replay.catch((error: Error) => {
      console.log(`Autopilote : arrêt sur erreur (${error.stack ?? error.message}).`); // i18n-ignore : journal des essais
      quit();
    });
  }
}

/** Les tables du disque, dans l'ordre choisi pour le menu. */
function scanOrdered(): TableEntry[] {
  return loc.root ? sortTables(scanTables(layoutOf(loc.root).tables), mediaSettings.tableOrder, shuffleKeys) : [];
}

function noTables(): Message {
  return { title: t('Aucune table'), lines: [t('Start : ajouter une table.'), t('Exit : Menu système.')], action: 'addTable' };
}

/** Relit les tables après un ajout, une réparation ou une suppression, en gardant la sélection. */
function reloadTables(selectFile?: string): void {
  const current = tables[state.index]?.file;
  tables = scanOrdered();
  // Médias ajoutés, remplacés ou supprimés avec les tables : tout est recherché à nouveau.
  medias?.invalidate();
  romMusic?.tablesChanged();
  romFirstBoot?.tablesChanged();
  headsetMedias?.invalidate();
  // Dossier des tables ou des médias créé depuis le démarrage (première table) : guetté aussi.
  mediaWatch?.rearm();
  const wanted = selectFile ?? current;
  const index = tables.findIndex((t) => t.file.toLowerCase() === wanted?.toLowerCase());
  // garde le médaillon : une relecture vient aussi d'un téléchargement fini en arrière-plan ; elle ne fait pas quitter la Communauté ou le Juke-box qu'on regarde
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
          t('Start : relancer l’assistant d’écrans · Exit : Menu système (Configurations de la borne pour en changer).'),
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
function browserScreenRect(): { bounds: Rectangle; notice?: string; label?: string } | undefined {
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
  roleRects = surfaceRoleRects(surfaces);
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
    // Ctrl et Maj d'un raccourci (Ctrl+Maj+D…) n'y agissent pas en MagnaSave ni en flipper (keyboardChords).
    onKeyInput(win, keyboardChords.down, keyboardChords.up);
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
  // Juke-box : Start relâché tôt joue ou met en pause ; maintenu, il a déjà ouvert la gestion.
  if (state.phase === 'jukebox') jukeboxPlayer.handleKey(input);
}

/**
 * Touches du clavier des fenêtres du menu : Ctrl et Maj, qui sont aussi MagnaSave et flippers,
 * attendent un instant ; suivis d'un raccourci de Cyber Pinball (Ctrl+Maj+D…), ils n'agissent pas
 * (modifier-chords.ts, 16/11/2026). Joystick, téléphone et casque n'y passent pas.
 */
const keyboardChords = createModifierChords<Input>({ down: (input) => handleKey(input), up: (input) => handleKeyUp(input), isShortcut: isAppShortcut });

/**
 * Touches et boutons du menu. En mode invité, chaque porte (GUEST_DOORS) laisse passer ou non :
 * fermée, rien ne se passe que l'indice « Verrouillé » près du cadenas.
 */
function handleKey(input: Input, fromPhone = false): boolean {
  if (!fromPhone) cabinetVolume?.windowInput(input);
  // Le moment d'un badge ou d'un niveau : une touche le ferme (pas dans la première seconde et
  // demie : un bouton encore tenu au retour de la partie ne l'efface pas avant qu'on l'ait vu).
  if (levelMomentAt && state.phase === 'menu' && levelTracker.pending()) {
    if (Date.now() - levelMomentAt > 1500) levelTracker.seen();
    return true;
  }
  const is = (group: string[]) => group.includes(input.code);
  // Un bouton de la combinaison appuyé pendant qu'un autre est tenu ne fait rien d'autre. Le
  // téléphone n'y entre pas : on ne déverrouille le mode invité qu'à la borne.
  if (!fromPhone && guest.input(input.code, true, unlockListening())) return true;
  if (input.control && input.code === 'KeyQ') return guest.knock('shortcut.quit') ? quit() : true;
  // Extinction, veille ou redémarrage en cours : plus rien ne se choisit.
  if (state.phase === 'message' && state.message?.action === 'power') return true;
  // Calage de la borne aux manettes : Start garde, Exit annule, rien d'autre.
  if (vrFront.controllerWizard) {
    if (!input.isAutoRepeat && KEYS.exit.includes(input.code)) vrFront.closeControllerWizard(false);
    return true;
  }
  if (vrFront.calibration) return vrFront.calibrationKey(input);
  // Menu montré dans le casque : la touche de recentrage de VPX (5 du pavé) remet la borne devant le joueur.
  if (input.code === 'Numpad5' && !input.isAutoRepeat && vrFront.headset?.state === 'shown') {
    vrFront.headset.recenter();
    console.log('Casque : borne recentrée sur le regard du joueur (5 du pavé).'); // i18n-ignore : journal
    return true;
  }
  // Raccourci du mode bureau, de n'importe quel écran du menu (sauf pendant une partie) ; une fenêtre rouverte au bureau le reçoit aussi : retour.
  // Une touche tenue n'y revient pas : D encore enfoncé au retour du bureau (raccourci global) ne repartait pas aussitôt au bureau.
  if (matchesShortcut(input, SHORTCUTS.desktop)) return input.isAutoRepeat ? true : desktop.active ? (restoreFromDesktop(), true) : guest.knock('shortcut.desktop') ? showDesktop() : true;
  // Bouton « Bureau Windows » de la borne (Boutons de l'interface, facultatif) : de même, d'un appui, de n'importe quel écran du menu.
  if (is(KEYS.desktop)) return input.isAutoRepeat ? true : desktop.active ? (restoreFromDesktop(), true) : guest.knock('shortcut.desktop') ? showDesktop() : true;
  // N'importe quel bouton en mode attente y met fin, sans autre effet ; sinon il remet le compte à zéro.
  // Le préavis d'arrêt de l'horaire aussi : la borne reste allumée tant qu'on joue.
  const noticed = hours.activity();
  if (attract.activity() || noticed) return leaveAttract();
  // Ouverture : n'importe quel bouton affiche la roue (pendant la lecture aussi), sans autre effet.
  if (state.phase === 'intro') return leaveIntro();

  // Un téléphone a lu le QR de l'écran affiché (télécommande, clavier à l'écran) : Start et Exit
  // sont à lui, jamais à l'écran derrière. Start l'accepte, Exit le refuse.
  if (!fromPhone && !input.isAutoRepeat && state.phase === 'library' && (phoneRemote.pendingOn('menu') || phoneRemote.pendingOn('keyboard') || phoneRemote.pendingOn('browser'))) {
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

  // Choix des boutons des collections : l'appui est pris par l'écran qui l'attend.
  if (captureCollectionKey(input)) return true;
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
      // Partie échouée : un flipper ouvre « Envoyer un rapport aux développeurs », ce problème déjà rappelé.
      if (state.message?.report && library.feedback && (is(KEYS.next) || is(KEYS.previous))) {
        openFailureReport(state.message.report);
        return true;
      }
      if (!is(KEYS.confirm) && !is(KEYS.exit)) return false;
      // Premier plantage : en quittant l'écran, la question des rapports automatiques (une seule fois).
      if (is(KEYS.exit) && state.message?.report?.consent && library.feedback?.consent() === 'ask') {
        const r = state.message.report;
        library.feedback.askConsent(r.signature, r.table, r.about, () => library.leave());
        return true;
      }
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
      // Autre menu de borne ouvert, ou Pinball FX3 jamais ouvert sur ce PC : Start joue quand même.
      if (state.message?.action === 'otherFrontend' || state.message?.action === 'zenFirstRun') {
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
      // Le rôle du bouton : la même résolution que dans le Juke-box (menuButton).
      const button = menuButton(input.code, KEYS, collectionKeys());
      // Bouton tenu : la roue tourne au plus de 10 tables par seconde ; une répétition écartée ne renvoie rien.
      if ((button === 'previous' || button === 'next') && !wheelRepeat.take(Boolean(input.isAutoRepeat))) return true;
      if (button === 'help') guest.knock('menu.commands') && (state = { ...state, help: !state.help });
      else if (state.help && button === 'exit') state = { ...state, help: false };
      else if (button === 'previous') guest.knock('menu.choose') && moveSelection(-1);
      else if (button === 'next') guest.knock('menu.choose') && moveSelection(1);
      else if (button === 'confirm' && onJukebox()) {
        // Médaillon Juke-box : Start ouvre le lecteur (rien ne démarre seul).
        if (!input.isAutoRepeat) openJukebox();
        return true;
      } else if (button === 'confirm' && onCommunity()) {
        // Médaillon Communauté : Start ouvre l'accueil.
        if (!input.isAutoRepeat) openCommunity();
        return true;
      } else if (button === 'confirm' && onArena()) {
        // Médaillon Arène : Start ouvre son écran à onglets.
        if (!input.isAutoRepeat) openArena();
        return true;
      } else if (button === 'confirm' && onCollections()) {
        // Médaillon Collections : Start ouvre la liste des collections.
        if (!input.isAutoRepeat) openCollectionsMedallion();
        return true;
      } else if (button === 'confirm') {
        // « Jouer directement » : l'appui attend son relâchement (partie) ou sa durée (fiche) ; la répétition d'une touche tenue n'y change rien.
        if (!wheelPlays()) wheelConfirm(tables[state.index]!, true);
        else if (!input.isAutoRepeat) pressWheelStart(input.code);
      } else if (button === 'settings') !onMedallion() && guest.knock('menu.vpx-settings') && openVpxSettings();
      else if (button === 'exit') guest.knock('menu.system') && library.openSystem();
      else if (button === 'collection-previous') changeCollection({ step: -1 });
      else if (button === 'collection-next') changeCollection({ step: 1 });
      // « Jouer directement » : F6 d'un clavier ouvre aussi la fiche (les MagnaSave de la borne changent de collection).
      else if (wheelPlays() && is(sheetKeys()) && !onMedallion()) {
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
/** Playfield de la borne tel que VPX le verra (sens des tables) ; undefined sans configuration ni playfield branché. */
function currentPlayfieldOrientation(): ReturnType<typeof playfieldOrientation> {
  const cabinet = loadCabinet(loc.dataDir);
  return cabinet ? playfieldOrientation(cabinet, observedDisplays(), readTextIfExists(activeVpxIni(loc))) : undefined;
}

/** Vidéos du DMD de la table ramenées à la taille du DMD avant la partie ; rien si le script n'a pas de dossier de DMD. */
async function shrinkTableDmdVideos(table: TableEntry): Promise<void> {
  const facts = cachedScript(table.file, loc.dataDir);
  if (!loc.root || !facts?.dmdFolder) return;
  const layout = layoutOf(loc.root);
  try {
    await shrinkDmdVideos({
      tableFolder: table.folder,
      dmdFolder: facts.dmdFolder,
      converter: (converter ??= createConverter()),
      trashDir: trashDirFor(layout.trash, `Avant la partie ${path.basename(table.folder)}`), // i18n-ignore : nom de dossier
      log: (line) => console.log(line),
    });
  } catch (error) {
    console.log(`Vidéos du DMD (${table.id}) : réduction impossible (${(error as Error).message}).`); // i18n-ignore : journal
  }
}

function preparePupPack(table: TableEntry): void {
  if (!loc.root) return;
  const layout = layoutOf(loc.root);
  try {
    const done = repairPupForPlay(
      table,
      // Le journal de la partie précédente : un appel refusé par un plugin (fronton B2S) y réclame un correctif du script.
      { tablesDir: layout.tables, script: cachedScript(table.file, loc.dataDir), cabinet: pupCabinet(loadCabinet(loc.dataDir)), orientation: currentPlayfieldOrientation(), vpxLog: readVpxLogTail(vpxLogPath(loc)) },
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
 * Partie d'une table d'un jeu de Zen (Pinball FX, Pinball FX3). Chargement, cinéma, écrans et retour
 * comme pour VPX ; rien de ce qui lui est propre (INI, ROM, PuP-Pack, DMD, VR, réglages en partie,
 * scores lus dans la ROM) : le jeu règle lui-même ses écrans et son DMD dans son mode borne. La partie compte dans les
 * statistiques de la table ; son score n'est pas lisible, ni tableau ni classement.
 */
async function playPinballFx(table: TableEntry, autoStopAfterMs: number | undefined, mode: 'display' | undefined, simulated: string | undefined, firstRunSeen = false): Promise<PlayReport | undefined> {
  // Pinball FX ou Pinball FX3 (17/11/2026) : même partie, chacun sa détection et sa commande.
  // Future Pinball (19/11/2026) aussi : sa détection, sa commande et ses messages dans futurepinball-play.ts.
  const fp = table.emulator === 'futurepinball' ? futurePinballPlan(table, { simulated, mode, install: simulated === undefined ? detectFuturePinball(loc.dataDir, loc.root) : undefined }) : undefined;
  const zenKey = (fp ? undefined : table.emulator) as ZenGameKey | undefined;
  const zenName = fp ? fp.name : ZEN_GAMES[zenKey!].name;
  const launchGame = fp ? fp.launchGame : ZEN_LAUNCH_GAMES[zenKey!];
  const fx = simulated === undefined && zenKey === 'pinballfx' ? detectPinballFx() : undefined;
  // FX3 : le dossier du jeu choisi à la main passe avant Steam (pinballfx3-folder.ts).
  const fx3 = simulated === undefined && zenKey === 'pinballfx3' ? detectPinballFx3(loc.dataDir) : undefined;
  const tableKey = zenKey === 'pinballfx' ? table.pinballFxTable : table.pinballFx3Table;
  const why = fp
    ? fp.why
    : mode === 'display'
      ? t('Le cadrage d’une table de {game} se règle dans le jeu (mode borne).', { game: zenName })
      : tableKey === undefined
        ? t('La fiche de cette table ne dit pas quelle table de {game} ouvrir.', { game: zenName })
        : simulated === undefined && !fx && !fx3
          ? zenKey === 'pinballfx3'
            ? t('{game} est introuvable sur ce PC. Menu système > Tables > Ajouter une table > « Tables de {game} » : l’installer avec Steam, ou choisir le dossier du jeu.', { game: zenName })
            : t('{game} n’est pas installé sur ce PC. Menu système > Tables > Ajouter une table > « Installer {game} ».', { game: zenName })
          : undefined;
  if (why) {
    state = { ...state, phase: 'message', help: false, message: { title: t('Partie impossible'), lines: [why, t('Start ou Exit : revenir au front-end.')] } };
    broadcast();
    return undefined;
  }
  // Pinball FX3 jamais ouvert sur ce PC : son mode borne n'y est pas activé, il s'ouvrirait sur son
  // écran d'accueil. Dit avant de lancer (ses réglages sont chiffrés : rien à écrire, pinballfx3-cabinet.ts).
  const firstRun = fx3 && table.pinballFx3Table !== undefined && !firstRunSeen && !autoStopAfterMs ? pinballFx3FirstRunMessage(fx3.gameDir, table.pinballFx3Table) : undefined;
  // FX3 déjà lancé par Cyber Pinball quand il démarrait sur l'orientation de la session (avant
  // 0.2.2-essai.10) : une fois par borne, l'ancienne et la nouvelle orientation à saisir. Le témoin
  // est posé dès la première partie de FX3, même sans rien à dire (jeu jamais ouvert compris).
  const fx3Cabinet = fx3 && !firstRunSeen && !autoStopAfterMs ? loadCabinet(loc.dataDir) : undefined;
  const fx3Edge = fx3Cabinet?.playfield?.flipperEdge;
  const orientationNotice =
    fx3 && !firstRunSeen && !autoStopAfterMs
      ? takePinballFx3OrientationNotice(
          loc.dataDir,
          !firstRun && tables.some((x) => x.emulator === 'pinballfx3' && (x.info.User?.StartCount ?? 0) > 0),
          fx3Edge ? pinballFx3OrientationChange(fx3Edge, fx3Cabinet?.playfield?.windowsRotation, playfieldOrigin()) : undefined,
        )
      : undefined;
  const beforeLaunch = firstRun ?? orientationNotice;
  if (beforeLaunch) {
    if (firstRun) console.log(`${zenName} (${table.id}) : jamais ouvert sur ce PC (${fx3!.gameDir} sans réglages), mode borne à activer dans le jeu ; Start l'ouvre quand même.`); // i18n-ignore : journal
    else console.log(`${zenName} (${table.id}) : orientation du mode borne à changer depuis 0.2.2-essai.10 (${beforeLaunch.lines[1]}) ; message montré une fois.`); // i18n-ignore : journal
    pendingPlay = { frontends: [], play: () => playPinballFx(table, autoStopAfterMs, mode, simulated, true) };
    state = { ...state, phase: 'message', help: false, message: { ...beforeLaunch, action: 'zenFirstRun' } };
    broadcast();
    return undefined;
  }
  displayMode = false;
  guest.releaseAll();
  state = { ...state, phase: 'loading', help: false };
  romMusic?.pause();
  startLaunch();
  launchCount++;
  const pressedAt = Date.now();
  if (mediaSettings.cinema) cinema.start(launchCount, { title: table.title, manufacturer: table.manufacturer, year: table.year, logo: medias?.wheel(table) });
  broadcast();
  playUiSound('coin');
  const loadingMs = Number(process.env.CYBERPINBALL_LOADING_MS ?? 2500);
  await delay(Math.min(400, loadingMs));
  await capture('chargement');
  await delay(Math.max(0, loadingMs - 400));
  if (launch?.stopped) {
    endLaunch();
    cinema.stop();
    state = { ...state, phase: 'menu' };
    broadcast();
    return undefined;
  }

  // Un jeu resté ouvert (partie précédente quittée dans son menu) ouvrirait sa table à lui : fermé
  // d'abord. Pinball FX3 déjà ouvert ignorerait même la table demandée (Steam ne fait que le montrer).
  // Future Pinball est reconnu à son propre processus, une fois lancé : rien à chercher avant.
  const left = simulated === undefined && zenKey ? runningPinballFx(undefined, launchGame) : undefined;
  if (left !== undefined) {
    console.log(`${zenName} (${table.id}) : jeu déjà ouvert (processus ${left}), fermé avant la partie.`); // i18n-ignore : journal
    try {
      process.kill(left);
    } catch {
      // Déjà parti.
    }
    await delay(1500);
  }
  // Borne : le playfield tourné, Pinball FX tourne son image comme les fenêtres du front-end (pinballfx-cabinet.ts).
  if (simulated === undefined && zenKey === 'pinballfx' && process.env.LOCALAPPDATA) {
    try {
      for (const c of applyPinballFxRotation(process.env.LOCALAPPDATA, rotation)) console.log(`${zenName} (${table.id}) : rotation forcée ${c.value} écrite dans ${c.file}.`); // i18n-ignore : journal
    } catch (error) {
      console.log(`${zenName} (${table.id}) : rotation pas écrite (${(error as Error).message}) ; la partie se lance quand même.`); // i18n-ignore : journal
    }
  }
  // Pinball FX : son mode borne activé, fenêtres du DMD et du fronton posées sur les écrans de la borne (pinballfx-cabinet.ts).
  if (simulated === undefined && zenKey === 'pinballfx' && fx) {
    const rectOf = (role: RoleId) => roleRects.find((r) => r.role === role)?.rect;
    const dmdRect = rectOf('dmd');
    const backglassRect = rectOf('backglass');
    const cabinetModel = loadCabinet(loc.dataDir);
    const layout = pinballFxCabinetLayout({ ...(dmdRect ? { dmd: dmdRect } : {}), ...(backglassRect ? { backglass: backglassRect } : {}) }, cabinetModel ? dmdKindOf(cabinetModel) : undefined);
    try {
      const written = applyPinballFxCabinet(fx.cabinetDir, layout);
      if (written) console.log(`${zenName} (${table.id}) : mode borne écrit dans ${written} (DMD ${JSON.stringify(layout.dmd ?? null)}, fronton ${JSON.stringify(layout.backglass ?? null)}).`); // i18n-ignore : journal
    } catch (error) {
      console.log(`${zenName} (${table.id}) : mode borne pas écrit (${(error as Error).message}) ; la partie se lance quand même.`); // i18n-ignore : journal
    }
  }
  // Future Pinball : son playfield et son fronton visent le NOM GDI d'un écran que Windows renumérote ; sur un
  // PinCab, le playfield 4K s'ouvrait sur l'écran du DMD (futurepinball-screens.ts). Réglé d'après les rôles.
  if (simulated === undefined && fp && !simulatedDisplays() && process.platform === 'win32') {
    const screenOf = (role: RoleId) => {
      const d = menuAssignments[role];
      return d?.gdiName ? { gdiName: d.gdiName, width: d.bounds.width, height: d.bounds.height } : undefined;
    };
    const playfield = screenOf('playfield');
    const backglass = screenOf('backglass');
    try {
      const done = applyFuturePinballScreens({ ...(playfield ? { playfield } : {}), ...(backglass ? { backglass } : {}) });
      if (done.written.length) console.log(`${zenName} (${table.id}) : écrans du jeu réglés d'après la borne, ${describeFuturePinballScreenChanges(done.written)}.`); // i18n-ignore : journal
      for (const f of done.failed) console.log(`${zenName} (${table.id}) : écran du jeu pas réglé, ${f.change.name} (${f.reason}) ; la partie se lance quand même.`); // i18n-ignore : journal
    } catch (error) {
      console.log(`${zenName} (${table.id}) : écrans du jeu pas réglés (${(error as Error).message}) ; la partie se lance quand même.`); // i18n-ignore : journal
    }
    // Son et vue : ce que la partie va trouver (sortie par défaut de Windows, vue de BAM de la table), dit avant qu'elle ne parte.
    const fpInstall = detectFuturePinball(loc.dataDir, loc.root);
    logFuturePinballLaunch({ tableId: table.id, tableFile: table.file, install: fpInstall, audio: loadCabinet(loc.dataDir)?.audio, outputs: audioOutputs() ?? [], log: (line) => console.log(line) });
    // Cadrage : résolution, mode, rotation de la table, mode arcade et caméra que le jeu va trouver, face à l'écran du playfield.
    const fpScreen = menuAssignments.playfield;
    const fpEdge = loadCabinet(loc.dataDir)?.playfield?.flipperEdge;
    logFuturePinballView({
      tableId: table.id,
      ...(fpScreen ? { screen: { width: fpScreen.bounds.width, height: fpScreen.bounds.height, rotation: fpScreen.rotation } } : {}),
      ...(fpEdge ? { flipperEdge: fpEdge } : {}),
      log: (line) => console.log(line),
    });
    // Bibliothèques (.fpl) de la table absentes du jeu : remises si une autre installation les a, sinon dites ici.
    await logFuturePinballLibraries({ tableId: table.id, tableFile: table.file, install: fpInstall, ...(loc.root ? { downloadsDir: layoutOf(loc.root).downloads } : {}), log: (line) => console.log(line) });
  }
  // Pinball FX : pas d'image de fronton déposée pour le jeu. Sa fenêtre du fronton est fermée dans son mode borne
  // (décision du 20/11/2026) : le fronton de la borne reste celui de Cyber Pinball, le média de la table.
  // Pinball FX3 : l'image de la table pour sa fenêtre du fronton (data\steam\<table>.*), si elle n'en a pas ;
  // sans elle, FX3 y écrit le chemin qu'il cherche (essai du 20/11/2026). Le fronton de la table dans
  // Cyber Pinball d'abord, sinon le catalogue d'archive.org (pinballfx3-backglass.ts). Et l'inverse : une
  // table sans fronton dans Cyber Pinball prend cette image, la roue la montre.
  if (simulated === undefined && fx3 && table.pinballFx3Table !== undefined && loc.root) {
    const own = resolveMedia(table, loc.root, 'Backglass');
    const source = own.source !== 'default' && own.source !== 'fallback' ? own.file : undefined;
    const ready = await preparePinballFx3Backglass(fx3, table.pinballFx3Table, { ...(source ? { own: source } : {}), workDir: path.join(loc.dataDir, 'pinballfx3-fronton-partie') });
    if (ready.image) {
      if (ready.from !== 'present') console.log(`${zenName} (${table.id}) : fronton déposé pour le jeu, ${ready.image} (${ready.from === 'media' ? `depuis ${source}` : 'catalogue d’archive.org'}).`); // i18n-ignore : journal
      try {
        const kept = placeMissingMedia(table, infoFileFor(table, layoutOf(loc.root).tables), 'Backglass', ready.image, { origin: ready.from === 'catalog' ? PINBALLFX3_BACKGLASS_TITLE : zenName, url: ready.from === 'catalog' ? PINBALLFX3_BACKGLASS_PAGE : ready.image });
        if (kept) {
          console.log(`${zenName} (${table.id}) : fronton du jeu rangé comme fronton de la table, ${kept}.`); // i18n-ignore : journal
          // La roue relit ses médias au retour de la partie (sans relire les tables pendant le lancement).
          medias?.invalidate();
        }
      } catch (error) {
        console.log(`${zenName} (${table.id}) : fronton du jeu pas rangé dans la table (${(error as Error).message}).`); // i18n-ignore : journal
      }
    } else console.log(`${zenName} (${table.id}) : pas d'image de fronton pour le jeu (${ready.pending ? 'catalogue encore en route, pour la partie suivante' : (ready.reason ?? 'aucune source')}) ; la partie se lance quand même.`); // i18n-ignore : journal
  }

  // Pinball FX3 : le playfield retrouve l'orientation de Windows, le bureau qu'il a avec un autre front-end
  // (sessionorientation.ts, GAMES_ON_WINDOWS_ORIENTATION) ; ses réglages saisis à la main restent justes.
  // Future Pinball, non : il garde celle de la session (essai du 20/11/2026, table à l'envers à 0°).
  const windowsOrientation = simulated === undefined && playsOnWindowsOrientation(table.emulator);
  if (windowsOrientation) orientationForGame(zenName);
  // Le mode débogage se retire lui-même (sa fenêtre est recréée à la mesure suivante, par-dessus la partie, sans bruit au journal).
  debug.releaseWindow();
  closeTopmostWindows();
  playing = table;
  realign = undefined;
  hideTaskbars();
  settleScreens('game');
  const startedAt = new Date();
  const onPlaying = () => {
    playingSince = Date.now();
    state = { ...state, phase: 'playing' };
    endLaunch();
    settleScreens('vpx');
    socialNet.setPresence({ status: 'playing', table: presenceTable(table), since: new Date().toISOString() });
    // Écrans où le jeu dessine (mode borne, fenêtres annexes de Future Pinball) : laissés au jeu (game-screens.ts).
    // Le DMD recopié par dmdext (Future Pinball) compte comme une fenêtre du jeu : l'écran DMD lui est laissé.
    watchOccupied(simulated?.split(',').filter((r): r is RoleId => ROLES.some((x) => x.id === r)), simulated === undefined ? { name: zenName, pids: () => [game.pid, dmdMirror?.pid(), ...pupPids()].filter((p): p is number => p !== undefined) } : undefined);
    broadcast();
    if (autoStopAfterMs) setTimeout(() => game.stop(), autoStopAfterMs);
  };
  const onForeground = () => {
    if (cinema.handover()) playUiSound('coil');
  };
  // Exit tenu se lit quel que soit le premier plan : le sondage des joysticks tourne pendant la partie.
  const stopJoystick = watchJoystickButtons(() => undefined);
  const command: { file: string; args: string[]; cwd?: string; bam?: true } | undefined = fp
    ? fp.command
    : fx && table.pinballFxTable !== undefined
      ? pinballFxCommand(fx, table.pinballFxTable)
      : fx3 && table.pinballFx3Table !== undefined
        ? pinballFx3LaunchCommand(fx3, table.pinballFx3Table)
        : undefined;
  console.log(`Lancement : ${zenName} (${table.id}) lancé ${Date.now() - pressedAt} ms après le Start${command ? ` : ${futurePinballCommandLine(command)}` : ' (partie simulée)'}.`); // i18n-ignore : journal
  // Future Pinball ouvert en fenêtre ailleurs : posé sur le playfield (le plein écran reste où le jeu l'a mis).
  const onWindow = fp
    ? (w: WindowInfo) => {
        const placed = placeFuturePinballWindow(w, menuAssignments.playfield?.bounds, observedDisplays().map((d) => d.bounds), setWindowBounds);
        if (placed) console.log(`${zenName} (${table.id}) : fenêtre posée sur le playfield (${placed.x}, ${placed.y}, ${placed.width} × ${placed.height}).`); // i18n-ignore : journal
      }
    : undefined;
  // Future Pinball dessine son DMD dans son fronton : dmdext le recopie sur l'écran DMD (comme PinUP Popper),
  // quand il est installé avec le jeu ; lancé avant lui, fermé à la fin de la partie.
  const dmdMirror = simulated === undefined && command && fp?.dmdMirror ? startDmdMirror(fp.dmdMirror, (line) => console.log(line)) : undefined;
  // Son DMD posé sur l'écran DMD tel qu'il est : le plein écran du jeu fait déplacer des écrans par Windows,
  // la place écrite dans DmdDevice.ini tombait alors hors de tout écran (PinCab, 20/11/2026).
  // Les fenêtres de PinUP Player (PuP-Pack joué par une table « PinEvent ») aussi, chacune sur l'écran de son
  // rôle : son PinUpPlayer.ini les place d'après une autre disposition des écrans (PinCab, 20/11/2026).
  const pupPids = (): number[] => (fp && simulated === undefined ? processIdsByName(PINUP_DISPLAY_EXE) : []);
  // PinUP Player lancé par la table (PinEvent) : fermé à la fin s'il n'était pas là avant (closePupStartedDuringGame).
  const pupPlayerPids = (): number[] => (fp && simulated === undefined ? PINUP_PLAYER_PROCESSES.flatMap((exe) => processIdsByName(exe)) : []);
  const pupBefore = pupPlayerPids();
  const dmdMirrorWatch =
    simulated === undefined && command && fp
      ? setInterval(() => {
          const stack = () => listWindows((w) => w.visible);
          const placed = dmdMirror ? placeDmdMirror(dmdMirror.pid(), roleRects.find((r) => r.role === 'dmd')?.rect, stack, setWindowBounds) : undefined;
          if (placed) console.log(`${zenName} (${table.id}) : DMD recopié posé sur l'écran DMD (${placed.x}, ${placed.y}, ${placed.width} × ${placed.height}).`); // i18n-ignore : journal
          for (const p of placePupWindows(pupPids(), (role) => roleRects.find((r) => r.role === role)?.rect, stack, setWindowBounds)) {
            console.log(`${zenName} (${table.id}) : fenêtre ${p.title} de PinUP Player posée sur son écran (${p.to.x}, ${p.to.y}, ${p.to.width} × ${p.to.height}).`); // i18n-ignore : journal
          }
        }, 1000)
      : undefined;
  // Pinball FX : son DMD envoyé à dmdext (ExternalDevice, DmdDevice64.dll de VPinMAME : colorisation, PuP-Packs)
  // s'ouvre là où DmdDevice.ini le place, sur le fronton chez un joueur (PinCab, 20/11/2026) : posé sur
  // l'écran DMD, comme le DMD recopié de Future Pinball. Une place déjà sur l'écran DMD est gardée.
  const virtualDmdWatch =
    simulated === undefined && command && zenKey === 'pinballfx'
      ? setInterval(() => {
          const placed = placeVirtualDmd(roleRects.find((r) => r.role === 'dmd')?.rect, () => listWindows((w) => w.visible), setWindowBounds);
          if (placed) console.log(`${zenName} (${table.id}) : DMD virtuel de dmdext posé sur l'écran DMD (${placed.x}, ${placed.y}, ${placed.width} × ${placed.height}).`); // i18n-ignore : journal
        }, 1000)
      : undefined;
  const game =
    simulated !== undefined || !command
      ? simulateVpx({ onPlaying, onForeground })
      : launchPinballFx({ command, game: fx3?.store === 'folder' ? { ...launchGame, direct: true } : launchGame, exitHeld: vrFront.exitHeldNow, onPlaying, onForeground, ...(onWindow ? { onWindow } : {}) });
  // Pinscape et encodeurs en mode manette : leurs boutons rendus au jeu de Zen comme des touches (zen-keys.ts).
  // Future Pinball ne lit que le clavier, lui aussi : ses touches viennent de ses préférences (futurepinball-play.ts).
  const stopZenKeys =
    simulated === undefined && command && zenKey
      ? bridgeZenKeys({ buttons, navigation }, () => game.pid, undefined, zenKey)
      : simulated === undefined && command && fp
        ? bridgeZenKeys({ buttons, navigation }, () => game.pid, undefined, undefined, { name: zenName, keys: futurePinballButtonKeys({ buttons, navigation }), bam: futurePinballBamMenu({ buttons, navigation }, command) })
        : () => undefined;
  // Secousses de la borne (accéléromètre de l'étape « Tilt ») : Future Pinball ne le lit pas, ses touches
  // de secousse lui sont frappées à chaque à-coup (nudge-keys.ts).
  const fpNudge = simulated === undefined && command && fp ? loadCabinet(loc.dataDir)?.analog : undefined;
  const stopNudgeKeys = fpNudge?.nudge && !fpNudge.nudgeOff ? bridgeNudgeKeys(fpNudge.nudge, futurePinballNudgeKeys(), () => game.pid, zenName) : () => undefined;
  if (launch) {
    launch.stop = () => game.stop();
    launchStep('launched');
    if (launch.stopped) game.stop();
  }
  if (simulated === undefined) globalShortcut.register(accelerator(SHORTCUTS.forceStop), () => guest.knock('game.force-stop') && game.stop());
  const result = await game.done;
  if (dmdMirrorWatch) clearInterval(dmdMirrorWatch);
  if (virtualDmdWatch) clearInterval(virtualDmdWatch);
  dmdMirror?.stop();
  const pupClosed = fp && simulated === undefined ? closePupStartedDuringGame(pupBefore, pupPlayerPids()) : [];
  if (pupClosed.length) console.log(`${zenName} (${table.id}) : PinUP Player lancé par la table, fermé avec la partie (processus ${pupClosed.join(', ')}).`); // i18n-ignore : journal
  if (windowsOrientation) orientationAfterGame(zenName);
  // FX3 montre aussi les images d'autres tables pendant ses transitions (essai du 20/11/2026 : un chemin
  // affiché en un éclair) : celles de toutes ses tables installées, en arrière-plan, une fois par
  // démarrage, suivies dans les téléchargements. La partie est finie : rien ne la ralentit.
  if (simulated === undefined && fx3) {
    void fetchAllPinballFx3Backglasses(fx3, { workDir: path.join(loc.dataDir, 'pinballfx3-frontons'), downloads: library.downloads.manager })?.then(
      (r) => console.log(`${zenName} : frontons des tables installées : ${r.placed.length} déposé(s), ${r.present.length} déjà là, ${r.missing.length} absent(s) du catalogue${r.failed.length ? `, ${r.failed.length} en échec (repris au prochain démarrage)` : ''}.`), // i18n-ignore : journal
      (error: Error) => console.log(`${zenName} : frontons des tables installées pas reçus (${error.message}) ; repris au prochain démarrage.`), // i18n-ignore : journal
    );
  }
  stopZenKeys();
  stopNudgeKeys();
  stopJoystick();
  const stoppedLoading = launch?.stopped === true;
  endLaunch();
  if (simulated === undefined) globalShortcut.unregister(accelerator(SHORTCUTS.forceStop));
  cinema.stop();
  stopWatchOccupied();
  socialNet.setPresence({ status: 'menu', since: new Date().toISOString() });
  playing = undefined;
  restoreTaskbars('game-end');
  const focusReturned = await showMenuAgain();
  settleScreens('return');
  recoverScreens('return');
  setTimeout(() => playing || recoverScreens('return'), SCREENS_SETTLE_MS);
  cabinetVolume?.remindIfMuted();
  for (const notice of result.notices) console.log(`${zenName} (${table.id}) : ${notice}`);

  if (stoppedLoading) {
    state = { ...state, phase: 'menu' };
    broadcast();
    return { result, focusReturned, entered: [] };
  }
  if (result.ok) {
    if (!autoStopAfterMs) {
      recordPlay(table, startedAt, result.seconds);
      try {
        if (result.seconds >= 60) socialNet.publish({ kind: 'played', table: presenceTable(table), seconds: Math.round(result.seconds) });
      } catch (error) {
        console.log(`Partie (${table.id}) : nouvelles pour les amis pas envoyées (${(error as Error).message}) ; la partie compte quand même.`); // i18n-ignore : journal
      }
    }
    tables = tables.map((t) => (t.id === table.id ? { ...t, info: readInfo(t.infoFile) } : t));
    // Le niveau : la partie (Pinball FX et FX3 ne donnent pas leurs scores), puis les badges qu'elle vaut.
    if (!autoStopAfterMs) {
      try {
        levelTracker.gameEnded({ table: presenceTable(table), seconds: result.seconds, entered: [], newTable: (table.info.User?.StartCount ?? 0) === 0, at: new Date() });
      } catch (error) {
        console.log(`Partie (${table.id}) : niveau et badges pas mis à jour (${(error as Error).message}) ; la partie compte quand même.`); // i18n-ignore : journal
      }
    }
    // Pinball FX3 resté sur son écran d'accueil (table pas sur le compte, mode borne pas activé) :
    // rien ne le distingue d'une table ouverte, sauf une partie très courte. Les causes possibles,
    // plutôt qu'un retour muet au front-end.
    const stuck = command && fx3 && !autoStopAfterMs && table.pinballFx3Table ? pinballFx3ShortGameMessage(result.seconds, table.pinballFx3Table) : undefined;
    if (stuck) console.log(`${zenName} (${table.id}) : partie de ${Math.round(result.seconds)} s, jeu peut-être resté sur son écran d'accueil ; causes possibles affichées.`); // i18n-ignore : journal
    state = stuck ? { ...state, phase: 'message', message: stuck } : { ...state, phase: 'menu' };
  } else {
    console.log(`Partie (${table.id}) : échec de ${zenName} (${result.failure ?? 'inconnu'}) : ${result.message ?? ''}`); // i18n-ignore : journal
    state = {
      ...state,
      phase: 'message',
      message: {
        title: t('{game} n’a pas ouvert la table', { game: zenName }),
        lines: [
          ...(result.message ? [result.message] : []),
          fp
            ? fp.failureHint
            : fx3?.store === 'folder'
            ? pinballFx3DirectFailureHint(fx3.gameDir)
            : zenKey === 'pinballfx3'
            ? t('Vérifie que Steam est connecté, que la table est sur ce compte Steam et que le mode borne est activé dans {game}.', { game: zenName })
            : t('Vérifie que la table est achetée dans Pinball FX et que Steam (ou Epic) est connecté.'),
          t('Start ou Exit : revenir au front-end.'),
        ],
      },
    };
  }
  broadcast();
  return { result, focusReturned, entered: [] };
}

/**
 * Partie d'une table. En mode réglage de l'affichage (`display`), VPX démarre son menu ouvert
 * sur le cadrage ; la partie ne compte pas dans les statistiques et, à la fin, l'écran qui
 * l'a demandée (la fiche) reprend la main.
 */
async function play(table: TableEntry, autoStopAfterMs?: number, mode?: 'display', hooks: { onPlaying?(): void; record?: RecordingSettings; double?: string; settings?: HostSetting[]; board?: GroupRecord[]; onProgress?(p: LiveProgress): void; gate?: LiveStartGate } = {}): Promise<PlayReport | undefined> {
  // Une partie est celle d'une table, d'où qu'elle parte (roue, fiche, Bibliothèque, groupe, partie
  // entre amis) : la roue passe dessus et quitte le médaillon, pour le chargement comme pour le retour.
  pointAtTable(table);
  // Table jouée avec un autre VPX du PC (autres-vpx.ts) : Cyber Pinball n'en est que le lanceur. Rien de ce
  // qu'il fait pour son VPX 10.8.1 (INI, plugins, VR, PuP, DMD) ; jamais une écriture dans le dossier de ce VPX.
  const otherVpx = table.emulator === 'vpx' ? otherVpxFor(table.info, readOtherVpx(loc.dataDir)) : undefined;
  const install = otherVpx ? { exe: otherVpx.exe, version: otherVpx.version } : vpxInstall(loc);
  if (!install && table.emulator === 'vpx') return undefined;
  // Une sauvegarde automatique cède la place (elle reprendra au prochain moment libre) ; une sauvegarde
  // à la main ou une restauration en cours : la partie écrirait ses scores pendant la copie.
  await backups.yieldToGame();
  const copying = backups.busy();
  if (copying) {
    state = { ...state, phase: 'message', help: false, message: { title: t('Partie impossible pour l’instant'), lines: [copying, t('Start ou Exit : revenir au front-end.')] } };
    broadcast();
    return undefined;
  }
  // Hors écran, une partie simulée (CYBERPINBALL_PARTIE_SIMULEE : rôles qu'elle occupe,
  // « backglass,dmd », ou vide) montre chargement, partie et retour sans lancer VPX.
  const simulated = OFFSCREEN ? process.env.CYBERPINBALL_PARTIE_SIMULEE : undefined;
  const refused = simulated === undefined ? refuseOffscreen(t('Lancer une partie de VPX')) : undefined;
  if (refused) {
    state = { ...state, phase: 'message', help: false, message: { title: t('Partie impossible hors écran'), lines: [refused, t('Start ou Exit : revenir au front-end.')] } };
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
                t('Ferme {names} depuis leur menu (Quitter), puis relance la partie.', { names }),
                t('Start : jouer quand même · Exit : revenir au front-end'),
              ],
              action: 'otherFrontend',
            }
          : {
              title: t('{names} est ouvert', { names }),
              lines: [
                t('Pendant la partie, {names} réagirait aussi aux boutons de la borne et pourrait prendre les écrans ou l’afficheur DMD.', { names }),
                t('Ferme {names} depuis son menu (Quitter), puis relance la partie.', { names }),
                t('Start : jouer quand même · Exit : revenir au front-end'),
              ],
              action: 'otherFrontend',
            },
    };
    broadcast();
    return undefined;
  }

  // Table de Pinball FX : sa propre partie, sans rien de ce qui est propre à VPX (pinballfx.ts).
  // Table de Future Pinball : la même partie, sa commande à lui (futurepinball-play.ts).
  if (isZenEmulator(table.emulator) || table.emulator === 'futurepinball') return playPinballFx(table, autoStopAfterMs, mode, simulated);
  if (!install) return undefined;
  const otherRefused = otherVpx && otherVpxRefusal(otherVpx, { exists: simulated !== undefined || fs.existsSync(otherVpx.exe), display: mode === 'display', friends: Boolean(hooks.double) });
  if (otherRefused) {
    console.log(`Partie (${table.id}) avec ${otherVpxLabel(otherVpx)} : ${otherRefused.title}.`); // i18n-ignore : journal
    state = { ...state, phase: 'message', help: false, message: otherRefused };
    broadcast();
    return undefined;
  }
  // Table enregistrée par un VPX plus récent (vpx-format.ts) : celui-ci afficherait une erreur et la chargerait mal.
  const tooNew = table.emulator === 'vpx' && simulated === undefined ? tableTooNew(readVpxFileVersion(table.file), table.info, vpxInstall(loc)?.version, readOtherVpx(loc.dataDir)) : undefined;
  if (tooNew) {
    console.log(`Partie (${table.id}) refusée : enregistrée par VPX ${tooNew.table}, plus récent que ${tooNew.player}.`); // i18n-ignore : journal
    state = { ...state, phase: 'message', help: false, message: tooNewRefusal(tooNew) };
    broadcast();
    return undefined;
  }
  if (otherVpx) console.log(`Partie (${table.id}) avec un autre VPX : ${otherVpxLabel(otherVpx)}, ${otherVpx.exe}, ses propres réglages.`); // i18n-ignore : journal

  // Dès le chargement : son écran rappelle les boutons du menu de VPX, pas ceux du jeu.
  displayMode = mode === 'display';
  // Partie entre amis : la règle du pare-feu de VPX relue pendant le chargement, pour l'inspector de VPX (vpx-inspector.ts).
  // Partie seul : la même règle, pour le relevé du score en direct (solo-score-watch.ts).
  const inspectorReady = (hooks.double || (!hooks.record && !autoStopAfterMs)) && !displayMode && simulated === undefined ? inspectorFor(socialFirewall, (line) => console.log(line)) : Promise.resolve(undefined);
  guest.releaseAll();
  state = { ...state, phase: 'loading', help: false };
  // La musique d'une ROM qui s'enregistre cède la place à la partie, tout de suite.
  romMusic?.pause();
  startLaunch();
  launchCount++;
  const pressedAt = Date.now();
  // Vision 3D : le capteur s'allume dès le Start, pas quand la table paraît. Le joueur bouge encore
  // (il vient d'appuyer) : la Kinect, en mode assis, ne repère quelqu'un qu'en mouvement ; allumée
  // une fois le joueur immobile devant le plateau, elle tardait parfois de longues secondes.
  if (simulated === undefined && mode !== 'display') warmVision3d();
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
    configurations.openChooser(t('Avant de jouer, choisis la configuration branchée : elle décide des écrans de VPX.'));
    return undefined;
  }
  if (problem) {
    state = { ...state, phase: 'message', message: problem };
    broadcast();
    return undefined;
  }

  // PuP-Pack : ce qui l'empêcherait de s'afficher est réglé avant la partie, sans rien demander.
  // Avec un autre VPX, c'est PinUP Player qui lit le pack, tel que l'installation du joueur l'a réglé.
  if (!otherVpx) preparePupPack(table);
  // Vidéos du DMD trop grandes (dmd-video-shrink.ts) : ramenées à la taille du DMD, sinon la partie se fige à chaque scène.
  if (!otherVpx) await shrinkTableDmdVideos(table);
  // Volume de la ROM : le volume voulu posé avant la partie, relu au retour (rom-volume.ts). Jamais
  // dans le double d'une partie entre amis : son volume est celui de cette borne, déjà dans la mémoire.
  // Ni avec un autre VPX : VPinMAME y garde ses propres réglages.
  const romVolumeWatched = !hooks.double && !displayMode && !otherVpx;
  // Mémoire de la ROM absente (rom-first-boot.ts) : la ROM est mise en route maintenant, une fois pour
  // toutes, sans écran ni son ; sinon elle s'arrêterait sur « réglages d'usine rétablis », pièces
  // refusées. Avant le volume : il s'écrit dans cette mémoire. Ni avec un autre VPX (VPinMAME y a la sienne).
  if (!otherVpx && !displayMode && simulated === undefined && romFirstBoot) {
    await romFirstBoot.beforeGame(table, {
      starting: () => {
        launchStep('rom');
        // Une attente attendue : le chargement la dit tout de suite, sans attendre ses 8 s.
        if (launch && !launch.slow) {
          launch.slow = true;
          broadcast();
        }
      },
      stopper: (stop) => {
        if (launch) launch.stop = stop;
      },
    });
  }
  if (romVolumeWatched) romVolumes.beforeGame(table);
  // Le mode débogage se retire lui-même (sa fenêtre est recréée à la mesure suivante, par-dessus la partie, sans bruit au journal).
  debug.releaseWindow();
  closeTopmostWindows();
  // Habillage FullDMD : le DMD de VPX posé dans le cadre du média FullDMD, que le fond de partie montre autour.
  dressing = loc.root && !otherVpx
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
  // Avec un autre VPX, ni position du DMD, ni réglages en partie, ni Vision 3D : ils écrivent les réglages du VPX de Cyber Pinball.
  const configuration = otherVpx ? undefined : loadCabinet(loc.dataDir);
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
    state = { ...state, phase: 'message', message: { title: t('Partie entre amis impossible sur cette table : {reason}', { reason: doubled.reason }), lines: [t('Ta table habituelle reste intacte : rien n’a été lancé.')] } };
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
  // Le DMD réel passe à VPX : le menu lâche dmdserver avant que VPX ne s'y connecte ; si VPX ouvre le DMD
  // lui-même (serveur muet à la synchronisation), le serveur s'arrête avant, pour ne pas tenir la carte.
  await handDmdToVpx();
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
    debug.playing();
    // VPX n'a pas trouvé le casque et joue sur les écrans (VR en « Autodetect ») : plus rien à mettre.
    if (!playedVr) vrFront.vrWearHint = undefined;
    // Journal des écrans : la pile des fenêtres, la fenêtre de jeu de VPX affichée (le gardien des barres n'y touche pas).
    settleScreens('vpx');
    // Les amis voient la table en cours, en temps réel (pas pendant un réglage de l'affichage).
    if (!displayMode) socialNet.setPresence({ status: 'playing', table: presenceTable(table), since: new Date().toISOString() });
    hooks.onPlaying?.();
    watchOccupied(simulated?.split(',').filter((r): r is RoleId => ROLES.some((x) => x.id === r)));
    if (simulated === undefined && !gameLoad) gameLoad = watchGameLoad(game.pid);
    // Partie sur les écrans (VPX n'a pas pris le casque) : le compagnon n'a plus de relève à attendre.
    if (!playedVr && vrFront.headset?.running) void vrFront.headset.stop();
    broadcast();
    setTimeout(showLiveBoard, LIVE_BOARD_SETTLE_MS);
    onScreen = true;
    if (liveManual) hooks.gate?.ready({ manual: true });
    if (vrGame) console.log(playedVr ? `Réalité virtuelle (${table.id}) : partie dans le casque.` : `Réalité virtuelle (${table.id}) : casque pas prêt, partie sur les écrans.`); // i18n-ignore : journal
    // Partie repliée sur les écrans : l'INI de la VR doit garder fronton, DMD et topper (vr.ts, ANCILLARY_OUTPUTS).
    if (vrGame && !playedVr) {
      const gaps = screensFallbackGaps(readTextIfExists(vrGame.ini), vrGame.baseText);
      if (gaps.length) console.log(`[avertissement] Réalité virtuelle (${table.id}) : partie sur les écrans sans ${gaps.join(', ')} (fenêtre de VPX éteinte dans l'INI de la partie, allumée sur la borne).`); // i18n-ignore : journal
      if (screensFallbackViewMode(readTextIfExists(vrGame.ini), vrGame.baseText)) console.log(`[avertissement] Réalité virtuelle (${table.id}) : partie sur les écrans en vue « bureau » (mode de la VR, BGSet), pas en vue de la borne.`); // i18n-ignore : journal
    }
    if (vision3dSource && configuration) headTracker.start(vision3dSource, configuration.id, vision3dMenu.setting());
    // Les deux MagnaSave ouvrent désormais les réglages en partie (position du DMD, puis menu de VPX ; en VR, celui de VPX dans le casque).
    if (configuration) inGameMenu.arm({ pid: game.pid, table, cabinet: configuration, displays: observedDisplays(), place: playfieldPlace(), configurationIni: vrGame?.ini ?? recordIni?.ini ?? activeVpxIni(loc), dataDir: loc.dataDir, vr: playedVr, ...(vision3dSource && {
        vision3d: {
          state: () => headTracker.state,
          recenter: () => headTracker.recenter(),
          intensity: () => intensityLabel(vision3dMenu.setting().intensity),
          nextIntensity: () => {
            setVision3dTuning({ intensity: nextIntensity(vision3dMenu.setting().intensity) });
            return intensityLabel(vision3dMenu.setting().intensity);
          },
        },
      }) });
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
  const vrGame = simulated === undefined && !displayMode && !otherVpx ? vrFront.prepareVr(played.file, double?.ini) : undefined;
  let qualityPrepared = false;
  vrFront.headsetExitHint = vrGame && vrFront.headset?.inUse ? vrFront.exitHintText() : undefined;
  // Casque pas sur la tête (le compagnon le dit, ou il ne tourne pas) : la borne dit de le mettre.
  vrFront.vrWearHint =
    vrGame && !vrFront.headset?.worn
      ? {
          status: t('Partie dans le casque'),
          text: t('Mets le casque : la table démarre quand il est sur la tête'),
          // Une consigne par ligne (essai.30 : les deux sur une ligne, coupée avant « : », illisible).
          keys: [t('Exit : arrêter (au clavier : {keys} ou Échap)', { keys: shortcutLabel(SHORTCUTS.forceStop) }), t('Pour jouer sur les écrans : Menu système > Ma borne > Réalité virtuelle et vision 3D')],
        }
      : undefined;
  if (vrFront.vrWearHint) console.log(`Réalité virtuelle (${played.id}) : casque pas sur la tête au lancement ; la borne dit de le mettre.`); // i18n-ignore : journal
  // Air Link alors que le PC est en Wi-Fi : dit une fois par session du casque, sur la carte du chargement.
  vrFront.headsetExitNote = undefined;
  if (vrGame && vrFront.headset?.inUse && !vrFront.airLinkWarned && airLinkOverWifi(vrFront.linkMode, vrFront.pcNetwork)) {
    vrFront.airLinkWarned = true;
    vrFront.headsetExitNote = t('Air Link avec un PC en Wi-Fi : des images se perdent. Relie le PC au routeur par un câble Ethernet, ou utilise le câble USB Link.');
    console.log(`Casque : Air Link sur un PC en Wi-Fi (${vrFront.pcNetwork!.adapter}), avertissement donné au chargement.`); // i18n-ignore : journal
  }
  if (vrGame) vrFront.refreshVrNetwork();
  if (simulated === undefined && !otherVpx) prepareVpxClr(install.exe);
  // Le DMD qui remplit sa fenêtre redimensionnée en partie : le plugin « CyberPinballDmd », activé dans toutes les
  // parties (components.json), remis dans VPX avant chaque partie s'il a changé (vpx-plugins.ts).
  if (simulated === undefined && !otherVpx) {
    const dmdPlugin = installVpxPlugin(DMD_PLUGIN, path.dirname(install.exe), path.join(__dirname, '..'));
    if (dmdPlugin !== 'up-to-date') console.log(`Plugin du DMD : ${dmdPlugin === 'installed' ? 'copié dans VPX' : dmdPlugin === 'busy' ? 'VPX ouvert, copie à la partie suivante' : 'absent de cette version'}.`); // i18n-ignore : journal
    // VPX corrigé (vpx-corrige.ts) : l'exécutable de la 5436 avec les correctifs de VPX venus après elle.
    const corrige = installVpxCorrige(path.dirname(install.exe), install.version, path.join(__dirname, '..'));
    if (corrige === 'installed' || corrige === 'busy' || corrige === 'restored') console.log(`VPX corrigé : ${corrige === 'installed' ? 'exécutable posé' : corrige === 'restored' ? 'plus livré, exécutable officiel remis' : 'VPX ouvert, à la partie suivante'}.`); // i18n-ignore : journal
    // L'exécutable a changé : la fiche technique (et la santé) seront relevées de nouveau après la partie.
    if (corrige === 'installed' || corrige === 'restored') library.techFactsChanged();
    // Pré-réglages de qualité (qualite-vpx.ts) : le mode choisi dans l'INI de la borne ; la VR a son propre profil.
    if (!vrGame && !displayMode) {
      try {
        const quality = prepareQuality(loc.dataDir, activeVpxIni(loc), double?.ini);
        qualityPrepared = true;
        if (quality) console.log(quality);
      } catch (error) {
        console.warn(`Pré-réglages de VPX : non appliqués (${(error as Error).message}).`); // i18n-ignore : journal
      }
    }
  }
  // Vision 3D (vision3d.ts) : le capteur, allumé dès le Start, suit la tête pour VPX quand la table est à l'écran.
  const vision3dSource = simulated === undefined && !displayMode && !otherVpx ? prepareVision3d(install.exe, Boolean(vrGame)) : undefined;
  // Allumé au Start, mais pas de Vision 3D pour cette partie (dans le casque) : éteint tout de suite.
  if (!vision3dSource && headTracker.running && !vision3dMenu.testing()) headTracker.stop();
  // Bilan de la Vision 3D : ce que VPX écrira de son module dans vpinball.log, à partir d'ici.
  const vision3dLog = path.join(vpxPrefDir(install.version), 'vpinball.log');
  const vision3dLogFrom = vision3dSource && fs.existsSync(vision3dLog) ? fs.statSync(vision3dLog).size : 0;
  // Le menu dans le casque passe la main sans écran intermédiaire : le compagnon garde le casque
  // (chargement compris) jusqu'à ce que VPX le prenne, puis fond au noir et s'arrête (casque.ts).
  if (simulated === undefined && vrFront.headset?.running) {
    vrFront.headsetPaused = true;
    vrFront.headset.handOver();
  }
  let playedVr = false;
  // Charge du PC pendant la partie (game-load.ts) : notée au journal à la fin.
  let gameLoad: GameLoadWatch | undefined;
  // Sans place enregistrée par VPX, la table est recentrée sur le regard du joueur une fois lancée.
  const vrText = vrGame ? readTextIfExists(vrGame.ini) : '';
  // Plus aucun recentrage automatique dès que la borne du casque a une place : seulement si rien n'en donne.
  const vrCenter = vrGame && !readCabinetPlace(vrFront.headsetPlaceFile()) && !vrHasSavedPlace(vrText) ? vrCenterKey(vrText) : undefined;
  const vpxLog = path.join(vpxPrefDir(install.version), 'vpinball.log');
  const vpxLogOffset = vrCenter && fs.existsSync(vpxLog) ? fs.statSync(vpxLog).size : 0;
  // Ce que VPX écrira de cette partie (changement de pièce reçu en jeu) : à partir d'ici.
  const vrLogFrom = vrGame && fs.existsSync(vpxLog) ? fs.statSync(vpxLog).size : 0;
  // Cadence des images de la partie (game-cadence.ts) : le bilan que le plugin du DMD écrira, à partir d'ici.
  const cadenceLogFrom = simulated === undefined ? vpxLogSize(vpxLog) : undefined;
  // Autres programmes de borne ouverts pendant la partie (PinUP Popper, dmdext…), même acceptés au démarrage : dits
  // par-dessus VPX (une fois par jour et par programme), et écrits avec la cadence de la partie (coexistence.ts).
  const openDuringGame = simulated === undefined ? programsDuringGame(runningProcessNames(), Boolean(otherVpx)) : [];
  if (openDuringGame.length) {
    console.log(`Partie (${table.id}) : ouverts pendant la partie : ${openDuringGame.join(', ')}.`); // i18n-ignore : journal
    menuNotices.push([{ kind: 'program-open' as const, key: `program|${openDuringGame.join('|')}`, at: Date.now(), subject: formatList(openDuringGame) }]);
  }
  let stopCentering: (() => void) | undefined;
  // La fenêtre de jeu est l'aperçu de la VR (launcher.ts) : la partie est dans le casque.
  const onVr = () => {
    playedVr = true;
    vrFront.vrGameStop = () => game.stop();
    vrFront.vrGameStart = Date.now();
    vrFront.headLogged = false;
    vrFront.gameHeads = [];
    if (vrCenter) stopCentering = centerWhenStarted({ logFile: vpxLog, fromOffset: vpxLogOffset, pid: () => game.pid, key: vrCenter, log: (line) => console.log(line) });
  };
  // Hors écran, un chargement simulé qui tarde (CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS) montre le cartouche.
  const simulatedLoadMs = Number(process.env.CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS) || undefined;
  // Jouer et enregistrer : le balancier simulé de VPX dessinerait son cercle dans la vidéo ; la partie reçoit un INI à part, balancier éteint (recordingini.ts).
  const recordIni = recording && simulated === undefined && !vrGame && !double && !otherVpx ? prepareRecordingIni(table) : undefined;
  // Partie dans le casque : la couche du repère de la pièce garde la table à sa place si le Quest remet l'origine.
  const roomEnv = vrGame && simulated === undefined ? vrFront.startGameRoom() : undefined;
  // Lunettes 3D (anaglyph-menu.ts) : la stéréo posée dans une copie du fichier de la table, passée par -TableIni ;
  // jamais dans le casque, ni pour régler l'affichage, ni avec un autre VPX.
  const anaglyphGame = simulated === undefined && !displayMode && !otherVpx && !vrGame ? await anaglyphMenu.prepareGame(played.file, double?.ini ?? recordIni?.ini ?? activeVpxIni(loc)) : undefined;
  // Toute autre partie (à plat, dans le casque, un autre VPX) : la 3D stéréoscopique globale du pilote NVIDIA coupée.
  if (simulated === undefined && !anaglyphMenu.nvidiaGame(anaglyphGame)) await anaglyphMenu.flatGame();
  // Table sans ROM : l'écoute des « DOF n, état » du script (dof-evenements-jeu.ts), relayés à libdof pour une
  // table originale que la config DOF connaît, sinon profil générique s'il est voulu.
  // Jamais dans le casque : ses variables (roomEnv) et celles de l'écoute ne se croisent donc pas.
  const hasRom = hasRomOf(table);
  const ledGame = simulated === undefined && !displayMode && !otherVpx && !vrGame;
  const dofMode = ledGame ? tapMode(dofTapDeps, { hasRom, b2sName: b2sNameOf(table) }) : undefined;
  // Au journal, le mode LED de chaque partie (25/11/2026 : une table à ROM jouée en effets sans ROM, sans trace).
  if (ledGame && hasRom) console.log(`LED de la partie : DOF de VPX (ROM ${romsOf(table).join(', ') || 'au nom inconnu'}).`); // i18n-ignore : journal
  else if (ledGame && !dofMode) console.log('LED de la partie : aucun effet (table sans ROM ; effets sans ROM coupés, ou pas de bandes décrites).'); // i18n-ignore : journal
  const dofTap = dofMode
    ? startTap(dofTapDeps, install.exe, dofMode, played.file, dofMode.kind === 'generique' ? { script: tableScriptText(table), ...(tints?.current()?.color ? { color: tints.current()!.color } : {}), ...(tints?.current()?.leds?.length ? { colors: tints.current()!.leds! } : {}) } : {})
    : undefined;
  if (simulated === undefined && !displayMode && !otherVpx && romsOf(table).length) refreshRomFallback(table);
  const dofTapEnv = dofTap ? { env: dofTap.env } : {};
  const vpxEnv = { ...(roomEnv ? { env: roomEnv } : {}), ...(vrGame?.tableIni ? { tableIni: vrGame.tableIni.file } : anaglyphGame ? { tableIni: anaglyphGame.file } : {}) };
  const classicTableIni = otherVpx && simulated === undefined ? prepareClassicPov(install.version, played.file, loc.dataDir) : undefined;
  // Partie seul : le score relevé pendant toute la session, par l'inspector de VPX (solo-score-watch.ts) ; table jamais copiée ni modifiée.
  let soloSetup: SoloInspectorSetup | undefined;
  let soloWatch: SoloScoreWatch | undefined;
  const soloPlan = simulated === undefined && !double && !vrGame && !recordIni && !otherVpx && !displayMode && mode !== 'display' && !autoStopAfterMs && scoresBefore ? tableScores.solo(table) : undefined;
  const soloPort = soloPlan ? inspector?.port : undefined;
  if (soloPlan && soloPort) soloSetup = prepareSoloInspector({ dataDir: loc.dataDir, ini: activeVpxIni(loc), tableFolder: table.folder, games: soloPlan.games, states: soloPlan.plan.states, port: soloPort, log: (line) => console.log(line) });
  const game =
    simulated !== undefined
      ? simulateVpx({ onPlaying, onForeground, onWindows, ...(simulatedLoadMs ? { loadMs: simulatedLoadMs } : {}), ...(process.env.CYBERPINBALL_PARTIE_SIMULEE_PLANTAGE ? { crashCode: Number(process.env.CYBERPINBALL_PARTIE_SIMULEE_PLANTAGE) } : {}) })
      : launchVpx({ exe: install.exe, ini: otherVpx ? undefined : (vrGame?.ini ?? double?.ini ?? recordIni?.ini ?? activeVpxIni(loc)), table: played.file, display: displayMode, version: install.version, tableIni: classicTableIni, ...dofTapEnv, vpxPrefDir: vpxPrefDir(install.version), ...vpxEnv, onVr, onPlaying, onForeground, onWindows });
  if (soloSetup && soloPlan && soloPort) soloWatch = watchSoloScores({ port: soloPort, plan: soloPlan.plan, log: (line) => console.log(line), onGame: (g, finished) => {
        console.log(`Relevé en direct (${table.id}) : partie ${finished ? 'finie' : 'quittée en cours'}, ${g.scores.join(' / ')} points, bille ${g.ball}.`); // i18n-ignore : journal
        if (finished) endCardAfterGame(table, g.scores, configuration?.buttons, () => game.stop());
      }, onPlay: () => endCard.close() });
  // Mode débogage : le journal de VPX est suivi pour la cadence en direct (debogage.ts).
  debug.gameBegin({ pid: game.pid, vpxLog });
  // Arrêt demandé par Cyber Pinball (Exit, casque perdu, partie entre amis…) : une fin voulue, pas un plantage.
  let gameStopAsked = false;
  const stopGame = game.stop;
  game.stop = () => {
    gameStopAsked = true;
    stopGame();
  };
  // DMD masqué pour cette table : sa fenêtre rangée hors des écrans avant même de paraître (in-game-menu.ts).
  if (configuration && simulated === undefined) inGameMenu.watchHiddenDmd({ pid: game.pid, table, cabinet: configuration, displays: observedDisplays(), dataDir: loc.dataDir });
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
  // VPX attend le casque (consigne « Mettez le casque ») : il a le premier plan mais ne lit encore aucun bouton ;
  // Exit de la borne (touche ou bouton du joystick), lu ici quelle que soit la fenêtre au premier plan, arrête
  // la partie et ramène à la roue (essai.30 : le joueur restait bloqué sur cet écran).
  // Un autre VPX peut avoir des boutons différents : Exit de la borne ferme toujours sa partie.
  const stopOtherExit = otherVpx && simulated === undefined ? vrFront.watchExitWhileWaiting(() => true, () => game.stop()) : undefined;
  const stopWaitExit = vrGame !== undefined ? vrFront.watchExitWhileWaiting(() => Boolean(vrFront.vrWearHint) && !vrFront.headset?.worn, () => {
    console.log(`Réalité virtuelle (${played.id}) : Exit pendant l'attente du casque ; la partie s'arrête, retour à la roue.`); // i18n-ignore : journal
    game.stop();
  }) : undefined;
  // Partie dans le casque : Échap quitte toujours, que VPX ait le clavier ou non, quoi que fasse un plugin ou le
  // réglage des manettes (essai du 10 novembre 2026 : partie bloquée, sortie avalée). Cyber Pinball ferme VPX.
  const vrEscape = vrGame !== undefined && simulated === undefined && globalShortcut.register(accelerator(SHORTCUTS.vrExit), () => {
    console.log('Partie dans le casque : Échap au clavier, Cyber Pinball ferme VPX.'); // i18n-ignore : journal
    if (guest.knock('game.force-stop')) game.stop();
  });
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
  stopWaitExit?.();
  endCard.close();
  // VPX parti : le dernier score connu est gardé ; le VPinballX.ini et memmaps reviennent comme avant.
  const trackedGames = soloWatch?.stop();
  soloSetup?.restore();
  stopOtherExit?.();
  dofTap?.stop();
  vrFront.vrGameStop = undefined;
  // Une partie réussie efface les pièces d'un échec précédent, qui ne partent plus dans un rapport (launch-evidence.ts).
  if (result.ok) rememberLaunch(result, table.title);
  const room = vrFront.endGameRoom({ ...result, stopAsked: gameStopAsked });
  // Ce que VPX a changé dans la copie de l'INI de la table pendant la partie, reporté dans l'INI de la table.
  if (vrGame?.tableIni) {
    try {
      const n = restoreVrTableIni(vrGame.tableIni);
      if (n) console.log(`Réalité virtuelle : ${n} réglage(s) de la table changé(s) pendant la partie, reporté(s) dans ${path.basename(vrGame.tableIni.original)}.`); // i18n-ignore : journal
    } catch (error) {
      console.warn(`Réalité virtuelle : réglages de la table pas reportés (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }
  // Partie en relief : de même, sans la stéréo posée par Cyber Pinball.
  if (anaglyphGame) anaglyphMenu.restoreGame(anaglyphGame);
  if (playedVr && vrGame) vrFront.checkVrPlaceAfterGame(vrGame.ini, played.file, room);
  // La pièce a pu sauter pendant la partie : la borne du menu reposée sur la limite du Quest.
  if (playedVr) setTimeout(vrFront.anchorCheck, 0);
  if (playedVr && vrGame) vrFront.checkVrRoomAfterGame(vpxLog, vrLogFrom);
  if (playedVr && vrGame && vrFront.vrGameStart) vrFront.noteLinkStats(vrFront.vrGameStart, Date.now());
  vrFront.headsetExitHint = undefined;
  vrFront.headsetExitNote = undefined;
  vrFront.vrWearHint = undefined;
  if (vision3dSource) noteVision3dGame(vision3dLog, vision3dLogFrom);
  if (cadenceLogFrom !== undefined) {
    const gameLines = noteGameCadence({ logsDir: path.join(loc.dataDir, 'logs'), tableFile: played.file, tableId: table.id, vpxLog, from: cadenceLogFrom, vr: playedVr, others: openDuringGame });
    // Pré-réglages (mode Auto) : le temps de rendu de la carte graphique, seulement d'une partie sur les écrans sans lunettes 3D.
    if (qualityPrepared && !playedVr && !vrGame && !anaglyphGame) {
      const quality = qualityAfterGame(loc.dataDir, gameLines, activeVpxIni(loc), played.file);
      if (quality) console.log(quality);
    }
  }
  if (playedVr && vrGame) vrFront.noteVrMeasures();
  // Gardé allumé deux minutes : la partie suivante a le joueur déjà repéré (partie dans le casque : éteint).
  if (vision3dSource && !playedVr) headTracker.release();
  else headTracker.stop();
  stopCentering?.();
  vrFront.headsetPaused = false;
  // VPX parti, le compagnon qui veillait repart sur une session neuve : elle prend le casque d'elle-même,
  // alors que la session en veille attend que le joueur la rechoisisse dans l'accueil de Link (5 à 11 s,
  // essai du 10 novembre 2026 ; une session neuve, environ 1 s).
  if (playedVr && vrFront.headset?.standby) {
    console.log('Casque : partie finie, le compagnon repart sur une session neuve pour reprendre le casque sans l’accueil de Link.'); // i18n-ignore : journal
    vrFront.headset.restart();
  }
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
  if (recordIni) finishRecordingIni(recordIni, table);
  if (simulated === undefined) globalShortcut.unregister(accelerator(SHORTCUTS.forceStop));
  if (vrEscape) globalShortcut.unregister(accelerator(SHORTCUTS.vrExit));
  cinema.stop();
  stopWatchOccupied();
  socialNet.setPresence({ status: 'menu', since: new Date().toISOString() });
  playing = undefined;
  // Le menu reprend le DMD réel ; un DMD branché ou débranché pendant la partie est pris en compte.
  menuDmdServer().resume();
  applyMenuDmdServer();
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
  // Volume réglé à la porte pendant la partie : gardé comme choix du joueur (rom-volume.ts).
  if (romVolumeWatched) romVolumes.afterGame(table);
  // Un score entré au tableau d'honneur pendant la partie : le knocker sonne au retour au menu.
  const entered = result.ok ? newRecords(recordsBefore, recordsAfter) : [];
  for (const s of entered) console.log(`Record (${table.id}) : ${s.score}${s.initials ? ` (${s.initials})` : ''}, place ${s.rank}.`);
  if (result.ok) {
    // Les parties du test automatique ne comptent pas dans les statistiques.
    if (!autoStopAfterMs) recordPlay(table, startedAt, result.seconds);
    // Tables du jour : une partie d'au moins une minute, sur sa version exacte ; ni en invité, ni avec le VPX d'essai.
    if (!autoStopAfterMs && !guest.active && result.seconds >= 60 && !vpxInstall(loc)?.trial) void notePlayedVersion(table);
    // Le niveau (level-tracker.ts) : la partie, ses scores s'ils sont relevés, ses records, son mode.
    const levelFacts = { table: presenceTable(table), seconds: result.seconds, entered: double ? [] : entered.map((e) => e.rank), newTable: (table.info.User?.StartCount ?? 0) === 0, at: new Date(), ...(vrGame !== undefined ? { mode: 'vr' as const } : vision3dMenu.setting().mode === 'on' ? { mode: 'vision3d' as const } : {}) };
    // Retour de partie (game-return.ts) : seul à la table, hors essai ; le moment des badges attend son bilan.
    const returnShown = !autoStopAfterMs && !double && !socialClosed();
    if (returnShown) gameReturn.expect();
    const levelAfterGame = (scores?: number[]) => {
      let report: GameReport | undefined;
      try {
        report = levelTracker.gameEnded({ ...levelFacts, ...(scores ? { scores } : {}) });
      } catch (error) {
        console.log(`Partie (${table.id}) : niveau et badges pas mis à jour (${(error as Error).message}) ; la partie compte quand même.`); // i18n-ignore : journal
      }
      if (returnShown && report) void showGameReturn(table, report, startedAt);
      else gameReturn.release();
    };
    // Les scores de la partie, datés, au tableau des scores de la table ; sans retarder le retour au menu.
    if (!autoStopAfterMs && scoresBefore) {
      tableScores
        .finish(table, scoresBefore, double ? { live: { ...(live?.score ? { score: live.score } : {}) } } : { recordsBefore, recordsAfter, ...(trackedGames?.length ? { tracked: trackedGames } : {}) })
        .then(async (kept) => {
          if (kept.length) broadcast();
          await publishScores(table, kept, Boolean(double && live?.multi));
          await noteChallengeScores(table, kept, Boolean(double && live?.multi));
          levelAfterGame(kept.filter((p) => !p.of).map((p) => p.score));
          challengeFromEndCard(table);
        })
        .catch((error: Error) => {
          console.log(`Tableau des scores (${table.id}) : partie non gardée (${error.message}).`); // i18n-ignore : journal
          levelAfterGame();
          challengeFromEndCard(table);
        });
    } else challengeFromEndCard(table);
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
      } catch (error) {
        console.log(`Partie (${table.id}) : nouvelles pour les amis pas envoyées (${(error as Error).message}) ; la partie compte quand même.`); // i18n-ignore : journal
      }
      // Sans relevé des scores, le niveau n'attend rien de plus.
      if (!scoresBefore) levelAfterGame();
    }
    const unseen = simulated === undefined ? joystickMessage(install.version) : undefined;
    state = unseen ? { ...state, phase: 'message', message: unseen } : { ...state, phase: 'menu' };
    // Partie enregistrée : son écran (aperçu, utiliser pour la roue, garder, jeter) avant la roue.
    if (recorded && !unseen) showRecording({ ...recorded, table: tables.find((t) => t.id === table.id) ?? recorded.table });
  } else {
    // Toute partie échouée laisse sa trace au journal : le 12/11/2026, trois lancements d'Addams
    // Family arrêtés sur sa fenêtre d'options n'y avaient rien laissé.
    console.log(`Partie (${table.id}) : échec (${result.failure ?? 'inconnu'}) : ${result.message ?? ''}`); // i18n-ignore : journal
    // VPX arrêté avant d'écrire son journal : ses fichiers sont-ils encore ceux de son archive (vpx-integrity.ts) ?
    const changedFiles = result.failure === 'crash' && result.logWritten === false ? vpxChangedFiles(loc) : [];
    rememberLaunch(result, table.title, changedFiles);
    const repaired = result.failure === 'dialog' && result.message ? repairScriptStop(table, result.message) : undefined;
    // Série du VPX corrigé en place (vpx-corrige.ts) : un défaut qu'elle corrige ne se dit pas « à venir » (vpxfailure.ts).
    const vpxPatch = simulated === undefined && !otherVpx ? vpxCorrigeInPlace(path.dirname(install.exe), install.version, path.join(__dirname, '..')) : undefined;
    const message = explain(result, table, repaired, Boolean(double), changedFiles, vpxPatch);
    // Plantage de VPX : le rapport automatique (avec l'accord), ou la question au premier plantage, en quittant l'écran.
    if (result.failure === 'crash' && message.report && library.feedback) noteCrashOutcome(message, library.feedback.crashed(message.report.signature, table.title, message.report.about));
    state = { ...state, phase: 'message', message };
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
  // VPX d'essai (vpx-essai.ts) : autre physique (secousses, lanceur), les scores restent sur la borne.
  if (vpxInstall(loc)?.trial) return void console.log(`Classements (${table.id}) : non publiés, partie jouée avec le VPX d'essai.`); // i18n-ignore : journal
  const board = boardKey(await liveGames.versionOf(table));
  if (!board) return;
  const balls = (await ballCounts.of(table))?.balls;
  for (const p of solo) {
    const sent = socialNet.publishScore({ board, ...(balls ? { balls } : {}), table: presenceTable(table), score: p.score, at: p.at, how: p.how });
    if (sent) console.log(`Classements (${table.id}) : ${p.score} publié (${balls ? `${balls} billes` : 'billes inconnues'}).`); // i18n-ignore : journal
  }
}

/**
 * Partie solo finie, lue en direct : la carte de fin de partie, par-dessus VPX (carte-fin-partie.ts).
 * Flip gauche : VPX s'arrête, puis le défi s'ouvre une fois le front-end revenu (challengeFromEndCard).
 */
function endCardAfterGame(table: TableEntry, scores: readonly number[], buttons: Parameters<typeof endCard.gameOver>[1], stopGame: () => void): void {
  const score = scores[0];
  if (scores.length !== 1 || !score) return;
  endCard.gameOver(() => endCardFor(table, score), buttons, () => {
    challengeAfterGame = table;
    stopGame();
  });
}

/**
 * La carte de fin de partie (carte-fin-partie.ts) : ce score sur la version exacte de la table, le top 3
 * de mon pays avec ma ligne, ma place au monde. Le score compte tout de suite, avant d'être publié.
 */
function endCardFor(table: TableEntry, score: number): EndCardView {
  const net = socialNet.state();
  const version = tableRankings.version(table);
  const unavailable = guest.active
    ? t('Mode invité : pas de classement')
    : vpxInstall(loc)?.trial
      ? t('VPX d’essai : les scores restent sur la borne')
      : !net.enabled
        ? t('Partage désactivé : Communauté > Partage et réseau')
        : version.state === 'pending'
          ? t('Empreinte de la table en calcul…')
          : version.state === 'none'
            ? t('Version de la table illisible : pas de classement')
            : undefined;
  const country = socialNet.country();
  const challengeOff = challengesMenu.unavailableAfterGame(table);
  return endCardView({
    table: presenceTable(table),
    score,
    at: new Date().toISOString(),
    locale: locale(),
    ...(net.shareScores === false ? { note: t('tes scores ne sont pas publiés') } : {}),
    ...(challengeOff ? { challengeOff } : {}),
    ranking:
      unavailable || version.state !== 'ok'
        ? { unavailable: unavailable ?? '' }
        : { store: socialNet.rankings(), board: version.board, ...(version.balls ? { balls: version.balls } : {}), me: { key: net.key.publicKey, name: net.name, ...(country ? { country } : {}) } },
  });
}

/** Défi demandé sur la carte de fin de partie : le choix du joueur, une fois le front-end revenu et le score publié. */
function challengeFromEndCard(table: TableEntry): void {
  if (challengeAfterGame?.id !== table.id) return;
  challengeAfterGame = undefined;
  let tries = 0;
  const open = () => {
    if (state.phase === 'menu' && !playing && !library.isActive()) {
      challengesMenu.sheetAction(table, () => library.leave()).run();
      broadcast();
    } else if (++tries < 50) setTimeout(open, 200);
    else console.log(`Carte de fin de partie (${table.id}) : choix du défi pas ouvert, le front-end est occupé.`); // i18n-ignore : journal
  };
  open();
}

/**
 * Défis (challenge-service.ts) : les scores d'une partie seul à la table, relevés par Cyber Pinball, sur
 * sa version exacte et son nombre de billes ; mon meilleur part pour chaque défi ouvert sur cette version.
 * Mêmes règles que les classements : ni invité, ni partie à plusieurs, ni VPX d'essai.
 */
async function noteChallengeScores(table: TableEntry, kept: readonly PlayedScore[], multi: boolean): Promise<void> {
  const solo = kept.filter((p) => !p.of);
  if (guest.active || multi || !solo.length || vpxInstall(loc)?.trial) return;
  try {
    const board = boardKey(await liveGames.versionOf(table));
    if (!board) return;
    const balls = (await ballCounts.of(table))?.balls;
    challengeService.gamePlayed({ board, ...(balls ? { balls } : {}) }, solo.map((p) => p.score));
  } catch (error) {
    console.log(`Défis (${table.id}) : scores non comptés (${(error as Error).message}).`); // i18n-ignore : journal
  }
}

/** La carte « Objectif » du chargement, calculée une fois par lancement (une version encore en calcul se relit). */
let objectiveKept: { file: string; since: number; view?: LoadingObjectiveView } | undefined;
function loadingObjectiveFor(table: TableEntry | undefined): LoadingObjectiveView | undefined {
  if (!table || table.emulator !== 'vpx' || socialClosed() || socialNetMode(process.env) === 'off') return undefined;
  if (objectiveKept?.file === table.file && Date.now() - objectiveKept.since < 60_000) return objectiveKept.view;
  try {
    const goal = dailyTables.goalOf(table);
    const view = loadingObjective(goal, { face: (h) => dailyTables.face(h), best: myTableBest(table), country: socialNet.country() });
    if (goal.state !== 'pending') objectiveKept = { file: table.file, since: Date.now(), ...(view ? { view } : {}) };
    return view;
  } catch (error) {
    console.log(`Chargement (${table.id}) : objectif non calculé (${(error as Error).message}).`); // i18n-ignore : journal
    return undefined;
  }
}

/** Retour de partie (game-return.ts) : la version exacte de la table, puis l'écran s'il y a du neuf. */
async function showGameReturn(table: TableEntry, report: GameReport, since: Date): Promise<void> {
  try {
    const board = boardKey(await liveGames.versionOf(table));
    const balls = board ? (await ballCounts.of(table))?.balls : undefined;
    const fresh = tables.find((x) => x.id === table.id) ?? table;
    if (gameReturn.report({ table: fresh, ...(board ? { version: { board, ...(balls ? { balls } : {}) } } : {}), since, report })) broadcast();
  } catch (error) {
    gameReturn.release();
    console.log(`Retour de partie (${table.id}) : bilan non montré (${(error as Error).message}).`); // i18n-ignore : journal
  }
}

/** Tables du jour (daily-tables.ts) : la partie comptée sur la version exacte de la table et son nombre de billes. */
async function notePlayedVersion(table: TableEntry): Promise<void> {
  try {
    const board = boardKey(await liveGames.versionOf(table));
    if (!board) return;
    const balls = (await ballCounts.of(table))?.balls;
    dailyTables.gamePlayed(table, { board, ...(balls ? { balls } : {}) });
  } catch (error) {
    console.log(`Tables du jour (${table.id}) : partie non comptée (${(error as Error).message}).`); // i18n-ignore : journal
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

/** INI de VPX pour une partie enregistrée : celui de la borne, balancier simulé éteint (recordingini.ts). */
interface RecordingIni {
  ini: string;
  /** Texte reçu par VPX : ce qu'il y change en partie est reporté dans `base`. */
  launched: string;
  base: string;
}

function prepareRecordingIni(table: TableEntry): RecordingIni | undefined {
  const base = activeVpxIni(loc);
  try {
    const text = recordingIniText(readTextIfExists(base));
    if (text === undefined) return undefined;
    const ini = path.join(loc.dataDir, 'enregistrement', 'VPinballX.ini');
    fs.mkdirSync(path.dirname(ini), { recursive: true });
    writeFileAtomic(ini, text);
    console.log(`Enregistrement (${table.id}) : balancier simulé de VPX éteint pour cette partie (INI à part : ${ini}) ; son cercle n'entrera pas dans la vidéo.`); // i18n-ignore : journal
    return { ini, launched: text, base };
  } catch (error) {
    console.log(`Enregistrement (${table.id}) : INI à part impossible (${(error as Error).message}) ; balancier simulé laissé, son cercle peut entrer dans la vidéo.`); // i18n-ignore : journal
    return undefined;
  }
}

/** Après la partie enregistrée : ce que VPX a changé dans son INI (réglages en partie) revient dans celui de la borne. */
function finishRecordingIni(r: RecordingIni, table: TableEntry): void {
  try {
    const settings = recordingIniCarryBack(r.launched, readTextIfExists(r.ini));
    if (!settings.length) return;
    writeIniSettings(r.base, settings);
    console.log(`Enregistrement (${table.id}) : ${settings.length} réglage(s) changé(s) dans VPX pendant la partie, repris dans l'INI de la borne (${settings.map((s) => `${s.section}.${s.key}`).join(', ')}).`); // i18n-ignore : journal
  } catch (error) {
    console.log(`Enregistrement (${table.id}) : réglages de la partie pas repris (${(error as Error).message}).`); // i18n-ignore : journal
  }
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
/** Miniatures des logos de la roue (wheel-thumbs.ts). */
let wheelThumbs: WheelThumbs | undefined;
/** Collection dont les logos ont été confiés à la tâche de fond des miniatures. */
let thumbsWarmed: readonly TableEntry[] | undefined;
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
function watchOccupied(simulated: RoleId[] | undefined, other?: { name: string; pids: () => number[] }): void {
  const update = (roles: RoleId[]) => {
    const next = new Set(roles);
    if (next.size === occupied.size && [...next].every((r) => occupied.has(r))) return;
    occupied = next;
    for (const role of next) occupiedThisGame.add(role);
    console.log(`Partie : écrans occupés par ${other?.name ?? 'VPX'} : ${[...occupied].join(', ') || 'aucun'}.`);
    broadcast();
    // Un écran que VPX prend ou rend : la bande de la partie entre amis change de place.
    showLiveBoard();
  };
  occupiedThisGame = new Set();
  minimizedSeen = new Set();
  if (simulated) return update(simulated);
  dressCoveredSeen = false;
  // Jeu autre que VPX (Pinball FX, Pinball FX3, Future Pinball) : ses seules fenêtres comptent (game-screens.ts).
  const seen = new Set<bigint>();
  const check = () => {
    try {
      let stack = listWindows((w) => w.visible);
      if (other) return update(watchGameWindows({ zones: roleRects, stack, ownPid: process.pid, gamePids: other.pids(), game: other.name, seen, label: roleLabel, log: (line) => console.log(line) }));
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

/** Nom d'un rôle dans le journal : celui que lui donne la borne (« Backglass », « FullDMD »…). */
function roleLabel(role: RoleId): string {
  return cabinetRoleLabel(loadCabinet(loc.dataDir), role, ROLES.find((r) => r.id === role)!.label);
}

/** Écrans qui ont fini de changer : chaque fenêtre reprend l'écran de son rôle, là où il est désormais (game-screens.ts). */
function followMenuScreens(): void {
  if (desktop.active) return;
  try {
    const cabinet = loadCabinet(loc.dataDir);
    const followed = followScreens({ assignments: menuAssignments, zones: cabinet ? cabinetZones(cabinet) : {}, windows, observed: observedDisplays(), label: roleLabel, log: (line) => console.log(line) });
    if (!followed) return;
    menuAssignments = followed.assignments;
    roleRects = followed.roleRects;
  } catch (error) {
    console.log(`Écrans : fenêtres pas reposées (${(error as Error).message}).`); // i18n-ignore : journal
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
      t('Start : refaire l’étape « Boutons » · Exit : Menu système'),
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
function explain(result: LaunchResult, table: TableEntry, repaired?: string, live = false, changedFiles: readonly string[] = [], vpxPatch?: number): Message {
  // Arrêt reconnu dans le journal de VPX (vpxfailure.ts) : la vraie raison, et Start relance la
  // table, ou ouvre la partie entre amis ; jamais « ce qu'il manque pour jouer », rien ne manque.
  const known = repaired ? undefined : diagnoseVpxFailure(result.logTail, result.exitCode, path.basename(tableScriptFile(table) ?? table.file), tableScriptText(table), {
    ...(result.logWritten !== undefined && { logWritten: result.logWritten }),
    changedFiles,
    ...(vpxPatch !== undefined && { vpxPatch }),
  });
  if (known) {
    console.log(known.journal);
    const lines = [...known.lines];
    if (live) lines.push(t('Partie entre amis : les autres continuent ; ton score compte jusqu’à l’arrêt.'));
    lines.push(...result.notices);
    if (result.logTail.length) lines.push(t('Fin du journal de VPX :'), ...result.logTail.slice(-5));
    // VPX arrêté en démarrant, ses fichiers modifiés : Start les remet (startVpxInstall).
    const action: Message['action'] = known.startup && changedFiles.length ? 'install-vpx' : live ? 'live' : 'replay';
    return { title: known.title, lines, action, table: table.file, report: failureReport(result, table, known.title, known.startup) };
  }
  const lines = [result.message ?? t('Erreur inconnue.')];
  if (repaired) lines.push(t('Cyber Pinball a corrigé le script de la table ({fix}) : relance-la.', { fix: repaired }));
  if (result.message && /can't start game/i.test(result.message)) {
    lines.push(t('La ROM de cette table est introuvable : elle doit être dans le dossier pinmame\\roms de la table.'));
  }
  const dmdFolder = cachedScript(table.file, loc.dataDir)?.dmdFolder;
  const scriptStopped = /type (mismatch|incompatible)/i.test([result.message ?? '', ...result.logTail.slice(-15)].join('\n'));
  if (dmdFolder && scriptStopped && !fs.existsSync(path.join(table.folder, dmdFolder))) {
    lines.push(t('Le script s’est arrêté sur le DMD qu’il dessine : son dossier « {folder} » manque. Start : le récupérer (« Pour aller plus loin »).', { folder: dmdFolder }));
  }
  lines.push(...result.notices);
  if (result.logTail.length) lines.push(t('Fin du journal de VPX :'), ...result.logTail.slice(-5));
  return { title: t('La partie n’a pas pu se dérouler'), lines, action: 'journey', table: table.file, report: failureReport(result, table, result.message ?? t('Erreur inconnue.')) };
}

/** Ce qu'une partie échouée confie au formulaire des retours : la table, la raison, et de quoi regrouper ce plantage. */
function failureReport(result: LaunchResult, table: TableEntry, reason: string, startup = false): Message['report'] {
  const code = vpxExitName(result.exitCode);
  return {
    about: [table.title, code ? t('VPX arrêté : {code}', { code }) : reason].join(' · '),
    table: table.title,
    // Arrêté en démarrant : la panne est celle de VPX, pas de la table ; ses plantages se regroupent, toutes tables.
    signature: crashSignature('vpx', code?.split(',')[0] ?? result.failure ?? 'inconnu', startup ? 'demarrage' : table.id),
  };
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
  pointAtTable(index);
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
  // VPX déjà là sans son runtime (Windows neuf, message du démarrage, Santé de la borne) : le runtime seul.
  if (vpxInstall(loc) && !vcRuntimeReady().ok) {
    askVcRuntime();
    return true;
  }
  // VPX là, mais des fichiers remplacés hors de Cyber Pinball (un autre VPX copié par-dessus) : leurs originaux, tirés de l'archive.
  if (vpxInstall(loc) && vpxFilesStatus(loc)?.changed.length) {
    show([t('Préparation…')]);
    restoreVpxFiles(loc, (received, total) => show([t('Téléchargement : {percent} % ({received} / {total} Mo)', { percent: Math.floor((received / total) * 100), received: Math.round(received / 1e6), total: Math.round(total / 1e6) }), t('Ne débranche pas la borne.')]), library.downloads.manager)
      .then((n) => vpxReady(tn(n, 'Le fichier d’origine de VPX est remis.', 'Les {n} fichiers d’origine de VPX sont remis.')))
      .catch((error: Error) => show([t('Les fichiers de VPX n’ont pas été remis : {error}', { error: error.message }), t('Start : réessayer · Exit : plus tard')], 'install-vpx'));
    return true;
  }
  show([t('Préparation…')]);
  installVpx(
    root,
    (p) => show([t('Téléchargement : {percent} % ({received} / {total} Mo)', { percent: p.percent, received: p.receivedMb, total: p.totalMb }), t('Ne débranche pas la borne.')]),
    library.downloads.manager,
  )
    .then((version) => {
      reloadTables();
      const done = t('Visual Pinball X {version} est installé et vérifié.', { version });
      // Windows neuf : le runtime Visual C++ suit, après l'avertissement de la demande de Windows.
      if (!vcRuntimeReady().ok) askVcRuntime();
      else vpxReady(done);
    })
    .catch((error: Error) => show([t('L’installation a échoué : {error}', { error: error.message }), t('Start : réessayer · Exit : plus tard')], 'install-vpx'));
  return true;
}

/** VPX prêt à jouer : aux tables, ou à l'ajout s'il n'y en a pas encore. */
function vpxReady(done: string): void {
  // La bibliothèque SDL de VPX est enfin chargeable : les joysticks (Pinscape…) se relisent tout de
  // suite. Leurs boutons, que l'assistant n'avait pas pu lire, sont à relever.
  const joysticks = retryJoysticks();
  const devices = joysticks.state === 'ready' ? joysticks.devices : [];
  const redo = joystickButtonsUnrecorded(loadCabinet(loc.dataDir)?.buttons, devices.length)
    ? [t('Joystick lu : {names}. Relève ses boutons dans Menu système > « Ma borne » > « Configuration de la borne » > « Boutons » > « Boutons du jeu », puis « Lanceur analogique ».', { names: devices.map((d) => d.name || d.id).join(', ') })]
    : [];
  if (tables.length) state = { ...state, phase: 'message', message: { title: t('Installation de VPX'), lines: [done, ...redo, t('Start ou Exit : aller aux tables.')] } };
  // Pas encore de table : on enchaîne sur l'ajout.
  else state = { ...state, phase: 'message', message: { ...noTables(), lines: [done, ...redo, ...noTables().lines] } };
  broadcast();
}

/** Le message « il manque le runtime Visual C++ » ; Start l'installe (startVpxInstall, puis askVcRuntime). */
function vcRuntimeMessage(status: VcRuntimeStatus): Message {
  return {
    title: t('Il manque le runtime Visual C++ à Windows'),
    lines: [
      t('VPX ne peut pas démarrer sans le runtime Visual C++ de Microsoft ({detail}).', { detail: describeVcRuntime(status) }),
      t('Cyber Pinball installe la version officielle de Microsoft (19 Mo) ; Windows demande ton accord une fois.'),
      t('Start : l’installer maintenant · Exit : plus tard'),
    ],
    action: 'install-vpx',
  };
}

/**
 * Le runtime Visual C++ de Microsoft (vc-runtime.ts) : l'avertissement de la demande de Windows d'abord
 * (uac-confirm.ts, « Plus tard » choisi d'office), puis l'installateur officiel, sans fenêtre.
 */
function askVcRuntime(): void {
  askElevation((build, at) => library.openCustom(build, at), {
    title: t('Runtime Visual C++'),
    what: t('Installer le runtime Visual C++ de Microsoft, sans lequel VPX ne démarre pas (19 Mo, sans fenêtre).'),
    go: () => {
      library.leave();
      installVcRuntime();
    },
    later: () => {
      library.leave();
      state = { ...state, phase: 'message', message: vcRuntimeMessage(vcRuntimeReady()) };
      broadcast();
    },
  });
}

function installVcRuntime(): void {
  const show = (lines: string[], action?: Message['action']) => {
    state = { ...state, phase: 'message', message: { title: t('Runtime Visual C++'), lines, action } };
    broadcast();
  };
  show([t('Préparation…')]);
  ensureVcRuntime(layoutOf(loc.root!).downloads, { downloads: library.downloads.manager, onStep: (line) => show([line]) })
    .then((result) => {
      if (result.ok) vpxReady(t('Le runtime Visual C++ de Microsoft est installé : VPX peut démarrer.'));
      else show([t('Le runtime Visual C++ n’est pas installé : {reason}.', { reason: result.reason }), t('Start : réessayer · Exit : plus tard')], 'install-vpx');
    })
    .catch((error: Error) => show([t('Le runtime Visual C++ n’est pas installé : {reason}.', { reason: error.message }), t('Start : réessayer · Exit : plus tard')], 'install-vpx'));
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
  void openSettings(target, { bounds: playfield?.getBounds(), rotation, onClose: () => playfield && !playfield.isDestroyed() && playfield.focus(), ...(table ? { romVolume: romVolumeControl(table, romVolumes) } : {}) }).then(() => {
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

/**
 * Relance le menu : une autre configuration de la borne rouvre ses fenêtres sur ses écrans. Après
 * une langue ou une configuration, la borne était déjà ouverte : pas d'ouverture. « Redémarrer Cyber
 * Pinball », demandé par le joueur, la rejoue comme un démarrage (`withIntro`, 11/11/2026).
 */
function relaunchMenu(withIntro = false): void {
  // Par le gardien des écrans, comme toute relance : aucun écran ne montre le bureau entre les deux.
  // app.exit ferme l'ancien processus sans before-quit : ce qu'il garde est enregistré ici.
  saveSettings();
  const args = withoutResume(process.argv.slice(1)).filter((a) => a !== INTRO_SKIP_FLAG);
  // Relance technique (retour du bureau, langue, DMD…) : le menu reprend sa place (menu-resume.ts) ; un redémarrage demandé repart de zéro.
  const resume = withIntro ? undefined : resumeArg(menuPlace());
  relaunchCovered(withIntro ? args : [...args, INTRO_SKIP_FLAG, ...(resume ? [resume] : [])]);
}

/** Où est le menu : la table sélectionnée, et la rubrique du menu système ouverte (relaunchMenu). */
function menuPlace(): MenuResume {
  const table = tables[state.index]?.file;
  const system = state.phase === 'library' ? library.systemPlace() : undefined;
  return { ...(table ? { table } : {}), ...(system ? { system } : {}) };
}

/** Au démarrage, après une relance par le menu lui-même : la table et la rubrique d'avant (menuPlace). */
function resumeMenuPlace(resume: MenuResume | undefined, screensFirst: boolean): void {
  if (!resume) return;
  const table = resume.table ? tables.find((entry) => entry.file === resume.table) : undefined;
  if (table) pointAtTable(table);
  // Conditions ou profil à présenter d'abord : ils ramènent à la roue, la rubrique n'est pas reprise.
  const reopened = state.phase === 'menu' && !screensFirst && resume.system ? library.reopenSystem(resume.system) : false;
  console.log(`Reprise du menu après la relance : table ${table ? table.id : 'de départ'}${resume.system ? (reopened ? `, menu système (${resume.system.group ?? 'racine'})` : ', menu système non repris') : ''}.`); // i18n-ignore : journal
  broadcast();
}

/** Les règles du pare-feu au démarrage (firewall-guard.ts) ; après une mise à jour, l'écran qui demande de les reposer. */
async function checkFirewallAtStart(): Promise<void> {
  const update = updates.justInstalled();
  const report = await guardFirewall(socialFirewall, { ...(update ? { update } : {}), log: (line) => console.log(line) });
  // En jeu local, rien à demander : le réseau des bornes est arrêté et « Partage et réseau » retiré.
  if (socialFirewall.simulated || !report.problems.length || localPlay()) return;
  if (update && state.phase === 'menu' && !guest.active && !closing) friendsMenu.openFirewall(() => library.leave());
  else showBanner(tLater('Pare-feu de Windows : {reason}. Menu système > Communauté > Réglages de la communauté > Partage et réseau.', { reason: report.problems[0]!.reason }), 'sharing');
}

/**
 * Constat bref en haut du menu, qui s'efface seul : il ne demande aucun bouton. `note` : il entre
 * aussi à Activité récente, Start y ouvrant l'entrée du menu système qu'il nomme (un constat du
 * démarrage) ; la réponse immédiate à un geste (orientation rendue, veille simulée) n'y entre pas.
 */
function showBanner(said: StoredText, note?: SystemItemId): void {
  // Gardé à l'Activité récente tel quel (LaterText) : dit dans la langue du moment à chaque lecture.
  if (note) activityMenu.note({ kind: 'note', facts: { key: typeof said === 'string' ? said : JSON.stringify(said), text: said, item: note } });
  const text = say(said);
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
  // `credit` : la table choisie dans la roue, « Data East · 1990 · par TastyWasps » (l'auteur principal de la recréation).
  const describe = (entry: TableEntry, credit = false) => {
    const lead = credit ? library.credits.lead(entry) : undefined;
    return {
      title: entry.title,
      manufacturer: entry.manufacturer,
      year: entry.year,
      subtitle: [entry.manufacturer, entry.year, lead ? t('par {name}', { name: lead }) : undefined].filter(Boolean).join(' · '),
      // Le logiciel qui la joue : la puce devant fabricant · année, dans la plaque du titre (17/11/2026).
      engine: TABLE_ENGINES[entry.emulator].short,
      version: entry.version,
      plays: entry.info.User?.StartCount ?? 0,
      lastRun: entry.info.User?.LastRun,
      favorite: isFavorite(entry.info),
      wheel: wheel(entry),
    };
  };
  // Voisines de la table choisie, pour la liste et la roue : identité stable (le fichier),
  // titre, fabricant et année (logo de repli de la roue), version et logo.
  // Dans la roue et la liste, le logo réduit à sa taille d'affichage dès qu'il existe (wheel-thumbs.ts).
  const small = (t: TableEntry) => (wheelThumbs ? wheelThumbs.url(wheel(t)) : wheel(t));
  const neighbor = (t: TableEntry, offset: number) => ({ offset, key: t.file, title: t.title, manufacturer: t.manufacturer, year: t.year, version: t.version, wheel: small(t) });
  // Neuf places : sept visibles (roue Médaillons), et une de chaque côté d'où les logos entrent ;
  // moins de neuf entrées : chacune une seule fois (aucune répétée pour remplir), réparties de part
  // et d'autre du choix, en boucle comme la liste. Le médaillon Juke-box en tête de la collection
  // (jukebox-screens.ts), compté dans le compteur ; pas en mode attente, qui montre une table.
  const ring = medallionWheel({ tables: list.length, at, leads: shown ? [] : wheelLeads(), selected: selectedMedallion() });
  const neighbors = ring.places.map((p) =>
    'medallion' in p
      ? p.medallion === 'jukebox'
        ? { offset: p.offset, key: JUKEBOX_WHEEL_KEY, title: t('Juke-box'), jukebox: true }
        : p.medallion === 'community'
          ? { offset: p.offset, key: COMMUNITY_WHEEL_KEY, title: t('Communauté'), community: true }
          : p.medallion === 'arena'
            ? { offset: p.offset, key: ARENA_WHEEL_KEY, title: t('Arène'), arena: true }
            : { offset: p.offset, key: COLLECTIONS_WHEEL_KEY, title: t('Collections'), collectionsMedallion: true }
      : neighbor(list[p.table]!, p.offset),
  );
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
    table: !shown && onJukebox() ? jukeboxCard() : !shown && onCommunity() ? communityCard() : !shown && onArena() ? arenaCard() : !shown && onCollections() ? collectionsCard() : table ? describe(table, !shown) : undefined,
    neighbors,
    // Repère de la collection active, partout où le menu des tables est dessiné (sous une fiche aussi :
    // sa zone ne bouge jamais). La liste des collections ne paraît plus par-dessus la roue : le médaillon Collections l'ouvre.
    ...(role === 'playfield' && tables.length ? collections.view() : {}),
    menuLayout: mediaSettings.menuLayout,
    // Logos animés de la roue : seul celui de la table choisie s'anime (« selected »), ou tous.
    wheelMotion: mediaSettings.wheelMotion,
    // Roue en relief avec les lunettes 3D (anaglyph-menu.ts, app/renderer/relief-roue.js) : les lunettes, ou rien.
    relief: role === 'playfield' ? anaglyphMenu.wheelRelief() : undefined,
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
    // La carte « Objectif » (loading-objective.ts) : le rendu ne la pose que sur l'écran de repli ou dans l'encart du bureau, jamais sur un média du joueur.
    objective: state.phase === 'loading' && role === 'playfield' && !displayMode ? loadingObjectiveFor(playing ?? table) : undefined,
    // Partie dans le casque, casque pas sur la tête : la consigne sur le playfield et le fronton, du Start à la fin.
    vrWear: vrFront.vrWearHint && (role === 'playfield' || role === 'backglass') && (state.phase === 'loading' || state.phase === 'playing') ? vrFront.vrWearHint : undefined,
    // Chargement qui tarde (loadingprogress.ts) : l'étape vue, l'heure du Start (le rendu compte les secondes), comment arrêter.
    slow:
      state.phase === 'loading' && role === 'playfield' && launch?.slow
        ? launch.stopped
          ? { step: t('Arrêt demandé : VPX se ferme'), since: launch.since }
          : { step: loadingStepLabel(launch.step), since: launch.since, stop: isZenEmulator(playing?.emulator) || playing?.emulator === 'futurepinball' ? t('{keys} ou Exit : arrêter · en partie, appui long sur Exit : quitter {game}', { keys: shortcutLabel(SHORTCUTS.forceStop), game: TABLE_ENGINES[playing!.emulator].short }) : t('{keys} ou Exit : arrêter', { keys: shortcutLabel(SHORTCUTS.forceStop) }) }
        : undefined,
    // Fronton du jeu choisi (image Backglass), en fond du menu au bureau, à côté du plateau.
    backglass: role === 'playfield' && m && table && !shown && !onMedallion() ? m.typeMedia(table, 'backglass', 'Backglass') : undefined,
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
    // Badge reçu, niveau qui monte : le moment, au retour sur l'écran des tables (level-tracker.ts, niveau.js).
    ...(role === 'playfield' ? { levelMoment: levelMomentView() } : {}),
    library: state.phase === 'library' ? library.view() : undefined,
    // Mode attente : la table montrée, son logo, et l'invite du playfield.
    // Ses crédits en une ligne discrète, au-dessus de l'invite (réglage « Crédits de la table » du mode attente).
    attract: shown ? { ...describe(shown), wheel: m?.wheel(shown), ...(mediaSettings.attractCredits ? { credits: library.credits.attractLine(shown) } : {}) } : undefined,
    // Horaire : voile noir de la nuit (0 à 1) sur chaque écran, en attente seulement.
    night: shown ? Math.max(hours.night() ? mediaSettings.hours.nightDim / 100 : 0, nightMode?.screenDim() ?? 0) : 0,
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
    // Messagerie : le fronton montre la carte de l'ami du fil ouvert ; le DMD, quelques secondes, l'arrivée d'un message au menu.
    friendCard: state.phase === 'library' && !socialClosed() ? chatMenu.frontonCard() : undefined,
    dmdMessage: dmdMessage && dmdMessage.until > Date.now() && state.phase !== 'playing' && state.phase !== 'loading' ? dmdMessage.text : undefined,
    // Juke-box : l'affiche du médaillon choisi, ou le lecteur (liste, clip, cartel).
    jukebox: jukeboxPlayer.view(role, (state.phase === 'menu' && !state.help && onJukebox()) || jukeboxManaging()),
    // Communauté : l'affiche du médaillon choisi (plateau, fronton), comme celle du Juke-box.
    community: state.phase === 'menu' && !state.help && onCommunity() ? { poster: communityMenu.poster() } : undefined,
    // Arène : son affiche (arena.js) : jauge du niveau, tableau des records à points, qui joue en ce moment.
    arena: state.phase === 'menu' && !state.help && onArena() ? { poster: arenaMenu.poster() } : undefined,
    // Collections : l'affiche du médaillon choisi, de même (même mise en page, community.js).
    collectionsMedallion: state.phase === 'menu' && !state.help && onCollections() ? { poster: collectionsPoster(collections) } : undefined,
    gameKeys: gameKeys(buttons, tilt),
    // Aide-mémoire du chargement : au bureau toujours ; en borne, celui du réglage de l'affichage seulement (display).
    loadingKeys: displayMode ? { title: t('Réglage de l’affichage'), rows: displayKeys(buttons), display: true } : { title: t('Commandes de la partie'), rows: gameKeys(buttons, tilt), display: false },
    menuKeys: menuKeys(),
    footer: menuFooter(),
    nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0], help: KEYS.help[0], next: KEYS.next[0] },
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
function menuCorner(): { zone?: 'corner' | 'head'; friendsOnline?: { count: number; title: string; searching?: boolean }; inbox?: { count: number; title: string }; notice?: NoticeView; player?: PlayerCardView; badges?: { count: number; total: number; title: string } } {
  const zone = currentZone();
  // La file avance à chaque rendu : une notification ouverte part quand l'écran ne s'y prête plus.
  const corner = menuNotices.view();
  const over = zone.place === 'over' && corner.notice ? corner.notice : undefined;
  // Le navigateur : en bas de sa page, jamais sur sa barre (adresse, téléchargements) ; VPX : le coin haut du joueur.
  const browser = zoneScreen() === 'browser' ? browserScreenRect()?.bounds : undefined;
  gameNotices.line(over, browser ? { zone: browser, rotation: 0, corner: 'bottom-left' } : undefined);
  if (zone.place !== 'corner' && zone.place !== 'head') return {};
  // La carte du joueur et ses badges : le même en-tête sur l'écran des tables et les écrans pleins (menu
  // système, Mes badges, aide…), 17/11/2026 ; ni en mode attente (vitrine pour qui passe) ni au Juke-box
  // (sa ligne porte son repère, jukebox.css).
  const screen = zoneScreen();
  // En jeu local, ni carte du joueur ni badges : le système de niveaux est retiré (localplay.ts).
  const player = screen !== 'attract' && screen !== 'jukebox' && !localPlay() ? playerCard() : undefined;
  // Les messages en attente : leur pastille, au coin comme sur la ligne de la roue dentée.
  const inbox = socialClosed() ? undefined : inboxMenu.pill();
  return { zone: zone.place, ...corner, ...(inbox ? { inbox } : {}), ...(player ? { player, badges: { count: socialNet.state().badges.length, total: BADGES.length, title: t('Mes badges') } } : {}) };
}

/** Part d'une fenêtre dans le lancement en cinéma : le logo part du plateau, se pose sur le fronton (sa fenêtre ou sa zone). */
function cinemaFor(role: RoleId): CinemaView | undefined {
  const roles = windowRoles.get(role) ?? [role];
  return cinema.view({ depart: role === 'playfield', arrivee: roles.includes('backglass') });
}

/** Depuis quand le moment d'un badge ou d'un niveau est à l'écran (handleKey) ; undefined : rien. */
let levelMomentAt: number | undefined;
let levelMomentKey: string | undefined;

/** Le moment d'un badge ou d'un niveau est à l'écran (levelMomentView), sans effet de bord : soundView le lit aussi. */
// Le retour de partie passe avant : le moment attend son bilan (game-return.ts), puis la roue.
function levelMomentShowing(): boolean {
  return !!levelTracker.pending() && !localPlay() && state.phase === 'menu' && !attract.active && !guest.active && !gameReturn.holding();
}

/**
 * Le moment à montrer (niveau.js) : au menu des tables seulement, jamais pendant une partie ni un
 * chargement ; chaque badge avec sa rareté, son fond (famille) et sa forme, le niveau avant et après,
 * et les sons au volume du réglage des sons de l'interface (uiSoundCue).
 */
function levelMomentView() {
  const pending = levelTracker.pending();
  // En jeu local, les XP se comptent en silence : le moment est tenu pour vu, il ne revient pas plus tard.
  // Hors du rendu en cours : seen() redessine.
  if (pending && localPlay()) setImmediate(() => localPlay() && levelTracker.seen());
  if (!pending || !levelMomentShowing()) {
    if (!pending) levelMomentAt = levelMomentKey = undefined;
    return undefined;
  }
  if (levelMomentKey !== pending.at) {
    levelMomentKey = pending.at;
    levelMomentAt = Date.now();
  }
  const lv = (xp: number) => {
    const v = levelOf(xp);
    return { level: v.level, progress: v.progress, into: v.into, need: v.need, tier: v.tier, tierLabel: tierLabel(v.tier) };
  };
  const s = socialNet.state();
  const cue = (id: UiSoundId) => uiSoundCue(id, mediaSettings, 'browse');
  return {
    key: pending.at,
    ...(pending.start ? { start: true } : {}),
    badges: pending.badges.map((id) => {
      const b = badgeDefinition(id)!;
      return { id, label: b.label, detail: b.detail, rarity: b.rarity, rarityLabel: rarityLabel(b.rarity), icon: b.icon, backdrop: FAMILY_BACKDROP[b.family], shape: badgeShape(b.rarity), xp: RARITY_XP[b.rarity], ...(b.secret ? { secret: true } : {}) };
    }).filter((b) => b.label),
    from: lv(pending.from),
    to: lv(pending.to),
    avatar: { ...avatarView(s.key.publicKey, s.name, socialNet.avatarFile(s.key.publicKey)), level: levelOf(pending.to).level },
    sounds: { badge: cue('badge'), rare: cue('badge-rare'), level: cue('level-up') },
    texts: {
      unlocked: t('Badge débloqué'),
      secret: t('Secret dévoilé'),
      level: t('Niveau'),
      start: t('Ton niveau de départ'),
      startDetail: t('Calculé sur tes parties d’avant les niveaux'),
      badgesSoFar: tn(pending.badges.length, '{n} badge déjà mérité', '{n} badges déjà mérités'),
      continue: t('Un bouton pour continuer'),
    },
  };
}

/** La carte du joueur du coin d'état : avatar à l'anneau de son palier, pseudo, niveau, barre ; « Invité » en mode invité. */
interface PlayerCardView {
  name: string;
  avatar: AvatarView;
  level?: number;
  label: string;
  progress?: number;
  /** XP de la dernière partie : la part gagnée de la barre brille, « +85 XP » apparaît puis s'efface. */
  gain?: { text: string; from: number };
  guest?: true;
  title: string;
}
function playerCard(): PlayerCardView {
  const s = socialNet.state();
  if (guest.active) return { name: t('Invité'), avatar: { initials: '?', hue: 170 }, label: t('Parties sans XP'), guest: true, title: t('Mode invité : les parties ne comptent pas pour le niveau') };
  const v = levelTracker.view();
  const from = v.gain ? levelOf(v.gain.from) : undefined;
  return {
    name: s.name,
    avatar: { ...avatarView(s.key.publicKey, s.name, socialNet.avatarFile(s.key.publicKey)), level: v.level },
    level: v.level,
    label: t('NIV. {n}', { n: v.level }),
    progress: v.progress,
    // Le niveau a changé pendant la partie : la part gagnée part du début de la barre.
    ...(v.gain ? { gain: { text: t('+{n} XP', { n: v.gain.xp }), from: from && from.level === v.level ? from.progress : 0 } } : {}),
    title: t('{tier} · niveau {level} · {into} / {need} XP', { tier: tierLabel(v.tier), level: v.level, into: v.into, need: v.need }),
  };
}

/** Table voisine dans le menu des tables (boutons, roue cliquée) : le solénoïde claque à chaque table. */
function moveSelection(offset: number): void {
  const leads = wheelLeads();
  if (leads.length) {
    // Les médaillons (Juke-box, Communauté, Arène, Collections) en tête de la collection : ils se choisissent comme une table.
    const shelf = collections.shelf();
    const chosen = selectedMedallion();
    const target = medallionWheelMove({ tables: shelf.tables.length, at: shelf.index, leads, selected: chosen }, offset);
    if (!target) return;
    if ('medallion' in target) {
      if (chosen === target.medallion) return;
      state = { ...state, medallion: target.medallion };
      return playUiSound('solenoid');
    }
    const picked = collections.move(target.table - shelf.index);
    const index = picked ? tables.indexOf(picked) : -1;
    if (index < 0 || (index === state.index && !chosen)) return;
    pointAtTable(index);
    return playUiSound('solenoid');
  }
  const next = collections.move(offset);
  const index = next ? tables.indexOf(next) : -1;
  if (index < 0 || index === state.index) return;
  pointAtTable(index);
  playUiSound('solenoid');
}

/**
 * Son de l'interface (uisounds.ts), joué par la fenêtre du playfield (renderer/ui-sounds.js)
 * sur la sortie du son du menu : seulement s'il est activé, et jamais pendant une partie.
 * `hitAt` : son calé sur une animation, l'instant (Date.now()) où son accent doit s'entendre.
 */
function playUiSound(id: UiSoundId, hitAt?: number): void {
  const cue = uiSoundCue(id, mediaSettings, moment(), hitAt);
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
    return { ...introSound(mediaSettings, music.source === 'file' ? mediaUrl(music.file) : undefined), launchId: undefined, output: menuOutput() };
  }
  const now = moment();
  const plan =
    table && medias
      ? menuSound(now, now === 'attract' && hours.night() ? { ...mediaSettings, attractSound: 'muted' } : mediaSettings, { music: medias.sound(table, 'Audio'), launch: now === 'loading' ? medias.sound(table, 'AudioLaunch') : undefined }, tableMediaVolume(table))
      : { video: 0 };
  // Le moment d'un badge ou d'un niveau : la musique de la table se tait le temps de la fête (niveau.js).
  const heard = levelMomentShowing() ? hushForMoment(plan) : plan;
  return { ...heard, launchId: heard.launch ? launchCount : undefined, output: menuOutput() };
}

// ---------------------------------------------------------------------------
// DMD du menu vivant (live-dmd.ts, packages/core/src/livedmd.ts, dmdscenes.ts) : pendant la
// navigation, l'écran du DMD montre l'afficheur à points dessiné par Cyber Pinball (le détail de
// la wheel à l'arrivée, titre, PRESS START, records, un intermède de jeu un cycle sur deux,
// horloge, crédits) ; « classique » dans Médias, son et attente revient au média seul. Rien
// pendant la partie : VPX a l'afficheur.

// Image du menu sur le DMD réel (bêta, dmd-server.ts) : dmdserver reçoit les mêmes points, même en
// DMD « classique » (une LED ne joue pas de vidéo) ; la fenêtre de l'écran du DMD, seulement en vivant.
const liveDmd = new LiveDmd({
  send: (shot) => {
    if (menuDmdServer().showsMenu()) menuDmdServer().send(shot.dots, menuDmdColor(), shot.rgb);
    if (!liveDmdOn()) return;
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
  return state.phase === 'jukebox' || (state.phase === 'menu' && !state.help && onJukebox()) || jukeboxManaging();
}

/** Le DMD montre le tableau des records de l'Arène : son médaillon choisi dans la roue. */
function arenaDmd(): boolean {
  return state.phase === 'menu' && !state.help && onArena();
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
  // Juke-box : la bande 4:1 à sa place automatique, sur du noir (le spectre, JUKE-BOX) ; l'Arène de même (son tableau des records).
  if (jukeboxDmd() || arenaDmd()) {
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
  // Le DMD réel montre le menu hors partie, même sans fenêtre de DMD vivant (DMD classique, pas d'écran de DMD).
  const hardware = menuDmdServer().showsMenu() && state.phase !== 'playing' && !desktop.active;
  if (!liveDmdOn() && !hardware) {
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
  // Médaillon Arène choisi : son tableau des records sur le DMD (21/11/2026), à la place de la marque seule.
  const board = arenaDmd() ? arenaMenu.boardPages() : [];
  if (!table && board.length) {
    dmdShown = undefined;
    liveDmd.show(`arene:${JSON.stringify(board)}`, { arena: board });
  } else if (!table) {
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
 * (l'image allumée du .directb2s comprise), plateau, logo : la table d'abord, la roue en dernier
 * (retour d'essai du 25/11/2026 : fronton refusé, la roue donnait seule la couleur). Les couleurs des
 * LED mêlent les dominantes du fronton et du plateau. Les points du DMD la prennent d'abord du média
 * de l'écran du DMD (FullDMD ou capture du DMD). Mesurée seulement si l'ambiance ou le DMD s'en
 * servent ; la clé change avec la table et avec ses médias (adresse datée, mediaUrl).
 */
function followTint(): void {
  if (!tints) return;
  const used = mediaSettings.tableColor || mediaSettings.dmdColor === DMD_TABLE_COLOR;
  const table = used && medias ? screensSubject() : undefined;
  if (!table || !medias) return tints.follow(undefined);
  const backglass = medias.roleMedia(table, 'backglass').url;
  const playfield = medias.roleMedia(table, 'playfield').url;
  const urls = [backglass, playfield, medias.wheel(table)];
  const dmdUrl = mediaSettings.dmdColor === DMD_TABLE_COLOR ? medias.roleMedia(table, 'dmd').url : undefined;
  const paths = (list: readonly (string | undefined)[]) => list.map((u) => (u ? mediaPathFromUrl(u) : undefined)).filter((f): f is string => Boolean(f));
  tints.follow({ key: JSON.stringify([table.file, ...urls, dmdUrl]), files: paths(urls), dmdFiles: paths([dmdUrl]), ledFiles: paths([backglass, playfield]) });
}

/** Ce que les animations des LED ont besoin de savoir de l'écran : la table choisie, la fiche ouverte, sa teinte. */
function ledContext() {
  const shown = attractTable() ?? (onMedallion() ? undefined : tables[state.index]);
  return {
    phase: state.phase,
    ...(shown ? { tableKey: shown.file, index: state.index } : {}),
    ...(state.phase === 'library' && library.table() ? { ficheKey: library.table()! } : {}),
    ...(tints?.current()?.color ? { tint: tints.current()!.color! } : {}),
    // Couleurs dominantes du visuel de la table (measureLedPalette) : les LED prennent celles du jeu.
    ...(tints?.current()?.leds?.length ? { palette: tints.current()!.leds! } : {}),
    // Ouverture : les LED jouent la leur, à l'horloge des animations des écrans (IntroRun, Date.now()).
    ...(state.phase === 'intro' && introRun.current?.startedAt !== undefined ? { introStartedAt: introRun.current.startedAt } : {}),
  };
}

function broadcast(): void {
  // Retour d'une partie, de quelque jeu que ce soit : une recherche de mise à jour, pour que la
  // pastille soit là quand on revient à la roue (updates-menu.ts, au plus une toutes les 5 min).
  if (broadcastPhase === 'playing' && state.phase !== 'playing') updates.checkSoon();
  broadcastPhase = state.phase;
  // Partie en préparation ou en cours, de quelque jeu que ce soit : les LED sont à DOF, le port est rendu.
  // Sauf une table sans ROM aux effets LED voulus (dof-evenements-jeu.ts) : le port reste à Cyber Pinball.
  const gameOn = state.phase === 'loading' || state.phase === 'playing';
  nightMode?.game(gameOn); // variante DOF du mode nuit posée avant le lancement de VPX, remise à la fin
  const tapTable = gameOn ? (playing ?? tables[state.index]) : undefined;
  if (gameOn && !(tapTable && tapPlanned(dofTapDeps, hasRomOf(tapTable), b2sNameOf(tapTable)))) void ledService.gameStarted();
  else if (!gameOn) ledService.gameEnded();
  ledAnimations.update(ledContext());
  // Le Juke-box se ferme, musique arrêtée, dès qu'on quitte son écran, par quelque chemin que ce soit
  // (Exit, partie lancée du téléphone, extinction…) ; sauf vers sa gestion : au bureau la musique y
  // continue, en fond ; en borne elle s'y met en pause et reprend au retour au lecteur.
  if (state.phase !== 'jukebox' && jukeboxPlayer.active() && !reopeningJukebox) {
    if (state.phase === 'library' && (playfieldLandscape() || jukeboxManaging())) jukeboxPlayer.toBackground(!playfieldLandscape());
    else jukeboxPlayer.close();
  }
  // Menu dans le casque (porté au moins une fois, ses écrans y arrivent) : ceux du PC n'affichent plus que
  // « Dans le casque », même casque retiré ; casque éteint ou Link coupé, le compagnon s'arrête et ils reprennent.
  const inHeadset = Boolean(vrFront.headset?.inUse);
  followTint();
  // Écran des tables : les logos de toute la collection sont réduits en tâche de fond, une fois par collection.
  if (wheelThumbs && medias && state.phase === 'menu' && thumbsWarmed !== tables) {
    thumbsWarmed = tables;
    wheelThumbs.warm(tables, (t) => medias?.wheel(t));
  }
  syncLiveDmd();
  jukeboxPlayer.syncDmd((state.phase === 'menu' && !state.help && onJukebox()) || jukeboxManaging());
  // Le mode attente n'est permis que sur le menu des tables (ni aide, ni fiche, ni message, ni partie).
  attract.allow(state.phase === 'menu' && !state.help && tables.length > 0 && !desktop.active);
  if (!attract.active) attractIndex = undefined;
  for (const [role, win] of windows) {
    if (!win.isDestroyed()) win.webContents.send('state', inHeadset ? { ...viewFor(role), inHeadset: true } : viewFor(role));
  }
  sendToHeadsetViews((role) => {
    const view = vrFront.headsetExitHint ? { ...viewFor(role, headsetMedias ?? medias), headsetHint: vrFront.headsetExitHint, ...(vrFront.headsetExitNote ? { headsetNote: vrFront.headsetExitNote } : {}) } : viewFor(role, headsetMedias ?? medias);
    return { ...view, ...(vrFront.headsetHoldView && { headsetHold: vrFront.headsetHoldView }), ...(vrFront.headsetCardView && { headsetCard: vrFront.headsetCardView }) };
  });
  // Télécommande du téléphone : le QR vit tant que l'écran qui le montre est affiché ; le téléphone suit l'écran.
  const surfaces = state.phase === 'library' && !desktop.active ? library.remoteSurfaces() : { menu: false, keyboard: false };
  // Pré-écoute (import du Juke-box) : jamais hors du menu.
  if (state.phase !== 'library' && jukeboxPlayer.previewState()) jukeboxPlayer.preview(undefined);
  phoneRemote.show('menu', surfaces.menu);
  phoneRemote.show('keyboard', surfaces.keyboard);
  phoneRemote.menuChanged();
}
