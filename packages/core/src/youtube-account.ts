// Compte YouTube du Juke-box : comme les comptes des sites sources (sitesessions.ts), l'utilisateur se
// connecte une fois dans la fenêtre « Récupérer » (session du navigateur intégré), qui garde ses cookies
// d'un démarrage à l'autre. Cyber Pinball ne voit ni ne garde aucun mot de passe. Ce module ne fait
// rien sur le réseau ni sur le disque (app/src/youtube-account.ts s'en charge) :
// - l'état de connexion, d'après les cookies de la session ;
// - le fichier de cookies au format Netscape que yt-dlp lit (--cookies) pour les playlists privées et
//   personnelles du compte, écrit pour un appel puis effacé ; et sa relecture (cookies renouvelés par
//   YouTube pendant l'appel, ou repris d'un navigateur par --cookies-from-browser) ;
// - la liste des playlists du compte, lue par yt-dlp sur youtube.com/feed/playlists.

import * as path from 'node:path';
import { t } from './i18n';
import type { SiteCookie, SiteState } from './sitesessions';

/** Connexion à YouTube : la page de connexion de Google, qui ramène sur les playlists du compte. */
export const YOUTUBE_LOGIN_URL =
  'https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26next%3D%252Ffeed%252Fplaylists';
/**
 * Page de connexion de Google (accounts.google.com) : Google refuse la connexion dans le navigateur
 * intégré, et la saisie y faisait planter la borne (PinCab, 10/11/2026). « Récupérer » n'y va plus
 * (acquire-window.ts) : il dit pourquoi et renvoie vers Firefox (googleRefusesText).
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
  return t('Google refuse la connexion dans le navigateur intégré d’une borne : passez par Firefox (gestion du Juke-box > « Compte YouTube » > « Utiliser la connexion de Firefox »). Une liaison par code est prévue.');
}

/** Les playlists du compte, telles que yt-dlp les lit avec ses cookies. */
export const YOUTUBE_PLAYLISTS_FEED = 'https://www.youtube.com/feed/playlists';
/** Page du compte : son nom s'y lit (au mieux). */
export const YOUTUBE_ACCOUNT_PAGE = 'https://www.youtube.com/account';
/** Filtre « Playlists » de la recherche YouTube (vérifié le 10/11/2026 : seules des playlists). */
export const YOUTUBE_PLAYLIST_FILTER = 'EgIQAw%3D%3D';

/** Recherche de playlists sur YouTube ; sans texte, l'accueil de YouTube. */
export function youtubePlaylistSearchUrl(query: string): string {
  const q = query.trim();
  return q ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q).replace(/%20/g, '+')}&sp=${YOUTUBE_PLAYLIST_FILTER}` : 'https://www.youtube.com/';
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

/** Les cookies du compte : ceux de YouTube et de Google. Les autres sites n'en font pas partie. */
export const isYoutubeAccountDomain = (domain: string | undefined): boolean => isYoutubeDomain(domain) || isGoogleDomain(domain);

/**
 * Cookies de youtube.com qui disent « compte connecté » : un identifiant de session (SID, ou ses
 * variantes __Secure-) et la clé de l'API (SAPISID), dont yt-dlp a besoin pour lire les playlists
 * du compte. Un visiteur n'a que VISITOR_INFO1_LIVE, YSC, PREF.
 */
const SESSION = ['SID', '__Secure-1PSID', '__Secure-3PSID'];
const API_KEY = ['SAPISID', '__Secure-1PAPISID', '__Secure-3PAPISID'];

/** État de connexion du compte YouTube d'après les cookies de youtube.com. */
export function youtubeState(cookies: readonly SiteCookie[], now = new Date()): SiteState {
  const live = cookies.filter((c) => isYoutubeDomain(c.domain ?? 'youtube.com') && c.value && (!c.expirationDate || c.expirationDate * 1000 > now.getTime()));
  const session = live.filter((c) => SESSION.includes(c.name));
  const key = live.filter((c) => API_KEY.includes(c.name));
  if (!session.length || !key.length) return { connected: false, remembered: false };
  const kept = [...session, ...key].filter((c) => c.expirationDate);
  // Google garde la connexion environ deux ans ; la plus proche échéance compte.
  const expires = kept.length === session.length + key.length ? new Date(Math.min(...kept.map((c) => c.expirationDate! * 1000))) : undefined;
  return { connected: true, remembered: Boolean(expires), ...(expires ? { expires } : {}) };
}

// ---------------------------------------------------------------------------
// Fichier de cookies (format Netscape, celui de yt-dlp --cookies)

/** Un cookie tel qu'Electron le donne (cookies.get) ou que le fichier le décrit. */
export interface CookieRecord {
  name: string;
  value: string;
  /** « .youtube.com » (sous-domaines compris) ou « www.youtube.com » (cet hôte seul). */
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  /** Cet hôte seul (Electron) ; sans lui, un domaine qui commence par un point vaut pour les sous-domaines. */
  hostOnly?: boolean;
  /** Fin de validité, en secondes depuis 1970 ; absent ou 0 : cookie de session. */
  expirationDate?: number;
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
    const bare = c.domain.replace(/^\./, '');
    const sub = c.hostOnly === undefined ? c.domain.startsWith('.') : !c.hostOnly;
    const domain = sub ? `.${bare}` : bare;
    lines.push([`${c.httpOnly ? '#HttpOnly_' : ''}${domain}`, sub ? 'TRUE' : 'FALSE', c.path || '/', c.secure ? 'TRUE' : 'FALSE', String(Math.max(0, Math.floor(c.expirationDate ?? 0))), c.name, c.value].join('\t'));
  }
  return `${lines.join('\n')}\n`;
}

/** Relit un fichier de cookies Netscape (celui que yt-dlp a réécrit, ou repris d'un navigateur). */
export function parseNetscapeCookies(text: string): CookieRecord[] {
  const out: CookieRecord[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    let line = raw;
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) {
      httpOnly = true;
      line = line.slice('#HttpOnly_'.length);
    } else if (!line.trim() || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length < 7) continue;
    const [domain, sub, path, secure, expires, name, ...value] = f;
    if (!domain || !name) continue;
    const exp = Number(expires);
    out.push({
      name,
      value: value.join('\t'),
      domain: sub === 'TRUE' && !domain.startsWith('.') ? `.${domain}` : domain,
      path: path || '/',
      secure: secure === 'TRUE',
      httpOnly,
      hostOnly: sub !== 'TRUE',
      ...(Number.isFinite(exp) && exp > 0 ? { expirationDate: exp } : {}),
    });
  }
  return out;
}

/**
 * Cookies du compte changés pendant un appel de yt-dlp (YouTube renouvelle certains d'entre eux) :
 * ceux à reporter dans la session, pour qu'elle reste valable. Ceux d'autres domaines sont ignorés.
 */
export function changedCookies(before: readonly CookieRecord[], after: readonly CookieRecord[]): CookieRecord[] {
  const key = (c: CookieRecord) => `${c.domain.replace(/^\./, '').toLowerCase()}|${c.path || '/'}|${c.name}`;
  const was = new Map(before.map((c) => [key(c), c.value]));
  return after.filter((c) => isYoutubeAccountDomain(c.domain) && c.value && was.has(key(c)) && was.get(key(c)) !== c.value);
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
  return [
    '--ignore-config',
    '--no-update',
    '--no-colors',
    '--flat-playlist',
    '-J',
    ...(node ? ['--no-js-runtimes', '--js-runtimes', `node:${node}`] : []),
    '--cookies',
    cookies,
    '--',
    YOUTUBE_PLAYLISTS_FEED,
  ];
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

/** Raison d'un échec de yt-dlp sur les cookies d'un navigateur (--cookies-from-browser), en clair. */
export function browserCookiesError(line: string | undefined, browser: string): string {
  const l = line ?? '';
  if (/could not copy .*cookie database|database is locked|permission denied/i.test(l)) return t('{browser} garde ses cookies tant qu’il est ouvert : fermez-le complètement, puis réessayez', { browser });
  if (ENCRYPTED.test(l)) return encryptedCookies(browser);
  if (/could not find|not installed|no such file|unsupported browser/i.test(l)) return t('{browser} n’est pas installé sur ce PC, ou n’a pas encore de profil', { browser });
  if (!l) return t('{browser} n’a rien donné', { browser });
  return l.replace(/^ERROR:\s*/, '').slice(0, 200);
}

/** Cookies chiffrés que yt-dlp ne sait pas lire : Chrome depuis la version 127 (chiffrement lié à l'application, « v20 »), Edge et Brave ensuite. */
const ENCRYPTED = /dpapi|app.?bound|\bv20\b|failed to decrypt|could not be decrypted|cannot decrypt/i;

function encryptedCookies(browser: string): string {
  return t('{browser} chiffre ses cookies (Chrome 127 et suivants, Edge, Brave) : yt-dlp ne peut pas les lire. Prenez Firefox : connectez-vous à YouTube dans Firefox, fermez-le, puis choisissez Firefox ici. Ou connectez-vous dans « Récupérer ».', { browser });
}

/**
 * Pourquoi la connexion d'un navigateur n'a pas été reprise, d'après tout ce que yt-dlp a écrit
 * (erreurs, avertissements, « Extracted N cookies from chrome (M could not be decrypted) ») :
 * jusqu'au 10/11/2026, seule la première ligne ERROR comptait, et un Chrome dont aucun cookie ne
 * se déchiffrait disait « pas de connexion à YouTube dans Chrome », ce qui était faux. `taken` :
 * nombre de cookies de YouTube et de Google repris.
 */
export function browserCookiesProblem(lines: readonly string[], browser: string, taken: number): string {
  const all = lines.join('\n');
  if (/could not copy .*cookie database|database is locked|permission ?denied|PermissionError/i.test(all)) return t('{browser} garde ses cookies tant qu’il est ouvert : fermez-le complètement, puis réessayez', { browser });
  if (ENCRYPTED.test(all)) return encryptedCookies(browser);
  if (/could not find .*(cookies? database|profile)|not installed|unsupported browser|no such file/i.test(all)) return t('{browser} n’est pas installé sur ce PC, ou n’a pas encore de profil', { browser });
  if (taken || /extracted \d+ cookies/i.test(all)) return t('Pas de connexion à YouTube dans {browser} : connectez-vous à YouTube dans {browser}, fermez-le, puis réessayez', { browser });
  const error = lines.find((l) => /^ERROR:/.test(l));
  return error ? browserCookiesError(error, browser) : t('{browser} n’a rien donné', { browser });
}

/**
 * Navigateur dont la connexion est reprise (yt-dlp --cookies-from-browser) : Firefox seul. Chrome
 * (depuis la version 127), Edge et Brave chiffrent leurs cookies d'une façon que yt-dlp ne lit pas,
 * ou les verrouillent tant qu'ils tournent en arrière-plan : les proposer ne servait à rien (PinCab,
 * 10/11/2026, avec Edge). Leurs sorties d'erreur restent reconnues (browserCookiesProblem).
 */
export const COOKIE_BROWSERS = [{ id: 'firefox', label: 'Firefox' }] as const;
export type CookieBrowser = (typeof COOKIE_BROWSERS)[number]['id'];

/** Profils de Firefox sous Windows (%APPDATA%) : sans ce fichier, Firefox n'est pas installé, ou n'a jamais servi. */
export function firefoxProfilesIni(appData: string): string {
  return path.win32.join(appData, 'Mozilla', 'Firefox', 'profiles.ini');
}

/** Installateur officiel de Firefox (Mozilla), en HTTPS : la dernière version, 64 bits, en français. */
export const FIREFOX_DOWNLOAD_URL = 'https://download.mozilla.org/?product=firefox-latest-ssl&os=win64&lang=fr';

/** Emplacements de firefox.exe : installation pour tous (Program Files) ou pour ce compte. */
export function firefoxExePaths(env: Record<string, string | undefined>): string[] {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.LOCALAPPDATA].filter((r): r is string => Boolean(r));
  return [...new Set(roots.map((r) => path.win32.join(r, 'Mozilla Firefox', 'firefox.exe')))];
}

/**
 * Signature Authenticode lue par Windows (« Valid|CN=Mozilla Corporation, O=Mozilla Corporation, … ») :
 * valide, et l'éditeur est Mozilla Corporation. Tout le reste (non signé, signature cassée, autre
 * éditeur) est refusé : l'installateur n'est pas lancé.
 */
export function mozillaSigned(line: string): boolean {
  const [status, subject = ''] = line.split('|');
  return status?.trim() === 'Valid' && /(^|,\s*)O=Mozilla Corporation(,|$)/.test(subject.trim());
}

/** Firefox installé mais jamais ouvert (pas encore de profil) : ce qu'il faut faire. */
export function firefoxUnused(): string {
  return t('Firefox est installé mais n’a encore jamais servi : ouvrez Firefox, connectez-vous à YouTube, fermez Firefox, puis revenez ici.');
}

/** Firefox absent : ce qu'il faut faire. */
export function firefoxMissing(): string {
  return t('Firefox n’est pas installé sur ce PC, ou n’a jamais servi : installez Firefox, connectez-vous à YouTube dans Firefox, fermez-le, puis revenez ici.');
}

/** Arguments de yt-dlp pour reprendre les cookies d'un navigateur dans un fichier (`out`), en lisant la liste du compte au passage. */
export function browserCookiesArgs(browser: CookieBrowser, out: string, node?: string): string[] {
  return [
    '--ignore-config',
    '--no-update',
    '--no-colors',
    '--flat-playlist',
    '-J',
    ...(node ? ['--no-js-runtimes', '--js-runtimes', `node:${node}`] : []),
    '--cookies-from-browser',
    browser,
    '--cookies',
    out,
    '--',
    YOUTUBE_PLAYLISTS_FEED,
  ];
}

/**
 * Le nom du compte, lu au mieux dans la page du compte YouTube (script de page) : le nom affiché, ou
 * l'identifiant @ de la chaîne. Rien si la page ne le dit pas : l'état dit alors « connecté » seul.
 */
export const ACCOUNT_NAME_PROBE = /* i18n-ignore : script de la page du site, motifs de recherche */ String.raw`(() => {
  const html = document.documentElement ? document.documentElement.innerHTML.slice(0, 3000000) : '';
  const pick = (re) => { const m = re.exec(html); return m ? m[1] : undefined; };
  const unescape = (s) => { try { return JSON.parse('"' + s + '"'); } catch (e) { return s; } };
  const name = pick(/"accountName":\{"simpleText":"((?:[^"\\]|\\.){1,80})"/) || pick(/"channelHandle":\{"simpleText":"(@(?:[^"\\]|\\.){1,80})"/);
  return name ? unescape(name) : null;
})()`;
