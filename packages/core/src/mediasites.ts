// Médias des sites communautaires, avec le compte de l'utilisateur (docs/recherche/
// sources-medias.md § 6) : VPForums, puis VPUniverse en dernier recours. PinUP Popper
// n'est pas sur la machine : ces deux sites portent la bibliothèque que son serveur
// réserve à Popper Setup (wheels, vidéos du plateau, du fronton, du DMD et du topper,
// cartes, sons de lancement, packs complets).
//
// La recherche se fait sur demande, une page de résultats par site et par titre, dans la
// session de la fenêtre « Récupérer » (persist:acquisition) : jamais en tâche de fond, ni
// fiche par fiche. Le script de la page (SITE_SEARCH_PROBES) relève chaque résultat : titre,
// catégorie, auteur, vignette. Ici, sans Electron : catégories des sites, adresses de
// recherche, rapprochement des résultats avec les jeux de la base VPS, type de média
// de chaque résultat, ordre des propositions.
//
// Les téléchargements respectent le site : un fichier à la fois, à la demande, après la
// connexion de l'utilisateur. Le minuteur de VPUniverse (environ 45 s par fichier pour
// un compte gratuit) se déroule dans la page, comme pour un membre qui clique : Cyber
// Pinball attend, ne le contourne pas.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { scanInstallation } from './mediaimport';
import { isAcceptedFormat, mediaKind, type MediaKind, type MediaType } from './medias';
import type { MediaChoice } from './mediachoices';
import { isJunkName } from './puppack';
import { COMMON_PROBE } from './sitesessions';
import { matchVps, vpsKey, vpsWords, type VpsCandidate, type VpsDb, type VpsGame } from './vps';

export type MediaSiteId = 'vpforums' | 'vpuniverse';

export interface MediaSite {
  id: MediaSiteId;
  /** « VPForums » */
  name: string;
  /** Domaine des cookies et des liens (sitesessions.ts). */
  domain: string;
  /** Attente imposée avant chaque téléchargement avec un compte gratuit, en secondes (0 : aucune connue). */
  wait: number;
  /** La recherche est réservée aux membres connectés. */
  searchNeedsLogin: boolean;
  /** Ce que le site a, pour le dire avant la connexion. */
  holdings: string;
}

/** Dans l'ordre où leurs propositions passent : VPUniverse, lent, en dernier. */
export const MEDIA_SITES: readonly MediaSite[] = [
  {
    id: 'vpforums',
    name: 'VPForums',
    domain: 'vpforums.org',
    wait: 0,
    searchNeedsLogin: true,
    get holdings() {
      return t('808 packs de médias complets, 4 153 logos, 1 829 vidéos');
    },
  },
  {
    id: 'vpuniverse',
    name: 'VPUniverse',
    domain: 'vpuniverse.com',
    wait: 45,
    searchNeedsLogin: false,
    get holdings() {
      return t('environ 24 000 médias : logos, vidéos du plateau, du fronton, du DMD et du topper, cartes, sons de lancement');
    },
  },
];

export function mediaSite(id: MediaSiteId): MediaSite {
  return MEDIA_SITES.find((s) => s.id === id)!;
}

/** Catégorie de téléchargement d'un site, et les médias qu'elle range. */
export interface SiteCategory {
  /** Identifiant dans l'adresse (« 160 » de /files/category/160-topper-videos/, « 35 » de showcat=35). */
  id: string;
  /** Types de média possibles ; un pack complet les a tous. */
  types: MediaType[];
  /** Nature du fichier attendu ; absent : selon le titre (vidéos de VPForums) ou pack. */
  kind?: MediaKind;
  /** Pack complet : une archive avec les médias de plusieurs écrans. */
  pack?: boolean;
}

const VIDEO_TYPES: MediaType[] = ['Playfield', 'Backglass', 'DMD', 'FullDMD', 'Topper', 'Loading'];
const PACK_TYPES: MediaType[] = ['Wheel', 'Playfield', 'Backglass', 'DMD', 'FullDMD', 'Topper', 'Loading', 'Audio', 'AudioLaunch', 'GameInfo', 'GameHelp'];

/** Catégories des médias de menu, relevées le 24/10/2026 (sources-medias.md § 6.2 et § 6.3). */
export const SITE_CATEGORIES: Record<MediaSiteId, readonly SiteCategory[]> = {
  vpuniverse: [
    { id: '70', types: ['Wheel'], kind: 'image' }, // Wheel Images
    { id: '127', types: ['Wheel'], kind: 'image' }, // Tarcisio Style Wheels
    { id: '149', types: ['Wheel'], kind: 'image' }, // Animated Wheel Images (APNG)
    { id: '111', types: ['Loading'], kind: 'video' }, // Loading Animations
    { id: '160', types: ['Topper'], kind: 'video' }, // Topper Videos
    { id: '93', types: ['Topper'], kind: 'image' }, // Topper Images
    { id: '91', types: ['GameHelp'], kind: 'image' }, // Instruction Cards
    { id: '141', types: ['Backglass'], kind: 'video' }, // Backglass Videos
    { id: '140', types: ['Playfield'], kind: 'video' }, // Playfield Videos
    { id: '71', types: ['Playfield'], kind: 'image' }, // Table Images
    { id: '168', types: ['AudioLaunch'], kind: 'audio' }, // Launch Audio
    { id: '167', types: ['DMD'], kind: 'video' }, // DMD Video
    { id: '143', types: ['FullDMD'], kind: 'video' }, // FullDMD Videos
    { id: '92', types: ['GameInfo'], kind: 'image' }, // Pinball Flyers
  ],
  vpforums: [
    { id: '35', types: PACK_TYPES, pack: true }, // Complete Media Packs
    { id: '27', types: ['Wheel'], kind: 'image' }, // Wheel Logos
    { id: '33', types: VIDEO_TYPES, kind: 'video' }, // Videos (tous les écrans, le titre dit lequel)
    { id: '55', types: ['Topper'], kind: 'image' }, // Topper Images
  ],
};

// ---------------------------------------------------------------------------
// Recherche

/** Petits mots que les moteurs de recherche des forums comptent mal (recherche « et »). */
const QUERY_STOP = new Set(['the', 'of', 'and', 'a', 'an', 'de', 'la', 'le', 'les', 'du', 'des']);

/**
 * Texte à chercher pour un jeu : le titre avant son sous-titre, sans petits mots, en
 * quatre mots au plus. « Terminator 2: Judgment Day » donne « terminator 2 » (le
 * sous-titre s'écrit aussi « Judgement ») ; le rapprochement trie ensuite.
 */
export function siteQuery(name: string): string {
  const main = name.replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s+-\s+|:\s*/)[0]!;
  const words = vpsWords(main).filter((w) => !QUERY_STOP.has(w));
  return (words.length ? words : vpsWords(main)).slice(0, 4).join(' ');
}

/**
 * Texte réellement envoyé au site : VPUniverse ignore les mots de trois lettres ou moins, et
 * sa recherche « et » ne rend alors rien du tout (« goonies never say die », le 27/10/2026) ;
 * ils sont retirés, sauf s'il ne restait rien.
 */
export function siteSearchText(site: MediaSiteId, query: string): string {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (site !== 'vpuniverse') return words.join(' ');
  const long = words.filter((w) => w.length > 3);
  return (long.length ? long : words).join(' ');
}

/** Pages de résultats lues au plus par recherche (25 fiches par page sur VPUniverse). */
export const SITE_SEARCH_PAGES = 3;

/**
 * Catégories où chercher un média : celles qui le rangent, et seulement elles. Toutes
 * catégories confondues, les logos d'un jeu connu remplissent la première page (16 sur
 * 25 pour Game of Thrones) et les toppers passent aux pages suivantes.
 */
export function siteSearchNodes(site: MediaSiteId, type?: MediaType): string[] {
  const all = SITE_CATEGORIES[site];
  const own = type ? all.filter((c) => c.types.includes(type) && !c.pack) : [];
  return (own.length ? own : all).map((c) => c.id);
}

/**
 * Page de résultats pour un texte, limitée aux catégories du média `type` (toutes les
 * catégories des médias de menu sans lui), page `page`. VPForums ne filtre pas par
 * catégorie et sa page de résultats ne dit pas son nombre de pages : `type` et `page`
 * n'y changent rien (sa recherche rend quelques fiches par titre).
 */
export function siteSearchUrl(site: MediaSiteId, query: string, type?: MediaType, page = 1): string {
  const q = encodeURIComponent(siteSearchText(site, query));
  if (site === 'vpuniverse') {
    const nodes = siteSearchNodes(site, type).join(',');
    return `https://vpuniverse.com/search/?q=${q}&type=downloads_file&nodes=${nodes}&search_and_or=and&sortby=relevancy${page > 1 ? `&page=${page}` : ''}`;
  }
  return `https://www.vpforums.org/index.php?app=core&module=search&do=search&search_term=${q}&search_app=downloads`;
}

/** La recherche d'un site dépend du média : VPUniverse filtre par catégorie, VPForums non. */
export function siteSearchByType(site: MediaSiteId): boolean {
  return site === 'vpuniverse';
}

/** Un résultat de recherche, tel que la page le montre. */
export interface SiteHit {
  site: MediaSiteId;
  /** Identifiant de la fiche sur le site. */
  id: string;
  /** Adresse de la fiche, sans identifiant de session. */
  url: string;
  title: string;
  /** Catégorie de la fiche, si la page la donne. */
  category?: { id: string; label: string };
  author?: string;
  /** Vignette publiée par l'auteur (image fixe, même pour une vidéo). */
  thumb?: string;
  /** Date de publication (ISO). */
  date?: string;
  downloads?: number;
  version?: string;
}

/** Ce que le script de recherche a vu dans la page. */
export type SiteSearchResult =
  /** `pages` : nombre de pages de résultats, si la page le dit. */
  | { kind: 'hits'; hits: SiteHit[]; pages?: number }
  /** La recherche est réservée aux membres. */
  | { kind: 'login' }
  /** Vérification de Cloudflare, site en panne, page illisible : à montrer. */
  | { kind: 'show'; reason: 'challenge' | 'down' | 'captcha' | 'unreadable' }
  /** Le site impose d'attendre entre deux recherches (visiteur de VPUniverse : environ 90 s). */
  | { kind: 'show'; reason: 'flood'; wait: number };

/**
 * Script de la page de résultats d'Invision Community (VPUniverse) : un élément
 * ipsStreamItem par fiche, avec son titre, sa catégorie, son auteur, sa vignette.
 * Pour un membre connecté, une fiche pas encore vue porte devant son titre une pastille
 * « non lu » : un lien vers la même fiche (?do=getNewComment), sans texte. Le titre est
 * le lien qui a du texte, jamais le premier venu (sinon, titres vides : aucun résultat
 * ne désigne plus le jeu, test « membre connecté » de mediasites.test.ts).
 */
const INVISION_SEARCH = /* i18n-ignore : script de la page du site, motifs de recherche */ String.raw`(() => {${COMMON_PROBE}
  const hits = [];
  const seen = new Set();
  // Visiteur : une recherche toutes les 90 secondes environ ; la page d'erreur dit combien attendre.
  const flood = /Please wait (\d+) seconds? before attempting another search/i.exec(text);
  if (flood) return { kind: 'show', reason: 'flood', wait: Number(flood[1]) };
  for (const item of document.querySelectorAll('li.ipsStreamItem, .ipsStreamItem')) {
    const links = [...item.querySelectorAll('.ipsStreamItem_title a[href*="/files/file/"], h2 a[href*="/files/file/"]')].filter((a) => a.textContent.trim());
    const link = links.find((a) => a.hasAttribute('data-searchable')) || links.find((a) => !/[?&]do=/.test(a.href)) || links[0];
    if (!link) continue;
    const m = /\/files\/file\/(\d+)-/.exec(link.href);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const cat = item.querySelector('a[href*="/files/category/"]');
    const cm = cat && /\/files\/category\/(\d+)-/.exec(cat.href);
    const img = item.querySelector('img[src*="/screenshots/"]');
    const authors = [...item.querySelectorAll('.ipsStreamItem_status a[href*="/profile/"]')].map((a) => a.textContent.trim()).filter(Boolean);
    const time = item.querySelector('time[datetime]');
    const dl = /(\d[\d,]*)\s+downloads?/i.exec(item.textContent || '');
    const version = /Version\s+([^\s<]+)/i.exec(item.textContent || '');
    hits.push({
      id: m[1],
      url: link.href.split('?')[0],
      title: link.textContent.replace(/\s+/g, ' ').trim(),
      category: cm ? { id: cm[1], label: cat.textContent.trim() } : undefined,
      author: authors[0],
      thumb: img ? img.src : undefined,
      date: time ? time.getAttribute('datetime') : undefined,
      downloads: dl ? Number(dl[1].replace(/[^\d]/g, '')) : undefined,
      version: version ? version[1] : undefined,
    });
  }
  if (!hits.length && document.querySelector('#elUserSignIn') && /sign in|log in/i.test(document.title)) return { kind: 'login' };
  const pagination = document.querySelector('[data-pages]');
  const pages = pagination ? Number(pagination.getAttribute('data-pages')) || undefined : undefined;
  return { kind: 'hits', hits, pages };
})()`;

/**
 * Script de la page de résultats d'IP.Board 3 avec IP.Downloads (VPForums) : chaque lien
 * vers une fiche (showfile=…), avec la ligne qui le porte (catégorie, auteur, vignette).
 * Réservée aux membres : un visiteur reçoit le formulaire de connexion.
 */
const IPBOARD3_SEARCH = /* i18n-ignore : script de la page du site, motifs de recherche */ String.raw`(() => {${COMMON_PROBE}
  if (/Attention Proxy Users/i.test(text)) return { kind: 'show', reason: 'unreadable' };
  const member = document.querySelector('#user_link');
  if (!member && document.querySelector('#login, form[action*="section=login"], #sign_in')) return { kind: 'login' };
  const hits = [];
  const seen = new Map();
  for (const link of document.querySelectorAll('a[href*="showfile="]')) {
    const m = /[?&]showfile=(\d+)/.exec(link.href);
    if (!m || /#/.test(link.getAttribute('href') || '')) continue;
    const row = link.closest('.idm_category_row, tr, li, .result_info, .ipsBox_container, div.row') || link.parentElement;
    if (row && row.closest('#primary_nav, .megamenu, #community_app_menu, #footer_utilities')) continue;
    const named = (link.getAttribute('title') || '').replace(/^View file named\s+/i, '').trim();
    const own = link.querySelector('img') ? '' : link.childNodes[0] ? (link.childNodes[0].textContent || '').trim() : '';
    const title = (named || own).replace(/\s+/g, ' ').trim();
    let hit = seen.get(m[1]);
    if (!hit) {
      hit = { id: m[1], url: 'https://www.vpforums.org/index.php?app=downloads&showfile=' + m[1], title: '' };
      seen.set(m[1], hit);
      hits.push(hit);
    }
    if (title && title.length > hit.title.length && !/^\d+ reviews?$/i.test(title)) hit.title = title;
    if (!row) continue;
    const img = row.querySelector('img.screenshot, img[src*="section=screenshot"]');
    if (img && !hit.thumb) hit.thumb = img.src.replace(/([?&])s=[0-9a-f]+&(amp;)?/i, '$1');
    const cat = row.querySelector('a[href*="showcat="]');
    const cm = cat && /[?&]showcat=(\d+)/.exec(cat.href);
    if (cm && !hit.category) hit.category = { id: cm[1], label: cat.textContent.trim() };
    const user = row.querySelector('a[href*="showuser="]');
    if (user && !hit.author) hit.author = user.textContent.trim();
  }
  return { kind: 'hits', hits: hits.filter((h) => h.title) };
})()`;

/** Script à exécuter dans la page de résultats de ce site ; il renvoie un SiteSearchResult (sans `site`). */
export const SITE_SEARCH_PROBES: Record<MediaSiteId, string> = {
  vpuniverse: INVISION_SEARCH,
  vpforums: IPBOARD3_SEARCH,
};

/**
 * Ce que le script de la page a rendu, vérifié : chaque résultat garde son site et doit
 * avoir un identifiant et un titre. Une fiche sans titre ne désigne aucun jeu et
 * passerait, sans bruit, pour « d'un autre jeu » : la page a changé de forme (pastille
 * « non lu » des membres, nouvelle version du forum). Si la plupart des résultats sont
 * dans ce cas, la page est déclarée illisible, ce que l'écran dit ; `untitled` compte
 * les fiches écartées, pour le journal.
 */
export function checkSiteSearch(site: MediaSiteId, raw: unknown): SiteSearchResult & { untitled?: number } {
  if (!raw || typeof raw !== 'object' || !('kind' in raw)) return { kind: 'show', reason: 'unreadable' };
  const r = raw as SiteSearchResult;
  if (r.kind !== 'hits') return r;
  const all = Array.isArray(r.hits) ? r.hits : [];
  const hits = all.filter((h) => h && typeof h.id === 'string' && h.id && typeof h.title === 'string' && h.title.trim()).map((h) => ({ ...h, site }));
  const untitled = all.length - hits.length;
  if (untitled > hits.length) return { kind: 'show', reason: 'unreadable', untitled };
  return { kind: 'hits', hits, pages: typeof r.pages === 'number' && r.pages > 0 ? r.pages : undefined, ...(untitled ? { untitled } : {}) };
}

// ---------------------------------------------------------------------------
// Rapprochement et types

/** Mots des titres qui disent le média, pas le jeu : retirés avant le rapprochement. */
const MEDIA_WORDS =
  /\b(wheels?|logos?|tarcisio|style|animated|apng|topper|toppers|videos?|images?|imgs?|backglass(es)?|bg|playfield|pf|table|dmd|full ?dmd|fulldmd|loading|animations?|launch|audio|mp3s?|instructions?|cards?|rules|flyers?|media|pack|hp|pinballx|popper|pup|hd|4k|1080p?|upscaled|cleaned|chrome edition|alt(ernate)?|static|v?\d+(\.\d+)+)\b/gi;

/** Titre d'un résultat réduit au nom du jeu : « Terminator 2 (Williams 1991) Topper Video » → « Terminator 2 (Williams 1991) ». */
export function hitGameName(title: string): string {
  return title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(MEDIA_WORDS, ' ')
    .replace(/\s+-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Types de média d'un résultat : selon sa catégorie, et pour les vidéos mêlées de VPForums, selon son titre. */
export function hitTypes(hit: SiteHit): {
  types: MediaType[];
  kind?: MediaKind;
  pack: boolean;
} {
  const category = hit.category ? SITE_CATEGORIES[hit.site].find((c) => c.id === hit.category!.id) : undefined;
  const title = hit.title.toLowerCase();
  if (/media ?pack|complete media/.test(title) || category?.pack) return { types: PACK_TYPES, pack: true };
  if (category && category.types.length === 1) return { types: category.types, kind: category.kind, pack: false };
  // Catégorie mêlée (vidéos de VPForums) ou inconnue (résultat sans catégorie) : le titre.
  const said: [RegExp, MediaType, MediaKind][] = [
    [/full ?dmd/, 'FullDMD', 'video'],
    [/\bdmd\b/, 'DMD', 'video'],
    [/topper/, 'Topper', category?.kind ?? 'video'],
    [/backglass|\bbg\b/, 'Backglass', 'video'],
    [/playfield|\bpf\b|table video/, 'Playfield', 'video'],
    [/loading/, 'Loading', 'video'],
    [/wheel|logo/, 'Wheel', 'image'],
    [/instruction|card|rules/, 'GameHelp', 'image'],
    [/flyer/, 'GameInfo', 'image'],
    [/launch/, 'AudioLaunch', 'audio'],
  ];
  const found = said.filter(([re]) => re.test(title));
  if (found.length) {
    const types = [...new Set(found.map(([, type]) => type))].filter((type) => !category || category.types.includes(type));
    if (types.length) return { types, kind: found[0]![2], pack: false };
  }
  return category ? { types: category.types, kind: category.kind, pack: false } : { types: [], pack: false };
}

/** Un résultat proposé pour un média d'un jeu. */
export interface SiteOffer {
  hit: SiteHit;
  type: MediaType;
  kind?: MediaKind;
  pack: boolean;
  /** Jeu de la base VPS que désigne le titre. */
  game: VpsGame;
  /** Entre 0 et 1 : à quel point le titre désigne ce jeu. */
  score: number;
}

/**
 * Rapprochement d'un titre avec toute la base VPS, gardé par base : les propositions se
 * redessinent à chaque appui de bouton, et un rapprochement approfondi parcourt
 * 2 600 jeux (de l'ordre d'une dizaine de millisecondes par titre).
 */
const matchedTitles = new WeakMap<VpsDb, Map<string, VpsCandidate[]>>();
function hitCandidates(vps: VpsDb, name: string): VpsCandidate[] {
  let known = matchedTitles.get(vps);
  if (!known) matchedTitles.set(vps, (known = new Map()));
  let found = known.get(name);
  if (!found) known.set(name, (found = matchVps(vps, { names: [name] }, { deep: true, max: 6 }).candidates));
  return found;
}

/**
 * Résultats qui désignent l'un des jeux retenus, rangés par type. Le titre de chaque
 * résultat, débarrassé des mots du média, est rapproché de toute la base VPS : un
 * résultat « Terminator 3 » ne passe pas pour Terminator 2 parce qu'il en contient le
 * premier mot. Sans base VPS, il faut que le nom du jeu soit dans le titre.
 */
export function siteOffers(hits: SiteHit[], games: VpsGame[], vps?: VpsDb): Partial<Record<MediaType, SiteOffer[]>> {
  const wanted = new Map(games.map((g) => [g.id, g]));
  const out: Partial<Record<MediaType, SiteOffer[]>> = {};
  for (const hit of hits) {
    const name = hitGameName(hit.title);
    if (!name) continue;
    let game: VpsGame | undefined;
    let score = 0;
    if (vps) {
      const candidates = hitCandidates(vps, name);
      const best = candidates[0];
      const mine = candidates.find((c) => wanted.has(c.game.id));
      // Le jeu retenu en tête, ou presque aussi probable que le premier (éditions Pro et Premium).
      if (best && mine && mine.score >= 0.6 && mine.score >= best.score - 0.05) [game, score] = [wanted.get(mine.game.id)!, mine.score];
    } else {
      const key = vpsKey(name);
      const g = games.find((x) => {
        // Le titre sans sous-titre : « Terminator 3 » pour « Terminator 3 - Rise of the Machines ».
        const k = vpsKey(x.name.replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s+-\s+|:\s*/)[0]!);
        return k.length >= 3 && key.includes(k);
      });
      if (g) [game, score] = [g, 0.7];
    }
    if (!game) continue;
    const { types, kind, pack } = hitTypes(hit);
    for (const type of types) (out[type] ??= []).push({ hit, type, kind, pack, game, score });
  }
  // Le jeu le mieux désigné d'abord ; à égalité, un fichier propre au média avant un pack, puis le plus téléchargé.
  for (const list of Object.values(out)) {
    list!.sort((a, b) => b.score - a.score || Number(a.pack) - Number(b.pack) || (b.hit.downloads ?? 0) - (a.hit.downloads ?? 0));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fichiers reçus

/** Un média trouvé dans ce qu'un site a envoyé (fichier seul ou archive déballée). */
export interface ReceivedMedia {
  file: string;
  /** Type reconnu (dossier à la manière de Popper ou de PinballX, nom « (Type) … ») ou dit par la catégorie. */
  type?: MediaType;
  kind: MediaKind;
}

/**
 * Médias d'un envoi déballé dans `root` : un pack rangé à la manière de Popper ou de
 * PinballX dit le type de chaque fichier par son dossier ; un fichier d'une catégorie
 * à un seul type (« Topper Videos ») prend ce type s'il en a le format. Les autres
 * restent sans type : ils ne sont proposés que pour le média d'où on les a demandés.
 */
export function receivedMedias(root: string, offered: { types: MediaType[]; kind?: MediaKind }): ReceivedMedia[] {
  const known = new Map<string, MediaType>();
  for (const f of scanInstallation(root).files) known.set(path.resolve(f.from).toLowerCase(), f.media.type);
  const out: ReceivedMedia[] = [];
  const walk = (dir: string) => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (isJunkName(d.name)) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        walk(p);
        continue;
      }
      const kind = d.isFile() ? mediaKind(d.name) : undefined;
      if (!kind) continue;
      let type: MediaType | undefined = known.get(path.resolve(p).toLowerCase());
      // Fichier d'une catégorie à un seul type, de sa nature (une image n'est pas une « Topper Video »).
      if (!type && offered.types.length === 1 && (!offered.kind || offered.kind === kind)) type = offered.types[0];
      if (type && !isAcceptedFormat(type, p)) type = undefined;
      out.push({ file: p, type, kind });
    }
  };
  walk(root);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Ce qu'un site a envoyé pour une fiche, une fois déballé ; gardé d'une visite à l'autre. */
export interface SiteReceipt {
  /** « vpuniverse:27996 » */
  key: string;
  site: MediaSiteId;
  title: string;
  url: string;
  author?: string;
  /** Média d'où il a été demandé : un fichier sans type reconnu n'est proposé que pour lui. */
  type: MediaType;
  /** Date de réception (ISO). */
  date: string;
  files: ReceivedMedia[];
}

/** Ce que les résultats d'un site donnent, média par média, pour les jeux retenus. */
export interface SiteHitSummary {
  /** Fiches propres à un type de média (packs à part). */
  byType: Partial<Record<MediaType, number>>;
  /** Packs complets : ils servent à tous les écrans. */
  packs: number;
  /** Fiches d'autres jeux, ou sans média que le menu montre (patchs, outils). */
  elsewhere: number;
}

/**
 * Décompte des résultats d'un site : « 25 résultats » ne dit pas combien servent au
 * média ouvert. Sans ce détail, un écran sans proposition à côté de 25 résultats
 * passe pour une panne (afficheur 4:1 quand le site n'a que des FullDMD).
 */
export function siteHitSummary(hits: SiteHit[], games: VpsGame[], vps?: VpsDb): SiteHitSummary {
  const byType: Partial<Record<MediaType, number>> = {};
  const placed = new Set<string>();
  const packs = new Set<string>();
  for (const [type, list] of Object.entries(siteOffers(hits, games, vps)) as [MediaType, SiteOffer[]][]) {
    const ids = new Set(list.filter((o) => !o.pack).map((o) => o.hit.id));
    if (ids.size) byType[type] = ids.size;
    for (const o of list) (o.pack ? packs : placed).add(o.hit.id);
  }
  for (const id of packs) placed.add(id);
  return { byType, packs: packs.size, elsewhere: new Set(hits.map((h) => h.id)).size - placed.size };
}

// ---------------------------------------------------------------------------
// Recherche sur le web, dans la fenêtre « Récupérer »

/** Mots que les auteurs de médias mettent dans leurs titres, par écran (en anglais : VPUniverse, VPForums, YouTube). */
const WEB_SEARCH_WORDS: Partial<Record<MediaType, string>> = {
  Wheel: 'wheel logo',
  Playfield: 'playfield video',
  Backglass: 'backglass video',
  DMD: 'DMD video',
  FullDMD: 'FullDMD video',
  Topper: 'topper video',
  Loading: 'loading video',
  Audio: 'table music',
  AudioLaunch: 'launch audio',
  GameInfo: 'flyer',
  GameHelp: 'instruction card',
};

/**
 * Page de recherche pour un média d'un jeu, quand les sources branchées n'ont rien :
 * DuckDuckGo, sans compte ni bandeau de consentement à accepter. Le titre sans
 * sous-titre ni édition (« Game of Thrones » pour « Game of Thrones (Limited
 * Edition) »), puis l'écran, puis « vpinball » pour rester chez les flippers virtuels.
 */
export function webSearchUrl(game: string, type: MediaType): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(webSearchQuery(game, type))}`;
}

/** Texte de cette recherche, repris dans le champ de recherche du bandeau de « Récupérer ». */
export function webSearchQuery(game: string, type: MediaType): string {
  const title = game.replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s+-\s+|:\s*/)[0]!.replace(/\s+/g, ' ').trim();
  return [title, WEB_SEARCH_WORDS[type] ?? type, 'vpinball'].filter(Boolean).join(' ');
}

/**
 * Fichier téléchargé par l'utilisateur dans la fenêtre « Récupérer », depuis
 * « Chercher sur le web… » : il revient au média et à la table d'où il l'a cherché.
 */
export interface WebReceipt {
  /** « web:<horodatage> » */
  key: string;
  /** Table (fichier .vpx) d'où la recherche est partie : le fichier n'est proposé qu'à elle. */
  table: string;
  /** Média d'où la recherche est partie : un fichier sans type reconnu n'est proposé que pour lui. */
  type: MediaType;
  /** Adresse du téléchargement (première de la chaîne de redirections). */
  url: string;
  /** Nom du fichier reçu (l'archive, avant déballage). */
  filename: string;
  /** Date de réception (ISO). */
  date: string;
  files: ReceivedMedia[];
  /** Fichiers à convertir pour ce média avant de s'en servir (image en PNG, son ou son d'une vidéo en WAV). */
  convert?: { file: string; kind: MediaKind; to: 'png' | 'wav'; from: 'image' | 'audio' | 'video' }[];
  /** Fichiers refusés pour ce média, et pourquoi (ils ne sont pas gardés). */
  refused?: { name: string; reason: string }[];
  /** Arrivé dans Téléchargements de Windows (navigateur de l'utilisateur), pas dans la fenêtre « Récupérer ». */
  windows?: boolean;
}

/** Hôte d'une adresse, sans « www. » : « vpuniverse.com ». */
export function webHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Propositions venues du web pour un média d'une table, la plus récente d'abord : les
 * fichiers d'un type reconnu (pack rangé à la manière de Popper) vont à leur média,
 * les autres au média d'où la recherche est partie, s'ils en ont le format.
 */
export function webMediaChoices(type: MediaType, receipts: WebReceipt[], table: string): MediaChoice[] {
  const out: MediaChoice[] = [];
  const mine = receipts.filter((r) => path.resolve(r.table).toLowerCase() === path.resolve(table).toLowerCase());
  for (const r of [...mine].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const f of r.files) {
      if (f.type ? f.type !== type : r.type !== type || !isAcceptedFormat(type, f.file)) continue;
      let bytes: number;
      try {
        bytes = fs.statSync(f.file).size;
      } catch {
        continue;
      }
      out.push({
        id: f.file,
        type,
        kind: f.kind,
        source: 'web',
        label: path.basename(f.file),
        detail: t('reçu de {host} : {file}', { host: webHost(r.url), file: r.filename }),
        file: f.file,
        bytes,
      });
    }
  }
  return out;
}

/** Clé d'une fiche : « vpuniverse:27996 ». */
export const siteHitKey = (hit: Pick<SiteHit, 'site' | 'id'>) => `${hit.site}:${hit.id}`;

/**
 * Identité d'une proposition à l'écran (focus.ts) : la fiche d'un site, puis chacun de ses
 * fichiers une fois reçus (« site:<fiche>/<fichier> »), pour que le curseur posé sur la
 * fiche reste sur ce qu'elle a donné ; les autres, leur identifiant.
 */
export function mediaChoiceKey(choice: Pick<MediaChoice, 'id' | 'site'>): string {
  if (!choice.site) return choice.id;
  const hit = `site:${siteHitKey(choice.site.hit)}`;
  return choice.site.received ? `${hit}/${choice.id}` : hit;
}

/** Nature par défaut d'un média, pour une fiche dont la catégorie ne la dit pas (pack). */
function defaultKind(type: MediaType): MediaKind {
  if (type === 'Audio' || type === 'AudioLaunch') return 'audio';
  if (type === 'Wheel' || type === 'GameInfo' || type === 'GameHelp') return 'image';
  return 'video';
}

/**
 * Propositions des sites pour un média, VPForums d'abord puis VPUniverse : pour chaque
 * fiche qui désigne un jeu retenu, ses fichiers déjà reçus de ce type (prêts à prendre),
 * sinon la fiche elle-même (à télécharger). Une fiche reçue sans rien pour ce média
 * reste montrée : sa carte le dit.
 */
export function siteMediaChoices(
  type: MediaType,
  results: { site: MediaSiteId; hits: SiteHit[] }[],
  games: VpsGame[],
  vps: VpsDb | undefined,
  receipt: (key: string) => SiteReceipt | undefined,
): MediaChoice[] {
  const out: MediaChoice[] = [];
  for (const site of MEDIA_SITES) {
    const hits = results.filter((r) => r.site === site.id).flatMap((r) => r.hits);
    const seen = new Set<string>();
    for (const offer of siteOffers(hits, games, vps)[type] ?? []) {
      const key = siteHitKey(offer.hit);
      if (seen.has(key)) continue;
      seen.add(key);
      const got = receipt(key);
      const files = got?.files.filter((f) => (f.type ? f.type === type : got.type === type && isAcceptedFormat(type, f.file))) ?? [];
      for (const f of files) {
        let bytes: number | undefined;
        try {
          bytes = fs.statSync(f.file).size;
        } catch {
          continue;
        }
        out.push({
          id: f.file,
          type,
          kind: f.kind,
          source: site.id,
          label: path.basename(f.file),
          detail: t('reçu : {title}', { title: offer.hit.title }),
          file: f.file,
          bytes,
          vpsId: offer.game.id,
          site: { hit: offer.hit, pack: offer.pack, received: true },
        });
      }
      if (files.length) continue;
      out.push({
        id: key,
        type,
        kind: offer.kind ?? defaultKind(type),
        source: site.id,
        label: offer.hit.title,
        detail: offer.hit.category?.label ?? (offer.pack ? t('pack de médias') : site.name),
        vpsId: offer.game.id,
        site: { hit: offer.hit, pack: offer.pack },
      });
    }
  }
  return out;
}
