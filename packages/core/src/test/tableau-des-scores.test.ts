// Tableau des scores d'une table (demande du 09/11/2026) : quatre grilles de lecture, tout temps
// confondu, cette année, cette semaine, aujourd'hui. Chaque partie laisse ses scores datés dans
// <données>\scores.json ; la mémoire de la ROM donne le score de chaque partie, le tableau d'honneur
// d'une table originale ceux qui y entrent. Rien n'est inventé, rien n'est écrit dans la table.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  addPlayed,
  emptyScoreJournal,
  inPeriod,
  loadScoreJournal,
  periodStart,
  readRomLastGame,
  romPlayedScores,
  saveScoreJournal,
  scoreBoard,
  setLanguage,
  type BoardLine,
  type PlayedScore,
  type RomMemory,
  type TableRecords,
  type ScorePeriod,
  type TableEntry,
} from '../index';

/** Lundi 9 novembre 2026, 21 h, à l'heure de la borne. */
const NOW = new Date(2026, 10, 9, 21, 0, 0);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

test('périodes : le jour depuis minuit, la semaine depuis le lundi, l’année depuis le 1er janvier', () => {
  assert.equal(periodStart('today', NOW)!.getTime(), new Date(2026, 10, 9).getTime());
  assert.equal(periodStart('week', NOW)!.getTime(), new Date(2026, 10, 9).getTime(), 'un lundi : la semaine commence le jour même');
  assert.equal(periodStart('week', new Date(2026, 10, 15, 23))!.getTime(), new Date(2026, 10, 9).getTime(), 'un dimanche : le lundi d’avant');
  assert.equal(periodStart('week', new Date(2026, 0, 2))!.getTime(), new Date(2025, 11, 29).getTime(), 'la semaine passe d’une année à l’autre');
  assert.equal(periodStart('year', NOW)!.getTime(), new Date(2026, 0, 1).getTime());
  assert.equal(periodStart('all', NOW), undefined);
  assert.ok(inPeriod(at(2026, 11, 9, 0), 'today', NOW));
  assert.ok(!inPeriod(at(2026, 11, 8, 23), 'today', NOW));
  assert.ok(inPeriod(at(2026, 11, 8, 23), 'year', NOW) && !inPeriod(at(2026, 11, 8, 23), 'week', NOW));
  assert.ok(!inPeriod(at(2025, 12, 31, 23), 'year', NOW));
});

const played: PlayedScore[] = [
  { at: at(2026, 11, 9, 20), score: 12_000_000, how: 'rom' },
  { at: at(2026, 11, 9, 19), score: 45_000_000, initials: 'JUL', how: 'rom' },
  { at: at(2026, 11, 3), score: 60_000_000, how: 'rom' },
  { at: at(2026, 2, 1), score: 90_000_000, initials: 'XAQ', how: 'rom' },
  { at: at(2025, 6, 1), score: 30_000_000, player: 2, of: 2, how: 'rom' },
];

test('tableau : chaque période ne lit que ses parties, du meilleur score au moins bon', () => {
  const scores = (period: ScorePeriod) => scoreBoard(played, undefined, period, NOW).map((l) => l.score);
  assert.deepEqual(scores('today'), [45_000_000, 12_000_000]);
  assert.deepEqual(scores('week'), [45_000_000, 12_000_000]);
  assert.deepEqual(scores('year'), [90_000_000, 60_000_000, 45_000_000, 12_000_000]);
  assert.deepEqual(scores('all'), [90_000_000, 60_000_000, 45_000_000, 30_000_000, 12_000_000]);
  const today = scoreBoard(played, undefined, 'today', NOW);
  assert.deepEqual(today[0], { rank: 1, score: 45_000_000, initials: 'JUL', at: played[1]!.at });
});

test('tableau : tout temps, les records de la table s’y ajoutent, un même score une seule fois, avec sa date', () => {
  const records = [
    { rank: 1, score: 150_000_000, initials: 'AJA' },
    { rank: 2, score: 90_000_000, initials: 'XAQ' },
    { rank: 3, score: 45_000_000, initials: 'JUL' },
  ];
  const board = scoreBoard(played, records, 'all', NOW);
  assert.deepEqual(
    board.map((l) => [l.rank, l.score, l.initials, Boolean(l.at), Boolean(l.table)]),
    [
      [1, 150_000_000, 'AJA', false, true],
      [2, 90_000_000, 'XAQ', true, true],
      [3, 60_000_000, undefined, true, false],
      [4, 45_000_000, 'JUL', true, true],
      [5, 30_000_000, undefined, true, false],
      [6, 12_000_000, undefined, true, false],
    ],
  );
  // Les records ne comptent que tout temps confondu : ils n'ont pas de date.
  assert.ok(scoreBoard(played, records, 'year', NOW).every((l) => !l.table));
});

test('tableau : deux scores égaux partagent la place, dix lignes au plus', () => {
  const many: PlayedScore[] = Array.from({ length: 14 }, (_, i) => ({ at: at(2026, 11, 9, 8 + (i % 12)), score: i < 2 ? 1000 : 1000 - i, how: 'rom' as const }));
  const board = scoreBoard(many, undefined, 'today', NOW);
  assert.equal(board.length, 10);
  assert.deepEqual(board.slice(0, 3).map((l) => l.rank), [1, 1, 3]);
});

test('journal : borné, sans perdre l’année en cours ni les meilleurs scores ; lu et écrit tel quel', () => {
  const journal = emptyScoreJournal();
  const old = Array.from({ length: 2100 }, (_, i): PlayedScore => ({ at: new Date(2024, 0, 1, 0, i).toISOString(), score: 1 + i, how: 'rom' }));
  assert.ok(addPlayed(journal, 'T2/t2.vpx', old, NOW));
  const best = Math.max(...journal.tables['T2/t2.vpx']!.map((p) => p.score));
  assert.equal(best, 2100, 'le meilleur score de toujours reste');
  assert.ok(journal.tables['T2/t2.vpx']!.length <= 2050);
  assert.ok(!addPlayed(journal, 'T2/t2.vpx', [{ at: NOW.toISOString(), score: 0, how: 'rom' }], NOW), 'un score nul n’entre pas');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scores-'));
  const file = path.join(dir, 'scores.json');
  const small = emptyScoreJournal();
  addPlayed(small, 'GoT/got.vpx', [{ at: NOW.toISOString(), score: 42, initials: 'ABC', how: 'record' }], NOW);
  saveScoreJournal(file, small);
  assert.deepEqual(loadScoreJournal(file, NOW).journal, small);
  // Illisible : mis de côté, jamais écrasé.
  fs.writeFileSync(file, '{ pas du json');
  const read = loadScoreJournal(file, NOW);
  assert.ok(read.setAside && fs.existsSync(read.setAside));
  assert.deepEqual(read.journal, emptyScoreJournal());
  // Un format plus récent : lu, jamais réécrit.
  fs.writeFileSync(file, JSON.stringify({ v: 99, tables: {} }));
  const newer = loadScoreJournal(file, NOW);
  assert.ok(newer.newer);
  assert.ok(!addPlayed(newer.journal, 'x', [{ at: NOW.toISOString(), score: 5, how: 'rom' }], NOW));
  fs.rmSync(dir, { recursive: true, force: true });
});

/** WPC (T2, d'après t2_l8.map.json) : derniers scores et nombre de joueurs, tableau de la machine. */
const WPC: RomMemory = {
  map: {
    _metadata: { platform: 'williams-wpc-8K' },
    game_state: {
      player_count: { label: 'Players', start: 6036, encoding: 'int' },
      scores: [5936, 5942, 5948, 5954].map((start, i) => ({ label: `Player ${i + 1}`, start, encoding: 'bcd', length: 5 })),
    },
    high_scores: [
      { label: 'Grand Champion', initials: { start: 7299, encoding: 'ch', length: 3 }, score: { start: 7302, encoding: 'bcd', length: 5 } },
      { label: 'First Place', initials: { start: 7265, encoding: 'ch', length: 3 }, score: { start: 7268, encoding: 'bcd', length: 5 } },
    ],
  } as unknown as RomMemory['map'],
  platform: { endian: 'big', memory_layout: [{ type: 'nvram', address: '0x0000', size: '0x2000' }] },
};

const bcd = (n: number, length: number) => Buffer.from(Array.from({ length }, (_, i) => Math.floor(n / 100 ** (length - 1 - i)) % 100).map((v) => ((Math.floor(v / 10) << 4) | v % 10)));

function wpc(last: number[], board: [string, number][] = [['AJA', 150_000_000], ['XAQ', 90_000_000]]): Buffer {
  const nv = Buffer.alloc(8238, 0);
  [5936, 5942, 5948, 5954].forEach((start, i) => bcd(last[i] ?? 0, 5).copy(nv, start));
  nv[6036] = last.filter((s) => s > 0).length;
  [7299, 7265].forEach((start, i) => {
    nv.write(board[i]![0], start, 'latin1');
    bcd(board[i]![1], 5).copy(nv, start + 3);
  });
  return nv;
}

test('ROM : les scores de la dernière partie lus dans sa mémoire, au nombre de joueurs de la partie', () => {
  assert.deepEqual(readRomLastGame(WPC, wpc([78_320_570])), [78_320_570]);
  assert.deepEqual(readRomLastGame(WPC, wpc([10, 20, 30])), [10, 20, 30]);
  // Une place au-delà du nombre de joueurs garde une partie plus ancienne : ignorée.
  const stale = wpc([10, 20]);
  bcd(99, 5).copy(stale, 5954);
  stale[6036] = 2;
  assert.deepEqual(readRomLastGame(WPC, stale), [10, 20]);
  assert.equal(readRomLastGame({ ...WPC, map: { _metadata: WPC.map._metadata } as RomMemory['map'] }, stale), undefined, 'carte sans game_state');
});

test('ROM : une partie compte si sa mémoire a changé ; les initiales viennent du tableau de la machine', () => {
  const when = NOW.toISOString();
  assert.deepEqual(romPlayedScores([78_320_570], [78_320_570], [], when), [], 'VPX fermé avant le Start : rien');
  assert.deepEqual(romPlayedScores([0], [0], [], when), []);
  assert.deepEqual(romPlayedScores([78_320_570], [12_000_000], [], when), [{ at: when, score: 12_000_000, how: 'rom' }]);
  assert.deepEqual(romPlayedScores(undefined, [5_000], [], when), [{ at: when, score: 5_000, how: 'rom' }], 'pas de mémoire avant (première partie) : la partie compte');
  assert.deepEqual(romPlayedScores([1, 2], [95_000_000, 7_000], [{ rank: 1, score: 95_000_000, initials: 'JUL' }], when), [
    { at: when, score: 95_000_000, initials: 'JUL', player: 1, of: 2, how: 'rom' },
    { at: when, score: 7_000, player: 2, of: 2, how: 'rom' },
  ]);
});

// ---------------------------------------------------------------------------
// De la partie à la fiche (app/src/table-scores.ts, scoreboard-menu.ts)

interface Board {
  lines: (BoardLine & { table?: true })[];
  games: number;
  tableBoard: boolean;
  everyGame: boolean;
  romWithoutMap: boolean;
}
interface Scores {
  snapshot(table: TableEntry): unknown;
  finish(table: TableEntry, snapshot: unknown, game: { recordsBefore?: TableRecords; recordsAfter?: TableRecords; live?: { score?: number } }): Promise<PlayedScore[]>;
  board(table: TableEntry, period: ScorePeriod): Board;
}
interface View {
  tabs: { label: string; count: string; current: boolean }[];
  lines: { rank: string; name: string; anonymous?: boolean; score: string; when: string; first?: boolean }[];
  empty?: { title: string; detail: string };
  note?: string;
}
const { createTableScores } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-scores.js')) as {
  createTableScores(opts: { dataDir: string; romsOf(t: TableEntry): string[]; pinmameDirs(): string[]; now?(): Date; fetch?: typeof fetch }): Scores;
};
const { scoreboardView, scoresSummary } = require(path.join(REPO_ROOT, 'app', 'dist', 'scoreboard-menu.js')) as {
  scoreboardView(boards: (p: ScorePeriod) => Board, period: ScorePeriod, now?: Date): View;
  scoresSummary(all: Board, today: Board): string;
};

function cabinet(): { dir: string; table: TableEntry; nv: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tableau-scores-'));
  const folder = path.join(dir, 'tables', 'Terminator 2');
  fs.mkdirSync(path.join(folder, 'pinmame', 'nvram'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Terminator 2.vpx'), '');
  const cache = path.join(dir, 'data', 'cache', 'cartes-memoire');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, 'index.json'), JSON.stringify({ t2_l8: 'maps/williams/wpc/t2_l8.map.json' }));
  fs.writeFileSync(path.join(cache, 'maps_williams_wpc_t2_l8.map.json'), JSON.stringify(WPC.map));
  fs.writeFileSync(path.join(cache, 'platform_williams-wpc-8K.json'), JSON.stringify(WPC.platform));
  const nv = path.join(folder, 'pinmame', 'nvram', 't2_l8.nv');
  fs.writeFileSync(nv, wpc([78_320_570]));
  const table: TableEntry = { id: 'Terminator 2/Terminator 2.vpx', emulator: 'vpx', file: path.join(folder, 'Terminator 2.vpx'), folder, title: 'Terminator 2', infoFile: path.join(folder, 'Terminator 2.info'), info: {} };
  return { dir, table, nv };
}

test('de la partie à la fiche : le score lu dans la ROM, daté, au tableau de chaque période ; la ROM jamais écrite', async () => {
  setLanguage('fr');
  const { dir, table, nv } = cabinet();
  let now = NOW;
  const scores = createTableScores({ dataDir: path.join(dir, 'data'), romsOf: () => ['t2_l8'], pinmameDirs: () => [], now: () => now, fetch: (async () => new Response('', { status: 404 })) as typeof fetch });

  // Partie arrêtée avant le Start : la mémoire n'a pas bougé, rien n'est gardé.
  let snap = scores.snapshot(table);
  assert.deepEqual(await scores.finish(table, snap, {}), []);

  // Une partie à 95 millions, entrée au tableau de la machine en GC sous « JUL ».
  snap = scores.snapshot(table);
  fs.writeFileSync(nv, wpc([95_000_000], [['JUL', 95_000_000], ['AJA', 150_000_000]]));
  const before = fs.readFileSync(nv);
  const kept = await scores.finish(table, snap, {});
  assert.deepEqual(kept, [{ at: NOW.toISOString(), score: 95_000_000, initials: 'JUL', how: 'rom' }]);
  assert.deepEqual(fs.readFileSync(nv), before, 'la mémoire de la ROM n’est que lue');

  // Le lendemain, une partie à 3 millions : aujourd'hui, elle seule ; tout temps, les records de la machine s'y ajoutent.
  now = new Date(2026, 10, 10, 10);
  snap = scores.snapshot(table);
  fs.writeFileSync(nv, wpc([3_000_000], [['JUL', 95_000_000], ['AJA', 150_000_000]]));
  await scores.finish(table, snap, {});
  assert.deepEqual(scores.board(table, 'today').lines.map((l) => l.score), [3_000_000]);
  assert.deepEqual(scores.board(table, 'week').lines.map((l) => l.score), [95_000_000, 3_000_000]);
  const all = scores.board(table, 'all');
  assert.deepEqual(all.lines.map((l) => [l.score, l.initials]), [[150_000_000, 'AJA'], [95_000_000, 'JUL'], [3_000_000, undefined]]);
  assert.ok(all.everyGame && all.tableBoard);
  assert.equal(scores.board(table, 'week').games, 2);

  // Partie entre amis : le score relevé en direct, la mémoire de la ROM du double n'est pas la sienne.
  now = new Date(2026, 10, 10, 10, 30);
  snap = scores.snapshot(table);
  assert.deepEqual(await scores.finish(table, snap, { live: { score: 4_200_000 } }), [{ at: now.toISOString(), score: 4_200_000, how: 'live' }]);

  // Gardé dans <données>\scores.json, relu par une autre instance (redémarrage).
  const again = createTableScores({ dataDir: path.join(dir, 'data'), romsOf: () => ['t2_l8'], pinmameDirs: () => [], now: () => now });
  assert.deepEqual(again.board(table, 'today').lines.map((l) => l.score), [4_200_000, 3_000_000]);

  // L'écran : quatre onglets, celui ouvert, le compte des parties, et les lignes.
  const view = scoreboardView((p) => again.board(table, p), 'today', now);
  assert.deepEqual(view.tabs.map((t) => [t.label, t.count, t.current]), [
    ['Tout temps', '3 parties', false],
    ['Cette année', '3 parties', false],
    ['Cette semaine', '3 parties', false],
    ['Aujourd’hui', '2 parties', true],
  ]);
  assert.deepEqual(view.lines[0], { rank: '1', name: '—', anonymous: true, score: (4_200_000).toLocaleString('fr-FR'), when: 'Aujourd’hui, 10:30', first: true });
  assert.equal(view.note, undefined, 'table à ROM décrite : chaque partie se relève');
  assert.equal(scoresSummary(again.board(table, 'all'), again.board(table, 'today')), `Record : ${(150_000_000).toLocaleString('fr-FR')} (AJA) · 2 parties aujourd’hui`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('table originale : seuls les scores entrés au tableau d’honneur sont gardés, et l’écran le dit', async () => {
  setLanguage('fr');
  const { dir, table } = cabinet();
  const scores = createTableScores({ dataDir: path.join(dir, 'data'), romsOf: () => [], pinmameDirs: () => [], now: () => NOW });
  const snap = scores.snapshot(table);
  const kept = await scores.finish(table, snap, {
    recordsBefore: { file: 'VPReg.stg', storage: 'GoT', scores: [{ rank: 1, score: 500, initials: 'AAA' }] },
    recordsAfter: { file: 'VPReg.stg', storage: 'GoT', scores: [{ rank: 1, score: 900, initials: 'JUL' }, { rank: 2, score: 500, initials: 'AAA' }] },
  });
  assert.deepEqual(kept, [{ at: NOW.toISOString(), score: 900, initials: 'JUL', how: 'record' }]);
  const view = scoreboardView((p) => scores.board(table, p), 'week', NOW);
  assert.match(view.note ?? '', /aucun tableau d’honneur lisible/, 'pas de VPReg.stg dans ce dossier d’essai : la table ne garde rien de lisible');
  assert.equal(view.lines[0]!.name, 'JUL');
  // Une période vide le dit.
  const empty = scoreboardView(() => ({ lines: [], games: 0, tableBoard: false, everyGame: true, romWithoutMap: false }), 'today', NOW);
  assert.deepEqual(empty.empty, { title: 'Aucun score aujourd’hui', detail: 'Les parties jouées aujourd’hui s’inscrivent ici.' });
  fs.rmSync(dir, { recursive: true, force: true });
});
