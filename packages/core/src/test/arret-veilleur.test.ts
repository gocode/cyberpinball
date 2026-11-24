// Arrêt du veilleur de la relance par Start avant une mise à jour.
//
// Le 24/11/2026, sur un PinCab, une mise à jour légère (essai.17 vers essai.22) a fermé
// l'application sans rien faire d'autre : Cyber Pinball avait été lancé par le veilleur (appui long
// sur Start), donc en était l'enfant, et l'arrêt du veilleur par `taskkill /T` (arbre entier) l'avait
// tuée avant qu'elle lance la mise en place et rende les écrans. Invariant fixé ici : arrêter le
// veilleur n'arrête jamais l'application qui le demande (ni aucun de ses descendants).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { relaunchWatcherPidFile, stopProcessAlone, stopRelaunchWatcherAt } from '../start-relaunch';
import { REPO_ROOT } from './i18n-scan';

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const until = async (what: () => boolean, ms = 20_000): Promise<boolean> => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (what()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return what();
};

test('arrêt du veilleur : son enfant (l’application qui demande l’arrêt) survit, le veilleur disparaît', { timeout: 90_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arret-veilleur-'));
  const data = path.join(dir, 'data');
  fs.mkdirSync(path.dirname(relaunchWatcherPidFile(data)), { recursive: true });
  const stopModule = path.join(__dirname, '..', 'start-relaunch.js');
  const result = path.join(dir, 'resultat.json');
  const survived = path.join(dir, 'survie.txt');
  const appPidFile = path.join(dir, 'application.pid');

  // « Application » : demande l'arrêt du veilleur (comme installLight), puis prouve qu'elle vit encore.
  const appScript = path.join(dir, 'application.js');
  fs.writeFileSync(
    appScript,
    [
      `const fs = require('fs');`,
      `const { stopRelaunchWatcherAt } = require(${JSON.stringify(stopModule)});`,
      `fs.writeFileSync(${JSON.stringify(appPidFile)}, String(process.pid));`,
      `const stopped = stopRelaunchWatcherAt(${JSON.stringify(data)}, () => true);`,
      `fs.writeFileSync(${JSON.stringify(result)}, JSON.stringify({ stopped }));`,
      `setTimeout(() => fs.writeFileSync(${JSON.stringify(survived)}, 'vivant'), 2000);`,
      `setTimeout(() => process.exit(0), 6000);`,
    ].join('\n'),
  );
  // « Veilleur » : écrit son pid, lance l'application détachée comme le vrai (veilleur.ts), reste vivant.
  const watcherScript = path.join(dir, 'veilleur.js');
  fs.writeFileSync(
    watcherScript,
    [
      `const fs = require('fs');`,
      `const { spawn } = require('child_process');`,
      `fs.writeFileSync(${JSON.stringify(relaunchWatcherPidFile(data))}, String(process.pid));`,
      `spawn(process.execPath, [${JSON.stringify(appScript)}], { detached: true, stdio: 'ignore', windowsHide: true }).unref();`,
      `setInterval(() => {}, 1000);`,
    ].join('\n'),
  );

  const watcher = spawn(process.execPath, [watcherScript], { stdio: 'ignore', windowsHide: true });
  const watcherPid = watcher.pid as number;
  let appPid: number | undefined;
  try {
    assert.ok(await until(() => fs.existsSync(result)), 'l’application a rendu la main après avoir demandé l’arrêt');
    appPid = Number.parseInt(fs.readFileSync(appPidFile, 'utf8'), 10);
    assert.equal(JSON.parse(fs.readFileSync(result, 'utf8')).stopped, watcherPid, 'le pid du veilleur arrêté est rendu');
    assert.ok(await until(() => !alive(watcherPid)), 'le veilleur est arrêté');
    assert.ok(!fs.existsSync(relaunchWatcherPidFile(data)), 'veilleur.pid supprimé');
    assert.ok(await until(() => fs.existsSync(survived)), 'l’application, enfant du veilleur, vit encore après son arrêt');
    assert.ok(alive(appPid), 'processus de l’application toujours là');
  } finally {
    if (alive(watcherPid)) process.kill(watcherPid, 'SIGKILL');
    if (appPid && alive(appPid)) process.kill(appPid, 'SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('arrêt du veilleur : jamais le processus courant, rien sans pid valide, pid inconnu sans effet', () => {
  assert.equal(stopProcessAlone(process.pid), false);
  assert.ok(alive(process.pid));
  assert.equal(stopProcessAlone(0), false);
  assert.equal(stopProcessAlone(-5), false);
  assert.equal(stopProcessAlone(Number.NaN), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arret-veilleur-'));
  try {
    // Sans veilleur.pid, ou si le pid n'est pas celui du veilleur : rien n'est arrêté.
    assert.equal(
      stopRelaunchWatcherAt(dir, () => true),
      undefined,
    );
    fs.mkdirSync(path.dirname(relaunchWatcherPidFile(dir)), { recursive: true });
    fs.writeFileSync(relaunchWatcherPidFile(dir), `${process.pid}\n`);
    assert.equal(
      stopRelaunchWatcherAt(dir, () => false),
      undefined,
    );
    assert.ok(fs.existsSync(relaunchWatcherPidFile(dir)), 'veilleur.pid gardé quand le pid n’est pas le veilleur');
    assert.ok(alive(process.pid));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('arrêt du veilleur : aucun appelant n’arrête l’arbre du veilleur (taskkill /T), installeur et déploiement compris', () => {
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  assert.doesNotMatch(read('app/src/start-relaunch.ts'), /taskkill/);
  assert.doesNotMatch(read('packages/core/src/start-relaunch.ts'), /'\/T'/);
  const nsi = read('scripts/installeur/cyberpinball.nsi');
  const nsiKill = nsi.split(/\r?\n/).filter((l) => /taskkill\.exe/.test(l) && !l.trim().startsWith(';'));
  assert.ok(nsiKill.length > 0);
  for (const l of nsiKill) assert.doesNotMatch(l, /\/T\b/, l);
  const build = read('scripts/fabriquer.mjs');
  const deploy = build.split(/\r?\n/).filter((l) => /taskkill/.test(l) && /veilleur|watcherPid/.test(l));
  assert.ok(deploy.length > 0);
  for (const l of deploy) assert.doesNotMatch(l, /'\/T'/, l);
});
