// Cadence de la roue quand un bouton reste tenu (21/11/2026). Un bouton tenu se répète toutes les 33 ms :
// la roue changeait de table 30 fois par seconde (état envoyé à chaque écran, son, glissement),
// illisible, la page du plateau occupée à 85 %. Invariants : une répétition ne fait tourner la roue
// qu'à 10 tables par seconde au plus ; un nouvel appui passe toujours, aussi rapide soit-il ; et
// l'écran des tables branche bien ce plafond sur précédent et suivant, avant tout envoi d'état.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const { WheelRepeat, WHEEL_REPEAT_MS } = require(path.join(REPO_ROOT, 'app', 'dist', 'wheel-repeat.js')) as {
  WHEEL_REPEAT_MS: number;
  WheelRepeat: new (every?: number, now?: () => number) => { take(repeat: boolean): boolean };
};

test('roue, bouton tenu : 10 tables par seconde au plus ; chaque nouvel appui passe', () => {
  assert.equal(WHEEL_REPEAT_MS, 100);
  let clock = 0;
  const wheel = new WheelRepeat(WHEEL_REPEAT_MS, () => clock);
  // Bouton tenu une seconde : l'appui, puis une répétition toutes les 33 ms.
  let moves = wheel.take(false) ? 1 : 0;
  for (clock = 33; clock <= 1000; clock += 33) if (wheel.take(true)) moves++;
  assert.ok(moves >= 9 && moves <= 11, `${moves} tables en une seconde`);
  // Appuis distincts très rapprochés (un joueur qui tapote) : tous passent.
  for (let i = 0; i < 5; i++) {
    clock += 20;
    assert.equal(wheel.take(false), true, 'un nouvel appui n’est jamais écarté');
  }
  // Une répétition juste après un appui attend son tour.
  clock += 10;
  assert.equal(wheel.take(true), false);
});

test('écran des tables : le plafond s’applique à précédent et suivant, avant l’envoi de l’état', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const at = src.indexOf("case 'menu':");
  assert.ok(at > 0);
  const block = src.slice(at, src.indexOf("button === 'previous') guest.knock", at));
  assert.match(block, /\(button === 'previous' \|\| button === 'next'\) && !wheelRepeat\.take\(Boolean\(input\.isAutoRepeat\)\)\) return true;/, 'répétition écartée : retour avant broadcast()');
});
