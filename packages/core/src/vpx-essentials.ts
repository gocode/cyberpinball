// Onglet « Essentiels » de l'écran de réglages : une sélection de réglages de
// VPX, décrits par Cyber Pinball dans la langue de l'interface (accesseurs : rien
// ne se traduit au chargement du module). Le reste du schéma (libellés d'origine) est dans
// l'onglet « Avancé ». Une entrée absente du schéma d'une version est ignorée.

import { t } from './i18n';

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
    get title() {
      return t('Vue de la table et cadrage');
    },
    settings: [
      {
        section: 'Player',
        key: 'BGSet',
        get label() {
          return t('Mode d’affichage');
        },
        get help() {
          return t('Choisit le point de vue préparé par l’auteur de la table. Cyber Pinball choisit « Borne » quand le playfield est plus haut que large pour le joueur.');
        },
        get values() {
          return [t('Bureau ou écran unique'), t('Borne'), t('Plein écran unique (FSS)')];
        },
      },
      {
        section: 'Player',
        key: 'CabinetAutofitMode',
        get label() {
          return t('Cadrage automatique');
        },
        get help() {
          return t('En mode borne, VPX peut cadrer la table tout seul. « Ajuster la table » garde ses proportions, « Remplir l’écran » l’étire pour occuper tout l’écran.');
        },
        get values() {
          return [t('Manuel'), t('Ajuster la table'), t('Remplir l’écran')];
        },
      },
      {
        section: 'Player',
        key: 'CabinetAutofitPos',
        get label() {
          return t('Hauteur des flippers à l’écran');
        },
        get help() {
          return t('Avec le cadrage automatique : position des flippers du bas, 0 % étant le bas de l’écran.');
        },
        unit: '%',
        scale: 100,
      },
      {
        section: 'Player',
        key: 'ScreenWidth',
        get label() {
          return t('Largeur de l’écran du plateau');
        },
        get help() {
          return t('Largeur réelle de l’image (le côté le plus long), lue dans l’écran ou déduite de la diagonale indiquée dans l’assistant. Sert à montrer la table à la bonne échelle.');
        },
        unit: 'cm',
      },
      {
        section: 'Player',
        key: 'ScreenHeight',
        get label() {
          return t('Hauteur de l’écran du plateau');
        },
        get help() {
          return t('Hauteur réelle de l’image (le côté le plus court), lue dans l’écran ou déduite de la diagonale indiquée dans l’assistant.');
        },
        unit: 'cm',
      },
      {
        section: 'Player',
        key: 'ScreenInclination',
        get label() {
          return t('Inclinaison de l’écran');
        },
        get help() {
          return t('0° : écran posé à plat, comme dans une borne.');
        },
        unit: '°',
      },
      {
        section: 'Player',
        key: 'LockbarWidth',
        get label() {
          return t('Largeur de la lockbar');
        },
        get help() {
          return t('Largeur de la barre avant de la borne, mesurée sur le meuble.');
        },
        unit: 'cm',
      },
      {
        section: 'Player',
        key: 'LockbarHeight',
        get label() {
          return t('Hauteur de la lockbar');
        },
        get help() {
          return t('Hauteur du dessus de la barre avant, mesurée depuis le sol.');
        },
        unit: 'cm',
      },
    ],
  },
  {
    get title() {
      return t('Son');
    },
    settings: [
      {
        section: 'Player',
        key: 'MusicVolume',
        get label() {
          return t('Volume du backglass');
        },
        get help() {
          return t('Musique et voix, diffusées par les haut-parleurs du fronton.');
        },
        unit: '%',
      },
      {
        section: 'Player',
        key: 'SoundVolume',
        get label() {
          return t('Volume du plateau');
        },
        get help() {
          return t('Bruits mécaniques : flippers, bille, bumpers.');
        },
        unit: '%',
      },
      {
        section: 'Player',
        key: 'Sound3D',
        get label() {
          return t('Haut-parleurs du plateau');
        },
        get help() {
          return t('Répartition des bruits du plateau selon les haut-parleurs installés dans la borne.');
        },
        get values() {
          return [
            t('Deux canaux à l’avant'),
            t('Deux canaux à l’arrière'),
            t('Jusqu’à 6 canaux, arrière côté lockbar'),
            t('Jusqu’à 6 canaux, avant côté lockbar'),
            t('6 canaux, côtés et arrière côté lockbar (ancien mixage)'),
            t('6 canaux, côtés et arrière côté lockbar (nouveau mixage)'),
          ];
        },
      },
    ],
  },
  {
    get title() {
      return t('Performances et synchronisation');
    },
    settings: [
      {
        section: 'Player',
        key: 'SyncMode',
        get label() {
          return t('Synchronisation de l’image');
        },
        get help() {
          return t('Synchro verticale : pas de déchirure d’image, mais plus de latence. Régulation des images : latence minimale, au risque de saccades si le PC est juste.');
        },
        get values() {
          return [t('Aucune'), t('Synchro verticale'), t('Synchro adaptative'), t('Régulation des images')];
        },
      },
      {
        section: 'Player',
        key: 'MaxFramerate',
        get label() {
          return t('Limite d’images par seconde');
        },
        get help() {
          return t('−1 : fréquence de l’écran ; 0 : sans limite ; autre valeur : plafond fixe (moins de chauffe et de bruit).');
        },
        get unit() {
          return t('i/s');
        },
      },
      {
        section: 'Player',
        key: 'MaxPrerenderedFrames',
        get label() {
          return t('Images préparées à l’avance');
        },
        get help() {
          return t('Plus de marge pour la fluidité, mais plus de latence. Gardez la plus petite valeur qui reste fluide.');
        },
      },
      {
        section: 'Player',
        key: 'ShowFPS',
        get label() {
          return t('Afficher les performances');
        },
        get help() {
          return t('Affiche le nombre d’images par seconde pendant la partie.');
        },
        get values() {
          return [t('Non'), t('Images par seconde'), t('Détaillé')];
        },
      },
      {
        section: 'Player',
        key: 'AAFactor',
        get label() {
          return t('Suréchantillonnage');
        },
        get help() {
          return t('Calcule l’image en plus haute définition puis la réduit : très belle image, mais coûteux. 100 % : désactivé.');
        },
        unit: '%',
        scale: 100,
      },
      {
        section: 'Player',
        key: 'MSAASamples',
        get label() {
          return t('Anticrénelage MSAA');
        },
        get help() {
          return t('Adoucit les bords des objets, au prix de performances et de mémoire graphique.');
        },
        get values() {
          return [t('Désactivé'), t('4 échantillons'), t('6 échantillons'), t('8 échantillons')];
        },
      },
      {
        section: 'Player',
        key: 'FXAA',
        get label() {
          return t('Anticrénelage de l’image finale');
        },
        get help() {
          return t('Adoucit les bords après le rendu ; les options « qualité » sont plus belles et plus coûteuses.');
        },
        get values() {
          return [t('Désactivé'), t('FXAA rapide'), t('FXAA standard'), t('FXAA qualité'), t('NFAA rapide'), t('DLAA standard'), t('SMAA qualité'), t('FAAA qualité')];
        },
      },
      {
        section: 'Player',
        key: 'PFReflection',
        get label() {
          return t('Qualité des reflets');
        },
        get help() {
          return t('« Dynamiques » donne le meilleur résultat ; « Statiques seulement » ne coûte rien.');
        },
        get values() {
          return [t('Aucun reflet'), t('Billes seulement'), t('Statiques seulement'), t('Statiques et billes'), t('Statiques et dynamiques non synchronisés'), t('Dynamiques')];
        },
      },
      {
        section: 'Player',
        key: 'ForceBloomOff',
        get label() {
          return t('Couper le halo des lumières');
        },
        get help() {
          return t('Désactive l’effet de halo (bloom) autour des lumières vives.');
        },
        get values() {
          return [t('Non'), t('Oui')];
        },
      },
      {
        section: 'Player',
        key: 'MaxTexDimension',
        get label() {
          return t('Taille maximale des textures');
        },
        get help() {
          return t('Les images plus grandes sont réduites au chargement : utile avec une carte graphique qui a peu de mémoire.');
        },
        unit: 'px',
      },
    ],
  },
  {
    title: 'DMD', // même nom dans toutes les langues
    settings: [
      {
        section: 'DMD',
        key: 'Profile2DotBrightness',
        get label() {
          return t('Luminosité des points');
        },
        get help() {
          return t('Style « plasma néon », celui des DMD orange classiques dessinés par VPX. Les autres styles sont dans Avancé, section DMD.');
        },
      },
      {
        section: 'DMD',
        key: 'Profile2DotSize',
        get label() {
          return t('Taille des points');
        },
        get help() {
          return t('Taille relative de chaque point du DMD (style plasma néon).');
        },
        unit: '%',
        scale: 100,
      },
      {
        section: 'DMD',
        key: 'Profile2DotSharpness',
        get label() {
          return t('Netteté des points');
        },
        get help() {
          return t('De points ronds et doux (0 %) à des carrés nets (100 %).');
        },
        unit: '%',
        scale: 100,
      },
      {
        section: 'DMD',
        key: 'Profile2DiffuseGlow',
        get label() {
          return t('Lueur diffuse');
        },
        get help() {
          return t('Lueur entre les points, comme la lumière qui se diffuse sur la vitre.');
        },
      },
      {
        section: 'DMD',
        key: 'Profile2DotTint',
        get label() {
          return t('Couleur des points allumés');
        },
        get help() {
          return t('Couleur au format RRVVBB, à saisir au clavier.');
        },
      },
    ],
  },
  {
    // Réglages déclarés par les plugins B2S, PUP et DMDUtil : sans effet quand le plugin est éteint.
    get title() {
      return t('Backglass, PuP et DMD réel');
    },
    settings: [
      {
        section: 'Plugin.B2S',
        key: 'ShowGrill',
        get label() {
          return t('Grille du backglass');
        },
        get help() {
          return t('La grille est la bande du bas d’un .directb2s, sous l’illustration. Masquée, l’illustration remplit tout l’écran du backglass.');
        },
        get values() {
          return [t('Masquée'), t('Affichée')];
        },
      },
      {
        section: 'Plugin.B2S',
        key: 'ScoreViewDMDOverlay',
        get label() {
          return t('DMD dans le cadre du FullDMD');
        },
        get help() {
          return t('Quand le .directb2s fournit une image pour l’écran DMD (FullDMD), dessine le DMD du jeu par-dessus. Cyber Pinball l’active quand la borne a un écran DMD.');
        },
        get values() {
          return [t('Non'), t('Oui')];
        },
      },
      {
        section: 'Plugin.B2S',
        key: 'ScoreViewDMDAutoPos',
        get label() {
          return t('Repérer le cadre du FullDMD');
        },
        get help() {
          return t('Cherche dans l’image FullDMD la zone sombre où placer le DMD. Sinon, la position et la taille se règlent dans l’onglet Avancé (section Plugin.B2S).');
        },
        get values() {
          return [t('Non'), t('Oui')];
        },
      },
      {
        section: 'Plugin.B2S',
        key: 'BackglassDMDOverlay',
        get label() {
          return t('DMD incrusté dans le backglass');
        },
        get help() {
          return t('Dessine le DMD du jeu dans l’illustration du backglass, pour une borne sans écran DMD dont le .directb2s prévoit sa place.');
        },
        get values() {
          return [t('Non'), t('Oui')];
        },
      },
      {
        section: 'Plugin.B2S',
        key: 'BackglassDMDAutoPos',
        get label() {
          return t('Repérer la place du DMD incrusté');
        },
        get help() {
          return t('Cherche dans l’illustration du backglass la zone sombre où placer le DMD.');
        },
        get values() {
          return [t('Non'), t('Oui')];
        },
      },
      {
        section: 'Plugin.PUP',
        key: 'MainVol',
        get label() {
          return t('Volume des packs PuP');
        },
        get help() {
          return t('Volume des vidéos et des sons des packs PuP, par rapport au reste du fronton.');
        },
        unit: '%',
        scale: 100,
      },
      {
        section: 'Plugin.DMDUtil',
        key: 'ZeDMDBrightness',
        get label() {
          return t('Luminosité du ZeDMD');
        },
        get help() {
          return t('−1 garde la luminosité enregistrée dans le ZeDMD.');
        },
      },
    ],
  },
  {
    get title() {
      return t('Dossiers communs à toutes les tables');
    },
    settings: [
      {
        section: 'Plugin.PinMAME',
        key: 'PinMAMEPath',
        get label() {
          return t('Dossier PinMAME');
        },
        get help() {
          return t('Dossier qui contient roms, nvram… Chaque table cherche d’abord sa ROM dans son propre dossier pinmame\\roms. Cyber Pinball propose <racine>\\pinmame quand il existe.');
        },
      },
      {
        section: 'Plugin.Serum',
        key: 'SerumPath',
        get label() {
          return t('Couleurs Serum');
        },
        get help() {
          return t('Dossier qui contient <rom>\\<rom>.cRZ. Chaque table cherche d’abord dans ses dossiers serum et pinmame\\altcolor.');
        },
      },
      {
        section: 'Plugin.VNI',
        key: 'VniPath',
        get label() {
          return t('Couleurs VNI');
        },
        get help() {
          return t('Dossier qui contient <rom>\\<rom>.pal et .vni. Chaque table cherche d’abord dans ses dossiers vni et pinmame\\altcolor.');
        },
      },
      {
        section: 'Plugin.PUP',
        key: 'PUPFolder',
        get label() {
          return t('Dossier PinUP Player');
        },
        get help() {
          return t('Pour réutiliser une collection de packs PuP existante : son dossier pupvideos est consulté après celui de la table.');
        },
      },
    ],
  },
  {
    get title() {
      return t('Jeu et éclairage');
    },
    settings: [
      {
        section: 'TableOverride',
        key: 'Difficulty',
        get label() {
          return t('Difficulté');
        },
        get help() {
          return t('Difficulté générale : pente, taille des flippers, dispersion de la bille. Se règle table par table.');
        },
        unit: '%',
        scale: 100,
      },
      {
        section: 'TableOverride',
        key: 'Exposure',
        get label() {
          return t('Luminosité de la scène');
        },
        get help() {
          return t('Éclaircit ou assombrit toute la table. Se règle table par table.');
        },
        unit: '%',
        scale: 100,
      },
      {
        section: 'Player',
        key: 'OverrideTableEmissionScale',
        get label() {
          return t('Imposer le niveau de lumière');
        },
        get help() {
          return t('Remplace l’ambiance jour / nuit prévue par la table par celle choisie ci-dessous.');
        },
        get values() {
          return [t('Non'), t('Oui')];
        },
      },
      {
        section: 'Player',
        key: 'EmissionScale',
        get label() {
          return t('Jour / nuit');
        },
        get help() {
          return t('Lumière ambiante, de la nuit (0 %) au plein jour (100 %), si le niveau de lumière est imposé.');
        },
        unit: '%',
        scale: 100,
      },
    ],
  },
];
