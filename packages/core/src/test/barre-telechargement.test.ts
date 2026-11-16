// Téléchargement d'une partie attendue (fenêtre « Récupérer ») : la partie le montre elle-même,
// pas seulement le message en tête de l'écran (16/11/2026 : la carte de la table restait
// « Attendu » pendant que le fichier arrivait). Barre verte des Téléchargements, chiffres dessous.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { menuRenderer, APP } from './menu-renderer';

function state(library: Record<string, unknown>) {
  return { role: 'playfield', phase: 'library', help: false, count: 1, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [], nav: {}, library: { screen: 'custom', heading: 'Écran', back: 'Retour', hint: '', sections: [], cursor: 0, actions: [{ label: 'A' }, { label: 'Retour' }], ...library } };
}
const thumb = { kind: 'fallback', rotation: 0, text: '' };

test('carte en téléchargement : barre verte remplie au pourcentage, chiffres dessous ; hachurée sans taille', () => {
  const { document, send } = menuRenderer();
  send(state({ media: { cards: [{ action: 0, title: 'Table', state: { label: 'Téléchargement en cours', tone: 'ok' }, transfer: { value: 0.92, tone: 'ok', text: '92 % · 273 Mo sur environ 295 Mo' }, thumb }] } }));
  const bar = document.querySelector('.media-card .lib-row-progress');
  assert.ok(bar, 'la barre est sur la carte');
  assert.ok(bar.classList.contains('tone-ok'), 'verte');
  assert.equal((bar.querySelector('span') as unknown as { style: { width: string } }).style.width, '92%');
  assert.ok([...document.querySelectorAll('.media-card .media-facts')].some((d) => d.textContent?.includes('92 %')), 'les chiffres sous la barre');
  send(state({ media: { cards: [{ action: 0, title: 'Table', transfer: { tone: 'ok' }, thumb }] } }));
  assert.ok(document.querySelector('.media-card .lib-row-progress.unknown'), 'taille non annoncée : hachurée');
});

test('ligne en téléchargement (liste d’attente, parties du jeu) : la même barre verte', () => {
  const { document, send } = menuRenderer();
  send(state({ sections: [{ rows: [{ text: 'Table', detail: '92 %', badges: ['Téléchargement en cours'], tone: 'ok', progress: { value: 0.92, tone: 'ok' }, action: 0, pick: true }] }] }));
  const bar = document.querySelector('.lib-row-progress.tone-ok');
  assert.ok(bar, 'barre verte sur la ligne');
});

test('chaque écran qui montre une partie attendue lit son téléchargement en cours', () => {
  const src = (f: string) => fs.readFileSync(path.join(APP, 'src', f), 'utf8');
  const catalog = src('catalog.ts');
  // Carte de « Ce qu'il faut », ligne de la liste d'attente.
  assert.ok((catalog.match(/transferOf\((item|i)\.id\)/g) ?? []).length >= 2, 'catalog.ts : carte et liste d’attente');
  // La progression de « Récupérer » est rattachée à l'élément pour lequel la page est ouverte.
  assert.match(catalog, /transfers\.set\(filename, \{ item, progress \}\)/);
  assert.match(catalog, /transfers\.delete\(filename\)/, 'un échec retire la barre');
  assert.match(catalog, /transfers\.delete\(facts\.filename\)/, 'un fichier reçu retire la barre');
  // Parties du jeu d'une table installée : la ligne et la fiche de la partie.
  assert.ok((src('game-parts.ts').match(/ctx\.catalog\.transferOf\(item\.id\)/g) ?? []).length >= 2, 'game-parts.ts : ligne et fiche');
});
