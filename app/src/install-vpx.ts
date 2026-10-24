// Installation de VPX depuis l'interface, pour l'utilisateur final qui n'a ni
// lanceur ni ligne de commande : téléchargement vérifié, puis activation.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { layoutOf } from '@cyberpinball/core';
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

/** Installe la version de VPX prévue par le manifeste dans la racine ; renvoie sa version. */
export async function installVpx(root: string, onProgress: (p: InstallProgress) => void): Promise<string> {
  const component = findComponent('vpx');
  let lastPercent = -1;
  await installComponent(root, component, (received, total) => {
    const percent = Math.floor((received / total) * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    onProgress({ percent, receivedMb: Math.round(received / 1e6), totalMb: Math.round(total / 1e6) });
  });
  return component.version;
}
