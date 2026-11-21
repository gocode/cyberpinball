// Menu système > Aide et infos > Nouveautés (packages/core/src/news.ts) : les grandes nouveautés de Cyber Pinball,
// choisies à la main (maquette validée le 17/11/2026).
//
// Une chronologie de lignes, la plus récente en haut : la date et la version dites une seule fois
// pour les nouveautés du même jour, chaque ligne avec son détail et, si elle en a un, un petit
// aperçu ; « Nouveau » sur celles qu'on n'avait pas encore vues. Start agrandit une nouveauté : son
// grand aperçu, son texte entier, et « Essayer », qui mène à la fonction (son « Retour » ramène ici).
//
// La pastille rouge (roue dentée, entrée du menu) dure tant qu'il reste une nouveauté pas vue, dès
// la première installation ; ouvrir l'écran les marque toutes vues, le repère « Nouveau » restant
// jusqu'à ce qu'on en sorte. L'entrée est dans Aide et infos, dont la ligne porte la
// pastille (20/11/2026 : plus de place à la racine). Mode invité :
// l'écran est fermé, comme tout le menu système (library.ts).
//
// Sans electron à l'exécution : les tests chargent ce module avec un hôte d'essai.

import * as path from 'node:path';
import {
  NEWS,
  NEWS_FILE,
  language,
  loadNewsState,
  markNewsSeen,
  newsLongDate,
  newsReactionSummary,
  newsShortDate,
  REACTION_EMOJI,
  REACTIONS,
  reactionName,
  reactionText,
  saveNewsState,
  saveOrWarn,
  t,
  tn,
  unreadNews,
  type NewsItem,
  type NewsReach,
  type NewsReactions,
  type Reaction,
} from '@cyberpinball/core';
// Types seulement : library.js charge electron, que les tests du cœur n'ont pas.
import type { Action, Built, ProvidedSystemItem, Row } from './library';

/** Le badge des fonctions en essai, comme celui du menu (menuBadgeLabel, library.ts). */
const beta = () => t('BÊTA');

export interface NewsMenuHost {
  dataDir: string;
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  /**
   * Où mène « Essayer » : `run` l'ouvre (son « Retour » appelle `back`), ou `gone` dit pourquoi pas
   * (mode invité, partage désactivé, aucune table choisie).
   */
  reach(target: NewsReach, back: () => void): { run?: () => void; gone?: string };
  /** L'état a changé (nouveautés vues) : la pastille de la roue dentée se redessine. */
  changed?(): void;
  log?(line: string): void;
  /** Les nouveautés (essais) ; sans elles, NEWS. */
  items?: readonly NewsItem[];
  /**
   * Les réactions des joueurs (les sept des messages), comptées par le service des retours
   * (feedback-service.ts) ; sans elles, la nouveauté agrandie n'a pas de « Réagir ».
   */
  reactions?: {
    of(item: string): NewsReactions;
    net(): 'idle' | 'loading' | 'ok' | 'offline';
    /** Relues à l'ouverture des Nouveautés. */
    refresh(): Promise<void> | void;
    react(item: string, kind: Reaction | null): Promise<{ ok: boolean }>;
    /** Pourquoi réagir est impossible maintenant (mode invité, pas de clé de joueur), sinon undefined. */
    closed(): string | undefined;
  };
}

export interface NewsMenu {
  /** L'entrée du menu système (Aide et infos) : pastille tant qu'il reste une nouveauté pas vue. */
  item: ProvidedSystemItem;
  /** L'écran ; `back` : son « Retour » (sans lui, le menu système). */
  open(back?: () => void): void;
  unread(): number;
}

/** L'aperçu d'une nouveauté, dans la langue de l'interface (app/renderer/nouveautes). */
export const newsPreview = (n: NewsItem): string | undefined => (!n.noPreview ?`nouveautes/${n.id}-${language() === 'en' ? 'en' : 'fr'}.webp` : undefined);

/** Le bout du chemin, pour le bouton : « Communauté › Parties instantanées » donne « Parties instantanées ». */
const lastStep = (where: string) => where.split(' › ').at(-1) ?? where;

export function createNewsMenu(host: NewsMenuHost): NewsMenu {
  const items = host.items ?? NEWS;
  const file = path.join(host.dataDir, NEWS_FILE);
  const loaded = loadNewsState(file, items);
  const state = loaded.state;
  // L'état de départ est écrit tout de suite : une nouveauté ajoutée plus tard sera nouvelle, et
  // celles de cette version garderont leur pastille jusqu'à ce qu'on les regarde.
  if (loaded.fresh) {
    saveOrWarn(file, () => saveNewsState(file, state));
    host.log?.(`Nouveautés : état de départ, ${unreadNews(state, items).length} à voir.`); // i18n-ignore : journal
  }
  /** L'écran ouvert : son « Retour », et ce qui n'était pas vu à son ouverture (le repère « Nouveau » reste jusqu'à la sortie). */
  let screen: { back: () => void; unread: ReadonlySet<string> } | undefined;

  function save(): void {
    saveOrWarn(file, () => saveNewsState(file, state));
    host.changed?.();
  }

  const listAt = (i: number) => () => host.library.openCustom(buildList, i);

  /** Sur chaque ligne de la liste, les réactions des joueurs en bref : « 👍❤️😮 23 », repéré quand j'ai réagi. */
  function listReactions(n: NewsItem): NonNullable<NonNullable<Row['news']>['reactions']> | undefined {
    const s = newsReactionSummary(host.reactions?.of(n.id));
    if (!s) return undefined;
    const label = s.mine ? tn(s.total, '{n} réaction, dont la vôtre', '{n} réactions, dont la vôtre') : tn(s.total, '{n} réaction', '{n} réactions');
    return { emojis: s.top.map((k) => REACTION_EMOJI[k]), total: s.total, mine: s.mine, label };
  }

  function buildList(): Built {
    const was = screen?.unread ?? new Set<string>();
    const rows: Row[] = items.map((n, i) => {
      const first = i === 0 || items[i - 1]!.date !== n.date;
      const unread = was.has(n.id);
      const preview = newsPreview(n);
      const reactions = listReactions(n);
      return {
        text: n.title,
        detail: n.detail,
        action: i,
        pick: true,
        news: {
          date: newsShortDate(n.date),
          version: n.version,
          first,
          last: i === items.length - 1,
          ...(preview ? { preview } : {}),
          ...(unread ? { unread: true } : {}),
          badges: [...(unread ? [{ text: t('Nouveau'), kind: 'new' as const }] : []), ...(n.beta ? [{ text: beta(), kind: 'beta' as const }] : [])],
          start: n.more.length > 1 ? t('voir en grand et lire la suite') : t('voir en grand'),
          ...(reactions ? { reactions } : {}),
        },
      };
    });
    const actions: Action[] = items.map((n, i) => ({ label: n.title, key: `news:${n.id}`, run: () => openPage(i) }));
    const back = () => leave();
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Nouveautés'),
      icon: 'sparkle',
      subheading: was.size ? tn(was.size, '{n} nouvelle depuis votre dernière visite', '{n} nouvelles depuis votre dernière visite') : t('Les grandes nouveautés de Cyber Pinball, une ligne chacune'),
      sections: [{ kind: 'news', rows }],
      actions,
      back,
      listStart: t('voir en grand'),
    };
  }

  /**
   * La nouveauté agrandie : un seul écran, dont `pageAt` dit laquelle. « ‹ Précédente » et
   * « Suivante › » le redessinent (même construction : le parcours du retour ne s'allonge pas, le
   * bouton de tête dit toujours « Nouveautés », et le curseur reste sur le bouton pressé) ; depuis la
   * liste, ou au retour d'« Essayer », il s'ouvre sur « Essayer ».
   */
  let pageAt = 0;
  const pageBuild = () => buildPage(pageAt);

  function openPage(i: number, fresh = true): void {
    pageAt = i;
    // Ouverte, le choix sur « Essayer » : après les sept réactions, quand il y en a.
    host.library.openCustom(pageBuild, fresh ? (host.reactions ? REACTIONS.length : 0) : undefined);
  }

  /**
   * « Réagir » : les sept réactions en tuiles sous le texte, chacune avec son nombre de joueurs, la
   * mienne repérée ; Start pose une réaction, ou retire la mienne. Les tuiles sont des lignes à
   * choisir (leurs actions ne se répètent pas dans la colonne), avant « Essayer » dans l'ordre des
   * flippers, comme à l'écran. Grisées avec leur raison quand réagir est impossible.
   */
  function reactionTiles(n: NewsItem, actions: Action[]): { section?: Built['sections'][number]; note?: string } {
    const r = host.reactions;
    if (!r) return {};
    const mine = r.of(n.id);
    const net = r.net();
    const closed = r.closed() ?? (net === 'offline' ? t('Réactions hors ligne : elles reviennent dès que le service répond') : undefined);
    const rows: Row[] = REACTIONS.map((kind) => {
      const on = mine.mine === kind;
      const count = mine.counts[kind] ?? 0;
      const index =
        actions.push({
          label: reactionText(kind),
          key: `news:react:${kind}`,
          ...(closed ? { tone: 'quiet' as const, detail: closed } : {}),
          run: () => {
            if (closed) return;
            // Tout de suite à l'écran, puis la réponse du service.
            const sent = r.react(n.id, on ? null : kind);
            host.changed?.();
            void sent.finally(() => host.changed?.());
          },
        }) - 1;
      return {
        text: reactionName(kind),
        emoji: REACTION_EMOJI[kind],
        badges: count ? [String(count)] : [],
        ...(on ? { current: true } : {}),
        ...(closed ? { tone: 'quiet' as const } : {}),
        action: index,
        pick: true,
      };
    });
    const total = REACTIONS.reduce((s, k) => s + (mine.counts[k] ?? 0), 0);
    const note = closed ?? (net === 'loading' && !total ? t('Lecture des réactions…') : mine.mine ? t('Votre réaction : {reaction} · Start sur elle la retire', { reaction: reactionText(mine.mine) }) : total ? tn(total, '{n} joueur a réagi', '{n} joueurs ont réagi') : t('Soyez le premier à réagir'));
    return { section: { title: t('Réagir'), kind: 'news-reactions', options: true, rows }, note };
  }

  function buildPage(i: number): Built {
    const n = items[i]!;
    const back = listAt(i);
    const here = () => openPage(i);
    const reach = host.reach(n.reach, here);
    const preview = newsPreview(n);
    const actions: Action[] = [];
    const tiles = reactionTiles(n, actions);
    actions.push(
      {
        label: t('Essayer : {where}', { where: lastStep(n.where) }),
        icon: 'play',
        key: 'news:try',
        ...(reach.gone ? { tone: 'quiet' as const, detail: reach.gone } : {}),
        run: () => reach.run?.(),
      },
      ...(i > 0 ? [{ label: t('‹ Précédente'), icon: 'chevron-left' as const, key: 'news:previous', run: () => openPage(i - 1, false) }] : []),
      ...(i < items.length - 1 ? [{ label: t('Suivante ›'), icon: 'chevron-right' as const, key: 'news:next', run: () => openPage(i + 1, false) }] : []),
      { label: t('Retour à la liste'), icon: 'back', key: 'news:list', run: back },
    );
    return {
      heading: n.title,
      icon: 'sparkle',
      subheading: [t('{date} · version {version}', { date: newsLongDate(n.date), version: n.version }), ...(n.beta ? [beta()] : [])].join(' · '),
      sections: tiles.section ? [tiles.section] : [],
      newsPage: { ...(preview ? { preview } : {}), lines: [...n.more], where: t('Où : {where}', { where: n.where }), ...(tiles.note ? { note: tiles.note } : {}) },
      actions,
      back,
      hint: t('Flippers : choisir · Start : valider · Exit : retour à la liste'),
    };
  }

  function leave(): void {
    const back = screen?.back ?? (() => host.library.openSystem());
    screen = undefined;
    back();
  }

  function open(back?: () => void): void {
    const unread = unreadNews(state, items);
    screen = { back: back ?? (() => host.library.openSystem()), unread: new Set(unread.map((n) => n.id)) };
    host.log?.(`Nouveautés : ouvertes, ${items.length} lignes, ${unread.length} à voir.`); // i18n-ignore : journal
    // Ouvrir l'écran, c'est les avoir vues : la pastille part, le repère « Nouveau » reste jusqu'à la sortie.
    if (markNewsSeen(state, unread.map((n) => n.id))) save();
    if (host.reactions) void Promise.resolve(host.reactions.refresh()).then(() => host.changed?.());
    host.library.openCustom(buildList, 0);
  }

  return {
    open,
    unread: () => unreadNews(state, items).length,
    item: {
      get detail() {
        const unread = unreadNews(state, items);
        if (unread.length) return tn(unread.length, '{n} nouvelle : {titles}', '{n} nouvelles : {titles}', { titles: unread.map((n) => n.title).join(', ') });
        const latest = items[0];
        return latest ? t('Dernière le {date} : {title}', { date: newsLongDate(latest.date), title: latest.title }) : t('Les grandes nouveautés de Cyber Pinball, une ligne chacune');
      },
      get attention() {
        return unreadNews(state, items).length > 0;
      },
      run: () => open(),
    },
  };
}
