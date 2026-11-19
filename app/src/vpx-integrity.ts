// Le dossier de VPX que Cyber Pinball a installé : ses exécutables et bibliothèques sont-ils encore
// ceux de l'archive ? Rapports de plantage du 17/11/2026 : sur une borne, un autre VPX copié par-dessus
// le nôtre (SDL 3.2.18 à la place de 3.4.14) faisait planter VPX 0,2 s après chaque lancement, sans que
// la fiche technique, la Santé ni l'écran d'échec ne le disent. Lu par la Santé de la borne, la fiche
// technique et l'écran d'échec ; « Remettre les fichiers d'origine » les tire de l'archive vérifiée.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { componentPaths, layoutOf, peFileVersion, t, tLater, type DownloadManager, type Locations } from '@cyberpinball/core';
import { activeComponent, checkComponentFiles, restoreComponentFiles, type ChangedComponentFile } from '@cyberpinball/installer';

export interface VpxFilesStatus {
  /** Dossier de la version active. */
  dir: string;
  version: string;
  changed: ChangedComponentFile[];
  /** Autres VPinballX*64.exe posés à côté du nôtre. */
  foreignExecutables: string[];
}

/** Lecture des versions : un exécutable de 27 Mo n'est relu que si sa taille ou sa date a changé. */
const versionCache = new Map<string, { stamp: string; version: string | undefined }>();

function fileVersion(file: string): string | undefined {
  try {
    const st = fs.statSync(file);
    const stamp = `${st.size}:${st.mtimeMs}`;
    const kept = versionCache.get(file);
    if (kept?.stamp === stamp) return kept.version;
    // lecture entière : exécutable de VPX, quelques dizaines de Mo
    const version = peFileVersion(fs.readFileSync(file));
    versionCache.set(file, { stamp, version });
    return version;
  } catch {
    return undefined;
  }
}

/** L'état des fichiers de la version active de VPX ; undefined : VPX absent, ou version que le manifeste ne décrit pas. */
export function vpxFilesStatus(loc: Locations): VpxFilesStatus | undefined {
  if (!loc.root) return undefined;
  const active = activeComponent(loc.root, 'vpx');
  if (!active?.entry) return undefined;
  const dir = componentPaths(loc.root, active.entry.installDir, active.version).version;
  const check = checkComponentFiles(dir, active.entry);
  if (!check) return undefined;
  return { dir, version: active.version, ...check };
}

/**
 * Les fichiers changés, courts, pour le joueur : « SDL364.dll 3.2.18.0 », « plugins/dof/plugin-dof64.dll
 * absent ». Les exécutables étrangers n'y sont pas : Cyber Pinball lance toujours le sien
 * (findExecutable), et ils ne sont qu'à côté ; le journal les nomme.
 */
export function describeVpxChanges(status: VpxFilesStatus | undefined): string[] {
  if (!status) return [];
  return status.changed.map((c) => {
    if (c.actual === undefined) return t('{file} absent', { file: c.file });
    const version = fileVersion(path.join(status.dir, ...c.file.split('/')));
    return version && version !== '0.0.0.0' ? `${c.file} ${version}` : c.file;
  });
}

/** Les fichiers modifiés de VPX, décrits ; vide quand tout est d'origine (ou que rien n'est vérifiable). */
export function vpxChangedFiles(loc: Locations): string[] {
  try {
    const status = vpxFilesStatus(loc);
    if (status?.changed.length || status?.foreignExecutables.length) {
      const changed = status.changed.map((c) => `${c.file} ${c.actual === undefined ? 'absent' : `${c.actual} o au lieu de ${c.expected}`}`); // i18n-ignore : journal
      console.log(`Fichiers de VPX ${status.version} modifiés hors de Cyber Pinball : ${[...changed, ...status.foreignExecutables.map((e) => `${e} ajouté`)].join(', ')}.`); // i18n-ignore : journal
    }
    return describeVpxChanges(status);
  } catch (error) {
    console.warn(`Fichiers de VPX non vérifiés : ${(error as Error).message}`); // i18n-ignore : journal
    return [];
  }
}

/**
 * Remet les fichiers d'origine de la version active de VPX (ceux qui ont changé ou manquent), tirés
 * de son archive vérifiée. Les exécutables étrangers sont laissés : Cyber Pinball lance toujours le
 * sien (findExecutable, Component.executable). Renvoie le nombre de fichiers remis.
 */
export async function restoreVpxFiles(loc: Locations, onProgress: (received: number, total: number) => void, downloads?: DownloadManager): Promise<number> {
  const status = vpxFilesStatus(loc);
  if (!status || !loc.root || !status.changed.length) return 0;
  const entry = activeComponent(loc.root, 'vpx')!.entry!;
  const files = status.changed.map((c) => c.file);
  const archive = path.join(layoutOf(loc.root).downloads, path.basename(new URL(entry.url).pathname));
  const job = downloads?.track({
    id: `vpx-remise-${entry.version}`,
    kind: 'component',
    title: tLater('Visual Pinball X {version}', { version: entry.version }),
    source: { kind: 'http', label: 'github.com' },
    files: [{ ref: entry.url, name: path.basename(archive), bytes: entry.size, dest: archive, part: `${archive}.part` }],
    back: { screen: 'downloads' },
    resumable: true,
  });
  try {
    await restoreComponentFiles(status.dir, entry, files, layoutOf(loc.root).downloads, (received, total) => {
      job?.progress(received, total);
      onProgress(received, total);
    });
  } catch (error) {
    job?.fail(fs.existsSync(`${archive}.part`) ? 'network' : 'http', (error as Error).message);
    throw error;
  }
  job?.done([{ index: 0, file: archive }]);
  versionCache.clear();
  console.log(`VPX ${entry.version} : fichiers d'origine remis (${files.join(', ')}).`); // i18n-ignore : journal
  return files.length;
}
