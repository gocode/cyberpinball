// Affiche du médaillon Communauté sur le plateau (18/11/2026) : mon niveau, ma place au monde et
// dans mon pays (de tout temps), la semaine en une ligne. Ces tests fixent :
// - les places viennent du même classement que Communauté > Classements > Joueurs (rankings-menu.ts) ;
// - une place qui manque (pays non choisi, pas encore d'XP) garde sa case, grisée, avec sa raison ;
// - rien de tout cela tant que le partage est coupé ;
// - les textes sont traduits (« #3 », « out of 4 players »).

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { createPlayerKey, levelOf, newSocialState, setLanguage, tierLabel, weekKey } from '../index';
import { fakeCommunityMessages, fakeSocialNet } from './doublures';

interface Tile {
  label: string;
  value: string;
  detail: string;
  progress?: number;
  flag?: { code: string };
  quiet?: boolean;
}
interface Poster {
  standing?: { tiles: Tile[]; week?: string };
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createCommunityMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'community-menu.js')) as {
  createCommunityMenu(host: object): { poster(): Poster };
};
const { createRankingsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'rankings-menu.js')) as {
  createRankingsMenu(host: object): { standing(): unknown };
};

const NOW = new Date();
/** Espaces insécables et fines (nombres) ramenées à des espaces ordinaires. */
const plain = (s?: string) => s?.replace(/\p{Zs}/gu, ' ');
const week = { of: weekKey(NOW), xp: 300 };

function poster(opts: { enabled?: boolean; country?: string; myXp?: number; myWeek?: number } = {}): Poster {
  const enabled = opts.enabled ?? true;
  const country = 'country' in opts ? opts.country : 'FR';
  const myXp = opts.myXp ?? 5000;
  const me = { key: 'me', name: 'Moi', ...(country ? { country } : {}), xp: myXp, week: { of: week.of, xp: opts.myWeek ?? 300 } };
  // Monde : Bolt (BE) 20 000, Alto (FR) 9 000, moi 5 000, Cerise (FR) 100. France : Alto, moi, Cerise.
  const cards = [
    { key: 'a', name: 'Alto', country: 'FR', xp: 9000 },
    { key: 'b', name: 'Bolt', country: 'BE', xp: 20000 },
    { key: 'c', name: 'Cerise', country: 'FR', xp: 100 },
  ];
  const rankings = createRankingsMenu({
    library: { openCustom: () => undefined },
    tables: () => [],
    local: () => ({ lines: [] }),
    network: () => ({ kind: 'none' }),
    zoneKeys: () => [],
    openSharing: () => undefined,
    now: () => NOW.getTime(),
    players: {
      state: () => ({ enabled, ...(country ? { country } : {}), friends: new Set<string>(), me }),
      cards: () => cards,
    },
  });
  const menu = createCommunityMenu({
    library: { openCustom: () => undefined, openSystem: () => undefined },
    net: fakeSocialNet({
      state: () => ({ ...newSocialState(new Date(0)), enabled, key: createPlayerKey(), friends: [] }),
      country: () => country,
      rankings: () => ({ scores: [] }),
      status: () => ({ running: true }),
    }),
    zoneKeys: () => [],
    tables: () => [],
    openProfile: () => {},
    messages: fakeCommunityMessages({ }),
    rankings: { detail: () => '', open: () => {}, standing: () => rankings.standing() },
    level: { detail: () => '', avatar: () => ({ initials: 'MO', hue: 0 }), open: () => {}, view: () => ({ ...levelOf(myXp), week: opts.myWeek ?? 300 }) },
    openSharing: () => {},
  });
  return menu.poster();
}

test('Affiche Communauté : niveau, place mondiale et nationale, la semaine dessous', () => {
  setLanguage('fr');
  const st = poster().standing!;
  const level = levelOf(5000);
  assert.deepEqual(
    st.tiles.map((t) => [t.label, t.value, t.detail]),
    [
      ['Niveau', String(level.level), tierLabel(level.tier)],
      ['Mondial', '3ᵉ', 'sur 4 joueurs'],
      ['France', '2ᵉ', 'sur 3 joueurs'],
    ],
  );
  assert.equal(st.tiles[0]!.progress, level.progress);
  assert.equal(st.tiles[2]!.flag?.code, 'FR');
  assert.ok(st.tiles.every((t) => !t.quiet));
  // Personne d'autre n'a d'XP cette semaine : premier partout.
  // Chaque segment insécable : la ligne ne se coupe qu'entre deux segments.
  assert.equal(plain(st.week), 'Cette semaine : +300 XP · 1ᵉʳ au monde · 1ᵉʳ dans votre pays');
  assert.deepEqual(st.week!.split(' · ').filter((p) => p.includes(' ')), []);
});

test('Affiche Communauté : sans pays, la case nationale reste, grisée, avec sa raison', () => {
  setLanguage('fr');
  const st = poster({ country: undefined }).standing!;
  assert.deepEqual(st.tiles[2], { label: 'National', value: '—', detail: 'Pays non choisi', quiet: true });
  assert.equal(st.tiles[1]!.value, '3ᵉ');
});

test('Affiche Communauté : pas encore d’XP, ni classé ni semaine', () => {
  setLanguage('fr');
  const st = poster({ myXp: 0, myWeek: 0 }).standing!;
  assert.deepEqual(st.tiles.slice(1).map((t) => [t.value, t.detail, t.quiet]), [
    ['—', 'Pas encore classé', true],
    ['—', 'Pas encore classé', true],
  ]);
  assert.equal(plain(st.week), 'Pas encore d’XP cette semaine');
});

test('Affiche Communauté : partage coupé, ni niveau ni places', () => {
  setLanguage('fr');
  assert.equal(poster({ enabled: false }).standing, undefined);
});

test('Affiche Communauté : les cases en anglais', () => {
  setLanguage('en');
  try {
    const st = poster().standing!;
    assert.deepEqual(st.tiles.slice(1).map((t) => [t.label, t.value, t.detail]), [
      ['World', '#3', 'out of 4 players'],
      ['France', '#2', 'out of 3 players'],
    ]);
    assert.equal(st.tiles[0]!.label, 'Level');
    assert.equal(plain(st.week), 'This week: +300 XP · #1 worldwide · #1 in your country');
  } finally {
    setLanguage('fr');
  }
});
