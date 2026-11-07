// Guide du jeu : City Hunter (table d'origine, 2025).
import type { TableGuide } from '../tableguide';

export const guideCityHunter: TableGuide = {
  id: 'city-hunter',
  vps: ['_B0oL91xUo'],
  title: 'City Hunter',
  sub: 'Original · 2025',
  source: 'D’après le script de la table (aucune feuille de règles n’y est rangée).',
  shots: {
    1: { name: 'Rampe Kimi', el: 'Ramp027' },
    2: { name: 'Trou central', el: 'Kicker003' },
    3: { name: 'Trou gauche', el: 'Kicker002' },
    4: { name: 'Milieu, à gauche', el: 'Ramp010' },
    5: { name: 'Milieu, à droite', el: 'Ramp011' },
    6: { name: 'Bille captive', el: 'CapKicker1' },
    7: { name: 'Rampe gauche', el: 'Ramp022' },
    8: { name: 'Cibles de droite', el: ['Target001', 'Target002', 'Target003'] },
  },
  pages: [
    {
      title: 'Le but',
      all: true,
      shots: { 1: 'Allume le verrou', 2: 'Verrouille les billes', 3: 'Mystère, balles', 4: 'Une balle au barillet', 5: 'Une balle au barillet', 6: 'Tire sur les drones', 7: 'Millions Umibozu', 8: 'Allument le mystère' },
      intro: 'Trois objectifs : le *Multiball* de Kimi, l’*attaque des drones* avec les balles de Nicky, et les millions de la *rampe gauche*.',
      note: ['Le coup à travailler : la rampe Kimi [1], puis le trou central [2] juste à côté.', 'À suivre : Multiball → Drones → Rampe gauche → Bonus et astuces.'],
    },
    {
      title: 'Multiball',
      shots: { 1: 'Lève le marteau', 2: 'Cinq fois' },
      paths: [['l', 1], ['l', 2, 2], ['r', 2, 2]],
      phases: ['Ouvrir', 'Verrouiller'],
      steps: ['La rampe Kimi [1] lève le marteau et allume le verrou du trou central [2].', 'Trou central [2] : une bille verrouillée ; le coup suivant rallume le verrou.', 'Deux billes verrouillées, le verrou rallumé : un dernier coup au trou [2].'],
      final: '*Multiball à 3 billes* : 15 000 au départ, 35 000 à la fin.',
    },
    {
      title: 'Attaque des drones',
      shots: { 3: 'Une balle, puis le départ', 4: 'Une balle', 5: 'Une balle', 6: 'Tire une balle' },
      paths: [['r', 3], ['r', 4], ['l', 5], ['r', 6, 2]],
      phases: ['Six balles', 'Tirer'],
      steps: ['Chaque trou gauche [3] et chaque rampe du milieu [4] [5] ajoute une balle au barillet.', 'Six balles : le départ s’allume ; le trou gauche [3] lance l’attaque des drones.', 'Chaque coup sur la bille captive [6] tire une balle sur le drone allumé.'],
      final: 'Les drones valent *155 K, 205 K puis 505 K*.',
      warn: 'Plus de balles : l’attaque s’arrête. Ne pas les gaspiller.',
    },
    {
      title: 'Rampe gauche',
      shots: { 7: 'Umibozu et Saeko', 8: 'Lancent le combo Saeko' },
      paths: [['r', 8], ['r', 7, 2]],
      phases: ['Allumer', 'Encaisser'],
      steps: ['La cible verte, en haut à droite, touchée trois fois : le bonus *Umibozu* s’allume.', 'Rampe gauche [7] : elle l’encaisse (1, 2, 5 puis 10 millions, un palier par bonus).', 'Les trois cibles [8] lancent le combo Saeko : six rampes [7] pour un Multiball.'],
      final: 'Jusqu’à *10 millions* par bonus Umibozu.',
      warn: 'Le combo Saeko est minuté : enchaîner les rampes.',
    },
    {
      title: 'Bonus et astuces',
      shots: { 3: 'Mystère quand il clignote', 8: 'Une touche chacune', 1: 'Six passages' },
      tips: [
        ['Mystère', 'Les trois cibles [8] l’allument ; le trou gauche [3] le donne.'],
        ['Skill shot', 'Au lancement, passer par la lettre R-Y-O verte : 35 000 et bonus ×.'],
        ['Bille supplémentaire', 'Six passages par la rampe Kimi [1] ; le décompte s’affiche.'],
        ['Multiplicateur', 'Allumer les quatre couloirs M-I-K-I du bas : jeu ×2, ×3, ×4.'],
      ],
      warn: 'La cible à gauche du trou central, touchée deux fois, allume les kickbacks.',
    },
  ],
  sources: [
    'Script de la table (aucun texte de règles dans la table) : Trigger007 « Ramp KIMI » (verrou, décompte de bille supplémentaire), kicker003_Hit et Mode_Multiball_Start (verrous, Multiball à 3 billes, 15 000 et 35 000), kicker002_hit et CheckMystery (balles, mystère, départ des drones), Trigger003 « RampMilieu R et L » (une balle par passage), CheckBallNik (six balles), StartGun (drones 155 000, 205 000, 505 000), Target005 et StartMIGreen, Trigger008 « RampMamouth » et AwardMIGreen (1, 2, 5, 10 millions), Target001-003 et CheckLightMystery (mystère et combo Saeko), CheckSaekoCombo (15 K, 30 K, Multiball à la 6e rampe), WinSkillShot (35 000 et bonus ×), CheckLightLane (couloirs M-I-K-I, multiplicateur), Target004 (kickbacks).',
    'Positions : éléments du .vpx (Ramp027 entrée de la rampe Kimi, Kicker003 trou central, Kicker002 trou gauche, Ramp010 et Ramp011 entrées de la rampe du milieu, CapKicker1 bille captive, Ramp022 entrée de la rampe gauche, Target001-003 cibles de droite).',
  ],
  doutes: [
    'Rampe Kimi : entrée placée sur Ramp027, d’après le tracé des rampes Ramp023/Ramp024 qui montent jusqu’à Trigger007. À confirmer en jeu.',
    'Verrou : le trou central semble fermé par le marteau de Kaori entre les verrous (Wall051, ActiveKimiMass) ; la suite exacte des coups (verrou, rallumage, verrou, rallumage, Multiball) est lue dans le script, pas vue en jeu.',
    'Bille supplémentaire : le décompte ne sert que si le verrou est allumé au moment du passage (MBLockActive) ; à vérifier.',
    'Rampe CATS (Trigger009, Cat’s Eye : cibles du chat qui surgissent, 60 K à 500 K et billes en plus) : le trigger est sur le fil de retour à gauche ; il semble que la rampe gauche [7] y passe, mais l’entrée n’est pas sûre. Laissé hors du guide.',
    'Cibles verte et jaune (Target005, Target006, en haut à droite) : elles ne comptent qu’après un choc sur la Mini Cooper, que les flippers déplacent au lancement. Mécanisme lu dans le script, à voir en jeu. La jaune lance le mode Mini Cooper (60 s, cinq lieux, 6 millions) : non décrit dans le guide.',
    'Bille captive [6] : on suppose qu’elle frappe la cible TargetDrone001 placée derrière elle (StartGun) ; à confirmer en jeu.',
    'Durées des modes minutés (combo Saeko, Cat’s Eye) : réglées dans l’éditeur, absentes du script.',
  ],
};
