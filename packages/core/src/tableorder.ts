// Ordre des tables dans le menu (roues et liste) et table choisie au démarrage
// (Menu système > Médias > « Médias, son et attente » > « Ordre des tables », « Table au démarrage »).
//
// Règles :
// - par défaut, l'ordre des titres et la première table, comme avant ces réglages ;
// - « mélangé » tire un ordre au démarrage et le garde jusqu'au suivant : une table ajoutée en
//   cours de route prend sa place au hasard sans bousculer les autres (ShuffleKeys) ;
// - les statistiques viennent du .info de chaque table (User.StartCount, User.LastRun), que
//   Cyber Pinball tient à jour à chaque lancement ; une table jamais jouée passe après les autres ;
// - à égalité, l'ordre des titres départage : le résultat ne dépend pas de l'ordre du disque.

import { t } from './i18n';
import type { TableEntry } from './tables';

export const TABLE_ORDERS = ['title', 'recent', 'played', 'year', 'manufacturer', 'shuffle'] as const;
export type TableOrder = (typeof TABLE_ORDERS)[number];

export const TABLE_ORDER_LABELS: Record<TableOrder, string> = {
  get title() {
    return t('par titre');
  },
  get recent() {
    return t('dernières jouées d’abord');
  },
  get played() {
    return t('plus jouées d’abord');
  },
  get year() {
    return t('par année');
  },
  get manufacturer() {
    return t('par fabricant');
  },
  get shuffle() {
    return t('mélangé à chaque démarrage');
  },
};

export const START_TABLES = ['first', 'random', 'last'] as const;
export type StartTable = (typeof START_TABLES)[number];

export const START_TABLE_LABELS: Record<StartTable, string> = {
  get first() {
    return t('la première');
  },
  get random() {
    return t('au hasard');
  },
  get last() {
    return t('la dernière jouée');
  },
};

/**
 * Ce que fait Start sur la roue des tables : ouvrir la fiche (défaut), ou jouer la table
 * directement. En « jouer », la fiche reste à Start maintenu (WHEEL_START_HOLD_MS) et à F6 d'un clavier ;
 * les MagnaSave de la borne changent de collection sur la roue.
 */
export const WHEEL_STARTS = ['sheet', 'play'] as const;
export type WheelStart = (typeof WHEEL_STARTS)[number];

/** Start tenu au moins ce temps sur la roue, en « jouer directement » : la fiche s'ouvre au lieu de la partie. */
export const WHEEL_START_HOLD_MS = 700;

export const WHEEL_START_LABELS: Record<WheelStart, string> = {
  get sheet() {
    return t('ouvrir la fiche');
  },
  get play() {
    return t('jouer directement');
  },
};

type Sortable = Pick<TableEntry, 'file' | 'title' | 'version' | 'manufacturer' | 'year' | 'info'>;

/** Clé de tirage de chaque table pour l'ordre mélangé, gardée le temps d'une session. */
export class ShuffleKeys {
  private readonly keys = new Map<string, number>();
  constructor(private readonly random: () => number = Math.random) {}
  of(file: string): number {
    const id = file.toLowerCase();
    let key = this.keys.get(id);
    if (key === undefined) this.keys.set(id, (key = this.random()));
    return key;
  }
}

const byTitle = (a: Sortable, b: Sortable) => a.title.localeCompare(b.title, 'fr') || (a.version ?? '').localeCompare(b.version ?? '', 'fr');
const starts = (x: Sortable) => x.info.User?.StartCount ?? 0;
/** Date du dernier lancement en millisecondes ; 0 : jamais lancée (ou date illisible). */
export const lastRunOf = (x: Sortable): number => {
  const at = Date.parse(x.info.User?.LastRun ?? '');
  return Number.isFinite(at) ? at : 0;
};

/** Les tables dans l'ordre choisi ; le tableau reçu n'est pas modifié. */
export function sortTables<T extends Sortable>(tables: readonly T[], order: TableOrder, shuffle: ShuffleKeys = new ShuffleKeys()): T[] {
  // Année ou fabricant inconnus : à la fin.
  const year = (x: Sortable) => x.year ?? 99999;
  const compare: (a: T, b: T) => number =
    order === 'recent'
      ? (a, b) => lastRunOf(b) - lastRunOf(a)
      : order === 'played'
        ? (a, b) => starts(b) - starts(a) || lastRunOf(b) - lastRunOf(a)
        : order === 'year'
          ? (a, b) => year(a) - year(b)
          : order === 'manufacturer'
            ? (a, b) => (a.manufacturer ? 0 : 1) - (b.manufacturer ? 0 : 1) || (a.manufacturer ?? '').localeCompare(b.manufacturer ?? '', 'fr') || year(a) - year(b)
            : order === 'shuffle'
              ? (a, b) => shuffle.of(a.file) - shuffle.of(b.file)
              : () => 0;
  return [...tables].sort((a, b) => compare(a, b) || byTitle(a, b));
}

/** Rang de la table choisie au démarrage, dans des tables déjà rangées. */
export function startIndex(tables: readonly Sortable[], start: StartTable, random: () => number = Math.random): number {
  if (tables.length === 0) return 0;
  if (start === 'random') return Math.min(tables.length - 1, Math.floor(random() * tables.length));
  if (start === 'last') {
    let best = 0;
    for (let i = 1; i < tables.length; i++) if (lastRunOf(tables[i]!) > lastRunOf(tables[best]!)) best = i;
    return best;
  }
  return 0;
}
