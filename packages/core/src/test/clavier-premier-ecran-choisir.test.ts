// Premier écran d'une borne neuve : flippers et flèches choisissent sans changer d'écran (voir
// clavier-reel-outils.ts). Les cas sont répartis sur plusieurs fichiers pour que node --test les
// lance en parallèle.
import { firstScreenTests } from './clavier-reel-outils';

firstScreenTests([
  [['Clavier:ArrowRight'], 'buttonsChoice', 'une flèche choisit sans changer d’écran'],
  [['ShiftLeft', 'ShiftRight'], 'buttonsChoice', 'les flippers choisissent sans changer d’écran'],
  [['Clavier:ArrowRight', 'Clavier:ArrowLeft', 'Clavier:Enter'], 'buttonsSummary', 'flèches puis Entrée'],
]);
