import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings } from '../mediaview';
import { ShuffleKeys, START_TABLES, TABLE_ORDERS, sortTables, startIndex } from '../tableorder';
import type { TableEntry } from '../tables';

type T = Pick<TableEntry, 'file' | 'title' | 'version' | 'manufacturer' | 'year' | 'info'>;
const table = (title: string, extra: Partial<T> & { starts?: number; last?: string } = {}): T => ({
  file: `D:\\Tables\\${title}\\${title}.vpx`,
  title,
  manufacturer: extra.manufacturer,
  year: extra.year,
  version: extra.version,
  info: { User: { StartCount: extra.starts, LastRun: extra.last } },
});

const T2 = table('Terminator 2', { manufacturer: 'Williams', year: 1991, starts: 4, last: '2026-10-30T20:00:00Z' });
const AFM = table('Attack from Mars', { manufacturer: 'Bally', year: 1995, starts: 9, last: '2026-10-20T20:00:00Z' });
const GOT = table('Game of Thrones', { manufacturer: 'Stern', year: 2015 });
const ORIG = table('Zeta Original');
const ALL = [GOT, T2, ORIG, AFM];
const titles = (list: readonly T[]) => list.map((x) => x.title);

test('ordre des tables : par titre par défaut, comme avant ce réglage', () => {
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.tableOrder, 'title');
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.startTable, 'first');
  assert.deepEqual(titles(sortTables(ALL, 'title')), ['Attack from Mars', 'Game of Thrones', 'Terminator 2', 'Zeta Original']);
  // Le tableau reçu n'est pas touché.
  assert.deepEqual(titles(ALL), ['Game of Thrones', 'Terminator 2', 'Zeta Original', 'Attack from Mars']);
});

test('ordre des tables : jouées, année, fabricant ; inconnu à la fin, titre à égalité', () => {
  assert.deepEqual(titles(sortTables(ALL, 'recent')), ['Terminator 2', 'Attack from Mars', 'Game of Thrones', 'Zeta Original']);
  assert.deepEqual(titles(sortTables(ALL, 'played')), ['Attack from Mars', 'Terminator 2', 'Game of Thrones', 'Zeta Original']);
  assert.deepEqual(titles(sortTables(ALL, 'year')), ['Terminator 2', 'Attack from Mars', 'Game of Thrones', 'Zeta Original']);
  assert.deepEqual(titles(sortTables(ALL, 'manufacturer')), ['Attack from Mars', 'Game of Thrones', 'Terminator 2', 'Zeta Original']);
  // Date illisible : comme jamais jouée.
  const odd = table('Abyss', { last: 'hier soir' });
  assert.deepEqual(titles(sortTables([odd, T2], 'recent')), ['Terminator 2', 'Abyss']);
});

test('ordre mélangé : tiré une fois, stable tant que la session dure, une table ajoutée ne bouscule rien', () => {
  const draws = [0.9, 0.1, 0.5, 0.3, 0.7];
  const keys = new ShuffleKeys(() => draws.shift()!);
  // Tirages dans un ordre connu (le tri, lui, compare dans l'ordre qu'il veut).
  for (const x of ALL) keys.of(x.file);
  const first = titles(sortTables(ALL, 'shuffle', keys));
  assert.deepEqual(first, ['Terminator 2', 'Attack from Mars', 'Zeta Original', 'Game of Thrones']);
  assert.deepEqual(titles(sortTables([...ALL].reverse(), 'shuffle', keys)), first);
  const added = table('Medieval Madness');
  const after = titles(sortTables([...ALL, added], 'shuffle', keys));
  assert.deepEqual(after.filter((x) => x !== 'Medieval Madness'), first);
});

test('table au démarrage : la première, au hasard, ou la dernière jouée', () => {
  const sorted = sortTables(ALL, 'title');
  assert.equal(startIndex(sorted, 'first'), 0);
  assert.equal(startIndex(sorted, 'random', () => 0.6), 2);
  assert.equal(startIndex(sorted, 'random', () => 0.999999), 3);
  assert.equal(sorted[startIndex(sorted, 'last')]!.title, 'Terminator 2');
  // Rien n'a jamais été joué : la première.
  assert.equal(startIndex([GOT, ORIG], 'last'), 0);
  assert.equal(startIndex([], 'random', () => 0.5), 0);
});

test('ordre et table au démarrage : lus de medias.json, valeur inconnue ignorée', () => {
  for (const order of TABLE_ORDERS) assert.equal(normalizeMenuMediaSettings({ tableOrder: order }).tableOrder, order);
  for (const start of START_TABLES) assert.equal(normalizeMenuMediaSettings({ startTable: start }).startTable, start);
  assert.equal(normalizeMenuMediaSettings({ tableOrder: 'couleur' }).tableOrder, 'title');
  assert.equal(normalizeMenuMediaSettings({ startTable: 42 }).startTable, 'first');
});
