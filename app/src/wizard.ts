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
  buttonInfo,
  buttonKeys,
  buttonProblems,
  buttonsToTry,
  NAVIGATION_BUTTONS,
  IniDocument,
  keyLabel,
  loadOwnedMemory,
  navigationKeys,
  refusedKey,
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
  embeddedDmdZone,
  sameZone,
  splitBackglassDmd,
  zoneRect,
  FULL_ZONE,
  type AncillaryRoleId,
  type ScreenZone,
  type ButtonId,
  type CabinetButtons,
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
import { createWindow, OFFSCREEN, windowRect } from './offscreen';
import { locations, vpxProfile } from './paths';
import { activeVpxIni, audioOutputs, syncVpxIni } from './vpx-ini';
import { coverDisplay } from './cover-display';
import { LayoutReport } from './layout-check';
import { arrangeAction, arrangeKey, arrangePanel, arrangeZones, startArrange, type ArrangeAction, type ArrangeHost, type ArrangeOutcome, type ArrangeState } from './arrange';
import { relaunchCovered } from './screen-guard';

const COLORS = ['#ff3d7f', '#22d3ee', '#facc15', '#a3e635', '#c084fc', '#fb923c'];

/**
 * Touches de l'assistant : celles des boutons de la borne (flippers, Start, Exit),
 * les touches par défaut des encodeurs tant qu'ils n'ont pas été relevés, plus les
 * flèches, Entrée, Échap et Retour arrière d'un clavier.
 */
function wizardKeys(buttons: CabinetButtons | undefined) {
  const taken = new Set(Object.values(buttonKeys(buttons)));
  return { ...navigationKeys(buttons, false), back: taken.has('Backspace') ? [] : ['Backspace'] };
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
  /** Touches des boutons en vigueur : celles du modèle, puis celles relevées. Absentes : touches par défaut. */
  buttons?: CabinetButtons;
  /** Étape « Boutons » en cours. */
  capture?: ButtonCapture;
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
  notice?: string;
  /** Étape « Son » ; absente tant qu'elle n'a pas commencé ou s'il n'y a aucune sortie à proposer. */
  sound?: SoundStep;
  /** Le bord des flippers et la diagonale ont été demandés dans cette session. */
  layoutAsked?: boolean;
  /** Rôles auxquels on a répondu « aucun écran » dans cette session. */
  unassigned: Set<RoleId>;
  /** « Placer librement… » : l'éditeur de disposition ouvert sur ce rôle, et l'état d'avant pour revenir. */
  free?: { role: AncillaryRoleId; option: number; assignments: Partial<Record<RoleId, number>>; zones: Partial<Record<RoleId, ScreenZone>> };
  /** « Quitter sans enregistrer ? » ouvert : ce qui serait perdu, et la fin du délai de réponse. */
  quit?: { lines: string[]; deadline: number };
  /** Sortie sans enregistrer en cours : où l'on va. */
  leaving?: string;
  result?: { lines: string[]; findings: SyncFinding[]; iniPath: string; backup?: string };
}

interface ButtonCapture {
  /** Bouton demandé, indice dans BUTTONS. */
  index: number;
  keys: CabinetButtons;
  /** Boutons répondus : relevés, ou passés (pas de bouton sur la borne). */
  answered: Set<ButtonId>;
  /** Fin du délai de 20 s ; plus de délai dès qu'un bouton a été pressé ou qu'on a cliqué. */
  deadline?: number;
  /** Dernier bouton relevé ou passé, rappelé sous la question suivante. */
  last?: string;
  /** Touche refusée et pourquoi. */
  refused?: string;
  /** Touches qui n'ont pas à être essayées (buttonsToTry) : celles en vigueur à l'arrivée, ou celles des encodeurs choisies. */
  reference: CabinetButtons;
  /**
   * Récapitulatif : choix aux flippers (une action de SUMMARY_ACTIONS, puis un bouton
   * de BUTTONS à refaire), boutons de navigation essayés, message.
   */
  action: number;
  tried: Set<ButtonId>;
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
let quitCountdown: NodeJS.Timeout | undefined;
/** Étape refaite seule (--boutons, --son…) : le modèle existe, le reste est gardé. */
let only: WizardStep | undefined;
const isOnly = (id: WizardStepId) => only?.id === id;
/** Mode --boutons : le modèle existe, seule l'étape « Boutons » est refaite. */
let buttonsOnly = false;
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
export function startWizard(): void {
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
    // Une touche relâchée hors de la fenêtre n'arrive jamais : elle n'est plus tenue pour maintenue.
    win.on('blur', () => releaseKeys());
    win.loadFile(path.join(__dirname, '..', 'renderer', 'screen.html'));
    win.once('ready-to-show', () => win.show());
    return win;
  });
  windows[displays.findIndex((d) => d.primary)]?.focus();
  // Une rotation change la géométrie des écrans : chaque fenêtre reprend le sien.
  screen.on('display-metrics-changed', () => placeWindows());

  const autopilot = process.env.CYBERPINBALL_AUTOPILOT;
  if (autopilot) void runAutopilot(autopilot.split(','), process.env.CYBERPINBALL_CAPTURE);
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
      await windows[Number(screenNo) - 1]?.webContents.executeJavaScript(`(async () => {
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
  if (wizard.phase === 'buttons') handleButtonKey(input);
  else handleButtonsSummaryKey(input);
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

/** Touches Exit connues : celles de l'assistant, et celle déjà relevée pendant le relevé. */
function exitKeys(): string[] {
  const recorded = wizard.capture?.keys.exit;
  return [...KEYS.exit, ...(recorded ? [recorded] : [])];
}

function confirmKeys(): string[] {
  const recorded = wizard.capture?.keys.start;
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
  const keys = capture?.answered.size ? { ...buttonKeys(wizard.buttons), ...capture.keys } : wizard.buttons;
  if (keys && keys !== previous?.buttons) draft.buttons = keys;
  if (arrangeOnly) {
    const arranged = arrangeCabinet();
    draft.roles = arranged.roles;
    draft.zones = arranged.zones;
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
  }
  if (wizard.layoutAsked && playfieldDisplay()) draft.playfield = playfieldLayout();
  if (wizard.sound) draft.audio = buildAudio();
  return draft;
}

function pendingChanges(): string[] {
  const lines = cabinetChanges(previous, draftCabinet());
  if (wizard.flip) lines.push('Écran du playfield : remis dans son orientation d’origine');
  return lines;
}

/** Bouton, question et sortie : sur chaque écran, à chaque étape. */
function quitView() {
  if (wizard.leaving) return { leaving: wizard.leaving };
  if (wizard.phase === 'done') return undefined;
  const elapsed = held ? Date.now() - held.at : 0;
  const holding = held && elapsed >= HOLD_SHOWN_MS && (held.answering || !wizard.quit) ? Math.max(1, Math.ceil((held.ms - elapsed) / 1000)) : undefined;
  const quit = wizard.quit;
  const label = (codes: string[]) => [...new Set(codes)].slice(0, 2).map(keyLabel).join(' ou ');
  return {
    button: holding === undefined ? 'Quitter sans enregistrer' : `Maintenu : ${quit ? 'quitter' : 'quitter sans enregistrer ?'} dans ${holding} s`,
    holding: holding !== undefined,
    dialog: quit && {
      title: 'Quitter sans enregistrer ?',
      lines: quit.lines.length ? quit.lines : ['Rien n’a été changé.'],
      lead: quit.lines.length ? 'Ce qui ne sera pas enregistré :' : '',
      destination: quitDestination(previous !== undefined).text,
      hint: `Start (${label(confirmKeys())}) : oui · Exit (${label([...exitKeys(), ...KEYS.back])}) : non · le même geste encore : oui · sans réponse dans ${Math.max(0, Math.ceil((quit.deadline - Date.now()) / 1000))} s : on continue`,
    },
  };
}

// ---------------------------------------------------------------------------
// Étape « Boutons »
//
// Dès qu'il y a des touches en vigueur (modèle enregistré, ou --boutons), l'étape
// s'ouvre sur le récapitulatif : chaque bouton avec sa touche, et un bouton se refait
// seul (clic sur sa ligne, ou flippers puis Start). Sur une nouvelle borne, relevé
// bouton par bouton, la touche en vigueur rappelée en retrait. Une erreur se corrige
// sans les boutons de la borne : clic sur une ligne, Retour arrière ou « Précédent »,
// « Touches par défaut » et « Tout relever ». Au récapitulatif, les flippers, Start et
// Exit dont la touche vient d'être relevée doivent avoir été essayés avant de valider
// (buttonsToTry) : un mauvais relevé ne peut pas être enregistré sans que le joueur
// s'en aperçoive ; les touches gardées ou celles des encodeurs n'ont pas à l'être.

/** Actions du récapitulatif, choisies aux flippers ou à la souris. */
const SUMMARY_ACTIONS = ['save', 'previous', 'defaults', 'restart'] as const;
type ButtonsAction = (typeof SUMMARY_ACTIONS)[number];

/** « Relevé : … » après « Touches par défaut ». */
const DEFAULTS_LAST = 'touches par défaut des encodeurs';


/** Ce que la souris envoie depuis screen.js. */
type WizardAction = { type: 'button'; index: number } | { type: 'buttons'; action: ButtonsAction } | { type: 'quit'; op: 'ask' | 'yes' | 'no' } | ArrangeAction;

/**
 * Arrivée sur l'étape : le récapitulatif des touches en vigueur s'il y en a (ou en
 * --boutons, où ce sont au pire celles des encodeurs), sinon le relevé du premier
 * bouton. Délai de 20 s, sauf en --boutons où l'on est venu exprès. « Tout relever » :
 * relevé complet, rien de gardé.
 */
function startButtons(initial = false): void {
  const keep = initial && (wizard.buttons !== undefined || buttonsOnly);
  const keys = keep ? buttonKeys(wizard.buttons) : {};
  const timed = initial && !(keep && buttonsOnly);
  wizard.phase = keep ? 'buttonsSummary' : 'buttons';
  wizard.capture = {
    index: 0,
    keys,
    answered: new Set(keep ? BUTTONS.map((b) => b.id) : []),
    reference: { ...keys },
    action: 0,
    tried: new Set(),
    ...(timed && { deadline: Date.now() + BUTTONS_TIMEOUT_MS }),
  };
  stopButtonsCountdown();
  if (!timed) return;
  buttonsCountdown = setInterval(() => {
    const deadline = wizard.capture?.deadline;
    if ((wizard.phase !== 'buttons' && wizard.phase !== 'buttonsSummary') || deadline === undefined) stopButtonsCountdown();
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
 * Le bouton demandé envoie cette touche. Refusée si un autre bouton l'a déjà ou si
 * VPX ne sait pas la lire ; Exit, une fois relevé, passe un bouton facultatif ;
 * Retour arrière revient au bouton précédent, ou au récapitulatif si l'on refaisait
 * un seul bouton.
 */
function handleButtonKey(input: Input): void {
  const capture = wizard.capture!;
  if (input.isAutoRepeat) return; // bouton maintenu
  touched(capture);
  const code = input.code;
  if (code === PREVIOUS_KEY) return previousButton();
  const button = BUTTONS[capture.index]!;
  if (!button.required && code === capture.keys.exit) {
    delete capture.keys[button.id];
    capture.last = `${button.label} : pas de bouton`;
  } else {
    const holder = BUTTONS.find((b) => b.id !== button.id && capture.keys[b.id] === code);
    capture.refused = holder
      ? `${keyLabel(code)} est déjà la touche du bouton ${holder.label} : appuyez sur un autre bouton, ou cliquez sur ${holder.label} pour le refaire.`
      : refusedKey(code);
    if (capture.refused) return;
    // Une autre touche : l'essai de ce bouton est à refaire.
    if (capture.keys[button.id] !== code) capture.tried.delete(button.id);
    capture.keys[button.id] = code;
    capture.last = `${button.label} : ${keyLabel(code)}`;
  }
  capture.answered.add(button.id);
  nextButton(capture);
}

/** Bouton suivant sans réponse (après celui-ci, puis depuis le début) ; tous répondus : récapitulatif. */
function nextButton(capture: ButtonCapture): void {
  const order = [...BUTTONS.keys()].map((i) => (capture.index + 1 + i) % BUTTONS.length);
  const next = order.find((i) => !capture.answered.has(BUTTONS[i]!.id));
  if (next === undefined) enterButtonsSummary(capture);
  else capture.index = next;
}

/** Récapitulatif, curseur sur « Valider » ; les essais des touches inchangées restent acquis. */
function enterButtonsSummary(capture: ButtonCapture): void {
  wizard.phase = 'buttonsSummary';
  capture.action = 0;
}

/** Tous les boutons ont leur réponse : on refait un seul bouton, depuis le récapitulatif. */
function redoingOne(capture: ButtonCapture): boolean {
  return BUTTONS.every((b) => capture.answered.has(b.id));
}

/** Refaire ce bouton seul : les autres gardent leur touche, puis retour au récapitulatif. */
function redoButton(capture: ButtonCapture, index: number): void {
  if (!BUTTONS[index]) return;
  capture.index = index;
  wizard.phase = 'buttons';
}

/** Retour arrière ou « Précédent » : le bouton d'avant ; depuis le récapitulatif, le dernier. */
function previousButton(): void {
  const capture = wizard.capture!;
  if (wizard.phase === 'buttons' && redoingOne(capture)) return enterButtonsSummary(capture);
  if (wizard.phase === 'buttonsSummary') capture.index = BUTTONS.length - 1;
  else capture.index = Math.max(0, capture.index - 1);
  wizard.phase = 'buttons';
}

/**
 * Récapitulatif : chaque bouton de navigation relevé est essayé. Les flippers
 * choisissent une action ou un bouton à refaire, Start lance ce choix, Exit est
 * seulement essayé. Les flèches et Entrée d'un clavier choisissent et lancent aussi,
 * sans compter comme essai.
 */
function handleButtonsSummaryKey(input: Input): void {
  const capture = wizard.capture!;
  if (input.isAutoRepeat) return;
  touched(capture);
  const code = input.code;
  const keys = capture.keys;
  const choices = SUMMARY_ACTIONS.length + BUTTONS.length;
  const move = (step: number) => (capture.action = (capture.action + step + choices) % choices);
  const run = () =>
    capture.action < SUMMARY_ACTIONS.length ? runButtonsAction(SUMMARY_ACTIONS[capture.action]!) : redoButton(capture, capture.action - SUMMARY_ACTIONS.length);
  const button = NAVIGATION_BUTTONS.find((id) => keys[id] === code);
  if (button) capture.tried.add(button);
  if (button === 'leftFlipper') move(-1);
  else if (button === 'rightFlipper') move(1);
  else if (button === 'start') run();
  else if (button === 'exit') return;
  else if (code === PREVIOUS_KEY) previousButton();
  else if (code === 'ArrowLeft' || code === 'ArrowUp') move(-1);
  else if (code === 'ArrowRight' || code === 'ArrowDown') move(1);
  else if (code === 'Enter' || code === 'NumpadEnter') run();
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
  const capture = wizard.capture;
  if (!capture || (wizard.phase !== 'buttons' && wizard.phase !== 'buttonsSummary')) return;
  touched(capture);
  if (action.type === 'button') redoButton(capture, action.index);
  else runButtonsAction(action.action);
  broadcast();
}

function runButtonsAction(action: ButtonsAction): void {
  const capture = wizard.capture!;
  switch (action) {
    case 'previous':
      return previousButton();
    case 'restart':
      return startButtons();
    case 'defaults':
      // Les touches des encodeurs : connues, elles s'enregistrent sans essai.
      capture.keys = buttonKeys(undefined);
      capture.reference = { ...capture.keys };
      capture.answered = new Set(BUTTONS.map((b) => b.id));
      capture.last = DEFAULTS_LAST;
      return enterButtonsSummary(capture);
    case 'save': {
      if (wizard.phase !== 'buttonsSummary') return;
      const problems = buttonProblems(capture.keys);
      const untried = buttonsToTry(capture.keys, capture.reference).filter((id) => !capture.tried.has(id));
      if (problems.length) capture.notice = `Impossible de valider : ${problems.join(' ; ')}.`;
      else if (untried.length) capture.notice = `Essayez d’abord sur la borne : ${untried.map((id) => buttonInfo(id).label).join(', ')}.`;
      else acceptButtons();
    }
  }
}

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
    ? 'Boutons : aucun bouton pressé, touches actuelles gardées.'
    : 'Boutons : aucun bouton pressé, touches par défaut des encodeurs gardées.';
  broadcast();
}

/** Valider au récapitulatif : ces touches pilotent la suite de l'assistant. */
function acceptButtons(): void {
  wizard.buttons = { ...wizard.capture!.keys };
  KEYS = wizardKeys(wizard.buttons);
  wizard.capture = undefined;
  if (buttonsOnly) saveStep();
  else wizard.phase = 'assign';
}

/**
 * Étape refaite seule : le modèle garde tout le reste (stepCabinet, core), et
 * VPinballX.ini ne reprend la main que sur les clés de l'étape ; les autres clés
 * changées à la main restent en attente.
 */
function saveStep(): void {
  const step = only!;
  // Écrans et rôles : le bord des flippers et la diagonale, s'ils ont été redemandés.
  const extra: CabinetField[] = isOnly('ecrans') && wizard.layoutAsked ? ['playfield'] : [];
  const cabinet = stepCabinet(previous!, stepBuilt(), step, extra);
  saveCabinet(loc.dataDir, cabinet);
  previous = cabinet;
  // Seulement les clés de l'étape, reprises en main même changées à la main ; les autres restent telles quelles.
  const { plan, report } = syncVpxIni(loc.dataDir, cabinet.vpx.iniPath, cabinet, displays, profile, step.owns, cabinet.audio ? audio : undefined, step.owns);
  wizard.phase = 'done';
  wizard.result = {
    lines: summarizeChanges(plan.changes, buttonsOnly),
    findings: [
      ...(isOnly('son') ? channelNotices() : []),
      ...plan.findings.filter((f) => f.severity !== 'info' || (buttonsOnly && f.message.startsWith('Touches de VPX'))),
    ],
    iniPath: cabinet.vpx.iniPath,
    backup: report?.backup,
  };
}

/**
 * Ce que l'étape seule a décidé, dans un modèle complet : stepCabinet n'en garde que
 * ses champs. Le fichier est celui de la configuration active, dans le dossier de cet
 * emplacement (celui du bac à sable avec CYBERPINBALL_HOME).
 */
function stepBuilt(): Cabinet {
  if (buttonsOnly) return { ...previous!, buttons: wizard.buttons, vpx: { iniPath: activeVpxIni(loc) }, updatedAt: new Date().toISOString() };
  if (arrangeOnly) return arrangeCabinet();
  return buildCabinet();
}

/** Actions de VPX qui perdraient leur touche, d'après le VPinballX.ini actuel. */
function silencedPreview(keys: CabinetButtons): string[] {
  const iniPath = activeVpxIni(loc);
  const plan = vpxInputSettings(keys, IniDocument.parse(readTextIfExists(iniPath)), loadOwnedMemory(loc.dataDir, iniPath));
  return plan.silenced.map((s) => `${s.label} (${keyLabel(keys[s.button])})`);
}

/** Ligne des boutons dans le récapitulatif de l'assistant complet. */
function buttonsSummary(): string {
  const keys = buttonKeys(wizard.buttons);
  const main = NAVIGATION_BUTTONS.map((id) => keyLabel(keys[id])).join(', ');
  const optional = BUTTONS.filter((b) => !b.required && keys[b.id]).length;
  return wizard.buttons
    ? `Boutons relevés : flippers, Start, Exit sur ${main} ; ${optional} bouton${optional > 1 ? 's' : ''} facultatif${optional > 1 ? 's' : ''}`
    : `Boutons : touches par défaut des encodeurs (${main}…), [Input] de VPX inchangé`;
}

/** Lignes « bouton : touche » de l'écran final ; les boutons absents de la borne sur une seule ligne. */
function buttonLines(keys: CabinetButtons | undefined): string[] {
  const all = buttonKeys(keys);
  const missing = BUTTONS.filter((b) => !all[b.id]).map((b) => b.label);
  return [
    ...BUTTONS.filter((b) => all[b.id]).map((b) => `${b.label} : ${keyLabel(all[b.id])}`),
    ...(missing.length ? [`Pas de bouton : ${missing.join(', ')}`] : []),
  ];
}

/** Écran qui était le playfield : la question s'y affiche droite pour le joueur. */
function previousPlayfieldIndex(): number {
  const fp = previous?.roles.playfield;
  return displays.findIndex((d) => fp && fingerprintOf(d).key === fp);
}

const ACTION_LABELS: Record<ButtonsAction, string> = {
  save: 'Valider',
  previous: '◀ Précédent',
  defaults: 'Touches par défaut',
  restart: 'Tout relever',
};

/**
 * Étape « Boutons » : même écran partout, on ne sait pas encore lequel le joueur
 * regarde. La liste de tous les boutons et les actions sont cliquables.
 */
function buttonsView(index: number, base: Record<string, unknown>) {
  const capture = wizard.capture!;
  const summary = wizard.phase === 'buttonsSummary';
  const rotation = index === previousPlayfieldIndex() ? edgeRotation(previousEdge() ?? 'bottom') : 0;
  // Pas encore relevé : la touche en vigueur, en retrait.
  const inForce = buttonKeys(wizard.buttons);
  const list = BUTTONS.map((b, i) => {
    const code = capture.keys[b.id];
    const answered = capture.answered.has(b.id);
    return {
      label: b.label,
      key: code ? keyLabel(code) : answered ? 'pas de bouton' : inForce[b.id] ? keyLabel(inForce[b.id]) : b.required ? '' : 'facultatif',
      state: !summary && i === capture.index ? 'current' : answered ? 'done' : 'todo',
      selected: summary && capture.action === SUMMARY_ACTIONS.length + i,
      tried: summary && capture.tried.has(b.id),
    };
  });
  const actions = (summary ? SUMMARY_ACTIONS : (['previous', 'defaults', 'restart'] as const)).map((id, i) => ({
    id,
    label: id === 'save' && buttonsOnly ? 'Enregistrer' : ACTION_LABELS[id],
    selected: summary && i === capture.action,
  }));
  const common = { ...base, rotation, highlight: true, name: '', details: '', buttons: list, actions };

  if (summary) {
    const keys = capture.keys;
    const toTry = buttonsToTry(keys, capture.reference);
    const tried = toTry.map((id) => `${buttonInfo(id).label} ${capture.tried.has(id) ? '✓' : '○'}`).join(' · ');
    const silenced = silencedPreview(keys);
    const seconds = capture.deadline === undefined ? undefined : Math.max(0, Math.ceil((capture.deadline - Date.now()) / 1000));
    return {
      ...common,
      prompt: toTry.length ? 'Essayez les boutons' : 'Boutons de la borne',
      details: silenced.length ? `Perdent leur touche dans VPX : ${silenced.join(', ')}` : 'Les autres touches de VPX ne changent pas.',
      notice: capture.notice ?? (buttonProblems(keys).join(' ; ') || (seconds === undefined ? undefined : `Sans réponse dans ${seconds} s : touches actuelles gardées.`)),
      step: toTry.length
        ? `Essai des touches relevées : ${tried}`
        : `${capture.last === DEFAULTS_LAST ? 'Touches par défaut des encodeurs' : capture.last ? `Relevé : ${capture.last}` : 'Touches actuelles'} · choisissez un bouton pour lui donner une autre touche.`,
      hint: `Flippers (${keyLabel(keys.leftFlipper)} / ${keyLabel(keys.rightFlipper)}) : choisir · Start (${keyLabel(keys.start)}) : lancer${toTry.includes('exit') ? ` · Exit (${keyLabel(keys.exit)}) : à essayer aussi` : ''} · Clic ou Start sur un bouton : le refaire`,
    };
  }

  const button = BUTTONS[capture.index]!;
  const required = BUTTONS.filter((b) => b.required).length;
  const current = buttonKeys(wizard.buttons)[button.id];
  const seconds = capture.deadline === undefined ? undefined : Math.max(0, Math.ceil((capture.deadline - Date.now()) / 1000));
  return {
    ...common,
    prompt: 'Appuyez sur le bouton',
    measure: button.label,
    name: button.required ? `Bouton ${capture.index + 1} sur ${required}` : `Bouton facultatif ${capture.index + 1 - required} sur ${BUTTONS.length - required}`,
    details: `Touche ${wizard.buttons ? 'actuelle' : 'par défaut'} : ${current ? keyLabel(current) : 'aucune'}`,
    notice:
      capture.refused ??
      (seconds === undefined
        ? undefined
        : `Sans réponse dans ${seconds} s : ${wizard.buttons ? 'touches actuelles gardées' : 'touches par défaut des encodeurs gardées (Maj, 1, Échap…)'}.`),
    step: capture.last ? `Relevé : ${capture.last}` : 'Chaque bouton une seule fois ; la suite de l’assistant se pilote avec eux.',
    hint: `${button.required ? '' : `Exit (${keyLabel(capture.keys.exit)}) : la borne n’a pas ce bouton · `}Clic sur un bouton : le refaire · Retour arrière : ${redoingOne(capture) ? 'annuler' : 'bouton précédent'}`,
  };
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
    } else if (is(KEYS.confirm)) confirmEdge();
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
  const done = await changeOrientation(index, fix.rotation, 'Rotation de l’écran du playfield…');
  const turn = rotationDelta(displays[index]!.rotation, from);
  wizard.flipperEdge = edgeAfterRotation(edge, turn);
  if (!done || turn === 0) {
    // Le bord suit l'image réellement affichée, même si Windows s'est arrêté en route.
    wizard.keepEdge = wizard.flipperEdge;
    wizard.notice ??= 'Windows n’a pas tourné l’écran. Start : continuer quand même.';
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
  const done = await changeOrientation(index, flip.from, 'Retour à l’orientation d’origine…');
  // Le bord suit l'image réellement affichée, revenue ou non.
  wizard.flipperEdge = edgeAfterRotation(flip.edge, rotationDelta(displays[index]!.rotation, flip.from));
  wizard.keepEdge = wizard.flipperEdge;
  if (done) {
    wizard.notice = `${timedOut ? 'Pas de réponse : orientation' : 'Orientation'} d’origine rétablie. Start : continuer, tables à l’envers pour vous.`;
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
    wizard.notice = `${(err as Error).message} Start : continuer quand même.`;
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
    reasons.set(backglass.endpointId, 'haut-parleur de l’écran du fronton');
  }
  const surround = outputs.filter((o) => o.channels >= 8 && o.endpointId !== roles.backglass);
  const playfield = surround.length === 1 ? surround[0] : speakerOf(wizard.assignments.playfield);
  if (playfield && playfield.endpointId !== roles.backglass) {
    roles.playfield = playfield.endpointId;
    reasons.set(playfield.endpointId, surround.length === 1 ? 'carte 7.1' : 'haut-parleur de l’écran du playfield');
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
      ? `${status.homonyms} sorties portent ce nom : le son peut venir de l’autre, et VPX prendra la dernière.`
      : undefined;
  }
  switch (status.reason) {
    case 'not-found':
      return 'Electron ne trouve pas cette sortie sous ce nom : aucun son joué. Répondez quand même si vous savez où elle est branchée.';
    case 'no-labels':
      return 'Electron ne donne pas le nom des sorties audio : aucun son joué.';
    case 'channels':
      return `Electron n’a ouvert que ${status.maxChannels} canaux sur cette sortie : ces haut-parleurs ne peuvent pas être testés. Exit : rien entendu.`;
    default:
      return `Le son n’a pas pu être joué (${status.detail ?? status.reason}).`;
  }
}

/** Rôle actuel d'une sortie, en clair. */
function audioRoleLabel(id: string): string {
  const roles = wizard.sound?.roles ?? {};
  const backglass = roles.backglass === id;
  const playfield = roles.playfield === id;
  return backglass && playfield ? 'fronton et plateau' : backglass ? 'fronton' : playfield ? 'plateau' : 'aucun rôle';
}

/** Lignes du récapitulatif pour le son. */
function audioSummary(): string[] {
  const model = buildAudio();
  if (!model) return ['Son : aucune sortie audio proposée, étape passée'];
  const line = (role: (typeof AUDIO_ROLES)[number]) => {
    const output = audioById(model.roles[role.id]);
    if (!output) return `${role.label} : aucune sortie choisie, sortie par défaut de Windows`;
    const screen = audioScreen(output, displays);
    const where = screen ? `, écran ${displays.indexOf(screen) + 1}` : '';
    if (role.id === 'backglass') return `${role.label} : ${output.friendlyName}${where}`;
    const sound3D = vpxSound3D(model, output.channels);
    return `${role.label} : ${output.friendlyName}${where}, ${channelsLabel(output.channels)}, ${PLAYFIELD_MODE_LABELS[model.playfieldMode]} (Sound3D ${sound3D})`;
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
  // Le rôle qui lui avait cédé une part de son écran le retrouve entier.
  for (const r of ANCILLARY_ROLES) if (r !== role.id && wizard.assignments[r] === current) delete wizard.zones[r];
  const at = roleOptions().findIndex((o) => !o.free && o.display === current && (zone ? Boolean(o.zone && sameZone(o.zone, zone)) : !o.zone));
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
}

function restart(): void {
  // Les boutons relevés restent : « recommencer » ne refait que les écrans et le son.
  const buttons = wizard ? wizard.buttons : previous?.buttons;
  KEYS = wizardKeys(buttons);
  wizard = {
    buttons,
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
}

/**
 * Réponses proposées au rôle en cours. Pour un rôle annexe, la dernière est toujours
 * « Placer librement… » : l'éditeur de disposition, puis retour à l'assistant. Sans
 * aucun écran à proposer, le rôle est passé.
 */
function roleOptions(): RoleOption[] {
  const role = ROLES[wizard.roleIndex];
  const options = placedOptions();
  if (role && role.id !== 'playfield' && options.length) options.push({ display: freeTarget(role.id as AncillaryRoleId), label: 'placer librement…', free: true });
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
  const options: RoleOption[] = freeDisplays().map((display) => ({ display }));
  if (role?.id !== 'dmd') return options;
  const backglass = wizard.assignments.backglass;
  if (backglass !== undefined && !wizard.zones.backglass) {
    const size = displays[backglass]!.bounds;
    for (const [ratio, label] of [
      [4, 'en bas, sous le Backglass (4:1)'],
      [16 / 9, 'en bas, sous le Backglass (FullDMD 16:9)'],
    ] as const) {
      const split = splitBackglassDmd(size, ratio);
      options.push({ display: backglass, zone: split.dmd, host: { role: 'backglass', zone: split.backglass }, label });
    }
  }
  const playfield = wizard.assignments.playfield;
  if (playfield !== undefined) {
    const zone = embeddedDmdZone(displays[playfield]!.bounds, wizard.flipperEdge);
    options.push({ display: playfield, zone, label: 'incrusté dans le playfield' });
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
  if (display === wizard.assignments.playfield) return { display, zone, label: 'incrusté dans le playfield, comme enregistré' };
  if (display !== wizard.assignments.backglass || wizard.zones.backglass) return undefined;
  const host = previous?.zones?.backglass;
  return { display, zone, ...(host && { host: { role: 'backglass' as const, zone: host } }), label: 'sur cet écran avec le Backglass, comme enregistré' };
}

/** Écran (et part d'écran) du rôle dans le modèle existant, sinon le premier écran libre. */
function defaultOption(): number {
  const options = roleOptions();
  const role = ROLES[wizard.roleIndex];
  const fp = role && previous?.roles[role.id];
  const known = displays.findIndex((d) => fp && fingerprintOf(d).key === fp);
  const zone = role && role.id !== 'playfield' ? previous?.zones?.[role.id] : undefined;
  const exact = options.findIndex((o) => !o.free && o.display === known && (zone ? Boolean(o.zone && sameZone(o.zone, zone)) : !o.zone));
  // Sinon le même écran : la zone du backglass, par exemple, dépend du choix fait ensuite pour le DMD.
  const sameScreen = options.findIndex((o) => !o.free && o.display === known);
  return Math.max(0, exact >= 0 ? exact : sameScreen);
}

function buildCabinet(): Cabinet {
  const roles: Cabinet['roles'] = {};
  for (const [role, index] of Object.entries(wizard.assignments) as [RoleId, number][]) {
    roles[role] = fingerprintOf(displays[index]!).key;
  }
  const audioModel = buildAudio();
  return {
    version: 1,
    screens: displays.map(toPhysicalScreen),
    roles,
    ...(Object.keys(wizard.zones).length && { zones: { ...wizard.zones } }),
    playfield: playfieldLayout(),
    ...(audioModel && { audio: audioModel }),
    ...(wizard.buttons && { buttons: wizard.buttons }),
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
          ? `Nouvelle configuration « ${configuration.name} », avec son propre VPinballX.ini : renommez-la dans Menu et configuration > Configurations de la borne.`
          : `Configuration « ${configuration.name} » mise à jour.`,
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
  if (changes.length === 0) return ['Aucune modification : VPinballX.ini est déjà à jour.'];
  const inputs = changes.filter((c) => c.section === 'Input');
  const important = changes.filter((c) => c.section !== 'Input' && /(Display|Output|BGSet|ScreenWidth|ScreenHeight|CabinetAutofitMode|SoundDevice|SoundDeviceBG|Sound3D)$/.test(c.key));
  const others = changes.length - important.length - inputs.length;
  const lines = formatChanges(important);
  if (inputDetail) lines.push(...inputLines(inputs));
  else if (inputs.length) lines.push(`+ ${inputs.length} touche${inputs.length > 1 ? 's' : ''} des boutons ([Input] Mapping.*)`);
  if (others > 0) lines.push(`+ ${others} réglage${others > 1 ? 's' : ''} de position, de taille, de plein écran ou de plugin`);
  return lines;
}

/** Clés [Input] modifiées, regroupées par valeur : « LeftFlipper, LeftStagedFlipper, UILeft → Key;4 ». */
function inputLines(changes: VpxChange[]): string[] {
  const byValue = new Map<string, string[]>();
  for (const c of changes) byValue.set(c.value, [...(byValue.get(c.value) ?? []), c.key.replace(/^Mapping\./, '')]);
  return [...byValue].map(([value, actions]) => `[Input] ${actions.join(', ')} → ${value || '(défaut de VPX)'}`);
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
  return { displays, assignments: wizard.assignments, zones: wizard.zones, keys: KEYS };
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
  wizard.arrange = startArrange(arrangeHost(), 'Enregistrer');
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
  wizard.free = { role, option: wizard.option, assignments: { ...wizard.assignments }, zones: structuredClone(wizard.zones) };
  wizard.assignments[role] = display;
  wizard.unassigned.delete(role);
  // Sa place enregistrée sur ce même écran, sinon l'écran entier.
  const saved = previous?.zones?.[role];
  if (saved && previous?.roles[role] === fingerprintOf(displays[display]!).key) wizard.zones[role] = saved;
  else delete wizard.zones[role];
  wizard.phase = 'arrange';
  wizard.notice = undefined;
  // Ce rôle choisi, le curseur sur la ligne « Zone ».
  wizard.arrange = startArrange(arrangeHost(), 'Revenir à l’assistant', { role, item: 'role' });
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
  return { ...saved, screens, roles, zones, vpx: { iniPath: activeVpxIni(loc) }, updatedAt: new Date().toISOString() };
}

function zonesView(index: number, option: RoleOption | undefined) {
  if (wizard.phase !== 'assign') return [];
  const role = ROLES[wizard.roleIndex];
  const parts: { label: string; zone: ScreenZone; candidate: boolean }[] = [];
  const proposed = option?.display === index && option.zone ? option : undefined;
  for (const r of ANCILLARY_ROLES) {
    if (wizard.assignments[r] !== index) continue;
    const zone = (proposed?.host?.role === r ? proposed.host.zone : wizard.zones[r]) ?? (proposed ? FULL_ZONE : undefined);
    if (zone) parts.push({ label: ROLES.find((x) => x.id === r)!.label, zone, candidate: false });
  }
  if (proposed && role) parts.push({ label: role.label, zone: proposed.zone!, candidate: true });
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
    details: `${d.gdiName} · ${vpxDisplayId(d, profile.displayIdFormat)} · empreinte ${fp.strength === 'strong' ? 'forte' : 'faible'}`,
    assignedRole: assignedRole ? ROLES.find((r) => r.id === assignedRole)!.label : undefined,
    assignedLabel: shown.length ? shown.map((r) => ROLES.find((x) => x.id === r)!.label).join(' et ') : undefined,
    zones: zonesView(index, option),
    phase: wizard.phase,
    notice: wizard.notice,
    // Dès que le bord des flippers est connu, le playfield s'affiche droit pour le joueur.
    rotation: assignedRole === 'playfield' && wizard.phase !== 'assign' ? edgeRotation(wizard.flipperEdge) : 0,
  };

  // Sortie sans enregistrer : l'écran de sortie couvre tout, l'étape n'a plus rien à montrer
  // (une orientation remise n'a plus de compte à rebours).
  if (wizard.leaving) return { ...base, highlight: false, report: false, prompt: '', step: '', hint: '', notice: undefined };

  if (wizard.phase === 'buttons' || wizard.phase === 'buttonsSummary') return buttonsView(index, base);

  if (wizard.phase === 'orient' || wizard.phase === 'flip' || wizard.phase === 'size') {
    const isPlayfield = assignedRole === 'playfield';
    if (!isPlayfield) return { ...base, highlight: false, prompt: '', step: 'Réglage du playfield en cours' };
    if (wizard.phase === 'orient') {
      const edge = wizard.flipperEdge;
      const vpxEdge = vpxFlipperEdge(d, edge);
      // VPX ne sait pas tourner ses tables de ce côté : Start tourne l'écran dans Windows.
      const fix = wizard.keepEdge === edge ? undefined : vpxOrientationFix(d, edge);
      const turn = fix?.delta === 180 ? 'retourne' : 'tourne';
      return {
        ...base,
        highlight: true,
        prompt: 'Où sont les flippers ?',
        step: `Flippers ${EDGE_LABELS[edge]} de l'image Windows`,
        notice:
          base.notice ??
          (vpxEdge === edge
            ? undefined
            : fix
              ? `VPX afficherait les tables flippers ${EDGE_LABELS[vpxEdge]} : Start ${turn} l’écran dans Windows pour les mettre de votre côté.`
              : `VPX affichera les tables flippers ${EDGE_LABELS[vpxEdge]}, à l’envers pour vous.`),
        hint: `Flippers : tourner jusqu’à lire ce texte à l’endroit, la bande de votre côté · Start : ${fix ? 'retourner l’écran pour VPX' : 'valider'} · Exit : revenir`,
      };
    }
    if (wizard.phase === 'flip') {
      const flip = wizard.flip!;
      const seconds = Math.max(0, Math.ceil((flip.deadline - Date.now()) / 1000));
      return {
        ...base,
        highlight: true,
        prompt: flip.turn === 180 ? 'Écran retourné' : 'Écran tourné',
        measure: `${seconds} s`,
        step: 'Les tables auront leurs flippers de votre côté. Ce texte est-il toujours à l’endroit ?',
        notice: base.notice ?? `Sans réponse, retour à l’orientation d’origine dans ${seconds} s.`,
        hint: 'Start : garder cette orientation · Exit : revenir à l’orientation d’origine',
      };
    }
    const fromEdid = edidDiagonal(d);
    return {
      ...base,
      highlight: true,
      prompt: 'Diagonale de l’écran',
      measure: `${wizard.diagonal}″`,
      step:
        fromEdid === undefined
          ? 'L’écran ne donne pas sa taille : indiquez la diagonale de l’image, en pouces.'
          : wizard.diagonal === fromEdid
            ? `${Math.round(wizard.diagonal * 2.54)} cm, taille annoncée par l’écran. Vérifiez-la : certains téléviseurs se trompent.`
            : `${Math.round(wizard.diagonal * 2.54)} cm. L’écran annonce ${fromEdid}″.`,
      hint: 'Flippers : moins / plus · Start : valider · Exit : revenir',
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
      prompt: panelHere ? '' : (base.assignedLabel ?? 'Aucun rôle'),
      step: panelHere ? '' : 'Disposition des écrans en cours',
      hint: '',
      notice: undefined,
      arrange: panelHere ? { ...arrangePanel(host, wizard.arrange, (codes) => codes.map(keyLabel).slice(0, 2).join(' ou ')), findings: arrangeFindings() } : undefined,
    };
  }

  if ((wizard.phase === 'sound' || wizard.phase === 'channels') && wizard.sound) {
    return soundView(index, base, assignedRole);
  }

  if (wizard.phase === 'assign' && role) {
    const placed = roleOptions().some((o) => o.zone);
    return {
      ...base,
      highlight: option?.display === index,
      prompt: option?.free ? `${role.label} : placer librement…` : option?.label ? `${role.label} ${option.label} ?` : `${role.label} ?`,
      step: option?.free
        ? `Étape ${wizard.roleIndex + 1} sur ${ROLES.length} : l’éditeur de disposition, pour placer le ${role.label} où vous voulez, puis retour ici.`
        : `Étape ${wizard.roleIndex + 1} sur ${ROLES.length} : quel écran affiche le ${role.label} ?`,
      hint: `Flippers : changer d'écran${placed ? ' ou de disposition' : ''}${role.required ? '' : ', ou placer librement'} · Start : ${option?.free ? 'ouvrir l’éditeur' : 'valider'} · Exit : ${role.required ? 'quitter sans enregistrer ?' : 'aucun écran pour ce rôle'}`,
    };
  }

  const preview = only ? stepCabinet(previous!, stepBuilt(), only, isOnly('ecrans') && wizard.layoutAsked ? ['playfield'] : []) : buildCabinet();
  // Étape seule : seulement ses clés, comme à l'enregistrement.
  const plan = wizard.phase === 'summary' ? planVpxSync(preview, displays, readTextIfExists(preview.vpx.iniPath), profile, { audio, ...(only && { overwriteManual: only.owns, only: only.owns }) }) : undefined;
  const rolesLines = ROLES.map((r) => {
    const i = wizard.assignments[r.id];
    if (i === undefined) return `${r.label} : aucun écran`;
    const zone = r.id === 'playfield' ? undefined : wizard.zones[r.id];
    const rect = zone && zoneRect(zone, displays[i]!.bounds);
    const part = !rect ? '' : i === wizard.assignments.playfield ? `, incrusté (${rect.width} × ${rect.height} en ${rect.x}, ${rect.y})` : `, zone ${rect.width} × ${rect.height} en ${rect.x}, ${rect.y}`;
    return `${r.label} : écran ${i + 1}, ${describeDisplay(displays[i]!)}${part}`;
  });
  const playfield = playfieldDisplay();
  const playfieldLines = playfield ? [`Flippers ${EDGE_LABELS[wizard.flipperEdge]} de l'image, ${isCabinetView(playfield, wizard.flipperEdge) ? 'vue borne' : 'vue bureau'}, diagonale ${wizard.diagonal}″`] : [];
  const summary = only ? stepSummary(rolesLines, playfieldLines) : [...rolesLines, ...playfieldLines, ...audioSummary(), buttonsSummary()];

  if (wizard.phase === 'summary') {
    const owned = plan!.changes;
    return {
      ...base,
      summary,
      ...(only && { title: only.label, columns: { left: summaryColumn(), right: 'Modifications prévues' } }),
      lines: summarizeChanges(owned),
      findings: [...channelNotices(), ...plan!.findings],
      target: preview.vpx.iniPath,
      hint: only
        ? `Start : enregistrer (${only.label.toLowerCase()} seulement) · Exit : recommencer l’étape · Retour arrière : revenir`
        : 'Start : enregistrer et écrire VPinballX.ini · Exit : recommencer',
    };
  }

  if (only) {
    // Boutons seuls : l'écran que le joueur regarde n'est pas connu, le résultat s'affiche partout.
    const previousLayout = buttonsOnly || arrangeOnly;
    return {
      ...base,
      ...(previousLayout && { rotation: index === previousPlayfieldIndex() ? edgeRotation(previousEdge() ?? 'bottom') : 0 }),
      report: buttonsOnly || index === (wizard.assignments.playfield ?? 0),
      name: '',
      details: '',
      title: only.saved,
      columns: { left: summaryColumn(), right: 'Modifications écrites' },
      summary,
      lines: wizard.result?.lines ?? [],
      findings: wizard.result?.findings ?? [],
      target: wizard.result?.iniPath,
      backup: wizard.result?.backup,
      hint: "N'importe quel bouton : revenir au menu",
    };
  }

  return {
    ...base,
    summary,
    lines: wizard.result?.lines ?? [],
    findings: wizard.result?.findings ?? [],
    target: wizard.result?.iniPath,
    backup: wizard.result?.backup,
    hint: "N'importe quel bouton : continuer vers les tables",
  };
}

/** Colonne de gauche du récapitulatif et du résultat d'une étape seule. */
function summaryColumn(): string {
  return buttonsOnly ? 'Boutons' : isOnly('son') ? 'Son' : isOnly('playfield') ? 'Playfield' : 'Rôles';
}

/** Ce que l'étape seule a décidé, pour le récapitulatif et le résultat. */
function stepSummary(rolesLines: string[], playfieldLines: string[]): string[] {
  switch (only!.id) {
    case 'boutons':
      return buttonLines(wizard.buttons);
    case 'disposition':
      return rolesLines;
    case 'ecrans':
      return [...rolesLines, ...(wizard.layoutAsked ? playfieldLines : ['Bord des flippers et diagonale : inchangés, même écran de playfield'])];
    case 'playfield':
      return playfieldLines.length ? playfieldLines : ['Aucun écran de playfield branché'];
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
    return { ...base, highlight: isSpeaker, prompt: isSpeaker ? 'Haut-parleur de cet écran' : '', step: 'Réglage du son en cours' };
  }
  const where = speaker ? ` · haut-parleur de l’écran ${displays.indexOf(speaker) + 1}` : '';
  const details = `${output.bus || 'bus inconnu'} · ${output.channels ? channelsLabel(output.channels) : 'canaux inconnus'}${where}${output.isDefault ? ' · sortie par défaut de Windows' : ''}`;
  const notice = base.notice ?? soundNotice();

  if (wizard.phase === 'sound') {
    const beeps = sound.index + 1;
    const reason = sound.reasons.get(output.endpointId);
    return {
      ...base,
      highlight: true,
      measure: '♪'.repeat(Math.min(beeps, 6)) + (beeps > 6 ? ` ${beeps}` : ''),
      prompt: `Sortie ${beeps} sur ${sound.outputs.length}`,
      name: output.friendlyName,
      details,
      notice,
      step: `${beeps} bip${beeps > 1 ? 's' : ''} : où l’entendez-vous ? Actuellement : ${audioRoleLabel(output.endpointId)}${reason ? ` (proposé : ${reason})` : ''}.`,
      hint: 'Flipper gauche : fronton · Flipper droit : plateau · Start : les deux · Exit : aucun, sortie suivante',
    };
  }

  const pairs = speakerPairsOf(output);
  const pair = pairs[sound.pairIndex]!;
  const answered = pairs
    .slice(0, sound.pairIndex)
    .map((p) => `${p.label} : ${SPEAKER_PLACE_LABELS[sound.places[p.pair] ?? 'none']}`)
    .join(' · ');
  return {
    ...base,
    highlight: true,
    measure: pair.label,
    prompt: `Haut-parleurs ${sound.pairIndex + 1} sur ${pairs.length}`,
    name: describeAudioOutput(output),
    details,
    notice,
    step: `Un bip à gauche, puis un plus aigu à droite : où sont ces haut-parleurs ?${answered ? ` (${answered})` : ''}`,
    hint: 'Flipper gauche : plateau, près de vous · Flipper droit : plateau, côté fronton · Start : dans le fronton · Exit : rien entendu',
  };
}

function broadcast(): void {
  updateSound();
  windows.forEach((win, i) => {
    if (!win.isDestroyed()) win.webContents.send('state', { ...viewFor(i), quit: quitView() });
  });
}
