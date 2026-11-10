// Lecteur du Juke-box (étape 3, jukebox-screens.ts) : le médaillon en tête de la roue et le compteur,
// la fenêtre de la liste qui ne saute pas, ce que montrent le playfield et le fronton (focus distinct
// du morceau en cours, morceaux grisés avec leur raison, Start qui dit pourquoi il ne joue pas,
// publicité), l'affiche du médaillon et le DMD (JUKE-BOX, spectre). Données fictives.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setLanguage } from '../i18n';
import { initialPlayer, jukeboxInput, JUKEBOX_MANAGE_KEY, playerStep, type PlayerState } from '../jukebox-play';
import { buttonKeys, buttonProblems, collectionKeys, DEFAULT_BUTTONS, interfaceKeys, joystickCode, menuButton, navigationButtons, type ButtonsSource } from '../buttons';
import type { CabinetButtons } from '../model';
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

/** Un état au niveau des morceaux de `shown`. */
const inTracks = (shown: string, extra: Partial<PlayerState> = {}): PlayerState => ({ level: 'tracks', at: shown, shown, selected: {}, paused: false, ...extra });

test('niveau des playlists : la gestion en tête, une ligne par playlist (pochettes, morceaux, durée, sources), celle qui joue marquée', () => {
  const lists = playerListsOf(ALL);
  const state: PlayerState = { ...initialPlayer(lists), at: 'neon', playing: { playlist: 'arcade', key: 'a1' } };
  const v = jukeboxPlayerView({ playlists: ALL, state, top: 0, rows: 8 });
  assert.equal(v.level, 'playlists');
  assert.deepEqual(v.header, { label: 'Juke-box · 3 playlists', title: 'PLAYLISTS' }, 'ni voisines ni fil d’Ariane : le titre seul');
  assert.equal(v.playlist, undefined, 'aucune playlist ouverte');
  assert.deepEqual(v.list.rows.map((r) => [r.key, r.num, r.title, r.line]), [
    [JUKEBOX_MANAGE_KEY, '', 'Gestion du Juke-box', 'Playlists, morceaux, ajouts de YouTube ou de fichiers'],
    ['arcade', '01', 'Arcade 84', '1 morceau · 5 min'],
    ['neon', '02', 'Néon nocturne', '7 morceaux · 32 min'],
    ['route', '03', 'Route côtière', '0 morceau'],
  ]);
  const neon = v.list.rows[2]!;
  assert.deepEqual([neon.kind, neon.focus, neon.sources], ['playlist', true, ['online', 'download', 'file']]);
  assert.equal(v.list.rows[1]!.playing, 'play', 'la playlist qui joue est marquée');
  assert.equal(v.list.rows.filter((r) => r.focus).length, 1);
  assert.equal(v.list.head, 'Playlist · 2 / 3');
  // Bandeau : ce que fait chaque bouton à ce niveau ; pas de MagnaSave (ils n'y font rien) ; un morceau en
  // cours : flipper tenu, avancer ou reculer ; Start maintenu : l'aléatoire.
  assert.deepEqual(v.commands.map((c) => [c.id, c.action]), [
    ['flippers', 'Choisir'],
    ['start', 'Ouvrir la playlist'],
    ['exit', 'Roue · arrêt musique'],
    ['seek', 'Avancer / reculer'],
    ['manage', 'Lecture aléatoire'],
  ]);
  // La gestion choisie : Start l'ouvre, Start maintenu aussi ; le compteur dit le nombre de playlists.
  const onManage = jukeboxPlayerView({ playlists: ALL, state: { ...state, at: JUKEBOX_MANAGE_KEY }, top: 0, rows: 8 });
  assert.equal(onManage.list.rows[0]!.focus, true);
  assert.equal(onManage.list.head, 'Gestion du Juke-box · 3 playlists');
  assert.equal(onManage.commands[1]!.action, 'Ouvrir la gestion');
  assert.equal(onManage.commands.at(-1)!.action, 'Gestion des playlists');
  // Sans morceau en cours, pas d'avance : le bandeau ne la propose pas.
  const idle = jukeboxPlayerView({ playlists: ALL, state: initialPlayer(lists), top: 0, rows: 8 });
  assert.ok(!idle.commands.some((c) => c.id === 'seek'));
  // La carte du morceau en cours reste en bas, à ce niveau aussi.
  assert.equal(v.now?.title, 'Échos du périphérique');
  // Aucune playlist : la gestion seule, et l'invitation.
  const none = jukeboxPlayerView({ playlists: [], state: initialPlayer([]), top: 0, rows: 8 });
  assert.equal(none.empty, 'library');
  assert.deepEqual(none.list.rows.map((r) => [r.key, r.focus]), [[JUKEBOX_MANAGE_KEY, true]]);
  assert.equal(none.header.label, 'Juke-box · 0 playlist');
});

test('niveau des morceaux : le nom en en-tête et le fil d’Ariane ; Exit « Playlists » ; MagnaSave seulement si la borne en a', () => {
  const lists = playerListsOf(ALL);
  let state: PlayerState = initialPlayer(lists, { playlist: 'neon', key: 't2' });
  state = playerStep(state, 'start', lists).state;
  state = playerStep(state, 'start', lists).state;
  state = playerStep(state, 'next', lists).state;
  const v = jukeboxPlayerView({ playlists: ALL, state, top: 0, rows: 12 });
  assert.equal(v.level, 'tracks');
  assert.deepEqual(v.header, { label: 'Playlist · 7 morceaux', title: 'Néon nocturne', badge: '2 / 3', crumb: 'Néon nocturne' });
  assert.equal(v.playlist?.name, 'Néon nocturne');
  assert.equal(v.list.head, 'Sélection · 3 / 7');
  // En tête, les quatre lignes fixes, qui ne sont pas des morceaux (ni numéro, ni durée) ; puis les morceaux.
  assert.deepEqual(v.list.rows.slice(0, 4).map((r) => [r.key, r.title, r.num, r.duration, r.action ?? (r.manage ? 'gestion' : '')]), [
    [JUKEBOX_MANAGE_KEY, 'Gestion du Juke-box', '', '', 'gestion'],
    ['@tout-lire', 'Tout lire', '', '', 'play'],
    ['@aleatoire', 'Lecture aléatoire', '', '', 'shuffle'],
    ['@repetition', 'Répétition : playlist', '', '', 'repeat'],
  ]);
  assert.deepEqual([v.list.rows[1]!.on, v.list.rows[2]!.on, v.list.rows[3]!.on], [true, undefined, true], 'dans l’ordre, en boucle : le mode par défaut');
  assert.deepEqual(v.list.rows.map((r) => r.num).slice(4, 7), ['01', '02', '03']);
  assert.deepEqual(v.now?.mode, { shuffle: false, repeat: 'playlist' }, 'la carte dit le mode de sa playlist');
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
  // Le morceau en cours, en pied : sa place dans sa playlist, sa durée, sa source.
  assert.equal(v.now?.label, 'En lecture · 02 / 07');
  assert.equal(v.now?.origin, 'Son et clip locaux');
  // Commandes de ce niveau ; au bureau, les touches du clavier.
  assert.deepEqual(v.commands.map((c) => [c.cab, c.desk, c.action]), [
    ['Flippers', '↑↓', 'Choisir'],
    ['Start', 'Entrée', 'Indisponible · 42 %'],
    ['MagnaSave', '←→', 'Playlist préc. / suiv.'],
    ['Exit', 'Échap', 'Playlists'],
    ['Flipper tenu', 'Flèches tenues', 'Avancer / reculer'],
    // Six commandes en deux colonnes : Start maintenu prend son nom court.
    ['Start maintenu', 'Entrée maintenue', 'Gestion'],
  ]);
  // Une borne dont les MagnaSave sont Valider ou Retour de l'interface : le bandeau ne les propose pas.
  const noMagna = jukeboxPlayerView({ playlists: ALL, state, top: 0, rows: 8, magnaSave: false });
  assert.ok(!noMagna.commands.some((c) => c.id === 'magnasave'));
  // Une seule playlist : MagnaSave grisé, avec sa raison.
  const one = jukeboxPlayerView({ playlists: [NEON], state: inTracks('neon'), top: 0, rows: 8 }).commands.find((c) => c.id === 'magnasave')!;
  assert.deepEqual([one.action, one.disabled], ['Une seule playlist', true]);
});

test('vue : Start dit pourquoi il ne joue pas, et « Reprendre » sur le morceau en pause', () => {
  const on = (key: string, extra: Partial<PlayerState> = {}) => jukeboxPlayerView({ playlists: ALL, state: inTracks('neon', { selected: { neon: key }, ...extra }), top: 0, rows: 8 }).commands.find((c) => c.id === 'start')!;
  assert.deepEqual([on('t1').action, on('t1').disabled], ['Jouer la sélection', undefined]);
  assert.equal(on('t5').action, 'Vidéo indisponible');
  assert.equal(on('t6').action, 'Fichier absent');
  assert.equal(on('t7').action, 'Hors ligne');
  assert.equal(on('t4').action, 'Indisponible');
  assert.equal(on('t2', { playing: { playlist: 'neon', key: 't2' }, paused: true }).action, 'Reprendre');
  assert.equal(on('t2', { playing: { playlist: 'neon', key: 't2' } }).action, 'Pause');
  // La pause se voit sur la ligne et dans le pied.
  const paused = jukeboxPlayerView({ playlists: ALL, state: inTracks('neon', { selected: { neon: 't2' }, playing: { playlist: 'neon', key: 't2' }, paused: true }), top: 0, rows: 8 });
  assert.equal(paused.list.rows.find((r) => r.key === 't2')!.playing, 'pause');
  // Sur une ligne fixe : Start dit ce qu'elle fait.
  const at = (key: string) => jukeboxPlayerView({ playlists: ALL, state: inTracks('neon', { selected: { neon: key } }), top: 0, rows: 8 }).commands.find((c) => c.id === 'start')!.action;
  assert.deepEqual([at('@tout-lire'), at('@aleatoire'), at('@repetition'), at(JUKEBOX_MANAGE_KEY)], ['Tout lire', 'Lecture aléatoire', 'Changer la répétition', 'Ouvrir la gestion']);
  assert.equal(paused.now?.label, 'En pause · 02 / 07');
});

test('vue : publicité YouTube, playlist vide, longue liste', () => {
  const ad = jukeboxPlayerView({ playlists: ALL, state: inTracks('neon', { selected: { neon: 't1' }, playing: { playlist: 'neon', key: 't1' } }), top: 0, rows: 8, ad: true });
  assert.equal(ad.list.rows[4]!.num, '01');
  assert.equal(ad.list.rows[4]!.line, 'Publicité · le morceau suit');
  assert.equal(ad.list.rows[4]!.mark, 'ad');
  assert.equal(ad.now?.label, 'Publicité · le morceau suit');
  assert.equal(ad.now?.origin, 'YouTube en ligne');
  // Playlist vide : les lignes fixes et l'invitation ; la gestion choisie (on y ajoute des morceaux).
  const empty = jukeboxPlayerView({ playlists: ALL, state: inTracks('route'), top: 0, rows: 8 });
  assert.equal(empty.empty, 'playlist');
  assert.equal(empty.list.head, 'Aucun morceau');
  assert.deepEqual(empty.list.rows.map((r) => [r.key, Boolean(r.focus)]), [[JUKEBOX_MANAGE_KEY, true], ['@tout-lire', false], ['@aleatoire', false], ['@repetition', false]]);
  assert.deepEqual([empty.commands[1]!.action, empty.commands[1]!.disabled], ['Ouvrir la gestion', undefined]);
  // Longue liste : la fenêtre montrée, les numéros dans la playlist, le repère avant / après.
  const long = playlist(
    'long',
    'Soixante',
    Array.from({ length: 60 }, (_, i) => row(`k${i}`, `Titre ${i + 1}`)),
  );
  // `top` compte les quatre lignes fixes : 36 montre les morceaux 33 à 40.
  const lv = jukeboxPlayerView({ playlists: [long], state: inTracks('long', { selected: { long: 'k36' } }), top: 36, rows: 8 });
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
  // Les chiffres ne se collent jamais et gardent leurs marges : ensemble s'ils tiennent, sinon l'un puis l'autre.
  for (const [tracks, playlists] of [[1, 1], [86, 4], [1234, 56], [72, 4]] as const) {
    for (const elapsed of [0, 2600]) {
      const d = jukeboxSelectionDots({ tracks, playlists }, elapsed);
      const cols = Array.from({ length: DMD_WIDTH }, (_, x) => [23, 24, 25, 26, 27, 28, 29].some((y) => d[y * DMD_WIDTH + x]! > 0));
      assert.ok(!cols.slice(0, 3).some(Boolean) && !cols.slice(DMD_WIDTH - 3).some(Boolean), `marges : ${tracks} / ${playlists}`);
      const first = cols.indexOf(true);
      const last = cols.lastIndexOf(true);
      assert.ok(Math.abs(first - (DMD_WIDTH - 1 - last)) <= 1, `centrés : ${tracks} / ${playlists}`);
    }
  }
  assert.notDeepEqual([...jukeboxSelectionDots({ tracks: 72, playlists: 4 }, 0)], [...jukeboxSelectionDots({ tracks: 72, playlists: 4 }, 2600)], 'trop long ensemble : ils alternent');
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

// Boutons : le Juke-box résout chaque appui comme la roue (menuButton), quelle que soit la correspondance
// de la borne. Sur une borne Pinscape (boutons de joystick), les MagnaSave du Juke-box faisaient Exit et
// Start, et le bandeau promettait « MagnaSave : Playlists » (10/11/2026).
test('boutons : chaque bouton du menu a le même rôle sur la roue et dans le Juke-box, correspondances non standard comprises', () => {
  const joy = (n: number) => joystickCode('SDLJoy_03000000c0160000f705000000000000_1', n);
  const game = Object.fromEntries(Object.keys(DEFAULT_BUTTONS).map((id, i) => [id, joy(i + 1)])) as CabinetButtons;
  assert.deepEqual(buttonProblems(game), [], 'un relevé de joystick valable');
  const levels = ['playlists', 'tracks'] as const;
  // Ce que fait chaque bouton relevé : sur la roue (menuButton), dans le Juke-box à chaque niveau.
  const roles = (source: ButtonsSource) => {
    const keys = interfaceKeys(source);
    const collections = collectionKeys(source, keys);
    return Object.fromEntries(
      Object.entries(buttonKeys(source?.buttons)).map(([id, code]) => {
        const wheel = menuButton(code!, keys, collections);
        return [id, { wheel, jukebox: levels.map((level) => (wheel === 'confirm' ? 'start' : jukeboxInput(wheel, level))) }];
      }),
    );
  };
  // Correspondance des boutons du jeu, interface déduite : les MagnaSave changent de collection, et de playlist au niveau 2.
  const standard = roles({ buttons: game });
  assert.deepEqual(standard.leftFlipper, { wheel: 'previous', jukebox: ['previous', 'previous'] });
  assert.deepEqual(standard.rightFlipper, { wheel: 'next', jukebox: ['next', 'next'] });
  assert.deepEqual(standard.start, { wheel: 'confirm', jukebox: ['start', 'start'] });
  assert.deepEqual(standard.exit, { wheel: 'exit', jukebox: ['exit', 'exit'] });
  assert.deepEqual(standard.leftMagna, { wheel: 'collection-previous', jukebox: [undefined, 'playlist-previous'] });
  assert.deepEqual(standard.rightMagna, { wheel: 'collection-next', jukebox: [undefined, 'playlist-next'] });
  // Interface non standard : Valider sur le MagnaSave droit, Retour sur le gauche (étape « Boutons de l'interface »).
  const custom: ButtonsSource = { buttons: game, navigation: { previous: game.leftFlipper!, next: game.rightFlipper!, confirm: game.rightMagna!, back: game.leftMagna! } };
  assert.deepEqual(navigationButtons(custom), custom!.navigation);
  const mapped = roles(custom);
  assert.deepEqual(mapped.rightMagna, { wheel: 'confirm', jukebox: ['start', 'start'] }, 'Valider sur la roue : Start dans le Juke-box');
  assert.deepEqual(mapped.leftMagna, { wheel: 'exit', jukebox: ['exit', 'exit'] }, 'Retour sur la roue : Exit dans le Juke-box');
  assert.deepEqual(mapped.start, { wheel: undefined, jukebox: [undefined, undefined] }, 'Start du jeu, hors de l’interface : rien, ni sur la roue ni dans le Juke-box');
  // Plus aucune touche pour changer de playlist : le bandeau ne propose pas les MagnaSave, la navigation passe par Start et Exit.
  assert.deepEqual(collectionKeys(custom), { previous: [], next: [] });
  // Chaque bouton relevé a le même rôle sur la roue et dans le Juke-box, aux deux niveaux (Start à part : appui court ou maintenu).
  for (const source of [{ buttons: game }, custom]) {
    for (const [id, r] of Object.entries(roles(source))) {
      const expected = r.wheel === 'confirm' ? 'start' : r.wheel === 'previous' || r.wheel === 'next' || r.wheel === 'exit' ? r.wheel : undefined;
      if (expected) assert.deepEqual(r.jukebox, [expected, expected], id);
    }
  }
});

test('boutons : la roue et le Juke-box passent par menuButton, sans touche du clavier codée en dur', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'app', 'src', file), 'utf8');
  const frontend = read('frontend.ts');
  const player = read('jukebox-player.ts');
  // La roue : le rôle de chaque appui vient de menuButton (boutons de l'interface, MagnaSave des collections).
  assert.match(frontend, /case 'menu':[\s\S]*?menuButton\(input\.code, KEYS, collectionKeys\(\)\)/);
  // Le Juke-box reçoit les mêmes touches que la roue (KEYS, collectionKeys) et les résout de même.
  assert.match(frontend, /keys: \(\) => \(\{\s*keys: KEYS,\s*collections: collectionKeys\(\)/);
  assert.match(player, /menuButton\(input\.code, k\.keys, k\.collections\)/);
  // Aucune touche de MagnaSave, de Start ou d'Exit écrite en dur dans le lecteur (seules les flèches d'un clavier, hors boutons relevés).
  assert.doesNotMatch(player, /'(ControlLeft|ControlRight|ShiftLeft|ShiftRight|Digit1|Escape|Enter)'/);
});
