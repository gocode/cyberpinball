// Profil public et « J'aime » (publicprofile.ts) : la carte ne montre que records et badges
// récents, elle est signée et refusée si on la change ; la plus récente l'emporte ; un « J'aime »
// par joueur et par évènement, retirable, compté sur la carte de l'auteur ; limites et masquage ;
// puis, entre deux bornes qui ne sont pas amies (app/src/social-net.ts, réseau d'essai en 127.0.0.1),
// la carte arrive, le « J'aime » revient compté, l'auteur seul voit qui a aimé.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  emptyProfiles,
  giveLike,
  likersOf,
  LIKES_PER_KEY_DAY,
  loadProfiles,
  makeCard,
  mergeCards,
  pendingLikes,
  publicEvents,
  PUBLIC_EVENTS_DAYS,
  receiveLike,
  saveProfiles,
  setHidden,
  signLike,
  verifyCard,
  verifyLike,
  type Like,
  type PublicCard,
} from '../publicprofile';
import { addEvent, newSocialState, setName, type SocialState } from '../social';

const T0 = new Date('2026-11-11T20:00:00Z');
const table = { title: 'Comet Chaser', manufacturer: 'Halcyon', year: 1987 };

function player(name: string): SocialState {
  let s = setName(newSocialState(T0), name)!;
  s = addEvent(s, { kind: 'record', table, score: 14_210_500, rank: 1, initials: 'VOR' }, new Date(T0.getTime() - 3600_000)).state;
  s = addEvent(s, { kind: 'played', table, seconds: 300 }, new Date(T0.getTime() - 1800_000)).state;
  s = addEvent(s, { kind: 'badge', badge: 'five-champion' }, new Date(T0.getTime() - 60_000)).state;
  // Un record trop ancien : hors de la carte.
  s = addEvent(s, { kind: 'record', table, score: 1_000, rank: 3 }, new Date(T0.getTime() - (PUBLIC_EVENTS_DAYS + 1) * 86_400_000)).state;
  return { ...s, badges: [{ id: 'five-champion', at: T0.toISOString() }] };
}

test('carte publique : records et badges récents seulement, signée, refusée si on la change', () => {
  const vortex = player('Vortex');
  const events = publicEvents(vortex.events, T0);
  assert.deepEqual(events.map((e) => e.kind), ['badge', 'record'], 'pas de partie jouée, pas de record trop ancien');
  const card = makeCard(vortex, emptyProfiles(), { country: 'BE', records: 7 }, T0);
  assert.deepEqual(verifyCard(card, T0), card);
  assert.equal(verifyCard({ ...card, records: 8 }, T0), undefined);
  assert.equal(verifyCard({ ...card, name: 'Autre' }, T0), undefined);
  assert.equal(verifyCard({ ...card, at: new Date(T0.getTime() + 3600_000).toISOString() }, T0), undefined, 'carte du futur');
});

test('cartes reçues : la plus récente l’emporte, la mienne n’entre pas, les nouvelles sont à relayer', () => {
  const vortex = player('Vortex');
  const me = player('Sillage');
  const old = makeCard(vortex, emptyProfiles(), { records: 1 }, new Date(T0.getTime() - 60_000));
  const recent = makeCard(vortex, emptyProfiles(), { records: 2 }, T0);
  let r = mergeCards(emptyProfiles(), [recent], me.key.publicKey, T0);
  assert.equal(r.fresh.length, 1);
  r = mergeCards(r.store, [old], me.key.publicKey, T0);
  assert.equal(r.fresh.length, 0);
  assert.equal(r.store.cards[0]!.records, 2);
  const mine = makeCard(me, emptyProfiles(), { records: 0 }, T0);
  assert.equal(mergeCards(r.store, [mine], me.key.publicKey, T0).fresh.length, 0);
});

test('« J’aime » : un par joueur et par évènement, retirable, compté sur ma carte, masqué ou au-delà de la limite : refusé', () => {
  const me = player('Sillage');
  const fan = player('Kiko');
  const event = publicEvents(me.events, T0)[1]!.id;
  const like = signLike(fan.key, fan.name, me.key.publicKey, event, true, T0);
  assert.deepEqual(verifyLike(like, T0), like);
  assert.equal(verifyLike({ ...like, event: 'autre' }, T0), undefined);
  let s = emptyProfiles();
  let r = receiveLike(s, like, me.key.publicKey, T0);
  assert.equal(r.news, true);
  s = r.store;
  assert.equal(receiveLike(s, like, me.key.publicKey, T0).news, false, 'doublon');
  assert.equal(makeCard(me, s, { records: 0 }, T0).likes[event], 1);
  assert.deepEqual(likersOf(s, event).map((l) => l.name), ['Kiko']);
  // Retiré : plus compté, pas annoncé.
  r = receiveLike(s, signLike(fan.key, fan.name, me.key.publicKey, event, false, new Date(T0.getTime() + 1000)), me.key.publicKey, T0);
  assert.equal(r.news, false);
  assert.equal(makeCard(me, r.store, { records: 0 }, T0).likes[event], undefined);
  // Masqué : ignoré.
  assert.equal(receiveLike(setHidden(emptyProfiles(), fan.key.publicKey, true), like, me.key.publicKey, T0).news, false);
  // Au-delà de la limite du jour, d'une même clé.
  let flood = emptyProfiles();
  for (let i = 0; i < LIKES_PER_KEY_DAY + 5; i++) flood = receiveLike(flood, signLike(fan.key, fan.name, me.key.publicKey, `e${i}`, true, T0), me.key.publicKey, T0).store;
  assert.equal(flood.received.length, LIKES_PER_KEY_DAY);
});

test('mes « J’aime » : le dernier par évènement, en attente jusqu’à la remise ; fichier relu tel quel', () => {
  const me = player('Sillage');
  const vortex = player('Vortex');
  let s = giveLike(emptyProfiles(), signLike(me.key, me.name, vortex.key.publicKey, 'e1', true, T0));
  s = giveLike(s, signLike(me.key, me.name, vortex.key.publicKey, 'e1', false, new Date(T0.getTime() + 1000)));
  assert.equal(pendingLikes(s, vortex.key.publicKey).length, 1);
  assert.equal(pendingLikes(s, vortex.key.publicKey)[0]!.on, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-profils-'));
  try {
    const card = makeCard(vortex, emptyProfiles(), { records: 1 }, T0);
    s = mergeCards(s, [card], me.key.publicKey, T0).store;
    saveProfiles(dir, s);
    assert.deepEqual(loadProfiles(dir, T0), s);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

interface Net {
  state(): SocialState;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  publish(event: object): void;
  publicCard(key: string): PublicCard | undefined;
  like(key: string, event: string, on: boolean): void;
  likers(event: string): Like[];
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(REPO_ROOT, 'app', 'dist', 'social-net.js')) as { createSocialNet(o: object): Net };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

async function until(what: string, check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('entre deux bornes qui ne sont pas amies : la carte arrive, le « J’aime » revient compté, l’auteur seul voit qui', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = [0, 1].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-profil-${i}-`)));
  const liked: Like[] = [];
  const a = netModule.createSocialNet({ dataDir: dirs[0], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, onLike: (l: Like[]) => liked.push(...l) });
  const b = netModule.createSocialNet({ dataDir: dirs[1], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap });
  try {
    a.rename('Vortex');
    b.rename('Sillage');
    a.publish({ kind: 'record', table, score: 14_210_500, rank: 1, initials: 'VOR' });
    await Promise.all([a.start(), b.start()]);
    const A = a.state().key.publicKey;
    await until('carte de Vortex chez Sillage', () => (b.publicCard(A)?.events.length ?? 0) > 0);
    assert.equal(b.state().friends.length, 0, 'pas amis');
    const event = b.publicCard(A)!.events[0]!.id;
    b.like(A, event, true);
    await until('« J’aime » reçu', () => a.likers(event).length === 1);
    assert.equal(a.likers(event)[0]!.name, 'Sillage');
    assert.equal(liked.length, 1, 'annoncé une fois');
    await until('compté sur la carte de Vortex chez Sillage', () => b.publicCard(A)?.likes[event] === 1);
    // Retiré : le compte retombe.
    b.like(A, event, false);
    await until('« J’aime » retiré', () => a.likers(event).length === 0);
    await until('compte remis à zéro chez Sillage', () => b.publicCard(A)?.likes[event] === undefined);
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await testnet.destroy();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});
