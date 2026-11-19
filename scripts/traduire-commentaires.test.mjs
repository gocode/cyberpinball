// Tests of scripts/traduire-commentaires.mjs: every comment is extracted, grouped and put back in
// place; the code around it never moves.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeDifference } from './commentaires-seuls.mjs';
import { applyBlocks, blockProblems, blocks, formatBlocks, parseBlocks } from './traduire-commentaires.mjs';

const SOURCE = [
  '// En-tête du module :',
  '// deux lignes.',
  "import * as fs from 'node:fs';",
  '',
  '/** Taille, en octets. */',
  'export function size(file: string): number {',
  "  const s = 'pas // un commentaire';",
  '  const t = `${s} /* non plus */`;',
  '  return fs.statSync(file).size; // fin de ligne',
  '}',
  'const o = {',
  '  a: 1,',
  '  // avant l’accolade fermante',
  '};',
  'const p = 1; // i18n-ignore : clé technique',
  '// fin du fichier',
  '',
].join('\r\n');

test('every comment is found, consecutive line comments form one block, strings are not comments', () => {
  const list = blocks(SOURCE, 'a.ts');
  assert.deepEqual(list.map((b) => b.text), [
    '// En-tête du module :\r\n// deux lignes.',
    '/** Taille, en octets. */',
    '// fin de ligne',
    '// avant l’accolade fermante',
    '// i18n-ignore : clé technique',
    '// fin du fichier',
  ]);
});

test('extraction then application unchanged gives the same file, byte for byte', () => {
  const text = formatBlocks(SOURCE, blocks(SOURCE, 'a.ts'));
  assert.match(text, /^@@@ 1 \| import \* as fs from 'node:fs';\n\/\/ En-tête du module :\n\/\/ deux lignes\.\n@@@ 2 \| /);
  assert.equal(applyBlocks(SOURCE, 'a.ts', parseBlocks(text)), SOURCE);
});

test('translated blocks go back in place, line endings kept, code unchanged', () => {
  const translations = parseBlocks([
    '@@@ 1 | import',
    '// Module header,',
    '// on two lines,',
    '// now three.',
    '@@@ 2',
    '/**',
    ' * Size, in bytes.',
    ' */',
    '@@@ 5',
    '// i18n-ignore: technical key',
    '',
  ].join('\n'));
  const out = applyBlocks(SOURCE, 'a.ts', translations);
  assert.match(out, /^\/\/ Module header,\r\n\/\/ on two lines,\r\n\/\/ now three\.\r\nimport/);
  assert.match(out, /\/\*\*\r\n \* Size, in bytes\.\r\n \*\/\r\nexport function size/);
  assert.match(out, /const p = 1; \/\/ i18n-ignore: technical key\r\n/);
  assert.equal(codeDifference(SOURCE.replace(/\r\n/g, '\n'), out.replace(/\r\n/g, '\n'), 'a.ts'), undefined);
});

test('a block that would change the code or lose a marker is refused, and nothing is applied', () => {
  assert.deepEqual(blockProblems('// a', '// b'), []);
  assert.match(blockProblems('// a\n// b', '// a\nconst x = 1;').join(), /not a \/\/ comment/);
  assert.match(blockProblems('/* a */', '/* a */ x /* b */').join(), /\*\/ inside/);
  assert.match(blockProblems('/* a */', '/* a').join(), /not closed/);
  assert.match(blockProblems('// i18n-ignore : chemin', '// path').join(), /markers changed/);
  assert.match(blockProblems('// @ts-expect-error : type de koffi', '// koffi type').join(), /markers changed/);
  assert.match(blockProblems('// lecture entière : petit fichier', '// whole read: small file').join(), /markers changed/);
  assert.deepEqual(blockProblems('// lecture entière : petit fichier', '// lecture entière : small file'), []);
  assert.match(blockProblems('// motif \\u00e9', '// pattern é').join(), /escapes/);
  assert.throws(() => applyBlocks(SOURCE, 'a.ts', parseBlocks('@@@ 99\n// x\n')), /no such block/);
  assert.throws(() => applyBlocks(SOURCE, 'a.ts', parseBlocks('@@@ 3\nreturn 0;\n')), /not a \/\/ comment/);
});
