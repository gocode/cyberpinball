// Updating Cyber Pinball from the application: never automatically, always at the user's
// request (system menu > "Aide et infos" (Help and info) > "Mise à jour de Cyber Pinball" (Cyber Pinball update)).
//
// Each version is published as a GitHub release (scripts/publier.mjs) with three files:
// the two installers and the cyberpinball-maj.json feed. The feed describes the version,
// its new features and the light installer (address, size, SHA-256); it is signed
// (Ed25519) by the publishing key, whose public half is in update-key.ts.
// A badly signed feed is never read: a compromised GitHub account is not enough to get a
// program installed on the cabinets. The downloaded installer is checked (size, SHA-256 from
// the signed feed) before it is launched.
//
// Installation goes through the usual installer, in /MAJ mode (scripts/installeur/
// cyberpinball.nsi): it waits for Cyber Pinball to be closed, replaces app\ while keeping
// the old folder until the end (put back on failure), keeps the shortcuts chosen at
// installation, then relaunches Cyber Pinball. The data\mise-a-jour.json file tells the
// next startup whether the new version is really there.
//
// Light update: each release also attaches the package of the application alone
// (CyberPinball-application.zip, the content of app\resources\app: a few MB). A cabinet whose
// base (Electron and the executable around it, see scripts/fabriquer.mjs) is the package's one
// takes it instead of the installer: downloaded and checked like it, unpacked next to it,
// then put in place by app/src/maj-legere.ts once Cyber Pinball is closed (the old
// resources\app kept until the end), and Cyber Pinball relaunched. A quick publication
// (scripts/publier.mjs --rapide) does not rebuild the installers: its feed points to those of the
// last full publication (installer.version), which a cabinet with another base installs
// first before receiving the light update.
//
// Pre-releases (0.2.0-essai.1): a cabinet that accepts them (setting kept in
// <data>\preversions.json) looks for the feed of the most recent release, pre-releases
// included, through the GitHub API; the others only read the one of the latest release.
// Private test channel: see "Update source" below.

import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { renameWithRetry, writeFileAtomic } from './atomicwrite';
import { copyTree } from './copytree';
import { formatNumber, language, t, type Language } from './i18n';
import { UPDATE_PUBLIC_KEY } from './update-key';
import { fetchTextPatiently, type Patience, type PatientResponse } from './patientfetch';
import { fetchResumable, ResumableError } from './resumable';
import { describeNetworkError } from './netcause';

/** GitHub repository of the releases; the same as "repository" in the root package.json (checked by the tests). */
export const UPDATE_REPOSITORY = 'gocode/cyberpinball';
/** Name of the feed attached to each release. */
export const UPDATE_FEED_NAME = 'cyberpinball-maj.json';
/** Installer attached to each release and downloaded by the update (without VPX: it is already installed). */
export const UPDATE_INSTALLER_NAME = 'CyberPinball-Setup.exe';
/** Light package attached to each release: the application alone (app\resources\app). */
export const UPDATE_APP_NAME = 'CyberPinball-application.zip';
/** Tracking of a launched update, in the data folder. */
export const UPDATE_PENDING_FILE = 'mise-a-jour.json';
/** Update source (pre-releases, test channel), in the data folder. */
export const UPDATE_PRERELEASES_FILE = 'preversions.json';

/** File attached to a release: address, size and hash, checked on download. */
export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
  sha256: string;
}

/** What the feed describes: the latest published version. */
export interface UpdateManifest {
  version: string;
  /** Publication date (ISO 8601). */
  date: string;
  /** New features, one line per item (in French: the cabinet shows them if its language has none of its own). */
  notes: string[];
  /** New features in another language (CHANGELOG.en.md), shown by a cabinet set to that language. */
  notesByLanguage?: Partial<Record<Language, string[]>>;
  installer: UpdateAsset & {
    /**
     * Version it installs, when it is not the feed's one: quick publication, which reuses the
     * installer of the last full publication. Absent: the feed's version.
     */
    version?: string;
  };
  /**
   * Light package: replaces app\resources\app of a cabinet with the same base, without installer.
   * Absent from feeds older than the light update.
   */
  app?: UpdateAsset & { socle: string };
  /**
   * New features of the previous versions (CHANGELOG), most recent first: a cabinet that has
   * skipped versions sees everything that changed since its own. Absent from older feeds.
   */
  history?: UpdateHistoryEntry[];
}

export interface UpdateHistoryEntry {
  version: string;
  notes: string[];
  notesByLanguage?: Partial<Record<Language, string[]>>;
}

/** New features of a version, as to be shown. */
export interface ReleaseNotes {
  version: string;
  notes: string[];
}

/** Feed as published: the exact manifest, as text, and its signature. */
export interface UpdateEnvelope {
  format: 1;
  manifest: string;
  /** Ed25519 signature of the `manifest` text (UTF-8), in base64. */
  signature: string;
}

export type UpdateCheck =
  | { status: 'up-to-date'; current: string; latest: UpdateManifest }
  | { status: 'available'; current: string; latest: UpdateManifest };

/**
 * Address of the feed: the one of the repository's latest release (GitHub redirects to the
 * file, without the rate limit of its API). CYBERPINBALL_MAJ_URL replaces it for tests.
 */
export function updateFeedUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.CYBERPINBALL_MAJ_URL || `https://github.com/${UPDATE_REPOSITORY}/releases/latest/download/${UPDATE_FEED_NAME}`;
}

/** Address of a file of a specific release (the feed's one, not "latest": a more recent release does not take its place). */
export function releaseAssetUrl(version: string, name: string, repository = UPDATE_REPOSITORY): string {
  return `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(name)}`;
}

/**
 * Trusted public key. CYBERPINBALL_MAJ_CLE (PEM file) replaces it for
 * tests, and only in a sandbox (CYBERPINBALL_HOME): a real cabinet only
 * trusts the key shipped with the application.
 */
export function updatePublicKey(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CYBERPINBALL_MAJ_CLE && env.CYBERPINBALL_HOME) return fs.readFileSync(env.CYBERPINBALL_MAJ_CLE, 'utf8');
  return UPDATE_PUBLIC_KEY;
}

// ---------- Versions ----------

/** a.b.c, with an optional pre-release (0.2.0-beta.1). */
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function isVersion(value: string): boolean {
  return VERSION.test(value);
}

/** Versions of Cyber Pinball (strict, not those of the tables: acquisition.ts): negative if a < b, 0 if equal, positive if a > b (semver rules: 0.2.0-beta < 0.2.0). */
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

// ---------- Signed feed ----------

/** Signs a manifest (scripts/publier.mjs). */
export function signManifest(manifest: UpdateManifest, privateKeyPem: string): UpdateEnvelope {
  checkManifest(manifest);
  const text = JSON.stringify(manifest, null, 2);
  const signature = sign(null, Buffer.from(text, 'utf8'), createPrivateKey(privateKeyPem)).toString('base64');
  return { format: 1, manifest: text, signature };
}

/** Reads a feed: the signature first, then the shape of the manifest. Refuses everything else. */
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

/** New features in the interface language, otherwise in French (feeds from before the translations). */
export function updateNotes(manifest: UpdateManifest | UpdateHistoryEntry, lang: Language = language()): string[] {
  const translated = manifest.notesByLanguage?.[lang];
  return translated?.length ? translated : manifest.notes;
}

/**
 * New features of each version more recent than the running one, most recent first:
 * the latest published, then those of the feed's history that it skipped.
 */
export function missedReleases(manifest: UpdateManifest, current: string, lang: Language = language()): ReleaseNotes[] {
  const seen = new Set([manifest.version]);
  const older = (manifest.history ?? [])
    .filter((e) => !seen.has(e.version) && (seen.add(e.version), true))
    .filter((e) => compareAppVersions(e.version, current) > 0 && compareAppVersions(e.version, manifest.version) < 0)
    .sort((a, b) => compareAppVersions(b.version, a.version));
  return [{ version: manifest.version, notes: updateNotes(manifest, lang) }, ...older.map((e) => ({ version: e.version, notes: updateNotes(e, lang) }))];
}

// ---------- Update source and private test channel ----------
//
// Three sources, from the safest to the freshest, each including the previous one:
// - "finales": the latest release of the public repository (default setting);
// - "preversions": the most recent release of the public repository, pre-releases included;
// - "essais": in addition, the releases of a private GitHub repository, read with a read-only
//   token. For whoever maintains Cyber Pinball and wants to try their versions on their own
//   cabinets before publishing them. The repository and the token are in a file outside the
//   cabinet's data (canal-essai.json in %USERPROFILE%\.cyberpinball: neither backed up, nor
//   shared, nor in a report). Without this file, the "essais" source is not offered.
// Whatever the source, the feed is checked by the same signature: a stolen token does not make
// it possible to install anything other than what the publisher signed.

/** Update source of a cabinet. */
export type UpdateSource = 'finales' | 'preversions' | 'essais';
export const UPDATE_SOURCES: readonly UpdateSource[] = ['finales', 'preversions', 'essais'];

/** Private test channel: GitHub repository and the token that reads it. */
export interface PrivateChannel {
  repository: string;
  token: string;
  /** Address of the GitHub API (tests: a local server). */
  api?: string;
}

/** File of the private test channel: CYBERPINBALL_CANAL_ESSAI replaces it (tests). */
export function privateChannelFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.CYBERPINBALL_CANAL_ESSAI || path.join(os.homedir(), '.cyberpinball', 'canal-essai.json');
}

/**
 * The private test channel of this computer, or undefined: file missing or incomplete. The file:
 * { "depot": "proprietaire/nom", "jeton": "github_pat_…" } (or "repository" and "token").
 */
export function loadPrivateChannel(file = privateChannelFile()): PrivateChannel | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) as Record<string, unknown>;
    const repository = String(raw.depot ?? raw.repository ?? '').trim();
    const token = String(raw.jeton ?? raw.token ?? '').trim();
    const api = typeof raw.api === 'string' && raw.api ? raw.api.replace(/\/$/, '') : undefined;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) return undefined;
    return { repository, token, ...(api && { api }) };
  } catch {
    return undefined;
  }
}

/** Source set on the cabinet: "finales" as long as nothing is set. */
export function loadUpdateSource(dataDir: string): UpdateSource {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, UPDATE_PRERELEASES_FILE), 'utf8').replace(/^﻿/, '')) as { preversions?: unknown; source?: unknown };
    if (UPDATE_SOURCES.includes(raw.source as UpdateSource)) return raw.source as UpdateSource;
    return raw.preversions === true ? 'preversions' : 'finales';
  } catch {
    return 'finales';
  }
}

/** Saves the source; "preversions" stays written for the versions that do not know "source". */
export function saveUpdateSource(dataDir: string, source: UpdateSource): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(path.join(dataDir, UPDATE_PRERELEASES_FILE), `${JSON.stringify({ preversions: source !== 'finales', source }, null, 2)}\n`);
}

/** Does the cabinet accept pre-releases? No as long as nothing is set. */
export function loadPrereleaseSetting(dataDir: string): boolean {
  return loadUpdateSource(dataDir) !== 'finales';
}

export function savePrereleaseSetting(dataDir: string, on: boolean): void {
  saveUpdateSource(dataDir, on ? 'preversions' : 'finales');
}

/**
 * Source actually followed: "essais" without a test channel on this computer (file removed)
 * falls back to the public pre-releases.
 */
export function effectiveUpdateSource(source: UpdateSource, channel: PrivateChannel | undefined): UpdateSource {
  return source === 'essais' && !channel ? 'preversions' : source;
}

const GITHUB_API = 'https://api.github.com';

/**
 * Releases listed for the public repository: the most recent one is among the first (GitHub lists
 * them newest first). Each listed release weighs some 30 KB with its attached files: 30 of them
 * made about 1 MB, too much for a slow connection (20/11/2026).
 */
export const PUBLIC_RELEASES_LISTED = 10;
/**
 * Releases listed for the private test channel: more of them, as the API address of an installer
 * of an older release (quick publication) is looked for in the list.
 */
export const PRIVATE_RELEASES_LISTED = 30;

/** List of the repository's releases, pre-releases included (GitHub API, without token: 60 requests per hour). */
export function releasesApiUrl(repository = UPDATE_REPOSITORY, api = GITHUB_API, perPage = PUBLIC_RELEASES_LISTED): string {
  return `${api}/repos/${repository}/releases?per_page=${perPage}`;
}

/**
 * Patience of the searches (patientfetch.ts): the delay bounds the absence of progress, not the
 * length of the transfer, and a passing network error is tried again. Tests: shorter.
 */
export type UpdatePatience = Partial<Patience>;

/** Reads an address of the update site; no answer at all becomes the usual message. */
async function readUpdateSite(url: string, get: typeof fetch, signal: AbortSignal | undefined, patience: UpdatePatience | undefined, init: Omit<RequestInit, 'signal'>): Promise<PatientResponse> {
  try {
    return await fetchTextPatiently(url, { ...patience, fetch: get, init, ...(signal ? { signal } : {}) });
  } catch (error) {
    if (signal?.aborted) throw error;
    // La cause lisible (adresse injoignable, nom introuvable, certificat refusé…), pas seulement « fetch failed ».
    throw new Error(t('Pas de réponse du site des mises à jour : la borne est-elle connectée à Internet ? ({message})', { message: describeNetworkError(error) }));
  }
}

/**
 * Reads and checks a published feed (signature, then content). Used by the cabinets and by the
 * publication (scripts/publier.mjs), which reads the feed of the last full publication.
 */
export async function readFeed(url: string, opts: { publicKey?: string; fetch?: typeof fetch; signal?: AbortSignal; patience?: UpdatePatience } = {}): Promise<UpdateManifest> {
  const response = await readUpdateSite(url, opts.fetch ?? fetch, opts.signal, opts.patience, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  if (response.status === 404) throw new Error(t('Aucune version publiée pour l’instant sur le site des mises à jour.'));
  if (!response.ok) throw new Error(t('Le site des mises à jour répond HTTP {status}.', { status: response.status }));
  return openEnvelope(response.text, opts.publicKey ?? updatePublicKey());
}

/**
 * fetch that reads the test channel's repository: the token is attached only to the addresses of
 * this repository's API, and an attached file is requested as binary. GitHub then redirects to an
 * external storage, followed here without the token (it must not leave the API; the storage would
 * refuse it). Any other address goes through as is.
 */
export function channelFetch(channel: PrivateChannel | undefined, base: typeof fetch = fetch): typeof fetch {
  if (!channel) return base;
  const prefix = `${channel.api ?? GITHUB_API}/repos/${channel.repository}/`;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(prefix)) return base(input, init);
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${channel.token}`);
    headers.set('x-github-api-version', '2022-11-28');
    if (url.startsWith(`${prefix}releases/assets/`)) headers.set('accept', 'application/octet-stream');
    else if (!headers.has('accept')) headers.set('accept', 'application/vnd.github+json');
    let response = await base(url, { ...init, headers, redirect: 'manual' });
    for (let hops = 0; hops < 5 && response.status >= 300 && response.status < 400 && response.headers.get('location'); hops++) {
      const next = new URL(response.headers.get('location')!, url).href;
      const plain = new Headers(init?.headers);
      plain.delete('authorization');
      response = await base(next, { ...init, headers: plain, redirect: 'follow' });
    }
    return response;
  }) as typeof fetch;
}

/** Most recent release of a GitHub API list, and the API address of each attached file of the list. */
interface NewestRelease {
  version: string;
  /** Address of the feed: for download (public repository), or of the API (private repository). */
  feed: string;
  /** Download address of an attached file → its address in the API (for a private repository). */
  apiUrls: Map<string, string>;
}

async function newestRelease(listUrl: string, get: typeof fetch, signal: AbortSignal | undefined, viaApi: boolean, patience: UpdatePatience | undefined): Promise<NewestRelease | undefined> {
  const response = await readUpdateSite(listUrl, get, signal, patience, {
    headers: { accept: 'application/vnd.github+json', 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error(t('Le site des mises à jour répond HTTP {status}.', { status: response.status }));
  type Listed = { tag_name?: string; draft?: boolean; assets?: { name?: string; browser_download_url?: string; url?: string }[] };
  const listed = JSON.parse(response.text) as Listed[];
  let best: NewestRelease | undefined;
  const apiUrls = new Map<string, string>();
  for (const r of Array.isArray(listed) ? listed : []) {
    if (r.draft) continue;
    for (const a of r.assets ?? []) if (a.browser_download_url && a.url) apiUrls.set(a.browser_download_url, a.url);
    const version = r.tag_name?.replace(/^v/, '');
    const asset = r.assets?.find((a) => a.name === UPDATE_FEED_NAME);
    const feed = viaApi ? asset?.url : asset?.browser_download_url;
    if (!version || !isVersion(version) || !feed) continue;
    if (!best || compareAppVersions(version, best.version) > 0) best = { version, feed, apiUrls };
  }
  return best;
}

/**
 * Address of the most recent feed, pre-releases included: the one of the highest-version release
 * that has one (drafts are not listed without a token). The feed is still checked by its
 * signature: the list only says where to look for it.
 */
export async function prereleaseFeedUrl(opts: { releasesUrl?: string; fetch?: typeof fetch; signal?: AbortSignal; patience?: UpdatePatience } = {}): Promise<string> {
  const best = await newestRelease(opts.releasesUrl ?? releasesApiUrl(), opts.fetch ?? fetch, opts.signal, false, opts.patience);
  if (!best) throw new Error(t('Aucune version publiée pour l’instant sur le site des mises à jour.'));
  return best.feed;
}

/** Looks for the latest published version and compares it with the running one. */
export async function checkForUpdate(opts: {
  current: string;
  feedUrl?: string;
  /** Pre-releases included: the feed of the most recent release (CYBERPINBALL_MAJ_URL replaces them too). */
  prereleases?: boolean;
  /**
   * Private test channel: its releases are added to the public pre-releases, the most recent one
   * wins. An unreadable channel (token refused...) is an error: never a silent fallback.
   */
  channel?: PrivateChannel;
  releasesUrl?: string;
  publicKey?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  patience?: UpdatePatience;
}): Promise<UpdateCheck> {
  let url = opts.feedUrl ?? updateFeedUrl();
  const plain = opts.fetch ?? fetch;
  let get = plain;
  let privateRelease: NewestRelease | undefined;
  const listed = !opts.feedUrl && !process.env.CYBERPINBALL_MAJ_URL;
  if ((opts.prereleases || opts.channel) && listed) {
    // Unreadable list (API limit reached...): the feed of the releases, always readable.
    const pub = await newestRelease(opts.releasesUrl ?? releasesApiUrl(), plain, opts.signal, false, opts.patience).catch((error) => {
      if (opts.signal?.aborted) throw error;
      return undefined;
    });
    if (pub) url = pub.feed;
    if (opts.channel) {
      const channel = opts.channel;
      get = channelFetch(channel, plain);
      try {
        privateRelease = await newestRelease(releasesApiUrl(channel.repository, channel.api, PRIVATE_RELEASES_LISTED), get, opts.signal, true, opts.patience);
      } catch (error) {
        if (opts.signal?.aborted) throw error;
        throw new Error(t('Canal d’essai {repository} illisible : {message} Vérifie le jeton de canal-essai.json, ou reviens aux versions publiques.', { repository: channel.repository, message: (error as Error).message }));
      }
      if (privateRelease && (!pub || compareAppVersions(privateRelease.version, pub.version) > 0)) url = privateRelease.feed;
      else privateRelease = undefined;
    }
  }
  const latest = await readFeed(url, { fetch: get, publicKey: opts.publicKey ?? updatePublicKey(), ...(opts.signal ? { signal: opts.signal } : {}), ...(opts.patience ? { patience: opts.patience } : {}) });
  // Private repository: its files can only be downloaded through the API, with the token (channelFetch).
  // Only the address changes: size and hash stay those of the signed feed.
  if (privateRelease) {
    const viaApi = <A extends UpdateAsset>(asset: A): A => ({ ...asset, url: privateRelease.apiUrls.get(asset.url) ?? asset.url });
    latest.installer = viaApi(latest.installer);
    if (latest.app) latest.app = viaApi(latest.app);
  }
  return { status: compareAppVersions(latest.version, opts.current) > 0 ? 'available' : 'up-to-date', current: opts.current, latest };
}

// ---------- Light update or installer ----------

/**
 * Base of an installed application: cyberpinball.socle field of app\resources\app\package.json
 * (scripts/fabriquer.mjs). Undefined for a version from before the light update, or run
 * from the sources.
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
  /** Light package: same base, only the application changes. */
  | { kind: 'light'; asset: UpdateAsset }
  /** Installer: different base (or feed without a light package). thenLight: it installs a version older than the feed, the light update follows. */
  | { kind: 'installer'; asset: UpdateAsset; installs: string; thenLight: boolean }
  /** Neither: the published installer brings nothing more recent than the installed version. */
  | { kind: 'none'; installs: string };

/** How to go from the installed version (and its base) to the feed's one. */
export function updatePlan(manifest: UpdateManifest, current: string, socle: string | undefined): UpdatePlan {
  if (manifest.app && socle && manifest.app.socle === socle) return { kind: 'light', asset: manifest.app };
  const installs = manifest.installer.version ?? manifest.version;
  if (compareAppVersions(installs, current) <= 0) return { kind: 'none', installs };
  return { kind: 'installer', asset: manifest.installer, installs, thenLight: installs !== manifest.version };
}

// ---------- Download ----------

/** Folder of the downloaded installers, in downloads\ of the root folder. */
export function updateDownloadsDir(downloadsDir: string): string {
  return path.join(downloadsDir, 'cyberpinball');
}

/** Local name of the installer: the version it installs is in it, so that two downloads are never confused. */
export function updateInstallerFile(dir: string, manifest: UpdateManifest): string {
  return path.join(dir, `CyberPinball-Setup-${manifest.installer.version ?? manifest.version}.exe`);
}

/** Local name of the light package. */
export function updateAppFile(dir: string, manifest: UpdateManifest): string {
  return path.join(dir, `CyberPinball-application-${manifest.version}.zip`);
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

/**
 * Downloads the installer described by the manifest, or reuses the one already downloaded
 * if it is intact. A file with the wrong size or hash is deleted, never launched.
 * The old installers of the folder are deleted: only the latest one is used.
 */
export async function downloadUpdate(manifest: UpdateManifest, dir: string, opts: DownloadOptions = {}): Promise<string> {
  return downloadAsset(manifest.installer, updateInstallerFile(dir, manifest), opts);
}

/** Downloads the light package, like the installer: checked, reused if already there, the old ones deleted. */
export async function downloadAppPackage(manifest: UpdateManifest, dir: string, opts: DownloadOptions = {}): Promise<string> {
  if (!manifest.app) throw new Error(t('Flux de mise à jour incomplet : {what}.', { what: t('paquet de l’application illisible') }));
  return downloadAsset(manifest.app, updateAppFile(dir, manifest), opts);
}

export interface DownloadOptions {
  onProgress?: (received: number, total: number) => void;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

/** Files downloaded by the updates, and their leftovers: only one of each kind is kept. */
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

  // Received as ".part", resumed where it stopped after an interruption (resumable.ts).
  const part = `${file}.part`;
  const total = asset.size;
  let got: Awaited<ReturnType<typeof fetchResumable>>;
  try {
    got = await fetchResumable({
      url: asset.url,
      part,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
      size: total,
      hashes: ['sha256'],
      onData: (received) => opts.onProgress?.(received, total),
    });
  } catch (error) {
    const e = error instanceof ResumableError ? error : undefined;
    if (opts.signal?.aborted || e?.reason === 'aborted') {
      fs.rmSync(part, { force: true });
      throw new Error(t('Téléchargement annulé.'));
    }
    if (e?.reason === 'http') {
      fs.rmSync(part, { force: true });
      throw new Error(t('Téléchargement impossible (HTTP {status}) : {url}', { status: e.status ?? 0, url: asset.url }));
    }
    // Interruption: the partial file stays, the next attempt will resume there.
    if (e && !e.kept) fs.rmSync(part, { force: true });
    throw new Error(t('Téléchargement interrompu : {message}', { message: (error as Error).message }));
  }
  const size = got.received;
  const actual = size === total ? got.sha256 : undefined;
  if (actual !== asset.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error(
      size !== total
        ? t('Téléchargement incomplet ({size} octets reçus sur {total}) : fichier supprimé.', { size, total })
        : t('Empreinte SHA-256 du fichier téléchargé incorrecte (attendu {expected}, obtenu {actual}) : fichier supprimé.', { expected: asset.sha256, actual: String(actual) }),
    );
  }
  renameWithRetry(part, file);
  return file;
}

// ---------- Putting the light package in place ----------

/** Folder where the light package is unpacked, next to its download. */
export function stagedAppDir(dir: string, manifest: UpdateManifest): string {
  return path.join(dir, `application-${manifest.version}`);
}

/** Windows tar.exe (bsdtar): it reads and writes zips. Git's one (GNU tar) does not read them. */
export function windowsTar(): string {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
}

/** Time allowed to unpack the light package (about twenty MB, a few seconds usually). */
export const UNPACK_TIMEOUT_MS = 2 * 60_000;

/**
 * Unpacks the light package into `target` (emptied first), then checks that it really contains the
 * feed's version, with the announced base: a package that does not match is erased, never put in place.
 */
export function unpackAppPackage(zip: string, target: string, manifest: UpdateManifest): void {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  // Never endless (17/11/2026): a hung tar froze the application without saying anything.
  const run = spawnSync(windowsTar(), ['-x', '-f', zip, '-C', target], { encoding: 'utf8', windowsHide: true, timeout: UNPACK_TIMEOUT_MS });
  let problem: string | undefined;
  if (run.status !== 0) problem = (run.error?.message ?? run.stderr) || `tar ${run.status}`;
  else {
    let pkg: { version?: string; cyberpinball?: { socle?: string } } = {};
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    } catch {
      // No package.json: reported below.
    }
    if (pkg.version !== manifest.version || pkg.cyberpinball?.socle !== manifest.app?.socle) {
      problem = t('il contient la version {version}, pas {expected}', { version: String(pkg.version), expected: manifest.version });
    } else if (!fs.existsSync(path.join(target, 'dist', 'main.js')) || !fs.existsSync(path.join(target, 'renderer', 'frontend.html'))) {
      // The right number, but not the code (0.1.13-essai.1, published incomplete): say it as is.
      problem = t('le code de l’application manque dans le paquet');
    }
  }
  if (problem) {
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error(t('Paquet de l’application inutilisable ({problem}) : rien n’a été remplacé.', { problem: problem.trim() }));
  }
}

/** What app/src/maj-legere.ts does once Cyber Pinball is closed (written as JSON next to the package). */
export interface LightUpdateJob {
  /** Cyber Pinball process to wait for. */
  pid: number;
  /** app\resources\app, to be replaced. */
  appDir: string;
  /** Unpacked package (stagedAppDir). */
  staged: string;
  version: string;
  /** Relaunch: CyberPinball.exe, its previous arguments, its working folder. */
  exe: string;
  args: string[];
  cwd: string;
  /** Write the version in "Programs and Features" (not in a sandbox). */
  registry: boolean;
  /** Log of the operation. */
  log: string;
}

/** Waits for a process to end (up to timeoutMs). True if it ended. */
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
 * Replaces `appDir` with `staged`: the old one becomes <appDir>.precedente for the duration of
 * the operation (attempts during `retryMs`, as long as a file stays held), put back if the
 * new one cannot take its place, deleted otherwise. On error, `appDir` is intact.
 * False if the old one could not be deleted right away (a file still held by a
 * Chromium process that is finishing closing): the update is done anyway, and
 * removePreviousApp removes it at the next startup.
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
      renameWithRetry(staged, appDir);
    } catch {
      // Other drive (EXDEV): copy, then erase the unpacked package.
      copyTree(staged, appDir);
      fs.rmSync(staged, { recursive: true, force: true });
    }
  } catch (error) {
    fs.rmSync(appDir, { recursive: true, force: true });
    renameWithRetry(previous, appDir);
    throw error;
  }
  return removePreviousApp(appDir);
}

/**
 * Removes <appDir>.precedente, a leftover of a light update (new attempts for 5 s if
 * a file is still held). True if nothing is left of it; never an error.
 */
export function removePreviousApp(appDir: string): boolean {
  const previous = `${appDir}.precedente`;
  try {
    fs.rmSync(previous, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch {
    // Removed at the next startup, or at the next update.
  }
  return !fs.existsSync(previous);
}

// ---------- Installation ----------

/**
 * Arguments of the installer for an update: /MAJ (waits for Cyber Pinball to close, keeps the
 * shortcuts, relaunches the application), /D= the root folder last.
 * Off-screen (tests), it is also silent: no window opens.
 */
export function updateInstallerArguments(root: string, opts: { silent?: boolean } = {}): string[] {
  return ['/MAJ', ...(opts.silent ? ['/S'] : []), `/D=${root}`];
}

/** Command line of the relaunch (CYBERPINBALL_MAJ_ARGS): the application's arguments, in quotes if needed. */
export function relaunchArguments(args: string[]): string {
  return args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
}

export interface PendingUpdate {
  from: string;
  /** Version expected at restart (the one set by the installer or the light package). */
  to: string;
  /** Date the installer was launched or the package put in place (ISO 8601). */
  started: string;
  /** Installer launched, or light package put in place. */
  installer: string;
}

export function recordPendingUpdate(dataDir: string, pending: PendingUpdate): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(path.join(dataDir, UPDATE_PENDING_FILE), `${JSON.stringify(pending, null, 2)}\n`);
}

export type UpdateOutcome =
  | { kind: 'installed'; from: string; to: string }
  /** The installer did not succeed: the old version is still there. */
  | { kind: 'failed'; from: string; to: string; current: string };

/**
 * At startup: had an update been launched? Reads and erases the tracking, and says whether
 * the expected version is running. A version more recent than the previous one also counts as
 * installed: a version from before the light update recorded the feed's version, whereas
 * the installer of a quick publication sets the one of the last full publication.
 * Unreadable tracking is erased silently.
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
