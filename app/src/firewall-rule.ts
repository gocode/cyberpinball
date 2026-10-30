// Règles du pare-feu de Windows (packages/core/src/firewall.ts) : celle du réseau des bornes
// (CyberPinball.exe autorisé en entrée) et celle qui ferme VPX au réseau (l'inspector des parties
// entre amis). Lues sans élévation, posées seulement par l'action « Autoriser dans le pare-feu de
// Windows » de l'écran « Partage et réseau », avec l'autorisation de Windows (UAC), les deux sous
// la même demande. Pendant un essai (réseau simulé ou coupé), des règles simulées tenues en
// mémoire : jamais le vrai pare-feu du poste.
//
// La règle de VPX suit sa version active : `vpx()` rend, à chaque lecture, les programmes à viser
// (le dossier réel de la version et la jonction current) ; une règle posée pour une autre version
// se lit « other-version », et l'inspector reste éteint jusqu'à ce qu'elle soit reposée.

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { firewallCommandLine, firewallShowArgs, readFirewallShow, readVpxFirewallShow, vpxFirewallShowArgs, type FirewallState, type VpxFirewallState } from '@cyberpinball/core';

const SYSTEM32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
const NETSH = path.join(SYSTEM32, 'netsh.exe');
const POWERSHELL = path.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
/** Code de Start-Process quand l'utilisateur refuse l'élévation (ERROR_CANCELLED). */
const CANCELLED = 1223;

export type FirewallAllow = { ok: true } | { cancelled: true } | { error: string };

export interface FirewallRule {
  simulated: boolean;
  /** Dernier état lu de la règle de Cyber Pinball (undefined : pas encore lu). */
  state(): FirewallState | undefined;
  /** Dernier état lu de la règle de VPX (undefined : pas encore lu, ou VPX pas installé). */
  vpxState(): VpxFirewallState | undefined;
  check(): Promise<FirewallState>;
  /** Relit la règle de VPX pour sa version active ; undefined si VPX n'est pas installé. */
  checkVpx(): Promise<VpxFirewallState | undefined>;
  /** Pose les deux règles (celle de VPX si VPX est installé) : Windows demande l'autorisation une fois. */
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

/** `vpx` : les programmes que la règle de VPX doit viser maintenant (vpxFirewallPrograms), undefined sans VPX. */
export function createFirewallRule(opts: { exe: string; simulated: boolean; vpx?: () => string[] | undefined; log?: (line: string) => void }): FirewallRule {
  let last: FirewallState | undefined;
  let lastVpx: VpxFirewallState | undefined;
  if (opts.simulated) {
    let allowed = false;
    let closed: string[] = [];
    const vpxNow = (): VpxFirewallState | undefined => {
      const programs = opts.vpx?.();
      if (!programs?.length) return undefined;
      if (!closed.length) return 'missing';
      return programs.every((p) => closed.some((c) => c.toLowerCase() === p.toLowerCase())) ? 'closed' : 'other-version';
    };
    return {
      simulated: true,
      state: () => last,
      vpxState: () => lastVpx,
      async check() {
        lastVpx = vpxNow();
        return (last = allowed ? 'allowed' : 'missing');
      },
      async checkVpx() {
        return (lastVpx = vpxNow());
      },
      async allow() {
        allowed = true;
        closed = opts.vpx?.() ?? closed;
        last = 'allowed';
        lastVpx = vpxNow();
        return { ok: true };
      },
    };
  }
  return {
    simulated: false,
    state: () => last,
    vpxState: () => lastVpx,
    async check() {
      const r = await run(NETSH, firewallShowArgs());
      await this.checkVpx();
      return (last = readFirewallShow(r.stdout, r.status, opts.exe));
    },
    async checkVpx() {
      const programs = opts.vpx?.();
      if (!programs?.length) return (lastVpx = undefined);
      const r = await run(NETSH, vpxFirewallShowArgs());
      return (lastVpx = readVpxFirewallShow(r.stdout, r.status, programs));
    },
    async allow() {
      // Une seule élévation : chaque règle retirée (autre emplacement, autre version), puis reposée.
      const vpx = opts.vpx?.();
      const line = firewallCommandLine({ app: opts.exe, ...(vpx?.length ? { vpx } : {}) });
      const quoted = line.replace(/'/g, "''");
      const elevate = `try { $p = Start-Process -FilePath 'cmd.exe' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('/d', '/c', '${quoted}'); exit $p.ExitCode } catch { [Console]::Error.WriteLine($_.Exception.Message); if ($_.Exception.Message -match 'cancel|annul') { exit ${CANCELLED} } else { exit 1 } }`;
      opts.log?.(`Pare-feu : règles demandées à Windows (UAC) pour ${opts.exe}${vpx?.length ? ` et pour VPX (${vpx.join(', ')})` : ''}.`); // i18n-ignore : journal
      const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', elevate]);
      await this.check();
      if (last === 'allowed' && (!vpx?.length || lastVpx === 'closed')) return { ok: true };
      if (r.status === CANCELLED) return { cancelled: true };
      return { error: r.stderr.trim() || `netsh : code ${r.status}` }; // i18n-ignore : message de Windows, sinon code de sortie
    },
  };
}
