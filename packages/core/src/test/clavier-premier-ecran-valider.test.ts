// Premier écran d'une borne neuve : Start ou Entrée valident (voir clavier-reel-outils.ts).
// Les cas sont répartis sur plusieurs fichiers pour que node --test les lance en parallèle.
import { firstScreenTests } from './clavier-reel-outils';

firstScreenTests([
  [['Clavier:Enter'], 'buttonsSummary', 'Entrée garde les touches'],
  [['Clavier:Digit1'], 'buttonsSummary', 'Start garde les touches'],
]);
