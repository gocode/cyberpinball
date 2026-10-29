// Installation de VPX depuis l'interface, pour l'utilisateur final qui n'a ni
// lanceur ni ligne de commande : téléchargement vérifié, puis activation.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { layoutOf, t, type DownloadManager } from '@cyberpinball/core';
import { findComponent, installComponent } from '@cyberpinball/installer';

export interface InstallProgress {
  percent: number;
  receivedMb: number;
  totalMb: number;
}

/**
 * L'archive de VPX est-elle déjà dans downloads\ (version complète de l'installeur,
 * ou téléchargement précédent) ? Son empreinte est vérifiée à l'installation : une
 * archive abîmée est simplement retéléchargée.
 */
export function vpxArchivePresent(root: string): boolean {
  const component = findComponent('vpx');
  return fs.existsSync(path.join(layoutOf(root).downloads, path.basename(new URL(component.url).pathname)));
}

/**
 * Installe la version de VPX prévue par le manifeste dans la racine ; renvoie sa version. Le
 * téléchargement de l'archive est suivi dans le gestionnaire de téléchargements ; une coupure
 * garde son partiel, « Réessayer » le reprend là où il s'était arrêté.
 */
export async function installVpx(root: string, onProgress: (p: InstallProgress) => void, downloads?: DownloadManager): Promise<string> {
  const component = findComponent('vpx');
  const archive = path.join(layoutOf(root).downloads, path.basename(new URL(component.url).pathname));
  const job = downloads?.track({
    id: `vpx-${component.version}`,
    kind: 'component',
    title: t('Visual Pinball X {version}', { version: component.version }),
    source: { kind: 'http', label: 'github.com' },
    files: [{ ref: component.url, name: path.basename(archive), bytes: component.size, dest: archive, part: `${archive}.part` }],
    back: { screen: 'downloads' },
    resumable: true,
  });
  let lastPercent = -1;
  try {
    await installComponent(root, component, (received, total) => {
      job?.progress(received, total);
      const percent = Math.floor((received / total) * 100);
      if (percent === lastPercent) return;
      lastPercent = percent;
      onProgress({ percent, receivedMb: Math.round(received / 1e6), totalMb: Math.round(total / 1e6) });
    });
  } catch (error) {
    job?.fail(fs.existsSync(`${archive}.part`) ? 'network' : 'http', (error as Error).message);
    throw error;
  }
  job?.done([{ index: 0, file: archive }]);
  return component.version;
}
