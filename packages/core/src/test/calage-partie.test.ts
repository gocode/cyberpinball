// Calage qui ne tient pas quand on retire le casque (12 novembre 2026, PinCab : limite fixe, Guardian
// désactivé ; trois calages de la même barre avant le même soir, tournés de +29°, 0° et -53° dans la pièce
// du Quest, et aucun événement de changement de pièce). Le recalage d'un geste, au menu comme en partie,
// doit retomber exactement sur la vraie barre avant ; la pièce recentrée se voit au journal.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  CALIBRATION_HOLD_S,
  calibrationCombo,
  CalibrationComboHold,
  calibrationComboLabel,
  controllerProblem,
  defaultControllerSetting,
  expectedGrips,
  gripOffset,
  headAtWear,
  inGameCalibrationReport,
  headsetFunctions,
  inGameCalibration,
  lockbarPlace,
  placeFromVpxCentering,
  placeGap,
  placeVpxSettings,
  readControllerSetting,
  roomChangeGap,
  roomKeepingAdvice,
  VPX_CALIBRATION_KEYS,
  vpxControllerCentering,
  vpxHeadsetInput,
  vpxMappingsFor,
  type CabinetPlace,
  type Point3,
} from '../index';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8').replace(/\r\n/g, '\n');

// Les deux premiers calages du 12 novembre 2026 sur le PinCab (journal : « pointes … »), la même vraie barre.
const SOIR = [
  { left: { x: -0.401652, y: 1.013034, z: -0.124366 }, right: { x: 0.112666, y: 1.017298, z: -0.40512 } },
  { left: { x: -0.271292, y: 1.039949, z: -0.271695 }, right: { x: 0.315513, y: 1.028089, z: -0.274344 } },
];
const TABLE = { widthCm: 51.4, glassBottomCm: 11.3 };
const MENU_WIDTH = 0.53;
const GRIP = { up: 0.035, back: 0.06, widthRatio: 0.97 };

/** La même vraie barre, dans une pièce recentrée : tournée de `yaw` autour de la verticale, déplacée de (dx, dz). */
function moved(p: Point3, yaw: number, dx: number, dz: number): Point3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: c * p.x + s * p.z + dx, y: p.y, z: -s * p.x + c * p.z + dz };
}

const settingsOf = (place: CabinetPlace) => Object.fromEntries(placeVpxSettings(place, TABLE, MENU_WIDTH).map((s) => [s.key, Number(s.value)]));

test('constat : la pièce du Quest recentrée entre deux calages de la même barre (cap, milieu)', () => {
  const [a, b] = SOIR.map((c) => lockbarPlace(c.left, c.right));
  const gap = placeGap(a!, b!);
  assert.ok(gap.deg > 25 && gap.deg < 35, `cap ${gap.deg}`);
  assert.ok(gap.cm > 10, `milieu ${gap.cm}`);
  // Le sol, lui, ne bouge pas : la hauteur de la barre reste la même (à 2 cm près).
  assert.ok(Math.abs(a!.lockbarHeight! - b!.lockbarHeight!) < 0.03);
});

test('écart prises-bouts : mesuré au calage du menu, retrouvé tel quel', () => {
  const tips: [Point3, Point3] = [SOIR[1]!.left, SOIR[1]!.right];
  const grips = expectedGrips(tips[0], tips[1], GRIP);
  const g = gripOffset(tips, grips)!;
  assert.ok(Math.abs(g.up - GRIP.up) < 1e-6 && Math.abs(g.back - GRIP.back) < 1e-6 && Math.abs(g.widthRatio - GRIP.widthRatio) < 1e-6);
  // Deux poses sans rapport (une manette dans la main, l'autre sur la barre) : rien de gardé.
  assert.equal(gripOffset(tips, [{ x: 0, y: 0, z: 0 }, { x: 0.6, y: 0, z: 0 }]), undefined);
});

test('changement d’origine simulé, puis calage en partie : VPX retombe exactement sur la vraie barre, la borne du menu suit', () => {
  const calibrated: CabinetPlace = { ...lockbarPlace(SOIR[1]!.left, SOIR[1]!.right), grip: GRIP };
  const ig = inGameCalibration(calibrated, TABLE, MENU_WIDTH);
  assert.equal(ig.measured, true);
  for (const [yaw, dx, dz] of [
    [(-53 * Math.PI) / 180, 0.4, 0.1],
    [(29 * Math.PI) / 180, -0.15, 0.02],
    [Math.PI, 0.3, -0.5],
  ] as const) {
    // Le casque remis : la même vraie barre, ailleurs dans la nouvelle pièce ; le joueur y pose ses manettes.
    const left = moved(SOIR[1]!.left, yaw, dx, dz);
    const right = moved(SOIR[1]!.right, yaw, dx, dz);
    const truth: CabinetPlace = { ...lockbarPlace(left, right), grip: GRIP };
    const want = settingsOf(truth);
    // VPX s'aligne sur les prises, avec les réglages écrits au lancement, puis la hauteur reprise par pas d'un cm.
    const [gl, gr] = expectedGrips(left, right, GRIP);
    const vpx = vpxControllerCentering(gl, gr, TABLE.widthCm + 2.25 * 2.54, ig.lockbarScale, ig.cabYOffset);
    assert.ok(Math.abs(((vpx.orientation - want.Orientation! + 540) % 360) - 180) < 0.01, `orientation ${vpx.orientation} / ${want.Orientation}`);
    assert.ok(Math.abs(vpx.tableX - want.TableX!) < 0.05, `TableX ${vpx.tableX} / ${want.TableX}`);
    assert.ok(Math.abs(vpx.tableY - want.TableY!) < 0.05, `TableY ${vpx.tableY} / ${want.TableY}`);
    assert.ok(Math.abs(vpx.lockbarWidth - want.LockbarWidth!) < 0.05, `largeur ${vpx.lockbarWidth} / ${want.LockbarWidth}`);
    // Hauteur : barre avant + TableZ, au centimètre (les pas de VRUp, VRDown).
    assert.ok(Math.abs(vpx.lockbarHeight + ig.heightSteps - (want.LockbarHeight! + want.TableZ!)) <= 0.5, `hauteur ${vpx.lockbarHeight + ig.heightSteps} / ${want.LockbarHeight! + want.TableZ!}`);
    // Après la partie : VPX réécrit Orientation, TableX, TableY ; la borne du menu revient sur la vraie barre.
    const back = placeFromVpxCentering({ orientation: vpx.orientation, tableX: vpx.tableX, tableY: vpx.tableY }, calibrated, ig, TABLE, MENU_WIDTH);
    const gap = placeGap(truth, back);
    assert.ok(gap.cm < 0.1 && gap.deg < 0.05, `écart ${gap.cm} cm, ${gap.deg}°`);
    assert.equal(back.grip, GRIP);
    assert.equal(back.lockbarHeight, calibrated.lockbarHeight);
  }
});

test('sans prises mesurées (calage d’avant) : le calage en partie marche, l’écart prises-bouts est dit au journal', () => {
  const place = lockbarPlace(SOIR[0]!.left, SOIR[0]!.right);
  const ig = inGameCalibration(place, TABLE, MENU_WIDTH);
  assert.equal(ig.measured, false);
  assert.ok(ig.lockbarScale >= 0.5 && ig.lockbarScale <= 2 && ig.cabYOffset >= -150 && ig.cabYOffset <= 50 && Math.abs(ig.heightSteps) <= 60);
  assert.match(read('app', 'src', 'frontend.ts'), /prises des manettes pas encore mesurées : recalez au menu/);
});

test('détection : pièce recentrée par le Quest (limite fixe) dite au journal, calage proposé au casque remis', () => {
  const casque = read('packages', 'casque-vr', 'src', 'casque.cpp');
  assert.match(casque, /say\("piece aucune"\);/);
  assert.match(casque, /" prises " \+ p3\(gr\[0\]\.pose\.position\)/);
  assert.match(casque, /"\/user\/hand\/left\/input\/grip\/pose"/);
  const ts = read('app', 'src', 'casque.ts');
  assert.match(ts, /if \(line === 'piece aucune'\) \{/);
  assert.match(ts, /if \(!this\.worn\) this\.takenOff = this\.takenOffSeen = true;/);
  assert.match(ts, /this\.opts\.onPutBackOn\?\.\(\);/);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /onPutBackOn: \(\) => headsetPutBackOn\(\),/);
  assert.match(front, /if \(!place \|\| headsetSetting\(\) === 'bureau' \|\| headset\?\.roomKeeping !== 'recentred'\) return;/);
  // L'écart prises-bouts survit à la relecture de casque.json.
  assert.match(ts, /\.\.\.\(grip && \{ grip \}\) \};/);
  assert.match(front, /offerCalibration\('casque-remis'\);/);
  // Changement de pièce dit par le runtime pendant la session : l'écart au journal.
  const gap = roomChangeGap('piece-changee pose 0.300000 0.000000 -0.400000 0.523599')!;
  assert.ok(Math.abs(gap.cm - 50) < 0.01 && Math.abs(gap.deg - 30) < 0.01);
  assert.equal(roomChangeGap('piece-changee sans-pose'), undefined);
  assert.match(ts, /origine de la pièce changée : écart \$\{gap\.cm\.toFixed\(0\)\} cm/);
  // La tête au port, vue de l'origine : départage la cause (13 novembre 2026). Collée à l'origine : remise sur la tête.
  assert.match(casque, /say\("tete-au-port " \+ std::to_string\(loc\.pose\.position\.x\)/);
  const near = headAtWear('tete-au-port 0.100000 -0.150000 0.087266')!;
  assert.ok(Math.abs(near.cm - Math.hypot(10, 15)) < 0.01 && Math.abs(near.deg - 5) < 0.01 && near.onHead);
  assert.equal(headAtWear('tete-au-port 0.600000 0.300000 1.2')!.onHead, false);
  assert.match(ts, /const atWear = headAtWear\(line\);/);
  assert.match(ts, /const after = this\.takenOffSeen \? 'après un retrait du casque' : 'au premier port de la session';/);
  // Limite fixe vue la première fois : le passage en limite de pièce conseillé une fois (astuce-limite.json).
  assert.match(front, /onStationary: \(\) => roomscaleTip\(\),/);
  assert.match(front, /const file = path\.join\(loc\.dataDir, 'vr', 'astuce-limite\.json'\);/);
  // Conseil à l'écran du calage proposé : limite de pièce, ou le geste.
  assert.match(roomKeepingAdvice('recentred', 'les deux joysticks enfoncés ensemble, 3 s') ?? '', /limite fixe.*les deux joysticks/);
  assert.equal(roomKeepingAdvice('kept', 'x'), undefined);
});

test('combinaison : les deux clics des joysticks, libres au menu comme dans VPX, tenus 3 s', () => {
  assert.deepEqual(calibrationCombo('touch'), ['clic-joystick-gauche', 'clic-joystick-droit']);
  assert.equal(calibrationCombo('index'), undefined);
  assert.equal(calibrationCombo('vive'), undefined);
  assert.equal(calibrationComboLabel('vive'), undefined);
  for (const profile of ['touch', 'wmr'] as const) {
    const setting = defaultControllerSetting(profile);
    assert.equal(controllerProblem(setting), undefined, profile);
    // Aucune fonction sur les boutons de la combinaison (ni A, B, gâchettes, poignées, joysticks, ni Meta).
    for (const f of headsetFunctions()) assert.ok(!calibrationCombo(profile)!.includes(setting.functions[f.id] as never), `${profile} ${f.id}`);
  }
  // Lancer la bille passe sur Y (libre) ; un réglage gardé d'avant (clic droit) y est repris.
  assert.equal(defaultControllerSetting('touch').functions.lancer, 'y');
  const old = { profile: 'touch', functions: { ...defaultControllerSetting('touch').functions, lancer: 'clic-joystick-droit' } };
  assert.equal(readControllerSetting(JSON.stringify(old), 'touch').functions.lancer, 'y');
  assert.match(controllerProblem({ profile: 'touch', functions: { ...defaultControllerSetting('touch').functions, lancer: 'clic-joystick-gauche' } }) ?? '', /caler la borne/);
  // Dans VPX : les porteurs Custom1, Custom2 sur les clics ; les touches du plugin pour VPX.
  const m = vpxMappingsFor(defaultControllerSetting('touch'));
  assert.deepEqual(m.Custom1, ['OpenXR;12']);
  assert.deepEqual(m.Custom2, ['OpenXR;13']);
  assert.deepEqual(m.LaunchBall, ['OpenXR;9']);
  assert.deepEqual(m.VRControllerCalibration, ['Key;104']);
  assert.deepEqual(vpxMappingsFor(defaultControllerSetting('index')).Custom1, []);
  // Les touches du clavier gardées : VRUp garde 8 du pavé, reçoit F14 ; rien d'écrit en double.
  const ini = vpxHeadsetInput('[Input]\nMapping.VRUp = Key;96\n');
  assert.equal(ini.find((s) => s.key === 'Mapping.VRUp')?.value, 'Key;96 | Key;105');
  assert.equal(vpxHeadsetInput('[Input]\nMapping.VRUp = Key;96 | Key;105\n').find((s) => s.key === 'Mapping.VRUp'), undefined);
  assert.equal(ini.find((s) => s.key === 'Mapping.VRControllerCalibration')?.value, 'Key;104');
});

test('invariant : la même combinaison, la même durée et les mêmes touches dans le plugin, le compagnon et Cyber Pinball', () => {
  const pause = read('packages', 'vpx-vision3d', 'src', 'pause.h');
  const plugin = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  assert.match(pause, new RegExp(`constexpr double CALAGE_HOLD_S = ${CALIBRATION_HOLD_S.toFixed(1)};`));
  // VPX 10.8.1 (révision 5436) : Custom1 et Custom2 sont les actions 52 et 53.
  assert.match(pause, /\{ Commande::CalageG, -1 \},\s+\/\/ 52 Custom1/);
  assert.match(pause, /\{ Commande::CalageD, -1 \},\s+\/\/ 53 Custom2/);
  // F13, F14, F15 : codes de balayage 0x64, 0x65, 0x66, codes SDL 104, 105, 106.
  assert.deepEqual(VPX_CALIBRATION_KEYS, { VRControllerCalibration: 104, VRUp: 105, VRDown: 106 });
  assert.match(plugin, /TOUCHE_ALIGNER = VK_F13, BALAYAGE_ALIGNER = 0x64/);
  assert.match(plugin, /TOUCHE_MONTER = VK_F14, BALAYAGE_MONTER = 0x65/);
  assert.match(plugin, /TOUCHE_DESCENDRE = VK_F15, BALAYAGE_DESCENDRE = 0x66/);
  // Le plugin ne cale que si Cyber Pinball a lié les touches (Calibrate = 1) ; la ligne du journal en sort.
  assert.match(plugin, /if \(calageActif_Val\)/);
  assert.match(plugin, /calage-partie n=%d hauteur=%d resultat=ok/);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /\/\^calage-partie \.\*resultat=ok\/m/);
  assert.match(front, /key: 'ControllerCabYOffset', value: String\(ig\.cabYOffset\)/);
  assert.match(front, /key: 'CalibrateHeight', value: String\(ig\.heightSteps\)/);
  // Au menu : la combinaison tenue CALIBRATION_HOLD_S ouvre le calage, avec la jauge dans le casque.
  assert.match(front, /comboTimer = setTimeout\(\(\) => \{/);
  assert.match(read('app', 'renderer', 'frontend.js'), /if \(role === 'backglass' && s\.headsetHold\) \{/);
});

test('détection de la panne du geste en partie (13 novembre 2026, « rien du tout ») : chaque étape au journal du plugin, bilan à la fin de la partie', () => {
  const plugin = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  for (const line of ['calage actif=%d hauteur=%d', 'calage-clic %s=%d fiable=%d', 'calage-combinaison tenue', 'calage-etape ouverte', 'calage-gachette', 'calage-touche F13 marche', 'calage-touche F13 arret', 'passif raison=version', 'passif raison=actions'])
    assert.ok(plugin.includes(line), line);
  // Plugin d'avant : rien à dire. Aucun clic arrivé : VPX ne les transmet pas.
  assert.equal(inGameCalibrationReport('debut table=x\nmesure t=5'), undefined);
  assert.equal(inGameCalibrationReport('calage actif=1 hauteur=13\nmesure t=5'), undefined);
  assert.match(inGameCalibrationReport('calage actif=1 hauteur=13\npassif raison=actions action=3 liee=3')!, /plugin passif \(actions\)/);
  assert.match(inGameCalibrationReport('calage actif=0 hauteur=0')!, /touches du calage pas liées/);
  assert.match(inGameCalibrationReport('calage actif=1 hauteur=13\ncalage-clic gauche=1 fiable=1\ncalage-clic gauche=0 fiable=1')!, /1 clic\(s\)[\s\S]*jamais été tenus ensemble/);
  const full = ['calage actif=1 hauteur=13', 'calage-clic gauche=1 fiable=1', 'calage-clic droit=1 fiable=1', 'calage-combinaison tenue', 'calage-combinaison pause demandee', 'calage-etape ouverte', 'calage-gachette', 'calage-touche F13 marche', 'calage-touche F13 arret', 'calage-partie n=1 hauteur=13 resultat=ok'].join('\n');
  assert.match(inGameCalibrationReport(full)!, /2 clic\(s\)[\s\S]*1 calage\(s\) fait\(s\) ; calage fait$/);
  assert.match(inGameCalibrationReport(full.replace('calage-partie n=1 hauteur=13 resultat=ok', ''))!, /touche F13 pas postée/);
  assert.match(read('app', 'src', 'frontend.ts'), /const calibrationReport = inGameCalibrationReport\(block\.text\);/);
  // Les actions vues par le plugin (première de chacune, « action-vue ») : dit sur la borne si les manettes l'atteignent.
  assert.match(inGameCalibrationReport('calage actif=1 hauteur=13\naction-vue id=1 pressee=1\naction-vue id=0 pressee=1\naction-vue id=22 pressee=1')!, /actions de VPX reçues : 0, 1, 22 ; aucun clic des joysticks : geste pas fait, ou VPX ne transmet pas les clics alors que les gâchettes arrivent/);
  assert.match(inGameCalibrationReport('calage actif=1 hauteur=13\naction-vue id=24 pressee=1')!, /ni aucune gâchette : les manettes du casque n’atteignent pas le plugin/);
  assert.match(inGameCalibrationReport(full + '\naction-vue id=52 pressee=1\naction-vue id=53 pressee=1')!, /actions de VPX reçues : 52, 53 ; calage fait$/);
  // Le plugin écrit la première action de chaque sorte, remise à zéro à chaque partie ; une gâchette n'est pas
  // comptée deux fois (le second temps du flipper n'est pas une gâchette : banc de VPX, une gâchette = deux calages).
  const pluginSrc = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  assert.match(pluginSrc, /"action-vue id=%u pressee=%d"/);
  assert.match(pluginSrc, /actionsVues\[0\] = actionsVues\[1\] = 0;/);
  assert.match(read('packages', 'vpx-vision3d', 'src', 'pause.h'), /inline bool estGachette\(int id\) \{ return id == 0 \|\| id == 1; \}/);
});

test('geste au menu (13 novembre 2026, PinCab : rien) : détecté avant l’assistant des manettes, sans réglage, chaque étape au journal', () => {
  const combo = calibrationCombo('touch')!;
  const hold = new CalibrationComboHold(combo, 3000);
  // Un seul joystick, même longtemps : rien.
  assert.equal(hold.press('clic-joystick-gauche', true, 0), 'clic');
  assert.equal(hold.due(10_000), false);
  // Les deux : la jauge part tout de suite (début), le calage à 3 s, une seule fois.
  assert.equal(hold.press('clic-joystick-droit', true, 10_000), 'debut');
  assert.equal(hold.heldSince(), 10_000);
  assert.equal(hold.due(12_999), false);
  assert.equal(hold.due(13_000), true);
  assert.equal(hold.due(14_000), false);
  assert.equal(hold.press('clic-joystick-droit', false, 14_000), 'clic');
  // Appui court : lâché à 2 s, rien ne s'ouvre, la jauge s'efface.
  assert.equal(hold.press('clic-joystick-droit', true, 20_000), 'debut');
  assert.equal(hold.press('clic-joystick-gauche', false, 22_000), 'lachee');
  assert.equal(hold.due(30_000), false);
  // Les autres boutons ne la concernent pas ; tout relâché (casque retiré) : rien ne reste tenu.
  assert.equal(hold.press('a', true, 0), undefined);
  hold.reset();
  assert.equal(hold.heldSince(), undefined);
  const front = read('app', 'src', 'frontend.ts');
  // Avant l'assistant des manettes (ouvert d'office sans réglage gardé), qui prenait tous les boutons.
  assert.match(front, /function headsetButton\(name: string, down: boolean\): void \{\s*\/\/[^\n]*\n\s*calibrationComboButton\(name, down\);\s*if \(controllerWizard\) \{/);
  // Seulement le profil des manettes, jamais leur réglage.
  assert.match(front, /function calibrationComboButton\(name: string, down: boolean\): void \{\s*const profile = headset\?\.profile \?\? 'touch';\s*const combo = calibrationCombo\(profile\);/);
  const start = front.indexOf('function calibrationComboButton');
  assert.doesNotMatch(front.slice(start, front.indexOf('\n}\n', start)), /controllerSetting\(\)/);
  // Chaque étape au journal, la jauge dès que les deux sont tenus, l'assistant fermé quand le calage s'ouvre.
  assert.match(front, /Casque : combinaison du calage, \$\{name\} \$\{down \? 'enfoncé' : 'relâché'\}/);
  assert.match(front, /if \(event !== 'debut'\) return;[\s\S]{0,600}headsetHoldView = \{ since: Date\.now\(\), durationMs: CALIBRATION_HOLD_S \* 1000/);
  assert.match(front, /if \(controllerWizard\) closeControllerWizard\(false\);\s*openCalibration\(\);/);
});

test('aide : la combinaison dans le détail de « Caler la borne », dans les manuels et au premier port du casque', () => {
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /function calibrationComboTip\(\): void \{/);
  assert.match(front, /combo: calibrationComboLabel\(headset\?\.profile \?\? 'touch'\)/);
  for (const [file, words] of [
    ['docs/manuel.md', /deux joysticks enfoncés ensemble/],
    ['docs/manual.md', /both thumbsticks pressed together/],
  ] as const)
    assert.match(read(file), words, file);
});
