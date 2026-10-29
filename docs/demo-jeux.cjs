// Jeux inventés de la page du projet (README.md, README.fr.md) : titre, fabricant, année,
// teintes (principale, secondaire), point d'intérêt du fronton et grossissement dans le médaillon
// de la roue (zoom : assez pour que le titre du fronton reste hors du disque), parties jouées. Aucun
// n'est un jeu réel. Partagés par les démonstrations qui fournissent ses images à la page :
// docs\demo-captures.cjs (médias et captures du menu), docs\demo-sante.cjs et
// docs\demo-parcours.cjs (option --accueil), pour que la page montre partout les mêmes tables.

'use strict';

const GAMES = [
  { title: 'Neon Abyss', maker: 'Orbital Works', year: 1994, hues: [188, 312], focus: [0.55, 0.62], starts: 42, minutes: 318 },
  { title: 'Star Courier', maker: 'Halcyon', year: 1987, hues: [28, 210], focus: [0.24, 0.45], zoom: 1.5, starts: 17, minutes: 96 },
  { title: 'Midnight Circuit', maker: 'Voltage Games', year: 1998, hues: [276, 128], focus: [0.4, 0.68], zoom: 1.6, starts: 63, minutes: 541 },
  { title: 'Atlas Rising', maker: 'Meridian', year: 1979, hues: [44, 356], focus: [0.5, 0.66], zoom: 1.6, starts: 8, minutes: 37 },
  { title: 'Thunder Reef', maker: 'Gulfstream', year: 1991, hues: [172, 52], focus: [0.5, 0.66], zoom: 1.6, starts: 25, minutes: 140 },
  { title: 'Lunar Diner', maker: 'Halcyon', year: 1964, hues: [330, 160], focus: [0.64, 0.34], zoom: 1.5, starts: 4, minutes: 12 },
  { title: 'Copper Comet', maker: 'Meridian', year: 1983, hues: [18, 196], focus: [0.58, 0.66], zoom: 1.6, starts: 11, minutes: 58 },
];

/** Nom du dossier et des fichiers d'une table : « Neon Abyss (Orbital Works 1994) ». */
const tableName = (game) => `${game.title} (${game.maker} ${game.year})`;

/** Le jeu de ce titre. */
function game(title) {
  const found = GAMES.find((g) => g.title === title);
  if (!found) throw new Error(`Jeu inventé inconnu : ${title}`);
  return found;
}

module.exports = { GAMES, tableName, game };
