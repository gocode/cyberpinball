// Date du jour au format AAAA-MM-JJ, à l'heure du poste : celle que voit la personne qui publie.
// Les dix premiers signes de toISOString() donnent la date UTC : publiée juste après minuit en France,
// la 0.2.1 (20/11/2026) passait pour sortie la veille, et publier.mjs signalait à tort la date de
// ses Nouveautés. Tout script qui écrit ou compare « aujourd'hui » passe par ici (date-locale.test.ts).

/** AAAA-MM-JJ de `date` à l'heure locale. */
export function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
