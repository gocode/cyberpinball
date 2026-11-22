// Retrouver une table sociale dans la collection de la roue, même quand seul son titre est partagé.
import { presenceTable, type PresenceTable, type TableEntry } from '@cyberpinball/core';

export function findWheelTable(tables: readonly TableEntry[], wanted: PresenceTable): TableEntry | undefined {
  return tables.find((entry) => {
    const table = presenceTable(entry);
    if (wanted.vpsId) return table.vpsId === wanted.vpsId;
    return table.title.trim().toLowerCase() === wanted.title.trim().toLowerCase()
      && (!wanted.manufacturer || table.manufacturer?.toLowerCase() === wanted.manufacturer.toLowerCase())
      && (!wanted.year || table.year === wanted.year);
  });
}
