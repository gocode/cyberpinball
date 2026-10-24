import * as path from 'node:path';
import {
  DEFAULT_VPX_PROFILE,
  readRootPointer,
  resolveLocations,
  writeRootPointer,
  type Locations,
  type VpxProfile,
} from '@cyberpinball/core';
import { activeComponent, componentStatus, loadManifest } from '@cyberpinball/installer';

/** Exécutable de la version active de VPX, atteint par la jonction « current ». */
export function vpxInstall(loc: Locations): { exe: string; version: string } | undefined {
  if (!loc.root) return undefined;
  const active = activeComponent(loc.root, 'vpx');
  if (!active) return undefined;
  const component = active.entry ?? loadManifest().find((c) => c.id === 'vpx');
  if (!component) return undefined;
  const status = componentStatus(loc.root, { ...component, version: active.version });
  if (!status.executable) return undefined;
  return { exe: path.join(status.paths.current, path.basename(status.executable)), version: active.version };
}

/**
 * Emplacements effectifs. Installé, l'exécutable se trouve dans <racine>\app\ :
 * il prend le dossier parent comme racine, sans rien demander. Lancé depuis les
 * sources, il utilise la racine mémorisée, ou le bac à sable tant qu'il n'y en a pas.
 */
export function locations(): Locations {
  const self = installedRoot();
  const loc = resolveLocations({ ...process.env, CYBERPINBALL_ROOT: process.env.CYBERPINBALL_ROOT ?? self });
  // Les outils lancés à côté (synchronisation, installeur) retrouvent ainsi la même racine.
  if (self && !process.env.CYBERPINBALL_HOME && readRootPointer(loc.pointerFile) !== self) {
    writeRootPointer(loc.pointerFile, self);
  }
  return loc;
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
  const active = loc.root ? activeComponent(loc.root, 'vpx') : undefined;
  const entry = active ? active.entry : loadManifest().find((c) => c.id === 'vpx');
  if (active && !active.entry) {
    return { profile: DEFAULT_VPX_PROFILE, source: `VPX ${active.version}, absent du manifeste : profil par défaut` }; // i18n-ignore : sortie console de npm run sync
  }
  const settings = (entry?.adapterSettings ?? {}) as Partial<VpxProfile>;
  return {
    profile: { ...DEFAULT_VPX_PROFILE, ...settings },
    source: `VPX ${entry?.version ?? '?'}${active ? '' : ' (pas encore installé)'}`, // i18n-ignore : sortie console de npm run sync
  };
}
