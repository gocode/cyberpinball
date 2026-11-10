// Compte YouTube du Juke-box, connecté dans un vrai Microsoft Edge puis gardé par Cyber Pinball.
//
// Google refuse la connexion dans le navigateur intégré, et une liaison par l'API demanderait à chaque
// utilisateur un projet Google Cloud. Edge est déjà sur tout Windows 10 et 11 : Cyber Pinball l'ouvre
// avec un profil à lui (<racine>\data\edge-youtube), sur l'écran choisi pour les navigateurs, et la
// personne s'y connecte elle-même (la télécommande tape comme un clavier). Pour Google, c'est un Edge
// ordinaire : rien n'est maquillé, et aucun port de débogage n'est ouvert pendant la connexion. Edge
// refermé, Cyber Pinball le relance sans fenêtre (--headless) sur ce profil et lui demande ses cookies
// (Storage.getCookies) : Edge les déchiffre lui-même. Seuls ceux de YouTube et de Google sont pris ;
// yt-dlp les reçoit dans un fichier temporaire (--cookies), effacé après chaque appel.
//
// Ce module ne fait rien sur le réseau ni sur le disque (app/src/youtube-account.ts s'en charge) :
// chemins et arguments d'Edge, tri des cookies, état de connexion, fichier Netscape, playlists du compte.

import { t } from './i18n';

/** Page de connexion de Google, qui ramène sur les playlists du compte une fois connecté. */
export const YOUTUBE_LOGIN_URL =
  'https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26next%3D%252Ffeed%252Fplaylists';

/**
 * Page de connexion de Google (accounts.google.com) : Google refuse la connexion dans le navigateur
 * intégré, et la saisie y faisait planter la borne (PinCab, 10/11/2026). « Récupérer » n'y va plus
 * (acquire-window.ts) : il dit pourquoi et propose la connexion dans Edge (googleRefusesText).
 */
export function isGoogleSignIn(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === 'accounts.google.com';
  } catch {
    return false;
  }
}

/** Pourquoi la connexion à Google ne se fait pas dans « Récupérer », et la voie qui marche. */
export function googleRefusesText(): string {
  return t('Google refuse la connexion dans le navigateur intégré : connectez-vous dans Microsoft Edge (gestion du Juke-box > « Compte YouTube » > « Se connecter à YouTube »).');
}

/** Les playlists du compte, telles que yt-dlp les lit avec ses cookies. */
export const YOUTUBE_PLAYLISTS_FEED = 'https://www.youtube.com/feed/playlists';
/** Filtre « Playlists » de la recherche YouTube (vérifié le 10/11/2026 : seules des playlists). */
export const YOUTUBE_PLAYLIST_FILTER = 'EgIQAw%3D%3D';

/** Recherche de playlists sur YouTube ; sans texte, l'accueil de YouTube. */
export function youtubePlaylistSearchUrl(query: string): string {
  const q = query.trim();
  return q ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q).replace(/%20/g, '+')}&sp=${YOUTUBE_PLAYLIST_FILTER}` : 'https://www.youtube.com/';
}

// ---------------------------------------------------------------------------
// Microsoft Edge

/** Dossier du profil d'Edge réservé au Juke-box, dans le dossier des données. */
export const EDGE_PROFILE_DIR = 'edge-youtube';

/** Emplacements de msedge.exe, du plus courant au plus rare (installation système, puis par utilisateur). */
export function edgeExePaths(env: Record<string, string | undefined>): string[] {
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter((r): r is string => Boolean(r));
  return [...new Set(roots.map((r) => `${r.replace(/[\\/]+$/, '')}\\Microsoft\\Edge\\Application\\msedge.exe`))];
}

/** Réglages communs : pas d'accueil, pas de synchronisation, pas de connexion implicite au compte Microsoft de Windows. */
const QUIET = ['--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-features=msImplicitSignin,msEdgeSidebarV2,msShoppingExp,msUndersideButton', '--no-service-autorun'];

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Edge visible pour la connexion : fenêtre d'application (sans barre d'adresse ni onglets), posée
 * d'emblée sur l'écran voulu (pixels physiques du bureau). Aucun port de débogage.
 */
export function edgeLoginArgs(profile: string, at: ScreenRect, url = YOUTUBE_LOGIN_URL): string[] {
  return [
    `--user-data-dir=${profile}`,
    ...QUIET,
    `--window-position=${Math.round(at.x)},${Math.round(at.y)}`,
    `--window-size=${Math.max(1, Math.round(at.width))},${Math.max(1, Math.round(at.height))}`,
    `--app=${url}`,
  ];
}

/** Edge sans fenêtre, sur le même profil, pour relire ses cookies ; port choisi par Edge (DevToolsActivePort). */
export function edgeReadArgs(profile: string): string[] {
  return ['--headless=new', `--user-data-dir=${profile}`, ...QUIET, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', 'about:blank'];
}

/** Contenu de <profil>\DevToolsActivePort : le port, puis le chemin du point d'entrée du navigateur. */
export function parseDevToolsActivePort(text: string): { port: number; path: string } | undefined {
  const [port, path] = text.split(/\r?\n/);
  const n = Number(port);
  if (!Number.isInteger(n) || n <= 0 || n > 65535 || !path?.startsWith('/devtools/browser/')) return undefined;
  return { port: n, path: path.trim() };
}

export function edgeMissingText(): string {
  return t('Microsoft Edge est introuvable sur ce PC : il sert à se connecter à YouTube. Installez-le depuis microsoft.com/edge, puis réessayez.');
}

// ---------------------------------------------------------------------------
// Cookies

/** Un cookie tel qu'Edge le rend (Storage.getCookies). */
export interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  /** Secondes depuis 1970 ; -1 : cookie de session. */
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
}

/** Un cookie gardé pour yt-dlp (format Netscape). */
export interface CookieRecord {
  name: string;
  value: string;
  /** « .youtube.com » (sous-domaines compris) ou « www.youtube.com » (cet hôte seul). */
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  /** Fin de validité, en secondes depuis 1970 ; absent : cookie de session. */
  expirationDate?: number;
}

/** Domaine d'un cookie de YouTube (youtube.com et ses sous-domaines). */
export function isYoutubeDomain(domain: string | undefined): boolean {
  const d = (domain ?? '').replace(/^\./, '').toLowerCase();
  return d === 'youtube.com' || d.endsWith('.youtube.com');
}

/** Domaine d'un cookie de Google (google.com, accounts.google.com, google.fr, google.co.uk…), qui tient la connexion. */
export function isGoogleDomain(domain: string | undefined): boolean {
  const d = (domain ?? '').replace(/^\./, '').toLowerCase();
  return /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(d);
}

/** Les cookies du compte : ceux de YouTube et de Google. Ceux de Microsoft (msn.com, connexion de Windows) n'en sont pas. */
export const isYoutubeAccountDomain = (domain: string | undefined): boolean => isYoutubeDomain(domain) || isGoogleDomain(domain);

/** Les cookies d'Edge qui appartiennent au compte YouTube, au format gardé ; tous les autres sont laissés. */
export function accountCookies(all: readonly CdpCookie[]): CookieRecord[] {
  return all
    .filter((c) => isYoutubeAccountDomain(c.domain) && c.name && c.value)
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      ...(c.secure ? { secure: true } : {}),
      ...(c.httpOnly ? { httpOnly: true } : {}),
      ...(!c.session && c.expires && c.expires > 0 ? { expirationDate: Math.floor(c.expires) } : {}),
    }));
}

/**
 * Cookies de youtube.com qui disent « compte connecté » : un identifiant de session (SID, ou ses
 * variantes __Secure-) et la clé de l'API (SAPISID), dont yt-dlp a besoin pour lire les playlists
 * du compte. Un visiteur n'a que VISITOR_INFO1_LIVE, YSC, PREF.
 */
const SESSION = ['SID', '__Secure-1PSID', '__Secure-3PSID'];
const API_KEY = ['SAPISID', '__Secure-1PAPISID', '__Secure-3PAPISID'];

export interface AccountCookieState {
  connected: boolean;
  /** Échéance la plus proche des cookies de connexion (Google les garde environ deux ans). */
  expires?: Date;
}

/** Le compte est-il connecté d'après ces cookies ? */
export function youtubeCookieState(cookies: readonly CookieRecord[], now = new Date()): AccountCookieState {
  const live = cookies.filter((c) => isYoutubeDomain(c.domain) && c.value && (!c.expirationDate || c.expirationDate * 1000 > now.getTime()));
  const session = live.filter((c) => SESSION.includes(c.name));
  const key = live.filter((c) => API_KEY.includes(c.name));
  if (!session.length || !key.length) return { connected: false };
  const dated = [...session, ...key].filter((c) => c.expirationDate);
  return { connected: true, ...(dated.length ? { expires: new Date(Math.min(...dated.map((c) => c.expirationDate! * 1000))) } : {}) };
}

const HEADER = '# Netscape HTTP Cookie File';

/**
 * Le fichier de cookies que yt-dlp lit (--cookies), pour ces cookies seulement. Un cookie dont la
 * valeur contient une tabulation ou un saut de ligne (impossible à écrire) est laissé de côté.
 */
export function netscapeCookies(cookies: readonly CookieRecord[]): string {
  const lines = [HEADER, '# Written by Cyber Pinball for a single yt-dlp call, deleted afterwards.'];
  for (const c of cookies) {
    if (/[\t\r\n]/.test(c.name + c.value + c.domain + (c.path ?? ''))) continue;
    const sub = c.domain.startsWith('.');
    lines.push([`${c.httpOnly ? '#HttpOnly_' : ''}${c.domain}`, sub ? 'TRUE' : 'FALSE', c.path || '/', c.secure ? 'TRUE' : 'FALSE', String(Math.max(0, Math.floor(c.expirationDate ?? 0))), c.name, c.value].join('\t'));
  }
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Les playlists du compte

/** Une playlist du compte, telle que la liste la montre. */
export interface AccountPlaylist {
  list: string;
  title: string;
  /** Nombre de vidéos, s'il est donné. */
  count?: number;
  thumbnail?: string;
  /** J'aime, À regarder plus tard : personnelles, jamais publiques. */
  personal?: boolean;
}

/** Les deux playlists personnelles de tout compte, en tête de liste. */
export function personalPlaylists(): AccountPlaylist[] {
  return [
    { list: 'LL', title: t('Vidéos « J’aime »'), personal: true },
    { list: 'WL', title: t('À regarder plus tard'), personal: true },
  ];
}

/** Arguments de yt-dlp pour lire la liste des playlists du compte (à plat, rien de téléchargé). */
export function accountPlaylistsArgs(cookies: string, node?: string): string[] {
  return ['--ignore-config', '--no-update', '--no-colors', '--flat-playlist', '-J', ...(node ? ['--no-js-runtimes', '--js-runtimes', `node:${node}`] : []), '--cookies', cookies, '--', YOUTUBE_PLAYLISTS_FEED];
}

const listOf = (e: Record<string, unknown>): string | undefined => {
  for (const candidate of [e.url, e.webpage_url]) {
    if (typeof candidate !== 'string') continue;
    try {
      const list = new URL(candidate).searchParams.get('list');
      if (list) return list;
    } catch {
      // Adresse illisible : l'identifiant, plus bas.
    }
  }
  return typeof e.id === 'string' && /^[A-Za-z0-9_-]{2,64}$/.test(e.id) ? e.id : undefined;
};

/**
 * Les playlists du compte dans la réponse de yt-dlp (--flat-playlist -J sur feed/playlists), J'aime et
 * À regarder plus tard en tête (toujours proposées : yt-dlp les lit avec les cookies). Les doublons
 * (une playlist présente deux fois) n'apparaissent qu'une fois.
 */
export function parseAccountPlaylists(json: unknown): AccountPlaylist[] {
  const out = personalPlaylists();
  const seen = new Set(out.map((p) => p.list));
  const entries = json && typeof json === 'object' && Array.isArray((json as { entries?: unknown }).entries) ? ((json as { entries: unknown[] }).entries as unknown[]) : [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const list = listOf(e);
    if (!list || seen.has(list)) continue;
    seen.add(list);
    const thumbs = Array.isArray(e.thumbnails) ? (e.thumbnails as { url?: unknown }[]).map((x) => x?.url).filter((u): u is string => typeof u === 'string') : [];
    const count = [e.playlist_count, e.video_count, e.n_entries].find((n): n is number => typeof n === 'number' && Number.isFinite(n));
    out.push({
      list,
      title: typeof e.title === 'string' && e.title.trim() ? e.title.trim() : list,
      ...(count !== undefined ? { count } : {}),
      ...(thumbs.length ? { thumbnail: thumbs.at(-1)! } : {}),
      ...(list === 'LL' || list === 'WL' || list === 'LM' ? { personal: true } : {}),
    });
  }
  return out;
}
