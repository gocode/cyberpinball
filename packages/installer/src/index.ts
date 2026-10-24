import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CABINET_FILE,
  checkRoot,
  componentPaths,
  layoutOf,
  configIniPath,
  updateCabinetSet,
  writeRootPointer,
  type Locations,
} from '@cyberpinball/core';
import { downloadComponent, type Progress } from './download';
import { extractZip, findExecutable, flattenSingleFolder, freeBytes, isLink, pointJunction } from './fsutil';
import { loadManifest, type Component } from './manifest';

export * from './manifest';
export { downloadComponent } from './download';
export * from './vpx-settings-schema';

const MARKER = '.cyberpinball-component.json';
const MIN_FREE_BYTES = 2 * 1024 ** 3;

export interface SetupReport {
  root: string;
  migrated: string[];
}

/**
 * Choisit la racine : vérifie le dossier, crée l'organisation, mémorise le choix
 * et reprend les données d'avant (modèle de borne, sauvegardes, VPinballX.ini du bac à sable).
 */
export function setupRoot(root: string, locations: Locations): SetupReport {
  const problems = checkRoot(root);
  if (problems.length) throw new Error(problems.join('\n'));

  const layout = layoutOf(root);
  for (const dir of [layout.emulators, layout.tables, layout.media, layout.data, layout.config, layout.downloads, layout.import]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const free = freeBytes(root);
  if (free !== undefined && free < MIN_FREE_BYTES) {
    throw new Error(`Il reste ${(free / 1024 ** 3).toFixed(1)} Go sur ce disque ; il en faut au moins 2 pour VPX et quelques tables.`);
  }

  const migrated: string[] = [];
  const copyIfMissing = (from: string, to: string) => {
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.cpSync(from, to, { recursive: true });
      migrated.push(to);
    }
  };
  if (path.resolve(locations.legacyDataDir) !== path.resolve(layout.data)) {
    copyIfMissing(path.join(locations.legacyDataDir, CABINET_FILE), path.join(layout.data, CABINET_FILE));
    copyIfMissing(path.join(locations.legacyDataDir, 'backups'), path.join(layout.data, 'backups'));
    // Le VPinballX.ini de chaque configuration de borne (VPinballX.ini, VPinballX-<id>.ini).
    const sandbox = path.join(locations.legacyDataDir, 'sandbox');
    for (const file of fs.existsSync(sandbox) ? fs.readdirSync(sandbox) : []) {
      if (/^VPinballX(-[\w-]+)?\.ini$/i.test(file)) copyIfMissing(path.join(sandbox, file), path.join(layout.config, file));
    }
  }

  // Le modèle repris pointe encore vers les VPinballX.ini du bac à sable.
  const vpxIni = path.join(layout.config, 'VPinballX.ini');
  updateCabinetSet(layout.data, (set) => ({ ...set, configurations: set.configurations.map((c) => ({ ...c, vpx: { iniPath: configIniPath(vpxIni, c) } })) }));

  writeRootPointer(locations.pointerFile, root);
  return { root, migrated };
}

export interface InstalledComponent {
  component: Component;
  dir: string;
  current: string;
  executable: string;
  alreadyInstalled: boolean;
}

/**
 * Entrée du manifeste correspondant à la version active d'un composant (celle
 * vers laquelle pointe « current »). C'est le manifeste, pas le fichier écrit à
 * l'installation, qui fait foi : ce qu'on apprend d'une version s'y ajoute ensuite.
 */
export function activeComponent(root: string, id: string): { version: string; entry: Component | undefined } | undefined {
  const sample = loadManifest().find((c) => c.id === id);
  if (!sample) return undefined;
  const current = componentPaths(root, sample.installDir, sample.version).current;
  const marker = path.join(current, MARKER);
  if (!fs.existsSync(marker)) return undefined;
  const version = (JSON.parse(fs.readFileSync(marker, 'utf8')) as { version: string }).version;
  return { version, entry: loadManifest().find((c) => c.id === id && c.version === version) };
}

/** État d'un composant dans la racine, sans rien modifier. */
export function componentStatus(root: string, component: Component) {
  const paths = componentPaths(root, component.installDir, component.version);
  const executable = findExecutable(paths.version, component.executablePattern);
  const currentTarget = isLink(paths.current) ? fs.realpathSync(paths.current) : undefined;
  return {
    paths,
    installed: Boolean(executable),
    executable,
    active: currentTarget !== undefined && path.resolve(currentTarget) === path.resolve(paths.version),
  };
}

/**
 * Installe une version à côté des autres, puis la rend active. Chaque version
 * reste dans son propre dossier : revenir en arrière revient à repointer « current ».
 */
export async function installComponent(root: string, component: Component, onProgress?: Progress): Promise<InstalledComponent> {
  const layout = layoutOf(root);
  const status = componentStatus(root, component);
  const { paths } = status;

  if (!status.installed && component.distribution === 'manual') {
    throw new Error(
      `${component.name} ne peut pas être redistribué : téléchargez-le depuis ${component.homepage} et décompressez-le dans ${paths.version}.`,
    );
  }

  if (!status.installed) {
    const archive = await downloadComponent(component, layout.downloads, onProgress);
    const staging = `${paths.version}.extraction`;
    fs.rmSync(staging, { recursive: true, force: true });
    extractZip(archive, staging);
    flattenSingleFolder(staging);
    if (!findExecutable(staging, component.executablePattern)) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw new Error(`Aucun exécutable correspondant à ${component.executablePattern} dans l'archive de ${component.name}.`);
    }
    fs.writeFileSync(
      path.join(staging, MARKER),
      JSON.stringify({ ...component, installedAt: new Date().toISOString() }, null, 2) + '\n',
    );
    fs.mkdirSync(paths.base, { recursive: true });
    fs.renameSync(staging, paths.version);
  }

  pointJunction(paths.current, paths.version);
  const executable = findExecutable(paths.current, component.executablePattern)!;
  return { component, dir: paths.version, current: paths.current, executable, alreadyInstalled: status.installed };
}
