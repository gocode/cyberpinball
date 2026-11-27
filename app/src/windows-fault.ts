// Le module fautif d'un VPX planté sans crash.txt, lu dans le journal Application de Windows
// (événement 1000, « Application Error ») : la règle et la lecture des champs sont dans
// packages/core/src/windowsfault.ts ; ici, la commande PowerShell qui les sort.

import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { faultQueryScript, parseWindowsFault, POWERSHELL_POLICY, type WindowsFault } from '@cyberpinball/core';

/** Windows écrit l'événement juste après l'arrêt du programme : deux lectures, la seconde un peu plus tard. */
const FAULT_TRIES_MS = [600, 1500];
const FAULT_TIMEOUT_MS = 6000;

function query(since: number): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', POWERSHELL_POLICY, '-Command', faultQueryScript(since)],
      { windowsHide: true, timeout: FAULT_TIMEOUT_MS, encoding: 'utf8' },
      (_error, stdout) => resolve(stdout ?? ''),
    );
  });
}

/** L'arrêt de `exe` noté par Windows depuis `since` (ms) ; undefined hors Windows ou si rien n'est noté. */
export async function readWindowsFault(exe: string, since: number): Promise<WindowsFault | undefined> {
  if (process.platform !== 'win32') return undefined;
  for (const wait of FAULT_TRIES_MS) {
    await new Promise((r) => setTimeout(r, wait));
    const fault = parseWindowsFault(await query(since), path.basename(exe));
    if (fault) return fault;
  }
  return undefined;
}
