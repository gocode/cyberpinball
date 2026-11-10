// Le menu dans le casque : les écrans posés là où sont ceux de la vraie borne, sans caisson
// (décision du 9 novembre 2026, après l'aspect « M2 : borne en volume »).
//
// Les panneaux de headsetPanels (casque.ts) portent les écrans ; la borne calée (calage.ts), ils
// tombent sur les vrais. Le compagnon les dessine dans la couche de projection, avec la profondeur,
// et y ajoute la scène d'ici, mate et sans texture : le sol, le halo de la teinte de la table autour
// des écrans de la tête, et pendant le calage les repères des coins de la barre avant. Ni caisson,
// ni cadre, ni mur : la vraie borne est là. Rien ne se pose sur l'image du playfield ; rien ne bouge.
//
// Trois formes, dans l'espace de la borne (mètres, comme casque.ts), couleurs sRGB « #rrggbbaa » :
//   boîte  : pavé centré, orienté, faces de sa couleur (dessous à part) ;
//   quad   : rectangle du plan XY local (face vers +z), couleur dégradée du haut (+y) vers le bas ;
//   disque : disque horizontal, couleur dégradée du centre vers le bord.

import { multiply, rotateVector, type HeadsetPanel, type Quaternion } from './casque';

export type Vec3 = { x: number; y: number; z: number };

export type ScenePrimitive =
  | { kind: 'boite'; center: Vec3; orientation: Quaternion; size: Vec3; color: string; bottom?: string }
  | { kind: 'quad'; center: Vec3; orientation: Quaternion; width: number; height: number; top: string; bottom: string }
  | { kind: 'disque'; center: Vec3; radius: number; inner: string; outer: string };

// Couleurs de la charte (docs/design-system/tokens.css).
export const SCENE_COLORS = {
  void: '#030807',
  surface: '#07110f',
  sunken: '#040b0a',
  line: '#17302b',
  lineStrong: '#24504a',
  /** Sarcelle de la marque : le halo des cadres quand la table n'a pas de teinte. */
  halo: '#1c8f80',
  /** Vert signal : les repères du calage (coins de la barre avant). */
  signal: '#8be23a',
} as const;

/** Côté des repères du calage (plots posés sur les coins de la barre avant). */
// Plots du calage : nets, bien visibles (essai du 10 novembre 2026 : un repère net du point à toucher).
const MARK_M = 0.035;
/** Halo de la teinte autour des écrans de la tête : largeur et opacité. */
export const HALO_M = 0.04;
export const HALO_ALPHA = 0.1;
/** Sol : éclaircissement sous la borne, éteint à 1,5 m de son centre ; le reste à perte de vue. */
const FLOOR_GLOW_M = 1.5;
const FLOOR_M = 12;
/** Petit recul pour que deux surfaces voisines ne se battent pas dans le tampon de profondeur. */
const EPS = 0.0005;

const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
const rz = (angle: number): Quaternion => ({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) });

/** Couleur « #rrggbb » et opacité (0 à 1) en « #rrggbbaa ». */
export function rgba(hex: string, alpha = 1): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex.slice(0, 7).toLowerCase()}${a.toString(16).padStart(2, '0')}`;
}

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Couleur translucide telle que la direction artistique la voit : les maquettes (CSS) mélangent les
 * couleurs en sRGB, le casque en lumière linéaire. Sur un fond sombre, un halo à 10 % y ressortirait
 * huit fois plus fort. L'opacité est donc convertie pour que le mélange linéaire sur `over` donne la
 * couleur du mélange sRGB.
 */
export function seen(hex: string, alpha: number, over: string): string {
  if (alpha <= 0 || alpha >= 1) return rgba(hex, alpha);
  let target = 0;
  let span = 0;
  for (let i = 0; i < 3; i++) {
    const c = channel(hex, i);
    const b = channel(over, i);
    target += toLinear(b + alpha * (c - b)) - toLinear(b);
    span += toLinear(c) - toLinear(b);
  }
  return rgba(hex, Math.abs(span) < 1e-6 ? alpha : target / span);
}

/** Mélange de deux couleurs « #rrggbb » (t = part de b). */
function mix(a: string, b: string, t: number): string {
  const c = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) * (1 - t) + c(b, i) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Point du repère local d'un panneau, dans l'espace de la borne. */
function local(panel: HeadsetPanel, x: number, y: number, z: number): Vec3 {
  const r = rotateVector(panel.orientation, { x, y, z });
  return { x: panel.position.x + r.x, y: panel.position.y + r.y, z: panel.position.z + r.z };
}

/** Quatre bandes autour d'un rectangle w × h du plan local (le halo), du bord intérieur `inner` vers l'extérieur. */
function ring(
  panel: HeadsetPanel,
  inner: { w: number; h: number },
  band: number,
  z: number,
  colors: { inside: string; outside: string },
): ScenePrimitive[] {
  const q = panel.orientation;
  const out: ScenePrimitive[] = [];
  // Haut et bas : le « haut » du quad est son bord extérieur pour le haut, intérieur pour le bas.
  out.push({ kind: 'quad', center: local(panel, 0, inner.h / 2 + band / 2, z), orientation: q, width: inner.w + 2 * band, height: band, top: colors.outside, bottom: colors.inside });
  out.push({ kind: 'quad', center: local(panel, 0, -inner.h / 2 - band / 2, z), orientation: q, width: inner.w + 2 * band, height: band, top: colors.inside, bottom: colors.outside });
  // Côtés : le quad tourné d'un quart, son « haut » vers l'extérieur.
  out.push({ kind: 'quad', center: local(panel, -inner.w / 2 - band / 2, 0, z), orientation: multiply(q, rz(Math.PI / 2)), width: inner.h, height: band, top: colors.outside, bottom: colors.inside });
  out.push({ kind: 'quad', center: local(panel, inner.w / 2 + band / 2, 0, z), orientation: multiply(q, rz(-Math.PI / 2)), width: inner.h, height: band, top: colors.outside, bottom: colors.inside });
  return out;
}

/**
 * La scène autour des écrans : le sol et les repères du calage (`marks`). Plus de halo ni d'ombre
 * autour des écrans de la tête (essai du 10 novembre 2026) : les écrans sont des couches « quad »,
 * recomposées à chaque image du casque, et tout ombrage dessiné dans la couche de projection, à la
 * cadence du compagnon, se décalait d'eux quand la tête bougeait. `_tint` : gardé pour l'appel.
 */
export function headsetScene(panels: readonly HeadsetPanel[], _tint?: string, marks: readonly Vec3[] = []): ScenePrimitive[] {
  const scene: ScenePrimitive[] = [];
  const C = SCENE_COLORS;

  // Sol à perte de vue, éclairci sous la borne.
  const pf = panels.find((p) => p.role === 'playfield');
  const head = panels.filter((p) => p.role !== 'playfield');
  const centerZ = pf && head.length ? (pf.position.z + head[0]!.position.z) / 2 : (pf ?? head[0])?.position.z ?? -0.6;
  scene.push({ kind: 'disque', center: { x: 0, y: 0, z: centerZ }, radius: FLOOR_M, inner: rgba(C.void), outer: rgba(C.void) });
  scene.push({ kind: 'disque', center: { x: 0, y: 0.001, z: centerZ }, radius: FLOOR_GLOW_M, inner: rgba(mix(C.void, C.surface, 0.15)), outer: rgba(C.void) });

  // Calage de la borne (calage.ts) : un plot vert sur chaque coin de la barre avant virtuelle, qui
  // doit tomber sur le vrai coin, touché du bout de la manette.
  for (const center of marks) scene.push({ kind: 'boite', center: { ...center, y: center.y + MARK_M }, orientation: IDENTITY, size: { x: MARK_M, y: 2 * MARK_M, z: MARK_M }, color: rgba(C.signal) });
  return scene;
}

/** Les lignes de la scène pour le compagnon : « scene », une ligne par forme, « scene-fin ». */
export function sceneProtocol(scene: readonly ScenePrimitive[]): string[] {
  const n = (v: number) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(5).replace(/\.?0+$/, ''));
  const v3 = (v: Vec3) => `${n(v.x)} ${n(v.y)} ${n(v.z)}`;
  const q4 = (q: Quaternion) => `${n(q.x)} ${n(q.y)} ${n(q.z)} ${n(q.w)}`;
  const lines = scene.map((s) => {
    switch (s.kind) {
      case 'boite':
        return `boite ${v3(s.center)} ${q4(s.orientation)} ${v3(s.size)} ${s.color} ${s.bottom ?? s.color}`;
      case 'quad':
        return `quad ${v3(s.center)} ${q4(s.orientation)} ${n(s.width)} ${n(s.height)} ${s.top} ${s.bottom}`;
      case 'disque':
        return `disque ${v3(s.center)} ${n(s.radius)} ${s.inner} ${s.outer}`;
    }
  });
  return ['scene', ...lines, 'scene-fin'];
}
