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
 * Place de la table de VPX pour une partie dans le casque : son plateau exactement sur celui du menu,
 * en position, en hauteur et en taille, partout, vraie borne calée comprise (« le jeu doit se caler sur
 * la même taille et la même hauteur », 10 novembre 2026). VPX pose le plateau à « barre avant − vitre
 * du bas × échelle », 5 cm plus 5 cm à l'échelle devant elle, à l'échelle « LockbarWidth / (largeur
 * de la table + 2 1/4") » (VRDevice). Avec la table connue (`table`, readVpxGlass) : TableZ et TableY
 * mettent le bas de son plateau au droit de la barre avant, GLASS_DROP_M sous elle, comme le menu ; et
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

/** Changements de pièce reçus par VPX pendant la partie (vpinball.log) : « Réinitialiser la vue » fait en jeu. */
export function vpxRoomChanges(log: string): number {
  return (log.match(/OPENXR: Reference Space Change pending for Session/g) ?? []).length;
}
