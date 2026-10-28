// Badges du joueur : une première série, tirée de ce que Cyber Pinball relève déjà (parties et
// temps de jeu de chaque table dans son .info, records entrés au tableau d'honneur, highscores.ts).
// Rien n'est inventé : un badge se gagne sur des faits relevés à cette borne.
//
// Au premier calcul, les badges déjà mérités par l'historique sont donnés sans évènement :
// les amis ne voient « Badge reçu » que pour ce qui arrive ensuite (grantBadges).

import { t } from './i18n';
import type { IconName } from './icons';
import { addEvent, type EarnedBadge, type SocialEvent, type SocialState } from './social';
import type { TableEntry } from './tables';

export interface PlayStats {
  /** Parties jouées, toutes tables. */
  games: number;
  /** Tables jouées au moins une fois. */
  tables: number;
  /** Temps de jeu total, en secondes. */
  seconds: number;
  /** Plus long temps passé sur une même table, en secondes. */
  longestTable: number;
}

/** Ce que les tables ont enregistré de leurs parties (.info, User.StartCount et User.RunTime). */
export function playStats(tables: readonly Pick<TableEntry, 'info'>[]): PlayStats {
  let games = 0, played = 0, seconds = 0, longestTable = 0;
  for (const table of tables) {
    const starts = table.info.User?.StartCount ?? 0;
    const run = table.info.User?.RunTime ?? 0;
    games += starts;
    if (starts > 0) played++;
    seconds += run;
    longestTable = Math.max(longestTable, run);
  }
  return { games, tables: played, seconds, longestTable };
}

/** Records entrés par ce joueur : tous, et meilleurs scores, comptés par table. */
export interface RecordStats {
  records: number;
  /** Tables dont il a fait le meilleur score (place 1). */
  championTables: number;
}

export function recordStats(events: readonly SocialEvent[]): RecordStats {
  const records = events.filter((e) => e.kind === 'record');
  const champion = new Set(records.filter((e) => e.rank === 1).map((e) => e.table?.vpsId ?? e.table?.title));
  return { records: records.length, championTables: champion.size };
}

export interface BadgeDefinition {
  id: string;
  icon: IconName;
  readonly label: string;
  readonly detail: string;
  earned(play: PlayStats, records: RecordStats): boolean;
}

const HOUR = 3600;

export const BADGES: readonly BadgeDefinition[] = [
  { id: 'first-game', icon: 'play', get label() { return t('Première partie'); }, get detail() { return t('Jouer une partie jusqu’au bout'); }, earned: (p) => p.games >= 1 },
  { id: 'ten-tables', icon: 'tables', get label() { return t('Dix tables'); }, get detail() { return t('Jouer à dix tables différentes'); }, earned: (p) => p.tables >= 10 },
  { id: 'hundred-games', icon: 'coin', get label() { return t('Cent parties'); }, get detail() { return t('Jouer cent parties'); }, earned: (p) => p.games >= 100 },
  { id: 'hour-on-table', icon: 'clock', get label() { return t('Une heure sur une table'); }, get detail() { return t('Passer une heure en tout sur la même table'); }, earned: (p) => p.longestTable >= HOUR },
  { id: 'ten-hours', icon: 'gauge', get label() { return t('Dix heures de jeu'); }, get detail() { return t('Jouer dix heures en tout'); }, earned: (p) => p.seconds >= 10 * HOUR },
  { id: 'first-record', icon: 'list', get label() { return t('Au tableau d’honneur'); }, get detail() { return t('Entrer au tableau des records d’une table'); }, earned: (_p, r) => r.records >= 1 },
  { id: 'grand-champion', icon: 'star', get label() { return t('Grand Champion'); }, get detail() { return t('Faire le meilleur score d’une table'); }, earned: (_p, r) => r.championTables >= 1 },
  { id: 'five-champion', icon: 'rocket', get label() { return t('Cinq fois champion'); }, get detail() { return t('Faire le meilleur score de cinq tables'); }, earned: (_p, r) => r.championTables >= 5 },
];

export function badgeDefinition(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id);
}

/** Nom d'un badge, y compris d'un badge inconnu de cette version (reçu d'un ami plus à jour). */
export function badgeLabel(id: string): string {
  return badgeDefinition(id)?.label ?? id;
}

/** Badges à ajouter : ceux mérités et pas encore tenus. */
export function evaluateBadges(held: readonly EarnedBadge[], play: PlayStats, records: RecordStats, now = new Date()): EarnedBadge[] {
  const have = new Set(held.map((b) => b.id));
  return BADGES.filter((b) => !have.has(b.id) && b.earned(play, records)).map((b) => ({ id: b.id, at: now.toISOString() }));
}

/**
 * Badges mérités ajoutés à l'état. Au premier calcul (badgesChecked faux), ils sont donnés sans
 * évènement : l'historique d'avant le partage ne s'annonce pas aux amis. Ensuite, chacun devient
 * un évènement « badge » à leur envoyer.
 */
export function grantBadges(state: SocialState, play: PlayStats, now = new Date()): { state: SocialState; events: SocialEvent[] } {
  const fresh = evaluateBadges(state.badges, play, recordStats(state.events), now);
  let next: SocialState = { ...state, badges: [...state.badges, ...fresh], badgesChecked: true };
  const events: SocialEvent[] = [];
  if (state.badgesChecked) {
    for (const b of fresh) {
      const added = addEvent(next, { kind: 'badge', badge: b.id }, now);
      next = added.state;
      events.push(added.event);
    }
  }
  return { state: next, events };
}
