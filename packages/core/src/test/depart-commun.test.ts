// Départ commun d'une partie entre amis (essai réel du 31/10/2026, Matrix et Game of Thrones : une
// borne partait dès sa table chargée, l'autre chargeait encore, sans que rien ne dise pourquoi).
// Chaque borne dit « prêt » quand sa table est chargée et que son relevé répond ; l'hôte donne
// « partez » quand tous le sont ; le relevé du double ne met le crédit et n'appuie sur Start qu'au
// fichier « partez ». Un joueur jamais prêt : départ sans lui après le délai, il part dès que sa
// table l'est ; un joueur qui quitte n'est plus attendu ; une borne d'avant ce protocole n'est pas
// attendue et se signale ; un invité sans nouvelles de l'hôte part seul. Le relevé complété est
// exécuté par cscript (socle commun, et mémoire de T2 relevée au banc) : rien ne part avant le signal.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  applyRoom,
  gameStatus,
  giveGo,
  LIVE_GO_FALLBACK_MS,
  LIVE_GO_SHOW_MS,
  LIVE_PROTOCOL,
  LIVE_READY_WAIT_MS,
  liveAwaited,
  liveBehind,
  liveBehindLabel,
  liveGoDue,
  liveGuestGo,
  liveNoLiveState,
  livePlayerStateLabel,
  liveStateHook,
  liveWaitBounds,
  liveWaitSize,
  liveWaitView,
  parseLiveMessage,
  parseLiveState,
  roomMessage,
  type LiveGame,
  type LiveMessage,
  type RomMemory,
  type TableEntry,
} from '../index';

const T0 = new Date('2026-10-31T20:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Alexis invite Bruno (à jour) et Chloé (borne restée au protocole 3) ; la partie vient d'être lancée. */
function launched(): LiveGame {
  return {
    id: '0123456789abcdef',
    host: 'alexis',
    table: { table: { title: 'The Matrix' }, print: 'a'.repeat(64), balls: 3 },
    title: 'The Matrix (Original 2024)',
    players: [
      { key: 'alexis', name: 'Alexis', state: 'accepted', host: true, proto: LIVE_PROTOCOL },
      { key: 'bruno', name: 'Bruno', state: 'accepted', settings: 'ok', proto: LIVE_PROTOCOL },
      { key: 'chloe', name: 'Chloé', state: 'accepted', settings: 'ok', proto: 3, app: '0.1.5-essai.19' },
      { key: 'dora', name: 'Dora', state: 'declined' },
    ],
    phase: 'countdown',
    createdAt: T0.toISOString(),
  };
}

test('machine d’états : chargement, prêt, partez quand tous les attendus sont prêts ; la borne ancienne n’est pas attendue', () => {
  let game = launched();
  assert.deepEqual(liveAwaited(game).map((p) => p.key), ['alexis', 'bruno'], 'Chloé (protocole 3) ne dira jamais « prêt »');
  assert.equal(liveGoDue(game, T0), undefined, 'compte à rebours : rien ne part');
  game = gameStatus(game, 'alexis', { state: 'loading' }, at(5000));
  game = gameStatus(game, 'bruno', { state: 'loading' }, at(5200));
  game = gameStatus(game, 'chloe', { state: 'loading' }, at(5300));
  assert.equal(game.phase, 'playing');
  assert.equal(liveGoDue(game, at(6000)), undefined);
  // La borne ancienne part dès sa table chargée : elle ne bloque personne.
  game = gameStatus(game, 'chloe', { state: 'playing' }, at(9000));
  assert.equal(liveGoDue(game, at(9000)), undefined);
  // Alexis prêt : le délai des autres part de là.
  game = gameStatus(game, 'alexis', { state: 'loading', ready: true }, at(12_000));
  assert.equal(game.firstReadyAt, at(12_000).toISOString());
  assert.equal(livePlayerStateLabel(game.players[0]!), 'Prêt, en attente du départ commun');
  assert.equal(liveGoDue(game, at(20_000)), undefined, 'Bruno charge encore');
  // L'attente, vue d'Alexis : pourquoi la partie n'a pas démarré, chacun et son statut, le délai.
  const view = liveWaitView(game, 'alexis', at(20_000))!;
  assert.equal(view.title, 'En attente des joueurs');
  assert.equal(view.go, false);
  assert.equal(view.lead, 'En attente : Bruno — Chargement de la table…');
  assert.equal(view.note, 'Départ sans Bruno dans 82 s si sa table n’est pas prête');
  assert.deepEqual(
    view.rows.map((r) => [r.name, r.status, r.ready, r.out, r.me]),
    [
      ['Alexis', 'Prêt', true, false, true],
      ['Bruno', 'Chargement de la table…', false, false, false],
      ['Chloé', 'Ancienne version : part sans attendre', false, true, false],
    ],
  );
  // Vue de Bruno : sa table charge ; sans relevé, il sait quand appuyer sur Start.
  assert.equal(liveWaitView(game, 'bruno', at(20_000))!.lead, 'Votre table se charge…');
  assert.equal(liveWaitView(game, 'bruno', at(20_000), { manual: true })!.note, 'Attendez « Partez ! » pour appuyer sur Start');
  // Bruno prêt : tous les attendus le sont, « partez ».
  game = gameStatus(game, 'bruno', { state: 'loading', ready: true }, at(30_000));
  assert.equal(liveGoDue(game, at(30_000)), 'all-ready');
  game = giveGo(game, 'all-ready', at(30_000));
  assert.deepEqual([game.goAt, game.goWhy, game.goLate], [at(30_000).toISOString(), 'all-ready', []]);
  assert.equal(liveGoDue(game, at(31_000)), undefined, 'une seule fois');
  assert.equal(giveGo(game, 'timeout', at(40_000)), game);
  const go = liveWaitView(game, 'bruno', at(31_000), { manual: true })!;
  assert.deepEqual([go.title, go.go, go.lead], ['Partez !', true, 'Tout le monde est prêt · Appuyez sur Start']);
  // « Partez ! » quelques secondes, puis la bande de la partie prend la suite.
  assert.ok(liveWaitView(game, 'alexis', at(30_000 + LIVE_GO_SHOW_MS)));
  assert.equal(liveWaitView(game, 'alexis', at(30_000 + LIVE_GO_SHOW_MS + 1)), undefined);
  // Prêt reste vrai quand la partie part (la ligne n'efface pas le drapeau).
  game = gameStatus(game, 'bruno', { state: 'playing', score: 1000, ball: 1 }, at(33_000));
  assert.equal(game.players[1]!.ready, true);
});

test('un joueur jamais prêt : départ sans lui après le délai ; il part dès que sa table l’est', () => {
  let game = launched();
  game = { ...game, players: game.players.filter((p) => p.key !== 'chloe') };
  game = gameStatus(game, 'alexis', { state: 'loading', ready: true }, at(10_000));
  game = gameStatus(game, 'bruno', { state: 'loading' }, at(10_500));
  assert.equal(liveGoDue(game, at(10_000 + LIVE_READY_WAIT_MS - 1)), undefined);
  assert.equal(liveWaitView(game, 'alexis', at(10_000 + LIVE_READY_WAIT_MS - 1000))!.note, 'Départ sans Bruno dans 1 s si sa table n’est pas prête');
  assert.equal(liveGoDue(game, at(10_000 + LIVE_READY_WAIT_MS)), 'timeout');
  game = giveGo(game, 'timeout', at(10_000 + LIVE_READY_WAIT_MS));
  assert.deepEqual(game.goLate, ['bruno']);
  const alexis = liveWaitView(game, 'alexis', at(10_000 + LIVE_READY_WAIT_MS + 500))!;
  assert.deepEqual([alexis.title, alexis.lead], ['Partez !', 'Départ sans Bruno : table pas prête à temps, départ dès qu’elle le sera']);
  assert.equal(alexis.rows.find((r) => r.name === 'Bruno')!.status, 'Chargement de la table… il part dès qu’elle est prête');
  // Chez Bruno : tant que sa table charge, il sait que les autres sont partis ; prête, c'est à lui.
  const later = at(10_000 + LIVE_READY_WAIT_MS + 30_000);
  assert.deepEqual([liveWaitView(game, 'bruno', later)!.title, liveWaitView(game, 'bruno', later)!.go], ['Les autres sont partis', false]);
  const mine = liveWaitView(game, 'bruno', later, { readyAt: later.getTime() - 1000 })!;
  assert.deepEqual([mine.title, mine.lead], ['Partez !', 'Les autres sont déjà partis : à vous !']);
  assert.equal(liveWaitView(game, 'bruno', later, { readyAt: later.getTime() - LIVE_GO_SHOW_MS - 1 }), undefined);
});

test('un joueur qui quitte pendant l’attente, ou dont la partie n’a pas démarré, n’est plus attendu', () => {
  let game = launched();
  game = gameStatus(game, 'alexis', { state: 'loading', ready: true }, at(10_000));
  game = gameStatus(game, 'bruno', { state: 'loading' }, at(10_000));
  assert.equal(liveGoDue(game, at(11_000)), undefined);
  game = gameStatus(game, 'bruno', { state: 'left' }, at(12_000));
  const view = liveWaitView(game, 'alexis', at(12_000))!;
  assert.equal(view.rows.find((r) => r.name === 'Bruno')!.status, 'A quitté la partie');
  assert.equal(liveGoDue(game, at(12_000)), 'all-ready');
  let failed = launched();
  failed = gameStatus(failed, 'bruno', { state: 'loading', ready: true }, at(10_000));
  failed = gameStatus(failed, 'alexis', { state: 'failed' }, at(11_000));
  assert.equal(liveGoDue(failed, at(11_000)), 'all-ready', 'l’hôte dont la partie n’a pas démarré ne bloque pas ses invités');
  const bruno = liveWaitView(failed, 'bruno', at(11_000))!;
  assert.equal(bruno.lead, 'Tout le monde est prêt : départ…');
  assert.equal(bruno.rows.find((r) => r.name === 'Alexis')!.status, 'Partie pas démarrée de son côté');
});

test('borne ancienne : signalée, jamais attendue ; un invité dont l’hôte est ancien, ou muet, part seul et le dit', () => {
  assert.ok(liveBehind({ proto: 3 }));
  assert.ok(!liveNoLiveState({ proto: 3 }));
  assert.equal(liveBehindLabel({ proto: 3, app: '0.1.5-essai.19' }), 'Cyber Pinball 0.1.5-essai.19 sur sa borne : sa table part sans attendre les autres, à mettre à jour');
  assert.equal(liveBehindLabel({ proto: 2, app: '0.1.5-essai.10' }), 'Cyber Pinball 0.1.5-essai.10 sur sa borne : ni départ automatique ni score en direct, à mettre à jour');
  // Vu de Bruno, invité d'un hôte au protocole 3 : il part dès qu'il est prêt.
  const old = { ...launched(), players: launched().players.map((p) => (p.host ? { ...p, proto: 3 } : p)), phase: 'playing' as const };
  assert.equal(liveGuestGo(old, undefined, T0), 'host-behind');
  const behind = liveWaitView(giveGo(old, 'host-behind', at(1000)), 'bruno', at(1500), { readyAt: at(1000).getTime() })!;
  assert.deepEqual([behind.title, behind.lead], ['Partez !', 'Alexis a une ancienne version de Cyber Pinball : votre table part sans attendre les autres']);
  // Hôte à jour mais muet (sa borne éteinte) : après le délai et la marge, l'invité prêt part seul.
  const current = { ...launched(), phase: 'playing' as const };
  assert.equal(liveGuestGo(current, at(0).getTime(), at(LIVE_GO_FALLBACK_MS - 1)), undefined);
  assert.equal(liveGuestGo(current, at(0).getTime(), at(LIVE_GO_FALLBACK_MS)), 'no-signal');
  assert.equal(liveGuestGo(current, undefined, at(10 * LIVE_GO_FALLBACK_MS)), undefined, 'pas prêt : rien à faire partir');
  assert.ok(LIVE_GO_FALLBACK_MS > LIVE_READY_WAIT_MS, 'l’hôte, s’il répond, donne « partez » avant');
  const silent = liveWaitView(giveGo(current, 'no-signal', at(LIVE_GO_FALLBACK_MS)), 'bruno', at(LIVE_GO_FALLBACK_MS), { readyAt: 0 })!;
  assert.equal(silent.lead, 'Plus de nouvelles de Alexis : votre table part seule');
});

test('protocole : « prêt » dans game-status, l’attente puis « partez » dans la salle, vérifiés ; l’invité les lit à son horloge', () => {
  assert.equal(LIVE_PROTOCOL, 4);
  const status = parseLiveMessage({ t: 'game-status', game: '0123456789abcdef', state: 'loading', ready: true }) as Extract<LiveMessage, { t: 'game-status' }>;
  assert.equal(status.ready, true);
  assert.equal((parseLiveMessage({ t: 'game-status', game: '0123456789abcdef', state: 'loading', ready: 'oui' }) as Extract<LiveMessage, { t: 'game-status' }>).ready, undefined);
  const keys = { alexis: 'a'.repeat(64), bruno: 'b'.repeat(64), chloe: 'c'.repeat(64) } as Record<string, string>;
  let host = launched();
  host = { ...host, host: keys.alexis!, players: host.players.filter((p) => p.key !== 'dora').map((p) => ({ ...p, key: keys[p.key]! })) };
  host = gameStatus(host, keys.alexis!, { state: 'loading', ready: true }, at(10_000));
  const waiting = parseLiveMessage(JSON.parse(JSON.stringify(roomMessage(host, at(25_000))))) as Extract<LiveMessage, { t: 'game-room' }>;
  assert.equal(waiting.readyFor, 15_000);
  assert.equal(waiting.go, undefined);
  assert.equal(waiting.players[0]!.ready, true, 'le drapeau voyage avec le joueur');
  // L'invité : son horloge retarde d'une heure, le délai se compte quand même juste.
  const guestClock = new Date(T0.getTime() - 3600_000 + 25_000);
  let guest: LiveGame = { ...host, phase: 'playing', firstReadyAt: undefined, players: [] };
  guest = applyRoom(guest, waiting, guestClock);
  assert.equal(Date.parse(guest.firstReadyAt!), guestClock.getTime() - 15_000);
  host = giveGo(host, 'timeout', at(100_000));
  const go = parseLiveMessage(JSON.parse(JSON.stringify(roomMessage(host, at(100_000))))) as Extract<LiveMessage, { t: 'game-room' }>;
  assert.deepEqual(go.go, { why: 'timeout', late: [keys.bruno] });
  assert.equal(go.readyFor, undefined);
  guest = applyRoom(guest, go, guestClock);
  assert.deepEqual([guest.goAt, guest.goWhy, guest.goLate], [guestClock.toISOString(), 'timeout', [keys.bruno]]);
  assert.equal(applyRoom(guest, go, new Date(guestClock.getTime() + 5000)).goAt, guestClock.toISOString(), 'reçu une fois : la salle suivante ne le décale pas');
  // Un « partez » mal formé ou des inconnus en retard : ignorés.
  const bad = parseLiveMessage({ ...JSON.parse(JSON.stringify(roomMessage(host))), go: { why: 'maintenant', late: [] } }) as Extract<LiveMessage, { t: 'game-room' }>;
  assert.equal(bad.go, undefined);
  const stranger = parseLiveMessage({ ...JSON.parse(JSON.stringify(roomMessage(host))), go: { why: 'all-ready', late: ['f'.repeat(64), 3] } }) as Extract<LiveMessage, { t: 'game-room' }>;
  assert.deepEqual(stranger.go, { why: 'all-ready', late: [] });
  assert.equal((parseLiveMessage({ ...JSON.parse(JSON.stringify(roomMessage(host))), readyFor: -5 }) as Extract<LiveMessage, { t: 'game-room' }>).readyFor, undefined);
});

test('sur la table : la carte de l’attente au centre du plateau, dans son tiers haut vu du joueur, dans les quatre sens', () => {
  assert.deepEqual(liveWaitSize(3), { width: 640, height: 176 + 3 * 46 + 24 });
  const zone = { x: 1920, y: 0, width: 1080, height: 1920 };
  // Plateau debout (0°) : centré en largeur, centré sur le tiers de la hauteur.
  const up = liveWaitBounds(zone, 0, 3);
  assert.deepEqual(up, { x: 1920 + 220, y: Math.round(1920 / 3 - 338 / 2), width: 640, height: 338 });
  // Couché (90°, 270°) : la carte tourne avec lui, son « haut » est un bord vertical de l'écran.
  const side = { x: 0, y: 0, width: 1920, height: 1080 };
  const r90 = liveWaitBounds(side, 90, 3);
  assert.deepEqual([r90.width, r90.height], [338, 640]);
  assert.equal(r90.y, 220);
  assert.ok(r90.x > side.width / 2, '90° : le haut du joueur est à droite de l’écran');
  const r270 = liveWaitBounds(side, 270, 3);
  assert.ok(r270.x + r270.width < side.width / 2, '270° : à gauche');
  const r180 = liveWaitBounds(zone, 180, 3);
  assert.ok(r180.y > zone.height / 2, '180° : en bas de l’écran');
  for (const [z, r] of [[zone, up], [side, r90], [side, r270], [zone, r180]] as const) {
    assert.ok(r.x >= z.x && r.y >= z.y && r.x + r.width <= z.x + z.width && r.y + r.height <= z.y + z.height, 'dans le plateau');
  }
});

// ---------------------------------------------------------------------------
// Le relevé du double : le départ n'a lieu qu'après le fichier « partez » (exécuté par cscript)

/** Le socle de script commun, réduit, avec un Start qui démarre la partie et le journal des touches arrivées au script. */
const SCRIPT = [
  'Option Explicit',
  'Dim PlayersPlayingGame, CurrentPlayer, BallsPerGame, bGameInPlay, CPKeys',
  'Dim Score(4)',
  'Dim BallsRemaining(4)',
  'BallsPerGame = 3 : CurrentPlayer = 1 : PlayersPlayingGame = 1 : BallsRemaining(1) = 3',
  'Sub Table1_KeyDown(ByVal keycode)',
  '  CPKeys = CPKeys & "D" & keycode & " "',
  '  If keycode = StartGameKey Then bGameInPlay = True',
  'End Sub',
  'Sub Table1_KeyUp(ByVal keycode)',
  'End Sub',
  'Sub Wall1_Hit : Score(1) = Score(1) + 10 : End Sub',
].join('\r\n');

const ELEMENTS = [
  { type: 0, name: 'Wall1' },
  { type: 0, name: 'Wall2' },
];

test('relevé : avec le fichier « partez », le départ l’attend ; sans, il part comme avant ; « pret » dans la ligne', () => {
  const dir = ['C:', 'CyberPinball', 'parties', 'p', 'Matrix'].join(String.fromCharCode(92));
  const state = `${dir}${String.fromCharCode(92)}cyberpinball-etat.txt`;
  const goFile = `${dir}${String.fromCharCode(92)}cyberpinball-partez.txt`;
  const hook = liveStateHook(SCRIPT, ELEMENTS, state, undefined, undefined, goFile);
  assert.ok(hook.ok);
  assert.ok(hook.script.includes(`CyberPinball_Go = CyberPinball_Fso.FileExists("${goFile}")`));
  assert.match(hook.script, /If CyberPinball_Go And Not CyberPinball_Seen And CyberPinball_Tries < 4 Then/);
  assert.doesNotMatch(hook.script, /CyberPinball_Ticks Mod 16 = 12/, 'plus de départ au bout de trois secondes');
  assert.match(hook.script, /If Not bGameInPlay Then CyberPinball_Blocked = CyberPinball_Blocked Or keycode = StartGameKey/, 'Start bloqué tant que la partie n’est pas partie');
  const legacy = liveStateHook(SCRIPT, ELEMENTS, state);
  assert.ok(legacy.ok && /CyberPinball_Ticks Mod 16 = 12/.test(legacy.script) && !/pret=|FileExists/.test(legacy.script));
  assert.equal(liveStateHook(SCRIPT, ELEMENTS, state, undefined, undefined, 'C:/a"b.txt').ok, false);
  assert.deepEqual(parseLiveState('jeu=0;vu=0;joueurs=1;joueur=1;bille=1;billes=3;score=0;pret=1'), { inGame: false, started: false, players: 1, player: 1, ball: 1, balls: 3, score: 0, ready: true });
  assert.equal(parseLiveState('jeu=0;vu=0;joueurs=1;joueur=1;bille=1;billes=3;score=0')!.ready, undefined, 'sans départ commun, pas de « pret »');
  // Les tables à ROM, NVRAM seule (T2) comme par l'inspector (Stern SAM) : le même départ attend le fichier.
  const t2 = liveStateHook(ROM_SCRIPT, ELEMENTS, state, T2, undefined, goFile);
  const sam = liveStateHook(ROM_SCRIPT, ELEMENTS, state, ST, { port: 2114 }, goFile);
  for (const h of [t2, sam]) {
    assert.ok(h.ok && h.source === 'rom');
    assert.match(h.script, /If Not CyberPinball_Go And CyberPinball_Ready >= 4 Then CyberPinball_Go = CyberPinball_Fso\.FileExists\(/);
    assert.match(h.script, /If CyberPinball_Go And Not CyberPinball_Seen And CyberPinball_Tries < 12 And CyberPinball_Ready >= 4 Then/);
    assert.match(h.script, /If CyberPinball_Ready >= 4 Or CyberPinball_Seen Then s = s & ";pret=1"/);
  }
});

/** Exécute le relevé complété par cscript : `ticks` tours de minuteur ; à `goAt`, le fichier « partez » apparaît ; `press` : touches du joueur à un tour. */
function runScript(ticks: number, goAt: number, press: Record<number, string> = {}): { state: string; keys: string }[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-depart-'));
  const stateFile = path.join(dir, 'cyberpinball-etat.txt');
  const goFile = path.join(dir, 'cyberpinball-partez.txt');
  const hook = liveStateHook(SCRIPT, ELEMENTS, stateFile, undefined, undefined, goFile);
  assert.ok(hook.ok);
  const prelude = [
    'Const AddCreditKey = 6, AddCreditKey2 = 4, StartGameKey = 2, LockBarKey = 29',
    'Class CPElement : Public TimerInterval, TimerEnabled : End Class',
    `Dim ${hook.element} : Set ${hook.element} = New CPElement`,
    'Dim CPFso : Set CPFso = CreateObject("Scripting.FileSystemObject")',
  ];
  const driver = Array.from({ length: ticks }, (_, i) => [
    'CPKeys = ""',
    ...(i + 1 === goAt ? [`CPFso.CreateTextFile("${goFile}", True).Close`] : []),
    `${hook.element}_Timer`,
    ...(press[i + 1] ? [`Table1_KeyDown ${press[i + 1]} : Table1_KeyUp ${press[i + 1]}`] : []),
    `WScript.Echo "${i + 1}|" & CyberPinball_Last & "|" & CPKeys`,
  ]).flat();
  const script = hook.script.replace(/^Option Explicit\r\n/, `Option Explicit\r\n${prelude.join('\r\n')}\r\n`) + '\r\n' + driver.join('\r\n') + '\r\n';
  const file = path.join(dir, 'essai.vbs');
  fs.writeFileSync(file, script, 'latin1');
  const run = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return run.stdout.trim().split(/\r?\n/).map((l) => l.split('|')).map(([, state, keys]) => ({ state: state!, keys: keys!.trim() }));
}

test('socle commun, exécuté : prêt après trois secondes, rien ne part avant « partez », Start du joueur ignoré ; puis crédit et Start', { skip: process.platform !== 'win32' }, () => {
  // Le joueur appuie sur Start et met une pièce pendant l'attente (tours 15 et 16) ; « partez » au tour 40 (dix secondes).
  const r = runScript(46, 40, { 15: '2', 16: '6' });
  assert.match(r[0]!.state, /;pret=0$/, 'la table vient d’arriver');
  assert.match(r[11]!.state, /^jeu=0;vu=0;.*;pret=1$/, 'trois secondes de table à l’écran : prête');
  assert.equal(r.slice(0, 39).map((s) => s.keys).join(''), '', 'ni crédit ni Start avant le signal, ni ceux du joueur');
  assert.equal(r[39]!.keys, 'D6', 'au signal : le crédit');
  assert.equal(r[41]!.keys, 'D2', 'Start une demi-seconde après');
  assert.match(r[42]!.state, /^jeu=1;vu=1;/, 'la partie part');
  assert.equal(r.slice(43).map((s) => s.keys).join(''), '', 'une seule fois');
});

test('socle commun, exécuté : « partez » arrivé pendant le chargement (retardataire), le départ suit la table prête', { skip: process.platform !== 'win32' }, () => {
  const r = runScript(16, 2);
  assert.equal(r.slice(0, 11).map((s) => s.keys).join(''), '', 'pas avant la table prête');
  assert.equal(r[11]!.keys, 'D6');
  assert.equal(r[13]!.keys, 'D2');
});

// --- Table à ROM (T2) : la mémoire relevée au banc, comme etat-en-direct.test.ts ---

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

const ROM_SCRIPT = [
  'Option Explicit',
  'Const cGameName = "t2_l8"',
  'Sub table1_KeyDown(ByVal keycode)',
  '  If vpmKeyDown(keycode) Then Exit Sub',
  'End Sub',
  'Sub table1_KeyUp(ByVal keycode)',
  '  If vpmKeyUp(keycode) Then Exit Sub',
  'End Sub',
  'Sub Init : Controller.GameName = cGameName : End Sub',
].join('\r\n');

test('T2, exécuté sur la mémoire de la ROM : la table en attente se dit prête, le crédit attend « partez »', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-depart-rom-'));
  const stateFile = path.join(dir, 'cyberpinball-etat.txt');
  const goFile = path.join(dir, 'cyberpinball-partez.txt');
  const hook = liveStateHook(ROM_SCRIPT, ELEMENTS, stateFile, T2, undefined, goFile);
  assert.ok(hook.ok);
  const prelude = [
    'Const AddCreditKey = 6, AddCreditKey2 = 4, StartGameKey = 2, LockBarKey = 29',
    'Class CPElement : Public TimerInterval, TimerEnabled : End Class',
    'Class CPController : Public NVRAM, GameName : End Class',
    `Dim ${hook.element} : Set ${hook.element} = New CPElement`,
    'Dim Controller : Set Controller = New CPController',
    'Dim CPMem(8191), CPKeys, CPi, CPFso',
    'Set CPFso = CreateObject("Scripting.FileSystemObject")',
    'For CPi = 0 To 8191 : CPMem(CPi) = CByte(0) : Next',
    // En attente (fin de partie vraie), trois billes par partie.
    'CPMem(135) = CByte(1) : CPMem(6944) = CByte(3) : Controller.NVRAM = CPMem',
    'Function vpmKeyDown(ByVal k) : CPKeys = CPKeys & "D" & k & " " : vpmKeyDown = True : End Function',
    'Function vpmKeyUp(ByVal k) : CPKeys = CPKeys & "U" & k & " " : vpmKeyUp = True : End Function',
  ];
  // Vingt relevés en attente (dix secondes) ; « partez » au quinzième ; le joueur appuie sur Start au dixième.
  const driver = Array.from({ length: 24 }, (_, i) => [
    'CPKeys = ""',
    ...(i + 1 === 15 ? [`CPFso.CreateTextFile("${goFile}", True).Close`] : []),
    `${hook.element}_Timer`,
    ...(i + 1 === 10 ? ['table1_KeyDown 2 : table1_KeyUp 2'] : []),
    `WScript.Echo "${i + 1}|" & CyberPinball_Last & "|" & CPKeys`,
  ]).flat();
  const script = hook.script.replace(/^Option Explicit\r\n/, `Option Explicit\r\n${prelude.join('\r\n')}\r\n`) + '\r\n' + driver.join('\r\n') + '\r\n';
  const file = path.join(dir, 'essai.vbs');
  fs.writeFileSync(file, script, 'latin1');
  const run = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const r = run.stdout.trim().split(/\r?\n/).map((l) => l.split('|')).map(([, state, keys]) => ({ state: state!, keys: keys!.trim() }));
  assert.match(r[2]!.state, /;pret=0$/, 'trois relevés en attente : pas encore sûr');
  assert.match(r[3]!.state, /^jeu=0;vu=0;joueurs=1;joueur=1;bille=0;billes=3;score=0;pret=1$/, 'quatre relevés en attente : prête');
  assert.equal(r.slice(0, 14).map((s) => s.keys).join(''), '', 'rien avant « partez », pas même le Start du joueur');
  assert.equal(r[14]!.keys, 'D6', 'au signal : le crédit, tenu jusqu’au tour suivant');
  assert.equal(r[15]!.keys, 'U6');
  assert.equal(r[18]!.keys, 'D2', 'Start deux secondes après');
});

// ---------------------------------------------------------------------------
// Service (app/src/live-game.ts, compilé) : deux bornes sur un réseau d'essai en mémoire

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): {
    create(table: TableEntry): Promise<LiveGame>;
    invite(key: string, name: string): boolean;
    invites(): { id: string }[];
    accept(id: string): Promise<{ match: string }>;
    start(): boolean;
    current(): LiveGame | undefined;
    waitView(): { title: string; lead: string } | undefined;
    stop(): void;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Gate = { ready(): void; go(): boolean };

test('service : l’hôte prêt attend son invité ; « partez » arrive aux deux quand l’invité l’est', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-depart-service-'));
  const vpx = path.join(dir, 'Matrix.vpx');
  fs.writeFileSync(vpx, 'table');
  const table = { file: vpx, folder: dir, title: 'The Matrix', info: {} } as unknown as TableEntry;
  const handlers: Record<string, (k: string, m: unknown) => void> = {};
  const net = (me: string, name: string, other: string, otherName: string) => ({
    state: () => ({ key: { publicKey: me }, name, friends: [{ key: other, name: otherName }] }),
    online: () => true,
    send: (to: string, m: unknown) => (setImmediate(() => handlers[to]?.(me, JSON.parse(JSON.stringify(m)))), true),
    onMessage: (cb: (k: string, m: unknown) => void) => ((handlers[me] = cb), () => undefined),
  });
  const timeline: string[] = [];
  const player = (who: string, loadMs: number) => async (_t: TableEntry, _playing: () => void, _s: unknown, _b: unknown, _p: unknown, gate: Gate) => {
    await new Promise((r) => setTimeout(r, loadMs));
    timeline.push(`${who} prêt`);
    gate.ready();
    while (!gate.go()) await new Promise((r) => setTimeout(r, 20));
    timeline.push(`${who} part`);
    return { ok: true, seconds: 60, records: [], score: who === 'Alexis' ? 1000 : 2000 };
  };
  const host = createLiveGames({ net: net('alexis', 'Alexis', 'bruno', 'Bruno'), dataDir: path.join(dir, 'a'), tables: () => [table], play: player('Alexis', 0), appVersion: '0.1.5-essai.21' });
  const guest = createLiveGames({ net: net('bruno', 'Bruno', 'alexis', 'Alexis'), dataDir: path.join(dir, 'b'), tables: () => [table], play: player('Bruno', 1500), appVersion: '0.1.5-essai.21' });
  const until = async (what: string, ok: () => boolean, ms = 20_000) => {
    for (const end = Date.now() + ms; !ok(); ) {
      if (Date.now() > end) throw new Error(`attendu : ${what}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  try {
    await host.create(table);
    assert.ok(host.invite('bruno', 'Bruno'));
    await until('invitation reçue', () => guest.invites().length === 1);
    assert.equal((await guest.accept(guest.invites()[0]!.id)).match, 'same');
    await until('acceptée', () => host.current()!.players[1]!.state === 'accepted');
    assert.ok(host.start());
    // Compte à rebours (5 s), puis Alexis prêt tout de suite : il attend Bruno, et l'écran dit pourquoi.
    await until('Alexis prêt', () => timeline.includes('Alexis prêt'));
    await until('Alexis prêt chez l’hôte', () => host.current()!.players[0]!.ready === true);
    assert.equal(host.waitView()?.lead, 'En attente : Bruno — Chargement de la table…');
    await until('les deux partis', () => timeline.includes('Alexis part') && timeline.includes('Bruno part'));
    assert.ok(timeline.indexOf('Bruno prêt') < timeline.indexOf('Alexis part'), `personne ne part avant que tous soient prêts : ${timeline.join(', ')}`);
    assert.equal(host.current()!.goWhy, 'all-ready');
    await until('résultats', () => host.current()!.phase === 'finished' && guest.current()?.phase === 'finished');
    assert.deepEqual(host.current()!.players.map((p) => [p.name, p.state, p.score]), [['Alexis', 'done', 1000], ['Bruno', 'done', 2000]]);
    assert.equal(guest.current()!.goWhy, 'all-ready', 'l’invité a reçu « partez » par la salle');
  } finally {
    host.stop();
    guest.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('application : le fichier « partez » posé au signal, la table sans relevé prête à l’écran, l’attente avant la bande', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
  const front = read('app', 'src', 'frontend.ts');
  // Prête seulement table à l'écran ; la carte de l'attente chargée d'avance, dès le lancement de VPX (borne lente du 31/10/2026).
  assert.match(front, /if \(onScreen && \(st\?\.ready \|\| st\?\.started\)\) hooks\.gate\?\.ready\(\);/);
  assert.match(front, /onScreen = true;\r?\n\s+if \(liveManual\) hooks\.gate\?\.ready\(\);/);
  assert.match(front, /if \(hooks\.gate\) gameNotices\.prepareWait\(liveGames\.waitView\(\{ manual: liveManual \}\)\);/);
  // « Partez ! » lisible LIVE_GO_SHOW_MS après son apparition réelle, pas après l'heure du signal ; le journal mesure ce qui a été vu.
  const notice = read('app', 'src', 'game-notice.ts');
  assert.match(notice, /waitSeen\.partez !== undefined \? waitSeen\.partez \+ LIVE_GO_SHOW_MS - Date\.now\(\)/);
  assert.match(notice, /if \(waitView\.go\) waitSeen\.partez \?\?= now;/);
  assert.match(notice, /Départ commun : carte montrée \$\{/);
  assert.match(notice, /if \(waitView\) endWait\(\);/);
  assert.match(front, /if \(goneAt === undefined && \(!hooks\.gate \|\| hooks\.gate\.go\(\)\)\) \{\r?\n\s+goneAt = Date\.now\(\);\r?\n\s+double\.go\(\);/);
  assert.match(front, /if \(liveManual\) hooks\.gate\?\.ready\(\);/);
  assert.match(front, /gameNotices\.wait\(wait\);\r?\n\s+gameNotices\.board\(!wait && /);
  const doubles = read('app', 'src', 'table-double.ts');
  assert.match(doubles, /const goFile = path\.join\(plan\.dir, 'cyberpinball-partez\.txt'\);/);
  assert.match(doubles, /liveStateHook\(script, readVpxElements\(plan\.file\), stateFile, rom\?\.memory, offered, goFile\)/);
  const menu = read('app', 'src', 'live-game-menu.ts');
  assert.match(menu, /const wait = game\.phase === 'playing' \? \(games\.waitView\(\) \?\? liveWaitView\(game, myKey\(\), now\(\)\)\) : undefined;/);
  const page = read('app', 'renderer', 'game-notice.js');
  assert.match(page, /if \(view\?\.mode === 'wait'\) \{/);
});
