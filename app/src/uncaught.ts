// Erreurs non rattrapées du processus principal, à l'écran : notées dans
// <données>\logs\erreurs.txt (packages/core/src/errorlog.ts) et dans la console, sans la
// boîte modale d'Electron, qui figerait le menu jusqu'au clic sur OK, souvent cachée sous
// les fenêtres plein écran de la borne. L'application continue. Hors écran, offscreen.ts
// arrête au contraire l'essai en échec.

import * as path from 'node:path';
import { appendErrorLog, errorLogEntry, errorLogFile, type ErrorLogKind } from '@cyberpinball/core';

export function journalUncaught(dataDir: string): void {
  const file = errorLogFile(path.join(dataDir, 'logs'));
  const note = (kind: ErrorLogKind) => (error: unknown) => {
    const entry = errorLogEntry(kind, error);
    console.error(entry.trimEnd());
    try {
      appendErrorLog(file, entry);
    } catch {
      // Disque plein ou dossier en lecture seule : la console suffit, l'application continue.
    }
  };
  process.on('uncaughtException', note('exception'));
  process.on('unhandledRejection', note('rejection'));
}
