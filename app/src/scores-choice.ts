// Portée et période du tableau des scores d'une table (fiche > « Tableau des scores », library.ts).
// Par défaut, le classement mondial de la semaine (décidé le 17/11/2026) ; dès que le joueur change
// d'onglet (clic, flippers, MagnaSave), son choix est gardé et rouvert la fois suivante, sur toutes
// les tables. Gardé dans <données>\tableau-des-scores.json (partie « Réglages » des sauvegardes) ;
// illisible ou absent : le défaut.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { RANKING_SCOPES, SCORE_PERIODS, writeFileAtomic, type RankingScope, type ScorePeriod } from '@cyberpinball/core';

export interface ScoresChoice {
  scope: RankingScope;
  period: ScorePeriod;
}

export const SCORES_CHOICE_DEFAULT: ScoresChoice = { scope: 'world', period: 'week' };

const file = (dataDir: string) => path.join(dataDir, 'tableau-des-scores.json');

/** Le choix lu tel quel : chaque champ inconnu ou absent est écarté (undefined). */
export function parseScoresChoice(raw: unknown): Partial<ScoresChoice> {
  if (!raw || typeof raw !== 'object') return {};
  const { scope, period } = raw as { scope?: unknown; period?: unknown };
  return {
    ...(RANKING_SCOPES.includes(scope as RankingScope) ? { scope: scope as RankingScope } : {}),
    ...(SCORE_PERIODS.includes(period as ScorePeriod) ? { period: period as ScorePeriod } : {}),
  };
}

/** Ce que le joueur a choisi la dernière fois ; un champ absent : jamais choisi. */
export function readScoresChoice(dataDir: string): Partial<ScoresChoice> {
  try {
    return parseScoresChoice(JSON.parse(fs.readFileSync(file(dataDir), 'utf8')));
  } catch {
    return {};
  }
}

export function writeScoresChoice(dataDir: string, choice: ScoresChoice): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    writeFileAtomic(file(dataDir), JSON.stringify({ scope: choice.scope, period: choice.period }, null, 2));
  } catch {
    // Disque plein ou en lecture seule : le choix vaut pour cette fois, l'écran n'en souffre pas.
  }
}

/**
 * L'ouverture du tableau : le choix gardé, sinon le défaut (Mondial, Cette semaine). Sans choix
 * gardé et sans classement mondial (partage désactivé, réseau absent), la portée « Cette borne »,
 * comme l'écran Classements : un choix gardé, lui, est rouvert tel quel, avec sa raison s'il manque.
 * `world` : le classement mondial de la table (undefined : pas de réseau des bornes). Une empreinte
 * encore en calcul (`pending`) n'est pas une absence : le classement mondial va venir.
 */
export function openingScoresChoice(saved: Partial<ScoresChoice>, world: () => { unavailable?: string; pending?: true } | undefined): ScoresChoice {
  const period = saved.period ?? SCORES_CHOICE_DEFAULT.period;
  const missing = () => {
    const w = world();
    return !w || (!!w.unavailable && !w.pending);
  };
  const scope = saved.scope ?? (missing() ? 'cabinet' : SCORES_CHOICE_DEFAULT.scope);
  return { scope, period };
}
