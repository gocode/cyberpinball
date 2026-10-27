// Fiches des fichiers de la base VPS sur leur site : ce qu'il faut pour choisir entre
// plusieurs frontons, tables, ROM, PuP-Packs, couleurs ou sons d'un jeu. La base VPS ne
// donne que l'auteur, la version, la date et, pour les tables et les frontons seulement,
// une vignette ; ni téléchargements ni note. La fiche du site les donne, en visiteur :
//
// - VPUniverse (Invision Community) : une description schema.org (JSON-LD) dans la page,
//   avec téléchargements, vues, note sur 5 et nombre d'avis, auteur, version, date, taille,
//   catégorie et captures déposées par l'auteur ;
// - VPForums (IP.Downloads) : le bloc « File Information » (téléchargements, vues, dates,
//   taille, auteurs), les étoiles et le nombre de votes sous le titre, la capture de l'auteur.
//
// Pages témoins : test-pages/vpuniverse-fiche.html, vpforums-fiche.html (27/10/2026).
// Le 27/10/2026, « Fronton (.directb2s) : au choix » de The Matrix ne montrait qu'une liste
// de noms : ni aperçu, ni téléchargements. Les écrans de choix d'un fichier passent tous par
// la même galerie (app/src/file-gallery.ts), et webFileTile en dit le contenu.

import { formatDay, liveLinks, linkHost, versionLabel, type NeedKind } from './acquisition';
import { formatNumber, t, tn } from './i18n';
import type { MediaSiteId } from './mediasites';
import type { VpsTableFile } from './vps';

/** Une fiche reconnue : son site, son numéro, son adresse sans session. */
export interface SiteFileRef {
  site: MediaSiteId;
  id: string;
  url: string;
}

/** Ce que la fiche d'un fichier dit de lui. */
export interface SiteFileInfo extends SiteFileRef {
  title?: string;
  authors?: string[];
  version?: string;
  /** Publication et dernière mise à jour (ISO). */
  date?: string;
  updated?: string;
  /** Taille, telle que la page l'écrit (« 4.67 MB »). */
  size?: string;
  category?: string;
  downloads?: number;
  views?: number;
  /** Note moyenne sur 5 et nombre d'avis ; absente sans avis. */
  rating?: { value: number; count: number };
  /** Capture déposée par l'auteur, et sa vignette. */
  screenshot?: string;
  thumb?: string;
}

/** Fiche d'un fichier de VPUniverse ou de VPForums ; undefined pour tout autre lien (Dropbox, Mega…). */
export function siteFileRef(url: string): SiteFileRef | undefined {
  const vpu = /^https?:\/\/(?:www\.)?vpuniverse\.com\/files\/file\/(\d+)(-[^/?#]*)?/i.exec(url);
  if (vpu) return { site: 'vpuniverse', id: vpu[1]!, url: `https://vpuniverse.com/files/file/${vpu[1]}${vpu[2] ?? ''}/` };
  const vpf = /^https?:\/\/(?:www\.)?vpforums\.org\/index\.php\?(?:[^#]*&)?showfile=(\d+)/i.exec(url);
  if (vpf) return { site: 'vpforums', id: vpf[1]!, url: `https://www.vpforums.org/index.php?app=downloads&showfile=${vpf[1]}` };
  return undefined;
}

/** Fiche du premier lien vivant d'un fichier de la base VPS. */
export function fileRefOf(file: Pick<VpsTableFile, 'urls'>): SiteFileRef | undefined {
  for (const link of liveLinks(file)) {
    const ref = siteFileRef(link.url);
    if (ref) return ref;
  }
  return undefined;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
const text = (html: string) => decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\r]+/g, ' ').trim();
const count = (s: string | undefined) => (s && /\d/.test(s) ? Number(s.replace(/[^\d]/g, '')) : undefined);

/** Fiche de VPUniverse : la description schema.org de la page (type WebApplication). */
function parseInvision(ref: SiteFileRef, html: string): SiteFileInfo | undefined {
  for (const m of html.matchAll(/<script type=['"]application\/ld\+json['"]>([\s\S]*?)<\/script>/gi)) {
    let ld: Record<string, unknown>;
    try {
      ld = JSON.parse(m[1]!) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (ld['@type'] !== 'WebApplication') continue;
    const stats = Array.isArray(ld.interactionStatistic) ? (ld.interactionStatistic as { interactionType?: string; userInteractionCount?: number }[]) : [];
    const stat = (kind: string) => stats.find((s) => typeof s.interactionType === 'string' && s.interactionType.endsWith(kind))?.userInteractionCount;
    const rating = ld.aggregateRating as { ratingValue?: number | string; reviewCount?: number | string } | undefined;
    const value = Number(rating?.ratingValue);
    const reviews = Number(rating?.reviewCount);
    const shots = Array.isArray(ld.screenshot) ? (ld.screenshot as { url?: string; thumbnail?: { url?: string } }[]) : [];
    const author = (ld.author as { name?: string } | undefined)?.name;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? decode(v.trim()) : undefined);
    return {
      ...ref,
      title: str(ld.name),
      authors: author ? [decode(author)] : undefined,
      version: str(ld.softwareVersion),
      date: str(ld.dateCreated),
      updated: str(ld.dateModified),
      size: str(ld.fileSize),
      category: str(ld.applicationCategory),
      downloads: typeof stat('DownloadAction') === 'number' ? stat('DownloadAction') : undefined,
      views: typeof stat('ViewAction') === 'number' ? stat('ViewAction') : undefined,
      rating: value > 0 && reviews > 0 ? { value, count: reviews } : undefined,
      screenshot: str(shots[0]?.url),
      thumb: str(shots[0]?.thumbnail?.url) ?? str(shots[0]?.url),
    };
  }
  return undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** « Nov 04 2018 05:53 AM » (heure du forum, prise pour UTC : seule la date compte) en ISO. */
function ipbDate(s: string | undefined): string | undefined {
  const m = s && /([A-Za-z]{3})\w*\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/.exec(s);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return undefined;
  let hour = Number(m[4] ?? 0) % 12;
  if (m[6]?.toUpperCase() === 'PM') hour += 12;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5] ?? 0))).toISOString();
}

/** Fiche de VPForums : bloc « File Information », étoiles et votes sous le titre, capture de l'auteur. */
function parseIpBoard(ref: SiteFileRef, html: string): SiteFileInfo | undefined {
  const field = (name: string) => {
    const m = new RegExp(`<strong class=['"]title['"]>\\s*${name}:?\\s*</strong>([\\s\\S]*?)</li>`, 'i').exec(html);
    return m ? text(m[1]!) : undefined;
  };
  const downloads = count(field('Downloads'));
  const head = /<h1 class=['"]ipsType_pagetitle['"]>([\s\S]*?)<\/h1>/i.exec(html);
  // Ni bloc d'informations ni titre : page de connexion, fiche disparue, page d'erreur.
  if (downloads === undefined && !head) return undefined;
  const title = head ? text(head[1]!.replace(/<a [^>]*>[\s\S]*?<\/a>/gi, ' ')) : undefined;
  const after = head ? html.slice(head.index + head[0].length, head.index + head[0].length + 4000) : '';
  const stars = [...after.matchAll(/<img [^>]*src=['"][^'"]*\/(star(?:_off|_half|_rated)?)\.png['"][^>]*class=['"]rate_img['"]/gi)].map((s) => s[1]!.toLowerCase());
  const votes = count(/id=['"]rating_text['"][^>]*>\s*([\d,]+)\s*Votes?/i.exec(after)?.[1]);
  const lit = stars.filter((s) => s === 'star' || s === 'star_rated').length + stars.filter((s) => s === 'star_half').length / 2;
  // Capture du fichier lui-même (id=<numéro>), jamais la vignette d'un autre fichier du même auteur.
  const shot = [...html.matchAll(/<img [^>]*src=['"]([^'"]*section=screenshot[^'"]*)['"][^>]*>/gi)].map((s) => [decode(s[1]!), s[0]] as const).find(([src, tag]) => new RegExp(`[?&]id=${ref.id}(?:&|$)`).test(src) && !/\bmini\b/.test(tag));
  const authors = field('Author\\(s\\)')
    ?.split('\n')
    .map((a) => a.trim())
    .filter(Boolean);
  const clean = shot ? shot[0].replace(/([?&])s=[0-9a-f]+&/i, '$1') : undefined;
  return {
    ...ref,
    title: title || undefined,
    authors: authors?.length ? authors : undefined,
    date: ipbDate(field('Submitted')),
    updated: ipbDate(field('Last Updated')),
    size: field('File Size'),
    downloads,
    views: count(field('Views')),
    rating: votes && stars.length ? { value: Math.round((lit / stars.length) * 5 * 10) / 10, count: votes } : undefined,
    screenshot: clean,
    thumb: clean,
  };
}

/** Ce que la page d'une fiche dit du fichier ; undefined si elle ne le dit pas (connexion, erreur, autre forme). */
export function parseSiteFile(ref: SiteFileRef, html: string): SiteFileInfo | undefined {
  return ref.site === 'vpuniverse' ? parseInvision(ref, html) : parseIpBoard(ref, html);
}

// ---------------------------------------------------------------------------
// Tuile d'un fichier à choisir

/** Format de l'aperçu d'un fichier, celui de ce qu'il montre : table en hauteur, fronton 4:3, couleurs du DMD 4:1 ; une ROM n'a qu'une photo de puce, en 4:3. */
export const FILE_PREVIEW_ASPECT: Record<NeedKind, string> = {
  table: '3 / 4',
  b2s: '4 / 3',
  rom: '4 / 3',
  altcolor: '4 / 1',
  pup: '16 / 9',
  altsound: '16 / 9',
  music: '16 / 9',
  topper: '3 / 1',
  pov: '16 / 9',
  media: '16 / 9',
};

/** Ce que la fiche du site en est : lue, en lecture, disparue du site (404), ou rien à lire (autre site, page muette). */
export type SiteFileState = SiteFileInfo | 'loading' | 'gone' | undefined;

/** Ce que montre la tuile d'un fichier à choisir, et son détail sous la galerie. */
export interface WebFileTile {
  title: string;
  /** « 1 435 téléchargements · 4,5/5 » ; absent si le site ne le dit pas (ou pas encore). */
  popularity?: string;
  /** Date et site, sous la popularité. */
  facts: string;
  /** Lignes du détail : auteurs et version ; avis, vues, taille, compte, catégorie ; état de la fiche ; caractéristiques ; commentaire. */
  detail: string[];
  /** Aperçus, le meilleur d'abord : vignette de la base VPS, sinon capture de l'auteur sur son site. */
  previews: string[];
  /** Date retenue pour le tri (ms) : celle de la base VPS, sinon celle du site. */
  date?: number;
  downloads?: number;
  /** La fiche n'existe plus sur son site : le fichier en a sans doute été retiré. */
  gone?: boolean;
}

/** « 4,5/5 » */
const ratingText = (r: { value: number }) => t('{value}/5', { value: formatNumber(r.value, { maximumFractionDigits: 1 }) });

/** Popularité d'une fiche : téléchargements, puis note s'il y a des avis. */
export function filePopularity(info: Pick<SiteFileInfo, 'downloads' | 'rating'> | undefined): string | undefined {
  if (!info) return undefined;
  const parts = [info.downloads !== undefined ? tn(info.downloads, '{n} téléchargement', '{n} téléchargements') : undefined, info.rating ? ratingText(info.rating) : undefined].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Nom d'un fichier dans une liste : ROM par son nom, le reste par ses auteurs et sa version. */
export function fileTitle(kind: NeedKind, file: Pick<VpsTableFile, 'authors' | 'version'>): string {
  return kind === 'rom' ? (file.version ?? 'ROM') : versionLabel(file);
}

/** Tuile d'un fichier de la base VPS, enrichie de ce que dit sa fiche quand le site la donne. */
export function webFileTile(kind: NeedKind, file: VpsTableFile, info: SiteFileState): WebFileTile {
  const link = liveLinks(file)[0];
  const host = link ? linkHost(link.url) : undefined;
  const page = typeof info === 'object' ? info : undefined;
  // La date de la base VPS quand elle la donne : elle ne change pas à l'arrivée de la fiche (l'ordre reste stable).
  const parsed = page?.date ? Date.parse(page.updated ?? page.date) : NaN;
  const date = file.updatedAt ?? (Number.isFinite(parsed) ? parsed : undefined);
  const facts = [date ? t('le {date}', { date: formatDay(date) }) : undefined, host?.label].filter(Boolean).join(' · ');
  const popularity = filePopularity(page);
  const authors = page?.authors?.length && !(file.authors ?? []).length ? page.authors : file.authors;
  const version = file.version ?? page?.version;
  // Le détail dit ce que la tuile ne montre pas : la tuile a déjà le nom, la popularité, la date et le site.
  let said: string | undefined;
  if (info === 'loading') said = t('Téléchargements et note : lecture de sa fiche sur {site}…', { site: host?.label ?? '' });
  else if (info === 'gone') said = t('Sa fiche n’existe plus sur {site} : le fichier en a sans doute été retiré.', { site: host?.label ?? '' });
  else if (page && !popularity) said = t('Sa fiche ne dit ni téléchargements ni note.');
  else if (!page && host && !fileRefOf(file)) said = t('{site} ne dit ni téléchargements ni note.', { site: host.label });
  const detail = [
    [authors?.length ? t('par {authors}', { authors: authors.join(', ') }) : undefined, version && kind !== 'rom' ? t('version {version}', { version }) : undefined].filter(Boolean).join(' · '),
    [
      page?.rating ? tn(page.rating.count, 'note {value}/5 sur {n} avis', 'note {value}/5 sur {n} avis', { value: formatNumber(page.rating.value, { maximumFractionDigits: 1 }) }) : undefined,
      page?.views !== undefined ? tn(page.views, '{n} vue', '{n} vues') : undefined,
      page?.size,
      host?.account ? t('compte nécessaire') : undefined,
      page?.category,
    ]
      .filter(Boolean)
      .join(' · '),
    said ?? '',
    [...(file.features ?? []).slice(0, 6), file.comment].filter(Boolean).join(' · '),
  ].filter(Boolean);
  const previews = [file.imgUrl, page?.thumb, page?.screenshot].filter((u, i, all): u is string => Boolean(u) && all.indexOf(u) === i);
  return { title: fileTitle(kind, file), popularity, facts, detail, previews, date, downloads: page?.downloads, gone: info === 'gone' || undefined };
}

/** Ordre d'une liste de fichiers : celui de l'écran (conseillé), le plus téléchargé, le plus récent. */
export type FileSort = 'advised' | 'popularity' | 'date';

/**
 * Fichiers triés : stable, l'ordre conseillé départage. Popularité : les plus téléchargés
 * d'abord, les inconnus à la fin ; date : la plus récente d'abord.
 */
export function sortWebFiles<T>(items: readonly T[], sort: FileSort, tile: (item: T) => Pick<WebFileTile, 'date' | 'downloads'>): T[] {
  if (sort === 'advised') return [...items];
  const key = (item: T) => (sort === 'popularity' ? (tile(item).downloads ?? -1) : (tile(item).date ?? -1));
  return items
    .map((item, i) => ({ item, i, k: key(item) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.item);
}
