// Les fichiers d'un composant installé, comparés à ceux de son archive (Component.files).
//
// Rapports de plantage du 17/11/2026 (Demolition Man, Diablo) : sur une borne, VPX s'arrêtait
// 0,2 s après chaque lancement, avant d'écrire une ligne de son journal. Entre deux démarrages de
// Cyber Pinball, la bibliothèque SDL de son dossier était passée de 3.4.14 (celle de notre VPX) à
// 3.2.18 : le dossier avait été modifié hors de Cyber Pinball (un autre VPX copié par-dessus). La
// fiche technique disait pourtant « VPX 10.8.1-5436 », lue dans le marqueur d'installation, jamais
// dans les fichiers. Ici, la règle qui le voit pour tout composant décrit : chaque exécutable et
// bibliothèque de l'archive, par sa taille (un simple stat, à chaque relevé), et les exécutables
// étrangers posés à côté du nôtre ; puis la remise des fichiers d'origine, tirés de l'archive vérifiée.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { renameWithRetry } from '@cyberpinball/core';
import { downloadComponent, type Progress } from './download';
import { extractZip } from './fsutil';
import type { Component } from './manifest';

/** Un fichier de l'archive qui n'est plus celui d'origine dans le dossier installé. */
export interface ChangedComponentFile {
  /** Chemin relatif, séparé par des « / » (« plugins/dof/plugin-dof64.dll »). */
  file: string;
  /** Taille dans l'archive. */
  expected: number;
  /** Taille trouvée ; absente : le fichier manque. */
  actual?: number;
}

export interface ComponentFilesCheck {
  changed: ChangedComponentFile[];
  /** Exécutables qui répondent à executablePattern sans être celui du manifeste (un autre VPX posé à côté). */
  foreignExecutables: string[];
}

/**
 * Les fichiers du composant installé dans `dir` comparés à son archive. undefined : le manifeste ne
 * les décrit pas pour cette version (rien d'affirmé).
 */
export function checkComponentFiles(dir: string, component: Pick<Component, 'files' | 'executable' | 'executablePattern'>): ComponentFilesCheck | undefined {
  if (!component.files || !Object.keys(component.files).length) return undefined;
  const changed: ChangedComponentFile[] = [];
  for (const [file, expected] of Object.entries(component.files)) {
    let actual: number | undefined;
    try {
      actual = fs.statSync(path.join(dir, ...file.split('/'))).size;
    } catch {
      actual = undefined;
    }
    if (actual !== expected) changed.push({ file, expected, ...(actual !== undefined && { actual }) });
  }
  const re = new RegExp(component.executablePattern, 'i');
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    names = [];
  }
  const own = component.executable?.toLowerCase();
  const foreignExecutables = own ? names.filter((n) => re.test(n) && n.toLowerCase() !== own) : [];
  return { changed, foreignExecutables };
}

/**
 * Remet les fichiers d'origine (`files`, chemins de Component.files) dans le dossier installé `dir` :
 * l'archive est téléchargée si besoin et vérifiée (SHA-256), seuls ces fichiers en sont extraits, puis
 * mis en place un à un. Le reste du dossier (réglages, plugins de Cyber Pinball, VPReg.stg) n'est pas touché.
 */
export async function restoreComponentFiles(dir: string, component: Component, files: readonly string[], downloadsDir: string, onProgress?: Progress): Promise<void> {
  const known = new Set(Object.keys(component.files ?? {}));
  const wanted = files.filter((f) => known.has(f));
  if (!wanted.length) return;
  const archive = await downloadComponent(component, downloadsDir, onProgress);
  const staging = `${dir}.remise`;
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    extractZip(archive, staging, wanted);
    for (const file of wanted) {
      const from = path.join(staging, ...file.split('/'));
      if (!fs.existsSync(from)) throw new Error(`${file} absent de l'archive de ${component.name} ${component.version}`); // i18n-ignore : erreur technique
      const to = path.join(dir, ...file.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.rmSync(to, { force: true });
      // L'antivirus tient souvent un exécutable qui vient d'être extrait : renommage réessayé (atomicwrite.ts).
      renameWithRetry(from, to);
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
