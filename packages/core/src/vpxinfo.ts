// Informations que l'auteur a écrites dans la table elle-même (Fichier > Informations
// de la table dans l'éditeur de VPX) : nom, auteur, version, date, description.
// Elles survivent aux renommages du fichier : « GOTG_2.1.1.vpx » s'y appelle encore
// « Guardians of the Galaxy ». La recherche approfondie des médias s'en sert.
//
// Un .vpx est un fichier composé OLE (Compound File Binary, [MS-CFB]). VPX y range
// ces informations dans le stockage « TableInfo », un flux par champ, en UTF-16LE
// sans longueur ni zéro final (PinTable::SaveInfo, WriteInfoValue). Les flux sont
// petits : ils vivent dans le mini-flux. On ne lit que l'en-tête, la table
// d'allocation, le répertoire et ces quelques secteurs, jamais les centaines de Mo
// d'images et de sons.

import * as fs from 'node:fs';

export interface VpxTableInfo {
  name?: string;
  author?: string;
  version?: string;
  releaseDate?: string;
  website?: string;
  blurb?: string;
  description?: string;
  rules?: string;
}

/** Flux du stockage TableInfo, et le champ où on les range. */
const FIELDS: Record<string, keyof VpxTableInfo> = {
  TableName: 'name',
  AuthorName: 'author',
  TableVersion: 'version',
  ReleaseDate: 'releaseDate',
  AuthorWebSite: 'website',
  TableBlurb: 'blurb',
  TableDescription: 'description',
  TableRules: 'rules',
};

const SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const END_OF_CHAIN = 0xfffffffe;
const MAX_SECTOR = 0xfffffffa;
/** Au-delà, un champ est tronqué : la règle du jeu peut être longue, on n'en a pas besoin entière. */
const MAX_FIELD_BYTES = 64 * 1024;

interface DirEntry {
  name: string;
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}

/**
 * Lecteur minimal de fichier composé : en-tête, FAT (avec la DIFAT des gros
 * fichiers), répertoire et mini-flux. Lève une erreur si le fichier n'en est pas un.
 */
class CompoundFile {
  private readonly sectorSize: number;
  private readonly miniSectorSize: number;
  private readonly miniCutoff: number;
  private readonly fat: Uint32Array;
  private readonly fileSize: number;
  readonly entries: DirEntry[];
  private miniFat?: Uint32Array;
  private miniStream?: Buffer;

  constructor(private readonly fd: number) {
    this.fileSize = fs.fstatSync(fd).size;
    const header = this.read(0, 512);
    if (!header.subarray(0, 8).equals(SIGNATURE)) throw new Error('ce n’est pas un fichier composé OLE'); // i18n-ignore : erreur interne, toujours rattrapée
    this.sectorSize = 1 << header.readUInt16LE(0x1e);
    this.miniSectorSize = 1 << header.readUInt16LE(0x20);
    if (this.sectorSize !== 512 && this.sectorSize !== 4096) throw new Error('taille de secteur inattendue'); // i18n-ignore : erreur interne, toujours rattrapée
    const fatCount = header.readUInt32LE(0x2c);
    this.miniCutoff = header.readUInt32LE(0x38);

    // Secteurs de la FAT : 109 dans l'en-tête, la suite dans la chaîne DIFAT.
    const fatSectors: number[] = [];
    for (let i = 0; i < 109 && fatSectors.length < fatCount; i++) fatSectors.push(header.readUInt32LE(0x4c + i * 4));
    let difat = header.readUInt32LE(0x44);
    const perDifat = this.sectorSize / 4 - 1;
    for (let guard = 0; fatSectors.length < fatCount && difat <= MAX_SECTOR && guard < 1 << 20; guard++) {
      const sector = this.sector(difat);
      for (let i = 0; i < perDifat && fatSectors.length < fatCount; i++) fatSectors.push(sector.readUInt32LE(i * 4));
      difat = sector.readUInt32LE(perDifat * 4);
    }
    const fat = Buffer.concat(fatSectors.map((s) => this.sector(s)));
    this.fat = new Uint32Array(fat.buffer, fat.byteOffset, fat.length / 4);

    const dir = this.chain(header.readUInt32LE(0x30));
    this.entries = [];
    for (let off = 0; off + 128 <= dir.length; off += 128) {
      const nameLen = Math.min(64, dir.readUInt16LE(off + 0x40));
      this.entries.push({
        name: dir.toString('utf16le', off, off + Math.max(0, nameLen - 2)),
        type: dir[off + 0x42]!,
        left: dir.readUInt32LE(off + 0x44),
        right: dir.readUInt32LE(off + 0x48),
        child: dir.readUInt32LE(off + 0x4c),
        start: dir.readUInt32LE(off + 0x74),
        // Version 3 : seuls les 32 bits de poids faible comptent.
        size: dir.readUInt32LE(off + 0x78),
      });
    }
    if (this.entries[0]?.type !== 5) throw new Error('répertoire du fichier composé illisible'); // i18n-ignore : erreur interne, toujours rattrapée
    const miniFatStart = header.readUInt32LE(0x3c);
    if (miniFatStart <= MAX_SECTOR) {
      const miniFat = this.chain(miniFatStart);
      this.miniFat = new Uint32Array(miniFat.buffer, miniFat.byteOffset, miniFat.length / 4);
    }
  }

  private read(offset: number, length: number): Buffer {
    const buf = Buffer.alloc(length);
    const got = fs.readSync(this.fd, buf, 0, length, offset);
    return got === length ? buf : buf.subarray(0, got);
  }

  private sector(n: number): Buffer {
    const offset = (n + 1) * this.sectorSize;
    if (n > MAX_SECTOR || offset >= this.fileSize) throw new Error(`secteur ${n} hors du fichier`); // i18n-ignore : erreur interne, toujours rattrapée
    return this.read(offset, this.sectorSize);
  }

  /** Chaîne de secteurs depuis `start`, jusqu'à `limit` octets. */
  private chain(start: number, limit = Infinity): Buffer {
    const parts: Buffer[] = [];
    let total = 0;
    const seen = new Set<number>();
    for (let s = start; s <= MAX_SECTOR && total < limit; s = this.fat[s] ?? END_OF_CHAIN) {
      if (seen.has(s)) throw new Error('chaîne de secteurs en boucle'); // i18n-ignore : erreur interne, toujours rattrapée
      seen.add(s);
      const sector = this.sector(s);
      parts.push(sector);
      total += sector.length;
    }
    return Buffer.concat(parts);
  }

  /** Contenu d'un flux, au plus `limit` octets. */
  stream(entry: DirEntry, limit = Infinity): Buffer {
    const size = Math.min(entry.size, limit);
    if (entry.size >= this.miniCutoff) return this.chain(entry.start, size).subarray(0, size);
    // Petit flux : secteurs de 64 octets dans le mini-flux, porté par l'entrée racine.
    this.miniStream ??= this.chain(this.entries[0]!.start, this.entries[0]!.size).subarray(0, this.entries[0]!.size);
    const parts: Buffer[] = [];
    let total = 0;
    const seen = new Set<number>();
    for (let s = entry.start; s <= MAX_SECTOR && total < size; s = this.miniFat?.[s] ?? END_OF_CHAIN) {
      if (seen.has(s)) throw new Error('chaîne de mini-secteurs en boucle'); // i18n-ignore : erreur interne, toujours rattrapée
      seen.add(s);
      const part = this.miniStream.subarray(s * this.miniSectorSize, (s + 1) * this.miniSectorSize);
      parts.push(part);
      total += part.length;
    }
    return Buffer.concat(parts).subarray(0, size);
  }

  /** Enfants d'un stockage : l'arbre rouge-noir de ses entrées, parcouru en entier. */
  children(entry: DirEntry): DirEntry[] {
    const out: DirEntry[] = [];
    const seen = new Set<number>();
    const walk = (id: number) => {
      if (id > MAX_SECTOR || seen.has(id) || !this.entries[id]) return;
      seen.add(id);
      const e = this.entries[id]!;
      walk(e.left);
      out.push(e);
      walk(e.right);
    };
    walk(entry.child);
    return out;
  }
}

/** Texte d'un flux de TableInfo : UTF-16LE, sans les zéros ni les espaces aux bouts. */
function decode(buf: Buffer): string {
  const even = buf.length - (buf.length % 2);
  return buf.toString('utf16le', 0, even).replace(/\0+$/g, '').replace(/\r\n/g, '\n').trim();
}

/** Au-delà, la capture n'est pas lue : ce ne serait plus une simple image. */
const MAX_SCREENSHOT_BYTES = 40 * 1024 * 1024;

const IMAGE_MAGIC: [string, number[]][] = [
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['jpg', [0xff, 0xd8, 0xff]],
  ['gif', [0x47, 0x49, 0x46, 0x38]],
];

/**
 * Capture de la table choisie par son auteur (flux TableInfo/Screenshot) : les octets
 * du fichier image d'origine, souvent le plateau vu en entier. Rare ; undefined si la
 * table n'en a pas, ou si ce n'est pas une image que le menu sait lire.
 */
export function readVpxScreenshot(file: string): { data: Buffer; ext: string } | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const storage = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'TableInfo');
    const entry = storage && cfb.children(storage).find((e) => e.type === 2 && e.name === 'Screenshot');
    if (!entry || !entry.size || entry.size > MAX_SCREENSHOT_BYTES) return undefined;
    const data = cfb.stream(entry);
    const ext = imageExt(data);
    return ext ? { data, ext } : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Format d'une image d'après sa signature ; undefined si le menu ne sait pas la lire. */
function imageExt(data: Buffer): string | undefined {
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return IMAGE_MAGIC.find(([, magic]) => magic.every((b, i) => data[i] === b))?.[0];
}

/**
 * Enregistrements BIFF de VPX : [longueur sur 4 octets][étiquette de 4 lettres][données
 * de longueur - 4]. Les enregistrements imbriqués (JPEG d'une image) suivent à plat.
 */
function* biffRecords(data: Buffer): Generator<{ tag: string; body: Buffer }> {
  let pos = 0;
  while (pos + 8 <= data.length) {
    const size = data.readUInt32LE(pos);
    const tag = data.toString('latin1', pos + 4, pos + 8);
    if (size < 4 || pos + 4 + size > data.length) return;
    yield { tag, body: data.subarray(pos + 8, pos + 4 + size) };
    pos += 4 + size;
  }
}

/** Chaîne BIFF : [longueur sur 4 octets][octets]. */
function biffString(body: Buffer): string {
  if (body.length < 4) return '';
  return body.toString('utf8', 4, 4 + Math.min(body.readUInt32LE(0), body.length - 4));
}

/** Une image rangée dans la table (GameStg/ImageN) : son nom, ses dimensions, son fichier d'origine. */
export interface VpxImage {
  name: string;
  width: number;
  height: number;
  ext: string;
  data: Buffer;
}

export interface VpxImages {
  /** Image du plateau (champ IMAG de GameData), si c'est une vraie vue de dessus. */
  playfield?: VpxImage;
  /** Carte de règles : l'image que désigne le Markdown des règles, ou au nom parlant. */
  rules?: VpxImage;
  /** Frontons de la pièce VR (« Pincab_BackglassImage », « backglassimage »…). */
  backglass: VpxImage[];
  /** Logos (« VR_Logo », « PinCab_Logo »…). */
  logos: VpxImage[];
}

/** Au-delà, une image n'est pas lue (une texture de 4K en PNG fait déjà 20 Mo). */
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
/** Images de chaque sorte gardées, au plus. */
const MAX_PER_KIND = 3;

/**
 * Images utiles au menu, rangées dans la table par son auteur
 * (docs/recherche/sources-medias.md § 2.4) :
 * - l'image du plateau désignée par IMAG, vue de dessus à plat, sauf les atlas du
 *   Visual Light Mapper (« VLM. », « Nestmap », image carrée) ;
 * - la carte de règles désignée par `![…](nom)` dans TableRules, sinon une image au nom
 *   de règles ou de carte d'instructions, plus large que haute ;
 * - les frontons et logos de la pièce VR, reconnus à leur nom.
 * Seul le début de chaque image est lu pour son nom ; ses octets seulement si elle sert.
 * undefined si le fichier n'est pas lisible comme un .vpx.
 */
export function readVpxImages(file: string, rules?: string): VpxImages | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    const out: VpxImages = { backglass: [], logos: [] };
    if (!game) return out;
    const streams = cfb.children(game).filter((e) => e.type === 2);
    // Nom de l'image du plateau, dans GameData (lu jusqu'à IMAG, qui vient tôt, avant le script).
    const gameData = streams.find((e) => e.name === 'GameData');
    let playfieldName: string | undefined;
    if (gameData) {
      for (const { tag, body } of biffRecords(cfb.stream(gameData, 512 * 1024))) {
        if (tag === 'IMAG') playfieldName = biffString(body);
        if (tag === 'CODE' || tag === 'ENDB') break;
      }
    }
    const rulesName = /!\[[^\]]*\]\(([^)]+)\)/.exec(rules ?? '')?.[1]?.trim().toLowerCase();
    const head = (entry: DirEntry) => {
      let name = '';
      let width = 0;
      let height = 0;
      for (const { tag, body } of biffRecords(cfb.stream(entry, 4096))) {
        if (tag === 'NAME' && !name) name = biffString(body);
        else if (tag === 'WDTH' && body.length >= 4) width = body.readUInt32LE(0);
        else if (tag === 'HGHT' && body.length >= 4) height = body.readUInt32LE(0);
        else if (tag === 'JPEG' || tag === 'BITS') break;
      }
      return { name, width, height };
    };
    const load = (entry: DirEntry, meta: { name: string; width: number; height: number }): VpxImage | undefined => {
      if (entry.size > MAX_IMAGE_BYTES) return undefined;
      let data: Buffer | undefined;
      for (const { tag, body } of biffRecords(cfb.stream(entry))) if (tag === 'DATA') data = body;
      const ext = data && imageExt(data);
      return data && ext ? { ...meta, ext, data } : undefined;
    };
    for (const entry of streams.filter((e) => /^Image\d+$/.test(e.name))) {
      const meta = head(entry);
      const lower = meta.name.toLowerCase();
      if (!lower) continue;
      if (playfieldName && lower === playfieldName.toLowerCase()) {
        // Atlas du Visual Light Mapper : une mosaïque de textures, pas une vue du plateau.
        if (!/vlm\.|nestmap/i.test(meta.name) && meta.width !== meta.height) out.playfield = load(entry, meta) ?? out.playfield;
        continue;
      }
      if (rulesName ? lower === rulesName : !out.rules && /rules|instruction|info ?card|^card$|[_ -]card$/.test(lower) && meta.width > meta.height) {
        out.rules = load(entry, meta) ?? out.rules;
        continue;
      }
      if (/backglass/.test(lower) && !/dmd|off$|_off|grill|frame/.test(lower) && out.backglass.length < MAX_PER_KIND) {
        const img = load(entry, meta);
        if (img) out.backglass.push(img);
        continue;
      }
      if (/(^|[_ ])logo$|^vr_?logo|pincab_?logo/.test(lower) && out.logos.length < MAX_PER_KIND) {
        const img = load(entry, meta);
        if (img) out.logos.push(img);
      }
    }
    return out;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Informations écrites dans la table par son auteur ; objet vide si la table n'en a
 * pas, undefined si le fichier n'est pas lisible comme un .vpx.
 */
export function readVpxTableInfo(file: string): VpxTableInfo | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const storage = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'TableInfo');
    const info: VpxTableInfo = {};
    if (!storage) return info;
    for (const entry of cfb.children(storage)) {
      const field = FIELDS[entry.name];
      if (!field || entry.type !== 2 || !entry.size) continue;
      const text = decode(cfb.stream(entry, MAX_FIELD_BYTES));
      if (text) info[field] = text;
    }
    return info;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
