// Conversions des fichiers reçus de la recherche libre (docs/recherche/sources-medias.md
// § 7), sans outil externe : le moteur de Chromium d'Electron décode, dans une page
// cachée (une vue sans fenêtre, jamais affichée), ce que le menu ne lit pas.
//
// - Image (jpg pour le logo, bmp, avif, ico…) : redessinée en PNG.
// - Son (opus, aac, webm…) ou son d'une vidéo (mp4, webm, mkv, mov) : décodé, découpé
//   (début, fin, fondu de fin), écrit en WAV 16 bits à 44,1 kHz.
// - Analyse d'un son : durée, voies, et les pics qui dessinent sa forme d'onde.
// - Images d'un média (une image, ou quelques moments d'une vidéo), en pixels : le cadre du
//   DMD d'un FullDMD y est cherché (fulldmdframe.ts).
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
import { mediaKind, t, wavFile, type AudioTrim, type RgbaImage } from '@cyberpinball/core';

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
window.toPng = async (id, out) => {
  const blob = await (await fetch('/in/' + id)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const png = await canvas.convertToBlob({ type: 'image/png' });
  await fetch('/out/' + out, { method: 'POST', body: png });
  return { width: bitmap.width, height: bitmap.height };
};
window.framesOf = async (id, video, times, maxWidth, out) => {
  const blob = await (await fetch('/in/' + id)).blob();
  const grab = async (source, width, height, key) => {
    const w = Math.min(maxWidth, width);
    const h = Math.max(1, Math.round((height * w) / width));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    await fetch('/out/' + key + '?w=' + w + '&h=' + h, { method: 'POST', body: pixels.buffer });
  };
  if (!video) {
    const bitmap = await createImageBitmap(blob);
    await grab(bitmap, bitmap.width, bitmap.height, out + '0');
    return { width: bitmap.width, height: bitmap.height, count: 1 };
  }
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.src = url;
    await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = () => reject(new Error('video')); });
    for (let i = 0; i < times.length; i++) {
      v.currentTime = v.duration * times[i];
      await new Promise((resolve) => (v.onseeked = resolve));
      await grab(v, v.videoWidth, v.videoHeight, out + i);
    }
    return { width: v.videoWidth, height: v.videoHeight, count: times.length };
  } finally {
    URL.revokeObjectURL(url);
  }
};
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
      const v = new WebContentsView({ webPreferences: { session: s, offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      // Aucune fenêtre ne la porte : gardée ici, sinon le ramasse-miettes la détruirait (acquire-window.ts, hiddenViews).
      hiddenViews.add(v);
      v.webContents.once('destroyed', () => hiddenViews.delete(v));
      v.webContents.setAudioMuted(true);
      v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      await v.webContents.loadURL(`${ORIGIN}/`);
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
        new Promise<never>((_r, reject) => (timer = setTimeout(() => reject(new Error(t('délai dépassé'))), TIMEOUT_MS))),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Message court d'une erreur de la page (« Unable to decode audio data » n'apprend rien à l'utilisateur). */
  function failure(error: unknown, what: 'audio' | 'image'): Error {
    const message = (error as Error)?.message ?? String(error);
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

  return { probeAudio, audioToWav, imageToPng, mediaFrames };
}

export type Converter = ReturnType<typeof createConverter>;
