// Ce que VPS annonce avec une table (« incl. PuP », « incl. B2S », « incl. ROM ») n'est cru que
// jusqu'à la réception de la table (21/11/2026). La Galaxy Edition de JP's Space Cadet, « incl. PuP »
// chez VPS, est arrivée sans son pack (1,2 Go, à part sur mega.nz) : « Ce qu'il faut » le disait
// « fourni avec la table », l'installation rapide ne l'a jamais récupéré, « Ce qu'il manque pour
// jouer » n'avait aucun fichier à proposer, et la table, dont tout l'afficheur est le pack,
// paraissait figée. Le fichier arrivé alors qu'une autre page était ouverte restait « de côté ».
// Invariant : une partie annoncée que l'archive reçue n'apporte pas n'est jamais « fournie ».

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { claimedPart, quickNeeds, receivedParts, requirements, type NeedKind } from '../acquisition';
import { gameSources } from '../journey';
import { createVpsDb, type VpsGame, type VpsTableFile } from '../vps';
import { REPO_ROOT } from './i18n-scan';

const screens = { backglass: true, dmd: 'full' as const, topper: false };
const MEGA = 'https://mega.nz/file/abc#def';
const GALAXY: VpsTableFile = { id: 'galaxy', tableFormat: 'VPX', edition: 'Galaxy Edition', version: '1.2', features: ['MOD', 'incl. PuP'], authors: ['JPSalas'], urls: [{ url: 'https://vpuniverse.com/files/file/24068-x/' }], updatedAt: 1 };
const JP: VpsGame = {
  id: 'jp',
  name: "JP's Space Cadet",
  manufacturer: 'Original',
  year: 2021,
  type: 'SS',
  tableFiles: [GALAXY],
  pupPackFiles: [{ id: 'pack', version: '1.0', urls: [{ url: MEGA }] }],
  b2sFiles: [{ id: 'b2s', features: ['FullDMD'], urls: [{ url: 'https://www.vpforums.org/index.php?showfile=17896' }] }],
};

const need = (game: VpsGame, version: VpsTableFile, kind: NeedKind, tableParts?: NeedKind[]) =>
  requirements(game, version, { screens, roms: new Set(), ...(tableParts ? { tableParts } : {}) }).find((n) => n.kind === kind);

test('avant la réception, le PuP-Pack annoncé est « fourni », mais dit qu’il sera vérifié', () => {
  const pup = need(JP, GALAXY, 'pup')!;
  assert.equal(pup.state, 'included');
  assert.match(pup.detail, /vérifié à sa réception/);
  assert.deepEqual(quickNeeds(requirements(JP, GALAXY, { screens, roms: new Set() })).get.map((n) => n.kind), ['table', 'b2s']);
});

test('table reçue sans son pack : le PuP-Pack devient indispensable et entre dans l’installation rapide', () => {
  const pup = need(JP, GALAXY, 'pup', ['table'])!;
  assert.equal(pup.state, 'todo');
  assert.equal(pup.required, true);
  assert.deepEqual(pup.files.map((f) => f.id), ['pack']);
  assert.ok(quickNeeds(requirements(JP, GALAXY, { screens, roms: new Set(), tableParts: ['table'] })).get.some((n) => n.kind === 'pup'));
});

test('table reçue avec son pack : « fourni avec la table », rien à récupérer', () => {
  const pup = need(JP, GALAXY, 'pup', ['table', 'pup'])!;
  assert.equal(pup.state, 'included');
  assert.equal(pup.detail, 'fourni avec la table');
});

test('pack annoncé, absent de l’archive, sans lien connu : signalé, ne bloque rien', () => {
  const pup = need({ ...JP, pupPackFiles: [] }, GALAXY, 'pup', ['table'])!;
  assert.equal(pup.state, 'unavailable');
  assert.equal(pup.required, false);
  assert.deepEqual(quickNeeds(requirements({ ...JP, pupPackFiles: [] }, GALAXY, { screens, roms: new Set(), tableParts: ['table'] })).blocked, []);
});

test('invariant : aucune partie annoncée et absente de l’archive reçue n’est dite fournie (fronton, ROM, PuP-Pack)', () => {
  const claims: [string, NeedKind][] = [
    ['incl. B2S', 'b2s'],
    ['incl. ROM', 'rom'],
    ['incl. PuP', 'pup'],
  ];
  const version: VpsTableFile = { ...GALAXY, features: claims.map(([f]) => f) };
  const game: VpsGame = { ...JP, tableFiles: [version], romFiles: [{ id: 'r', version: 'jp_rom', urls: [{ url: 'https://www.vpforums.org/index.php?showfile=1' }] }] };
  for (const [feature, kind] of claims) {
    assert.equal(claimedPart(version, feature, kind, ['table']), 'missing');
    assert.notEqual(need(game, version, kind, ['table'])?.state, 'included', `${kind} annoncé, absent : pas « fourni »`);
    assert.equal(need(game, version, kind, ['table', kind])?.state, 'included', `${kind} présent dans l’archive : fourni`);
  }
});

test('receivedParts : la partie principale seule, celles d’une archive complète, rien quand le contenu est inconnu', () => {
  assert.deepEqual(receivedParts({ content: 'table' }), ['table']);
  assert.deepEqual(receivedParts({ content: 'table', parts: ['table', 'pup'] }), ['table', 'pup']);
  assert.equal(receivedParts({ content: 'unknown' }), undefined);
  assert.equal(receivedParts(undefined), undefined);
});

test('« Ce qu’il manque pour jouer » propose le pack à part d’une table installée « incl. PuP »', () => {
  const sources = gameSources(createVpsDb([JP]), 'jp', 'pup', screens, GALAXY.id);
  assert.deepEqual(sources.map((s) => s.url), [MEGA]);
});

test('un fichier reçu revient à l’élément pour lequel la page était ouverte quand il a commencé', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'catalog.ts'), 'utf8');
  // L'élément noté au début du téléchargement passe avant celui de la fenêtre au moment où il finit.
  assert.match(src, /startedFor\.get\(facts\.filename\) \?\? transfers\.get\(facts\.filename\)\?\.item \?\? windowItem/);
  assert.doesNotMatch(src, /placeDownload\([^)]*windowItem/, 'placeDownload ne lit plus la fenêtre au moment de la réception');
  const win = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'acquire-window.ts'), 'utf8');
  assert.match(win, /events\.started\?\.\(filename\)/);
});
