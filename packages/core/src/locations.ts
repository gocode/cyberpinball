// Où sont les fichiers. Tout part d'une racine choisie à l'installation
// (par exemple D:\CyberPinball), avec une organisation fixe qui ne change pas
// d'une version à l'autre de Cyber Pinball ou de VPX.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { t } from './i18n';
import { readJsonFile } from './store';

export interface Layout {
  root: string;
  /** Cyber Pinball lui-même, remplacé à chaque mise à jour. */
  app: string;
  /** Émulateurs tels que publiés : emulators/<id>/<version> et la jonction emulators/<id>/current. */
  emulators: string;
  tables: string;
  /**
   * Bibliothèque de ROM : chaque ROM une seule fois, liée (lien physique) dans le
   * pinmame\roms de chaque table qui la joue. C'est aussi le dossier commun de
   * PinMAME (<racine>\pinmame, [Plugin.PinMAME] PinMAMEPath), qui sert de secours.
   */
  roms: string;
  media: string;
  /** Modèle de borne, sauvegardes, journaux. */
  data: string;
  /** Fichiers de configuration des outils tiers, indépendants de leur version (VPinballX.ini). */
  config: string;
  /** Archives téléchargées, gardées pour réinstaller sans réseau. */
  downloads: string;
  /** Tables à ajouter, déposées là depuis une clé USB : la borne les propose à l'import. */
  import: string;
  /** Corbeille : ce que Cyber Pinball retire ou remplace, jamais supprimé définitivement. */
  trash: string;
}

export function layoutOf(root: string): Layout {
  return {
    root,
    app: path.join(root, 'app'),
    emulators: path.join(root, 'emulators'),
    tables: path.join(root, 'tables'),
    roms: path.join(root, 'pinmame', 'roms'),
    media: path.join(root, 'media'),
    data: path.join(root, 'data'),
    config: path.join(root, 'config'),
    downloads: path.join(root, 'downloads'),
    import: path.join(root, 'import'),
    trash: path.join(root, 'trash'),
  };
}

/** Dossier d'une version installée, et jonction vers la version active. */
export function componentPaths(root: string, installDir: string, version: string) {
  const base = path.join(root, ...installDir.split('/'));
  return { base, version: path.join(base, version), current: path.join(base, 'current') };
}

/** Problèmes qui empêchent d'utiliser ce dossier comme racine. */
export function checkRoot(root: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  if (!path.isAbsolute(root)) problems.push(t('Le dossier doit être un chemin complet, par exemple D:\\CyberPinball.'));
  if (root.startsWith('\\\\')) problems.push(t('Un dossier réseau ne convient pas : VPX doit lire ses fichiers en local.'));
  const protectedDirs = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.SystemRoot].filter(Boolean) as string[];
  for (const dir of protectedDirs) {
    if (isInside(root, dir)) {
      problems.push(t("{dir} est protégé en écriture ; VPX et les tables ont besoin d'écrire à côté d'eux (scores, réglages).", { dir }));
    }
  }
  return problems;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export interface Locations {
  /** Fichier qui mémorise la racine choisie : %APPDATA%\CyberPinball\root.json. */
  pointerFile: string;
  root: string | undefined;
  dataDir: string;
  vpxIni: string;
  /** Ancien dossier de données d'avant le choix d'une racine. */
  legacyDataDir: string;
  /** true quand on travaille dans un bac à sable (tests, démo) : on n'écrit rien de réel. */
  sandbox: boolean;
}

/**
 * Résout les emplacements, du plus prioritaire au moins prioritaire :
 * variables d'environnement, racine mémorisée, puis anciens emplacements.
 */
export function resolveLocations(env: NodeJS.ProcessEnv = process.env): Locations {
  const appData = env.APPDATA ?? os.homedir();
  const pointerFile = path.join(appData, 'CyberPinball', 'root.json');
  const legacyDataDir = path.join(appData, 'CyberPinball');
  const root = env.CYBERPINBALL_ROOT ?? readRootPointer(pointerFile);

  // CYBERPINBALL_HOME isole tout dans un bac à sable, même si une racine existe.
  if (env.CYBERPINBALL_HOME) {
    const dataDir = env.CYBERPINBALL_HOME;
    return {
      pointerFile,
      root,
      dataDir,
      vpxIni: env.CYBERPINBALL_VPX_INI ?? path.join(dataDir, 'sandbox', 'VPinballX.ini'),
      legacyDataDir,
      sandbox: true,
    };
  }

  if (root) {
    const layout = layoutOf(root);
    return {
      pointerFile,
      root,
      dataDir: layout.data,
      vpxIni: env.CYBERPINBALL_VPX_INI ?? path.join(layout.config, 'VPinballX.ini'),
      legacyDataDir,
      sandbox: false,
    };
  }

  // Pas encore de racine : bac à sable dans l'ancien dossier de données.
  return {
    pointerFile,
    root: undefined,
    dataDir: legacyDataDir,
    vpxIni: env.CYBERPINBALL_VPX_INI ?? path.join(legacyDataDir, 'sandbox', 'VPinballX.ini'),
    legacyDataDir,
    sandbox: true,
  };
}

export function readRootPointer(pointerFile: string): string | undefined {
  if (!fs.existsSync(pointerFile)) return undefined;
  const value = (readJsonFile(pointerFile) as { root?: unknown }).root;
  return typeof value === 'string' && value ? value : undefined;
}

export function writeRootPointer(pointerFile: string, root: string): void {
  fs.mkdirSync(path.dirname(pointerFile), { recursive: true });
  fs.writeFileSync(pointerFile, JSON.stringify({ root }, null, 2) + '\n', 'utf8');
}
