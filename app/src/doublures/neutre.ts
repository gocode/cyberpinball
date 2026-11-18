// Doublures des services et des hôtes de l'application, pour les tests et les démonstrations.
//
// Pourquoi : une doublure écrite à la main (un objet littéral qui imite un service) se
// désynchronise dès qu'une branche ajoute un membre obligatoire à l'interface ; une autre branche,
// partie avant, en écrit une nouvelle copie sur l'ancienne interface, et la casse n'apparaît qu'à
// la fusion (le mode invité, 13 démonstrations ; `news` du service des retours, 18/11/2026).
//
// La règle : chaque contrat imité à plusieurs endroits a sa fabrique ici, `fakeX(surcharges)`,
// typée sur la vraie interface. Elle part de valeurs neutres (rien ne sort, rien ne s'écrit, listes
// vides) et y pose les surcharges de l'appelant. Ajouter un membre obligatoire à l'interface fait
// échouer la compilation de sa fabrique, dans la branche même qui l'ajoute : on y donne sa valeur
// neutre, et toutes les doublures le reçoivent. Un test (doublures.test.ts) refuse un objet écrit
// à la main qui imite un contrat qui a sa fabrique.
//
// Ces modules ne sont importés par aucun module de l'application : le regroupement par esbuild
// (depuis main.js) les laisse hors de ce qui est livré.

/** Ne rien faire (membre neutre). */
export const noop = (): void => undefined;

/**
 * Un membre sans valeur neutre sûre (créer un téléchargement, une partie, donner un dossier où
 * écrire) : l'appeler sans l'avoir donné échoue tout de suite, en le nommant.
 */
export function unsimulated(name: string): () => never {
  return () => {
    throw new Error(`${name} : membre non simulé, à donner à la doublure`); // i18n-ignore : erreur d'essai
  };
}

/** Les membres neutres de `neutral`, remplacés par ceux que donne l'appelant. */
export function overlay<T extends object>(neutral: T, over: Partial<T> | undefined): T {
  return { ...neutral, ...over };
}
