// Guide du jeu : 2001: A Space Odyssey (table d'origine, 2025).
import type { TableGuide } from '../tableguide';

export const guide2001: TableGuide = {
  id: '2001',
  vps: ['0IDqTPkR_4'],
  title: '2001: A Space Odyssey',
  sub: 'Original · 2025',
  source: 'D’après les règles rangées dans la table par son auteur et le script de la table.',
  shots: {
    1: { name: 'HAL', el: ['Target016', 'Kicker023'] },
    2: { name: 'Rampe droite', el: 'StartRamphit' },
    3: { name: 'Pyramide', el: 'Trigger012' },
    4: { name: 'Cibles de droite', el: ['Target004', 'Target013', 'Target014'] },
    5: { name: 'Salle de gauche', el: 'Kicker035' },
    6: { name: 'Chambre multiball', el: ['Kicker039', 'Kicker040', 'Kicker041', 'Kicker042'] },
    7: { name: 'Monolithe', el: 'Kicker046' },
    8: { name: 'Tête du vaisseau', el: 'SpinnerTrigger1' },
  },
  pages: [
    {
      title: 'Le but',
      all: true,
      shots: { 1: 'Quatre billes pour le battre', 2: 'Multiball à 2 billes', 3: '10 K, 25 K puis 75 K', 4: 'Allument la pyramide', 5: 'Effet tiré au hasard', 6: 'Multiball à 5 billes', 7: 'Le boss final', 8: '5 000 quand elle tourne' },
      intro: 'Deux grands objectifs : battre *HAL* deux fois pour affronter le *Monolithe*, et lancer les *Multiballs*.',
      note: ['Le coup à travailler : HAL [1], au centre, derrière sa cible.', 'À suivre : HAL et Monolithe → Multiballs → Bonus et astuces.'],
    },
    {
      title: 'HAL et Monolithe',
      shots: { 1: 'Cible, puis le trou', 7: 'Quatre coups' },
      paths: [['r', 1], ['l', 7, 2]],
      phases: ['Battre HAL', 'Monolithe'],
      steps: ['Abattre la cible devant HAL [1], puis y loger la bille : HAL la garde, une autre arrive.', 'Quatre billes chez HAL : il est battu, les kickbacks s’allument.', 'Second tour : à la 3e bille, la tête du vaisseau [8] se met à tourner.', 'À la 4e, le Monolithe [7] se lève : le toucher quatre fois.'],
      final: 'Le Monolithe paie *5 K, 10 K, 20 K puis 100 K*.',
      warn: 'Battu pendant un Multiball, le Monolithe rend encore plus de billes.',
    },
    {
      title: 'Multiballs',
      shots: { 6: 'Quatre billes', 2: 'Deux passages' },
      paths: [['r', 6], ['l', 2]],
      phases: ['Verrouiller'],
      steps: ['Chaque bille entrée dans la chambre de gauche [6] y est verrouillée ; une autre est lancée.', 'La quatrième bille lance le *Multiball* à 5 billes (plus s’il y en a déjà en jeu).', 'Rampe droite [2] : un passage lève la rampe, le suivant lance un Multiball à 2 billes.'],
      final: 'Le Multiball est le bon moment pour finir HAL et le *Monolithe*.',
    },
    {
      title: 'Bonus et astuces',
      shots: { 3: 'Quand elle est allumée', 4: 'De 500 à 1 500', 5: 'Toujours des points', 8: '5 000 par coup' },
      tips: [
        ['Pyramide', 'Certaines cibles tombantes l’allument [3] : 10 K, 25 K puis 75 K.'],
        ['Cibles de droite', 'Leur valeur monte à chaque banque [4] ; la banque complète : 5 000.'],
        ['100 bumpers', '32 000 points ; le cercle 10 à 100 montre où on en est.'],
        ['Bille supplémentaire', 'Accordée une fois, à 400 000 points.'],
      ],
      warn: 'Kickbacks : une seule sauvegarde par victoire sur HAL, puis ils s’éteignent.',
    },
  ],
  sources: [
    'Règles rangées dans la table par son auteur (champ rules) : HAL en quatre coups et kickbacks, HAL battu deux fois puis Monolithe, 100 bumpers pour 32 000, salle mystère, bille supplémentaire à 400 000, chambre multiball à quatre billes, rampe droite à 2 billes, Multiball spécial, pyramide 10 K/25 K/75 K, tête du vaisseau à 5 000 après 7 coups.',
    'Script de la table : kicker023_Hit et consolidated (HAL : +15 000 au premier tour, kickbacks Kicker009/Kicker010, tête du vaisseau StartSpinner au 7e coup, Monolithe au 8e), kicker046_timer (5 000, 10 000, 20 000, 100 000), kicker039 à kicker042 (BALL 1/2/3 LOCKED puis MULTIBALL), kicker054_hit (Multiball à 2 billes), trigger007/trigger008 (rampe levée), trigger012_hit (pyramide), target004_hit et CheckDropTargets (500/750/1 000/1 500, banque 5 000), Kicker035_hit (quatre effets au hasard), AddScore (bille supplémentaire à 400 000), timer008 (billes ajoutées après le Monolithe en Multiball).',
    'Positions : éléments du .vpx (Target016 et Kicker023 devant HAL, StartRamphit à l’entrée de la rampe droite, Trigger012 pyramide, Kicker046 Monolithe, SpinnerTrigger1 tête du vaisseau, Kicker039-042 chambre multiball, Kicker035 salle de gauche).',
  ],
  doutes: [
    'Chemin vers la chambre multiball [6] : le script montre une rampe qui y descend depuis le cercle en haut à gauche (Ramp035), mais l’accès depuis les flippers reste à voir en jeu ; la pastille marque la chambre elle-même.',
    'Rampe droite [2] : lecture du script (le passage par la rampe normale franchit trigger007, qui lève la rampe ; le suivant tombe dans Kicker054). À confirmer en jeu.',
    'Pyramide : l’auteur ne dit pas exprès quelles cibles l’allument ; le script nomme Target013 (banque de droite), Target001 (banque du haut) et Target040 (banque du haut à gauche). Laissé vague dans le guide : à trancher à la relecture.',
    'Les règles parlent d’une salle mystère marquée d’un point d’interrogation et d’une petite salle à effet au hasard ; le script n’a qu’un trou de ce genre (Kicker035, « special room ») : supposé être le même.',
    'Bille supplémentaire : le script ne teste que le score du joueur 1 (p1score) ; en partie à plusieurs, à vérifier.',
    'Le premier tour de HAL n’annonce pas de récompense de Multiball : les billes gardées sont détruites et une seule est relancée.',
  ],
};
