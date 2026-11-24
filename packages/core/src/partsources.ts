// Sources qui n'ont rien pour une partie (24/11/2026) : la recherche d'une partie (POV compris) interroge toutes
// les sources (VPS, Téléchargements, VPForums, VPUniverse, le web) ; une source qui a répondu « rien » le dit, au
// lieu de laisser croire qu'elle n'a pas été interrogée. Le point de vue vient surtout de la base VPS (766 jeux sur
// 2 685 ont un POV, relevé du 24/11/2026) et de la catégorie « VPX POV » de VPUniverse (PART_SITE_NODES) ;
// VPForums se cherche sans catégorie : un POV n'y est reconnu que si son titre ou sa catégorie le dit (hitPart).

import { partSources, type GamePart } from './gameparts';
import type { MediaSiteId } from './mediasites';

/** Ce que les sources ont répondu pour la partie ouverte. */
export interface PartAnswers {
  /** Le jeu de la base VPS est connu (sinon, pas de jugement sur la base). */
  game: boolean;
  /** Fichiers de cette partie que la base VPS connaît pour le jeu (liens vivants). */
  vpsFiles: number;
  /** Propositions de chaque site pour cette partie ; absent : le site n'a pas encore répondu (ou demande une connexion). */
  sites: Partial<Record<MediaSiteId, number>>;
}

/** Les sources qui ont répondu sans rien pour cette partie, dans l'ordre de l'écran (la base VPS, puis les sites). */
export function emptySources(part: GamePart, answers: PartAnswers): ('vps' | MediaSiteId)[] {
  const wanted = partSources(part);
  const out: ('vps' | MediaSiteId)[] = [];
  if (wanted.includes('vps') && answers.game && answers.vpsFiles === 0) out.push('vps');
  for (const site of ['vpforums', 'vpuniverse'] as const) {
    if (wanted.includes(site) && answers.sites[site] === 0) out.push(site);
  }
  return out;
}
