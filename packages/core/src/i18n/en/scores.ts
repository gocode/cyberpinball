// Catalogue anglais : tableau des scores d'une table (app/src/scoreboard-menu.ts, app/src/library.ts).
// Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // app/src/scoreboard-menu.ts
  'Tout temps': 'All time',
  'Cette année': 'This year',
  'Cette semaine': 'This week',
  'Record de la table': 'Table high score',
  'Aujourd’hui, {time}': 'Today, {time}',
  'Joueur {n}': 'Player {n}',
  'La mémoire de cette ROM n’est pas encore décrite : seuls les scores déjà connus s’affichent.': 'This ROM’s memory is not described yet: only the scores already known are shown.',
  'Cette table ne dit que les scores entrés à son tableau d’honneur : seuls ceux-là sont datés.': 'This table only tells the scores that made its high score list: only those are dated.',
  'Cette table ne garde aucun tableau d’honneur lisible : ses scores ne peuvent pas être relevés.': 'This table keeps no readable high score list: its scores cannot be recorded.',
  'records de la table': 'table high scores',
  '{n} partie': '{n} game',
  '{n} parties': '{n} games',
  'Aucun score pour l’instant': 'No score yet',
  'Chaque partie jouée sur cette borne s’inscrit ici, avec sa date.': 'Every game played on this cabinet is listed here, with its date.',
  'Aucun score {period}': 'No score {period}',
  'Les parties jouées {period} s’inscrivent ici.': 'Games played {period} are listed here.',
  'Tout temps, cette année, cette semaine, aujourd’hui': 'All time, this year, this week, today',
  'Record : {score} ({initials})': 'High score: {score} ({initials})',
  'Record : {score}': 'High score: {score}',
  '{n} partie aujourd’hui': '{n} game today',
  '{n} parties aujourd’hui': '{n} games today',
  // app/src/library.ts
  'Tableau des scores': 'Scoreboard',
  'Onglet {period}': '{period} tab',
  'Flippers : période précédente ou suivante · Start ou Exit : retour à la fiche · souris': 'Flippers: previous or next period · Start or Exit: back to game page · mouse',
};
