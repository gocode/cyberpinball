// Première configuration au clavier et à la souris (19/11/2026). Un joueur, qui configurait sa borne
// en bureau à distance, a dû se déplacer jusqu'à elle et n'a pas trouvé quel bouton le sortait d'une
// étape du relevé. Invariants : toute l'assistant se fait au clic, ou aux flèches, Entrée et Échap,
// sauf le relevé des vrais boutons, qui seul demande la borne ; au relevé, « Passer ce bouton » et
// « Terminer le relevé » se cliquent, et un bouton obligatoire ne se passe pas.
//
// L'assistant tourne hors écran, sur un bureau Windows caché (voir clavier-reel-outils.ts) ; chaque
// geste de l'autopilote laisse la trace de l'étape où il a mené (« Autopilote : <geste> → <étape> »).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { buttonKeys, BUTTONS, keyProblems, GAME_KEYS } from '../buttons';
import { loadCabinet } from '../store';
import { cabinetIn, keyboard, recorded, runWizard, skip } from './clavier-reel-outils';
import { removeTempDir } from './temp-dir';

/** Clic sur une commande d'étape (wizard-controls.ts) : son rôle. */
const control = (role: 'back' | 'previous' | 'next' | 'confirm' | 'exit') => `click:[data-act*=control][data-act*=${role}]`;
/** Clic sur une action du relevé ou d'une étape (« skip », « finish », « save »…). */
const action = (id: string) => `click:[data-act*=${id}]`;

/** Les étapes atteintes, geste après geste. */
function path_(output: string): string[] {
  return [...output.matchAll(/^Autopilote : .* → (\w+)/gm)].map((m) => m[1]!);
}

function inSandbox(name: string, run: (home: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cyberpinball-${name}-`));
  try {
    run(path.join(dir, 'home'));
  } finally {
    removeTempDir(dir);
  }
}

test('assistant complet à la souris : seul le relevé des boutons se fait sur la borne, chaque autre étape au clic, jusqu’à l’enregistrement', { skip, timeout: 290_000 }, () => {
  inSandbox('souris', (home) => {
    const output = runWizard(
      home,
      [
        action('modify'), // « Modifier mes boutons » : relevé des boutons de l'interface
        action('skip'), // Précédent est obligatoire : rien n'est passé
        ...keyboard('KeyJ', 'KeyL', 'KeyK', 'KeyU'), // les quatre obligatoires, sur la borne
        action('skip'), // Aide-mémoire, facultatif : passé à la souris
        action('finish'), // « Terminer le relevé » : récapitulatif
        // Essai sur la borne ; Valider (K), essayé en dernier, enregistre : ceux du jeu sont proposés dessus.
        ...keyboard('KeyJ', 'KeyL', 'KeyU', 'KeyK'),
        action('save'), // boutons du jeu validés
        action('save'), // tilt : continuer
        control('confirm'), // playfield sur l'écran proposé
        control('next'),
        control('previous'),
        control('confirm'), // flippers en bas
        control('next'),
        control('confirm'), // diagonale
        control('exit'), // backglass : aucun écran
        control('exit'), // DMD : aucun écran
        control('exit'), // topper : aucun écran
        'click:.arrange-items li:last-child', // disposition : terminée
        control('confirm'), // récapitulatif : enregistrer
        control('confirm'), // continuer vers les tables
      ],
      [],
    );
    assert.ok(output.includes('Assistant : relevé interface, back sur KeyU : gardé'), output);
    assert.ok(output.includes('Assistant : relevé interface, help : passé à la souris'), output);
    assert.ok(output.includes('Assistant : relevé interface terminé à la souris'), output);
    assert.ok(!output.includes('Assistant : relevé interface, previous : passé à la souris'), 'un bouton obligatoire ne se passe pas');
    const steps = path_(output);
    for (const phase of ['navigation', 'navigationSummary', 'buttonsSummary', 'assign', 'orient', 'size', 'arrange', 'summary', 'done'])
      assert.ok(steps.includes(phase), `${phase} atteinte au clic\n${steps.join(' → ')}\n${output}`);
    // Enregistré : le modèle de la borne existe, avec les boutons de l'interface relevés.
    const cabinet = loadCabinet(home);
    assert.ok(cabinet, `borne enregistrée\n${output}`);
    assert.deepEqual(
      { previous: cabinet.navigation?.previous, next: cabinet.navigation?.next, confirm: cabinet.navigation?.confirm, back: cabinet.navigation?.back, help: cabinet.navigation?.help },
      { previous: 'KeyJ', next: 'KeyL', confirm: 'KeyK', back: 'KeyU', help: undefined },
    );
    assert.ok(cabinet.roles.playfield, 'playfield affecté au clic');
    assert.equal(cabinet.roles.backglass, undefined, '« Aucun écran » cliqué');
  });
});

test('relevé des boutons du jeu : « Terminer le relevé » garde la touche affichée des boutons restants, jamais une touche déjà prise', { skip, timeout: 290_000 }, () => {
  inSandbox('terminer', (home) => {
    cabinetIn(home);
    // Les obligatoires sur des touches qu'aucun bouton facultatif n'a par défaut ; MagnaSave gauche sur P,
    // la touche par défaut de Pause, que Pause ne peut donc plus garder.
    const required = { leftFlipper: 'KeyA', rightFlipper: 'KeyS', start: 'Digit2', exit: 'KeyQ', credit: 'Digit3', plunger: 'KeyW' };
    const output = runWizard(
      home,
      [
        'click:#actions button:nth-child(4)', // « Tout modifier »
        action('finish'), // trop tôt : les boutons obligatoires d'abord
        ...keyboard(...Object.values(required)),
        ...keyboard('KeyP'), // MagnaSave gauche sur P
        action('skip'), // MagnaSave droit : pas de bouton
        action('finish'),
        ...keyboard('KeyA', 'KeyS', 'KeyQ', 'Digit2'), // essai, Start valide
      ],
      ['--boutons'],
    );
    assert.ok(output.includes(recorded('game', 'leftMagna', 'KeyP')), output);
    assert.ok(output.includes('Assistant : relevé game, rightMagna : passé à la souris'), output);
    assert.equal((output.match(/relevé game terminé à la souris/g) ?? []).length, 1, `« Terminer » refusé tant qu’un obligatoire manque\n${output}`);
    const buttons = loadCabinet(home)!.buttons!;
    const defaults = buttonKeys(undefined);
    assert.deepEqual(keyProblems(GAME_KEYS, buttons), [], 'aucune touche en double');
    for (const [id, code] of Object.entries(required)) assert.equal(buttons[id as keyof typeof buttons], code, id);
    assert.equal(buttons.leftMagna, 'KeyP');
    assert.equal(buttons.rightMagna, undefined, 'passé : sans touche');
    assert.equal(buttons.pause, undefined, 'P déjà pris : Pause reste sans touche');
    // Les autres boutons facultatifs gardent leur touche par défaut.
    for (const b of BUTTONS.filter((b) => !b.required && !['credit', 'leftMagna', 'rightMagna', 'pause'].includes(b.id)))
      assert.equal(buttons[b.id], defaults[b.id], b.id);
  });
});

test('assistant complet au clavier : flèches, Entrée et Échap à chaque étape, jusqu’à l’enregistrement', { skip, timeout: 290_000 }, () => {
  inSandbox('clavier', (home) => {
    const output = runWizard(
      home,
      [
        ...keyboard('Enter'), // garder ces touches
        ...keyboard('Enter'), // boutons du jeu proposés : valider
        ...keyboard('Enter'), // tilt : continuer
        ...keyboard('ArrowRight', 'ArrowLeft', 'Enter'), // playfield
        ...keyboard('ArrowRight', 'ArrowLeft', 'Enter'), // flippers
        ...keyboard('ArrowRight', 'Enter'), // diagonale
        ...keyboard('Escape', 'Escape', 'Escape'), // backglass, DMD, topper : aucun écran
        'click:.arrange-items li:last-child', // disposition : terminée
        ...keyboard('Enter'), // récapitulatif : enregistrer
        ...keyboard('Enter'), // continuer vers les tables
      ],
      [],
    );
    const steps = path_(output);
    for (const phase of ['buttonsSummary', 'assign', 'orient', 'size', 'arrange', 'summary', 'done'])
      assert.ok(steps.includes(phase), `${phase} atteinte au clavier\n${steps.join(' → ')}\n${output}`);
    assert.ok(loadCabinet(home)?.roles.playfield, `borne enregistrée au clavier\n${output}`);
  });
});
