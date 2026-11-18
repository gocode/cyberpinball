// Ce que DOF et le dernier vpinball.log disent des ports série (dmdPortHints, dof.ts) : un pont
// USB-série (CH340, CP210x) qui n'a pas répondu comme un ZeDMD, ou qui sert à DOF, n'est plus allumé
// d'office comme ZeDMD. Partagé par la synchronisation de VPinballX.ini, la santé et l'écran DMD réel.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { dmdPortHints, type DmdPortHints, type Locations } from '@cyberpinball/core';
import { readDof } from './dof-files';
import { vpxPrefDir } from './launcher';
import { vpxInstall } from './paths';

/** La fin de vpinball.log suffit : DMDUtil cherche le ZeDMD au début de chaque partie. */
const LOG_TAIL_BYTES = 512 * 1024;

/** vpinball.log de la version de VPX installée ; CYBERPINBALL_VPX_LOG en essai ; undefined sans VPX. */
export function vpxLogPath(loc: Locations): string | undefined {
  if (process.env.CYBERPINBALL_VPX_LOG) return process.env.CYBERPINBALL_VPX_LOG;
  if (process.env.CYBERPINBALL_HOME) return undefined;
  const install = vpxInstall(loc);
  return install ? path.join(vpxPrefDir(install.version), 'vpinball.log') : undefined;
}

/** Fin du journal de VPX ; undefined s'il est absent ou illisible. */
export function readVpxLogTail(file: string | undefined): string | undefined {
  if (!file) return undefined;
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Indices des ports série pour le DMD réel ; jamais d'erreur. */
export function dmdHints(loc: Locations): DmdPortHints {
  let dof;
  try {
    dof = readDof(loc);
  } catch {
    dof = undefined;
  }
  return dmdPortHints(dof, readVpxLogTail(vpxLogPath(loc)));
}
