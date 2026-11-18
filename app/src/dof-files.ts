// Où vit la configuration de DOF de la borne : le dossier que lit le plugin DOF de VPX
// (libdof, DOF.cpp) : %APPDATA%\VPinballX\<majeure.mineure>\directoutputconfig, partagé avec tout
// autre VPX de la même version sur ce PC. En bac à sable (CYBERPINBALL_HOME), un dossier du bac à
// sable, jamais le vrai ; CYBERPINBALL_DOF_DIR le désigne pour les essais.
//
// Une borne qui vient de PinUP Popper, PinballX ou PinballY a souvent sa configuration du configtool
// dans le dossier d'un DOF classique (C:\DirectOutput\Config…), que le plugin de VPX ne lit pas :
// ces dossiers sont cherchés une fois sur les disques fixes (legacyDofInstalls), puis gardés.
// En essai, CYBERPINBALL_DOF_RACINES donne les racines de disque simulées (séparées par « ; ») ;
// en bac à sable sans elle, aucun disque n'est parcouru.

import * as path from 'node:path';
import { legacyDofInstalls, readDofSetup, type DofSetup, type Locations } from '@cyberpinball/core';
import { listDrives } from './file-picker';
import { vpxPrefDir } from './launcher';
import { vpxInstall } from './paths';

/** Dossier de configuration de DOF ; undefined sans VPX installé (hors essai). */
export function dofDir(loc: Locations): string | undefined {
  if (process.env.CYBERPINBALL_DOF_DIR) return process.env.CYBERPINBALL_DOF_DIR;
  if (process.env.CYBERPINBALL_HOME) return path.join(process.env.CYBERPINBALL_HOME, 'sandbox', 'directoutputconfig');
  const install = vpxInstall(loc);
  return install ? path.join(vpxPrefDir(install.version), 'directoutputconfig') : undefined;
}

/** Dossier de travail de VPX (celui de son exécutable) : dernier endroit où libdof cherche. */
export function vpxWorkDir(loc: Locations): string | undefined {
  if (process.env.CYBERPINBALL_DOF_DIR || process.env.CYBERPINBALL_HOME) return undefined;
  const install = vpxInstall(loc);
  return install ? path.dirname(install.exe) : undefined;
}

/** Dossiers d'installation d'un DOF classique, relevés une fois ; undefined tant que le relevé n'a pas eu lieu. */
let legacyInstalls: string[] | undefined;
let legacyScan: Promise<string[]> | undefined;

/** Racines simulées des essais ; undefined hors essai. */
function simulatedRoots(): string[] | undefined {
  const raw = process.env.CYBERPINBALL_DOF_RACINES;
  if (raw !== undefined) return raw.split(';').filter(Boolean);
  if (process.env.CYBERPINBALL_HOME || process.env.CYBERPINBALL_DOF_DIR) return [];
  return undefined;
}

/**
 * Cherche les DOF classiques sur les disques fixes (une seule fois, `again` pour recommencer :
 * « Vérifier de nouveau »). Jamais d'erreur : un disque illisible est passé.
 */
export function scanLegacyDof(again = false): Promise<string[]> {
  if (legacyScan && !again) return legacyScan;
  legacyScan = (async () => {
    let roots = simulatedRoots();
    if (!roots) {
      try {
        roots = (await listDrives()).filter((d) => d.type === 'fixed').map((d) => `${d.letter}\\`);
      } catch {
        roots = [];
      }
    }
    legacyInstalls = legacyDofInstalls(roots);
    return legacyInstalls;
  })();
  return legacyScan;
}

/** DOF classiques déjà relevés ; lance le relevé s'il n'a pas eu lieu (sa réponse servira à la lecture suivante). */
export function knownLegacyDof(): string[] {
  // Essais : les racines simulées sont lues à chaque fois, sans attendre.
  const simulated = simulatedRoots();
  if (simulated) return legacyDofInstalls(simulated);
  if (!legacyInstalls) void scanLegacyDof();
  return legacyInstalls ?? [];
}

/** Ce que libdof lira ; undefined sans VPX. */
export function readDof(loc: Locations): DofSetup | undefined {
  const dir = dofDir(loc);
  return dir ? readDofSetup(dir, vpxWorkDir(loc), knownLegacyDof()) : undefined;
}
