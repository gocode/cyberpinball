// Guide du jeu : The Matrix (table d'origine, 2023).
import type { TableGuide } from '../tableguide';

export const guideMatrix: TableGuide = {
  id: 'matrix',
  vps: ['OUvOEgWRhf'],
  title: 'The Matrix',
  sub: 'Original · 2023',
  source: 'D’après le script de la table (aucune feuille de règles n’y est rangée).',
  shots: {
    1: { name: 'Orbite gauche', el: 'Spinner003' },
    2: { name: 'Rampe gauche', at: [140, 755] },
    3: { name: 'Aimant', el: 'Trigger007' },
    4: { name: 'Cabine', el: ['Target004', 'Target005'] },
    5: { name: 'Spinner central', el: 'Spinner002' },
    6: { name: 'Rampe droite', el: 'Ramp122' },
    7: { name: 'Spinner droit', el: 'Spinner001' },
    8: { name: 'Trou des missions', el: 'scoop' },
  },
  pages: [
    {
      title: 'Le but',
      all: true,
      shots: { 1: 'Lettre H', 2: 'Lettre A, jackpot cibles', 3: 'Lettre C, bille en plus', 4: 'Verrous du Multiball', 5: 'Lettre K, bonus ×', 6: 'Lettre E, Déjà vu', 7: 'Lettre D, Special', 8: 'Lance les missions' },
      intro: 'Trois objectifs : finir les *14 missions* au trou [8], lancer le *Trinity Multiball* à la cabine [4], et compléter *H-A-C-K-E-D* pour le multiplicateur.',
      note: ['Le coup à travailler : la cabine [4], au centre gauche, entre ses deux cibles.', 'À suivre : Missions → Trinity Multiball → HACKED → Bonus et astuces.'],
    },
    {
      title: 'Missions',
      shots: { 8: 'Lumière qui clignote', 6: 'Selon la mission', 2: 'Selon la mission' },
      paths: [['l', 8], ['l', 6, 2], ['r', 2, 2]],
      phases: ['Lancer', 'Accomplir'],
      steps: ['Une mission allumée au trou [8] : y entrer pour la lancer.', 'Quatorze missions tirées au hasard : l’écran dit quoi viser (spinners, cibles, rampes, aimant).', 'Toutes les trois missions gagnées : un Multiball de plus ; à la sixième, Morpheus.'],
      final: 'Chaque mission : *3,5 millions*. Les 14 : *Destroy Matrix*, Multiball final (+5 billes).',
      warn: 'Certaines missions sont minutées (60 ou 90 s).',
    },
    {
      title: 'Trinity Multiball',
      shots: { 4: 'Verrou, puis 3 billes', 1: 'Jackpot', 6: 'Jackpot', 7: 'Jackpot' },
      paths: [['r', 4], ['r', 1, 2], ['l', 6, 2], ['l', 7, 2]],
      phases: ['Verrouiller', 'Jackpots'],
      steps: ['Un premier coup dans la cabine [4] allume le verrou.', 'Chaque coup suivant verrouille une bille ; la troisième lance le Multiball.', 'Toutes les flèches donnent un jackpot ; il monte à chaque tir sur la même flèche.'],
      final: 'Jackpot de *1 M*, jusqu’à *5 M* par flèche.',
    },
    {
      title: 'HACKED',
      shots: { 1: 'H', 2: 'A', 3: 'C', 5: 'K', 6: 'E', 7: 'D', 4: 'Super jackpot' },
      paths: [['r', 1], ['r', 2], ['r', 3], ['l', 5], ['l', 6], ['l', 7], ['r', 4, 2]],
      phases: ['Pirater', 'Déjà vu'],
      steps: ['Toucher les six flèches H-A-C-K-E-D [1] [2] [3] [5] [6] [7] : chacune s’éteint.', 'Les six éteintes : multiplicateur de jeu +1, les lettres se rallument.', 'Dans les 30 s, la cabine [4] allume le super jackpot, à prendre à la boucle droite.'],
      final: 'Super jackpot *Déjà vu* : 3,5 M au départ, puis plus à chaque fois.',
    },
    {
      title: 'Bonus et astuces',
      shots: { 3: 'Bille en plus', 5: '40 tours', 7: '100 tours', 8: 'Mystère' },
      tips: [
        ['Clones', 'Une flèche clignote au hasard : la toucher détruit un clone (250 K et plus).'],
        ['Bille supplémentaire', 'Tous les dix clones ; à prendre à l’aimant [3].'],
        ['Spinners', 'Central [5] : 40 tours, bonus × +1. Droit [7] : 100 tours, une bille en plus.'],
        ['Mystère', 'Allumer les quatre couloirs du bas (les flippers les décalent) ; le trou [8] le donne.'],
      ],
      warn: 'Déjà vu tous les six clones : la rampe droite [6] paie plus si on attend, mais à 30 s les flippers se coupent 3 s.',
    },
  ],
  sources: [
    'Script de la table (aucun texte de règles dans la table ; le code reprend une table d’origine plus ancienne, renommée aux couleurs de Matrix) : SelectMode, StartMode, CheckWinMode et WinMode (14 missions au hasard lancées au trou, 3,5 M chacune, Multiball toutes les 3 missions, Morpheus à la 6e, Destroy Matrix à 5 billes après les 14), Trigger011 (cabine : verrou allumé puis billes 1 à 3 verrouillées, Trinity Multiball), StartJasonMultiball et ArrowMultiPlier (jackpots de 1 M à 5 M), CheckWeapons et UpgradeWeapons (six tirs, multiplicateur de jeu, super jackpot à la cabine pendant 30 s puis boucle droite, 3,5 M de départ), TeenKilled (clones, 250 K +50 K, Déjà vu tous les 6, bille supplémentaire tous les 10), Target007 (bille supplémentaire), Spinner002 (40 tours, bonus ×), Spinner001 et Trigger013 (100 tours, add-a-ball), CheckMystery et AwardMystery, TommyHurryUpTimer (flippers coupés 3 s).',
    'Carte d’après le plateau : les six flèches marquées H, A, C, K, E, D correspondent aux six tirs « weapons » du script (W1 à W6) ; inserts « Target jackpot », « Extra ball », « Bonus mult. », « Déjà vu », « Special », « Enter missions », « Lock 1-3 ».',
    'Positions : éléments du .vpx (Spinner003 orbite gauche, Trigger007 aimant, Target004 et Target005 de part et d’autre de la cabine, Spinner002 spinner central, Ramp122 entrée de la rampe droite, Spinner001 spinner droit, scoop trou des missions).',
  ],
  doutes: [
    'Rampe gauche [2] : aucun élément du .vpx ne marque son entrée ; pastille placée à la main (at) sur la pointe de la flèche A. À vérifier sur le plateau.',
    'Ce qui allume une mission au trou : le script le fait sur Trigger017 (« cabin top »), qui semble se trouver sur le retour des rampes au-dessus de la cabine. Non vérifié en jeu, d’où une formulation vague.',
    'Cabine [4] : le verrou est compté par Trigger011, actif seulement quand la bille monte ; l’entrée est supposée entre les deux cibles Target004 et Target005, sous la colonne « Lock ».',
    'Les noms à l’écran gardent par endroits ceux de la table d’origine (le Multiball des 3 missions s’affiche aussi « Trinity Multiball ») ; la boucle droite du super jackpot n’a pas de pastille.',
    'Sentinel (trois coups sur la cible de gauche Target001 : 30 s pour toucher dix fois les cibles sous le Sentinel mobile, 5 M par seconde restante) : lu dans le script, laissé hors du guide faute de place.',
  ],
};
