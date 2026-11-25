// Effets LED des tables sans ROM (dof-evenements-script.ts, dof-scene.ts). Essai sur une borne, 25/11/2026 : « l'animation
// à chaque flip, il faut qu'il se passe quelque chose, ça part du bas vers le haut » ; « pas d'animation à
// l'envoi de la bille » ; « plein d'événements pas pris en compte ».

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOF_RARE_EVENTS, classifyDofScript, createDofScene, createLaunchDetector, dofEventClass, dofScenePalette, dofSideOf, dofStripSide, type DofEventKind, type DofSceneStrip } from '../index';

/** Script d'une table originale inventée : les formes d'appel qu'on trouve dans les tables. */
const SCRIPT = [
  'Const dofJackpot = 150',
  'Const DOF_LeftBumper = 107, dofKnock = 120',
  'Sub Table1_KeyDown(ByVal keycode)',
  '\tIf keycode = LeftFlipperKey Then',
  '\t\tLeftFlipper.RotateToEnd',
  '\t\tDOF 101, DOFOn',
  '\tEnd If',
  '\tIf keycode = RightFlipperKey Then RightFlipper.RotateToEnd : DOF 102, DOFOn',
  '\tIf keycode = PlungerKey Then Plunger.PullBack : DOF 130, DOFOn',
  'End Sub',
  'Sub Table1_KeyUp(ByVal keycode)',
  '\tIf keycode = PlungerKey Then',
  '\t\tPlunger.Fire',
  '\t\tDOF 131, DOFPulse',
  '\tEnd If',
  'End Sub',
  'Sub LeftSlingShot_Slingshot : PlaySound SoundFXDOF("fx_slingshot", 103, DOFPulse, DOFContactors) : End Sub',
  'Sub RightSlingShot_Slingshot()',
  '\tPlaySoundAt SoundFXDOF("right_slingshot", 104, DOFPulse, DOFContactors), Sling1',
  'End Sub',
  'Sub Bumper1_Hit : DOF DOF_LeftBumper, DOFPulse : End Sub',
  'Sub Drain_Hit()',
  "\tDOF 140, DOFPulse ' bille perdue : DOF 999, 1 dans un commentaire",
  'End Sub',
  'Sub BallRelease_UnHit : DOF 141, DOFPulse : End Sub',
  'Sub AwardJackpot : DOF dofJackpot, DOFPulse : End Sub',
  'Sub Target3_Hit : DOF 122, DOFPulse : End Sub',
  'Sub sw23_Hit : PlaySound SoundFXDOF("fx_knocker", 123, DOFPulse, DOFKnocker) : End Sub',
  'Sub Spinner1_Spin : DOF 124, DOFPulse : End Sub',
  'Sub Mystery_Hit : DOF 125, DOFPulse : End Sub',
  'Sub StartMultiball : DOF 126, DOFOn : End Sub',
  'Sub CheckTilt : DOF 127, DOFPulse : End Sub',
  'Sub EndOfGame : DOF 128, DOFPulse : End Sub',
  'Sub GiOn : DOF 129, DOFOn : End Sub',
  'Sub kicker1_hit : DOF 132, DOFPulse : End Sub',
  'Sub LeftRamp_Hit : DOF 133, DOFPulse : End Sub',
  'Sub SolAutofire(Enabled) : If Enabled Then DOF 134, DOFPulse : End Sub',
  'Sub StartGame : DOF 135, DOFPulse : End Sub',
  'Sub Flasher1(Enabled) : DOF 136, Enabled : End Sub',
  'Sub ShakerOn : DOF 137, DOFOn : End Sub',
].join('\r\n');

test('Script d’une table sans ROM : rôle et côté de chaque événement DOF', () => {
  const c = classifyDofScript(SCRIPT);
  const expect: Record<number, string> = {
    101: 'flipper/left',
    102: 'flipper/right',
    103: 'sling/left',
    104: 'sling/right',
    107: 'bumper/left',
    130: 'mech/center',
    131: 'launch/center',
    140: 'drain/center',
    141: 'ball-start/center',
    150: 'jackpot/center',
    122: 'target/center',
    123: 'award/center',
    124: 'spinner/center',
    125: 'other/center',
    126: 'multiball/center',
    127: 'tilt/center',
    128: 'game-over/center',
    129: 'gi/center',
    132: 'kicker/center',
    133: 'ramp/left',
    134: 'launch/center',
    135: 'game-start/center',
    136: 'flasher/center',
    137: 'mech/center',
  };
  for (const [n, want] of Object.entries(expect)) {
    const got = c.get(Number(n));
    assert.equal(got && `${got.kind}/${got.side}`, want, `E${n}`);
  }
  assert.equal(c.has(999), false, 'commentaire ignoré');
  assert.equal(c.has(120), false, 'constante jamais appelée');
  // Événement absent du script : numéros communs, sinon « other » (un petit effet quand même).
  assert.deepEqual(dofEventClass(c, 777), { kind: 'other', side: 'center' });
  assert.deepEqual(dofEventClass(undefined, 102), { kind: 'flipper', side: 'right' });
  // Sub DOF de controller.vbs : sa déclaration n'est pas un appel.
  assert.equal(classifyDofScript('Sub DOF(DOFevent, State)\r\n\tController.B2SSetData DOFevent, State\r\nEnd Sub').size, 0);
});

test('Côtés : Left/Right en clair, ou L/R accolé à Flipper, Sling…', () => {
  assert.equal(dofSideOf('SolLFlipper'), 'left');
  assert.equal(dofSideOf('SolRFlipper'), 'right');
  assert.equal(dofSideOf('lsling_hit'), 'left');
  assert.equal(dofSideOf('SlingR'), 'right');
  assert.equal(dofSideOf('Bumper1_Hit'), undefined);
  assert.equal(dofStripSide('PF Left'), 'left');
  assert.equal(dofStripSide('Droite'), 'right');
  assert.equal(dofStripSide('Backboard'), 'center');
});

const strip = (name: string): DofSceneStrip => ({ name, width: 1, height: 20, arrangement: 'TopDownLeftRight' });
const LEFT = strip('PF Left');
const RIGHT = strip('PF Right');
const PALETTE = { primary: [255, 0, 0] as const, secondary: [0, 255, 0] as const, accent: [0, 0, 255] as const };
/** Luminosité de la LED à la hauteur h (0 en bas, 19 en haut) : TopDown, la LED 0 est en haut. */
const at = (frame: Uint8Array, h: number) => {
  const k = 19 - h;
  return frame[k * 3]! + frame[k * 3 + 1]! + frame[k * 3 + 2]!;
};
const total = (frame: Uint8Array) => frame.reduce((s, v) => s + v, 0);

test('Flipper : balayage du bas vers le haut du côté du flipper, dans la couleur de la table, bas allumé tant qu’il est tenu', () => {
  const scene = createDofScene(PALETTE, 1);
  const ambient = total(scene.render(LEFT, 0));
  assert.ok(ambient > 0, 'ambiance douce');
  scene.trigger('flipper', 'left', 1000);
  const early = scene.render(LEFT, 1060);
  assert.ok(at(early, 4) > at(early, 18) + 100, 'le bas d’abord');
  const late = scene.render(LEFT, 1230);
  assert.ok(at(late, 17) > at(early, 17) + 100, 'puis le haut');
  assert.ok(late[(19 - 17) * 3]! > late[(19 - 17) * 3 + 2]!, 'couleur principale (rouge)');
  assert.equal(total(scene.render(RIGHT, 1050)), ambient, 'l’autre côté ne bouge pas');
  assert.ok(at(scene.render(LEFT, 2000), 0) > 50, 'tenu : le bas reste allumé');
  scene.release('flipper', 'left', 2000);
  assert.equal(total(scene.render(LEFT, 2600)), ambient, 'relâché : éteint');
  // Touche et script envoient le même flip : un seul effet.
  scene.trigger('flipper', 'right', 3000);
  scene.release('flipper', 'right', 3010);
  scene.trigger('flipper', 'right', 3040);
  assert.equal(total(scene.render(RIGHT, 3700)), ambient);
});

test('Chaque événement reconnu allume quelque chose ; perte de bille et tilt en rouge ; intensité appliquée', () => {
  const kinds: DofEventKind[] = ['flipper', 'sling', 'bumper', 'launch', 'ball-start', 'drain', 'kicker', 'target', 'spinner', 'ramp', 'rollover', 'award', 'jackpot', 'multiball', 'tilt', 'game-start', 'game-over', 'flasher', 'other'];
  for (const kind of kinds) {
    const scene = createDofScene(PALETTE, 1);
    const ambient = total(scene.render(LEFT, 0));
    scene.trigger(kind, 'center', 0);
    let lit = false;
    for (let t = 10; t < 700 && !lit; t += 10) lit = total(scene.render(LEFT, t)) > ambient + 200;
    assert.ok(lit, `${kind} : rien de visible`);
  }
  const drain = createDofScene({ ...PALETTE, primary: [0, 0, 255] }, 1);
  drain.trigger('drain', 'center', 0);
  const f = drain.render(LEFT, 200);
  assert.ok(f[(19 - 19) * 3]! > f[(19 - 19) * 3 + 2]!, 'rouge');
  const dim = createDofScene(PALETTE, 0.3);
  const full = createDofScene(PALETTE, 1);
  dim.trigger('award', 'center', 0);
  full.trigger('award', 'center', 0);
  assert.ok(total(dim.render(LEFT, 10)) < total(full.render(LEFT, 10)) * 0.4);
  // Lanceur : comète qui monte côté droit.
  const launch = createDofScene(PALETTE, 1);
  const base = total(launch.render(LEFT, 0));
  launch.trigger('launch', 'right', 0);
  assert.ok(at(launch.render(RIGHT, 100), 3) > at(launch.render(RIGHT, 100), 17));
  assert.ok(at(launch.render(RIGHT, 380), 17) > 200);
  assert.equal(total(launch.render(LEFT, 100)), base);
  // GI coupé : plus d'ambiance.
  launch.release('gi', 'center', 2000);
  assert.equal(total(launch.render(LEFT, 3000)), 0);
  // Bande du centre, large : la moitié du côté du flipper.
  const board: DofSceneStrip = { name: 'Matrix', width: 8, height: 4, arrangement: 'LeftRightTopDown' };
  const m = createDofScene(PALETTE, 1);
  m.trigger('flipper', 'left', 0);
  const fr = m.render(board, 30);
  const bottomLeft = fr[(3 * 8 + 0) * 3]!;
  const bottomRight = fr[(3 * 8 + 7) * 3]!;
  assert.ok(bottomLeft > bottomRight + 100);
});

/** Teinte (0..360) et saturation d'une LED. */
function hueSat(r: number, g: number, b: number): [number, number] {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!max || !d) return [0, 0];
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / max];
}
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

test('Couleurs : les événements courants restent dans la palette de la table ; le contraste est réservé aux rares', () => {
  // Table bleue mesurée en deux couleurs proches (TableTints) : la palette suit la mesure.
  const palette = dofScenePalette('#ff0000', ['#1040ff', '#2080ff']);
  const tableHue = hueSat(...palette.primary)[0];
  assert.ok(hueGap(tableHue, 225) < 30, `palette tirée des couleurs mesurées : ${tableHue}`);
  const common: DofEventKind[] = ['flipper', 'sling', 'bumper', 'launch', 'ball-start', 'target', 'spinner', 'ramp', 'rollover', 'kicker', 'flasher', 'other'];
  for (const kind of [...common, ...DOF_RARE_EVENTS]) {
    const scene = createDofScene(palette, 1);
    scene.trigger(kind, 'center', 0);
    let far = 0;
    for (let t = 0; t < 1800; t += 20) {
      const f = scene.render(LEFT, t);
      for (let i = 0; i < f.length; i += 3) {
        if (f[i]! + f[i + 1]! + f[i + 2]! < 90) continue;
        const [h, s] = hueSat(f[i]!, f[i + 1]!, f[i + 2]!);
        if (s < 0.25 || hueGap(h, tableHue) > 75) far++;
      }
    }
    if (common.includes(kind)) assert.equal(far, 0, `${kind} : hors des couleurs de la table`);
    else assert.ok(far > 0, `${kind} : événement rare sans contraste`);
  }
});

test('Lanceur analogique : tirette lâchée = bille lancée ; ramenée doucement = rien', () => {
  const fast = createLaunchDetector();
  assert.equal(fast(0.8, 0), false);
  assert.equal(fast(0.9, 20), false);
  assert.equal(fast(0.05, 60), true);
  assert.equal(fast(0.02, 80), false, 'une seule fois');
  const slow = createLaunchDetector();
  slow(0.8, 0);
  slow(0.3, 200);
  assert.equal(slow(0.05, 400), false);
});
