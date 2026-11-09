// Calage de la borne aux manettes (calage.ts) : la barre avant touchée, coin gauche, coin droit, milieu.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { anchorHeight, calibrateMenuText, calibrationGap, calibrationProblem, eyeHeightProblem, isCalibrated, lockbarMarks, lockbarPlace, lockbarVpxSettings, placeLockbar, placeVpxSettings, roomMoved, STANDARD_TABLE_WIDTH_CM } from '../calage';
import { LOCKBAR_DISTANCE_M, LOCKBAR_HEIGHT_M } from '../casque';
import { vrCarriedSettings } from '../vr';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const value = (settings: { section: string; key: string; value: string }[], key: string) => Number(settings.find((s) => s.key === key)!.value);

test('borne du casque : la barre avant à 30 cm devant le joueur, à la hauteur touchée, face à elle', () => {
  // Barre de 70 cm, à 86 cm du sol, un mètre devant l'origine de la pièce.
  const place = lockbarPlace({ x: -0.35, y: 0.86, z: -1 }, { x: 0.35, y: 0.86, z: -1 });
  close(place.x, 0);
  close(place.z, -1 + LOCKBAR_DISTANCE_M);
  close(place.yaw, 0);
  close(place.lockbarHeight!, 0.86);
  close(place.lockbarWidth!, 0.7);
  // Borne tournée : le joueur regarde vers +x, sa droite est +z.
  const turned = lockbarPlace({ x: 1, y: 0.9, z: -0.35 }, { x: 1, y: 0.9, z: 0.35 });
  close(turned.x, 1 - LOCKBAR_DISTANCE_M);
  close(turned.z, 0);
  close(turned.yaw, -Math.PI / 2);
  // Repères : les coins de la barre dans l'espace de la borne ; l'ancre monte de la différence de hauteur.
  assert.deepEqual(lockbarMarks(0.7), [
    { x: -0.35, y: LOCKBAR_HEIGHT_M, z: -LOCKBAR_DISTANCE_M },
    { x: 0.35, y: LOCKBAR_HEIGHT_M, z: -LOCKBAR_DISTANCE_M },
  ]);
  close(anchorHeight(place), 0.86 - LOCKBAR_HEIGHT_M);
  assert.equal(anchorHeight({ x: 0, z: 0, yaw: 0 }), 0);
});

test('table de VPX : le calcul de VPX 10.8.1 (calage aux manettes), barre avant comprise', () => {
  const settings = lockbarVpxSettings({ x: -0.35, y: 0.86, z: -1 }, { x: 0.35, y: 0.86, z: -1 });
  assert.deepEqual(
    settings.map((s) => `${s.section}.${s.key}`),
    ['PlayerVR.Orientation', 'PlayerVR.TableX', 'PlayerVR.TableY', 'PlayerVR.TableZ', 'Player.LockbarWidth', 'Player.LockbarHeight'],
  );
  close(value(settings, 'Orientation'), 0);
  close(value(settings, 'TableX'), 0);
  // VRDevice : TableY = dx·sin + dy·cos + 5 cm × échelle (barre / plateau standard).
  close(value(settings, 'TableY'), 100 + 5 * (70 / STANDARD_TABLE_WIDTH_CM), 1e-3);
  close(value(settings, 'TableZ'), 0);
  close(value(settings, 'LockbarWidth'), 70, 1e-3);
  close(value(settings, 'LockbarHeight'), 86, 1e-3);
  // Barre de biais : l'angle de VPX (atan2(-axe.z, axe.x)), en degrés.
  const skew = lockbarVpxSettings({ x: 0, y: 0.86, z: 0 }, { x: 0.5, y: 0.86, z: -0.5 });
  close(value(skew, 'Orientation'), 45, 1e-3);
  // Les réglages de la barre avant passent de l'INI de la VR à chaque partie dans le casque.
  assert.deepEqual(
    vrCarriedSettings('[Player]\nLockbarWidth=70\nLockbarHeight=86\nBGSet=1\n').map((s) => s.key),
    ['LockbarWidth', 'LockbarHeight'],
  );
});

test('calage : coins mal touchés refusés, précision mesurée au milieu', () => {
  const left = { x: -0.35, y: 0.86, z: -1 };
  assert.equal(calibrationProblem(left, { x: 0.35, y: 0.86, z: -1 }), undefined);
  assert.match(calibrationProblem(left, { x: -0.2, y: 0.86, z: -1 }) ?? '', /15 cm/);
  assert.match(calibrationProblem({ ...left, y: 2.2 }, { x: 0.35, y: 2.2, z: -1 }) ?? '', /220 cm du sol/);
  assert.match(calibrationProblem(left, { x: 0.35, y: 0.95, z: -1 }) ?? '', /9 cm plus haut/);
  close(calibrationGap(left, { x: 0.35, y: 0.86, z: -1 }, { x: 0.01, y: 0.86, z: -1 }), 1);
});

test('entrée « Caler la borne » : grisée avec sa raison hors du casque ; sinon l’état, la manière et la limite du Quest', () => {
  assert.deepEqual(calibrateMenuText({ vrReady: false }), { detail: 'Réalité virtuelle indisponible : rien à caler', unavailable: true });
  assert.equal(calibrateMenuText({ vrReady: true, headset: 'waiting' }).unavailable, true);
  assert.match(calibrateMenuText({ vrReady: true, headset: 'waiting' }).detail, /Mettez le casque/);
  const fresh = calibrateMenuText({ vrReady: true, headset: 'shown' });
  assert.equal(fresh.unavailable, false);
  assert.match(fresh.detail, /^Pas encore calée · .*coin gauche, coin droit, puis le milieu.*poignées tenues 3 s · .*limite et son sol/);
  assert.match(calibrateMenuText({ vrReady: true, headset: 'shown', place: { x: 0, z: 0, yaw: 0, lockbarWidth: 0.7, lockbarHeight: 0.86 } }).detail, /^Calée : barre avant de 70 cm, à 86 cm du sol/);
});

test('calage : branchements du compagnon, du casque et du menu', () => {
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');
  const cpp = read('packages', 'casque-vr', 'src', 'casque.cpp');
  // Bout des manettes : la pose de visée ; points en gâchette appuyée, seulement pendant le calage.
  assert.match(cpp, /"\/user\/hand\/left\/input\/aim\/pose", "\/user\/hand\/right\/input\/aim\/pose"/);
  assert.match(cpp, /if \(down && calibrating && hand >= 0/);
  assert.match(cpp, /say\("geste caler"\);/);
  assert.match(cpp, /GetTickCount64\(\) - gripsSince >= 3000/);
  assert.match(cpp, /else if \(word == "calage"\)/);
  // L'ancre porte la hauteur de la barre avant calée.
  assert.match(cpp, /anchor\.position = \{ anchorX, anchorY, anchorZ \};/);
  const casque = read('app', 'src', 'casque.ts');
  assert.match(casque, /return `ancre \$\{place\.x\} \$\{place\.z\} \$\{place\.yaw\} \$\{anchorHeight\(place\)\}\\n`;/);
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /if \(calibration\) return calibrationKey\(input\);/);
  assert.match(frontend, /writeVrCalibration\(loc\.dataDir, lockbarVpxSettings\(left, right\)\);/);
  assert.match(frontend, /library\.provideSystemItem\('vr-calibrate', \{/);
  assert.match(frontend, /onGesture: \(\) => \(calibrateUnavailable\(\) \? undefined : openCalibration\(\)\),/);
  // L'entrée vient juste après « Réalité virtuelle ».
  assert.match(read('packages', 'core', 'src', 'systemmenu.ts'), /'vr', 'vr-calibrate', 'controls'/);
});

test('une seule pose : la table de VPX exactement où est la borne du casque, calée ou non', () => {
  // Aller et retour : les coins touchés redonnent la place, qui redonne les coins.
  const left = { x: 0.2, y: 0.9, z: -0.8 };
  const right = { x: 0.8, y: 0.9, z: -0.4 };
  const place = lockbarPlace(left, right);
  const back = placeLockbar(place);
  for (const [a, b] of [[back.left, left], [back.right, right]] as const) for (const k of ['x', 'y', 'z'] as const) close(a[k], b[k]);
  assert.deepEqual(placeVpxSettings(place), lockbarVpxSettings(left, right));
  // Pas calée (recentrage sur le regard) : la place seulement, la barre avant de l'INI reste.
  const loose = { x: place.x, z: place.z, yaw: place.yaw };
  assert.ok(!isCalibrated(loose) && isCalibrated(place));
  assert.deepEqual(placeVpxSettings(loose).map((s) => s.key), ['Orientation', 'TableX', 'TableY', 'TableZ']);
  close(Number(placeVpxSettings(loose)[0]!.value), Number(lockbarVpxSettings(left, right)[0]!.value), 1e-3);
});

test('limite du Quest changée depuis le calage, sol mal réglé : repérés', () => {
  assert.equal(roomMoved({ width: 2, depth: 2 }, { width: 2.02, depth: 1.99 }), false);
  assert.equal(roomMoved({ width: 2, depth: 2 }, { width: 3.1, depth: 2.4 }), true);
  assert.equal(roomMoved(undefined, { width: 2, depth: 2 }), false);
  assert.equal(eyeHeightProblem(1.68), undefined);
  assert.equal(eyeHeightProblem(undefined), undefined);
  // L'essai du 9 novembre : yeux mesurés à 2,29 m, la borne aux pieds du joueur.
  assert.match(eyeHeightProblem(2.29) ?? '', /2,29 m du sol.*Paramètres rapides > Paramètres > Configuration de l’environnement > Limite > « Définir le niveau du sol »/);
  assert.ok(eyeHeightProblem(0.6));
});

test('borne fixe : aucun recentrage automatique, la place imposée à VPX, le calage proposé d’office', () => {
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /const settings = placeVpxSettings\(place\);\s*writeIniSettings\(vr\.ini, settings\);/);
  assert.match(frontend, /const vrCenter = vrGame && !readCabinetPlace\(headsetPlaceFile\(\)\) && !vrHasSavedPlace\(vrText\)/);
  assert.match(frontend, /if \(headset\?\.worn && !isCalibrated\(headset\.place\(\)\)\) offerCalibration\(\);/);
  const cpp = read('packages', 'casque-vr', 'src', 'casque.cpp');
  // Dans la pièce, un changement d'espace du Quest ne déplace pas la borne : il est seulement dit.
  assert.match(cpp, /if \(!stage\)\s*wantRecenter = true;\s*else if \(change->referenceSpaceType == XR_REFERENCE_SPACE_TYPE_STAGE\)\s*say\("piece-changee"\);/);
  assert.match(cpp, /say\("piece " \+ std::to_string\(bounds\.width\)/);
  assert.match(cpp, /say\("yeux " \+ std::to_string\(loc\.pose\.position\.y\)\);/);
});
