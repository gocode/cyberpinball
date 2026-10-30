// Journal de l'application : tout ce qu'elle écrit dans sa console (console.log, warn, error), daté,
// dans <données>\logs\journal.txt. Sans lui, ce que la borne a fait pendant une partie entre amis
// (double de la table, réglages de l'hôte, records du groupe, réponse d'une invitation) se perdait
// à la fermeture : un essai sur la borne ne pouvait pas s'expliquer après coup (30/10/2026).
//
//   2026-10-30T09:12:41.207Z Partie entre amis (got) : double prêt, 1853 fichiers liés, 19 copiés…
//   2026-10-30T09:12:41.950Z [erreur] VPX ne s'est pas terminé après 30 s.
//
// Au-delà de JOURNAL_MAX octets, le journal devient journal-ancien.txt (l'ancien part) et un
// nouveau commence : les deux dernières sessions restent lisibles.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const JOURNAL_FILE = 'journal.txt';
export const JOURNAL_OLD_FILE = 'journal-ancien.txt';
/** Taille au plus du journal avant relais. */
export const JOURNAL_MAX = 2 * 1024 * 1024;

export type JournalLevel = 'info' | 'avertissement' | 'erreur';

/** Une ligne : la date, le niveau quand ce n'est pas une information, le message sur une ligne. */
export function journalLine(level: JournalLevel, parts: readonly unknown[], at = new Date()): string {
  const text = parts.map((p) => (p instanceof Error ? (p.stack ?? p.message) : typeof p === 'string' ? p : safeJson(p))).join(' ');
  return `${at.toISOString()}${level === 'info' ? '' : ` [${level}]`} ${text.replace(/\r?\n/g, '\n    ')}\n`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Ajoute une ligne au journal de `logsDir` ; au-delà de `max`, il passe la main à journal-ancien.txt. */
export function appendJournal(logsDir: string, line: string, max = JOURNAL_MAX): void {
  const file = path.join(logsDir, JOURNAL_FILE);
  fs.mkdirSync(logsDir, { recursive: true });
  try {
    if (fs.statSync(file).size + Buffer.byteLength(line) > max) fs.renameSync(file, path.join(logsDir, JOURNAL_OLD_FILE));
  } catch {
    // Pas encore de journal : il commence.
  }
  fs.appendFileSync(file, line, 'utf8');
}
