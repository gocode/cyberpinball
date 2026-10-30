// État de jeu en direct d'une partie entre amis (essai réel du 30/10/2026 : crédits mis à la main,
// rien sur les autres pendant la partie, fin floue, score perdu si l'on quitte pendant les initiales).
// Le script du double reçoit un relevé (score, bille, partie en cours) et un départ automatique ;
// Start hors partie et le monnayeur y sont ignorés ; la bande montre chacun ; le score final vient
// du relevé. Vérifié sur les scripts réels de Game of Thrones, GOTG, The Goonies et The Matrix :
// complétés, ils se compilent (cscript), comme leurs originaux.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  addGameToBoard,
  boardFor,
  gameStatus,
  liveBoardSize,
  liveBoardView,
  liveRanked,
  liveScore,
  liveStandings,
  liveStateHook,
  parseLiveMessage,
  parseLiveState,
  type GroupBoards,
  type LiveGame,
  type LiveMessage,
  type TableEntry,
} from '../index';

/** Le socle de script commun, réduit (Game of Thrones, GOTG, The Goonies, The Matrix). */
const SCRIPT = [
  'Option Explicit',
  'Dim PlayersPlayingGame, CurrentPlayer, BallsPerGame, bGameInPlay',
  'Dim Score(4)',
  'Dim BallsRemaining(4)',
  'BallsPerGame = 3',
  'Sub Table1_KeyDown(ByVal Keycode)',
  '  If keycode = StartGameKey Then ResetForNewGame',
  'End Sub',
  'Sub Table1_KeyUp(ByVal keycode)',
  'End Sub',
  'Sub Wall1_Hit : AddScore 10 : End Sub',
].join('\r\n');

const ELEMENTS = [
  { type: 2, name: 'GameTimer' },
  { type: 0, name: 'Wall1' },
  { type: 0, name: 'Wall2' },
  { type: 7, name: 'li001' },
];

const FILE = ['C:', 'CyberPinball', 'parties', 'p', 'GoT', 'cyberpinball-etat.txt'].join(String.fromCharCode(92));

test('relevé : posé sur un élément libre, les touches enveloppées, Start hors partie et le monnayeur ignorés, le départ donné', () => {
  const hook = liveStateHook(SCRIPT, ELEMENTS, FILE);
  assert.ok(hook.ok);
  assert.equal(hook.element, 'Wall2', 'Wall1 sert au script, un minuteur n’est pas emprunté');
  assert.equal(hook.table, 'Table1');
  const s = hook.script;
  assert.match(s, /^Sub CyberPinball_OrigKeyDown\(ByVal Keycode\)/m);
  assert.match(s, /^Sub CyberPinball_OrigKeyUp\(ByVal keycode\)/m);
  assert.equal(s.match(/^Sub Table1_KeyDown\(/gm)?.length, 1, 'une seule procédure Table1_KeyDown : la nôtre');
  assert.match(s, /CyberPinball_Blocked = \(keycode = AddCreditKey Or keycode = AddCreditKey2\)/);
  assert.match(s, /If Not bGameInPlay Then CyberPinball_Blocked = CyberPinball_Blocked Or keycode = StartGameKey Or keycode = LockBarKey/);
  assert.match(s, /^Wall2\.TimerInterval = 250\r\nWall2\.TimerEnabled = True/m);
  assert.match(s, /^Sub Wall2_Timer\(\)/m);
  assert.match(s, /CyberPinball_Press AddCreditKey/);
  assert.match(s, /CyberPinball_Press StartGameKey/);
  assert.ok(s.includes(`CreateTextFile("${FILE}", True)`));
  assert.ok(s.startsWith('Option Explicit\r\n'), 'Option Explicit reste la première instruction');
  assert.equal(liveStateHook(s, ELEMENTS, FILE).ok, false, 'pas deux fois');
});

test('relevé : seulement pour le socle commun, avec ses touches et un élément libre', () => {
  assert.deepEqual(liveStateHook('Sub Table1_KeyDown(ByVal k)\r\nEnd Sub', ELEMENTS, FILE).ok, false);
  assert.equal(liveStateHook(SCRIPT.replace(/Table1_KeyDown/g, 'Table1_Autre'), ELEMENTS, FILE).ok, false);
  assert.equal(liveStateHook(SCRIPT, [{ type: 0, name: 'Wall1' }, { type: 2, name: 'T' }], FILE).ok, false, 'aucun mur ni lampe libre');
  assert.equal(liveStateHook(SCRIPT, ELEMENTS, 'C:/a"b.txt').ok, false);
  // Sans KeyUp : la nôtre filtre seulement.
  const noUp = liveStateHook(SCRIPT.replace('Sub Table1_KeyUp(ByVal keycode)\r\nEnd Sub', ''), ELEMENTS, FILE);
  assert.ok(noUp.ok && !/CyberPinball_OrigKeyUp/.test(noUp.script));
});

test('lecture du relevé : complet ou rien ; bille bornée', () => {
  assert.deepEqual(parseLiveState('jeu=1;vu=1;joueurs=1;joueur=1;bille=2;billes=3;score=148030'), { inGame: true, started: true, players: 1, player: 1, ball: 2, balls: 3, score: 148_030 });
  assert.equal(parseLiveState('jeu=0;vu=1;joueurs=1;joueur=1;bille=4;billes=3;score=2841350120')!.ball, 3, 'après la dernière bille');
  assert.equal(parseLiveState('jeu=1;vu=1;joueurs=1;joueur=1;bille=2;billes=3;sco'), undefined, 'lu pendant l’écriture');
  assert.equal(parseLiveState(''), undefined);
  assert.equal(parseLiveState('jeu=1;vu=1;joueurs=1;joueur=1;bille=2;billes=3;score=-5'), undefined);
});

function playing(): LiveGame {
  return {
    id: '0123456789abcdef',
    host: 'alexis',
    table: { table: { title: 'Game of Thrones LE' }, print: 'a'.repeat(64), balls: 3 },
    title: 'Game of Thrones LE (Stern 2015)',
    players: [
      { key: 'alexis', name: 'Alexis', state: 'playing', host: true },
      { key: 'bruno', name: 'Bruno', state: 'playing', settings: 'ok' },
      { key: 'chloe', name: 'Chloé', state: 'loading', settings: 'ok' },
      { key: 'dora', name: 'Dora', state: 'declined' },
    ],
    phase: 'playing',
    createdAt: '2026-10-30T20:00:00.000Z',
  };
}

test('progression : score, bille et joueur en trop voyagent ; la bande les montre, le meilleur en tête', () => {
  let game = playing();
  game = gameStatus(game, 'alexis', { state: 'playing', score: 148_030, ball: 2, balls: 3 });
  game = gameStatus(game, 'bruno', { state: 'playing', score: 910_000, ball: 1 });
  assert.deepEqual([game.players[0]!.score, game.players[0]!.ball, game.players[1]!.score], [148_030, 2, 910_000]);
  const view = liveBoardView(game, 'alexis')!;
  assert.equal(view.title, 'Partie entre amis');
  assert.deepEqual(
    view.rows.map((r) => [r.name, r.score.replace(/\s/g, ' '), r.detail, r.me, r.lead]),
    [
      ['Bruno', '910 000', 'Bille 1', false, true],
      ['Alexis', '148 030', 'Bille 2 sur 3', true, false],
      ['Chloé', '—', 'Chargement', false, false],
    ],
  );
  assert.deepEqual(liveBoardSize(3), { width: 560, height: 56 + 150 + 18 });
  // Un Start de plus en première bille : plus d'un joueur, hors classement, et la bande le dit.
  game = gameStatus(game, 'bruno', { state: 'playing', score: 920_000, ball: 1, multi: true });
  game = gameStatus(game, 'bruno', { state: 'playing', score: 930_000, ball: 2 });
  assert.equal(game.players[1]!.multi, true, 'reste vrai');
  assert.ok(!liveRanked(game.players[1]!));
  assert.equal(liveBoardView(game, 'alexis')!.rows[0]!.detail, 'Bille 2 · hors classement');
  assert.equal(liveBoardView({ ...game, phase: 'finished' }, 'alexis'), undefined);
  // Le message réseau garde score, bille et joueur en trop, vérifiés.
  const m = parseLiveMessage({ t: 'game-status', game: game.id, state: 'playing', score: 930_000, ball: 2, balls: 3, multi: true }) as Extract<LiveMessage, { t: 'game-status' }>;
  assert.deepEqual([m.score, m.ball, m.balls, m.multi], [930_000, 2, 3, true]);
  const bad = parseLiveMessage({ t: 'game-status', game: game.id, state: 'playing', score: -1, ball: 99, multi: 'oui' }) as Extract<LiveMessage, { t: 'game-status' }>;
  assert.deepEqual([bad.score, bad.ball, bad.multi], [undefined, undefined, undefined]);
});

test('fin : le score lu en direct classe et entre au tableau, même sans record entré', () => {
  let game = playing();
  game = gameStatus(game, 'chloe', { state: 'left' });
  game = gameStatus(game, 'bruno', { state: 'done', seconds: 240, score: 910_000 });
  game = gameStatus(game, 'alexis', { state: 'done', seconds: 250, score: 148_030, records: [{ score: 148_030, rank: 1, initials: 'ALX' }] });
  assert.equal(game.phase, 'finished');
  assert.equal(liveScore(game.players[1]!), 910_000);
  assert.deepEqual(liveStandings(game).map((p) => p.name).slice(0, 2), ['Bruno', 'Alexis']);
  const boards: GroupBoards = {};
  assert.ok(addGameToBoard(boards, game));
  assert.deepEqual(boardFor(boards, game.table).map((r) => [r.name, r.score, r.initials]), [['Bruno', 910_000, undefined], ['Alexis', 148_030, 'ALX']]);
});

// ---------------------------------------------------------------------------
// Service (app/src/live-game.ts) et application

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { create(table: TableEntry): Promise<LiveGame>; invite(key: string, name: string): boolean; start(): boolean; current(): LiveGame | undefined; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('service : la progression de l’hôte entre dans la partie à chaque changement, et son score final à la fin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-direct-'));
  const vpx = path.join(dir, 'GoT.vpx');
  fs.writeFileSync(vpx, 'table');
  const table = { file: vpx, folder: dir, title: 'Game of Thrones LE', info: {} } as unknown as TableEntry;
  let deliver: ((k: string, m: unknown) => void) | undefined;
  const games = createLiveGames({
    net: { state: () => ({ key: { publicKey: 'alexis' }, name: 'Alexis', friends: [{ key: 'bruno', name: 'Bruno' }] }), online: () => true, send: () => true, onMessage: (cb: typeof deliver) => ((deliver = cb), () => undefined) },
    dataDir: dir,
    tables: () => [table],
    play: async (_t: TableEntry, playingNow: () => void, _s: unknown, _b: unknown, progress: (p: object) => void) => {
      playingNow();
      progress({ score: 1000, ball: 1, balls: 3, players: 1 });
      progress({ score: 1000, ball: 1, balls: 3, players: 1 });
      progress({ score: 5000, ball: 2, balls: 3, players: 1 });
      return { ok: true, seconds: 120, records: [], score: 7000 };
    },
    now: () => new Date(),
  });
  try {
    await games.create(table);
    games.invite('bruno', 'Bruno');
    const id = games.current()!.id;
    deliver!('bruno', { t: 'game-answer', game: id, answer: 'accept', match: 'same' });
    assert.ok(games.start());
    for (let i = 0; i < 400 && games.current()!.players[0]!.state !== 'done'; i++) await new Promise((r) => setTimeout(r, 25));
    const me = games.current()!.players[0]!;
    assert.deepEqual([me.state, me.score, me.ball], ['done', 7000, 2]);
  } finally {
    games.stop();
  }
});

test('application : le relevé lu pendant la partie, la fin ferme VPX, une partie qui a tourné compte comme jouée', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /const liveSource = double\?\.live \? \(\) => double\.liveState\(\)/);
  assert.match(front, /if \(Date\.now\(\) - overAt >= LIVE_CLOSE_AFTER_MS\) \{[\s\S]*?game\.stop\(\);/);
  assert.match(front, /const played = report\.result\.ok \|\| report\.result\.seconds >= PLAYED_SECONDS;/);
  assert.match(front, /gameNotices\.board\(playing && current \? liveBoardView\(current, socialNet\.state\(\)\.key\.publicKey\) : undefined\);/);
  const doubles = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'table-double.ts'), 'utf8');
  assert.match(doubles, /liveStateHook\(script, readVpxElements\(plan\.file\), stateFile\)/);
});
