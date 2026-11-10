// Calage de la borne aux manettes : le joueur touche la vraie barre avant de sa borne, coin gauche
// puis coin droit (et le milieu pour vérifier), avec le bout de la manette, gâchette appuyée. Le
// compagnon du casque donne chaque point dans l'espace de la pièce d'OpenXR (STAGE : mètres, sol à
// y = 0, x à droite, -z devant). Cyber Pinball en déduit :
// - la place de la borne du menu dans le casque (casque.json : x, z, cap, hauteur de la barre) ;
// - la place de la table de VPX ([PlayerVR] Orientation, TableX, TableY, TableZ ; [Player]
//   LockbarWidth, LockbarHeight), par le calcul même de VPX 10.8.1 quand il cale la table sur ses
//   manettes (VRDevice::UpdateVR, m_controllerViewCentering). VPX et le compagnon partagent l'espace
//   de la pièce du runtime : la table tombe sur la vraie barre avant, d'une session à l'autre.
//
// Le Quest garde l'espace de la pièce tant que sa limite (Guardian) et son sol ne changent pas : un
// sol recalé ou une nouvelle limite déplacent l'origine, et le calage est à refaire.

import { GLASS_DROP_M, LOCKBAR_DISTANCE_M, LOCKBAR_HEIGHT_M } from './casque';
import { language, t } from './i18n';
import type { VpxSetting } from './vpx';
import type { HeadsetMenuState } from './vr';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Place de la borne du menu dans la pièce (casque.json) : le sol sous les yeux du joueur, son cap, la barre avant. */
export interface CabinetPlace {
  x: number;
  z: number;
  yaw: number;
  /** Hauteur du dessus de la barre avant (mètres). */
  lockbarHeight?: number;
  /** Largeur de la barre avant, d'un coin à l'autre (mètres). */
  lockbarWidth?: number;
  /** Limite du Quest au moment du calage (roomMoved). */
  room?: RoomBounds;
  /** Posée librement au bureau (pas de vraie borne devant le joueur), pas calée sur une vraie barre avant. */
  free?: boolean;
}

/** Ce qui est devant le joueur : une vraie borne (barre avant à toucher), ou un bureau (placement libre). */
export type CalibrationSetting = 'borne' | 'bureau';

/** Barre avant d'une borne posée librement au bureau : à la hauteur d'une vraie borne (85 à 90 cm). */
export const DESK_LOCKBAR_HEIGHT_M = 0.88;

/**
 * Configuration de Cyber Pinball où la borne se cale : un playfield tourné d'un quart de tour (écran
 * couché en portrait) est une borne ; un playfield à plat, en largeur, un poste de bureau.
 */
export function calibrationSetting(playfieldRotation: number): CalibrationSetting {
  return playfieldRotation === 90 || playfieldRotation === 270 ? 'borne' : 'bureau';
}

/**
 * Borne posée librement (bureau) : la place donnée par le regard du joueur (recentrage), la barre
 * avant à DESK_LOCKBAR_HEIGHT_M, de la largeur par défaut de VPX. Elle ne bouge plus ensuite.
 */
export function freePlace(gaze: { x: number; z: number; yaw: number }): CabinetPlace {
  return { x: gaze.x, z: gaze.z, yaw: gaze.yaw, lockbarHeight: DESK_LOCKBAR_HEIGHT_M, lockbarWidth: DEFAULT_LOCKBAR_WIDTH_M, free: true };
}

/** Fichier de la place de la borne du casque d'une configuration (un calage par configuration). */
export function cabinetPlaceFileName(configurationId: string | undefined): string {
  const safe = configurationId?.replace(/[^\w-]/g, '_');
  return safe ? `casque-${safe}.json` : 'casque.json';
}

/** Largeur d'un plateau standard (20 1/4") plus les 2 1/4" que VPX ajoute pour la barre avant, en cm. */
export const STANDARD_TABLE_WIDTH_CM = (20.25 + 2.25) * 2.54;
/** VPX : 5 cm entre le bas du plateau et le bord de la barre avant (VRDevice, lockbarToPlayfield). */
const LOCKBAR_TO_PLAYFIELD_CM = 5;

/** Étapes du calage : les deux coins, puis le milieu pour vérifier. */
export type CalibrationStep = 'left' | 'right' | 'middle';

function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function length(v: Point3): number {
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * Place de la borne du menu : la barre avant à LOCKBAR_DISTANCE_M devant le joueur, à la hauteur
 * touchée, le joueur face à la borne (perpendiculaire à la barre, du côté où gauche et droite le
 * sont pour lui).
 */
export function lockbarPlace(left: Point3, right: Point3): CabinetPlace {
  const axis = sub(right, left);
  const flat = Math.hypot(axis.x, axis.z) || 1;
  // Devant le joueur : la barre tournée d'un quart de tour (gauche → droite = +x donne -z).
  const forward = { x: axis.z / flat, z: -axis.x / flat };
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
  return {
    x: center.x - forward.x * LOCKBAR_DISTANCE_M,
    z: center.z - forward.z * LOCKBAR_DISTANCE_M,
    yaw: Math.atan2(-forward.x, -forward.z),
    lockbarHeight: center.y,
    lockbarWidth: length(axis),
  };
}

/**
 * Réglages de VPX pour une table posée sur cette barre avant : le calcul de VPX 10.8.1 (calage aux
 * manettes), avec ses réglages par défaut (ControllerLockbarScale 1, ControllerCabYOffset 0) et un
 * plateau de largeur standard pour le petit décalage de 5 cm qui dépend de l'échelle.
 */
export function lockbarVpxSettings(left: Point3, right: Point3, tableWidthCm = STANDARD_TABLE_WIDTH_CM): VpxSetting[] {
  const axis = sub(right, left);
  const angle = Math.atan2(-axis.z, axis.x);
  const width = length(axis) * 100;
  const scale = Math.min(2, Math.max(0.1, width / tableWidthCm));
  const center = { x: -((left.x + right.x) / 2) * 100, y: -((left.y + right.y) / 2) * 100, z: -((left.z + right.z) / 2) * 100 };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const round = (v: number) => String(Math.round(v * 1000) / 1000);
  return [
    { section: 'PlayerVR', key: 'Orientation', value: round((angle * 180) / Math.PI) },
    { section: 'PlayerVR', key: 'TableX', value: round(center.x * c - center.z * s) },
    { section: 'PlayerVR', key: 'TableY', value: round(center.x * s + center.z * c + LOCKBAR_TO_PLAYFIELD_CM * scale) },
    { section: 'PlayerVR', key: 'TableZ', value: '0' },
    { section: 'Player', key: 'LockbarWidth', value: round(width) },
    { section: 'Player', key: 'LockbarHeight', value: round(-center.y) },
  ];
}

/** Écart (cm) entre le point touché au milieu et le milieu de la barre calée : la précision du calage. */
export function calibrationGap(left: Point3, right: Point3, middle: Point3): number {
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
  return length(sub(middle, center)) * 100;
}

/**
 * Coins touchés qui ne font pas une barre avant : trop courte ou trop longue, trop basse ou trop
 * haute, ou penchée (un coin plus haut que l'autre de plus de 5 cm : un coin mal touché). Sinon rien.
 */
export function calibrationProblem(left: Point3, right: Point3): string | undefined {
  const width = length(sub(right, left)) * 100;
  const height = ((left.y + right.y) / 2) * 100;
  const tilt = Math.abs(left.y - right.y) * 100;
  if (width < 40 || width > 120) return t('Les deux coins sont à {n} cm l’un de l’autre : une barre avant fait de 40 à 120 cm. Recommencez par le coin gauche.', { n: Math.round(width) });
  if (height < 50 || height > 130) return t('La barre avant serait à {n} cm du sol : le sol du casque est sans doute mal calé (réglages du Quest, « Ajuster le sol »).', { n: Math.round(height) });
  if (tilt > 5) return t('Un coin est {n} cm plus haut que l’autre : un coin a été mal touché. Recommencez par le coin gauche.', { n: Math.round(tilt) });
  return undefined;
}

/**
 * Coins de la barre avant dans l'espace de la borne du casque (casque.ts) : la borne est posée pour
 * que le milieu de la barre soit à LOCKBAR_DISTANCE_M devant le joueur, à LOCKBAR_HEIGHT_M (la
 * hauteur réelle passe par l'ancre du compagnon, anchorHeight).
 */
export function lockbarMarks(widthM: number): Point3[] {
  return [-1, 1].map((side) => ({ x: (side * widthM) / 2, y: LOCKBAR_HEIGHT_M, z: -LOCKBAR_DISTANCE_M }));
}

/** Hauteur de l'ancre du compagnon : la borne du casque montée ou descendue à la hauteur de la vraie barre avant. */
export function anchorHeight(place: CabinetPlace): number {
  return place.lockbarHeight !== undefined && Number.isFinite(place.lockbarHeight) ? place.lockbarHeight - LOCKBAR_HEIGHT_M : 0;
}

/**
 * Détail de l'entrée « Caler la borne » (Réalité virtuelle) : indisponible (grisée, avec sa raison)
 * tant que le menu n'est pas dans le casque ; sinon où en est le calage, comment le faire, et la
 * limite du Quest (sa pièce change avec sa limite et son sol).
 */
export function calibrateMenuText(opts: { vrReady: boolean; headset?: HeadsetMenuState; place?: CabinetPlace; setting?: CalibrationSetting }): { detail: string; unavailable: boolean } {
  if (!opts.vrReady) return { detail: t('Réalité virtuelle indisponible : rien à caler'), unavailable: true };
  if (opts.headset !== 'shown') return { detail: t('Mettez le casque, le menu de Cyber Pinball dedans : le calage se fait aux manettes'), unavailable: true };
  const p = opts.place;
  const status =
    p?.lockbarWidth !== undefined && p.lockbarHeight !== undefined
      ? p.free
        ? t('Posée au bureau, barre avant à {h} cm du sol', { h: Math.round(p.lockbarHeight * 100) })
        : t('Calée : barre avant de {w} cm, à {h} cm du sol', { w: Math.round(p.lockbarWidth * 100), h: Math.round(p.lockbarHeight * 100) })
      : t('Pas encore calée');
  return {
    detail: [
      status,
      opts.setting === 'bureau'
        ? t('Au bureau : la borne se pose devant vous (A), ou sur deux points du bord du bureau touchés du bout de la manette. Dans le casque : ≡ de la manette gauche')
        : t('Touchez la vraie barre avant du bout de la manette, gâchette appuyée : coin gauche, coin droit, puis le milieu. Dans le casque : ≡ de la manette gauche'),
      t('Le Quest garde ce calage tant que sa limite et son sol ne changent pas : après « Ajuster le sol » ou une nouvelle limite, recalez'),
    ].join(' · '),
    unavailable: false,
  };
}

/** Largeur de la barre avant de VPX par défaut ([Player] LockbarWidth, 70 cm) : celle d'une borne pas calée. */
export const DEFAULT_LOCKBAR_WIDTH_M = 0.7;

/** Borne calée aux manettes : la hauteur et la largeur de sa vraie barre avant sont connues. */
export function isCalibrated(place: CabinetPlace | undefined): boolean {
  return place?.lockbarWidth !== undefined && place.lockbarHeight !== undefined;
}

/**
 * Coins de la barre avant de la borne du casque, dans la pièce : à LOCKBAR_DISTANCE_M devant la place
 * du joueur, dans son cap, à la hauteur calée (sinon LOCKBAR_HEIGHT_M). L'inverse de lockbarPlace.
 */
export function placeLockbar(place: CabinetPlace): { left: Point3; right: Point3 } {
  const forward = { x: -Math.sin(place.yaw), z: -Math.cos(place.yaw) };
  const along = { x: -forward.z, z: forward.x };
  const half = (place.lockbarWidth ?? DEFAULT_LOCKBAR_WIDTH_M) / 2;
  const center = { x: place.x + forward.x * LOCKBAR_DISTANCE_M, y: place.lockbarHeight ?? LOCKBAR_HEIGHT_M, z: place.z + forward.z * LOCKBAR_DISTANCE_M };
  return {
    left: { x: center.x - along.x * half, y: center.y, z: center.z - along.z * half },
    right: { x: center.x + along.x * half, y: center.y, z: center.z + along.z * half },
  };
}

/** Ce que VPX lit de la table pour la poser en VR (readVpxGlass) : largeur du plateau et vitre du bas, en cm. */
export interface VpxTableGeometry {
  widthCm: number;
  glassBottomCm: number;
}

/**
 * Place de la table de VPX pour une partie dans le casque : celle de la borne du casque, toujours,
 * pour que le menu et le jeu soient au même endroit. Sa barre avant (largeur, hauteur) est celle de
 * la borne, calée ou par défaut. VPX pose le plateau à « barre avant − vitre du bas × échelle », 5 cm
 * plus 5 cm à l'échelle devant elle (VRDevice) : sur une vraie borne, sa barre avant tombe sur la
 * vraie et le plateau à la profondeur de la table. Au bureau (place libre), rien de vrai à toucher :
 * avec la table connue (`table`), son plateau est recalé sur celui du menu (TableZ, TableY), le bas
 * au droit de la barre avant, GLASS_DROP_M sous elle ; sinon, jusqu'à 20 cm plus bas (vitre de 21,6 cm
 * de la plupart des tables, essai du 10 novembre 2026).
 */
export function placeVpxSettings(place: CabinetPlace, table?: VpxTableGeometry): VpxSetting[] {
  const { left, right } = placeLockbar(place);
  const tableWidthCm = table ? table.widthCm + 2.25 * 2.54 : STANDARD_TABLE_WIDTH_CM;
  const settings = lockbarVpxSettings(left, right, tableWidthCm);
  if (!place.free || !table) return settings;
  const width = Number(settings.find((s) => s.key === 'LockbarWidth')!.value);
  const scale = Math.min(2, Math.max(0.1, width / tableWidthCm));
  const round = (v: number) => String(Math.round(v * 1000) / 1000);
  return settings.map((s) =>
    s.key === 'TableZ'
      ? { ...s, value: round(scale * table.glassBottomCm - GLASS_DROP_M * 100) }
      : s.key === 'TableY'
        ? { ...s, value: round(Number(s.value) - LOCKBAR_TO_PLAYFIELD_CM * (1 + scale)) }
        : s,
  );
}

/**
 * Un point de la pièce dans l'espace de la borne du casque posée à `place` : l'inverse de l'ancre du
 * compagnon (position, puis lacet autour de la verticale, hauteur selon anchorHeight). Les repères du
 * calage (point pris, point à toucher) se dessinent dans cet espace.
 */
export function roomToCabinet(point: Point3, place: CabinetPlace): Point3 {
  const dx = point.x - place.x;
  const dz = point.z - place.z;
  const c = Math.cos(place.yaw);
  const s = Math.sin(place.yaw);
  return { x: c * dx - s * dz, y: point.y - anchorHeight(place), z: s * dx + c * dz };
}

/**
 * VPX 10.8.1 borne TableX et TableY à ±100 cm (Settings_properties.inl, PlayerVR) : une barre avant à
 * plus d'un mètre environ du centre de la limite du Quest, et la table de la partie n'est plus sur la borne.
 */
export const VPX_TABLE_OFFSET_MAX_CM = 100;

/** La place écrite pour VPX dépasse ce qu'il accepte : ce qu'il faut faire. Sinon rien. */
export function vpxPlaceProblem(settings: readonly VpxSetting[]): string | undefined {
  const far = settings.some((s) => s.section === 'PlayerVR' && (s.key === 'TableX' || s.key === 'TableY') && Math.abs(Number(s.value)) > VPX_TABLE_OFFSET_MAX_CM);
  return far
    ? t('La borne est à plus d’un mètre du centre de la limite du Quest : VPX ne peut pas y poser ses tables (décalage limité à 1 m). Refaites la limite du Quest autour de la borne, puis recalez.')
    : undefined;
}

/**
 * La tête du joueur que VPX a vue en recentrant la table sur son regard (5 du pavé) : l'inverse de son
 * calcul (VRDevice::UpdateVR, m_headsetViewCentering), d'après la place qu'il réécrit en quittant
 * ([PlayerVR] Orientation, TableX, TableY) et la place du joueur ([Player] ScreenPlayerX, ScreenPlayerY ;
 * 0 et −10 cm par défaut). Comparée à la tête vue par le compagnon au même moment, elle dit si VPX et
 * le compagnon partagent la même pièce. Mètres et radians, sens d'OpenXR.
 */
export function vpxRecenteredHead(v: { orientation: number; tableX: number; tableY: number; playerX?: number; playerY?: number }): { x: number; z: number; yaw: number } {
  const a = (v.orientation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x1 = v.tableX - (v.playerX ?? 0);
  const y1 = v.tableY - (v.playerY ?? -10);
  return { x: -(c * x1 + s * y1) / 100, z: -(-s * x1 + c * y1) / 100, yaw: a };
}

/** Limite du Quest (rectangle de la pièce, mètres) gardée avec le calage, pour voir si elle a changé depuis. */
export interface RoomBounds {
  width: number;
  depth: number;
}

/**
 * La pièce du Quest a changé depuis le calage (limite refaite, autre limite fixe) : son origine a
 * sans doute bougé, et la borne n'est plus sur la vraie. Écart de plus de 5 cm sur un côté.
 */
export function roomMoved(saved: RoomBounds | undefined, now: RoomBounds | undefined): boolean {
  if (!saved || !now) return false;
  return Math.abs(saved.width - now.width) > 0.05 || Math.abs(saved.depth - now.depth) > 0.05;
}

/** Hauteur des yeux plausible pour un joueur debout ou assis (mètres) ; au-delà, le sol du Quest est mal réglé. */
export const EYES_MIN_M = 1.0;
export const EYES_MAX_M = 2.1;

/** Yeux mesurés trop bas ou trop haut : le sol du Quest est à refaire, et le chemin du réglage. Sinon rien. */
export function eyeHeightProblem(eyes: number | undefined): string | undefined {
  if (eyes === undefined || (eyes >= EYES_MIN_M && eyes <= EYES_MAX_M)) return undefined;
  return t('Vos yeux sont mesurés à {h} m du sol : le sol du Quest est mal réglé, et la borne serait à vos pieds. Avant de caler, dans le Quest : Paramètres rapides > Paramètres > Configuration de l’environnement > Limite > « Définir le niveau du sol », puis touchez le sol avec la manette.', {
    h: (Math.round(eyes * 100) / 100).toLocaleString(language() === 'en' ? 'en-US' : 'fr-FR'),
  });
}
