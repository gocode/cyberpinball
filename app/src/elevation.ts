// Installations qui demandent l'accord de Windows (UAC) : pilote de la Kinect (vision3d.ts), runtime
// Visual C++ de VPX (vc-runtime.ts). Un seul passage par PowerShell, sans fenêtre : la demande de
// Windows apparaît sur le bureau sécurisé, au-dessus du menu plein écran ; une demande sans réponse
// n'est plus attendue au-delà d'ELEVATION_WAIT_MS (front-policy.ts).

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { ELEVATION_WAIT_MS, elevationNoAnswer } from '@cyberpinball/core';

export const SYSTEM32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
export const POWERSHELL = path.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
/** Code de Start-Process quand l'utilisateur refuse l'élévation (ERROR_CANCELLED). */
export const CANCELLED = 1223;

/** `timeoutMs` : une demande de Windows (UAC) sans réponse n'est plus attendue au-delà (front-policy.ts). */
export function powershell(command: string, timeoutMs?: number): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs
      ? setTimeout(() => {
          stderr = elevationNoAnswer();
          child.kill();
        }, timeoutMs)
      : undefined;
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => resolve({ status: -1, stdout, stderr: error.message }));
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

/** Chaîne PowerShell entre apostrophes. */
export const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Sujet du certificat d'un fichier signé, ou la raison du refus. */
export async function signerOf(file: string): Promise<{ status: string; subject: string }> {
  const r = await powershell(`$s = Get-AuthenticodeSignature -LiteralPath ${quote(file)}; "$($s.Status)|$($s.SignerCertificate.Subject)"`);
  const [status, subject] = r.stdout.trim().split('|');
  return { status: status ?? '', subject: subject ?? '' };
}

/**
 * Lance `file` avec l'accord de Windows, sans fenêtre, et attend sa fin : son code de sortie, CANCELLED
 * si l'accord est refusé, ou 1 avec la raison (demande restée sans réponse, lancement impossible).
 */
export async function startElevated(file: string, args: readonly string[]): Promise<{ status: number | null; stderr: string }> {
  const list = args.map((a) => quote(a.includes(' ') ? `"${a}"` : a)).join(', ');
  const r = await powershell(
    `try { $p = Start-Process -FilePath ${quote(file)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru${list ? ` -ArgumentList @(${list})` : ''}; exit $p.ExitCode } catch { if ($_.Exception.Message -match 'cancel|annul') { exit ${CANCELLED} } else { [Console]::Error.WriteLine($_.Exception.Message); exit 1 } }`,
    ELEVATION_WAIT_MS,
  );
  return { status: r.status, stderr: r.stderr.trim() };
}
