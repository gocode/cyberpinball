// Recherche libre d'un média sur le web (docs/recherche/sources-medias.md § 7) : depuis
// l'écran d'un média, « Chercher moi-même sur le web… » ouvre la fenêtre « Récupérer »
// sur une recherche que l'utilisateur change à sa guise (web, images, vidéos, YouTube).
// Tout fichier qu'il y télécharge revient au média. Ce module dit ce qu'est ce fichier
// (son contenu, pas seulement son extension), s'il convient tel quel, s'il faut le
// convertir (image en PNG, son ou son d'une vidéo en WAV, découpé) ou pourquoi il est
// refusé. Aussi : l'en-tête WAV, la découpe d'un son, l'image de sa forme d'onde, et la
// sonde des pages vidéo (YouTube, Vimeo, Dailymotion, vidéo posée dans la page).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { isAcceptedFormat, mediaKind, mediaTypeInfo, type MediaKind, type MediaType } from './medias';
import { encodePng } from './png';
import { isJunkName } from './puppack';

// ---------------------------------------------------------------------------
// Moteurs de recherche

export type WebEngine = 'web' | 'images' | 'videos' | 'youtube';
export const WEB_ENGINES: readonly WebEngine[] = ['web', 'images', 'videos', 'youtube'];

export function webEngineLabel(engine: WebEngine): string {
  if (engine === 'images') return t('Images');
  if (engine === 'videos') return t('Vidéos');
  if (engine === 'youtube') return 'YouTube';
  return t('Web');
}

/**
 * Page de résultats d'un moteur pour un texte : DuckDuckGo (sans compte ni bandeau de
 * consentement à accepter) pour le web, les images et les vidéos ; YouTube pour ses vidéos.
 */
export function webEngineUrl(query: string, engine: WebEngine): string {
  const q = encodeURIComponent(query.trim());
  if (engine === 'youtube') return `https://www.youtube.com/results?search_query=${q}`;
  if (engine === 'images') return `https://duckduckgo.com/?q=${q}&ia=images&iax=images`;
  if (engine === 'videos') return `https://duckduckgo.com/?q=${q}&ia=videos&iax=videos`;
  return `https://duckduckgo.com/?q=${q}`;
}

/** Moteur et texte d'une page de résultats d'un des moteurs, pour remplir le champ de recherche. */
export function webSearchOf(url: string): { engine: WebEngine; query: string } | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' && u.pathname === '/results') {
    const query = u.searchParams.get('search_query');
    return query ? { engine: 'youtube', query } : undefined;
  }
  if (host === 'duckduckgo.com') {
    const query = u.searchParams.get('q');
    if (!query) return undefined;
    const ia = u.searchParams.get('ia');
    return { engine: ia === 'images' ? 'images' : ia === 'videos' ? 'videos' : 'web', query };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Ce qu'est un fichier reçu

export type SniffKind = 'image' | 'video' | 'audio' | 'archive' | 'html' | 'unknown';

/** Nature d'un fichier d'après ses premiers octets, et son format (extension qui lui revient). */
export interface Sniffed {
  kind: SniffKind;
  format?: string;
}

/**
 * Lit les premiers octets : un site qui renvoie sa page (« Error », connexion) sous le nom
 * d'un .mp3 se reconnaît, comme une vidéo WebM nommée .mp4 ou un son seul dans un .mp4.
 */
export function sniffMedia(file: string): Sniffed {
  let head: Buffer;
  try {
    const fd = fs.openSync(file, 'r');
    head = Buffer.alloc(512);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    fs.closeSync(fd);
    head = head.subarray(0, n);
  } catch {
    return { kind: 'unknown' };
  }
  return sniffBytes(head);
}

export function sniffBytes(head: Buffer): Sniffed {
  const ascii = head.toString('latin1');
  const b = (i: number) => head[i] ?? -1;
  if (b(0) === 0x89 && ascii.slice(1, 4) === 'PNG') return { kind: 'image', format: /acTL/.test(ascii.slice(0, 200)) ? 'apng' : 'png' };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { kind: 'image', format: 'jpg' };
  if (ascii.startsWith('GIF8')) return { kind: 'image', format: 'gif' };
  if (ascii.startsWith('RIFF')) {
    const form = ascii.slice(8, 12);
    if (form === 'WEBP') return { kind: 'image', format: 'webp' };
    if (form === 'WAVE') return { kind: 'audio', format: 'wav' };
    if (form === 'AVI ') return { kind: 'video', format: 'avi' };
  }
  if (ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 12);
    if (brand === 'avif' || brand === 'avis') return { kind: 'image', format: 'avif' };
    if (brand === 'M4A ' || brand === 'M4B ') return { kind: 'audio', format: 'm4a' };
    if (brand === 'qt  ') return { kind: 'video', format: 'mov' };
    if (brand === 'M4V ') return { kind: 'video', format: 'm4v' };
    return { kind: 'video', format: 'mp4' };
  }
  if (b(0) === 0x1a && b(1) === 0x45 && b(2) === 0xdf && b(3) === 0xa3) return { kind: 'video', format: ascii.includes('webm') ? 'webm' : 'mkv' };
  if (ascii.startsWith('ID3')) return { kind: 'audio', format: 'mp3' };
  if (ascii.startsWith('OggS')) return { kind: 'audio', format: 'ogg' };
  if (ascii.startsWith('fLaC')) return { kind: 'audio', format: 'flac' };
  if (ascii.startsWith('FLV')) return { kind: 'video', format: 'flv' };
  if (b(0) === 0x30 && b(1) === 0x26 && b(2) === 0xb2 && b(3) === 0x75) return { kind: 'video', format: 'asf' };
  // Trame MPEG : couche 00 pour l'AAC (ADTS), sinon MP3.
  if (b(0) === 0xff && (b(1) & 0xe0) === 0xe0) return { kind: 'audio', format: (b(1) & 0x06) === 0 ? 'aac' : 'mp3' };
  if (ascii.startsWith('PK\x03\x04')) return { kind: 'archive', format: 'zip' };
  if (b(0) === 0x37 && b(1) === 0x7a && b(2) === 0xbc && b(3) === 0xaf) return { kind: 'archive', format: '7z' };
  if (ascii.startsWith('Rar!')) return { kind: 'archive', format: 'rar' };
  if (ascii.startsWith('BM') && head.length > 14) return { kind: 'image', format: 'bmp' };
  if (b(0) === 0 && b(1) === 0 && b(2) === 1 && b(3) === 0) return { kind: 'image', format: 'ico' };
  const text = ascii.replace(/^﻿|^\xEF\xBB\xBF/, '').trimStart().slice(0, 300).toLowerCase();
  if (text.startsWith('<!doctype html') || text.startsWith('<html') || (text.startsWith('<') && /<(head|body|title|meta|script)[\s>]/.test(text))) return { kind: 'html', format: 'html' };
  return { kind: 'unknown' };
}

/** Images que le navigateur intégré décode et redessine en PNG. */
const CONVERTIBLE_IMAGES = new Set(['png', 'apng', 'webp', 'gif', 'jpg', 'jpeg', 'jfif', 'bmp', 'avif', 'ico']);
/** Sons que le navigateur intégré décode (le WMA n'en est pas). */
const DECODABLE_AUDIO = new Set(['mp3', 'ogg', 'oga', 'opus', 'm4a', 'm4b', 'aac', 'flac', 'wav', 'weba', 'mka']);
/** Vidéos dont le navigateur intégré sait extraire le son. */
const AUDIO_FROM_VIDEO = new Set(['mp4', 'm4v', 'webm', 'mkv', 'mov']);
/** Extensions sans nature dans medias.ts, par nature. */
const EXTRA_KINDS: Record<string, MediaKind> = {
  jfif: 'image',
  bmp: 'image',
  avif: 'image',
  ico: 'image',
  oga: 'audio',
  opus: 'audio',
  aac: 'audio',
  weba: 'audio',
  mka: 'audio',
  m4b: 'audio',
  wma: 'audio',
  mkv: 'video',
  asf: 'video',
};

/** Noms qui désignent une variante du conteneur que montrent les premiers octets. */
const SAME_CONTAINER: Record<string, readonly string[]> = {
  jpg: ['jpeg', 'jfif'],
  png: ['apng'],
  mp4: ['m4a', 'm4b', 'm4v'],
  ogg: ['oga', 'opus'],
  webm: ['weba', 'mka'],
  mkv: ['mka', 'webm', 'weba'],
};

/** Ce qu'il faut faire d'un fichier reçu pour un média. */
export type WebFileVerdict =
  | {
      status: 'accepted';
      kind: MediaKind;
      /** Extension à donner au fichier quand son nom ment sur son contenu (WebM nommé .mp4). */
      ext?: string;
    }
  | {
      status: 'convert';
      kind: MediaKind;
      /** Format produit. */
      to: 'png' | 'wav';
      /** Ce qui est converti : une image redessinée, un son décodé, le son d'une vidéo. */
      from: 'image' | 'audio' | 'video';
    }
  | { status: 'refused'; reason: string };

const extOf = (file: string) => path.extname(file).slice(1).toLowerCase();

function kindLabel(kind: MediaKind): string {
  return kind === 'image' ? t('une image') : kind === 'audio' ? t('un son') : t('une vidéo');
}

/**
 * Le fichier convient-il au média, faut-il le convertir, ou pourquoi est-il refusé ?
 * Le contenu prime sur le nom : une page web sauvée en .mp3 est refusée, une vidéo WebM
 * nommée .mp4 est rangée en .webm. Conversions sans outil externe, par le navigateur
 * intégré : image en PNG ; son, ou son d'une vidéo, en WAV (découpé, pour la musique).
 * Une vidéo dans un format que le menu ne lit pas n'est pas convertie : il faudrait
 * un outil externe (ffmpeg).
 */
export function judgeWebFile(file: string, type: MediaType): WebFileVerdict {
  const info = mediaTypeInfo(type);
  const sniffed = sniffMedia(file);
  const named = extOf(file);
  if (sniffed.kind === 'html') return { status: 'refused', reason: t('page web enregistrée sous un nom de fichier : le site a renvoyé une page au lieu du fichier') };
  if (sniffed.kind === 'archive') return { status: 'refused', reason: t('archive restée fermée') };
  // Le contenu dit le format, sauf quand le nom en précise une variante du même conteneur
  // (« .jpeg », « .m4a » pour un MP4 sans image, « .opus » pour un Ogg, « .weba » pour un WebM).
  const variant = Boolean(sniffed.format && SAME_CONTAINER[sniffed.format]?.includes(named));
  const format = sniffed.format && !variant ? sniffed.format : named;
  const media = (k: SniffKind): k is MediaKind => k === 'image' || k === 'video' || k === 'audio';
  const kind: MediaKind | undefined = media(sniffed.kind) && !variant ? sniffed.kind : (mediaKind(file) ?? EXTRA_KINDS[named]);
  if (!kind) return { status: 'refused', reason: named ? t('format inconnu (.{ext})', { ext: named }) : t('format inconnu') };
  const accepts = (k: MediaKind) => info.formats.some((f) => mediaKind(`x.${f}`) === k);
  const accepted = isAcceptedFormat(type, `x.${format}`);
  const wrong = (): WebFileVerdict => ({ status: 'refused', reason: t('{what}, alors que « {label} » demande : {formats}', { what: kindLabel(kind), label: info.label, formats: info.formats.join(', ') }) });
  if (kind === 'image') {
    if (accepted) return { status: 'accepted', kind, ...(format !== named ? { ext: format } : {}) };
    if (accepts('image') && CONVERTIBLE_IMAGES.has(format)) return { status: 'convert', kind, to: 'png', from: 'image' };
    return wrong();
  }
  if (kind === 'audio') {
    if (accepted) return { status: 'accepted', kind, ...(format !== named ? { ext: format } : {}) };
    if (!accepts('audio')) return wrong();
    if (DECODABLE_AUDIO.has(format)) return { status: 'convert', kind, to: 'wav', from: 'audio' };
    return { status: 'refused', reason: t('son .{ext} que le navigateur intégré ne sait pas lire', { ext: format }) };
  }
  // Une vidéo.
  if (accepted && accepts('video')) return { status: 'accepted', kind, ...(format !== named ? { ext: format } : {}) };
  if (accepts('audio')) {
    if (AUDIO_FROM_VIDEO.has(format)) return { status: 'convert', kind, to: 'wav', from: 'video' };
    return { status: 'refused', reason: t('vidéo .{ext} dont le navigateur intégré ne sait pas lire le son', { ext: format }) };
  }
  if (accepts('video')) return { status: 'refused', reason: t('vidéo .{ext} que le menu ne lit pas ; la convertir demanderait un outil externe (ffmpeg)', { ext: format }) };
  return wrong();
}

/** Un fichier d'un envoi déballé, jugé pour le média d'où la recherche est partie. */
export interface JudgedFile {
  file: string;
  verdict: WebFileVerdict;
}

/** Chaque fichier d'un envoi déballé (sous-dossiers compris), jugé pour ce média ; les fichiers de système ignorés. */
export function judgeWebFiles(root: string, type: MediaType): JudgedFile[] {
  const out: JudgedFile[] = [];
  const walk = (dir: string) => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (isJunkName(d.name) || /^(thumbs\.db|desktop\.ini)$/i.test(d.name)) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.isFile()) out.push({ file: p, verdict: judgeWebFile(p, type) });
    }
  };
  walk(root);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Fichiers de Téléchargements de Windows qui peuvent concerner une recherche de média :
 * médias et archives. Le reste (un PDF, un installateur) arrive là pour autre chose.
 */
export function isMediaDownload(name: string): boolean {
  const ext = extOf(name);
  return Boolean(mediaKind(name) || EXTRA_KINDS[ext] || ['zip', '7z', 'rar'].includes(ext));
}

// ---------------------------------------------------------------------------
// WAV, découpe

/** Fichier WAV (PCM 16 bits) autour d'échantillons entrelacés. */
export function wavFile(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Caractéristiques d'un WAV PCM simple (en-tête de 44 octets) ; undefined sinon. */
export function wavInfo(buf: Buffer): { sampleRate: number; channels: number; bits: number; seconds: number } | undefined {
  if (buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE' || buf.toString('latin1', 36, 40) !== 'data') return undefined;
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  const bytes = buf.readUInt32LE(40);
  return { sampleRate, channels, bits, seconds: bytes / (sampleRate * channels * (bits / 8)) };
}

/** Partie d'un son gardée : début et fin en secondes, fondu de fin. */
export interface AudioTrim {
  start: number;
  end: number;
  fade: boolean;
}

/** Pas de réglage du début et de la fin, en secondes. */
export const TRIM_STEPS: readonly number[] = [1, 5, 15];
/** Longueur minimale d'un extrait. */
export const TRIM_MIN = 1;
/** Durée du fondu de fin. */
export const TRIM_FADE = 2;

/** Découpe ramenée dans le son : 0 ≤ début < fin ≤ durée, au moins TRIM_MIN seconde. */
export function clampTrim(trim: AudioTrim, duration: number): AudioTrim {
  const total = Math.max(0, duration);
  const min = Math.min(TRIM_MIN, total);
  const end = Math.min(total, Math.max(min, trim.end));
  const start = Math.max(0, Math.min(trim.start, end - min));
  return { start: round(start), end: round(end), fade: trim.fade };
}

const round = (s: number) => Math.round(s * 10) / 10;

/**
 * Découpe proposée d'abord : le son de lancement est bref (les dix premières secondes) ;
 * la musique de présentation, jouée en boucle tant que la table est choisie, garde tout
 * jusqu'à trois minutes, avec un fondu si elle est coupée.
 */
export function defaultTrim(type: MediaType, duration: number): AudioTrim {
  const cap = type === 'AudioLaunch' ? 10 : 180;
  return clampTrim({ start: 0, end: Math.min(duration, cap), fade: duration > cap }, duration);
}

/** « 1:05 », « 0:07 », « 12:30 » ; avec les dixièmes quand ils comptent (« 0:07,5 »). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, round(seconds));
  const whole = Math.floor(s);
  const tenth = Math.round((s - whole) * 10);
  const clock = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  return tenth ? `${clock}${t(',')}${tenth}` : clock;
}

// ---------------------------------------------------------------------------
// Forme d'onde

/** Couleurs de la direction artistique (app/renderer/theme.css). */
const WAVE_COLORS = {
  void: [0x04, 0x0b, 0x0a],
  band: [0x10, 0x22, 0x14],
  axis: [0x17, 0x30, 0x2b],
  outside: [0x24, 0x50, 0x4a],
  inside: [0x8b, 0xe2, 0x3a],
  fade: [0x5f, 0x9c, 0x2c],
} as const;

/**
 * Image de la forme d'onde d'un son (pics de 0 à 1), la partie gardée en vert signal sur
 * une bande éclairée, le reste en sarcelle éteinte, deux traits aux bords de l'extrait.
 * `start` et `end` : bords de l'extrait, en fraction de la durée ; `fade` : fraction où
 * commence le fondu de fin.
 */
export function waveformPng(peaks: number[], opts: { width: number; height: number; start?: number; end?: number; fade?: number }): Buffer {
  const { width, height } = opts;
  const data = Buffer.alloc(width * height * 4);
  const set = (x: number, y: number, [r, g, b]: readonly number[]) => data.set([r!, g!, b!, 255], (y * width + x) * 4);
  const start = Math.round((opts.start ?? 0) * (width - 1));
  const end = Math.round((opts.end ?? 1) * (width - 1));
  const fade = opts.fade !== undefined ? Math.round(opts.fade * (width - 1)) : undefined;
  const middle = Math.floor(height / 2);
  for (let x = 0; x < width; x++) {
    const inside = x >= start && x <= end;
    const ground = inside ? WAVE_COLORS.band : WAVE_COLORS.void;
    for (let y = 0; y < height; y++) set(x, y, ground);
    set(x, middle, WAVE_COLORS.axis);
    // Pic de la colonne : le plus fort des pics qu'elle couvre.
    const from = Math.floor((x / width) * peaks.length);
    const to = Math.max(from + 1, Math.floor(((x + 1) / width) * peaks.length));
    let peak = 0;
    for (let i = from; i < to && i < peaks.length; i++) peak = Math.max(peak, Math.abs(peaks[i] ?? 0));
    const half = Math.round(Math.min(1, peak) * (height / 2 - 2));
    const color = !inside ? WAVE_COLORS.outside : fade !== undefined && x >= fade ? WAVE_COLORS.fade : WAVE_COLORS.inside;
    for (let y = middle - half; y <= middle + half; y++) set(x, y, color);
  }
  for (const x of [start, end]) for (let y = 0; y < height; y++) for (const dx of [0, 1]) if (x + dx < width) set(x + dx, y, WAVE_COLORS.inside);
  return encodePng({ width, height, data });
}

// ---------------------------------------------------------------------------
// Pages vidéo

export type VideoSite = 'youtube' | 'vimeo' | 'dailymotion' | 'other';

/** Ce que la sonde voit d'une page vidéo. */
export interface VideoPage {
  site: VideoSite;
  title: string;
  url: string;
  /** Durée en secondes, si la page la donne. */
  duration?: number;
  /** Adresse du fichier de la vidéo, quand la page le lit directement (ni flux découpé, ni blob:). */
  direct?: string;
  /** Membre connecté au site (YouTube) ; absent quand la page ne le dit pas. */
  member?: boolean;
}

export function videoSiteName(site: VideoSite): string {
  if (site === 'youtube') return 'YouTube';
  if (site === 'vimeo') return 'Vimeo';
  if (site === 'dailymotion') return 'Dailymotion';
  return t('page web');
}

/**
 * Sonde d'une page : vidéo de YouTube (watch, shorts, youtu.be), de Vimeo, de Dailymotion,
 * ou élément <video> d'une autre page. Lue dans la page affichée, après son chargement et à
 * chaque navigation interne (YouTube ne recharge pas la page d'une vidéo à l'autre, et ne
 * met pas à jour ses balises meta : le titre et la durée se lisent d'abord dans la page
 * vivante). Rien n'est cliqué.
 */
export const VIDEO_PAGE_PROBE = /* i18n-ignore : script de la page, motifs */ String.raw`(() => {
  const host = location.hostname.replace(/^(www|m)\./, '');
  const meta = (sel) => { const e = document.querySelector(sel); const v = e && e.getAttribute('content'); return v ? v.trim() : undefined; };
  const iso = (v) => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(v || ''); return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : undefined; };
  const videos = Array.from(document.querySelectorAll('video'));
  const playing = videos.find((v) => typeof v.duration === 'number' && isFinite(v.duration) && v.duration > 0);
  const main = playing || videos[0];
  let site = 'other';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host === 'youtube-nocookie.com') site = 'youtube';
  else if (host === 'vimeo.com' || host === 'player.vimeo.com') site = 'vimeo';
  else if (host === 'dailymotion.com' || host === 'dai.ly') site = 'dailymotion';
  const path = location.pathname;
  const watch = site === 'youtube' ? (/[?&]v=[\w-]{6,}/.test(location.search) || /^\/(shorts|live|embed)\/[\w-]{6,}/.test(path) || (host === 'youtu.be' && path.length > 6))
    : site === 'vimeo' ? /^\/(video\/)?\d+/.test(path)
    : site === 'dailymotion' ? /^\/(video|embed\/video)\//.test(path) || host === 'dai.ly'
    : Boolean(main && (main.getAttribute('src') || main.querySelector('source[src]')));
  if (!watch) return { kind: 'none' };
  const text = (sel) => { const e = document.querySelector(sel); return e && e.textContent ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  let title = site === 'youtube' ? text('h1.ytd-watch-metadata yt-formatted-string') || text('h1.ytd-watch-metadata') || text('ytd-reel-player-header-renderer h2') : '';
  if (site === 'other') title = meta('meta[property="og:title"]') || text('h1');
  if (!title) title = (document.title || '').replace(/^\(\d+\)\s*/, '').replace(/\s*(?:[-|–]|\son)\s*(YouTube|Vimeo|Dailymotion)\s*$/i, '').trim() || meta('meta[property="og:title"]') || '';
  let duration = playing ? playing.duration : undefined;
  if (duration === undefined) duration = iso(meta('meta[itemprop="duration"]')) || (+meta('meta[property="video:duration"]') || undefined);
  let direct;
  if (main) {
    const source = main.querySelector('source[src]');
    const src = main.currentSrc || main.getAttribute('src') || (source ? source.getAttribute('src') : '');
    if (src) { try { direct = new URL(src, location.href).href; } catch (e) { direct = undefined; } }
  }
  let member;
  if (site === 'youtube') {
    if (document.querySelector('#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn')) member = true;
    else if (document.querySelector('a[href*="ServiceLogin"], ytd-button-renderer a[aria-label="Sign in"]')) member = false;
  }
  return { kind: 'video', site, title, url: location.href, duration, direct, member };
})()`;

/** Résultat de la sonde, vérifié : undefined si la page n'est pas une page vidéo, ou si le résultat ne tient pas debout. */
export function checkVideoPage(raw: unknown): VideoPage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'video' || typeof r.url !== 'string') return undefined;
  const site: VideoSite = r.site === 'youtube' || r.site === 'vimeo' || r.site === 'dailymotion' ? r.site : 'other';
  const page: VideoPage = { site, title: typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 200) : r.url, url: r.url };
  if (typeof r.duration === 'number' && Number.isFinite(r.duration) && r.duration > 0) page.duration = Math.round(r.duration * 10) / 10;
  // Un fichier lu directement, seulement par http(s) : un flux découpé (blob:, MediaSource) ne se télécharge pas.
  if (typeof r.direct === 'string' && /^https?:\/\//i.test(r.direct) && site !== 'youtube') page.direct = r.direct;
  if (typeof r.member === 'boolean') page.member = r.member;
  return page;
}
