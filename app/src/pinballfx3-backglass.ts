// Frontons de Pinball FX3 téléchargés à la demande du joueur (packages/core/src/pinballfx3-backglass.ts) :
// la liste du catalogue d'archive.org, puis chaque image manquante, reprise après une coupure
// (fetchResumable), vérifiée (taille et MD5 annoncés) et déposée à côté du .pxp de sa table. Une image
// déjà là n'est jamais remplacée, même apparue pendant le téléchargement.

import {
  fetchResumable,
  mediaKind,
  parseBackglassMetadata,
  PINBALLFX3_HOME_IMAGE,
  PINBALLFX3_IMAGE_EXTENSIONS,
  renameWithRetry,
  writeFileAtomic,
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
import { electronPng } from './pinballfx-backglass';

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
  /** Ces tables seulement (noms des .pxp), plus l'accueil : la table qu'on lance. Absent : toutes les installées. */
  only?: readonly string[];
}

/**
 * Dépose `source` (le fronton de la table dans Cyber Pinball) comme image de la table `name` pour FX3
 * (data\steam\<name>.<ext>), si elle n'en a aucune. Un format que FX3 lit est copié tel quel, un autre
 * converti en PNG. Jamais à la place d'une image existante (celle du joueur, du catalogue).
 */
export function placePinballFx3Backglass(
  install: Pick<PinballFx3Install, 'tablesDir'>,
  name: string,
  source: string | undefined,
  toPng: (file: string) => Buffer = electronPng,
): { result: 'placed' | 'present' | 'no-media' | 'failed'; target: string; reason?: string } {
  const present = pinballFx3BackglassImage(install.tablesDir, name);
  if (present) return { result: 'present', target: present };
  const ext = source ? path.extname(source).toLowerCase() : '';
  const readable = (PINBALLFX3_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
  const target = path.join(install.tablesDir, name + (readable ? ext : '.png'));
  if (!source || mediaKind(source) !== 'image') return { result: 'no-media', target };
  try {
    if (readable) {
      // Copie à côté puis renommage : jamais un fichier à moitié écrit sous le nom que le jeu lit.
      const part = `${target}.part`;
      fs.copyFileSync(source, part);
      renameWithRetry(part, target);
      return { result: 'placed', target };
    }
    const png = toPng(source);
    if (!png.length) return { result: 'failed', target, reason: 'image illisible' }; // i18n-ignore : journal
    writeFileAtomic(target, png);
    return { result: 'placed', target };
  } catch (error) {
    return { result: 'failed', target, reason: (error as Error).message };
  }
}

/** Liste du catalogue (API d'archive.org). */
export async function fetchBackglassCatalog(doFetch: typeof fetch = fetch): Promise<ReturnType<typeof parseBackglassMetadata>> {
  const res = await doFetch(PINBALLFX3_BACKGLASS_METADATA, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const files = parseBackglassMetadata(await res.json());
  if (!files.length) throw new Error('catalogue vide'); // i18n-ignore : journal
  return files;
}

/** Ce qu'a donné la préparation du fronton d'une table avant sa partie. */
export interface Fx3BackglassReady {
  /** Image que FX3 trouvera pour la table ; absente : il affichera le chemin cherché. */
  image?: string;
  /** D'où elle vient : déjà là, le fronton de la table dans Cyber Pinball, le catalogue d'archive.org. */
  from?: 'present' | 'media' | 'catalog';
  /** Catalogue pas fini à temps : il continue, l'image servira à la partie suivante. */
  pending?: boolean;
  /** Pourquoi rien (journal). */
  reason?: string;
}

/**
 * Avant une partie de FX3 (20/11/2026 : sans image, FX3 écrit dans sa fenêtre du fronton le chemin
 * qu'il cherche, data\steam\<table>.[bmp, gif, png, jpg, jpeg]) : l'image de la table, si elle n'en a
 * pas, depuis son fronton dans Cyber Pinball d'abord, sinon depuis le catalogue d'archive.org, avec
 * celle de l'accueil, attendu au plus `waitMs` ; au-delà, il continue en arrière-plan.
 */
export async function preparePinballFx3Backglass(
  install: Pick<PinballFx3Install, 'tablesDir'>,
  name: string,
  opts: { own?: string; workDir: string; fetch?: typeof fetch; waitMs?: number; toPng?: (file: string) => Buffer },
): Promise<Fx3BackglassReady> {
  const placed = placePinballFx3Backglass(install, name, opts.own, opts.toPng);
  const home = pinballFx3BackglassImage(install.tablesDir, PINBALLFX3_HOME_IMAGE);
  const own: Fx3BackglassReady | undefined = placed.result === 'present' ? { image: placed.target, from: 'present' } : placed.result === 'placed' ? { image: placed.target, from: 'media' } : undefined;
  if (own && home) return own;
  let reason: string | undefined = placed.reason;
  const run = installPinballFx3Backglasses(install, { workDir: opts.workDir, only: [name], ...(opts.fetch ? { fetch: opts.fetch } : {}) }).then(
    (r) => {
      if (r.failed.length) reason = r.failed.map((f) => `${f.target} : ${f.reason}`).join(', ');
      else if (r.missing.includes(name)) reason = 'absente du catalogue'; // i18n-ignore : journal
      return true;
    },
    (error: Error) => {
      reason = `catalogue illisible (${error.message})`; // i18n-ignore : journal
      return true;
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = await Promise.race([run, new Promise<false>((r) => (timer = setTimeout(() => r(false), opts.waitMs ?? 15_000)))]);
  if (timer) clearTimeout(timer);
  if (own) return own;
  const image = pinballFx3BackglassImage(install.tablesDir, name);
  return image ? { image, from: 'catalog' } : { pending: !finished, ...(reason ? { reason } : {}) };
}

/** Ce que le catalogue apporterait aux tables installées, ou à `only` (sans rien télécharger). */
export function backglassPlanFor(install: Pick<PinballFx3Install, 'tablesDir'>, catalog: ReturnType<typeof parseBackglassMetadata>, only?: readonly string[]): BackglassPlan {
  return pinballFx3BackglassPlan(
    install.tablesDir,
    only ?? pinballFx3InstalledTables(install).map((x) => x.name),
    catalog,
  );
}

/** Télécharge et dépose les frontons manquants des tables installées (ou de `only`), et l'image de l'accueil. */
export async function installPinballFx3Backglasses(install: Pick<PinballFx3Install, 'tablesDir'>, opts: BackglassOptions): Promise<BackglassReport> {
  const doFetch = opts.fetch ?? fetch;
  const plan = backglassPlanFor(install, await fetchBackglassCatalog(doFetch), opts.only);
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

