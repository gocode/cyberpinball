// Installer Firefox depuis Cyber Pinball (compte YouTube du Juke-box : la connexion se reprend de
// Firefox, seul navigateur dont yt-dlp lit les cookies). Sur demande de l'utilisateur, confirmée :
// 1. l'installateur officiel de Mozilla, en HTTPS depuis download.mozilla.org (français, 64 bits),
//    téléchargé dans <racine>\tools\firefox, progression relevée ;
// 2. sa signature Authenticode vérifiée par Windows (Get-AuthenticodeSignature) : valide, et
//    l'éditeur est Mozilla Corporation. Sinon le fichier est effacé et rien n'est lancé ;
// 3. lancé en mode silencieux (/S), par Windows avec élévation (une seule demande de Windows, au-dessus
//    de tout, sans fenêtre d'installateur sous les écrans de la borne) ;
// 4. Firefox est alors trouvé à sa place (firefox.exe), l'installateur effacé.
// Sans réseau vers Mozilla, winget (Mozilla.Firefox.fr), s'il est là, fait la même chose.
// Chaque échec rend sa raison en clair, et une entrée dans erreurs.txt.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fetchResumable, firefoxExePaths, mozillaSigned, renameWithRetryAsync, t, FIREFOX_DOWNLOAD_URL, type DownloadManager } from '@cyberpinball/core';
import { journalIncident } from './uncaught';

export type FirefoxProgress = { phase: 'download' | 'verify' | 'install'; received?: number; total?: number };
export type FirefoxResult = { ok: true; exe: string } | { ok: false; reason: string; cancelled?: boolean };

export interface FirefoxInstallerOptions {
  /** Racine de Cyber Pinball (l'installateur passe par <racine>\tools\firefox). */
  root(): string | undefined;
  /** Gestionnaire de téléchargements : l'installateur y est suivi, comme le pilote de la Kinect. */
  downloads?: DownloadManager;
  /** Essais : téléchargement, vérification, lancement et recherche de Firefox remplacés. */
  fetch?: typeof fetch;
  verify?(file: string): Promise<{ ok: boolean; detail: string }>;
  runInstaller?(file: string, signal?: AbortSignal): Promise<number>;
  winget?(signal?: AbortSignal): Promise<number | undefined>;
  find?(): string | undefined;
}

/** Signature Authenticode d'un fichier, lue par Windows : « Valid|CN=…, O=Mozilla Corporation, … ». */
export function mozillaSignature(file: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const script = `$s = Get-AuthenticodeSignature -LiteralPath $env:CP_FICHIER; "$($s.Status)|$($s.SignerCertificate.Subject)"`; // i18n-ignore : script PowerShell, journal
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, env: { ...process.env, CP_FICHIER: file } });
    let out = '';
    ps.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    ps.on('error', (e) => resolve({ ok: false, detail: e.message }));
    ps.on('close', () => resolve({ ok: mozillaSigned(out.trim()), detail: out.trim().slice(0, 200) }));
  });
}

/** L'installateur, élevé par Windows (une demande d'autorisation), en silence ; rend son code de sortie. */
function elevated(file: string, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve) => {
    const script = `$p = Start-Process -FilePath $env:CP_FICHIER -ArgumentList '/S' -Verb RunAs -Wait -PassThru; exit $p.ExitCode`; // i18n-ignore : script PowerShell, journal
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, env: { ...process.env, CP_FICHIER: file } });
    signal?.addEventListener('abort', () => ps.kill(), { once: true });
    ps.on('error', () => resolve(-1));
    ps.on('close', (code) => resolve(code ?? -1));
  });
}

/** winget, s'il est là : Firefox en français, sans question ; undefined s'il n'est pas installé. */
function winget(signal?: AbortSignal): Promise<number | undefined> {
  if (spawnSync('winget.exe', ['--version'], { windowsHide: true, timeout: 15_000 }).status !== 0) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const p = spawn('winget.exe', ['install', '--id', 'Mozilla.Firefox.fr', '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], { windowsHide: true });
    signal?.addEventListener('abort', () => p.kill(), { once: true });
    p.on('error', () => resolve(undefined));
    p.on('close', (code) => resolve(code ?? -1));
  });
}

export function createFirefoxInstaller(opts: FirefoxInstallerOptions) {
  const find = () => (opts.find ? opts.find() : firefoxExePaths(process.env).find((p) => fs.existsSync(p)));
  const fail = (reason: string, detail: string): FirefoxResult => {
    journalIncident(`Installation de Firefox : ${detail}`); // i18n-ignore : journal
    return { ok: false, reason };
  };

  async function viaWinget(signal: AbortSignal | undefined, progress: (p: FirefoxProgress) => void, why: string): Promise<FirefoxResult> {
    progress({ phase: 'install' });
    const code = await (opts.winget ?? winget)(signal);
    if (signal?.aborted) return { ok: false, reason: t('arrêté'), cancelled: true };
    if (code === undefined) return fail(t('Firefox n’a pas pu être téléchargé ({why}), et winget n’est pas sur ce PC : vérifiez la connexion à Internet, puis réessayez.', { why }), `téléchargement impossible (${why}), pas de winget`); // i18n-ignore : script PowerShell, journal
    const exe = find();
    return exe ? { ok: true, exe } : fail(t('winget n’a pas installé Firefox (code {code}).', { code }), `winget, code ${code}`);
  }

  /** Installe Firefox ; `progress` suit le téléchargement, la vérification, l'installation. */
  async function install(progress: (p: FirefoxProgress) => void = () => undefined, signal?: AbortSignal): Promise<FirefoxResult> {
    const already = find();
    if (already) return { ok: true, exe: already };
    const root = opts.root();
    if (!root) return { ok: false, reason: t('Dossier de Cyber Pinball introuvable.') };
    const dir = path.join(root, 'tools', 'firefox');
    const file = path.join(dir, 'Firefox-Setup.exe');
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
      job?.fail('network', (error as Error).message);
      return viaWinget(signal, progress, (error as Error).message);
    }
    try {
      progress({ phase: 'verify' });
      const signature = await (opts.verify ?? mozillaSignature)(file);
      // Pas signé par Mozilla : jamais lancé.
      if (!signature.ok) return fail(t('Le fichier reçu n’est pas signé par Mozilla : il est effacé, rien n’a été lancé.'), `signature refusée (${signature.detail})`); // i18n-ignore : script PowerShell, journal
      progress({ phase: 'install' });
      const code = await (opts.runInstaller ?? elevated)(file, signal);
      if (signal?.aborted) return { ok: false, reason: t('arrêté'), cancelled: true };
      const exe = find();
      if (exe) return { ok: true, exe };
      return fail(code === 1223 || code === 1 ? t('Windows n’a pas autorisé l’installation : acceptez sa demande (souris ou clavier), puis réessayez.') : t('L’installateur de Firefox s’est arrêté (code {code}) sans installer Firefox.', { code }), `installateur, code ${code}`);
    } finally {
      fs.rmSync(file, { force: true });
      fs.rmSync(part, { force: true });
    }
  }

  return { install, installed: () => Boolean(find()), exe: find };
}

export type FirefoxInstaller = ReturnType<typeof createFirefoxInstaller>;
