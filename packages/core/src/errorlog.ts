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
// Au-delà de MAX_ERROR_LOG octets, les entrées les plus anciennes sont retirées.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const ERROR_LOG_FILE = 'erreurs.txt';

/** Taille au plus du journal : les entrées les plus récentes sont gardées. */
export const MAX_ERROR_LOG = 512 * 1024;

export type ErrorLogKind = 'exception' | 'rejection';

const KIND_LABEL: Record<ErrorLogKind, string> = {
  exception: 'exception non rattrapée', // i18n-ignore : journal technique
  rejection: 'promesse rejetée sans traitement', // i18n-ignore : journal technique
};

export function errorLogFile(logsDir: string): string {
  return path.join(logsDir, ERROR_LOG_FILE);
}

/** Entrée du journal : date, nature, puis la pile (ou la valeur levée). */
export function errorLogEntry(kind: ErrorLogKind, error: unknown, at = new Date()): string {
  const detail = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  return `${at.toISOString()} ${KIND_LABEL[kind]}\n${detail.trimEnd()}\n\n`;
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
