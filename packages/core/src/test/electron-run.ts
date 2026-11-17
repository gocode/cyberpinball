// Lancement d'Electron par les tests (assistant, cadres, textes, hors écran). Décidé le 01/11/2026,
// après un essai bloqué 41 min : spawnSync attendait la fermeture des tuyaux de sortie, qu'un relais
// du bureau caché resté vivant tenait encore, bien après le délai. Ici, la sortie va dans des
// fichiers (rien à attendre que la fin du processus lancé) ; après la fin, ou au délai, tout
// processus resté vivant de cet essai (reconnu à son dossier --user-data-dir, que Chromium passe à
// chacun de ses processus) est tué, arbre compris, et le test échoue en le nommant.
//
// Les lignes de commande sont lues nativement (koffi : instantané Toolhelp, puis
// NtQueryInformationProcess), en quelques millisecondes. Jusqu'au 17/11/2026, chaque relevé lançait
// PowerShell et une requête CIM : 3 s seul, 8,6 s en moyenne sous la charge d'une suite, 168 relevés
// pour 35 lancements d'Electron ; et le délai de grâce, compté en relevés, s'épuisait avant que
// Chromium ait fermé les siens. Un essai par la parenté (numéro du parent) a été écarté le même jour :
// sur une machine qui lance des centaines d'Electron, Windows redonne vite le numéro d'un processus
// fini, et les processus d'un autre essai passaient pour des descendants.

import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as koffi from 'koffi';

export interface ElectronRun {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** Après la fin d'Electron, ses processus ont jusqu'à GRACE_MS pour partir d'eux-mêmes (relevés toutes les GRACE_STEP_MS). */
export const GRACE_MS = 60_000;
export const GRACE_STEP_MS = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;
let native: { snapshot: NativeFn; first: NativeFn; next: NativeFn; close: NativeFn; open: NativeFn; times: NativeFn; query: NativeFn } | undefined;
function api() {
  if (native) return native;
  const k = koffi.load('kernel32.dll');
  const nt = koffi.load('ntdll.dll');
  native = {
    snapshot: k.func('intptr_t __stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)'),
    first: k.func('bool __stdcall Process32FirstW(intptr_t snapshot, void *entry)'),
    next: k.func('bool __stdcall Process32NextW(intptr_t snapshot, void *entry)'),
    close: k.func('bool __stdcall CloseHandle(intptr_t handle)'),
    open: k.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
    times: k.func('bool __stdcall GetProcessTimes(intptr_t process, void *creation, void *exit, void *kernel, void *user)'),
    query: nt.func('int32_t __stdcall NtQueryInformationProcess(intptr_t process, uint32_t infoClass, void *info, uint32_t length, void *returned)'),
  };
  return native;
}

// PROCESSENTRY32W (tlhelp32.h) en 64 bits, comme packages/win-displays/src/processes.ts.
const ENTRY_SIZE = 568;
const OFFSET_PID = 8;
const OFFSET_EXE_FILE = 44;
/** Écart entre l'origine des FILETIME (1601) et celle de Date (1970), en millisecondes. */
const FILETIME_EPOCH_MS = 11_644_473_600_000;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
/** ProcessCommandLineInformation : un UNICODE_STRING (16 octets en 64 bits), le texte juste après. */
const PROCESS_COMMAND_LINE_INFORMATION = 60;
const COMMAND_LINE_BUFFER = 65_536;

/** Processus vivants (numéro et exécutable), d'après l'instantané Toolhelp. */
function snapshotProcesses(): { pid: number; name: string }[] {
  const w = api();
  const snapshot = Number(w.snapshot(0x2 /* TH32CS_SNAPPROCESS */, 0));
  if (snapshot === -1) return [];
  const all: { pid: number; name: string }[] = [];
  try {
    const entry = Buffer.alloc(ENTRY_SIZE);
    entry.writeUInt32LE(ENTRY_SIZE, 0);
    for (let ok = w.first(snapshot, entry); ok; ok = w.next(snapshot, entry)) {
      const raw = entry.toString('utf16le', OFFSET_EXE_FILE, OFFSET_EXE_FILE + 520);
      const end = raw.indexOf('\0');
      all.push({ pid: entry.readUInt32LE(OFFSET_PID), name: end < 0 ? raw : raw.slice(0, end) });
    }
  } finally {
    w.close(snapshot);
  }
  return all;
}

/** Heure de création (ms depuis 1970) et ligne de commande d'un processus ; undefined s'il est parti ou fermé à la lecture. */
function describe(pid: number, wantLine: (created: number) => boolean): { created: number; line?: string } | undefined {
  const w = api();
  const handle = w.open(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) as number | bigint;
  if (!handle) return undefined;
  try {
    const [creation, exit, kernel, user] = [Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8)];
    if (!w.times(handle, creation, exit, kernel, user)) return undefined;
    const created = Number(creation.readBigUInt64LE(0) / 10_000n) - FILETIME_EPOCH_MS;
    if (!wantLine(created)) return { created };
    const info = Buffer.alloc(COMMAND_LINE_BUFFER);
    const returned = Buffer.alloc(4);
    if (w.query(handle, PROCESS_COMMAND_LINE_INFORMATION, info, info.length, returned) !== 0) return { created };
    const length = info.readUInt16LE(0);
    return { created, line: info.toString('utf16le', 16, 16 + Math.min(length, COMMAND_LINE_BUFFER - 16)) };
  } finally {
    w.close(handle);
  }
}

/**
 * Processus vivants dont la ligne de commande contient `marker`, hors celui qui cherche. `since`
 * (ms depuis 1970) : seuls ceux créés depuis sont lus, les autres sont écartés sans lire leur ligne.
 */
export function processesWith(marker: string, since = 0): { pid: number; name: string }[] {
  if (process.platform !== 'win32') return [];
  const found: { pid: number; name: string }[] = [];
  for (const p of snapshotProcesses()) {
    if (p.pid === process.pid || p.pid === 0 || p.pid === 4) continue;
    // Une seconde de marge : l'horloge des processus n'a pas la précision de Date.now().
    const seen = describe(p.pid, (created) => created >= since - 1000);
    if (seen?.line?.includes(marker)) found.push(p);
  }
  return found;
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
  const started = Date.now();
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
  // spawnSync rend (échecs du 06/11/2026, jamais reproduits seuls). Délai de grâce en temps, relevés
  // rapprochés ; un relais qui tient vraiment reste attrapé.
  let left = processesWith(userData, started);
  for (const deadline = Date.now() + GRACE_MS; left.length && Date.now() < deadline; ) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, GRACE_STEP_MS);
    left = processesWith(userData, started);
  }
  killAll(left);
  const result: ElectronRun = { status: run.status, signal: run.signal, stdout: fs.readFileSync(out, 'utf8'), stderr: fs.readFileSync(err, 'utf8') };
  fs.rmSync(out, { force: true });
  fs.rmSync(err, { force: true });
  const timedOut = run.error && /ETIMEDOUT/.test(String(run.error)) ? `Electron sans réponse après ${Math.round(opts.timeout / 1000)} s, tué.\n` : '';
  assert.deepEqual(left, [], `${timedOut}processus de l’essai restés vivants ${GRACE_MS / 1000} s après sa fin (tués) : ${left.map((p) => `${p.name} ${p.pid}`).join(', ')}\n${result.stdout}\n${result.stderr}`);
  if (timedOut) result.stderr = `${timedOut}${result.stderr}`;
  return result;
}
