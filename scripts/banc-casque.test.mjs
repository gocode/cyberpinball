// Scénarios du banc d'essai du casque (scripts/banc-casque.mjs) : le vrai compagnon sur le runtime OpenXR
// factice, sans casque ni fenêtre. Plus aucun correctif de la VR sans passage ici (13 novembre 2026).
// Le banc se construit avec le compagnon (npm run casque-vr) ; sans lui, ces essais sont sautés et le disent.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bancPret, jouer } from './banc-casque.mjs';

const pret = bancPret();
const sauf = pret ? {} : { skip: 'banc pas construit : npm run casque-vr' };

const lignes = (r, re) => r.lignes.filter((l) => re.test(l.ligne));
const trace = (r, re) => r.trace.filter((l) => re.test(l.ligne));

test('banc : dix retraits du casque de suite, une seule vie du compagnon et une seule session', sauf, async () => {
  const etapes = ['0 porte 1', '0 limite fixe'];
  for (let i = 0; i < 10; i++) etapes.push(`${1500 + i * 1200} porte 0`, `${2100 + i * 1200} porte 1`);
  const r = await jouer(etapes.join('\n'), { dureeMs: 15000, relancer: true });
  assert.equal(r.lancements, 1, 'le compagnon n’est jamais relancé');
  assert.equal(trace(r, /^session creee$/).length, 1, 'une seule session');
  assert.equal(lignes(r, /^session-suspendue$/).length, 10);
  assert.equal(lignes(r, /^session-reprise ok/).length, 10);
  assert.equal(lignes(r, /^porte 1$/).length, 11);
  assert.equal(lignes(r, /^session-arretee/).length, 0);
  // Le casque remis, les images repartent dans la même session.
  assert.ok(trace(r, /^begin$/).length === 11);
});

test('banc : Link qui ne redonne pas la session (accueil à rechoisir) ; repli sur une session neuve', sauf, async () => {
  const r = await jouer(['0 porte 1', '0 reprise manuelle', '1500 porte 0', '2200 porte 1'].join('\n'), { dureeMs: 7000, relancer: true, suspensionMaxMs: 3000 });
  assert.equal(lignes(r, /^session-suspendue$/).length, 1);
  assert.equal(lignes(r, /^session-arretee pas reprise en 3 s$/).length, 1, 'repli dit au journal');
  assert.equal(r.lancements, 2, 'compagnon relancé une fois, après le délai seulement');
  // La session neuve prend le casque porté.
  assert.equal(lignes(r, /^porte 1$/).filter((l) => l.pid !== r.lignes[0].pid).length, 1);
});

test('banc : la session redonnée quand l’application est rechoisie, avant le repli', sauf, async () => {
  const r = await jouer(['0 porte 1', '0 reprise manuelle', '1500 porte 0', '2200 porte 1', '3500 choisir'].join('\n'), { dureeMs: 6000, relancer: true, suspensionMaxMs: 10000 });
  assert.equal(r.lancements, 1);
  assert.equal(lignes(r, /^session-reprise ok/).length, 1);
});

test('banc : limite fixe ou limite de pièce, dites au lancement', sauf, async () => {
  const fixe = await jouer('0 porte 1\n0 limite fixe', { dureeMs: 2500 });
  assert.equal(lignes(fixe, /^piece aucune$/).length, 1);
  const piece = await jouer('0 porte 1\n0 limite piece 2.49 3.38', { dureeMs: 2500 });
  assert.equal(lignes(piece, /^piece 2\.49\d* 3\.38\d*$/).length, 1);
});

test('banc : les deux clics des joysticks arrivent au menu, casque porté', sauf, async () => {
  const r = await jouer(
    ['0 porte 1', '1500 bouton /user/hand/left/input/thumbstick/click 1', '1600 bouton /user/hand/right/input/thumbstick/click 1', '2500 bouton /user/hand/left/input/thumbstick/click 0', '2500 bouton /user/hand/right/input/thumbstick/click 0'].join('\n'),
    { dureeMs: 3500 },
  );
  assert.equal(lignes(r, /^bouton clic-joystick-gauche 1$/).length, 1);
  assert.equal(lignes(r, /^bouton clic-joystick-droit 1$/).length, 1);
  assert.equal(lignes(r, /^bouton clic-joystick-gauche 0$/).length, 1);
});

test('banc : calage, les deux bouts et les deux prises des manettes à la gâchette', sauf, async () => {
  const r = await jouer(['0 porte 1', '0 manette gauche -0.3 1.02 -0.35', '0 manette droite 0.3 1.02 -0.35', '1500 valeur /user/hand/right/input/trigger/value 1'].join('\n'), { dureeMs: 2500, commandes: [[800, 'calage 1']] });
  const p = lignes(r, /^pointes droite /);
  assert.equal(p.length, 1);
  assert.match(p[0].ligne, /^pointes droite -0\.30\d* 1\.02\d* -0\.35\d* 0\.30\d* 1\.02\d* -0\.35\d* tete [-\d.]+ [-\d.]+ prises -0\.30\d* 1\.05\d* -0\.27\d* 0\.30\d* 1\.05\d* -0\.27\d*$/);
});
