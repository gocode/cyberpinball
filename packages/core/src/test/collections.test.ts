import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { ShelfMemory, addMyCollection, removeMyCollection, renameMyCollection, setTableInMyCollection, type CollectionsSettings, buildCollections, shelfView, findCollection, isFavorite, loadCollections, mergeFavorite, saveCollections, setFavorite, stepCollection } from '../collections';
import { setLanguage } from '../i18n';
import type { TableEntry } from '../tables';

type T = Pick<TableEntry, 'file' | 'title' | 'manufacturer' | 'year' | 'info'>;
const table = (title: string, extra: { manufacturer?: string; year?: number; starts?: number; last?: string; favorite?: unknown } = {}): T => ({
  file: `D:\\Tables\\${title}\\${title}.vpx`,
  title,
  manufacturer: extra.manufacturer,
  year: extra.year,
  info: { User: { StartCount: extra.starts, LastRun: extra.last, ...(extra.favorite !== undefined ? { Favorite: extra.favorite as number } : {}) } },
});

const AFM = table('Attack from Mars', { manufacturer: 'Bally', year: 1995, starts: 9, last: '2026-10-20T20:00:00Z', favorite: 1 });
const GOT = table('Game of Thrones', { manufacturer: 'Stern', year: 2015 });
const T2 = table('Terminator 2', { manufacturer: 'Williams', year: 1991, starts: 4, last: '2026-10-30T20:00:00Z' });
const TZ = table('Twilight Zone', { manufacturer: 'bally ', year: 1993, favorite: 0 });
const ORIG = table('Zeta Original');
const ALL = [AFM, GOT, T2, TZ, ORIG];
const titles = (list: readonly T[]) => list.map((x) => x.title);
const ids = (list: readonly { id: string }[]) => list.map((c) => c.id);

test('collections : les fixes d’abord, puis fabricants (A → Z) et décennies, vides comprises', () => {
  const list = buildCollections(ALL);
  assert.deepEqual(ids(list), ['all', 'favorites', 'recent', 'unplayed', 'friends', 'maker:bally', 'maker:stern', 'maker:williams', 'decade:1990', 'decade:2010']);
  const of = (id: string) => findCollection(list, id);
  assert.deepEqual(titles(of('all').tables), titles(ALL));
  assert.deepEqual(titles(of('favorites').tables), ['Attack from Mars']);
  // Récentes : la plus récente d'abord, quel que soit l'ordre du menu.
  assert.deepEqual(titles(of('recent').tables), ['Terminator 2', 'Attack from Mars']);
  assert.deepEqual(titles(of('unplayed').tables), ['Game of Thrones', 'Twilight Zone', 'Zeta Original']);
  // « Bally » et « bally » : un seul fabricant ; à égalité, le nom vu le premier.
  assert.deepEqual(titles(of('maker:bally').tables), ['Attack from Mars', 'Twilight Zone']);
  assert.equal(of('maker:bally').label, 'Bally');
  assert.deepEqual(titles(of('decade:1990').tables), ['Attack from Mars', 'Terminator 2', 'Twilight Zone']);
  // Réseau coupé : Avec mes amis est là, vide, avec sa raison.
  assert.equal(of('friends').tables.length, 0);
  assert.ok(of('friends').reason);
  for (const c of list) assert.equal(Boolean(c.reason), c.tables.length === 0, c.id);
});

test('collections : une collection vide dit pourquoi ; aucune table', () => {
  const list = buildCollections([GOT]);
  assert.match(findCollection(list, 'favorites').reason!, /Ajouter aux favoris/);
  assert.match(findCollection(list, 'recent').reason!, /Aucune table jouée/);
  const empty = buildCollections([]);
  assert.deepEqual(ids(empty), ['all', 'favorites', 'recent', 'unplayed', 'friends']);
  assert.ok(findCollection(empty, 'all').reason);
});

test('collections : avec mes amis en ligne, d’après le réseau', () => {
  const ready = buildCollections(ALL, { friends: { state: 'ready', files: new Set([T2.file.toLowerCase()]) } });
  assert.deepEqual(titles(findCollection(ready, 'friends').tables), ['Terminator 2']);
  for (const state of ['none', 'offline', 'searching'] as const) {
    const c = findCollection(buildCollections(ALL, { friends: { state, files: new Set([T2.file.toLowerCase()]) } }), 'friends');
    assert.equal(c.tables.length, 0, state);
    assert.ok(c.reason, state);
  }
  const none = findCollection(buildCollections(ALL, { friends: { state: 'ready', files: new Set() } }), 'friends');
  assert.match(none.reason!, /même version/);
});

test('collections : les MagnaSave passent à la voisine non vide, en boucle', () => {
  const list = buildCollections(ALL);
  assert.equal(stepCollection(list, 'all', 1).id, 'favorites');
  // Avec mes amis, vide, est sautée.
  assert.equal(stepCollection(list, 'unplayed', 1).id, 'maker:bally');
  assert.equal(stepCollection(list, 'all', -1).id, 'decade:2010');
  assert.equal(stepCollection(list, 'decade:2010', 1).id, 'all');
  // Une seule autre non vide.
  const solo = buildCollections([ORIG]);
  assert.equal(stepCollection(solo, 'all', 1).id, 'unplayed');
  // Inconnue (le fabricant est parti avec sa dernière table) : Toutes.
  assert.equal(findCollection(list, 'maker:gottlieb').id, 'all');
});

test('collections : chaque collection garde sa table ; une table partie laisse sa place à sa voisine', () => {
  const memory = new ShelfMemory();
  assert.equal(memory.indexIn('favorites', ALL, 2), 2);
  memory.remember('all', T2.file.toUpperCase(), 2);
  assert.equal(memory.indexIn('all', ALL), 2);
  assert.equal(memory.indexIn('all', [AFM, GOT, TZ, ORIG]), 2);
  assert.equal(memory.indexIn('all', [AFM]), 0);
  assert.equal(memory.indexIn('all', []), 0);
});

test('favoris : User.Favorite du .info, écrit à 1 ou 0 sans rien perdre', () => {
  assert.equal(isFavorite({ User: { Favorite: 1 } }), true);
  assert.equal(isFavorite({ User: { Favorite: 0 } }), false);
  assert.equal(isFavorite({ User: { Favorite: true as unknown as number } }), true);
  assert.equal(isFavorite({}), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-favoris-'));
  const file = path.join(dir, 'Table.info');
  fs.writeFileSync(file, JSON.stringify({ Info: { Title: 'Table' }, User: { StartCount: 3 }, Autre: { x: 1 } }));
  setFavorite(file, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { Info: { Title: 'Table' }, User: { StartCount: 3, Favorite: 1 }, Autre: { x: 1 } });
  setFavorite(file, false);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).User.Favorite, 0);
  // Un .info absent se crée.
  const fresh = path.join(dir, 'Nouvelle', 'Nouvelle.info');
  setFavorite(fresh, true);
  assert.equal(isFavorite(JSON.parse(fs.readFileSync(fresh, 'utf8'))), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('favoris : celui d’un .info apporté vaut quand la table n’en dit rien', () => {
  assert.equal(mergeFavorite({ User: { StartCount: 2 } }, { User: { Favorite: 1 } }).User?.Favorite, 1);
  assert.equal(mergeFavorite({ User: { Favorite: 0 } }, { User: { Favorite: 1 } }).User?.Favorite, 0);
  assert.equal(mergeFavorite({}, {}).User, undefined);
});

test('collections : la collection active se garde, une valeur illisible donne Toutes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-collections-'));
  assert.deepEqual(loadCollections(dir), { active: 'all', mine: [] });
  saveCollections(dir, { active: 'maker:bally', mine: [] });
  assert.deepEqual(loadCollections(dir), { active: 'maker:bally', mine: [] });
  fs.writeFileSync(path.join(dir, 'collections.json'), '{"active":"nimporte"}');
  assert.deepEqual(loadCollections(dir), { active: 'all', mine: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('collections : le nom d’une collection fixe tient dans le repère, en français et en anglais', () => {
  // Le repère a une largeur fixe (frontend.css, .menu-shelf) : « JAMAIS JOUÉES · 2 tables » y tient
  // de justesse ; seul un fabricant au nom très long peut perdre sa fin.
  for (const language of ['fr', 'en'] as const) {
    setLanguage(language);
    for (const c of buildCollections(ALL).filter((x) => x.group === 'fixed')) assert.ok(shelfView(c).label.length <= 13, `${language} : « ${shelfView(c).label} »`);
  }
  setLanguage('fr');
});

test('mes collections : créer, nommer, remplir, renommer, supprimer ; gardées et relues', () => {
  let s: CollectionsSettings = { active: 'all', mine: [] };
  const made = addMyCollection(s, '  Soirées   entre amis  ', 'Terminator 2/T2.vpx');
  assert.equal(made.id, 'mine:soirees-entre-amis');
  s = made.settings;
  assert.equal(s.mine[0]!.name, 'Soirées entre amis');
  // Même nom : un autre identifiant ; nom vide : rien.
  const twin = addMyCollection(s, 'Soirées entre amis');
  assert.equal(twin.id, 'mine:soirees-entre-amis-2');
  assert.equal(addMyCollection(s, '   ').id, undefined);
  s = setTableInMyCollection(s, 'mine:soirees-entre-amis', 'Attack from Mars/AFM.vpx', true);
  s = setTableInMyCollection(s, 'mine:soirees-entre-amis', 'attack from mars/afm.vpx', true);
  assert.equal(s.mine[0]!.tables.length, 2);
  // Dans la liste : après les fixes, l'ordre du menu, une table absente du disque ignorée.
  const tables = [
    { ...AFM, id: 'Attack from Mars/AFM.vpx' },
    { ...T2, id: 'Terminator 2/T2.vpx' },
  ];
  s = setTableInMyCollection(s, 'mine:soirees-entre-amis', 'Partie/Absente.vpx', true);
  const list = buildCollections(tables, { mine: s.mine });
  const mine = findCollection(list, 'mine:soirees-entre-amis');
  assert.equal(mine.group, 'mine');
  assert.deepEqual(titles(mine.tables), ['Attack from Mars', 'Terminator 2']);
  assert.ok(list.findIndex((c) => c.id === mine.id) > list.findIndex((c) => c.id === 'friends'));
  assert.ok(list.findIndex((c) => c.id === mine.id) < list.findIndex((c) => c.group === 'maker'));
  s = setTableInMyCollection(s, 'mine:soirees-entre-amis', 'Terminator 2/T2.vpx', false);
  assert.equal(s.mine[0]!.tables.includes('Terminator 2/T2.vpx'), false);
  s = renameMyCollection(s, 'mine:soirees-entre-amis', 'Vendredi');
  assert.equal(s.mine[0]!.name, 'Vendredi');
  // Affichée puis supprimée : la roue revient sur Toutes.
  s = { ...s, active: 'mine:soirees-entre-amis' };
  s = removeMyCollection(s, 'mine:soirees-entre-amis');
  assert.equal(s.active, 'all');
  assert.equal(s.mine.length, 0);
  // Gardées : relues telles quelles, avec les boutons choisis ; un fichier abîmé est nettoyé.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-mes-collections-'));
  const saved = addMyCollection({ active: 'all', mine: [], keys: { previous: 'SDLJoy_X_1;8', next: 'SDLJoy_X_1;9' } }, 'Classiques', 'Terminator 2/T2.vpx').settings;
  saveCollections(dir, { ...saved, active: 'mine:classiques' });
  assert.deepEqual(loadCollections(dir), { ...saved, active: 'mine:classiques' });
  fs.writeFileSync(path.join(dir, 'collections.json'), JSON.stringify({ active: 'mine:fantome', mine: [{ id: 'pas-mine', name: 'x' }, { id: 'mine:ok', name: '', tables: [] }, { id: 'mine:bon', name: 'Bon', tables: [1, 'A/a.vpx'] }] }));
  assert.deepEqual(loadCollections(dir), { active: 'all', mine: [{ id: 'mine:bon', name: 'Bon', tables: ['A/a.vpx'] }] });
  fs.rmSync(dir, { recursive: true, force: true });
});
