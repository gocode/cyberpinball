// Écrans d'ajout et de choix : partout où l'on ajoute ou choisit quelque chose (une table,
// une partie d'un jeu, un média, une ROM), une issue vers le web, « Chercher sur le web… » :
// le navigateur intégré sur une recherche libre préremplie, pour ne jamais rester enfermé
// dans ce que les sources branchées ont trouvé. Chaque écran de cette liste porte son
// action (Action.web dans app/src/library.ts) ; addscreens.test.ts vérifie qu'aucun n'en
// manque et que chacun en a une seule.

export const ADD_SCREENS = {
  'add.funnel': true, // Ajouter une table (entonnoir)
  catalog: true, // Trouver une table (catalogue de la base VPS)
  'catalog.game': true, // Fiche d’un jeu de la base VPS : ses versions
  'catalog.needs': true, // Ce qu’il faut pour une version
  'catalog.files': true, // « … : au choix » (fichiers de VPS pour un besoin)
  waitlist: true, // Récupérés et attendus
  'waitlist.item': true, // Un élément de la liste d’attente
  'waitlist.replace': true, // Remplacer un élément, choisir un fichier déjà téléchargé
  parts: true, // Parties du jeu
  'parts.part': true, // Une partie du jeu (propositions de toutes les sources)
  'parts.candidates': true, // Une partie : depuis Téléchargements
  'parts.files': true, // « … : au choix » (fichiers de VPS pour une partie, galerie des fichiers)
  downloads: true, // Téléchargements
  'downloads.games': true, // Ajouter à un jeu (depuis Téléchargements)
  journey: true, // Ce qu’il manque pour jouer
  'journey.files': true, // « … : au choix » du parcours (galerie des fichiers)
  medias: true, // Médias du jeu
  'medias.type': true, // L’écran d’un média
  'medias.proposals': true, // Propositions d’un média
  mediadb: true, // Médias de VPinMediaDB
  roms: true, // Bibliothèque de ROM
} as const satisfies Record<string, true>;

export type AddScreenId = keyof typeof ADD_SCREENS;
