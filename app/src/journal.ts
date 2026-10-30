// Ce que l'application écrit dans sa console va aussi dans <données>\logs\journal.txt, daté
// (packages/core/src/journal.ts) : ce qui s'est passé sur la borne se relit après coup. Le
// journal ne bloque jamais l'application : un disque plein, et la console suffit.

import * as path from 'node:path';
import { appendJournal, journalLine, type JournalLevel } from '@cyberpinball/core';

export function journalConsole(dataDir: string): void {
  const logsDir = path.join(dataDir, 'logs');
  const wrap = (name: 'log' | 'info' | 'warn' | 'error', level: JournalLevel) => {
    const original = console[name].bind(console);
    console[name] = (...parts: unknown[]) => {
      original(...parts);
      try {
        appendJournal(logsDir, journalLine(level, parts));
      } catch {
        // Disque plein ou dossier en lecture seule : la console suffit.
      }
    };
  };
  wrap('log', 'info');
  wrap('info', 'info');
  wrap('warn', 'avertissement');
  wrap('error', 'erreur');
  console.log(`Cyber Pinball démarre (journal : ${path.join(logsDir, 'journal.txt')}).`); // i18n-ignore : journal
}
