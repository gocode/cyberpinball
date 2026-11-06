// Erreurs non rattrapées du processus principal, à l'écran : notées dans
// <données>\logs\erreurs.txt (packages/core/src/errorlog.ts) et dans la console, sans la
// boîte modale d'Electron, qui figerait le menu jusqu'au clic sur OK, souvent cachée sous
// les fenêtres plein écran de la borne. L'application continue. Hors écran, offscreen.ts
// arrête au contraire l'essai en échec.

import * as path from 'node:path';
import { app } from 'electron';
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

/**
 * Processus de Chromium arrêtés (rendu d'une page, GPU, service réseau…) : notés dans le journal.
 * Jusqu'au 06/11/2026, rien ne l'était : un menu resté invisible après une mise à jour ne
 * laissait aucune trace de ce qui était arrivé à ses pages.
 */
export function journalProcessesGone(): void {
  app.on('render-process-gone', (_event, contents, details) => {
    const title = contents.getTitle() || contents.getURL();
    console.warn(`Rendu de « ${title} » arrêté : ${details.reason} (code ${details.exitCode}).`); // i18n-ignore : journal
  });
  app.on('child-process-gone', (_event, details) => {
    // Un utilitaire qui finit normalement (clean-exit) n'est pas un incident.
    if (details.reason === 'clean-exit') return;
    console.warn(`Processus ${details.type}${details.name ? ` (${details.name})` : ''} de Chromium arrêté : ${details.reason} (code ${details.exitCode}).`); // i18n-ignore : journal
  });
}
