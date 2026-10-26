// Piste son d'une vidéo MP4, sans dépendance (pas de ffmpeg sur la borne) : savoir si
// une vidéo a du son, et en tirer un fichier son .m4a pour la musique ou le son de
// lancement d'un jeu (media-sounds.ts, « Sons de la table »). L'extraction ne réencode
// rien : elle garde la piste son telle quelle (AAC, MP3, Opus ou FLAC, que Chromium lit),
// recopie ses morceaux à la suite dans un nouveau `mdat` et réécrit leurs positions.
//
// Structure ISO BMFF : des boîtes (taille, type, contenu). La description des pistes est
// dans `moov` › `trak` › `mdia` (`mdhd` : durée ; `hdlr` : vidéo ou son) › `minf` ›
// `stbl` (`stsd` : codec ; `stsc`, `stsz` : échantillons par morceau et leur taille ;
// `stco` ou `co64` : position de chaque morceau dans le fichier). Une vidéo fragmentée
// (`mvex`, morceaux décrits dans des `moof`) n'est pas prise en charge.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Extensions des vidéos au format ISO BMFF. */
export const MP4_VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov'] as const;

/** Codecs de son que Chromium lit dans un MP4 (AC-3 et E-AC-3 n'en sont pas). */
const PLAYABLE_CODECS = new Set(['mp4a', '.mp3', 'opus', 'flac']);
/** Au-delà, `moov` n'est pas lu : ce n'est pas une vidéo de média ordinaire. */
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
/** Boîtes dont le contenu est fait d'autres boîtes, parcourues et réécrites. */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);

export interface Mp4Sound {
  /** Codec de la piste son (`mp4a`, `.mp3`, `Opus`…), tel qu'écrit dans le fichier. */
  codec: string;
  /** Durée de la piste, en secondes. */
  seconds: number;
  /** Chromium sait le lire : le menu pourra le jouer. */
  playable: boolean;
}

interface Box {
  type: string;
  /** Contenu, sans l'en-tête (feuilles seulement). */
  data?: Buffer;
  children?: Box[];
}

/** Boîtes d'un tampon, contenus des conteneurs compris ; undefined si la structure est abîmée. */
function parseBoxes(buf: Buffer): Box[] | undefined {
  const out: Box[] = [];
  let pos = 0;
  while (pos + 8 <= buf.length) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > buf.length) return undefined;
      size = Number(buf.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) size = buf.length - pos;
    if (size < header || pos + size > buf.length) return undefined;
    const data = buf.subarray(pos + header, pos + size);
    if (CONTAINERS.has(type)) {
      const children = parseBoxes(data);
      if (!children) return undefined;
      out.push({ type, children });
    } else out.push({ type, data });
    pos += size;
  }
  return out;
}

function serialize(boxes: Box[]): Buffer {
  return Buffer.concat(
    boxes.map((b) => {
      const body = b.children ? serialize(b.children) : b.data!;
      const header = Buffer.alloc(8);
      header.writeUInt32BE(body.length + 8, 0);
      header.write(b.type, 4, 'latin1');
      return Buffer.concat([header, body]);
    }),
  );
}

const child = (b: Box | undefined, type: string) => b?.children?.find((c) => c.type === type);

/** Boîtes du premier niveau : type, position et taille, lues sans charger le fichier. */
function topBoxes(fd: number, fileSize: number): { type: string; start: number; header: number; size: number }[] | undefined {
  const out: { type: string; start: number; header: number; size: number }[] = [];
  const head = Buffer.alloc(16);
  let pos = 0;
  while (pos + 8 <= fileSize) {
    if (fs.readSync(fd, head, 0, 16, pos) < 8) return undefined;
    let size = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let header = 8;
    if (size === 1) {
      size = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size === 0) size = fileSize - pos;
    if (size < header || pos + size > fileSize) return undefined;
    out.push({ type, start: pos, header, size });
    pos += size;
  }
  return out;
}

interface Mp4File {
  fd: number;
  top: { type: string; start: number; header: number; size: number }[];
  moov: Box[];
}

/** Ouvre un MP4 et lit `moov` ; undefined si ce n'en est pas un, ou s'il est illisible. */
function openMp4(file: string): Mp4File | undefined {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return undefined;
  }
  try {
    const top = topBoxes(fd, fs.fstatSync(fd).size);
    if (!top || top[0]?.type !== 'ftyp') throw new Error('ftyp');
    const box = top.find((b) => b.type === 'moov');
    if (!box || box.size > MAX_MOOV_BYTES) throw new Error('moov');
    const buf = Buffer.alloc(box.size - box.header);
    fs.readSync(fd, buf, 0, buf.length, box.start + box.header);
    const moov = parseBoxes(buf);
    if (!moov) throw new Error('moov');
    return { fd, top, moov };
  } catch {
    fs.closeSync(fd);
    return undefined;
  }
}

/** Type de piste d'un `trak` (`soun`, `vide`…), d'après son `hdlr`. */
function handlerOf(trak: Box): string | undefined {
  const hdlr = child(child(trak, 'mdia'), 'hdlr')?.data;
  return hdlr && hdlr.length >= 12 ? hdlr.toString('latin1', 8, 12) : undefined;
}

function soundOf(trak: Box): Mp4Sound | undefined {
  const mdia = child(trak, 'mdia');
  const mdhd = child(mdia, 'mdhd')?.data;
  const stsd = child(child(child(mdia, 'minf'), 'stbl'), 'stsd')?.data;
  if (!mdhd || !stsd || stsd.length < 16) return undefined;
  const v1 = mdhd[0] === 1;
  if (mdhd.length < (v1 ? 32 : 20)) return undefined;
  const timescale = mdhd.readUInt32BE(v1 ? 20 : 12);
  const duration = v1 ? Number(mdhd.readBigUInt64BE(24)) : mdhd.readUInt32BE(16);
  const codec = stsd.toString('latin1', 12, 16);
  return { codec, seconds: timescale ? duration / timescale : 0, playable: PLAYABLE_CODECS.has(codec.toLowerCase()) };
}

/** Première piste son lisible par le menu, sinon la première piste son. */
function soundTrak(moov: Box[]): { trak: Box; sound: Mp4Sound } | undefined {
  const tracks = moov
    .filter((b) => b.type === 'trak' && handlerOf(b) === 'soun')
    .flatMap((trak) => {
      const sound = soundOf(trak);
      return sound ? [{ trak, sound }] : [];
    });
  return tracks.find((t) => t.sound.playable) ?? tracks[0];
}

/** Piste son d'une vidéo MP4 ; undefined sans piste son, ou si ce n'est pas un MP4 lisible. */
export function mp4Sound(file: string): Mp4Sound | undefined {
  const mp4 = openMp4(file);
  if (!mp4) return undefined;
  try {
    return soundTrak(mp4.moov)?.sound;
  } finally {
    fs.closeSync(mp4.fd);
  }
}

/** Position et taille de chaque morceau d'une piste, d'après `stsc`, `stsz` et `stco`/`co64`. */
function chunksOf(stbl: Box): { offset: number; size: number }[] | undefined {
  const stsc = child(stbl, 'stsc')?.data;
  const stsz = child(stbl, 'stsz')?.data;
  const stco = child(stbl, 'stco')?.data;
  const co64 = child(stbl, 'co64')?.data;
  if (!stsc || !stsz || (!stco && !co64) || stsz.length < 12) return undefined;
  const offsets: number[] = [];
  const table = (stco ?? co64)!;
  const count = table.readUInt32BE(4);
  for (let i = 0; i < count; i++) offsets.push(stco ? stco.readUInt32BE(8 + i * 4) : Number(co64!.readBigUInt64BE(8 + i * 8)));
  const fixed = stsz.readUInt32BE(4);
  const samples = stsz.readUInt32BE(8);
  const sizeOf = (n: number) => (fixed ? fixed : stsz.readUInt32BE(12 + n * 4));
  if (!fixed && stsz.length < 12 + samples * 4) return undefined;
  const runs: { first: number; perChunk: number }[] = [];
  for (let i = 0, n = stsc.readUInt32BE(4); i < n; i++) runs.push({ first: stsc.readUInt32BE(8 + i * 12), perChunk: stsc.readUInt32BE(12 + i * 12) });
  if (!runs.length) return undefined;
  const out: { offset: number; size: number }[] = [];
  let sample = 0;
  let run = 0;
  for (let chunk = 1; chunk <= offsets.length; chunk++) {
    while (run + 1 < runs.length && runs[run + 1]!.first <= chunk) run++;
    let size = 0;
    for (let k = 0; k < runs[run]!.perChunk && sample < samples; k++) size += sizeOf(sample++);
    out.push({ offset: offsets[chunk - 1]!, size });
  }
  return out;
}

/** Nouvelle table des positions des morceaux, du même type (`stco` ou `co64`) que l'ancienne. */
function offsetTable(type: string, offsets: number[]): Buffer {
  const wide = type === 'co64';
  const buf = Buffer.alloc(8 + offsets.length * (wide ? 8 : 4));
  buf.writeUInt32BE(offsets.length, 4);
  offsets.forEach((o, i) => (wide ? buf.writeBigUInt64BE(BigInt(o), 8 + i * 8) : buf.writeUInt32BE(o, 8 + i * 4)));
  return buf;
}

/** En-tête `ftyp` d'un fichier son MP4. */
function m4aFtyp(): Buffer {
  const body = Buffer.from('M4A \0\0\0\0M4A mp42isom', 'latin1');
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write('ftyp', 4, 'latin1');
  return Buffer.concat([head, body]);
}

/**
 * Écrit dans `dest` (.m4a) la piste son de la vidéo `src`, sans la réencoder.
 * Retourne la piste copiée, ou la raison d'un refus (pas de son, vidéo fragmentée…).
 */
export function extractMp4Sound(src: string, dest: string): { ok: true; sound: Mp4Sound; bytes: number } | { ok: false; reason: 'not-mp4' | 'no-sound' | 'unplayable' | 'fragmented' | 'broken' } {
  const mp4 = openMp4(src);
  if (!mp4) return { ok: false, reason: 'not-mp4' };
  try {
    if (mp4.moov.some((b) => b.type === 'mvex')) return { ok: false, reason: 'fragmented' };
    const found = soundTrak(mp4.moov);
    if (!found) return { ok: false, reason: 'no-sound' };
    if (!found.sound.playable) return { ok: false, reason: 'unplayable' };
    const stbl = child(child(child(found.trak, 'mdia'), 'minf'), 'stbl')!;
    const chunks = chunksOf(stbl);
    if (!chunks) return { ok: false, reason: 'broken' };
    const fileSize = fs.fstatSync(mp4.fd).size;
    if (chunks.some((c) => c.offset + c.size > fileSize)) return { ok: false, reason: 'broken' };
    // La piste son seule ; ses morceaux à la suite, dans l'ordre, après le nouveau moov.
    const tableBox = stbl.children!.find((c) => c.type === 'stco' || c.type === 'co64')!;
    const moov = mp4.moov.filter((b) => b.type !== 'trak' || b === found.trak);
    tableBox.data = offsetTable(tableBox.type, chunks.map(() => 0));
    const ftyp = m4aFtyp();
    const moovSize = serialize([{ type: 'moov', children: moov }]).length;
    const dataStart = ftyp.length + moovSize + 8;
    let at = dataStart;
    tableBox.data = offsetTable(
      tableBox.type,
      chunks.map((c) => {
        const offset = at;
        at += c.size;
        return offset;
      }),
    );
    if (tableBox.type === 'stco' && at > 0xffffffff) return { ok: false, reason: 'broken' };
    const mdatHead = Buffer.alloc(8);
    mdatHead.writeUInt32BE(at - dataStart + 8, 0);
    mdatHead.write('mdat', 4, 'latin1');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const partial = `${dest}.partiel`;
    const out = fs.openSync(partial, 'w');
    try {
      fs.writeSync(out, Buffer.concat([ftyp, serialize([{ type: 'moov', children: moov }]), mdatHead]));
      for (const c of chunks) {
        const buf = Buffer.alloc(c.size);
        fs.readSync(mp4.fd, buf, 0, c.size, c.offset);
        fs.writeSync(out, buf);
      }
    } finally {
      fs.closeSync(out);
    }
    fs.renameSync(partial, dest);
    return { ok: true, sound: found.sound, bytes: at };
  } finally {
    fs.closeSync(mp4.fd);
  }
}
