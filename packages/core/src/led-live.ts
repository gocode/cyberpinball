// Pilotage des LED adressables hors partie : la partie pure (aucune entrée-sortie).
//
// DOF ne pilote les bandes que pendant une partie de VPX. Pour tester la configuration, ou pour
// animer la roue, Cyber Pinball parle lui-même aux contrôleurs, avec les mêmes protocoles que
// libdof (vpinball/libdof, src/cab/out/adressableledstrip/TeensyStripController.cpp,
// WemosD1StripController.cpp ; src/cab/out/dmx/ArtNet.cpp). Ce module décrit :
// - la disposition d'une bande (rang d'une LED → colonne et ligne, selon LedArrangement) ;
// - l'image (une couleur par LED et par bande) et sa conversion en octets du fil (ordre des
//   couleurs, luminosité, bandes chaînées sur une même sortie) ;
// - les paquets du protocole série du Teensy et du Wemos D1 (M, L, Z, C, R, Q, O) et les paquets Art-Net ;
// - les effets (couleur unie, chenillard, arc-en-ciel, balayage…) et les motifs d'essai ;
// - un faux contrôleur série (`SimulatedStripDevice`) qui comprend ce protocole, pour les essais sans matériel.
// Le port série, le réseau et l'horloge sont dans app/src/led-live.ts.

import {
  ARTNET_LEDS_PER_UNIVERSE,
  artnetUniverse,
  controllerSettings,
  ledsPerOutput,
  stripLedCount,
  type CabinetLeds,
  type LedArrangement,
  type LedColorOrder,
  type LedStripSpec,
} from './dof';
import { t } from './i18n';
import { hsvToRgb, type Rgb } from './jukebox-visualizer';

// ---------------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------------

export const LED_BLACK: Rgb = [0, 0, 0];
export const LED_RED: Rgb = [255, 0, 0];
export const LED_GREEN: Rgb = [0, 255, 0];
export const LED_BLUE: Rgb = [0, 0, 255];
export const LED_WHITE: Rgb = [255, 255, 255];

const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

/** `#rrggbb` ou `rrggbb` ; undefined si illisible. */
export function parseLedColor(text: string): Rgb | undefined {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text.trim());
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : undefined;
}

/** Octets d'une LED dans l'ordre de ses puces : « GRB » envoie le vert, puis le rouge, puis le bleu. */
export function wireColor(order: LedColorOrder, [r, g, b]: Rgb): [number, number, number] {
  const by: Record<string, number> = { R: r, G: g, B: b };
  return [by[order[0]!]!, by[order[1]!]!, by[order[2]!]!];
}

/** Couleur vue quand une bande d'ordre réel `actual` reçoit des octets rangés pour `configured` (essai de l'ordre). */
export function seenColor(configured: LedColorOrder, actual: LedColorOrder, color: Rgb): Rgb {
  const wire = wireColor(configured, color);
  const seen: Record<string, number> = {};
  for (let i = 0; i < 3; i++) seen[actual[i]!] = wire[i]!;
  return [seen.R!, seen.G!, seen.B!];
}

// ---------------------------------------------------------------------------
// Disposition d'une bande
// ---------------------------------------------------------------------------

export interface LedGrid {
  width: number;
  height: number;
  arrangement: LedArrangement;
}

const ARRANGEMENT = /^(LeftRight|RightLeft|TopDown|BottomUp)(Alternate)?(LeftRight|RightLeft|TopDown|BottomUp)$/;

/**
 * Colonne et ligne (0 : en haut à gauche) de la LED de rang `k` (0 : la première, côté données).
 * LeftRightTopDown : les lignes se suivent de haut en bas, chacune de gauche à droite ;
 * TopDownLeftRight : les colonnes se suivent de gauche à droite, chacune de haut en bas ;
 * « Alternate » : une ligne sur deux est parcourue à l'envers (serpentin).
 */
export function ledXY(grid: LedGrid, k: number): { x: number; y: number } {
  const m = ARRANGEMENT.exec(grid.arrangement);
  if (!m) return { x: k % Math.max(1, grid.width), y: 0 };
  const [, first, alternate, second] = m as unknown as [string, string, string | undefined, string];
  const alongRows = first === 'LeftRight' || first === 'RightLeft';
  const run = alongRows ? grid.width : grid.height;
  const line = Math.floor(k / run);
  let pos = k % run;
  if (alternate && line % 2 === 1) pos = run - 1 - pos;
  if (alongRows) {
    return { x: first === 'LeftRight' ? pos : run - 1 - pos, y: second === 'TopDown' ? line : grid.height - 1 - line };
  }
  return { y: first === 'TopDown' ? pos : run - 1 - pos, x: second === 'LeftRight' ? line : grid.width - 1 - line };
}

/**
 * Position (0 à 1) de la LED de rang `k` sur une bande simple, d'après sa disposition déclarée (Cabinet.xml) :
 * bande verticale (largeur 1), du BAS (0, côté flippers) vers le HAUT (1), que la première LED soit en haut
 * (TopDown, le cas courant de DOF) ou en bas (BottomUp) ; bande à plat (hauteur 1), de gauche (0) à droite (1).
 * Les effets qui « montent » s'en servent, comme la scène DOF des flips : jamais l'ordre de câblage seul
 * (retour d'essai du 26/11/2026 : l'ouverture descendait sur une bande câblée par le haut).
 */
export function ledStripPosition(grid: LedGrid, k: number): number {
  const w = Math.max(0, Math.floor(grid.width) || 0);
  const h = Math.max(0, Math.floor(grid.height) || 0);
  const { x, y } = ledXY(grid, k);
  if (h > 1) return (h - 1 - y) / (h - 1);
  return w > 1 ? x / (w - 1) : 0.5;
}

/** Rang de la LED à la colonne x et à la ligne y (réciproque de `ledXY`). */
export function ledIndexAt(grid: LedGrid, x: number, y: number): number {
  const n = Math.max(0, grid.width) * Math.max(0, grid.height);
  for (let k = 0; k < n; k++) {
    const p = ledXY(grid, k);
    if (p.x === x && p.y === y) return k;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Image : une couleur par LED, par bande
// ---------------------------------------------------------------------------

/**
 * Image des bandes : un tableau par bande de `leds.strips`, dans l'ordre de la liste, 3 octets
 * (rouge, vert, bleu) par LED, la première LED d'abord. Les couleurs sont celles qu'on veut voir :
 * l'ordre des puces et la luminosité ne s'appliquent qu'à l'envoi.
 */
export type LedFrame = Uint8Array[];

export function createLedFrame(leds: Pick<CabinetLeds, 'strips'>): LedFrame {
  return leds.strips.map((s) => new Uint8Array(stripLedCount(s) * 3));
}

export function fillLedStrip(strip: Uint8Array, color: Rgb): void {
  for (let i = 0; i + 2 < strip.length; i += 3) {
    strip[i] = color[0];
    strip[i + 1] = color[1];
    strip[i + 2] = color[2];
  }
}

export function setLed(strip: Uint8Array, k: number, color: Rgb): void {
  if (k < 0 || k * 3 + 2 >= strip.length) return;
  strip[k * 3] = color[0];
  strip[k * 3 + 1] = color[1];
  strip[k * 3 + 2] = color[2];
}

export function ledFramesEqual(a: LedFrame, b: LedFrame): boolean {
  return a.length === b.length && a.every((s, i) => s.length === b[i]!.length && s.every((v, j) => v === b[i]![j]));
}

/**
 * Octets du fil pour chaque sortie du contrôleur (sortie 1 en premier) : les bandes d'une même sortie
 * se suivent dans l'ordre de la liste, chaque LED dans l'ordre de ses puces (`colorOrder`) et à la
 * luminosité de sa bande, multipliée par `master` (0 à 1).
 */
export function ledWireOutputs(leds: Pick<CabinetLeds, 'strips'>, frame: LedFrame, master = 1): Uint8Array[] {
  const sizes = new Array<number>(Math.max(0, ...leds.strips.map((s) => s.output))).fill(0);
  for (const s of leds.strips) sizes[s.output - 1]! += stripLedCount(s) * 3;
  const outputs = sizes.map((n) => new Uint8Array(n));
  const used = sizes.map(() => 0);
  leds.strips.forEach((s, i) => {
    const out = outputs[s.output - 1]!;
    const source = frame[i];
    const gain = (Math.max(0, Math.min(100, s.brightness)) / 100) * Math.max(0, Math.min(1, master));
    const n = stripLedCount(s);
    for (let k = 0; k < n; k++) {
      const rgb: Rgb = source && k * 3 + 2 < source.length ? [source[k * 3]!, source[k * 3 + 1]!, source[k * 3 + 2]!] : LED_BLACK;
      const [a, b, c] = wireColor(s.colorOrder, [clampByte(rgb[0] * gain), clampByte(rgb[1] * gain), clampByte(rgb[2] * gain)]);
      const at = used[s.output - 1]! + k * 3;
      out[at] = a;
      out[at + 1] = b;
      out[at + 2] = c;
    }
    used[s.output - 1]! += n * 3;
  });
  return outputs;
}

// ---------------------------------------------------------------------------
// Protocole série du Teensy et du Wemos D1 (TeensyStripController, WemosD1MPStripController)
// ---------------------------------------------------------------------------

export interface StripSerialConfig {
  port: string;
  baudRate: number;
  dataBits: number;
  /** Délai d'attente d'une réponse, en ms. */
  timeoutMs: number;
  openWaitMs: number;
  handshakeStartWaitMs: number;
  handshakeEndWaitMs: number;
  dtr: boolean;
  /** Nombre de LED de chaque sortie (10 sorties au plus). */
  ledsPerStrip: number[];
  /** Wemos D1 : envoyer la longueur de chaque sortie (Z) et compresser les données (Q). */
  sendPerLedstripLength: boolean;
  useCompression: boolean;
}

const numberSetting = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) ? n : fallback;
};
const boolSetting = (v: string | undefined, fallback: boolean): boolean => (v === undefined ? fallback : v.trim().toLowerCase() === 'true');

/** Réglages du port d'après le contrôleur décrit : valeurs de libdof, puis celles du Wemos D1, puis celles du fichier. */
export function stripSerialConfig(leds: CabinetLeds): StripSerialConfig {
  const s = controllerSettings(leds);
  const perOutput = ledsPerOutput(leds);
  const bound = (v: number, lo: number, hi: number, fallback: number) => (v >= lo && v <= hi ? v : fallback);
  return {
    port: leds.port.trim().toUpperCase(),
    baudRate: bound(numberSetting(s.ComPortBaudRate, 9600), 300, 4_000_000, 9600),
    dataBits: bound(numberSetting(s.ComPortDataBits, 8), 5, 8, 8),
    timeoutMs: bound(numberSetting(s.ComPortTimeOutMs, 200), 1, 5000, 200),
    openWaitMs: bound(numberSetting(s.ComPortOpenWaitMs, 50), 50, 5000, 50),
    handshakeStartWaitMs: bound(numberSetting(s.ComPortHandshakeStartWaitMs, 20), 20, 500, 20),
    handshakeEndWaitMs: bound(numberSetting(s.ComPortHandshakeEndWaitMs, 50), 50, 500, 50),
    dtr: boolSetting(s.ComPortDtrEnable, false),
    ledsPerStrip: Array.from({ length: 10 }, (_, i) => perOutput[i] ?? 0),
    sendPerLedstripLength: leds.controller === 'WemosD1MPStripController' && boolSetting(s.SendPerLedstripLength, false),
    useCompression: leds.controller === 'WemosD1MPStripController' && boolSetting(s.UseCompression, false),
  };
}

/** Une commande envoyée d'un bloc ; `acks` réponses « A » attendues ensuite. */
export interface StripPacket {
  bytes: Uint8Array;
  acks: number;
}

const bytes = (...v: number[]): Uint8Array => Uint8Array.from(v);
const hi = (n: number) => (n >> 8) & 255;
const lo = (n: number) => n & 255;

/** Demande du nombre maximal de LED par sortie (la carte répond 2 octets, puis « A »). */
export const STRIP_QUERY_MAX = bytes(0x4d);
/** Un octet nul : sonde du mode commande (la carte répond « A » ou « N »). */
export const STRIP_PING = bytes(0);
export const STRIP_CLEAR = bytes(0x43);
export const STRIP_SHOW = bytes(0x4f);
export const STRIP_TEST = bytes(0x54);

export function stripSetLength(perChannel: number): Uint8Array {
  return bytes(0x4c, hi(perChannel), lo(perChannel));
}

/** Wemos D1 : longueur de la sortie `index` (Z, index, dernière sortie, nombre de LED). */
export function stripResize(index: number, last: number, count: number): Uint8Array {
  return bytes(0x5a, index, last, hi(count), lo(count));
}

/** Données non compressées d'une sortie (R, position de départ, nombre de LED, octets). */
export function stripData(position: number, rgb: Uint8Array): Uint8Array {
  const leds = rgb.length / 3;
  const out = new Uint8Array(5 + rgb.length);
  out.set([0x52, hi(position), lo(position), hi(leds), lo(leds)]);
  out.set(rgb, 5);
  return out;
}

/** Compression du Wemos D1 : (répétitions, r, g, b) par plage de LED identiques, 254 au plus. */
export function compressLedRuns(rgb: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < rgb.length) {
    if (rgb.length - i === 3) {
      out.push(1, rgb[i]!, rgb[i + 1]!, rgb[i + 2]!);
      break;
    }
    const [r, g, b] = [rgb[i]!, rgb[i + 1]!, rgb[i + 2]!];
    i += 3;
    let n = 1;
    while (i < rgb.length && rgb[i] === r && rgb[i + 1] === g && rgb[i + 2] === b && n < 254) {
      i += 3;
      n++;
    }
    out.push(n, r, g, b);
  }
  return Uint8Array.from(out);
}

/** Données d'une sortie, compressées (Q) si c'est plus court. */
export function stripDataPacket(position: number, rgb: Uint8Array, compress: boolean): Uint8Array {
  if (compress) {
    const packed = compressLedRuns(rgb);
    if (packed.length < rgb.length) {
      const runs = packed.length / 4;
      const leds = rgb.length / 3;
      const out = new Uint8Array(7 + packed.length);
      out.set([0x51, hi(position), lo(position), hi(runs), lo(runs), hi(leds), lo(leds)]);
      out.set(packed, 7);
      return out;
    }
  }
  return stripData(position, rgb);
}

/** Les paquets d'une image : une sortie après l'autre, chacune suivie de son « A », puis l'affichage (O). */
export function stripFramePackets(config: StripSerialConfig, outputs: Uint8Array[]): StripPacket[] {
  const perChannel = Math.max(0, ...config.ledsPerStrip);
  const packets: StripPacket[] = [];
  config.ledsPerStrip.forEach((count, i) => {
    if (count <= 0) return;
    const data = outputs[i] ?? new Uint8Array(count * 3);
    const rgb = data.length === count * 3 ? data : Uint8Array.from({ length: count * 3 }, (_, k) => data[k] ?? 0);
    packets.push({ bytes: stripDataPacket(i * perChannel, rgb, config.useCompression), acks: 1 });
  });
  packets.push({ bytes: STRIP_SHOW, acks: 1 });
  return packets;
}

/** Les commandes de mise en route, après la poignée de main : longueurs (L, puis Z du Wemos), effacement, affichage. */
export function stripSetupPackets(config: StripSerialConfig): StripPacket[] {
  const perChannel = Math.max(0, ...config.ledsPerStrip);
  const packets: StripPacket[] = [{ bytes: stripSetLength(perChannel), acks: 1 }];
  if (config.sendPerLedstripLength) {
    config.ledsPerStrip.forEach((count, i) => {
      if (count > 0) packets.push({ bytes: stripResize(i, config.ledsPerStrip.length - 1, count), acks: 1 });
    });
  }
  packets.push({ bytes: STRIP_CLEAR, acks: 1 }, { bytes: STRIP_SHOW, acks: 1 });
  return packets;
}

/** Éteint tout : même chemin que la mise en route (C puis O). */
export const STRIP_OFF_PACKETS: readonly StripPacket[] = [
  { bytes: STRIP_CLEAR, acks: 1 },
  { bytes: STRIP_SHOW, acks: 1 },
];

// ---------------------------------------------------------------------------
// Art-Net (ArtNet.cpp, artnetengine)
// ---------------------------------------------------------------------------

export const ARTNET_PORT = 6454;
export const ARTNET_DMX_CHANNELS = 512;

/** Paquet ArtDmx : « Art-Net », opcode 0x5000, version 14, univers sur 15 bits, 512 canaux. */
export function artnetPacket(universe: number, data: Uint8Array, sequence = 0): Uint8Array {
  const length = ARTNET_DMX_CHANNELS;
  const out = new Uint8Array(18 + length);
  out.set([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00], 0);
  out.set([0x00, 0x50], 8);
  out.set([0, 14], 10);
  out[12] = sequence & 255;
  out[13] = 0;
  out[14] = universe & 255;
  out[15] = (universe >> 8) & 127;
  out[16] = hi(length);
  out[17] = lo(length);
  out.set(data.subarray(0, length), 18);
  return out;
}

export interface ArtnetUniverseFrame {
  universe: number;
  data: Uint8Array;
}

/** Un univers par sortie utilisée : les octets du fil, complétés par des zéros jusqu'à 512 canaux. */
export function artnetFrames(leds: CabinetLeds, outputs: Uint8Array[]): ArtnetUniverseFrame[] {
  const frames: ArtnetUniverseFrame[] = [];
  outputs.forEach((data, i) => {
    if (!data.length) return;
    const dmx = new Uint8Array(ARTNET_DMX_CHANNELS);
    dmx.set(data.subarray(0, Math.min(data.length, ARTNET_LEDS_PER_UNIVERSE * 3)));
    frames.push({ universe: artnetUniverse(leds, i + 1), data: dmx });
  });
  return frames;
}

/** Adresse où envoyer les paquets : celle du nœud, sinon la diffusion sur tout le réseau. */
export function artnetTarget(leds: Pick<CabinetLeds, 'address'>): string {
  return leds.address?.trim() || '255.255.255.255';
}

// ---------------------------------------------------------------------------
// Effets
// ---------------------------------------------------------------------------

export type LedEffect =
  /** Une couleur sur toute la bande. */
  | { kind: 'solid'; color: Rgb }
  /** Une LED qui avance de la première à la dernière (chenillard), avec une queue qui s'éteint. */
  | { kind: 'chase'; color: Rgb; ledsPerSecond?: number; tail?: number; background?: Rgb; /** De la dernière LED à la première. */ reverse?: boolean }
  /** Chenillard d'essai : la première LED reste verte, la dernière bleue, le reste rouge qui avance. */
  | { kind: 'direction'; ledsPerSecond?: number }
  /** Arc-en-ciel qui défile le long de la bande. */
  | { kind: 'rainbow'; cyclesPerSecond?: number }
  /** Va-et-vient de la luminosité. */
  | { kind: 'pulse'; color: Rgb; periodMs?: number }
  /** Alternance d'une couleur et du noir. */
  | { kind: 'blink'; color: Rgb; periodMs?: number }
  /** Balayage d'une colonne (ou d'une ligne) à la fois : montre la disposition d'une matrice. */
  | { kind: 'sweep'; color: Rgb; axis?: 'x' | 'y'; cellsPerSecond?: number }
  /** Rouge, vert, bleu par tiers de la bande : l'ordre des couleurs se lit à l'œil. */
  | { kind: 'rgb-thirds' }
  /** Dégradé de luminosité : le début sombre, la fin claire. */
  | { kind: 'gradient'; color: Rgb }
  /** Les LED allumées une sur dix, pour compter la longueur. */
  | { kind: 'ruler'; color?: Rgb }
  /** Image donnée telle quelle (3 octets par LED). */
  | { kind: 'frame'; data: Uint8Array };

const scale = (c: Rgb, f: number): Rgb => [clampByte(c[0] * f), clampByte(c[1] * f), clampByte(c[2] * f)];

/** Image d'un effet à l'instant `ms`, pour une bande de cette forme. */
export function renderLedEffect(effect: LedEffect, grid: LedGrid, ms: number): Uint8Array {
  const n = Math.max(0, grid.width) * Math.max(0, grid.height);
  const out = new Uint8Array(n * 3);
  const put = (k: number, c: Rgb) => setLed(out, k, c);
  switch (effect.kind) {
    case 'solid':
      fillLedStrip(out, effect.color);
      break;
    case 'chase': {
      const tail = Math.max(0, effect.tail ?? 4);
      const head = Math.floor(((ms / 1000) * (effect.ledsPerSecond ?? 20)) % Math.max(1, n + tail));
      if (effect.background) fillLedStrip(out, effect.background);
      for (let d = 0; d <= tail; d++) {
        const k = head - d;
        if (k >= 0 && k < n) put(effect.reverse ? n - 1 - k : k, scale(effect.color, 1 - d / (tail + 1)));
      }
      break;
    }
    case 'direction': {
      const head = Math.floor(((ms / 1000) * (effect.ledsPerSecond ?? 12)) % Math.max(1, n));
      put(head, LED_RED);
      put(0, head === 0 ? LED_WHITE : LED_GREEN);
      put(n - 1, head === n - 1 ? LED_WHITE : LED_BLUE);
      break;
    }
    case 'rainbow': {
      const phase = ((ms / 1000) * (effect.cyclesPerSecond ?? 0.3)) % 1;
      for (let k = 0; k < n; k++) put(k, hsvToRgb((phase + k / Math.max(1, n)) * 360, 1, 1));
      break;
    }
    case 'pulse': {
      const period = effect.periodMs ?? 2000;
      const f = 0.5 - 0.5 * Math.cos((2 * Math.PI * (ms % period)) / period);
      fillLedStrip(out, scale(effect.color, f));
      break;
    }
    case 'blink':
      if (Math.floor(ms / ((effect.periodMs ?? 800) / 2)) % 2 === 0) fillLedStrip(out, effect.color);
      break;
    case 'sweep': {
      const axis = effect.axis ?? (grid.width >= grid.height ? 'x' : 'y');
      const cells = axis === 'x' ? grid.width : grid.height;
      const at = Math.floor(((ms / 1000) * (effect.cellsPerSecond ?? 6)) % Math.max(1, cells));
      for (let k = 0; k < n; k++) {
        const p = ledXY(grid, k);
        if ((axis === 'x' ? p.x : p.y) === at) put(k, effect.color);
      }
      break;
    }
    case 'rgb-thirds':
      for (let k = 0; k < n; k++) put(k, k < n / 3 ? LED_RED : k < (2 * n) / 3 ? LED_GREEN : LED_BLUE);
      break;
    case 'gradient':
      for (let k = 0; k < n; k++) put(k, scale(effect.color, n > 1 ? 0.05 + (0.95 * k) / (n - 1) : 1));
      break;
    case 'ruler':
      for (let k = 0; k < n; k++) if (k % 10 === 0) put(k, k % 50 === 0 ? LED_WHITE : (effect.color ?? LED_RED));
      break;
    case 'frame':
      out.set(effect.data.subarray(0, out.length));
      break;
  }
  return out;
}

/** Une couleur ou un effet visé : le nom d'une bande, ou `*` pour toutes. */
export const LED_ALL = '*';

/** Les bandes que vise `target` : leur rang dans `leds.strips`. */
export function ledTargetIndexes(leds: Pick<CabinetLeds, 'strips'>, target: string): number[] {
  if (target === LED_ALL) return leds.strips.map((_, i) => i);
  const names = leds.strips.map((s) => s.name.trim());
  const i = names.indexOf(target.trim());
  return i >= 0 ? [i] : [];
}

// ---------------------------------------------------------------------------
// Essais : ce que l'écran de configuration propose, et ce que l'utilisateur doit y lire
// ---------------------------------------------------------------------------

export const LED_TEST_KINDS = ['red', 'green', 'blue', 'white', 'direction', 'colors', 'layout', 'brightness', 'ruler', 'rainbow', 'off'] as const;
export type LedTestKind = (typeof LED_TEST_KINDS)[number];

export function ledTestEffect(kind: LedTestKind): LedEffect | undefined {
  switch (kind) {
    case 'red':
      return { kind: 'solid', color: LED_RED };
    case 'green':
      return { kind: 'solid', color: LED_GREEN };
    case 'blue':
      return { kind: 'solid', color: LED_BLUE };
    case 'white':
      return { kind: 'solid', color: LED_WHITE };
    case 'direction':
      return { kind: 'direction' };
    case 'colors':
      return { kind: 'rgb-thirds' };
    case 'layout':
      return { kind: 'sweep', color: LED_WHITE, cellsPerSecond: 3 };
    case 'brightness':
      return { kind: 'gradient', color: LED_WHITE };
    case 'ruler':
      return { kind: 'ruler' };
    case 'rainbow':
      return { kind: 'rainbow' };
    case 'off':
      return undefined;
  }
}

/** Ce qu'on doit voir pour chaque essai, dit en une phrase (tutoiement). */
export function ledTestExpectation(kind: LedTestKind, strip?: Pick<LedStripSpec, 'colorOrder' | 'width' | 'height'>): string {
  switch (kind) {
    case 'red':
      return t('Toute la bande doit être rouge. Si elle est verte ou bleue, l’ordre des couleurs n’est pas le bon.');
    case 'green':
      return t('Toute la bande doit être verte. Si elle est rouge ou bleue, l’ordre des couleurs n’est pas le bon.');
    case 'blue':
      return t('Toute la bande doit être bleue. Si elle est rouge ou verte, l’ordre des couleurs n’est pas le bon.');
    case 'white':
      return t('Toute la bande doit être blanche, sans teinte. Une teinte dominante trahit un mauvais ordre des couleurs ; des LED éteintes en fin de bande, une longueur trop grande.');
    case 'direction':
      return t('La première LED reste verte, la dernière bleue, et une LED rouge avance de la première à la dernière. Si le rouge part de l’autre bout, la bande est branchée à l’envers ; si la dernière LED bleue n’est pas la dernière de la bande, la longueur est fausse.');
    case 'colors':
      return t('Tu dois voir rouge, puis vert, puis bleu, du début à la fin de la bande. Un autre ordre : regarde la ligne « Si tu vois… » pour trouver le bon ordre des couleurs.');
    case 'layout':
      return strip && strip.width > 1 && strip.height > 1
        ? t('Une colonne blanche balaye la matrice : elle doit aller de gauche à droite, sans saut. Si elle se déplace par à-coups ou dans le mauvais sens, change le câblage.')
        : t('Les LED d’une même colonne s’allument ensemble : sur une bande simple, c’est la bande entière, une LED après l’autre.');
    case 'brightness':
      return t('La bande doit passer progressivement du sombre au clair. C’est la luminosité réglée pour la bande qui limite le clair.');
    case 'ruler':
      return t('Une LED sur dix est allumée, une sur cinquante en blanc : compte-les pour vérifier la longueur de la bande.');
    case 'rainbow':
      return t('Un arc-en-ciel défile sans saccade. Des couleurs fausses ou des LED qui clignotent au hasard : masse non reliée, ou alimentation trop faible.');
    case 'off':
      return t('Toutes les LED sont éteintes.');
  }
}

/**
 * « Si tu vois… » pour l'essai des couleurs : l'ordre qu'il faut choisir d'après les trois couleurs lues
 * (rouge, vert, bleu du début à la fin). Chaque ordre possible donne une suite distincte, c'est pourquoi
 * l'essai fonctionne avec n'importe quelle bande.
 */
export function colorOrderFromSeen(configured: LedColorOrder, seen: [string, string, string]): LedColorOrder | undefined {
  const want: Rgb[] = [LED_RED, LED_GREEN, LED_BLUE];
  const names = ['R', 'G', 'B'];
  const colorName = (c: Rgb) => names[c.findIndex((v) => v > 0)]!;
  for (const actual of ['GRB', 'RGB', 'RBG', 'GBR', 'BRG', 'BGR'] as LedColorOrder[]) {
    const view = want.map((c) => colorName(seenColor(configured, actual, c)));
    if (view.join('') === seen.join('')) return actual;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Faux contrôleur série : comprend les commandes ci-dessus, garde les couleurs reçues
// ---------------------------------------------------------------------------

/**
 * Ce que ferait un Teensy ou un Wemos D1 : il répond aux commandes comme le vrai (M, L, Z, C, R, Q, O, T)
 * et garde, pour chaque sortie, les octets qu'il afficherait. Sert aux essais sans matériel et au mode
 * simulé du pilote.
 */
export class SimulatedStripDevice {
  /** Nombre maximal de LED par sortie annoncé à la poignée de main. */
  maxPerChannel = 1000;
  /** Mode commande : le premier octet reçu (un zéro) le déclenche. */
  commandMode = false;
  /** LED réservées à chaque sortie (L). */
  perChannel = 0;
  /** Longueurs reçues par Z, par sortie. */
  readonly resized: number[] = [];
  /** Tampon en cours d'écriture, puis ce que les LED montrent depuis le dernier O. */
  buffer = new Uint8Array(0);
  shown = new Uint8Array(0);
  shows = 0;
  clears = 0;
  /** Commandes reçues, dans l'ordre (la lettre de chacune). */
  readonly log: string[] = [];
  private readonly out: number[] = [];
  private readonly pending: number[] = [];

  write(data: Uint8Array): void {
    for (const b of data) this.pending.push(b);
    this.parse();
  }

  read(n: number): Uint8Array {
    return Uint8Array.from(this.out.splice(0, n));
  }

  get available(): number {
    return this.out.length;
  }

  /** Octets de la sortie `output` (rang 0) tels que les LED les montrent, `leds` LED. */
  shownOutput(output: number, leds: number): Uint8Array {
    const from = output * this.perChannel * 3;
    const out = new Uint8Array(leds * 3);
    out.set(this.shown.subarray(from, from + leds * 3));
    return out;
  }

  private parse(): void {
    const p = this.pending;
    for (;;) {
      if (!p.length) return;
      if (!this.commandMode) {
        p.shift();
        this.commandMode = true;
        this.out.push(0x41);
        continue;
      }
      const c = p[0]!;
      const fixed = c === 0x4c ? 3 : c === 0x5a ? 5 : c === 0x52 ? 5 : c === 0x51 ? 7 : 1;
      if (p.length < fixed) return;
      if (c === 0x52) {
        const leds = (p[3]! << 8) | p[4]!;
        if (p.length < 5 + leds * 3) return;
        this.store((p[1]! << 8) | p[2]!, Uint8Array.from(p.slice(5, 5 + leds * 3)));
        p.splice(0, 5 + leds * 3);
        this.log.push('R');
        this.out.push(0x41);
      } else if (c === 0x51) {
        const runs = (p[3]! << 8) | p[4]!;
        const leds = (p[5]! << 8) | p[6]!;
        if (p.length < 7 + runs * 4) return;
        const raw = new Uint8Array(leds * 3);
        let at = 0;
        for (let r = 0; r < runs; r++) {
          for (let i = 0; i < p[7 + r * 4]! && at < raw.length; i++, at += 3) raw.set([p[8 + r * 4]!, p[9 + r * 4]!, p[10 + r * 4]!], at);
        }
        this.store((p[1]! << 8) | p[2]!, raw);
        p.splice(0, 7 + runs * 4);
        this.log.push('Q');
        this.out.push(0x41);
      } else {
        const command = p.splice(0, fixed);
        this.log.push(String.fromCharCode(c));
        if (c === 0x4d) this.out.push(hi(this.maxPerChannel), lo(this.maxPerChannel), 0x41);
        else if (c === 0x4c) {
          this.perChannel = (command[1]! << 8) | command[2]!;
          this.out.push(0x41);
        } else if (c === 0x5a) {
          this.resized[command[1]!] = (command[3]! << 8) | command[4]!;
          this.out.push(0x41);
        } else if (c === 0x43) {
          this.clears++;
          this.buffer.fill(0);
          this.out.push(0x41);
        } else if (c === 0x4f) {
          this.shown = this.buffer.slice();
          this.shows++;
          this.out.push(0x41);
        } else if (c === 0x54) this.out.push(0x41);
        // Commande inconnue (le zéro de la poignée de main d'une reconnexion) : « N », comme la vraie carte.
        else this.out.push(0x4e);
      }
    }
  }

  private store(position: number, rgb: Uint8Array): void {
    const end = position * 3 + rgb.length;
    if (this.buffer.length < end) {
      const bigger = new Uint8Array(end);
      bigger.set(this.buffer);
      this.buffer = bigger;
    }
    this.buffer.set(rgb, position * 3);
  }
}
