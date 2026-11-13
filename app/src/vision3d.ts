// Vision 3D (packages/core/src/vision3d.ts) : la perspective de la table suit la tête du joueur.
//
// - Réglage : <données>\vision3d\reglage.json (activée ou non, capteur, position de jeu par
//   configuration de borne).
// - Plugin VPX « Vision3D » (packages/vpx-vision3d) : copié dans le dossier plugins\ de la version
//   active de VPX, activé dans VPinballX.ini comme les autres plugins (components.json). Inerte tant
//   qu'il ne reçoit rien : une partie sans Vision 3D n'en paie rien.
// - Pendant une partie, HeadTracker lit le capteur (webcam : fenêtre cachée et MediaPipe ; Kinect
//   pour Xbox 360 : Kinect10.dll de Microsoft par koffi), lisse la position de la tête, la compare à
//   la position de jeu et envoie le déplacement au plugin par UDP local (127.0.0.1, format opentrack).
//   Le capteur s'allume dès le Start (pendant le chargement de la table : la Kinect a le temps de
//   repérer le joueur) et reste allumé deux minutes après la partie, pour la suivante ; aucune image
//   ne quitte le PC (la fenêtre de la webcam n'a accès à aucun réseau).
// - Pilote de la Kinect : téléchargé chez Microsoft à la demande (components.json,
//   « kinect-sdk-1.8 » : le SDK, sans lequel le pilote refuse une Kinect pour Xbox 360), empreinte et signature vérifiées, installé en silence avec l'accord de
//   Windows (élévation).

import { spawn } from 'node:child_process';
import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ipcMain, session, type BrowserWindow, type IpcMainEvent } from 'electron';
import * as koffi from 'koffi';
import {
  clampShift,
  HeadFilter,
  nuiErrorReason,
  kinectAim,
  kinectCameraOf,
  type KinectCameraStatus,
  kinectHead,
  medianHead,
  opentrackPacket,
  parseVision3dSetting,
  subtract,
  VISION3D_PORT,
  vision3dHardware,
  webcamHead,
  renameWithRetry,
  t,
  writeFileAtomic,
  type DownloadManager,
  type Vec3,
  type Vision3dHardware,
  type Vision3dSetting,
  type Vision3dSmoothing,
  type Vision3dSourceKind,
  type WebcamEyes,
} from '@cyberpinball/core';
import { ELEVATION_WAIT_MS } from '@cyberpinball/core';
import { CANCELLED, POWERSHELL, powershell, quote, signerOf } from './elevation';
import { downloadComponent, findComponent } from '@cyberpinball/installer';
import { deviceStatus, hklmValue, memoryIntegrityEnabled } from '@cyberpinball/win-displays';
import { createWindow } from './offscreen';
import { usbDevices } from './vpx-ini';
import { installVpxPlugin, VISION3D_PLUGIN, vpxPluginFiles, type VpxPluginInstall } from './vpx-plugins';

const folder = (dataDir: string) => path.join(dataDir, 'vision3d');
const settingFile = (dataDir: string) => path.join(folder(dataDir), 'reglage.json');

export function readVision3d(dataDir: string): Vision3dSetting {
  try {
    return parseVision3dSetting(JSON.parse(fs.readFileSync(settingFile(dataDir), 'utf8')));
  } catch {
    return parseVision3dSetting(undefined);
  }
}

export function writeVision3d(dataDir: string, setting: Vision3dSetting): void {
  fs.mkdirSync(folder(dataDir), { recursive: true });
  writeFileAtomic(settingFile(dataDir), JSON.stringify(setting, null, 2) + '\n');
}

// --- Matériel ---------------------------------------------------------------------------------

const SYSTEM32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');

/**
 * Le SDK 1.8 de Microsoft est-il inscrit ? Sans lui, le pilote refuse une Kinect pour Xbox 360
 * (DeviceNotSupported, E_NUI_NOTSUPPORTED) : seule la Kinect pour Windows marche avec le runtime seul.
 */
export function kinectSdkInstalled(): boolean {
  const simulated = process.env.CYBERPINBALL_KINECT_SDK;
  if (simulated !== undefined) return simulated === '1';
  if (process.env.KINECTSDK10_DIR) return true;
  try {
    return typeof hklmValue('SOFTWARE\\Microsoft\\Kinect', 'SDKInstallPath') === 'string';
  } catch {
    return false;
  }
}

/** Le pilote de la Kinect v1 (Kinect for Windows Runtime 1.8) pose Kinect10.dll dans System32. */
export function kinect1DriverInstalled(): boolean {
  const simulated = process.env.CYBERPINBALL_KINECT_PILOTE;
  if (simulated !== undefined) return simulated === '1';
  return fs.existsSync(path.join(SYSTEM32, 'Kinect10.dll'));
}

/** Capteurs branchés maintenant (lecture passive du Gestionnaire de périphériques). */
export function probeVision3d(): Vision3dHardware {
  // CYBERPINBALL_INTEGRITE_MEMOIRE (essais) : 1 ou 0 à la place du registre.
  const simulated = process.env.CYBERPINBALL_INTEGRITE_MEMOIRE;
  const hvci = simulated !== undefined ? simulated === '1' : memoryIntegrityEnabled();
  const usb = usbDevices() ?? [];
  const camera = kinectCameraOf(usb);
  let status: KinectCameraStatus | undefined;
  try {
    status = camera ? deviceStatus(camera.instanceId) : undefined;
  } catch {
    status = undefined;
  }
  return vision3dHardware(usb, kinect1DriverInstalled(), hvci, status, kinectSdkInstalled());
}

// --- Plugin VPX ---------------------------------------------------------------------------------

/** plugin.cfg et la DLL : fabriqués avec l'application (natif\vision3d), ou construits en développement. */
export function vision3dPluginFiles(appDir: string): { dll: string; cfg: string } | undefined {
  return vpxPluginFiles(VISION3D_PLUGIN, appDir);
}

/**
 * Met le plugin dans <VPX>\plugins\vision3d, s'il n'y est pas déjà à l'identique. VPX le trouve à
 * son lancement suivant. VPX ouvert garde la DLL : la copie attend alors la partie d'après.
 */
export function installVision3dPlugin(vpxDir: string, appDir: string): VpxPluginInstall {
  return installVpxPlugin(VISION3D_PLUGIN, vpxDir, appDir);
}

// --- Suivi de la tête -------------------------------------------------------------------------

/** Échantillons pour mesurer la position de jeu (environ une seconde). */
const NEUTRAL_SAMPLES = 24;
/** Calibrage : deux fois plus de mesures, le joueur averti et immobile (environ deux secondes). */
export const CALIBRATION_SAMPLES = 50;
/**
 * Capteur gardé allumé après une partie : rejouer tout de suite ne remet pas le capteur en route.
 * La Kinect, en mode assis, ne repère le joueur qu'après un mouvement : rallumée au début de chaque
 * partie, alors que le joueur est immobile devant le plateau, elle pouvait attendre de longues
 * secondes (journal du PinCab, 13/11/2026 : 13 à 39 s de partie sans suivi).
 */
export const VISION3D_KEEP_WARM_MS = 2 * 60_000;

export type TrackerState = 'off' | 'starting' | 'searching' | 'tracking' | 'failed';

interface Source {
  stop(): void;
}

export interface HeadTrackerOptions {
  dataDir: string;
  appDir: string;
  log: (line: string) => void;
}

const sensorName = (kind: Vision3dSourceKind) => (kind === 'kinect1' ? 'Kinect' : 'webcam');

/**
 * Le capteur et la partie sont deux choses : le capteur s'allume dès le Start (warm, pendant le
 * chargement de la table, quand le joueur bouge encore et que la Kinect le repère), la partie
 * commence quand la table est à l'écran (start : position de jeu, envoi à VPX). À la fin, release
 * garde le capteur allumé VISION3D_KEEP_WARM_MS pour la partie suivante, puis l'éteint.
 */
export class HeadTracker {
  private source?: Source;
  /** Capteur allumé : lequel, et son réglage (un autre champ de webcam : capteur rallumé). */
  private sourceKey?: string;
  private sourceSince = 0;
  private sourceSeen = false;
  private idleTimer?: NodeJS.Timeout;
  private socket?: dgram.Socket;
  private filter = new HeadFilter();
  private smoothing: Vision3dSmoothing = 'normal';
  /** Intensité de l'effet (Vision3dSetting.intensity) : le déplacement envoyé en est multiplié. */
  private intensity = 1;
  /** Calibrage en cours (essai hors partie) : les mesures de la position de jeu, et qui prévenir. */
  private calibrating?: { samples: Vec3[]; done: (neutral: Vec3 | undefined) => void };
  private kind?: Vision3dSourceKind;
  private configurationId?: string;
  private neutral?: Vec3;
  private samples: Vec3[] = [];
  private lastSeen = 0;
  private failure?: string;
  /** Partie en cours : depuis quand, et quand la tête y a été suivie pour la première fois. */
  private game?: { since: number; trackedAfterMs?: number };
  /** Essai hors partie en cours : où rendre les positions (test). */
  private testing?: (p: Vec3) => void;
  /** Déplacements envoyés (essais et journal). */
  sent = 0;

  constructor(private readonly opts: HeadTrackerOptions) {}

  get state(): TrackerState {
    if (this.failure) return 'failed';
    if (!this.source) return 'off';
    if (!this.lastSeen) return 'starting';
    return Date.now() - this.lastSeen < 1000 ? 'tracking' : 'searching';
  }

  get failureReason(): string | undefined {
    return this.failure;
  }

  /** Le capteur est-il allumé (partie, chargement, ou gardé pour la partie suivante) ? */
  get running(): boolean {
    return Boolean(this.source);
  }

  /** Intensité et réactivité, changées à tout moment (écran Vision 3D, réglages en partie) : effet immédiat. */
  configure(setting: Pick<Vision3dSetting, 'intensity' | 'smoothing'>): void {
    this.intensity = setting.intensity;
    if (setting.smoothing !== this.smoothing) {
      this.smoothing = setting.smoothing;
      this.filter = new HeadFilter(setting.smoothing);
    }
  }

  /**
   * Allume le capteur sans rien envoyer à VPX : au Start, pendant le chargement de la table. Déjà
   * allumé avec le même capteur (partie d'avant) : gardé tel quel, le joueur déjà repéré.
   */
  warm(kind: Vision3dSourceKind, setting: Vision3dSetting): void {
    this.endGame();
    this.configure(setting);
    if (this.ensureSource(kind, setting, 'dès le Start, pendant le chargement de la table')) this.opts.log(`Vision 3D : ${sensorName(kind)} déjà allumée, ${this.state === 'tracking' ? 'tête suivie' : 'tête pas encore repérée'}.`); // i18n-ignore : journal
    // Lancement abandonné avant VPX (configuration à choisir, Exit pendant la préparation) : le capteur s'éteint seul.
    this.armIdle(VISION3D_KEEP_WARM_MS);
  }

  /**
   * Début de la partie (la table à l'écran) : la position de jeu (enregistrée, ou mesurée à la
   * première seconde), puis le déplacement de la tête envoyé au plugin. Le capteur allumé au Start
   * sert tel quel. Sans erreur : la partie se joue sans Vision 3D si le capteur fait défaut.
   */
  start(kind: Vision3dSourceKind, configurationId: string, setting: Vision3dSetting): void {
    this.endGame();
    this.configure(setting);
    this.kind = kind;
    this.configurationId = configurationId;
    const saved = setting.neutral[configurationId];
    this.neutral = saved && saved.source === kind ? { x: saved.x, y: saved.y, z: saved.z } : undefined;
    this.samples = [];
    const reused = this.ensureSource(kind, setting, 'au début de la partie'); // i18n-ignore : journal
    if (!this.source) return;
    this.socket = dgram.createSocket('udp4');
    this.socket.on('error', () => undefined);
    const tracked = this.state === 'tracking';
    this.game = { since: Date.now(), ...(tracked && { trackedAfterMs: 0 }) };
    this.opts.log(`Vision 3D : début de partie, ${sensorName(kind)} ${reused ? 'allumée avant' : 'allumée à l’instant'}, ${tracked ? 'tête déjà suivie' : 'tête pas encore repérée'}${this.neutral ? '' : ', position de jeu mesurée à la première seconde'}.`); // i18n-ignore : journal
  }

  /**
   * Essai hors partie (« Tester le capteur ») : le capteur allumé, chaque position lissée rendue à
   * `onHead` ; rien n'est envoyé à VPX ni enregistré. stop() l'éteint.
   */
  test(kind: Vision3dSourceKind, setting: Vision3dSetting, onHead: (p: Vec3) => void, configurationId?: string): void {
    this.endGame();
    this.configure(setting);
    this.kind = kind;
    this.configurationId = configurationId;
    this.testing = onHead;
    this.ensureSource(kind, setting, 'pour l’essai'); // i18n-ignore : journal
    this.opts.log(`Vision 3D : essai du capteur (${sensorName(kind)}).`); // i18n-ignore : journal
  }

  /**
   * Calibrage pendant l'essai : la position de jeu mesurée sur CALIBRATION_SAMPLES mesures (le joueur
   * immobile en position), enregistrée pour la configuration ; `done` la reçoit (undefined : essai
   * arrêté avant la fin).
   */
  calibrate(done: (neutral: Vec3 | undefined) => void): void {
    this.calibrating?.done(undefined);
    this.calibrating = { samples: [], done };
  }

  get calibrationProgress(): number | undefined {
    return this.calibrating ? this.calibrating.samples.length / CALIBRATION_SAMPLES : undefined;
  }

  /** Nouvelle position de jeu : celle de la tête dans la seconde qui suit. */
  recenter(): void {
    this.neutral = undefined;
    this.samples = [];
  }

  /** Bilan de la partie qui s'achève : positions envoyées, délai avant la première tête suivie, panne du capteur ; lus avant release(). */
  summary(): { sent: number; trackedAfterMs?: number; failure?: string } {
    return { sent: this.sent, ...(this.game?.trackedAfterMs !== undefined && { trackedAfterMs: this.game.trackedAfterMs }), ...(this.failure && { failure: this.failure }) };
  }

  /**
   * Fin de partie : plus rien n'est envoyé à VPX, mais le capteur reste allumé `keepMs` pour la
   * partie suivante (le joueur reste repéré), puis s'éteint de lui-même.
   */
  release(keepMs = VISION3D_KEEP_WARM_MS): void {
    this.endGame();
    this.testing = undefined;
    this.calibrating?.done(undefined);
    this.calibrating = undefined;
    if (!this.source) return;
    if (keepMs <= 0 || this.failure) return this.stop();
    this.armIdle(keepMs);
  }

  /** Extinction automatique dans `keepMs`, sauf partie ou essai d'ici là (ensureSource l'annule). */
  private armIdle(keepMs: number): void {
    if (!this.source) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.opts.log(`Vision 3D : capteur éteint (aucune partie lancée en ${Math.round(keepMs / 1000)} s).`); // i18n-ignore : journal
      this.stop();
    }, keepMs);
    this.idleTimer.unref?.();
  }

  /** Éteint le capteur tout de suite (essai fini, Vision 3D désactivée, partie dans le casque). */
  stop(): void {
    this.endGame();
    this.testing = undefined;
    this.calibrating?.done(undefined);
    this.calibrating = undefined;
    if (this.source) this.opts.log('Vision 3D : capteur éteint.'); // i18n-ignore : journal
    this.stopSource();
  }

  /** Allume le capteur s'il ne l'est pas déjà (même capteur, même réglage) ; true : il l'était. */
  private ensureSource(kind: Vision3dSourceKind, setting: Vision3dSetting, when: string): boolean {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    const key = kind === 'webcam' ? `webcam:${setting.webcamFovDeg}` : kind;
    if (this.source && this.sourceKey === key && !this.failure) return true;
    this.stopSource();
    this.failure = undefined;
    this.filter.reset();
    this.lastSeen = 0;
    this.sourceSeen = false;
    this.sourceSince = Date.now();
    const onHead = (p: Vec3) => this.push(p);
    const onFailure = (reason: string) => {
      this.failure = reason;
      this.opts.log(`Vision 3D${this.testing ? ' (essai)' : ''} : ${reason}`); // i18n-ignore : journal
    };
    try {
      this.source = kind === 'kinect1' ? startKinect1(onHead, onFailure, this.opts.log) : startWebcam(setting.webcamFovDeg, onHead, onFailure, this.opts.log);
      this.sourceKey = key;
      this.opts.log(`Vision 3D : ${sensorName(kind)} allumée ${when}.`); // i18n-ignore : journal
    } catch (error) {
      onFailure((error as Error).message);
      this.stopSource();
    }
    return false;
  }

  private stopSource(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    this.source?.stop();
    this.source = undefined;
    this.sourceKey = undefined;
  }

  private endGame(): void {
    this.socket?.close();
    this.socket = undefined;
    if (this.game && this.sent) this.opts.log(`Vision 3D : fin de partie (${this.sent} positions envoyées).`); // i18n-ignore : journal
    this.game = undefined;
    this.sent = 0;
  }

  private push(raw: Vec3): void {
    const now = Date.now();
    this.lastSeen = now;
    if (!this.sourceSeen) {
      this.sourceSeen = true;
      this.opts.log(`Vision 3D : tête repérée ${((now - this.sourceSince) / 1000).toFixed(1)} s après l’allumage du capteur.`); // i18n-ignore : journal
    }
    if (this.game && this.game.trackedAfterMs === undefined) {
      this.game.trackedAfterMs = now - this.game.since;
      this.opts.log(`Vision 3D : tête suivie ${(this.game.trackedAfterMs / 1000).toFixed(1)} s après le début de la partie.`); // i18n-ignore : journal
    }
    const p = this.filter.filter(raw, now / 1000);
    if (this.calibrating) {
      const c = this.calibrating;
      c.samples.push(p);
      if (c.samples.length >= CALIBRATION_SAMPLES) {
        this.calibrating = undefined;
        this.neutral = medianHead(c.samples);
        this.saveNeutral();
        c.done(this.neutral);
      }
    }
    if (this.testing) return this.testing(p);
    // Capteur allumé hors partie (chargement de la table, entre deux parties) : le lissage suit, rien ne part.
    if (!this.game) return;
    if (!this.neutral) {
      this.samples.push(p);
      if (this.samples.length < NEUTRAL_SAMPLES) return;
      this.neutral = medianHead(this.samples);
      this.samples = [];
      this.saveNeutral();
      return;
    }
    const shift = subtract(p, this.neutral);
    const d = clampShift({ x: shift.x * this.intensity, y: shift.y * this.intensity, z: shift.z * this.intensity });
    this.socket?.send(opentrackPacket(d), Number(process.env.CYBERPINBALL_VISION3D_PORT) || VISION3D_PORT, '127.0.0.1');
    this.sent++;
  }

  private saveNeutral(): void {
    if (!this.neutral || !this.kind || !this.configurationId) return;
    const setting = readVision3d(this.opts.dataDir);
    setting.neutral[this.configurationId] = { ...this.neutral, source: this.kind };
    try {
      writeVision3d(this.opts.dataDir, setting);
      const n = this.neutral;
      this.opts.log(`Vision 3D : position de jeu enregistrée (${n.x.toFixed(1)}, ${n.y.toFixed(1)}, ${n.z.toFixed(1)} cm).`); // i18n-ignore : journal
    } catch {
      // Réglage pas écrit : la position sera remesurée à la partie suivante.
    }
  }
}

// --- Webcam -----------------------------------------------------------------------------------

const MEDIAPIPE_FILES = ['vision_bundle.js', 'vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

/** MediaPipe Tasks Vision : fabriqué avec l'application (vendor\mediapipe), ou dans node_modules en développement. */
export function mediapipeDir(appDir: string): string | undefined {
  const shipped = path.join(appDir, 'vendor', 'mediapipe');
  if (MEDIAPIPE_FILES.every((f) => fs.existsSync(path.join(shipped, f)))) return shipped;
  try {
    // Le paquet n'exporte pas son package.json : son point d'entrée CommonJS est à sa racine.
    const pkg = path.dirname(require.resolve('@mediapipe/tasks-vision'));
    return fs.existsSync(path.join(pkg, 'vision_bundle.js')) ? pkg : undefined;
  } catch {
    return undefined;
  }
}

function mediapipeFile(dir: string, name: string): string {
  const flat = path.join(dir, name);
  return fs.existsSync(flat) ? flat : path.join(dir, 'wasm', name);
}

export const WEBCAM_PARTITION = 'vision3d';

/** Messages de la page de la webcam (renderer/vision3d-webcam.js). */
type WebcamMessage = { type: 'eyes'; eyes: WebcamEyes; width: number; height: number } | { type: 'status'; text: string } | { type: 'failed'; reason: string };

function startWebcam(fovDeg: number, onHead: (p: Vec3) => void, onFailure: (reason: string) => void, log: (line: string) => void): Source {
  const appDir = path.join(__dirname, '..');
  const vendor = mediapipeDir(appDir);
  if (!vendor) throw new Error('MediaPipe absent de cette version'); // i18n-ignore : journal
  const model = path.join(appDir, 'ressources', 'vision3d', 'blaze_face_full_range.tflite');
  const ses = session.fromPartition(WEBCAM_PARTITION);
  // La caméra, rien d'autre : ni micro, ni réseau. Les images ne quittent jamais le PC.
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const media = details as { mediaTypes?: string[] };
    callback(permission === 'media' && !(media.mediaTypes ?? []).includes('audio'));
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media');
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|blob|data|devtools):/i.test(details.url) }));

  const win: BrowserWindow = createWindow({
    show: false,
    width: 320,
    height: 240,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'vision3d-preload.js'),
      partition: WEBCAM_PARTITION,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  // Les fichiers de MediaPipe et le modèle passent en octets : la page en fait des blobs (aucun accès
  // au disque depuis le rendu).
  const assets = {
    bundle: fs.readFileSync(mediapipeFile(vendor, 'vision_bundle.js'), 'utf8'),
    loader: fs.readFileSync(mediapipeFile(vendor, 'vision_wasm_internal.js'), 'utf8'),
    wasm: fs.readFileSync(mediapipeFile(vendor, 'vision_wasm_internal.wasm')),
    model: fs.readFileSync(model),
  };
  const onAssets = (event: Electron.IpcMainInvokeEvent) => (event.sender === win.webContents ? assets : undefined);
  ipcMain.removeHandler('vision3d:assets');
  ipcMain.handle('vision3d:assets', onAssets);
  let lastStatus = '';
  const onMessage = (event: IpcMainEvent, message: WebcamMessage) => {
    if (event.sender !== win.webContents) return;
    if (message.type === 'eyes') {
      const head = webcamHead(message.eyes, { width: message.width, height: message.height }, fovDeg);
      if (head) onHead(head);
    } else if (message.type === 'failed') onFailure(message.reason);
    else if (message.text !== lastStatus) {
      lastStatus = message.text;
      log(`Vision 3D (webcam) : ${message.text}`); // i18n-ignore : journal
    }
  };
  ipcMain.on('vision3d:webcam', onMessage);
  void win.loadFile(path.join(appDir, 'renderer', 'vision3d-webcam.html'));
  return {
    stop() {
      ipcMain.removeListener('vision3d:webcam', onMessage);
      ipcMain.removeHandler('vision3d:assets');
      // Fermer la page éteint la caméra (et son témoin lumineux).
      if (!win.isDestroyed()) win.destroy();
    },
  };
}

// --- Kinect pour Xbox 360 (Kinect10.dll) -------------------------------------------------------

// NuiApi.h, NuiSensor.h (Kinect for Windows SDK 1.8).
const NUI_INITIALIZE_FLAG_USES_SKELETON = 0x00000008;
const NUI_SKELETON_TRACKING_FLAG_ENABLE_SEATED_SUPPORT = 0x00000004;
const NUI_SKELETON_COUNT = 6;
const NUI_SKELETON_TRACKED = 2;
const NUI_SKELETON_POSITION_HEAD = 3;
const NUI_SKELETON_POSITION_NOT_TRACKED = 0;
/** NUI_SKELETON_FRAME : 8 + 4 + 4 + 16 (sol) + 16 (gravité) + 6 × NUI_SKELETON_DATA (436). */
export const NUI_SKELETON_FRAME_SIZE = 48 + NUI_SKELETON_COUNT * 436;
const SKELETON_DATA = 48;
const SKELETON_SIZE = 436;

/** La tête du premier squelette suivi, et le sol vu par le capteur ; undefined : personne devant le capteur. */
export function readSkeletonFrame(frame: Buffer): { head: Vec3; floor: Vec3 } | undefined {
  const floor = { x: frame.readFloatLE(16), y: frame.readFloatLE(20), z: frame.readFloatLE(24) };
  for (let i = 0; i < NUI_SKELETON_COUNT; i++) {
    const base = SKELETON_DATA + i * SKELETON_SIZE;
    if (frame.readInt32LE(base) !== NUI_SKELETON_TRACKED) continue;
    const joint = base + 32 + NUI_SKELETON_POSITION_HEAD * 16;
    const jointState = frame.readInt32LE(base + 32 + 20 * 16 + NUI_SKELETON_POSITION_HEAD * 4);
    if (jointState === NUI_SKELETON_POSITION_NOT_TRACKED) continue;
    return { head: { x: frame.readFloatLE(joint), y: frame.readFloatLE(joint + 4), z: frame.readFloatLE(joint + 8) }, floor };
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;
interface NuiApi {
  initialize: NativeFn;
  shutdown: NativeFn;
  trackingEnable: NativeFn;
  nextFrame: NativeFn;
  getElevation: NativeFn;
  setElevation: NativeFn;
}
let nui: NuiApi | undefined;

function loadNui(): NuiApi {
  if (nui) return nui;
  // CYBERPINBALL_KINECT_DLL : une DLL de remplacement pour les essais sans capteur.
  const lib = koffi.load(process.env.CYBERPINBALL_KINECT_DLL || 'Kinect10.dll');
  nui = {
    initialize: lib.func('int32_t __stdcall NuiInitialize(uint32_t flags)'),
    shutdown: lib.func('void __stdcall NuiShutdown()'),
    trackingEnable: lib.func('int32_t __stdcall NuiSkeletonTrackingEnable(void *event, uint32_t flags)'),
    nextFrame: lib.func('int32_t __stdcall NuiSkeletonGetNextFrame(uint32_t milliseconds, _Inout_ uint8_t *frame)'),
    getElevation: lib.func('int32_t __stdcall NuiCameraElevationGetAngle(_Out_ int32_t *degrees)'),
    setElevation: lib.func('int32_t __stdcall NuiCameraElevationSetAngle(int32_t degrees)'),
  };
  return nui;
}

/**
 * Appels lents au pilote (NuiInitialize : une demi-seconde à une seconde au PinCab, 13/11/2026) : sur
 * un fil de koffi, jamais sur le fil principal (l'écran de chargement gèlerait au Start). Les uns
 * après les autres : un arrêt et un rallumage ne se croisent jamais dans le pilote.
 */
let nuiQueue: Promise<unknown> = Promise.resolve();
function nuiAsync(fn: NativeFn, ...args: unknown[]): Promise<number> {
  const call = nuiQueue.then(
    () =>
      new Promise<number>((resolve, reject) => {
        (fn as unknown as { async: (...a: unknown[]) => void }).async(...args, (error: unknown, result: number) => (error ? reject(error) : resolve(result)));
      }),
  );
  nuiQueue = call.catch(() => undefined);
  return call;
}

function startKinect1(onHead: (p: Vec3) => void, onFailure: (reason: string) => void, log: (line: string) => void): Source {
  const api = loadNui();
  const frame = Buffer.alloc(NUI_SKELETON_FRAME_SIZE);
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const startedAt = Date.now();
  void (async () => {
    try {
      const hr = await nuiAsync(api.initialize, NUI_INITIALIZE_FLAG_USES_SKELETON);
      if (hr < 0) throw new Error(nuiErrorReason(hr)); // raison en clair, d'après NuiApi.h du SDK 1.8
      if (stopped) return;
      // Mode assis : la caisse cache les jambes du joueur ; il ne repère le joueur qu'après un mouvement.
      const tr = await nuiAsync(api.trackingEnable, null, NUI_SKELETON_TRACKING_FLAG_ENABLE_SEATED_SUPPORT);
      if (tr < 0) {
        nuiAsync(api.shutdown).catch(() => undefined);
        throw new Error(nuiErrorReason(tr));
      }
    } catch (error) {
      if (!stopped) onFailure((error as Error).message);
      return;
    }
    // Arrêté pendant l'allumage : stop() a déjà mis l'arrêt du pilote dans la file.
    if (stopped) return;
    log(`Vision 3D (Kinect) : prête en ${Date.now() - startedAt} ms.`); // i18n-ignore : journal
    let aimed = false;
    /** Le moteur tourne : la tête « bouge » sans que le joueur bouge ; ces images sont ignorées. */
    let settleUntil = 0;
    let errors = 0;
    timer = setInterval(() => {
      const rc = api.nextFrame(0, frame) as number;
      if (rc < 0) {
        // E_NUI_FRAME_NO_DATA : pas de nouvelle image ; une erreur qui dure : capteur débranché.
        if ((rc >>> 0) !== 0x83010001 && ++errors > 300) {
          clearInterval(timer);
          onFailure('la Kinect ne répond plus'); // i18n-ignore : journal
        }
        return;
      }
      errors = 0;
      const seen = readSkeletonFrame(frame);
      if (!seen || Date.now() < settleUntil) return;
      if (!aimed) {
        // Une fois par allumage : le moteur s'use et bloque la lecture une seconde.
        aimed = true;
        const elevation = [0];
        if ((api.getElevation(elevation) as number) >= 0) {
          const target = kinectAim(seen.head, elevation[0]!);
          if (target !== undefined && (api.setElevation(target) as number) >= 0) {
            log(`Vision 3D (Kinect) : inclinaison ${elevation[0]}° -> ${target}° pour viser la tête.`); // i18n-ignore : journal
            settleUntil = Date.now() + 1500;
            return;
          }
        }
      }
      onHead(kinectHead(seen.head, seen.floor));
    }, 10);
  })();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      // Dans la file, après l'allumage en cours s'il y en a un, avant tout rallumage : jamais croisés.
      // Capteur débranché pendant la partie : l'erreur du pilote est sans suite.
      nuiAsync(api.shutdown).catch(() => undefined);
    },
  };
}

// --- Pilote de la Kinect ----------------------------------------------------------------------

export type DriverInstall = { ok: true } | { ok: false; cancelled?: true; reason: string };

/**
 * Le pilote, téléchargé chez Microsoft (empreinte du manifeste), ou réutilisé s'il est déjà là. Suivi
 * dans le gestionnaire de téléchargements, comme l'archive de VPX : une coupure garde son partiel.
 */
export async function downloadKinectDriver(downloadsDir: string, downloads?: DownloadManager): Promise<string> {
  const component = findComponent('kinect-sdk-1.8');
  const file = path.join(downloadsDir, path.basename(new URL(component.url).pathname));
  const job = downloads?.track({
    id: component.id,
    kind: 'component',
    title: t('Pilote de la Kinect (Microsoft)'),
    source: { kind: 'http', label: 'download.microsoft.com' },
    files: [{ ref: component.url, name: path.basename(file), bytes: component.size, dest: file, part: `${file}.part` }],
    back: { screen: 'downloads' },
    resumable: true,
  });
  try {
    await downloadComponent(component, downloadsDir, (received, total) => job?.progress(received, total));
  } catch (error) {
    job?.fail(fs.existsSync(`${file}.part`) ? 'network' : 'http', (error as Error).message);
    throw error;
  }
  job?.done([{ index: 0, file }]);
  return file;
}

/** Archive CAB attachée à une enveloppe WiX (Burn) : la plus grande des archives (« MSCF ») du fichier. */
export function attachedCabinet(exe: Buffer): { offset: number; size: number } | undefined {
  let best: { offset: number; size: number } | undefined;
  for (let i = exe.indexOf('MSCF\0\0\0\0', 0, 'latin1'); i >= 0; i = exe.indexOf('MSCF\0\0\0\0', i + 4, 'latin1')) {
    const size = exe.readUInt32LE(i + 8);
    if (i + size <= exe.length && (!best || size > best.size)) best = { offset: i, size };
  }
  return best;
}

const EXPAND = path.join(SYSTEM32, 'expand.exe');

function run(file: string, args: string[]): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => resolve({ status: -1, stderr: error.message }));
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

/**
 * Installe le pilote sans aucune fenêtre. L'enveloppe de Microsoft (empreinte et signature vérifiées)
 * n'est jamais lancée : son interface montre sa licence à cocher malgré /quiet, et la fenêtre se
 * perd derrière le menu plein écran. Ses paquets (bundlePackages) sont pris dans son archive par
 * expand.exe de Windows, chacun vérifié signé par Microsoft, puis installés d'un trait par un script
 * élevé : Windows demande son accord une fois.
 */
export async function installKinectDriver(file: string): Promise<DriverInstall> {
  const component = findComponent('kinect-sdk-1.8');
  const outer = await signerOf(file);
  if (outer.status !== 'Valid' || outer.subject !== component.signer) {
    fs.rmSync(file, { force: true });
    return { ok: false, reason: `signature inattendue (${outer.status || '?'} ; ${outer.subject || '?'}), fichier supprimé` }; // i18n-ignore : raison technique, journal et détail
  }
  const work = path.join(path.dirname(file), component.id);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const exe = fs.readFileSync(file);
  const cab = attachedCabinet(exe);
  if (!cab) return { ok: false, reason: 'archive des paquets introuvable dans l’installateur' }; // i18n-ignore : journal
  const cabFile = path.join(work, 'paquets.cab');
  fs.writeFileSync(cabFile, exe.subarray(cab.offset, cab.offset + cab.size));
  const packages: { path: string; arguments?: string[] }[] = [];
  for (const pkg of component.bundlePackages ?? []) {
    const x = await run(EXPAND, [`-F:${pkg.source}`, cabFile, work]);
    const extracted = path.join(work, pkg.source);
    if (x.status !== 0 || !fs.existsSync(extracted)) return { ok: false, reason: `paquet ${pkg.file} introuvable dans l’installateur` }; // i18n-ignore : journal
    const dest = path.join(work, pkg.file);
    renameWithRetry(extracted, dest);
    // Un compagnon (archive externe d'un .msi) n'est pas signé lui-même : il vient de l'enveloppe vérifiée.
    if (pkg.companion) continue;
    const sig = await signerOf(dest);
    if (sig.status !== 'Valid' || !/(^|, )O=Microsoft Corporation(,|$)/.test(sig.subject)) return { ok: false, reason: `${pkg.file} : signature inattendue (${sig.status || '?'} ; ${sig.subject || '?'})` }; // i18n-ignore : journal
    packages.push({ path: dest, ...(pkg.arguments && { arguments: pkg.arguments }) });
  }
  fs.rmSync(cabFile, { force: true });
  // Un script, élevé une fois : chaque paquet sans fenêtre. Codes admis : 0, 3010 et 1641
  // (redémarrage conseillé), 1638 (version plus récente déjà là, Visual C++).
  const steps = packages.map((p) =>
    p.path.toLowerCase().endsWith('.msi')
      ? `$p = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\msiexec.exe') -ArgumentList @('/i', '"${p.path.replace(/'/g, "''")}"', '/qn', '/norestart') -Wait -PassThru -WindowStyle Hidden; if ($ok -notcontains $p.ExitCode) { exit $p.ExitCode }`
      : `$p = Start-Process -FilePath ${quote(p.path)} -ArgumentList @(${(p.arguments ?? []).map(quote).join(', ')}) -Wait -PassThru -WindowStyle Hidden; if ($ok -notcontains $p.ExitCode) { exit $p.ExitCode }`,
  );
  const script = path.join(work, 'installer.ps1');
  fs.writeFileSync(script, ['$ok = @(0, 3010, 1641, 1638)', ...steps, 'exit 0', ''].join('\r\n'), 'utf8');
  const elevated = await powershell(
    `try { $p = Start-Process -FilePath ${quote(POWERSHELL)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '"${script.replace(/'/g, "''")}"'); exit $p.ExitCode } catch { if ($_.Exception.Message -match 'cancel|annul') { exit ${CANCELLED} } else { [Console]::Error.WriteLine($_.Exception.Message); exit 1 } }`,
    ELEVATION_WAIT_MS,
  );
  if (elevated.status === CANCELLED) return { ok: false, cancelled: true, reason: 'installation refusée' }; // i18n-ignore : journal
  if (elevated.status !== 0) return { ok: false, reason: `paquet de Microsoft : code ${elevated.status}${elevated.stderr.trim() ? ` (${elevated.stderr.trim()})` : ''}` }; // i18n-ignore : journal
  return kinect1DriverInstalled() ? { ok: true } : { ok: false, reason: 'Kinect10.dll absente après l’installation' }; // i18n-ignore : journal
}
