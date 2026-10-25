// Modèle de borne : la seule source de vérité. Tous les fichiers des outils
// tiers (VPinballX.ini, plus tard ScreenRes.txt, PinUP, dmddevice.ini) en sont dérivés.

import { t } from './i18n';

export type RoleId = 'playfield' | 'backglass' | 'dmd' | 'topper';

export interface RoleInfo {
  id: RoleId;
  label: string;
  required: boolean;
}

/** Ordre de l'assistant : du plus important au plus optionnel. */
export const ROLES: readonly RoleInfo[] = [
  { id: 'playfield', label: 'Playfield', required: true },
  { id: 'backglass', label: 'Backglass', required: false },
  { id: 'dmd', label: 'DMD', required: false },
  { id: 'topper', label: 'Topper', required: false },
];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** Rôles affichés dans une fenêtre annexe de VPX (Backglass, ScoreView, Topper). */
export type AncillaryRoleId = Exclude<RoleId, 'playfield'>;

/**
 * Partie de l'image d'un écran, en fractions de sa largeur et de sa hauteur
 * (0 à 1, origine en haut à gauche de l'image Windows). Une fraction survit à un
 * changement de définition de l'écran, pas des pixels.
 *
 * La zone du rôle DMD est celle de la fenêtre ScoreView de VPX, qui superpose
 * deux couches : le FullDMD en fond (image du .directb2s, écran 5 d'un PuP-Pack)
 * et, par-dessus, le DMD de la ROM, que les plugins placent eux-mêmes dans la
 * fenêtre (B2S : ScoreViewDMDOverlay et ScoreViewDMDAutoPos ; PuP : écran 1 posé
 * sur l'écran 5 par CustomPos).
 */
export interface ScreenZone {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Format conservé quand on redimensionne la zone (largeur sur hauteur, en pixels :
   * 16/9…). Absent : format libre.
   */
  aspect?: number;
}

/** Ce que contient l'EDID d'un écran (lu dans le registre Windows). */
export interface EdidInfo {
  /** Code fabricant PNP sur trois lettres, par exemple « SAM ». */
  manufacturer: string;
  productCode: number;
  /** Numéro de série binaire ; 0 quand le fabricant ne le renseigne pas. */
  serialNumber: number;
  /** Numéro de série texte (descripteur 0xFF), souvent plus fiable que le binaire. */
  serialText?: string;
  /** Nom du modèle (descripteur 0xFC). */
  monitorName?: string;
  widthCm: number;
  heightCm: number;
  /** Taille de l'image au millimètre, lue dans le premier timing détaillé ; plus précise que les cm. */
  imageMm?: { width: number; height: number };
}

/**
 * Un écran tel qu'il est vu au moment de la détection. Le nom GDI et la position
 * changent d'un démarrage à l'autre : ce sont des observations, jamais des clés.
 */
export interface ObservedDisplay {
  /** Nom GDI Windows, par exemple « \\.\DISPLAY13 ». Instable. */
  gdiName: string;
  /** Nom convivial renvoyé par DisplayConfig ; c'est aussi celui que VPX (via SDL) affiche. */
  friendlyName: string;
  /**
   * Description du moniteur (EnumDisplayDevicesW, DeviceString), souvent « Moniteur
   * PnP générique ». SDL s'en sert quand le nom convivial est vide.
   */
  monitorDescription?: string;
  /** Chemin d'interface du moniteur, par exemple « \\?\DISPLAY#SAM0C8D#8&20834467&0&UID257#{...} ». */
  devicePath: string;
  /** Position et taille sur le bureau, en pixels physiques. */
  bounds: Rect;
  rotation: Rotation;
  primary: boolean;
  /** Facteur d'échelle Windows (1 = 100 %). Absent quand on n'a pas pu le lire. */
  scale?: number;
  edid?: EdidInfo;
  /**
   * ContainerId du moniteur PnP (HKLM\SYSTEM\CurrentControlSet\Enum\DISPLAY\…).
   * Les haut-parleurs HDMI de l'écran portent le même : c'est ce qui les rattache à lui.
   */
  containerId?: string;
}

export type FingerprintStrength = 'strong' | 'weak';

/** Un écran physique enregistré dans le modèle de borne. */
export interface PhysicalScreen {
  fingerprint: string;
  strength: FingerprintStrength;
  label: string;
  widthPx: number;
  heightPx: number;
  widthCm: number;
  heightCm: number;
  /** Dernière observation, conservée pour le diagnostic. */
  lastSeen?: ObservedDisplay;
}

/**
 * Bord de l'image Windows du playfield le plus proche du joueur, là où sont les
 * flippers. Sur une borne, l'écran est souvent couché et tourné alors que Windows
 * reste en paysage : le joueur se tient alors au bord gauche ou droit de l'image.
 */
export type FlipperEdge = 'bottom' | 'left' | 'top' | 'right';

/** Rotation horaire (degrés) à appliquer à un affichage pour qu'il soit droit vu du joueur. */
export function edgeRotation(edge: FlipperEdge): Rotation {
  return ({ bottom: 0, left: 90, top: 180, right: 270 } as const)[edge];
}

export interface PlayfieldLayout {
  flipperEdge: FlipperEdge;
  /**
   * Taille de la zone d'affichage saisie dans l'assistant (diagonale), quand l'EDID
   * est absent ou incohérent (téléviseurs, projecteurs). Prime sur l'EDID.
   */
  manualSizeCm?: { width: number; height: number };
}

export interface Cabinet {
  version: 1;
  screens: PhysicalScreen[];
  /**
   * Rôle -> empreinte de l'écran physique qui l'affiche. Plusieurs rôles annexes
   * peuvent partager un écran, chacun dans sa zone (`zones`) ; sur l'écran du
   * playfield, ils sont incrustés dans son image.
   */
  roles: Partial<Record<RoleId, string>>;
  /**
   * Partie de son écran occupée par chaque rôle. Absent : l'écran entier, comme
   * dans les modèles enregistrés avant les zones. Le playfield peut lui aussi
   * n'occuper qu'une partie de son écran (poste de bureau).
   */
  zones?: Partial<Record<RoleId, ScreenZone>>;
  /** Absent dans les modèles enregistrés avant l'assistant d'orientation : flippers en bas. */
  playfield?: PlayfieldLayout;
  /**
   * Clés gérées de VPinballX.ini (« Section.Clé ») que l'utilisateur a choisi de
   * garder après les avoir changées à la main : Cyber Pinball ne les écrit plus.
   */
  vpxManual?: string[];
  /** Absent tant que l'étape « Son » de l'assistant n'a pas été faite : aucune clé audio n'est écrite. */
  audio?: CabinetAudio;
  /**
   * Touche de chaque bouton, relevée à l'étape « Boutons » de l'assistant. Absent tant
   * qu'elle n'a pas été faite : l'interface suit les touches par défaut des encodeurs
   * et aucune clé [Input] n'est écrite.
   */
  buttons?: CabinetButtons;
  /**
   * Boutons qui pilotent l'interface de Cyber Pinball (précédent, suivant, valider,
   * retour, aide, réglages), relevés à l'étape « Boutons de l'interface », indépendants de
   * ceux du jeu. Absent (borne d'avant cette étape) : l'interface suit les boutons du jeu,
   * flippers, Start et Exit (defaultNavigation). VPX ne les lit pas.
   */
  navigation?: NavigationButtons;
  vpx: {
    iniPath: string;
  };
  updatedAt: string;
}

/** Boutons de la borne que l'assistant fait affecter (liste et ordre dans buttons.ts). */
export type ButtonId =
  | 'leftFlipper'
  | 'rightFlipper'
  | 'start'
  | 'exit'
  | 'credit'
  | 'plunger'
  | 'leftMagna'
  | 'rightMagna'
  | 'extraBall'
  | 'tilt'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeCenter'
  | 'volumeDown'
  | 'volumeUp';

/**
 * Bouton -> touche qu'il envoie (KeyboardEvent.code : « ShiftLeft », « Digit1 »…).
 * Un bouton facultatif absent de la borne n'y figure pas.
 */
export type CabinetButtons = Partial<Record<ButtonId, string>>;

/** Boutons de l'interface (liste et ordre dans buttons.ts, NAVIGATION). */
export type NavigationId = 'previous' | 'next' | 'confirm' | 'back' | 'help' | 'settings';

/** Bouton de l'interface -> touche ou bouton de joystick, comme CabinetButtons. */
export type NavigationButtons = Partial<Record<NavigationId, string>>;

/**
 * Sortie audio telle que Windows la voit au moment de la détection (registre
 * MMDevices, lecture seule). Comme pour les écrans, le nom est une observation :
 * localisé, renommable, parfois partagé par deux cartes identiques.
 */
export interface ObservedAudioOutput {
  /** Identifiant MMDevice « {0.0.0.00000000}.{guid} » : stable tant que le pilote n'est pas réinstallé. */
  endpointId: string;
  /** Nom que VPX attend, au caractère près : « DeviceDesc (interface) », par exemple « Haut-parleurs (USB Audio Device) ». */
  friendlyName: string;
  /** Partie avant les parenthèses, renommable dans le panneau Son. */
  deviceDesc: string;
  /** Partie entre parenthèses, par exemple « 2- USB Audio Device ». */
  interfaceName: string;
  /** Bus du périphérique : HDAUDIO, USB, BTHENUM, ROOT (virtuel)… */
  bus: string;
  /** Facteur de forme Windows (EndpointFormFactor) : 1 haut-parleurs, 3 casque, 9 sortie numérique (HDMI, S/PDIF)… */
  formFactor: number;
  /** Canaux réglés dans Windows (2, 6, 8) ; 0 quand le format est illisible. */
  channels: number;
  /** Masque des haut-parleurs (WAVEFORMATEXTENSIBLE.dwChannelMask). */
  channelMask: number;
  /** ContainerId du périphérique, partagé avec l'écran pour une sortie HDMI. */
  containerId?: string;
  /** Sortie par défaut de Windows (rôle Console), quand le registre permet de le savoir. */
  isDefault?: boolean;
}

/** Les deux sorties de VPX : SoundDeviceBG (fronton : ROM, AltSound, PuP, musique) et SoundDevice (plateau). */
export type AudioRole = 'backglass' | 'playfield';

export const AUDIO_ROLES: readonly { id: AudioRole; label: string }[] = [
  { id: 'backglass', get label() { return t('Son du fronton'); } },
  { id: 'playfield', get label() { return t('Son du plateau'); } },
];

/**
 * Mixage des sons de la table sur la sortie du plateau, traduit en [Player] Sound3D :
 * stéréo, surround (deux paires sur le plateau) ou SSF (avant au fronton, arrière et côtés sur le plateau).
 */
export type PlayfieldAudioMode = 'stereo' | 'surround' | 'ssf';

/** Une sortie audio enregistrée dans le modèle de borne. */
export interface AudioOutput {
  /** Empreinte principale. */
  endpointId: string;
  /** Repli : retrouve une sortie HDMI recréée par le pilote, par son écran. */
  containerId?: string;
  /** Empreinte de l'écran (PhysicalScreen) dont c'est le haut-parleur. */
  screen?: string;
  label: string;
  /** Dernière observation, conservée pour le diagnostic. */
  lastSeen?: ObservedAudioOutput;
}

export interface CabinetAudio {
  outputs: AudioOutput[];
  /** Rôle -> endpointId de la sortie enregistrée. Les deux rôles peuvent partager une sortie (SSF à une carte). */
  roles: Partial<Record<AudioRole, string>>;
  playfieldMode: PlayfieldAudioMode;
  /** En surround : paire de canaux branchée côté lockbar (avant : Sound3D 3, arrière : 2). */
  lockbarPair?: 'front' | 'rear';
}

/**
 * Périphérique USB présent, vu passivement par le gestionnaire de configuration de
 * Windows (identifiants et registre seulement : aucun port n'est ouvert).
 */
export interface ObservedUsbDevice {
  /** Identifiant d'instance PnP, par exemple « USB\VID_1A86&PID_7523\5&2C1E9F&0&3 » (…&MI_00\… pour une interface). */
  instanceId: string;
  vid: number;
  pid: number;
  /** Nom du Gestionnaire de périphériques (FriendlyName, sinon DeviceDesc). */
  name?: string;
  /** Port série attribué par Windows (COM3), quand il y en a un. */
  port?: string;
}
