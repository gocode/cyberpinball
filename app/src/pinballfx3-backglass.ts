// Frontons de Pinball FX3 téléchargés à la demande du joueur (packages/core/src/pinballfx3-backglass.ts) :
// la liste du catalogue d'archive.org, puis chaque image manquante, reprise après une coupure
// (fetchResumable), vérifiée (taille et MD5 annoncés) et déposée à côté du .pxp de sa table. Une image
// déjà là n'est jamais remplacée, même apparue pendant le téléchargement.

import {
  fetchResumable,
  parseBackglassMetadata,
  PINBALLFX3_BACKGLASS_METADATA,
  pinballFx3BackglassImage,
  pinballFx3BackglassPlan,
  pinballFx3InstalledTables,
  tLater,
  type BackglassPlan,
  type DownloadManager,
  type PinballFx3Install,
} from '@cyberpinball/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BackglassReport {
  /** Images déposées. */
  placed: string[];
  /** Tables (ou accueil) qui avaient déjà une image : gardée. */
  present: string[];
  /** Sans image dans le catalogue. */
  missing: string[];
  /** Téléchargement ou vérification en échec, avec la raison (journal). */
  failed: { target: string; reason: string }[];
}

export interface BackglassOptions {
  /** Dossier des fichiers partiels, effacé à la fin (gardé s'il reste des échecs : la suite reprendra). */
  workDir: string;
  fetch?: typeof fetch;
  /** Gestionnaire de téléchargements : le lot y est suivi (pause, annulation, reprise). */
  downloads?: DownloadManager;
  onProgress?(done: number, total: number): void;
}

/** Liste du catalogue (API d'archive.org). */
export async function fetchBackglassCatalog(doFetch: typeof fetch = fetch): Promise<ReturnType<typeof parseBackglassMetadata>> {
  const res = await doFetch(PINBALLFX3_BACKGLASS_METADATA, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const files = parseBackglassMetadata(await res.json());
  if (!files.length) throw new Error('catalogue vide'); // i18n-ignore : journal
  return files;
}

/** Ce que le catalogue apporterait aux tables installées (sans rien télécharger). */
export function backglassPlanFor(install: Pick<PinballFx3Install, 'tablesDir'>, catalog: ReturnType<typeof parseBackglassMetadata>): BackglassPlan {
  return pinballFx3BackglassPlan(
    install.tablesDir,
    pinballFx3InstalledTables(install).map((x) => x.name),
    catalog,
  );
}

/** Télécharge et dépose les frontons manquants des tables installées. */
export async function installPinballFx3Backglasses(install: Pick<PinballFx3Install, 'tablesDir'>, opts: BackglassOptions): Promise<BackglassReport> {
  const doFetch = opts.fetch ?? fetch;
  const plan = backglassPlanFor(install, await fetchBackglassCatalog(doFetch));
  const report: BackglassReport = { placed: [], present: plan.present, missing: plan.missing, failed: [] };
  let done = 0;
  opts.onProgress?.(done, plan.steps.length);
  const partOf = (dest: string) => path.join(opts.workDir, path.basename(dest) + '.part');
  const job = plan.steps.length
    ? opts.downloads?.track({
        id: 'pinballfx3-frontons',
        kind: 'mediadb',
        title: tLater('Frontons de Pinball FX3'),
        source: { kind: 'http', label: 'archive.org' },
        files: plan.steps.map((s) => ({ ref: s.url, name: path.basename(s.dest), ...(s.file.size ? { bytes: s.file.size } : {}), dest: s.dest, part: partOf(s.dest) })),
        back: { screen: 'downloads' },
        resumable: true,
      })
    : undefined;
  const total = plan.steps.reduce((n, s) => n + (s.file.size ?? 0), 0);
  let before = 0;
  for (const step of plan.steps) {
    if (job?.signal.aborted) break;
    const part = partOf(step.dest);
    try {
      const got = await fetchResumable({
        url: step.url,
        part,
        fetch: doFetch,
        ...(step.file.size ? { size: step.file.size } : {}),
        hashes: ['md5'],
        ...(job ? { signal: job.signal, onData: (received: number) => job.progress(before + received, total || undefined) } : {}),
      });
      if (step.file.size !== undefined && got.received !== step.file.size) throw new Error(`taille ${got.received} au lieu de ${step.file.size}`); // i18n-ignore : journal
      if (step.file.md5 && got.md5 !== step.file.md5) {
        fs.rmSync(part, { force: true });
        throw new Error('empreinte MD5 différente'); // i18n-ignore : journal
      }
      // Une image posée entre-temps (le joueur, le jeu) reste : la nôtre n'est pas déposée.
      if (pinballFx3BackglassImage(install.tablesDir, step.target)) {
        report.present.push(step.target);
        fs.rmSync(part, { force: true });
      } else {
        fs.copyFileSync(part, step.dest, fs.constants.COPYFILE_EXCL);
        fs.rmSync(part, { force: true });
        report.placed.push(step.target);
      }
    } catch (error) {
      report.failed.push({ target: step.target, reason: (error as Error).message });
    }
    before += step.file.size ?? 0;
    opts.onProgress?.(++done, plan.steps.length);
  }
  if (job && !job.signal.aborted) {
    if (report.failed.length) job.fail('network', report.failed.map((f) => `${f.target} (${f.reason})`).join(', '));
    else job.done(plan.steps.map((s, index) => ({ index, file: s.dest })).filter((f) => fs.existsSync(f.file)));
  }
  if (!report.failed.length && done === plan.steps.length) fs.rmSync(opts.workDir, { recursive: true, force: true });
  return report;
}

