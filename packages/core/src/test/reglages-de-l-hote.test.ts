// Réglages de l'hôte (30/10/2026) : la mémoire et les interrupteurs de la ROM, les valeurs que la
// table enregistre, envoyés à chaque invité qui accepte et posés dans le double de sa table ; tout
// le monde part du même état de machine, sans rien lire ni comprendre. Le dossier habituel de
// l'invité ne bouge pas ; un invité qui ne les a pas reçus entiers joue hors classement.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  applyHostSettings,
  createSettingsReceiver,
  folderChanges,
  folderPrint,
  liveRanked,
  livePlayerStateLabel,
  newLiveGame,
  newSocialState,
  parseLiveMessage,
  readHostSettings,
  settingsMessages,
  settingsReceived,
  type HostSetting,
  type LiveMessage,
  type LiveTable,
  type TableEntry,
} from '../index';

function write(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** La mémoire d'une ROM Stern SAM : 128 Kio, plus qu'un message entre bornes n'en porte une fois encodée par morceaux. */
const SAM = randomBytes(131_118);

test('lecture : mémoire et interrupteurs de chaque ROM, VPReg.stg ; absent quand l’hôte n’en a pas ; rien de trop gros', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reglages-'));
  const local = path.join(root, 'tables', 'Star Trek');
  write(path.join(local, 'pinmame', 'roms', 'st_161h.zip'), 'rom');
  write(path.join(local, 'pinmame', 'nvram', 'st_161h.nv'), SAM);
  write(path.join(local, 'pinmame', 'cfg', 'default.cfg'), 'réglages de PinMAME, pas du jeu');
  const got = readHostSettings({ folder: local, roms: ['ST_161H'] })!;
  assert.deepEqual(got.map((s) => [s.rel, s.data?.length]), [['pinmame/nvram/st_161h.nv', 131_118], ['pinmame/cfg/st_161h.cfg', undefined], ['user/VPReg.stg', undefined]]);
  // ROM jouée depuis le dossier PinMAME commun.
  const shared = path.join(root, 'pinmame');
  write(path.join(shared, 'nvram', 'afm_113.nv'), 'mémoire');
  write(path.join(shared, 'cfg', 'afm_113.cfg'), 'dip');
  const afm = path.join(root, 'tables', 'Attack from Mars');
  write(path.join(afm, 'user', 'VPReg.stg'), 'valeurs');
  assert.deepEqual(readHostSettings({ folder: afm, roms: ['afm_113'], pinmameDir: shared })!.map((s) => [s.rel, s.data?.toString()]), [
    ['pinmame/nvram/afm_113.nv', 'mémoire'],
    ['pinmame/cfg/afm_113.cfg', 'dip'],
    ['user/VPReg.stg', 'valeurs'],
  ]);
  // Table sans ROM : seulement ses valeurs enregistrées (le menu de service de Game of Thrones).
  assert.deepEqual(readHostSettings({ folder: afm, roms: [] })!.map((s) => s.rel), ['user/VPReg.stg']);
  write(path.join(afm, 'user', 'VPReg.stg'), Buffer.alloc(2 * 1024 * 1024));
  assert.equal(readHostSettings({ folder: afm, roms: [] }), undefined, 'trop gros pour voyager');
});

test('voyage : par morceaux, dans n’importe quel ordre, chaque fichier vérifié ; un morceau abîmé fait échouer', () => {
  const settings: HostSetting[] = [{ rel: 'pinmame/nvram/st_161h.nv', data: SAM }, { rel: 'pinmame/cfg/st_161h.cfg' }, { rel: 'user/VPReg.stg', data: Buffer.from('valeurs') }];
  const messages = settingsMessages('0123456789abcdef', settings);
  assert.ok(messages.length >= 4, 'la mémoire part en plusieurs morceaux');
  for (const m of messages) assert.ok(JSON.stringify(m).length < 256 * 1024, 'chaque message tient sous la limite du réseau');
  // Parsés comme le réseau les parse, morceaux en tête et à l'envers.
  const parsed = messages.map((m) => parseLiveMessage(JSON.parse(JSON.stringify(m)) as Record<string, unknown>)!);
  const receiver = createSettingsReceiver('0123456789abcdef');
  const order = [...parsed.slice(1).reverse(), parsed[0]!];
  const results = order.map((m) => receiver.take(m));
  assert.deepEqual(results.slice(0, -1), Array(order.length - 1).fill(undefined));
  const done = results.at(-1)!;
  assert.ok(done.ok);
  assert.deepEqual(done.settings.map((s) => [s.rel, s.data && Buffer.compare(s.data, settings.find((x) => x.rel === s.rel)!.data!) === 0]), [
    ['pinmame/nvram/st_161h.nv', true],
    ['pinmame/cfg/st_161h.cfg', undefined],
    ['user/VPReg.stg', true],
  ]);
  // Un octet changé en route : échec, rien n'est posé.
  const broken = createSettingsReceiver('0123456789abcdef');
  const last = parsed.at(-1) as Extract<LiveMessage, { t: 'game-settings-part' }>;
  const outcome = [...parsed.slice(0, -1), { ...last, data: Buffer.from('autre chose').toString('base64') }].map((m) => broken.take(m)).find(Boolean);
  assert.deepEqual(outcome, { ok: false });
  // Une autre partie : ignoré.
  assert.equal(createSettingsReceiver('fedcba9876543210').take(parsed[0]!), undefined);
});

test('messages : chemins, tailles et contenu vérifiés ; rien d’autre ne voyage', () => {
  const ok = (m: Record<string, unknown>) => parseLiveMessage({ game: '0123456789abcdef', ...m });
  assert.ok(ok({ t: 'game-settings', files: [{ rel: 'user/VPReg.stg' }, { rel: 'pinmame/nvram/t2_l8.nv', sha: 'a'.repeat(64), bytes: 8238 }] }));
  for (const rel of ['../VPReg.stg', 'pinmame/nvram/../../x.nv', 'pinmame/roms/t2_l8.zip', 'Terminator 2.vpx', 'pinmame/cfg/default.cfg/../x.cfg', 'user/autre.stg']) {
    assert.equal(ok({ t: 'game-settings', files: [{ rel }] }), undefined, rel);
  }
  assert.equal(ok({ t: 'game-settings', files: [{ rel: 'user/VPReg.stg', sha: 'a'.repeat(64), bytes: 5 * 1024 * 1024 }] }), undefined, 'trop gros');
  assert.equal(ok({ t: 'game-settings', files: [{ rel: 'user/VPReg.stg' }, { rel: 'user/VPReg.stg' }] }), undefined, 'deux fois le même');
  assert.equal(ok({ t: 'game-settings-part', rel: 'user/VPReg.stg', index: 0, count: 17, data: 'AA==' }), undefined);
  assert.equal(ok({ t: 'game-settings-part', rel: 'user/VPReg.stg', index: 2, count: 2, data: 'AA==' }), undefined);
  assert.equal(ok({ t: 'game-settings-part', rel: 'user/VPReg.stg', index: 0, count: 1, data: '<script>' }), undefined);
  assert.deepEqual(ok({ t: 'game-settings-ok', ok: true }), { t: 'game-settings-ok', game: '0123456789abcdef', ok: true });
});

test('classement : un invité sans les réglages de l’hôte reçus entiers joue hors classement, et le salon le dit', () => {
  let game = newLiveGame({ key: 'hote', name: 'Alice' }, { table: { title: 'Star Trek' }, print: 'a'.repeat(64) }, 'Star Trek');
  game = { ...game, players: [...game.players, { key: 'bruno', name: 'Bruno', state: 'accepted', match: 'same' }, { key: 'chloe', name: 'Chloé', state: 'invited' }] };
  assert.equal(livePlayerStateLabel(game.players[1]!), 'Prêt, réglages de l’hôte en route');
  assert.ok(!liveRanked(game.players[1]!));
  game = settingsReceived(game, 'bruno', true);
  game = settingsReceived(game, 'chloe', true);
  assert.equal(game.players[1]!.settings, 'ok');
  assert.equal(game.players[2]!.settings, undefined, 'pas encore accepté : ignoré');
  assert.equal(livePlayerStateLabel(game.players[1]!), 'Prêt, réglages de l’hôte reçus');
  assert.ok(liveRanked(game.players[1]!));
  game = settingsReceived(game, 'bruno', false);
  assert.equal(livePlayerStateLabel(game.players[1]!), 'Prêt, réglages de l’hôte non reçus : score hors classement');
  assert.ok(!liveRanked(game.players[1]!));
  assert.ok(liveRanked(game.players[0]!), 'l’hôte joue ses propres réglages');
  // Le salon renvoyé aux invités garde l'accusé de chacun.
  const keys = game.players.map(() => newSocialState().key.publicKey);
  const players = game.players.map((p, i) => ({ ...p, key: keys[i]! }));
  const room = parseLiveMessage(JSON.parse(JSON.stringify({ t: 'game-room', game: game.id, phase: 'gathering', players })) as Record<string, unknown>) as Extract<LiveMessage, { t: 'game-room' }>;
  assert.equal(room.players[1]!.settings, 'failed');
});

// ---------------------------------------------------------------------------
// Le double de l'invité (app/src/table-double.ts) et l'échange entre deux bornes (app/src/live-game.ts)

/* eslint-disable @typescript-eslint/no-require-imports */
const { createTableDoubles } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-double.js')) as {
  createTableDoubles(o: object): { start(table: TableEntry, id: string, settings?: HostSetting[]): { ok: true; double: { table: TableEntry; finish(): void } } | { ok: false; reason: string } };
};
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { create(table: TableEntry): Promise<{ table: LiveTable; players: { key: string; settings?: string }[] }>; invite(key: string, name: string): boolean; current(): { players: { key: string; settings?: string }[] } | undefined; accept(id: string): Promise<{ match: string }>; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function terminator(root: string, nv: string, cfg?: string, reg?: string): TableEntry {
  const folder = path.join(root, 'tables', 'Terminator 2');
  write(path.join(folder, 'Terminator 2.vpx'), 'table');
  write(path.join(folder, 'pinmame', 'roms', 't2_l8.zip'), 'rom');
  write(path.join(folder, 'pinmame', 'nvram', 't2_l8.nv'), nv);
  if (cfg) write(path.join(folder, 'pinmame', 'cfg', 't2_l8.cfg'), cfg);
  if (reg) write(path.join(folder, 'user', 'VPReg.stg'), reg);
  return { id: 't2', file: path.join(folder, 'Terminator 2.vpx'), folder, title: 'Terminator 2', manufacturer: 'Williams', year: 1991, info: {} } as unknown as TableEntry;
}

test('double de l’invité : les réglages de l’hôte à la place des siens, les absents retirés ; son dossier habituel ne bouge pas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reglages-double-'));
  const table = terminator(root, 'ma mémoire : 5 billes', 'mes interrupteurs', 'mes records');
  const before = folderPrint(table.folder, { full: true });
  const doubles = createTableDoubles({ root: () => root, tablesDir: () => path.join(root, 'tables'), romsOf: () => ['t2_l8'] });
  const settings: HostSetting[] = [{ rel: 'pinmame/nvram/t2_l8.nv', data: Buffer.from('mémoire de l’hôte : 3 billes') }, { rel: 'pinmame/cfg/t2_l8.cfg' }, { rel: 'user/VPReg.stg', data: Buffer.from('records de l’hôte') }];
  const started = doubles.start(table, 'partie', settings);
  assert.ok(started.ok);
  const dir = started.double.table.folder;
  assert.equal(fs.readFileSync(path.join(dir, 'pinmame', 'nvram', 't2_l8.nv'), 'utf8'), 'mémoire de l’hôte : 3 billes');
  assert.ok(!fs.existsSync(path.join(dir, 'pinmame', 'cfg', 't2_l8.cfg')), 'l’hôte n’en a pas : réglages d’usine des deux côtés');
  assert.equal(fs.readFileSync(path.join(dir, 'user', 'VPReg.stg'), 'utf8'), 'records de l’hôte');
  assert.deepEqual(folderChanges(before, folderPrint(table.folder, { full: true })), []);
  started.double.finish();
  assert.deepEqual(folderChanges(before, folderPrint(table.folder, { full: true })), []);
  assert.ok(!fs.existsSync(path.join(root, 'parties')));
  // Un réglage hors de ce qui peut voyager : pas de double, pas de partie.
  assert.throws(() => applyHostSettings(path.join(root, 'x'), [{ rel: '../../tables/Terminator 2/pinmame/nvram/t2_l8.nv', data: Buffer.from('x') }]));
});

test('deux bornes : l’invité accepte, reçoit les réglages de l’hôte, le dit ; l’hôte le note ; le lancement les reçoit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reglages-bornes-'));
  const handlers = new Map<string, (from: string, m: unknown) => void>();
  // Un réseau d'essai : chaque message passe par le JSON et la vérification du réseau, après un tour de boucle.
  const net = (me: string, name: string, friend: { key: string; name: string }) => ({
    state: () => ({ key: { publicKey: me }, name, friends: [friend] }),
    online: () => true,
    send: (to: string, m: LiveMessage) => {
      const parsed = parseLiveMessage(JSON.parse(JSON.stringify(m)) as Record<string, unknown>);
      assert.ok(parsed, `message refusé : ${m.t}`);
      setImmediate(() => handlers.get(to)?.(me, parsed));
      return true;
    },
    onMessage: (cb: (from: string, m: unknown) => void) => (handlers.set(me, cb), () => handlers.delete(me)),
  });
  const hostTable = terminator(path.join(root, 'a'), 'mémoire de l’hôte', undefined, 'records de l’hôte');
  write(path.join(hostTable.folder, 'pinmame', 'nvram', 't2_l8.nv'), SAM);
  const guestTable = terminator(path.join(root, 'b'), 'mémoire de l’invité', 'interrupteurs de l’invité');
  const played: (HostSetting[] | undefined)[] = [];
  const host = createLiveGames({
    net: net('alice', 'Alice', { key: 'bruno', name: 'Bruno' }),
    dataDir: path.join(root, 'a', 'data'),
    tables: () => [hostTable],
    romsOf: () => ['t2_l8'],
    settingsOf: (t: TableEntry) => readHostSettings({ folder: t.folder, roms: ['t2_l8'] }),
    play: async () => undefined,
  });
  const guest = createLiveGames({
    net: net('bruno', 'Bruno', { key: 'alice', name: 'Alice' }),
    dataDir: path.join(root, 'b', 'data'),
    tables: () => [guestTable],
    romsOf: () => ['t2_l8'],
    play: async (_t: TableEntry, _playing: () => void, settings?: HostSetting[]) => (played.push(settings), undefined),
  });
  try {
    // Même version : les deux .vpx sont identiques (« table »).
    const game = await host.create(hostTable);
    assert.ok(host.invite('bruno', 'Bruno'));
    await new Promise((r) => setImmediate(r));
    const id = (game as unknown as { id: string }).id;
    assert.equal((await guest.accept(id)).match, 'same');
    for (let i = 0; i < 20 && host.current()!.players.find((p) => p.key === 'bruno')?.settings === undefined; i++) await new Promise((r) => setImmediate(r));
    assert.equal(host.current()!.players.find((p) => p.key === 'bruno')?.settings, 'ok');
    // Le départ : le lancement de l'invité reçoit les réglages de l'hôte, octet pour octet.
    handlers.get('bruno')!('alice', { t: 'game-start', game: id, in: 0 });
    for (let i = 0; i < 20 && !played.length; i++) await new Promise((r) => setTimeout(r, 5));
    const got = played[0]!;
    assert.deepEqual(got.map((s) => s.rel), ['pinmame/nvram/t2_l8.nv', 'pinmame/cfg/t2_l8.cfg', 'user/VPReg.stg']);
    assert.equal(Buffer.compare(got[0]!.data!, SAM), 0);
    assert.equal(got[1]!.data, undefined, 'l’hôte n’a pas d’interrupteurs : retirés chez l’invité');
    assert.equal(got[2]!.data!.toString(), 'records de l’hôte');
  } finally {
    host.stop();
    guest.stop();
  }
});

test('application : les réglages lus pour l’hôte, posés dans le double pour l’invité', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /settingsOf: \(table\) => readHostSettings\(/);
  assert.match(front, /tableDoubles\.start\(table, hooks\.double, hooks\.settings, hooks\.board\)/);
});
