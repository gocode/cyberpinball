import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CABINET_FILE,
  checkRoot,
  componentPaths,
  layoutOf,
  configIniPath,
  copyTree,
  renameWithRetry,
  t,
  updateCabinetSet,
  writeRootPointer,
  type Locations,
} from '@cyberpinball/core';
import { downloadComponent, type Progress } from './download';
import { extractZip, findExecutable, flattenSingleFolder, freeBytes, isLink, pointJunction, sha256OfFile } from './fsutil';
import { loadManifest, type Component } from './manifest';

export * from './manifest';
export { downloadComponent } from './download';
export * from './vpx-settings-schema';
export * from './vpx-own-plugins';
export * from './component-files';

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
    throw new Error(t('Il reste {free} Go sur ce disque ; il en faut au moins 2 pour VPX et quelques tables.', { free: (free / 1024 ** 3).toFixed(1) }));
  }

  const migrated: string[] = [];
  const copyIfMissing = (from: string, to: string) => {
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      copyTree(from, to);
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
  // Un marqueur réécrit par un autre outil (Windows PowerShell 5.1 met un BOM en UTF-8) reste lisible.
  const version = (JSON.parse(fs.readFileSync(marker, 'utf8').replace(/^﻿/, '')) as { version: string }).version;
  return { version, entry: loadManifest().find((c) => c.id === id && c.version === version) };
}

/** État d'un composant dans la racine, sans rien modifier. */
export function componentStatus(root: string, component: Component) {
  const paths = componentPaths(root, component.installDir, component.version);
  const executable = findExecutable(paths.version, component.executablePattern, component.executable);
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
export async function installComponent(root: string, component: Component, onProgress?: Progress, opts: InstallOptions = {}): Promise<InstalledComponent> {
  // Pilote ou runtime : un installateur de son éditeur, lancé avec l'accord de Windows, jamais une archive à extraire.
  if (component.kind === 'driver' || component.kind === 'runtime') throw new Error(t('{name} s’installe par l’installateur de son éditeur, pas par extraction.', { name: component.name }));
  const layout = layoutOf(root);
  const status = componentStatus(root, component);
  const { paths } = status;

  if (!status.installed && component.distribution === 'manual' && !opts.archive) {
    throw new Error(
      t('{name} ne peut pas être redistribué : télécharge-le depuis {homepage} et décompresse-le dans {folder}.', { name: component.name, homepage: component.homepage, folder: paths.version }),
    );
  }

  if (!status.installed) {
    const archive = opts.archive ? await verifiedArchive(component, opts.archive) : await downloadComponent(component, layout.downloads, onProgress);
    const staging = `${paths.version}.extraction`;
    fs.rmSync(staging, { recursive: true, force: true });
    extractZip(archive, staging);
    flattenSingleFolder(staging);
    unwrapInnerZip(staging, component);
    if (!findExecutable(staging, component.executablePattern, component.executable)) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw new Error(t("Aucun exécutable correspondant à {pattern} dans l'archive de {name}.", { pattern: component.executablePattern, name: component.name }));
    }
    fs.writeFileSync(
      path.join(staging, MARKER),
      JSON.stringify({ ...component, installedAt: new Date().toISOString() }, null, 2) + '\n',
    );
    fs.mkdirSync(paths.base, { recursive: true });
    // L'antivirus tient souvent l'exécutable qui vient d'être extrait : renommage réessayé (atomicwrite.ts).
    renameWithRetry(staging, paths.version);
  }

  // Une version d'essai s'installe à côté sans devenir active : « current » reste sur l'habituelle.
  if (opts.activate === false) {
    const executable = findExecutable(paths.version, component.executablePattern, component.executable)!;
    return { component, dir: paths.version, current: paths.current, executable, alreadyInstalled: status.installed };
  }
  pointJunction(paths.current, paths.version);
  const executable = findExecutable(paths.current, component.executablePattern, component.executable)!;
  return { component, dir: paths.version, current: paths.current, executable, alreadyInstalled: status.installed };
}

export interface InstallOptions {
  /** false : installer à côté sans repointer « current » (version d'essai). Vrai par défaut. */
  activate?: boolean;
  /** Archive déjà sur le disque (composant à distribution manuelle) : vérifiée par son SHA-256. */
  archive?: string;
}

/**
 * Un artefact de la CI de GitHub est une archive qui peut n'en contenir qu'une autre : sans
 * exécutable mais avec un seul .zip, celui-ci est décompressé à sa place.
 */
function unwrapInnerZip(staging: string, component: Component): void {
  if (findExecutable(staging, component.executablePattern, component.executable)) return;
  const entries = fs.readdirSync(staging);
  if (entries.length !== 1 || !/\.zip$/i.test(entries[0]!)) return;
  const inner = path.join(staging, entries[0]!);
  const unpacked = `${staging}.interieur`;
  fs.rmSync(unpacked, { recursive: true, force: true });
  extractZip(inner, unpacked);
  flattenSingleFolder(unpacked);
  fs.rmSync(staging, { recursive: true, force: true });
  renameWithRetry(unpacked, staging);
}

/** L'archive fournie, si son empreinte est celle du manifeste ; sinon une erreur, et rien n'est installé. */
async function verifiedArchive(component: Component, archive: string): Promise<string> {
  const actual = await sha256OfFile(archive);
  if (actual !== component.sha256) {
    throw new Error(t('Empreinte SHA-256 incorrecte pour {name} : attendu {expected}, obtenu {actual}.', { name: component.name, expected: component.sha256, actual }));
  }
  return archive;
}

/**
 * Cherche dans des dossiers (Téléchargements…) l'archive d'un composant à distribution manuelle :
 * la bonne taille, puis la bonne empreinte, quel que soit son nom (« … (1).zip »).
 */
export async function findLocalArchive(component: Component, dirs: string[]): Promise<string | undefined> {
  for (const dir of dirs) {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.zip$/i.test(name)) continue;
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).size !== component.size) continue;
      } catch {
        continue;
      }
      if ((await sha256OfFile(file)) === component.sha256) return file;
    }
  }
  return undefined;
}
