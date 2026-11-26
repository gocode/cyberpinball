// Démarrage : un appel qui attend la fin d'un autre programme (spawnSync, execSync, execFileSync) fige
// tout le processus principal, Electron compris, avant même ses premières fenêtres. La sonde 3D Vision
// le faisait 5 s avant ready sur la PinCab (26/11/2026), assez pour qu'une minuterie du réseau parte
// avant ready. Importé en tête de main.ts : chaque appel de ce genre est chronométré jusqu'à la première
// fenêtre (ou STARTUP_WATCH_MAX_MS), puis noté au journal. Rien n'est changé à l'appel lui-même.
// Aucun import d'electron : testé seul (demarrage-bloquant.test.ts).

import childProcess = require('node:child_process');

/** Les fonctions de node:child_process qui attendent la fin du programme lancé. */
const BLOCKING = ['spawnSync', 'execSync', 'execFileSync'] as const;
/** Au-delà, plus de chronomètre (processus sans fenêtre : surveillant de la borne dédiée, relais hors écran). */
const STARTUP_WATCH_MAX_MS = 60_000;
/** Au plus autant d'appels gardés : le reste n'apprendrait rien de plus. */
const MAX_CALLS = 20;

export interface BlockingCall {
  fn: string;
  command: string;
  ms: number;
}

const calls: BlockingCall[] = [];
let restore: (() => void) | undefined;

/** Le programme lancé et ses premiers arguments, pour le journal. */
function describe(args: unknown[]): string {
  const [file, rest] = args;
  const words = [String(file), ...(Array.isArray(rest) ? rest.slice(0, 3).map(String) : [])].join(' ');
  return words.length > 120 ? `${words.slice(0, 117)}...` : words;
}

/** Chronomètre chaque appel bloquant de node:child_process jusqu'à stopStartupBlockingWatch. */
export function watchStartupBlocking(): void {
  if (restore) return;
  const cp = childProcess as unknown as Record<string, unknown>;
  const originals = BLOCKING.map((name) => [name, cp[name]] as const);
  for (const [name, original] of originals) {
    if (typeof original !== 'function') continue;
    cp[name] = function (this: unknown, ...args: unknown[]) {
      const started = Date.now();
      try {
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } finally {
        if (calls.length < MAX_CALLS) calls.push({ fn: name, command: describe(args), ms: Date.now() - started });
      }
    };
  }
  restore = () => {
    for (const [name, original] of originals) cp[name] = original;
  };
  setTimeout(() => stopStartupBlockingWatch(), STARTUP_WATCH_MAX_MS).unref?.();
}

/**
 * Première fenêtre : le chronomètre s'arrête (les fonctions d'origine remises), chaque appel relevé est
 * noté par `report` (le journal) et rendu.
 */
export function stopStartupBlockingWatch(report: (line: string) => void = (line) => console.warn(line)): BlockingCall[] {
  if (!restore) return [];
  restore();
  restore = undefined;
  const seen = calls.splice(0);
  for (const call of seen) {
    report(`Démarrage : ${call.fn}(${call.command}) a bloqué le processus principal ${call.ms} ms avant les premières fenêtres ; à rendre asynchrone.`); // i18n-ignore : journal
  }
  return seen;
}

watchStartupBlocking();
