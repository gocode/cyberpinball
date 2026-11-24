// PinUP Player sur ce PC (24/11/2026) : le lecteur des PuP-Packs que pilotent les tables « PinEvent » de Future Pinball
// (vidéos du fronton, du DMD, du topper) ; voir packages/core/src/futurepinball-pup.ts. Lecture seule du registre,
// relue à l'ouverture de l'écran de Future Pinball.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPupFolderName, localServerExe, PUP_FOLDER, registryDefaultValue } from '@cyberpinball/core';

const PLAYER_KEYS = ['HKCR\\PinUpPlayer.PinDisplay\\CLSID', 'HKLM\\SOFTWARE\\Classes\\PinUpPlayer.PinDisplay\\CLSID', 'HKLM\\SOFTWARE\\WOW6432Node\\Classes\\PinUpPlayer.PinDisplay\\CLSID'];
const CLSID_ROOTS = ['HKCR\\CLSID', 'HKLM\\SOFTWARE\\Classes\\CLSID', 'HKLM\\SOFTWARE\\WOW6432Node\\Classes\\CLSID'];

export interface PinupPlayer {
  exe: string;
  /** Dossier PinUPSystem (celui de l'exécutable). */
  dir: string;
  /** Dossier où se rangent les PuP-Packs. */
  videos: string;
}

function reg(args: string[]): string | undefined {
  const query = spawnSync('reg', ['query', ...args], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  return query.status === 0 && query.stdout ? query.stdout : undefined;
}

/** Le PinUP Player inscrit sur ce PC, s'il existe encore sur le disque ; sinon rien. */
export function findPinupPlayer(): PinupPlayer | undefined {
  if (process.platform !== 'win32') return undefined;
  for (const key of PLAYER_KEYS) {
    const clsid = registryDefaultValue(reg([key, '/ve']) ?? '');
    if (!clsid) continue;
    for (const root of CLSID_ROOTS) {
      const value = registryDefaultValue(reg([`${root}\\${clsid}\\LocalServer32`, '/ve']) ?? '');
      if (!value) continue;
      const exe = localServerExe(value);
      if (!fs.existsSync(exe)) continue;
      const dir = path.dirname(exe);
      // Le dossier des PuP-Packs avec la casse du disque (PinUPSystem l'écrit « PUPVideos »).
      let videos = PUP_FOLDER;
      try {
        videos = fs.readdirSync(dir).find(isPupFolderName) ?? PUP_FOLDER;
      } catch {
        /* dossier illisible : le nom habituel */
      }
      return { exe, dir, videos: path.join(dir, videos) };
    }
  }
  return undefined;
}
