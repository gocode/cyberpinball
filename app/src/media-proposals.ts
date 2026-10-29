// Propositions pour un média d'un jeu (fiche > Médias du jeu > un média > « Voir les
// propositions ») : au lieu d'un seul fichier choisi d'office, toutes les versions
// trouvées, chacune avec son aperçu, d'où elle vient et pourquoi :
//
// - VPinMediaDB, pour chaque jeu retenu par la recherche approfondie (le jeu reconnu,
//   ses autres éditions, les jeux proches que l'utilisateur ajoute) : vidéo ou image,
//   1k ou 4k ;
// - ce que la table a déjà : PuP-Pack, dossier du DMD, image du .directb2s ;
// - les sites communautaires, avec le compte de l'utilisateur (media-sites.ts) :
//   VPForums, puis VPUniverse en dernier recours (environ 45 s d'attente par fichier).
//   Une fiche choisie part dans la file de son site ; reçue, elle se choisit comme un
//   fichier de la borne, et la carte qui l'a demandée la met d'elle-même dans le brouillon ;
// - le web, quand rien de tout cela ne convient : « Chercher sur le web… » ouvre la
//   recherche libre du média (media-web.ts) ; ce que l'utilisateur y télécharge est vérifié
//   et montré sur son écran « Reçu », puis reste ici, en tête des propositions.
//
// Chaque site dit combien de ses résultats servent à ce média, et à quels autres écrans
// vont les autres. Un afficheur que la borne ne montre pas (Afficheur 4:1 sur un écran
// 16:9) le dit, avec un passage direct aux propositions de l'autre.
//
// « Autres jeux… » montre les jeux possibles avec leurs raisons et leur logo, pour en
// ajouter ou en retirer, et permet de chercher un autre titre au clavier. Le choix va
// dans le brouillon du gestionnaire, comme un fichier pris dans le dossier d'import :
// rien n'est écrit avant « Enregistrer », et le plan le montre d'abord. Un fichier de
// VPinMediaDB est téléchargé et vérifié au moment du choix, puis rangé à
// l'enregistrement avec sa provenance dans le .info.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createTransferMeter,
  formatDate,
  formatSize,
  formatTransfer,
  transferPercent,
  listRecordings,
  localMediaChoices,
  MEDIA_SITES,
  mediaSite,
  mediaChoiceKey,
  pagesSignature,
  siteHitSummary,
  siteMediaChoices,
  siteQuery,
  webHost,
  webMediaChoices,
  type MediaPlacement,
  type MediaSiteId,
  type SiteHit,
  type SiteState,
  lowerFirst,
  MEDIA_CHOICE_SOURCE_LABELS,
  MEDIADB_NAME,
  isAudioFile,
  mediaDbChoices,
  vpsMusicChoices,
  mediaDbOffers,
  vpsImageChoices,
  VPS_IMAGE_ORIGIN,
  mediaDbStagedFile,
  mediaOriginOf,
  mediaTypeInfo,
  mediaUrl,
  mergeMediaChoices,
  playfieldMediaRotation,
  readMediaDimensions,
  samePath,
  t,
  tn,
  vpsLabel,
  type B2sSource,
  type MediaChoice,
  type MediaChoices,
  type MediaDbEntry,
  type MediaDbFile,
  type GameLead,
  type VpsGame,
  type MediaDbQualityChoice,
  type MediaPageEntry,
  type MediaType,
  type TableEntry,
  MANAGED_MEDIA_TYPES,
} from '@cyberpinball/core';
import type { Action, Built, LibraryHost, Row, Section, Tone } from './library';
import type { MediaCard, MediaThumb } from './library-medias';
import { allowPreview } from './media-protocol';
import type { DeepResult, MediaSearch } from './media-search';
import { jobKey, type MediaSites, type SiteJob } from './media-sites';

export interface ProposalsContext {
  host: LibraryHost;
  search: MediaSearch;
  /** Opération longue : message à l'écran, touches ignorées. */
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  progress(message: string): void;
  prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  /** Avertissement de VPinMediaDB (aucune licence), lu une fois avant le premier téléchargement. */
  withNotice(then: () => void, back: () => void): void;
  /** Affiche un écran des médias (le message prévu pour lui remplace l'ancien). */
  show(build: () => Built, at?: number): void;
  cursor(): number;
  find(file: string): TableEntry | undefined;
  /** Aperçu et caractéristiques d'un fichier local, comme sur les autres écrans des médias. */
  thumb(table: TableEntry, type: MediaType, file: string): MediaThumb;
  facts(file: string): string;
  /** Pages du brouillon pour ce type, et fichiers montrés aujourd'hui. */
  pages(table: TableEntry, type: MediaType): MediaPageEntry[];
  current(table: TableEntry, type: MediaType): string[];
  /** Met l'entrée dans le brouillon (remplace le média, ou ajoute une page) ; renvoie la phrase à montrer. */
  place(table: TableEntry, type: MediaType, entry: MediaPageEntry): string;
  /** Chaque .directb2s du dossier et ses images (fronton allumé, tout allumé), extraites par le gestionnaire. */
  b2s(table: TableEntry): Promise<B2sSource[]>;
  /** Retour à l'écran du média, avec un message. */
  back(type: MediaType, message?: { text: string; tone: Tone }): void;
  /** Sites communautaires (compte de l'utilisateur) ; absent : pas de fenêtre « Récupérer » (essais). */
  sites?: MediaSites;
  /** Le gestionnaire des médias est ouvert sur cette table (son brouillon existe). */
  active(table: TableEntry): boolean;
  /** Où ce média s'affiche sur la borne, et s'il s'y voit (l'autre afficheur passe avant lui). */
  placement(type: MediaType): MediaPlacement;
  /** Recherche libre du média (media-web.ts) ; `title` : le titre cherché ici, s'il y en a un. */
  web?: { open(table: TableEntry, type: MediaType, title?: string): string; detail(table: TableEntry, type: MediaType, title?: string): string };
  /** Enregistrement du brouillon : nombre de changements, et le plan à valider. */
  save?: { changes(table: TableEntry): number; open(): void };
}

/**
 * Format de l'aperçu en galerie : celui de l'écran qui montre le média (le plateau vu du
 * joueur, en hauteur ; l'afficheur étroit, en bandeau) ; l'aperçu y tient entier.
 */
const PREVIEW_ASPECT: Partial<Record<MediaType, string>> = {
  Wheel: '1 / 1',
  Playfield: '3 / 4',
  Backglass: '4 / 3',
  DMD: '4 / 1',
  FullDMD: '16 / 9',
  Topper: '3 / 1',
  Loading: '16 / 9',
  GameInfo: '3 / 4',
  GameHelp: '3 / 4',
};

/** Ordre des propositions : le jeu le plus probable d'abord, ou les plus téléchargées sur leur site. */
export type ProposalSort = 'relevance' | 'popularity';

/**
 * Propositions triées par popularité : les fiches des sites par téléchargements, du plus au
 * moins ; celles qui n'en disent rien (VPinMediaDB, la borne, la base VPS) ensuite, dans
 * leur ordre. Le tri est stable : deux fiches à égalité gardent leur rang.
 */
export function sortProposals<T extends Pick<MediaChoice, 'site'>>(choices: T[], sort: ProposalSort): T[] {
  if (sort === 'relevance') return choices;
  const n = (c: T) => c.site?.hit.downloads ?? -1;
  return choices.map((c, i) => ({ c, i })).sort((a, b) => n(b.c) - n(a.c) || a.i - b.i).map((x) => x.c);
}

/** Ce qu'un site a donné pour les jeux retenus. */
interface SiteSearch {
  /** Connexion au site, d'après les cookies de la session. */
  account: SiteState;
  /** Recherche réservée aux membres et utilisateur pas connecté. */
  login?: boolean;
  /** Site injoignable, vérification à faire, page illisible. */
  problem?: string;
  /** Textes cherchés. */
  queries: string[];
  hits: SiteHit[];
}

/** Un jeu possible qui a des médias : sur VPinMediaDB, ou des vignettes dans la base VPS. */
interface Game {
  lead: GameLead;
  entry?: MediaDbEntry;
}

interface State {
  file: string;
  deep?: DeepResult;
  /** Jeux possibles qui ont des médias, le plus probable d'abord. */
  games: Game[];
  /** L'index de VPinMediaDB n'a pas pu être chargé : vignettes VPS et médias de la borne seulement. */
  problem?: string;
  /** Jeux dont les médias sont proposés (identifiants VPS). */
  included: string[];
  query?: string;
  quality: MediaDbQualityChoice;
  local: MediaChoices;
  /** Adresse d'un fichier de VPinMediaDB -> aperçu reçu et vérifié. */
  previews: Map<string, string>;
  sizes: Map<string, number>;
  /** Adresses qui ont renvoyé autre chose que le fichier attendu (lien mort). */
  dead: Set<string>;
  /** Résultats des sites communautaires. */
  sites: Partial<Record<MediaSiteId, SiteSearch>>;
  /** Message de l'écran des propositions (file, connexion), montré jusqu'au suivant. */
  notice?: { text: string; tone: Tone };
}

/** Le média qui suit (ou précède) celui-ci parmi ceux que la borne montre, en boucle. */
function neighborType(type: MediaType, step: 1 | -1, shown: (type: MediaType) => boolean): MediaType | undefined {
  const list = MANAGED_MEDIA_TYPES.filter((t) => t === type || shown(t));
  const at = list.indexOf(type);
  if (at < 0 || list.length < 2) return undefined;
  return list[(at + step + list.length) % list.length];
}

/** Vignettes de la base VPS d'un jeu (plateaux et frontons). */
function vpsImageCount(game: VpsGame): number {
  return [...(game.tableFiles ?? []), ...(game.b2sFiles ?? [])].filter((f) => typeof f.imgUrl === 'string').length;
}

/** Au plus, des jeux proposés d'office : le reste s'ajoute depuis « Autres jeux… ». */
const DEFAULT_GAMES = 4;

export function createProposals(ctx: ProposalsContext) {
  let state: State | undefined;
  /** Tri choisi, gardé d'un média à l'autre pendant la visite. */
  let sort: ProposalSort = 'relevance';

  // ---------- Recherche ----------

  /** Jeux proposés d'office : le premier, ses autres éditions, et ceux presque aussi probables. */
  function defaults(games: Game[]): string[] {
    const [first, ...rest] = games;
    if (!first) return [];
    const ids = [first.lead.game.id];
    for (const g of rest) {
      if (ids.length >= DEFAULT_GAMES) break;
      if (g.lead.siblingOf === first.lead.game.id || g.lead.score >= Math.max(0.75, first.lead.score - 0.15)) ids.push(g.lead.game.id);
    }
    return ids;
  }

  /** Recherche pour cette table, faite une fois par visite du gestionnaire (ou refaite avec un titre saisi). */
  async function ensure(table: TableEntry, query?: string): Promise<State> {
    if (state && state.file === table.file && query === undefined) return state;
    const previous = state?.file === table.file ? state : undefined;
    const evidence = await ctx.search.evidence(table);
    ctx.progress(t('Médias déjà sur la borne : .directb2s (fronton allumé, ampoules), PuP-Pack, DMD, images du .vpx…'));
    const local = localMediaChoices(table, {
      b2s: await ctx.b2s(table),
      dmdFolder: evidence.script?.dmdFolder,
      screenshot: ctx.search.screenshot(table),
      vpxImages: ctx.search.vpxImages(table),
      recordings: listRecordings(ctx.host.dataDir, table),
    });
    const next: State = {
      file: table.file,
      games: [],
      included: [],
      quality: ctx.search.quality(),
      local,
      previews: previous?.previews ?? new Map(),
      sizes: previous?.sizes ?? new Map(),
      dead: previous?.dead ?? new Set(),
      query,
      sites: previous?.sites ?? {},
    };
    ctx.progress(t('Recherche sur VPinMediaDB…'));
    const { db, problem } = await ctx.search.index();
    if (!db) next.problem = problem ?? t('GitHub injoignable');
    ctx.progress(query ? t('Recherche de « {query} »…', { query }) : t('Recherche approfondie : nom écrit dans la table, ROM, PuP-Pack…'));
    next.deep = await ctx.search.deep(table, db, query);
    const entries = new Map(next.deep.candidates.map((c) => [c.entry.id, c.entry]));
    next.games = next.deep.leads.flatMap((lead) => {
      const entry = entries.get(lead.game.id);
      return entry || vpsImageCount(lead.game) ? [{ lead, entry }] : [];
    });
    // Un titre saisi : son premier jeu s'ajoute à ceux déjà retenus.
    const kept = (previous?.included ?? []).filter((id) => next.games.some((g) => g.lead.game.id === id));
    // Le premier jeu que désigne la saisie (pas le jeu de la table, toujours en tête de la liste).
    const typed = query ? next.games.find((g) => g.lead.matchedQuery)?.lead.game.id : undefined;
    next.included = query ? [...new Set([...kept, ...(typed ? [typed] : [])])] : defaults(next.games);
    state = next;
    return next;
  }

  const includedGames = (st: State) => st.games.filter((g) => st.included.includes(g.lead.game.id));

  /**
   * En ligne d'abord (VPinMediaDB), puis ce que la borne a, puis les sites (VPForums,
   * puis VPUniverse, lent), puis les vignettes VPS, en basse définition.
   */
  function choicesFor(st: State, type: MediaType): MediaChoice[] {
    const games = includedGames(st);
    const mediadb = mediaDbChoices(
      games.flatMap((g) => (g.entry ? [{ entry: g.entry, game: g.lead.game }] : [])),
      st.quality.quality,
    );
    const vpsGames = games.map((g) => g.lead.game);
    const sites = ctx.sites
      ? siteMediaChoices(
          type,
          MEDIA_SITES.map((s) => ({ site: s.id, hits: st.sites[s.id]?.hits ?? [] })),
          vpsGames,
          st.deep?.vps,
          (key) => ctx.sites!.receipt(key),
        )
      : [];
    // Téléchargés par l'utilisateur depuis la recherche web : en tête, il les a cherchés exprès.
    const web = ctx.sites ? webMediaChoices(type, ctx.sites.webReceipts(), st.file) : [];
    return [...web, ...(mergeMediaChoices(mediadb, st.local)[type] ?? []), ...sites, ...(mergeMediaChoices(vpsImageChoices(vpsGames), vpsMusicChoices(vpsGames))[type] ?? [])];
  }

  /** Textes à chercher sur les sites : le titre (sans sous-titre) de chaque jeu retenu, ou la saisie. */
  function siteQueries(st: State): string[] {
    const names = st.query ? [st.query] : includedGames(st).map((g) => g.lead.game.name);
    return [...new Set(names.map(siteQuery).filter(Boolean))].slice(0, 3);
  }

  /**
   * Recherche sur chaque site, pour les jeux retenus et le média ouvert : trois pages au
   * plus par titre, gardées une demi-heure. VPForums réserve sa recherche aux membres ;
   * VPUniverse montre ses résultats à tous, mais ne laisse télécharger qu'avec un compte.
   */
  async function searchSites(st: State, type: MediaType): Promise<void> {
    const sites = ctx.sites;
    if (!sites) return;
    const queries = siteQueries(st);
    for (const site of MEDIA_SITES) {
      const account = await sites.state(site.id);
      const found: SiteSearch = { account, queries, hits: [] };
      st.sites[site.id] = found;
      if (!queries.length) continue;
      if (site.searchNeedsLogin && !account.connected) {
        found.login = true;
        continue;
      }
      for (const q of queries) {
        ctx.progress(t('Recherche sur {site} : « {query} »…', { site: site.name, query: q }));
        const r = await sites.search(site.id, q, type);
        if (r.kind === 'hits') found.hits.push(...r.hits.filter((h) => !found.hits.some((k) => k.id === h.id)));
        else if (r.kind === 'login') found.login = true;
        else
          found.problem =
            r.reason === 'challenge'
              ? t('le site fait une vérification (Cloudflare)')
              : r.reason === 'down'
                ? t('le site ne répond pas pour l’instant')
                : r.reason === 'flood'
                  ? t('le site impose d’attendre entre deux recherches : réessayez dans {n} s', { n: r.wait })
                  : t('page de résultats illisible');
      }
    }
  }

  /** Aperçus (image 1k, ou le son lui-même) et poids des propositions de VPinMediaDB pour ce type ; vignettes des sites. */
  async function prepareType(st: State, type: MediaType): Promise<void> {
    await searchSites(st, type);
    if (ctx.sites) {
      ctx.progress(t('Vignettes des sites…'));
      await ctx.sites.stageThumbs(choicesFor(st, type).flatMap((c) => (c.site && !c.site.received ? [c.site.hit] : [])));
    }
    const remote = choicesFor(st, type).filter((c) => c.offer);
    const previews = remote.flatMap((c) => (c.offer!.kind === 'audio' ? [c.offer!.file] : c.offer!.preview ? [c.offer!.preview] : []));
    await ctx.search.stagePreviews(previews, st.previews);
    // Un son reçu qui n'en est pas un (lien Dropbox mort : page HTML) : effacé, la carte le dit.
    for (const c of remote) {
      const got = c.offer!.kind === 'audio' ? st.previews.get(c.offer!.file.url) : undefined;
      if (got && !isAudioFile(got)) {
        fs.rmSync(got, { force: true });
        st.previews.delete(c.offer!.file.url);
        st.dead.add(c.offer!.file.url);
      }
    }
    const unknown = remote.map((c) => c.offer!.file).filter((f) => !st.sizes.has(f.url));
    if (unknown.length) for (const [url, size] of await ctx.search.sizes(unknown)) st.sizes.set(url, size);
  }

  // ---------- Écran des propositions ----------

  function open(table: TableEntry, type: MediaType, at = 0): void {
    void ctx.task(t('Recherche des propositions…'), async () => {
      const st = await ensure(table);
      // Le message d'un autre média ne suit pas.
      st.notice = undefined;
      await prepareType(st, type);
      ctx.show(() => build(type), at);
    });
  }

  /** Après un changement de jeux ou une recherche : les aperçus de ce type, puis l'écran. */
  function reopen(table: TableEntry, type: MediaType, at = 0): void {
    void ctx.task(t('Aperçus…'), async () => {
      await prepareType(await ensure(table), type);
      ctx.show(() => build(type), at);
    });
  }

  function remoteThumb(st: State, choice: MediaChoice): MediaThumb {
    const offer = choice.offer!;
    if (offer.kind === 'audio') {
      if (st.dead.has(offer.file.url)) return { kind: 'fallback', rotation: 0, text: t('Lien mort') };
      const file = st.previews.get(offer.file.url);
      if (!file || !fs.existsSync(file)) return { kind: 'audio', rotation: 0, text: '♪' };
      allowPreview(file);
      return { kind: 'audio', url: mediaUrl(file), rotation: 0, text: '♪' };
    }
    const file = offer.preview && st.previews.get(offer.preview.url);
    if (!file || !fs.existsSync(file)) return { kind: 'fallback', rotation: 0, text: t('Aperçu indisponible') };
    allowPreview(file);
    // Vu du joueur, flippers en bas : la rotation que le menu appliquera.
    const rotation = mediaTypeInfo(choice.type).orientable ? playfieldMediaRotation(readMediaDimensions(file), 'bottom') : 0;
    return { kind: 'image', url: mediaUrl(file), rotation };
  }

  /** Le fichier téléchargé de cette proposition, une fois reçu (même nom que l'aperçu s'il s'agit du même fichier). */
  const stagedOf = (file: MediaDbFile) => mediaDbStagedFile(ctx.search.staging(), file);

  function isChosen(table: TableEntry, choice: MediaChoice): boolean {
    return ctx.pages(table, choice.type).some((e) => 'from' in e && (choice.offer ? e.origin?.url === choice.offer.file.url || samePath(e.from, stagedOf(choice.offer.file)) : samePath(e.from, choice.file!)));
  }

  function isCurrent(table: TableEntry, choice: MediaChoice): boolean {
    const now = ctx.current(table, choice.type)[0];
    if (!now) return false;
    if (choice.offer) {
      const origin = mediaOriginOf(table, choice.type, now);
      return Boolean(origin && (choice.offer.file.md5 ? origin.md5 === choice.offer.file.md5 : origin.url === choice.offer.file.url));
    }
    try {
      return path.extname(now).toLowerCase() === path.extname(choice.file!).toLowerCase() && fs.statSync(now).size === choice.bytes;
    } catch {
      return false;
    }
  }

  const sourceName = (choice: MediaChoice) => (choice.source === 'mediadb' ? MEDIADB_NAME : MEDIA_CHOICE_SOURCE_LABELS[choice.source]);

  /** Carte d'une fiche d'un site, pas encore reçue : vignette de l'auteur, état dans la file. */
  /** « 510 téléchargements » : la popularité que le site donne pour sa fiche. */
  const popularity = (hit: SiteHit) => (hit.downloads !== undefined ? tn(hit.downloads, '{n} téléchargement', '{n} téléchargements') : undefined);

  /** Proposition d'un autre jeu de la base VPS que celui de la table (même titre, autres auteurs, autre année). */
  function otherGame(st: State, table: TableEntry, choice: MediaChoice): MediaCard['flag'] {
    const own = table.info.Info?.VPSId;
    const lead = choice.vpsId ? st.games.find((g) => g.lead.game.id === choice.vpsId)?.lead : undefined;
    return own && lead && lead.game.id !== own ? { label: t('Autre jeu'), tone: 'warning' } : undefined;
  }

  function siteCard(st: State, table: TableEntry, choice: MediaChoice, action: number): MediaCard {
    const { hit, pack } = choice.site!;
    const site = mediaSite(hit.site);
    const job = ctx.sites?.job(jobKey(hit));
    const receipt = ctx.sites?.receipt(jobKey(hit));
    const account = st.sites[hit.site]?.account;
    const file = ctx.sites?.thumb(hit.thumb);
    let thumb: MediaThumb = { kind: 'fallback', rotation: 0, text: t('Pas d’aperçu') };
    if (file && fs.existsSync(file)) {
      allowPreview(file);
      thumb = { kind: 'image', url: mediaUrl(file), rotation: 0 };
    }
    const facts = [
      hit.category?.label,
      hit.author ? t('par {author}', { author: hit.author }) : undefined,
      hit.date ? formatDate(hit.date, { month: 'short', year: 'numeric' }) : undefined,
    ];
    const extra: string[] = [];
    let state: MediaCard['state'];
    let progress: number | undefined;
    if (receipt) {
      state = { label: t('Reçu : rien pour ce média'), tone: 'quiet' };
      extra.push(tn(receipt.files.length, 'Le site a envoyé {n} fichier, pour un autre écran que celui-ci.', 'Le site a envoyé {n} fichiers, aucun pour ce média : voyez les autres écrans.'));
    } else if (job && job.state !== 'failed') {
      const queued = ctx.sites!.jobs().filter((j) => j.hit.site === hit.site && j.state === 'queued');
      const place = queued.indexOf(job) + 1;
      if (job.state === 'queued') state = { label: place > 1 ? t('En file · {n}ᵉ', { n: place }) : t('En file'), tone: 'info' };
      else if (job.state === 'waiting') {
        state = { label: job.seconds !== undefined ? t('Attente du site · {n} s', { n: job.seconds }) : t('Attente du site'), tone: 'info' };
        if (job.seconds !== undefined && site.wait) progress = Math.max(0, Math.min(1, 1 - job.seconds / site.wait));
      } else if (job.state === 'downloading') {
        const pct = transferPercent({ received: job.received ?? 0, total: job.total, approx: job.approx });
        state = { label: pct !== undefined ? t('Téléchargement · {pct} %', { pct }) : t('Téléchargement'), tone: 'ok' };
        if (pct !== undefined) progress = pct / 100;
        facts.push(ctx.sites!.progressText(job));
      } else if (job.state === 'unpacking') state = { label: t('Déballage…'), tone: 'ok' };
      extra.push(job.state === 'waiting' ? t('Le site décompte lui-même ; le téléchargement part à la fin, sans rien à faire. Start : retirer de la file.') : t('Start : retirer de la file.'));
    } else if (job?.state === 'failed') {
      state = { label: job.login ? t('Connexion nécessaire') : t('Échec'), tone: job.login ? 'warning' : 'error' };
      extra.push(job.login ? t('Start ouvre la page de connexion du site.') : t('{error}. Start ouvre la page du site, pour le faire vous-même.', { error: job.error ?? t('raison inconnue') }));
    } else if (account && !account.connected) {
      state = { label: t('Connexion nécessaire'), tone: 'warning' };
      extra.push(site.wait ? t('Start ouvre la page de connexion du site ; ensuite, environ {n} s d’attente par fichier.', { n: site.wait }) : t('Start ouvre la page de connexion du site.'));
    } else {
      state = site.wait ? { label: t('≈ {n} s d’attente', { n: site.wait }), tone: 'info' } : { label: t('Sans attente'), tone: 'ok' };
    }
    if (pack) extra.push(t('Pack complet : les médias de tous les écrans ; reçus, les autres écrans les proposeront aussi.'));
    else if (choice.kind === 'video') extra.push(t('Aperçu : image fixe déposée par l’auteur ; la vidéo arrive au téléchargement.'));
    return { action, title: choice.label, code: site.name, state, flag: otherGame(st, table, choice), popularity: popularity(hit), facts: facts.filter(Boolean).join(' · '), extra, thumb, progress };
  }

  function cardFor(st: State, table: TableEntry, choice: MediaChoice, action: number): MediaCard {
    if (choice.site && !choice.site.received) return siteCard(st, table, choice, action);
    const chosen = isChosen(table, choice);
    const current = !chosen && isCurrent(table, choice);
    const lead = choice.vpsId ? st.games.find((g) => g.lead.game.id === choice.vpsId)?.lead : undefined;
    let facts: string;
    if (choice.offer) {
      const size = st.sizes.get(choice.offer.file.url);
      const preview = choice.source === 'vps' ? st.previews.get(choice.offer.file.url) : undefined;
      const d = preview ? readMediaDimensions(preview) : undefined;
      facts = [choice.detail, d ? `${d.width} × ${d.height}` : undefined, size === undefined ? t('taille inconnue') : formatSize(size)].filter(Boolean).join(' · ');
    } else facts = ctx.facts(choice.file!);
    const extra: string[] = [];
    if (current) extra.push(t('C’est le fichier que le menu montre aujourd’hui : le reprendre ne changerait rien.'));
    // Même titre, autre table de la base VPS (The Matrix « Original 2026 » de VPW pour la table de 2023) : dit avant tout.
    const own = table.info.Info?.VPSId;
    if (lead && own && lead.game.id !== own) {
      const yours = [table.info.Info?.Manufacturer, table.info.Info?.Year].filter(Boolean).join(' ');
      extra.push(t('Autre jeu que votre table : {game}, même titre, autres auteurs ; la vôtre : {own}.', { game: vpsLabel(lead.game), own: yours ? `${table.title} (${yours})` : table.title }));
    }
    if (lead) extra.push(t('Jeu retenu : {reasons}.', { reasons: lead.reasons.slice(0, 2).join(t(' ; ')) }));
    if (choice.source === 'vps') extra.push(t('Basse définition : vignette de la base VPS, à défaut d’autre chose.'));
    else if (choice.source === 'vps-music') {
      extra.push(
        choice.offer && st.dead.has(choice.offer.file.url)
          ? t('Lien mort : Dropbox a renvoyé une page au lieu du fichier.')
          : t('Lien de partage Dropbox donné par la base VPS ; la musique s’écoute dès que la carte est choisie.'),
      );
    } else if (choice.offer?.kind === 'video' && !current) extra.push(t('Aperçu : image du même jeu ; la vidéo arrive au téléchargement.'));
    else if (choice.offer?.quality === '4k') extra.push(t('Aperçu : la même image en 1k ; le fichier 4k arrive au téléchargement.'));
    if (choice.source === 'web') {
      extra.push(t('Téléchargé dans la fenêtre « Récupérer » ; gardé dans les téléchargements, copié dans medias\\ à l’enregistrement.'));
    } else if (choice.site?.received) {
      const hit = choice.site.hit;
      extra.push(hit.author ? t('De « {title} », par {author}.', { title: hit.title, author: hit.author }) : t('De « {title} ».', { title: hit.title }));
      extra.push(t('Reçu du site, gardé dans les téléchargements ; copié dans medias\\ à l’enregistrement.'));
    } else if (!choice.offer) {
      const rel = path.relative(table.folder, choice.file!);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        // Image extraite du .vpx ou du .directb2s, gardée dans le cache des médias : pas un fichier de la table.
        extra.push(t('Extraite du {file} de la table, gardée dans le cache des médias ; copiée dans medias\\ à l’enregistrement.', { file: choice.source === 'b2s' ? '.directb2s' : '.vpx' }));
      } else {
        extra.push(t('Fichier : {file}', { file: rel }));
        extra.push(t('Copié dans medias\\ ; l’original reste à sa place, la table en a besoin.'));
      }
    }
    return {
      action,
      title: choice.label,
      code: choice.site?.received ? t('Reçu de {site}', { site: sourceName(choice) }) : sourceName(choice),
      state: chosen ? { label: t('Choisi, à enregistrer'), tone: 'warning' } : current ? { label: t('Actuel'), tone: 'ok' } : choice.site?.received ? { label: t('Reçu'), tone: 'ok' } : undefined,
      flag: otherGame(st, table, choice),
      popularity: choice.site ? popularity(choice.site.hit) : undefined,
      facts,
      extra,
      // Le fichier actuel se montre lui-même (la vidéo, pas l'image d'aperçu du site) : on voit que c'est le même.
      thumb: current && choice.offer ? ctx.thumb(table, choice.type, ctx.current(table, choice.type)[0]!) : choice.offer ? remoteThumb(st, choice) : ctx.thumb(table, choice.type, choice.file!),
    };
  }

  function build(type: MediaType): Built {
    const table = state && ctx.find(state.file);
    const back = () => ctx.back(type);
    if (!state || !table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour'), run: back }], back };
    const st = state;
    const info = mediaTypeInfo(type);
    const choices = sortProposals(choicesFor(st, type), sort);
    const actions: Action[] = choices.map((choice) => ({
      // L'identité de la proposition, pas son rang : un fichier reçu entre-temps ne décale pas le choix.
      key: mediaChoiceKey(choice),
      label: choice.label,
      detail: `${sourceName(choice)} · ${choice.detail}`,
      run: () => pick(table, type, choice),
    }));
    const cards = choices.map((choice, i) => cardFor(st, table, choice, i));
    const games = includedGames(st).length;
    // Afficheur que la borne ne montre pas (4:1 sur un écran 16:9) : passage direct à l'autre.
    const placement = ctx.placement(type);
    const partner: MediaType | undefined = type === 'DMD' ? 'FullDMD' : type === 'FullDMD' ? 'DMD' : undefined;
    if (partner && !placement.shown && ctx.placement(partner).shown) {
      actions.push({
        label: t('Propositions : {label}', { label: mediaTypeInfo(partner).label }),
        detail: t('Le média que votre borne montre'),
        tone: 'ok',
        run: () => open(table, partner),
      });
    }
    // Un média après l'autre, sans revenir à la vue d'ensemble : les choix restent dans le brouillon.
    const shown = (t: MediaType) => ctx.placement(t).shown;
    const next = neighborType(type, 1, shown);
    const previous = neighborType(type, -1, shown);
    for (const [key, other] of [['next-type', next], ['previous-type', previous === next ? undefined : previous]] as const) {
      if (!other) continue;
      const label = mediaTypeInfo(other).label;
      actions.push({
        key,
        label: key === 'next-type' ? t('Média suivant : {label}', { label }) : t('Média précédent : {label}', { label }),
        detail: pending(table, other) ? t('Un choix en attente d’enregistrement') : t('Ses propositions ; vos choix restent dans le brouillon'),
        run: () => open(table, other),
      });
    }
    if (choices.some((c) => c.site?.hit.downloads !== undefined)) {
      actions.push({
        key: 'sort',
        label: sort === 'popularity' ? t('Trier : popularité') : t('Trier : pertinence'),
        detail: sort === 'popularity' ? t('Les plus téléchargées sur leur site d’abord ; puis : pertinence') : t('Le jeu le plus probable d’abord ; puis : popularité'),
        run: () => {
          sort = sort === 'popularity' ? 'relevance' : 'popularity';
          ctx.show(() => build(type), ctx.cursor());
        },
      });
    }
    const changes = ctx.save?.changes(table) ?? 0;
    if (changes) {
      actions.push({
        key: 'save',
        label: t('Enregistrer'),
        detail: tn(changes, '{n} changement : voir le plan avant d’écrire', '{n} changements : voir le plan avant d’écrire'),
        tone: 'ok',
        run: () => ctx.save!.open(),
      });
    }
    // Sites où se connecter : avant le reste, la recherche ou le téléchargement en dépend.
    for (const site of MEDIA_SITES) {
      const found = st.sites[site.id];
      if (!found || found.account.connected) continue;
      actions.push({
        label: t('Se connecter à {site}…', { site: site.name }),
        detail: t('Dans la fenêtre de Cyber Pinball ; votre mot de passe reste au site'),
        tone: found.login ? 'ok' : undefined,
        run: () => signIn(table, type, site.id),
      });
    }
    const active = ctx.sites?.jobs().filter((j) => j.state === 'queued' || j.state === 'waiting' || j.state === 'downloading') ?? [];
    if (active.length) {
      actions.push({
        label: t('Arrêter la file'),
        detail: t('Le fichier en cours s’arrête ; rien n’est gardé'),
        run: () => {
          ctx.sites!.stopAll();
          st.notice = { text: t('File arrêtée. Rien n’a été gardé du fichier en cours.'), tone: 'info' };
          ctx.show(() => build(type), ctx.cursor());
        },
      });
    }
    if (ctx.web) {
      actions.push({
        label: t('Chercher sur le web…'),
        detail: ctx.web.detail(table, type, st.query),
        web: 'medias.proposals',
        tone: choices.length ? undefined : 'ok',
        run: () => openWeb(table, type),
      });
    }
    actions.push(
      {
        label: t('Autres jeux…'),
        detail: t('{kept} sur {found} avec des médias', {
          kept: tn(games, '{n} jeu retenu', '{n} jeux retenus'),
          found: tn(st.games.length, '{n} trouvé', '{n} trouvés'),
        }),
        run: () => openGames(table, type),
      },
      { label: t('Chercher un autre titre…'), detail: t('Titre en anglais, initiales ou nom de ROM'), run: () => askTitle(table, type, () => ctx.show(() => build(type))) },
      { label: t('Retour : {label}', { label: info.label }), run: back },
    );
    const rows: Row[] = [];
    if (st.notice) rows.push({ text: st.notice.text, tone: st.notice.tone });
    if (!placement.shown && placement.note) rows.push({ text: t('Pas montré sur votre borne'), detail: placement.note, tone: 'warning' });
    rows.push(...siteRows(st, type));
    if (st.problem) rows.push({ text: t('VPinMediaDB indisponible'), detail: t('{problem}. Restent les médias déjà sur la borne, et les vignettes VPS déjà reçues.', { problem: st.problem }), tone: 'warning' });
    if (!choices.length) {
      rows.push({
        text: t('Aucune proposition pour ce média'),
        detail: st.games.length
          ? t('Les jeux retenus n’ont pas de {label}, et la table n’en a pas dans son PuP-Pack ni son dossier du DMD. « Chercher sur le web… » pour le trouver vous-même, ou « Autres jeux… » pour en retenir d’autres.', { label: lowerFirst(info.label) })
          : t('Aucun jeu de la base VPS ne correspond : « Chercher un autre titre… », ou prenez un fichier dans le dossier d’import.'),
        tone: 'quiet',
      });
    }
    const sections: Section[] = rows.length ? [{ rows }] : [];
    const source = [...new Set(choices.map(sourceName))].join(', ');
    const fromSites = choices.some((c) => c.site && !c.site.received) ? ` ${t('Les fiches des sites arrivent après leur téléchargement, un fichier à la fois par site.')}` : '';
    const howMany = tn(choices.length, '{n} proposition', '{n} propositions') + (source ? ` (${source})` : '');
    const how = info.pages
      ? t('Start ajoute la proposition comme nouvelle page dans le brouillon et reste ici ; rien n’est écrit avant « Enregistrer ».')
      : t('Start met la proposition dans le brouillon et reste ici : passez au média suivant, puis « Enregistrer » ; rien n’est écrit avant.');
    const online = choices.some((c) => c.offer) ? ` ${t('Médias en ligne : sans licence déclarée, pour un usage personnel sur votre borne.')}` : '';
    return {
      heading: t('{label} : propositions', { label: info.label }),
      subheading: `${table.title}${st.query ? ` · ${t('recherche « {query} »', { query: st.query })}` : ''}`,
      lead: `${howMany}. ${how}${online}${fromSites}`,
      sections,
      actions,
      back,
      media: { cards, gallery: true, aspect: PREVIEW_ASPECT[type] },
    };
  }

  /** Ce média a un choix en attente d'enregistrement. */
  function pending(table: TableEntry, type: MediaType): boolean {
    return pagesSignature(ctx.pages(table, type)) !== pagesSignature(ctx.current(table, type).map((file) => ({ file })));
  }

  /** Après un choix : on reste sur les propositions, le message dit ce qui arrivera à l'enregistrement. */
  function stayAfterPick(type: MediaType, text: string, tone: Tone = 'info'): void {
    if (state) state.notice = { text, tone };
    ctx.show(() => build(type), ctx.cursor());
  }

  function pick(table: TableEntry, type: MediaType, choice: MediaChoice): void {
    if (isChosen(table, choice)) return stayAfterPick(type, t('Cette proposition est déjà dans le brouillon.'));
    if (choice.site && !choice.site.received) return pickSite(table, type, choice);
    // Le fichier montré aujourd'hui, sans autre choix en attente : l'enregistrer réécrirait le même.
    if (isCurrent(table, choice) && !ctx.pages(table, type).some((e) => 'from' in e)) {
      state!.notice = { text: t('C’est déjà le média actuel : rien ne changerait. Choisissez une autre proposition.'), tone: 'info' };
      return ctx.show(() => build(type), ctx.cursor());
    }
    // Choix fait maintenant : un fichier d'un site qui arriverait ensuite ne le remplace pas.
    lastPick.set(`${table.file}|${type}`, ++picks);
    if (choice.source === 'web') {
      const receipt = ctx.sites?.webReceipts().find((r) => r.files.some((f) => samePath(f.file, choice.file!)));
      const text = ctx.place(table, type, { from: choice.file!, mode: 'copy', origin: receipt ? { origin: webHost(receipt.url), url: receipt.url } : undefined });
      return stayAfterPick(type, text);
    }
    if (choice.site?.received) {
      const hit = choice.site.hit;
      const text = ctx.place(table, type, { from: choice.file!, mode: 'copy', origin: { origin: mediaSite(hit.site).name, url: hit.url, vpsId: choice.vpsId } });
      return stayAfterPick(type, text);
    }
    if (!choice.offer) {
      const text = ctx.place(table, type, { from: choice.file!, mode: 'copy', ...(choice.source === 'recording' && { recorded: true }) });
      return stayAfterPick(type, text);
    }
    const offer = choice.offer;
    const at = ctx.cursor();
    const st = state!;
    const origin = choice.source === 'mediadb' ? MEDIADB_NAME : VPS_IMAGE_ORIGIN;
    const download = () =>
      void ctx.task(t('Téléchargement depuis {source}…', { source: sourceName(choice) }), async () => {
        let last = 0;
        const meter = createTransferMeter();
        let file: string;
        try {
          file = await ctx.search.stage(
            offer.file,
            (received, total) => {
              const progress = meter.update(received, total);
              if (Date.now() - last < 250) return;
              last = Date.now();
              ctx.progress(t('{label} : {progress}…', { label: mediaTypeInfo(type).label, progress: formatTransfer(progress, true) }));
            },
            { title: t('{type} de {table}', { type: mediaTypeInfo(type).label, table: table.title }), back: { screen: 'table-medias', table: table.file } },
          );
        } catch (error) {
          return stayAfterPick(type, t('Téléchargement impossible : {error}.', { error: (error as Error).message }), 'error');
        }
        if (offer.kind === 'audio' && !isAudioFile(file)) {
          fs.rmSync(file, { force: true });
          st.dead.add(offer.file.url);
          return stayAfterPick(type, t('Lien mort : le site a renvoyé une page au lieu du fichier. Rien n’a été gardé.'), 'error');
        }
        const text = ctx.place(table, type, { from: file, mode: 'move', origin: { origin, url: offer.file.url, vpsId: choice.vpsId, key: offer.key, md5: offer.file.md5 } });
        stayAfterPick(type, `${text} ${offer.file.md5 ? t('Téléchargé et vérifié.') : t('Téléchargé.')}`);
      });
    // L'avertissement de VPinMediaDB (aucune licence) est lu une fois avant son premier téléchargement.
    if (choice.source === 'mediadb') ctx.withNotice(download, () => ctx.show(() => build(type), at));
    else download();
  }

  // ---------- Sites communautaires ----------

  /** Une ligne par site : connexion, résultats, attente ; puis la file, s'il y a quelque chose dedans. */
  function siteRows(st: State, type: MediaType): Row[] {
    const rows: Row[] = [];
    for (const site of MEDIA_SITES) {
      const found = st.sites[site.id];
      if (!found) continue;
      let detail: string;
      let tone: Tone = 'ok';
      if (found.login) {
        detail = t('Recherche réservée aux membres ({holdings}) : connectez-vous pour y chercher.', { holdings: site.holdings });
        tone = 'warning';
      } else if (found.problem) {
        detail = t('Recherche impossible : {problem}.', { problem: found.problem });
        tone = 'warning';
      } else {
        const n = `${tn(found.hits.length, '{n} résultat', '{n} résultats')}${found.hits.length ? ` (${hitSplit(st, found.hits, type)})` : ''}`;
        const wait = site.wait ? ` · ${t('environ {n} s d’attente par fichier (compte gratuit)', { n: site.wait })}` : '';
        if (found.account.connected) detail = t('Connecté · {n}', { n }) + wait;
        else {
          detail = t('Non connecté · {n} visibles ; le téléchargement demande votre compte (gratuit)', { n });
          tone = 'warning';
        }
      }
      rows.push({ text: site.name, detail, tone });
    }
    const jobs = ctx.sites?.jobs() ?? [];
    if (jobs.some((j) => j.state !== 'received' && j.state !== 'failed')) {
      const parts = MEDIA_SITES.flatMap((site) => {
        const mine = jobs.filter((j) => j.hit.site === site.id);
        const got = mine.filter((j) => j.state === 'received').length;
        const waiting = mine.find((j) => j.state === 'waiting');
        const loading = mine.find((j) => j.state === 'downloading');
        const queued = mine.filter((j) => j.state === 'queued').length;
        const bits = [
          got ? tn(got, '{n} reçu', '{n} reçus') : undefined,
          waiting ? (waiting.seconds !== undefined ? t('1 en attente du site ({n} s)', { n: waiting.seconds }) : t('1 en attente du site')) : undefined,
          loading ? t('1 en cours') : undefined,
          queued ? tn(queued, '{n} en file', '{n} en file') : undefined,
        ].filter(Boolean);
        return bits.length ? [`${site.name} : ${bits.join(t(', '))}`] : [];
      });
      rows.push({ text: t('File des sites'), detail: parts.join(' · '), tone: 'info' });
    }
    return rows;
  }

  /** « aucun pour ce média ; 1 pack complet, pour tous les écrans ; les autres : Afficheur large 2, Logo 16 ; 3 d’autres jeux ou sans média reconnu » */
  function hitSplit(st: State, hits: SiteHit[], type: MediaType): string {
    const sum = siteHitSummary(hits, includedGames(st).map((g) => g.lead.game), st.deep?.vps);
    const mine = sum.byType[type] ?? 0;
    const others = (Object.entries(sum.byType) as [MediaType, number][])
      .filter(([k]) => k !== type)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${mediaTypeInfo(k).label} ${n}`);
    return [
      mine ? tn(mine, '{n} pour ce média', '{n} pour ce média') : t('aucun pour ce média'),
      sum.packs ? tn(sum.packs, '{n} pack complet, pour tous les écrans', '{n} packs complets, pour tous les écrans') : undefined,
      others.length ? t('les autres : {list}', { list: others.join(t(', ')) }) : undefined,
      sum.elsewhere ? tn(sum.elsewhere, '{n} d’un autre jeu ou sans média reconnu', '{n} d’autres jeux ou sans média reconnu') : undefined,
    ]
      .filter(Boolean)
      .join(t(' ; '));
  }

  // ---------- Recherche sur le web ----------

  /**
   * Recherche libre du média, sur le titre saisi ici s'il y en a un : ce que l'utilisateur
   * télécharge s'ouvre sur l'écran « Reçu » (media-web.ts). Un choix fait ici avant n'est
   * plus attendu : un fichier d'un site qui arriverait ensuite ne le remplace pas.
   */
  function openWeb(table: TableEntry, type: MediaType): void {
    const st = state!;
    lastPick.set(`${table.file}|${type}`, ++picks);
    st.notice = { text: ctx.web!.open(table, type, st.query), tone: 'info' };
    ctx.show(() => build(type), ctx.cursor());
  }


  function signIn(table: TableEntry, type: MediaType, site: MediaSiteId): void {
    ctx.sites!.signIn(site);
    const st = state!;
    // La connexion se relit à la prochaine ouverture des propositions.
    st.sites = {};
    st.notice = { text: t('Connexion à {site} ouverte : fermez la fenêtre une fois connecté, puis revenez aux propositions.', { site: mediaSite(site).name }), tone: 'info' };
    ctx.show(() => build(type), ctx.cursor());
    void table;
  }

  /**
   * Médias attendus par une carte : à mettre dans le brouillon dès réception, si la table est
   * encore ouverte et que rien n'a changé ce média depuis la demande (`pages` : empreinte du
   * brouillon pour ce type à ce moment-là).
   */
  const awaited = new Map<string, { file: string; type: MediaType; pick: number; pages: string }>();
  /** Dernier choix fait pour chaque média d'une table (« fichier|type ») : lui seul passe dans le brouillon à réception. */
  const lastPick = new Map<string, number>();
  let picks = 0;
  const expect = (key: string, table: TableEntry, type: MediaType) => {
    const pick = ++picks;
    lastPick.set(`${table.file}|${type}`, pick);
    awaited.set(key, { file: table.file, type, pick, pages: pagesSignature(ctx.pages(table, type)) });
  };

  function pickSite(table: TableEntry, type: MediaType, choice: MediaChoice): void {
    const sites = ctx.sites!;
    const st = state!;
    const { hit } = choice.site!;
    const site = mediaSite(hit.site);
    const key = jobKey(hit);
    const job = sites.job(key);
    const stay = (text: string, tone: Tone = 'info') => {
      st.notice = { text, tone };
      ctx.show(() => build(type), ctx.cursor());
    };
    if (job && (job.state === 'queued' || job.state === 'waiting' || job.state === 'downloading')) {
      sites.cancel(key);
      awaited.delete(key);
      return stay(t('Retiré de la file : {title}.', { title: hit.title }));
    }
    if (st.sites[hit.site]?.account.connected === false || job?.login) return signIn(table, type, hit.site);
    if (job?.state === 'failed') {
      expect(key, table, type);
      sites.openPage(hit, type, job.error);
      return stay(t('Page de la fiche ouverte : téléchargez-y le fichier, il reviendra ici.'));
    }
    expect(key, table, type);
    sites.enqueue(hit, type);
    stay(
      site.wait
        ? t('Ajouté à la file : {site} impose environ {n} s d’attente avant chaque fichier. Continuez ailleurs si vous voulez : la carte dira quand c’est reçu.', { site: site.name, n: site.wait })
        : t('Téléchargement lancé depuis {site} : la carte dira quand c’est reçu.', { site: site.name }),
    );
  }

  // Un fichier reçu pour une carte : s'il n'y en a qu'un pour ce média et que la table est
  // encore ouverte, il va dans le brouillon, comme une proposition choisie.
  ctx.sites?.onReceived((job: SiteJob) => {
    const wanted = awaited.get(job.key);
    awaited.delete(job.key);
    if (!wanted || !state || state.file !== wanted.file) return;
    const table = ctx.find(wanted.file);
    if (!table || !ctx.active(table)) return;
    // Un autre choix a été fait depuis pour ce média, ici ou sur un autre écran (fichier du
    // dossier d'import, de ce PC, glissé, retiré, recherche web) : celui-ci reste proposé,
    // sans le remplacer.
    if (lastPick.get(`${wanted.file}|${wanted.type}`) !== wanted.pick || pagesSignature(ctx.pages(table, wanted.type)) !== wanted.pages) {
      state.notice = { text: t('Reçu de {site} : « {title} », à choisir si vous le préférez.', { site: mediaSite(job.hit.site).name, title: job.hit.title }), tone: 'info' };
      return;
    }
    const files = choicesFor(state, wanted.type).filter((c) => c.site?.received && jobKey(c.site.hit) === job.key);
    if (files.length !== 1) {
      state.notice = { text: files.length ? t('Reçu de {site} : {n} fichiers pour ce média, à choisir.', { site: mediaSite(job.hit.site).name, n: files.length }) : t('Reçu de {site}, mais rien pour ce média.', { site: mediaSite(job.hit.site).name }), tone: 'info' };
      return;
    }
    const c = files[0]!;
    const text = ctx.place(table, wanted.type, { from: c.file!, mode: 'copy', origin: { origin: mediaSite(job.hit.site).name, url: job.hit.url, vpsId: c.vpsId } });
    state.notice = { text: `${t('Reçu de {site}.', { site: mediaSite(job.hit.site).name })} ${text}`, tone: 'ok' };
  });

  // ---------- Jeux retenus ----------

  function askTitle(table: TableEntry, type: MediaType, cancel: () => void): void {
    ctx.prompt(
      t('Chercher un autre titre'),
      t('Titre du jeu'),
      state?.query ?? '',
      (text) => {
        if (!text?.trim()) return cancel();
        void ctx.task(t('Recherche de « {query} »…', { query: text.trim() }), async () => {
          const st = await ensure(table, text.trim());
          await prepareType(st, type);
          ctx.show(() => build(type));
        });
      },
      t('Le titre en anglais, tel que le fabricant l’a sorti (« Guardians of the Galaxy »), ses initiales (« GOTG ») ou le nom de sa ROM (« t2_l8 »). Le premier jeu trouvé s’ajoute aux propositions ; « Autres jeux… » pour choisir.'),
    );
  }

  /** Image qui fait reconnaître un jeu : son logo sur VPinMediaDB, sinon une vignette VPS de son fronton ou de sa table. */
  function faceOf(g: Game): MediaDbFile | undefined {
    if (g.entry?.files.wheel) return g.entry.files.wheel;
    const images = vpsImageChoices([g.lead.game]);
    return (images.Backglass?.[0] ?? images.Playfield?.[0])?.offer?.file;
  }

  function openGames(table: TableEntry, type: MediaType, at = 0): void {
    void ctx.task(t('Logos des jeux…'), async () => {
      const st = await ensure(table);
      await ctx.search.stagePreviews(st.games.flatMap((g) => faceOf(g) ?? []), st.previews, t('Logos'));
      ctx.show(() => buildGames(type), at);
    });
  }

  function buildGames(type: MediaType): Built {
    const table = state && ctx.find(state.file);
    const back = () => (table ? reopen(table, type) : ctx.back(type));
    if (!state || !table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour'), run: back }], back };
    const st = state;
    const actions: Action[] = st.games.map((g) => {
      const id = g.lead.game.id;
      const on = st.included.includes(id);
      return {
        key: `game:${id}`,
        label: vpsLabel(g.lead.game),
        detail: on ? t('Proposé : Start pour le retirer') : t('Start pour proposer ses médias'),
        tone: on ? 'ok' : undefined,
        run: () => {
          st.included = on ? st.included.filter((x) => x !== id) : [...st.included, id];
          ctx.show(() => buildGames(type), ctx.cursor());
        },
      };
    });
    const cards: MediaCard[] = st.games.map((g, i) => {
      const on = st.included.includes(g.lead.game.id);
      const face = faceOf(g);
      const file = face && st.previews.get(face.url);
      let thumb: MediaThumb = { kind: 'fallback', rotation: 0, text: t('Pas d’image') };
      if (file && fs.existsSync(file)) {
        allowPreview(file);
        thumb = { kind: 'image', url: mediaUrl(file), rotation: 0 };
      }
      const types = g.entry ? mediaDbOffers(g.entry, st.quality.quality).map((o) => lowerFirst(mediaTypeInfo(o.type).label)) : [];
      const thumbs = vpsImageCount(g.lead.game);
      return {
        action: i,
        title: vpsLabel(g.lead.game),
        state: on ? { label: t('Proposé'), tone: 'ok' } : undefined,
        facts: [
          types.length ? t('{source} : {types}', { source: MEDIADB_NAME, types: types.join(', ') }) : undefined,
          thumbs ? tn(thumbs, '{n} vignette VPS', '{n} vignettes VPS') : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        extra: g.lead.reasons.slice(0, 3),
        thumb,
      };
    });
    const without = (st.deep?.leads ?? []).filter((l) => !st.games.some((g) => g.lead.game.id === l.game.id)).slice(0, 6);
    const sections: Section[] = [];
    if (!st.games.length) sections.push({ rows: [{ text: t('Aucun jeu avec des médias'), detail: t('Cherchez un autre titre : en anglais, ses initiales ou le nom de sa ROM.'), tone: 'quiet' }] });
    if (without.length) {
      sections.push({
        title: t('Reconnus aussi, sans aucun média en ligne'),
        rows: without.map((l) => ({ text: vpsLabel(l.game), detail: l.reasons.slice(0, 2).join(t(' ; ')), tone: 'quiet' as const })),
      });
    }
    actions.push(
      { label: t('Chercher un autre titre…'), detail: t('Titre en anglais, initiales ou nom de ROM'), run: () => askTitle(table, type, () => ctx.show(() => buildGames(type))) },
      { label: t('Retour aux propositions'), tone: 'ok', run: back },
    );
    return {
      heading: t('Jeux dont les médias sont proposés'),
      subheading: `${table.title}${st.query ? ` · ${t('recherche « {query} »', { query: st.query })}` : ''}`,
      lead: t('Jeux de la base VPS que désignent le nom de la table, le nom écrit dedans par son auteur, sa ROM, son PuP-Pack ou votre recherche, le plus probable d’abord, avec leurs raisons. Start ajoute ou retire un jeu des propositions.'),
      sections,
      actions,
      back,
      media: { cards },
    };
  }

  /** Nombre de propositions connues pour ce type, si la recherche a déjà été faite pour cette table. */
  function count(table: TableEntry, type: MediaType): number | undefined {
    return state && state.file === table.file ? choicesFor(state, type).length : undefined;
  }

  return {
    open,
    count,
    /** Nouvelle visite du gestionnaire : la recherche sera refaite. */
    reset: () => (state = undefined),
  };
}
