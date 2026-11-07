// Règles d'une table, trouvées sans l'utilisateur (rubrique « Règles » de la fiche) :
// - le texte que l'auteur a rangé dans le .vpx (TableRules) ;
// - une feuille de règles publique : The Pinball Primer (que VPS désigne, champ tutorialFiles),
//   sinon Pinball Rule Sheets (pinballrulesheets.com, reconnue dans sa liste par titre et fabricant) ;
// - une vidéo d'explication sur YouTube (VPS, tutorialFiles).
//
// Ces feuilles sont écrites par des communautés et ne déclarent aucune licence : Cyber Pinball
// n'en livre aucune. Elles sont lues sur la machine du joueur quand il ouvre les règles, gardées
// dans un cache local (<données>\cache\regles), et toujours montrées avec leur source et leur adresse.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { vpsKey, type VpsGame, type VpsTutorial } from './vps';

export type RuleSite = 'primer' | 'rulesheets';

/** Sites de feuilles de règles, dans l'ordre où on les cherche. */
export const RULE_SITES: Record<RuleSite, { name: string; home: string }> = {
  primer: { name: 'The Pinball Primer', home: 'https://pinballprimer.github.io/' }, // i18n-ignore : nom propre
  rulesheets: { name: 'Pinball Rule Sheets', home: 'https://pinballrulesheets.com/' }, // i18n-ignore : nom propre
};

/** Liste des feuilles de pinballrulesheets.com, rangées par fabricant. */
export const RULESHEETS_LIST_URL = 'https://pinballrulesheets.com/rulesheet-master-list';

/** Une partie d'une feuille : son titre (h2 à h4) et ses lignes (paragraphes, points « • », rangées de tableau). */
export interface RuleBlock {
  heading?: string;
  level?: number;
  lines: string[];
}

export interface RuleSheet {
  site: RuleSite;
  url: string;
  /** Titre de la feuille (son h1). */
  title: string;
  blocks: RuleBlock[];
}

// ---------------------------------------------------------------------------
// Lecture d'une page de règles

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
  hellip: '…', times: '×', middot: '·', deg: '°', trade: '™', reg: '®', copy: '©', bull: '•', frac12: '½', frac14: '¼', frac34: '¾',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', rarr: '→', larr: '←', uarr: '↑', darr: '↓',
};

/** Entités HTML nommées courantes et numériques ; une entité inconnue reste telle quelle. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, e: string) => {
    if (e.startsWith('#')) {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** Éléments qui coupent le texte en lignes. */
const BREAKS = new Set(['p', 'div', 'tr', 'table', 'ul', 'ol', 'dl', 'dt', 'dd', 'blockquote', 'section', 'article', 'main', 'br', 'hr', 'pre', 'figure']);
/** Éléments dont le texte n'est pas la feuille : en-têtes et pieds du site, menus, scripts. */
const SKIPPED = new Set(['script', 'style', 'head', 'nav', 'header', 'footer', 'noscript', 'svg', 'button', 'form', 'select', 'iframe', 'title', 'template']);
const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'track']);

const clean = (s: string) => decodeEntities(s).replace(/\s+/g, ' ').trim();

/**
 * Feuille de règles tirée d'une page HTML : son titre (le premier h1 hors de l'en-tête du site),
 * puis ses parties (h2 à h4) et leurs lignes. Ni images ni liens : le texte seul.
 * Indéfinie si la page n'a ni titre ni texte.
 */
export function parseRuleSheet(html: string, site: RuleSite, url: string): RuleSheet | undefined {
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  let skip = 0;
  let title: string | undefined;
  const blocks: RuleBlock[] = [];
  let current: RuleBlock = { lines: [] };
  let text = '';
  let heading = 0;
  let headText = '';
  let bullet = false;
  const flush = () => {
    const line = clean(text).replace(/^(· )+|( ·)+$/g, '').trim();
    text = '';
    if (title !== undefined && line) {
      current.lines.push(bullet ? `• ${line}` : line);
      bullet = false;
    }
  };
  for (const m of source.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|([^<]+)/g)) {
    const [, closing, rawTag, chunk] = m;
    if (chunk !== undefined) {
      if (skip) continue;
      if (heading) headText += chunk;
      else text += chunk;
      continue;
    }
    const tag = rawTag!.toLowerCase();
    const selfClosing = m[0].endsWith('/>') || VOID.has(tag);
    if (SKIPPED.has(tag)) {
      if (!selfClosing) skip = Math.max(0, skip + (closing ? -1 : 1));
      continue;
    }
    if (skip) continue;
    const level = /^h([1-6])$/.exec(tag)?.[1];
    if (level) {
      if (!closing) {
        flush();
        heading = Number(level);
        headText = '';
        continue;
      }
      const name = clean(headText).replace(/\s*:$/, '');
      const n = heading || Number(level);
      heading = 0;
      if (!name) continue;
      if (title === undefined) {
        if (n === 1) title = name;
        continue;
      }
      if (current.heading || current.lines.length) blocks.push(current);
      current = { heading: name, level: Math.max(2, n), lines: [] };
      continue;
    }
    if (tag === 'li') {
      flush();
      bullet = !closing;
    } else if (tag === 'td' || tag === 'th') {
      if (closing) text += ' · ';
    } else if (BREAKS.has(tag)) flush();
    else if (heading) headText += ' ';
  }
  flush();
  if (current.heading || current.lines.length) blocks.push(current);
  // Sommaire en tête (les titres des parties, en liens) et lignes sans mot (cellules d'images) : rien à lire.
  const names = new Set(blocks.flatMap((b) => (b.heading ? [b.heading.toLowerCase()] : [])));
  for (const b of blocks) b.lines = b.lines.filter((l) => (l.match(/\p{L}/gu)?.length ?? 0) >= 3);
  const toc = blocks[0] && !blocks[0].heading ? blocks[0].lines.filter((l) => names.has(l.replace(/^• /, '').replace(/\s*:$/, '').toLowerCase())).length : 0;
  if (toc >= 2 && toc >= blocks[0]!.lines.length * 0.6) blocks.shift();
  // Une partie sans ligne ni sous-partie derrière elle ne dit rien.
  const kept = blocks.filter((b, i) => b.lines.length || (blocks[i + 1] && (blocks[i + 1]!.level ?? 2) > (b.level ?? 2)));
  if (!title || !kept.some((b) => b.lines.length)) return undefined;
  return { site, url, title, blocks: kept };
}

/**
 * Texte de règles rangé dans le .vpx par son auteur, en parties : sans la carte qu'il désigne
 * (`![…](image)`), titres « # » ou lignes finissant par « : » ; une ligne vide coupe un paragraphe.
 * Vide s'il ne reste presque rien (« Rules card in the table », un nom d'image).
 */
export function authorRuleBlocks(rules: string | undefined): RuleBlock[] {
  if (!rules) return [];
  const body = rules
    .replace(/\r\n?/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const blocks: RuleBlock[] = [];
  let current: RuleBlock = { lines: [] };
  let para: string[] = [];
  const end = () => {
    const line = para.join(' ').replace(/\s+/g, ' ').trim();
    para = [];
    if (line) current.lines.push(line);
  };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    // Titre souligné (« Preliminaries » puis « ===== ») : la ligne d'avant, seule dans son paragraphe,
    // est le titre ; sous un paragraphe plus long, c'est un simple filet.
    if (/^[=~*_-]{3,}$/.test(line)) {
      const title = para.length === 1 && para[0]!.length <= 60 ? para.pop() : undefined;
      end();
      if (title) {
        if (current.heading || current.lines.length) blocks.push(current);
        current = { heading: title.replace(/:$/, ''), level: 2, lines: [] };
      }
      continue;
    }
    // « Modes: » en tête de paragraphe ; au milieu d'un texte coupé à la main, c'est une fin de ligne.
    const head = /^#{1,6}\s+(.+)$/.exec(line)?.[1] ?? (!para.length && line.length <= 60 && /[^:]:$/.test(line) && !/^[-*•]/.test(line) ? line.slice(0, -1) : undefined);
    if (head) {
      end();
      if (current.heading || current.lines.length) blocks.push(current);
      current = { heading: head.trim(), level: 2, lines: [] };
    } else if (!line) end();
    else if (/^[-*•]\s+/.test(line)) {
      end();
      current.lines.push(`• ${line.replace(/^[-*•]\s+/, '')}`);
    } else para.push(line);
  }
  end();
  if (current.heading || current.lines.length) blocks.push(current);
  const letters = blocks.flatMap((b) => b.lines).join(' ').replace(/[^\p{L}\p{N}]/gu, '').length;
  return letters >= 40 ? blocks.filter((b) => b.lines.length) : [];
}

/** Un texte de règles est-il en anglais ? Petits mots anglais contre petits mots français. */
export function looksEnglish(blocks: readonly RuleBlock[]): boolean {
  const words = blocks.flatMap((b) => [b.heading ?? '', ...b.lines]).join(' ').toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ']+/g) ?? [];
  const count = (set: Set<string>) => words.filter((w) => set.has(w)).length;
  return count(EN_WORDS) > count(FR_WORDS) * 1.5;
}

const EN_WORDS = new Set(['the', 'and', 'to', 'of', 'you', 'is', 'for', 'with', 'shoot', 'ball', 'lit', 'when', 'each', 'will']);
const FR_WORDS = new Set(['le', 'la', 'les', 'et', 'des', 'du', 'une', 'pour', 'avec', 'est', 'bille', 'quand', 'chaque', 'tirer']);

// ---------------------------------------------------------------------------
// Pages

/**
 * Coupe des parties en pages d'environ `budget` caractères (un titre compte pour une ligne
 * courte) : une partie trop longue continue sur la page suivante, coupée entre deux lignes,
 * ou entre deux phrases quand une ligne seule dépasse la page. Le titre se répète, marqué `more`.
 */
export function paginateRules(blocks: readonly RuleBlock[], budget = 1100): (RuleBlock & { more?: boolean })[][] {
  const HEADING = 60;
  const pages: (RuleBlock & { more?: boolean })[][] = [];
  let page: (RuleBlock & { more?: boolean })[] = [];
  let used = 0;
  const newPage = () => {
    if (page.length) pages.push(page);
    page = [];
    used = 0;
  };
  for (const block of blocks) {
    const lines = block.lines.flatMap((l) => (l.length <= budget * 0.8 ? [l] : splitSentences(l, Math.floor(budget * 0.6))));
    // Un titre seul en bas de page part avec ce qui le suit.
    if (used && used + HEADING + Math.min(lines[0]?.length ?? 0, 200) > budget) newPage();
    let open: RuleBlock & { more?: boolean } = { heading: block.heading, level: block.level, lines: [] };
    page.push(open);
    used += block.heading ? HEADING : 0;
    for (const line of lines) {
      if (open.lines.length && used + line.length > budget) {
        newPage();
        open = { heading: block.heading, level: block.level, lines: [], more: true };
        page.push(open);
        used += block.heading ? HEADING : 0;
      }
      open.lines.push(line);
      used += line.length + 20;
    }
  }
  newPage();
  return pages;
}

function splitSentences(line: string, max: number): string[] {
  const parts = line.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) ?? [line];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length > max) {
      out.push(cur.trim());
      cur = '';
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ---------------------------------------------------------------------------
// Où sont les règles d'un jeu VPS

const linkOf = (f: VpsTutorial) => f.url ?? f.urls?.find((u) => !u.broken)?.url;

/** Page de The Pinball Primer que VPS donne pour ce jeu. */
export function primerUrl(game: VpsGame): string | undefined {
  for (const f of game.tutorialFiles ?? []) {
    const url = linkOf(f);
    if (url && /^https:\/\/pinballprimer\.github\.io\/[^/?#]+\.html$/i.test(url)) return url;
  }
  return undefined;
}

export interface RuleVideo {
  youtubeId: string;
  title?: string;
  authors?: string[];
  url: string;
}

/**
 * Vidéo d'explication sur YouTube que VPS donne pour ce jeu ; un tutoriel passe avant une
 * présentation (« overview », « review »).
 */
export function ruleVideo(game: VpsGame): RuleVideo | undefined {
  const videos = (game.tutorialFiles ?? []).flatMap((f) => {
    const id = f.youtubeId ?? /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/.exec(linkOf(f) ?? '')?.[1];
    return id && /^[\w-]{11}$/.test(id) ? [{ youtubeId: id, title: f.title, authors: f.authors, url: `https://www.youtube.com/watch?v=${id}` }] : [];
  });
  const rank = (v: RuleVideo) => (/tutorial|rules|how to|guide|instruction/i.test(v.title ?? '') ? 0 : /overview|review|gameplay/i.test(v.title ?? '') ? 2 : 1);
  return videos.sort((a, b) => rank(a) - rank(b))[0];
}

export interface RulesheetsEntry {
  /** Dossier du fabricant dans l'adresse (« stern », « jjp »…). */
  maker: string;
  title: string;
  url: string;
}

/** Feuilles de la liste de pinballrulesheets.com : `/<fabricant>/<nom>-rulesheet`. */
export function parseRulesheetsList(html: string): RulesheetsEntry[] {
  const out = new Map<string, RulesheetsEntry>();
  for (const m of html.matchAll(/<a\b[^>]*href="(\/([a-z0-9-]+)\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = clean(m[3]!.replace(/<[^>]+>/g, ''));
    if (title) out.set(m[1]!, { maker: m[2]!.toLowerCase(), title, url: new URL(m[1]!, RULE_SITES.rulesheets.home).href });
  }
  return [...out.values()];
}

/** Dossiers de pinballrulesheets.com et les fabricants de VPS qu'ils rangent. */
const MAKERS: Record<string, string[]> = {
  stern: ['stern'],
  jjp: ['jerseyjack'],
  'jersey-jack': ['jerseyjack'],
  american: ['americanpinball'],
  'american-pinball': ['americanpinball'],
  spooky: ['spooky'],
  multimorphic: ['multimorphic'],
  brothers: ['heighway', 'pinballbrothers'],
  'pinball-brothers': ['heighway', 'pinballbrothers'],
  williams: ['williams'],
  wms: ['williams'],
  de: ['dataeast'],
  'data-east': ['dataeast'],
  capcom: ['capcom'],
  gottlieb: ['gottlieb', 'premier'],
  chicago: ['chicagogaming'],
  'chicago-gaming': ['chicagogaming'],
  barrels: ['barrelsoffun'],
  'barrels-of-fun': ['barrelsoffun'],
  turner: ['turner'],
};

/**
 * Clés d'un titre : complet et sans article, sans l'édition (« (Pro) », « (LE) ») ; `main` ajoute le
 * titre principal (avant « - » ou « : »). Seul le titre du jeu VPS se réduit ainsi : « Avengers:
 * Infinity Quest » (2020) n'est pas « The Avengers » (2012).
 */
function titleKeys(name: string, main = false): string[] {
  const base = name.replace(/\s*\((pro|premium|le|limited edition|home edition|ce|se|vault edition)\)\s*$/i, '');
  const keys = [name, base, ...(main ? [base.split(/\s+-\s+|:\s+/)[0]!] : [])].flatMap((n) => [n, n.replace(/^(the|a|an)\s+/i, '')]);
  return [...new Set(keys.map(vpsKey).filter((k) => k.length >= 3))];
}

/** Feuille de pinballrulesheets.com pour ce jeu : même fabricant, même titre (celui de la feuille en entier). */
export function rulesheetsUrl(list: readonly RulesheetsEntry[], game: VpsGame): string | undefined {
  const maker = vpsKey(game.manufacturer ?? '');
  const mine = new Set(titleKeys(game.name, true));
  const exact = vpsKey(game.name);
  // Stern Pinball est né en 1999 : l'Iron Maiden de Stern Electronics (1982) est un autre jeu.
  if (maker.startsWith('stern') && (game.year ?? 9999) < 1999) return undefined;
  const candidates = list.filter((e) => (MAKERS[e.maker] ?? [e.maker.replace(/-/g, '')]).some((m) => maker.startsWith(m)) && titleKeys(e.title).some((k) => mine.has(k)));
  return (candidates.find((e) => vpsKey(e.title) === exact) ?? candidates[0])?.url;
}

// ---------------------------------------------------------------------------
// Cache local

/** Dossier des feuilles lues, sur la machine du joueur. */
export function rulesCacheDir(dataDir: string): string {
  return path.join(dataDir, 'cache', 'regles');
}

/** Une feuille relue au-delà de ce délai (elles changent peu). */
export const RULES_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export type RuleFetchStatus = 'ok' | 'offline' | 'missing';

export interface RuleFetchOptions {
  fetch?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  maxAgeMs?: number;
}

interface CachedText {
  url: string;
  fetchedAt: string;
  /** Absente : la page n'existe plus (404) ou n'est pas une feuille. */
  html?: string;
}

const cacheName = (url: string) => url.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '_').slice(0, 150) + '.json';

/**
 * Texte d'une page, gardé dans le cache : relu au réseau au-delà de `maxAgeMs` ; sans réseau,
 * la copie gardée sert telle quelle (`stale`). `missing` : la page n'existe pas (ou plus).
 */
export async function fetchCachedText(dir: string, url: string, opts: RuleFetchOptions = {}): Promise<{ status: RuleFetchStatus; html?: string; stale?: boolean }> {
  const file = path.join(dir, cacheName(url));
  const now = opts.now ?? new Date();
  let cached: CachedText | undefined;
  try {
    cached = JSON.parse(fs.readFileSync(file, 'utf8')) as CachedText;
  } catch {
    // Jamais lue.
  }
  if (cached && now.getTime() - Date.parse(cached.fetchedAt) < (opts.maxAgeMs ?? RULES_MAX_AGE_MS)) return cached.html ? { status: 'ok', html: cached.html } : { status: 'missing' };
  try {
    const response = await (opts.fetch ?? fetch)(url, { redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    if (response.status === 404 || response.status === 410) {
      fs.mkdirSync(dir, { recursive: true });
      writeFileAtomic(file, JSON.stringify({ url, fetchedAt: now.toISOString() } satisfies CachedText));
      return { status: 'missing' };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(file, JSON.stringify({ url, fetchedAt: now.toISOString(), html } satisfies CachedText));
    return { status: 'ok', html };
  } catch {
    if (cached?.html) return { status: 'ok', html: cached.html, stale: true };
    return { status: 'offline' };
  }
}

export interface FoundSheet {
  status: RuleFetchStatus | 'none';
  sheet?: RuleSheet;
}

/**
 * Feuille de règles d'un jeu : The Pinball Primer si VPS en donne une, sinon celle de
 * pinballrulesheets.com reconnue dans sa liste. `none` : aucune n'existe pour ce jeu ;
 * `offline` : il y en a peut-être une, mais le réseau ne répond pas et rien n'est gardé.
 */
export async function findRuleSheet(dataDir: string, game: VpsGame, opts: RuleFetchOptions = {}): Promise<FoundSheet> {
  const dir = rulesCacheDir(dataDir);
  let offline = false;
  const primer = primerUrl(game);
  if (primer) {
    const got = await fetchCachedText(dir, primer, opts);
    const sheet = got.html ? parseRuleSheet(got.html, 'primer', primer) : undefined;
    if (sheet) return { status: 'ok', sheet };
    offline ||= got.status === 'offline';
  }
  const list = await fetchCachedText(dir, RULESHEETS_LIST_URL, { ...opts, maxAgeMs: Math.min(opts.maxAgeMs ?? RULES_MAX_AGE_MS, 7 * 24 * 3600 * 1000) });
  offline ||= list.status === 'offline';
  const url = list.html ? rulesheetsUrl(parseRulesheetsList(list.html), game) : undefined;
  if (url) {
    const got = await fetchCachedText(dir, url, opts);
    const sheet = got.html ? parseRuleSheet(got.html, 'rulesheets', url) : undefined;
    if (sheet) return { status: 'ok', sheet };
    offline ||= got.status === 'offline';
  }
  return { status: offline ? 'offline' : 'none' };
}
