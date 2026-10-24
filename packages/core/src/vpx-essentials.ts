// Onglet « Essentiels » de l'écran de réglages : une sélection de réglages de
// VPX, traduits en français. Le reste du schéma (libellés d'origine) est dans
// l'onglet « Avancé ». Une entrée absente du schéma d'une version est ignorée.

export interface EssentialSetting {
  section: string;
  key: string;
  label: string;
  help: string;
  /** Énumération : un libellé par valeur, dans l'ordre du schéma. Booléen : [non, oui]. */
  values?: string[];
  unit?: string;
  /** Multiplicateur d'affichage : 100 pour montrer 0.05 comme 5 %. */
  scale?: number;
}

export interface EssentialGroup {
  title: string;
  settings: EssentialSetting[];
}

export const VPX_ESSENTIALS: EssentialGroup[] = [
  {
    title: 'Vue de la table et cadrage',
    settings: [
      {
        section: 'Player',
        key: 'BGSet',
        label: 'Mode d’affichage',
        help: 'Choisit le point de vue préparé par l’auteur de la table. Cyber Pinball choisit « Borne » quand le playfield est plus haut que large pour le joueur.',
        values: ['Bureau ou écran unique', 'Borne', 'Plein écran unique (FSS)'],
      },
      {
        section: 'Player',
        key: 'CabinetAutofitMode',
        label: 'Cadrage automatique',
        help: 'En mode borne, VPX peut cadrer la table tout seul. « Ajuster la table » garde ses proportions, « Remplir l’écran » l’étire pour occuper tout l’écran.',
        values: ['Manuel', 'Ajuster la table', 'Remplir l’écran'],
      },
      {
        section: 'Player',
        key: 'CabinetAutofitPos',
        label: 'Hauteur des flippers à l’écran',
        help: 'Avec le cadrage automatique : position des flippers du bas, 0 % étant le bas de l’écran.',
        unit: '%',
        scale: 100,
      },
      {
        section: 'Player',
        key: 'ScreenWidth',
        label: 'Largeur de l’écran du plateau',
        help: 'Largeur réelle de l’image (le côté le plus long), lue dans l’écran ou déduite de la diagonale indiquée dans l’assistant. Sert à montrer la table à la bonne échelle.',
        unit: 'cm',
      },
      {
        section: 'Player',
        key: 'ScreenHeight',
        label: 'Hauteur de l’écran du plateau',
        help: 'Hauteur réelle de l’image (le côté le plus court), lue dans l’écran ou déduite de la diagonale indiquée dans l’assistant.',
        unit: 'cm',
      },
      {
        section: 'Player',
        key: 'ScreenInclination',
        label: 'Inclinaison de l’écran',
        help: '0° : écran posé à plat, comme dans une borne.',
        unit: '°',
      },
      {
        section: 'Player',
        key: 'LockbarWidth',
        label: 'Largeur de la lockbar',
        help: 'Largeur de la barre avant de la borne, mesurée sur le meuble.',
        unit: 'cm',
      },
      {
        section: 'Player',
        key: 'LockbarHeight',
        label: 'Hauteur de la lockbar',
        help: 'Hauteur du dessus de la barre avant, mesurée depuis le sol.',
        unit: 'cm',
      },
    ],
  },
  {
    title: 'Son',
    settings: [
      {
        section: 'Player',
        key: 'MusicVolume',
        label: 'Volume du backglass',
        help: 'Musique et voix, diffusées par les haut-parleurs du fronton.',
        unit: '%',
      },
      {
        section: 'Player',
        key: 'SoundVolume',
        label: 'Volume du plateau',
        help: 'Bruits mécaniques : flippers, bille, bumpers.',
        unit: '%',
      },
      {
        section: 'Player',
        key: 'Sound3D',
        label: 'Haut-parleurs du plateau',
        help: 'Répartition des bruits du plateau selon les haut-parleurs installés dans la borne.',
        values: [
          'Deux canaux à l’avant',
          'Deux canaux à l’arrière',
          'Jusqu’à 6 canaux, arrière côté lockbar',
          'Jusqu’à 6 canaux, avant côté lockbar',
          '6 canaux, côtés et arrière côté lockbar (ancien mixage)',
          '6 canaux, côtés et arrière côté lockbar (nouveau mixage)',
        ],
      },
    ],
  },
  {
    title: 'Performances et synchronisation',
    settings: [
      {
        section: 'Player',
        key: 'SyncMode',
        label: 'Synchronisation de l’image',
        help: 'Synchro verticale : pas de déchirure d’image, mais plus de latence. Régulation des images : latence minimale, au risque de saccades si le PC est juste.',
        values: ['Aucune', 'Synchro verticale', 'Synchro adaptative', 'Régulation des images'],
      },
      {
        section: 'Player',
        key: 'MaxFramerate',
        label: 'Limite d’images par seconde',
        help: '−1 : fréquence de l’écran ; 0 : sans limite ; autre valeur : plafond fixe (moins de chauffe et de bruit).',
        unit: 'i/s',
      },
      {
        section: 'Player',
        key: 'MaxPrerenderedFrames',
        label: 'Images préparées à l’avance',
        help: 'Plus de marge pour la fluidité, mais plus de latence. Gardez la plus petite valeur qui reste fluide.',
      },
      {
        section: 'Player',
        key: 'ShowFPS',
        label: 'Afficher les performances',
        help: 'Affiche le nombre d’images par seconde pendant la partie.',
        values: ['Non', 'Images par seconde', 'Détaillé'],
      },
      {
        section: 'Player',
        key: 'AAFactor',
        label: 'Suréchantillonnage',
        help: 'Calcule l’image en plus haute définition puis la réduit : très belle image, mais coûteux. 100 % : désactivé.',
        unit: '%',
        scale: 100,
      },
      {
        section: 'Player',
        key: 'MSAASamples',
        label: 'Anticrénelage MSAA',
        help: 'Adoucit les bords des objets, au prix de performances et de mémoire graphique.',
        values: ['Désactivé', '4 échantillons', '6 échantillons', '8 échantillons'],
      },
      {
        section: 'Player',
        key: 'FXAA',
        label: 'Anticrénelage de l’image finale',
        help: 'Adoucit les bords après le rendu ; les options « qualité » sont plus belles et plus coûteuses.',
        values: ['Désactivé', 'FXAA rapide', 'FXAA standard', 'FXAA qualité', 'NFAA rapide', 'DLAA standard', 'SMAA qualité', 'FAAA qualité'],
      },
      {
        section: 'Player',
        key: 'PFReflection',
        label: 'Qualité des reflets',
        help: '« Dynamiques » donne le meilleur résultat ; « Statiques seulement » ne coûte rien.',
        values: ['Aucun reflet', 'Billes seulement', 'Statiques seulement', 'Statiques et billes', 'Statiques et dynamiques non synchronisés', 'Dynamiques'],
      },
      {
        section: 'Player',
        key: 'ForceBloomOff',
        label: 'Couper le halo des lumières',
        help: 'Désactive l’effet de halo (bloom) autour des lumières vives.',
        values: ['Non', 'Oui'],
      },
      {
        section: 'Player',
        key: 'MaxTexDimension',
        label: 'Taille maximale des textures',
        help: 'Les images plus grandes sont réduites au chargement : utile avec une carte graphique qui a peu de mémoire.',
        unit: 'px',
      },
    ],
  },
  {
    title: 'DMD',
    settings: [
      {
        section: 'DMD',
        key: 'Profile2DotBrightness',
        label: 'Luminosité des points',
        help: 'Style « plasma néon », celui des DMD orange classiques dessinés par VPX. Les autres styles sont dans Avancé, section DMD.',
      },
      {
        section: 'DMD',
        key: 'Profile2DotSize',
        label: 'Taille des points',
        help: 'Taille relative de chaque point du DMD (style plasma néon).',
        unit: '%',
        scale: 100,
      },
      {
        section: 'DMD',
        key: 'Profile2DotSharpness',
        label: 'Netteté des points',
        help: 'De points ronds et doux (0 %) à des carrés nets (100 %).',
        unit: '%',
        scale: 100,
      },
      {
        section: 'DMD',
        key: 'Profile2DiffuseGlow',
        label: 'Lueur diffuse',
        help: 'Lueur entre les points, comme la lumière qui se diffuse sur la vitre.',
      },
      {
        section: 'DMD',
        key: 'Profile2DotTint',
        label: 'Couleur des points allumés',
        help: 'Couleur au format RRVVBB, à saisir au clavier.',
      },
    ],
  },
  {
    // Réglages déclarés par les plugins B2S, PUP et DMDUtil : sans effet quand le plugin est éteint.
    title: 'Backglass, PuP et DMD réel',
    settings: [
      {
        section: 'Plugin.B2S',
        key: 'ShowGrill',
        label: 'Grille du backglass',
        help: 'La grille est la bande du bas d’un .directb2s, sous l’illustration. Masquée, l’illustration remplit tout l’écran du backglass.',
        values: ['Masquée', 'Affichée'],
      },
      {
        section: 'Plugin.B2S',
        key: 'ScoreViewDMDOverlay',
        label: 'DMD dans le cadre du FullDMD',
        help: 'Quand le .directb2s fournit une image pour l’écran DMD (FullDMD), dessine le DMD du jeu par-dessus. Cyber Pinball l’active quand la borne a un écran DMD.',
        values: ['Non', 'Oui'],
      },
      {
        section: 'Plugin.B2S',
        key: 'ScoreViewDMDAutoPos',
        label: 'Repérer le cadre du FullDMD',
        help: 'Cherche dans l’image FullDMD la zone sombre où placer le DMD. Sinon, la position et la taille se règlent dans l’onglet Avancé (section Plugin.B2S).',
        values: ['Non', 'Oui'],
      },
      {
        section: 'Plugin.B2S',
        key: 'BackglassDMDOverlay',
        label: 'DMD incrusté dans le backglass',
        help: 'Dessine le DMD du jeu dans l’illustration du backglass, pour une borne sans écran DMD dont le .directb2s prévoit sa place.',
        values: ['Non', 'Oui'],
      },
      {
        section: 'Plugin.B2S',
        key: 'BackglassDMDAutoPos',
        label: 'Repérer la place du DMD incrusté',
        help: 'Cherche dans l’illustration du backglass la zone sombre où placer le DMD.',
        values: ['Non', 'Oui'],
      },
      {
        section: 'Plugin.PUP',
        key: 'MainVol',
        label: 'Volume des packs PuP',
        help: 'Volume des vidéos et des sons des packs PuP, par rapport au reste du fronton.',
        unit: '%',
        scale: 100,
      },
      {
        section: 'Plugin.DMDUtil',
        key: 'ZeDMDBrightness',
        label: 'Luminosité du ZeDMD',
        help: '−1 garde la luminosité enregistrée dans le ZeDMD.',
      },
    ],
  },
  {
    title: 'Dossiers communs à toutes les tables',
    settings: [
      {
        section: 'Plugin.PinMAME',
        key: 'PinMAMEPath',
        label: 'Dossier PinMAME',
        help: 'Dossier qui contient roms, nvram… Chaque table cherche d’abord sa ROM dans son propre dossier pinmame\\roms. Cyber Pinball propose <racine>\\pinmame quand il existe.',
      },
      {
        section: 'Plugin.Serum',
        key: 'SerumPath',
        label: 'Couleurs Serum',
        help: 'Dossier qui contient <rom>\\<rom>.cRZ. Chaque table cherche d’abord dans ses dossiers serum et pinmame\\altcolor.',
      },
      {
        section: 'Plugin.VNI',
        key: 'VniPath',
        label: 'Couleurs VNI',
        help: 'Dossier qui contient <rom>\\<rom>.pal et .vni. Chaque table cherche d’abord dans ses dossiers vni et pinmame\\altcolor.',
      },
      {
        section: 'Plugin.PUP',
        key: 'PUPFolder',
        label: 'Dossier PinUP Player',
        help: 'Pour réutiliser une collection de packs PuP existante : son dossier pupvideos est consulté après celui de la table.',
      },
    ],
  },
  {
    title: 'Jeu et éclairage',
    settings: [
      {
        section: 'TableOverride',
        key: 'Difficulty',
        label: 'Difficulté',
        help: 'Difficulté générale : pente, taille des flippers, dispersion de la bille. Se règle table par table.',
        unit: '%',
        scale: 100,
      },
      {
        section: 'TableOverride',
        key: 'Exposure',
        label: 'Luminosité de la scène',
        help: 'Éclaircit ou assombrit toute la table. Se règle table par table.',
        unit: '%',
        scale: 100,
      },
      {
        section: 'Player',
        key: 'OverrideTableEmissionScale',
        label: 'Imposer le niveau de lumière',
        help: 'Remplace l’ambiance jour / nuit prévue par la table par celle choisie ci-dessous.',
        values: ['Non', 'Oui'],
      },
      {
        section: 'Player',
        key: 'EmissionScale',
        label: 'Jour / nuit',
        help: 'Lumière ambiante, de la nuit (0 %) au plein jour (100 %), si le niveau de lumière est imposé.',
        unit: '%',
        scale: 100,
      },
    ],
  },
];
