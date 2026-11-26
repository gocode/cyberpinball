import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, type TestContext } from 'node:test';
import { MenuMedias, PARENTAL_FILE, ParentalControl, describeTableFile, parentalTableKey } from '..';
import { REPO_ROOT } from './i18n-scan';

const demoPin = '0427';
const ocean = 'Ocean/Ocean.fpt';
const space = 'Space/Space.fpt';
const family = { id: 'mine:family', tables: [{ id: ocean }, { id: space }] };
const privateSet = { id: 'mine:private' as const, tables: [{ id: ocean }] };

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-parental-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let now = 100_000;
  let groups = [family, privateSet, { id: 'favorites', tables: [{ id: ocean }] }];
  const host = { dataDir: root, now: () => now, groups: () => groups };
  return {
    root,
    policy: new ParentalControl(host),
    again: () => new ParentalControl(host),
    advance: (ms: number) => { now += ms; },
    regroup: (next: typeof groups) => { groups = next; },
  };
}

async function protect(policy: ParentalControl): Promise<void> {
  assert.equal(await policy.setPin(demoPin, demoPin), 'ok');
  assert.equal(policy.configure({ ...policy.settings, enabled: true, collections: [privateSet.id] }), true);
  policy.lock();
}

test('parental : inactif par défaut, confirmation obligatoire, sel aléatoire et changement authentifié', async (t) => {
  const f = fixture(t);
  const policy = f.policy;
  const file = path.join(f.root, PARENTAL_FILE);
  assert.equal(policy.enabled, false);
  assert.equal(policy.tableAllowed(ocean), true);
  assert.equal(policy.configure({ ...policy.settings, enabled: true }), false);
  assert.equal(await policy.setPin('7272', '2727'), 'incorrect');
  assert.equal(fs.existsSync(file), false);
  await protect(policy);
  const record = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const first = record().credential;
  assert.deepEqual(Object.keys(first).sort(), ['hash', 'salt']);
  assert.match(first.hash, /^[0-9a-f]{64}$/);
  assert.match(first.salt, /^[0-9a-f]{32}$/);
  assert.equal(await policy.setPin('7272', '7272'), 'locked');
  assert.equal(policy.configure({ ...policy.settings, enabled: false }), false);
  assert.equal(await policy.unlock({ kind: 'settings' }, demoPin), 'ok');
  assert.equal(await policy.setPin('7272', '7272'), 'ok');
  assert.notEqual(first.salt, record().credential.salt);
  assert.equal(policy.configure({ ...policy.settings, enabled: false }), true);
  const restarted = f.again();
  assert.equal(restarted.enabled, false);
  assert.equal(await restarted.unlock({ kind: 'settings' }, demoPin), 'incorrect');
  assert.equal(await restarted.unlock({ kind: 'settings' }, '7272'), 'ok');
  assert.equal(restarted.configure({ ...restarted.settings, enabled: true }), true);
  assert.equal(restarted.tableAllowed(ocean), false);
});

test('parental : limitation persistante, demandes simultanées et échec fermé', async (t) => {
  const f = fixture(t);
  await protect(f.policy);
  const scope = { kind: 'table', id: ocean } as const;
  const inFlight = f.policy.unlock(scope, '1234');
  assert.equal(await f.policy.unlock(scope, demoPin), 'busy');
  assert.equal(await inFlight, 'incorrect');
  for (let i = 0; i < 4; i++) assert.equal(await f.policy.unlock(scope, '1234'), 'incorrect');
  assert.equal(f.policy.waitingSeconds, 60);
  const fresh = f.again();
  assert.equal(await fresh.unlock(scope, demoPin), 'wait');
  f.advance(60_000);
  assert.equal(await fresh.unlock(scope, demoPin), 'ok');
  assert.equal(fresh.tableAllowed(ocean), true);
  assert.equal(f.again().tableAllowed(ocean), false, 'autorisation hors du fichier');
  fresh.sync(true, family.id);
  assert.equal(fresh.tableAllowed(ocean), false);
  assert.equal(await fresh.unlock(scope, demoPin), 'locked');
  fs.writeFileSync(path.join(f.root, PARENTAL_FILE), '{');
  const damaged = f.again();
  assert.equal(damaged.damaged, true);
  assert.equal(damaged.tableAllowed(space), false);
  assert.equal(damaged.canConfigure, false);
});

test('parental : appartenance globale, variantes de dossier, changement de collection, délai et révocation', async (t) => {
  const f = fixture(t);
  const policy = f.policy;
  await protect(policy);
  policy.sync(false, family.id);
  assert.equal(policy.tableAllowed(ocean), false, 'membre de la collection protégée et de Famille/Favoris');
  assert.equal(policy.tableAllowed(space), true);
  assert.equal(policy.tableAllowed('Ocean/Ocean Update.fpt'), false);
  assert.equal(policy.collectionAllowed(privateSet.id), false);
  assert.equal(await policy.unlock({ kind: 'collection', id: privateSet.id }, demoPin), 'ok');
  policy.sync(false, privateSet.id);
  assert.equal(policy.tableAllowed(ocean), true);
  assert.equal(policy.collectionAllowed(privateSet.id), true);
  policy.sync(false, 'favorites');
  assert.equal(policy.tableAllowed(ocean), false);
  assert.equal(await policy.unlock({ kind: 'settings' }, demoPin), 'ok');
  assert.equal(policy.configure({ ...policy.settings, tables: [parentalTableKey(space)], idleMinutes: 2, hidden: true }), true);
  policy.lock();
  assert.equal(policy.tableAllowed('Space/Space Update.fpt'), false);
  f.regroup([family, { ...privateSet, tables: [{ id: ocean }, { id: 'New/New.fpt' }] }]);
  assert.equal(policy.tableProtected('New/New.fpt'), true);
  const scope = { kind: 'table', id: space } as const;
  assert.equal(await policy.unlock(scope, demoPin), 'ok');
  f.advance(80_000);
  policy.touch();
  f.advance(80_000);
  assert.equal(policy.tableAllowed(space), true);
  f.advance(40_000);
  assert.equal(policy.tableAllowed(space), false);
  const revoked = policy.unlock(scope, demoPin);
  policy.sync(true, family.id);
  assert.equal(await revoked, 'locked');
  assert.equal(policy.tableAllowed(space), false);
});

test('parental : médias des trois rôles, loading, wheel et audio neutralisés malgré le cache', async (t) => {
  const f = fixture(t);
  const folder = path.join(f.root, 'Ocean');
  const file = path.join(folder, 'Ocean.fpt');
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(file, 'fictional table');
  const table = describeTableFile(f.root, file);
  const resolve = new MenuMedias({ root: f.root, dataDir: f.root, rotation: 0, b2s: false, allowed: (entry) => f.policy.tableAllowed(entry.id) });
  for (const type of ['Playfield', 'Backglass', 'FullDMD', 'Wheel', 'Loading']) {
    fs.writeFileSync(path.join(folder, 'medias', '(' + type + ') Ocean.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XegAAAABJRU5ErkJggg==', 'base64'));
  }
  fs.writeFileSync(path.join(folder, 'medias', '(Audio) Ocean.mp3'), '');
  assert.ok(resolve.wheel(table));
  await protect(f.policy);
  for (const role of ['playfield', 'backglass', 'dmd'] as const) assert.deepEqual(resolve.roleMedia(table, role), resolve.defaultMedia(role));
  assert.deepEqual(resolve.typeMedia(table, 'playfield', 'Loading'), resolve.defaultMedia('playfield'));
  assert.equal(resolve.wheel(table), undefined);
  assert.equal(resolve.sound(table, 'Audio'), undefined);
});

test('parental : flippers circulaires, validation unique, quatre cases masquées et annulation', async (t) => {
  const f = fixture(t);
  await protect(f.policy);
  const { createParentalMenu } = require(path.join(REPO_ROOT, 'app/dist/parental-menu.js')) as {
    createParentalMenu(host: unknown): {
      active: boolean;
      request(scope: { kind: 'table'; id: string }, next: () => void): void;
      input(code: string, repeated: boolean): void;
      release(code: string): void;
      view(): { digits: string[] } | undefined;
    };
  };
  let advances = 0;
  const menu = createParentalMenu({
    policy: f.policy,
    keys: () => ({ previous: ['left'], next: ['right'], confirm: ['start'], exit: ['exit'] }),
    guest: () => false, allowed: () => true, changed() {}, ownerMenu() {}, back() {}, groups: () => [], tables: () => [], pickGroup() {}, pickTable() {},
  });
  const act = (key: string) => { menu.input(key, false); menu.release(key); };
  const ask = () => menu.request({ kind: 'table', id: ocean }, () => { advances++; });
  ask();
  act('left');
  assert.deepEqual(menu.view()?.digits, ['9', '—', '—', '—']);
  act('right');
  menu.input('start', false);
  menu.input('start', true);
  menu.input('start', false);
  menu.release('start');
  assert.deepEqual(menu.view()?.digits, ['●', '0', '—', '—']);
  act('exit');
  assert.equal(menu.view(), undefined);
  assert.equal(f.policy.tableAllowed(ocean), false);
  ask();
  for (const digit of [0, 4, 2, 7]) {
    for (let step = 0; step < digit; step++) act('right');
    act('start');
  }
  for (let n = 0; n < 30 && menu.active; n++) await new Promise<void>((done) => setTimeout(done, 10));
  assert.equal(advances, 1);
  assert.equal(menu.view(), undefined);
  assert.equal(f.policy.tableAllowed(ocean), true);
});

test('parental : collection vide verrouillée, catalogue commun, remplacement VPX et modification bloquée', async (t) => {
  const f = fixture(t);
  const { createCollectionsMenu } = require(path.join(REPO_ROOT, 'app/dist/collections-menu.js')) as {
    createCollectionsMenu(host: unknown): {
      list(): { id: string; icon: string; tables: { id: string }[] }[];
      parentalInventory(): readonly { id: string; tables: readonly { id: string }[] }[];
      current(): { id: string; tables: { id: string }[] };
      choose(id: string, whenOpened?: () => void): boolean;
      removeMine(id: string): void;
    };
  };
  const { saveCollections } = require('../collections') as typeof import('../collections');
  const replacement = 'Ocean/Ocean Update.fpt';
  const table = { id: replacement, file: path.join(f.root, replacement), title: 'Ocean', emulator: 'futurepinball', info: { User: { Favorite: 1 } } };
  const sample = { id: space, file: path.join(f.root, space), title: 'Space', emulator: 'futurepinball', info: {} };
  saveCollections(f.root, { active: 'all', mine: [{ id: privateSet.id, name: 'Demo', tables: [ocean] }] });
  let guestCollection: string | undefined, pending: (() => void) | undefined, activated = 0;
  let collections: ReturnType<typeof createCollectionsMenu>;
  const policy = new ParentalControl({ dataDir: f.root, groups: () => collections.parentalInventory() });
  collections = createCollectionsMenu({
    dataDir: f.root, tables: () => [table, sample], redraw() {}, startIndex: () => 0, selected: () => undefined, select() {},
    guestCollection: () => guestCollection,
    parental: {
      allowed: (id: string) => policy.collectionAllowed(id),
      hidden: () => policy.settings.hidden,
      tableVisible: (entry: { id: string }) => !policy.settings.hidden || policy.tableAllowed(entry.id),
      mayEdit: (id: string) => !policy.collectionConfigured(id) || policy.canConfigure,
      restoredMembers: (id: string) => policy.collectionProtected(id) ? [table, sample].filter((item) => policy.memberOf(id, item.id)) : undefined,
      changed: (id: string) => policy.sync(false, id),
      request: (_: string, done: () => void) => { pending = done; },
    },
  });
  await protect(policy);
  assert.equal(policy.tableProtected(replacement), true, 'collection still names the old file');
  assert.equal(collections.list().find((entry) => entry.id === privateSet.id)?.icon, 'lock');
  assert.equal(collections.choose(privateSet.id, () => { activated++; }), false);
  assert.equal(activated, 0);
  assert.equal(await policy.unlock({ kind: 'collection', id: privateSet.id }, demoPin), 'ok');
  pending!();
  assert.equal(activated, 1);
  assert.deepEqual(collections.current().tables.map((entry) => entry.id), [replacement]);
  assert.equal(collections.choose('all'), true);
  assert.equal(policy.tableAllowed(replacement), false);
  collections.removeMine(privateSet.id);
  assert.ok(collections.list().some((entry) => entry.id === privateSet.id));
  assert.equal(await policy.unlock({ kind: 'settings' }, demoPin), 'ok');
  assert.equal(policy.configure({ ...policy.settings, hidden: true }), true);
  policy.lock();
  for (const group of ['all', 'favorites']) assert.ok(!collections.list().find((entry) => entry.id === group)?.tables.some((item) => item.id === replacement));
  assert.ok(!collections.list().some((entry) => entry.id === privateSet.id));
  guestCollection = privateSet.id;
  policy.sync(true, guestCollection);
  assert.equal(collections.choose(privateSet.id), false);
  assert.deepEqual(collections.current().tables, []);
});

test('parental : Table surprise ne tire une table protégée ni verrouillée ni déverrouillée', async (t) => {
  const f = fixture(t);
  await protect(f.policy);
  const { createSurpriseCatalog } = require(path.join(REPO_ROOT, 'app/dist/table-surprise.js')) as {
    createSurpriseCatalog(host: unknown): { candidates(tables: { id: string }[], from: string): { id: string }[] };
  };
  const c = createSurpriseCatalog({
    dataDir: f.root, guest: () => false, playable: (table: { id: string }) => !f.policy.tableProtected(table.id),
    collections: () => [], wheel: () => undefined, changed() {},
  });
  const tables = [{ id: ocean, title: 'Ocean' }, { id: space, title: 'Space' }];
  assert.deepEqual(c.candidates(tables, 'all').map((entry) => entry.id), [space]);
  assert.equal(await f.policy.unlock({ kind: 'table', id: ocean }, demoPin), 'ok');
  assert.deepEqual(c.candidates(tables, 'all').map((entry) => entry.id), [space]);
});
