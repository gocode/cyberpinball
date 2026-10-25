// Ce qu'il faut pour jouer une table, et rien de plus : son fichier .vpx et, si son
// script en demande une, sa ROM (présente, liée, ou fournie par un alias vers une
// révision voisine). C'est la seule règle qui décide si « Jouer » attend quelque chose ;
// le médecin (doctor.ts), le parcours (journey.ts), « Ce qu'il faut » du catalogue et
// l'installation rapide (acquisition.ts), la fiche et l'échec d'une partie s'y tiennent.
//
// Tout le reste est proposé, jamais exigé : contenu du DMD (dossier FlexDMD / UltraDMD),
// fronton .directb2s, PuP-Pack, médias, couleurs du DMD, sons alternatifs, musique,
// rangement de la table, réglages d'affichage. Sans contenu propre, l'emplacement du DMD
// garde un DMD par défaut : celui de la ROM, dessiné par VPX (plugins PinMAME et
// ScoreView), et dans le menu l'afficheur à points de Cyber Pinball (fallback.js).

import type { NeedKind } from './acquisition';
import type { Finding } from './doctor';

/** Ce qu'une table doit avoir pour se jouer. */
export const PLAY_REQUIREMENTS = ['table', 'rom'] as const satisfies readonly NeedKind[];

/**
 * Constats du médecin qui empêchent la table de démarrer : la ROM que demande le script
 * n'est pas là où PinMAME la lit (absente, pas liée, mal rangée, éparpillée, illisible,
 * ancien nom sans alias, révision voisine sans alias). Ils sont les seuls de gravité
 * « error » ; une ROM trouvée par le dossier commun de PinMAME ou par un alias n'en est pas un.
 */
export const PLAY_BLOCKING_FINDINGS = ['romMissing', 'romNotLinked', 'romMisplaced', 'romScattered', 'romNested', 'romAlias', 'romAliasHistoric'] as const satisfies readonly Finding['code'][];

/** Ce fichier compte pour jouer (« indispensable » dans « Ce qu'il faut »). */
export function requiredForPlay(kind: NeedKind): boolean {
  return (PLAY_REQUIREMENTS as readonly NeedKind[]).includes(kind);
}

/** Ce constat empêche la table de démarrer. */
export function blocksPlay(finding: Pick<Finding, 'code' | 'severity'>): boolean {
  return finding.severity === 'error' && (PLAY_BLOCKING_FINDINGS as readonly string[]).includes(finding.code);
}

/** Les constats qui empêchent de jouer ; vide : « Jouer » ne demande rien de plus. */
export function playBlockers<F extends Pick<Finding, 'code' | 'severity'>>(findings: readonly F[]): F[] {
  return findings.filter(blocksPlay);
}

/**
 * Gravité d'un constat d'après la règle : « error » (bloquant) seulement pour la ROM ;
 * un autre constat marqué « error » redescend à « warning ». Garde-fou pour toute règle
 * du médecin à venir.
 */
export function playSeverity<F extends Pick<Finding, 'code' | 'severity'>>(finding: F): F {
  return finding.severity === 'error' && !blocksPlay(finding) ? { ...finding, severity: 'warning' } : finding;
}
