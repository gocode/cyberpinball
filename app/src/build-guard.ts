// Garde-fou des écrans du front-end (library.ts) : un écran est reconstruit plusieurs fois à chaque
// touche (la touche, la vue, le téléphone), et les touches attendent la fin de sa construction. Une
// construction qui lit le disque (inventaire d'une table, dossier de téléchargements, médias, scores)
// rend les flippers lents et fait perdre des appuis : relevé du 17/11/2026, fiche d'une table à 700 ms,
// « Ajouter une table » à 595 ms. Le chronomètre (SLOW_BUILD_MS) ne voit que les gros cas, et seulement
// sur une borne chargée ; ce guet compte chaque lecture, même petite, même sur un jeu d'essai léger.
// Le correctif est toujours le même : lire à l'ouverture de l'écran (sa fonction open, ou une task),
// garder le résultat, construire depuis lui.

// Le module lui-même, pas l'espace de noms d'un `import * as` (des accesseurs en lecture seule) : les
// autres modules l'appellent par ses propriétés (fs.readdirSync), qu'on remplace le temps d'une construction.
import fs = require('node:fs');
import * as path from 'node:path';

/** Lectures synchrones guettées : tout ce qu'une construction pourrait demander au disque. */
const WATCHED = [
  'readFileSync',
  'readdirSync',
  'statSync',
  'lstatSync',
  'existsSync',
  'accessSync',
  'openSync',
  'readSync',
  'opendirSync',
  'realpathSync',
] as const;
type Watched = (typeof WATCHED)[number];

/**
 * Le guet tourne en essai : démonstrations et bancs hors écran (CYBERPINBALL_HORS_ECRAN), ou à la
 * demande (CYBERPINBALL_GUET_DISQUE). Sur une borne, seul le chronomètre veille : remplacer les
 * fonctions de node:fs à chaque construction n'y apporterait rien qu'un risque.
 */
export function diskWatchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CYBERPINBALL_GUET_DISQUE === '1' || (env.CYBERPINBALL_HORS_ECRAN === '1' && env.CYBERPINBALL_GUET_DISQUE !== '0');
}

/** Lectures faites pendant `work`, par fonction (« readdirSync » : 12), et le premier chemin lu de chacune. */
export interface DiskReads {
  count: number;
  calls: Partial<Record<Watched, number>>;
  first: Partial<Record<Watched, string>>;
  /** Qui a fait la première lecture : les fonctions appelantes, du plus proche au plus loin (noms seuls). */
  by?: string;
}

let depth = 0;
let current: DiskReads | undefined;

/**
 * Exécute `work` en comptant les lectures synchrones du disque. Réentrant : une construction qui en
 * construit une autre (l'écran d'origine, pour son libellé) compte dans la même mesure.
 */
export function countDiskReads<T>(work: () => T): { value: T; reads: DiskReads } {
  if (depth > 0) {
    const value = work();
    return { value, reads: current! };
  }
  const reads: DiskReads = { count: 0, calls: {}, first: {} };
  const target = fs as unknown as Record<Watched, (...args: unknown[]) => unknown>;
  const saved = new Map<Watched, (...args: unknown[]) => unknown>();
  for (const name of WATCHED) {
    const original = target[name];
    if (typeof original !== 'function') continue;
    saved.set(name, original);
    target[name] = function (this: unknown, ...args: unknown[]) {
      reads.count++;
      reads.calls[name] = (reads.calls[name] ?? 0) + 1;
      // Le nom seul : assez pour retrouver la lecture, sans chemin du poste dans le journal.
      if (reads.first[name] === undefined && (typeof args[0] === 'string' || Buffer.isBuffer(args[0]))) reads.first[name] = path.basename(String(args[0]));
      reads.by ??= callers(new Error().stack);
      return original.apply(this, args);
    };
  }
  depth++;
  current = reads;
  try {
    return { value: work(), reads };
  } finally {
    depth--;
    current = undefined;
    for (const [name, original] of saved) target[name] = original;
  }
}

/** « readdirSync ×12, statSync ×40 » : le relevé d'une construction, pour le journal ; puis qui a lu le premier. */
export function describeDiskReads(reads: DiskReads): string {
  const calls = Object.entries(reads.calls)
    .sort((a, b) => b[1]! - a[1]!)
    .map(([name, n]) => `${name} ×${n}${reads.first[name as Watched] ? ` (${reads.first[name as Watched]})` : ''}`)
    .join(', ');
  return reads.by ? `${calls} ; première lecture par ${reads.by}` : calls; // i18n-ignore : journal
}

/** « inventory < buildSheet < buildScreen » : les fonctions nommées de la pile, sans chemin ni ce module. */
function callers(stack: string | undefined): string | undefined {
  const names = (stack ?? '')
    .split(/\r?\n/)
    .slice(2)
    .map((line) => /^\s*at (?:Object\.)?([\w$.<>]+) \(/.exec(line)?.[1])
    .filter((n): n is string => Boolean(n) && !/^(Object|Array|Module|node:|fs\.)/.test(n!) && n !== 'countDiskReads')
    .slice(0, 5);
  return names.length ? names.join(' < ') : undefined;
}
