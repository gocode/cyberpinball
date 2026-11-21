// Tables du jour (packages/core/src/dailytables.ts, maquettes de l'engagement validées le
// 21/11/2026). Ces tests fixent :
// - mes parties se comptent par version exacte et nombre de billes, et partent dans la carte publique
//   signée, plafonnées ; une carte d'avant (sans parties) se vérifie toujours ; des parties mal formées
//   font refuser la carte, des parties invraisemblables passent mais ne comptent pas (« ? ») ;
// - les tables les plus jouées dans la portée (Monde, Pays, Amis), leur record et ma place avec l'écart ;
// - deux versions d'une même table ne se mélangent jamais ;
// - « ne pas refroidir » : sous le seuil de joueurs du jour, la semaine à la place du jour ;
// - l'objectif : le joueur juste au-dessus de moi, du jour sinon de tout temps, avec l'écart.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cardPlays,
  dailyTables,
  dayKey,
  DAILY_MIN_PLAYERS,
  dayRecord,
  emptyPlays,
  emptyProfiles,
  makeCard,
  notePlay,
  PLAYS_DAY_PLAUSIBLE,
  tableObjective,
  verifyCard,
  type CardPlays,
  type DailyInput,
  type DailyPlayer,
  type RankedScore,
} from '../index';
import { newSocialState, setName } from '../social';

const NOW = new Date('2026-11-21T20:00:00');
const TODAY = dayKey(NOW);
const MONDAY = new Date('2026-11-16T20:00:00');
const hex = (c: string) => c.repeat(64);
const AFM = `${hex('a')}:${hex('1')}`;
const AFM_OTHER = `${hex('a')}:${hex('2')}`;
const TZ = `${hex('b')}:`;
const IM = `${hex('c')}:`;

let n = 0;
function score(key: string, name: string, board: string, value: number, at: Date | string = NOW, extra: Partial<RankedScore> = {}): RankedScore {
  n++;
  return { key, name, board, table: { title: board === TZ ? 'Twilight Zone' : board === IM ? 'Iron Maiden' : 'Attack from Mars' }, score: value, at: typeof at === 'string' ? at : new Date(at.getTime() - n * 1000).toISOString(), how: 'rom', sig: 'x', country: 'FR', ...extra };
}
const plays = (day: CardPlays['day'], week = day, of = TODAY): CardPlays => ({ of, day, week });
const count = (board: string, title: string, k: number) => ({ board, title, n: k });

function input(cards: DailyPlayer[], scores: RankedScore[], extra: Partial<DailyInput> = {}): DailyInput {
  return { store: { scores, hidden: [] }, cards, me: { key: 'me', name: 'Kiko', country: 'FR', xp: 3450 }, friends: new Set(['bruno']), country: 'FR', ...extra };
}

test('mes parties : comptées par version et par jour, plafonnées dans la carte, signées ; une carte d’avant se vérifie toujours', () => {
  let store = emptyPlays();
  for (let i = 0; i < 3; i++) store = notePlay(store, { board: AFM, title: 'Attack from Mars' }, NOW);
  store = notePlay(store, { board: AFM_OTHER, title: 'Attack from Mars' }, NOW);
  store = notePlay(store, { board: TZ, balls: 5, title: 'Twilight Zone' }, MONDAY);
  store = notePlay(store, { board: 'pas une version', title: 'X' }, NOW);
  const card = cardPlays(store, NOW)!;
  assert.equal(card.of, TODAY);
  assert.deepEqual(card.day.map((p) => [p.board, p.n]), [[AFM, 3], [AFM_OTHER, 1]], 'deux versions, deux comptes ; une version illisible ne compte pas');
  assert.deepEqual(card.week.map((p) => p.n).sort(), [1, 1, 3], 'la semaine reprend lundi');
  assert.equal(card.week.find((p) => p.board === TZ)?.balls, 5);
  // Plafond : jamais plus que ce qu'un joueur peut jouer en un jour.
  let many = emptyPlays();
  for (let i = 0; i < PLAYS_DAY_PLAUSIBLE + 20; i++) many = notePlay(many, { board: IM, title: 'Iron Maiden' }, NOW);
  assert.equal(cardPlays(many, NOW)!.day[0]!.n, PLAYS_DAY_PLAUSIBLE);
  // La semaine passée seulement : rien à publier.
  assert.equal(cardPlays(notePlay(emptyPlays(), { board: IM, title: 'Iron Maiden' }, new Date('2026-11-12T20:00:00')), NOW), undefined);

  const kiko = setName(newSocialState(NOW), 'Kiko')!;
  const signed = makeCard(kiko, emptyProfiles(), { records: 0, plays: card }, NOW);
  assert.deepEqual(verifyCard(signed, NOW)?.plays, card);
  assert.equal(verifyCard({ ...signed, plays: { ...card, day: [{ ...card.day[0]!, n: 99 }] } }, NOW), undefined, 'parties changées : signature fausse');
  const old = makeCard(kiko, emptyProfiles(), { records: 0 }, NOW);
  assert.equal(old.plays, undefined);
  assert.deepEqual(verifyCard(old, NOW), old, 'carte d’avant les tables du jour');
  // Mal formées : la carte est refusée ; invraisemblables : elle passe (le classement les écarte).
  const bad = makeCard(kiko, emptyProfiles(), { records: 0, plays: { of: TODAY, day: [{ board: 'x', title: 'X', n: 1 }], week: [] } }, NOW);
  assert.equal(verifyCard(bad, NOW), undefined);
  const huge = makeCard(kiko, emptyProfiles(), { records: 0, plays: plays([count(AFM, 'Attack from Mars', 5000)]) }, NOW);
  assert.ok(verifyCard(huge, NOW), 'invraisemblable mais bien formée');
});

test('tables du jour : les plus jouées, le record de la portée, ma place et l’écart au joueur juste au-dessus', () => {
  const cards: DailyPlayer[] = [
    { key: 'paul', name: 'Paul', country: 'FR', xp: 2_000, plays: plays([count(AFM, 'Attack from Mars', 6)]) },
    { key: 'lea', name: 'Léa', country: 'FR', xp: 20_000, plays: plays([count(AFM, 'Attack from Mars', 4), count(TZ, 'Twilight Zone', 2)]) },
    { key: 'bruno', name: 'Bruno', country: 'BE', xp: 9_000, plays: plays([count(TZ, 'Twilight Zone', 9)]) },
  ];
  const scores = [score('paul', 'Paul', AFM, 10_340_000), score('lea', 'Léa', AFM, 9_450_000), score('me', 'Kiko', AFM, 8_912_340), score('bruno', 'Bruno', TZ, 1_204_880_120, NOW, { country: 'BE' })];
  const me = { key: 'me', name: 'Kiko', country: 'FR', xp: 3450, plays: plays([count(AFM, 'Attack from Mars', 3)]) };
  const world = dailyTables(input(cards, scores, { me }), { scope: 'world', now: NOW });
  assert.equal(world.period, 'today');
  assert.equal(world.calm, false);
  assert.deepEqual(world.lines.map((l) => [l.title, l.plays, l.players]), [['Attack from Mars', 13, 3], ['Twilight Zone', 11, 2]]);
  const afm = world.lines[0]!;
  assert.equal(afm.record?.name, 'Paul');
  assert.ok(afm.record?.level && afm.record.level > 1, 'le niveau de l’auteur du record');
  assert.deepEqual({ rank: afm.me?.rank, above: afm.me?.above?.name, gap: afm.me?.gap }, { rank: 3, above: 'Léa', gap: 537_660 });
  // Le pays : Bruno (Belgique) en est absent ; les amis : Bruno et moi seulement.
  const country = dailyTables(input(cards, scores, { me }), { scope: 'country', now: NOW });
  assert.deepEqual(country.lines.map((l) => [l.title, l.plays]), [['Attack from Mars', 13], ['Twilight Zone', 2]]);
  const friends = dailyTables(input(cards, scores, { me }), { scope: 'friends', now: NOW, period: 'today' });
  assert.deepEqual(friends.lines.map((l) => [l.title, l.plays]), [['Twilight Zone', 9], ['Attack from Mars', 3]]);
  assert.equal(friends.lines[1]!.record?.mine, true, 'entre amis, mon score est le record');
});

test('tables du jour : deux versions d’une même table ne se mélangent jamais ; une carte invraisemblable ne compte pas (« ? »)', () => {
  const cards: DailyPlayer[] = [
    { key: 'a', name: 'Aster', country: 'FR', plays: plays([count(AFM, 'Attack from Mars', 2)]) },
    { key: 'b', name: 'Bille', country: 'FR', plays: plays([count(AFM_OTHER, 'Attack from Mars', 5)]) },
    { key: 'c', name: 'Comète', country: 'FR', plays: plays([count(AFM, 'Attack from Mars', PLAYS_DAY_PLAUSIBLE + 1)]) },
  ];
  const board = dailyTables(input(cards, [score('b', 'Bille', AFM_OTHER, 50_000)]), { scope: 'world', now: NOW, period: 'today' });
  assert.equal(board.lines.length, 2, 'deux lignes : une par version');
  const other = board.lines.find((l) => l.board === AFM_OTHER)!;
  const mine = board.lines.find((l) => l.board === AFM)!;
  assert.equal(other.record?.name, 'Bille');
  assert.equal(mine.record, undefined, 'le score d’une autre version n’est pas le record de la mienne');
  assert.equal(mine.plays, 2, 'les parties invraisemblables de Comète écartées');
  assert.equal(mine.unsure, true, 'et la table le dit');
});

test('ne pas refroidir : sous le seuil de joueurs du jour, la semaine à la place du jour ; une borne d’avant compte par ses scores', () => {
  const yesterday = new Date('2026-11-20T21:00:00');
  // Un seul joueur aujourd'hui (moi) : la semaine se montre.
  const cards: DailyPlayer[] = [
    { key: 'a', name: 'Aster', country: 'FR', plays: plays([], [count(IM, 'Iron Maiden', 4)], dayKey(yesterday)) },
    // Borne d'avant : pas de parties dans sa carte, un score publié hier.
    { key: 'b', name: 'Bille', country: 'FR' },
  ];
  const me = { key: 'me', name: 'Kiko', country: 'FR', plays: plays([count(TZ, 'Twilight Zone', 1)]) };
  const scores = [score('b', 'Bille', IM, 98_210_500, yesterday)];
  const calm = dailyTables(input(cards, scores, { me }), { scope: 'world', now: NOW });
  assert.ok(calm.dayPlayers < DAILY_MIN_PLAYERS);
  assert.equal(calm.period, 'week');
  assert.equal(calm.calm, true);
  assert.deepEqual(calm.lines.map((l) => [l.title, l.plays, l.players]), [['Iron Maiden', 5, 2], ['Twilight Zone', 1, 1]]);
  assert.equal(calm.lines[0]!.record?.name, 'Bille', 'le record de la semaine');
  // Trois joueurs aujourd'hui : le jour.
  const busy = dailyTables(input([...cards, { key: 'c', name: 'Comète', country: 'FR', plays: plays([count(TZ, 'Twilight Zone', 1)]) }, { key: 'd', name: 'Delta', country: 'FR', plays: plays([count(TZ, 'Twilight Zone', 2)]) }], scores, { me }), { scope: 'world', now: NOW });
  assert.equal(busy.period, 'today');
  assert.deepEqual(busy.lines.map((l) => [l.title, l.plays]), [['Twilight Zone', 4]]);
});

test('objectif : le joueur juste au-dessus de moi, du jour sinon de tout temps ; premier score à faire sinon', () => {
  const lastMonth = '2026-10-02T20:00:00.000Z';
  const scores = [score('paul', 'Paul', AFM, 10_340_000), score('lea', 'Léa', AFM, 9_450_000), score('me', 'Kiko', AFM, 8_912_340), score('nina', 'Nina', AFM, 4_000_000)];
  const o = tableObjective(input([], scores), { board: AFM }, { now: NOW })!;
  assert.deepEqual({ scope: o.scope, period: o.period, target: o.target?.name, gap: o.gap, myRank: o.myRank }, { scope: 'country', period: 'today', target: 'Léa', gap: 537_660, myRank: 3 });
  // Pas encore joué aujourd'hui : mon record de tout temps (relevé sur la borne) sert de référence.
  const o2 = tableObjective(input([], scores.filter((s) => s.key !== 'me')), { board: AFM }, { now: NOW, myBest: 9_500_000 })!;
  assert.equal(o2.target?.name, 'Paul');
  assert.equal(o2.gap, 840_000);
  // Premier du jour : le joueur au-dessus de tout temps.
  const o3 = tableObjective(input([], [score('me', 'Kiko', AFM, 12_000_000), score('theo', 'Théo', AFM, 15_000_000, lastMonth)]), { board: AFM }, { now: NOW })!;
  assert.deepEqual({ period: o3.period, target: o3.target?.name, gap: o3.gap }, { period: 'all', target: 'Théo', gap: 3_000_000 });
  // Premier partout : rien à battre, je le suis.
  const o4 = tableObjective(input([], [score('me', 'Kiko', AFM, 12_000_000)]), { board: AFM }, { now: NOW })!;
  assert.equal(o4.leader, true);
  assert.equal(o4.target, undefined);
  // Personne : pas d'objectif (« votre prochain score sera le premier »).
  assert.equal(tableObjective(input([], []), { board: AFM }, { now: NOW }), undefined);
  // Pays sans personne : le monde.
  const abroad = tableObjective(input([], [score('x', 'Xu', AFM, 9_000_000, NOW, { country: 'JP' })]), { board: AFM }, { now: NOW })!;
  assert.equal(abroad.scope, 'world');
  // Une autre version : jamais l'objectif de la mienne.
  assert.equal(tableObjective(input([], [score('x', 'Xu', AFM_OTHER, 9_000_000)]), { board: AFM }, { now: NOW }), undefined);
  // Le record du jour, exposé seul (l'Arène : « champion du jour »).
  assert.equal(dayRecord(input([], scores), { board: AFM }, { scope: 'world', now: NOW })?.name, 'Paul');
});
