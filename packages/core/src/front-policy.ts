// Premier plan de la fenêtre « Récupérer » (app/src/acquire-window.ts, keepInFront) : elle reste
// au-dessus des fenêtres plein écran du menu, mais jamais au-dessus d'une fenêtre de Windows qui a
// pris le premier plan (dialogue de sécurité, Windows Hello, gestionnaire des tâches, boîte d'une
// autre application). Le 10/11/2026, sur le PinCab, une telle fenêtre restait cachée sous
// « Récupérer », toujours au-dessus au niveau de l'économiseur d'écran : elle attendait une
// réponse que personne ne pouvait donner, et l'écran semblait figé.

import { t } from './i18n';

/** Ce que fait la fenêtre : rien, repasser devant, céder le « toujours au-dessus », le reprendre. */
export type FrontMove = 'keep' | 'raise' | 'yield' | 'reclaim';

/**
 * - elle perd le focus au profit d'une autre fenêtre de Cyber Pinball (le fronton plein écran
 *   cliqué) : elle repasse devant ;
 * - elle le perd au profit de Windows (aucune fenêtre de Cyber Pinball n'a le focus) : elle cède
 *   son « toujours au-dessus », la fenêtre de Windows passe devant ;
 * - elle reprend le focus après avoir cédé : elle reprend son rang ;
 * - son « toujours au-dessus » tombe sans qu'elle l'ait cédé : elle le reprend.
 */
export function frontMove(event: 'blur' | 'focus' | 'top-lost', focusedOurs: boolean, yielded: boolean): FrontMove {
  if (event === 'blur') return focusedOurs ? 'raise' : 'yield';
  if (event === 'focus') return yielded ? 'reclaim' : 'keep';
  return yielded ? 'keep' : 'raise';
}

/**
 * Une demande d'autorisation de Windows (UAC) restée sans réponse : Cyber Pinball cesse de l'attendre
 * au bout de ce délai (la demande, sur le bureau sécurisé de Windows, n'est fermée que par une vraie
 * réponse au clavier ou à la souris). Toute élévation de l'application l'applique.
 */
export const ELEVATION_WAIT_MS = 3 * 60_000;

/** Ce que l'écran dit quand la demande de Windows est restée sans réponse. */
export function elevationNoAnswer(): string {
  return t('Pas de réponse à la demande de Windows en {min} minutes : Cyber Pinball n’attend plus. Si elle est encore affichée, répondez Non (Échap).', { min: ELEVATION_WAIT_MS / 60_000 });
}
