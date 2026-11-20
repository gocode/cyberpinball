// Éditions des versions dans la liste du catalogue (PinCab, 20/11/2026) : la Galaxy Edition de
// JP's Space Cadet n'a pas de jeu à elle chez VPS, c'est une version du jeu. « Space Cadet » ne la
// montrait pas, « galaxy edition » ne trouvait rien, et le joueur a installé une autre version.
// Invariant : toute version qui porte une édition est atteignable depuis la liste, par le nom du
// jeu comme par le nom de l'édition. Sur des jeux inventés ; sur la vraie base VPS aussi quand
// CYBERPINBALL_VPSDB donne le chemin d'un vpsdb.json.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { test } from 'node:test';
import { catalog, catalogLines, gameEditions, quickNeeds, requirements, tableVersions, versionForText, type CatalogLine } from '../acquisition';
import { createVpsDb, editionMatch, vpsWords, type VpsDb, type VpsGame, type VpsTableFile } from '../vps';

let n = 0;
const file = (extra: Partial<VpsTableFile> = {}): VpsTableFile => ({ id: `v${++n}`, tableFormat: 'VPX', authors: ['Auteur'], urls: [{ url: `https://vpuniverse.com/files/file/${n}-x/` }], updatedAt: n, ...extra });

const MICROSOFT: VpsGame = { id: 'ms', name: 'Space Cadet', manufacturer: 'Microsoft', year: 1995, type: 'SS', tableFiles: [file(), file()] };
const GALAXY = file({ edition: 'Galaxy Edition', version: '1.2', features: ['MOD', 'incl. PuP'], updatedAt: 1 });
const FAMILY = file({ edition: 'Family Edition', version: '1.0.0', updatedAt: 2 });
const JP: VpsGame = { id: 'jp', name: "JP's Space Cadet", manufacturer: 'Original', year: 2021, type: 'SS', tableFiles: [file({ version: '7.0', updatedAt: 9 }), GALAXY, FAMILY, file(), file()] };
const GALAXY_SEGA: VpsGame = { id: 'gs', name: 'Galaxy', manufacturer: 'Sega', year: 1973, type: 'EM', tableFiles: [file(), file(), file()] };
const TEAMS = ['Seahawks', 'Giants', 'Raiders', 'Falcons', 'Bears'];
const NFL: VpsGame = { id: 'nfl', name: 'NFL', manufacturer: 'Stern', year: 2001, type: 'SS', tableFiles: [file(), ...TEAMS.map((t) => file({ edition: `${t} Edition` })), file({ edition: 'Seahawks Superbowl Edition' })] };
const DEADPOOL: VpsGame = { id: 'dp', name: "JP's Deadpool", manufacturer: 'Original', year: 2018, type: 'SS', tableFiles: [file(), file({ edition: 'LE' })] };
const TAF: VpsGame ={ id: 'taf', name: 'The Addams Family', manufacturer: 'Bally', year: 1992, type: 'SS', tableFiles: [file(), file({ edition: 'B&W Edition' }), file({ edition: 'Ultimate Pro' }), file({ edition: 'Ultimate Pro', updatedAt: 999 })] };
const FP: VpsGame = { id: 'fp', name: 'Retroflair', manufacturer: 'Original', year: 2020, type: 'SS', tableFiles: [file({ tableFormat: 'FP', edition: 'BAM Edition' })] };
const DB = createVpsDb([MICROSOFT, JP, GALAXY_SEGA, NFL, DEADPOOL, TAF, FP]);

const lines = (db: VpsDb, text: string) => catalogLines(catalog(db, { text }, new Set()), text);
const show = (list: CatalogLine[]) => list.map((l) => (l.version ? `  ${l.game.name}: ${l.version.edition}` : l.game.name));

test('« space cadet » montre la Galaxy Edition dans la liste, juste sous son jeu, et y mène (sa version)', () => {
  const list = lines(DB, 'space cadet');
  const at = list.findIndex((l) => l.game.id === 'jp' && !l.version);
  assert.ok(at >= 0, show(list).join('\n'));
  const editions = list.slice(at + 1, at + 3);
  assert.deepEqual(editions.map((l) => l.version?.edition).sort(), ['Family Edition', 'Galaxy Edition'], show(list).join('\n'));
  assert.equal(editions.find((l) => l.version?.edition === 'Galaxy Edition')!.version!.id, GALAXY.id);
});

test('le nom de l’édition seul trouve le jeu, et la met en tête de ses éditions', () => {
  for (const text of ['galaxy edition', 'Galaxy Edition', 'space cadet galaxy', 'Space Cadet Galaxy Edition', "JP's Space Cadet: Galaxy Edition"]) {
    const list = lines(DB, text);
    assert.equal(list[0]!.game.id, 'jp', `${text} :\n${show(list).join('\n')}`);
    assert.equal(list[1]!.version?.id, GALAXY.id, `${text} :\n${show(list).join('\n')}`);
  }
  // Un mot de l'édition : le jeu est trouvé, après ceux dont c'est le titre.
  const galaxy = lines(DB, 'galaxy');
  assert.ok(galaxy.some((l) => l.version?.id === GALAXY.id), show(galaxy).join('\n'));
  assert.equal(versionForText(JP, 'galaxy')?.id, GALAXY.id);
  assert.equal(versionForText(JP, 'space cadet'), undefined);
});

test('editionMatch : un mot propre à l’édition est cité, et aucun mot étranger', () => {
  assert.equal(editionMatch("JP's Space Cadet", 'Galaxy Edition', 'space cadet galaxy edition'), 1);
  assert.equal(editionMatch("JP's Space Cadet", 'Galaxy Edition', 'galaxy edition'), 0.85);
  assert.equal(editionMatch("JP's Space Cadet", 'Galaxy Edition', 'space cadet'), 0);
  assert.equal(editionMatch("JP's Space Cadet", 'Galaxy Edition', 'galaxy quest'), 0);
  assert.equal(editionMatch('NFL', 'Seahawks Superbowl Edition', 'seahawks'), 0.7);
  assert.equal(editionMatch('NFL', 'Seahawks Edition', 'seahawks'), 0.85);
  // Une édition faite d'un petit mot (« LE », Limited Edition) se cherche quand même ; ailleurs, « le » ne compte pas.
  assert.equal(editionMatch("JP's Deadpool", 'LE', 'le'), 0.85);
  assert.equal(editionMatch("JP's Space Cadet", 'Galaxy Edition', 'le galaxy'), 0.85);
});

test('une édition par ligne (la version la plus récente qui la porte), éditions FP comprises', () => {
  const pro = gameEditions(TAF, tableVersions(TAF)).filter((e) => e.edition === 'Ultimate Pro');
  assert.equal(pro.length, 1);
  assert.equal(pro[0]!.version.updatedAt, 999);
  assert.ok(lines(DB, 'bam edition').some((l) => l.game.id === 'fp' && l.version?.edition === 'BAM Edition'));
  // Sans recherche : les jeux seuls (leurs éditions sont nommées sur leur carte).
  assert.ok(catalogLines(catalog(DB, {}, new Set()), undefined).every((l) => !l.version));
});

test('installation rapide d’une édition sans ROM connue de VPS : rien ne la bloque', () => {
  const needs = requirements(JP, GALAXY, { screens: { backglass: true, dmd: 'full', topper: false }, roms: new Set() });
  const rom = needs.find((n) => n.kind === 'rom')!;
  assert.equal(rom.required, false, 'le script dira la ROM une fois la table installée');
  assert.deepEqual(quickNeeds(needs).blocked, []);
  assert.deepEqual(quickNeeds(needs).get.map((n) => n.kind), ['table']);
  // Une ROM nommée par VPS mais sans lien reste, elle, indispensable et introuvable.
  const named: VpsGame = { ...JP, romFiles: [{ id: 'r', version: 'jp_rom' }] };
  assert.deepEqual(quickNeeds(requirements(named, GALAXY, { screens: { backglass: true, dmd: 'full', topper: false }, roms: new Set() })).blocked.map((n) => n.kind), ['rom']);
});

/**
 * L'invariant, sur toute une base : chaque édition d'une version au catalogue a sa ligne quand on
 * cherche le nom du jeu, et quand on cherche le nom de l'édition (sauf édition sans mot à elle).
 */
function unreachable(db: VpsDb): string[] {
  const misses: string[] = [];
  for (const game of db.games) {
    const versions = tableVersions(game);
    if (!versions.length) continue;
    for (const { edition } of gameEditions(game, versions)) {
      const has = (text: string) => lines(db, text).some((l) => l.game.id === game.id && l.version?.edition?.trim().toLowerCase() === edition.toLowerCase());
      if (!has(game.name)) misses.push(`« ${game.name} » ne montre pas ${edition}`);
      const title = new Set(vpsWords(game.name));
      const own = vpsWords(edition).filter((w) => !title.has(w) && w !== 'edition' && !['the', 'of', 'a', 'an', 'and'].includes(w));
      if (own.length && !has(edition)) misses.push(`« ${edition} » ne mène pas à ${game.name}`);
    }
  }
  return misses;
}

test('invariant : chaque édition est atteignable par le nom du jeu et par son nom (jeux inventés)', () => {
  assert.deepEqual(unreachable(DB), []);
});

const REAL = process.env.CYBERPINBALL_VPSDB;
test('invariant sur la vraie base VPS (CYBERPINBALL_VPSDB)', { skip: !REAL || !fs.existsSync(REAL) ? 'CYBERPINBALL_VPSDB absent' : false }, () => {
  const db = createVpsDb(JSON.parse(fs.readFileSync(REAL!, 'utf8')) as VpsGame[]);
  const misses = unreachable(db);
  assert.deepEqual(misses, [], misses.slice(0, 40).join('\n'));
});
