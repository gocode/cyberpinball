// Notification pendant la partie (app/src/game-notice.ts) : une invitation d'un ami à une partie
// en direct arrive pendant que le joueur joue. Elle s'annonce par le carillon d'invitation
// (uisounds.ts) et une carte discrète posée par-dessus VPX, dans le coin du plateau en haut à
// gauche pour le joueur (le témoin d'un enregistrement tient le coin droit). La carte reste
// GAME_NOTICE_FULL_MS, puis se réduit à une pastille qui compte le temps de l'invitation
// jusqu'à ce qu'elle expire, soit annulée ou que la partie finisse. Rien à faire pour
// l'ignorer ; quitter sa partie ramène au menu, où l'invitation s'ouvre d'elle-même.

import { formatNumber, t } from './i18n';
import { LIVE_INVITE_MS, liveBehind, livePlayers, liveRanked, liveScore, type LiveGame, type LiveInvite } from './livegame';
import { DMD_FONT_SMALL, dmdText, textWidth } from './dmdfont';
import { DMD_HEIGHT, DMD_LEVEL, DMD_MARGIN, DMD_WIDTH, blankDots, drawCentered, drawText, scoreText, type DmdDots } from './livedmd';
import type { Rect, Rotation } from './model';

/** Durée de la carte entière, avant la pastille. */
export const GAME_NOTICE_FULL_MS = 12_000;

/** Taille de la carte et de la pastille vues du joueur, sur un plateau de 1080 px de petit côté. */
export const GAME_NOTICE_SIZE = { full: { width: 560, height: 172 }, compact: { width: 460, height: 64 }, margin: 28 } as const;

export interface GameNoticeView {
  /** Carte entière, ou pastille. */
  mode: 'full' | 'compact';
  /** « Bruno vous invite à jouer ». */
  title: string;
  /** Pour la pastille : « Invitation de Bruno ». */
  short: string;
  /** La table de l'invitation. */
  table: string;
  /** Ce que le joueur peut faire : quitter sa partie, ou l'ignorer. */
  hint: string;
  /** Temps restant de l'invitation, « 1:24 ». */
  left: string;
  /** Part du temps restant, de 1 à 0. */
  progress: number;
}

/** Temps restant d'une invitation, en millisecondes (0 : expirée). */
export function inviteLeftMs(invite: Pick<LiveInvite, 'receivedAt'>, now = new Date()): number {
  return Math.max(0, LIVE_INVITE_MS - (now.getTime() - Date.parse(invite.receivedAt)));
}

/** Ce que montre la notification de cette invitation, `shownAt` : son arrivée à l'écran. */
export function gameNoticeView(invite: LiveInvite, shownAt: Date, now = new Date()): GameNoticeView | undefined {
  const left = inviteLeftMs(invite, now);
  if (left <= 0) return undefined;
  const seconds = Math.ceil(left / 1000);
  return {
    mode: now.getTime() - shownAt.getTime() < GAME_NOTICE_FULL_MS ? 'full' : 'compact',
    title: t('{name} vous invite à jouer', { name: invite.host.name }),
    short: t('Invitation de {name}', { name: invite.host.name }),
    table: invite.title,
    hint: t('Quittez la partie pour le rejoindre, ou continuez : elle s’efface seule'),
    left: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    progress: Math.round((left / LIVE_INVITE_MS) * 1000) / 1000,
  };
}

/**
 * Place de la notification, en pixels de l'écran : dans le coin du plateau en haut à gauche pour
 * le joueur (ou en bas à gauche, `corner`), quel que soit le sens de l'écran. `rotation` : celle
 * de la mise en page du plateau (menuRotation), `size` : la taille vue du joueur.
 */
export function gameNoticeBounds(zone: Rect, rotation: Rotation, size: { width: number; height: number }, margin: number, corner: 'top-left' | 'bottom-left' = 'top-left'): Rect {
  const quarter = rotation === 90 || rotation === 270;
  const w = quarter ? size.height : size.width;
  const h = quarter ? size.width : size.height;
  // Coin du joueur, tourné dans le repère de l'écran : (x, y) → (-y, x) par quart de tour horaire.
  let cx = -1;
  let cy = corner === 'bottom-left' ? 1 : -1;
  for (let r = 0; r < rotation; r += 90) [cx, cy] = [-cy, cx];
  const x = cx > 0 ? zone.x + zone.width - margin - w : zone.x + margin;
  const y = cy > 0 ? zone.y + zone.height - margin - h : zone.y + margin;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

// ---------------------------------------------------------------------------
// La partie entre amis en cours (essai réel du 30/10/2026 : « on ne voit absolument pas où en sont
// les autres ») : chaque joueur avec son score et sa bille, lus en direct (livestate.ts), le
// meilleur en tête. Elle remplace l'invitation, qui ne peut pas arriver pendant une partie entre
// amis (la borne répond « occupé »).
//
// Où (second essai du même jour : la bande en haut du plateau « cache très souvent des endroits où
// on est censé voir la bille ») : jamais sur le plateau tant qu'un autre écran peut la porter.
//   1. Sur le DMD, de temps à autre (LiveBoardFlash) : le DMD que VPX ou PinMAME dessine ne
//      s'écrit pas de l'extérieur, alors Cyber Pinball pose ses propres points par-dessus, à sa
//      place, quelques secondes (liveBoardDots), comme un vrai flipper montre les scores des autres.
//   2. Sur un écran que VPX laisse libre (fronton sans .directb2s, topper), en permanence : des
//      cartes, une par joueur, en bas du fronton comme les compteurs d'un électromécanique.
//   3. Sans l'un ni l'autre : un encart au bas du plateau, coin gauche pour le joueur, sur le
//      tablier, sous la sortie des couloirs extérieurs (le couloir de lancement est à droite).

export interface LiveBoardRow {
  name: string;
  /** « 1 240 500 », ou « — » tant qu'aucun score n'est lu. */
  score: string;
  /** Le score en nombre (undefined : pas encore lu), pour le DMD. */
  points?: number;
  /** « Bille 2 sur 3 », « Partie terminée », « Chargement »… */
  detail: string;
  /** Pour l'encart et le DMD : « B2 », « Fin »… (vide : rien à dire encore). */
  short: string;
  /** Bille en cours (0 : pas encore lue, ou partie finie). */
  ball: number;
  /** Sa partie est finie (terminée, pas démarrée, quittée). */
  done: boolean;
  /** Le joueur de cette borne. */
  me: boolean;
  /** En tête. */
  lead: boolean;
}

export interface LiveBoardView {
  mode: 'board';
  title: string;
  rows: LiveBoardRow[];
}

/** La bande de la partie en cours, vue de la borne `me` ; undefined hors d'une partie lancée. */
export function liveBoardView(game: LiveGame, me: string): LiveBoardView | undefined {
  if (game.phase !== 'playing' && game.phase !== 'countdown') return undefined;
  const players = livePlayers(game).filter((p) => !['declined', 'busy', 'expired'].includes(p.state));
  const sorted = [...players].sort((a, b) => (liveScore(b) ?? -1) - (liveScore(a) ?? -1));
  const top = liveScore(sorted[0] ?? {});
  const finished = (p: (typeof players)[number]) => p.state === 'done' || p.state === 'failed' || p.state === 'left';
  const detail = (p: (typeof players)[number]) => {
    const state =
      p.state === 'done'
        ? t('Partie terminée')
        : p.state === 'failed'
          ? t('Pas démarrée')
          : p.state === 'left'
            ? t('A quitté')
            : p.ball
              ? p.balls
                ? t('Bille {ball} sur {balls}', { ball: p.ball, balls: p.balls })
                : t('Bille {ball}', { ball: p.ball })
              : liveBehind(p) && p.key !== me
                ? t('Ancienne version : pas de score en direct')
                : p.state === 'playing'
                  ? t('En partie')
                  : t('Chargement');
    return liveRanked(p, game.table.balls) ? state : t('{state} · hors classement', { state });
  };
  const short = (p: (typeof players)[number]) => (finished(p) ? (p.state === 'done' ? t('Fin') : '—') : p.ball ? t('B{ball}', { ball: p.ball }) : '');
  return {
    mode: 'board',
    title: t('Partie entre amis'),
    rows: sorted.map((p) => {
      const score = liveScore(p);
      return {
        name: p.name,
        score: score === undefined ? '—' : formatNumber(score),
        ...(score !== undefined ? { points: score } : {}),
        detail: detail(p),
        short: short(p),
        ball: finished(p) ? 0 : (p.ball ?? 0),
        done: finished(p),
        me: p.key === me,
        lead: score !== undefined && score === top && score > 0,
      };
    }),
  };
}

// --- Où la poser ---

/** Ce que la partie laisse à la bande, en pixels physiques de l'écran. */
export interface LiveBoardScreens {
  /** Zone du plateau et sens de sa mise en page (menuRotation). */
  playfield?: { zone: Rect; rotation: Rotation };
  /** Où VPX montre le DMD : la zone du DMD de la borne, ou la place de l'habillage FullDMD. */
  dmd?: Rect;
  /** Écrans que VPX laisse libres pendant la partie (rien d'autre que le fond de partie de Cyber Pinball), par ordre de préférence. */
  free: { role: 'backglass' | 'topper'; zone: Rect }[];
}

export interface LiveBoardBand {
  /** Écran qui porte la bande. */
  role: 'backglass' | 'topper' | 'playfield';
  /** Cartes côte à côte (écran libre), ou encart d'une ligne par joueur (plateau). */
  layout: 'cards' | 'insert';
  bounds: Rect;
  /** Sens de la bande : celui du plateau pour l'encart, droit ailleurs. */
  rotation: Rotation;
}

export interface LiveBoardPlacement {
  /** Les points posés de temps à autre sur le DMD, à sa place. */
  dmd?: Rect;
  /** La bande permanente. */
  band?: LiveBoardBand;
}

/**
 * Cartes d'un écran libre, à l'échelle 1 (un écran de 1 920 px de large) : une carte de 400 par
 * joueur, 20 entre elles, 26 de marge ; 260 de haut (titre, nom, score, bille). En dessous de la
 * moitié de cette taille, l'écran ne la porte pas.
 */
export const LIVE_CARDS_SIZE = { card: 400, gap: 20, padding: 26, height: 260, min: 0.5 } as const;

export function liveCardsSize(rows: number): { width: number; height: number } {
  const n = Math.max(1, rows);
  return { width: n * LIVE_CARDS_SIZE.card + (n - 1) * LIVE_CARDS_SIZE.gap + 2 * LIVE_CARDS_SIZE.padding, height: LIVE_CARDS_SIZE.height };
}

/**
 * Encart du plateau, sur un plateau de 1 080 px de petit côté : une ligne de 34 par joueur (nom,
 * score, bille ; texte de 20 px au moins), 8 de marge intérieure, 14 du bord de l'écran.
 */
export const LIVE_INSERT_SIZE = { width: 340, row: 34, padding: 8, margin: 14 } as const;

export function liveInsertSize(rows: number): { width: number; height: number } {
  return { width: LIVE_INSERT_SIZE.width, height: Math.max(1, rows) * LIVE_INSERT_SIZE.row + 2 * LIVE_INSERT_SIZE.padding };
}

/** Les cartes sur un écran libre : la plus grande échelle qui tient (au plus celle de sa largeur), en bas du fronton, au centre du topper. */
function cardsOn(screen: LiveBoardScreens['free'][number], rows: number): LiveBoardBand | undefined {
  const { zone } = screen;
  const base = liveCardsSize(rows);
  const margin = Math.round(Math.min(zone.width, zone.height) * 0.04);
  const scale = Math.min((zone.width - 2 * margin) / base.width, (zone.height - 2 * margin) / base.height, zone.width / 1920);
  if (!(scale >= LIVE_CARDS_SIZE.min)) return undefined;
  const width = Math.round(base.width * scale);
  const height = Math.round(base.height * scale);
  const x = zone.x + Math.round((zone.width - width) / 2);
  const y = screen.role === 'backglass' ? zone.y + zone.height - margin - height : zone.y + Math.round((zone.height - height) / 2);
  return { role: screen.role, layout: 'cards', bounds: { x, y, width, height }, rotation: 0 };
}

/**
 * Où va la bande de `rows` joueurs : le DMD quand la borne en a un (de temps à autre), un écran
 * libre en permanence, et le plateau seulement quand il n'y a ni l'un ni l'autre.
 */
export function liveBoardPlacement(screens: LiveBoardScreens, rows: number): LiveBoardPlacement {
  const dmd = screens.dmd && screens.dmd.width > 0 && screens.dmd.height > 0 ? screens.dmd : undefined;
  for (const screen of screens.free) {
    const band = cardsOn(screen, rows);
    if (band) return { ...(dmd ? { dmd } : {}), band };
  }
  if (dmd) return { dmd };
  if (!screens.playfield) return {};
  const { zone, rotation } = screens.playfield;
  const unit = Math.min(zone.width, zone.height) / 1080;
  const base = liveInsertSize(rows);
  const size = { width: Math.round(base.width * unit), height: Math.round(base.height * unit) };
  return { band: { role: 'playfield', layout: 'insert', bounds: gameNoticeBounds(zone, rotation, size, Math.round(LIVE_INSERT_SIZE.margin * unit), 'bottom-left'), rotation } };
}

// --- Sur le DMD ---

/**
 * Les scores sur le DMD : 6 s, à l'arrivée en partie (la liste des joueurs), puis à chaque bille
 * du joueur (le DMD compte alors le bonus), quand un autre prend la tête ou finit sa partie, et au
 * plus tard toutes les 45 s ; jamais deux fois en moins de 15 s.
 */
export const LIVE_FLASH = { firstMs: 3000, showMs: 6000, everyMs: 45_000, gapMs: 15_000 } as const;

/** Ce qui fait revenir les scores sur le DMD : ma bille, le joueur en tête, les parties finies. */
export function liveFlashKey(view: LiveBoardView): string {
  const me = view.rows.find((r) => r.me);
  const lead = view.rows.find((r) => r.lead);
  return JSON.stringify([me?.ball ?? 0, lead?.name ?? '', view.rows.filter((r) => r.done).length]);
}

/** Cadence des scores sur le DMD, depuis `start` (la partie à l'écran). */
export class LiveBoardFlash {
  private lastAt?: number;
  private until = 0;
  private key?: string;
  private pending = true;

  constructor(private readonly start: number) {}

  /** Les scores se voient-ils sur le DMD à `now` ? */
  visible(view: LiveBoardView, now: number): boolean {
    const key = liveFlashKey(view);
    if (this.key !== undefined && key !== this.key) this.pending = true;
    this.key = key;
    if (now < this.until) return true;
    if (now - this.start < LIVE_FLASH.firstMs) return false;
    const due = this.pending || now - (this.lastAt ?? this.start) >= LIVE_FLASH.everyMs;
    if (!due || (this.lastAt !== undefined && now - this.lastAt < LIVE_FLASH.gapMs)) return false;
    this.lastAt = now;
    this.until = now + LIVE_FLASH.showMs;
    this.pending = false;
    return true;
  }
}

/**
 * L'image des scores sur le DMD (128 × 32 points), police à points du DMD du menu : jusqu'à trois
 * joueurs, « PARTIE ENTRE AMIS » au-dessus ; quatre, une ligne chacun. Nom et bille à gauche,
 * score à droite ; le joueur de la borne au plein éclat, les autres un ton dessous, le score en
 * tête toujours au plein éclat.
 */
export function liveBoardDots(view: LiveBoardView): DmdDots {
  const dots = blankDots();
  const font = DMD_FONT_SMALL;
  const rows = view.rows.slice(0, 4);
  const title = rows.length < 4 ? dmdText(view.title) : '';
  const lines = rows.length + (title ? 1 : 0);
  // Lignes espacées d'au moins un point éteint, le bloc centré en hauteur.
  const gap = Math.max(1, Math.floor((DMD_HEIGHT - font.height * lines) / (lines + 1)));
  const top = Math.floor((DMD_HEIGHT - font.height * lines - gap * (lines - 1)) / 2);
  const y = (i: number) => top + i * (font.height + gap);
  if (title) drawCentered(dots, font, title, y(0), DMD_LEVEL.secondary);
  rows.forEach((row, i) => {
    const line = i + (title ? 1 : 0);
    const level = row.me ? DMD_LEVEL.accent : DMD_LEVEL.secondary;
    const score = row.points === undefined ? '-' : scoreText(row.points);
    const scoreWidth = textWidth(font, score);
    drawText(dots, font, score, DMD_WIDTH - DMD_MARGIN - scoreWidth, y(line), row.lead || row.me ? DMD_LEVEL.accent : level);
    // Le nom raccourci jusqu'à laisser deux espaces avant le score ; la bille seulement s'il reste la place.
    const room = DMD_WIDTH - 2 * DMD_MARGIN - scoreWidth - 2 * textWidth(font, ' ') - 2 * font.spacing;
    const tag = row.short ? ` ${dmdText(row.short)}` : '';
    let name = dmdText(row.name) || '?';
    while (name.length > 1 && textWidth(font, name) > room) name = name.slice(0, -1);
    drawText(dots, font, textWidth(font, name + tag) <= room ? name + tag : name, DMD_MARGIN, y(line), level);
  });
  return dots;
}
