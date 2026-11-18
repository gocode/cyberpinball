// Le bouton Retour du téléphone (18/11/2026) : il remonte les écrans de la page au lieu de la quitter
// (app/renderer/telephone/telephone-retour.js). Ici, ce qui se lit dans les fichiers : chaque script de
// la page servi par la borne, le module chargé avant telephone.js, chaque bouton de retour de la page
// repris par le bouton Retour. Le parcours dans la vraie page (feuille, rubrique, onglet, écran de la
// borne, adresse gardée) : la démonstration interne du téléphone (telecommande.test.ts).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const DIR = path.join(REPO_ROOT, 'app', 'renderer', 'telephone');
const page = fs.readFileSync(path.join(DIR, 'telephone.html'), 'utf8');
const retour = fs.readFileSync(path.join(DIR, 'telephone-retour.js'), 'utf8');
const remote = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'phone-remote.ts'), 'utf8');

test('page du téléphone : chacun de ses scripts est servi par la borne', () => {
  // Un module oublié dans la table de phone-remote.ts : 404 au téléphone, et ce qu'il fait manque sans bruit.
  const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]!);
  assert.ok(scripts.length > 5, 'les scripts de la page sont relevés');
  // Le catalogue de la langue est fabriqué à la demande (réduit aux textes du téléphone), les autres viennent de PHONE_FILES.
  const served = (file: string) => remote.includes(`'/${file}': `) || remote.includes(`url === '/${file}'`);
  assert.deepEqual(scripts.filter((s) => !served(s)), [], 'chaque <script> de telephone.html a son entrée dans phone-remote.ts');
});

test('bouton Retour du téléphone : chargé avant telephone.js, après les vues qu’il reprend', () => {
  const at = (name: string) => page.indexOf(`<script src="${name}"></script>`);
  assert.ok(at('telephone-retour.js') > -1, 'telephone-retour.js chargé par la page');
  for (const before of ['telephone-community.js', 'telephone-groupes.js', 'telephone-jukebox.js']) assert.ok(at(before) < at('telephone-retour.js'), `${before} avant telephone-retour.js`);
  // Avant telephone.js : son history.replaceState (clé de session) passe déjà par le module.
  assert.ok(at('telephone-retour.js') < at('telephone.js'), 'telephone-retour.js avant telephone.js');
});

test('bouton Retour du téléphone : chaque bouton de retour de la page est repris', () => {
  // Les boutons de retour de la page (« …-back », « …-up ») : un nouveau, oublié ici, laisserait Retour quitter la page.
  const backs = [...page.matchAll(/\sid="([a-z-]+-(?:back|up))"/g)].map((m) => m[1]);
  assert.ok(backs.length >= 4, `boutons de retour relevés : ${backs.join(', ')}`);
  assert.deepEqual(backs.filter((id) => !retour.includes(`'${id}'`)), [], 'chacun repris par telephone-retour.js (et suivi pour poser la garde)');
  // Les autres niveaux : la feuille, l'entrée de retour d'un écran de la borne, l'onglet de départ.
  assert.match(retour, /getElementById\('sheet'\)/, 'une feuille ouverte se ferme');
  assert.match(retour, /#entries-list \.entry\.back/, 'l’entrée de retour d’un écran de la borne');
  assert.match(retour, /setView\('list'\)/, 'un autre onglet ramène à l’Écran');
});
