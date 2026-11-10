// « Déplacer vers… », « Copier vers… » (gestion du Juke-box, demande du 10/11/2026) : un morceau
// passe à la fin d'une autre playlist ; la bibliothèque est unique, rien n'est copié sur le disque ;
// déjà dans la cible, rien n'est doublé ; le morceau en cours de lecture continue sans coupure.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  addTracks,
  createPlaylist,
  emptyJukebox,
  followTransfer,
  hasSong,
  initialPlayer,
  playerStep,
  transferTrack,
  type JukeboxStore,
  type JukeboxTrack,
  type LibrarySong,
  type PlayerList,
  type PlayerState,
} from '..';

const NOW = new Date('2026-11-10T12:00:00Z');
const LATER = new Date('2026-11-10T12:05:00Z');
const APP = path.join(__dirname, '..', '..', '..', '..', 'app');

const yt = (id: string, title: string, source: 'online' | 'download' = 'online'): Omit<JukeboxTrack, 'key'> => ({ source, youtube: id, title, added: NOW.toISOString() });

/** Deux playlists : « Néon » (trois morceaux) et « Arcade » (un, déjà « vid3 »). */
function fixture(): { store: JukeboxStore; neon: string; arcade: string } {
  let s = emptyJukebox();
  const a = createPlaylist(s, 'Néon', NOW);
  assert.ok(a.ok);
  s = a.store;
  const b = createPlaylist(s, 'Arcade', NOW, { quality: '1080p' });
  assert.ok(b.ok);
  s = b.store;
  const n = addTracks(s, a.playlist.id, [yt('vid1aaaaaaa', 'Un', 'download'), yt('vid2aaaaaaa', 'Deux'), yt('vid3aaaaaaa', 'Trois')], NOW);
  assert.ok(n.ok);
  const r = addTracks(n.store, b.playlist.id, [yt('vid3aaaaaaa', 'Trois')], NOW);
  assert.ok(r.ok);
  return { store: r.store, neon: a.playlist.id, arcade: b.playlist.id };
}
const tracks = (s: JukeboxStore, id: string) => s.playlists.find((p) => p.id === id)!.tracks;

test('déplacer : le morceau quitte l’origine et s’ajoute à la fin de la cible, sans fichier copié', () => {
  const { store, neon, arcade } = fixture();
  const key = tracks(store, neon)[0]!.key;
  const r = transferTrack(store, neon, key, arcade, 'move', LATER);
  assert.ok(r.ok);
  assert.deepEqual(tracks(r.store, neon).map((t) => t.youtube), ['vid2aaaaaaa', 'vid3aaaaaaa']);
  assert.deepEqual(tracks(r.store, arcade).map((t) => t.youtube), ['vid3aaaaaaa', 'vid1aaaaaaa'], 'à la fin');
  assert.equal(r.transfer.next, tracks(store, neon)[1]!.key, 'le morceau qui le suivait');
  assert.equal(tracks(r.store, arcade).at(-1)!.key, r.transfer.newKey);
  assert.equal(tracks(r.store, arcade).at(-1)!.source, 'download', 'même source : la bibliothèque est unique');
});

test('copier : le morceau reste dans l’origine et s’ajoute aussi à la fin de la cible', () => {
  const { store, neon, arcade } = fixture();
  const key = tracks(store, neon)[1]!.key;
  const r = transferTrack(store, neon, key, arcade, 'copy', LATER);
  assert.ok(r.ok);
  assert.equal(tracks(r.store, neon).length, 3);
  assert.equal(tracks(r.store, arcade).at(-1)!.youtube, 'vid2aaaaaaa');
  assert.equal(r.transfer.next, undefined);
});

test('cible déjà pourvue : refusé avec sa raison, rien n’est doublé ni retiré', () => {
  const { store, neon, arcade } = fixture();
  const key = tracks(store, neon)[2]!.key;
  assert.ok(hasSong(store.playlists.find((p) => p.id === arcade)!, tracks(store, neon)[2]!));
  for (const mode of ['move', 'copy'] as const) {
    const r = transferTrack(store, neon, key, arcade, mode, LATER);
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /Arcade/);
  }
  assert.equal(transferTrack(store, neon, key, neon, 'copy', LATER).ok, false, 'pas vers elle-même');
});

test('nouvelle playlist : créée, puis le morceau y entre le premier', () => {
  const { store, neon } = fixture();
  const c = createPlaylist(store, 'Nuit', LATER, { quality: '720p' });
  assert.ok(c.ok);
  const key = tracks(store, neon)[0]!.key;
  const r = transferTrack(c.store, neon, key, c.playlist.id, 'move', LATER);
  assert.ok(r.ok);
  assert.deepEqual(tracks(r.store, c.playlist.id).map((t) => t.youtube), ['vid1aaaaaaa']);
});

test('téléchargé : la cible qui veut la vidéo la demande, si la borne n’a que le son', () => {
  const { store, neon, arcade } = fixture();
  const lib = new Map<string, LibrarySong>([['vid1aaaaaaa', { id: 'vid1aaaaaaa', dir: '', audioBytes: 1, videoBytes: 0, bytes: 1, audio: 'a.m4a' }]]);
  const r = transferTrack(store, neon, tracks(store, neon)[0]!.key, arcade, 'copy', LATER, lib);
  assert.ok(r.ok);
  assert.deepEqual(r.download, ['vid1aaaaaaa'], '1080p voulu par « Arcade »');
});

test('morceau en cours de lecture déplacé : il continue sans coupure, puis la lecture reprend dans l’origine', () => {
  const { store, neon, arcade } = fixture();
  const [one, two] = tracks(store, neon);
  const r = transferTrack(store, neon, one!.key, arcade, 'move', LATER);
  assert.ok(r.ok);
  const before: PlayerState = { ...initialPlayer([]), level: 'tracks', shown: neon, at: neon, selected: { [neon]: one!.key }, playing: { playlist: neon, key: one!.key }, paused: false };
  const after = followTransfer(before, r.transfer);
  assert.deepEqual(after.playing, { playlist: arcade, key: r.transfer.newKey, resume: { playlist: neon, key: two!.key } }, 'le même morceau, suivi dans sa nouvelle playlist');
  assert.equal(after.selected[neon], two!.key);
  assert.equal(after.paused, false);
  // À la fin du morceau : le suivant de l'origine, pas la suite de la cible.
  const lists: PlayerList[] = r.store.playlists.map((p) => ({ id: p.id, tracks: p.tracks.map((t) => ({ key: t.key, playable: true })) }));
  const step = playerStep(after, 'ended', lists);
  assert.deepEqual(step.state.playing, { playlist: neon, key: two!.key });
  assert.deepEqual(step.effect, { kind: 'play', playlist: neon, key: two!.key });
  // Une copie ne change rien à la lecture ; la dernière écoute retenue suit le morceau déplacé.
  assert.deepEqual(followTransfer(before, { ...r.transfer, mode: 'copy' }), before);
  const withLast: JukeboxStore = { ...store, last: { playlist: neon, key: one!.key, at: NOW.toISOString() } };
  const moved = transferTrack(withLast, neon, one!.key, arcade, 'move', LATER);
  assert.ok(moved.ok);
  assert.deepEqual([moved.store.last?.playlist, moved.store.last?.key], [arcade, moved.transfer.newKey]);
});

test('l’application relie la gestion, la bibliothèque et le lecteur', () => {
  const read = (f: string) => fs.readFileSync(path.join(APP, 'src', f), 'utf8');
  const menu = read('jukebox-menu.ts');
  assert.match(menu, /label: t\('Déplacer vers…'\)[\s\S]*?openTransfer\(id, key, 'move'\)/);
  assert.match(menu, /label: t\('Copier vers…'\)[\s\S]*?openTransfer\(id, key, 'copy'\)/);
  assert.match(menu, /hasSong\(x, v\.track\)/, 'une playlist qui a déjà le morceau est grisée');
  assert.match(read('jukebox-library.ts'), /for \(const listener of transferListeners\) listener\(change\.transfer\)/);
  assert.match(read('jukebox-player.ts'), /l\.onTransfer\(\(tr\) => \{[\s\S]*?player = followTransfer\(player, tr\)/);
});
