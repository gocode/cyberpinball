// runSerie (controles.mjs) : une série qui échoue nomme ses fichiers en échec, sans refaire ; un diagnostic illisible
// dit le code et la fin de la sortie ; une série verte rend code 0. Test lent (il lance node --test).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnosticIllisible, runSerie } from './controles.mjs';

test('runSerie : verte ; en échec elle nomme le fichier fautif et ne refait pas la série', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-serie-'));
  // Lancé sous node --test, le node --test enfant se croirait sous-test du parent : ses échecs ne se verraient plus.
  const contexte = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    execFileSync('git', ['init', '-q', '-b', 'proto/ecrans'], { cwd, windowsHide: true });
    fs.mkdirSync(path.join(cwd, 'tmp'));
    const vert = path.join(cwd, 'vert.test.mjs');
    const rouge = path.join(cwd, 'rouge.test.mjs');
    fs.writeFileSync(vert, "import { test } from 'node:test';\ntest('vert', () => {});\n");
    fs.writeFileSync(rouge, "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('rouge', () => assert.equal(1, 2));\n");
    const ok = await runSerie({ cwd, files: [vert], log: path.join(cwd, 'tmp', 'vert.txt'), timeoutMs: 60_000 });
    assert.equal(ok.code, 0);
    assert.equal(ok.essais, 1);
    assert.equal(ok.illisible, undefined);
    const ko = await runSerie({ cwd, files: [vert, rouge], log: path.join(cwd, 'tmp', 'rouge.txt'), timeoutMs: 60_000 });
    assert.notEqual(ko.code, 0);
    assert.equal(ko.essais, 1, 'un échec identifié n\'est pas refait');
    assert.equal(ko.illisible, undefined);
    assert.deepEqual(ko.failing.map((f) => path.basename(f)), ['rouge.test.mjs']);
  } finally {
    if (contexte !== undefined) process.env.NODE_TEST_CONTEXT = contexte;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('runSerie : un diagnostic illisible garde le code, le nombre de lignes et la fin de la sortie', () => {
  const out = `${Array.from({ length: 30 }, (_, i) => `ligne ${i + 1}`).join('\n')}\n`;
  const d = diagnosticIllisible(out, 1, 'tmp/x.txt');
  assert.match(d, /^code 1, 30 ligne\(s\) de sortie \(journal : tmp\/x\.txt\)/);
  assert.match(d, /ligne 30/);
  assert.match(d, /ligne 19/);
  assert.doesNotMatch(d, /ligne 18\b/, 'seulement les 12 dernières lignes');
});
