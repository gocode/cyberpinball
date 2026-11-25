// Dossier temporaire isolé des tests (scripts/temp-tests.mjs) : la règle est fixée ici.
// Cause : %TEMP% à 810 000 entrées laissées par les tests, relu à chaque essai par le code qui remonte jusqu'à la racine (25/11/2026).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { UN_JOUR_MS, baseTests, isolerTemp, purgerAbandonnes } from './temp-tests.mjs';

const racine = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-temp-tests-'));

test('temp des tests : la base est dans %TEMP%, jamais dans le profil ni ailleurs', () => {
  assert.equal(baseTests(path.join('C:', 'Temp')), path.join('C:', 'Temp', 'cyberpinball-tests'));
});

test('temp des tests : TEMP et TMP pointent vers un dossier à soi dans %TEMP%, supprimé à la sortie', () => {
  const dir = racine();
  try {
    const env = {};
    const sorties = [];
    const mien = isolerTemp({ env, platform: 'win32', tmpdir: dir, pid: 4242, onExit: (f) => sorties.push(f) });
    assert.equal(mien, path.join(dir, 'cyberpinball-tests', '4242'));
    assert.equal(env.TEMP, mien);
    assert.equal(env.TMP, mien);
    assert.ok(fs.existsSync(mien));
    fs.mkdirSync(path.join(mien, 'cp-essai'));
    fs.writeFileSync(path.join(mien, 'cp-essai', 'reste.txt'), 'x');
    assert.equal(sorties.length, 1);
    sorties[0]();
    assert.ok(!fs.existsSync(mien), 'le dossier et ce que les essais y ont laissé sont vidés à la sortie');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('temp des tests : sans effet hors de Windows, désactivé, ou déjà isolé par le processus parent', () => {
  const dir = racine();
  try {
    const env = {};
    assert.equal(isolerTemp({ env, platform: 'linux', tmpdir: dir, onExit: () => {} }), undefined);
    assert.equal(isolerTemp({ env: { CYBERPINBALL_TESTS_TEMP: '0' }, platform: 'win32', tmpdir: dir, onExit: () => {} }), undefined);
    // Un processus lancé par un test hérite du dossier de son parent : pas d'imbrication.
    assert.equal(isolerTemp({ env, platform: 'win32', tmpdir: path.join(dir, 'cyberpinball-tests', '7'), onExit: () => {} }), undefined);
    assert.deepEqual(env, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('temp des tests : les dossiers d’un processus tué sont retirés au passage suivant, une fois vieux d’un jour', () => {
  const dir = racine();
  try {
    const base = path.join(dir, 'base');
    for (const name of ['vieux', 'recent']) fs.mkdirSync(path.join(base, name), { recursive: true });
    const now = Date.now();
    const vieux = new Date(now - UN_JOUR_MS - 60_000);
    fs.utimesSync(path.join(base, 'vieux'), vieux, vieux);
    assert.deepEqual(purgerAbandonnes(base, { now }), ['vieux']);
    assert.ok(!fs.existsSync(path.join(base, 'vieux')));
    assert.ok(fs.existsSync(path.join(base, 'recent')), 'un dossier récent peut servir à un autre processus');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('temp des tests : chaque fichier de tests rapides isole son temp (chargé par console-sur-stderr)', () => {
  const chargeur = fs.readFileSync(new URL('./console-sur-stderr.mjs', import.meta.url), 'utf8');
  assert.match(chargeur, /import \{ isolerTemp \} from '\.\/temp-tests\.mjs';/);
  assert.match(chargeur, /^isolerTemp\(\);$/m);
});
