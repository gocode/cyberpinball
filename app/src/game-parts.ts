// « Parties du jeu », depuis la fiche d'une table installée : la table, son fronton, sa ROM,
// son PuP-Pack, ses couleurs de DMD, ses sons, sa musique, son point de vue, ses réglages
// propres et ses médias, chacun présent, reçu (à installer), attendu ou absent. En ouvrant
// une partie, ses propositions arrivent d'office de toutes les sources (gameparts.ts,
// partSources) : fichiers de la base VPS, fichiers déjà téléchargés, VPForums et VPUniverse
// (recherche par titre dans les catégories de la partie), en galerie ; « Chercher sur le
// web… » est toujours là (navigateur intégré, recherche libre préremplie). Chaque partie se
// réaffecte aussi à une autre table ou se retire. Tout ajout passe par le plan d'ajout,
// ciblé sur cette table (PlanOptions.target) : rien n'est écrit avant « Installer ». Le jeu
// VPS est celui que la table désigne (tableGame), même si son .info ne le dit pas ; s'il
// n'est pas sûr, il se choisit ici, et tout marche aussi sans lui (recherche par titre).
// Cœur : packages/core/src/gameparts.ts, acquisition.ts (liste d'attente).

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyOps,
  CONTENT_LABELS,
  formatDay,
  formatNumber,
  formatSize,
  GAME_PARTS,
  installedParts,
  isScriptPatchFile,
  linkHost,
  liveLinks,
  mediaSite,
  mediaUrl,
  MEDIA_SITES,
  NEED_LABELS,
  partFits,
  partLabel,
  partOffers,
  partSources,
  partWebFiles,
  partWebQuery,
  searchVps,
  t,
  tableContents,
  tn,
  trashDirFor,
  versionLabel,
  vpsLabel,
  type FileOp,
  type GamePart,
  type InstalledPart,
  type Layout,
  type MediaSiteId,
  type NeedKind,
  type PartOffer,
  type TableEntry,
  type TableGame,
  type VpsDb,
  type VpsGame,
  type VpsTableFile,
  type WaitItem,
} from '@cyberpinball/core';
import type { Catalog, WebTarget } from './catalog';
import type { PickRequest } from './file-picker';
import type { Action, Built, Row, Section, Tone } from './library';
import type { MediaCard, MediaThumb } from './library-medias';
import { allowPreview } from './media-protocol';
import type { MediaSites } from './media-sites';
import type { ScriptResult } from './vbs';

export interface GamePartsContext {
  layout(): Layout | undefined;
  tablesDir(): string;
  find(file: string): TableEntry | undefined;
  tables(): TableEntry[];
  /** Script de la table, s'il a déjà été lu (s'il utilise une ROM). */
  script(table: TableEntry): ScriptResult | undefined;
  show(build: () => Built, at?: number, table?: string): void;
  /** Cet écran est-il celui affiché ? */
  isShowing(build: () => Built): boolean;
  cursor(): number;
  sheet(table: TableEntry): void;
  leave(): void;
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  vps(): Promise<VpsDb | undefined>;
  /** Jeu VPS de la table : connu, ou trouvé d'après ce qu'elle dit d'elle-même (tableGame). */
  identify(table: TableEntry): Promise<TableGame>;
  /** Retient le jeu VPS de la table dans son .info (choisi ici). */
  setGame(table: TableEntry, gameId: string): void;
  prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  catalog: Catalog;
  /** Recherche des sites (VPForums, VPUniverse), dans la session de « Récupérer ». */
  sites?: MediaSites;
  /** Plan d'ajout de ces fichiers, tout destiné à cette table ; `back` : là où revient « Annuler ». */
  install(paths: string[], table: TableEntry, back?: () => void): void;
  pick?(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
  pupOptions(table: TableEntry): void;
  medias(table: TableEntry): void;
  reload(file?: string): void;
}

type Flash = { text: string; tone: Tone };
type Candidate = Awaited<ReturnType<Catalog['candidates']>>[number];

/** Résultat d'une source pour une partie : en cours, trouvé, ou ce qui l'empêche. */
type SiteFound = { state: 'searching' } | { state: 'waiting'; seconds: number } | { state: 'done'; offers: PartOffer[] } | { state: 'login' } | { state: 'failed'; reason: string };

/** Propositions d'une partie, toutes sources : lancées à l'ouverture, elles arrivent l'une après l'autre. */
interface Proposals {
  key: string;
  downloads?: Candidate[];
  sites: Partial<Record<MediaSiteId, SiteFound>>;
}

/** Extension que VPX attend nommée comme la table : fronton, point de vue, réglages propres. */
const NAMED_LIKE_TABLE: Partial<Record<GamePart, string>> = { b2s: '.directb2s', pov: '.pov', ini: '.ini' };

/** Propositions montrées au plus par partie (les plus sûres d'abord). */
const MAX_PROPOSALS = 24;

export function createGameParts(ctx: GamePartsContext) {
  let flash: Flash | undefined;
  /** Jeu VPS de la table ouverte (connu, trouvé, ou à choisir), lu à l'ouverture. */
  let identified: TableGame = { leads: [] };
  let vpsDb: VpsDb | undefined;
  /** Propositions de la partie ouverte ; l'écran ne se redessine que s'il les montre encore. */
  let proposals: Proposals | undefined;
  /** Écran de la partie affiché : la pré-recherche ne redessine que lui, jamais un autre écran ouvert depuis. */
  let showing: { key: string; build: () => Built } | undefined;

  const game = (): VpsGame | undefined => identified.game;
  const ownFolder = (table: TableEntry) => !samePathText(table.folder, ctx.tablesDir());
  const partsOf = (table: TableEntry) => installedParts(tableContents(table.file, { ownFolder: ownFolder(table), romLibrary: ctx.layout()?.roms }));
  /** Jeu de la liste d'attente pour cette table : celui de la base VPS, sinon son dossier. */
  const gameIdOf = (table: TableEntry) => game()?.id ?? ctx.catalog.localGameId(table.file);
  const target = (table: TableEntry, kind?: NeedKind): WebTarget => ({ gameId: game()?.id, gameLabel: game() ? vpsLabel(game()!) : table.title, kind, table: table.file });
  /** Titre cherché sur les sites et sur le web : celui du jeu VPS, sinon celui de la table. */
  const titleOf = (table: TableEntry) => game()?.name ?? table.title;

  /** Éléments de la liste d'attente pour cette table : récupérés pour elle, ou pour son jeu. */
  function itemsOf(table: TableEntry): WaitItem[] {
    const ids = new Set([gameIdOf(table), ctx.catalog.localGameId(table.file)]);
    return ctx.catalog.waitList().items.filter((i) => i.state !== 'installed' && ((i.table && samePathText(i.table, table.file)) || ids.has(i.gameId)));
  }

  const webFiles = (part: GamePart): VpsTableFile[] => partWebFiles(game(), part);

  const takeFlash = (): Section[] => {
    const own = flash;
    flash = undefined;
    const theirs = ctx.catalog.takeNotice();
    return [own, theirs].filter((n): n is Flash => Boolean(n)).map((n) => ({ rows: [{ text: n.text, tone: n.tone }] }));
  };

  /** Parties du jeu ; `at` : la partie sur laquelle revenir. */
  function open(table: TableEntry, at = 0, notice?: Flash): void {
    if (notice) flash = notice;
    void ctx.task(t('Parties du jeu…'), async () => {
      vpsDb = await ctx.vps();
      identified = await ctx.identify(table);
      // Un fichier qui arrive (fenêtre « Récupérer ») redessine l'écran, s'il est toujours affiché.
      const view = () => build(table.file);
      ctx.catalog.setRefresh(() => {
        if (ctx.isShowing(view)) ctx.show(view, ctx.cursor(), table.file);
      });
      ctx.show(view, at, table.file);
    });
  }

  function build(file: string): Built {
    const table = ctx.find(file);
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au menu'), run: ctx.leave }], back: ctx.leave };
    const back = () => {
      ctx.catalog.setRefresh(undefined);
      ctx.sheet(table);
    };
    const parts = partsOf(table);
    const items = itemsOf(table);
    const script = ctx.script(table);
    const usesRom = script && !('error' in script) ? script.usesPinmame : undefined;
    const actions: Action[] = [];
    const rows: Row[] = GAME_PARTS.map((part, index) => {
      actions.push({ label: partLabel(part), run: () => openPart(table, part, index) });
      return { ...partRow(part, parts.get(part), items.find((i) => i.kind === part), usesRom), action: index, pick: true };
    });
    const received = items.filter((i) => i.state === 'received');
    if (received.length) {
      actions.push({ label: t('Installer ce qui est reçu'), detail: t('{parts} · voir le plan', { parts: received.map((i) => NEED_LABELS[i.kind]).join(', ') }), tone: 'ok', run: () => ctx.catalog.installGame(received[0]!.gameId) });
    }
    actions.push(ctx.catalog.webAction('parts', { query: partWebQuery(titleOf(table)), target: target(table) }, () => open(table, ctx.cursor())));
    actions.push(gameAction(table));
    actions.push({ label: t('Retour à la fiche'), run: back });
    const present = GAME_PARTS.filter((p) => parts.has(p)).length;
    return {
      heading: t('Parties du jeu'),
      subheading: [table.title, tn(present, '{n} présente', '{n} présentes'), received.length ? tn(received.length, '{n} reçue, à installer', '{n} reçues, à installer') : undefined].filter(Boolean).join(' · '),
      lead: t('Tout ce qui fait le jeu, partie par partie. Start sur une partie : ses propositions arrivent de toutes les sources (VPS, Téléchargements, VPForums, VPUniverse) ; « Chercher sur le web… » reste toujours possible. Rien n’est installé avant le plan.'),
      sections: [...takeFlash(), { rows }],
      actions,
      back,
    };
  }

  /** « Jeu VPS : … » : celui que la table désigne, ou à choisir ; Start pour le changer. */
  function gameAction(table: TableEntry): Action {
    const g = game();
    const how = identified.how === 'search' ? t('reconnu d’après la table') : identified.how === 'medias' ? t('celui de ses médias') : t('noté dans la table');
    return {
      label: g ? t('Jeu VPS : {game}', { game: vpsLabel(g) }) : t('Jeu VPS : à choisir'),
      detail: g ? t('{how} · Start pour le changer', { how }) : identified.leads.length ? tn(identified.leads.length, '{n} jeu possible ; sans lui, la recherche se fait par le titre', '{n} jeux possibles ; sans lui, la recherche se fait par le titre') : t('Aucun jeu trouvé ; la recherche se fait par le titre'),
      tone: g ? undefined : 'warning',
      run: () => openGame(table),
    };
  }

  /** Ligne d'une partie : présente, reçue, attendue, inutile ou absente. */
  function partRow(part: GamePart, here: InstalledPart | undefined, item: WaitItem | undefined, usesRom: boolean | undefined): Row {
    const text = partLabel(part);
    if (here) {
      const names = here.entries.map((e) => e.rel);
      const shown = names.length > 2 ? t('{names} et {n} autres', { names: names.slice(0, 2).join(', '), n: names.length - 2 }) : names.join(', ');
      const extra = item?.state === 'received' ? t('nouveau fichier reçu, à installer : {file}', { file: path.basename(item.received!.file) }) : undefined;
      return { text, detail: [shown, formatSize(here.size), extra].filter(Boolean).join(' · '), badges: [t('Présent')], tone: 'ok' };
    }
    if (item?.state === 'received') return { text, detail: t('{file} · reçu le {date}', { file: path.basename(item.received!.file), date: formatDay(Date.parse(item.received!.at)) }), badges: [t('Reçu, à installer')], tone: 'info' };
    if (item) return { text, detail: t('{label} · {site}', { label: item.label, site: linkHost(item.page).label }), badges: [t('Attendu')], tone: 'warning' };
    if (part === 'rom' && usesRom === false) return { text, detail: t('cette table n’utilise pas de ROM'), badges: [t('Inutile')], tone: 'quiet' };
    const web = webFiles(part).length;
    return { text, detail: web ? tn(web, 'absent · {n} sur VPS', 'absent · {n} sur VPS') : t('absent'), tone: 'quiet' };
  }

  // ---------- Le jeu VPS de la table ----------

  function openGame(table: TableEntry): void {
    const back = () => open(table);
    ctx.catalog.setRefresh(undefined);
    ctx.show(
      () => {
        const leads = identified.leads.slice(0, 8);
        const actions: Action[] = leads.map((l) => ({ label: vpsLabel(l.game), detail: l.reasons[0], tone: l.game.id === game()?.id ? 'ok' : undefined, run: () => choose(table, l.game.id) }));
        actions.push({
          label: t('Chercher un titre…'),
          detail: t('Titre en anglais, initiales ou nom de ROM'),
          run: () =>
            ctx.prompt(t('Quel jeu est-ce ?'), t('Titre du jeu'), table.title, (text) => {
              const found = text && vpsDb ? vpsDb.games.find((g) => g.name.toLowerCase() === text.trim().toLowerCase()) : undefined;
              if (found) return choose(table, found.id);
              if (text?.trim() && vpsDb) identified = { ...identified, leads: searchVps(vpsDb, text, 8).map((c) => ({ game: c.game, score: c.score, reasons: [t('recherche « {query} »', { query: text.trim() })] })) };
              openGame(table);
            }),
        });
        actions.push({ label: t('Retour : parties du jeu'), run: back });
        return {
          heading: t('Quel jeu est-ce ?'),
          subheading: table.title,
          lead: t('Le jeu de la base VPS donne les fichiers connus de chaque partie et le titre cherché sur les sites. Il est retenu dans le .info de la table.'),
          sections: leads.length ? [] : [{ rows: [{ text: t('Aucun jeu de la base VPS ne correspond'), detail: t('« Chercher un titre… », ou cherchez les parties par le titre de la table.'), tone: 'quiet' }] }],
          actions,
          back,
        };
      },
      Math.max(0, identified.leads.findIndex((l) => l.game.id === game()?.id)),
      table.file,
    );
  }

  function choose(table: TableEntry, gameId: string): void {
    ctx.setGame(table, gameId);
    const fresh = ctx.find(table.file) ?? table;
    open(fresh, 0, { text: t('Jeu retenu : {game}.', { game: vpsLabel(vpsDb!.games.find((g) => g.id === gameId)!) }), tone: 'ok' });
  }

  // ---------- Une partie : ses propositions, de toutes les sources ----------

  function openPart(table: TableEntry, part: GamePart, from: number, at = 0): void {
    const key = `${table.file}|${part}`;
    if (proposals?.key !== key) {
      proposals = { key, sites: {} };
      void presearch(table, part, proposals);
    }
    ctx.catalog.setRefresh(() => redraw(table, part, from));
    const build = () => buildPart(table.file, part, from);
    showing = { key, build };
    ctx.show(build, at, table.file);
  }

  /** Redessine la partie si elle est toujours l'écran affiché (le curseur reste où il est). */
  function redraw(table: TableEntry, part: GamePart, from: number): void {
    if (showing?.key === `${table.file}|${part}` && ctx.isShowing(showing.build)) ctx.show(showing.build, ctx.cursor(), table.file);
  }

  /**
   * Pré-recherche d'une partie, lancée à l'ouverture : les fichiers déjà téléchargés, puis
   * VPForums et VPUniverse (connexion demandée si le site l'exige), chacun redessinant
   * l'écran à son arrivée. Les fichiers de VPS sont déjà là (base en cache).
   */
  async function presearch(table: TableEntry, part: GamePart, p: Proposals): Promise<void> {
    const sources = partSources(part);
    const from = () => GAME_PARTS.indexOf(part);
    const done = () => {
      if (proposals === p) redraw(table, part, from());
    };
    if (sources.includes('downloads') && part !== 'ini') {
      void ctx.catalog.candidates(part).then((all) => {
        p.downloads = all.filter((c) => partFits(part, c.seen) === 'yes');
        done();
      });
    } else p.downloads = [];
    if (part === 'ini' || !ctx.sites) return;
    for (const site of MEDIA_SITES) {
      if (!sources.includes(site.id)) continue;
      p.sites[site.id] = { state: 'searching' };
      void (async () => {
        if (site.searchNeedsLogin && !(await ctx.sites!.state(site.id)).connected) {
          p.sites[site.id] = { state: 'login' };
          return done();
        }
        const r = await ctx.sites!.searchPart(site.id, titleOf(table), part, (seconds) => {
          p.sites[site.id] = { state: 'waiting', seconds };
          done();
        });
        if (r.kind === 'hits') {
          const offers = partOffers(r.hits.map((h) => ({ ...h, site: site.id })), part, titleOf(table), game(), vpsDb);
          await ctx.sites!.stageThumbs(offers.map((o) => o.hit));
          p.sites[site.id] = { state: 'done', offers };
        } else p.sites[site.id] = r.kind === 'login' ? { state: 'login' } : { state: 'failed', reason: r.reason === 'flood' ? t('attente imposée par le site') : r.reason };
        done();
      })();
    }
  }

  function buildPart(file: string, part: GamePart, from: number): Built {
    const table = ctx.find(file);
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au menu'), run: ctx.leave }], back: ctx.leave };
    const back = () => open(table, from);
    const here = partsOf(table).get(part);
    const item = itemsOf(table).find((i) => i.kind === part);
    const p = proposals?.key === `${table.file}|${part}` ? proposals : undefined;
    const after = () => openPart(table, part, from, ctx.cursor());
    const actions: Action[] = [];
    const cards: MediaCard[] = [];

    // Les propositions, une tuile chacune : VPS, puis les sites (un autre jeu en dernier), puis ce qui est déjà téléchargé.
    const g = game();
    const kind = part === 'ini' ? undefined : (part as NeedKind);
    if (kind) {
      const offers = (['vpforums', 'vpuniverse'] as MediaSiteId[]).flatMap((s) => (p?.sites[s]?.state === 'done' ? p.sites[s].offers : []));
      for (const o of [...offers.filter((x) => !x.other), ...offers.filter((x) => x.other)]) {
        if (cards.length >= MAX_PROPOSALS) break;
        cards.push({
          action: actions.length,
          title: o.hit.title,
          code: mediaSite(o.hit.site).name,
          flag: o.other ? { label: t('Autre jeu'), tone: 'warning' } : undefined,
          popularity: o.hit.downloads ? tn(o.hit.downloads, '{n} téléchargement', '{n} téléchargements', { n: formatNumber(o.hit.downloads) }) : undefined,
          facts: [o.hit.category?.label, o.hit.author ? t('par {author}', { author: o.hit.author }) : undefined, o.hit.date ? formatDay(Date.parse(o.hit.date)) : undefined].filter(Boolean).join(' · '),
          extra: mediaSite(o.hit.site).wait ? [t('≈ {n} s d’attente imposée par le site', { n: mediaSite(o.hit.site).wait })] : undefined,
          thumb: siteThumb(o.hit.thumb, partLabel(part)),
        });
        actions.push({ label: o.hit.title, key: `${o.hit.site}:${o.hit.id}`, run: () => ctx.catalog.fetchPart({ ...target(table, kind), kind }, { url: o.hit.url, label: o.hit.title }, after) });
      }
    }
    for (const c of p?.downloads ?? []) {
      if (cards.length >= MAX_PROPOSALS) break;
      cards.push({
        action: actions.length,
        title: path.basename(c.file),
        code: t('Téléchargé'),
        state: { label: t('Convient'), tone: 'ok' },
        facts: [c.origin, c.seen.summary ?? (c.seen.content ? CONTENT_LABELS[c.seen.content] : undefined), formatSize(fileSize(c.file))].filter(Boolean).join(' · '),
        thumb: { kind: 'fallback', rotation: 0, text: partLabel(part) },
      });
      actions.push({ label: path.basename(c.file), key: `file:${c.file}`, run: () => ctx.install([c.file], table, after) });
    }

    // Les fichiers de VPS : la galerie des fichiers (aperçu, popularité, tri).
    const vpsFiles = webFiles(part);
    if (kind && vpsFiles.length) actions.push({ label: tn(vpsFiles.length, 'Fichier de VPS : le voir', 'Fichiers de VPS : voir les {n} au choix'), detail: t('Aperçu, popularité, auteur, date ; Start ouvre sa page dans « Récupérer »'), tone: cards.length ? undefined : 'ok', run: () => openWeb(table, kind, from) });
    // Toujours : chercher soi-même sur le web, puis le reste.
    actions.push(ctx.catalog.webAction('parts.part', { query: partWebQuery(titleOf(table), part), target: target(table, kind) }, after));
    for (const site of MEDIA_SITES) {
      if (p?.sites[site.id]?.state === 'login' && ctx.sites) actions.push({ label: t('Se connecter à {site}…', { site: site.name }), detail: t('Dans la fenêtre de Cyber Pinball ; votre mot de passe reste au site'), run: () => ctx.sites!.signIn(site.id) });
    }
    if (kind) actions.push({ label: t('Tous les fichiers téléchargés…'), detail: t('Ceux qui ne conviennent pas compris'), run: () => openCandidates(table, kind, from) });
    if (ctx.pick) actions.push({ label: t('Chercher un fichier…'), detail: t('Téléchargements de Cyber Pinball, clé USB, disques'), run: () => void pickFile(table, part, from) });
    if (item?.state === 'received') actions.push({ label: t('Installer ce qui est reçu'), detail: t('Voir le plan'), tone: 'ok', run: () => ctx.catalog.installGame(item.gameId) });
    if (part === 'pup' && here) actions.push({ label: t('Options du PuP-Pack'), detail: t('Disposition des écrans'), run: () => ctx.pupOptions(table) });
    if (part === 'media') actions.push({ label: t('Médias du jeu'), detail: t('Logo, fronton, vidéos, règles : ce que le menu montre'), run: () => ctx.medias(table) });
    if (here && part !== 'table' && part !== 'media') actions.push({ label: t('Réaffecter à une autre table'), detail: t('Elle quitte cette table pour une autre'), run: () => openMove(table, part, from) });
    if (here && part !== 'table') actions.push({ label: t('Retirer de la table'), detail: t('Corbeille de Cyber Pinball'), tone: 'error', run: () => confirmRemove(table, part, from) });
    actions.push({ label: t('Retour : parties du jeu'), run: back });

    const rows: Row[] = [];
    if (here) rows.push({ text: t('Dans la table'), detail: [here.entries.map((e) => (e.dir ? `${e.rel}${path.sep}` : e.rel)).join(' · '), formatSize(here.size)].join(' · '), tone: 'ok' });
    if (item?.received) rows.push({ text: t('Reçu, à installer'), detail: t('{file} · le {date}', { file: path.basename(item.received.file), date: formatDay(Date.parse(item.received.at)) }), tone: 'info' });
    else if (item) rows.push({ text: t('Attendu'), detail: t('{label} · {site}', { label: item.label, site: linkHost(item.page).label }), tone: 'warning' });
    rows.push(...sourceRows(part, p));
    return {
      heading: partLabel(part),
      subheading: [table.title, here ? t('présent') : item?.received ? t('reçu, à installer') : item ? t('attendu') : t('absent')].join(' · '),
      lead: `${PART_LEADS[part]()} ${cards.length ? t('Start sur une proposition : sa page s’ouvre dans « Récupérer » (un fichier téléchargé ouvre le plan) ; le fichier reçu est rangé pour cette table.') : t('Aucune proposition pour l’instant : « Chercher sur le web… » pour la trouver vous-même.')}`,
      sections: [...takeFlash(), { rows }],
      actions,
      back,
      media: cards.length ? { cards, gallery: true, files: true, aspect: '4 / 3' } : undefined,
    };
  }

  /** Une ligne par source : ce qu'elle a donné, ou qu'elle cherche encore. */
  function sourceRows(part: GamePart, p: Proposals | undefined): Row[] {
    const rows: Row[] = [];
    const sources = partSources(part);
    if (sources.includes('vps')) {
      const n = webFiles(part).length;
      rows.push({ text: 'VPS', detail: game() ? (n ? tn(n, '{n} fichier connu pour ce jeu', '{n} fichiers connus pour ce jeu') : t('aucun fichier connu pour ce jeu')) : t('jeu à choisir (« Jeu VPS », sur l’écran des parties) ; les sites cherchent par le titre'), tone: n ? 'ok' : 'quiet' });
    }
    if (sources.includes('downloads')) {
      const n = p?.downloads?.length;
      rows.push({ text: t('Téléchargements'), detail: n === undefined ? t('recherche…') : n ? tn(n, '{n} fichier qui convient', '{n} fichiers qui conviennent') : t('rien qui convienne'), tone: n ? 'ok' : 'quiet' });
    }
    for (const site of MEDIA_SITES) {
      if (!sources.includes(site.id)) continue;
      const s = p?.sites[site.id];
      const detail = !ctx.sites
        ? t('indisponible ici')
        : !s || s.state === 'searching'
          ? t('recherche…')
          : s.state === 'waiting'
            ? t('le site impose d’attendre {n} s entre deux recherches : la recherche reprend ensuite', { n: s.seconds })
          : s.state === 'login'
            ? t('connectez-vous pour chercher (« Se connecter à {site}… »)', { site: site.name })
            : s.state === 'failed'
              ? t('le site n’a pas répondu ({reason}) : « Chercher sur le web… »', { reason: s.reason })
              : s.offers.length
                ? tn(s.offers.length, '{n} proposition', '{n} propositions')
                : t('rien pour ce jeu');
      rows.push({ text: site.name, detail, tone: s?.state === 'done' && s.offers.length ? 'ok' : s?.state === 'login' ? 'warning' : 'quiet' });
    }
    rows.push({ text: t('Web'), detail: t('« Chercher sur le web… » : navigateur intégré, recherche préremplie'), tone: 'quiet' });
    return rows;
  }

  function siteThumb(url: string | undefined, text: string): MediaThumb {
    const local = ctx.sites?.thumb(url);
    if (!local || !fs.existsSync(local)) return { kind: 'fallback', rotation: 0, text };
    allowPreview(local);
    return { kind: 'image', url: mediaUrl(local), rotation: 0 };
  }

  async function pickFile(table: TableEntry, part: GamePart, from: number): Promise<void> {
    const paths = await ctx.pick!({ title: t('{part} : {title}', { part: partLabel(part), title: table.title }), icon: 'inbox', purpose: t('Parties du jeu : {part}', { part: partLabel(part) }), mode: 'file', start: 'cp' });
    if (paths?.length) {
      ctx.catalog.setRefresh(undefined);
      ctx.install(paths, table, () => openPart(table, part, from));
    } else openPart(table, part, from);
  }

  /** Fichiers déjà téléchargés pour cette partie : ceux qui conviennent d'abord ; Start ouvre le plan d'ajout à cette table. */
  function openCandidates(table: TableEntry, part: NeedKind, from: number): void {
    void ctx.task(t('Fichiers déjà téléchargés…'), async () => {
      const candidates = await ctx.catalog.candidates(part);
      const back = () => openPart(table, part, from);
      ctx.catalog.setRefresh(undefined);
      ctx.show(
        () => {
          const actions: Action[] = [];
          const row = (c: (typeof candidates)[number]): Row => {
            const action = actions.length;
            actions.push({ label: path.basename(c.file), detail: c.origin, run: () => ctx.install([c.file], table, back) });
            const fit = partFits(part, c.seen);
            return {
              text: path.basename(c.file),
              detail: [c.origin, c.seen.content ? CONTENT_LABELS[c.seen.content] : undefined, formatSize(fileSize(c.file)), t('le {date}', { date: formatDay(c.mtimeMs) })].filter(Boolean).join(' · '),
              badges: [fit === 'yes' ? t('Convient') : fit === 'unknown' ? t('Non vérifié') : t('Ne convient pas')],
              tone: fit === 'yes' ? 'ok' : fit === 'unknown' ? 'info' : 'quiet',
              action,
              pick: true,
            };
          };
          const good = candidates.filter((c) => partFits(part, c.seen) !== 'no');
          const bad = candidates.filter((c) => partFits(part, c.seen) === 'no');
          const sections: Section[] = [];
          if (good.length) sections.push({ title: t('Conviennent'), rows: good.map(row) });
          if (bad.length) sections.push({ title: t('Autres fichiers'), rows: bad.map(row) });
          if (!candidates.length) sections.push({ rows: [{ text: t('Aucun fichier déjà téléchargé'), detail: t('Ni gardé de côté, ni dans downloads\\acquisition, ni dans Téléchargements depuis un mois.'), tone: 'quiet' }] });
          actions.push(ctx.catalog.webAction('parts.candidates', { query: partWebQuery(titleOf(table), part), target: target(table, part) }, back));
          actions.push({ label: t('Retour'), run: back });
          return {
            heading: t('{part} : {title}', { part: partLabel(part), title: table.title }),
            subheading: t('Depuis Téléchargements'),
            lead: t('Ceux qui conviennent d’abord. Start ouvre le plan d’ajout à cette table : il montre ce qui sera rangé et remplacé, rien n’est écrit avant « Installer ».'),
            sections,
            actions,
            back,
            drop: (paths) => (paths.length ? ctx.install(paths, table, back) : undefined),
          };
        },
        0,
        table.file,
      );
    });
  }

  /**
   * Fichiers de VPS pour cette partie, dans la galerie des fichiers (aperçu, popularité,
   * auteur, date) : Start ouvre sa page dans « Récupérer », pour cette table.
   */
  function openWeb(table: TableEntry, part: NeedKind, from: number): void {
    const g = game();
    if (!g) return openPart(table, part, from);
    const back = () => openPart(table, part, from);
    ctx.catalog.chooseFor(
      {
        game: g,
        kind: part,
        files: webFiles(part),
        heading: t('{part} : au choix', { part: partLabel(part) }),
        subheading: table.title,
        lead: t('Les plus récents d’abord. Start ouvre sa page dans la fenêtre « Récupérer » : le fichier téléchargé est rangé pour cette table.'),
      },
      { table: table.file, back, web: ctx.catalog.webAction('parts.files', { query: partWebQuery(titleOf(table), part), target: target(table, part) }, back) },
    );
  }

  // ---------- Réaffecter, retirer ----------

  /** Où ira chaque fichier de la partie dans le dossier d'une autre table (nommé comme elle, s'il le faut). */
  function moveOps(here: InstalledPart, to: TableEntry): FileOp[] {
    const ops: FileOp[] = [];
    const named = NAMED_LIKE_TABLE[here.part];
    for (const e of here.entries) {
      const dest = named && !e.dir ? path.join(to.folder, `${path.basename(to.file).replace(/\.vpx$/i, '')}${named}`) : path.join(to.folder, e.rel);
      if (fs.existsSync(dest)) ops.push({ op: 'trash', path: dest });
      ops.push({ op: 'move', from: e.path, to: dest });
    }
    return ops;
  }

  function openMove(table: TableEntry, part: GamePart, from: number): void {
    const back = () => openPart(table, part, from);
    ctx.catalog.setRefresh(undefined);
    const others = ctx
      .tables()
      .filter((x) => !samePathText(x.folder, table.folder) && ownFolder(x))
      .filter((x, i, all) => all.findIndex((o) => samePathText(o.folder, x.folder)) === i)
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    ctx.show(
      () => {
        const actions: Action[] = others.map((x) => ({ label: x.title, run: () => move(table, part, x, from) }));
        actions.push({ label: t('Annuler'), run: back });
        return {
          heading: t('Réaffecter : {part}', { part: partLabel(part) }),
          subheading: table.title,
          lead: t('La table qui la reçoit : ses fichiers y sont déplacés, ce qu’elle avait à la place part à la corbeille de Cyber Pinball.'),
          sections: [
            {
              rows: others.length
                ? others.map((x, i) => {
                    const has = partsOf(x).get(part);
                    return { text: x.title, detail: has ? t('a déjà : {files} (remplacé)', { files: has.entries.map((e) => e.rel).join(', ') }) : t('n’en a pas'), tone: has ? ('warning' as const) : undefined, action: i, pick: true };
                  })
                : [{ text: t('Aucune autre table dans son propre dossier'), tone: 'quiet' as const }],
            },
          ],
          actions,
          back,
        };
      },
      0,
      table.file,
    );
  }

  function move(table: TableEntry, part: GamePart, to: TableEntry, from: number): void {
    const here = partsOf(table).get(part);
    if (!here) return open(table, from);
    applyOps(moveOps(here, to), { trashDir: trashDirFor(ctx.layout()!.trash, 'Parties du jeu') }); // i18n-ignore : nom de dossier de la corbeille
    ctx.reload(table.file);
    open(table, from, { text: t('{part} réaffecté à {title}.', { part: partLabel(part), title: to.title }), tone: 'ok' });
  }

  function confirmRemove(table: TableEntry, part: GamePart, from: number): void {
    const here = partsOf(table).get(part);
    if (!here) return open(table, from);
    const back = () => openPart(table, part, from);
    ctx.catalog.setRefresh(undefined);
    ctx.show(
      () => ({
        heading: t('Retirer : {part} ?', { part: partLabel(part) }),
        subheading: table.title,
        lead: t('Les fichiers partent à la corbeille de Cyber Pinball : rien n’est effacé. Une ROM de la bibliothèque y reste ; seule la table ne la voit plus.'),
        sections: [{ rows: here.entries.map((e) => ({ text: e.rel, detail: formatSize(e.size) })) }],
        actions: [
          { label: t('Annuler'), tone: 'ok', run: back },
          { label: t('Retirer de la table'), detail: formatSize(here.size), tone: 'error', run: () => remove(table, part, from) },
        ],
        back,
        variant: 'facts',
      }),
      0,
      table.file,
    );
  }

  function remove(table: TableEntry, part: GamePart, from: number): void {
    const here = partsOf(table).get(part);
    if (!here) return open(table, from);
    const ops: FileOp[] = here.entries.map((e) => ({ op: 'trash', path: e.path }));
    // Sans PuP-Pack, le script que Cyber Pinball avait adapté pour l'allumer n'a plus lieu d'être.
    const patch = table.file.replace(/\.vpx$/i, '.vbs');
    if (part === 'pup' && isScriptPatchFile(patch)) ops.push({ op: 'trash', path: patch });
    applyOps(ops, { trashDir: trashDirFor(ctx.layout()!.trash, 'Parties du jeu') }); // i18n-ignore : nom de dossier de la corbeille
    ctx.reload(table.file);
    open(table, from, { text: t('{part} retiré : dans la corbeille de Cyber Pinball.', { part: partLabel(part) }), tone: 'ok' });
  }

  return { open };
}

/** Ce qu'est chaque partie, en une phrase (tête de son écran). */
const PART_LEADS: Record<GamePart, () => string> = {
  table: () => t('Le fichier .vpx que VPX lance. Une nouvelle version s’ajoute dans le dossier de la table.'),
  b2s: () => t('Le fronton animé (.directb2s), nommé comme la table pour que VPX le charge.'),
  rom: () => t('La ROM que joue PinMAME : rangée dans la bibliothèque, liée dans la table.'),
  pup: () => t('Vidéos sur le fronton et l’afficheur pendant la partie. Un nouveau PuP-Pack remplace l’ancien en entier (l’ancien part à la corbeille).'),
  altcolor: () => t('Couleurs du DMD (Serum, VNI).'),
  altsound: () => t('Sons du jeu remasterisés.'),
  music: () => t('Musique que la table joue pendant la partie.'),
  pov: () => t('Point de vue de la caméra (.pov), nommé comme la table.'),
  topper: () => t('Animation du topper.'),
  ini: () => t('Réglages propres à cette table (.ini nommé comme elle) ; sans eux, ceux de VPX servent.'),
  media: () => t('Logo, fronton, vidéos, règles : ce que montre le menu. Ils se choisissent dans « Médias du jeu ».'),
};

const samePathText = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export type GameParts = ReturnType<typeof createGameParts>;
