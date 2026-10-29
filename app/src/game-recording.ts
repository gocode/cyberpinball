// Enregistrement d'une partie (packages/core/src/gamerecording.ts) : capture des écrans filmés,
// témoin dans le coin du plateau, fichiers. Le menu l'arme avant le lancement (« Jouer et
// enregistrer », recording-menu.ts) ; frontend.ts lui dit quand la table est à l'écran (shown) et
// quand VPX s'est fermé (gameEnded). Les deux événements de l'enregistrement, « recording-start »
// et « recording-end », partent de `events` ; `finished` donne les fichiers produits.
//
// La capture est celle de Chromium (desktopCapturer, getUserMedia : DXGI ou Windows Graphics
// Capture selon Windows), dans une fenêtre jamais montrée (renderer/recorder.html) ; l'encodage est
// celui de MediaRecorder (MP4, H.264 et AAC) : rien à télécharger, rien d'installé. Le témoin est
// une petite fenêtre transparente, sans focus ni clic, posée au-dessus de VPX et exclue de la
// capture (setContentProtection : WDA_EXCLUDEFROMCAPTURE depuis Windows 10 2004).
//
// Partie simulée hors écran : aucun écran n'est capturé ; l'enregistreur dessine une fausse table
// dans le sens où VPX la dessinerait, et tout le reste du chemin (zone, rotation, fondu, encodage,
// fichier, roue) est le vrai.

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { desktopCapturer, ipcMain, screen, type IpcMainEvent } from 'electron';
import {
  advanceRecording,
  ARMED_RECORDING,
  captureGeometry,
  edgeRotation,
  indicatorBounds,
  keptSeconds,
  readMediaDimensions,
  recordingDir,
  recordingEndText,
  recordingFileName,
  recordingIndicator,
  recordingUsable,
  RECORDING_FADE_MS,
  RECORDING_FPS,
  RECORDING_MAX_LONG,
  RECORDING_TAIL_MS,
  uprightRotation,
  type CaptureGeometry,
  type FlipperEdge,
  type MediaType,
  type RecordedRole,
  type RecordingClock,
  type RecordingEvent,
  type RecordingIndicator,
  type RecordingInput,
  type RecordingSettings,
  type Rect,
  type Rotation,
  type TableEntry,
} from '@cyberpinball/core';
import { checkLayout } from './layout-check';
import { createWindow, isShown, windowRect } from './offscreen';

/** Un écran filmé : son rôle, le média qu'il remplira, son écran et sa zone (pixels physiques du bureau). */
export interface RecordingScreen {
  role: RecordedRole;
  type: MediaType;
  display: Rect;
  zone: Rect;
  /** Plateau : bord où VPX dessine les flippers dans l'image de l'écran. */
  edge?: FlipperEdge;
}

export interface RecordingRequest {
  table: TableEntry;
  settings: RecordingSettings;
  screens: RecordingScreen[];
  /** Rotation de la mise en page du plateau : le témoin se lit dans le sens du joueur. */
  rotation: Rotation;
  /** Partie simulée (hors écran) : fausse table dessinée par l'enregistreur, aucun écran capturé. */
  synthetic: boolean;
  dataDir: string;
  /** Essais sans opérateur : captures du témoin, dans ce dossier. */
  captureDir?: string;
}

export interface RecordedFile {
  role: RecordedRole;
  type: MediaType;
  file: string;
  bytes: number;
  width: number;
  height: number;
}

export interface RecordingOutcome {
  table: TableEntry;
  settings: RecordingSettings;
  clock: RecordingClock;
  /** Fichiers gardés, dans <données>\enregistrements ; vide quand rien ne vaut d'être proposé. */
  files: RecordedFile[];
  usable: boolean;
  /** Phrase de bilan (recordingEndText), pour l'écran du retour. */
  text: string;
}

export interface RecordingRun {
  /** « recording-start » et « recording-end » (RecordingEvent). */
  events: EventEmitter;
  /** La fenêtre de jeu de VPX tient le premier plan : le délai court. */
  shown(): void;
  /** VPX s'est fermé. */
  gameEnded(): void;
  finished: Promise<RecordingOutcome>;
}

const TICK_MS = 100;
/** Délai laissé à l'enregistreur pour rendre ses fichiers après la fin. */
const DONE_TIMEOUT_MS = 20_000;
/** Le bilan reste affiché ce temps dans le coin du plateau. */
const VERDICT_MS = 3000;
/** Taille du témoin vu du joueur, pour un petit côté de 1080 px (plancher de 20 px compris : texte à 26). */
const WITNESS = { width: 420, height: 72, margin: 28 };
/** Débit de la vidéo du plateau et des autres écrans. */
const BITRATE: Record<RecordedRole, number> = { playfield: 8_000_000, backglass: 4_000_000, dmd: 3_000_000 };

interface TargetSpec {
  key: RecordedRole;
  sourceIndex: number;
  crop: Rect;
  rotation: Rotation;
  width: number;
  height: number;
  audio: boolean;
  bitrate: number;
}

interface SourceSpec {
  /** Source de desktopCapturer (écran réel). */
  id?: string;
  width: number;
  height: number;
  /** Partie simulée : zones dessinées, dans le sens de VPX. */
  scene?: { role: RecordedRole; rect: Rect; turn: Rotation; title: string }[];
}

type RecorderMessage =
  | { type: 'prepared'; targets: { key: RecordedRole; mime: string }[] }
  | { type: 'started' }
  | { type: 'error'; message: string }
  | { type: 'done'; targets: { key: RecordedRole; mime: string }[] };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const extOfMime = (mime: string) => (/webm/i.test(mime) ? 'webm' : 'mp4');

/**
 * Sources et cibles : une capture par écran (les rôles qui le partagent y prennent chacun leur
 * zone), à la taille juste nécessaire (un 4K capturé à moitié quand la vidéo n'en garde que 1920).
 */
export function recordingPlan(screens: RecordingScreen[], options: { synthetic: boolean; title: string; sound: boolean }): { sources: SourceSpec[]; targets: TargetSpec[] } {
  const displays: Rect[] = [];
  for (const s of screens) if (!displays.some((d) => sameRect(d, s.display))) displays.push(s.display);
  const sources: SourceSpec[] = displays.map((display) => {
    const mine = screens.filter((s) => sameRect(s.display, display));
    const need = Math.max(...mine.map((s) => RECORDING_MAX_LONG[s.role] / Math.max(s.zone.width, s.zone.height)));
    const scale = Math.min(1, need);
    const size = { width: even(display.width * scale), height: even(display.height * scale) };
    if (!options.synthetic) return size;
    const sx = size.width / display.width;
    const sy = size.height / display.height;
    return {
      ...size,
      scene: mine.map((s) => ({
        role: s.role,
        rect: { x: Math.round((s.zone.x - display.x) * sx), y: Math.round((s.zone.y - display.y) * sy), width: Math.round(s.zone.width * sx), height: Math.round(s.zone.height * sy) },
        turn: s.role === 'playfield' ? edgeRotation(s.edge ?? 'bottom') : 0,
        title: options.title,
      })),
    };
  });
  const targets = screens.map((s): TargetSpec => {
    const sourceIndex = displays.findIndex((d) => sameRect(d, s.display));
    const zone = { x: s.zone.x - s.display.x, y: s.zone.y - s.display.y, width: s.zone.width, height: s.zone.height };
    const rotation = s.role === 'playfield' ? uprightRotation(s.edge ?? 'bottom') : 0;
    const g: CaptureGeometry = captureGeometry(zone, s.display, sources[sourceIndex]!, rotation, { maxLong: RECORDING_MAX_LONG[s.role], portrait: s.role === 'playfield' });
    return { key: s.role, sourceIndex, ...g, audio: s.role === 'playfield' && options.sound, bitrate: BITRATE[s.role] };
  });
  return { sources, targets };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Arme l'enregistrement d'une partie ; rien n'est capturé avant que la table soit à l'écran. */
export function armRecording(req: RecordingRequest): RecordingRun {
  const events = new EventEmitter();
  const settings = req.settings;
  const dir = recordingDir(req.dataDir, req.table);
  const plan = recordingPlan(req.screens, { synthetic: req.synthetic, title: req.table.title, sound: settings.sound });
  let clock: RecordingClock = ARMED_RECORDING;
  let startedAt: Date | undefined;
  /** Fichier en cours d'écriture de chaque cible (.part), puis son extension d'après le format retenu. */
  const parts = new Map<RecordedRole, string>();
  const exts = new Map<RecordedRole, string>();
  let resolveFinished: (outcome: RecordingOutcome) => void = () => undefined;
  const finished = new Promise<RecordingOutcome>((resolve) => (resolveFinished = resolve));
  let settled = false;
  let doneTimer: NodeJS.Timeout | undefined;

  // L'enregistreur : jamais montré, jamais ralenti (une fenêtre cachée l'est d'ordinaire).
  const recorder = createWindow({
    show: false,
    width: 320,
    height: 180,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    backgroundColor: '#030807',
    webPreferences: {
      preload: path.join(__dirname, 'recording-preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  recorder.webContents.setAudioMuted(true);
  const recorderReady = new Promise<void>((resolve) => {
    const onReady = (event: IpcMainEvent) => {
      if (event.sender !== recorder.webContents) return;
      ipcMain.removeListener('recorder:ready', onReady);
      resolve();
    };
    ipcMain.on('recorder:ready', onReady);
  });
  void recorder.loadFile(path.join(__dirname, '..', 'renderer', 'recorder.html'));
  const send = (command: Record<string, unknown>) => {
    if (!recorder.isDestroyed()) recorder.webContents.send('recorder:command', command);
  };
  /**
   * Préparation de la capture envoyée (ou abandonnée) : début et fin partent après elle. Avec un
   * délai nul, l'événement de début tombe à l'instant où la table paraît, avant que les sources
   * soient connues ; l'enregistreur recevait alors « start » sans rien à enregistrer.
   */
  let prepareSent: Promise<void> = Promise.resolve();
  const sendAfterPrepare = (command: Record<string, unknown>) => void prepareSent.then(() => send(command));

  const witness = openWitness(req);

  const onChunk = (event: IpcMainEvent, key: RecordedRole, data: ArrayBuffer) => {
    if (event.sender !== recorder.webContents) return;
    const file = parts.get(key);
    if (!file) return;
    try {
      fs.appendFileSync(file, Buffer.from(data));
    } catch (error) {
      feed({ type: 'failed', at: Date.now(), error: (error as Error).message });
    }
  };
  const onEvent = (event: IpcMainEvent, message: RecorderMessage) => {
    if (event.sender !== recorder.webContents) return;
    if (message.type === 'prepared') {
      for (const t of message.targets) exts.set(t.key, extOfMime(t.mime));
    } else if (message.type === 'error') {
      console.log(`Enregistrement (${req.table.id}) : ${message.message}`);
      feed({ type: 'failed', at: Date.now(), error: message.message });
      // Arrêté avant d'avoir commencé : l'enregistreur n'a plus rien à rendre.
      if (clock.phase === 'ended' && !startedAt) void finish([]);
    } else if (message.type === 'done') void finish(message.targets);
  };
  ipcMain.on('recorder:chunk', onChunk);
  ipcMain.on('recorder:event', onEvent);

  const ticker = setInterval(() => feed({ type: 'tick', at: Date.now() }), TICK_MS);

  function feed(input: RecordingInput): void {
    const step = advanceRecording(clock, input, settings);
    clock = step.clock;
    for (const e of step.events) handle(e);
    witness.update(recordingIndicator(clock, Date.now(), settings));
  }

  function handle(e: RecordingEvent): void {
    if (e.type === 'recording-start') {
      startedAt = new Date();
      fs.mkdirSync(dir, { recursive: true });
      for (const t of plan.targets) {
        const type = req.screens.find((s) => s.role === t.key)!.type;
        const file = path.join(dir, `${recordingFileName(type, startedAt, 'mp4')}.part`);
        fs.writeFileSync(file, '');
        parts.set(t.key, file);
      }
      console.log(`Enregistrement (${req.table.id}) : début, ${plan.targets.map((t) => `${t.key} ${t.width} × ${t.height}${t.rotation ? ` tourné de ${t.rotation}°` : ''}`).join(', ')}.`);
      sendAfterPrepare({ type: 'start', durationMs: settings.duration * 1000 });
    } else {
      console.log(`Enregistrement (${req.table.id}) : fin (${e.reason}), ${e.seconds.toFixed(1)} s.`);
      clearInterval(ticker);
      sendAfterPrepare({ type: 'stop', reason: e.reason });
      // Rien n'a été filmé (table quittée pendant le délai) : rien à attendre de l'enregistreur.
      if (!startedAt) void finish([]);
      else doneTimer = setTimeout(() => void finish([]), DONE_TIMEOUT_MS);
    }
    events.emit(e.type, e);
  }

  async function finish(done: { key: RecordedRole; mime: string }[]): Promise<void> {
    if (settled) return;
    settled = true;
    if (doneTimer) clearTimeout(doneTimer);
    clearInterval(ticker);
    ipcMain.removeListener('recorder:chunk', onChunk);
    ipcMain.removeListener('recorder:event', onEvent);
    if (!recorder.isDestroyed()) recorder.destroy();
    const usable = recordingUsable(clock) && done.length > 0;
    const files: RecordedFile[] = [];
    for (const [key, part] of parts) {
      const rendered = done.find((d) => d.key === key);
      const bytes = fs.existsSync(part) ? fs.statSync(part).size : 0;
      // Trop court, échoué ou vide : ces fichiers n'ont jamais été à l'utilisateur, ils disparaissent.
      if (!usable || !rendered || !bytes) {
        fs.rmSync(part, { force: true });
        continue;
      }
      const file = part.replace(/\.mp4\.part$/, `.${extOfMime(rendered.mime ?? exts.get(key) ?? 'mp4')}`);
      fs.renameSync(part, file);
      const dims = readMediaDimensions(file);
      const target = plan.targets.find((t) => t.key === key)!;
      files.push({ role: key, type: req.screens.find((s) => s.role === key)!.type, file, bytes, width: dims?.width ?? target.width, height: dims?.height ?? target.height });
    }
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      // Dossier partagé avec un autre enregistrement : il reste.
    }
    const outcome: RecordingOutcome = { table: req.table, settings, clock, files, usable: usable && files.length > 0, text: recordingEndText(clock, settings) };
    for (const f of files) console.log(`Enregistrement (${req.table.id}) : ${path.basename(f.file)}, ${f.width} × ${f.height}, ${Math.round(keptSeconds(clock))} s, ${f.bytes} octets.`);
    // Le bilan reste un instant dans le coin du plateau, puis le témoin s'en va.
    setTimeout(() => witness.close(), VERDICT_MS);
    resolveFinished(outcome);
  }

  return {
    events,
    shown() {
      prepareSent = (async () => {
        try {
          await recorderReady;
          const sources = req.synthetic ? plan.sources : await desktopSources(req.screens, plan.sources);
          send({ type: 'prepare', synthetic: req.synthetic, fps: RECORDING_FPS, sound: settings.sound, fadeMs: RECORDING_FADE_MS, tailMs: RECORDING_TAIL_MS, sources, targets: plan.targets });
        } catch (error) {
          // La fin (« failed ») part derrière cette préparation manquée.
          feed({ type: 'failed', at: Date.now(), error: (error as Error).message });
        }
      })();
      feed({ type: 'shown', at: Date.now() });
    },
    gameEnded() {
      feed({ type: 'game-end', at: Date.now() });
    },
    finished,
  };
}

/** Source de desktopCapturer de chaque écran filmé (par l'écran d'Electron qui le recouvre). */
async function desktopSources(screens: RecordingScreen[], sources: SourceSpec[]): Promise<SourceSpec[]> {
  const found = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const displays: Rect[] = [];
  for (const s of screens) if (!displays.some((d) => sameRect(d, s.display))) displays.push(s.display);
  return displays.map((display, i) => {
    const id = String(screen.getDisplayMatching(windowRect(display)).id);
    const source = found.find((s) => s.display_id === id);
    if (!source) throw new Error(`écran ${display.width} × ${display.height} introuvable pour la capture`); // i18n-ignore : journal et bilan techniques
    return { ...sources[i]!, id: source.id };
  });
}

/** Le témoin : fenêtre transparente au coin du plateau, au-dessus de VPX, absente de la capture. */
function openWitness(req: RecordingRequest): { update(indicator: RecordingIndicator | undefined): void; close(): void } {
  const playfield = req.screens.find((s) => s.role === 'playfield');
  if (!playfield) return { update: () => undefined, close: () => undefined };
  const unit = Math.min(playfield.zone.width, playfield.zone.height) / 1080;
  const bounds = indicatorBounds(playfield.zone, req.rotation, { width: Math.round(WITNESS.width * unit), height: Math.round(WITNESS.height * unit) }, Math.round(WITNESS.margin * unit));
  const win = createWindow({
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    ...windowRect(bounds),
    webPreferences: { preload: path.join(__dirname, 'recording-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.setIgnoreMouseEvents(true);
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  let loaded = false;
  let last = '';
  let pending: RecordingIndicator | undefined;
  /** Dernier état capturé (essais). */
  let captured = '';
  win.webContents.once('did-finish-load', () => {
    loaded = true;
    if (pending) push(pending);
  });
  void win.loadFile(path.join(__dirname, '..', 'renderer', 'recording.html'));
  const push = (indicator: RecordingIndicator) => {
    win.webContents.send('recording:state', { indicator, rotation: req.rotation });
    if (!isShown(win)) win.showInactive();
    if (req.captureDir && captured !== indicator.state) {
      captured = indicator.state;
      const state = indicator.state;
      setTimeout(() => void snapshot(state), 300);
    }
  };
  const snapshot = async (state: string) => {
    if (win.isDestroyed()) return;
    fs.mkdirSync(req.captureDir!, { recursive: true });
    fs.writeFileSync(path.join(req.captureDir!, `temoin-${state}.png`), (await win.webContents.capturePage()).toPNG());
    const problems = await checkLayout(win.webContents);
    console.log(`Témoin (${state}) : ${problems.length ? problems.join(' ; ') : 'mise en page conforme'}.`);
  };
  return {
    update(indicator) {
      if (win.isDestroyed() || !indicator) return;
      const key = JSON.stringify(indicator);
      if (key === last) return;
      last = key;
      if (loaded) push(indicator);
      else pending = indicator;
    },
    close() {
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
