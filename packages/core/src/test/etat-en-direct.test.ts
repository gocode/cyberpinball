// État de jeu en direct d'une partie entre amis (essai réel du 30/10/2026 : crédits mis à la main,
// rien sur les autres pendant la partie, fin floue, score perdu si l'on quitte pendant les initiales).
// Le script du double reçoit un relevé (score, bille, partie en cours) et un départ automatique ;
// Start hors partie et le monnayeur y sont ignorés ; la bande montre chacun ; le score final vient
// du relevé. Vérifié sur les scripts réels de Game of Thrones, GOTG, The Goonies et The Matrix :
// complétés, ils se compilent (cscript), comme leurs originaux. Tables à ROM : le relevé lit la
// mémoire de la ROM d'après sa carte ; exécuté ici par cscript sur un faux Controller dont la NVRAM
// suit celle de la vraie ROM de T2, relevée sur la libpinmame de la borne (le script complété des
// deux versions de T2 de la borne se compile aussi). Stern SAM : hors de portée, refusé.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  addGameToBoard,
  boardFor,
  gameStatus,
  liveInsertSize,
  liveBoardView,
  liveRanked,
  liveScore,
  liveStandings,
  liveStateHook,
  parseLiveMessage,
  parseLiveState,
  romLivePlan,
  type GroupBoards,
  type LiveGame,
  type LiveMessage,
  type RomMemory,
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
      { key: 'alexis', name: 'Alexis', state: 'playing', host: true, proto: 3 },
      { key: 'bruno', name: 'Bruno', state: 'playing', settings: 'ok', proto: 3 },
      { key: 'chloe', name: 'Chloé', state: 'loading', settings: 'ok', proto: 3 },
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
    view.rows.map((r) => [r.name, r.score.replace(/\s/g, ' '), r.detail, r.short, r.ball, r.me, r.lead]),
    [
      ['Bruno', '910 000', 'Bille 1', 'B1', 1, false, true],
      ['Alexis', '148 030', 'Bille 2 sur 3', 'B2', 2, true, false],
      ['Chloé', '—', 'Chargement', '', 0, false, false],
    ],
  );
  // Encart du plateau (repli) : une ligne de 34 par joueur, à 1 080 px.
  assert.deepEqual(liveInsertSize(3), { width: 340, height: 3 * 34 + 16 });
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
// Tables à ROM : la mémoire de la ROM, lue par Controller.NVRAM d'après sa carte

/** La carte de T2 (t2_l8, Pinball Memory Maps), réduite à ce que lit le relevé ; adresses réelles. */
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
    high_scores: [7302, 7268, 7276, 7284, 7292].map((start) => ({ score: { start, encoding: 'bcd', length: 5 } })),
  } as RomMemory['map'],
  platform: { endian: 'big', memory_layout: [{ address: '0x0000', size: '0x2000', type: 'nvram' }] },
};

/** Stern SAM (Star Trek, st_161h) : joueur, bille et fin de partie en RAM principale, hors de la NVRAM. */
const ST: RomMemory = {
  map: {
    _metadata: { platform: 'stern-sam' },
    game_state: {
      player_count: { start: '0x02110900', encoding: 'int' },
      current_player: { start: '0x00031988', encoding: 'int' },
      current_ball: { start: '0x00031989', encoding: 'int' },
      game_over: { start: '0x000319BA', encoding: 'bool', mask: '0xFE', invert: true },
      scores: [{ start: '0x2110A0C', encoding: 'int', length: 4 }],
    },
  } as RomMemory['map'],
  platform: {
    endian: 'little',
    memory_layout: [
      { address: '0x00000000', size: '0x100000', type: 'ram' },
      { address: '0x02100000', size: '0x20000', type: 'nvram' },
    ],
  },
};

/** Le script d'une table à ROM, réduit (T2 : Table1_KeyDown, Start par vpmKeyDown). */
const ROM_SCRIPT = [
  'Option Explicit',
  'Const cGameName = "t2_l8"',
  'Sub table1_KeyDown(ByVal keycode)',
  '  If keycode = StartGameKey Then SoundStartButton',
  '  If vpmKeyDown(keycode) Then Exit Sub',
  'End Sub',
  'Sub table1_KeyUp(ByVal keycode)',
  '  If vpmKeyUp(keycode) Then Exit Sub',
  'End Sub',
  'Sub Init : Controller.GameName = cGameName : End Sub',
].join('\r\n');

const bcd = (n: number, length: number) => Array.from({ length }, (_, i) => Math.floor(n / 100 ** (length - 1 - i)) % 100).map((d) => (Math.floor(d / 10) << 4) | d % 10);

test('ROM : la carte dit ce que la NVRAM contient ; Stern SAM, joueur, bille et fin hors de portée', () => {
  const t2 = romLivePlan(T2);
  assert.ok(t2.ok);
  assert.deepEqual([t2.plan.player.at, t2.plan.ball.at, t2.plan.over.at, t2.plan.scores.length, t2.plan.board.length, t2.plan.balls?.at], [1039, 1040, 135, 4, 5, 6943]);
  const st = romLivePlan(ST);
  assert.equal(st.ok, false);
  assert.match(!st.ok ? st.reason : '', /current_player, current_ball, game_over/);
  assert.equal(romLivePlan({ ...T2, map: { ...T2.map, game_state: undefined } as RomMemory['map'] }).ok, false);
  // Sans carte, une table à ROM n'a pas de relevé ; avec, il lit la mémoire.
  assert.equal(liveStateHook(ROM_SCRIPT, ELEMENTS, FILE).ok, false);
  const hook = liveStateHook(ROM_SCRIPT, ELEMENTS, FILE, T2);
  assert.ok(hook.ok && hook.source === 'rom');
  assert.equal(liveStateHook(ROM_SCRIPT, ELEMENTS, FILE, ST).ok, false);
  const first = liveStateHook(SCRIPT, ELEMENTS, FILE, T2);
  assert.equal(first.ok && first.source, 'script', 'le socle commun d’abord');
  assert.equal(liveStateHook(ROM_SCRIPT.replace(/vpmKeyDown/g, 'Autre'), ELEMENTS, FILE, T2).ok, false, 'les touches doivent atteindre la ROM');
});

/**
 * Le script complété exécuté par cscript : un faux Controller dont la NVRAM suit le relevé de la
 * vraie ROM de T2 (libpinmame de la borne, 30/10/2026), étape par étape ; `steps` : les octets
 * changés, puis le minuteur, puis des touches du joueur. Rend, par étape, la ligne du relevé et les
 * touches arrivées à la table.
 */
function runRomHook(steps: { set?: [number, number[]][]; press?: string[] }[]): { state: string; keys: string }[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-etat-rom-'));
  const stateFile = path.join(dir, 'cyberpinball-etat.txt');
  const hook = liveStateHook(ROM_SCRIPT, ELEMENTS, stateFile, T2);
  assert.ok(hook.ok);
  const prelude = [
    'Const AddCreditKey = 6, AddCreditKey2 = 4, StartGameKey = 2, LockBarKey = 29, LeftFlipperKey = 42',
    'Class CPElement : Public TimerInterval, TimerEnabled : End Class',
    'Class CPController : Public NVRAM, GameName : End Class',
    `Dim ${hook.element} : Set ${hook.element} = New CPElement`,
    'Dim Controller : Set Controller = New CPController',
    'Dim CPMem(8191), CPKeys, CPi',
    'For CPi = 0 To 8191 : CPMem(CPi) = CByte(0) : Next',
    'Controller.NVRAM = CPMem',
    'Sub SoundStartButton : End Sub',
    'Function vpmKeyDown(ByVal k) : CPKeys = CPKeys & "D" & k & " " : vpmKeyDown = True : End Function',
    'Function vpmKeyUp(ByVal k) : CPKeys = CPKeys & "U" & k & " " : vpmKeyUp = True : End Function',
    'Sub CPSet(ByVal at, ByVal v) : CPMem(at) = CByte(v) : Controller.NVRAM = CPMem : End Sub',
  ];
  const driver = steps.flatMap((s, i) => [
    'CPKeys = ""',
    ...(s.set ?? []).flatMap(([at, bytes]) => bytes.map((b, j) => `CPSet ${at + j}, ${b}`)),
    `${hook.element}_Timer`,
    ...(s.press ?? []).map((k) => `table1_KeyDown ${k} : table1_KeyUp ${k}`),
    `WScript.Echo "${i}|" & CyberPinball_Last & "|" & CPKeys`,
  ]);
  const script = hook.script.replace(/^Option Explicit\r\n/, `Option Explicit\r\n${prelude.join('\r\n')}\r\n`) + '\r\n' + driver.join('\r\n') + '\r\n';
  const file = path.join(dir, 'essai.vbs');
  fs.writeFileSync(file, script, 'latin1');
  const run = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const lines = run.stdout.trim().split(/\r?\n/).map((l) => l.split('|'));
  assert.equal(fs.readFileSync(stateFile, 'latin1'), lines.at(-1)![1], 'le fichier du double tient la dernière ligne');
  fs.rmSync(dir, { recursive: true, force: true });
  return lines.map(([, state, keys]) => ({ state: state!, keys: keys!.trim() }));
}

test('ROM, exécuté : départ après l’attente de la table, partie lue, initiales attendues, Start et monnayeur filtrés', { skip: process.platform !== 'win32' }, () => {
  const live = (v: number, p: number, b: number) => [[1039, [p]], [1040, [b]], [135, [v]]] as [number, number[]][];
  const steps: { set?: [number, number[]][]; press?: string[] }[] = [
    // Démarrage : trois secondes de la partie d'avant (VPX quitté en pleine partie), puis la ROM l'efface.
    { set: [...live(0, 1, 2), [5936, bcd(159_790, 5)], [6036, [1]], [6943, [0, 3]]], press: ['2', '6'] },
    { set: live(0, 0, 0) },
    // En attente : deux secondes (quatre relevés), puis le crédit, tenu jusqu'au relevé suivant ; Start quatre relevés plus tard.
    { set: live(1, 1, 1) },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    // Notre partie part : score remis à zéro par la ROM.
    { set: [...live(0, 1, 1), [5936, bcd(0, 5)]] },
    { set: [[5936, bcd(148_720, 5)]], press: ['42', '6', '2'] },
    { set: [...live(0, 1, 3), [5936, bcd(495_990, 5)]] },
    // Dernière bille perdue, bonus compté : fin de partie, puis les initiales (Start valide une lettre).
    { set: [...live(1, 1, 3), [5936, bcd(522_960, 5)]], press: ['2'] },
    { set: [[7292, bcd(522_960, 5)]], press: ['2'] },
  ];
  const r = runRomHook(steps);
  // Avant notre Start, la partie d'avant ne compte pas ; Start et monnayeur du joueur ignorés.
  assert.equal(r[0]!.state, 'jeu=0;vu=0;joueurs=1;joueur=1;bille=2;billes=3;score=159790');
  assert.equal(r[0]!.keys, '');
  // Le crédit au quatrième relevé en attente (étape 5), relâché au suivant ; Start quatre relevés après.
  assert.deepEqual(r.slice(2, 11).map((s) => s.keys), ['', '', '', 'D6', 'U6', '', '', 'D2', 'U2']);
  assert.match(r[11]!.state, /^jeu=1;vu=1;joueurs=1;joueur=1;bille=1;billes=3;score=0$/);
  // En partie : flipper et Start passent, le monnayeur jamais.
  assert.equal(r[12]!.keys, 'D42 U42 D2 U2');
  assert.equal(r[13]!.state, 'jeu=1;vu=1;joueurs=1;joueur=1;bille=3;billes=3;score=495990');
  // Fin de partie vraie, mais le score bat la dernière place sans y être : les initiales, Start passe.
  assert.equal(r[14]!.state, 'jeu=1;vu=1;joueurs=1;joueur=1;bille=3;billes=3;score=522960');
  assert.equal(r[14]!.keys, 'D2 U2');
  // Le score entré au tableau : la partie est finie ; Start ne passe plus.
  assert.equal(r[15]!.state, 'jeu=0;vu=1;joueurs=1;joueur=1;bille=3;billes=3;score=522960');
  assert.equal(r[15]!.keys, '');
  assert.deepEqual(parseLiveState(r[15]!.state), { inGame: false, started: true, players: 1, player: 1, ball: 3, balls: 3, score: 522_960 });
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
  // La bande ne naît qu'avec la table à l'écran (phase playing), une fois VPX installé sur ses écrans, et suit ceux qu'il prend ou rend.
  assert.match(front, /const onPlaying = \(\) => \{\r?\n[^\n]*\r?\n\s+playingSince = Date\.now\(\);\r?\n\s+state = \{ \.\.\.state, phase: 'playing' \};/);
  assert.match(front, /broadcast\(\);\r?\n\s+setTimeout\(showLiveBoard, LIVE_BOARD_SETTLE_MS\);/);
  assert.match(front, /gameNotices\.board\(playing && state\.phase === 'playing' && settled && current \? liveBoardView\(current, socialNet\.state\(\)\.key\.publicKey\) : undefined\);/);
  assert.match(front, /console\.log\(`Partie : écrans occupés par VPX[^\n]*\r?\n\s+broadcast\(\);\r?\n[^\n]*\r?\n\s+showLiveBoard\(\);/);
  const doubles = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'table-double.ts'), 'utf8');
  assert.match(doubles, /liveStateHook\(script, readVpxElements\(plan\.file\), stateFile, rom\?\.memory\)/);
  assert.match(doubles, /const rom = roms\.map\(\(name\) => \(\{ name, memory: romBoard\(name\)\.memory \}\)\)\.find\(\(r\) => r\.memory\);/);
});
