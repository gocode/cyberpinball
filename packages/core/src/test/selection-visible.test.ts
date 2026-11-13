// Choix courant visible partout (13/11/2026) : sur le PinCab, les quatre tuiles du haut de la gestion
// du Juke-box (Importer, Nouvelle playlist, Compte YouTube, Réglages) ne montraient pas la sélection :
// la règle de la section (.lib-jukebox .kind-jb-global .lib-row, plus précise) rendait son fond et
// sa bordure à la ligne choisie, et seul l'éclat passait.
//
// Invariant de la feuille de style : toute règle qui pose un fond ou une bordure sur les lignes
// d'une section a sa variante .lib-row.selected. Le garde-fou de mise en page (layout-check.ts,
// « choix courant invisible ») le vérifie aussi sur chaque écran rendu des essais hors écran.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP } from './menu-renderer';

/**
 * Sections d'information : leurs lignes n'ont aucune action, rien ne s'y choisit (bandeau du dernier
 * événement, place sur le disque, notes, attente, lien analysé, compte à rebours d'une partie entre amis).
 */
const INFORMATION = new Set([
  '.lib-jukebox .kind-jb-flash .lib-row',
  '.lib-jukebox .kind-jb-disk .lib-row',
  '.lib-jukebox .kind-jb-notes .lib-row',
  '.lib-jukebox .kind-jb-wait .lib-row',
  '.lib-jukebox .kind-jb-link .lib-row',
  '.lib-countdown .kind-countdown .lib-row',
]);

test('feuille de style : une section qui habille ses lignes habille aussi la ligne choisie', () => {
  const css = fs.readFileSync(path.join(APP, 'renderer', 'library.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const selected = new Set<string>();
  const dressed: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2]!;
    const dresses = /(^|[\s;])(background|background-color|border|border-color|border-left|border-left-color)\s*:/.test(body);
    for (const raw of m[1]!.split(',')) {
      const sel = raw.trim();
      if (/\.lib-row\.selected\b/.test(sel)) selected.add(sel.replace(/\.lib-row\.selected.*$/, '.lib-row'));
      else if (dresses && /\S+\s+\.lib-row$/.test(sel) && !/^body\.|:hover|\.mouse/.test(sel)) dressed.push(sel);
    }
  }
  assert.ok(dressed.includes('.lib-jukebox .kind-jb-global .lib-row'), 'le relevé voit bien les tuiles du Juke-box');
  assert.deepEqual([...new Set(dressed.filter((s) => !selected.has(s) && !INFORMATION.has(s)))], [], 'ajouter la variante .lib-row.selected (trait et aplat verts) de chacune');
});

test('garde-fou de mise en page : un choix courant semblable à ses voisines est signalé', () => {
  const src = fs.readFileSync(path.join(APP, 'src', 'layout-check.ts'), 'utf8');
  assert.match(src, /choix courant invisible/);
});
