// Présence publique (livepresence.ts) : le signal est signé et refusé si on le
// change, trop vieux ou daté du futur ; le plus récent l'emporte et seul le nouveau se relaie ; la
// liste « Joueurs en ligne » range amis, mon pays, ailleurs, et filtre ; puis, entre trois bornes qui
// ne sont pas amies (app/src/social-net.ts, réseau d'essai en 127.0.0.1), le signal de l'une arrive
// chez l'autre, relayé au besoin, « en partie » se voit sans la table, et l'option le coupe.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  LIVE_FRESH_MS,
  liveNow,
  liveSample,
  mergeBeacons,
  onlineCounts,
  onlineGroups,
  signBeacon,
  verifyBeacon,
  type LiveBeacon,
  type LiveBoard,
  type OnlinePlayer,
} from '../livepresence';
import { newSocialState, setName, type SocialState } from '../social';

const T0 = new Date('2026-11-12T21:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const player = (name: string): SocialState => setName(newSocialState(T0), name)!;

test('le signal est signé : changé, trop vieux ou du futur, il est refusé', () => {
  const kiko = player('Kiko');
  const b = signBeacon(kiko, { status: 'playing', country: 'FR' }, T0);
  assert.deepEqual(verifyBeacon(JSON.parse(JSON.stringify(b)), at(1000)), b);
  assert.equal(verifyBeacon({ ...b, status: 'online' }, at(1000)), undefined, 'statut changé');
  assert.equal(verifyBeacon({ ...b, country: 'BE' }, at(1000)), undefined, 'pays changé');
  assert.equal(verifyBeacon({ ...b, name: 'Kiko2' }, at(1000)), undefined, 'nom changé');
  assert.equal(verifyBeacon(b, at(LIVE_FRESH_MS + 1000)), undefined, 'trop vieux');
  assert.equal(verifyBeacon(signBeacon(kiko, { status: 'online' }, at(5 * 60_000)), T0), undefined, 'du futur');
  assert.equal(verifyBeacon({ ...b, table: 'Comet Chaser' }, at(1000))?.status, 'playing', 'un champ de plus est ignoré, jamais gardé');
  assert.equal('table' in verifyBeacon({ ...b, table: 'Comet Chaser' }, at(1000))!, false);
});

test('le plus récent l’emporte, seul le nouveau se relaie, le vieux s’efface', () => {
  const me = player('Sillage');
  const kiko = player('Kiko');
  const nova = player('Nova');
  const board: LiveBoard = new Map();
  const k1 = signBeacon(kiko, { status: 'online' }, T0);
  const k2 = signBeacon(kiko, { status: 'playing' }, at(120_000));
  assert.deepEqual(mergeBeacons(board, [k1], me.key.publicKey, T0), [k1]);
  assert.deepEqual(mergeBeacons(board, [k1], me.key.publicKey, T0), [], 'déjà connu : pas de relais');
  assert.deepEqual(mergeBeacons(board, [k2], me.key.publicKey, at(120_000)), [k2]);
  assert.deepEqual(mergeBeacons(board, [k1], me.key.publicKey, at(120_000)), [], 'plus ancien : laissé');
  assert.equal(board.get(kiko.key.publicKey)!.status, 'playing');
  // Le mien ne s'écrit jamais ici.
  assert.deepEqual(mergeBeacons(board, [signBeacon(me, { status: 'online' }, T0)], me.key.publicKey, T0), []);
  const n = signBeacon(nova, { status: 'online' }, at(200_000));
  mergeBeacons(board, [n], me.key.publicKey, at(200_000));
  assert.deepEqual(liveNow(board, at(200_000)).map((b) => b.name), ['Nova', 'Kiko']);
  // Cinq minutes après son dernier signal, Kiko n'est plus en ligne.
  assert.deepEqual(liveNow(board, at(120_000 + LIVE_FRESH_MS + 1)).map((b) => b.name), ['Nova']);
  const own = signBeacon(me, { status: 'online' }, at(200_000));
  assert.equal(liveSample(board, own, at(200_000))[0], own, 'mon signal en tête du bonjour');
  assert.equal(liveSample(board, undefined, at(200_000)).length, 2, 'sans le mien quand il est coupé');
});

test('Joueurs en ligne : amis, mon pays, ailleurs ; en partie d’abord ; filtres', () => {
  const p = (name: string, o: Partial<OnlinePlayer> = {}): OnlinePlayer => ({ key: name, name, status: 'online', friend: false, ...o });
  const players = [
    p('Zed', { country: 'DE', commonTables: 2 }),
    p('Rivet', { country: 'FR', friend: true, status: 'playing' }),
    p('Nova', { country: 'FR', friend: true }),
    p('Mika', { country: 'BE', friend: true, nearby: true }),
    p('Kiko', { country: 'FR', commonTables: 6 }),
    p('Ressort', { country: 'FR', status: 'playing', commonTables: 2 }),
    p('Vortex', { country: 'BE', status: 'playing' }),
    p('Inconnu'),
  ];
  const names = (filter: Parameters<typeof onlineGroups>[2]) => onlineGroups(players, 'FR', filter).map((g) => `${g.id}: ${g.players.map((x) => x.name).join(', ')}`);
  assert.deepEqual(names('all'), ['friends: Rivet, Mika, Nova', 'country: Ressort, Kiko', 'elsewhere: Vortex, Inconnu, Zed']);
  assert.deepEqual(names('country'), ['friends: Rivet, Nova', 'country: Ressort, Kiko']);
  assert.deepEqual(names('nearby'), ['nearby: Mika']);
  assert.deepEqual(names('tables'), ['tables: Kiko, Ressort, Zed']);
  assert.deepEqual(onlineCounts(players, 'FR'), { all: 8, country: 4, nearby: 1, tables: 3 });
  // Pays inconnu : pas de groupe « mon pays », tout le monde ailleurs.
  assert.deepEqual(onlineGroups(players, undefined, 'all').map((g) => g.id), ['friends', 'elsewhere']);
  assert.deepEqual(onlineGroups([], 'FR', 'all'), [], 'aucun groupe vide');
});

test('Joueurs en ligne : tous les joueurs connus, ceux en ligne d’abord, puis hors ligne (amis, puis le plus récemment vu)', () => {
  // 13/11/2026 : il y a encore peu de monde en ligne ; la liste montre aussi ceux qui ne le sont pas.
  const p = (name: string, o: Partial<OnlinePlayer> = {}): OnlinePlayer => ({ key: name, name, status: 'online', friend: false, ...o });
  const players = [
    p('Ancien', { country: 'FR', status: 'offline', seen: '2026-11-01T20:00:00Z', commonTables: 4 }),
    p('Recent', { country: 'BE', status: 'offline', seen: '2026-11-12T20:00:00Z' }),
    p('Copain', { country: 'FR', status: 'offline', friend: true, seen: '2026-10-01T20:00:00Z' }),
    p('Kiko', { country: 'FR', commonTables: 1 }),
    p('Vortex', { country: 'BE', status: 'playing' }),
    p('Nova', { country: 'FR', friend: true }),
  ];
  const names = (filter: Parameters<typeof onlineGroups>[2]) => onlineGroups(players, 'FR', filter).map((g) => `${g.id}: ${g.players.map((x) => x.name).join(', ')}`);
  // En ligne d'abord (amis, mon pays, ailleurs), puis hors ligne : mon ami, puis le plus récemment vu.
  assert.deepEqual(names('all'), ['friends: Nova', 'country: Kiko', 'elsewhere: Vortex', 'offline: Copain, Recent, Ancien']);
  assert.deepEqual(names('country'), ['friends: Nova', 'country: Kiko', 'offline: Copain, Ancien']);
  // Mêmes tables : en ligne d'abord, même avec moins de tables en commun.
  assert.deepEqual(names('tables'), ['tables: Kiko, Ancien']);
  assert.deepEqual(onlineCounts(players, 'FR'), { all: 6, country: 4, nearby: 0, tables: 2 });
});

interface Net {
  state(): SocialState;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  setCountry(code: string | undefined): void;
  setPresence(p: { status: string; since: string; table?: object }): void;
  setPublicPresence(on: boolean): void;
  livePlayers(): LiveBeacon[];
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

test('entre bornes qui ne sont pas amies : « en ligne » arrive, « en partie » sans la table, l’option le coupe', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = [0, 1].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-enligne-${i}-`)));
  const a = netModule.createSocialNet({ dataDir: dirs[0], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap });
  const b = netModule.createSocialNet({ dataDir: dirs[1], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap });
  try {
    a.rename('Kiko');
    a.setCountry('FR');
    b.rename('Sillage');
    await Promise.all([a.start(), b.start()]);
    const A = a.state().key.publicKey;
    const seen = () => b.livePlayers().find((p) => p.key === A);
    await until('Kiko en ligne chez Sillage', () => !!seen());
    assert.equal(b.state().friends.length, 0, 'pas amis');
    assert.equal(seen()!.status, 'online');
    assert.equal(seen()!.country, 'FR');
    // En partie : annoncé tout de suite, jamais la table.
    a.setPresence({ status: 'playing', since: new Date().toISOString(), table: { title: 'Comet Chaser' } });
    await until('Kiko en partie chez Sillage', () => seen()?.status === 'playing');
    assert.equal(JSON.stringify(seen()).includes('Comet'), false, 'la table reste entre amis');
    // Coupée chez Kiko : son prochain signal ne part plus (le dernier vaut encore cinq minutes au plus).
    a.setPublicPresence(false);
    assert.equal(a.state().publicPresence, false);
    a.setPresence({ status: 'menu', since: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(seen()?.status, 'playing', 'aucun nouveau signal');
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await testnet.destroy();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});
