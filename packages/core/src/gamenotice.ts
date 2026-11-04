// Notification pendant la partie (app/src/game-notice.ts) : une invitation d'un ami à une partie
// en direct arrive pendant que le joueur joue. Elle s'annonce par le carillon d'invitation
// (uisounds.ts) et une carte discrète posée par-dessus VPX, dans le coin du plateau en haut à
// gauche pour le joueur (le témoin d'un enregistrement tient le coin droit). La carte reste
// GAME_NOTICE_FULL_MS, puis se réduit à une pastille qui compte le temps de l'invitation
// jusqu'à ce qu'elle expire, soit annulée ou que la partie finisse. Rien à faire pour
// l'ignorer ; quitter sa partie ramène au menu, où l'invitation s'ouvre d'elle-même.

import { formatNumber, t } from './i18n';
import { LIVE_INVITE_MS, liveNoLiveState, livePlayers, liveRanked, liveScore, type LiveGame, type LiveInvite } from './livegame';
import { DMD_FONT_SMALL, dmdText, textWidth } from './dmdfont';
import { DMD_HEIGHT, DMD_LEVEL, DMD_MARGIN, DMD_WIDTH, blankDots, drawCentered, drawText, scoreText, type DmdDots } from './livedmd';
import type { Rect, Rotation } from './model';
import { TASKBAR_CLASSES, type StackedWindow } from './screencover';

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
 * le joueur (en bas à gauche, au milieu du bord gauche, ou au milieu du haut : `corner`), quel que soit le sens de
 * l'écran. `rotation` : celle de la mise en page du plateau (menuRotation), `size` : la taille vue
 * du joueur ; `below` : la place d'une autre carte déjà dans ce coin, qu'elle laisse au-dessus d'elle
 * (vers le bas du joueur).
 */
export function gameNoticeBounds(zone: Rect, rotation: Rotation, size: { width: number; height: number }, margin: number, corner: 'top-left' | 'bottom-left' | 'middle-left' | 'top-center' = 'top-left', below = 0): Rect {
  const quarter = rotation === 90 || rotation === 270;
  const w = quarter ? size.height : size.width;
  const h = quarter ? size.width : size.height;
  // Coin du joueur, tourné dans le repère de l'écran : (x, y) → (-y, x) par quart de tour horaire ; 0 : centré.
  let cx = corner === 'top-center' ? 0 : -1;
  let cy = corner === 'bottom-left' ? 1 : corner === 'middle-left' ? 0 : -1;
  for (let r = 0; r < rotation; r += 90) [cx, cy] = [-cy, cx];
  const along = (c: number, start: number, length: number, size: number) => (c > 0 ? start + length - margin - size : c < 0 ? start + margin : start + (length - size) / 2);
  let x = along(cx, zone.x, zone.width, w);
  let y = along(cy, zone.y, zone.height, h);
  // Le bas du joueur, dans le repère de l'écran (même rotation que le coin).
  let dx = 0;
  let dy = 1;
  for (let r = 0; r < rotation; r += 90) [dx, dy] = [-dy, dx];
  x += dx * below;
  y += dy * below;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

// ---------------------------------------------------------------------------
// Une nouvelle de la partie entre amis pendant la partie d'une autre table (essai réel du
// 31/10/2026 : on finit plus tôt que les autres, on joue autre chose ; un ami accepte pendant
// qu'on joue en attendant les réponses) : la notification d'une ligne du menu des tables
// (notices.ts, NoticeRule.live), posée par-dessus VPX dans le même coin que l'invitation, sous
// elle si les deux se montrent. La file des notifications décide quand ; la fenêtre suit.

/** Taille vue du joueur, sur un plateau de 1 080 px de petit côté ; `gap` : sous une invitation. */
export const GAME_NOTICE_LINE = { width: 720, height: 76, gap: 14 } as const;

// ---------------------------------------------------------------------------
// La partie entre amis en cours (essai réel du 30/10/2026 : « on ne voit absolument pas où en sont
// les autres ») : chaque joueur avec son score et sa bille, lus en direct (livestate.ts), le
// meilleur en tête. Elle remplace l'invitation, qui ne peut pas arriver pendant une partie entre
// amis (la borne répond « occupé »).
//
// Où (second essai du même jour : la bande en haut du plateau « cache très souvent des endroits où
// on est censé voir la bille ») : jamais en haut du plateau, et toujours quelque part de visible.
//   1. La bande permanente, une carte par joueur : sur le fronton, même quand la table s'en sert
//      (B2S, PuP-Pack) — c'est le cas courant, et la bande passe devant, discrètement, en bas, comme
//      les compteurs d'un électromécanique (essai du 04/11/2026 : en bas du plateau alors que le
//      PinCab a un fronton, « pas ce qui avait été dit ») ; sans fronton, au centre du topper ; sans
//      l'un ni l'autre, en dernier recours, un encart au bas du plateau, coin gauche pour le joueur,
//      sur le tablier, sous la sortie des couloirs extérieurs.
//   2. En plus, et réglé à part (« Scores sur le DMD », activé par défaut) : sur le DMD, quand il
//      montre l'écran de score de la table (dmdscore.ts, lu par l'inspector de VPX), jamais pendant
//      une animation ni la saisie des initiales (essai du 31/10/2026 : « par moment c'est gênant
//      pendant le jeu ») : le DMD que VPX ou PinMAME dessine ne s'écrit pas de l'extérieur, alors
//      Cyber Pinball pose ses propres points par-dessus, à sa place, quelques secondes
//      (liveBoardDots), comme un vrai flipper montre les scores des autres.
// Le joueur peut aussi choisir la place de la bande (Menu système > Amis > « Scores des amis pendant
// la partie », LiveScoresSettings) : un choix que la borne ne permet pas revient à l'automatique, et
// le journal le dit.

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
              : liveNoLiveState(p) && p.key !== me
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
  /** Le DMD de la table se lit (inspector de VPX) : les scores s'y posent quand il montre l'écran de score. */
  dmdReadable?: boolean;
  /** Écrans que VPX laisse libres pendant la partie (rien d'autre que le fond de partie de Cyber Pinball) : pour le journal. */
  free: { role: 'backglass' | 'topper'; zone: Rect }[];
  /** Zones du fronton et du topper de la borne, libres ou pris par la table : la bande y passe devant. */
  zones?: { backglass?: Rect; topper?: Rect };
}

/** Où le joueur veut la bande des scores des amis (Menu système > Amis > « Scores des amis pendant la partie »). */
export type LiveScoresPlace = 'auto' | 'backglass' | 'topper' | 'playfield-bottom' | 'playfield-side';

export const LIVE_SCORES_PLACES: readonly LiveScoresPlace[] = ['auto', 'backglass', 'topper', 'playfield-bottom', 'playfield-side'];

/** Les deux réglages : la place de la bande, et les scores sur le DMD (à part, activés par défaut). */
export interface LiveScoresSettings {
  place: LiveScoresPlace;
  dmd: boolean;
}

export const LIVE_SCORES_DEFAULT: LiveScoresSettings = { place: 'auto', dmd: true };

export interface LiveBoardBand {
  /** Écran qui porte la bande. */
  role: 'backglass' | 'topper' | 'playfield';
  /** Cartes côte à côte (fronton, topper), ou encart d'une ligne par joueur (plateau). */
  layout: 'cards' | 'insert';
  bounds: Rect;
  /** Sens de la bande : celui du plateau pour l'encart, droit ailleurs. */
  rotation: Rotation;
}

export interface LiveBoardPlacement {
  /** Les points posés sur le DMD, à sa place, quand il montre l'écran de score. */
  dmd?: Rect;
  /** La bande permanente. */
  band?: LiveBoardBand;
  /** Le choix du joueur n'a pas pu être suivi : pourquoi (journal) ; la place est alors l'automatique. */
  fallback?: string;
  /** Pourquoi cette place, pour le journal : « fronton libre », « ni fronton ni topper libres : bas du plateau »… */
  why?: string;
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

/** Sur le fronton, la bande est discrète : au plus un cinquième de sa hauteur (son image, B2S ou PuP, reste à voir), sauf si elle deviendrait illisible. */
export const LIVE_CARDS_BACKGLASS_SHARE = 0.2;

/** Les cartes sur un écran : la plus grande échelle qui tient (au plus celle de sa largeur), en bas du fronton, au centre du topper. */
function cardsOn(screen: LiveBoardScreens['free'][number], rows: number): LiveBoardBand | undefined {
  const { zone } = screen;
  const base = liveCardsSize(rows);
  const margin = Math.round(Math.min(zone.width, zone.height) * 0.04);
  const fit = Math.min((zone.width - 2 * margin) / base.width, (zone.height - 2 * margin) / base.height, zone.width / 1920);
  if (!(fit >= LIVE_CARDS_SIZE.min)) return undefined;
  // Discrète sur le fronton, sans jamais descendre sous la taille lisible : un fronton peu haut la
  // rejetait sinon vers le plateau (banc du 04/11/2026, fronton de 516 px).
  const discreet = screen.role === 'backglass' ? Math.max(LIVE_CARDS_SIZE.min, (zone.height * LIVE_CARDS_BACKGLASS_SHARE) / base.height) : Infinity;
  const scale = Math.min(fit, discreet);
  const width = Math.round(base.width * scale);
  const height = Math.round(base.height * scale);
  const x = zone.x + Math.round((zone.width - width) / 2);
  const y = screen.role === 'backglass' ? zone.y + zone.height - margin - height : zone.y + Math.round((zone.height - height) / 2);
  return { role: screen.role, layout: 'cards', bounds: { x, y, width, height }, rotation: 0 };
}

/** L'encart du plateau : au bas, coin gauche du joueur, ou au milieu de son bord gauche. */
function insertOn(playfield: NonNullable<LiveBoardScreens['playfield']>, rows: number, corner: 'bottom-left' | 'middle-left'): LiveBoardBand {
  const { zone, rotation } = playfield;
  const unit = Math.min(zone.width, zone.height) / 1080;
  const base = liveInsertSize(rows);
  const size = { width: Math.round(base.width * unit), height: Math.round(base.height * unit) };
  return { role: 'playfield', layout: 'insert', bounds: gameNoticeBounds(zone, rotation, size, Math.round(LIVE_INSERT_SIZE.margin * unit), corner), rotation };
}

/**
 * Où va la bande de `rows` joueurs. Automatique : le fronton, qu'il soit libre ou pris par la table
 * (B2S, PuP-Pack : la bande passe devant) ; sinon le topper, de même ; sinon, en dernier recours, le
 * bas du plateau (essai du 04/11/2026). Toujours une bande visible : le DMD n'est jamais la seule
 * place (essai du 02/11/2026 : rien ne s'affichait). Les scores sur le DMD viennent en plus, selon
 * leur propre réglage (`dmdOn`), quand il se lit. Le choix du joueur (`place`) prime quand la borne
 * le permet ; un choix impossible revient à l'automatique.
 */
export function liveBoardPlacement(screens: LiveBoardScreens, rows: number, place: LiveScoresPlace = 'auto', dmdOn = true): LiveBoardPlacement {
  const dmd = dmdOn && screens.dmd && screens.dmd.width > 0 && screens.dmd.height > 0 && screens.dmdReadable ? screens.dmd : undefined;
  const dmdWhy = dmd ? ', et sur le DMD quand il montre l’écran de score' : !screens.dmd ? '' : !dmdOn ? ', pas sur le DMD (désactivé)' : ', pas sur le DMD (illisible : inspector de VPX)'; // i18n-ignore : journal
  const tail = dmd ? { dmd } : {};
  const label = { backglass: 'fronton', topper: 'topper' } as const;
  const state = (role: 'backglass' | 'topper') => (screens.free.some((f) => f.role === role) ? 'libre' : 'pris par la table, la bande passe devant'); // i18n-ignore : journal
  const on = (role: 'backglass' | 'topper') => {
    const zone = screens.zones?.[role] ?? screens.free.find((f) => f.role === role)?.zone;
    return zone ? cardsOn({ role, zone }, rows) : undefined;
  };
  const auto = (fallback?: string): LiveBoardPlacement => {
    const why = (text: string) => ({ ...tail, ...(fallback ? { fallback } : {}), why: `automatique : ${text}${dmdWhy}` }); // i18n-ignore : journal
    for (const role of ['backglass', 'topper'] as const) {
      const band = on(role);
      if (band) return { band, ...why(`${label[role]} (${state(role)})`) };
    }
    if (screens.playfield) return { band: insertOn(screens.playfield, rows, 'bottom-left'), ...why('ni fronton ni topper, bas du plateau') }; // i18n-ignore : journal
    return why('pas d’écran du plateau'); // i18n-ignore : journal
  };
  switch (place) {
    case 'backglass':
    case 'topper': {
      const zone = screens.zones?.[place];
      const band = on(place);
      return band ? { band, ...tail, why: `choix du joueur : ${label[place]}${dmdWhy}` } : auto(zone ? `${label[place]} trop petit` : `pas de ${label[place]}`); // i18n-ignore : journal
    }
    case 'playfield-bottom':
    case 'playfield-side':
      if (screens.playfield) return { band: insertOn(screens.playfield, rows, place === 'playfield-bottom' ? 'bottom-left' : 'middle-left'), ...tail, why: `choix du joueur : ${place}${dmdWhy}` }; // i18n-ignore : journal
      return auto('pas d’écran du plateau'); // i18n-ignore : journal
    default:
      return auto();
  }
}

/**
 * La fenêtre d'un autre processus qui passe devant `handle` (pile de Windows, du dessus vers le
 * dessous) et le recouvre en partie : VPX, son PuP-Pack, son B2S, FlexDMD, un DMD externe. Les
 * barres des tâches, fenêtres réduites et vides ne comptent pas.
 */
export function overlayCoveredBy(stack: readonly StackedWindow[], handle: bigint, ownPid: number): StackedWindow | undefined {
  const at = stack.findIndex((w) => w.handle === handle);
  if (at <= 0) return undefined;
  const me = stack[at]!.rect;
  const overlaps = (r: StackedWindow['rect']) => Math.min(r.x + r.width, me.x + me.width) - Math.max(r.x, me.x) > 0 && Math.min(r.y + r.height, me.y + me.height) - Math.max(r.y, me.y) > 0;
  return stack.slice(0, at).find((w) => w.pid !== ownPid && !w.minimized && w.rect.width > 1 && w.rect.height > 1 && !(TASKBAR_CLASSES as readonly string[]).includes(w.className) && overlaps(w.rect));
}

/** Ce que la borne permet pour chaque place : chaque choix, et la raison quand il est grisé. */
export interface LiveScoresCabinet {
  backglass: boolean;
  topper: boolean;
  /** Un écran du DMD (ou une zone du DMD) : un DMD matériel seul ne se recouvre pas. */
  dmd: boolean;
  /** L'inspector de VPX peut être activé (règle du pare-feu qui ferme VPX au réseau) : le DMD se lit. */
  inspector: boolean;
}

export interface LiveScoresChoice {
  place: LiveScoresPlace;
  label: string;
  detail: string;
  /** Grisé : pourquoi (jamais caché). */
  unavailable?: string;
}

export function liveScoresChoices(cabinet: LiveScoresCabinet): LiveScoresChoice[] {
  return [
    { place: 'auto', label: t('Automatique'), detail: t('Sur le fronton, même quand la table s’en sert (la bande passe devant) ; sans fronton, sur le topper ; sinon en bas du plateau') },
    { place: 'backglass', label: t('Sur le fronton'), detail: t('En bas du fronton, par-dessus son image ou son PuP-Pack'), ...(cabinet.backglass ? {} : { unavailable: t('Pas d’écran de fronton sur cette borne') }) },
    { place: 'topper', label: t('Sur le topper'), detail: t('Au centre du topper, par-dessus son image ou son PuP-Pack'), ...(cabinet.topper ? {} : { unavailable: t('Pas de topper sur cette borne') }) },
    { place: 'playfield-bottom', label: t('En bas du plateau'), detail: t('Un encart sur le tablier, coin gauche, sous les couloirs extérieurs') },
    { place: 'playfield-side', label: t('Sur le côté du plateau'), detail: t('Un encart au milieu du bord gauche') },
  ];
}

/** Le réglage « Scores sur le DMD » : grisé, pourquoi, quand la borne ne le permet pas (jamais caché). */
export function liveScoresDmdUnavailable(cabinet: LiveScoresCabinet): string | undefined {
  if (!cabinet.dmd) return t('Pas d’écran du DMD sur cette borne : un DMD matériel ne peut pas être recouvert');
  if (!cabinet.inspector) return t('Le DMD se lit par l’inspector de VPX : Amis > Partage et réseau > « Autoriser dans le pare-feu de Windows »');
  return undefined;
}

/**
 * Le réglage enregistré (`<données>\amis\scores-en-partie.json`), lu sans confiance : une place
 * inconnue est l'automatique, les scores sur le DMD sont activés sauf `dmd: false`. L'ancien choix
 * « Sur le DMD » (avant le 04/11/2026) devient l'automatique, DMD activé. `tables` (une table par son
 * identifiant) prépare un réglage par table, pas encore proposé : ce qu'elle précise l'emporte.
 */
export function parseLiveScoresSettings(raw: unknown, tableId?: string): LiveScoresSettings {
  const read = (v: unknown, base: LiveScoresSettings): LiveScoresSettings => {
    if (!v || typeof v !== 'object') return base;
    const o = v as { place?: unknown; dmd?: unknown };
    const place = LIVE_SCORES_PLACES.includes(o.place as LiveScoresPlace) ? (o.place as LiveScoresPlace) : o.place === undefined ? base.place : 'auto';
    return { place, dmd: typeof o.dmd === 'boolean' ? o.dmd : base.dmd };
  };
  const all = read(raw, LIVE_SCORES_DEFAULT);
  const tables = raw && typeof raw === 'object' ? (raw as { tables?: unknown }).tables : undefined;
  const own = tableId && tables && typeof tables === 'object' ? (tables as Record<string, unknown>)[tableId] : undefined;
  return own ? read(own, all) : all;
}

// --- Sur le DMD ---

/**
 * Les scores sur le DMD : seulement quand il montre l'écran de score de la table (dmdscore.ts), et
 * jamais au hasard (essai du 31/10/2026) : au premier repos de la partie (la liste des joueurs),
 * puis au repos qui suit une bille du joueur, un autre qui prend la tête ou finit sa partie, et au
 * plus tard toutes les 45 s ; jamais deux fois en moins de 15 s ; 6 s au plus, et ils partent dès
 * que le DMD montre autre chose ou que le score bouge. Un passage ne commence que sur un écran de
 * score vu depuis 1,5 s : un instant reconnu à tort (Star Trek : une seconde d'une animation presque
 * immobile, mesurée au banc) ne suffit pas.
 */
export const LIVE_FLASH = { showMs: 6000, everyMs: 45_000, gapMs: 15_000, settleMs: 1500 } as const;

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
  /** Depuis quand le DMD montre l'écran de score sans interruption. */
  private screenSince?: number;

  constructor(private readonly start: number) {}

  /** Les scores se voient-ils sur le DMD à `now` ? `scoreScreen` : le DMD montre son écran de score. */
  visible(view: LiveBoardView, now: number, scoreScreen: boolean): boolean {
    const key = liveFlashKey(view);
    if (this.key !== undefined && key !== this.key) this.pending = true;
    this.key = key;
    if (!scoreScreen) {
      // Le DMD montre autre chose : les points partent tout de suite, et ce passage est fini.
      this.until = 0;
      this.screenSince = undefined;
      return false;
    }
    this.screenSince ??= now;
    if (now < this.until) return true;
    if (now - this.screenSince < LIVE_FLASH.settleMs) return false;
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
