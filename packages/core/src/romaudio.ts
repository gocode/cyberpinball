// Musique de la ROM : la musique de présentation d'une table à ROM qui n'en a pas, tirée de sa
// ROM. La ROM tourne dans PinMAME (la libpinmame de VPX, pinmame64.dll), sans écran ni son
// audible, dans un processus à part (app/src/enregistreur-rom.ts) ; on y glisse des pièces, on
// presse Start, et on garde ce que la machine joue au départ d'une partie.
//
// Ce module ne fait rien tourner : il dit quoi faire et juge le résultat.
// - Les interrupteurs de la gouttière, lus dans le script de la table (sans billes dans la
//   gouttière, la machine cherche ses billes et reste muette).
// - Le calendrier des appuis (Échap, Pièce, Start), en temps émulé.
// - Le dossier de travail : une copie des ROM avec une NVRAM vierge, hors du dossier de la table,
//   pour que les records, crédits et réglages de la table ne soient jamais touchés.
// - La découpe du son (à partir de Start, jusqu'au premier long silence, normalisé, fondu).
// - Le conteneur Ogg du son encodé en Opus (l'encodage lui-même se fait dans Chromium).
// - L'état de chaque ROM : enregistrée, muette (pas réessayée), en échec.
//
// D'après VRTableManager de Mike (mikebm, licence MIT, github.com/mikebm/VRTableManager,
// VrTableManager.Core/Services/RomAudio.cs et VrLobby/scripts/RomRecorder.cs) : processus à
// part, NVRAM vierge, Échap puis pièces et Start, interrupteurs de la gouttière lus dans le
// script, découpe au premier silence. Repris et adapté ; voir les mentions (docs/manuel.md,
// « Musique de la ROM »).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { isInside } from './fileops';
import { romKey } from './romlibrary';

// ---------------------------------------------------------------------------
// Interrupteurs de la gouttière

/**
 * Interrupteurs qui voient les billes au repos dans la gouttière (trough), lus dans le script :
 * une machine démarrée gouttière vide dit « locating pinballs » et ne joue rien. Les scripts les
 * nomment de quelques façons : `bsTrough.InitSw 0, 21, 20, 19, 18` (le premier nombre est
 * l'entrée), `With bsTrough … .InitSwitches Array(32, 33, 34)` (cvpmTrough), ou
 * `Sub sw21_Hit: Controller.Switch(21) = 1` sur une ligne qui parle de la gouttière. Huit au plus.
 */
export function troughSwitches(script: string): number[] {
  const found: number[] = [];
  let inTroughWith = false;
  for (const raw of script.split('\n')) {
    const line = raw.trim();
    if (/^With\s/i.test(line)) inTroughWith = /trough/i.test(line);
    else if (/^End\s+With\b/i.test(line)) inTroughWith = false;
    if (line.startsWith("'") || !(inTroughWith || /trough/i.test(line))) continue;
    const array = /\.InitSwitches\s*\(?\s*Array\s*\(([\d\s,]+)\)/i.exec(line);
    const initSw = /\.InitSw\s*\(?\s*([\d\s,]+)/i.exec(line);
    if (array) found.push(...numbers(array[1]!));
    else if (initSw) found.push(...numbers(initSw[1]!).slice(1));
    else if (/_Hit\b/i.test(line)) for (const m of line.matchAll(/Controller\.Switch\s*\(\s*(\d+)\s*\)\s*=\s*1\b/gi)) found.push(Number(m[1]));
  }
  return [...new Set(found.filter((n) => n > 0))].slice(0, 8);
}

const numbers = (text: string): number[] => text.split(',').map((x) => Number.parseInt(x.trim(), 10) || 0);

/**
 * Interrupteurs des mécanismes simulés par le script (cvpmMech : la main de The Addams Family,
 * sa bibliothèque…) qui sont fermés à leur position de départ : `.AddSw 84, 0, 1` (fermé des pas
 * 0 à 1). Sans le script, personne ne les ferme : la ROM croit le mécanisme bloqué et refuse
 * de lancer la partie (vu sur The Addams Family : Start sans effet, la machine reste en attente).
 */
export function mechRestSwitches(script: string): number[] {
  const found: number[] = [];
  for (const raw of script.split('\n')) {
    const line = raw.trim();
    if (line.startsWith("'")) continue;
    const m = /\.AddSw\s*\(?\s*(\d+)\s*,\s*0\s*,\s*\d+/i.exec(line);
    if (m) found.push(Number(m[1]));
  }
  return [...new Set(found.filter((n) => n > 0))].slice(0, 8);
}

/** Interrupteurs fermés au démarrage de l'enregistrement : billes dans la gouttière, mécanismes au repos. */
export function romStartSwitches(script: string | undefined): number[] {
  if (!script) return [];
  return [...new Set([...troughSwitches(script), ...mechRestSwitches(script)])];
}

// ---------------------------------------------------------------------------
// Calendrier, en secondes de temps émulé (le son reçu fait l'horloge : une machine lente
// reçoit ses appuis au même moment de sa vie qu'une rapide)

export const ROM_AUDIO_PLAN = {
  /** Billes posées dans la gouttière : pas avant que la machine soit levée (PinMAME tombe sinon). */
  ballsAt: 2,
  /** « 7 » de VPinMAME, le bouton Échap de la porte : passe l'écran « réglages d'usine rétablis » d'une NVRAM vierge. */
  escapeAt: [12, 13],
  /** « 5 » : quatre pièces, assez de crédits quel que soit le prix de la partie. */
  coinAt: [20, 20.6, 21.2, 21.8],
  /** « 1 » : Start. Les Stern SAM sont les plus longues à démarrer. */
  startAt: 24,
  /** Durée d'un appui. */
  press: 0.25,
  /** Ce qu'on garde au plus après Start. */
  keepFor: 30,
} as const;

/** Durée émulée de tout l'enregistrement. */
export const ROM_AUDIO_SECONDS = ROM_AUDIO_PLAN.startAt + ROM_AUDIO_PLAN.keepFor;

/** Touches de libpinmame (PINMAME_KEYCODE, la numérotation de MAME) : 1, 5 et 7. */
export const PINMAME_KEYS = { start: 27, coin: 31, escape: 33 } as const;

const pressedAt = (t: number, at: number): boolean => t >= at && t < at + ROM_AUDIO_PLAN.press;

/** La touche est-elle tenue à cet instant émulé ? */
export function romKeyPressed(key: number, t: number): boolean {
  const p = ROM_AUDIO_PLAN;
  if (key === PINMAME_KEYS.escape) return p.escapeAt.some((at) => pressedAt(t, at));
  if (key === PINMAME_KEYS.coin) return p.coinAt.some((at) => pressedAt(t, at));
  if (key === PINMAME_KEYS.start) return pressedAt(t, p.startAt);
  return false;
}

/**
 * La lecture du clavier par PinMAME est-elle utile à cet instant ? Elle ne s'allume qu'autour
 * des appuis : PinMAME demande l'état de chaque touche à chaque image (une centaine), et chaque
 * demande repasse par le fil principal du processus ; allumée tout le temps, l'émulation
 * tombait au quart de sa vitesse.
 */
export function romKeyboardWanted(t: number): boolean {
  const p = ROM_AUDIO_PLAN;
  const near = (at: number) => t > at - 0.2 && t < at + p.press + 0.4;
  return [...p.escapeAt, ...p.coinAt, p.startAt].some(near);
}

// ---------------------------------------------------------------------------
// Dossier de travail : copie des ROM, NVRAM vierge

export interface RomScratch {
  /** Dossier donné à PinMAME (vpmPath) : roms\, nvram\ vide, cfg\ vide. */
  dir: string;
  /** Les .zip copiés. */
  copied: string[];
}

/**
 * Prépare le dossier de PinMAME pour un enregistrement : les .zip de la ROM (ceux du dossier
 * de la table, puis ceux de la bibliothèque de la même famille, pour les jeux dérivés qui ont
 * besoin de leur parent), une NVRAM et des réglages vierges. Le dossier ne peut pas être dans
 * celui d'une table : PinMAME y écrit sa NVRAM, ses réglages et ses records.
 */
export function prepareRomScratch(o: { scratch: string; rom: string; romDirs: readonly string[]; tableFolder?: string }): RomScratch {
  if (o.tableFolder && (isInside(path.resolve(o.scratch), path.resolve(o.tableFolder)) || isInside(path.resolve(o.tableFolder), path.resolve(o.scratch)))) {
    throw new Error(`dossier de travail dans celui de la table : ${o.scratch}`); // i18n-ignore : garde-fou interne
  }
  const roms = path.join(o.scratch, 'roms');
  fs.rmSync(o.scratch, { recursive: true, force: true });
  for (const d of [roms, path.join(o.scratch, 'nvram'), path.join(o.scratch, 'cfg')]) fs.mkdirSync(d, { recursive: true });
  const wanted = romKey(o.rom);
  const family = wanted.split('_')[0]!;
  const copied: string[] = [];
  for (const [i, dir] of o.romDirs.entries()) {
    let names: string[];
    try {
      names = fs.readdirSync(dir).filter((f) => /\.zip$/i.test(f));
    } catch {
      continue;
    }
    for (const name of names) {
      const key = romKey(name);
      // Dossier de la table : tous ses .zip (ce sont ceux de ce jeu). Bibliothèque : la famille seulement.
      if (i > 0 && key !== wanted && key.split('_')[0] !== family) continue;
      if (copied.some((c) => romKey(c) === key)) continue;
      fs.copyFileSync(path.join(dir, name), path.join(roms, name));
      copied.push(name);
    }
  }
  return { dir: o.scratch, copied };
}

// ---------------------------------------------------------------------------
// Découpe

export const ROM_AUDIO_CLIP = {
  /** Sous ce niveau (RMS d'un bloc de 100 ms, sur 32 768), c'est le silence : environ −67 dBFS. */
  quiet: 15,
  /** Moins de son que cela après Start : rien à garder. */
  minSeconds: 3,
  /** Silence qui clôt la musique. */
  silenceSeconds: 3,
  /** Crête visée après normalisation (part du plein niveau), et gain au plus. */
  peak: 0.8,
  maxGain: 32,
  /** Fondu de fin. */
  fadeSeconds: 1.5,
} as const;

export type RomClip =
  | { ok: true; samples: Int16Array; seconds: number; gain: number; from: number }
  | { ok: false; loudSeconds: number };

/**
 * Ce qu'on garde du son d'une ROM : à partir de Start (les pièces avant sont écartées), du premier
 * son jusqu'au dernier avant un silence de 3 s, normalisé et terminé par un fondu. `ok: false`
 * quand il n'y a presque rien (ROM muette, partie pas lancée).
 */
export function clipRomAudio(raw: Int16Array, channels: number, rate: number, startAt: number = ROM_AUDIO_PLAN.startAt): RomClip {
  const c = ROM_AUDIO_CLIP;
  const samples = withoutDc(raw, channels);
  const from = Math.min(samples.length, Math.floor((startAt - 0.3) * rate) * channels);
  const block = Math.max(1, Math.floor(rate / 10) * channels);
  const blocks = Math.floor((samples.length - from) / block);
  const rms: number[] = [];
  for (let b = 0; b < blocks; b++) {
    let sum = 0;
    for (let i = from + b * block; i < from + (b + 1) * block; i++) sum += samples[i]! * samples[i]!;
    rms.push(Math.sqrt(sum / block));
  }
  const loud = rms.filter((r) => r > c.quiet).length;
  if (loud < c.minSeconds * 10) return { ok: false, loudSeconds: loud / 10 };
  const first = rms.findIndex((r) => r > c.quiet);
  let last = first;
  for (let b = first; b < blocks; b++) {
    if (rms[b]! > c.quiet) last = b;
    else if (b - last >= c.silenceSeconds * 10) break;
  }
  const start = from + first * block;
  const end = Math.min(samples.length, from + (last + 3) * block);
  const cut = new Int16Array(end - start);
  let peak = 0;
  for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]!));
  const gain = peak > 0 ? Math.min(c.maxGain, (c.peak * 32767) / peak) : 1;
  const fade = Math.min(cut.length, Math.floor(c.fadeSeconds * rate) * channels);
  for (let i = 0; i < cut.length; i++) {
    const left = cut.length - i;
    const g = left < fade ? (gain * left) / fade : gain;
    cut[i] = Math.max(-32768, Math.min(32767, Math.round(samples[start + i]! * g)));
  }
  return { ok: true, samples: cut, seconds: cut.length / channels / rate, gain, from: start / channels / rate };
}

/**
 * Le son sans sa composante continue (passe-haut d'un pôle, coupure vers 7 Hz) : les cartes son
 * WPC sortent un décalage d'environ 3 200 (−20 dBFS), même muettes, qui cachait tout silence.
 */
export function withoutDc(samples: Int16Array, channels: number): Float32Array {
  const out = new Float32Array(samples.length);
  const R = 0.999;
  for (let ch = 0; ch < channels; ch++) {
    let x1 = samples[ch] ?? 0;
    let y1 = 0;
    for (let i = ch; i < samples.length; i += channels) {
      const x = samples[i]!;
      const y = x - x1 + R * y1;
      out[i] = y;
      x1 = x;
      y1 = y;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ogg Opus (RFC 7845) : le son encodé par Chromium (AudioEncoder) mis dans son conteneur

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

/** CRC des pages Ogg : polynôme 0x04C11DB7, sans réflexion, départ à 0. */
export function oggCrc(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) & 0xff) ^ byte]!) >>> 0;
  return crc;
}

/** Échantillons (à 48 kHz) d'un paquet Opus, d'après son octet TOC (RFC 6716, § 3.1). */
export function opusPacketSamples(packet: Uint8Array): number {
  if (!packet.length) return 0;
  const toc = packet[0]!;
  const config = toc >> 3;
  const size =
    config < 12 ? [480, 960, 1920, 2880][config & 3]! // SILK : 10, 20, 40, 60 ms
    : config < 16 ? [480, 960][config & 1]! // hybride : 10, 20 ms
    : [120, 240, 480, 960][config & 3]!; // CELT : 2,5, 5, 10, 20 ms
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return size * frames;
}

function oggPage(o: { serial: number; sequence: number; granule: bigint; flags: number; segments: number[]; body: Uint8Array }): Buffer {
  const header = Buffer.alloc(27 + o.segments.length);
  header.write('OggS', 0, 'latin1');
  header[4] = 0;
  header[5] = o.flags;
  header.writeBigInt64LE(o.granule, 6);
  header.writeUInt32LE(o.serial, 14);
  header.writeUInt32LE(o.sequence, 18);
  header.writeUInt32LE(0, 22);
  header[26] = o.segments.length;
  for (const [i, s] of o.segments.entries()) header[27 + i] = s;
  const page = Buffer.concat([header, o.body]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

/** Valeurs de laçage d'un paquet : des 255, puis le reste (0 si le paquet en est un multiple). */
function lacing(length: number): number[] {
  const out = new Array<number>(Math.floor(length / 255)).fill(255);
  out.push(length % 255);
  return out;
}

export interface OggOpusInput {
  channels: number;
  /** Fréquence du son d'origine (seulement indiquée ; Opus décode à 48 kHz). */
  inputRate: number;
  /** Échantillons à jeter au début (délai de l'encodeur), à 48 kHz. */
  preSkip: number;
  packets: readonly Uint8Array[];
  /** Durée réelle, à 48 kHz : la dernière page s'arrête là (le reste du dernier paquet est du remplissage). */
  samples?: number;
  vendor?: string;
  serial?: number;
}

/** Fichier Ogg Opus : en-tête OpusHead, OpusTags, puis les paquets, une page par seconde environ. */
export function oggOpusFile(o: OggOpusInput): Buffer {
  const serial = o.serial ?? 0x43795062; // « CyPb »
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1;
  head[9] = o.channels;
  head.writeUInt16LE(o.preSkip, 10);
  head.writeUInt32LE(o.inputRate, 12);
  head.writeInt16LE(0, 16);
  head[18] = 0;
  const vendor = Buffer.from(o.vendor ?? 'Cyber Pinball', 'utf8');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0, 'latin1');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length);
  const pages: Buffer[] = [
    oggPage({ serial, sequence: 0, granule: 0n, flags: 0x02, segments: lacing(head.length), body: head }),
    oggPage({ serial, sequence: 1, granule: 0n, flags: 0, segments: lacing(tags.length), body: tags }),
  ];
  const total = o.samples !== undefined ? o.preSkip + o.samples : undefined;
  let granule = o.preSkip;
  let segments: number[] = [];
  let bodies: Uint8Array[] = [];
  let pageSamples = 0;
  const flush = (last: boolean) => {
    if (!bodies.length && !last) return;
    const g = last && total !== undefined ? Math.min(granule, total) : granule;
    pages.push(oggPage({ serial, sequence: pages.length, granule: BigInt(g), flags: last ? 0x04 : 0, segments, body: Buffer.concat(bodies) }));
    segments = [];
    bodies = [];
    pageSamples = 0;
  };
  for (const [i, packet] of o.packets.entries()) {
    const lace = lacing(packet.length);
    if (segments.length + lace.length > 255 || pageSamples >= 48_000) flush(false);
    segments.push(...lace);
    bodies.push(packet);
    const n = opusPacketSamples(packet);
    granule += n;
    pageSamples += n;
    if (i === o.packets.length - 1) flush(true);
  }
  if (!o.packets.length) flush(true);
  return Buffer.concat(pages);
}

// ---------------------------------------------------------------------------
// État de chaque ROM

/** `<données>\cache\musiques-rom` : les musiques (une par ROM) et leur état. */
export const romAudioDir = (dataDir: string): string => path.join(dataDir, 'cache', 'musiques-rom');
export const romAudioFile = (dataDir: string, rom: string): string => path.join(romAudioDir(dataDir), `${romKey(rom)}.ogg`);
const stateFile = (dataDir: string): string => path.join(romAudioDir(dataDir), 'etat.json');

/**
 * - `ok` : enregistrée ;
 * - `silent` : la ROM n'a presque rien joué (muette, ou partie pas lancée) : jamais réessayée d'office ;
 * - `failed` : PinMAME n'a pas démarré la ROM, ou s'est arrêté, ou n'a pas fini à temps ;
 *   réessayée d'office jusqu'à ROM_AUDIO_MAX_TRIES fois.
 */
export interface RomAudioRecord {
  result: 'ok' | 'silent' | 'failed';
  /** Date ISO de la dernière tentative. */
  at: string;
  tries: number;
  seconds?: number;
  /** Ce qui s'est passé, en clair (journal, écran des propositions). */
  detail?: string;
  /** Interrupteurs de la gouttière fermés. */
  switches?: number[];
}

export type RomAudioState = Record<string, RomAudioRecord>;

export const ROM_AUDIO_MAX_TRIES = 2;

export function readRomAudioState(dataDir: string): RomAudioState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(dataDir), 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as RomAudioState) : {};
  } catch {
    return {};
  }
}

export function writeRomAudioState(dataDir: string, state: RomAudioState): void {
  fs.mkdirSync(romAudioDir(dataDir), { recursive: true });
  writeFileAtomic(stateFile(dataDir), JSON.stringify(state, null, 1) + '\n');
}

/** Note le résultat d'une tentative (une partie interrompue par le lancement d'une table n'en est pas une). */
export function noteRomAudio(state: RomAudioState, rom: string, outcome: Omit<RomAudioRecord, 'tries' | 'at'>, now = new Date()): RomAudioState {
  const key = romKey(rom);
  const tries = (state[key]?.tries ?? 0) + 1;
  return { ...state, [key]: { ...outcome, at: now.toISOString(), tries } };
}

/**
 * Faut-il enregistrer cette ROM d'office ? Non si sa musique existe, si elle est muette (une ROM
 * muette ne le devient pas moins), ou si elle a échoué ROM_AUDIO_MAX_TRIES fois. `forced` : demandé
 * depuis l'écran des propositions, qui la réessaie quoi qu'il en soit.
 */
export function romAudioWanted(state: RomAudioState, rom: string, fileExists: boolean, forced = false): boolean {
  if (forced) return true;
  if (fileExists) return false;
  const r = state[romKey(rom)];
  if (!r) return true;
  if (r.result === 'silent') return false;
  if (r.result === 'failed') return r.tries < ROM_AUDIO_MAX_TRIES;
  // Notée « ok » mais le fichier a disparu (cache vidé) : à refaire.
  return true;
}
