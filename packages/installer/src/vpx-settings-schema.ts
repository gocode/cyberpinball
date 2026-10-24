// Schémas des réglages de VPX, un par version, livrés avec le paquet dans
// vpx-settings/<version>.json. Ils sont produits par vpx-schema-cli.ts à partir
// du code source de la version (Settings_properties.inl au commit du manifeste).

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VpxSettingsSchema } from '@cyberpinball/core';

export const VPX_SETTINGS_DIR = path.join(__dirname, '..', 'vpx-settings');

export function vpxSettingsSchemaFile(version: string, dir = VPX_SETTINGS_DIR): string {
  return path.join(dir, `${version}.json`);
}

/** Schéma de cette version de VPX, ou undefined si aucun n'a été généré pour elle. */
export function loadVpxSettingsSchema(version: string, dir = VPX_SETTINGS_DIR): VpxSettingsSchema | undefined {
  const file = vpxSettingsSchemaFile(version, dir);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as VpxSettingsSchema;
}

/**
 * Une ligne par réglage : le fichier reste lisible et ses différences d'une
 * version à l'autre de VPX se lisent directement dans git.
 */
export function serializeVpxSettingsSchema(schema: VpxSettingsSchema): string {
  const { settings, ...head } = schema;
  const header = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  const lines = settings.map((s) => `    ${JSON.stringify(s)}`).join(',\n');
  return `${header},\n  "settings": [\n${lines}\n  ]\n}\n`;
}
