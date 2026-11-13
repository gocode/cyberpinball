// Collections du menu des tables : des sélections, en plus de l'ordre (tableorder.ts).
//
// Règles (décidées le 06/11/2026) :
// - Toutes les tables, Favoris, Récentes (les dernières jouées, la plus récente d'abord), Jamais
//   jouées, Avec mes amis en ligne (une table qu'un ami en ligne a dans la même version), puis une
//   par fabricant (A → Z) et une par décennie (la plus ancienne d'abord) ;
// - une collection garde l'ordre choisi pour le menu (« Ordre des tables »), sauf Récentes ;
// - une collection vide reste dans la liste, grisée avec sa raison : on ne l'ouvre pas, on la voit ;
// - les MagnaSave passent à la collection voisine (en boucle), en sautant les vides ;
// - chaque collection garde sa table choisie : on la retrouve en y revenant ;
// - le favori est le champ User.Favorite du .info, partagé avec d'autres frontends (1 : favori) :
//   celui d'une installation reprise vaut ici sans rien faire.
//
// Rien ici ne lit le disque, sauf loadCollections / saveCollections (<données>\collections.json).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { t, tn } from './i18n';
import { lastRunOf } from './tableorder';
import type { TableEntry, TableInfoFile } from './tables';
import { readInfo } from './tables';

/** Collections fixes, dans l'ordre de la liste ; viennent ensuite les fabricants et les décennies. */
export const FIXED_COLLECTIONS = ['all', 'favorites', 'recent', 'unplayed', 'friends'] as const;
export type FixedCollection = (typeof FIXED_COLLECTIONS)[number];
/** « all », « favorites »…, « maker:<clé du fabricant> », « decade:<1990> ». */
export type CollectionId = FixedCollection | `mine:${string}` | `maker:${string}` | `decade:${number}`;
export type CollectionGroup = 'fixed' | 'mine' | 'maker' | 'decade';

/** Combien de tables garde Récentes. */
export const RECENT_COUNT = 10;

type Shelved = Pick<TableEntry, 'file' | 'title' | 'manufacturer' | 'year' | 'info'>;

/** Ce que le réseau des amis sait des tables jouables avec un ami en ligne (live-game-menu.ts). */
export interface FriendsShelf {
  /** none : pas d'ami ; offline : aucun en ligne ; searching : la liste se fait ; ready : `files` est sûr. */
  state: 'none' | 'offline' | 'searching' | 'ready' | 'off';
  /** Fichiers .vpx de mes tables qu'au moins un ami en ligne a dans la même version. */
  files: ReadonlySet<string>;
}

export interface Collection<T> {
  id: CollectionId;
  group: CollectionGroup;
  label: string;
  /** Icône du registre (icons.ts). */
  icon: string;
  tables: T[];
  /** Ce que la collection retient, en une ligne (« Les 10 dernières jouées »). */
  detail?: string;
  /** Vide : pourquoi (« Aucune table en favori »). */
  reason?: string;
}

/** Favori : User.Favorite à 1 (ou vrai) dans le .info, comme l'écrivent les autres frontends. */
export function isFavorite(info: TableInfoFile | undefined): boolean {
  const value: unknown = info?.User?.Favorite;
  return value === true || (typeof value === 'number' && value > 0) || value === '1';
}

/**
 * Ajoute ou retire la table des favoris : User.Favorite à 1 ou 0 (la forme des autres
 * frontends), tous les autres champs du .info conservés. Renvoie le .info écrit.
 */
export function setFavorite(infoFile: string, on: boolean): TableInfoFile {
  const info = readInfo(infoFile);
  info.User = { ...info.User, Favorite: on ? 1 : 0 };
  fs.mkdirSync(path.dirname(infoFile), { recursive: true });
  writeFileAtomic(infoFile, JSON.stringify(info, null, 2) + '\n');
  return info;
}

/**
 * Fusion d'un .info apporté (installation reprise, sauvegarde) dans celui de la table : le favori
 * apporté vaut quand le .info de la table n'en dit rien.
 */
export function mergeFavorite(target: TableInfoFile, extra: TableInfoFile): TableInfoFile {
  if (target.User?.Favorite !== undefined || extra.User?.Favorite === undefined) return target;
  return { ...target, User: { ...target.User, Favorite: isFavorite(extra) ? 1 : 0 } };
}

const playedOnce = (x: Shelved) => (x.info.User?.StartCount ?? 0) > 0 || lastRunOf(x) > 0;

/** Clé d'un fabricant : sans casse ni espaces en trop (« Data East » = « data  east »). */
export function makerKey(maker: string): string {
  return maker.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
}

export function decadeOf(year: number | undefined): number | undefined {
  return typeof year === 'number' && Number.isInteger(year) && year >= 1900 && year <= 2200 ? Math.floor(year / 10) * 10 : undefined;
}

/** Les collections de ces tables (déjà rangées dans l'ordre du menu), vides comprises. */
export function buildCollections<T extends Shelved & { id?: string }>(tables: readonly T[], opts: { friends?: FriendsShelf; recent?: number; mine?: readonly MyCollection[] } = {}): Collection<T>[] {
  const recentCount = opts.recent ?? RECENT_COUNT;
  const favorites = tables.filter((x) => isFavorite(x.info));
  const recent = tables
    .filter((x) => lastRunOf(x) > 0)
    .sort((a, b) => lastRunOf(b) - lastRunOf(a))
    .slice(0, recentCount);
  const unplayed = tables.filter((x) => !playedOnce(x));
  const friends = opts.friends ?? { state: 'off', files: new Set<string>() };
  const withFriends = friends.state === 'ready' ? tables.filter((x) => friends.files.has(x.file.toLowerCase())) : [];
  const friendsReason =
    friends.state === 'off'
      ? t('Le réseau des amis est coupé')
      : friends.state === 'none'
        ? t('Pas encore d’ami : Menu système > Amis > Trouver un joueur')
        : friends.state === 'offline'
          ? t('Aucun ami en ligne pour l’instant')
          : friends.state === 'searching'
            ? t('Recherche des amis…')
            : t('Aucune de vos tables chez un ami en ligne, dans la même version');

  const fixed: Collection<T>[] = [
    { id: 'all', group: 'fixed', label: t('Toutes les tables'), icon: 'tables', tables: [...tables], ...(tables.length ? {} : { reason: t('Aucune table installée') }) },
    {
      id: 'favorites',
      group: 'fixed',
      label: t('Favoris'),
      icon: 'star',
      tables: favorites,
      ...(favorites.length ? {} : { reason: t('Aucune table en favori : Start sur une table, puis « Ajouter aux favoris »') }),
    },
    {
      id: 'recent',
      group: 'fixed',
      label: t('Récentes'),
      icon: 'history',
      tables: recent,
      detail: t('Les {n} dernières jouées', { n: recentCount }),
      ...(recent.length ? {} : { reason: t('Aucune table jouée pour l’instant') }),
    },
    {
      id: 'unplayed',
      group: 'fixed',
      label: t('Jamais jouées'),
      icon: 'sparkle',
      tables: unplayed,
      ...(unplayed.length ? {} : { reason: t('Toutes vos tables ont déjà été jouées') }),
    },
    {
      id: 'friends',
      group: 'fixed',
      label: t('Avec mes amis en ligne'),
      icon: 'friends',
      tables: withFriends,
      detail: t('Celles qu’un ami en ligne a dans la même version'),
      ...(withFriends.length ? {} : { reason: friendsReason }),
    },
  ];

  // Fabricants : le nom le plus fréquent de chaque clé (à égalité, le premier vu), rangés de A à Z.
  const makers = new Map<string, { names: Map<string, number>; tables: T[] }>();
  for (const x of tables) {
    const name = x.manufacturer?.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = makerKey(name);
    const entry = makers.get(key) ?? { names: new Map<string, number>(), tables: [] as T[] };
    entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
    entry.tables.push(x);
    makers.set(key, entry);
  }
  const byMaker = [...makers.entries()]
    .map(([key, m]): Collection<T> => {
      const label = [...m.names.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      return { id: `maker:${key}`, group: 'maker', label, icon: 'factory', tables: m.tables };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

  const decades = new Map<number, T[]>();
  for (const x of tables) {
    const d = decadeOf(x.year);
    if (d !== undefined) decades.set(d, [...(decades.get(d) ?? []), x]);
  }
  const byDecade = [...decades.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, list]): Collection<T> => ({ id: `decade:${d}`, group: 'decade', label: t('Années {decade}', { decade: d }), icon: 'calendar', tables: list }));

  // Mes collections : dans l'ordre de leur création ; une table partie du disque n'y compte plus.
  const byId = new Map(tables.map((x) => [(x.id ?? x.file).toLowerCase(), x]));
  const mine = (opts.mine ?? []).map((m): Collection<T> => {
    const list = m.tables.map((id) => byId.get(id.toLowerCase())).filter((x): x is T => Boolean(x));
    // L'ordre du menu, pas celui des ajouts.
    const rank = new Map(tables.map((x, i) => [x, i]));
    list.sort((a, b) => rank.get(a)! - rank.get(b)!);
    return { id: m.id, group: 'mine', label: m.name, icon: 'list', tables: list, ...(list.length ? {} : { reason: t('Vide : sur la fiche d’une table, « Ajouter à une collection… »') }) };
  });

  return [...fixed, ...mine, ...byMaker, ...byDecade];
}

/** La collection voulue, sinon Toutes (un fabricant dont la dernière table est partie, par exemple). */
export function findCollection<T>(list: readonly Collection<T>[], id: string | undefined): Collection<T> {
  return list.find((c) => c.id === id) ?? list[0]!;
}

/**
 * La collection voisine pour les MagnaSave (`step` : -1 ou 1), en boucle, en sautant les vides ;
 * aucune autre non vide : la même.
 */
export function stepCollection<T>(list: readonly Collection<T>[], id: string, step: -1 | 1): Collection<T> {
  const from = Math.max(0, list.findIndex((c) => c.id === id));
  for (let i = 1; i <= list.length; i++) {
    const c = list[(from + step * i + list.length * 2) % list.length]!;
    if (c.tables.length) return c;
  }
  return list[from]!;
}

export function isCollectionId(raw: unknown): raw is CollectionId {
  if (typeof raw !== 'string') return false;
  return (FIXED_COLLECTIONS as readonly string[]).includes(raw) || /^(maker|mine):.+/.test(raw) || /^decade:\d{4}$/.test(raw);
}

/**
 * La table choisie dans chaque collection, par son fichier : on la retrouve en y revenant.
 * Une table partie de la collection (retirée des favoris, supprimée) : sa voisine, à la place
 * qu'elle avait.
 */
export class ShelfMemory {
  private readonly picks = new Map<string, { file: string; at: number }>();

  remember(id: string, file: string, at: number): void {
    this.picks.set(id, { file: file.toLowerCase(), at });
  }

  /** Rang de la table à montrer en arrivant dans cette collection ; `fallback` : sans souvenir. */
  indexIn(id: string, tables: readonly Pick<TableEntry, 'file'>[], fallback = 0): number {
    if (!tables.length) return 0;
    const pick = this.picks.get(id);
    if (!pick) return Math.min(Math.max(0, fallback), tables.length - 1);
    const found = tables.findIndex((x) => x.file.toLowerCase() === pick.file);
    return found >= 0 ? found : Math.min(pick.at, tables.length - 1);
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries([...this.picks.entries()].map(([id, p]) => [id, p.file]));
  }
}

/** Une collection personnelle : son nom, et les tables qu'on y a mises (TableEntry.id). */
export interface MyCollection {
  id: `mine:${string}`;
  name: string;
  tables: string[];
}

/** Longueur d'un nom de collection personnelle. */
export const MY_COLLECTION_NAME_MAX = 40;

/**
 * Ce qui se garde d'un démarrage à l'autre : la collection active, les collections personnelles,
 * et les boutons choisis pour changer de collection (sinon les MagnaSave).
 */
export interface CollectionsSettings {
  active: CollectionId;
  mine: MyCollection[];
  /** Boutons des collections choisis sur la borne (codes de touche ou jetons de joystick). */
  keys?: { previous?: string; next?: string };
}

const settingsFile = (dataDir: string) => path.join(dataDir, 'collections.json');

/** Nom d'une collection personnelle : sans caractère de contrôle, espaces resserrés, coupé à MY_COLLECTION_NAME_MAX. */
export function cleanCollectionName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MY_COLLECTION_NAME_MAX).trim();
  return name || undefined;
}

export function parseCollectionsSettings(raw: unknown): CollectionsSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { active?: unknown; mine?: unknown; keys?: unknown };
  const mine: MyCollection[] = [];
  for (const m of Array.isArray(r.mine) ? r.mine : []) {
    const x = (m && typeof m === 'object' ? m : {}) as { id?: unknown; name?: unknown; tables?: unknown };
    const name = cleanCollectionName(x.name);
    if (typeof x.id !== 'string' || !/^mine:[a-z0-9-]{1,40}$/.test(x.id) || !name || mine.some((o) => o.id === x.id)) continue;
    const tables = [...new Set((Array.isArray(x.tables) ? x.tables : []).filter((tb): tb is string => typeof tb === 'string' && tb.length > 0 && tb.length < 500))];
    mine.push({ id: x.id as `mine:${string}`, name, tables });
  }
  const k = (r.keys && typeof r.keys === 'object' ? r.keys : {}) as { previous?: unknown; next?: unknown };
  const code = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length < 200 ? v : undefined);
  const keys = { ...(code(k.previous) ? { previous: code(k.previous)! } : {}), ...(code(k.next) ? { next: code(k.next)! } : {}) };
  const active = isCollectionId(r.active) && (!r.active.startsWith('mine:') || mine.some((m) => m.id === r.active)) ? r.active : 'all';
  return { active, mine, ...(keys.previous || keys.next ? { keys } : {}) };
}

export function loadCollections(dataDir: string): CollectionsSettings {
  try {
    return parseCollectionsSettings(JSON.parse(fs.readFileSync(settingsFile(dataDir), 'utf8').replace(/^﻿/, '')));
  } catch {
    return { active: 'all', mine: [] };
  }
}

export function saveCollections(dataDir: string, settings: CollectionsSettings): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(settingsFile(dataDir), JSON.stringify(settings, null, 2) + '\n');
}

/** Une nouvelle collection personnelle, vide (ou avec une première table). Identifiant tiré du nom, unique. */
export function addMyCollection(settings: CollectionsSettings, rawName: string, firstTable?: string): { settings: CollectionsSettings; id?: `mine:${string}` } {
  const name = cleanCollectionName(rawName);
  if (!name) return { settings };
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'collection';
  let id = `mine:${base}` as `mine:${string}`;
  for (let n = 2; settings.mine.some((m) => m.id === id); n++) id = `mine:${base}-${n}`;
  return { settings: { ...settings, mine: [...settings.mine, { id, name, tables: firstTable ? [firstTable] : [] }] }, id };
}

export function renameMyCollection(settings: CollectionsSettings, id: string, rawName: string): CollectionsSettings {
  const name = cleanCollectionName(rawName);
  if (!name) return settings;
  return { ...settings, mine: settings.mine.map((m) => (m.id === id ? { ...m, name } : m)) };
}

/** Supprime la collection (les tables restent sur le disque) ; affichée, la roue revient sur Toutes. */
export function removeMyCollection(settings: CollectionsSettings, id: string): CollectionsSettings {
  return { ...settings, mine: settings.mine.filter((m) => m.id !== id), active: settings.active === id ? 'all' : settings.active };
}

/** Met la table dans la collection, ou l'en retire (`on`). */
export function setTableInMyCollection(settings: CollectionsSettings, id: string, table: string, on: boolean): CollectionsSettings {
  const same = (a: string) => a.toLowerCase() === table.toLowerCase();
  return {
    ...settings,
    mine: settings.mine.map((m) => (m.id !== id ? m : { ...m, tables: on ? (m.tables.some(same) ? m.tables : [...m.tables, table]) : m.tables.filter((x) => !same(x)) })),
  };
}

/** Repère de la collection active sur la roue : « Toutes · 7 tables », « Favoris · 4 tables ». */
export interface ShelfView {
  id: CollectionId;
  label: string;
  icon: string;
  count: number;
  countLabel: string;
  /** Mode invité restreint à cette collection : le cadenas, les MagnaSave n'en changent pas. */
  locked?: boolean;
  /** Infobulle (souris). */
  title: string;
}

export function shelfView<T>(c: Collection<T>, locked = false): ShelfView {
  const count = c.tables.length;
  // Le repère a une largeur fixe : les collections fixes y prennent un nom court, qui tient toujours.
  const label = c.id === 'all' ? t('Toutes') : c.id === 'friends' ? t('Avec mes amis') : c.label;
  const countLabel = tn(count, '{n} table', '{n} tables');
  return {
    id: c.id,
    label,
    icon: c.icon,
    count,
    countLabel,
    ...(locked ? { locked: true } : {}),
    title: locked ? t('{label} : collection fixée par le mode invité', { label: c.label }) : t('{label} : MagnaSave pour changer de collection', { label: c.label }),
  };
}
