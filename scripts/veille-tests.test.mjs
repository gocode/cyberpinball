// Un test figé échoue ; un fichier long qui avance n'est jamais interrompu (23/11/2026 : node
// --test-timeout bornait chaque fichier entier, et clavier-reel puis telecommande, sains, tombaient à 5 min).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_TIMEOUT_MS } from './controles.mjs';
import { failedFiles, failureDetails, totals } from './sortie-tests.mjs';
import { NODE_TEST_ARGS } from './tests-node.mjs';
import { TEST_FIGE_MS, delaiFige } from './veille-tests.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('veille : un fichier plus long que le délai mais qui avance passe ; un test sans progrès échoue, nommé', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-veille-'));
  try {
    const attente = "const wait = (ms) => new Promise((r) => setTimeout(r, ms));\n";
    // Délai de la veille : 1,5 s. Chaque fichier sain dure plus (2,4 s), chacun de ses tests moins.
    fs.writeFileSync(path.join(dir, 'long.test.mjs'), `import { test } from 'node:test';\n${attente}for (const n of [1, 2, 3, 4]) test('étape ' + n, () => wait(600));\n`);
    fs.writeFileSync(path.join(dir, 'imbrique.test.mjs'), `import { test, describe, it } from 'node:test';\n${attente}test('parent', async (t) => { for (const n of [1, 2, 3, 4]) await t.test('sous ' + n, () => wait(600)); });\ndescribe('groupe', () => { for (const n of [1, 2, 3, 4]) it('cas ' + n, () => wait(600)); });\n`);
    fs.writeFileSync(path.join(dir, 'fige.test.mjs'), `import { test } from 'node:test';\n${attente}test('avant', () => {});\ntest('bloqué', () => wait(20_000));\n`);
    const env = { ...process.env, CYBERPINBALL_TEST_FIGE_MS: '1500' };
    delete env.NODE_TEST_CONTEXT; // sinon le lanceur imbriqué refuse de lancer les fichiers
    const started = Date.now();
    const r = spawnSync(process.execPath, [...NODE_TEST_ARGS, '--test-reporter=tap', `--test-timeout=${TEST_TIMEOUT_MS}`, 'long.test.mjs', 'imbrique.test.mjs', 'fige.test.mjs'], { cwd: dir, env, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
    const out = `${r.stdout}${r.stderr}`;
    assert.ok(Date.now() - started < 15_000, `le test figé arrêté vite, pas au bout de ses 20 s :\n${out}`);
    assert.deepEqual(failedFiles(out).map((f) => path.basename(f)), ['fige.test.mjs'], out);
    const details = failureDetails(out).filter((d) => d.file === 'fige.test.mjs');
    assert.equal(details.length, 1, out);
    assert.match(details[0].error ?? '', /^test figé \(aucun progrès depuis 2 s\) : bloqué$/, out);
    // long : 4 ; imbrique : parent et ses 4 sous-tests, les 4 cas du groupe ; fige : « avant ».
    assert.equal(totals(out).pass, 4 + 1 + 4 + 4 + 1, out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('veille : 5 min par défaut, chargée à chaque lancement de node --test ; --test-timeout ne borne qu’un fichier, largement', () => {
  assert.equal(TEST_FIGE_MS, 5 * 60_000);
  assert.equal(delaiFige({}), TEST_FIGE_MS);
  assert.equal(delaiFige({ CYBERPINBALL_TEST_FIGE_MS: '1200' }), 1200);
  assert.match(fs.readFileSync(path.join(here, 'console-sur-stderr.mjs'), 'utf8'), /^import '\.\/veille-tests\.mjs';$/m);
  // node applique --test-timeout au fichier entier : à la valeur d'un seul test, il coupait les fichiers longs.
  assert.ok(TEST_TIMEOUT_MS >= 4 * TEST_FIGE_MS, 'plafond par fichier bien au-dessus du délai d’un test figé');
});
