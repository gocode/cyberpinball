import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { TableEntry } from '../tables';
import { frontendSource } from './frontend-source';
import { removeTempDir } from './temp-dir';
import { REPO_ROOT } from './i18n-scan';
interface SurpriseEngine { files: string[]; identity: string; romDirs?: string[] }
interface Built { actions: { label: string; run(): void }[] }
const { createCollectionsMenu } = require(path.join(REPO_ROOT, 'app/dist/collections-menu.js')) as { createCollectionsMenu(host: unknown): { exact(): { tables: TableEntry[] } | undefined; current(): unknown } };
const { createSurpriseCatalog, surpriseFingerprint } = require(path.join(REPO_ROOT, 'app/dist/table-surprise.js')) as {
  surpriseFingerprint(table: TableEntry, engine: SurpriseEngine | undefined): string | undefined;
  createSurpriseCatalog(host: unknown): { eligible(table: TableEntry): boolean; candidates(tables: TableEntry[]): unknown[]; action(table: TableEntry, back: () => void): { run(): void } };
};

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surprise-catalog-'));
  const exe = path.join(dir, 'player.exe'); fs.writeFileSync(exe, 'fake engine');
  const file = path.join(dir, 'Ocean.fpt'); fs.writeFileSync(file, 'fake table');
  const entry = { id: 'Ocean.fpt', title: 'Ocean', emulator: 'futurepinball', file, folder: dir, infoFile: path.join(dir, 'Ocean.info'), info: {} } as TableEntry;
  const engine: SurpriseEngine = { files: [exe], identity: 'fake-player-v1' };
  return { dir, exe, entry, engine };
}
test('S13–S15 : fichier / moteur / identifiant FX / script inconnus exclus sans exécuter de jeu', () => {
  const f = setup();
  try {
    assert.ok(surpriseFingerprint(f.entry, f.engine));
    assert.equal(surpriseFingerprint(f.entry, undefined), undefined);
    assert.equal(surpriseFingerprint({ ...f.entry, file: path.join(f.dir, 'missing.fpt') }, f.engine), undefined);
    assert.equal(surpriseFingerprint({ ...f.entry, emulator: 'pinballfx' }, f.engine), undefined);
    assert.ok(surpriseFingerprint({ ...f.entry, emulator: 'pinballfx', pinballFxTable: 42 }, f.engine));
    assert.equal(surpriseFingerprint({ ...f.entry, emulator: 'vpx' }, f.engine), undefined);
  } finally { removeTempDir(f.dir); }
});
test('S13 : script externe actif, ROM absente exclue, ROM présente liée à la confirmation', () => {
  const f = setup();
  try {
    const entry = { ...f.entry, emulator: 'vpx' as const, file: path.join(f.dir, 'Ocean.vpx') };
    fs.writeFileSync(entry.file, 'fake vpx'); fs.writeFileSync(path.join(f.dir, 'Ocean.vbs'), 'Set Controller = CreateObject("VPinMAME.Controller")\nConst cGameName = "ocean_10"\nController.GameName = cGameName');
    const engine = { ...f.engine, romDirs: [f.dir] };
    assert.equal(surpriseFingerprint(entry, engine), undefined);
    fs.writeFileSync(path.join(f.dir, 'ocean_10.zip'), 'fake rom');
    const before = surpriseFingerprint(entry, engine); assert.ok(before);
    fs.appendFileSync(path.join(f.dir, 'Ocean.vbs'), '\n\'changed'); assert.notEqual(surpriseFingerprint(entry, engine), before);
  } finally { removeTempDir(f.dir); }
});
test('S11 / S15 : autorisation administrative persistante ; mode invité et compte / moteur modifié exclus', () => {
  const f = setup(); let guest = false, build: (() => Built) | undefined;
  try {
    const host = { dataDir: f.dir, guest: () => guest, engine: () => f.engine, wheel: () => undefined, library: { openCustom: (next: () => Built) => { build = next; } }, changed() {} };
    const catalog = createSurpriseCatalog(host);
    assert.deepEqual(catalog.candidates([f.entry]), []);
    catalog.action(f.entry, () => {}).run(); assert.ok(build);
    build!().actions[1]!.run(); assert.equal(catalog.eligible(f.entry), true);
    guest = true; assert.equal(catalog.eligible(f.entry), false);
    build!().actions[0]!.run(); assert.equal(catalog.eligible(f.entry), false, 'stale admin action cannot authorize in guest mode');
    guest = false; build!().actions[0]!.run(); guest = true; assert.equal(catalog.eligible(f.entry), true);
    assert.equal(createSurpriseCatalog(host).eligible(f.entry), true, 'persist after reopening');
    f.engine.identity = 'different-account-or-engine'; assert.equal(catalog.eligible(f.entry), false);
    assert.equal(fs.existsSync(f.entry.infoFile), false, 'never modifies shared info');
  } finally { removeTempDir(f.dir); }
});
test('S11 : configuration locale illisible échoue fermée', () => {
  const f = setup();
  try { fs.writeFileSync(path.join(f.dir, 'table-surprise.json'), '{broken'); const catalog = createSurpriseCatalog({ dataDir: f.dir, guest: () => false, engine: () => f.engine, wheel: () => undefined, library: { openCustom() {} }, changed() {} }); assert.deepEqual(catalog.candidates([f.entry]), []); }
  finally { removeTempDir(f.dir); }
});
test('S09–S12 : collection exacte, y compris favorites vides et collection invité supprimée', () => {
  const f = setup(); let forced: string | undefined;
  try {
    fs.writeFileSync(path.join(f.dir, 'collections.json'), JSON.stringify({ active: 'favorites', mine: [] }));
    const c = createCollectionsMenu({ dataDir: f.dir, tables: () => [f.entry], selected: () => f.entry, select() {}, guestCollection: () => forced, startIndex: () => 0, redraw() {} });
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
});
test('S29 : une grande collection inconnue ne lit aucun moteur ni logo', () => {
  const f = setup(); let engineReads = 0, logoReads = 0;
  try {
    const catalog = createSurpriseCatalog({ dataDir: f.dir, guest: () => true, engine: () => { engineReads++; return f.engine; }, wheel: () => { logoReads++; return undefined; }, library: { openCustom() {} }, changed() {} });
    const many = Array.from({ length: 500 }, (_, i) => ({ ...f.entry, id: `unknown-${i}` }));
    assert.deepEqual(catalog.candidates(many), []); assert.equal(engineReads, 0); assert.equal(logoReads, 0);
  } finally { removeTempDir(f.dir); }
});
