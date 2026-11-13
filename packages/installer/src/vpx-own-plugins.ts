// Plugins VPX livrés par Cyber Pinball lui-même (packages/vpx-<nom>, copiés dans le dossier
// plugins\ de VPX par l'application) : leurs réglages entrent dans le schéma de chaque version de
// VPX comme ceux des plugins de VPX (même lecture : plugin.cfg et macros MSGPI_*_SETTING), pour que
// l'écran des réglages les montre et que chaque clé écrite pour VPX y soit connue.
//
// Un dossier peut porter plusieurs plugins (packages/vpx-vision3d : Vision3D, la pause dans le casque,
// le suivi du DMD) : chacun est lu avec son .cfg et ses propres sources seulement, sans quoi les
// réglages de l'un seraient rangés sous un autre.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parsePluginConfig, parsePluginSettings, pluginEnableSetting, type VpxSettingDef } from '@cyberpinball/core';

export interface OwnPlugin {
  /** Dossier sous packages/. */
  dir: string;
  /** Son plugin.cfg, dans ce dossier. */
  cfg: string;
  /** Ses sources (macros MSGPI_*_SETTING, RegisterSetting), dans ce dossier. */
  sources: string[];
}

/**
 * Les plugins de Cyber Pinball du schéma : ceux qu'une partie ordinaire charge (components.json, enabledPlugins).
 * La pause dans le casque (cyberpinball.cfg) n'est activée que dans l'INI des parties dans le casque : hors schéma.
 */
export const OWN_PLUGINS: OwnPlugin[] = [
  { dir: 'vpx-vision3d', cfg: 'plugin.cfg', sources: ['src/vision3d.cpp', 'src/vue.h'] },
  { dir: 'vpx-vision3d', cfg: 'cyberpinball-dmd.cfg', sources: ['src/dmd-suivi.cpp', 'src/suivi-dmd.h'] },
];

/** Enable et réglages déclarés de chaque plugin de Cyber Pinball. `packagesDir` : le dossier packages/ du dépôt. */
export function ownPluginSettings(packagesDir: string): VpxSettingDef[] {
  const settings: VpxSettingDef[] = [];
  for (const own of OWN_PLUGINS) {
    const dir = path.join(packagesDir, own.dir);
    const plugin = parsePluginConfig(fs.readFileSync(path.join(dir, own.cfg), 'utf8'));
    if (!plugin) throw new Error(`${own.dir}/${own.cfg} : identifiant introuvable.`); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
    const sources = own.sources.map((p) => ({ path: p, text: fs.readFileSync(path.join(dir, p), 'utf8') }));
    settings.push(pluginEnableSetting(plugin), ...parsePluginSettings(plugin, sources));
  }
  return settings;
}
