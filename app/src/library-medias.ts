// Écran « Médias » de la fiche d'une table (T8, docs/recherche/medias.md § 5.5) :
// chaque type de média avec sa fonction, l'écran et le moment où il s'affiche, ce
// qui est montré aujourd'hui (fichier du jeu ou repli, et lequel), un aperçu, et
// les actions : prendre un fichier dans le dossier d'import, sur ce PC ou glissé
// sur la fenêtre ; remplacer ; mettre à la corbeille ; demi-tour du plateau ;
// volume relatif ; ordre des pages ; « Chercher les médias » sur VPinMediaDB
// (media-download.ts, son propre plan) ; « Voir les propositions » de chaque média,
// toutes sources réunies (media-proposals.ts) ; « Chercher moi-même sur le web… » de chaque
// média, recherche libre dans le navigateur intégré (media-web.ts). Tout va dans un
// brouillon : rien n'est écrit avant « Enregistrer », qui montre d'abord le plan, comme
// l'ajout d'une table. Seule exception : un fichier reçu de la recherche libre, affecté
// depuis son écran « Reçu » qui montre ce qui sera écrit, est enregistré aussitôt (ce seul
// média ; le reste du brouillon attend « Enregistrer »).
// La logique (plan, renommage, .info) est dans packages/core/src/mediaedit.ts.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyOps,
  b2sCacheDir,
  b2sImages,
  b2sLitImages,
  distinctB2sFiles,
  type B2sSource,
  draftChangeCount,
  draftPages,
  emptyMediaDraft,
  entrySource,
  formatSize,
  guessMediaType,
  infoFileFor,
  inventory,
  isAcceptedFormat,
  isTypeChanged,
  loadCabinet,
  lowerFirst,
  MANAGED_MEDIA_TYPES,
  MediaDimensionCache,
  mediaFileName,
  mediaFallbackName,
  mediaKind,
  mediaMemory,
  mediaOriginLabel,
  mediaOriginOf,
  mediaPlacement,
  mediaStateLabel,
  mediaUrl,
  mediaTypeInfo,
  MEDIA_VOLUME_STEPS,
  nextMemory,
  ownMediaPages,
  planMediaChanges,
  planSingleMedia,
  playfieldMediaRotation,
  resolveMedia,
  samePath,
  sameFileContent,
  scanTableMedias,
  t,
  tableMediaDir,
  tn,
  trashDirFor,
  type B2sImages,
  type Layout,
  type MediaDimensions,
  type MediaDraft,
  type MediaPageEntry,
  type MediaType,
  type ResolvedMedia,
  type Rotation,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, LibraryHost, Row, Section, Tone } from './library';
import { allowPreview } from './media-protocol';
import type { Converter } from './media-convert';
import { createProposals } from './media-proposals';
import { createTableSounds } from './media-sounds';
import type { MediaSites } from './media-sites';
import { createWebSearch } from './media-web';
import type { MediaSearch } from './media-search';
import type { PickRequest } from './file-picker';

export interface MediasContext {
  host: LibraryHost;
  layout(): Layout | undefined;
  tablesDir(): string;
  find(file: string): TableEntry | undefined;
  /** Affiche un écran décrit (openCustom de library.ts), le curseur sur l'action `at` ; `table` : la table dont il parle. */
  show(build: () => Built, at?: number, table?: string): void;
  cursor(): number;
  sheet(table: TableEntry, flash?: string): void;
  /** Retour au menu des tables. */
  leave(): void;
  /** Sélecteur de fichiers de Cyber Pinball (file-picker.ts) ; undefined à l'abandon. */
  pick?(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
  /** « Chercher sur le web… » pour les médias de cette table (catalog.ts) ; `back` redessine l'écran. */
  webGame?(table: TableEntry, back: () => void): Action;
  /** « Chercher les médias » sur VPinMediaDB (media-download.ts) ; `back` revient ici avec un message. */
  download?(table: TableEntry, back: (message?: { text: string; tone: Tone }) => void): void;
  /** Propositions de chaque média (media-proposals.ts) : recherche, téléchargement, saisie d'un titre. */
  proposals?: {
    search: MediaSearch;
    task(message: string, work: () => Promise<void> | void): Promise<void>;
    progress(message: string): void;
    prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
    withNotice(then: () => void, back: () => void): void;
    /** Sites communautaires, avec le compte de l'utilisateur. */
    sites?: MediaSites;
    /** Conversions des fichiers reçus de la recherche libre ; absent : pas de recherche libre (essais). */
    convert?: Converter;
  };
}

/** Aperçu d'un média : fichier image ou vidéo (vignette), son, ou repli intégré décrit en texte. */
export interface MediaThumb {
  kind: 'image' | 'video' | 'audio' | 'fallback';
  url?: string;
  /** Rotation horaire vue du joueur (plateau et chargement), demi-tour compris. */
  rotation: Rotation;
  text?: string;
  /** Son : image montrée pendant qu'il s'écoute (sa forme d'onde), à la place du texte. */
  poster?: string;
}

/** Carte d'un média ou d'une page, rattachée à une action (Start ou clic l'ouvre). */
export interface MediaCard {
  action?: number;
  title: string;
  /** Nom du type dans les fichiers : « (Backglass) ». */
  code?: string;
  state?: { label: string; tone: Tone };
  where?: string;
  /** Le média n'apparaît pas sur cette borne, et pourquoi. */
  note?: string;
  description?: string;
  facts?: string;
  pending?: string;
  /** Lignes discrètes : formats, repli, orientation. */
  extra?: string[];
  thumb: MediaThumb;
  /** Avancement d'une attente ou d'un téléchargement, de 0 à 1 (barre sous les faits). */
  progress?: number;
  /** Signe à part de l'état (« Autre jeu » : une proposition d'un autre jeu que la table). */
  flag?: { label: string; tone: Tone };
  /** Popularité sur le site de la fiche (« 510 téléchargements »). */
  popularity?: string;
  /** Galerie : seconde ligne sous la popularité (date et site d'un fichier à choisir). */
  meta?: string;
  /** Galerie : étiquettes neutres, ce que le fichier sait faire (« 2Screens », « VR »). */
  tags?: string[];
}

export interface MediaView {
  cards: MediaCard[];
  /** Grand aperçu (un seul média ou une seule page). */
  large?: boolean;
  /** Galerie : les propositions en tuiles, le détail de la tuile choisie dessous. */
  gallery?: boolean;
  /** Format des aperçus de la galerie (« 16 / 9 »), celui de l'écran qui montre le média. */
  aspect?: string;
  /** Galerie de fichiers à choisir (file-gallery.ts) : trois par rangée, faits en entier. */
  files?: boolean;
}

/**
 * L'écran fait écouter des sons : une carte à choisir porte un son, joué quand elle est
 * choisie (library.js). La musique du menu se tait pendant ce temps : un seul son à la fois.
 */
export function playsSoundPreview(media: MediaView | undefined): boolean {
  return (media?.cards ?? []).some((c) => c.action !== undefined && c.thumb.kind === 'audio' && !!c.thumb.url);
}

type Target = { kind: 'set' } | { kind: 'add' } | { kind: 'replace'; index: number };

interface Session {
  file: string;
  draft: MediaDraft;
  /** Message affiché en haut de l'écran courant ; il disparaît à l'écran suivant. */
  notice?: { text: string; tone: Tone };
  /** Message pour l'écran qui va s'ouvrir (après un choix, un dépôt, l'enregistrement). */
  next?: { text: string; tone: Tone };
  b2s?: B2sImages;
  /** Extraction des images du .directb2s, lancée à la première vue d'ensemble. */
  b2sDone?: Promise<B2sImages | undefined>;
  dims?: MediaDimensionCache;
}

const KIND_LABELS = {
  get image() {
    return t('image');
  },
  get video() {
    return t('vidéo');
  },
  get audio() {
    return t('son');
  },
};

export function createMedias(ctx: MediasContext) {
  const { host } = ctx;
  let session: Session | undefined;

  // ---------- Ce qui est là, et ce que le brouillon change ----------

  const root = () => ctx.layout()?.root ?? '';
  const tableOf = (s: Session) => ctx.find(s.file);
  const cabinet = () => loadCabinet(host.dataDir);
  const dims = (s: Session) => (s.dims ??= new MediaDimensionCache(root() ? MediaDimensionCache.fileFor(root()) : undefined));

  function b2sImage(s: Session) {
    return (_t: TableEntry, kind: 'backglass' | 'dmd') => (kind === 'backglass' ? s.b2s?.backglass?.file : s.b2s?.dmd?.file);
  }

  /** Image du .directb2s extraite en tâche de fond (des dizaines de Mo), puis l'écran se redessine. */
  function startB2s(s: Session, table: TableEntry): Promise<B2sImages | undefined> {
    if (s.b2sDone) return s.b2sDone;
    const name = inventory(table.file, !samePath(table.folder, ctx.tablesDir())).backglass;
    if (!name) return (s.b2sDone = Promise.resolve(undefined));
    return (s.b2sDone = b2sImages(path.join(table.folder, name), b2sCacheDir(host.dataDir)).then((images) => {
      s.b2s = images;
      if (session === s) host.broadcast();
      return images;
    }));
  }

  /**
   * Chaque .directb2s du dossier pour les propositions, celui que VPX charge d'abord,
   * sans les copies d'un même fichier : ses images, et le fronton « tout allumé »
   * (ampoules posées sur l'image allumée, composé une fois puis gardé en cache).
   */
  async function b2sSources(s: Session, table: TableEntry): Promise<B2sSource[]> {
    const inv = inventory(table.file, !samePath(table.folder, ctx.tablesDir()));
    const names = [inv.backglass, ...inv.strayBackglasses].filter((n): n is string => Boolean(n));
    const out: B2sSource[] = [];
    for (const file of await distinctB2sFiles(names.map((n) => path.join(table.folder, n)))) {
      const name = path.basename(file);
      const loaded = name === inv.backglass;
      const images = (loaded ? await startB2s(s, table) : await b2sImages(file, b2sCacheDir(host.dataDir))) ?? {};
      out.push({ name, loaded, images, lit: await b2sLitImages(file, b2sCacheDir(host.dataDir)) });
    }
    return out;
  }

  const current = (s: Session, table: TableEntry, type: MediaType) => ownMediaPages(table, root(), type, { b2sImage: b2sImage(s) });

  function resolved(s: Session, table: TableEntry, type: MediaType): ResolvedMedia {
    return resolveMedia(table, root(), type, {
      b2sImage: b2sImage(s),
      cabinet: cabinet(),
      dimensions: dims(s),
      measure: true,
      memory: nextMemory(mediaMemory(table.info), s.draft),
    });
  }

  /** Ce qui serait montré si le jeu n'avait plus son propre fichier de ce type (après « Mettre à la corbeille »). */
  function afterRemoval(s: Session, table: TableEntry, type: MediaType): string {
    const info = mediaTypeInfo(type);
    const partner = type === 'DMD' ? 'FullDMD' : type === 'FullDMD' ? 'DMD' : undefined;
    if (partner && draftPages(s.draft, partner, current(s, table, partner)).length) return t('{label} réduit à cet écran', { label: mediaTypeInfo(partner).label });
    // Même recherche, sans le dossier medias\ du jeu.
    const bare = { ...table, folder: path.join(table.folder, '.sans-medias') };
    const r = resolveMedia(bare, root(), type, { b2sImage: b2sImage(s) });
    const state = mediaStateLabel(r, root());
    if (r.source === 'fallback') return info.fallback === 'none' ? t('rien') : t('repli intégré : {what}', { what: lowerFirst(info.fallbackLabel) });
    // Le repli seul (sans « Repli : »), repris dans la phrase.
    return `${lowerFirst(mediaFallbackName(r) ?? state.label)} (${state.detail})`;
  }

  function changes(s: Session, table: TableEntry): number {
    return draftChangeCount(s.draft, (type) => current(s, table, type), mediaMemory(table.info));
  }

  function halfTurnOf(s: Session, table: TableEntry, type: MediaType): boolean {
    return s.draft.halfTurn[type] ?? mediaMemory(table.info).halfTurn?.[type] === true;
  }

  /** « Demi-tour ajouté à l’enregistrement. » si le brouillon le change. */
  function halfTurnPending(s: Session, table: TableEntry, type: MediaType): string | undefined {
    const wanted = s.draft.halfTurn[type];
    if (wanted === undefined || wanted === (mediaMemory(table.info).halfTurn?.[type] === true)) return undefined;
    return wanted ? t('Demi-tour ajouté à l’enregistrement.') : t('Demi-tour retiré à l’enregistrement.');
  }

  /** Rotation de l'aperçu, vu du joueur (flippers en bas) : celle que le menu appliquera. */
  function previewRotation(s: Session, table: TableEntry, type: MediaType, d: MediaDimensions | undefined): Rotation {
    return mediaTypeInfo(type).orientable ? playfieldMediaRotation(d, 'bottom', halfTurnOf(s, table, type)) : 0;
  }

  function thumbOf(s: Session, table: TableEntry, type: MediaType, file: string | undefined, fallbackText?: string): MediaThumb {
    if (!file) return { kind: 'fallback', rotation: 0, text: fallbackText };
    const kind = mediaKind(file);
    if (kind === 'audio') return { kind: 'audio', rotation: 0, text: '♪' };
    if (!kind || !isAcceptedFormat(type, file) || !fs.existsSync(file)) return { kind: 'fallback', rotation: 0, text: t('Format illisible') };
    // Par le protocole des médias, comme le menu : la CSP de la fenêtre n'autorise rien d'autre.
    allowPreview(file);
    const url = mediaUrl(file);
    return { kind, url: kind === 'video' ? `${url}#t=0.5` : url, rotation: previewRotation(s, table, type, dims(s).get(file)) };
  }

  /** « vidéo 1920 × 1080 · 12,4 Mo » */
  function factsOf(s: Session, file: string): string {
    const kind = mediaKind(file);
    const d = dims(s).get(file);
    let size = '';
    try {
      size = formatSize(fs.statSync(file).size);
    } catch {
      return t('fichier introuvable');
    }
    const what = kind === 'image' && d?.animated ? t('image animée') : kind ? KIND_LABELS[kind] : t('format inconnu');
    return [d ? `${what} ${d.width} × ${d.height}` : what, size].join(' · ');
  }

  // ---------- Ouverture ----------

  function open(table: TableEntry): void {
    session = { file: table.file, draft: emptyMediaDraft() };
    proposals?.reset();
    web?.stop();
    ctx.show(() => buildOverview(session!), undefined, table.file);
  }

  // Recherche libre de chaque média (navigateur intégré), sur la session en cours.
  const web =
    ctx.proposals?.sites && ctx.proposals.convert
      ? createWebSearch({
          sites: ctx.proposals.sites,
          convert: ctx.proposals.convert,
          downloadsDir: () => ctx.layout()?.downloads,
          task: ctx.proposals.task,
          progress: ctx.proposals.progress,
          show: (build, at) => (session ? nav(session, build, at) : ctx.show(build, at)),
          cursor: () => ctx.cursor(),
          broadcast: () => host.broadcast(),
          find: (file) => ctx.find(file),
          active: (table) => session?.file === table.file,
          thumb: (table, type, file) => thumbOf(session!, table, type, file),
          facts: (file) => factsOf(session!, file),
          current: (table, type) => current(session!, table, type),
          commit: (table, type, entry) => commit(session!, table, type, entry),
          place: (table, type, entry) => place(session!, table, type, entry, mediaTypeInfo(type).pages ? { kind: 'add' } : { kind: 'set' }),
          back: (type, message) => {
            if (!session) return;
            session.next = message;
            openType(session, type);
          },
        })
      : undefined;

  // Propositions de chaque média : branchées sur le brouillon de la session en cours.
  const proposals = ctx.proposals
    ? createProposals({
        host,
        ...ctx.proposals,
        show: (build, at) => (session ? nav(session, build, at) : ctx.show(build, at)),
        cursor: () => ctx.cursor(),
        find: (file) => ctx.find(file),
        thumb: (table, type, file) => thumbOf(session!, table, type, file),
        facts: (file) => factsOf(session!, file),
        pages: (table, type) => draftPages(session!.draft, type, current(session!, table, type)),
        current: (table, type) => current(session!, table, type),
        place: (table, type, entry) => place(session!, table, type, entry, mediaTypeInfo(type).pages ? { kind: 'add' } : { kind: 'set' }),
        b2s: (table) => b2sSources(session!, table),
        active: (table) => session?.file === table.file,
        placement: (type) => mediaPlacement(type, cabinet()),
        web: web && { open: (table, type, title) => web.open(table, type, title), detail: (table, type, title) => web.detail(table, type, title) },
        save: { changes: (table) => changes(session!, table), open: () => session && openPlan(session) },
        back: (type, message) => {
          if (!session) return;
          session.next = message;
          openType(session, type);
        },
      })
    : undefined;

  // Sons de la table (PuP-Pack, médias, vidéos sonores) : musique et son de lancement.
  const sounds = createTableSounds({
    dataDir: host.dataDir,
    tablesDir: () => ctx.tablesDir(),
    show: (build, at) => (session ? nav(session, build, at) : ctx.show(build, at)),
    place: (table, type, file) => place(session!, table, type, { from: file, mode: 'copy' }, { kind: 'set' }),
    back: (type, at, message) => {
      if (!session) return;
      session.next = message;
      openType(session, type, at);
    },
  });

  /** Ouvre un écran des médias : le message prévu pour lui remplace celui de l'écran précédent. */
  function nav(s: Session, build: () => Built, at?: number): void {
    s.notice = s.next;
    s.next = undefined;
    ctx.show(build, at, s.file);
  }

  /** Vue d'ensemble, le curseur sur ce type (ou cette action), sinon là où il était. */
  function toOverview(s: Session, at?: MediaType | number): void {
    nav(s, () => buildOverview(s), typeof at === 'number' ? at : at ? Math.max(0, MANAGED_MEDIA_TYPES.indexOf(at)) : ctx.cursor());
  }

  function lost(): Built {
    const back = () => {
      session = undefined;
      ctx.leave();
    };
    return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour'), run: back }], back };
  }

  // ---------- Vue d'ensemble ----------

  function cardFor(s: Session, table: TableEntry, type: MediaType, action: number): MediaCard {
    const info = mediaTypeInfo(type);
    const place = mediaPlacement(type, cabinet());
    const now = current(s, table, type);
    const wanted = draftPages(s.draft, type, now);
    const changed = isTypeChanged(s.draft, type, now);
    const card: MediaCard = { action, title: info.label, code: `(${info.type})`, where: place.where, note: place.note, description: info.description, thumb: { kind: 'fallback', rotation: 0 } };
    if (changed) {
      const first = wanted[0] ? entrySource(wanted[0]) : undefined;
      card.thumb = thumbOf(s, table, type, first, t('Après : {what}', { what: afterRemoval(s, table, type) }));
      card.state = { label: t('À enregistrer'), tone: 'warning' };
      card.facts = first ? `${entryName(wanted[0]!)} · ${factsOf(s, first)}` : undefined;
      const what = !wanted.length
        ? t('Mis à la corbeille à l’enregistrement ; ensuite : {after}.', { after: afterRemoval(s, table, type) })
        : info.pages
          ? tn(wanted.length, '{n} page à l’enregistrement, numérotées dans l’ordre choisi.', '{n} pages à l’enregistrement, numérotées dans l’ordre choisi.')
          : t('Rangé sous « {name} » à l’enregistrement.', { name: mediaFileName(table, type, path.extname(first!).slice(1)) });
      card.pending = [what, halfTurnPending(s, table, type)].filter(Boolean).join(' ');
      return card;
    }
    const r = resolved(s, table, type);
    const state = mediaStateLabel(r, root());
    card.state = { label: state.label, tone: state.present ? 'ok' : r.source === 'fallback' && info.fallback === 'none' ? 'quiet' : 'info' };
    card.thumb = thumbOf(s, table, type, r.file, info.fallbackLabel);
    const pages = info.pages && r.files.length > 1 ? ` · ${tn(r.files.length, '{n} page', '{n} pages')}` : '';
    card.facts = r.file ? `${state.detail} · ${factsOf(s, r.file)}${pages}` : state.detail;
    if (r.skipped.length) card.pending = t('Ignoré : {files} (format que le menu ne lit pas).', { files: r.skipped.map((f) => path.basename(f)).join(', ') });
    if (mediaOriginOf(table, type, r.file)) card.facts += ` · ${t('de {origin}', { origin: mediaOriginOf(table, type, r.file)!.origin })}`;
    if (halfTurnOf(s, table, type)) card.facts += ` · ${t('demi-tour')}`;
    const turn = halfTurnPending(s, table, type);
    if (turn) {
      card.state = { label: t('À enregistrer'), tone: 'warning' };
      card.pending = turn;
    }
    return card;
  }

  /** Fichiers de medias\ que ce jeu n'utilise pas, et pourquoi. */
  function strayRows(table: TableEntry): Row[] {
    const rows: Row[] = [];
    for (const f of scanTableMedias(table)) {
      const name = path.basename(f.file);
      if (name.startsWith('.')) continue;
      if (!f.type) rows.push({ text: name, detail: t('Nom sans « (Type) » : le menu ne sait pas à quoi il sert.'), tone: 'quiet' });
      else if (!MANAGED_MEDIA_TYPES.includes(f.type)) rows.push({ text: name, detail: `${mediaTypeInfo(f.type).description}`, tone: 'quiet' });
      else if (f.match === 'other-name') rows.push({ text: name, detail: t('Porte le nom d’un autre jeu ou d’une autre version : ce jeu ne s’en sert pas.'), tone: 'quiet' });
      else if (!f.accepted) rows.push({ text: name, detail: t('Format .{ext} que le menu ne lit pas pour {label}.', { ext: path.extname(name).slice(1).toLowerCase(), label: mediaTypeInfo(f.type).label }), tone: 'warning' });
      else if (f.page && f.page > 1 && !mediaTypeInfo(f.type).pages) rows.push({ text: name, detail: t('{label} n’a qu’une page : ce fichier n’est pas montré.', { label: mediaTypeInfo(f.type).label }), tone: 'quiet' });
    }
    return rows;
  }

  function buildOverview(s: Session): Built {
    const table = tableOf(s);
    if (!table) return lost();
    startB2s(s, table);
    const actions: Action[] = MANAGED_MEDIA_TYPES.map((type) => ({ label: mediaTypeInfo(type).label, run: () => openType(s, type) }));
    const cards = MANAGED_MEDIA_TYPES.map((type, i) => cardFor(s, table, type, i));
    for (const [i, c] of cards.entries()) actions[i]!.detail = c.state?.label;
    const memory = nextMemory(mediaMemory(table.info), s.draft);
    const volume = memory.volume ?? 100;
    actions.push({ label: t('Volume de ce jeu'), detail: volume === 100 ? t('100 % : comme les autres jeux') : t('{volume} % du réglage général', { volume }), run: () => openVolume(s) });
    const n = changes(s, table);
    if (ctx.download) {
      actions.push({
        label: t('Chercher les médias'),
        detail: n ? t('Enregistrez ou annulez d’abord les changements en cours') : t('Sur VPinMediaDB : logo, plateau, fronton, afficheur… avec un plan à valider'),
        run: () => (n ? notify(s, t('Enregistrez ou annulez d’abord les changements en cours : « Chercher les médias » a son propre plan.')) : searchOnline(s, table)),
      });
    }
    if (n) {
      actions.push(
        { label: t('Enregistrer'), detail: tn(n, '{n} changement : voir le plan avant d’écrire', '{n} changements : voir le plan avant d’écrire'), tone: 'ok', run: () => openPlan(s) },
        { label: t('Annuler les changements'), tone: 'error', run: () => discard(s) },
      );
    }
    const leave = () => (n ? openLeave(s) : close(table));
    if (ctx.webGame) actions.push(ctx.webGame(table, () => open(table)));
    actions.push({ label: t('Retour à la fiche'), run: leave });
    const sections: Section[] = [];
    if (s.notice) sections.push({ rows: [{ text: s.notice.text, tone: s.notice.tone }] });
    const stray = strayRows(table);
    if (stray.length) sections.push({ title: t('Autres fichiers dans medias\\'), rows: stray });
    dims(s).save();
    return {
      heading: t('Médias du jeu'),
      subheading: table.title,
      lead: t('Ce que le menu montre pour ce jeu, écran par écran. Choisissez un média pour le remplacer, le retirer ou le régler, ou glissez un fichier sur cette fenêtre. Rien n’est écrit avant « Enregistrer ».'),
      sections,
      actions,
      back: leave,
      media: { cards },
      drop: (paths) => dropOnOverview(s, table, paths),
    };
  }

  function notify(s: Session, text: string): void {
    s.notice = { text, tone: 'warning' };
    host.broadcast();
  }

  /** VPinMediaDB : son propre plan, puis retour ici sur l'action, avec le résultat. */
  function searchOnline(s: Session, table: TableEntry): void {
    const at = ctx.cursor();
    ctx.download!(table, (message) => {
      s.next = message;
      toOverview(s, at);
    });
  }

  function close(table: TableEntry): void {
    session = undefined;
    web?.stop();
    ctx.sheet(table);
  }

  function discard(s: Session): void {
    s.draft = emptyMediaDraft();
    s.next = { text: t('Changements annulés : rien n’a été écrit.'), tone: 'info' };
    toOverview(s, MANAGED_MEDIA_TYPES[0]);
  }

  function openLeave(s: Session): void {
    const table = tableOf(s);
    if (!table) return;
    const n = changes(s, table);
    nav(s, () => ({
      heading: t('Quitter sans enregistrer ?'),
      subheading: table.title,
      lead: tn(n, '{n} changement pas encore enregistré. Rien n’a été écrit.', '{n} changements pas encore enregistrés. Rien n’a été écrit.'),
      sections: [],
      actions: [
        { label: t('Voir le plan et enregistrer'), tone: 'ok', run: () => openPlan(s) },
        { label: t('Quitter sans enregistrer'), tone: 'error', run: () => close(table) },
        { label: t('Continuer'), run: () => toOverview(s) },
      ],
      back: () => toOverview(s),
    }));
  }

  // ---------- Un type de média ----------

  function setPages(s: Session, table: TableEntry, type: MediaType, pages: MediaPageEntry[]): void {
    s.draft.pages[type] = pages;
    s.notice = undefined;
    // Revenu à l'état d'aujourd'hui : le type n'est plus modifié.
    if (!isTypeChanged(s.draft, type, current(s, table, type))) delete s.draft.pages[type];
  }

  function place(s: Session, table: TableEntry, type: MediaType, entry: MediaPageEntry, target: Target): string {
    const pages = [...draftPages(s.draft, type, current(s, table, type))];
    const info = mediaTypeInfo(type);
    // Le même contenu que ce qui est déjà là (même fichier de VPinMediaDB repris, copie d'un
    // fichier rangé) : l'enregistrer réécrirait l'ancien à l'identique, l'utilisateur croirait
    // que rien n'a marché. Le brouillon revient à l'état d'aujourd'hui pour ce média.
    if ('from' in entry) {
      const now = current(s, table, type);
      const same = (f: string | undefined) => f !== undefined && sameFileContent(entry.from, f);
      if (!info.pages && same(now[0])) {
        setPages(s, table, type, now.map((file) => ({ file })));
        return t('« {file} » est identique au média {label} actuel : rien ne changerait à l’enregistrement.', { file: entryName(entry), label: info.label });
      }
      if (info.pages && target.kind === 'add' && pages.some((e) => same(entrySource(e)))) {
        return t('« {file} » est déjà l’une des pages : rien d’ajouté.', { file: entryName(entry) });
      }
    }
    if (target.kind === 'replace') pages[target.index] = entry;
    else if (target.kind === 'add') pages.push(entry);
    else pages.splice(0, pages.length, entry);
    setPages(s, table, type, pages);
    const page = info.pages ? (target.kind === 'replace' ? target.index + 1 : pages.length) : 1;
    const name = mediaFileName(table, type, path.extname(entrySource(entry)).slice(1), page);
    return info.pages
      ? t('« {file} » sera la page {page} : {label}, rangé sous « {name} » à l’enregistrement.', { file: entryName(entry), page, label: info.label, name })
      : t('« {file} » sera le média {label}, rangé sous « {name} » à l’enregistrement.', { file: entryName(entry), label: info.label, name });
  }

  function openType(s: Session, type: MediaType, at = 0): void {
    nav(s, () => buildType(s, type), at);
  }

  function buildType(s: Session, type: MediaType): Built {
    const table = tableOf(s);
    if (!table) return lost();
    const info = mediaTypeInfo(type);
    const placeInfo = mediaPlacement(type, cabinet());
    const now = current(s, table, type);
    const pages = draftPages(s.draft, type, now);
    const changed = isTypeChanged(s.draft, type, now);
    const back = () => toOverview(s, type);
    const actions: Action[] = [];
    const cards: MediaCard[] = [];
    const importCount = importFiles(type).accepted.length;
    const importDetail = importCount ? tn(importCount, '{n} fichier qui convient', '{n} fichiers qui conviennent') : t('vide pour ce média ({formats})', { formats: info.formats.join(', ') });

    if (info.pages) {
      pages.forEach((entry, i) => {
        const file = entrySource(entry);
        actions.push({ label: t('Page {page}', { page: i + 1 }), detail: entryName(entry), run: () => openPage(s, type, i) });
        cards.push({ action: i, title: t('Page {page}', { page: i + 1 }), facts: `${entryName(entry)} · ${factsOf(s, file)}`, pending: pagePending(table, type, entry, i), thumb: thumbOf(s, table, type, file) });
      });
      if (proposals) actions.push(proposalsAction(s, table, type));
      if (web) actions.push(webAction(s, table, type));
      actions.push(
        { label: t('Ajouter une page depuis le dossier d’import'), detail: importDetail, run: () => openPick(s, type, { kind: 'add' }) },
        { label: t('Ajouter une page : choisir un fichier…'), detail: t('Téléchargements de Cyber Pinball, clé USB, ce PC ; ou glissez-le ici'), run: () => void pickOnPc(s, type, { kind: 'add' }) },
      );
      if (pages.length) {
        actions.push({
          label: pages.length > 1 ? t('Mettre toutes les pages à la corbeille') : t('Mettre la page à la corbeille'),
          detail: t('Ensuite : {after}', { after: afterRemoval(s, table, type) }),
          tone: 'error',
          run: () => remove(s, table, type),
        });
      }
      if (!pages.length) {
        const r = resolved(s, table, type);
        cards.push({ title: t('Aucune page'), facts: t('Repli : {what}', { what: mediaStateLabel(r, root()).detail }), thumb: thumbOf(s, table, type, r.file, info.fallbackLabel) });
      }
    } else {
      const file = pages[0] ? entrySource(pages[0]) : undefined;
      const r = changed ? undefined : resolved(s, table, type);
      const state = r ? mediaStateLabel(r, root()) : undefined;
      const turn = halfTurnPending(s, table, type);
      const what = changed
        ? file
          ? t('Rangé sous « {name} » ; l’ancien fichier va à la corbeille.', { name: mediaFileName(table, type, path.extname(file).slice(1)) })
          : t('Mis à la corbeille à l’enregistrement.')
        : undefined;
      cards.push({
        title: file ? entryName(pages[0]!) : r?.file ? path.basename(r.file) : changed ? t('Après l’enregistrement : {after}', { after: afterRemoval(s, table, type) }) : t('Aucun fichier pour ce jeu'),
        state: changed || turn ? { label: t('À enregistrer'), tone: 'warning' } : state && { label: state.label, tone: state.present ? 'ok' : 'info' },
        facts: file ? factsOf(s, file) : r?.file ? `${r.source === 'b2s' || r.foundType !== type ? `${state!.detail} · ` : ''}${factsOf(s, r.file)}` : state?.detail,
        pending: [what, turn].filter(Boolean).join(' ') || undefined,
        thumb: thumbOf(s, table, type, file ?? r?.file, t('Repli intégré : {what}', { what: info.fallbackLabel })),
        note: placeInfo.note,
        extra: [
          t('Formats : {formats}.', { formats: info.formats.join(', ') }),
          t('Sans fichier : {what}.', { what: lowerFirst(info.fallbackLabel) }),
          ...(info.orientable ? [t('Un fichier en hauteur a les flippers en bas, en largeur à droite : le menu le tourne. L’aperçu le montre tel qu’il apparaîtra, vu du joueur.')] : []),
          ...sourceLines(table, type, changed ? undefined : r?.file),
        ],
      });
      if (proposals) actions.push(proposalsAction(s, table, type));
      if (web) actions.push(webAction(s, table, type));
      if (info.target === 'audio') {
        const at = actions.length;
        actions.push({ label: t('Sons de la table'), detail: t('PuP-Pack, médias, vidéos avec du son : écouter, puis choisir'), tone: 'ok', run: () => sounds.open(table, type, at) });
      }
      actions.push(
        { label: file ? t('Remplacer depuis le dossier d’import') : t('Prendre dans le dossier d’import'), detail: importDetail, run: () => openPick(s, type, { kind: 'set' }) },
        { label: file ? t('Remplacer : choisir un fichier…') : t('Choisir un fichier…'), detail: t('Téléchargements de Cyber Pinball, clé USB, ce PC ; ou glissez-le ici'), run: () => void pickOnPc(s, type, { kind: 'set' }) },
      );
      if (file) actions.push({ label: t('Mettre à la corbeille'), detail: t('Ensuite : {after}', { after: afterRemoval(s, table, type) }), tone: 'error', run: () => remove(s, table, type) });
    }
    if (info.orientable) {
      const on = halfTurnOf(s, table, type);
      actions.push({
        label: on ? t('Demi-tour : oui') : t('Demi-tour : non'),
        detail: on ? t('Retirer le demi-tour ajouté à ce média') : t('Si l’aperçu montre les flippers en haut'),
        run: () => {
          const saved = mediaMemory(table.info).halfTurn?.[type] === true;
          if (!on === saved) delete s.draft.halfTurn[type];
          else s.draft.halfTurn[type] = !on;
          s.notice = undefined;
          host.broadcast();
        },
      });
    }
    if (changed) actions.push({ label: t('Annuler le changement de ce média'), run: () => { delete s.draft.pages[type]; host.broadcast(); } });
    actions.push({ label: t('Retour aux médias'), run: back });

    const sections: Section[] = [];
    if (s.notice) sections.push({ rows: [{ text: s.notice.text, tone: s.notice.tone }] });
    // Pages : ce que remplace la liste vide est dit sur « Mettre à la corbeille ».
    if (info.pages && placeInfo.note) sections.push({ rows: [{ text: t('Sur cette borne'), detail: placeInfo.note, tone: 'warning' }] });
    return {
      heading: info.label,
      subheading: `(${info.type}) · ${table.title}`,
      // À quoi il sert et où il s'affiche, toujours visibles en haut de l'écran.
      lead: info.pages
        ? t('{description} Où : {where}. Choisissez une page pour la déplacer, la remplacer ou la retirer.', { description: info.description, where: lowerFirst(placeInfo.where) })
        : t('{description} Où : {where}.', { description: info.description, where: lowerFirst(placeInfo.where) }),
      sections,
      actions,
      back,
      media: { cards, large: !info.pages },
      drop: (paths) => dropOn(s, table, type, info.pages ? { kind: 'add' } : { kind: 'set' }, paths),
    };
  }

  /** « Voir les propositions » : toutes les versions trouvées pour ce média, avec leurs aperçus. */
  function proposalsAction(s: Session, table: TableEntry, type: MediaType): Action {
    const n = proposals!.count(table, type);
    return {
      label: t('Voir les propositions'),
      detail: n === undefined ? t('Toutes les versions trouvées : VPinMediaDB (jeu reconnu et proches), PuP-Pack, DMD, .directb2s') : tn(n, '{n} proposition avec aperçu', '{n} propositions avec aperçu'),
      tone: 'ok',
      run: () => proposals!.open(table, type),
    };
  }

  /**
   * « Chercher moi-même sur le web… » : le navigateur intégré sur une recherche libre ; ce
   * qui y est téléchargé est vérifié puis proposé pour ce média (media-web.ts).
   */
  function webAction(s: Session, table: TableEntry, type: MediaType): Action {
    return {
      label: t('Chercher moi-même sur le web…'),
      detail: web!.detail(table, type),
      web: 'medias.type',
      run: () => {
        s.notice = { text: web!.open(table, type), tone: 'info' };
        host.broadcast();
      },
    };
  }

  /** Provenance d'un fichier téléchargé, citée sur sa fiche : source, date, adresse. */
  function sourceLines(table: TableEntry, type: MediaType, file: string | undefined): string[] {
    const origin = mediaOriginOf(table, type, file);
    return origin ? [t('Source : {source}.', { source: mediaOriginLabel(origin) }), t('Adresse : {url}', { url: origin.url })] : [];
  }

  /** Ce qui arrivera à une page à l'enregistrement : rangée sous un nom, ou renommée parce qu'elle a changé de place. */
  function pagePending(table: TableEntry, type: MediaType, entry: MediaPageEntry, index: number): string | undefined {
    const file = entrySource(entry);
    const target = mediaFileName(table, type, path.extname(file).slice(1), index + 1);
    if ('from' in entry) {
      if (entry.origin) return t('Nouvelle, téléchargée depuis {origin} : rangée sous « {name} » à l’enregistrement.', { origin: entry.origin.origin, name: target });
      return entry.mode === 'move'
        ? t('Nouvelle, prise dans le dossier d’import : rangée sous « {name} » à l’enregistrement.', { name: target })
        : t('Nouvelle, copiée, l’original reste en place : rangée sous « {name} » à l’enregistrement.', { name: target });
    }
    return path.basename(file) === target ? undefined : t('Renommée « {name} » à l’enregistrement.', { name: target });
  }

  function remove(s: Session, table: TableEntry, type: MediaType): void {
    setPages(s, table, type, []);
    host.broadcast();
  }

  // ---------- Une page (prospectus, règles) ----------

  function openPage(s: Session, type: MediaType, index: number, at = 0): void {
    nav(s, () => buildPage(s, type, index), at);
  }

  function buildPage(s: Session, type: MediaType, index: number): Built {
    const table = tableOf(s);
    if (!table) return lost();
    const info = mediaTypeInfo(type);
    const pages = draftPages(s.draft, type, current(s, table, type));
    const back = () => openType(s, type, Math.min(index, Math.max(0, pages.length - 1)));
    const entry = pages[index];
    if (!entry) return { heading: t('Page introuvable'), sections: [], actions: [{ label: t('Retour'), run: back }], back };
    const file = entrySource(entry);
    const move = (to: number) => {
      const next = [...pages];
      next.splice(index, 1);
      next.splice(to, 0, entry);
      setPages(s, table, type, next);
      openPage(s, type, to, ctx.cursor());
    };
    const actions: Action[] = [];
    if (index > 0) actions.push({ label: t('Monter'), detail: t('Devient la page {page}', { page: index }), run: () => move(index - 1) });
    if (index < pages.length - 1) actions.push({ label: t('Descendre'), detail: t('Devient la page {page}', { page: index + 2 }), run: () => move(index + 1) });
    actions.push(
      { label: t('Remplacer depuis le dossier d’import'), run: () => openPick(s, type, { kind: 'replace', index }) },
      { label: t('Remplacer : choisir un fichier…'), detail: t('Téléchargements de Cyber Pinball, clé USB, ce PC ; ou glissez-le ici'), run: () => void pickOnPc(s, type, { kind: 'replace', index }) },
      {
        label: t('Mettre cette page à la corbeille'),
        detail: pages.length > 1 ? t('Les pages suivantes remontent') : undefined,
        tone: 'error',
        run: () => {
          setPages(s, table, type, pages.filter((_, i) => i !== index));
          openType(s, type, Math.max(0, index - 1));
        },
      },
      { label: t('Retour aux pages'), run: back },
    );
    return {
      heading: t('{label}, page {page} sur {count}', { label: info.label, page: index + 1, count: pages.length }),
      subheading: table.title,
      lead: t('Les pages sont montrées dans l’ordre ; le nom du fichier suit le numéro de la page.'),
      sections: [],
      actions,
      back,
      media: {
        large: true,
        cards: [{ title: entryName(entry), facts: factsOf(s, file), pending: pagePending(table, type, entry, index), extra: 'file' in entry ? sourceLines(table, type, file) : undefined, thumb: thumbOf(s, table, type, file) }],
      },
      drop: (paths) => dropOn(s, table, type, { kind: 'replace', index }, paths),
    };
  }

  // ---------- Prendre un fichier ----------

  /** Fichiers du dossier d'import (sous-dossiers compris) qui conviennent à ce type, et les autres. */
  function importFiles(type: MediaType): { accepted: string[]; others: number } {
    const dir = ctx.layout()?.import;
    const accepted: string[] = [];
    let others = 0;
    if (!dir) return { accepted, others };
    try {
      for (const d of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!d.isFile() || d.name.startsWith('.')) continue;
        const file = path.join(d.parentPath, d.name);
        if (isAcceptedFormat(type, file)) accepted.push(file);
        else others++;
        if (accepted.length >= 200) break;
      }
    } catch {
      // Dossier d'import absent : rien à proposer.
    }
    return { accepted: accepted.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })), others };
  }

  function openPick(s: Session, type: MediaType, target: Target): void {
    if (ctx.layout()) fs.mkdirSync(ctx.layout()!.import, { recursive: true });
    nav(s, () => buildPick(s, type, target));
  }

  function returnTo(s: Session, type: MediaType, target: Target): void {
    if (target.kind === 'replace') openPage(s, type, target.index);
    else openType(s, type);
  }

  function buildPick(s: Session, type: MediaType, target: Target): Built {
    const table = tableOf(s);
    if (!table) return lost();
    const info = mediaTypeInfo(type);
    const dir = ctx.layout()?.import ?? '';
    const { accepted, others } = importFiles(type);
    const back = () => returnTo(s, type, target);
    const page = target.kind === 'replace' ? target.index + 1 : target.kind === 'add' ? draftPages(s.draft, type, current(s, table, type)).length + 1 : 1;
    const actions: Action[] = accepted.map((file) => ({
      label: path.relative(dir, file),
      run: () => {
        s.next = { text: place(s, table, type, { from: file, mode: 'move' }, target), tone: 'info' };
        returnTo(s, type, target);
      },
    }));
    const cards: MediaCard[] = accepted.map((file, i) => ({ action: i, title: path.relative(dir, file), facts: factsOf(s, file), thumb: thumbOf(s, table, type, file) }));
    actions.push({ label: t('Actualiser'), detail: t('Après avoir copié un fichier dans le dossier d’import'), run: () => host.broadcast() }, { label: t('Retour'), run: back });
    const rows: Row[] = [];
    if (!accepted.length) {
      rows.push({
        text: t('Aucun fichier qui convienne'),
        detail: t('Copiez dans {dir} un fichier {formats}, depuis une clé USB par exemple, puis « Actualiser ».', { dir, formats: info.formats.join(', ') }),
        tone: 'quiet',
      });
    }
    if (others) {
      rows.push({
        text: tn(others, '{n} autre fichier ignoré', '{n} autres fichiers ignorés'),
        detail: t('Format que le menu ne lit pas pour {label} ({formats}).', { label: info.label, formats: info.formats.join(', ') }),
        tone: 'quiet',
      });
    }
    return {
      heading: t('{label} : prendre dans le dossier d’import', { label: info.label }),
      subheading: dir,
      lead: t('Le fichier choisi quittera le dossier d’import à l’enregistrement, et sera rangé sous « {name} » avec son extension.', {
        name: mediaFileName(table, type, 'ext', page).replace(/\.ext$/, ''),
      }),
      sections: rows.length ? [{ rows }] : [],
      actions,
      back,
      media: { cards },
      drop: (paths) => dropOn(s, table, type, target, paths),
    };
  }

  async function pickOnPc(s: Session, type: MediaType, target: Target): Promise<void> {
    const info = mediaTypeInfo(type);
    const before = tableOf(s);
    if (!ctx.pick || !before) return;
    const paths = await ctx.pick({
      title: t('{label} : choisir un fichier', { label: info.label }),
      icon: 'image',
      purpose: t('{label} de {table}', { label: info.label, table: before.title }),
      mode: 'file',
      filter: { label: info.label, extensions: [...info.formats] },
    });
    const table = tableOf(s);
    if (!paths?.[0] || !table) return;
    s.next = { text: place(s, table, type, { from: paths[0], mode: 'copy' }, target), tone: 'info' };
    returnTo(s, type, target);
  }

  /** Fichier glissé sur l'écran d'un type ou d'une page. */
  function dropOn(s: Session, table: TableEntry, type: MediaType, target: Target, paths: string[]): void {
    const info = mediaTypeInfo(type);
    const file = paths.find((p) => isFile(p) && isAcceptedFormat(type, p));
    if (file) {
      s.next = { text: place(s, table, type, { from: file, mode: 'copy' }, target), tone: 'info' };
      returnTo(s, type, target);
    } else {
      s.notice = { text: t('Aucun fichier {formats} dans ce dépôt : {label} ne peut pas s’en servir.', { formats: info.formats.join(', '), label: info.label }), tone: 'error' };
      host.broadcast();
    }
  }

  /**
   * Fichiers glissés sur la vue d'ensemble : le type se lit dans le nom (« (Wheel) … »,
   * « bg.png », dossier « Wheel » de Popper) ; sinon c'est le média choisi.
   */
  function dropOnOverview(s: Session, table: TableEntry, paths: string[]): void {
    const selected = MANAGED_MEDIA_TYPES[ctx.cursor()];
    const placed: string[] = [];
    const refused: string[] = [];
    for (const p of paths.filter(isFile)) {
      const type = guessMediaType(p) ?? (selected && isAcceptedFormat(selected, p) ? selected : undefined);
      if (!type) {
        refused.push(path.basename(p));
        continue;
      }
      place(s, table, type, { from: p, mode: 'copy' }, mediaTypeInfo(type).pages ? { kind: 'add' } : { kind: 'set' });
      placed.push(t('« {name} » : {label}', { name: path.basename(p), label: mediaTypeInfo(type).label }));
    }
    const parts = [];
    if (placed.length) parts.push(t('{files}, à enregistrer.', { files: placed.join(t(' ; ')) }));
    if (refused.length) parts.push(t('Non reconnu : {files}. Choisissez d’abord le média, puis déposez le fichier.', { files: refused.join(', ') }));
    s.notice = { text: parts.join(' ') || t('Aucun fichier dans ce dépôt.'), tone: refused.length ? 'warning' : 'info' };
    host.broadcast();
  }

  // ---------- Volume ----------

  function openVolume(s: Session): void {
    const table = tableOf(s);
    if (!table) return;
    const now = nextMemory(mediaMemory(table.info), s.draft).volume ?? 100;
    const saved = mediaMemory(table.info).volume ?? 100;
    nav(
      s,
      () => ({
        heading: t('Volume de ce jeu'),
        subheading: table.title,
        lead: t('Vidéos et musique de ce jeu dans le menu, par rapport au réglage général : pour une vidéo enregistrée trop fort ou trop bas.'),
        sections: [],
        actions: [
          ...MEDIA_VOLUME_STEPS.map((v) => ({
            label: v === 100 ? t('100 % : comme les autres jeux') : v === 0 ? t('0 % : muet') : t('{percent} %', { percent: v }),
            detail: [v === now ? t('choix actuel') : undefined, v === saved && v !== now ? t('enregistré') : undefined].filter(Boolean).join(' · ') || undefined,
            tone: v === now ? ('ok' as const) : undefined,
            run: () => {
              if (v === saved) delete s.draft.volume;
              else s.draft.volume = v;
              s.notice = undefined;
              toOverview(s, MANAGED_MEDIA_TYPES.length);
            },
          })),
          { label: t('Retour'), run: () => toOverview(s, MANAGED_MEDIA_TYPES.length) },
        ],
        back: () => toOverview(s, MANAGED_MEDIA_TYPES.length),
      }),
      Math.max(0, MEDIA_VOLUME_STEPS.indexOf(now)),
    );
  }

  // ---------- Affectation immédiate (recherche libre) ----------

  /**
   * Écrit un seul média aussitôt, après l'écran « Reçu » qui a montré ce qui serait écrit :
   * le fichier rangé sous son nom, l'ancien à la corbeille. Les autres changements du
   * brouillon restent à enregistrer ; celui de ce média, remplacé, est oublié.
   */
  function commit(s: Session, table: TableEntry, type: MediaType, entry: MediaPageEntry): { text: string; tone: Tone } {
    const info = mediaTypeInfo(type);
    const now = current(s, table, type);
    const source = entrySource(entry);
    if (!info.pages && now[0] && sameFileContent(source, now[0])) return { text: t('« {file} » est identique au média {label} actuel : rien n’a été écrit.', { file: path.basename(source), label: info.label }), tone: 'info' };
    const plan = planSingleMedia(table, type, entry, now, { infoFile: infoFileFor(table, ctx.tablesDir()) });
    if (plan.problems.length) return { text: t('Rien n’a été écrit : {problems}', { problems: plan.problems.join(' ') }), tone: 'error' };
    const trashDir = trashDirFor(ctx.layout()!.trash, `Médias ${path.basename(table.folder)}`); // i18n-ignore : nom de dossier de la corbeille
    try {
      applyOps(plan.ops, { trashDir });
    } catch (error) {
      host.reload(table.file);
      return { text: t('Écriture interrompue : {error}. Ce qui a déjà été fait est resté ; les fichiers retirés sont dans {dir}.', { error: (error as Error).message, dir: path.relative(root(), trashDir) }), tone: 'error' };
    }
    delete s.draft.pages[type];
    host.reload(table.file);
    const name = mediaFileName(table, type, path.extname(source).slice(1), info.pages ? now.length + 1 : 1);
    return {
      text: [t('Enregistré : « {name} » est maintenant le média {label}, le menu le montre.', { name, label: info.label }), plan.steps.some((st) => st.kind === 'trash') ? t('Ancien fichier dans la corbeille : {dir}.', { dir: path.relative(root(), trashDir) }) : '']
        .filter(Boolean)
        .join(' '),
      tone: 'ok',
    };
  }

  // ---------- Plan et enregistrement ----------


  function planFor(s: Session, table: TableEntry) {
    const currentPages: Partial<Record<MediaType, string[]>> = {};
    for (const type of MANAGED_MEDIA_TYPES) currentPages[type] = current(s, table, type);
    return planMediaChanges(table, s.draft, { infoFile: infoFileFor(table, ctx.tablesDir()), current: currentPages });
  }

  /** Autres versions de la table rangées dans le même dossier : les médias au nom du dossier leur servent aussi. */
  function otherVersions(table: TableEntry): TableEntry[] {
    if (samePath(table.folder, ctx.tablesDir())) return [];
    return host.tables().filter((t) => samePath(t.folder, table.folder) && !samePath(t.file, table.file));
  }

  function openPlan(s: Session): void {
    nav(s, () => buildPlan(s));
  }

  function buildPlan(s: Session): Built {
    const table = tableOf(s);
    if (!table) return lost();
    const plan = planFor(s, table);
    const back = () => toOverview(s);
    // Une ligne par média, pour que tout le plan tienne à l'écran : ce qui arrive, ce qui part.
    const rows: Row[] = [];
    for (const type of [...MANAGED_MEDIA_TYPES, undefined]) {
      const steps = plan.steps.filter((st) => st.type === type);
      if (!steps.length) continue;
      const kinds = new Set(steps.map((st) => st.kind));
      const badge = kinds.has('add')
        ? kinds.has('trash')
          ? t('remplacé')
          : t('ajouté')
        : kinds.has('trash')
          ? t('corbeille')
          : kinds.has('rename')
            ? mediaTypeInfo(type ?? 'Other').pages
              ? t('pages réordonnées')
              : t('renommé')
            : t('réglage');
      rows.push({
        text: type ? mediaTypeInfo(type).label : t('Ce jeu'),
        // Pages renumérotées : le numéro suffit, les noms suivent.
        detail: steps.map((st) => (st.kind === 'rename' && type && mediaTypeInfo(type).pages ? st.detail : `${st.text} (${st.detail})`)).join(' · '),
        badges: [badge],
        tone: kinds.has('trash') ? 'warning' : kinds.has('add') ? 'ok' : 'info',
      });
    }
    const sections: Section[] = [];
    if (plan.problems.length) sections.push({ title: t('À corriger avant d’enregistrer'), rows: plan.problems.map((text) => ({ text, tone: 'error' as const })) });
    sections.push({ title: t('Dans {dir}', { dir: path.relative(ctx.tablesDir(), tableMediaDir(table)) || 'medias' }), rows: rows.length ? rows : [{ text: t('Rien à écrire'), tone: 'quiet' }] });
    const notes: string[] = [];
    const others = otherVersions(table);
    if (others.length && plan.steps.some((st) => st.kind === 'add' || st.kind === 'rename')) {
      notes.push(
        tn(
          others.length,
          'Rangés au nom du dossier, ils servent aussi à l’autre version de la table ({versions}).',
          'Rangés au nom du dossier, ils servent aussi aux {n} autres versions de la table ({versions}).',
          { versions: others.map((o) => o.version ?? path.basename(o.file)).join(', ') },
        ),
      );
    }
    if (plan.infoFile) notes.push(t('Réglages écrits dans {file}, ses autres informations conservées.', { file: path.basename(plan.infoFile) }));
    if (notes.length) sections.push({ rows: [{ text: notes.join(' '), tone: 'quiet' }] });
    const actions: Action[] = plan.problems.length || !plan.ops.length ? [] : [{ label: t('Enregistrer'), detail: tn(plan.steps.length, '{n} opération', '{n} opérations'), tone: 'ok', run: () => apply(s) }];
    actions.push({ label: t('Revenir aux médias'), detail: t('Le brouillon est gardé'), run: back });
    return {
      heading: t('Plan d’enregistrement des médias'),
      subheading: table.title,
      lead: t('Voici ce qui va être fait, et rien d’autre. Ce qui est remplacé ou retiré part dans la corbeille de Cyber Pinball (dossier trash), d’où l’on peut le récupérer.'),
      sections,
      actions,
      back,
    };
  }

  function apply(s: Session): void {
    const table = tableOf(s);
    if (!table) return;
    const plan = planFor(s, table);
    if (plan.problems.length) return openPlan(s);
    const trashDir = trashDirFor(ctx.layout()!.trash, `Médias ${path.basename(table.folder)}`); // i18n-ignore : nom de dossier de la corbeille
    try {
      applyOps(plan.ops, { trashDir });
    } catch (error) {
      s.next = {
        text: t('Enregistrement interrompu : {error}. Ce qui a déjà été fait est resté ; les fichiers retirés sont dans {dir}.', { error: (error as Error).message, dir: path.relative(root(), trashDir) }),
        tone: 'error',
      };
      host.reload(table.file);
      s.draft = emptyMediaDraft();
      return toOverview(s, MANAGED_MEDIA_TYPES[0]);
    }
    host.reload(table.file);
    s.draft = emptyMediaDraft();
    const n = plan.steps.length;
    s.next = {
      text: [tn(n, 'Médias enregistrés : {n} opération.', 'Médias enregistrés : {n} opérations.'), fs.existsSync(trashDir) ? t('Anciens fichiers dans la corbeille : {dir}.', { dir: path.relative(root(), trashDir) }) : '']
        .filter(Boolean)
        .join(' '),
      tone: 'ok',
    };
    toOverview(s, MANAGED_MEDIA_TYPES[0]);
  }

  return { open, isOpen: () => session !== undefined };
}

/** Nom montré d'une page : le fichier, ou d'où vient un fichier téléchargé (reçu sous son empreinte MD5). */
function entryName(entry: MediaPageEntry): string {
  if ('from' in entry && entry.origin) return `${entry.origin.origin}, ${entry.origin.key ?? path.basename(entry.from)}`;
  return path.basename(entrySource(entry));
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
