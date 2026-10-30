// Version des bornes dans une partie entre amis (essai réel du 30/10/2026) : le bureau, resté en
// 0.1.5-essai.10, ne démarrait pas seul et n'envoyait pas son score ; rien ne le disait, on aurait
// cru un bug. Chaque borne annonce maintenant ce qu'elle sait faire (LIVE_PROTOCOL) et sa version à
// l'invitation et à la réponse ; une borne en retard se voit dans le salon, l'invitation et la bande.
// Les résultats donnent le rang dans la partie, jamais la place au tableau de la table.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { answerGame, LIVE_PROTOCOL, liveBehind, liveBehindLabel, liveBoardView, liveInvite, newLiveGame, parseLiveMessage, type LiveGame, type LiveMessage } from '../index';

const ID = '0123456789abcdef';

test('annonce : protocole et version voyagent avec l’invitation, la réponse et le salon, vérifiés', () => {
  const invite = parseLiveMessage({ t: 'game-invite', game: { id: ID, title: 'GoT', players: [], table: { table: { title: 'GoT' }, print: 'a'.repeat(64) }, proto: LIVE_PROTOCOL, app: '0.1.5-essai.13' } }) as Extract<LiveMessage, { t: 'game-invite' }>;
  assert.deepEqual([invite.game.proto, invite.game.app], [LIVE_PROTOCOL, '0.1.5-essai.13']);
  assert.deepEqual(liveInvite(invite, { key: 'h', name: 'Alexis' }).host, { key: 'h', name: 'Alexis', proto: LIVE_PROTOCOL, app: '0.1.5-essai.13' });
  const answer = parseLiveMessage({ t: 'game-answer', game: ID, answer: 'accept', match: 'same', proto: 2, app: '0.1.5-essai.10' }) as Extract<LiveMessage, { t: 'game-answer' }>;
  assert.deepEqual([answer.proto, answer.app], [2, '0.1.5-essai.10']);
  for (const [proto, app] of [[0, 'x'], [1.5, '1.0'], ['3', '<script>']] as const) {
    const bad = parseLiveMessage({ t: 'game-answer', game: ID, answer: 'accept', proto, app }) as Extract<LiveMessage, { t: 'game-answer' }>;
    assert.deepEqual([bad.proto, bad.app], [undefined, undefined]);
  }
  let game = newLiveGame({ key: 'h', name: 'Alexis', proto: LIVE_PROTOCOL, app: '0.1.5-essai.13' }, { table: { title: 'GoT' } }, 'GoT');
  game = { ...game, players: [...game.players, { key: 'b', name: 'Bruno', state: 'invited' }] };
  game = answerGame(game, 'b', 'accept', 'same', undefined, { proto: answer.proto!, app: answer.app! });
  assert.deepEqual(game.players.map((p) => [p.proto, p.app]), [[LIVE_PROTOCOL, '0.1.5-essai.13'], [2, '0.1.5-essai.10']]);
  const room = parseLiveMessage(JSON.parse(JSON.stringify({ t: 'game-room', game: ID, phase: 'gathering', players: game.players.map((p, i) => ({ ...p, key: (i ? 'b' : 'a').repeat(64) })) })) as Record<string, unknown>);
  assert.ok(room, 'le salon reste lisible');
});

test('en retard : avant le relevé en direct, ou sans annonce (une borne d’avant le 30/10/2026)', () => {
  assert.ok(liveBehind({}));
  assert.ok(liveBehind({ proto: 2 }));
  assert.ok(!liveBehind({ proto: LIVE_PROTOCOL }));
  assert.equal(liveBehindLabel({ app: '0.1.5-essai.10' }), 'Cyber Pinball 0.1.5-essai.10 sur sa borne : ni départ automatique ni score en direct, à mettre à jour');
  assert.match(liveBehindLabel({}), /^Ancienne version de Cyber Pinball/);
  const game: LiveGame = {
    id: ID,
    host: 'h',
    table: { table: { title: 'GoT' } },
    title: 'GoT',
    players: [
      { key: 'h', name: 'Alexis', state: 'playing', host: true, proto: LIVE_PROTOCOL, score: 148_030, ball: 2 },
      { key: 'b', name: 'Bruno', state: 'playing', settings: 'ok', proto: 2 },
    ],
    phase: 'playing',
    createdAt: '2026-10-30T20:00:00.000Z',
  };
  const rows = liveBoardView(game, 'h')!.rows;
  assert.equal(rows.find((r) => r.name === 'Bruno')!.detail, 'Ancienne version : pas de score en direct');
  // Vue de Bruno (s'il était à jour), l'hôte en retard : son score ne viendra pas.
  const hostBehind = { ...game, players: [{ ...game.players[0]!, proto: undefined, score: undefined, ball: undefined }, { ...game.players[1]!, proto: LIVE_PROTOCOL }] };
  assert.equal(liveBoardView(hostBehind, 'b')!.rows.find((r) => r.name === 'Alexis')!.detail, 'Ancienne version : pas de score en direct');
});

test('application : la version annoncée ; le salon, l’invitation et les résultats le disent ; plus de « place du tableau »', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /appVersion: app\.getVersion\(\),/);
  const service = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'live-game.ts'), 'utf8');
  assert.match(service, /\{ t: 'game-invite', game: \{ id: next\.id, table: next\.table, title: next\.title, players, \.\.\.version \} \}/);
  assert.match(service, /answer: 'accept', match: found\.match, \.\.\.\(found\.balls \? \{ balls: found\.balls \} : \{\}\), \.\.\.version \}/);
  const menu = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'live-game-menu.ts'), 'utf8');
  assert.match(menu, /liveBehind\(invite\.host\) \? \[\{ text: t\('Ancienne version chez \{name\}'/);
  assert.match(menu, /detail: behind \? `\$\{state\} · \$\{liveBehindLabel\(p\)\}` : state,/);
  assert.doesNotMatch(menu, /place \{rank\} du tableau/);
  assert.match(menu, /const score = liveScore\(p\);/);
});
