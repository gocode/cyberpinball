// La carte « Objectif » du chargement (maquettes de l'engagement validées le 21/11/2026) : ce qu'il y a
// à battre sur la table qui se lance. Ce module ne fait que la vue ; où elle se pose, c'est le rendu
// qui en décide (frontend.js, loadingScreen) selon une seule règle, fixée par objectif-chargement.test.ts :
// - jamais sur un média de chargement choisi par le joueur (vidéo ou image Loading, règle du mainteneur du
//   21/11/2026) : en borne, la carte ne paraît que sur l'écran de repli que Cyber Pinball dessine
//   lui-même ; au bureau, dans l'encart à droite du cadre, qui ne le recouvre jamais ;
// - aucun son ajouté ;
// - ni pendant le réglage de l'affichage, ni en invité, ni en jeu local.

import { countryName, formatNumber, locale, t, type AvatarView } from '@cyberpinball/core';
import type { DailyHolder } from '@cyberpinball/core';
import type { TableGoal } from './daily-tables';

export interface LoadingObjectiveView {
  /** « OBJECTIF ». */
  label: string;
  /** « Battre Léa », « Vous êtes 1ᵉʳ », « Ouvrir le classement ». */
  name: string;
  /** Le score à battre ; absent quand il n'y a personne à battre. */
  score?: string;
  avatar?: AvatarView;
  /** Une ou deux lignes dessous : mon record et l'écart, le record du jour. */
  lines: string[];
}

/**
 * La vue de la carte, d'après l'objectif de la table (daily-tables.ts, goalOf) ; undefined : rien à
 * montrer (version en calcul ou illisible, partage coupé).
 */
export function loadingObjective(goal: TableGoal, opts: { face(h: DailyHolder): AvatarView; best?: number; country?: string }): LoadingObjectiveView | undefined {
  if (goal.state !== 'ok') return undefined;
  const label = t('OBJECTIF');
  const o = goal.objective;
  const lines: string[] = [];
  const where = goal.recordScope === 'country' && opts.country ? countryName(opts.country, locale()) : t('Monde');
  if (goal.record && !goal.record.mine) lines.push(t('Record du jour · {where} : {name} · {score}', { where, name: goal.record.name, score: formatNumber(goal.record.score) }));
  if (!o) return { label, name: t('Ouvrir le classement'), lines: [t('Personne n’a encore joué cette version en ligne : ton score sera le premier')] };
  if (o.leader) return { label, name: t('Défendre ta place'), lines: [t('Personne au-dessus de toi sur cette version'), ...lines] };
  const target = o.target!;
  const mine = o.mine ?? opts.best;
  const gapLine = mine ? t('Ton record : {score} · il manque {gap}', { score: formatNumber(mine), gap: formatNumber(Math.max(0, target.score - mine)) }) : t('Pas encore de score pour toi sur cette version');
  return { label, name: t('Battre {name}', { name: target.name }), score: formatNumber(target.score), avatar: opts.face(target), lines: [gapLine, ...lines] };
}
