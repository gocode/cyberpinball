// Pas de compagnon du casque relancé pendant une partie (rapport 8OktjS0kVy, 23/11/2026) : option VR
// restée activée, casque retiré, le front-end relançait le compagnon toutes les 15 s en pleine partie ;
// chaque essai (session OpenXR, écrans rendus hors écran pour le casque) faisait sauter des images à VPX.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { headsetWanted, type HeadsetWantedState } from '../casque';
import { REPO_ROOT } from './i18n-scan';

const base: HeadsetWantedState = { paused: false, closing: false, trial: false, vrAuto: true, gameBusy: false, running: false, ready: () => true };

test('compagnon du casque : jamais lancé pendant un lancement ou une partie', () => {
  assert.equal(headsetWanted(base), true, 'au menu, VR activée, runtime présent : voulu');
  assert.equal(headsetWanted({ ...base, gameBusy: true }), false, 'partie en cours, aucun compagnon : pas de nouvel essai');
  assert.equal(headsetWanted({ ...base, gameBusy: true, trial: true }), false, 'même en essai');
  // Celui qui tournait au lancement garde le casque jusqu'à la relève par VPX.
  assert.equal(headsetWanted({ ...base, gameBusy: true, running: true }), true);
  assert.equal(headsetWanted({ ...base, paused: true, running: true }), false);
  assert.equal(headsetWanted({ ...base, closing: true }), false);
  assert.equal(headsetWanted({ ...base, vrAuto: false }), false);
  assert.equal(headsetWanted({ ...base, ready: () => false }), false);
});

test('compagnon du casque : le runtime n’est pas relu en partie', () => {
  let reads = 0;
  headsetWanted({ ...base, gameBusy: true, ready: () => (reads++, true) });
  headsetWanted({ ...base, vrAuto: false, ready: () => (reads++, true) });
  assert.equal(reads, 0);
});

test('le front-end passe l’état de la partie à headsetWanted', () => {
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const wanted = /wanted: \(\) =>\s*headsetWanted\(\{([\s\S]*?)\}\),/.exec(frontend);
  assert.ok(wanted, 'HeadsetMenu.wanted passe par headsetWanted');
  assert.match(wanted[1]!, /gameBusy: Boolean\(playing \|\| launch\)/);
  assert.match(wanted[1]!, /running: Boolean\(vrFront\.headset\?\.running\)/);
});
