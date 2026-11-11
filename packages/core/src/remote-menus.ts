// Accès direct aux menus depuis le téléphone (11/11/2026). La page du téléphone montre l'écran
// ouvert à la borne et ses entrées, qu'on touche directement (message « entries »), et tous les
// menus de la borne, rangés comme le menu système, qu'on ouvre d'un toucher (message « menus »).
//
// Rien n'est recopié à la main : l'arbre vient de celui du menu système (systemmenu.ts, l'ordre et
// les rubriques ; les entrées que l'application fournit, avec leur détail et leur indisponibilité),
// les entrées d'un écran viennent de l'écran lui-même (ses actions, déjà filtrées par le mode
// invité). Un menu ajouté plus tard au menu système paraît donc tout seul sur le téléphone.
//
// Le téléphone ne renvoie que des identifiants : un menu de cet arbre (« open », remoteMenuTarget),
// ou le rang d'une entrée et la version de l'écran qu'il a reçu (« pick »). La borne vérifie tout :
// identifiant connu, menu fourni, mode invité (le menu système fermé à l'invité l'est aussi au
// téléphone, qui ne déverrouille rien), écran inchangé.

import { ICON_NAMES, type IconName } from './icons';
import { REMOTE_ENTRIES_MAX } from './remote';
import { isSystemGroup, SYSTEM_GROUPS, SYSTEM_ITEMS, SYSTEM_ROOT_ENTRIES, type SystemEntryId, type SystemItemId } from './systemmenu';

/** Ce que le téléphone montre d'une entrée : jamais de quoi la retrouver sur le disque (chemin, clé). */
export interface RemoteEntry {
  label: string;
  detail?: string;
  icon?: IconName;
  /** Indisponible : grisée, `detail` dit pourquoi. Elle se touche quand même, comme Start à la borne, qui le redit. */
  quiet?: boolean;
  /** Quelque chose attend l'utilisateur ici : la pastille rouge de la borne. */
  attention?: boolean;
  /** Pastille après le libellé (« BÊTA »), déjà dans la langue de l'interface. */
  badge?: string;
  /** L'entrée qui ramène en arrière (Exit à la borne). */
  back?: boolean;
}

/**
 * Ce que montre la borne, pour la liste du téléphone :
 * - `screen` : un écran du menu (menu système, fiche, réglages…), ses actions ;
 * - `wheel` : le menu des tables, les tables de la collection (et le médaillon du Juke-box) ;
 * - `choice` : une liste de choix du clavier à l'écran (fabricant…) ;
 * - `ingame` : les réglages en partie, ouverts pendant une partie ;
 * - `busy` : une opération en cours (`note` la dit), rien ne se touche ;
 * - `none` : un écran sans entrée à toucher (le Juke-box, une partie) ; `note` dit quoi faire.
 */
export type RemoteEntriesKind = 'screen' | 'wheel' | 'choice' | 'ingame' | 'busy' | 'none';

export interface RemoteEntries {
  kind: RemoteEntriesKind;
  title: string;
  icon?: IconName;
  items: RemoteEntry[];
  /** Entrée choisie à la borne (-1 : aucune). */
  current: number;
  /** Une phrase sous le titre : ce qui se passe (opération en cours), ou quoi faire (« Touchez une table, puis encore pour… »). */
  note?: string;
  /**
   * Pendant une partie, les boutons du téléphone pilotent le menu ouvert (réglages en partie) ;
   * sans cela, ils ne font rien (VPX a les boutons).
   */
  buttons?: boolean;
  /** Ouvrir les réglages en partie depuis le téléphone (id « in-game ») : vrai, ou pourquoi c'est impossible. */
  inGame?: true | string;
}

/** Un menu de l'arbre envoyé au téléphone : une rubrique a ses entrées, une entrée s'ouvre à la borne. */
export interface RemoteMenuNode extends RemoteEntry {
  id: string;
  entries?: RemoteMenuNode[];
}

/** L'arbre des menus pour le téléphone ; `locked` : le menu système est fermé (mode invité), et pourquoi. */
export interface RemoteMenus {
  nodes: RemoteMenuNode[];
  locked?: string;
}

/** Ce que l'application dit d'une entrée du menu système qu'elle fournit (library.ts, systemItems). */
export interface RemoteProvidedItem {
  label?: string;
  detail?: string;
  tone?: string;
  attention?: boolean;
  badge?: string;
}

/** Identifiants qui ne sont pas des entrées du menu système : le menu des tables, les réglages en partie. */
export const REMOTE_MENU_SPECIALS = ['wheel', 'in-game'] as const;
export type RemoteMenuSpecial = (typeof REMOTE_MENU_SPECIALS)[number];

const LABEL_MAX = 120;
const DETAIL_MAX = 200;

/** Texte borné, sans caractère de contrôle, pour le téléphone. */
export function remoteText(text: unknown, max: number): string {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, max);
}

const isIcon = (name: unknown): name is IconName => typeof name === 'string' && (ICON_NAMES as readonly string[]).includes(name);

/** Une entrée telle qu'elle part au téléphone : textes bornés, icône du registre, rien d'autre. */
export function toRemoteEntry(a: { label: string; detail?: string; icon?: string; tone?: string; attention?: boolean; badge?: string; back?: boolean }): RemoteEntry {
  const detail = a.detail ? remoteText(a.detail, DETAIL_MAX) : '';
  return {
    label: remoteText(a.label, LABEL_MAX),
    ...(detail ? { detail } : {}),
    ...(isIcon(a.icon) ? { icon: a.icon } : {}),
    ...(a.tone === 'quiet' ? { quiet: true } : {}),
    ...(a.attention ? { attention: true } : {}),
    ...(a.badge ? { badge: remoteText(a.badge, 24) } : {}),
    ...(a.back ? { back: true } : {}),
  };
}

/** Liste bornée (REMOTE_ENTRIES_MAX) ; `current` ramené dans la liste. */
export function remoteEntries(e: RemoteEntries): RemoteEntries {
  const items = e.items.slice(0, REMOTE_ENTRIES_MAX);
  return { ...e, title: remoteText(e.title, LABEL_MAX), ...(e.note ? { note: remoteText(e.note, 300) } : {}), items, current: e.current >= 0 && e.current < items.length ? e.current : -1 };
}

/**
 * L'arbre des menus pour le téléphone, d'après celui du menu système : chaque rubrique et chaque
 * entrée que l'application fournit (`provided` : undefined pour une entrée qu'elle ne fournit pas
 * sur cette borne, comme « Bureau Windows » sur une borne dédiée), dans l'ordre de la borne. Chaque
 * rubrique y est, comme à la borne ; la pastille rouge d'une entrée remonte à sa rubrique.
 */
export function remoteMenuTree(provided: (id: SystemItemId) => RemoteProvidedItem | undefined): RemoteMenuNode[] {
  const node = (id: SystemEntryId): RemoteMenuNode | undefined => {
    if (isSystemGroup(id)) {
      const g = SYSTEM_GROUPS[id];
      // Une rubrique vide reste, comme à la borne (systemEntries garde toutes les rubriques).
      const entries = g.entries.map(node).filter((n): n is RemoteMenuNode => Boolean(n));
      return { id, ...toRemoteEntry({ label: g.label, detail: g.detail, icon: g.icon, attention: entries.some((e) => e.attention) }), entries };
    }
    const item = provided(id);
    if (!item) return undefined;
    return { id, ...toRemoteEntry({ label: item.label ?? SYSTEM_ITEMS[id].label, detail: item.detail, icon: SYSTEM_ITEMS[id].icon, tone: item.tone, attention: item.attention, badge: item.badge }) };
  };
  return SYSTEM_ROOT_ENTRIES.map(node).filter((n): n is RemoteMenuNode => Boolean(n));
}

/** Ce que désigne un identifiant reçu du téléphone : une entrée ou une rubrique du menu système, ou un menu à part ; undefined sinon. */
export function remoteMenuTarget(id: string): { kind: 'system'; id: SystemEntryId } | { kind: 'wheel' } | { kind: 'in-game' } | undefined {
  if (id === 'wheel' || id === 'in-game') return { kind: id };
  if (Object.hasOwn(SYSTEM_GROUPS, id) || Object.hasOwn(SYSTEM_ITEMS, id)) return { kind: 'system', id: id as SystemEntryId };
  return undefined;
}
