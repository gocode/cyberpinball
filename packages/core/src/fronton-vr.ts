// Partie visible du fronton que VPX pose en VR ([PlayerVR] AddBackglass), selon la pièce VR de la table.
//
// Essai du 10 novembre 2026 (The Matrix, « fronton coupé à la moitié de sa hauteur ») : VPX 10.8.1 pose son
// fronton (flasher implicite, player.cpp) dans le plan du haut du plateau (y = 0), centré, 1,2 × la largeur
// de la table, en 4:3, son bas à la hauteur du haut de la vitre. La caisse de la pièce VR de la table l'enferme :
// sa face avant cache les 45 % du bas (PinCab_Backbox, opaque), seule la fenêtre où la table montrait son
// propre fronton (VR_PupBackglass, image transparente) en laisse voir le haut. Ce module calcule, pour toute
// table, la partie du fronton que rien d'opaque ne cache vers les yeux du joueur : la pause et le contenu du
// fronton (PuP, B2S) y sont dessinés par le plugin ([Plugin.CyberPinball] Zone).
//
// Méthode : chaque triangle des primitives entre ce plan et les yeux, projeté vers les yeux sur le plan,
// rastérisé sur une grille du fronton ; une primitive compte si elle est opaque (matériau sans opacité
// active, pas en mélange additif, image sans canal alpha) et visible en VR : visible dans le fichier, ou
// rattachée à la pièce VR (nom, calque ou collection « VR… » : les scripts les rendent visibles au lancement
// en VR, The Matrix : « For Each VR_Obj in VRCab : Visible = True »). Le plus grand rectangle de cellules
// libres est la zone. Un objet hors pièce VR dont le script change la visibilité (Terminator 2 : Cab_FS ou
// Cab_DT selon Table1.ShowDT) n'est pas compté, visible ou non dans le fichier : on ne sait pas lequel le
// script montre en VR ; `uncertain` le dit au journal, la capture de la partie tranche.

import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import { CompoundFile, readVpxScript } from './vpxinfo';

/** Zone du fronton, en fractions de sa largeur et de sa hauteur, depuis le coin haut gauche. */
export interface BackglassZone {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface VrBackglassView {
  /** Le plus grand rectangle visible du fronton. */
  zone: BackglassZone;
  /** Part du fronton cachée par la pièce VR (0 à 1). */
  hidden: number;
  /** Les objets qui le cachent, du plus couvrant au moins couvrant (nom et part cachée). */
  occluders: { name: string; share: number }[];
  /** Objets cachés dans le fichier, hors pièce VR, qui le cacheraient si le script les montrait en VR. */
  uncertain: { name: string; share: number }[];
}

export const FULL_BACKGLASS_ZONE: BackglassZone = { left: 0, top: 0, right: 1, bottom: 1 };

/** Grille du calcul : 160 × 120 cellules (le fronton est en 4:3). */
const GX = 160;
const GZ = 120;

interface Record_ {
  tag: string;
  body: Buffer;
}

function records(buf: Buffer): Record_[] {
  const out: Record_[] = [];
  for (let pos = 0; pos + 8 <= buf.length; ) {
    const size = buf.readUInt32LE(pos);
    const tag = buf.toString('latin1', pos + 4, pos + 8);
    if (tag === 'CODE' && pos + 12 <= buf.length) {
      pos += 12 + buf.readUInt32LE(pos + 8);
      continue;
    }
    if (size < 4 || pos + 4 + size > buf.length) break;
    out.push({ tag, body: buf.subarray(pos + 8, pos + 4 + size) });
    pos += 4 + size;
  }
  return out;
}

const latin = (b: Buffer) => (b.length >= 4 ? b.toString('latin1', 4, Math.min(b.length, 4 + b.readUInt32LE(0))) : '');
const wide = (b: Buffer) => (b.length >= 4 ? b.toString('utf16le', 4, Math.min(b.length, 4 + b.readUInt32LE(0))).replace(/\0+$/, '') : '');

/** Une image peut-elle être transparente ? PNG à canal alpha, WebP à drapeau alpha, image brute (BGRA) : oui. */
export function imageMayBeTransparent(data: Buffer | undefined): boolean {
  if (!data || data.length < 30) return false;
  if (data[0] === 0x89 && data.toString('latin1', 1, 4) === 'PNG') return data[25] === 4 || data[25] === 6;
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = data.toString('latin1', 12, 16);
    if (chunk === 'VP8X') return (data[20]! & 0x10) !== 0;
    return chunk === 'VP8L'; // sans perte : peut porter un alpha
  }
  return data[0] !== 0xff; // JPEG : jamais ; autre format inconnu : prudence
}

/** Le fronton implicite de VPX 10.8.1 (player.cpp), dans le repère de la table : x, z du coin bas gauche, taille. */
export function implicitBackglass(t: { left: number; right: number; glassTop: number }): { x: number; z: number; width: number; height: number } {
  const width = 1.2 * (t.right - t.left);
  const height = width * 0.75;
  return { x: 0.5 * (t.right - t.left) - width / 2, z: t.glassTop, width, height };
}

/** Plus grand rectangle de cellules libres (0) d'une grille, par histogrammes. */
export function largestFreeRectangle(grid: Uint8Array, gx: number, gz: number): { x: number; z: number; w: number; h: number } {
  const heights = new Array<number>(gx).fill(0);
  let best = { x: 0, z: 0, w: 0, h: 0 };
  for (let z = 0; z < gz; z++) {
    for (let x = 0; x < gx; x++) heights[x] = grid[z * gx + x] ? 0 : heights[x]! + 1;
    const stack: number[] = [];
    for (let x = 0; x <= gx; x++) {
      const h = x < gx ? heights[x]! : 0;
      while (stack.length && heights[stack[stack.length - 1]!]! >= h) {
        const top = stack.pop()!;
        const height = heights[top]!;
        const left = stack.length ? stack[stack.length - 1]! + 1 : 0;
        const width = x - left;
        if (width * height > best.w * best.h) best = { x: left, z: z - height + 1, w: width, h: height };
      }
      stack.push(x);
    }
  }
  return best;
}

type Vec3 = [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;
function rotate(v: Vec3, axis: 'x' | 'y' | 'z', deg: number): Vec3 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const [x, y, z] = v;
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

/** Sommet d'une primitive dans le repère de la table (Primitive::RecalculateMatrices : échelle, translation, Z Y X, objet Z Y X, position). */
export function primitiveVertex(v: Vec3, p: { size: Vec3; rot: number[]; pos: Vec3 }): Vec3 {
  let w: Vec3 = [v[0] * p.size[0], v[1] * p.size[1], v[2] * p.size[2]];
  w = [w[0] + p.rot[3]!, w[1] + p.rot[4]!, w[2] + p.rot[5]!];
  w = rotate(rotate(rotate(w, 'z', p.rot[2]!), 'y', p.rot[1]!), 'x', p.rot[0]!);
  w = rotate(rotate(rotate(w, 'z', p.rot[8]!), 'y', p.rot[7]!), 'x', p.rot[6]!);
  return [w[0] + p.pos[0], w[1] + p.pos[1], w[2] + p.pos[2]];
}

/**
 * La partie visible du fronton implicite de VPX pour une table, vers des yeux posés au milieu, 30 cm
 * derrière le bas du plateau et 45 cm au-dessus (unités de VPX : 50 pour 1 1/16 pouce). undefined si la
 * table est illisible.
 */
export function vrBackglassView(file: string, eye?: Vec3): VrBackglassView | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    if (!game) return undefined;
    const kids = cfb.children(game);
    const data = kids.find((e) => e.name === 'GameData');
    if (!data) return undefined;
    const dims: Record<string, number> = {};
    const materials = new Map<string, boolean>(); // nom -> opaque
    for (const r of records(cfb.stream(data, 16 * 1024 * 1024))) {
      if (['LEFT', 'RGHT', 'BOTM', 'GLAS'].includes(r.tag) && dims[r.tag] === undefined && r.body.length >= 4) dims[r.tag] = r.body.readFloatLE(0);
      if (r.tag === 'MATE') {
        // SaveMaterial (76 octets) : nom[32], 3 couleurs, wrap, metal, rugosité, lerp, bord, épaisseur, opacité (68), opacité active (72).
        for (let i = 0; i + 76 <= r.body.length; i += 76) {
          const name = r.body.toString('latin1', i, i + 32).replace(/\0.*$/s, '');
          const opacity = r.body.readFloatLE(i + 68);
          const active = (r.body[i + 72]! & 1) !== 0;
          materials.set(name, !active || opacity >= 0.99);
        }
      }
    }
    if (![dims.LEFT, dims.RGHT, dims.BOTM, dims.GLAS].every((v) => Number.isFinite(v))) return undefined;
    const bg = implicitBackglass({ left: dims.LEFT!, right: dims.RGHT!, glassTop: dims.GLAS! });
    const vpu = 50 / (1.0625 * 2.54); // unités de VPX par centimètre
    const e: Vec3 = eye ?? [0.5 * (dims.RGHT! - dims.LEFT!), dims.BOTM! + 30 * vpu, dims.GLAS! + 45 * vpu];
    // Objets dont le script change la visibilité (« Cab_FS.visible = 0 »).
    const toggled = new Set<string>();
    for (const m of (readVpxScript(file) ?? '').matchAll(/\b(\w+)\s*\.\s*visible\s*=/gi)) toggled.add(m[1]!.toLowerCase());
    // Objets de la pièce VR par leur collection (« VRCab », « VR_Room »…).
    const vrMembers = new Set<string>();
    for (const item of kids) {
      if (item.type !== 2 || !/^Collection\d+$/.test(item.name)) continue;
      let cname = '';
      const members: string[] = [];
      for (const r of records(cfb.stream(item, 1024 * 1024))) {
        if (r.tag === 'NAME') cname = wide(r.body);
        else if (r.tag === 'ITEM') members.push(wide(r.body).toLowerCase());
      }
      if (/vr/i.test(cname)) for (const m of members) vrMembers.add(m);
    }
    // Images transparentes, par nom.
    const transparent = new Set<string>();
    for (const item of kids) {
      if (item.type !== 2 || !/^Image\d+$/.test(item.name)) continue;
      const buf = cfb.stream(item, 16 * 1024);
      let name = '';
      let pixels: Buffer | undefined;
      for (let pos = 0; pos + 8 <= buf.length; ) {
        const size = buf.readUInt32LE(pos);
        const tag = buf.toString('latin1', pos + 4, pos + 8);
        if (tag === 'NAME') name = latin(buf.subarray(pos + 8, pos + 4 + size)).toLowerCase();
        if (tag === 'BITS') {
          pixels = Buffer.from([0x00]); // image brute en BGRA : peut porter un alpha
          break;
        }
        if (tag === 'JPEG') {
          for (let p = pos + 4 + size; p + 8 <= buf.length; ) {
            const s = buf.readUInt32LE(p);
            if (buf.toString('latin1', p + 4, p + 8) === 'DATA') {
              pixels = buf.subarray(p + 8, Math.min(buf.length, p + 4 + s));
              break;
            }
            if (s < 4) break;
            p += 4 + s;
          }
          break;
        }
        if (size < 4) break;
        pos += 4 + size;
      }
      if (name && pixels && (pixels.length === 1 || imageMayBeTransparent(pixels))) transparent.add(name);
    }
    const project = (p: Vec3): [number, number] => {
      const t = e[1] / (e[1] - p[1]);
      const x = e[0] + t * (p[0] - e[0]);
      const z = e[2] + t * (p[2] - e[2]);
      return [((x - bg.x) / bg.width) * GX, ((bg.z + bg.height - z) / bg.height) * GZ];
    };
    const all = new Uint8Array(GX * GZ);
    const occluders: { name: string; share: number }[] = [];
    const uncertain: { name: string; share: number }[] = [];
    for (const item of kids) {
      if (item.type !== 2 || !/^GameItem\d+$/.test(item.name)) continue;
      if (cfb.stream(item, 4).readUInt32LE(0) !== 19) continue; // primitives seulement
      const p = { size: [1, 1, 1] as Vec3, rot: [0, 0, 0, 0, 0, 0, 0, 0, 0], pos: [0, 0, 0] as Vec3 };
      let name = '';
      let image = '';
      let material = '';
      let layer = '';
      let visible = true;
      let additive = false;
      let nv = 0;
      let ni = 0;
      let cv: Buffer | undefined;
      let ci: Buffer | undefined;
      let rv: Buffer | undefined;
      let ri: Buffer | undefined;
      for (const r of records(cfb.stream(item, 256 * 1024 * 1024).subarray(4))) {
        if (r.tag === 'NAME') name = wide(r.body);
        else if (r.tag === 'VPOS' && r.body.length >= 12) p.pos = [r.body.readFloatLE(0), r.body.readFloatLE(4), r.body.readFloatLE(8)];
        else if (r.tag === 'VSIZ' && r.body.length >= 12) p.size = [r.body.readFloatLE(0), r.body.readFloatLE(4), r.body.readFloatLE(8)];
        else if (/^RTV\d$/.test(r.tag) && r.body.length >= 4) p.rot[Number(r.tag[3])] = r.body.readFloatLE(0);
        else if (r.tag === 'IMAG') image = latin(r.body).toLowerCase();
        else if (r.tag === 'MATR') material = latin(r.body);
        else if (r.tag === 'ADDB' && r.body.length >= 4) additive = r.body.readUInt32LE(0) !== 0;
        else if (r.tag === 'TVIS' && r.body.length >= 4) visible = r.body.readUInt32LE(0) !== 0;
        else if (r.tag === 'LANR') layer = latin(r.body);
        else if (r.tag === 'M3VN') nv = r.body.readUInt32LE(0);
        else if (r.tag === 'M3FN') ni = r.body.readUInt32LE(0);
        else if (r.tag === 'M3CX') cv = r.body;
        else if (r.tag === 'M3CI') ci = r.body;
        else if (r.tag === 'M3DX') rv = r.body;
        else if (r.tag === 'M3DI') ri = r.body;
      }
      if (!nv || !ni || additive || (image && transparent.has(image)) || materials.get(material) === false) continue;
      let V: Buffer | undefined;
      let I: Buffer | undefined;
      try {
        V = cv ? zlib.inflateSync(cv) : rv;
        I = ci ? zlib.inflateSync(ci) : ri;
      } catch {
        continue;
      }
      if (!V || !I || V.length < nv * 32) continue;
      const isz = nv > 65535 ? 4 : 2;
      if (I.length < ni * isz) continue;
      const pts: Vec3[] = [];
      for (let i = 0; i < nv; i++) pts.push(primitiveVertex([V.readFloatLE(i * 32), V.readFloatLE(i * 32 + 4), V.readFloatLE(i * 32 + 8)], p));
      const grid = new Uint8Array(GX * GZ);
      let any = false;
      for (let t = 0; t + 2 < ni; t += 3) {
        const tri = [0, 1, 2].map((k) => pts[isz === 4 ? I!.readUInt32LE((t + k) * 4) : I!.readUInt16LE((t + k) * 2)]!);
        if (tri.some((q) => !(q[1] > 0.5 && q[1] < e[1]))) continue;
        any = raster(grid, project(tri[0]!), project(tri[1]!), project(tri[2]!)) || any;
      }
      if (!any) continue;
      let n = 0;
      grid.forEach((v) => {
        if (v) n++;
      });
      if (!n) continue;
      const share = n / (GX * GZ);
      // Visible en VR : visible dans le fichier, ou de la pièce VR (le script la montre en VR).
      const vr = /vr/i.test(name) || /vr/i.test(layer) || vrMembers.has(name.toLowerCase());
      if (vr || (visible && !toggled.has(name.toLowerCase()))) {
        grid.forEach((v, i) => {
          if (v) all[i] = 1;
        });
        occluders.push({ name, share });
      } else uncertain.push({ name, share });
    }
    occluders.sort((a, b) => b.share - a.share);
    uncertain.sort((a, b) => b.share - a.share);
    const hiddenCells = all.reduce((s, v) => s + v, 0);
    const hidden = hiddenCells / (GX * GZ);
    if (hidden < 0.02) return { zone: FULL_BACKGLASS_ZONE, hidden, occluders, uncertain };
    const r = largestFreeRectangle(all, GX, GZ);
    // Une cellule de marge de chaque côté caché (les yeux ne sont jamais exactement là où le calcul les met).
    const left = r.x > 0 ? r.x + 1 : 0;
    const right = r.x + r.w < GX ? r.x + r.w - 1 : GX;
    const top = r.z > 0 ? r.z + 1 : 0;
    const bottom = r.z + r.h < GZ ? r.z + r.h - 1 : GZ;
    if (right <= left || bottom <= top) return { zone: FULL_BACKGLASS_ZONE, hidden, occluders, uncertain };
    return { zone: { left: left / GX, top: top / GZ, right: right / GX, bottom: bottom / GZ }, hidden, occluders, uncertain };
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function raster(grid: Uint8Array, a: [number, number], b: [number, number], c: [number, number]): boolean {
  const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxx = Math.min(GX - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minz = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxz = Math.min(GZ - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  if (minx > maxx || minz > maxz) return false;
  const edge = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  if (Math.abs(edge(a, b, c)) < 1e-9) return false;
  let hit = false;
  for (let z = minz; z <= maxz; z++)
    for (let x = minx; x <= maxx; x++) {
      const p: [number, number] = [x + 0.5, z + 0.5];
      const w0 = edge(b, c, p);
      const w1 = edge(c, a, p);
      const w2 = edge(a, b, p);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
        grid[z * GX + x] = 1;
        hit = true;
      }
    }
  return hit;
}

/** La zone pour le plugin : « gauche,haut,droite,bas » en fractions. */
export function zoneSetting(zone: BackglassZone): string {
  return [zone.left, zone.top, zone.right, zone.bottom].map((v) => v.toFixed(4)).join(',');
}

/** Le calcul gardé par table (chemin, taille, date) : 3 s pour une table de 220 Mo, une seule fois. */
export function cachedVrBackglassView(file: string, cacheFile: string): VrBackglassView | undefined {
  let key: string;
  try {
    const st = fs.statSync(file);
    key = `${file}|${st.size}|${Math.round(st.mtimeMs)}`;
  } catch {
    return undefined;
  }
  let cache: Record<string, VrBackglassView> = {};
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Record<string, VrBackglassView>;
  } catch {
    // Pas encore de cache.
  }
  if (cache[key]) return cache[key];
  const view = vrBackglassView(file);
  if (!view) return undefined;
  // Une entrée par table : l'ancienne (fichier changé) est remplacée.
  for (const k of Object.keys(cache)) if (k.startsWith(`${file}|`)) delete cache[k];
  cache[key] = view;
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  } catch {
    // Cache impossible : le calcul sera refait.
  }
  return view;
}

/** Ce que le plugin a mesuré pendant une partie dans le casque (lignes « mesure … », « capture … » de son LogFile). */
export interface VrMeasures {
  /** Relevés de 5 s. */
  samples: number;
  vpx: { mean: number; min: number; max: number };
  /** Plus grand écart entre deux images de VPX, en ms. */
  worstGapMs: number;
  /** Fois où VPX dessine le fronton, par seconde (deux par image en VR : un œil, puis l'autre). */
  backglass: number;
  /** Nouvelles images de la vidéo de PuP la plus active, par seconde. */
  video: { mean: number; min: number; max: number };
  /** Vitesse du temps de jeu (1 : temps réel). */
  gameTime: number;
  captures: { name: string; source: string; brightness: number; ok: boolean }[];
}

/**
 * Le dernier bloc du fichier de mesures : une partie, de sa ligne « debut » (écrite par le plugin au début de
 * la partie) à la fin, et s'il a déjà été reporté au journal (ligne « rapporte », écrite par Cyber Pinball).
 * Le fichier n'est jamais vidé : une partie dont Cyber Pinball n'a pas pu faire le bilan (fermé pendant la
 * partie, essai du 10 novembre 2026) est reportée à la partie suivante, au lieu d'être effacée.
 */
export function lastVrMeasuresBlock(text: string): { text: string; reported: boolean } | undefined {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--)
    if (lines[i]!.startsWith('debut')) {
      start = i;
      break;
    }
  if (start < 0) return undefined;
  const block = lines.slice(start);
  return { text: block.join('\n'), reported: block.some((l) => l.startsWith('rapporte')) };
}

/** Lit un bloc de mesures du plugin (lignes « mesure … », « capture … ») ; undefined s'il n'a rien relevé. */
export function parseVrMeasures(text: string): VrMeasures | undefined {
  const values = (line: string) => Object.fromEntries([...line.matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1]!, m[2]!]));
  const rows = text.split(/\r?\n/).filter((l) => l.startsWith('mesure ')).map(values);
  const captures = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith('capture '))
    .map(values)
    .map((v) => ({ name: v.nom ?? '?', source: v.source ?? '?', brightness: Number(v.luminosite ?? 0), ok: v.resultat === 'ok' }));
  if (!rows.length && !captures.length) return undefined;
  const nums = (key: string) => rows.map((r) => Number(r[key])).filter((n) => Number.isFinite(n));
  const stat = (key: string) => {
    const v = nums(key);
    return v.length ? { mean: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v) } : { mean: 0, min: 0, max: 0 };
  };
  return {
    samples: rows.length,
    vpx: stat('vpx'),
    worstGapMs: Math.max(0, ...nums('ecart_ms')),
    backglass: stat('fronton').mean,
    video: stat('video'),
    gameTime: stat('jeu').mean,
    captures,
  };
}
