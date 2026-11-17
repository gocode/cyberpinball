// Niveaux et badges (levels.ts, badges.ts) : les règles décidées le 17/11/2026, fixées ici.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { BADGES, badgeShape, badgeXp, FAMILY_BACKDROP, nearestBadges, RARITY_XP } from '../badges';
import { ICON_NAMES } from '../icons';
import { setLanguage } from '../i18n';
import {
  BADGES_XP_ALL,
  celebrate,
  DAILY_PLAY_CAP,
  DAILY_SOCIAL_CAP,
  emptyLevels,
  friendsGains,
  gameGains,
  levelNeed,
  levelOf,
  levelStart,
  liveGains,
  loadLevels,
  noteStanding,
  placeXp,
  plausibleXp,
  receivedGains,
  roomMessageGains,
  saveLevels,
  settleWeeks,
  shownLevel,
  START_XP_MAX,
  startLevels,
  startXp,
  tierOf,
  weekKey,
  type GameFacts,
} from '../levels';

const table = { title: 'Comet Chaser', vpsId: 'abc123' };
const at = (s: string) => new Date(s);
const game = (over: Partial<GameFacts> = {}): GameFacts => ({ table, seconds: 600, entered: [], newTable: false, at: at('2026-11-18T20:00:00'), ...over });

test('niveaux : la courbe, du niveau n au niveau n + 1 = 100 + 50 × (n − 1) XP', () => {
  assert.equal(levelNeed(1), 100);
  assert.equal(levelNeed(14), 750);
  assert.equal(levelStart(2), 100);
  assert.equal(levelStart(10), 2700);
  assert.equal(levelStart(20), 10_450);
  assert.equal(levelOf(99).level, 1);
  assert.equal(levelOf(100).level, 2);
  const v = levelOf(levelStart(14) + 380);
  assert.deepEqual([v.level, v.into, v.need], [14, 380, 750]);
  assert.deepEqual([tierOf(1), tierOf(9), tierOf(10), tierOf(29), tierOf(59), tierOf(60), tierOf(140)], ['novice', 'novice', 'flippeur', 'habitue', 'sorcier', 'legende', 'legende']);
});

test('niveaux : une partie rapporte ses minutes, sa fin, la première du jour et une table neuve', () => {
  const r = gameGains(emptyLevels(), game({ seconds: 14 * 60 + 30, scores: [1_200_000], newTable: true }));
  assert.deepEqual(r.gains.map((g) => [g.kind, g.xp]), [['play', 14], ['game', 10], ['first-of-day', 20], ['new-table', 50]]);
  assert.equal(r.state.xp, 94);
  const second = gameGains(r.state, game({ seconds: 300, scores: [800_000] }));
  assert.ok(!second.gains.some((g) => g.kind === 'first-of-day'), 'une seule première partie par jour');
});

test('niveaux : une table laissée ouverte sans jouer ne rapporte pas ses minutes', () => {
  const r = gameGains(emptyLevels(), game({ seconds: 3600, scores: [0] }));
  assert.ok(!r.gains.some((g) => g.kind === 'play'));
  const long = gameGains(emptyLevels(), game({ seconds: 5 * 3600 }));
  assert.equal(long.gains.find((g) => g.kind === 'play')?.xp, 60, 'au plus 60 minutes par partie');
});

test('niveaux : record personnel, posé par le premier score, payé une fois par table et par jour', () => {
  let s = gameGains(emptyLevels(), game({ scores: [1_000_000] })).state;
  assert.equal(s.beaten, 0, 'le premier score ne bat rien');
  const r = gameGains(s, game({ scores: [2_500_000] }));
  assert.equal(r.gains.find((g) => g.kind === 'personal-best')?.xp, 25);
  assert.deepEqual([r.state.beaten, r.state.doubled], [1, 1]);
  s = r.state;
  const again = gameGains(s, game({ scores: [3_000_000] }));
  assert.ok(!again.gains.some((g) => g.kind === 'personal-best'), 'pas deux fois le même jour sur la même table');
  assert.equal(again.state.beaten, 2, 'compté quand même pour les badges');
});

test('niveaux : tableau d’honneur et meilleur score, plafond quotidien du jeu', () => {
  assert.equal(gameGains(emptyLevels(), game({ entered: [3] })).gains.find((g) => g.kind === 'honor')?.xp, 50);
  assert.equal(gameGains(emptyLevels(), game({ entered: [1, 4] })).gains.find((g) => g.kind === 'champion')?.xp, 100);
  let s = emptyLevels();
  let total = 0;
  for (let i = 0; i < 20; i++) {
    const r = gameGains(s, game({ seconds: 3600, scores: [1000 + i], newTable: true, table: { title: `Table ${i}` } }));
    s = r.state;
    total += r.gains.reduce((a, g) => a + g.xp, 0);
  }
  assert.equal(total, DAILY_PLAY_CAP, 'jamais plus de 600 XP de jeu par jour');
  const tomorrow = gameGains(s, game({ at: at('2026-11-19T20:00:00') }));
  assert.ok(tomorrow.gains.length > 0, 'le plafond repart le lendemain');
});

test('niveaux : parties en ligne et vie sociale', () => {
  const live = liveGains(emptyLevels(), { done: true, won: true, table: 'Comet Chaser', at: at('2026-11-18T21:00:00') });
  assert.deepEqual(live.gains.map((g) => g.xp), [20, 20]);
  let s = emptyLevels();
  const day = at('2026-11-18T10:00:00');
  const first = roomMessageGains(s, day);
  assert.equal(first.gains[0]?.xp, 10);
  assert.equal(roomMessageGains(first.state, at('2026-11-18T23:00:00')).gains.length, 0, 'un seul jour de salon par jour');
  assert.equal(first.state.roomDays, 1);
  s = first.state;
  const friends = friendsGains(s, ['k'.repeat(40), 'j'.repeat(40)], day);
  assert.equal(friends.gains.length, 2);
  assert.equal(friendsGains(friends.state, ['k'.repeat(40)], day).gains.length, 0, 'un ami ne rapporte qu’une fois');
  const quiet = friendsGains(emptyLevels(), ['k'.repeat(40)], day, true);
  assert.deepEqual([quiet.gains.length, quiet.state.friendKeys.length], [0, 1], 'les amis d’avant : comptés sans XP');
  const ids = Array.from({ length: 60 }, (_, i) => `f${i}|e${i}`);
  const likes = receivedGains(friends.state, { likes: ids, reactions: [] }, day);
  const social = [...first.gains, ...friends.gains, ...likes.gains].reduce((a, g) => a + g.xp, 0);
  assert.equal(social, DAILY_SOCIAL_CAP, 'jamais plus de 100 XP de vie sociale par jour');
  assert.equal(receivedGains(likes.state, { likes: ids.slice(0, 10), reactions: [] }, at('2026-11-19T10:00:00')).gains.length, 0, 'un « J’aime » ne compte qu’une fois');
  assert.equal(likes.state.likesCounted, 60, 'compté pour les badges même au-delà du plafond');
});

test('niveaux : classements de la semaine, versés le mardi, la meilleure portée par table', () => {
  assert.equal(placeXp('world', { rank: 1, players: 10 }), 300);
  assert.equal(placeXp('world', { rank: 1, players: 9 }), 0, 'trop peu de joueurs classés');
  assert.equal(placeXp('country', { rank: 4, players: 5 }), 40);
  assert.equal(placeXp('country', { rank: 11, players: 50 }), 0);
  assert.equal(placeXp('friends', { rank: 2, players: 3 }), 15);
  const week = weekKey(at('2026-11-18T12:00:00'));
  assert.equal(week, '2026-11-16');
  let s = noteStanding(emptyLevels(), week, 'b1', { title: 'Comet Chaser', world: { rank: 23, players: 400 }, country: { rank: 4, players: 30 } }, false);
  // Semaine close : un meilleur score sorti de la mémoire de la borne ne fait jamais gagner une place.
  s = noteStanding(s, week, 'b1', { title: 'Comet Chaser', world: { rank: 12, players: 380 }, country: { rank: 6, players: 30 } }, true);
  assert.deepEqual([s.standings[week]!.b1!.world!.rank, s.standings[week]!.b1!.country!.rank], [23, 6]);
  assert.equal(settleWeeks(s, at('2026-11-23T12:00:00')).gains.length, 0, 'lundi : pas encore');
  const paid = settleWeeks(s, at('2026-11-24T00:30:00'));
  assert.deepEqual(paid.gains.map((g) => [g.kind, g.xp, g.scope]), [['ranking', 40, 'country']]);
  assert.equal(paid.state.feats.countryTop10, 1);
  assert.equal(settleWeeks(paid.state, at('2026-11-25T00:00:00')).gains.length, 0, 'une semaine n’est versée qu’une fois');
  let many = emptyLevels();
  for (let i = 0; i < 14; i++) many = noteStanding(many, week, `b${i}`, { title: `T${i}`, world: { rank: 1, players: 50 } }, false);
  assert.equal(settleWeeks(many, at('2026-11-24T01:00:00')).gains.length, 10, 'au plus dix tables par semaine');
});

test('niveaux : niveau de départ plafonné, moment à montrer, vraisemblance', () => {
  assert.equal(startXp({ games: 1_000_000, tables: 500, seconds: 1e9 }, { records: 0, championTables: 0 }), START_XP_MAX);
  const s = startLevels(emptyLevels(), 2700, at('2026-11-18T10:00:00'));
  assert.equal(levelOf(s.xp).level, 10);
  assert.equal(s.pending?.start, true);
  assert.equal(startLevels(s, 9999, at('2026-11-19T10:00:00')).xp, 2700, 'une seule fois');
  const c = celebrate({ ...s, xp: s.xp + 150 }, s.xp, ['explorer'], at('2026-11-18T11:00:00'));
  assert.deepEqual([c.pending?.badges, c.pending?.from, c.pending?.to, c.pending?.start], [['explorer'], 0, 2850, true], 'le moment qui attend grossit');
  assert.ok(plausibleXp(0) >= START_XP_MAX + BADGES_XP_ALL);
  assert.equal(shownLevel(plausibleXp(3) + 1, at('2026-11-15T12:00:00').toISOString(), at('2026-11-18T12:00:00')), undefined, 'invraisemblable : « ? »');
  assert.equal(shownLevel(levelStart(14), at('2026-11-15T12:00:00').toISOString(), at('2026-11-18T12:00:00')), 14);
});

test('niveaux : le fichier se relit, un fichier illisible est mis de côté', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-niveau-'));
  try {
    let s = gameGains(emptyLevels(), game({ scores: [5000], newTable: true })).state;
    s = noteStanding(s, '2026-11-16', 'b1', { title: 'Comet Chaser', world: { rank: 3, players: 40 } }, false);
    saveLevels(dir, s);
    assert.deepEqual(loadLevels(dir).state, s);
    fs.writeFileSync(path.join(dir, 'niveau.json'), '{ pas du json');
    const bad = loadLevels(dir, at('2026-11-18T10:00:00'));
    assert.equal(bad.state.xp, 0);
    assert.ok(bad.setAside && fs.existsSync(bad.setAside));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('badges : 56 badges, identifiants uniques, icônes connues, XP et formes par rareté', () => {
  assert.equal(BADGES.length, 56);
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
  for (const b of BADGES) {
    assert.ok((ICON_NAMES as readonly string[]).includes(b.icon), `icône de ${b.id}`);
    assert.ok(FAMILY_BACKDROP[b.family], `fond de la famille de ${b.id}`);
    assert.ok(b.target > 0 && b.label && b.detail);
    if (b.secret) assert.ok(b.hint, `indice de ${b.id}`);
  }
  assert.equal(BADGES.reduce((a, b) => a + RARITY_XP[b.rarity], 0), BADGES_XP_ALL, 'BADGES_XP_ALL suit le catalogue');
  const count = (r: string) => BADGES.filter((b) => b.rarity === r).length;
  assert.deepEqual([count('common'), count('rare'), count('epic'), count('legendary')], [18, 18, 13, 7]);
  for (const id of ['first-game', 'ten-tables', 'hundred-games', 'hour-on-table', 'ten-hours', 'first-record', 'grand-champion', 'five-champion']) assert.ok(BADGES.some((b) => b.id === id), `ancien identifiant gardé : ${id}`);
  assert.equal(badgeXp('explorer'), 150);
  assert.equal(badgeXp('inconnu'), 0);
  assert.deepEqual([badgeShape('common'), badgeShape('rare'), badgeShape('legendary')], ['round', 'hex', 'hex']);
  const near = nearestBadges([], { games: 7, tables: 19, seconds: 0, longestTable: 0, records: 0, championTables: 0 });
  assert.equal(near[0]?.badge.id, 'explorer', '19 tables sur 25 : le plus proche');
  assert.ok(!near.some((x) => x.badge.secret));
});

test('badges : un nom tient dans sa colonne du profil sans se couper au milieu d’un mot (FR et EN)', () => {
  // La colonne de .lib-medals (minmax(14cqmin)) tient 12 lettres en 1,86 cqmin ; au-delà, le nom
  // déborderait ou se couperait (« Ambassadeu / r », 17/11/2026).
  const css = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'app', 'renderer', 'library.css'), 'utf8');
  const rule = (sel: string) => new RegExp(`\\n${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const label = rule('.lib-medal-label');
  assert.ok(label, 'règle .lib-medal-label');
  assert.doesNotMatch(label, /overflow-wrap:\s*(anywhere|break-word)|word-break:\s*break-all|hyphens:\s*auto/, 'jamais de coupure dans un mot');
  assert.match(rule('.lib-medals'), /minmax\(14cqmin/, 'colonne de 14 cqmin');
  try {
    for (const lang of ['fr', 'en'] as const) {
      setLanguage(lang);
      for (const b of BADGES) {
        for (const word of b.label.split(/[\s ]+/)) assert.ok([...word].length <= 12, `${lang} : « ${word} » (${b.id}) dépasse 12 lettres`);
      }
    }
  } finally {
    setLanguage('fr');
  }
});
