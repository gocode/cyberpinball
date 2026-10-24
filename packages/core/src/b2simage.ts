// Image d'un .directb2s, repli du fronton quand le jeu n'a pas de média
// (docs/recherche/medias.md, § 5.1 et § 5.3, tâche T4).
//
// Un .directb2s est un XML de plusieurs dizaines de Mo : les ampoules
// (<Illumination>) viennent d'abord, puis <Images> avec les grandes images en
// base64, coupées par des sauts de ligne souvent écrits « &#xD;&#xA; ». Le
// serveur B2S (formBackglass.vb, LoadB2SData) lit Images/BackglassOffImage
// (image éteinte) et Images/BackglassOnImage (allumée), sinon
// Images/BackglassImage, et Images/DMDImage pour le second écran.
//
// Lecture en deux temps, sans jamais charger le fichier : un premier passage
// repère seulement où commencent et finissent les valeurs utiles (recherche
// d'octets, aucune chaîne de la taille du fichier), puis seules les images
// retenues sont relues et décodées vers le cache, morceau par morceau. Rien
// n'est écrit à côté de la table : tout va dans <données>\cache\medias\.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { decodePng, drawOver, encodePng, resizeRgba } from './png';

/** Éléments de <Images> qui nous servent, dans l'ordre de préférence pour le fronton. */
export const B2S_BACKGLASS_ELEMENTS = ['BackglassOnImage', 'BackglassImage', 'BackglassOffImage'] as const;
export const B2S_DMD_ELEMENT = 'DMDImage';
export type B2sElement = (typeof B2S_BACKGLASS_ELEMENTS)[number] | typeof B2S_DMD_ELEMENT;

export type B2sImageFormat = 'png' | 'jpeg' | 'gif' | 'bmp' | 'webp';

/** Une image extraite, prête à afficher. */
export interface B2sImage {
  /** Fichier dans le cache (jamais à côté de la table). */
  file: string;
  width: number;
  height: number;
  format: B2sImageFormat;
  /** Élément du .directb2s d'où vient l'image. */
  element: B2sElement;
  bytes: number;
}

export interface B2sImages {
  backglass?: B2sImage;
  dmd?: B2sImage;
  /** Ce qui a empêché une extraction (fichier illisible, image tronquée…), en français. */
  problems?: string[];
}

/** Dossier du cache sous le dossier de données (<données>\cache\medias). */
export function b2sCacheDir(dataDir: string): string {
  return path.join(dataDir, 'cache', 'medias');
}

/** Change quand la façon d'extraire change : les entrées plus anciennes sont refaites. */
const CACHE_VERSION = 1;
const MANIFEST_SUFFIX = '.b2s.json';
const TEMP_MARK = '.tmp-';
const CHUNK = 1024 * 1024;

interface Manifest {
  version: number;
  source: string;
  size: number;
  mtimeMs: number;
  backglass?: Omit<B2sImage, 'file'> & { file: string };
  dmd?: Omit<B2sImage, 'file'> & { file: string };
  problems?: string[];
}

/** Clé d'une table : son chemin, sans tenir compte de la casse sous Windows. */
function sourceKey(file: string): string {
  const full = path.resolve(file);
  return process.platform === 'win32' ? full.toLowerCase() : full;
}

function hash(text: string, length: number): string {
  return createHash('sha1').update(text).digest('hex').slice(0, length);
}

/** Extractions en cours, pour ne pas lire deux fois le même fichier en même temps. */
const pending = new Map<string, Promise<B2sImages>>();

/**
 * Images d'un .directb2s : le fronton (allumé de préférence) et le DMD s'il
 * existe, extraits une fois dans dossierCache puis relus depuis le cache tant
 * que le fichier garde sa taille et sa date. Ne lève jamais d'erreur : un
 * fichier absent, illisible ou sans image donne un résultat vide avec la raison
 * dans problems. Le résultat négatif est mis en cache lui aussi, pour ne pas
 * relire 60 Mo à chaque passage sur la table.
 */
export async function b2sImages(file: string, cacheDir: string): Promise<B2sImages> {
  const key = sourceKey(file) + '\0' + sourceKey(cacheDir);
  const running = pending.get(key);
  if (running) return running;
  const job = loadOrExtract(file, cacheDir).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

async function loadOrExtract(file: string, cacheDir: string): Promise<B2sImages> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
    if (!stat.isFile()) return { problems: [`${file} n'est pas un fichier.`] }; // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  } catch (err) {
    return { problems: [`${file} est illisible : ${(err as Error).message}`] }; // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  }
  const tableDir = sourceKey(path.dirname(file));
  const cache = sourceKey(cacheDir);
  if (cache === tableDir || cache.startsWith(tableDir + path.sep)) {
    return { problems: [`Le cache ${cacheDir} est dans le dossier de la table : rien n'est écrit à côté d'une table.`] }; // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  }

  const base = hash(sourceKey(file), 16);
  const manifestFile = path.join(cacheDir, base + MANIFEST_SUFFIX);
  const cached = await readManifest(manifestFile);
  if (cached && cached.version === CACHE_VERSION && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    const result = fromManifest(cached, cacheDir);
    if (await imagesPresent([result.backglass, result.dmd])) return result;
  }

  // Le nom des images change avec la taille et la date : une fenêtre qui
  // garde l'ancienne image en mémoire voit un nouveau fichier.
  const stamp = `${base}-${hash(`${stat.size}:${stat.mtimeMs}`, 8)}`;
  const result: B2sImages = {};
  const problems: string[] = [];
  try {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const found = await scanB2s(file);
    problems.push(...found.problems);
    const backglass = B2S_BACKGLASS_ELEMENTS.map((name) => found.values.get(name)).filter((v) => v !== undefined);
    for (const range of backglass) {
      const image = await extract(file, range, path.join(cacheDir, `${stamp}.backglass`), problems);
      if (image) {
        result.backglass = image;
        break;
      }
    }
    const dmd = found.values.get(B2S_DMD_ELEMENT);
    if (dmd) {
      const image = await extract(file, dmd, path.join(cacheDir, `${stamp}.dmd`), problems);
      if (image) result.dmd = image;
    }
    if (!result.backglass && !backglass.length && !problems.length) problems.push(`${path.basename(file)} ne contient aucune image de fronton.`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  } catch (err) {
    problems.push(`Extraction impossible depuis ${path.basename(file)} : ${(err as Error).message}`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  }
  if (problems.length) result.problems = problems;

  // Le résultat n'est mémorisé que si le fichier n'a pas bougé pendant la lecture.
  try {
    const after = await fs.promises.stat(file);
    if (after.size === stat.size && after.mtimeMs === stat.mtimeMs) {
      const manifest: Manifest = {
        version: CACHE_VERSION,
        source: path.resolve(file),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ...(result.backglass ? { backglass: { ...result.backglass, file: path.basename(result.backglass.file) } } : {}),
        ...(result.dmd ? { dmd: { ...result.dmd, file: path.basename(result.dmd.file) } } : {}),
        ...(result.problems ? { problems: result.problems } : {}),
      };
      await writeAtomic(manifestFile, JSON.stringify(manifest, null, 2));
      await removeStaleImages(cacheDir, base, stamp);
    }
  } catch {
    // Cache impossible à écrire : l'image extraite sert quand même cette fois.
  }
  return result;
}

async function readManifest(file: string): Promise<Manifest | undefined> {
  try {
    const data = JSON.parse(await fs.promises.readFile(file, 'utf8')) as Manifest;
    return data && typeof data === 'object' && typeof data.source === 'string' ? data : undefined;
  } catch {
    return undefined;
  }
}

function fromManifest(m: Manifest, cacheDir: string): B2sImages {
  const result: B2sImages = {};
  if (m.backglass) result.backglass = { ...m.backglass, file: path.join(cacheDir, m.backglass.file) };
  if (m.dmd) result.dmd = { ...m.dmd, file: path.join(cacheDir, m.dmd.file) };
  if (m.problems?.length) result.problems = [...m.problems];
  return result;
}

async function imagesPresent(list: ({ file: string; bytes: number } | undefined)[]): Promise<boolean> {
  for (const image of list) {
    if (!image) continue;
    try {
      if ((await fs.promises.stat(image.file)).size !== image.bytes) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Images d'une ancienne version du même .directb2s. */
async function removeStaleImages(cacheDir: string, base: string, stamp: string): Promise<void> {
  for (const name of await fs.promises.readdir(cacheDir)) {
    if (name.startsWith(base + '-') && !name.startsWith(stamp + '.') && !name.includes(TEMP_MARK)) {
      await fs.promises.rm(path.join(cacheDir, name), { force: true });
    }
  }
}

async function writeAtomic(file: string, content: string): Promise<void> {
  const temp = `${file}${TEMP_MARK}${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.promises.writeFile(temp, content);
  await fs.promises.rename(temp, file);
}

// ---------- Premier passage : où sont les valeurs ----------

/** Octets [start, end) d'une valeur d'attribut, guillemets exclus. */
interface ByteRange {
  start: number;
  end: number;
}

/** Valeur de l'attribut Value d'un élément de <Images>. */
interface ValueRange extends ByteRange {
  element: B2sElement;
}

const WANTED = new Set<string>([...B2S_BACKGLASS_ELEMENTS, B2S_DMD_ELEMENT]);
const LT = 0x3c;

function isNameByte(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x5f || c === 0x3a || c === 0x2d || c === 0x2e;
}

function isSpace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

/**
 * Repère les valeurs des éléments utiles sans rien décoder. Une valeur
 * d'attribut XML ne contient jamais « < » : il suffit de sauter d'un « < » au
 * suivant, et seules les balises voulues sont lues en détail. La lecture
 * s'arrête à </Images>.
 */
export async function scanB2s(file: string): Promise<{ values: Map<B2sElement, ValueRange>; bulbs: B2sBulb[]; problems: string[] }> {
  const values = new Map<B2sElement, ValueRange>();
  const problems: string[] = [];
  /** Attributs de chaque <Bulb> (octets de leur valeur), lus après le passage. */
  const bulbRanges: Map<string, ByteRange>[] = [];
  let bulb: Map<string, ByteRange> | undefined;
  const closeTag = () => {
    if (bulb) bulbRanges.push(bulb);
    bulb = undefined;
  };
  type State = 'text' | 'name' | 'tag' | 'attr' | 'eq' | 'value';
  let state: State = 'text';
  let name = '';
  let element: B2sElement | undefined;
  let attr = '';
  let quote = 0;
  let valueStart = 0;
  let offset = 0;
  let first = true;
  let done = false;

  const stream = fs.createReadStream(file, { highWaterMark: CHUNK });
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      if (first) {
        first = false;
        if ((chunk[0] === 0xff && chunk[1] === 0xfe) || (chunk[0] === 0xfe && chunk[1] === 0xff)) {
          problems.push(`${path.basename(file)} est en UTF-16, encodage non pris en charge.`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
          done = true;
          break;
        }
      }
      let i = 0;
      while (i < chunk.length) {
        if (state === 'text') {
          const lt = chunk.indexOf(LT, i);
          if (lt < 0) break;
          i = lt + 1;
          state = 'name';
          name = '';
          continue;
        }
        if (state === 'value') {
          const end = chunk.indexOf(quote, i);
          if (end < 0) break;
          if (element && attr === 'Value' && !values.has(element)) values.set(element, { element, start: valueStart, end: offset + end });
          if (bulb && !bulb.has(attr)) bulb.set(attr, { start: valueStart, end: offset + end });
          i = end + 1;
          state = 'tag';
          continue;
        }
        const c = chunk[i]!;
        if (state === 'name') {
          if (isNameByte(c) || (c === 0x2f && name === '')) {
            if (name.length < 64) name += String.fromCharCode(c);
            i++;
            continue;
          }
          if (name === '/Images') {
            done = true;
            break;
          }
          element = WANTED.has(name) ? (name as B2sElement) : undefined;
          bulb = name === 'Bulb' ? new Map() : undefined;
          state = element || bulb ? 'tag' : 'text';
          continue;
        }
        if (state === 'tag') {
          if (isSpace(c)) i++;
          else if (c === 0x2f || c === 0x3e) {
            closeTag();
            state = 'text';
            i++;
          } else if (c === LT) {
            closeTag();
            state = 'text'; // balise mal fermée : on repart de ce « < »
          }
          else {
            attr = '';
            state = 'attr';
          }
          continue;
        }
        if (state === 'attr') {
          if (isNameByte(c)) {
            if (attr.length < 64) attr += String.fromCharCode(c);
            i++;
          } else if (c === 0x3d || isSpace(c)) {
            state = 'eq';
          } else {
            // Caractère inattendu : on le saute, et « / » ou « > » ferme la balise.
            if (c === 0x2f || c === 0x3e) closeTag();
            state = c === 0x2f || c === 0x3e ? 'text' : 'tag';
            i++;
          }
          continue;
        }
        // state === 'eq' : blancs, « = », puis le guillemet ouvrant
        if (isSpace(c) || c === 0x3d) i++;
        else if (c === 0x22 || c === 0x27) {
          quote = c;
          valueStart = offset + i + 1;
          state = 'value';
          i++;
        } else state = 'tag';
      }
      if (done) break;
      offset += chunk.length;
    }
  } catch (err) {
    problems.push(`Lecture de ${path.basename(file)} interrompue : ${(err as Error).message}`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  } finally {
    stream.destroy();
  }
  if (state === 'value' && element && attr === 'Value' && !values.has(element)) {
    problems.push(`${element} est tronqué dans ${path.basename(file)} (fin de fichier dans la valeur).`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  }
  return { values, bulbs: await readBulbs(file, bulbRanges), problems };
}

/** Une ampoule de <Illumination> : où elle se pose, et l'image qu'elle allume. */
export interface B2sBulb {
  name: string;
  /** « Backglass » ou « DMD » : l'image sur laquelle elle se pose. */
  parent: string;
  visible: boolean;
  /** Morceau de l'image allumée (IsImageSnippit) ; sinon une lueur teintée par lightColor. */
  snippet: boolean;
  /** Position et taille, en pixels de l'image de fond. */
  x: number;
  y: number;
  width: number;
  height: number;
  lightColor?: [number, number, number];
  /** Texte de l'ampoule (rare) : sans image, rien à composer. */
  text: string;
  /** Octets de l'image en base64 dans le fichier. */
  image?: ByteRange;
}

/** Au-delà, un attribut n'est pas un petit champ (c'est une image) : pas relu. */
const SMALL_ATTRIBUTE = 512;

async function readBulbs(file: string, list: Map<string, ByteRange>[]): Promise<B2sBulb[]> {
  if (!list.length) return [];
  const fd = await fs.promises.open(file, 'r');
  try {
    const out: B2sBulb[] = [];
    for (const attrs of list) {
      const text = async (name: string): Promise<string> => {
        const r = attrs.get(name);
        if (!r || r.end <= r.start || r.end - r.start > SMALL_ATTRIBUTE) return '';
        const buf = Buffer.alloc(r.end - r.start);
        await fd.read(buf, 0, buf.length, r.start);
        return buf.toString('utf8').replace(ENTITY, entity);
      };
      const num = async (name: string) => Number.parseInt(await text(name), 10) || 0;
      const color = (await text('LightColor')).split('.').map((v) => Number.parseInt(v, 10));
      const image = attrs.get('Image');
      out.push({
        name: await text('Name'),
        parent: (await text('Parent')) || 'Backglass',
        visible: (await text('Visible')) !== '0',
        snippet: (await text('IsImageSnippit')) === '1',
        x: await num('LocX'),
        y: await num('LocY'),
        width: await num('Width'),
        height: await num('Height'),
        ...(color.length === 3 && color.every((v) => v >= 0 && v <= 255) ? { lightColor: color as [number, number, number] } : {}),
        text: await text('Text'),
        ...(image && image.end > image.start ? { image } : {}),
      });
    }
    return out;
  } finally {
    await fd.close();
  }
}

// ---------- Second passage : décodage vers le cache ----------

const ENTITY = /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos);/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const NOT_BASE64 = /[^A-Za-z0-9+/]/g;

function entity(_: string, body: string): string {
  if (body[0] !== '#') return NAMED[body] ?? '';
  const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
  return code < 0x80 ? String.fromCharCode(code) : '';
}

const EXTENSION: Record<B2sImageFormat, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', bmp: 'bmp', webp: 'webp' };

/** Décode une valeur base64 vers <cible>.<extension> ; le format vient des premiers octets, pas du nom de l'élément. */
async function extract(file: string, range: ValueRange, target: string, problems: string[]): Promise<B2sImage | undefined> {
  const label = `${range.element} de ${path.basename(file)}`;
  if (range.end <= range.start) {
    problems.push(`${label} est vide.`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
    return undefined;
  }
  const temp = `${target}${TEMP_MARK}${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const out = await fs.promises.open(temp, 'w');
  let bytes = 0;
  let head = Buffer.alloc(0);
  let ok = false;
  try {
    await decodeBase64(file, range, async (data) => {
      if (head.length < 32) head = Buffer.concat([head, data.subarray(0, 32 - head.length)]);
      await out.write(data);
      bytes += data.length;
    });
    ok = true;
  } catch (err) {
    problems.push(`${label} est illisible : ${(err as Error).message}`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  } finally {
    await out.close();
  }
  try {
    if (!ok) return undefined;
    const format = detectFormat(head);
    if (!format) {
      problems.push(`${label} n'est ni PNG, ni JPEG, ni GIF, ni BMP, ni WebP.`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
      return undefined;
    }
    const size = await imageSize(temp, format);
    if (!size) {
      problems.push(`${label} est une image ${format} dont les dimensions sont illisibles (fichier abîmé ?).`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
      return undefined;
    }
    const final = `${target}.${EXTENSION[format]}`;
    await fs.promises.rename(temp, final);
    return { file: final, width: size.width, height: size.height, format, element: range.element, bytes };
  } finally {
    await fs.promises.rm(temp, { force: true });
  }
}

/**
 * Décode la valeur base64 [start, end) du fichier, morceau par morceau. Les entités
 * (&#xD;&#xA;) et les blancs sont retirés au fil de l'eau ; un morceau d'entité ou un
 * groupe base64 incomplet en fin de morceau attend le suivant.
 */
async function decodeBase64(file: string, range: ByteRange, sink: (data: Buffer) => Promise<void> | void): Promise<void> {
  let carry = '';
  const write = async (b64: string) => {
    if (b64) await sink(Buffer.from(b64, 'base64'));
  };
  const stream = fs.createReadStream(file, { start: range.start, end: range.end - 1, highWaterMark: CHUNK });
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    // Un « < » dans la valeur : le guillemet fermant manque, la suite est du XML.
    if (chunk.indexOf(LT) >= 0) throw new Error('valeur mal fermée'); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
    let text = carry + chunk.toString('latin1');
    carry = '';
    const amp = text.lastIndexOf('&');
    if (amp >= 0 && text.indexOf(';', amp) < 0 && text.length - amp <= 12) {
      carry = text.slice(amp);
      text = text.slice(0, amp);
    }
    const clean = text.replace(ENTITY, entity).replace(NOT_BASE64, '');
    const usable = clean.length - (clean.length % 4);
    await write(clean.slice(0, usable));
    carry = clean.slice(usable) + carry;
  }
  const rest = carry.replace(ENTITY, entity).replace(NOT_BASE64, '');
  if (rest.length % 4 === 1) throw new Error('base64 incomplet');
  await write(rest);
}

function detectFormat(b: Buffer): B2sImageFormat | undefined {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'gif';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

/** Dimensions lues dans l'en-tête ; pour le JPEG, parcours des segments jusqu'au SOF. */
async function imageSize(file: string, format: B2sImageFormat): Promise<{ width: number; height: number } | undefined> {
  const fd = await fs.promises.open(file, 'r');
  try {
    const read = async (position: number, length: number): Promise<Buffer> => {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fd.read(buf, 0, length, position);
      return buf.subarray(0, bytesRead);
    };
    const valid = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : undefined);
    if (format === 'png') {
      const b = await read(0, 24);
      return b.length === 24 && b.toString('latin1', 12, 16) === 'IHDR' ? valid(b.readUInt32BE(16), b.readUInt32BE(20)) : undefined;
    }
    if (format === 'gif') {
      const b = await read(0, 10);
      return b.length === 10 ? valid(b.readUInt16LE(6), b.readUInt16LE(8)) : undefined;
    }
    if (format === 'bmp') {
      const b = await read(0, 26);
      // En-tête BITMAPINFOHEADER : hauteur négative pour une image écrite de haut en bas.
      return b.length === 26 ? valid(Math.abs(b.readInt32LE(18)), Math.abs(b.readInt32LE(22))) : undefined;
    }
    if (format === 'webp') {
      const b = await read(0, 30);
      if (b.length < 30) return undefined;
      const kind = b.toString('latin1', 12, 16);
      if (kind === 'VP8 ') return valid(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
      if (kind === 'VP8L') {
        const bits = b.readUInt32LE(21);
        return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
      }
      if (kind === 'VP8X') return valid(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
      return undefined;
    }
    // JPEG
    const size = (await fd.stat()).size;
    let pos = 2;
    while (pos + 4 <= size) {
      const m = await read(pos, 9);
      if (m.length < 4 || m[0] !== 0xff) return undefined;
      const marker = m[1]!;
      if (marker === 0xff) {
        pos++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        pos += 2;
        continue;
      }
      const length = m.readUInt16BE(2);
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return m.length >= 9 ? valid(m.readUInt16BE(7), m.readUInt16BE(5)) : undefined;
      if (marker === 0xd9 || marker === 0xda || length < 2) return undefined;
      pos += 2 + length;
    }
    return undefined;
  } finally {
    await fd.close();
  }
}

/**
 * Les .directb2s de la liste sans les copies d'un fichier déjà vu (même taille, mêmes
 * premier et dernier Mo) : un dossier garde souvent le fichier du site à côté de celui
 * renommé comme la table. L'ordre est gardé ; un fichier illisible est gardé aussi.
 */
export async function distinctB2sFiles(files: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const file of files) {
    let key: string | undefined;
    try {
      const fd = await fs.promises.open(file, 'r');
      try {
        const { size } = await fd.stat();
        const head = Buffer.alloc(Math.min(size, CHUNK));
        const tail = Buffer.alloc(Math.min(size, CHUNK));
        await fd.read(head, 0, head.length, 0);
        await fd.read(tail, 0, tail.length, size - tail.length);
        key = `${size}:${createHash('sha1').update(head).update(tail).digest('hex')}`;
      } finally {
        await fd.close();
      }
    } catch {
      key = undefined;
    }
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(file);
  }
  return out;
}

// ---------- Fronton « tout allumé » : les ampoules posées sur l'image allumée ----------

/** Image composée : l'image de fond et les ampoules posées dessus, en PNG dans le cache. */
export interface B2sLitImage {
  file: string;
  width: number;
  height: number;
  bytes: number;
  /** Élément du .directb2s qui sert de fond. */
  base: B2sElement;
  /** Ampoules posées. */
  bulbs: number;
}

export interface B2sLitImages {
  backglass?: B2sLitImage;
  dmd?: B2sLitImage;
  problems?: string[];
}

const LIT_SUFFIX = '.lit.json';
/** Au-delà, une image d'ampoule n'est pas décodée (en base64, les plus grosses font 5 Mo). */
const MAX_BULB_BYTES = 32 * 1024 * 1024;

interface LitManifest {
  version: number;
  source: string;
  size: number;
  mtimeMs: number;
  backglass?: B2sLitImage;
  dmd?: B2sLitImage;
  problems?: string[];
}

/**
 * Fronton (et afficheur) « tout allumé » : toutes les ampoules visibles du .directb2s
 * (<Illumination>) posées sur l'image allumée, comme le serveur B2S les montre quand
 * elles s'allument. Un morceau d'image (IsImageSnippit) se pose tel quel ; une lueur
 * est teintée par sa couleur (LightColor). Rien si aucune ampoule n'a d'image, ou si
 * l'image de fond n'est pas un PNG. Composé une fois dans le cache, relu tant que le
 * fichier garde sa taille et sa date. Ne lève jamais d'erreur.
 */
export async function b2sLitImages(file: string, cacheDir: string): Promise<B2sLitImages> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
  } catch (err) {
    return { problems: [`${file} est illisible : ${(err as Error).message}`] }; // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  }
  const base = hash(sourceKey(file), 16);
  const manifestFile = path.join(cacheDir, base + LIT_SUFFIX);
  try {
    const cached = JSON.parse(await fs.promises.readFile(manifestFile, 'utf8')) as LitManifest;
    if (cached.version === CACHE_VERSION && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      const result: B2sLitImages = {};
      for (const kind of ['backglass', 'dmd'] as const) {
        const img = cached[kind];
        if (img) result[kind] = { ...img, file: path.join(cacheDir, img.file) };
      }
      if (cached.problems?.length) result.problems = cached.problems;
      if (await imagesPresent([result.backglass, result.dmd])) return result;
    }
  } catch {
    // Jamais composé, ou fiche illisible : on compose.
  }

  const images = await b2sImages(file, cacheDir);
  if (images.problems?.length && !images.backglass && !images.dmd) return { problems: images.problems };
  const stamp = `${base}-${hash(`${stat.size}:${stat.mtimeMs}`, 8)}`;
  const result: B2sLitImages = {};
  const problems: string[] = [];
  try {
    const { bulbs, problems: scanProblems } = await scanB2s(file);
    problems.push(...scanProblems);
    for (const kind of ['backglass', 'dmd'] as const) {
      const ground = images[kind];
      const parent = kind === 'backglass' ? 'backglass' : 'dmd';
      const mine = bulbs.filter((b) => b.parent.toLowerCase() === parent && b.visible && b.image && !b.text);
      if (!ground || !mine.length) continue;
      const canvas = ground.format === 'png' ? decodePng(await fs.promises.readFile(ground.file)) : undefined;
      if (!canvas) {
        problems.push(`${ground.element} de ${path.basename(file)} n'est pas un PNG lisible : ampoules non composées.`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
        continue;
      }
      let posed = 0;
      for (const bulb of mine) {
        const range = bulb.image!;
        if (range.end - range.start > (MAX_BULB_BYTES * 4) / 3) continue;
        const parts: Buffer[] = [];
        try {
          await decodeBase64(file, range, (data) => {
            parts.push(data);
          });
        } catch (err) {
          problems.push(`Ampoule « ${bulb.name} » de ${path.basename(file)} illisible : ${(err as Error).message}`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
          continue;
        }
        let layer = decodePng(Buffer.concat(parts));
        if (!layer) {
          problems.push(`Ampoule « ${bulb.name} » de ${path.basename(file)} : image qui n'est pas un PNG lisible.`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
          continue;
        }
        if (bulb.width > 0 && bulb.height > 0) layer = resizeRgba(layer, bulb.width, bulb.height);
        drawOver(canvas, layer, bulb.x, bulb.y, bulb.snippet ? undefined : bulb.lightColor);
        posed++;
      }
      if (!posed) continue;
      const png = encodePng(canvas);
      const target = path.join(cacheDir, `${stamp}.lit-${kind}.png`);
      const temp = `${target}${TEMP_MARK}${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      await fs.promises.writeFile(temp, png);
      await fs.promises.rename(temp, target);
      result[kind] = { file: target, width: canvas.width, height: canvas.height, bytes: png.length, base: ground.element, bulbs: posed };
    }
  } catch (err) {
    problems.push(`Composition impossible depuis ${path.basename(file)} : ${(err as Error).message}`); // i18n-ignore : diagnostic gardé dans le cache, jamais affiché
  }
  if (problems.length) result.problems = problems;
  try {
    const after = await fs.promises.stat(file);
    if (after.size === stat.size && after.mtimeMs === stat.mtimeMs) {
      const manifest: LitManifest = { version: CACHE_VERSION, source: path.resolve(file), size: stat.size, mtimeMs: stat.mtimeMs };
      for (const kind of ['backglass', 'dmd'] as const) {
        const img = result[kind];
        if (img) manifest[kind] = { ...img, file: path.basename(img.file) };
      }
      if (result.problems) manifest.problems = result.problems;
      await writeAtomic(manifestFile, JSON.stringify(manifest, null, 2));
    }
  } catch {
    // Cache impossible à écrire : l'image composée sert quand même cette fois.
  }
  return result;
}

// ---------- Nettoyage ----------

/**
 * Retire du cache les entrées orphelines : .directb2s disparu ou modifié depuis
 * l'extraction, images sans fiche, fichiers temporaires d'une extraction
 * interrompue (plus d'une heure). Avec keep, retire aussi les entrées dont la
 * source n'est pas dans la liste (tables retirées de la bibliothèque).
 * Ne touche qu'aux fichiers que ce module écrit.
 */
export async function pruneB2sCache(cacheDir: string, keep?: Iterable<string>): Promise<{ removed: string[] }> {
  const removed: string[] = [];
  let names: string[];
  try {
    names = await fs.promises.readdir(cacheDir);
  } catch {
    return { removed };
  }
  const kept = keep ? new Set([...keep].map(sourceKey)) : undefined;
  const live = new Set<string>();
  const remove = async (name: string) => {
    await fs.promises.rm(path.join(cacheDir, name), { force: true });
    removed.push(name);
  };
  const isManifest = (n: string) => n.endsWith(MANIFEST_SUFFIX) || n.endsWith(LIT_SUFFIX);
  for (const name of names.filter(isManifest)) {
    const manifest = await readManifest(path.join(cacheDir, name));
    let alive = false;
    if (manifest && manifest.version === CACHE_VERSION && (!kept || kept.has(sourceKey(manifest.source)))) {
      try {
        const stat = await fs.promises.stat(manifest.source);
        alive = stat.isFile() && stat.size === manifest.size && stat.mtimeMs === manifest.mtimeMs;
      } catch {
        alive = false;
      }
    }
    if (!alive) {
      await remove(name);
      continue;
    }
    for (const image of [manifest!.backglass, manifest!.dmd]) if (image) live.add(image.file);
  }
  const ours = /^[0-9a-f]{16}(-[0-9a-f]{8}\.(lit-)?(backglass|dmd)\.\w+|\.(b2s|lit)\.json)/;
  for (const name of names) {
    if (!ours.test(name) || isManifest(name) || live.has(name)) continue;
    if (name.includes(TEMP_MARK)) {
      try {
        const age = Date.now() - (await fs.promises.stat(path.join(cacheDir, name))).mtimeMs;
        if (age < 60 * 60 * 1000) continue;
      } catch {
        continue;
      }
    }
    await remove(name);
  }
  return { removed };
}
