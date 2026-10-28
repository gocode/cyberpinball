// Règle du pare-feu de Windows pour le réseau des bornes (packages/core/src/firewall.ts) : lue sans
// élévation, posée seulement par l'action « Autoriser dans le pare-feu de Windows » de l'écran
// « Partage et réseau », avec l'autorisation de Windows (UAC). Pendant un essai (réseau simulé ou
// coupé), une règle simulée tenue en mémoire : jamais le vrai pare-feu du poste.

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { firewallAddArgs, firewallDeleteArgs, firewallShowArgs, netshCommandLine, readFirewallShow, type FirewallState } from '@cyberpinball/core';

const SYSTEM32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
const NETSH = path.join(SYSTEM32, 'netsh.exe');
const POWERSHELL = path.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
/** Code de Start-Process quand l'utilisateur refuse l'élévation (ERROR_CANCELLED). */
const CANCELLED = 1223;

export type FirewallAllow = { ok: true } | { cancelled: true } | { error: string };

export interface FirewallRule {
  simulated: boolean;
  /** Dernier état lu (undefined : pas encore lu). */
  state(): FirewallState | undefined;
  check(): Promise<FirewallState>;
  /** Pose la règle pour cet exécutable : Windows demande l'autorisation. */
  allow(): Promise<FirewallAllow>;
}

function run(file: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => resolve({ status: null, stdout, stderr: error.message }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

export function createFirewallRule(opts: { exe: string; simulated: boolean; log?: (line: string) => void }): FirewallRule {
  let last: FirewallState | undefined;
  if (opts.simulated) {
    let allowed = false;
    return {
      simulated: true,
      state: () => last,
      async check() {
        return (last = allowed ? 'allowed' : 'missing');
      },
      async allow() {
        allowed = true;
        last = 'allowed';
        return { ok: true };
      },
    };
  }
  return {
    simulated: false,
    state: () => last,
    async check() {
      const r = await run(NETSH, firewallShowArgs());
      return (last = readFirewallShow(r.stdout, r.status, opts.exe));
    },
    async allow() {
      // Une seule élévation : l'ancienne règle retirée (autre emplacement), la nouvelle posée.
      const line = `${netshCommandLine(firewallDeleteArgs())} >nul 2>&1 & netsh ${netshCommandLine(firewallAddArgs(opts.exe))}`;
      const quoted = line.replace(/'/g, "''");
      const elevate = `try { $p = Start-Process -FilePath 'cmd.exe' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('/d', '/c', 'netsh ${quoted}'); exit $p.ExitCode } catch { [Console]::Error.WriteLine($_.Exception.Message); if ($_.Exception.Message -match 'cancel|annul') { exit ${CANCELLED} } else { exit 1 } }`;
      opts.log?.(`Pare-feu : règle demandée à Windows (UAC) pour ${opts.exe}.`); // i18n-ignore : journal
      const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', elevate]);
      await this.check();
      if (last === 'allowed') return { ok: true };
      if (r.status === CANCELLED) return { cancelled: true };
      return { error: r.stderr.trim() || `netsh : code ${r.status}` }; // i18n-ignore : message de Windows, sinon code de sortie
    },
  };
}
