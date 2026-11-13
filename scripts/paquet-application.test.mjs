// Garde-fou du paquet de l'application (scripts/paquet-application.mjs) : la préversion
// 0.1.13-essai.1 est partie sans son code, deux fabrications s'étant croisées dans le même dossier.
// Un paquet sans code est refusé avant GitHub, et une seconde fabrication attend la première.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { lockBuild, stageProblems, VITAL_FILES, windowsTar, zipProblems } from './paquet-application.mjs';

const windows = process.platform === 'win32' && fs.existsSync(windowsTar());

function fullStage(dir) {
  for (const f of VITAL_FILES) {
    const file = path.join(dir, ...f.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
}

test('paquet : un dossier complet passe ; sans dist\\ ni renderer\\ (essai.1), chaque manque est nommé', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-paquet-'));
  try {
    fullStage(dir);
    assert.deepEqual(stageProblems(dir), []);
    fs.rmSync(path.join(dir, 'dist'), { recursive: true });
    fs.rmSync(path.join(dir, 'renderer'), { recursive: true });
    assert.deepEqual(stageProblems(dir), ['dist/main.js', 'dist/preload.js', 'dist/maj-legere.js', 'dist/veilleur.js', 'renderer/frontend.html', 'renderer/screen.html']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('paquet : le zip relu avant l’envoi ; incomplet ou illisible, il est refusé', { skip: windows ? false : 'tar.exe de Windows absent' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-paquet-'));
  try {
    const stage = path.join(dir, 'app');
    fullStage(stage);
    const zip = path.join(dir, 'complet.zip');
    assert.equal(spawnSync(windowsTar(), ['-a', '-c', '-f', zip, '-C', stage, ...fs.readdirSync(stage)]).status, 0);
    assert.deepEqual(zipProblems(zip), []);
    // Comme l'essai.1 : tout sauf le code et l'interface.
    const partial = path.join(dir, 'incomplet.zip');
    const kept = fs.readdirSync(stage).filter((n) => n !== 'dist' && n !== 'renderer');
    assert.equal(spawnSync(windowsTar(), ['-a', '-c', '-f', partial, '-C', stage, ...kept]).status, 0);
    assert.ok(zipProblems(partial).includes('dist/main.js'));
    const broken = path.join(dir, 'casse.zip');
    fs.writeFileSync(broken, 'pas un zip');
    assert.match(zipProblems(broken)[0], /illisible|dist\/main\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verrou de fabrication : la seconde est refusée tant que la première vit ; un verrou orphelin est repris', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-verrou-'));
  try {
    // Un processus vivant (celui des tests) tient le verrou : une autre fabrication est refusée.
    fs.writeFileSync(path.join(dir, '.fabrication.lock'), JSON.stringify({ pid: process.pid, since: 'maintenant' }));
    assert.throws(() => lockBuild(dir, 999_999), /une autre fabrication tourne/);
    // Fabrication lancée par publier.mjs, qui tient le verrou : acceptée.
    process.env.CYBERPINBALL_FABRICATION_PARENT = String(process.pid);
    try {
      assert.doesNotThrow(() => lockBuild(dir, 999_999));
    } finally {
      delete process.env.CYBERPINBALL_FABRICATION_PARENT;
    }
    // Un verrou laissé par un processus disparu : repris, puis libéré.
    fs.writeFileSync(path.join(dir, '.fabrication.lock'), JSON.stringify({ pid: 2_000_000_000, since: 'hier' }));
    const release = lockBuild(dir, process.pid);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.fabrication.lock'), 'utf8')).pid, process.pid);
    release();
    assert.ok(!fs.existsSync(path.join(dir, '.fabrication.lock')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
