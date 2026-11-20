import * as path from 'node:path';
import {
  DEFAULT_VPX_PROFILE,
  readRootPointer,
  resolveLocations,
  withVpxIniFolder,
  writeRootPointer,
  type Locations,
  type VpxProfile,
} from '@cyberpinball/core';
import { componentStatus, loadManifest } from '@cyberpinball/installer';
import { seedTrialIni, trialVpxAllowed, vpxInUse, type VpxInUse } from './vpx-essai';

/** Mode d'essai de VPX permis ici : lancé depuis les sources, ou canal d'essai privé (vpx-essai.ts). */
export function trialVpxAllowedHere(): boolean {
  return trialVpxAllowed({ installed: Boolean(installedRoot()) });
}

/** La version de VPX que les parties lancent : la version d'essai choisie, sinon la version active. */
export function vpxCurrent(loc: Locations): VpxInUse | undefined {
  return vpxInUse(loc, { allowed: trialVpxAllowedHere() });
}

/**
 * Exécutable de la version de VPX des parties : la version active (jonction « current »), ou la
 * version d'essai choisie (son propre dossier).
 */
export function vpxInstall(loc: Locations): { exe: string; version: string; trial?: boolean } | undefined {
  if (!loc.root) return undefined;
  const used = vpxCurrent(loc);
  if (!used) return undefined;
  const component = used.entry ?? loadManifest().find((c) => c.id === 'vpx' && !c.trial);
  if (!component) return undefined;
  const status = componentStatus(loc.root, { ...component, version: used.version });
  if (!status.executable) return undefined;
  const dir = used.trial ? status.paths.version : status.paths.current;
  return { exe: path.join(dir, path.basename(status.executable)), version: used.version, ...(used.trial && { trial: true }) };
}

/**
 * Emplacements effectifs. Installé, l'exécutable se trouve dans <racine>\app\ :
 * il prend le dossier parent comme racine, sans rien demander. Lancé depuis les
 * sources, il utilise la racine mémorisée, ou le bac à sable tant qu'il n'y en a pas.
 * En mode d'essai de VPX, les VPinballX.ini sont ceux de la version d'essai (vpx-essai.ts).
 */
export function locations(): Locations {
  const self = installedRoot();
  const loc = resolveLocations({ ...process.env, CYBERPINBALL_ROOT: process.env.CYBERPINBALL_ROOT ?? self });
  // Les outils lancés à côté (synchronisation, installeur) retrouvent ainsi la même racine.
  if (self && !process.env.CYBERPINBALL_HOME && readRootPointer(loc.pointerFile) !== self) {
    writeRootPointer(loc.pointerFile, self);
  }
  const used = vpxCurrent(loc);
  return used?.trial ? withVpxIniFolder(loc, (baseIni) => seedTrialIni(baseIni, used.version)) : loc;
}

/** Racine d'une installation : le dossier qui contient app\CyberPinball.exe. */
function installedRoot(): string | undefined {
  const exeDir = path.dirname(process.execPath);
  return path.basename(exeDir).toLowerCase() === 'app' ? path.dirname(exeDir) : undefined;
}

export function backupDir(dataDir: string): string {
  return path.join(dataDir, 'backups');
}

/**
 * Profil de la version de VPX installée (manifeste), sinon celui de la version
 * que Cyber Pinball installerait. Une version inconnue du manifeste garde le profil par défaut.
 */
export function vpxProfile(loc: Locations): { profile: VpxProfile; source: string } {
  const active = loc.root ? vpxCurrent(loc) : undefined;
  const entry = active ? active.entry : loadManifest().find((c) => c.id === 'vpx' && !c.trial);
  if (active && !active.entry) {
    return { profile: DEFAULT_VPX_PROFILE, source: `VPX ${active.version}, absent du manifeste : profil par défaut` }; // i18n-ignore : sortie console de npm run sync
  }
  const settings = (entry?.adapterSettings ?? {}) as Partial<VpxProfile>;
  return {
    profile: { ...DEFAULT_VPX_PROFILE, ...settings },
    source: `VPX ${entry?.version ?? '?'}${active ? '' : ' (pas encore installé)'}`, // i18n-ignore : sortie console de npm run sync
  };
}
