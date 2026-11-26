/** Adaptateur local : les exclusions vivent dans les données du front-end, jamais dans les tables ni leurs .info. */
import * as path from 'node:path';
import { readJsonFile, readSurpriseExclusions, surpriseCollectionExclusions, toggleSurpriseExclusion, writeFileAtomic, t, type SurpriseCandidate, type SurpriseExclusions, type TableEntry } from '@cyberpinball/core';
import type { Action } from './library-types';

export function createSurpriseCatalog(host: {
  dataDir: string;
  guest(): boolean;
  /** Le moteur de la table est installé et accepte ce fichier (contrôle du Start, sans lancer). */
  playable(table: TableEntry): boolean;
  /** Toutes les collections, personnelles et automatiques, pour les exclusions depuis « Toutes les tables » ;
   *  lues seulement quand une collection est exclue et qu'on tire dans « Toutes les tables ». */
  collections(): readonly { id: string; tables: readonly string[] }[];
  wheel(table: TableEntry): string | undefined;
  changed(): void;
}) {
  const file = path.join(host.dataDir, 'table-surprise.json');
  const read = (): SurpriseExclusions => {
    try { return readSurpriseExclusions(readJsonFile(file)); } catch { return readSurpriseExclusions(undefined); }
  };
  /** Les tables hors tirage, pour ce tirage : exclues une à une ou par une de leurs collections. */
  function out(drawFrom: string | undefined, exclusions: SurpriseExclusions): (id: string) => boolean {
    const byCollection = drawFrom === 'all' && exclusions.collections.length ? surpriseCollectionExclusions(exclusions, drawFrom, host.collections()) : new Set<string>();
    return (id) => exclusions.tables.includes(id) || byCollection.has(id);
  }
  function eligible(table: TableEntry, drawFrom: string | undefined, isOut = out(drawFrom, read())): boolean {
    if (isOut(table.id)) return false;
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
      const isOut = out(drawFrom, read());
      return tables.filter((table) => eligible(table, drawFrom, isOut)).map((table) => ({ id: table.id, title: table.title, wheel: host.wheel(table) }));
    },
    /** Gérer la table : interrupteur « Table surprise : Peut sortir / Ne sort jamais » (la valeur dit l'effet,
     *  un « Oui/Non » sous « Dans le tirage » n'était pas compris). */
    tableAction(table: TableEntry, refresh: () => void): Action {
      const out = read().tables.includes(table.id);
      return {
        label: t('Table surprise'), icon: 'shuffle', door: 'sheet.manage',
        detail: out ? t('Ne sort jamais') : t('Peut sortir'),
        run: () => { toggle('tables', table.id); refresh(); },
      };
    },
    /** La collection est exclue du tirage de « Toutes les tables » (« hors tirage » dans la liste des collections). */
    collectionExcluded(id: string): boolean {
      return read().collections.includes(id);
    },
    /** Interrupteur d'exclusion du tirage de « Toutes les tables » : Gérer mes collections > collection, et
     *  Collections > Exclure du tirage… pour toutes les collections. */
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
