// Arène (décidée le 21/11/2026, planche « Engagement », version 6) : le médaillon de la roue qui
// rassemble ce qui se joue contre les autres (parties instantanées, classements, progression), à
// côté de la Communauté (les autres joueurs). Ce module calcule, sans réseau ni fichier, ce que
// montrent son affiche et son écran :
// - la bande « Votre niveau » : palier, barre, et en hachures ce qu'une partie peut encore rapporter
//   aujourd'hui, les XP manquants, le prochain palier, le badge le plus proche ;
// - les rivaux : sur chacune de mes tables classées, le joueur juste devant moi et l'écart ;
// - mes records publiés ;
// - l'action du moment : la plus pressante parmi les données qui existent ;
// - les pages du tableau à points de l'affiche (police du DMD), la plus pressante d'abord ;
// - le barème des XP de ce qui se joue (levels.ts), dit sur chaque action.
//
// Règle de la planche : seulement des données réelles. Ce qui n'existe pas encore (ligues, défis,
// missions, rendez-vous, série) n'a ni page ni section ; une page sans donnée n'apparaît pas.

import { badgeLabel, nearestBadges, type BadgeFacts } from './badges';
import { formatNumber, t, tn } from './i18n';
import { DAILY_PLAY_CAP, dayKey, levelOf, tierLabel, tierOf, XP, type LevelState, type TierId } from './levels';
import { isHidden, type RankedScore, type RankingStore } from './rankings';
import type { EarnedBadge, PresenceTable } from './social';
import type { IconName } from './icons';

// ---------------------------------------------------------------------------
// Le niveau

/** Minutes de jeu comptées dans ce qu'une partie « peut rapporter » : une partie ordinaire. */
export const ARENA_GAME_MINUTES = 10;

/**
 * Ce qu'une partie peut encore rapporter aujourd'hui : menée au bout, ses minutes, un record
 * personnel battu, et la première du jour si elle n'est pas encore jouée ; jamais plus que ce que
 * le plafond du jour laisse.
 */
export function gameReach(state: Pick<LevelState, 'days'>, now: Date): number {
  const today = state.days[dayKey(now)];
  const wanted = XP.game + ARENA_GAME_MINUTES * XP.minute + XP.personalBest + (today?.games ? 0 : XP.firstOfDay);
  return Math.max(0, Math.min(wanted, DAILY_PLAY_CAP - (today?.xp ?? 0)));
}

export interface ArenaLevelBand {
  level: number;
  tier: TierId;
  tierLabel: string;
  /** XP déjà faits dans le niveau, XP du niveau, XP qu'il manque. */
  into: number;
  need: number;
  missing: number;
  /** Part de la barre acquise, et part qu'une partie peut encore ajouter (hachures), de 0 à 1. */
  progress: number;
  reach: number;
  reachShare: number;
  /** Le prochain palier (tous les dix niveaux) ; absent au dernier. */
  nextTier?: { level: number; label: string };
  /** Le badge le plus proche (pas encore reçu, déjà entamé). */
  badge?: { label: string; value: number; target: number };
  /** Combien de parties, à ce compte, pour le niveau suivant (1 : une partie peut suffire). */
  games: number;
}

export function arenaLevelBand(state: Pick<LevelState, 'xp' | 'days'>, held: readonly EarnedBadge[], facts: BadgeFacts, now: Date): ArenaLevelBand {
  const v = levelOf(state.xp);
  const reach = gameReach(state, now);
  const missing = v.need - v.into;
  const next = (Math.floor(v.level / 10) + 1) * 10;
  const nextTier = tierOf(next) !== v.tier ? { level: next, label: tierLabel(tierOf(next)) } : undefined;
  const near = nearestBadges(held, facts, 1)[0];
  // Une partie ordinaire, sans la première du jour : ce qu'on gagne d'habitude, pour compter les parties.
  const usual = XP.game + ARENA_GAME_MINUTES * XP.minute;
  return {
    level: v.level,
    tier: v.tier,
    tierLabel: tierLabel(v.tier),
    into: v.into,
    need: v.need,
    missing,
    progress: v.progress,
    reach,
    reachShare: Math.min(1 - v.progress, reach / v.need),
    ...(nextTier ? { nextTier } : {}),
    ...(near ? { badge: { label: near.badge.label, value: near.value, target: near.badge.target } } : {}),
    games: missing <= reach ? 1 : 1 + Math.ceil((missing - reach) / usual),
  };
}

/**
 * Ce que dit la bande sous sa barre : ce qu'il faut encore (une partie, deux ou trois ; au-delà, ce
 * qu'une partie peut rapporter aujourd'hui, plutôt qu'un compte qui décourage), le prochain palier,
 * le badge le plus proche.
 */
export function levelBandLines(b: ArenaLevelBand): string[] {
  const out = [
    b.games <= 1
      ? t('Une partie peut suffire')
      : b.games <= 3
        ? t('Environ {n} parties', { n: b.games })
        : b.reach > 0
          ? t('Une partie peut rapporter jusqu’à {n} XP aujourd’hui', { n: b.reach })
          : t('Plafond du jour atteint : les XP de jeu reprennent demain'),
  ];
  if (b.nextTier) out.push(t('Palier {tier} au niveau {level}', { tier: b.nextTier.label, level: b.nextTier.level }));
  if (b.badge) out.push(t('Badge le plus proche : {badge} · {value} / {target}', { badge: b.badge.label, value: formatNumber(b.badge.value), target: formatNumber(b.badge.target) }));
  return out;
}

// ---------------------------------------------------------------------------
// Le barème de ce qui se joue

export interface ArenaXpRule {
  icon: IconName;
  text: string;
  xp: number;
  detail?: string;
}

/** Ce que rapporte chaque action de l'Arène, d'après le barème de levels.ts (XP). */
export function arenaXpRules(): ArenaXpRule[] {
  return [
    { icon: 'sun', text: t('Première partie du jour'), xp: XP.firstOfDay },
    { icon: 'flipper', text: t('Partie menée au bout'), xp: XP.game, detail: t('+{n} par minute de jeu', { n: XP.minute }) },
    { icon: 'upgrade', text: t('Record personnel battu'), xp: XP.personalBest },
    { icon: 'table-add', text: t('Nouvelle table'), xp: XP.newTable },
    { icon: 'list', text: t('Au tableau d’honneur'), xp: XP.honor },
    { icon: 'star', text: t('Meilleur score de la table'), xp: XP.champion },
    { icon: 'friends', text: t('Partie en ligne menée au bout'), xp: XP.live },
    { icon: 'trophy', text: t('Victoire en ligne'), xp: XP.liveWin },
  ];
}

// ---------------------------------------------------------------------------
// Rivaux et records (classements publiés, rankings.ts)

export interface ArenaRival {
  /** Version de la table classée. */
  board: string;
  table: PresenceTable;
  /** Mon meilleur score sur cette version, et ma place parmi les meilleurs scores de chacun. */
  mine: { score: number; at: string; rank: number };
  /** Le joueur juste devant moi. */
  rival: { key: string; name: string; score: number; at: string; country?: string; xp?: number };
  gap: number;
  /** Son score est arrivé après le mien : il vient de me passer devant. */
  passed: boolean;
  /** Joueurs classés sur cette version. */
  players: number;
}

/** Le meilleur score de chaque joueur sur chaque version de table, masqués exclus. */
function bestByBoard(store: RankingStore): Map<string, Map<string, RankedScore>> {
  const out = new Map<string, Map<string, RankedScore>>();
  for (const s of store.scores) {
    if (isHidden(store, s)) continue;
    let board = out.get(s.board);
    if (!board) out.set(s.board, (board = new Map()));
    const had = board.get(s.key);
    if (!had || s.score > had.score || (s.score === had.score && Date.parse(s.at) < Date.parse(had.at))) board.set(s.key, s);
  }
  return out;
}

/**
 * Mes rivaux : sur chaque table où j'ai publié un score et où quelqu'un est devant moi, le joueur
 * juste devant et l'écart. Le plus pressant d'abord : celui qui vient de me passer devant, puis le
 * plus petit écart (rapporté à son score).
 */
export function arenaRivals(store: RankingStore, me: string, max = 3): ArenaRival[] {
  const out: ArenaRival[] = [];
  for (const [board, players] of bestByBoard(store)) {
    const mine = players.get(me);
    if (!mine) continue;
    const ranked = [...players.values()].sort((a, b) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at));
    const rank = ranked.indexOf(mine) + 1;
    if (rank <= 1) continue;
    const ahead = ranked[rank - 2]!;
    out.push({
      board,
      table: mine.table,
      mine: { score: mine.score, at: mine.at, rank },
      rival: { key: ahead.key, name: ahead.name, score: ahead.score, at: ahead.at, ...(ahead.country ? { country: ahead.country } : {}), ...(ahead.xp !== undefined ? { xp: ahead.xp } : {}) },
      gap: ahead.score - mine.score,
      passed: Date.parse(ahead.at) > Date.parse(mine.at),
      players: ranked.length,
    });
  }
  const share = (r: ArenaRival) => r.gap / Math.max(1, r.rival.score);
  return out.sort((a, b) => Number(b.passed) - Number(a.passed) || (b.passed && a.passed ? Date.parse(b.rival.at) - Date.parse(a.rival.at) : 0) || share(a) - share(b)).slice(0, max);
}

export interface ArenaRecord {
  table: PresenceTable;
  score: number;
  at: string;
  rank: number;
  players: number;
}

/** Mes records publiés : mon meilleur score sur chaque version, ma place ; les plus récents d'abord. */
export function arenaRecords(store: RankingStore, me: string, max = 3): ArenaRecord[] {
  const out: ArenaRecord[] = [];
  for (const players of bestByBoard(store).values()) {
    const mine = players.get(me);
    if (!mine) continue;
    const rank = 1 + [...players.values()].filter((s) => s.score > mine.score).length;
    out.push({ table: mine.table, score: mine.score, at: mine.at, rank, players: players.size });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, max);
}

// ---------------------------------------------------------------------------
// L'action du moment

/** Une partie instantanée ouverte sur une de mes tables (instant-menu.ts), telle que l'Arène la montre. */
export interface ArenaOpenGame {
  id: string;
  title: string;
  host: { key: string; name: string };
  seats: { key: string; name: string }[];
  max: number;
  /** Même version chez moi : elle se rejoint. */
  joinable: boolean;
}

/** Ma partie instantanée en cours (hôte ou joueur), en attente de joueurs. */
export interface ArenaMyGame {
  title: string;
  seated: number;
  max: number;
}

export type ArenaMoment =
  | { kind: 'my-game'; game: ArenaMyGame }
  | { kind: 'open-game'; game: ArenaOpenGame }
  | { kind: 'rival'; rival: ArenaRival }
  | { kind: 'level'; band: ArenaLevelBand }
  | { kind: 'first-of-day'; xp: number };

/** Une place prise il y a moins d'un jour reste pressante : au-delà, c'est un rival comme un autre. */
const PASSED_FRESH_MS = 24 * 3600_000;

/**
 * L'action la plus pressante parmi les données qui existent : ma partie qui attend des joueurs, une
 * place qu'on vient de me prendre (en tête de la planche validée, la partie ouverte dessous), une
 * partie ouverte qui se rejoint, un niveau à une partie, la première partie du jour, le rival le plus
 * proche ; rien sinon (la section n'apparaît pas).
 */
export function arenaMoment(d: { mine?: ArenaMyGame; open: readonly ArenaOpenGame[]; rivals: readonly ArenaRival[]; band?: ArenaLevelBand; playedToday: boolean; now: Date }): ArenaMoment | undefined {
  if (d.mine) return { kind: 'my-game', game: d.mine };
  const passed = d.rivals.find((r) => r.passed && d.now.getTime() - Date.parse(r.rival.at) < PASSED_FRESH_MS);
  if (passed) return { kind: 'rival', rival: passed };
  const open = d.open.find((g) => g.joinable);
  if (open) return { kind: 'open-game', game: open };
  if (d.band && d.band.games <= 1 && d.band.reach > 0) return { kind: 'level', band: d.band };
  if (!d.playedToday) return { kind: 'first-of-day', xp: XP.firstOfDay };
  if (d.rivals[0]) return { kind: 'rival', rival: d.rivals[0] };
  return undefined;
}

// ---------------------------------------------------------------------------
// Le tableau à points de l'affiche

export interface ArenaBoardCell {
  text: string;
  align?: 'left' | 'center' | 'right';
}

export interface ArenaBoardLine {
  cells: ArenaBoardCell[];
  /** Ligne éteinte à moitié (l'intitulé, ma ligne sous celle du rival). */
  dim?: boolean;
}

export interface ArenaBoardPage {
  id: string;
  lines: ArenaBoardLine[];
  /** La phrase sous le tableau, tant que la page est montrée. */
  foot: string;
}

/** Un score à la façon d'un DMD : des points entre les milliers (« 9.450.000 »). */
export const dmdNumber = (n: number): string => Math.max(0, Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Une place courte : « 1ER », « 3E » (le DMD n'a pas d'exposant). */
const dmdPlace = (n: number) => (n === 1 ? t('1er') : t('{n}e', { n }));

const centered = (text: string, dim?: boolean): ArenaBoardLine => ({ cells: [{ text, align: 'center' }], ...(dim ? { dim } : {}) });
const pair = (left: string, right: string, dim?: boolean): ArenaBoardLine => ({ cells: [{ text: left }, { text: right, align: 'right' }], ...(dim ? { dim } : {}) });

export interface ArenaBoardInput {
  open: readonly ArenaOpenGame[];
  mine?: ArenaMyGame;
  rivals: readonly ArenaRival[];
  records: readonly ArenaRecord[];
  standing?: { world?: { rank: number; players: number }; country?: { rank: number; players: number; name: string } };
  /** « il y a 20 min » : le temps écoulé depuis une date (socialAgo). */
  ago(iso: string): string;
  now: Date;
}

/**
 * Les pages du tableau, la plus pressante d'abord (le même ordre que l'action du moment, arenaMoment) :
 * ma partie qui attend, une place qu'on vient de me prendre, une partie ouverte à rejoindre, le rival le
 * plus proche (« à reprendre »), ma place au classement des joueurs, mes records. Une page n'existe que
 * si sa donnée existe.
 */
export function arenaBoardPages(d: ArenaBoardInput): ArenaBoardPage[] {
  const pages: ArenaBoardPage[] = [];
  const rival = d.rivals[0];
  const rivalPage = (): ArenaBoardPage | undefined =>
    rival && {
      id: 'rival',
      lines: [
        centered(rival.passed ? t('Votre place est prise') : t('À battre'), true),
        centered(rival.table.title),
        pair(`${rival.mine.rank - 1} ${rival.rival.name}`, dmdNumber(rival.rival.score)),
        pair(`${rival.mine.rank} ${t('Vous')}`, dmdNumber(rival.mine.score), true),
        centered(t('À reprendre : {n}', { n: dmdNumber(rival.gap) })),
      ],
      foot: rival.passed ? t('{name} vous a dépassé {ago}', { name: rival.rival.name, ago: d.ago(rival.rival.at) }) : t('{name} est juste devant vous', { name: rival.rival.name }),
    };
  const freshPassed = Boolean(rival?.passed && d.now.getTime() - Date.parse(rival.rival.at) < PASSED_FRESH_MS);
  if (d.mine)
    pages.push({
      id: 'my-game',
      lines: [centered(t('Votre partie attend'), true), centered(d.mine.title), centered(t('{n} sur {max} joueurs', { n: d.mine.seated, max: d.mine.max })), centered(t('Départ dès qu’elle est complète'), true)],
      foot: t('Votre partie instantanée part dès qu’elle est complète'),
    });
  if (freshPassed) pages.push(rivalPage()!);
  const open = d.open.find((g) => g.joinable) ?? d.open[0];
  if (open && !d.mine)
    pages.push({
      id: 'open-game',
      lines: [centered(t('Partie ouverte'), true), centered(open.title), centered(t('Avec {name}', { name: open.host.name })), centered(tn(open.max - open.seats.length, '{n} place libre', '{n} places libres'))],
      foot: d.open.length > 1 ? tn(d.open.length, '{n} partie ouverte sur vos tables', '{n} parties ouvertes sur vos tables') : t('{name} attend des joueurs', { name: open.host.name }),
    });
  if (rival && !freshPassed) pages.push(rivalPage()!);
  const st = d.standing;
  if (st?.world || st?.country) {
    const lines: ArenaBoardLine[] = [centered(t('Classement des joueurs'), true)];
    if (st.world) lines.push(pair(t('Monde'), `${dmdPlace(st.world.rank)} / ${dmdNumber(st.world.players)}`));
    if (st.country) lines.push(pair(st.country.name, `${dmdPlace(st.country.rank)} / ${dmdNumber(st.country.players)}`));
    pages.push({ id: 'standing', lines, foot: t('Votre place selon vos XP, de tout temps') });
  }
  if (d.records.length)
    pages.push({
      id: 'records',
      lines: [centered(t('Vos records'), true), ...d.records.slice(0, 3).map((r) => pair(r.table.title, dmdNumber(r.score)))],
      foot: tn(d.records.length, 'Votre dernier record publié', 'Vos derniers records publiés'),
    });
  return pages;
}

/** Une page tourne toutes les six secondes (planche du 21/11/2026). */
export const ARENA_PAGE_MS = 6000;

/** Le badge le plus proche en une ligne (puces de l'affiche). */
export function nearestBadgeText(held: readonly EarnedBadge[], facts: BadgeFacts): string | undefined {
  const n = nearestBadges(held, facts, 1)[0];
  return n ? t('{badge} · {value} / {target}', { badge: badgeLabel(n.badge.id), value: formatNumber(n.value), target: formatNumber(n.badge.target) }) : undefined;
}
