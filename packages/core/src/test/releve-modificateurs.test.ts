import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { BUTTONS } from '../buttons';
import { loadCabinet } from '../store';
import { cabinetIn, keyboard, recorded, repeat, runWizard, skip } from './clavier-reel-outils';
import { removeTempDir } from './temp-dir';

// Touches modificatrices au relevé des boutons : Maj et Ctrl sont les flippers et les MagnaSave de
// la plupart des encodeurs en mode clavier (CSD PinOne, KL25Z, Zero Delay), et aucun essai ne les
// faisait passer par le vrai chemin d'une touche. 19/11/2026 : sur une PinOne, le MagnaSave gauche
// (Ctrl gauche) était « introuvable », sa ligne vide. Ctrl, Maj et Alt de gauche passent par
// webContents.sendInputEvent comme un vrai clavier (autopilote « Clavier:ControlLeft ») ; ceux de
// droite, que sendInputEvent ne sait pas produire, par le traitement des touches de l'assistant.

/** Boutons d'une PinOne en mode clavier (touches de VPX), dans l'ordre du relevé. */
const PINONE = ['Clavier:ShiftLeft', 'ShiftRight', 'Clavier:Digit1', 'Clavier:Escape', 'Clavier:Digit5', 'Clavier:Enter', 'Clavier:ControlLeft', 'ControlRight'];

test('boutons du jeu d’une PinOne en mode clavier : Maj, Ctrl, Échap et Alt relevés et enregistrés', { skip, timeout: 290_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-modificateurs-'));
  try {
    const home = path.join(dir, 'home');
    cabinetIn(home);
    const output = runWizard(
      home,
      [
        'click:#actions button:nth-child(4)', // « Tout modifier »
        ...PINONE,
        // Extra Ball sur Alt gauche, puis Exit (Échap) passe les boutons facultatifs suivants.
        ...keyboard('AltLeft', ...repeat('Escape', BUTTONS.length - PINONE.length - 1)),
        // Essai des flippers et d'Exit, puis Start enregistre.
        'Clavier:ShiftLeft', 'ShiftRight', 'Clavier:Escape', 'Clavier:Digit1',
      ],
      ['--boutons'],
    );
    for (const [id, code] of [
      ['leftFlipper', 'ShiftLeft'],
      ['rightFlipper', 'ShiftRight'],
      ['exit', 'Escape'],
      ['leftMagna', 'ControlLeft'],
      ['rightMagna', 'ControlRight'],
      ['extraBall', 'AltLeft'],
    ])
      assert.ok(output.includes(recorded('game', id!, code!)), `${id} sur ${code}\n---\n${output}`);
    // Échap pendant le relevé est relevé (Exit), jamais la question de sortie.
    assert.doesNotMatch(output, /Quitter sans enregistrer/, output);
    assert.match(output, /Assistant : touches validées \(game\) : .*leftMagna=ControlLeft rightMagna=ControlRight extraBall=AltLeft/, output);
    const buttons = loadCabinet(home)!.buttons!;
    assert.equal(buttons.leftMagna, 'ControlLeft', output);
    assert.equal(buttons.rightMagna, 'ControlRight');
    assert.equal(buttons.extraBall, 'AltLeft');
    const ini = fs.readFileSync(path.join(home, 'sandbox', 'VPinballX.ini'), 'utf8');
    assert.match(ini, /^Mapping\.LeftMagna = Key;224\b/m, 'Ctrl gauche dans [Input]');
    assert.match(ini, /^Mapping\.RightMagna = Key;228\b/m, 'Ctrl droit dans [Input]');
    assert.match(ini, /^Mapping\.LeftFlipper = Key;225\b/m, 'Maj gauche dans [Input]');
  } finally {
    removeTempDir(dir);
  }
});

test('assistant complet d’une PinOne : les MagnaSave mis sur l’aide-mémoire et les réglages gardent Ctrl dans le jeu', { skip, timeout: 290_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-modificateurs-complet-'));
  try {
    const home = path.join(dir, 'home');
    const output = runWizard(
      home,
      [
        // Borne neuve : Échap (Exit) ouvre le relevé, l'interface d'abord.
        ...keyboard('Escape'),
        // Précédent, Suivant, Valider, Retour ; les MagnaSave pour l'aide-mémoire et les réglages ;
        // Retour (Échap) passe le bureau Windows et la sortie sans enregistrer.
        'Clavier:ShiftLeft', 'ShiftRight', 'Clavier:Digit1', 'Clavier:Escape', 'Clavier:ControlLeft', 'ControlRight', 'Clavier:Escape', 'Clavier:Escape',
        // Essai des boutons de l'interface, puis Valider : les boutons du jeu proposés dessus, validés tels quels.
        'Clavier:ShiftLeft', 'ShiftRight', 'Clavier:Escape', 'Clavier:Digit1',
        'Clavier:Digit1',
        'CtrlQ',
      ],
      [],
    );
    assert.ok(output.includes(recorded('interface', 'help', 'ControlLeft')), output);
    assert.ok(output.includes(recorded('interface', 'settings', 'ControlRight')), output);
    // Les MagnaSave du jeu gardent leur touche : le même bouton physique sert au menu et en partie.
    assert.match(output, /Assistant : touches validées \(game\) : .*leftMagna=ControlLeft rightMagna=ControlRight /, output);
  } finally {
    removeTempDir(dir);
  }
});
