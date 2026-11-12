// Installation de VPX depuis l'interface, pour l'utilisateur final qui n'a ni
// lanceur ni ligne de commande : téléchargement vérifié, puis activation. Le runtime
// Visual C++ de Microsoft, s'il manque à Windows, suit (vc-runtime.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { compareVersions, layoutOf, t, vpxRuntimeNeeds, type DownloadManager, type PeFile } from '@cyberpinball/core';
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

/** Chemins relatifs des exécutables et DLL d'un dossier. */
function peNames(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(dll|exe)$/i.test(f));
}

/** Ces fichiers, lus un à un au fil de l'analyse (jamais tous en mémoire). */
function* peFiles(dir: string, names: readonly string[]): Generator<PeFile> {
  for (const name of names) yield { path: name, buf: fs.readFileSync(path.join(dir, name)) };
}

/**
 * Ce que la version installée de VPX demande à Windows, comparé au manifeste : une version de VPX qui
 * voudrait un runtime plus récent que celui du manifeste, ou une autre bibliothèque de redistribuable,
 * est écrite au journal (elle ne démarrerait peut-être pas sur un Windows neuf).
 */
export function checkVpxRuntimeNeeds(dir: string, required: string | undefined): string[] {
  const problems: string[] = [];
  try {
    const names = peNames(dir);
    const needs = vpxRuntimeNeeds(peFiles(dir, names), names);
    if (needs.vcRuntime && (!required || compareVersions(needs.vcRuntime, required) > 0)) {
      problems.push(`VPX demande le runtime Visual C++ ${needs.vcRuntime}, le manifeste ${required ?? 'aucun'} (vcRuntime)`); // i18n-ignore : journal
    }
    for (const u of needs.unknown) problems.push(`VPX importe ${u.dll} sans la fournir (${u.by.slice(0, 3).join(', ')}) : bibliothèque absente d'un Windows neuf`); // i18n-ignore : journal
  } catch (error) {
    problems.push(`lecture des bibliothèques de VPX impossible : ${(error as Error).message}`); // i18n-ignore : journal
  }
  for (const p of problems) console.error(`Installation de VPX : ${p}.`); // i18n-ignore : journal
  return problems;
}

/**
 * Installe la version de VPX prévue par le manifeste dans la racine ; renvoie sa version. Le
 * téléchargement de l'archive est suivi dans le gestionnaire de téléchargements ; une coupure
 * garde son partiel, « Réessayer » le reprend là où il s'était arrêté. VPX déjà là, l'appel
 * ne fait que repointer la version active. Le runtime Visual C++ s'installe ensuite, après
 * l'avertissement de la demande de Windows (frontend.ts, askVcRuntime ; vc-runtime.ts).
 */
export async function installVpx(root: string, onProgress: (p: InstallProgress) => void, downloads?: DownloadManager): Promise<string> {
  // Essai sans opérateur (CYBERPINBALL_AUTOPILOT) : jamais de vrai téléchargement de VPX, qu'un Start
  // rejoué tombe sur « VPX n'est pas installé » ou non (incident de la démonstration de la communauté,
  // 12/11/2026) ; un essai qui veut vraiment l'installer le dit (CYBERPINBALL_TELECHARGER_VPX=1).
  if (process.env.CYBERPINBALL_AUTOPILOT && process.env.CYBERPINBALL_TELECHARGER_VPX !== '1') {
    console.log('Installation de VPX : refusée pendant un essai sans opérateur (CYBERPINBALL_TELECHARGER_VPX=1 pour l’autoriser).'); // i18n-ignore : journal
    throw new Error(t('Essai sans opérateur : pas de téléchargement de VPX'));
  }
  const component = findComponent('vpx');
  const layout = layoutOf(root);
  const archive = path.join(layout.downloads, path.basename(new URL(component.url).pathname));
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
  let installed;
  try {
    installed = await installComponent(root, component, (received, total) => {
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
  if (!installed.alreadyInstalled) checkVpxRuntimeNeeds(installed.dir, component.vcRuntime);
  return component.version;
}
