// Scènes du DMD du menu vivant (livedmd.ts), choisies sur maquettes animées le 09/11/2026 et
// revues par le directeur artistique :
//
// - le détail de la wheel : la wheel de la table agrandie à 112 points de côté, l'afficheur posé
//   sur sa bande la plus riche en détails (logotype, visage, véhicule) ; il s'allume par-dessus
//   le titre 800 ms après l'arrivée sur la table, glisse, un reflet passe, le titre revient ;
// - six intermèdes de jeu de 2 à 3 s (bumpers, lanceur, flippers, cibles, verrou, multibille),
//   un cycle sur deux, après les records, jamais la même scène deux fois de suite.
//
// Tout reste dans la grammaire des vrais DMD : une bille de 3 points au plein éclat, sa traînée
// de trois positions (10, 6, 3), le décor aux nuances 3 à 5, des flashs de 80 ms au contact, des
// durées multiples de 40 ms (une image à 25 par seconde).

import { DMD_FONT_LARGE, DMD_FONT_SMALL, dmdText, textWidth } from './dmdfont';
import {
  DMD_HEIGHT,
  DMD_LEVEL,
  DMD_USABLE,
  DMD_WIDTH,
  LiveDmdProgram,
  blankDots,
  dotHash,
  drawCentered,
  easeDots,
  liveDmdPages,
  type DmdDots,
  type DmdPage,
  type LiveDmdInput,
} from './livedmd';
import type { RgbaImage } from './png';

const W = DMD_WIDTH;
const H = DMD_HEIGHT;
/** Une image du DMD, en ms (25 par seconde). */
const FRAME = 40;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Rythme des scènes (directeur artistique, 09/11/2026). */
export const LIVE_DMD_SCENES = {
  /** Le détail de la wheel s'allume après ce temps sur la table (la navigation rapide ne montre que les titres). */
  wheelAfter: 800,
  /** Côté de la wheel agrandie, en points. */
  wheelSize: 112,
  /** Glissement du détail (16 points), arrêt, reflet, arrêt : 1 760 ms avant le retour du titre. */
  wheelSlide: 640,
  wheelStill: 480,
  wheelShine: 240,
  wheelRest: 400,
  /** Course du glissement, en points de chaque côté de la bande choisie. */
  wheelTravel: 8,
};

// ---------------------------------------------------------------------------
// Dessin en points

function plot(d: DmdDots, x: number, y: number, v: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H || v <= 0) return;
  const i = y * W + x;
  if (v > d[i]!) d[i] = Math.min(15, Math.round(v));
}

/** Disque lissé : la couverture de chaque point donne sa nuance. */
function disc(d: DmdDots, cx: number, cy: number, r: number, level: number): void {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const cover = clamp(r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy), 0, 1);
      plot(d, x, y, level * cover);
    }
  }
}

function ring(d: DmdDots, cx: number, cy: number, r: number, level: number, width = 1): void {
  for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) {
    for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const dist = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r);
      plot(d, x, y, level * clamp(width / 2 + 0.5 - dist, 0, 1));
    }
  }
}

function line(d: DmdDots, x0: number, y0: number, x1: number, y1: number, level: number): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
  for (let i = 0; i <= n; i++) plot(d, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, level);
}

function rect(d: DmdDots, x: number, y: number, w: number, h: number, level: number): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) plot(d, xx, yy, level);
}

type Point = [number, number];
/** Position à un instant : [t, x, y]. */
type Timed = [number, number, number];

/** Bille de 3 points au plein éclat et sa traînée : trois positions précédentes aux nuances 10, 6, 3. */
function ball(d: DmdDots, trail: Point[], level: number = DMD_LEVEL.accent): void {
  const recent = trail.slice(-4);
  recent.forEach(([x, y], i) => {
    const age = recent.length - 1 - i;
    disc(d, x, y, age ? 1.2 : 1.5, age ? [0, 10, 6, 3][age]! : level);
  });
}

/** Texte d'une scène : en grand sur une ligne, sinon en grand sur deux, sinon en petit. */
function bigText(d: DmdDots, text: string, level: number = DMD_LEVEL.main): void {
  const t = dmdText(text);
  if (textWidth(DMD_FONT_LARGE, t) <= DMD_USABLE) return drawCentered(d, DMD_FONT_LARGE, t, 9, level);
  const words = t.split(' ');
  if (words.length === 2 && words.every((w) => textWidth(DMD_FONT_LARGE, w) <= DMD_USABLE)) {
    drawCentered(d, DMD_FONT_LARGE, words[0]!, 1, level);
    return drawCentered(d, DMD_FONT_LARGE, words[1]!, 17, level);
  }
  drawCentered(d, DMD_FONT_SMALL, t, 12, level);
}

/** Position sur un parcours [t, x, y] à l'instant t, entre deux points connus. */
function pathAt(points: Timed[], t: number): Point {
  const first = points[0]!;
  if (t <= first[0]) return [first[1], first[2]];
  for (let i = 1; i < points.length; i++) {
    const [t1, x1, y1] = points[i]!;
    if (t <= t1) {
      const [t0, x0, y0] = points[i - 1]!;
      const k = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
  }
  const last = points.at(-1)!;
  return [last[1], last[2]];
}

/** Les `n` dernières positions sur le parcours, une par image. */
function trailOf(points: Timed[], t: number, n = 4): Point[] {
  const out: Point[] = [];
  for (let i = n - 1; i >= 0; i--) if (t - i * FRAME >= 0) out.push(pathAt(points, t - i * FRAME));
  return out;
}

/** Bille libre entre les murs de l'afficheur, à pas d'une milliseconde (vitesses en points par seconde). */
function bounce(ms: number, x: number, y: number, vx: number, vy: number): Timed[] {
  const out: Timed[] = [];
  const [x0, y0, x1, y1] = [2, 2, W - 3, H - 3];
  for (let t = 0; t <= ms; t++) {
    out.push([t, x, y]);
    x += vx / 1000;
    y += vy / 1000;
    if (x < x0 || x > x1) (vx = -vx), (x = clamp(x, x0, x1));
    if (y < y0 || y > y1) (vy = -vy), (y = clamp(y, y0, y1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Détail de la wheel

/** La wheel en points : `width` × `height` nuances, et la course de la fenêtre de 32 lignes. */
export interface WheelDetail {
  width: number;
  height: number;
  dots: Uint8Array;
  /** Première ligne montrée au début du glissement, puis à la fin. */
  from: number;
  to: number;
}

/**
 * La wheel en points (`size` points de côté au plus), aux tons du directeur artistique : fond 0,
 * ombres 1 à 3, volumes 5 à 10, contours 12 à 14, rares éclats 15, sans tramage. La valeur d'un
 * pixel tient de son canal le plus fort (un rouge vif reste vif sur un afficheur d'une couleur),
 * l'image est recadrée sur sa partie visible, réduite par moyenne, rendue nette, puis étalée.
 * undefined : rien de visible.
 */
export function wheelDetail(img: RgbaImage, size = LIVE_DMD_SCENES.wheelSize): WheelDetail | undefined {
  const { width: w, height: h, data } = img;
  if (!w || !h || data.length < w * h * 4) return undefined;
  const val = new Float32Array(w * h);
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3]! / 255;
    const r = data[i * 4]! / 255;
    const g = data[i * 4 + 1]! / 255;
    const b = data[i * 4 + 2]! / 255;
    const v = a * (0.55 * Math.max(r, g, b) + 0.45 * (0.2126 * r + 0.7152 * g + 0.0722 * b));
    val[i] = v;
    if (a > 0.15 && v > 0.06) {
      const x = i % w;
      const y = Math.floor(i / w);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return undefined;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const s = Math.min(size / bw, size / bh);
  const ow = Math.max(1, Math.round(bw * s));
  const oh = Math.max(1, Math.round(bh * s));
  // Réduction par moyenne de la surface couverte.
  const small = new Float32Array(ow * oh);
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      const sx0 = x0 + Math.floor(ox / s);
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor((ox + 1) / s));
      const sy0 = y0 + Math.floor(oy / s);
      const sy1 = Math.max(sy0 + 1, y0 + Math.floor((oy + 1) / s));
      let sum = 0;
      let n = 0;
      for (let y = sy0; y < Math.min(sy1, h); y++) for (let x = sx0; x < Math.min(sx1, w); x++) (sum += val[y * w + x]!), n++;
      small[oy * ow + ox] = n ? sum / n : 0;
    }
  }
  // Netteté : masque flou de 3 × 3, à 0,9.
  const at = (x: number, y: number) => small[clamp(y, 0, oh - 1) * ow + clamp(x, 0, ow - 1)]!;
  const sharp = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let blur = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) blur += at(x + dx, y + dy);
      sharp[y * ow + x] = Math.max(0, at(x, y) + 0.9 * (at(x, y) - blur / 9));
    }
  }
  // Étalement : 5 % les plus sombres des points allumés au noir, 3 % les plus clairs au plein éclat.
  const lit = [...sharp].filter((v) => v > 0.03).sort((a, b) => a - b);
  if (!lit.length) return undefined;
  const lo = lit[Math.floor(lit.length * 0.05)]!;
  const hi = lit[Math.floor(lit.length * 0.97)]!;
  const dots = new Uint8Array(ow * oh);
  for (let i = 0; i < ow * oh; i++) {
    const v = Math.pow(clamp((sharp[i]! - lo) / Math.max(1e-6, hi - lo), 0, 1), 0.85) * 15;
    const tone = v < 2 ? 0 : v < 5 ? 1 + ((v - 2) / 3) * 2 : v < 11 ? 5 + ((v - 5) / 6) * 5 : v < 14.5 ? 12 + ((v - 11) / 3.5) * 2 : 15;
    dots[i] = tone < 1.5 ? 0 : Math.round(tone);
  }
  if (!dots.some((v) => v > 0)) return undefined;
  // La bande de 32 lignes la plus riche en bords (logotype, visage, véhicule) : l'afficheur s'y pose.
  let best = 0;
  let bestScore = -1;
  for (let off = 0; off <= oh - H; off++) {
    let score = 0;
    for (let y = off; y < off + H - 1; y++) {
      for (let x = 0; x < ow - 1; x++) {
        const v = dots[y * ow + x]!;
        score += Math.abs(v - dots[y * ow + x + 1]!) + Math.abs(v - dots[(y + 1) * ow + x]!);
      }
    }
    if (score > bestScore) (bestScore = score), (best = off);
  }
  const travel = LIVE_DMD_SCENES.wheelTravel;
  const last = Math.max(0, oh - H);
  return { width: ow, height: oh, dots, from: clamp(best - travel, 0, last), to: clamp(best + travel, 0, last) };
}

/** La fenêtre de 32 lignes de la wheel, à partir de la ligne `offset` (une wheel plus basse que l'afficheur est centrée). */
function wheelWindow(detail: WheelDetail, offset: number): DmdDots {
  const d = blankDots();
  const dx = Math.floor((W - detail.width) / 2);
  const dy = detail.height < H ? Math.floor((H - detail.height) / 2) : -Math.round(offset);
  for (let y = 0; y < detail.height; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < detail.width; x++) {
      const tx = x + dx;
      if (tx >= 0 && tx < W) d[ty * W + tx] = detail.dots[y * detail.width + x]!;
    }
  }
  return d;
}

/**
 * Page du détail de la wheel (allumée par-dessus le titre : livedmd.ts, transition « light ») :
 * glissement de 16 points (640 ms), arrêt (480 ms), reflet de 3 points de large qui relève les
 * points allumés de 2 nuances (240 ms), arrêt (400 ms) ; le titre la pousse ensuite vers le haut.
 */
export function wheelPage(detail: WheelDetail): DmdPage {
  const { wheelSlide, wheelStill, wheelShine, wheelRest } = LIVE_DMD_SCENES;
  const still = wheelWindow(detail, detail.to);
  const shineAt = wheelSlide + wheelStill;
  return {
    id: 'wheel',
    hold: wheelSlide + wheelStill + wheelShine + wheelRest,
    animated: true,
    dots(elapsed) {
      if (elapsed < wheelSlide) return wheelWindow(detail, detail.from + (detail.to - detail.from) * easeDots(elapsed / wheelSlide));
      if (elapsed < shineAt || elapsed >= shineAt + wheelShine) return still;
      const pos = -6 + ((elapsed - shineAt) / wheelShine) * (W + 24);
      return Uint8Array.from(still, (v, i) => (v && Math.abs((i % W) + Math.floor(i / W) * 0.6 - pos) < 1.5 ? Math.min(15, v + 2) : v));
    },
  };
}

// ---------------------------------------------------------------------------
// Intermèdes de jeu

/** Une scène : son dessin à l'instant t, et sa durée. */
interface Scene {
  ms: number;
  at(t: number): DmdDots;
}

function bumpersScene(): Scene {
  // Trois bumpers de 13 points, 4 chocs écrits d'avance : flash de 80 ms, retour en 160 ms, étincelles.
  const bumpers = [
    { x: 38, y: 17, r: 6.5 },
    { x: 64, y: 13, r: 6.5 },
    { x: 90, y: 18, r: 6.5 },
  ];
  const order = [0, 1, 2, 1];
  let [px, py] = [2, 31];
  const contacts = order.map((i): Point => {
    const b = bumpers[i]!;
    const len = Math.hypot(px - b.x, py - b.y);
    const c: Point = [b.x + ((px - b.x) / len) * (b.r + 2), b.y + ((py - b.y) / len) * (b.r + 2)];
    [px, py] = c;
    return c;
  });
  // Tout le parcours (entrée, chocs, sortie) en 2 360 ms : la scène tient en 2,8 s, comme les autres.
  const route: Point[] = [[2, 31], ...contacts, [132, 2]];
  const length = route.slice(1).reduce((n, c, k) => n + Math.hypot(c[0] - route[k]![0], c[1] - route[k]![1]), 0);
  const speed = length / 2360;
  const pts: Timed[] = [
    [0, 2, 31],
    [200, 2, 31],
  ];
  const hits: { t: number; i: number }[] = [];
  let t0 = 200;
  let prev: Point = [2, 31];
  contacts.forEach((c, k) => {
    t0 += Math.hypot(c[0] - prev[0], c[1] - prev[1]) / speed;
    pts.push([t0, c[0], c[1]]);
    hits.push({ t: t0, i: order[k]! });
    prev = c;
  });
  t0 += Math.hypot(132 - prev[0], 2 - prev[1]) / speed;
  pts.push([t0, 132, 2]);
  return {
    ms: t0 + 240,
    at(t) {
      const d = blankDots();
      bumpers.forEach((b, i) => {
        const last = hits.filter((h) => h.i === i && h.t <= t).at(-1);
        const age = last ? t - last.t : Infinity;
        const glow = age < 80 ? 15 : age < 240 ? 15 - ((age - 80) / 160) * 10 : 5;
        ring(d, b.x, b.y, b.r, glow, 1.6);
        disc(d, b.x, b.y, 2.5, age < 240 ? glow : 3);
        if (age < 200) {
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            const r = b.r + 2 + age / 25;
            plot(d, b.x + Math.cos(a) * r * 1.3, b.y + Math.sin(a) * r * 0.9, 12 - age / 20);
          }
        }
      });
      ball(d, trailOf(pts, t));
      return d;
    },
  };
}

function plungerScene(): Scene {
  // Compression de 400 ms qui tremble sur la fin, détente de 80 ms, puis le couloir, l'orbite et la sortie en haut.
  const rail = 27;
  const [cx, cy] = [15, 15];
  const release = 600;
  const pts: Timed[] = [
    [0, 112, rail],
    [release + 40, 112, rail],
    [release + 340, cx, rail],
  ];
  for (let i = 1; i <= 16; i++) {
    const a = Math.PI / 2 + Math.PI * (i / 16);
    pts.push([release + 340 + i * 15, cx + Math.cos(a) * 12, cy + Math.sin(a) * 12]);
  }
  const top = pts.at(-1)![0];
  pts.push([top + 110, 70, 3], [top + 220, 140, 3]);
  return {
    ms: top + 480,
    at(t) {
      const d = blankDots();
      for (let x = cx; x < 124; x++) plot(d, x, rail + 3, 4);
      for (let i = 0; i <= 60; i++) {
        const a = Math.PI / 2 + Math.PI * (i / 60);
        plot(d, cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, 4);
      }
      for (let x = 30; x < 110; x += 4) plot(d, x, 7, 3);
      const pull = t < 200 ? 0 : t < release ? easeDots((t - 200) / 400) * 7 : Math.max(0, 7 - ((t - release) / 80) * 7);
      const shake = t > 450 && t < release ? (dotHash(Math.floor(t / FRAME), 1) - 0.5) * 1.4 : 0;
      const x0 = 116 + pull + shake;
      const spring = t >= release && t < release + 80 ? 15 : DMD_LEVEL.secondary;
      for (let i = 0; i < 5; i++) line(d, x0 + i * ((127 - x0) / 5), rail - 3, x0 + (i + 0.5) * ((127 - x0) / 5), rail + 2, spring);
      rect(d, Math.round(x0) - 1, rail - 3, 2, 6, DMD_LEVEL.main);
      ball(d, t < release + 40 ? [[x0 - 4, rail]] : trailOf(pts, t));
      return d;
    },
  };
}

function flippersScene(): Scene {
  // Palettes de 3 points d'épaisseur ; la bille tombe sur la gauche, qui frappe en 80 ms et revient
  // en 160 ms ; la bille part au contact, dans l'axe de la palette levée.
  const pivots: Point[] = [
    [46, 20],
    [82, 20],
  ];
  const L = 13;
  const rest = 0.5;
  const up = -0.4;
  const hit = 1000;
  const angle = (t: number) => (t < hit ? rest : t < hit + 80 ? rest + (up - rest) * ((t - hit) / 80) : t < hit + 120 ? up : t < hit + 280 ? up + (rest - up) * ((t - hit - 120) / 160) : rest);
  const onFlipper = (a: number, s: number): Point => [pivots[0]![0] + Math.cos(a) * s + Math.sin(a) * 2.2, pivots[0]![1] + Math.sin(a) * s - Math.cos(a) * 2.2];
  const land = onFlipper(rest, 8);
  const launch = onFlipper(up, 10);
  const pts: Timed[] = [];
  for (let t = 0; t <= 700; t += 20) pts.push([t, 52 + (land[0] - 52) * (t / 700), -3 + (land[1] + 3) * (t / 700) ** 2]);
  const rolled = onFlipper(rest, 10);
  pts.push([hit, ...rolled], [hit + 40, ...launch], [hit + 460, 108, -6]);
  return {
    ms: hit + 760,
    at(t) {
      const d = blankDots();
      line(d, 0, 8, 44, 20, 4);
      line(d, 127, 8, 84, 20, 4);
      const a = angle(t);
      const striking = t >= hit && t < hit + 120;
      pivots.forEach(([px, py], k) => {
        const dir = k === 0 ? a : Math.PI - rest;
        for (let w = -1; w <= 1; w++) {
          const ox = -Math.sin(dir) * w;
          const oy = Math.cos(dir) * w;
          const len = L - Math.abs(w) * 2;
          line(d, px + ox, py + oy, px + Math.cos(dir) * len + ox, py + Math.sin(dir) * len + oy, k === 0 && striking ? 15 : 11);
        }
        disc(d, px, py, 1.8, 15);
      });
      ball(d, t > hit ? trailOf(pts, t) : [pathAt(pts, t)]);
      return d;
    },
  };
}

function targetsScene(): Scene {
  // Trois cibles tombantes frappées en 1 200 ms, « BANK COMPLETE » 600 ms, puis les cibles se relèvent.
  const targets = [8, 15, 22];
  const hits = [300, 750, 1200];
  const pts: Timed[] = [
    [0, -4, 4],
    [hits[0]!, 112, targets[0]!],
    [hits[0]! + 220, 70, 26],
    [hits[1]!, 112, targets[1]!],
    [hits[1]! + 220, 64, 4],
    [hits[2]!, 112, targets[2]!],
    [hits[2]! + 300, -6, 30],
  ];
  const text = hits[2]! + 200;
  return {
    ms: text + 1000,
    at(t) {
      const d = blankDots();
      if (t >= text && t < text + 600) {
        bigText(d, 'BANK COMPLETE', t < text + 80 ? 15 : DMD_LEVEL.main);
        return d;
      }
      for (let y = 2; y < 30; y++) plot(d, 124, y, 4);
      const reset = t >= text + 600;
      targets.forEach((y, i) => {
        if (reset) {
          const k = clamp((t - text - 600) / 160, 0, 1);
          return rect(d, 116 + Math.round((1 - k) * 6), y - 2, 4, 5, 12);
        }
        const down = t > hits[i]! ? clamp((t - hits[i]!) / 80, 0, 1) : 0;
        if (down < 1) rect(d, 116 + Math.round(down * 6), y - 2, 4, 5, t >= hits[i]! && t < hits[i]! + 80 ? 15 : 12);
        else plot(d, 121, y, 4);
      });
      if (t < hits[2]! + 300) ball(d, trailOf(pts, t));
      return d;
    },
  };
}

function lockScene(): Scene {
  // La bille ralentit vers le trou, les flèches défilent vers lui ; capture, extinction en 80 ms, « BALL LOCKED » 800 ms.
  const hole: Point = [104, 16];
  const inside = 1000;
  const pts: Timed[] = [];
  for (let t = 0; t <= inside; t += 20) {
    const k = 1 - (1 - t / inside) ** 2;
    pts.push([t, -4 + (hole[0] + 4) * k, 26 - Math.sin(k * Math.PI) * 14 + (hole[1] - 26) * k]);
  }
  const text = inside + 160;
  return {
    ms: text + 1000,
    at(t) {
      const d = blankDots();
      if (t >= text && t < text + 800) {
        bigText(d, 'BALL LOCKED', t < text + 80 ? 15 : DMD_LEVEL.main);
        return d;
      }
      const flash = t >= inside && t < inside + 80;
      ring(d, hole[0], hole[1], 4.5, flash ? 15 : 5, 1.4);
      for (let k = 0; k < 3; k++) {
        const x = 70 + k * 9;
        const lit = Math.floor(t / 120) % 3 === k ? 12 : 4;
        line(d, x, 12, x + 4, 16, lit);
        line(d, x + 4, 16, x, 20, lit);
      }
      if (t < inside) ball(d, trailOf(pts, t));
      else if (t < inside + 80) disc(d, hole[0], hole[1], 1.5 * (1 - (t - inside) / 80), 15);
      return d;
    },
  };
}

function multiballScene(): Scene {
  // Trois billes libres dans le cadre de l'afficheur.
  const ms = 2800;
  const balls = [bounce(ms, 10, 8, 80, 40), bounce(ms, 64, 26, -92, -33), bounce(ms, 118, 14, -70, 46)];
  return {
    ms,
    at(t) {
      const d = blankDots();
      for (let x = 0; x < W; x++) plot(d, x, 0, 4), plot(d, x, H - 1, 4);
      for (let y = 0; y < H; y++) plot(d, 0, y, 4), plot(d, W - 1, y, 4);
      for (const path of balls) ball(d, trailOf(path, t));
      return d;
    },
  };
}

/** Les six intermèdes, dans l'ordre de leur rotation. */
export const DMD_INTERLUDES = {
  bumpers: bumpersScene,
  lanceur: plungerScene,
  flippers: flippersScene,
  cibles: targetsScene,
  verrou: lockScene,
  multibille: multiballScene,
} satisfies Record<string, () => Scene>;

export type DmdInterludeName = keyof typeof DMD_INTERLUDES;

/** Pages des intermèdes, calculées une fois : leurs images ne dépendent d'aucune table. */
const interludeMemo = new Map<DmdInterludeName, DmdPage>();

/** Page d'un intermède : ses images toutes les 40 ms, calculées une fois. */
export function interludePage(name: DmdInterludeName): DmdPage {
  const known = interludeMemo.get(name);
  if (known) return known;
  const scene = DMD_INTERLUDES[name]();
  const frames: DmdDots[] = [];
  for (let t = 0; t < scene.ms; t += FRAME) frames.push(scene.at(t));
  const page: DmdPage = {
    id: 'interlude',
    hold: frames.length * FRAME,
    animated: true,
    dots: (elapsed) => frames[clamp(Math.floor(elapsed / FRAME), 0, frames.length - 1)]!,
  };
  interludeMemo.set(name, page);
  return page;
}

/** Ordre des intermèdes pour une table : la rotation part d'une scène tirée de son titre (deux tables voisines ne commencent pas pareil). */
export function interludeOrder(title: string): DmdInterludeName[] {
  const names = Object.keys(DMD_INTERLUDES) as DmdInterludeName[];
  let h = 0;
  for (const c of title) h = (Math.imul(h, 31) + c.codePointAt(0)!) >>> 0;
  const start = h % names.length;
  return names.map((_, i) => names[(start + i) % names.length]!);
}

/** L'alternance avec un intermède : après le dernier record, sinon après PRESS START. */
function withInterlude(pages: DmdPage[], scene: DmdPage): DmdPage[] {
  let at = pages.map((p) => p.id).lastIndexOf('records');
  if (at < 0) at = pages.findIndex((p) => p.id === 'press-start');
  if (at < 0) return pages;
  return [...pages.slice(0, at + 1), scene, ...pages.slice(at + 1)];
}

/**
 * Programme complet du DMD vivant : l'alternance (liveDmdPages) avec un intermède un cycle sur
 * deux, les six scènes tour à tour (environ toutes les 45 s, jamais deux fois la même de suite),
 * et, quand la wheel de la table est connue, son détail 800 ms après l'arrivée sur la table.
 */
export function liveDmdProgram(input: LiveDmdInput | undefined): LiveDmdProgram {
  const base = liveDmdPages(input);
  const pages: DmdPage[] = [];
  for (const name of interludeOrder(input?.title ?? '')) pages.push(...withInterlude(base, interludePage(name)), ...base);
  const intro = input?.title && input.wheel ? { page: wheelPage(input.wheel), after: LIVE_DMD_SCENES.wheelAfter } : undefined;
  return new LiveDmdProgram(pages, intro);
}
