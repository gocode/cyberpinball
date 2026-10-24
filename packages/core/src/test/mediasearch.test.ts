// Recherche approfondie des médias d'un jeu et propositions pour chaque média :
// initiales, mots approchés, autres éditions (vps.ts), informations écrites dans le
// .vpx (vpxinfo.ts), pistes et raisons (mediasearch.ts), choix de VPinMediaDB et de
// la borne (mediachoices.ts), provenance notée à l'enregistrement (mediaedit.ts).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { isAudioFile, localMediaChoices, sameFileContent, mediaDbChoices, mergeMediaChoices, vpsImageChoices, vpsMusicChoices } from '../mediachoices';
import { matchMediaDb, parseMediaDbIndex, type MediaDb } from '../mediadb';
import { emptyMediaDraft, planMediaChanges } from '../mediaedit';
import { applyOps } from '../fileops';
import { mediaMemory } from '../medias';
import { deepSearchGames, ipdbIdsIn, mediaDbLeads, tableClues } from '../mediasearch';
import { readInfo, scanTables, type TableEntry } from '../tables';
import { createVpsDb, matchVps, searchVps, vpsSiblings, type VpsGame } from '../vps';
import { readVpxImages, readVpxScreenshot, readVpxTableInfo } from '../vpxinfo';

// Extrait de la base VPS, recopié à la main (identifiants, noms, fabricants, années, auteurs).
const vpx = (id: string, authors: string[], version: string) => ({ id, authors, version, tableFormat: 'VPX' });
const GAMES: VpsGame[] = [
  { id: 'q86TI2sS', name: 'Guardians of the Galaxy (Pro)', manufacturer: 'Stern', year: 2017, ipdbUrl: 'https://www.ipdb.org/machine.cgi?id=6474', tableFiles: [vpx('pq6RYRws', ['Daphishbowl', 'Pincredibles'], '2.1.1')] },
  { id: 'gotgprem', name: 'Guardians of the Galaxy (Premium)', manufacturer: 'Stern', year: 2017 },
  { id: '671IjPCYuN', name: 'Guardians of the Galaxy Trilogy', manufacturer: 'Original', year: 2023, tableFiles: [vpx('trilogy', ['Somebody'], '1.0')] },
  { id: 'CDDUz9NN', name: 'Galaxie', manufacturer: 'Gottlieb', year: 1971, tableFiles: [vpx('galaxie', ['Loserman76'], '1.0')] },
  { id: '9jmXW_kf', name: 'Galaxy', manufacturer: 'Stern', year: 1980, tableFiles: [vpx('galaxy', ['Bord'], '1.0')] },
  { id: 'aT_GONvw', name: 'The Addams Family', manufacturer: 'Bally', year: 1992, romFiles: [{ version: 'taf_l7' }], tableFiles: [vpx('taf', ['VPW'], '2.4.41')] },
  { id: 'Bl366m1T', name: 'Teenage Mutant Ninja Turtles', manufacturer: 'Data East', year: 1991, tableFiles: [vpx('tmnt', ['VPW'], '1.0')] },
  { id: 'hateful8', name: 'The Hateful Eight', manufacturer: 'Original', year: 2021, tableFiles: [vpx('h8', ['Someone'], '1.0')] },
  { id: 'BunvWvh9', name: 'Terminator 2 - Judgment Day', manufacturer: 'Williams', year: 1991, ipdbUrl: 'http://www.ipdb.org/machine.cgi?id=2524', romFiles: [{ version: 't2_l8' }], tableFiles: [vpx('3a3JZPkj', ['G5k', 'VPW'], '1.25')] },
  { id: 'alien2', name: 'Alien 2', manufacturer: 'Original', year: 2023, tableFiles: [vpx('a2', ['Someone'], '1.0')] },
];
const db = createVpsDb(GAMES);
const ids = (list: { game: VpsGame }[]) => list.map((c) => c.game.id);

test('VPS : les initiales du titre écrites dans le nom désignent le jeu (« GOTG », « TMNT »)', () => {
  const gotg = matchVps(db, { names: ['GOTG_2.1.1.vpx'] });
  assert.equal(gotg.candidates[0]!.game.id, 'q86TI2sS');
  assert.equal(gotg.candidates[0]!.how, 'acronym');
  assert.equal(matchVps(db, { names: ['TMNT (Data East 1991).vpx'] }).candidates[0]!.game.id, 'Bl366m1T');
  // Trois lettres : trop de jeux se les partagent, seulement en recherche approfondie.
  assert.deepEqual(matchVps(db, { names: ['TAF_VPW.vpx'] }).candidates, []);
  assert.equal(matchVps(db, { names: ['TAF_VPW.vpx'] }, { deep: true }).candidates[0]!.game.id, 'aT_GONvw');
  // Une lettre et un chiffre : « T2 » pour Terminator 2, en recherche approfondie.
  assert.equal(matchVps(db, { names: ['T2_VPW.vpx'] }, { deep: true }).candidates[0]!.game.id, 'BunvWvh9');
  // « The » n'est pas les initiales de « The Hateful Eight », ni « VPW » celles d'un jeu.
  assert.ok(!ids(matchVps(db, { names: ['The Goonies VPW.vpx'] }, { deep: true }).candidates).includes('hateful8'));
  // Un numéro de version ne désigne aucun jeu (« 2 » d'Alien 2).
  assert.ok(!ids(matchVps(db, { names: ['GOTG_2.1.1.vpx'] }, { deep: true }).candidates).includes('alien2'));
});

test('VPS : en recherche approfondie, un titre traduit retrouve le jeu mot à mot, sans jamais être sûr', () => {
  const m = matchVps(db, { names: ['Gardiens de la galaxie 2.1.1'] }, { deep: true });
  assert.equal(m.confident, false);
  assert.ok(ids(m.candidates).includes('q86TI2sS'));
  assert.equal(m.candidates.find((c) => c.game.id === 'q86TI2sS')!.how, 'words');
  // Hors recherche approfondie : rien, comme avant.
  assert.deepEqual(matchVps(db, { names: ['Gardiens de la galaxie 2.1.1'] }).candidates, []);
});

test('VPS : recherche libre par titre, initiales ou ROM', () => {
  assert.deepEqual(ids(searchVps(db, 'guardians')).slice(0, 3).sort(), ['671IjPCYuN', 'gotgprem', 'q86TI2sS']);
  assert.equal(searchVps(db, 'tmnt')[0]!.game.id, 'Bl366m1T');
  assert.equal(searchVps(db, 't2_l8')[0]!.game.id, 'BunvWvh9');
  assert.deepEqual(searchVps(db, '  '), []);
});

test('VPS : autres éditions du même jeu chez le même fabricant, pas les homonymes', () => {
  assert.deepEqual(ids(vpsSiblings(db, GAMES[0]!).map((game) => ({ game }))), ['gotgprem']);
  assert.deepEqual(vpsSiblings(db, GAMES[2]!), [], 'la trilogie n’est pas une édition du jeu de Stern');
});

// ---------------------------------------------------------------------------
// Fichier composé OLE minimal, comme VPX en écrit : TableInfo et ses flux UTF-16LE, et
// GameStg (GameData, ImageN) si on lui en donne.

function cfb(streams: Record<string, string | Buffer>, game: Record<string, Buffer> = {}): Buffer {
  const SECTOR = 512;
  const FREE = 0xffffffff;
  const END = 0xfffffffe;
  const FATSECT = 0xfffffffd;
  const infoNames = Object.keys(streams);
  const gameNames = Object.keys(game);
  const names = [...infoNames, ...gameNames];
  const data = [
    ...infoNames.map((n) => {
      const v = streams[n]!;
      return Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf16le');
    }),
    ...gameNames.map((n) => game[n]!),
  ];
  // Entrées : racine, TableInfo et ses flux, puis GameStg et ses flux (les petits dans le mini-flux, les gros en secteurs).
  const gameAt = 2 + infoNames.length;
  const entries = gameAt + (gameNames.length ? 1 + gameNames.length : 0);
  const dirSectors = Math.ceil((entries * 128) / SECTOR);
  const mini: Buffer[] = [];
  const miniFat: number[] = [];
  const big: Buffer[] = [];
  const starts: number[] = [];
  let bigSectors = 0;
  for (const d of data) {
    if (d.length < 4096) {
      const first = miniFat.length;
      const count = Math.max(1, Math.ceil(d.length / 64));
      for (let i = 0; i < count; i++) miniFat.push(i === count - 1 ? END : first + i + 1);
      mini.push(Buffer.concat([d, Buffer.alloc(count * 64 - d.length)]));
      starts.push(first);
    } else {
      const count = Math.ceil(d.length / SECTOR);
      starts.push(-1 - bigSectors);
      big.push(Buffer.concat([d, Buffer.alloc(count * SECTOR - d.length)]));
      bigSectors += count;
    }
  }
  const miniStream = Buffer.concat(mini);
  const miniStreamSectors = Math.ceil(miniStream.length / SECTOR);
  const miniFatSectors = Math.max(1, Math.ceil((miniFat.length * 4) / SECTOR));
  // Secteurs : 0 FAT, puis répertoire, mini-FAT, mini-flux, gros flux.
  const dirAt = 1;
  const miniFatAt = dirAt + dirSectors;
  const miniStreamAt = miniFatAt + miniFatSectors;
  const bigAt = miniStreamAt + miniStreamSectors;
  const total = bigAt + bigSectors;
  const fat = new Array<number>(SECTOR / 4).fill(FREE);
  fat[0] = FATSECT;
  const chain = (start: number, count: number) => {
    for (let i = 0; i < count; i++) fat[start + i] = i === count - 1 ? END : start + i + 1;
  };
  chain(dirAt, dirSectors);
  chain(miniFatAt, miniFatSectors);
  chain(miniStreamAt, miniStreamSectors);
  let offset = bigAt;
  for (const b of big) {
    chain(offset, b.length / SECTOR);
    offset += b.length / SECTOR;
  }
  assert.ok(total <= SECTOR / 4, 'une seule FAT suffit pour ce test');

  const header = Buffer.alloc(SECTOR);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x3e, 0x18);
  header.writeUInt16LE(3, 0x1a);
  header.writeUInt16LE(0xfffe, 0x1c);
  header.writeUInt16LE(9, 0x1e);
  header.writeUInt16LE(6, 0x20);
  header.writeUInt32LE(1, 0x2c);
  header.writeUInt32LE(dirAt, 0x30);
  header.writeUInt32LE(4096, 0x38);
  header.writeUInt32LE(miniFatAt, 0x3c);
  header.writeUInt32LE(miniFatSectors, 0x40);
  header.writeUInt32LE(END, 0x44);
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i === 0 ? 0 : FREE, 0x4c + i * 4);

  const dir = Buffer.alloc(dirSectors * SECTOR);
  const entry = (i: number, name: string, type: number, child: number, right: number, start: number, size: number) => {
    const o = i * 128;
    dir.write(`${name}\0`, o, 'utf16le');
    dir.writeUInt16LE((name.length + 1) * 2, o + 0x40);
    dir[o + 0x42] = type;
    dir[o + 0x43] = 1;
    dir.writeUInt32LE(FREE, o + 0x44);
    dir.writeUInt32LE(right, o + 0x48);
    dir.writeUInt32LE(child, o + 0x4c);
    dir.writeUInt32LE(start, o + 0x74);
    dir.writeUInt32LE(size, o + 0x78);
  };
  entry(0, 'Root Entry', 5, 1, FREE, miniStream.length ? miniStreamAt : END, miniStream.length);
  entry(1, 'TableInfo', 1, infoNames.length ? 2 : FREE, gameNames.length ? gameAt : FREE, 0, 0);
  const startOf = (i: number) => (starts[i]! < 0 ? bigAt + (-1 - starts[i]!) : starts[i]!);
  infoNames.forEach((n, i) => entry(2 + i, n, 2, FREE, i + 1 < infoNames.length ? 3 + i : FREE, startOf(i), data[i]!.length));
  if (gameNames.length) {
    entry(gameAt, 'GameStg', 1, gameAt + 1, FREE, 0, 0);
    gameNames.forEach((n, j) => {
      const i = infoNames.length + j;
      entry(gameAt + 1 + j, n, 2, FREE, j + 1 < gameNames.length ? gameAt + 2 + j : FREE, startOf(i), data[i]!.length);
    });
  }
  for (let i = entries; i < dirSectors * 4; i++) {
    dir.writeUInt32LE(FREE, i * 128 + 0x44);
    dir.writeUInt32LE(FREE, i * 128 + 0x48);
    dir.writeUInt32LE(FREE, i * 128 + 0x4c);
  }
  const fatBuf = Buffer.alloc(SECTOR);
  fat.forEach((v, i) => fatBuf.writeUInt32LE(v >>> 0, i * 4));
  const miniFatBuf = Buffer.alloc(miniFatSectors * SECTOR, 0xff);
  miniFat.forEach((v, i) => miniFatBuf.writeUInt32LE(v >>> 0, i * 4));
  return Buffer.concat([header, fatBuf, dir, miniFatBuf, Buffer.concat([miniStream, Buffer.alloc(miniStreamSectors * SECTOR - miniStream.length)]), ...big]);
}

function tmp(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cyberpinball-${name}-`));
}

test('.vpx : informations de la table lues dans TableInfo, petits et gros flux, sans charger le fichier', () => {
  const dir = tmp('vpxinfo');
  const rules = 'Règles. '.repeat(700); // plus de 4 096 octets en UTF-16 : hors du mini-flux
  const file = path.join(dir, 'GOTG_2.1.1.vpx');
  fs.writeFileSync(
    file,
    cfb({
      TableName: 'Guardians Of The Galaxy',
      AuthorName: 'Pincredibles',
      TableVersion: '2.1.1',
      ReleaseDate: '11.06.2022',
      TableDescription: "Laser Mod\r\n'Terminator 2 - IPDB No. 2524\r\n",
      TableRules: rules,
      Inconnu: 'ignoré',
    }),
  );
  const info = readVpxTableInfo(file)!;
  assert.equal(info.name, 'Guardians Of The Galaxy');
  assert.equal(info.author, 'Pincredibles');
  assert.equal(info.version, '2.1.1');
  assert.equal(info.releaseDate, '11.06.2022');
  assert.equal(info.description, "Laser Mod\n'Terminator 2 - IPDB No. 2524");
  assert.equal(info.rules, rules.trim());
  assert.deepEqual(ipdbIdsIn(info), ['2524']);
  // Pas un fichier composé, ou TableInfo absent.
  const bad = path.join(dir, 'texte.vpx');
  fs.writeFileSync(bad, 'pas un .vpx');
  assert.equal(readVpxTableInfo(bad), undefined);
  assert.equal(readVpxTableInfo(path.join(dir, 'absent.vpx')), undefined);
  assert.equal(readVpxScreenshot(file), undefined, 'pas de capture');
});

test('.vpx : la capture choisie par l’auteur est une image entière, reconnue à sa signature', () => {
  const dir = tmp('vpxshot');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(6000, 7)]);
  const file = path.join(dir, 'T2.vpx');
  fs.writeFileSync(file, cfb({ TableName: 'Terminator 2', Screenshot: png }));
  const shot = readVpxScreenshot(file)!;
  assert.equal(shot.ext, 'png');
  assert.ok(shot.data.equals(png));
  // Ce qui n'est pas une image connue est ignoré.
  fs.writeFileSync(file, cfb({ Screenshot: Buffer.from('n’importe quoi') }));
  assert.equal(readVpxScreenshot(file), undefined);
});

// Enregistrements BIFF de VPX : [longueur][étiquette][données], chaînes [longueur][octets].
const biff = (tag: string, data: Buffer = Buffer.alloc(0)) => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(4 + data.length, 0);
  head.write(tag, 4, 'latin1');
  return Buffer.concat([head, data]);
};
const biffStr = (s: string) => {
  const n = Buffer.alloc(4);
  n.writeUInt32LE(Buffer.byteLength(s), 0);
  return Buffer.concat([n, Buffer.from(s)]);
};
const u32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
};
const PNG = (fill: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, fill)]);
/** Flux ImageN : nom, dimensions, puis le fichier d'origine dans un JPEG imbriqué. */
const vpxImage = (name: string, width: number, height: number, data: Buffer) =>
  Buffer.concat([biff('NAME', biffStr(name)), biff('WDTH', u32(width)), biff('HGHT', u32(height)), biff('JPEG'), biff('NAME', biffStr(name)), biff('PATH', biffStr(`C:\\images\\${name}.png`)), biff('SIZE', u32(data.length)), biff('DATA', data), biff('ENDB'), biff('ENDB')]);

test('.vpx : plateau à plat, carte de règles, fronton et logo de la pièce VR lus dans GameStg', () => {
  const dir = tmp('vpximages');
  const file = path.join(dir, 'T2.vpx');
  const write = (playfield: string, images: [string, number, number, Buffer][]) => {
    const game: Record<string, Buffer> = { GameData: Buffer.concat([biff('IMAG', biffStr(playfield)), biff('ENDB')]) };
    images.forEach(([name, w, h, data], i) => (game[`Image${i}`] = vpxImage(name, w, h, data)));
    fs.writeFileSync(file, cfb({ TableName: 'Terminator 2' }, game));
  };
  write('Playfield', [
    ['Playfield', 2048, 1024, PNG(1)],
    ['Instruction Card', 1600, 800, PNG(2)],
    ['T2 Rules', 1600, 800, PNG(3)],
    ['Pincab_Backglass', 1280, 1024, PNG(4)],
    ['Pincab_Backglass_Off', 1280, 1024, PNG(5)],
    ['Backglass2', 1280, 1024, Buffer.from('pas une image')],
    ['VR_Logo', 512, 256, PNG(6)],
    ['Metal', 512, 512, PNG(7)],
  ]);
  const found = readVpxImages(file, 'Règles de la table : ![règles](T2 Rules)')!;
  assert.equal(found.playfield!.name, 'Playfield');
  assert.equal(found.playfield!.ext, 'png');
  assert.ok(found.playfield!.data.equals(PNG(1)));
  assert.deepEqual([found.playfield!.width, found.playfield!.height], [2048, 1024]);
  // L'image que désignent les règles passe avant celle au nom de carte.
  assert.equal(found.rules!.name, 'T2 Rules');
  // Fronton éteint et fichier qui n'est pas une image : écartés.
  assert.deepEqual(found.backglass.map((i) => i.name), ['Pincab_Backglass']);
  assert.deepEqual(found.logos.map((i) => i.name), ['VR_Logo']);
  // Sans règles écrites : la première image au nom de carte, plus large que haute.
  assert.equal(readVpxImages(file)!.rules!.name, 'Instruction Card');
  // Plateau en atlas du Visual Light Mapper (carré) : pas une vue du plateau.
  write('VLM.Nestmap0', [['VLM.Nestmap0', 4096, 4096, PNG(8)]]);
  assert.equal(readVpxImages(file)!.playfield, undefined);
  // Fichier qui n'est pas un .vpx.
  fs.writeFileSync(file, 'rien');
  assert.equal(readVpxImages(file), undefined);
});

// ---------------------------------------------------------------------------
// Pistes et raisons

function tableIn(root: string, folder: string, vpxName: string, info: Record<string, unknown> = {}): TableEntry {
  const dir = path.join(root, 'tables', folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${vpxName}.vpx`), '');
  fs.writeFileSync(path.join(dir, `${vpxName}.info`), JSON.stringify(info));
  return scanTables(path.join(root, 'tables')).find((t) => path.basename(t.file) === `${vpxName}.vpx`)!;
}

test('pistes : le nom écrit dans la table, l’auteur et la version, le PuP-Pack et le DMD désignent le jeu, chacun avec sa raison', () => {
  const root = tmp('pistes');
  const table = tableIn(root, 'GOTG_2.1.1', 'GOTG_2.1.1', { Info: { Title: 'Gardiens de la galaxie 2.1.1' } });
  const evidence = { vpxInfo: { name: 'Guardians Of The Galaxy', author: 'Pincredibles', version: '2.1.1' }, script: { roms: [], dmdFolder: 'GOTG.UltraDMD', pup: { packNames: ['gotg_2020'] } } };
  assert.deepEqual(
    tableClues(table, evidence).map((c) => `${c.kind}=${c.text}`),
    ['vpx-info=Guardians Of The Galaxy', 'info=Gardiens de la galaxie 2.1.1', 'vpx-file=GOTG_2.1.1', 'pup=gotg_2020', 'dmd-folder=GOTG'],
  );
  const leads = deepSearchGames(db, table, evidence);
  const first = leads[0]!;
  assert.equal(first.game.id, 'q86TI2sS');
  assert.equal(first.tableFileId, 'pq6RYRws', 'la recréation de Pincredibles en 2.1.1');
  assert.ok(first.reasons.some((r) => r.includes('nom écrit dans la table')));
  assert.ok(first.reasons.some((r) => r.startsWith('initiales')));
  assert.ok(first.reasons.some((r) => r.includes('Pincredibles, version 2.1.1')));
  // L'édition Premium suit : même titre, mais ni l'auteur ni le PuP-Pack ne la désignent.
  const premium = leads.find((l) => l.game.id === 'gotgprem')!;
  assert.ok(premium.score <= first.score);
  assert.equal(leads.indexOf(premium), 1);
  // Les jeux qui ne partagent qu'un mot (« Galaxy ») passent derrière.
  const galaxy = leads.findIndex((l) => l.game.id === '9jmXW_kf');
  assert.ok(galaxy === -1 || galaxy > leads.findIndex((l) => l.game.id === '671IjPCYuN'));
});

test('pistes : ROM du script, fiche IPDB citée par l’auteur, identifiant VPS du .info, recherche saisie', () => {
  const root = tmp('pistes-rom');
  const table = tableIn(root, 'T2', 'Mon flipper');
  const leads = deepSearchGames(db, table, { script: { roms: ['t2_l8'] }, vpxInfo: { description: 'IPDB No. 2524' } });
  assert.equal(leads[0]!.game.id, 'BunvWvh9');
  assert.ok(leads[0]!.reasons.includes('ROM du script : t2_l8'));
  assert.ok(leads[0]!.reasons.includes('fiche IPDB n° 2524 citée par l’auteur de la table'));
  // Identifiant VPS : le jeu, puis ses autres éditions.
  const known = deepSearchGames(db, table, {}, { vpsId: 'gotgprem' });
  assert.deepEqual(ids(known).slice(0, 2), ['gotgprem', 'q86TI2sS']);
  const typed = deepSearchGames(db, table, {}, { query: 'addams family' });
  assert.equal(typed[0]!.game.id, 'aT_GONvw');
  assert.ok(typed[0]!.reasons[0]!.startsWith('recherche « addams family »'));
  assert.equal(typed[0]!.matchedQuery, true);
  assert.equal(leads[0]!.matchedQuery, undefined);
});

// ---------------------------------------------------------------------------
// VPinMediaDB : autres éditions, choix réunis

const BASE = 'https://raw.githubusercontent.com/superhac/vpinmediadb/main/';
const md5 = (c: string) => c.repeat(32);
function mediaDb(): MediaDb {
  return parseMediaDbIndex({
    q86TI2sS: { '1k': { bg: `${BASE}q86TI2sS/1k/bg.png`, bg_md5: md5('a'), table: `${BASE}q86TI2sS/1k/table.png`, table_md5: md5('b') }, wheel: `${BASE}q86TI2sS/wheel.png`, wheel_md5: md5('c') },
    // Même logo que l'édition Pro (même MD5), fronton différent.
    gotgprem: { '1k': { bg: `${BASE}gotgprem/1k/bg.png`, bg_md5: md5('d') }, wheel: `${BASE}gotgprem/wheel.png`, wheel_md5: md5('c') },
    '671IjPCYuN': { '1k': { bg: `${BASE}671IjPCYuN/1k/bg.png`, bg_md5: md5('e') } },
  })!;
}

test('VPinMediaDB : un identifiant VPS sans médias se rabat sur les autres éditions du jeu, à vérifier', () => {
  const root = tmp('editions');
  const db2 = parseMediaDbIndex({ q86TI2sS: { wheel: `${BASE}q86TI2sS/wheel.png` } })!;
  const table = tableIn(root, 'GOTG Premium', 'GOTG Premium', { Info: { Title: 'GOTG', VPSId: 'gotgprem' } });
  const m = matchMediaDb(db2, table, db);
  assert.equal(m.how, 'vps-sibling');
  assert.equal(m.confident, false);
  assert.equal(m.candidates[0]!.entry.id, 'q86TI2sS');
  assert.match(m.candidates[0]!.reasons![0]!, /autre édition de Guardians of the Galaxy \(Premium\)/);
});

test('choix : les variantes de chaque jeu retenu, sans doublon de fichier, dans l’ordre des jeux', () => {
  const root = tmp('choix');
  const table = tableIn(root, 'GOTG_2.1.1', 'GOTG_2.1.1');
  const leads = deepSearchGames(db, table, { vpxInfo: { name: 'Guardians of the Galaxy', author: 'Pincredibles' } });
  const candidates = mediaDbLeads(mediaDb(), leads);
  assert.deepEqual(candidates.map((c) => c.entry.id), ['q86TI2sS', 'gotgprem', '671IjPCYuN']);
  const choices = mediaDbChoices(candidates, '1k');
  assert.deepEqual(choices.Backglass!.map((c) => c.id), ['mediadb:q86TI2sS:1k/bg', 'mediadb:gotgprem:1k/bg', 'mediadb:671IjPCYuN:1k/bg']);
  assert.equal(choices.Wheel!.length, 1, 'le même logo n’est proposé qu’une fois');
  assert.equal(choices.Backglass![0]!.label, 'Guardians of the Galaxy (Pro) (Stern 2017)');
  assert.equal(choices.Backglass![0]!.detail, 'image');
});

test('choix de la borne : PuP-Pack (fronton, DMD, musiques), dossier du DMD, .directb2s ; sauvegardes et effets écartés', () => {
  const root = tmp('locaux');
  const table = tableIn(root, 'GOTG_2.1.1', 'GOTG_2.1.1');
  const put = (rel: string, bytes: number) => {
    const file = path.join(table.folder, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.alloc(bytes));
    return file;
  };
  put('pupvideos/gotg_2020/BGDefault/default.mp4', 1_800_000);
  put('pupvideos/gotg_2020/DMDAttract/xattract1.mp4', 3_400_000);
  put('pupvideos/gotg_2020/DMDSplash/@blank.mp4', 6_000);
  put('pupvideos/gotg_2020/Topper/Song-1.mp3', 4_800_000);
  put('pupvideos/gotg_2020/Topper/clic.mp3', 20_000);
  put('pupvideos/gotg_2020/Topper.orig/Song-old.mp3', 9_000_000);
  put('pupvideos/gotg_2020/_backup/BGDefault/old.mp4', 2_000_000);
  put('pupvideos/gotg_2020/ExtraBall/extra.mp4', 900_000);
  put('GOTG.UltraDMD/intro.gif', 400_000);
  put('pupvideos/gotg_2020/PuPFrames/GuardiansBackglass2.png', 900_000);
  fs.writeFileSync(
    path.join(table.folder, 'pupvideos/gotg_2020/screens.pup'),
    'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos\n0,Topper,,,0,off,,\n2,Backglass,PuPFrames,GuardiansBackglass2.png,0,ForceBack,,\n5,FullDMD,Absent,rien.mp4,0,ForceBack,,\n',
  );
  const shot = put('cache/vpx-shot.png', 600_000);
  put('GOTG.UltraDMD/police.png', 2_000);
  const b2s = put('cache/b2s.png', 300_000);
  const choices = localMediaChoices(table, {
    dmdFolder: 'GOTG.UltraDMD',
    screenshot: shot,
    b2s: [{ name: 'GOTG_2.1.1.directb2s', loaded: true, images: { backglass: { file: b2s, width: 1024, height: 768, format: 'png', element: 'BackglassOnImage', bytes: 300_000 } } }],
  });
  const labels = (type: keyof typeof choices) => (choices[type] ?? []).map((c) => c.label);
  // Le fronton que screens.pup donne à l'écran 2 passe avant ce que suggèrent les noms de dossiers.
  assert.deepEqual(labels('Backglass'), [
    'Image allumée du fronton',
    'gotg_2020 : écran Backglass, fichier par défaut du pack',
    'gotg_2020 \\ BGDefault\\default.mp4',
  ]);
  assert.deepEqual(labels('Playfield'), ['Capture de la table, choisie par son auteur']);
  assert.deepEqual(labels('FullDMD'), ['gotg_2020 \\ DMDAttract\\xattract1.mp4', 'GOTG.UltraDMD \\ intro.gif']);
  assert.deepEqual(labels('Audio'), ['gotg_2020 \\ Topper\\Song-1.mp3']);
  assert.equal(choices.Backglass![2]!.source, 'pup');
  assert.equal(choices.FullDMD![1]!.source, 'dmd-folder');
  // Réunis avec ceux de VPinMediaDB : en ligne d'abord, puis la borne.
  const merged = mergeMediaChoices(mediaDbChoices(mediaDbLeads(mediaDb(), deepSearchGames(db, table, { vpxInfo: { name: 'Guardians of the Galaxy' } })), '1k'), choices);
  assert.equal(merged.Backglass![0]!.source, 'mediadb');
  assert.equal(merged.Backglass!.at(-1)!.source, 'pup');
});

test('choix de la borne : triggers.pup (démarrage, attente, musique), cadres PupImages, images du .vpx ; scènes des modes écartées', () => {
  const root = tmp('declencheurs');
  const table = tableIn(root, 'GOTG', 'GOTG');
  const pack = path.join(table.folder, 'pupvideos', 'gotg');
  const put = (rel: string, bytes: number) => {
    const file = path.join(pack, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.alloc(bytes));
    return file;
  };
  put('BGDefault/default.mp4', 1_800_000);
  put('Scenes/bg-attract.mp4', 2_000_000);
  put('Scenes/off.mp4', 2_000_000);
  put('Modes/mode1.mp4', 3_000_000);
  put('Bande/theme.mp3', 4_000_000);
  put('Bande/clic.mp3', 10_000);
  put('PupImages/GOTG-4x3.png', 300_000);
  put('PupImages/bouton.png', 300_000);
  fs.writeFileSync(path.join(pack, 'screens.pup'), 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos\n2,Backglass,,,0,ForceBack,,\n5,FullDMD,,,0,ForceBack,,\n7,Musique,,,0,MusicOnly,,\n');
  fs.writeFileSync(
    path.join(pack, 'triggers.pup'),
    [
      'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile,Volume,Priority,Length,Counter,RestSeconds,Loop,Defaults',
      '1,1,Démarrage,D0,5,BGDefault,default.mp4,100,1,0,0,0,SetBG,',
      '2,1,Attente,E454,2,Scenes,bg-attract.mp4,100,1,0,0,0,SetBG,',
      '3,1,Mode 1,M12,2,Modes,mode1.mp4,100,1,0,0,0,SetBG,',
      '4,0,Ancien,D0,2,Scenes,off.mp4,100,1,0,0,0,SetBG,',
      '5,1,Musique,D0,7,Bande,,100,1,0,0,0,Loop,',
    ].join('\r\n'),
  );
  const rules = path.join(root, 'cache', 'vpx-regles.png');
  fs.mkdirSync(path.dirname(rules), { recursive: true });
  fs.writeFileSync(rules, PNG(1));
  const choices = localMediaChoices(table, { vpxImages: [{ type: 'GameHelp', file: rules, label: 'Carte de règles rangée dans la table : « T2 Rules », 1600 × 800' }, { type: 'Wheel', file: path.join(root, 'effacé.png'), label: 'disparu' }] });
  const labels = (type: keyof typeof choices) => (choices[type] ?? []).map((c) => c.label);
  // BGDefault va à l'écran 5 d'après triggers.pup : ce n'est plus un fronton, malgré son nom.
  assert.deepEqual(labels('Backglass'), ['gotg \\ Scenes\\bg-attract.mp4 (écran 2, en attente)', 'gotg \\ PupImages\\GOTG-4x3.png']);
  assert.deepEqual(labels('FullDMD'), ['gotg \\ BGDefault\\default.mp4 (écran 5, au démarrage)']);
  assert.deepEqual(labels('Audio'), ['gotg \\ Bande\\theme.mp3 (musique du pack)']);
  assert.deepEqual(labels('GameHelp'), ['Carte de règles rangée dans la table : « T2 Rules », 1600 × 800']);
  assert.equal(choices.GameHelp![0]!.source, 'vpx');
  assert.equal(choices.Wheel, undefined, 'une image du cache effacée n’est pas proposée');
});

test('musiques VPS : liens Dropbox vers un mp3 ou un ogg seulement, le fichier plutôt que la page', () => {
  const game: VpsGame = {
    id: 'BunvWvh9',
    name: 'Terminator 2 - Judgment Day',
    manufacturer: 'Williams',
    year: 1991,
    soundFiles: [
      { id: 's1', authors: ['Thalamus'], version: '1.0', urls: [{ url: 'https://www.dropbox.com/s/abc/T2%20theme.mp3?dl=0' }] },
      { id: 's2', urls: [{ url: 'https://drive.google.com/file/t2.mp3' }] },
      { id: 's3', urls: [{ url: 'https://www.dropbox.com/s/mort/t2.mp3', broken: true }] },
      { id: 's4', urls: [{ url: 'https://www.dropbox.com/s/zip/t2-pack.zip' }] },
      { id: 's5', urls: [{ url: 'pas une adresse' }] },
    ],
  };
  const choices = vpsMusicChoices([game]);
  assert.deepEqual(choices.Audio!.map((c) => c.id), ['vps-music:BunvWvh9:s1']);
  const offer = choices.Audio![0]!.offer!;
  assert.equal(offer.file.url, 'https://www.dropbox.com/s/abc/T2%20theme.mp3?dl=1');
  assert.equal(offer.ext, 'mp3');
  assert.equal(choices.Audio![0]!.detail, 'musique pour la table de Thalamus 1.0');
  assert.deepEqual(vpsMusicChoices([{ ...game, soundFiles: [] }]), {});
});

test('sons reçus : reconnus à leur signature, une page d’erreur ne passe pas pour un mp3', () => {
  const dir = tmp('sons');
  const put = (name: string, data: Buffer) => {
    fs.writeFileSync(path.join(dir, name), data);
    return path.join(dir, name);
  };
  assert.equal(isAudioFile(put('a.mp3', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]))), true);
  assert.equal(isAudioFile(put('b.mp3', Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0]))), true);
  assert.equal(isAudioFile(put('c.ogg', Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]))), true);
  assert.equal(isAudioFile(put('d.wav', Buffer.from('RIFF\0\0\0\0WAVEfmt '))), true);
  assert.equal(isAudioFile(put('e.mp3', Buffer.from('<!DOCTYPE html><html>'))), false);
  assert.equal(isAudioFile(path.join(dir, 'absent.mp3')), false);
});

test('vignettes VPS : plateau de chaque version, fronton de chaque .directb2s, adresses du site de VPS seulement', () => {
  const img = (n: string) => `https://virtualpinballspreadsheet.github.io/vps-db/img/${n}.webp`;
  const game: VpsGame = {
    id: 'q86TI2sS',
    name: 'Guardians of the Galaxy (Pro)',
    manufacturer: 'Stern',
    year: 2017,
    tableFiles: [
      { id: 't0', imgUrl: img('t0'), updatedAt: 1 },
      { id: 't1', authors: ['Pincredibles'], version: '2.1.1', imgUrl: img('t1'), updatedAt: 2 },
    ],
    b2sFiles: [{ id: 'b1', authors: ['Wildman'], imgUrl: img('b1') }, { id: 'pirate', imgUrl: 'https://exemple.com/b2s.webp' }, { id: 'remonte', imgUrl: img('../../x') }],
  };
  const choices = vpsImageChoices([game, game]);
  // La plus récente d'abord, chaque image une seule fois.
  assert.deepEqual(choices.Playfield!.map((c) => c.detail), ['vignette du plateau de Pincredibles 2.1.1', 'vignette du plateau']);
  assert.deepEqual(choices.Backglass!.map((c) => c.id), ['vps:q86TI2sS:b1']);
  assert.equal(choices.Backglass![0]!.offer!.file.url, img('b1'));
  assert.equal(choices.Backglass![0]!.vpsId, 'q86TI2sS');
});

// ---------------------------------------------------------------------------
// Provenance notée à l'enregistrement

test('brouillon : un fichier téléchargé note sa provenance ; remplacé à la main, elle disparaît', () => {
  const root = tmp('provenance');
  const table = tableIn(root, 'GOTG_2.1.1', 'GOTG_2.1.1', { Info: { Title: 'GOTG' }, CyberPinball: { medias: { halfTurn: { Playfield: true } } } });
  const downloaded = path.join(root, 'downloads', 'vpinmediadb', `${md5('b')}.png`);
  fs.mkdirSync(path.dirname(downloaded), { recursive: true });
  fs.writeFileSync(downloaded, 'plateau');
  const draft = emptyMediaDraft();
  const origin = { origin: 'VPinMediaDB', url: `${BASE}q86TI2sS/1k/table.png`, vpsId: 'q86TI2sS', key: '1k/table', md5: md5('b') };
  draft.pages.Playfield = [{ from: downloaded, mode: 'move', origin }];
  const now = new Date('2026-10-22T10:00:00Z');
  const plan = planMediaChanges(table, draft, { infoFile: table.infoFile, root, now });
  assert.deepEqual(plan.problems, []);
  assert.ok(plan.steps.some((s) => s.kind === 'add' && s.detail === 'téléchargé depuis VPinMediaDB'));
  assert.ok(plan.steps.some((s) => s.kind === 'info' && s.text === 'Provenance notée : VPinMediaDB'));
  applyOps(plan.ops, { trashDir: path.join(root, 'trash') });
  const memory = mediaMemory(readInfo(table.infoFile));
  assert.deepEqual(memory.sources?.Playfield, { ...origin, date: now.toISOString(), file: '(Playfield) GOTG_2.1.1.png' });
  assert.equal(memory.halfTurn, undefined, 'fichier au standard : le demi-tour de l’ancien ne vaut plus');
  assert.ok(!fs.existsSync(downloaded), 'déplacé depuis le dossier de réception');

  // Remplacé par un fichier pris sur ce PC : la provenance ne vaut plus.
  const mine = path.join(root, 'mon plateau.png');
  fs.writeFileSync(mine, 'à moi');
  const again = emptyMediaDraft();
  again.pages.Playfield = [{ from: mine, mode: 'copy' }];
  const table2 = scanTables(path.join(root, 'tables'))[0]!;
  const plan2 = planMediaChanges(table2, again, { infoFile: table2.infoFile, root });
  assert.ok(plan2.infoFile, 'le .info est réécrit même sans autre réglage');
  applyOps(plan2.ops, { trashDir: path.join(root, 'trash') });
  assert.equal(mediaMemory(readInfo(table2.infoFile)).sources, undefined);
  assert.equal(readInfo(table2.infoFile).Info?.Title, 'GOTG', 'les autres champs restent');
});

test('même contenu : le fichier repris de VPinMediaDB est l’actuel, une autre version ne l’est pas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samecontent-'));
  const a = path.join(dir, '(FullDMD) GoT.mp4');
  const b = path.join(dir, 'dmd.mp4');
  const c = path.join(dir, 'autre.mp4');
  fs.writeFileSync(a, Buffer.alloc(3 << 20, 7));
  fs.writeFileSync(b, Buffer.alloc(3 << 20, 7));
  const other = Buffer.alloc(3 << 20, 7);
  other[(2 << 20) + 5] = 8;
  fs.writeFileSync(c, other);
  assert.equal(sameFileContent(a, b), true, 'copie octet pour octet, au-delà du premier morceau lu');
  assert.equal(sameFileContent(a, c), false, 'même taille, un octet différent');
  assert.equal(sameFileContent(a, path.join(dir, 'absent.mp4')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
