// « En train d'écrire » (typing.ts, 17/11/2026) : l'envoi limité et toujours terminé, le tableau qui
// oublie seul, le signal signé des salons, les messages entre bornes et du téléphone ; puis, entre deux
// bornes amies sur un réseau d'essai, les points qui apparaissent et partent avec le message.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { createTypingBoard, createTypingSender, TYPING_FRESH_MS, TYPING_REFRESH_MS } from '../typing';
import { signRoomTyping, verifyRoomTyping } from '../rooms';
import { parseChatMessage } from '../chat';
import { parseGroupMessage } from '../groups';
import { parsePhoneMessage } from '../remote';
import { createPlayerKey } from '../sharing';
import type { SocialState } from '../social';

test('envoi : un signal toutes les 3 s au plus, « je n’écris plus » une seule fois', () => {
  let now = 0;
  const sent: boolean[] = [];
  const s = createTypingSender((on) => void sent.push(on), () => now);
  s.input(true);
  now += 500;
  s.input(true);
  assert.deepEqual(sent, [true]);
  now += TYPING_REFRESH_MS;
  s.input(true);
  assert.deepEqual(sent, [true, true]);
  s.input(false);
  s.stop();
  assert.deepEqual(sent, [true, true, false]);
  // Champ fermé sans avoir rien tapé : rien ne part.
  const quiet: boolean[] = [];
  createTypingSender((on) => void quiet.push(on)).stop();
  assert.deepEqual(quiet, []);
  // Envoi refusé (liaison pas prête) : la frappe suivante le redit tout de suite.
  let ready = false;
  const tries: boolean[] = [];
  const r = createTypingSender((on) => (tries.push(on), ready), () => now);
  r.input(true);
  ready = true;
  r.input(true);
  assert.deepEqual(tries, [true, true]);
  assert.equal(r.on, true);
});

test('tableau : qui écrit, dans l’ordre d’arrivée, oublié sans signal ou à l’arrivée de sa ligne', () => {
  let now = 1000;
  const board = createTypingBoard(() => undefined, () => now);
  try {
    assert.equal(board.note('salon', 'b', 'Bruno', true), true);
    now += 10;
    assert.equal(board.note('salon', 'a', 'Alice', true), true);
    assert.deepEqual(board.who('salon').map((x) => x.name), ['Bruno', 'Alice']);
    // Un signal redit ne change pas l'affichage, mais repousse l'oubli.
    assert.equal(board.note('salon', 'b', 'Bruno', true), false);
    assert.equal(board.clear('salon', 'a'), true);
    assert.deepEqual(board.who('salon').map((x) => x.name), ['Bruno']);
    now += TYPING_FRESH_MS + 1;
    assert.deepEqual(board.who('salon'), []);
    board.note('fil', 'b', '', true);
    assert.equal(board.note('fil', 'b', '', false), true);
    assert.deepEqual(board.who('fil'), []);
  } finally {
    board.stop();
  }
});

test('salon : signal signé, refusé s’il est modifié, périmé ou daté du futur', () => {
  const me = { key: createPlayerKey(), name: 'Sillage' };
  const at = new Date('2026-11-17T20:00:00Z');
  const sig = signRoomTyping(me, 'pays-FR', true, at);
  assert.deepEqual(verifyRoomTyping(JSON.parse(JSON.stringify(sig)), at), sig);
  assert.equal(verifyRoomTyping({ ...sig, on: false }, at), undefined);
  assert.equal(verifyRoomTyping({ ...sig, room: 'monde' }, at), undefined);
  assert.equal(verifyRoomTyping(sig, new Date(at.getTime() + TYPING_FRESH_MS + 1)), undefined);
  assert.equal(verifyRoomTyping(sig, new Date(at.getTime() - 5 * 60_000)), undefined);
});

test('messages : chat-typing, grp-typing et typing du téléphone lus, le reste écarté', () => {
  assert.deepEqual(parseChatMessage({ t: 'chat-typing', on: true }), { t: 'chat-typing', on: true });
  assert.equal(parseChatMessage({ t: 'chat-typing', on: 'oui' }), undefined);
  assert.deepEqual(parseGroupMessage({ t: 'grp-typing', g: '0123456789abcdef', on: false }), { t: 'grp-typing', g: '0123456789abcdef', on: false });
  assert.equal(parseGroupMessage({ t: 'grp-typing', g: 'pas-un-groupe', on: true }), undefined);
  const key = 'a'.repeat(64);
  assert.deepEqual(parsePhoneMessage({ t: 'typing', s: 3, key, on: true }), { t: 'typing', s: 3, key, on: true });
  assert.deepEqual(parsePhoneMessage({ t: 'typing', s: 3, on: false }), { t: 'typing', s: 3, on: false });
  assert.equal(parsePhoneMessage({ t: 'typing', s: 3, key: 'x', on: true }), undefined);
});

// ---------------------------------------------------------------------------
// Entre deux bornes amies (app/dist, compilé)

interface Net {
  state(): SocialState;
  online(key: string): boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  request(p: { key: string; name: string }): void;
  accept(key: string): void;
}
interface Chat {
  send(key: string, text: string): boolean;
  typing(key: string, active: boolean): void;
  typingOf(key: string): boolean;
  observe(): void;
  stop(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
const netModule = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): Net };
const chatModule = require(path.join(APP_DIST, 'chat-service.js')) as { createChatService(o: object): Chat };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

async function until(what: string, check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function cabinet(name: string, bootstrap: { host: string; port: number }[]) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-typing-${name}-`));
  const net = netModule.createSocialNet({ dataDir, mode: 'simulated', host: '127.0.0.1', bootstrap, graceMs: 400, searchMs: 1000 });
  assert.equal(net.rename(name), true);
  const chat = chatModule.createChatService({ net, dataDir, resendMs: 1000 });
  return { net, chat, dataDir };
}

test('entre amis : les points apparaissent pendant la frappe, partent avec le message ou le champ vidé', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', testnet.bootstrap);
  const b = cabinet('Bruno', testnet.bootstrap);
  const A = a.net.state().key.publicKey;
  const B = b.net.state().key.publicKey;
  const tick = setInterval(() => (a.chat.observe(), b.chat.observe()), 100);
  try {
    await Promise.all([a.net.start(), b.net.start()]);
    await until('Bruno dans l’annuaire', () => a.net.state().directory.some((d) => d.profile.name === 'Bruno'));
    a.net.request({ key: B, name: 'Bruno' });
    await until('demande reçue', () => b.net.state().incoming.length === 1);
    b.net.accept(A);
    await until('amis et reliés', () => a.net.online(B) && b.net.online(A));

    // Chaque frappe redit « j'écris » (au plus toutes les 3 s une fois parti).
    await until('Alice écrit, chez Bruno', () => (a.chat.typing(B, true), b.chat.typingOf(A)));
    assert.equal(a.chat.send(B, 'Partie ?'), true);
    await until('le message efface les points', () => !b.chat.typingOf(A));

    await until('Alice réécrit', () => (a.chat.typing(B, true), b.chat.typingOf(A)));
    a.chat.typing(B, false);
    await until('champ vidé : les points partent', () => !b.chat.typingOf(A));
  } finally {
    clearInterval(tick);
    a.chat.stop();
    b.chat.stop();
    await Promise.all([a.net.stop(), b.net.stop()]);
    await testnet.destroy();
    for (const c of [a, b]) fs.rmSync(c.dataDir, { recursive: true, force: true });
  }
});
