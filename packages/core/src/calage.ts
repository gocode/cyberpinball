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

import { LOCKBAR_DISTANCE_M, LOCKBAR_HEIGHT_M } from './casque';
import { t } from './i18n';
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
export function calibrateMenuText(opts: { vrReady: boolean; headset?: HeadsetMenuState; place?: CabinetPlace }): { detail: string; unavailable: boolean } {
  if (!opts.vrReady) return { detail: t('Réalité virtuelle indisponible : rien à caler'), unavailable: true };
  if (opts.headset !== 'shown') return { detail: t('Mettez le casque, le menu de Cyber Pinball dedans : le calage se fait aux manettes'), unavailable: true };
  const p = opts.place;
  const status =
    p?.lockbarWidth !== undefined && p.lockbarHeight !== undefined
      ? t('Calée : barre avant de {w} cm, à {h} cm du sol', { w: Math.round(p.lockbarWidth * 100), h: Math.round(p.lockbarHeight * 100) })
      : t('Pas encore calée');
  return {
    detail: [
      status,
      t('Touchez la vraie barre avant du bout de la manette, gâchette appuyée : coin gauche, coin droit, puis le milieu. Aussi : les deux poignées tenues 3 s'),
      t('Le Quest garde ce calage tant que sa limite et son sol ne changent pas : après « Ajuster le sol » ou une nouvelle limite, recalez'),
    ].join(' · '),
    unavailable: false,
  };
}
