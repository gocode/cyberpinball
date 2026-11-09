// Vision 3D : la perspective de la table suit la tête du joueur (« head tracking »), comme une
// vraie fenêtre ouverte sur le plateau. Un capteur (webcam ou Kinect pour Xbox 360) repère la
// tête ; Cyber Pinball calcule son déplacement depuis la position de jeu (le « neutre »), le
// lisse, et l'envoie au plugin VPX « Vision3D » (packages/vpx-vision3d) par UDP local, au
// format d'opentrack. Le plugin déplace le point de vue de VPX à chaque image.
//
// Ce module ne lit ni n'écrit rien : réglage, matériel reconnu, géométrie des capteurs,
// filtrage, format des paquets et textes du menu. app/src/vision3d.ts fait le reste.
//
// Repère commun des positions de tête (centimètres) :
//   x : vers la droite du joueur
//   y : vers le haut (verticale réelle, capteur incliné compris quand il le sait)
//   z : horizontal, du capteur vers le joueur
// Le plugin attend le déplacement dans ce repère (packages/vpx-vision3d/src/vue.h).

import type { Vec3 } from './casque-scene';
import { t } from './i18n';
import type { ObservedUsbDevice } from './model';

/** Identifiant du plugin VPX ([Plugin.Vision3D], plugin.cfg). */
export const VISION3D_PLUGIN = 'Vision3D';
/** Port UDP local écouté par le plugin (celui d'opentrack par défaut). */
export const VISION3D_PORT = 4242;

export type Vision3dMode = 'off' | 'on';
export type Vision3dSourceKind = 'kinect1' | 'webcam';
export type Vision3dSourceChoice = 'auto' | Vision3dSourceKind;

/** Position de jeu de la tête, mesurée par une source, pour une configuration de borne. */
export interface Vision3dNeutral extends Vec3 {
  source: Vision3dSourceKind;
}

export interface Vision3dSetting {
  mode: Vision3dMode;
  /** auto : la Kinect quand elle est prête, sinon une webcam. */
  source: Vision3dSourceChoice;
  /** Position de jeu par configuration de borne (CabinetConfiguration.id) : le capteur n'est pas au même endroit. */
  neutral: Record<string, Vision3dNeutral>;
  /** Champ horizontal de la webcam (degrés), pour estimer la distance de la tête. */
  webcamFovDeg: number;
}

export const DEFAULT_VISION3D: Vision3dSetting = { mode: 'off', source: 'auto', neutral: {}, webcamFovDeg: 70 };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Réglage lu sans faire confiance au fichier : toute valeur douteuse reprend sa valeur par défaut. */
export function parseVision3dSetting(raw: unknown): Vision3dSetting {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const neutral: Record<string, Vision3dNeutral> = {};
  if (r.neutral && typeof r.neutral === 'object') {
    for (const [id, n] of Object.entries(r.neutral as Record<string, unknown>)) {
      const v = (n ?? {}) as Record<string, unknown>;
      if (finite(v.x) && finite(v.y) && finite(v.z) && (v.source === 'kinect1' || v.source === 'webcam')) neutral[id] = { x: v.x, y: v.y, z: v.z, source: v.source };
    }
  }
  return {
    mode: r.mode === 'on' ? 'on' : 'off',
    source: r.source === 'kinect1' || r.source === 'webcam' ? r.source : 'auto',
    neutral,
    webcamFovDeg: finite(r.webcamFovDeg) && r.webcamFovDeg >= 30 && r.webcamFovDeg <= 120 ? r.webcamFovDeg : DEFAULT_VISION3D.webcamFovDeg,
  };
}

// --- Matériel ---------------------------------------------------------------------------------

const MICROSOFT = 0x045e;
/** Kinect pour Xbox 360 et Kinect pour Windows (v1) : caméra, moteur, micros (VID 045E). */
const KINECT1_PIDS = [0x02ae, 0x02ad, 0x02b0, 0x02bf, 0x02be, 0x02c2];
/** La caméra de la Kinect v1 (celle qui voit le squelette) : seulement quand l'adaptateur secteur l'alimente. */
const KINECT1_CAMERA_PIDS = [0x02ae, 0x02bf];

/** La caméra de la Kinect v1 parmi les périphériques USB : son identifiant d'instance, pour lire l'état de son pilote. */
export function kinectCameraOf(usb: readonly ObservedUsbDevice[]): ObservedUsbDevice | undefined {
  return usb.find((d) => d.vid === MICROSOFT && KINECT1_CAMERA_PIDS.includes(d.pid) && !/&MI_/i.test(d.instanceId));
}

/** État du pilote de la caméra de la Kinect, lu dans Windows (deviceStatus de win-displays). */
export interface KinectCameraStatus {
  started: boolean;
  /** Code du Gestionnaire de périphériques : 28 = aucun pilote ; 39, 52 = pilote refusé ou illisible. */
  problem: number;
}
/** Kinect pour Xbox One et Kinect pour Windows v2. */
const KINECT2_PIDS = [0x02c4, 0x02d8, 0x02d9];
/** Classes de pilote d'une caméra pour Windows (Gestionnaire de périphériques : « Caméras », « Périphériques d'images »). */
const CAMERA_CLASSES = ['camera', 'image'];

export interface Vision3dHardware {
  /** Une Kinect v1 est branchée et alimentée (Windows la voit, pilote ou non). */
  kinect1: boolean;
  /** Le pilote de Microsoft (Kinect for Windows Runtime 1.8) est installé. */
  kinect1Driver: boolean;
  kinect2: boolean;
  /** Webcams présentes (nom du Gestionnaire de périphériques), sans les caméras des Kinect. */
  webcams: string[];
  /**
   * Intégrité de la mémoire de Windows activée : elle refuse le pilote de la Kinect v1 (2013,
   * kinectcamera.sys). Cyber Pinball ne la désactive jamais ; il le dit, et prend une webcam.
   */
  memoryIntegrity?: boolean;
  /**
   * La caméra de la Kinect : absente (adaptateur secteur débranché : seuls le moteur et les micros
   * paraissent), ou l'état de son pilote. Non relevé : undefined.
   */
  kinectCamera?: KinectCameraStatus | 'absent';
}

/** Ce que la Vision 3D peut utiliser, d'après les périphériques USB présents. */
export function vision3dHardware(usb: readonly ObservedUsbDevice[], kinect1Driver: boolean, memoryIntegrity = false, cameraStatus?: KinectCameraStatus): Vision3dHardware {
  const isMs = (d: ObservedUsbDevice, pids: number[]) => d.vid === MICROSOFT && pids.includes(d.pid);
  const webcams = usb
    .filter((d) => !isMs(d, KINECT1_PIDS) && !isMs(d, KINECT2_PIDS) && CAMERA_CLASSES.includes((d.deviceClass ?? '').toLowerCase()))
    .map((d) => d.name ?? t('Webcam'));
  return {
    kinect1: usb.some((d) => isMs(d, KINECT1_PIDS)),
    kinect1Driver,
    kinect2: usb.some((d) => isMs(d, KINECT2_PIDS)),
    webcams: [...new Set(webcams)],
    ...(memoryIntegrity && { memoryIntegrity: true }),
    ...(usb.some((d) => isMs(d, KINECT1_PIDS)) && { kinectCamera: kinectCameraOf(usb) ? (cameraStatus ?? { started: true, problem: 0 }) : ('absent' as const) }),
  };
}

export type Vision3dReadiness =
  | { ready: true; source: Vision3dSourceKind; label: string; note?: string }
  | { ready: false; reason: string; installKinectDriver?: true; memoryIntegrity?: true; restart?: true };

/** Le capteur que prendra la prochaine partie, ou pourquoi aucun ne peut servir. */
export function vision3dReadiness(hw: Vision3dHardware, choice: Vision3dSourceChoice = 'auto'): Vision3dReadiness {
  const webcam = hw.webcams[0];
  const kinectReady = hw.kinect1 && hw.kinect1Driver;
  // Kinect branchée, mais son pilote refusé par l'intégrité de la mémoire : une webcam la remplace.
  const blocked = hw.kinect1 && hw.memoryIntegrity;
  const camera = hw.kinectCamera;
  // La Kinect ne peut pas servir maintenant, et pourquoi : sans courant, sans pilote, pilote pas chargé.
  const unusable: Vision3dReadiness | undefined = !hw.kinect1
    ? undefined
    : blocked
      ? { ready: false, reason: kinectBlockedReason(), memoryIntegrity: true }
      : camera === 'absent'
        ? { ready: false, reason: t('Kinect sans courant : branchez son adaptateur secteur (seuls son moteur et ses micros sont vus)') }
        : !hw.kinect1Driver || camera?.problem === 28
          ? { ready: false, reason: t('Kinect détectée, pilote de Microsoft manquant'), installKinectDriver: true }
          : camera && !camera.started
            ? { ready: false, reason: t('Windows n’a pas chargé le pilote de la Kinect (code {code}) : redémarrez le PC, puis débranchez et rebranchez la Kinect', { code: camera.problem }), restart: true }
            : undefined;
  if (choice !== 'webcam') {
    if (hw.kinect1 && !unusable) return { ready: true, source: 'kinect1', label: t('Kinect pour Xbox 360') };
    // Le pilote à installer passe avant la webcam : le joueur a branché sa Kinect pour s'en servir.
    if (unusable && (unusable as { installKinectDriver?: true }).installKinectDriver) return unusable;
    if (unusable && !webcam) return unusable;
    if (choice === 'kinect1' && !hw.kinect1) return { ready: false, reason: t('Kinect pour Xbox 360 introuvable : branchez-la avec son adaptateur secteur') };
  }
  if (webcam) return { ready: true, source: 'webcam', label: webcam, ...(unusable && !unusable.ready && choice !== 'webcam' && { note: blocked ? t('Kinect refusée par l’intégrité de la mémoire de Windows : webcam utilisée') : t('Kinect pas prête ({reason}) : webcam utilisée', { reason: unusable.reason }) }) };
  if (hw.kinect2) return { ready: false, reason: t('La Kinect pour Xbox One n’est pas encore prise en charge : branchez une webcam ou une Kinect pour Xbox 360') };
  return { ready: false, reason: t('Aucune caméra : branchez une webcam ou une Kinect pour Xbox 360') };
}

/** La Kinect v1 et l'intégrité de la mémoire de Windows : pourquoi, et les deux issues. */
export function kinectBlockedReason(): string {
  return t('Windows refuse le pilote de la Kinect pour Xbox 360 (intégrité de la mémoire activée) : désactivez-la puis redémarrez, ou branchez une webcam');
}

/** Ce que dit le journal de VPX (vpinball.log, depuis le lancement) du plugin Vision3D. */
export type Vision3dPluginLog = 'loaded' | 'disabled' | 'failed' | 'absent';

/** Lignes de MsgPluginManager et de Player::Player (VPX 10.8.1) sur le plugin. */
export function vision3dPluginLog(log: string): Vision3dPluginLog {
  if (new RegExp(`Plugin ${VISION3D_PLUGIN} loaded\\b`).test(log)) return 'loaded';
  if (new RegExp(`Plugin ${VISION3D_PLUGIN} was found but is disabled`).test(log)) return 'disabled';
  if (new RegExp(`Plugin ${VISION3D_PLUGIN} (failed to load|invalid library|has an invalid library)`).test(log)) return 'failed';
  return 'absent';
}

/** Bilan d'une partie avec Vision 3D : ce qui a marché, ou où ça a coincé, en clair. */
export function vision3dGameReport(plugin: Vision3dPluginLog, sent: number, failure?: string): { ok: boolean; text: string } {
  if (failure) return { ok: false, text: t('Dernière partie : le capteur ne répondait pas ({reason})', { reason: failure }) };
  if (plugin === 'disabled') return { ok: false, text: t('Dernière partie : VPX avait le module Vision 3D éteint ([Plugin.Vision3D] Enable)') };
  if (plugin === 'failed') return { ok: false, text: t('Dernière partie : VPX n’a pas pu charger le module Vision 3D (voir vpinball.log)') };
  if (plugin === 'absent') return { ok: false, text: t('Dernière partie : VPX n’a pas trouvé le module Vision 3D dans son dossier plugins') };
  if (!sent) return { ok: false, text: t('Dernière partie : module chargé par VPX, mais aucune tête vue par le capteur') };
  return { ok: true, text: t('Dernière partie : module chargé par VPX, {n} positions de la tête envoyées', { n: sent }) };
}

/** Taille annoncée du pilote de Microsoft (manifeste des composants), pour le dire avant de télécharger. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / 1_000_000);
}

/** Libellé et détail de l'entrée « Vision 3D » du menu système. */
export function vision3dMenuText(
  setting: Pick<Vision3dSetting, 'mode'>,
  readiness: Vision3dReadiness,
  options: { driverMb?: number; pluginMissing?: boolean } = {},
): { label: string; detail: string; unavailable: boolean } {
  if (options.pluginMissing) {
    return { label: t('Vision 3D : indisponible'), detail: t('Plugin Vision 3D absent de cette version de Cyber Pinball'), unavailable: true };
  }
  if (!readiness.ready) {
    if (readiness.installKinectDriver) {
      return {
        label: t('Vision 3D : pilote Kinect à installer'),
        detail: options.driverMb
          ? t('{reason} · choisir pour l’installer ({mb} Mo, téléchargé chez Microsoft ; l’installer vaut acceptation de sa licence)', { reason: readiness.reason, mb: options.driverMb })
          : t('{reason} · choisir pour l’installer (téléchargé chez Microsoft ; l’installer vaut acceptation de sa licence)', { reason: readiness.reason }),
        unavailable: false,
      };
    }
    if (readiness.memoryIntegrity) {
      // Choisissable : ouvre la page de Sécurité Windows, où le joueur décide lui-même.
      return { label: t('Vision 3D : Kinect bloquée par Windows'), detail: t('{reason} · choisir pour ouvrir « Isolation du noyau » dans Sécurité Windows', { reason: readiness.reason }), unavailable: false };
    }
    if (readiness.restart) {
      // Choisissable : l'écran dit quoi faire et permet de réinstaller le pilote.
      return { label: t('Vision 3D : Kinect pas prête'), detail: readiness.reason, unavailable: false };
    }
    return { label: t('Vision 3D : indisponible'), detail: readiness.reason, unavailable: true };
  }
  return setting.mode === 'on'
    ? {
        label: t('Vision 3D : activée'),
        detail: [t('{sensor} · la perspective des tables suit votre tête ; recentrer : réglages en partie · choisir pour désactiver', { sensor: readiness.label }), ...(readiness.note ? [readiness.note] : [])].join(' · '),
        unavailable: false,
      }
    : {
        label: t('Vision 3D : désactivée'),
        detail: [t('{sensor} prête · choisir pour que la perspective des tables suive votre tête', { sensor: readiness.label }), ...(readiness.note ? [readiness.note] : [])].join(' · '),
        unavailable: false,
      };
}

// --- Géométrie des capteurs -----------------------------------------------------------------

/** Écart moyen des pupilles d'un adulte (cm) : l'échelle de la webcam. */
export const EYE_DISTANCE_CM = 6.3;

/** Yeux repérés sur une image de webcam, en coordonnées normalisées (0 à 1, image non retournée). */
export interface WebcamEyes {
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
}

/**
 * Position de la tête vue par une webcam. La distance vient de l'écart des yeux à l'image
 * (EYE_DISTANCE_CM) et de la focale déduite du champ horizontal ; le déplacement latéral et
 * vertical en découle. L'image n'est pas retournée : la droite du joueur est à gauche de l'image.
 * undefined : yeux confondus (visage de profil, détection ratée).
 */
export function webcamHead(eyes: WebcamEyes, size: { width: number; height: number }, fovDeg: number): Vec3 | undefined {
  const dx = (eyes.rightX - eyes.leftX) * size.width;
  const dy = (eyes.rightY - eyes.leftY) * size.height;
  const gap = Math.hypot(dx, dy);
  if (!(gap > 2)) return undefined;
  const focal = size.width / 2 / Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const distance = (focal * EYE_DISTANCE_CM) / gap;
  const cx = ((eyes.leftX + eyes.rightX) / 2) * size.width - size.width / 2;
  const cy = ((eyes.leftY + eyes.rightY) / 2) * size.height - size.height / 2;
  return { x: -(cx / focal) * distance, y: -(cy / focal) * distance, z: distance };
}

/**
 * Position de la tête vue par une Kinect v1 : articulation « tête » du squelette (mètres, repère
 * du capteur : x vers la gauche du capteur, donc la droite du joueur qui lui fait face, y en haut,
 * z vers le joueur), redressée d'après le sol vu par le capteur (vFloorClipPlane, normale A, B, C)
 * quand il le voit : un capteur penché vers le joueur ne fait pas croire qu'il se baisse.
 */
export function kinectHead(headM: Vec3, floorNormal?: Vec3): Vec3 {
  let angle = 0;
  if (floorNormal && Math.hypot(floorNormal.x, floorNormal.y, floorNormal.z) > 0.5 && floorNormal.y > 0.3) angle = Math.atan2(floorNormal.z, floorNormal.y);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: headM.x * 100, y: (headM.y * c + headM.z * s) * 100, z: (-headM.y * s + headM.z * c) * 100 };
}

/**
 * Inclinaison à donner au moteur de la Kinect (degrés, -27 à 27) pour que la tête soit au milieu
 * de son champ ; undefined : déjà bien visée (moins de 6° d'écart). Le moteur s'use : réglé une
 * fois au début de la partie, jamais en continu.
 */
export function kinectAim(headM: Vec3, elevationDeg: number): number | undefined {
  const off = (Math.atan2(headM.y, headM.z) * 180) / Math.PI;
  if (Math.abs(off) < 6) return undefined;
  return Math.max(-27, Math.min(27, Math.round(elevationDeg + off)));
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

// --- Lissage et position de jeu --------------------------------------------------------------

/**
 * Filtre « 1 € » (Casiez, Roussel, Vogel, 2012) : très lissé à l'arrêt (pas de tremblement de
 * l'image), presque sans retard quand la tête bouge vite. Une instance par axe.
 */
export class OneEuroFilter {
  private last?: { t: number; x: number; dx: number };
  constructor(
    private readonly minCutoff = 1.0,
    private readonly beta = 0.05,
    private readonly dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tSec: number): number {
    if (!this.last || tSec <= this.last.t) {
      this.last = { t: tSec, x, dx: 0 };
      return x;
    }
    const dt = tSec - this.last.t;
    const rawDx = (x - this.last.x) / dt;
    const dx = this.last.dx + OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.last.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(dx);
    const filtered = this.last.x + OneEuroFilter.alpha(cutoff, dt) * (x - this.last.x);
    this.last = { t: tSec, x: filtered, dx };
    return filtered;
  }

  reset(): void {
    this.last = undefined;
  }
}

export class HeadFilter {
  private readonly axes = [new OneEuroFilter(), new OneEuroFilter(), new OneEuroFilter()] as const;
  filter(p: Vec3, tSec: number): Vec3 {
    return { x: this.axes[0].filter(p.x, tSec), y: this.axes[1].filter(p.y, tSec), z: this.axes[2].filter(p.z, tSec) };
  }
  reset(): void {
    for (const a of this.axes) a.reset();
  }
}

/** Médiane par axe : la position de jeu, insensible à une détection ratée parmi les autres. */
export function medianHead(samples: readonly Vec3[]): Vec3 | undefined {
  if (!samples.length) return undefined;
  const med = (vals: number[]) => {
    const s = [...vals].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  return { x: med(samples.map((p) => p.x)), y: med(samples.map((p) => p.y)), z: med(samples.map((p) => p.z)) };
}

/** Déplacement plafonné (cm) : une détection aberrante ne projette jamais la vue hors de la pièce. */
export const MAX_HEAD_SHIFT_CM = 60;

export function clampShift(d: Vec3): Vec3 {
  const c = (v: number) => Math.max(-MAX_HEAD_SHIFT_CM, Math.min(MAX_HEAD_SHIFT_CM, v));
  return { x: c(d.x), y: c(d.y), z: c(d.z) };
}

/** Paquet UDP au format d'opentrack : x, y, z (cm), lacet, tangage, roulis (degrés), doubles petit-boutistes. */
export function opentrackPacket(d: Vec3): Buffer {
  const b = Buffer.alloc(48);
  b.writeDoubleLE(d.x, 0);
  b.writeDoubleLE(d.y, 8);
  b.writeDoubleLE(d.z, 16);
  return b;
}
