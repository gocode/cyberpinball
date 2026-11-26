import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { TableEntry } from '../tables';
import { frontendSource } from './frontend-source';
import { removeTempDir } from './temp-dir';
import { REPO_ROOT } from './i18n-scan';
import { fakeMenuLibrary } from './doublures';
interface Action { label: string; detail?: string; run(): void }
interface Catalog {
  eligible(table: TableEntry, drawFrom: string | undefined): boolean;
  candidates(tables: TableEntry[], drawFrom: string | undefined): { id: string }[];
  tableAction(table: TableEntry, refresh: () => void): Action;
  collectionExcluded(id: string): boolean;
  collectionAction(id: string, refresh: () => void): Action;
}
const { createCollectionsMenu } = require(path.join(REPO_ROOT, 'app/dist/collections-menu.js')) as { createCollectionsMenu(host: unknown): { exact(): { tables: TableEntry[] } | undefined; current(): unknown } };
const { createSurpriseCatalog } = require(path.join(REPO_ROOT, 'app/dist/table-surprise.js')) as { createSurpriseCatalog(host: unknown): Catalog };

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surprise-catalog-'));
  const table = (id: string) => ({ id, title: id, emulator: 'futurepinball', file: path.join(dir, `${id}.fpt`), folder: dir, infoFile: path.join(dir, `${id}.info`), info: {} }) as TableEntry;
  const tables = ['Ocean', 'Galaxy', 'Castle'].map(table);
  const state = {
    guest: false, playable: new Set(tables.map((t) => t.id)), changed: 0, reads: 0,
    collections: [{ id: 'all', tables: ['Ocean', 'Galaxy', 'Castle'] }, { id: 'mine:adulte', tables: ['Galaxy'] }, { id: 'engine:pinballfx', tables: ['Castle'] }],
  };
  const catalog = (): Catalog => createSurpriseCatalog({ dataDir: dir, guest: () => state.guest, playable: (t: TableEntry) => state.playable.has(t.id), collections: () => (state.reads++, state.collections), wheel: () => undefined, changed: () => state.changed++ });
  return { dir, tables, state, catalog };
}
const ids = (list: { id: string }[]) => list.map((e) => e.id);

test('S11 : par défaut, toutes les tables jouables entrent dans le tirage, sans confirmation', () => {
  const f = setup();
  try {
    assert.deepEqual(ids(f.catalog().candidates(f.tables, 'all')), ['Ocean', 'Galaxy', 'Castle']);
    f.state.playable.delete('Castle');
    assert.deepEqual(ids(f.catalog().candidates(f.tables, 'all')), ['Ocean', 'Galaxy'], 'jeu absent ou fichier refusé : pas de tirage');
  } finally { removeTempDir(f.dir); }
});
test('S11 : exclusion par table (Gérer la table > Table surprise), persistante, jamais écrite dans la table', () => {
  const f = setup(); let refreshed = 0;
  try {
    const catalog = f.catalog();
    // La valeur dit l'effet : un « Oui/Non » sous « Dans le tirage » n'était pas compris.
    assert.equal(catalog.tableAction(f.tables[0]!, () => {}).label, 'Table surprise');
    assert.equal(catalog.tableAction(f.tables[0]!, () => {}).detail, 'Peut sortir');
    catalog.tableAction(f.tables[0]!, () => refreshed++).run();
    assert.equal(refreshed, 1); assert.equal(f.state.changed, 1);
    assert.equal(catalog.tableAction(f.tables[0]!, () => {}).detail, 'Ne sort jamais');
    for (const from of ['all', 'favorites', 'mine:adulte']) assert.equal(f.catalog().eligible(f.tables[0]!, from), false);
    catalog.tableAction(f.tables[0]!, () => {}).run();
    assert.equal(f.catalog().eligible(f.tables[0]!, 'all'), true, 'second appui : de nouveau dans le tirage');
    assert.equal(fs.existsSync(f.tables[0]!.infoFile), false, 'jamais d’écriture dans le .info partagé');
  } finally { removeTempDir(f.dir); }
});
test('S11 : collection exclue du tirage de Toutes les tables, mais tirable pour elle-même', () => {
  const f = setup();
  try {
    const catalog = f.catalog();
    assert.equal(catalog.collectionAction('mine:adulte', () => {}).detail, 'Non');
    catalog.collectionAction('mine:adulte', () => {}).run();
    assert.equal(catalog.collectionAction('mine:adulte', () => {}).detail, 'Oui');
    assert.deepEqual(ids(catalog.candidates(f.tables, 'all')), ['Ocean', 'Castle']);
    assert.deepEqual(ids(catalog.candidates([f.tables[1]!], 'mine:adulte')), ['Galaxy']);
    assert.deepEqual(ids(catalog.candidates(f.tables, 'favorites')), ['Ocean', 'Galaxy', 'Castle']);
  } finally { removeTempDir(f.dir); }
});
test('S11 : toute collection s’exclut, automatique comme Pinball FX ; jamais Toutes les tables d’elle-même', () => {
  const f = setup();
  try {
    const catalog = f.catalog();
    catalog.collectionAction('engine:pinballfx', () => {}).run();
    assert.equal(catalog.collectionExcluded('engine:pinballfx'), true);
    assert.deepEqual(ids(catalog.candidates(f.tables, 'all')), ['Ocean', 'Galaxy'], 'les tables Pinball FX ne sortent plus de Toutes les tables');
    assert.deepEqual(ids(catalog.candidates([f.tables[2]!], 'engine:pinballfx')), ['Castle'], 'tirer dans Pinball FX reste possible');
    catalog.collectionAction('all', () => {}).run();
    assert.deepEqual(ids(catalog.candidates(f.tables, 'all')), ['Ocean', 'Galaxy'], 'Toutes les tables ne s’exclut pas d’elle-même');
  } finally { removeTempDir(f.dir); }
});
test('S29 : les collections sont lues une fois par tirage, et seulement s’il y a une collection exclue', () => {
  const f = setup();
  try {
    const catalog = f.catalog();
    catalog.candidates(f.tables, 'all'); assert.equal(f.state.reads, 0, 'aucune collection exclue : rien à lire');
    catalog.collectionAction('mine:adulte', () => {}).run();
    catalog.candidates(f.tables, 'all'); assert.equal(f.state.reads, 1, 'une seule lecture pour toutes les tables');
    catalog.candidates(f.tables, 'favorites'); assert.equal(f.state.reads, 1, 'hors Toutes les tables : rien à lire');
  } finally { removeTempDir(f.dir); }
});
test('Collections > Exclure du tirage… : toutes les collections sauf Toutes les tables, « hors tirage » dans la liste, absent en invité', () => {
  const f = setup();
  try {
    const { createCollectionsItem } = require(path.join(REPO_ROOT, 'app/dist/collections-menu.js')) as { createCollectionsItem(host: unknown): { run(): void } };
    type Built = { heading: string; sections: { rows: { text: string; detail?: string }[] }[]; actions: { label: string; run(): void }[] };
    const list = [
      { id: 'all', group: 'fixed', label: 'Toutes', icon: 'list', tables: f.tables },
      { id: 'favorites', group: 'fixed', label: 'Favoris', icon: 'star', tables: [f.tables[0]!] },
      { id: 'engine:pinballfx', group: 'engine', label: 'Pinball FX', icon: 'list', tables: [f.tables[2]!] },
    ];
    const screens: Built[] = []; const builds: (() => Built)[] = [];
    const catalog = f.catalog();
    const item = createCollectionsItem({
      collections: { list: () => list, current: () => list[0], choose: () => true, mine: () => [] },
      library: fakeMenuLibrary({ openCustom: (build: () => Built) => builds.push(build) }),
      keysLabel: () => undefined, captureKeys() {},
      surprise: () => (f.state.guest ? undefined : { excluded: (id: string) => catalog.collectionExcluded(id), action: (id: string, refresh: () => void) => catalog.collectionAction(id, refresh) }),
    });
    const last = () => { const b = builds[builds.length - 1]!(); screens.push(b); return b; };
    const rows = (b: Built) => b.sections.flatMap((s) => s.rows);
    item.run();
    last().actions.find((a) => a.label === 'Exclure du tirage…')!.run();
    const surprise = last();
    assert.equal(surprise.heading, 'Exclure du tirage de Toutes les tables');
    assert.deepEqual(rows(surprise).map((r) => `${r.text} ${r.detail}`), ['Favoris Non', 'Pinball FX Non']);
    surprise.actions.find((a) => a.label === 'Pinball FX')!.run();
    assert.deepEqual(rows(last()).map((r) => `${r.text} ${r.detail}`), ['Favoris Non', 'Pinball FX Oui'], 'Start bascule, la liste se redessine');
    assert.deepEqual(ids(catalog.candidates(f.tables, 'all')), ['Ocean', 'Galaxy']);
    item.run();
    assert.match(rows(last()).find((r) => r.text === 'Pinball FX')!.detail ?? '', /hors tirage/);
    f.state.guest = true; item.run();
    assert.equal(last().actions.some((a) => a.label === 'Exclure du tirage…'), false, 'l’invité ne change pas les exclusions');
  } finally { removeTempDir(f.dir); }
});
test('S15 : mode invité, tirage dans la collection imposée sans pouvoir changer les exclusions', () => {
  const f = setup();
  try {
    f.catalog().tableAction(f.tables[2]!, () => {}).run();
    f.state.guest = true;
    const catalog = f.catalog();
    assert.deepEqual(ids(catalog.candidates(f.tables, 'favorites')), ['Ocean', 'Galaxy'], 'exclusions du propriétaire appliquées');
    catalog.tableAction(f.tables[0]!, () => {}).run(); catalog.collectionAction('mine:adulte', () => {}).run();
    assert.deepEqual(ids(catalog.candidates(f.tables, 'all')), ['Ocean', 'Galaxy'], 'aucun changement en invité');
  } finally { removeTempDir(f.dir); }
});
test('S11 : réglages illisibles ou de l’ancien format : rien n’est retiré du tirage', () => {
  const f = setup();
  try {
    const file = path.join(f.dir, 'table-surprise.json');
    fs.writeFileSync(file, '{broken'); assert.equal(f.catalog().candidates(f.tables, 'all').length, 3);
    fs.writeFileSync(file, JSON.stringify({ Ocean: { audience: 'adult', hidden: true, verified: 'x' } }));
    assert.equal(f.catalog().candidates(f.tables, 'all').length, 3);
  } finally { removeTempDir(f.dir); }
});
test('S09–S12 : collection exacte, y compris favorites vides et collection invité supprimée', () => {
  const f = setup(); let forced: string | undefined;
  try {
    fs.writeFileSync(path.join(f.dir, 'collections.json'), JSON.stringify({ active: 'favorites', mine: [] }));
    const c = createCollectionsMenu({ dataDir: f.dir, tables: () => f.tables, selected: () => f.tables[0], select() {}, guestCollection: () => forced, startIndex: () => 0, redraw() {} });
    forced = 'missing'; assert.equal(c.exact(), undefined);
    forced = 'favorites'; assert.equal(c.exact()?.tables.length, 0);
    forced = undefined; assert.ok(c.current());
  } finally { removeTempDir(f.dir); }
});
test('S23–S28 : raccordement commun avant await ; continuations Zen repassent par play', () => {
  const src = frontendSource();
  const play = src.slice(src.indexOf('async function play(table'), src.indexOf('async function publishScores'));
  assert.ok(play.indexOf('launchReservation.reserve()') < play.indexOf('await backups.yieldToGame()'));
  assert.ok(play.indexOf('if (reserved && !launchReservation.owns(reserved)) return undefined;') < play.indexOf('launchReservation.reserve()'), 'un ancien jeton ne peut jamais acquérir une nouvelle réservation');
  assert.match(play, /finally \{ launchReservation.release\(owner\); \}/);
  assert.match(src, /pendingPlay = \{ frontends: \[\], play: \(\) => play\(table, autoStopAfterMs, mode, \{\}, undefined, true\)/);
  assert.match(src, /if \(surprise.busy \|\| \(state.phase === 'menu' && launchReservation.busy\)\) \{\s*if \(action.type === 'key' && surpriseCancelKey/);
  assert.ok(play.indexOf('launchReservation.owns(owner)', play.indexOf('await backups.yieldToGame()')) > play.indexOf('await backups.yieldToGame()'));
  assert.match(src, /surprise: role === 'playfield' \? surprise.view\(\) : undefined/);
  assert.match(src, /if \(!fromPhone && !input.isAutoRepeat\) surpriseGesture.input/);
  assert.match(play, /surpriseCatalog\.eligible\(table, collections\.exact\(\)\?\.id\)/, 'revérifié dans la collection du tirage');
});
test('S30 : la roue ignore les répétitions des flippers tenus ensemble, avant la cadence de la roue', () => {
  const src = frontendSource();
  const freeze = src.indexOf("input.isAutoRepeat && surpriseGesture.pair) return true;");
  assert.ok(freeze > 0 && freeze < src.indexOf('!wheelRepeat.take(Boolean(input.isAutoRepeat))'));
});
test('S31 : Pinball FX tirable dans toutes ses boutiques, comme au Start', () => {
  const src = frontendSource();
  const body = src.slice(src.indexOf('function surprisePlayable('), src.indexOf('const surpriseCatalog ='));
  assert.match(body, /detectPinballFx\(\)/); assert.match(body, /detectPinballFx3\(loc\.dataDir\)/);
  assert.doesNotMatch(body, /store === 'steam'|hkcuValue/);
});
test('S29 : une grande collection entièrement exclue ne lit aucun moteur ni logo', () => {
  const f = setup(); let engineReads = 0, logoReads = 0;
  try {
    fs.writeFileSync(path.join(f.dir, 'table-surprise.json'), JSON.stringify({ tables: Array.from({ length: 500 }, (_, i) => `t-${i}`), collections: [] }));
    const catalog = createSurpriseCatalog({ dataDir: f.dir, guest: () => false, playable: () => { engineReads++; return true; }, collections: () => [], wheel: () => { logoReads++; return undefined; }, changed() {} });
    const many = Array.from({ length: 500 }, (_, i) => ({ ...f.tables[0]!, id: `t-${i}` }));
    assert.deepEqual(catalog.candidates(many, 'all'), []); assert.equal(engineReads, 0); assert.equal(logoReads, 0);
  } finally { removeTempDir(f.dir); }
});
