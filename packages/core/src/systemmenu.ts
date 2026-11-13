// Menu système (Exit, Tab ou roue dentée) : cinq rubriques au lieu d'une longue liste.
// Amis, Tables, Médias, Borne, Cyber Pinball (Téléchargements entre Médias et Borne) ; ce qui ne
// sert qu'une fois, en venant d'un autre frontend (médias de PinUP Popper, ROM copiées dans
// chaque table), est rangé à part dans « Migration », au fond de la rubrique Cyber Pinball.
//
// Ce module ne décrit que l'arbre : rubriques, ordre, libellé et icône de chaque entrée.
// L'application fournit ce que fait chaque entrée (app/src/library.ts, frontend.ts) ; le
// manuel et les textes qui nomment un chemin (« Menu système > Borne > … ») sont relus par
// systemmenu.test.ts contre cet arbre.

import { t } from './i18n';
import type { IconName } from './icons';

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
  'online-players',
  'community-settings',
  'moderation',
  'messages',
  'public-profile',
  'friends',
  'avatar',
  'game-history',
  'find-player',
  'friend-requests',
  'badges',
  'sharing',
  'live-scores',
  'activity',
  'quiet-in-game',
  'health',
  'tech-sheet',
  'cabinet',
  'vpx-settings',
  'vision3d',
  'vr',
  'vr-calibrate',
  'vr-controllers',
  'vr-mirror',
  'controls',
  'phone-remote',
  'dof',
  'desktop',
  'explorer',
  'dedicated',
  'startup',
  'start-relaunch',
  'guest-mode',
  'language',
  'updates',
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

/** Rubriques (et sous-rubrique) : l'arbre les ouvre lui-même. */
export const SYSTEM_GROUP_IDS = ['tables', 'medias', 'amis', 'borne', 'realite-virtuelle', 'cyberpinball', 'migration'] as const;
export type SystemGroupId = (typeof SYSTEM_GROUP_IDS)[number];

export type SystemEntryId = SystemItemId | SystemGroupId;

export interface SystemEntry {
  /** Nom de l'entrée, tel que le manuel l'écrit dans un chemin (« Menu système > Borne »). */
  readonly label: string;
  /** Icône de l'entrée, et en titre des écrans qui s'en ouvrent (registre app/renderer/icons.js). */
  readonly icon: IconName;
}

export interface SystemGroup extends SystemEntry {
  readonly id: SystemGroupId;
  /** Ce qu'on y trouve, sous le nom de la rubrique. */
  readonly detail: string;
  readonly entries: readonly SystemEntryId[];
}

/** Rubriques du menu système, dans l'ordre. */
export const SYSTEM_ROOT: readonly SystemGroupId[] = ['amis', 'tables', 'medias', 'borne', 'cyberpinball'];

/**
 * Entrées montrées aussi à la racine, parmi les rubriques : Activité récente, les notifications de
 * tout Cyber Pinball (amis, téléchargements, mises à jour), et Téléchargements, comme le
 * gestionnaire de téléchargements d'une console, et Télécommande du téléphone (06/11/2026 : rangée
 * seulement dans Borne, on ne la trouvait pas), et le Juke-box (09/11/2026 : ses playlists se gèrent
 * depuis « Menu système > Juke-box », chemin donné par le médaillon de la roue), et les Collections
 * (10/11/2026 : sur une borne dont les MagnaSave ne répondent pas, Exit puis Collections). Elles gardent leur
 * place dans leur rubrique (Cyber Pinball > Activité récente, Médias > Juke-box, Tables >
 * Téléchargements, Borne > Télécommande du téléphone).
 */
export const SYSTEM_ROOT_SHORTCUTS: readonly SystemItemId[] = ['activity', 'collections', 'jukebox', 'downloads', 'phone-remote'];

/**
 * La racine du menu système telle qu'elle s'affiche : Activité récente en tête (elle couvre
 * plusieurs rubriques), Collections, puis Amis, Tables, Médias, Juke-box, Téléchargements, Télécommande du
 * téléphone, Borne, Cyber Pinball (ordre choisi le 29/10/2026, Juke-box ajouté le 09/11/2026). systemmenu.test.ts vérifie qu'elle reprend
 * SYSTEM_ROOT dans son ordre et chaque raccourci une fois.
 */
export const SYSTEM_ROOT_ENTRIES: readonly SystemEntryId[] = ['activity', 'collections', 'amis', 'tables', 'medias', 'jukebox', 'downloads', 'phone-remote', 'borne', 'cyberpinball'];

export const SYSTEM_GROUPS: Readonly<Record<SystemGroupId, SystemGroup>> = {
  tables: {
    id: 'tables',
    icon: 'tables',
    get label() { return t('Tables'); },
    get detail() { return t('Toutes les tables et leur fiche, collections, réglages de la roue, ajouter une table, téléchargements, bibliothèque de ROM'); },
    // La roue à côté des collections qu'elle montre (12/11/2026 : « toutes les options de la roue dans un même menu »).
    entries: ['all-tables', 'collections', 'wheel', 'add-table', 'downloads', 'roms'],
  },
  medias: {
    id: 'medias',
    icon: 'image',
    get label() { return t('Médias'); },
    get detail() { return t('Images et vidéos des tables, musique et mode attente du menu, Juke-box'); },
    entries: ['missing-media', 'menu-media', 'jukebox'],
  },
  // Réseau des bornes (social.ts) : les amis, l'annuaire des joueurs, les badges, le partage.
  amis: {
    id: 'amis',
    icon: 'friends',
    get label() { return t('Amis'); },
    get detail() { return t('Messages, mes amis, mon avatar, mon profil public, historique des parties, trouver un joueur, demandes, badges, partage'); },
    entries: ['online-players', 'messages', 'friends', 'avatar', 'public-profile', 'game-history', 'find-player', 'friend-requests', 'badges', 'community-settings', 'moderation', 'sharing', 'live-scores', 'quiet-in-game'],
  },
  borne: {
    id: 'borne',
    icon: 'cabinet',
    get label() { return t('Borne'); },
    get detail() { return t('Santé, fiche technique, boutons, écrans, son, réglages de VPX, réalité virtuelle, vision 3D, télécommande du téléphone, bureau Windows, mode invité'); },
    entries: ['health', 'tech-sheet', 'cabinet', 'vpx-settings', 'vision3d', 'realite-virtuelle', 'controls', 'phone-remote', 'dof', 'desktop', 'explorer', 'dedicated', 'startup', 'start-relaunch', 'guest-mode'],
  },
  // Tous les réglages du casque ensemble, l'activation en tête (12/11/2026 : « les options VR doivent être
  // dans VR », règle générale : un réglage est dans la rubrique de la fonction qu'il règle).
  'realite-virtuelle': {
    id: 'realite-virtuelle',
    icon: 'vr',
    get label() { return t('Réalité virtuelle'); },
    get detail() { return t('Activer le casque, caler la borne, manettes du casque, recopie sur le playfield'); },
    entries: ['vr', 'vr-calibrate', 'vr-controllers', 'vr-mirror'],
  },
  cyberpinball: {
    id: 'cyberpinball',
    icon: 'pinball-app',
    label: 'Cyber Pinball', // i18n-ignore : le nom de l'application
    get detail() { return t('Langue, mise à jour, activité récente, sauvegardes, migration, conditions d’utilisation, la communauté, quitter ou redémarrer, veille et extinction'); },
    // Les sorties à la fin, de la plus légère à la plus lourde : quitter ou relancer Cyber Pinball, veille, redémarrage, arrêt.
    entries: ['language', 'updates', 'activity', 'backups', 'migration', 'terms', 'community', 'quit', 'relaunch', 'sleep', 'restart', 'shutdown'],
  },
  migration: {
    id: 'migration',
    icon: 'import',
    get label() { return t('Migration'); },
    get detail() { return t('Reprendre les médias de PinUP Popper ou PinballX, regrouper les ROM'); },
    entries: ['media-import', 'rom-migration'],
  },
};

export const SYSTEM_ITEMS: Readonly<Record<SystemItemId, SystemEntry>> = {
  'all-tables': { icon: 'list', get label() { return t('Toutes les tables'); } },
  'add-table': { icon: 'table-add', get label() { return t('Ajouter une table'); } },
  downloads: { icon: 'download', get label() { return t('Téléchargements'); } },
  roms: { icon: 'chip', get label() { return t('Bibliothèque de ROM'); } },
  'missing-media': { icon: 'image-download', get label() { return t('Trouver les médias manquants'); } },
  'menu-media': { icon: 'music', get label() { return t('Médias, son et attente'); } },
  // Playlists du Juke-box : import de YouTube, fichiers locaux, qualité, place (app/src/jukebox-menu.ts).
  jukebox: { icon: 'jukebox', label: 'Juke-box' }, // i18n-ignore : le nom du Juke-box, le même en anglais
  // La messagerie entre amis (chat-menu.ts) : en tête de la rubrique, la pastille rouge quand un message attend.
  // Joueurs en ligne, amis ou non (community-menu.ts) : en tête de la rubrique Amis.
  'online-players': { icon: 'globe', get label() { return t('Joueurs en ligne'); } },
  // Réglages de la communauté (rooms-menu.ts) : présence publique, salons, filtre de mots, joueurs ignorés, règles.
  'community-settings': { icon: 'sliders', get label() { return t('Réglages de la communauté'); } },
  // La file des signalements des salons (rooms-menu.ts) : fournie aux seuls modérateurs de la charte.
  moderation: { icon: 'alert', get label() { return t('Modération'); } },
  messages: { icon: 'message', get label() { return t('Messages'); } },
  friends: { icon: 'friend-list', get label() { return t('Mes amis'); } },
  avatar: { icon: 'avatar', get label() { return t('Mon avatar'); } },
  // Ce que voient les joueurs qui ne sont pas mes amis, et qui a aimé mon activité (profile-menu.ts).
  'public-profile': { icon: 'eye', get label() { return t('Mon profil public'); } },

  'game-history': { icon: 'clock', get label() { return t('Historique des parties'); } },
  'find-player': { icon: 'friend-add', get label() { return t('Trouver un joueur'); } },
  'friend-requests': { icon: 'friend-request', get label() { return t('Demandes d’amis'); } },
  badges: { icon: 'medal', get label() { return t('Mes badges'); } },
  sharing: { icon: 'network', get label() { return t('Partage et réseau'); } },
  'live-scores': { icon: 'dmd', get label() { return t('Scores des amis pendant la partie'); } },
  // Activité récente (activity.ts) : les notifications des derniers jours, en entier.
  activity: { icon: 'bell', get label() { return t('Activité récente'); } },
  // La lune du « ne pas déranger » : la cloche est à Activité récente, dans la même rubrique.
  'quiet-in-game': { icon: 'moon', get label() { return t('Masquer les notifications pendant les parties'); } },
  health: { icon: 'health', get label() { return t('Santé de la borne'); } },
  // Fiche technique (tech-sheet.ts) : PC, Windows, écrans, contrôleurs, logiciels, rapport à envoyer.
  'tech-sheet': { icon: 'report', get label() { return t('Fiche technique'); } },
  cabinet: { icon: 'toolbox', get label() { return t('Configuration de la borne'); } },
  'vpx-settings': { icon: 'sliders', get label() { return t('Réglages de VPX'); } },
  // Jouer dans un casque (vr.ts) : désactivée, ou dans le casque quand il est prêt.
  // L'activation, en tête de la rubrique Réalité virtuelle (qui porte l'icône du casque).
  vr: { icon: 'power', get label() { return t('Réalité virtuelle'); } },
  // Caler la borne du casque et les tables de VPX sur la vraie barre avant, aux manettes (calage.ts).
  'vr-calibrate': { icon: 'layout', get label() { return t('Caler la borne'); } },
  'vr-controllers': { icon: 'button', get label() { return t('Manettes du casque'); } },
  'vr-mirror': { icon: 'screens', get label() { return t('Recopie sur le playfield'); } },
  // La perspective des tables suit la tête du joueur (vision3d.ts) : webcam ou Kinect.
  vision3d: { icon: 'eye', get label() { return t('Vision 3D'); } },
  controls: { icon: 'gamepad', get label() { return t('Commandes de la borne'); } },
  // Le téléphone pilote la borne : boutons, clavier, envoi d'un fichier (app/src/phone-remote-menu.ts).
  'phone-remote': { icon: 'phone', get label() { return t('Télécommande du téléphone'); } },
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
  // Nommée dans les deux langues, pour qu'on la retrouve quelle que soit la langue affichée.
  language: { icon: 'language', label: 'Langue / Language' }, // i18n-ignore
  updates: { icon: 'upgrade', get label() { return t('Mise à jour de Cyber Pinball'); } },
  terms: { icon: 'rules', get label() { return t('Conditions d’utilisation'); } },
  // Crédits de la communauté (app/src/credits-menu.ts) : les auteurs des tables de la borne, les logiciels, les sites.
  community: { icon: 'credits', get label() { return t('La communauté'); } },
  backups: { icon: 'drive', get label() { return t('Sauvegardes'); } },
  'media-import': { icon: 'folder-download', get label() { return t('Reprendre les médias'); } },
  'rom-migration': { icon: 'link', get label() { return t('Regrouper les ROM'); } },
  // Le symbole d'alimentation est gardé pour l'arrêt du PC.
  quit: { icon: 'exit', get label() { return t('Quitter Cyber Pinball'); } },
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

/** Rubriques à parcourir pour atteindre une entrée, la racine exclue ; undefined si l'arbre ne la contient pas. */
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
  for (const group of SYSTEM_ROOT) {
    if (group === id) return [];
    const found = walk(group, []);
    if (found) return found;
  }
  return undefined;
}
