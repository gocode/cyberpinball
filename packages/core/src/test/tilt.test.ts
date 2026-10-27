import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BUTTONS, gameKeys, joystickCode } from '../buttons';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import type { Cabinet, CabinetAnalog, CabinetButtons, CabinetTilt } from '../model';
import { planVpxSync } from '../sync';
import {
  clampThreshold,
  isTiltKey,
  plumbFromIni,
  setPlumbShape,
  plumbOptionsFromIni,
  plumbView,
  proposedTilt,
  sensorValue,
  startPlumb,
  stepPlumb,
  tiltFindings,
  tiltFromIni,
  tiltLines,
  tiltModes,
  VPX_STILL_TABLE,
  vpxTiltSettings,
} from '../tilt';
import { analogFromIni, clampNudgeGain, nudgeFloor, vpxAnalogSettings } from '../plunger';
import { cabinetChanges, stepCabinet, wizardStepInfo } from '../wizardsteps';
import { vpxOwnedKeys, isOwned } from '../vpx-settings';
import { devPcDisplays, emptyCabinet } from './fixtures';

const PINSCAPE = 'SDLJoy_03000000fa190000ed00000000000000_1';
const BOB = joystickCode(PINSCAPE, 9);
const NUDGE: CabinetAnalog = { nudge: { device: PINSCAPE, x: 0, y: 1, gain: 2 } };

function cabinetWith(fields: Partial<Pick<Cabinet, 'buttons' | 'analog' | 'tilt'>> = {}): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint };
  return { ...cabinet, ...fields };
}

const player = (ini: string, key: string) => IniDocument.parse(ini).get('Player', key);
const VPX_FIRST_RUN = '[Player]\r\nSimulatedPlumb = \r\nPlumbThresholdAngle = \r\nPlumbDamping = \r\n[Input]\r\nDevices = Key\r\n';

test('clés [Player] de chaque cas : balancier de la borne, balancier simulé, pas de tilt', () => {
  // Balancier de la borne : le balancier simulé de VPX éteint (deux balanciers compteraient deux fois).
  assert.deepEqual(vpxTiltSettings({ mode: 'bob', threshold: 1 }).map((s) => `${s.section}.${s.key}=${s.value}`), ['Player.SimulatedPlumb=0']);
  // Balancier simulé : allumé, avec l'angle du contact (degrés, comme le menu de VPX).
  assert.deepEqual(vpxTiltSettings({ mode: 'simulated', threshold: 0.75 }).map((s) => `${s.section}.${s.key}=${s.value}`), ['Player.SimulatedPlumb=1', 'Player.PlumbThresholdAngle=0.75']);
  assert.deepEqual(vpxTiltSettings({ mode: 'none', threshold: 1 }).map((s) => `${s.key}=${s.value}`), ['SimulatedPlumb=0']);
  // Angle hors de ce que VPX accepte (0,15 à 4) : ramené dans ses bornes.
  assert.equal(vpxTiltSettings({ mode: 'simulated', threshold: 9 })[1]!.value, '4');
  assert.equal(vpxTiltSettings({ mode: 'simulated', threshold: 0.01 })[1]!.value, '0.15');
  assert.equal(clampThreshold(Number.NaN), 1);
  // L'amortissement n'est jamais écrit : il se règle en partie.
  for (const id of ['Player.SimulatedPlumb', 'Player.PlumbThresholdAngle']) assert.ok(isTiltKey(id), id);
  assert.ok(!isTiltKey('Player.PlumbDamping'));
  assert.ok(wizardStepInfo('tilt').owns('Player.SimulatedPlumb'));
});

test('table immobile à l’écran : NudgeStrength à 0 à chaque synchronisation, tilt réglé ou non', () => {
  assert.deepEqual(VPX_STILL_TABLE.map((s) => `${s.section}.${s.key}=${s.value}`), ['Player.NudgeStrength=0']);
  // Borne neuve (étape « Tilt » jamais faite) et borne réglée : VPX à 1 par défaut, 0 écrit, en mémoire.
  for (const cabinet of [cabinetWith(), cabinetWith({ analog: NUDGE, tilt: { mode: 'simulated', threshold: 1 } })]) {
    const plan = planVpxSync(cabinet, devPcDisplays(), '[Player]\r\nNudgeStrength = 1\r\n');
    assert.equal(player(plan.nextIni!, 'NudgeStrength'), '0');
    assert.equal(plan.memory['Player.NudgeStrength'], '0');
  }
  // Clé gérée, montrée sans modification possible, même sans étape « Tilt ».
  assert.ok(isOwned(vpxOwnedKeys({ displayIdFormat: 'name', enabledPlugins: [] }), 'Player', 'NudgeStrength'));
  assert.ok(wizardStepInfo('tilt').owns('Player.NudgeStrength'));
  // Remise à la main dans VPX après coup : signalée, pas écrasée.
  const handSet = '[Player]\r\nNudgeStrength = 0.5\r\n';
  const again = planVpxSync(cabinetWith(), devPcDisplays(), handSet, undefined, { memory: { 'Player.NudgeStrength': '0' } });
  assert.equal(player(again.nextIni ?? handSet, 'NudgeStrength'), '0.5');
  assert.deepEqual(again.manualEdits.map((e) => `${e.section}.${e.key}`), ['Player.NudgeStrength']);
});

test('ce que VPX fait aujourd’hui : valeurs de VPinballX.ini, sinon celles de VPX (balancier simulé allumé, 1°)', () => {
  assert.deepEqual(plumbFromIni(VPX_FIRST_RUN), { simulated: true, threshold: 1, damping: 1 });
  assert.deepEqual(plumbFromIni('[Player]\r\nSimulatedPlumb = 0\r\nPlumbThresholdAngle = 2.5\r\nPlumbDamping = 0.5\r\n'), { simulated: false, threshold: 2.5, damping: 0.5 });
  // Valeur illisible : celle de VPX (LayeredINIPropertyStore ignore une valeur qu'il ne sait pas lire).
  assert.equal(plumbFromIni('[Player]\r\nPlumbThresholdAngle = beaucoup\r\n').threshold, 1);
  assert.deepEqual(tiltFromIni(VPX_FIRST_RUN, undefined), { mode: 'simulated', threshold: 1 });
  assert.deepEqual(tiltFromIni('[Player]\r\nSimulatedPlumb = 0\r\n', { ...DEFAULT_BUTTONS, tilt: BOB }), { mode: 'bob', threshold: 1 });
  assert.deepEqual(tiltFromIni('[Player]\r\nSimulatedPlumb = 0\r\n', {}), { mode: 'none', threshold: 1 });
});

test('proposition de l’étape : un balancier relevé l’emporte sur le balancier simulé', () => {
  assert.deepEqual(proposedTilt(VPX_FIRST_RUN, { ...DEFAULT_BUTTONS, tilt: BOB }), { mode: 'bob', threshold: 1 });
  // Sans balancier relevé (la touche T par défaut des encodeurs n'est pas un relevé) : ce que VPX fait.
  assert.deepEqual(proposedTilt(VPX_FIRST_RUN, undefined), { mode: 'simulated', threshold: 1 });
  assert.deepEqual(tiltModes({ tilt: BOB }), ['bob', 'simulated']);
  assert.deepEqual(tiltModes(undefined), ['simulated', 'none']);
  assert.deepEqual(tiltModes({ ...DEFAULT_BUTTONS, tilt: undefined }), ['simulated', 'none']);
});

test('synchronisation : écrit après l’étape « Tilt », puis rien à refaire ; un réglage changé dans VPX est signalé, pas écrasé', () => {
  const tilt: CabinetTilt = { mode: 'simulated', threshold: 0.8 };
  const plan = planVpxSync(cabinetWith({ analog: NUDGE, tilt }), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(player(plan.nextIni!, 'SimulatedPlumb'), '1');
  assert.equal(player(plan.nextIni!, 'PlumbThresholdAngle'), '0.8');
  assert.equal(player(plan.nextIni!, 'PlumbDamping'), '', 'l’amortissement reste celui de VPX');
  const again = planVpxSync(cabinetWith({ analog: NUDGE, tilt }), devPcDisplays(), plan.nextIni!, undefined, { memory: plan.memory });
  assert.deepEqual(again.changes, []);
  // VPX réenregistre 0.8 à sa façon : pas une modification.
  const rewritten = plan.nextIni!.replace('PlumbThresholdAngle = 0.8', 'PlumbThresholdAngle = 0.800000');
  assert.deepEqual(planVpxSync(cabinetWith({ analog: NUDGE, tilt }), devPcDisplays(), rewritten, undefined, { memory: plan.memory }).manualEdits, []);
  // Réglé ensuite en partie (F12 > Nudge Settings) : gardé et signalé.
  const edited = plan.nextIni!.replace('PlumbThresholdAngle = 0.8', 'PlumbThresholdAngle = 1.5');
  const manual = planVpxSync(cabinetWith({ analog: NUDGE, tilt }), devPcDisplays(), edited, undefined, { memory: plan.memory });
  assert.deepEqual(manual.manualEdits.map((e) => e.key), ['PlumbThresholdAngle']);
  assert.equal(player(manual.nextIni ?? edited, 'PlumbThresholdAngle'), '1.5');
});

test('migration douce : sans étape « Tilt », [Player] reste tel quel ; le balancier relevé change seulement Mapping.Tilt', () => {
  const ini = '[Player]\r\nSimulatedPlumb = 1\r\nPlumbThresholdAngle = 2\r\n[Input]\r\nDevices = Key\r\n';
  const plan = planVpxSync(cabinetWith({ analog: NUDGE }), devPcDisplays(), ini);
  assert.ok(!plan.changes.some((c) => c.section === 'Player' && /Plumb/.test(c.key)));
  // Le balancier sur une entrée du Pinscape : Mapping.Tilt, la touche T de VPX gardée à côté.
  const withBob = planVpxSync(cabinetWith({ buttons: { ...DEFAULT_BUTTONS, tilt: BOB } }), devPcDisplays(), ini);
  assert.equal(IniDocument.parse(withBob.nextIni!).get('Input', 'Mapping.Tilt'), `${BOB} | Key;23`);
  assert.ok(!withBob.changes.some((c) => c.section === 'Player' && /Plumb/.test(c.key)));
});

test('slam tilt : bouton facultatif, Mapping.SlamTilt ; sans lui, la touche de VPX (Origine)', () => {
  const slam = joystickCode(PINSCAPE, 11);
  const plan = planVpxSync(cabinetWith({ buttons: { ...DEFAULT_BUTTONS, slamTilt: slam } }), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(IniDocument.parse(plan.nextIni!).get('Input', 'Mapping.SlamTilt'), `${slam} | Key;74`);
  const without = planVpxSync(cabinetWith({ buttons: { ...DEFAULT_BUTTONS, slamTilt: undefined } }), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(IniDocument.parse(without.nextIni!).get('Input', 'Mapping.SlamTilt'), 'Key;74');
  // Un slam tilt affecté dans le menu de VPX avant le relevé reste à côté.
  const kept = planVpxSync(cabinetWith({ buttons: { ...DEFAULT_BUTTONS, slamTilt: undefined } }), devPcDisplays(), '[Input]\r\nMapping.SlamTilt = ' + slam + '\r\n');
  assert.equal(IniDocument.parse(kept.nextIni!).get('Input', 'Mapping.SlamTilt'), `Key;74 | ${slam}`);
});

test('réglages incohérents signalés : deux balanciers, balancier absent, rien pour le faire bouger', () => {
  const messages = (fields: Parameters<typeof cabinetWith>[0], ini = VPX_FIRST_RUN) => tiltFindings(cabinetWith(fields), ini).map((f) => `${f.severity}: ${f.message}`);
  // Balancier relevé, étape « Tilt » jamais faite, balancier simulé allumé (valeur par défaut de VPX).
  assert.match(messages({ buttons: { ...DEFAULT_BUTTONS, tilt: BOB }, analog: NUDGE }).join('\n'), /^warning: Tilt : le balancier de la borne \(Bouton 10 du joystick\) et celui que VPX simule/m);
  // Le même, une fois l'étape faite : plus rien.
  assert.deepEqual(messages({ buttons: { ...DEFAULT_BUTTONS, tilt: BOB }, analog: NUDGE, tilt: { mode: 'bob', threshold: 1 } }, '[Player]\r\nSimulatedPlumb = 0\r\n'), []);
  // Balancier de la borne choisi, puis retiré à l'étape « Boutons ».
  assert.match(messages({ buttons: { ...DEFAULT_BUTTONS, tilt: undefined }, tilt: { mode: 'bob', threshold: 1 } }, '[Player]\r\nSimulatedPlumb = 0\r\n').join('\n'), /aucun bouton « Balancier de tilt » relevé/);
  // Balancier simulé sans accéléromètre ni bouton de tremblement.
  const still = { ...DEFAULT_BUTTONS, nudgeLeft: undefined, nudgeRight: undefined, nudgeCenter: undefined };
  assert.match(messages({ buttons: still, tilt: { mode: 'simulated', threshold: 1 } }).join('\n'), /^info: Tilt : balancier simulé, mais ni accéléromètre ni bouton de tremblement/m);
  assert.deepEqual(messages({ buttons: DEFAULT_BUTTONS, tilt: { mode: 'simulated', threshold: 1 } }), [], 'les boutons de tremblement font bouger le balancier simulé');
  // Balancier simulé choisi, éteint à la main dans VPX (clé gardée) : signalé.
  assert.match(messages({ analog: NUDGE, tilt: { mode: 'simulated', threshold: 1 } }, '[Player]\r\nSimulatedPlumb = 0\r\n').join('\n'), /éteint dans VPinballX\.ini/);
  // Et par la synchronisation, comme les autres constats.
  const plan = planVpxSync(cabinetWith({ buttons: { ...DEFAULT_BUTTONS, tilt: BOB }, analog: NUDGE }), devPcDisplays(), VPX_FIRST_RUN);
  assert.ok(plan.findings.some((f) => f.severity === 'warning' && f.message.startsWith('Tilt : le balancier de la borne')));
});

test('force des secousses : échelle des axes de l’accéléromètre, reprise de VPX, accéléromètre trop faible signalé', () => {
  // Écrite dans Mapping.Nudge0.X et .Y ; l'axe inversé dans VPX le reste.
  const settings = (analog: CabinetAnalog) => Object.fromEntries(vpxAnalogSettings(analog).map((s) => [s.key, s.value]));
  assert.equal(settings(NUDGE)['Mapping.Nudge0.X'], `${PINSCAPE};512;A;0.000000;2.000000;1.000000`);
  assert.equal(settings({ nudge: { device: PINSCAPE, x: 0, y: 1, gain: 3, invertY: true } })['Mapping.Nudge0.Y'], `${PINSCAPE};513;A;0.000000;-3.000000;1.000000`);
  // Sans force (étape « Lanceur » d'avant) : l'échelle 1 de VPX.
  assert.equal(settings({ nudge: { device: PINSCAPE, x: 0, y: 1 } })['Mapping.Nudge0.X'], `${PINSCAPE};512;A;0.000000;1.000000;1.000000`);
  const fromVpx = (x: string, y: string) => analogFromIni(['[Input]', 'NudgeSensorCount = 1', 'Mapping.Nudge0.Type = 0', `Mapping.Nudge0.X = ${PINSCAPE};512;A;0.000000;${x};1.000000`, `Mapping.Nudge0.Y = ${PINSCAPE};513;A;0.000000;${y};1.000000`, ''].join('\r\n')).nudge;
  assert.deepEqual(fromVpx('1.000000', '1.000000'), { device: PINSCAPE, x: 0, y: 1 });
  assert.deepEqual(fromVpx('2.500000', '-2.500000'), { device: PINSCAPE, x: 0, y: 1, gain: 2.5, invertY: true });
  // Bornes et pas du réglage ; seuil de VPX : 1 m/s² d'intention, une valeur de 1 vaut g/2.
  assert.equal(clampNudgeGain(9), 6);
  assert.equal(clampNudgeGain(1.1), 1);
  assert.equal(Math.round(nudgeFloor(1) * 100), 20);
  assert.equal(Math.round(nudgeFloor(2) * 100), 10);
  assert.equal(Math.round(nudgeFloor(2, 2) * 100), 5);
  // Accéléromètre à la force de VPX : la vraie borne d'octobre 2026, signalée ; à ×2, plus rien.
  const weak = tiltFindings(cabinetWith({ analog: { nudge: { device: PINSCAPE, x: 0, y: 1 } } }), VPX_FIRST_RUN);
  assert.match(weak.map((f) => `${f.severity}: ${f.message}`).join('\n'), /^warning: Secousses : accéléromètre lu à la force ×1,00 ; .* sous 20 % de l’échelle/m);
  assert.deepEqual(tiltFindings(cabinetWith({ analog: NUDGE }), VPX_FIRST_RUN), []);
  // Étape « Tilt » : elle reprend en main l'échelle des axes, pas leur choix ni le lanceur.
  const tilt = wizardStepInfo('tilt');
  for (const id of ['Input.Mapping.Nudge0.X', 'Input.Mapping.Nudge0.Y', 'Player.PlumbThresholdAngle']) assert.ok(tilt.owns(id), id);
  for (const id of ['Input.Mapping.Nudge0.Type', 'Input.NudgeSensorCount', 'Input.Mapping.Plunger0.Position', 'Input.Mapping.Tilt']) assert.ok(!tilt.owns(id), id);
  assert.ok(wizardStepInfo('lanceur').owns('Input.Mapping.Nudge0.X'));
});

test('force des secousses : la même secousse, ignorée à ×1, fait tilter à ×2 (simulation de VPX)', () => {
  // 0,15 g sur X pendant 40 ms : sous le seuil de VPX à ×1 (20 %), au-dessus à ×2 (10 %).
  const run = (gain: number) => {
    const sim = startPlumb({ threshold: 0.3, x: { deadZone: 0, scale: gain, limit: 1 }, y: { deadZone: 0, scale: gain, limit: 1 } });
    let peak = 0;
    for (const [x, ms] of [[0.15, 40], [0, 1500]] as const) {
      for (let t = 0; t < ms; t += 8) {
        stepPlumb(sim, { x, y: 0 }, 8);
        peak = Math.max(peak, sim.peak);
      }
    }
    return { peak, tilts: sim.tilts };
  };
  assert.deepEqual(run(1), { peak: 0, tilts: 0 });
  assert.ok(run(2).peak > 0 || run(2).tilts > 0, JSON.stringify(run(2)));
  // Réglée pendant l'essai : la simulation suit, comme VPX lira les axes.
  const sim = startPlumb({ threshold: 1 });
  setPlumbShape(sim, { deadZone: 0, scale: 3, limit: 1 }, { deadZone: 0, scale: -3, limit: 1 });
  assert.equal(sim.options.y!.scale, -3);
});

test('étape « Tilt » refaite seule : son champ et ses clés seulement', () => {
  const before = cabinetWith({ buttons: { ...DEFAULT_BUTTONS, tilt: BOB }, analog: NUDGE });
  const built = cabinetWith({ buttons: { ...DEFAULT_BUTTONS }, tilt: { mode: 'bob', threshold: 1 } });
  const next = stepCabinet({ ...before, vpxManual: ['Player.SimulatedPlumb', 'Input.Mapping.Tilt'] }, built, wizardStepInfo('tilt'));
  assert.deepEqual(next.tilt, { mode: 'bob', threshold: 1 });
  assert.equal(next.buttons!.tilt, BOB, 'boutons gardés tels qu’enregistrés');
  assert.deepEqual(next.vpxManual, ['Input.Mapping.Tilt']);
  // « Quitter sans enregistrer » dit ce qui serait perdu.
  assert.deepEqual(cabinetChanges(before, { tilt: { mode: 'simulated', threshold: 0.5 } }), ['Tilt : balancier simulé par VPX, contact à 0,50°', 'Slam tilt : Origine']);
  // Réglages de VPX : clés en lecture seule une fois l'étape faite.
  const profile = { displayIdFormat: 'name' as const, enabledPlugins: [] };
  assert.ok(isOwned(vpxOwnedKeys(profile, [], false, { tilt: true }), 'Player', 'PlumbThresholdAngle'));
  assert.ok(!isOwned(vpxOwnedKeys(profile), 'Player', 'SimulatedPlumb'));
  assert.ok(!isOwned(vpxOwnedKeys(profile, [], false, { tilt: true }), 'Player', 'PlumbDamping'));
});

test('récapitulatif et aide-mémoire de la partie', () => {
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, tilt: BOB, slamTilt: undefined };
  assert.deepEqual(tiltLines({ mode: 'bob', threshold: 1 }, buttons), ['Tilt : balancier de la borne (Bouton 10 du joystick), balancier simulé de VPX éteint']);
  assert.deepEqual(tiltLines({ mode: 'none', threshold: 1 }, { ...buttons, tilt: undefined }), ['Tilt : aucun balancier, ni réel ni simulé']);
  const row = (rows: [string, string][], title: string) => rows.find(([t]) => t === title)?.[1];
  // Une seule ligne « Tilt » : l'aide-mémoire remplit déjà l'écran.
  assert.equal(row(gameKeys(buttons, { mode: 'bob', threshold: 1 }), 'Tilt'), 'Bouton 10 du joystick');
  assert.equal(row(gameKeys(undefined, { mode: 'simulated', threshold: 1 }), 'Tilt'), 'T · secousse trop forte · slam tilt Origine');
  assert.equal(row(gameKeys(undefined), 'Tilt'), 'T · slam tilt Origine');
  assert.equal(row(gameKeys({ ...buttons, tilt: undefined }, { mode: 'simulated', threshold: 1 }), 'Tilt'), 'secousse trop forte');
  assert.equal(row(gameKeys({ ...buttons, tilt: undefined, slamTilt: undefined }), 'Tilt'), undefined);
  assert.ok(!gameKeys(undefined).some(([title]) => title === 'Slam tilt'));
});

// ---------------------------------------------------------------------------
// Balancier simulé : la même chaîne que VPX (GamepadNudge, CabinetPhysics, PlumbHandler)

/** Secousses : [x, y, durée en ms], lues toutes les 8 ms comme les rapports USB d'un Pinscape. */
function shake(threshold: number, moves: [number, number, number][]) {
  const sim = startPlumb({ threshold });
  let peak = 0;
  for (const [x, y, ms] of moves) {
    for (let t = 0; t < ms; t += 8) {
      stepPlumb(sim, { x, y }, Math.min(8, ms - t));
      peak = Math.max(peak, sim.peak);
    }
  }
  return { ...plumbView(sim), peak };
}

const NUDGE_THEN_REST = (x: number, y = 0): [number, number, number][] => [
  [x, y, 40],
  [0, 0, 1500],
];

test('balancier simulé : immobile au repos, une secousse sous le seuil de VPX ne compte pas', () => {
  assert.deepEqual(shake(1, [[0, 0, 2000]]), { x: 0, y: 0, tilted: false, tilts: 0, peak: 0, accel: 0 });
  // 0,1 de l'axe : 0,49 m/s², sous le 1 m/s² où VPX voit une intention de secousse.
  assert.equal(shake(1, NUDGE_THEN_REST(0.1)).peak, 0);
  // Vers l'arrière (axe Y positif) : VPX ne garde que les poussées vers l'avant.
  assert.equal(shake(1, NUDGE_THEN_REST(0, 0.9)).peak, 0);
});

test('balancier simulé : plus l’angle est petit, plus le tilt est facile ; chaque contact est un appui sur Tilt', () => {
  const strong = NUDGE_THEN_REST(1);
  const at = (threshold: number) => shake(threshold, strong);
  // Au réglage de VPX (1°), une secousse franche approche le contact sans l'atteindre.
  assert.equal(at(1).tilts, 0);
  assert.ok(at(1).peak > 0.4 && at(1).peak < 0.7, String(at(1).peak));
  // À 0,5°, la même secousse touche l'anneau, et rebondit dessus : plusieurs appuis, comme dans VPX.
  assert.ok(at(0.5).tilts >= 1);
  // L'écart au contact est proportionnel à l'angle choisi.
  assert.ok(Math.abs(at(2).peak * 2 - at(1).peak) < 0.02);
  // Vers l'avant aussi.
  assert.ok(shake(0.5, NUDGE_THEN_REST(0, -0.6)).tilts >= 1);
});

test('mise en forme des axes comme VPX : zone morte, limite, échelle, force du capteur', () => {
  assert.equal(sensorValue(0.05, { deadZone: 0.1, scale: 1, limit: 1 }), 0);
  assert.ok(Math.abs(sensorValue(0.55, { deadZone: 0.1, scale: 1, limit: 1 }) - 0.5) < 1e-9);
  assert.equal(sensorValue(0.9, { deadZone: 0, scale: -1, limit: 0.5 }), -0.5);
  const ini = ['[Player]', 'PlumbDamping = 0.5', '[Input]', 'Mapping.Nudge0.Strength = 2', `Mapping.Nudge0.X = ${PINSCAPE};512;A;0.000000;-1.000000;1.000000`, ''].join('\r\n');
  const options = plumbOptionsFromIni(ini, 1);
  assert.equal(options.damping, 0.5);
  assert.equal(options.strength, 2);
  assert.deepEqual(options.x, { deadZone: 0, scale: -1, limit: 1 });
  assert.equal(options.y, undefined);
  // Force doublée : la même secousse va deux fois plus loin.
  const weak = startPlumb({ threshold: 4 });
  const strong = startPlumb({ threshold: 4, strength: 2 });
  for (const s of [weak, strong]) {
    stepPlumb(s, { x: 0.5, y: 0 }, 40);
    stepPlumb(s, { x: 0, y: 0 }, 200);
  }
  assert.ok(Math.abs(strong.peak - 2 * weak.peak) < 0.01, `${strong.peak} / ${weak.peak}`);
});
