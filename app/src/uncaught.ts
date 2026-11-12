// Erreurs non rattrapées du processus principal, à l'écran : notées dans
// <données>\logs\erreurs.txt (packages/core/src/errorlog.ts) et dans la console, sans la
// boîte modale d'Electron, qui figerait le menu jusqu'au clic sur OK, souvent cachée sous
// les fenêtres plein écran de la borne. L'application continue. Hors écran, offscreen.ts
// arrête au contraire l'essai en échec.
//
// Aussi dans erreurs.txt (10/11/2026, plantages de la page de connexion de Google sur le PinCab,
// qui n'avaient laissé aucune trace) :
// - les incidents rattrapés (journalIncident) : ce qui aurait fait tomber l'application ou une page,
//   arrêté à temps (geste du téléphone non transmis, page du navigateur intégré tombée et rechargée,
//   demande refusée qu'une page n'aurait pas dû faire) ;
// - le rendu d'une page qui tombe (render-process-gone : plantage, mémoire) ;
// - au démarrage, les plantages natifs de la séance précédente, dont Crashpad a gardé le rapport
//   (<données d'Electron>\Crashpad\reports\*.dmp, jamais envoyés nulle part).

import * as path from 'node:path';
import { app, BrowserWindow, crashReporter, type WebContents } from 'electron';
import { appendErrorLog, errorLogEntry, errorLogFile, incidentLogEntry, newCrashReports, type ErrorLogKind } from '@cyberpinball/core';

/** Journal des incidents : posé au démarrage (journalIncidents), sinon la console seule. */
let incidentFile: string | undefined;

function write(file: string | undefined, entry: string): void {
  if (!file) return;
  try {
    appendErrorLog(file, entry);
  } catch {
    // Disque plein ou dossier en lecture seule : la console suffit, l'application continue.
  }
}

export function journalUncaught(dataDir: string): void {
  const file = errorLogFile(path.join(dataDir, 'logs'));
  const note = (kind: ErrorLogKind) => (error: unknown) => {
    const entry = errorLogEntry(kind, error);
    console.error(entry.trimEnd());
    write(file, entry);
  };
  process.on('uncaughtException', note('exception'));
  process.on('unhandledRejection', note('rejection'));
}

/** Les incidents rattrapés vont dans <données>\logs\erreurs.txt (à l'écran comme hors écran : les essais le relisent). */
export function journalIncidents(dataDir: string): void {
  incidentFile = errorLogFile(path.join(dataDir, 'logs'));
}

/**
 * Un incident rattrapé : ce qui s'est passé, en une ligne, jamais ce que l'utilisateur a tapé ni
 * l'adresse complète d'une page (son hôte suffit), puis la pile de l'erreur s'il y en a une.
 */
export function journalIncident(what: string, error?: unknown): void {
  const entry = incidentLogEntry(what, error);
  console.warn(entry.trimEnd());
  write(incidentFile, entry);
}

/** Hôte d'une adresse, pour le journal : jamais son chemin ni ses paramètres. */
export function hostForLog(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'file:' ? 'page de Cyber Pinball' : u.host || u.protocol; // i18n-ignore : journal
  } catch {
    return '?';
  }
}

/** Pages qui notent elles-mêmes leur rendu tombé (navigateur intégré, avec ce qu'il en fait) : pas deux entrées. */
const selfLogged = new WeakSet<WebContents>();
export function logsOwnCrashes(contents: WebContents): void {
  selfLogged.add(contents);
}

/**
 * Processus de Chromium arrêtés (rendu d'une page, GPU, service réseau…) : notés dans le journal.
 * Jusqu'au 06/11/2026, rien ne l'était : un menu resté invisible après une mise à jour ne
 * laissait aucune trace de ce qui était arrivé à ses pages. Un rendu qui tombe (plantage, mémoire)
 * va aussi dans erreurs.txt, avec l'hôte de la page.
 */
export function journalProcessesGone(): void {
  app.on('render-process-gone', (_event, contents, details) => {
    const title = contents.getTitle() || contents.getURL();
    console.warn(`Rendu de « ${title} » arrêté : ${details.reason} (code ${details.exitCode}).`); // i18n-ignore : journal
    if (details.reason !== 'clean-exit' && details.reason !== 'killed' && !selfLogged.has(contents) && !BrowserWindow.fromWebContents(contents)) write(incidentFile, incidentLogEntry(`Rendu d’une page arrêté (${hostForLog(contents.getURL())}) : ${details.reason}, code ${details.exitCode}`)); // i18n-ignore : journal
  });
  app.on('child-process-gone', (_event, details) => {
    // Un utilitaire qui finit normalement (clean-exit) n'est pas un incident.
    if (details.reason === 'clean-exit') return;
    console.warn(`Processus ${details.type}${details.name ? ` (${details.name})` : ''} de Chromium arrêté : ${details.reason} (code ${details.exitCode}).`); // i18n-ignore : journal
  });
}

/** Message de Chromium pour un contenu refusé par la politique de sécurité (CSP) d'une page. */
export const CSP_VIOLATION = /violates (the following|the document's) Content Security Policy/;

/**
 * Contenus refusés par la politique de sécurité d'une page de Cyber Pinball (adresse en file:) : notés dans
 * erreurs.txt, une fois par page et par message. Le 12/11/2026, la page du menu refusait la lecture
 * des logos animés (connect-src absent) : tous restaient animés, sans la moindre trace. Les pages du
 * web (navigateur intégré, sites de médias) en ont souvent : pas notées.
 */
export function journalPolicyViolations(): void {
  app.on('web-contents-created', (_event, contents) => {
    const seen = new Set<string>();
    contents.on('console-message', (event) => {
      if (!CSP_VIOLATION.test(event.message) || !contents.getURL().startsWith('file:')) return;
      const what = event.message.replace(/\s+/g, ' ').slice(0, 300);
      if (seen.has(what)) return;
      seen.add(what);
      journalIncident(`Page de Cyber Pinball (${contents.getTitle() || 'sans titre'}) : contenu refusé par sa politique de sécurité : ${what}`); // i18n-ignore : journal
    });
  });
}

/**
 * Une fenêtre de Cyber Pinball dont le rendu tombe reste noire et couvre son écran : « tous les
 * écrans noirs », sans issue que le gestionnaire des tâches (PinCab, 10/11/2026). Elle est rechargée
 * (sa page redemande son état au processus principal, comme à l'ouverture), au plus une fois par
 * REVIVE_AGAIN_MS ; au-delà, elle reste telle quelle et c'est noté. Une page qui ne répond plus depuis
 * HUNG_WINDOW_MS a son rendu arrêté, puis rechargé de même. Les pages qui gèrent elles-mêmes leur
 * rendu tombé (navigateur intégré, logsOwnCrashes) ne sont pas touchées.
 */
const REVIVE_AGAIN_MS = 20_000;
const HUNG_WINDOW_MS = 15_000;
export function reviveCrashedWindows(): void {
  const last = new WeakMap<WebContents, number>();
  app.on('render-process-gone', (_event, contents, details) => {
    if (details.reason === 'clean-exit' || selfLogged.has(contents) || contents.isDestroyed()) return;
    const win = BrowserWindow.fromWebContents(contents);
    if (!win || win.isDestroyed() || win.webContents !== contents) return;
    const again = Date.now() - (last.get(contents) ?? 0) < REVIVE_AGAIN_MS;
    last.set(contents, Date.now());
    write(incidentFile, incidentLogEntry(`Fenêtre « ${win.getTitle()} » : rendu arrêté (${details.reason})${again ? ', de nouveau : pas rechargée' : ', rechargée'}`)); // i18n-ignore : journal
    if (!again) setTimeout(() => !contents.isDestroyed() && contents.reload(), 300);
  });
  app.on('browser-window-created', (_event, win) => {
    const contents = win.webContents;
    let hung: NodeJS.Timeout | undefined;
    contents.on('unresponsive', () => {
      if (selfLogged.has(contents)) return;
      clearTimeout(hung);
      hung = setTimeout(() => {
        if (contents.isDestroyed()) return;
        write(incidentFile, incidentLogEntry(`Fenêtre « ${win.isDestroyed() ? '?' : win.getTitle()} » : ne répond plus depuis ${HUNG_WINDOW_MS / 1000} s, rendu arrêté`)); // i18n-ignore : journal
        contents.forcefullyCrashRenderer();
      }, HUNG_WINDOW_MS);
    });
    contents.on('responsive', () => clearTimeout(hung));
    contents.once('destroyed', () => clearTimeout(hung));
  });
}

/**
 * Plantages natifs (Chromium, Electron, un pilote) : ni exception ni promesse, rien que Node voie.
 * Crashpad en garde un rapport sur le disque, sans rien envoyer ; au démarrage suivant, chaque
 * rapport nouveau devient une entrée d'erreurs.txt avec son chemin (à joindre pour un diagnostic).
 */
export function journalNativeCrashes(dataDir: string): void {
  try {
    crashReporter.start({ uploadToServer: false, compress: true });
  } catch (error) {
    console.warn(`Rapports de plantage indisponibles : ${(error as Error).message}`); // i18n-ignore : journal
    return;
  }
  const logs = path.join(dataDir, 'logs');
  try {
    for (const report of newCrashReports(path.join(app.getPath('crashDumps'), 'reports'), path.join(logs, 'plantages-vus.txt'))) {
      write(errorLogFile(logs), incidentLogEntry(`Plantage natif de Cyber Pinball ou d’un de ses processus le ${report.at.toISOString()} ; rapport : ${report.file}`, undefined, new Date(), 'crash')); // i18n-ignore : journal
    }
  } catch (error) {
    console.warn(`Rapports de plantage illisibles : ${(error as Error).message}`); // i18n-ignore : journal
  }
}
