import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { keyboard, recorded, runWizard, skip } from './clavier-reel-outils';
import { removeTempDir } from './temp-dir';

// Suite de releve-modificateurs.test.ts, dans son propre fichier (26/11/2026) : node:test lance les fichiers en parallele
// mais chaque fichier est sequentiel ; les deux essais (52 s et 24 s) fixaient ensemble la duree du fichier.

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
