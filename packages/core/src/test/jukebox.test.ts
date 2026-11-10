// Juke-box, le socle (jukebox.ts, jukebox-youtube.ts, jukebox-files.ts, jukebox-play.ts,
// jukebox-dmd.ts) : le modèle et son stockage, la lecture d'une playlist YouTube sans rien
// télécharger, les informations des morceaux, le téléchargement par la file, la resynchronisation,
// les fichiers locaux et leurs pochettes, l'état de chaque morceau, les règles de lecture, la place
// sur le disque et l'habillage du DMD. Données fictives (artistes, titres et identifiants inventés).

import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setLanguage } from '../i18n';
import type { DownloadJob } from '../downloadqueue';
import {
  addTracks,
  createPlaylist,
  deletePlaylist,
  downloadAll,
  emptyJukebox,
  findPlaylist,
  formatTotalTime,
  formatTrackTime,
  freePlaylist,
  jukeboxSummary,
  jukeboxUsage,
  loadJukebox,
  missingFileReason,
  movePlaylist,
  musicTags,
  orphanSongs,
  parseMusicTitle,
  playlistNameProblem,
  readJukeboxLibrary,
  renamePlaylist,
  saveJukebox,
  setCorrection,
  setPlaylistQuality,
  songComplete,
  songDir,
  songFileRole,
  songKey,
  stripMentions,
  trackInfo,
  trackStatus,
  wantedHeight,
  writeSongInfos,
  type JukeboxStore,
  type JukeboxTrack,
  type LibrarySong,
  type StatusContext,
} from '../jukebox';
import { JUKEBOX_DMD_ANIMATIONS, animationColor, normalizeSkins, resolveSkin, setSkin, skinChainText, skinKeys } from '../jukebox-dmd';
import { classifyLocalName, folderCoverName, localCover, localScanSummary, localTracks, parseId3, readMediaTags, scanLocalMedia, sniffLocalMedia } from '../jukebox-files';
import {
  DEFAULT_PLAY_MODE,
  holdHint,
  initialPlayer,
  jukeboxInput,
  JUKEBOX_ELEMENT_VOLUME,
  JUKEBOX_MANAGE_HOLD_MS,
  JUKEBOX_MANAGE_KEY,
  JUKEBOX_PLAY_ALL_KEY,
  JUKEBOX_REPEAT_KEY,
  JUKEBOX_SHUFFLE_KEY,
  JUKEBOX_SEEK_HOLD_MS,
  nextPlayable,
  seekPressStep,
  seekStepSeconds,
  seekTarget,
  playerStep,
  playlistAt,
  playlistPosition,
  playlistRows,
  playModeOf,
  rowKey,
  selectedKey,
  shuffled,
  startHint,
  startPressStep,
  trackRows,
  type PlayerList,
  type PlayerState,
} from '../jukebox-play';
import { rememberPlayModes } from '../jukebox';
import { MUTE_HOLD_MS } from '../cabinetvolume';
import {
  applyPlaylistImport,
  detailArgs,
  embedErrorReason,
  embedErrorText,
  estimateSongBytes,
  jukeboxDownloadSpec,
  JUKEBOX_MIX_CAP,
  JUKEBOX_RATES,
  mergeDetails,
  parseDetailLines,
  parsePlaylistJson,
  parsePlaylistLink,
  playlistArgs,
  queuedSongs,
  resyncPlaylist,
  songDownloads,
  songRequests,
  summarizeImport,
  youtubeEmbedUrl,
  type PlaylistAnalysis,
  type PlaylistLink,
} from '../jukebox-youtube';
import { parseYtDlpLine, ytdlpArgs, YTDLP_FORMATS, YTDLP_INFO_MARK, YTDLP_VIDEO_FORMATS } from '../ytdlp';

setLanguage('fr');

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-jukebox-'));
  dirs.push(d);
  return d;
};
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const NOW = new Date('2026-11-09T20:00:00Z');
// Identifiants YouTube inventés (11 signes).
const A = 'aaaaaaaaaa1';
const B = 'bbbbbbbbbb2';
const C = 'cccccccccc3';
const D = 'dddddddddd4';
const E = 'eeeeeeeeee5';

const yt = (id: string, source: 'online' | 'download', extra: Partial<JukeboxTrack> = {}): Omit<JukeboxTrack, 'key'> => ({ source, youtube: id, title: `Néons Fictifs - Titre ${id.slice(-1)} (Official Video)`, duration: 200, added: NOW.toISOString(), ...extra });

function storeWith(...lists: { name: string; quality?: '1080p' | '720p' | 'audio'; tracks: Omit<JukeboxTrack, 'key'>[]; youtube?: JukeboxStore['playlists'][0]['youtube'] }[]): JukeboxStore {
  let s = emptyJukebox();
  for (const l of lists) {
    const c = createPlaylist(s, l.name, NOW, { ...(l.quality ? { quality: l.quality } : {}), ...(l.youtube ? { youtube: l.youtube } : {}) });
    assert.ok(c.ok);
    const a = addTracks(c.store, c.playlist.id, l.tracks, NOW);
    assert.ok(a.ok);
    s = a.store;
  }
  return s;
}

const song = (id: string, o: Partial<LibrarySong> = {}): LibrarySong => ({ id, dir: `X:\\Musique\\${id}`, audio: `X:\\Musique\\${id}\\son.m4a`, video: `X:\\Musique\\${id}\\video.mp4`, audioBytes: 3_000_000, videoBytes: 50_000_000, bytes: 53_000_000, ...o });

// ---------------------------------------------------------------------------
// 1. Modèle et stockage

test('index : écrit d’un coup, relu tel quel ; illisible ou abîmé, rien n’est perdu d’autre', () => {
  const dir = tmp();
  const s = storeWith({ name: 'Néon nocturne', tracks: [yt(A, 'online'), yt(B, 'download'), { source: 'file', path: 'E:\\Musique perso\\Piste.mp3', media: 'audio', title: 'Piste', added: NOW.toISOString() }] });
  saveJukebox(dir, s);
  assert.ok(fs.existsSync(path.join(dir, 'juke-box.json')));
  assert.deepEqual(fs.readdirSync(dir), ['juke-box.json'], 'aucun fichier temporaire laissé');
  const back = loadJukebox(dir, normalizeSkins);
  assert.deepEqual(back.playlists, s.playlists);
  assert.equal(back.skins.default.animation, 'spectre');
  // Un morceau abîmé (identifiant YouTube faux) est oublié, la playlist reste.
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'juke-box.json'), 'utf8'));
  raw.playlists[0].tracks[0].youtube = '../../Windows';
  raw.playlists.push({ name: 'sans identifiant' });
  fs.writeFileSync(path.join(dir, 'juke-box.json'), JSON.stringify(raw));
  const fixed = loadJukebox(dir);
  assert.equal(fixed.playlists.length, 1);
  assert.equal(fixed.playlists[0]!.tracks.length, 2);
  fs.writeFileSync(path.join(dir, 'juke-box.json'), '{ illisible');
  assert.deepEqual(loadJukebox(dir).playlists, []);
  assert.deepEqual(loadJukebox(tmp()).playlists, []);
});

test('playlists : créer, renommer, refuser un nom vide ou pris, réordonner, supprimer sans toucher aux fichiers', () => {
  let s = emptyJukebox();
  const a = createPlaylist(s, '  Néon nocturne ', NOW);
  assert.ok(a.ok);
  assert.equal(a.playlist.name, 'Néon nocturne');
  assert.equal(a.playlist.quality, '1080p', '1080p par défaut');
  s = a.store;
  assert.equal(playlistNameProblem(s, 'néon NOCTURNE'), 'Une playlist porte déjà ce nom');
  assert.equal(playlistNameProblem(s, '   '), 'Donnez un nom à la playlist');
  assert.match(playlistNameProblem(s, 'x'.repeat(61))!, /trop long/);
  const b = createPlaylist(s, 'Arcade 84', NOW);
  assert.ok(b.ok);
  s = b.store;
  assert.notEqual(a.playlist.id, b.playlist.id);
  const r = renamePlaylist(s, b.playlist.id, 'Route côtière', NOW);
  assert.ok(r.ok);
  s = movePlaylist(r.store, b.playlist.id, -1);
  assert.deepEqual(s.playlists.map((p) => p.name), ['Route côtière', 'Néon nocturne']);
  assert.equal(movePlaylist(s, b.playlist.id, -1), s, 'déjà en tête : rien ne bouge');
  const added = addTracks(s, a.playlist.id, [yt(A, 'download'), yt(B, 'online')], NOW);
  assert.ok(added.ok);
  const twice = addTracks(added.store, a.playlist.id, [yt(A, 'online'), yt(C, 'online')], NOW);
  assert.ok(twice.ok);
  assert.equal(twice.duplicates, 1, 'un morceau déjà présent n’est pas ajouté deux fois');
  assert.deepEqual(findPlaylist(twice.store, a.playlist.id)!.tracks.map((t) => t.key), ['t1', 't2', 't3']);
  const d = deletePlaylist(twice.store, a.playlist.id);
  assert.ok(d.ok);
  assert.deepEqual(d.orphans.sort(), [A, B, C].sort(), 'morceaux qu’aucune playlist n’utilise plus : signalés, jamais effacés ici');
});

test('bibliothèque : un dossier par identifiant YouTube, son, vidéo muette, miniature, infos.json ; partiels ignorés', () => {
  const root = tmp();
  assert.throws(() => songDir(root, '..\\..\\x'), /invalide/);
  const dir = songDir(root, A);
  assert.equal(dir, path.join(root, 'Musique', A));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'son.m4a'), Buffer.alloc(300));
  fs.writeFileSync(path.join(dir, 'video.mp4.part'), Buffer.alloc(100));
  fs.writeFileSync(path.join(dir, 'miniature.webp'), Buffer.alloc(10));
  writeSongInfos(dir, { id: A, title: 'Titre A', artist: 'Néons Fictifs', url: `https://www.youtube.com/watch?v=${A}`, fetched: NOW.toISOString() });
  fs.mkdirSync(path.join(root, 'Musique', 'pas-un-id'));
  const lib = readJukeboxLibrary(root);
  assert.deepEqual([...lib.keys()], [A]);
  const s = lib.get(A)!;
  assert.equal(s.audio, path.join(dir, 'son.m4a'));
  assert.equal(s.video, undefined, 'la vidéo en cours de téléchargement n’est pas encore là');
  assert.equal(s.thumbnail, path.join(dir, 'miniature.webp'));
  assert.equal(s.infos?.artist, 'Néons Fictifs');
  assert.ok(s.bytes >= 410, 'le dossier entier compte, partiel compris');
  assert.equal(songComplete(s, 0), true, 'son seul : complet');
  assert.equal(songComplete(s, 1080), false, '1080p : la vidéo manque');
  assert.equal(songFileRole('son.webm'), 'audio');
  assert.equal(songFileRole('video.mp4.part'), undefined);
  assert.equal(songFileRole('video.f137.mp4.part-Frag3'), undefined);
});

// ---------------------------------------------------------------------------
// 2. Lecture d'une playlist YouTube sans rien télécharger

const PL: PlaylistLink = { list: 'PLexemple0001', url: 'https://www.youtube.com/playlist?list=PLexemple0001', mix: false };

function flatJson(entries: Record<string, unknown>[]) {
  return { _type: 'playlist', id: 'PLexemple0001', title: 'Néon nocturne (exemple)', channel: 'Chaîne Fictive', entries };
}

test('lien : playlist, vidéo dans une playlist, Mix ; refus expliqués', () => {
  assert.deepEqual(parsePlaylistLink('https://www.youtube.com/playlist?list=PLexemple0001'), PL);
  assert.deepEqual(parsePlaylistLink(`youtube.com/watch?v=${A}&list=PLexemple0001&index=3`), PL);
  assert.deepEqual(parsePlaylistLink('https://music.youtube.com/playlist?list=OLAKexemple'), { list: 'OLAKexemple', url: 'https://www.youtube.com/playlist?list=OLAKexemple', mix: false });
  assert.equal((parsePlaylistLink(`https://www.youtube.com/watch?v=${A}&list=RDexemple`) as PlaylistLink).mix, true);
  assert.match((parsePlaylistLink(`https://youtu.be/${A}`) as { refused: string }).refused, /vidéo, pas à une playlist/);
  assert.match((parsePlaylistLink('https://exemple.com/?list=PL1') as { refused: string }).refused, /YouTube/);
  // À regarder plus tard : une playlist personnelle, lue avec les cookies du compte YouTube.
  assert.deepEqual(parsePlaylistLink('https://www.youtube.com/playlist?list=WL'), { list: 'WL', url: 'https://www.youtube.com/playlist?list=WL', mix: false, personal: true });
  // yt-dlp : liste à plat, un seul JSON ; un Mix est plafonné.
  const args = playlistArgs(PL, 'C:\\CP\\Cyber Pinball.exe');
  assert.ok(args.includes('--flat-playlist') && args.includes('-J'));
  assert.equal(args.at(-1), PL.url);
  assert.ok(!args.includes('--playlist-end'));
  const mix = playlistArgs({ list: 'RDexemple', url: 'https://www.youtube.com/playlist?list=RDexemple', mix: true });
  assert.equal(mix[mix.indexOf('--playlist-end') + 1], String(JUKEBOX_MIX_CAP));
});

test('liste à plat : titres, durées, miniatures ; privées, supprimées, réservées signalées avec leur raison', () => {
  const a = parsePlaylistJson(
    flatJson([
      { id: A, title: 'Néons Fictifs - Ville basse (Official Video)', duration: 215.4, channel: 'Néons Fictifs', thumbnails: [{ url: 'https://i.ytimg.com/vi/x/default.jpg', width: 120 }, { url: 'https://i.ytimg.com/vi/x/hq.jpg', width: 480 }] },
      { id: B, title: '[Private video]', duration: null },
      { id: C, title: '[Deleted video]' },
      { id: D, title: 'Réservé', availability: 'subscriber_only', duration: 100 },
      { id: E, title: 'Bientôt', live_status: 'is_upcoming' },
      { id: A, title: 'doublon' },
      { id: 'court', title: 'identifiant faux' },
    ]),
    PL,
  )!;
  assert.equal(a.title, 'Néon nocturne (exemple)');
  assert.equal(a.entries.length, 5, 'doublons et identifiants faux écartés');
  assert.equal(a.entries[0]!.thumbnail, 'https://i.ytimg.com/vi/x/hq.jpg', 'la miniature la plus proche de 480 px');
  assert.equal(a.entries[0]!.duration, 215.4);
  assert.deepEqual(a.entries.map((e) => e.unavailable), [undefined, 'private', 'deleted', 'members', 'live']);
  assert.equal(a.entries[1]!.title, 'Vidéo privée');
  assert.equal(a.entries[2]!.thumbnail, `https://i.ytimg.com/vi/${C}/mqdefault.jpg`);
  assert.equal(a.capped, false);
  const mix = parsePlaylistJson({ entries: Array.from({ length: JUKEBOX_MIX_CAP }, (_, i) => ({ id: `mixmixmix${String(i).padStart(2, '0')}`, title: `M ${i}` })) }, { ...PL, mix: true })!;
  assert.equal(mix.capped, true);
  assert.equal(parsePlaylistJson({ id: A, title: 'une vidéo' }, PL), undefined);

  // Seconde lecture : champs musicaux, et ce que la liste ne dit pas (bloquée dans votre pays).
  const lines = [
    `${YTDLP_INFO_MARK}${JSON.stringify({ id: A, title: 'Néons Fictifs - Ville basse (Official Video)', artist: 'Néons Fictifs', album: 'Nuits à venir', track: 'Ville basse', duration: 215 })}`,
    `ERROR: [youtube] ${D}: Video unavailable. The uploader has not made this video available in your country`,
    `ERROR: [youtube] ${E}: Sign in to confirm you’re not a bot`,
    'WARNING: autre chose',
  ];
  const det = parseDetailLines(lines);
  assert.deepEqual(det.get(A), { tags: { artist: 'Néons Fictifs', album: 'Nuits à venir', track: 'Ville basse' }, title: 'Néons Fictifs - Ville basse (Official Video)', duration: 215 });
  assert.deepEqual(det.get(D), { unavailable: 'blocked', detail: 'Bloquée dans votre pays' });
  assert.equal(det.has(E), false, 'la demande de preuve « pas un robot » n’est pas une raison propre à la vidéo');
  const merged = mergeDetails(a, det);
  assert.equal(merged.entries[0]!.album, 'Nuits à venir');
  assert.equal(merged.entries[3]!.unavailable, 'blocked');
  const dargs = detailArgs([A, 'faux']);
  assert.ok(dargs.includes('--skip-download') && dargs.includes('--ignore-errors'));
  assert.deepEqual(dargs.filter((x) => x.startsWith('https://')), [`https://www.youtube.com/watch?v=${A}`]);
});

test('import : nombre, durée, taille estimée selon la qualité, morceaux déjà sur la borne réutilisés, sautés avec leur raison', () => {
  const a: PlaylistAnalysis = {
    link: PL,
    title: 'Néon nocturne',
    capped: false,
    entries: [
      { id: A, title: 'A', duration: 200 },
      { id: B, title: 'B', duration: 100 },
      { id: C, title: 'C', unavailable: 'private' },
      { id: D, title: 'D' },
    ],
  };
  const lib = new Map([[B, song(B, { video: undefined, videoBytes: 0, bytes: 3_000_000 })]]);
  const sum = summarizeImport(a, { library: lib });
  assert.equal(sum.count, 4);
  assert.equal(sum.available, 3);
  assert.deepEqual(sum.skipped.map((x) => x.reason), ['Vidéo privée']);
  assert.equal(sum.chosen, 3);
  assert.equal(sum.duration, 300);
  assert.equal(sum.reused, 1);
  assert.equal(sum.approx, true, 'une durée manque : estimation supposée');
  // B a déjà son son : seule sa vidéo compte ; D sans durée : 240 s supposées.
  assert.equal(sum.bytes.audio, estimateSongBytes(200, 0) + estimateSongBytes(240, 0));
  assert.equal(sum.bytes['1080p'], estimateSongBytes(200, 1080) + JUKEBOX_RATES[1080] * 100 + estimateSongBytes(240, 1080));
  assert.ok(sum.bytes['1080p'] > sum.bytes['720p'] && sum.bytes['720p'] > sum.bytes.audio);
  const chosen = summarizeImport(a, { chosen: new Set([A]) });
  assert.equal(chosen.chosen, 1);

  // Nouvelle playlist, en ligne : rien à télécharger ; sautés non ajoutés.
  const online = applyPlaylistImport(emptyJukebox(), { analysis: a, target: { name: 'Néon nocturne' }, mode: 'online', quality: '720p', library: lib, now: NOW });
  assert.ok(online.ok);
  assert.equal(online.added.length, 3);
  assert.equal(online.skipped, 1);
  assert.deepEqual(online.enqueue, []);
  assert.equal(online.playlist.quality, '720p');
  assert.deepEqual(online.playlist.youtube, { list: PL.list, url: PL.url, title: 'Néon nocturne', mode: 'online', synced: NOW.toISOString() });
  assert.ok(online.added.every((t) => t.source === 'online' && t.list === PL.list));
  // Playlist existante, sur la borne, un morceau décoché : la qualité de la playlist ne change pas.
  const dl = applyPlaylistImport(online.store, { analysis: a, target: { playlist: online.playlist.id }, chosen: new Set([A, B]), mode: 'download', library: lib, now: NOW });
  assert.ok(dl.ok);
  assert.equal(dl.added.length, 0);
  assert.equal(dl.duplicates, 2);
  const other = createPlaylist(online.store, 'Arcade 84', NOW);
  assert.ok(other.ok);
  const dl2 = applyPlaylistImport(other.store, { analysis: a, target: { playlist: other.playlist.id }, chosen: new Set([A, B]), mode: 'download', library: lib, now: NOW });
  assert.ok(dl2.ok);
  assert.deepEqual(dl2.enqueue, [A, B], 'B a son son mais pas sa vidéo 1080p');
  assert.equal(findPlaylist(dl2.store, other.playlist.id)!.quality, '1080p');
});

// ---------------------------------------------------------------------------
// 3. Informations des morceaux

test('informations : champs musicaux de yt-dlp, sinon « Artiste - Titre » sans mentions ; la correction à la main l’emporte', () => {
  assert.equal(stripMentions('Ville basse (Official Video)'), 'Ville basse');
  assert.equal(stripMentions('Ville basse [Clip officiel] [4K]'), 'Ville basse');
  assert.equal(stripMentions('Ville basse (Live à la Halle)'), 'Ville basse (Live à la Halle)');
  assert.equal(stripMentions('Ville basse (Remix officiel)'), 'Ville basse (Remix officiel)');
  assert.equal(stripMentions('Ville basse | Official Music Video'), 'Ville basse');
  assert.deepEqual(parseMusicTitle('Néons Fictifs - Ville basse (Official Audio)'), { artist: 'Néons Fictifs', title: 'Ville basse' });
  assert.deepEqual(parseMusicTitle('Néons Fictifs – « Ville basse » (Lyric Video)'), { artist: 'Néons Fictifs', title: 'Ville basse' });
  assert.deepEqual(parseMusicTitle('Ville basse', 'Néons Fictifs - Topic'), { artist: 'Néons Fictifs', title: 'Ville basse' });
  assert.deepEqual(parseMusicTitle('Ville basse', 'NeonsFictifsVEVO'), { artist: 'NeonsFictifs', title: 'Ville basse' });
  assert.deepEqual(parseMusicTitle('Ville basse', 'Chaîne quelconque'), { title: 'Ville basse' });
  assert.deepEqual(musicTags({ artists: ['Néons Fictifs', 'Invité Fictif'], album: 'Nuits à venir', track: 'Ville basse' }), { artist: 'Néons Fictifs, Invité Fictif', album: 'Nuits à venir', title: 'Ville basse' });
  assert.equal(musicTags({ artist: '  ' }), undefined);

  const guessed: JukeboxTrack = { key: 't1', ...yt(A, 'online') } as JukeboxTrack;
  assert.deepEqual(trackInfo(guessed), { title: 'Titre 1', artist: 'Néons Fictifs', from: { title: 'title', artist: 'title' } });
  const tagged = { ...guessed, tags: { artist: 'Autre Artiste', album: 'Album Fictif', title: 'Vrai titre' } };
  assert.deepEqual(trackInfo(tagged), { title: 'Vrai titre', artist: 'Autre Artiste', album: 'Album Fictif', from: { title: 'tags', artist: 'tags', album: 'tags' } });
  let s = storeWith({ name: 'P', tracks: [yt(A, 'online')] });
  s = setCorrection(s, songKey(guessed), { artist: 'Artiste corrigé', album: '' });
  assert.deepEqual(trackInfo(tagged, s.corrections), { title: 'Vrai titre', artist: 'Artiste corrigé', album: 'Album Fictif', from: { title: 'tags', artist: 'manual', album: 'tags' } });
  s = setCorrection(s, songKey(guessed), { artist: '' });
  assert.deepEqual(s.corrections, {}, 'une correction vidée est retirée');
  const file: JukeboxTrack = { key: 't2', source: 'file', path: 'E:\\Musique\\Néons Fictifs\\01 - Néons Fictifs - Ville_basse.mp3', media: 'audio', title: 'x', added: '' };
  assert.deepEqual(trackInfo(file), { title: 'Ville basse', artist: 'Néons Fictifs', from: { title: 'title', artist: 'title' } });
});

// ---------------------------------------------------------------------------
// 4. Téléchargement

test('téléchargement : deux fichiers par morceau (son M4A, vidéo muette), format 720p, nom fixe, reprise', () => {
  assert.equal(YTDLP_VIDEO_FORMATS[1080], YTDLP_FORMATS.video);
  assert.match(YTDLP_VIDEO_FORMATS[720], /^bestvideo\[ext=mp4\]\[vcodec\^=avc1\]\[height<=720\]/);
  assert.ok(!YTDLP_VIDEO_FORMATS[720].includes('1080'));
  const args = ytdlpArgs({ url: `https://www.youtube.com/watch?v=${A}`, want: 'video', dir: 'D:\\CP\\Musique\\' + A, name: 'video', format: YTDLP_VIDEO_FORMATS[720], info: true });
  assert.equal(args[args.indexOf('-o') + 1], `D:\\CP\\Musique\\${A}\\video.%(ext)s`);
  assert.equal(args[args.indexOf('-f') + 1], YTDLP_VIDEO_FORMATS[720]);
  assert.ok(args.some((x) => x.startsWith(`after_move:${YTDLP_INFO_MARK}`)));
  const thumb = ytdlpArgs({ url: 'u', want: 'audio', dir: 'D:\\x', name: 'son', thumbnail: true });
  assert.ok(thumb.includes('--write-thumbnail'));
  assert.ok(thumb.includes('thumbnail:D:\\x\\miniature.%(ext)s'));
  // Sans les options du Juke-box : rien ne change pour la récupération d'un média.
  assert.equal(ytdlpArgs({ url: 'u', want: 'audio', dir: 'D:\\x' }).includes('--write-thumbnail'), false);
  assert.deepEqual(parseYtDlpLine(`${YTDLP_INFO_MARK}{"id":"${A}","height":720}`), { kind: 'info', info: { id: A, height: 720 } });
  assert.equal(parseYtDlpLine(`${YTDLP_INFO_MARK}{abîmé`), undefined);

  const root = 'D:\\CP';
  const spec = jukeboxDownloadSpec(root, { id: 'pl1', name: 'Néon nocturne' }, [
    { id: A, title: 'Ville basse', duration: 100, height: 1080, have: { audio: false, video: false } },
    { id: B, title: 'Route', duration: 100, height: 720, have: { audio: true, video: false } },
    { id: C, title: 'Son seul', height: 0, have: { audio: false, video: false } },
    { id: D, title: 'Déjà là', height: 1080, have: { audio: true, video: true } },
  ])!;
  assert.equal(spec.kind, 'jukebox');
  assert.deepEqual(spec.source, { kind: 'youtube', label: 'YouTube' });
  assert.equal(spec.title, 'Juke-box · Néon nocturne : 3 morceaux');
  assert.deepEqual(spec.back, { screen: 'jukebox', playlist: 'pl1' });
  assert.equal(spec.resumable, true);
  assert.deepEqual(spec.files.map((f) => [f.meta!.song, f.meta!.want, f.meta!.height]), [[A, 'audio', undefined], [A, 'video', 1080], [B, 'video', 720], [C, 'audio', undefined]]);
  assert.ok(spec.files.every((f) => f.optional), 'une vidéo devenue privée est sautée, les autres arrivent');
  assert.equal(spec.files[0]!.dest, path.join(root, 'Musique', A, 'son.m4a'));
  assert.equal(spec.files[0]!.part, path.join(root, 'Musique', A, 'son.m4a.part'), 'le partiel de yt-dlp garde son nom : il reprend');
  assert.equal(spec.files[2]!.meta!.format, YTDLP_VIDEO_FORMATS[720]);
  assert.equal(jukeboxDownloadSpec(root, { id: 'pl1', name: 'x' }, [{ id: D, title: 'Déjà là', height: 1080, have: { audio: true, video: true } }]), undefined);
});

test('« Tout télécharger », « Libérer la place », passage au son seul : un morceau partagé n’est stocké et compté qu’une fois', () => {
  const s0 = storeWith(
    { name: 'Néon nocturne', tracks: [yt(A, 'online'), yt(B, 'online'), yt(C, 'download'), { source: 'file', path: 'E:\\f.mp3', media: 'audio', title: 'f', added: '' }] },
    { name: 'Arcade 84', quality: '720p', tracks: [yt(B, 'download')] },
  );
  const [p1, p2] = s0.playlists as [JukeboxStore['playlists'][0], JukeboxStore['playlists'][0]];
  const lib = new Map([[B, song(B)], [C, song(C)]]);
  const all = downloadAll(s0, p1.id, lib, NOW);
  assert.ok(all.ok);
  assert.deepEqual(findPlaylist(all.store, p1.id)!.tracks.map((t) => t.source), ['download', 'download', 'download', 'file'], 'les fichiers locaux gardent leur source');
  assert.deepEqual(all.enqueue, [A], 'B et C sont déjà sur la borne');
  assert.equal(wantedHeight(all.store, B), 1080, 'la meilleure qualité demandée');

  const free = freePlaylist(all.store, p1.id, lib, NOW);
  assert.ok(free.ok);
  assert.deepEqual(findPlaylist(free.store, p1.id)!.tracks.map((t) => t.source), ['online', 'online', 'online', 'file']);
  assert.deepEqual(free.remove, [C], 'B reste : Arcade 84 le veut sur la borne');
  assert.equal(free.bytes, song(C).bytes);

  // Son seul : la vidéo de C peut partir, pas celle de B (Arcade 84 la veut en 720p).
  const q = setPlaylistQuality(all.store, p1.id, 'audio', lib, NOW);
  assert.ok(q.ok);
  assert.deepEqual(q.savings, { songs: [C], bytes: song(C).videoBytes });
  assert.equal(wantedHeight(q.store, B), 720);
  const up = setPlaylistQuality(q.store, p1.id, '1080p', new Map([[C, song(C, { video: undefined })]]), NOW);
  assert.ok(up.ok);
  assert.deepEqual(up.download, [A, B, C]);
  assert.equal(p2.quality, '720p');
});

test('file : progression par morceau, attente, échec avec sa raison ; jamais deux fois le même morceau', () => {
  const dir = tmp();
  const part = path.join(dir, 'son.m4a.part');
  fs.writeFileSync(part, Buffer.alloc(500));
  const file = (song: string, want: string, o: Record<string, unknown> = {}) => ({ ref: 'u', name: 'n', part: o.part as string ?? path.join(dir, `${song}${want}.part`), optional: true, meta: { song, want, estimate: 1000 }, ...o });
  const job = (state: DownloadJob['state'], files: DownloadJob['files'], o: Partial<DownloadJob> = {}): DownloadJob => ({ id: 'j' + state, kind: 'jukebox', title: 'x', source: { kind: 'youtube', label: 'YouTube' }, files, state, back: { screen: 'jukebox' }, created: '', updated: '', tries: 0, resumable: true, ...o });
  const jobs = [
    job('running', [file(A, 'audio', { done: true, bytes: 1000 }), file(A, 'video', { part }), file(B, 'audio'), file(C, 'audio', { done: true, skipped: { reason: 'refused', detail: 'Vidéo privée' } })]),
    job('waiting', [file(D, 'audio')], { id: 'jw', reason: 'network' }),
  ];
  const d = songDownloads(jobs);
  assert.deepEqual(d.get(A), { state: 'running', percent: 75 });
  assert.deepEqual(d.get(B), { state: 'queued' });
  assert.deepEqual(d.get(C), { state: 'failed', reason: 'Vidéo privée' });
  assert.equal(d.get(D)!.state, 'waiting');
  assert.equal(d.get(D)!.reason, 'le site ne répond plus');
  assert.deepEqual([...queuedSongs(jobs)].sort(), [A, B, D]);
  // Morceaux à demander : jamais un déjà complet ; la hauteur vient de toutes les playlists.
  const s = storeWith({ name: 'P', quality: '720p', tracks: [yt(A, 'download'), yt(E, 'download')] });
  assert.deepEqual(songRequests(s, [A, E], new Map([[E, song(E)]])), [{ id: A, title: yt(A, 'download').title, duration: 200, height: 720, have: { audio: false, video: false } }]);
});

// ---------------------------------------------------------------------------
// 5. Resynchronisation

test('resynchronisation : nouveaux ajoutés ; retiré de YouTube mais sur la borne, jouable avec son repère ; retour du morceau', () => {
  const origin = { list: PL.list, url: PL.url, mode: 'download' as const };
  const s0 = storeWith({ name: 'Néon nocturne', youtube: origin, tracks: [yt(A, 'download', { list: PL.list }), yt(B, 'online', { list: PL.list }), yt(C, 'download', { list: PL.list }), yt(D, 'online')] });
  const id = s0.playlists[0]!.id;
  const lib = new Map([[A, song(A)]]);
  const analysis: PlaylistAnalysis = { link: PL, title: 'Néon nocturne', capped: false, entries: [{ id: C, title: 'C', unavailable: 'private' }, { id: E, title: 'Nouveau', duration: 180 }] };
  const r = resyncPlaylist(s0, id, analysis, lib, NOW);
  assert.ok(r.ok);
  const p = findPlaylist(r.store, id)!;
  assert.deepEqual(r.added.map((t) => [t.youtube, t.source]), [[E, 'download']]);
  assert.deepEqual(r.removed.map((t) => t.youtube).sort(), [A, B].sort(), 'D n’a pas été importé de cette liste : rien n’est marqué');
  assert.equal(p.tracks.find((t) => t.youtube === C)!.unavailable?.reason, 'private');
  assert.deepEqual(p.youtube!.found, { added: 1, removed: 2 });
  assert.equal(p.youtube!.synced, NOW.toISOString());
  assert.deepEqual(r.enqueue, [E]);
  const ctx: StatusContext = { library: lib, online: true, fileExists: () => true };
  const statusOf = (yid: string) => trackStatus(p.tracks.find((t) => t.youtube === yid)!, ctx);
  assert.deepEqual(statusOf(A), { kind: 'removed', playable: true, play: 'local', label: 'Retiré de YouTube · sur la borne', reason: 'Retiré de YouTube' });
  assert.deepEqual(statusOf(B), { kind: 'unavailable', playable: false, label: 'Retiré de YouTube', reason: 'Retiré de YouTube' });
  assert.equal(statusOf(C).label, 'Vidéo privée');
  // Revenu dans la liste : le repère part.
  const back = resyncPlaylist(r.store, id, { ...analysis, entries: [{ id: A, title: 'A' }, { id: C, title: 'C' }] }, lib, NOW);
  assert.ok(back.ok);
  assert.deepEqual(back.back.map((t) => t.youtube).sort(), [A, C].sort());
  assert.equal(findPlaylist(back.store, id)!.tracks.find((t) => t.youtube === A)!.removed, undefined);
  // Un Mix : on ajoute, on ne marque rien de retiré.
  const mix = storeWith({ name: 'Mix', youtube: { ...origin, mix: true, list: 'RDexemple' }, tracks: [yt(A, 'online', { list: 'RDexemple' })] });
  const m = resyncPlaylist(mix, mix.playlists[0]!.id, { ...analysis, link: { ...PL, list: 'RDexemple', mix: true } }, lib, NOW);
  assert.ok(m.ok);
  assert.equal(m.removed.length, 0);
  const manual = storeWith({ name: 'Sans source', tracks: [] });
  assert.equal((resyncPlaylist(manual, manual.playlists[0]!.id, analysis, lib, NOW) as { ok: false; reason: string }).reason, 'Cette playlist ne vient pas de YouTube');
});

// ---------------------------------------------------------------------------
// 6. Fichiers locaux

/** MP3 avec un ID3v2.3 : titre en UTF-16, artiste, pochette PNG (couverture). */
function mp3WithTags(): Buffer {
  const frame = (id: string, data: Buffer) => {
    const h = Buffer.alloc(10);
    h.write(id, 0, 'latin1');
    h.writeUInt32BE(data.length, 4);
    return Buffer.concat([h, data]);
  };
  const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(40, 7)]);
  const body = Buffer.concat([
    frame('TIT2', Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from('Ville basse', 'utf16le')])),
    frame('TPE1', Buffer.concat([Buffer.from([0]), Buffer.from('Néons Fictifs', 'latin1')])),
    frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0', 'latin1'), Buffer.from([3]), Buffer.from('pochette\0', 'latin1'), png])),
  ]);
  const size = body.length;
  const head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
  return Buffer.concat([head, body, Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(64)]);
}

/** FLAC : commentaires Vorbis et bloc PICTURE (JPEG). */
function flacWithTags(): Buffer {
  const block = (type: number, data: Buffer, last = false) => Buffer.concat([Buffer.from([(last ? 0x80 : 0) | type, (data.length >> 16) & 0xff, (data.length >> 8) & 0xff, data.length & 0xff]), data]);
  const u32le = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  const u32be = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const comments = ['TITLE=Route côtière', 'ARTIST=Orbite Fictive', 'ALBUM=Rivages'].map((c) => Buffer.from(c, 'utf8'));
  const vorbis = Buffer.concat([u32le(4), Buffer.from('test'), u32le(comments.length), ...comments.flatMap((c) => [u32le(c.length), c])]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 3)]);
  const pic = Buffer.concat([u32be(3), u32be(10), Buffer.from('image/jpeg'), u32be(0), u32be(1), u32be(1), u32be(24), u32be(0), u32be(jpeg.length), jpeg]);
  return Buffer.concat([Buffer.from('fLaC'), block(0, Buffer.alloc(34)), block(4, vorbis), block(6, pic, true), Buffer.alloc(32)]);
}

/** M4A : ftyp, mdat, puis moov à la fin avec udta › meta › ilst (©nam, ©ART, ©alb, covr). */
function m4aWithTags(): Buffer {
  const box = (type: string, ...content: Buffer[]) => {
    const body = Buffer.concat(content);
    const h = Buffer.alloc(8);
    h.writeUInt32BE(8 + body.length);
    h.write(type, 4, 'latin1');
    return Buffer.concat([h, body]);
  };
  const data = (kind: number, payload: Buffer) => box('data', Buffer.from([0, 0, 0, kind, 0, 0, 0, 0]), payload);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 9)]);
  const ilst = box('ilst', box('\u00a9nam', data(1, Buffer.from('Orbite'))), box('\u00a9ART', data(1, Buffer.from('Artiste Fictif'))), box('\u00a9alb', data(1, Buffer.from('Album Fictif'))), box('covr', data(13, jpeg)));
  const meta = box('meta', Buffer.alloc(4), box('hdlr', Buffer.alloc(25)), ilst);
  return Buffer.concat([box('ftyp', Buffer.from('M4A \0\0\0\0M4A mp42isom')), box('mdat', Buffer.alloc(200, 1)), box('moov', box('mvhd', Buffer.alloc(100)), box('udta', meta))]);
}

test('fichiers locaux : dossier et sous-dossiers, nombre annoncé, refusés listés avec leur raison, jonctions non suivies', () => {
  const root = tmp();
  const music = path.join(root, 'Ma musique');
  fs.mkdirSync(path.join(music, 'Album 2', 'Disque 1'), { recursive: true });
  fs.mkdirSync(path.join(music, '.cache'));
  fs.writeFileSync(path.join(music, '02 - Piste.mp3'), mp3WithTags());
  fs.writeFileSync(path.join(music, '10 - Piste.mp3'), mp3WithTags());
  fs.writeFileSync(path.join(music, 'Album 2', 'Route.flac'), flacWithTags());
  fs.writeFileSync(path.join(music, 'Album 2', 'Disque 1', 'Clip.mp4'), m4aWithTags());
  fs.writeFileSync(path.join(music, 'Album 2', 'Ancien.avi'), Buffer.alloc(10));
  fs.writeFileSync(path.join(music, 'Album 2', 'Vide.ogg'), Buffer.alloc(0));
  fs.writeFileSync(path.join(music, 'Album 2', 'Faux.mp3'), Buffer.from('ceci n’est pas un mp3'));
  fs.writeFileSync(path.join(music, 'cover.jpg'), Buffer.alloc(10));
  fs.writeFileSync(path.join(music, 'notes.txt'), 'x');
  fs.writeFileSync(path.join(music, '.cache', 'caché.mp3'), mp3WithTags());
  // Une jonction vers un autre dossier : jamais suivie.
  const elsewhere = path.join(root, 'Ailleurs');
  fs.mkdirSync(elsewhere);
  fs.writeFileSync(path.join(elsewhere, 'Autre.mp3'), mp3WithTags());
  fs.symlinkSync(elsewhere, path.join(music, 'Lien'), 'junction');

  const scan = scanLocalMedia([music, path.join(root, 'absent')]);
  assert.deepEqual(scan.files.map((f) => path.relative(music, f.path)), ['02 - Piste.mp3', '10 - Piste.mp3', path.join('Album 2', 'Route.flac'), path.join('Album 2', 'Disque 1', 'Clip.mp4')], 'ordre naturel, sous-dossiers compris');
  assert.deepEqual(scan.files.map((f) => f.media), ['audio', 'audio', 'audio', 'video']);
  assert.deepEqual(scan.refused.map((r) => [path.basename(r.path), r.text]), [['Ancien.avi', 'Format non pris en charge'], ['Faux.mp3', 'Fichier illisible'], ['Vide.ogg', 'Fichier vide']]);
  assert.equal(scan.ignored, 2, 'image et texte ignorés sans bruit');
  assert.equal(scan.folders, 3);
  assert.deepEqual(scan.missing, [path.join(root, 'absent')]);
  assert.equal(localScanSummary(scan), '4 fichiers trouvés dans 3 dossiers · 3 refusés');
  assert.equal(scanLocalMedia([music], { limit: 2 }).truncated, true);
  assert.equal(scanLocalMedia([path.join(music, '02 - Piste.mp3')]).files.length, 1, 'un fichier seul');

  assert.deepEqual(classifyLocalName('x.MKV'), { media: 'video' });
  assert.deepEqual(classifyLocalName('x.wma'), { refused: 'format' });
  assert.equal(classifyLocalName('x.jpg'), undefined);
  assert.equal(sniffLocalMedia(Buffer.from('OggS\0'), 'opus'), true);
  assert.equal(sniffLocalMedia(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'webm'), true);
  assert.equal(sniffLocalMedia(Buffer.from('RIFF\0\0\0\0WAVE'), 'wav'), true);

  const tracks = localTracks(scan.files, NOW, (f) => {
    const t2 = readMediaTags(f);
    return t2 ? { ...(t2.title ? { title: t2.title } : {}), ...(t2.artist ? { artist: t2.artist } : {}) } : undefined;
  });
  assert.deepEqual(tracks[0], { source: 'file', path: path.join(music, '02 - Piste.mp3'), media: 'audio', title: 'Piste', tags: { title: 'Ville basse', artist: 'Néons Fictifs' }, added: NOW.toISOString() });
});

test('pochette : image intégrée (ID3 APIC, FLAC PICTURE, MP4 covr), puis image du dossier, sinon aucune', () => {
  const dir = tmp();
  const mp3 = path.join(dir, 'a.mp3');
  fs.writeFileSync(mp3, mp3WithTags());
  const t1 = readMediaTags(mp3)!;
  assert.equal(t1.title, 'Ville basse');
  assert.equal(t1.artist, 'Néons Fictifs');
  assert.equal(t1.cover?.mime, 'image/png');
  assert.equal(t1.cover?.data.length, 48);
  const flac = path.join(dir, 'b.flac');
  fs.writeFileSync(flac, flacWithTags());
  const t2 = readMediaTags(flac)!;
  assert.deepEqual([t2.title, t2.artist, t2.album, t2.cover?.mime], ['Route côtière', 'Orbite Fictive', 'Rivages', 'image/jpeg']);
  const m4a = path.join(dir, 'c.m4a');
  fs.writeFileSync(m4a, m4aWithTags());
  const t3 = readMediaTags(m4a)!;
  assert.deepEqual([t3.title, t3.artist, t3.album, t3.cover?.mime, t3.cover?.data.length], ['Orbite', 'Artiste Fictif', 'Album Fictif', 'image/jpeg', 24]);
  assert.equal(localCover(mp3)?.kind, 'embedded');

  // Sans image intégrée : celle du dossier (cover avant folder), sinon la seule image, sinon rien.
  const plain = path.join(dir, 'd.mp3');
  fs.writeFileSync(plain, Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0]), Buffer.alloc(30)]));
  assert.equal(localCover(plain)?.kind, undefined);
  fs.writeFileSync(path.join(dir, 'Folder.png'), Buffer.alloc(5));
  assert.deepEqual(localCover(plain), { kind: 'folder', path: path.join(dir, 'Folder.png') });
  fs.writeFileSync(path.join(dir, 'cover.JPG'), Buffer.alloc(5));
  assert.deepEqual(localCover(plain), { kind: 'folder', path: path.join(dir, 'cover.JPG') });
  assert.equal(folderCoverName(['photo.jpg']), 'photo.jpg');
  assert.equal(folderCoverName(['a.jpg', 'b.jpg']), undefined, 'plusieurs images sans nom connu : aucune');
  assert.equal(folderCoverName(['AlbumArt_{X}_Large.jpg', 'AlbumArt_{X}_Small.jpg']), 'AlbumArt_{X}_Large.jpg');
  assert.equal(parseId3(Buffer.from('pas un tag')), undefined);
});

// ---------------------------------------------------------------------------
// 7. État de chaque morceau

test('état : jouable, en téléchargement avec son pourcentage, hors ligne, fichier introuvable, indisponible, retiré mais jouable', () => {
  const tr = (o: Partial<JukeboxTrack>) => ({ key: 't', title: 'x', added: '', source: 'online', youtube: A, ...o }) as JukeboxTrack;
  const ctx = (o: Partial<StatusContext> = {}): StatusContext => ({ library: new Map(), online: true, fileExists: () => true, ...o });
  assert.deepEqual(trackStatus(tr({}), ctx()), { kind: 'playable', playable: true, play: 'online', label: 'En ligne' });
  assert.deepEqual(trackStatus(tr({}), ctx({ online: false })), { kind: 'offline', playable: false, label: 'Hors ligne', reason: 'Hors ligne : ce morceau se lit sur YouTube' });
  // En ligne, mais une copie est sur la borne (autre playlist) : elle se lit, sans réseau.
  assert.equal(trackStatus(tr({}), ctx({ online: false, library: new Map([[A, song(A)]]) })).play, 'local');
  const dl = tr({ source: 'download' });
  assert.deepEqual(trackStatus(dl, ctx({ downloads: new Map([[A, { state: 'running', percent: 42 }]]) })), { kind: 'downloading', playable: false, percent: 42, label: 'Téléchargement · 42 %', reason: 'En téléchargement · 42 %' });
  assert.equal(trackStatus(dl, ctx({ downloads: new Map([[A, { state: 'queued' }]]) })).label, 'En attente');
  assert.equal(trackStatus(dl, ctx({ downloads: new Map([[A, { state: 'failed', reason: 'Vidéo privée' }]]) })).reason, 'Vidéo privée');
  assert.equal(trackStatus(dl, ctx()).kind, 'pending');
  assert.equal(trackStatus(dl, ctx({ library: new Map([[A, song(A)]]) })).kind, 'playable');
  assert.equal(trackStatus(dl, ctx({ library: new Map([[A, song(A, { video: undefined })]]) }), 0).kind, 'playable', 'son seul : la vidéo n’est pas attendue');
  assert.deepEqual(trackStatus(tr({ unavailable: { reason: 'blocked', since: '' } }), ctx()), { kind: 'unavailable', playable: false, label: 'Bloquée dans votre pays', reason: 'Bloquée dans votre pays' });
  assert.equal(trackStatus(tr({ source: 'download', unavailable: { reason: 'deleted', since: '' } }), ctx({ library: new Map([[A, song(A)]]) })).kind, 'removed');
  const file = tr({ source: 'file', youtube: undefined, path: 'F:\\Clips\\x.mp4' });
  assert.equal(trackStatus(file, ctx()).play, 'file');
  assert.deepEqual(trackStatus(file, ctx({ fileExists: () => false, driveExists: () => false })), { kind: 'missing', playable: false, label: 'Fichier introuvable', reason: 'Fichier introuvable · disque débranché' });
  assert.equal(missingFileReason('C:\\x.mp3', () => true), 'Fichier introuvable · déplacé ou supprimé');
});

// ---------------------------------------------------------------------------
// 8. Règles de lecture

const lists: PlayerList[] = [
  { id: 'p1', tracks: [{ key: 'a', playable: true }, { key: 'b', playable: false, reason: 'En téléchargement · 42 %', percent: 42 }, { key: 'c', playable: true }] },
  { id: 'p2', tracks: [{ key: 'x', playable: true }, { key: 'y', playable: true }] },
  { id: 'p3', tracks: [] },
];

test('deux niveaux : on entre sur les playlists (gestion en tête), Start ouvre, Exit remonte (la musique continue) puis revient à la roue', () => {
  assert.equal(JUKEBOX_ELEMENT_VOLUME, 1, 'le volume est celui de la borne');
  // Entrée : le niveau des playlists, le curseur sur la dernière ouverte, sinon celle du dernier morceau joué, sinon la première.
  let s: PlayerState = initialPlayer(lists, { playlist: 'p2', key: 'y' });
  assert.deepEqual([s.level, s.at, s.shown, s.selected.p2], ['playlists', 'p2', 'p2', 'y']);
  assert.equal(initialPlayer(lists, { playlist: 'p2', key: 'y' }, 'p1').at, 'p1', 'la dernière ouverte l’emporte');
  assert.deepEqual(playlistRows(lists), [JUKEBOX_MANAGE_KEY, 'p1', 'p2', 'p3']);
  assert.equal(initialPlayer([]).at, JUKEBOX_MANAGE_KEY, 'aucune playlist : la gestion');
  s = initialPlayer(lists);
  assert.equal(s.at, 'p1');
  assert.deepEqual(startHint(s, lists), { enabled: true, label: 'Ouvrir la playlist' });
  // Flippers : la gestion au-dessus de la première playlist, sans boucler.
  s = playerStep(s, 'previous', lists).state;
  assert.equal(s.at, JUKEBOX_MANAGE_KEY);
  assert.equal(playerStep(s, 'previous', lists).state.at, JUKEBOX_MANAGE_KEY, 'en tête : la liste ne boucle pas');
  assert.deepEqual(startHint(s, lists), { enabled: true, label: 'Ouvrir la gestion' });
  const manage = playerStep(s, 'start', lists);
  assert.deepEqual(manage.effect, { kind: 'manage' }, 'Start sur la gestion : la gestion');
  assert.equal(manage.state.playing, undefined);
  // MagnaSave au niveau des playlists : rien (ils ne changent de playlist que dans une playlist ouverte).
  assert.deepEqual(playerStep(s, 'playlist-next', lists), { state: s });
  assert.equal(jukeboxInput('collection-next', 'playlists'), undefined);
  assert.equal(jukeboxInput('collection-next', 'tracks'), 'playlist-next');
  assert.equal(jukeboxInput('collection-previous', 'tracks'), 'playlist-previous');
  assert.equal(jukeboxInput('exit', 'playlists'), 'exit');
  assert.equal(jukeboxInput('help', 'tracks'), undefined);
  // Start sur une playlist : ses morceaux.
  s = playerStep(s, 'next', lists).state;
  let step = playerStep(s, 'start', lists);
  assert.deepEqual(step.effect, { kind: 'open', playlist: 'p1' });
  s = step.state;
  assert.deepEqual([s.level, s.shown], ['tracks', 'p1']);
  assert.equal(selectedKey(s, lists), 'a');
  // Niveau des morceaux : les lignes fixes au-dessus du premier morceau, puis la liste s'arrête (sans boucler).
  assert.deepEqual(trackRows(lists[0]!), [JUKEBOX_MANAGE_KEY, JUKEBOX_PLAY_ALL_KEY, JUKEBOX_SHUFFLE_KEY, JUKEBOX_REPEAT_KEY, 'a', 'b', 'c']);
  assert.equal(playerStep(s, 'previous', lists).state.selected.p1, JUKEBOX_REPEAT_KEY);
  assert.equal(selectedKey(playerStep(s, 'previous', lists).state, lists), undefined, 'une ligne fixe n’est pas un morceau');
  let top = s;
  for (let i = 0; i < 6; i++) top = playerStep(top, 'previous', lists).state;
  assert.equal(rowKey(top, lists), JUKEBOX_MANAGE_KEY, 'en tête : la gestion, la liste ne boucle pas');
  assert.deepEqual(playerStep(top, 'start', lists).effect, { kind: 'manage' });
  s = playerStep(s, 'next', lists).state;
  assert.deepEqual(startHint(s, lists), { enabled: false, label: 'Indisponible · 42 %', reason: 'En téléchargement · 42 %' });
  step = playerStep(s, 'start', lists);
  assert.deepEqual(step.effect, { kind: 'refused', reason: 'En téléchargement · 42 %', percent: 42 });
  assert.equal(step.state.playing, undefined, 'jamais « jouer dès qu’il sera prêt »');
  s = playerStep(step.state, 'next', lists).state;
  step = playerStep(s, 'start', lists);
  assert.deepEqual(step.effect, { kind: 'play', playlist: 'p1', key: 'c' });
  s = step.state;
  assert.equal(startHint(s, lists).label, 'Pause');
  step = playerStep(s, 'start', lists);
  assert.deepEqual(step.effect, { kind: 'pause' });
  assert.equal(startHint(step.state, lists).label, 'Reprendre');
  step = playerStep(step.state, 'start', lists);
  assert.deepEqual(step.effect, { kind: 'resume' });
  s = step.state;
  // MagnaSave dans une playlist : l'autre playlist, en raccourci ; la lecture continue, rien ne démarre.
  step = playerStep(s, 'playlist-next', lists);
  assert.equal(step.effect, undefined);
  assert.deepEqual([step.state.level, step.state.shown, step.state.at], ['tracks', 'p2', 'p2']);
  assert.deepEqual(step.state.playing, { playlist: 'p1', key: 'c' });
  assert.deepEqual(playlistPosition(step.state, lists), { index: 2, count: 3 });
  assert.equal(startHint(step.state, lists).label, 'Jouer');
  assert.equal(playerStep(step.state, 'playlist-previous', lists).state.selected.p1, 'c', 'chaque playlist garde son morceau choisi');
  assert.equal(playerStep(playerStep(s, 'playlist-previous', lists).state, 'playlist-previous', lists).state.shown, 'p2', 'les playlists bouclent');
  // Exit dans une playlist : les playlists, le curseur sur celle qu'on quitte ; la musique continue.
  const up = playerStep(step.state, 'exit', lists);
  assert.deepEqual(up.effect, { kind: 'up' });
  assert.deepEqual([up.state.level, up.state.at], ['playlists', 'p2']);
  assert.deepEqual(up.state.playing, { playlist: 'p1', key: 'c' }, 'la musique continue');
  // La fin d'un morceau enchaîne aussi au niveau des playlists.
  assert.deepEqual(playerStep(up.state, 'ended', lists).effect, { kind: 'play', playlist: 'p1', key: 'a' });
  // Exit aux playlists : la roue, la musique s'arrête.
  const exit = playerStep(up.state, 'exit', lists);
  assert.deepEqual(exit.effect, { kind: 'exit' });
  assert.equal(exit.state.playing, undefined);
  // Playlist vide : elle s'ouvre sur la gestion (on y ajoute des morceaux) ; Tout lire y est indisponible avec sa raison.
  const empty = playerStep({ ...initialPlayer(lists), at: 'p3' }, 'start', lists).state;
  assert.deepEqual([empty.level, empty.shown], ['tracks', 'p3']);
  assert.equal(selectedKey(empty, lists), undefined);
  assert.equal(rowKey(empty, lists), JUKEBOX_MANAGE_KEY);
  assert.deepEqual(startHint(empty, lists), { enabled: true, label: 'Ouvrir la gestion' });
  const playAllEmpty = { ...empty, selected: { p3: JUKEBOX_PLAY_ALL_KEY } };
  assert.deepEqual(startHint(playAllEmpty, lists), { enabled: false, label: 'Liste vide', reason: 'Playlist vide' });
  assert.deepEqual(playerStep(playAllEmpty, 'start', lists).effect, { kind: 'refused', reason: 'Playlist vide' });
  // Une playlist supprimée entre-temps (gestion) : le curseur se reprend sur une ligne qui existe.
  assert.equal(playlistAt({ ...initialPlayer(lists), at: 'disparue', shown: 'p2' }, lists), 'p2');
});

/** Tirage déterministe pour les essais : une suite de nombres de [0, 1). */
const seeded = (seed = 7) => {
  let x = seed;
  return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
};

const many: PlayerList[] = [{ id: 'm', tracks: ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, playable: key !== 'c' })) }];
const inM = (extra: Partial<PlayerState> = {}): PlayerState => ({ level: 'tracks', at: 'm', shown: 'm', selected: {}, paused: false, ...extra });

test('modes : Tout lire dans l’ordre, la boucle à la fin ou l’arrêt sans répétition', () => {
  assert.deepEqual(DEFAULT_PLAY_MODE, { shuffle: false, repeat: 'playlist' }, 'par défaut : dans l’ordre, en boucle (comme avant les modes)');
  let r = playerStep(inM({ selected: { m: JUKEBOX_PLAY_ALL_KEY } }), 'start', many);
  assert.deepEqual(r.effect, { kind: 'play', playlist: 'm', key: 'a' }, 'Tout lire : le premier morceau qui se lit');
  assert.deepEqual(playModeOf(r.state, 'm'), { shuffle: false, repeat: 'playlist' });
  const keys: string[] = [];
  for (let i = 0; i < 5; i++) {
    r = playerStep(r.state, 'ended', many);
    keys.push((r.effect as { key: string }).key);
  }
  assert.deepEqual(keys, ['b', 'd', 'e', 'a', 'b'], 'le morceau indisponible est sauté ; la playlist boucle');
  // Répétition : aucune → arrêt à la fin.
  const none = { ...inM({ playing: { playlist: 'm', key: 'e' } }), modes: { m: { shuffle: false, repeat: 'none' as const } } };
  assert.deepEqual(playerStep(none, 'ended', many).effect, { kind: 'stop' });
  // Répéter le morceau : le même, encore.
  const one = { ...inM({ playing: { playlist: 'm', key: 'b' } }), modes: { m: { shuffle: false, repeat: 'track' as const } } };
  assert.deepEqual(playerStep(one, 'ended', many).effect, { kind: 'play', playlist: 'm', key: 'b' });
});

test('modes : la ligne Répétition tourne (playlist, morceau, aucune) sans rien jouer ; le mode est retenu par playlist', () => {
  let s = inM({ selected: { m: JUKEBOX_REPEAT_KEY } });
  assert.equal(startHint(s, many).label, 'Changer la répétition');
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = playerStep(s, 'start', many);
    assert.equal(r.effect, undefined, 'rien ne joue');
    s = r.state;
    seen.push(playModeOf(s, 'm').repeat);
  }
  assert.deepEqual(seen, ['track', 'none', 'playlist']);
  assert.deepEqual(playModeOf(s, 'autre'), DEFAULT_PLAY_MODE, 'une autre playlist garde le sien');
  // Bureau : les boutons ⤮ et ⟳ de la carte agissent sur la playlist qui joue.
  const playing = inM({ playing: { playlist: 'm', key: 'a' } });
  assert.equal(playModeOf(playerStep(playing, 'repeat-cycle', many).state, 'm').repeat, 'track');
  const on = playerStep(playing, 'shuffle-toggle', many, seeded()).state;
  assert.equal(playModeOf(on, 'm').shuffle, true);
  assert.deepEqual([...on.queue!.left].sort(), ['b', 'd', 'e'], 'activé en cours de lecture : le reste de la playlist est tiré');
  // Retenu dans juke-box.json : seulement pour une playlist qui existe.
  const store = { version: 1 as const, playlists: [{ id: 'm', name: 'M', quality: '1080p' as const, tracks: [], created: '', updated: '' }], corrections: {}, skins: { default: { kind: 'animation' as const, animation: 'spectre' as const }, rules: [] } };
  assert.deepEqual(rememberPlayModes(store, { m: { shuffle: true, repeat: 'none' }, partie: { shuffle: true, repeat: 'track' } }).modes, { m: { shuffle: true, repeat: 'none' } });
});

test('modes : l’aléatoire tire chaque morceau une fois avant de recommencer, et se combine avec la boucle', () => {
  const random = seeded(11);
  assert.deepEqual(shuffled([1, 2, 3, 4], () => 0).sort(), [1, 2, 3, 4], 'un tirage sans remise garde tous les éléments');
  let r = playerStep(inM({ selected: { m: JUKEBOX_SHUFFLE_KEY } }), 'start', many, random);
  assert.equal(r.effect?.kind, 'play');
  assert.equal(playModeOf(r.state, 'm').shuffle, true);
  const first = (r.effect as { key: string }).key;
  const round = [first];
  for (let i = 0; i < 3; i++) {
    r = playerStep(r.state, 'ended', many, random);
    round.push((r.effect as { key: string }).key);
  }
  assert.deepEqual([...round].sort(), ['a', 'b', 'd', 'e'], 'un tour : chaque morceau qui se lit, une seule fois');
  // Aléatoire + boucle : un nouveau tour, qui ne recommence pas par le morceau qui vient de finir.
  r = playerStep(r.state, 'ended', many, random);
  const next = (r.effect as { key: string }).key;
  assert.notEqual(next, round[3]);
  assert.equal(r.state.queue?.left.length, 3, 'le reste du nouveau tour');
  // Aléatoire sans répétition : arrêt une fois toute la playlist passée.
  const lastOne = { ...r.state, modes: { m: { shuffle: true, repeat: 'none' as const } }, queue: { playlist: 'm', left: [] } };
  assert.deepEqual(playerStep(lastOne, 'ended', many, random).effect, { kind: 'stop' });
  // Aléatoire et répéter le morceau : le morceau d'abord.
  const looped = { ...r.state, modes: { m: { shuffle: true, repeat: 'track' as const } } };
  assert.deepEqual(playerStep(looped, 'ended', many, random).effect, { kind: 'play', playlist: 'm', key: next });
});

test('Start maintenu au niveau des playlists : la playlist choisie en aléatoire, directement ; sur la gestion, la gestion', () => {
  const s = { ...initialPlayer(many), at: 'm' };
  assert.equal(holdHint(s, many), 'shuffle');
  const r = playerStep(s, 'hold', many, seeded(3));
  assert.equal(r.effect?.kind, 'play');
  assert.deepEqual([r.state.level, r.state.shown, playModeOf(r.state, 'm').shuffle], ['tracks', 'm', true]);
  const onManage = { ...s, at: JUKEBOX_MANAGE_KEY };
  assert.equal(holdHint(onManage, many), 'manage');
  assert.deepEqual(playerStep(onManage, 'hold', many).effect, { kind: 'manage' });
  // Dans une playlist : Start maintenu reste la gestion.
  assert.equal(holdHint(r.state, many), 'manage');
  assert.deepEqual(playerStep(r.state, 'hold', many).effect, { kind: 'manage' });
});

test('flipper tenu : appui court, la ligne voisine au relâchement ; tenu, l’avance par pas qui s’accélèrent ; sans morceau, rien ne change', () => {
  assert.ok(JUKEBOX_SEEK_HOLD_MS > 200 && JUKEBOX_SEEK_HOLD_MS < 500, 'plus long qu’un appui franc, plus court que la répétition d’une touche');
  // Sans morceau en cours : l'appui agit aussitôt, sa répétition aussi (la liste défile, comme avant).
  assert.deepEqual(seekPressStep(undefined, 'down', 0, 1, false), { press: undefined, action: { move: 1 } });
  assert.deepEqual(seekPressStep(undefined, 'repeat', 600, 1, false), { press: undefined, action: { move: 1 } });
  assert.deepEqual(seekPressStep(undefined, 'tick', 900, 1, false), { press: undefined }, 'aucune avance sans morceau');
  // Un morceau en cours, appui court : rien à l'appui, la ligne voisine au relâchement.
  let r = seekPressStep(undefined, 'down', 0, -1, true);
  assert.equal(r.action, undefined);
  r = seekPressStep(r.press, 'tick', 250, -1, true);
  assert.equal(r.action, undefined, 'avant le seuil : rien');
  assert.deepEqual(seekPressStep(r.press, 'up', 300, -1, true), { press: undefined, action: { move: -1 } });
  // Appui tenu : des pas, de plus en plus grands ; jamais de ligne voisine, même au relâchement.
  r = seekPressStep(undefined, 'down', 0, 1, true);
  const steps: number[] = [];
  for (let at = 250; at <= 4000; at += 250) {
    r = seekPressStep(r.press, 'tick', at, 1, true);
    if (r.action && 'seek' in r.action) steps.push(r.action.seek);
    assert.ok(!(r.action && 'move' in r.action));
    r = seekPressStep(r.press, 'repeat', at + 30, 1, true);
    assert.equal(r.action, undefined, 'la répétition de la touche ne fait pas de pas de plus');
  }
  assert.equal(steps[0], 5);
  assert.deepEqual([...new Set(steps)], [5, 10, 30], 'les pas s’accélèrent : 5 s, 10 s, 30 s');
  assert.deepEqual(seekPressStep(r.press, 'up', 4100, 1, true), { press: undefined });
  assert.deepEqual([seekStepSeconds(0), seekStepSeconds(1499), seekStepSeconds(1500), seekStepSeconds(3499), seekStepSeconds(3500)], [5, 5, 10, 10, 30]);
  // Le gauche recule.
  const back = seekPressStep(seekPressStep(undefined, 'down', 0, -1, true).press, 'tick', 500, -1, true);
  assert.deepEqual(back.action, { seek: -5 });
  // Bornes : jamais avant 0, ni à moins d'une seconde de la fin ; durée inconnue : pas de fin.
  assert.equal(seekTarget(3, -5, 200), 0);
  assert.equal(seekTarget(195, 30, 200), 199);
  assert.equal(seekTarget(40, 30), 70);
});

test('pause au niveau des playlists : Start sur la playlist qui joue l’ouvre sur le morceau en cours, Start encore le met en pause', () => {
  const s = { ...initialPlayer(lists), at: 'p1', playing: { playlist: 'p1', key: 'c' }, selected: { p1: 'a' } };
  assert.equal(startHint(s, lists).label, 'Ouvrir · morceau en cours');
  const opened = playerStep(s, 'start', lists).state;
  assert.equal(rowKey(opened, lists), 'c');
  assert.equal(startHint(opened, lists).label, 'Pause');
  assert.deepEqual(playerStep(opened, 'start', lists).effect, { kind: 'pause' });
  assert.equal(startHint({ ...s, at: 'p2' }, lists).label, 'Ouvrir la playlist', 'une autre playlist : l’ouvrir, simplement');
});

test('Start maintenu : la gestion, sans jamais jouer ; appui court : jouer ou pause, sans sortir du lecteur ; même seuil que le volume', () => {
  assert.equal(JUKEBOX_MANAGE_HOLD_MS, MUTE_HOLD_MS, 'le seuil de Volume − maintenu (couper le son)');
  assert.equal(JUKEBOX_MANAGE_HOLD_MS, 1000);
  // Appui court : rien à l'appui, « jouer » au relâchement.
  let r = startPressStep(undefined, 'down', 0);
  assert.equal(r.action, undefined, 'rien ne part à l’appui');
  assert.equal(startPressStep(r.press, 'tick', 400).action, undefined);
  r = startPressStep(r.press, 'up', 400);
  assert.deepEqual(r, { press: undefined, action: 'start' }, 'appui court : jouer ou pause, on reste dans le lecteur');
  // Appui maintenu : la gestion à l'échéance du seuil (minuterie ou répétition du clavier), puis le relâchement ne joue pas.
  r = startPressStep(undefined, 'down', 0);
  r = startPressStep(r.press, 'repeat', 500);
  assert.equal(r.action, undefined, 'avant le seuil : rien');
  r = startPressStep(r.press, 'tick', JUKEBOX_MANAGE_HOLD_MS);
  assert.equal(r.action, 'manage');
  assert.equal(startPressStep(r.press, 'repeat', JUKEBOX_MANAGE_HOLD_MS + 300).action, undefined, 'une seule fois');
  assert.deepEqual(startPressStep(r.press, 'up', JUKEBOX_MANAGE_HOLD_MS + 600), { press: undefined }, 'l’appui long n’enclenche jamais « jouer »');
  // Relâché après le seuil sans échéance vue (minuterie en retard) : la gestion quand même, pas « jouer ».
  assert.equal(startPressStep({ since: 0, done: false }, 'up', 1200).action, 'manage');
  // Un relâchement sans appui (Start enfoncé ailleurs, à la roue) : rien.
  assert.deepEqual(startPressStep(undefined, 'up', 50), { press: undefined });
  // Une répétition ne relance pas l'appui.
  assert.deepEqual(startPressStep({ since: 10, done: false }, 'down', 20).press, { since: 10, done: false });
});

test('enchaînement : le suivant disponible de la playlist qui joue, en bouclant ; aucun : arrêt', () => {
  assert.equal(nextPlayable(lists[0]!, 'a'), 'c', 'le morceau en téléchargement est sauté');
  assert.equal(nextPlayable(lists[0]!, 'c'), 'a', 'boucle à la fin de la playlist');
  assert.equal(nextPlayable({ id: 'solo', tracks: [{ key: 's', playable: true }] }, 's'), 's');
  assert.equal(nextPlayable({ id: 'rien', tracks: [{ key: 's', playable: false }] }, 's'), undefined);
  let s: PlayerState = { level: 'tracks', at: 'p1', shown: 'p1', selected: { p1: 'c' }, playing: { playlist: 'p1', key: 'c' }, paused: false };
  // On regarde une autre playlist pendant que p1 joue : la fin enchaîne dans p1.
  s = playerStep(s, 'playlist-next', lists).state;
  const end = playerStep(s, 'ended', lists);
  assert.deepEqual(end.effect, { kind: 'play', playlist: 'p1', key: 'a' });
  assert.equal(end.state.selected.p1, 'a', 'la sélection suivait le morceau joué');
  assert.equal(end.state.shown, 'p2');
  const stuck: PlayerList[] = [{ id: 'p', tracks: [{ key: 'a', playable: false }, { key: 'b', playable: false }] }];
  const stop = playerStep({ level: 'tracks', at: 'p', shown: 'p', selected: {}, playing: { playlist: 'p', key: 'a' }, paused: false }, 'ended', stuck);
  assert.deepEqual(stop.effect, { kind: 'stop' });
  assert.equal(stop.state.playing, undefined);
});

// ---------------------------------------------------------------------------
// 9. Place sur le disque

test('place : le nombre d’entrées est affiché, le total disque compte chaque fichier une fois', () => {
  const s = storeWith(
    { name: 'Néon nocturne', tracks: [yt(A, 'download'), yt(B, 'download'), yt(C, 'online'), { source: 'file', path: 'E:\\f.mp3', media: 'audio', title: 'f', duration: 60, added: '' }] },
    { name: 'Arcade 84', tracks: [yt(B, 'download'), yt(A, 'online')] },
  );
  const lib = new Map([[A, song(A)], [B, song(B)], [E, song(E, { bytes: 1000 })]]);
  const u = jukeboxUsage(s, lib);
  assert.equal(u.entries, 6);
  assert.equal(u.unique, 4);
  assert.equal(u.bytes, song(A).bytes + song(B).bytes + 1000, 'chaque dossier une seule fois, orphelin compris');
  const [p1, p2] = s.playlists.map((p) => u.playlists.get(p.id)!);
  assert.deepEqual(p1, { entries: 4, songs: 2, bytes: song(A).bytes + song(B).bytes, freeable: song(A).bytes, files: 1 });
  assert.deepEqual(p2, { entries: 2, songs: 2, bytes: song(A).bytes + song(B).bytes, freeable: 0, files: 0 });
  assert.ok(p1!.bytes + p2!.bytes > u.bytes, 'les totaux par playlist ne s’additionnent pas');
  assert.deepEqual(u.orphans, [E]);
  assert.deepEqual(orphanSongs(s, lib), [E]);
  assert.equal(u.duration, 5 * 200 + 60);
  assert.equal(jukeboxSummary(s), '2 playlists · 6 morceaux · 18 min');
  assert.equal(jukeboxSummary(emptyJukebox()), 'Aucune playlist');
  assert.equal(formatTotalTime(5 * 3600 + 42 * 60), '5 h 42');
  assert.equal(formatTrackTime(187), '3:07');
  assert.equal(formatTrackTime(3723), '1:02:03');
});

// ---------------------------------------------------------------------------
// 10. Habillage du DMD

test('habillage : le plus précis l’emporte (morceau, album, artiste, playlist, défaut), spectre par défaut, fichier manquant sauté', () => {
  assert.deepEqual(JUKEBOX_DMD_ANIMATIONS.map((a) => [a.id, a.color]), [['spectre', '#8be23a'], ['artiste', '#36c9b4'], ['pochette', '#ff8a1f'], ['titre-temps', '#f2b33d']]);
  let skins = normalizeSkins(undefined);
  assert.deepEqual(skins.default, { kind: 'animation', animation: 'spectre' });
  assert.equal(animationColor(skins.default), '#8be23a');
  const track = { key: 't1', ...yt(A, 'online'), tags: { artist: 'Néons Fictifs', album: 'Nuits à venir' } } as JukeboxTrack;
  const keys = skinKeys(track, trackInfo(track), 'pl1');
  assert.deepEqual(keys, { track: `yt:${A}`, album: 'néons fictifs|nuits à venir', artist: 'néons fictifs', playlist: 'pl1' });
  let r = resolveSkin(skins, keys);
  assert.equal(r.level, 'default');
  skins = setSkin(skins, 'artist', keys.artist!, { kind: 'image', file: 'E:\\Habillages\\artiste.png' });
  skins = setSkin(skins, 'playlist', 'pl1', { kind: 'animation', animation: 'titre-temps' });
  r = resolveSkin(skins, keys);
  assert.equal(r.level, 'artist');
  assert.equal(skinChainText(r.chain), 'Morceau : rien · Album : rien · Artiste : image ✓ · Playlist : titre et temps · Défaut : spectre');
  skins = setSkin(skins, 'track', keys.track!, { kind: 'video', file: 'E:\\Habillages\\boucle.mp4' });
  assert.equal(resolveSkin(skins, keys).level, 'track');
  // La vidéo du morceau a disparu : l'image de l'artiste s'applique, la chaîne le dit.
  r = resolveSkin(skins, keys, (f) => !f.endsWith('boucle.mp4'));
  assert.equal(r.level, 'artist');
  assert.equal(r.chain[0]!.missing, true);
  assert.match(skinChainText(r.chain), /^Morceau : vidéo en boucle introuvable · /);
  // Retirer, changer le défaut ; relu de juke-box.json, ce qui ne tient pas debout est oublié.
  skins = setSkin(skins, 'track', keys.track!, undefined);
  skins = setSkin(skins, 'default', '', { kind: 'animation', animation: 'pochette', color: '#5fb4cf' });
  assert.equal(animationColor(skins.default), '#5fb4cf');
  const back = normalizeSkins(JSON.parse(JSON.stringify({ ...skins, rules: [...skins.rules, { level: 'album', key: 'x', skin: { kind: 'image' } }, { level: 'autre', key: 'y', skin: skins.default }] })));
  assert.deepEqual(back, skins);
  // Un morceau sans album ni artiste connus : morceau, playlist et défaut seulement.
  assert.deepEqual(Object.keys(skinKeys({ key: 't', source: 'online', youtube: B, title: 'Sans séparateur', added: '' }, {}, 'pl1')), ['track', 'playlist']);
});

// ---------------------------------------------------------------------------
// Lecture en ligne (sonde du 09/11/2026)

test('lecture en ligne : lecteur intégré avec un Referer, erreurs du lecteur en clair', () => {
  const url = new URL(youtubeEmbedUrl(A, { start: 12.7 }));
  assert.equal(url.origin + url.pathname, `https://www.youtube.com/embed/${A}`);
  assert.equal(url.searchParams.get('autoplay'), '1');
  assert.equal(url.searchParams.get('start'), '12');
  assert.throws(() => youtubeEmbedUrl('x"><script>'), /invalide/);
  assert.match(embedErrorText(153), /Referer/);
  assert.match(embedErrorText(150), /interdit/);
  assert.equal(embedErrorReason(100), 'deleted');
  assert.equal(embedErrorReason(153), undefined, 'un lecteur mal configuré ne rend pas la vidéo indisponible');
});
