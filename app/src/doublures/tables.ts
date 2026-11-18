// Doublures des options des services des tables, voir neutre.ts : tableau des scores (table-scores.ts),
// classements d'une table (table-rankings.ts), doubles de tables des parties en direct (table-double.ts).
// Aucune ROM, aucun dossier ; le dossier des données des scores est toujours celui de l'appelant.

import type { TableDoublesOptions } from '../table-double';
import type { TableRankingsOptions } from '../table-rankings';
import type { TableScoresOptions } from '../table-scores';
import { overlay } from './neutre';
import { fakeSocialNet } from './social-net';

export function fakeTableScoresOptions(over: Partial<TableScoresOptions> & Pick<TableScoresOptions, 'dataDir'>): TableScoresOptions {
  return overlay<TableScoresOptions>({ dataDir: over.dataDir, romsOf: () => [], pinmameDirs: () => [] }, over);
}

export function fakeTableRankingsOptions(over?: Partial<TableRankingsOptions>): TableRankingsOptions {
  return overlay<TableRankingsOptions>({ net: fakeSocialNet(), versionOf: async () => ({}), ballsOf: async () => undefined }, over);
}

export function fakeTableDoublesOptions(over?: Partial<TableDoublesOptions>): TableDoublesOptions {
  return overlay<TableDoublesOptions>({ root: () => undefined, tablesDir: () => undefined }, over);
}
