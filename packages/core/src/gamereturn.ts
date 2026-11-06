// Retour d'une partie solo : une carte de bilan courte sur le plateau, le logo de la table, la
// durée, et seulement ce qui est réellement connu (le score et sa place s'il est entré au tableau
// d'honneur, l'écart au record, un badge gagné). Une table qui ne garde pas ses records (pas de
// VPReg.stg, ROM PinMAME qui tient les siens) n'affiche que la durée : jamais de score inventé.
//
// Start : rejouer la table aussitôt ; Exit : la roue ; la carte s'efface seule après quelques
// secondes. Un arrêt forcé (Ctrl+Maj+K), un échec, un réglage de l'affichage ou une partie entre
// amis (qui a son écran de résultats, live-game-menu.ts) n'en ont pas : ce n'est pas une partie finie.
//
// Un score entré au tableau : l'animation miroir du lancement en cinéma (cinema.ts). Le logo
// s'allume sur le fronton, se soulève d'un cran, tombe ; une tache de lumière traverse le DMD de
// haut en bas, qui affiche NEW HIGH SCORE (livedmd.ts, animation « record ») ; le logo entre par
// le haut du plateau et se pose dans la carte, une seule onde part de lui, le knocker sonne.
//
// Comme le cinéma, rien ici ne programme de minuteur : le processus principal pose l'état, chaque
// fenêtre joue sa part d'elle-même, comptée depuis l'heure du retour (startedAt).

import { badgeDefinition, badgeLabel } from './badges';
import type { HighScore, TableRecords } from './highscores';
import { formatNumber, t } from './i18n';
import type { IconName } from './icons';

/**
 * Rythme de l'animation miroir, en millisecondes depuis le retour au menu. frontend.css
 * (« Retour de partie ») et l'animation « record » du DMD (livedmd.ts) s'y tiennent ;
 * gamereturn.test.ts vérifie que la feuille de style dit les mêmes temps.
 */
export const GAME_RETURN_TIMELINE = {
  /** Le fronton s'assombrit, le logo s'y allume, posé (240 ms). */
  ignite: 0,
  /** Il se soulève d'un cran, comme une bille qui remonte avant de retomber (100 ms). */
  lift: 240,
  /** Il tombe et sort du fronton par le bas (400 ms ; son bord haut le quitte vers 660 ms). */
  drop: 340,
  /** Une tache de lumière traverse le DMD, de haut en bas, quand le logo a quitté le fronton. */
  dmdPass: 660,
  /** Durée du passage sur le DMD. */
  dmdPassLength: 240,
  /** Éclat bref en bas du DMD, à la sortie de la tache ; puis NEW HIGH SCORE. */
  dmdFlash: 40,
  /** Le logo entre par le haut du plateau (360 ms, un léger dépassement, posé à 1 200 ms). */
  land: 840,
  /** Une onde autour du logo posé (400 ms), le knocker ; le panneau paraît autour de lui (280 ms, fini à 1 480 ms). */
  impact: 1200,
  /** Fondu de sortie de la carte. */
  fadeOut: 240,
} as const;

/** Durée de la carte avant qu'elle ne s'efface seule : sans record, puis avec (l'animation comprise). */
export const GAME_RETURN_MS = { plain: 8000, record: 12_000 } as const;

/**
 * Après le retour, les boutons ne font rien pendant ce temps : celui qui a fermé VPX (Exit), encore
 * tenu, ou un flipper frappé à la fin de la dernière bille ne doivent ni fermer la carte ni relancer.
 */
export const GAME_RETURN_GUARD_MS = 900;

/** Ce que le retour sait de la partie (play(), frontend.ts). */
export interface GameReturnFacts {
  /** VPX s'est fermé normalement (LaunchResult.ok). */
  ok: boolean;
  /** Arrêt demandé par le joueur avec le raccourci « Arrêter une partie bloquée » : pas une partie finie. */
  forced: boolean;
  /** Durée de jeu, de l'apparition de la fenêtre de jeu à la fin (LaunchResult.seconds). */
  seconds: number;
  /** Scores entrés au tableau d'honneur pendant la partie (newRecords). */
  entered: readonly HighScore[];
  /** Tableau d'honneur avant et après la partie (readTableRecords) ; absent : la table n'en garde pas. */
  before?: TableRecords;
  after?: TableRecords;
  /** Badges gagnés par cette partie (identifiants, badges.ts). */
  badges?: readonly string[];
}

export interface GameReturnRecord {
  /** Place au tableau, à partir de 1. */
  rank: number;
  /** « Nouveau record », « Premier score enregistré » (tableau d'avant connu vide), sinon « Tableau d'honneur ». */
  heading: string;
  /** « 3e place » : seulement hors de la première place. */
  place?: string;
  /**
   * En-tête du DMD, dans les mots des flippers : NEW HIGH SCORE pour un record battu, HIGH SCORE #3
   * pour une autre place, HIGH SCORE #1 pour le premier score d'un tableau vide.
   */
  dmd: string;
  /** Le score, groupé à la façon de la langue. */
  score: string;
  /** Le score tel que la table l'a enregistré (pour le DMD, groupé à sa façon). */
  value: number;
  initials?: string;
  /** Écart au record : « +1 250 000 sur l'ancien record », « À 2 300 000 du record » ; absent s'il n'y a rien à comparer. */
  gap?: string;
  /** Autres scores entrés pendant la même partie (plusieurs joueurs), en plus de celui-ci. */
  others?: string;
}

export interface GameReturnBadge {
  icon: IconName;
  label: string;
}

/** Contenu de la carte, sans la table ni les boutons. */
export interface GameReturnCard {
  /** « 12 min 05 s ». */
  duration: string;
  record?: GameReturnRecord;
  badges: GameReturnBadge[];
  /** Un score entré au tableau : l'animation miroir, NEW HIGH SCORE sur le DMD, le knocker. */
  celebrate: boolean;
}

/** Durée d'une partie, à la seconde près sous l'heure : « 45 s », « 12 min 05 s », « 1 h 02 min ». */
export function gameDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return t('{s} s', { s });
  if (s < 3600) return t('{m} min {s} s', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') });
  return t('{h} h {m} min', { h: Math.floor(s / 3600), m: String(Math.floor((s % 3600) / 60)).padStart(2, '0') });
}

/**
 * La carte du retour, ou rien : une partie qui n'est pas finie (échec, arrêt forcé) ou qui n'a
 * jamais été à l'écran n'a pas de bilan. Le score n'est jamais déduit : il vient du tableau
 * d'honneur que la table a écrit, ou il n'y en a pas.
 */
export function gameReturnCard(facts: GameReturnFacts): GameReturnCard | undefined {
  if (!facts.ok || facts.forced || !(facts.seconds >= 1)) return undefined;
  const entered = [...facts.entered].sort((a, b) => a.rank - b.rank);
  const best = entered[0];
  const badges = (facts.badges ?? []).map((id) => ({ icon: badgeDefinition(id)?.icon ?? 'star', label: badgeLabel(id) }));
  return { duration: gameDuration(facts.seconds), ...(best ? { record: recordLine(best, entered.length - 1, facts) } : {}), badges, celebrate: Boolean(best) };
}

function recordLine(best: HighScore, others: number, facts: GameReturnFacts): GameReturnRecord {
  const previous = facts.before?.scores.find((s) => s.rank === 1)?.score;
  // Le premier score d'un tableau lu et vide avant la partie : pas un record battu, rien à comparer.
  const first = best.rank === 1 && facts.before !== undefined && facts.before.scores.length === 0;
  // Le record d'après la partie : celui de la table, ou un autre joueur de la même partie qui a fait mieux.
  const top = facts.after?.scores.find((s) => s.rank === 1)?.score;
  let gap: string | undefined;
  if (best.rank === 1 && previous !== undefined && best.score > previous) gap = t('+{n} sur l’ancien record', { n: formatNumber(best.score - previous) });
  else if (best.rank > 1 && top !== undefined && top > best.score) gap = t('À {n} du record', { n: formatNumber(top - best.score) });
  return {
    rank: best.rank,
    heading: first ? t('Premier score enregistré') : best.rank === 1 ? t('Nouveau record') : t('Tableau d’honneur'),
    ...(best.rank > 1 ? { place: t('{rank}e place', { rank: best.rank }) } : {}),
    dmd: best.rank === 1 && !first ? 'NEW HIGH SCORE' : `HIGH SCORE #${best.rank}`,
    score: formatNumber(best.score),
    value: best.score,
    ...(best.initials ? { initials: best.initials } : {}),
    ...(gap ? { gap } : {}),
    ...(others > 0 ? { others: others === 1 ? t('Un autre score au tableau') : t('{n} autres scores au tableau', { n: others }) } : {}),
  };
}

/** Ce que la carte montre de la table jouée. */
export interface GameReturnSubject {
  title: string;
  manufacturer?: string;
  year?: string | number;
  /** Adresse du logo du jeu (Wheel) ; absent : le médaillon au titre. */
  logo?: string;
}

/** Part d'une fenêtre dans le retour, envoyée avec son état (viewFor, frontend.ts). */
export interface GameReturnView extends GameReturnSubject, GameReturnCard {
  /** Numéro du retour : un nouveau retour repart de zéro, un état renvoyé ne relance rien. */
  id: number;
  /** Heure du retour (Date.now()) : chaque fenêtre en déduit où en est l'animation. */
  startedAt: number;
  /** Durée de la carte avant qu'elle ne s'efface seule. */
  ms: number;
  /** La fenêtre dessine le plateau : la carte s'y pose (et le logo y atterrit). */
  plateau: boolean;
  /** La fenêtre dessine le fronton : le logo s'y allume et en tombe (record seulement). */
  fronton: boolean;
  /** La carte s'en va (Exit, un autre bouton, ou son temps écoulé) : son fondu. */
  leaving?: boolean;
}

/**
 * État du retour dans le processus principal. Comme LaunchCinema, aucune méthode ne rend de
 * promesse ni ne programme de minuteur : l'effacement après GAME_RETURN_MS se lit avec l'heure
 * (expired), le processus principal décide quand relire.
 */
export class GameReturn {
  private run?: { id: number; startedAt: number; table: string; subject: GameReturnSubject; card: GameReturnCard; leavingAt?: number };
  private count = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Retour d'une partie : la carte de `table` (son fichier) paraît maintenant. */
  show(table: string, subject: GameReturnSubject, card: GameReturnCard): number {
    this.run = { id: ++this.count, startedAt: this.now(), table, subject: { ...subject }, card };
    return this.run.id;
  }

  /** La carte est à l'écran (pas encore sur le départ). */
  get open(): boolean {
    return Boolean(this.run && this.run.leavingAt === undefined);
  }

  /** Fichier de la table du bilan, pour « Rejouer ». */
  get table(): string | undefined {
    return this.open ? this.run!.table : undefined;
  }

  /** Le record se fête : NEW HIGH SCORE sur le DMD tant que la carte est là. */
  get celebrating(): boolean {
    return this.open && this.run!.card.celebrate;
  }

  /** Le score du record, pour le DMD. */
  get record(): GameReturnRecord | undefined {
    return this.open ? this.run!.card.record : undefined;
  }

  /** Heure de l'impact (onde, knocker), si la carte fête un record. */
  get impactAt(): number | undefined {
    return this.celebrating ? this.run!.startedAt + GAME_RETURN_TIMELINE.impact : undefined;
  }

  /** Heure où la carte doit s'effacer d'elle-même. */
  get endsAt(): number | undefined {
    return this.open ? this.run!.startedAt + (this.run!.card.celebrate ? GAME_RETURN_MS.record : GAME_RETURN_MS.plain) : undefined;
  }

  /** Son temps est écoulé : elle doit partir. */
  expired(): boolean {
    const end = this.endsAt;
    return end !== undefined && this.now() >= end;
  }

  /** Les boutons comptent : la garde du retour est passée (GAME_RETURN_GUARD_MS). */
  listening(): boolean {
    return this.open && this.now() - this.run!.startedAt >= GAME_RETURN_GUARD_MS;
  }

  /** La carte s'en va, en fondu ; vrai si elle était ouverte. */
  dismiss(): boolean {
    if (!this.open) return false;
    this.run!.leavingAt = this.now();
    return true;
  }

  /** Plus rien à montrer (fondu fini, partie relancée, autre écran). */
  clear(): void {
    this.run = undefined;
  }

  /** Heure où le fondu de départ sera fini ; absente si la carte n'est pas sur le départ. */
  get fadedAt(): number | undefined {
    return this.run?.leavingAt !== undefined ? this.run.leavingAt + GAME_RETURN_TIMELINE.fadeOut : undefined;
  }

  /** Le fondu est fini : la carte peut disparaître de l'état. */
  faded(): boolean {
    const at = this.fadedAt;
    return at !== undefined && this.now() >= at;
  }

  /** Part de la fenêtre qui dessine ces écrans ; rien si elle n'a ni plateau ni, pour un record, fronton. */
  view(screens: { plateau: boolean; fronton: boolean }): GameReturnView | undefined {
    if (!this.run) return undefined;
    const { id, startedAt, subject, card, leavingAt } = this.run;
    const fronton = screens.fronton && card.celebrate;
    if (!screens.plateau && !fronton) return undefined;
    return {
      ...subject,
      ...card,
      id,
      startedAt,
      ms: card.celebrate ? GAME_RETURN_MS.record : GAME_RETURN_MS.plain,
      plateau: screens.plateau,
      fronton,
      ...(leavingAt !== undefined ? { leaving: true } : {}),
    };
  }
}
