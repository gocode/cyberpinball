// Trouver et récupérer une table (docs/recherche/acquisition.md, étapes A3 à A7) :
// catalogue de la base VPS aux boutons, fiche d'un jeu et ses versions, « ce qu'il
// faut » pour cette borne, fenêtre « Récupérer » (acquire-window.ts), liste d'attente,
// surveillance du dossier Téléchargements (downloads-watch.ts), installation par le
// plan d'import existant, mises à jour disponibles. Cœur : packages/core/src/acquisition.ts.
//
// Cyber Pinball ne télécharge rien à la place de l'utilisateur : il montre ce qu'il
// faut, ouvre la page, voit arriver le fichier et le range.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import {
  acquisitionNotice,
  addToWaitList,
  cabinetScreens,
  catalog,
  CATALOG_KIND_LABELS,
  CATALOG_STATE_LABELS,
  formatDay,
  formatList,
  formatSize,
  installedGames,
  linkHost,
  liveLinks,
  listRoms,
  loadCabinet,
  loadWaitList,
  markReceived,
  matchDownload,
  mediaUrl,
  NEED_LABELS,
  readVpxTableInfo,
  recommendVersion,
  requirements,
  samePath,
  siteOfUrl,
  siteState,
  SOURCE_SITES,
  saveWaitList,
  t,
  tn,
  tableRomsDir,
  tableSourceOf,
  tableUpdate,
  versionLabel,
  versionWithoutRom,
  vpsKey,
  vpsLabel,
  vpxVersions,
  type CatalogFilter,
  type CatalogKind,
  type CatalogSort,
  type CatalogState,
  type Layout,
  type MediaDbFile,
  type Need,
  type SiteState,
  type SourceSite,
  type TableEntry,
  type TableUpdate,
  type VpsDb,
  type VpsGame,
  type VpsTableFile,
  type WaitItem,
  type WaitList,
} from '@cyberpinball/core';
import { createAcquirer } from './acquire-window';
import { recentDownloads, watchDownloads } from './downloads-watch';
import type { Action, Built, LibraryHost, Row, Section, Tone } from './library';
import type { MediaCard, MediaThumb } from './library-medias';
import { allowPreview } from './media-protocol';
import type { MediaSearch } from './media-search';

export interface CatalogContext {
  host: LibraryHost;
  layout(): Layout | undefined;
  tablesDir(): string;
  show(build: () => Built, at?: number): void;
  cursor(): number;
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  progress(message: string): void;
  prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  openSystem(): void;
  openNotice(heading: string, lines: string[], then?: () => void): void;
  vps(): Promise<VpsDb | undefined>;
  /** Vignettes de la base VPS, reçues dans le dossier de réception des médias. */
  search: MediaSearch;
  /** Plan d'import existant, le jeu VPS déjà choisi ; la provenance est notée après l'installation. */
  install(paths: string[], acquisition: { gameId: string; items: WaitItem[] }): void;
  /** Dossier Téléchargements de Windows (remplaçable pour les essais). */
  downloadsDir?(): string;
}

/** Jeux par page du catalogue : une page tient sur l'écran, cartes et vignettes comprises. */
const PAGE = 12;

const KINDS: CatalogKind[] = ['all', 'norom', 'ss', 'em', 'original'];
const STATES: CatalogState[] = ['missing', 'all', 'installed'];
const SORTS: CatalogSort[] = ['name', 'recent'];
const SORT_LABELS: Record<CatalogSort, string> = {
  get name() {
    return t('par titre');
  },
  get recent() {
    return t('nouveautés d’abord');
  },
};

const STATE_LABELS: Record<Need['state'], { label: string; tone: Tone }> = {
  have: {
    get label() {
      return t('Déjà là');
    },
    tone: 'ok',
  },
  included: {
    get label() {
      return t('Fourni');
    },
    tone: 'ok',
  },
  todo: {
    get label() {
      return t('À récupérer');
    },
    tone: 'warning',
  },
  optional: {
    get label() {
      return t('Facultatif');
    },
    tone: 'quiet',
  },
  useless: {
    get label() {
      return t('Inutile ici');
    },
    tone: 'quiet',
  },
  unavailable: {
    get label() {
      return t('Introuvable');
    },
    tone: 'error',
  },
};

const WAIT_LABELS: Record<WaitItem['state'], { label: string; tone: Tone }> = {
  waiting: {
    get label() {
      return t('Attendu');
    },
    tone: 'warning',
  },
  received: {
    get label() {
      return t('Reçu');
    },
    tone: 'ok',
  },
  installed: {
    get label() {
      return t('Installé');
    },
    tone: 'quiet',
  },
};

/** « vpuniverse.com · compte nécessaire » : l'hôte d'un lien, et s'il faut un compte. */
const hostLine = (h: { label: string; account: boolean }) => (h.account ? t('{site} · compte nécessaire', { site: h.label }) : h.label);

export function createCatalog(ctx: CatalogContext) {
  const { host } = ctx;
  const filter: CatalogFilter & { page: number } = { kind: 'all', state: 'missing', sort: 'name', page: 0 };
  /** Adresse d'une vignette -> fichier reçu. */
  const thumbs = new Map<string, string>();
  let list: WaitList | undefined;
  /** Dernier message montré en haut des écrans du catalogue. */
  let notice: { text: string; tone: Tone } | undefined;
  /** Écran à redessiner quand un fichier arrive. */
  let refresh: (() => void) | undefined;

  const dataDir = () => host.dataDir;
  const waitList = () => (list ??= loadWaitList(dataDir()));
  const save = () => saveWaitList(dataDir(), waitList());
  const acquisitionDir = () => path.join(ctx.layout()!.downloads, 'acquisition');
  const userDownloads = () => ctx.downloadsDir?.() ?? app.getPath('downloads');

  // ---------- Réception des fichiers ----------

  /** Élément pour lequel la fenêtre « Récupérer » est ouverte. */
  let windowItem: string | undefined;

  function received(file: string, facts: { urls?: string[]; filename: string }, via: 'window' | 'watch', vps: VpsDb | undefined): void {
    const l = waitList();
    // Depuis la fenêtre : ce qu'on y a ouvert, si rien d'autre ne correspond mieux.
    const item = matchDownload(l, facts, vps) ?? (via === 'window' ? l.items.find((i) => i.id === windowItem && i.state === 'waiting') : undefined);
    if (!item) {
      if (via === 'window') notice = { text: t('Reçu « {file} », qui ne correspond à rien d’attendu : il reste dans {folder}.', { file: facts.filename, folder: path.relative(ctx.layout()!.root, path.dirname(file)) }), tone: 'warning' };
      host.broadcast();
      return;
    }
    markReceived(item, file, via, new Date(), facts.urls?.at(-1));
    save();
    notice = { text: t('Reçu pour {game} : {kind}, {label} (« {file} », {size}).', { game: item.gameLabel, kind: NEED_LABELS[item.kind], label: item.label, file: facts.filename, size: formatSize(fileSize(file)) }), tone: 'ok' };
    updateWatch();
    refresh?.();
    host.broadcast();
  }

  let vpsCache: VpsDb | undefined;
  const acquirer = createAcquirer({
    dir: acquisitionDir,
    received: (file, facts) => received(file, facts, 'window', vpsCache),
    progress: (filename, got, total) => {
      notice = {
        text: total ? t('Téléchargement de « {file} » : {got} sur {total}…', { file: filename, got: formatSize(got), total: formatSize(total) }) : t('Téléchargement de « {file} » : {got}…', { file: filename, got: formatSize(got) }),
        tone: 'info',
      };
      host.broadcast();
    },
    failed: (filename, reason) => {
      notice = {
        text: reason === 'cancelled' ? t('Téléchargement annulé : « {file} ». Rien n’a été gardé.', { file: filename }) : t('Téléchargement interrompu : « {file} ». Rien n’a été gardé.', { file: filename }),
        tone: 'warning',
      };
      host.broadcast();
    },
    closed: () => {
      windowItem = undefined;
      refresh?.();
      host.broadcast();
    },
  });

  let watcher: { stop(): void } | undefined;
  /** La surveillance tourne si l'utilisateur l'a voulue et que quelque chose est attendu. */
  function updateWatch(): void {
    const wanted = waitList().watchDownloads === true && waitList().items.some((i) => i.state === 'waiting');
    if (wanted && !watcher) watcher = watchDownloads({ dir: userDownloads(), arrived: (file) => received(file, { filename: path.basename(file) }, 'watch', vpsCache) });
    else if (!wanted && watcher) {
      watcher.stop();
      watcher = undefined;
    }
  }

  // ---------- Entrée et avertissement ----------

  function withNotice(then: () => void): void {
    if (waitList().noticeAcceptedAt) return then();
    ctx.show(() => ({
      heading: t('Trouver une table'),
      subheading: t('À lire une fois'),
      lead: t('Le catalogue de la base VPS : chaque jeu, ses versions pour VPX, et ce qu’il faut pour le jouer sur cette borne.'),
      sections: [
        {
          rows: [
            { text: t('Droits'), detail: acquisitionNotice(), tone: 'warning' },
            {
              text: t('Comptes'),
              detail: t('Les tables se téléchargent sur des forums (vpuniverse.com, vpforums.org…) qui demandent un compte. Créez le vôtre et connectez-vous vous-même dans la fenêtre « Récupérer » : Cyber Pinball ne voit ni ne garde aucun mot de passe.'),
              tone: 'info',
            },
            { text: t('Clavier et souris'), detail: t('Indispensables pour se connecter et télécharger sur ces sites ; le reste se fait aux boutons de la borne.'), tone: 'quiet' },
          ],
        },
      ],
      actions: [
        {
          label: t('J’ai compris : ouvrir le catalogue'),
          tone: 'ok',
          run: () => {
            waitList().noticeAcceptedAt = new Date().toISOString();
            save();
            then();
          },
        },
        { label: t('Retour'), run: () => ctx.openSystem() },
      ],
      back: () => ctx.openSystem(),
    }));
  }

  function open(): void {
    if (!ctx.layout()) return ctx.openNotice(t('Cyber Pinball n’est pas installé'), [t('Lancez « Installer » depuis le lanceur : il crée les dossiers des tables et des téléchargements.')]);
    withNotice(() => openCatalog());
  }

  // ---------- Base VPS, vignettes, état de la borne ----------

  async function vpsDb(): Promise<VpsDb | undefined> {
    vpsCache = await ctx.vps();
    return vpsCache;
  }

  function installed(): Set<string> {
    return installedGames(host.tables().map((t) => t.info));
  }

  /** ROM présentes sur la borne : bibliothèque et dossiers des tables. */
  function romsHere(): Set<string> {
    const names = new Set<string>();
    const L = ctx.layout();
    if (L) for (const name of listRoms(L.roms).keys()) names.add(name.toLowerCase());
    for (const t of host.tables()) for (const name of listRoms(tableRomsDir(t.folder)).keys()) names.add(name.toLowerCase());
    return names;
  }

  /** Vignette d'un jeu ou d'une version : celle de VPS, déjà reçue. */
  function imageOf(item: { imgUrl?: string }): MediaDbFile | undefined {
    return item.imgUrl && /^https:\/\/virtualpinballspreadsheet\.github\.io\/vps-db\/img\//.test(item.imgUrl) ? { url: item.imgUrl } : undefined;
  }

  function gameImage(game: VpsGame): MediaDbFile | undefined {
    return imageOf(game) ?? vpxVersions(game).map(imageOf).find(Boolean) ?? (game.b2sFiles ?? []).map(imageOf).find(Boolean);
  }

  async function fetchThumbs(files: (MediaDbFile | undefined)[]): Promise<void> {
    await ctx.search.stagePreviews(files.filter((f): f is MediaDbFile => Boolean(f)), thumbs, t('Vignettes'));
  }

  function thumbOf(file: MediaDbFile | undefined, text: string): MediaThumb {
    const local = file && thumbs.get(file.url);
    if (!local || !fs.existsSync(local)) return { kind: 'fallback', rotation: 0, text };
    allowPreview(local);
    return { kind: 'image', url: mediaUrl(local), rotation: 0 };
  }

  const gameKind = (g: VpsGame) => (/^EM$/i.test(g.type ?? '') ? t('électromécanique') : /^PM$/i.test(g.type ?? '') ? t('mécanique') : /^SS$/i.test(g.type ?? '') ? t('électronique') : t('type inconnu'));

  function noticeSection(): Section[] {
    const n = notice;
    notice = undefined;
    return n ? [{ rows: [{ text: n.text, tone: n.tone }] }] : [];
  }

  // ---------- Catalogue ----------

  function openCatalog(at = 0): void {
    refresh = undefined;
    void ctx.task(t('Catalogue de la base VPS…'), async () => {
      const db = await vpsDb();
      if (!db) return ctx.openNotice(t('Base VPS indisponible'), [t('La base VPS n’a jamais été téléchargée, et GitHub ne répond pas. Réessayez quand la borne est reliée à Internet.')], () => ctx.openSystem());
      const games = catalog(db, filter, installed());
      filter.page = Math.min(filter.page, Math.max(0, Math.ceil(games.length / PAGE) - 1));
      await fetchThumbs(games.slice(filter.page * PAGE, (filter.page + 1) * PAGE).map(gameImage));
      ctx.show(() => buildCatalog(db, games), at);
    });
  }

  function buildCatalog(db: VpsDb, games: VpsGame[]): Built {
    const here = installed();
    const shown = games.slice(filter.page * PAGE, (filter.page + 1) * PAGE);
    const actions: Action[] = shown.map((g) => ({ label: vpsLabel(g), run: () => openGame(g.id) }));
    const cards: MediaCard[] = shown.map((g, i) => {
      const versions = vpxVersions(g);
      const roms = [...new Set((g.romFiles ?? []).map((r) => r.version).filter(Boolean))];
      const facts = [gameKind(g), tn(versions.length, '{n} version VPX', '{n} versions VPX'), roms.length ? `ROM ${roms.slice(0, 2).join(', ')}` : versions.some((v) => versionWithoutRom(g, v)) ? t('sans ROM') : undefined].filter(Boolean).join(' · ');
      return {
        action: i,
        title: vpsLabel(g),
        state: here.has(g.id) ? { label: t('Installé'), tone: 'ok' } : undefined,
        facts,
        extra: [
          versions[0]!.updatedAt
            ? t('Dernière version : {version}, le {date}', { version: versionLabel(versions[0]!), date: formatDay(versions[0]!.updatedAt) })
            : t('Dernière version : {version}', { version: versionLabel(versions[0]!) }),
        ],
        thumb: thumbOf(gameImage(g), g.name),
      };
    });
    const pages = Math.max(1, Math.ceil(games.length / PAGE));
    const cycle = <T>(values: T[], current: T) => values[(values.indexOf(current) + 1) % values.length]!;
    const again = (at: number) => () => openCatalog(at);
    if (filter.page + 1 < pages) {
      const range = { from: (filter.page + 1) * PAGE + 1, to: Math.min(games.length, (filter.page + 2) * PAGE), total: games.length };
      actions.push({ label: t('Page suivante'), detail: t('{from} à {to} sur {total}', range), run: () => ((filter.page += 1), openCatalog(0)) });
    }
    if (filter.page > 0) actions.push({ label: t('Page précédente'), run: () => ((filter.page -= 1), openCatalog(0)) });
    const fixed = actions.length;
    actions.push(
      {
        label: filter.text ? t('Recherche : « {text} »', { text: filter.text }) : t('Chercher un titre…'),
        detail: filter.text ? t('Start pour changer ; vide pour tout revoir') : t('Titre, initiales (TMNT) ou nom de ROM (t2_l8)'),
        run: () =>
          ctx.prompt(t('Chercher un titre'), t('Titre du jeu'), filter.text ?? '', (text) => {
            if (text !== undefined) {
              filter.text = text.trim() || undefined;
              filter.page = 0;
            }
            openCatalog(0);
          }),
      },
      {
        label: t('Jeux : {value}', { value: CATALOG_KIND_LABELS[filter.kind ?? 'all'] }),
        detail: t('Start : {value}', { value: CATALOG_KIND_LABELS[cycle(KINDS, filter.kind ?? 'all')] }),
        run: () => ((filter.kind = cycle(KINDS, filter.kind ?? 'all')), (filter.page = 0), again(fixed + 1)()),
      },
      {
        label: t('Sur la borne : {value}', { value: CATALOG_STATE_LABELS[filter.state ?? 'all'] }),
        detail: t('Start : {value}', { value: CATALOG_STATE_LABELS[cycle(STATES, filter.state ?? 'all')] }),
        run: () => ((filter.state = cycle(STATES, filter.state ?? 'all')), (filter.page = 0), again(fixed + 2)()),
      },
    );
    if (!filter.text) {
      actions.push({
        label: t('Tri : {value}', { value: SORT_LABELS[filter.sort ?? 'name'] }),
        detail: t('Start : {value}', { value: SORT_LABELS[cycle(SORTS, filter.sort ?? 'name')] }),
        run: () => ((filter.sort = cycle(SORTS, filter.sort ?? 'name')), (filter.page = 0), again(fixed + 3)()),
      });
    }
    const waiting = waitList().items.filter((i) => i.state !== 'installed').length;
    actions.push({ label: t('Liste d’attente'), detail: waiting ? tn(waiting, '{n} élément', '{n} éléments') : t('vide'), run: () => openWaitList() }, { label: t('Retour'), run: () => ctx.openSystem() });
    const sections: Section[] = noticeSection();
    if (!games.length) sections.push({ rows: [{ text: t('Aucun jeu ne correspond'), detail: t('Changez la recherche ou les filtres.'), tone: 'quiet' }] });
    return {
      heading: t('Trouver une table'),
      subheading: [
        tn(games.length, '{n} jeu', '{n} jeux'),
        `${CATALOG_KIND_LABELS[filter.kind ?? 'all']}, ${CATALOG_STATE_LABELS[filter.state ?? 'all']}`,
        pages > 1 ? t('page {page} sur {pages}', { page: filter.page + 1, pages }) : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      lead: db.updatedAt
        ? t('Base VPS du {date}. Choisissez un jeu pour voir ses versions et ce qu’il faut pour le jouer sur cette borne.', { date: formatDay(db.updatedAt.getTime()) })
        : t('Base VPS. Choisissez un jeu pour voir ses versions et ce qu’il faut pour le jouer sur cette borne.'),
      sections,
      actions,
      back: () => ctx.openSystem(),
      media: { cards },
    };
  }

  // ---------- Fiche d'un jeu : ses versions ----------

  function openGame(gameId: string, at = 0): void {
    refresh = undefined;
    void ctx.task(t('Versions du jeu…'), async () => {
      const db = await vpsDb();
      const game = db?.games.find((g) => g.id === gameId);
      if (!game) return openCatalog();
      await fetchThumbs(vpxVersions(game).slice(0, 20).map(imageOf));
      ctx.show(() => buildGame(game), at);
    });
  }

  function installedVersion(game: VpsGame): { source?: string; version?: string } {
    for (const t of host.tables()) {
      const s = tableSourceOf(t.info);
      if (s?.vpsGameId === game.id) return { source: s.vpsFileId, version: s.version };
      if (t.info.Info?.VPSId === game.id) return { version: t.version };
    }
    return {};
  }

  function buildGame(game: VpsGame): Built {
    const advice = recommendVersion(game);
    // La version conseillée d'abord, puis les autres, la plus récente d'abord.
    const versions = vpxVersions(game)
      .sort((x, y) => Number(y.id === advice?.file.id) - Number(x.id === advice?.file.id))
      .slice(0, 20);
    const mine = installedVersion(game);
    const actions: Action[] = versions.map((v) => ({ label: versionLabel(v), run: () => openNeeds(game.id, v.id) }));
    const cards: MediaCard[] = versions.map((v, i) => {
      const features = (v.features ?? []).filter((f) => !/^incl\./i.test(f)).slice(0, 6);
      const included = (v.features ?? []).filter((f) => /^incl\./i.test(f)).map((f) => f.replace(/^incl\.\s*/i, ''));
      const links = liveLinks(v);
      let state: MediaCard['state'];
      if (mine.source === v.id) state = { label: t('Installée'), tone: 'ok' };
      else if (advice?.file.id === v.id) state = { label: t('Conseillée'), tone: 'ok' };
      else if (!links.length) state = { label: t('Aucun lien'), tone: 'error' };
      return {
        action: i,
        title: versionLabel(v),
        code: features.length ? features.join(' · ') : undefined,
        state,
        facts: [
          v.updatedAt ? t('mise à jour le {date}', { date: formatDay(v.updatedAt) }) : undefined,
          included.length ? t('fournit {items}', { items: included.join(', ') }) : undefined,
          links.length ? t('sur {sites}', { sites: [...new Set(links.map((l) => linkHost(l.url).label))].join(', ') }) : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        extra: [v.comment, advice?.file.id === v.id ? t('Conseillée : {reasons}.', { reasons: advice.reasons.join(', ') }) : undefined].filter((x): x is string => Boolean(x)),
        thumb: thumbOf(imageOf(v), versionLabel(v)),
      };
    });
    actions.push({ label: t('Retour au catalogue'), run: () => openCatalog() });
    const count = vpxVersions(game).length;
    const more = count - versions.length;
    return {
      heading: vpsLabel(game),
      subheading: [
        gameKind(game),
        game.theme?.slice(0, 3).join(', '),
        game.players ? tn(game.players, '{n} joueur', '{n} joueurs') : undefined,
        mine.version ? t('installé : {version}', { version: mine.version }) : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      lead: [
        more > 0
          ? t('{n} versions pour VPX : la conseillée, puis la plus récente d’abord (les {shown} plus récentes montrées).', { n: count, shown: versions.length })
          : tn(count, '{n} version pour VPX : la conseillée, puis la plus récente d’abord.', '{n} versions pour VPX : la conseillée, puis la plus récente d’abord.'),
        t('MOD : reprise d’une autre version ; VR : jouable en réalité virtuelle ; nFozzy, Fleep : physique et sons refaits. Choisissez une version pour voir ce qu’il faut.'),
      ].join(' '),
      sections: noticeSection(),
      actions,
      back: () => openCatalog(),
      media: { cards },
    };
  }

  // ---------- Ce qu'il faut pour une version ----------

  function openNeeds(gameId: string, versionId: string, at = 0): void {
    void ctx.task(t('Ce qu’il faut…'), async () => {
      const db = await vpsDb();
      const game = db?.games.find((g) => g.id === gameId);
      const version = game && vpxVersions(game).find((v) => v.id === versionId);
      if (!game || !version) return openCatalog();
      await fetchThumbs([imageOf(version), ...(game.b2sFiles ?? []).slice(0, 1).map(imageOf)]);
      refresh = () => ctx.show(() => buildNeeds(game, version), ctx.cursor());
      ctx.show(() => buildNeeds(game, version), at);
    });
  }

  function needsOf(game: VpsGame, version: VpsTableFile): Need[] {
    return requirements(game, version, { screens: cabinetScreens(loadCabinet(dataDir())), roms: romsHere(), installed: installedVersion(game).source === version.id });
  }

  function itemFor(game: VpsGame, need: Need): WaitItem | undefined {
    return waitList().items.find((i) => i.gameId === game.id && i.kind === need.kind && i.state !== 'installed' && need.files.some((f) => f.id === i.fileId));
  }

  function buildNeeds(game: VpsGame, version: VpsTableFile): Built {
    const needs = needsOf(game, version);
    const actions: Action[] = [];
    const cards: MediaCard[] = [];
    for (const need of needs) {
      const item = itemFor(game, need);
      const st = item ? WAIT_LABELS[item.state] : STATE_LABELS[need.state];
      const canGet = need.files.length > 0 && (need.state === 'todo' || need.state === 'optional' || need.state === 'useless');
      const label = `${NEED_LABELS[need.kind]}${need.kind === 'rom' && need.roms?.length ? ` ${formatList(need.roms, 'or')}` : ''}`;
      const host1 = need.files[0] && liveLinks(need.files[0])[0] ? linkHost(liveLinks(need.files[0])[0]!.url) : undefined;
      const card: MediaCard = {
        title: label,
        code: need.required ? t('indispensable') : undefined,
        state: { label: st.label, tone: st.tone },
        facts: item?.received ? t('reçu : {file}', { file: path.basename(item.received.file) }) : need.detail,
        extra: [
          ...(canGet && host1 ? [whereToGet(need.files.length, host1)] : []),
          ...(need.kind === 'rom' && need.state === 'todo' ? [t('Protégée par le droit d’auteur : Cyber Pinball n’en fournit aucune ; ne la récupérez que si vous y avez droit.')] : []),
        ],
        thumb: need.kind === 'table' ? thumbOf(imageOf(version), t('Table')) : need.kind === 'b2s' ? thumbOf(need.files.map(imageOf).find(Boolean), t('Fronton')) : { kind: 'fallback', rotation: 0, text: label },
      };
      if (canGet) {
        card.action = actions.length;
        actions.push({
          label: item?.state === 'received' ? t('{label} : récupérer de nouveau', { label }) : t('Récupérer : {label}', { label }),
          detail: need.files.length > 1 ? t('{count} au choix', { count: need.files.length }) : host1 ? (host1.account ? t('{site}, compte nécessaire', { site: host1.label }) : host1.label) : undefined,
          tone: need.required && !item ? 'ok' : undefined,
          run: () => (need.files.length > 1 ? openFiles(game, version, need) : get(game, version, need, need.files[0]!)),
        });
      }
      cards.push(card);
    }
    const received = waitList().items.filter((i) => i.gameId === game.id && i.state === 'received');
    const tableReady = received.some((i) => i.kind === 'table');
    if (received.length) {
      actions.push({
        label: t('Préparer l’installation'),
        detail: tableReady
          ? tn(received.length, '{n} fichier reçu : voir le plan', '{n} fichiers reçus : voir le plan')
          : tn(received.length, '{n} fichier reçu (pas encore la table) : voir le plan', '{n} fichiers reçus (pas encore la table) : voir le plan'),
        tone: 'ok',
        run: () => installGame(game.id),
      });
    }
    actions.push({ label: t('Autres versions'), run: () => openGame(game.id) }, { label: t('Liste d’attente'), run: () => openWaitList() });
    const missing = needs.filter((n) => n.required && n.state === 'todo' && !itemFor(game, n));
    return {
      heading: t('Ce qu’il faut : {game}', { game: vpsLabel(game) }),
      subheading: version.updatedAt ? t('Version {version}, du {date}', { version: versionLabel(version), date: formatDay(version.updatedAt) }) : t('Version {version}', { version: versionLabel(version) }),
      lead: missing.length
        ? t('Pour jouer : {items}. Start sur une ligne ouvre sa page dans la fenêtre « Récupérer » : connectez-vous, téléchargez ; le fichier est rangé tout seul dans la liste d’attente.', { items: missing.map((n) => NEED_LABELS[n.kind]).join(', ') })
        : t('Tout l’indispensable est là ou attendu. « Préparer l’installation » montre le plan avant d’écrire quoi que ce soit.'),
      sections: noticeSection(),
      actions,
      back: () => openGame(game.id),
      media: { cards },
    };
  }

  function openFiles(game: VpsGame, version: VpsTableFile, need: Need): void {
    void ctx.task(t('Fichiers au choix…'), async () => {
      await fetchThumbs(need.files.slice(0, 12).map(imageOf));
      const back = () => openNeeds(game.id, version.id);
      ctx.show(() => {
        const files = need.files.slice(0, 12);
        return {
          heading: t('{kind} : au choix', { kind: NEED_LABELS[need.kind] }),
          subheading: vpsLabel(game),
          lead: need.kind === 'b2s' ? t('Les frontons qui vont avec les écrans de la borne d’abord (2 ou 3 écrans, afficheur large), puis les plus récents.') : t('Les plus récents d’abord.'),
          sections: [],
          actions: [...files.map((f) => ({ label: versionLabel(f), run: () => get(game, version, need, f) })), { label: t('Retour'), run: back }],
          back,
          media: {
            cards: files.map((f, i) => {
              const links = liveLinks(f);
              return {
                action: i,
                title: need.kind === 'rom' ? (f.version ?? 'ROM') : versionLabel(f),
                code: (f.features ?? []).slice(0, 4).join(' · ') || undefined,
                facts: [f.updatedAt ? t('le {date}', { date: formatDay(f.updatedAt) }) : undefined, links[0] ? linkHost(links[0].url).label : undefined].filter(Boolean).join(' · '),
                extra: f.comment ? [f.comment] : undefined,
                thumb: thumbOf(imageOf(f), NEED_LABELS[need.kind]),
              };
            }),
          },
        };
      });
    });
  }

  /** Ajoute le fichier à la liste d'attente et ouvre sa page dans la fenêtre « Récupérer ». */
  /**
   * Ajoute le fichier à la liste d'attente et le récupère : directement avec la connexion
   * gardée (« Comptes des sites », réglage « Téléchargement direct »), sinon, ou dès que
   * le site demande quelque chose, en ouvrant sa page dans la fenêtre « Récupérer ».
   */
  function get(game: VpsGame, version: VpsTableFile, need: Need, file: VpsTableFile): void {
    const link = liveLinks(file)[0];
    if (!link) return;
    const item = addToWaitList(waitList(), game, need, file, link.url);
    save();
    windowItem = item.id;
    const host1 = linkHost(link.url);
    const request = {
      url: link.url,
      game: vpsLabel(game),
      expected: t('{kind} : {label}', { kind: NEED_LABELS[need.kind], label: item.label }),
      host: hostLine(host1),
    };
    const showPage = (status?: string) => {
      acquirer.show({ ...request, status });
      updateWatch();
      notice = status
        ? { text: t('Page ouverte : {status}', { status }), tone: 'warning' }
        : { text: t('Page ouverte dans la fenêtre « Récupérer » : {kind} {label}. Le fichier téléchargé y sera rangé tout seul.', { kind: NEED_LABELS[need.kind], label: item.label }), tone: 'info' };
      openNeeds(game.id, version.id);
    };
    const site = siteOfUrl(link.url);
    if (!waitList().directDownload || !site) return showPage();
    void ctx.task(t('Téléchargement direct depuis {site}…', { site: site.label }), async () => {
      if (!siteState(site, await acquirer.siteCookies(site.domain)).connected) {
        return showPage(t('vous n’êtes pas connecté à {site} : connectez-vous dans cette page (ou dans « Comptes des sites »), puis téléchargez.', { site: site.label }));
      }
      const result = await acquirer.direct(link.url, site);
      if (!result.ok) return showPage(`${result.reason.charAt(0).toUpperCase()}${result.reason.slice(1)}.`);
      notice = { text: t('Téléchargement direct de « {file} » ({kind} {label})…', { file: result.filename, kind: NEED_LABELS[need.kind], label: item.label }), tone: 'info' };
      openNeeds(game.id, version.id);
    });
  }

  // ---------- Liste d'attente ----------

  function openWaitList(at = 0): void {
    refresh = () => ctx.show(() => buildWaitList(), ctx.cursor());
    void vpsDb().then(() => ctx.show(() => buildWaitList(), at));
  }

  function buildWaitList(): Built {
    const l = waitList();
    const active = l.items.filter((i) => i.state !== 'installed');
    const games = [...new Map(active.map((i) => [i.gameId, i.gameLabel])).entries()];
    const actions: Action[] = [];
    const sections: Section[] = noticeSection();
    for (const [gameId, label] of games) {
      const items = active.filter((i) => i.gameId === gameId);
      const rows: Row[] = items.map((i) => ({
        text: t('{kind} : {label}', { kind: NEED_LABELS[i.kind], label: i.label }),
        detail: i.received
          ? i.received.via === 'watch'
            ? t('reçu le {date} : {file} (Téléchargements)', { date: formatDay(Date.parse(i.received.at)), file: path.basename(i.received.file) })
            : t('reçu le {date} : {file}', { date: formatDay(Date.parse(i.received.at)), file: path.basename(i.received.file) })
          : t('attendu depuis le {date} · {site}', { date: formatDay(Date.parse(i.addedAt)), site: linkHost(i.page).label }),
        badges: [WAIT_LABELS[i.state].label],
        tone: WAIT_LABELS[i.state].tone,
      }));
      sections.push({ title: label, rows });
      const got = items.filter((i) => i.state === 'received');
      if (got.length) actions.push({ label: t('Installer : {game}', { game: label }), detail: tn(got.length, '{n} fichier reçu : voir le plan', '{n} fichiers reçus : voir le plan'), tone: 'ok', run: () => installGame(gameId) });
      for (const i of items.filter((x) => x.state === 'waiting')) {
        actions.push({
          label: t('Rouvrir : {kind} {label}', { kind: NEED_LABELS[i.kind], label: i.label }),
          detail: label,
          run: () => {
            windowItem = i.id;
            const h = linkHost(i.page);
            acquirer.show({ url: i.page, game: i.gameLabel, expected: t('{kind} : {label}', { kind: NEED_LABELS[i.kind], label: i.label }), host: hostLine(h) });
          },
        });
      }
    }
    if (!active.length) sections.push({ rows: [{ text: t('Rien n’est attendu'), detail: t('Trouver une table, puis « Récupérer » sur ce qu’il faut : chaque fichier ouvert vient ici.'), tone: 'quiet' }] });
    const watching = l.watchDownloads === true;
    actions.push(
      {
        label: watching ? t('Surveiller Téléchargements : oui') : t('Surveiller Téléchargements : non'),
        detail: watching ? t('Ce qui arrive dans votre dossier Téléchargements est rapproché de la liste') : t('Pour ce que vous téléchargez dans votre propre navigateur'),
        run: () => {
          l.watchDownloads = !watching || undefined;
          save();
          updateWatch();
          ctx.show(() => buildWaitList(), ctx.cursor());
        },
      },
      { label: t('Chercher dans Téléchargements'), detail: t('Ce qui y est arrivé depuis l’ajout à la liste'), run: () => scanDownloads() },
    );
    if (l.items.some((i) => i.state === 'installed')) actions.push({ label: t('Oublier les éléments installés'), run: () => ((l.items = l.items.filter((i) => i.state !== 'installed')), save(), ctx.show(() => buildWaitList())) });
    actions.push({ label: t('Retour au catalogue'), run: () => openCatalog() });
    const waitingCount = active.filter((i) => i.state === 'waiting').length;
    const receivedCount = active.filter((i) => i.state === 'received').length;
    return {
      heading: t('Liste d’attente'),
      subheading: `${tn(waitingCount, '{n} attendu', '{n} attendus')} · ${tn(receivedCount, '{n} reçu', '{n} reçus')}`,
      lead: t('Ce que vous récupérez, jeu par jeu. Un fichier téléchargé dans la fenêtre « Récupérer » arrive ici tout seul ; dans votre navigateur, il faut la surveillance de Téléchargements ou « Chercher dans Téléchargements ». Rien n’est installé avant le plan.'),
      sections,
      actions,
      back: () => openCatalog(),
    };
  }

  function scanDownloads(): void {
    const l = waitList();
    const waiting = l.items.filter((i) => i.state === 'waiting');
    const since = new Date(Math.min(...waiting.map((i) => Date.parse(i.addedAt)), Date.now()));
    let found = 0;
    for (const file of recentDownloads(userDownloads(), since)) {
      const item = matchDownload(l, { filename: path.basename(file) }, vpsCache);
      if (!item) continue;
      markReceived(item, file, 'watch');
      found++;
    }
    if (found) save();
    notice = found
      ? { text: tn(found, '{n} fichier retrouvé dans Téléchargements.', '{n} fichiers retrouvés dans Téléchargements.'), tone: 'ok' }
      : { text: t('Rien dans {folder} qui corresponde à la liste d’attente.', { folder: userDownloads() }), tone: 'info' };
    ctx.show(() => buildWaitList(), ctx.cursor());
  }

  // ---------- Installation ----------

  function installGame(gameId: string): void {
    const items = waitList().items.filter((i) => i.gameId === gameId && i.state === 'received' && i.received && fs.existsSync(i.received.file));
    const lost = waitList().items.filter((i) => i.gameId === gameId && i.state === 'received' && (!i.received || !fs.existsSync(i.received.file)));
    for (const i of lost) {
      i.state = 'waiting';
      i.received = undefined;
    }
    if (lost.length) save();
    if (!items.length) {
      notice = { text: t('Les fichiers reçus ont disparu (déplacés ou effacés) : ils sont de nouveau attendus.'), tone: 'warning' };
      return openWaitList();
    }
    ctx.install(
      items.map((i) => i.received!.file),
      { gameId, items },
    );
  }

  /** Après l'installation : éléments installés, copies de la fenêtre « Récupérer » effacées (la table les a). */
  function installedItems(items: WaitItem[]): void {
    for (const i of items) {
      i.state = 'installed';
      if (i.received && samePath(path.dirname(i.received.file), acquisitionDir())) fs.rmSync(i.received.file, { force: true });
    }
    save();
    updateWatch();
  }

  // ---------- Comptes des sites ----------

  /** État de connexion de chaque site source, lu dans les cookies de la session « Récupérer ». */
  async function accountStates(): Promise<{ site: SourceSite; state: SiteState }[]> {
    const out: { site: SourceSite; state: SiteState }[] = [];
    for (const site of SOURCE_SITES) out.push({ site, state: siteState(site, await acquirer.siteCookies(site.domain)) });
    return out;
  }

  function openAccounts(at = 0): void {
    void ctx.task(t('Comptes des sites…'), async () => {
      const states = await accountStates();
      refresh = () => openAccounts(ctx.cursor());
      ctx.show(() => buildAccounts(states), at);
    });
  }

  function buildAccounts(states: { site: SourceSite; state: SiteState }[]): Built {
    const l = waitList();
    const rows: Row[] = states.map(({ site, state }) => ({
      text: site.label,
      detail: state.connected
        ? state.remembered
          ? t('connecté, connexion gardée jusqu’au {date}', { date: formatDay(state.expires!.getTime()) })
          : t('connecté pour cette fois seulement : reconnectez-vous en cochant « Se souvenir de moi » pour la garder')
        : t('pas connecté'),
      badges: [state.connected ? t('Connecté') : t('Pas connecté')],
      tone: state.connected ? (state.remembered ? 'ok' : 'warning') : 'quiet',
    }));
    const actions: Action[] = states.map(({ site, state }) =>
      state.connected
        ? {
            label: t('Se déconnecter : {site}', { site: site.label }),
            detail: t('Efface la connexion gardée par Cyber Pinball pour ce site'),
            run: () =>
              void acquirer.signOut(site.domain).then(() => {
                notice = { text: t('Déconnecté de {site}.', { site: site.label }), tone: 'info' };
                openAccounts(ctx.cursor());
              }),
          }
        : {
            label: t('Se connecter : {site}', { site: site.label }),
            detail: t('Dans la fenêtre « Récupérer » ; cochez « Se souvenir de moi »'),
            tone: 'ok' as const,
            run: () => {
              windowItem = undefined;
              acquirer.show({
                url: site.login,
                game: t('Compte {site}', { site: site.label }),
                expected: t('Connectez-vous, cochez « Se souvenir de moi », puis Fermer (Échap)'),
                host: t('{site} · votre propre compte', { site: site.label }),
              });
              notice = { text: t('Connexion à {site} ouverte : fermez la fenêtre une fois connecté, l’état se met à jour.', { site: site.label }), tone: 'info' };
              openAccounts(ctx.cursor());
            },
          },
    );
    const direct = l.directDownload === true;
    actions.push(
      {
        label: direct ? t('Téléchargement direct : oui') : t('Téléchargement direct : non'),
        detail: direct ? t('« Récupérer » télécharge sans montrer la page quand vous êtes connecté') : t('« Récupérer » ouvre la page ; vous cliquez vous-même'),
        run: () => {
          l.directDownload = !direct || undefined;
          save();
          openAccounts(ctx.cursor());
        },
      },
      { label: t('Retour'), run: () => ctx.openSystem() },
    );
    return {
      heading: t('Comptes des sites'),
      subheading: tn(states.filter((s) => s.state.connected).length, '{n} connecté sur {total}', '{n} connectés sur {total}', { total: states.length }),
      lead: t('Connectez-vous une fois à chaque site, avec votre propre compte : la connexion est gardée d’un démarrage à l’autre, comme dans un navigateur. Cyber Pinball ne voit ni ne garde aucun mot de passe. Avec le téléchargement direct, « Récupérer » télécharge le fichier sans montrer la page, et ouvre la page dès que le site demande quelque chose (vérification, choix, délai).'),
      sections: [...noticeSection(), { rows }],
      actions,
      back: () => ctx.openSystem(),
    };
  }

  // ---------- Mises à jour ----------

  function openUpdates(): void {
    void ctx.task(t('Recherche des mises à jour…'), async () => {
      const db = await vpsDb();
      if (!db) return ctx.openNotice(t('Base VPS indisponible'), [t('Réessayez quand la borne est reliée à Internet.')], () => ctx.openSystem());
      const found: { table: TableEntry; update: TableUpdate }[] = [];
      const seen = new Set<string>();
      for (const [i, table] of host.tables().entries()) {
        ctx.progress(t('Mises à jour : table {n} sur {total}…', { n: i + 1, total: host.tables().length }));
        const source = tableSourceOf(table.info);
        let update = source ? tableUpdate(db, { source }) : undefined;
        if (!update && table.info.Info?.VPSId) {
          // Sans provenance : la recréation que désignent l'auteur et la version écrits dans la table.
          const info = readVpxTableInfo(table.file);
          const game = db.games.find((g) => g.id === table.info.Info!.VPSId);
          const authors = (info?.author ?? '').split(/[,/&+;]|\band\b/i).map((a) => vpsKey(a)).filter((k) => k.length >= 3);
          const file = game && authors.length ? vpxVersions(game).find((f) => (f.authors ?? []).some((a) => authors.includes(vpsKey(a)))) : undefined;
          if (file && info?.version) update = tableUpdate(db, { vpsGameId: game!.id, tableFileId: file.id, version: info.version });
        }
        if (update && !seen.has(`${update.game.id}:${update.latest.id}`)) {
          seen.add(`${update.game.id}:${update.latest.id}`);
          found.push({ table, update });
        }
      }
      ctx.show(() => ({
        heading: t('Mises à jour des tables'),
        subheading: found.length ? tn(found.length, '{n} table à mettre à jour', '{n} tables à mettre à jour') : t('Tout est à jour'),
        lead: t('D’après la provenance notée à l’installation, ou l’auteur et la version écrits dans la table. Start ouvre ce qu’il faut pour la nouvelle version ; rien n’est téléchargé d’office.'),
        sections: found.length
          ? [
              {
                rows: found.map((f, i) => ({
                  text: f.table.title,
                  detail: t('{version} : {reason}', { version: versionLabel(f.update.latest), reason: f.update.reason }),
                  badges: [t('Mise à jour')],
                  tone: 'warning' as const,
                  action: i,
                })),
              },
            ]
          : [{ rows: [{ text: t('Aucune mise à jour connue'), detail: t('Les tables installées sans provenance ni version écrite dedans ne peuvent pas être comparées.'), tone: 'quiet' }] }],
        actions: [...found.map((f) => ({ label: f.table.title, detail: f.update.reason, run: () => openNeeds(f.update.game.id, f.update.latest.id) })), { label: t('Retour'), run: () => ctx.openSystem() }],
        back: () => ctx.openSystem(),
      }));
    });
  }

  function summary(): string {
    const l = waitList();
    const waiting = l.items.filter((i) => i.state === 'waiting').length;
    const got = l.items.filter((i) => i.state === 'received').length;
    return waiting || got ? `${tn(got, '{n} reçu', '{n} reçus')}, ${tn(waiting, '{n} attendu', '{n} attendus')}` : t('vide');
  }

  return {
    open,
    openWaitList: () => (ctx.layout() ? openWaitList() : open()),
    openUpdates,
    openAccounts,
    summary,
    /** Appelé par l'installation, une fois les tables rangées. */
    installed: installedItems,
    /** Reprend la surveillance au démarrage, si elle était voulue. */
    start: () => updateWatch(),
    /** Pour les essais : fenêtre « Récupérer », réception d'un fichier comme par la surveillance. */
    acquirer,
    receive: (file: string, via: 'window' | 'watch') => received(file, { filename: path.basename(file) }, via, vpsCache),
    fileSize,
  };
}

/** « Sur vpuniverse.com (compte nécessaire). », « 3 fichiers au choix, sur … ». */
function whereToGet(files: number, host: { label: string; account: boolean }): string {
  if (files > 1) {
    return host.account
      ? t('{count} fichiers au choix, sur {site} (compte nécessaire).', { count: files, site: host.label })
      : t('{count} fichiers au choix, sur {site}.', { count: files, site: host.label });
  }
  return host.account ? t('Sur {site} (compte nécessaire).', { site: host.label }) : t('Sur {site}.', { site: host.label });
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export type Catalog = ReturnType<typeof createCatalog>;
