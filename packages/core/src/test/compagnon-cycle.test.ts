// Cycle de vie du compagnon du casque : après n'importe quel aller-retour menu → partie → menu, même
// plusieurs de suite, les écrans reviennent (panne du 12/11/2026 : la sortie de l'ancien compagnon
// fermait les écrans du nouveau, lancé avant elle).

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMPANION_LEAVE_MS, CompanionCycle, cadenceWithoutScreens } from '../compagnon-cycle';

/** Un compagnon simulé : ses écrans (vues, canal des textures) tant qu'il les possède. */
interface Fake {
  id: number;
}

/**
 * Rejoue les cycles de la borne : menu, relève à VPX, fin de partie → arrêt et session neuve. À chaque
 * vérification (minuterie de 2 s, changement d'état), on tente un lancement ; la sortie de l'ancien
 * arrive après. Rend les écrans possédés par le compagnon en service à la fin de chaque retour au menu.
 */
function replay(cycles: number, checksWhileLeaving: number): { screens: (number | undefined)[]; launched: number } {
  const cycle = new CompanionCycle<Fake>();
  let next = 1;
  let views: number | undefined; // compagnon à qui appartiennent les écrans rendus pour le casque
  const launch = () => {
    if (!cycle.canStart()) return;
    const child = { id: next++ };
    cycle.started(child);
    views = child.id; // openViews : les écrans d'avant fermés, ceux-ci ouverts pour lui
  };
  const exit = (child: Fake) => {
    if (cycle.exited(child)) views = undefined; // closeViews, canal fermé
  };
  launch();
  const screens: (number | undefined)[] = [];
  for (let i = 0; i < cycles; i++) {
    // Fin de partie : session neuve. L'ancien reçoit « quitter » et sort un peu plus tard.
    const old = cycle.running!;
    cycle.stopping(old);
    for (let k = 0; k < checksWhileLeaving; k++) launch();
    exit(old);
    launch(); // restartNow : relance aussitôt la sortie
    screens.push(views === cycle.running?.id ? views : undefined);
  }
  return { screens, launched: next - 1 };
}

test('menu → partie → menu, cinq fois de suite : les écrans reviennent à chaque retour', () => {
  for (const checks of [0, 1, 3]) {
    const { screens, launched } = replay(5, checks);
    assert.equal(launched, 6, `un compagnon par session (vérifications pendant la sortie : ${checks})`);
    assert.ok(screens.every((s) => s !== undefined), `écrans perdus après un retour au menu : ${JSON.stringify(screens)}`);
  }
});

test('un ancien compagnon qui sort après le lancement du suivant ne lui prend rien', () => {
  const cycle = new CompanionCycle<Fake>();
  const a = { id: 1 }, b = { id: 2 };
  cycle.started(a);
  cycle.stopping(a, 0);
  // Ancien bloqué au-delà du délai (tué) : le suivant peut partir…
  assert.equal(cycle.canStart(COMPANION_LEAVE_MS - 1), false);
  assert.equal(cycle.canStart(COMPANION_LEAVE_MS + 1), true);
  cycle.started(b);
  // … et la sortie tardive de l'ancien ne ferme pas ses écrans.
  assert.equal(cycle.exited(a), false);
  assert.equal(cycle.running, b);
  assert.equal(cycle.exited(b), true);
  assert.equal(cycle.canStart(), true);
});

test('cadence : alerte quand des écrans sont attendus et qu’aucune image n’arrive', () => {
  const line = 'cadence casque 72 Hz, 71.8 images/s, 0 sautees, copie max 0.0 ms, rendu max 0.4 ms, 0 images recues';
  assert.equal(cadenceWithoutScreens(line, true), true);
  assert.equal(cadenceWithoutScreens(line, false), false);
  assert.equal(cadenceWithoutScreens(line.replace('0 images recues', '655 images recues'), true), false);
  assert.equal(cadenceWithoutScreens('etat 5', true), false);
});

test('casque.ts : un seul compagnon à la fois, la sortie d’un ancien ne ferme rien du suivant, alertes au journal', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../../../app/src/casque.ts'), 'utf8');
  assert.match(src, /if \(this\.child \|\| !this\.cycle\.canStart\(\) \|\| Date\.now\(\) < this\.retryAt\) return;/);
  assert.match(src, /this\.child = child;\s*this\.cycle\.started\(child\);/);
  assert.match(src, /this\.child = undefined;\s*this\.cycle\.stopping\(child\);/);
  // La sortie : rien n'est fermé (vues, canal, textures du suivant) quand un autre compagnon est en service.
  const exit = src.slice(src.indexOf("child.on('exit'"), src.indexOf('this.opts.closeViews?.();', src.indexOf("child.on('exit'")));
  assert.match(exit, /const owner = this\.cycle\.exited\(child\);[\s\S]*if \(!owner\) \{[\s\S]*this\.releaseFrames\(child\);[\s\S]*return;\s*\}/);
  assert.match(src, /cadenceWithoutScreens\(line, this\.viewsOpened && !this\.viewsFlowing\)/);
  const cpp = fs.readFileSync(path.join(__dirname, '../../../../packages/casque-vr/src/casque.cpp'), 'utf8');
  assert.match(cpp, /say\("erreur ecrans pas soumis au casque 6 s apres "/);
});
