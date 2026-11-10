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
  type CollectionsSettings,
  type MyCollection,
  addMyCollection,
  renameMyCollection,
  removeMyCollection,
  setTableInMyCollection,
  t,
  tn,
  PANEL_BUDGET,
  type FriendsShelf,
  type ShelfView,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';

/**
 * Menu système > Collections (à la racine, et dans Tables) : la même liste que les MagnaSave, à
 * choisir aux flippers et à Start, pour une borne dont les MagnaSave ne répondent pas (PinCab,
 * 06-10/11/2026). Une collection vide reste dans la liste, grisée avec sa raison ; Start n'y fait
 * rien. En dessous : créer une collection personnelle, gérer les siennes, et choisir les boutons
 * qui changent de collection sur la roue.
 */
export function createCollectionsItem(host: {
  collections: CollectionsMenu;
  library: { openCustom(build: () => Built, at?: number): void; openSystem(): void; leave(): void; openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void };
  /** Les boutons qui changent de collection, en clair (« MagnaSave gauche / droit », « Bouton 9 / 10 du joystick »), ou undefined : aucun. */
  keysLabel(): string | undefined;
  /** Choisir les boutons des collections : l'écran qui attend les deux appuis ; `back` y ramène. */
  captureKeys(back: () => void): void;
}): ProvidedSystemItem {
  const lib = host.library;
  const groupTitle = (g: string) => (g === 'mine' ? t('Mes collections') : g === 'maker' ? t('Fabricants') : g === 'decade' ? t('Décennies') : undefined);

  function open(): void {
    lib.openCustom(build, Math.max(0, host.collections.list().findIndex((c) => c.id === host.collections.current().id)));
  }

  function build(): Built {
    const back = () => lib.openSystem();
    const current = host.collections.current().id;
    // Une ligne par collection, sous son intertitre, reliée à son action : la liste se parcourt aux
    // flippers, Start l'affiche sur la roue (comme « Jouer avec un ami »).
    const actions: Action[] = [];
    const sections: Section[] = [];
    let group: string | undefined;
    for (const c of host.collections.list()) {
      if (c.group !== group || !sections.length) {
        group = c.group;
        const title = groupTitle(c.group);
        sections.push({ ...(title ? { title } : {}), rows: [] });
      }
      const count = c.tables.length;
      const index =
        actions.push({
          label: c.label,
          key: `collection:${c.id}`,
          run: () => {
            if (!count) return;
            host.collections.choose(c.id);
            lib.leave();
          },
        }) - 1;
      const detail = count ? [tn(count, '{n} table', '{n} tables'), c.id === current ? t('affichée sur la roue') : undefined, c.detail].filter(Boolean).join(' · ') : (c.reason ?? '');
      sections[sections.length - 1]!.rows.push({ text: c.label, detail, icon: c.icon as Row['icon'], tone: !count ? 'quiet' : c.id === current ? 'ok' : undefined, action: index, pick: true });
    }
    const reopen = () => lib.openCustom(build);
    actions.push({
      label: t('Nouvelle collection…'),
      detail: t('Un nom, puis « Ajouter à une collection… » sur la fiche de chaque table'),
      icon: 'plus',
      run: () =>
        lib.openPrompt(t('Nouvelle collection'), t('Nom de la collection'), '', (name) => {
          if (name !== undefined) host.collections.addMine(name);
          reopen();
        }),
    });
    if (host.collections.mine().length) actions.push({ label: t('Gérer mes collections…'), detail: t('Renommer, supprimer'), icon: 'edit', run: () => openManage(reopen) });
    const keys = host.keysLabel();
    actions.push({
      label: t('Boutons des collections'),
      detail: keys ? t('{keys} sur la roue · Start pour en choisir d’autres', { keys }) : t('Aucun bouton pour l’instant : Start pour en choisir deux'),
      tone: keys ? undefined : 'warning',
      icon: 'button',
      run: () => host.captureKeys(reopen),
    });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Collections'),
      icon: 'star',
      lead: t('La roue ne montre que les tables de la collection choisie. Start l’affiche ; sur la roue, les boutons des collections passent de l’une à l’autre.'),
      sections,
      actions,
      back,
    };
  }

  /** Mes collections : une ligne chacune ; Start ouvre ce qu'on peut en faire. */
  function openManage(up: () => void): void {
    const build = (): Built => {
      const actions: Action[] = [];
      const rows: Row[] = host.collections.mine().map((m) => {
        const index = actions.push({ label: m.name, key: `mine:${m.id}`, run: () => openOne(m.id, () => lib.openCustom(build)) }) - 1;
        return { text: m.name, detail: tn(m.tables.length, '{n} table', '{n} tables'), icon: 'list', action: index, pick: true };
      });
      actions.push({ label: t('Retour'), icon: 'back', run: up });
      return { heading: t('Mes collections'), icon: 'list', sections: [{ rows }], actions, back: up };
    };
    lib.openCustom(build);
  }

  function openOne(id: string, up: () => void): void {
    const build = (): Built => {
      const m = host.collections.mine().find((x) => x.id === id);
      if (!m) return { heading: t('Mes collections'), sections: [], actions: [{ label: t('Retour'), icon: 'back', run: up }], back: up };
      return {
        heading: m.name,
        icon: 'list',
        subheading: tn(m.tables.length, '{n} table', '{n} tables'),
        sections: [],
        actions: [
          { label: t('Afficher sur la roue'), icon: 'play', run: () => (host.collections.choose(m.id) ? lib.leave() : undefined), ...(m.tables.length ? {} : { tone: 'quiet' as const, detail: t('Vide : sur la fiche d’une table, « Ajouter à une collection… »') }) },
          {
            label: t('Renommer'),
            icon: 'edit',
            run: () =>
              lib.openPrompt(t('Renommer la collection'), t('Nom de la collection'), m.name, (name) => {
                if (name !== undefined) host.collections.renameMine(m.id, name);
                lib.openCustom(build);
              }),
          },
          {
            label: t('Supprimer la collection'),
            detail: t('Les tables restent sur la borne'),
            tone: 'error',
            icon: 'trash',
            run: () =>
              lib.openCustom(() => ({
                heading: t('Supprimer « {name} » ?', { name: m.name }),
                icon: 'trash',
                lead: t('La collection disparaît ; ses tables restent sur la borne et dans les autres collections.'),
                sections: [],
                actions: [
                  {
                    label: t('Supprimer'),
                    tone: 'error',
                    icon: 'trash',
                    run: () => {
                      host.collections.removeMine(m.id);
                      up();
                    },
                  },
                  { label: t('Annuler'), icon: 'back', run: () => lib.openCustom(build) },
                ],
                back: () => lib.openCustom(build),
              })),
          },
          { label: t('Retour'), icon: 'back', run: up },
        ],
        back: up,
      };
    };
    lib.openCustom(build);
  }

  return {
    get detail() {
      return t('Affichée : {collection}', { collection: host.collections.current().label });
    },
    run: open,
  };
}

/**
 * Fiche d'une table : « Ajouter à une collection… », ses collections personnelles cochées ou non
 * (Start met la table dedans ou l'en retire), et « Nouvelle collection… » qui la crée avec elle.
 */
export function tableCollectionsAction(host: {
  collections: CollectionsMenu;
  library: { openCustom(build: () => Built, at?: number): void; openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void };
  redraw(): void;
}): (table: TableEntry, back: () => void) => Action {
  const lib = host.library;
  return (table, back) => {
    const inside = host.collections.mine().filter((m) => host.collections.holds(m.id, table));
    return {
      label: t('Ajouter à une collection…'),
      detail: inside.length ? t('Dans : {names}', { names: inside.map((m) => m.name).join(', ') }) : t('Vos collections personnelles'),
      icon: 'list',
      key: 'collections',
      run: () => {
        const build = (): Built => {
          const actions: Action[] = [];
          const rows: Row[] = host.collections.mine().map((m) => {
            const on = host.collections.holds(m.id, table);
            const index =
              actions.push({
                label: m.name,
                key: `mine:${m.id}`,
                run: () => {
                  host.collections.setTable(m.id, table, !on);
                  host.redraw();
                },
              }) - 1;
            return { text: m.name, detail: on ? t('Dans cette collection · Start pour l’en retirer') : t('Start pour l’y ajouter'), icon: on ? 'check' : 'list', tone: on ? 'ok' : undefined, action: index, pick: true };
          });
          actions.push({
            label: t('Nouvelle collection…'),
            detail: t('Créée avec cette table'),
            icon: 'plus',
            run: () =>
              lib.openPrompt(t('Nouvelle collection'), t('Nom de la collection'), '', (name) => {
                if (name !== undefined) host.collections.addMine(name, table);
                lib.openCustom(build);
              }),
          });
          actions.push({ label: t('Retour à la fiche'), icon: 'back', run: back });
          return {
            heading: t('Ajouter à une collection'),
            icon: 'list',
            subheading: table.title,
            sections: rows.length ? [{ title: t('Mes collections'), rows }] : [{ rows: [{ text: t('Aucune collection personnelle'), detail: t('« Nouvelle collection… » en crée une, avec cette table'), tone: 'info' }] }],
            actions,
            back,
          };
        };
        lib.openCustom(build);
      },
    };
  };
}

/** Durée de la liste des collections après le dernier MagnaSave, puis son fondu. */
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
  /** Mes collections, dans l'ordre de leur création. */
  mine(): readonly MyCollection[];
  /** La table est-elle dans cette collection personnelle ? */
  holds(id: string, table: TableEntry): boolean;
  /** Nouvelle collection personnelle (avec une première table) ; undefined : nom vide. */
  addMine(name: string, table?: TableEntry): string | undefined;
  renameMine(id: string, name: string): void;
  removeMine(id: string): void;
  setTable(id: string, table: TableEntry, on: boolean): void;
  /** Boutons choisis pour changer de collection ; undefined : les MagnaSave. */
  keys(): { previous?: string; next?: string } | undefined;
  setKeys(keys: { previous: string; next: string } | undefined): void;
  /** Ce que le playfield dessine : le repère, et la liste quand elle est montrée. */
  view(layout: keyof typeof PANEL_BUDGET, panel?: boolean): { shelf: ShelfView; collections?: CollectionsPanel & { leaving?: boolean } };
  /** Un flipper : la liste des collections se ferme aussitôt. */
  hidePanel(): void;
  dispose(): void;
}

export function createCollectionsMenu(host: CollectionsHost): CollectionsMenu {
  const now = () => host.now?.() ?? Date.now();
  let settings: CollectionsSettings = loadCollections(host.dataDir);
  let active = settings.active as string;
  /** Le réglage changé : gardé, et la liste refaite. */
  function save(next: CollectionsSettings, why: string): void {
    settings = next;
    active = next.active;
    cache = undefined;
    try {
      saveCollections(host.dataDir, settings);
    } catch (error) {
      console.log(`Collections : réglage non enregistré (${(error as Error).message}).`);
    }
    console.log(`Collections (réglage) : ${why}.`); // i18n-ignore : journal
    host.redraw();
  }
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
      cache = { tables, list: buildCollections(tables, { ...(f ? { friends: f } : {}), mine: settings.mine }) };
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
    settings = { ...settings, active: next.id };
    try {
      saveCollections(host.dataDir, settings);
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
    mine: () => settings.mine,
    holds: (id, table) => Boolean(settings.mine.find((m) => m.id === id)?.tables.some((x) => x.toLowerCase() === table.id.toLowerCase())),
    addMine(name, table) {
      const made = addMyCollection(settings, name, table?.id);
      if (made.id) save(made.settings, `nouvelle collection ${made.id}${table ? ` avec ${table.id}` : ''}`); // i18n-ignore : journal
      return made.id;
    },
    renameMine: (id, name) => save(renameMyCollection(settings, id, name), `${id} renommée`), // i18n-ignore : journal
    removeMine: (id) => save(removeMyCollection(settings, id), `${id} supprimée`), // i18n-ignore : journal
    setTable: (id, table, on) => save(setTableInMyCollection(settings, id, table.id, on), `${table.id} ${on ? 'ajoutée à' : 'retirée de'} ${id}`), // i18n-ignore : journal
    keys: () => settings.keys,
    setKeys(keys) {
      const { keys: _old, ...rest } = settings;
      save(keys ? { ...rest, keys } : rest, keys ? 'boutons choisis' : 'boutons : les MagnaSave'); // i18n-ignore : journal
    },
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
