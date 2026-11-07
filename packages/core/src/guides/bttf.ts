// Guide du jeu : Back to the Future (Data East 1990).
import type { TableGuide } from '../tableguide';

export const guideBttf: TableGuide = {
  id: 'bttf',
  vps: ['43ma3WQK'],
  title: 'Back to the Future',
  sub: 'Data East · 1990',
  source: 'D’après la feuille de règles et la carte d’instructions rangées dans la table.',
  shots: {
    1: { name: 'Rampe gauche', el: 'ramptrigger001' },
    2: { name: 'Verrou', el: 'sw29' },
    3: { name: 'Cibles D-M-C', el: ['SW41', 'SW42', 'SW43'] },
    4: { name: 'Spinner', el: 'sw28' },
    5: { name: 'Clock Tower', el: 'sw45' },
    6: { name: 'Rampe droite', el: 'ramptrigger01' },
    7: { name: 'Cibles D-O-C', el: ['SW25', 'SW26', 'SW27'] },
    8: { name: 'Cibles McFLY', el: ['SW33', 'SW34', 'SW35', 'SW36', 'SW37'] },
  },
  pages: [
    {
      title: 'Le but',
      all: true,
      shots: { 1: 'Lettres, jackpots, skill shot', 2: 'Verrouille les billes', 3: 'Allument verrou et jackpots', 4: 'Change le prix de la tour', 5: 'Encaisse le prix allumé', 6: 'Lettres, jackpots', 7: 'Multiplicateur de bonus', 8: 'Valeur du spinner' },
      intro: 'Pour faire le gros score, viser deux objectifs : le *Multiball* et les *Millions DeLorean*. Ils peuvent se jouer en même temps.',
      note: ['Travailler les rampes [1] [6] : elles servent aux deux objectifs.', 'À suivre : Multiball → Millions DeLorean → Bonus et astuces.'],
    },
    {
      title: 'Multiball',
      shots: { 3: 'Les 3 cibles : verrou allumé', 2: 'Jusqu’à 3 billes', 1: 'Jackpot', 6: 'Jackpot' },
      paths: [['r', 3], ['r', 2], ['l', 6, 2], ['r', 1, 2]],
      phases: ['Préparer', 'Jackpots'],
      steps: ['Abattre les trois cibles [3] : le verrou s’allume.', 'Entrer dans le verrou [2]. Répéter jusqu’à verrouiller trois billes.', 'La troisième bille lance le Multiball. Les cibles [3] allument les jackpots.'],
      final: 'Chaque rampe [1] [6] paie *500 K, 750 K puis 1 M*. Les six jackpots : *1 M de plus*.',
    },
    {
      title: 'Millions DeLorean',
      shots: { 1: 'Une lettre par rampe', 6: 'Une lettre par rampe' },
      paths: [['r', 1], ['l', 6]],
      phases: ['Viser les rampes'],
      steps: ['Chaque rampe [1] [6] allume une lettre de D-E-L-O-R-E-A-N, derrière les bumpers.', 'La huitième lettre lance un compte à rebours de 12 secondes.'],
      final: 'Chaque rampe vaut alors *1 million*, autant de fois que possible.',
      warn: 'Le temps ne s’arrête jamais : éviter les bumpers et les trous. Possible pendant le Multiball.',
    },
    {
      title: 'Bonus et astuces',
      shots: { 6: 'Skill shot : lancer à fond', 1: 'Puis tout de suite ici', 5: '7 prix, puis 500 K', 4: 'Fait tourner les prix', 7: 'Jusqu’à ×6', 8: 'Spinner plus cher', 2: 'Bille supplémentaire' },
      paths: [['plunger', 6], ['r', 1, 2]],
      phases: ['Lancer', 'Puis la rampe'],
      tips: [
        ['Skill shot', 'Lancer à fond par la droite, puis viser aussitôt la rampe [1].'],
        ['Bille supplémentaire', 'Allumée par la tour ou les rampes ; à prendre au verrou [2].'],
        ['Clock Tower', 'Le spinner [4] choisit le prix ; la tour [5] l’encaisse.'],
        ['Multiplicateur', 'Viser d’abord la cible D-O-C qui clignote [7].'],
      ],
      warn: 'Après McFLY [8], l’éclairage s’éteint deux secondes : la bille se voit mal.',
    },
  ],
  sources: [
    'Feuille de règles rangée dans la table (champ TableRules, rédigée en 1993, de mémoire par son auteur) : multiball, jackpots, millions, skill shot, Clock Tower, D-O-C, McFLY.',
    'Carte d’instructions rangée dans la table : skill shot, multiball, Twin Jackpots, bille supplémentaire, Clock Tower, DeLorean, McFLY, multiplicateur.',
    'Positions : éléments du .vpx (sw29 verrou, sw28 spinner, sw45 Clock Tower, SW41-43 D-M-C, SW25-27 D-O-C, SW33-37 McFLY, déclencheurs d’entrée des rampes).',
  ],
  doutes: [
    'La feuille de règles marque elle-même plusieurs valeurs d’un point d’interrogation (valeur du spinner, ordre D-M-C au second multiball).',
    'Entrées des rampes placées sur leurs déclencheurs (ramptrigger001, ramptrigger01) : à confirmer sur la table.',
  ],
};
