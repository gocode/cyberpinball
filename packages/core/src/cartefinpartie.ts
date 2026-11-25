// La carte de fin de partie (app/src/carte-fin-partie.ts) : à la fin d'une partie solo suivie par
// le relevé en direct, par-dessus VPX, le score de la partie et où il place le joueur. Décidé le
// 25/11/2026 : au centre du tiers haut du plateau (comme l'attente du départ commun), à
// l'écran jusqu'à un flip ; le top 3 du pays du joueur, sa ligne en 4e s'il n'y est pas, sa place
// au monde ; flip gauche : défier un joueur, flip droit : continuer (revenir au jeu).
//
// Pur : ce que la carte montre (endCardView), sa place (endCardBounds), et la lecture des boutons
// (EndCardKeys) : la carte attend que les flippers et Start se taisent (la saisie des initiales se
// fait avec eux) et ne prend qu'un appui fait après son apparition.

import { formatNumber, t } from './i18n';
import type { Rect, Rotation } from './model';
import { flagView, playerFlag, rankingBoard, type FlagView, type RankedScore, type RankingLine, type RankingStore } from './rankings';
import type { PresenceTable } from './social';

/** Une ligne du top : place, drapeau, nom, score ; `mine` : le joueur de la borne. */
export interface EndCardLine {
  rank: string;
  flag: FlagView;
  name: string;
  score: string;
  mine?: true;
}

export interface EndCardView {
  /** « Partie finie », ou « Ton record ! » quand la partie bat son meilleur score sur cette version. */
  title: string;
  record: boolean;
  table: string;
  score: string;
  /** Le top 3 du pays (du monde sans pays choisi), et la ligne du joueur en 4e s'il n'y est pas. */
  board?: { title: string; flag?: FlagView; lines: EndCardLine[] };
  /** Sa place au monde (absente quand le top montré est déjà celui du monde). */
  world?: { label: string; value: string };
  /** Pas de classement : pourquoi (la ligne reste, grisée). */
  off?: string;
  /** Ce qui se compare (version, billes), publication des scores. */
  note?: string;
  /** Flip gauche : défier un joueur ; `off` : impossible ici, et pourquoi. */
  left: { hint: string; label: string; off?: string };
  /** Flip droit : continuer. */
  right: { hint: string; label: string };
}

export interface EndCardInput {
  table: PresenceTable;
  score: number;
  /** Classement possible : la version exacte et le joueur ; sinon, pourquoi pas. */
  ranking: { store: RankingStore; board: string; balls?: number; me: { key: string; name: string; country?: string } } | { unavailable: string };
  /** Fin de la partie (ISO). */
  at: string;
  note?: string;
  /** Le défi est impossible : pourquoi. */
  challengeOff?: string;
  locale: string;
  now?: Date;
}

/** Lignes du top montrées avant celle du joueur. */
export const END_CARD_TOP = 3;

const place = (n: number) => (n === 1 ? t('1er') : t('{n}e', { n }));

/** Ce que montre la carte : le score de cette partie compte dans le classement, publié ou non. */
export function endCardView(input: EndCardInput): EndCardView {
  const left = { hint: t('Flipper gauche'), label: t('Défier un joueur'), ...(input.challengeOff ? { off: input.challengeOff } : {}) };
  const right = { hint: t('Flipper droit'), label: t('Continuer') };
  const head = { table: input.table.title, score: formatNumber(input.score), ...(input.note ? { note: input.note } : {}), left, right };
  const r = input.ranking;
  if ('unavailable' in r) return { title: t('Partie finie'), record: false, ...head, off: r.unavailable };
  const same = (s: RankedScore) => s.board === r.board && (s.balls ?? undefined) === (r.balls ?? undefined);
  const before = r.store.scores.filter((s) => s.key === r.me.key && same(s)).map((s) => s.score);
  const record = before.length > 0 && input.score > Math.max(...before);
  // Ce score-ci, tel qu'il sera publié : la borne le classe sans attendre l'envoi.
  const mine: RankedScore = {
    key: r.me.key,
    name: r.me.name,
    ...(r.me.country ? { country: r.me.country } : {}),
    board: r.board,
    ...(r.balls ? { balls: r.balls } : {}),
    table: input.table,
    score: input.score,
    at: input.at,
    how: 'rom',
    sig: '',
  };
  const store: RankingStore = { ...r.store, scores: [...r.store.scores, mine] };
  const query = { board: r.board, ...(r.balls ? { balls: r.balls } : {}), period: 'all' as const, me: r.me.key };
  const now = input.now ?? new Date();
  const country = r.me.country;
  const top = rankingBoard(store, { ...query, scope: country ? 'country' : 'world', ...(country ? { country } : {}), limit: END_CARD_TOP + 1 }, now);
  const first = top.lines.slice(0, END_CARD_TOP);
  const myLine = top.lines.find((l) => l.mine);
  const shown = myLine && !first.includes(myLine) ? [...first, myLine] : first;
  const line = (l: RankingLine): EndCardLine => ({
    rank: l.beyond ? t('{place}+', { place: place(l.beyond) }) : place(l.rank),
    flag: playerFlag(l.country, input.locale),
    name: l.name,
    score: formatNumber(l.score),
    ...(l.mine ? { mine: true as const } : {}),
  });
  const board = { title: country ? flagView(country, input.locale).name : t('Monde'), ...(country ? { flag: flagView(country, input.locale) } : {}), lines: shown.map(line) };
  let world: EndCardView['world'];
  if (country) {
    const w = rankingBoard(store, { ...query, scope: 'world', limit: 0 }, now);
    if (w.me) {
      const value = w.me.beyond ? t('au-delà du {place}', { place: place(w.me.beyond) }) : t('{place} sur {n}', { place: place(w.me.rank), n: formatNumber(w.players) });
      world = { label: t('Monde'), value };
    }
  }
  return { title: record ? t('Ton record !') : t('Partie finie'), record, ...head, board, ...(world ? { world } : {}) };
}

/** Lignes de la carte sous le score (pour sa hauteur). */
export function endCardRows(view: EndCardView): number {
  // Raison et note peuvent tenir sur deux lignes : deux rangs chacune. La raison du défi grisé,
  // si elle diffère de celle déjà affichée, prend une ligne sous le flip gauche.
  const leftOff = view.left.off && view.left.off !== view.off ? 1 : 0;
  return (view.board ? 1 + view.board.lines.length : 0) + (view.world ? 1 : 0) + (view.off ? 2 : 0) + (view.note ? 2 : 0) + leftOff;
}

/** Taille de la carte pour un plateau de 1080 de large : en-tête, lignes, pied des flips. */
export const END_CARD_SIZE = { width: 640, head: 196, row: 50, foot: 92 } as const;

export function endCardSize(rows: number): { width: number; height: number } {
  return { width: END_CARD_SIZE.width, height: END_CARD_SIZE.head + rows * END_CARD_SIZE.row + END_CARD_SIZE.foot };
}

/** Place de la carte, en pixels de l'écran : centrée en largeur, dans le tiers haut du plateau vu du joueur. */
export function endCardBounds(zone: Rect, rotation: Rotation, rows: number): Rect {
  const unit = Math.min(zone.width, zone.height) / 1080;
  const base = endCardSize(rows);
  const quarter = rotation === 90 || rotation === 270;
  const viewW = quarter ? zone.height : zone.width;
  const viewH = quarter ? zone.width : zone.height;
  const w = Math.min(Math.round(base.width * unit), viewW);
  const h = Math.min(Math.round(base.height * unit), viewH);
  const top = Math.round(Math.max(0, viewH / 3 - h / 2));
  const left = Math.round((viewW - w) / 2);
  // Du repère du joueur à celui de l'écran, par quart de tour horaire.
  let x = left, y = top, bw = w, bh = h, vw = viewW, vh = viewH;
  for (let q = 0; q < rotation; q += 90) {
    [x, y] = [vh - y - bh, x];
    [bw, bh] = [bh, bw];
    [vw, vh] = [vh, vw];
  }
  return { x: zone.x + x, y: zone.y + y, width: bw, height: bh };
}

/**
 * Silence des flippers et de Start avant que la carte paraisse : la saisie des initiales (tableau
 * d'honneur de la ROM) se fait avec eux, après la fin de partie ; la carte ne doit pas la gêner ni
 * prendre ses appuis.
 */
export const END_CARD_QUIET_MS = 5000;
/** Après l'apparition, un appui ne compte qu'au-delà de ce délai (le joueur a vu la carte). */
export const END_CARD_ARM_MS = 600;

export interface EndCardButtons {
  left: boolean;
  right: boolean;
  start: boolean;
}

export type EndCardEvent = 'show' | 'left' | 'right';

/**
 * Les boutons, relus à intervalle régulier : « show » quand ils se sont tus assez longtemps, puis
 * « left » ou « right » au premier appui neuf (enfoncé après l'apparition et le délai d'armement).
 */
export class EndCardKeys {
  private phase: 'waiting' | 'shown' | 'done' = 'waiting';
  private lastActive: number;
  private shownAt = 0;
  private prev: EndCardButtons = { left: false, right: false, start: false };

  constructor(start: number) {
    this.lastActive = start;
  }

  get state(): 'waiting' | 'shown' | 'done' {
    return this.phase;
  }

  feed(now: number, held: EndCardButtons): EndCardEvent | undefined {
    const prev = this.prev;
    this.prev = { ...held };
    if (this.phase === 'done') return undefined;
    if (this.phase === 'waiting') {
      if (held.left || held.right || held.start) this.lastActive = now;
      if (now - this.lastActive < END_CARD_QUIET_MS) return undefined;
      this.phase = 'shown';
      this.shownAt = now;
      return 'show';
    }
    if (now - this.shownAt < END_CARD_ARM_MS) return undefined;
    for (const side of ['left', 'right'] as const) {
      if (held[side] && !prev[side]) {
        this.phase = 'done';
        return side;
      }
    }
    return undefined;
  }

  /** La carte s'en va sans appui (nouvelle partie, VPX quitté). */
  close(): void {
    this.phase = 'done';
  }
}
