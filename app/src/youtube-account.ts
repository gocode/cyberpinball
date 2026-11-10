// Compte YouTube du Juke-box sur la borne (cœur : packages/core/src/youtube-account.ts).
// - La connexion se fait dans un vrai Microsoft Edge, avec un profil réservé au Juke-box
//   (<racine>\data\edge-youtube), ouvert sur l'écran choisi pour les navigateurs (edge-login.ts).
//   Cyber Pinball ne voit ni ne garde aucun mot de passe : il relit seulement les cookies d'Edge.
// - yt-dlp reçoit les cookies du compte par un fichier Netscape (--cookies), écrit dans un dossier
//   temporaire propre à l'application pour un seul appel, puis effacé. Le fichier et son contenu ne
//   vont jamais dans un journal ni dans un message d'erreur.
// - Déconnexion : le profil d'Edge du Juke-box est effacé, rien d'autre.
//
// Sans electron : les essais chargent ce module tel quel (faux Edge, faux yt-dlp).

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { accountPlaylistsArgs, edgeMissingText, netscapeCookies, parseAccountPlaylists, t, youtubeCookieState, youtubePlaylistSearchUrl, type AccountPlaylist, type CookieRecord, type ScreenRect } from '@cyberpinball/core';
import type { AcquireRequest } from './acquire-window';
import { createEdgeLogin, type EdgeLoginOptions, type EdgeSession } from './edge-login';
import type { RunResult } from './ytdlp-tool';

export interface YoutubeAccountOptions {
  /** Dossier des données de Cyber Pinball (<racine>\data) ; undefined avant l'installation. */
  dataDir(): string | undefined;
  ytdlp: { run(args: string[], signal?: AbortSignal): Promise<RunResult> };
  /** Moteur JavaScript de yt-dlp : l'exécutable de Cyber Pinball, en mode Node. */
  node?: string;
  /** Dossier temporaire des fichiers de cookies ; par défaut <temp>\cyberpinball-cookies. */
  tempDir?: string;
  /** Edge et ses gestes (essais : un faux Edge). */
  edge?: Omit<EdgeLoginOptions, 'dataDir' | 'log'>;
  /** Ouvre « Récupérer » (recherche de playlists sur YouTube). */
  show?(request: AcquireRequest): void;
  /** L'état a changé : les écrans se redessinent. */
  changed?(): void;
  log?(line: string): void;
}

export interface YoutubeAccountState {
  connected: boolean;
  /** Edge est ouvert pour la connexion. */
  signingIn?: boolean;
  /** L'état est en cours de lecture (Edge relancé sans fenêtre). */
  checking?: boolean;
  /** Pourquoi la dernière connexion n'a rien donné, ou pourquoi YouTube ne la reconnaît plus. */
  problem?: string;
}

export type AccountResult<T> = ({ ok: true } & T) | { ok: false; reason: string; cancelled?: boolean };

export function createYoutubeAccount(opts: YoutubeAccountOptions) {
  const dir = opts.tempDir ?? path.join(os.tmpdir(), 'cyberpinball-cookies');
  const log = (line: string) => opts.log?.(line);
  const changed = () => opts.changed?.();
  let state: YoutubeAccountState = { connected: false };
  let checked = false;
  let edgeFor: { dir: string; login: ReturnType<typeof createEdgeLogin> } | undefined;
  /** Fichiers en cours d'usage : jamais effacés par le ménage d'un autre appel. */
  const active = new Set<string>();

  function edge(): ReturnType<typeof createEdgeLogin> | undefined {
    const data = opts.dataDir();
    if (!data) return undefined;
    if (edgeFor?.dir !== data) edgeFor = { dir: data, login: createEdgeLogin({ dataDir: data, log, ...opts.edge }) };
    return edgeFor.login;
  }

  const set = (next: YoutubeAccountState) => {
    state = next;
    changed();
  };

  /** Cookies du compte ; une lecture ratée laisse l'état tel quel. */
  async function cookies(): Promise<CookieRecord[] | undefined> {
    const e = edge();
    if (!e || e.signingIn()) return undefined;
    try {
      return await e.readCookies();
    } catch {
      return undefined;
    }
  }

  /** Relit l'état dans les cookies d'Edge (Edge relancé sans fenêtre, une seconde ou deux). */
  async function refresh(): Promise<YoutubeAccountState> {
    const e = edge();
    if (!e || e.signingIn()) return state;
    if (!e.hasProfile()) {
      checked = true;
      if (state.connected) set({ connected: false });
      return state;
    }
    if (!checked) set({ ...state, checking: true });
    const read = await cookies();
    checked = true;
    if (!read) {
      set({ connected: state.connected });
      return state;
    }
    const connected = youtubeCookieState(read).connected;
    set({ connected, ...(!connected && state.problem ? { problem: state.problem } : {}) });
    return state;
  }

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

  /**
   * Un appel de yt-dlp avec les cookies du compte : `work` reçoit le fichier (absent si le compte
   * n'est pas connecté), qui est effacé ensuite quoi qu'il arrive. Le chemin est retiré de la sortie.
   */
  async function withCookies(work: (file: string | undefined) => Promise<RunResult>): Promise<RunResult> {
    const read = await cookies();
    if (!read || !youtubeCookieState(read).connected) return work(undefined);
    fs.mkdirSync(dir, { recursive: true });
    sweep();
    const file = path.join(dir, `cookies-${crypto.randomBytes(8).toString('hex')}.txt`);
    active.add(file);
    try {
      fs.writeFileSync(file, netscapeCookies(read), { encoding: 'utf8', mode: 0o600 });
      const r = await work(file);
      return r.ok ? { ...r, lines: r.lines.map((l) => l.split(file).join('cookies.txt')) } : r;
    } finally {
      active.delete(file);
      try {
        fs.rmSync(file, { force: true });
      } catch {
        // Tenu par un antivirus : le prochain ménage l'effacera.
      }
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
      if (/sign in|login|cookies/i.test(error)) {
        set({ connected: false, problem: t('YouTube ne reconnaît plus la connexion : reconnectez-vous dans Edge') });
        return { ok: false, reason: state.problem! };
      }
      return { ok: false, reason: error.replace(/^ERROR:\s*/, '').slice(0, 200) };
    }
    return { ok: true, lists: parseAccountPlaylists(json) };
  }

  /**
   * Ouvre Edge pour la connexion sur `at` (pixels physiques : l'écran choisi pour les navigateurs).
   * Edge refermé, l'état est relu ; `done` dit si le compte est connecté.
   */
  function signIn(at: ScreenRect): AccountResult<{ session: EdgeSession }> {
    const e = edge();
    if (!e) return { ok: false, reason: t('Cyber Pinball n’est pas installé') };
    if (!e.available()) return { ok: false, reason: edgeMissingText() };
    const session = e.open(at);
    if (!session) return { ok: false, reason: edgeMissingText() };
    set({ connected: state.connected, signingIn: true });
    void session.done.then((s) => {
      checked = true;
      set(s.connected ? { connected: true } : { connected: false, problem: t('Edge refermé sans connexion à YouTube : rien n’a été gardé.') });
    });
    return { ok: true, session };
  }

  async function signOut(): Promise<void> {
    await edge()?.forget();
    set({ connected: false });
  }

  /** Recherche de playlists sur YouTube dans « Récupérer » (publique, sans connexion). */
  function openSearch(query: string): void {
    opts.show?.({
      url: youtubePlaylistSearchUrl(query),
      game: t('Juke-box'),
      expected: t('Ouvrez une playlist ou une vidéo, puis « Ajouter au Juke-box »'),
      host: 'youtube.com',
      status: t('Ouvrez une playlist ou une vidéo, puis « Ajouter au Juke-box » : l’import du Juke-box s’ouvre sur ce lien.'),
      search: { query: query.trim(), engine: 'youtube', playlists: true },
    });
  }

  return {
    state: (): YoutubeAccountState => (edge()?.signingIn() ? { ...state, signingIn: true } : state),
    /** Edge est là (sinon « Se connecter » est grisé avec la raison). */
    edgeMissing: (): string | undefined => (edge() && !edge()!.available() ? edgeMissingText() : undefined),
    refresh,
    withCookies,
    playlists,
    signIn,
    signOut,
    openSearch,
  };
}

export type YoutubeAccount = ReturnType<typeof createYoutubeAccount>;
