// Les plugins VPX de Cyber Pinball (packages/vpx-vision3d) : où les trouver, et leur copie dans <VPX>\plugins.
//
// - « Vision3D » (vision3d.ts) : suivi de la tête ;
// - « CyberPinball » (pause-vr.ts) : la pause dans le casque, activée dans l'INI des parties dans le casque seulement ;
// - « CyberPinballDmd » : le DMD remplit sa fenêtre quand elle change de taille en partie (dmd-suivi.cpp), activé
//   dans toutes les parties ([Plugin.CyberPinballDmd] Enable, components.json).
// Chacun : sa DLL et son plugin.cfg, fabriqués avec l'application (natif\<dossier>), ou construits en développement
// (build\vision3d\Release, packages\vpx-vision3d\<cfg>). VPX ouvert garde la DLL : la copie attend la partie d'après.
//
// Un jeu de DLL par API de plugins de VPX, même source (packages/vpx-vision3d/CMakeLists.txt) : celui de 10.8.1 à
// la place d'origine, les autres dans un sous-dossier vpx-<version> (natif\<dossier>\vpx-10.9.0,
// build\vision3d\Release\vpx-10.9.0). Chaque VPX reçoit le jeu de sa version (vpxPluginSet) : une DLL d'une autre
// API n'y recevrait aucun message (noms suffixés « :1 » en 10.9.0) ou y lirait de travers ses structures.

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

/** Les jeux de DLL de nos plugins : un par API de plugins de VPX (packages/vpx-vision3d/vendor/vpx-<jeu>). */
export type VpxPluginSet = '10.8.1' | '10.9.0';
export const VPX_PLUGIN_SETS: readonly VpxPluginSet[] = ['10.8.1', '10.9.0'];

/**
 * Le jeu de DLL pour une version de VPX (« 10.9.0-6948 », « 10.9.0.6948 », « 10.9 ») : 10.9.x, le jeu 10.9.0 ;
 * toute autre (10.8.x, inconnue, absente), le jeu 10.8.1.
 */
export function vpxPluginSet(vpxVersion: string | undefined): VpxPluginSet {
  const m = /^\s*v?(\d+)\.(\d+)(?:\D|$)/i.exec(vpxVersion ?? '');
  return m && Number(m[1]) === 10 && Number(m[2]) === 9 ? '10.9.0' : '10.8.1';
}

/** Le sous-dossier d'un jeu, à côté des DLL du jeu 10.8.1 (natif\<dossier>, build\vision3d\Release) : '' pour 10.8.1. */
export function vpxPluginSetDir(set: VpxPluginSet): string {
  return set === '10.8.1' ? '' : `vpx-${set}`;
}

/**
 * La version d'un VPX d'après le dossier où Cyber Pinball l'installe (emulators\vpx\<version>-<révision>, ex.
 * « 10.9.0-6948 ») ; undefined pour un autre nom (dossier d'avant les versions côte à côte : le VPX 10.8.1).
 */
export function vpxVersionOfDir(vpxDir: string): string | undefined {
  return /^(\d+\.\d+\.\d+)-\d+$/.exec(path.basename(vpxDir))?.[1];
}

/**
 * plugin.cfg et la DLL du jeu `set` : fabriqués avec l'application (natif\<dossier>[\vpx-<jeu>]), ou construits en
 * développement (build\vision3d\Release[\vpx-<jeu>]). Le même plugin.cfg pour tous les jeux.
 */
export function vpxPluginFiles(spec: VpxPluginSpec, appDir: string, set: VpxPluginSet = '10.8.1'): { dll: string; cfg: string } | undefined {
  const sub = vpxPluginSetDir(set);
  const shipped = path.join(appDir, 'natif', spec.folder);
  if (fs.existsSync(path.join(shipped, sub, spec.dll))) return { dll: path.join(shipped, sub, spec.dll), cfg: path.join(shipped, 'plugin.cfg') };
  for (const repo of [path.join(appDir, '..'), path.join(appDir, '..', '..')]) {
    const dll = path.join(repo, 'build', 'vision3d', 'Release', sub, spec.dll);
    const cfg = path.join(repo, 'packages', 'vpx-vision3d', spec.cfg);
    if (fs.existsSync(dll) && fs.existsSync(cfg)) return { dll, cfg };
  }
  return undefined;
}

const sameFile = (a: string, b: string) => {
  try {
    // lecture entière : fichiers d'un greffon de VPX, quelques Mo
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
};

/**
 * Met le plugin dans <VPX>\plugins\<dossier> s'il n'y est pas à l'identique (VPX ouvert : la partie d'après), dans le
 * jeu de DLL de la version de ce VPX : `vpxVersion` s'il est donné, sinon celle du nom de son dossier (vpxVersionOfDir).
 */
export function installVpxPlugin(spec: VpxPluginSpec, vpxDir: string, appDir: string, vpxVersion: string | undefined = vpxVersionOfDir(vpxDir)): VpxPluginInstall {
  const files = vpxPluginFiles(spec, appDir, vpxPluginSet(vpxVersion));
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
