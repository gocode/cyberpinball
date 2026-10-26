// Exécuteur des opérations système de la borne dédiée (dedicated-menu.ts) : le seul endroit
// de l'application qui demande l'élévation de Windows (UAC) et lance le script élevé
// (dedicated.ts, core). Deux exécuteurs :
// - le vrai, sur la borne installée ;
// - le simulé (Windows en mémoire, gardé dans un fichier), pour les essais hors écran, les
//   bacs à sable (CYBERPINBALL_HOME) et CYBERPINBALL_BORNE_SIMULEE : jamais rien d'écrit dans
//   Windows, jamais d'Explorateur lancé.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  dedicatedDir,
  elevatedScript,
  freshWindows,
  readElevatedOutcome,
  readJsonFile,
  simulateRun,
  type ElevatedOutcome,
  type ElevatedRun,
  type SimulatedWindows,
} from '@cyberpinball/core';
import { listWindows } from '@cyberpinball/win-displays';
import { OFFSCREEN } from './offscreen';

/** Ce que l'écran lit de Windows, sans élévation. */
export interface DedicatedProbe {
  user: string;
  sid: string;
  editionId: string;
  build: number;
  /** Comptes administrateurs actifs autres que celui-ci ; undefined : la liste n'a pas pu être lue. */
  otherAdmins?: string[];
}

export type ElevatedResult = { outcome: ElevatedOutcome } | { cancelled: true } | { error: string };

export interface DedicatedSystem {
  /** Windows simulé : rien n'est écrit, rien n'est lancé. */
  readonly simulated: boolean;
  /** Lecture seule, sans élévation : compte, SID, édition de Windows, autres administrateurs. */
  probe(): Promise<DedicatedProbe>;
  /** Seule écriture : le script élevé, après l'autorisation de Windows (UAC). */
  runElevated(run: ElevatedRun): Promise<ElevatedResult>;
  /** Une fenêtre de l'Explorateur (un processus ; rien n'est écrit). */
  openExplorer(): void;
  /** Une fenêtre de l'Explorateur, ou sa barre des tâches, est à l'écran. */
  explorerShown(): boolean;
}

/** Simulé hors écran, dans un bac à sable ou à la demande ; le vrai seulement sur une borne réelle. */
export function createDedicatedSystem(dataDir: string): DedicatedSystem {
  const simulation = process.env.CYBERPINBALL_BORNE_SIMULEE;
  if (simulation || OFFSCREEN || process.env.CYBERPINBALL_HOME) return simulatedSystem(simulation || path.join(dedicatedDir(dataDir), 'windows-simule.json'));
  return realSystem(dataDir);
}

// ---------------------------------------------------------------------------
// Le vrai

const POWERSHELL = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
/** Code de Start-Process quand l'utilisateur refuse l'élévation (ERROR_CANCELLED). */
const CANCELLED = 1223;

/** Lecture sans élévation : le compte, l'édition de Windows, les comptes administrateurs actifs. */
const PROBE = String.raw`# i18n-ignore : script PowerShell
$ErrorActionPreference = 'SilentlyContinue'
$id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$out = [ordered]@{ user = ($id.Name -split '\\')[-1]; sid = $id.User.Value; editionId = "$($cv.EditionID)"; build = [int]$cv.CurrentBuildNumber }
try {
  $members = @(Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop | Where-Object { $_.ObjectClass -eq 'User' -and "$($_.SID)" -ne $id.User.Value })
  $out.otherAdmins = @($members | Where-Object { $u = Get-LocalUser -SID $_.SID -ErrorAction SilentlyContinue; -not $u -or $u.Enabled } | ForEach-Object { ($_.Name -split '\\')[-1] })
} catch {}
$out | ConvertTo-Json -Compress
`;

function powershell(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => resolve({ status: -1, stdout, stderr: error.message }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function realSystem(dataDir: string): DedicatedSystem {
  return {
    simulated: false,
    async probe() {
      const r = await powershell(['-Command', PROBE]);
      const probe = JSON.parse(r.stdout.trim() || '{}') as Partial<DedicatedProbe> & { otherAdmins?: string[] | string };
      if (!probe.sid) throw new Error(r.stderr.trim() || 'compte illisible'); // i18n-ignore : message de Windows, sinon raison technique
      const others = probe.otherAdmins;
      return { user: probe.user ?? '', sid: probe.sid, editionId: probe.editionId ?? '', build: probe.build ?? 0, otherAdmins: others === undefined ? undefined : Array.isArray(others) ? others : [others] };
    },
    async runElevated(run) {
      const dir = dedicatedDir(dataDir);
      fs.mkdirSync(dir, { recursive: true });
      const script = path.join(dir, `${run.kind === 'activate' ? 'activer' : 'desactiver-maintenant'}.ps1`);
      const result = path.join(dir, `resultat-${run.kind === 'activate' ? 'activation' : 'desactivation'}.json`);
      fs.rmSync(result, { force: true });
      // BOM : Windows PowerShell lit sinon le script en ANSI (accents des chemins).
      fs.writeFileSync(script, '\ufeff' + elevatedScript(run, result), 'utf8');
      const quoted = script.replace(/'/g, "''");
      const elevate = `try { $p = Start-Process -FilePath '${POWERSHELL}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '"${quoted}"'); exit $p.ExitCode } catch { [Console]::Error.WriteLine($_.Exception.Message); if ($_.Exception.Message -match 'cancel|annul') { exit ${CANCELLED} } else { exit 1 } }`;
      console.log(`Borne dédiée : ${run.kind === 'activate' ? 'activation' : 'désactivation'} demandée à Windows (UAC), script ${script}.`);
      const r = await powershell(['-Command', elevate]);
      const outcome = readElevatedOutcome(result);
      if (outcome) return { outcome };
      if (r.status === CANCELLED) return { cancelled: true };
      return { error: r.stderr.trim() || `PowerShell : code ${r.status}` };
    },
    openExplorer() {
      // Fenêtre voulue : celle de l'Explorateur (windowsHide la cacherait).
      spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe'), [], { detached: true, stdio: 'ignore' }).unref(); // fenêtre voulue
    },
    explorerShown() {
      return listWindows((w) => w.visible && (w.className === 'CabinetWClass' || w.className === 'Shell_TrayWnd')).length > 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Le simulé

/** Fichier de la simulation : l'état de Windows, ce que voit l'écran, et l'autorisation refusée ou non. */
interface Simulation {
  windows: SimulatedWindows;
  probe: DedicatedProbe;
  /** L'utilisateur refuse l'autorisation de Windows à la prochaine demande. */
  cancel?: boolean;
  /** Ce que la simulation a fait, dans l'ordre (vérifié par les démonstrations). */
  journal?: string[];
}

const SIMULATED_PROBE: DedicatedProbe = { user: 'Borne', sid: 'S-1-5-21-1111111111-2222222222-3333333333-1001', editionId: 'IoTEnterpriseS', build: 26100, otherAdmins: ['Admin'] }; // i18n-ignore : compte simulé

function simulatedSystem(file: string): DedicatedSystem {
  const load = (): Simulation => {
    const base: Simulation = { windows: freshWindows(), probe: SIMULATED_PROBE };
    if (!fs.existsSync(file)) return base;
    const read = readJsonFile(file) as Partial<Simulation>;
    return { ...base, ...read, probe: { ...SIMULATED_PROBE, ...read.probe } };
  };
  const save = (simulation: Simulation, entry: string) => {
    simulation.journal = [...(simulation.journal ?? []), entry];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(simulation, null, 2) + '\n', 'utf8');
    console.log(`Borne dédiée (simulée) : ${entry}.`);
  };
  let explorer = false;
  return {
    simulated: true,
    probe: async () => load().probe,
    async runElevated(run) {
      await new Promise((r) => setTimeout(r, 400));
      const simulation = load();
      if (simulation.cancel) {
        save({ ...simulation, cancel: false }, `${run.kind} refusé dans la fenêtre de Windows`); // i18n-ignore : journal de la simulation
        return { cancelled: true };
      }
      const { windows, outcome } = simulateRun(simulation.windows, run);
      save({ ...simulation, windows }, `${run.kind} : ${outcome.status}${outcome.error ? ` (${outcome.error})` : ''}`);
      return { outcome };
    },
    openExplorer() {
      explorer = true;
      console.log('Borne dédiée (simulée) : Explorateur ouvert.');
    },
    explorerShown: () => explorer,
  };
}
