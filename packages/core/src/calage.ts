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
  /** Pose des manettes de VPX (prise en main) par rapport à leur bout, mesurée au calage (gripOffset). */
  grip?: GripOffset;
  /** Type de limite du Quest au moment du calage (staleCalibration). */
  boundary?: BoundaryKind;
  /**
   * La tête du joueur au calage, mains sur les coins de la barre avant (au sol de la pièce, mètres) : la
   * référence physique que les têtes relevées en partie retrouvent si la pièce est gardée (roomFromHeads).
   */
  head?: { x: number; z: number };
  /** Position de repos des manettes posées sur la barre, apprise après un calage à la main (recalage automatique). */
  rest?: RestReference;
}

/**
 * VPX s'aligne sur la pose « grip » des manettes (le milieu de la prise en main, XRInputHandler.h), le calage
 * de Cyber Pinball sur leur bout (pose de visée) : mesurés ensemble au calage du menu, les deux poses donnent
 * l'écart, d'où le calage en partie (VPX aligné sur les manettes) tombe sur la même barre avant. Mètres.
 */
export interface GripOffset {
  /** Le milieu des prises au-dessus du milieu des bouts. */
  up: number;
  /** Le milieu des prises en arrière (vers le joueur) du milieu des bouts. */
  back: number;
  /** Écart des prises sur écart des bouts. */
  widthRatio: number;
}

/** Ce qui est devant le joueur : une vraie borne (barre avant à toucher), ou un bureau (placement libre). */
export type CalibrationSetting = 'borne' | 'bureau';

/** Barre avant d'une borne posée librement au bureau : à la hauteur d'une vraie borne (85 à 90 cm). */
export const DESK_LOCKBAR_HEIGHT_M = 0.88;
/**
 * Au bureau, la barre avant posée sous les yeux mesurés (dans la même pièce que VPX) : 55 cm, comme
 * au calage du 10 novembre 2026 (yeux à 1,59 m, vraie barre touchée à 1,05-1,13 m). Le sol du Quest
 * n'y entre jamais : faux de 70 cm ce jour-là, il mettait la borne par terre.
 */
export const DESK_EYES_TO_LOCKBAR_M = 0.55;

/**
 * Configuration de Cyber Pinball où la borne se cale : un playfield tourné d'un quart de tour (écran
 * couché en portrait) est une borne ; un playfield à plat, en largeur, un poste de bureau.
 */
export function calibrationSetting(playfieldRotation: number): CalibrationSetting {
  return playfieldRotation === 90 || playfieldRotation === 270 ? 'borne' : 'bureau';
}

/**
 * Borne posée librement (bureau) : la place donnée par le regard du joueur (recentrage), la barre
 * avant DESK_EYES_TO_LOCKBAR_M sous les yeux mesurés (`eyes`, hauteur dans la pièce), à défaut à
 * DESK_LOCKBAR_HEIGHT_M, de la largeur par défaut de VPX. Elle ne bouge plus ensuite.
 */
export function freePlace(gaze: { x: number; z: number; yaw: number }, eyes?: number): CabinetPlace {
  const lockbarHeight = eyes !== undefined && Number.isFinite(eyes) && eyes > DESK_EYES_TO_LOCKBAR_M ? Math.min(2.5, eyes - DESK_EYES_TO_LOCKBAR_M) : DESK_LOCKBAR_HEIGHT_M;
  return { x: gaze.x, z: gaze.z, yaw: gaze.yaw, lockbarHeight, lockbarWidth: DEFAULT_LOCKBAR_WIDTH_M, free: true };
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
 * Les deux coins de la barre avant dans l'ordre gauche, droite, vus du joueur : décidé par la tête au
 * moment du calage (le joueur est toujours devant la barre, la borne part à l'opposé de la tête),
 * jamais par l'ordre des points touchés ni par la main (essai du 10 novembre 2026 : les deux gâchettes
 * à 60 ms d'écart, et la borne posée dans le dos selon celle qui arrivait la première).
 */
export function orderCorners(a: Point3, b: Point3, head: { x: number; z: number }): [Point3, Point3] {
  const place = lockbarPlace(a, b);
  const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  // Vers la borne : de la place du joueur au milieu de la barre.
  const toCabinet = { x: center.x - place.x, z: center.z - place.z };
  const headSide = (head.x - center.x) * toCabinet.x + (head.z - center.z) * toCabinet.z;
  return headSide > 0 ? [b, a] : [a, b];
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
  const tilt = Math.abs(left.y - right.y) * 100;
  if (width < 40 || width > 120) return t('Les deux coins sont à {n} cm l’un de l’autre : une barre avant fait de 40 à 120 cm. Recommencez par le coin gauche.', { n: Math.round(width) });
  // Pas de hauteur refusée : les points touchés sont dans la pièce que VPX reçoit aussi, quel que soit
  // le sol du Quest (essai du 10 novembre 2026 : sol faux de 70 cm, chaque calage refusé « à 184 cm du sol »).
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
export function calibrateMenuText(opts: { vrReady: boolean; headset?: HeadsetMenuState; place?: CabinetPlace; setting?: CalibrationSetting; combo?: string }): { detail: string; unavailable: boolean } {
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
      ...(opts.combo ? [t('À tout moment, au menu comme en partie : {combo}', { combo: opts.combo })] : []),
      t('Le Quest garde ce calage avec une limite de pièce ; en limite fixe, il déplace la pièce chaque fois que le casque est remis, et le calage revient d’office'),
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
 * Place de la table de VPX pour une partie dans le casque : son plateau exactement sur celui du menu,
 * en position, en hauteur et en taille, partout, vraie borne calée comprise (« le jeu doit se caler sur
 * la même taille et la même hauteur », 10 novembre 2026). VPX pose le plateau à « barre avant − vitre
 * du bas × échelle », 5 cm plus 5 cm à l'échelle devant elle, à l'échelle « LockbarWidth / (largeur
 * de la table + 2 1/4") » (VRDevice). Avec la table connue (`table`, readVpxGlass) : TableZ et TableY
 * mettent le bas de son plateau au droit de la barre avant, GLASS_DROP_M sous elle (le menu pose son
 * écran plus haut, au ras de la vitre : MENU_GLASS_DROP_M, là où VPX a la vitre de sa table) ; et
 * avec la largeur du plateau du menu (`menuWidthM`, menuPlayfield), LockbarWidth donne à son plateau
 * cette largeur. Sans la table, la pose seule (jusqu'à 20 cm plus bas : vitre de 21,6 cm de la plupart
 * des tables).
 */
export function placeVpxSettings(place: CabinetPlace, table?: VpxTableGeometry, menuWidthM?: number): VpxSetting[] {
  const { left, right } = placeLockbar(place);
  const tableWidthCm = table ? table.widthCm + 2.25 * 2.54 : STANDARD_TABLE_WIDTH_CM;
  const settings = lockbarVpxSettings(left, right, tableWidthCm);
  if (!table) return settings;
  const touched = Number(settings.find((s) => s.key === 'LockbarWidth')!.value);
  const clampScale = (w: number) => Math.min(2, Math.max(0.1, w / tableWidthCm));
  const width = menuWidthM !== undefined && menuWidthM > 0 ? (menuWidthM * 100 * tableWidthCm) / table.widthCm : touched;
  const scale = clampScale(width);
  const round = (v: number) => String(Math.round(v * 1000) / 1000);
  return settings.map((s) =>
    s.key === 'TableZ'
      ? { ...s, value: round(scale * table.glassBottomCm - GLASS_DROP_M * 100) }
      : s.key === 'TableY'
        ? { ...s, value: round(Number(s.value) - LOCKBAR_TO_PLAYFIELD_CM * clampScale(touched) - LOCKBAR_TO_PLAYFIELD_CM) }
        : s.key === 'LockbarWidth'
          ? { ...s, value: round(width) }
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

/** Type de limite du Quest : fixe (la pièce recentrée sur la tête à chaque retour du casque) ou de pièce (gardée). */
export type BoundaryKind = 'fixe' | 'piece';

/** Le type de limite d'après ce que le compagnon en dit (« piece aucune » ou « piece L P »). */
export function boundaryOf(keeping: RoomKeeping | undefined): BoundaryKind | undefined {
  return keeping === 'recentred' ? 'fixe' : keeping === 'kept' ? 'piece' : undefined;
}

/** Un calage qui ne correspond plus à la limite du Quest : `signature` pour ne le dire qu'une fois, `log` pour le journal. */
export interface StaleCalibration {
  signature: string;
  log: string;
}

/**
 * Le calage gardé correspond-il encore à la limite du Quest (demande du 13 novembre 2026 : « dis-le une fois,
 * propose le calage une fois au menu ») ? Non quand le type a changé (limite fixe ↔ limite de pièce) ou que la
 * limite de pièce n'a plus la même taille (roomMoved, plus de 5 cm sur un côté). Un calage d'avant ce relevé
 * sans limite de pièce gardée a un type inconnu : rien à dire. Une borne posée au bureau non plus.
 */
export function staleCalibration(place: CabinetPlace | undefined, keeping: RoomKeeping | undefined, room: RoomBounds | undefined): StaleCalibration | undefined {
  if (!place || !isCalibrated(place) || place.free) return undefined;
  const now = boundaryOf(keeping);
  const then = place.boundary ?? (place.room ? 'piece' : undefined);
  if (!now || !then) return undefined;
  const size = (r: RoomBounds | undefined) => (r ? `${r.width.toFixed(2)} × ${r.depth.toFixed(2)} m` : 'taille inconnue'); // i18n-ignore : journal
  const name = (k: BoundaryKind) => (k === 'fixe' ? 'limite fixe' : 'limite de pièce'); // i18n-ignore : journal
  if (now !== then)
    return { signature: `${then}>${now}${now === 'piece' ? ` ${size(room)}` : ''}`, log: `calage fait en ${name(then)}, Quest maintenant en ${name(now)}${now === 'piece' ? ` (${size(room)})` : ''}` }; // i18n-ignore : journal
  if (now === 'piece' && roomMoved(place.room, room)) return { signature: `piece ${size(place.room)}>${size(room)}`, log: `limite de pièce de ${size(place.room)} au calage, ${size(room)} maintenant` }; // i18n-ignore : journal
  return undefined;
}

/**
 * Pièce gardée ou déplacée, mesurée sur des repères physiques (demande du 13 novembre 2026 : mesurer plutôt que
 * deviner). Deux mesures : la tête pendant la partie face à la tête au calage (le joueur joue où il a calé, mains
 * sur la barre avant), et la barre avant d'un recalage face à la précédente. Seuils figés par calage-partie.test.ts.
 */
export const ROOM_KEPT_HEAD_CM = 30;
export const ROOM_KEPT_HEAD_DEG = 20;
export const ROOM_KEPT_RECALIBRATION_CM = 5;
export const ROOM_KEPT_RECALIBRATION_DEG = 3;
/** Relevés de la tête (toutes les 5 s en partie) qu'il faut au moins pour juger. */
export const ROOM_HEAD_MIN_SAMPLES = 3;

export interface RoomMeasure {
  cm: number;
  deg: number;
  kept: boolean;
  /** Relevés de la tête pris en compte (1 pour un recalage). */
  samples: number;
}

const median = (values: readonly number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
/** L'angle signé de b par rapport à a, en degrés, entre -180 et 180. */
const turn = (a: number, b: number) => ((((((b - a) * 180) / Math.PI + 540) % 360) + 360) % 360) - 180;

/**
 * La tête pendant la partie (relevés du compagnon en veille, « tete x y z lacet ») face à la tête au calage : la
 * médiane des positions et des caps, pour qu'un regard de côté ne compte pas. undefined : pas de tête gardée au
 * calage (calage d'avant ce relevé) ou trop peu de relevés.
 */
export function roomFromHeads(place: CabinetPlace | undefined, heads: readonly { x: number; z: number; yaw: number }[]): RoomMeasure | undefined {
  if (!place?.head || heads.length < ROOM_HEAD_MIN_SAMPLES) return undefined;
  const cm = Math.hypot(median(heads.map((h) => h.x)) - place.head.x, median(heads.map((h) => h.z)) - place.head.z) * 100;
  const deg = Math.abs(median(heads.map((h) => turn(place.yaw, h.yaw))));
  return { cm, deg, kept: cm <= ROOM_KEPT_HEAD_CM && deg <= ROOM_KEPT_HEAD_DEG, samples: heads.length };
}

/** La barre avant d'un recalage face à la précédente (placeGap) : la même vraie barre, donc l'écart de la pièce. */
export function roomFromRecalibration(previous: CabinetPlace, next: CabinetPlace): RoomMeasure {
  const { cm, deg } = placeGap(previous, next);
  return { cm, deg, kept: cm <= ROOM_KEPT_RECALIBRATION_CM && deg <= ROOM_KEPT_RECALIBRATION_DEG, samples: 1 };
}

/** Ce que dit le journal : « pièce gardée » ou « pièce déplacée de X cm », avec l'écart et ce qui l'a mesuré. */
export function roomMeasureText(m: RoomMeasure, by: string): string {
  const gap = `${Math.round(m.cm)} cm et ${Math.round(m.deg)}°`; // i18n-ignore : journal
  return m.kept ? `pièce gardée (${by} : écart ${gap})` : `pièce déplacée de ${Math.round(m.cm)} cm et ${Math.round(m.deg)}° (${by})`; // i18n-ignore : journal
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

/**
 * Pièce de l'application, pas du casque (essai du 10 novembre 2026). Le runtime d'Oculus garde
 * « Réinitialiser la vue » de Link par application, sous une clé tirée du chemin de son exécutable
 * (« Request App Should Recenter: <pid> (D_CyberPinball_app_resources_app_natif_cyberpinball-casque) »
 * au journal du service), d'une session à l'autre et même après une reconnexion de Link. Le compagnon
 * recentré garde donc sa pièce tournée ; VPX, jamais recentré, garde celle d'origine : la table derrière
 * le joueur. Le compagnon part donc d'une copie dont le dossier change à chaque recentrage
 * (`compagnon-<génération>`) : une clé neuve, que le runtime n'a jamais recentrée, comme celle de VPX.
 */
export const COMPANION_KEY_FILE = 'compagnon.json';

/** Dossier de la copie du compagnon pour une génération de clé (dans le dossier de la VR). */
export function companionKeyFolder(generation: number): string {
  return `compagnon-${generation}`;
}

/** Génération de clé gardée (`compagnon.json`), ou 0 : jamais lancée sous une clé à elle. */
export function readCompanionKey(text: string | undefined): number {
  try {
    const generation = (JSON.parse(text ?? '') as { generation?: unknown }).generation;
    return typeof generation === 'number' && Number.isInteger(generation) && generation >= 1 ? generation : 0;
  } catch {
    return 0;
  }
}

/** Têtes relevées par le compagnon en veille pendant une partie, comparées à la borne du casque. */
export interface GameHeadSummary {
  samples: number;
  /** Relevés où le joueur était tourné de plus de 100° par rapport à la borne (dos à elle). */
  turned: number;
  /** Écart moyen du regard à l'axe de la borne, en degrés (valeur absolue). */
  meanAngle: number;
  /** Distance moyenne, au sol, de la tête au milieu de la barre avant, en mètres. */
  meanDistance: number;
}

/** Au-delà, le joueur joue dos à la borne calée (degrés). */
export const TURNED_AWAY_DEG = 100;

export function gameHeadSummary(heads: readonly { x: number; z: number; yaw: number }[], place: CabinetPlace): GameHeadSummary {
  const { left, right } = placeLockbar(place);
  const mid = { x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 };
  let turned = 0;
  let angles = 0;
  let distances = 0;
  for (const h of heads) {
    const a = Math.abs((((((h.yaw - place.yaw) * 180) / Math.PI + 540) % 360) + 360) % 360 - 180);
    angles += a;
    if (a > TURNED_AWAY_DEG) turned++;
    distances += Math.hypot(h.x - mid.x, h.z - mid.z);
  }
  const n = heads.length;
  return { samples: n, turned, meanAngle: n ? angles / n : 0, meanDistance: n ? distances / n : 0 };
}

/**
 * La table de VPX n'était pas sur la borne du casque : le joueur a joué dos à elle (au moins 3 relevés,
 * dont 60 % tourné de plus de 100°). Ce que dit l'écran du calage, ou undefined.
 */
export function roomMismatchProblem(summary: GameHeadSummary | undefined): string | undefined {
  if (!summary || summary.samples < 3 || summary.turned < summary.samples * 0.6) return undefined;
  return t('À la dernière partie, vous jouiez dos à la borne calée : la table de VPX n’était pas sur elle (pièce différente pour VPX, par exemple après « Réinitialiser la vue » de Link). Recalez, puis relancez la partie.');
}

// --- Calage en partie (12 novembre 2026) --------------------------------------------------------
//
// Retirer le casque et le remettre déplace la pièce du Quest dès qu'il n'a pas de limite de pièce (limite fixe
// ou désactivée : il recentre la pièce sur la tête au réveil, sans rien dire aux applications) ; Link ne donne
// aucune ancre aux applications PC (XR_FB_spatial_entity absent). Le calage se refait donc d'un geste, au menu
// comme en partie : en partie, le plugin met VPX en pause et lui fait aligner sa table sur les manettes posées
// sur la barre avant (VRControllerCalibration, VRDevice::RenderFrame), avec les réglages qui font tomber ce calage
// de VPX (sur les prises) exactement sur celui de Cyber Pinball (sur les bouts) : ControllerLockbarScale,
// ControllerCabYOffset, que VPX relit à chaque image, et la hauteur reprise par pas d'un centimètre (VRUp, VRDown).

/** L'écart entre les prises et les bouts des manettes, posées sur les coins de la barre avant. */
export function gripOffset(tips: readonly [Point3, Point3], grips: readonly [Point3, Point3]): GripOffset | undefined {
  const axis = sub(tips[1], tips[0]);
  const flat = Math.hypot(axis.x, axis.z);
  const width = length(axis);
  if (flat < 0.1 || width < 0.1) return undefined;
  const forward = { x: axis.z / flat, z: -axis.x / flat };
  const tip = { x: (tips[0].x + tips[1].x) / 2, y: (tips[0].y + tips[1].y) / 2, z: (tips[0].z + tips[1].z) / 2 };
  const grip = { x: (grips[0].x + grips[1].x) / 2, y: (grips[0].y + grips[1].y) / 2, z: (grips[0].z + grips[1].z) / 2 };
  const d = sub(grip, tip);
  const offset = { up: d.y, back: -(d.x * forward.x + d.z * forward.z), widthRatio: length(sub(grips[1], grips[0])) / width };
  // Une prise à plus de 25 cm du bout, ou un écart sans rapport : pas les deux poses d'une même manette.
  if (Math.abs(offset.up) > 0.25 || Math.abs(offset.back) > 0.25 || offset.widthRatio < 0.6 || offset.widthRatio > 1.6) return undefined;
  return offset;
}

/** Ce que VPX 10.8.1 fait de deux points des manettes quand il aligne sa table dessus (VRDevice::RenderFrame). */
export interface VpxCentering {
  orientation: number;
  tableX: number;
  tableY: number;
  tableZ: number;
  lockbarWidth: number;
  lockbarHeight: number;
}

export function vpxControllerCentering(left: Point3, right: Point3, tableWidthCm: number, lockbarScale = 1, cabYOffset = 0): VpxCentering {
  const axis = sub(right, left);
  const angle = Math.atan2(-axis.z, axis.x);
  const lockbarWidth = length(axis) * 100 * lockbarScale;
  const scale = Math.min(2, Math.max(0.1, lockbarWidth / tableWidthCm));
  const center = { x: -((left.x + right.x) / 2) * 100, y: -((left.y + right.y) / 2) * 100, z: -((left.z + right.z) / 2) * 100 };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    orientation: (angle * 180) / Math.PI,
    tableX: center.x * c - center.z * s,
    tableY: center.x * s + center.z * c + cabYOffset + LOCKBAR_TO_PLAYFIELD_CM * scale,
    tableZ: 0,
    lockbarWidth,
    lockbarHeight: -center.y,
  };
}

/** Les prises des manettes attendues quand leurs bouts touchent ces deux coins (l'écart mesuré au calage du menu). */
export function expectedGrips(left: Point3, right: Point3, grip: GripOffset): [Point3, Point3] {
  const axis = sub(right, left);
  const flat = Math.hypot(axis.x, axis.z) || 1;
  const forward = { x: axis.z / flat, z: -axis.x / flat };
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
  const g = { x: center.x - forward.x * grip.back, y: center.y + grip.up, z: center.z - forward.z * grip.back };
  const half = { x: (axis.x / 2) * grip.widthRatio, y: (axis.y / 2) * grip.widthRatio, z: (axis.z / 2) * grip.widthRatio };
  return [sub(g, half), { x: g.x + half.x, y: g.y + half.y, z: g.z + half.z }];
}

/** Réglages du calage en partie : VPX ([PlayerVR]) et le plugin ([Plugin.CyberPinball] CalibrateHeight, en cm). */
export interface InGameCalibration {
  lockbarScale: number;
  cabYOffset: number;
  heightSteps: number;
  /** L'écart prises-bouts vient d'un calage du menu (sinon : les prises prises pour les bouts). */
  measured: boolean;
}

/**
 * Les réglages qui font tomber l'alignement de VPX sur les prises des manettes sur la place que Cyber Pinball
 * donne à la table (placeVpxSettings) pour les mêmes bouts : largeur (ControllerLockbarScale), recul
 * (ControllerCabYOffset, en cm) et hauteur (pas d'un centimètre, VPX met TableZ à 0). Les écarts ne dépendent
 * pas de la place de la barre : calculés sur la barre calée, ils valent pour la barre touchée en partie.
 */
export function inGameCalibration(place: CabinetPlace, table?: VpxTableGeometry, menuWidthM?: number): InGameCalibration {
  const grip = place.grip ?? { up: 0, back: 0, widthRatio: 1 };
  const { left, right } = placeLockbar(place);
  const desired = Object.fromEntries(placeVpxSettings(place, table, menuWidthM).map((s) => [s.key, Number(s.value)]));
  const tableWidthCm = table ? table.widthCm + 2.25 * 2.54 : STANDARD_TABLE_WIDTH_CM;
  const [gl, gr] = expectedGrips(left, right, grip);
  const gripWidthCm = length(sub(gr, gl)) * 100;
  const lockbarScale = Math.min(2, Math.max(0.5, desired.LockbarWidth! / gripWidthCm));
  const sim = vpxControllerCentering(gl, gr, tableWidthCm, lockbarScale, 0);
  const round = (v: number, d = 1000) => Math.round(v * d) / d;
  return {
    lockbarScale: round(lockbarScale),
    cabYOffset: round(Math.min(50, Math.max(-150, desired.TableY! - sim.tableY))),
    heightSteps: Math.max(-60, Math.min(60, Math.round(desired.TableZ! + desired.LockbarHeight! - sim.lockbarHeight))),
    measured: Boolean(place.grip),
  };
}

/** VPX a aligné sa table sur les manettes pendant la partie (« calage-partie » du plugin) : de quoi retrouver la barre. */
export interface VpxSavedPlace {
  orientation: number;
  tableX: number;
  tableY: number;
}

/**
 * La barre avant touchée en partie, d'après la place que VPX réécrit en quittant ([PlayerVR] Orientation,
 * TableX, TableY : VRDevice::SaveVRSettings) et les réglages du calage en partie : l'inverse de
 * vpxControllerCentering, les prises ramenées aux bouts. La hauteur et la largeur restent celles du calage
 * (le sol du Quest ne bouge pas quand il recentre la pièce : 1,01 à 1,04 m sur trois calages le 12 novembre).
 */
export function placeFromVpxCentering(saved: VpxSavedPlace, place: CabinetPlace, calibration: InGameCalibration, table?: VpxTableGeometry, menuWidthM?: number): CabinetPlace {
  const grip = place.grip ?? { up: 0, back: 0, widthRatio: 1 };
  const desired = Object.fromEntries(placeVpxSettings(place, table, menuWidthM).map((s) => [s.key, Number(s.value)]));
  const tableWidthCm = table ? table.widthCm + 2.25 * 2.54 : STANDARD_TABLE_WIDTH_CM;
  const scale = Math.min(2, Math.max(0.1, desired.LockbarWidth! / tableWidthCm));
  const a = (saved.orientation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const y = saved.tableY - calibration.cabYOffset - LOCKBAR_TO_PLAYFIELD_CM * scale;
  const dx = saved.tableX * c + y * s;
  const dz = -saved.tableX * s + y * c;
  const axis = { x: c, z: -s };
  const forward = { x: axis.z, z: -axis.x };
  const tip = { x: -dx / 100 + forward.x * grip.back, z: -dz / 100 + forward.z * grip.back };
  const half = (place.lockbarWidth ?? DEFAULT_LOCKBAR_WIDTH_M) / 2;
  const h = place.lockbarHeight ?? LOCKBAR_HEIGHT_M;
  const next = lockbarPlace({ x: tip.x - axis.x * half, y: h, z: tip.z - axis.z * half }, { x: tip.x + axis.x * half, y: h, z: tip.z + axis.z * half });
  return { ...place, x: next.x, z: next.z, yaw: next.yaw };
}

/** L'écart entre deux places de la borne : au sol (cm) et en cap (degrés). */
export function placeGap(a: CabinetPlace, b: CabinetPlace): { cm: number; deg: number } {
  const la = placeLockbar(a);
  const lb = placeLockbar(b);
  const ma = { x: (la.left.x + la.right.x) / 2, z: (la.left.z + la.right.z) / 2 };
  const mb = { x: (lb.left.x + lb.right.x) / 2, z: (lb.left.z + lb.right.z) / 2 };
  const deg = Math.abs(((((b.yaw - a.yaw) * 180) / Math.PI + 540) % 360) - 180);
  return { cm: Math.hypot(mb.x - ma.x, mb.z - ma.z) * 100, deg };
}

/**
 * L'écart dit par le runtime quand la pièce du Quest bouge pendant une session (« piece-changee pose x y z
 * lacet » : l'origine nouvelle vue dans l'ancienne, XrEventDataReferenceSpaceChangePending) : au sol et en cap.
 */
export function roomChangeGap(line: string): { cm: number; deg: number } | undefined {
  const m = /^piece-changee pose (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/.exec(line);
  if (!m) return undefined;
  const deg = Math.abs((((Number(m[4]) * 180) / Math.PI + 540) % 360) - 180);
  return { cm: Math.hypot(Number(m[1]), Number(m[3])) * 100, deg };
}

/**
 * Le Quest garde-t-il sa pièce quand le casque est retiré puis remis ? Avec une limite de pièce (des bords lus,
 * « piece L P »), oui ; en limite fixe ou sans limite (« piece aucune »), il la recentre sur la tête au réveil.
 */
export type RoomKeeping = 'kept' | 'recentred';

/**
 * La tête au port du casque (« tete-au-port x z lacet »), mesurée sur un repère physique : la tête au calage
 * (`place.head`, mains sur la barre avant), plus de seuil deviné sur l'origine de la pièce (13 novembre 2026).
 * Un seul relevé, pris où le joueur met le casque : une indication au journal ; le verdict vient des têtes de la
 * partie (roomFromHeads). Sans tête gardée au calage, l'écart à l'origine de la pièce (`fromPlace` faux).
 */
export function headAtWear(line: string, place?: CabinetPlace): { cm: number; deg: number; fromPlace: boolean } | undefined {
  const m = /^tete-au-port (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/.exec(line);
  if (!m) return undefined;
  const [x, z, yaw] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (place?.head) return { cm: Math.hypot(x - place.head.x, z - place.head.z) * 100, deg: Math.abs(turn(place.yaw, yaw)), fromPlace: true };
  return { cm: Math.hypot(x, z) * 100, deg: Math.abs(turn(0, yaw)), fromPlace: false };
}

/**
 * Bilan du geste du calage pendant une partie, d'après les lignes du plugin (casque-vpx.txt, 13 novembre 2026 :
 * « deux joysticks tenus 3 s, rien du tout ») : où il s'est arrêté, pour que la panne se voie au journal.
 * undefined : plugin d'avant le calage en partie (aucune ligne « calage actif=… »).
 */
export function inGameCalibrationReport(block: string): string | undefined {
  const armed = /^calage actif=(\d)/m.exec(block);
  if (!armed) return undefined;
  const count = (re: RegExp) => (block.match(re) ?? []).length;
  const passive = /^passif raison=(\S+)/m.exec(block);
  const clicks = count(/^calage-clic \S+=1/gm);
  const held = count(/^calage-combinaison tenue/gm);
  const opened = count(/^calage-etape ouverte/gm);
  const triggers = count(/^calage-gachette/gm);
  const done = count(/^calage-partie .*resultat=ok/gm);
  // Les actions de VPX arrivées au plugin (« action-vue id=… », la première de chacune dans la partie).
  const seen = [...block.matchAll(/^action-vue id=(\d+)/gm)].map((m) => Number(m[1]));
  const seenText = seen.length ? ` ; actions de VPX reçues : ${[...new Set(seen)].sort((a, b) => a - b).join(', ')}` : ''; // i18n-ignore : journal
  const facts = `${clicks} clic(s) des joysticks reçu(s) par le plugin, combinaison tenue ${held} fois, calage ouvert ${opened} fois, ${triggers} gâchette(s), ${done} calage(s) fait(s)${seenText}`; // i18n-ignore : journal
  const flippers = seen.some((id) => id <= 3);
  const why =
    armed[1] !== '1'
      ? 'touches du calage pas liées dans l’INI de la partie (plugin sans réglage Calibrate)' // i18n-ignore : journal
      : passive
        ? `plugin passif (${passive[1]}) : il n’écoute plus aucune action de VPX` // i18n-ignore : journal
        : clicks === 0
          ? seen.length === 0
            ? 'aucune action de VPX n’est arrivée au plugin' // i18n-ignore : journal
            : flippers
              ? 'aucun clic des joysticks : geste pas fait, ou VPX ne transmet pas les clics alors que les gâchettes arrivent (liaisons Custom1, Custom2)' // i18n-ignore : journal
              : 'aucun clic des joysticks, ni aucune gâchette : les manettes du casque n’atteignent pas le plugin' // i18n-ignore : journal
          : held === 0
            ? 'les deux clics n’ont jamais été tenus ensemble' // i18n-ignore : journal
            : opened === 0
              ? 'combinaison tenue, mais l’étape du calage ne s’est pas ouverte (pause de VPX pas venue)' // i18n-ignore : journal
              : triggers === 0
                ? 'calage ouvert, aucune gâchette' // i18n-ignore : journal
                : done === 0
                  ? 'gâchette sans calage fini (touche F13 pas postée à VPX)' // i18n-ignore : journal
                  : 'calage fait'; // i18n-ignore : journal
  return clicks || passive || armed[1] !== '1' || seen.length ? `${facts} ; ${why}` : undefined;
}

/** Les moments où le calage pourrait s'ouvrir de lui-même dans le casque. */
export type CalibrationOfferReason = 'premier-port' | 'casque-remis' | 'limite-changee' | 'piece-perimee';

/**
 * Le calage s'ouvre-t-il de lui-même (décision du joueur, 13 novembre 2026) ? Seulement quand le casque a été
 * retiré puis remis et que le Quest est en limite fixe (il vient de déplacer la pièce) ; jamais au premier port
 * du casque, jamais en limite de pièce. Le reste du temps : les deux joysticks, ou « Caler la borne ».
 */
export function shouldOfferCalibration(reason: CalibrationOfferReason, keeping: RoomKeeping | undefined): boolean {
  // Calage périmé (limite changée de type ou de taille, staleCalibration) : proposé une fois, l'appelant le garde.
  if (reason === 'limite-changee') return true;
  return reason === 'casque-remis' && keeping === 'recentred';
}

/** Ce que dit l'écran du calage d'une pièce recentrée à chaque retour du casque, ou undefined. */
export function roomKeepingAdvice(keeping: RoomKeeping | undefined, combo: string | undefined): string | undefined {
  if (keeping !== 'recentred') return undefined;
  return combo
    ? t('Le Quest est en limite fixe : il déplace la pièce chaque fois que le casque est remis. Recalez d’un geste ({combo}), ou créez une limite de pièce dans le Quest.', { combo })
    : t('Le Quest est en limite fixe : il déplace la pièce chaque fois que le casque est remis. Recalez, ou créez une limite de pièce dans le Quest.');
}

/** Changements de pièce reçus par VPX pendant la partie (vpinball.log) : « Réinitialiser la vue » fait en jeu. */
export function vpxRoomChanges(log: string): number {
  return (log.match(/OPENXR: Reference Space Change pending for Session/g) ?? []).length;
}

// --- Recalage automatique (option, 13 novembre 2026) ---------------------------------------------------------
//
// Les deux manettes posées sur la barre avant, immobiles, suivies par le casque : la borne se recale d'elle-même.
// Jamais en main : une manette tenue bouge de plusieurs millimètres et de plus d'un degré en une seconde ; posée,
// elle ne bouge que du bruit du suivi. Posées, elles ne reposent pas comme tenues du bout sur les coins (essai du
// 13 novembre 2026 : 10 cm d'écart, la borne déplacée à tort) : leur position de repos est apprise à la première
// pose qui suit un calage à la main (RestReference, gardée avec la place), puis retrouvée. Pas de hauteur absolue :
// le sol que Link donne peut changer d'une connexion à l'autre (33 cm le même jour) ; l'écart des deux manettes et
// leur niveau suffisent, et la hauteur de la barre est corrigée avec le reste. Au menu seulement : en partie, VPX a
// le casque, et le runtime ne donne les manettes qu'à l'application qui a le regard (session sans focus).

/** Immobiles pendant au moins ce temps (secondes). */
export const AUTO_RECAL_STILL_S = 1;
/** Bout de chaque manette dans une boule de ce rayon pendant ce temps (millimètres). */
export const AUTO_RECAL_STILL_MM = 4;
/** Et tournée de moins que ceci (degrés). */
export const AUTO_RECAL_STILL_DEG = 1.5;
/** Écart des deux bouts : celui de la position de repos apprise, à ceci près ; et les deux à niveau (centimètres). */
export const AUTO_RECAL_MATCH_CM = 2.5;
/** Apprentissage (première pose après un calage à la main) : écart à la barre calée et hauteur, à ceci près (cm). */
export const AUTO_RECAL_LEARN_CM = 8;
export const AUTO_RECAL_LEARN_HEIGHT_CM = 10;
/** Relevés plus espacés que ceci : la suite est rompue (secondes). */
export const AUTO_RECAL_GAP_S = 0.3;
/** En deçà de cet écart, la pièce est gardée : rien n'est réécrit (centimètres, degrés). */
export const AUTO_RECAL_MIN_CM = 1;
export const AUTO_RECAL_MIN_DEG = 1;

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Un relevé du compagnon (« repos … ») : les bouts des manettes gauche et droite, leur orientation, l'instant (s). */
export interface RestSample {
  t: number;
  tips: readonly [Point3, Point3];
  rot: readonly [Quat, Quat];
}

/**
 * La position de repos des manettes posées sur la barre, dans le repère de la place calée : la « barre » que font
 * leurs deux bouts (milieu au sol, cap), sa hauteur sous celle de la vraie barre (`dy`), et l'écart des bouts.
 */
export interface RestReference {
  x: number;
  z: number;
  yaw: number;
  dy: number;
  width: number;
}

/** L'angle entre deux orientations (degrés). */
export function quatAngle(a: Quat, b: Quat): number {
  const dot = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

/** Un vecteur au sol tourné de `a` autour de la verticale (même sens que le cap des places). */
const rotateFlat = (v: { x: number; z: number }, a: number) => ({ x: v.x * Math.cos(a) + v.z * Math.sin(a), z: -v.x * Math.sin(a) + v.z * Math.cos(a) });

/**
 * Les manettes posées peuvent-elles être sur la barre ? À niveau (2,5 cm), et : avec une position de repos apprise,
 * écartées comme elle (2,5 cm) ; sans elle et en apprentissage (`learning`, juste après un calage à la main), écartées
 * comme la barre calée (8 cm) et à sa hauteur (10 cm). La gauche est la manette gauche (ordre du compagnon).
 */
export function restGate(tips: readonly [Point3, Point3], place: CabinetPlace | undefined, learning: boolean): boolean {
  if (!place || !isCalibrated(place) || place.free) return false;
  const spacing = Math.hypot(tips[1].x - tips[0].x, tips[1].z - tips[0].z);
  if (Math.abs(tips[0].y - tips[1].y) * 100 > AUTO_RECAL_MATCH_CM) return false;
  if (place.rest) return Math.abs(spacing - place.rest.width) * 100 <= AUTO_RECAL_MATCH_CM;
  if (!learning) return false;
  const height = (tips[0].y + tips[1].y) / 2;
  return Math.abs(spacing - place.lockbarWidth!) * 100 <= AUTO_RECAL_LEARN_CM && Math.abs(height - place.lockbarHeight!) * 100 <= AUTO_RECAL_LEARN_HEIGHT_CM;
}

/**
 * Pourquoi des manettes posées et immobiles ne recalent pas (le journal le dit, pour qu'un essai se lise du premier
 * coup) ; undefined : elles passent (restGate). Mêmes seuils que restGate.
 */
export function restGateReason(tips: readonly [Point3, Point3], place: CabinetPlace | undefined, learning: boolean): string | undefined {
  if (restGate(tips, place, learning)) return undefined;
  if (!place || !isCalibrated(place)) return 'pas de borne calée'; // i18n-ignore : journal
  if (place.free) return 'borne posée au bureau, pas sur une vraie barre'; // i18n-ignore : journal
  const cm = (m: number) => (Math.round(m * 1000) / 10).toFixed(1).replace('.', ',');
  const level = Math.abs(tips[0].y - tips[1].y);
  if (level * 100 > AUTO_RECAL_MATCH_CM) return `manettes pas à niveau : ${cm(level)} cm de différence de hauteur (tolérance ${AUTO_RECAL_MATCH_CM} cm)`; // i18n-ignore : journal
  const spacing = Math.hypot(tips[1].x - tips[0].x, tips[1].z - tips[0].z);
  if (place.rest) return `écart hors tolérance : ${cm(Math.abs(spacing - place.rest.width))} cm (manettes écartées de ${cm(spacing)} cm, ${cm(place.rest.width)} cm appris, tolérance ${AUTO_RECAL_MATCH_CM} cm)`; // i18n-ignore : journal
  if (!learning) return 'position de repos pas encore apprise : calez à la main, puis posez les manettes sur la barre'; // i18n-ignore : journal
  const height = (tips[0].y + tips[1].y) / 2;
  return `apprentissage refusé : manettes écartées de ${cm(spacing)} cm pour une barre de ${cm(place.lockbarWidth!)} cm (tolérance ${AUTO_RECAL_LEARN_CM} cm), à ${cm(Math.abs(height - place.lockbarHeight!))} cm de sa hauteur (tolérance ${AUTO_RECAL_LEARN_HEIGHT_CM} cm)`; // i18n-ignore : journal
}

/** La position de repos apprise : les deux bouts posés, vus depuis la place calée à l'instant. */
export function restReference(place: CabinetPlace, tips: readonly [Point3, Point3]): RestReference {
  const r = lockbarPlace(tips[0], tips[1]);
  const local = rotateFlat({ x: r.x - place.x, z: r.z - place.z }, -place.yaw);
  return { x: local.x, z: local.z, yaw: r.yaw - place.yaw, dy: (place.lockbarHeight ?? r.lockbarHeight!) - r.lockbarHeight!, width: r.lockbarWidth! };
}

/**
 * Suit les relevés des manettes au repos et dit quand recaler : `push` rend les deux bouts (moyennés sur la
 * seconde immobile) une fois, puis plus rien tant que les manettes ne sont pas reparties (réarmé dès qu'un relevé
 * ne passe plus `gate`, ou qu'une manette n'est plus suivie : `push(undefined)`).
 */
export class RestWatch {
  private window: RestSample[] = [];
  private armed = true;

  push(sample: RestSample | undefined, gate: (tips: readonly [Point3, Point3]) => boolean): [Point3, Point3] | undefined {
    if (!sample || !gate(sample.tips)) {
      this.window = [];
      this.armed = true;
      return undefined;
    }
    const last = this.window[this.window.length - 1];
    if (last && sample.t - last.t > AUTO_RECAL_GAP_S) this.window = [];
    this.window.push(sample);
    // Garde la dernière seconde : du plus ancien relevé utile au dernier.
    while (this.window.length > 1 && sample.t - this.window[1]!.t >= AUTO_RECAL_STILL_S) this.window.shift();
    const first = this.window[0]!;
    // Bougé (en main, ou en train d'être posé) : la seconde repart de ce relevé.
    const moved = this.window.some((s) => [0, 1].some((h) => length(sub(s.tips[h]!, first.tips[h]!)) * 1000 > AUTO_RECAL_STILL_MM || quatAngle(s.rot[h]!, first.rot[h]!) > AUTO_RECAL_STILL_DEG));
    if (moved) {
      this.window = [sample];
      return undefined;
    }
    if (!this.armed || sample.t - first.t < AUTO_RECAL_STILL_S) return undefined;
    this.armed = false;
    const mean = (h: 0 | 1): Point3 => {
      const n = this.window.length;
      return this.window.reduce((acc, s) => ({ x: acc.x + s.tips[h].x / n, y: acc.y + s.tips[h].y / n, z: acc.z + s.tips[h].z / n }), { x: 0, y: 0, z: 0 });
    };
    return [mean(0), mean(1)];
  }
}

/**
 * La place recalée sur les deux bouts posés, d'après la position de repos apprise (`previous.rest`) : la place qui
 * remet cette position sur les bouts vus, cap, position et hauteur de la barre (le sol a pu changer) ; le reste du
 * calage gardé (dimensions, limite, prises) ; la tête au calage suit la barre, du même déplacement.
 */
export function autoRecalibratedPlace(previous: CabinetPlace & { rest: RestReference }, tips: readonly [Point3, Point3]): CabinetPlace {
  const r = lockbarPlace(tips[0], tips[1]);
  const yaw = r.yaw - previous.rest.yaw;
  const off = rotateFlat({ x: previous.rest.x, z: previous.rest.z }, yaw);
  const next: CabinetPlace = { ...previous, x: r.x - off.x, z: r.z - off.z, yaw, lockbarHeight: r.lockbarHeight! + previous.rest.dy };
  if (previous.head) {
    // La tête dans le repère de l'ancienne place, reposée dans la nouvelle.
    const local = rotateFlat({ x: previous.head.x - previous.x, z: previous.head.z - previous.z }, -previous.yaw);
    const world = rotateFlat(local, yaw);
    next.head = { x: next.x + world.x, z: next.z + world.z };
  }
  return next;
}
