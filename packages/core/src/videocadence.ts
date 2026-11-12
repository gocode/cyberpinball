// Cadence réellement écrite dans une vidéo MP4, sans dépendance (pas de ffmpeg sur la borne) :
// nombre d'images de la piste vidéo, leur durée totale et le plus grand écart entre deux images.
// Sert au bilan de chaque enregistrement d'une partie (game-recording.ts) : une capture qui ne
// suit pas (20 images par seconde pour 60 demandées) se voit au journal sans ouvrir la vidéo.
//
// Deux formes d'ISO BMFF : ordinaire (`moov` › `trak` › `mdia` › `minf` › `stbl` › `stts`, durée
// de chaque image) et fragmentée, celle de MediaRecorder (`moov` › `mvex` › `trex` : valeurs par
// défaut ; puis des `moof` › `traf` › `tfhd` et `trun` : durée de chaque image du fragment).

import * as fs from 'node:fs';

export interface VideoCadence {
  /** Images de la piste vidéo. */
  frames: number;
  /** Durée totale des images, en secondes. */
  seconds: number;
  /** Images par seconde en moyenne. */
  fps: number;
  /** Plus grand écart entre deux images, en millisecondes. */
  maxGapMs: number;
}

/** Au-delà, une boîte de description (`moov`, `moof`) n'est pas lue : ce n'est pas une vidéo ordinaire. */
const MAX_HEADER_BYTES = 64 * 1024 * 1024;
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf', 'edts']);

interface Track {
  id: number;
  video: boolean;
  timescale: number;
  durations: number[];
}

/** Cadence de la piste vidéo d'un fichier MP4 ; undefined si illisible ou sans piste vidéo. */
export function readVideoCadence(file: string): VideoCadence | undefined {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return undefined;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const state: ParseState = { tracks: new Map(), defaults: new Map(), current: undefined, fragment: undefined };
    const head = Buffer.alloc(16);
    for (let pos = 0; pos + 8 <= size; ) {
      const n = fs.readSync(fd, head, 0, 16, pos);
      if (n < 8) break;
      let boxSize = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      let header = 8;
      if (boxSize === 1) {
        if (n < 16) break;
        boxSize = Number(head.readBigUInt64BE(8));
        header = 16;
      } else if (boxSize === 0) boxSize = size - pos;
      if (boxSize < header) break;
      if (type === 'moov' || type === 'moof') {
        if (boxSize > MAX_HEADER_BYTES) return undefined;
        const body = Buffer.alloc(boxSize - header);
        fs.readSync(fd, body, 0, body.length, pos + header);
        walk(body, type, state);
      }
      pos += boxSize;
    }
    return cadenceOf(state);
  } catch {
    return undefined;
  } finally {
    fs.closeSync(fd);
  }
}

/** Même lecture sur un fichier déjà en mémoire (essais). */
export function videoCadenceOfBuffer(buf: Buffer): VideoCadence | undefined {
  const state: ParseState = { tracks: new Map(), defaults: new Map(), current: undefined, fragment: undefined };
  try {
    eachBox(buf, 0, buf.length, (type, s, e) => {
      if (type === 'moov' || type === 'moof') walk(buf.subarray(s, e), type, state);
    });
  } catch {
    return undefined;
  }
  return cadenceOf(state);
}

interface ParseState {
  tracks: Map<number, Track>;
  /** Durée par défaut de chaque piste (`trex`). */
  defaults: Map<number, number>;
  current: Track | undefined;
  /** Piste et durée par défaut du fragment en cours (`tfhd`). */
  fragment: { id: number; duration?: number } | undefined;
}

function eachBox(b: Buffer, start: number, end: number, fn: (type: string, body: number, end: number) => void): void {
  for (let p = start; p + 8 <= end; ) {
    let size = b.readUInt32BE(p);
    const type = b.toString('latin1', p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      size = Number(b.readBigUInt64BE(p + 8));
      header = 16;
    } else if (size === 0) size = end - p;
    if (size < header || p + size > end) return;
    fn(type, p + header, p + size);
    p += size;
  }
}

function walk(b: Buffer, type: string, state: ParseState): void {
  visit(type, 0, b.length);
  function visit(kind: string, s: number, e: number): void {
    if (CONTAINERS.has(kind)) {
      if (kind === 'trak') state.current = { id: 0, video: false, timescale: 0, durations: [] };
      eachBox(b, s, e, visit);
      if (kind === 'trak' && state.current) {
        const t = state.current;
        const known = state.tracks.get(t.id);
        if (known) Object.assign(known, { video: t.video, timescale: t.timescale }).durations.push(...t.durations);
        else state.tracks.set(t.id, t);
        state.current = undefined;
      }
      return;
    }
    const t = state.current;
    if (kind === 'tkhd' && t) t.id = b.readUInt32BE(s + (b[s] === 1 ? 20 : 12));
    else if (kind === 'mdhd' && t) t.timescale = b.readUInt32BE(s + (b[s] === 1 ? 20 : 12));
    else if (kind === 'hdlr' && t) t.video = b.toString('latin1', s + 8, s + 12) === 'vide';
    else if (kind === 'stts' && t) {
      const n = b.readUInt32BE(s + 4);
      for (let i = 0; i < n; i++) {
        const count = b.readUInt32BE(s + 8 + i * 8);
        const delta = b.readUInt32BE(s + 12 + i * 8);
        for (let k = 0; k < count; k++) t.durations.push(delta);
      }
    } else if (kind === 'trex') state.defaults.set(b.readUInt32BE(s + 4), b.readUInt32BE(s + 12));
    else if (kind === 'tfhd') {
      const flags = b.readUInt32BE(s) & 0xffffff;
      const id = b.readUInt32BE(s + 4);
      let o = s + 8;
      if (flags & 0x1) o += 8; // base-data-offset
      if (flags & 0x2) o += 4; // sample-description-index
      state.fragment = { id, duration: flags & 0x8 ? b.readUInt32BE(o) : undefined };
    } else if (kind === 'trun' && state.fragment) {
      const track = state.tracks.get(state.fragment.id);
      if (!track) return;
      const flags = b.readUInt32BE(s) & 0xffffff;
      const n = b.readUInt32BE(s + 4);
      let o = s + 8;
      if (flags & 0x1) o += 4; // data-offset
      if (flags & 0x4) o += 4; // first-sample-flags
      const fallback = state.fragment.duration ?? state.defaults.get(track.id) ?? 0;
      for (let i = 0; i < n; i++) {
        let duration = fallback;
        if (flags & 0x100) {
          duration = b.readUInt32BE(o);
          o += 4;
        }
        if (flags & 0x200) o += 4;
        if (flags & 0x400) o += 4;
        if (flags & 0x800) o += 4;
        track.durations.push(duration);
      }
    }
  }
}

function cadenceOf(state: ParseState): VideoCadence | undefined {
  const track = [...state.tracks.values()].find((t) => t.video && t.timescale > 0 && t.durations.length > 0);
  if (!track) return undefined;
  const total = track.durations.reduce((a, d) => a + d, 0);
  if (!(total > 0)) return undefined;
  const seconds = total / track.timescale;
  // La dernière image n'a pas de suivante : sa durée n'est pas un écart.
  const gaps = track.durations.length > 1 ? track.durations.slice(0, -1) : track.durations;
  return {
    frames: track.durations.length,
    seconds,
    fps: track.durations.length / seconds,
    maxGapMs: (Math.max(...gaps) * 1000) / track.timescale,
  };
}
