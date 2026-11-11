// Le runtime Visual C++ de Microsoft, sans lequel VPX ne démarre pas (packages/core/src/vc-runtime.ts).
// Vérifié sans rien lancer (version des DLL de System32), et installé avec VPX quand il manque ou qu'il
// est trop ancien : l'installateur officiel de Microsoft (composant « vc-redist-x64 » du manifeste,
// empreinte et signature vérifiées, ou déjà dans downloads\ avec l'installeur complet), lancé sans
// fenêtre avec l'accord de Windows, demandé une seule fois.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t, VC_RUNTIME_DLLS, peFileVersion, vcRuntimeStatus, type DownloadManager, type VcRuntimeStatus } from '@cyberpinball/core';
import { downloadComponent, findComponent, type Component } from '@cyberpinball/installer';
import { CANCELLED, startElevated, signerOf, SYSTEM32 } from './elevation';

/** Codes de sortie admis : 0, redémarrage conseillé (3010, 1641), version plus récente déjà là (1638). */
const OK_CODES = [0, 3010, 1641, 1638];

/** Version de chaque DLL du runtime dans System32 (undefined : absente ou illisible). */
export function systemVcRuntime(dir = SYSTEM32): Record<string, string | undefined> {
  const versions: Record<string, string | undefined> = {};
  for (const dll of VC_RUNTIME_DLLS) {
    try {
      versions[dll] = peFileVersion(fs.readFileSync(path.join(dir, dll)));
    } catch {
      versions[dll] = undefined;
    }
  }
  return versions;
}

/** Version du runtime que demande la version de VPX du manifeste. */
function requiredVersion(): string {
  return findComponent('vpx').vcRuntime ?? '14.0';
}

/** Le runtime de Windows suffit-il à VPX ? (lu à chaque appel : quelques centaines de Ko.) */
export function vcRuntimeReady(): VcRuntimeStatus {
  return vcRuntimeStatus(systemVcRuntime(), requiredVersion());
}

/** « vcruntime140.dll absente ; msvcp140.dll 14.29.30133.0 » : pour le journal et l'écran. */
export function describeVcRuntime(status: VcRuntimeStatus): string {
  return [...status.missing.map((dll) => t('{dll} absente', { dll })), ...status.older.map((o) => t('{dll} en version {version}', { dll: o.dll, version: o.version }))].join(' ; ');
}

function redistComponent(): Component {
  return findComponent('vc-redist-x64');
}

/** L'installateur de Microsoft, téléchargé (suivi dans le gestionnaire) ou repris de downloads\. */
async function downloadVcRedist(downloadsDir: string, downloads?: DownloadManager, onProgress?: (percent: number) => void): Promise<string> {
  const component = redistComponent();
  const file = path.join(downloadsDir, path.basename(new URL(component.url).pathname));
  const job = downloads?.track({
    id: component.id,
    kind: 'component',
    title: t('Runtime Visual C++ (Microsoft)'),
    source: { kind: 'http', label: 'microsoft.com' },
    files: [{ ref: component.url, name: path.basename(file), bytes: component.size, dest: file, part: `${file}.part` }],
    back: { screen: 'downloads' },
    resumable: true,
  });
  try {
    await downloadComponent(component, downloadsDir, (received, total) => {
      job?.progress(received, total);
      onProgress?.(Math.floor((received / total) * 100));
    });
  } catch (error) {
    job?.fail(fs.existsSync(`${file}.part`) ? 'network' : 'http', (error as Error).message);
    throw error;
  }
  job?.done([{ index: 0, file }]);
  return file;
}

export type VcRuntimeInstall = { ok: true; already?: true } | { ok: false; cancelled?: true; reason: string };

/**
 * Installe le runtime s'il ne suffit pas : téléchargement vérifié, signature de Microsoft, puis
 * l'installateur officiel sans fenêtre (installArguments), avec l'accord de Windows.
 */
export async function ensureVcRuntime(downloadsDir: string, opts: { downloads?: DownloadManager; onStep?: (line: string) => void } = {}): Promise<VcRuntimeInstall> {
  const before = vcRuntimeReady();
  if (before.ok) return { ok: true, already: true };
  console.log(`Runtime Visual C++ insuffisant pour VPX (${describeVcRuntime(before)}, ${before.required} au moins demandé) : installation.`); // i18n-ignore : journal
  const component = redistComponent();
  opts.onStep?.(t('Téléchargement du runtime Visual C++ de Microsoft…'));
  const file = await downloadVcRedist(downloadsDir, opts.downloads, (percent) => opts.onStep?.(t('Téléchargement du runtime Visual C++ de Microsoft : {percent} %', { percent })));
  const signature = await signerOf(file);
  if (signature.status !== 'Valid' || signature.subject !== component.signer) {
    fs.rmSync(file, { force: true });
    return { ok: false, reason: t('signature inattendue de l’installateur de Microsoft ({status}), fichier supprimé', { status: signature.status || '?' }) };
  }
  opts.onStep?.(t('Installation du runtime Visual C++ : Windows demande votre accord.'));
  const run = await startElevated(file, component.installArguments ?? []);
  if (run.status === CANCELLED) return { ok: false, cancelled: true, reason: t('Windows n’a pas reçu votre accord') };
  if (!OK_CODES.includes(run.status ?? -1)) return { ok: false, reason: t('l’installateur de Microsoft a répondu {code}', { code: String(run.status) }) + (run.stderr ? ` (${run.stderr})` : '') };
  const after = vcRuntimeReady();
  if (!after.ok) return { ok: false, reason: t('runtime toujours insuffisant après l’installation : {detail}', { detail: describeVcRuntime(after) }) };
  console.log(`Runtime Visual C++ installé (${component.version}, code ${run.status}).`); // i18n-ignore : journal
  return { ok: true };
}
