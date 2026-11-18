// Fichier WebM d'une vidéo encodée en VP8 (images rendues par le WebCodecs de Chromium, media-convert.ts) : le
// conteneur que lit le plugin FlexDMD de VPX (libav, qui reconnaît le format au contenu, quel que soit le nom du
// fichier). Sert à ramener les vidéos du DMD d'une table à la taille du DMD (dmdvideos.ts) : décodées en entier à
// chaque scène, les vidéos trop grandes figent la partie.
//
// Structure (Matroska, profil WebM) : en-tête EBML, puis un Segment avec Info (échelle de temps en millisecondes,
// durée), Tracks (une piste vidéo V_VP8 et sa définition), et des Clusters de SimpleBlocks ; un Cluster commence à
// chaque image clé et au plus toutes les 30 s (temps relatif sur 16 bits signés).

/** Une image encodée : ses octets, image clé ou non, son instant en microsecondes. */
export interface EncodedFrame {
  data: Uint8Array;
  key: boolean;
  timestampUs: number;
}

function vintSize(n: number): Buffer {
  // Taille d'un élément EBML : 1 à 8 octets, le premier porte la longueur (le tout à 1 étant réservé).
  for (let len = 1; len <= 8; len++) {
    if (n < 2 ** (7 * len) - 1) {
      const out = Buffer.alloc(len);
      let v = n;
      for (let i = len - 1; i >= 0; i--) {
        out[i] = v % 256;
        v = Math.floor(v / 256);
      }
      out[0]! |= 1 << (8 - len);
      return out;
    }
  }
  throw new Error('élément EBML trop grand'); // i18n-ignore : erreur interne
}

function idBytes(id: number): Buffer {
  const bytes: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return Buffer.from(bytes);
}

function element(id: number, body: Buffer): Buffer {
  return Buffer.concat([idBytes(id), vintSize(body.length), body]);
}

function uint(id: number, value: number): Buffer {
  const bytes: number[] = [];
  for (let v = value; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return element(id, Buffer.from(bytes.length ? bytes : [0]));
}

function float(id: number, value: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeDoubleBE(value);
  return element(id, b);
}

function text(id: number, value: string): Buffer {
  return element(id, Buffer.from(value, 'latin1'));
}

/** Le fichier WebM des images, dans l'ordre ; la première doit être une image clé. */
export function webmFile(opts: { width: number; height: number; frames: readonly EncodedFrame[]; durationMs: number; app?: string }): Buffer {
  const app = opts.app ?? 'Cyber Pinball';
  const header = element(
    0x1a45dfa3,
    Buffer.concat([uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8), text(0x4282, 'webm'), uint(0x4287, 2), uint(0x4285, 2)]),
  );
  const info = element(0x1549a966, Buffer.concat([uint(0x2ad7b1, 1_000_000), float(0x4489, opts.durationMs), text(0x4d80, app), text(0x5741, app)]));
  const video = element(0xe0, Buffer.concat([uint(0xb0, opts.width), uint(0xba, opts.height)]));
  const tracks = element(0x1654ae6b, element(0xae, Buffer.concat([uint(0xd7, 1), uint(0x73c5, 1), uint(0x83, 1), text(0x86, 'V_VP8'), video])));
  const clusters: Buffer[] = [];
  let start = -1;
  let blocks: Buffer[] = [];
  const flush = () => {
    if (start >= 0 && blocks.length) clusters.push(element(0x1f43b675, Buffer.concat([uint(0xe7, start), ...blocks])));
    blocks = [];
  };
  for (const f of opts.frames) {
    const ms = Math.max(0, Math.round(f.timestampUs / 1000));
    if (start < 0 || f.key || ms - start > 30_000) {
      flush();
      start = ms;
    }
    const head = Buffer.alloc(4);
    head[0] = 0x81; // piste 1
    head.writeInt16BE(ms - start, 1);
    head[3] = f.key ? 0x80 : 0x00;
    blocks.push(element(0xa3, Buffer.concat([head, Buffer.from(f.data)])));
  }
  flush();
  return Buffer.concat([header, element(0x18538067, Buffer.concat([info, tracks, ...clusters]))]);
}
