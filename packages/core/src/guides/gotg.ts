// Guide du jeu : Guardians of the Galaxy (table d'origine pour VPX, version 2.1.1).
import type { TableGuide } from '../tableguide';

export const guideGotg: TableGuide = {
  id: 'gotg',
  vps: ['q86TI2sS'],
  title: 'Guardians of the Galaxy',
  sub: 'Original · 2020',
  source: 'D’après le script de la table, recoupé avec la feuille de règles du wiki Tilt Forums.',
  shots: {
    1: { name: 'Boucle gauche', el: 'SpinnerRonan' },
    2: { name: 'Rocket', el: 'RocketKicker' },
    3: { name: 'Rampe gauche', at: [285, 610] },
    4: { name: 'Groot', el: 'tGroot_m' },
    5: { name: 'Orbe', el: 'OrbTarget1' },
    6: { name: 'Rampe droite', at: [690, 950] },
    7: { name: 'Boucle droite', el: 'SpinnerDrax' },
    8: { name: 'Scoop', el: 'LeftScoop' },
  },
  pages: [
    {
      title: 'Le but',
      all: true,
      shots: { 1: 'Sanctuary, spinner', 2: 'Escape Kyln, RAMPAGE', 3: 'Pod Chase', 4: 'Groot Multiball', 5: 'Orb Multiball', 6: 'Sibling Rivalry', 7: 'Knowhere, spinner', 8: 'Missions, extra ball' },
      intro: 'Jouer les huit *missions* du centre du plateau et les deux Multiballs, *Orb* et *Groot* : ils ouvrent les wizard modes.',
      note: ['Coup clé : le scoop [8], qui lance les missions et donne l’extra ball.', 'À suivre : Missions → Orb Multiball → Groot Multiball → Bonus et astuces.'],
    },
    {
      title: 'Missions',
      shots: { 8: 'Choisir la mission', 1: 'Sanctuary', 2: 'Escape Kyln', 3: 'Pod Chase', 5: 'Antiquities Shop', 6: 'Sibling Rivalry', 7: 'Knowhere' },
      paths: [['l', 8], ['r', 3, 2], ['l', 6, 2], ['l', 7, 2]],
      phases: ['Choisir', 'Jouer'],
      steps: ['Au lancement, choisir la mission avec les flippers ; sinon, la prendre au scoop [8].', 'Viser les coups éclairés : chaque mission en demande un nombre, souvent chronométré.', 'Mission finie : une seconde partie plus payante s’ouvre pour le reste de la bille.'],
      final: 'Trois missions à moitié : *extra ball* au scoop [8]. Quatre finies : *Cherry Bomb*.',
    },
    {
      title: 'Orb Multiball',
      shots: { 5: 'Cible, puis l’orbe', 3: 'Jackpot', 6: 'Jackpot', 7: 'Jackpot' },
      paths: [['l', 5], ['r', 3, 2], ['l', 6, 2], ['l', 5, 2]],
      phases: ['Préparer', 'Jackpots'],
      steps: ['Abattre la cible devant l’orbe [5], puis toucher la cible cachée derrière.', 'Trois fois : Multiball. Retoucher l’orbe [5] pendant le décompte : une bille de plus.', 'Jackpots sur les coups éclairés ; l’orbe [5] double le suivant quelques secondes.'],
      final: 'Huit jackpots : *double jackpot*, puis *super jackpot* en décompte, à l’orbe [5].',
      warn: 'À partir du troisième Orb Multiball, la cible [5] demande deux coups.',
    },
    {
      title: 'Groot Multiball',
      shots: { 4: 'Ouvrir, puis verrouiller', 3: 'Jackpots', 6: 'Jackpots', 1: 'Jackpots', 7: 'Jackpots' },
      paths: [['l', 4], ['r', 3, 2], ['l', 6, 2], ['r', 4, 2]],
      phases: ['Verrouiller', 'Jackpots'],
      steps: ['Toucher la bouche de Groot [4] pour l’ouvrir, puis tirer dedans.', 'Trois billes verrouillées : Multiball (quatre les fois suivantes).', 'Jackpots aux coups éclairés, trois par coup ; ×5 si leur mission est finie.'],
      final: 'Groot [4] paie le *super jackpot* au 6e et au 12e jackpot, puis le *double super* final.',
      warn: 'Reverrouiller pendant le Multiball : score ×2, puis ×3, 20 secondes.',
    },
    {
      title: 'Bonus et astuces',
      shots: { 2: 'RAMPAGE : score ×2', 7: 'Super skill shot', 8: 'Wizard modes' },
      tips: [
        ['Hadron Enforcer', 'Ses cinq cibles donnent 3 charges au bouton d’action ; chacune valide un coup.'],
        ['RAMPAGE', 'Les tirs dans Rocket [2] écrivent le mot : le score passe à ×2.'],
        ['Super skill shot', 'Flipper gauche tenu, lancer à fond, puis viser le coup qui clignote, ex. [7].'],
        ['Wizard modes', 'Toutes les missions à moitié et les deux Multiballs : le scoop [8] ouvre le premier.'],
      ],
      warn: 'Le bouton d’action est le MagnaSave droit (bouton du milieu sur une borne).',
    },
  ],
  sources: [
    'Script de la table (table d’origine, sans ROM) : modes Pod Chase, Sanctuary, Yaka Arrow, Quill’s Quest, Knowhere, Escape Kyln, Sibling Rivalry, Antiquities Shop (StartPlayerMode), choix de mission au scoop (LeftScoop_Hit), extra ball à 3 missions à moitié et 6 finies, Cherry Bomb à 4 finies, Immolation puis Save Xandar (CheckWizardModesReady), Orb Multiball (OrbTarget1 puis OrbTarget2, trois fois ; jackpots, double et super, deux coups à partir du 3e), Groot Multiball (GrootMouth_Hit, GrootKicker_Hit, jackpots 300 K + 25 K, ×5, super au 6e et 12e, final au 18e), Hadron Enforcer (CheckCount), RAMPAGE (CheckRocket), super skill shot (sw11, tGamora_m, OrbTarget1).',
    'Feuille de règles du wiki Tilt Forums de la table Stern (hébergée sur pinballrulesheets.com), que le texte de règles de la table renvoie à chercher : coup principal de chaque mission, déroulé des Multiballs, wizard modes.',
    'Positions : éléments du .vpx (SpinnerRonan, RocketKicker, tGroot_m, OrbTarget1, SpinnerDrax, LeftScoop) ; entrées des rampes lues sur reperes.png (volets dorés).',
  ],
  doutes: [
    'Entrées des deux rampes placées à la main (at) d’après les volets visibles sur le plateau : aucun élément ne les marque.',
    'Le script diffère de la feuille de règles Stern sur Groot Multiball (super jackpot au 6e et 12e jackpot ici, au 9e et 18e chez Stern) : le guide suit le script.',
    'Extra ball : le script demande trois missions à au moins 50 %, la feuille de règles parle de trois missions lancées.',
    'Le tunnel de Yondu (Yaka Arrow) et les cibles Hadron Enforcer n’ont pas de pastille : la limite est de 8 coups.',
    'Le nom du bouton d’action sur la borne (MagnaSave droit) vient de la note de la table ; à vérifier avec le réglage Cyber Pinball.',
    'Année : première version de la table en 2020 (version 2.1.1 de 2022).',
  ],
};
