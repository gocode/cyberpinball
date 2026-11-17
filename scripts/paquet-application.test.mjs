// Garde-fou du paquet de l'application (scripts/paquet-application.mjs) : la préversion
// 0.1.13-essai.1 est partie sans son code, deux fabrications s'étant croisées dans le même dossier.
// Un paquet sans code est refusé avant GitHub, et une seconde fabrication attend la première.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
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

/** Contenu de tous les fichiers d'un dossier, pour constater que rien n'a été écrit. */
function snapshot(dir) {
  const files = {};
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = path.join(entry.parentPath, entry.name);
      files[path.relative(dir, file)] = fs.readFileSync(file, 'utf8');
    }
  }
  return files;
}

// Le 17/11/2026, une seconde publication lancée pendant la 0.1.14-essai.35 a lu les étiquettes de
// GitHub, pris le même numéro, rassemblé changements/ et fait son propre commit « Version
// 0.1.14-essai.35 » ; le verrou ne l'a arrêtée qu'à la fabrication. Le verrou est désormais la
// première chose que fait publier.mjs : essayé sur une copie des scripts, sans GitHub ni git.
test('publication : avec le verrou tenu par une autre, elle s’arrête avant toute écriture ; un verrou orphelin est repris et libéré à la fin', () => {
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-publier-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const name of fs.readdirSync(scripts).filter((n) => n.endsWith('.mjs'))) fs.copyFileSync(path.join(scripts, name), path.join(root, 'scripts', name));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'essai', version: '0.1.14-essai.34', repository: { url: 'https://github.com/exemple/essai' } }));
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Nouveautés\n');
    fs.mkdirSync(path.join(root, 'changements'));
    fs.writeFileSync(path.join(root, 'changements', 'branche.md'), '## Français\n\n- Un point.\n\n## English\n\n- A point.\n');
    const lock = path.join(root, 'release', '.fabrication.lock');
    fs.mkdirSync(path.dirname(lock));
    const env = { ...process.env };
    delete env.CYBERPINBALL_FABRICATION_PARENT;
    delete env.CYBERPINBALL_VERSION_ESSAI;
    const publish = () => spawnSync(process.execPath, [path.join(root, 'scripts', 'publier.mjs'), '--rapide', '--essai'], { cwd: root, env, encoding: 'utf8', timeout: 60_000, windowsHide: true });

    // Une publication en cours (le processus des tests, vivant) tient le verrou.
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, since: 'maintenant' }));
    const before = snapshot(root);
    const second = publish();
    assert.equal(second.status, 1, second.stdout + second.stderr);
    assert.match(second.stderr, new RegExp(`Publication arrêtée : une autre fabrication tourne dans ce dossier \\(processus ${process.pid}`));
    assert.doesNotMatch(second.stdout, /Compilation|Numéro de version/);
    assert.deepEqual(snapshot(root), before, 'rien n’est écrit : ni package.json, ni CHANGELOG, ni changements/, ni le verrou');

    // Verrou d'un processus disparu : repris, la publication commence (et échoue ici faute de
    // TypeScript dans la copie), et le verrou est libéré à sa sortie.
    fs.writeFileSync(lock, JSON.stringify({ pid: 2_000_000_000, since: 'hier' }));
    const after = publish();
    assert.notEqual(after.status, 0);
    assert.match(after.stdout, /Compilation TypeScript/);
    assert.ok(!fs.existsSync(lock), 'verrou libéré à la sortie');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
