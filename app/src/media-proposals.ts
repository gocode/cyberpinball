// Propositions pour un média d'un jeu (fiche > Médias du jeu > un média > « Voir les
// propositions ») : au lieu d'un seul fichier choisi d'office, toutes les versions
// trouvées, chacune avec son aperçu, d'où elle vient et pourquoi :
//
// - VPinMediaDB, pour chaque jeu retenu par la recherche approfondie (le jeu reconnu,
//   ses autres éditions, les jeux proches que l'utilisateur ajoute) : vidéo ou image,
//   1k ou 4k ;
// - ce que la table a déjà : PuP-Pack, dossier du DMD, image du .directb2s.
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
  formatSize,
  localMediaChoices,
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
} from '@cyberpinball/core';
import type { Action, Built, LibraryHost, Row, Section, Tone } from './library';
import type { MediaCard, MediaThumb } from './library-medias';
import { allowPreview } from './media-protocol';
import type { DeepResult, MediaSearch } from './media-search';

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
}

/** Vignettes de la base VPS d'un jeu (plateaux et frontons). */
function vpsImageCount(game: VpsGame): number {
  return [...(game.tableFiles ?? []), ...(game.b2sFiles ?? [])].filter((f) => typeof f.imgUrl === 'string').length;
}

/** Au plus, des jeux proposés d'office : le reste s'ajoute depuis « Autres jeux… ». */
const DEFAULT_GAMES = 4;

export function createProposals(ctx: ProposalsContext) {
  let state: State | undefined;

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
    ctx.progress('Médias déjà sur la borne : .directb2s (fronton allumé, ampoules), PuP-Pack, DMD, images du .vpx…');
    const local = localMediaChoices(table, { b2s: await ctx.b2s(table), dmdFolder: evidence.script?.dmdFolder, screenshot: ctx.search.screenshot(table), vpxImages: ctx.search.vpxImages(table) });
    const next: State = { file: table.file, games: [], included: [], quality: ctx.search.quality(), local, previews: previous?.previews ?? new Map(), sizes: previous?.sizes ?? new Map(), dead: previous?.dead ?? new Set(), query };
    ctx.progress('Recherche sur VPinMediaDB…');
    const { db, problem } = await ctx.search.index();
    if (!db) next.problem = problem ?? 'GitHub injoignable';
    ctx.progress(query ? `Recherche de « ${query} »…` : 'Recherche approfondie : nom écrit dans la table, ROM, PuP-Pack…');
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

  /** En ligne d'abord (VPinMediaDB), puis ce que la borne a, puis les vignettes VPS, en basse définition. */
  function choicesFor(st: State, type: MediaType): MediaChoice[] {
    const games = includedGames(st);
    const mediadb = mediaDbChoices(
      games.flatMap((g) => (g.entry ? [{ entry: g.entry, game: g.lead.game }] : [])),
      st.quality.quality,
    );
    const vpsGames = games.map((g) => g.lead.game);
    return mergeMediaChoices(mediadb, st.local, vpsImageChoices(vpsGames), vpsMusicChoices(vpsGames))[type] ?? [];
  }

  /** Aperçus (image 1k, ou le son lui-même) et poids des propositions de VPinMediaDB pour ce type. */
  async function prepareType(st: State, type: MediaType): Promise<void> {
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
    void ctx.task('Recherche des propositions…', async () => {
      const st = await ensure(table);
      await prepareType(st, type);
      ctx.show(() => build(type), at);
    });
  }

  /** Après un changement de jeux ou une recherche : les aperçus de ce type, puis l'écran. */
  function reopen(table: TableEntry, type: MediaType, at = 0): void {
    void ctx.task('Aperçus…', async () => {
      await prepareType(await ensure(table), type);
      ctx.show(() => build(type), at);
    });
  }

  function remoteThumb(st: State, choice: MediaChoice): MediaThumb {
    const offer = choice.offer!;
    if (offer.kind === 'audio') {
      if (st.dead.has(offer.file.url)) return { kind: 'fallback', rotation: 0, text: 'Lien mort' };
      const file = st.previews.get(offer.file.url);
      if (!file || !fs.existsSync(file)) return { kind: 'audio', rotation: 0, text: '♪' };
      allowPreview(file);
      return { kind: 'audio', url: mediaUrl(file), rotation: 0, text: '♪' };
    }
    const file = offer.preview && st.previews.get(offer.preview.url);
    if (!file || !fs.existsSync(file)) return { kind: 'fallback', rotation: 0, text: 'Aperçu indisponible' };
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

  function cardFor(st: State, table: TableEntry, choice: MediaChoice, action: number): MediaCard {
    const chosen = isChosen(table, choice);
    const current = !chosen && isCurrent(table, choice);
    const lead = choice.vpsId ? st.games.find((g) => g.lead.game.id === choice.vpsId)?.lead : undefined;
    let facts: string;
    if (choice.offer) {
      const size = st.sizes.get(choice.offer.file.url);
      const preview = choice.source === 'vps' ? st.previews.get(choice.offer.file.url) : undefined;
      const d = preview ? readMediaDimensions(preview) : undefined;
      facts = [choice.detail, d ? `${d.width} × ${d.height}` : undefined, size === undefined ? 'taille inconnue' : formatSize(size)].filter(Boolean).join(' · ');
    } else facts = ctx.facts(choice.file!);
    const extra: string[] = [];
    if (lead) extra.push(`Jeu retenu : ${lead.reasons.slice(0, 2).join(' ; ')}.`);
    if (choice.source === 'vps') extra.push('Basse définition : vignette de la base VPS, à défaut d’autre chose.');
    else if (choice.source === 'vps-music') extra.push(choice.offer && st.dead.has(choice.offer.file.url) ? 'Lien mort : Dropbox a renvoyé une page au lieu du fichier.' : 'Lien de partage Dropbox donné par la base VPS ; la musique s’écoute dès que la carte est choisie.');
    else if (choice.offer?.kind === 'video') extra.push('Aperçu : image du même jeu ; la vidéo arrive au téléchargement.');
    else if (choice.offer?.quality === '4k') extra.push('Aperçu : la même image en 1k ; le fichier 4k arrive au téléchargement.');
    if (!choice.offer) {
      const rel = path.relative(table.folder, choice.file!);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        // Image extraite du .vpx ou du .directb2s, gardée dans le cache des médias : pas un fichier de la table.
        extra.push(`Extraite du ${choice.source === 'b2s' ? '.directb2s' : '.vpx'} de la table, gardée dans le cache des médias ; copiée dans medias\\ à l’enregistrement.`);
      } else {
        extra.push(`Fichier : ${rel}`);
        extra.push('Copié dans medias\\ ; l’original reste à sa place, la table en a besoin.');
      }
    }
    return {
      action,
      title: choice.label,
      code: sourceName(choice),
      state: chosen ? { label: 'Choisi, à enregistrer', tone: 'warning' } : current ? { label: 'Actuel', tone: 'ok' } : undefined,
      facts,
      extra,
      thumb: choice.offer ? remoteThumb(st, choice) : ctx.thumb(table, choice.type, choice.file!),
    };
  }

  function build(type: MediaType): Built {
    const table = state && ctx.find(state.file);
    const back = () => ctx.back(type);
    if (!state || !table) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour', run: back }], back };
    const st = state;
    const info = mediaTypeInfo(type);
    const choices = choicesFor(st, type);
    const actions: Action[] = choices.map((choice) => ({
      label: choice.label,
      detail: `${sourceName(choice)} · ${choice.detail}`,
      run: () => pick(table, type, choice),
    }));
    const cards = choices.map((choice, i) => cardFor(st, table, choice, i));
    const games = includedGames(st).length;
    actions.push(
      {
        label: 'Autres jeux…',
        detail: `${games} jeu${games > 1 ? 'x' : ''} retenu${games > 1 ? 's' : ''} sur ${st.games.length} trouvé${st.games.length > 1 ? 's' : ''} avec des médias`,
        run: () => openGames(table, type),
      },
      { label: 'Chercher un autre titre…', detail: 'Titre en anglais, initiales ou nom de ROM', run: () => askTitle(table, type, () => ctx.show(() => build(type))) },
      { label: `Retour : ${info.label}`, run: back },
    );
    const rows: Row[] = [];
    if (st.problem) rows.push({ text: 'VPinMediaDB indisponible', detail: `${st.problem}. Restent les médias déjà sur la borne, et les vignettes VPS déjà reçues.`, tone: 'warning' });
    if (!choices.length) {
      rows.push({
        text: 'Aucune proposition pour ce média',
        detail: st.games.length
          ? `Les jeux retenus n’ont pas de ${info.label.toLowerCase()}, et la table n’en a pas dans son PuP-Pack ni son dossier du DMD. « Autres jeux… » pour en retenir d’autres.`
          : 'Aucun jeu de la base VPS ne correspond : « Chercher un autre titre… », ou prenez un fichier dans le dossier d’import.',
        tone: 'quiet',
      });
    }
    const sections: Section[] = rows.length ? [{ rows }] : [];
    const source = [...new Set(choices.map(sourceName))].join(', ');
    return {
      heading: `${info.label} : propositions`,
      subheading: `${table.title}${st.query ? ` · recherche « ${st.query} »` : ''}`,
      lead: `${choices.length} proposition${choices.length > 1 ? 's' : ''}${source ? ` (${source})` : ''}. ${info.pages ? 'Start ajoute la proposition comme nouvelle page' : 'Start remplace le média par la proposition'} dans le brouillon ; rien n’est écrit avant « Enregistrer ».${choices.some((c) => c.offer) ? ' Médias en ligne : sans licence déclarée, pour un usage personnel sur votre borne.' : ''}`,
      sections,
      actions,
      back,
      media: { cards },
    };
  }

  function pick(table: TableEntry, type: MediaType, choice: MediaChoice): void {
    if (isChosen(table, choice)) return ctx.back(type, { text: 'Cette proposition est déjà dans le brouillon.', tone: 'info' });
    if (!choice.offer) {
      const text = ctx.place(table, type, { from: choice.file!, mode: 'copy' });
      return ctx.back(type, { text, tone: 'info' });
    }
    const offer = choice.offer;
    const at = ctx.cursor();
    const st = state!;
    const origin = choice.source === 'mediadb' ? MEDIADB_NAME : VPS_IMAGE_ORIGIN;
    const download = () =>
      void ctx.task(`Téléchargement depuis ${sourceName(choice)}…`, async () => {
        let last = 0;
        let file: string;
        try {
          file = await ctx.search.stage(offer.file, (received, total) => {
            if (Date.now() - last < 250) return;
            last = Date.now();
            ctx.progress(`${mediaTypeInfo(type).label} : ${formatSize(received)}${total ? ` sur ${formatSize(total)}` : ''}…`);
          });
        } catch (error) {
          return ctx.back(type, { text: `Téléchargement impossible : ${(error as Error).message}. Rien n’a été laissé.`, tone: 'error' });
        }
        if (offer.kind === 'audio' && !isAudioFile(file)) {
          fs.rmSync(file, { force: true });
          st.dead.add(offer.file.url);
          return ctx.back(type, { text: 'Lien mort : le site a renvoyé une page au lieu du fichier. Rien n’a été gardé.', tone: 'error' });
        }
        const text = ctx.place(table, type, { from: file, mode: 'move', origin: { origin, url: offer.file.url, vpsId: choice.vpsId, key: offer.key, md5: offer.file.md5 } });
        ctx.back(type, { text: `${text} Téléchargé${offer.file.md5 ? ' et vérifié' : ''}.`, tone: 'info' });
      });
    // L'avertissement de VPinMediaDB (aucune licence) est lu une fois avant son premier téléchargement.
    if (choice.source === 'mediadb') ctx.withNotice(download, () => ctx.show(() => build(type), at));
    else download();
  }

  // ---------- Jeux retenus ----------

  function askTitle(table: TableEntry, type: MediaType, cancel: () => void): void {
    ctx.prompt(
      'Chercher un autre titre',
      'Titre du jeu',
      state?.query ?? '',
      (text) => {
        if (!text?.trim()) return cancel();
        void ctx.task(`Recherche de « ${text.trim()} »…`, async () => {
          const st = await ensure(table, text.trim());
          await prepareType(st, type);
          ctx.show(() => build(type));
        });
      },
      'Le titre en anglais, tel que le fabricant l’a sorti (« Guardians of the Galaxy »), ses initiales (« GOTG ») ou le nom de sa ROM (« t2_l8 »). Le premier jeu trouvé s’ajoute aux propositions ; « Autres jeux… » pour choisir.',
    );
  }

  /** Image qui fait reconnaître un jeu : son logo sur VPinMediaDB, sinon une vignette VPS de son fronton ou de sa table. */
  function faceOf(g: Game): MediaDbFile | undefined {
    if (g.entry?.files.wheel) return g.entry.files.wheel;
    const images = vpsImageChoices([g.lead.game]);
    return (images.Backglass?.[0] ?? images.Playfield?.[0])?.offer?.file;
  }

  function openGames(table: TableEntry, type: MediaType, at = 0): void {
    void ctx.task('Logos des jeux…', async () => {
      const st = await ensure(table);
      await ctx.search.stagePreviews(st.games.flatMap((g) => faceOf(g) ?? []), st.previews, 'Logos');
      ctx.show(() => buildGames(type), at);
    });
  }

  function buildGames(type: MediaType): Built {
    const table = state && ctx.find(state.file);
    const back = () => (table ? reopen(table, type) : ctx.back(type));
    if (!state || !table) return { heading: 'Table introuvable', sections: [], actions: [{ label: 'Retour', run: back }], back };
    const st = state;
    const actions: Action[] = st.games.map((g) => {
      const id = g.lead.game.id;
      const on = st.included.includes(id);
      return {
        label: vpsLabel(g.lead.game),
        detail: on ? 'Proposé : Start pour le retirer' : 'Start pour proposer ses médias',
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
      let thumb: MediaThumb = { kind: 'fallback', rotation: 0, text: 'Pas d’image' };
      if (file && fs.existsSync(file)) {
        allowPreview(file);
        thumb = { kind: 'image', url: mediaUrl(file), rotation: 0 };
      }
      const types = g.entry ? mediaDbOffers(g.entry, st.quality.quality).map((o) => mediaTypeInfo(o.type).label.toLowerCase()) : [];
      const thumbs = vpsImageCount(g.lead.game);
      return {
        action: i,
        title: vpsLabel(g.lead.game),
        state: on ? { label: 'Proposé', tone: 'ok' } : undefined,
        facts: [types.length ? `${MEDIADB_NAME} : ${types.join(', ')}` : undefined, thumbs ? `${thumbs} vignette${thumbs > 1 ? 's' : ''} VPS` : undefined].filter(Boolean).join(' · '),
        extra: g.lead.reasons.slice(0, 3),
        thumb,
      };
    });
    const without = (st.deep?.leads ?? []).filter((l) => !st.games.some((g) => g.lead.game.id === l.game.id)).slice(0, 6);
    const sections: Section[] = [];
    if (!st.games.length) sections.push({ rows: [{ text: 'Aucun jeu avec des médias', detail: 'Cherchez un autre titre : en anglais, ses initiales ou le nom de sa ROM.', tone: 'quiet' }] });
    if (without.length) {
      sections.push({
        title: 'Reconnus aussi, sans aucun média en ligne',
        rows: without.map((l) => ({ text: vpsLabel(l.game), detail: l.reasons.slice(0, 2).join(' ; '), tone: 'quiet' as const })),
      });
    }
    actions.push(
      { label: 'Chercher un autre titre…', detail: 'Titre en anglais, initiales ou nom de ROM', run: () => askTitle(table, type, () => ctx.show(() => buildGames(type))) },
      { label: 'Retour aux propositions', tone: 'ok', run: back },
    );
    return {
      heading: 'Jeux dont les médias sont proposés',
      subheading: `${table.title}${st.query ? ` · recherche « ${st.query} »` : ''}`,
      lead: 'Jeux de la base VPS que désignent le nom de la table, le nom écrit dedans par son auteur, sa ROM, son PuP-Pack ou votre recherche, le plus probable d’abord, avec leurs raisons. Start ajoute ou retire un jeu des propositions.',
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
