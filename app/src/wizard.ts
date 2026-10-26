// Assistant d'écrans : une fenêtre plein écran sur chaque écran, pilotée avec les
// boutons de la borne. On relève d'abord la touche de chaque bouton (étape
// « Boutons », puisque tout le reste se pilote avec eux), puis on affecte chaque
// rôle à un écran, chaque sortie audio au fronton ou au plateau (étape « Son »),
// et on enregistre le modèle de borne et VPinballX.ini. Lancé au premier
// démarrage, ou avec --assistant ; --assistant --boutons, --ecrans, --playfield,
// --disposition ou --son ne refait que cette étape (WIZARD_STEPS, core).
// À toute étape, « Quitter sans enregistrer » (souris, Ctrl+Q, Échap ou Exit
// maintenu 2 s, n'importe quelle touche maintenue 3 s pendant le relevé des
// boutons) rend la main au menu sans rien écrire.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, ipcMain, screen, session, type Input } from 'electron';
import {
  AUDIO_ROLES,
  BUTTONS,
  PREVIOUS_KEY,
  buttonKeys,
  defaultNavigation,
  GAME_KEYS,
  INTERFACE_KEYS,
  keyProblems,
  keysToTry,
  MAIN_GAME_BUTTONS,
  navigationButtons,
  recordKey,
  withoutButtonKeys,
  IniDocument,
  keyLabel,
  loadOwnedMemory,
  navigationKeys,
  type ButtonsSource,
  type KeySet,
  type NavigationButtons,
  type NavigationId,
  type SetKeys,
  vpxInputSettings,
  readJsonFile,
  zoneFindings,
  CAPTURE_PHASES,
  QUIT_DIALOG_TIMEOUT_MS,
  WIZARD_FLAGS,
  cabinetChanges,
  isQuitShortcut,
  quitDestination,
  quitHoldMs,
  stepCabinet,
  wizardStepOf,
  type CabinetField,
  type WizardPhase,
  type WizardStep,
  type WizardStepId,
  ANCILLARY_ROLES,
  centeredDmdBand,
  DMD_RATIO_THRESHOLD,
  dmdKindAfterArrange,
  dmdKindLabel,
  dmdKindOf,
  type DmdKind,
  embeddedDmdZone,
  sameZone,
  splitBackglassDmd,
  zoneRect,
  FULL_ZONE,
  type AncillaryRoleId,
  type ScreenZone,
  type CabinetButtons,
  type CabinetAnalog,
  analogLines,
  audioScreen,
  channelsLabel,
  describeAudioOutput,
  describeDisplay,
  isCabinetCandidate,
  matchAudioOutputs,
  needsChannelTest,
  PLAYFIELD_MODE_LABELS,
  playfieldModeFromTest,
  SPEAKER_PLACE_LABELS,
  speakerPairsOf,
  toAudioOutput,
  vpxSound3D,
  diagonalInches,
  currentFlipperEdge,
  EDGE_LABELS,
  edgeAfterRotation,
  frontendNames,
  type OtherFrontend,
  edgeRotation,
  edidSize,
  FLIPPER_EDGES,
  fingerprintOf,
  isCabinetView,
  formatChanges,
  addConfiguration,
  configIniPath,
  createConfiguration,
  loadCabinet,
  loadCabinetSet,
  type CabinetConfiguration,
  planVpxSync,
  readTextIfExists,
  ROLES,
  rotatedDisplay,
  rotationDelta,
  saveCabinet,
  toPhysicalScreen,
  vpxDisplayId,
  writeWithBackup,
  sizeFromDiagonal,
  vpxFlipperEdge,
  vpxOrientationFix,
  formatList,
  t,
  tn,
  type AudioRole,
  type Cabinet,
  type CabinetAudio,
  type ChannelTestResult,
  type FlipperEdge,
  type ObservedAudioOutput,
  type ObservedDisplay,
  type OrientationFix,
  type RoleId,
  type Rotation,
  type SpeakerPair,
  type SpeakerPlace,
  type SyncFinding,
  type VpxChange,
} from '@cyberpinball/core';
import { setDisplayOrientation } from '@cyberpinball/win-displays';
import { observedDisplays, simulatedDisplays } from './displays';
import { createWindow, isShown, OFFSCREEN, windowRect } from './offscreen';
import { keyboardFollows, keyboardIncident } from './foreground';
import { joystickAxes, joystickStatus, moveVirtualAxis, onJoystickInput, pressVirtualButton } from './joystick-input';
import { plungerClick, plungerKey, plungerTick, plungerView, startPlungerStep, type PlungerAction, type PlungerOutcome, type PlungerStep } from './plunger-step';
import { locations, vpxProfile } from './paths';
import { activeVpxIni, audioOutputs, syncVpxIni } from './vpx-ini';
import { coverDisplay } from './cover-display';
import { LayoutReport } from './layout-check';
import { arrangeAction, arrangeKey, arrangePanel, arrangeZones, startArrange, type ArrangeAction, type ArrangeHost, type ArrangeOutcome, type ArrangeState } from './arrange';
import { relaunchCovered } from './screen-guard';
import { otherFrontendsOnThisPc } from './frontend-gate';

const COLORS = ['#ff3d7f', '#22d3ee', '#facc15', '#a3e635', '#c084fc', '#fb923c'];

/**
 * Touches de l'assistant : celles des boutons de l'interface (par défaut flippers, Start,
 * Exit du jeu, ceux des encodeurs tant qu'ils n'ont pas été relevés), plus les flèches,
 * Entrée, Échap et Retour arrière d'un clavier.
 */
function wizardKeys(source: ButtonsSource) {
  return { ...navigationKeys(source, false), back: withoutButtonKeys(['Backspace'], source) };
}
let KEYS = wizardKeys(undefined);

// « buttons » : un bouton de la borne après l'autre ; « buttonsSummary » : leurs touches.
// Après le choix du playfield : où se tient le joueur, puis la diagonale de l'écran.
// « flip » : l'écran vient d'être tourné dans Windows pour VPX, on attend la confirmation.
// Après les écrans : « sound », un son sur chaque sortie audio, puis « channels », un
// bip par haut-parleur quand la sortie du plateau annonce 6 ou 8 canaux.
// La liste des étapes est dans le cœur (WIZARD_PHASES) : la sortie sans enregistrer y est vérifiée pour chacune.
type Phase = WizardPhase;

const DIAGONAL = { min: 10, max: 110, fallback: 42 };

/** Sans aucun bouton pressé pendant ce délai, l'étape « Boutons » garde les touches actuelles. */
const BUTTONS_TIMEOUT_MS = 20_000;

/**
 * --assistant --boutons, --ecrans, --playfield, --disposition, --son : seulement
 * cette étape, sur une borne déjà configurée, depuis le menu système.
 */
const STEP_ARGUMENT = wizardStepOf(process.argv);
/**
 * --assistant --nouvelle-configuration : l'assistant crée une configuration de borne
 * (avec son VPinballX.ini) au lieu de refaire celle qui sert.
 */
const NEW_CONFIGURATION = process.argv.includes('--nouvelle-configuration');
/** Configuration créée par cet assistant : les enregistrements suivants la refont. */
let created: string | undefined;

/** Délai pour garder la nouvelle orientation, comme dans Windows ; sans réponse, retour à l'ancienne. */
const FLIP_TIMEOUT_MS = 15_000;

// Sans opérateur, hors écran ou sur des écrans simulés, l'orientation est simulée : on ne
// tourne jamais un vrai écran.
const SIMULATED_ORIENTATION = Boolean(process.env.CYBERPINBALL_AUTOPILOT) || OFFSCREEN || simulatedDisplays();

interface Wizard {
  phase: Phase;
  /** Touches des boutons du jeu en vigueur : celles du modèle, puis celles relevées. Absentes : touches par défaut. */
  buttons?: CabinetButtons;
  /** Boutons de l'interface en vigueur : ceux du modèle, puis relevés. Absents : flippers, Start et Exit du jeu. */
  navigation?: NavigationButtons;
  /** Étape « Boutons » en cours. */
  capture?: ButtonCapture;
  /** Lanceur et accéléromètre en vigueur : ceux du modèle, puis ceux de l'étape « Lanceur ». Absents : rien d'écrit. */
  analog?: CabinetAnalog;
  /** Étape « Lanceur » en cours. */
  plunger?: PlungerStep;
  roleIndex: number;
  /** Réponse proposée au rôle en cours : indice dans roleOptions(). */
  option: number;
  assignments: Partial<Record<RoleId, number>>;
  /** Part d'écran de chaque rôle annexe qui partage le sien ; absente : l'écran entier. */
  zones: Partial<Record<RoleId, ScreenZone>>;
  /** Étape « Disposition » en cours. */
  arrange?: ArrangeState;
  flipperEdge: FlipperEdge;
  /** Diagonale du playfield en pouces, proposée depuis l'EDID ou la saisie précédente. */
  diagonal: number;
  /** Écran tourné pour VPX, en attente de confirmation : de quoi revenir en arrière. */
  flip?: { from: Rotation; edge: FlipperEdge; turn: Rotation; deadline: number };
  /** Bord gardé malgré VPX (rotation annulée ou refusée par Windows) : Start passe à la suite. */
  keepEdge?: FlipperEdge;
  /** Retournement demandé alors qu'un autre menu de borne est installé : avertissement affiché pour ce bord. */
  flipWarning?: FlipperEdge;
  notice?: string;
  /** Étape « Son » ; absente tant qu'elle n'a pas commencé ou s'il n'y a aucune sortie à proposer. */
  sound?: SoundStep;
  /** Le bord des flippers et la diagonale ont été demandés dans cette session. */
  layoutAsked?: boolean;
  /** Rôles auxquels on a répondu « aucun écran » dans cette session. */
  unassigned: Set<RoleId>;
  /**
   * FullDMD ou DMD seul, répondu à l'étape des rôles, avec la zone du DMD à ce moment : une
   * zone changée ensuite dans l'éditeur décide à sa place, par sa forme (dmdKindAfterArrange).
   */
  dmdKind?: { kind: DmdKind; zone?: ScreenZone };
  /** « Placer librement… » : l'éditeur de disposition ouvert sur ce rôle, et l'état d'avant pour revenir. */
  free?: { role: AncillaryRoleId; option: number; assignments: Partial<Record<RoleId, number>>; zones: Partial<Record<RoleId, ScreenZone>>; dmdKind?: Wizard['dmdKind'] };
  /** « Quitter sans enregistrer ? » ouvert : ce qui serait perdu, et la fin du délai de réponse. */
  quit?: { lines: string[]; deadline: number };
  /** Sortie sans enregistrer en cours : où l'on va. */
  leaving?: string;
  result?: { lines: string[]; findings: SyncFinding[]; iniPath: string; backup?: string };
}

interface ButtonCapture {
  /** Jeu de boutons relevé : ceux du jeu (GAME_KEYS) ou de l'interface (INTERFACE_KEYS). */
  set: KeySet;
  /** Bouton demandé, indice dans set.items. */
  index: number;
  keys: SetKeys;
  /** Boutons répondus : relevés, ou passés (pas de bouton sur la borne). */
  answered: Set<string>;
  /** Fin du délai de 20 s ; plus de délai dès qu'un bouton a été pressé ou qu'on a cliqué. */
  deadline?: number;
  /** Dernier bouton relevé ou passé, rappelé sous la question suivante. */
  last?: string;
  /** Touche refusée et pourquoi. */
  refused?: string;
  /** Touches qui n'ont pas à être essayées (keysToTry) : celles en vigueur à l'arrivée, ou celles par défaut choisies. */
  reference: SetKeys;
  /**
   * Récapitulatif : choix aux flippers (une action de SUMMARY_ACTIONS, puis un bouton
   * du jeu relevé à refaire), boutons essayés, message.
   */
  action: number;
  tried: Set<string>;
  notice?: string;
}

interface SoundStep {
  /** Sorties proposées, dans l'ordre où on les joue. */
  outputs: ObservedAudioOutput[];
  index: number;
  /** Rôle -> endpointId ; une même sortie peut tenir les deux rôles. */
  roles: Partial<Record<AudioRole, string>>;
  /** Pourquoi une sortie est proposée d'office (endpointId -> raison). */
  reasons: Map<string, string>;
  /** Test des canaux de la sortie du plateau : paire en cours et réponses. */
  pairIndex: number;
  places: Partial<Record<SpeakerPair, SpeakerPlace>>;
  /** Résultat du test, pour la sortie testée. */
  test?: { endpointId: string; result: ChannelTestResult };
}

/** Compte rendu de la fenêtre qui joue les sons (renderer/sound.js). */
interface SoundStatus {
  key: string;
  ok: boolean;
  reason?: 'enumerate' | 'not-found' | 'no-labels' | 'sink' | 'channels' | 'error';
  maxChannels?: number;
  homonyms?: number;
  detail?: string;
}

const loc = locations();
const profile = vpxProfile(loc).profile;
let displays: ObservedDisplay[] = [];
let windows: BrowserWindow[] = [];
/** Sorties audio actives au lancement de l'assistant. */
let audio: ObservedAudioOutput[] = [];
/** Dernière commande envoyée à la fenêtre qui joue les sons, et son compte rendu. */
let soundSent = { json: '', key: '' };
let soundStatus: SoundStatus | undefined;
let previous: Cabinet | undefined;
let wizard: Wizard;
/** Vrai pendant un changement d'orientation : les touches sont ignorées. */
let busy = false;
let countdown: NodeJS.Timeout | undefined;
let buttonsCountdown: NodeJS.Timeout | undefined;
/** Lecture des axes pendant l'étape « Lanceur ». */
let plungerTimer: NodeJS.Timeout | undefined;
let quitCountdown: NodeJS.Timeout | undefined;
/** Étape refaite seule (--boutons, --son…) : le modèle existe, le reste est gardé. */
let only: WizardStep | undefined;
const isOnly = (id: WizardStepId) => only?.id === id;
/** Mode --boutons : le modèle existe, seule l'étape « Boutons du jeu » est refaite. */
let buttonsOnly = false;
/** Mode --interface : le modèle existe, seule l'étape « Boutons de l'interface » est refaite. */
let interfaceOnly = false;
/** Mode --disposition : le modèle existe, seules les zones sont refaites. */
let arrangeOnly = false;

/**
 * Touches enfoncées pendant le relevé des boutons : un bouton est relevé quand on le
 * relâche, pour qu'une touche maintenue 3 s ouvre « Quitter sans enregistrer ? » sans
 * avoir été relevée.
 */
const pressed = new Set<string>();
/** Touche maintenue qui ouvrira la question (ou y répondra oui) au bout de `ms`. */
let held: { code: string; at: number; ms: number; timer: NodeJS.Timeout; answering: boolean } | undefined;
/** Maintien affiché à partir de ce délai : en dessous, c'est un appui ordinaire. */
const HOLD_SHOWN_MS = 700;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Assistant d'écrans : affecte chaque rôle à un écran, puis enregistre le modèle de borne. */
/** Autres menus de borne de ce PC (PinUP Popper…), relevés au démarrage de l'assistant. */
let otherFrontends: OtherFrontend[] = [];

export function startWizard(): void {
  otherFrontends = otherFrontendsOnThisPc();
  ipcMain.on('ready', () => broadcast());
  // Souris : étape « Boutons » (refaire un bouton, précédent, touches par défaut…).
  ipcMain.on('action', (_event, action: WizardAction) => handleWizardAction(action));
  ipcMain.on('sound-status', (_event, status: SoundStatus) => {
    if (status.key !== soundSent.key) return; // compte rendu d'un son déjà remplacé
    // Sans opérateur, le compte rendu est la seule trace que le son a bien été joué.
    if (process.env.CYBERPINBALL_AUTOPILOT) console.log(`Son ${status.key} : ${JSON.stringify(status)}`);
    soundStatus = status;
    broadcast();
  });
  // Chromium ne donne le nom des sorties audio, et n'autorise setSinkId, qu'avec la
  // permission « media » ou « speaker-selection » : ce sont les seules dont les
  // pages locales de l'assistant ont besoin.
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'speaker-selection');
  displays = observedDisplays();
  audio = loadAudioOutputs();
  previous = loadCabinet(loc.dataDir);
  // Sans modèle enregistré, il n'y a rien à garder : l'assistant complet.
  only = previous ? STEP_ARGUMENT : undefined;
  buttonsOnly = isOnly('boutons');
  interfaceOnly = isOnly('interface');
  arrangeOnly = isOnly('disposition');
  startMode();

  windows = displays.map((d) => {
    const win = createWindow({
      frame: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: '#030807',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        // Les boutons passent par le processus principal : la page ne voit jamais de geste du joueur.
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    // Positions en pixels physiques -> coordonnées Electron (DIP), écran par écran.
    coverDisplay(win, windowRect(d.bounds));
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' && input.type !== 'keyUp') return;
      // Sans opérateur, seules les touches rejouées comptent : une touche tapée sur le PC
      // pendant les captures serait relevée comme un bouton. Ctrl+Q reste permis.
      if (process.env.CYBERPINBALL_AUTOPILOT && !isQuitShortcut(input)) event.preventDefault();
      else if (handleKey(input)) event.preventDefault();
    });
    // Boutons d'un joystick (Pinscape…) : relevés et suivis comme des touches. Sans opérateur,
    // un joystick virtuel de SDL appuie (autopilote « Joy<n> »).
    onJoystickInput(win, (input) => void handleKey(input));
    // Une touche relâchée hors de l'assistant n'arrive jamais : elle n'est plus tenue pour
    // maintenue. Le focus qui passe d'un de ses écrans à l'autre garde les touches enfoncées,
    // dont le relâchement arrive à l'autre fenêtre : sinon, la touche n'est jamais relevée.
    win.on('blur', () => setImmediate(() => windows.some((w) => !w.isDestroyed() && w.isFocused()) || releaseKeys()));
    win.loadFile(path.join(__dirname, '..', 'renderer', 'screen.html'));
    win.once('ready-to-show', () => {
      win.show();
      if (windows.every((w) => w.isDestroyed() || isShown(w))) takeKeyboard();
    });
    return win;
  });
  // Une rotation change la géométrie des écrans : chaque fenêtre reprend le sien.
  screen.on('display-metrics-changed', () => placeWindows());

  const autopilot = process.env.CYBERPINBALL_AUTOPILOT;
  if (autopilot) void runAutopilot(autopilot.split(','), process.env.CYBERPINBALL_CAPTURE);
}

/**
 * Toutes les fenêtres affichées : l'écran principal prend le clavier. Relancé par le menu, le
 * processus de l'assistant peut se voir refuser le premier plan par Windows, ses fenêtres
 * restant actives pour Electron : les boutons du joystick y arriveraient, pas les touches du
 * clavier (foreground.ts).
 */
function takeKeyboard(): void {
  const main = windows[displays.findIndex((d) => d.primary)] ?? windows[0];
  if (!main || main.isDestroyed()) return;
  main.focus();
  keyboardFollows(main, 'l’assistant s’ouvrait'); // i18n-ignore : console
}

/**
 * Test de bout en bout sans opérateur : rejoue une suite de touches (codes
 * KeyboardEvent.code séparés par des virgules) et capture chaque écran après
 * chaque touche dans CYBERPINBALL_CAPTURE, puis quitte.
 */
async function runAutopilot(codes: string[], captureDir: string | undefined): Promise<void> {
  await Promise.all(windows.map((w) => new Promise<void>((resolve) => w.once('ready-to-show', () => resolve()))));
  await delay(800);
  if (captureDir) fs.mkdirSync(captureDir, { recursive: true });
  const layout = new LayoutReport(captureDir);

  for (const [step, code] of ['start', ...codes].entries()) {
    // « Attendre16 » : laisser passer 16 s sans toucher à rien (fin du compte à rebours).
    // « SansBoutons » : comme si personne n'avait touché à rien pendant l'étape « Boutons ».
    const wait = /^Attendre(\d+)$/.exec(code);
    if (wait) await delay(Number(wait[1]) * 1000);
    else if (code === 'SansBoutons') buttonsTimeout();
    // « click:<sélecteur> » : clic de souris dans la fenêtre du premier écran.
    else if (code.startsWith('click:')) await windows[0]!.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(code.slice(6))})?.click()`);
    // « drag:<écran>:<rôle>:<poignée>:<dx>:<dy> » : la zone (poignée « move ») ou l'un de ses
    // coins tiré à la souris sur cet écran (numéro à partir de 1), par de vrais événements de pointeur.
    else if (code.startsWith('drag:')) {
      const [, screenNo, role, handle, dx, dy] = code.split(':');
      const selector = handle === 'move' ? `.zone[data-role="${role}"]` : `.zone[data-role="${role}"] .handle.${handle}`;
      await windows[Number(screenNo) - 1]?.webContents.executeJavaScript(/* i18n-ignore : script de page de l’autopilote */ `(async () => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        // Le rendu remplace la zone dès qu'elle est choisie : la suite du geste va au document.
        const at = (target, type, px, py) => target.dispatchEvent(new PointerEvent(type, { clientX: px, clientY: py, bubbles: true }));
        at(el, 'pointerdown', x, y);
        for (let i = 1; i <= 5; i++) {
          at(document, 'pointermove', x + (${Number(dx)} * i) / 5, y + (${Number(dy)} * i) / 5);
          await new Promise((done) => requestAnimationFrame(() => setTimeout(done, 30)));
        }
        at(document, 'pointerup', x + ${Number(dx)}, y + ${Number(dy)});
      })()`);
    }
    // « Maintenir3:KeyA » : la touche enfoncée 3 s, puis relâchée ; « CtrlQ » : Ctrl+Q.
    else if (code.startsWith('Maintenir')) {
      const [, seconds, key] = /^Maintenir(\d+(?:\.\d+)?):(\w+)$/.exec(code) ?? [];
      if (key) {
        handleKey({ type: 'keyDown', code: key, control: false } as Input);
        await delay(Number(seconds) * 1000);
        handleKey({ type: 'keyUp', code: key, control: false } as Input);
      }
    } else if (code === 'CtrlQ') handleKey({ type: 'keyDown', code: 'KeyQ', control: true } as Input);
    // « Axe2:0.9 » : l'axe 2 (Z) d'un Pinscape virtuel à 0,9, par le chemin d'un vrai lanceur.
    else if (/^Axe\d+:-?[\d.]+$/.test(code)) {
      const [axis, value] = code.slice(3).split(':').map(Number) as [number, number];
      if (!moveVirtualAxis(axis, value)) console.error(`Autopilote : ${code} sans joystick lisible (${JSON.stringify(joystickStatus())})`); // i18n-ignore : console de l'autopilote
    }
    // « Joy3 » : bouton 3 (numéro SDL) d'un joystick virtuel, par le chemin d'un vrai Pinscape.
    else if (/^Joy\d+$/.test(code)) {
      if (!(await pressVirtualButton(Number(code.slice(3))))) console.error(`Autopilote : ${code} sans joystick lisible (${JSON.stringify(joystickStatus())})`); // i18n-ignore : console de l'autopilote
    }
    else if (step > 0) {
      // Un appui : enfoncée puis relâchée (le relevé des boutons se fait au relâchement).
      handleKey({ type: 'keyDown', code, control: false } as Input);
      handleKey({ type: 'keyUp', code, control: false } as Input);
    }
    await delay(400);
    for (const [i, win] of windows.entries()) {
      const name = `${String(step).padStart(2, '0')}-${code.replace(/[^\w-]+/g, '_').slice(0, 40)}-ecran${i + 1}`;
      await layout.check(win.webContents, name);
      if (captureDir) fs.writeFileSync(path.join(captureDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    }
  }
  layout.save();
  quit();
}

function handleKey(input: Input): boolean {
  if (input.type === 'keyUp') return handleKeyUp(input);
  const is = (group: string[]) => group.includes(input.code);
  // Quitter sans enregistrer : avant toute étape, pour qu'aucune ne puisse retenir le joueur.
  if (isQuitShortcut(input)) {
    if (!input.isAutoRepeat && !wizard.leaving) {
      if (wizard.quit) leaveWithoutSaving();
      else askQuit();
      broadcast();
    }
    return true;
  }
  if (busy || wizard.leaving) return true;
  if (!input.isAutoRepeat) watchHold(input.code);
  if (wizard.quit) {
    handleQuitKey(input);
    broadcast();
    return true;
  }

  if (wizard.phase === 'done') return continueToTables();

  // Relevé des boutons : la touche compte au relâchement (handleKeyUp).
  if (CAPTURE_PHASES.includes(wizard.phase)) {
    if (!input.isAutoRepeat) {
      touched(wizard.capture!);
      pressed.add(input.code);
    }
    broadcast();
    return true;
  }

  if (wizard.phase === 'plunger') {
    if (input.isAutoRepeat && !wizard.plunger!.editing) return true;
    const outcome = plungerKey(wizard.plunger!, { previous: is(KEYS.previous), next: is(KEYS.next), confirm: is(KEYS.confirm) });
    if (outcome === 'unhandled') {
      if (is(KEYS.exit)) askQuit();
      else if (is(KEYS.back) && !only) startCapture(INTERFACE_KEYS, true);
      else return false;
    } else afterPlunger(outcome);
    broadcast();
    return true;
  }

  if (wizard.phase === 'flip') {
    if (is(KEYS.confirm)) keepFlip();
    else if (is(KEYS.exit) || is(KEYS.back)) void revertFlip(false);
    broadcast();
    return true;
  }

  if (wizard.phase === 'orient' || wizard.phase === 'size') {
    if (!handleLayoutKey(is)) return false;
    broadcast();
    return true;
  }

  if (wizard.phase === 'sound' || wizard.phase === 'channels') {
    if (!(wizard.phase === 'sound' ? handleSoundKey(is) : handleChannelKey(is))) return false;
    broadcast();
    return true;
  }

  if (wizard.phase === 'arrange') {
    const outcome = arrangeKey(arrangeHost(), wizard.arrange!, input);
    if (outcome === 'unhandled') return false;
    afterArrange(outcome);
    broadcast();
    return true;
  }

  if (wizard.phase === 'summary') {
    if (is(KEYS.confirm)) {
      if (only) saveStep();
      else save();
    } else if (is(KEYS.exit)) {
      // Recommencer : l'étape seule depuis le début ; l'assistant complet depuis les écrans (boutons gardés).
      if (only) startMode();
      else restart();
    } else if (is(KEYS.back)) backFromSummary();
    else return false;
    broadcast();
    return true;
  }

  const role = ROLES[wizard.roleIndex]!;
  const options = roleOptions();
  wizard.notice = undefined;
  if (is(KEYS.previous)) wizard.option = (wizard.option - 1 + options.length) % options.length;
  else if (is(KEYS.next)) wizard.option = (wizard.option + 1) % options.length;
  else if (is(KEYS.confirm)) {
    const option = options[wizard.option]!;
    if (option.free) startFreePlacement(role.id as AncillaryRoleId, option.display);
    else {
      wizard.assignments[role.id] = option.display;
      wizard.unassigned.delete(role.id);
      if (option.zone && role.id !== 'playfield') wizard.zones[role.id] = option.zone;
      if (option.host) wizard.zones[option.host.role] = option.host.zone;
      if (role.id === 'dmd') wizard.dmdKind = option.dmdKind && { kind: option.dmdKind, ...(option.zone && { zone: option.zone }) };
      // Écrans et rôles seuls : bord des flippers et diagonale redemandés seulement pour un autre écran.
      if (role.id === 'playfield' && !(isOnly('ecrans') && fingerprintOf(displays[option.display]!).key === previous?.roles.playfield)) startLayout();
      else nextRole();
    }
  } else if (is(KEYS.exit)) {
    // Le playfield est obligatoire : Exit propose de quitter sans enregistrer.
    if (role.required) askQuit();
    else {
      wizard.unassigned.add(role.id);
      nextRole();
    }
  } else if (is(KEYS.back)) goBack();
  else return false;
  broadcast();
  return true;
}

/** Touche relâchée : fin d'un maintien, et relevé du bouton pendant l'étape « Boutons ». */
function handleKeyUp(input: Input): boolean {
  if (held?.code === input.code) stopHold();
  if (!pressed.delete(input.code)) return false;
  if (busy || wizard.quit || wizard.leaving || !CAPTURE_PHASES.includes(wizard.phase)) return true;
  if (isSummaryPhase(wizard.phase)) handleButtonsSummaryKey(input);
  else handleButtonKey(input);
  broadcast();
  return true;
}

// ---------------------------------------------------------------------------
// Quitter sans enregistrer
//
// Ouvert par le bouton « Quitter sans enregistrer » (souris), Ctrl+Q, Échap ou Exit
// maintenu 2 s, ou, pendant le relevé des boutons, n'importe quelle touche maintenue
// 3 s (quitHoldMs, core) : à ce moment, on ne sait pas encore quelle touche est Exit.
// La question annonce ce qui serait perdu. Start : oui · Exit : non · le même geste
// encore : oui ; sans réponse, l'assistant reprend. Rien n'est écrit : ni le modèle,
// ni VPinballX.ini ; une orientation d'écran non confirmée est remise.

/** Touches Exit connues : celles de l'assistant, et Exit (ou Retour) déjà relevé pendant le relevé. */
function exitKeys(): string[] {
  const capture = wizard.capture;
  const recorded = capture?.keys[capture.set.move.exit];
  return [...KEYS.exit, ...(recorded ? [recorded] : [])];
}

function confirmKeys(): string[] {
  const capture = wizard.capture;
  const recorded = capture?.keys[capture.set.move.confirm];
  return [...KEYS.confirm, ...(recorded ? [recorded] : [])];
}

/** Une touche vient d'être enfoncée : si elle reste tenue assez longtemps, la question s'ouvre (ou reçoit oui). */
function watchHold(code: string): void {
  stopHold();
  const ms = quitHoldMs(wizard.phase, code, exitKeys());
  if (ms === undefined) return;
  const at = Date.now();
  // Oui seulement pour un nouveau maintien : Exit qui ouvre la question d'un appui, puis reste tenu, n'y répond pas.
  const answering = Boolean(wizard.quit);
  const timer = setInterval(() => {
    const elapsed = Date.now() - at;
    if (elapsed < ms) {
      if (elapsed >= HOLD_SHOWN_MS && (answering || !wizard.quit)) broadcast();
      return;
    }
    stopHold();
    // La touche tenue n'est pas relevée comme un bouton.
    pressed.delete(code);
    if (!wizard.quit) askQuit();
    else if (answering) leaveWithoutSaving();
    broadcast();
  }, 100);
  held = { code, at, ms, timer, answering };
}

function stopHold(): void {
  if (!held) return;
  clearInterval(held.timer);
  const shown = Date.now() - held.at >= HOLD_SHOWN_MS;
  held = undefined;
  if (shown) broadcast();
}

/** La fenêtre a perdu le clavier : ses touches enfoncées ne seront jamais relâchées pour elle. */
function releaseKeys(): void {
  pressed.clear();
  stopHold();
}

/** « Quitter sans enregistrer ? », avec ce qui serait perdu. */
function askQuit(): void {
  if (wizard.quit || wizard.leaving || wizard.phase === 'done') return;
  if (wizard.capture) touched(wizard.capture); // plus de délai de l'étape « Boutons » pendant la question
  wizard.quit = { lines: pendingChanges(), deadline: Date.now() + QUIT_DIALOG_TIMEOUT_MS };
  // Sans opérateur, la trace de ce que la question annonce.
  if (process.env.CYBERPINBALL_AUTOPILOT) console.log(`Assistant : « Quitter sans enregistrer ? » (${wizard.phase}) : ${wizard.quit.lines.join(' ; ') || 'rien n’a changé'}`);
  stopQuitCountdown();
  quitCountdown = setInterval(() => {
    if (!wizard.quit) return stopQuitCountdown();
    if (Date.now() >= wizard.quit.deadline) closeQuit();
    broadcast();
  }, 1000);
}

function closeQuit(): void {
  wizard.quit = undefined;
  stopQuitCountdown();
}

function stopQuitCountdown(): void {
  if (quitCountdown) clearInterval(quitCountdown);
  quitCountdown = undefined;
}

/** Réponse à la question : Start (ou Entrée) oui, Exit (ou Échap, Retour arrière) non. */
function handleQuitKey(input: Input): void {
  if (input.isAutoRepeat) return;
  if (confirmKeys().includes(input.code)) leaveWithoutSaving();
  else if (exitKeys().includes(input.code) || KEYS.back.includes(input.code)) closeQuit();
}

/**
 * Sortie sans enregistrer : rien n'est écrit. Retour au menu, ou fermeture au premier
 * démarrage (le menu ne peut pas s'ouvrir sans borne configurée), annoncée à l'écran.
 */
function leaveWithoutSaving(): boolean {
  const destination = quitDestination(previous !== undefined);
  closeQuit();
  stopHold();
  stopCountdown();
  stopButtonsCountdown();
  restoreOrientation();
  wizard.leaving = destination.text;
  broadcast();
  console.log(`Assistant : quitté sans enregistrer (${destination.action === 'menu' ? 'retour au menu' : 'fermeture'}).`);
  // Sans opérateur, on reste sur cet écran pour la capture : l'autopilote finit puis ferme.
  if (process.env.CYBERPINBALL_AUTOPILOT) return true;
  if (destination.action === 'menu') setTimeout(() => continueToTables(), 600);
  else setTimeout(() => app.quit(), 3000);
  return true;
}

/** Ce que l'assistant a déjà répondu, par-dessus le modèle enregistré : de quoi dire ce qui serait perdu. */
function draftCabinet(): Partial<Cabinet> {
  const draft: Partial<Cabinet> = { screens: displays.map(toPhysicalScreen) };
  const capture = wizard.capture;
  const captured = (set: KeySet) => capture?.set === set && capture.answered.size > 0;
  const keys = captured(GAME_KEYS) ? ({ ...buttonKeys(wizard.buttons), ...capture!.keys } as CabinetButtons) : wizard.buttons;
  if (keys && keys !== previous?.buttons) draft.buttons = keys;
  const navigation = captured(INTERFACE_KEYS) ? ({ ...navigationButtons(inForce()), ...capture!.keys } as NavigationButtons) : wizard.navigation;
  if (navigation && navigation !== previous?.navigation) draft.navigation = navigation;
  const analog = wizard.plunger ? wizard.plunger.analog : wizard.analog;
  if (analog && JSON.stringify(analog) !== JSON.stringify(previous?.analog)) draft.analog = analog;
  if (arrangeOnly) {
    const arranged = arrangeCabinet();
    draft.roles = arranged.roles;
    draft.zones = arranged.zones;
    draft.dmdKind = arranged.dmdKind;
  } else {
    const roles = { ...previous?.roles };
    const zones = { ...previous?.zones };
    for (const { id } of ROLES) {
      const index = wizard.assignments[id];
      if (index === undefined && !wizard.unassigned.has(id)) continue;
      if (index === undefined) delete roles[id];
      else roles[id] = fingerprintOf(displays[index]!).key;
      if (wizard.zones[id]) zones[id] = wizard.zones[id];
      else delete zones[id];
    }
    draft.roles = roles;
    draft.zones = zones;
    // Réponse FullDMD ou DMD seul déjà donnée à l'étape des rôles.
    if (wizard.assignments.dmd !== undefined && wizard.dmdKind) draft.dmdKind = wizardDmdKind(roles, zones);
  }
  if (wizard.layoutAsked && playfieldDisplay()) draft.playfield = playfieldLayout();
  if (wizard.sound) draft.audio = buildAudio();
  return draft;
}

function pendingChanges(): string[] {
  const lines = cabinetChanges(previous, draftCabinet());
  if (wizard.flip) lines.push(t('Écran du playfield : remis dans son orientation d’origine'));
  return lines;
}

/** Bouton, question et sortie : sur chaque écran, à chaque étape. */
function quitView() {
  if (wizard.leaving) return { leaving: wizard.leaving };
  if (wizard.phase === 'done') return undefined;
  const elapsed = held ? Date.now() - held.at : 0;
  const holding = held && elapsed >= HOLD_SHOWN_MS && (held.answering || !wizard.quit) ? Math.max(1, Math.ceil((held.ms - elapsed) / 1000)) : undefined;
  const quit = wizard.quit;
  const label = (codes: string[]) => formatList([...new Set(codes)].slice(0, 2).map(keyLabel), 'or');
  return {
    button:
      holding === undefined
        ? t('Quitter sans enregistrer')
        : quit
          ? t('Maintenu : quitter dans {n} s', { n: holding })
          : t('Maintenu : quitter sans enregistrer ? dans {n} s', { n: holding }),
    holding: holding !== undefined,
    dialog: quit && {
      title: t('Quitter sans enregistrer ?'),
      lines: quit.lines.length ? quit.lines : [t('Rien n’a été changé.')],
      lead: quit.lines.length ? t('Ce qui ne sera pas enregistré :') : '',
      destination: quitDestination(previous !== undefined).text,
      hint: t('Start ({confirm}) : oui · Exit ({exit}) : non · le même geste encore : oui · sans réponse dans {n} s : on continue', {
        confirm: label(confirmKeys()),
        exit: label([...exitKeys(), ...KEYS.back]),
        n: Math.max(0, Math.ceil((quit.deadline - Date.now()) / 1000)),
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Étapes « Boutons du jeu » et « Boutons de l'interface »
//
// Deux jeux de boutons, relevés chacun de son côté par le même écran (KeySet, core) : ceux
// du jeu (GAME_KEYS, ce que VPX reçoit en partie, [Input]) puis, dans l'assistant complet,
// ceux de l'interface (INTERFACE_KEYS, ce qui pilote Cyber Pinball), proposés sur les mêmes
// boutons que flippers, Start et Exit. Dès qu'il y a des touches en vigueur (modèle
// enregistré, étape seule, ou l'interface après le jeu), l'étape s'ouvre sur le
// récapitulatif : chaque bouton avec sa touche, et un bouton se refait seul (clic sur sa
// ligne, ou précédent / suivant puis valider). Sur une nouvelle borne, relevé bouton par
// bouton, la touche en vigueur rappelée en retrait. Une erreur se corrige sans les boutons
// de la borne : clic sur une ligne, Retour arrière ou « Précédent », « Touches par défaut »
// et « Tout relever ». Au récapitulatif, les boutons à essayer du jeu relevé (flippers,
// Start, Exit ; précédent, suivant, valider, retour) dont la touche vient d'être relevée
// doivent avoir été pressés avant de valider (keysToTry) : un mauvais relevé ne peut pas
// être enregistré sans que le joueur s'en aperçoive ; les touches gardées ou celles par
// défaut n'ont pas à l'être.

/** Actions du récapitulatif, choisies aux boutons ou à la souris. */
const SUMMARY_ACTIONS = ['save', 'previous', 'defaults', 'restart'] as const;
type ButtonsAction = (typeof SUMMARY_ACTIONS)[number];

/** Marque de « Relevé : … » après « Touches par défaut » (le texte affiché est lastLabel). */
const DEFAULTS_LAST = 'defaults';

/** Dernier bouton relevé ou passé, en clair. */
const lastLabel = (set: KeySet, last: string) =>
  last !== DEFAULTS_LAST ? last : set === GAME_KEYS ? t('touches par défaut des encodeurs') : t('mêmes boutons que flippers, Start et Exit du jeu');

/** Phase du relevé d'un jeu de boutons, et de son récapitulatif. */
const capturePhase = (set: KeySet): Phase => (set === GAME_KEYS ? 'buttons' : 'navigation');
const summaryPhase = (set: KeySet): Phase => (set === GAME_KEYS ? 'buttonsSummary' : 'navigationSummary');
const isSummaryPhase = (phase: Phase) => phase === 'buttonsSummary' || phase === 'navigationSummary';

/** Les deux jeux de boutons en vigueur : ceux du modèle, puis ceux relevés et validés. */
const inForce = (): ButtonsSource => ({ buttons: wizard.buttons, navigation: wizard.navigation });

/** Touches en vigueur d'un jeu de boutons : du jeu (celles des encodeurs sans relevé), ou de l'interface (déduites du jeu sans relevé). */
function inForceKeys(set: KeySet): SetKeys {
  return set === GAME_KEYS ? buttonKeys(wizard.buttons) : navigationButtons(inForce());
}

/** Ce que la souris envoie depuis screen.js. */
type WizardAction = { type: 'button'; index: number } | { type: 'buttons'; action: ButtonsAction | PlungerAction } | { type: 'quit'; op: 'ask' | 'yes' | 'no' } | ArrangeAction;

/** Arrivée sur l'étape « Boutons du jeu » (startCapture). */
function startButtons(initial = false): void {
  startCapture(GAME_KEYS, initial);
}

/**
 * Arrivée sur le relevé d'un jeu de boutons : le récapitulatif des touches en vigueur s'il
 * y en a (ou à l'étape seule, où ce sont au pire celles par défaut ; toujours pour
 * l'interface, proposée sur les boutons du jeu), sinon le relevé du premier bouton. Délai
 * de 20 s pour les boutons du jeu de l'assistant complet, pas à l'étape seule où l'on est
 * venu exprès. « Tout relever » : relevé complet, rien de gardé.
 */
function startCapture(set: KeySet, initial = false): void {
  const game = set === GAME_KEYS;
  const stepOnly = only?.id === (game ? 'boutons' : 'interface');
  const keep = initial && ((game ? wizard.buttons : wizard.navigation) !== undefined || stepOnly || !game);
  const keys = keep ? inForceKeys(set) : {};
  const timed = initial && game && !(keep && stepOnly);
  wizard.phase = keep ? summaryPhase(set) : capturePhase(set);
  wizard.capture = {
    set,
    index: 0,
    keys,
    answered: new Set(keep ? set.items.map((b) => b.id) : []),
    reference: { ...keys },
    action: 0,
    tried: new Set(),
    // Interface jamais relevée : proposée sur les flippers, Start et Exit du jeu, et dite comme telle.
    ...(keep && !game && !wizard.navigation && { last: DEFAULTS_LAST }),
    ...(timed && { deadline: Date.now() + BUTTONS_TIMEOUT_MS }),
  };
  stopButtonsCountdown();
  if (!timed) return;
  buttonsCountdown = setInterval(() => {
    const deadline = wizard.capture?.deadline;
    if (!CAPTURE_PHASES.includes(wizard.phase) || deadline === undefined) stopButtonsCountdown();
    else if (Date.now() >= deadline) buttonsTimeout();
    else broadcast();
  }, 1000);
}

function stopButtonsCountdown(): void {
  if (buttonsCountdown) clearInterval(buttonsCountdown);
  buttonsCountdown = undefined;
}

/** Quelqu'un est là (touche ou clic) : plus de délai. */
function touched(capture: ButtonCapture): void {
  capture.deadline = undefined;
  stopButtonsCountdown();
  capture.refused = undefined;
  capture.notice = undefined;
}

/**
 * Le bouton demandé envoie cette touche, du clavier ou du joystick (recordKey, core).
 * Retour arrière revient au bouton précédent, ou au récapitulatif si l'on refaisait un
 * seul bouton.
 */
function handleButtonKey(input: Input): void {
  const capture = wizard.capture!;
  if (input.isAutoRepeat) return; // bouton maintenu
  touched(capture);
  const code = input.code;
  if (code === PREVIOUS_KEY) return previousButton();
  const button = capture.set.items[capture.index]!;
  const record = recordKey(capture.set, capture.keys, button.id, code);
  capture.refused = record.refused;
  if (record.refused) return;
  // Une autre touche : l'essai de ce bouton est à refaire.
  if (capture.keys[button.id] !== record.keys[button.id]) capture.tried.delete(button.id);
  capture.keys = record.keys;
  capture.last = record.skipped ? t('{button} : pas de bouton', { button: button.label }) : t('{button} : {key}', { button: button.label, key: keyLabel(code) });
  capture.answered.add(button.id);
  nextButton(capture);
}

/** Bouton suivant sans réponse (après celui-ci, puis depuis le début) ; tous répondus : récapitulatif. */
function nextButton(capture: ButtonCapture): void {
  const items = capture.set.items;
  const order = [...items.keys()].map((i) => (capture.index + 1 + i) % items.length);
  const next = order.find((i) => !capture.answered.has(items[i]!.id));
  if (next === undefined) enterButtonsSummary(capture);
  else capture.index = next;
}

/** Récapitulatif, curseur sur « Valider » ; les essais des touches inchangées restent acquis. */
function enterButtonsSummary(capture: ButtonCapture): void {
  wizard.phase = summaryPhase(capture.set);
  capture.action = 0;
}

/** Tous les boutons ont leur réponse : on refait un seul bouton, depuis le récapitulatif. */
function redoingOne(capture: ButtonCapture): boolean {
  return capture.set.items.every((b) => capture.answered.has(b.id));
}

/** Refaire ce bouton seul : les autres gardent leur touche, puis retour au récapitulatif. */
function redoButton(capture: ButtonCapture, index: number): void {
  if (!capture.set.items[index]) return;
  capture.index = index;
  wizard.phase = capturePhase(capture.set);
}

/** Retour arrière ou « Précédent » : le bouton d'avant ; depuis le récapitulatif, le dernier. */
function previousButton(): void {
  const capture = wizard.capture!;
  const summary = isSummaryPhase(wizard.phase);
  if (!summary && redoingOne(capture)) return enterButtonsSummary(capture);
  if (summary) capture.index = capture.set.items.length - 1;
  else capture.index = Math.max(0, capture.index - 1);
  wizard.phase = capturePhase(capture.set);
}

/**
 * Récapitulatif : chaque bouton à essayer du jeu relevé est essayé. Ses boutons précédent
 * et suivant (flippers du jeu) choisissent une action ou un bouton à refaire, valider (Start)
 * lance ce choix, retour (Exit) est seulement essayé. Les touches de l'interface en vigueur,
 * les flèches et Entrée d'un clavier choisissent et lancent aussi, sans compter comme essai.
 */
function handleButtonsSummaryKey(input: Input): void {
  const capture = wizard.capture!;
  if (input.isAutoRepeat) return;
  touched(capture);
  const code = input.code;
  const { keys, set } = capture;
  const choices = SUMMARY_ACTIONS.length + set.items.length;
  const move = (step: number) => (capture.action = (capture.action + step + choices) % choices);
  const run = () =>
    capture.action < SUMMARY_ACTIONS.length ? runButtonsAction(SUMMARY_ACTIONS[capture.action]!) : redoButton(capture, capture.action - SUMMARY_ACTIONS.length);
  const tried = set.tried.find((id) => keys[id] === code);
  if (tried) capture.tried.add(tried);
  const own = (role: keyof KeySet['move']) => keys[set.move[role]] === code;
  if (own('previous')) move(-1);
  else if (own('next')) move(1);
  else if (own('confirm')) run();
  else if (own('exit')) return;
  else if (code === PREVIOUS_KEY) previousButton();
  else if (code === 'ArrowLeft' || code === 'ArrowUp' || KEYS.previous.includes(code)) move(-1);
  else if (code === 'ArrowRight' || code === 'ArrowDown' || KEYS.next.includes(code)) move(1);
  else if (KEYS.confirm.includes(code)) run();
}

/** Clic dans l'étape (screen.js) : refaire un bouton, ou une action. */
function handleWizardAction(action: WizardAction): void {
  // Bouton « Quitter sans enregistrer » et réponses à la question, sur chaque écran.
  if (action.type === 'quit') {
    if (wizard.leaving || busy) return;
    if (action.op === 'ask') askQuit();
    else if (action.op === 'yes' && wizard.quit) leaveWithoutSaving();
    else if (action.op === 'no') closeQuit();
    broadcast();
    return;
  }
  if (wizard.quit || wizard.leaving) return;
  if (action.type === 'arrange') {
    if (wizard.phase !== 'arrange') return;
    afterArrange(arrangeAction(arrangeHost(), wizard.arrange!, action));
    broadcast();
    return;
  }
  if (wizard.phase === 'plunger' && (action.type === 'button' || action.type === 'buttons')) {
    afterPlunger(plungerClick(wizard.plunger!, action.type === 'button' ? { row: action.index } : { action: action.action as PlungerAction }));
    broadcast();
    return;
  }
  const capture = wizard.capture;
  if (!capture || !CAPTURE_PHASES.includes(wizard.phase)) return;
  touched(capture);
  if (action.type === 'button') redoButton(capture, action.index);
  else runButtonsAction(action.action as ButtonsAction);
  broadcast();
}

function runButtonsAction(action: ButtonsAction): void {
  const capture = wizard.capture!;
  const set = capture.set;
  switch (action) {
    case 'previous':
      return previousButton();
    case 'restart':
      return startCapture(set);
    case 'defaults':
      // Les touches des encodeurs, ou pour l'interface les flippers, Start et Exit du jeu : connues, elles s'enregistrent sans essai.
      capture.keys = set === GAME_KEYS ? buttonKeys(undefined) : defaultNavigation(wizard.buttons);
      capture.reference = { ...capture.keys };
      capture.answered = new Set(set.items.map((b) => b.id));
      capture.last = DEFAULTS_LAST;
      return enterButtonsSummary(capture);
    case 'save': {
      if (!isSummaryPhase(wizard.phase)) return;
      const problems = keyProblems(set, capture.keys);
      const untried = keysToTry(set, capture.keys, capture.reference).filter((id) => !capture.tried.has(id));
      if (problems.length) capture.notice = t('Impossible de valider : {problems}.', { problems: problems.join(' ; ') });
      else if (untried.length) capture.notice = t('Essayez d’abord sur la borne : {buttons}.', { buttons: untried.map((id) => itemLabel(set, id)).join(', ') });
      else acceptButtons();
    }
  }
}

const itemLabel = (set: KeySet, id: string) => set.items.find((b) => b.id === id)!.label;

/** Personne n'a touché à rien : les touches actuelles restent (celles des encodeurs sur une nouvelle borne). */
function buttonsTimeout(): void {
  stopButtonsCountdown();
  wizard.capture = undefined;
  if (buttonsOnly) {
    continueToTables();
    return;
  }
  wizard.phase = 'assign';
  wizard.notice = wizard.buttons
    ? t('Boutons : aucun bouton pressé, touches actuelles gardées.')
    : t('Boutons : aucun bouton pressé, touches par défaut des encodeurs gardées.');
  broadcast();
}

/**
 * Valider au récapitulatif. Les boutons de l'interface pilotent aussitôt la suite de
 * l'assistant ; après ceux du jeu, l'assistant complet propose ceux de l'interface.
 */
function acceptButtons(): void {
  const capture = wizard.capture!;
  if (capture.set === GAME_KEYS) wizard.buttons = { ...capture.keys } as CabinetButtons;
  else wizard.navigation = { ...capture.keys } as NavigationButtons;
  KEYS = wizardKeys(inForce());
  wizard.capture = undefined;
  if (only) saveStep();
  else if (capture.set === GAME_KEYS) startCapture(INTERFACE_KEYS, true);
  else startPlunger();
}

// ---------------------------------------------------------------------------
// Étape « Lanceur » (plunger-step.ts)

/** Écart entre deux lectures des axes : une trentaine par seconde, assez pour voir un tir. */
const PLUNGER_TICK_MS = 30;

/**
 * Arrivée sur l'étape. Dans l'assistant complet, une borne sans aucun joystick à axes ni
 * réglage connu n'a rien à régler : on passe aux écrans, sans rien écrire.
 */
function startPlunger(): void {
  const step = startPlungerStep(wizard.analog, readTextIfExists(activeVpxIni(loc)));
  step.readings = joystickAxes();
  if (!only && !step.initial && step.readings.length === 0) {
    wizard.phase = 'assign';
    wizard.notice = t('Lanceur : aucun joystick à axes branché, rien à régler.');
    return;
  }
  wizard.plunger = step;
  wizard.phase = 'plunger';
  stopPlungerTimer();
  plungerTimer = setInterval(() => {
    if (wizard.phase !== 'plunger' || !wizard.plunger) return stopPlungerTimer();
    if (plungerTick(wizard.plunger, joystickAxes(), Date.now())) broadcast();
  }, PLUNGER_TICK_MS);
}

function stopPlungerTimer(): void {
  if (plungerTimer) clearInterval(plungerTimer);
  plungerTimer = undefined;
}

/** Enregistrer (le réglage de l'étape) ou « Pas de lanceur analogique » (aucun capteur). */
function afterPlunger(outcome: PlungerOutcome): void {
  if (outcome !== 'save' && outcome !== 'none') return;
  wizard.analog = outcome === 'save' ? structuredClone(wizard.plunger!.analog) : {};
  wizard.plunger = undefined;
  stopPlungerTimer();
  if (only) saveStep();
  else wizard.phase = 'assign';
}

/** Étape « Lanceur » : même écran partout, comme les boutons ; droit sur l'ancien playfield. */
function plungerViewFor(index: number, base: Record<string, unknown>) {
  const label = (codes: string[]) => keyLabel(codes[0]);
  return {
    ...base,
    rotation: index === previousPlayfieldIndex() ? edgeRotation(previousEdge() ?? 'bottom') : 0,
    highlight: true,
    ...plungerView(wizard.plunger!, only ? t('Enregistrer') : t('Continuer'), { previous: label(KEYS.previous), next: label(KEYS.next), confirm: label(KEYS.confirm), exit: label(KEYS.exit) }),
  };
}

/**
 * Étape refaite seule : le modèle garde tout le reste (stepCabinet, core), et
 * VPinballX.ini ne reprend la main que sur les clés de l'étape ; les autres clés
 * changées à la main restent en attente. Les boutons de l'interface n'ont aucune clé.
 */
function saveStep(): void {
  const step = only!;
  // Écrans et rôles : le bord des flippers et la diagonale, s'ils ont été redemandés.
  const extra: CabinetField[] = isOnly('ecrans') && wizard.layoutAsked ? ['playfield'] : [];
  const cabinet = stepCabinet(previous!, stepBuilt(), step, extra);
  saveCabinet(loc.dataDir, cabinet);
  previous = cabinet;
  wizard.phase = 'done';
  if (interfaceOnly) {
    wizard.result = { lines: [t('VPinballX.ini inchangé : VPX ne lit pas les boutons de l’interface.')], findings: [], iniPath: cabinet.vpx.iniPath };
    return;
  }
  // Seulement les clés de l'étape, reprises en main même changées à la main ; les autres restent telles quelles.
  const { plan, report } = syncVpxIni(loc.dataDir, cabinet.vpx.iniPath, cabinet, displays, profile, step.owns, cabinet.audio ? audio : undefined, step.owns);
  wizard.result = {
    lines: summarizeChanges(plan.changes, buttonsOnly || isOnly('lanceur')),
    findings: [
      ...(isOnly('son') ? channelNotices() : []),
      // Boutons seuls : le constat des actions de VPX privées de leur touche, reconnu à ces actions (pas à son texte).
      ...plan.findings.filter((f) => f.severity !== 'info' || (buttonsOnly && isSilencedFinding(f, plan.silenced))),
    ],
    iniPath: cabinet.vpx.iniPath,
    backup: report?.backup,
  };
}

/**
 * Constat de la synchronisation qui nomme les actions de VPX privées de leur touche
 * (« Touches de VPX reprises par les boutons de la borne : … ») : il cite chacune d'elles,
 * sous le même libellé, dans la langue de l'interface. Rien ne dépend de son texte.
 */
function isSilencedFinding(f: SyncFinding, silenced: readonly { label: string }[]): boolean {
  return silenced.length > 0 && silenced.every((s) => f.message.includes(s.label));
}

/**
 * Ce que l'étape seule a décidé, dans un modèle complet : stepCabinet n'en garde que
 * ses champs. Le fichier est celui de la configuration active, dans le dossier de cet
 * emplacement (celui du bac à sable avec CYBERPINBALL_HOME).
 */
function stepBuilt(): Cabinet {
  const stamp = { vpx: { iniPath: activeVpxIni(loc) }, updatedAt: new Date().toISOString() };
  if (buttonsOnly) return { ...previous!, buttons: wizard.buttons, ...stamp };
  if (interfaceOnly) return { ...previous!, navigation: wizard.navigation, ...stamp };
  if (isOnly('lanceur')) return { ...previous!, analog: wizard.analog, ...stamp };
  if (arrangeOnly) return arrangeCabinet();
  return buildCabinet();
}

/** Actions de VPX qui perdraient leur touche, d'après le VPinballX.ini actuel. */
function silencedPreview(keys: CabinetButtons): string[] {
  const iniPath = activeVpxIni(loc);
  const plan = vpxInputSettings(keys, IniDocument.parse(readTextIfExists(iniPath)), loadOwnedMemory(loc.dataDir, iniPath));
  return plan.silenced.map((s) => `${s.label} (${keyLabel(keys[s.button])})`);
}

/** Lignes des boutons dans le récapitulatif de l'assistant complet : le jeu, puis l'interface. */
function buttonsSummary(): string[] {
  const keys = buttonKeys(wizard.buttons);
  const main = MAIN_GAME_BUTTONS.map((id) => keyLabel(keys[id])).join(', ');
  const optional = BUTTONS.filter((b) => !b.required && keys[b.id]).length;
  const nav = navigationButtons(inForce());
  return [
    wizard.buttons
      ? tn(optional, 'Boutons relevés : flippers, Start, Exit sur {main} ; {n} bouton facultatif', 'Boutons relevés : flippers, Start, Exit sur {main} ; {n} boutons facultatifs', { main })
      : t('Boutons : touches par défaut des encodeurs ({main}…), [Input] de VPX inchangé', { main }),
    t('Interface : précédent, suivant, valider, retour sur {keys}', { keys: INTERFACE_KEYS.tried.map((id) => keyLabel(nav[id as NavigationId])).join(', ') }),
  ];
}

/** Lignes « bouton : touche » de l'écran final ; les boutons absents de la borne sur une seule ligne. */
function buttonLines(set: KeySet, all: SetKeys): string[] {
  const missing = set.items.filter((b) => !all[b.id]).map((b) => b.label);
  return [
    ...set.items.filter((b) => all[b.id]).map((b) => t('{button} : {key}', { button: b.label, key: keyLabel(all[b.id]) })),
    ...(missing.length ? [t('Pas de bouton : {buttons}', { buttons: missing.join(', ') })] : []),
  ];
}

/** Écran qui était le playfield : la question s'y affiche droite pour le joueur. */
function previousPlayfieldIndex(): number {
  const fp = previous?.roles.playfield;
  return displays.findIndex((d) => fp && fingerprintOf(d).key === fp);
}

const ACTION_LABELS: Record<ButtonsAction, string> = {
  get save() { return t('Valider'); },
  get previous() { return t('◀ Précédent'); },
  get defaults() { return t('Touches par défaut'); },
  get restart() { return t('Tout relever'); },
};

/**
 * Relevé d'un jeu de boutons : même écran partout, on ne sait pas encore lequel le joueur
 * regarde. La liste de tous les boutons du jeu relevé et les actions sont cliquables.
 */
function buttonsView(index: number, base: Record<string, unknown>) {
  const capture = wizard.capture!;
  const set = capture.set;
  const game = set === GAME_KEYS;
  const summary = isSummaryPhase(wizard.phase);
  const rotation = index === previousPlayfieldIndex() ? edgeRotation(previousEdge() ?? 'bottom') : 0;
  // Pas encore relevé : la touche en vigueur, en retrait.
  const inForceSet = inForceKeys(set);
  const list = set.items.map((b, i) => {
    const code = capture.keys[b.id];
    const answered = capture.answered.has(b.id);
    return {
      label: b.label,
      key: code ? keyLabel(code) : answered ? t('pas de bouton') : inForceSet[b.id] ? keyLabel(inForceSet[b.id]) : b.required ? '' : t('facultatif'),
      state: !summary && i === capture.index ? 'current' : answered ? 'done' : 'todo',
      selected: summary && capture.action === SUMMARY_ACTIONS.length + i,
      tried: summary && capture.tried.has(b.id),
    };
  });
  const actions = (summary ? SUMMARY_ACTIONS : (['previous', 'defaults', 'restart'] as const)).map((id, i) => ({
    id,
    label: id === 'save' && only ? t('Enregistrer') : ACTION_LABELS[id],
    selected: summary && i === capture.action,
  }));
  const common = { ...base, rotation, highlight: true, name: '', details: '', buttons: list, actions };
  const keyOf = (role: keyof KeySet['move']) => keyLabel(capture.keys[set.move[role]]);

  if (summary) {
    const keys = capture.keys;
    const toTry = keysToTry(set, keys, capture.reference);
    const tried = toTry.map((id) => `${itemLabel(set, id)} ${capture.tried.has(id) ? '✓' : '○'}`).join(' · ');
    const silenced = game ? silencedPreview(keys as CabinetButtons) : [];
    const seconds = capture.deadline === undefined ? undefined : Math.max(0, Math.ceil((capture.deadline - Date.now()) / 1000));
    const choose = { left: keyOf('previous'), right: keyOf('next'), start: keyOf('confirm'), exit: keyOf('exit') };
    return {
      ...common,
      prompt: toTry.length ? t('Essayez les boutons') : game ? t('Boutons du jeu') : t('Boutons de l’interface'),
      details: !game
        ? t('Touches de secours du clavier toujours actives : Tab, flèches, Entrée, Échap.')
        : silenced.length
          ? t('Perdent leur touche dans VPX : {actions}', { actions: silenced.join(', ') })
          : t('Les autres touches de VPX ne changent pas.'),
      notice: capture.notice ?? (keyProblems(set, keys).join(' ; ') || (seconds === undefined ? undefined : t('Sans réponse dans {n} s : touches actuelles gardées.', { n: seconds }))),
      step: toTry.length
        ? t('Essai des touches relevées : {buttons}', { buttons: tried })
        : t('{last} · choisissez un bouton pour lui donner une autre touche.', {
            last:
              capture.last === DEFAULTS_LAST
                ? game
                  ? t('Touches par défaut des encodeurs')
                  : t('Mêmes boutons que flippers, Start et Exit du jeu')
                : capture.last
                  ? t('Relevé : {last}', { last: lastLabel(set, capture.last) })
                  : t('Touches actuelles'),
          }),
      hint: game
        ? toTry.includes('exit')
          ? t('Flippers ({left} / {right}) : choisir · Start ({start}) : lancer · Exit ({exit}) : à essayer aussi · Clic ou Start sur un bouton : le refaire', choose)
          : t('Flippers ({left} / {right}) : choisir · Start ({start}) : lancer · Clic ou Start sur un bouton : le refaire', choose)
        : toTry.includes('back')
          ? t('Précédent / Suivant ({left} / {right}) : choisir · Valider ({start}) : lancer · Retour ({exit}) : à essayer aussi · Clic ou Valider sur un bouton : le refaire', choose)
          : t('Précédent / Suivant ({left} / {right}) : choisir · Valider ({start}) : lancer · Clic ou Valider sur un bouton : le refaire', choose),
    };
  }

  const button = set.items[capture.index]!;
  const required = set.items.filter((b) => b.required).length;
  const current = inForceSet[button.id];
  const recorded = game ? wizard.buttons : wizard.navigation;
  const seconds = capture.deadline === undefined ? undefined : Math.max(0, Math.ceil((capture.deadline - Date.now()) / 1000));
  const back = redoingOne(capture) ? t('annuler') : t('bouton précédent');
  return {
    ...common,
    prompt: t('Appuyez sur le bouton'),
    measure: button.label,
    name: button.required
      ? t('Bouton {n} sur {total}', { n: capture.index + 1, total: required })
      : t('Bouton facultatif {n} sur {total}', { n: capture.index + 1 - required, total: set.items.length - required }),
    details: [recorded ? t('Touche actuelle : {key}', { key: current ? keyLabel(current) : t('aucune') }) : t('Touche par défaut : {key}', { key: current ? keyLabel(current) : t('aucune') }), joystickLine()].join(' · '),
    notice:
      capture.refused ??
      (seconds === undefined
        ? undefined
        : wizard.buttons
          ? t('Sans réponse dans {n} s : touches actuelles gardées.', { n: seconds })
          : t('Sans réponse dans {n} s : touches par défaut des encodeurs gardées (Maj, 1, Échap…).', { n: seconds })),
    step: capture.last
      ? t('Relevé : {last}', { last: lastLabel(set, capture.last) })
      : game
        ? t('Chaque bouton une seule fois : ce que VPX recevra pendant une partie.')
        : t('Chaque bouton une seule fois : ce qui pilotera le menu et la suite de l’assistant.'),
    hint: button.required
      ? t('Clic sur un bouton : le refaire · Retour arrière : {back}', { back })
      : game
        ? t('Exit ({exit}) : la borne n’a pas ce bouton · Clic sur un bouton : le refaire · Retour arrière : {back}', { exit: keyOf('exit'), back })
        : t('Retour ({exit}) : pas de bouton pour ce rôle · Clic sur un bouton : le refaire · Retour arrière : {back}', { exit: keyOf('exit'), back }),
  };
}

/**
 * Joysticks pendant le relevé : une borne à Pinscape (KL25Z) ou à encodeur en mode manette
 * envoie des boutons de joystick, lus par la bibliothèque SDL de VPX (joystick-input.ts).
 */
function joystickLine(): string {
  const status = joystickStatus();
  if (status.state === 'ready') {
    const read = status.devices.length ? t('Joystick lu : {names}', { names: status.devices.map((d) => d.name || d.id).join(', ') }) : t('Aucun joystick branché');
    // Le clavier allait ailleurs (foreground.ts) : à noter, c'est ce qui empêchait de relever ses touches.
    const lost = keyboardIncident();
    return lost ? `${read} · ${lost.back ? t('clavier repris à {holder}', { holder: lost.holder }) : t('clavier retenu par {holder}', { holder: lost.holder })}` : read;
  }
  if (status.state === 'error') return t('Joysticks illisibles : {error}', { error: status.error });
  if (status.state === 'no-vpx') return t('Joysticks lus une fois VPX installé');
  return t('Joysticks en cours de lecture…');
}

/** Après le choix du playfield : diagonale proposée depuis l'EDID, sinon la saisie précédente. */
function startLayout(): void {
  wizard.phase = 'orient';
  wizard.layoutAsked = true;
  wizard.diagonal = edidDiagonal(playfieldDisplay()) ?? wizard.diagonal;
  const manual = previous?.playfield?.manualSizeCm;
  if (manual) wizard.diagonal = Math.round(diagonalInches(manual));
}

/**
 * Orientation : les flippers font tourner l'affichage du playfield jusqu'à ce
 * qu'il soit droit pour le joueur. Taille : les flippers changent la diagonale.
 * Exit ou Retour arrière reviennent à l'étape précédente.
 */
function handleLayoutKey(is: (group: string[]) => boolean): boolean {
  const back = is(KEYS.exit) || is(KEYS.back);
  if (wizard.phase === 'orient') {
    const at = FLIPPER_EDGES.indexOf(wizard.flipperEdge);
    const step = is(KEYS.previous) ? -1 : is(KEYS.next) ? 1 : 0;
    if (step) {
      wizard.flipperEdge = FLIPPER_EDGES[(at + step + FLIPPER_EDGES.length) % FLIPPER_EDGES.length]!;
      wizard.notice = undefined;
      wizard.flipWarning = undefined;
    } else if (is(KEYS.confirm)) confirmEdge();
    // Avertissement « autre menu installé » : Exit garde l'orientation de Windows, sans rien tourner.
    else if (back && wizard.flipWarning === wizard.flipperEdge) {
      wizard.flipWarning = undefined;
      wizard.keepEdge = wizard.flipperEdge;
      wizard.notice = t('Orientation de Windows gardée : {names} n’est pas touché. Dans Cyber Pinball, les tables seront à l’envers pour vous. Start : continuer.', { names: frontendNames(otherFrontends) });
    }
    // Orientation seule : rien avant cette question, Exit propose de quitter sans enregistrer.
    else if (back) {
      if (isOnly('playfield')) askQuit();
      else goBack();
    } else return false;
    return true;
  }
  if (is(KEYS.previous)) wizard.diagonal = Math.max(DIAGONAL.min, wizard.diagonal - 1);
  else if (is(KEYS.next)) wizard.diagonal = Math.min(DIAGONAL.max, wizard.diagonal + 1);
  else if (is(KEYS.confirm)) {
    if (isOnly('playfield')) wizard.phase = 'summary';
    else {
      wizard.phase = 'assign';
      nextRole();
    }
  } else if (back) wizard.phase = 'orient';
  else return false;
  return true;
}

/** Start sur le bord des flippers : si VPX ne sait pas les mettre de ce côté, on tourne l'écran. */
function confirmEdge(): void {
  const display = playfieldDisplay();
  const fix = display && vpxOrientationFix(display, wizard.flipperEdge);
  if (!fix || wizard.keepEdge === wizard.flipperEdge) {
    wizard.phase = 'size';
    wizard.notice = undefined;
    return;
  }
  // L'orientation est un réglage de Windows : un autre menu de borne installé la subit aussi.
  // Le premier Start avertit, le second retourne.
  if (otherFrontends.length && wizard.flipWarning !== wizard.flipperEdge) {
    wizard.flipWarning = wizard.flipperEdge;
    return;
  }
  wizard.flipWarning = undefined;
  void flipPlayfield(fix);
}

/**
 * Tourne l'écran du playfield dans Windows, refait la détection et recalcule le
 * bord du joueur dans la nouvelle image. Le joueur voit toujours l'affichage
 * droit : la rotation dessinée par l'assistant compense celle de Windows.
 */
async function flipPlayfield(fix: OrientationFix): Promise<void> {
  const index = wizard.assignments.playfield!;
  const from = displays[index]!.rotation;
  const edge = wizard.flipperEdge;
  const done = await changeOrientation(index, fix.rotation, t('Rotation de l’écran du playfield…'));
  const turn = rotationDelta(displays[index]!.rotation, from);
  wizard.flipperEdge = edgeAfterRotation(edge, turn);
  if (!done || turn === 0) {
    // Le bord suit l'image réellement affichée, même si Windows s'est arrêté en route.
    wizard.keepEdge = wizard.flipperEdge;
    wizard.notice ??= t('Windows n’a pas tourné l’écran. Start : continuer quand même.');
    broadcast();
    return;
  }

  wizard.flip = { from, edge, turn, deadline: Date.now() + FLIP_TIMEOUT_MS };
  wizard.phase = 'flip';
  countdown = setInterval(() => {
    if (!wizard.flip) stopCountdown();
    else if (Date.now() >= wizard.flip.deadline) void revertFlip(true);
    else broadcast();
  }, 1000);
  broadcast();
}

/** Start pendant le compte à rebours : on garde la nouvelle orientation. */
function keepFlip(): void {
  stopCountdown();
  wizard.flip = undefined;
  wizard.phase = 'size';
}

/** Exit ou fin du compte à rebours : l'écran reprend son orientation, le joueur son bord. */
async function revertFlip(timedOut: boolean): Promise<void> {
  const flip = wizard.flip;
  if (!flip) return;
  stopCountdown();
  wizard.flip = undefined;
  wizard.phase = 'orient';
  const index = wizard.assignments.playfield!;
  const done = await changeOrientation(index, flip.from, t('Retour à l’orientation d’origine…'));
  // Le bord suit l'image réellement affichée, revenue ou non.
  wizard.flipperEdge = edgeAfterRotation(flip.edge, rotationDelta(displays[index]!.rotation, flip.from));
  wizard.keepEdge = wizard.flipperEdge;
  if (done) {
    wizard.notice = timedOut
      ? t('Pas de réponse : orientation d’origine rétablie. Start : continuer, tables à l’envers pour vous.')
      : t('Orientation d’origine rétablie. Start : continuer, tables à l’envers pour vous.');
  }
  broadcast();
}

/**
 * Change l'orientation de l'écran n° index (simulée sans opérateur), attend que
 * Windows et Electron aient fini, puis relit la géométrie et replace les fenêtres.
 * En cas d'échec, le bandeau affiche pourquoi et l'on renvoie false.
 */
async function changeOrientation(index: number, rotation: Rotation, working: string): Promise<boolean> {
  busy = true;
  wizard.notice = working;
  broadcast();
  const focused = BrowserWindow.getFocusedWindow();
  await delay(150); // le temps d'afficher le message avant que l'écran ne clignote
  try {
    const display = displays[index]!;
    if (SIMULATED_ORIENTATION) {
      displays[index] = rotatedDisplay(display, rotationDelta(rotation, display.rotation));
    } else {
      const changed = displayChange(2000);
      setDisplayOrientation(display.gdiName, rotation);
      await changed;
      redetect();
    }
    wizard.notice = undefined;
    return true;
  } catch (err) {
    wizard.notice = t('{error} Start : continuer quand même.', { error: (err as Error).message });
    try {
      redetect();
    } catch {
      // On garde la dernière géométrie connue.
    }
    return false;
  } finally {
    placeWindows();
    // Les boutons de la borne doivent continuer d'arriver à l'assistant.
    if (focused && !focused.isDestroyed()) focused.focus();
    busy = false;
  }
}

/** Nouvelle détection, dans l'ordre des fenêtres : le nom GDI ne change pas en cours de session. */
function redetect(): void {
  const fresh = observedDisplays();
  displays = displays.map((d) => fresh.find((f) => f.gdiName === d.gdiName) ?? d);
}

/** Attend qu'Electron ait vu le changement d'écrans, au plus timeoutMs. */
function displayChange(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      screen.off('display-metrics-changed', done);
      setTimeout(resolve, 300); // Windows envoie plusieurs notifications d'affilée
    };
    const timer = setTimeout(done, timeoutMs);
    screen.on('display-metrics-changed', done);
  });
}

function stopCountdown(): void {
  if (countdown) clearInterval(countdown);
  countdown = undefined;
}

/** Chaque fenêtre de l'assistant couvre son écran, d'après la dernière détection. */
function placeWindows(): void {
  windows.forEach((win, i) => {
    const d = displays[i];
    if (d) coverDisplay(win, windowRect(d.bounds));
  });
}

function playfieldDisplay(): ObservedDisplay | undefined {
  const index = wizard.assignments.playfield;
  return index === undefined ? undefined : displays[index];
}

/** Diagonale de l'EDID quand elle est plausible, arrondie au pouce. */
function edidDiagonal(display: ObservedDisplay | undefined): number | undefined {
  const size = display && edidSize(display.edid, display);
  return size && Math.round(diagonalInches(size));
}

function nextRole(): void {
  wizard.roleIndex++;
  if (wizard.roleIndex >= ROLES.length || roleOptions().length === 0) {
    // Écrans et rôles seuls : la disposition reste « Placer librement… » ou son entrée du menu.
    if (isOnly('ecrans')) {
      wizard.roleIndex = ROLES.length;
      wizard.phase = 'summary';
    } else startArrangeStep();
    return;
  }
  wizard.option = defaultOption();
}

// ---------------------------------------------------------------------------
// Étape « Son »

/**
 * Sorties actives ; CYBERPINBALL_AUDIO_OUTPUTS (fichier JSON) les remplace pour
 * les tests sans opérateur, par exemple pour montrer une carte 7.1 absente du PC.
 */
function loadAudioOutputs(): ObservedAudioOutput[] {
  const fixture = process.env.CYBERPINBALL_AUDIO_OUTPUTS;
  if (fixture) return readJsonFile(fixture) as ObservedAudioOutput[];
  return audioOutputs() ?? [];
}

/**
 * Après les écrans : chaque sortie audio joue son son, le joueur dit où il l'a
 * entendu. Les rôles partent du modèle existant, sinon des propositions : le
 * haut-parleur de l'écran du fronton pour le fronton, une carte 7.1 (à défaut le
 * haut-parleur de l'écran du playfield) pour le plateau.
 */
function startSound(): void {
  const before = previousAudioRoles();
  const known = new Set(Object.values(before));
  // Virtuelles et Bluetooth écartées, sauf si elles avaient déjà un rôle.
  const outputs = audio.filter((o) => isCabinetCandidate(o) || known.has(o.endpointId));
  if (outputs.length === 0) {
    wizard.sound = undefined;
    wizard.phase = 'summary';
    return;
  }
  const reasons = new Map<string, string>();
  const roles = Object.keys(before).length ? before : proposedAudioRoles(outputs, reasons);
  // Les sorties qui ont un rôle passent en premier : fronton, puis plateau.
  const rank = (o: ObservedAudioOutput) => (o.endpointId === roles.backglass ? 0 : o.endpointId === roles.playfield ? 1 : 2);
  outputs.sort((a, b) => rank(a) - rank(b));
  wizard.sound = { outputs, index: 0, roles, reasons, pairIndex: 0, places: {} };
  wizard.phase = 'sound';
}

/** Rôles du modèle enregistré, ramenés aux sorties actives d'aujourd'hui. */
function previousAudioRoles(): Partial<Record<AudioRole, string>> {
  const saved = previous?.audio;
  if (!saved) return {};
  const match = matchAudioOutputs(saved.outputs, audio);
  const roles: Partial<Record<AudioRole, string>> = {};
  for (const role of AUDIO_ROLES) {
    const id = saved.roles[role.id];
    const output = id ? match.matched.get(id) : undefined;
    if (output) roles[role.id] = output.endpointId;
  }
  return roles;
}

function proposedAudioRoles(outputs: ObservedAudioOutput[], reasons: Map<string, string>): Partial<Record<AudioRole, string>> {
  const roles: Partial<Record<AudioRole, string>> = {};
  const speakerOf = (index: number | undefined) =>
    index === undefined ? undefined : outputs.find((o) => audioScreen(o, displays) === displays[index]);
  const backglass = speakerOf(wizard.assignments.backglass);
  if (backglass) {
    roles.backglass = backglass.endpointId;
    reasons.set(backglass.endpointId, t('haut-parleur de l’écran du fronton'));
  }
  const surround = outputs.filter((o) => o.channels >= 8 && o.endpointId !== roles.backglass);
  const playfield = surround.length === 1 ? surround[0] : speakerOf(wizard.assignments.playfield);
  if (playfield && playfield.endpointId !== roles.backglass) {
    roles.playfield = playfield.endpointId;
    reasons.set(playfield.endpointId, surround.length === 1 ? t('carte 7.1') : t('haut-parleur de l’écran du playfield'));
  }
  return roles;
}

/**
 * Flipper gauche : fronton · flipper droit : plateau · Start : les deux (SSF à une
 * carte) · Exit : aucun rôle, sortie suivante · Retour arrière : sortie précédente.
 */
function handleSoundKey(is: (group: string[]) => boolean): boolean {
  const sound = wizard.sound!;
  const id = sound.outputs[sound.index]!.endpointId;
  const set = (backglass: boolean, playfield: boolean) => {
    for (const [role, wanted] of [['backglass', backglass], ['playfield', playfield]] as const) {
      if (wanted) sound.roles[role] = id;
      else if (sound.roles[role] === id) delete sound.roles[role];
    }
  };
  if (is(KEYS.back)) {
    if (sound.index > 0) sound.index--;
    // Son seul : rien avant la première sortie, Retour arrière propose de quitter sans enregistrer.
    else if (isOnly('son')) askQuit();
    else {
      wizard.sound = undefined;
      startArrangeStep();
    }
    return true;
  }
  if (is(KEYS.previous)) set(true, false);
  else if (is(KEYS.next)) set(false, true);
  else if (is(KEYS.confirm)) set(true, true);
  else if (is(KEYS.exit)) set(false, false);
  else return false;
  if (sound.index + 1 < sound.outputs.length) sound.index++;
  else finishOutputs();
  return true;
}

/** Toutes les sorties ont répondu : test des canaux si la sortie du plateau en annonce assez. */
function finishOutputs(): void {
  const output = playfieldAudio();
  const sound = wizard.sound!;
  sound.pairIndex = 0;
  sound.places = {};
  sound.test = undefined;
  wizard.phase = output && needsChannelTest(output) ? 'channels' : 'summary';
}

/**
 * Une paire de haut-parleurs à la fois : flipper gauche, plateau près du joueur ;
 * flipper droit, plateau côté fronton ; Start, dans le fronton ; Exit, rien entendu.
 */
function handleChannelKey(is: (group: string[]) => boolean): boolean {
  const sound = wizard.sound!;
  const output = playfieldAudio()!;
  const pairs = speakerPairsOf(output);
  if (is(KEYS.back)) {
    if (sound.pairIndex > 0) sound.pairIndex--;
    else wizard.phase = 'sound';
    return true;
  }
  const answers: [string[], SpeakerPlace][] = [
    [KEYS.previous, 'lockbar'],
    [KEYS.next, 'top'],
    [KEYS.confirm, 'backglass'],
    [KEYS.exit, 'none'],
  ];
  const place = answers.find(([keys]) => is(keys))?.[1];
  if (!place) return false;
  sound.places[pairs[sound.pairIndex]!.pair] = place;
  if (sound.pairIndex + 1 < pairs.length) sound.pairIndex++;
  else {
    sound.test = { endpointId: output.endpointId, result: playfieldModeFromTest(sound.places) };
    wizard.phase = 'summary';
  }
  return true;
}

/** Retour arrière depuis le récapitulatif : la dernière question posée. */
function backFromSummary(): void {
  if (isOnly('playfield')) {
    wizard.phase = 'size';
    return;
  }
  if (isOnly('ecrans')) {
    wizard.roleIndex = ROLES.length;
    return goBack();
  }
  const sound = wizard.sound;
  if (!sound) return isOnly('son') ? askQuit() : startArrangeStep();
  const output = playfieldAudio();
  if (output && needsChannelTest(output)) {
    sound.pairIndex = speakerPairsOf(output).length - 1;
    wizard.phase = 'channels';
  } else {
    sound.index = sound.outputs.length - 1;
    wizard.phase = 'sound';
  }
}

function audioById(id: string | undefined): ObservedAudioOutput | undefined {
  return id === undefined ? undefined : audio.find((o) => o.endpointId === id);
}

function playfieldAudio(): ObservedAudioOutput | undefined {
  return audioById(wizard.sound?.roles.playfield);
}

/** Résultat du test des canaux, s'il porte sur la sortie choisie pour le plateau. */
function channelTest(): ChannelTestResult | undefined {
  const sound = wizard.sound;
  return sound?.test && sound.test.endpointId === sound.roles.playfield ? sound.test.result : undefined;
}

/** Remarques de câblage du test des canaux, affichées avec les points à vérifier. */
function channelNotices(): SyncFinding[] {
  return (channelTest()?.notices ?? []).map((message) => ({ severity: 'warning', message }));
}

/** Modèle audio issu de l'étape « Son » ; celui d'avant si elle n'a rien eu à proposer. */
function buildAudio(): CabinetAudio | undefined {
  const sound = wizard.sound;
  if (!sound) return previous?.audio;
  const ids = new Set(Object.values(sound.roles));
  const test = channelTest();
  return {
    outputs: audio.filter((o) => ids.has(o.endpointId)).map((o) => toAudioOutput(o, displays)),
    roles: { ...sound.roles },
    playfieldMode: test?.playfieldMode ?? 'stereo',
    ...(test?.lockbarPair && { lockbarPair: test.lockbarPair }),
  };
}

/** Son à jouer pour l'étape en cours : les bips d'une sortie, d'une paire de haut-parleurs, ou rien. */
function wantedSound(): { kind: string; key: string; [field: string]: unknown } {
  const sound = wizard.sound;
  // Pendant « Quitter sans enregistrer ? » et la sortie : silence.
  if (wizard.quit || wizard.leaving) return { kind: 'stop', key: '' };
  if (wizard.phase === 'sound' && sound) {
    const output = sound.outputs[sound.index]!;
    return { kind: 'output', key: `sortie:${output.endpointId}`, friendlyName: output.friendlyName, beeps: sound.index + 1 };
  }
  const output = playfieldAudio();
  if (wizard.phase === 'channels' && sound && output) {
    const pair = speakerPairsOf(output)[sound.pairIndex]!;
    return {
      kind: 'channel',
      key: `canaux:${output.endpointId}:${pair.pair}`,
      friendlyName: output.friendlyName,
      channels: output.channels,
      left: pair.left,
      right: pair.right,
    };
  }
  return { kind: 'stop', key: '' };
}

/** Envoie le son de l'étape à la première fenêtre, seulement quand il change. */
function updateSound(): void {
  const command = wantedSound();
  const json = JSON.stringify(command);
  if (json === soundSent.json) return;
  soundSent = { json, key: command.key };
  soundStatus = undefined;
  windows.find((w) => !w.isDestroyed())?.webContents.send('sound', command);
}

/** Ce qui a empêché de jouer le son, d'après le compte rendu de la fenêtre des sons. */
function soundNotice(): string | undefined {
  const status = soundStatus;
  if (!status) return undefined;
  if (status.ok) {
    return status.homonyms && status.homonyms > 1
      ? t('{n} sorties portent ce nom : le son peut venir de l’autre, et VPX prendra la dernière.', { n: status.homonyms })
      : undefined;
  }
  switch (status.reason) {
    case 'not-found':
      return t('Electron ne trouve pas cette sortie sous ce nom : aucun son joué. Répondez quand même si vous savez où elle est branchée.');
    case 'no-labels':
      return t('Electron ne donne pas le nom des sorties audio : aucun son joué.');
    case 'channels':
      return t('Electron n’a ouvert que {n} canaux sur cette sortie : ces haut-parleurs ne peuvent pas être testés. Exit : rien entendu.', { n: status.maxChannels ?? 0 });
    default:
      return t('Le son n’a pas pu être joué ({detail}).', { detail: status.detail ?? status.reason ?? '' });
  }
}

/** Rôle actuel d'une sortie, en clair. */
function audioRoleLabel(id: string): string {
  const roles = wizard.sound?.roles ?? {};
  const backglass = roles.backglass === id;
  const playfield = roles.playfield === id;
  return backglass && playfield ? t('fronton et plateau') : backglass ? t('fronton') : playfield ? t('plateau') : t('aucun rôle');
}

/** Lignes du récapitulatif pour le son. */
function audioSummary(): string[] {
  const model = buildAudio();
  if (!model) return [t('Son : aucune sortie audio proposée, étape passée')];
  const line = (role: (typeof AUDIO_ROLES)[number]) => {
    const output = audioById(model.roles[role.id]);
    if (!output) return t('{role} : aucune sortie choisie, sortie par défaut de Windows', { role: role.label });
    const screen = audioScreen(output, displays);
    const where = screen ? t(', écran {n}', { n: displays.indexOf(screen) + 1 }) : '';
    if (role.id === 'backglass') return t('{role} : {output}{where}', { role: role.label, output: output.friendlyName, where });
    const sound3D = vpxSound3D(model, output.channels);
    return t('{role} : {output}{where}, {channels}, {mode} (Sound3D {sound3D})', {
      role: role.label,
      output: output.friendlyName,
      where,
      channels: channelsLabel(output.channels),
      mode: PLAYFIELD_MODE_LABELS[model.playfieldMode],
      sound3D,
    });
  };
  return AUDIO_ROLES.map(line);
}

function goBack(): void {
  wizard.phase = 'assign';
  wizard.notice = undefined;
  wizard.roleIndex = Math.max(0, Math.min(wizard.roleIndex, ROLES.length) - 1);
  // Un rôle passé faute d'écran à proposer (ni affecté, ni « aucun écran ») est sauté aussi en revenant.
  const answered = (i: number) => wizard.assignments[ROLES[i]!.id] !== undefined || wizard.unassigned.has(ROLES[i]!.id);
  while (wizard.roleIndex > 0 && !answered(wizard.roleIndex)) wizard.roleIndex--;
  const role = ROLES[wizard.roleIndex]!;
  wizard.unassigned.delete(role.id);
  const current = wizard.assignments[role.id];
  const zone = role.id === 'playfield' ? undefined : wizard.zones[role.id];
  delete wizard.assignments[role.id];
  if (role.id !== 'playfield') delete wizard.zones[role.id];
  const kind = role.id === 'dmd' ? wizard.dmdKind?.kind : undefined;
  if (role.id === 'dmd') wizard.dmdKind = undefined;
  // Le rôle qui lui avait cédé une part de son écran le retrouve entier.
  for (const r of ANCILLARY_ROLES) if (r !== role.id && wizard.assignments[r] === current) delete wizard.zones[r];
  const at = roleOptions().findIndex((o) => !o.free && o.display === current && (zone ? Boolean(o.zone && sameZone(o.zone, zone)) : !o.zone) && (!kind || !o.dmdKind || o.dmdKind === kind));
  wizard.option = at >= 0 ? at : defaultOption();
}

/**
 * Début de l'assistant, ou de l'étape refaite seule ; Exit au récapitulatif y revient.
 * Une étape seule part du modèle enregistré : rôles, écrans, bord des flippers.
 */
function startMode(): void {
  restart();
  switch (only?.id) {
    case undefined:
    case 'boutons':
      return startButtons(true);
    case 'interface':
      return startCapture(INTERFACE_KEYS, true);
    case 'lanceur':
      return startPlunger();
    case 'disposition':
      return startArrangeOnly();
    case 'ecrans':
      return;
    case 'playfield':
      loadAssignments();
      return startLayout();
    case 'son':
      loadAssignments();
      return startSound();
  }
}

/** Rôles du modèle enregistré, ramenés aux écrans branchés. */
function loadAssignments(): void {
  for (const { id } of ROLES) {
    const fp = previous!.roles[id];
    const index = displays.findIndex((d) => fp && fingerprintOf(d).key === fp);
    if (index >= 0) wizard.assignments[id] = index;
  }
  wizard.zones = structuredClone(previous!.zones ?? {});
  wizard.dmdKind = previous!.dmdKind && { kind: previous!.dmdKind, ...(previous!.zones?.dmd && { zone: previous!.zones.dmd }) };
}

function restart(): void {
  // Les boutons relevés restent : « recommencer » ne refait que les écrans et le son.
  const buttons = wizard ? wizard.buttons : previous?.buttons;
  const navigation = wizard ? wizard.navigation : previous?.navigation;
  const analog = wizard ? wizard.analog : previous?.analog;
  KEYS = wizardKeys({ buttons, navigation });
  stopPlungerTimer();
  wizard = {
    buttons,
    navigation,
    analog,
    sound: undefined,
    phase: 'assign',
    roleIndex: 0,
    option: 0,
    assignments: {},
    zones: {},
    unassigned: new Set(),
    // Après une rotation dans cette session, le bord choisi reste celui de l'image actuelle.
    flipperEdge: wizard?.flipperEdge ?? previousEdge() ?? 'bottom',
    diagonal: DIAGONAL.fallback,
  };
  wizard.option = defaultOption();
}

/** Bord enregistré, ramené à l'orientation actuelle de l'écran du playfield s'il est branché. */
function previousEdge(): FlipperEdge | undefined {
  if (!previous) return undefined;
  const fp = previous.roles.playfield;
  const display = displays.find((d) => fp && fingerprintOf(d).key === fp);
  return display ? currentFlipperEdge(previous, display) : previous.playfield?.flipperEdge;
}

function freeDisplays(): number[] {
  const taken = new Set(Object.values(wizard.assignments));
  return displays.map((_, i) => i).filter((i) => !taken.has(i));
}

/**
 * Une réponse à « quel écran affiche le … ? » : un écran libre entier, ou, pour le
 * DMD, une part d'un écran déjà pris, quand la borne n'a pas d'écran pour lui ou
 * qu'on préfère le regrouper : le bas de l'écran du backglass, ou une incrustation
 * dans le playfield. La fenêtre DMD de VPX superpose le FullDMD (fond) et le DMD
 * de la ROM : la bande du bas se propose aux deux formes.
 */
interface RoleOption {
  display: number;
  /** Absente : l'écran entier. */
  zone?: ScreenZone;
  /** Zone laissée au rôle qui occupait déjà l'écran (le backglass, au-dessus du DMD). */
  host?: { role: AncillaryRoleId; zone: ScreenZone };
  /** Disposition, pour une part d'écran : « … en bas, sous le Backglass (4:1) ». */
  label?: string;
  /** « Placer librement… » : l'éditeur de disposition sur ce rôle, posé d'abord sur cet écran. */
  free?: boolean;
  /** Rôle dmd : FullDMD ou DMD seul, ce que dit cette réponse. */
  dmdKind?: DmdKind;
}

/**
 * Réponses proposées au rôle en cours. Pour un rôle annexe, la dernière est toujours
 * « Placer librement… » : l'éditeur de disposition, puis retour à l'assistant. Sans
 * aucun écran à proposer, le rôle est passé.
 */
function roleOptions(): RoleOption[] {
  const role = ROLES[wizard.roleIndex];
  const options = placedOptions();
  if (role && role.id !== 'playfield' && options.length) options.push({ display: freeTarget(role.id as AncillaryRoleId), label: t('placer librement…'), free: true });
  return options;
}

/** Écran où « Placer librement… » pose d'abord le rôle : le sien enregistré, un écran libre, sinon celui du backglass ou du playfield. */
function freeTarget(role: AncillaryRoleId): number {
  const fp = previous?.roles[role];
  const known = displays.findIndex((d) => fp && fingerprintOf(d).key === fp);
  return known >= 0 ? known : (freeDisplays()[0] ?? wizard.assignments.backglass ?? wizard.assignments.playfield ?? 0);
}

/** Écrans entiers libres et, pour le DMD, les parts d'écran toutes faites. */
function placedOptions(): RoleOption[] {
  const role = ROLES[wizard.roleIndex];
  if (role?.id !== 'dmd') return freeDisplays().map((display) => ({ display }));
  // Un écran large libre : FullDMD sur tout l'écran, ou DMD seul en bande (découpe du panneau
  // des haut-parleurs). Un écran déjà 4:1 : DMD seul.
  const options: RoleOption[] = freeDisplays().flatMap((display): RoleOption[] => {
    const size = displays[display]!.bounds;
    if (Math.max(size.width, size.height) / Math.min(size.width, size.height) >= DMD_RATIO_THRESHOLD) return [{ display, dmdKind: 'dmd' }];
    return [
      { display, dmdKind: 'fulldmd' },
      { display, zone: centeredDmdBand(size), dmdKind: 'dmd', label: t('en bande 4:1 au centre') },
    ];
  });
  const backglass = wizard.assignments.backglass;
  if (backglass !== undefined && !wizard.zones.backglass) {
    const size = displays[backglass]!.bounds;
    for (const [ratio, kind, label] of [
      [4, 'dmd', t('en bas, sous le Backglass (4:1)')],
      [16 / 9, 'fulldmd', t('en bas, sous le Backglass (16:9)')],
    ] as const) {
      const split = splitBackglassDmd(size, ratio);
      options.push({ display: backglass, zone: split.dmd, host: { role: 'backglass', zone: split.backglass }, label, dmdKind: kind });
    }
  }
  const playfield = wizard.assignments.playfield;
  if (playfield !== undefined) {
    const zone = embeddedDmdZone(displays[playfield]!.bounds, wizard.flipperEdge);
    options.push({ display: playfield, zone, label: t('incrusté dans le playfield'), dmdKind: 'dmd' });
  }
  // Disposition enregistrée, peut-être retouchée dans VPX depuis : proposée telle quelle.
  const saved = savedOption(role.id);
  if (saved && !options.some((o) => o.display === saved.display && o.zone && sameZone(o.zone, saved.zone!))) options.push(saved);
  return options;
}

/** Part d'écran enregistrée pour ce rôle, si son écran est encore pris par le même rôle hôte. */
function savedOption(role: AncillaryRoleId): RoleOption | undefined {
  const zone = previous?.zones?.[role];
  const fp = previous?.roles[role];
  const display = displays.findIndex((d) => fp && fingerprintOf(d).key === fp);
  if (!zone || display < 0) return undefined;
  const dmdKind = role === 'dmd' && previous ? dmdKindOf(previous) : undefined;
  if (display === wizard.assignments.playfield) return { display, zone, label: t('incrusté dans le playfield, comme enregistré'), ...(dmdKind && { dmdKind }) };
  if (display !== wizard.assignments.backglass || wizard.zones.backglass) {
    // DMD seul sur son écran, dans une zone placée à la main : proposée telle quelle.
    if (role !== 'dmd' || !freeDisplays().includes(display)) return undefined;
    return { display, zone, label: t('comme enregistré'), ...(dmdKind && { dmdKind }) };
  }
  const host = previous?.zones?.backglass;
  return { display, zone, ...(host && { host: { role: 'backglass' as const, zone: host } }), label: t('sur cet écran avec le Backglass, comme enregistré'), ...(dmdKind && { dmdKind }) };
}

/** Écran (et part d'écran) du rôle dans le modèle existant, sinon le premier écran libre. */
function defaultOption(): number {
  const options = roleOptions();
  const role = ROLES[wizard.roleIndex];
  const fp = role && previous?.roles[role.id];
  const known = displays.findIndex((d) => fp && fingerprintOf(d).key === fp);
  const zone = role && role.id !== 'playfield' ? previous?.zones?.[role.id] : undefined;
  const kind = role?.id === 'dmd' && previous ? dmdKindOf(previous) : undefined;
  const exact = options.findIndex((o) => !o.free && o.display === known && (zone ? Boolean(o.zone && sameZone(o.zone, zone)) : !o.zone) && (!kind || !o.dmdKind || o.dmdKind === kind));
  // Sinon le même écran : la zone du backglass, par exemple, dépend du choix fait ensuite pour le DMD.
  const sameScreen = options.findIndex((o) => !o.free && o.display === known);
  return Math.max(0, exact >= 0 ? exact : sameScreen);
}

/**
 * FullDMD ou DMD seul : la réponse de l'étape des rôles tant que la zone du DMD est celle de
 * cette réponse ; placée ou changée dans l'éditeur, d'après la forme de sa zone.
 */
function wizardDmdKind(roles: Cabinet['roles'], zones: Cabinet['zones']): DmdKind | undefined {
  if (!roles.dmd) return undefined;
  const chosen = wizard.dmdKind;
  if (chosen && sameZone(chosen.zone ?? FULL_ZONE, zones?.dmd ?? FULL_ZONE)) return chosen.kind;
  return dmdKindOf({ version: 1, screens: displays.map(toPhysicalScreen), roles, ...(zones && { zones }), vpx: { iniPath: '' }, updatedAt: '' });
}

/** Nom d'un rôle dans l'assistant : « FullDMD » pour le DMD quand c'en est un (réponse ou forme de sa zone). */
function wizardRoleLabel(role: RoleId): string {
  const label = ROLES.find((r) => r.id === role)!.label;
  if (role !== 'dmd' || wizard.assignments.dmd === undefined) return label;
  const roles = { dmd: fingerprintOf(displays[wizard.assignments.dmd]!).key };
  return dmdKindLabel(wizardDmdKind(roles, wizard.zones.dmd ? { dmd: wizard.zones.dmd } : undefined));
}

function buildCabinet(): Cabinet {
  const roles: Cabinet['roles'] = {};
  for (const [role, index] of Object.entries(wizard.assignments) as [RoleId, number][]) {
    roles[role] = fingerprintOf(displays[index]!).key;
  }
  const audioModel = buildAudio();
  const zones = Object.keys(wizard.zones).length ? { ...wizard.zones } : undefined;
  const dmdKind = wizardDmdKind(roles, zones);
  return {
    version: 1,
    screens: displays.map(toPhysicalScreen),
    roles,
    ...(zones && { zones }),
    ...(dmdKind && { dmdKind }),
    playfield: playfieldLayout(),
    ...(audioModel && { audio: audioModel }),
    ...(wizard.buttons && { buttons: wizard.buttons }),
    ...(wizard.navigation && { navigation: wizard.navigation }),
    ...(wizard.analog && { analog: wizard.analog }),
    vpx: { iniPath: targetIni() },
    updatedAt: new Date().toISOString(),
  };
}

/** Bord des flippers et taille : la taille saisie n'est gardée que si elle diffère de celle de l'EDID. */
function playfieldLayout(): NonNullable<Cabinet['playfield']> {
  const playfield = playfieldDisplay();
  const fromEdid = edidDiagonal(playfield);
  const manualSizeCm = playfield && wizard.diagonal !== fromEdid ? sizeFromDiagonal(wizard.diagonal, playfield) : undefined;
  return { flipperEdge: wizard.flipperEdge, ...(manualSizeCm && { manualSizeCm }) };
}

/**
 * VPinballX.ini que l'assistant va écrire : celui de la configuration active, ou
 * celui de la configuration qu'il va créer (--nouvelle-configuration).
 */
function targetIni(): string {
  if (!NEW_CONFIGURATION || created) return activeVpxIni(loc);
  const draft = { screens: displays.map(toPhysicalScreen) } as Cabinet;
  return configIniPath(loc.vpxIni, addConfiguration(loadCabinetSet(loc.dataDir), draft).configuration);
}

function save(): void {
  const built = buildCabinet();
  const cabinet = NEW_CONFIGURATION && !created ? createConfiguration(loc.dataDir, loc.vpxIni, built, displays) : built;
  if (cabinet === built) saveCabinet(loc.dataDir, cabinet);
  else created = (cabinet as CabinetConfiguration).id;
  previous = cabinet;
  const configuration = loadCabinet(loc.dataDir)!;
  const iniPath = configIniPath(loc.vpxIni, configuration);
  // Enregistrer l'assistant, c'est reprendre la main sur toutes les clés gérées.
  const { plan, report } = syncVpxIni(loc.dataDir, iniPath, cabinet, displays, profile, true, audio);
  wizard.phase = 'done';
  wizard.result = {
    lines: summarizeChanges(plan.changes),
    findings: [
      {
        severity: 'info',
        message: created
          ? t('Nouvelle configuration « {name} », avec son propre VPinballX.ini : renommez-la dans Menu et configuration > Configurations de la borne.', { name: configuration.name })
          : t('Configuration « {name} » mise à jour.', { name: configuration.name }),
      },
      ...channelNotices(),
      ...plan.findings,
    ],
    iniPath,
    backup: report?.backup,
  };
}

/**
 * Version courte du diff pour l'écran : les clés qui décident de l'écran, de
 * l'activation de chaque fenêtre et du cadrage en détail, le reste seulement compté.
 */
function summarizeChanges(changes: VpxChange[], inputDetail = false): string[] {
  if (changes.length === 0) return [t('Aucune modification : VPinballX.ini est déjà à jour.')];
  const inputs = changes.filter((c) => c.section === 'Input');
  const important = changes.filter((c) => c.section !== 'Input' && /(Display|Output|BGSet|ScreenWidth|ScreenHeight|CabinetAutofitMode|SoundDevice|SoundDeviceBG|Sound3D)$/.test(c.key));
  const others = changes.length - important.length - inputs.length;
  const lines = formatChanges(important);
  if (inputDetail) lines.push(...inputLines(inputs));
  else if (inputs.length) lines.push(tn(inputs.length, '+ {n} touche des boutons ([Input] Mapping.*)', '+ {n} touches des boutons ([Input] Mapping.*)'));
  if (others > 0) lines.push(tn(others, '+ {n} réglage de position, de taille, de plein écran ou de plugin', '+ {n} réglages de position, de taille, de plein écran ou de plugin'));
  return lines;
}

/** Clés [Input] modifiées, regroupées par valeur : « LeftFlipper, LeftStagedFlipper, UILeft → Key;4 ». */
function inputLines(changes: VpxChange[]): string[] {
  const byValue = new Map<string, string[]>();
  for (const c of changes) byValue.set(c.value, [...(byValue.get(c.value) ?? []), c.key.replace(/^Mapping\./, '')]);
  return [...byValue].map(([value, actions]) => `[Input] ${actions.join(', ')} → ${value || t('(défaut de VPX)')}`);
}

/** Relance l'application sans --assistant : elle ouvre alors le menu des tables. */
function continueToTables(): boolean {
  relaunchCovered(process.argv.slice(1).filter((a) => !WIZARD_FLAGS.includes(a)));
  return true;
}

/** Fin de l'autopilote. */
function quit(): boolean {
  stopCountdown();
  stopButtonsCountdown();
  stopQuitCountdown();
  stopHold();
  restoreOrientation();
  app.quit();
  return true;
}

/** Comme Windows : une orientation non confirmée n'est pas gardée. */
function restoreOrientation(): void {
  const flip = wizard.flip;
  const index = wizard.assignments.playfield;
  wizard.flip = undefined;
  if (flip && index !== undefined && !SIMULATED_ORIENTATION) {
    try {
      setDisplayOrientation(displays[index]!.gdiName, flip.from);
    } catch {
      // On quitte quand même : l'assistant pourra être relancé.
    }
  }
}

/** Ce que doit afficher l'écran n° index, selon l'étape de l'assistant. */
/**
 * Parts de cet écran à dessiner pendant l'affectation des rôles : celles déjà
 * attribuées, et celle de la disposition proposée (avec la part qu'elle laisse au
 * rôle hôte). En fractions de l'image Windows, jamais pivotées : comme dans VPX.
 */
// ---------------------------------------------------------------------------
// Étape « Disposition » (arrange.ts) : la zone de chaque rôle sur son écran.

function arrangeHost(): ArrangeHost {
  return { displays, assignments: wizard.assignments, zones: wizard.zones, keys: KEYS, roleLabel: wizardRoleLabel };
}

/** Après les rôles, ou en revenant du son : l'éditeur, sur « Terminer » pour passer d'un Start. */
function startArrangeStep(): void {
  wizard.phase = 'arrange';
  wizard.notice = undefined;
  wizard.arrange ??= startArrange(arrangeHost());
}

/** --disposition : rôles et zones du modèle enregistré, ramenés aux écrans branchés. */
function startArrangeOnly(): void {
  loadAssignments();
  wizard.flipperEdge = previousEdge() ?? 'bottom';
  wizard.phase = 'arrange';
  wizard.arrange = startArrange(arrangeHost(), t('Enregistrer'));
}

function afterArrange(outcome: ArrangeOutcome): void {
  if (wizard.free) return afterFreePlacement(outcome);
  if (outcome === 'done') {
    if (arrangeOnly) saveStep();
    else startSound();
  } else if (outcome === 'back') {
    // Disposition seule : rien avant l'éditeur, Exit propose de quitter sans enregistrer.
    if (arrangeOnly) askQuit();
    else {
      wizard.arrange = undefined;
      wizard.phase = 'assign';
      wizard.roleIndex = ROLES.length;
      goBack();
    }
  }
}

/**
 * « Placer librement… » sur un rôle annexe : l'éditeur de disposition, ce rôle choisi,
 * posé d'abord sur freeTarget ; « Revenir à l'assistant » garde la disposition et passe
 * au rôle suivant, Exit revient à la question telle qu'elle était.
 */
function startFreePlacement(role: AncillaryRoleId, display: number): void {
  wizard.free = { role, option: wizard.option, assignments: { ...wizard.assignments }, zones: structuredClone(wizard.zones), dmdKind: wizard.dmdKind };
  // Placé à la main : FullDMD ou DMD seul d'après la forme donnée à sa zone.
  if (role === 'dmd') wizard.dmdKind = undefined;
  wizard.assignments[role] = display;
  wizard.unassigned.delete(role);
  // Sa place enregistrée sur ce même écran, sinon l'écran entier.
  const saved = previous?.zones?.[role];
  if (saved && previous?.roles[role] === fingerprintOf(displays[display]!).key) wizard.zones[role] = saved;
  else delete wizard.zones[role];
  wizard.phase = 'arrange';
  wizard.notice = undefined;
  // Ce rôle choisi, le curseur sur la ligne « Zone ».
  wizard.arrange = startArrange(arrangeHost(), t('Revenir à l’assistant'), { role, item: 'role' });
}

function afterFreePlacement(outcome: ArrangeOutcome): void {
  const free = wizard.free!;
  if (outcome !== 'done' && outcome !== 'back') return;
  wizard.free = undefined;
  wizard.arrange = undefined;
  wizard.phase = 'assign';
  if (outcome === 'back') {
    wizard.assignments = free.assignments;
    wizard.zones = free.zones;
    wizard.dmdKind = free.dmdKind;
    wizard.option = free.option;
    return;
  }
  // « Aucun écran » choisi dans l'éditeur : le rôle n'a pas d'écran.
  if (wizard.assignments[free.role] === undefined) wizard.unassigned.add(free.role);
  nextRole();
}

/** Ce que la synchronisation dira de la disposition en cours (chevauchements, incrustation couchée…). */
function arrangeFindings(): SyncFinding[] {
  const preview = arrangeOnly ? arrangeCabinet() : buildCabinet();
  const observed: Partial<Record<RoleId, ObservedDisplay>> = {};
  for (const [role, i] of Object.entries(wizard.assignments) as [RoleId, number][]) observed[role] = displays[i]!;
  return zoneFindings(preview, observed);
}

/**
 * Modèle enregistré, avec les rôles et les zones de l'éditeur ; les écrans branchés
 * s'y ajoutent. Un rôle dont l'écran est seulement débranché garde son écran : seul
 * « Aucun écran », choisi sur un écran branché, le retire.
 */
function arrangeCabinet(): Cabinet {
  const saved = previous!;
  const observed = new Set(displays.map((d) => fingerprintOf(d).key));
  const roles: Cabinet['roles'] = {};
  for (const [role, fp] of Object.entries(saved.roles) as [RoleId, string][]) if (!observed.has(fp)) roles[role] = fp;
  for (const [role, index] of Object.entries(wizard.assignments) as [RoleId, number][]) roles[role] = fingerprintOf(displays[index]!).key;
  const known = new Set(saved.screens.map((sc) => sc.fingerprint));
  const screens = [...saved.screens, ...displays.map(toPhysicalScreen).filter((sc) => !known.has(sc.fingerprint))];
  const zones = Object.keys(wizard.zones).length ? { ...wizard.zones } : undefined;
  // Le fichier de la configuration active, comme pour les boutons seuls.
  const next: Cabinet = { ...saved, screens, roles, zones, vpx: { iniPath: activeVpxIni(loc) }, updatedAt: new Date().toISOString() };
  // Zone du DMD inchangée : son type aussi (une configuration ambiguë reste à trancher) ; changée : sa forme.
  const dmdKind = dmdKindAfterArrange(saved, next);
  if (dmdKind) next.dmdKind = dmdKind;
  else delete next.dmdKind;
  return next;
}

function zonesView(index: number, option: RoleOption | undefined) {
  if (wizard.phase !== 'assign') return [];
  const role = ROLES[wizard.roleIndex];
  const parts: { label: string; zone: ScreenZone; candidate: boolean }[] = [];
  const proposed = option?.display === index && option.zone ? option : undefined;
  for (const r of ANCILLARY_ROLES) {
    if (wizard.assignments[r] !== index) continue;
    const zone = (proposed?.host?.role === r ? proposed.host.zone : wizard.zones[r]) ?? (proposed ? FULL_ZONE : undefined);
    if (zone) parts.push({ label: wizardRoleLabel(r), zone, candidate: false });
  }
  if (proposed && role) parts.push({ label: proposed.dmdKind ? dmdKindLabel(proposed.dmdKind) : role.label, zone: proposed.zone!, candidate: true });
  return parts;
}

function viewFor(index: number) {
  const d = displays[index]!;
  const fp = fingerprintOf(d);
  // Premier rôle de l'écran (le playfield avant un DMD incrusté, le backglass avant le DMD du bas).
  const shown = (Object.entries(wizard.assignments) as [RoleId, number][]).filter(([, i]) => i === index).map(([r]) => r);
  const assignedRole = shown[0];
  const role = ROLES[wizard.roleIndex];
  const option = wizard.phase === 'assign' ? roleOptions()[wizard.option] : undefined;
  const base = {
    number: index + 1,
    color: COLORS[index % COLORS.length],
    name: describeDisplay(d),
    details:
      fp.strength === 'strong'
        ? t('{gdi} · {vpx} · empreinte forte', { gdi: d.gdiName, vpx: vpxDisplayId(d, profile.displayIdFormat) })
        : t('{gdi} · {vpx} · empreinte faible', { gdi: d.gdiName, vpx: vpxDisplayId(d, profile.displayIdFormat) }),
    // Rôle (identifiant) qui décide du panneau du récapitulatif dans screen.js.
    assignedRole,
    assignedLabel: shown.length ? formatList(shown.map(wizardRoleLabel)) : undefined,
    zones: zonesView(index, option),
    phase: wizard.phase,
    notice: wizard.notice,
    // Dès que le bord des flippers est connu, le playfield s'affiche droit pour le joueur.
    rotation: assignedRole === 'playfield' && wizard.phase !== 'assign' ? edgeRotation(wizard.flipperEdge) : 0,
  };

  // Sortie sans enregistrer : l'écran de sortie couvre tout, l'étape n'a plus rien à montrer
  // (une orientation remise n'a plus de compte à rebours).
  if (wizard.leaving) return { ...base, highlight: false, report: false, prompt: '', step: '', hint: '', notice: undefined };

  if (CAPTURE_PHASES.includes(wizard.phase)) return buttonsView(index, base);
  if (wizard.phase === 'plunger') return plungerViewFor(index, base);

  if (wizard.phase === 'orient' || wizard.phase === 'flip' || wizard.phase === 'size') {
    const isPlayfield = assignedRole === 'playfield';
    if (!isPlayfield) return { ...base, highlight: false, prompt: '', step: t('Réglage du playfield en cours') };
    if (wizard.phase === 'orient') {
      const edge = wizard.flipperEdge;
      const vpxEdge = vpxFlipperEdge(d, edge);
      // VPX ne sait pas tourner ses tables de ce côté : Start tourne l'écran dans Windows.
      const fix = wizard.keepEdge === edge ? undefined : vpxOrientationFix(d, edge);
      if (fix && wizard.flipWarning === edge) {
        const names = frontendNames(otherFrontends);
        const flip = fix.delta === 180;
        return {
          ...base,
          highlight: true,
          prompt: flip ? t('Retourner l’écran dans Windows ?') : t('Tourner l’écran dans Windows ?'),
          step: t("Flippers {edge} de l'image Windows", { edge: EDGE_LABELS[edge] }),
          notice:
            otherFrontends.length > 1
              ? t('{names} sont installés sur ce PC. L’orientation de l’écran est un réglage de Windows : la changer met aussi leurs tables et leur menu à l’envers.', { names })
              : t('{names} est installé sur ce PC. L’orientation de l’écran est un réglage de Windows : la changer met aussi ses tables et son menu à l’envers.', { names }),
          hint: flip
            ? t('Start : retourner l’écran quand même · Exit : garder l’orientation de Windows (tables à l’envers dans Cyber Pinball)')
            : t('Start : tourner l’écran quand même · Exit : garder l’orientation de Windows (tables à l’envers dans Cyber Pinball)'),
        };
      }
      return {
        ...base,
        highlight: true,
        prompt: t('Où sont les flippers ?'),
        step: t("Flippers {edge} de l'image Windows", { edge: EDGE_LABELS[edge] }),
        notice:
          base.notice ??
          (vpxEdge === edge
            ? undefined
            : fix
              ? fix.delta === 180
                ? t('VPX afficherait les tables flippers {edge} : Start retourne l’écran dans Windows pour les mettre de votre côté.', { edge: EDGE_LABELS[vpxEdge] })
                : t('VPX afficherait les tables flippers {edge} : Start tourne l’écran dans Windows pour les mettre de votre côté.', { edge: EDGE_LABELS[vpxEdge] })
              : t('VPX affichera les tables flippers {edge}, à l’envers pour vous.', { edge: EDGE_LABELS[vpxEdge] })),
        hint: t('Flippers : tourner jusqu’à lire ce texte à l’endroit, la bande de votre côté · Start : {confirm} · Exit : revenir', {
          confirm: fix ? t('retourner l’écran pour VPX') : t('valider'),
        }),
      };
    }
    if (wizard.phase === 'flip') {
      const flip = wizard.flip!;
      const seconds = Math.max(0, Math.ceil((flip.deadline - Date.now()) / 1000));
      return {
        ...base,
        highlight: true,
        prompt: flip.turn === 180 ? t('Écran retourné') : t('Écran tourné'),
        measure: `${seconds} s`,
        step: t('Les tables auront leurs flippers de votre côté. Ce texte est-il toujours à l’endroit ?'),
        notice: base.notice ?? t('Sans réponse, retour à l’orientation d’origine dans {n} s.', { n: seconds }),
        hint: t('Start : garder cette orientation · Exit : revenir à l’orientation d’origine'),
      };
    }
    const fromEdid = edidDiagonal(d);
    return {
      ...base,
      highlight: true,
      prompt: t('Diagonale de l’écran'),
      measure: `${wizard.diagonal}″`,
      step:
        fromEdid === undefined
          ? t('L’écran ne donne pas sa taille : indiquez la diagonale de l’image, en pouces.')
          : wizard.diagonal === fromEdid
            ? t('{cm} cm, taille annoncée par l’écran. Vérifiez-la : certains téléviseurs se trompent.', { cm: Math.round(wizard.diagonal * 2.54) })
            : t('{cm} cm. L’écran annonce {inches}″.', { cm: Math.round(wizard.diagonal * 2.54), inches: fromEdid }),
      hint: t('Flippers : moins / plus · Start : valider · Exit : revenir'),
    };
  }

  if (wizard.phase === 'arrange' && wizard.arrange) {
    const host = arrangeHost();
    // Le panneau va sur l'écran que le joueur regarde : celui du playfield.
    const panelHere = index === (wizard.assignments.playfield ?? 0);
    return {
      ...base,
      zones: arrangeZones(host, wizard.arrange, index),
      highlight: panelHere,
      prompt: panelHere ? '' : (base.assignedLabel ?? t('Aucun rôle')),
      step: panelHere ? '' : t('Disposition des écrans en cours'),
      hint: '',
      notice: undefined,
      arrange: panelHere ? { ...arrangePanel(host, wizard.arrange, (codes) => formatList(codes.map(keyLabel).slice(0, 2), 'or')), findings: arrangeFindings() } : undefined,
    };
  }

  if ((wizard.phase === 'sound' || wizard.phase === 'channels') && wizard.sound) {
    return soundView(index, base, assignedRole);
  }

  if (wizard.phase === 'assign' && role) {
    const placed = roleOptions().some((o) => o.zone);
    // Rôle dmd : la réponse dit FullDMD ou DMD seul.
    const named = option?.dmdKind ? dmdKindLabel(option.dmdKind) : role.label;
    return {
      ...base,
      highlight: option?.display === index,
      prompt: option?.free
        ? t('{role} : placer librement…', { role: role.label })
        : option?.label
          ? t('{role} {option} ?', { role: named, option: option.label })
          : t('{role} ?', { role: named }),
      step: option?.free
        ? t('Étape {n} sur {total} : l’éditeur de disposition, pour placer le {role} où vous voulez, puis retour ici.', { n: wizard.roleIndex + 1, total: ROLES.length, role: role.label })
        : option?.dmdKind === 'fulldmd'
          ? t('Étape {n} sur {total} : un FullDMD montre l’image du jeu sur tout l’écran, son DMD incrusté.', { n: wizard.roleIndex + 1, total: ROLES.length })
          : option?.dmdKind === 'dmd'
            ? t('Étape {n} sur {total} : un DMD seul montre le DMD du jeu, du noir autour.', { n: wizard.roleIndex + 1, total: ROLES.length })
            : role.id === 'dmd'
              ? t('Étape {n} sur {total} : quel écran affiche le DMD ou le FullDMD ?', { n: wizard.roleIndex + 1, total: ROLES.length })
              : t('Étape {n} sur {total} : quel écran affiche le {role} ?', { n: wizard.roleIndex + 1, total: ROLES.length, role: role.label }),
      hint: t('{flippers} · Start : {confirm} · Exit : {exit}', {
        flippers: placed
          ? role.required
            ? t("Flippers : changer d'écran ou de disposition")
            : t("Flippers : changer d'écran ou de disposition, ou placer librement")
          : role.required
            ? t("Flippers : changer d'écran")
            : t("Flippers : changer d'écran, ou placer librement"),
        confirm: option?.free ? t('ouvrir l’éditeur') : t('valider'),
        exit: role.required ? t('quitter sans enregistrer ?') : t('aucun écran pour ce rôle'),
      }),
    };
  }

  const preview = only ? stepCabinet(previous!, stepBuilt(), only, isOnly('ecrans') && wizard.layoutAsked ? ['playfield'] : []) : buildCabinet();
  // Étape seule : seulement ses clés, comme à l'enregistrement.
  const plan = wizard.phase === 'summary' ? planVpxSync(preview, displays, readTextIfExists(preview.vpx.iniPath), profile, { audio, ...(only && { overwriteManual: only.owns, only: only.owns }) }) : undefined;
  const rolesLines = ROLES.map((r) => {
    const i = wizard.assignments[r.id];
    if (i === undefined) return t('{role} : aucun écran', { role: r.label });
    const name = wizardRoleLabel(r.id);
    const zone = r.id === 'playfield' ? undefined : wizard.zones[r.id];
    const rect = zone && zoneRect(zone, displays[i]!.bounds);
    const part = !rect
      ? ''
      : i === wizard.assignments.playfield
        ? t(', incrusté ({width} × {height} en {x}, {y})', { width: rect.width, height: rect.height, x: rect.x, y: rect.y })
        : t(', zone {width} × {height} en {x}, {y}', { width: rect.width, height: rect.height, x: rect.x, y: rect.y });
    return t('{role} : écran {n}, {screen}{part}', { role: name, n: i + 1, screen: describeDisplay(displays[i]!), part });
  });
  const playfield = playfieldDisplay();
  const playfieldLines = playfield
    ? [
        t("Flippers {edge} de l'image, {view}, diagonale {inches}″", {
          edge: EDGE_LABELS[wizard.flipperEdge],
          view: isCabinetView(playfield, wizard.flipperEdge) ? t('vue borne') : t('vue bureau'),
          inches: wizard.diagonal,
        }),
      ]
    : [];
  const summary = only ? stepSummary(rolesLines, playfieldLines) : [...rolesLines, ...playfieldLines, ...audioSummary(), ...buttonsSummary(), ...(wizard.analog ? analogLines(wizard.analog) : [])];

  if (wizard.phase === 'summary') {
    const owned = plan!.changes;
    return {
      ...base,
      summary,
      ...(only && { title: only.label, columns: { left: summaryColumn(), right: t('Modifications prévues') } }),
      lines: summarizeChanges(owned),
      findings: [...channelNotices(), ...plan!.findings],
      target: preview.vpx.iniPath,
      hint: only
        ? t('Start : enregistrer ({step} seulement) · Exit : recommencer l’étape · Retour arrière : revenir', { step: only.label.toLowerCase() })
        : t('Start : enregistrer et écrire VPinballX.ini · Exit : recommencer'),
    };
  }

  if (only) {
    // Boutons seuls : l'écran que le joueur regarde n'est pas connu, le résultat s'affiche partout.
    const previousLayout = buttonsOnly || interfaceOnly || arrangeOnly || isOnly('lanceur');
    return {
      ...base,
      ...(previousLayout && { rotation: index === previousPlayfieldIndex() ? edgeRotation(previousEdge() ?? 'bottom') : 0 }),
      report: buttonsOnly || interfaceOnly || isOnly('lanceur') || index === (wizard.assignments.playfield ?? 0),
      name: '',
      details: '',
      title: only.saved,
      columns: { left: summaryColumn(), right: t('Modifications écrites') },
      summary,
      lines: wizard.result?.lines ?? [],
      findings: wizard.result?.findings ?? [],
      target: wizard.result?.iniPath,
      backup: wizard.result?.backup,
      hint: t("N'importe quel bouton : revenir au menu"),
    };
  }

  return {
    ...base,
    summary,
    lines: wizard.result?.lines ?? [],
    findings: wizard.result?.findings ?? [],
    target: wizard.result?.iniPath,
    backup: wizard.result?.backup,
    hint: t("N'importe quel bouton : continuer vers les tables"),
  };
}

/** Colonne de gauche du récapitulatif et du résultat d'une étape seule. */
function summaryColumn(): string {
  return buttonsOnly ? t('Boutons') : interfaceOnly ? t('Interface') : isOnly('lanceur') ? t('Lanceur') : isOnly('son') ? t('Son') : isOnly('playfield') ? 'Playfield' : t('Rôles');
}

/** Ce que l'étape seule a décidé, pour le récapitulatif et le résultat. */
function stepSummary(rolesLines: string[], playfieldLines: string[]): string[] {
  switch (only!.id) {
    case 'boutons':
      return buttonLines(GAME_KEYS, buttonKeys(wizard.buttons));
    case 'interface':
      return buttonLines(INTERFACE_KEYS, navigationButtons(inForce()));
    case 'lanceur':
      return analogLines(wizard.analog ?? {});
    case 'disposition':
      return rolesLines;
    case 'ecrans':
      return [...rolesLines, ...(wizard.layoutAsked ? playfieldLines : [t('Bord des flippers et diagonale : inchangés, même écran de playfield')])];
    case 'playfield':
      return playfieldLines.length ? playfieldLines : [t('Aucun écran de playfield branché')];
    case 'son':
      return audioSummary();
  }
}

/**
 * Étapes « Son » et « Canaux » : la question s'affiche sur le playfield, que le
 * joueur regarde ; l'écran dont la sortie est le haut-parleur s'allume aussi.
 */
function soundView(index: number, base: { notice?: string } & Record<string, unknown>, assignedRole: RoleId | undefined) {
  const sound = wizard.sound!;
  const output = wizard.phase === 'sound' ? sound.outputs[sound.index]! : playfieldAudio()!;
  const speaker = audioScreen(output, displays);
  if (assignedRole !== 'playfield') {
    const isSpeaker = speaker === displays[index];
    return { ...base, highlight: isSpeaker, prompt: isSpeaker ? t('Haut-parleur de cet écran') : '', step: t('Réglage du son en cours') };
  }
  const where = speaker ? t(' · haut-parleur de l’écran {n}', { n: displays.indexOf(speaker) + 1 }) : '';
  const details = `${output.bus || t('bus inconnu')} · ${output.channels ? channelsLabel(output.channels) : t('canaux inconnus')}${where}${output.isDefault ? t(' · sortie par défaut de Windows') : ''}`;
  const notice = base.notice ?? soundNotice();

  if (wizard.phase === 'sound') {
    const beeps = sound.index + 1;
    const reason = sound.reasons.get(output.endpointId);
    return {
      ...base,
      highlight: true,
      measure: '♪'.repeat(Math.min(beeps, 6)) + (beeps > 6 ? ` ${beeps}` : ''),
      prompt: t('Sortie {n} sur {total}', { n: beeps, total: sound.outputs.length }),
      name: output.friendlyName,
      details,
      notice,
      step: tn(beeps, '{n} bip : où l’entendez-vous ? Actuellement : {role}{reason}.', '{n} bips : où l’entendez-vous ? Actuellement : {role}{reason}.', {
        role: audioRoleLabel(output.endpointId),
        reason: reason ? t(' (proposé : {reason})', { reason }) : '',
      }),
      hint: t('Flipper gauche : fronton · Flipper droit : plateau · Start : les deux · Exit : aucun, sortie suivante'),
    };
  }

  const pairs = speakerPairsOf(output);
  const pair = pairs[sound.pairIndex]!;
  const answered = pairs
    .slice(0, sound.pairIndex)
    .map((p) => t('{pair} : {place}', { pair: p.label, place: SPEAKER_PLACE_LABELS[sound.places[p.pair] ?? 'none'] }))
    .join(' · ');
  return {
    ...base,
    highlight: true,
    measure: pair.label,
    prompt: t('Haut-parleurs {n} sur {total}', { n: sound.pairIndex + 1, total: pairs.length }),
    name: describeAudioOutput(output),
    details,
    notice,
    step: t('Un bip à gauche, puis un plus aigu à droite : où sont ces haut-parleurs ?{answered}', { answered: answered ? ` (${answered})` : '' }),
    hint: t('Flipper gauche : plateau, près de vous · Flipper droit : plateau, côté fronton · Start : dans le fronton · Exit : rien entendu'),
  };
}

function broadcast(): void {
  updateSound();
  windows.forEach((win, i) => {
    if (!win.isDestroyed()) win.webContents.send('state', { ...viewFor(i), quit: quitView() });
  });
}
