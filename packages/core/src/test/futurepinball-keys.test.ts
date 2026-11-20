// Boutons de la borne rendus à Future Pinball (packages/core/src/futurepinball-keys.ts) : le jeu ne lit
// que le clavier, avec les touches de ses préférences en codes DirectInput. Premier essai réel (PinCab,
// 20/11/2026, Pinscape aux boutons de joystick) : aucun bouton ne répondait en partie.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dikToCode, futurePinballGameKeys, futurePinballJoystickKeys, windowsVk, type CabinetButtons } from '../index';

const JOY = (n: number) => `SDLJoy_03004c80fafa0000f700000000000000_1;${n}`;

// Préférences relevées sur le PinCab le 20/11/2026 (HKCU\Software\Future Pinball\GamePlayer).
const PINCAB: Record<string, number> = {
  LeftFlipperKey: 42,
  RightFlipperKey: 54,
  StartGameKey: 2,
  InsertCoinKey: 6,
  PlungerKey: 28,
  NudgeLeftKey: 44,
  NudgeUpKey: 57,
  NudgeRightKey: 53,
  Special1Key: 30,
  Special2Key: 40,
};

test('codes DirectInput : Maj gauche et droite, chiffres, lettres, Entrée, bloc étendu', () => {
  assert.equal(dikToCode(42), 'ShiftLeft');
  assert.equal(dikToCode(54), 'ShiftRight');
  assert.equal(dikToCode(2), 'Digit1');
  assert.equal(dikToCode(11), 'Digit0');
  assert.equal(dikToCode(28), 'Enter');
  assert.equal(dikToCode(30), 'KeyA');
  assert.equal(dikToCode(44), 'KeyZ');
  assert.equal(dikToCode(16), 'KeyQ');
  assert.equal(dikToCode(0x9d), 'ControlRight');
  assert.equal(dikToCode(0xcb), 'ArrowLeft');
  assert.equal(dikToCode(0x3b), 'F1');
  assert.equal(dikToCode(250), undefined);
  // Chaque touche connue a son code de Windows : le relais peut l'envoyer.
  for (let dik = 1; dik < 256; dik++) {
    const code = dikToCode(dik);
    if (code) assert.notEqual(windowsVk(code), undefined, `${dik} → ${code}`);
  }
});

test('touches du jeu : celles de ses préférences ; une valeur absente, celle d’origine ; Exit quitte par Échap', () => {
  const keys = futurePinballGameKeys((v) => PINCAB[v]);
  assert.deepEqual(keys.leftFlipper, ['ShiftLeft']);
  assert.deepEqual(keys.rightFlipper, ['ShiftRight']);
  assert.deepEqual(keys.start, ['Digit1']);
  assert.deepEqual(keys.credit, ['Digit5']);
  assert.deepEqual(keys.plunger, ['Enter']);
  assert.deepEqual(keys.nudgeLeft, ['KeyZ']);
  assert.deepEqual(keys.nudgeCenter, ['Space']);
  assert.deepEqual(keys.nudgeRight, ['Slash']);
  assert.deepEqual(keys.leftMagna, ['KeyA']);
  assert.deepEqual(keys.rightMagna, ['Quote']);
  assert.deepEqual(keys.exit, ['Escape']);
  // Joueur qui a mis les flippers sur Ctrl : suivi.
  assert.deepEqual(futurePinballGameKeys((v) => (v === 'LeftFlipperKey' ? 0x1d : v === 'RightFlipperKey' ? 0x9d : undefined)).rightFlipper, ['ControlRight']);
  // Registre vide (jeu jamais réglé) : ses touches d'origine.
  assert.deepEqual(futurePinballGameKeys(() => undefined), keys);
  // Code inconnu : pas de touche plutôt qu'une fausse.
  assert.equal(futurePinballGameKeys((v) => (v === 'PlungerKey' ? 250 : PINCAB[v])).plunger, undefined);
});

test('borne au Pinscape : chaque bouton de joystick appuie la touche du jeu pour son rôle', () => {
  const source = {
    buttons: { leftFlipper: JOY(5), rightFlipper: JOY(4), start: JOY(12), exit: JOY(8), credit: JOY(1), plunger: JOY(9), rightMagna: JOY(6), leftMagna: JOY(7), pause: JOY(13) },
    navigation: { previous: JOY(5), next: JOY(4), confirm: JOY(6), back: JOY(7) },
  } as unknown as { buttons: CabinetButtons; navigation: Record<string, string> };
  const keys = futurePinballJoystickKeys(source as never, (v) => PINCAB[v]);
  assert.deepEqual(keys.get(JOY(5)), ['ShiftLeft']);
  assert.deepEqual(keys.get(JOY(4)), ['ShiftRight']);
  assert.deepEqual(keys.get(JOY(12)), ['Digit1']);
  assert.deepEqual(keys.get(JOY(1)), ['Digit5']);
  assert.deepEqual(keys.get(JOY(9)), ['Enter']);
  assert.deepEqual(keys.get(JOY(8)), ['Escape']);
  assert.equal(keys.has(JOY(13)), false, 'Pause : pas de touche connue du jeu');
  // Borne au clavier : ses touches arrivent déjà au jeu, rien à rejouer.
  assert.equal(futurePinballJoystickKeys(undefined, (v) => PINCAB[v]).size, 0);
});
