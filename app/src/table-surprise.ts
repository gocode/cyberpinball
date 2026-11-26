/** Adaptateur local : les exclusions vivent dans les données du front-end, jamais dans les tables ni leurs .info. */
import * as path from 'node:path';
import { readJsonFile, readSurpriseExclusions, surpriseExcluded, toggleSurpriseExclusion, writeFileAtomic, t, type SurpriseCandidate, type SurpriseExclusions, type TableEntry } from '@cyberpinball/core';
import type { Action } from './library-types';

export function createSurpriseCatalog(host: {
  dataDir: string;
  guest(): boolean;
  /** Le moteur de la table est installé et accepte ce fichier (contrôle du Start, sans lancer). */
  playable(table: TableEntry): boolean;
  /** Collections personnelles du joueur, pour les exclusions depuis « Toutes les tables ». */
  mine(): readonly { id: string; tables: readonly string[] }[];
  wheel(table: TableEntry): string | undefined;
  changed(): void;
}) {
  const file = path.join(host.dataDir, 'table-surprise.json');
  const read = (): SurpriseExclusions => {
    try { return readSurpriseExclusions(readJsonFile(file)); } catch { return readSurpriseExclusions(undefined); }
  };
  function excluded(table: TableEntry, drawFrom: string | undefined, exclusions = read()): boolean {
    return surpriseExcluded(table.id, exclusions, drawFrom, host.mine());
  }
  function eligible(table: TableEntry, drawFrom: string | undefined, exclusions = read()): boolean {
    if (excluded(table, drawFrom, exclusions)) return false;
    try { return host.playable(table); } catch { return false; }
  }
  function toggle(kind: keyof SurpriseExclusions, id: string): void {
    // Le mode invité tire dans la collection imposée, sans toucher aux réglages du propriétaire.
    if (host.guest()) return;
    writeFileAtomic(file, JSON.stringify(toggleSurpriseExclusion(read(), kind, id), null, 2));
    host.changed();
  }
  return {
    eligible,
    candidates(tables: readonly TableEntry[], drawFrom: string | undefined): SurpriseCandidate[] {
      const exclusions = read();
      return tables.filter((table) => eligible(table, drawFrom, exclusions)).map((table) => ({ id: table.id, title: table.title, wheel: host.wheel(table) }));
    },
    /** Gérer la table : interrupteur « Dans le tirage ». */
    tableAction(table: TableEntry, refresh: () => void): Action {
      const out = read().tables.includes(table.id);
      return {
        label: t('Dans le tirage'), icon: 'shuffle', door: 'sheet.manage',
        detail: out ? t('Non') : t('Oui'),
        run: () => { toggle('tables', table.id); refresh(); },
      };
    },
    /** Gérer mes collections > collection : interrupteur d'exclusion du tirage de « Toutes les tables ». */
    collectionAction(id: string, refresh: () => void): Action {
      const out = read().collections.includes(id);
      return {
        label: t('Exclure du tirage de Toutes les tables'), icon: 'shuffle',
        detail: out ? t('Oui') : t('Non'),
        run: () => { toggle('collections', id); refresh(); },
      };
    },
  };
}
