// Règles du pare-feu de Windows (packages/core/src/firewall.ts) : celle du réseau des bornes
// (CyberPinball.exe autorisé en entrée) et celle qui ferme VPX au réseau (l'inspector des parties
// entre amis). Lues sans élévation ; posées par l'action « Autoriser dans le pare-feu de Windows »
// (écran « Partage et réseau », ou celui qui s'ouvre après une mise à jour quand une règle manque),
// avec l'autorisation de Windows (UAC), les deux sous la même demande. Cette autorisation enregistre
// aussi la tâche de réparation : ensuite, `repair()` repose les règles sans aucune invite (la tâche
// a les droits d'administrateur), ce que fait le démarrage (firewall-guard.ts) dès qu'une règle
// manque ou ne correspond plus. Pendant un essai (réseau simulé ou coupé), des règles simulées
// tenues en mémoire : jamais le vrai pare-feu du poste. Les tests passent `run` : les commandes
// (PowerShell, netsh, schtasks) sont simulées.
//
// La lecture complète (`check`) passe par PowerShell, par programme : elle voit aussi les règles que
// Windows pose de lui-même quand son invite reste sans réponse (bloquantes, nommées « Cyber Pinball »
// comme la nôtre). Si PowerShell ne répond pas, netsh par nom, comme avant.
//
// La règle de VPX suit sa version active : `vpx()` rend, à chaque lecture, les programmes à viser
// (le dossier réel de la version et la jonction current) ; une règle posée pour une autre version
// se lit « other-version ». `checkVpx`, relu avant chaque partie entre amis, reste sur netsh (rapide).

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  appFirewallState,
  firewallReadScript,
  firewallSetupScript,
  firewallShowArgs,
  powershellEncodedArgs,
  psQuote,
  readFirewallRules,
  readFirewallShow,
  readVpxFirewallShow,
  repairTaskQueryArgs,
  repairTaskRunArgs,
  vpxFirewallShowArgs,
  vpxFirewallState,
  type FirewallState,
  type VpxFirewallState,
} from '@cyberpinball/core';

const SYSTEM32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
const NETSH = path.join(SYSTEM32, 'netsh.exe');
const SCHTASKS = path.join(SYSTEM32, 'schtasks.exe');
const POWERSHELL = path.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
/** Code de Start-Process quand l'utilisateur refuse l'élévation (ERROR_CANCELLED). */
const CANCELLED = 1223;

export type FirewallAllow = { ok: true } | { cancelled: true } | { error: string };

export type RunResult = { status: number | null; stdout: string; stderr: string };
export type Run = (file: string, args: string[], ms?: number) => Promise<RunResult>;

export interface FirewallRule {
  simulated: boolean;
  /** Dernier état lu de la règle de Cyber Pinball (undefined : pas encore lu). */
  state(): FirewallState | undefined;
  /** Dernier état lu de la règle de VPX (undefined : pas encore lu, ou VPX pas installé). */
  vpxState(): VpxFirewallState | undefined;
  /** La tâche de réparation est-elle enregistrée (undefined : pas encore lu) ? */
  taskState(): boolean | undefined;
  /** Relit les deux règles et la tâche de réparation. */
  check(): Promise<FirewallState>;
  /** Relit la règle de VPX pour sa version active ; undefined si VPX n'est pas installé. */
  checkVpx(): Promise<VpxFirewallState | undefined>;
  /** Pose les deux règles et la tâche de réparation : Windows demande l'autorisation une fois. */
  allow(): Promise<FirewallAllow>;
  /** Lance la tâche de réparation (sans invite) et relit les règles ; faux si la tâche manque ou n'a rien réparé. */
  repair(): Promise<boolean>;
}

/** Délai d'une commande du pare-feu ; l'autorisation de Windows (UAC) attend une réponse : plus long. */
export const FIREWALL_COMMAND_MS = 30_000;
export const FIREWALL_ELEVATION_MS = 5 * 60_000;

/** Commandes du pare-feu en cours : arrêtées, arbre compris, à la fermeture de l'application. */
const running = new Set<number>();
const killTree = (pid: number) => {
  spawnSync('taskkill.exe', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
  running.delete(pid);
};
process.once('exit', () => running.forEach(killTree));

/**
 * Une commande du pare-feu (PowerShell, netsh, schtasks) : entrée fermée, rien d'hérité de la
 * console de l'application, résultat rendu à la fin du processus (pas à la fermeture de ses
 * tuyaux, qu'un petit-enfant pourrait tenir), et au délai, arbre compris tué : jamais elle ne
 * retient l'application ni la sortie de qui l'a lancée.
 */
export function spawnRun(file: string, args: string[], ms = FIREWALL_COMMAND_MS): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let done = false;
    const end = (result: RunResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (child.pid) running.delete(child.pid);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve(result);
    };
    if (child.pid) running.add(child.pid);
    const timer = setTimeout(() => {
      if (child.pid) killTree(child.pid);
      end({ status: null, stdout, stderr: `${stderr}\n${path.basename(file)} : sans réponse après ${Math.round(ms / 1000)} s, arrêté.`.trim() }); // i18n-ignore : journal
    }, ms);
    timer.unref();
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => end({ status: null, stdout, stderr: error.message }));
    // « exit » plutôt que « close » : la sortie déjà lue suffit, un tuyau tenu ailleurs n'attend pas.
    child.on('exit', (status) => setImmediate(() => end({ status, stdout, stderr })));
  });
}

/** Le dossier des versions de VPX (emulators\vpx) : au-dessus du dossier de l'exécutable, réel ou par la jonction. */
function vpxDirOf(programs: readonly string[] | undefined): string | undefined {
  const last = programs?.at(-1);
  return last ? path.dirname(path.dirname(last)) : undefined;
}

/**
 * `vpx` : les programmes que la règle de VPX doit viser maintenant (vpxFirewallPrograms), undefined
 * sans VPX. `run` : les commandes (tests) ; `wait` : la pause entre deux relectures après la réparation.
 */
export function createFirewallRule(opts: { exe: string; simulated: boolean; vpx?: () => string[] | undefined; log?: (line: string) => void; run?: Run; wait?: (ms: number) => Promise<void> }): FirewallRule {
  let last: FirewallState | undefined;
  let lastVpx: VpxFirewallState | undefined;
  let lastTask: boolean | undefined;
  if (opts.simulated) {
    let allowed = false;
    let closed: string[] = [];
    let task = false;
    const vpxNow = (): VpxFirewallState | undefined => {
      const programs = opts.vpx?.();
      if (!programs?.length) return undefined;
      if (!closed.length) return 'missing';
      return programs.every((p) => closed.some((c) => c.toLowerCase() === p.toLowerCase())) ? 'closed' : 'other-version';
    };
    const pose = () => {
      allowed = true;
      closed = opts.vpx?.() ?? closed;
    };
    return {
      simulated: true,
      state: () => last,
      vpxState: () => lastVpx,
      taskState: () => lastTask,
      async check() {
        lastVpx = vpxNow();
        lastTask = task;
        return (last = allowed ? 'allowed' : 'missing');
      },
      async checkVpx() {
        return (lastVpx = vpxNow());
      },
      async allow() {
        pose();
        task = true;
        await this.check();
        return { ok: true };
      },
      async repair() {
        if (!task) return false;
        pose();
        await this.check();
        return true;
      },
    };
  }
  const run = opts.run ?? spawnRun;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const checkTask = async () => (lastTask = (await run(SCHTASKS, repairTaskQueryArgs())).status === 0);
  const good = () => last === 'allowed' && (lastVpx === undefined || lastVpx === 'closed');
  return {
    simulated: false,
    state: () => last,
    vpxState: () => lastVpx,
    taskState: () => lastTask,
    async check() {
      const vpx = opts.vpx?.();
      const ps = await run(POWERSHELL, powershellEncodedArgs(firewallReadScript([opts.exe, ...(vpx ?? [])])));
      const read = readFirewallRules(ps.stdout, ps.status);
      await checkTask();
      if (read) {
        lastVpx = vpx?.length ? vpxFirewallState(read, vpx) : undefined;
        return (last = appFirewallState(read, opts.exe));
      }
      // PowerShell muet : netsh, par nom (sans voir les règles bloquantes de l'invite de Windows).
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
      // Une seule élévation : les règles reposées (toute règle d'entrée sur l'exécutable retirée
      // d'abord), puis la tâche de réparation enregistrée. Le script passe par un fichier : il est
      // trop long pour la ligne de commande de l'élévation. UTF-8 avec BOM, que PowerShell 5 lit.
      const vpx = opts.vpx?.();
      const vpxDir = vpxDirOf(vpx);
      const script = path.join(os.tmpdir(), `cyberpinball-pare-feu-${process.pid}-${Date.now()}.ps1`);
      fs.writeFileSync(script, `\ufeff${firewallSetupScript({ exe: opts.exe, ...(vpxDir ? { vpxDir } : {}) })}\r\n`, 'utf8');
      const elevate = `try { $p = Start-Process -FilePath ${psQuote(POWERSHELL)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ${psQuote(`"${script}"`)}); exit $p.ExitCode } catch { [Console]::Error.WriteLine($_.Exception.Message); if ($_.Exception.Message -match 'cancel|annul') { exit ${CANCELLED} } else { exit 1 } }`;
      opts.log?.(`Pare-feu : règles et réparation automatique demandées à Windows (UAC) pour ${opts.exe}${vpx?.length ? ` et pour VPX (${vpxDir})` : ''}.`); // i18n-ignore : journal
      try {
        const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', elevate], FIREWALL_ELEVATION_MS);
        await this.check();
        if (good()) return { ok: true };
        if (r.status === CANCELLED) return { cancelled: true };
        return { error: r.stderr.trim() || `PowerShell : code ${r.status}` }; // i18n-ignore : message de Windows, sinon code de sortie
      } finally {
        fs.rmSync(script, { force: true });
      }
    },
    async repair() {
      if (!(await checkTask())) return false;
      const r = await run(SCHTASKS, repairTaskRunArgs());
      if (r.status !== 0) {
        opts.log?.(`Pare-feu : la tâche de réparation n’a pas démarré (${r.stderr.trim() || `code ${r.status}`}).`); // i18n-ignore : journal
        return false;
      }
      // La tâche tourne à part : relire jusqu'à ce que les règles soient là (une vingtaine de secondes au plus).
      for (let i = 0; i < 8; i++) {
        await wait(2500);
        await this.check();
        if (good()) return true;
      }
      return false;
    },
  };
}
