// Recherche de la gestion des retours (demande du 26/11/2026) : dans les rapports privés, la recherche ne
// trouvait que le numéro de borne. Elle cherche désormais dans le texte et le titre, le pseudo du joueur,
// la table, l'empreinte, et dans les propositions (titre, description, auteur).
// Invariants : tous les mots doivent figurer, sans tenir compte des accents ni de la casse ; une
// recherche vide garde tout ; la page charge le module avant son script ; les deux listes s'en servent.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const DIR = path.join(REPO_ROOT, 'interne', 'gestion-retours');
const present = fs.existsSync(path.join(DIR, 'recherche.js'));

test('gestion des retours : la recherche trouve texte, titre, pseudo et table des rapports', { skip: !present && 'démonstration interne absente' }, () => {
  const r = require(path.join(DIR, 'recherche.js'));
  const env = {
    kind: 'report',
    text: 'Le DMD reste noir\n\nÉcran éteint après la mise à jour.',
    table: 'Glass Lagoon',
    who: { name: 'Pilote Néon', country: 'FR' },
    borne: 'Xa81kQ02pLmn',
    signature: 'diagnostic:dmd-noir:glass-lagoon',
  };
  const champs = r.champsRapport(env, ['rapA000004']);
  assert.ok(r.correspond('dmd noir', champs), 'titre');
  assert.ok(r.correspond('ecran eteint', champs), 'description, sans accents');
  assert.ok(r.correspond('neon', champs), 'pseudo du joueur, sans accent');
  assert.ok(r.correspond('PILOTE lagoon', champs), 'pseudo et table, casse ignorée');
  assert.ok(r.correspond('', champs), 'recherche vide');
  assert.ok(!r.correspond('dmd bleu', champs), 'tous les mots doivent figurer');
  assert.ok(!r.correspond('x', r.champsRapport(undefined)), 'enveloppe absente');

  const p = { id: 'p1', title: 'Mode nuit', text: 'Baisser la lumière', author: { name: 'Lucie', country: 'BE' } };
  assert.ok(r.correspond('lucie', r.champsProposition(p)), 'auteur d’une proposition');
  assert.ok(r.correspond('lumiere nuit', r.champsProposition(p)));
});

test('gestion des retours : la page charge la recherche et les deux listes s’en servent', { skip: !present && 'démonstration interne absente' }, () => {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  assert.ok(html.indexOf('src="recherche.js"') >= 0 && html.indexOf('src="recherche.js"') < html.indexOf('src="app.js"'));
  const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
  assert.match(app, /recherche\.correspond\(f\.q, recherche\.champsProposition\(p\)\)/);
  assert.match(app, /recherche\.correspond\(q, recherche\.champsRapport\(env,/);
});
