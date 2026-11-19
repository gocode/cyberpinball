// Lancement de Windows PowerShell sans les signes d'un logiciel malveillant.
//
// Le 19/11/2026, un antivirus (détection comportementale, « Trojan.Win32.Generic ») a mis en
// quarantaine l'exécutable de Cyber Pinball au démarrage. Ce qu'il voyait : un exécutable non signé
// qui lançait, sans fenêtre, PowerShell avec un script encodé en base 64 (-EncodedCommand), la
// politique d'exécution contournée (-ExecutionPolicy Bypass), et qui listait au passage les
// antivirus du poste ; plus une tâche planifiée aux droits d'administrateur sur le même modèle.
// C'est mot pour mot le portrait d'un voleur de données.
//
// D'où, pour tout le code livré (fixé par powershell-propre.test.ts) :
// - un script de plus d'une ligne passe par un fichier .ps1 lisible, jamais encodé ;
// - la politique d'exécution est RemoteSigned (un script écrit sur le poste s'exécute, un script
//   téléchargé non signé jamais), jamais Bypass ;
// - pas de -WindowStyle Hidden : windowsHide (Node) suffit à ne rien montrer ;
// - aucun relevé des antivirus installés.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Windows PowerShell 5.1, par son chemin complet (jamais celui que trouverait le PATH). */
export function powershellExe(): string {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** Politique d'exécution de nos scripts : ceux écrits sur le poste passent, les téléchargés non signés non. */
export const POWERSHELL_POLICY = 'RemoteSigned';

/** Arguments de PowerShell pour un fichier .ps1 : sans profil, sans question, politique RemoteSigned. */
export function powershellFileArgs(file: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', POWERSHELL_POLICY, '-File', file];
}

/**
 * Le texte d'un fichier .ps1 : BOM (Windows PowerShell 5.1 lit sinon en ANSI, accents des chemins
 * perdus) et fins de ligne CRLF.
 */
export function powershellFileText(script: string): string {
  return String.fromCharCode(0xfeff) + script.replace(/\r?\n/g, '\r\n') + '\r\n';
}

/**
 * Écrit un script dans le dossier temporaire, sous un nom à Cyber Pinball (`cyberpinball-<nom>.ps1`),
 * et rend son chemin. Un nom fixe : relancé, le script remplace le précédent au lieu de s'accumuler.
 */
export function writeTempPowershellScript(name: string, script: string, dir = os.tmpdir()): string {
  const file = path.join(dir, `cyberpinball-${name}.ps1`);
  fs.writeFileSync(file, powershellFileText(script), 'utf8');
  return file;
}
