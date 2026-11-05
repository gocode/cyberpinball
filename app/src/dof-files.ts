// Où vit la configuration de DOF de la borne : le dossier que lit le plugin DOF de VPX
// (libdof, DOF.cpp) : %APPDATA%\VPinballX\<majeure.mineure>\directoutputconfig, partagé avec tout
// autre VPX de la même version sur ce PC. En bac à sable (CYBERPINBALL_HOME), un dossier du bac à
// sable, jamais le vrai ; CYBERPINBALL_DOF_DIR le désigne pour les essais.

import * as path from 'node:path';
import { readDofSetup, type DofSetup, type Locations } from '@cyberpinball/core';
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

/** Ce que libdof lira ; undefined sans VPX. */
export function readDof(loc: Locations): DofSetup | undefined {
  const dir = dofDir(loc);
  return dir ? readDofSetup(dir, vpxWorkDir(loc)) : undefined;
}
