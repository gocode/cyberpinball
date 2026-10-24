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
  ACQUISITION_NOTICE,
  addToWaitList,
  cabinetScreens,
  catalog,
  CATALOG_KIND_LABELS,
  CATALOG_STATE_LABELS,
  formatDay,
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
const SORT_LABELS: Record<CatalogSort, string> = { name: 'par titre', recent: 'nouveautés d’abord' };

const STATE_LABELS: Record<Need['state'], { label: string; tone: Tone }> = {
  have: { label: 'Déjà là', tone: 'ok' },
  included: { label: 'Fourni', tone: 'ok' },
  todo: { label: 'À récupérer', tone: 'warning' },
  optional: { label: 'Facultatif', tone: 'quiet' },
  useless: { label: 'Inutile ici', tone: 'quiet' },
  unavailable: { label: 'Introuvable', tone: 'error' },
};

const WAIT_LABELS: Record<WaitItem['state'], { label: string; tone: Tone }> = {
  waiting: { label: 'Attendu', tone: 'warning' },
  received: { label: 'Reçu', tone: 'ok' },
  installed: { label: 'Installé', tone: 'quiet' },
};

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
      if (via === 'window') notice = { text: `Reçu « ${facts.filename} », qui ne correspond à rien d’attendu : il reste dans ${path.relative(ctx.layout()!.root, path.dirname(file))}.`, tone: 'warning' };
      host.broadcast();
      return;
    }
    markReceived(item, file, via, new Date(), facts.urls?.at(-1));
    save();
    notice = { text: `Reçu pour ${item.gameLabel} : ${NEED_LABELS[item.kind]}, ${item.label} (« ${facts.filename} », ${formatSize(fileSize(file))}).`, tone: 'ok' };
    updateWatch();
    refresh?.();
    host.broadcast();
  }

  let vpsCache: VpsDb | undefined;
  const acquirer = createAcquirer({
    dir: acquisitionDir,
    received: (file, facts) => received(file, facts, 'window', vpsCache),
    progress: (filename, got, total) => {
      notice = { text: `Téléchargement de « ${filename} » : ${formatSize(got)}${total ? ` sur ${formatSize(total)}` : ''}…`, tone: 'info' };
      host.broadcast();
    },
    failed: (filename, reason) => {
      notice = { text: `Téléchargement ${reason} : « ${filename} ». Rien n’a été gardé.`, tone: 'warning' };
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
      heading: 'Trouver une table',
      subheading: 'À lire une fois',
      lead: 'Le catalogue de la base VPS : chaque jeu, ses versions pour VPX, et ce qu’il faut pour le jouer sur cette borne.',
      sections: [
        {
          rows: [
            { text: 'Droits', detail: ACQUISITION_NOTICE, tone: 'warning' },
            {
              text: 'Comptes',
              detail: 'Les tables se téléchargent sur des forums (vpuniverse.com, vpforums.org…) qui demandent un compte. Créez le vôtre et connectez-vous vous-même dans la fenêtre « Récupérer » : Cyber Pinball ne voit ni ne garde aucun mot de passe.',
              tone: 'info',
            },
            { text: 'Clavier et souris', detail: 'Indispensables pour se connecter et télécharger sur ces sites ; le reste se fait aux boutons de la borne.', tone: 'quiet' },
          ],
        },
      ],
      actions: [
        {
          label: 'J’ai compris : ouvrir le catalogue',
          tone: 'ok',
          run: () => {
            waitList().noticeAcceptedAt = new Date().toISOString();
            save();
            then();
          },
        },
        { label: 'Retour', run: () => ctx.openSystem() },
      ],
      back: () => ctx.openSystem(),
    }));
  }

  function open(): void {
    if (!ctx.layout()) return ctx.openNotice('Cyber Pinball n’est pas installé', ['Lancez « Installer » depuis le lanceur : il crée les dossiers des tables et des téléchargements.']);
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
    await ctx.search.stagePreviews(files.filter((f): f is MediaDbFile => Boolean(f)), thumbs, 'Vignettes');
  }

  function thumbOf(file: MediaDbFile | undefined, text: string): MediaThumb {
    const local = file && thumbs.get(file.url);
    if (!local || !fs.existsSync(local)) return { kind: 'fallback', rotation: 0, text };
    allowPreview(local);
    return { kind: 'image', url: mediaUrl(local), rotation: 0 };
  }

  const gameKind = (g: VpsGame) => (/^EM$/i.test(g.type ?? '') ? 'électromécanique' : /^PM$/i.test(g.type ?? '') ? 'mécanique' : /^SS$/i.test(g.type ?? '') ? 'électronique' : 'type inconnu');

  function noticeSection(): Section[] {
    const n = notice;
    notice = undefined;
    return n ? [{ rows: [{ text: n.text, tone: n.tone }] }] : [];
  }

  // ---------- Catalogue ----------

  function openCatalog(at = 0): void {
    refresh = undefined;
    void ctx.task('Catalogue de la base VPS…', async () => {
      const db = await vpsDb();
      if (!db) return ctx.openNotice('Base VPS indisponible', ['La base VPS n’a jamais été téléchargée, et GitHub ne répond pas. Réessayez quand la borne est reliée à Internet.'], () => ctx.openSystem());
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
      const facts = [gameKind(g), `${versions.length} version${versions.length > 1 ? 's' : ''} VPX`, roms.length ? `ROM ${roms.slice(0, 2).join(', ')}` : versions.some((v) => versionWithoutRom(g, v)) ? 'sans ROM' : undefined].filter(Boolean).join(' · ');
      return {
        action: i,
        title: vpsLabel(g),
        state: here.has(g.id) ? { label: 'Installé', tone: 'ok' } : undefined,
        facts,
        extra: [`Dernière version : ${versionLabel(versions[0]!)}${versions[0]!.updatedAt ? `, le ${formatDay(versions[0]!.updatedAt)}` : ''}`],
        thumb: thumbOf(gameImage(g), g.name),
      };
    });
    const pages = Math.max(1, Math.ceil(games.length / PAGE));
    const cycle = <T>(values: T[], current: T) => values[(values.indexOf(current) + 1) % values.length]!;
    const again = (at: number) => () => openCatalog(at);
    if (filter.page + 1 < pages) actions.push({ label: 'Page suivante', detail: `${(filter.page + 1) * PAGE + 1} à ${Math.min(games.length, (filter.page + 2) * PAGE)} sur ${games.length}`, run: () => ((filter.page += 1), openCatalog(0)) });
    if (filter.page > 0) actions.push({ label: 'Page précédente', run: () => ((filter.page -= 1), openCatalog(0)) });
    const fixed = actions.length;
    actions.push(
      {
        label: filter.text ? `Recherche : « ${filter.text} »` : 'Chercher un titre…',
        detail: filter.text ? 'Start pour changer ; vide pour tout revoir' : 'Titre, initiales (TMNT) ou nom de ROM (t2_l8)',
        run: () =>
          ctx.prompt('Chercher un titre', 'Titre du jeu', filter.text ?? '', (text) => {
            if (text !== undefined) {
              filter.text = text.trim() || undefined;
              filter.page = 0;
            }
            openCatalog(0);
          }),
      },
      { label: `Jeux : ${CATALOG_KIND_LABELS[filter.kind ?? 'all']}`, detail: `Start : ${CATALOG_KIND_LABELS[cycle(KINDS, filter.kind ?? 'all')]}`, run: () => ((filter.kind = cycle(KINDS, filter.kind ?? 'all')), (filter.page = 0), again(fixed + 1)()) },
      { label: `Sur la borne : ${CATALOG_STATE_LABELS[filter.state ?? 'all']}`, detail: `Start : ${CATALOG_STATE_LABELS[cycle(STATES, filter.state ?? 'all')]}`, run: () => ((filter.state = cycle(STATES, filter.state ?? 'all')), (filter.page = 0), again(fixed + 2)()) },
    );
    if (!filter.text) actions.push({ label: `Tri : ${SORT_LABELS[filter.sort ?? 'name']}`, detail: `Start : ${SORT_LABELS[cycle(SORTS, filter.sort ?? 'name')]}`, run: () => ((filter.sort = cycle(SORTS, filter.sort ?? 'name')), (filter.page = 0), again(fixed + 3)()) });
    const waiting = waitList().items.filter((i) => i.state !== 'installed').length;
    actions.push({ label: 'Liste d’attente', detail: waiting ? `${waiting} élément${waiting > 1 ? 's' : ''}` : 'vide', run: () => openWaitList() }, { label: 'Retour', run: () => ctx.openSystem() });
    const sections: Section[] = noticeSection();
    if (!games.length) sections.push({ rows: [{ text: 'Aucun jeu ne correspond', detail: 'Changez la recherche ou les filtres.', tone: 'quiet' }] });
    return {
      heading: 'Trouver une table',
      subheading: `${games.length.toLocaleString('fr-FR')} jeu${games.length > 1 ? 'x' : ''} · ${CATALOG_KIND_LABELS[filter.kind ?? 'all']}, ${CATALOG_STATE_LABELS[filter.state ?? 'all']}${pages > 1 ? ` · page ${filter.page + 1} sur ${pages}` : ''}`,
      lead: `Base VPS${db.updatedAt ? ` du ${formatDay(db.updatedAt.getTime())}` : ''}. Choisissez un jeu pour voir ses versions et ce qu’il faut pour le jouer sur cette borne.`,
      sections,
      actions,
      back: () => ctx.openSystem(),
      media: { cards },
    };
  }

  // ---------- Fiche d'un jeu : ses versions ----------

  function openGame(gameId: string, at = 0): void {
    refresh = undefined;
    void ctx.task('Versions du jeu…', async () => {
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
      if (mine.source === v.id) state = { label: 'Installée', tone: 'ok' };
      else if (advice?.file.id === v.id) state = { label: 'Conseillée', tone: 'ok' };
      else if (!links.length) state = { label: 'Aucun lien', tone: 'error' };
      return {
        action: i,
        title: versionLabel(v),
        code: features.length ? features.join(' · ') : undefined,
        state,
        facts: [v.updatedAt ? `mise à jour le ${formatDay(v.updatedAt)}` : undefined, included.length ? `fournit ${included.join(', ')}` : undefined, links.length ? `sur ${[...new Set(links.map((l) => linkHost(l.url).label))].join(', ')}` : undefined].filter(Boolean).join(' · '),
        extra: [v.comment, advice?.file.id === v.id ? `Conseillée : ${advice.reasons.join(', ')}.` : undefined].filter((x): x is string => Boolean(x)),
        thumb: thumbOf(imageOf(v), versionLabel(v)),
      };
    });
    actions.push({ label: 'Retour au catalogue', run: () => openCatalog() });
    const more = vpxVersions(game).length - versions.length;
    return {
      heading: vpsLabel(game),
      subheading: [gameKind(game), game.theme?.slice(0, 3).join(', '), game.players ? `${game.players} joueurs` : undefined, mine.version ? `installé : ${mine.version}` : undefined].filter(Boolean).join(' · '),
      lead: `${vpxVersions(game).length} version${vpxVersions(game).length > 1 ? 's' : ''} pour VPX : la conseillée, puis la plus récente d’abord${more > 0 ? ` (les ${versions.length} plus récentes montrées)` : ''}. MOD : reprise d’une autre version ; VR : jouable en réalité virtuelle ; nFozzy, Fleep : physique et sons refaits. Choisissez une version pour voir ce qu’il faut.`,
      sections: noticeSection(),
      actions,
      back: () => openCatalog(),
      media: { cards },
    };
  }

  // ---------- Ce qu'il faut pour une version ----------

  function openNeeds(gameId: string, versionId: string, at = 0): void {
    void ctx.task('Ce qu’il faut…', async () => {
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
      const label = `${NEED_LABELS[need.kind]}${need.kind === 'rom' && need.roms?.length ? ` ${need.roms.join(' ou ')}` : ''}`;
      const host1 = need.files[0] && liveLinks(need.files[0])[0] ? linkHost(liveLinks(need.files[0])[0]!.url) : undefined;
      const card: MediaCard = {
        title: label,
        code: need.required ? 'indispensable' : undefined,
        state: { label: st.label, tone: st.tone },
        facts: item?.received ? `reçu : ${path.basename(item.received.file)}` : need.detail,
        extra: [
          ...(canGet && host1 ? [`${need.files.length > 1 ? `${need.files.length} fichiers au choix, sur ` : 'Sur '}${host1.label}${host1.account ? ' (compte nécessaire)' : ''}.`] : []),
          ...(need.kind === 'rom' && need.state === 'todo' ? ['Protégée par le droit d’auteur : Cyber Pinball n’en fournit aucune ; ne la récupérez que si vous y avez droit.'] : []),
        ],
        thumb: need.kind === 'table' ? thumbOf(imageOf(version), 'Table') : need.kind === 'b2s' ? thumbOf(need.files.map(imageOf).find(Boolean), 'Fronton') : { kind: 'fallback', rotation: 0, text: label },
      };
      if (canGet) {
        card.action = actions.length;
        actions.push({
          label: item?.state === 'received' ? `${label} : récupérer de nouveau` : `Récupérer : ${label}`,
          detail: need.files.length > 1 ? `${need.files.length} au choix` : host1 ? `${host1.label}${host1.account ? ', compte nécessaire' : ''}` : undefined,
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
        label: 'Préparer l’installation',
        detail: `${received.length} fichier${received.length > 1 ? 's' : ''} reçu${received.length > 1 ? 's' : ''}${tableReady ? '' : ' (pas encore la table)'} : voir le plan`,
        tone: 'ok',
        run: () => installGame(game.id),
      });
    }
    actions.push({ label: 'Autres versions', run: () => openGame(game.id) }, { label: 'Liste d’attente', run: () => openWaitList() });
    const missing = needs.filter((n) => n.required && n.state === 'todo' && !itemFor(game, n));
    return {
      heading: `Ce qu’il faut : ${vpsLabel(game)}`,
      subheading: `Version ${versionLabel(version)}${version.updatedAt ? `, du ${formatDay(version.updatedAt)}` : ''}`,
      lead: missing.length
        ? `Pour jouer : ${missing.map((n) => NEED_LABELS[n.kind]).join(', ')}. Start sur une ligne ouvre sa page dans la fenêtre « Récupérer » : connectez-vous, téléchargez ; le fichier est rangé tout seul dans la liste d’attente.`
        : 'Tout l’indispensable est là ou attendu. « Préparer l’installation » montre le plan avant d’écrire quoi que ce soit.',
      sections: noticeSection(),
      actions,
      back: () => openGame(game.id),
      media: { cards },
    };
  }

  function openFiles(game: VpsGame, version: VpsTableFile, need: Need): void {
    void ctx.task('Fichiers au choix…', async () => {
      await fetchThumbs(need.files.slice(0, 12).map(imageOf));
      const back = () => openNeeds(game.id, version.id);
      ctx.show(() => {
        const files = need.files.slice(0, 12);
        return {
          heading: `${NEED_LABELS[need.kind]} : au choix`,
          subheading: vpsLabel(game),
          lead: need.kind === 'b2s' ? 'Les frontons qui vont avec les écrans de la borne d’abord (2 ou 3 écrans, afficheur large), puis les plus récents.' : 'Les plus récents d’abord.',
          sections: [],
          actions: [...files.map((f) => ({ label: versionLabel(f), run: () => get(game, version, need, f) })), { label: 'Retour', run: back }],
          back,
          media: {
            cards: files.map((f, i) => {
              const links = liveLinks(f);
              return {
                action: i,
                title: need.kind === 'rom' ? (f.version ?? 'ROM') : versionLabel(f),
                code: (f.features ?? []).slice(0, 4).join(' · ') || undefined,
                facts: [f.updatedAt ? `le ${formatDay(f.updatedAt)}` : undefined, links[0] ? linkHost(links[0].url).label : undefined].filter(Boolean).join(' · '),
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
      expected: `${NEED_LABELS[need.kind]} : ${item.label}`,
      host: `${host1.label}${host1.account ? ' · compte nécessaire' : ''}`,
    };
    const showPage = (status?: string) => {
      acquirer.show({ ...request, status });
      updateWatch();
      notice = status
        ? { text: `Page ouverte : ${status}`, tone: 'warning' }
        : { text: `Page ouverte dans la fenêtre « Récupérer » : ${NEED_LABELS[need.kind]} ${item.label}. Le fichier téléchargé y sera rangé tout seul.`, tone: 'info' };
      openNeeds(game.id, version.id);
    };
    const site = siteOfUrl(link.url);
    if (!waitList().directDownload || !site) return showPage();
    void ctx.task(`Téléchargement direct depuis ${site.label}…`, async () => {
      if (!siteState(site, await acquirer.siteCookies(site.domain)).connected) {
        return showPage(`vous n’êtes pas connecté à ${site.label} : connectez-vous dans cette page (ou dans « Comptes des sites »), puis téléchargez.`);
      }
      const result = await acquirer.direct(link.url, site);
      if (!result.ok) return showPage(`${result.reason.charAt(0).toUpperCase()}${result.reason.slice(1)}.`);
      notice = { text: `Téléchargement direct de « ${result.filename} » (${NEED_LABELS[need.kind]} ${item.label})…`, tone: 'info' };
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
        text: `${NEED_LABELS[i.kind]} : ${i.label}`,
        detail: i.received ? `reçu le ${formatDay(Date.parse(i.received.at))} : ${path.basename(i.received.file)}${i.received.via === 'watch' ? ' (Téléchargements)' : ''}` : `attendu depuis le ${formatDay(Date.parse(i.addedAt))} · ${linkHost(i.page).label}`,
        badges: [WAIT_LABELS[i.state].label],
        tone: WAIT_LABELS[i.state].tone,
      }));
      sections.push({ title: label, rows });
      const got = items.filter((i) => i.state === 'received');
      if (got.length) actions.push({ label: `Installer : ${label}`, detail: `${got.length} fichier${got.length > 1 ? 's' : ''} reçu${got.length > 1 ? 's' : ''} : voir le plan`, tone: 'ok', run: () => installGame(gameId) });
      for (const i of items.filter((x) => x.state === 'waiting')) {
        actions.push({
          label: `Rouvrir : ${NEED_LABELS[i.kind]} ${i.label}`,
          detail: label,
          run: () => {
            windowItem = i.id;
            const h = linkHost(i.page);
            acquirer.show({ url: i.page, game: i.gameLabel, expected: `${NEED_LABELS[i.kind]} : ${i.label}`, host: `${h.label}${h.account ? ' · compte nécessaire' : ''}` });
          },
        });
      }
    }
    if (!active.length) sections.push({ rows: [{ text: 'Rien n’est attendu', detail: 'Trouver une table, puis « Récupérer » sur ce qu’il faut : chaque fichier ouvert vient ici.', tone: 'quiet' }] });
    const watching = l.watchDownloads === true;
    actions.push(
      {
        label: `Surveiller Téléchargements : ${watching ? 'oui' : 'non'}`,
        detail: watching ? 'Ce qui arrive dans votre dossier Téléchargements est rapproché de la liste' : 'Pour ce que vous téléchargez dans votre propre navigateur',
        run: () => {
          l.watchDownloads = !watching || undefined;
          save();
          updateWatch();
          ctx.show(() => buildWaitList(), ctx.cursor());
        },
      },
      { label: 'Chercher dans Téléchargements', detail: 'Ce qui y est arrivé depuis l’ajout à la liste', run: () => scanDownloads() },
    );
    if (l.items.some((i) => i.state === 'installed')) actions.push({ label: 'Oublier les éléments installés', run: () => ((l.items = l.items.filter((i) => i.state !== 'installed')), save(), ctx.show(() => buildWaitList())) });
    actions.push({ label: 'Retour au catalogue', run: () => openCatalog() });
    return {
      heading: 'Liste d’attente',
      subheading: `${active.filter((i) => i.state === 'waiting').length} attendu${active.filter((i) => i.state === 'waiting').length > 1 ? 's' : ''} · ${active.filter((i) => i.state === 'received').length} reçu${active.filter((i) => i.state === 'received').length > 1 ? 's' : ''}`,
      lead: 'Ce que vous récupérez, jeu par jeu. Un fichier téléchargé dans la fenêtre « Récupérer » arrive ici tout seul ; dans votre navigateur, il faut la surveillance de Téléchargements ou « Chercher dans Téléchargements ». Rien n’est installé avant le plan.',
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
    notice = found ? { text: `${found} fichier${found > 1 ? 's' : ''} retrouvé${found > 1 ? 's' : ''} dans Téléchargements.`, tone: 'ok' } : { text: `Rien dans ${userDownloads()} qui corresponde à la liste d’attente.`, tone: 'info' };
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
      notice = { text: 'Les fichiers reçus ont disparu (déplacés ou effacés) : ils sont de nouveau attendus.', tone: 'warning' };
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
    void ctx.task('Comptes des sites…', async () => {
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
          ? `connecté, connexion gardée jusqu’au ${formatDay(state.expires!.getTime())}`
          : 'connecté pour cette fois seulement : reconnectez-vous en cochant « Se souvenir de moi » pour la garder'
        : 'pas connecté',
      badges: [state.connected ? 'Connecté' : 'Pas connecté'],
      tone: state.connected ? (state.remembered ? 'ok' : 'warning') : 'quiet',
    }));
    const actions: Action[] = states.map(({ site, state }) =>
      state.connected
        ? {
            label: `Se déconnecter : ${site.label}`,
            detail: 'Efface la connexion gardée par Cyber Pinball pour ce site',
            run: () =>
              void acquirer.signOut(site.domain).then(() => {
                notice = { text: `Déconnecté de ${site.label}.`, tone: 'info' };
                openAccounts(ctx.cursor());
              }),
          }
        : {
            label: `Se connecter : ${site.label}`,
            detail: 'Dans la fenêtre « Récupérer » ; cochez « Se souvenir de moi »',
            tone: 'ok' as const,
            run: () => {
              windowItem = undefined;
              acquirer.show({ url: site.login, game: `Compte ${site.label}`, expected: 'Connectez-vous, cochez « Se souvenir de moi », puis Fermer (Échap)', host: `${site.label} · votre propre compte` });
              notice = { text: `Connexion à ${site.label} ouverte : fermez la fenêtre une fois connecté, l’état se met à jour.`, tone: 'info' };
              openAccounts(ctx.cursor());
            },
          },
    );
    const direct = l.directDownload === true;
    actions.push(
      {
        label: `Téléchargement direct : ${direct ? 'oui' : 'non'}`,
        detail: direct ? '« Récupérer » télécharge sans montrer la page quand vous êtes connecté' : '« Récupérer » ouvre la page ; vous cliquez vous-même',
        run: () => {
          l.directDownload = !direct || undefined;
          save();
          openAccounts(ctx.cursor());
        },
      },
      { label: 'Retour', run: () => ctx.openSystem() },
    );
    return {
      heading: 'Comptes des sites',
      subheading: `${states.filter((s) => s.state.connected).length} connecté${states.filter((s) => s.state.connected).length > 1 ? 's' : ''} sur ${states.length}`,
      lead: 'Connectez-vous une fois à chaque site, avec votre propre compte : la connexion est gardée d’un démarrage à l’autre, comme dans un navigateur. Cyber Pinball ne voit ni ne garde aucun mot de passe. Avec le téléchargement direct, « Récupérer » télécharge le fichier sans montrer la page, et ouvre la page dès que le site demande quelque chose (vérification, choix, délai).',
      sections: [...noticeSection(), { rows }],
      actions,
      back: () => ctx.openSystem(),
    };
  }

  // ---------- Mises à jour ----------

  function openUpdates(): void {
    void ctx.task('Recherche des mises à jour…', async () => {
      const db = await vpsDb();
      if (!db) return ctx.openNotice('Base VPS indisponible', ['Réessayez quand la borne est reliée à Internet.'], () => ctx.openSystem());
      const found: { table: TableEntry; update: TableUpdate }[] = [];
      const seen = new Set<string>();
      for (const [i, table] of host.tables().entries()) {
        ctx.progress(`Mises à jour : table ${i + 1} sur ${host.tables().length}…`);
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
        heading: 'Mises à jour des tables',
        subheading: found.length ? `${found.length} table${found.length > 1 ? 's' : ''} à mettre à jour` : 'Tout est à jour',
        lead: 'D’après la provenance notée à l’installation, ou l’auteur et la version écrits dans la table. Start ouvre ce qu’il faut pour la nouvelle version ; rien n’est téléchargé d’office.',
        sections: found.length
          ? [{ rows: found.map((f, i) => ({ text: f.table.title, detail: `${versionLabel(f.update.latest)} : ${f.update.reason}`, badges: ['Mise à jour'], tone: 'warning' as const, action: i })) }]
          : [{ rows: [{ text: 'Aucune mise à jour connue', detail: 'Les tables installées sans provenance ni version écrite dedans ne peuvent pas être comparées.', tone: 'quiet' }] }],
        actions: [...found.map((f) => ({ label: f.table.title, detail: f.update.reason, run: () => openNeeds(f.update.game.id, f.update.latest.id) })), { label: 'Retour', run: () => ctx.openSystem() }],
        back: () => ctx.openSystem(),
      }));
    });
  }

  function summary(): string {
    const l = waitList();
    const waiting = l.items.filter((i) => i.state === 'waiting').length;
    const got = l.items.filter((i) => i.state === 'received').length;
    return waiting || got ? `${got} reçu${got > 1 ? 's' : ''}, ${waiting} attendu${waiting > 1 ? 's' : ''}` : 'vide';
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

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export type Catalog = ReturnType<typeof createCatalog>;
