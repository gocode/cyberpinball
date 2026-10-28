// Fichiers d'un PuP-Pack que le plugin PUP de VPX 10.8.1 lit autrement que PinUP Player
// (Game of Thrones LE, VPW, 28 octobre 2026 ; plugins/pup au commit af26b2d93) :
// - une image nommée comme une vidéo (« Stark.mp4 », un PNG ; « Backglass.mp4 », un JPEG) :
//   PinUP Player la montrait comme une image ; le plugin choisit d'après l'extension
//   (PUPScreen::Play : seuls .png, .jpg, .jpeg et .bmp sont des images) et la donne à FFmpeg,
//   qui la joue comme une vidéo d'une seule image, en boucle : un fronton presque noir, avec des
//   éclairs de l'image ;
// - un nom accentué écrit en UTF-8 dans un .pup (« 9y10perro y montaña.mp4 ») : le plugin le
//   convertit en chemin avec la page de codes de Windows (std::filesystem::path d'une
//   std::string, PUPTrigger::CreateFromCSV), ne trouve pas le fichier, et abandonne le
//   déclencheur (« PlayFile not found »).
// Le fichier reprend sa vraie extension, son nom passe en ASCII, et chaque .pup du pack (options
// comprises) est réécrit octet pour octet, sauf le nom changé. Un nom que le script de la table
// cite n'est jamais changé.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatList, tn } from './i18n';
import { isJunkName, PUP_FILES } from './puppack';

/** Nature d'un fichier d'après ses premiers octets. */
export type MediaKind = 'jpeg' | 'png' | 'gif' | 'bmp' | 'video' | 'audio' | 'other';

export function mediaKind(head: Buffer): MediaKind {
  const a = head.toString('latin1', 0, Math.min(12, head.length));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (a.startsWith('\x89PNG')) return 'png';
  if (a.startsWith('GIF8')) return 'gif';
  if (a.startsWith('BM')) return 'bmp';
  if (['ftyp', 'moov', 'mdat', 'free', 'wide'].includes(a.slice(4, 8))) return 'video';
  if (a.startsWith('RIFF') && a.slice(8, 12) === 'AVI ') return 'video';
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video';
  if (a.startsWith('ID3') || a.startsWith('OggS') || (a.startsWith('RIFF') && a.slice(8, 12) === 'WAVE')) return 'audio';
  return 'other';
}

/** Extensions que le plugin donne à FFmpeg comme des vidéos. */
const VIDEO_EXT = /\.(mp4|m4v|mov|avi|mkv|webm|f4v|flv|mpg|mpeg|wmv)$/i;
/** Extension qui fait d'une image une image pour le plugin (PUPScreen::Play). */
const IMAGE_EXT: Partial<Record<MediaKind, string>> = { jpeg: '.jpg', png: '.png', bmp: '.bmp' };

/** Le nom en ASCII : lettres accentuées sans accent, autres caractères en « _ ». */
export function asciiName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '_');
}

/** Un fichier ou un dossier du pack à renommer, chemins relatifs à la racine. */
export interface PackRename {
  from: string;
  to: string;
  why: 'image' | 'ascii';
}

export interface PackFileFixes {
  renames: PackRename[];
  /** .pup à réécrire (contenu en latin1 : un caractère par octet), chemins relatifs à la racine. */
  writes: { file: string; content: string }[];
  /** Noms à corriger que le script cite : laissés tels quels. */
  kept: string[];
}

/** Dossiers du pack qui ne sont pas des playlists. */
const NOT_PLAYLIST = /^(pupcapture|fonts)$|option/i;

/**
 * Ce qu'il faut renommer dans le pack (playlists : sous-dossiers de la racine, et leurs fichiers),
 * et les .pup réécrits en conséquence. `script` : le script que joue la table, quand il appelle
 * PuP ; un nom qu'il cite reste tel quel.
 */
export function packFileFixes(root: string, script?: string): PackFileFixes {
  const renames: PackRename[] = [];
  const kept: string[] = [];
  const cited = (name: string) => script !== undefined && script.toLowerCase().includes(name.toLowerCase());
  for (const dir of readDirents(root)) {
    if (!dir.isDirectory() || isJunkName(dir.name) || NOT_PLAYLIST.test(dir.name)) continue;
    const taken = new Set(readDirents(path.join(root, dir.name)).map((e) => e.name.toLowerCase()));
    for (const file of readDirents(path.join(root, dir.name))) {
      if (!file.isFile() || isJunkName(file.name)) continue;
      let name = asciiName(file.name);
      let why: PackRename['why'] = name !== file.name ? 'ascii' : 'image';
      if (VIDEO_EXT.test(file.name)) {
        const proper = IMAGE_EXT[mediaKind(readHead(path.join(root, dir.name, file.name)))];
        if (proper) {
          name = name.slice(0, name.length - path.extname(name).length) + proper;
          why = 'image';
        }
      }
      if (name === file.name) continue;
      if (cited(file.name)) {
        kept.push(path.join(dir.name, file.name));
        continue;
      }
      name = freeName(name, taken);
      taken.add(name.toLowerCase());
      renames.push({ from: path.join(dir.name, file.name), to: path.join(dir.name, name), why });
    }
  }
  // Dossiers de playlist au nom accentué : le dossier et les colonnes qui le nomment.
  const takenDirs = new Set(readDirents(root).map((e) => e.name.toLowerCase()));
  const folders: PackRename[] = [];
  for (const dir of readDirents(root)) {
    if (!dir.isDirectory() || isJunkName(dir.name) || NOT_PLAYLIST.test(dir.name)) continue;
    const name = asciiName(dir.name);
    if (name === dir.name) continue;
    if (cited(dir.name)) {
      kept.push(dir.name);
      continue;
    }
    const free = freeName(name, takenDirs);
    takenDirs.add(free.toLowerCase());
    folders.push({ from: dir.name, to: free, why: 'ascii' });
  }
  const writes = renames.length || folders.length ? rewritePups(root, renames, folders) : [];
  // Les fichiers d'abord (dans leur dossier d'origine), puis les dossiers.
  return { renames: [...renames, ...folders], writes, kept };
}

/** Colonnes qui nomment une playlist, et un fichier, dans chaque .pup (en-têtes de PinUP Player). */
const COLUMNS: Record<string, { playlist: number; file?: number }> = {
  'screens.pup': { playlist: 2, file: 3 },
  'playlists.pup': { playlist: 1 },
  'triggers.pup': { playlist: 5, file: 6 },
};

/** Les .pup du pack (racine, options, sauvegardes), réécrits avec les nouveaux noms. */
function rewritePups(root: string, files: PackRename[], folders: PackRename[]): { file: string; content: string }[] {
  const byFile = new Map(files.map((r) => [`${path.dirname(r.from).toLowerCase()}|${path.basename(r.from).toLowerCase()}`, path.basename(r.to)]));
  const byFolder = new Map(folders.map((r) => [r.from.toLowerCase(), r.to]));
  const out: { file: string; content: string }[] = [];
  for (const rel of listPups(root)) {
    const columns = COLUMNS[path.basename(rel).toLowerCase()];
    if (!columns) continue;
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(root, rel), 'latin1');
    } catch {
      continue;
    }
    let changed = false;
    const lines = raw.split(/(\r?\n)/);
    for (let i = 2; i < lines.length; i += 2) {
      const line = lines[i]!;
      const spans = csvSpans(line);
      const playlistSpan = spans[columns.playlist];
      if (!playlistSpan) continue;
      const playlist = decode(line.slice(playlistSpan.start, playlistSpan.end));
      const edits: { span: Span; value: string }[] = [];
      const fileSpan = columns.file !== undefined ? spans[columns.file] : undefined;
      if (fileSpan) {
        const value = decode(line.slice(fileSpan.start, fileSpan.end));
        const renamed = value && byFile.get(`${playlist.toLowerCase()}|${value.toLowerCase()}`);
        if (renamed) edits.push({ span: fileSpan, value: renamed });
      }
      const folder = byFolder.get(playlist.toLowerCase());
      if (folder) edits.push({ span: playlistSpan, value: folder });
      if (!edits.length) continue;
      let next = line;
      for (const e of edits.sort((a, b) => b.span.start - a.span.start)) next = next.slice(0, e.span.start) + quoteField(e.value, e.span.quoted) + next.slice(e.span.end);
      lines[i] = next;
      changed = true;
    }
    if (changed) out.push({ file: rel, content: lines.join('') });
  }
  return out;
}

interface Span {
  /** Début et fin du champ dans la ligne, guillemets compris. */
  start: number;
  end: number;
  quoted: boolean;
}

/** Champs d'une ligne CSV, comme les lit le plugin (parseCsvLine), avec leur place dans la ligne. */
function csvSpans(line: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i <= line.length) {
    const start = i;
    let quoted = false;
    if (line[i] === '"') {
      quoted = true;
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') i += 2;
        else if (line[i] === '"') {
          i++;
          break;
        } else i++;
      }
      while (i < line.length && line[i] !== ',') i++;
    } else {
      while (i < line.length && line[i] !== ',') i++;
    }
    spans.push({ start, end: i, quoted });
    i++;
  }
  return spans;
}

/** Valeur d'un champ (octets en latin1) : sans guillemets, en UTF-8 s'il en est. */
function decode(field: string): string {
  let v = field.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1).replace(/""/g, '"');
  const bytes = Buffer.from(v, 'latin1');
  const utf8 = bytes.toString('utf8');
  return utf8.includes('�') ? v : utf8;
}

function quoteField(value: string, quoted: boolean): string {
  return quoted || /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Nom libre dans un dossier (« Stark.png », sinon « Stark (2).png »). */
function freeName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Fichiers que les .pup de la racine nomment et que le plugin ne trouvera pas dans leur playlist
 * (déclencheurs actifs, fichiers de fond des écrans) : « playlist\fichier ». Comme le plugin, sans
 * tenir compte de la casse, le nom lu tel quel (en ASCII, la seule lecture sûre).
 */
export function missingPackFiles(root: string): string[] {
  const missing = new Set<string>();
  const entries = readDirents(root);
  const playlistFiles = (playlist: string) => {
    const dir = entries.find((d) => d.isDirectory() && d.name.toLowerCase() === playlist.toLowerCase());
    return dir ? new Set(listFiles(path.join(root, dir.name)).map((f) => f.toLowerCase())) : undefined;
  };
  for (const name of PUP_FILES) {
    const columns = COLUMNS[name];
    const file = entries.find((d) => d.isFile() && d.name.toLowerCase() === name);
    if (!columns?.file || !file) continue;
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(root, file.name), 'latin1');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/).slice(1)) {
      const spans = csvSpans(line);
      const field = (n: number) => (spans[n] ? decode(line.slice(spans[n]!.start, spans[n]!.end)) : '');
      if (name === 'triggers.pup' && field(1) !== '1') continue;
      // Écran éteint : le plugin ne joue rien sur lui.
      if (name === 'screens.pup' && field(5).toLowerCase() === 'off') continue;
      const playlist = field(columns.playlist);
      const wanted = field(columns.file);
      if (!playlist || !wanted) continue;
      const files = playlistFiles(playlist);
      if (files && !files.has(wanted.toLowerCase())) missing.add(`${playlist}\\${wanted}`);
    }
  }
  return [...missing];
}

/** Résumé d'une liste de renommages, pour un constat. */
export function describeRenames(renames: PackRename[]): string {
  const images = renames.filter((r) => r.why === 'image');
  const ascii = renames.filter((r) => r.why === 'ascii');
  const show = (list: PackRename[]) => formatList(list.slice(0, 3).map((r) => `« ${path.basename(r.from)} »`)) + (list.length > 3 ? '…' : '');
  return [
    images.length
      ? tn(
          images.length,
          'Une image nommée comme une vidéo ({list}) : le plugin PUP la jouerait comme une vidéo d’une seule image, en boucle, et l’écran clignoterait.',
          '{n} images nommées comme des vidéos ({list}) : le plugin PUP les jouerait comme des vidéos d’une seule image, en boucle, et l’écran clignoterait.',
          { n: images.length, list: show(images) },
        )
      : '',
    ascii.length
      ? tn(
          ascii.length,
          'Un nom accentué ({list}) : le plugin PUP ne le retrouverait pas, et ce qui le nomme ne jouerait jamais.',
          '{n} noms accentués ({list}) : le plugin PUP ne les retrouverait pas, et ce qui les nomme ne jouerait jamais.',
          { n: ascii.length, list: show(ascii) },
        )
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function listPups(root: string, rel = '', depth = 0): string[] {
  const out: string[] = [];
  for (const e of readDirents(path.join(root, rel))) {
    const r = path.join(rel, e.name);
    if (e.isFile() && e.name.toLowerCase().endsWith('.pup')) out.push(r);
    else if (e.isDirectory() && depth < 3 && !/^pupcapture$/i.test(e.name)) out.push(...listPups(root, r, depth + 1));
  }
  return out;
}

function listFiles(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const e of readDirents(path.join(dir, rel))) {
    const r = rel ? `${rel}\\${e.name}` : e.name;
    if (e.isFile()) out.push(r);
    else if (e.isDirectory()) out.push(...listFiles(dir, r));
  }
  return out;
}

function readHead(file: string): Buffer {
  const head = Buffer.alloc(12);
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, head, 0, 12, 0);
  } catch {
    // Illisible : « other », jamais renommé pour son contenu.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return head;
}

function readDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
