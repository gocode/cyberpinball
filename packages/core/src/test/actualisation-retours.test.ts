// Relecture automatique de la gestion des retours (demande du 27/11/2026) : la fenêtre des rapports ne
// relisait le service que sur Actualiser ; elle le fait désormais d'elle-même, toutes les 5 minutes par
// défaut, réglable.
// Invariants : le délai par défaut est 5 min et toute valeur hors liste y revient ; les nouveautés sont les
// seuls identifiants absents de la lecture précédente (la première n'annonce rien) ; une lecture identique
// ne redessine rien ; la page charge le module avant son script, propose le réglage, et la lecture
// discrète n'écrase jamais une réponse en cours d'écriture ni ne montre d'erreur en fenêtre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const DIR = path.join(REPO_ROOT, 'interne', 'gestion-retours');
const present = fs.existsSync(path.join(DIR, 'actualisation.js'));
const skip = !present && 'démonstration interne absente';

test('gestion des retours : le délai par défaut est 5 minutes, une valeur abîmée y revient', { skip }, () => {
  const a = require(path.join(DIR, 'actualisation.js'));
  assert.equal(a.DEFAUT, 5);
  assert.equal(a.delaiValide(null), 5);
  assert.equal(a.delaiValide(''), 5);
  assert.equal(a.delaiValide('abc'), 5);
  assert.equal(a.delaiValide('7'), 5, 'un délai hors de la liste est refusé');
  assert.equal(a.delaiValide('0'), 0, 'zéro coupe la relecture');
  assert.equal(a.delaiValide('30'), 30);
  assert.ok(a.DELAIS.includes(a.DEFAUT));
  assert.equal(a.attenteMs(0), undefined);
  assert.equal(a.attenteMs(5), 300_000);
});

test('gestion des retours : seuls les identifiants nouveaux sont annoncés', { skip }, () => {
  const a = require(path.join(DIR, 'actualisation.js'));
  assert.deepEqual(a.nouveaux(undefined, [{ id: 'a' }]), [], 'la première lecture n\'annonce rien');
  assert.deepEqual(a.nouveaux([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }, { id: 'c' }]), ['b', 'c']);
  assert.deepEqual(a.nouveaux([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }]), [], 'un rapport effacé n\'est pas une nouveauté');
  assert.equal(a.annonce(0, 0), '');
  assert.equal(a.annonce(1, 0), '1 nouveau rapport');
  assert.equal(a.annonce(3, 2), '3 nouveaux rapports et 2 nouvelles propositions');
});

test('gestion des retours : une lecture identique ne redessine rien, un changement oui', { skip }, () => {
  const a = require(path.join(DIR, 'actualisation.js'));
  const lu = { props: [{ id: 'p1', votes: 2 }], rapports: [{ id: 'r1', size: 10 }] };
  assert.equal(a.aChange(undefined, lu), true);
  assert.equal(a.aChange(lu, JSON.parse(JSON.stringify(lu))), false);
  assert.equal(a.aChange(lu, { ...lu, props: [{ id: 'p1', votes: 3 }] }), true);
  assert.equal(a.aChange(lu, { ...lu, rapports: [...lu.rapports, { id: 'r2', size: 5 }] }), true);
});

test('gestion des retours : au retour d\'une veille, la lecture manquée est rattrapée', { skip }, () => {
  const a = require(path.join(DIR, 'actualisation.js'));
  const t0 = 1_000_000;
  assert.equal(a.enRetard(t0, t0 + 4 * 60_000, 5), false);
  assert.equal(a.enRetard(t0, t0 + 5 * 60_000, 5), true);
  assert.equal(a.enRetard(t0, t0 + 99 * 60_000, 0), false, 'relecture coupée : jamais en retard');
  assert.equal(a.enRetard(undefined, t0, 5), false, 'rien de lu encore : le chargement initial s\'en charge');
});

test('gestion des retours : la page charge le module, propose le réglage, et la lecture discrète reste discrète', { skip }, () => {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
  assert.ok(html.indexOf('actualisation.js') !== -1 && html.indexOf('actualisation.js') < html.indexOf('app.js'), 'le module se charge avant la page');
  assert.match(html, /id="auto"/, 'le réglage est dans l\'en-tête');
  for (const m of ['0', '1', '2', '5', '10', '30']) assert.match(html, new RegExp(`<option value="${m}">`));
  // Le minuteur est branché, le réglage retenu, et la lecture manuelle garde ses erreurs en fenêtre.
  assert.match(app, /charger\(true\)/);
  assert.match(app, /localStorage\.setItem\('retours\.auto'/);
  assert.match(app, /if \(!auto\) toast\(`Lecture impossible/);
  // Une réponse en cours d'écriture n'est jamais perdue : les fils gardent leur brouillon à la relecture.
  assert.doesNotMatch(app, /S\.fils = \{\};/, 'relire ne vide plus les brouillons');
  assert.match(app, /TEXTAREA/);
});
