// Le menu dans le casque, aspect « M2 : borne en volume » (décision du 9 novembre 2026,
// valeurs de la direction artistique).
//
// Autour des panneaux de headsetPanels (casque.ts), qui restent tels quels, le compagnon dessine une
// scène mate sans texture, sous eux (couche de projection OpenXR) : bordure et caisson du playfield
// sur quatre appuis, cadres et caissons de la tête, halo de la teinte de la table autour des cadres,
// sol, et le mur de la phase 2 derrière la tête. Rien ne se pose sur l'image du playfield, qui porte
// le menu ; aucun bouton, vis, monnayeur ni emblème ; rien ne bouge.
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
const MARK_M = 0.02;
/** Bordure du playfield et cadres de la tête (largeur dans le plan). */
export const FRAME_M = 0.018;
/** Épaisseur de la bordure du playfield sous son plan. */
const RIM_DEPTH_M = 0.012;
/** Profondeur du caisson sous la bordure. */
export const CABINET_DEPTH_M = 0.24;
/** Appuis : section, et retrait depuis les coins du caisson. */
export const LEG_M = 0.045;
const LEG_INSET_M = 0.06;
/** Cadres de la tête : épaisseur, et caisson arrière. */
const HEAD_FRAME_DEPTH_M = 0.02;
export const HEAD_BOX_DEPTH_M = 0.08;
/** Filets : largeur. */
const FILET_M = 0.0015;
/** Halo de la teinte autour des cadres : largeur et opacité. */
export const HALO_M = 0.04;
export const HALO_ALPHA = 0.1;
/** Sol : éclaircissement sous la borne, éteint à 1,5 m de son centre ; le reste à perte de vue. */
const FLOOR_GLOW_M = 1.5;
const FLOOR_M = 12;
/** Mur de la phase 2, en largeurs du fronton W (0,708 m pour un fronton de 32 pouces). */
const WALL_DEFAULT_W = 0.708;
const WALL_LINE_M = 0.002;
const WALL_LINE_ALPHA = 0.18;
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

/** Quatre bandes autour d'un rectangle w × h du plan local (cadre, filet ou halo), du bord intérieur `inner` vers l'extérieur. */
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

/** Cadre plein (quatre pavés) autour de l'image, face avant à fleur du panneau. */
function frame(panel: HeadsetPanel, depth: number, color: string): ScenePrimitive[] {
  const { width: w, height: h, orientation: q } = panel;
  const z = -depth / 2 - EPS;
  const b = FRAME_M;
  return [
    { kind: 'boite', center: local(panel, 0, h / 2 + b / 2, z), orientation: q, size: { x: w + 2 * b, y: b, z: depth }, color },
    { kind: 'boite', center: local(panel, 0, -h / 2 - b / 2, z), orientation: q, size: { x: w + 2 * b, y: b, z: depth }, color },
    { kind: 'boite', center: local(panel, -w / 2 - b / 2, 0, z), orientation: q, size: { x: b, y: h, z: depth }, color },
    { kind: 'boite', center: local(panel, w / 2 + b / 2, 0, z), orientation: q, size: { x: b, y: h, z: depth }, color },
  ];
}

/** Filet plein sur la face d'un cadre, contre un bord (rectangle w × h). */
function filet(panel: HeadsetPanel, w: number, h: number, color: string, alpha: number): ScenePrimitive[] {
  const c = seen(color, alpha, SCENE_COLORS.surface);
  return ring(panel, { w, h }, FILET_M, EPS / 2, { inside: c, outside: c });
}

/** La scène de la borne en volume autour des panneaux. `tint` : teinte de la table choisie (#rrggbb), sinon la sarcelle. */
export function headsetScene(panels: readonly HeadsetPanel[], tint?: string, marks: readonly Vec3[] = []): ScenePrimitive[] {
  const scene: ScenePrimitive[] = [];
  // Calage de la borne (calage.ts) : un plot vert sur chaque coin de la barre avant virtuelle, qui
  // doit tomber sur le vrai coin, touché du bout de la manette.
  for (const center of marks) scene.push({ kind: 'boite', center: { ...center, y: center.y + MARK_M }, orientation: IDENTITY, size: { x: MARK_M, y: 2 * MARK_M, z: MARK_M }, color: rgba(SCENE_COLORS.signal) });
  const C = SCENE_COLORS;
  const b = FRAME_M;

  // Sol à perte de vue, éclairci sous la borne.
  const pf = panels.find((p) => p.role === 'playfield');
  const head = panels.filter((p) => p.role !== 'playfield');
  const centerZ = pf && head.length ? (pf.position.z + head[0]!.position.z) / 2 : (pf ?? head[0])?.position.z ?? -0.6;
  scene.push({ kind: 'disque', center: { x: 0, y: 0, z: centerZ }, radius: FLOOR_M, inner: rgba(C.void), outer: rgba(C.void) });
  scene.push({ kind: 'disque', center: { x: 0, y: 0.001, z: centerZ }, radius: FLOOR_GLOW_M, inner: rgba(mix(C.void, C.surface, 0.15)), outer: rgba(C.void) });

  // Playfield : bordure à fleur hors de l'image, filet extérieur, caisson et quatre appuis.
  if (pf) {
    const { width: w, height: h, orientation: q } = pf;
    scene.push(...frame(pf, RIM_DEPTH_M, rgba(C.surface)));
    scene.push(...filet(pf, w + 2 * b - 2 * FILET_M, h + 2 * b - 2 * FILET_M, C.lineStrong, 0.45));
    const boxZ = -RIM_DEPTH_M - CABINET_DEPTH_M / 2 - EPS;
    scene.push({ kind: 'boite', center: local(pf, 0, 0, boxZ), orientation: q, size: { x: w + 2 * b, y: h + 2 * b, z: CABINET_DEPTH_M }, color: rgba(C.surface), bottom: rgba(C.sunken) });
    const bottomZ = -RIM_DEPTH_M - CABINET_DEPTH_M;
    const dx = w / 2 + b - LEG_INSET_M - LEG_M / 2;
    const dy = h / 2 + b - LEG_INSET_M - LEG_M / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const top = local(pf, sx * dx, sy * dy, bottomZ);
      scene.push({ kind: 'boite', center: { x: top.x, y: top.y / 2, z: top.z }, orientation: IDENTITY, size: { x: LEG_M, y: top.y, z: LEG_M }, color: rgba(C.surface) });
    }
  }

  // Tête : cadre, filets (extérieur fort, intérieur discret), caisson arrière, halo de la teinte.
  const haloColor = tint && /^#[0-9a-f]{6}$/i.test(tint) ? tint : C.halo;
  for (const p of head) {
    const { width: w, height: h, orientation: q } = p;
    scene.push(...frame(p, HEAD_FRAME_DEPTH_M, rgba(C.surface)));
    scene.push(...filet(p, w + 2 * b - 2 * FILET_M, h + 2 * b - 2 * FILET_M, C.lineStrong, 0.7));
    scene.push(...filet(p, w, h, C.line, 0.45));
    scene.push({ kind: 'boite', center: local(p, 0, 0, -HEAD_FRAME_DEPTH_M - HEAD_BOX_DEPTH_M / 2 - EPS), orientation: q, size: { x: w + 2 * b, y: h + 2 * b, z: HEAD_BOX_DEPTH_M }, color: rgba(C.surface) });
    scene.push(...ring(p, { w: w + 2 * b, h: h + 2 * b }, HALO_M, -EPS, { inside: seen(haloColor, HALO_ALPHA, C.surface), outside: rgba(haloColor, 0) }));
  }

  if (head.length) scene.push(...wall(head));
  return scene;
}

/**
 * Mur de la phase 2 dans le plan derrière la tête : 5 W de large, du sol à 1,5 W au-dessus de la
 * tête, fond vide, zone centrale un peu plus claire, montants tous les 0,40 W et joints tous les
 * 0,60 W en filets très discrets, éteints sur les 0,8 W du bas et les 0,6 W des côtés, et laissés
 * libres à 0,12 W autour de la tête. Ni ligne de fuite, ni plinthe, ni ombre.
 */
function wall(head: readonly HeadsetPanel[]): ScenePrimitive[] {
  const C = SCENE_COLORS;
  const backglass = head.find((p) => p.role === 'backglass');
  const W = backglass ? backglass.width : WALL_DEFAULT_W;
  const left = -2.5 * W;
  const right = 2.5 * W;
  const headTop = Math.max(...head.map((p) => p.position.y + p.height / 2 + FRAME_M));
  const headBottom = Math.min(...head.map((p) => p.position.y - p.height / 2 - FRAME_M));
  const headHalf = Math.max(...head.map((p) => p.width / 2 + FRAME_M + HALO_M));
  const top = headTop + 1.5 * W;
  const z = Math.min(...head.map((p) => p.position.z)) - HEAD_FRAME_DEPTH_M - HEAD_BOX_DEPTH_M - 0.02;
  const reserve = { left: -headHalf - 0.12 * W, right: headHalf + 0.12 * W, bottom: headBottom - 0.12 * W, top: headTop + 0.12 * W };
  const fadeBottom = 0.8 * W;
  const fadeSide = 0.6 * W;
  const out: ScenePrimitive[] = [];
  const height = top;
  out.push({ kind: 'quad', center: { x: 0, y: height / 2, z }, orientation: IDENTITY, width: right - left, height, top: rgba(C.void), bottom: rgba(C.void) });
  out.push({ kind: 'quad', center: { x: 0, y: height / 2, z: z + EPS }, orientation: IDENTITY, width: 3 * W, height, top: seen(C.surface, 0.6, C.void), bottom: seen(C.surface, 0.6, C.void) });

  const lineZ = z + 2 * EPS;
  // Opacité d'un filet selon sa distance aux côtés (extinction latérale).
  const side = (x: number) => Math.max(0, Math.min(1, Math.min(x - left, right - x) / fadeSide));
  // Segment vertical de y0 à y1 en x : extinction vers le bas sur [0, fadeBottom].
  const vertical = (x: number, y0: number, y1: number) => {
    const a = WALL_LINE_ALPHA * side(x);
    if (a <= 0 || y1 <= y0) return;
    const at = (y: number) => seen(C.lineStrong, a * Math.min(1, y / fadeBottom), C.surface);
    const cut = Math.min(Math.max(fadeBottom, y0), y1);
    if (cut > y0) out.push({ kind: 'quad', center: { x, y: (y0 + cut) / 2, z: lineZ }, orientation: IDENTITY, width: WALL_LINE_M, height: cut - y0, top: at(cut), bottom: at(y0) });
    if (y1 > cut) out.push({ kind: 'quad', center: { x, y: (cut + y1) / 2, z: lineZ }, orientation: IDENTITY, width: WALL_LINE_M, height: y1 - cut, top: at(y1), bottom: at(cut) });
  };
  for (let x = 0.4 * W * Math.ceil(left / (0.4 * W)); x <= right + 1e-9; x += 0.4 * W) {
    if (x > reserve.left && x < reserve.right) {
      vertical(x, 0, reserve.bottom);
      vertical(x, reserve.top, top);
    } else vertical(x, 0, top);
  }
  // Segment horizontal de x0 à x1 en y : extinction vers les côtés (quads tournés, dégradé en largeur).
  const horizontal = (y: number, x0: number, x1: number) => {
    const a = WALL_LINE_ALPHA * Math.min(1, y / fadeBottom);
    if (a <= 0 || x1 <= x0) return;
    const pieces: [number, number][] = [];
    const l = Math.min(Math.max(left + fadeSide, x0), x1);
    const r = Math.max(Math.min(right - fadeSide, x1), l);
    pieces.push([x0, l], [l, r], [r, x1]);
    for (const [p0, p1] of pieces) {
      if (p1 - p0 <= 1e-9) continue;
      // Quad tourné d'un quart (son « haut » vers la droite) : dégradé de p0 (bas) à p1 (haut).
      out.push({
        kind: 'quad',
        center: { x: (p0 + p1) / 2, y, z: lineZ },
        orientation: rz(-Math.PI / 2),
        width: WALL_LINE_M,
        height: p1 - p0,
        top: seen(C.lineStrong, a * side(p1), C.surface),
        bottom: seen(C.lineStrong, a * side(p0), C.surface),
      });
    }
  };
  for (let y = 0.6 * W; y <= top + 1e-9; y += 0.6 * W) {
    if (y > reserve.bottom && y < reserve.top) {
      horizontal(y, left, reserve.left);
      horizontal(y, reserve.right, right);
    } else horizontal(y, left, right);
  }
  return out;
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
