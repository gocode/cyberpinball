/**
 * Cartes de joueurs de la Communauté (hub.css, hub-layout-people) : la carte est une grille « pastille |
 * texte | boutons ». Avec deux boutons à droite (« Voir le profil », « Ajouter en ami »), la colonne du
 * texte tombait à zéro : le pseudo disparaissait et son niveau passait sur les boutons (23/11/2026).
 * L'invariant : plusieurs boutons prennent leur rangée sous le texte, jamais la colonne de droite.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const RENDERER = path.join(__dirname, '..', '..', '..', '..', 'app', 'renderer');
const css = fs.readFileSync(path.join(RENDERER, 'hub.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Le corps de la première règle dont le sélecteur est exactement `selector`. */
function rule(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
}

test('cartes de joueurs : plusieurs boutons passent sous le texte, pas à droite du pseudo', () => {
  const several = rule('.hub-card.hub-layout-people .hub-buttons:has(> .hub-button + .hub-button)');
  assert.ok(several, 'une règle pour les cartes à plusieurs boutons');
  assert.match(several, /grid-column:\s*2\s*\/\s*-1/, 'sur la largeur du texte, pas dans la colonne de droite');
  assert.doesNotMatch(several, /grid-row:\s*1\b/, 'pas sur la rangée du pseudo');
  // Un seul bouton (carte d'ami) : toujours à droite, sur la rangée du pseudo.
  const single = rule('.hub-card.hub-layout-people .hub-buttons');
  assert.match(single ?? '', /grid-column:\s*3/);
});

test('cartes de joueurs : le « +25 XP » n’est pas plus petit que son bouton', () => {
  const xp = rule('.hub-button-xp');
  assert.ok(xp);
  assert.doesNotMatch(xp, /font-size:\s*0\.\d+em/, 'sous 20 px à la borne');
});
