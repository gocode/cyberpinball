// Décor de réalité virtuelle : la caisse de flipper habillée et la capsule d'observation, autour des
// écrans de la borne (décision du 12 novembre 2026 ; la maquette validée ce jour-là fait foi pour les
// cotes et les couleurs). Construit à partir des panneaux de headsetPanels (casque.ts), dans l'espace de la borne
// (mètres, x à droite, y en haut, -z devant le joueur), puis écrit en glTF (glb.ts) : le même fichier
// sert au menu dans le casque (compagnon) et en partie (couche OpenXR dans VPX).
//
// Rien ne se pose sur l'image d'un écran : les écrans restent des couches « quad » du compagnon.
// L'éclairage est cuit dans les sommets (lumières de la maquette) ; à l'affichage, la couleur du
// sommet, multipliée par la texture, passe par la tonalité ACES quand la matière le demande.

import { PLAYFIELD_SLOPE_DEG, rotateVector, type HeadsetPanel } from './casque';
import {
  add,
  alongAxis,
  at,
  cross,
  dir,
  irradiance,
  Mesh,
  moved,
  normalize,
  raw,
  scale,
  v3,
  WORLD,
  type Frame,
  type V3,
} from './decor-maillage';

/** Textures du décor (packages/casque-vr/decor/, scripts/decor-textures.cjs). */
export const DECOR_TEXTURES = ['flanc.png', 'sol.png', 'nebuleuses.jpg', 'grille.png', 'lueur.png'] as const;
export type DecorTexture = (typeof DECOR_TEXTURES)[number];

export type DecorBlend = 'opaque' | 'alpha' | 'additive';

export interface DecorMaterial {
  name: string;
  texture?: DecorTexture;
  /** Répétition de la texture (bords) ; sinon bornée. */
  repeat?: boolean;
  blend: DecorBlend;
  /** Opacité (alpha et additif). */
  opacity: number;
  /** Tonalité ACES et exposition de la maquette à l'affichage (comme three.js) ; sinon la couleur telle quelle. */
  toneMapped: boolean;
  /** Couleur multipliée par la teinte de la table choisie (lueurs). */
  tinted?: boolean;
}

export interface DecorPart {
  name: string;
  material: number;
  mesh: Mesh;
  /** Couleur cuite (linéaire, avant tonalité) de chaque sommet. */
  colors: number[];
}

export interface Decor {
  materials: DecorMaterial[];
  parts: DecorPart[];
}

/** Matière de surface : couleur (prise linéaire, comme la maquette), métal, émission. */
interface Surface {
  color: string;
  metalness: number;
  emissive?: { color: string; intensity: number };
}

// Couleurs et matières de la maquette.
const SATIN: Surface = { color: '#0a100f', metalness: 0.45 };
const BLACK: Surface = { color: '#040707', metalness: 0.2 };
const STEEL: Surface = { color: '#9bada7', metalness: 0.85 };
const LEG: Surface = { color: '#161a1a', metalness: 0.55 };
const BOLT: Surface = { color: '#7d8a87', metalness: 0.9 };
const RUBBER: Surface = { color: '#0a0c0c', metalness: 0 };
const ART: Surface = { color: '#ffffff', metalness: 0.3 };
const RIB: Surface = { color: '#0e1d1a', metalness: 0.65 };
const RAISED: Surface = { color: '#0c1a17', metalness: 0.4 };
const FLOOR: Surface = { color: '#ffffff', metalness: 0.25 };

/** Géométrie de la caisse et de la capsule (maquette validée). */
export const DECOR = {
  rim: { side: 0.03, front: 0.07, back: 0.03, top: 0.046, bottom: -0.012, corner: 0.012 },
  // Barre avant : son bord arrière s'arrête au bord de l'image du plateau (jamais dessus).
  lockbar: { thickness: 0.032, depth: 0.1, radius: 0.008, center: 0.03, along: -0.05 },
  body: { height: 0.33, drop: 2, panel: 0.018 },
  leg: { flange: 0.065, thickness: 0.004, above: 0.17, tip: 0.09, tipWidth: 0.005, floor: 0.03 },
  head: { wing: 0.018, depth: 0.12, forward: 0.04, margin: 0.02, top: 0.045 },
  speaker: { radius: 0.045, beside: 0.075 },
  door: { width: 0.21, height: 0.25, x: 0.02 },
  capsule: { rx: 3.2, rz: 4.8, height: 3.6, ahead: 0.8, base: 0.35, ribs: [55, 105, 155, -55, -105, -155] },
  sky: { radius: 500 },
} as const;

/** Repère du plateau : origine au milieu du bord avant, x en travers, y normal, z vers le joueur (-z le long). */
function playfieldFrame(pf: HeadsetPanel): { frame: Frame; width: number; length: number } {
  const slope = (PLAYFIELD_SLOPE_DEG * Math.PI) / 180;
  const imageX = rotateVector(pf.orientation, { x: 1, y: 0, z: 0 });
  const across = Math.abs(imageX.x) > 0.7;
  const width = across ? pf.width : pf.height;
  const length = across ? pf.height : pf.width;
  const along = v3(0, Math.sin(slope), -Math.cos(slope));
  const normal = v3(0, Math.cos(slope), Math.sin(slope));
  const front = add(v3(pf.position.x, pf.position.y, pf.position.z), scale(along, -length / 2));
  return { frame: { o: front, x: v3(1, 0, 0), y: normal, z: scale(along, -1) }, width, length };
}

/**
 * Construit le décor. Sans playfield, rien (le compagnon garde son sol simple). `lockbarWidth` : largeur
 * de la vraie barre avant, mesurée au calage (calage.ts) ; la caisse prend cette largeur, ses flancs,
 * boutons et pieds tombent sur ceux de la vraie borne. Sans elle, la caisse épouse le plateau.
 */
export function buildDecor(panels: readonly HeadsetPanel[], opts: { lockbarWidth?: number } = {}): Decor | undefined {
  const pfPanel = panels.find((p) => p.role === 'playfield');
  if (!pfPanel) return undefined;
  const { frame: pf, width: W, length: Lp } = playfieldFrame(pfPanel);
  const head = panels.filter((p) => p.role !== 'playfield');

  const materials: DecorMaterial[] = [];
  const parts: DecorPart[] = [];
  const matIndex = new Map<string, number>();
  const material = (m: DecorMaterial) => {
    const key = JSON.stringify(m);
    if (!matIndex.has(key)) matIndex.set(key, materials.push(m) - 1);
    return matIndex.get(key)!;
  };
  const lit: DecorMaterial = { name: 'mat', blend: 'opaque', opacity: 1, toneMapped: true };
  /** Ajoute une pièce : maillage rempli par `build`, couleur cuite d'après sa matière. */
  const part = (name: string, surface: Surface, mat: DecorMaterial, build: (m: Mesh) => void) => {
    const mesh = new Mesh();
    build(mesh);
    const base = raw(surface.color);
    const diffuse = 1 - surface.metalness;
    const colors: number[] = [];
    for (let i = 0; i < mesh.vertexCount; i++) {
      const p = v3(mesh.positions[3 * i]!, mesh.positions[3 * i + 1]!, mesh.positions[3 * i + 2]!);
      const n = v3(mesh.normals[3 * i]!, mesh.normals[3 * i + 1]!, mesh.normals[3 * i + 2]!);
      const e = irradiance(p, n);
      let c = v3(base.x * e.x * diffuse, base.y * e.y * diffuse, base.z * e.z * diffuse);
      if (surface.emissive) c = add(c, scale(raw(surface.emissive.color), surface.emissive.intensity));
      colors.push(c.x, c.y, c.z, 1);
    }
    parts.push({ name, material: material(mat), mesh, colors });
  };
  /** Pièce non éclairée : couleur telle quelle (lueurs, filets lumineux, ciel). */
  const glow = (name: string, color: string, mat: DecorMaterial, build: (m: Mesh) => void) => {
    const mesh = new Mesh();
    build(mesh);
    const c = raw(color);
    const colors: number[] = [];
    for (let i = 0; i < mesh.vertexCount; i++) colors.push(c.x, c.y, c.z, 1);
    parts.push({ name, material: material(mat), mesh, colors });
  };

  const R = DECOR.rim, B = DECOR.body;
  // Demi-largeur de la caisse : le plateau et son cadre, ou la vraie barre avant calée (bornée à 40-120 cm, calage.ts).
  const measured = opts.lockbarWidth !== undefined && Number.isFinite(opts.lockbarWidth) ? Math.min(1.2, Math.max(0.4, opts.lockbarWidth)) : 0;
  const hw = Math.max(W / 2 + R.side, measured / 2);
  // Dessus des flancs : juste sous le cadre, de l'avant de la bande de la barre au bout du cadre.
  const sideTop = (along: number) => at(pf, 0, -0.008, along);
  const TOPF = sideTop(R.front), TOPB = sideTop(-Lp - R.back);
  const frontZ = TOPF.z, backZ = TOPB.z;
  const drop = (B.drop * Math.PI) / 180;
  const yBot = (z: number) => TOPF.y - B.height - (TOPF.z - z) * Math.tan(drop);

  // --- Cadre de vitre continu : bande du dessus, arête adoucie, retour extérieur et bord intérieur.
  part('cadre', SATIN, lit, (m) => {
    const loop = (x0: number, a0: number, x1: number, a1: number, r: number) => roundRectLoop(x0, a0, x1, a1, r);
    const outer = loop(-hw, -R.front, hw, Lp + R.back, R.corner);
    const outerIn = loop(-hw + 0.004, -R.front + 0.004, hw - 0.004, Lp + R.back - 0.004, R.corner - 0.004);
    const inner = loop(-W / 2, 0, W / 2, Lp, 0); // angle vif : exactement le rectangle de l'image
    const N = outer.length;
    // Coordonnées locales : x, y (normale), a (le long, vers le fond) ; z local = -a.
    const P = (x: number, y: number, a: number) => at(pf, x, y, -a);
    const strip = (A: [number, number][], ya: number, B2: [number, number][], yb: number, normal: (i: number) => V3) => {
      const base = m.vertexCount;
      for (let i = 0; i <= N; i++) {
        const [ax, aa] = A[i % N]!, [bx, ba] = B2[i % N]!;
        m.vertex(P(ax, ya, aa), normal(i), i / N, 0);
        m.vertex(P(bx, yb, ba), normal(i), i / N, 1);
      }
      for (let i = 0; i < N; i++) {
        const a = base + 2 * i;
        m.tri(a, a + 2, a + 3);
        m.tri(a, a + 3, a + 1);
      }
    };
    const up = () => dir(pf, 0, 1, 0);
    const outward = (L: [number, number][]) => (i: number) => {
      const [x0, a0] = L[(i + N - 1) % N]!, [x1, a1] = L[(i + 1) % N]!;
      const t = normalize(v3(x1 - x0, 0, a1 - a0));
      return dir(pf, t.z, 0, t.x); // perpendiculaire dans le plan (x, a), vers l'extérieur
    };
    const bevel = (i: number) => normalize(add(scale(outward(outer)(i), 0.7), scale(up(), 0.7)));
    strip(outerIn, R.top, inner, R.top, up); // dessus
    strip(outer, R.top - 0.004, outerIn, R.top, bevel); // arête adoucie
    strip(outer, R.bottom, outer, R.top - 0.004, outward(outer)); // retour extérieur
    strip(inner, R.top, inner, 0, (i) => scale(outward(inner)(i), -1)); // bord intérieur, jusqu'à l'image
  });

  // --- Barre avant : le cadre s'épaissit, profil arrondi côté mains.
  part('barre', SATIN, lit, (m) => {
    const L = DECOR.lockbar;
    const profile = roundRectLoop(-L.depth / 2, -L.thickness / 2, L.depth / 2, L.thickness / 2, L.radius, 4, 6);
    const base = m.vertexCount;
    for (const x of [-hw, hw])
      for (const [a, y] of profile) {
        const p = at(pf, x, L.center + y, -(L.along + a));
        m.vertex(p, dir(pf, 0, y, -a));
      }
    const n = profile.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      m.tri(base + i, base + n + i, base + n + j);
      m.tri(base + i, base + n + j, base + j);
    }
    // Bouts de la barre.
    for (const [x, s] of [[-hw, -1], [hw, 1]] as const) {
      const c = m.vertex(at(pf, x, L.center, -L.along), dir(pf, s, 0, 0));
      const first = m.vertexCount;
      for (const [a, y] of profile) m.vertex(at(pf, x, L.center + y, -(L.along + a)), dir(pf, s, 0, 0));
      for (let i = 0; i < n; i++) m.tri(c, first + i, first + ((i + 1) % n));
    }
  });

  // --- Flancs habillés : prisme du profil, habillage sur la face extérieure (u de l'arrière à l'avant).
  for (const s of [-1, 1] as const) {
    const flank: DecorMaterial = { name: 'flanc', texture: 'flanc.png', blend: 'opaque', opacity: 1, toneMapped: true };
    part(s < 0 ? 'flanc-gauche' : 'flanc-droit', ART, flank, (m) => {
      // Repère : x local vers l'avant (z monde), y vers le haut, z local vers l'extérieur ; la face
      // extérieure est en z local = 0 (x monde = ±hw).
      const f: Frame = { o: v3(s * hw, 0, backZ), x: v3(0, 0, 1), y: v3(0, 1, 0), z: v3(s, 0, 0) };
      const len = frontZ - backZ;
      const poly: [number, number][] = [
        [0, yBot(backZ)],
        [len, TOPF.y - B.height],
        [len, TOPF.y],
        [0, TOPB.y],
      ];
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      // L'habillage suit le bord du flanc (le liseré du bas n'est jamais coupé) ; v = 0 en haut de l'image.
      // Vu de l'extérieur, l'avant est à droite sur le flanc gauche, à gauche sur le flanc droit : u en miroir.
      const uv = (x: number, y: number): [number, number] => {
        const t = Math.min(1, Math.max(0, x / len));
        const yb = lerp(yBot(backZ), TOPF.y - B.height, t), yt = lerp(TOPB.y, TOPF.y, t);
        return [s < 0 ? t : 1 - t, 1 - Math.min(1, Math.max(0, (y - yb) / (yt - yb)))];
      };
      m.prism(f, poly, -B.panel, 0, uv);
    });
  }

  // --- Façade, dessous incliné, dos.
  part('facade', SATIN, lit, (m) => m.box(WORLD, v3(0, TOPF.y - B.height / 2, frontZ - B.panel / 2), v3(hw, B.height / 2, B.panel / 2)));
  part('dessous', BLACK, lit, (m) => {
    const y0 = TOPF.y - B.height, y1 = yBot(backZ);
    const len = Math.hypot(frontZ - backZ, y0 - y1);
    // Incliné : plus bas vers l'arrière (z local vers l'avant).
    const tilted: Frame = { o: v3(0, (y0 + y1) / 2 + B.panel / 2, (frontZ + backZ) / 2), x: v3(1, 0, 0), y: normalize(v3(0, Math.cos(drop), -Math.sin(drop))), z: normalize(v3(0, Math.sin(drop), Math.cos(drop))) };
    m.box(tilted, v3(0, 0, 0), v3(hw, B.panel / 2, len / 2));
  });
  part('dos', SATIN, lit, (m) => {
    const y1 = yBot(backZ), h = TOPB.y - y1;
    m.box(WORLD, v3(0, y1 + h / 2, backZ + B.panel / 2), v3(hw, h / 2, B.panel / 2));
  });

  // --- Porte en façade, générique.
  {
    const D = DECOR.door;
    const f = moved(WORLD, D.x, TOPF.y - B.height + 0.035, frontZ + 0.002);
    part('porte-cadre', { color: '#2a3331', metalness: 0.8 }, lit, (m) => m.box(f, v3(0, D.height / 2, 0.004), v3(D.width / 2, D.height / 2, 0.004)));
    part('porte', { color: '#06090a', metalness: 0.5 }, lit, (m) => m.box(f, v3(0, D.height / 2, 0.011), v3(D.width / 2 - 0.015, D.height / 2 - 0.015, 0.003)));
    part('monnayeurs', { color: '#5c6967', metalness: 0.9 }, lit, (m) => {
      for (const sx of [-0.045, 0.045]) m.box(f, v3(sx, D.height * 0.68, 0.016), v3(0.02, 0.035, 0.0025));
    });
    part('fentes', { color: '#020303', metalness: 0 }, lit, (m) => {
      for (const sx of [-0.045, 0.045]) m.box(f, v3(sx, D.height * 0.7, 0.0185), v3(0.002, 0.015, 0.002));
      m.box(f, v3(0, D.height * 0.22, 0.016), v3(0.025, 0.0175, 0.003));
    });
    glow('voyants', '#36c9b4', { name: 'voyant', blend: 'opaque', opacity: 1, toneMapped: true }, (m) => {
      for (const sx of [-0.045, 0.045]) m.lathe(alongAxis(at(f, sx, D.height * 0.68 - 0.025, 0.017), v3(0, 0, 1)), [[0, 0], [0.006, 0], [0.006, 0.002], [0, 0.002]], 16);
    });
    part('serrure', STEEL, lit, (m) => m.lathe(alongAxis(at(f, D.width / 2 - 0.03, D.height * 0.45, 0.013), v3(0, 0, 1)), [[0, 0], [0.007, 0], [0.007, 0.006], [0, 0.006]], 20));
  }

  // --- Pieds en cornière : deux ailes effilées en pointe sur l'arête du pli, boulons, vérin et patin.
  {
    const L = DECOR.leg;
    for (const sx of [-1, 1] as const)
      for (const [zc, front] of [[frontZ, true], [backZ, false]] as const) {
        const fz = front ? 1 : -1;
        const yTop = yBot(zc) + L.above, total = yTop - L.floor;
        const shape: [number, number][] = [
          [0, 0],
          [L.flange, 0],
          [L.flange, total - L.tip],
          [L.tipWidth, total],
          [0, total],
        ];
        part('pied', LEG, lit, (m) => {
          // Aile contre le flanc : x local vers l'intérieur (z), épaisseur vers l'extérieur (x).
          m.prism(frameOf(v3(sx * hw, L.floor, zc + fz * L.thickness), v3(0, 0, -fz), v3(sx, 0, 0)), shape, 0, L.thickness);
          // Aile contre la façade (ou le dos) : x local vers le milieu, épaisseur vers l'extérieur (z).
          m.prism(frameOf(v3(sx * (hw + L.thickness), L.floor, zc), v3(-sx, 0, 0), v3(0, 0, fz)), shape, 0, L.thickness);
        });
        part('boulons', BOLT, lit, (m) => {
          const bolt = (p: V3, axis: V3) => {
            m.lathe(alongAxis(p, axis), [[0, 0], [0.011, 0], [0.011, 0.0015], [0.0075, 0.0015], [0.0075, 0.0075], [0, 0.0075]], 6);
          };
          for (const y of [yTop - 0.105, yTop - 0.155]) bolt(v3(sx * (hw + L.thickness), y, zc - fz * 0.028), v3(sx, 0, 0));
          for (const y of [yTop - 0.125, yTop - 0.165]) bolt(v3(sx * (hw - 0.026), y, zc + fz * L.thickness), v3(0, 0, fz));
          // Platine et vérin dans l'angle.
          const c = v3(sx * (hw - 0.021), L.floor, zc - fz * 0.021);
          m.box(WORLD, add(c, v3(0, 0.003, 0)), v3(0.025, 0.0025, 0.025));
          m.lathe(alongAxis(v3(c.x, 0.004, c.z), v3(0, 1, 0)), [[0, 0], [0.0065, 0], [0.0065, 0.026], [0, 0.026]], 12);
        });
        part('patin', RUBBER, lit, (m) => m.lathe(alongAxis(v3(sx * (hw - 0.021), 0, zc - fz * 0.021), v3(0, 1, 0)), [[0, 0], [0.023, 0], [0.02, 0.008], [0, 0.008]], 24));
      }
  }

  // --- Boutons d'arcade : bague, jupe, dôme, et lueur fixe derrière.
  const button = (name: string, center: V3, axis: V3, dome: string, emissive: string, glowColor: string, k = 1) => {
    const f = alongAxis(center, axis);
    const S = (pts: [number, number][]) => pts.map(([r, h]) => [r * k, h * k] as [number, number]);
    part(`${name}-bague`, { color: '#0a0f0f', metalness: 0.6 }, lit, (m) => m.lathe(f, S([[0.0135, 0], [0.017, 0], [0.0172, 0.0012], [0.0162, 0.0025], [0.0138, 0.0025]])));
    part(`${name}-jupe`, RAISED, lit, (m) => m.lathe(f, S([[0.0145, 0.0018], [0.0145, 0.0053], [0, 0.0053]])));
    const domePts: [number, number][] = [[0.0135, 0.0045]];
    for (let i = 0; i <= 10; i++) {
      const t = (i / 10) * (Math.PI / 2);
      domePts.push([0.0135 * Math.cos(t), 0.005 + 0.002 * Math.sin(t)]);
    }
    part(`${name}-dome`, { color: dome, metalness: 0, emissive: { color: emissive, intensity: 0.6 } }, lit, (m) => m.lathe(f, S(domePts)));
    glow(`${name}-lueur`, glowColor, { name: 'lueur', texture: 'lueur.png', blend: 'additive', opacity: 0.55, toneMapped: true }, (m) => {
      const g = moved(f, 0, 0.0008, 0);
      const r = 0.03 * k;
      m.quad(at(g, -r, 0, -r), at(g, r, 0, -r), at(g, r, 0, r), at(g, -r, 0, r), dir(g, 0, 1, 0));
    });
  };
  const flipperZ = at(pf, 0, 0, -0.1).z + 0.04; // 10 cm derrière le bord avant du plateau, comme la maquette
  for (const s of [-1, 1] as const) button(s < 0 ? 'flipper-gauche' : 'flipper-droit', v3(s * hw, 0.79, flipperZ), v3(s, 0, 0), '#36c9b4', '#1c8f80', '#1c8f80');
  button('start', v3(-hw + 0.08, 0.76, frontZ), v3(0, 0, 1), '#8be23a', '#3f6619', '#8be23a', 1.1);

  // --- Tirette : rosace, tige d'acier, poignée noire.
  {
    const f = alongAxis(v3(hw - 0.09, 0.735, frontZ), v3(0, 0, 1));
    part('tirette', STEEL, lit, (m) => {
      m.lathe(f, [[0.004, 0], [0.024, 0], [0.025, 0.002], [0.02, 0.006], [0.006, 0.007]]);
      m.lathe(f, [[0.004, 0.006], [0.004, 0.05], [0, 0.05]], 16);
    });
    part('tirette-poignee', { color: '#111515', metalness: 0.2 }, lit, (m) => {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 16; k++) {
        const t = (k / 16) * Math.PI;
        pts.push([Math.sin(t) * 0.015, 0.045 + (1 - Math.cos(t)) * 0.016]);
      }
      m.lathe(f, pts);
    });
  }

  // --- Tête : joues droites, dessus, dos, panneau des enceintes, cadre du fronton, filet, lueur de la teinte.
  if (head.length) {
    const H = DECOR.head;
    const headZ = head[0]!.position.z;
    const widest = Math.max(...head.map((p) => p.width));
    const hx = Math.max(widest / 2 + H.margin, 0.3);
    const dmd = head.find((p) => p.role === 'dmd');
    const backglass = head.find((p) => p.role === 'backglass');
    const topper = head.find((p) => p.role === 'topper');
    const main = [dmd, backglass].filter((p): p is HeadsetPanel => !!p);
    // Le dessus de la tête au-dessus du fronton, mais sous le topper s'il y en a un (il est posé dessus).
    const topperBottom = topper ? topper.position.y - topper.height / 2 - 0.003 : Infinity;
    const top = Math.min(Math.max(...main.map((p) => p.position.y + p.height / 2)) + H.top, topperBottom);
    const zF = headZ + H.forward, zB = headZ - H.depth, y0 = TOPB.y - 0.02;
    part('tete', SATIN, lit, (m) => {
      for (const s of [-1, 1]) m.box(WORLD, v3(s * (hx - H.wing / 2), (y0 + top) / 2, (zF + zB) / 2), v3(H.wing / 2, (top - y0) / 2, (zF - zB) / 2));
      m.box(WORLD, v3(0, top - 0.009, (zF + zB) / 2), v3(hx, 0.009, (zF - zB) / 2));
      m.box(WORLD, v3(0, (y0 + top) / 2, zB + 0.009), v3(hx, (top - y0) / 2, 0.009));
    });
    const lowest = Math.min(...main.map((p) => p.position.y - p.height / 2));
    if (lowest - 0.025 > y0) part('tete-bas', SATIN, lit, (m) => m.box(WORLD, v3(0, (y0 + lowest - 0.025) / 2, headZ - 0.008), v3(hx - H.wing, (lowest - 0.025 - y0) / 2, 0.006)));
    if (dmd) {
      // Derrière l'écran du DMD (face avant 2 mm en retrait de l'écran).
      part('panneau-dmd', BLACK, lit, (m) => m.box(WORLD, v3(0, dmd.position.y, headZ - 0.008), v3(hx - H.wing, dmd.height / 2 + 0.025, 0.006)));
      const S = DECOR.speaker;
      const offset = dmd.width / 2 + S.beside;
      if (offset + S.radius <= hx - H.wing - 0.005)
        for (const s of [-1, 1]) {
          const f = alongAxis(v3(s * offset, dmd.position.y, headZ + 0.002), v3(0, 0, 1));
          part('enceinte', { color: '#2a3331', metalness: 0.8 }, lit, (m) => m.lathe(f, [[0.039, 0], [0.046, 0], [0.0465, 0.003], [0.044, 0.006], [0.04, 0.006]], 40));
          part('grille', { color: '#ffffff', metalness: 0.2 }, { name: 'grille', texture: 'grille.png', blend: 'opaque', opacity: 1, toneMapped: true }, (m) => {
            const g = moved(f, 0, 0.004, 0), r = 0.04;
            m.quad(at(g, -r, 0, r), at(g, r, 0, r), at(g, r, 0, -r), at(g, -r, 0, -r), dir(g, 0, 1, 0));
          });
        }
    }
    if (backglass) part('cadre-fronton', BLACK, lit, (m) => m.box(WORLD, v3(0, backglass.position.y, headZ - 0.02), v3(backglass.width / 2 + 0.01, backglass.height / 2 + 0.01, 0.005)));
    if (topper) part('cadre-topper', SATIN, lit, (m) => m.box(WORLD, v3(0, topper.position.y, headZ - 0.03), v3(topper.width / 2 + 0.02, topper.height / 2 + 0.02, 0.03)));
    // Filet sarcelle sous le dessus, au-dessus du fronton (jamais sur son image).
    const mainTop = Math.max(...main.map((p) => p.position.y + p.height / 2));
    const filetY = Math.max(top - 0.02, Math.min(top - 0.006, mainTop + 0.006));
    if (filetY - 0.002 > mainTop + 0.002) glow('filet-tete', '#36c9b4', { name: 'filet', blend: 'opaque', opacity: 1, toneMapped: false }, (m) => m.box(WORLD, v3(0, filetY, zF - 0.03), v3(hx - 0.02, 0.002, 0.002)));
    glow('lueur-tete', '#36c9b4', { name: 'lueur-teinte', texture: 'lueur.png', blend: 'additive', opacity: 0.12, toneMapped: false, tinted: true }, (m) => {
      const w = 0.6, h = 0.45, c = v3(0, (y0 + top) / 2, zB - 0.05);
      m.quad(v3(-w, c.y - h, c.z), v3(w, c.y - h, c.z), v3(w, c.y + h, c.z), v3(-w, c.y + h, c.z), v3(0, 0, 1));
    });
  }

  // --- Ombre précalculée sous la caisse.
  glow('ombre', '#000000', { name: 'ombre', texture: 'lueur.png', blend: 'alpha', opacity: 0.5, toneMapped: false }, (m) => {
    const cz = (frontZ + backZ) / 2, x = 0.45, z = (frontZ - backZ) / 2 + 0.15;
    m.quad(v3(-x, 0.002, cz + z), v3(x, 0.002, cz + z), v3(x, 0.002, cz - z), v3(-x, 0.002, cz - z), v3(0, 1, 0));
  });

  // --- Capsule : sol ovale, soubassement et sa lisse, verrière, nervures, couronne.
  {
    const C = DECOR.capsule;
    const cz = -C.ahead;
    part('sol', FLOOR, { name: 'sol', texture: 'sol.png', blend: 'opaque', opacity: 1, toneMapped: true }, (m) => m.ellipse(v3(0, 0, cz), C.rx, C.rz));
    part('soubassement', RAISED, lit, (m) => m.ellipticWall(v3(0, 0, cz), C.rx, C.rz, 0, C.base));
    glow('lisse', '#36c9b4', { name: 'lisse', blend: 'opaque', opacity: 1, toneMapped: false }, (m) => {
      const pts: V3[] = [];
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        pts.push(v3((C.rx - 0.01) * Math.cos(a), C.base - 0.01, cz + (C.rz - 0.01) * Math.sin(a)));
      }
      m.tube(pts, 0.004, 6);
    });
    glow('verriere', '#36c9b4', { name: 'verriere', blend: 'alpha', opacity: 0.05, toneMapped: false }, (m) => m.dome(v3(0, C.base, cz), C.rx, C.height - C.base, C.rz, true));
    part('nervures', RIB, lit, (m) => {
      for (const az of C.ribs) {
        const a = (az * Math.PI) / 180, pts: V3[] = [];
        for (let k = 0; k <= 40; k++) {
          const t = (k / 40) * (Math.PI / 2 - 0.06);
          pts.push(v3(-Math.sin(a) * Math.cos(t) * C.rx, C.base + Math.sin(t) * (C.height - C.base), cz - Math.cos(a) * Math.cos(t) * C.rz));
        }
        m.tube(pts, 0.035, 8);
      }
      const ring: V3[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        ring.push(v3(0.42 * Math.cos(a), C.height - 0.01, cz + 0.63 * Math.sin(a)));
      }
      m.tube(ring, 0.04, 10);
    });
  }

  // --- Ciel : sphère des nébuleuses (u = azimut, à gauche croissant ; v = 0 au zénith), à l'infini.
  glow('ciel', '#ffffff', { name: 'ciel', texture: 'nebuleuses.jpg', repeat: true, blend: 'opaque', opacity: 1, toneMapped: false }, (m) => {
    const R = DECOR.sky.radius, seg = 96, rings = 48;
    const base = m.vertexCount;
    for (let j = 0; j <= rings; j++) {
      const el = 90 - (j / rings) * 180, e = (el * Math.PI) / 180;
      for (let s = 0; s <= seg; s++) {
        const az = (s / seg) * 360, a = (az * Math.PI) / 180;
        const d = v3(-Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
        m.vertex(scale(d, R), scale(d, -1), s / seg, j / rings);
      }
    }
    const row = seg + 1;
    for (let j = 0; j < rings; j++)
      for (let s = 0; s < seg; s++) {
        const a = base + j * row + s, b = a + row;
        m.tri(a, b, b + 1);
        m.tri(a, b + 1, a + 1);
      }
  });

  return { materials, parts };
}

/**
 * Repère d'une aile : origine, axe x local (largeur), axe z local (épaisseur) ; y vers le haut. Les
 * normales suivent les axes donnés : l'orientation du repère (directe ou non) est sans effet.
 */
function frameOf(o: V3, x: V3, z: V3): Frame {
  return { o, x, y: v3(0, 1, 0), z };
}

/**
 * Contour d'un rectangle aux coins arrondis, dans le sens trigonométrique : pour chaque coin, son arc
 * (`perCorner` + 1 points), puis l'intérieur du côté suivant (`perSide` points). Deux contours de même
 * découpage se correspondent point à point, coin sur coin et côté sur côté : la bande qui les relie ne
 * déborde jamais (le dessus du cadre ne passe pas sur l'image du plateau).
 */
function roundRectLoop(x0: number, y0: number, x1: number, y1: number, r: number, perSide = 24, perCorner = 8): [number, number][] {
  const corners: [number, number, number][] = [
    [x1 - r, y0 + r, -Math.PI / 2],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, Math.PI / 2],
    [x0 + r, y0 + r, Math.PI],
  ];
  const pts: [number, number][] = [];
  for (let c = 0; c < 4; c++) {
    const [cx, cy, a0] = corners[c]!;
    for (let k = 0; k <= perCorner; k++) {
      const a = a0 + (k / perCorner) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    // Côté jusqu'au coin suivant (extrémités exclues).
    const [ex, ey] = pts[pts.length - 1]!;
    const [nx, ny, na] = corners[(c + 1) % 4]!;
    const sx = nx + r * Math.cos(na), sy = ny + r * Math.sin(na);
    for (let k = 1; k <= perSide; k++) {
      const t = k / (perSide + 1);
      pts.push([ex + (sx - ex) * t, ey + (sy - ey) * t]);
    }
  }
  return pts;
}
