// Présence des amis (réseau des bornes, app/src/social-net.ts) : qui est en ligne, et si la liste
// est sûre ou encore en train de se faire.
//
// Un ami est en ligne tant qu'au moins une liaison saluée le relie à cette borne, quelle qu'elle
// soit (Internet, réseau local, l'une remplaçant l'autre). Saluée : son « hello » est arrivé sur
// cette liaison, donc les deux bornes s'y voient ; une connexion ouverte puis fermée avant le
// bonjour ne compte pas. Quand la dernière liaison tombe, il reste en ligne pendant une courte
// tolérance : Hyperswarm remplace une connexion en double en fermant l'ancienne avant de donner
// la nouvelle, et une borne qui se reconnecte le fait en quelques secondes. Passé ce délai sans
// nouvelle liaison, il est hors ligne, vu pour la dernière fois à la chute de sa dernière liaison
// (jamais à l'heure où on s'en aperçoit).
//
// La liste est « à jour » quand rien n'est en cours : la recherche du démarrage est faite (ou
// tous les amis sont déjà là) et aucune liaison perdue n'attend sa tolérance.

import { t, tn } from './i18n';
import { socialAgo } from './social';

/** Tolérance après la chute de la dernière liaison d'un ami, avant de le dire hors ligne. */
export const PRESENCE_GRACE_MS = 15_000;
/** Recherche des amis au démarrage du réseau : tant qu'elle dure, un ami absent n'est pas sûr. */
export const PRESENCE_SEARCH_MS = 30_000;

export interface PresenceBook {
  /** Liaison saluée avec ce pair ; true : il vient d'apparaître (il n'était ni en ligne ni en tolérance). */
  up(key: string, link: object, at: number): boolean;
  /** Liaison fermée ; sans effet pour une liaison jamais saluée. */
  down(key: string, link: object, at: number): void;
  /** En ligne : une liaison saluée, ou la dernière tombée il y a moins que la tolérance. */
  online(key: string): boolean;
  /** Plus aucune liaison, tolérance en cours. */
  pending(key: string): boolean;
  /** Liaisons saluées vivantes. */
  links(key: string): number;
  /** Amis dont la tolérance est passée : hors ligne désormais, avec l'heure de leur dernière liaison. */
  expire(at: number): { key: string; lastAlive: number }[];
  /** Prochaine fin de tolérance (pour programmer `expire`). */
  nextExpiry(): number | undefined;
  forget(key: string): void;
  clear(): void;
}

export function createPresenceBook(graceMs = PRESENCE_GRACE_MS): PresenceBook {
  const live = new Map<string, Set<object>>();
  /** Clé → heure de la chute de sa dernière liaison (tolérance en cours). */
  const lost = new Map<string, number>();
  return {
    up(key, link, _at) {
      const appeared = !live.get(key)?.size && !lost.has(key);
      const set = live.get(key) ?? new Set<object>();
      set.add(link);
      live.set(key, set);
      lost.delete(key);
      return appeared;
    },
    down(key, link, at) {
      const set = live.get(key);
      if (!set?.delete(link)) return;
      if (!set.size) {
        live.delete(key);
        lost.set(key, at);
      }
    },
    online: (key) => !!live.get(key)?.size || lost.has(key),
    pending: (key) => lost.has(key),
    links: (key) => live.get(key)?.size ?? 0,
    expire(at) {
      const gone: { key: string; lastAlive: number }[] = [];
      for (const [key, since] of lost) {
        if (at - since < graceMs) continue;
        lost.delete(key);
        gone.push({ key, lastAlive: since });
      }
      return gone;
    },
    nextExpiry: () => (lost.size ? Math.min(...lost.values()) + graceMs : undefined),
    forget(key) {
      live.delete(key);
      lost.delete(key);
    },
    clear() {
      live.clear();
      lost.clear();
    },
  };
}

/**
 * État de la liste des amis :
 * - off : rien ne passe (partage désactivé, réseau coupé ou en panne ; chaque écran dit pourquoi) ;
 * - searching : le réseau démarre, ou la recherche du démarrage cherche encore un ami absent ;
 * - updating : une liaison vient de tomber, sa tolérance court ;
 * - settled : liste à jour, en ligne comme hors ligne.
 */
export type FriendsListSync = 'off' | 'searching' | 'updating' | 'settled';

export function friendsListSync(o: {
  enabled: boolean;
  running: boolean;
  /** Réseau coupé (essais) ou en panne. */
  unavailable?: boolean;
  /** Heure (ms) où le réseau a démarré, ou repris après un changement de réseau. */
  startedAt?: number;
  now: number;
  friends: readonly string[];
  online(key: string): boolean;
  pending(key: string): boolean;
  searchMs?: number;
}): FriendsListSync {
  if (!o.enabled || o.unavailable) return 'off';
  if (!o.running || o.startedAt === undefined) return 'searching';
  if (o.friends.some((k) => o.pending(k))) return 'updating';
  if (o.now - o.startedAt < (o.searchMs ?? PRESENCE_SEARCH_MS) && o.friends.some((k) => !o.online(k))) return 'searching';
  return 'settled';
}

/** Ligne d'état de la liste (rubrique Amis, choix des amis à inviter) ; rien quand rien ne passe. */
export function friendsListLine(sync: FriendsListSync, online: number): { text: string; detail: string; tone: 'info' | 'ok'; busy: boolean } | undefined {
  switch (sync) {
    case 'off':
      return undefined;
    case 'searching':
      return { text: t('Recherche des amis…'), detail: t('Les bornes se retrouvent : un ami encore hors ligne peut apparaître d’un instant à l’autre'), tone: 'info', busy: true };
    case 'updating':
      return { text: t('Mise à jour en cours…'), detail: t('Une liaison vient de tomber : la borne vérifie avant de dire un ami hors ligne'), tone: 'info', busy: true };
    case 'settled':
      return { text: tn(online, 'Liste à jour : {n} ami en ligne', 'Liste à jour : {n} amis en ligne'), detail: t('Un ami hors ligne n’a pas de borne joignable en ce moment'), tone: 'ok', busy: false };
  }
}

/**
 * Détail d'un ami hors ligne : « Vu il y a 3 h » quand la liste est à jour ; pendant une
 * recherche ou une mise à jour, le libellé le dit (« Vu il y a 3 h · recherche en cours »).
 */
export function offlineText(sync: FriendsListSync, lastSeen: string | undefined, now = new Date()): string {
  const seen = lastSeen ? t('Vu {ago}', { ago: socialAgo(lastSeen, now) }) : t('Pas encore vu en ligne');
  return sync === 'searching' || sync === 'updating' ? t('{seen} · recherche en cours', { seen }) : seen;
}
