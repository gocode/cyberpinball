// Le menu dans le casque : où poser les écrans de la borne dans la réalité virtuelle.
//
// Le compagnon natif (packages/casque-vr) recopie chaque écran de la borne et le montre dans le
// casque en panneau plat, à la pose et à la taille calculées ici : une borne vue du joueur, le
// playfield couché devant lui et incliné, le DMD (ou FullDMD), le fronton et le topper debout au
// bout du plateau, chacun à sa taille réelle (EDID, ou taille saisie dans l'assistant).
//
// Espace de la borne : mètres, origine au sol sous les yeux du joueur au moment du recentrage,
// x à droite, y en haut, -z devant lui (conventions d'OpenXR). Le compagnon y ajoute la place et
// le cap du joueur.

import type { Rect, RoleId, Rotation } from './model';
import type { RemoteButton } from './remote';

/**
 * Boutons des manettes du casque (Touch du Quest ; compagnon : « bouton <nom> 1|0 ») et le bouton
 * de la borne que chacun tient au menu : gâchettes = flippers, A = Start, B = Exit, poignées =
 * MagnaSave. Les noms sont ceux des actions OpenXR du compagnon (packages/casque-vr/src/casque.cpp).
 */
export const HEADSET_BUTTONS = {
  'batteur-gauche': 'previous',
  'batteur-droit': 'next',
  start: 'confirm',
  exit: 'exit',
  'magnasave-gauche': 'zone',
  'magnasave-droit': 'zone',
} as const satisfies Record<string, RemoteButton>;

export type HeadsetButton = keyof typeof HEADSET_BUTTONS;

export function isHeadsetButton(name: string): name is HeadsetButton {
  return Object.hasOwn(HEADSET_BUTTONS, name);
}

/** Hauteur de la barre avant au-dessus du sol (VPX : [Player] LockbarHeight, 85 cm par défaut). */
export const LOCKBAR_HEIGHT_M = 0.85;
/** Distance des yeux au bord avant du plateau. */
export const LOCKBAR_DISTANCE_M = 0.3;
/** Pente du plateau (degrés) : celle d'une borne réglée, 6,5°. */
export const PLAYFIELD_SLOPE_DEG = 6.5;
/** Le plateau est sous la vitre, un peu plus bas que la barre avant. */
const GLASS_DROP_M = 0.05;
/** Écart entre la tête de la borne et le bout du plateau, et entre deux panneaux de la tête. */
const HEAD_GAP_M = 0.1;
const PANEL_GAP_M = 0.02;

/**
 * Plus grand côté minimal du playfield (mètres) : celui d'une borne de 42 pouces. Un poste de bureau
 * (playfield de 17 pouces, 38 cm) donnerait sinon une borne jouet, posée bas et facile à manquer
 * (premier essai dans un Quest 2, 9 novembre 2026).
 */
export const MIN_PLAYFIELD_M = 0.93;

/** Taille par défaut d'un écran dont on ne connaît que les pixels (largeur en mètres). */
const DEFAULT_WIDTH_M: Readonly<Record<RoleId, number>> = { playfield: 0.93, backglass: 0.7, dmd: 0.4, topper: 0.6 };

export interface HeadsetSource {
  role: RoleId;
  /** Rectangle du rôle sur le bureau (pixels physiques), celui que le compagnon recopie. */
  rect: Rect;
  /** Taille réelle de l'écran entier et sa définition, pour la taille réelle du panneau. */
  screenCm?: { width: number; height: number };
  screenPx?: { width: number; height: number };
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface HeadsetPanel {
  role: RoleId;
  rect: Rect;
  /** Centre du panneau dans l'espace de la borne (mètres). */
  position: { x: number; y: number; z: number };
  orientation: Quaternion;
  /** Taille du panneau (mètres), largeur le long de l'image recopiée. */
  width: number;
  height: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const axis = (x: number, y: number, z: number, angle: number): Quaternion => ({ x: x * Math.sin(angle / 2), y: y * Math.sin(angle / 2), z: z * Math.sin(angle / 2), w: Math.cos(angle / 2) });

/** a puis b appliqué avant : rotation composée a·b. */
export function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Vecteur tourné par q. */
export function rotateVector(q: Quaternion, v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const r = multiply(multiply(q, { ...v, w: 0 }), { x: -q.x, y: -q.y, z: -q.z, w: q.w });
  return { x: r.x, y: r.y, z: r.z };
}

/** Taille réelle (mètres) du rectangle d'un rôle. */
export function panelSize(source: HeadsetSource): { width: number; height: number } {
  const { rect, screenCm, screenPx } = source;
  if (screenCm && screenPx && screenCm.width > 0 && screenCm.height > 0 && screenPx.width > 0 && screenPx.height > 0) {
    return { width: (rect.width * screenCm.width) / screenPx.width / 100, height: (rect.height * screenCm.height) / screenPx.height / 100 };
  }
  const width = DEFAULT_WIDTH_M[source.role];
  return { width, height: (width * rect.height) / Math.max(1, rect.width) };
}

/**
 * Les panneaux de la borne virtuelle. `playfieldRotation` : rotation horaire qui met l'image du
 * playfield droite pour le joueur (edgeRotation du bord des flippers). Les autres écrans sont
 * supposés droits dans Windows.
 */
export function headsetPanels(sources: readonly HeadsetSource[], playfieldRotation: Rotation): HeadsetPanel[] {
  const panels: HeadsetPanel[] = [];
  const slope = rad(PLAYFIELD_SLOPE_DEG);
  const front = { y: LOCKBAR_HEIGHT_M - GLASS_DROP_M, z: -LOCKBAR_DISTANCE_M };
  let far = { y: front.y, z: front.z - 1.0 };

  const playfield = sources.find((s) => s.role === 'playfield');
  if (playfield) {
    const real = panelSize(playfield);
    const grow = Math.max(1, MIN_PLAYFIELD_M / Math.max(real.width, real.height));
    const size = { width: real.width * grow, height: real.height * grow };
    // Longueur du plateau vue du joueur : la hauteur de l'image, ou sa largeur si elle est tournée d'un quart.
    const quarter = playfieldRotation === 90 || playfieldRotation === 270;
    const length = quarter ? size.width : size.height;
    // Couché (image vers le haut, son haut devant le joueur), tourné pour être droit, puis incliné.
    // Cyber Pinball dessine le playfield tourné de `playfieldRotation` dans le sens horaire (bas de
    // l'interface vers le bord des flippers) : ce bord-là revient vers le joueur.
    const orientation = multiply(axis(1, 0, 0, slope), multiply(axis(0, 1, 0, rad(playfieldRotation)), axis(1, 0, 0, -Math.PI / 2)));
    const center = { x: 0, y: front.y + (length / 2) * Math.sin(slope), z: front.z - (length / 2) * Math.cos(slope) };
    panels.push({ role: 'playfield', rect: playfield.rect, position: center, orientation, ...size });
    far = { y: front.y + length * Math.sin(slope), z: front.z - length * Math.cos(slope) };
  }

  // Tête de la borne, debout face au joueur, de bas en haut : DMD, fronton, topper.
  const upright: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
  let bottom = far.y + HEAD_GAP_M;
  const z = far.z - HEAD_GAP_M;
  for (const role of ['dmd', 'backglass', 'topper'] as const) {
    const source = sources.find((s) => s.role === role);
    if (!source) continue;
    const size = panelSize(source);
    panels.push({ role, rect: source.rect, position: { x: 0, y: bottom + size.height / 2, z }, orientation: upright, ...size });
    bottom += size.height + PANEL_GAP_M;
  }
  return panels;
}

/** Les lignes « panneau … » du protocole du compagnon (packages/casque-vr/src/casque.cpp), puis « fin ». */
export function headsetProtocol(panels: readonly HeadsetPanel[]): string[] {
  const n = (v: number) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(6).replace(/\.?0+$/, ''));
  return [
    ...panels.map((p) =>
      [
        'panneau',
        p.role,
        Math.round(p.rect.x),
        Math.round(p.rect.y),
        Math.round(p.rect.width),
        Math.round(p.rect.height),
        n(p.position.x),
        n(p.position.y),
        n(p.position.z),
        n(p.orientation.x),
        n(p.orientation.y),
        n(p.orientation.z),
        n(p.orientation.w),
        n(p.width),
        n(p.height),
      ].join(' '),
    ),
    'fin',
  ];
}
