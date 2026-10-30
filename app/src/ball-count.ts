// Nombre de billes par partie d'une table installée (packages/core/src/ballcount.ts) : sa ROM
// (le .nv à côté de la table, sinon dans le dossier PinMAME commun, lu d'après la carte de Pinball
// Memory Maps, en cache dans <données>\cache\cartes-memoire), sinon son script et ses réglages
// enregistrés (VPReg.stg). Calculé à la demande, pour la partie en direct ; jamais deviné.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un faux téléchargement.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadedRoms, loadRomMemory, readVpReg, readVpxScript, tableBallCount, vpRegFile, type BallCount, type MemoryMapOptions, type TableEntry } from '@cyberpinball/core';

export interface BallCountsOptions {
  dataDir: string;
  romsOf?(table: TableEntry): readonly string[];
  /** Dossiers PinMAME communs (avec nvram\), après celui de la table. */
  pinmameDirs?(): readonly string[];
  fetch?: MemoryMapOptions['fetch'];
}

export function createBallCounts(opts: BallCountsOptions): { of(table: TableEntry): Promise<BallCount | undefined> } {
  const cacheDir = path.join(opts.dataDir, 'cache', 'cartes-memoire');
  return {
    async of(table) {
      try {
        // Le jeu que PinMAME charge (alias.txt de la table) : sa mémoire et sa carte, pas celles du nom demandé.
        const roms = loadedRoms(table.folder, opts.romsOf?.(table) ?? []);
        const dirs = [path.join(table.folder, 'pinmame'), ...(opts.pinmameDirs?.() ?? [])];
        return await tableBallCount({
          roms,
          ...(roms.length ? {} : { script: readVpxScript(table.file), saved: readVpReg(vpRegFile(table)) }),
          nv: (rom) => {
            for (const dir of dirs) {
              try {
                return fs.readFileSync(path.join(dir, 'nvram', `${rom.toLowerCase()}.nv`));
              } catch {
                // Pas ici : le dossier suivant.
              }
            }
            return undefined;
          },
          memory: (rom) => loadRomMemory(cacheDir, rom, opts.fetch ? { fetch: opts.fetch } : {}),
        });
      } catch {
        return undefined;
      }
    },
  };
}
