// Juke-box sur la borne (app/src/jukebox-library.ts, compilé), avec un faux yt-dlp et la vraie file
// des téléchargements : lecture d'une playlist sans téléchargement, seconde lecture (champs musicaux,
// vidéo bloquée dans le pays), import « sur la borne », téléchargement coupé par le réseau puis repris
// là où son partiel s'était arrêté, vidéo devenue privée sautée avec sa raison, bibliothèque relue,
// état des morceaux, ce que le lecteur joue, place sur le disque, « Libérer la place », fichiers locaux
// et leur pochette gardée en cache. Données fictives.

import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createDownloadManager } from '../downloadmanager';
import { setLanguage } from '../i18n';
import { addTracks, type JukeboxStore } from '../jukebox';
import { JUKEBOX_EMBED_REFERRER } from '../jukebox-youtube';
import { YTDLP_FILE_MARK, YTDLP_INFO_MARK, YTDLP_PROGRESS_MARK } from '../ytdlp';

setLanguage('fr');

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');
const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-jukebox-app-'));
  dirs.push(d);
  return d;
};
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const A = 'aaaaaaaaaa1';
const B = 'bbbbbbbbbb2';
const C = 'cccccccccc3';
const D = 'dddddddddd4';
const E = 'eeeeeeeeee5';
const F = 'ffffffffff6';

/**
 * Faux yt-dlp : la liste à plat (--flat-playlist -J), la seconde lecture (--skip-download), ou un
 * fichier de morceau (nom fixe « son » ou « video »). B : coupé par le réseau au premier essai (un
 * partiel de 1000 octets reste), repris ensuite ; D : vidéo devenue privée. Chaque appel est noté.
 */
const FAKE = `
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
const log = (l) => fs.appendFileSync(process.env.FAUX_JOURNAL, l + '\\n');
const urls = args.slice(args.indexOf('--') + 1);
const idOf = (u) => (/[?&]v=([A-Za-z0-9_-]{11})/.exec(u) || [])[1];
if (args.includes('--flat-playlist')) {
  log('liste ' + urls[0]);
  if (urls[0].includes('PLabsente')) { console.error('ERROR: [youtube:tab] PLabsente: The playlist does not exist.'); process.exit(1); }
  console.log(JSON.stringify({ _type: 'playlist', id: 'PLexemple0001', title: 'Néon nocturne (exemple)', entries: [
    { id: '${A}', title: 'Néons Fictifs - Ville basse (Official Video)', duration: 100, channel: 'Néons Fictifs' },
    { id: '${B}', title: 'Orbite Fictive - Route côtière', duration: 100 },
    { id: '${C}', title: 'Lointain - Ailleurs', duration: 100 },
    { id: '${D}', title: 'Secret - Bientôt privé', duration: 100 },
    { id: '${E}', title: '[Deleted video]' },
  ] }));
  process.exit(0);
}
if (args.includes('--skip-download')) {
  for (const u of urls) {
    const id = idOf(u);
    log('infos ' + id);
    if (id === '${C}') console.error('ERROR: [youtube] ${C}: Video unavailable. This video is not available in your country');
    else console.log('${YTDLP_INFO_MARK}' + JSON.stringify({ id, title: 't', ...(id === '${A}' ? { artist: 'Néons Fictifs', album: 'Nuits à venir', track: 'Ville basse' } : {}), duration: 100 }));
  }
  process.exit(0);
}
const id = idOf(urls[0]);
const out = args[args.indexOf('-o') + 1];
const video = out.includes('video.');
const target = out.replace('%(ext)s', video ? 'mp4' : 'm4a');
const part = target + '.part';
const fmt = args[args.indexOf('-f') + 1];
log('fichier ' + id + ' ' + (video ? 'video' : 'son') + ' ' + (fmt.includes('height<=720') ? '720' : fmt.includes('height<=1080') ? '1080' : 'son'));
if (id === '${D}') { console.error('ERROR: [youtube] ${D}: Private video. Sign in if you have been granted access to this video'); process.exit(1); }
fs.mkdirSync(path.dirname(target), { recursive: true });
const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
if (have) log('reprise ' + id + ' ' + have);
if (id === '${B}' && !video && !have) {
  fs.writeFileSync(part, Buffer.alloc(1000, 1));
  console.log('${YTDLP_PROGRESS_MARK}1000|4000|NA|1000|3');
  console.error('ERROR: unable to download video data: <urlopen error timed out>');
  process.exit(1);
}
fs.appendFileSync(part, Buffer.alloc(4000 - have, 2));
console.log('${YTDLP_PROGRESS_MARK}4000|4000|NA|1000|0');
fs.renameSync(part, target);
if (args.includes('--write-thumbnail')) fs.writeFileSync(path.join(path.dirname(target), 'miniature.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
if (args.some((a) => a.includes('${YTDLP_INFO_MARK}'))) console.log('${YTDLP_INFO_MARK}' + JSON.stringify(video ? { id, height: 720 } : { id, title: 'Titre ' + id, artist: id === '${A}' ? 'Néons Fictifs' : undefined, duration: 100 }));
console.log('${YTDLP_FILE_MARK}' + target);
`;

interface Lib {
  store(): JukeboxStore;
  apply(change: unknown): unknown;
  transport: unknown;
  finished(job: unknown): void;
  analyze(link: string): Promise<{ ok: true; analysis: { entries: { id: string; unavailable?: string; album?: string }[] } } | { ok: false; reason: string }>;
  details(analysis: unknown): Promise<{ entries: { id: string; unavailable?: string; album?: string }[] }>;
  importPlaylist(req: unknown): { ok: true; playlist: { id: string }; added: unknown[]; enqueue: string[] } | { ok: false; reason: string };
  views(id: string): { track: { youtube?: string; key: string; path?: string }; info: { artist?: string; title: string }; status: { kind: string; playable: boolean; play?: string; label: string; reason?: string; percent?: number }; image?: string }[];
  playback(id: string, key: string): unknown;
  playerLists(): { id: string; tracks: { key: string; playable: boolean }[] }[];
  songs(): Map<string, { audio?: string; video?: string; thumbnail?: string; infos?: { artist?: string; height?: number }; bytes: number }>;
  usage(): { entries: number; bytes: number; free?: number; playlists: Map<string, { freeable: number }> };
  freePlace(id: string): { ok: true; remove: string[]; freed: number } | { ok: false };
  setQuality(id: string, q: string): { ok: true; savings?: { songs: string[]; bytes: number } };
  removeVideos(ids: string[]): number;
  scanFiles(paths: string[]): { files: { path: string }[] };
  addFiles(id: string, scan: unknown): { ok: boolean };
}

async function until(cond: () => boolean, what: string, ms = 15000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`attente trop longue : ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('Juke-box de la borne : playlist lue sans téléchargement, importée sur la borne, téléchargement coupé puis repris', async () => {
  const root = tmp();
  const dataDir = tmp();
  const script = path.join(root, 'faux-yt-dlp.js');
  const journal = path.join(root, 'journal.txt');
  fs.writeFileSync(script, FAKE);
  process.env.FAUX_JOURNAL = journal;
  const { createYtDlp } = require(path.join(APP_DIST, 'ytdlp-tool.js')) as { createYtDlp(o: object): unknown };
  const { createJukeboxLibrary } = require(path.join(APP_DIST, 'jukebox-library.js')) as { createJukeboxLibrary(o: object): Lib };
  const ytdlp = createYtDlp({ root: () => root, node: process.execPath, override: () => script });
  let lib: Lib | undefined;
  const manager = createDownloadManager({ dataDir, transports: {}, tickMs: 20, finished: (j) => lib?.finished(j) });
  try {
    lib = createJukeboxLibrary({ root: () => root, dataDir, ytdlp, downloads: manager, node: process.execPath });
    manager.setTransport('youtube', lib.transport as never);

    // Lecture sans téléchargement, puis seconde lecture des vidéos.
    const absent = await lib.analyze('https://www.youtube.com/playlist?list=PLabsente');
    assert.deepEqual(absent, { ok: false, reason: 'Playlist introuvable sur YouTube' });
    const read = await lib.analyze(`https://www.youtube.com/watch?v=${A}&list=PLexemple0001`);
    assert.ok(read.ok);
    assert.deepEqual(read.analysis.entries.map((e) => e.unavailable), [undefined, undefined, undefined, undefined, 'deleted']);
    const analysis = await lib.details(read.analysis);
    assert.equal(analysis.entries.find((e) => e.id === C)!.unavailable, 'blocked');
    assert.equal(analysis.entries.find((e) => e.id === A)!.album, 'Nuits à venir');
    assert.ok(!fs.existsSync(path.join(root, 'Musique')), 'rien n’a été téléchargé');

    // Import sur la borne, en 720p : A, B, D retenus ; C (bloquée) et E (supprimée) sautées.
    const imp = lib.importPlaylist({ analysis, target: { name: 'Néon nocturne' }, mode: 'download', quality: '720p' });
    assert.ok(imp.ok);
    assert.deepEqual(imp.enqueue, [A, B, D]);
    assert.ok(fs.existsSync(path.join(dataDir, 'juke-box.json')));
    const pl = imp.playlist.id;
    const job = () => manager.jobs().find((j) => j.kind === 'jukebox')!;
    assert.equal(job().files.length, 6);
    assert.equal(job().title, 'Juke-box · Néon nocturne : 3 morceaux');

    // Le réseau coupe pendant le son de B : le téléchargement attend, le partiel reste.
    await until(() => job().state === 'waiting', 'coupure de B');
    assert.equal(job().reason, 'network');
    assert.equal(fs.statSync(path.join(root, 'Musique', B, 'son.m4a.part')).size, 1000);
    const waiting = lib.views(pl);
    assert.equal(waiting.find((v) => v.track.youtube === A)!.status.kind, 'playable', 'A est arrivé, jouable tout de suite');
    const vb = waiting.find((v) => v.track.youtube === B)!.status;
    assert.equal(vb.kind, 'waiting');
    assert.equal(vb.playable, false);

    // Reprise : B repart de ses 1000 octets ; D, devenue privée, est sautée avec sa raison.
    manager.resume(job().id);
    await until(() => job().state === 'done', 'fin du téléchargement');
    const calls = fs.readFileSync(journal, 'utf8');
    assert.match(calls, new RegExp(`reprise ${B} 1000`));
    assert.match(calls, new RegExp(`fichier ${A} video 720`), 'la vidéo en 720p, comme la playlist');
    assert.equal(fs.statSync(path.join(root, 'Musique', B, 'son.m4a')).size, 4000);
    assert.deepEqual(job().files.filter((f) => f.skipped).map((f) => [f.meta!.song, f.skipped!.detail]), [[D, 'Vidéo privée'], [D, 'Vidéo privée']]);

    // Bibliothèque : son, vidéo muette, miniature, infos.json (champs musicaux, hauteur).
    const songs = lib.songs();
    const a = songs.get(A)!;
    assert.ok(a.audio?.endsWith('son.m4a') && a.video?.endsWith('video.mp4') && a.thumbnail?.endsWith('miniature.jpg'));
    assert.equal(a.infos?.artist, 'Néons Fictifs');
    assert.equal(a.infos?.height, 720);

    // État des morceaux et ce que le lecteur joue.
    const views = lib.views(pl);
    assert.deepEqual(views.map((v) => [v.track.youtube, v.status.kind]), [[A, 'playable'], [B, 'playable'], [D, 'unavailable']]);
    assert.equal(views[2]!.status.label, 'Vidéo privée');
    assert.equal(views[0]!.info.artist, 'Néons Fictifs');
    assert.ok(views[0]!.image?.endsWith('miniature.jpg'));
    assert.deepEqual(lib.playback(pl, views[0]!.track.key), { kind: 'local', audio: a.audio, video: a.video, image: a.thumbnail });
    assert.equal(lib.playback(pl, views[2]!.track.key), undefined);
    assert.deepEqual(lib.playerLists()[0]!.tracks.map((t) => t.playable), [true, true, false]);
    // Un morceau en ligne : le lecteur intégré de YouTube, avec son Referer.
    const online = addTracks(lib.store(), pl, [{ source: 'online', youtube: F, title: 'En ligne seulement', added: '' }], new Date());
    lib.apply(online);
    const fKey = lib.views(pl).find((v) => v.track.youtube === F)!.track.key;
    assert.deepEqual(lib.playback(pl, fKey), { kind: 'online', id: F, url: `https://www.youtube.com/embed/${F}?autoplay=1&controls=0&rel=0&playsinline=1&iv_load_policy=3&disablekb=1`, referrer: JUKEBOX_EMBED_REFERRER });

    // Place : chaque dossier une fois, l'espace libre du disque.
    const usage = lib.usage();
    assert.equal(usage.entries, 4);
    assert.equal(usage.bytes, [...lib.songs().values()].reduce((n, s) => n + s.bytes, 0));
    assert.ok(usage.bytes >= 4 * 4000);
    assert.ok(typeof usage.free === 'number' && usage.free > 0);

    // Son seul : la place des vidéos est proposée, puis rendue sur demande.
    const q = lib.setQuality(pl, 'audio');
    assert.deepEqual(q.savings?.songs.sort(), [A, B].sort());
    assert.equal(lib.removeVideos(q.savings!.songs), 8000);
    assert.equal(lib.songs().get(A)!.video, undefined);
    assert.ok(lib.songs().get(A)!.audio, 'le son reste');

    // Libérer la place : la playlist repasse en ligne, les dossiers partent.
    const free = lib.freePlace(pl);
    assert.ok(free.ok);
    assert.deepEqual(free.remove.sort(), [A, B, D].sort());
    assert.ok(free.freed >= 8000);
    assert.ok(!fs.existsSync(path.join(root, 'Musique', A)));
    assert.deepEqual(lib.views(pl).map((v) => v.status.play ?? v.status.kind), ['online', 'online', 'unavailable', 'online']);
  } finally {
    manager.stop();
  }
});

test('Juke-box de la borne : fichiers locaux ajoutés sur place, pochette intégrée gardée en cache, fichier introuvable grisé', () => {
  const root = tmp();
  const dataDir = tmp();
  const { createJukeboxLibrary } = require(path.join(APP_DIST, 'jukebox-library.js')) as { createJukeboxLibrary(o: object): Lib & { fileCover(f: string): string | undefined } };
  const lib = createJukeboxLibrary({ root: () => root, dataDir, ytdlp: { grab: async () => ({ ok: false, reason: 'x' }), run: async () => ({ ok: false, reason: 'x' }) } });
  const created = lib.importPlaylist({ analysis: { link: { list: 'PLx', url: 'https://www.youtube.com/playlist?list=PLx', mix: false }, title: 'x', entries: [], capped: false }, target: { name: 'Mes fichiers' }, mode: 'online' });
  assert.ok(created.ok);
  const folder = path.join(root, 'Ma musique', 'Album');
  fs.mkdirSync(folder, { recursive: true });
  // MP3 minimal avec un ID3v2.3 : titre, artiste et pochette PNG.
  const frame = (id: string, data: Buffer) => Buffer.concat([Buffer.from(id, 'latin1'), Buffer.from([0, 0, (data.length >> 8) & 0xff, data.length & 0xff, 0, 0]), data]);
  const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(32, 5)]);
  const body = Buffer.concat([frame('TIT2', Buffer.from('\0Ville basse', 'latin1')), frame('TPE1', Buffer.from('\0Neons Fictifs', 'latin1')), frame('APIC', Buffer.concat([Buffer.from('\0image/png\0', 'latin1'), Buffer.from([3, 0]), png]))]);
  const mp3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, (body.length >> 7) & 0x7f, body.length & 0x7f]), body, Buffer.from([0xff, 0xfb, 0x90, 0]), Buffer.alloc(32)]);
  fs.writeFileSync(path.join(folder, 'piste.mp3'), mp3);
  fs.writeFileSync(path.join(folder, 'clip.mp4'), Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypisom'), Buffer.alloc(4)]));
  const scan = lib.scanFiles([path.join(root, 'Ma musique')]);
  assert.equal(scan.files.length, 2, 'sous-dossiers compris');
  assert.ok(lib.addFiles(created.playlist.id, scan).ok);
  const views = lib.views(created.playlist.id);
  const song = views.find((v) => v.track.path?.endsWith('piste.mp3'))!;
  assert.equal(song.info.title, 'Ville basse');
  assert.equal(song.info.artist, 'Neons Fictifs');
  assert.ok(song.image?.startsWith(path.join(dataDir, 'juke-box', 'pochettes')), 'pochette intégrée gardée en cache');
  assert.deepEqual(fs.readFileSync(song.image!), png);
  assert.deepEqual(lib.playback(created.playlist.id, song.track.key), { kind: 'file', path: path.join(folder, 'piste.mp3'), media: 'audio', image: song.image });
  // Le fichier disparaît : il reste dans la playlist, grisé avec sa raison, jamais remplacé.
  fs.rmSync(path.join(folder, 'clip.mp4'));
  const gone = lib.views(created.playlist.id).find((v) => v.track.path?.endsWith('clip.mp4'))!;
  assert.deepEqual([gone.status.kind, gone.status.reason], ['missing', 'Fichier introuvable · déplacé ou supprimé']);
  assert.equal(lib.playback(created.playlist.id, gone.track.key), undefined);
});
