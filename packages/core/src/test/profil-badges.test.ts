import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { BADGES, RARITY_XP, type BadgeFacts } from '../badges';
import { setLanguage } from '../i18n';
import { REPO_ROOT } from './i18n-scan';

const { profileBadgeSections } = require(path.join(REPO_ROOT, 'app/dist/profile-badges.js')) as {
  profileBadgeSections(held: readonly string[], facts?: BadgeFacts): { title: string; cards: { key: string; title: string; detail: string; aside: string; progress?: number; medal: { earned: boolean; icon: string } }[] }[];
};
const facts: BadgeFacts = { games: 42, tables: 7, seconds: 6 * 3600, longestTable: 30 * 60, records: 2, championTables: 0 };

test('profil : chaque badge, reçu ou non, conserve son objectif, son dessin et ses XP', () => {
  setLanguage('fr');
  const sections = profileBadgeSections(['first-game'], facts);
  const cards = sections.flatMap((s) => s.cards);
  assert.equal(cards.length, BADGES.length);
  assert.equal(new Set(cards.map((c) => c.key)).size, BADGES.length);
  for (const b of BADGES) {
    const c = cards.find((c) => c.key === `badge:${b.id}`)!;
    assert.equal(c.aside, `+${RARITY_XP[b.rarity].toLocaleString('fr-FR')} XP`);
    assert.equal(c.medal.earned, b.id === 'first-game');
    assert.ok(c.detail);
  }
  const hundred = cards.find((c) => c.key === 'badge:hundred-games')!;
  assert.match(hundred.detail, /42 \/ 100 · reste 58/);
  assert.equal(hundred.progress, .42);
  const hour = cards.find((c) => c.key === 'badge:hour-on-table')!;
  assert.match(hour.detail, /30 min \/ 60 min · reste 30 min/);
  assert.equal(hour.progress, .5);
  assert.match(cards.find((c) => c.key === 'badge:ten-hours')!.detail, /6 h \/ 10 h · reste 4 h/);
});

test('profil d’un autre joueur : objectifs et récompenses complets, sans inventer sa progression privée ni révéler ses secrets', () => {
  setLanguage('fr');
  const cards = profileBadgeSections(['first-game']).flatMap((s) => s.cards);
  const hundred = cards.find((c) => c.key === 'badge:hundred-games')!;
  assert.match(hundred.detail, /Progression non partagée/);
  assert.equal(hundred.progress, undefined);
  const secret = cards.find((c) => c.key === 'badge:night-owl')!;
  assert.equal(secret.title, 'Badge secret');
  assert.equal(secret.medal.icon, 'lock');
  assert.doesNotMatch(secret.detail, /2 h|5 h/);
  assert.equal(secret.aside, '+50 XP');
});
