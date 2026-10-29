// Notification pendant la partie (app/src/game-notice.ts) : une invitation d'un ami à une partie
// en direct arrive pendant que le joueur joue. Elle s'annonce par le carillon d'invitation
// (uisounds.ts) et une carte discrète posée par-dessus VPX, dans le coin du plateau en haut à
// gauche pour le joueur (le témoin d'un enregistrement tient le coin droit). La carte reste
// GAME_NOTICE_FULL_MS, puis se réduit à une pastille qui compte le temps de l'invitation
// jusqu'à ce qu'elle expire, soit annulée ou que la partie finisse. Rien à faire pour
// l'ignorer ; quitter sa partie ramène au menu, où l'invitation s'ouvre d'elle-même.

import { t } from './i18n';
import { LIVE_INVITE_MS, type LiveInvite } from './livegame';
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
 * le joueur, quel que soit le sens de l'écran. `rotation` : celle de la mise en page du plateau
 * (menuRotation), `size` : la taille vue du joueur.
 */
export function gameNoticeBounds(zone: Rect, rotation: Rotation, size: { width: number; height: number }, margin: number): Rect {
  const quarter = rotation === 90 || rotation === 270;
  const w = quarter ? size.height : size.width;
  const h = quarter ? size.width : size.height;
  // Coin haut-gauche du joueur, tourné dans le repère de l'écran : (x, y) → (-y, x) par quart de tour horaire.
  let cx = -1;
  let cy = -1;
  for (let r = 0; r < rotation; r += 90) [cx, cy] = [-cy, cx];
  const x = cx > 0 ? zone.x + zone.width - margin - w : zone.x + margin;
  const y = cy > 0 ? zone.y + zone.height - margin - h : zone.y + margin;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}
