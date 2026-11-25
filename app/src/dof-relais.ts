// DOF des tables originales : lance le relais (relais-dof.ts, processus à part) le temps d'une partie,
// et garde de son journal ce qui sert à comprendre une borne qui reste éteinte.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DofRelayJob {
  dll: string;
  base: string;
  table: string;
  rom: string;
  tap: string;
}

export interface DofRelay {
  /** Le port des LED est rendu : libdof peut s'initialiser (et ouvrir les sorties). */
  begin(): void;
  /** Fin de partie : libdof éteint ses sorties et le relais sort (arrêté de force après 5 s). */
  stop(): void;
  /** Code de sortie du relais (null : arrêté de force, ou pas lancé). */
  done: Promise<number | null>;
}

/** La libdof de VPX (plugins\dof\dof64.dll) ; undefined si cette installation n'a pas le plugin. */
export function vpxDofDll(vpxExe: string): string | undefined {
  const dll = path.join(path.dirname(vpxExe), 'plugins', 'dof', 'dof64.dll');
  return fs.existsSync(dll) ? dll : undefined;
}

/** Lignes d'information de libdof gardées au journal : ce qui dit quelle config a été lue et ce qui a été ouvert. */
const USEFUL = /romname|table ?config|config loading|toys?\b|cabinet|globalconfig|output controller|no (?:config|table)/i;
const MAX_LINES = 40;

export function startDofRelay(job: DofRelayJob, log: (line: string) => void, script = path.join(__dirname, 'relais-dof.js')): DofRelay {
  const prefix = `DOF de la table originale (${job.rom}) :`; // i18n-ignore : journal
  const child = spawn(process.execPath, [script, Buffer.from(JSON.stringify(job)).toString('base64')], {
    windowsHide: true,
    cwd: path.dirname(job.dll),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  let kept = 0;
  child.stdout?.on('data', (data: Buffer) => {
    out += data.toString('utf8');
    const cut = out.lastIndexOf('\n');
    if (cut < 0) return;
    const lines = out.slice(0, cut).split(/\r?\n/);
    out = out.slice(cut + 1);
    for (const line of lines) {
      const [level, text = ''] = line.split('\t');
      if (level === 'ready') log(`${prefix} prêt.`); // i18n-ignore : journal
      else if (kept < MAX_LINES && (level === '1' || level === '2' || USEFUL.test(text))) {
        kept++;
        log(`${prefix} ${text}`);
      }
    }
  });
  child.stderr?.on('data', (data: Buffer) => (err = (err + data.toString('utf8')).slice(-2000)));
  let exited = false;
  const done = new Promise<number | null>((resolve) => {
    child.once('error', (error) => {
      exited = true;
      log(`${prefix} relais non lancé (${error.message}).`); // i18n-ignore : journal
      resolve(null);
    });
    child.once('exit', (code, signal) => {
      exited = true;
      if (code !== 0) log(`${prefix} le relais s'est arrêté (${signal ?? `code ${code}`})${err.trim() ? ` : ${err.trim().split(/\r?\n/).slice(-3).join(' | ')}` : ''}.`); // i18n-ignore : journal
      resolve(code);
    });
  });
  // Un relais qui n'est plus là (planté) ne fait pas tomber le front-end quand on lui écrit.
  child.stdin?.on('error', () => undefined);
  return {
    begin() {
      if (!exited) child.stdin?.write('init\n');
    },
    stop() {
      if (exited) return;
      child.stdin?.end();
      const kill = setTimeout(() => child.kill(), 5000);
      kill.unref();
      void done.then(() => clearTimeout(kill));
    },
    done,
  };
}
