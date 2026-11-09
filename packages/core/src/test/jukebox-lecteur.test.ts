// Lecteur du Juke-box (étape 3, jukebox-screens.ts) : le médaillon en tête de la roue et le compteur,
// la fenêtre de la liste qui ne saute pas, ce que montrent le playfield et le fronton (focus distinct
// du morceau en cours, morceaux grisés avec leur raison, Start qui dit pourquoi il ne joue pas,
// publicité), l'affiche du médaillon et le DMD (JUKE-BOX, spectre). Données fictives.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { setLanguage } from '../i18n';
import { initialPlayer, playerStep, type PlayerState } from '../jukebox-play';
import {
  idleSpectrum,
  jukeboxPlayerView,
  jukeboxPoster,
  jukeboxSelectionDots,
  jukeboxSpectrumDots,
  jukeboxWheel,
  jukeboxWheelMove,
  listTop,
  playerListsOf,
  wheelPlaces,
  JUKEBOX_LIST_ROWS,
  type JukeboxPlaylistInput,
  type JukeboxRowInput,
} from '../jukebox-screens';
import { DMD_HEIGHT, DMD_WIDTH } from '../livedmd';
import { MENU_PHASES, screensTable } from '../menumoments';
import { noticeZone, ZONE_SCREENS } from '../noticezone';
import { DEFAULT_MENU_MEDIA_SETTINGS, mediaContentType, normalizeMenuMediaSettings } from '../mediaview';

setLanguage('fr');

const ok = { kind: 'playable', playable: true, label: 'Sur la borne' } as const;
const row = (key: string, title: string, extra: Partial<JukeboxRowInput> = {}): JukeboxRowInput => ({ key, title, artist: 'Vesper Avenue', duration: 278, source: 'download', status: ok, ...extra });

function playlist(id: string, name: string, rows: JukeboxRowInput[]): JukeboxPlaylistInput {
  return { id, name, quality: '1080p', rows };
}

const NEON = playlist('neon', 'Néon nocturne', [
  row('t1', 'Lignes de fuite', { artist: 'Aster Phase', source: 'online', status: { kind: 'playable', playable: true, label: 'En ligne' } }),
  row('t2', 'Les villes de verre'),
  row('t3', 'Minuit magnétique', { status: { kind: 'downloading', playable: false, percent: 42, label: 'Téléchargement · 42 %', reason: 'En téléchargement · 42 %' } }),
  row('t4', 'Le dernier viaduc', { status: { kind: 'waiting', playable: false, label: 'En attente', reason: 'Téléchargement à suivre' } }),
  row('t5', 'Rivages électriques', { source: 'online', status: { kind: 'unavailable', playable: false, label: 'Vidéo privée', reason: 'Vidéo privée' } }),
  row('t6', 'Après les satellites', { source: 'file', status: { kind: 'missing', playable: false, label: 'Fichier introuvable', reason: 'Fichier introuvable · disque débranché' } }),
  row('t7', 'Les quais silencieux', { source: 'online', status: { kind: 'offline', playable: false, label: 'Hors ligne', reason: 'Hors ligne : ce morceau se lit sur YouTube' } }),
]);
const ARCADE = playlist('arcade', 'Arcade 84', [row('a1', 'Échos du périphérique')]);
const ROUTE = playlist('route', 'Route côtière', []);
const ALL = [ARCADE, NEON, ROUTE];

test('médaillon : en tête de chaque collection, compté dans le compteur (« 1 / 8 » pour sept tables)', () => {
  const w = jukeboxWheel({ tables: 7, at: 0, shown: true, selected: true });
  assert.equal(w.count, 8);
  assert.equal(w.position, 1);
  // Moins de neuf entrées : chacune une fois, le médaillon au centre, les tables de part et d'autre (les dernières à gauche : la boucle).
  assert.equal(w.places.length, 8);
  assert.deepEqual(w.places.find((p) => p.offset === 0), { offset: 0, jukebox: true });
  assert.deepEqual(w.places.find((p) => p.offset === 1), { offset: 1, table: 0 });
  assert.deepEqual(w.places.find((p) => p.offset === -1), { offset: -1, table: 6 });
  // Une table choisie : le médaillon juste avant la première ; le compteur dit sa place, médaillon compris.
  const t = jukeboxWheel({ tables: 7, at: 0, shown: true, selected: false });
  assert.equal(t.position, 2);
  assert.deepEqual(t.places.find((p) => p.offset === -1), { offset: -1, jukebox: true });
  // Favoris (quatre tables) : 1 / 5 ; un fabricant d'une table : 1 / 2.
  assert.equal(jukeboxWheel({ tables: 4, at: 2, shown: true, selected: true }).count, 5);
  assert.deepEqual(jukeboxWheel({ tables: 1, at: 0, shown: true, selected: true }), { count: 2, position: 1, places: [{ offset: 0, jukebox: true }, { offset: 1, table: 0 }] });
  // Masqué (réglage) : la roue d'avant, à l'identique.
  const hidden = jukeboxWheel({ tables: 12, at: 3, shown: false, selected: true });
  assert.equal(hidden.count, 12);
  assert.equal(hidden.position, 4);
  assert.deepEqual(hidden.places.map((p) => ('table' in p ? p.table : -1)), [11, 0, 1, 2, 3, 4, 5, 6, 7]);
  // Neuf entrées et plus : neuf places, le médaillon entre la dernière table et la première.
  const big = jukeboxWheel({ tables: 20, at: 1, shown: true, selected: false });
  assert.equal(big.places.length, 9);
  assert.deepEqual(big.places.find((p) => p.offset === -2), { offset: -2, jukebox: true });
  assert.deepEqual(big.places.find((p) => p.offset === -3), { offset: -3, table: 19 });
});

test('médaillon : les flippers y passent comme sur une table, en boucle', () => {
  const at = (tables: number, a: number, selected: boolean) => ({ tables, at: a, shown: true, selected });
  assert.deepEqual(jukeboxWheelMove(at(7, 0, false), -1), { jukebox: true });
  assert.deepEqual(jukeboxWheelMove(at(7, 0, true), 1), { table: 0 });
  assert.deepEqual(jukeboxWheelMove(at(7, 0, true), -1), { table: 6 });
  assert.deepEqual(jukeboxWheelMove(at(7, 6, false), 1), { jukebox: true });
  assert.deepEqual(jukeboxWheelMove(at(7, 3, false), 2), { table: 5 });
  assert.deepEqual(jukeboxWheelMove({ tables: 7, at: 6, shown: false, selected: true }, 1), { table: 0 });
  assert.equal(jukeboxWheelMove({ tables: 0, at: 0, shown: false, selected: false }, 1), undefined);
  // Les places d'une roue sans médaillon : celles de toujours (neuf au plus, le choix au centre).
  assert.deepEqual(wheelPlaces(3, 0), [
    { index: 0, offset: 0 },
    { index: 1, offset: 1 },
    { index: 2, offset: -1 },
  ]);
});

test('liste : elle ne bouge que si le choix quitte sa fenêtre ; ouverte, le choix vers le milieu', () => {
  const rows = JUKEBOX_LIST_ROWS.cab;
  assert.equal(rows, 8);
  assert.equal(JUKEBOX_LIST_ROWS.desk, 7);
  // Longue liste (60) ouverte sur le 37e : les éléments 33 à 40, comme la maquette « longue ».
  assert.equal(listTop(undefined, 36, rows, 60), 32);
  // Dans la fenêtre : rien ne bouge.
  assert.equal(listTop(32, 39, rows, 60), 32);
  assert.equal(listTop(32, 32, rows, 60), 32);
  // Juste en dessous : une ligne ; au-dessus : le choix en tête.
  assert.equal(listTop(32, 40, rows, 60), 33);
  assert.equal(listTop(32, 31, rows, 60), 31);
  // Jamais au-delà de la fin, jamais avant le début.
  assert.equal(listTop(undefined, 59, rows, 60), 52);
  assert.equal(listTop(undefined, 1, rows, 60), 0);
  assert.equal(listTop(10, 2, rows, 5), 0);
});

test('vue : le morceau choisi (focus) et le morceau en cours sont distincts ; chaque grisé dit sa raison', () => {
  const lists = playerListsOf(ALL);
  let state: PlayerState = initialPlayer(lists, { playlist: 'neon', key: 't2' });
  state = playerStep(state, 'start', lists).state;
  state = playerStep(state, 'next', lists).state;
  const v = jukeboxPlayerView({ playlists: ALL, state, top: 0, rows: 8 });
  assert.equal(v.playlist?.name, 'Néon nocturne');
  assert.equal(v.playlist?.count, 'Playlist · 7 morceaux');
  assert.equal(v.playlist?.position, '2 / 3');
  assert.equal(v.playlist?.previous, 'Arcade 84');
  assert.equal(v.playlist?.next, 'Route côtière');
  assert.equal(v.list.head, 'Sélection · 3 / 7');
  const byKey = Object.fromEntries(v.list.rows.map((r) => [r.key, r]));
  assert.equal(byKey.t2!.playing, 'play');
  assert.ok(!byKey.t2!.focus);
  assert.ok(byKey.t3!.focus && byKey.t3!.disabled);
  assert.equal(v.list.rows.filter((r) => r.focus).length, 1, 'un seul focus');
  // Raisons : progression, attente, indisponible, fichier absent, hors ligne ; jamais la couleur seule.
  assert.deepEqual([byKey.t3!.mark, byKey.t3!.line, byKey.t3!.percent], ['download', 'Téléchargement · 42 %', 42]);
  assert.deepEqual([byKey.t4!.mark, byKey.t4!.line], ['waiting', 'En attente']);
  assert.deepEqual([byKey.t5!.mark, byKey.t5!.line], ['unavailable', 'Vidéo privée']);
  assert.deepEqual([byKey.t6!.mark, byKey.t6!.line], ['unavailable', 'Fichier introuvable · disque débranché']);
  assert.deepEqual([byKey.t7!.mark, byKey.t7!.line], ['offline', 'Hors ligne']);
  assert.equal(byKey.t1!.line, 'Aster Phase');
  assert.equal(byKey.t1!.source, 'online');
  assert.equal(byKey.t6!.source, 'file');
  // Start sur un morceau en téléchargement : grisé, avec son pourcentage.
  const start = v.commands.find((c) => c.id === 'start')!;
  assert.deepEqual([start.action, start.disabled], ['Indisponible · 42 %', true]);
  // Le morceau en cours, en pied : sa place dans sa playlist, sa durée, sa source.
  assert.equal(v.now?.title, 'Les villes de verre');
  assert.equal(v.now?.label, 'En lecture · 02 / 07');
  assert.equal(v.now?.position, '02 / 07');
  assert.equal(v.now?.duration, 278);
  assert.equal(v.now?.origin, 'Son et clip locaux');
  // Commandes : flippers, Start, MagnaSave, Exit ; au bureau, les touches du clavier.
  assert.deepEqual(v.commands.map((c) => [c.cab, c.desk, c.action]), [
    ['Flippers', '↑↓', 'Choisir'],
    ['Start', 'Entrée', 'Indisponible · 42 %'],
    ['MagnaSave', '←→', 'Playlists'],
    ['Exit', 'Échap', 'Roue · arrêt musique'],
  ]);
});

test('vue : Start dit pourquoi il ne joue pas, et « Reprendre » sur le morceau en pause', () => {
  const lists = playerListsOf(ALL);
  const on = (key: string, extra: Partial<PlayerState> = {}) => jukeboxPlayerView({ playlists: ALL, state: { shown: 'neon', selected: { neon: key }, paused: false, ...extra }, top: 0, rows: 8 }).commands.find((c) => c.id === 'start')!;
  assert.deepEqual([on('t1').action, on('t1').disabled], ['Jouer la sélection', undefined]);
  assert.equal(on('t5').action, 'Vidéo indisponible');
  assert.equal(on('t6').action, 'Fichier absent');
  assert.equal(on('t7').action, 'Hors ligne');
  assert.equal(on('t4').action, 'Indisponible');
  assert.equal(on('t2', { playing: { playlist: 'neon', key: 't2' }, paused: true }).action, 'Reprendre');
  assert.equal(on('t2', { playing: { playlist: 'neon', key: 't2' } }).action, 'Pause');
  // La pause se voit sur la ligne et dans le pied.
  const paused = jukeboxPlayerView({ playlists: ALL, state: { shown: 'neon', selected: { neon: 't2' }, playing: { playlist: 'neon', key: 't2' }, paused: true }, top: 0, rows: 8 });
  assert.equal(paused.list.rows[1]!.playing, 'pause');
  assert.equal(paused.now?.label, 'En pause · 02 / 07');
  void lists;
});

test('vue : publicité YouTube, playlist vide, bibliothèque vide, longue liste', () => {
  const ad = jukeboxPlayerView({ playlists: ALL, state: { shown: 'neon', selected: { neon: 't1' }, playing: { playlist: 'neon', key: 't1' }, paused: false }, top: 0, rows: 8, ad: true });
  assert.equal(ad.list.rows[0]!.line, 'Publicité · le morceau suit');
  assert.equal(ad.list.rows[0]!.mark, 'ad');
  assert.equal(ad.now?.label, 'Publicité · le morceau suit');
  assert.equal(ad.now?.origin, 'YouTube en ligne');
  // Playlist vide : l'invitation, Start grisé « Liste vide », aucun focus.
  const empty = jukeboxPlayerView({ playlists: ALL, state: { shown: 'route', selected: {}, paused: false }, top: 0, rows: 8 });
  assert.equal(empty.empty, 'playlist');
  assert.equal(empty.list.head, 'Aucun morceau');
  assert.equal(empty.list.rows.length, 0);
  assert.deepEqual([empty.commands[1]!.action, empty.commands[1]!.disabled, empty.commands[0]!.disabled], ['Liste vide', true, true]);
  // Aucune playlist : pas de playlist montrée, MagnaSave grisé.
  const none = jukeboxPlayerView({ playlists: [], state: { shown: '', selected: {}, paused: false }, top: 0, rows: 8 });
  assert.equal(none.empty, 'library');
  assert.equal(none.playlist, undefined);
  assert.equal(none.commands[2]!.disabled, true);
  // Longue liste : la fenêtre montrée, les numéros dans la playlist, le repère avant / après.
  const long = playlist(
    'long',
    'Soixante',
    Array.from({ length: 60 }, (_, i) => row(`k${i}`, `Titre ${i + 1}`)),
  );
  const lv = jukeboxPlayerView({ playlists: [long], state: { shown: 'long', selected: { long: 'k36' }, paused: false }, top: 32, rows: 8 });
  assert.deepEqual(lv.list.rows.map((r) => r.num), ['33', '34', '35', '36', '37', '38', '39', '40']);
  assert.equal(lv.list.head, 'Sélection · 37 / 60');
  assert.equal(lv.list.around, '↑ 32 avant · 20 après ↓');
  assert.equal(lv.list.rows.find((r) => r.focus)?.num, '37');
});

test('affiche du médaillon : la dernière écoute, ou l’invitation à importer', () => {
  assert.deepEqual(jukeboxPoster({ stats: '4 playlists · 86 morceaux · 5 h 42', empty: false, last: { title: 'Les villes de verre', artist: 'Vesper Avenue', album: 'Fréquences parallèles' } }), {
    stats: '4 playlists · 86 morceaux · 5 h 42',
    empty: false,
    eyebrow: 'Dernière écoute',
    heading: 'Les villes de verre',
    detail: 'Vesper Avenue · album Fréquences parallèles',
  });
  const empty = jukeboxPoster({ stats: 'Aucune playlist', empty: true });
  assert.equal(empty.heading, 'Importez une playlist YouTube');
  assert.equal(empty.detail, 'Depuis votre téléphone ou la fenêtre Récupérer.');
});

test('DMD : JUKE-BOX et ses chiffres sur la roue, le spectre en lecture, tout dans la grille', () => {
  const lit = (dots: Uint8Array, y0: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < DMD_WIDTH; x++) if (dots[y * DMD_WIDTH + x]) n++;
    return n;
  };
  const sel = jukeboxSelectionDots({ tracks: 86, playlists: 4 });
  assert.equal(sel.length, DMD_WIDTH * DMD_HEIGHT);
  assert.ok(lit(sel, 3, 17) > 100, 'JUKE-BOX en grand');
  assert.ok(lit(sel, 23, 30) > 40, 'les chiffres dessous');
  assert.ok(lit(jukeboxSelectionDots({ tracks: 0, playlists: 0 }), 23, 30) > 20, 'Aucune playlist');
  // Spectre : l'artiste en tête, les niveaux en pied ; plus forts, plus de points.
  const low = jukeboxSpectrumDots({ artist: 'Vesper Avenue', levels: Array(24).fill(0.1), elapsed: 0 });
  const high = jukeboxSpectrumDots({ artist: 'Vesper Avenue', levels: Array(24).fill(0.9), elapsed: 0 });
  assert.ok(lit(low, 0, 11) > 30, 'l’artiste');
  assert.ok(lit(high, 12, 32) > lit(low, 12, 32) * 3);
  // Un nom trop large défile, sans sortir de la grille.
  const long = jukeboxSpectrumDots({ artist: 'Le Collectif des Fréquences Lointaines avec les Voix du Grand Observatoire', levels: [], elapsed: 1500 });
  assert.equal(long.length, DMD_WIDTH * DMD_HEIGHT);
  // Sans mesure du son : un mouvement doux en lecture, plat en pause.
  assert.ok(idleSpectrum(1000, true).every((v) => v > 0.04 && v <= 1));
  assert.ok(idleSpectrum(1000, false).every((v) => v < 0.1));
});

test('phase Juke-box : déclarée partout (écrans par défaut, zone des notifications), réglage du médaillon, formats lus', () => {
  assert.ok(MENU_PHASES.includes('jukebox'));
  assert.equal(screensTable({ phase: 'jukebox', help: false }), undefined, 'aucune table : les écrans dessinent le lecteur');
  assert.ok(ZONE_SCREENS.includes('jukebox'));
  assert.equal(noticeZone('jukebox').place, 'head');
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.jukebox, true);
  assert.equal(normalizeMenuMediaSettings({ jukebox: false }).jukebox, false);
  assert.equal(normalizeMenuMediaSettings({ jukebox: 'oui' }).jukebox, true);
  assert.equal(mediaContentType('C:\\Musique\\clip.mkv'), 'video/x-matroska');
  assert.equal(mediaContentType('C:\\Musique\\son.opus'), 'audio/ogg');
});
