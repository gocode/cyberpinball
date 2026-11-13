// Les plugins VPX de Cyber Pinball (packages/vpx-vision3d) : où les trouver, et leur copie dans <VPX>\plugins.
//
// - « Vision3D » (vision3d.ts) : suivi de la tête ;
// - « CyberPinball » (pause-vr.ts) : la pause dans le casque, activée dans l'INI des parties dans le casque seulement ;
// - « CyberPinballDmd » : le DMD remplit sa fenêtre quand elle change de taille en partie (dmd-suivi.cpp), activé
//   dans toutes les parties ([Plugin.CyberPinballDmd] Enable, components.json).
// Chacun : sa DLL et son plugin.cfg, fabriqués avec l'application (natif\<dossier>), ou construits en développement
// (build\vision3d\Release, packages\vpx-vision3d\<cfg>). VPX ouvert garde la DLL : la copie attend la partie d'après.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface VpxPluginSpec {
  /** Dossier dans <VPX>\plugins et dans natif\. */
  folder: string;
  dll: string;
  /** Le plugin.cfg dans packages\vpx-vision3d (en développement). */
  cfg: string;
}

export const VISION3D_PLUGIN: VpxPluginSpec = { folder: 'vision3d', dll: 'plugin-vision3d64.dll', cfg: 'plugin.cfg' };
export const PAUSE_PLUGIN: VpxPluginSpec = { folder: 'cyberpinball', dll: 'plugin-cyberpinball64.dll', cfg: 'cyberpinball.cfg' };
export const DMD_PLUGIN: VpxPluginSpec = { folder: 'cyberpinball-dmd', dll: 'plugin-cyberpinballdmd64.dll', cfg: 'cyberpinball-dmd.cfg' };

export type VpxPluginInstall = 'installed' | 'up-to-date' | 'missing' | 'busy';

/** plugin.cfg et la DLL : fabriqués avec l'application (natif\<dossier>), ou construits en développement. */
export function vpxPluginFiles(spec: VpxPluginSpec, appDir: string): { dll: string; cfg: string } | undefined {
  const shipped = path.join(appDir, 'natif', spec.folder);
  if (fs.existsSync(path.join(shipped, spec.dll))) return { dll: path.join(shipped, spec.dll), cfg: path.join(shipped, 'plugin.cfg') };
  for (const repo of [path.join(appDir, '..'), path.join(appDir, '..', '..')]) {
    const dll = path.join(repo, 'build', 'vision3d', 'Release', spec.dll);
    const cfg = path.join(repo, 'packages', 'vpx-vision3d', spec.cfg);
    if (fs.existsSync(dll) && fs.existsSync(cfg)) return { dll, cfg };
  }
  return undefined;
}

const sameFile = (a: string, b: string) => {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
};

/** Met le plugin dans <VPX>\plugins\<dossier> s'il n'y est pas à l'identique (VPX ouvert : la partie d'après). */
export function installVpxPlugin(spec: VpxPluginSpec, vpxDir: string, appDir: string): VpxPluginInstall {
  const files = vpxPluginFiles(spec, appDir);
  if (!files) return 'missing';
  const target = path.join(vpxDir, 'plugins', spec.folder);
  const dll = path.join(target, spec.dll);
  const cfg = path.join(target, 'plugin.cfg');
  if (sameFile(files.dll, dll) && sameFile(files.cfg, cfg)) return 'up-to-date';
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(files.cfg, cfg);
    fs.copyFileSync(files.dll, dll);
    return 'installed';
  } catch {
    return 'busy';
  }
}
