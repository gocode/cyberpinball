// Ce qu'on injecte dans une page d'un site (navigateur intégré « Récupérer », télécommande du
// téléphone) ne doit jamais la faire tomber, ni bloquer qui l'injecte.
//
// Le 10/11/2026, sur le PinCab, taper au téléphone dans la page de connexion de Google faisait
// tomber le rendu de la page (violation d'accès, 0xC0000005) : webContents.insertText() d'Electron
// plante dès qu'aucun élément n'a le focus dans la page (après Tab, ou quand la page déplace le
// focus entre deux étapes, ce que fait celle de Google). Reproduit hors écran sur des pages locales
// (packages/core/src/test/saisie-robuste.test.ts). La promesse d'insertText ne se résolvait plus jamais
// ensuite : la file des gestes du téléphone restait bloquée, la page blanche au-dessus de tout.
//
// Ici : le texte part caractère par caractère, en événements « char », comme un clavier ; sans
// champ, ils ne font rien. insertText n'est employé nulle part (garde-fou :
// packages/core/src/test/saisie-robuste.test.ts).

import type { WebContents } from 'electron';

/** Du texte, un caractère (point de code) à la fois : accents, symboles et émojis compris. */
export function typeChars(contents: WebContents, text: string): void {
  for (const ch of text) contents.sendInputEvent({ type: 'char', keyCode: ch });
}

/**
 * Attend `work` au plus `ms` : au-delà, rend la main (une page tombée ne répond plus jamais). Une
 * erreur de `work` est rendue telle quelle.
 */
export function settleWithin<T>(work: Promise<T> | T, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    Promise.resolve(work),
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}
