// Lancement d'Electron par les tests (assistant, cadres, textes, hors écran). Décidé le 01/11/2026,
// après un essai bloqué 41 min : spawnSync attendait la fermeture des tuyaux de sortie, qu'un relais
// du bureau caché resté vivant tenait encore, bien après le délai. Ici, la sortie va dans des
// fichiers (rien à attendre que la fin du processus lancé) ; après la fin, ou au délai, tout
// processus resté vivant de cet essai (reconnu à son dossier --user-data-dir, que Chromium passe à
// chacun de ses processus) est tué, arbre compris, et le test échoue en le nommant.

import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ElectronRun {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** Après la fin d'Electron, ses processus ont jusqu'à GRACE_POLLS × GRACE_STEP_MS pour partir d'eux-mêmes. */
export const GRACE_POLLS = 10;
export const GRACE_STEP_MS = 500;

/** Processus vivants dont la ligne de commande contient `marker` (Windows), hors celui qui cherche. */
export function processesWith(marker: string): { pid: number; name: string }[] {
  if (process.platform !== 'win32') return [];
  const needle = marker.replace(/'/g, "''");
  const ps = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains('${needle}') } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 },
  );
  return (ps.stdout ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim().match(/^(\d+) (.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ pid: Number(m[1]), name: m[2]! }));
}

/** Tue chacun, arbre compris ; rend ce qui a été trouvé. */
export function killAll(found: { pid: number; name: string }[]): void {
  for (const p of found) spawnSync('taskkill.exe', ['/T', '/F', '/PID', String(p.pid)], { stdio: 'ignore', windowsHide: true });
}

/**
 * Lance Electron (`args` doit porter --user-data-dir, propre à l'essai), sortie dans `dir`, avec ce
 * délai ; au retour, aucun processus de l'essai ne doit rester vivant (sinon : tués, et échec).
 */
export function runElectron(electron: string, args: string[], opts: { dir: string; timeout: number; env?: NodeJS.ProcessEnv; cwd?: string }): ElectronRun {
  const userData = args.find((a) => a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
  assert.ok(userData, 'runElectron : --user-data-dir propre à l’essai requis (il sert à retrouver ses processus)');
  const out = path.join(opts.dir, `electron-${process.pid}-${Date.now()}.out.txt`);
  const err = `${out.slice(0, -'.out.txt'.length)}.err.txt`;
  const fdOut = fs.openSync(out, 'w');
  const fdErr = fs.openSync(err, 'w');
  let run;
  try {
    const options: SpawnSyncOptions = { env: opts.env, stdio: ['ignore', fdOut, fdErr], timeout: opts.timeout, killSignal: 'SIGKILL', windowsHide: true };
    if (opts.cwd) options.cwd = opts.cwd;
    run = spawnSync(electron, args, options);
  } finally {
    fs.closeSync(fdOut);
    fs.closeSync(fdErr);
  }
  // Chromium arrête ses processus (GPU, rendu, utilitaires) un à un après la fin du principal :
  // sous charge (plusieurs suites en parallèle), ils ne sont pas tous partis à l'instant où
  // spawnSync rend (échecs du 06/11/2026, jamais reproduits seuls). Délai de grâce, comme les
  // autres garde-fous (enfants-vivants.test.ts) ; un relais qui tient vraiment reste attrapé.
  let left = processesWith(userData);
  for (let i = 0; i < GRACE_POLLS && left.length; i++) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, GRACE_STEP_MS);
    left = processesWith(userData);
  }
  killAll(left);
  const result: ElectronRun = { status: run.status, signal: run.signal, stdout: fs.readFileSync(out, 'utf8'), stderr: fs.readFileSync(err, 'utf8') };
  fs.rmSync(out, { force: true });
  fs.rmSync(err, { force: true });
  const timedOut = run.error && /ETIMEDOUT/.test(String(run.error)) ? `Electron sans réponse après ${Math.round(opts.timeout / 1000)} s, tué.\n` : '';
  assert.deepEqual(left, [], `${timedOut}processus de l’essai restés vivants après sa fin (tués) : ${left.map((p) => `${p.name} ${p.pid}`).join(', ')}\n${result.stdout}\n${result.stderr}`);
  if (timedOut) result.stderr = `${timedOut}${result.stderr}`;
  return result;
}
