// Choisir la table d'une partie en direct d'après les tables des invités (retour du 31/10/2026 :
// l'invité apprenait seulement à l'invitation qu'il n'avait pas la même version, « frustrant, on
// perd un temps inutile »). Avant d'inviter, celui qui invite voit en tête les tables que chaque
// invité a dans la version strictement identique, au sens de matchLiveTable (même empreinte du
// .vpx, même script joué) ; les autres restent visibles, grisées avec la raison et le nom de qui
// bloque. Une borne qui ne dit pas ses versions (une borne d'avant, une bibliothèque pas partagée)
// est signalée, pas refusée : la vérification à l'acceptation reste le filet de sécurité.
//
// Ce que l'on sait des tables d'un ami vient de sa bibliothèque partagée (friendlibrary.ts) : le
// jeu et la taille du .vpx de chaque table, et sa version stricte (empreintes du .vpx et du script)
// demandée à sa borne pour les seules tables qui peuvent être les miennes.

import { matchLiveTable } from './livegame';
import { t } from './i18n';
import { sameTable, type TableIdentity } from './sharing';

/** Une table de la bibliothèque d'un ami, telle qu'on la connaît. */
export interface LiveFriendTable {
  table: TableIdentity;
  /** Taille du .vpx : le même fichier sous un autre nom. */
  bytes?: number;
  print?: string;
  script?: string;
  /** Sa version est demandée à sa borne, pas encore arrivée. */
  pending?: boolean;
}

/**
 * Ce qu'on sait de la bibliothèque d'un ami : prête et avec ses versions (`ready`), d'une borne
 * d'avant qui ne les donne pas (`old`), pas partagée (`off`), demandée (`loading`), ou ami hors
 * ligne (`offline`).
 */
export type LiveLibraryState = 'ready' | 'old' | 'off' | 'loading' | 'offline';

export interface LiveFriendTables {
  key: string;
  name: string;
  library: LiveLibraryState;
  tables: readonly LiveFriendTable[];
}

/** Une de mes tables, avec sa version stricte quand elle est calculée. */
export interface LiveMineTable<T> {
  entry: T;
  title: string;
  identity: TableIdentity;
  bytes?: number;
  print?: string;
  script?: string;
  /** Son empreinte se calcule encore. */
  pending?: boolean;
}

/** Pourquoi la table d'un ami n'est pas jugée : on ne sait pas, on ne refuse pas. */
export type LiveUnknownWhy = Exclude<LiveLibraryState, 'ready'> | 'checking';

export type LiveFriendFit =
  | { key: string; name: string; fit: 'same' }
  | { key: string; name: string; fit: 'other-version'; scriptDiffers?: boolean }
  | { key: string; name: string; fit: 'missing' }
  | { key: string; name: string; fit: 'unknown'; why: LiveUnknownWhy };

/** Une table au choix : jouable avec tous (`same`), à vérifier (`unknown`), ou indisponible (`blocked`). */
export interface LiveTableChoice<T> {
  entry: T;
  title: string;
  fit: 'same' | 'unknown' | 'blocked';
  friends: LiveFriendFit[];
}

/**
 * La table d'un ami peut être la mienne : le même jeu (sameTable), ou un .vpx de la même taille (le
 * même fichier sous un autre nom). Ce sont les tables dont l'invité calcule l'empreinte à
 * l'invitation (live-game.ts, matchFor) : le choix juge sur les mêmes.
 */
export function liveCandidate(mine: { identity: TableIdentity; bytes?: number }, theirs: Pick<LiveFriendTable, 'table' | 'bytes'>): boolean {
  return !!sameTable(mine.identity, theirs.table) || (!!mine.bytes && mine.bytes === theirs.bytes);
}

/**
 * Ce qu'un ami a de ma table, jugé comme lui le jugera à l'invitation : matchLiveTable, ma table
 * dans le rôle de celle de l'invitation, ses tables candidates dans le rôle des siennes.
 */
export function liveFriendFit(mine: LiveMineTable<unknown>, friend: LiveFriendTables): LiveFriendFit {
  const who = { key: friend.key, name: friend.name };
  if (friend.library !== 'ready') return { ...who, fit: 'unknown', why: friend.library };
  const candidates = friend.tables.filter((x) => liveCandidate(mine, x));
  if (!candidates.length) return { ...who, fit: 'missing' };
  const found = matchLiveTable(
    { table: mine.identity, ...(mine.print ? { print: mine.print } : {}), ...(mine.script ? { script: mine.script } : {}) },
    candidates.map((x) => ({ entry: x, identity: x.table, ...(x.print ? { print: x.print } : {}), ...(x.script ? { script: x.script } : {}) })),
  );
  if (found.match === 'same') return { ...who, fit: 'same' };
  // Une empreinte encore en route, de mon côté ou du sien : rien ne se juge encore.
  if (mine.pending || candidates.some((x) => x.pending)) return { ...who, fit: 'unknown', why: 'checking' };
  if (found.match === 'other-version') return { ...who, fit: 'other-version', ...(found.scriptDiffers ? { scriptDiffers: true } : {}) };
  return { ...who, fit: 'missing' };
}

/**
 * Mes tables pour une partie avec ces amis : une table est jouable si elle l'est chez tous. En tête
 * celles-là, puis celles à vérifier (une borne qui ne dit pas ses versions), puis les indisponibles :
 * d'abord celles qu'une autre version seule bloque (on peut récupérer la version de l'ami), puis
 * celles qu'un ami n'a pas. Par titre dans chaque groupe.
 */
export function liveTableChoices<T>(mine: readonly LiveMineTable<T>[], friends: readonly LiveFriendTables[]): LiveTableChoice<T>[] {
  const rank = (c: LiveTableChoice<T>) => (c.fit === 'same' ? 0 : c.fit === 'unknown' ? 1 : c.friends.some((f) => f.fit === 'missing') ? 3 : 2);
  return mine
    .map((m): LiveTableChoice<T> => {
      const fits = friends.map((f) => liveFriendFit(m, f));
      const fit = fits.some((f) => f.fit === 'missing' || f.fit === 'other-version') ? 'blocked' : fits.some((f) => f.fit === 'unknown') ? 'unknown' : 'same';
      return { entry: m.entry, title: m.title, fit, friends: fits };
    })
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

/** Ce qui se dit d'un ami pour une table : « Bruno n'a pas cette table », « Autre version chez Bruno »… */
export function liveFitLabel(f: LiveFriendFit): string {
  switch (f.fit) {
    case 'same':
      return t('Même version chez {name}', { name: f.name });
    case 'other-version':
      return f.scriptDiffers ? t('Même table, autre script chez {name}', { name: f.name }) : t('Autre version chez {name}', { name: f.name });
    case 'missing':
      return t('{name} n’a pas cette table', { name: f.name });
    case 'unknown':
      switch (f.why) {
        case 'old':
          return t('Bibliothèque de {name} inconnue (ancienne version de Cyber Pinball)', { name: f.name });
        case 'off':
          return t('Bibliothèque de {name} inconnue (il ne la partage pas)', { name: f.name });
        case 'loading':
          return t('Bibliothèque de {name} demandée à sa borne…', { name: f.name });
        case 'offline':
          return t('Bibliothèque de {name} injoignable pour l’instant', { name: f.name });
        case 'checking':
          return t('Version de {name} en cours de vérification…', { name: f.name });
      }
  }
}

/**
 * Le détail d'une table au choix : qui bloque et pourquoi (une table indisponible), ce qui reste à
 * vérifier, ou avec qui elle se joue.
 */
export function liveChoiceDetail(c: Pick<LiveTableChoice<unknown>, 'fit' | 'friends'>): string {
  if (c.fit === 'same') {
    const names = c.friends.map((f) => f.name);
    return names.length === 1 ? t('Même version chez {name}', { name: names[0]! }) : t('Même version chez {names}', { names: names.join(', ') });
  }
  const shown = c.fit === 'blocked' ? c.friends.filter((f) => f.fit === 'missing' || f.fit === 'other-version') : c.friends.filter((f) => f.fit === 'unknown');
  return shown.map(liveFitLabel).join(' · ');
}
