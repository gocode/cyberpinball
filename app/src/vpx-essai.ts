// Mode d'essai de VPX : basculer, sur la même installation, entre le VPX de Cyber Pinball et une
// version d'essai (préversion de VPX décrite dans le manifeste avec « trial »), sans réinstaller.
//
// - Chaque version vit dans son dossier (emulators\vpx\<version>) ; la jonction « current » reste
//   sur le VPX de Cyber Pinball : le pare-feu, l'installeur et un retour arrière n'en dépendent pas.
// - Le choix tient dans <données>\vpx-essai.json ({ "version": "10.9.0-6948" }) : présent, les
//   parties lancent la version d'essai ; absent, le VPX de Cyber Pinball. Changer de mode
//   redémarre Cyber Pinball : tout ce qui lit la version au démarrage la relit.
// - La version d'essai a ses propres VPinballX.ini (dossier vpx-<majeure.mineure> à côté du
//   VPinballX.ini habituel), créés d'après ceux du VPX de Cyber Pinball au premier passage : elle
//   ne réécrit jamais ceux de l'autre version. Les tables, médias, ROM et réglages du front-end
//   restent partagés.
// - Réservé à qui maintient Cyber Pinball : seulement sur une machine qui a sa clé développeur signée
//   (devkey.ts, cle-developpeur.ts). Ailleurs, même lancé depuis les sources, le fichier de choix est ignoré.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { componentPaths, readJsonFile, renameWithRetry, writeFileAtomic, type Locations } from '@cyberpinball/core';
import { activeComponent, loadManifest, type Component } from '@cyberpinball/installer';

export const TRIAL_CHOICE_FILE = 'vpx-essai.json';

/** Les versions d'essai de VPX que le manifeste décrit. */
export function trialVpxEntries(manifest: Component[] = loadManifest()): Component[] {
  return manifest.filter((c) => c.id === 'vpx' && c.trial === true);
}

/**
 * Le mode d'essai est-il permis sur ce poste ? Seulement avec une clé développeur valable pour cette
 * machine (signée par la clé de publication) ; jamais chez un joueur, même lancé depuis les sources.
 */
export function trialVpxAllowed(devKey: { nom: string } | undefined): boolean {
  return devKey !== undefined;
}

/** La version d'essai choisie dans le fichier de choix, ou undefined (mode habituel). */
export function readTrialChoice(dataDir: string): string | undefined {
  const file = path.join(dataDir, TRIAL_CHOICE_FILE);
  if (!fs.existsSync(file)) return undefined;
  try {
    const version = (readJsonFile(file) as { version?: unknown }).version;
    return typeof version === 'string' && version ? version : undefined;
  } catch {
    return undefined;
  }
}

/** Enregistre le mode : une version d'essai, ou undefined pour revenir au VPX de Cyber Pinball. */
export function writeTrialChoice(dataDir: string, version: string | undefined): void {
  const file = path.join(dataDir, TRIAL_CHOICE_FILE);
  if (!version) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(file, JSON.stringify({ version, choisiLe: new Date().toISOString() }, null, 2) + '\n');
}

/** Dossier des VPinballX.ini d'une version d'essai : « vpx-10.9 » à côté du VPinballX.ini habituel. */
export function trialIniDir(baseIni: string, version: string): string {
  const minor = version.split(/[.-]/).slice(0, 2).join('.');
  return path.join(path.dirname(baseIni), `vpx-${minor}`);
}

/**
 * Crée le dossier des .ini d'essai au premier passage, avec une copie des .ini du VPX de Cyber
 * Pinball (VPinballX.ini et ceux des configurations) : la version d'essai part des mêmes réglages,
 * puis vit sa vie. Un dossier déjà là n'est jamais écrasé.
 */
export function seedTrialIni(baseIni: string, version: string): string {
  const dir = trialIniDir(baseIni, version);
  if (fs.existsSync(dir)) return dir;
  const staging = `${dir}.creation`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const source = path.dirname(baseIni);
  if (fs.existsSync(source)) {
    for (const name of fs.readdirSync(source)) {
      if (!/\.ini$/i.test(name)) continue;
      const from = path.join(source, name);
      if (fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(staging, name));
    }
  }
  renameWithRetry(staging, dir);
  return dir;
}

export interface VpxInUse {
  version: string;
  /** Entrée du manifeste, undefined pour une version qu'il ne décrit pas. */
  entry: Component | undefined;
  /** Dossier de la version (jamais la jonction pour une version d'essai). */
  dir: string;
  trial: boolean;
}

/**
 * La version d'essai à utiliser, si le mode est choisi, permis, décrit par le manifeste et installé.
 * Sinon undefined : on reste sur le VPX de Cyber Pinball.
 */
export function trialVpxInUse(root: string, dataDir: string, opts: { allowed: boolean; manifest?: Component[] }): VpxInUse | undefined {
  if (!opts.allowed) return undefined;
  const version = readTrialChoice(dataDir);
  if (!version) return undefined;
  const entry = trialVpxEntries(opts.manifest).find((c) => c.version === version);
  if (!entry) return undefined;
  const dir = componentPaths(root, entry.installDir, entry.version).version;
  if (!fs.existsSync(dir)) return undefined;
  return { version, entry, dir, trial: true };
}

/** La version de VPX que les parties lancent : celle d'essai si elle s'applique, sinon la version active. */
export function vpxInUse(loc: Locations, opts: { allowed: boolean; manifest?: Component[] }): VpxInUse | undefined {
  if (!loc.root) return undefined;
  const trial = trialVpxInUse(loc.root, loc.dataDir, opts);
  if (trial) return trial;
  const active = activeComponent(loc.root, 'vpx');
  if (!active) return undefined;
  const sample = active.entry ?? loadManifest().find((c) => c.id === 'vpx');
  if (!sample) return undefined;
  return { version: active.version, entry: active.entry, dir: componentPaths(loc.root, sample.installDir, active.version).current, trial: false };
}
