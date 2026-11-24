// Installation de Future Pinball (et de BAM) à la demande du joueur, dans le dossier géré par Cyber Pinball
// <racine>\emulators\futurepinball (24/11/2026). Cyber Pinball ne livre ni n'héberge le jeu (aucune
// redistribution accordée : packages/core/src/futurepinball-managed.ts) : l'installateur « 2-en-1 » de
// l'auteur de BAM (composant « future-pinball » du manifeste) est téléchargé chez lui, son empreinte SHA-256
// vérifiée (il n'est pas signé), puis lancé sans fenêtre avec l'accord de Windows, dans le dossier géré.
// Le résultat est contrôlé sur le disque (le jeu et BAM sont-ils là ?), jamais supposé d'après le code de
// sortie. Le joueur a dit oui avant (futurepinball-ui.ts) ; rien ici ne se lance seul.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkManagedFuturePinball, futurePinballInstallerArgs, layoutOf, managedFuturePinballDir, t, tLater, type DownloadManager } from '@cyberpinball/core';
import { downloadComponent, findComponent, type Component } from '@cyberpinball/installer';
import { CANCELLED, startElevated } from './elevation';

export function futurePinballComponent(): Component {
  return findComponent('future-pinball');
}

export type FuturePinballSetup = { ok: true; dir: string; bam: boolean } | { ok: false; cancelled?: true; reason: string; log?: string };

/** Fichier journal de l'installateur (Inno Setup, /LOG) : à lire quand l'installation n'a pas donné le jeu. */
export function futurePinballInstallLog(root: string): string {
  return path.join(layoutOf(root).downloads, 'future-pinball-installation.log');
}

/**
 * Télécharge (suivi dans le gestionnaire de téléchargements, repris après une coupure, empreinte vérifiée),
 * installe sans fenêtre avec l'accord de Windows, puis contrôle le dossier géré.
 */
export async function installManagedFuturePinball(root: string, opts: { downloads?: DownloadManager; onStep?: (line: string) => void } = {}): Promise<FuturePinballSetup> {
  // Essai sans opérateur : jamais de vrai téléchargement ni d'installation (comme VPX, install-vpx.ts).
  if (process.env.CYBERPINBALL_AUTOPILOT && process.env.CYBERPINBALL_TELECHARGER_FP !== '1') {
    console.log('Installation de Future Pinball : refusée pendant un essai sans opérateur (CYBERPINBALL_TELECHARGER_FP=1 pour l’autoriser).'); // i18n-ignore : journal
    return { ok: false, reason: t('essai sans opérateur : pas de téléchargement') };
  }
  const component = futurePinballComponent();
  const layout = layoutOf(root);
  const dir = managedFuturePinballDir(root);
  const file = path.join(layout.downloads, path.basename(new URL(component.url).pathname));
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

  const log = futurePinballInstallLog(root);
  fs.rmSync(log, { force: true });
  fs.mkdirSync(dir, { recursive: true });
  opts.onStep?.(t('Installation de Future Pinball : Windows demande ton accord.'));
  const run = await startElevated(file, futurePinballInstallerArgs(component.installArguments ?? [], dir, log));
  if (run.status === CANCELLED) return { ok: false, cancelled: true, reason: t('Windows n’a pas reçu ton accord') };
  const check = checkManagedFuturePinball(dir);
  if (!check.ok) {
    console.log(`Installation de Future Pinball : code ${run.status}, fichiers absents de ${dir} : ${check.missing.join(', ')} (journal ${log}).`); // i18n-ignore : journal
    return { ok: false, log, reason: t('l’installateur a répondu {code} et « {file} » est absent de {dir}', { code: String(run.status), file: check.missing[0] ?? 'Future Pinball.exe', dir }) + (run.stderr ? ` (${run.stderr})` : '') };
  }
  console.log(`Future Pinball installé dans ${dir} (code ${run.status}, BAM ${check.bam ? 'présent' : 'absent'}).`); // i18n-ignore : journal
  return { ok: true, dir, bam: check.bam };
}
