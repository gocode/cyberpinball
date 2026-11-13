// La pause dans le casque : le plugin VPX « CyberPinball » (packages/vpx-vision3d/src/cyberpinball.cpp)
// installé dans VPX comme Vision 3D, et activé seulement dans l'INI des parties dans le casque.
//
// Pendant la partie, VPX tient l'affichage du casque et son interface est collée aux yeux. Le plugin
// dessine la pause sur le fronton de la scène VR (rendu annexe de la fenêtre Backglass, voir le
// plugin) : appui court sur Pause, VPX se met en pause et le plugin montre « Reprendre » / « Quitter »
// (joystick pour choisir, Valider pour confirmer) ; appui tenu 1,5 s, la partie quitte, avec une jauge.
// Pause, Échap et le menu de VPX ne sont jamais retenus par le plugin. Hors du casque, il n'est pas
// activé, et ne dessine de toute façon jamais en 2D.

import { pauseVrSettings, type VpxSetting } from '@cyberpinball/core';
import { installVpxPlugin, PAUSE_PLUGIN, vpxPluginFiles, type VpxPluginInstall } from './vpx-plugins';

/** Appui tenu sur Pause pour quitter, en secondes (packages/vpx-vision3d/src/pause.h, QUIT_HOLD_S). */
export const QUIT_HOLD_S = 1.5;

/** plugin.cfg et la DLL : fabriqués avec l'application (natif\cyberpinball), ou construits en développement. */
export function pausePluginFiles(appDir: string): { dll: string; cfg: string } | undefined {
  return vpxPluginFiles(PAUSE_PLUGIN, appDir);
}

/** Met le plugin dans <VPX>\plugins\cyberpinball s'il n'y est pas à l'identique (VPX ouvert : la partie d'après). */
export function installPausePlugin(vpxDir: string, appDir: string): VpxPluginInstall {
  return installVpxPlugin(PAUSE_PLUGIN, vpxDir, appDir);
}

/** Les réglages du plugin pour l'INI de la partie dans le casque (activé, libellés, priorités du fronton). */
export function pauseSettingsFor(iniText: string, labels: { pause: string; resume: string; quit: string; help?: string; resumeHint?: string }): VpxSetting[] {
  return pauseVrSettings(iniText, labels);
}
