// Ce que Windows dit d'une installation de VPinMAME et de VPX (registre de l'utilisateur) : là
// où ses ROM, ses sauvegardes et VPinballX.exe se trouvent, même loin du dossier des tables.
// La reprise d'une table (installation.ts) s'en sert en plus de ce qu'elle trouve sur le disque.
// Lecture seule, une fois par session ; rien n'est jamais écrit.

import { spawnSync } from 'node:child_process';
import { pinmameRegistryHints, registryDefaultValue, type InstallationHints } from '@cyberpinball/core';

const PINMAME_KEY = 'HKCU\\Software\\Freeware\\Visual PinMame\\globals';

/** Où chercher la classe VPinMAME.Controller : son CLSID, puis la DLL inscrite (64 puis 32 bits). */
const CONTROLLER_KEYS = ['HKCR\\VPinMAME.Controller\\CLSID', 'HKLM\\SOFTWARE\\Classes\\VPinMAME.Controller\\CLSID', 'HKLM\\SOFTWARE\\WOW6432Node\\Classes\\VPinMAME.Controller\\CLSID'];
const CLSID_ROOTS = ['HKCR\\CLSID', 'HKLM\\SOFTWARE\\Classes\\CLSID', 'HKLM\\SOFTWARE\\WOW6432Node\\Classes\\CLSID'];

let cached: InstallationHints | undefined;

function reg(args: string[]): string | undefined {
  const query = spawnSync('reg', ['query', ...args], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  return query.status === 0 && query.stdout ? query.stdout : undefined;
}

/** VPinMAME.dll inscrite pour VPinMAME.Controller : le VPinMAME que les tables chargent vraiment. */
function controllerDll(): string | undefined {
  for (const key of CONTROLLER_KEYS) {
    const clsid = registryDefaultValue(reg([key, '/ve']) ?? '');
    if (!clsid) continue;
    for (const root of CLSID_ROOTS) {
      const dll = registryDefaultValue(reg([`${root}\\${clsid}\\InprocServer32`, '/ve']) ?? '');
      if (dll) return dll;
    }
  }
  return undefined;
}

/** Ce que le registre a déjà dit cette session, sans le relire (jamais bloquant) ; undefined : pas encore lu. */
export function installationHintsIfKnown(): InstallationHints | undefined {
  return cached;
}

/**
 * rompath (tous ses dossiers), nvram_directory et vpxpath de VPinMAME, et le dossier où il est
 * inscrit, s'ils sont dans le registre.
 */
export function installationHints(): InstallationHints {
  if (cached) return cached;
  cached = {};
  if (process.platform !== 'win32') return cached;
  cached = pinmameRegistryHints(reg([PINMAME_KEY]) ?? '', controllerDll());
  return cached;
}
