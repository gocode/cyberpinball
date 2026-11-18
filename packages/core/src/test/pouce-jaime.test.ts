// « J'aime » : partout un pouce levé, jamais l'étoile. L'étoile `★ 0` du profil ne disait pas
// qu'on pouvait aimer (décision du 18/11/2026) ; elle reste aux favoris, aux records et aux
// champions. Ce test fixe la règle pour chaque endroit qui montre un « J'aime » : profil public,
// écran « Ont aimé », notification, badges et détail des points d'expérience.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { BADGES } from '../badges';
import { NOTICE_RULES } from '../notices';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const source = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const thumb = (icon: string) => icon === 'thumb-up' || icon === 'thumb-up-filled';

test('« J’aime » : les badges qui les comptent portent le pouce', () => {
  const likeBadges = BADGES.filter((b) => /J’aime|J'aime/.test(b.detail));
  assert.ok(likeBadges.length >= 3, 'attendu : les badges des « J’aime » reçus et donnés');
  for (const b of likeBadges) assert.ok(thumb(b.icon), `badge ${b.id} : ${b.icon} au lieu du pouce`);
});

test('« J’aime » : la notification d’un « J’aime » reçu porte le pouce', () => {
  assert.ok(thumb(NOTICE_RULES['player-like'].icon), `player-like : ${NOTICE_RULES['player-like'].icon}`);
});

test('« J’aime » : le profil public ne montre plus d’étoile, ni en signe ni en icône', () => {
  const profile = source('app/src/profile-menu.ts');
  assert.ok(!profile.includes('★'), 'profile-menu.ts : signe ★ devant un nombre de « J’aime »');
  assert.ok(!/'star(-filled)?'/.test(profile), 'profile-menu.ts : icône étoile');
  assert.match(profile, /asideIcon: [^,]*'thumb-up/, 'le nombre de « J’aime » est précédé du pouce');
});

test('« J’aime » : le détail des points d’expérience montre le pouce', () => {
  const level = source('app/src/level-menu.ts');
  const line = level.split('\n').find((l) => l.includes('« J’aime » reçu'));
  assert.ok(line, 'ligne « J’aime » reçu introuvable');
  assert.match(line, /'thumb-up'/);
  assert.match(level, /\blike: 'thumb-up'/);
});
