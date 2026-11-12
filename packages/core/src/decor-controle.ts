// Contrôle du décor (decor.ts) : surfaces qui se disputent la profondeur (« z-fighting »).
//
// Deux faces parallèles qui se recouvrent à moins d'un millimètre l'une de l'autre scintillent dans le
// casque : l'une passe devant l'autre d'une image à l'autre, selon l'œil et le moindre mouvement de
// tête. Retours du 12/11/2026 sur la borne : traces noires entre l'écran et le rebord de la barre
// avant (dessus de la barre au ras du dessus du cadre), inscriptions des flancs qui clignotent
// (côtés de la façade, du dessous et des pieds au ras de la face des flancs). Le compagnon dessine
// sans élimination des faces arrière : une face cachée à l'intérieur d'une pièce scintille aussi.
//
// Le contrôle cherche toute paire de triangles presque parallèles, à moins de `gap` l'un de l'autre,
// dont les projections se recouvrent ; le générateur du décor et ses essais l'appellent.

import type { Decor } from './decor';

export interface CoplanarConflict {
  a: string;
  b: string;
  /** Écart entre les deux plans (m). */
  gap: number;
  /** Aire recouverte (m²). */
  area: number;
  /** Un point de la zone (monde, m). */
  at: [number, number, number];
  /**
   * « same » : les deux faces regardent du même côté, la dispute se voit (scintillement). « opposite » :
   * faces dos à dos de deux pièces qui se touchent, cachées l'une par l'autre (contact, sans effet).
   */
  facing: 'same' | 'opposite';
}

interface Tri {
  part: string;
  p: [number, number, number][];
  n: [number, number, number];
  /** Côté visible de la face : normale enregistrée des sommets (le compagnon dessine les deux côtés). */
  out: [number, number, number];
  d: number;
  min: [number, number, number];
  max: [number, number, number];
}

const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!] as [number, number, number];
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!] as [number, number, number];

/** Aire de l'intersection de deux triangles du même plan, en coordonnées 2D (Sutherland-Hodgman). */
function overlap2d(a: [number, number][], b: [number, number][]): { area: number; centre: [number, number] } {
  const orient = (t: [number, number][]) => {
    const s = (t[1]![0] - t[0]![0]) * (t[2]![1] - t[0]![1]) - (t[1]![1] - t[0]![1]) * (t[2]![0] - t[0]![0]);
    return s < 0 ? [t[0]!, t[2]!, t[1]!] : t;
  };
  let poly = orient(a);
  const clip = orient(b);
  for (let i = 0; i < 3 && poly.length; i++) {
    const [c0, c1] = [clip[i]!, clip[(i + 1) % 3]!];
    const inside = (p: [number, number]) => (c1[0] - c0[0]) * (p[1] - c0[1]) - (c1[1] - c0[1]) * (p[0] - c0[0]) >= 0;
    const cut = (p: [number, number], q: [number, number]): [number, number] => {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const ex = c1[0] - c0[0], ey = c1[1] - c0[1];
      const den = ex * dy - ey * dx;
      const t = den === 0 ? 0 : (ex * (c0[1] - p[1]) - ey * (c0[0] - p[0])) / den;
      return [p[0] + dx * t, p[1] + dy * t];
    };
    const out: [number, number][] = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k]!, q = poly[(k + 1) % poly.length]!;
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q));
        out.push(q);
      } else if (inside(p)) out.push(cut(p, q));
    }
    poly = out;
  }
  let area = 0, cx = 0, cy = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k]!, q = poly[(k + 1) % poly.length]!;
    area += p[0] * q[1] - q[0] * p[1];
    cx += p[0];
    cy += p[1];
  }
  return { area: Math.abs(area) / 2, centre: poly.length ? [cx / poly.length, cy / poly.length] : [0, 0] };
}

/**
 * Paires de surfaces du décor qui se disputent la profondeur : presque parallèles (moins de `angleDeg`),
 * à moins de `gap` mètres l'une de l'autre, recouvertes sur plus de `minArea` m². Les pièces `skip`
 * (le ciel, à l'infini) sont laissées de côté. Une ligne par paire de pièces, la plus grande aire.
 */
export function coplanarConflicts(decor: Decor, opts: { gap?: number; angleDeg?: number; minArea?: number; skip?: readonly string[] } = {}): CoplanarConflict[] {
  const gap = opts.gap ?? 0.001;
  const cosMax = Math.cos(((opts.angleDeg ?? 3) * Math.PI) / 180);
  const minArea = opts.minArea ?? 1e-5; // moins de 0,1 cm² : invisible dans le casque
  const skip = new Set(opts.skip ?? ['ciel']);
  const tris: Tri[] = [];
  for (const part of decor.parts) {
    if (skip.has(part.name)) continue;
    const { positions: P, normals: N, indices: I } = part.mesh;
    for (let i = 0; i < I.length; i += 3) {
      const p = [I[i]!, I[i + 1]!, I[i + 2]!].map((k) => [P[3 * k]!, P[3 * k + 1]!, P[3 * k + 2]!] as [number, number, number]);
      const c = cross(sub(p[1]!, p[0]!), sub(p[2]!, p[0]!));
      const len = Math.hypot(...c);
      if (len < 1e-12) continue;
      const n: [number, number, number] = [c[0] / len, c[1] / len, c[2] / len];
      const min = [0, 1, 2].map((k) => Math.min(p[0]![k]!, p[1]![k]!, p[2]![k]!)) as [number, number, number];
      const max = [0, 1, 2].map((k) => Math.max(p[0]![k]!, p[1]![k]!, p[2]![k]!)) as [number, number, number];
      const out = [0, 1, 2].map((k) => N[3 * I[i]! + k]! + N[3 * I[i + 1]! + k]! + N[3 * I[i + 2]! + k]!) as [number, number, number];
      tris.push({ part: part.name, p, n, out, d: dot(n, p[0]!), min, max });
    }
  }
  // Grille de 5 cm : chaque triangle dans les cases de sa boîte englobante.
  const cell = 0.05;
  const grid = new Map<string, number[]>();
  tris.forEach((t, i) => {
    const lo = t.min.map((v) => Math.floor((v - gap) / cell)), hi = t.max.map((v) => Math.floor((v + gap) / cell));
    if ((hi[0]! - lo[0]! + 1) * (hi[1]! - lo[1]! + 1) * (hi[2]! - lo[2]! + 1) > 200_000) return; // ciel, coque : trop grands, loin de la caisse
    for (let x = lo[0]!; x <= hi[0]!; x++)
      for (let y = lo[1]!; y <= hi[1]!; y++)
        for (let z = lo[2]!; z <= hi[2]!; z++) {
          const key = `${x},${y},${z}`;
          const list = grid.get(key);
          if (list) list.push(i);
          else grid.set(key, [i]);
        }
  });
  const seen = new Set<string>();
  const worst = new Map<string, CoplanarConflict>();
  for (const list of grid.values())
    for (let u = 0; u < list.length; u++)
      for (let v = u + 1; v < list.length; v++) {
        const i = Math.min(list[u]!, list[v]!), j = Math.max(list[u]!, list[v]!);
        const pairKey = `${i}:${j}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const A = tris[i]!, B = tris[j]!;
        if (Math.abs(dot(A.n, B.n)) < cosMax) continue;
        if (A.max.some((m, k) => m + gap < B.min[k]!) || B.max.some((m, k) => m + gap < A.min[k]!)) continue;
        const dist = Math.max(...B.p.map((q) => Math.abs(dot(A.n, q) - A.d)));
        if (dist > gap) continue;
        // Repère du plan de A.
        const e1 = sub(A.p[1]!, A.p[0]!);
        const l1 = Math.hypot(...e1);
        const u1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
        const u2 = cross(A.n, u1);
        const to2d = (q: number[]): [number, number] => {
          const r = sub(q, A.p[0]!);
          return [dot(r, u1), dot(r, u2)];
        };
        const { area, centre } = overlap2d(A.p.map(to2d), B.p.map(to2d));
        if (area < minArea) continue;
        const at = [0, 1, 2].map((k) => A.p[0]![k]! + u1[k]! * centre[0] + u2[k]! * centre[1]) as [number, number, number];
        const facing = dot(A.out, B.out) >= 0 ? 'same' : 'opposite';
        const names = [A.part, B.part].sort();
        const key = `${names.join(' / ')} ${facing}`;
        const prev = worst.get(key);
        if (!prev || area > prev.area) worst.set(key, { a: names[0]!, b: names[1]!, gap: dist, area, at, facing });
      }
  return [...worst.values()].sort((x, y) => y.area - x.area);
}
