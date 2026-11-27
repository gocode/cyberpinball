// Ce que le dernier lancement de VPX laisse au rapport envoyé à l'équipe (tech-sheet.ts, library.ts).
//
// Rapports de plantage du 17/11/2026 : le crash.txt que VPX écrit en plantant (sa pile d'appels, qui
// nomme le module fautif) ne partait jamais, et le vpinball.log joint était celui d'une partie
// précédente quand VPX s'était arrêté avant d'écrire le sien. Ici : le crash.txt du dernier lancement
// échoué, et si son journal est bien le sien. Une partie réussie efface la trace.

//
// Rapports du 27/11/2026 (The Avengers Pro, 0xC0000409) : sans crash.txt, rien ne nommait le module en
// faute. Le module noté par Windows (windows-fault.ts) part alors dans evenement-windows.txt.

import { describeWindowsFault, type WindowsFault } from '@cyberpinball/core';
import type { LaunchResult } from './launcher';

export interface LaunchEvidence {
  at: number;
  table: string;
  /** VPX a écrit son journal pendant ce lancement ; faux : le vpinball.log est celui d'une partie précédente. */
  logWritten?: boolean;
  crashReport?: string;
  /** Planté sans crash.txt : l'arrêt noté par Windows (module fautif, code, décalage). */
  fault?: WindowsFault;
  /** Fichiers de VPX modifiés relevés à cet échec (vpx-integrity.ts). */
  changedFiles?: string[];
}

let last: LaunchEvidence | undefined;
let lastLogPath: string | undefined;
let lastLogWritten: boolean | undefined;

/** Journal de la dernière partie, réussie ou non : celui du VPX qui l’a jouée. */
export function lastLaunchLogPath(): string | undefined {
  return lastLogPath;
}

/** À la fin de chaque lancement : un échec garde ses pièces, une réussite les efface. */
export function rememberLaunch(result: Pick<LaunchResult, 'ok' | 'logWritten' | 'crashReport' | 'logPath' | 'fault'>, table: string, changedFiles: readonly string[] = [], at = Date.now()): void {
  lastLogPath = result.logPath;
  lastLogWritten = result.logWritten;
  last = result.ok
    ? undefined
    : {
        at,
        table,
        ...(result.logWritten !== undefined && { logWritten: result.logWritten }),
        ...(result.crashReport && { crashReport: result.crashReport }),
        ...(result.fault && { fault: result.fault }),
        ...(changedFiles.length && { changedFiles: [...changedFiles] }),
      };
}

export function lastFailedLaunch(): LaunchEvidence | undefined {
  return last;
}

/** evenement-windows.txt : le module fautif et ce qui l'identifie ; du chemin, les trois derniers dossiers seulement (jamais le profil Windows). */
export function faultText(fault: WindowsFault): string {
  const parts = fault.modulePath?.split(/[\\/]/).filter(Boolean) ?? [];
  const where = parts.length > 1 ? `…\\${parts.slice(-4).join('\\')}` : undefined;
  return [
    `Programme : ${fault.app}`, // i18n-ignore : rapport
    `Module fautif : ${describeWindowsFault(fault)}`, // i18n-ignore : rapport
    ...(where ? [`Chemin : ${where}`] : []), // i18n-ignore : rapport
  ].join('\n') + '\n';
}

/** Le texte joint au rapport pour ce lancement échoué ; vide sans échec retenu. */
export function launchAttachments(vpxLog: string): { name: string; text: string; kind: 'crash' | 'log' | 'previous-log' }[] {
  const out: { name: string; text: string; kind: 'crash' | 'log' | 'previous-log' }[] = [];
  if (last?.crashReport) out.push({ name: 'crash.txt', text: last.crashReport, kind: 'crash' }); // i18n-ignore : nom de fichier
  else if (last?.fault) out.push({ name: 'evenement-windows.txt', text: faultText(last.fault), kind: 'crash' }); // i18n-ignore : nom de fichier
  if (vpxLog) {
    // Journal antérieur au lancement : joint sous un autre nom, pour qu'on ne le lise pas comme celui du plantage.
    if (lastLogWritten === false) out.push({ name: 'vpinball-partie-precedente.log', text: vpxLog, kind: 'previous-log' }); // i18n-ignore : nom de fichier
    else out.push({ name: 'vpinball.log', text: vpxLog, kind: 'log' }); // i18n-ignore : nom de fichier
  }
  return out;
}
