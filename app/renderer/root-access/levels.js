// Root Access, prototype : les trois étages du biome Racines, puis trois du Tronc.
// Un étage n'est que des données : formes, mécanismes, et règles « quand… alors… ».
// Repère : 600 × 1000, y vers le bas ; la bille fait 22 de diamètre.
(function (racine) {
  'use strict';

  const W = 600;
  const PI = Math.PI;

  const mx = (x) => W - x;
  const mirror = (s) => [mx(s[0]), s[1], mx(s[2]), s[3]];

  // Base commune : côtés, couloirs d'arrivée vers les flips, lance-pierres, flips de base, berceau.
  function base(o) {
    const leftTop = o.leftTop != null ? o.leftTop : 170;
    const rightTop = o.rightTop != null ? o.rightTop : 170;
    // Le couloir arrive en tangente sur l'axe du flip : sans creux où la bille resterait coincée
    // (ligne tangente au cercle de rayon r1 + 13 - 13 autour de l'axe, pente 35,7°).
    const guide = [20, 754, 201.4, 884.1];
    const slingFace = [112, 690, 160, 815];
    return {
      walls: [
        [20, leftTop, 20, 754],
        [W - 20, rightTop, W - 20, 754],
        guide, mirror(guide),
        [112, 690, 112, 780], [112, 780, 160, 815],
        mirror([112, 690, 112, 780]), mirror([112, 780, 160, 815]),
      ],
      slings: [
        { seg: slingFace },
        { seg: mirror(slingFace) },
      ],
      flippers: [
        { side: 'left', x: 195, y: 893, len: 84, r1: 13, r2: 7, rest: 0.52, up: -0.45 },
        { side: 'right', x: W - 195, y: 893, len: 84, r1: 13, r2: 7, rest: PI - 0.52, up: PI + 0.45 },
      ],
      // Lanceur à droite, comme sur un vrai flipper : couloir entre le mur x 580 et le lance-pierre x 488.
      cradle: { x: W - 55, y: 735 },
    };
  }

  // Haut d'étage avec la sortie au centre. L'aspiration (si = porte ou pont qui ouvre le passage) tire
  // vers l'entrée la bille qui monte dans le tiers central : sa force est le réglage de difficulté.
  function centerTop(si, force, amorti) {
    return {
      walls: [[20, 170, 250, 55], [350, 55, 580, 170], [250, 55, 250, -40], [350, 55, 350, -40]],
      exit: { x1: 250, x2: 350, y1: -40, y2: 45 },
      aspirations: [{ si, zone: { x1: 110, x2: 490, y1: -40, y2: 460 }, vers: [300, -40], force, amorti }],
    };
  }

  function merge(...parts) {
    const out = { walls: [], slings: [], flippers: [], targets: [], bumpers: [], gates: [], bridges: [], seesaws: [], rules: [] };
    for (const p of parts) {
      for (const k of Object.keys(p)) {
        if (Array.isArray(out[k])) out[k] = out[k].concat(p[k]);
        else out[k] = p[k];
      }
    }
    return out;
  }

  // Réglages mesurés (scratchpad acces.js, bille tenue sur un flip puis refrappée) : sans aspiration,
  // la fenêtre pour entrer au centre est de 15 à 40 ms ; ici ≈ 115 ms à l'étage 1, ≈ 65 ms à l'étage 2.
  // Nouveauté par étage (une seule à la fois) et sauve-bille dégressif : 3 s, 3 s à l'arrivée, 2 s,
  // 1,5 s, puis rien. Le Tronc ne combine que des mécanismes déjà appris, avec une aspiration plus faible.
  const etage1 = merge(base({}), centerTop('porte', 900, 6), {
    biome: 'RACINES',
    nom: 'La porte',
    intro: 'LYSE : FAIS TOMBER LES TROIS CIBLES, LA PORTE S\'OUVRIRA. DEUX COUP SUR COUP : BONUS DE CHAÎNE.',
    // Deux cibles différentes en moins de 2 s : bonus, payé une fois par chaîne.
    chaine: { delai: 2, points: 300 },
    sauveBille: 3,
    targets: [
      { id: 'c1', kind: 'drop', seg: [205, 330, 255, 330] },
      { id: 'c2', kind: 'drop', seg: [275, 330, 325, 330] },
      { id: 'c3', kind: 'drop', seg: [345, 330, 395, 330] },
    ],
    bumpers: [{ x: 150, y: 500, r: 26 }, { x: 450, y: 500, r: 26 }],
    // Serrure vivante : un logement par cible (dessin seulement), la dernière écarte les mâchoires.
    gates: [{ id: 'porte', seg: [250, 57, 350, 57], serrure: { cibles: ['c1', 'c2', 'c3'], logements: [[228, 40], [300, 10], [372, 40]] } }],
    objectif: { ferme: 'TOUCHE LES CIBLES', ouvert: 'VISE LA SORTIE' },
    rules: [
      { quand: { cibles: ['c1', 'c2', 'c3'] }, alors: [{ ouvrir: 'porte' }, { points: 500 }, { message: 'PORTE OUVERTE : MONTE !' }] },
    ],
  });

  // Règles du pont-levis, communes à l'étage 2 et au Tronc 5 : la première frappe baisse le pont 12 s ;
  // une refrappe pendant qu'il est baissé lui garantit au moins 4 s (sans revenir à 12).
  const reglesPont = [
    { quand: { touche: 'interrupteur', siFerme: 'pont' }, alors: [{ abaisser: 'pont', duree: 12 }, { message: 'PONT ABAISSÉ : 12 SECONDES' }] },
    { quand: { touche: 'interrupteur', siOuvert: 'pont' }, alors: [{ tenir: 'pont', duree: 4 }, { message: 'PONT TENU : 4 S AU MOINS' }] },
  ];

  // Bords du pont (étages 2 et 5). Dessous, la pente guide les tirs vers le pont. Dessus, un dos en pente
  // vers le pont : une bille montée à côté redescend vers le vide (ou le pont baissé), au lieu de rouler
  // dans le coin du mur où elle restait coincée. Petit flip : un déflecteur ferme le creux entre le mur
  // et son axe.
  const bordsPont = [
    [20, 300, 160, 235], [20, 205, 160, 235],
    [580, 300, 440, 235], [580, 205, 440, 235],
    [20, 572, 34, 589],
  ];

  const etage2 = merge(base({}), centerTop('pont', 800, 4), {
    biome: 'RACINES',
    nom: 'Le pont-levis',
    intro: 'LYSE : UN VIDE BARRE LA SORTIE. FRAPPE L\'INTERRUPTEUR À DROITE POUR BAISSER LE PONT.',
    // Sauve-bille au premier départ seulement : une chute dans le vide renvoie au lanceur sans protection.
    sauveBille: { duree: 3, arrivee: true },
    walls: bordsPont,
    // Interrupteur sur le mur droit, petit flip sur le mur gauche (hors du couloir du lanceur, à droite).
    targets: [{ id: 'interrupteur', kind: 'switch', seg: [W - 26, 370, W - 26, 520] }],
    bumpers: [{ x: 175, y: 560, r: 22 }, { x: 425, y: 560, r: 22 }],
    flippers: [{ side: 'left', x: 34, y: 600, len: 58, r1: 10, r2: 6, rest: 0.55, up: -0.35 }],
    bridges: [{ id: 'pont', rect: { x1: 160, x2: 440, y1: 165, y2: 232 } }],
    labels: [{ x: W - 78, y: 360, text: 'INTERRUPTEUR' }],
    objectif: { ferme: 'FRAPPE L\'INTERRUPTEUR À DROITE', ouvert: 'VISE LA SORTIE' },
    rules: reglesPont,
  });

  // Catapulte de la bascule : mesurée (scratchpad catapulte2.cjs), -75° à 600 ramène la bille tenue sur
  // le flip droit dans 15 cas sur 15 ; le tir croisé vers le couloir part de là.
  const CATAPULTE = { angle: -75, vitesse: 600 };

  const etage3 = merge(base({ leftTop: -40, rightTop: 150 }), {
    biome: 'RACINES',
    nom: 'La bascule',
    intro: 'LYSE : FAIS BASCULER LA BASCULE : FRAPPE SON BOUT BAS PAR DESSOUS, OU RETOMBE SUR LE BOUT LEVÉ POUR ÊTRE RENVOYÉ SUR LE FLIP DROIT.',
    sauveBille: 2,
    // Couloir gauche (x 20 à 150) jusqu'à la sortie ; toit en pente qui renvoie les tirs du centre
    // sur le bout levé de la bascule.
    walls: [[150, -40, 150, 430], [150, 140, 300, 40], [300, 40, 580, 150]],
    exit: { x1: 20, x2: 150, y1: -40, y2: 80 },
    bumpers: [{ x: 250, y: 560, r: 24 }],
    gates: [{ id: 'porte', seg: [20, 100, 150, 100] }],
    // Le tir croisé du flip droit entre déjà dans le couloir (≈ 110 ms de fenêtre) : l'aspiration ne fait
    // que l'y emporter vite, sans qu'il retombe.
    aspirations: [
      { si: 'porte', zone: { x1: 20, x2: 150, y1: -40, y2: 440 }, vers: [85, -40], force: 1500, amorti: 6 },
    ],
    // Câble (dessin seulement) : bout bas de la bascule → deux poulies au-dessus du toit → contrepoids
    // qui lève la porte du couloir.
    // Décalée à gauche : le tir du lanceur (x ≈ 484 à hauteur de la bascule) monte jusqu'au toit sans
    // toucher le dessous du bout levé.
    // parDessous : frapper le bout bas par en dessous la fait aussi basculer (sans catapulte). Mesuré
    // (scratchpad objectif.cjs) : la bascule n'était touchée que par 5 et 1 coups sur 101 (bille tenue à
    // gauche, à droite) et 30 sur 288 en jeu réel ; avec, 15, 17 et 92 (étage 2 : 18, 2 et 77).
    seesaws: [{ id: 'bascule', x: 365, y: 300, half: 95, a0: -0.3, a1: 0.3, hold: 8, link: 'porte', parDessous: true,
      cable: { poulies: [[275, 24], [172, 24]], contrepoids: [172, 52] }, catapulte: CATAPULTE }],
    labels: [{ x: 85, y: 460, text: 'COULOIR' }],
    objectif: { ferme: 'FAIS BASCULER LA BASCULE', ouvert: 'VISE LE COULOIR GAUCHE' },
    rules: [
      { quand: { bascule: 'bascule' }, alors: [{ ouvrir: 'porte', duree: 8 }, { message: 'PORTE LEVÉE : VISE LE COULOIR GAUCHE !' }] },
    ],
  });

  // ── Tronc ──────────────────────────────────────────────────────────────────────────────────────
  // Aspirations du Tronc mesurées (acces.js, bille tenue puis refrappée, sur 101 délais) : Tronc 4 à 700,
  // 15 à 17 réussites contre 23 à l'étage 1 ; Tronc 5 à 650, 11 contre 13 à l'étage 2.
  // Tronc 4 : l'aimant à charge. Une charge pour tout le Tronc : tenir la bille 1 s sur un flip.
  const etage4 = merge(base({}), centerTop('porte', 700, 5), {
    biome: 'TRONC',
    nom: 'Le nœud',
    intro: 'LYSE : DANS LE TRONC, UN AIMANT RETIENT LA BILLE SUR UN FLIP (CTRL). UNE SEULE CHARGE.',
    aimant: 1,
    sauveBille: 1.5,
    targets: [
      { id: 'n1', kind: 'drop', seg: [150, 300, 200, 300] },
      { id: 'n2', kind: 'drop', seg: [400, 300, 450, 300] },
    ],
    bumpers: [{ x: 130, y: 520, r: 22 }, { x: 460, y: 540, r: 22 }],
    gates: [{ id: 'porte', seg: [250, 57, 350, 57], serrure: { cibles: ['n1', 'n2'], logements: [[228, 40], [372, 40]] } }],
    objectif: { ferme: 'TOUCHE LES DEUX CIBLES', ouvert: 'VISE LA SORTIE' },
    rules: [
      { quand: { cibles: ['n1', 'n2'] }, alors: [{ ouvrir: 'porte' }, { points: 600 }, { message: 'PORTE OUVERTE : MONTE !' }] },
    ],
  });

  // Tronc 5 : serrure + pont. La sortie demande la porte (trois cibles) ET le pont baissé.
  const etage5 = merge(base({}), centerTop(['porte', 'pont'], 650, 4), {
    biome: 'TRONC',
    nom: 'La serrure du pont',
    intro: 'LYSE : TROIS CIBLES POUR LA PORTE, PUIS L\'INTERRUPTEUR POUR LE PONT. PLUS DE SAUVE-BILLE.',
    sauveBille: 0,
    walls: bordsPont,
    targets: [
      { id: 'c1', kind: 'drop', seg: [205, 360, 255, 360] },
      { id: 'c2', kind: 'drop', seg: [275, 360, 325, 360] },
      { id: 'c3', kind: 'drop', seg: [345, 360, 395, 360] },
      { id: 'interrupteur', kind: 'switch', seg: [W - 26, 400, W - 26, 540] },
    ],
    bumpers: [{ x: 175, y: 580, r: 22 }, { x: 425, y: 580, r: 22 }],
    flippers: [{ side: 'left', x: 34, y: 600, len: 58, r1: 10, r2: 6, rest: 0.55, up: -0.35 }],
    gates: [{ id: 'porte', seg: [250, 57, 350, 57], serrure: { cibles: ['c1', 'c2', 'c3'], logements: [[228, 40], [300, 10], [372, 40]] } }],
    bridges: [{ id: 'pont', rect: { x1: 160, x2: 440, y1: 165, y2: 232 } }],
    labels: [{ x: W - 78, y: 390, text: 'INTERRUPTEUR' }],
    objectif: {
      conditions: [{ id: 'porte', texte: 'TOUCHE LES CIBLES' }, { id: 'pont', texte: 'FRAPPE L\'INTERRUPTEUR' }],
      ouvert: 'VISE LA SORTIE',
    },
    rules: [
      { quand: { cibles: ['c1', 'c2', 'c3'] }, alors: [{ ouvrir: 'porte' }, { points: 500 }, { message: 'PORTE OUVERTE : IL RESTE LE PONT' }] },
    ].concat(reglesPont),
  });

  // Tronc 6 : bascule + interrupteur. Le couloir gauche a un vide ; l'interrupteur baisse son pont,
  // la bascule lève la porte (et renvoie la bille sur le flip droit).
  const etage6 = merge(base({ leftTop: -40, rightTop: 150 }), {
    biome: 'TRONC',
    nom: 'Le couloir suspendu',
    intro: 'LYSE : L\'INTERRUPTEUR BAISSE LE PONT DU COULOIR, LA BASCULE LÈVE SA PORTE. IL TE FAUT LES DEUX.',
    sauveBille: 0,
    walls: [[150, -40, 150, 430], [150, 140, 300, 40], [300, 40, 580, 150]],
    exit: { x1: 20, x2: 150, y1: -40, y2: 80 },
    targets: [{ id: 'interrupteur', kind: 'switch', seg: [W - 26, 370, W - 26, 520] }],
    bumpers: [{ x: 250, y: 560, r: 24 }],
    gates: [{ id: 'porte', seg: [20, 100, 150, 100] }],
    bridges: [{ id: 'pont', rect: { x1: 20, x2: 150, y1: 180, y2: 240 } }],
    // Mesuré (acces.js) : dans le couloir, la géométrie décide (22 réussites sur 101 de 500 à 1200, contre 24
    // au 3) ; 900 ne fait que retarder le début de la fenêtre. La difficulté vient des deux conditions.
    aspirations: [
      { si: ['porte', 'pont'], zone: { x1: 20, x2: 150, y1: -40, y2: 440 }, vers: [85, -40], force: 900, amorti: 6 },
    ],
    seesaws: [{ id: 'bascule', x: 365, y: 300, half: 95, a0: -0.3, a1: 0.3, hold: 8, link: 'porte', parDessous: true,
      cable: { poulies: [[275, 24], [172, 24]], contrepoids: [172, 52] }, catapulte: CATAPULTE }],
    labels: [{ x: 85, y: 460, text: 'COULOIR' }, { x: W - 78, y: 360, text: 'INTERRUPTEUR' }],
    objectif: {
      conditions: [{ id: 'pont', texte: 'FRAPPE L\'INTERRUPTEUR' }, { id: 'porte', texte: 'FAIS BASCULER LA BASCULE' }],
      ouvert: 'VISE LE COULOIR GAUCHE',
    },
    rules: [
      { quand: { bascule: 'bascule' }, alors: [{ ouvrir: 'porte', duree: 8 }, { message: 'PORTE LEVÉE : 8 SECONDES' }] },
    ].concat(reglesPont),
  });

  const LEVELS = [etage1, etage2, etage3, etage4, etage5, etage6];
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else racine.LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
