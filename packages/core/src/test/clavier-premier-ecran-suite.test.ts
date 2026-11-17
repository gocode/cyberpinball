// Premier écran d'une borne neuve : ce qui suit le choix (voir clavier-reel-outils.ts). Les cas
// sont répartis sur plusieurs fichiers pour que node --test les lance en parallèle.
import { firstScreenTests } from './clavier-reel-outils';

firstScreenTests([
  // Jeu validé sur les touches des encodeurs : le balancier de tilt (T) en fait partie, l'étape « Tilt » suit.
  [['Clavier:Enter', 'Clavier:Digit1'], 'tilt', 'jeu validé sur les encodeurs, l’étape « Tilt » suit'],
  [['ShiftRight', 'Clavier:Digit1'], 'navigation', 'modifier ouvre le relevé de l’interface'],
  [['Clavier:Escape', 'Clavier:Backspace'], 'buttonsChoice', 'Retour arrière au premier bouton revient au premier écran'],
]);
