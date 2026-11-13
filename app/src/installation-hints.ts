// Ce que Windows dit d'une installation de VPinMAME et de VPX (registre de l'utilisateur) : là
// où ses ROM, ses sauvegardes et VPinballX.exe se trouvent, même loin du dossier des tables.
// La reprise d'une table (installation.ts) s'en sert en plus de ce qu'elle trouve sur le disque.
// Lecture seule, une fois par session ; rien n'est jamais écrit.

import { spawnSync } from 'node:child_process';
import type { InstallationHints } from '@cyberpinball/core';

const PINMAME_KEY = 'HKCU\\Software\\Freeware\\Visual PinMame\\globals';

let cached: InstallationHints | undefined;

/** rompath, nvram_directory et vpxpath de VPinMAME, s'ils sont dans le registre. */
export function installationHints(): InstallationHints {
  if (cached) return cached;
  cached = {};
  if (process.platform !== 'win32') return cached;
  const query = spawnSync('reg', ['query', PINMAME_KEY], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (query.status !== 0 || !query.stdout) return cached;
  const value = (name: string) => new RegExp(`^\\s*${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.+?)\\s*$`, 'im').exec(query.stdout)?.[1];
  const roms = value('rompath');
  const nvram = value('nvram_directory');
  const vpx = value('vpxpath');
  // rompath peut lister plusieurs dossiers (« a;b ») : le premier est celui où VPinMAME range.
  if (roms) cached.roms = roms.split(';')[0]!.trim();
  if (nvram) cached.nvram = nvram.split(';')[0]!.trim();
  if (vpx) cached.vpx = vpx.trim();
  return cached;
}
