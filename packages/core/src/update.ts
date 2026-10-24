// Mise à jour de Cyber Pinball depuis l'application : jamais d'office, toujours à la
// demande de l'utilisateur (menu système > « Mise à jour de Cyber Pinball »).
//
// Chaque version est publiée en release GitHub (scripts/publier.mjs) avec trois fichiers :
// les deux installeurs et le flux cyberpinball-maj.json. Le flux décrit la version,
// ses nouveautés et l'installeur léger (adresse, taille, SHA-256) ; il est signé
// (Ed25519) par la clé de publication, dont la moitié publique est dans update-key.ts.
// Un flux mal signé n'est jamais lu : un compte GitHub compromis ne suffit pas à faire
// installer un programme sur les bornes. L'installeur téléchargé est vérifié (taille,
// SHA-256 du flux signé) avant d'être lancé.
//
// L'installation passe par l'installeur habituel, en mode /MAJ (scripts/installeur/
// cyberpinball.nsi) : il attend que Cyber Pinball soit fermé, remplace app\ en gardant
// l'ancien dossier jusqu'au bout (remis en place en cas d'échec), garde les raccourcis
// choisis à l'installation, puis relance Cyber Pinball. Le fichier data\mise-a-jour.json
// dit au démarrage suivant si la nouvelle version est bien là.

import { createHash, createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { formatNumber, language, t, type Language } from './i18n';
import { UPDATE_PUBLIC_KEY } from './update-key';

/** Dépôt GitHub des releases ; le même que « repository » du package.json racine (vérifié par les tests). */
export const UPDATE_REPOSITORY = 'gocode/cyberpinball';
/** Nom du flux joint à chaque release. */
export const UPDATE_FEED_NAME = 'cyberpinball-maj.json';
/** Installeur joint à chaque release et téléchargé par la mise à jour (sans VPX : il est déjà installé). */
export const UPDATE_INSTALLER_NAME = 'CyberPinball-Setup.exe';
/** Suivi d'une mise à jour lancée, dans le dossier de données. */
export const UPDATE_PENDING_FILE = 'mise-a-jour.json';

/** Ce que décrit le flux : la dernière version publiée. */
export interface UpdateManifest {
  version: string;
  /** Date de publication (ISO 8601). */
  date: string;
  /** Nouveautés, une ligne par point (en français : la borne les affiche si sa langue n'a pas les siennes). */
  notes: string[];
  /** Nouveautés dans une autre langue (CHANGELOG.en.md), affichées par une borne réglée dans cette langue. */
  notesByLanguage?: Partial<Record<Language, string[]>>;
  installer: { name: string; url: string; size: number; sha256: string };
}

/** Flux tel que publié : le manifeste exact, en texte, et sa signature. */
export interface UpdateEnvelope {
  format: 1;
  manifest: string;
  /** Signature Ed25519 du texte de `manifest` (UTF-8), en base64. */
  signature: string;
}

export type UpdateCheck =
  | { status: 'up-to-date'; current: string; latest: UpdateManifest }
  | { status: 'available'; current: string; latest: UpdateManifest };

/**
 * Adresse du flux : celle de la dernière release du dépôt (GitHub redirige vers le
 * fichier, sans la limite de débit de son API). CYBERPINBALL_MAJ_URL la remplace pour les essais.
 */
export function updateFeedUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.CYBERPINBALL_MAJ_URL || `https://github.com/${UPDATE_REPOSITORY}/releases/latest/download/${UPDATE_FEED_NAME}`;
}

/** Adresse d'un fichier d'une release précise (celle du flux, pas « latest » : une release plus récente ne s'y substitue pas). */
export function releaseAssetUrl(version: string, name: string, repository = UPDATE_REPOSITORY): string {
  return `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(name)}`;
}

/**
 * Clé publique de confiance. CYBERPINBALL_MAJ_CLE (fichier PEM) la remplace pour les
 * essais, et seulement dans un bac à sable (CYBERPINBALL_HOME) : une borne réelle ne
 * fait confiance qu'à la clé livrée avec l'application.
 */
export function updatePublicKey(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CYBERPINBALL_MAJ_CLE && env.CYBERPINBALL_HOME) return fs.readFileSync(env.CYBERPINBALL_MAJ_CLE, 'utf8');
  return UPDATE_PUBLIC_KEY;
}

// ---------- Versions ----------

/** a.b.c, avec une préversion facultative (0.2.0-beta.1). */
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function isVersion(value: string): boolean {
  return VERSION.test(value);
}

/** Versions de Cyber Pinball (strictes, pas celles des tables : acquisition.ts) : négatif si a < b, 0 si égales, positif si a > b (règles de semver : 0.2.0-beta < 0.2.0). */
export function compareAppVersions(a: string, b: string): number {
  const pa = VERSION.exec(a);
  const pb = VERSION.exec(b);
  if (!pa || !pb) throw new Error(t('Version illisible : {version}', { version: !pa ? a : b }));
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d;
  }
  if (pa[4] === pb[4]) return 0;
  if (pa[4] === undefined) return 1;
  if (pb[4] === undefined) return -1;
  const xa = pa[4].split('.');
  const xb = pb[4].split('.');
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const ia = xa[i];
    const ib = xb[i];
    if (ia === undefined) return -1;
    if (ib === undefined) return 1;
    const na = /^\d+$/.test(ia) ? Number(ia) : undefined;
    const nb = /^\d+$/.test(ib) ? Number(ib) : undefined;
    if (na !== undefined && nb !== undefined) {
      if (na !== nb) return na - nb;
    } else if (na !== undefined) return -1;
    else if (nb !== undefined) return 1;
    else if (ia !== ib) return ia < ib ? -1 : 1;
  }
  return 0;
}

// ---------- Flux signé ----------

/** Signe un manifeste (scripts/publier.mjs). */
export function signManifest(manifest: UpdateManifest, privateKeyPem: string): UpdateEnvelope {
  checkManifest(manifest);
  const text = JSON.stringify(manifest, null, 2);
  const signature = sign(null, Buffer.from(text, 'utf8'), createPrivateKey(privateKeyPem)).toString('base64');
  return { format: 1, manifest: text, signature };
}

/** Lit un flux : la signature d'abord, puis la forme du manifeste. Refuse tout le reste. */
export function openEnvelope(raw: string, publicKeyPem: string): UpdateManifest {
  let envelope: Partial<UpdateEnvelope>;
  try {
    envelope = JSON.parse(raw.replace(/^﻿/, ''));
  } catch {
    throw new Error(t('Flux de mise à jour illisible (JSON invalide).'));
  }
  if (envelope.format !== 1 || typeof envelope.manifest !== 'string' || typeof envelope.signature !== 'string') {
    throw new Error(t('Flux de mise à jour d’un format inconnu : cette version de Cyber Pinball est peut-être trop ancienne pour le lire.'));
  }
  const ok = verify(null, Buffer.from(envelope.manifest, 'utf8'), createPublicKey(publicKeyPem), Buffer.from(envelope.signature, 'base64'));
  if (!ok) throw new Error(t('Signature du flux de mise à jour invalide : il ne vient pas de l’éditeur de Cyber Pinball. Rien n’a été téléchargé.'));
  const manifest = JSON.parse(envelope.manifest) as UpdateManifest;
  checkManifest(manifest);
  return manifest;
}

function checkManifest(m: UpdateManifest): void {
  const fail = (what: string): never => {
    throw new Error(t('Flux de mise à jour incomplet : {what}.', { what }));
  };
  if (typeof m?.version !== 'string' || !isVersion(m.version)) fail(t('version absente ou illisible'));
  if (typeof m.date !== 'string' || Number.isNaN(Date.parse(m.date))) fail(t('date absente'));
  if (!Array.isArray(m.notes) || m.notes.some((n) => typeof n !== 'string')) fail(t('nouveautés absentes'));
  const translated = Object.values(m.notesByLanguage ?? {});
  if (translated.some((notes) => !Array.isArray(notes) || notes.some((n) => typeof n !== 'string'))) fail(t('nouveautés absentes'));
  const i = m.installer;
  if (!i || typeof i.name !== 'string' || !/^[\w.-]+\.exe$/i.test(i.name)) fail(t('nom de l’installeur absent'));
  if (typeof i.url !== 'string' || !/^https?:\/\//.test(i.url)) fail(t('adresse de l’installeur absente'));
  if (!Number.isInteger(i.size) || i.size <= 0) fail(t('taille de l’installeur absente'));
  if (typeof i.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(i.sha256)) fail(t('empreinte de l’installeur absente'));
}

/** Nouveautés dans la langue de l'interface, sinon en français (flux d'avant les traductions). */
export function updateNotes(manifest: UpdateManifest, lang: Language = language()): string[] {
  const translated = manifest.notesByLanguage?.[lang];
  return translated?.length ? translated : manifest.notes;
}

/** Cherche la dernière version publiée et la compare à celle qui tourne. */
export async function checkForUpdate(opts: {
  current: string;
  feedUrl?: string;
  publicKey?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<UpdateCheck> {
  const url = opts.feedUrl ?? updateFeedUrl();
  const get = opts.fetch ?? fetch;
  let response: Response;
  try {
    response = await get(url, { redirect: 'follow', signal: opts.signal ?? AbortSignal.timeout(20_000), headers: { 'cache-control': 'no-cache' } });
  } catch (error) {
    if ((error as Error).name === 'AbortError' && opts.signal?.aborted) throw error;
    throw new Error(t('Pas de réponse du site des mises à jour : la borne est-elle connectée à Internet ? ({message})', { message: (error as Error).message }));
  }
  if (response.status === 404) throw new Error(t('Aucune version publiée pour l’instant sur le site des mises à jour.'));
  if (!response.ok) throw new Error(t('Le site des mises à jour répond HTTP {status}.', { status: response.status }));
  const latest = openEnvelope(await response.text(), opts.publicKey ?? updatePublicKey());
  return { status: compareAppVersions(latest.version, opts.current) > 0 ? 'available' : 'up-to-date', current: opts.current, latest };
}

// ---------- Téléchargement ----------

/** Dossier des installeurs téléchargés, dans downloads\ de la racine. */
export function updateDownloadsDir(downloadsDir: string): string {
  return path.join(downloadsDir, 'cyberpinball');
}

/** Nom local de l'installeur : la version y figure, pour ne jamais confondre deux téléchargements. */
export function updateInstallerFile(dir: string, manifest: UpdateManifest): string {
  return path.join(dir, `CyberPinball-Setup-${manifest.version}.exe`);
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

/**
 * Télécharge l'installeur décrit par le manifeste, ou reprend celui déjà téléchargé
 * s'il est intact. Un fichier de la mauvaise taille ou empreinte est supprimé, jamais lancé.
 * Les anciens installeurs du dossier sont supprimés : seul le dernier sert.
 */
export async function downloadUpdate(
  manifest: UpdateManifest,
  dir: string,
  opts: { onProgress?: (received: number, total: number) => void; signal?: AbortSignal; fetch?: typeof fetch } = {},
): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const file = updateInstallerFile(dir, manifest);
  for (const old of fs.readdirSync(dir)) {
    if (/^CyberPinball-Setup-.+\.exe(\.part)?$/i.test(old) && path.join(dir, old) !== file) fs.rmSync(path.join(dir, old), { force: true });
  }
  if (fs.existsSync(file) && fs.statSync(file).size === manifest.installer.size && (await sha256File(file)) === manifest.installer.sha256) {
    opts.onProgress?.(manifest.installer.size, manifest.installer.size);
    return file;
  }

  const part = `${file}.part`;
  const get = opts.fetch ?? fetch;
  let response: Response;
  try {
    response = await get(manifest.installer.url, { redirect: 'follow', signal: opts.signal });
  } catch (error) {
    if (opts.signal?.aborted) throw new Error(t('Téléchargement annulé.'));
    throw new Error(t('Téléchargement impossible : {message}', { message: (error as Error).message }));
  }
  if (!response.ok || !response.body) throw new Error(t('Téléchargement impossible (HTTP {status}) : {url}', { status: response.status, url: manifest.installer.url }));
  const total = manifest.installer.size;
  let received = 0;
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  body.on('data', (chunk: Buffer) => {
    received += chunk.length;
    opts.onProgress?.(received, total);
  });
  try {
    await pipeline(body, fs.createWriteStream(part), { signal: opts.signal });
  } catch (error) {
    fs.rmSync(part, { force: true });
    if (opts.signal?.aborted) throw new Error(t('Téléchargement annulé.'));
    throw new Error(t('Téléchargement interrompu : {message}', { message: (error as Error).message }));
  }
  const size = fs.statSync(part).size;
  const actual = size === total ? await sha256File(part) : undefined;
  if (actual !== manifest.installer.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error(
      size !== total
        ? t('Installeur incomplet ({size} octets reçus sur {total}) : fichier supprimé.', { size, total })
        : t('Empreinte SHA-256 de l’installeur incorrecte (attendu {expected}, obtenu {actual}) : fichier supprimé.', { expected: manifest.installer.sha256, actual: String(actual) }),
    );
  }
  fs.renameSync(part, file);
  return file;
}

// ---------- Installation ----------

/**
 * Arguments de l'installeur pour une mise à jour : /MAJ (attend la fermeture de Cyber
 * Pinball, garde les raccourcis, relance l'application), /D= la racine en dernier.
 * Hors écran (essais), il est aussi silencieux : aucune fenêtre ne s'ouvre.
 */
export function updateInstallerArguments(root: string, opts: { silent?: boolean } = {}): string[] {
  return ['/MAJ', ...(opts.silent ? ['/S'] : []), `/D=${root}`];
}

/** Ligne de commande de la relance (CYBERPINBALL_MAJ_ARGS) : les arguments de l'application, entre guillemets si besoin. */
export function relaunchArguments(args: string[]): string {
  return args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
}

export interface PendingUpdate {
  from: string;
  to: string;
  /** Date du lancement de l'installeur (ISO 8601). */
  started: string;
  installer: string;
}

export function recordPendingUpdate(dataDir: string, pending: PendingUpdate): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, UPDATE_PENDING_FILE), `${JSON.stringify(pending, null, 2)}\n`, 'utf8');
}

export type UpdateOutcome =
  | { kind: 'installed'; from: string; to: string }
  /** L'installeur n'a pas abouti : l'ancienne version est toujours là. */
  | { kind: 'failed'; from: string; to: string; current: string };

/**
 * Au démarrage : une mise à jour avait été lancée ? Lit et efface le suivi, et dit si
 * la version attendue tourne. Un suivi illisible est effacé sans rien dire.
 */
export function takeUpdateOutcome(dataDir: string, current: string): UpdateOutcome | undefined {
  const file = path.join(dataDir, UPDATE_PENDING_FILE);
  if (!fs.existsSync(file)) return undefined;
  let pending: PendingUpdate | undefined;
  try {
    pending = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    pending = undefined;
  }
  fs.rmSync(file, { force: true });
  if (!pending || typeof pending.to !== 'string' || typeof pending.from !== 'string') return undefined;
  return current === pending.to ? { kind: 'installed', from: pending.from, to: pending.to } : { kind: 'failed', from: pending.from, to: pending.to, current };
}

/** 111 Mio, 2,4 Mio (111 MiB, 2.4 MiB). */
export function formatMebibytes(bytes: number): string {
  const value = bytes / 1024 ** 2;
  return t('{size} Mio', { size: formatNumber(value, { maximumFractionDigits: value < 10 ? 1 : 0 }) });
}
