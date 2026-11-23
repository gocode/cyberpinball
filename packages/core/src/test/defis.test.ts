// Défis asynchrones (challenges.ts, 22/11/2026 : « Go pour les défis asynchrones ») : je défie un joueur
// sur une version exacte d'une table, avec un score à battre ; il a 48 h, essais illimités, le meilleur de
// chacun compte ; le vainqueur gagne 40 XP.
//
// Les invariants : chaque note est signée (changée, d'une autre clé, du futur, d'une échéance qui n'est
// pas la règle, ou trop vieille : refusée) ; l'état se déduit des notes (envoyé, reçu, en cours, gagné,
// perdu, expiré, refusé) et bascule à l'échéance ; le meilleur score de chacun est retenu, jamais un
// score signé après l'échéance ; seule une partie sur la version exacte (empreinte et billes) compte ;
// le vainqueur reçoit ses XP une fois, dans les plafonds ; une ligne d'Activité par défi ; rien en jeu
// local. Et, sur le vrai réseau des bornes en 127.0.0.1 : le défi arrive par une troisième borne quand
// celle qui l'a lancé est éteinte.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  CHALLENGE_GRACE_MS,
  CHALLENGE_MS,
  CHALLENGE_SETTLE_MS,
  challengeBlocked,
  challengeNews,
  challengeSample,
  declineChallenge,
  emptyChallenges,
  loadChallenges,
  mergeChallengeRelay,
  mergeMyChallenges,
  myChallenges,
  offerChallenge,
  saveChallenges,
  scoreChallenge,
  verifyChallengeNote,
  type ChallengeNote,
  type ChallengeRelay,
  type ChallengeStore,
} from '../challenges';
import { addActivity, activityFacts, emptyActivity } from '../activity';
import { CHALLENGE_WINS_PER_DAY, challengeGains, DAILY_PLAY_CAP, emptyLevels, XP } from '../levels';
import { noticeText } from '../notices';
import { newSocialState, setName, type SocialState } from '../social';
import { until } from './reseau-essai';
import { fakeSocialNet } from './doublures';

const T0 = new Date('2026-11-22T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const H = 3600_000;
const player = (name: string): SocialState => setName(newSocialState(T0), name)!;
const NINA = player('Nina');
const LEO = player('Léo');
const ZOE = player('Zoé');
const me = (s: SocialState) => ({ key: s.key, name: s.name });
const pub = (s: SocialState) => ({ key: s.key.publicKey, name: s.name });
const TABLE = { board: `${'a'.repeat(64)}:${'b'.repeat(64)}`, balls: 3, title: 'Medieval Madness' };

/** Le défi de Nina à Léo sur Medieval Madness, 4 512 300 à battre. */
const offer = (now = T0) => offerChallenge(me(NINA), pub(LEO), TABLE, 4_512_300, 'best', now, '0123456789abcdef');

function storeWith(notes: readonly ChallengeNote[], key: string, now = T0): ChallengeStore {
  const store = emptyChallenges();
  mergeMyChallenges(store, notes, key, () => false, now);
  return store;
}

test('signatures : une note changée, d’une autre clé, du futur, hors règle ou trop vieille est refusée', () => {
  const o = offer();
  assert.ok(verifyChallengeNote(JSON.parse(JSON.stringify(o)), T0), 'l’offre de Nina est valide');
  assert.equal(verifyChallengeNote({ ...o, score: 1 }, T0), undefined, 'score changé');
  assert.equal(verifyChallengeNote({ ...o, to: pub(ZOE) }, T0), undefined, 'destinataire changé');
  assert.equal(verifyChallengeNote({ ...o, table: { ...o.table, balls: 5 } }, T0), undefined, 'autre nombre de billes');
  // Une offre signée par Léo au nom de Nina.
  const forged = offerChallenge({ key: LEO.key, name: 'Nina' }, pub(ZOE), TABLE, 1000, 'best', T0);
  assert.equal(verifyChallengeNote({ ...forged, from: { key: NINA.key.publicKey, name: 'Nina' }, by: NINA.key.publicKey }, T0), undefined, 'au nom d’un autre');
  assert.equal(verifyChallengeNote(offer(at(10 * 60_000)), T0), undefined, 'datée du futur');
  assert.equal(verifyChallengeNote(o, at(CHALLENGE_MS + CHALLENGE_GRACE_MS + 1000)), undefined, 'trop vieille pour être relayée');
  assert.ok(verifyChallengeNote(o, at(CHALLENGE_MS + CHALLENGE_GRACE_MS - 1000)), 'encore relayée juste après l’échéance');
  // Une échéance qui n'est pas la règle des 48 h.
  const long = { ...o, until: at(7 * 24 * H).toISOString() };
  assert.equal(verifyChallengeNote(long, T0), undefined, 'échéance hors règle');
  const s = scoreChallenge({ key: LEO.key }, o, 5_000_000, at(H));
  assert.ok(verifyChallengeNote(s, at(H)));
  assert.equal(verifyChallengeNote({ ...s, score: 9_999_999 }, at(H)), undefined, 'score de la note changé');
  assert.ok(verifyChallengeNote(declineChallenge({ key: LEO.key }, o, at(H)), at(H)));
  assert.equal(verifyChallengeNote({ ...o, sig: 'x' }, T0), undefined);
  assert.equal(verifyChallengeNote({ kind: 'autre' }, T0), undefined);
});

test('état et échéance : envoyé, reçu, en cours, puis gagné et perdu à l’échéance ; expiré sans partie ; refusé', () => {
  const o = offer();
  const nina = storeWith([o], NINA.key.publicKey);
  const leo = storeWith([o], LEO.key.publicKey);
  assert.equal(myChallenges(nina, NINA.key.publicKey, at(H))[0]!.state, 'sent');
  const got = myChallenges(leo, LEO.key.publicKey, at(H))[0]!;
  assert.equal(got.state, 'received');
  assert.equal(got.opponent.name, 'Nina');
  assert.equal(got.theirs, 4_512_300, 'le score à battre');
  // Léo joue moins bien : en cours, Nina mène.
  const low = scoreChallenge({ key: LEO.key }, o, 4_000_000, at(2 * H));
  for (const s of [nina, leo]) mergeMyChallenges(s, [low], s === nina ? NINA.key.publicKey : LEO.key.publicKey, () => false, at(2 * H));
  assert.equal(myChallenges(nina, NINA.key.publicKey, at(3 * H))[0]!.leader, 'me');
  assert.equal(myChallenges(leo, LEO.key.publicKey, at(3 * H))[0]!.state, 'running');
  // À l'échéance : Nina gagne, Léo perd ; acquis passé CHALLENGE_SETTLE_MS.
  const end = at(CHALLENGE_MS + 1000);
  const n = myChallenges(nina, NINA.key.publicKey, end)[0]!;
  assert.equal(n.state, 'won');
  assert.equal(n.settled, false, 'pas encore acquis');
  assert.equal(myChallenges(nina, NINA.key.publicKey, at(CHALLENGE_MS + CHALLENGE_SETTLE_MS))[0]!.settled, true);
  assert.equal(myChallenges(leo, LEO.key.publicKey, end)[0]!.state, 'lost');
  // Égalité : le score à battre n'est pas battu.
  const tie = storeWith([o, scoreChallenge({ key: LEO.key }, o, 4_512_300, at(H))], LEO.key.publicKey);
  assert.equal(myChallenges(tie, LEO.key.publicKey, end)[0]!.state, 'lost');
  // Personne n'a joué : expiré, sans vainqueur.
  assert.equal(myChallenges(storeWith([o], NINA.key.publicKey), NINA.key.publicKey, end)[0]!.state, 'expired');
  // Refusé : par le défié seulement.
  const refused = storeWith([o, declineChallenge({ key: LEO.key }, o, at(H))], NINA.key.publicKey);
  assert.equal(myChallenges(refused, NINA.key.publicKey, at(2 * H))[0]!.state, 'declined');
  const fake = storeWith([o, declineChallenge({ key: NINA.key }, o, at(H))], LEO.key.publicKey);
  assert.equal(myChallenges(fake, LEO.key.publicKey, at(2 * H))[0]!.state, 'received', 'Nina ne refuse pas à la place de Léo');
});

test('meilleur score retenu : la plus haute note de chacun, jamais une note signée après l’échéance', () => {
  const o = offer();
  const leo = storeWith([o], LEO.key.publicKey);
  const k = LEO.key.publicKey;
  mergeMyChallenges(leo, [scoreChallenge({ key: LEO.key }, o, 4_800_000, at(H))], k, () => false, at(H));
  mergeMyChallenges(leo, [scoreChallenge({ key: LEO.key }, o, 4_600_000, at(2 * H))], k, () => false, at(2 * H));
  assert.equal(myChallenges(leo, k, at(3 * H))[0]!.mine, 4_800_000, 'la meilleure reste');
  assert.equal(leo.notes.filter((n) => n.kind === 'score').length, 1, 'une note par joueur');
  // Nina remonte son score pendant la fenêtre : c'est un duel, son meilleur compte aussi.
  mergeMyChallenges(leo, [scoreChallenge({ key: NINA.key }, o, 5_100_000, at(4 * H))], k, () => false, at(4 * H));
  const c = myChallenges(leo, k, at(5 * H))[0]!;
  assert.equal(c.theirs, 5_100_000);
  assert.equal(c.leader, 'them');
  // Une note signée après l'échéance n'entre pas.
  const late = scoreChallenge({ key: LEO.key }, o, 9_000_000, at(CHALLENGE_MS + 10 * 60_000));
  assert.equal(mergeMyChallenges(leo, [late], k, () => false, at(CHALLENGE_MS + 11 * 60_000)).length, 0);
  // Le relais garde aussi la meilleure, et la redonne.
  const relay: ChallengeRelay = new Map();
  mergeChallengeRelay(relay, [o, scoreChallenge({ key: LEO.key }, o, 10, at(H))], at(H));
  assert.equal(mergeChallengeRelay(relay, [scoreChallenge({ key: LEO.key }, o, 5, at(2 * H))], at(2 * H)).length, 0, 'plus basse : rien de neuf');
  assert.equal(mergeChallengeRelay(relay, [scoreChallenge({ key: LEO.key }, o, 50, at(2 * H))], at(2 * H)).length, 1);
  assert.equal(challengeSample(relay, [], at(3 * H)).length, 2);
  assert.equal(challengeSample(relay, [], at(CHALLENGE_MS + CHALLENGE_GRACE_MS + 1000)).length, 0, 'oubliées après l’échéance');
});

test('mes défis : une note d’un inconnu au défi, un joueur écarté, trop de défis du même joueur sont laissés', () => {
  const o = offer();
  const k = LEO.key.publicKey;
  const leo = storeWith([o], k);
  // Zoé n'est pas du défi : sa note de score ne compte pas.
  assert.equal(mergeMyChallenges(leo, [scoreChallenge({ key: ZOE.key }, o, 9_000_000, at(H))], k, () => false, at(H)).length, 0);
  // Un défi qui ne me concerne pas reste au relais seulement.
  const other = offerChallenge(me(NINA), pub(ZOE), TABLE, 100, 'best', T0);
  assert.equal(mergeMyChallenges(leo, [other], k, () => false, T0).length, 0);
  // Un joueur bloqué : ses défis ne m'arrivent pas.
  assert.equal(mergeMyChallenges(emptyChallenges(), [o], k, (key) => key === NINA.key.publicKey, T0).length, 0);
  // Au-delà de trois défis en cours venus de Nina, les suivants sont laissés.
  const s = emptyChallenges();
  for (let i = 0; i < 5; i++) mergeMyChallenges(s, [offerChallenge(me(NINA), pub(LEO), { ...TABLE, board: `${i}`.repeat(10) }, 100, 'best', T0)], k, () => false, T0);
  assert.equal(myChallenges(s, k, T0).length, 3);
  // Défier : pas soi-même, pas deux fois la même table au même joueur.
  const list = myChallenges(storeWith([o], NINA.key.publicKey), NINA.key.publicKey, T0);
  assert.ok(challengeBlocked(list, NINA.key.publicKey, TABLE, NINA.key.publicKey));
  assert.ok(challengeBlocked(list, k, TABLE, NINA.key.publicKey), 'déjà en cours');
  assert.equal(challengeBlocked(list, k, { ...TABLE, balls: 5 }, NINA.key.publicKey), undefined, 'autre version : un autre défi');
});

test('nouvelles : reçu, battu par l’autre, plus que 6 h, résultat ; chacune une fois, une seule ligne d’Activité par défi', () => {
  const o = offer();
  const k = NINA.key.publicKey;
  const nina = storeWith([o], k);
  assert.deepEqual(challengeNews(nina, k, at(H)).map((n) => n.stage), [], 'envoyé : rien à annoncer');
  mergeMyChallenges(nina, [scoreChallenge({ key: LEO.key }, o, 5_000_000, at(2 * H))], k, () => false, at(2 * H));
  const beaten = challengeNews(nina, k, at(2 * H));
  assert.deepEqual(beaten.map((n) => n.stage), ['beaten']);
  assert.deepEqual(challengeNews(nina, k, at(2 * H)), [], 'pas deux fois');
  assert.deepEqual(challengeNews(nina, k, at(CHALLENGE_MS - 5 * H)).map((n) => n.stage), ['expiring']);
  assert.deepEqual(challengeNews(nina, k, at(CHALLENGE_MS + 1000)).map((n) => n.stage), ['lost']);
  const leo = storeWith([o], LEO.key.publicKey);
  assert.deepEqual(challengeNews(leo, LEO.key.publicKey, at(H)).map((n) => n.stage), ['received']);
  // Une ligne d'Activité par défi : ses nouvelles la rejoignent, la dernière la dit, non lue.
  const log = emptyActivity();
  const event = (stage: 'received' | 'beaten' | 'lost', when: Date) => ({ kind: 'challenge' as const, key: `${o.id}|${stage}`, at: when.getTime(), who: 'Léo', player: LEO.key.publicKey, thread: o.id, subject: 'Medieval Madness', stage });
  for (const [stage, when] of [['received', at(H)], ['beaten', at(20 * H)], ['lost', at(CHALLENGE_MS + 1000)]] as const) addActivity(log, { kind: 'challenge', facts: activityFacts(event(stage, when)), at: when.getTime() });
  assert.equal(log.entries.length, 1, 'une ligne pour tout le défi, même sur trois jours');
  assert.equal(log.entries[0]!.stage, 'lost');
  assert.equal(log.entries[0]!.read, false);
  assert.equal(noticeText('challenge', [event('beaten', at(20 * H))]).title, 'Léo a battu ton score : à toi');
  assert.equal(noticeText('challenge', [event('received', at(H))]).title, 'Léo te défie');
});

test('XP : +40 au vainqueur, dans le plafond du jeu, au plus trois défis payés par jour', () => {
  let s = emptyLevels();
  const day = new Date(2026, 10, 22, 12);
  for (let i = 0; i < CHALLENGE_WINS_PER_DAY + 1; i++) s = challengeGains(s, { table: 'Medieval Madness', at: day }).state;
  assert.equal(s.xp, CHALLENGE_WINS_PER_DAY * XP.challengeWin);
  assert.equal(XP.challengeWin, 40);
  // Le plafond du jeu atteint : rien de plus.
  const full = { ...emptyLevels(), days: { '2026-11-22': { xp: DAILY_PLAY_CAP, seconds: 0, games: 0 } } };
  assert.equal(challengeGains(full, { table: 'Medieval Madness', at: day }).gains.length, 0);
  assert.equal(s.gains[0]!.kind, 'challenge-win');
});

test('le fichier : relu tel quel, chaque note revérifiée ; un résultat se garde une semaine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-defis-'));
  try {
    const file = path.join(dir, 'amis', 'defis.json');
    const o = offer();
    const s = storeWith([o, scoreChallenge({ key: LEO.key }, o, 5_000_000, at(H))], NINA.key.publicKey);
    s.paid.push(o.id);
    saveChallenges(file, s);
    const back = loadChallenges(file, at(CHALLENGE_MS + 3 * 24 * H)).store;
    assert.equal(back.notes.length, 2, 'relu bien après l’échéance');
    assert.deepEqual(back.paid, [o.id]);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as ChallengeStore;
    (raw.notes[0] as { score: number }).score = 1;
    fs.writeFileSync(file, JSON.stringify(raw));
    assert.equal(loadChallenges(file, at(H)).store.notes.length, 1, 'une note changée sur le disque est écartée');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Le service de la borne (app/src/challenge-service.ts)

interface Service {
  start(): void;
  stop(): void;
  list(): { id: string; state: string; mine?: number }[];
  offer(to: object, table: object, score: number, source: string): { challenge?: { id: string } } & { reason?: string };
  gamePlayed(version: { board: string; balls?: number }, scores: readonly number[]): void;
  tick(): void;
  unavailable(): string | undefined;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const serviceModule = require(path.join(REPO_ROOT, 'app', 'dist', 'challenge-service.js')) as { createChallengeService(h: object): Service };
/* eslint-enable @typescript-eslint/no-require-imports */

function service(who: SocialState, o: { closed?: boolean; now: () => Date }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-defis-svc-'));
  const sent: ChallengeNote[] = [];
  const pushed: { stage?: string }[] = [];
  const won: string[] = [];
  let listener: (n: ChallengeNote[]) => void = () => undefined;
  const svc = serviceModule.createChallengeService({
    dataDir: dir,
    net: fakeSocialNet({
      state: () => ({ ...who, enabled: true, blocked: [] }),
      country: () => 'FR',
      sendChallenges: (n: ChallengeNote[]) => void sent.push(...n),
      onChallenges: (l: (n: ChallengeNote[]) => void) => ((listener = l), () => undefined),
    }),
    refused: () => false,
    won: (table: string) => (won.push(table), XP.challengeWin),
    push: (e: { stage?: string }[]) => pushed.push(...e),
    closed: () => o.closed === true,
    changed: () => undefined,
    log: () => undefined,
    now: o.now,
    timer: false,
  });
  svc.start();
  return { svc, sent, pushed, won, receive: (n: ChallengeNote[]) => listener(n), dir };
}

test('service : seule une partie sur la version exacte compte ; le vainqueur est payé une fois', () => {
  let now = T0;
  const o = offer();
  const leo = service(LEO, { now: () => now });
  try {
    leo.receive([o]);
    assert.deepEqual(leo.pushed.map((e) => e.stage), ['received']);
    // Autre nombre de billes, autre empreinte : rien ne part.
    leo.svc.gamePlayed({ board: TABLE.board, balls: 5 }, [9_000_000]);
    leo.svc.gamePlayed({ board: 'c'.repeat(10), balls: 3 }, [9_000_000]);
    assert.equal(leo.sent.length, 0);
    // La bonne version : le score part, signé.
    now = at(H);
    leo.svc.gamePlayed({ board: TABLE.board, balls: 3 }, [3_000_000, 5_000_000]);
    assert.equal(leo.sent.length, 1);
    assert.equal((leo.sent[0] as { score: number }).score, 5_000_000);
    assert.ok(verifyChallengeNote(leo.sent[0], now));
    // Une partie moins bonne : rien de plus.
    leo.svc.gamePlayed({ board: TABLE.board, balls: 3 }, [4_000_000]);
    assert.equal(leo.sent.length, 1);
    // L'échéance passée et acquise : Léo gagne, payé une fois.
    now = at(CHALLENGE_MS + CHALLENGE_SETTLE_MS + 1000);
    leo.svc.tick();
    leo.svc.tick();
    assert.deepEqual(leo.won, ['Medieval Madness']);
    assert.ok(leo.pushed.some((e) => e.stage === 'won'));
    assert.equal(leo.svc.list()[0]!.state, 'won');
  } finally {
    leo.svc.stop();
    fs.rmSync(leo.dir, { recursive: true, force: true });
  }
});

test('jeu local : les défis disparaissent, rien ne s’annonce ni ne part', () => {
  const nina = service(NINA, { closed: true, now: () => T0 });
  try {
    nina.receive([offerChallenge(me(LEO), pub(NINA), TABLE, 100, 'best', T0)]);
    assert.deepEqual(nina.svc.list(), []);
    assert.deepEqual(nina.pushed, []);
    assert.ok(nina.svc.unavailable());
    assert.ok(nina.svc.offer(pub(LEO), TABLE, 100, 'best').reason);
    nina.svc.gamePlayed({ board: TABLE.board, balls: 3 }, [9_000]);
    assert.equal(nina.sent.length, 0);
  } finally {
    nina.svc.stop();
    fs.rmSync(nina.dir, { recursive: true, force: true });
  }
});

interface Card {
  key: string;
  eyebrow?: string;
  title: string;
  aside?: string;
  buttons?: { label: string; key: string; off?: string; xp?: string; run(): void }[];
}
interface Menu {
  sections(here: () => void): { sections: { title?: string; cards: Card[] }[] };
  playCards(here: () => void, max?: number): Card[];
  attention(): boolean;
  boardPage(): { id: string; foot: string } | undefined;
  button(p: object, table: object | undefined, score: number | undefined, source: string, key: string, after: () => void): { label: string; off?: string; xp?: string; run(): void };
}
/* eslint-disable @typescript-eslint/no-require-imports */
const menuModule = require(path.join(REPO_ROOT, 'app', 'dist', 'challenges-menu.js')) as { createChallengesMenu(h: object): Menu };
/* eslint-enable @typescript-eslint/no-require-imports */

test('écrans : « Défi de Nina » à jouer ; autre version grisée ou à récupérer ; « Défier » d’un geste ; la page de l’affiche', () => {
  let now = at(H);
  const leo = service(LEO, { now: () => now });
  const nina = service(NINA, { now: () => now });
  const played: string[] = [];
  let local: 'mine' | 'other' | 'missing' = 'mine';
  let holders: { key: string; name: string; fetch(): void }[] = [];
  const menuOf = (svc: Service) =>
    menuModule.createChallengesMenu({
      library: { openCustom: () => undefined },
      service: svc,
      localFor: () => (local === 'mine' ? { state: 'mine', table: { id: 'mm', title: 'Medieval Madness' } } : local === 'other' ? { state: 'other', tables: [] } : { state: 'missing' }),
      face: (p: { key: string; name: string }) => ({ key: p.key, name: p.name, initials: 'N', hue: 0 }),
      versionHolders: () => holders,
      play: (t: { id: string }) => played.push(t.id),
      versionOf: () => ({ state: 'ok', board: TABLE.board, balls: 3 }),
      myBest: () => 4_512_300,
      candidates: () => [],
      recentTables: () => [],
      now: () => now,
    });
  try {
    // Nina défie Léo d'un geste (« Ta place est prise », retour de partie).
    const ninaMenu = menuOf(nina.svc);
    const b = ninaMenu.button(pub(LEO), TABLE, 4_000_000, 'best', 'challenge', () => undefined);
    assert.equal(b.label, 'Défier Léo');
    assert.equal(b.xp, '+40 XP');
    b.run();
    assert.equal(nina.sent.length, 1);
    assert.equal((nina.sent[0] as { score: number }).score, 4_512_300, 'son meilleur sur cette version, pas moins');
    assert.equal(ninaMenu.button(pub(LEO), TABLE, 4_000_000, 'best', 'challenge', () => undefined).off, 'Défi envoyé');
    // Léo le reçoit : la carte « Défi de Nina », le score à battre, Jouer +40 XP, Refuser.
    leo.receive(nina.sent);
    const leoMenu = menuOf(leo.svc);
    assert.ok(leoMenu.attention());
    const card = leoMenu.playCards(() => undefined)[0]!;
    assert.equal(card.eyebrow, 'Défi de Nina');
    assert.equal(card.title, 'Medieval Madness');
    assert.deepEqual(card.buttons!.map((x) => [x.label, x.off]), [['Jouer', undefined], ['Refuser', undefined]]);
    card.buttons![0]!.run();
    assert.deepEqual(played, ['mm']);
    assert.equal(leoMenu.sections(() => undefined).sections[0]!.title, 'À jouer');
    // Une autre version que la sienne : grisée, ou « Récupérer cette version » chez un ami qui l'a.
    local = 'other';
    assert.equal(leoMenu.playCards(() => undefined)[0]!.buttons![0]!.off, 'Autre version que la tienne');
    holders = [{ key: NINA.key.publicKey, name: 'Nina', fetch: () => undefined }];
    assert.equal(leoMenu.playCards(() => undefined)[0]!.buttons![0]!.label, 'Récupérer cette version');
    local = 'missing';
    holders = [];
    assert.equal(leoMenu.playCards(() => undefined)[0]!.buttons![0]!.off, 'Table absente de cette borne');
    // Plus que quelques heures : la page de l'affiche à points.
    assert.equal(leoMenu.boardPage(), undefined);
    now = at(CHALLENGE_MS);
    assert.match(leoMenu.boardPage()!.foot, /^Défi de Nina : plus que 1 h$/);
  } finally {
    for (const s of [leo, nina]) {
      s.svc.stop();
      fs.rmSync(s.dir, { recursive: true, force: true });
    }
  }
});

test('frontend : le service des défis lit le jeu local, et une partie seule sur sa version exacte le nourrit', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /const challengeService = createChallengeService\(\{[\s\S]*?closed: \(\) => socialClosed\(\),/);
  assert.match(front, /await noteChallengeScores\(table, kept, Boolean\(double && live\?\.multi\)\);/);
  assert.match(front, /async function noteChallengeScores[\s\S]*?if \(guest\.active \|\| multi \|\| !solo\.length \|\| vpxInstall\(loc\)\?\.trial\) return;/);
});

// ---------------------------------------------------------------------------
// Le vrai réseau des bornes (app/src/social-net.ts), en 127.0.0.1

interface Net {
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  state(): SocialState;
  sendChallenges(notes: readonly ChallengeNote[]): void;
  setChallengeSource(own: () => readonly ChallengeNote[], peers: () => readonly string[]): void;
  onChallenges(listener: (notes: ChallengeNote[]) => void): () => void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(REPO_ROOT, 'app', 'dist', 'social-net.js')) as { createSocialNet(o: object): Net };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

test('réseau des bornes : le défi arrive par une troisième borne quand celle qui l’a lancé est éteinte', { timeout: 300_000 }, async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = [0, 1, 2].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-defis-net-${i}-`)));
  const [a, b, c] = dirs.map((d) => netModule.createSocialNet({ dataDir: d, mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap })) as [Net, Net, Net];
  let bStarted = false;
  let aStopped = false;
  try {
    a.rename('Kiko');
    b.rename('Nova');
    c.rename('Lux');
    await Promise.all([a.start(), c.start()]);
    const atC: ChallengeNote[] = [];
    c.onChallenges((n) => atC.push(...n));
    const o = offerChallenge({ key: a.state().key, name: 'Kiko' }, { key: b.state().key.publicKey, name: 'Nova' }, TABLE, 1234, 'best', new Date());
    // Kiko défie Nova, éteinte : Lux, qui n'est l'ami de personne, garde le défi.
    await until('défi gardé chez Lux', () => (a.sendChallenges([o]), atC.some((n) => n.id === o.id)));
    await a.stop();
    aStopped = true;
    const atB: ChallengeNote[] = [];
    b.onChallenges((n) => atB.push(...n));
    await b.start();
    bStarted = true;
    await until('défi remis à Nova par Lux', () => atB.some((n) => n.id === o.id && n.kind === 'offer'));
    assert.equal(b.state().friends.length, 0, 'pas amis');
  } finally {
    await Promise.all([...(aStopped ? [] : [a.stop()]), ...(bStarted ? [b.stop()] : []), c.stop()]);
    await testnet.destroy();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});
