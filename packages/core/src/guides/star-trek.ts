// Guide du jeu : Star Trek, édition Enterprise Limited Edition (Stern 2013).
import type { TableGuide } from '../tableguide';

export const guideStarTrek: TableGuide = {
  id: 'star-trek',
  vps: ['XYh-gw4S'],
  title: 'Star Trek',
  sub: 'Stern · 2013',
  source: 'D’après la feuille de règles du wiki Tilt Forums (code 1.62) et les éléments de la table.',
  shots: {
    1: { name: 'Mission Start', el: 'Kicker3' },
    2: { name: 'Orbite gauche', el: 'sw12' },
    3: { name: 'Rampe Warp', at: [255, 895] },
    4: { name: 'Cibles vertes', el: ['sw39', 'sw40', 'sw41'] },
    5: { name: 'Rampe gauche', el: 'Ramp5' },
    6: { name: 'Vengeance', el: 'sw11' },
    7: { name: 'Rampe droite', el: 'Ramp106' },
    8: { name: 'Away Team', el: 'sw44' },
  },
  pages: [
    {
      title: 'Le but',
      all: true,
      shots: { 1: 'Choisit une mission', 2: 'Spinner', 3: 'Warp : extra ball', 4: 'Allument les verrous', 5: 'Coup de mission', 6: 'Verrou, modes Vengeance', 7: 'Coup de mission', 8: 'Mission, +20 secondes' },
      intro: 'Trois piliers : finir les six *missions*, lancer le *Klingon Multiball* et vaincre le *Vengeance*. Les missions mènent aux wizard modes.',
      note: ['Travailler le trou [1] : il lance les missions et sert de verrou.', 'À suivre : Missions → Klingon Multiball → Vengeance → Bonus et astuces.'],
    },
    {
      title: 'Missions',
      shots: { 1: 'Lance une mission', 8: 'Lance ou prolonge', 5: 'Coups allumés', 7: 'Coups allumés' },
      paths: [['r', 1], ['l', 8], ['r', 5, 2], ['l', 7, 2]],
      phases: ['Lancer', 'Coups allumés'],
      steps: ['Entrer dans le trou [1] ou passer l’Away Team [8] : choisir la mission aux flippers.', 'Toucher les coups allumés avant la fin du temps (le niveau I est minuté).', 'Un coup allumé, puis [8] : 20 secondes de plus et la suite Galactic Away Team.', 'Trois missions du même niveau d’affilée ouvrent le *Captain’s Chair*.'],
      final: 'Les six missions du niveau I jouées : wizard mode *Kobayashi Maru*, à 2 billes.',
    },
    {
      title: 'Klingon Multiball',
      shots: { 4: 'Les trois : verrou allumé', 1: 'Verrou', 6: 'Verrou' },
      paths: [['r', 4], ['r', 1, 2], ['l', 6, 2]],
      phases: ['Allumer', 'Verrouiller'],
      steps: ['Compléter les trois cibles vertes [4] : un verrou s’allume au trou [1] ou au Vengeance [6].', 'Verrouiller une bille à chaque verrou allumé.', 'La troisième bille verrouillée lance le multiball.'],
      final: 'Jackpots de *200 K*, plus chers à chaque fois ; le 7e et le 14e sont des *Super Jackpots*.',
      warn: 'Le lancer juste après le début d’une mission : les deux se jouent ensemble.',
    },
    {
      title: 'Vengeance',
      shots: { 6: 'Le toucher encore et encore' },
      paths: [['l', 6], ['r', 6]],
      phases: ['Viser le centre'],
      steps: ['Toucher le Vengeance [6] plusieurs fois allume son mode ; trois modes à la suite.', 'Premier : Vengeance Multiball ; toucher la bille tenue par l’aimant ajoute une bille.', 'Deuxième : détruire le Vengeance en cinq coups [6] donne une *extra ball*.'],
      final: 'Troisième, Vengeance Battle : *10 % du score* (10 M au moins).',
    },
    {
      title: 'Bonus et astuces',
      shots: { 3: 'Du petit flipper droit', 4: 'Verrous', 6: 'Black Hole à sa droite', 2: 'Super Spinner' },
      tips: [
        ['Rampe Warp', 'Se tire du petit flipper droit [3]. Warp 4 : extra ball ; Warp 9.1 : score double 60 s.'],
        ['Captain’s Chair', 'Trois missions d’affilée : Super Pops, Super Ramps ou Super Spinner [2].'],
        ['Black Hole', 'Cible à droite du Vengeance [6] : une bille ajoutée par multiball, si allumée.'],
        ['Médailles', 'Bronze, argent puis or tous les trois coups d’une mission : à ne pas lâcher.'],
      ],
      warn: 'La rampe Warp [3] est raide et étroite : bien attendre la bille sur le petit flipper.',
    },
  ],
  sources: [
    'Feuille de règles du wiki Tilt Forums (code 1.62, aujourd’hui servie par pinballrulesheets.com) : missions et niveaux, Mission Start au trou de gauche, Away Team sous le petit flipper droit, Captain’s Chair, médailles, Warp 4 / 9.1 / 9.9, Klingon Multiball (verrous au trou gauche et au Vengeance, jackpots 200 K, super jackpots), modes Vengeance, Black Hole, wizard modes.',
    'Pages publiques de présentation du jeu (recherche web) : rampe Warp raide, tirée du petit flipper droit, qui revient vers lui ; cibles vertes à gauche pour les verrous.',
    'Script et éléments de la table : Kicker3 trou de gauche (renvoi au flipper ou vers une rampe), sw12 spinner de l’orbite gauche (flash « left loop / spinner »), sw11 cible tombante du Vengeance avec aimant, sw44 sous le petit flipper droit ; tracé des rampes Ramp5 (gauche, retour couloir gauche), Ramp10 (montée gauche, retour par la droite vers le petit flipper), Ramp106 (droite) ; insert « Initiate Lock » à côté des cibles sw39-41 sur plateau.jpg.',
  ],
  doutes: [
    'Identité des rampes à confirmer : la rampe Warp est supposée être celle qui monte à gauche (Ramp10, entrée placée à la main) et revient par la droite vers le petit flipper.',
    'Orbite gauche marquée sur le spinner sw12 ; orbite droite non numérotée (place exacte de son entrée incertaine).',
    'Cibles vertes : déduites de l’insert « Initiate Lock » voisin et d’une présentation vidéo ; la feuille de règles ne les situe pas.',
    'Jackpots Klingon : valeurs données pour la première partie selon la feuille ; le nombre de verrous allumés par les cibles change ensuite.',
    'Position de la cible Black Hole « à droite du Vengeance » : sans doute sw48, à vérifier ; d’où l’absence de pastille.',
    'Valeur du skill shot et comportement du kickback gauche : non décrits par la feuille.',
  ],
};
