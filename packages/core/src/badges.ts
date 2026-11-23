// Badges du joueur : 56 badges en 12 familles (décidés le 17/11/2026, maquette « Niveaux et
// badges »), tirés de ce que Cyber Pinball relève : parties et temps de jeu de chaque table dans son
// .info, records entrés au tableau d'honneur (highscores.ts), niveau (levels.ts : records
// personnels, classements de la semaine, heure et mode des parties), parties en direct
// (gamehistory.ts), amis et « J'aime » reçus. Rien n'est inventé : un badge se gagne sur des faits
// relevés à cette borne. Les 8 premiers badges gardent leur identifiant : les amis restés sur une
// version plus ancienne les reconnaissent.
//
// Chaque badge a une rareté, qui dit ses XP (RARITY_XP). Les badges secrets restent cachés dans la
// vitrine jusqu'à ce qu'ils tombent ; seul leur indice se lit.
//
// Au premier calcul, et au premier calcul d'une nouvelle série (BADGES_SERIES), les badges déjà
// mérités par l'historique sont donnés sans évènement : les amis ne voient « Badge reçu » que pour
// ce qui arrive ensuite (grantBadges).

import { registerTextRef, t } from './i18n';
import type { IconName } from './icons';
import { addEvent, type EarnedBadge, type SocialEvent, type SocialState } from './social';
import type { TableEntry } from './tables';

/** Série du catalogue : la monter quand des badges s'ajoutent, pour les donner sans annonce la première fois. */
export const BADGES_SERIES = 3;

export interface PlayStats {
  /** Parties jouées, toutes tables. */
  games: number;
  /** Tables jouées au moins une fois. */
  tables: number;
  /** Temps de jeu total, en secondes. */
  seconds: number;
  /** Plus long temps passé sur une même table, en secondes. */
  longestTable: number;
  /** Décennies (années 70 à 2020) des tables jouées. */
  decades?: number;
  /** Fabricants des tables jouées. */
  manufacturers?: number;
}

/** Les décennies qui comptent pour « Toutes les époques » : 1970 à 2020. */
const DECADES = [1970, 1980, 1990, 2000, 2010, 2020];

/** Ce que les tables ont enregistré de leurs parties (.info, User.StartCount et User.RunTime). */
export function playStats(tables: readonly (Pick<TableEntry, 'info'> & Partial<Pick<TableEntry, 'year' | 'manufacturer'>>)[]): PlayStats {
  let games = 0, played = 0, seconds = 0, longestTable = 0;
  const decades = new Set<number>();
  const makers = new Set<string>();
  for (const table of tables) {
    const starts = table.info.User?.StartCount ?? 0;
    const run = table.info.User?.RunTime ?? 0;
    games += starts;
    if (starts > 0) {
      played++;
      if (table.year) {
        const decade = Math.min(2020, Math.floor(table.year / 10) * 10);
        if (DECADES.includes(decade)) decades.add(decade);
      }
      if (table.manufacturer?.trim()) makers.add(table.manufacturer.trim().toLowerCase());
    }
    seconds += run;
    longestTable = Math.max(longestTable, run);
  }
  return { games, tables: played, seconds, longestTable, ...(decades.size ? { decades: decades.size } : {}), ...(makers.size ? { manufacturers: makers.size } : {}) };
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

/** Tout ce que mesurent les badges ; ce qui manque compte pour zéro. */
export interface BadgeFacts extends PlayStats, RecordStats {
  /** Records personnels battus, et doublés (levels.ts). */
  beaten?: number;
  doubled?: number;
  /** Parties en direct menées au bout, gagnées, à quatre joueurs (gamehistory.ts). */
  live?: number;
  liveWins?: number;
  liveFull?: number;
  /** Tables de la semaine de groupe gagnées. */
  groupWins?: number;
  /** Groupes dont je suis membre. */
  groups?: number;
  friends?: number;
  /** « J'aime » reçus sur mon activité publique, et donnés. */
  likes?: number;
  likesGiven?: number;
  /** Jours où j'ai écrit dans un salon ou un groupe ; réactions reçues sur mes lignes. */
  roomDays?: number;
  reactions?: number;
  /** Exploits des classements de la semaine (levels.ts, feats). */
  countryTop10?: number;
  countryPodium?: number;
  worldTop10?: number;
  worldFirst?: number;
  top100Streak?: number;
  vr?: boolean;
  vision3d?: boolean;
  nightOwl?: boolean;
  /** Plus longue journée de jeu, en secondes. */
  longestDay?: number;
  /** Jours entre la première et la dernière partie relevées. */
  playedSpanDays?: number;
  /** Personnes invitées confirmées (invitations.ts). */
  invited?: number;
  /** Avis, retours et propositions envoyés (feedback.ts, contributions), et propositions passées « fait ». */
  contributions?: number;
  ideasShipped?: number;
}

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_XP: Record<BadgeRarity, number> = { common: 50, rare: 150, epic: 400, legendary: 1000 };

export type BadgeFamily = 'journey' | 'time' | 'explorer' | 'progress' | 'honor' | 'rankings' | 'online' | 'rooms' | 'together' | 'community' | 'discoveries' | 'secrets';
export const BADGE_FAMILIES: readonly BadgeFamily[] = ['journey', 'time', 'explorer', 'progress', 'honor', 'rankings', 'online', 'rooms', 'together', 'community', 'discoveries', 'secrets'];

/** Le style du badge (retenu le 17/11/2026) : rond pour les communs, hexagone arrondi au-delà. */
export const badgeShape = (r: BadgeRarity): 'round' | 'hex' => (r === 'common' ? 'round' : 'hex');

/** Le fond de l'animation de chaque famille (décidé le 17/11/2026, maquette « Niveaux et badges »). */
export type CelebrationBackdrop = 'horizon' | 'shock' | 'rise' | 'swarm' | 'glitch' | 'rays';
export const FAMILY_BACKDROP: Record<BadgeFamily, CelebrationBackdrop> = {
  journey: 'horizon',
  time: 'horizon',
  explorer: 'horizon',
  discoveries: 'horizon',
  honor: 'shock',
  rankings: 'shock',
  progress: 'rise',
  online: 'swarm',
  rooms: 'swarm',
  together: 'swarm',
  community: 'swarm',
  secrets: 'glitch',
};

export interface BadgeDefinition {
  id: string;
  icon: IconName;
  family: BadgeFamily;
  rarity: BadgeRarity;
  /** Caché dans la vitrine tant qu'il n'est pas reçu : seul `hint` se lit. */
  secret?: true;
  readonly label: string;
  readonly detail: string;
  readonly hint?: string;
  /** Où en est le joueur : la mesure, à comparer à `target`. */
  measure(f: BadgeFacts): number;
  target: number;
}

const HOUR = 3600;
const n = (v: number | undefined) => v ?? 0;
const yes = (v: boolean | undefined) => (v ? 1 : 0);

export const BADGES: readonly BadgeDefinition[] = [
  // Parcours
  { id: 'first-game', icon: 'play', family: 'journey', rarity: 'common', get label() { return t('Première partie'); }, get detail() { return t('Jouer une partie jusqu’au bout'); }, measure: (f) => f.games, target: 1 },
  { id: 'ten-games', icon: 'play', family: 'journey', rarity: 'common', get label() { return t('Dix parties'); }, get detail() { return t('Jouer dix parties'); }, measure: (f) => f.games, target: 10 },
  { id: 'hundred-games', icon: 'coin', family: 'journey', rarity: 'rare', get label() { return t('Cent parties'); }, get detail() { return t('Jouer cent parties'); }, measure: (f) => f.games, target: 100 },
  { id: 'five-hundred-games', icon: 'coin', family: 'journey', rarity: 'epic', get label() { return t('Cinq cents parties'); }, get detail() { return t('Jouer cinq cents parties'); }, measure: (f) => f.games, target: 500 },
  { id: 'two-thousand-games', icon: 'coin', family: 'journey', rarity: 'legendary', get label() { return t('Deux mille parties'); }, get detail() { return t('Jouer deux mille parties'); }, measure: (f) => f.games, target: 2000 },
  // Temps de jeu
  { id: 'hour-on-table', icon: 'clock', family: 'time', rarity: 'common', get label() { return t('Une heure sur une table'); }, get detail() { return t('Passer une heure en tout sur la même table'); }, measure: (f) => Math.floor(f.longestTable / 60), target: 60 },
  { id: 'ten-hours', icon: 'gauge', family: 'time', rarity: 'rare', get label() { return t('Dix heures de jeu'); }, get detail() { return t('Jouer dix heures en tout'); }, measure: (f) => Math.floor(f.seconds / HOUR), target: 10 },
  { id: 'fifty-hours', icon: 'gauge', family: 'time', rarity: 'epic', get label() { return t('Cinquante heures'); }, get detail() { return t('Jouer cinquante heures en tout'); }, measure: (f) => Math.floor(f.seconds / HOUR), target: 50 },
  { id: 'two-hundred-hours', icon: 'gauge', family: 'time', rarity: 'legendary', get label() { return t('Deux cents heures'); }, get detail() { return t('Jouer deux cents heures en tout'); }, measure: (f) => Math.floor(f.seconds / HOUR), target: 200 },
  // Explorateur
  { id: 'ten-tables', icon: 'tables', family: 'explorer', rarity: 'common', get label() { return t('Dix tables'); }, get detail() { return t('Jouer à dix tables différentes'); }, measure: (f) => f.tables, target: 10 },
  { id: 'explorer', icon: 'globe', family: 'explorer', rarity: 'rare', get label() { return t('Explorateur'); }, get detail() { return t('Jouer à 25 tables différentes'); }, measure: (f) => f.tables, target: 25 },
  { id: 'globetrotter', icon: 'globe', family: 'explorer', rarity: 'epic', get label() { return t('Grand voyageur'); }, get detail() { return t('Jouer à 50 tables différentes'); }, measure: (f) => f.tables, target: 50 },
  { id: 'encyclopedia', icon: 'book', family: 'explorer', rarity: 'legendary', get label() { return t('Encyclopédie'); }, get detail() { return t('Jouer à 100 tables différentes'); }, measure: (f) => f.tables, target: 100 },
  { id: 'all-eras', icon: 'calendar', family: 'explorer', rarity: 'rare', get label() { return t('Toutes les époques'); }, get detail() { return t('Une table de chaque décennie, des années 70 aux années 2020'); }, measure: (f) => n(f.decades), target: DECADES.length },
  { id: 'five-makers', icon: 'factory', family: 'explorer', rarity: 'common', get label() { return t('Cinq fabricants'); }, get detail() { return t('Jouer aux tables de cinq fabricants différents'); }, measure: (f) => n(f.manufacturers), target: 5 },
  // Progrès
  { id: 'improving', icon: 'upgrade', family: 'progress', rarity: 'common', get label() { return t('En progrès'); }, get detail() { return t('Battre son record personnel sur une table'); }, measure: (f) => n(f.beaten), target: 1 },
  { id: 'higher', icon: 'upgrade', family: 'progress', rarity: 'rare', get label() { return t('Toujours plus haut'); }, get detail() { return t('Battre 25 fois son record personnel'); }, measure: (f) => n(f.beaten), target: 25 },
  { id: 'insatiable', icon: 'upgrade', family: 'progress', rarity: 'epic', get label() { return t('Insatiable'); }, get detail() { return t('Battre 100 fois son record personnel'); }, measure: (f) => n(f.beaten), target: 100 },
  { id: 'doubled', icon: 'sparkle', family: 'progress', rarity: 'rare', get label() { return t('Le double'); }, get detail() { return t('Doubler son ancien record sur une table'); }, measure: (f) => n(f.doubled), target: 1 },
  // Tableau d'honneur
  { id: 'first-record', icon: 'list', family: 'honor', rarity: 'common', get label() { return t('Au tableau d’honneur'); }, get detail() { return t('Entrer au tableau des records d’une table'); }, measure: (f) => f.records, target: 1 },
  { id: 'grand-champion', icon: 'star', family: 'honor', rarity: 'rare', get label() { return t('Grand Champion'); }, get detail() { return t('Faire le meilleur score d’une table'); }, measure: (f) => f.championTables, target: 1 },
  { id: 'five-champion', icon: 'rocket', family: 'honor', rarity: 'epic', get label() { return t('Cinq fois champion'); }, get detail() { return t('Faire le meilleur score de cinq tables'); }, measure: (f) => f.championTables, target: 5 },
  { id: 'twenty-champion', icon: 'star-filled', family: 'honor', rarity: 'legendary', get label() { return t('Vingt fois champion'); }, get detail() { return t('Faire le meilleur score de vingt tables'); }, measure: (f) => f.championTables, target: 20 },
  // Classements de la semaine
  { id: 'country-top10', icon: 'trophy', family: 'rankings', rarity: 'rare', get label() { return t('Top 10 national'); }, get detail() { return t('Finir une semaine dans les dix premiers de son pays sur une table'); }, measure: (f) => n(f.countryTop10), target: 1 },
  { id: 'country-podium', icon: 'trophy', family: 'rankings', rarity: 'epic', get label() { return t('Podium national'); }, get detail() { return t('Finir une semaine sur le podium de son pays sur une table'); }, measure: (f) => n(f.countryPodium), target: 1 },
  { id: 'world-top10', icon: 'globe', family: 'rankings', rarity: 'epic', get label() { return t('Top 10 mondial'); }, get detail() { return t('Finir une semaine dans les dix premiers au monde sur une table'); }, measure: (f) => n(f.worldTop10), target: 1 },
  { id: 'world-first', icon: 'medal', family: 'rankings', rarity: 'legendary', get label() { return t('Numéro un mondial'); }, get detail() { return t('Finir une semaine premier au monde sur une table'); }, measure: (f) => n(f.worldFirst), target: 1 },
  { id: 'still-there', icon: 'repeat', family: 'rankings', rarity: 'epic', get label() { return t('Toujours là'); }, get detail() { return t('Rester dans le top 100 mondial d’une table quatre semaines de suite'); }, measure: (f) => n(f.top100Streak), target: 4 },
  // En ligne : parties en direct entre amis, ouvertes à tous ou de groupe
  { id: 'live-game', icon: 'friends', family: 'online', rarity: 'common', get label() { return t('En direct'); }, get detail() { return t('Mener au bout une partie en ligne'); }, measure: (f) => n(f.live), target: 1 },
  { id: 'full-table', icon: 'friend-list', family: 'online', rarity: 'common', get label() { return t('Table pleine'); }, get detail() { return t('Jouer une partie en ligne à quatre'); }, measure: (f) => n(f.liveFull), target: 1 },
  { id: 'online-regular', icon: 'friends', family: 'online', rarity: 'rare', get label() { return t('Habitué du direct'); }, get detail() { return t('Mener au bout 25 parties en ligne'); }, measure: (f) => n(f.live), target: 25 },
  { id: 'hundred-online', icon: 'network', family: 'online', rarity: 'epic', get label() { return t('Cent parties en ligne'); }, get detail() { return t('Mener au bout cent parties en ligne'); }, measure: (f) => n(f.live), target: 100 },
  { id: 'ten-wins', icon: 'trophy', family: 'online', rarity: 'rare', get label() { return t('Dix victoires'); }, get detail() { return t('Gagner dix parties en ligne'); }, measure: (f) => n(f.liveWins), target: 10 },
  { id: 'hundred-wins', icon: 'medal', family: 'online', rarity: 'legendary', get label() { return t('Cent victoires'); }, get detail() { return t('Gagner cent parties en ligne'); }, measure: (f) => n(f.liveWins), target: 100 },
  // Salons
  { id: 'first-word', icon: 'message', family: 'rooms', rarity: 'common', get label() { return t('Premier mot'); }, get detail() { return t('Écrire dans un salon'); }, measure: (f) => n(f.roomDays), target: 1 },
  { id: 'room-regular', icon: 'message', family: 'rooms', rarity: 'rare', get label() { return t('Habitué du salon'); }, get detail() { return t('Écrire au salon dix jours différents'); }, measure: (f) => n(f.roomDays), target: 10 },
  { id: 'room-pillar', icon: 'globe', family: 'rooms', rarity: 'epic', get label() { return t('Pilier du salon'); }, get detail() { return t('Écrire au salon cinquante jours différents'); }, measure: (f) => n(f.roomDays), target: 50 },
  { id: 'noticed', icon: 'sparkle', family: 'rooms', rarity: 'rare', get label() { return t('Remarqué'); }, get detail() { return t('Recevoir 25 réactions sur ses lignes'); }, measure: (f) => n(f.reactions), target: 25 },
  // Entre joueurs
  { id: 'first-friend', icon: 'friend-add', family: 'together', rarity: 'common', get label() { return t('Premier ami'); }, get detail() { return t('Avoir un ami'); }, measure: (f) => n(f.friends), target: 1 },
  { id: 'well-surrounded', icon: 'friend-list', family: 'together', rarity: 'rare', get label() { return t('Bien entouré'); }, get detail() { return t('Avoir dix amis'); }, measure: (f) => n(f.friends), target: 10 },
  { id: 'group-member', icon: 'lock', family: 'together', rarity: 'common', get label() { return t('Membre d’un groupe'); }, get detail() { return t('Entrer dans un groupe'); }, measure: (f) => n(f.groups), target: 1 },
  { id: 'group-champion', icon: 'trophy', family: 'together', rarity: 'rare', get label() { return t('Champion du groupe'); }, get detail() { return t('Gagner la table de la semaine de son groupe'); }, measure: (f) => n(f.groupWins), target: 1 },
  { id: 'liked', icon: 'thumb-up', family: 'together', rarity: 'common', get label() { return t('Apprécié'); }, get detail() { return t('Recevoir dix « J’aime »'); }, measure: (f) => n(f.likes), target: 10 },
  { id: 'popular', icon: 'thumb-up-filled', family: 'together', rarity: 'rare', get label() { return t('Populaire'); }, get detail() { return t('Recevoir cent « J’aime »'); }, measure: (f) => n(f.likes), target: 100 },
  { id: 'generous', icon: 'thumb-up', family: 'together', rarity: 'common', get label() { return t('Généreux'); }, get detail() { return t('Donner 25 « J’aime »'); }, measure: (f) => n(f.likesGiven), target: 25 },
  // Communauté : personnes invitées (invitations.ts), retours et propositions (feedback.ts)
  { id: 'ambassador', icon: 'friend-add', family: 'community', rarity: 'rare', get label() { return t('Ambassadeur'); }, get detail() { return t('Faire découvrir Cyber Pinball à un joueur'); }, measure: (f) => n(f.invited), target: 1 },
  { id: 'gatherer', icon: 'friends', family: 'community', rarity: 'epic', get label() { return t('Rassembleur'); }, get detail() { return t('Faire découvrir Cyber Pinball à cinq joueurs'); }, measure: (f) => n(f.invited), target: 5 },
  { id: 'community-builder', icon: 'network', family: 'community', rarity: 'legendary', get label() { return t('Bâtisseur de communauté'); }, get detail() { return t('Faire découvrir Cyber Pinball à vingt joueurs'); }, measure: (f) => n(f.invited), target: 20 },
  { id: 'a-voice', icon: 'message', family: 'community', rarity: 'common', get label() { return t('Une voix qui compte'); }, get detail() { return t('Envoyer un avis, un retour ou une proposition'); }, measure: (f) => n(f.contributions), target: 1 },
  { id: 'proposer', icon: 'edit', family: 'community', rarity: 'rare', get label() { return t('Force de proposition'); }, get detail() { return t('Envoyer dix avis, retours ou propositions'); }, measure: (f) => n(f.contributions), target: 10 },
  { id: 'idea-shipped', icon: 'sparkle', family: 'community', rarity: 'epic', get label() { return t('Son idée est dans le jeu'); }, get detail() { return t('Voir une de ses propositions arriver dans Cyber Pinball'); }, measure: (f) => n(f.ideasShipped), target: 1 },
  // Découvertes
  { id: 'head-in-stars', icon: 'vr', family: 'discoveries', rarity: 'common', get label() { return t('Tête dans les étoiles'); }, get detail() { return t('Jouer une partie en VR, casque sur la tête'); }, measure: (f) => yes(f.vr), target: 1 },
  { id: 'relief', icon: 'eye', family: 'discoveries', rarity: 'common', get label() { return t('Relief'); }, get detail() { return t('Jouer une partie en vision 3D'); }, measure: (f) => yes(f.vision3d), target: 1 },
  // Secrets
  { id: 'night-owl', icon: 'moon', family: 'secrets', rarity: 'common', secret: true, get label() { return t('Oiseau de nuit'); }, get detail() { return t('Finir une partie entre 2 h et 5 h du matin'); }, get hint() { return t('Certaines parties se jouent quand tout le monde dort'); }, measure: (f) => yes(f.nightOwl), target: 1 },
  { id: 'marathon', icon: 'history', family: 'secrets', rarity: 'rare', secret: true, get label() { return t('Marathon'); }, get detail() { return t('Jouer trois heures dans la même journée'); }, get hint() { return t('Une très longue journée devant la borne'); }, measure: (f) => Math.floor(n(f.longestDay) / 60), target: 180 },
  { id: 'loyal', icon: 'calendar', family: 'secrets', rarity: 'epic', secret: true, get label() { return t('Fidèle'); }, get detail() { return t('Jouer encore un an après sa première partie'); }, get hint() { return t('Le temps fait son œuvre'); }, measure: (f) => n(f.playedSpanDays), target: 365 },
];

export function badgeDefinition(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id);
}

/** Nom d'un badge, y compris d'un badge inconnu de cette version (reçu d'un ami plus à jour). */
export function badgeLabel(id: string): string {
  return badgeDefinition(id)?.label ?? id;
}

/** XP d'un badge (sa rareté) ; un badge inconnu de cette version n'en rapporte pas. */
export const badgeXp = (id: string): number => {
  const b = badgeDefinition(id);
  return b ? RARITY_XP[b.rarity] : 0;
};

export function rarityLabel(r: BadgeRarity): string {
  switch (r) {
    case 'common':
      return t('Commun');
    case 'rare':
      return t('Rare');
    case 'epic':
      return t('Épique');
    case 'legendary':
      return t('Légendaire');
  }
}

export function familyLabel(f: BadgeFamily): string {
  switch (f) {
    case 'journey':
      return t('Parcours');
    case 'time':
      return t('Temps de jeu');
    case 'explorer':
      return t('Explorateur');
    case 'progress':
      return t('Progrès');
    case 'honor':
      return t('Tableau d’honneur');
    case 'rankings':
      return t('Classements');
    case 'online':
      return t('En ligne');
    case 'rooms':
      return t('Salons');
    case 'together':
      return t('Entre joueurs');
    case 'community':
      return t('Communauté');
    case 'discoveries':
      return t('Découvertes');
    case 'secrets':
      return t('Secrets');
  }
}

// Nom d'un badge dans un texte enregistré ({ ref: 'badge', id }), dit à l'affichage (Activité récente).
registerTextRef('badge', badgeLabel);

export const badgeEarned = (b: BadgeDefinition, f: BadgeFacts): boolean => b.measure(f) >= b.target;

/** Où en est le joueur pour un badge, de 0 à 1. */
export const badgeProgress = (b: BadgeDefinition, f: BadgeFacts): number => Math.max(0, Math.min(1, b.measure(f) / b.target));

/** Badges à ajouter : ceux mérités et pas encore tenus. */
export function evaluateBadges(held: readonly EarnedBadge[], facts: BadgeFacts, now = new Date()): EarnedBadge[] {
  const have = new Set(held.map((b) => b.id));
  return BADGES.filter((b) => !have.has(b.id) && badgeEarned(b, facts)).map((b) => ({ id: b.id, at: now.toISOString() }));
}

/**
 * Les badges pas encore tenus les plus proches d'être reçus (récap « Mon niveau ») : jamais un
 * secret, jamais un badge à zéro.
 */
export function nearestBadges(held: readonly EarnedBadge[], facts: BadgeFacts, count = 2): { badge: BadgeDefinition; value: number; progress: number }[] {
  const have = new Set(held.map((b) => b.id));
  return BADGES.filter((b) => !have.has(b.id) && !b.secret)
    .map((b) => ({ badge: b, value: Math.min(b.target, Math.floor(b.measure(facts))), progress: badgeProgress(b, facts) }))
    .filter((x) => x.progress > 0 && x.progress < 1)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, count);
}

/**
 * Badges mérités ajoutés à l'état. Au premier calcul (badgesChecked faux), et au premier calcul
 * d'une nouvelle série du catalogue, ils sont donnés sans évènement : l'historique d'avant ne
 * s'annonce pas aux amis. Ensuite, chacun devient un évènement « badge » à leur envoyer. `fresh` :
 * les badges ajoutés, à montrer au joueur et à compter dans son niveau.
 */
export function grantBadges(state: SocialState, facts: BadgeFacts, now = new Date()): { state: SocialState; events: SocialEvent[]; fresh: EarnedBadge[]; silent: boolean } {
  const fresh = evaluateBadges(state.badges, facts, now);
  const silent = !state.badgesChecked || (state.badgesSeries ?? 1) < BADGES_SERIES;
  let next: SocialState = { ...state, badges: [...state.badges, ...fresh], badgesChecked: true, badgesSeries: BADGES_SERIES };
  const events: SocialEvent[] = [];
  if (!silent) {
    for (const b of fresh) {
      const added = addEvent(next, { kind: 'badge', badge: b.id }, now);
      next = added.state;
      events.push(added.event);
    }
  }
  return { state: next, events, fresh, silent };
}
