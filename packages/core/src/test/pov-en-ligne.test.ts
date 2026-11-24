// Chercher un POV en ligne (24/11/2026) : l'écran « Point de vue » d'une table propose, à côté de « Importer un POV… »
// (disque dur), la même recherche que pour les autres parties : la base des tables (VPS : 766 jeux sur 2 685 ont un
// POV, relevé du 24/11/2026), VPUniverse (catégorie « VPX POV »), VPForums, Téléchargements et le web. Une source qui
// n'a rien pour le jeu le dit. Rien n'est cherché à part : c'est la partie « Point de vue » de « Parties du jeu ».

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { emptySources } from '../partsources';
import { hitPart, partOffers, partSearchUrl, partSources, partWebFiles, partWebQuery, PART_SITE_NODES } from '../gameparts';
import type { SiteHit } from '../mediasites';
import { createVpsDb, type VpsGame } from '../vps';

const APP = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
const read = (file: string) => fs.readFileSync(path.join(APP, file), 'utf8');

const AFM: VpsGame = {
  id: 'afm',
  name: 'Attack from Mars',
  manufacturer: 'Bally',
  year: 1995,
  type: 'SS',
  povFiles: [
    { id: 'p1', version: '10.8 Cabinet POV', urls: [{ url: 'https://bit.ly/povs-afm' }] },
    { id: 'p2', version: 'ancien', urls: [{ url: 'https://vpuniverse.com/files/file/1-afm-pov/', broken: true }] },
  ],
};
const NO_POV: VpsGame = { id: 'nopov', name: 'Sans Point de Vue', manufacturer: 'Bally', year: 1990, type: 'SS', tableFiles: [{ id: 't1', tableFormat: 'VPX', urls: [{ url: 'https://vpuniverse.com/files/file/2-x/' }] }] };
const vps = createVpsDb([AFM, NO_POV]);

const hit = (title: string, extra: Partial<SiteHit> = {}): SiteHit => ({ site: 'vpuniverse', id: title, url: `https://vpuniverse.com/files/file/${title.length}-x/`, title, ...extra });

test('un POV se cherche dans toutes les sources, comme les autres parties', () => {
  assert.deepEqual([...partSources('pov')].sort(), ['downloads', 'vpforums', 'vps', 'vpuniverse', 'web']);
  // VPUniverse : sa catégorie des POV ; le web : le mot « pov » après le titre.
  assert.deepEqual(PART_SITE_NODES.pov, ['68']);
  assert.match(partSearchUrl('vpuniverse', AFM.name, 'pov'), /nodes=68\b/);
  assert.equal(partWebQuery('Attack from Mars (Bally 1995)', 'pov'), 'Attack from Mars pov vpinball');
});

test('la base des tables : les POV du jeu, liens vivants seulement ; un jeu sans POV n’en a aucun', () => {
  assert.deepEqual(partWebFiles(AFM, 'pov').map((f) => f.id), ['p1']);
  assert.deepEqual(partWebFiles(NO_POV, 'pov'), []);
  assert.deepEqual(partWebFiles(undefined, 'pov'), []);
});

test('les résultats des sites : seuls les POV du jeu sont proposés', () => {
  assert.equal(hitPart(hit('Attack from Mars', { category: { id: '68', label: 'VPX POV (Point of View) Physics Sets' } })), 'pov');
  assert.equal(hitPart({ ...hit('Attack from Mars POV 10.8 Cabinet'), site: 'vpforums' }), 'pov');
  assert.equal(hitPart({ ...hit('Attack from Mars directB2S'), site: 'vpforums' }), 'b2s');
  const hits = [
    hit('Attack from Mars', { category: { id: '68', label: 'VPX POV (Point of View) Physics Sets' }, downloads: 300 }),
    hit('Attack from Mars PuP-Pack', { category: { id: '120', label: 'PuP-Packs' }, downloads: 9000 }),
  ];
  const offers = partOffers(hits, 'pov', AFM.name, AFM, vps);
  assert.deepEqual(offers.map((o) => o.hit.title), ['Attack from Mars']);
});

test('une source qui n’a pas de POV pour le jeu le dit, sans forcer la recherche', () => {
  // La base n’en connaît pas et VPForums non plus ; VPUniverse en propose : seules les deux premières sont dites vides.
  assert.deepEqual(emptySources('pov', { game: true, vpsFiles: 0, sites: { vpforums: 0, vpuniverse: 2 } }), ['vps', 'vpforums']);
  // Un site qui n'a pas encore répondu (ou veut une connexion) n'est jamais dit vide.
  assert.deepEqual(emptySources('pov', { game: true, vpsFiles: 1, sites: { vpforums: 0 } }), ['vpforums']);
  assert.deepEqual(emptySources('pov', { game: true, vpsFiles: 1, sites: {} }), []);
  // Le jeu de la base n'est pas connu : aucun jugement sur la base.
  assert.deepEqual(emptySources('pov', { game: false, vpsFiles: 0, sites: {} }), []);
  // Réglages propres (.ini) : aucun site n'en range.
  assert.deepEqual(emptySources('ini', { game: true, vpsFiles: 0, sites: { vpforums: 0, vpuniverse: 0 } }), []);
});

test('l’écran « Point de vue » mène à la partie POV de « Parties du jeu », à côté de l’import depuis le disque', () => {
  const screen = read('table-pov.ts');
  assert.match(screen, /label: t\('Importer un POV…'\)/, 'le disque dur reste proposé');
  assert.match(screen, /label: t\('Chercher un POV en ligne…'\)/);
  assert.match(screen, /ctx\.findOnline!\(table,/);
  // Le branchement : la partie POV, ouverte depuis le Point de vue, y revient avec « Retour ».
  assert.match(read('library.ts'), /findOnline: \(table, back\) => gameParts\.openPartFrom\(table, 'pov', back\)/);
  const parts = read('game-parts.ts');
  assert.match(parts, /openPartFrom,/);
  assert.match(parts, /const back = elsewhere \? leaveElsewhere : \(\) => open\(table, from\)/);
  // La recherche libre sur le web reste dans l'écran de la partie (addscreens.test.ts : une seule issue par écran).
  assert.match(parts, /webAction\('parts\.part', \{ query: partWebQuery\(titleOf\(table\), part\)/);
});
