import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from '@cyberpinball/core';

/**
 * emulator : un moteur de tables (VPX, plus tard Future Pinball…), branché à un adaptateur du même id.
 * tool : un outil annexe (configuration DOF, DMD…).
 */
export type ComponentKind = 'emulator' | 'tool';

/**
 * automatic : licence compatible, Cyber Pinball le livre ou le télécharge lui-même.
 * manual : non redistribuable ; l'utilisateur le télécharge depuis `homepage`, Cyber Pinball le détecte.
 */
export type Distribution = 'automatic' | 'manual';

export interface Component {
  id: string;
  kind: ComponentKind;
  distribution: Distribution;
  name: string;
  homepage: string;
  version: string;
  channel: string;
  platform: string;
  variant?: string;
  /** Chemin relatif à la racine, séparé par des « / ». */
  installDir: string;
  url: string;
  sha256: string;
  size: number;
  /** Expression régulière du nom de l'exécutable principal, cherché après extraction. */
  executablePattern: string;
  /**
   * Ce que l'adaptateur du même id doit savoir de cette version précise
   * (pour VPX : format des noms d'écran, plugins à activer). Lu par l'adaptateur, opaque ici.
   */
  adapterSettings?: Record<string, unknown>;
  license: string;
  source: string;
  /**
   * Commit du code source de cette version précise. Sert à générer le schéma
   * de ses réglages (vpx-settings/<version>.json, `npm run vpx-schema`).
   */
  sourceCommit?: string;
}

/** Le manifeste est livré avec le paquet, à côté de dist/. */
export const MANIFEST_FILE = path.join(__dirname, '..', 'components.json');

export function loadManifest(file = MANIFEST_FILE): Component[] {
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { components: Component[] }).components;
}

export function findComponent(id: string, file = MANIFEST_FILE): Component {
  const component = loadManifest(file).find((c) => c.id === id);
  if (!component) throw new Error(t('Composant inconnu dans le manifeste : {id}', { id }));
  return component;
}
