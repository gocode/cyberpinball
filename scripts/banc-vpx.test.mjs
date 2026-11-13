// Banc de VPX dans le casque : la cadence lue dans la trace du runtime factice (sans VPX ni casque).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cadenceDeLaTrace, SCENARIO_REPOS } from './banc-vpx.mjs';

test('banc de VPX : cadence par tranche de 360 images, lue dans la trace du runtime', () => {
  const trace = ['0 4242 runtime charge, scenario de 5 etapes', '62 4242 image 1 couches=1', '5062 4242 image 360 couches=1', '5100 4242 scenario bouton', '17862 4242 image 720 couches=1'].join('\n');
  const c = cadenceDeLaTrace(trace);
  assert.equal(c.length, 2);
  assert.ok(Math.abs(c[0].images - 71.8) < 1e-9); // 359 images en 5 s
  assert.ok(Math.abs(c[1].images - 28.125) < 1e-9); // 360 images en 12,8 s : le palier de la borne
  assert.deepEqual(cadenceDeLaTrace(''), []);
  // Le scénario « repos » ne fait aucun geste : casque porté, manettes posées.
  assert.doesNotMatch(SCENARIO_REPOS, /bouton|valeur/);
  assert.match(SCENARIO_REPOS, /^0 porte 1$/m);
});
