// Recherche libre d'un média (webmedia.ts, app/src/media-sites.ts) : ce qu'est un fichier
// reçu, s'il convient au média, s'il faut le convertir ou pourquoi il est refusé ; le WAV,
// la découpe et la forme d'onde ; les moteurs de recherche ; la sonde des pages vidéo sur
// ses pages témoins (test-pages/), en visiteur et en membre ; la détection des fichiers
// téléchargés (fenêtre « Récupérer », Téléchargements de Windows) et l'affectation d'un
// seul média, écrite aussitôt.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { setLanguage } from '../i18n';
import { applyOps } from '../fileops';
import { planSingleMedia } from '../mediaedit';
import { mediaMemory } from '../medias';
import { webSearchQuery, webSearchUrl, type WebReceipt } from '../mediasites';
import { decodePng } from '../png';
import { buildZip } from '../romzip';
import { readInfo, type TableEntry } from '../tables';
import {
  checkVideoPage,
  clampTrim,
  defaultTrim,
  formatClock,
  isMediaDownload,
  judgeWebFile,
  judgeWebFiles,
  sniffBytes,
  VIDEO_PAGE_PROBE,
  waveformPng,
  wavFile,
  wavInfo,
  webEngineUrl,
  webSearchOf,
} from '../webmedia';

setLanguage('fr');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-webmedia-'));

/** Débuts de fichiers réels, par format. */
const HEADS: Record<string, Buffer> = {
  png: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
  jpg: Buffer.from('ffd8ffe000104a464946', 'hex'),
  gif: Buffer.from('GIF89a', 'latin1'),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]),
  wav: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]),
  avi: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI LIST')]),
  mp4: Buffer.concat([Buffer.from('00000020', 'hex'), Buffer.from('ftypisom')]),
  m4a: Buffer.concat([Buffer.from('00000020', 'hex'), Buffer.from('ftypM4A ')]),
  mov: Buffer.concat([Buffer.from('00000014', 'hex'), Buffer.from('ftypqt  ')]),
  webm: Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.from('\x9f\x42\x86\x81\x01B\x82\x84webm', 'latin1')]),
  mkv: Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.from('\x9f\x42\x86\x81\x01B\x82\x88matroska', 'latin1')]),
  mp3: Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'),
  mp3frame: Buffer.from('fffb9064', 'hex'),
  aac: Buffer.from('fff15080', 'hex'),
  ogg: Buffer.from('OggS\x00\x02', 'latin1'),
  flac: Buffer.from('fLaC\x00\x00', 'latin1'),
  asf: Buffer.from('3026b2758e66cf11', 'hex'),
  zip: Buffer.from('PK\x03\x04\x14\x00', 'latin1'),
  html: Buffer.from('\n  <!DOCTYPE html><html><head><title>Dropbox - Error</title></head>', 'latin1'),
};

/** Fichier de ce nom commençant comme un vrai fichier de ce format. */
function make(dir: string, name: string, format: keyof typeof HEADS | 'text'): string {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, format === 'text' ? 'Lisez-moi : rien à voir.' : Buffer.concat([HEADS[format]!, Buffer.alloc(64)]));
  return file;
}

test('sniffBytes : la nature et le format se lisent dans les premiers octets', () => {
  const expect: Record<string, [string, string | undefined]> = {
    png: ['image', 'png'],
    jpg: ['image', 'jpg'],
    gif: ['image', 'gif'],
    webp: ['image', 'webp'],
    wav: ['audio', 'wav'],
    avi: ['video', 'avi'],
    mp4: ['video', 'mp4'],
    m4a: ['audio', 'm4a'],
    mov: ['video', 'mov'],
    webm: ['video', 'webm'],
    mkv: ['video', 'mkv'],
    mp3: ['audio', 'mp3'],
    mp3frame: ['audio', 'mp3'],
    aac: ['audio', 'aac'],
    ogg: ['audio', 'ogg'],
    flac: ['audio', 'flac'],
    asf: ['video', 'asf'],
    zip: ['archive', 'zip'],
    html: ['html', 'html'],
  };
  for (const [name, [kind, format]] of Object.entries(expect)) assert.deepEqual(sniffBytes(HEADS[name]!), { kind, format }, name);
  assert.deepEqual(sniffBytes(Buffer.from('Lisez-moi')), { kind: 'unknown' });
  assert.deepEqual(sniffBytes(Buffer.alloc(0)), { kind: 'unknown' });
});

test('judgeWebFile : musique du jeu, accepté, à convertir en WAV, refusé avec sa raison', () => {
  const dir = tmp();
  const judge = (name: string, format: keyof typeof HEADS | 'text') => judgeWebFile(make(dir, name, format), 'Audio');
  assert.deepEqual(judge('theme.mp3', 'mp3'), { status: 'accepted', kind: 'audio' });
  assert.deepEqual(judge('theme.m4a', 'm4a'), { status: 'accepted', kind: 'audio' });
  assert.deepEqual(judge('theme sans id3.mp3', 'mp3frame'), { status: 'accepted', kind: 'audio' });
  // Son d'une vidéo (YouTube rend du WebM ou du MP4) : extrait en WAV.
  assert.deepEqual(judge('Guardians of the Galaxy.webm', 'webm'), { status: 'convert', kind: 'video', to: 'wav', from: 'video' });
  assert.deepEqual(judge('clip.mp4', 'mp4'), { status: 'convert', kind: 'video', to: 'wav', from: 'video' });
  assert.deepEqual(judge('clip.mkv', 'mkv'), { status: 'convert', kind: 'video', to: 'wav', from: 'video' });
  // Variantes d'un conteneur que le menu ne lit pas sous ce nom : décodées en WAV.
  assert.deepEqual(judge('theme.opus', 'ogg'), { status: 'convert', kind: 'audio', to: 'wav', from: 'audio' });
  assert.deepEqual(judge('theme.weba', 'webm'), { status: 'convert', kind: 'audio', to: 'wav', from: 'audio' });
  assert.deepEqual(judge('theme.aac', 'aac'), { status: 'convert', kind: 'audio', to: 'wav', from: 'audio' });
  const refused = (name: string, format: keyof typeof HEADS | 'text', pattern: RegExp) => {
    const v = judge(name, format);
    assert.equal(v.status, 'refused', name);
    assert.match(v.status === 'refused' ? v.reason : '', pattern, name);
  };
  refused('theme.wma', 'asf', /ne sait pas lire/);
  refused('Dropbox - theme.mp3', 'html', /page web/);
  refused('pochette.jpg', 'jpg', /^une image, alors que « Musique du jeu » demande : mp3, ogg, m4a, flac, wav$/);
  refused('lisez-moi.txt', 'text', /format inconnu \(\.txt\)/);
  refused('film.avi', 'avi', /dont le navigateur intégré ne sait pas lire le son/);
});

test('judgeWebFile : écrans et logo, le contenu prime sur le nom', () => {
  const dir = tmp();
  // Logo : PNG, APNG, WebP, GIF ; un JPEG ou un BMP se redessine en PNG ; une vidéo est refusée.
  assert.deepEqual(judgeWebFile(make(dir, 'logo.png', 'png'), 'Wheel'), { status: 'accepted', kind: 'image' });
  assert.deepEqual(judgeWebFile(make(dir, 'logo.jpg', 'jpg'), 'Wheel'), { status: 'convert', kind: 'image', to: 'png', from: 'image' });
  assert.deepEqual(judgeWebFile(make(dir, 'logo.jpeg', 'jpg'), 'Wheel'), { status: 'convert', kind: 'image', to: 'png', from: 'image' });
  const video = judgeWebFile(make(dir, 'logo.webm', 'webm'), 'Wheel');
  assert.equal(video.status === 'refused' && video.reason, 'une vidéo, alors que « Logo » demande : apng, png, webp, gif');
  // Topper : vidéo ou image ; une vidéo WebM nommée .mp4 est rangée en .webm.
  assert.deepEqual(judgeWebFile(make(dir, 'topper.mp4', 'mp4'), 'Topper'), { status: 'accepted', kind: 'video' });
  assert.deepEqual(judgeWebFile(make(dir, 'topper.jpg', 'jpg'), 'Topper'), { status: 'accepted', kind: 'image' });
  assert.deepEqual(judgeWebFile(make(dir, 'topper webm.mp4', 'webm'), 'Topper'), { status: 'accepted', kind: 'video', ext: 'webm' });
  assert.deepEqual(judgeWebFile(make(dir, 'topper.m4v', 'mp4'), 'Topper'), { status: 'accepted', kind: 'video' });
  const mkv = judgeWebFile(make(dir, 'topper.mkv', 'mkv'), 'Topper');
  assert.match(mkv.status === 'refused' ? mkv.reason : '', /que le menu ne lit pas ; la convertir demanderait un outil externe \(ffmpeg\)/);
  const sound = judgeWebFile(make(dir, 'topper.mp3', 'mp3'), 'Topper');
  assert.match(sound.status === 'refused' ? sound.reason : '', /^un son, alors que « Topper »/);
  // Chargement : vidéo seulement.
  assert.equal(judgeWebFile(make(dir, 'chargement.png', 'png'), 'Loading').status, 'refused');
  // Prospectus : images et MP4, pas de WebM.
  assert.equal(judgeWebFile(make(dir, 'flyer.webm', 'webm'), 'GameInfo').status, 'refused');
  assert.deepEqual(judgeWebFile(make(dir, 'flyer.bmp', 'jpg'), 'GameInfo'), { status: 'accepted', kind: 'image', ext: 'jpg' });
});

test('judgeWebFiles : un envoi déballé, sous-dossiers compris, sans les fichiers de système', () => {
  const dir = tmp();
  make(dir, 'pack/Topper/T.mp4', 'mp4');
  make(dir, 'pack/lisez-moi.txt', 'text');
  make(dir, '__MACOSX/._T.mp4', 'mp4');
  make(dir, 'pack/Thumbs.db', 'text');
  const judged = judgeWebFiles(dir, 'Topper').map((j) => [path.relative(dir, j.file).replace(/\\/g, '/'), j.verdict.status]);
  assert.deepEqual(judged, [
    ['pack/lisez-moi.txt', 'refused'],
    ['pack/Topper/T.mp4', 'accepted'],
  ]);
});

test('isMediaDownload : de Téléchargements de Windows, seuls les médias et les archives concernent une recherche', () => {
  for (const name of ['theme.mp3', 'clip.webm', 'logo.png', 'theme.opus', 'pack.zip', 'pack.7z', 'clip.mkv', 'photo.jfif']) assert.equal(isMediaDownload(name), true, name);
  for (const name of ['facture.pdf', 'setup.exe', 'notes.txt', 'sans extension']) assert.equal(isMediaDownload(name), false, name);
});

test('wavFile : en-tête PCM 16 bits relu à l’identique', () => {
  const pcm = Buffer.alloc(44100 * 2 * 2 * 3); // 3 s stéréo
  const wav = wavFile(pcm, 44100, 2);
  assert.equal(wav.length, 44 + pcm.length);
  assert.deepEqual(wavInfo(wav), { sampleRate: 44100, channels: 2, bits: 16, seconds: 3 });
  assert.equal(sniffBytes(wav).format, 'wav');
  assert.equal(wavInfo(Buffer.from('pas un wav')), undefined);
});

test('découpe : ramenée dans le son, au moins une seconde ; proposée selon le média ; heure lisible', () => {
  assert.deepEqual(clampTrim({ start: -3, end: 500, fade: true }, 151.2), { start: 0, end: 151.2, fade: true });
  assert.deepEqual(clampTrim({ start: 40, end: 30, fade: false }, 151.2), { start: 29, end: 30, fade: false });
  assert.deepEqual(clampTrim({ start: 150.9, end: 151.2, fade: false }, 151.2), { start: 150.2, end: 151.2, fade: false });
  assert.deepEqual(clampTrim({ start: 0, end: 5, fade: false }, 0.4), { start: 0, end: 0.4, fade: false }, 'son plus court qu’une seconde');
  assert.deepEqual(defaultTrim('AudioLaunch', 151.2), { start: 0, end: 10, fade: true });
  assert.deepEqual(defaultTrim('Audio', 151.2), { start: 0, end: 151.2, fade: false });
  assert.deepEqual(defaultTrim('Audio', 400), { start: 0, end: 180, fade: true });
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(7.5), '0:07,5');
  assert.equal(formatClock(151.2), '2:31,2');
  assert.equal(formatClock(750), '12:30');
});

test('waveformPng : la partie gardée en vert signal sur sa bande, le reste en sarcelle éteinte', () => {
  const peaks = Array.from({ length: 600 }, (_v, i) => (i % 2 ? 0.9 : 0.5));
  const png = waveformPng(peaks, { width: 300, height: 80, start: 0.25, end: 0.75 });
  const img = decodePng(png)!;
  assert.equal(img.width, 300);
  assert.equal(img.height, 80);
  const at = (x: number, y: number) => [...img.data.subarray((y * 300 + x) * 4, (y * 300 + x) * 4 + 3)];
  assert.deepEqual(at(150, 40), [0x8b, 0xe2, 0x3a], 'au milieu de l’extrait : vert signal');
  assert.deepEqual(at(20, 40), [0x24, 0x50, 0x4a], 'hors de l’extrait : sarcelle');
  assert.deepEqual(at(150, 1), [0x10, 0x22, 0x14], 'fond de la bande de l’extrait');
  assert.deepEqual(at(20, 1), [0x04, 0x0b, 0x0a], 'fond hors de l’extrait');
  assert.deepEqual(at(Math.round(0.25 * 299), 1), [0x8b, 0xe2, 0x3a], 'trait du début');
});

test('moteurs : adresses de recherche, et le texte relu depuis la page de résultats', () => {
  const q = 'Guardians of the Galaxy table music vpinball';
  assert.equal(webSearchQuery('Guardians of the Galaxy (Stern 2017)', 'Audio'), q);
  assert.equal(webEngineUrl(q, 'web'), webSearchUrl('Guardians of the Galaxy (Stern 2017)', 'Audio'), 'même page de départ que les propositions : la reprise vaut pour les deux');
  for (const engine of ['web', 'images', 'videos', 'youtube'] as const) assert.deepEqual(webSearchOf(webEngineUrl(q, engine)), { engine, query: q }, engine);
  assert.equal(new URL(webEngineUrl(q, 'youtube')).hostname, 'www.youtube.com');
  assert.equal(webSearchOf('https://vpuniverse.com/files/file/1-x/'), undefined);
  assert.equal(webSearchOf('pas une adresse'), undefined);
});

// ---------------------------------------------------------------------------
// Sonde des pages vidéo, sur ses pages témoins

const PAGES = path.join(__dirname, '..', '..', 'test-pages');

function runProbe(html: string, url: string): unknown {
  const { document } = parseHTML(html);
  const location = new URL(url);
  return JSON.parse(JSON.stringify(vm.runInNewContext(VIDEO_PAGE_PROBE, { document, location, window: {}, URL })));
}

/** La page YouTube vue par un membre connecté : son avatar au lieu de « Sign in ». */
function youtubeMember(html: string): string {
  return html.replace(/<ytd-button-renderer[^>]*><a [^>]*aria-label="Sign in"[^>]*>Sign in<\/a><\/ytd-button-renderer>/, '<ytd-topbar-menu-button-renderer><button id="avatar-btn" aria-label="Account menu"></button></ytd-topbar-menu-button-renderer>');
}

test('page vidéo YouTube : titre, durée, flux découpé non téléchargeable, en visiteur comme en membre', () => {
  const page = fs.readFileSync(path.join(PAGES, 'youtube-video.html'), 'utf8');
  const member = youtubeMember(page);
  assert.ok(member.includes('avatar-btn') && !member.includes('aria-label="Sign in"'), 'la page du membre a son avatar');
  const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  for (const [who, html, flag] of [
    ['visiteur', page, false],
    ['membre', member, true],
  ] as const) {
    assert.deepEqual(checkVideoPage(runProbe(html, url)), { site: 'youtube', title: 'Me at the zoo', url, duration: 19, member: flag }, who);
  }
  // Navigation interne de YouTube : la page vivante change, pas ses balises meta (restées sur la vidéo d'avant).
  const next = page.replace('>Me at the zoo</yt-formatted-string>', '>Guardians of the Galaxy - Main Theme</yt-formatted-string>').replace('<title>Me at the zoo - YouTube</title>', '<title>Guardians of the Galaxy - Main Theme - YouTube</title>');
  const moved = checkVideoPage(runProbe(next, 'https://www.youtube.com/watch?v=abcdefghijk'));
  assert.equal(moved?.title, 'Guardians of the Galaxy - Main Theme', 'le titre se lit dans la page vivante, pas dans og:title');
  assert.equal(moved?.direct, undefined);
  // youtu.be et les shorts sont des pages vidéo ; la page de résultats n'en est pas une, même avec ses aperçus animés.
  assert.equal(checkVideoPage(runProbe(page, 'https://youtu.be/jNQXAC9IVRw'))?.site, 'youtube');
  assert.equal(checkVideoPage(runProbe(page, 'https://www.youtube.com/shorts/jNQXAC9IVRw'))?.site, 'youtube');
  assert.deepEqual(runProbe(page, 'https://www.youtube.com/results?search_query=guardians+of+the+galaxy+pinball'), { kind: 'none' });
});

test('page vidéo directe : le fichier lu par la page se télécharge, en visiteur comme en membre', () => {
  const page = fs.readFileSync(path.join(PAGES, 'video-directe.html'), 'utf8');
  const member = page.replace(/<a href="\/compte\/connexion" id="connexion">Se connecter<\/a>/, '<a href="/compte" id="compte">Mon compte</a>');
  assert.notEqual(member, page);
  const url = 'https://medias.exemple.org/fiches/gotg-topper';
  for (const [who, html] of [
    ['visiteur', page],
    ['membre', member],
  ] as const) {
    assert.deepEqual(
      checkVideoPage(runProbe(html, url)),
      { site: 'other', title: 'Guardians of the Galaxy - topper animé', url, duration: 12, direct: 'https://medias.exemple.org/medias/gotg-topper.mp4' },
      who,
    );
  }
  // Une page sans vidéo (résultats de VPUniverse) n'est pas une page vidéo.
  const vpu = fs.readFileSync(path.join(PAGES, 'vpuniverse-recherche.html'), 'utf8');
  assert.deepEqual(runProbe(vpu, 'https://vpuniverse.com/search/?q=game%20thrones'), { kind: 'none' });
});

test('checkVideoPage : résultat incohérent écarté, adresse blob: jamais proposée au téléchargement', () => {
  assert.equal(checkVideoPage(undefined), undefined);
  assert.equal(checkVideoPage({ kind: 'none' }), undefined);
  assert.equal(checkVideoPage({ kind: 'video' }), undefined);
  assert.deepEqual(checkVideoPage({ kind: 'video', site: 'pirate', url: 'https://x.org/v', title: '  ', duration: Infinity, direct: 'blob:https://x.org/1' }), { site: 'other', title: 'https://x.org/v', url: 'https://x.org/v' });
  assert.deepEqual(checkVideoPage({ kind: 'video', site: 'vimeo', url: 'https://vimeo.com/1', title: 'T', duration: 61.04, direct: 'https://cdn.vimeo.com/1.mp4', member: 'oui' }), { site: 'vimeo', title: 'T', url: 'https://vimeo.com/1', duration: 61, direct: 'https://cdn.vimeo.com/1.mp4' });
});

// ---------------------------------------------------------------------------
// Détection des fichiers téléchargés et affectation (app/src/media-sites.ts, compilé)

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');

interface ShownRequest {
  url: string;
  search?: { query: string; engine: string; want?: string };
  claim?: { dir: string; done(r: { file: string; filename: string; urls: string[] } | { error: string }): void };
}

/** Ce que le test utilise des sites des médias (app/src/media-sites.ts). */
interface AppSites {
  openWeb(request: object): void;
  stopWeb(): void;
  onWebReceived(listener: (r: WebReceipt) => void): void;
  addWebFile(key: string, file: string, kind: string): void;
  webReceipt(key: string): WebReceipt | undefined;
}

/** Sites des médias avec une fausse fenêtre « Récupérer » : on garde la demande, on joue le téléchargement. */
function sitesWith(downloads: string, windows: string) {
  const { createMediaSites } = require(path.join(APP_DIST, 'media-sites.js')) as { createMediaSites(ctx: object): AppSites };
  const shown: ShownRequest[] = [];
  const acquirer = { show: (r: ShownRequest) => shown.push(r), resumable: () => false };
  const sites = createMediaSites({ acquirer, downloadsDir: () => downloads, changed: () => undefined, windowsDownloads: () => windows });
  const received: WebReceipt[] = [];
  sites.onWebReceived((r) => received.push(r));
  return { sites, shown, received };
}

const until = async (what: string, test: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!test() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  assert.ok(test(), `attendu en vain : ${what}`);
};

const TABLE = 'D:\\Tables\\Guardians of the Galaxy (Stern 2017)\\Guardians of the Galaxy (Stern 2017).vpx';
const request = { url: webEngineUrl('Guardians of the Galaxy table music vpinball', 'web'), table: TABLE, title: 'Guardians of the Galaxy', type: 'Audio' as const, label: 'Musique du jeu', query: 'Guardians of the Galaxy table music vpinball', engine: 'web' as const };

test('détection : un fichier téléchargé dans la fenêtre « Récupérer » revient au média, jugé et noté', async () => {
  const root = tmp();
  const { sites, shown, received } = sitesWith(path.join(root, 'downloads'), path.join(root, 'windows'));
  sites.openWeb(request);
  assert.equal(shown.length, 1);
  assert.deepEqual(shown[0]!.search, { query: request.query, engine: 'web', want: 'audio' }, 'le champ du bandeau est prérempli ; sur une page vidéo, le son d’abord pour une musique');
  // Une archive : un son WebM (à extraire), une page HTML sauvée en .mp3 (refusée), un lisez-moi.
  const parts = tmp();
  const zip = path.join(shown[0]!.claim!.dir, 'gotg.zip');
  fs.mkdirSync(path.dirname(zip), { recursive: true });
  fs.writeFileSync(zip, buildZip([
    { from: make(parts, 'Main Theme.webm', 'webm'), name: 'Main Theme.webm' },
    { from: make(parts, 'theme.mp3', 'html'), name: 'theme.mp3' },
    { from: make(parts, 'lisez-moi.txt', 'text'), name: 'lisez-moi.txt' },
  ]));
  shown[0]!.claim!.done({ file: zip, filename: 'gotg.zip', urls: ['https://medias.exemple.org/gotg.zip'] });
  await until('le reçu', () => received.length === 1);
  const r = received[0]!;
  assert.equal(r.type, 'Audio');
  assert.equal(r.url, 'https://medias.exemple.org/gotg.zip');
  assert.deepEqual(r.files, [], 'rien d’accepté tel quel (la page HTML nommée .mp3 n’en est pas un)');
  assert.deepEqual(r.convert?.map((c) => [path.basename(c.file), c.to, c.from]), [['Main Theme.webm', 'wav', 'video']]);
  assert.deepEqual(r.refused?.map((x) => x.name).sort(), ['lisez-moi.txt', 'theme.mp3']);
  // Noté dans web.json : relu à la visite suivante ; un fichier produit (extrait) s'y ajoute.
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'downloads', 'sites', 'web.json'), 'utf8')) as WebReceipt[];
  assert.equal(saved.length, 1);
  const extract = path.join(path.dirname(r.convert![0]!.file), 'Main Theme (extrait).wav');
  fs.writeFileSync(extract, wavFile(Buffer.alloc(400), 44100, 2));
  sites.addWebFile(r.key, extract, 'audio');
  assert.deepEqual(sites.webReceipt(r.key)?.files.map((f) => [path.basename(f.file), f.type]), [['Main Theme (extrait).wav', 'Audio']]);
  sites.stopWeb();
});

test('détection : ce qui arrive dans Téléchargements de Windows pendant la recherche est copié et jugé ; le reste ignoré', async () => {
  const root = tmp();
  const windows = path.join(root, 'windows');
  fs.mkdirSync(windows, { recursive: true });
  make(windows, 'ancien.mp3', 'mp3'); // déjà là avant la recherche : pas concerné
  const { sites, received } = sitesWith(path.join(root, 'downloads'), windows);
  sites.openWeb(request);
  await new Promise((r) => setTimeout(r, 200));
  make(windows, 'facture.pdf', 'text');
  const theme = make(windows, 'GotG theme.mp3', 'mp3');
  await until('le fichier de Téléchargements de Windows', () => received.length === 1, 15_000);
  const r = received[0]!;
  assert.equal(r.windows, true);
  assert.equal(r.filename, 'GotG theme.mp3');
  assert.deepEqual(r.files.map((f) => path.basename(f.file)), ['GotG theme.mp3'], 'gardé sous son nom d’origine');
  assert.ok(fs.existsSync(theme), 'l’original reste dans Téléchargements');
  // Fin de la recherche : plus rien n'est suivi.
  sites.stopWeb();
  make(windows, 'apres.mp3', 'mp3');
  await new Promise((r) => setTimeout(r, 3000));
  assert.equal(received.length, 1, 'ni la facture, ni l’ancien fichier, ni ce qui arrive après la recherche');
});

test('affectation : un seul média écrit aussitôt, l’ancien à la corbeille, la provenance notée', () => {
  const root = tmp();
  const folder = path.join(root, 'tables', 'Guardians of the Galaxy (Stern 2017)');
  const vpx = path.join(folder, 'Guardians of the Galaxy (Stern 2017).vpx');
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(vpx, '');
  const old = path.join(folder, 'medias', '(Audio) Guardians of the Galaxy (Stern 2017).mp3');
  fs.writeFileSync(old, Buffer.concat([HEADS.mp3!, Buffer.from('ancien')]));
  const wheel = path.join(folder, 'medias', '(Wheel) Guardians of the Galaxy (Stern 2017).png');
  fs.writeFileSync(wheel, HEADS.png!);
  const incoming = path.join(root, 'downloads', 'sites', 'web', 'x', 'fichiers', 'Main Theme (extrait).wav');
  fs.mkdirSync(path.dirname(incoming), { recursive: true });
  fs.writeFileSync(incoming, wavFile(Buffer.alloc(800), 44100, 2));
  const infoFile = path.join(folder, 'Guardians of the Galaxy (Stern 2017).info');
  const table: TableEntry = { id: 'Guardians of the Galaxy (Stern 2017)/Guardians of the Galaxy (Stern 2017).vpx', emulator: 'vpx', file: vpx, folder, title: 'Guardians of the Galaxy', infoFile, info: {} };
  const plan = planSingleMedia(table, 'Audio', { from: incoming, mode: 'copy', origin: { origin: 'medias.exemple.org', url: 'https://medias.exemple.org/gotg.zip' } }, [old], { infoFile, now: new Date('2026-10-26T10:00:00Z') });
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.steps.map((s) => s.kind).sort(), ['add', 'info', 'trash'].filter((k) => plan.steps.some((s) => s.kind === k)).sort());
  const trash = path.join(root, 'trash');
  applyOps(plan.ops, { trashDir: trash });
  const now = fs.readdirSync(path.join(folder, 'medias')).sort();
  assert.deepEqual(now, ['(Audio) Guardians of the Galaxy (Stern 2017).wav', '(Wheel) Guardians of the Galaxy (Stern 2017).png'], 'le logo, autre média, n’est pas touché');
  assert.ok(fs.readdirSync(trash, { recursive: true }).some((f) => String(f).endsWith('.mp3')), 'l’ancien son est à la corbeille');
  assert.ok(fs.existsSync(incoming), 'copié : le fichier reçu reste dans les téléchargements');
  const source = mediaMemory(readInfo(infoFile)).sources?.Audio;
  assert.equal(source?.origin, 'medias.exemple.org');
  assert.equal(source?.url, 'https://medias.exemple.org/gotg.zip');
  assert.equal(source?.file, '(Audio) Guardians of the Galaxy (Stern 2017).wav');
});
