// Juke-box, étape 4 : la gestion et l'import (jukebox-manage.ts). Le lien collé (playlist ou vidéo
// seule), ce qui empêche une fonction (hors ligne, yt-dlp absent, disque plein : grisée avec sa
// raison), les textes des cartes de playlist et de l'import, l'import d'une vidéo seule. Données
// fictives (artistes, titres, listes et identifiants inventés).

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { setLanguage } from '../i18n';
import {
  addTracks,
  createPlaylist,
  emptyJukebox,
  findPlaylist,
  type JukeboxStore,
  type JukeboxTrack,
  type LibrarySong,
} from '../jukebox';
import { summarizeImport, type PlaylistAnalysis } from '../jukebox-youtube';
import {
  availabilityText,
  defaultImportChoices,
  downloadAllPlan,
  downloadBlocker,
  freePlaylistName,
  importActionLabel,
  importAnalysis,
  importBlocker,
  isVideoAnalysis,
  JUKEBOX_DISK_MARGIN,
  parseJukeboxLink,
  playlistFacts,
  playlistKind,
  playlistSecondLine,
  qualityBadge,
  retainedText,
  skippedText,
  sourcesText,
  syncText,
  videoAnalysis,
  youtubeBlocker,
} from '../jukebox-manage';

setLanguage('fr');

const A = 'Aaaaaaaaaa1';
const B = 'Bbbbbbbbbb2';
const C = 'Cccccccccc3';
const NOW = new Date('2026-11-09T20:00:00Z');
const GO = 1024 ** 3;

function store(): { s: JukeboxStore; id: string } {
  const created = createPlaylist(emptyJukebox(), 'Néon nocturne', NOW, { youtube: { list: 'PLexempleNeon', url: 'https://www.youtube.com/playlist?list=PLexempleNeon', mode: 'download', synced: '2026-11-08T20:04:00Z', found: { added: 2, removed: 0 } } });
  assert.ok(created.ok);
  const tracks: Omit<JukeboxTrack, 'key'>[] = [
    { source: 'download', youtube: A, title: 'Onde Violette - Minuit magnétique', duration: 232, added: '' },
    { source: 'online', youtube: B, title: 'Aster Phase - Lignes de fuite', duration: 252, added: '' },
    { source: 'file', path: 'E:\\Musique\\Vesper Avenue\\Les villes de verre.flac', media: 'audio', title: 'Les villes de verre', duration: 278, added: '' },
  ];
  const added = addTracks(created.store, created.playlist.id, tracks, NOW);
  assert.ok(added.ok);
  return { s: added.store, id: created.playlist.id };
}

test('lien collé : une playlist, une vidéo seule, ou la raison du refus', () => {
  const pl = parseJukeboxLink('https://www.youtube.com/playlist?list=PLexempleNeonNocturne');
  assert.ok('kind' in pl && pl.kind === 'playlist');
  // Une vidéo ouverte dans une playlist : la playlist.
  const both = parseJukeboxLink(`https://www.youtube.com/watch?v=${A}&list=PLexempleNeonNocturne`);
  assert.ok('kind' in both && both.kind === 'playlist');
  for (const link of [`https://www.youtube.com/watch?v=${A}`, `youtu.be/${A}?si=partage`, `https://m.youtube.com/shorts/${A}`, `https://music.youtube.com/watch?v=${A}&feature=share`, `https://www.youtube.com/embed/${A}`]) {
    const v = parseJukeboxLink(link);
    assert.ok('kind' in v && v.kind === 'video', link);
    assert.equal(v.kind === 'video' && v.id, A, link);
    assert.equal(v.kind === 'video' && v.url, `https://www.youtube.com/watch?v=${A}`);
  }
  assert.deepEqual(parseJukeboxLink('https://exemple.test/playlist?list=PLx'), { refused: 'Ce lien ne mène pas à YouTube' });
  assert.deepEqual(parseJukeboxLink('https://www.youtube.com/@chaine-fictive'), { refused: 'Ce lien mène à une vidéo, pas à une playlist' });
  assert.deepEqual(parseJukeboxLink('pas un lien du tout'), { refused: 'Ce n’est pas un lien' });
});

test('vidéo seule : une playlist d’un morceau, sans liste à resynchroniser', () => {
  const analysis = videoAnalysis(A, { title: 'Onde Violette - Minuit magnétique (clip officiel)', duration: 232, channel: 'Onde Violette', tags: { artist: 'Onde Violette', track: 'Minuit magnétique' } });
  assert.ok(isVideoAnalysis(analysis));
  assert.equal(analysis.entries.length, 1);
  assert.equal(analysis.entries[0]!.artist, 'Onde Violette');
  const gone = videoAnalysis(B, { unavailable: 'private', detail: 'Vidéo privée' });
  assert.equal(gone.entries[0]!.unavailable, 'private');

  // Dans une nouvelle playlist : pas d'origine YouTube ; dans une existante : ajoutée à la fin.
  const fresh = importAnalysis(emptyJukebox(), { analysis, target: { name: 'Mes morceaux' }, mode: 'online', quality: '720p', library: new Map(), now: NOW });
  assert.ok(fresh.ok);
  assert.equal(fresh.playlist.youtube, undefined);
  assert.equal(fresh.playlist.quality, '720p');
  assert.equal(fresh.added.length, 1);
  assert.equal(fresh.added[0]!.list, undefined);
  const { s, id } = store();
  const into = importAnalysis(s, { analysis: videoAnalysis(C, { title: 'Morceau neuf', duration: 200 }), target: { playlist: id }, mode: 'download', library: new Map(), now: NOW });
  assert.ok(into.ok);
  assert.equal(findPlaylist(into.store, id)!.tracks.length, 4);
  assert.deepEqual(into.enqueue, [C]);
});

test('fonctions indisponibles : grisées avec leur raison (pas installé, hors ligne, yt-dlp absent, disque plein)', () => {
  const ok = { installed: true, online: true, ytdlp: true, free: 100 * GO };
  assert.equal(youtubeBlocker(ok), undefined);
  assert.equal(youtubeBlocker({ ...ok, installed: false }), 'Cyber Pinball n’est pas installé');
  assert.equal(youtubeBlocker({ ...ok, online: false }), 'Hors ligne : YouTube injoignable');
  assert.equal(youtubeBlocker({ ...ok, online: false, ytdlp: false }), 'Hors ligne : yt-dlp n’est pas installé et ne peut pas être téléchargé');
  // yt-dlp absent mais réseau : il s'installera à la première demande.
  assert.equal(youtubeBlocker({ ...ok, ytdlp: false }), undefined);
  assert.equal(downloadBlocker(ok, 3 * GO), undefined);
  assert.equal(downloadBlocker({ ...ok, free: 4 * GO }, 3 * GO), 'Disque plein : ≈ 3 Go à télécharger, 4 Go libres');
  assert.equal(downloadBlocker({ ...ok, free: 3 * GO + JUKEBOX_DISK_MARGIN }, 3 * GO), undefined);
  assert.equal(downloadBlocker({ ...ok, free: undefined }, 900 * GO), undefined, 'espace inconnu : pas de refus');
  assert.equal(downloadBlocker({ ...ok, online: false }, 1), 'Hors ligne : YouTube injoignable');
});

test('cartes de playlist : faits, sources, dernière synchro, qualité', () => {
  const { s, id } = store();
  const p = findPlaylist(s, id)!;
  assert.equal(playlistFacts(p, { entries: 3, songs: 1, bytes: 5.1 * GO, freeable: 0, files: 1 }), '3 morceaux · 13 min · 5,1 Go');
  assert.equal(sourcesText(p), 'Mixte · 1 en ligne / 1 téléchargé / 1 fichier');
  assert.equal(playlistKind(p), 'playlist mixte');
  // Sources mélangées : elles passent avant la synchro.
  assert.equal(playlistSecondLine(p), sourcesText(p));
  const yt = { ...p, tracks: p.tracks.filter((tr) => tr.source === 'download') };
  assert.match(playlistSecondLine(yt), /^Dernière synchro · .* · 2 nouveautés$/);
  assert.equal(syncText({ youtube: undefined }), undefined);
  assert.equal(syncText({ youtube: { list: 'PLx', url: '', mode: 'online' } }), 'Jamais resynchronisée');
  assert.equal(sourcesText({ tracks: [] }), 'Vide');
  assert.equal(playlistKind({ tracks: [] }), 'playlist vide');
  assert.equal(sourcesText({ tracks: [p.tracks[2]!] }), 'Fichiers locaux');
  assert.equal(qualityBadge('audio'), 'Son seul');
  assert.equal(qualityBadge('720p'), '720p');
  setLanguage('en');
  assert.equal(sourcesText(p), 'Mixed · 1 online / 1 downloaded / 1 file');
  assert.equal(qualityBadge('audio'), 'Sound only');
  setLanguage('fr');
});

test('tout télécharger : les morceaux en ligne, la place estimée dans la qualité de la playlist', () => {
  const { s, id } = store();
  const p = findPlaylist(s, id)!;
  const lib = new Map<string, LibrarySong>([[A, { id: A, dir: '', audio: 'son.m4a', video: 'video.mp4', audioBytes: 1, videoBytes: 1, bytes: 2 } as unknown as LibrarySong]]);
  const plan = downloadAllPlan(p, lib);
  assert.equal(plan.songs, 1, 'B seulement : A est déjà là, le fichier garde sa source');
  assert.ok(plan.bytes > 70 * 1024 ** 2 && plan.bytes < 100 * 1024 ** 2, `≈ 252 s en 1080p : ${plan.bytes}`);
});

test('import : choix proposés, retenus, sautés, libellé et ce qui l’empêche', () => {
  const analysis: PlaylistAnalysis = {
    link: { list: 'PLexempleNeon', url: 'https://www.youtube.com/playlist?list=PLexempleNeon', mix: false },
    title: 'Néon nocturne',
    entries: [
      { id: A, title: 'Onde Violette - Minuit magnétique', duration: 232 },
      { id: B, title: 'Aster Phase - Lignes de fuite', duration: 252 },
      { id: C, title: '[Private video]', unavailable: 'private', detail: 'Vidéo privée' },
    ],
    capped: false,
  };
  const { s } = store();
  // Le nom de la liste est pris : « (2) ».
  const choices = defaultImportChoices(analysis, s);
  assert.deepEqual(choices, { target: { name: 'Néon nocturne (2)' }, mode: 'download', quality: '1080p' });
  assert.equal(freePlaylistName(emptyJukebox(), '  '), 'Nouvelle playlist');
  // Une vidéo seule va à la dernière playlist (ou celle qu'on a choisie).
  const video = videoAnalysis(C, { title: 'Morceau', duration: 100 });
  assert.ok('playlist' in defaultImportChoices(video, s).target);
  assert.deepEqual(defaultImportChoices(video, emptyJukebox()).target, { name: 'Mes morceaux' });

  const all = summarizeImport(analysis);
  assert.equal(retainedText(all), '2 / 3 retenus');
  assert.equal(availabilityText(all), '2 disponibles · 1 sauté');
  assert.equal(skippedText(all), '1 vidéo sautée : vidéo privée.');
  assert.equal(importActionLabel(all, false), 'Importer 2 morceaux');
  assert.equal(importActionLabel(all, true), 'Ajouter ce morceau');
  const ability = { installed: true, online: true, ytdlp: true, free: 100 * GO };
  assert.equal(importBlocker(all, { mode: 'download', quality: '1080p' }, ability), undefined);
  assert.equal(importBlocker(all, { mode: 'download', quality: '1080p' }, { ...ability, free: 1 * GO }), 'Disque plein : ≈ 165 Mo à télécharger, 1 Go libres');
  // En ligne : rien sur le disque, seulement le réseau.
  assert.equal(importBlocker(all, { mode: 'online', quality: '1080p' }, { ...ability, free: 1 * GO }), undefined);
  const none = summarizeImport(analysis, { chosen: new Set() });
  assert.equal(importBlocker(none, { mode: 'online', quality: '1080p' }, ability), 'Aucun morceau retenu');
  const noSkip = summarizeImport({ ...analysis, entries: analysis.entries.slice(0, 2) });
  assert.equal(skippedText(noSkip), undefined);
});
