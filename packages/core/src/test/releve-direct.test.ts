// Relevé du score en direct d'une partie seul (demande du 25/11/2026) : une session de
// table peut contenir plusieurs parties, chacune relevée avec son heure ; une partie quittée à la
// 2e bille garde son dernier score et compte comme un autre. Source : l'inspector de VPX
// (soloinspect.ts), sans copie ni modification de la table ; suivi des parties : gametracker.ts.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { fakeTableScoresOptions } from './doublures';
import {
  GAME_SETTLE_MS,
  GameTracker,
  iniInspectorRestored,
  iniInspectorSection,
  iniWithInspector,
  inspectorIds,
  inspectorStates,
  romMapMissing,
  soloInspectPlan,
  type PlayedScore,
  type RomMemory,
  type TableEntry,
  type TrackedGame,
  withoutGhosts,
} from '../index';

/** La carte de T2 (t2_l8), réduite à l'état de jeu ; adresses réelles. */
const T2: RomMemory = {
  map: {
    _metadata: { platform: 'williams-wpc-8K' },
    adjustments: { 'A.1 Standard Adjustments': { '01': { label: 'Balls Per Game', start: 6943, encoding: 'int', length: 2, default: 3 } } },
    game_state: {
      player_count: { label: 'Players', start: 6036, encoding: 'int' },
      scores: [5936, 5942, 5948, 5954].map((start, i) => ({ label: `Player ${i + 1}`, start, encoding: 'bcd', length: 5 })),
      current_player: { label: 'Current Player', start: 1039, encoding: 'int' },
      current_ball: { label: 'Ball', start: 1040, encoding: 'int' },
      game_over: { label: 'Game Over', start: 135, encoding: 'bool' },
    },
  } as RomMemory['map'],
  platform: { endian: 'big', memory_layout: [{ address: '0x0000', size: '0x2000', type: 'nvram' }] },
};

const sample = (at: number, inGame: boolean, ball: number, ...scores: number[]) => ({ at, inGame, ball, scores });

test('suivi : deux parties d’une même session, chacune gardée avec son heure', () => {
  const t = new GameTracker();
  t.feed(sample(0, false, 1, 0));
  t.feed(sample(1000, true, 1, 10));
  t.feed(sample(2000, true, 3, 5_000_000));
  // Retour à l'attente : un instant sans partie ne la coupe pas, GAME_SETTLE_MS la finit.
  assert.equal(t.feed(sample(3000, false, 3, 5_000_000)), undefined);
  assert.equal(t.feed(sample(3500, true, 3, 5_000_000))?.finished, undefined, 'repartie : la même partie');
  t.feed(sample(4000, false, 3, 5_200_000));
  const first = t.feed(sample(4000 + GAME_SETTLE_MS, false, 3, 5_200_000));
  assert.deepEqual([first?.finished, first?.scores, first?.ball], [true, [5_200_000], 3]);
  t.feed(sample(20_000, true, 1, 100));
  t.feed(sample(30_000, true, 2, 900_000));
  assert.deepEqual(t.games().map((g) => [g.scores[0], g.finished]), [[5_200_000, true], [900_000, false]]);
  assert.ok(t.games()[1]!.startedAt > t.games()[0]!.endedAt!, 'chaque partie a son heure');
});

test('suivi : partie quittée à la 2e bille, son score est gardé (VPX fermé en cours)', () => {
  const t = new GameTracker();
  t.feed(sample(1000, true, 1, 800_000));
  t.feed(sample(60_000, true, 2, 77_000_000));
  const last = t.stop(61_000);
  assert.deepEqual([last?.scores, last?.ball, last?.finished], [[77_000_000], 2, false]);
  assert.deepEqual(t.games().map((g) => g.scores[0]), [77_000_000], 'une seule fois');
});

test('suivi : redémarrage rapide en pleine partie, nouvelle partie ; partie sans point jamais gardée', () => {
  const t = new GameTracker();
  t.feed(sample(0, true, 3, 4_000_000));
  t.feed(sample(1000, true, 1, 0)); // la bille repart de plus bas, les points retombent
  t.feed(sample(2000, true, 1, 1500));
  assert.deepEqual(t.games().map((g) => [g.scores[0], g.finished]), [[4_000_000, false], [1500, false]]);
  const empty = new GameTracker();
  empty.feed(sample(0, true, 1, 0));
  empty.feed(sample(10_000, false, 1, 0));
  assert.deepEqual(empty.games(), []);
});

test('suivi : plusieurs joueurs, le score de chacun est gardé, jamais en baisse', () => {
  const t = new GameTracker();
  t.feed(sample(0, true, 1, 100, 0));
  t.feed(sample(1000, true, 1, 100, 50));
  t.feed(sample(2000, true, 2, 90, 400));
  const g = t.stop(3000)!;
  assert.deepEqual(g.scores, [100, 400]);
});

test('suivi : le score de la partie d’avant, encore affiché au Start, ne fait pas de partie fantôme', () => {
  // Rejoue l'essai réel sur Attack from Mars : la ROM passe « en partie » avec le score de la veille,
  // puis remet à zéro ; une seule partie, finie à 118 874 400.
  const t = new GameTracker();
  t.feed(sample(0, false, 1, 2_728_739_260, 0, 0, 0));
  t.feed(sample(11_000, true, 1, 2_728_739_260, 0, 0, 0));
  t.feed(sample(12_000, true, 1, 0, 0, 0, 0));
  t.feed(sample(60_000, true, 3, 118_874_400, 0, 0, 0));
  t.feed(sample(130_000, false, 3, 118_874_400, 0, 0, 0));
  t.feed(sample(130_000 + GAME_SETTLE_MS, false, 3, 118_874_400, 0, 0, 0));
  assert.deepEqual(t.games().map((g) => [g.scores[0], g.finished]), [[118_874_400, true]]);
  // Deuxième partie de la session : le score de la première, encore affiché au Start, ne compte pas non plus.
  t.feed(sample(140_000, true, 1, 118_874_400, 0, 0, 0));
  assert.equal(t.stop(141_000), undefined, 'quittée avant le premier point : rien');
  assert.equal(t.games().length, 1);
  // Mais un score qui part du score affiché (la ROM ne remet pas à zéro) compte dès qu'il bouge.
  const u = new GameTracker();
  u.feed(sample(0, false, 1, 500));
  u.feed(sample(1000, true, 1, 500));
  u.feed(sample(2000, true, 1, 1500));
  assert.deepEqual(u.stop(3000)?.scores, [1500]);
});

test('réparation : la partie fantôme déjà gardée au journal est retirée, rien d’autre', () => {
  const rom = (at: string, score: number, more: Partial<PlayedScore> = {}): PlayedScore => ({ at, score, how: 'rom', ...more });
  const journal = [
    rom('2026-11-25T21:10:00Z', 118_874_400),
    rom('2026-11-25T21:08:00Z', 2_728_739_260), // le fantôme : score de la partie d'avant
    rom('2026-11-24T20:00:00Z', 2_728_739_260),
  ];
  assert.deepEqual(withoutGhosts(journal).map((p) => p.score), [118_874_400, 2_728_739_260]);
  // Gardés : avec initiales, hors période, autre joueur, autre source, ou premier score de la table.
  const kept = [
    rom('2026-11-25T21:08:00Z', 500, { initials: 'ABC' }),
    rom('2026-11-25T21:07:00Z', 500),
    rom('2026-11-20T10:00:00Z', 500),
    rom('2026-11-19T10:00:00Z', 500),
  ];
  assert.equal(withoutGhosts(kept).length, 3, 'seul le doublon sans initiales de la période part');
  assert.equal(withoutGhosts([rom('2026-11-25T21:08:00Z', 700, { player: 2, of: 2 }), rom('2026-11-25T21:00:00Z', 700)]).length, 2);
  assert.equal(withoutGhosts([{ ...rom('2026-11-25T21:08:00Z', 700), how: 'live' }, rom('2026-11-25T21:00:00Z', 700)]).length, 2);
  assert.equal(withoutGhosts([rom('2026-11-25T21:08:00Z', 700)]).length, 1);
});

test('relevé en direct : la raison d’une carte absente est dite (table originale, index ou carte pas téléchargés)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartes-'));
  try {
    assert.equal(romMapMissing(dir, 'afm_113b'), 'no-index');
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ afm_113b: 'maps/williams/afm.json' }));
    assert.equal(romMapMissing(dir, 'AFM_113b'), 'not-cached');
    assert.equal(romMapMissing(dir, 'TheMatrix'), 'unknown', 'nom VPReg d’une table originale : pas de carte');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspector : valeurs de la ROM relues dans /api/tree et /api/states, état de jeu décodé', () => {
  const made = soloInspectPlan(T2);
  assert.ok(made.ok);
  const names = made.plan.states.map((s) => s.name);
  assert.deepEqual(names.slice(0, 4), ['cyberpinball_score1', 'cyberpinball_score2', 'cyberpinball_score3', 'cyberpinball_score4']);
  assert.ok(names.includes('cyberpinball_fin') && names.includes('cyberpinball_bille'));
  // Comme VPX 10.8.1 : arbre imbriqué, valeurs par numéro.
  const item = (name: string, mapping: number) => ({ mapping, name, type: 'state' });
  const tree = { tree: [{ children: [{ children: [{ children: [item('Playfield #01', 7), ...names.map((n, i) => item(n, 100 + i))], name: 'Game States', type: 'group' }], type: 'category' }], name: 'PinMAME', type: 'controller' }], treeId: 3 };
  const ids = inspectorIds(tree, names);
  assert.equal(ids.size, names.length);
  assert.equal(inspectorIds({ tree: [] }, names).size, 0, 'rien tant que la ROM n’a pas démarré');
  const read = (vals: Record<string, number>) => {
    const states = { states: [{ id: '7', state: 1 }, ...names.map((n, i) => ({ id: String(100 + i), state: vals[n] ?? 0 }))] };
    const byId = inspectorStates(states);
    return made.plan.decode(new Map(names.map((n) => [n, byId.get(ids.get(n)!)!])));
  };
  // BCD : 0x00 0x12 0x34 0x56 0x78 lu en entier par l'inspector (valeur brute) ; ici l'entier brut suffit à voir le décodage.
  const playing = read({ cyberpinball_score1: 1234, cyberpinball_bille: 2, cyberpinball_fin: 0 });
  assert.deepEqual([playing?.inGame, playing?.ball, playing?.scores[0]], [true, 2, 1234]);
  const over = read({ cyberpinball_score1: 1234, cyberpinball_bille: 3, cyberpinball_fin: 1 });
  assert.equal(over?.inGame, false);
  const mask = soloInspectPlan({ ...T2, map: { ...T2.map, game_state: { ...(T2.map as { game_state: object }).game_state, game_over: { start: 135, encoding: 'bool', mask: 0xfe, invert: true } } } as RomMemory['map'] });
  assert.ok(mask.ok);
  const sam = (fin: number) => {
    const m = new Map(mask.plan.states.map((s) => [s.name, 0]));
    m.set('cyberpinball_fin', fin);
    m.set('cyberpinball_bille', 1);
    return mask.plan.decode(m)!;
  };
  assert.equal(sam(0).inGame, false, 'masque 0xFE inversé : octet nul = partie finie');
  assert.equal(sam(2).inGame, true);
  assert.equal(soloInspectPlan({ map: { _metadata: { platform: 'x' } } as RomMemory['map'], platform: T2.platform }).ok, false, 'carte sans état de jeu : pas de relevé');
});

test('VPinballX.ini : [Plugin.Inspector] posé pour la partie, remis comme avant, le reste gardé', () => {
  const before = '[Player]\r\nSyncMode = 1\r\n\r\n[Plugin.Inspector]\r\nEnable = 0\r\nport = 2000\r\n\r\n[Editor]\r\nX = 1\r\n';
  const saved = iniInspectorSection(before);
  assert.deepEqual(saved, ['[Plugin.Inspector]', 'Enable = 0', 'port = 2000', '']);
  const during = iniWithInspector(before, 2114).replace('SyncMode = 1', 'SyncMode = 2'); // VPX change un réglage pendant la partie
  assert.match(during, /Enable = 1/);
  const after = iniInspectorRestored(during, saved);
  assert.equal(after, before.replace('SyncMode = 1', 'SyncMode = 2'));
  // Sans section avant : elle disparaît.
  const bare = '[Player]\nSyncMode = 1\n';
  const back = iniInspectorRestored(iniWithInspector(bare, 2113), iniInspectorSection(bare));
  assert.equal(back.trim(), bare.trim());
  assert.ok(!/Inspector/.test(back));
});

const { createTableScores } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-scores.js')) as {
  createTableScores(opts: object): {
    snapshot(table: TableEntry): unknown;
    finish(table: TableEntry, snapshot: unknown, game: { tracked?: TrackedGame[] }): Promise<PlayedScore[]>;
    board(table: TableEntry, period: 'all'): { lines: { score: number; at?: string }[]; games: number };
  };
};

test('table de la borne : toutes les parties de la session au tableau des scores, la quittée en cours comprise, publiables', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-direct-'));
  const table = { id: 'essai', title: 'Essai', file: path.join(dir, 'essai.vpx'), folder: dir } as unknown as TableEntry;
  const now = new Date(2026, 10, 25, 21, 0, 0);
  const scores = createTableScores(fakeTableScoresOptions({ dataDir: path.join(dir, 'data'), now: () => now }));
  const t0 = now.getTime() - 3_600_000;
  const tracked: TrackedGame[] = [
    { startedAt: t0, endedAt: t0 + 600_000, scores: [12_000_000], ball: 3, finished: true },
    { startedAt: t0 + 900_000, endedAt: t0 + 1_500_000, scores: [999_000_000], ball: 2, finished: false },
  ];
  const kept = await scores.finish(table, scores.snapshot(table), { tracked });
  assert.deepEqual(kept.map((p) => p.score), [12_000_000, 999_000_000]);
  assert.ok(kept.every((p) => !('partial' in p)), 'aucune partie écartée parce qu’elle n’est pas finie');
  const board = scores.board(table, 'all');
  assert.equal(board.games, 2);
  assert.equal(board.lines[0]!.score, 999_000_000, 'la partie quittée à la 2e bille peut être le record');
  assert.notEqual(kept[0]!.at, kept[1]!.at, 'chaque partie a son heure');
  fs.rmSync(dir, { recursive: true, force: true });
});
