// Classements national et mondial (décisions du 09/11/2026) : chaque score part signé par la clé du
// joueur et passe de borne en borne, sans serveur ; il ne se compare que sur la même version exacte
// de la table et le même nombre de billes. Ici : la signature (un score retouché est refusé), la
// fusion (un même score une seule fois), ce que la borne garde, les portées (amis, pays, monde),
// le masquage, le pays tiré de Windows ; puis deux bornes simulées sur 127.0.0.1 qui échangent
// leurs scores, au bonjour et en direct, et l'avatar joint aux scores (décidé le 10/11/2026).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  countryCodes,
  countryOfLocale,
  createPlayerKey,
  emptyRankings,
  loadRankings,
  mergeRankings,
  pruneRankings,
  rankedId,
  rankingAvatars,
  rankingBoard,
  readAvatarImage,
  type AvatarImage,
  rankingsFile,
  saveRankings,
  signScore,
  verifyScore,
  type PlayerKey,
  type RankedScore,
  type RankingStore,
} from '../index';

/** Lundi 9 novembre 2026, 21 h. */
const NOW = new Date(2026, 10, 9, 21, 0);
const at = (m: number, d: number, h = 20) => new Date(2026, m - 1, d, h).toISOString();
const T2 = `${'a'.repeat(64)}:`;
const T2_VBS = `${'a'.repeat(64)}:${'b'.repeat(64)}`;
const table = { title: 'Terminator 2', manufacturer: 'Williams', year: 1991 };

function player(name: string, country?: string): { key: PlayerKey; score(score: number, when: string, board?: string, balls?: number): RankedScore } {
  const key = createPlayerKey();
  return {
    key,
    score: (score, when, board = T2, balls = 3) => signScore(key, { name, ...(country ? { country } : {}), board, ...(balls ? { balls } : {}), table, score, at: when, how: 'rom' }),
  };
}

test('signature : un score signé passe, retouché il est refusé ; un score venu du futur aussi', () => {
  const ana = player('Ana', 'FR');
  const s = ana.score(95_000_000, at(11, 9));
  assert.deepEqual(verifyScore(JSON.parse(JSON.stringify(s)), NOW), s);
  for (const forged of [{ ...s, score: 950_000_000 }, { ...s, name: 'Bob' }, { ...s, country: 'US' }, { ...s, board: T2_VBS }, { ...s, balls: 5 }, { ...s, how: 'live' }]) {
    assert.equal(verifyScore(forged, NOW), undefined, `retouché : ${JSON.stringify(forged).slice(0, 60)}`);
  }
  assert.equal(verifyScore(ana.score(1, new Date(NOW.getTime() + 3600_000).toISOString()), NOW), undefined, 'une heure dans le futur');
  assert.equal(verifyScore({ ...s, score: -5 }, NOW), undefined);
  assert.equal(verifyScore({ ...s, country: 'fr' }, NOW), undefined, 'pays en deux capitales');
});

test('avatar joint au score : signé avec lui, retouché refusé ; un score sans avatar se vérifie comme avant', () => {
  const key = createPlayerKey();
  const fields = { name: 'Ana', country: 'FR', board: T2, balls: 3, table, score: 95_000_000, at: at(11, 9), how: 'rom' as const };
  const plain = signScore(key, fields);
  assert.ok(verifyScore(JSON.parse(JSON.stringify(plain)), NOW), 'sans avatar');
  assert.equal(verifyScore({ ...plain, avatar: 'c'.repeat(64) }, NOW), undefined, 'avatar ajouté après coup');
  const withAvatar = signScore(key, { ...fields, avatar: 'c'.repeat(64) });
  assert.deepEqual(verifyScore(JSON.parse(JSON.stringify(withAvatar)), NOW), withAvatar);
  assert.equal(verifyScore({ ...withAvatar, avatar: 'd'.repeat(64) }, NOW), undefined, 'avatar remplacé');
  assert.equal(verifyScore({ ...withAvatar, avatar: 'pas-une-empreinte' }, NOW), undefined);
  // Celui du score le plus récent : un avatar retiré ne revient pas d'un vieux score.
  const later = signScore(key, { ...fields, score: 12_000_000, at: at(11, 9, 21) });
  const store = { ...emptyRankings(), scores: [withAvatar, later] };
  assert.equal(rankingAvatars(store).get(key.publicKey), undefined);
  const newer = signScore(key, { ...fields, at: at(11, 9, 22), avatar: 'c'.repeat(64) });
  const board = rankingBoard({ ...emptyRankings(), scores: [plain, newer] }, { board: T2, balls: 3, period: 'all', scope: 'world' }, NOW);
  assert.equal(board.lines[0]!.avatar, 'c'.repeat(64));
});

test('fusion : un score relayé dix fois n’entre qu’une fois ; seuls les nouveaux gardés sont rendus (à relayer)', () => {
  const store = emptyRankings();
  const ana = player('Ana', 'FR');
  const s = ana.score(95_000_000, at(11, 9));
  assert.equal(mergeRankings(store, [s, s, s], undefined, NOW).length, 1);
  assert.equal(mergeRankings(store, [s], undefined, NOW).length, 0, 'déjà connu : pas relayé');
  assert.equal(store.scores.length, 1);
});

test('garder : le meilleur de chaque joueur pour chaque période, les premiers du monde et de chaque pays', () => {
  const ana = player('Ana', 'FR');
  // Cent parties d'Ana dans l'année : seuls ses meilleurs de toujours, de l'année, de la semaine et du jour restent.
  const many = Array.from({ length: 100 }, (_, i) => ana.score(1_000_000 + i * 1000, new Date(2026, 0, 1 + i, 20).toISOString()));
  const today = ana.score(500_000, at(11, 9));
  const kept = pruneRankings([...many, today], undefined, NOW);
  assert.deepEqual(kept.map((s) => s.score).sort((a, b) => b - a), [1_099_000, 500_000]);
  // Mes propres scores de l'année restent tous.
  assert.equal(pruneRankings([...many, today], ana.key.publicKey, NOW).length, 101);
  // 150 joueurs : les 100 premiers du monde, plus les 25 premiers de chaque pays au-delà.
  const crowd = Array.from({ length: 150 }, (_, i) => player(`J${i}`, i % 2 ? 'FR' : 'BE').score(10_000 + i, at(11, 9)));
  const top = pruneRankings(crowd, undefined, NOW);
  assert.equal(top.length, 100);
  assert.ok(top.every((s) => s.score >= 10_050));
});

test('classements : par version et billes, portée amis, pays, monde, période ; masqués exclus ; ma place en dernière ligne', () => {
  const store: RankingStore = emptyRankings();
  const ana = player('Ana', 'FR');
  const bob = player('Bob', 'BE');
  const cle = player('Clé', 'FR');
  const me = player('Moi', 'FR');
  mergeRankings(
    store,
    [
      ana.score(95_000_000, at(11, 9)),
      ana.score(120_000_000, at(3, 2)),
      bob.score(300_000_000, at(11, 3)),
      cle.score(40_000_000, at(11, 9)),
      me.score(10_000_000, at(11, 9)),
      // Autres versions : jamais dans ce classement.
      bob.score(999_000_000, at(11, 9), T2_VBS),
      cle.score(888_000_000, at(11, 9), T2, 5),
    ],
    me.key.publicKey,
    NOW,
  );
  const q = { board: T2, balls: 3, me: me.key.publicKey };
  const names = (scope: 'world' | 'country' | 'friends', period: 'all' | 'year' | 'week' | 'today', limit?: number) =>
    rankingBoard(store, { ...q, scope, period, country: 'FR', friends: new Set([ana.key.publicKey]), ...(limit !== undefined ? { limit } : {}) }, NOW).lines.map((l) => `${l.rank}.${l.name}:${l.score}`);
  assert.deepEqual(names('world', 'all'), ['1.Bob:300000000', '2.Ana:120000000', '3.Clé:40000000', '4.Moi:10000000']);
  assert.deepEqual(names('world', 'today'), ['1.Ana:95000000', '2.Clé:40000000', '3.Moi:10000000'], 'aujourd’hui : le meilleur du jour de chacun');
  assert.deepEqual(names('country', 'all'), ['1.Ana:120000000', '2.Clé:40000000', '3.Moi:10000000']);
  assert.deepEqual(names('friends', 'all'), ['1.Ana:120000000', '2.Moi:10000000'], 'mes amis, et moi');
  // Au-delà des premières lignes, ma place quand même.
  assert.deepEqual(names('world', 'all', 3), ['1.Bob:300000000', '2.Ana:120000000', '4.Moi:10000000'], 'trois lignes : les deux premiers, puis moi');
  // Masqués : un score, puis tous ceux d'un joueur.
  store.hidden.push(`s:${rankedId(bob.score(300_000_000, at(11, 3)))}`);
  assert.equal(names('world', 'all')[0], '1.Ana:120000000');
  store.hidden.push(`k:${ana.key.publicKey}`);
  assert.deepEqual(names('world', 'all'), ['1.Clé:40000000', '2.Moi:10000000']);
  // Gardé dans <données>\classements.json, relu tel quel.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classements-'));
  saveRankings(rankingsFile(dir), store);
  assert.deepEqual(loadRankings(rankingsFile(dir), NOW).store, store);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pays : tiré de la région de Windows, nommé dans la langue de l’interface', () => {
  assert.equal(countryOfLocale('fr-FR'), 'FR');
  assert.equal(countryOfLocale('en-GB'), 'GB');
  assert.equal(countryOfLocale('fr_BE.UTF-8'), 'BE');
  assert.equal(countryOfLocale('fr'), undefined);
  assert.equal(countryOfLocale(undefined), undefined);
  const codes = countryCodes('fr-FR');
  assert.ok(codes.length > 200 && codes.includes('FR') && codes.includes('CA'));
  assert.ok(!codes.includes('ZZ') && !codes.includes('EU'));
});

// ---------------------------------------------------------------------------
// Deux bornes simulées (app/src/social-net.ts) : les scores passent au bonjour et en direct.

interface Net {
  state(): { key: PlayerKey; name: string };
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  publishScore(s: Omit<RankedScore, 'key' | 'name' | 'country' | 'avatar' | 'sig'>): RankedScore | undefined;
  setAvatar(image: AvatarImage | undefined): void;
  avatarFile(key: string): string | undefined;
  rankingAvatar(key: string, hash: string): string | undefined;
  rankings(): RankingStore;
  setShareScores(on: boolean): void;
  setCountry(code: string | undefined): void;
  country(): string | undefined;
}
const { createSocialNet } = require(path.join(REPO_ROOT, 'app', 'dist', 'social-net.js')) as { createSocialNet(o: object): Net };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;

async function until(what: string, check: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('deux bornes : mes scores partent signés, avec mon pays ; l’autre les reçoit au bonjour puis en direct', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = ['Ana', 'Bob'].map((n) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-classement-${n}-`));
    fs.writeFileSync(path.join(dir, 'social.json'), JSON.stringify({ ...JSON.parse(JSON.stringify(require(path.join(REPO_ROOT, 'packages', 'core', 'dist', 'social.js')).newSocialState())), lan: false }));
    return dir;
  });
  const make = (dir: string, locale: string) => createSocialNet({ dataDir: dir, mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, systemLocale: () => locale });
  const ana = make(dirs[0]!, 'fr-FR');
  const bob = make(dirs[1]!, 'fr-BE');
  ana.rename('Ana');
  bob.rename('Bob');
  const score = (n: number) => ({ board: T2, balls: 3, table, score: n, at: new Date().toISOString(), how: 'rom' as const });
  try {
    // Avant toute connexion : gardé, et parti au bonjour.
    const first = ana.publishScore(score(95_000_000));
    assert.equal(first?.country, 'FR', 'le pays de Windows par défaut');
    assert.equal(first?.name, 'Ana');
    await Promise.all([ana.start(), bob.start()]);
    await until('Bob reçoit le score d’Ana au bonjour', () => bob.rankings().scores.some((s) => s.score === 95_000_000));
    // Pays choisi ; puis un score en direct.
    bob.setCountry('CA');
    assert.equal(bob.country(), 'CA');
    bob.publishScore(score(42_000_000));
    await until('Ana reçoit le score de Bob en direct', () => ana.rankings().scores.some((s) => s.score === 42_000_000 && s.country === 'CA'));
    // Publication coupée : rien ne part.
    ana.setShareScores(false);
    assert.equal(ana.publishScore(score(1_000)), undefined);
  } finally {
    await Promise.all([ana.stop(), bob.stop()]);
    await testnet.destroy();
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ma place : sous chaque classement, exacte dans ce que la borne garde, « au-delà » plus loin', () => {
  const me = player('Moi', 'FR');
  const store = emptyRankings();
  // 150 joueurs français mieux placés que moi : la borne n'en garde que le haut.
  const crowd = Array.from({ length: 150 }, (_, i) => player(`J${i}`, 'FR').score(1_000_000 + i, at(11, 9)));
  mergeRankings(store, [...crowd, me.score(500_000, at(11, 9))], me.key.publicKey, NOW);
  const q = { board: T2, balls: 3, me: me.key.publicKey, period: 'today' as const };
  const world = rankingBoard(store, { ...q, scope: 'world' }, NOW);
  assert.deepEqual(world.me, { rank: 101, beyond: 100 }, 'cent mieux placés gardés : au-delà de la 100ᵉ');
  assert.equal(world.lines.at(-1)!.mine, true, 'ma ligne en fin de tableau');
  assert.equal(world.lines.at(-1)!.beyond, 100);
  const country = rankingBoard(store, { ...q, scope: 'country', country: 'FR' }, NOW);
  assert.equal(country.me?.beyond, 25);
  // Peu de joueurs : place exacte, compte complet.
  const small = emptyRankings();
  mergeRankings(small, [crowd[0]!, crowd[1]!, me.score(500_000, at(11, 9))], me.key.publicKey, NOW);
  const exact = rankingBoard(small, { ...q, scope: 'world', limit: 2 }, NOW);
  assert.deepEqual(exact.me, { rank: 3 });
  assert.equal(exact.complete, true);
  assert.equal(exact.lines.length, 2, 'deux lignes : le premier, puis moi');
  // Pas de score aujourd'hui : pas de place.
  assert.equal(rankingBoard(small, { ...q, scope: 'world', me: createPlayerKey().publicKey }, NOW).me, undefined);
});

test('ma place, en clair : la portée et la période nommées', () => {
  const { positionText } = require(path.join(REPO_ROOT, 'app', 'dist', 'scoreboard-menu.js')) as { positionText(v: object, scope: string, period: string): string };
  require(path.join(REPO_ROOT, 'packages', 'core', 'dist', 'i18n.js')).setLanguage('fr');
  assert.equal(positionText({ lines: [], players: 340, complete: true, me: { rank: 12 } }, 'world', 'week'), 'Mondial · Cette semaine : votre place, 12 sur 340 joueurs');
  assert.equal(positionText({ lines: [], players: 100, complete: false, me: { rank: 101, beyond: 100 } }, 'country', 'today'), 'National · Aujourd’hui : votre place, au-delà de la 100ᵉ');
  assert.equal(positionText({ lines: [], players: 4 }, 'friends', 'year'), 'Amis · Cette année : pas encore de score pour vous');
});

/** En-tête PNG d'une image carrée, suivi d'octets propres à `n` : assez pour le contrôle, qui ne décode pas. */
function avatarImage(n: number): AvatarImage {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(256, 16);
  head.writeUInt32BE(256, 20);
  return readAvatarImage(Buffer.concat([head, Buffer.alloc(64, n)]))!;
}

test('deux bornes : l’avatar joint à mes scores se voit au classement d’un joueur qui n’est pas mon ami ; rien d’autre ne se donne', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = ['Ana', 'Bob'].map((n) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-classement-avatar-${n}-`));
    fs.writeFileSync(path.join(dir, 'social.json'), JSON.stringify({ ...JSON.parse(JSON.stringify(require(path.join(REPO_ROOT, 'packages', 'core', 'dist', 'social.js')).newSocialState())), lan: false }));
    return dir;
  });
  const make = (dir: string) => createSocialNet({ dataDir: dir, mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, systemLocale: () => 'fr-FR' });
  const ana = make(dirs[0]!);
  const bob = make(dirs[1]!);
  ana.rename('Ana');
  bob.rename('Bob');
  const keyA = ana.state().key.publicKey;
  try {
    const photo = avatarImage(1);
    ana.setAvatar(photo);
    const published = ana.publishScore({ board: T2, balls: 3, table, score: 95_000_000, at: new Date().toISOString(), how: 'rom' });
    assert.equal(published?.avatar, photo.hash, 'mon avatar part avec le score, signé');
    await Promise.all([ana.start(), bob.start()]);
    await until('Bob reçoit le score d’Ana', () => bob.rankings().scores.some((s) => s.key === keyA && s.avatar === photo.hash));
    await until('Bob reçoit l’avatar du score d’Ana', () => {
      const file = bob.rankingAvatar(keyA, photo.hash);
      return !!file && fs.existsSync(file) && fs.readFileSync(file).equals(photo.bytes);
    });
    // Pas amis : l'avatar « d'ami » reste inconnu ; seul celui joint aux scores se montre.
    assert.equal(bob.avatarFile(keyA), undefined);
    // Une empreinte qu'aucun score ne porte ne se demande pas, et rien ne vient.
    const secret = avatarImage(2);
    ana.setAvatar(secret);
    assert.equal(bob.rankingAvatar(keyA, secret.hash), undefined);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(bob.rankingAvatar(keyA, secret.hash), undefined, 'avatar non publié : jamais donné');
  } finally {
    await Promise.all([ana.stop(), bob.stop()]);
    await testnet.destroy();
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('au classement : la pastille et le statut de chacun — en partie, en ligne, hors ligne, vu il y a…', async () => {
  interface Face { src?: string; initials: string }
  interface Line { name: string; face: Face; status?: { state: string; label: string } }
  interface Rankings { view(table: object, scope: string, period: string): { lines: Line[] } }
  const { createTableRankings } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-rankings.js')) as { createTableRankings(o: object): Rankings };
  const { newSocialState } = require(path.join(REPO_ROOT, 'packages', 'core', 'dist', 'social.js')) as { newSocialState(now: Date): object };
  const me = player('Julie', 'FR');
  const [playing, online, offline, seen, unknown] = ['Bruno', 'Lena', 'Nadia', 'Kenji', 'Olu'].map((n) => player(n, 'FR'));
  const hash = 'e'.repeat(64);
  const scores = [me, playing!, online!, offline!, seen!, unknown!].map((p, i) => ({ ...p.score(90_000_000 - i * 1_000_000, at(11, 9)) }));
  scores[4] = signScore(seen!.key, { name: 'Kenji', country: 'FR', board: T2, balls: 3, table, score: 86_000_000, at: at(11, 9), how: 'rom', avatar: hash });
  const store = { ...emptyRankings(), scores };
  const friend = (p: { key: PlayerKey }, name: string) => ({ key: p.key.publicKey, name, since: NOW.toISOString(), events: [] });
  const state = {
    ...newSocialState(NOW),
    key: me.key,
    name: 'Julie',
    friends: [friend(playing!, 'Bruno'), friend(offline!, 'Nadia')],
    directory: [{ profile: { key: seen!.key.publicKey, name: 'Kenji', at: NOW.toISOString(), sig: '' }, seen: new Date(NOW.getTime() - 3 * 3600_000).toISOString() }],
  };
  let changed = 0;
  const rankings = createTableRankings({
    net: {
      state: () => state,
      rankings: () => store,
      country: () => 'FR',
      status: () => ({ running: true }),
      online: (k: string) => k === playing!.key.publicKey || k === online!.key.publicKey,
      presenceOf: (k: string) => (k === playing!.key.publicKey ? { status: 'playing' } : undefined),
      avatarFile: (k: string) => (k === playing!.key.publicKey ? 'C:/avatars/bruno.png' : undefined),
      rankingAvatar: (_k: string, h: string) => (h === hash ? 'C:/avatars/kenji.png' : undefined),
    },
    versionOf: async () => ({ print: 'a'.repeat(64) }),
    ballsOf: async () => 3,
    changed: () => changed++,
    now: () => NOW,
  });
  const entry = { file: 't2.vpx', folder: 'C:\t2', title: 'Terminator 2' };
  rankings.view(entry, 'world', 'all');
  await until('empreinte de la table', () => changed > 0, 2000);
  const lines = rankings.view(entry, 'world', 'all').lines;
  const by = (name: string) => lines.find((l) => l.name === name)!;
  assert.equal(by('Julie').status, undefined, 'moi : pas de statut');
  assert.deepEqual(by('Bruno').status, { state: 'playing', label: 'En partie' });
  assert.deepEqual(by('Lena').status, { state: 'online', label: 'En ligne' });
  assert.deepEqual(by('Nadia').status, { state: 'offline', label: 'Hors ligne' }, 'un ami sans liaison');
  assert.deepEqual(by('Kenji').status, { state: 'seen', label: 'Vu il y a 3 h' });
  assert.equal(by('Olu').status, undefined, 'jamais vu : rien d’inventé');
  assert.match(by('Bruno').face.src ?? '', /bruno\.png/, 'un ami : son avatar reçu');
  assert.match(by('Kenji').face.src ?? '', /kenji\.png/, 'un inconnu : celui joint à son score');
  assert.equal(by('Olu').face.src, undefined);
  assert.equal(by('Olu').face.initials, 'O');
});
