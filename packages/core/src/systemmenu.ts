// Menu système (Exit, Tab ou roue dentée). Refondu le 20/11/2026 : les rubriques trop longues
// (Borne 17 lignes, Cyber Pinball 14, Communauté 12) mélangeaient ce qui sert souvent, ce qui se
// règle une fois et ce qui ne sert presque jamais. Chaque écran a désormais au plus huit lignes
// (MAX_SYSTEM_ENTRIES, vérifié par systemmenu.test.ts) et la racine suit l'usage : Tables, Ma borne,
// Téléchargements, Activité récente, Communauté, Juke-box, Aide et infos, Quitter ou éteindre.
//
// Règles du rangement (décidées le 20/11/2026) :
// - une entrée n'a qu'une place ; la racine n'a plus de raccourcis qui doublent une rubrique ;
// - « Ma borne » reçoit ce qui changerait si l'on installait Cyber Pinball sur une autre borne
//   (matériel, écrans, VPX, Windows, langue de la borne) ;
// - les médaillons de la roue (Communauté, Juke-box, Collections) ont un seul écran : la rubrique
//   Communauté EST l'accueil du médaillon (app/src/community-menu.ts le décore), et le Menu système
//   n'en est qu'une porte ; les réglages d'une fonction sont rangés avec elle.
//
// Ce module ne décrit que l'arbre : rubriques, ordre, libellé et icône de chaque entrée.
// L'application fournit ce que fait chaque entrée (app/src/library.ts, frontend.ts) ; le
// manuel et les textes qui nomment un chemin (« Menu système > Ma borne > … ») sont relus par
// systemmenu.test.ts contre cet arbre.

import { t } from './i18n';
import type { IconName } from './icons';

/** Lignes d'un écran du Menu système, « Retour » non compris : au-delà, on ne voit plus la liste d'un coup d'œil. */
export const MAX_SYSTEM_ENTRIES = 8;
/**
 * Lignes de la racine : une de plus depuis l'Arène (21/11/2026), la porte de son médaillon à côté de
 * celle de la Communauté. Rien d'autre à la racine ne pouvait céder sa place (Activité récente parle
 * de tout, Téléchargements et Juke-box n'ont pas d'autre rubrique, Tables est pleine).
 */
export const MAX_SYSTEM_ROOT_ENTRIES = 9;

/** Entrées fournies par l'application. */
export const SYSTEM_ITEM_IDS = [
  'all-tables',
  'collections',
  'wheel',
  'add-table',
  'downloads',
  'roms',
  'missing-media',
  'menu-media',
  'jukebox',
  'account',
  'player-name',
  'country',
  'account-privacy',
  'account-delete',
  'my-level',
  'online-players',
  'instant',
  'groups',
  'rooms',
  'rankings',
  'community-settings',
  'moderation',
  'messages',
  'public-profile',
  'avatar',
  'game-history',
  'badges',
  'sharing',
  'live-scores',
  'activity',
  'quiet-in-game',
  'local-play',
  'health',
  'tech-sheet',
  'debug-mode',
  'cabinet',
  'vpx-presets',
  'vpx-framing',
  'vpx-settings',
  'other-vpx',
  'vpx-trial',
  'vision3d',
  'anaglyph',
  'vr',
  'vr-calibrate',
  'vr-controllers',
  'vr-mirror',
  'controls',
  'phone-remote',
  'dmd-screen',
  'menu-dmd',
  'dmd-color',
  'hardware-dmd',
  'dof',
  'desktop',
  'explorer',
  'dedicated',
  'startup',
  'start-relaunch',
  'guest-mode',
  'updates',
  'news',
  'feedback',
  'follow',
  'terms',
  'community',
  'backups',
  'media-import',
  'rom-migration',
  'quit',
  'relaunch',
  'sleep',
  'restart',
  'shutdown',
] as const;
export type SystemItemId = (typeof SYSTEM_ITEM_IDS)[number];

/** Rubriques (et sous-rubriques) : l'arbre les ouvre lui-même. */
export const SYSTEM_GROUP_IDS = [
  'tables',
  'migration',
  'borne',
  'vpx',
  'dmd',
  'realite-virtuelle',
  'demarrage',
  'sante',
  'amis',
  'arene',
  'progression',
  'mon-profil',
  'modifier-profil',
  'confidentialite',
  'compte',
  'groupes-salons',
  'reglages-communaute',
  'aide',
  'quitter',
] as const;
export type SystemGroupId = (typeof SYSTEM_GROUP_IDS)[number];

export type SystemEntryId = SystemItemId | SystemGroupId;

export interface SystemEntry {
  /** Nom de l'entrée, tel que le manuel l'écrit dans un chemin (« Menu système > Ma borne »). */
  readonly label: string;
  /** Icône de l'entrée, et en titre des écrans qui s'en ouvrent (registre app/renderer/icons.js). */
  readonly icon: IconName;
}

export interface SystemGroup extends SystemEntry {
  readonly id: SystemGroupId;
  /** Ce qu'on y trouve, sous le nom de la rubrique. */
  readonly detail: string;
  /**
   * Ses entrées. La ligne d'une rubrique ne dit jamais l'état ni le badge (BÊTA) d'une de ses entrées : ils
   * se lisent en entrant, sur l'entrée qu'ils concernent (20/11/2026 : « Réalité virtuelle : désactivée
   * BÊTA » sur la ligne parente laissait croire que la rubrique n'était que la VR, vision 3D comprise).
   */
  readonly entries: readonly SystemEntryId[];
}

/**
 * La racine du menu système telle qu'elle s'affiche, dans l'ordre de l'usage (20/11/2026) : gérer ses
 * tables, régler sa borne, suivre ses téléchargements, puis les portes de la Communauté, de l'Arène
 * (21/11/2026) et du Juke-box (leurs médaillons sont dans la roue), l'aide, et « Quitter ou éteindre »
 * en dernier, à deux appuis du flipper gauche depuis l'ouverture (la liste boucle). Rubriques et
 * entrées mêlées : Téléchargements, Activité récente et Juke-box n'ont pas d'autre place.
 */
export const SYSTEM_ROOT_ENTRIES: readonly SystemEntryId[] = ['tables', 'borne', 'downloads', 'activity', 'amis', 'arene', 'jukebox', 'aide', 'quitter'];

/** Rubriques de la racine, dans son ordre. */
export const SYSTEM_ROOT: readonly SystemGroupId[] = SYSTEM_ROOT_ENTRIES.filter((id): id is SystemGroupId => isSystemGroup(id));

/** Entrées rangées directement à la racine, sans rubrique. */
export const SYSTEM_ROOT_ITEMS: readonly SystemItemId[] = SYSTEM_ROOT_ENTRIES.filter((id): id is SystemItemId => !isSystemGroup(id));

export const SYSTEM_GROUPS: Readonly<Record<SystemGroupId, SystemGroup>> = {
  tables: {
    id: 'tables',
    icon: 'tables',
    get label() { return t('Tables'); },
    get detail() { return t('Toutes les tables, collections, ajouter une table, médias, ROM, roue, son et mode attente, migration'); },
    // Collections et Migration rejoignent les tables (20/11/2026) ; la roue à côté des collections qu'elle montre.
    entries: ['all-tables', 'collections', 'wheel', 'add-table', 'missing-media', 'roms', 'menu-media', 'migration'],
  },
  // Ce qui ne sert qu'une fois, en venant d'un autre front-end : médias de PinUP Popper, ROM copiées dans chaque table.
  migration: {
    id: 'migration',
    icon: 'import',
    get label() { return t('Migration'); },
    get detail() { return t('Reprendre les médias de PinUP Popper ou PinballX, regrouper les ROM'); },
    entries: ['media-import', 'rom-migration'],
  },
  // Ma borne : ce qui changerait si l'on installait Cyber Pinball sur une autre borne.
  borne: {
    id: 'borne',
    icon: 'cabinet',
    get label() { return t('Ma borne'); },
    get detail() { return t('Configuration, VPX, DMD et LED, VR et vision 3D, télécommande, démarrage, santé et sauvegardes'); },
    entries: ['cabinet', 'vpx', 'dmd', 'realite-virtuelle', 'phone-remote', 'demarrage', 'sante'],
  },
  vpx: {
    id: 'vpx',
    icon: 'flipper',
    label: 'VPX', // i18n-ignore : le nom du logiciel
    get detail() { return t('Réglages de VPX pour toutes les tables, autres versions installées'); },
    // Les pré-réglages (qualite-vpx.ts, 22/11/2026) en tête : un choix d'ensemble, puis les réglages un par un.
    // Puis le cadrage des tables (app/src/cadrage-menu.ts, 23/11/2026), choisi lui aussi d'un coup, sur une image.
    entries: ['vpx-presets', 'vpx-framing', 'vpx-settings', 'other-vpx', 'vpx-trial'],
  },
  // Tous les réglages du DMD ensemble (16/11/2026), et les LED (DOF) qui l'accompagnent sur la borne (20/11/2026).
  // Le DMD sur la roue reste sur la fiche de chaque table.
  dmd: {
    id: 'dmd',
    icon: 'dmd',
    get label() { return t('DMD et LED'); },
    get detail() { return t('Écran du DMD, DMD du front-end et sa couleur, DMD réel, LED et retours (DOF)'); },
    entries: ['dmd-screen', 'menu-dmd', 'dmd-color', 'hardware-dmd', 'dof'],
  },
  // Tous les réglages du casque ensemble, l'activation en tête (12/11/2026 : « les options VR doivent être
  // dans VR »), et la vision 3D, l'autre façon de voir la table en relief (20/11/2026). Le nom dit les deux ;
  // l'état de chacune et son badge BÊTA sont sur son entrée, à l'intérieur.
  'realite-virtuelle': {
    id: 'realite-virtuelle',
    icon: 'vr',
    get label() { return t('Réalité virtuelle et vision 3D'); },
    get detail() { return t('Activer le casque, caler la borne, manettes du casque, recopie sur le playfield, vision 3D, lunettes 3D'); },
    // Les lunettes 3D (anaglyphe, 21/11/2026) juste après la vision 3D : les deux se cumulent.
    entries: ['vr', 'vr-calibrate', 'vr-controllers', 'vr-mirror', 'vision3d', 'anaglyph'],
  },
  // Comment la borne démarre, et qui a le droit de faire quoi.
  demarrage: {
    id: 'demarrage',
    icon: 'auto',
    get label() { return t('Démarrage et accès'); },
    get detail() { return t('Borne dédiée, lancement au démarrage, relance par Start, mode invité'); },
    entries: ['dedicated', 'startup', 'start-relaunch', 'guest-mode'],
  },
  sante: {
    id: 'sante',
    icon: 'pulse',
    get label() { return t('Santé et sauvegardes'); },
    get detail() { return t('Santé de la borne, fiche technique, mode débogage, sauvegardes'); },
    entries: ['health', 'tech-sheet', 'debug-mode', 'backups'],
  },
  // Communauté : sa porte du Menu système, toujours là même médaillon masqué (community-menu.ts y ajoute le
  // nombre de joueurs en ligne et ce que voient les autres) ; depuis le 21/11/2026, le médaillon ouvre l'écran
  // à onglets (community-hub.ts), et ses réglages restent ici. Nommée « Amis » jusqu'au 18/11/2026.
  // Le 21/11/2026, ce qui se joue contre les autres (parties instantanées, classements, niveau) part dans l'Arène.
  amis: {
    id: 'amis',
    icon: 'friends',
    get label() { return t('Communauté'); },
    get detail() { return t('Mon profil, joueurs et amis, messages, groupes et salons, réglages'); },
    entries: ['mon-profil', 'online-players', 'messages', 'groupes-salons', 'reglages-communaute'],
  },
  // Arène (21/11/2026, arena-menu.ts) : jouer contre les autres. Son médaillon ouvre l'écran à onglets ;
  // ici, la porte de ses écrans complets.
  arene: {
    id: 'arene',
    icon: 'trophy',
    get label() { return t('Arène'); },
    get detail() { return t('Parties instantanées, classements, progression : niveau, badges, historique'); },
    entries: ['instant', 'rankings', 'progression'],
  },
  // Tout ce qui se mesure : niveau, badges, parties jouées (« Mon niveau » de la Communauté jusqu'au 21/11/2026).
  progression: {
    id: 'progression',
    icon: 'upgrade',
    get label() { return t('Progression'); },
    get detail() { return t('Niveau, badges, historique des parties'); },
    entries: ['my-level', 'badges', 'game-history'],
  },
  // Tout ce qui est « moi » : profil, et de quoi retrouver son compte sur un autre PC.
  'mon-profil': {
    id: 'mon-profil',
    icon: 'avatar',
    get label() { return t('Mon profil'); },
    get detail() { return t('Pseudo, avatar, pays, confidentialité, compte'); },
    entries: ['modifier-profil', 'confidentialite', 'compte'],
  },
  'modifier-profil': {
    id: 'modifier-profil',
    icon: 'edit',
    get label() { return t('Modifier mon profil'); },
    get detail() { return t('Pseudo, avatar, pays'); },
    entries: ['player-name', 'avatar', 'country'],
  },
  confidentialite: {
    id: 'confidentialite',
    icon: 'eye',
    get label() { return t('Confidentialité'); },
    get detail() { return t('Profil public, ce que voient les autres'); },
    entries: ['public-profile', 'account-privacy'],
  },
  // Mon compte (18/11/2026, account-menu.ts) : de quoi retrouver son compte sur un autre PC, ou le supprimer.
  compte: {
    id: 'compte',
    icon: 'account',
    get label() { return t('Mon compte'); },
    get detail() { return t('Protéger, transférer ou supprimer mon compte'); },
    entries: ['account', 'account-delete'],
  },
  'groupes-salons': {
    id: 'groupes-salons',
    icon: 'group',
    get label() { return t('Groupes et salons'); },
    get detail() { return t('Groupes publics ou privés, salons des pays'); },
    entries: ['groups', 'rooms'],
  },
  // Tous les réglages de la communauté ensemble ; « Jouer en local » en dernier (localplay.ts).
  'reglages-communaute': {
    id: 'reglages-communaute',
    icon: 'sliders',
    get label() { return t('Réglages de la communauté'); },
    get detail() { return t('Présence et salons, partage et réseau, scores des amis, notifications, jouer en local'); },
    entries: ['community-settings', 'sharing', 'live-scores', 'quiet-in-game', 'moderation', 'local-play'],
  },
  aide: {
    id: 'aide',
    icon: 'info',
    get label() { return t('Aide et infos'); },
    get detail() { return t('Commandes, nouveautés, mise à jour, retours et propositions, nous suivre, conditions, crédits'); },
    entries: ['controls', 'news', 'updates', 'feedback', 'follow', 'terms', 'community'],
  },
  // Toutes les sorties, de la plus légère à la plus lourde : le bureau, quitter ou relancer Cyber Pinball, veille, redémarrage, arrêt.
  quitter: {
    id: 'quitter',
    icon: 'exit',
    get label() { return t('Quitter ou éteindre'); },
    get detail() { return t('Bureau Windows, quitter ou redémarrer Cyber Pinball, veille, redémarrer ou éteindre la borne'); },
    entries: ['desktop', 'explorer', 'quit', 'relaunch', 'sleep', 'restart', 'shutdown'],
  },
};

export const SYSTEM_ITEMS: Readonly<Record<SystemItemId, SystemEntry>> = {
  'all-tables': { icon: 'list', get label() { return t('Toutes les tables'); } },
  'add-table': { icon: 'table-add', get label() { return t('Ajouter une table'); } },
  downloads: { icon: 'download', get label() { return t('Téléchargements'); } },
  roms: { icon: 'chip', get label() { return t('Bibliothèque de ROM'); } },
  'missing-media': { icon: 'image-download', get label() { return t('Trouver les médias manquants'); } },
  // Musique, volumes et mode attente du front-end (menu-settings.ts).
  'menu-media': { icon: 'music', get label() { return t('Son et mode attente'); } },
  // Playlists du Juke-box : import de YouTube, fichiers locaux, qualité, place, et ses réglages (app/src/jukebox-menu.ts).
  jukebox: { icon: 'jukebox', label: 'Juke-box' }, // i18n-ignore : le nom du Juke-box, le même en anglais
  // Mon compte (account-menu.ts) : protéger et transférer, pseudo, pays, ce que voient les autres, suppression.
  account: { icon: 'lock', get label() { return t('Protéger et transférer mon compte'); } },
  'player-name': { icon: 'keyboard', get label() { return t('Mon pseudo'); } },
  country: { icon: 'globe', get label() { return t('Mon pays'); } },
  'account-privacy': { icon: 'pulse', get label() { return t('Ce que voient les autres'); } },
  'account-delete': { icon: 'trash', get label() { return t('Supprimer mon compte'); } },
  // Mon niveau (level-menu.ts) : le récap des XP, en tête de Mon profil.
  'my-level': { icon: 'gauge', get label() { return t('Mon niveau'); } },
  // Joueurs (community-menu.ts) : mes amis et les demandes reçues d'abord, puis tous les joueurs ; « Mes amis »
  // et « Joueurs en ligne » réunis le 21/11/2026. L'identifiant reste celui d'avant (menu-systeme.json, téléphone).
  'online-players': { icon: 'friend-list', get label() { return t('Joueurs'); } },
  // Parties instantanées (instant-menu.ts) : le libellé dit s'il y en a une ouverte.
  instant: { icon: 'rocket', get label() { return t('Partie instantanée'); } },
  // Groupes publics ou privés (groups-menu.ts).
  groups: { icon: 'friends', get label() { return t('Groupes'); } },
  // Le salon du pays (rooms-menu.ts) : le libellé le nomme.
  rooms: { icon: 'globe', get label() { return t('Salons par pays'); } },
  // Classements des tables (rankings-menu.ts) ; la coupe est à la rubrique Arène qui les range.
  rankings: { icon: 'list', get label() { return t('Classements'); } },
  // Présence publique, salons, filtre de mots, joueurs ignorés, règles (rooms-menu.ts).
  'community-settings': { icon: 'gear', get label() { return t('Présence et salons'); } },
  // La file des signalements des salons (rooms-menu.ts) : fournie aux seuls modérateurs de la charte.
  moderation: { icon: 'alert', get label() { return t('Modération'); } },
  // La messagerie entre amis (chat-menu.ts) : la pastille rouge quand un message attend.
  messages: { icon: 'message', get label() { return t('Messages'); } },
  avatar: { icon: 'avatar', get label() { return t('Mon avatar'); } },
  // Ce que voient les joueurs qui ne sont pas mes amis, et qui a aimé mon activité (profile-menu.ts).
  'public-profile': { icon: 'thumb-up', get label() { return t('Mon profil public'); } },
  'game-history': { icon: 'clock', get label() { return t('Historique des parties'); } },
  badges: { icon: 'medal', get label() { return t('Mes badges'); } },
  sharing: { icon: 'network', get label() { return t('Partage et réseau'); } },
  'live-scores': { icon: 'dmd', get label() { return t('Scores des amis pendant la partie'); } },
  // Activité récente (activity.ts) : les notifications des derniers jours, en entier.
  activity: { icon: 'bell', get label() { return t('Activité récente'); } },
  'quiet-in-game': { icon: 'moon', get label() { return t('Masquer les notifications pendant les parties'); } },
  // Tout le social retiré d'un coup, niveaux compris (localplay.ts) ; le libellé dit l'état.
  'local-play': { icon: 'cabinet', get label() { return t('Jouer en local'); } },
  health: { icon: 'health', get label() { return t('Santé de la borne'); } },
  // Fiche technique (tech-sheet.ts) : PC, Windows, écrans, contrôleurs, logiciels, rapport à envoyer.
  'tech-sheet': { icon: 'report', get label() { return t('Fiche technique'); } },
  // Mesures de tous les écrans en direct, par-dessus l'un d'eux (debogage-menu.ts) : pour voir d'où vient un ralentissement.
  'debug-mode': { icon: 'gauge', get label() { return t('Mode débogage'); } },
  // Boutons, écrans, son, langue de la borne, configurations, assistant (frontend.ts, cabinetSetupItems).
  cabinet: { icon: 'toolbox', get label() { return t('Configuration de la borne'); } },
  // Qualité de l'image et fluidité en un choix (app/src/qualite-vpx.ts) : Auto, Performance, Équilibré, Qualité, Ultra.
  'vpx-presets': { icon: 'gauge', get label() { return t('Pré-réglages'); } },
  // Le cadrage de toutes les tables en vue borne, choisi sur une image de sa table (app/src/cadrage-menu.ts).
  'vpx-framing': { icon: 'crop', get label() { return t('Cadrage des tables'); } },
  'vpx-settings': { icon: 'sliders', get label() { return t('Réglages de VPX'); } },
  // Un VPX déjà installé sur le PC (10.8.0…), pour les tables qui le choisissent (autres-vpx.ts).
  'other-vpx': { icon: 'layers', get label() { return t('Autres versions de VPX'); } },
  // Mode d'essai de VPX (app/src/vpx-essai.ts) : la préversion suivante de VPX sur la même installation. Seulement
  // avec la clé développeur signée de la machine (devkey.ts) : absente ailleurs (entrée non fournie).
  'vpx-trial': { icon: 'flask', get label() { return t('VPX d’essai'); } },
  // Jouer dans un casque (vr.ts) : désactivée, ou dans le casque quand il est prêt.
  // L'activation, en tête de la rubrique Réalité virtuelle et vision 3D (qui porte l'icône du casque) ; son état et
  // son badge BÊTA se lisent ici, pas sur la ligne de la rubrique.
  vr: { icon: 'power', get label() { return t('Réalité virtuelle'); } },
  // Caler la borne du casque et les tables de VPX sur la vraie barre avant, aux manettes (calage.ts).
  'vr-calibrate': { icon: 'layout', get label() { return t('Caler la borne'); } },
  'vr-controllers': { icon: 'button', get label() { return t('Manettes du casque'); } },
  'vr-mirror': { icon: 'screens', get label() { return t('Recopie sur le playfield'); } },
  // La perspective des tables suit la tête du joueur (vision3d.ts) : webcam ou Kinect.
  vision3d: { icon: 'eye', get label() { return t('Vision 3D'); } },
  // La table en relief avec des lunettes à filtres colorés (anaglyph.ts), seule ou avec la vision 3D.
  anaglyph: { icon: 'glasses', get label() { return t('Lunettes 3D'); } },
  // La liste des boutons du front-end et de la partie : une aide, ouverte aussi par la touche d'aide.
  controls: { icon: 'gamepad', get label() { return t('Commandes de la borne'); } },
  // Le téléphone pilote la borne : boutons, clavier, envoi d'un fichier (app/src/phone-remote-menu.ts).
  'phone-remote': { icon: 'phone', get label() { return t('Télécommande du téléphone'); } },
  // ZeDMD, PIN2DMD, Pixelcade : choix par modèle, ZeDMD en wifi, pilotes (app/src/hardware-dmd-menu.ts).
  // Forme de l'écran (FullDMD ou DMD seul), DMD du menu et sa couleur (menu-settings.ts).
  'dmd-screen': { icon: 'screens', get label() { return t('Écran du DMD'); } },
  'menu-dmd': { icon: 'pulse', get label() { return t('DMD du front-end'); } },
  'dmd-color': { icon: 'palette', get label() { return t('Couleur du DMD'); } },
  'hardware-dmd': { icon: 'usb', get label() { return t('DMD réel'); } },
  dof: { icon: 'bulb', get label() { return t('LED et retours (DOF)'); } },
  desktop: { icon: 'desktop', get label() { return t('Bureau Windows'); } },
  // Seulement quand Cyber Pinball est le shell de Windows (borne dédiée) : à la place de « Bureau Windows ».
  explorer: { icon: 'folder', get label() { return t('Ouvrir l’Explorateur Windows'); } },
  dedicated: { icon: 'lock', get label() { return t('Borne dédiée'); } },
  startup: { icon: 'power', get label() { return t('Lancement au démarrage'); } },
  // Appui long sur Start (bouton de joystick) : Cyber Pinball rouvert depuis Windows (app/src/start-relaunch.ts).
  'start-relaunch': { icon: 'start', get label() { return t('Relance par Start'); } },
  'guest-mode': { icon: 'guest', get label() { return t('Mode invité'); } },
  collections: { icon: 'star', get label() { return t('Collections'); } },
  // Tous les réglages de la roue des tables (app/src/wheel-settings.ts) : présentation, ordre, Start, logos animés, couleur, Juke-box.
  wheel: { icon: 'wheel', get label() { return t('Roue'); } },
  updates: { icon: 'upgrade', get label() { return t('Mise à jour de Cyber Pinball'); } },
  // Les grandes nouveautés, choisies à la main (news.ts, app/src/news-menu.ts) : une chronologie.
  news: { icon: 'sparkle', get label() { return t('Nouveautés'); } },
  // Le tableau public des propositions et le formulaire des retours (app/src/feedback-menu.ts).
  feedback: { icon: 'inbox', get label() { return t('Retours et propositions'); } },
  // Facebook, YouTube, GitHub (app/src/follow-menu.ts).
  follow: { icon: 'globe', get label() { return t('Nous suivre'); } },
  terms: { icon: 'rules', get label() { return t('Conditions d’utilisation'); } },
  // Crédits de la communauté (app/src/credits-menu.ts) : les auteurs des tables de la borne, les logiciels, les sites.
  // Nommée « La communauté » jusqu'au 20/11/2026 : on la confondait avec la rubrique Communauté.
  community: { icon: 'credits', get label() { return t('Crédits'); } },
  backups: { icon: 'drive', get label() { return t('Sauvegardes'); } },
  'media-import': { icon: 'folder-download', get label() { return t('Reprendre les médias'); } },
  'rom-migration': { icon: 'link', get label() { return t('Regrouper les ROM'); } },
  // L'icône de Cyber Pinball : on le quitte ; le symbole d'alimentation est gardé pour l'arrêt du PC.
  quit: { icon: 'pinball-app', get label() { return t('Quitter Cyber Pinball'); } },
  // Ferme et rouvre Cyber Pinball sans toucher au PC (relance couverte : jamais le bureau entre les deux).
  relaunch: { icon: 'refresh', get label() { return t('Redémarrer Cyber Pinball'); } },
  // Alimentation du PC (app/src/power.ts) : chacune passe par un écran de confirmation.
  sleep: { icon: 'moon', get label() { return t('Mettre en veille'); } },
  restart: { icon: 'restart', get label() { return t('Redémarrer la borne'); } },
  shutdown: { icon: 'power', get label() { return t('Éteindre la borne'); } },
};

export function isSystemGroup(id: SystemEntryId): id is SystemGroupId {
  return (SYSTEM_GROUP_IDS as readonly string[]).includes(id);
}

export function systemEntry(id: SystemEntryId): SystemEntry {
  return isSystemGroup(id) ? SYSTEM_GROUPS[id] : SYSTEM_ITEMS[id];
}

/** Rubriques à parcourir pour atteindre une entrée, la racine exclue ([] pour une entrée de la racine) ; undefined si l'arbre ne la contient pas. */
export function systemPathOf(id: SystemEntryId): SystemGroupId[] | undefined {
  const walk = (group: SystemGroupId, trail: SystemGroupId[]): SystemGroupId[] | undefined => {
    for (const entry of SYSTEM_GROUPS[group].entries) {
      if (entry === id) return [...trail, group];
      if (isSystemGroup(entry)) {
        const found = walk(entry, [...trail, group]);
        if (found) return found;
      }
    }
    return undefined;
  };
  if (SYSTEM_ROOT_ENTRIES.includes(id)) return [];
  for (const group of SYSTEM_ROOT) {
    const found = walk(group, []);
    if (found) return found;
  }
  return undefined;
}

/** Toutes les entrées (pas les rubriques) qu'une rubrique contient, à toute profondeur. */
export function systemItemsUnder(group: SystemGroupId): SystemItemId[] {
  return SYSTEM_GROUPS[group].entries.flatMap((id) => (isSystemGroup(id) ? systemItemsUnder(id) : [id]));
}
