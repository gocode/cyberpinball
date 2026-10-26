// Mise à jour de Cyber Pinball depuis l'application : jamais d'office, toujours à la
// demande de l'utilisateur (menu système > « Cyber Pinball » > « Mise à jour de Cyber Pinball »).
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
//
// Mise à jour légère : chaque release joint aussi le paquet de l'application seule
// (CyberPinball-application.zip, le contenu de app\resources\app : quelques Mo). Une borne dont
// le socle (Electron et l'exécutable qui l'entoure, voir scripts/fabriquer.mjs) est celui du
// paquet le prend à la place de l'installeur : téléchargé et vérifié comme lui, déplié à côté,
// puis mis en place par app/src/maj-legere.ts une fois Cyber Pinball fermé (l'ancien
// resources\app gardé jusqu'au bout), et Cyber Pinball relancé. Une publication rapide
// (scripts/publier.mjs --rapide) ne refait pas les installeurs : son flux désigne ceux de la
// dernière publication complète (installer.version), qu'une borne d'un autre socle installe
// d'abord avant de recevoir la mise à jour légère.
//
// Préversions (0.2.0-essai.1) : une borne qui les accepte (réglage gardé dans
// <données>\preversions.json) cherche le flux de la release la plus récente, préversions
// comprises, par l'API GitHub ; les autres ne lisent que celui de la dernière version finale.

import { spawnSync } from 'node:child_process';
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
/** Paquet léger joint à chaque release : l'application seule (app\resources\app). */
export const UPDATE_APP_NAME = 'CyberPinball-application.zip';
/** Suivi d'une mise à jour lancée, dans le dossier de données. */
export const UPDATE_PENDING_FILE = 'mise-a-jour.json';
/** Réglage des préversions, dans le dossier de données. */
export const UPDATE_PRERELEASES_FILE = 'preversions.json';

/** Fichier joint à une release : adresse, taille et empreinte, vérifiées au téléchargement. */
export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
  sha256: string;
}

/** Ce que décrit le flux : la dernière version publiée. */
export interface UpdateManifest {
  version: string;
  /** Date de publication (ISO 8601). */
  date: string;
  /** Nouveautés, une ligne par point (en français : la borne les affiche si sa langue n'a pas les siennes). */
  notes: string[];
  /** Nouveautés dans une autre langue (CHANGELOG.en.md), affichées par une borne réglée dans cette langue. */
  notesByLanguage?: Partial<Record<Language, string[]>>;
  installer: UpdateAsset & {
    /**
     * Version qu'il installe, quand ce n'est pas celle du flux : publication rapide, qui reprend
     * l'installeur de la dernière publication complète. Absent : la version du flux.
     */
    version?: string;
  };
  /**
   * Paquet léger : remplace app\resources\app d'une borne au même socle, sans installeur.
   * Absent des flux d'avant la mise à jour légère.
   */
  app?: UpdateAsset & { socle: string };
  /**
   * Nouveautés des versions précédentes (CHANGELOG), la plus récente d'abord : une borne qui a
   * sauté des versions voit tout ce qui a changé depuis la sienne. Absent des flux plus anciens.
   */
  history?: UpdateHistoryEntry[];
}

export interface UpdateHistoryEntry {
  version: string;
  notes: string[];
  notesByLanguage?: Partial<Record<Language, string[]>>;
}

/** Nouveautés d'une version, telles qu'à afficher. */
export interface ReleaseNotes {
  version: string;
  notes: string[];
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
  if (m.history !== undefined) {
    const lists = (e: UpdateHistoryEntry) => [e.notes, ...Object.values(e.notesByLanguage ?? {})];
    const bad = !Array.isArray(m.history) || m.history.some((e) => typeof e?.version !== 'string' || !isVersion(e.version) || lists(e).some((l) => !Array.isArray(l) || l.some((n) => typeof n !== 'string')));
    if (bad) fail(t('historique des nouveautés illisible'));
  }
  const i = m.installer;
  if (!i || typeof i.name !== 'string' || !/^[\w.-]+\.exe$/i.test(i.name)) fail(t('nom de l’installeur absent'));
  if (typeof i.url !== 'string' || !/^https?:\/\//.test(i.url)) fail(t('adresse de l’installeur absente'));
  if (!Number.isInteger(i.size) || i.size <= 0) fail(t('taille de l’installeur absente'));
  if (typeof i.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(i.sha256)) fail(t('empreinte de l’installeur absente'));
  if (i.version !== undefined && (typeof i.version !== 'string' || !isVersion(i.version))) fail(t('version de l’installeur illisible'));
  const a = m.app;
  if (
    a !== undefined &&
    (typeof a?.name !== 'string' ||
      !/^[\w.-]+\.zip$/i.test(a.name) ||
      typeof a.url !== 'string' ||
      !/^https?:\/\//.test(a.url) ||
      !Number.isInteger(a.size) ||
      a.size <= 0 ||
      typeof a.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(a.sha256) ||
      typeof a.socle !== 'string' ||
      !a.socle)
  ) {
    fail(t('paquet de l’application illisible'));
  }
}

/** Nouveautés dans la langue de l'interface, sinon en français (flux d'avant les traductions). */
export function updateNotes(manifest: UpdateManifest | UpdateHistoryEntry, lang: Language = language()): string[] {
  const translated = manifest.notesByLanguage?.[lang];
  return translated?.length ? translated : manifest.notes;
}

/**
 * Nouveautés de chaque version plus récente que celle qui tourne, la plus récente d'abord :
 * la dernière publiée, puis celles de l'historique du flux qu'elle a sautées.
 */
export function missedReleases(manifest: UpdateManifest, current: string, lang: Language = language()): ReleaseNotes[] {
  const seen = new Set([manifest.version]);
  const older = (manifest.history ?? [])
    .filter((e) => !seen.has(e.version) && (seen.add(e.version), true))
    .filter((e) => compareAppVersions(e.version, current) > 0 && compareAppVersions(e.version, manifest.version) < 0)
    .sort((a, b) => compareAppVersions(b.version, a.version));
  return [{ version: manifest.version, notes: updateNotes(manifest, lang) }, ...older.map((e) => ({ version: e.version, notes: updateNotes(e, lang) }))];
}

// ---------- Préversions ----------

/** La borne accepte-t-elle les préversions ? Non tant que rien n'est réglé. */
export function loadPrereleaseSetting(dataDir: string): boolean {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, UPDATE_PRERELEASES_FILE), 'utf8').replace(/^﻿/, '')).preversions === true;
  } catch {
    return false;
  }
}

export function savePrereleaseSetting(dataDir: string, on: boolean): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, UPDATE_PRERELEASES_FILE), `${JSON.stringify({ preversions: on }, null, 2)}\n`, 'utf8');
}

/** Liste des releases du dépôt, préversions comprises (API GitHub, sans jeton : 60 requêtes par heure). */
export function releasesApiUrl(repository = UPDATE_REPOSITORY): string {
  return `https://api.github.com/repos/${repository}/releases?per_page=30`;
}

/**
 * Adresse du flux le plus récent, préversions comprises : celui de la release de plus haute
 * version qui en a un (les brouillons ne sont pas listés sans jeton). Le flux reste vérifié
 * par sa signature : la liste ne fait que dire où le chercher.
 */
export async function prereleaseFeedUrl(opts: { releasesUrl?: string; fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<string> {
  const get = opts.fetch ?? fetch;
  const response = await get(opts.releasesUrl ?? releasesApiUrl(), {
    signal: opts.signal ?? AbortSignal.timeout(20_000),
    headers: { accept: 'application/vnd.github+json', 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error(t('Le site des mises à jour répond HTTP {status}.', { status: response.status }));
  type Listed = { tag_name?: string; draft?: boolean; assets?: { name?: string; browser_download_url?: string }[] };
  const listed = (await response.json()) as Listed[];
  let best: { version: string; url: string } | undefined;
  for (const r of Array.isArray(listed) ? listed : []) {
    const version = r.tag_name?.replace(/^v/, '');
    const feed = r.assets?.find((a) => a.name === UPDATE_FEED_NAME)?.browser_download_url;
    if (r.draft || !version || !isVersion(version) || !feed) continue;
    if (!best || compareAppVersions(version, best.version) > 0) best = { version, url: feed };
  }
  if (!best) throw new Error(t('Aucune version publiée pour l’instant sur le site des mises à jour.'));
  return best.url;
}

/** Cherche la dernière version publiée et la compare à celle qui tourne. */
export async function checkForUpdate(opts: {
  current: string;
  feedUrl?: string;
  /** Préversions comprises : le flux de la release la plus récente (CYBERPINBALL_MAJ_URL les remplace aussi). */
  prereleases?: boolean;
  releasesUrl?: string;
  publicKey?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<UpdateCheck> {
  let url = opts.feedUrl ?? updateFeedUrl();
  const get = opts.fetch ?? fetch;
  if (opts.prereleases && !opts.feedUrl && !process.env.CYBERPINBALL_MAJ_URL) {
    // Liste illisible (limite de l'API atteinte…) : le flux des versions finales, toujours lisible.
    url = await prereleaseFeedUrl({ releasesUrl: opts.releasesUrl, fetch: get, signal: opts.signal }).catch(() => url);
  }
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

// ---------- Mise à jour légère ou installeur ----------

/**
 * Socle d'une application installée : champ cyberpinball.socle de app\resources\app\package.json
 * (scripts/fabriquer.mjs). Undefined pour une version d'avant la mise à jour légère, ou lancée
 * depuis les sources.
 */
export function installedSocle(appDir: string): string | undefined {
  try {
    const socle = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).cyberpinball?.socle;
    return typeof socle === 'string' && socle ? socle : undefined;
  } catch {
    return undefined;
  }
}

export type UpdatePlan =
  /** Paquet léger : même socle, seule l'application change. */
  | { kind: 'light'; asset: UpdateAsset }
  /** Installeur : socle différent (ou flux sans paquet léger). thenLight : il installe une version plus ancienne que le flux, la mise à jour légère suit. */
  | { kind: 'installer'; asset: UpdateAsset; installs: string; thenLight: boolean }
  /** Ni l'un ni l'autre : l'installeur publié n'apporte rien de plus récent que la version installée. */
  | { kind: 'none'; installs: string };

/** Comment passer de la version installée (et de son socle) à celle du flux. */
export function updatePlan(manifest: UpdateManifest, current: string, socle: string | undefined): UpdatePlan {
  if (manifest.app && socle && manifest.app.socle === socle) return { kind: 'light', asset: manifest.app };
  const installs = manifest.installer.version ?? manifest.version;
  if (compareAppVersions(installs, current) <= 0) return { kind: 'none', installs };
  return { kind: 'installer', asset: manifest.installer, installs, thenLight: installs !== manifest.version };
}

// ---------- Téléchargement ----------

/** Dossier des installeurs téléchargés, dans downloads\ de la racine. */
export function updateDownloadsDir(downloadsDir: string): string {
  return path.join(downloadsDir, 'cyberpinball');
}

/** Nom local de l'installeur : la version qu'il installe y figure, pour ne jamais confondre deux téléchargements. */
export function updateInstallerFile(dir: string, manifest: UpdateManifest): string {
  return path.join(dir, `CyberPinball-Setup-${manifest.installer.version ?? manifest.version}.exe`);
}

/** Nom local du paquet léger. */
export function updateAppFile(dir: string, manifest: UpdateManifest): string {
  return path.join(dir, `CyberPinball-application-${manifest.version}.zip`);
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
export async function downloadUpdate(manifest: UpdateManifest, dir: string, opts: DownloadOptions = {}): Promise<string> {
  return downloadAsset(manifest.installer, updateInstallerFile(dir, manifest), opts);
}

/** Télécharge le paquet léger, comme l'installeur : vérifié, repris s'il est déjà là, les anciens supprimés. */
export async function downloadAppPackage(manifest: UpdateManifest, dir: string, opts: DownloadOptions = {}): Promise<string> {
  if (!manifest.app) throw new Error(t('Flux de mise à jour incomplet : {what}.', { what: t('paquet de l’application illisible') }));
  return downloadAsset(manifest.app, updateAppFile(dir, manifest), opts);
}

export interface DownloadOptions {
  onProgress?: (received: number, total: number) => void;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

/** Fichiers téléchargés par les mises à jour, et leurs restes : un seul de chaque sorte est gardé. */
const DOWNLOADED = [/^CyberPinball-Setup-.+\.exe(\.part)?$/i, /^CyberPinball-application-.+\.zip(\.part)?$/i];

async function downloadAsset(asset: UpdateAsset, file: string, opts: DownloadOptions): Promise<string> {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const kind = DOWNLOADED.find((re) => re.test(path.basename(file)));
  for (const old of fs.readdirSync(dir)) {
    if (kind?.test(old) && path.join(dir, old) !== file) fs.rmSync(path.join(dir, old), { force: true });
  }
  if (fs.existsSync(file) && fs.statSync(file).size === asset.size && (await sha256File(file)) === asset.sha256) {
    opts.onProgress?.(asset.size, asset.size);
    return file;
  }

  const part = `${file}.part`;
  const get = opts.fetch ?? fetch;
  let response: Response;
  try {
    response = await get(asset.url, { redirect: 'follow', signal: opts.signal });
  } catch (error) {
    if (opts.signal?.aborted) throw new Error(t('Téléchargement annulé.'));
    throw new Error(t('Téléchargement impossible : {message}', { message: (error as Error).message }));
  }
  if (!response.ok || !response.body) throw new Error(t('Téléchargement impossible (HTTP {status}) : {url}', { status: response.status, url: asset.url }));
  const total = asset.size;
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
  if (actual !== asset.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error(
      size !== total
        ? t('Téléchargement incomplet ({size} octets reçus sur {total}) : fichier supprimé.', { size, total })
        : t('Empreinte SHA-256 du fichier téléchargé incorrecte (attendu {expected}, obtenu {actual}) : fichier supprimé.', { expected: asset.sha256, actual: String(actual) }),
    );
  }
  fs.renameSync(part, file);
  return file;
}

// ---------- Mise en place du paquet léger ----------

/** Dossier où le paquet léger est déplié, à côté de son téléchargement. */
export function stagedAppDir(dir: string, manifest: UpdateManifest): string {
  return path.join(dir, `application-${manifest.version}`);
}

/** tar.exe de Windows (bsdtar) : il lit et écrit les zip. Celui de Git (GNU tar) ne les lit pas. */
export function windowsTar(): string {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
}

/**
 * Déplie le paquet léger dans `target` (vidé d'abord), puis vérifie qu'il contient bien la
 * version du flux, au socle annoncé : un paquet qui ne correspond pas est effacé, jamais mis en place.
 */
export function unpackAppPackage(zip: string, target: string, manifest: UpdateManifest): void {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const run = spawnSync(windowsTar(), ['-x', '-f', zip, '-C', target], { encoding: 'utf8', windowsHide: true });
  let problem: string | undefined;
  if (run.status !== 0) problem = (run.error?.message ?? run.stderr) || `tar ${run.status}`;
  else {
    let pkg: { version?: string; cyberpinball?: { socle?: string } } = {};
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    } catch {
      // Pas de package.json : signalé ci-dessous.
    }
    if (pkg.version !== manifest.version || pkg.cyberpinball?.socle !== manifest.app?.socle || !fs.existsSync(path.join(target, 'dist', 'main.js'))) {
      problem = t('il contient la version {version}, pas {expected}', { version: String(pkg.version), expected: manifest.version });
    }
  }
  if (problem) {
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error(t('Paquet de l’application inutilisable ({problem}) : rien n’a été remplacé.', { problem: problem.trim() }));
  }
}

/** Ce que fait app/src/maj-legere.ts une fois Cyber Pinball fermé (écrit en JSON à côté du paquet). */
export interface LightUpdateJob {
  /** Processus de Cyber Pinball à attendre. */
  pid: number;
  /** app\resources\app, à remplacer. */
  appDir: string;
  /** Paquet déplié (stagedAppDir). */
  staged: string;
  version: string;
  /** Relance : CyberPinball.exe, ses arguments d'avant, son dossier de travail. */
  exe: string;
  args: string[];
  cwd: string;
  /** Écrire la version dans « Programmes et fonctionnalités » (pas dans un bac à sable). */
  registry: boolean;
  /** Journal de l'opération. */
  log: string;
}

/** Attend la fin d'un processus (jusqu'à timeoutMs). Vrai s'il s'est terminé. */
export async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Remplace `appDir` par `staged` : l'ancien devient <appDir>.precedente le temps de
 * l'opération (essais pendant `retryMs`, tant qu'un fichier reste tenu), remis en place si la
 * nouvelle ne peut s'y mettre, supprimé sinon. En cas d'erreur, `appDir` est intact.
 * Faux si l'ancienne n'a pas pu être supprimée tout de suite (un fichier encore tenu par un
 * processus de Chromium qui finit de se fermer) : la mise à jour est faite quand même, et
 * removePreviousApp la retire au démarrage suivant.
 */
export async function swapAppDir(appDir: string, staged: string, opts: { retryMs?: number } = {}): Promise<boolean> {
  if (!fs.existsSync(path.join(staged, 'package.json'))) throw new Error(t('Paquet de l’application introuvable : {dir}', { dir: staged }));
  const previous = `${appDir}.precedente`;
  removePreviousApp(appDir);
  const end = Date.now() + (opts.retryMs ?? 10_000);
  for (;;) {
    try {
      fs.renameSync(appDir, previous);
      break;
    } catch (error) {
      if (Date.now() > end) throw new Error(t('{dir} reste utilisé : rien n’a été remplacé ({message}).', { dir: appDir, message: (error as Error).message }));
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  try {
    try {
      fs.renameSync(staged, appDir);
    } catch {
      // Autre disque (EXDEV) : copie, puis effacement du paquet déplié.
      fs.cpSync(staged, appDir, { recursive: true });
      fs.rmSync(staged, { recursive: true, force: true });
    }
  } catch (error) {
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.renameSync(previous, appDir);
    throw error;
  }
  return removePreviousApp(appDir);
}

/**
 * Retire <appDir>.precedente, reste d'une mise à jour légère (nouveaux essais pendant 5 s si
 * un fichier est encore tenu). Vrai s'il n'en reste rien ; jamais d'erreur.
 */
export function removePreviousApp(appDir: string): boolean {
  const previous = `${appDir}.precedente`;
  try {
    fs.rmSync(previous, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch {
    // Retiré au prochain démarrage, ou à la prochaine mise à jour.
  }
  return !fs.existsSync(previous);
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
  /** Version attendue au redémarrage (celle que pose l'installeur ou le paquet léger). */
  to: string;
  /** Date du lancement de l'installeur ou de la mise en place (ISO 8601). */
  started: string;
  /** Installeur lancé, ou paquet léger mis en place. */
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
 * la version attendue tourne. Une version plus récente que celle d'avant compte aussi comme
 * installée : une version d'avant la mise à jour légère notait la version du flux, alors que
 * l'installeur d'une publication rapide pose celle de la dernière publication complète.
 * Un suivi illisible est effacé sans rien dire.
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
  if (current === pending.to) return { kind: 'installed', from: pending.from, to: pending.to };
  const newer = isVersion(current) && isVersion(pending.from) && compareAppVersions(current, pending.from) > 0;
  return newer ? { kind: 'installed', from: pending.from, to: current } : { kind: 'failed', from: pending.from, to: pending.to, current };
}

/** 111 Mio, 2,4 Mio (111 MiB, 2.4 MiB). */
export function formatMebibytes(bytes: number): string {
  const value = bytes / 1024 ** 2;
  return t('{size} Mio', { size: formatNumber(value, { maximumFractionDigits: value < 10 ? 1 : 0 }) });
}
