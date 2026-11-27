// Rubrique Applications (26/11/2026) : des sites ouverts en plein écran sur la borne (Netflix, Prime
// Video, Disney+, YouTube, Twitch, Spotify, et toute adresse ajoutée par le joueur), dans un vrai
// Microsoft Edge : Electron n'a pas les modules de déchiffrement des services protégés (Widevine,
// PlayReady), et Netflix ne passe la 4K que dans Edge. Edge a son profil à lui (<données>\edge-apps),
// distinct de celui du compte YouTube du Juke-box.
//
// Ce module ne fait rien sur le réseau ni sur l'écran (app/src/applications*.ts s'en chargent) : la
// liste écrite (applications.json), le catalogue des suggestions, les adresses, la lecture des icônes
// d'une page (manifeste, icône Apple, favicon), la tuile composée quand un site n'en a pas de grande, et
// les arguments d'Edge. Aucun logo n'est livré : chaque icône vient du site lui-même.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { t } from './i18n';
import { readJsonFile } from './store';
import { EDGE_QUIET_ARGS, type ScreenRect } from './youtube-account';
import { fingerprintOf } from './fingerprint';
import { currentFlipperEdge, FLIPPER_EDGES } from './layout';
import type { Cabinet, FlipperEdge, ObservedDisplay, Rotation } from './model';
import type { OrientationReport, SessionOrientation } from './sessionorientation';

/** Liste des applications, dans le dossier des données. */
export const APPLICATIONS_FILE = 'applications.json';
/** Icônes relevées sur les sites, une par application (<id>.<ext>), dans le dossier des données. */
export const APPLICATIONS_ICON_DIR = 'applications-icones';
/** Profil d'Edge des applications : ses connexions (Netflix, Prime…) y restent d'une ouverture à l'autre. */
export const EDGE_APPS_PROFILE_DIR = 'edge-apps';

/** Où s'ouvre une application : en plein écran sur le fronton ou sur le playfield (dans l'orientation de Windows). */
export type AppScreen = 'backglass' | 'playfield';
export const APP_SCREENS: readonly AppScreen[] = ['backglass', 'playfield'];

export interface AppEntry {
  /** Identité stable (celle du catalogue, ou tirée de l'adresse). */
  id: string;
  name: string;
  url: string;
  screen: AppScreen;
  /**
   * Affichage mobile : le navigateur se présente comme un téléphone (en-tête User-Agent mobile) et le site
   * rend sa version mobile, souvent la mieux adaptée à un écran de borne (TikTok, YouTube…). Absent : oui
   * sur le playfield (écran vertical), non sur le fronton (écran large) ; le choix fait à la main s'écrit,
   * dans un sens comme dans l'autre (appMobile).
   */
  mobile?: boolean;
  /** Zoom de la page, en pourcents (APP_ZOOM_MIN à APP_ZOOM_MAX) ; absent : 200 sur le playfield, 100 sur le fronton (appZoom). */
  zoom?: number;
  /** Teinte de la tuile composée (#rrggbb), et du halo de l'icône. */
  color: string;
  /** Fichier de l'icône relevée sur le site, dans APPLICATIONS_ICON_DIR ; absent : tuile composée. */
  icon?: string;
  /** Dernière recherche de l'icône sur le site (ISO) : sans elle, un site muet serait relu à chaque démarrage (appIconDue). */
  iconChecked?: string;
  added: string;
  /** Dernière ouverture : les dernières ouvertes passent en tête de la grille. */
  opened?: string;
}

export interface AppsStore {
  apps: AppEntry[];
}

// ---------------------------------------------------------------------------
// Catalogue

export interface CatalogApp {
  id: string;
  name: string;
  /** Adresse du site ; pour une application de la maison, un exemple à compléter (`needsAddress`). */
  url: string;
  color: string;
  /** Ce que dit la suggestion sous son nom (« Abonnement », « Gratuit »…). */
  readonly detail: string;
  /** Logiciel installé chez soi (Jellyfin, Home Assistant…) : son adresse sur le réseau local se saisit. */
  needsAddress?: boolean;
  /** Écran conseillé ; d'office le fronton. */
  screen?: AppScreen;
}

export interface CatalogTheme {
  id: string;
  readonly title: string;
  apps: CatalogApp[];
}

const subscription = () => t('Abonnement');
const free = () => t('Gratuit');
const music = () => t('Musique');
const toComplete = () => t('Adresse à compléter');

function app(id: string, name: string, url: string, color: string, detail: () => string, extra: Partial<CatalogApp> = {}): CatalogApp {
  return {
    id,
    name,
    url,
    color,
    get detail() {
      return detail();
    },
    ...extra,
  };
}

/** Les six installées d'office (décidé le 26/11/2026), dans l'ordre de la grille. */
export const DEFAULT_APPS: readonly CatalogApp[] = [
  app('netflix', 'Netflix', 'https://www.netflix.com/browse', '#e50914', subscription),
  app('prime-video', 'Prime Video', 'https://www.primevideo.com/', '#1a98ff', subscription),
  app('disney-plus', 'Disney+', 'https://www.disneyplus.com/', '#3b7bea', subscription),
  app('youtube', 'YouTube', 'https://www.youtube.com/', '#ff3b30', free),
  app('twitch', 'Twitch', 'https://www.twitch.tv/', '#9146ff', free),
  app('spotify', 'Spotify', 'https://open.spotify.com/', '#1ed760', music),
];

/** Suggestions de l'écran d'ajout, par thème. */
export const APP_CATALOG: readonly CatalogTheme[] = [
  {
    id: 'video',
    get title() {
      return t('Vidéo');
    },
    apps: [
      app('apple-tv', 'Apple TV+', 'https://tv.apple.com/', '#9aa3ad', subscription),
      app('max', 'Max', 'https://play.max.com/', '#2f5bff', subscription),
      app('paramount-plus', 'Paramount+', 'https://www.paramountplus.com/', '#1e6bff', subscription),
      app('crunchyroll', 'Crunchyroll', 'https://www.crunchyroll.com/', '#f47521', () => t('Animation')),
      app('pluto-tv', 'Pluto TV', 'https://pluto.tv/', '#fff200', () => t('Chaînes gratuites')),
    ],
  },
  {
    id: 'france',
    get title() {
      return t('En France');
    },
    apps: [
      app('canal-plus', 'Canal+', 'https://www.canalplus.com/', '#e7e7e7', subscription),
      app('france-tv', 'france.tv', 'https://www.france.tv/', '#2a6df4', free),
      app('arte', 'Arte', 'https://www.arte.tv/', '#fa481c', free),
      app('tf1-plus', 'TF1+', 'https://www.tf1.fr/', '#2f6bff', free),
      app('m6-plus', 'M6+', 'https://www.m6.fr/', '#f5a400', free),
    ],
  },
  {
    id: 'music',
    get title() {
      return t('Musique et radio');
    },
    apps: [
      app('qobuz', 'Qobuz', 'https://play.qobuz.com/', '#3c8dff', music),
      app('deezer', 'Deezer', 'https://www.deezer.com/', '#a238ff', music),
      app('youtube-music', 'YouTube Music', 'https://music.youtube.com/', '#ff3b30', music),
      app('soundcloud', 'SoundCloud', 'https://soundcloud.com/', '#ff7700', music),
      app('radio-france', 'Radio France', 'https://www.radiofrance.fr/', '#e6007e', () => t('Radio en direct')),
    ],
  },
  {
    id: 'home',
    get title() {
      return t('À la maison');
    },
    apps: [
      app('plex', 'Plex', 'https://app.plex.tv/', '#e5a00d', () => t('Films et séries de ton serveur')),
      app('jellyfin', 'Jellyfin', 'http://192.168.1.10:8096/', '#aa5cc3', toComplete, { needsAddress: true }),
      app('home-assistant', 'Home Assistant', 'http://192.168.1.10:8123/', '#18bcf2', toComplete, { needsAddress: true, screen: 'playfield' }),
      app('frigate', 'Frigate', 'http://192.168.1.10:5000/', '#4fa3e0', () => t('Caméras'), { needsAddress: true }),
      app('kodi', 'Kodi', 'http://192.168.1.10:8080/', '#17b2e7', toComplete, { needsAddress: true }),
    ],
  },
];

/** Une suggestion du catalogue (ou une des six d'office), par son identité. */
export function catalogApp(id: string): CatalogApp | undefined {
  return [...DEFAULT_APPS, ...APP_CATALOG.flatMap((theme) => theme.apps)].find((a) => a.id === id);
}

// ---------------------------------------------------------------------------
// Adresses

/**
 * Adresse saisie, rendue utilisable : https:// ajouté quand il manque (http:// pour une adresse du
 * réseau local), espaces retirés. undefined : ce n'est pas une adresse de site (http ou https seulement).
 */
export function normalizeAppUrl(input: string): string | undefined {
  const raw = input.trim().replace(/\s+/g, '');
  if (!raw) return undefined;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  if (!hasScheme && /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[^:/]+:\d+/.test(raw)) return undefined;
  let candidate = hasScheme ? raw : `https://${raw}`;
  try {
    let url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (!url.hostname || (!url.hostname.includes('.') && url.hostname !== 'localhost' && !url.hostname.startsWith('['))) return undefined;
    if (!hasScheme && isLocalHost(url.hostname)) {
      candidate = `http://${raw}`;
      url = new URL(candidate);
    }
    return url.href;
  } catch {
    return undefined;
  }
}

/** Machine du réseau local : localhost, adresse privée (10, 172.16-31, 192.168, 169.254), nom en .local ou .lan. */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return h.startsWith('fd') || h.startsWith('fe80:');
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** L'application vit sur le réseau local (Home Assistant, Jellyfin…) : elle s'ouvre sans Internet. */
export function isLocalApp(entry: Pick<AppEntry, 'url'>): boolean {
  try {
    return isLocalHost(new URL(entry.url).hostname);
  } catch {
    return false;
  }
}

/** Ce que la fiche montre de l'adresse : l'hôte sans www, et le port d'une adresse locale. */
export function appSite(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return url;
  }
}

/** Identité d'une application ajoutée par adresse : l'hôte et le port, en lettres et tirets. */
export function appIdFor(url: string): string {
  return (
    appSite(url)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'application'
  );
}

/** Même site (hôte, port et chemin, sans www ni barre finale) : un doublon que l'ajout refuse. */
export function sameSite(a: string, b: string): boolean {
  const key = (url: string) => {
    try {
      const u = new URL(url);
      return `${u.hostname.replace(/^www\./, '')}:${u.port}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  };
  return key(a) === key(b);
}

// ---------------------------------------------------------------------------
// Tuile composée

/** Initiales de la tuile composée : la première lettre de deux mots, sinon les deux premières du nom (« YouTube » → « YT »). */
export function appInitials(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}+ ]/gu, ' ').trim();
  if (!clean) return '?';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const word = words[0]!;
  const capitals = word.match(/\p{Lu}/gu);
  if (capitals && capitals.length >= 2) return capitals.slice(0, 2).join('');
  return word.length <= 2 ? word : word[0]!.toUpperCase();
}

/** Teintes de la tuile composée, tirées du nom quand aucune n'est connue. */
const TILE_COLORS = ['#18bcf2', '#8be23a', '#f2b33d', '#e5487a', '#9146ff', '#ff7a1a', '#2fd3b0', '#5f8cff'];

export function appColorFor(seed: string): string {
  let h = 0;
  for (const ch of seed.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length]!;
}

/** Couleur #rrggbb lue sur un site (theme-color), ou undefined. */
export function cleanColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : undefined;
}

// ---------------------------------------------------------------------------
// Icônes d'une page

/** Une icône annoncée par la page, de la meilleure à la moins bonne. */
export interface IconCandidate {
  url: string;
  /** og : l'image de partage (og:image), souvent une bannière ; en dernier recours. */
  kind: 'manifest' | 'apple' | 'icon' | 'favicon' | 'og';
  /** Côté en pixels annoncé (0 : inconnu). */
  size: number;
}

export interface PageFacts {
  /** Nom du site (application-name, og:site_name, puis le titre). */
  name?: string;
  color?: string;
  manifest?: string;
  icons: IconCandidate[];
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : undefined;
};

const decode = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

const absolute = (href: string | undefined, base: string): string | undefined => {
  if (!href) return undefined;
  try {
    const u = new URL(decode(href), base);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'data:' ? u.href : undefined;
  } catch {
    return undefined;
  }
};

/** Plus grand côté annoncé par un attribut sizes (« 192x192 512x512 », « any » : 1024). */
export function largestSize(sizes: string | undefined): number {
  if (!sizes) return 0;
  if (/\bany\b/i.test(sizes)) return 1024;
  return Math.max(0, ...[...sizes.matchAll(/(\d+)\s*x\s*(\d+)/gi)].map((m) => Math.min(Number(m[1]), Number(m[2]))));
}

/** Ce que la page dit d'elle (lu dans son <head>) : nom, couleur, manifeste et icônes. */
export function readPageFacts(html: string, pageUrl: string): PageFacts {
  const head = html.slice(0, 400_000);
  const facts: PageFacts = { icons: [] };
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key: string) => {
    for (const tag of metas) {
      const k = (attr(tag, 'name') ?? attr(tag, 'property') ?? '').toLowerCase();
      if (k === key) return decode(attr(tag, 'content') ?? '').trim() || undefined;
    }
    return undefined;
  };
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1];
  facts.name = meta('application-name') ?? meta('og:site_name') ?? meta('apple-mobile-web-app-title') ?? (title ? decode(title).trim().split(/\s+[|·–—-]\s+/)[0] : undefined);
  if (facts.name && facts.name.length > 40) facts.name = facts.name.slice(0, 40).trim();
  facts.color = cleanColor(meta('theme-color'));
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const href = absolute(attr(tag, 'href'), pageUrl);
    if (!href) continue;
    if (rel.includes('manifest')) facts.manifest ??= href;
    else if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) facts.icons.push({ url: href, kind: 'apple', size: largestSize(attr(tag, 'sizes')) || 180 });
    else if (rel.includes('icon')) facts.icons.push({ url: href, kind: 'icon', size: largestSize(attr(tag, 'sizes')) || (/\.svg(\?|$)/i.test(href) ? 512 : 0) });
  }
  facts.icons.push({ url: new URL('/favicon.ico', pageUrl).href, kind: 'favicon', size: 0 });
  // Image de partage : la seule grande image de bien des sites (un groupe, une page sans manifeste).
  const og = absolute(meta('og:image:secure_url') ?? meta('og:image') ?? meta('og:image:url'), pageUrl);
  if (og) {
    const w = Number(meta('og:image:width')) || 0;
    const h = Number(meta('og:image:height')) || 0;
    facts.icons.push({ url: og, kind: 'og', size: w && h ? Math.min(w, h) : 0 });
  }
  return facts;
}

/** Icônes du manifeste (les « maskable » en dernier : leur dessin est rogné), et ce qu'il dit du nom et de la couleur. */
export function readManifest(json: unknown, manifestUrl: string): { name?: string; color?: string; icons: IconCandidate[] } {
  if (!json || typeof json !== 'object') return { icons: [] };
  const m = json as { name?: unknown; short_name?: unknown; theme_color?: unknown; background_color?: unknown; icons?: unknown };
  const icons: (IconCandidate & { maskable: boolean })[] = [];
  for (const raw of Array.isArray(m.icons) ? m.icons : []) {
    if (!raw || typeof raw !== 'object') continue;
    const i = raw as { src?: unknown; sizes?: unknown; purpose?: unknown };
    const url = typeof i.src === 'string' ? absolute(i.src, manifestUrl) : undefined;
    if (!url) continue;
    const purpose = typeof i.purpose === 'string' ? i.purpose.toLowerCase().split(/\s+/) : ['any'];
    icons.push({ url, kind: 'manifest', size: largestSize(typeof i.sizes === 'string' ? i.sizes : undefined), maskable: !purpose.includes('any') && purpose.includes('maskable') });
  }
  icons.sort((a, b) => Number(a.maskable) - Number(b.maskable) || b.size - a.size);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    name: str(m.short_name) ?? str(m.name),
    color: cleanColor(m.theme_color) ?? cleanColor(m.background_color),
    icons: icons.map(({ maskable: _m, ...c }) => c),
  };
}

/**
 * Côté d'une icône qui remplit sa tuile (tuile de 150 px). En dessous, c'est le favicon d'un site qui
 * n'a rien de plus grand (Netflix 64 px, Twitch 32 px) : il est gardé quand même, et la grille le pose
 * en pastille sur la tuile composée plutôt que de l'agrandir flou (applications.js, ap-mini).
 */
export const APP_ICON_MIN = 96;
/** Le plus petit favicon gardé ; en dessous, les initiales. */
export const APP_ICON_SMALLEST = 16;
/** Une icône trouvée mais petite (Netflix, Twitch) est cherchée de nouveau au plus une fois par semaine ; un site sans icône, une fois par jour. */
export const APP_ICON_RECHECK_SMALL_MS = 7 * 24 * 3600 * 1000;
export const APP_ICON_RECHECK_NONE_MS = 24 * 3600 * 1000;

/**
 * Faut-il (re)chercher l'icône de cette application sur son site ? Jamais quand l'icône remplit la
 * tuile, et jamais plus d'une fois par délai (sinon, un site qui n'a pas mieux serait relu, page,
 * manifeste et sept images, à chaque démarrage de la borne).
 */
export function appIconDue(app: Pick<AppEntry, 'icon' | 'iconChecked'>, side: number | undefined, nowMs: number): boolean {
  if (app.icon && (side ?? APP_ICON_MIN) >= APP_ICON_MIN) return false;
  const checked = app.iconChecked ? Date.parse(app.iconChecked) : NaN;
  if (!Number.isFinite(checked)) return true;
  return nowMs - checked >= (app.icon ? APP_ICON_RECHECK_SMALL_MS : APP_ICON_RECHECK_NONE_MS);
}

/**
 * Ordre d'essai : manifeste, icône Apple, icônes de la page, favicon ; dans chaque famille, la plus
 * grande d'abord. Une icône annoncée trop petite passe après les autres. L'image de partage (og:image)
 * vient toujours en dernier : une bannière rognée ne vaut pas une vraie icône. Les SVG et les images
 * inscrites dans la page (data:) ne sont pas essayés : la grille ne les garde pas (siteicon.ts).
 */
export function rankIcons(candidates: readonly IconCandidate[]): IconCandidate[] {
  const order: Record<IconCandidate['kind'], number> = { manifest: 0, apple: 1, icon: 2, favicon: 3, og: 4 };
  const seen = new Set<string>();
  return candidates
    .filter((c) => !c.url.startsWith('data:') && !/\.svgz?(\?|#|$)/i.test(c.url))
    .filter((c) => !seen.has(c.url) && !!seen.add(c.url))
    .sort((a, b) => {
      const og = (c: IconCandidate) => (c.kind === 'og' ? 1 : 0);
      const small = (c: IconCandidate) => (c.size > 0 && c.size < APP_ICON_MIN ? 1 : 0);
      return og(a) - og(b) || small(a) - small(b) || order[a.kind] - order[b.kind] || b.size - a.size;
    });
}

// ---------------------------------------------------------------------------
// Liste écrite

export function applicationsFile(dataDir: string): string {
  return path.join(dataDir, APPLICATIONS_FILE);
}

export function applicationsIconDir(dataDir: string): string {
  return path.join(dataDir, APPLICATIONS_ICON_DIR);
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function fromCatalog(entry: CatalogApp, at: string): AppEntry {
  return { id: entry.id, name: entry.name, url: entry.url, screen: entry.screen ?? 'backglass', color: entry.color, added: at };
}

/** La liste de départ : les six installées d'office. */
export function defaultApplications(at = new Date().toISOString()): AppsStore {
  return { apps: DEFAULT_APPS.map((a) => fromCatalog(a, at)) };
}

function cleanApp(v: unknown): AppEntry | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Partial<AppEntry>;
  const url = typeof r.url === 'string' ? normalizeAppUrl(r.url) : undefined;
  const id = str(r.id);
  const name = str(r.name);
  if (!url || !id || !name || !/^[a-z0-9-]+$/.test(id)) return undefined;
  const icon = str(r.icon);
  return {
    id,
    name: name.slice(0, 40),
    url,
    screen: APP_SCREENS.includes(r.screen as AppScreen) ? (r.screen as AppScreen) : 'backglass',
    ...(typeof r.mobile === 'boolean' ? { mobile: r.mobile } : {}),
    ...(typeof r.zoom === 'number' && Number.isFinite(r.zoom) ? { zoom: clampAppZoom(r.zoom) } : {}),
    color: cleanColor(r.color) ?? appColorFor(name),
    // Un nom de fichier seul : jamais un chemin qui sortirait du dossier des icônes.
    ...(icon && /^[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(icon) ? { icon } : {}),
    ...(Number.isFinite(Date.parse(str(r.iconChecked) ?? '')) ? { iconChecked: str(r.iconChecked) } : {}),
    added: str(r.added) ?? new Date(0).toISOString(),
    ...(str(r.opened) ? { opened: str(r.opened) } : {}),
  };
}

/** La liste écrite ; les six d'office si elle n'existe pas encore. Une entrée illisible est oubliée, jamais une erreur. */
export function loadApplications(dataDir: string): AppsStore {
  const file = applicationsFile(dataDir);
  try {
    if (!fs.existsSync(file)) return defaultApplications();
    const raw = readJsonFile(file) as Partial<AppsStore>;
    const ids = new Set<string>();
    return { apps: (Array.isArray(raw.apps) ? raw.apps : []).map(cleanApp).filter((a): a is AppEntry => !!a && !ids.has(a.id) && !!ids.add(a.id)) };
  } catch {
    return defaultApplications();
  }
}

/** Écrit la liste d'un coup (fichier temporaire puis renommé) : une coupure de courant ne la tronque pas. */
export function saveApplications(dataDir: string, store: AppsStore): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(applicationsFile(dataDir), `${JSON.stringify(store, null, 2)}\n`);
}

/** Ordre de la grille : les dernières ouvertes d'abord, puis les jamais ouvertes dans l'ordre de leur ajout. */
export function appsInOrder(store: AppsStore): AppEntry[] {
  const rank = new Map(store.apps.map((a, i) => [a.id, i]));
  return [...store.apps].sort((a, b) => {
    if (a.opened && b.opened) return b.opened.localeCompare(a.opened);
    if (a.opened || b.opened) return a.opened ? -1 : 1;
    return rank.get(a.id)! - rank.get(b.id)!;
  });
}

export type AddResult = { ok: true; store: AppsStore; app: AppEntry } | { ok: false; reason: string; existing?: AppEntry };

/** Ajoute une application (à la fin de la grille) ; refuse une adresse invalide ou un site déjà là. */
export function addApplication(store: AppsStore, input: { id?: string; name: string; url: string; screen?: AppScreen; color?: string; icon?: string }, at = new Date().toISOString()): AddResult {
  const url = normalizeAppUrl(input.url);
  if (!url) return { ok: false, reason: t('Cette adresse n’est pas celle d’un site (http ou https).') };
  const existing = store.apps.find((a) => sameSite(a.url, url));
  if (existing) return { ok: false, reason: t('{name} est déjà dans tes applications.', { name: existing.name }), existing };
  const name = input.name.trim().slice(0, 40) || appSite(url);
  let id = input.id && /^[a-z0-9-]+$/.test(input.id) ? input.id : appIdFor(url);
  for (let n = 2; store.apps.some((a) => a.id === id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
  const entry: AppEntry = { id, name, url, screen: input.screen ?? 'backglass', color: cleanColor(input.color) ?? appColorFor(name), ...(input.icon ? { icon: input.icon } : {}), added: at };
  return { ok: true, store: { apps: [...store.apps, entry] }, app: entry };
}

export function updateApplication(store: AppsStore, id: string, patch: Partial<Omit<AppEntry, 'id' | 'added'>>): AppsStore {
  return { apps: store.apps.map((a) => (a.id === id ? cleanApp({ ...a, ...patch }) ?? a : a)) };
}

export function removeApplication(store: AppsStore, id: string): AppsStore {
  return { apps: store.apps.filter((a) => a.id !== id) };
}

export function markOpened(store: AppsStore, id: string, at = new Date().toISOString()): AppsStore {
  return updateApplication(store, id, { opened: at });
}

// ---------------------------------------------------------------------------
// Navigateur

/** Emplacements de chrome.exe (secours quand Edge a été désinstallé : Netflix y reste en HD au mieux). */
export function chromeExePaths(env: Record<string, string | undefined>): string[] {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter((r): r is string => Boolean(r));
  return [...new Set(roots.map((r) => `${r.replace(/[\\/]+$/, '')}\\Google\\Chrome\\Application\\chrome.exe`))];
}

/** Page de Microsoft d'où se télécharge Edge (le dialogue « Edge introuvable »). */
export const EDGE_DOWNLOAD_URL = 'https://www.microsoft.com/edge/download';

/**
 * En-tête User-Agent d'un téléphone Android (Edge mobile) : les sites répondent en version mobile. Un
 * seul en-tête change ; aucun port de débogage ni émulation pilotée dans Edge.
 */
export const APP_MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0';

/**
 * L'application s'affiche-t-elle en version mobile ? Le choix fait à la main l'emporte ; sans choix, oui
 * sur le playfield (un écran vertical, comme un téléphone) et non sur le fronton (un écran large, où la
 * version mobile s'étire et où certains sites, Netflix en tête, proposent d'installer leur application).
 */
export function appMobile(app: Pick<AppEntry, 'mobile' | 'screen'>): boolean {
  return app.mobile ?? app.screen === 'playfield';
}

/** Zoom de la page d'une application (pourcents) : les bornes, la valeur d'office (27/11/2026 : sur le playfield, les textes étaient trop petits) et les pas du réglage. */
export const APP_ZOOM_MIN = 100;
export const APP_ZOOM_MAX = 300;
export const APP_ZOOM_DEFAULT = 200;
export const APP_ZOOM_STEPS: readonly number[] = [100, 125, 150, 175, 200, 250, 300];

/** Un zoom ramené à un entier entre APP_ZOOM_MIN et APP_ZOOM_MAX (un fichier écrit à la main reste utilisable). */
export function clampAppZoom(percent: number): number {
  return Math.min(APP_ZOOM_MAX, Math.max(APP_ZOOM_MIN, Math.round(percent)));
}

/** Valeur d'office au fronton (un écran large, où les textes se lisent déjà) : le zoom n'y est pas imposé. */
export const APP_ZOOM_DEFAULT_FRONTON = 100;

/**
 * Zoom de l'application, en pourcents : celui qu'elle a gardé, sinon APP_ZOOM_DEFAULT sur le playfield
 * (où les textes étaient trop petits) et APP_ZOOM_DEFAULT_FRONTON sur le fronton. Comme pour l'affichage
 * mobile, sans choix fait à la main le défaut suit l'écran.
 */
export function appZoom(app: Partial<AppEntry>): number {
  return clampAppZoom(app.zoom ?? (app.screen === 'backglass' ? APP_ZOOM_DEFAULT_FRONTON : APP_ZOOM_DEFAULT));
}

/** Le pas suivant du réglage (au-dessus du zoom donné), puis retour au plus petit après le plus grand. */
export function nextAppZoom(percent: number): number {
  return APP_ZOOM_STEPS.find((s) => s > percent) ?? APP_ZOOM_STEPS[0]!;
}

/**
 * Edge (ou Chrome) d'une application : fenêtre d'application (ni barre d'adresse ni onglets), posée
 * sur l'écran voulu puis en plein écran, lecture automatique permise (la télécommande n'est pas un
 * clic de souris). Aucun port de débogage. `zoom` (pourcents) : le facteur d'échelle d'affichage de
 * Chromium (--force-device-scale-factor), qui agrandit la page comme le zoom du navigateur sans rien
 * piloter dans Edge ; 100 : rien n'est imposé. Le miroir du téléphone n'en est pas touché : il capture
 * et mesure des pixels d'écran.
 */
export function appBrowserArgs(profile: string, at: ScreenRect, url: string, mobile = false, zoom = 100): string[] {
  const scale = clampAppZoom(zoom) / 100;
  return [
    `--user-data-dir=${profile}`,
    ...EDGE_QUIET_ARGS,
    '--autoplay-policy=no-user-gesture-required',
    ...(mobile ? [`--user-agent=${APP_MOBILE_USER_AGENT}`] : []),
    ...(scale === 1 ? [] : [`--force-device-scale-factor=${scale}`]),
    `--window-position=${Math.round(at.x)},${Math.round(at.y)}`,
    `--window-size=${Math.max(1, Math.round(at.width))},${Math.max(1, Math.round(at.height))}`,
    '--start-fullscreen',
    `--app=${url}`,
  ];
}

// ---------------------------------------------------------------------------
// Playfield en portrait

/**
 * Orientation de Windows qui met l'image du playfield droite devant le joueur (son bord en bas), pour
 * une application ouverte en portrait : Edge dessine alors le site à l'endroit. undefined : l'écran
 * l'est déjà (rien à tourner). `edge` : le bord du joueur dans l'image actuelle (currentFlipperEdge).
 */
export function portraitTurn(edge: FlipperEdge, current: Rotation): Rotation | undefined {
  const steps = (FLIPPER_EDGES.length - FLIPPER_EDGES.indexOf(edge)) % FLIPPER_EDGES.length;
  return steps === 0 ? undefined : (((current + steps * 90) % 360) as Rotation);
}

export interface AppPortraitInput {
  /** Orientations de la session (sessionorientation.ts) : celle qui note l'origine et la rend à la sortie. */
  session: SessionOrientation;
  cabinet: Cabinet | undefined;
  /** Écrans tels que Windows les donne à cet instant (relus après la rotation). */
  displays(): ObservedDisplay[];
  log?(report: OrientationReport): void;
}

/** L'écran du playfield tourné pour une application : son rectangle une fois tourné, et de quoi rendre l'orientation d'avant. */
export interface AppPortrait {
  /** Pixels physiques du bureau (largeur et hauteur échangées après un quart de tour). */
  rect: ScreenRect;
  /** Rend l'orientation de jeu d'avant ; sans effet la seconde fois, et après la sortie (rendue alors par la session). */
  leave(): OrientationReport;
}

/**
 * Rectangle du bureau après un quart de tour. Relevés sur la borne le 26/11/2026 : juste après le
 * changement, Windows donne déjà la nouvelle rotation mais encore les dimensions d'avant (3840 × 2160
 * lus pour un écran devenu 2160 × 3840) ; Edge était alors posé en paysage sur un écran en portrait, et le
 * pavé tactile du téléphone ne couvrait qu'une bande du haut. Quand le relevé n'a pas échangé la
 * largeur et la hauteur d'un quart de tour, on les échange (même coin haut gauche).
 */
export function rectAfterTurn(before: ObservedDisplay, observed: ScreenRect, to: Rotation): ScreenRect {
  const quarter = (to - before.rotation + 360) % 180 !== 0;
  const stale = observed.width === before.bounds.width && observed.height === before.bounds.height;
  if (!quarter || !stale || before.bounds.width === before.bounds.height) return { ...observed };
  return { x: observed.x, y: observed.y, width: before.bounds.height, height: before.bounds.width };
}

/** Écart toléré (pixels) entre le rectangle voulu et celui qu'a la fenêtre une fois posée. */
export const PLACEMENT_TOLERANCE_PX = 16;

/**
 * Constat à journaliser quand la fenêtre posée n'a pas le rectangle voulu (le pavé du téléphone et la
 * capture suivent le rectangle réel de la fenêtre : un écart les fait déborder ou rétrécir) ;
 * undefined quand tout concorde.
 */
export function placementProblem(wanted: ScreenRect, actual: ScreenRect | undefined): string | undefined {
  const size = (r: ScreenRect) => `${Math.round(r.width)} × ${Math.round(r.height)} en ${Math.round(r.x)}, ${Math.round(r.y)}`;
  if (!actual) return 'fenêtre disparue avant le contrôle de sa position'; // i18n-ignore : journal
  const off = [wanted.x - actual.x, wanted.y - actual.y, wanted.width - actual.width, wanted.height - actual.height].some((d) => Math.abs(d) > PLACEMENT_TOLERANCE_PX);
  return off ? `fenêtre de ${size(actual)} au lieu de ${size(wanted)}` : undefined; // i18n-ignore : journal
}

/**
 * Application ouverte sur le playfield (26/11/2026) : Windows tourne l'écran pour que le bord du joueur
 * soit en bas (portraitTurn), le temps de l'application, par la rotation de session des parties
 * (SessionOrientation.lend : origine notée avant, reprise après un plantage, rendue à la sortie).
 * undefined : rien à tourner (playfield déjà à l'endroit, pas de playfield relevé, session sans la
 * main) ou rotation refusée par Windows ; l'application s'ouvre alors dans l'orientation actuelle.
 */
export function turnPlayfieldForApp(input: AppPortraitInput): AppPortrait | undefined {
  const fp = input.cabinet?.roles.playfield;
  const find = () => (fp ? input.displays().find((d) => fingerprintOf(d).key === fp) : undefined);
  const display = find();
  if (!input.cabinet || !fp || !display || !input.session.active) return undefined;
  const edge = currentFlipperEdge(input.cabinet, display);
  const to = edge && portraitTurn(edge, display.rotation);
  if (to === undefined) return undefined;
  const lent = input.session.lend(fp, to);
  input.log?.(lent.report);
  const turned = find();
  if (lent.report.problems.length || turned?.rotation !== to) {
    input.log?.(lent.giveBack());
    return undefined;
  }
  return { rect: rectAfterTurn(display, turned.bounds, to), leave: () => {
    const report = lent.giveBack();
    input.log?.(report);
    return report;
  } };
}

// ---------------------------------------------------------------------------
// Boutons de la borne pendant une application

/** Touche d'Edge qu'un bouton envoie (TabBack : Maj+Tab). */
export type AppKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Enter' | 'Space' | 'Escape' | 'Tab' | 'TabBack';

/**
 * Les boutons relayés à Edge, comme dans le Juke-box (26/11/2026) : un flipper appuyé passe à
 * l'élément cliquable précédent ou suivant (Maj+Tab, Tab : Edge l'encadre et fait défiler la page
 * jusqu'à lui), tenu il recule ou avance dans la vidéo (APP_SEEK_KEYS) ; MagnaSave ←→, Start
 * Entrée, lanceur Espace, Exit Échap (retour).
 */
export const APP_BUTTON_KEYS = {
  leftFlipper: 'TabBack',
  rightFlipper: 'Tab',
  leftMagna: 'ArrowLeft',
  rightMagna: 'ArrowRight',
  start: 'Enter',
  plunger: 'Space',
  exit: 'Escape',
} as const satisfies Record<string, AppKey>;
export type AppButton = keyof typeof APP_BUTTON_KEYS;

/**
 * Flipper tenu : la flèche qui recule ou avance dans la vidéo (YouTube : 5 s par flèche), envoyée au
 * rythme du Juke-box (seekPressStep) ; plusieurs flèches par pas quand le pas grandit (10 s, 30 s).
 */
export const APP_SEEK_KEYS = { leftFlipper: 'ArrowLeft', rightFlipper: 'ArrowRight' } as const satisfies Partial<Record<AppButton, AppKey>>;
export const APP_SEEK_SECONDS_PER_KEY = 5;

/** Flèches à envoyer pour un pas d'avance de `seconds` (signé) : au moins une. */
export function appSeekKeyCount(seconds: number): number {
  return Math.max(1, Math.round(Math.abs(seconds) / APP_SEEK_SECONDS_PER_KEY));
}

/**
 * Touche de modification (Maj, Ctrl, Alt, gauche ou droite) : tenue par un flipper d'encodeur, elle se
 * mêlerait aux flèches de l'avance (Maj+→) ; on la relâche le temps de la frappe.
 */
export function isModifierVk(vk: number): boolean {
  return (vk >= 0x10 && vk <= 0x12) || (vk >= 0xa0 && vk <= 0xa5);
}

/** Exit tenu ce temps : l'application se ferme et la roue revient. */
export const APP_EXIT_HOLD_MS = 1000;
/** L'écran qui ne montre pas l'application s'assombrit après ce temps sans geste. */
export const APP_DIM_MS = 30_000;

/**
 * Touches qu'Edge reçoit déjà de lui-même quand un encodeur de clavier les envoie : elles y ont un sens
 * (valider, défiler, revenir). Cyber Pinball n'en renvoie pas une seconde : pas de double action.
 */
const NATIVE_MEANINGFUL = new Set(['Enter', 'NumpadEnter', 'Space', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace']);

/**
 * Touche que Cyber Pinball envoie à Edge au relâché d'un bouton dont la touche relevée est `code`
 * (KeyboardEvent.code, ou « SDLJoy_… » pour un joystick) ; undefined : Edge la reçoit déjà telle quelle.
 * Un bouton de joystick n'arrive jamais à Edge : toujours relayé.
 */
export function appButtonKey(button: AppButton, code: string): AppKey | undefined {
  if (!code.startsWith('SDLJoy_') && NATIVE_MEANINGFUL.has(code)) return undefined;
  return APP_BUTTON_KEYS[button];
}

// ---------------------------------------------------------------------------
// Textes

export function appScreenLabel(screen: AppScreen): string {
  return screen === 'playfield' ? t('Playfield') : t('Fronton');
}

export function appsBrowserMissingText(): string {
  return t('Microsoft Edge est introuvable : réinstalle-le pour ouvrir tes applications sur la borne.');
}
