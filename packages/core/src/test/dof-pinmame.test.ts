// Bobines de PinMAME pour les effets LED de Cyber Pinball (dof-pinmame.ts) : écoute posée dans core.vbs, rôle de
// chaque bobine lu dans les SolCallback du script, une seule réponse quand plusieurs sources disent la même chose.

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOF_TAP_ENV, PINMAME_TAP_MARK, addPinmameTap, classifyRomSolenoids, createEventMerger, parsePinmameChunk, removePinmameTap } from '../index';

// Boucle de PinMAMETimer_Timer de core.vbs (VPX 10.8.1), en abrégé.
const CORE = [
  'Sub PinMAMETimer_Timer',
  '\tDim ChgSol, ii',
  '\tIf Not IsEmpty(ChgSol) Then',
  '\t\tFor ii = 0 To UBound(ChgSol)',
  '\t\t\tnsol = ChgSol(ii, 0)',
  '\t\tNext',
  '\tEnd If',
  'End Sub',
  '',
].join('\r\n');

test('bobines PinMAME : écoute posée dans la boucle de core.vbs, idempotente, retirable', () => {
  const patched = addPinmameTap(CORE)!;
  assert.ok(patched, 'boucle sur ChgSol trouvée');
  const lines = patched.split('\r\n');
  const loop = lines.findIndex((l) => /For ii = 0 To UBound\(ChgSol\)/.test(l));
  assert.match(lines[loop + 1]!, /^\t\t\tCyberPinball_SolTap ChgSol\(ii, 0\), ChgSol\(ii, 1\) ' CyberPinball-pinmame-tap/, 'appel en tête de boucle, sans toucher aux On Error');
  assert.ok(patched.includes('Sub CyberPinball_SolTap(n, v)'));
  assert.ok(patched.includes(`Item("${DOF_TAP_ENV}")`), 'rien sans la variable de la partie');
  assert.ok(patched.includes('p & ".pinmame"'), 'fichier à part, jamais celui de controller.vbs');
  assert.ok(patched.includes(PINMAME_TAP_MARK));
  assert.equal(addPinmameTap(patched), patched, 'idempotent');
  assert.equal(removePinmameTap(patched), CORE, 'retirée, core.vbs revient à l’identique');
  // Une retouche d'une version précédente est refaite.
  const old = patched.split(PINMAME_TAP_MARK).join("' CyberPinball-pinmame-tap v0");
  assert.equal(addPinmameTap(old), patched);
  assert.equal(addPinmameTap('Sub Autre\r\nEnd Sub\r\n'), undefined, 'un autre core.vbs : pas touché');
});

// Extrait du script d'Apollo 13 (Sega 1995), table jouée le 27/11/2026 : seuls les flippers s'allumaient.
const APOLLO = [
  'Const sKick = 9',
  'SolCallBack(1) \t\t\t= "SolBallRelease"',
  'SolCallback(2) \t\t\t= "SolAPlunger"',
  'SolCallback(3) \t\t\t= "SolRightEject"',
  'SolCallback(5) \t\t\t= "SolRocketEject"   \'Rocket Ball Eject',
  'SolCallback(7) \t\t\t= "ShakeRocket"',
  'SolCallback(8) \t\t\t= "SolKnocker"',
  'SolCallback(sLLFlipper) = "SolLFlipper"',
  'SolCallback(15)         = "SolLFlipperd"',
  'SolCallback(18)\t\t\t= "SolRampLift"',
  'SolCallback(23)\t\t\t= "SolDrainPost"',
  'SolCallback(25)\t\t\t= "SolFLamp1"',
  'SolCallback(sKick) = "bsSaucer.SolOut"',
  'SolModCallback(26) = "Flasher26"',
  'SolCallback(27) = "SolMystery"',
  'Sub SolMystery(Enabled)',
  '\tIf Enabled Then BumperCap.Visible = 1',
  'End Sub',
  "' SolCallback(30) = \"SolCommented\"",
].join('\r\n');

test('bobines PinMAME : le rôle de chaque bobine lu dans les SolCallback du script', () => {
  const sol = classifyRomSolenoids(APOLLO);
  const kind = (n: number) => sol.get(n) && `${sol.get(n)!.kind}/${sol.get(n)!.side}`;
  assert.equal(kind(1), 'ball-start/center');
  assert.equal(kind(2), 'launch/center', 'lanceur automatique : la bille part');
  assert.equal(kind(3), 'kicker/right');
  assert.equal(kind(5), 'kicker/center');
  assert.equal(kind(8), 'award/center', 'knocker');
  assert.equal(kind(15), 'flipper/left');
  assert.equal(kind(18), 'ramp/center');
  assert.equal(kind(23), 'other/center', 'un poteau qui se lève n’est pas une bille perdue');
  assert.equal(kind(25), 'flasher/center');
  assert.equal(sol.get(25)!.held, true, 'flasher : tenu');
  assert.equal(kind(9), 'kicker/center', 'numéro donné par une constante');
  assert.equal(kind(26), 'flasher/center', 'SolModCallback');
  assert.equal(kind(27), 'bumper/center', 'rôle lu dans le corps de la Sub');
  assert.equal(kind(7), 'other/center', 'moteur : petit effet');
  assert.equal(sol.has(30), false, 'commentaire ignoré');
});

test('bobines PinMAME : lignes du fichier, ligne coupée gardée pour le tour suivant', () => {
  const { solenoids, rest } = parsePinmameChunk('P,3,1,72000.125\r\nP,3,0,72000.2\r\nX,1\r\nP,25,1,72');
  assert.deepEqual(solenoids, [
    { number: 3, state: 1, at: 72000.125 },
    { number: 3, state: 0, at: 72000.2 },
  ]);
  assert.equal(rest, 'P,25,1,72');
});

test('sources des effets : un même rôle donné par deux sources au même instant ne joue qu’une fois', () => {
  const fresh = createEventMerger(0.15);
  assert.equal(fresh('bumper', 'son', 10), true);
  assert.equal(fresh('bumper', 'pinmame', 10.05), false, 'la bobine du bumper après son son');
  assert.equal(fresh('bumper', 'son', 10.1), true, 'même source : la scène amortit');
  assert.equal(fresh('kicker', 'pinmame', 10.1), true, 'autre rôle');
  assert.equal(fresh('bumper', 'dof', 10.5), true, 'hors fenêtre');
});
