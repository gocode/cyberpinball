// Plugins VPX livrés par Cyber Pinball lui-même (packages/vpx-<nom>, copiés dans le dossier
// plugins\ de VPX par l'application) : leurs réglages entrent dans le schéma de chaque version de
// VPX comme ceux des plugins de VPX (même lecture : plugin.cfg et macros MSGPI_*_SETTING), pour que
// l'écran des réglages les montre et que chaque clé écrite pour VPX y soit connue.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parsePluginConfig, parsePluginSettings, pluginEnableSetting, type VpxSettingDef } from '@cyberpinball/core';

/** Dossiers des plugins de Cyber Pinball, à côté de ce paquet (packages/). */
export const OWN_PLUGIN_DIRS = ['vpx-vision3d'];

function sourcesOf(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const sub of ['src']) {
    const abs = path.join(dir, sub);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).filter((f) => /\.(cpp|h)$/.test(f))) out.push({ path: `${sub}/${name}`, text: fs.readFileSync(path.join(abs, name), 'utf8') });
  }
  return out;
}

/** Enable et réglages déclarés de chaque plugin de Cyber Pinball. `packagesDir` : le dossier packages/ du dépôt. */
export function ownPluginSettings(packagesDir: string): VpxSettingDef[] {
  const settings: VpxSettingDef[] = [];
  for (const name of OWN_PLUGIN_DIRS) {
    const dir = path.join(packagesDir, name);
    const plugin = parsePluginConfig(fs.readFileSync(path.join(dir, 'plugin.cfg'), 'utf8'));
    if (!plugin) throw new Error(`${name}/plugin.cfg : identifiant introuvable.`); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
    settings.push(pluginEnableSetting(plugin), ...parsePluginSettings(plugin, sourcesOf(dir)));
  }
  return settings;
}
