// Chargement lisible (loadingprogress.ts, app/src/frontend.ts, app/renderer/frontend.js) : une
// table qui tarde à paraître fait dire au chargement l'étape vue, le temps écoulé et comment
// arrêter. Ces tests fixent l'invariant : seules des étapes observées, jamais de pourcentage ni
// d'estimation ; l'arrêt passe par la porte de l'arrêt forcé ; un lancement arrêté ne compte pas.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { LOADING_SLOW_MS, LOADING_STEPS, advanceLoadingStep, loadingStepLabel } from '../loadingprogress';
import { REPO_ROOT } from './i18n-scan';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');

test('chargement lisible : le cartouche attend 8 s, chaque étape a sa phrase, une étape vue ne se défait pas', () => {
  assert.equal(LOADING_SLOW_MS, 8000);
  assert.deepEqual([...LOADING_STEPS], ['prepare', 'launched', 'windows']);
  for (const step of LOADING_STEPS) assert.ok(loadingStepLabel(step).length > 10);
  assert.equal(advanceLoadingStep('prepare', 'launched'), 'launched');
  assert.equal(advanceLoadingStep('windows', 'launched'), 'windows');
  assert.equal(advanceLoadingStep('launched', 'launched'), 'launched');
});

test('chargement lisible : des étapes observées, jamais de pourcentage ni de progression simulée', () => {
  const renderer = read('app', 'renderer', 'frontend.js');
  const slow = renderer.slice(renderer.indexOf('function slowMeta('), renderer.indexOf('function fitLoadingCard('));
  assert.ok(slow.length > 0);
  assert.doesNotMatch(slow, /t\('[^']*%|percent|progress/i, 'aucun pourcentage dans le cartouche');
  const main = read('app', 'src', 'frontend.ts');
  // Les étapes viennent de ce qui est vu : le processus lancé, une fenêtre de VPX (launcher.ts, onWindows).
  assert.match(main, /launchStep\('launched'\);/);
  assert.match(main, /const onWindows = \(\) => launchStep\('windows'\);/);
  const launcher = read('app', 'src', 'launcher.ts');
  assert.match(launcher, /if \(!player && windows\.length && !windowsSeen\) \{\s+windowsSeen = true;\s+opts\.onWindows\?\.\(\);/);
  // La table à l'écran efface le cartouche.
  assert.match(main, /const onPlaying = \(\) => \{\s+\/\/[^\n]*\n\s+playingSince = Date\.now\(\);\s+state = \{ \.\.\.state, phase: 'playing' \};\s+\/\/[^\n]*\n\s+endLaunch\(\);/);
});

test('chargement lisible : Exit (une fois le cartouche affiché) et Ctrl+Maj+K arrêtent, par la porte de l’arrêt forcé ; rien n’est compté', () => {
  const main = read('app', 'src', 'frontend.ts');
  assert.match(main, /case 'loading':\s+\/\/[^\n]*\n\s+if \(matchesShortcut\(input, SHORTCUTS\.forceStop\) \|\| \(launch\?\.slow && is\(KEYS\.exit\)\)\) \{\s+if \(guest\.knock\('game\.force-stop'\)\) stopLaunch\(\);/);
  // Arrêté avant le lancement de VPX : il ne l'est pas ; après : il se ferme ; dans les deux cas, la roue, sans statistiques.
  assert.match(main, /if \(launch\?\.stopped\) \{\s+endLaunch\(\);/);
  assert.match(main, /if \(launch\.stopped\) game\.stop\(\);/);
  const play = main.slice(main.indexOf('async function play('));
  assert.ok(play.indexOf('if (stoppedLoading) {') < play.indexOf('recordPlay(table, startedAt, result.seconds)'), 'un lancement arrêté sort avant de compter la partie');
  // Le cartouche dit l'arrêt avec le raccourci de la borne.
  assert.match(main, /t\('\{keys\} ou Exit : arrêter', \{ keys: shortcutLabel\(SHORTCUTS\.forceStop\) \}\)/);
  // En borne, rien sur le média de chargement, même quand la table tarde (demande du mainteneur,
  // 06/11/2026) : l'écran de la borne ne lit pas le cartouche, et le garde-fou refuse tout texte.
  const renderer = read('app', 'renderer', 'frontend.js');
  const cab = renderer.slice(renderer.indexOf('function loadingScreen('), renderer.indexOf('/** Logo de secours du mode attente'));
  const cabPart = cab.slice(cab.indexOf('// Réglage de l'));
  assert.doesNotMatch(cabPart, /s\.slow/, 'en borne, le chargement ne montre pas le cartouche');
  assert.doesNotMatch(read('app', 'src', 'layout-check.ts'), /loading-slow/, 'le garde-fou ne permet aucun texte de plus en borne');
});
