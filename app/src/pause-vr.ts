// La pause dans le casque : le plugin VPX « CyberPinball » (packages/vpx-vision3d/src/cyberpinball.cpp)
// installé dans VPX comme Vision 3D, et activé seulement dans l'INI des parties dans le casque.
//
// Pendant la partie, VPX tient l'affichage du casque et son interface est collée aux yeux. Le plugin
// dessine la pause sur le fronton de la scène VR (rendu annexe de la fenêtre Backglass, voir le
// plugin) : appui court sur Pause, « Reprendre » / « Quitter » ; appui tenu 1,5 s, la partie quitte,
// avec une jauge. Hors du casque, il n'est pas activé, et ne dessine de toute façon jamais en 2D.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pauseVrSettings, type VpxSetting } from '@cyberpinball/core';

/** Appui tenu sur Pause pour quitter, en secondes (packages/vpx-vision3d/src/pause.h, QUIT_HOLD_S). */
export const QUIT_HOLD_S = 1.5;

const PLUGIN_DLL = 'plugin-cyberpinball64.dll';
const PLUGIN_FOLDER = 'cyberpinball';

/** plugin.cfg et la DLL : fabriqués avec l'application (natif\cyberpinball), ou construits en développement. */
export function pausePluginFiles(appDir: string): { dll: string; cfg: string } | undefined {
  const shipped = path.join(appDir, 'natif', PLUGIN_FOLDER);
  if (fs.existsSync(path.join(shipped, PLUGIN_DLL))) return { dll: path.join(shipped, PLUGIN_DLL), cfg: path.join(shipped, 'plugin.cfg') };
  for (const repo of [path.join(appDir, '..'), path.join(appDir, '..', '..')]) {
    const dll = path.join(repo, 'build', 'vision3d', 'Release', PLUGIN_DLL);
    const cfg = path.join(repo, 'packages', 'vpx-vision3d', 'cyberpinball.cfg');
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

/** Met le plugin dans <VPX>\plugins\cyberpinball s'il n'y est pas à l'identique (VPX ouvert : la partie d'après). */
export function installPausePlugin(vpxDir: string, appDir: string): 'installed' | 'up-to-date' | 'missing' | 'busy' {
  const files = pausePluginFiles(appDir);
  if (!files) return 'missing';
  const target = path.join(vpxDir, 'plugins', PLUGIN_FOLDER);
  const dll = path.join(target, PLUGIN_DLL);
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

/** Les réglages du plugin pour l'INI de la partie dans le casque (activé, libellés, priorités du fronton). */
export function pauseSettingsFor(iniText: string, labels: { pause: string; resume: string; quit: string }): VpxSetting[] {
  return pauseVrSettings(iniText, labels);
}
