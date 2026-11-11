// Messagerie entre deux bornes amies (app/src/chat-service.ts, compilé) sur un réseau d'essai
// HyperDHT en 127.0.0.1 : un message part et revient « Reçu » ; écrit à un ami éteint, il attend et
// part à son retour ; une réaction arrive sans compter comme non lue ; une borne qui coupe sa
// messagerie le dit, et ce qu'on lui écrit attend qu'elle la rouvre ; un ami en sourdine n'annonce rien.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import type { ChatLine, ChatState } from '../chat';
import type { SocialState } from '../social';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

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
  state(): ChatState;
  send(key: string, text: string): boolean;
  react(key: string, target: string, kind: string | null): boolean;
  setEnabled(on: boolean): void;
  setMuted(key: string, muted: boolean): void;
  observe(): void;
  stop(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-chat-${name}-`));
  const net = netModule.createSocialNet({ dataDir, mode: 'simulated', host: '127.0.0.1', bootstrap, graceMs: 400, searchMs: 1000 });
  assert.equal(net.rename(name), true);
  const arrived: ChatLine[] = [];
  const chat = chatModule.createChatService({ net, dataDir, resendMs: 1000, onArrive: (_key: string, lines: ChatLine[]) => arrived.push(...lines) });
  return { net, chat, arrived, dataDir };
}
const keyOf = (n: Net) => n.state().key.publicKey;
const lines = (c: Chat, key: string) => c.state().conversations[key]?.lines ?? [];

test('messagerie entre deux amis : reçu, en attente puis remis, réaction, coupure, sourdine', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', testnet.bootstrap);
  const b = cabinet('Bruno', testnet.bootstrap);
  const A = keyOf(a.net), B = keyOf(b.net);
  // Le réseau des amis change : la messagerie le relève (dans l'application, socialChanged).
  const tick = setInterval(() => (a.chat.observe(), b.chat.observe()), 100);
  try {
    await Promise.all([a.net.start(), b.net.start()]);
    await until('Bruno dans l’annuaire', () => a.net.state().directory.some((d) => d.profile.name === 'Bruno'));
    // Pas encore amis : rien ne s'écrit.
    assert.equal(a.chat.send(B, 'Salut'), false);
    a.net.request({ key: B, name: 'Bruno' });
    await until('demande reçue', () => b.net.state().incoming.length === 1);
    b.net.accept(A);
    await until('amis et reliés', () => a.net.state().friends.length === 1 && b.net.state().friends.length === 1 && a.net.online(B) && b.net.online(A));

    // En ligne : part, arrive, revient « Reçu ».
    assert.equal(a.chat.send(B, 'On fait une partie ?'), true);
    await until('reçu par Bruno', () => lines(b.chat, A).some((l) => l.text === 'On fait une partie ?'));
    await until('accusé chez Alice', () => lines(a.chat, B)[0]?.delivery === 'received');
    assert.equal(b.chat.state().conversations[A]!.unread, 1);
    assert.equal(b.arrived.length, 1);
    await until('chacun sait que l’autre a la messagerie', () => a.chat.state().conversations[B]?.accepts === true && b.chat.state().conversations[A]?.accepts === true);

    // Réaction de Bruno : chez Alice, portée par le message, sans non-lu ni annonce.
    const target = lines(b.chat, A)[0]!.id;
    assert.equal(b.chat.react(A, target, 'revanche'), true);
    await until('réaction reçue', () => lines(a.chat, B).some((l) => l.react?.kind === 'revanche'));
    assert.equal(a.chat.state().conversations[B]!.unread, 0);
    assert.equal(a.arrived.length, 0);

    // Bruno s'éteint : le message attend, puis part à son retour.
    await b.net.stop();
    await until('Bruno hors ligne', () => !a.net.online(B));
    assert.equal(a.chat.send(B, 'Tu es là ?'), true);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(lines(a.chat, B).at(-1)?.delivery, 'pending');
    await b.net.start();
    await until('remis au retour', () => lines(b.chat, A).some((l) => l.text === 'Tu es là ?'), 30_000);
    await until('accusé après le retour', () => lines(a.chat, B).at(-1)?.delivery === 'received', 30_000);

    // Bruno coupe sa messagerie : Alice l'apprend ; son message attend qu'il la rouvre.
    b.chat.setEnabled(false);
    await until('Alice sait que Bruno n’accepte plus', () => a.chat.state().conversations[B]?.accepts === false);
    assert.equal(a.chat.send(B, 'Encore là ?'), true);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(lines(b.chat, A).some((l) => l.text === 'Encore là ?'), false);
    assert.equal(lines(a.chat, B).at(-1)?.delivery, 'pending');
    b.chat.setEnabled(true);
    await until('remis à la réouverture', () => lines(b.chat, A).some((l) => l.text === 'Encore là ?'));

    // Sourdine : gardé, sans annonce.
    const before = b.arrived.length;
    b.chat.setMuted(A, true);
    a.chat.send(B, 'Chut');
    await until('reçu en sourdine', () => lines(b.chat, A).some((l) => l.text === 'Chut'));
    assert.equal(b.arrived.length, before);
  } finally {
    clearInterval(tick);
    a.chat.stop();
    b.chat.stop();
    await Promise.all([a.net.stop(), b.net.stop()]);
    await testnet.destroy();
    for (const c of [a, b]) fs.rmSync(c.dataDir, { recursive: true, force: true });
  }
});
