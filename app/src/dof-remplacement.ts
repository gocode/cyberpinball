/**
 * Remplacement du DOF d'une table (dof-remplacement.ts du cœur) : l'interrupteur de « Gérer la table »,
 * le choix relu au lancement (écrit dans le .info de la table, jamais en mémoire seulement), les bandes
 * et leur contrôleur mis en sommeil dans Cabinet.xml pour la partie (le moteur « Effets LED sans DOF »
 * prend leur port), et tout rendu en fin de partie ou à la coupure de l'option.
 */
import {
  dofReplaceOf,
  dofSleepSummary,
  infoFileFor,
  readInfo,
  restoreDofReplacement,
  sleepDofStrips,
  t,
  withDofReplace,
  writeFileAtomic,
  type DofSetup,
  type TableEntry,
} from '@cyberpinball/core';
import * as fs from 'node:fs';
import type { Action } from './library-types';

export function createDofReplace(host: {
  tablesDir(): string | undefined;
  /** Config DOF de la borne (lue au plus toutes les quelques secondes). */
  dof(): DofSetup | undefined;
  /** Le .info a changé : relire la table. */
  changed(table: TableEntry): void;
  log?(line: string): void;
}) {
  const log = host.log ?? ((line: string) => console.log(line));
  const infoOf = (table: TableEntry) => {
    const dir = host.tablesDir();
    return dir ? infoFileFor(table, dir) : table.infoFile;
  };
  /** Choix relu sur le disque : la table en mémoire peut dater d'avant l'interrupteur. */
  const isOn = (table: TableEntry) => dofReplaceOf(readInfo(infoOf(table)));
  /** Bandes, contrôleur et sorties en sommeil rendus à libdof (fin de partie, option coupée, partie interrompue). */
  const wake = (why: string) => {
    const file = host.dof()?.cabinet?.file;
    if (file && restoreDofReplacement(file)) log(`[dof] remplacement : bandes et contrôleur rendus à DOF (${why}).`); // i18n-ignore : journal
  };
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
          log(`DOF : ${table.id} ${on ? 'revient à sa config DOF' : 'prend les effets LED de Cyber Pinball'} (à la prochaine partie).`); // i18n-ignore : journal
          if (on) wake('option coupée'); // i18n-ignore : journal
          host.changed(table);
          refresh();
        },
      };
    },
    /**
     * Lancement d'une partie, avant que libdof ne lise Cabinet.xml. Table en remplacement : bandes,
     * contrôleur et sorties LedWiz qui les visent en sommeil ; true, le moteur de Cyber Pinball prend les
     * bandes (ROM ou pas). Sinon, ou remplacement impossible (journal dit pourquoi) : tout rendu à DOF, false.
     */
    beforeGame(table: TableEntry, listening: boolean): boolean {
      if (!isOn(table)) {
        wake('partie d’une autre table'); // i18n-ignore : journal
        return false;
      }
      const cabinet = host.dof()?.cabinet;
      const keep = (why: string) => {
        wake('remplacement impossible');
        log(`[dof] remplacement : impossible (${why}) : la table garde sa config DOF pour cette partie.`); // i18n-ignore : journal
        return false;
      };
      if (!listening) return keep('écoute DOF de VPX non posée'); // i18n-ignore : journal
      if (!cabinet?.strips.length) return keep('pas de bandes décrites'); // i18n-ignore : journal
      if (!cabinet.owned) return keep(`${cabinet.file} écrit à la main`); // i18n-ignore : journal
      try {
        const text = fs.readFileSync(cabinet.file, 'utf8');
        const sleep = sleepDofStrips(text, cabinet.strips.map((s) => s.name));
        if (sleep.refused) return keep(sleep.refused);
        if (sleep.xml !== text) writeFileAtomic(cabinet.file, sleep.xml);
        log(`[dof] remplacement : moteur Cyber Pinball actif / en sommeil : ${dofSleepSummary(sleep)}.`); // i18n-ignore : journal
        return true;
      } catch (error) {
        return keep((error as Error).message);
      }
    },
    /** Fin de partie : tout rendu dans Cabinet.xml, pour que toute autre partie lise la config telle quelle. */
    afterGame(): void {
      wake('fin de partie'); // i18n-ignore : journal
    },
  };
}
