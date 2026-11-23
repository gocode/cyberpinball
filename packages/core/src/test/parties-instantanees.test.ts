// Parties en direct (instantgames.ts, demandées le 16/11/2026) : « un utilisateur hôte ouvre une
// partie multijoueur instantanée, choisit le nombre maximum de joueurs et cela s'affiche dans la
// communauté, où n'importe qui peut aller la rejoindre. Dès que le nombre maximum est atteint, ça
// démarre automatiquement pour tout le monde. »
//
// Les invariants : l'annonce est signée (changée, trop vieille ou du futur, elle est refusée) ; une
// partie complète, fermée, la mienne ou celle d'un joueur écarté n'est pas proposée ; un joueur entre
// tant qu'il reste une place, jamais au-delà ; complète, la partie part pour tous sans que personne
// appuie sur rien (le service réel, app/src/live-game.ts, sur trois bornes d'un réseau d'essai en
// mémoire) ; et, sur le vrai réseau des bornes en 127.0.0.1 (app/src/social-net.ts), l'annonce passe
// entre bornes qui ne sont pas amies, la partie aussi entre ses joueurs, et rien d'autre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  INSTANT_FRESH_MS,
  instantFree,
  instantMax,
  mergeInstant,
  openInstant,
  signInstant,
  verifyInstant,
  type InstantBoard,
  type InstantGame,
} from '../instantgames';
import { instantComplete, joinGame, newLiveGame, parseLiveMessage, type LiveGame, type LiveTable } from '../livegame';
import { liveNotices, liveSnapshot } from '../livenotices';
import { newSocialState, setName, type SocialState } from '../social';
import type { TableEntry } from '../tables';
import { fakeSocialNet } from './doublures';
import { until } from './reseau-essai';

const T0 = new Date('2026-11-16T20:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const player = (name: string): SocialState => setName(newSocialState(T0), name)!;
const TABLE: LiveTable = { table: { title: 'Glass Lagoon', manufacturer: 'Cyber', year: 2026 }, print: 'a'.repeat(64), bytes: 5 };

function ad(host: SocialState, opts: { max?: number; seats?: SocialState[]; state?: 'open' | 'closed'; id?: string; when?: Date } = {}): InstantGame {
  const when = opts.when ?? T0;
  return signInstant(host, { id: opts.id ?? '0123456789abcdef', title: 'Glass Lagoon (Cyber 2026)', table: TABLE, max: opts.max ?? 3, seats: [host, ...(opts.seats ?? [])].map((p) => ({ key: p.key.publicKey, name: p.name })), state: opts.state ?? 'open', opened: T0.toISOString(), country: 'FR' }, when);
}

test('l’annonce est signée : changée, trop vieille, du futur ou mal formée, elle est refusée', () => {
  const kiko = player('Kiko');
  const nova = player('Nova');
  const g = ad(kiko, { seats: [nova] });
  assert.deepEqual(verifyInstant(JSON.parse(JSON.stringify(g)), at(1000)), g);
  assert.equal(verifyInstant({ ...g, max: 4 }, at(1000)), undefined, 'places changées');
  assert.equal(verifyInstant({ ...g, title: 'Autre table' }, at(1000)), undefined, 'table changée');
  assert.equal(verifyInstant({ ...g, seats: g.seats.slice(0, 1) }, at(1000)), undefined, 'joueurs changés');
  assert.equal(verifyInstant({ ...g, state: 'closed' }, at(1000)), undefined, 'état changé');
  assert.equal(verifyInstant(g, at(INSTANT_FRESH_MS + 1000)), undefined, 'trop vieille');
  assert.equal(verifyInstant(ad(kiko, { when: at(5 * 60_000) }), T0), undefined, 'du futur');
  // L'hôte toujours en tête, jamais plus de joueurs que de places, 2 à 4 joueurs.
  const nogood = signInstant(kiko, { id: '0123456789abcdef', title: 'X', table: TABLE, max: 2, seats: [{ key: nova.key.publicKey, name: 'Nova' }], state: 'open', opened: T0.toISOString() }, T0);
  assert.equal(verifyInstant(nogood, at(1000)), undefined, 'hôte absent de la tête');
  assert.equal(instantMax(1), 2);
  assert.equal(instantMax(9), 4);
  assert.equal(instantMax(3), 3);
});

test('la liste : ni la mienne, ni complète, ni fermée, ni d’un joueur écarté ; une par hôte, la plus récente', () => {
  const me = player('Sillage');
  const kiko = player('Kiko');
  const nova = player('Nova');
  const lux = player('Lux');
  const board: InstantBoard = new Map();
  const open = ad(kiko);
  assert.deepEqual(mergeInstant(board, [open], me.key.publicKey, T0), [open]);
  assert.deepEqual(mergeInstant(board, [open], me.key.publicKey, T0), [], 'déjà connue : pas de relais');
  assert.deepEqual(mergeInstant(board, [ad(me, { id: 'fedcba9876543210' })], me.key.publicKey, T0), [], 'la mienne ne s’écrit pas ici');
  const full = ad(nova, { id: '1111111111111111', max: 2, seats: [lux] });
  mergeInstant(board, [full], me.key.publicKey, T0);
  const list = () => openInstant(board, me.key.publicKey, (k) => k === lux.key.publicKey, at(1000)).map((g) => g.name);
  assert.deepEqual(list(), ['Kiko'], 'complète : pas proposée');
  assert.equal(instantFree(open), 2);
  // Un nouvel arrivant chez Kiko : l'annonce plus récente l'emporte ; fermée, elle disparaît et le reste.
  const later = ad(kiko, { seats: [nova], when: at(20_000) });
  assert.deepEqual(mergeInstant(board, [later], me.key.publicKey, at(20_000)), [later]);
  assert.equal(openInstant(board, me.key.publicKey, () => false, at(20_000))[0]!.seats.length, 2);
  const closed = ad(kiko, { seats: [nova], state: 'closed', when: at(30_000) });
  mergeInstant(board, [closed], me.key.publicKey, at(30_000));
  assert.deepEqual(openInstant(board, me.key.publicKey, () => false, at(30_000)), []);
  assert.deepEqual(mergeInstant(board, [ad(kiko, { when: at(40_000) })], me.key.publicKey, at(40_000)), [], 'fermée, elle le reste');
  // Un joueur écarté (bloqué, exclu) : sa partie n'est pas proposée.
  const banned = ad(lux, { id: '2222222222222222' });
  mergeInstant(board, [banned], me.key.publicKey, T0);
  assert.equal(openInstant(board, me.key.publicKey, (k) => k === lux.key.publicKey, at(1000)).some((g) => g.key === lux.key.publicKey), false);
  // Trop vieille : elle s'efface.
  assert.deepEqual(openInstant(board, me.key.publicKey, () => false, at(INSTANT_FRESH_MS + 60_000)), []);
});

test('rejoindre : tant qu’il reste une place, jamais au-delà ; complète, elle est prête à partir', () => {
  const host = { key: 'a'.repeat(64), name: 'Kiko' };
  let game: LiveGame = { ...newLiveGame(host, TABLE, 'Glass Lagoon', T0), instant: { max: 3, opened: T0.toISOString() } };
  const nova = { key: 'b'.repeat(64), name: 'Nova' };
  const lux = { key: 'c'.repeat(64), name: 'Lux' };
  const zed = { key: 'd'.repeat(64), name: 'Zed' };
  const join = (g: LiveGame, p: { key: string; name: string }) => joinGame(g, p, 3, { proto: 4 }, T0);
  let r = join(game, nova);
  assert.ok('game' in r);
  game = r.game;
  assert.equal(instantComplete(game), false);
  assert.deepEqual(join(game, nova), { game }, 'le même, renvoyé : rien ne change');
  r = join(game, lux);
  assert.ok('game' in r);
  game = r.game;
  assert.equal(instantComplete(game), true, 'trois sur trois');
  assert.deepEqual(join(game, zed), { refused: 'full' });
  assert.deepEqual(join({ ...game, phase: 'countdown' }, zed), { refused: 'started' });
  assert.deepEqual(join({ ...game, phase: 'cancelled' }, zed), { refused: 'cancelled' });
  assert.deepEqual(joinGame(newLiveGame(host, TABLE, 'Glass Lagoon', T0), zed), { refused: 'cancelled' }, 'une partie entre amis ne se rejoint pas');
  // Le message « je rejoins », vérifié champ par champ.
  assert.deepEqual(parseLiveMessage({ t: 'game-join', game: '0123456789abcdef', name: 'Nova', balls: 3, proto: 4 }), { t: 'game-join', game: '0123456789abcdef', name: 'Nova', balls: 3, proto: 4 });
  assert.equal(parseLiveMessage({ t: 'game-join', game: 'pas-un-id', name: 'Nova' }), undefined);
  // L'hôte est prévenu de chaque arrivée.
  const before = { ...newLiveGame(host, TABLE, 'Glass Lagoon', T0), instant: { max: 3, opened: T0.toISOString() } };
  const after = (join(before, nova) as { game: LiveGame }).game;
  const events = liveNotices(liveSnapshot(before, host.key), liveSnapshot(after, host.key), after, host.key, T0.getTime());
  assert.deepEqual(events.map((e) => [e.kind, e.who]), [['live-joined', 'Nova']]);
});

// ---------------------------------------------------------------------------
// Le service réel (app/src/live-game.ts) sur trois bornes, puis quatre, qui ne sont pas amies.

type Games = {
  openInstant(table: TableEntry, max: number): Promise<LiveGame>;
  joinInstant(g: InstantGame): Promise<{ match: string }>;
  joinPending(): boolean;
  current(): LiveGame | undefined;
  leave(): void;
  stop(): void;
};
/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as { createLiveGames(o: object): Games };
/* eslint-enable @typescript-eslint/no-require-imports */

test('trois bornes qui ne sont pas amies : chacun rejoint, complète elle part pour tous, la quatrième est refusée', { timeout: 300_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-instant-'));
  const vpx = path.join(dir, 'Glass Lagoon.vpx');
  fs.writeFileSync(vpx, 'table');
  const table = { file: vpx, folder: dir, title: 'Glass Lagoon', info: {}, emulator: 'vpx' } as unknown as TableEntry;
  const handlers: Record<string, (k: string, m: unknown) => void> = {};
  const announced: Record<string, unknown[]> = {};
  const partners: Record<string, string[]> = {};
  const played: string[] = [];
  const make = (me: string) =>
    createLiveGames({
      net: fakeSocialNet({
        // Personne n'est ami de personne.
        state: () => ({ key: { publicKey: me }, name: me[0]!.toUpperCase() + me.slice(1), friends: [] }),
        online: () => true,
        send: (to: string, m: unknown) => (setImmediate(() => handlers[to]?.(me, JSON.parse(JSON.stringify(m)))), true),
        onMessage: (cb: (k: string, m: unknown) => void) => ((handlers[me] = cb), () => undefined),
        setPartners: (keys: string[]) => (partners[me] = [...keys]),
        announceInstant: (g: unknown) => (announced[me] ??= []).push(g),
      }),
      dataDir: path.join(dir, me),
      tables: () => [table],
      play: async () => {
        played.push(me);
        return { ok: true, seconds: 42, records: [], score: 1000 * played.length };
      },
    });
  const kiko = make('kiko');
  const nova = make('nova');
  const lux = make('lux');
  const zed = make('zed');
  try {
    const game = await kiko.openInstant(table, 3);
    assert.deepEqual(game.instant?.max, 3);
    const last = () => announced.kiko!.at(-1) as { id: string; title: string; table: LiveTable; max: number; seats: { key: string; name: string }[]; state: string; opened: string } | undefined;
    assert.equal(last()?.state, 'open', 'annoncée à toutes les bornes');
    // Ce que les autres voient : l'annonce telle que le réseau la relaie.
    const seen = (): InstantGame => ({ ...last()!, key: 'kiko', name: 'Kiko', at: new Date().toISOString(), sig: '' }) as InstantGame;
    assert.equal((await nova.joinInstant(seen())).match, 'same');
    await until('Nova dans la salle de Kiko', () => kiko.current()!.players.some((p) => p.key === 'nova' && p.state === 'accepted') && !nova.joinPending());
    assert.deepEqual(partners.kiko, ['nova'], 'l’hôte rejoint ses joueurs par leur clé');
    assert.deepEqual(partners.nova, ['kiko']);
    assert.equal(last()!.seats.length, 2, 'l’annonce compte Nova');
    assert.equal(kiko.current()!.phase, 'gathering', 'deux sur trois : on attend');
    await lux.joinInstant(seen());
    // Complète : le départ, pour tous, sans que l'hôte appuie sur rien.
    await until('départ pour tous', () => [kiko, nova, lux].every((g) => ['countdown', 'playing', 'finished'].includes(g.current()?.phase ?? '')));
    assert.equal(last()!.state, 'closed', 'retirée de la liste partout');
    // Une quatrième borne, arrivée trop tard : elle l'apprend.
    await zed.joinInstant({ ...seen(), seats: seen().seats.slice(0, 1) });
    await until('Zed refusé', () => zed.current()?.phase === 'cancelled');
    assert.ok(['full', 'started'].includes(zed.current()!.endWhy ?? ''), `raison : ${zed.current()!.endWhy}`);
    // Chacun joue sa partie, les résultats arrivent.
    await until('partie finie pour tous', () => [kiko, nova, lux].every((g) => g.current()?.phase === 'finished'), 60_000);
    assert.deepEqual([...played].sort(), ['kiko', 'lux', 'nova']);
    assert.equal(kiko.current()!.players.filter((p) => p.state === 'done').length, 3);
  } finally {
    for (const g of [kiko, nova, lux, zed]) g.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('un joueur qui quitte le salon libère sa place, l’annonce le dit', { timeout: 300_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-instant-quit-'));
  const vpx = path.join(dir, 'Glass Lagoon.vpx');
  fs.writeFileSync(vpx, 'table');
  const table = { file: vpx, folder: dir, title: 'Glass Lagoon', info: {}, emulator: 'vpx' } as unknown as TableEntry;
  const handlers: Record<string, (k: string, m: unknown) => void> = {};
  const announced: unknown[] = [];
  const make = (me: string) =>
    createLiveGames({
      net: fakeSocialNet({
        state: () => ({ key: { publicKey: me }, name: me, friends: [] }),
        online: () => true,
        send: (to: string, m: unknown) => (setImmediate(() => handlers[to]?.(me, JSON.parse(JSON.stringify(m)))), true),
        onMessage: (cb: (k: string, m: unknown) => void) => ((handlers[me] = cb), () => undefined),
        announceInstant: (g: unknown) => announced.push(g),
      }),
      dataDir: path.join(dir, me),
      tables: () => [table],
      play: async () => undefined,
    });
  const host = make('hote');
  const guest = make('invite');
  try {
    await host.openInstant(table, 4);
    const last = () => announced.at(-1) as { seats: unknown[]; state: string };
    await guest.joinInstant({ ...(last() as object), key: 'hote', name: 'hote', at: new Date().toISOString(), sig: '' } as InstantGame);
    await until('entré', () => last().seats.length === 2);
    guest.leave();
    await until('place libérée', () => last().seats.length === 1);
    assert.equal(host.current()!.phase, 'gathering');
    // L'hôte annule : l'annonce se ferme.
    const before = announced.length;
    host.leave();
    assert.equal((announced[before] as { state?: string } | undefined)?.state, 'closed', 'retirée partout sans attendre');
  } finally {
    host.stop();
    guest.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Le vrai réseau des bornes (app/src/social-net.ts), en 127.0.0.1 seulement.

interface Net {
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  state(): SocialState;
  send(key: string, message: object): boolean;
  onMessage(listener: (key: string, message: { t: string }) => void): () => void;
  setPartners(keys: readonly string[]): void;
  announceInstant(game: object | undefined): void;
  instantGames(): InstantGame[];
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(REPO_ROOT, 'app', 'dist', 'social-net.js')) as { createSocialNet(o: object): Net };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

test('réseau des bornes, entre inconnus : l’annonce arrive, la partie passe entre ses joueurs, rien d’autre', { timeout: 300_000 }, async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = [0, 1, 2].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-instant-net-${i}-`)));
  const [a, b, c] = dirs.map((d) => netModule.createSocialNet({ dataDir: d, mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap })) as [Net, Net, Net];
  try {
    a.rename('Kiko');
    b.rename('Nova');
    c.rename('Lux');
    await Promise.all([a.start(), b.start(), c.start()]);
    const A = a.state().key.publicKey;
    const B = b.state().key.publicKey;
    const body = { id: '0123456789abcdef', title: 'Glass Lagoon (Cyber 2026)', table: TABLE, max: 2, seats: [{ key: A, name: 'Kiko' }], opened: new Date().toISOString(), state: 'open' };
    a.announceInstant(body);
    await until('annonce chez Nova et chez Lux', () => b.instantGames().some((g) => g.key === A) && c.instantGames().some((g) => g.key === A));
    assert.equal(b.state().friends.length, 0, 'pas amis');
    assert.equal(b.instantGames()[0]!.title, 'Glass Lagoon (Cyber 2026)');
    // Nova rejoint : « je rejoins » passe vers l'hôte, qui n'est pas son ami.
    const atA: { key: string; t: string }[] = [];
    const atB: string[] = [];
    a.onMessage((key, m) => atA.push({ key, t: m.t }));
    b.onMessage((_key, m) => atB.push(m.t));
    b.setPartners([A]);
    await until('« je rejoins » reçu par Kiko', () => (b.send(A, { t: 'game-join', game: body.id, name: 'Nova' }), atA.some((m) => m.key === B && m.t === 'game-join')));
    // Entre joueurs de la partie, la partie passe dans les deux sens ; un autre message de service, non.
    a.setPartners([B]);
    assert.ok(a.send(B, { t: 'game-room', game: body.id, phase: 'gathering', players: [] }));
    await until('salle reçue par Nova', () => atB.includes('game-room'));
    assert.equal(a.send(B, { t: 'chat', text: 'bonjour' }), false, 'la messagerie reste entre amis');
    assert.equal(c.send(A, { t: 'game-room', game: body.id, phase: 'gathering', players: [] }), false, 'Lux n’est pas de la partie');
    // Partie lancée : l'annonce se ferme, elle disparaît chez tous.
    a.announceInstant({ ...body, seats: [...body.seats, { key: B, name: 'Nova' }], state: 'closed' });
    await until('retirée chez Lux', () => !c.instantGames().some((g) => g.key === A));
  } finally {
    await Promise.all([a.stop(), b.stop(), c.stop()]);
    await testnet.destroy();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});
