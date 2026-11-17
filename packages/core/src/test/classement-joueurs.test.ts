// Classement des joueurs par XP (packages/core/src/playerranking.ts, écran « Joueurs » de
// app/src/rankings-menu.ts), demandé le 17/11/2026 : entre amis, dans le pays, dans le monde ; de la
// semaine ou de tout temps. Ces tests fixent :
// - la carte publique porte les XP de la semaine et son lundi, signés ; une carte d'avant (sans
//   semaine) se vérifie toujours ; une semaine au-delà du total est refusée ;
// - « Cette semaine » ne compte que la semaine en cours (une carte de la semaine passée ne classe
//   pas) ; « Tout temps », le total ;
// - un total impossible (au-delà de ce qui a pu se gagner depuis l'arrivée des niveaux) ou une
//   semaine impossible ne se classent pas, mais se comptent ; un total seulement inattendu pour une
//   borne qui découvre le joueur se classe, son niveau en « ? » ;
// - ma ligne est toujours là, à part au-delà des premières places ;
// - l'écran : trois portées, deux périodes, les flippers changent de période, MagnaSave de portée.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { emptyProfiles, levelsXpCeiling, makeCard, playerBoard, setLanguage, verifyCard, weekKey, WEEK_XP_MAX, type RankedPlayer } from '../index';
import { newSocialState, setName } from '../social';

// Quelques mois après l'arrivée des niveaux : des totaux de plusieurs dizaines de milliers d'XP sont possibles.
const NOW = new Date('2027-03-10T12:00:00');
const WEEK = weekKey(NOW);
const LAST_WEEK = weekKey(new Date('2027-03-03T12:00:00'));
const LONG_AGO = '2025-01-01T00:00:00Z';

const p = (key: string, name: string, xp: number, week?: number, country = 'FR', of = WEEK): RankedPlayer => ({ key, name, country, xp, ...(week !== undefined ? { week: { of, xp: week } } : {}) });

test('carte publique : les XP de la semaine voyagent signés ; une carte sans semaine se vérifie toujours', () => {
  const vortex = setName(newSocialState(NOW), 'Vortex')!;
  const card = makeCard(vortex, emptyProfiles(), { records: 1, xp: 5000, week: { of: WEEK, xp: 640 } }, NOW);
  assert.deepEqual(card.week, { of: WEEK, xp: 640 });
  assert.deepEqual(verifyCard(card, NOW), card);
  assert.equal(verifyCard({ ...card, week: { of: WEEK, xp: 9999 } }, NOW), undefined, 'semaine changée : signature fausse');
  const old = makeCard(vortex, emptyProfiles(), { records: 1, xp: 5000 }, NOW);
  assert.equal(old.week, undefined);
  assert.deepEqual(verifyCard(old, NOW), old, 'carte d’avant les semaines');
  // Jamais plus d'XP dans la semaine qu'au total.
  assert.equal(makeCard(vortex, emptyProfiles(), { records: 1, xp: 100, week: { of: WEEK, xp: 640 } }, NOW).week?.xp, 100);
});

test('classement des joueurs : la semaine en cours seulement, le total pour tout temps ; ma ligne toujours là', () => {
  const first = (k: string) => (k === 'me' ? undefined : LONG_AGO);
  const cards = [p('a', 'Aster', 48_210, 1_240), p('b', 'Bille', 39_880, 2_015), p('c', 'Comète', 35_105, 900, 'FR', LAST_WEEK), p('d', 'Delta', 28_760, 0, 'BE')];
  const me = p('me', 'Moi', 9_420, 640);
  const week = playerBoard(cards, { scope: 'world', period: 'week', friends: new Set(), me, firstSeen: first }, NOW);
  assert.deepEqual(week.lines.map((l) => [l.rank, l.name, l.xp]), [[1, 'Bille', 2015], [2, 'Aster', 1240], [3, 'Moi', 640]], 'Comète (semaine passée) et Delta (rien) ne classent pas');
  assert.deepEqual(week.me, { rank: 3 });
  assert.equal(week.lines[0]!.other, 39_880, 'le total sous la semaine');
  const all = playerBoard(cards, { scope: 'world', period: 'all', friends: new Set(), me, firstSeen: first }, NOW);
  assert.deepEqual(all.lines.map((l) => l.name), ['Aster', 'Bille', 'Comète', 'Delta', 'Moi']);
  assert.equal(all.lines.find((l) => l.name === 'Comète')!.other, undefined, 'la semaine passée ne se montre pas');
  // Le pays, les amis.
  const national = playerBoard(cards, { scope: 'country', period: 'all', country: 'BE', friends: new Set(), me: { ...me, country: 'BE' }, firstSeen: first }, NOW);
  assert.deepEqual(national.lines.map((l) => l.name), ['Delta', 'Moi']);
  const friends = playerBoard(cards, { scope: 'friends', period: 'all', friends: new Set(['b']), me, firstSeen: first }, NOW);
  assert.deepEqual(friends.lines.map((l) => l.name), ['Bille', 'Moi']);
  // Au-delà des premières places, ma ligne s'ajoute.
  const many = Array.from({ length: 60 }, (_, i) => p(`k${i}`, `Joueur ${i}`, 20_000 - i, 3_000 - i));
  const top = playerBoard(many, { scope: 'world', period: 'week', friends: new Set(), me, firstSeen: first }, NOW);
  assert.equal(top.lines.length, 51);
  assert.deepEqual(top.lines.at(-1), { ...top.lines.at(-1)!, name: 'Moi', rank: 61, mine: true });
  assert.equal(top.players, 61);
});

test('classement des joueurs : un total ou une semaine impossibles sont écartés et comptés ; un total inattendu se classe en « ? »', () => {
  assert.ok(levelsXpCeiling(NOW) < 90_000_000);
  const cards = [p('n', 'Tricheur', 90_000_000, 10), p('w', 'Hâtif', 40_000, WEEK_XP_MAX + 1), p('o', 'Honnête', 40_000, 500), p('a', 'Ancien', 60_000, 200)];
  // Ancien : vu pour la première fois aujourd'hui (une borne neuve), un total au-delà de ce qu'un jour permet ici.
  const firstSeen = (k: string) => (k === 'a' ? NOW.toISOString() : LONG_AGO);
  const all = playerBoard(cards, { scope: 'world', period: 'all', friends: new Set(), firstSeen }, NOW);
  assert.deepEqual(all.lines.map((l) => l.name), ['Ancien', 'Honnête']);
  assert.equal(all.doubtful, 2);
  const ancien = all.lines[0]!;
  assert.equal(ancien.level, undefined);
  assert.equal(ancien.levelUnsure, true, 'classé, niveau « ? »');
  assert.ok(all.lines[1]!.level, 'le niveau d’un total vraisemblable');
  const week = playerBoard(cards, { scope: 'world', period: 'week', friends: new Set(), firstSeen }, NOW);
  assert.deepEqual(week.lines.map((l) => l.name), ['Honnête', 'Ancien']);
  assert.equal(week.doubtful, 2);
});

interface Built {
  heading: string;
  subheading?: string;
  scoreboard?: { scopes?: { label: string; current: boolean }[]; tabs: { label: string; count: string; current: boolean }[]; lines: { rank: string; name: string; score: string; when: string; mine?: boolean; apart?: boolean; levelText?: string }[]; empty?: { title: string }; position?: string; note?: string };
  actions: { label: string; detail?: string; run: () => void }[];
  back: () => void;
  keys?: (input: { code: string }) => boolean;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRankingsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'rankings-menu.js')) as {
  createRankingsMenu(host: object): { open(back: () => void): void };
};

test('écran « Joueurs » : trois portées, la semaine d’abord ; flippers pour la période, MagnaSave pour la portée', () => {
  setLanguage('fr');
  let screen: (() => Built) | undefined;
  let enabled = true;
  const menu = createRankingsMenu({
    library: { openCustom: (build: () => Built) => (screen = build), openScores: () => undefined },
    tables: () => [],
    local: () => ({ lines: [], games: 0, tableBoard: false, everyGame: false, romWithoutMap: false }),
    network: () => ({ lines: [], players: 0 }),
    players: {
      state: () => ({ enabled, country: 'FR', friends: new Set<string>(), me: p('me', 'Moi', 9_420, 640) }),
      cards: () => [p('a', 'Aster', 48_210, 1_240), p('b', 'Bille', 39_880, 2_015), p('d', 'Delta', 28_760, 300, 'BE')],
      firstSeen: () => LONG_AGO,
    },
    keys: () => ({ previous: ['ShiftLeft'], next: ['ShiftRight'], confirm: ['Enter'] }),
    zoneKeys: () => ['ControlLeft', 'ControlRight'],
    openSharing: () => undefined,
    now: () => NOW.getTime(),
  });
  menu.open(() => undefined);
  const home = screen!();
  const door = home.actions.find((a) => a.label === 'Joueurs')!;
  assert.match(door.detail ?? '', /Vous : niveau \d+ · 3ᵉ au monde cette semaine · 3ᵉ dans votre pays/);
  door.run();
  let b = screen!();
  assert.equal(b.heading, 'Joueurs');
  assert.equal(b.subheading, 'National · Cette semaine');
  assert.deepEqual(b.scoreboard?.scopes?.map((s) => s.label), ['Amis', 'National', 'Mondial']);
  assert.deepEqual(b.scoreboard?.tabs.map((t) => [t.label, t.count]), [['Cette semaine', '3 joueurs'], ['Tout temps', '3 joueurs']]);
  assert.deepEqual(b.scoreboard?.lines.map((l) => [l.rank, l.name]), [['1', 'Bille'], ['2', 'Aster'], ['3', 'Moi (vous)']]);
  assert.deepEqual(b.scoreboard?.lines.map((l) => /^\d.?\d* XP$/u.test(l.score)), [true, true, true]);
  assert.match(b.scoreboard?.lines[0]!.score ?? '', /^2.015 XP$/u);
  assert.match(b.scoreboard?.lines[0]!.when ?? '', /au total$/);
  assert.match(b.scoreboard?.position ?? '', /^National · Cette semaine : votre place, 3 sur 3 joueurs$/);
  // Flipper : tout temps ; MagnaSave droite : le monde.
  assert.ok(b.keys?.({ code: 'ShiftRight' }));
  b = screen!();
  assert.equal(b.subheading, 'National · Tout temps');
  assert.deepEqual(b.scoreboard?.lines.map((l) => l.name), ['Aster', 'Bille', 'Moi (vous)']);
  assert.match(b.scoreboard?.lines[0]!.when ?? '', /cette semaine$/);
  assert.ok(b.keys?.({ code: 'ControlRight' }));
  assert.equal(screen!().subheading, 'Mondial · Tout temps');
  assert.equal(screen!().scoreboard?.lines.length, 4);
  // Start : retour à l'accueil des classements.
  assert.ok(screen!().keys?.({ code: 'Enter' }));
  assert.equal(screen!().heading, 'Classements');
  // Sans partage : indisponible, avec sa raison.
  enabled = false;
  screen!().actions.find((a) => a.label === 'Joueurs')!.run();
  assert.match(screen!().scoreboard?.empty?.title ?? '', /indisponible/);
});
