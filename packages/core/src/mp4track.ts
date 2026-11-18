// Piste vidéo H.264 d'un fichier MP4 (ou MOV, M4V) : où sont ses images dans le fichier, dans quel ordre, à quels
// instants, et la configuration du décodeur. Sert à décoder une vidéo image par image avec le WebCodecs de Chromium
// (media-convert.ts, shrinkVideo) sans la lire en temps réel : une page cachée ne lit pas les vidéos, et un saut par
// image redécode depuis l'image clé précédente (78 s pour 8 s de vidéo, 18/11/2026).
//
// Boîtes lues (ISO/IEC 14496-12) : moov > trak > mdia > mdhd (échelle de temps), hdlr (« vide »), minf > stbl > stsd
// (avc1 et son avcC), stts (durées), ctts (décalages d'affichage), stss (images clés ; absente : toutes), stsz
// (tailles), stsc (images par bloc), stco ou co64 (position des blocs).

export interface Mp4Sample {
  offset: number;
  size: number;
  /** Instants de décodage et d'affichage, durée : en microsecondes. */
  dtsUs: number;
  ctsUs: number;
  durationUs: number;
  key: boolean;
}

export interface Mp4VideoTrack {
  /** Chaîne de codec du WebCodecs (« avc1.64001f »). */
  codec: string;
  /** Contenu de la boîte avcC (configuration du décodeur). */
  description: Buffer;
  width: number;
  height: number;
  durationUs: number;
  samples: Mp4Sample[];
}

interface Box {
  type: string;
  start: number;
  end: number;
}

function boxes(buf: Buffer, start: number, end: number): Box[] {
  const out: Box[] = [];
  for (let at = start; at + 8 <= end; ) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) size = end - at;
    if (size < header || at + size > end) break;
    out.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return out;
}

const child = (buf: Buffer, box: Box | undefined, type: string): Box | undefined => (box ? boxes(buf, box.start, box.end).find((b) => b.type === type) : undefined);

/** La première piste vidéo H.264 du fichier ; undefined sans elle (autre codec, fichier abîmé). */
export function mp4VideoTrack(buf: Buffer): Mp4VideoTrack | undefined {
  try {
    const moov = boxes(buf, 0, buf.length).find((b) => b.type === 'moov');
    for (const trak of moov ? boxes(buf, moov.start, moov.end).filter((b) => b.type === 'trak') : []) {
      const mdia = child(buf, trak, 'mdia');
      const hdlr = child(buf, mdia, 'hdlr');
      if (!hdlr || buf.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'vide') continue;
      const mdhd = child(buf, mdia, 'mdhd')!;
      const timescale = buf[mdhd.start] === 1 ? buf.readUInt32BE(mdhd.start + 20) : buf.readUInt32BE(mdhd.start + 12);
      const stbl = child(buf, child(buf, mdia, 'minf'), 'stbl');
      const stsd = child(buf, stbl, 'stsd');
      if (!stsd || !timescale) return undefined;
      // stsd : version/drapeaux et nombre d'entrées, puis l'entrée visuelle (78 octets avant ses boîtes).
      const entry = boxes(buf, stsd.start + 8, stsd.end)[0];
      if (!entry || !/^avc[13]$/.test(entry.type)) return undefined;
      const width = buf.readUInt16BE(entry.start + 24);
      const height = buf.readUInt16BE(entry.start + 26);
      const avcC = boxes(buf, entry.start + 78, entry.end).find((b) => b.type === 'avcC');
      if (!avcC) return undefined;
      const description = Buffer.from(buf.subarray(avcC.start, avcC.end));
      const hex = (n: number) => n.toString(16).padStart(2, '0');
      const codec = `avc1.${hex(description[1]!)}${hex(description[2]!)}${hex(description[3]!)}`;

      const full = (type: string) => child(buf, stbl, type);
      const stsz = full('stsz')!;
      const fixed = buf.readUInt32BE(stsz.start + 4);
      const count = buf.readUInt32BE(stsz.start + 8);
      const sizes = Array.from({ length: count }, (_, i) => (fixed ? fixed : buf.readUInt32BE(stsz.start + 12 + 4 * i)));

      const stco = full('stco');
      const co64 = full('co64');
      const chunkOffsets: number[] = [];
      if (stco) for (let i = 0, n = buf.readUInt32BE(stco.start + 4); i < n; i++) chunkOffsets.push(buf.readUInt32BE(stco.start + 8 + 4 * i));
      else if (co64) for (let i = 0, n = buf.readUInt32BE(co64.start + 4); i < n; i++) chunkOffsets.push(Number(buf.readBigUInt64BE(co64.start + 8 + 8 * i)));

      const stsc = full('stsc')!;
      const runs = Array.from({ length: buf.readUInt32BE(stsc.start + 4) }, (_, i) => ({ first: buf.readUInt32BE(stsc.start + 8 + 12 * i), per: buf.readUInt32BE(stsc.start + 12 + 12 * i) }));
      const offsets: number[] = [];
      for (let c = 0, s = 0; c < chunkOffsets.length && s < count; c++) {
        const run = [...runs].reverse().find((r) => r.first <= c + 1);
        let at = chunkOffsets[c]!;
        for (let k = 0; k < (run?.per ?? 1) && s < count; k++, s++) {
          offsets.push(at);
          at += sizes[s]!;
        }
      }

      const durations: number[] = [];
      const stts = full('stts')!;
      for (let i = 0, n = buf.readUInt32BE(stts.start + 4); i < n; i++) {
        const times = buf.readUInt32BE(stts.start + 8 + 8 * i);
        const delta = buf.readUInt32BE(stts.start + 12 + 8 * i);
        for (let k = 0; k < times; k++) durations.push(delta);
      }
      const shifts: number[] = new Array(count).fill(0);
      const ctts = full('ctts');
      if (ctts) {
        const signed = buf[ctts.start] === 1;
        let s = 0;
        for (let i = 0, n = buf.readUInt32BE(ctts.start + 4); i < n; i++) {
          const times = buf.readUInt32BE(ctts.start + 8 + 8 * i);
          const shift = signed ? buf.readInt32BE(ctts.start + 12 + 8 * i) : buf.readUInt32BE(ctts.start + 12 + 8 * i);
          for (let k = 0; k < times && s < count; k++) shifts[s++] = shift;
        }
      }
      const stss = full('stss');
      const keys = stss ? new Set(Array.from({ length: buf.readUInt32BE(stss.start + 4) }, (_, i) => buf.readUInt32BE(stss.start + 8 + 4 * i) - 1)) : undefined;

      const us = (t: number) => Math.round((t * 1e6) / timescale);
      const samples: Mp4Sample[] = [];
      let dts = 0;
      for (let i = 0; i < count && i < offsets.length; i++) {
        const d = durations[i] ?? durations[durations.length - 1] ?? 0;
        samples.push({ offset: offsets[i]!, size: sizes[i]!, dtsUs: us(dts), ctsUs: us(dts + shifts[i]!), durationUs: us(d), key: keys ? keys.has(i) : true });
        dts += d;
      }
      return { codec, description, width, height, durationUs: us(dts), samples };
    }
  } catch {
    return undefined;
  }
  return undefined;
}
