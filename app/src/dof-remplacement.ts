/**
 * Remplacement du DOF d'une table (dof-remplacement.ts du cœur) : l'interrupteur de « Gérer la table »,
 * le choix relu au lancement (écrit dans le .info de la table, jamais en mémoire seulement), et les
 * sorties des bandes rendues à libdof en fin de partie.
 */
import { dofReplaceOf, infoFileFor, readInfo, restoreDofReplacement, t, withDofReplace, writeFileAtomic, type DofSetup, type TableEntry } from '@cyberpinball/core';
import type { Action } from './library-types';

export function createDofReplace(host: {
  tablesDir(): string | undefined;
  /** Config DOF de la borne (lue au plus toutes les quelques secondes). */
  dof(): DofSetup | undefined;
  /** Le .info a changé : relire la table. */
  changed(table: TableEntry): void;
}) {
  const infoOf = (table: TableEntry) => {
    const dir = host.tablesDir();
    return dir ? infoFileFor(table, dir) : table.infoFile;
  };
  /** Choix relu sur le disque : la table en mémoire peut dater d'avant l'interrupteur. */
  const isOn = (table: TableEntry) => dofReplaceOf(readInfo(infoOf(table)));
  return {
    isOn,
    /** Gérer la table : « Effets LED de Cyber Pinball », pour une table VPX sur une borne aux bandes décrites. */
    tableAction(table: TableEntry, refresh: () => void): Action | undefined {
      if (table.emulator !== 'vpx') return undefined;
      const on = isOn(table);
      // Une table déjà en remplacement garde son interrupteur, même bandes retirées : on peut toujours revenir.
      if (!on && !host.dof()?.cabinet?.strips.length) return undefined;
      return {
        label: t('Effets LED de Cyber Pinball'),
        icon: 'bulb',
        detail: on ? t('Oui : tes bandes de LED suivent Cyber Pinball, pas la config DOF de la table') : t('Non : tes bandes de LED suivent la config DOF de la table'),
        run: () => {
          const file = infoOf(table);
          writeFileAtomic(file, JSON.stringify(withDofReplace(readInfo(file), !on), null, 2) + '\n');
          console.log(`DOF : ${table.id} ${on ? 'revient à sa config DOF' : 'prend les effets LED de Cyber Pinball'} (à la prochaine partie).`); // i18n-ignore : journal
          host.changed(table);
          refresh();
        },
      };
    },
    /** Fin de partie : sorties des bandes rendues dans Cabinet.xml, pour que toute autre partie lise la config telle quelle. */
    afterGame(): void {
      const file = host.dof()?.cabinet?.file;
      if (file && restoreDofReplacement(file)) console.log('DOF : sorties des bandes rendues à la config du configtool (fin d’une partie en remplacement).'); // i18n-ignore : journal
    },
  };
}
