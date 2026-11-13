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
  isControllerElement,
  TRIGGERS_HINT_COMBO,
  TRIGGERS_HINT_S,
  ovrRuntimeDll,
  AUTO_RECAL_GAP_S,
  AUTO_RECAL_MATCH_CM,
  AUTO_RECAL_MIN_CM,
  AUTO_RECAL_MIN_DEG,
  AUTO_RECAL_STILL_DEG,
  AUTO_RECAL_STILL_MM,
  AUTO_RECAL_STILL_S,
  autoRecalibratedPlace,
  AUTO_RECAL_LEARN_CM,
  AUTO_RECAL_LEARN_HEIGHT_CM,
  restGate,
  restReference,
  RestWatch,
  type RestSample,
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
  assert.match(front, /onPutBackOn: \(\) => \{\s*restLearnArmed = false;\s*checkStaleCalibration\(\);\s*headsetPutBackOn\(\);\s*\},/);
  assert.match(front, /if \(!place \|\| headsetSetting\(\) === 'bureau' \|\| headset\?\.roomKeeping !== 'recentred'\) return;/);
  // L'écart prises-bouts survit à la relecture de casque.json.
  assert.match(ts, /\.\.\.\(grip && \{ grip \}\), \.\.\.\(p\.free === true && \{ free: true \}\), \.\.\.\(boundary && \{ boundary \}\), \.\.\.\(head && \{ head \}\), \.\.\.\(rest && \{ rest \}\) \};/);
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
  assert.match(front, /onRoom: \(\) => \{\s*restLearnArmed = false;\s*checkStaleCalibration\(\);\s*\},/);
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

test('recalage automatique (13 novembre 2026) : position de repos apprise après un calage à la main, sans hauteur absolue ; jamais en main', () => {
  // Seuils figés.
  assert.deepEqual(
    [AUTO_RECAL_STILL_S, AUTO_RECAL_STILL_MM, AUTO_RECAL_STILL_DEG, AUTO_RECAL_MATCH_CM, AUTO_RECAL_LEARN_CM, AUTO_RECAL_LEARN_HEIGHT_CM, AUTO_RECAL_GAP_S, AUTO_RECAL_MIN_CM, AUTO_RECAL_MIN_DEG],
    [1, 4, 1.5, 2.5, 8, 10, 0.3, 1, 1],
  );
  // Calée à la main : bouts tenus sur les coins, barre de 60 cm à 90 cm.
  const calee: CabinetPlace = { ...lockbarPlace({ x: -0.3, y: 0.9, z: -0.4 }, { x: 0.3, y: 0.9, z: -0.4 }), head: { x: 0, z: 0.1 } };
  // Posées, elles reposent 10 cm plus près du joueur, 3 cm plus haut, écartées de 56 cm (essai : 10 cm d'écart à tort).
  const repos: [Point3, Point3] = [{ x: -0.28, y: 0.93, z: -0.3 }, { x: 0.28, y: 0.93, z: -0.3 }];
  const flat = { x: 0, y: 0, z: 0, w: 1 };
  const tilt = (deg: number) => ({ x: Math.sin((deg * Math.PI) / 360), y: 0, z: 0, w: Math.cos((deg * Math.PI) / 360) });
  const sample = (t: number, tips: readonly [Point3, Point3], dx = 0, rot = flat): RestSample => ({ t, tips: [{ ...tips[0], x: tips[0].x + dx }, { ...tips[1], x: tips[1].x + dx }], rot: [rot, rot] });
  const seconds = (from: number, to: number, f: (t: number, i: number) => RestSample | undefined) => {
    const out: (RestSample | undefined)[] = [];
    for (let i = 0, t = from; t <= to + 1e-9; i++, t = from + i * 0.1) out.push(f(t, i));
    return out;
  };
  const run = (samples: (RestSample | undefined)[], place: CabinetPlace, learning = false) => {
    const w = new RestWatch();
    return samples.map((s) => w.push(s, (tips) => restGate(tips, place, learning))).filter(Boolean).length;
  };
  // Sans position apprise et hors apprentissage : jamais (plus de recalage supposé sur les bouts).
  assert.equal(run(seconds(0, 3, (t) => sample(t, repos)), calee), 0);
  // Apprentissage (juste après le calage à la main) : posées immobiles 1 s, une fois ; la position de repos apprise.
  assert.equal(run(seconds(0, 3, (t, i) => sample(t, repos, (i % 2) * 0.001)), calee, true), 1);
  const rest = restReference(calee, repos);
  assert.ok(Math.abs(rest.width - 0.56) < 1e-9 && Math.abs(rest.dy + 0.03) < 1e-9 && Math.abs(Math.hypot(rest.x, rest.z) - 0.1) < 1e-6, JSON.stringify(rest));
  const apprise: CabinetPlace = { ...calee, rest };
  // La même pose, la pièce inchangée : la place retrouvée exactement (plus de 10 cm à tort).
  const meme = autoRecalibratedPlace({ ...apprise, rest }, repos);
  assert.ok(Math.abs(meme.x - calee.x) < 1e-9 && Math.abs(meme.z - calee.z) < 1e-9 && Math.abs(meme.yaw - calee.yaw) < 1e-9 && Math.abs(meme.lockbarHeight! - 0.9) < 1e-9);
  assert.ok(roomFromRecalibration(calee, meme).cm < AUTO_RECAL_MIN_CM);
  // La pièce de Link refaite : tournée de 29°, déplacée, et le sol monté de 33 cm. Les manettes posées au même
  // endroit réel : la vraie barre retrouvée, hauteur comprise (pas de hauteur absolue dans le déclenchement).
  const a = (29 * Math.PI) / 180;
  const move = (p: Point3) => ({ x: p.x * Math.cos(a) + p.z * Math.sin(a) + 0.4, y: p.y - 0.33, z: -p.x * Math.sin(a) + p.z * Math.cos(a) - 0.2 });
  const vues: [Point3, Point3] = [move(repos[0]), move(repos[1])];
  assert.equal(run(seconds(0, 3, (t) => sample(t, vues)), apprise), 1);
  const next = autoRecalibratedPlace({ ...apprise, rest }, vues);
  const truth = lockbarPlace(move({ x: -0.3, y: 0.9, z: -0.4 }), move({ x: 0.3, y: 0.9, z: -0.4 }));
  assert.ok(Math.abs(next.x - truth.x) < 1e-9 && Math.abs(next.z - truth.z) < 1e-9 && Math.abs(next.yaw - truth.yaw) < 1e-9 && Math.abs(next.lockbarHeight! - 0.57) < 1e-9, JSON.stringify(next));
  assert.equal(next.lockbarWidth, calee.lockbarWidth);
  const head = move({ x: 0, y: 0, z: 0.1 });
  assert.ok(Math.abs(next.head!.x - head.x) < 1e-9 && Math.abs(next.head!.z - head.z) < 1e-9, JSON.stringify(next.head));
  assert.equal(Math.round(roomFromRecalibration(calee, next).deg), 29);
  // En main (5 mm de tremblement, ou 2° de rotation) : jamais. Pas à niveau (3 cm), ou écartées autrement (4 cm) : jamais.
  assert.equal(run(seconds(0, 3, (t, i) => sample(t, vues, (i % 2) * 0.005)), apprise), 0);
  assert.equal(run(seconds(0, 3, (t, i) => sample(t, vues, 0, tilt((i % 2) * 2))), apprise), 0);
  assert.equal(run(seconds(0, 3, (t) => sample(t, [vues[0], { ...vues[1], y: vues[1].y + 0.03 }])), apprise), 0);
  assert.equal(run(seconds(0, 3, (t) => sample(t, [vues[0], { ...vues[1], x: vues[1].x + 0.04 }])), apprise), 0);
  // Une manette plus suivie : réarmé, reposées, un second recalage ; relevés trop espacés : rien.
  assert.equal(run([...seconds(0, 2, (t) => sample(t, vues)), undefined, ...seconds(3, 5, (t) => sample(t, vues))], apprise), 2);
  assert.equal(run([0, 0.5, 1, 1.5].map((t) => sample(t, vues)), apprise), 0);
  // Une borne posée au bureau, ou pas calée : jamais.
  assert.equal(restGate(vues, { ...apprise, free: true }, true), false);
  assert.equal(restGate(vues, undefined, true), false);
  // L'app : réglage éteint par défaut, apprentissage armé par un calage à la main, désarmé quand la pièce a pu bouger.
  const front = read('app', 'src', 'frontend.ts');
  assert.match(read('app', 'src', 'vr.ts'), /\.autoRecal === true;/);
  assert.match(front, /library\.provideSystemItem\('vr-auto-calibrate', \{/);
  assert.match(front, /onRest: \(sample\) => autoRecalSample\(sample\),/);
  assert.match(front, /if \(!vrAutoRecal \|\| !headset \|\| calibration \|\| playing \|\| launch \|\| headsetSetting\(\) === 'bureau'\) return;/);
  assert.match(front, /if \(left && right\) restLearnArmed = true;/);
  assert.match(front, /onPutBackOn: \(\) => \{\s*restLearnArmed = false;/);
  assert.match(front, /onRoom: \(\) => \{\s*restLearnArmed = false;/);
  assert.match(front, /écart corrigé de \$\{Math\.round\(measure\.cm\)\} cm et \$\{Math\.round\(measure\.deg\)\}°/);
  assert.match(front, /headset\.watchRest\(vrAutoRecal\);\s*headset\.watch\(\);/);
  assert.match(read('app', 'src', 'casque.ts'), /\.\.\.\(rest && \{ rest \}\) \};/);
  const companion = read('packages', 'casque-vr', 'src', 'casque.cpp');
  assert.match(companion, /if \(restWatch && controllers && !calibrating && state == XR_SESSION_STATE_FOCUSED/);
});

test('sonde LibOVR (13 novembre 2026) : la DLL du runtime de Meta, lancée avec la VR, au journal, sans rien changer', () => {
  assert.equal(ovrRuntimeDll('C:\\Program Files\\Meta Horizon\\Support\\oculus-runtime\\oculus_openxr_64.json', JSON.stringify({ runtime: { library_path: '.\\LibOVRRT64_1.dll' } })), 'C:\\Program Files\\Meta Horizon\\Support\\oculus-runtime\\LibOVRRT64_1.dll');
  assert.equal(ovrRuntimeDll('C:\\x\\a.json', JSON.stringify({ runtime: { library_path: 'D:\\Meta\\libovrrt64_1.dll' } })), 'D:\\Meta\\libovrrt64_1.dll');
  assert.equal(ovrRuntimeDll('C:\\Steam\\steamxr_win64.json', JSON.stringify({ runtime: { library_path: '..\\bin\\vrclient_x64.dll' } })), undefined);
  assert.equal(ovrRuntimeDll('C:\\x\\a.json', 'pas du json'), undefined);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /ovrProbe\.set\(vrMode === 'auto'\);/);
  assert.match(front, /headset\?\.dispose\(\);\s*ovrProbe\.set\(false\);/);
  const sonde = read('app', 'src', 'sonde-ovr.ts');
  assert.match(sonde, /spawn\(exe, \['--ovr', dll\]/);
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
  const css = read('app', 'renderer', 'frontend.css');
  assert.match(css, /\.schema-vert \{ fill: var\(--signal\); stroke: var\(--signal\);/);
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
