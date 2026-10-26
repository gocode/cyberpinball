// Menu système (Exit, Tab ou roue dentée) : quatre rubriques au lieu d'une longue liste.
// Tables, Médias, Borne, Cyber Pinball ; ce qui ne sert qu'une fois, en venant d'un autre
// frontend (médias de PinUP Popper, ROM copiées dans chaque table), est rangé à part dans
// « Migration », au fond de la rubrique Cyber Pinball.
//
// Ce module ne décrit que l'arbre : rubriques, ordre, libellé et icône de chaque entrée.
// L'application fournit ce que fait chaque entrée (app/src/library.ts, frontend.ts) ; le
// manuel et les textes qui nomment un chemin (« Menu système > Borne > … ») sont relus par
// systemmenu.test.ts contre cet arbre.

import { t } from './i18n';
import type { IconName } from './icons';

/** Entrées fournies par l'application. */
export const SYSTEM_ITEM_IDS = [
  'add-table',
  'downloads',
  'roms',
  'missing-media',
  'menu-media',
  'health',
  'cabinet',
  'vpx-settings',
  'controls',
  'desktop',
  'explorer',
  'dedicated',
  'language',
  'updates',
  'media-import',
  'rom-migration',
  'quit',
] as const;
export type SystemItemId = (typeof SYSTEM_ITEM_IDS)[number];

/** Rubriques (et sous-rubrique) : l'arbre les ouvre lui-même. */
export const SYSTEM_GROUP_IDS = ['tables', 'medias', 'borne', 'cyberpinball', 'migration'] as const;
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
export const SYSTEM_ROOT: readonly SystemGroupId[] = ['tables', 'medias', 'borne', 'cyberpinball'];

export const SYSTEM_GROUPS: Readonly<Record<SystemGroupId, SystemGroup>> = {
  tables: {
    id: 'tables',
    icon: 'tables',
    get label() { return t('Tables'); },
    get detail() { return t('Ajouter une table, téléchargements, bibliothèque de ROM'); },
    entries: ['add-table', 'downloads', 'roms'],
  },
  medias: {
    id: 'medias',
    icon: 'image',
    get label() { return t('Médias'); },
    get detail() { return t('Images et vidéos des tables, musique et mode attente du menu'); },
    entries: ['missing-media', 'menu-media'],
  },
  borne: {
    id: 'borne',
    icon: 'cabinet',
    get label() { return t('Borne'); },
    get detail() { return t('Boutons, écrans, son, réglages de VPX, bureau Windows'); },
    entries: ['health', 'cabinet', 'vpx-settings', 'controls', 'desktop', 'explorer', 'dedicated'],
  },
  cyberpinball: {
    id: 'cyberpinball',
    icon: 'pinball-app',
    label: 'Cyber Pinball', // i18n-ignore : le nom de l'application
    get detail() { return t('Langue, mise à jour, migration, quitter'); },
    entries: ['language', 'updates', 'migration', 'quit'],
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
  'add-table': { icon: 'table-add', get label() { return t('Ajouter une table'); } },
  downloads: { icon: 'download', get label() { return t('Téléchargements'); } },
  roms: { icon: 'chip', get label() { return t('Bibliothèque de ROM'); } },
  'missing-media': { icon: 'image-download', get label() { return t('Trouver les médias manquants'); } },
  'menu-media': { icon: 'music', get label() { return t('Médias, son et attente'); } },
  health: { icon: 'health', get label() { return t('Santé de la borne'); } },
  cabinet: { icon: 'toolbox', get label() { return t('Configuration de la borne'); } },
  'vpx-settings': { icon: 'sliders', get label() { return t('Réglages de VPX'); } },
  controls: { icon: 'gamepad', get label() { return t('Commandes de la borne'); } },
  desktop: { icon: 'desktop', get label() { return t('Bureau Windows'); } },
  // Seulement quand Cyber Pinball est le shell de Windows (borne dédiée) : à la place de « Bureau Windows ».
  explorer: { icon: 'folder', get label() { return t('Ouvrir l’Explorateur Windows'); } },
  dedicated: { icon: 'lock', get label() { return t('Borne dédiée'); } },
  // Nommée dans les deux langues, pour qu'on la retrouve quelle que soit la langue affichée.
  language: { icon: 'language', label: 'Langue / Language' }, // i18n-ignore
  updates: { icon: 'upgrade', get label() { return t('Mise à jour de Cyber Pinball'); } },
  'media-import': { icon: 'folder-download', get label() { return t('Reprendre les médias'); } },
  'rom-migration': { icon: 'link', get label() { return t('Regrouper les ROM'); } },
  // Le symbole d'alimentation est gardé pour l'arrêt du PC.
  quit: { icon: 'exit', get label() { return t('Quitter Cyber Pinball'); } },
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
