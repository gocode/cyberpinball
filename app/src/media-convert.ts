// Conversions des fichiers reçus de la recherche libre, sans outil externe : le moteur de Chromium d'Electron décode, dans une page
// cachée (une vue sans fenêtre, jamais affichée), ce que le menu ne lit pas.
//
// - Image (jpg pour le logo, bmp, avif, ico…) : redessinée en PNG.
// - Son (opus, aac, webm…) ou son d'une vidéo (mp4, webm, mkv, mov) : décodé, découpé
//   (début, fin, fondu de fin), écrit en WAV 16 bits à 44,1 kHz.
// - Analyse d'un son : durée, voies, et les pics qui dessinent sa forme d'onde.
// - Son encodé en Opus (WebCodecs), mis en Ogg ici : la musique tirée des ROM (rom-music.ts).
// - Images d'un média (une image, ou quelques moments d'une vidéo), en pixels : le cadre du
//   DMD d'un FullDMD y est cherché (fulldmdframe.ts).
// - Avatar d'un joueur (avatar-menu.ts) : l'image de travail, réduite (une photo de 12 Mpx) et
//   redessinée en JPEG, puis le carré gardé à la taille de l'avatar. Redessinée, une photo perd
//   ses métadonnées (EXIF, position GPS) ; createImageBitmap applique son orientation.
//
// La page vit dans une session à part dont toutes les adresses https sont servies ici :
// elle lit le fichier source par /in/<n> et rend le résultat par /out/<n>. Elle n'atteint
// pas le réseau. Le dernier son décodé reste en mémoire dans la page : régler la découpe
// ne relit pas le fichier.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { session, WebContentsView } from 'electron';
import { mediaContentType, mediaKind, mp4VideoTrack, oggOpusFile, readWholeFile, t, wavFile, webmFile, writeFileAtomic, type AudioTrim, type EncodedFrame, type RgbaImage } from '@cyberpinball/core';
import { MEDIA_FRAMES_SCRIPT } from './media-frames-script';

const PARTITION = 'cyberpinball-conversion';
const ORIGIN = 'https://conversion.cyberpinball.invalid';
/** Au-delà, une conversion est abandonnée (un son de plusieurs heures, une page bloquée). */
const TIMEOUT_MS = 180_000;
/** Pics calculés pour la forme d'onde. */
export const WAVE_PEAKS = 600;

/** Ce que l'analyse d'un son en dit. */
export interface AudioProbe {
  duration: number;
  channels: number;
  sampleRate: number;
  /** Pics de 0 à 1, WAVE_PEAKS valeurs. */
  peaks: number[];
}

// Script de la page de conversion. OfflineAudioContext décode sans carte son, et rééchantillonne
// à 44,1 kHz ; decodeAudioData lit aussi le son d'une vidéo (première piste).
// encodeOpus : le son encodé en Opus (WebCodecs) à 48 kHz (decodeAudioData rééchantillonne à la
// fréquence du contexte) ; les paquets reviennent bout à bout, chacun précédé de sa longueur sur
// 4 octets, avec le délai de l'encodeur (en-tête OpusHead qu'il rend, sinon 312, celui de libopus) ;
// le conteneur Ogg est écrit par le processus principal (oggOpusFile).
// shrinkVideo : images décodées une à une par WebCodecs (VideoDecoder), depuis les positions que Cyber Pinball a lues
// dans le MP4 (mp4track.ts), redessinées à la taille du DMD et encodées en VP8 ; une page cachée ne lit pas les vidéos,
// et un saut par image redécode depuis l'image clé précédente (78 s pour 8 s de vidéo, 18/11/2026).
const PAGE = `<!doctype html><meta charset="utf-8"><title>conversion</title><script>
let cache = { id: '', buffer: null };
async function decode(id) {
  if (cache.id === id && cache.buffer) return cache.buffer;
  const data = await (await fetch('/in/' + id)).arrayBuffer();
  const buffer = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(data);
  cache = { id, buffer };
  return buffer;
}
window.probeAudio = async (id, count) => {
  const b = await decode(id);
  const peaks = new Array(count).fill(0);
  const size = Math.max(1, Math.floor(b.length / count));
  for (let c = 0; c < b.numberOfChannels; c++) {
    const data = b.getChannelData(c);
    for (let i = 0; i < count; i++) {
      let peak = peaks[i];
      const end = Math.min(data.length, (i + 1) * size);
      for (let j = i * size; j < end; j += 4) { const v = Math.abs(data[j]); if (v > peak) peak = v; }
      peaks[i] = peak;
    }
  }
  return { duration: b.duration, channels: b.numberOfChannels, sampleRate: b.sampleRate, peaks: peaks.map((p) => Math.round(Math.min(1, p) * 1000) / 1000) };
};
window.extractAudio = async (id, out, start, end, fade) => {
  const b = await decode(id);
  const channels = Math.min(2, b.numberOfChannels);
  const rate = b.sampleRate;
  const from = Math.max(0, Math.floor(start * rate));
  const to = Math.min(b.length, Math.floor(end * rate));
  const frames = Math.max(0, to - from);
  const fadeFrames = fade ? Math.min(frames, Math.floor(fade * rate)) : 0;
  const pcm = new Int16Array(frames * channels);
  for (let c = 0; c < channels; c++) {
    const data = b.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      const left = frames - i;
      const gain = left < fadeFrames ? left / fadeFrames : 1;
      const s = Math.max(-1, Math.min(1, data[from + i] * gain));
      pcm[i * channels + c] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }
  await fetch('/out/' + out + '?rate=' + rate + '&channels=' + channels, { method: 'POST', body: pcm.buffer });
  return { frames };
};
window.encodeOpus = async (id, out, bitrate) => {
  const data = await (await fetch('/in/' + id)).arrayBuffer();
  const b = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(data);
  const channels = Math.min(2, b.numberOfChannels);
  const packets = [];
  let head = null;
  let failure = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      packets.push(bytes);
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d && !head) head = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset || 0, (d.byteOffset || 0) + d.byteLength) : d);
    },
    error: (e) => (failure = e),
  });
  encoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: channels, bitrate });
  const step = 48000;
  for (let off = 0; off < b.length; off += step) {
    const n = Math.min(step, b.length - off);
    const planar = new Float32Array(n * channels);
    for (let c = 0; c < channels; c++) planar.set(b.getChannelData(c).subarray(off, off + n), c * n);
    encoder.encode(new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((off * 1e6) / 48000), data: planar }));
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  let size = 0;
  for (const p of packets) size += 4 + p.length;
  const all = new Uint8Array(size);
  const view = new DataView(all.buffer);
  let at = 0;
  for (const p of packets) { view.setUint32(at, p.length, true); all.set(p, at + 4); at += 4 + p.length; }
  const preSkip = head && head.length >= 12 && String.fromCharCode(...head.slice(0, 8)) === 'OpusHead' ? head[10] | (head[11] << 8) : 312;
  await fetch('/out/' + out + '?channels=' + channels + '&samples=' + b.length + '&preskip=' + preSkip, { method: 'POST', body: all.buffer });
  return { packets: packets.length };
};
window.toPng = async (id, out) => {
  const blob = await (await fetch('/in/' + id)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const png = await canvas.convertToBlob({ type: 'image/png' });
  await fetch('/out/' + out, { method: 'POST', body: png });
  return { width: bitmap.width, height: bitmap.height };
};
window.fitJpeg = async (id, out, maxSide, quality) => {
  const blob = await (await fetch('/in/' + id)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  await fetch('/out/' + out, { method: 'POST', body: jpeg });
  return { width: w, height: h };
};
window.fitWebp = async (id, out, maxSide, type, quality) => {
  const blob = await (await fetch('/in/' + id)).blob();
  if (typeof ImageDecoder === 'function' && type && (await ImageDecoder.isTypeSupported(type))) {
    const decoder = new ImageDecoder({ data: blob.stream(), type });
    try {
      await decoder.tracks.ready;
      if (decoder.tracks.selectedTrack && decoder.tracks.selectedTrack.animated) return { kept: 'animated' };
    } finally {
      decoder.close();
    }
  }
  const bitmap = await createImageBitmap(blob);
  const side = Math.max(bitmap.width, bitmap.height);
  if (side <= maxSide) {
    bitmap.close();
    return { kept: 'small' };
  }
  const w = Math.max(1, Math.round((bitmap.width * maxSide) / side));
  const h = Math.max(1, Math.round((bitmap.height * maxSide) / side));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
  await fetch('/out/' + out, { method: 'POST', body: webp });
  return { width: w, height: h };
};
window.cropJpeg = async (id, out, x, y, side, size, quality) => {
  const blob = await (await fetch('/in/' + id)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, x, y, side, side, 0, 0, size, size);
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  await fetch('/out/' + out, { method: 'POST', body: jpeg });
  return { width: size, height: size };
};
window.shrinkVideo = async (id, out, width, height, fps, track) => {
  const bytes = new Uint8Array(await (await fetch('/in/' + id)).arrayBuffer());
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const chunks = [];
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); chunks.push({ bytes: b, key: chunk.type === 'key', ts: chunk.timestamp }); },
    error: (e) => (failure = e),
  });
  encoder.configure({ codec: 'vp8', width, height, bitrate: 400000, framerate: fps });
  const count = Math.max(1, Math.round((track.durationUs / 1e6) * fps));
  const startUs = Math.min(...track.samples.map((s) => s.ctsUs));
  let emitted = 0;
  let drawn = false;
  const emitUntil = (seconds) => {
    while (drawn && emitted < count && emitted / fps <= seconds + 1e-6) {
      const frame = new VideoFrame(canvas, { timestamp: Math.round((emitted * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: emitted % fps === 0 });
      frame.close();
      emitted++;
    }
  };
  const decoder = new VideoDecoder({
    output: (frame) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(frame, 0, 0, width, height);
      drawn = true;
      emitUntil((frame.timestamp - startUs) / 1e6);
      frame.close();
    },
    error: (e) => (failure = e),
  });
  const description = Uint8Array.from(atob(track.description), (c) => c.charCodeAt(0));
  decoder.configure({ codec: track.codec, description, codedWidth: track.width, codedHeight: track.height });
  for (const s of track.samples) {
    if (failure) break;
    decoder.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.ctsUs, duration: s.durationUs, data: bytes.subarray(s.offset, s.offset + s.size) }));
    while (decoder.decodeQueueSize > 16) await new Promise((r) => setTimeout(r, 1));
  }
  await decoder.flush();
  decoder.close();
  emitUntil(track.durationUs / 1e6);
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  let size = 0;
  for (const c of chunks) size += 13 + c.bytes.length;
  const all = new Uint8Array(size);
  const view = new DataView(all.buffer);
  let at = 0;
  for (const c of chunks) {
    view.setUint32(at, c.bytes.length, true);
    all[at + 4] = c.key ? 1 : 0;
    view.setFloat64(at + 5, c.ts, true);
    all.set(c.bytes, at + 13);
    at += 13 + c.bytes.length;
  }
  await fetch('/out/' + out + '?duration=' + Math.round(track.durationUs / 1000), { method: 'POST', body: all.buffer });
  return { frames: chunks.length };
};
${MEDIA_FRAMES_SCRIPT}
</script>`;

// Une seule page et un seul gestionnaire par processus : la session de conversion est partagée,
// et son gestionnaire https ne s'enregistre qu'une fois. Un second convertisseur (une seconde
// bibliothèque, dans les essais) qui gardait ses propres listes n'était jamais servi.
const hiddenViews = new Set<WebContentsView>();
let view: WebContentsView | undefined;
let loading: Promise<WebContentsView> | undefined;
/** Fichiers que la page peut lire : identifiant -> chemin. */
const inputs = new Map<string, string>();
/** Résultats rendus par la page : identifiant -> contenu et paramètres. */
const outputs = new Map<string, { data: Buffer; query: URLSearchParams }>();
let next = 0;

export function createConverter() {
  /** Identifiant stable d'un fichier (chemin, taille, date) : la page garde le son déjà décodé. */
  function inputId(file: string): string {
    const stat = fs.statSync(file);
    const id = crypto.createHash('sha1').update(`${path.resolve(file)}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 16);
    inputs.set(id, file);
    return id;
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return new Response(null, { status: 404 });
    if (url.pathname === '/') return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    const input = /^\/in\/(\w+)$/.exec(url.pathname);
    if (input) {
      const file = inputs.get(input[1]!);
      if (!file || !fs.existsSync(file)) return new Response(null, { status: 404 });
      return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { 'content-type': 'application/octet-stream' } });
    }
    const output = /^\/out\/(\w+)$/.exec(url.pathname);
    if (output && request.method === 'POST') {
      outputs.set(output[1]!, { data: Buffer.from(await request.arrayBuffer()), query: url.searchParams });
      return new Response('ok');
    }
    return new Response(null, { status: 404 });
  }

  function page(): Promise<WebContentsView> {
    if (view && !view.webContents.isDestroyed()) return Promise.resolve(view);
    loading ??= (async () => {
      const s = session.fromPartition(PARTITION);
      if (!s.protocol.isProtocolHandled('https')) s.protocol.handle('https', handle);
      const v = new WebContentsView({ webPreferences: { session: s, offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
      // Aucune fenêtre ne la porte : gardée ici, sinon le ramasse-miettes la détruirait (acquire-window.ts, hiddenViews).
      hiddenViews.add(v);
      v.webContents.once('destroyed', () => hiddenViews.delete(v));
      v.webContents.once('render-process-gone', () => {
        if (view === v) view = undefined;
        if (!v.webContents.isDestroyed()) v.webContents.close();
      });
      v.webContents.setAudioMuted(true);
      v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      try {
        await v.webContents.loadURL(`${ORIGIN}/`);
      } catch (error) {
        if (!v.webContents.isDestroyed()) v.webContents.close();
        throw error;
      }
      view = v;
      return v;
    })().finally(() => (loading = undefined));
    return loading;
  }

  async function run<T>(script: string): Promise<T> {
    const v = await page();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        v.webContents.executeJavaScript(script, true) as Promise<T>,
        new Promise<never>((_r, reject) => (timer = setTimeout(() => {
          reject(new Error(t('délai dépassé')));
          // Le minuteur de la page ne peut pas tourner si son rendu est figé. Ne pas réutiliser
          // cette page, ni laisser les conversions suivantes s'accumuler derrière elle.
          if (view === v) view = undefined;
          if (!v.webContents.isDestroyed()) v.webContents.close();
        }, TIMEOUT_MS))),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Message court d'une erreur de la page (« Unable to decode audio data » n'apprend rien à l'utilisateur). */
  function failure(error: unknown, what: 'audio' | 'image'): Error {
    const message = (error as Error)?.message ?? String(error);
    if (/media frame timeout/.test(message)) return new Error(t('délai dépassé'));
    if (/decode|EncodingError|InvalidStateError|source image/i.test(message)) return new Error(what === 'audio' ? t('le navigateur intégré n’a pas su lire ce son') : t('le navigateur intégré n’a pas su lire cette image'));
    return new Error(message.split('\n')[0]!);
  }

  /** Durée, voies et forme d'onde d'un son (ou du son d'une vidéo). */
  async function probeAudio(file: string): Promise<AudioProbe> {
    const id = inputId(file);
    try {
      return await run<AudioProbe>(`probeAudio(${JSON.stringify(id)}, ${WAVE_PEAKS})`);
    } catch (error) {
      throw failure(error, 'audio');
    }
  }

  /** Son (ou son d'une vidéo) découpé, écrit en WAV dans `out`. */
  async function audioToWav(file: string, out: string, trim: AudioTrim, fadeSeconds: number): Promise<void> {
    const id = inputId(file);
    const key = `w${next++}`;
    try {
      await run(`extractAudio(${JSON.stringify(id)}, ${JSON.stringify(key)}, ${trim.start}, ${trim.end}, ${trim.fade ? fadeSeconds : 0})`);
    } catch (error) {
      throw failure(error, 'audio');
    }
    const got = outputs.get(key);
    outputs.delete(key);
    if (!got) throw new Error(t('conversion sans résultat'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, wavFile(got.data, Number(got.query.get('rate')), Number(got.query.get('channels'))));
  }

  /**
   * Son (un WAV, ou tout son que Chromium lit) encodé en Opus et écrit en Ogg dans `out`
   * (musique de la ROM, rom-music.ts) : le format des autres musiques du menu, dix fois moins
   * lourd qu'un WAV.
   */
  async function audioToOggOpus(file: string, out: string, bitrate = 96_000): Promise<{ seconds: number; bytes: number }> {
    const id = inputId(file);
    const key = `o${next++}`;
    try {
      await run(`encodeOpus(${JSON.stringify(id)}, ${JSON.stringify(key)}, ${bitrate})`);
    } catch (error) {
      throw failure(error, 'audio');
    }
    const got = outputs.get(key);
    outputs.delete(key);
    if (!got) throw new Error(t('conversion sans résultat'));
    const packets: Uint8Array[] = [];
    for (let at = 0; at + 4 <= got.data.length; ) {
      const length = got.data.readUInt32LE(at);
      packets.push(got.data.subarray(at + 4, at + 4 + length));
      at += 4 + length;
    }
    const samples = Number(got.query.get('samples'));
    const ogg = oggOpusFile({ channels: Number(got.query.get('channels')), inputRate: 48_000, preSkip: Number(got.query.get('preskip')), packets, samples });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    writeFileAtomic(out, ogg);
    return { seconds: samples / 48_000, bytes: ogg.length };
  }

  /** Image redessinée en PNG dans `out`. */
  async function imageToPng(file: string, out: string): Promise<{ width: number; height: number }> {
    const id = inputId(file);
    const key = `p${next++}`;
    let size: { width: number; height: number };
    try {
      size = await run(`toPng(${JSON.stringify(id)}, ${JSON.stringify(key)})`);
    } catch (error) {
      throw failure(error, 'image');
    }
    const got = outputs.get(key);
    outputs.delete(key);
    if (!got) throw new Error(t('conversion sans résultat'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, got.data);
    return size;
  }

  /**
   * Images d'un média, réduites à `maxWidth` de large : l'image elle-même, ou celles d'une vidéo
   * aux moments donnés (parts de sa durée). Pour chercher le cadre du DMD d'un FullDMD (fulldmdframe.ts).
   */
  async function mediaFrames(file: string, times: readonly number[], maxWidth = 960): Promise<{ width: number; height: number; images: RgbaImage[] }> {
    const id = inputId(file);
    const key = `f${next++}_`;
    const video = mediaKind(file) === 'video';
    let size: { width: number; height: number; count: number };
    try {
      size = await run(`framesOf(${JSON.stringify(id)}, ${video}, ${JSON.stringify(times)}, ${maxWidth}, ${JSON.stringify(key)})`);
    } catch (error) {
      for (let i = 0; i < times.length; i++) outputs.delete(`${key}${i}`);
      throw failure(error, 'image');
    }
    const images: RgbaImage[] = [];
    for (let i = 0; i < size.count; i++) {
      const got = outputs.get(`${key}${i}`);
      outputs.delete(`${key}${i}`);
      if (got) images.push({ width: Number(got.query.get('w')), height: Number(got.query.get('h')), data: got.data });
    }
    return { width: size.width, height: size.height, images };
  }

  /**
   * Image de travail d'un avatar : `file` (tout format que Chromium lit) réduite à `maxSide` pixels
   * de côté au plus, en JPEG dans `out` ; ses dimensions.
   */
  async function fitJpeg(file: string, out: string, maxSide: number, quality = 0.92): Promise<{ width: number; height: number }> {
    const id = inputId(file);
    const key = `j${next++}`;
    let size: { width: number; height: number };
    try {
      size = await run(`fitJpeg(${JSON.stringify(id)}, ${JSON.stringify(key)}, ${maxSide}, ${quality})`);
    } catch (error) {
      throw failure(error, 'image');
    }
    const got = outputs.get(key);
    outputs.delete(key);
    if (!got) throw new Error(t('conversion sans résultat'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, got.data);
    return size;
  }

  /** Le carré (`x`, `y`, `side`, en pixels de `file`) redessiné en JPEG de `size` pixels de côté : ses octets. */
  async function cropJpeg(file: string, rect: { x: number; y: number; side: number }, size: number, quality = 0.86): Promise<Buffer> {
    const id = inputId(file);
    const key = `c${next++}`;
    try {
      await run(`cropJpeg(${JSON.stringify(id)}, ${JSON.stringify(key)}, ${rect.x}, ${rect.y}, ${rect.side}, ${size}, ${quality})`);
    } catch (error) {
      throw failure(error, 'image');
    }
    const got = outputs.get(key);
    outputs.delete(key);
    if (!got) throw new Error(t('conversion sans résultat'));
    return got.data;
  }

  /**
   * Vidéo ramenée à `width` × `height` (la taille du DMD), en VP8 dans un WebM écrit à `out` (dmdvideos.ts) : le plugin
   * FlexDMD de VPX la décode en entier à chaque scène, une vidéo de la taille du DMD ne fige plus la partie.
   */
  async function shrinkVideo(file: string, out: string, width = 128, height = 32, fps = 30): Promise<{ frames: number; bytes: number }> {
    // Positions et instants des images, lus ici (mp4track.ts) : la page les décode une à une.
    // La vidéo entière est lue pour trouver ses images : au-delà de 1 Go, refusée avec un message clair.
    const track = mp4VideoTrack(readWholeFile(file, 1024 ** 3));
    if (!track) throw new Error(t('vidéo que Cyber Pinball ne sait pas réduire (seul le H.264 en MP4 l’est)'));
    const id = inputId(file);
    const key = `v${next++}`;
    const shown = { ...track, description: track.description.toString('base64') };
    try {
      await run(`shrinkVideo(${JSON.stringify(id)}, ${JSON.stringify(key)}, ${width}, ${height}, ${fps}, ${JSON.stringify(shown)})`);
    } catch (error) {
      throw failure(error, 'image');
    }
    const got = outputs.get(key);
    outputs.delete(key);
    if (!got) throw new Error(t('conversion sans résultat'));
    const frames: EncodedFrame[] = [];
    for (let at = 0; at + 13 <= got.data.length; ) {
      const length = got.data.readUInt32LE(at);
      frames.push({ data: got.data.subarray(at + 13, at + 13 + length), key: got.data[at + 4] === 1, timestampUs: got.data.readDoubleLE(at + 5) });
      at += 13 + length;
    }
    if (!frames.length || !frames[0]!.key) throw new Error(t('conversion sans résultat'));
    const webm = webmFile({ width, height, frames, durationMs: Number(got.query.get('duration')) || (frames.length * 1000) / fps });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    writeFileAtomic(out, webm);
    return { frames: frames.length, bytes: webm.length };
  }

  /**
   * Miniature d'une image fixe, transparence gardée : `file` réduit à `maxSide` pixels de côté au plus,
   * en WebP dans `out` (écriture atomique). Rien n'est écrit, et `kept` dit pourquoi, pour une image
   * animée (APNG, GIF, WebP : la réduire la figerait) ou déjà assez petite.
   */
  async function fitWebp(file: string, out: string, maxSide: number, quality = 0.92): Promise<{ width?: number; height?: number; kept?: 'animated' | 'small' }> {
    const id = inputId(file);
    const key = `k${next++}`;
    let got: { width?: number; height?: number; kept?: 'animated' | 'small' };
    try {
      got = await run(`fitWebp(${JSON.stringify(id)}, ${JSON.stringify(key)}, ${maxSide}, ${JSON.stringify(mediaContentType(file) ?? '')}, ${quality})`);
    } catch (error) {
      throw failure(error, 'image');
    }
    if (got.kept) return got;
    const data = outputs.get(key);
    outputs.delete(key);
    if (!data) throw new Error(t('conversion sans résultat'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    writeFileAtomic(out, data.data);
    return got;
  }

  return { probeAudio, audioToWav, audioToOggOpus, imageToPng, mediaFrames, fitJpeg, fitWebp, cropJpeg, shrinkVideo };

}

export type Converter = ReturnType<typeof createConverter>;
