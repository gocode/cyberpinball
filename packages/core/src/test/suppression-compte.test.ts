// Supprimer son compte (RGPD, novembre 2026) : l'avis d'oubli est signé par la clé qu'il efface,
// gardé, relayé ; chaque borne efface alors tout ce qui vient de cette clé (annuaire, amis,
// classements, carte publique, « J'aime », salons, messages) et refuse ce qui en reviendrait.
// Entre deux bornes simulées (réseau local 127.0.0.1, jamais le vrai réseau) : le retrait d'une ligne
// de salon et l'avis d'oubli traversent, la borne qui reçoit l'avis efface et refuse.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { until as waitUntil } from './reseau-essai';
import {
  forgetInChat,
  forgetInProfiles,
  forgetInRankings,
  forgetInRooms,
  forgetInSocial,
  forgottenKeys,
  loadForgets,
  mergeForgets,
  saveForgets,
  signForget,
  verifyForget,
  emptyForgets,
} from '../forget';
import { createPlayerKey } from '../sharing';
import { newSocialState, type SocialState } from '../social';
import { emptyProfiles } from '../publicprofile';
import { emptyRankings, type RankedScore } from '../rankings';
import { mergeRoomLines, newRoomsState, roomLines, roomOfCountry, signRoomLine, type RoomLine, type RoomsState } from '../rooms';
import { newChatState } from '../chat';

const T0 = new Date('2026-11-16T20:00:00Z');

test('avis d’oubli : signé par la clé qu’il efface, refusé s’il est trafiqué ou daté du futur', () => {
  const k = createPlayerKey();
  const other = createPlayerKey();
  const n = signForget(k, T0);
  assert.deepEqual(verifyForget(JSON.parse(JSON.stringify(n)), T0), n);
  assert.equal(verifyForget({ ...n, key: other.publicKey }, T0), undefined, 'une autre clé ne s’efface pas avec ma signature');
  assert.equal(verifyForget({ ...n, at: new Date(T0.getTime() + 3600_000).toISOString() }, T0), undefined);
  assert.equal(verifyForget(signForget(k, new Date(T0.getTime() + 3600_000)), T0), undefined, 'du futur');
});

test('avis d’oubli : gardé une fois, relu du fichier', () => {
  const k = createPlayerKey();
  const n = signForget(k, T0);
  const first = mergeForgets(emptyForgets(), [n]);
  assert.equal(first.fresh.length, 1);
  assert.equal(mergeForgets(first.store, [n]).fresh.length, 0, 'déjà connu : pas relayé de nouveau');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-oubli-'));
  try {
    fs.mkdirSync(path.join(dir, 'amis'));
    saveForgets(dir, first.store);
    assert.ok(forgottenKeys(loadForgets(dir)).has(k.publicKey));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('avis d’oubli : chaque donnée de la borne perd ce qui vient de cette clé, et rien d’autre', () => {
  const gone = createPlayerKey();
  const stays = createPlayerKey();
  const keys = new Set([gone.publicKey]);
  const profile = (key: string, name: string) => ({ key, name, at: T0.toISOString(), sig: 'x' });
  const s: SocialState = {
    ...newSocialState(T0),
    friends: [{ key: gone.publicKey, name: 'Parti', events: [] } as unknown as SocialState['friends'][number], { key: stays.publicKey, name: 'Reste', events: [] } as unknown as SocialState['friends'][number]],
    incoming: [{ key: gone.publicKey, name: 'Parti', at: T0.toISOString() } as unknown as SocialState['incoming'][number]],
    directory: [{ profile: profile(gone.publicKey, 'Parti'), seen: T0.toISOString() } as unknown as SocialState['directory'][number], { profile: profile(stays.publicKey, 'Reste'), seen: T0.toISOString() } as unknown as SocialState['directory'][number]],
    peerAvatars: { [gone.publicKey]: 'a.png', [stays.publicKey]: 'b.png' },
  };
  const after = forgetInSocial(s, keys);
  assert.deepEqual(after.friends.map((f) => f.name), ['Reste']);
  assert.deepEqual(after.incoming, []);
  assert.deepEqual(after.directory.map((e) => e.profile.name), ['Reste']);
  assert.deepEqual(after.peerAvatars, { [stays.publicKey]: 'b.png' });
  assert.equal(forgetInSocial(after, keys), after, 'rien de plus à effacer : le même état');

  const rankings = emptyRankings();
  rankings.scores = [{ key: gone.publicKey } as RankedScore, { key: stays.publicKey } as RankedScore];
  rankings.hidden = [`k:${gone.publicKey}`, 's:abc'];
  assert.ok(forgetInRankings(rankings, keys));
  assert.deepEqual(rankings.scores.map((x) => x.key), [stays.publicKey]);
  assert.deepEqual(rankings.hidden, ['s:abc']);

  const like = (from: string, to: string) => ({ from, name: 'n', to, event: 'e', on: true, at: T0.toISOString(), sig: 's' });
  const p = forgetInProfiles({ ...emptyProfiles(), cards: [{ key: gone.publicKey } as never, { key: stays.publicKey } as never], seen: { [gone.publicKey]: 'x' }, received: [like(gone.publicKey, 'moi')], given: [like('moi', gone.publicKey)], hidden: [gone.publicKey] }, keys);
  assert.deepEqual([p.cards.length, Object.keys(p.seen).length, p.received.length, p.given.length, p.hidden.length], [1, 0, 0, 0, 0]);

  const FR = roomOfCountry('FR');
  const l1 = signRoomLine({ key: gone, name: 'Parti' }, { room: FR, text: 'à effacer' }, T0)!;
  const l2 = signRoomLine({ key: stays, name: 'Reste' }, { room: FR, text: 'reste' }, T0)!;
  const rooms: RoomsState = { ...mergeRoomLines(newRoomsState(), [l1, l2], T0).state, ignored: [gone.publicKey] };
  const r = forgetInRooms(rooms, keys);
  assert.deepEqual(roomLines(r, FR).map((l) => l.text), ['reste']);
  assert.deepEqual(r.ignored, []);

  const chat = { ...newChatState(), conversations: { [gone.publicKey]: { lines: [], unread: 0 }, [stays.publicKey]: { lines: [], unread: 0 } } };
  assert.deepEqual(Object.keys(forgetInChat(chat, keys).conversations), [stays.publicKey]);
});

interface Net {
  state(): SocialState;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  rooms(): RoomsState;
  roomSend(room: string, text: string): { line: RoomLine } | { reason: string };
  roomRetract(id: string): boolean;
  roomOpen(room: string | undefined): void;
  setRooms(change: Partial<RoomsState>): void;
  forgetMe(): Promise<{ reached: number }>;
  status(): object;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(REPO_ROOT, 'app', 'dist', 'social-net.js')) as { createSocialNet(o: object): Net };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

test('entre deux bornes : une ligne retirée disparaît chez l’autre, puis l’avis d’oubli efface le joueur et ses lignes', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = [0, 1].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-oubli-${i}-`)));
  const forgottenSeen: string[][] = [];
  // Le journal des deux bornes, rendu avec un échec d'attente.
  const t0 = Date.now();
  const journal: string[] = [];
  const logAs = (who: string) => (line: string) => journal.push(`${((Date.now() - t0) / 1000).toFixed(1)} s ${who} : ${line}`);
  const until = (what: string, check: () => boolean) => waitUntil(what, check, undefined, () => [`Kiko ${JSON.stringify(a.status())}`, `Sillage ${JSON.stringify(b.status())}`, ...journal].join('\n'));
  const a = netModule.createSocialNet({ dataDir: dirs[0], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, forgetFlushMs: 300, log: logAs('Kiko') });
  const b = netModule.createSocialNet({ dataDir: dirs[1], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, onForget: (keys: Set<string>) => forgottenSeen.push([...keys]), log: logAs('Sillage') });
  const FR = roomOfCountry('FR');
  try {
    a.rename('Kiko');
    b.rename('Sillage');
    a.setRooms({ rulesAt: new Date().toISOString() });
    await Promise.all([a.start(), b.start()]);
    a.roomOpen(FR);
    b.roomOpen(FR);
    const first = a.roomSend(FR, 'ligne à retirer');
    assert.ok('line' in first);
    await until('ligne chez Sillage', () => roomLines(b.rooms(), FR).some((l) => l.text === 'ligne à retirer'));
    assert.equal(b.roomRetract(first.line.id), false, 'Sillage ne retire pas la ligne de Kiko');
    assert.ok(a.roomRetract(first.line.id));
    await until('ligne retirée chez Sillage', () => !roomLines(b.rooms(), FR).some((l) => l.text === 'ligne à retirer'));
    // Une autre ligne, puis Kiko supprime son compte.
    await new Promise((r) => setTimeout(r, 3100));
    const second = a.roomSend(FR, 'deuxième ligne');
    assert.ok('line' in second);
    await until('deuxième ligne chez Sillage', () => roomLines(b.rooms(), FR).some((l) => l.text === 'deuxième ligne'));
    await until('Kiko dans l’annuaire de Sillage', () => b.state().directory.some((e) => e.profile.name === 'Kiko'));
    const kiko = a.state().key.publicKey;
    const { reached } = await a.forgetMe();
    assert.equal(reached, 1);
    await until('Kiko effacé chez Sillage', () => !roomLines(b.rooms(), FR).some((l) => l.key === kiko) && !b.state().directory.some((e) => e.profile.key === kiko));
    assert.deepEqual(forgottenSeen, [[kiko]], 'la messagerie l’apprend aussi');
    assert.ok(forgottenKeys(loadForgets(dirs[1]!)).has(kiko), 'l’avis est gardé sur le disque');
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await testnet.destroy();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});
