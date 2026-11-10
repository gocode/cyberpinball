// Installer Firefox depuis Cyber Pinball (compte YouTube du Juke-box : la connexion se reprend de
// Firefox, seul navigateur dont yt-dlp lit les cookies). Sur demande de l'utilisateur, confirmée,
// SANS demande d'autorisation de Windows (UAC) : la borne ne peut pas y répondre (PinCab,
// 10/11/2026, avec l'installateur classique, qui demande l'élévation sur un compte administrateur).
// 1. le paquet MSIX officiel de Mozilla, en HTTPS depuis download.mozilla.org, téléchargé dans
//    <racine>\tools\firefox et suivi dans le gestionnaire de téléchargements ;
// 2. sa signature vérifiée par Windows (Get-AuthenticodeSignature) : valide, et l'éditeur est Mozilla
//    Corporation. Sinon le fichier est effacé et rien n'est installé ;
// 3. installé pour ce compte seul (Add-AppxPackage) : ni droits d'administrateur, ni fenêtre ;
//    Windows vérifie de nouveau la signature du paquet. Au-delà de FIREFOX_INSTALL_MS, Cyber Pinball
//    cesse d'attendre ;
// 4. Firefox est alors trouvé (paquet de Mozilla inscrit pour ce compte), le fichier effacé.
// Son profil vit dans %LOCALAPPDATA%\Packages\Mozilla.MozillaFirefox_…\LocalCache\Roaming\Mozilla\Firefox
// (youtube-account.ts le passe à yt-dlp). Chaque échec rend sa raison en clair, et une entrée dans
// erreurs.txt.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fetchResumable, firefoxExePaths, mozillaSigned, renameWithRetryAsync, t, FIREFOX_DOWNLOAD_URL, FIREFOX_MSIX_PACKAGE, type DownloadManager } from '@cyberpinball/core';
import { journalIncident } from './uncaught';

export type FirefoxProgress = { phase: 'download' | 'verify' | 'install'; received?: number; total?: number };
export type FirefoxResult = { ok: true } | { ok: false; reason: string; cancelled?: boolean };

/** Installation du paquet : au-delà, Cyber Pinball n'attend plus. */
export const FIREFOX_INSTALL_MS = 5 * 60_000;

export interface FirefoxInstallerOptions {
  /** Racine de Cyber Pinball (le paquet passe par <racine>\tools\firefox). */
  root(): string | undefined;
  /** Gestionnaire de téléchargements : le paquet y est suivi, comme le pilote de la Kinect. */
  downloads?: DownloadManager;
  /** Essais : téléchargement, vérification, installation et recherche de Firefox remplacés. */
  fetch?: typeof fetch;
  verify?(file: string): Promise<{ ok: boolean; detail: string }>;
  addPackage?(file: string, signal?: AbortSignal): Promise<{ code: number; detail: string }>;
  installed?(): boolean;
}

function powershell(script: string, env: Record<string, string>, timeoutMs: number, signal?: AbortSignal): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, env: { ...process.env, ...env } });
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ps.kill();
    }, timeoutMs);
    signal?.addEventListener('abort', () => ps.kill(), { once: true });
    ps.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    ps.stderr.on('data', (c: Buffer) => (out += c.toString('utf8')));
    ps.on('error', (e) => resolve({ code: -1, out: e.message }));
    ps.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -2 : (code ?? -1), out: out.trim() });
    });
  });
}

/** Signature Authenticode d'un fichier, lue par Windows : « Valid|CN=…, O=Mozilla Corporation, … ». */
export async function mozillaSignature(file: string): Promise<{ ok: boolean; detail: string }> {
  const r = await powershell('$s = Get-AuthenticodeSignature -LiteralPath $env:CP_FICHIER; "$($s.Status)|$($s.SignerCertificate.Subject)"', { CP_FICHIER: file }, 60_000); // i18n-ignore : script PowerShell
  return { ok: mozillaSigned(r.out), detail: r.out.slice(0, 200) };
}

/** Le paquet, inscrit pour ce compte seul : jamais d'élévation. Code 0 si Windows l'a accepté. */
function addPackage(file: string, signal?: AbortSignal): Promise<{ code: number; detail: string }> {
  const script = 'try { Add-AppxPackage -Path $env:CP_FICHIER -ErrorAction Stop; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }'; // i18n-ignore : script PowerShell
  return powershell(script, { CP_FICHIER: file }, FIREFOX_INSTALL_MS, signal).then((r) => ({ code: r.code, detail: r.out.slice(0, 300) }));
}

/** Dossiers des paquets de Firefox (MSIX) inscrits pour ce compte. */
export function firefoxPackageDirs(localAppData = process.env.LOCALAPPDATA): string[] {
  if (!localAppData) return [];
  const packages = path.join(localAppData, 'Packages');
  try {
    return fs
      .readdirSync(packages)
      .filter((n) => n.toLowerCase().startsWith(`${FIREFOX_MSIX_PACKAGE.toLowerCase()}_`))
      .map((n) => path.join(packages, n));
  } catch {
    return [];
  }
}

/** Firefox est-il là : paquet MSIX inscrit pour ce compte, ou installation classique. */
export function firefoxPresent(): boolean {
  return firefoxPackageDirs().length > 0 || firefoxExePaths(process.env).some((p) => fs.existsSync(p));
}

export function createFirefoxInstaller(opts: FirefoxInstallerOptions) {
  const installed = () => (opts.installed ? opts.installed() : firefoxPresent());
  const fail = (reason: string, detail: string): FirefoxResult => {
    journalIncident(`Installation de Firefox : ${detail}`); // i18n-ignore : journal
    return { ok: false, reason };
  };

  /** Installe Firefox ; `progress` suit le téléchargement, la vérification, l'installation. */
  async function install(progress: (p: FirefoxProgress) => void = () => undefined, signal?: AbortSignal): Promise<FirefoxResult> {
    if (installed()) return { ok: true };
    const root = opts.root();
    if (!root) return { ok: false, reason: t('Dossier de Cyber Pinball introuvable.') };
    const dir = path.join(root, 'tools', 'firefox');
    const file = path.join(dir, 'Firefox.msix');
    const part = `${file}.part`;
    fs.mkdirSync(dir, { recursive: true });
    // Suivi dans le gestionnaire de téléchargements (son écran le montre, une coupure garde le partiel).
    const job = opts.downloads?.track({
      id: 'firefox-installer',
      kind: 'component',
      title: t('Installateur de Firefox (Mozilla)'),
      source: { kind: 'http', label: 'download.mozilla.org' },
      files: [{ ref: FIREFOX_DOWNLOAD_URL, name: path.basename(file), dest: file, part }],
      back: { screen: 'downloads' },
      resumable: true,
    });
    try {
      progress({ phase: 'download', received: 0 });
      await fetchResumable({
        url: FIREFOX_DOWNLOAD_URL,
        part,
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        ...(signal ? { signal } : {}),
        onData: (received, total) => {
          job?.progress(received, total);
          progress({ phase: 'download', received, ...(total ? { total } : {}) });
        },
      });
      fs.rmSync(file, { force: true });
      await renameWithRetryAsync(part, file);
      job?.done([{ index: 0, file }]);
    } catch (error) {
      if (signal?.aborted) {
        job?.cancel();
        return { ok: false, reason: t('arrêté'), cancelled: true };
      }
      const why = (error as Error).message;
      job?.fail('network', why);
      return fail(t('Firefox n’a pas pu être téléchargé ({why}) : vérifiez la connexion à Internet, puis réessayez.', { why }), `téléchargement impossible (${why})`); // i18n-ignore : journal
    }
    try {
      progress({ phase: 'verify' });
      const signature = await (opts.verify ?? mozillaSignature)(file);
      // Pas signé par Mozilla : jamais installé.
      if (!signature.ok) return fail(t('Le fichier reçu n’est pas signé par Mozilla : il est effacé, rien n’a été installé.'), `signature refusée (${signature.detail})`); // i18n-ignore : journal
      progress({ phase: 'install' });
      const r = await (opts.addPackage ?? addPackage)(file, signal);
      if (signal?.aborted) return { ok: false, reason: t('arrêté'), cancelled: true };
      if (installed()) return { ok: true };
      if (r.code === -2) return fail(t('Windows n’a pas fini d’installer Firefox en {min} minutes : Cyber Pinball n’attend plus. Réessayez plus tard.', { min: FIREFOX_INSTALL_MS / 60_000 }), 'installation sans fin'); // i18n-ignore : journal
      return fail(t('Windows a refusé d’installer Firefox : {detail}', { detail: r.detail || `code ${r.code}` }), `Add-AppxPackage, code ${r.code} (${r.detail})`); // i18n-ignore : journal
    } finally {
      fs.rmSync(file, { force: true });
      fs.rmSync(part, { force: true });
    }
  }

  return { install, installed };
}

export type FirefoxInstaller = ReturnType<typeof createFirefoxInstaller>;

/**
 * firefox.exe, par son chemin : installation classique, ou alias du paquet MSIX (dans le contexte du
 * paquet, donc avec son profil). Undefined : pas de Firefox.
 */
export function firefoxExe(): string | undefined {
  const alias = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'firefox.exe') : undefined;
  return [...firefoxExePaths(process.env), ...(alias && firefoxPackageDirs().length ? [alias] : [])].find((p) => fs.existsSync(p));
}

/**
 * Ouvre une adresse dans Firefox lancé par son chemin, jamais par le navigateur par défaut de Windows
 * (shell.openExternal) : juste après l'installation de Firefox, Windows demandait de choisir le
 * navigateur par défaut, à la souris (PinCab, 10/11/2026). Faux si Firefox n'est pas là.
 */
export function openInFirefox(url: string): boolean {
  const exe = firefoxExe();
  if (!exe || !/^https?:\/\//i.test(url)) return false;
  try {
    spawn(exe, ['-new-window', url], { detached: true, stdio: 'ignore' }).unref(); // fenêtre voulue
    return true;
  } catch {
    return false;
  }
}
