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
  boundaryOf,
  roomFromHeads,
  roomFromRecalibration,
  roomMeasureText,
  ROOM_HEAD_MIN_SAMPLES,
  ROOM_KEPT_HEAD_CM,
  ROOM_KEPT_HEAD_DEG,
  ROOM_KEPT_RECALIBRATION_CM,
  ROOM_KEPT_RECALIBRATION_DEG,
  shouldOfferCalibration,
  staleCalibration,
  CONTROLLER_SCHEMA_PROFILES,
  GESTURE_CARD_MS,
  SCHEMA_ELEMENTS,
  CONTROLLER_ELEMENTS,
  isControllerElement,
  TRIGGERS_HINT_COMBO,
  TRIGGERS_HINT_S,
  ovrRuntimeDlls,
  anchorPlace,
  movePlace,
  moveContour,
  composeJumps,
  RoomFrame,
  type JumpTransform,
  inverseJump,
  sameContour,
  ANCHOR_MAX_RESIDUAL_CM,
  ANCHOR_MIN_CM,
  ANCHOR_MIN_DEG,
  originResetAtWear,
  ORIGIN_RESET_CM,
  ORIGIN_RESET_DEG,
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
  assert.match(front, /onPutBackOn: \(\) => \{\s*checkStaleCalibration\(\);\s*headsetPutBackOn\(\);\s*\},/);
  assert.match(front, /if \(!place \|\| headsetSetting\(\) === 'bureau' \|\| headset\?\.roomKeeping !== 'recentred'\) return;/);
  // L'écart prises-bouts survit à la relecture de casque.json.
  assert.match(ts, /\.\.\.\(grip && \{ grip \}\), \.\.\.\(p\.free === true && \{ free: true \}\), \.\.\.\(boundary && \{ boundary \}\), \.\.\.\(head && \{ head \}\), \.\.\.\(contour && \{ contour \}\) \};/);
  assert.match(front, /offerCalibration\('casque-remis'\);/);
  // Changement de pièce dit par le runtime pendant la session : l'écart au journal.
  const gap = roomChangeGap('piece-changee pose 0.300000 0.000000 -0.400000 0.523599')!;
  assert.ok(Math.abs(gap.cm - 50) < 0.01 && Math.abs(gap.deg - 30) < 0.01);
  assert.equal(roomChangeGap('piece-changee sans-pose'), undefined);
  assert.match(ts, /origine de la pièce changée : écart \$\{gap\.cm\.toFixed\(0\)\} cm/);
  // La tête au port, mesurée sur la tête au calage (repère physique), plus de seuil sur l'origine (13 novembre 2026).
  assert.match(casque, /say\("tete-au-port " \+ std::to_string\(loc\.pose\.position\.x\)/);
  const near = headAtWear('tete-au-port 0.100000 -0.150000 0.087266')!;
  assert.ok(Math.abs(near.cm - Math.hypot(10, 15)) < 0.01 && Math.abs(near.deg - 5) < 0.01 && !near.fromPlace);
  const atPlace = headAtWear('tete-au-port 0.600000 0.300000 0.087266', { x: 0, z: 0, yaw: 0, head: { x: 0.5, z: 0.3 } })!;
  assert.ok(Math.abs(atPlace.cm - 10) < 0.01 && Math.abs(atPlace.deg - 5) < 0.01 && atPlace.fromPlace);
  assert.match(ts, /const atWear = headAtWear\(line, this\.readPlace\(\)\);/);
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

test('calage périmé (13 novembre 2026) : limite changée de type ou de taille, dit une fois, proposé une fois au menu', () => {
  const calee: CabinetPlace = { x: 0, z: 0, yaw: 0, lockbarWidth: 0.6, lockbarHeight: 0.9 };
  const piece = { width: 2.5, depth: 3.4 };
  // Même type, même taille : rien. Type inconnu (calage d'avant, sans limite de pièce gardée) : rien.
  assert.equal(staleCalibration({ ...calee, boundary: 'fixe' }, 'recentred', undefined), undefined);
  assert.equal(staleCalibration({ ...calee, boundary: 'piece', room: piece }, 'kept', { width: 2.52, depth: 3.38 }), undefined);
  assert.equal(staleCalibration(calee, 'kept', piece), undefined);
  assert.equal(staleCalibration({ ...calee, boundary: 'fixe', free: true }, 'kept', piece), undefined);
  assert.equal(staleCalibration({ x: 0, z: 0, yaw: 0, boundary: 'fixe' }, 'kept', piece), undefined);
  // Fixe ↔ pièce, dans les deux sens ; pièce d'une autre taille.
  const versPiece = staleCalibration({ ...calee, boundary: 'fixe' }, 'kept', piece)!;
  assert.match(versPiece.log, /^calage fait en limite fixe, Quest maintenant en limite de pièce \(2\.50 × 3\.40 m\)$/);
  const versFixe = staleCalibration({ ...calee, room: piece }, 'recentred', undefined)!;
  assert.equal(versFixe.signature, 'piece>fixe');
  const taille = staleCalibration({ ...calee, boundary: 'piece', room: piece }, 'kept', { width: 3, depth: 3.4 })!;
  assert.equal(taille.signature, 'piece 2.50 × 3.40 m>3.00 × 3.40 m');
  assert.equal(boundaryOf('recentred'), 'fixe');
  assert.equal(boundaryOf('kept'), 'piece');
  // Proposé d'office, quel que soit le type de limite ; une seule fois par signature (calage-perime.json).
  assert.equal(shouldOfferCalibration('limite-changee', 'kept'), true);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /onRoom: \(\) => checkStaleCalibration\(\),/);
  assert.match(front, /if \(offered === stale\.signature\) return;/);
  assert.match(front, /if \(!offerCalibration\('limite-changee'\)\) return;\s*try \{\s*fs\.mkdirSync/);
  assert.match(front, /\.\.\.\(boundary && \{ boundary \}\), \.\.\.\(head && \{ head \}\) \};/);
  // Limite fixe dite au compagnon : onRoom aussi (un calage fait en limite de pièce devient périmé).
  assert.match(read('app', 'src', 'casque.ts'), /this\.roomKeeping = 'recentred';\s*this\.room = undefined;\s*this\.opts\.onRoom\?\.\(undefined, false\);/);
});

test('pièce gardée ou déplacée, mesurée sur des repères physiques (13 novembre 2026)', () => {
  // Seuils figés : la tête en partie à 30 cm et 20° de la tête au calage ; un recalage à 5 cm et 3° du précédent.
  assert.deepEqual([ROOM_KEPT_HEAD_CM, ROOM_KEPT_HEAD_DEG, ROOM_KEPT_RECALIBRATION_CM, ROOM_KEPT_RECALIBRATION_DEG, ROOM_HEAD_MIN_SAMPLES], [30, 20, 5, 3, 3]);
  const place: CabinetPlace = { x: 0, z: 0, yaw: 0, lockbarWidth: 0.6, lockbarHeight: 0.9, head: { x: 0, z: 0.1 } };
  const deg = (d: number) => (d * Math.PI) / 180;
  // Le joueur à sa place, un regard de côté : pièce gardée (médianes).
  const joue = [{ x: 0.05, z: 0.12, yaw: deg(3) }, { x: -0.04, z: 0.08, yaw: deg(-2) }, { x: 0.02, z: 0.15, yaw: deg(70) }, { x: 0.01, z: 0.1, yaw: deg(1) }];
  const gardee = roomFromHeads(place, joue)!;
  assert.ok(gardee.kept && gardee.cm < 5 && gardee.deg < 3, JSON.stringify(gardee));
  assert.match(roomMeasureText(gardee, 'tête'), /^pièce gardée \(tête : écart \d+ cm et \d+°\)$/);
  // Le Quest a recentré la pièce : le joueur au même endroit réel, vu 40 cm et 29° plus loin.
  const recentree = roomFromHeads(place, joue.map((h) => ({ x: h.x + 0.4, z: h.z, yaw: h.yaw + deg(29) })))!;
  // Médianes : x 0,015 + 0,4 et z 0,11 face à (0 ; 0,1), soit 42 cm ; caps 27, 30, 32 et 99°, soit 31°.
  assert.ok(!recentree.kept && Math.round(recentree.cm) === 42 && Math.round(recentree.deg) === 31, JSON.stringify(recentree));
  assert.equal(roomMeasureText(recentree, 'tête'), 'pièce déplacée de 42 cm et 31° (tête)');
  // Trop peu de relevés, ou pas de tête gardée au calage : pas de verdict.
  assert.equal(roomFromHeads(place, joue.slice(0, 2)), undefined);
  assert.equal(roomFromHeads({ ...place, head: undefined }, joue), undefined);
  // Recalage de la même barre : l'écart des deux barres.
  assert.ok(roomFromRecalibration(place, { ...place, x: 0.02 }).kept);
  const deplacee = roomFromRecalibration(place, { ...place, yaw: deg(-53) });
  assert.ok(!deplacee.kept && Math.round(deplacee.deg) === 53);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /console\.log\(`Casque : recalage, \$\{roomMeasureText\(roomFromRecalibration\(previous, place\), 'barre avant recalée face à la précédente'\)\}\.`\);/);
  assert.match(front, /const measure = roomFromHeads\(place, gameHeads\);/);
  assert.match(front, /c\.head = head;/);
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
  assert.match(front, /function headsetButton\(name: string, down: boolean\): void \{\s*\/\/[^\n]*\n\s*calibrationComboButton\(name, down\);\s*triggersHintButton\(name, down\);\s*if \(controllerWizard\) \{/);
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

test('sonde LibOVR (13 novembre 2026) : la DLL du runtime de Meta, lancée avec la VR, au journal, sans rien changer', () => {
  // Le manifeste réel de Meta Horizon Link (13 novembre 2026, borne et poste de développement) : il nomme
  // LibOVRRTImpl64_1.dll ; la sonde essaie d'abord LibOVRRT64_1.dll, l'entrée LibOVR, dans le même dossier.
  const dir = 'C:\\Program Files\\Meta Horizon\\Support\\oculus-runtime';
  const real = JSON.stringify({ file_format_version: '1.0.0', runtime: { name: 'Oculus OpenXR', library_path: '.\\LibOVRRTImpl64_1.dll' } });
  assert.deepEqual(ovrRuntimeDlls(`${dir}\\oculus_openxr_64.json`, real), [`${dir}\\LibOVRRT64_1.dll`, `${dir}\\LibOVRRTImpl64_1.dll`]);
  assert.deepEqual(ovrRuntimeDlls(`${dir}\\oculus_openxr_64.json`, JSON.stringify({ runtime: { library_path: '.\\LibOVRRT64_1.dll' } })), [`${dir}\\LibOVRRT64_1.dll`, `${dir}\\LibOVRRTImpl64_1.dll`]);
  assert.deepEqual(ovrRuntimeDlls('C:\\Steam\\steamxr_win64.json', JSON.stringify({ runtime: { library_path: '..\\bin\\vrclient_x64.dll' } })), []);
  assert.deepEqual(ovrRuntimeDlls('C:\\x\\a.json', 'pas du json'), []);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /ovrProbe\.set\(vrMode === 'auto'\);/);
  assert.match(front, /headset\?\.dispose\(\);\s*ovrProbe\.set\(false\);/);
  const sonde = read('app', 'src', 'sonde-ovr.ts');
  assert.match(sonde, /spawn\(exe, \['--ovr', dll, \.\.\.\(this\.opts\.undoOrigin \? \['--defaire-origine'\] : \[\]\)\]/);
  assert.match(sonde, /this\.opts\.log\(`Casque, sonde LibOVR : \$\{line\.slice\(4\)\}`\)/);
  // Rien de Meta n'est livré : la sonde charge la DLL installée, sans en-tête du SDK.
  const cpp = read('packages', 'casque-vr', 'src', 'sonde-ovr.cpp');
  assert.doesNotMatch(cpp, /#include\s*[<"]OVR/);
  assert.match(cpp, /INIT_INVISIBLE = 0x10/);
  // Boutons bruts du compagnon au journal (pas les directions des joysticks), tête au menu toutes les 5 s.
  assert.match(read('app', 'src', 'casque.ts'), /if \(!parseControllerEvent\(button\[1\]!\)\?\.direction\) this\.opts\.log\(`Casque, bouton brut : /);
  assert.match(read('packages', 'casque-vr', 'src', 'casque.cpp'), /say\("tete-menu " \+/);
  assert.match(read('scripts', 'fabriquer.mjs'), /'cyberpinball-sonde-ovr\.exe'/);
});

test('aide des gâchettes (13 novembre 2026 : le geste du calage confondu avec les gâchettes) : au menu, une fois, jamais en partie ni au calage', () => {
  assert.equal(TRIGGERS_HINT_S, 2);
  assert.deepEqual(TRIGGERS_HINT_COMBO, ['gachette-gauche', 'gachette-droite']);
  const hold = new CalibrationComboHold(TRIGGERS_HINT_COMBO, TRIGGERS_HINT_S * 1000);
  assert.equal(hold.press('gachette-gauche', true, 0), 'clic');
  assert.equal(hold.press('gachette-droite', true, 100), 'debut');
  assert.equal(hold.due(2_099), false);
  assert.equal(hold.due(2_100), true);
  assert.equal(hold.due(3_000), false);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /if \(event !== 'debut' \|\| calibration \|\| controllerWizard \|\| playing \|\| launch \|\| !calibrationCombo\(headset\?\.profile \?\? 'touch'\)\) return;/);
  assert.match(front, /showBanner\(t\('Pour recaler la borne : enfoncez les deux sticks, pas les gâchettes'\)\);/);
  // Toute autre touche annule l'aide.
  assert.match(front, /if \(!TRIGGERS_HINT_COMBO\.includes\(name as ControllerButton\)\) \{\s*if \(down\) \{\s*triggersHold\.reset\(\);/);
});

test('schéma des manettes (maquette validée le 13 novembre 2026) : un composant, la commande en vert, Touch seulement', () => {
  const html = read('app', 'renderer', 'frontend.html');
  assert.ok(html.indexOf('schema-manettes.js') > 0 && html.indexOf('schema-manettes.js') < html.indexOf('frontend.js'));
  const js = read('app', 'renderer', 'schema-manettes.js');
  // Les profils dessinés, les mêmes des deux côtés ; un autre profil garde le texte seul.
  assert.deepEqual([...CONTROLLER_SCHEMA_PROFILES], ['touch']);
  assert.match(js, /const SCHEMA_PROFILES = \['touch'\];/);
  // Les commandes du dessin portent les noms des éléments des manettes (manettes.ts).
  for (const name of ['clic-joystick-gauche', 'clic-joystick-droit', 'menu-gauche']) assert.ok(isControllerElement(name) && js.includes(name), name);
  assert.match(js, /`gachette-\$\{cote\}`/);
  assert.match(js, /`poignee-\$\{cote\}`/);
  // Pas de style en ligne (CSP de la page : style-src 'self') ; les lettres du dessin hors du garde-fou des 20 px.
  assert.doesNotMatch(js, /style=|<style/);
  assert.match(js, /box\.dataset\.belowFloor = '';/);
  // Les styles du schéma dans leur feuille, partagée par la page du casque et la page de l'image de la pause.
  assert.match(read('app', 'renderer', 'schema-manettes.css'), /\.schema-vert \{ fill: var\(--signal\); stroke: var\(--signal\);/);
  assert.match(html, /<link rel="stylesheet" href="schema-manettes\.css" \/>/);
  // Le calage : gâchettes pour placer, A une fois placée ; en bas, le geste des sticks ; le conseil ne le répète pas.
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /const schema = drawn && !desk && !c\.placing \? \(c\.place \? \['a'\] : \['gachette-gauche', 'gachette-droite'\]\) : undefined;/);
  assert.match(front, /band: \{ \.\.\.\(drawn && \{ schema: \[\.\.\.combo\] \}\), text: t\('À tout moment, enfoncez les deux sticks 3 s'\)/);
  assert.match(front, /calibrationCombo\(headset\?\.profile \?\? 'touch'\) \? undefined : calibrationComboLabel\(headset\?\.profile\)/);
  // La carte du geste : rappel au premier port et aide des gâchettes ; sans dessin, le bandeau en texte.
  assert.equal(GESTURE_CARD_MS, 6000);
  assert.match(front, /if \(!showGestureCard\(\)\) showBanner\(t\('Recaler la borne à tout moment/);
  assert.match(front, /if \(!showGestureCard\(\)\) showBanner\(t\('Pour recaler la borne : enfoncez les deux sticks, pas les gâchettes'\)\);/);
  assert.match(front, /headsetCard: headsetCardView/);
  // Le texte du geste dit où et avec quel doigt.
  assert.match(calibrationComboLabel('touch')!, /sous les pouces/);
});

test('schéma des manettes, planches d’adaptation validées (13 novembre 2026) : pause en partie, assistant, légende', () => {
  // Pause en partie : Cyber Pinball fait l'image avec le vrai composant (titre, schéma, ligne d'aide), le plugin la pose.
  const page = read('app', 'renderer', 'schema-image.html');
  assert.ok(page.indexOf('schema-manettes.js') > 0 && page.indexOf('schema-manettes.js') < page.indexOf('schema-image.js'));
  assert.match(page, /style-src 'self'/);
  assert.doesNotMatch(read('app', 'renderer', 'schema-image.js'), /style=|\.style\./);
  const image = read('app', 'src', 'schema-image.ts');
  assert.match(image, /createHash\('sha1'\)\.update\(JSON\.stringify\(\{ v: SCHEMA_IMAGE_VERSION, \.\.\.image \}\)\)/);
  assert.match(image, /transparent: true, backgroundColor: '#00000000', webPreferences: \{ offscreen: true/);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /key: 'CalibrateImage', value: readyCalibrateImage\(false\) \?\? '' \}/);
  assert.match(front, /key: 'CalibratedImage', value: readyCalibrateImage\(true\) \?\? '' \}/);
  assert.match(front, /title: done \? t\('Borne calée'\) : t\('Caler la borne'\),/);
  const plugin = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  assert.match(plugin, /MSGPI_STRING_VAL_SETTING\(imageCaler, "CalibrateImage"/);
  assert.match(plugin, /MSGPI_STRING_VAL_SETTING\(imageCalee, "CalibratedImage"/);
  assert.match(plugin, /&aideCaler, &imageCaler, &imageCalee, &libelleCale \}/);
  // Sans image (autres manettes), la consigne en texte d'avant ; l'étape se capture au banc de VPX.
  assert.match(plugin, /texte\(ctx, aideCalage, L \/ 2\.f, 160\.f, 44\.f/);
  assert.match(plugin, /capturerCalage\("calage"\);/);
  assert.match(plugin, /capturerCalage\("calee"\);/);
  // Assistant des manettes : le bouton proposé (réglage par défaut) en vert, une fonction de joystick sans dessin.
  assert.match(front, /const drawn = schemaProfile\(w\.profile\) && !f\.axis && proposed !== undefined && SCHEMA_ELEMENTS\.includes\(proposed\);/);
  assert.match(read('app', 'renderer', 'frontend.js'), /\} else if \(s\.phase === 'message' && s\.message\?\.wizard\) \{/);
  assert.match(read('app', 'renderer', 'frontend.css'), /\.wizard-card > \.wizard-head \{/);
  // Légende du menu du casque : deux colonnes, un petit schéma par commande, une case vide sinon.
  assert.match(front, /kind: legendKind\(\), rows:/);
  assert.match(read('app', 'renderer', 'library.js'), /li\.append\(\(row\.controls\.length && schemaManettes\(row\.controls, 'schema-ligne'\)\) \|\| libEl\('div', 'schema-manettes schema-ligne'\), main\);/);
  assert.match(read('app', 'renderer', 'library.css'), /\.lib-section\.kind-controls \.lib-rows \{ display: grid; grid-template-columns: 1fr 1fr;/);
  // Ce que le schéma sait dessiner : des boutons des manettes, jamais une direction de joystick.
  for (const e of SCHEMA_ELEMENTS) assert.ok(isControllerElement(e) && !CONTROLLER_ELEMENTS[e].axis, e);
});

test('la pièce refaite au port du casque, détectée, l’ancrage attendu ou le calage proposé (13 novembre 2026, Air Link)', () => {
  assert.deepEqual([ORIGIN_RESET_CM, ORIGIN_RESET_DEG], [3, 2]);
  // Le relevé de l'essai : tête à 0,6 cm et 1° de l'origine juste après le retour du casque.
  const reset = originResetAtWear('tete-au-port -0.005604 0.006338 -0.019155')!;
  assert.ok(reset.cm < 1 && reset.deg < 1.2, JSON.stringify(reset));
  // Une tête ailleurs (pièce gardée, câble : 2 à 4 cm et 2 à 9° de sa place) : rien.
  assert.equal(originResetAtWear('tete-au-port -0.545156 0.684925 1.278773'), undefined);
  assert.equal(originResetAtWear('tete-au-port 0.04 0.00 0.0'), undefined);
  assert.equal(originResetAtWear('tete-au-port 0.00 0.01 0.05'), undefined);
  assert.equal(shouldOfferCalibration('origine-remise', 'kept'), true);
  const ts = read('app', 'src', 'casque.ts');
  assert.match(ts, /const reset = originResetAtWear\(line\);\s*if \(reset\) \{/);
  assert.match(ts, /this\.opts\.onOriginReset\?\.\(this\.takenOffSeen\);/);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /onOriginReset: \(afterRemoval\) => headsetOriginReset\(afterRemoval\),/);
  // Avec un contour gardé : l'ancrage attendu, puis confirmé par la tête ; sinon le calage proposé.
  assert.match(front, /setTimeout\(\(\) => settlePort\(watch, afterRemoval\), PORT_SETTLE_MS\)/);
  assert.equal(/anchorHeadAtOrigin|jumpHeadCheck|confirmée par la tête/.test(front), false);
  assert.equal(/lastAutoRecalAt|vrAutoRecal|restLearnArmed/.test(front), false);
});

test('ancrage sur la limite du Quest (13 novembre 2026) : la borne reposée par le contour, sans geste', () => {
  assert.deepEqual([ANCHOR_MAX_RESIDUAL_CM, ANCHOR_MIN_CM, ANCHOR_MIN_DEG], [3, 1, 0.5]);
  // Un contour tracé à la main : 406 points irréguliers (aucune symétrie), comme celui de la borne.
  const contour: [number, number][] = [];
  for (let i = 0; i < 406; i++) {
    const a = (i / 406) * 2 * Math.PI;
    const r = 1.8 + 0.35 * Math.sin(3 * a) + 0.2 * Math.cos(5 * a + 1) + 0.1 * Math.sin(11 * a);
    contour.push([0.3 + r * Math.cos(a), -0.2 + r * Math.sin(a)]);
  }
  const tips: [Point3, Point3] = [{ x: 0.55, y: 0.74, z: -0.44 }, { x: 1.13, y: 0.74, z: -0.44 }];
  const calee: CabinetPlace = { ...lockbarPlace(tips[0], tips[1]), head: { x: 0.85, z: -0.1 }, contour };
  // Le saut du jour : la pièce tournée de −97° autour d'un point lointain, la barre déplacée de 155 cm ; relevé au
  // millimètre près (bruit de 3 mm sur chaque point).
  const jump = (deg: number, cx: number, cz: number, dx: number, dz: number) => (p: { x: number; z: number }) => {
    const a = (deg * Math.PI) / 180;
    const x = p.x - cx, z = p.z - cz;
    return { x: Math.cos(a) * x - Math.sin(a) * z + cx + dx, z: Math.sin(a) * x + Math.cos(a) * z + cz + dz };
  };
  const check = (move: (p: { x: number; z: number }) => { x: number; z: number }, wantCm: number, wantDeg: number) => {
    const noise = (i: number) => 0.003 * Math.sin(i * 12.9898);
    const seen = contour.map(([x, z], i) => {
      const m = move({ x, z });
      return [m.x + noise(i), m.z + noise(i + 7)] as [number, number];
    });
    const r = anchorPlace(calee, seen)!;
    assert.equal(r.kind, 'moved');
    if (r.kind !== 'moved') return;
    const real = tips.map((t) => ({ ...t, ...move(t) })) as [Point3, Point3];
    const truth = lockbarPlace(real[0], real[1]);
    const gap = placeGap(truth, r.place);
    assert.ok(gap.cm < 2 && gap.deg < 1, `à ${gap.cm.toFixed(2)} cm et ${gap.deg.toFixed(2)}° de la vraie place`);
    assert.ok(Math.abs(r.cm - wantCm) < 3 && Math.abs(r.deg - wantDeg) < 1, `${r.cm} cm, ${r.deg}°`);
    assert.ok(r.residualCm < 1);
    assert.equal(r.place.lockbarHeight, calee.lockbarHeight);
    assert.equal(r.place.contour!.length, 406);
    const head = move(calee.head!);
    assert.ok(Math.hypot(head.x - r.place.head!.x, head.z - r.place.head!.z) < 0.02);
  };
  // Chaque saut : la pièce tournée autour du milieu de la barre, puis déplacée de la longueur voulue.
  const mid = { x: 0.84, z: -0.44 };
  const around = (deg: number, cm: number, dir: number) => jump(deg, mid.x, mid.z, (cm / 100) * Math.cos(dir), (cm / 100) * Math.sin(dir));
  // Au menu : 155 cm et 97°, le saut du jour, avec une limite restée sur la vraie pièce.
  check(around(-97, 155, 2.4), 155, 97);
  // En partie : contour −48,4°, barre déplacée de 90 cm (mesurée à 89 cm et 49° par le recalage en partie).
  check(around(-48.4, 90, -0.7), 90, 48.4);
  // Rien n'a bougé (le Quest a refait sa pièce limite comprise : le contour ne dit rien) : 'same', le filet décide.
  assert.deepEqual(anchorPlace(calee, contour), { kind: 'same' });
  // Limite redessinée : autre nombre de points, ou une autre forme (résidu).
  assert.equal(anchorPlace(calee, contour.slice(0, 300))!.kind, 'redrawn');
  assert.equal(anchorPlace(calee, contour.map(([x, z], i) => [x * (1 + 0.1 * Math.sin(i)), z] as [number, number]))!.kind, 'redrawn');
  // Pas de contour gardé : pas d'ancrage.
  assert.equal(anchorPlace({ ...calee, contour: undefined }, contour), undefined);
});

test('option « Recalage automatique » retirée (13 novembre 2026, l’ancrage la remplace) : ni réglage, ni relevés, ni repos appris', () => {
  const menu = read('packages', 'core', 'src', 'systemmenu.ts');
  assert.equal(menu.includes('vr-auto-calibrate'), false);
  assert.match(menu, /entries: \['vr', 'vr-calibrate', 'vr-controllers', 'vr-mirror'\]/);
  const front = read('app', 'src', 'frontend.ts');
  assert.equal(/vr-auto-calibrate|autoRecalSample|watchRest|Borne recalée sur les manettes posées/.test(front), false);
  const casque = read('app', 'src', 'casque.ts');
  assert.equal(/watchRest|onRest|'repos /.test(casque), false);
  // Un ancien « rest » dans casque.json est ignoré à la lecture, et oublié à la prochaine écriture.
  assert.match(casque, /const \{ contour: _stale, rest: _gone, \.\.\.kept \}/);
  assert.equal(/\.\.\.\(rest && \{ rest \}\)/.test(casque), false);
  const companion = read('packages', 'casque-vr', 'src', 'casque.cpp');
  assert.equal(/restWatch|"repos/.test(companion), false);
  // Un réglage « autoRecal » déjà enregistré : ignoré, puis effacé à la prochaine écriture d'un réglage de la VR.
  const vr = read('app', 'src', 'vr.ts');
  assert.match(vr, /delete current\.autoRecal;/);
  assert.equal(/readVrAutoRecal|writeVrAutoRecal/.test(vr), false);
  const en = read('packages', 'core', 'src', 'i18n', 'en', 'settings.ts');
  assert.equal(en.includes("'Recalage automatique'"), false);
});

test('saut mesuré dans le flux de la tête (13 novembre 2026, relevés du jour) : la barre prédite à 2 cm et 2°', () => {
  // La tête lue par la sonde juste avant le saut (18:37:17.891) puis par OpenXR juste après (18:37:18.019).
  const yaw = (y: number) => ({ x: -Math.sin(y), z: -Math.cos(y) });
  const [x1, z1, y1] = [1.142, 0.09, -1.667];
  const [x2, z2, y2] = [-0.005604, 0.006338, -0.019155];
  const f1 = yaw(y1), f2 = yaw(y2);
  const angle = Math.atan2(f1.x * f2.z - f1.z * f2.x, f1.x * f2.x + f1.z * f2.z);
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const jump = { angle, tx: x2 - (c * x1 - s * z1), tz: z2 - (s * x1 + c * z1) };
  // La barre calée à 18:36:56, puis recalée à 18:38:09 (155 cm et 97° plus loin dans l'espace de suivi).
  const avant = lockbarPlace({ x: 0.548584, y: 0.9, z: -0.441898 }, { x: 1.127474, y: 0.9, z: -0.436842 });
  const apres = lockbarPlace({ x: -0.460393, y: 0.9, z: 0.641169 }, { x: -0.520985, y: 0.9, z: 0.07632 });
  const saut = placeGap(avant, apres);
  assert.ok(Math.abs(saut.cm - 155) < 1 && Math.abs(saut.deg - 97) < 1, JSON.stringify(saut));
  const reste = placeGap(movePlace(avant, jump), apres);
  assert.ok(reste.cm < 2.5 && reste.deg < 2.5, JSON.stringify(reste));
  const sonde = read('app', 'src', 'sonde-ovr.ts');
  assert.match(sonde, /export function parseOvrJump\(line: string\)/);
  const cpp = read('packages', 'casque-vr', 'src', 'sonde-ovr.cpp');
  assert.match(cpp, /constexpr double JUMP_MAX_DT_S = 0\.06;/);
  assert.match(cpp, /load\(dll, "ovr_TestBoundary", api\.testBoundary\);/);
});


test('repère de la pièce (essai réel du 13 novembre 2026, Air Link) : le contour effectif, une seule correction par saut', () => {
  const contour: [number, number][] = [];
  for (let i = 0; i < 406; i++) {
    const a = (i / 406) * 2 * Math.PI;
    const r = 1.8 + 0.35 * Math.sin(3 * a) + 0.2 * Math.cos(5 * a + 1) + 0.1 * Math.sin(11 * a);
    contour.push([-0.474 + r * Math.cos(a), 0.424 + r * Math.sin(a)]);
  }
  // Les sauts réels de 20:10 à 20:12 (rotation et bond de la tête) : chacun arrive à l'origine même.
  const reels: [number, number][] = [[19.5, 75.088], [148.8, 156.964], [-83.6, 186.319], [-38.7, 41.739], [61.8, 62.245], [-50.7, 70.759], [-67.9, 24.441], [36.3, 11.16]];
  // La place calée et son contour (même repère), puis la vraie barre, qui ne bouge jamais dans la pièce.
  const calee: CabinetPlace = { ...lockbarPlace({ x: -0.3, y: 0.9, z: -0.4 }, { x: 0.3, y: 0.9, z: -0.4 }), contour };
  const frame = new RoomFrame();
  assert.equal(frame.onRead(contour), 'premier');
  let place = calee;
  let vraie = calee;
  for (const [deg, cm] of reels) {
    const angle = (deg * Math.PI) / 180;
    const jump = { angle, tx: (cm / 100) * Math.cos(angle * 3), tz: (cm / 100) * Math.sin(angle * 3), dy: 0 };
    // Le Quest remet l'origine : la vraie barre change de coordonnées ; le contour lu, lui, reste (fait 3).
    vraie = movePlace(vraie, jump);
    assert.equal(frame.onRead(contour), 'inchange');
    // Le saut mesuré : J le garde, la borne est reposée par lui ; la place garde le contour effectif.
    frame.onJump(jump);
    place = { ...movePlace(place, jump), contour: frame.effective() };
    const g = placeGap(place, vraie);
    assert.ok(g.cm < 0.01 && g.deg < 0.01, JSON.stringify(g));
    // L'ancrage sur le contour effectif n'a rien à faire : jamais deux corrections.
    assert.deepEqual(anchorPlace(place, frame.effective()!), { kind: 'same' });
  }
  // Le contour rafraîchi (fait 4 : à la session neuve du compagnon) suit la vraie pièce : J repart, l'ancrage confirme.
  const vrai = moveContour(contour, (() => {
    let j: JumpTransform = { angle: 0, tx: 0, tz: 0, dy: 0 };
    for (const [deg, cm] of reels) {
      const angle = (deg * Math.PI) / 180;
      j = composeJumps(j, { angle, tx: (cm / 100) * Math.cos(angle * 3), tz: (cm / 100) * Math.sin(angle * 3), dy: 0 });
    }
    return j;
  })());
  assert.equal(frame.onRead(vrai), 'rafraichi');
  assert.equal(frame.pending().count, 0);
  assert.deepEqual(anchorPlace(place, frame.effective()!), { kind: 'same' });
  // Défaut d'essai.13 (20:10:13) : une place écrite dans le nouveau repère avec le contour périmé, reposée à tort
  // au rafraîchissement suivant. Avec le contour effectif, elle garde un contour de son repère : rien à tort.
  const f2 = new RoomFrame();
  f2.onRead(contour);
  const enPartie = { angle: (-25.4 * Math.PI) / 180, tx: 0.3, tz: -0.34, dy: 0 };
  f2.onJump(enPartie);
  const recaleeEnPartie: CabinetPlace = { ...movePlace(calee, enPartie), contour: f2.effective() };
  f2.onRead(moveContour(contour, enPartie));
  assert.deepEqual(anchorPlace(recaleeEnPartie, f2.effective()!), { kind: 'same' });
  // Sans J (essai.13), la même place gardait le contour périmé : le rafraîchissement la reposait encore.
  assert.equal(anchorPlace({ ...recaleeEnPartie, contour }, moveContour(contour, enPartie))!.kind, 'moved');
  // Le saut inverse, et deux contours identiques à 2 mm près.
  const back = composeJumps(enPartie, inverseJump(enPartie));
  assert.ok(Math.abs(back.angle) < 1e-12 && Math.hypot(back.tx, back.tz) < 1e-12);
  assert.equal(sameContour(contour, contour.map(([x, z]) => [x + 0.001, z] as [number, number])), true);
  assert.equal(sameContour(contour, contour.map(([x, z]) => [x + 0.01, z] as [number, number])), false);
  // Le frontend : le contour effectif gardé avec chaque place, le saut appliqué tout de suite, le port dit lequel.
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /contour: \(\) => roomFrame\.effective\(\),/);
  assert.match(front, /function headsetJump\(jump: OvrJump\): void \{\s*roomFrame\.onJump\(jump\);/);
  assert.match(front, /const next = movePlace\(place, jump\);/);
  assert.match(front, /const kind = roomFrame\.onRead\(points\);/);
  assert.match(front, /écart entre le saut et le contour/);
  assert.match(front, /ni saut mesuré ni contour rafraîchi/);
  assert.match(front, /headset\.restart\(\);/);
  assert.match(front, /undoOrigin: true,/);
  // La sonde : la signature de la remise d'origine seule, et les essais a), b), c).
  const cpp = read('packages', 'casque-vr', 'src', 'sonde-ovr.cpp');
  assert.match(cpp, /raison=arrivee-hors-origine/);
  assert.match(cpp, /raison=tete-inclinee/);
  assert.match(cpp, /constexpr float JUMP_ORIGIN_M = 0\.02f;/);
  assert.match(cpp, /api\.specifyOrigin\(session, p\)/);
  assert.match(cpp, /recentrer=/);
  assert.match(cpp, /ovr contour-apres-session-neuve change=/);
});
