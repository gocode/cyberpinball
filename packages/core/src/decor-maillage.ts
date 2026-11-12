// Maillages du décor de réalité virtuelle (decor.ts) : primitives simples (boîte, prisme, tour,
// tube, ellipsoïde, disque, anneau), posées dans un repère, et l'éclairage cuit dans les sommets.
// Ni dépendance ni DOM : des tableaux de nombres, écrits ensuite en glTF (glb.ts).

export type V3 = { x: number; y: number; z: number };

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
export const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const length = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: V3): V3 => {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : { x: 0, y: 1, z: 0 };
};

/** Repère : origine et trois axes orthonormés (x, y, z locaux). */
export interface Frame {
  o: V3;
  x: V3;
  y: V3;
  z: V3;
}

export const WORLD: Frame = { o: v3(0, 0, 0), x: v3(1, 0, 0), y: v3(0, 1, 0), z: v3(0, 0, 1) };

/** Point local → monde. */
export function at(f: Frame, x: number, y: number, z: number): V3 {
  return { x: f.o.x + f.x.x * x + f.y.x * y + f.z.x * z, y: f.o.y + f.x.y * x + f.y.y * y + f.z.y * z, z: f.o.z + f.x.z * x + f.y.z * y + f.z.z * z };
}
/** Direction locale → monde. */
export function dir(f: Frame, x: number, y: number, z: number): V3 {
  return normalize({ x: f.x.x * x + f.y.x * y + f.z.x * z, y: f.x.y * x + f.y.y * y + f.z.y * z, z: f.x.z * x + f.y.z * y + f.z.z * z });
}
/** Repère déplacé (origine locale). */
export function moved(f: Frame, x: number, y: number, z: number): Frame {
  return { ...f, o: at(f, x, y, z) };
}
/** Repère dont l'axe y local suit `axis` (unitaire), les deux autres choisis perpendiculaires. */
export function alongAxis(o: V3, axis: V3): Frame {
  const y = normalize(axis);
  const ref = Math.abs(y.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  const x = normalize(cross(ref, y));
  return { o, x, y, z: cross(x, y) };
}

/** Un maillage : sommets (position, normale, uv), triangles. */
export class Mesh {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(p: V3, n: V3, u = 0, v = 0): number {
    this.positions.push(p.x, p.y, p.z);
    const m = normalize(n);
    this.normals.push(m.x, m.y, m.z);
    this.uvs.push(u, v);
    return this.vertexCount - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** Quadrilatère plat a b c d (ordre autour), normale `n`, uv des coins. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]): void {
    const i = this.vertex(a, n, ...uv[0]!);
    this.vertex(b, n, ...uv[1]!);
    this.vertex(c, n, ...uv[2]!);
    this.vertex(d, n, ...uv[3]!);
    this.tri(i, i + 1, i + 2);
    this.tri(i, i + 2, i + 3);
  }

  /** Boîte : centre local `c`, demi-tailles `h`, faces plates, uv 0..1 par face. */
  box(f: Frame, c: V3, h: V3): void {
    const P = (sx: number, sy: number, sz: number) => at(f, c.x + sx * h.x, c.y + sy * h.y, c.z + sz * h.z);
    const faces: [V3, [number, number, number][]][] = [
      [v3(1, 0, 0), [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
      [v3(-1, 0, 0), [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      [v3(0, 1, 0), [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
      [v3(0, -1, 0), [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
      [v3(0, 0, 1), [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [v3(0, 0, -1), [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
    ];
    for (const [n, k] of faces) this.quad(P(...k[0]!), P(...k[1]!), P(...k[2]!), P(...k[3]!), dir(f, n.x, n.y, n.z));
  }

  /**
   * Prisme : polygone convexe du plan local (x, y), tourné dans le sens trigonométrique, épaissi de z0 à
   * z1. `capUv` : uv d'un point du polygone pour les deux faces.
   */
  prism(f: Frame, poly: [number, number][], z0: number, z1: number, capUv: (x: number, y: number) => [number, number] = () => [0, 0]): void {
    const n = poly.length;
    for (const [z, normal, order] of [[z1, 1, 1], [z0, -1, -1]] as const) {
      const base = this.vertexCount;
      const nz = dir(f, 0, 0, normal);
      for (const [x, y] of poly) this.vertex(at(f, x, y, z), nz, ...capUv(x, y));
      for (let i = 1; i < n - 1; i++) (order > 0 ? this.tri(base, base + i, base + i + 1) : this.tri(base, base + i + 1, base + i));
    }
    for (let i = 0; i < n; i++) {
      const [ax, ay] = poly[i]!, [bx, by] = poly[(i + 1) % n]!;
      const side = dir(f, by - ay, -(bx - ax), 0);
      this.quad(at(f, ax, ay, z0), at(f, bx, by, z0), at(f, bx, by, z1), at(f, ax, ay, z1), side);
    }
  }

  /** Tour : profil (rayon, hauteur) autour de l'axe y local, normales lissées. */
  lathe(f: Frame, profile: [number, number][], segments = 32): void {
    const base = this.vertexCount;
    const m = profile.length;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (let i = 0; i < m; i++) {
        const [r, h] = profile[i]!;
        const [pr, ph] = profile[Math.max(0, i - 1)]!, [nr, nh] = profile[Math.min(m - 1, i + 1)]!;
        // Normale du profil : perpendiculaire à la tangente (dr, dh), tournée vers l'extérieur.
        const dr = nr - pr, dh = nh - ph;
        const nx = dh, ny = -dr;
        this.vertex(at(f, r * ca, h, r * sa), dir(f, nx * ca, ny, nx * sa), s / segments, i / (m - 1));
      }
    }
    for (let s = 0; s < segments; s++)
      for (let i = 0; i < m - 1; i++) {
        const a = base + s * m + i, b = base + (s + 1) * m + i;
        this.tri(a, a + 1, b + 1);
        this.tri(a, b + 1, b);
      }
  }

  /** Tube : cercle de rayon `r` balayé le long d'une courbe. */
  tube(points: V3[], r: number, radial = 8): void {
    const base = this.vertexCount;
    let ref = v3(0, 1, 0);
    for (let i = 0; i < points.length; i++) {
      const t = normalize(sub(points[Math.min(points.length - 1, i + 1)]!, points[Math.max(0, i - 1)]!));
      if (Math.abs(dot(ref, t)) > 0.95) ref = v3(1, 0, 0);
      const u = normalize(cross(t, ref)), w = cross(t, u);
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        const n = add(scale(u, Math.cos(a)), scale(w, Math.sin(a)));
        this.vertex(add(points[i]!, scale(n, r)), n, k / radial, i / (points.length - 1));
      }
    }
    const ring = radial + 1;
    for (let i = 0; i < points.length - 1; i++)
      for (let k = 0; k < radial; k++) {
        const a = base + i * ring + k, b = a + ring;
        this.tri(a, b, b + 1);
        this.tri(a, b + 1, a + 1);
      }
  }

  /**
   * Demi-ellipsoïde (dessus), rayons rx, ry, rz, du bas (latitude 0) au sommet. `inward` : normales
   * vers l'intérieur (verrière vue du dedans).
   */
  dome(c: V3, rx: number, ry: number, rz: number, inward: boolean, segments = 96, rings = 32): void {
    const base = this.vertexCount;
    for (let j = 0; j <= rings; j++) {
      const t = (j / rings) * (Math.PI / 2), ct = Math.cos(t), st = Math.sin(t);
      for (let s = 0; s <= segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        const p = v3(c.x + rx * ct * Math.cos(a), c.y + ry * st, c.z + rz * ct * Math.sin(a));
        const n = normalize(v3((ct * Math.cos(a)) / rx, st / ry, (ct * Math.sin(a)) / rz));
        this.vertex(p, inward ? scale(n, -1) : n, s / segments, j / rings);
      }
    }
    const row = segments + 1;
    for (let j = 0; j < rings; j++)
      for (let s = 0; s < segments; s++) {
        const a = base + j * row + s, b = a + row;
        this.tri(a, b, b + 1);
        this.tri(a, b + 1, a + 1);
      }
  }

  /** Ellipse horizontale pleine (sol) : uv plans, (0,0)-(1,1) sur le rectangle englobant. */
  ellipse(c: V3, rx: number, rz: number, segments = 128): void {
    const up = v3(0, 1, 0);
    const center = this.vertex(c, up, 0.5, 0.5);
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      this.vertex(v3(c.x + rx * Math.cos(a), c.y, c.z + rz * Math.sin(a)), up, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a));
    }
    for (let s = 0; s < segments; s++) this.tri(center, center + 2 + s, center + 1 + s);
  }

  /** Paroi verticale elliptique de y0 à y1, normales vers l'intérieur. */
  ellipticWall(c: V3, rx: number, rz: number, y0: number, y1: number, segments = 128): void {
    const base = this.vertexCount;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const n = normalize(v3(-Math.cos(a) / rx, 0, -Math.sin(a) / rz));
      for (const y of [y0, y1]) this.vertex(v3(c.x + rx * Math.cos(a), y, c.z + rz * Math.sin(a)), n, s / segments, y === y0 ? 0 : 1);
    }
    for (let s = 0; s < segments; s++) {
      const a = base + 2 * s;
      this.tri(a, a + 1, a + 3);
      this.tri(a, a + 3, a + 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Éclairage cuit : celui de la maquette validée (three.js r128, lumières non physiques).

/** Couleur « #rrggbb » prise telle quelle (la maquette traite ses couleurs de matière comme linéaires). */
export function raw(hex: string): V3 {
  const c = (i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
  return v3(c(0), c(1), c(2));
}

export interface Light {
  hemi: { sky: V3; ground: V3; intensity: number };
  directional: { color: V3; intensity: number; from: V3 }[];
  points: { color: V3; intensity: number; at: V3; range: number }[];
}

/** Les lumières de la maquette (capsule.html). */
export const DECOR_LIGHT: Light = {
  hemi: { sky: raw('#9fb3ae'), ground: raw('#030807'), intensity: 0.35 },
  directional: [{ color: raw('#f0f6f4'), intensity: 1.1, from: normalize(v3(-1.5, 3.2, 1.2)) }],
  points: [
    { color: raw('#36c9b4'), intensity: 0.5, at: v3(0, 2.6, -1.0), range: 6 },
    { color: raw('#1c8f80'), intensity: 0.5, at: v3(-1.2, 0.25, -0.7), range: 2.5 },
    { color: raw('#1c8f80'), intensity: 0.5, at: v3(1.2, 0.25, -0.7), range: 2.5 },
  ],
};

/** Éclairement diffus (linéaire) reçu en `p` de normale `n`. */
export function irradiance(p: V3, n: V3, light: Light = DECOR_LIGHT): V3 {
  const k = 0.5 + 0.5 * n.y;
  const h = light.hemi;
  let e = scale(add(scale(h.ground, 1 - k), scale(h.sky, k)), h.intensity);
  for (const d of light.directional) e = add(e, scale(d.color, d.intensity * Math.max(0, dot(n, d.from))));
  for (const pt of light.points) {
    const to = sub(pt.at, p), dist = length(to);
    const fall = Math.max(0, 1 - dist / pt.range);
    if (fall > 0) e = add(e, scale(pt.color, pt.intensity * fall * Math.max(0, dot(n, scale(to, 1 / dist)))));
  }
  return e;
}

/** Tonalité ACES filmique de three.js r128 (exposition comprise), en lumière linéaire. */
export function acesFilmic(c: V3, exposure = 1.15): V3 {
  const e = exposure / 0.6;
  const x = scale(c, e);
  const i = v3(0.59719 * x.x + 0.35458 * x.y + 0.04823 * x.z, 0.076 * x.x + 0.90834 * x.y + 0.01566 * x.z, 0.0284 * x.x + 0.13383 * x.y + 0.83777 * x.z);
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const r = v3(fit(i.x), fit(i.y), fit(i.z));
  const o = v3(1.60475 * r.x - 0.53108 * r.y - 0.07367 * r.z, -0.10208 * r.x + 1.10813 * r.y - 0.00605 * r.z, -0.00327 * r.x - 0.07276 * r.y + 1.07602 * r.z);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return v3(clamp(o.x), clamp(o.y), clamp(o.z));
}
