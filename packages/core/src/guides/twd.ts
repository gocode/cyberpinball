// Guide du jeu : The Walking Dead, Limited Edition (Stern 2014).
import type { TableGuide } from '../tableguide';

export const guideTwd: TableGuide = {
  id: 'twd',
  vps: ['wasB0RRz'],
  title: 'The Walking Dead',
  sub: 'Stern · 2014',
  source: 'D’après la feuille de règles du wiki Tilt Forums (code 1.60) et les éléments de la table.',
  shots: {
    1: { name: 'Orbite gauche', el: 'Left_Spinner' },
    2: { name: 'Rampe gauche', at: [222, 885] },
    3: { name: 'Prison', el: 'door_hit' },
    4: { name: 'Well Walker', el: 'WZ' },
    5: { name: 'Rampe droite', at: [700, 1190] },
    6: { name: 'Cibles tombantes', el: ['sw9', 'sw10', 'sw11'] },
  },
  pages: [
    {
      title: 'Le but',
      all: true,
      shots: { 1: 'Mode Barn', 2: 'Mode CDC, Bicycle Girl', 3: 'Prison Multiball', 4: 'Well Walker Multiball', 5: 'Mode Arena, arbalète', 6: 'Allument les modes' },
      intro: 'Deux multiballs à lancer, *Prison* et *Well Walker*, et cinq modes à jouer, allumés par les cibles tombantes.',
      note: ['Travailler les rampes [2] [5] : elles font monter les deux multiballs.', 'À suivre : Prison → Well Walker → Les modes → Bonus et astuces.'],
    },
    {
      title: 'Prison Multiball',
      shots: { 3: 'Portes, puis la tête', 2: 'Phase 2 : 500 K', 5: 'Phase 2 : 500 K' },
      paths: [['l', 3], ['r', 2, 2], ['l', 5, 2]],
      phases: ['Ouvrir la prison', 'Phase 2'],
      steps: ['Frapper les portes de la prison [3] pour épeler PRISON ; les premières lettres sont offertes.', 'PRISON complet : l’aimant tient la bille et la tête du zombie se montre : la frapper [3].', 'Multiball à 3 billes : portes ou grand coup découvrent la tête ; chaque tête est un jackpot.'],
      final: 'Six jackpots : *Super Jackpot*, puis chaque rampe [2] [5] vaut *500 K* et plus.',
      warn: 'Prison et Well Walker ne se jouent pas en même temps.',
    },
    {
      title: 'Well Walker',
      shots: { 4: 'Une dizaine de coups', 2: 'Phase 2', 5: 'Phase 2' },
      paths: [['l', 4], ['r', 4], ['r', 2, 2], ['l', 5, 2]],
      phases: ['Le walker', 'Phase 2'],
      steps: ['Toucher le Well Walker [4] : une dizaine de coups épellent WELL et lancent le multiball.', 'En multiball, chaque coup au walker [4] est un jackpot ; les lettres se rallument peu à peu.'],
      final: 'Toutes les lettres : *Super Jackpot*, puis une phase 2 aux rampes [2] [5].',
    },
    {
      title: 'Les modes',
      shots: { 6: 'Le banc : un mode allumé', 1: 'Barn', 2: 'CDC', 5: 'Arena' },
      paths: [['r', 6], ['r', 1, 2], ['r', 2, 2], ['l', 5, 2]],
      phases: ['Allumer', 'Lancer le mode'],
      steps: ['Abattre les trois cibles [6] : un mode s’allume ; ensuite, deux bancs par mode.', 'Le lancer à son coup : Barn [1], CDC [2], Arena [5] ; Riot et Tunnel ont le leur.', 'Les cinq modes joués : le wizard mode se lance à l’un de leurs coups.'],
      final: '*Escape Terminus* : cinq hurry-ups, chacun plus cher que le précédent.',
    },
    {
      title: 'Bonus et astuces',
      shots: { 2: 'Bicycle Girl', 5: 'Arbalète', 6: 'Soins, armes, vivres' },
      tips: [
        ['Skill shot', 'Au lancement, viser le couloir du haut allumé : 250 K, puis plus à chaque fois.'],
        ['Bicycle Girl', 'Cinq zombies tués l’allument à la rampe gauche [2] ; trois passages la finissent.'],
        ['Blood Bath', 'Cibles [6] : soins, armes, vivres, puis un banc de plus : multiball à 2 billes.'],
        ['Arbalète', 'Les armes allument l’arbalète à la rampe droite [5] : cinq coups allumés à 1 M.'],
      ],
      warn: 'Wizard mode Horde (à Woodbury) : si un zombie arrive jusqu’à vous, les flippers se coupent.',
    },
  ],
  sources: [
    'Feuille de règles du wiki Tilt Forums (code 1.60, aujourd’hui servie par pinballrulesheets.com) : Dead Features (Barn à l’orbite gauche, CDC à la rampe gauche, Arena à la rampe droite) allumés par le banc de cibles tombantes, Escape Terminus (lancé à un coup de Dead Feature), Prison Multiball, Well Walker Multiball, Blood Bath, ravitaillements, Bicycle Girl, arbalète (Premium/LE), skill shot, Horde à Woodbury (flippers coupés si un zombie arrive).',
    'Script de la table : sw41 orbite gauche, sw39 orbite droite, sw3 zombie de la prison, sw4 et door_hit portes, sw44 et sw45 cibles de la prison, sw49 Bicycle Girl sous BotRamp1 (rampe qui se soulève), sw9-11 banc de cibles tombantes, sw48 cible tombante seule, WWMag aimant du Well Walker, Cannon_Load chargement de l’arbalète.',
    'Positions : éléments du .vpx (tracé BotRamp1 → Ramp002 → sortie à droite pour la rampe gauche ; Ramp005 → Ramp011 → Ramp010 → sortie sw42 à gauche pour la rampe droite).',
  ],
  doutes: [
    'Pas d’image du plateau : entrées des deux rampes placées à la main (at) d’après le tracé des rampes ; à vérifier sur la table.',
    'Orbite gauche marquée sur le spinner gauche (Left_Spinner), supposé dans l’orbite ; le spinner droit et la cible sw48 sont sans doute le coup Woodbury, non numéroté.',
    'Coups Riot et Tunnel non situés : la feuille ne décrit pas le plateau et le script ne les nomme pas.',
    'Well Walker : la feuille ne dit pas clairement comment s’épelle WELL ; « une dizaine de coups » vient d’elle, à vérifier en jeu.',
    'Valeurs prises pour le code 1.60 ; la ROM de la table est twd_160h.',
  ],
};
