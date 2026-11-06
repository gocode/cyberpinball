// Aucun processus ne survit à qui l'a lancé, ni ne retient sa sortie (01/11/2026). Un essai de
// l'assistant, tué à son délai, avait laissé vivant son relais du bureau caché : il tenait les
// tuyaux de sortie du test, qui a attendu 41 min. Ce que ces tests fixent :
// - le relais du bureau caché (packages/win-displays/src/desktop.ts) meurt avec son lanceur, quelle
//   que soit la façon dont celui-ci meurt, et n'hérite pas de sa console ;
// - les commandes du pare-feu (app/src/firewall-rule.ts) : entrée fermée, rendues à la fin du
//   processus, tuées arbre compris à leur délai, jamais lancées pendant un essai ;
// - tout Electron des tests passe par runElectron (electron-run.ts), qui tue au délai et échoue si
//   un processus de l'essai reste vivant.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { socialNetMode } from '../social';
import { killAll, processesWith } from './electron-run';
import { REPO_ROOT } from './i18n-scan';

const windows = process.platform === 'win32';
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('relais du bureau caché : tué avec son lanceur, sans garder ses tuyaux', { skip: windows ? false : 'Windows requis', timeout: 60_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-enfants-'));
  const marker = `relais-${path.basename(dir)}`;
  try {
    const launcher = path.join(dir, 'lanceur.js');
    const desktop = path.join(REPO_ROOT, 'packages', 'win-displays', 'dist', 'index.js');
    // Le relais : un node qui attendrait une minute ; le lanceur dit son numéro, puis attend.
    fs.writeFileSync(
      launcher,
      [
        `const { startOnHiddenDesktop } = require(${JSON.stringify(desktop)});`,
        `const run = startOnHiddenDesktop(${JSON.stringify(`"${process.execPath}" -e "setTimeout(() => {}, 60000)" ${marker}`)}, ${JSON.stringify(dir)}, ${JSON.stringify(path.join(dir, 'relais.txt'))});`,
        `console.log('relais ' + run.pid);`,
        `setInterval(() => {}, 1000);`,
      ].join('\n'),
    );
    const child = spawn(process.execPath, [launcher], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stderr.on('data', (d) => (out += d));
    const relay = await new Promise<number>((resolve, reject) => {
      child.stdout.on('data', (d) => {
        out += d;
        const m = out.match(/relais (\d+)/);
        if (m) resolve(Number(m[1]));
      });
      child.on('exit', () => reject(new Error(`lanceur fini avant le relais :\n${out}`)));
    });
    assert.ok(relay > 0);
    assert.deepEqual(processesWith(marker).map((p) => p.pid), [relay], 'le relais tourne sur le bureau caché');
    // Le lanceur tué net (TerminateProcess, comme le délai d'un test) : ses tuyaux se ferment avec
    // lui, et le relais meurt aussi.
    const closed = new Promise<number>((resolve) => {
      let exitAt = 0;
      child.on('exit', () => (exitAt = Date.now()));
      child.on('close', () => resolve(Date.now() - exitAt));
    });
    child.kill('SIGKILL');
    const afterExit = await closed;
    assert.ok(afterExit < 2000, `tuyaux du lanceur fermés ${afterExit} ms après sa fin : un enfant les tenait`);
    let left = processesWith(marker);
    for (let i = 0; i < 10 && left.length; i++) {
      await new Promise((r) => setTimeout(r, 300));
      left = processesWith(marker);
    }
    killAll(left);
    assert.deepEqual(left, [], 'le relais du bureau caché a survécu à son lanceur');
  } finally {
    killAll(processesWith(marker));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bureau caché : objet tâche tué à la fermeture, créé suspendu, console du lanceur pas héritée', () => {
  const src = read('packages/win-displays/src/desktop.ts');
  assert.match(src, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000/);
  assert.match(src, /CREATE_NO_WINDOW \| CREATE_SUSPENDED/);
  assert.match(src, /AssignProcessToJobObject\(job, pi\.hProcess\)[\s\S]*ResumeThread\(pi\.hThread\)/, 'rangé dans le job avant de démarrer');
  assert.match(src, /SetHandleInformation\(std, HANDLE_FLAG_INHERIT, 0\)[\s\S]*CreateProcessW\(/, 'console du lanceur rendue non héritable avant le lancement');
});

test('commandes du pare-feu : entrée fermée, fin du processus, délai qui tue l’arbre, arrêtées à la fermeture', () => {
  const src = read('app/src/firewall-rule.ts');
  assert.match(src, /spawn\(file, args, \{ windowsHide: true, stdio: \['ignore', 'pipe', 'pipe'\] \}\)/);
  assert.match(src, /child\.on\('exit'/, 'résultat rendu à la fin du processus, pas à la fermeture des tuyaux');
  assert.doesNotMatch(src, /child\.on\('close'/);
  assert.match(src, /taskkill\.exe', \['\/T', '\/F', '\/PID'/);
  assert.match(src, /process\.once\('exit', \(\) => running\.forEach\(killTree\)\)/);
  assert.match(src, /run\(POWERSHELL, \['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', elevate\], FIREWALL_ELEVATION_MS\)/, 'l’autorisation de Windows a son propre délai');
  // Toute commande passe par `run` (spawnRun ou celle d'un test) : aucun autre lancement direct.
  assert.equal(src.match(/\bspawn\(/g)?.length, 1);
});

test('commandes du pare-feu : un processus qui ne finit pas est arrêté au délai, arbre compris', { skip: windows ? false : 'Windows requis', timeout: 30_000 }, async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rule = require(path.join(REPO_ROOT, 'app', 'dist', 'firewall-rule.js')) as { spawnRun(file: string, args: string[], ms?: number): Promise<{ status: number | null; stderr: string }> };
  const marker = `pare-feu-delai-${process.pid}-${Date.now()}`;
  // Un node qui lance un petit-enfant (même marque), puis attend : le délai doit tuer les deux.
  const script = `require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', '${marker}'], { stdio: 'inherit' }); setTimeout(() => {}, 60000);`;
  const started = Date.now();
  const r = await rule.spawnRun(process.execPath, ['-e', script, marker], 1500);
  assert.ok(Date.now() - started < 6000, 'rendu au délai, pas à la fin du petit-enfant');
  assert.equal(r.status, null);
  assert.match(r.stderr, /sans réponse après 2 s, arrêté/);
  let left = processesWith(marker);
  for (let i = 0; i < 10 && left.length; i++) {
    await new Promise((res) => setTimeout(res, 300));
    left = processesWith(marker);
  }
  killAll(left);
  assert.deepEqual(left, [], 'commande du pare-feu restée vivante après son délai');
});

test('pendant un essai, le pare-feu n’est jamais touché : réseau coupé, règles simulées', () => {
  for (const name of ['CYBERPINBALL_AUTOPILOT', 'CYBERPINBALL_CAPTURE', 'CYBERPINBALL_STRESS', 'CYBERPINBALL_HOME', 'CYBERPINBALL_DISPLAYS']) {
    assert.equal(socialNetMode({ [name]: '1' }), 'off', name);
  }
  const front = read('app/src/frontend.ts');
  assert.match(front, /createFirewallRule\(\{ exe: process\.execPath, simulated: socialMode !== 'public'/, 'règles simulées hors du vrai réseau');
  assert.match(front, /if \(socialMode !== 'off'\) void checkFirewallAtStart\(\)/, 'aucune vérification au démarrage d’un essai');
});

test('tests : tout Electron passe par runElectron (tué au délai, aucun processus de l’essai laissé vivant)', () => {
  const dir = path.join(REPO_ROOT, 'packages', 'core', 'src', 'test');
  const direct = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && f !== 'electron-run.ts')
    .filter((f) => /\b(spawnSync|spawn|execFileSync|execFile)\(\s*electron\b/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(direct, []);
  const helper = read('packages/core/src/test/electron-run.ts');
  assert.match(helper, /stdio: \['ignore', fdOut, fdErr\]/, 'sortie dans des fichiers : rien à attendre que la fin du processus');
  assert.match(helper, /killAll\(left\)/);
  assert.match(helper, /for \(let i = 0; i < GRACE_POLLS && left\.length; i\+\+\)[\s\S]*?left = processesWith\(userData\);[\s\S]*?killAll\(left\)/, 'délai de grâce avant de déclarer un processus survivant (Chromium ferme les siens un à un)');
});
