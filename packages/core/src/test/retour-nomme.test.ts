// Retour nommé (backtrail.ts, app/src/library.ts) : le bouton de retour en tête d'un écran dit
// où il mène. Ces tests fixent la classe de problème : la destination suit le parcours réel
// (aller, revenir, rouvrir un écran d'en haut par une action), un retour qui surprend est appris
// et signalé, et chaque façon de revenir (Exit, clic sur le bouton, action « Retour ») le vérifie.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { BackTrail, type BackPlace } from '../backtrail';
import { REPO_ROOT } from './i18n-scan';

const HOME: BackPlace = { key: 'wheel', kind: 'wheel', heading: 'Menu des tables' };
const place = (heading: string, kind = 'custom'): BackPlace => ({ key: `${kind}|${heading}`, kind, heading });
const SHEET = place('Neon Abyss', 'sheet');
const MANAGE = place('Gérer la table', 'sheet+manage');
const MEDIAS = place('Médias du jeu');
const SYSTEM = place('Menu système', 'system');
const DOWNLOADS = place('Téléchargements');
const FILE = place('Neon Abyss v1.2.zip');

/** Un écran affiché : un objet neuf à chaque ouverture, comme go() dans library.ts. */
const open = (trail: BackTrail<object>, p: BackPlace) => trail.arrive(p, {});

test('retour nommé : le bouton mène à l’écran d’où l’on vient, la roue tout en haut', () => {
  const trail = new BackTrail<object>(() => HOME);
  open(trail, SHEET);
  assert.equal(trail.destination().heading, 'Menu des tables');
  open(trail, MANAGE);
  assert.equal(trail.destination().heading, 'Neon Abyss');
  open(trail, MEDIAS);
  assert.equal(trail.destination().heading, 'Gérer la table');
  // Retour : on remonte d'un cran, et le bouton du nouvel écran remonte encore.
  open(trail, MANAGE);
  assert.equal(trail.destination().heading, 'Neon Abyss');
  open(trail, SHEET);
  assert.equal(trail.destination().heading, 'Menu des tables');
});

test('retour nommé : un écran d’en haut rouvert par une action (enregistrer, annuler) coupe la suite', () => {
  const trail = new BackTrail<object>(() => HOME);
  open(trail, SYSTEM);
  open(trail, DOWNLOADS);
  open(trail, FILE);
  assert.equal(trail.destination().heading, 'Téléchargements');
  // Le fichier supprimé, l'écran rouvre le menu système par openSystem, pas par son retour.
  open(trail, SYSTEM);
  assert.equal(trail.destination().heading, 'Menu des tables');
  // Le même écran redessiné (son titre change, son objet reste) ou rouvert : rien ne s'empile.
  const screen = {};
  trail.arrive(DOWNLOADS, screen);
  trail.arrive({ ...DOWNLOADS, heading: 'Téléchargements (2)' }, screen);
  trail.arrive(DOWNLOADS, {});
  assert.equal(trail.destination().heading, 'Menu système');
});

test('retour nommé : un retour qui arrive ailleurs que là où il l’annonçait est appris et signalé', () => {
  const trail = new BackTrail<object>(() => HOME);
  // Parcours ouvert depuis un message de fin de partie (rien dans le parcours) : son retour mène à la fiche.
  const journey = place('Ce qu’il manque pour jouer');
  open(trail, journey);
  assert.equal(trail.destination().heading, 'Menu des tables');
  trail.expect();
  const surprise = open(trail, SHEET);
  assert.deepEqual(surprise, { from: 'Ce qu’il manque pour jouer', announced: 'Menu des tables', landed: 'Neon Abyss' });
  // La fois suivante, le bouton le dit, même ouvert d'ailleurs.
  trail.reset();
  open(trail, journey);
  assert.equal(trail.destination().heading, 'Neon Abyss');
  // Un retour annoncé juste ne dit rien ; vers la roue non plus.
  trail.expect();
  assert.equal(open(trail, SHEET), undefined);
  trail.expect();
  assert.equal(trail.arrive(undefined), undefined);
});

test('retour nommé : chaque façon de revenir est vérifiée, et le bouton nomme la destination', () => {
  const library = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  // Exit, le bouton en tête, Start ou un clic sur l'action de retour : expectBack() avant le retour.
  assert.match(library, /expectBack\(\);\s+built\.back\(\);/, 'Exit');
  assert.match(library, /expectBack\(\);\s+build\(\)\.back\(\);/, 'bouton en tête');
  assert.match(library, /if \(built\.actions\[cursor\]\?\.run === built\.back\) expectBack\(\);/, 'Start sur l’action de retour');
  assert.match(library, /if \(built\.actions\[index\]!\.run === built\.back\) expectBack\(\);/, 'clic sur l’action de retour');
  // Chaque vue fait avancer le parcours, et la gestion fermée le remet à zéro.
  assert.match(library, /arrived\(placeOf\(screen, built\), screen\);/);
  assert.match(library, /if \(!screen\) \{\s+arrived\(undefined\);/);
  // Le libellé : la destination, sauf une action qui dit autre chose qu'un retour (« Annuler »).
  assert.match(library, /return backTrail\.destination\(\)\.heading;/);
  // Dans la liste d'un écran à deux zones : « Exit : actions ».
  assert.match(library, /backTag: zone\?\.active === 'list' \? \{ key: 'Exit', text: t\('actions'\) \} : undefined,/);
  const renderer = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'library.js'), 'utf8');
  assert.match(renderer, /v\.backTag \? \{ type: 'zone' \} : \{ type: 'back' \}/, 'un clic sur « Exit : actions » fait ce que fait Exit');
});
