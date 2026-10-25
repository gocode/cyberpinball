// « Chercher les médias » (T10, docs/recherche/medias.md § 5.5) : téléchargement depuis
// VPinMediaDB, à la demande seulement. Deux entrées :
// - le gestionnaire des médias d'un jeu (fiche > Médias du jeu) : tout ce que
//   VPinMediaDB a pour ce jeu, chaque média avec son aperçu, son poids et ce qu'il
//   remplace ; un média déjà là n'est remplacé que si on le demande ;
// - le menu système : les médias qui manquent à toutes les tables, sans jamais
//   remplacer un média existant.
// Dans les deux cas : avertissement au premier usage (aucune licence), plan à
// valider, puis progression. Quand le jeu n'est pas reconnu avec certitude, la
// recherche approfondie (media-search.ts) propose ses pistes, chacune avec ses
// raisons, et l'utilisateur peut chercher un autre titre. Cœur :
// packages/core/src/mediadb.ts et mediasearch.ts.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  acceptMediaDbNotice,
  cleanMediaDbStaging,
  createTransferMeter,
  formatSize,
  formatTransfer,
  freeSpace,
  infoFileFor,
  installMediaDb,
  loadCabinet,
  matchMediaDb,
  MEDIADB_CITATION,
  MEDIADB_HOW_LABELS,
  MEDIADB_NAME,
  MEDIADB_REPO,
  MEDIADB_REPO_URL,
  MEDIADB_TYPES,
  mediaDbNotice,
  mediaDbNoticeAccepted,
  mediaDbOfferLabel,
  mediaDbOffers,
  mediaFileName,
  mediaPlacement,
  mediaTypeInfo,
  playfieldMediaRotation,
  proposeMediaDb,
  readMediaDimensions,
  samePath,
  t,
  tn,
  trashDirFor,
  vpsLabel,
  type Layout,
  type MediaDb,
  type MediaDbChoice,
  type MediaDbMatch,
  type MediaDbOffer,
  type MediaDbProposal,
  type MediaDbQualityChoice,
  type MediaType,
  type TableEntry,
  mediaUrl,
} from '@cyberpinball/core';
import type { Action, Built, LibraryHost, Row, Section } from './library';
import { allowPreview } from './media-protocol';
import type { MediaCard, MediaThumb } from './library-medias';
import type { DeepResult, MediaSearch } from './media-search';

export interface MediaDownloadContext {
  host: LibraryHost;
  layout(): Layout | undefined;
  tablesDir(): string;
  find(file: string): TableEntry | undefined;
  openCustom(build: () => Built, at?: number): void;
  openSystem(): void;
  openNotice(heading: string, lines: string[], then?: () => void): void;
  /** Opération longue : message à l'écran, touches ignorées. */
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  /** Change le message de l'opération en cours. */
  progress(message: string): void;
  cursor(): number;
  /** Index, recherche approfondie et aperçus, partagés avec les propositions de chaque média. */
  search: MediaSearch;
  /** Saisie d'un texte au clavier de l'écran (ou au vrai clavier) ; undefined : annulé. */
  prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
}

/** Ce que VPinMediaDB propose à une table, et ce que l'utilisateur en retient. */
interface Offer {
  file: string;
  title: string;
  match: MediaDbMatch;
  /** Jeu de VPinMediaDB retenu parmi match.candidates. */
  pick: number;
  quality: MediaDbQualityChoice;
  proposals: MediaDbProposal[];
  /** Variante retenue par type ; undefined : rien. */
  chosen: Map<MediaType, number | undefined>;
  sizes: Map<string, number>;
  /** Aperçus reçus : adresse de l'aperçu -> fichier vérifié dans downloads\vpinmediadb. */
  previews: Map<string, string>;
  /** Titre saisi par l'utilisateur pour cette recherche. */
  query?: string;
}

/** Lignes montrées par section ; le reste est compté. */
const MAX_ROWS = 40;
const heading = () => t('Médias de VPinMediaDB');

/** « a ; b ; c », à la façon de la langue (« a; b; c » en anglais). */
function joinSemi(items: readonly string[]): string {
  return items.length ? items.reduce((a, b) => t('{a} ; {b}', { a, b })) : '';
}

export function createMediaDownload(ctx: MediaDownloadContext) {
  const { host } = ctx;

  const index = () => ctx.search.index();
  const staging = () => ctx.search.staging();

  // ---------- Avertissement, au premier usage ----------

  function noticeRows(): Row[] {
    return [
      { text: t('Aucune licence'), detail: mediaDbNotice(), tone: 'warning' },
      {
        text: t('Source'),
        detail: t('{name}, dépôt {repo} sur GitHub : {url}. L’adresse et la date de chaque fichier téléchargé sont notées dans le .info de la table.', {
          name: MEDIADB_NAME,
          repo: MEDIADB_REPO,
          url: MEDIADB_REPO_URL,
        }),
        tone: 'info',
      },
    ];
  }

  function withNotice(then: () => void, back: () => void): void {
    if (mediaDbNoticeAccepted(host.dataDir)) return then();
    ctx.openCustom(() => ({
      heading: heading(),
      subheading: MEDIADB_CITATION,
      lead: t('À lire une fois, avant le premier téléchargement.'),
      sections: [
        {
          rows: [
            ...noticeRows(),
            {
              text: t('Ce que fait Cyber Pinball'),
              detail: t('Il ne livre aucun de ces médias : il les télécharge à votre demande, après un plan à valider. Un média que vous avez déjà n’est remplacé que si vous le demandez, et l’ancien part à la corbeille.'),
              tone: 'quiet',
            },
          ],
        },
      ],
      actions: [
        {
          label: t('J’ai compris : chercher les médias'),
          tone: 'ok',
          run: () => {
            acceptMediaDbNotice(host.dataDir);
            then();
          },
        },
        { label: t('Retour'), run: back },
      ],
      back,
    }));
  }

  // ---------- Préparation d'une proposition ----------

  const qualityChoice = (): MediaDbQualityChoice => ctx.search.quality();

  function prepare(table: TableEntry, match: MediaDbMatch, pick: number, missingOnly: boolean): Offer {
    const entry = match.candidates[pick]!.entry;
    const quality = qualityChoice();
    const proposals = proposeMediaDb(table, entry, quality.quality, { root: ctx.layout()!.root, missingOnly });
    const chosen = new Map(proposals.map((p) => [p.type, p.selected]));
    return { file: table.file, title: table.title, match, pick, quality, proposals, chosen, sizes: new Map(), previews: new Map() };
  }

  async function measure(offers: Offer[]): Promise<void> {
    const sizes = await ctx.search.sizes(offers.flatMap((o) => o.proposals.flatMap((p) => p.variants.map((v) => v.file))));
    for (const o of offers) o.sizes = sizes;
  }

  /** Aperçus du plan : l'image 1k de chaque média, reçue et vérifiée ; une image retenue ne sera pas téléchargée deux fois. */
  async function previews(o: Offer): Promise<void> {
    await ctx.search.stagePreviews(o.proposals.flatMap((p) => p.variants.flatMap((v) => (v.preview ? [v.preview] : []))), o.previews);
  }

  /** Aperçus reçus pour un plan abandonné : effacés, il ne reste rien. */
  function forget(offers: Offer[]): void {
    cleanMediaDbStaging(staging(), { remove: offers.flatMap((o) => [...o.previews.values()]) });
    for (const o of offers) o.previews.clear();
  }

  const entryOf = (o: Offer) => o.match.candidates[o.pick]!;

  function gameLabel(o: Offer): string {
    const c = entryOf(o);
    return c.game ? vpsLabel(c.game) : o.title;
  }

  function choicesOf(o: Offer): MediaDbChoice[] {
    return o.proposals.flatMap((p) => {
      const i = o.chosen.get(p.type);
      return i === undefined ? [] : [{ offer: p.variants[i]!, replaces: p.replaces }];
    });
  }

  function bytesOf(o: Offer): { bytes: number; unknown: number } {
    let bytes = 0;
    let unknown = 0;
    for (const c of choicesOf(o)) {
      const size = o.sizes.get(c.offer.file.url);
      if (size === undefined) unknown++;
      else bytes += size;
    }
    return { bytes, unknown };
  }

  function sizeLabel(o: Offer, offer: MediaDbOffer): string {
    const size = o.sizes.get(offer.file.url);
    return size === undefined ? t('taille inconnue') : formatSize(size);
  }

  function totalLabel(offers: Offer[]): string {
    let bytes = 0;
    let unknown = 0;
    for (const o of offers) {
      const b = bytesOf(o);
      bytes += b.bytes;
      unknown += b.unknown;
    }
    return unknown
      ? tn(unknown, '{size} (et {n} fichier de taille inconnue)', '{size} (et {n} fichiers de taille inconnue)', { size: formatSize(bytes) })
      : formatSize(bytes);
  }

  // ---------- Un jeu (gestionnaire des médias) ----------

  /** Cherche les médias de ce jeu ; `back` revient au gestionnaire, avec un message éventuel. */
  function openTable(table: TableEntry, back: (message?: { text: string; tone: 'ok' | 'info' | 'warning' | 'error' }) => void): void {
    if (!ctx.layout()) return ctx.openNotice(t('Cyber Pinball n’est pas installé'), [t('Lancez « Installer » depuis le lanceur : il crée le dossier des téléchargements.')]);
    withNotice(() => search(table, back), () => back());
  }

  /**
   * Cherche les médias de ce jeu. Reconnu avec certitude (identifiant VPS, titre sans
   * hésitation) : le plan tout de suite. Sinon, ou si l'utilisateur a saisi un titre
   * (`query`), la recherche approfondie classe les jeux possibles avec leurs raisons.
   */
  function search(table: TableEntry, back: Parameters<typeof openTable>[1], pick: number | MediaDbMatch = 0, query?: string): void {
    void ctx.task(query ? t('Recherche de « {query} »…', { query }) : t('Recherche sur VPinMediaDB…'), async () => {
      cleanMediaDbStaging(staging());
      const { db: found, problem } = await index();
      if (!found) return showUnavailable(problem, () => back());
      // Jeu choisi dans « Quel jeu est-ce ? » : la liste montrée reste celle-là.
      let match = typeof pick === 'object' ? pick : query ? undefined : matchMediaDb(found, table, await ctx.search.vps());
      let deep: DeepResult | undefined;
      if (typeof pick !== 'object' && !match?.confident) {
        ctx.progress(t('Recherche approfondie : nom écrit dans la table, ROM, PuP-Pack…'));
        deep = await ctx.search.deep(table, found, query);
        if (deep.candidates.length) {
          match = { candidates: deep.candidates.map(({ entry, game, lead }) => ({ entry, game, reasons: lead.reasons })), how: match?.how === 'vps-sibling' ? 'vps-sibling' : 'deep', confident: false, vpsId: match?.vpsId };
        }
      }
      if (!match?.candidates.length) return showNothing(table, match?.reason ?? t('Aucun jeu de la base VPS ne ressemble à ce titre.'), deep, back);
      const at = typeof pick === 'object' ? 0 : Math.min(pick, match.candidates.length - 1);
      const o = prepare(table, match, at, false);
      o.query = query;
      await measure([o]);
      await previews(o);
      showTablePlan(o, { back, single: true });
    });
  }

  /** Saisie d'un titre, puis recherche avec lui ; Annuler revient à `cancel`. */
  function askTitle(table: TableEntry, back: Parameters<typeof openTable>[1], cancel: () => void, value = ''): void {
    ctx.prompt(
      t('Chercher un autre titre'),
      t('Titre du jeu'),
      value,
      (text) => (text?.trim() ? search(table, back, 0, text.trim()) : cancel()),
      t('Le titre en anglais, tel que le fabricant l’a sorti (« Guardians of the Galaxy »), ses initiales (« GOTG ») ou le nom de sa ROM (« t2_l8 »).'),
    );
  }

  function showUnavailable(problem: string | undefined, back: () => void): void {
    ctx.openCustom(() => ({
      heading: heading(),
      lead: t('L’index de VPinMediaDB n’a jamais été téléchargé, et GitHub ne répond pas.'),
      sections: [
        {
          rows: [
            {
              text: t('Sans réseau'),
              detail: t('{problem}. Réessayez quand la borne est reliée à Internet : l’index est ensuite gardé et sert sans réseau.', { problem: problem ?? t('GitHub injoignable') }),
              tone: 'warning',
            },
          ],
        },
      ],
      actions: [{ label: t('Retour'), run: back }],
      back,
    }));
  }

  function showNothing(table: TableEntry, reason: string, deep: DeepResult | undefined, back: Parameters<typeof openTable>[1]): void {
    const leave = () => back();
    const known = (deep?.leads ?? []).slice(0, 5);
    ctx.openCustom(() => ({
      heading: t('Rien sur VPinMediaDB pour ce jeu'),
      subheading: table.title,
      lead: t('{reason} La recherche approfondie a lu le nom écrit dans la table, son script et ses fichiers.', { reason }),
      sections: [
        ...(known.length
          ? [
              {
                title: t('Jeux de la base VPS qui ressemblent, sans médias sur VPinMediaDB'),
                rows: known.map((l) => ({ text: vpsLabel(l.game), detail: joinSemi(l.reasons.slice(0, 2)), tone: 'quiet' as const })),
              },
            ]
          : []),
        {
          rows: [
            {
              text: t('Autres sources'),
              detail: t('Chaque média propose aussi ce que la table a déjà (PuP-Pack, dossier du DMD, .directb2s) : Médias du jeu, puis le média, puis « Voir les propositions ». Les médias de VPUniverse se téléchargent depuis leur site (connexion obligatoire) ; déposez ensuite le fichier dans le dossier d’import, ou glissez-le sur l’écran des médias.'),
              tone: 'quiet',
            },
          ],
        },
      ],
      actions: [
        { label: t('Chercher un autre titre…'), detail: t('Titre en anglais, initiales ou nom de ROM'), tone: 'ok', run: () => askTitle(table, back, () => showNothing(table, reason, deep, back)) },
        { label: t('Retour aux médias'), run: leave },
      ],
      back: leave,
    }));
  }

  interface PlanMode {
    back: Parameters<typeof openTable>[1];
    /** Gestionnaire d'un jeu : son propre bouton « Télécharger ». Sinon, détail du plan général. */
    single: boolean;
  }

  function previewOf(o: Offer, offer: MediaDbOffer): MediaThumb {
    if (offer.kind === 'audio') return { kind: 'audio', rotation: 0, text: '♪' };
    const file = offer.preview && o.previews.get(offer.preview.url);
    if (!file || !fs.existsSync(file)) return { kind: 'fallback', rotation: 0, text: t('Aperçu indisponible') };
    // Vu du joueur, flippers en bas : la rotation que le menu appliquera.
    const rotation = mediaTypeInfo(offer.type).orientable ? playfieldMediaRotation(readMediaDimensions(file), 'bottom') : 0;
    // Par le protocole des médias, comme tout média : jamais d'adresse directe vers le disque.
    allowPreview(file);
    return { kind: 'image', url: mediaUrl(file), rotation };
  }

  function cardFor(o: Offer, p: MediaDbProposal, action: number, table: TableEntry | undefined): MediaCard {
    const info = mediaTypeInfo(p.type);
    const i = o.chosen.get(p.type);
    const shown = p.variants[i ?? 0]!;
    const names = p.replaces.map((f) => t('« {name} »', { name: path.basename(f) })).join(', ');
    let state: MediaCard['state'];
    let pending: string;
    if (i !== undefined) {
      state = p.update ? { label: t('Nouvelle version'), tone: 'ok' } : p.replaces.length ? { label: t('Remplace l’actuel'), tone: 'warning' } : { label: t('À télécharger'), tone: 'ok' };
      const target = table ? t('rangé sous « {file} »', { file: mediaFileName(table, p.type, shown.ext) }) : t('rangé dans medias\\');
      pending = p.replaces.length
        ? tn(p.replaces.length, 'Remplace {names} : il part à la corbeille. Le nouveau est {target}.', 'Remplace {names} : ils partent à la corbeille. Le nouveau est {target}.', { names, target })
        : t('Nouveau pour ce jeu, {target}.', { target });
    } else if (p.upToDate) {
      state = { label: t('À jour'), tone: 'quiet' };
      pending = t('Déjà là : {names}, le même fichier que sur VPinMediaDB.', { names });
    } else if (p.current.length) {
      state = { label: t('Gardé'), tone: 'quiet' };
      pending = tn(
        p.replaces.length,
        'Gardé : {names} reste. Start pour le remplacer par celui de VPinMediaDB.',
        'Gardé : {names} restent. Start pour le remplacer par celui de VPinMediaDB.',
        { names },
      );
    } else {
      state = { label: t('Pas téléchargé'), tone: 'quiet' };
      pending = t('Rien ne change pour ce média.');
    }
    const extra: string[] = [];
    if (shown.kind === 'video') extra.push(t('Aperçu : image du même jeu ; la vidéo arrive avec le téléchargement.'));
    if (shown.quality === '4k') extra.push(t('Aperçu : la même image en 1k ; le fichier 4k arrive avec le téléchargement.'));
    if (info.orientable) extra.push(t('En largeur, les flippers sont à droite : le menu le tourne d’après l’écran du plateau. L’aperçu le montre vu du joueur.'));
    extra.push(t('Source : {url}', { url: shown.file.url }));
    return {
      action,
      title: info.label,
      code: `(${info.type})`,
      state,
      note: mediaPlacement(p.type, loadCabinet(host.dataDir)).note,
      facts: `${mediaDbOfferLabel(shown)} · ${sizeLabel(o, shown)}${p.variants.length > 1 ? ` · ${t('{n} variantes', { n: p.variants.length })}` : ''}`,
      pending,
      extra,
      thumb: previewOf(o, shown),
    };
  }

  /** Choix suivant pour un type : chaque variante, puis « ne pas télécharger ». */
  function nextChoice(p: MediaDbProposal, i: number | undefined): number | undefined {
    if (i === undefined) return 0;
    return i + 1 < p.variants.length ? i + 1 : undefined;
  }

  function choiceLabel(p: MediaDbProposal, i: number | undefined): string {
    if (i === undefined) return p.current.length ? t('garder l’actuel') : t('ne pas télécharger');
    return mediaDbOfferLabel(p.variants[i]!);
  }

  function showTablePlan(o: Offer, mode: PlanMode, at = 0): void {
    ctx.openCustom(() => buildTablePlan(o, mode), at);
  }

  function buildTablePlan(o: Offer, mode: PlanMode): Built {
    const table = ctx.find(o.file);
    const actions: Action[] = o.proposals.map((p) => ({
      label: t('{type} : {choice}', { type: mediaTypeInfo(p.type).label, choice: choiceLabel(p, o.chosen.get(p.type)) }),
      detail: t('Start : {choice}', { choice: choiceLabel(p, nextChoice(p, o.chosen.get(p.type))) }),
      run: () => {
        o.chosen.set(p.type, nextChoice(p, o.chosen.get(p.type)));
        host.broadcast();
      },
    }));
    const cards = o.proposals.map((p, i) => cardFor(o, p, i, table));
    const n = choicesOf(o).length;
    const cancel = () => {
      if (mode.single) forget([o]);
      mode.back();
    };
    if (mode.single && n) {
      const free = freeSpace(ctx.tablesDir());
      const { bytes } = bytesOf(o);
      if (free !== undefined && bytes > free) {
        actions.push({
          label: t('Place insuffisante'),
          detail: t('Il faut {need}, il reste {free} sur le disque des tables.', { need: formatSize(bytes), free: formatSize(free) }),
          tone: 'error',
          run: () => undefined,
        });
      } else {
        actions.push({ label: t('Télécharger et ranger'), detail: `${tn(n, '{n} média', '{n} médias')} · ${totalLabel([o])}`, tone: 'ok', run: () => applyTable(o, mode) });
      }
    }
    if (mode.single) {
      const n = o.match.candidates.length;
      actions.push({
        label: t('Pas le bon jeu ?'),
        detail:
          o.match.how === 'deep' || n > 1
            ? tn(n, '{n} jeu de VPinMediaDB ressemble à cette table', '{n} jeux de VPinMediaDB ressemblent à cette table')
            : t('Recherche approfondie, ou un autre titre'),
        run: () => openCandidates(o, mode),
      });
    }
    actions.push({ label: mode.single ? t('Annuler') : t('Retour au plan général'), detail: mode.single ? t('Rien n’est téléchargé') : undefined, run: cancel });

    // Une seule ligne avant les cartes : le jeu reconnu et la qualité. L'avertissement est dans l'en-tête,
    // toujours visible, même quand la liste défile jusqu'à la dernière carte.
    const c = entryOf(o);
    const sections: Section[] = [
      {
        rows: [
          {
            text: `${gameLabel(o)} · ${o.quality.quality}`,
            detail: [
              o.match.confident
                ? t('Reconnu par {how} ({id}).', { how: o.match.how ? MEDIADB_HOW_LABELS[o.match.how] : '—', id: c.entry.id })
                : t('Reconnu par {how} ({id}), à vérifier sur les aperçus.', { how: o.match.how ? MEDIADB_HOW_LABELS[o.match.how] : '—', id: c.entry.id }),
              t('Qualité {quality} : {reason} ; seule l’image du plateau existe en 4k.', { quality: o.quality.quality, reason: o.quality.reason }),
            ].join(' '),
            tone: o.match.confident ? 'info' : 'warning',
          },
        ],
      },
    ];
    const absent = MEDIADB_TYPES.filter((t) => !o.proposals.some((p) => p.type === t)).map((t) => mediaTypeInfo(t).label);
    sections.push({
      title: t('Ce que VPinMediaDB n’a pas'),
      rows: [
        ...(absent.length ? [{ text: t('Pour ce jeu : {types}', { types: absent.join(', ') }), tone: 'quiet' as const }] : []),
        { text: t('Jamais : Afficheur (4:1), Topper, Chargement, Son de lancement, Règles'), detail: t('À prendre ailleurs, puis à déposer dans le dossier d’import.'), tone: 'quiet' },
      ],
    });
    return {
      heading: mode.single ? t('Médias proposés par VPinMediaDB') : t('Détail : {title}', { title: o.title }),
      subheading: `${o.title} · ${MEDIADB_CITATION}`,
      lead: `${mediaDbNotice()} ${t('Start sur un média : vidéo, image ou rien. Rien n’est téléchargé avant « Télécharger et ranger ».')}`,
      sections,
      actions,
      back: cancel,
      media: { cards },
    };
  }

  function openCandidates(o: Offer, mode: PlanMode): void {
    const back = () => showTablePlan(o, mode);
    // Jeu reconnu d'emblée : la recherche approfondie montre les autres possibles, le jeu actuel en tête.
    if (o.match.how !== 'deep' && !o.query) {
      const table = ctx.find(o.file);
      if (!table) return back();
      void ctx.task(t('Recherche approfondie : nom écrit dans la table, ROM, PuP-Pack…'), async () => {
        const { db: found } = await index();
        const deep = await ctx.search.deep(table, found);
        const current = entryOf(o);
        const others = deep.candidates.filter((c) => c.entry.id !== current.entry.id).map(({ entry, game, lead }) => ({ entry, game, reasons: lead.reasons }));
        const reasons = current.reasons ?? deep.candidates.find((c) => c.entry.id === current.entry.id)?.lead.reasons ?? [o.match.how ? t('reconnu par {how}', { how: MEDIADB_HOW_LABELS[o.match.how] }) : ''];
        o.match = { ...o.match, candidates: [{ ...current, reasons }, ...others], how: 'deep' };
        o.pick = 0;
        openCandidates(o, mode);
      });
      return;
    }
    ctx.openCustom(
      () => ({
        heading: t('Quel jeu est-ce ?'),
        subheading: o.title,
        lead: o.query
          ? t('Jeux de la base VPS qui ressemblent à « {query} » et ont des médias sur VPinMediaDB.', { query: o.query })
          : t('Jeux de la base VPS que désignent le nom de la table, le nom écrit dedans par son auteur, sa ROM ou son PuP-Pack, et qui ont des médias sur VPinMediaDB. Les raisons sont sous chaque jeu.'),
        sections: [],
        actions: [
          ...o.match.candidates.map((c, i) => ({
            label: c.game ? vpsLabel(c.game) : c.entry.id,
            detail: [i === o.pick ? t('choix actuel') : undefined, ...(c.reasons?.slice(0, 2) ?? [t('identifiant VPS {id}', { id: c.entry.id })])].filter(Boolean).join(' · '),
            tone: i === o.pick ? ('ok' as const) : undefined,
            run: () => {
              const table = ctx.find(o.file);
              if (!table) return back();
              forget([o]);
              // Le jeu choisi passe en tête, la liste reste la même.
              const chosen = o.match.candidates[i]!;
              search(table, mode.back, { ...o.match, candidates: [chosen, ...o.match.candidates.filter((_, j) => j !== i)] }, o.query);
            },
          })),
          {
            label: t('Chercher un autre titre…'),
            detail: t('Titre en anglais, initiales ou nom de ROM'),
            run: () => {
              const table = ctx.find(o.file);
              if (!table) return back();
              askTitle(table, (message) => {
                forget([o]);
                mode.back(message);
              }, () => openCandidates(o, mode), o.query ?? '');
            },
          },
          { label: t('Retour'), run: back },
        ],
        back,
      }),
      o.pick,
    );
  }

  /** Message de progression, au plus quatre fois par seconde ; `line` habille l'étape (« Téléchargement : … »). */
  function progressReporter(line: (step: string) => string) {
    let last = 0;
    // Un compteur par fichier : débit et temps restant du fichier en cours (transfer.ts).
    let meter = { index: -1, of: createTransferMeter() };
    return (p: { index: number; total: number; type: MediaType; received: number; size?: number }) => {
      if (meter.index !== p.index) meter = { index: p.index, of: createTransferMeter() };
      const progress = meter.of.update(p.received, p.size);
      const now = Date.now();
      if (p.received && now - last < 250) return;
      last = now;
      const amount = p.received || p.size ? formatTransfer(progress) : '';
      const params = { type: mediaTypeInfo(p.type).label, index: p.index + 1, total: p.total, amount };
      ctx.progress(line(amount ? t('{type} ({index} sur {total}) : {amount}…', params) : t('{type} ({index} sur {total})…', params)));
    };
  }

  function applyTable(o: Offer, mode: PlanMode): void {
    void ctx.task(t('Téléchargement depuis VPinMediaDB…'), async () => {
      const table = ctx.find(o.file);
      if (!table) return mode.back({ text: t('Cette table n’existe plus.'), tone: 'error' });
      const trashDir = trashDirFor(ctx.layout()!.trash, `Médias ${path.basename(table.folder)} (VPinMediaDB)`); // i18n-ignore : nom de dossier de la corbeille
      const result = await installMediaDb(table, choicesOf(o), {
        infoFile: infoFileFor(table, ctx.tablesDir()),
        trashDir,
        stagingDir: staging(),
        entry: entryOf(o).entry,
        onProgress: progressReporter((step) => t('Téléchargement : {step}', { step })),
      });
      forget([o]);
      host.reload(table.file);
      const ok = result.installed.length;
      const parts = [tn(ok, '{n} média de {source} rangé, source notée dans le .info.', '{n} médias de {source} rangés, source notée dans le .info.', { source: MEDIADB_NAME })];
      const trashed = result.installed.flatMap((i) => i.trashed).length;
      if (trashed) parts.push(t('Anciens fichiers dans la corbeille : {folder}.', { folder: path.relative(ctx.layout()!.root, trashDir) }));
      if (result.failed.length) {
        parts.push(t('Non téléchargé (rien n’a été laissé) : {list}.', { list: joinSemi(result.failed.map((f) => `${mediaTypeInfo(f.type).label}, ${f.reason}`)) }));
      }
      mode.back({ text: parts.join(' '), tone: result.failed.length ? (ok ? 'warning' : 'error') : 'ok' });
    });
  }

  // ---------- Toutes les tables (menu système) ----------

  interface Survey {
    offers: Offer[];
    /** Reconnues au titre seulement : pas téléchargées d'office. */
    doubtful: { table: TableEntry; label: string }[];
    absent: { table: TableEntry; reason: string }[];
    /** Tables qui ont déjà tout ce que VPinMediaDB propose. */
    complete: number;
  }

  function openMissing(): void {
    if (!ctx.layout()) return ctx.openNotice(t('Cyber Pinball n’est pas installé'), [t('Lancez « Installer » depuis le lanceur : il crée le dossier des tables.')]);
    withNotice(
      () =>
        void ctx.task(t('Recherche des médias manquants…'), async () => {
          cleanMediaDbStaging(staging());
          const { db: found, problem } = await index();
          if (!found) return showUnavailable(problem, () => ctx.openSystem());
          const survey = await surveyTables(found);
          await measure(survey.offers);
          showSurvey(survey);
        }),
      () => ctx.openSystem(),
    );
  }

  /** Une table par dossier : les versions d'un même jeu partagent ses médias, rangés au nom du dossier. */
  function oneByFolder(tables: TableEntry[]): TableEntry[] {
    const seen = new Set<string>();
    return tables.filter((t) => {
      const key = (samePath(t.folder, ctx.tablesDir()) ? t.file : t.folder).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function surveyTables(found: MediaDb): Promise<Survey> {
    const tables = oneByFolder(host.tables());
    const vps = await ctx.search.vps();
    const survey: Survey = { offers: [], doubtful: [], absent: [], complete: 0 };
    for (const [i, table] of tables.entries()) {
      ctx.progress(t('Recherche des médias manquants : table {i} sur {total}…', { i: i + 1, total: tables.length }));
      const match = matchMediaDb(found, table, vps);
      if (!match.candidates.length) {
        // Nom changé ou abrégé : la recherche approfondie (sans lancer VPX pour lire les scripts)
        // peut trouver une piste, montrée à vérifier, jamais téléchargée d'office.
        const deep = await ctx.search.deep(table, found, undefined, false);
        const first = deep.candidates[0];
        if (first) survey.doubtful.push({ table, label: first.game ? vpsLabel(first.game) : first.entry.id });
        else survey.absent.push({ table, reason: match.reason ?? t('Pas sur VPinMediaDB.') });
        continue;
      }
      if (!match.confident) {
        const c = match.candidates[0]!;
        survey.doubtful.push({ table, label: c.game ? vpsLabel(c.game) : c.entry.id });
        continue;
      }
      const o = prepare(table, match, 0, true);
      if (choicesOf(o).length) survey.offers.push(o);
      else survey.complete++;
    }
    return survey;
  }

  function surveyRow(o: Offer, action?: number): Row {
    const choices = choicesOf(o);
    const types = choices.map((c) => `${mediaTypeInfo(c.offer.type).label} (${mediaDbOfferLabel(c.offer)})`).join(', ');
    const { bytes, unknown } = bytesOf(o);
    const unreadable = choices.flatMap((c) => c.replaces).length;
    return {
      text: o.title,
      detail: unknown ? t('{types} · {size} et plus', { types, size: formatSize(bytes) }) : `${types} · ${formatSize(bytes)}`,
      badges: [
        o.match.how === 'vps-id' ? t('identifiant VPS') : t('titre'),
        ...(unreadable ? [tn(unreadable, 'remplace {n} fichier illisible', 'remplace {n} fichiers illisibles')] : []),
      ],
      tone: unreadable ? 'warning' : undefined,
      action,
    };
  }

  function showSurvey(survey: Survey, at = 0): void {
    ctx.openCustom(() => buildSurvey(survey), at);
  }

  function buildSurvey(survey: Survey): Built {
    const active = survey.offers.filter((o) => choicesOf(o).length);
    const count = active.reduce((n, o) => n + choicesOf(o).length, 0);
    const quality = qualityChoice();
    const sections: Section[] = [
      { rows: noticeRows() },
      { rows: [{ text: t('Qualité : {quality}', { quality: quality.quality }), detail: t('{reason}. Seule l’image du plateau existe en 4k.', { reason: quality.reason }), tone: 'quiet' }] },
    ];
    if (active.length) sections.push(capped(tn(active.length, '{n} table reçoit des médias', '{n} tables reçoivent des médias'), active.map((o) => surveyRow(o))));
    if (survey.doubtful.length) {
      sections.push(
        capped(
          tn(survey.doubtful.length, 'À vérifier : {n} table reconnue au titre seulement', 'À vérifier : {n} tables reconnues au titre seulement'),
          survey.doubtful.map((d) => ({
            text: d.table.title,
            detail: t('Peut-être {game} : rien n’est téléchargé d’office. Fiche > Médias du jeu > Chercher les médias, pour voir les aperçus et choisir.', { game: d.label }),
            tone: 'quiet' as const,
          })),
        ),
      );
    }
    if (survey.absent.length) {
      sections.push(
        capped(
          tn(survey.absent.length, 'Pas sur VPinMediaDB : {n} table', 'Pas sur VPinMediaDB : {n} tables'),
          survey.absent.map((a) => ({ text: a.table.title, detail: a.reason, tone: 'quiet' as const })),
        ),
      );
    }
    if (survey.complete) {
      sections.push({ rows: [{ text: tn(survey.complete, '{n} table a déjà tout ce que VPinMediaDB propose.', '{n} tables ont déjà tout ce que VPinMediaDB propose.'), tone: 'quiet' }] });
    }
    const back = () => {
      forget(survey.offers);
      ctx.openSystem();
    };
    const actions: Action[] = [];
    if (count) {
      const bytes = active.reduce((n, o) => n + bytesOf(o).bytes, 0);
      const free = freeSpace(ctx.tablesDir());
      if (free !== undefined && bytes > free) {
        actions.push({
          label: t('Place insuffisante'),
          detail: t('Il faut {need}, il reste {free} sur le disque des tables.', { need: formatSize(bytes), free: formatSize(free) }),
          tone: 'error',
          run: () => undefined,
        });
      } else {
        const what = t('{media} pour {tables}', { media: tn(count, '{n} média', '{n} médias'), tables: tn(active.length, '{n} table', '{n} tables') });
        actions.push({ label: t('Télécharger et ranger'), detail: `${what} · ${totalLabel(active)}`, tone: 'ok', run: () => applySurvey(survey) });
      }
      actions.push({ label: t('Voir une table et ses aperçus…'), detail: t('Changer ce qui est téléchargé pour une table'), run: () => openSurveyTables(survey) });
    }
    actions.push({ label: count ? t('Annuler') : t('Retour'), detail: count ? t('Rien n’est téléchargé') : undefined, run: back });
    return {
      heading: count ? t('Plan de téléchargement des médias manquants') : t('Aucun média à télécharger'),
      subheading: MEDIADB_CITATION,
      lead: count
        ? t('Seuls les médias qui manquent sont téléchargés : un média déjà là n’est jamais remplacé d’ici. Rien n’est téléchargé avant « Télécharger et ranger ».')
        : t('VPinMediaDB n’a rien de plus pour les tables de cette borne.'),
      sections,
      actions,
      back,
    };
  }

  function openSurveyTables(survey: Survey, at = 0): void {
    const back = () => showSurvey(survey, 1);
    ctx.openCustom(() => {
      const offers = survey.offers;
      return {
        heading: t('Voir une table'),
        subheading: MEDIADB_CITATION,
        lead: t('Choisissez une table pour voir les aperçus de ses médias et changer ce qui est téléchargé.'),
        sections: [{ rows: offers.map((o, i) => surveyRow(o, i)) }],
        actions: [
          ...offers.map((o, i) => ({
            label: o.title,
            detail: tn(choicesOf(o).length, '{n} média', '{n} médias'),
            run: () =>
              void ctx.task(t('Aperçus…'), async () => {
                await previews(o);
                showTablePlan(o, { single: false, back: () => openSurveyTables(survey, i) });
              }),
          })),
          { label: t('Retour au plan général'), run: back },
        ],
        back,
      };
    }, at);
  }

  function applySurvey(survey: Survey): void {
    const active = survey.offers.filter((o) => choicesOf(o).length);
    void ctx.task(t('Téléchargement depuis VPinMediaDB…'), async () => {
      const trashDir = trashDirFor(ctx.layout()!.trash, 'Remplacé par les médias de VPinMediaDB'); // i18n-ignore : nom de dossier de la corbeille
      let installed = 0;
      let bytes = 0;
      let trashed = 0;
      const failed: string[] = [];
      for (const [i, o] of active.entries()) {
        const table = ctx.find(o.file);
        if (!table) continue;
        const result = await installMediaDb(table, choicesOf(o), {
          infoFile: infoFileFor(table, ctx.tablesDir()),
          trashDir,
          stagingDir: staging(),
          entry: entryOf(o).entry,
          onProgress: progressReporter((step) => t('Table {i} sur {total}, {title} : {step}', { i: i + 1, total: active.length, title: o.title, step })),
        });
        installed += result.installed.length;
        trashed += result.installed.reduce((n, x) => n + x.trashed.length, 0);
        bytes += result.installed.reduce((n, x) => n + x.size, 0);
        for (const f of result.failed) failed.push(t('{title}, {type} : {reason}', { title: o.title, type: mediaTypeInfo(f.type).label, reason: f.reason }));
      }
      forget(survey.offers);
      host.reload();
      ctx.openNotice(
        t('Médias téléchargés'),
        [
          tn(
            installed,
            '{n} média ({size}) de {source} rangé dans {tables} ; la source de chacun est notée dans le .info.',
            '{n} médias ({size}) de {source} rangés dans {tables} ; la source de chacun est notée dans le .info.',
            { size: formatSize(bytes), source: MEDIADB_CITATION, tables: tn(active.length, '{n} table', '{n} tables') },
          ),
          ...(trashed
            ? [
                tn(trashed, '{n} fichier illisible du même type, remplacé : dans la corbeille, {folder}.', '{n} fichiers illisibles du même type, remplacés : dans la corbeille, {folder}.', {
                  folder: path.basename(trashDir),
                }),
              ]
            : []),
          ...(failed.length
            ? [
                t('Non téléchargé (rien n’a été laissé) : {list}.', {
                  list: failed.length > 10 ? t('{list} ; et {n} autres', { list: joinSemi(failed.slice(0, 10)), n: failed.length - 10 }) : joinSemi(failed),
                }),
              ]
            : []),
          mediaDbNotice(),
        ],
        () => ctx.openSystem(),
      );
    });
  }

  // ---------- Ajout d'une table (plan d'installation) ----------

  /**
   * Pour le plan d'ajout : ce que VPinMediaDB a pour ces jeux (identifiants VPS), la
   * variante par défaut de chaque média (celle que retient « Chercher les médias » pour un
   * média qui manque) et leur poids. Index indisponible : `problem`, et aucun jeu.
   */
  async function forGames(ids: string[]): Promise<{ problem?: string; games: Map<string, MediaDbGameOffer> }> {
    const { db: found, problem } = await index();
    if (!found) return { problem, games: new Map() };
    const quality = qualityChoice().quality;
    const games = new Map<string, MediaDbGameOffer>();
    for (const id of new Set(ids)) {
      const entry = found.entries.get(id);
      if (entry) games.set(id, { offers: mediaDbOffers(entry, quality).map((o) => o.variants[0]!), bytes: 0, unknown: 0 });
    }
    if (!games.size) return { games };
    const sizes = await ctx.search.sizes([...games.values()].flatMap((g) => g.offers.map((o) => o.file)));
    for (const g of games.values()) {
      for (const o of g.offers) {
        const size = sizes.get(o.file.url);
        if (size === undefined) g.unknown++;
        else g.bytes += size;
      }
    }
    return { games };
  }

  /**
   * Après l'ajout, sans autre plan (celui de l'ajout les a montrés) : les médias qui
   * manquent à ces tables, depuis VPinMediaDB. Seulement les tables reconnues par leur
   * identifiant VPS ; un média déjà là n'est jamais remplacé. L'avertissement, montré
   * dans le plan, vaut lecture.
   */
  async function fillMissing(files: string[]): Promise<{ installed: number; bytes: number; tables: number; failed: string[] }> {
    const out = { installed: 0, bytes: 0, tables: 0, failed: [] as string[] };
    const { db: found, problem } = await index();
    if (!found) {
      out.failed.push(problem ?? t('index de VPinMediaDB indisponible'));
      return out;
    }
    acceptMediaDbNotice(host.dataDir);
    const vps = await ctx.search.vps();
    const tables = oneByFolder(files.map((f) => ctx.find(f)).filter((x): x is TableEntry => Boolean(x)));
    const trashDir = trashDirFor(ctx.layout()!.trash, 'Remplacé par les médias de VPinMediaDB'); // i18n-ignore : nom de dossier de la corbeille
    for (const [i, table] of tables.entries()) {
      const match = matchMediaDb(found, table, vps);
      if (match.how !== 'vps-id') continue;
      const o = prepare(table, match, 0, true);
      const choices = choicesOf(o);
      if (!choices.length) continue;
      const result = await installMediaDb(table, choices, {
        infoFile: infoFileFor(table, ctx.tablesDir()),
        trashDir,
        stagingDir: staging(),
        entry: entryOf(o).entry,
        onProgress: progressReporter((step) => t('Médias de VPinMediaDB, table {i} sur {total}, {title} : {step}', { i: i + 1, total: tables.length, title: table.title, step })),
      });
      out.tables++;
      out.installed += result.installed.length;
      out.bytes += result.installed.reduce((n, x) => n + x.size, 0);
      for (const f of result.failed) out.failed.push(t('{title}, {type} : {reason}', { title: table.title, type: mediaTypeInfo(f.type).label, reason: f.reason }));
    }
    cleanMediaDbStaging(staging());
    host.reload();
    return out;
  }

  return { openTable, openMissing, withNotice, forGames, fillMissing };
}

/** Ce que VPinMediaDB a pour un jeu, pour le plan d'ajout : un fichier par média, et le poids total. */
export interface MediaDbGameOffer {
  offers: MediaDbOffer[];
  bytes: number;
  /** Fichiers dont le poids n'a pas pu être lu. */
  unknown: number;
}

/** « Logo (image), Plateau (vidéo)… » : les médias d'un plan, avec leur variante. */
export function mediaOffersLabel(offers: MediaDbOffer[]): string {
  return offers.map((o) => `${mediaTypeInfo(o.type).label} (${mediaDbOfferLabel(o)})`).join(', ');
}

function capped(title: string, rows: Row[]): Section {
  const shown = rows.slice(0, MAX_ROWS);
  return { title, rows: shown, more: rows.length - shown.length };
}
