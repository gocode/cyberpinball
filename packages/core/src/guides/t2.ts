// Guide du jeu : Terminator 2: Judgment Day (Williams 1991).
import type { TableGuide } from '../tableguide';

export const guideT2: TableGuide = {
  id: 't2',
  vps: ['BunvWvh9'],
  title: 'Terminator 2',
  sub: 'Williams · 1991',
  source: 'D’après deux feuilles de règles en ligne (archive Funet, Pinball Primer) et le script de la table.',
  shots: {
    1: { name: 'Orbite gauche', el: 'sw53' },
    2: { name: 'Trou Database', el: 'sw51' },
    3: { name: 'Cibles blanches', el: ['sw71', 'sw72', 'sw73', 'sw74', 'sw75'] },
    4: { name: 'Rampe gauche', el: 'sw61' },
    5: { name: 'Skull', el: 'sw77' },
    6: { name: 'Cibles rouges', el: ['sw36', 'sw37', 'sw38'] },
    7: { name: 'Rampe droite', at: [655, 790] },
    8: { name: 'Chase Loop', el: 'sw65' },
  },
  pages: [
    {
      title: 'Le but',
      all: true,
      shots: { 1: 'Encaisse l’Escape Route', 2: 'Prix mystère, verrou', 3: 'Cible du canon', 4: 'Cercles de sécurité', 5: 'Charge le canon', 6: 'Avance l’Escape Route', 7: 'Cercles de sécurité', 8: 'Valeur croissante' },
      intro: 'Deux grands objectifs : le *Multiball* et ses jackpots au canon, et *Payback Time*, gagné aux rampes.',
      note: ['Travailler le Skull [5] : il charge le canon et verrouille les billes.', 'À suivre : Multiball → Payback Time → Bonus et astuces.'],
    },
    {
      title: 'Multiball',
      shots: { 5: 'Cible abattue, puis le trou', 3: 'Tirer au canon', 1: 'Verrou en multiball', 2: 'Verrou en multiball' },
      paths: [['l', 5], ['r', 1, 2], ['r', 2, 2]],
      phases: ['Charger le canon', 'Verrouiller'],
      steps: ['Abattre la cible du Skull [5], puis entrer dans le trou derrière : la bille passe au canon.', 'Le canon pivote : tirer avec la gâchette (touche du lanceur) sur la cible blanche allumée [3].', 'En multiball, verrouiller des billes au Skull [5], ou à [1] et [2] ; le Skull recharge le canon.'],
      final: 'Jackpot *simple, double ou triple* selon les billes verrouillées. Après un double ou un triple : *Super Jackpot de 50 M* au canon.',
    },
    {
      title: 'Payback Time',
      shots: { 4: 'Allume un cercle', 7: 'Allume un cercle', 1: '5 M pendant le mode', 8: '5 M pendant le mode', 5: '5 M pendant le mode' },
      paths: [['r', 4], ['l', 7], ['r', 1, 2], ['l', 8, 2]],
      phases: ['Allumer', 'Payback Time'],
      steps: ['Chaque rampe [4] [7] allume un cercle de sécurité : cinq de chaque côté.', 'Alterner les rampes [4] [7] : après la première, c’est l’autre qui avance.', 'Les dix cercles allumés lancent Payback Time, pour 20 secondes.'],
      final: 'Chaque grand coup, rampes, orbites, Skull ou couloirs du haut, vaut *5 M*.',
      warn: 'Le mode s’arrête si la bille draine : jouer prudemment pendant les 20 secondes.',
    },
    {
      title: 'Bonus et astuces',
      shots: { 3: 'Skill shot au lancement', 6: 'Avance l’Escape Route', 1: 'Encaisse le prix', 8: 'Hurry-Up, enchaînements' },
      paths: [['l', 6], ['r', 1, 2]],
      phases: ['Avancer', 'Encaisser'],
      tips: [
        ['Skill shot', 'Une cible blanche [3] est allumée : la toucher au lancement, 1 M, puis 1 M de plus.'],
        ['Escape Route', 'Les cibles rouges [6] avancent l’échelle ; l’orbite [1] encaisse : extra ball au 5e prix.'],
        ['Chase Loop', 'Enchaîner [8] : la valeur monte de 250 K jusqu’à 5 M.'],
        ['Hurry-Up', 'Couloir de retour gauche allumé : viser [8] vite, de 15 M à la baisse.'],
      ],
    },
  ],
  sources: [
    'Feuille de règles de l’archive Funet (rédigée par un joueur d’après ses parties, avec réserves de l’auteur) : skill shot, canon, jackpots 1×/2×/3×, Super Jackpot 50 M, Chase Loop 250 K → 5 M, Hurry-Up 15 M, Payback Time 20 s et 5 M, cercles de sécurité, Escape Route, Database.',
    'Résumé Pinball Primer : cible du Skull et trou derrière qui chargent le canon, verrous au Skull, à l’orbite gauche et au couloir Database, Payback Time cinq cercles par rampe, arrêt au drain, Escape Route encaissée à l’orbite gauche, Hurry-Up lancé par le couloir de retour gauche.',
    'Script de la table : sw76 trou du Skull et sw77 sa cible tombante, sw55 trou du haut, sw51 trou gauche, sw31 canon, gâchette = touche du lanceur ou de la barre (interrupteur 34), sw61 et sw63 portes d’entrée de rampes, sw62 et sw64 rampes réussies.',
    'Positions : éléments du .vpx (tracé des rampes Ramp209 depuis sw61 et Ramp8 jusqu’à sw64), plateau.jpg (couloir « Escape Route » à gauche, « Chase Loop » à droite).',
  ],
  doutes: [
    'Les deux feuilles divergent sur les valeurs : jackpot de 5 M de base (Pinball Primer) ou jusqu’à 10, 20 et 30 M (Funet) ; le Super Jackpot est aussi noté une fois « 50 000 » par la feuille Funet.',
    'Escape Route : la feuille Funet l’encaisse au trou du haut (sw55), Pinball Primer à l’orbite gauche ; l’orbite gauche mène sans doute à ce trou du haut, à vérifier en jeu.',
    'Skill shot : cible exacte et manière (lancer ou tir au bon moment) à confirmer en jeu.',
    'Entrée de la rampe droite placée à la main (at) d’après le tracé de la rampe ; Chase Loop marqué sur son déclencheur du haut (sw65), loin de l’entrée.',
    'L’élément « Plunger1 » du .vpx est en bas à gauche, loin du vrai couloir de lancement (sw78, à droite) : aucun tir depuis le lanceur n’est dessiné.',
    'Nombre de cibles blanches à toucher pour lancer le multiball : une la première fois, davantage ensuite selon Pinball Primer.',
  ],
};
