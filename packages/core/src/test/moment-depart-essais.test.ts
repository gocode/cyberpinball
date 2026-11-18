// Le moment du niveau de départ (app/src/level-tracker.ts, compilé) prend la première touche sur la
// roue : pendant un essai sans opérateur, il n'apparaît que demandé (CYBERPINBALL_MOMENT_DEPART=1),
// comme l'ouverture. Sans cette règle, une démonstration partie d'une borne neuve perdait son premier
// appui et tout son parcours se décalait (18/11/2026). Les démonstrations qui montrent ce moment le
// demandent ; celles qui appuient sur une touche pour le fermer sans le demander se décaleraient.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

/* eslint-disable @typescript-eslint/no-require-imports */
const { startMomentShown } = require(path.join(REPO_ROOT, 'app', 'dist', 'level-tracker.js')) as { startMomentShown(env: NodeJS.ProcessEnv): boolean };
/* eslint-enable @typescript-eslint/no-require-imports */

test('moment du niveau de départ : montré au joueur, coupé pendant un essai sans opérateur sauf demandé', () => {
  assert.equal(startMomentShown({}), true);
  assert.equal(startMomentShown({ CYBERPINBALL_AUTOPILOT: 'wait:1000' }), false);
  assert.equal(startMomentShown({ CYBERPINBALL_STRESS: '5,10' }), false);
  assert.equal(startMomentShown({ CYBERPINBALL_AUTOPILOT: 'wait:1000', CYBERPINBALL_MOMENT_DEPART: '1' }), true);
  assert.equal(startMomentShown({ CYBERPINBALL_MOMENT_DEPART: '0' }), false);
});

test('moment du niveau de départ : les démonstrations qui le ferment d’une touche le demandent', () => {
  const dir = path.join(REPO_ROOT, 'interne', 'demos');
  // Dépôt publié : les démonstrations n'y sont pas.
  if (!fs.existsSync(dir)) return;
  const wrong: string[] = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.ps1'))) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    if (/niveau de départ/i.test(text) && /CYBERPINBALL_AUTOPILOT/.test(text) && !/CYBERPINBALL_MOMENT_DEPART\s*=\s*'1'/.test(text)) wrong.push(name);
  }
  assert.deepEqual(wrong, []);
});
