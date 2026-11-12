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

test('calage : les gâchettes placent la borne (deux coins d’un coup), A valide et sort, sans appui « pour commencer »', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  const key = frontend.slice(frontend.indexOf('function calibrationKey('), frontend.indexOf('function calibrationCentre('));
  assert.doesNotMatch(key, /calibration\?\.intro\)/);
  assert.match(key, /if \(KEYS\.exit\.includes\(input\.code\)\) closeCalibration\(\);\s*else if \(KEYS\.confirm\.includes\(input\.code\) && calibration\?\.place\) \{\s*applyCalibration\(\);\s*closeCalibration\(\);/);
  assert.match(key, /calibration\.intro = false;\s*calibration\.placing = true;\s*showCalibration\(\);\s*headset\?\.recenter\(\);/);
  // Les deux manettes sur les coins : une gâchette prend les deux points ; sinon celui de la gâchette.
  assert.match(frontend, /const both = points\.length >= 2 && !calibrationProblem\(points\[0\]!, points\[1\]!\);/);
  assert.match(frontend, /const \[left, right\] = orderCorners\(pair\[0\], pair\[1\], head \?\? fallback\);/);
  const cpp = read('packages', 'casque-vr', 'src', 'casque.cpp');
  assert.match(cpp, /say\(std::string\("pointes "\) \+ \(hand \? "droite " : "gauche "\) \+ p3\(at\[0\]\.pose\.position\) \+ " " \+ p3\(at\[1\]\.pose\.position\) \+ tail \+ grips\);/);
  assert.match(cpp, /" tete " \+ std::to_string\(head\.pose\.position\.x\) \+ " " \+ std::to_string\(head\.pose\.position\.z\)/);
});

test('calage : une consigne courte, en très gros au milieu du regard ; le détail seulement en cas de problème', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  const show = frontend.slice(frontend.indexOf('function showCalibration('), frontend.indexOf('function calibrationMarks('));
  assert.doesNotMatch(show, /eyeHeightProblem|roomStale/);
  assert.match(show, /const prompt = \{ text, keys, \.\.\.\(issue && \{ problem: issue \}\) \};/);
  assert.match(read('app', 'renderer', 'frontend.js'), /if \(role === 'backglass' && \(prompt \|\| hint\)\) \{/);
  assert.match(read('app', 'renderer', 'frontend.css'), /\.headset-prompt-text \{ font-size: 13vh;/);
});

test('sortie de partie : la pause, obligatoire et liée pour tout réglage, gardé ou par défaut ; jamais Y pour quitter', () => {
  // Demande du 10 novembre 2026 : Y quittait trop facilement. La sortie passe par Pause (appui court :
  // Reprendre ou Quitter ; tenu 1,5 s : quitter), qui est la fonction obligatoire de l'assistant.
  const fn = (id: string) => headsetFunctions().find((f) => f.id === id)!;
  assert.ok(!fn('retour').optional, 'Pause obligatoire');
  assert.ok(fn('quitter').optional, 'Quitter facultatif');
  const pauseOf = (setting: ReturnType<typeof defaultControllerSetting>) => vpxMappingsFor(setting).Pause ?? [];
  const profiles = Object.keys(HEADSET_PROFILES) as (keyof typeof HEADSET_PROFILES)[];
  for (const profile of profiles) {
    const def = defaultControllerSetting(profile);
    assert.ok(pauseOf(def).some((m) => m.startsWith('OpenXR;')), `${profile} : Pause liée`);
    assert.equal(def.functions.quitter, undefined, `${profile} : pas de sortie directe par défaut`);
  }
  // Un réglage gardé sans Pause n'est pas gardé : le défaut, qui l'a.
  for (const profile of profiles) {
    const { retour: _r, ...rest } = defaultControllerSetting(profile).functions;
    assert.ok(pauseOf(readControllerSetting(JSON.stringify({ profile, functions: rest }), profile)).some((m) => m.startsWith('OpenXR;')), profile);
  }
  // Le réglage gardé de l'essai (retour sur A) : gardé tel quel, Pause sur A.
  const kept = JSON.stringify({ profile: 'touch', functions: { 'flipper-gauche': 'gachette-gauche', 'flipper-droit': 'gachette-droite', valider: 'b', retour: 'a', menu: 'x', credit: 'y', 'magnasave-gauche': 'poignee-gauche', 'magnasave-droit': 'poignee-droite', lancer: 'clic-joystick-droit', lanceur: 'joystick-droit', deplacer: 'joystick-gauche' } });
  const setting = readControllerSetting(kept, 'touch');
  assert.equal(setting.functions.retour, 'a');
  assert.equal(CONTROLLER_ELEMENTS.a.label, 'A');
});

test('sortie de partie : rappel du bouton Pause en gros sur le fronton pendant le chargement dans le casque', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /headsetExitHint = vrGame && headset\?\.inUse \? exitHintText\(\) : undefined;/);
  assert.match(frontend, /const el = controllerSetting\(\)\.functions\.retour;\s*return el \? t\('\{bouton\} : pause · tenu : quitter', \{ bouton: CONTROLLER_ELEMENTS\[el\]\?\.label \?\? el \}\) : undefined;/);
  assert.match(read('app', 'renderer', 'frontend.js'), /const hint = s\.phase === 'loading' \? s\.headsetHint : undefined;/);
});
