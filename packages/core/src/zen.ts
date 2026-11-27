// Jeux de Zen Studios joués par Cyber Pinball : Pinball FX (pinballfx.ts) et Pinball FX3
// (pinballfx3.ts). Ce qui leur est commun passe par ici : une table désignée par ce que le jeu
// reçoit pour l'ouvrir (numéro pour Pinball FX, nom de fichier pour FX3), son nom de jeu, sa
// fiche dans l'inventaire. Ni l'un ni l'autre n'a de fichier de table à lui, de ROM, de NVRAM
// ou de VR : ce qui est propre à VPX leur reste fermé, grisé avec sa raison.

import { PINBALLFX_TABLES, pinballFxTable, type PinballFxTable } from './pinballfx';
import { PINBALLFX3_TABLES, pinballFx3Table, type PinballFx3Table } from './pinballfx3';
import { isPinballFxMidnightId, PINBALLFX_MIDNIGHT_TABLES } from './pinballfx-midnight';
import type { TableEmulator, TableEntry } from './tables';

export type ZenGameKey = 'pinballfx' | 'pinballfx3' | 'pinballfxmidnight';

export interface ZenGameInfo {
  key: ZenGameKey;
  /** Nom du jeu, pareil dans toutes les langues (nom propre). */
  name: string;
  /** Extension de la fiche de table dans l'inventaire. */
  ext: string;
  /** Clé de la fiche (JSON : { "<clé>": { "Table": … } }). */
  jsonKey: string;
  /** Formats de la base VPS dont la capture représente le mieux la table, dans l'ordre. */
  vpsFormats: readonly string[];
}

export const ZEN_GAMES: Readonly<Record<ZenGameKey, ZenGameInfo>> = {
  pinballfx: { key: 'pinballfx', name: 'Pinball FX', ext: '.pinballfx', jsonKey: 'PinballFX', vpsFormats: ['FX', 'FX3', 'FX2'] },
  pinballfx3: { key: 'pinballfx3', name: 'Pinball FX3', ext: '.pinballfx3', jsonKey: 'PinballFX3', vpsFormats: ['FX3', 'FX', 'FX2'] },
  pinballfxmidnight: { key: 'pinballfxmidnight', name: 'Pinball FX Midnight', ext: '.pinballfxmidnight', jsonKey: 'PinballFXMidnight', vpsFormats: [] },
};

export function isZenEmulator(emulator: TableEmulator | string | undefined): emulator is ZenGameKey {
  return emulator === 'pinballfx' || emulator === 'pinballfx3' || emulator === 'pinballfxmidnight';
}

/** Une table d'un jeu de Zen, quel qu'il soit. */
export interface ZenTable {
  game: ZenGameKey;
  /** Ce que le jeu reçoit pour ouvrir la table : « 156 » (Pinball FX), « WMS_Fish_Tales » (FX3). */
  key: string;
  title: string;
  manufacturer: string;
  year?: number;
  vps?: string;
  /** Pinball FX3 : table Williams ou Bally, lancée dans son mode classique. */
  williams?: boolean;
  /** Pinball FX3 : fichier inconnu du catalogue (titre tiré de son nom). */
  unknown?: boolean;
}

export function zenFromPinballFx(t: PinballFxTable): ZenTable {
  return { game: 'pinballfx', key: String(t.id), title: t.title, manufacturer: t.manufacturer, ...(t.year ? { year: t.year } : {}), ...(t.vps ? { vps: t.vps } : {}) };
}

export function zenFromPinballFx3(t: PinballFx3Table): ZenTable {
  return {
    game: 'pinballfx3',
    key: t.name,
    title: t.title,
    manufacturer: t.manufacturer,
    ...(t.year ? { year: t.year } : {}),
    ...(t.vps ? { vps: t.vps } : {}),
    williams: t.williams,
    ...(t.known ? {} : { unknown: true }),
  };
}

/** Table d'un jeu de Zen d'après sa clé ; undefined : clé invalide pour ce jeu. */
export function zenTable(game: ZenGameKey, key: string): ZenTable | undefined {
  if (game === 'pinballfx') {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) return undefined;
    const known = pinballFxTable(id);
    // Numéro absent du catalogue (table plus récente) : jouable, titré d'après son numéro.
    return known ? zenFromPinballFx(known) : { game, key: String(id), title: `Pinball FX ${id}`, manufacturer: 'Zen Studios', unknown: true }; // i18n-ignore : nom de jeu et numéro
  }
  if (game === 'pinballfxmidnight') {
    const id = Number(key);
    if (!/^\d+$/.test(key) || !isPinballFxMidnightId(id)) return undefined;
    const title = PINBALLFX_MIDNIGHT_TABLES.get(id);
    return { game, key: String(id), title: title ?? `Pinball FX Midnight ${id}`, manufacturer: 'Zen Studios', ...(!title ? { unknown: true } : {}) };
  }
  const fx3 = pinballFx3Table(key);
  return fx3 ? zenFromPinballFx3(fx3) : undefined;
}

/** Catalogue d'un jeu (Pinball FX : liste de Zen ; FX3 : fichiers connus du jeu). */
export function zenCatalog(game: ZenGameKey): ZenTable[] {
  if (game === 'pinballfx') return PINBALLFX_TABLES.map(zenFromPinballFx);
  if (game === 'pinballfx3') return PINBALLFX3_TABLES.map(zenFromPinballFx3);
  return [...PINBALLFX_MIDNIGHT_TABLES.keys()].map((id) => zenTable(game, String(id))!);
}

type ZenEntry = Pick<TableEntry, 'emulator' | 'pinballFxTable' | 'pinballFx3Table' | 'pinballFxMidnightTable'>;

/** Clé de la table d'une fiche de l'inventaire (« 156 », « WMS_Fish_Tales ») ; undefined pour VPX ou une fiche illisible. */
export function zenEntryKey(entry: ZenEntry): string | undefined {
  if (entry.emulator === 'pinballfx') return entry.pinballFxTable === undefined ? undefined : String(entry.pinballFxTable);
  if (entry.emulator === 'pinballfx3') return entry.pinballFx3Table;
  if (entry.emulator === 'pinballfxmidnight') return entry.pinballFxMidnightTable === undefined ? undefined : String(entry.pinballFxMidnightTable);
  return undefined;
}

/** Table de Zen d'une fiche de l'inventaire ; undefined pour VPX ou une fiche illisible. */
export function zenTableOfEntry(entry: ZenEntry): ZenTable | undefined {
  const key = zenEntryKey(entry);
  return key !== undefined && isZenEmulator(entry.emulator) ? zenTable(entry.emulator, key) : undefined;
}
