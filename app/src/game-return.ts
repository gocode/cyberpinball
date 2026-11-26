// Retour de partie (engagement, planche validée le 21/11/2026, `homeRetour`) : après toute partie dont
// le score est connu (finie ou quittée en cours, premier score compris, relevée en direct ou à la
// fermeture), le bilan de la partie :
// - le score et le record ;
// - « +N XP » sur la barre du niveau qui vient de monter (la part gagnée en clair) et le détail du
//   barème de levels.ts ;
// - le classement : le joueur dépassé, la place gagnée et le prochain à battre ; sinon la place de la
//   partie et le prochain à battre (packages/core/src/overtakes.ts) ; sans classement publié pour la
//   version, le tableau des scores de la table sur la borne.
//
// Une carte posée sur la roue, plus un écran (demande du mainteneur, 26/11/2026 : l'écran plein « avant
// la roue » était exaspérant) : on revient directement à la roue, le bilan s'affiche par-dessus le
// plateau dans une fenêtre, et le premier geste le ferme pour de bon. Les flippers le ferment et font
// tourner la roue du même appui ; Start le ferme et relance la table de la partie ; Exit le ferme
// seulement. Un bouton encore tenu en sortant de la partie ne compte pas (GAME_RETURN_GUARD_MS). Fermée,
// la carte ne revient pas, même en revenant sur la table. « Défier » reste sur la carte de fin de
// partie posée sur VPX (carte-fin-partie.ts), « Un mot » dans la messagerie.
//
// Aucun score relevé : pas de carte. L'animation des badges et du niveau garde son moment à elle : elle
// attend le bilan de la partie (`holding`), se montre d'abord, puis la carte. Ni ligue ni missions : elles
// n'existent pas encore.
//
// Sans electron à l'exécution : les tests chargent ce module avec des services d'essai.

import {
  badgeLabel,
  countryName,
  formatNumber,
  gainText,
  gameNews,
  gameOvertake,
  gameStanding,
  levelOf,
  locale,
  t,
  tierLabel,
  tierOf,
  tn,
  type BoardLine,
  type DailyHolder,
  type GameNews,
  type GameOvertake,
  type TableEntry,
} from '@cyberpinball/core';
import type { DailyTablesService } from './daily-tables';
import type { GameReport } from './level-tracker';
import type { HubCardView, HubView } from './hub-screen';

export interface GameReturnHost {
  daily: Pick<DailyTablesService, 'input' | 'face' | 'unavailable'>;
  /** Start sur la carte : la table de la partie, même si la roue est ailleurs (partie lancée d'une notification). */
  play(table: TableEntry): void;
  /** Le tableau des scores de la table sur la borne, tout temps (table-scores.ts) : sans classement publié pour la version. */
  board?(table: TableEntry): readonly BoardLine[];
  /** La carte peut-elle s'ouvrir maintenant (la roue à l'écran, pas de partie, ni jeu local ni invité) ? */
  canOpen(): boolean;
  log(line: string): void;
  now?(): number;
}

/** Ce qu'on sait d'une partie finie, une fois ses scores publiés et ses XP comptés. */
export interface GameReturnFacts {
  table: TableEntry;
  /** Sa version exacte (boardKey) et ses billes ; absente : les classements n'en disent rien. */
  version?: { board: string; balls?: number };
  /** Début de la partie : mes scores publiés depuis sont les siens. */
  since: Date;
  report: GameReport;
}

/** La carte envoyée au rendu du plateau (frontend.js, rendue par CyberHub dans sa fenêtre). */
export interface GameReturnCardView {
  /** Unique à chaque carte, même ouverte à la même milliseconde qu'une autre : le rendu garde la carte
   *  tant que la clé ne change pas (deux cartes à la même heure montraient la première, 26/11/2026). */
  key: number;
  hub: HubView;
  hint: string;
}

/** Ce qu'une touche fait quand la carte est à l'écran. */
export type GameReturnKey = 'start' | 'exit' | 'other';

export interface GameReturn {
  /** Une partie vient de finir : son bilan arrive (le moment des badges l'attend). */
  expect(): void;
  /** Le bilan : la carte s'ouvre s'il y a un score. Rend vrai si elle s'est ouverte. */
  report(f: GameReturnFacts): boolean;
  /** Pas de bilan (erreur, partie qui ne compte pas) : l'attente prend fin. */
  release(): void;
  /** Le moment des badges et du niveau attend le bilan de la partie. */
  holding(): boolean;
  /** Une carte attend d'être vue ou fermée. */
  showing(): boolean;
  /** La carte à dessiner ; undefined : aucune. */
  view(): GameReturnCardView | undefined;
  /**
   * Une touche pendant que la carte est à l'écran : elle la ferme. Rend vrai si la touche est prise
   * (Exit, Start qui relance la table, un bouton encore tenu en sortant de la partie) ; faux : la roue
   * la reçoit aussi (les flippers la font tourner).
   */
  key(kind: GameReturnKey): boolean;
  /** Fermée sans touche (partie lancée, autre écran, mode attente) : elle ne revient pas. */
  dismiss(why: string): void;
  /** Ce qu'il y a de neuf dans ce bilan (essais). */
  news(f: GameReturnFacts): GameNews | undefined;
}

/** Un bouton encore tenu en sortant de la partie ne ferme pas la carte. */
export const GAME_RETURN_GUARD_MS = 1500;
/** Le bilan ne se fait jamais attendre plus que ça : le moment des badges passe quand même. */
const EXPECT_MAX_MS = 30_000;
/** Lignes du tableau de la table montrées au retour. */
const BOARD_LINES = 5;
/** Une ligne du tableau vient de cette partie : faite depuis son début. */
/** Numéro de la dernière carte ouverte, partagé par tous les retours de partie : la clé du rendu. */
let cards = 0;
const isMine = (l: BoardLine, f: GameReturnFacts) => l.at !== undefined && Date.parse(l.at) >= f.since.getTime() - 1000;

export function createGameReturn(host: GameReturnHost): GameReturn {
  const now = () => host.now?.() ?? Date.now();
  const thin = String.fromCharCode(0x202f);
  const nbsp = String.fromCharCode(0xa0);
  const fmt = (n: number) => formatNumber(n).split(thin).join(nbsp);
  let expected: number | undefined;
  /** La carte ouverte : sa partie, son bilan, depuis quand. */
  let shown: { f: GameReturnFacts; news: GameNews; standing?: GameOvertake; board?: readonly BoardLine[]; at: number; key: number } | undefined;

  /** La place de la partie au classement publié, quand personne n'est dépassé. */
  function standing(f: GameReturnFacts): GameOvertake | undefined {
    if (!f.version || !f.report.best || host.daily.unavailable() !== undefined) return undefined;
    try {
      return gameStanding(host.daily.input(), f.version, f.since, { now: new Date(now()) });
    } catch (error) {
      host.log(`Retour de partie : classement non lu (${(error as Error).message}).`); // i18n-ignore : journal
      return undefined;
    }
  }

  /** Le tableau de la table sur la borne : cinq lignes, celle de la partie comprise si elle est plus bas. */
  function boardOf(f: GameReturnFacts): readonly BoardLine[] | undefined {
    let lines: readonly BoardLine[] = [];
    try {
      lines = host.board?.(f.table) ?? [];
    } catch (error) {
      host.log(`Retour de partie : tableau de la table non lu (${(error as Error).message}).`); // i18n-ignore : journal
    }
    if (!lines.length) return undefined;
    const top = lines.slice(0, BOARD_LINES);
    const mine = lines.find((l) => isMine(l, f));
    return mine && !top.includes(mine) ? [...top.slice(0, BOARD_LINES - 1), mine] : top;
  }

  function news(f: GameReturnFacts): GameNews | undefined {
    let overtake;
    if (f.version && f.report.best && host.daily.unavailable() === undefined) {
      try {
        overtake = gameOvertake(host.daily.input(), f.version, f.since, { now: new Date(now()) });
      } catch (error) {
        host.log(`Retour de partie : classement non lu (${(error as Error).message}).`); // i18n-ignore : journal
      }
    }
    return gameNews({ ...(f.report.best ? { best: f.report.best } : {}), ...(f.report.previousBest ? { previousBest: f.report.previousBest } : {}), ...(overtake ? { overtake } : {}) });
  }

  /** « 3ᵉ du jour », « 3ᵉ de tout temps ». */
  const placeText = (rank: number, period: 'today' | 'all') => (period === 'today' ? t('{rank}ᵉ du jour', { rank }) : t('{rank}ᵉ de tout temps', { rank }));
  const levelChip = (h: DailyHolder) => (h.level ? { level: { text: t('Niv. {n}', { n: h.level }), tier: tierOf(h.level) } } : {});

  function hubOf(s: NonNullable<typeof shown>): HubView {
    const { f, news: n } = s;
    const r = f.report;
    const gained = Math.max(0, r.to - r.from);
    const v = levelOf(r.to);
    const o = n.overtake;
    const rival = o?.passed[0];
    const sections: HubView['sections'] = [];
    // Le score, et le record battu.
    const score = r.best ?? n.record?.score;
    if (score !== undefined)
      sections.push({
        layout: 'hero',
        cards: [
          {
            icon: 'star',
            eyebrow: n.record ? t('Record personnel battu') : t('Ton score'),
            tone: 'signal',
            title: fmt(score),
            ...(n.record ? { aside: t('+{n}', { n: fmt(n.record.score - n.record.previous) }), detail: t('Ton record d’avant : {n}', { n: fmt(n.record.previous) }) } : {}),
          },
        ],
      });
    // Le joueur dépassé, la place gagnée, le prochain à battre.
    if (o && rival) {
      const cards: HubCardView[] = [];
      const others = o.passed.length - 1;
      const gainedPlaces = o.previous !== undefined ? o.previous - o.rank : undefined;
      const detail = [gainedPlaces ? tn(gainedPlaces, '{n} place de gagnée', '{n} places de gagnées') : gainedPlaces === undefined ? t('Tu entres au classement') : undefined, others > 0 ? tn(others, 'et {n} autre joueur dépassé', 'et {n} autres joueurs dépassés') : undefined].filter(Boolean).join(' · ');
      cards.push({ avatar: host.daily.face(rival), title: t('Tu passes devant {name}', { name: rival.name }), ...levelChip(rival), aside: placeText(o.rank, o.period), ...(detail ? { detail } : {}) });
      if (o.next) cards.push({ avatar: host.daily.face(o.next), title: t('Prochain : {name}', { name: o.next.name }), ...levelChip(o.next), aside: fmt(o.next.score), detail: t('{place} · il te manque {gap}', { place: placeText(o.next.rank, o.period), gap: fmt(o.gap ?? 0) }) });
      else cards.push({ icon: 'trophy', title: t('Personne devant toi'), detail: t('Tu es premier : garde ta place') });
      const where = o.scope === 'country' && host.daily.input().country ? countryName(host.daily.input().country!, locale()) : o.scope === 'friends' ? t('Amis') : t('Monde');
      sections.push({ title: o.period === 'today' ? t('Classement du jour') : t('Classement de tout temps'), note: where, layout: 'list', cards });
    } else if (s.standing) {
      // Personne de dépassé : la place de la partie, et le prochain à battre.
      const p = s.standing;
      const cards: HubCardView[] = [{ icon: 'trophy', title: t('Ta place : {place}', { place: placeText(p.rank, p.period) }), aside: tn(p.players, '{n} joueur', '{n} joueurs') }];
      if (p.next) cards.push({ avatar: host.daily.face(p.next), title: t('Prochain : {name}', { name: p.next.name }), ...levelChip(p.next), aside: fmt(p.next.score), detail: t('{place} · il te manque {gap}', { place: placeText(p.next.rank, p.period), gap: fmt(p.gap ?? 0) }) });
      else cards.push({ icon: 'trophy', title: t('Personne devant toi'), detail: t('Tu es premier : garde ta place') });
      const where = p.scope === 'country' && host.daily.input().country ? countryName(host.daily.input().country!, locale()) : t('Monde');
      sections.push({ title: p.period === 'today' ? t('Classement du jour') : t('Classement de tout temps'), note: where, layout: 'list', cards });
    } else if (s.board) {
      // Pas de classement publié pour cette version : le tableau de la table sur la borne.
      const cards: HubCardView[] = s.board.map((l) => ({
        title: `${l.rank}. ${l.initials ?? '—'}`,
        aside: fmt(l.score),
        ...(isMine(l, f) ? { tone: 'signal' as const, eyebrow: t('Ta partie') } : {}),
      }));
      sections.push({ title: t('Tableau de la table'), layout: 'list', cards });
    }
    return {
      medallion: 'arene',
      start: t('Start'),
      title: t('PARTIE TERMINÉE'),
      facts: [f.table.title, ...(o || s.standing ? [t('Version classée')] : [])],
      band: {
        level: v.level,
        short: t('NIV.'),
        tier: v.tier,
        tierLabel: tierLabel(v.tier),
        missing: { strong: t('+{n} XP', { n: fmt(gained) }), rest: t('· {n} XP avant le niveau {next}', { n: fmt(v.need - v.into), next: v.level + 1 }) },
        progress: v.progress,
        reach: 0,
        fresh: Math.min(gained, v.into) / v.need,
        lines: r.gains.map((g) => t('{what} +{n}', { what: gainText(g, badgeLabel).text, n: g.xp })),
      },
      tabs: [],
      singleColumn: true,
      sections,
    };
  }

  function close(why: string): void {
    if (!shown) return;
    host.log(`Retour de partie : carte de ${shown.f.table.title} fermée (${why}).`); // i18n-ignore : journal
    shown = undefined;
  }

  return {
    expect() {
      expected = now();
    },
    release() {
      expected = undefined;
    },
    holding: () => expected !== undefined && now() - expected < EXPECT_MAX_MS,
    news,
    showing: () => !!shown,
    view() {
      if (!shown) return undefined;
      return { key: shown.key, hub: hubOf(shown), hint: t('Start : rejouer · Flippers : changer de table · Exit : fermer') };
    },
    key(kind) {
      if (!shown) return false;
      // Un bouton encore tenu en sortant de la partie : la carte reste, la touche ne fait rien.
      if (now() - shown.at < GAME_RETURN_GUARD_MS) return true;
      const table = shown.f.table;
      close(kind === 'start' ? 'Start, la table relancée' : kind === 'exit' ? 'Exit' : 'un geste sur la roue'); // i18n-ignore : journal
      if (kind === 'start') {
        host.play(table);
        return true;
      }
      return kind === 'exit';
    },
    dismiss: close,
    report(f) {
      expected = undefined;
      const n = news(f) ?? {};
      if (!f.report.best) {
        host.log(`Retour de partie : aucun score relevé sur ${f.table.title}, pas de carte.`); // i18n-ignore : journal
        return false;
      }
      if (!host.canOpen()) {
        host.log(`Retour de partie : ${f.table.title} à montrer, mais la roue n'est plus à l'écran.`); // i18n-ignore : journal
        return false;
      }
      const place = n.overtake ? undefined : standing(f);
      const board = n.overtake || place ? undefined : boardOf(f);
      shown = { f, news: n, ...(place ? { standing: place } : {}), ...(board ? { board } : {}), at: now(), key: ++cards };
      const what = n.overtake ? `${n.overtake.passed.length} joueur(s) dépassé(s)` : place ? `${place.rank}e sur ${place.players}` : board ? 'tableau de la table' : 'score seul'; // i18n-ignore : journal
      host.log(`Retour de partie : ${f.table.title}, ${f.report.best}${n.record ? ', record battu' : ''}, ${what}, carte sur la roue.`); // i18n-ignore : journal
      return true;
    },
  };
}
