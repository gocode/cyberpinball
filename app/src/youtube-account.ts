// Compte YouTube du Juke-box sur la borne (cœur : packages/core/src/youtube-account.ts).
// - La connexion se fait dans la fenêtre « Récupérer » (session du navigateur intégré, gardée d'un
//   démarrage à l'autre), sur la page de connexion de Google. Cyber Pinball ne voit ni ne garde aucun
//   mot de passe : il lit seulement, dans les cookies de la session, si le compte est connecté.
// - Repli, si Google refuse la connexion dans le navigateur intégré : reprendre la connexion d'un
//   navigateur où l'utilisateur est déjà connecté (yt-dlp --cookies-from-browser). Seuls les cookies
//   de YouTube et de Google entrent dans la session ; le fichier intermédiaire est effacé aussitôt.
// - yt-dlp reçoit les cookies du compte par un fichier Netscape (--cookies), écrit dans un dossier
//   temporaire propre à l'application pour un seul appel, puis effacé. Les cookies que YouTube
//   renouvelle pendant l'appel sont reportés dans la session. Le fichier et son contenu ne vont
//   jamais dans un journal ni dans un message d'erreur.
// - Déconnexion : les cookies de YouTube et de Google sont effacés de la session, rien d'autre.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  accountPlaylistsArgs,
  ACCOUNT_NAME_PROBE,
  browserCookiesArgs,
  browserCookiesProblem,
  changedCookies,
  COOKIE_BROWSERS,
  firefoxMissing,
  firefoxUnused,
  firefoxProfilesIni,
  isYoutubeAccountDomain,
  isYoutubeDomain,
  netscapeCookies,
  parseAccountPlaylists,
  parseNetscapeCookies,
  t,
  YOUTUBE_ACCOUNT_PAGE,
  youtubePlaylistSearchUrl,
  youtubeState,
  type AccountPlaylist,
  type CookieBrowser,
  type CookieRecord,
  type SiteState,
} from '@cyberpinball/core';
import type { Acquirer, AcquireRequest } from './acquire-window';
import type { FirefoxInstaller, FirefoxProgress, FirefoxResult } from './firefox-install';
import { journalIncident } from './uncaught';
import type { RunResult } from './ytdlp-tool';

export interface YoutubeAccountOptions {
  acquirer: Pick<Acquirer, 'cookiesWhere' | 'setCookies' | 'signOutWhere' | 'readPage' | 'show'>;
  ytdlp: { run(args: string[], signal?: AbortSignal): Promise<RunResult> };
  /** Moteur JavaScript de yt-dlp : l'exécutable de Cyber Pinball, en mode Node. */
  node?: string;
  /** Dossier temporaire des fichiers de cookies ; par défaut <temp>\cyberpinball-cookies. */
  tempDir?: string;
  /** Installation de Firefox à la demande (firefox-install.ts) ; absente : pas proposée. */
  firefox?: Pick<FirefoxInstaller, 'install' | 'installed'>;
  /** Profils de Firefox (essais) ; par défaut, profiles.ini de Firefox dans %APPDATA%. */
  firefoxIni?: string;
  /** L'état a changé (connexion, déconnexion, nom lu) : les écrans se redessinent. */
  changed?(): void;
}

export interface YoutubeAccountState extends SiteState {
  /** Nom du compte, s'il a pu être lu dans la page du compte. */
  name?: string;
}

export type AccountResult<T> = ({ ok: true } & T) | { ok: false; reason: string; cancelled?: boolean };

export function createYoutubeAccount(opts: YoutubeAccountOptions) {
  const dir = opts.tempDir ?? path.join(os.tmpdir(), 'cyberpinball-cookies');
  let state: YoutubeAccountState = { connected: false, remembered: false };
  /** Le nom lu pour cette connexion (relu après une reconnexion). */
  let nameFor: string | undefined;
  /** Fichiers en cours d'usage : jamais effacés par le ménage d'un autre appel. */
  const active = new Set<string>();
  /**
   * Essais (démonstrations) : CYBERPINBALL_COMPTE_YOUTUBE donne le nom d'un compte fictif, connecté par
   * des cookies inventés posés dans la session ; la page du compte n'est jamais chargée. En bac à sable
   * seulement (CYBERPINBALL_HOME : profil de Chromium à part), jamais dans la vraie session.
   */
  const trial = (process.env.CYBERPINBALL_HOME && process.env.CYBERPINBALL_COMPTE_YOUTUBE?.trim()) || undefined;
  let trialReady: Promise<unknown> | undefined;
  const trialCookies = () => {
    if (!trial) return Promise.resolve();
    const expirationDate = Math.floor(Date.now() / 1000) + 365 * 86400;
    trialReady ??= opts.acquirer.setCookies(['SID', 'SAPISID', 'LOGIN_INFO'].map((name) => ({ name, value: `essai-fictif-${name}`, domain: '.youtube.com', path: '/', secure: true, expirationDate })));
    return trialReady;
  };

  /** Fichiers laissés par un arrêt brutal (coupure de courant pendant un appel) : effacés. */
  function sweep(): void {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const file = path.join(dir, name);
      if (!active.has(file)) fs.rmSync(file, { force: true });
    }
  }

  function tempFile(): string {
    fs.mkdirSync(dir, { recursive: true });
    sweep();
    const file = path.join(dir, `cookies-${crypto.randomBytes(8).toString('hex')}.txt`);
    active.add(file);
    return file;
  }

  function drop(file: string): void {
    active.delete(file);
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Tenu par un antivirus : le prochain ménage l'effacera.
    }
  }

  const accountCookies = () => opts.acquirer.cookiesWhere(isYoutubeAccountDomain);
  /** Pourquoi le dernier import de Firefox a échoué : « Pas connecté » ne s'affiche jamais sans raison. */
  let problem: string | undefined;
  const firefoxIni = () => opts.firefoxIni ?? firefoxProfilesIni(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'));

  /** Relit l'état dans les cookies de la session ; le nom du compte, au mieux, une fois par connexion. */
  async function refresh(): Promise<YoutubeAccountState> {
    await trialCookies();
    const cookies = await accountCookies();
    const read = youtubeState(cookies);
    const session = cookies.find((c) => isYoutubeDomain(c.domain) && (c.name === 'SID' || c.name === '__Secure-3PSID'))?.value;
    const key = session ? crypto.createHash('sha256').update(session).digest('hex').slice(0, 16) : undefined;
    const sameAccount = read.connected && key === nameFor;
    state = { ...read, ...(sameAccount && state.name ? { name: state.name } : {}) };
    opts.changed?.();
    if (read.connected && !sameAccount) {
      nameFor = key;
      void readName(key);
    }
    return state;
  }

  async function readName(key: string | undefined): Promise<void> {
    try {
      const name = trial ?? (await opts.acquirer.readPage(YOUTUBE_ACCOUNT_PAGE, ACCOUNT_NAME_PROBE, 20_000));
      if (typeof name === 'string' && name.trim() && nameFor === key && state.connected) {
        state = { ...state, name: name.trim().slice(0, 80) };
        opts.changed?.();
      }
    } catch {
      // Nom illisible : l'état dit « connecté » seul.
    }
  }

  /**
   * Un appel de yt-dlp avec les cookies du compte : `work` reçoit le fichier (absent si le compte
   * n'est pas connecté), qui est effacé ensuite quoi qu'il arrive. Les cookies renouvelés par YouTube
   * pendant l'appel reviennent dans la session. Le chemin du fichier est retiré de la sortie.
   */
  async function withCookies(work: (file: string | undefined) => Promise<RunResult>): Promise<RunResult> {
    let cookies: CookieRecord[];
    try {
      cookies = await accountCookies();
    } catch {
      return work(undefined);
    }
    if (!youtubeState(cookies).connected) return work(undefined);
    const file = tempFile();
    try {
      fs.writeFileSync(file, netscapeCookies(cookies), { encoding: 'utf8', mode: 0o600 });
      const r = await work(file);
      try {
        const renewed = changedCookies(cookies, parseNetscapeCookies(fs.readFileSync(file, 'utf8')));
        if (renewed.length) await opts.acquirer.setCookies(renewed);
      } catch {
        // Fichier relu impossible : la session garde ses cookies.
      }
      return r.ok ? { ...r, lines: r.lines.map((l) => l.split(file).join('cookies.txt')) } : r;
    } finally {
      drop(file);
    }
  }

  /** Les playlists du compte (J'aime, À regarder plus tard, puis les siennes), par yt-dlp avec les cookies. */
  async function playlists(signal?: AbortSignal): Promise<AccountResult<{ lists: AccountPlaylist[] }>> {
    const r = await withCookies((file) => (file ? opts.ytdlp.run(accountPlaylistsArgs(file, opts.node), signal) : Promise.resolve({ ok: false, reason: t('Compte YouTube pas connecté') } as RunResult)));
    if (!r.ok) return r;
    let json: unknown;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      const error = r.lines.find((l) => /^ERROR:/.test(l));
      // Liste illisible : les deux playlists personnelles restent proposées.
      if (!error) return { ok: true, lists: parseAccountPlaylists(undefined) };
      if (/sign in|login|cookies/i.test(error)) return { ok: false, reason: t('YouTube ne reconnaît plus la connexion : reconnectez le compte') };
      return { ok: false, reason: error.replace(/^ERROR:\s*/, '').slice(0, 200) };
    }
    return { ok: true, lists: parseAccountPlaylists(json) };
  }

  /**
   * Repli : la connexion d'un navigateur où l'utilisateur est déjà connecté à YouTube. yt-dlp lit les
   * cookies du navigateur et les écrit dans un fichier temporaire ; seuls ceux de YouTube et de Google
   * entrent dans la session, puis le fichier est effacé.
   */
  async function fromBrowser(browser: CookieBrowser, signal?: AbortSignal): Promise<AccountResult<{ state: YoutubeAccountState }>> {
    const label = COOKIE_BROWSERS.find((b) => b.id === browser)?.label ?? browser;
    const file = tempFile();
    // Un échec dit pourquoi à l'écran, et laisse une entrée dans erreurs.txt (le nombre de cookies, jamais leur valeur).
    const fail = (reason: string, detail: string): AccountResult<never> => {
      problem = reason;
      opts.changed?.();
      journalIncident(`Compte YouTube : connexion de ${label} pas reprise (${detail}) : ${reason}`); // i18n-ignore : journal
      return { ok: false, reason };
    };
    try {
      // Firefox absent : rien à lire, et la marche à suivre (plutôt qu'un « pas connecté » muet).
      if (!fs.existsSync(firefoxIni())) return fail(opts.firefox?.installed() ? firefoxUnused() : firefoxMissing(), opts.firefox?.installed() ? 'Firefox jamais ouvert' : 'Firefox absent'); // i18n-ignore : journal
      const r = await opts.ytdlp.run(browserCookiesArgs(browser, file, opts.node), signal);
      if (!r.ok) return r.cancelled ? r : fail(r.reason, 'yt-dlp');
      // Ce que yt-dlp a écrit, sans le chemin du fichier de cookies.
      const lines = r.lines.map((l) => l.split(file).join('cookies.txt'));
      let taken: CookieRecord[] = [];
      try {
        taken = parseNetscapeCookies(fs.readFileSync(file, 'utf8')).filter((c) => isYoutubeAccountDomain(c.domain));
      } catch {
        taken = [];
      }
      if (!youtubeState(taken).connected) return fail(browserCookiesProblem(lines, label, taken.length), `${taken.length} cookies de YouTube et de Google repris`); // i18n-ignore : journal
      const set = await opts.acquirer.setCookies(taken);
      const state = await refresh();
      // Repris mais pas posés dans la session (refusés par Chromium) : jamais « connecté » à tort.
      if (!state.connected) return fail(t('Les cookies de {browser} ont été lus, mais la session du navigateur intégré les a refusés.', { browser: label }), `${set} cookies posés sur ${taken.length}`); // i18n-ignore : journal
      problem = undefined;
      return { ok: true, state };
    } finally {
      drop(file);
    }
  }

  async function signOut(): Promise<void> {
    await trialCookies();
    await opts.acquirer.signOutWhere(isYoutubeAccountDomain);
    nameFor = undefined;
    problem = undefined;
    state = { connected: false, remembered: false };
    opts.changed?.();
  }

  /** Recherche de playlists sur YouTube dans « Récupérer » (même session, donc même compte). */
  function openSearch(query: string): void {
    const request: AcquireRequest = {
      url: youtubePlaylistSearchUrl(query),
      game: t('Juke-box'),
      expected: t('Ouvrez une playlist ou une vidéo, puis « Ajouter au Juke-box »'),
      host: 'youtube.com',
      status: t('Ouvrez une playlist ou une vidéo, puis « Ajouter au Juke-box » : l’import du Juke-box s’ouvre sur ce lien.'),
      search: { query: query.trim(), engine: 'youtube', playlists: true },
    };
    opts.acquirer.show(request);
  }

  /**
   * Firefox ici : prêt (déjà servi), installé mais jamais ouvert, ou absent (l'installer est proposé).
   */
  function firefoxStatus(): 'ready' | 'unused' | 'missing' {
    if (fs.existsSync(firefoxIni())) return 'ready';
    return opts.firefox?.installed() ? 'unused' : 'missing';
  }

  /** Installe Firefox (sur demande confirmée) ; la suite est dite à l'écran. */
  async function installFirefox(progress?: (p: FirefoxProgress) => void, signal?: AbortSignal): Promise<FirefoxResult> {
    if (!opts.firefox) return { ok: false, reason: t('Installation de Firefox indisponible ici.') };
    const r = await opts.firefox.install(progress, signal);
    if (r.ok) problem = undefined;
    opts.changed?.();
    return r;
  }

  return { firefoxStatus, installFirefox, canInstallFirefox: () => Boolean(opts.firefox), state: () => state, problem: () => (state.connected ? undefined : problem), refresh, withCookies, playlists, fromBrowser, signOut, openSearch };
}

export type YoutubeAccount = ReturnType<typeof createYoutubeAccount>;
