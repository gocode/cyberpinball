// Collections du menu des tables (packages/core/src/collections.ts) : la collection active, la
// table gardée dans chacune, les MagnaSave qui passent à la voisine, la liste montrée quelques
// secondes, et le mode invité qui peut en imposer une.
//
// La table choisie reste une table de toutes les tables (frontend.ts, state.index) ; la roue,
// la liste, le compteur et le mode attente ne montrent que celles de la collection active.

import {
  buildCollections,
  collectionsPanel,
  findCollection,
  loadCollections,
  saveCollections,
  shelfView,
  ShelfMemory,
  stepCollection,
  type Collection,
  type CollectionsPanel,
  PANEL_BUDGET,
  type FriendsShelf,
  type ShelfView,
  type TableEntry,
} from '@cyberpinball/core';

/** Durée de la liste des collections après le dernier MagnaSave, puis son fondu (revue de Codex, 06/11/2026). */
export const COLLECTIONS_PANEL_MS = 4000;
const PANEL_FADE_MS = 160;
/** Les amis en ligne et leurs tables ne se recalculent pas à chaque rendu. */
const FRIENDS_CACHE_MS = 2000;

export interface CollectionsHost {
  dataDir: string;
  tables(): readonly TableEntry[];
  /** La table choisie dans le menu. */
  selected(): TableEntry | undefined;
  select(table: TableEntry): void;
  /** Ce que le réseau sait des tables jouables avec un ami en ligne ; absent : réseau coupé. */
  friends?(tables: readonly TableEntry[]): FriendsShelf;
  /** Collection imposée par le mode invité. */
  guestCollection(): string | undefined;
  /** Rang de la table de départ dans une collection (« Table au démarrage »). */
  startIndex(tables: readonly TableEntry[]): number;
  redraw(): void;
  now?(): number;
}

export interface CollectionsMenu {
  /** Les collections du moment (vides comprises). */
  list(): Collection<TableEntry>[];
  /** La collection montrée : celle du mode invité s'il en impose une, sinon l'active. */
  current(): Collection<TableEntry>;
  /**
   * Ses tables, et la place de la table choisie ; `adjust` (au menu des tables) : une table choisie
   * hors de la collection (retirée des favoris, lancée depuis « Toutes les tables ») y est ramenée.
   */
  shelf(adjust?: boolean): { tables: TableEntry[]; index: number };
  /** Table voisine dans la collection (flippers, roue cliquée). */
  move(offset: number): TableEntry | undefined;
  /** MagnaSave : la collection voisine, en sautant les vides ; false si rien n'a changé. */
  step(direction: -1 | 1): boolean;
  /** Clic sur une ligne de la liste : cette collection, si elle n'est pas vide. */
  choose(id: string): boolean;
  /** La collection imposée par le mode invité (aucun changement permis). */
  locked(): boolean;
  /** Au démarrage : la table de départ, dans la collection active. */
  start(): void;
  /** Les tables ou leurs .info ont changé (ajout, favori, partie jouée) : tout se recalcule. */
  invalidate(): void;
  /** Ce que le playfield dessine : le repère, et la liste quand elle est montrée. */
  view(layout: keyof typeof PANEL_BUDGET, panel?: boolean): { shelf: ShelfView; collections?: CollectionsPanel & { leaving?: boolean } };
  /** Un flipper : la liste des collections se ferme aussitôt. */
  hidePanel(): void;
  dispose(): void;
}

export function createCollectionsMenu(host: CollectionsHost): CollectionsMenu {
  const now = () => host.now?.() ?? Date.now();
  let active = loadCollections(host.dataDir).active as string;
  const memory = new ShelfMemory();
  let cache: { tables: readonly TableEntry[]; list: Collection<TableEntry>[] } | undefined;
  let friendsCache: { at: number; tables: readonly TableEntry[]; value: FriendsShelf } | undefined;
  let panelUntil = 0;
  let panelTimer: NodeJS.Timeout | undefined;
  let fadeTimer: NodeJS.Timeout | undefined;

  function friends(tables: readonly TableEntry[]): FriendsShelf | undefined {
    if (!host.friends) return undefined;
    if (friendsCache && friendsCache.tables === tables && now() - friendsCache.at < FRIENDS_CACHE_MS) return friendsCache.value;
    friendsCache = { at: now(), tables, value: host.friends(tables) };
    return friendsCache.value;
  }

  function list(): Collection<TableEntry>[] {
    // Les amis en ligne changent sans prévenir : la liste se refait au plus toutes les deux secondes.
    // Les tables relues (ajout, favori, partie jouée) sont un nouveau tableau : tout se refait.
    const tables = host.tables();
    if (cache && friendsCache && now() - friendsCache.at >= FRIENDS_CACHE_MS) cache = undefined;
    if (cache?.tables !== tables) {
      const f = friends(tables);
      cache = { tables, list: buildCollections(tables, f ? { friends: f } : {}) };
    }
    return cache.list;
  }

  function current(): Collection<TableEntry> {
    const all = list();
    const forced = host.guestCollection();
    const wanted = findCollection(all, forced ?? active);
    // Une collection devenue vide (dernier favori retiré, ami parti) : Toutes, jusqu'à ce qu'on en change.
    return wanted.tables.length ? wanted : all[0]!;
  }

  function shelf(adjust = true): { tables: TableEntry[]; index: number } {
    const c = current();
    const selected = host.selected();
    let index = selected ? c.tables.indexOf(selected) : -1;
    if (index < 0 && c.tables.length && !adjust) index = Math.min(memory.indexIn(c.id, c.tables), c.tables.length - 1);
    else if (index < 0 && c.tables.length) {
      index = memory.indexIn(c.id, c.tables);
      host.select(c.tables[index]!);
    }
    return { tables: c.tables, index: Math.max(0, index) };
  }

  function remember(): void {
    const c = current();
    const selected = host.selected();
    const at = selected ? c.tables.indexOf(selected) : -1;
    if (selected && at >= 0) memory.remember(c.id, selected.file, at);
  }

  function showPanel(): void {
    panelUntil = now() + COLLECTIONS_PANEL_MS;
    clearTimeout(panelTimer);
    clearTimeout(fadeTimer);
    panelTimer = setTimeout(() => host.redraw(), COLLECTIONS_PANEL_MS);
    fadeTimer = setTimeout(() => host.redraw(), COLLECTIONS_PANEL_MS + PANEL_FADE_MS);
  }

  function open(next: Collection<TableEntry>): boolean {
    if (next.id === current().id) {
      showPanel();
      return false;
    }
    remember();
    active = next.id;
    try {
      saveCollections(host.dataDir, { active: next.id });
    } catch (error) {
      console.log(`Collections : réglage non enregistré (${(error as Error).message}).`);
    }
    const index = memory.indexIn(next.id, next.tables, host.startIndex(next.tables));
    if (next.tables[index]) host.select(next.tables[index]!);
    console.log(`Collections : ${next.id} (${next.tables.length}).`);
    showPanel();
    return true;
  }

  return {
    list,
    current,
    shelf,
    move(offset) {
      const s = shelf();
      if (!s.tables.length) return undefined;
      const index = (s.index + offset + s.tables.length * 10) % s.tables.length;
      const table = s.tables[index]!;
      memory.remember(current().id, table.file, index);
      return table;
    },
    step(direction) {
      if (host.guestCollection()) return false;
      return open(stepCollection(list(), current().id, direction));
    },
    choose(id) {
      if (host.guestCollection()) return false;
      const c = findCollection(list(), id);
      return c.id === id && c.tables.length > 0 && open(c);
    },
    locked: () => Boolean(host.guestCollection()),
    start() {
      const c = current();
      const table = c.tables[host.startIndex(c.tables)];
      if (table) host.select(table);
    },
    invalidate() {
      cache = undefined;
      friendsCache = undefined;
    },
    view(layout, panel = true) {
      const c = current();
      const locked = Boolean(host.guestCollection());
      const left = panelUntil - now();
      const collections = panel && left > -PANEL_FADE_MS && !locked ? { ...collectionsPanel(list(), c.id, PANEL_BUDGET[layout]), ...(left <= 0 ? { leaving: true } : {}) } : undefined;
      return { shelf: shelfView(c, locked), ...(collections ? { collections } : {}) };
    },
    hidePanel() {
      if (panelUntil <= now() - PANEL_FADE_MS) return;
      panelUntil = 0;
      clearTimeout(panelTimer);
      clearTimeout(fadeTimer);
    },
    dispose() {
      clearTimeout(panelTimer);
      clearTimeout(fadeTimer);
    },
  };
}
