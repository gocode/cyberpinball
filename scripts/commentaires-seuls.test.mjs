// Tests of scripts/commentaires-seuls.mjs: a comment-only change is accepted, any change to the
// code (statement, string, type, i18n key) is caught.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECKABLE, codeDifference } from './commentaires-seuls.mjs';

const OPTIONS = { target: 9 /* ES2022 */, module: 1 /* CommonJS */, strict: true };

const BEFORE = [
  '// Lecture des fichiers .vpx : en-tête et script.',
  "import * as fs from 'node:fs';",
  '',
  '/** Taille du fichier, en octets. */',
  'export function size(file: string): number {',
  '  // Une table absente compte pour zéro.',
  '  if (!fs.existsSync(file)) return 0; // i18n-ignore : chemin',
  '  /* bloc',
  '     sur deux lignes */',
  '  return fs.statSync(file).size;',
  '}',
  "export const label = (n: number) => t('Taille : {n}', { n });",
  'declare function t(key: string, p?: object): string;',
  '',
].join('\n');

test('comments translated, merged or split: no difference', () => {
  const after = BEFORE.replace('// Lecture des fichiers .vpx : en-tête et script.', '// Reading .vpx files:\n// header and script.')
    .replace('/** Taille du fichier, en octets. */', '/**\n * File size, in bytes.\n */')
    .replace('// Une table absente compte pour zéro.', '// A missing table counts as zero.')
    .replace('// i18n-ignore : chemin', '// i18n-ignore: path')
    .replace('/* bloc\n     sur deux lignes */', '/* block on one line */');
  assert.equal(codeDifference(BEFORE, after, 'a.ts', OPTIONS), undefined);
  assert.equal(codeDifference(BEFORE, BEFORE.replace(/\n/g, '\r\n'), 'a.ts', OPTIONS), undefined);
});

test('a change of statement, string or i18n key is caught in the compiled output', () => {
  assert.equal(codeDifference(BEFORE, BEFORE.replace('return 0;', 'return 1;'), 'a.ts', OPTIONS), 'emit');
  assert.equal(codeDifference(BEFORE, BEFORE.replace("'node:fs'", "'node:fs/promises'"), 'a.ts', OPTIONS), 'emit');
  assert.equal(codeDifference(BEFORE, BEFORE.replace("t('Taille : {n}'", "t('Size: {n}'"), 'a.ts', OPTIONS), 'emit');
  assert.equal(codeDifference(BEFORE, BEFORE.replace('export function size', 'export function sizeOf'), 'a.ts', OPTIONS), 'emit');
});

test('a change of type, erased by compilation, is caught too', () => {
  assert.equal(codeDifference(BEFORE, BEFORE.replace('(file: string): number', '(file: string): number | undefined'), 'a.ts', OPTIONS), 'types');
  assert.equal(codeDifference(BEFORE, BEFORE.replace('p?: object', 'p?: Record<string, unknown>'), 'a.ts', OPTIONS), 'types');
});

test('a comment marker inside a string or a template is code, not a comment', () => {
  const src = "const a = 'x // y';\nconst b = `${a} /* z */`;\nconst r = /\\/\\/ w/;\n";
  assert.equal(codeDifference(src, src.replace('// y', '// Y'), 'a.ts', OPTIONS), 'emit');
  assert.equal(codeDifference(src, src.replace('/* z */', '/* Z */'), 'a.ts', OPTIONS), 'emit');
  assert.equal(codeDifference(src, src.replace('\\/\\/ w', '\\/\\/ W'), 'a.ts', OPTIONS), 'emit');
});

test('JavaScript files are checked the same way; other files are not checkable', () => {
  const js = '// Page des réglages.\nexport const n = 1;\n';
  assert.equal(codeDifference(js, js.replace('Page des réglages.', 'Settings page.'), 'page.js', OPTIONS), undefined);
  assert.equal(codeDifference(js, js.replace('= 1', '= 2'), 'page.js', OPTIONS), 'emit');
  for (const f of ['a.ts', 'b.mjs', 'c.js', 'd.cjs']) assert.equal(CHECKABLE.test(f), true, f);
  for (const f of ['a.html', 'b.css', 'c.md', 'd.json']) assert.equal(CHECKABLE.test(f), false, f);
});
