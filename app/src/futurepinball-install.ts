// Installation de Future Pinball (et de BAM) à la demande du joueur, dans le dossier géré par Cyber Pinball
// <racine>\emulators\futurepinball (24/11/2026). Cyber Pinball ne livre ni n'héberge le jeu : l'installateur
// « 2-en-1 » de l'auteur de BAM (composant « future-pinball » du manifeste) est téléchargé chez lui, son
// empreinte SHA-256 vérifiée (il n'est pas signé).
//
// L'installateur n'est PAS exécuté : essayé sur la borne, son mode silencieux s'arrête sur sa page de licence
// (une page Pascal Script dont « Suivant » reste grisé tant que la case « J'accepte » n'est pas cochée, et
// qu'aucun paramètre ne contourne). Ses fichiers en sont extraits par innoextract (composant « innoextract »),
// sans aucune modification, et posés dans le dossier géré. C'est donc Cyber Pinball qui montre les deux
// contrats en entier (futurepinball-ui.ts) et garde l'accord du joueur avant l'extraction ; il n'y a plus de
// demande de Windows (pas d'administrateur : rien n'est écrit hors du dossier géré et de HKCU).
//
// Deux temps, car l'accord se donne entre les deux : downloadFuturePinball (réseau, rien n'est installé),
// puis extractManagedFuturePinball (après l'accord). Le résultat est contrôlé sur le disque (le jeu et BAM
// sont-ils là ?), jamais supposé d'après un code de sortie.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkFuturePinballSpace,
  checkManagedFuturePinball,
  formatSize,
  type FuturePinballSpaceCheck,
  FUTURE_PINBALL_EXTRACTED_APP,
  FUTURE_PINBALL_LICENSES,
  futurePinballExtractArgs,
  layoutOf,
  managedFuturePinballDir,
  moveExtractedFuturePinball,
  recordFuturePinballLicensesAccepted,
  t,
  tLater,
  type DownloadManager,
} from '@cyberpinball/core';
import { downloadComponent, findComponent, installComponent, type Component } from '@cyberpinball/installer';
import { seedFuturePinballPreferences } from './futurepinball-registry';

export function futurePinballComponent(): Component {
  return findComponent('future-pinball');
}

/** L'outil qui extrait l'installateur (innoextract, zlib), téléchargé lui aussi chez son auteur. */
export function innoextractComponent(): Component {
  return findComponent('innoextract');
}

/** Ce que le téléchargement a mis sur le disque : de quoi montrer les contrats, puis extraire. */
export interface FuturePinballDownload {
  /** L'installateur « 2-en-1 » (empreinte vérifiée). */
  installer: string;
  /** innoextract.exe. */
  tool: string;
}

/** `installer` : présent quand l'installateur est déjà téléchargé et vérifié, de quoi proposer de l'installer à la main. */
export type FuturePinballDownloaded = ({ ok: true } & FuturePinballDownload) | { ok: false; reason: string; installer?: string };

export type FuturePinballSetup = { ok: true; dir: string; bam: boolean } | { ok: false; reason: string };

/** La place libre pour le téléchargement et la pose (300 Mo), dite en clair quand elle manque ; undefined si elle suffit. */
export function futurePinballSpaceRefusal(root: string, check: (dir: string) => FuturePinballSpaceCheck = (dir) => checkFuturePinballSpace(dir)): string | undefined {
  const space = check(layoutOf(root).downloads);
  if (space.ok) return undefined;
  return t('pas assez de place sur le disque de Cyber Pinball : {free} libres, {needed} nécessaires (libère de la place, puis réessaie)', { free: formatSize(space.free), needed: formatSize(space.needed) });
}

/** Dossier de travail de l'extraction, vidé avant et après : jamais rien dedans entre deux installations. */
export function futurePinballStagingDir(root: string): string {
  return path.join(layoutOf(root).downloads, 'future-pinball-extraction');
}

/** Essai sans opérateur : jamais de vrai téléchargement ni d'installation (comme VPX, install-vpx.ts). */
function refusedInAutopilot(): boolean {
  if (!process.env.CYBERPINBALL_AUTOPILOT || process.env.CYBERPINBALL_TELECHARGER_FP === '1') return false;
  console.log('Installation de Future Pinball : refusée pendant un essai sans opérateur (CYBERPINBALL_TELECHARGER_FP=1 pour l’autoriser).'); // i18n-ignore : journal
  return true;
}

/**
 * Télécharge l'installateur (suivi dans le gestionnaire de téléchargements, repris après une coupure,
 * empreinte vérifiée) et innoextract. Rien n'est extrait ni installé : le joueur lit d'abord les contrats.
 */
export async function downloadFuturePinball(root: string, opts: { downloads?: DownloadManager; onStep?: (line: string) => void; space?: (dir: string) => FuturePinballSpaceCheck } = {}): Promise<FuturePinballDownloaded> {
  if (refusedInAutopilot()) return { ok: false, reason: t('essai sans opérateur : pas de téléchargement') };
  const component = futurePinballComponent();
  const layout = layoutOf(root);
  // Avant tout octet reçu : un disque presque plein ferait échouer le téléchargement ou l'extraction à mi-chemin.
  const noSpace = futurePinballSpaceRefusal(root, opts.space);
  if (noSpace) return { ok: false, reason: noSpace };
  const file =path.join(layout.downloads, path.basename(new URL(component.url).pathname));
  const job = opts.downloads?.track({
    id: `future-pinball-${component.version}`,
    kind: 'component',
    title: tLater('Future Pinball et BAM'),
    source: { kind: 'http', label: new URL(component.url).hostname },
    files: [{ ref: component.url, name: path.basename(file), bytes: component.size, dest: file, part: `${file}.part` }],
    back: { screen: 'downloads' },
    resumable: true,
  });
  let last = -1;
  opts.onStep?.(t('Téléchargement de Future Pinball et de BAM…'));
  try {
    await downloadComponent(component, layout.downloads, (received, total) => {
      job?.progress(received, total);
      const percent = Math.floor((received / total) * 100);
      if (percent === last) return;
      last = percent;
      opts.onStep?.(t('Téléchargement de Future Pinball et de BAM : {percent} %', { percent }));
    });
  } catch (error) {
    job?.fail(fs.existsSync(`${file}.part`) ? 'network' : 'http', (error as Error).message);
    return { ok: false, reason: (error as Error).message };
  }
  job?.done([{ index: 0, file }]);

  // L'outil (520 Ko) entre lui aussi dans la file ; déjà installé, rien n'est téléchargé.
  opts.onStep?.(t('Téléchargement d’innoextract, l’outil qui ouvre l’installateur…'));
  const extractor = innoextractComponent();
  const archive = path.join(layout.downloads, path.basename(new URL(extractor.url).pathname));
  const toolJob = opts.downloads?.track({
    id: `innoextract-${extractor.version}`,
    kind: 'component',
    title: tLater('innoextract'),
    source: { kind: 'http', label: new URL(extractor.url).hostname },
    files: [{ ref: extractor.url, name: path.basename(archive), bytes: extractor.size, dest: archive, part: `${archive}.part` }],
    back: { screen: 'downloads' },
    resumable: true,
  });
  try {
    const tool = await installComponent(root, extractor, (received, total) => toolJob?.progress(received, total));
    toolJob?.done([{ index: 0, file: archive }]);
    return { ok: true, installer: file, tool: tool.executable };
  } catch (error) {
    toolJob?.fail('http', (error as Error).message);
    // L'installateur, lui, est là et vérifié : l'installer à la main reste possible.
    return { ok: false, reason: t('innoextract n’a pas pu être préparé : {reason}', { reason: (error as Error).message }), installer: file };
  }
}

/** Lance innoextract et attend sa fin ; rend sa sortie d'erreur si le code n'est pas 0. */
function runExtraction(tool: string, args: string[], cwd: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    execFile(tool, args, { cwd, windowsHide: true, timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve({ ok: true });
      const detail = (String(stderr) || String(stdout) || error.message).trim().split(/\r?\n/).slice(-3).join(' ');
      resolve({ ok: false, reason: detail });
    });
  });
}

/**
 * Après l'accord du joueur aux deux contrats : garde cet accord à côté du jeu, extrait l'installateur dans
 * un dossier de travail, pose le jeu et BAM dans le dossier géré (les fichiers du joueur ne sont pas
 * écrasés), contrôle le résultat, puis pose les préférences d'une installation neuve qui manquent.
 */
export async function extractManagedFuturePinball(root: string, download: FuturePinballDownload, opts: { onStep?: (line: string) => void } = {}): Promise<FuturePinballSetup> {
  if (refusedInAutopilot()) return { ok: false, reason: t('essai sans opérateur : pas de téléchargement') };
  const component = futurePinballComponent();
  const dir = managedFuturePinballDir(root);
  const staging = futurePinballStagingDir(root);
  try {
    recordFuturePinballLicensesAccepted(dir, { sha256: component.sha256, version: component.version }, FUTURE_PINBALL_LICENSES);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    opts.onStep?.(t('Extraction de Future Pinball et de BAM…'));
    const run = await runExtraction(download.tool, futurePinballExtractArgs(download.installer, staging), path.dirname(staging));
    if (!run.ok) {
      console.log(`Installation de Future Pinball : extraction refusée (${run.reason}).`); // i18n-ignore : journal
      return { ok: false, reason: t('l’extraction de l’installateur a échoué : {reason}', { reason: run.reason }) };
    }
    const app = path.join(staging, FUTURE_PINBALL_EXTRACTED_APP);
    if (!fs.existsSync(path.join(app, 'Future Pinball.exe'))) return { ok: false, reason: t('« {file} » est absent de ce que l’extraction a produit', { file: 'Future Pinball.exe' }) };
    opts.onStep?.(t('Pose des fichiers dans {dir}…', { dir }));
    const moved = await moveExtractedFuturePinball(app, dir);
    const check = checkManagedFuturePinball(dir);
    if (!check.ok) return { ok: false, reason: t('« {file} » est absent de {dir}', { file: check.missing[0] ?? 'Future Pinball.exe', dir }) };
    // Le contrat de BAM doit rester dans son dossier : sa redistribution exige les fichiers inchangés et complets.
    if (!fs.existsSync(path.join(dir, 'BAM', 'License.txt'))) return { ok: false, reason: t('le contrat de BAM (BAM\\License.txt) est absent de {dir}', { dir }) };
    const prefs = seedFuturePinballPreferences();
    console.log(`Future Pinball installé dans ${dir} : ${moved.placed} fichier(s) posé(s), ${moved.kept} du joueur gardé(s), BAM ${check.bam ? 'présent' : 'absent'}, préférences posées ${prefs.written.length}, déjà là ${prefs.present.length}, refusées ${prefs.failed.length}.`); // i18n-ignore : journal
    for (const failure of prefs.failed) console.warn(`Future Pinball : préférence ${failure.name} non écrite (${failure.reason}).`); // i18n-ignore : journal
    return { ok: true, dir, bam: check.bam };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
