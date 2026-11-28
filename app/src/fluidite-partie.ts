// Fluidité de la partie : VPX passe en priorité « au-dessus de la normale » le temps de la partie.
//
// Mesure du 28/11/2026 (PinCab, i9-9900K 8 cœurs / 16 fils, playfield 4K à 120 Hz, Back to the Future
// et son PuP-Pack, préréglage Qualité, bille lancée et flippers actionnés) : sur une machine au repos,
// la cadence tient 120 i/s ; dès que d'autres programmes prennent du processeur (ici 12 fils occupés
// en fond, à priorité normale, comme des mises à jour, un navigateur ou un autre front-end resté
// ouvert), la boucle de rendu de VPX perd des tranches de temps, dépasse 8,3 ms par image et la cadence
// tombe par paliers à 90 i/s : 72 à 76 % des secondes sous 0,9 × la fréquence de l'écran. VPX en
// priorité « au-dessus de la normale » : 0 %, 119,8 i/s de moyenne, autant qu'en priorité haute, sans
// prendre le pas sur les pilotes et les services de Windows comme le ferait la priorité haute. Un fil
// logique par cœur physique (affinité) faisait moins bien (49 %) : écarté.
//
// Rien n'est changé dans Windows ni dans les réglages de VPX : seulement la priorité du processus de
// VPX, qui disparaît avec lui. CYBERPINBALL_PRIORITE_PARTIE=normale désactive le réglage
// (comparaisons, dépannage).

import * as os from 'node:os';

/** La priorité donnée à VPX pendant une partie (os.constants.priority). */
export const GAME_PRIORITY = os.constants.priority.PRIORITY_ABOVE_NORMAL;

/** Le réglage est-il désactivé par l'environnement ? */
export function priorityDisabled(env: NodeJS.ProcessEnv): boolean {
  return (env.CYBERPINBALL_PRIORITE_PARTIE ?? '').trim().toLowerCase() === 'normale';
}

/**
 * Passe le processus de VPX `pid` en priorité « au-dessus de la normale », juste après son lancement :
 * ses fils (rendu, physique, lecteur PuP) en héritent. Une ligne au journal dit ce qui a été fait. Ne
 * lève jamais d'erreur : une partie ne doit pas échouer pour un réglage de fluidité.
 */
export function tuneGameProcess(
  pid: number | undefined,
  log: (line: string) => void,
  env: NodeJS.ProcessEnv = process.env,
  setPriority: (pid: number, priority: number) => void = os.setPriority,
): void {
  if (!pid || priorityDisabled(env)) return;
  try {
    setPriority(pid, GAME_PRIORITY);
    log('Fluidité de la partie : VPX en priorité au-dessus de la normale.'); // i18n-ignore : journal
  } catch (e) {
    log(`Fluidité de la partie : priorité de VPX refusée (${(e as Error).message}).`); // i18n-ignore : journal
  }
}
