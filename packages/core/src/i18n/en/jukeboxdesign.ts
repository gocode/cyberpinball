// Catalogue anglais : le design du Juke-box (visualiseur du DMD en couleurs et son réglage, affiches,
// animation d'entrée). Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // packages/core/src/jukebox-visualizer.ts
  Pochette: 'Cover',
  Multicolore: 'Multicolour',
  Classique: 'Classic',
  // app/renderer/jukebox.js (affiche)
  'La musique habite ici': 'Music lives here',
  'Ouvrir le Juke-box': 'Open the Juke-box',
  'Vos playlists prennent la scène.': 'Your playlists take the stage.',
  // app/src/menu-settings.ts
  'Visualiseur du Juke-box : {mode}': 'Juke-box visualiser: {mode}',
  'Le DMD prend les couleurs de la pochette du morceau, en dégradé ; multicolore sans pochette (Start : changer)': "The DMD takes on the colours of the track's cover, as a gradient; multicolour when there is no cover (Start: change)",
  'Le DMD change doucement de couleur, d’une colonne à l’autre et dans le temps (Start : changer)': 'The DMD slowly shifts colour, from one column to the next and over time (Start: change)',
  'Le DMD garde sa couleur réglée, sans dégradé (Start : changer)': 'The DMD keeps its set colour, with no gradient (Start: change)',
};
