// Nombre de billes par partie (29/10/2026) : 5 billes contre 3, les scores ne se comparent pas.
// Personne n'est refusé : le score passe hors classement. Le nombre se lit dans la ROM (carte de
// Pinball Memory Maps et .nv), le script (« Const BallsPerGame = 3 ») ou le menu de service de VPW
// (VPReg.stg) ; jamais deviné : inconnu, il ne juge rien.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  answerGame,
  guestGame,
  liveRanked,
  liveStandings,
  loadRomMemory,
  newLiveGame,
  parseLiveMessage,
  romBallsPerGame,
  scriptBallSetting,
  tableBallCount,
  type LiveInvite,
  type LiveMessage,
  type LivePlayer,
  type LiveTable,
  type RomMemory,
  type TableEntry,
} from '../index';

test('script : la valeur écrite hors des procédures, jamais dans une procédure ni un commentaire', () => {
  assert.equal(scriptBallSetting('Const BallsPerGame = 5   \' usually 3 or 5').balls, 5);
  assert.equal(scriptBallSetting('Dim BallsPerGame : BallsPerGame = 3').balls, 3);
  assert.equal(scriptBallSetting('Public gsBallsPerGame = 4').balls, 4);
  assert.equal(scriptBallSetting("' Const BallsPerGame = 5").balls, undefined);
  assert.equal(scriptBallSetting('Sub Reset\r\n  BallsPerGame = 1\r\nEnd Sub').balls, undefined);
  assert.equal(scriptBallSetting('Const BallsPerGame = 0').balls, undefined, 'hors de 1 à 10 : rien');
  assert.equal(scriptBallSetting('BallsPerGame = DMDStd(kDMDStd_BallsPerGame)').balls, undefined);
});

/** Le menu de service de Game of Thrones (VPW), relevé le 29/10/2026. */
const GOT = [
  'Dim BallsPerGame',
  "Const kDMDStd_BallsPerGame = &H3E       'â",
  'Sub DMDSettingsInit',
  '  DMDMenu(11).Setup "BALL  PER  GAME",                      kDMDStd_BallsPerGame,   3,     "INT[3:5]", 1',
  'End Sub',
  'BallsPerGame = DMDStd(kDMDStd_BallsPerGame)',
].join('\r\n');

const noRom = { nv: () => undefined, memory: async () => undefined };

test('menu de service de VPW : la valeur enregistrée dans VPReg.stg, sinon celle par défaut', async () => {
  assert.deepEqual(scriptBallSetting(GOT), { service: { key: 'DMDStd_62', fallback: 3 } });
  const saved = (v?: string) => new Map([['gameofthrones', new Map([['HighScore1', '1000'], ...(v === undefined ? [] : [['DMDStd_62', v] as [string, string]])])]]);
  assert.deepEqual(await tableBallCount({ roms: [], script: GOT, saved: saved('5'), ...noRom }), { balls: 5, source: 'service' });
  assert.deepEqual(await tableBallCount({ roms: [], script: GOT, saved: saved(''), ...noRom }), { balls: 3, source: 'service' });
  assert.deepEqual(await tableBallCount({ roms: [], script: GOT, ...noRom }), { balls: 3, source: 'service' });
  assert.deepEqual(await tableBallCount({ roms: [], script: 'Const BallsPerGame = 5', ...noRom }), { balls: 5, source: 'script' });
  assert.equal(await tableBallCount({ roms: [], script: 'Sub X : End Sub', ...noRom }), undefined, 'rien d’écrit : inconnu');
  // Une table à ROM : la ROM compte les points ; sans carte, inconnu, même si le script parle de billes.
  assert.equal(await tableBallCount({ roms: ['t2_l8'], script: 'Const BallsPerGame = 5', ...noRom }), undefined);
});

/** Carte de T2 (pinball-memory-maps, maps/williams/wpc/t2_l8.map.json), réduite à ce qui sert. */
const T2: RomMemory = {
  map: {
    _metadata: { platform: 'williams-wpc-8K' },
    adjustments: { 'A.1 Standard Adjustments': { '01': { label: 'Balls Per Game', start: 6943, encoding: 'int', length: 2, default: 3 }, '02': { label: 'Tilt Warnings', start: 6945, encoding: 'int', length: 2 } } },
  },
  platform: { endian: 'big', memory_layout: [{ type: 'nvram', address: '0x0000', size: '0x2000' }, { type: 'rom', address: '0x8000', size: '0x8000' }] },
};

function nvWith(offset: number, bytes: number[], size = 8238): Buffer {
  const nv = Buffer.alloc(size);
  Buffer.from(bytes).copy(nv, offset);
  return nv;
}

test('ROM : « Balls Per Game » lu dans le .nv d’après la carte ; sans .nv, le réglage d’usine', () => {
  assert.equal(romBallsPerGame(T2, nvWith(6943, [0, 5])), 5);
  assert.equal(romBallsPerGame(T2, undefined), 3, 'la table n’a pas encore tourné : la ROM part de son défaut');
  assert.equal(romBallsPerGame(T2, nvWith(6943, [0, 0])), undefined, '0 bille : illisible, pas inventé');
  assert.equal(romBallsPerGame(T2, Buffer.alloc(100)), undefined, '.nv trop court');
  const bcd = { ...T2, map: { ...T2.map, adjustments: { A: { '01': { label: 'Balls/Game', start: 0x10, encoding: 'bcd', length: 1 } } } } };
  assert.equal(romBallsPerGame(bcd, nvWith(0x10, [0x05])), 5);
  const little = { map: { adjustments: { A: { '01': { label: 'balls per game', start: '0x02100004', encoding: 'int', length: 2 } } } }, platform: { endian: 'little', memory_layout: [{ type: 'nvram', address: '0x02100000', size: '0x20000' }] } };
  assert.equal(romBallsPerGame(little, nvWith(4, [3, 0], 0x20000)), 3);
  const nibble = { ...T2, platform: { memory_layout: [{ type: 'nvram', address: 0, size: 0x2000, nibble: 'low' }] } };
  assert.equal(romBallsPerGame(nibble, nvWith(6943, [0, 5])), undefined, 'mémoire en demi-octets : pas lue');
  assert.equal(romBallsPerGame({ ...T2, map: { adjustments: {} } }, nvWith(6943, [0, 5])), undefined, 'carte sans ce réglage (Stern SAM)');
});

test('cartes : index, carte et plateforme téléchargés une fois, puis lus du cache ; sans réseau, le cache ; rien d’autre', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cartes-'));
  const files: Record<string, unknown> = {
    'index.json': { _note: 'x', t2_l8: 'maps/williams/wpc/t2_l8.map.json', evil: 'maps/../../secret.json' },
    'maps/williams/wpc/t2_l8.map.json': T2.map,
    'platforms/williams-wpc-8K.json': T2.platform,
  };
  const asked: string[] = [];
  let online = true;
  const fake = (async (url: string) => {
    asked.push(url);
    if (!online) throw new Error('hors ligne');
    const rel = url.replace('https://raw.githubusercontent.com/tomlogic/pinball-memory-maps/main/', '');
    return rel in files ? new Response(JSON.stringify(files[rel])) : new Response('404', { status: 404 });
  }) as typeof fetch;
  const memory = await loadRomMemory(dir, 'T2_L8', { fetch: fake });
  assert.deepEqual(memory, T2);
  assert.equal(asked.length, 3);
  assert.deepEqual(await loadRomMemory(dir, 't2_l8', { fetch: fake }), T2);
  assert.equal(asked.length, 3, 'tout vient du cache');
  assert.equal(await loadRomMemory(dir, 'evil', { fetch: fake }), undefined, 'un chemin qui sort du projet : refusé');
  assert.equal(await loadRomMemory(dir, '../x', { fetch: fake }), undefined);
  assert.equal(await loadRomMemory(dir, 'inconnue', { fetch: fake }), undefined);
  // Un mois plus tard, hors ligne : le cache sert encore.
  online = false;
  assert.deepEqual(await loadRomMemory(dir, 't2_l8', { fetch: fake, now: new Date(Date.now() + 40 * 24 * 3600_000) }), T2);
});

test('partie : les billes voyagent, et 5 contre 3 passe hors classement, même pour la même table', () => {
  const table: LiveTable = { table: { title: 'Terminator 2' }, balls: 3 };
  const parsed = parseLiveMessage({ t: 'game-invite', game: { id: '0123456789abcdef', title: 'T2', players: [], table } }) as Extract<LiveMessage, { t: 'game-invite' }>;
  assert.equal(parsed.game.table.balls, 3);
  assert.equal((parseLiveMessage({ t: 'game-answer', game: '0123456789abcdef', answer: 'accept', match: 'same', balls: 5 }) as { balls?: number }).balls, 5);
  for (const balls of [0, 11, 2.5, '5']) assert.equal((parseLiveMessage({ t: 'game-answer', game: '0123456789abcdef', answer: 'accept', balls }) as { balls?: number }).balls, undefined, String(balls));
  let game = newLiveGame({ key: 'hote', name: 'Alice' }, table, 'T2');
  assert.equal(game.players[0]!.balls, 3);
  game = { ...game, players: [...game.players, { key: 'bruno', name: 'Bruno', state: 'invited' }, { key: 'chloe', name: 'Chloé', state: 'invited' }] };
  game = answerGame(game, 'bruno', 'accept', 'same', 5);
  game = answerGame(game, 'chloe', 'accept', 'same', 3);
  assert.equal(game.players[1]!.balls, 5);
  assert.ok(!liveRanked(game.players[1]!, 3), '5 billes contre 3');
  assert.ok(liveRanked(game.players[2]!, 3));
  assert.ok(liveRanked({ balls: 5 }, undefined), 'inconnu chez l’hôte : rien à juger');
  assert.ok(liveRanked({}, 3), 'inconnu chez l’invité : rien à juger');
  const done = (p: LivePlayer, score: number): LivePlayer => ({ ...p, state: 'done', records: [{ score, rank: 1 }] });
  const order = liveStandings({ table, players: [done(game.players[0]!, 1_000), done(game.players[1]!, 9_000), done(game.players[2]!, 2_000)] }).map((p) => p.name);
  assert.deepEqual(order, ['Chloé', 'Alice', 'Bruno']);
  const invite: LiveInvite = { id: '0123456789abcdef', host: { key: 'hote', name: 'Alice' }, table, title: 'T2', players: [], receivedAt: new Date().toISOString() };
  assert.deepEqual(guestGame(invite, { key: 'bruno', name: 'Bruno' }, 'same', 5).players.map((p) => p.balls), [3, 5]);
});

// ---------------------------------------------------------------------------
// Service (app/src/live-game.ts, compilé)

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { create(table: TableEntry): Promise<{ table: LiveTable }>; invites(): LiveInvite[]; accept(id: string): Promise<{ match: string; balls?: number }>; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('service : l’invitation dit 3 billes, l’invité répond 5, le journal le note', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-billes-'));
  const make = (name: string) => {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, 'T2.vpx'), 'table');
    return { file: path.join(root, name, 'T2.vpx'), folder: path.join(root, name), title: 'Terminator 2', manufacturer: 'Williams', year: 1991, info: {} } as unknown as TableEntry;
  };
  const hostTable = make('hote');
  const guestTable = make('invite');
  const host = createLiveGames({ net: { state: () => ({ key: { publicKey: 'hote' }, name: 'Alice', friends: [] }), online: () => true, send: () => true, onMessage: () => () => undefined }, dataDir: path.join(root, 'h'), tables: () => [hostTable], ballsOf: async () => 3, play: async () => undefined });
  const sent = (await host.create(hostTable)).table;
  host.stop();
  assert.equal(sent.balls, 3);
  let deliver: ((key: string, m: unknown) => void) | undefined;
  const out: LiveMessage[] = [];
  const lines: string[] = [];
  const guest = createLiveGames({
    net: { state: () => ({ key: { publicKey: 'bruno' }, name: 'Bruno', friends: [{ key: 'hote', name: 'Alice' }] }), online: () => true, send: (_k: string, m: LiveMessage) => (out.push(m), true), onMessage: (cb: typeof deliver) => ((deliver = cb), () => undefined) },
    dataDir: path.join(root, 'g'),
    tables: () => [guestTable],
    ballsOf: async () => 5,
    play: async () => undefined,
    log: (l: string) => lines.push(l),
  });
  try {
    deliver!('hote', { t: 'game-invite', game: { id: '0123456789abcdef', table: sent, title: 'Terminator 2 (Williams 1991)', players: [{ key: 'hote', name: 'Alice' }] } });
    const found = await guest.accept('0123456789abcdef');
    assert.equal(found.balls, 5);
    assert.deepEqual(out.at(-1), { t: 'game-answer', game: '0123456789abcdef', answer: 'accept', match: 'same', balls: 5 });
    assert.match(lines.join('\n'), /5 billes par partie ici, 3 chez lui : score hors classement/);
  } finally {
    guest.stop();
  }
});

test('application : le nombre de billes est calculé pour la partie en direct, ROM puis script', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /ballsOf: async \(table\) => \(await ballCounts\.of\(table\)\)\?\.balls,/);
  const counts = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'ball-count.ts'), 'utf8');
  assert.match(counts, /path\.join\(table\.folder, 'pinmame'\)/, 'le .nv à côté de la table d’abord');
});
