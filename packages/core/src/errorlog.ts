// Journal des erreurs non rattrapées du processus principal. Sans lui, Electron ouvre sa
// boîte modale « A JavaScript error occurred in the main process » : le menu se fige
// jusqu'au clic sur OK, et la boîte peut rester cachée sous les fenêtres plein écran de la
// borne. L'application note l'erreur ici et continue (app/src/uncaught.ts).
//
// Fichier : <données>\logs\erreurs.txt, texte UTF-8, une entrée par erreur :
//
//   2026-10-24T20:41:07.512Z exception non rattrapée
//   TypeError: Object has been destroyed
//       at DownloadItem.<anonymous> (…\acquire-window.js:362:50)
//
// Incidents rattrapés (incidentLogEntry) : ce qui aurait pu faire tomber l'application et qu'elle a
// arrêté à temps, en une ligne, puis la pile s'il y en a une :
//
//   2026-11-10T21:03:44.120Z incident rattrapé
//   Télécommande : geste non transmis à la page (texte)
//   Error: Render frame was disposed before WebFrameMain could be accessed
//
// Et, au démarrage suivant, un plantage natif (Chromium, Electron) dont Crashpad a gardé le rapport.
//
// Au-delà de MAX_ERROR_LOG octets, les entrées les plus anciennes sont retirées.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const ERROR_LOG_FILE = 'erreurs.txt';

/** Taille au plus du journal : les entrées les plus récentes sont gardées. */
export const MAX_ERROR_LOG = 512 * 1024;

export type ErrorLogKind = 'exception' | 'rejection' | 'incident' | 'crash';

const KIND_LABEL: Record<ErrorLogKind, string> = {
  exception: 'exception non rattrapée', // i18n-ignore : journal technique
  rejection: 'promesse rejetée sans traitement', // i18n-ignore : journal technique
  incident: 'incident rattrapé', // i18n-ignore : journal technique
  crash: 'plantage natif (rapport de Crashpad)', // i18n-ignore : journal technique
};

export function errorLogFile(logsDir: string): string {
  return path.join(logsDir, ERROR_LOG_FILE);
}

/** Entrée du journal : date, nature, puis la pile (ou la valeur levée). */
export function errorLogEntry(kind: ErrorLogKind, error: unknown, at = new Date()): string {
  const detail = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  return `${at.toISOString()} ${KIND_LABEL[kind]}\n${detail.trimEnd()}\n\n`;
}

/**
 * Incident rattrapé, ou plantage natif relevé après coup : ce qui s'est passé (une ligne, jamais ce
 * que l'utilisateur a tapé), puis la pile de l'erreur s'il y en a une.
 */
export function incidentLogEntry(what: string, error?: unknown, at = new Date(), kind: 'incident' | 'crash' = 'incident'): string {
  const line = what.replace(/\s+/g, ' ').trim().slice(0, 400);
  const detail = error === undefined ? '' : error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  return `${at.toISOString()} ${KIND_LABEL[kind]}\n${line}${detail ? `\n${detail.trimEnd()}` : ''}\n\n`;
}

/**
 * Rapports de plantage de Crashpad (*.dmp) apparus depuis le dernier relevé : `marker` garde la date
 * du plus récent déjà noté. Chacun n'est rendu qu'une fois ; au plus `max`, les plus récents.
 */
export function newCrashReports(reportsDir: string, marker: string, max = 5): { file: string; at: Date }[] {
  let seen = 0;
  try {
    seen = Date.parse(fs.readFileSync(marker, 'utf8').trim()) || 0;
  } catch {
    seen = 0;
  }
  let names: string[];
  try {
    names = fs.readdirSync(reportsDir).filter((n) => /\.dmp$/i.test(n));
  } catch {
    return [];
  }
  const found = names
    .map((n) => {
      const file = path.join(reportsDir, n);
      try {
        return { file, at: fs.statSync(file).mtime };
      } catch {
        return undefined;
      }
    })
    .filter((r): r is { file: string; at: Date } => Boolean(r) && r!.at.getTime() > seen)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (!found.length) return [];
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, found[found.length - 1]!.at.toISOString(), 'utf8');
  return found.slice(-max);
}

/** Ajoute une entrée ; au-delà de `max` octets, retire les plus anciennes (par entrée entière). */
export function appendErrorLog(file: string, entry: string, max = MAX_ERROR_LOG): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, entry, 'utf8');
  if (fs.statSync(file).size <= max) return;
  const text = fs.readFileSync(file, 'utf8');
  // La moitié la plus récente, à partir du début d'une entrée.
  const from = text.length - Math.floor(max / 2);
  const start = text.indexOf('\n\n', from);
  fs.writeFileSync(file, start >= 0 ? text.slice(start + 2) : entry, 'utf8');
}
