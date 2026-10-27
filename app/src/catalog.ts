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
  addPart,
  addToWaitList,
  applyOps,
  attachFile,
  cabinetScreens,
  catalog,
  CATALOG_KIND_LABELS,
  CATALOG_KINDS,
  CATALOG_SITE_LABELS,
  CATALOG_SITES,
  CATALOG_STATE_LABELS,
  classifyContent,
  clearItem,
  contentParts,
  coveredBy,
  CONTENT_LABELS,
  contentFits,
  contentSummary,
  EXPECTED_LABELS,
  forgetStray,
  forgetDownloads,
  CATALOG_STATES,
  CATALOG_SUPPORT_LABELS,
  CATALOG_SUPPORTS,
  formatDay,
  formatList,
  formatNumber,
  formatSize,
  formatTransfer,
  infoFileFor,
  installedGames,
  installedParts,
  isPartialDownload,
  isReceivable,
  linkHost,
  liveLinks,
  listRoms,
  loadCabinet,
  loadWaitList,
  mediaUrl,
  moveToTrash,
  NEED_LABELS,
  partFits,
  placeDownload,
  quickNeeds,
  repairWaitList,
  routeReceived,
  requiredForPlay,
  readInfo,
  readVpxTableInfo,
  reassignFile,
  recommendVersion,
  removeGame,
  removeItem,
  requirements,
  samePath,
  setAside,
  setTableSource,
  siteOfUrl,
  siteState,
  SOURCE_SITES,
  saveWaitList,
  t,
  tn,
  tableContents,
  tableRomsDir,
  tableSourceOf,
  tableUpdate,
  trashDirFor,
  versionLabel,
  versionWithoutRom,
  vpsKey,
  vpsLabel,
  vpxVersions,
  waitListProblems,
  type CatalogFilter,
  type CatalogKind,
  type CatalogSite,
  type CatalogSort,
  type CatalogState,
  type ContentKind,
  type CatalogSupport,
  type IconName,
  type Layout,
  type MediaDbFile,
  type Need,
  type NeedKind,
  type SiteState,
  type SourceSite,
  type TableEntry,
  type TableUpdate,
  type VpsDb,
  type VpsGame,
  type VpsTableFile,
  type WaitItem,
  type WaitList,
  type WaitProblem,
  type WaitRepair,
} from '@cyberpinball/core';
import { createAcquirer } from './acquire-window';
import { createYtDlp } from './ytdlp-tool';
import { archiveEntries } from './archives';
import { recentDownloads, watchDownloads } from './downloads-watch';
import type { PickRequest } from './file-picker';
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
  /** Entonnoir « Ajouter une table », d'où l'on vient : le retour de chaque écran du catalogue. */
  home(): void;
  openNotice(heading: string, lines: string[], then?: () => void): void;
  vps(): Promise<VpsDb | undefined>;
  /** Vignettes de la base VPS, reçues dans le dossier de réception des médias. */
  search: MediaSearch;
  /**
   * Plan d'import existant, le jeu VPS déjà choisi ; la provenance est notée après
   * l'installation. `quick` : installation rapide (médias de VPinMediaDB retenus d'office) ;
   * `journey` : fichiers récupérés pour une table installée, son parcours reprend ensuite (journey.ts).
   */
  install(paths: string[], acquisition: { gameId: string; items: WaitItem[]; quick?: boolean }, journey?: string): void;
  /** Dossier Téléchargements de Windows (remplaçable pour les essais). */
  downloadsDir?(): string;
  /** Parcours « Ce qu'il manque pour jouer » d'une table installée (liste d'attente : « Reprendre »). */
  openJourney?(file: string): void;
  /** Sélecteur de fichiers de Cyber Pinball (file-picker.ts) ; undefined à l'abandon. */
  pick?(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
}

/** Jeux par page du catalogue : une page tient sur l'écran, cartes et vignettes comprises. */
const PAGE = 12;

const SORTS: CatalogSort[] = ['name', 'recent'];
/** Filtres par défaut : tous les jeux pas encore installés, par titre. */
const DEFAULT_FILTER = { kind: 'all', support: 'any', site: 'all', state: 'missing', sort: 'name' } as const;
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

/** Ce que récupère l'installation rapide, dans une phrase : « la table, le fronton et la ROM ». */
const QUICK_LABELS = {
  get table() {
    return t('la table');
  },
  get b2s() {
    return t('le fronton');
  },
  get rom() {
    return t('la ROM');
  },
};

/** « vpuniverse.com · compte nécessaire » : l'hôte d'un lien, et s'il faut un compte. */
const hostLine = (h: { label: string; account: boolean }) => (h.account ? t('{site} · compte nécessaire', { site: h.label }) : h.label);

export function createCatalog(ctx: CatalogContext) {
  const { host } = ctx;
  const filter: CatalogFilter & { page: number } = { ...DEFAULT_FILTER, page: 0 };
  /** Jeux qui ont des médias sur VPinMediaDB : chargé au premier filtre qui en a besoin ; null : index indisponible. */
  let mediaIds: ReadonlySet<string> | null | undefined;
  /** Adresse d'une vignette -> fichier reçu. */
  const thumbs = new Map<string, string>();
  let list: WaitList | undefined;
  /** Dernier message montré en haut des écrans du catalogue. */
  let notice: { text: string; tone: Tone } | undefined;
  /** Écran à redessiner quand un fichier arrive. */
  let refresh: (() => void) | undefined;
  /** Retour de la liste d'attente : là d'où on l'a ouverte (l'entonnoir ou le catalogue). */
  let waitBack: () => void = () => openCatalog();
  /**
   * Installation rapide en cours : une version d'un jeu et les éléments de la liste
   * d'attente qu'elle récupère, l'un après l'autre ; quand tout est reçu, le plan s'ouvre.
   */
  let quick: { gameId: string; versionId: string; items: string[] } | undefined;

  const dataDir = () => host.dataDir;
  const waitList = () => (list ??= loadWaitList(dataDir()));
  const save = () => saveWaitList(dataDir(), waitList());
  const acquisitionDir = () => path.join(ctx.layout()!.downloads, 'acquisition');
  const userDownloads = () => ctx.downloadsDir?.() ?? app.getPath('downloads');

  // ---------- Réception des fichiers ----------

  /** Élément pour lequel la fenêtre « Récupérer » est ouverte. */
  let windowItem: string | undefined;

  // ---------- Contenu des fichiers reçus ----------

  type Seen = { content: ContentKind; summary?: string; parts?: NeedKind[] };
  /** Contenu reconnu de chaque fichier déjà lu (une archive est listée une fois), selon sa taille et sa date. */
  const inspected = new Map<string, { size: number; mtimeMs: number; seen: Seen }>();

  /** Ce que contient un fichier : son extension, et pour une archive ce qu'elle renferme. */
  async function inspect(file: string): Promise<Seen> {
    let st: fs.Stats | undefined;
    try {
      st = fs.statSync(file);
    } catch {
      // Absent : on ne sait rien de plus que son nom.
    }
    const key = path.resolve(file).toLowerCase();
    const known = inspected.get(key);
    if (known && st && known.size === st.size && known.mtimeMs === st.mtimeMs) return known.seen;
    const name = path.basename(file);
    const entries = st ? await archiveEntries(file) : undefined;
    const seen: Seen = { content: classifyContent(name, entries) };
    const summary = contentSummary(name, entries);
    if (summary) seen.summary = summary;
    // Une archive complète apporte plusieurs parties : la table, son fronton, sa ROM…
    const parts = contentParts(name, entries);
    if (parts.length > 1) seen.parts = parts;
    if (st) inspected.set(key, { size: st.size, mtimeMs: st.mtimeMs, seen });
    return seen;
  }

  /**
   * Note le contenu des fichiers reçus qui ne l'ont pas encore : ceux d'une liste tenue par une
   * version qui ne vérifiait rien. Un pack de médias rangé comme table se voit alors à corriger.
   */
  async function noteContents(items: WaitItem[]): Promise<void> {
    let changed = false;
    for (const i of items) {
      if (i.state !== 'received' || !i.received || i.received.content || !fs.existsSync(i.received.file)) continue;
      const seen = await inspect(i.received.file);
      i.received.content = seen.content;
      if (seen.summary) i.received.summary = seen.summary;
      changed = true;
    }
    for (const s of waitList().strays ?? []) {
      if (s.content || !fs.existsSync(s.file)) continue;
      Object.assign(s, await inspect(s.file));
      changed = true;
    }
    // Chaque fichier dans la partie qui lui revient : ce qu'une version précédente (ou une
    // retouche à la main) a laissé dans la mauvaise partie, ou de côté, se range de lui-même.
    const repairs = repairWaitList(waitList(), { tableOf: tableOfGame, vps: vpsCache });
    if (repairs.length) {
      changed = true;
      fixSources(repairs);
      notice = { text: repairs.map(repairText).join(' '), tone: 'info' };
    }
    if (changed) save();
  }

  /** Table installée d'un jeu VPS, et les parties qu'elle a déjà (repairWaitList). */
  function tableOfGame(gameId: string): { file: string; has: (kind: NeedKind) => boolean } | undefined {
    const entry = host.tables().find((x) => (tableSourceOf(x.info)?.vpsGameId ?? x.info.Info?.VPSId) === gameId);
    if (!entry) return undefined;
    let parts: ReturnType<typeof installedParts> | undefined;
    return { file: entry.file, has: (kind) => (parts ??= installedParts(tableContents(entry.file, { ownFolder: !samePath(entry.folder, ctx.tablesDir()) }))).has(kind) };
  }

  /** « « TheMatrixPupPackv1.0.14.zip » : PuP-Pack de The Matrix, déjà installé dans la table. » */
  function repairText(r: WaitRepair): string {
    const file = path.basename(r.file);
    switch (r.repair) {
      case 'moved':
        return t('« {file} » est {content} : rangé comme {kind} de {game} ; {from} est de nouveau attendu.', { file, content: CONTENT_LABELS[r.to.kind], kind: NEED_LABELS[r.to.kind], game: r.to.gameLabel, from: itemName(r.from) });
      case 'swapped':
        return t('« {file} » vient de la page de {to} : il lui revient ; {from} est de nouveau attendu.', { file, to: itemName(r.to), from: itemName(r.from) });
      case 'claimed':
        return r.installed
          ? t('« {file} » : {kind} de {game}, déjà installé dans la table.', { file, kind: NEED_LABELS[r.to.kind], game: r.to.gameLabel })
          : t('« {file} », gardé de côté : rangé comme {kind} de {game}.', { file, kind: NEED_LABELS[r.to.kind], game: r.to.gameLabel });
    }
  }

  /**
   * Un fichier rendu à l'élément de sa page (deux versions d'une table) : la provenance notée
   * dans le .info de la table installée avec lui devient celle de cet élément (mises à jour justes).
   */
  function fixSources(repairs: WaitRepair[]): void {
    for (const r of repairs) {
      if (r.repair !== 'swapped' || r.to.state !== 'installed' || r.to.kind !== 'table') continue;
      for (const entry of host.tables()) {
        const source = tableSourceOf(entry.info);
        if (source?.vpsGameId !== r.from.gameId || source.vpsFileId !== r.from.fileId || path.basename(entry.file).toLowerCase() !== path.basename(r.file).toLowerCase()) continue;
        const infoFile = infoFileFor(entry, ctx.tablesDir());
        const next = setTableSource(readInfo(infoFile), { ...source, vpsFileId: r.to.fileId, version: r.to.version, authors: r.to.authors, updatedAt: r.to.updatedAt, page: r.to.page });
        applyOps([{ op: 'write', path: infoFile, content: JSON.stringify(next, null, 2) + '\n' }], { trashDir: trashDirFor(ctx.layout()!.trash, 'Remplacé à l’import') }); // i18n-ignore : nom de dossier
        host.reload(entry.file);
      }
    }
  }

  /**
   * Un fichier arrive (fenêtre « Récupérer » ou dossier Téléchargements). Il n'est rangé
   * d'office que s'il convient à l'élément : un pack de médias reçu pour la table est gardé
   * de côté, et l'on demande où le ranger. Récupérer de nouveau un élément déjà reçu le
   * remplace ; l'ancien fichier est gardé de côté, rien n'est perdu.
   */
  async function received(file: string, facts: { urls?: string[]; filename: string }, via: 'window' | 'watch', vps: VpsDb | undefined): Promise<void> {
    const seen = await inspect(file);
    const l = waitList();
    const url = facts.urls?.at(-1);
    const place = placeDownload(l, { ...facts, content: seen.content }, vps, via === 'window' ? windowItem : undefined);
    // Rangé dans la partie que dit son contenu, quel que soit l'élément qu'on attendait.
    const routed = routeReceived(l, place, { file, via, url, ...seen });
    if (routed) {
      const item = routed.item;
      save();
      const size = formatSize(fileSize(file));
      notice = {
        text: [
          routed.instead
            ? t('« {file} » est {content}, pas {expected} : rangé comme {kind} de {game} ({size}).', { file: facts.filename, content: CONTENT_LABELS[seen.content], expected: CONTENT_LABELS[routed.instead.kind], kind: NEED_LABELS[item.kind], game: item.gameLabel, size })
            : t('Reçu pour {game} : {kind}, {label} (« {file} », {size}).', { game: item.gameLabel, kind: NEED_LABELS[item.kind], label: item.label, file: facts.filename, size }),
          routed.instead && routed.instead.state === 'waiting' ? t('{item} reste attendu.', { item: itemName(routed.instead) }) : '',
          routed.covered.length ? t('Il apporte aussi {parts} : plus attendus à part.', { parts: formatList(routed.covered.map((c) => NEED_LABELS[c.kind])) }) : '',
          place.verdict === 'unknown' ? t('Contenu non vérifié (archive illisible) : regardez le plan avant d’installer.') : '',
          routed.replaced ? t('L’ancien, « {file} », est gardé de côté.', { file: path.basename(routed.replaced) }) : '',
        ]
          .filter(Boolean)
          .join(' '),
        tone: place.verdict === 'unknown' ? 'warning' : 'ok',
      };
    } else if (place.item) {
      // Jeu deviné d'après le nom, contenu d'une autre partie : rien n'est rangé d'office, on demande.
      setAside(l, { file, via, url, ...seen, expected: place.item.id, suggested: place.better?.id });
      save();
      notice = { text: t('« {file} » est {content}, pas {expected} : où le ranger ?', { file: facts.filename, content: CONTENT_LABELS[seen.content], expected: CONTENT_LABELS[place.item.kind] }), tone: 'warning' };
      // Sur un écran du catalogue : la question tout de suite ; il y reviendra ensuite.
      if (refresh) {
        const back = refresh;
        openStray(file, back);
      }
    } else if (via === 'window') {
      setAside(l, { file, via, url, ...seen, suggested: place.better?.id });
      save();
      notice = { text: t('Reçu « {file} » ({content}), qui ne correspond à rien d’attendu : il est gardé de côté dans la liste d’attente.', { file: facts.filename, content: CONTENT_LABELS[seen.content] }), tone: 'warning' };
    } else {
      // Dossier Téléchargements : ce qui n'a rien à voir avec la liste ne la regarde pas.
      host.broadcast();
      return;
    }
    updateWatch();
    // Installation rapide : la page suivante, ou le plan quand tout est là (un fichier qui ne
    // convient pas l'arrête sur la question « où le ranger ? »).
    if (routed && quick?.items.includes(routed.item.id)) return quickStep();
    refresh?.();
    host.broadcast();
  }

  let vpsCache: VpsDb | undefined;
  // yt-dlp, téléchargé à la première demande (<racine>\tools\yt-dlp) ; Cyber Pinball lui sert de moteur JavaScript.
  // CYBERPINBALL_YTDLP : un outil tout prêt, sans installation (essais).
  const ytdlp = createYtDlp({ root: () => ctx.layout()?.root, node: process.execPath, override: () => process.env.CYBERPINBALL_YTDLP || undefined });
  const acquirer = createAcquirer({
    dir: acquisitionDir,
    received: (file, facts) => void received(file, facts, 'window', vpsCache),
    progress: (filename, progress) => {
      notice = {
        text: t('Téléchargement de « {file} » : {progress}…', { file: filename, progress: formatTransfer(progress, true) }),
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
    screen: () => host.browserScreen?.(),
    exitKeys: () => host.keys().exit,
    navKeys: () => host.keys(),
    grabVideo: ytdlp,
  });

  let watcher: { stop(): void } | undefined;
  /** La surveillance tourne si l'utilisateur l'a voulue et que quelque chose est attendu. */
  function updateWatch(): void {
    const wanted = waitList().watchDownloads === true && waitList().items.some((i) => i.state === 'waiting');
    if (wanted && !watcher) watcher = watchDownloads({ dir: userDownloads(), arrived: (file) => void received(file, { filename: path.basename(file) }, 'watch', vpsCache) });
    else if (!wanted && watcher) {
      watcher.stop();
      watcher = undefined;
    }
  }

  // ---------- Entrée et avertissement ----------

  function withNotice(then: () => void, back: () => void = () => ctx.home()): void {
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
        { label: t('Retour'), run: back },
      ],
      back,
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

  const extras = () => ({ media: mediaIds ?? undefined });
  const games = (db: VpsDb, f: CatalogFilter = filter) => catalog(db, f, installed(), extras());

  /** L'index de VPinMediaDB, pour le filtre de ses médias : chargé une fois, au premier besoin. */
  async function needMediaIds(): Promise<void> {
    if (filter.support !== 'media' || mediaIds !== undefined) return;
    ctx.progress(t('Index de VPinMediaDB…'));
    const { db } = await ctx.search.index();
    mediaIds = db ? new Set(db.entries.keys()) : null;
  }

  /** Catalogue ; `text` : une recherche toute faite (titre, initiales, nom de ROM), pour un autre écran qui y mène. */
  function openCatalog(at = 0, text?: string): void {
    refresh = undefined;
    if (text !== undefined) {
      filter.text = text.trim() || undefined;
      filter.page = 0;
    }
    void ctx.task(t('Catalogue de la base VPS…'), async () => {
      const db = await vpsDb();
      if (!db) return ctx.openNotice(t('Base VPS indisponible'), [t('La base VPS n’a jamais été téléchargée, et GitHub ne répond pas. Réessayez quand la borne est reliée à Internet.')], () => ctx.home());
      await needMediaIds();
      const found = games(db);
      filter.page = Math.min(filter.page, Math.max(0, Math.ceil(found.length / PAGE) - 1));
      await fetchThumbs(found.slice(filter.page * PAGE, (filter.page + 1) * PAGE).map(gameImage));
      ctx.show(() => buildCatalog(db, found), at);
    });
  }

  /** Filtres choisis, hors valeurs par défaut : « électroniques · vpuniverse.com · avec un PuP-Pack ». */
  function activeFilters(): string[] {
    return [
      (filter.kind ?? 'all') !== 'all' ? CATALOG_KIND_LABELS[filter.kind!] : undefined,
      (filter.support ?? 'any') !== 'any' ? CATALOG_SUPPORT_LABELS[filter.support!] : undefined,
      (filter.site ?? 'all') !== 'all' ? CATALOG_SITE_LABELS[filter.site!] : undefined,
    ].filter((x): x is string => Boolean(x));
  }

  function buildCatalog(db: VpsDb, found: VpsGame[]): Built {
    const here = installed();
    const shown = found.slice(filter.page * PAGE, (filter.page + 1) * PAGE);
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
    const pages = Math.max(1, Math.ceil(found.length / PAGE));
    if (filter.page + 1 < pages) {
      const range = { from: (filter.page + 1) * PAGE + 1, to: Math.min(found.length, (filter.page + 2) * PAGE), total: found.length };
      actions.push({ label: t('Page suivante'), detail: t('{from} à {to} sur {total}', range), run: () => ((filter.page += 1), openCatalog(0)) });
    }
    if (filter.page > 0) actions.push({ label: t('Page précédente'), run: () => ((filter.page -= 1), openCatalog(0)) });
    const active = activeFilters();
    const state = CATALOG_STATE_LABELS[filter.state ?? 'all'];
    actions.push(
      {
        label: filter.text ? t('Recherche : « {text} »', { text: filter.text }) : t('Chercher un titre…'),
        icon: 'search',
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
        label: active.length ? t('Filtres : {list}', { list: active.join(' · ') }) : t('Filtres et tri'),
        icon: 'filter',
        detail: t('{state}, {sort} · Start pour les changer', { state, sort: filter.text ? t('ordre de la recherche') : SORT_LABELS[filter.sort ?? 'name'] }),
        run: () => openFilters(),
      },
    );
    const waiting = waitList().items.filter((i) => i.state !== 'installed').length;
    actions.push({ label: t('Récupérés et attendus'), detail: waiting ? summary() : t('vide'), icon: 'inbox', run: () => openWaitList(undefined, () => openCatalog()) }, { label: t('Retour'), icon: 'back', run: () => ctx.home() });
    const sections: Section[] = noticeSection();
    if (!found.length) {
      const why = filter.support === 'media' && mediaIds === null ? t('L’index de VPinMediaDB n’a pas pu être téléchargé : réessayez quand la borne est reliée à Internet.') : t('Changez la recherche ou les filtres.');
      sections.push({ rows: [{ text: t('Aucun jeu ne correspond'), detail: why, tone: 'quiet' }] });
    }
    return {
      heading: t('Trouver une table'),
      subheading: [tn(found.length, '{n} jeu', '{n} jeux'), [...active, state].join(', '), pages > 1 ? t('page {page} sur {pages}', { page: filter.page + 1, pages }) : undefined]
        .filter(Boolean)
        .join(' · '),
      lead: db.updatedAt
        ? t('Base VPS du {date}. Choisissez un jeu pour voir ses versions et l’installer.', { date: formatDay(db.updatedAt.getTime()) })
        : t('Base VPS. Choisissez un jeu pour voir ses versions et l’installer.'),
      sections,
      actions,
      back: () => ctx.home(),
      media: { cards },
    };
  }

  // ---------- Filtres du catalogue ----------

  type FilterKey = 'kind' | 'support' | 'site' | 'state' | 'sort';
  const FILTER_ICONS: Record<FilterKey, IconName> = { kind: 'tables', support: 'folder', site: 'monitor', state: 'cabinet', sort: 'sort' };
  /** Chaque filtre : ses valeurs dans l'ordre de Start, leur libellé, et ce que dit la ligne. */
  const FILTERS: { key: FilterKey; name: () => string; values: readonly string[]; label: (v: string) => string; line: (v: string) => string }[] = [
    { key: 'kind', name: () => t('Jeux'), values: CATALOG_KINDS, label: (v) => CATALOG_KIND_LABELS[v as CatalogKind], line: (v) => t('Jeux : {value}', { value: CATALOG_KIND_LABELS[v as CatalogKind] }) },
    { key: 'support', name: () => t('Fichiers'), values: CATALOG_SUPPORTS, label: (v) => CATALOG_SUPPORT_LABELS[v as CatalogSupport], line: (v) => t('Fichiers : {value}', { value: CATALOG_SUPPORT_LABELS[v as CatalogSupport] }) },
    { key: 'site', name: () => t('Site'), values: CATALOG_SITES, label: (v) => CATALOG_SITE_LABELS[v as CatalogSite], line: (v) => t('Site : {value}', { value: CATALOG_SITE_LABELS[v as CatalogSite] }) },
    { key: 'state', name: () => t('Sur la borne'), values: CATALOG_STATES, label: (v) => CATALOG_STATE_LABELS[v as CatalogState], line: (v) => t('Sur la borne : {value}', { value: CATALOG_STATE_LABELS[v as CatalogState] }) },
    { key: 'sort', name: () => t('Tri'), values: SORTS, label: (v) => SORT_LABELS[v as CatalogSort], line: (v) => t('Tri : {value}', { value: SORT_LABELS[v as CatalogSort] }) },
  ];
  const valueOf = (key: FilterKey) => (filter[key] ?? DEFAULT_FILTER[key]) as string;
  const isDefault = () => FILTERS.every((f) => valueOf(f.key) === DEFAULT_FILTER[f.key]);

  function openFilters(at = 0): void {
    refresh = undefined;
    void ctx.task(t('Filtres du catalogue…'), async () => {
      const db = await vpsDb();
      if (!db) return openCatalog();
      await needMediaIds();
      ctx.show(() => buildFilters(db), at);
    });
  }

  /**
   * Filtres du catalogue : une ligne par filtre, Start passe à la valeur suivante ; à côté,
   * les valeurs du filtre choisi et le nombre de jeux de chacune, les autres filtres gardés.
   */
  function buildFilters(db: VpsDb): Built {
    const count = games(db).length;
    const total = catalog(db, { state: 'all' }, installed()).length;
    const see = () => ((filter.page = 0), openCatalog(0));
    const shown = FILTERS.filter((f) => f.key !== 'sort' || !filter.text);
    const actions: Action[] = shown.map((f, i) => {
      const current = valueOf(f.key);
      const next = f.values[(f.values.indexOf(current) + 1) % f.values.length]!;
      return {
        label: f.line(current),
        detail: t('Start : {value}', { value: f.label(next) }),
        icon: FILTER_ICONS[f.key],
        run: () => {
          (filter as Record<FilterKey, string>)[f.key] = next;
          filter.page = 0;
          if (next === 'media' && mediaIds === undefined) return openFilters(i);
          ctx.show(() => buildFilters(db), i);
        },
      };
    });
    if (!isDefault()) {
      actions.push({
        label: t('Effacer les filtres'),
        detail: t('Tous les jeux, pas encore installés, par titre'),
        icon: 'close',
        run: () => {
          Object.assign(filter, DEFAULT_FILTER, { page: 0 });
          ctx.show(() => buildFilters(db), 0);
        },
      });
    }
    actions.push({ label: count ? tn(count, 'Voir le jeu', 'Voir les {n} jeux') : t('Aucun jeu : revenir au catalogue'), tone: count ? 'ok' : undefined, icon: 'check', run: see });
    // Les valeurs du filtre sous le curseur, chacune avec son nombre de jeux.
    const focus = shown[Math.min(ctx.cursor(), actions.length - 1)];
    const sections: Section[] = [];
    if (focus && focus.key !== 'sort') {
      sections.push({
        title: t('{filter} : les choix', { filter: focus.name() }),
        rows: focus.values.map((v) => {
          const n = v === 'media' && !mediaIds ? undefined : games(db, { ...filter, [focus.key]: v }).length;
          return {
            text: focus.label(v),
            detail: n === undefined ? t('index de VPinMediaDB à télécharger (Start)') : tn(n, '{n} jeu', '{n} jeux'),
            badges: v === valueOf(focus.key) ? [t('choisi')] : undefined,
            tone: v === valueOf(focus.key) ? ('ok' as const) : n === 0 ? ('quiet' as const) : undefined,
          };
        }),
      });
    } else sections.push({ title: t('Filtres choisis'), rows: [{ text: activeFilters().join(' · ') || t('aucun'), detail: CATALOG_STATE_LABELS[filter.state ?? 'all'] }] });
    return {
      heading: t('Filtres du catalogue'),
      subheading: t('{count} sur {total}', { count: tn(count, '{n} jeu', '{n} jeux'), total: formatNumber(total) }),
      lead: t('Start change la valeur d’un filtre ; le nombre de jeux suit. « Fichiers » : ce que le jeu propose au téléchargement ; « Site » : où se télécharge la table (ou ces fichiers). Tous les jeux viennent de la base VPS.'),
      sections,
      actions,
      back: see,
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
      // Ce que l'installation rapide récupère pour la version conseillée (une fois : les ROM sont lues sur le disque).
      const advice = recommendVersion(game);
      const fast = advice ? quickNeeds(needsOf(game, advice.file)) : undefined;
      ctx.show(() => buildGame(game, fast), at);
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

  function buildGame(game: VpsGame, fast?: ReturnType<typeof quickNeeds>): Built {
    const advice = recommendVersion(game);
    // La version conseillée d'abord, puis les autres, la plus récente d'abord.
    const versions = vpxVersions(game)
      .sort((x, y) => Number(y.id === advice?.file.id) - Number(x.id === advice?.file.id))
      .slice(0, 20);
    const mine = installedVersion(game);
    // Installation rapide en tête : la version conseillée, d'un coup.
    // Déjà installée (provenance notée) : plus rien d'indispensable à récupérer d'un coup.
    const actions: Action[] = advice && mine.source !== advice.file.id ? [quickAction(game, advice.file, fast)] : [];
    const first = actions.length;
    actions.push(...versions.map((v) => ({ label: versionLabel(v), run: () => openNeeds(game.id, v.id) })));
    const cards: MediaCard[] = versions.map((v, i) => {
      const features = (v.features ?? []).filter((f) => !/^incl\./i.test(f)).slice(0, 6);
      const included = (v.features ?? []).filter((f) => /^incl\./i.test(f)).map((f) => f.replace(/^incl\.\s*/i, ''));
      const links = liveLinks(v);
      let state: MediaCard['state'];
      if (mine.source === v.id) state = { label: t('Installée'), tone: 'ok' };
      else if (advice?.file.id === v.id) state = { label: t('Conseillée'), tone: 'ok' };
      else if (!links.length) state = { label: t('Aucun lien'), tone: 'error' };
      return {
        action: first + i,
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
      await noteContents(waitList().items.filter((i) => i.gameId === game.id));
      await fetchThumbs([imageOf(version), ...(game.b2sFiles ?? []).slice(0, 1).map(imageOf)]);
      refresh = () => ctx.show(() => buildNeeds(game, version), ctx.cursor());
      ctx.show(() => buildNeeds(game, version), at);
    });
  }

  function needsOf(game: VpsGame, version: VpsTableFile): Need[] {
    return requirements(game, version, { screens: cabinetScreens(loadCabinet(dataDir())), roms: romsHere(), installed: installedVersion(game).source === version.id });
  }

  /**
   * Élément de la liste pour ce besoin : celui d'un de ses fichiers VPS ; sinon, hors table (une
   * par version), la partie ajoutée au jeu d'après le contenu d'un fichier reçu.
   */
  function itemFor(game: VpsGame, need: Need): WaitItem | undefined {
    const items = waitList().items.filter((i) => i.gameId === game.id && i.kind === need.kind && i.state !== 'installed');
    return items.find((i) => need.files.some((f) => f.id === i.fileId)) ?? (need.kind === 'table' ? undefined : items[0]);
  }

  function buildNeeds(game: VpsGame, version: VpsTableFile): Built {
    const needs = needsOf(game, version);
    const actions: Action[] = [];
    const cards: MediaCard[] = [];
    const sections = noticeSection();
    const running = quick?.gameId === game.id && quick.versionId === version.id;
    if (running) {
      const items = quickItems();
      const got = items.filter((i) => i.state !== 'waiting');
      const next = items.find((i) => i.state === 'waiting');
      sections.push({
        rows: [
          {
            text: t('Installation rapide : {got} sur {total} reçus', { got: got.length, total: items.length }),
            detail: next
              ? acquirer.isOpen()
                ? t('Page ouverte : {kind} {label}. La suivante s’ouvre d’elle-même ; le plan, quand tout est là.', { kind: NEED_LABELS[next.kind], label: next.label })
                : t('Fenêtre « Récupérer » fermée : « Continuer » rouvre la page de {kind} {label}.', { kind: NEED_LABELS[next.kind], label: next.label })
              : undefined,
            tone: 'info',
          },
        ],
      });
      // Tout l'indispensable est reçu : ce qui reste (le fronton) est facultatif, le plan peut s'ouvrir.
      if (next && !items.some((i) => i.state === 'waiting' && requiredForPlay(i.kind))) {
        actions.push({ label: t('Installer sans attendre'), detail: t('{kind} : facultatif, reste dans la liste d’attente', { kind: NEED_LABELS[next.kind] }), tone: 'ok', icon: 'download', run: () => quickDone(game.id) });
      }
      if (next && !acquirer.isOpen()) actions.push({ label: t('Continuer l’installation rapide'), detail: t('{kind} : {label}', { kind: NEED_LABELS[next.kind], label: next.label }), tone: 'ok', icon: 'download', run: () => fetchItem(next, () => openNeeds(game.id, version.id)) });
      actions.push({ label: t('Arrêter l’installation rapide'), detail: t('Ce qui est reçu reste dans la liste d’attente'), icon: 'close', run: () => stopQuick(game, version) });
    } else {
      const fast = quickNeeds(needs);
      const installedHere = needs.some((n) => n.kind === 'table' && n.state === 'have');
      if (!installedHere && fast.get.some((n) => !itemFor(game, n) || itemFor(game, n)!.state === 'waiting')) actions.push(quickAction(game, version, fast, recommendVersion(game)?.file.id === version.id));
    }
    for (const need of needs) {
      const item = itemFor(game, need);
      const issue = item && problemOf(item);
      // Apporté par le fichier reçu d'une autre partie (archive complète) : rien à récupérer à part.
      const cover = item ? undefined : coveredBy(waitList(), game.id, need.kind);
      const st = issue ? { label: t('À corriger'), tone: 'error' as const } : item ? WAIT_LABELS[item.state] : cover ? STATE_LABELS.included : STATE_LABELS[need.state];
      const canGet = need.files.length > 0 && (need.state === 'todo' || need.state === 'optional' || need.state === 'useless');
      const label = `${NEED_LABELS[need.kind]}${need.kind === 'rom' && need.roms?.length ? ` ${formatList(need.roms, 'or')}` : ''}`;
      const host1 = need.files[0] && liveLinks(need.files[0])[0] ? linkHost(liveLinks(need.files[0])[0]!.url) : undefined;
      const card: MediaCard = {
        title: label,
        code: need.required ? t('indispensable') : undefined,
        state: { label: st.label, tone: st.tone },
        facts: item?.received
          ? issue
            ? t('reçu : {file} — {problem}', { file: path.basename(item.received.file), problem: problemText(issue) })
            : t('reçu : {file}', { file: path.basename(item.received.file) })
          : cover?.received
            ? t('dans « {file} », reçu avec {kind}', { file: path.basename(cover.received.file), kind: NEED_LABELS[cover.kind] })
            : need.detail,
        extra: [
          ...(canGet && host1 ? [whereToGet(need.files.length, host1)] : []),
          ...(need.kind === 'rom' && need.state === 'todo' ? [t('Protégée par le droit d’auteur : Cyber Pinball n’en fournit aucune ; ne la récupérez que si vous y avez droit.')] : []),
        ],
        thumb: need.kind === 'table' ? thumbOf(imageOf(version), t('Table')) : need.kind === 'b2s' ? thumbOf(need.files.map(imageOf).find(Boolean), t('Fronton')) : { kind: 'fallback', rotation: 0, text: label },
      };
      if (issue) {
        // Mauvais fichier rangé : le corriger d'abord (réaffecter, vider, remplacer).
        card.action = actions.length;
        actions.push({ label: t('{label} : à corriger', { label }), detail: problemText(issue), tone: 'warning', run: () => openItem(item!.id) });
      } else if (canGet) {
        card.action = actions.length;
        actions.push({
          label: item?.state === 'received' ? t('{label} : récupérer de nouveau', { label }) : t('Récupérer : {label}', { label }),
          detail: need.files.length > 1 ? t('{count} au choix', { count: need.files.length }) : host1 ? (host1.account ? t('{site}, compte nécessaire', { site: host1.label }) : host1.label) : undefined,
          tone: need.required && !item ? 'ok' : undefined,
          run: () => (need.files.length > 1 ? openFiles(game, version, need) : get(game, need, need.files[0]!, () => openNeeds(game.id, version.id))),
        });
      }
      cards.push(card);
    }
    // Parties ajoutées au jeu d'après le contenu d'un fichier reçu, que VPS ne liste pas pour cette version.
    for (const extra of waitList().items.filter((i) => i.gameId === game.id && i.state !== 'installed' && i.kind !== 'table' && !needs.some((n) => n.kind === i.kind))) {
      const issue = problemOf(extra);
      cards.push({
        title: NEED_LABELS[extra.kind],
        state: issue ? { label: t('À corriger'), tone: 'error' } : WAIT_LABELS[extra.state],
        facts: extra.received ? t('reçu : {file}', { file: path.basename(extra.received.file) }) : extra.label,
        extra: [t('Partie ajoutée d’après le contenu d’un fichier reçu.')],
        thumb: { kind: 'fallback', rotation: 0, text: NEED_LABELS[extra.kind] },
        action: actions.length,
      });
      actions.push({ label: itemName(extra), detail: t('Récupérés et attendus'), run: () => openItem(extra.id) });
    }
    const received = waitList().items.filter((i) => i.gameId === game.id && i.state === 'received');
    const tableReady = received.some((i) => i.kind === 'table' && !problemOf(i));
    const apart = problems(game.id).filter((p) => p.problem === 'mismatch');
    if (received.length) {
      // Un fichier à corriger ne retient jamais le reste : il est laissé de côté par le plan.
      actions.push({
        label: t('Préparer l’installation'),
        detail: [
          tableReady
            ? tn(received.length - apart.length, '{n} fichier reçu : voir le plan', '{n} fichiers reçus : voir le plan')
            : tn(received.length - apart.length, '{n} fichier reçu (pas encore la table) : voir le plan', '{n} fichiers reçus (pas encore la table) : voir le plan'),
          apart.length ? t('{items} à corriger à part', { items: apart.map((p) => NEED_LABELS[p.item.kind]).join(', ') }) : '',
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'ok',
        run: () => installGame(game.id),
      });
    }
    actions.push({ label: t('Autres versions'), run: () => openGame(game.id) }, { label: t('Récupérés et attendus'), detail: summary(), run: () => openWaitList(undefined, () => openNeeds(game.id, version.id)) });
    const missing = needs.filter((n) => n.required && n.state === 'todo' && !itemFor(game, n));
    return {
      heading: t('Ce qu’il faut : {game}', { game: vpsLabel(game) }),
      subheading: version.updatedAt ? t('Version {version}, du {date}', { version: versionLabel(version), date: formatDay(version.updatedAt) }) : t('Version {version}', { version: versionLabel(version) }),
      lead: running
        ? t('Installation rapide : chaque page s’ouvre d’elle-même dans la fenêtre « Récupérer », l’indispensable d’abord ; connectez-vous, téléchargez. Dès que l’indispensable est là, « Installer sans attendre » ouvre le plan.')
        : missing.length
          ? t('Pour jouer : {items}. Start sur une ligne ouvre sa page dans la fenêtre « Récupérer » : connectez-vous, téléchargez ; le fichier est rangé tout seul dans la liste d’attente.', { items: missing.map((n) => NEED_LABELS[n.kind]).join(', ') })
          : received.length
            ? t('Tout l’indispensable est là ou attendu. « Préparer l’installation » montre le plan avant d’écrire quoi que ce soit.')
            : t('Tout l’indispensable est là ou attendu : un fichier téléchargé arrive tout seul dans « Récupérés et attendus ».'),
      sections,
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
          actions: [...files.map((f) => ({ label: versionLabel(f), run: () => get(game, need, f, () => openNeeds(game.id, version.id)) })), { label: t('Retour'), run: back }],
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

  /**
   * Ajoute le fichier à la liste d'attente et le récupère : directement avec la connexion
   * gardée (« Comptes des sites », réglage « Téléchargement direct »), sinon, ou dès que
   * le site demande quelque chose, en ouvrant sa page dans la fenêtre « Récupérer ».
   * `after` réaffiche l'écran d'où l'on vient ; `table` : la table installée à qui il manque.
   */
  function get(game: VpsGame, need: Pick<Need, 'kind'>, file: VpsTableFile, after: () => void, table?: string): void {
    const link = liveLinks(file)[0];
    if (!link) return;
    const item = addToWaitList(waitList(), game, need, file, link.url, new Date(), table);
    save();
    fetchItem(item, after);
  }

  /** Récupère un élément de la liste d'attente (page de « Récupérer » ou téléchargement direct) ; `after` réaffiche l'écran d'où l'on vient. */
  function fetchItem(item: WaitItem, after: () => void): void {
    windowItem = item.id;
    const url = item.page;
    const request = {
      url,
      game: item.gameLabel,
      expected: t('{kind} : {label}', { kind: NEED_LABELS[item.kind], label: item.label }),
      host: hostLine(linkHost(url)),
    };
    const showPage = (status?: string) => {
      acquirer.show({ ...request, status });
      updateWatch();
      notice = status
        ? { text: t('Page ouverte : {status}', { status }), tone: 'warning' }
        : { text: t('Page ouverte dans la fenêtre « Récupérer » : {kind} {label}. Le fichier téléchargé y sera rangé tout seul.', { kind: NEED_LABELS[item.kind], label: item.label }), tone: 'info' };
      after();
    };
    const site = siteOfUrl(url);
    if (!waitList().directDownload || !site) return showPage();
    void ctx.task(t('Téléchargement direct depuis {site}…', { site: site.label }), async () => {
      if (!siteState(site, await acquirer.siteCookies(site.domain)).connected) {
        return showPage(t('vous n’êtes pas connecté à {site} : connectez-vous dans cette page (ou dans « Comptes des sites »), puis téléchargez.', { site: site.label }));
      }
      const result = await acquirer.direct(url, site);
      if (!result.ok) return showPage(`${result.reason.charAt(0).toUpperCase()}${result.reason.slice(1)}.`);
      // Déjà reçu entre-temps : la réception a montré la suite (installation rapide comprise).
      if (item.state !== 'waiting') return;
      notice = { text: t('Téléchargement direct de « {file} » ({kind} {label})…', { file: result.filename, kind: NEED_LABELS[item.kind], label: item.label }), tone: 'info' };
      after();
    });
  }

  /** Rouvre la page d'un élément attendu dans la fenêtre « Récupérer ». */
  function reopen(i: WaitItem, after?: () => void): void {
    windowItem = i.id;
    const h = linkHost(i.page);
    acquirer.show({ url: i.page, game: i.gameLabel, expected: t('{kind} : {label}', { kind: NEED_LABELS[i.kind], label: i.label }), host: hostLine(h) });
    updateWatch();
    after?.();
  }

  // ---------- Installation rapide ----------

  /** Action « Installation rapide » d'une version : ce qu'elle récupère, ou ce qui l'empêche. */
  function quickAction(game: VpsGame, version: VpsTableFile, fast: ReturnType<typeof quickNeeds> | undefined, advised = true): Action {
    const name = advised ? t('Version conseillée {version}', { version: versionLabel(version) }) : t('Version {version}', { version: versionLabel(version) });
    const kinds = (fast?.get ?? []).map((n) => QUICK_LABELS[n.kind as keyof typeof QUICK_LABELS] ?? NEED_LABELS[n.kind]);
    return {
      label: t('Installation rapide'),
      icon: 'download',
      detail: fast?.blocked.length
        ? t('{version} : impossible, {items} introuvable', { version: name, items: fast.blocked.map((n) => NEED_LABELS[n.kind]).join(', ') })
        : kinds.length
          ? t('{version} : {items}, puis ses médias de VPinMediaDB', { version: name, items: formatList(kinds) })
          : t('{version} : tout est déjà là ou attendu ; puis ses médias de VPinMediaDB', { version: name }),
      tone: fast?.blocked.length ? undefined : 'ok',
      run: () => quickInstall(game.id, version.id),
    };
  }

  /**
   * Installation rapide d'une version (la conseillée par défaut) : l'indispensable et le
   * fronton conseillé entrent dans la liste d'attente et se récupèrent l'un après l'autre,
   * chaque page ouverte d'elle-même dans « Récupérer » (ou téléchargée directement) ; quand
   * tout est reçu, le plan d'installation s'ouvre, médias de VPinMediaDB compris. Point
   * d'entrée pour tout écran qui sait quel jeu installer (parcours guidé, médecin).
   */
  function quickInstall(gameId: string, versionId?: string): void {
    void ctx.task(t('Installation rapide…'), async () => {
      const db = await vpsDb();
      const game = db?.games.find((g) => g.id === gameId);
      if (!game) return openCatalog();
      const version = versionId ? vpxVersions(game).find((v) => v.id === versionId) : recommendVersion(game)?.file;
      if (!version) {
        notice = { text: t('Aucune version de ce jeu n’a de lien vivant : rien à récupérer.'), tone: 'warning' };
        return openGame(game.id);
      }
      const { get: wanted, blocked } = quickNeeds(needsOf(game, version));
      if (blocked.length) {
        notice = { text: t('Installation rapide impossible : {items} introuvable pour cette version. Choisissez-en une autre.', { items: blocked.map((n) => NEED_LABELS[n.kind]).join(', ') }), tone: 'warning' };
        return openNeeds(game.id, version.id);
      }
      // L'indispensable d'abord (playable.ts) : le fronton conseillé vient après, et ne retient jamais le plan.
      const ordered = [...wanted].sort((a, b) => Number(requiredForPlay(b.kind)) - Number(requiredForPlay(a.kind)));
      const items = ordered.map((need) => itemFor(game, need) ?? addToWaitList(waitList(), game, need, need.files[0]!, liveLinks(need.files[0]!)[0]!.url));
      save();
      quick = { gameId: game.id, versionId: version.id, items: items.map((i) => i.id) };
      quickStep();
    });
  }

  /** Éléments de l'installation rapide en cours, tels qu'ils sont dans la liste d'attente. */
  function quickItems(): WaitItem[] {
    return (quick?.items ?? []).map((id) => waitList().items.find((i) => i.id === id)).filter((i): i is WaitItem => Boolean(i));
  }

  /** Étape suivante de l'installation rapide : le prochain élément attendu, ou le plan quand tout est là. */
  function quickStep(): void {
    if (!quick) return;
    const game = vpsCache?.games.find((g) => g.id === quick!.gameId);
    const version = game && vpxVersions(game).find((v) => v.id === quick!.versionId);
    if (!game || !version) {
      quick = undefined;
      return openCatalog();
    }
    const items = quickItems();
    const next = items.find((i) => i.state === 'waiting');
    if (next) return fetchItem(next, () => openNeeds(game.id, version.id));
    quickDone(game.id);
  }

  /** Fin de l'installation rapide : la fenêtre se ferme, le plan s'ouvre (un fronton encore attendu le reste). */
  function quickDone(gameId: string): void {
    quick = undefined;
    refresh = undefined;
    if (acquirer.isOpen()) acquirer.close();
    installGame(gameId, true);
  }

  function stopQuick(game: VpsGame, version: VpsTableFile): void {
    quick = undefined;
    notice = { text: t('Installation rapide arrêtée : ce qui est reçu reste dans la liste d’attente.'), tone: 'info' };
    openNeeds(game.id, version.id);
  }

  // ---------- Liste d'attente ----------

  /** Éléments en cours, jeu par jeu, dans l'ordre où ils sont montrés (et leurs actions numérotées). */
  function activeItems(): WaitItem[] {
    const active = waitList().items.filter((i) => i.state !== 'installed');
    const order = [...new Set(active.map((i) => i.gameId))];
    return order.flatMap((g) => active.filter((i) => i.gameId === g));
  }

  /** Rang de l'action d'un élément dans la liste d'attente (le curseur y revient). */
  const itemAction = (id: string) => Math.max(0, activeItems().findIndex((i) => i.id === id));

  /** Éléments à corriger, d'après le contenu noté : fichier disparu, ou qui ne convient pas. */
  const problems = (gameId?: string) => waitListProblems(waitList(), () => undefined).filter((p) => !gameId || p.item.gameId === gameId);
  const problemOf = (item: WaitItem) => problems().find((p) => p.item === item);

  /** « un pack de médias, pas une table » ; « fichier disparu (déplacé ou effacé) ». */
  function problemText(p: WaitProblem): string {
    if (p.problem === 'missing') return t('fichier disparu (déplacé ou effacé)');
    return t('{content}, pas {expected}', { content: CONTENT_LABELS[p.content ?? 'unknown'], expected: CONTENT_LABELS[p.item.kind] });
  }

  /** « Terminator 2 Media Pack.zip · 286 Mo · le 24/10/2026, par la fenêtre « Récupérer » » */
  function receivedLine(r: { file: string; at: string; via: 'window' | 'watch' | 'manual' }): string {
    const via = r.via === 'window' ? t('par la fenêtre « Récupérer »') : r.via === 'watch' ? t('dans Téléchargements') : t('choisi à la main');
    const size = fs.existsSync(r.file) ? formatSize(fileSize(r.file)) : t('disparu');
    return t('{file} · {size} · le {date}, {via}', { file: path.basename(r.file), size, date: formatDay(Date.parse(r.at)), via });
  }

  const contentLine = (seen: { content?: ContentKind; summary?: string }) => (seen.content ? [CONTENT_LABELS[seen.content], seen.summary].filter(Boolean).join(' : ') : t('pas encore vérifié'));
  const itemName = (i: WaitItem) => t('{kind} : {label}', { kind: NEED_LABELS[i.kind], label: i.label });

  /** Récupérés et attendus (liste d'attente) ; `back` : là où revenir (le catalogue par défaut). */
  function openWaitList(at?: number, back?: () => void): void {
    if (back) waitBack = back;
    refresh = () => ctx.show(() => buildWaitList(), ctx.cursor());
    void ctx.task(t('Liste d’attente…'), async () => {
      await vpsDb();
      const l = waitList();
      // Fichiers gardés de côté qui ont disparu depuis : oubliés.
      const gone = (l.strays ?? []).filter((s) => !fs.existsSync(s.file));
      for (const s of gone) forgetStray(l, s.file);
      if (gone.length) save();
      // Réparer l'existant : le contenu des fichiers reçus avant cette vérification est lu une
      // fois et noté ; un pack de médias rangé comme table apparaît alors « à corriger ».
      await noteContents(l.items);
      const first = problems()[0];
      ctx.show(() => buildWaitList(), at ?? (first ? itemAction(first.item.id) : 0));
    });
  }

  function buildWaitList(): Built {
    const l = waitList();
    const active = activeItems();
    const issues = problems();
    const games = [...new Map(active.map((i) => [i.gameId, i.gameLabel])).entries()];
    const actions: Action[] = [];
    const sections: Section[] = noticeSection();
    if (issues.length === 1) sections.push({ rows: [{ text: t('À corriger : {item}, {problem}.', { item: itemName(issues[0]!.item), problem: problemText(issues[0]!) }), detail: t('Start sur l’élément pour le réaffecter, le vider ou le remplacer.'), tone: 'error' }] });
    else if (issues.length) sections.push({ rows: [{ text: tn(issues.length, '{n} élément à corriger', '{n} éléments à corriger'), detail: issues.map((p) => `${itemName(p.item)} : ${problemText(p)}`).join(' · '), tone: 'error' }] });
    for (const [gameId, label] of games) {
      const rows: Row[] = active
        .filter((i) => i.gameId === gameId)
        .map((i) => {
          const action = actions.length;
          actions.push({ label: itemName(i), detail: label, run: () => openItem(i.id) });
          const issue = issues.find((p) => p.item === i);
          const when = i.received
            ? i.received.via === 'watch'
              ? t('reçu le {date} : {file} (Téléchargements)', { date: formatDay(Date.parse(i.received.at)), file: path.basename(i.received.file) })
              : t('reçu le {date} : {file}', { date: formatDay(Date.parse(i.received.at)), file: path.basename(i.received.file) })
            : t('attendu depuis le {date} · {site}', { date: formatDay(Date.parse(i.addedAt)), site: linkHost(i.page).label });
          const along = (i.received?.parts ?? []).filter((k) => k !== i.kind);
          const detail = along.length ? t('{when} · apporte aussi : {parts}', { when, parts: formatList(along.map((k) => NEED_LABELS[k].toLowerCase())) }) : when;
          return {
            text: itemName(i),
            detail: issue ? `${when} — ${problemText(issue)}` : detail,
            badges: [issue ? t('À corriger') : WAIT_LABELS[i.state].label],
            tone: issue ? 'error' : WAIT_LABELS[i.state].tone,
            action,
            pick: true,
          };
        });
      sections.push({ title: label, rows });
    }
    const strays = l.strays ?? [];
    if (strays.length) {
      sections.push({
        title: t('Reçus sans élément'),
        rows: strays.map((s) => {
          const action = actions.length;
          actions.push({ label: path.basename(s.file), run: () => openStray(s.file) });
          return {
            text: path.basename(s.file),
            detail: t('reçu le {date} · {content}', { date: formatDay(Date.parse(s.at)), content: contentLine(s) }),
            badges: [s.expected ? t('À vérifier') : t('De côté')],
            tone: s.expected ? 'warning' : 'info',
            action,
            pick: true,
          };
        }),
      });
    }
    if (!active.length && !strays.length) sections.push({ rows: [{ text: t('Rien n’est attendu'), detail: t('Trouver une table, puis « Récupérer » sur ce qu’il faut : chaque fichier ouvert vient ici.'), tone: 'quiet' }] });
    for (const [gameId, label] of games) {
      const got = active.filter((i) => i.gameId === gameId && i.state === 'received');
      if (!got.length) continue;
      // Ce qui est à corriger reste à part : le reste s'installe.
      const apart = issues.filter((p) => p.item.gameId === gameId && p.problem === 'mismatch');
      const ready = got.filter((i) => !apart.some((p) => p.item === i));
      if (!ready.length) continue;
      actions.push({
        label: t('Installer : {game}', { game: label }),
        detail: [t('{parts} · voir le plan', { parts: formatList(ready.map((i) => NEED_LABELS[i.kind].toLowerCase())) }), apart.length ? t('{items} à corriger à part', { items: apart.map((p) => NEED_LABELS[p.item.kind]).join(', ') }) : ''].filter(Boolean).join(' · '),
        tone: 'ok',
        run: () => installGame(gameId),
      });
    }
    // Ce qu'on récupère pour une table installée : son parcours se reprend d'ici.
    if (ctx.openJourney) {
      for (const file of [...new Set(active.map((i) => i.table).filter((f): f is string => Boolean(f)))]) {
        const table = host.tables().find((x) => samePath(x.file, file));
        if (table) actions.push({ label: t('Reprendre : ce qu’il manque pour jouer {title}', { title: table.title }), tone: 'ok', run: () => ctx.openJourney!(table.file) });
      }
    }
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
    actions.push({ label: t('Retour'), run: () => waitBack() });
    const waitingCount = active.filter((i) => i.state === 'waiting').length;
    const receivedCount = active.filter((i) => i.state === 'received').length;
    return {
      heading: t('Récupérés et attendus'),
      subheading: [tn(waitingCount, '{n} attendu', '{n} attendus'), tn(receivedCount, '{n} reçu', '{n} reçus'), issues.length ? tn(issues.length, '{n} à corriger', '{n} à corriger') : undefined, strays.length ? tn(strays.length, '{n} sans élément', '{n} sans élément') : undefined].filter(Boolean).join(' · '),
      lead: t('Ce que vous récupérez, jeu par jeu. Chaque fichier va dans la partie que dit son contenu, quel que soit l’élément qu’on attendait ; s’il y a un doute, on vous le demande. Start sur un élément : le rouvrir, le réaffecter, le vider ou le remplacer. Rien n’est installé avant le plan.'),
      sections,
      actions,
      back: () => waitBack(),
    };
  }

  // ---------- Un élément de la liste ----------

  function openItem(id: string, at = 0): void {
    refresh = () => ctx.show(() => buildItem(id), ctx.cursor());
    ctx.show(() => buildItem(id), at);
  }

  function buildItem(id: string): Built {
    const back = () => openWaitList(itemAction(id));
    const item = waitList().items.find((i) => i.id === id);
    if (!item) return { heading: t('Élément retiré'), sections: [], actions: [{ label: t('Retour à la liste'), run: () => openWaitList() }], back: () => openWaitList() };
    const issue = problemOf(item);
    const r = item.received;
    const rows: Row[] = [
      {
        text: t('État'),
        detail: issue ? t('reçu, mais {problem}', { problem: problemText(issue) }) : r ? t('reçu') : t('attendu depuis le {date}', { date: formatDay(Date.parse(item.addedAt)) }),
        tone: issue ? 'error' : WAIT_LABELS[item.state].tone,
      },
    ];
    if (r) rows.push({ text: t('Fichier reçu'), detail: receivedLine(r) });
    if (r && issue?.problem !== 'missing') rows.push({ text: t('Contenu'), detail: contentLine(r), tone: issue ? 'error' : contentFits(item.kind, r.content) === 'yes' ? 'ok' : undefined });
    rows.push({ text: t('Attendu'), detail: EXPECTED_LABELS[item.kind] });
    rows.push({ text: t('Page'), detail: hostLine(linkHost(item.page)) });
    const actions: Action[] = [];
    if (r) {
      if (issue?.better) actions.push({ label: t('Réaffecter à : {item}', { item: itemName(issue.better) }), detail: t('Le fichier lui convient'), tone: 'ok', run: () => moveFile({ file: r.file, from: item.id }, issue.better!.id) });
      // Vider vient en tête quand l'élément est à corriger ; sinon après Remplacer : Start sur un
      // élément bien reçu ne propose pas d'office de le vider.
      const empty: Action = { label: t('Vider l’élément'), detail: issue?.problem === 'missing' ? t('Il redevient attendu') : t('Il redevient attendu ; le fichier est gardé de côté'), tone: issue && !issue.better ? 'ok' : undefined, run: () => clear(item.id, true) };
      const replace: Action = { label: t('Remplacer par un autre fichier'), detail: t('Déjà téléchargé, ou en rouvrant la page'), run: () => openReplace(item.id) };
      actions.push(...(issue ? [empty, replace] : [replace, empty]));
      if (issue?.problem !== 'missing') {
        actions.push({ label: t('Réaffecter à un autre élément'), detail: t('Un autre élément de ce jeu ou d’un autre'), run: () => openTargets({ file: r.file, from: item.id }) });
        actions.push({ label: t('Vider, fichier à la corbeille'), detail: t('Corbeille de Cyber Pinball'), tone: 'error', run: () => clear(item.id, false) });
      }
    } else {
      actions.push({ label: t('Rouvrir la page'), detail: hostLine(linkHost(item.page)), tone: 'ok', run: () => reopen(item) });
      actions.push({ label: t('Choisir un fichier déjà téléchargé'), detail: t('Gardé de côté, dans Téléchargements…'), run: () => openReplace(item.id) });
      actions.push({ label: t('Ne plus l’attendre'), detail: t('Retire l’élément de la liste'), run: () => forget(item.id) });
    }
    const count = waitList().items.filter((i) => i.gameId === item.gameId && i.state !== 'installed').length;
    actions.push({ label: t('Retirer tout le jeu de la liste'), detail: tn(count, '{n} élément', '{n} éléments'), run: () => openRemoveGame(item.gameId, () => openItem(id)) });
    actions.push({ label: t('Retour à la liste'), run: back });
    const lead = issue
      ? issue.problem === 'missing'
        ? t('Le fichier reçu a disparu (déplacé ou effacé) : videz l’élément pour le récupérer de nouveau.')
        : t('Le fichier reçu est {content}, pas {expected} : il ne pourrait pas s’installer comme tel.', { content: CONTENT_LABELS[issue.content ?? 'unknown'], expected: CONTENT_LABELS[item.kind] })
      : r
        ? t('Reçu : il sera installé avec le jeu, après le plan.')
        : t('Pas encore reçu : rouvrez la page pour le télécharger, ou choisissez un fichier déjà téléchargé. À la souris, glissez-le sur la fenêtre.');
    return {
      heading: itemName(item),
      subheading: item.gameLabel,
      lead,
      sections: [...noticeSection(), { rows }],
      actions,
      back,
      variant: 'facts',
      drop: (paths) => (paths[0] ? assign(paths[0], item.id, 'manual') : undefined),
    };
  }

  /** Corbeille de Cyber Pinball : jamais d'effacement définitif. */
  function trash(files: string[]): void {
    const existing = files.filter((f) => fs.existsSync(f));
    if (!existing.length) return;
    const trashDir = trashDirFor(ctx.layout()!.trash, 'Liste d’attente'); // i18n-ignore : nom de dossier de la corbeille
    for (const f of existing) moveToTrash(f, { trashDir });
  }

  /** Vide un élément : il redevient attendu ; son fichier est gardé de côté (keep) ou mis à la corbeille. */
  function clear(id: string, keep: boolean): void {
    const l = waitList();
    const item = l.items.find((i) => i.id === id);
    if (!item?.received) return openWaitList();
    const name = path.basename(item.received.file);
    const exists = fs.existsSync(item.received.file);
    const file = clearItem(l, item, keep && exists);
    if (!keep && file) trash([file]);
    const aside = keep && file ? l.strays?.find((s) => samePath(s.file, file)) : undefined;
    if (aside) aside.kept = true;
    save();
    updateWatch();
    notice = {
      text: !exists
        ? t('{item} : de nouveau attendu.', { item: itemName(item) })
        : keep
          ? t('{item} : de nouveau attendu ; « {file} » est gardé de côté.', { item: itemName(item), file: name })
          : t('{item} : de nouveau attendu ; « {file} » est dans la corbeille de Cyber Pinball.', { item: itemName(item), file: name }),
      tone: 'ok',
    };
    openWaitList(itemAction(id));
  }

  /** Ne plus attendre un élément (pas encore reçu). */
  function forget(id: string): void {
    const l = waitList();
    const item = l.items.find((i) => i.id === id);
    if (item) removeItem(l, item, true);
    save();
    updateWatch();
    if (item) notice = { text: t('{item} : retiré de la liste d’attente.', { item: itemName(item) }), tone: 'ok' };
    openWaitList();
  }

  /**
   * Rattache un fichier choisi (à la main, glissé, gardé de côté) à un élément ; s'il ne
   * lui convient pas, on demande d'abord. L'ancien fichier de l'élément est gardé de côté.
   */
  function assign(file: string, id: string, via: 'manual' | 'window' | 'watch', back = () => openItem(id)): void {
    void ctx.task(t('Vérification du fichier…'), async () => {
      const item = waitList().items.find((i) => i.id === id);
      if (!item || !fs.existsSync(file)) return back();
      const seen = await inspect(file);
      const stray = waitList().strays?.find((s) => samePath(s.file, file));
      // Rattaché quand même : son choix, jamais réorienté d'office (repairWaitList).
      const forced = partFits(item.kind, seen) === 'no';
      const go = () => {
        const replaced = attachFile(waitList(), item, { file, via: stray?.via ?? via, url: stray?.url, at: stray?.at, ...seen, ...(forced ? { forced } : {}) });
        save();
        updateWatch();
        notice = { text: [t('« {file} » rattaché à {item}.', { file: path.basename(file), item: itemName(item) }), replaced ? t('L’ancien, « {file} », est gardé de côté.', { file: path.basename(replaced) }) : ''].filter(Boolean).join(' '), tone: 'ok' };
        openWaitList(itemAction(id));
      };
      if (forced) confirmMismatch(file, seen, item, go, back);
      else go();
    });
  }

  /** Déplace un fichier (celui d'un élément, ou gardé de côté) vers un autre élément. */
  function moveFile(src: { file: string; from?: string }, to: string, back?: () => void): void {
    const l = waitList();
    const from = src.from ? l.items.find((i) => i.id === src.from) : undefined;
    const target = l.items.find((i) => i.id === to);
    if (!target) return openWaitList();
    if (!from) return assign(src.file, to, 'manual', back);
    const seen = { content: from.received?.content, summary: from.received?.summary, parts: from.received?.parts };
    const forced = partFits(target.kind, seen) === 'no';
    const go = () => {
      reassignFile(l, from, target);
      if (forced && target.received) target.received.forced = true;
      save();
      updateWatch();
      notice = { text: t('« {file} » rattaché à {item} ; {from} est de nouveau attendu.', { file: path.basename(src.file), item: itemName(target), from: itemName(from) }), tone: 'ok' };
      openWaitList(itemAction(to));
    };
    if (forced) confirmMismatch(src.file, seen, target, go, back ?? (() => openItem(from.id)));
    else go();
  }

  /** Le fichier ne convient pas à l'élément choisi : on le dit, et l'on demande. */
  function confirmMismatch(file: string, seen: { content?: ContentKind; summary?: string }, item: WaitItem, go: () => void, back: () => void): void {
    refresh = undefined;
    ctx.show(() => ({
      heading: t('Ce fichier ne convient pas'),
      subheading: item.gameLabel,
      lead: t('« {file} » est {content}, alors que {item} attend {expected}.', { file: path.basename(file), content: CONTENT_LABELS[seen.content ?? 'unknown'], item: itemName(item), expected: EXPECTED_LABELS[item.kind] }),
      sections: [{ rows: [{ text: t('Contenu'), detail: contentLine(seen), tone: 'warning' }] }],
      actions: [
        { label: t('Annuler'), tone: 'ok', run: back },
        { label: t('Le rattacher quand même'), detail: t('Déconseillé : il ne s’installerait pas comme prévu'), tone: 'warning', run: go },
      ],
      back,
      variant: 'facts',
    }));
  }

  // ---------- Réaffecter, remplacer ----------

  /** Choisir l'élément auquel rattacher un fichier : ceux qu'il remplit d'abord. */
  function openTargets(src: { file: string; from?: string }): void {
    void ctx.task(t('Vérification du fichier…'), async () => {
      const from = src.from ? waitList().items.find((i) => i.id === src.from) : undefined;
      const seen = from?.received?.content ? { content: from.received.content, summary: from.received.summary, parts: from.received.parts } : await inspect(src.file);
      const back = () => (from ? openItem(from.id) : openStray(src.file));
      refresh = undefined;
      ctx.show(() => {
        const targets = activeItems().filter((i) => i.id !== src.from);
        const fits = targets.filter((i) => partFits(i.kind, seen) !== 'no');
        const others = targets.filter((i) => partFits(i.kind, seen) === 'no');
        const actions: Action[] = [];
        const row = (i: WaitItem, good: boolean): Row => {
          const action = actions.length;
          actions.push({ label: itemName(i), detail: i.gameLabel, run: () => moveFile(src, i.id, () => openTargets(src)) });
          const state = i.received ? t('reçu : {file}', { file: path.basename(i.received.file) }) : t('attendu');
          return { text: itemName(i), detail: good ? `${i.gameLabel} · ${state}` : t('{game} · {state} — attend {expected}', { game: i.gameLabel, state, expected: CONTENT_LABELS[i.kind] }), badges: good ? [partFits(i.kind, seen) === 'yes' ? t('Convient') : t('Non vérifié')] : undefined, tone: good ? 'ok' : 'quiet', action, pick: true };
        };
        const sections: Section[] = [];
        if (fits.length) sections.push({ title: t('Conviennent'), rows: fits.map((i) => row(i, true)) });
        if (others.length) sections.push({ title: t('Ne conviennent pas'), rows: others.map((i) => row(i, false)) });
        if (!targets.length) sections.push({ rows: [{ text: t('Aucun autre élément dans la liste d’attente'), tone: 'quiet' }] });
        if (from) actions.push({ label: t('Le garder de côté'), detail: t('{item} redevient attendu', { item: itemName(from) }), run: () => clear(from.id, true) });
        actions.push({ label: t('Retour'), run: back });
        return {
          heading: t('Réaffecter à un autre élément'),
          subheading: t('« {file} » · {content}', { file: path.basename(src.file), content: CONTENT_LABELS[seen.content] }),
          lead: t('Les éléments que ce fichier remplit d’abord. Un élément déjà reçu garde son ancien fichier de côté.'),
          sections,
          actions,
          back,
        };
      });
    });
  }

  /** Fichiers qu'on peut rattacher à la main : gardés de côté, reçus par « Récupérer », arrivés dans Téléchargements. */
  type Candidate = { file: string; origin: string; seen: Seen; mtimeMs: number };
  async function candidatesFor(item: Pick<WaitItem, 'kind'>): Promise<Candidate[]> {
    const l = waitList();
    const taken = new Set(l.items.filter((i) => i.received).map((i) => path.resolve(i.received!.file).toLowerCase()));
    const found = new Map<string, { file: string; origin: string }>();
    const add = (file: string, origin: string) => {
      const key = path.resolve(file).toLowerCase();
      if (!taken.has(key) && !found.has(key) && fs.existsSync(file)) found.set(key, { file, origin });
    };
    for (const s of l.strays ?? []) add(s.file, t('gardé de côté'));
    try {
      for (const name of fs.readdirSync(acquisitionDir())) if (isReceivable(name)) add(path.join(acquisitionDir(), name), t('reçu par « Récupérer »'));
    } catch {
      // Dossier pas encore créé.
    }
    const month = new Date(Date.now() - 31 * 24 * 3600 * 1000);
    for (const file of recentDownloads(userDownloads(), month)) if (isReceivable(path.basename(file))) add(file, t('Téléchargements'));
    const out: Candidate[] = [];
    for (const c of [...found.values()].slice(0, 40)) out.push({ ...c, seen: await inspect(c.file), mtimeMs: fs.statSync(c.file).mtimeMs });
    const rank = (c: Candidate) => ({ yes: 0, unknown: 1, no: 2 })[partFits(item.kind, c.seen)];
    return out.sort((a, b) => rank(a) - rank(b) || b.mtimeMs - a.mtimeMs);
  }

  /** Remplacer le fichier d'un élément (ou en donner un à un élément attendu). */
  function openReplace(id: string): void {
    void ctx.task(t('Fichiers déjà téléchargés…'), async () => {
      const item = waitList().items.find((i) => i.id === id);
      if (!item) return openWaitList();
      const candidates = await candidatesFor(item);
      const back = () => openItem(id);
      refresh = undefined;
      ctx.show(() => {
        const actions: Action[] = [];
        const row = (c: Candidate): Row => {
          const action = actions.length;
          actions.push({ label: path.basename(c.file), detail: c.origin, run: () => assign(c.file, id, 'manual', () => openReplace(id)) });
          const fit = partFits(item.kind, c.seen);
          return {
            text: path.basename(c.file),
            detail: [c.origin, contentLine(c.seen), formatSize(fileSize(c.file)), t('le {date}', { date: formatDay(c.mtimeMs) })].join(' · '),
            badges: [fit === 'yes' ? t('Convient') : fit === 'unknown' ? t('Non vérifié') : t('Ne convient pas')],
            tone: fit === 'yes' ? 'ok' : fit === 'unknown' ? 'info' : 'quiet',
            action,
            pick: true,
          };
        };
        const good = candidates.filter((c) => partFits(item.kind, c.seen) !== 'no');
        const bad = candidates.filter((c) => partFits(item.kind, c.seen) === 'no');
        const sections: Section[] = [];
        if (good.length) sections.push({ title: t('Conviennent'), rows: good.map(row) });
        if (bad.length) sections.push({ title: t('Ne conviennent pas'), rows: bad.map(row) });
        if (!candidates.length) sections.push({ rows: [{ text: t('Aucun fichier déjà téléchargé'), detail: t('Ni gardé de côté, ni dans downloads\\acquisition, ni dans Téléchargements depuis un mois.'), tone: 'quiet' }] });
        if (ctx.pick)
          actions.push({
            label: t('Chercher ailleurs…'),
            detail: t('Téléchargements de Cyber Pinball, clé USB, disques'),
            run: async () => {
              const paths = await ctx.pick!({ title: t('Choisir un fichier : {item}', { item: itemName(item) }), icon: 'inbox', purpose: t('Liste d’attente : {item}', { item: itemName(item) }), mode: 'file', filter: { label: EXPECTED_LABELS[item.kind], extensions: ['vpx', 'directb2s', 'zip', '7z', 'rar', 'mp3', 'ogg', 'wav', 'pov', 'pac', 'vni', 'pal', 'crz', 'cromc', 'mp4', 'png', 'jpg'] }, start: 'cp' });
              if (paths?.[0]) assign(paths[0], id, 'manual', () => openReplace(id));
            },
          });
        actions.push(
          { label: item.received ? t('Rouvrir la page pour le télécharger de nouveau') : t('Rouvrir la page'), detail: hostLine(linkHost(item.page)), tone: good.length ? undefined : 'ok', run: () => reopen(item, back) },
          { label: t('Retour'), run: back },
        );
        return {
          heading: item.received ? t('Remplacer : {item}', { item: itemName(item) }) : t('Choisir un fichier : {item}', { item: itemName(item) }),
          subheading: item.gameLabel,
          lead: t('Ceux qui conviennent d’abord ({expected}). À la souris, vous pouvez aussi glisser un fichier sur la fenêtre.', { expected: EXPECTED_LABELS[item.kind] }),
          sections,
          actions,
          back,
          drop: (paths) => (paths[0] ? assign(paths[0], id, 'manual', () => openReplace(id)) : undefined),
        };
      });
    });
  }

  // ---------- Fichiers reçus sans élément ----------

  function openStray(file: string, back: () => void = () => openWaitList()): void {
    // En partant, l'écran d'où l'on vient se redessine de nouveau à l'arrivée d'un fichier.
    const before = refresh;
    const leave = () => {
      refresh = before;
      back();
    };
    refresh = () => ctx.show(() => buildStray(file, leave), ctx.cursor());
    ctx.show(() => buildStray(file, leave));
  }

  function buildStray(file: string, back: () => void): Built {
    const l = waitList();
    const stray = l.strays?.find((s) => samePath(s.file, file));
    if (!stray) return { heading: t('Fichier rangé'), sections: [], actions: [{ label: t('Retour'), run: back }], back };
    const expected = stray.expected ? l.items.find((i) => i.id === stray.expected) : undefined;
    const suggested = stray.suggested ? l.items.find((i) => i.id === stray.suggested && i.state !== 'installed') : undefined;
    const rows: Row[] = [{ text: t('Reçu'), detail: receivedLine(stray) }, { text: t('Contenu'), detail: contentLine(stray), tone: expected ? 'warning' : undefined }];
    if (expected) rows.push({ text: t('Attendu'), detail: `${itemName(expected)} — ${EXPECTED_LABELS[expected.kind]}` });
    const keep = {
      label: t('Le garder de côté'),
      detail: expected ? t('Rien n’est rattaché ; {item} reste attendu', { item: itemName(expected) }) : t('Pour le rattacher plus tard'),
      run: () => {
        // Gardé exprès : il n'est plus rangé d'office dans une partie (repairWaitList).
        stray.kept = true;
        save();
        back();
      },
    };
    const actions: Action[] = [];
    if (suggested) actions.push({ label: t('Rattacher à : {item}', { item: itemName(suggested) }), detail: t('Le fichier lui convient'), tone: 'ok', run: () => assign(stray.file, suggested.id, stray.via, () => openStray(file, back)) });
    actions.push(suggested ? keep : { ...keep, tone: 'ok' });
    actions.push({ label: t('Rattacher à un autre élément'), detail: t('Choisir dans la liste d’attente'), run: () => openTargets({ file: stray.file }) });
    if (expected) actions.push({ label: t('Le garder pour {item} quand même', { item: itemName(expected) }), detail: t('Déconseillé : il ne s’installerait pas comme prévu'), tone: 'warning', run: () => keepAnyway(stray.file, expected.id) });
    actions.push({
      label: t('Le mettre à la corbeille'),
      detail: t('Corbeille de Cyber Pinball'),
      tone: 'error',
      run: () => {
        forgetStray(l, stray.file);
        trash([stray.file]);
        save();
        notice = { text: t('« {file} » est dans la corbeille de Cyber Pinball.', { file: path.basename(stray.file) }), tone: 'ok' };
        openWaitList();
      },
    });
    return {
      heading: expected ? t('Fichier reçu à vérifier') : t('Fichier gardé de côté'),
      subheading: (expected ?? suggested)?.gameLabel,
      lead: expected
        ? t('« {file} » est arrivé alors que {item} était attendu, mais c’est {content}. Où le ranger ?', { file: path.basename(stray.file), item: itemName(expected), content: CONTENT_LABELS[stray.content ?? 'unknown'] })
        : t('Reçu sans élément qui lui corresponde. Rattachez-le à ce qu’il remplit, ou mettez-le à la corbeille.'),
      sections: [...noticeSection(), { rows }],
      actions,
      back,
      variant: 'facts',
    };
  }

  /** Rattacher un fichier qui ne convient pas, à la demande expresse de l'utilisateur. */
  function keepAnyway(file: string, id: string): void {
    const l = waitList();
    const item = l.items.find((i) => i.id === id);
    const stray = l.strays?.find((s) => samePath(s.file, file));
    if (!item || !stray) return openWaitList();
    attachFile(l, item, { file: stray.file, via: stray.via, url: stray.url, at: stray.at, content: stray.content, summary: stray.summary, parts: stray.parts, forced: true });
    save();
    updateWatch();
    notice = { text: t('« {file} » rattaché à {item}, à votre demande.', { file: path.basename(file), item: itemName(item) }), tone: 'warning' };
    openWaitList(itemAction(id));
  }

  // ---------- Retirer un jeu ----------

  function openRemoveGame(gameId: string, back: () => void): void {
    refresh = undefined;
    ctx.show(() => {
      const items = waitList().items.filter((i) => i.gameId === gameId && i.state !== 'installed');
      const files = items.filter((i) => i.received && fs.existsSync(i.received.file)).map((i) => i.received!.file);
      const label = items[0]?.gameLabel ?? '';
      const remove = (toTrash: boolean) => {
        const l = waitList();
        const all = removeGame(l, gameId);
        if (toTrash) trash(all);
        save();
        updateWatch();
        notice = { text: toTrash ? t('{game} : retiré de la liste d’attente ; ses fichiers reçus sont dans la corbeille de Cyber Pinball.', { game: label }) : t('{game} : retiré de la liste d’attente ; ses fichiers reçus restent où ils sont.', { game: label }), tone: 'ok' };
        openWaitList(0);
      };
      const size = files.reduce((n, f) => n + fileSize(f), 0);
      const actions: Action[] = [{ label: t('Retirer, garder les fichiers'), detail: files.length ? t('Ils restent où ils sont') : undefined, tone: 'ok', run: () => remove(false) }];
      if (files.length) actions.push({ label: t('Retirer et mettre les fichiers à la corbeille'), detail: t('{files}, {size}', { files: tn(files.length, '{n} fichier', '{n} fichiers'), size: formatSize(size) }), tone: 'error', run: () => remove(true) });
      actions.push({ label: t('Annuler'), run: back });
      const received = items.filter((i) => i.state === 'received').length;
      return {
        heading: t('Retirer de la liste d’attente'),
        subheading: label,
        lead: t('{items} : {received}, {waiting}. Les tables installées ne changent pas.', { items: tn(items.length, '{n} élément', '{n} éléments'), received: tn(received, '{n} reçu', '{n} reçus'), waiting: tn(items.length - received, '{n} attendu', '{n} attendus') }),
        sections: files.length ? [{ title: t('Fichiers reçus'), rows: files.map((f) => ({ text: path.basename(f), detail: `${path.dirname(f)} · ${formatSize(fileSize(f))}` })) }] : [],
        actions,
        back,
      };
    });
  }

  /** Rapproche de la liste d'attente ce qui est arrivé dans Téléchargements, vérifié comme à la réception ; renvoie le nombre de fichiers retrouvés. */
  async function findInDownloads(): Promise<number> {
    const l = waitList();
    const waiting = l.items.filter((i) => i.state === 'waiting');
    const since = new Date(Math.min(...waiting.map((i) => Date.parse(i.addedAt)), Date.now()));
    let found = 0;
    for (const file of recentDownloads(userDownloads(), since)) {
      if (!l.items.some((i) => i.state === 'waiting')) break;
      const seen = await inspect(file);
      // Vérifié comme à la réception : seul ce qui convient est rangé d'office.
      const place = placeDownload(l, { filename: path.basename(file), content: seen.content }, vpsCache);
      if (place.item && place.item.state !== 'waiting') continue;
      if (routeReceived(l, place, { file, via: 'watch', ...seen })) found++;
    }
    if (found) save();
    return found;
  }

  function scanDownloads(): void {
    void ctx.task(t('Recherche dans Téléchargements…'), async () => {
      const found = await findInDownloads();
      notice = found
        ? { text: tn(found, '{n} fichier retrouvé dans Téléchargements.', '{n} fichiers retrouvés dans Téléchargements.'), tone: 'ok' }
        : { text: t('Rien dans {folder} qui corresponde à la liste d’attente.', { folder: userDownloads() }), tone: 'info' };
      updateWatch();
      ctx.show(() => buildWaitList(), ctx.cursor());
    });
  }

  // ---------- Installation ----------

  /** Plan d'installation des fichiers reçus pour ce jeu ; `quick` : à la fin d'une installation rapide. Point d'entrée de l'entonnoir. */
  function installGame(gameId: string, quick = false): void {
    void ctx.task(t('Vérification des fichiers reçus…'), async () => {
      await noteContents(waitList().items.filter((i) => i.gameId === gameId));
      // Un fichier qui ne convient pas ne part jamais à l'installation, mais ne retient pas le reste.
      const apart = problems(gameId).filter((p) => p.problem === 'mismatch');
      const lost = waitList().items.filter((i) => i.gameId === gameId && i.state === 'received' && (!i.received || !fs.existsSync(i.received.file)));
      for (const i of lost) {
        i.state = 'waiting';
        i.received = undefined;
      }
      if (lost.length) save();
      const items = waitList().items.filter((i) => i.gameId === gameId && i.state === 'received' && i.received && fs.existsSync(i.received.file) && !apart.some((p) => p.item === i));
      if (!items.length) {
        if (apart[0]) {
          notice = { text: t('À corriger : {item}, {problem}.', { item: itemName(apart[0].item), problem: problemText(apart[0]) }), tone: 'warning' };
          return openItem(apart[0].item.id);
        }
        notice = { text: t('Les fichiers reçus ont disparu (déplacés ou effacés) : ils sont de nouveau attendus.'), tone: 'warning' };
        return openWaitList();
      }
      ctx.install(
        items.map((i) => i.received!.file),
        { gameId, items, quick },
        items.find((i) => i.table)?.table,
      );
    });
  }

  /** Après l'installation : éléments installés, copies de la fenêtre « Récupérer » effacées (la table les a). */
  function installedItems(items: WaitItem[]): void {
    for (const given of items) {
      // Rapprochés par identifiant : l'appelant peut tenir une copie relue sur le disque,
      // et c'est la liste gardée ici qui est enregistrée.
      const i = waitList().items.find((x) => x.id === given.id) ?? given;
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
    );
    // L'écran où s'ouvre « Récupérer » : réglage de la configuration de la borne, à portée d'ici.
    if (host.openBrowserScreen) {
      const at = actions.length;
      actions.push({
        label: t('Écran du navigateur intégré'),
        detail: t('Où s’ouvre la fenêtre « Récupérer » (réglage de la configuration de la borne)'),
        run: () => host.openBrowserScreen!(() => openAccounts(at)),
      });
    }
    actions.push({ label: t('Retour'), run: () => ctx.home() });
    return {
      heading: t('Comptes des sites'),
      subheading: tn(states.filter((s) => s.state.connected).length, '{n} connecté sur {total}', '{n} connectés sur {total}', { total: states.length }),
      lead: t('Connectez-vous une fois à chaque site, avec votre propre compte : la connexion est gardée d’un démarrage à l’autre, comme dans un navigateur. Cyber Pinball ne voit ni ne garde aucun mot de passe. Avec le téléchargement direct, « Récupérer » télécharge le fichier sans montrer la page, et ouvre la page dès que le site demande quelque chose (vérification, choix, délai).'),
      sections: [...noticeSection(), { rows }],
      actions,
      back: () => ctx.home(),
    };
  }

  // ---------- Mises à jour ----------

  function openUpdates(): void {
    void ctx.task(t('Recherche des mises à jour…'), async () => {
      const db = await vpsDb();
      if (!db) return ctx.openNotice(t('Base VPS indisponible'), [t('Réessayez quand la borne est reliée à Internet.')], () => ctx.home());
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
        actions: [...found.map((f) => ({ label: f.table.title, detail: f.update.reason, run: () => openNeeds(f.update.game.id, f.update.latest.id) })), { label: t('Retour'), run: () => ctx.home() }],
        back: () => ctx.home(),
      }));
    });
  }

  function summary(): string {
    const l = waitList();
    const waiting = l.items.filter((i) => i.state === 'waiting').length;
    const got = l.items.filter((i) => i.state === 'received').length;
    return waiting || got ? `${tn(got, '{n} reçu', '{n} reçus')}, ${tn(waiting, '{n} attendu', '{n} attendus')}` : t('vide');
  }

  /**
   * Jeux dont des fichiers reçus attendent leur installation, pour l'entonnoir : le jeu, son nom,
   * les fichiers, et ce qui est à corriger avant (un pack de médias reçu pour la table…).
   */
  function ready(): { gameId: string; label: string; items: WaitItem[]; problems: { item: WaitItem; text: string }[] }[] {
    const got = waitList().items.filter((i) => i.state === 'received');
    return [...new Map(got.map((i) => [i.gameId, i.gameLabel])).entries()].map(([gameId, label]) => ({
      gameId,
      label,
      items: got.filter((i) => i.gameId === gameId),
      problems: problems(gameId).map((p) => ({ item: p.item, text: problemText(p) })),
    }));
  }

  // Points d'entrée : l'entonnoir « Ajouter une table » (library.ts), et tout écran qui sait
  // quel jeu chercher ou installer (parcours guidé d'un jeu qui ne démarre pas, médecin).
  return {
    /** Le catalogue (avertissement au premier usage) ; `text` : recherche toute faite (titre, initiales, nom de ROM). */
    open: (text?: string) => {
      if (!ctx.layout()) return open();
      withNotice(() => openCatalog(0, text));
    },
    /** Fiche d'un jeu de la base VPS : ses versions, l'installation rapide en tête. */
    openGame: (gameId: string) => withNotice(() => openGame(gameId)),
    /** Ce qu'il faut pour une version d'un jeu. */
    openNeeds: (gameId: string, versionId: string) => withNotice(() => openNeeds(gameId, versionId)),
    /** Installation rapide d'un jeu : la version conseillée, sauf `versionId`. */
    quickInstall: (gameId: string, versionId?: string) => withNotice(() => quickInstall(gameId, versionId)),
    /** Récupérés et attendus ; `back` : là où revenir. */
    openWaitList: (back?: () => void) => (ctx.layout() ? openWaitList(undefined, back) : open()),
    openUpdates,
    openAccounts,
    installGame,
    ready,
    summary,
    /** Appelé par l'installation, une fois les tables rangées. */
    installed: installedItems,
    /**
     * Des fichiers téléchargés sont partis à la corbeille (écran « Téléchargements ») : gardés de
     * côté oubliés, éléments reçus redevenus attendus. Renvoie le nombre de ces éléments.
     */
    forgetFiles: (files: string[]) => {
      const { waiting } = forgetDownloads(waitList(), files);
      save();
      return waiting.length;
    },
    /** Reprend la surveillance au démarrage, si elle était voulue. */
    start: () => {
      updateWatch();
      // Réparer l'existant dès le démarrage : le contenu des fichiers reçus avant cette
      // vérification est noté, l'entonnoir et la pastille savent alors ce qui est à corriger.
      void noteContents(waitList().items).then(() => host.broadcast());
    },
    /** Parcours « Ce qu'il manque pour jouer » (journey.ts) : récupérer un fichier pour une table installée. */
    fetchFor: (source: { game: VpsGame; kind: NeedKind; file: VpsTableFile }, opts: { table: string; back: () => void }) =>
      withNotice(() => get(source.game, { kind: source.kind }, source.file, opts.back, opts.table), opts.back),
    reopen,
    /** Liste d'attente tenue par le catalogue (celle qui est enregistrée). */
    waitList,
    /** Rapproche Téléchargements de la liste d'attente ; nombre de fichiers retrouvés. */
    scanDownloads: findInDownloads,
    /** Catalogue ouvert sur une recherche (titre, nom de ROM). */
    openSearch: (text: string) => {
      Object.assign(filter, { text, kind: 'all', support: 'any', site: 'all', state: 'all', page: 0 });
      if (!ctx.layout()) return open();
      withNotice(() => openCatalog());
    },
    /** Écran à redessiner quand un fichier arrive ou que la fenêtre « Récupérer » se ferme. */
    setRefresh: (fn: (() => void) | undefined) => {
      refresh = fn;
    },
    /** Dernier message du catalogue (fichier reçu, téléchargement direct…), pour un autre écran. */
    takeNotice: () => {
      const n = notice;
      notice = undefined;
      return n;
    },
    /** Pour les essais : fenêtre « Récupérer », réception d'un fichier comme par la surveillance. */
    acquirer,
    receive: (file: string, via: 'window' | 'watch') => received(file, { filename: path.basename(file) }, via, vpsCache),
    /** Pour les essais : ce que la liste juge à corriger. */
    problems: () => problems(),
    /** Ce que contient un fichier (archive listée une fois) : sa partie principale et toutes celles qu'il apporte. */
    inspect,
    /** Fichiers déjà téléchargés pour une partie (gardés de côté, « Récupérer », Téléchargements), ceux qui conviennent d'abord. */
    candidates: (kind: NeedKind) => candidatesFor({ kind }),
    /** Jeux de la liste d'attente (encore attendus ou reçus), pour y rattacher un fichier. */
    games: () => [...new Map(activeItems().map((i) => [i.gameId, i.gameLabel])).entries()].map(([gameId, label]) => ({ gameId, label })),
    /**
     * Rattache un fichier à une partie d'un jeu de la liste d'attente (Téléchargements, « Ajouter à
     * un autre jeu ») : l'élément attendu de cette partie, ou la partie ajoutée au jeu.
     */
    attachToGame: (file: string, gameId: string, kind: NeedKind, back: () => void) => {
      const l = waitList();
      const ref = l.items.find((i) => i.gameId === gameId);
      if (!ref) return back();
      const item = l.items.find((i) => i.gameId === gameId && i.kind === kind && i.state === 'waiting') ?? addPart(l, { gameId, gameLabel: ref.gameLabel, kind, label: path.basename(file).replace(/\.[^.]+$/, ''), page: ref.page, ...(ref.table ? { table: ref.table } : {}) });
      save();
      assign(file, item.id, 'manual', back);
    },
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
