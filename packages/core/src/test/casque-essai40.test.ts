// Retours de l'essai du 10 novembre 2026 (v0.1.9-essai.40) : écrans du menu stables (acquis à garder),
// calage en un appui avec la hauteur prise dès le premier calage, consigne en gros au milieu du regard,
// ombres retirées, sortie de partie toujours liée aux manettes.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { calibrationProblem, DESK_EYES_TO_LOCKBAR_M, freePlace, placeVpxSettings } from '../calage';
import { CONTROLLER_ELEMENTS, defaultControllerSetting, HEADSET_PROFILES, headsetFunctions, readControllerSetting, vpxMappingsFor } from '../manettes';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

test('ACQUIS : calage fermé, les écrans du menu en couches quad posées dans STAGE, jamais dans la projection', () => {
  // « Plus mal à la tête, plus envie de vomir, c'est parfait » : à ne jamais casser.
  const cpp = read('packages', 'casque-vr', 'src', 'casque.cpp');
  assert.match(cpp, /const bool quadScreens = projection && !calibrating;/);
  // Dans la projection, la boucle des écrans s'arrête net hors calage.
  assert.match(cpp, /for \(Panel& p : panels\)\s*\{\s*if \(quadScreens\)\s*break;\s*ID3D11ShaderResourceView\* image/);
  // En couches quad dès que le calage est fermé, posées dans la pièce (base : STAGE).
  assert.match(cpp, /if \(fs\.shouldRender && worn && \(!projection \|\| quadScreens\)\)/);
  assert.match(cpp, /q\.space = base;/);
  assert.match(cpp, /rsci\.referenceSpaceType = stage \? XR_REFERENCE_SPACE_TYPE_STAGE : XR_REFERENCE_SPACE_TYPE_LOCAL;/);
  // Et la profondeur de la projection soumise au runtime.
  assert.match(cpp, /projViews\[e\]\.next = &depthInfos\[e\];/);
});

test('calage : la hauteur prise dès le premier calage, quel que soit le sol du Quest', () => {
  // Essai : sol faux de 70 cm (yeux à 2,35 m) ; les coins touchés à 184 cm étaient refusés, et « poser
  // la borne ici » la mettait à 88 cm de ce faux sol, par terre.
  const gaze = { x: -0.66, z: 0.48, yaw: 2.4 };
  const place = freePlace(gaze, 2.35);
  assert.equal(place.lockbarHeight, 2.35 - DESK_EYES_TO_LOCKBAR_M);
  // Pour VPX, la même hauteur dans la même pièce (en cm, dans ses bornes de 0 à 250).
  const height = Number(placeVpxSettings(place).find((s) => s.key === 'LockbarHeight')!.value);
  assert.ok(Math.abs(height - (2.35 - DESK_EYES_TO_LOCKBAR_M) * 100) < 1e-6 && height <= 250);
  // Sol juste : 1,59 m d'yeux, barre à 1,04 m, comme la vraie touchée ce jour-là (1,05 à 1,13 m).
  assert.ok(Math.abs(freePlace(gaze, 1.59).lockbarHeight! - 1.04) < 1e-9);
  // Les coins touchés sur un sol faux : acceptés.
  assert.equal(calibrationProblem({ x: -0.598, y: 1.842, z: 0.734 }, { x: -0.973, y: 1.837, z: 0.416 }), undefined);
  // Le compagnon dit les yeux avec le centre, l'application les passe au calage.
  assert.match(read('app', 'src', 'casque.ts'), /const eyes = \/yeux=\(-\?\[\\d\.\]\+\)\/\.exec\(line\);\s*this\.opts\.onCentre\?\.\(\{ \.\.\.gaze, \.\.\.\(eyes && \{ eyes: Number\(eyes\[1\]\) \}\) \}\);/);
  assert.match(read('app', 'src', 'frontend.ts'), /c\.place = freePlace\(gaze, gaze\.eyes\);/);
});

test('calage : un appui, une étape (plus de A « pour commencer »)', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  const key = frontend.slice(frontend.indexOf('function calibrationKey('), frontend.indexOf('function calibrationCentre('));
  // Exit termine ; A valide une place prise ; au bureau, A pose aussitôt (et quitte le premier écran).
  assert.doesNotMatch(key, /calibration\?\.intro\)/);
  assert.match(key, /if \(KEYS\.exit\.includes\(input\.code\)\) closeCalibration\(\);\s*else if \(KEYS\.confirm\.includes\(input\.code\) && calibration\?\.place\) applyCalibration\(\);/);
  assert.match(key, /calibration\.intro = false;\s*calibration\.placing = true;\s*showCalibration\(\);\s*headset\?\.recenter\(\);/);
  // La gâchette prend le point même au premier écran.
  assert.match(frontend, /function calibrationPoint\(point: Point3, room: boolean\): void \{\s*const c = calibration;\s*if \(!c\) return;\s*\/\/[^\n]*\n\s*c\.intro = false;/);
});

test('calage : une consigne courte, en très gros au milieu du regard ; le détail seulement en cas de problème', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  const show = frontend.slice(frontend.indexOf('function showCalibration('), frontend.indexOf('function calibrationMarks('));
  // Plus d'avertissement de sol ni de recentrage à chaque écran.
  assert.doesNotMatch(show, /eyeHeightProblem|roomStale/);
  assert.match(show, /const prompt = \{ text, keys, \.\.\.\(issue && \{ problem: issue \}\), \.\.\.\(status && \{ status \}\) \};/);
  const renderer = read('app', 'renderer', 'frontend.js');
  assert.match(renderer, /if \(role === 'backglass' && \(prompt \|\| hint\)\) \{/);
  const css = read('app', 'renderer', 'frontend.css');
  // Au moins le double d'avant (le corps du message : environ 3 % de la hauteur) : 13 % de la hauteur du fronton.
  assert.match(css, /\.headset-prompt-text \{ font-size: 13vh;/);
});

test('sortie de partie : tout réglage de manettes, gardé ou par défaut, garde « quitter » lié', () => {
  assert.ok(!headsetFunctions().find((f) => f.id === 'quitter')!.optional, 'quitter obligatoire dans l’assistant');
  const exitOf = (setting: ReturnType<typeof defaultControllerSetting>) => vpxMappingsFor(setting).ExitGame ?? [];
  for (const profile of Object.keys(HEADSET_PROFILES) as (keyof typeof HEADSET_PROFILES)[]) assert.ok(exitOf(defaultControllerSetting(profile)).some((m) => m.startsWith('OpenXR;')), `${profile} : défaut sans sortie`);
  // Le réglage gardé de l'essai (assistant d'avant, « quitter » passé) : la sortie lui est rendue, sur Y.
  const kept = JSON.stringify({ profile: 'touch', functions: { 'flipper-gauche': 'gachette-gauche', 'flipper-droit': 'gachette-droite', valider: 'b', retour: 'a', menu: 'x', credit: 'y', 'magnasave-gauche': 'poignee-gauche', 'magnasave-droit': 'poignee-droite', lancer: 'clic-joystick-droit', lanceur: 'joystick-droit', deplacer: 'joystick-gauche' } });
  const repaired = readControllerSetting(kept, 'touch');
  assert.equal(repaired.functions.valider, 'b', 'le reste du réglage est gardé');
  assert.ok(repaired.functions.quitter && !CONTROLLER_ELEMENTS[repaired.functions.quitter].axis);
  assert.ok(exitOf(repaired).some((m) => m.startsWith('OpenXR;')));
  // Chaque profil, chaque réglage gardé sans sortie : une sortie liée.
  for (const profile of Object.keys(HEADSET_PROFILES) as (keyof typeof HEADSET_PROFILES)[]) {
    const { quitter: _q, ...rest } = defaultControllerSetting(profile).functions;
    const setting = readControllerSetting(JSON.stringify({ profile, functions: rest }), profile);
    assert.ok(exitOf(setting).some((m) => m.startsWith('OpenXR;')), `${profile} : réglage gardé sans sortie`);
  }
});

test('sortie de partie : rappel du bouton en gros sur le fronton pendant le chargement dans le casque', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /headsetExitHint = vrGame && headset\?\.inUse \? exitHintText\(\) : undefined;/);
  assert.match(frontend, /return el \? t\('\{bouton\} : quitter la partie', \{ bouton: CONTROLLER_ELEMENTS\[el\]\?\.label \?\? el \}\) : undefined;/);
  assert.match(read('app', 'renderer', 'frontend.js'), /const hint = s\.phase === 'loading' \? s\.headsetHint : undefined;/);
});
