// Tableau des records du groupe (30/10/2026) : les scores des parties en direct classées, par
// version exacte de la table ; dans la partie, le tableau de la table montre les records du groupe
// (posés dans le VPReg.stg du double, la dernière place à zéro : le score du joueur y entre et se lit
// au retour). Le fichier est modifié sur place, sa structure jamais touchée ; le dossier habituel du
// joueur, jamais.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { cfb } from './fixtures';
import { REPO_ROOT } from './i18n-scan';
import {
  addGameToBoard,
  boardFor,
  boardKey,
  folderChanges,
  folderPrint,
  GROUP_BOARD_MAX,
  groupInitials,
  injectGroupRecords,
  newSocialState,
  patchVpRegValues,
  readVpReg,
  recordsOf,
  type GroupBoards,
  type GroupRecord,
  type LiveGame,
  type LiveMessage,
  type TableEntry,
} from '../index';

/** Le VPReg.stg d'une table de VPW : quatre places, ses crédits et un réglage de son menu de service. */
const GOT = { HighScore1: '750000000', HighScore1Name: 'AAA', HighScore2: '500000000', HighScore2Name: 'BBB', HighScore3: '400000000', HighScore3Name: 'CCC', HighScore4: '300000000', HighScore4Name: 'DDD', Credits: '5', DMDStd_62: '5' };

function vpreg(dir: string, values: Record<string, string> = GOT, storage = 'gameofthrones'): string {
  const file = path.join(dir, 'user', 'VPReg.stg');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, cfb(values, {}, { info: storage }));
  return file;
}

const rec = (name: string, score: number, extra: Partial<GroupRecord> = {}): GroupRecord => ({ player: name.toLowerCase(), name, score, at: '2026-10-30T20:00:00.000Z', game: 'g', ...extra });

test('pose : les records du groupe aux premières places, la dernière à zéro ; crédits et réglages intacts', () => {
  const file = vpreg(fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tableau-')));
  const posed = injectGroupRecords(file, [rec('Alexis', 910_000_000), rec('Bruno', 2_841_350_120, { initials: 'BRU' }), rec('Chloé', 5), rec('Dora', 4), rec('Émile', 3)]);
  assert.deepEqual(posed, { storage: 'gameofthrones', places: 4 });
  const values = readVpReg(file)!.get('gameofthrones')!;
  assert.deepEqual(recordsOf(values).scores, [
    { rank: 1, score: 2_841_350_120, initials: 'BRU' },
    { rank: 2, score: 910_000_000, initials: 'ALE' },
    { rank: 3, score: 5, initials: 'CHL' },
    { rank: 4, score: 0 },
  ]);
  assert.equal(values.get('Credits'), '5');
  assert.equal(values.get('DMDStd_62'), '5', 'le réglage de l’hôte (5 billes) reste');
  // Groupe vide (la première partie) : tout à zéro, le premier score l'ouvrira.
  injectGroupRecords(file, []);
  assert.deepEqual(recordsOf(readVpReg(file)!.get('gameofthrones')!).scores.map((s) => s.score), [0, 0, 0, 0]);
});

test('pose : seulement là où il y a un tableau, un seul ; une valeur qui ne tient pas dans sa place reste', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tableau-refus-'));
  assert.equal(injectGroupRecords(vpreg(dir, { Lut: '12' }), [rec('Bruno', 1)]), undefined, 'pas de tableau');
  assert.equal(injectGroupRecords(vpreg(dir, { HighScore1: '10' }), [rec('Bruno', 1)]), undefined, 'une seule place : rien pour le joueur');
  assert.equal(injectGroupRecords(path.join(dir, 'absent.stg'), [rec('Bruno', 1)]), undefined);
  const two = path.join(dir, 'deux.stg');
  fs.writeFileSync(two, cfb({ HighScore1: '1', HighScore2: '2' }, { HighScore1: Buffer.from('3', 'utf16le'), HighScore2: Buffer.from('4', 'utf16le') }, { info: 'gotg', game: 'goonies' }));
  assert.equal(injectGroupRecords(two, [rec('Bruno', 1)]), undefined, 'deux tableaux : on ne devine pas');
  // 64 octets par place (un mini-secteur) : 33 caractères ne tiennent pas, rien n'est écrit.
  const file = vpreg(dir, { HighScore1: '1', HighScore2: '2' });
  assert.deepEqual(patchVpRegValues(file, 'gameofthrones', new Map([['HighScore1', '9'.repeat(33)], ['HighScore2', '7'], ['Absente', '1']])), { skipped: ['HighScore1', 'Absente'] });
  assert.deepEqual([...readVpReg(file)!.get('gameofthrones')!], [['HighScore1', '1'], ['HighScore2', '7']]);
});

function finished(id: string, players: LiveGame['players'], table: LiveGame['table'] = { table: { title: 'Game of Thrones LE' }, print: 'a'.repeat(64) }): LiveGame {
  return { id, host: players[0]!.key, table, title: 'Game of Thrones LE', players, phase: 'finished', createdAt: '2026-10-30T20:00:00.000Z' };
}

test('tableau : par version exacte, seulement les scores classés, une fois par partie, vingt places', () => {
  const boards: GroupBoards = {};
  const game = finished('0123456789abcdef', [
    { key: 'alexis', name: 'Alexis', state: 'done', host: true, records: [{ score: 900, rank: 2 }, { score: 1000, rank: 1, initials: 'ALX' }] },
    { key: 'bruno', name: 'Bruno', state: 'done', settings: 'ok', records: [{ score: 2000, rank: 1 }] },
    { key: 'chloe', name: 'Chloé', state: 'done', records: [{ score: 9999, rank: 1 }] },
    { key: 'dora', name: 'Dora', state: 'done', settings: 'ok', balls: 5, records: [{ score: 8888, rank: 1 }] },
    { key: 'emile', name: 'Émile', state: 'done', settings: 'ok' },
  ], { table: { title: 'Game of Thrones LE' }, print: 'a'.repeat(64), balls: 3 });
  assert.ok(addGameToBoard(boards, game));
  assert.deepEqual(boardFor(boards, game.table).map((r) => [r.name, r.score, r.initials]), [['Bruno', 2000, undefined], ['Alexis', 1000, 'ALX']], 'Chloé sans les réglages de l’hôte, Dora à 5 billes : hors classement');
  assert.equal(addGameToBoard(boards, game), false, 'la même partie une seule fois');
  assert.deepEqual(boardFor(boards, { print: 'a'.repeat(64), script: 'b'.repeat(64) }), [], 'un autre script : une autre version, un autre tableau');
  assert.equal(boardKey({}), undefined);
  assert.equal(addGameToBoard(boards, { ...game, id: 'fedcba9876543210', phase: 'playing' }), false, 'seulement une partie finie');
  for (let i = 0; i < 30; i++) addGameToBoard(boards, finished(i.toString(16).padStart(16, '0'), [{ key: 'alexis', name: 'Alexis', state: 'done', host: true, records: [{ score: i, rank: 1 }] }]));
  assert.equal(boardFor(boards, game.table).length, GROUP_BOARD_MAX);
  assert.equal(groupInitials({ name: 'Émile' }), 'EMI');
});

// ---------------------------------------------------------------------------
// Le service (app/src/live-game.ts) et le double (app/src/table-double.ts), compilés.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { accept(id: string): Promise<{ match: string }>; board(): GroupRecord[]; current(): LiveGame | undefined; stop(): void };
};
const { createTableDoubles } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-double.js')) as {
  createTableDoubles(o: object): { start(table: TableEntry, id: string, settings?: unknown, board?: GroupRecord[]): { ok: true; double: { table: TableEntry; finish(): void } } | { ok: false; reason: string } };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('service : une partie finie entre au tableau du groupe de l’invité, gardé sur sa borne', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tableau-service-'));
  const folder = path.join(root, 'tables', 'GoT');
  fs.mkdirSync(folder, { recursive: true });
  const table = { id: 'got', file: path.join(folder, 'GoT.vpx'), folder, title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015, info: {} } as unknown as TableEntry;
  fs.writeFileSync(table.file, 'table');
  const host = newSocialState().key.publicKey;
  const me = newSocialState().key.publicKey;
  let deliver: ((k: string, m: unknown) => void) | undefined;
  const make = () =>
    createLiveGames({
      net: { state: () => ({ key: { publicKey: me }, name: 'Bruno', friends: [{ key: host, name: 'Alexis' }] }), online: () => true, send: () => true, onMessage: (cb: typeof deliver) => ((deliver = cb), () => undefined) },
      dataDir: path.join(root, 'data'),
      tables: () => [table],
      play: async () => undefined,
    });
  const guest = make();
  const { createHash } = await import('node:crypto');
  const print = createHash('sha256').update('table').digest('hex');
  const id = '0123456789abcdef';
  try {
    deliver!(host, { t: 'game-invite', game: { id, table: { table: { title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015 }, print }, title: 'Game of Thrones LE (Stern 2015)', players: [{ key: host, name: 'Alexis' }] } });
    assert.equal((await guest.accept(id)).match, 'same');
    assert.deepEqual(guest.board(), []);
    const room: LiveMessage = {
      t: 'game-room',
      game: id,
      phase: 'finished',
      players: [
        { key: host, name: 'Alexis', state: 'done', host: true, records: [{ score: 1_000, rank: 1 }] },
        { key: me, name: 'Bruno', state: 'done', settings: 'ok', records: [{ score: 2_000, rank: 1, initials: 'BRU' }] },
      ],
    };
    deliver!(host, room);
    assert.deepEqual(guest.board().map((r) => [r.name, r.score]), [['Bruno', 2000], ['Alexis', 1000]]);
  } finally {
    guest.stop();
  }
  // Gardé : une autre session de la borne le relit.
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'amis', 'records.json'), 'utf8')) as GroupBoards;
  assert.deepEqual(Object.keys(saved), [`${print}:`]);
});

test('double : les records du groupe posés dans son VPReg.stg ; le dossier habituel ne bouge pas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tableau-double-'));
  const folder = path.join(root, 'tables', 'GoT');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'GoT.vpx'), 'table');
  vpreg(folder);
  const table = { id: 'got', file: path.join(folder, 'GoT.vpx'), folder, title: 'Game of Thrones LE', info: {} } as unknown as TableEntry;
  const before = folderPrint(folder, { full: true });
  const doubles = createTableDoubles({ root: () => root, tablesDir: () => path.join(root, 'tables'), romsOf: () => [] });
  const started = doubles.start(table, 'partie', undefined, [rec('Bruno', 2_841_350_120, { initials: 'BRU' })]);
  assert.ok(started.ok);
  const scores = recordsOf(readVpReg(path.join(started.double.table.folder, 'user', 'VPReg.stg'))!.get('gameofthrones')!).scores;
  assert.deepEqual(scores.map((s) => s.score), [2_841_350_120, 0, 0, 0]);
  assert.deepEqual(folderChanges(before, folderPrint(folder, { full: true })), []);
  started.double.finish();
  assert.deepEqual(folderChanges(before, folderPrint(folder, { full: true })), []);
});
