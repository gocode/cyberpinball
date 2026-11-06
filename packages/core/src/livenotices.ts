// Notifications de la partie entre amis (essai réel du 31/10/2026, deux retours) :
//   « Lorsqu'une personne accepte l'invitation […] si jamais on n'est pas dans l'interface de jeu
//   multijoueur […] il faut très vite une notification pour dire que le joueur a accepté, ou
//   décliné » ;
//   « on finit beaucoup plus tôt que les autres […] il nous faut une notification pour dire que la
//   session multijoueur est terminée, et pouvoir voir les résultats ».
//
// Un relevé de la partie, comparé d'un instant à l'autre comme celui du réseau des amis
// (notices.ts, socialNotices) : tout changement de la partie passe par là, quel que soit le
// message qui l'a causé (game-answer, game-room, game-status, game-cancel, l'expiration d'une
// invitation, la fin par l'attente des derniers). Ce qui change :
// - hôte : un invité accepte ; décline, est occupé, ne répond pas (avec la raison) ;
// - tous : un joueur quitte la partie ou ne la démarre pas ; celui qui invite l'annule ;
// - tous : la partie est finie pour tout le monde, quand j'étais déjà revenu de la mienne (sinon
//   les résultats s'ouvrent d'eux-mêmes à mon retour : rien à annoncer).
// Rien au premier relevé, ni d'une partie à une autre : ce qui était là n'est pas une nouvelle.
// La file (notices.ts) décide du reste : quand, où (NoticeRule.live), et le regroupement
// (« Bruno et Léa ont accepté »).

import { liveRanked, liveScore, liveStandings, type LiveGame, type LiveInvite, type LiveInviteEnd, type LivePhase, type LivePlayerState } from './livegame';
import type { LiveNoticeReason, NoticeEvent } from './notices';

export interface LiveSnapshot {
  id: string;
  phase: LivePhase;
  /** Cette borne tient la partie (celui qui invite). */
  hosting: boolean;
  /** État de chaque joueur, et le moment de son invitation (une nouvelle invitation, une nouvelle réponse). */
  players: ReadonlyMap<string, { state: LivePlayerState; invitedAt?: string }>;
  /** Mon état dans la partie. */
  mine?: LivePlayerState;
}

export function liveSnapshot(game: LiveGame | undefined, me: string): LiveSnapshot | undefined {
  if (!game) return undefined;
  return {
    id: game.id,
    phase: game.phase,
    hosting: game.host === me,
    players: new Map(game.players.map((p) => [p.key, { state: p.state, ...(p.invitedAt ? { invitedAt: p.invitedAt } : {}) }])),
    ...(game.players.some((p) => p.key === me) ? { mine: game.players.find((p) => p.key === me)!.state } : {}),
  };
}

const BACK: readonly LivePlayerState[] = ['done', 'failed', 'left'];
const IN_GAME: readonly LivePlayerState[] = ['accepted', 'loading', 'playing'];

/** Ce qui a changé dans la partie entre deux relevés (`next` : celui de `game`). */
export function liveNotices(prev: LiveSnapshot | undefined, next: LiveSnapshot | undefined, game: LiveGame | undefined, me: string, now: number): NoticeEvent[] {
  if (!prev || !next || !game || prev.id !== next.id || game.id !== next.id) return [];
  const out: NoticeEvent[] = [];
  const subject = { subject: game.title };
  for (const p of game.players) {
    if (p.key === me) continue;
    const before = prev.players.get(p.key);
    if (!before || before.state === p.state) continue;
    const key = `${game.id}|${p.key}|${p.invitedAt ?? ''}`;
    if (next.hosting && before.state === 'invited') {
      if (p.state === 'accepted') out.push({ kind: 'live-accepted', key, at: now, who: p.name, player: p.key, ...subject });
      else if (p.state === 'declined' || p.state === 'busy' || p.state === 'expired') {
        const reason: LiveNoticeReason | undefined = p.state === 'expired' && p.offline ? 'offline' : p.state !== 'declined' ? p.state : p.match === 'missing' || p.match === 'other-version' ? p.match : undefined;
        out.push({ kind: 'live-declined', key, at: now, who: p.name, player: p.key, ...subject, ...(reason ? { reason } : {}) });
      }
    } else if (IN_GAME.includes(before.state) && (p.state === 'left' || p.state === 'failed')) {
      out.push({ kind: 'live-left', key, at: now, who: p.name, player: p.key, ...subject, ...(p.state === 'failed' ? { reason: 'failed' as const } : {}) });
    }
  }
  if (!next.hosting && prev.phase !== 'cancelled' && next.phase === 'cancelled') {
    out.push({ kind: 'live-cancelled', key: game.id, at: now, who: game.players.find((p) => p.host)?.name ?? '?', ...subject });
  }
  // Fini pour tout le monde alors que j'étais déjà revenu : j'ai fait autre chose entre-temps.
  if (prev.phase !== 'finished' && next.phase === 'finished' && prev.mine && BACK.includes(prev.mine)) {
    out.push({ kind: 'live-finished', key: game.id, at: now, ...subject, ...liveOutcome(game, me) });
  }
  return out;
}

/**
 * Invitations arrivées depuis le relevé précédent (`prev` : les identifiants déjà vus ; undefined au
 * premier relevé, qui ne dit rien) : « Bruno vous invite à rejoindre une partie » (essai réel du
 * 04/11/2026 : la carte et le carillon ne suffisaient pas, la notification d'une ligne en plus).
 */
export function inviteNotices(prev: ReadonlySet<string> | undefined, invites: readonly LiveInvite[], now: number, ended: (id: string) => LiveInviteEndInfo | undefined = () => undefined): NoticeEvent[] {
  if (!prev) return [];
  // Chaque invitation voulue a son numéro (round) : réinvité après un refus, dans la même partie, c'en est une nouvelle.
  const arrived = invites.filter((i) => !prev.has(inviteTag(i))).map((i) => ({ kind: 'live-invite' as const, key: inviteTag(i), at: now, who: i.host.name, player: i.host.key, subject: i.title }));
  // Une invitation vue qui n'est plus là sans ma réponse : pourquoi, aux deux bornes (essai réel du
  // 04/11/2026). Changée de table : la nouvelle invitation le dit déjà.
  const gone = [...prev]
    .filter((tag) => !invites.some((i) => inviteTag(i) === tag))
    .flatMap((tag) => {
      const end = ended(tagId(tag));
      return end && end.why !== 'answered' && end.why !== 'replaced' ? [{ kind: 'live-invite-ended' as const, key: tag, at: now, who: end.name, subject: end.title, end: end.why }] : [];
    });
  return [...arrived, ...gone];
}

/** Une invitation et son numéro : « 0123456789abcdef|2 » (le relevé des invitations, la clé de leurs notifications). */
export const inviteTag = (i: Pick<LiveInvite, 'id' | 'round'>): string => `${i.id}|${i.round ?? 0}`;
/** La partie d'une clé d'invitation (inviteTag) ; une clé sans numéro est la partie elle-même. */
export const tagId = (tag: string): string => tag.split('|')[0]!;

/** Comment une invitation reçue a pris fin (live-game.ts, inviteEnd) : `answered`, par ma réponse. */
export interface LiveInviteEndInfo {
  why: LiveInviteEnd | 'answered';
  name: string;
  title: string;
}

/** Le gagnant (au classement, avec un score), ou que je gagne ; sinon ma place parmi les classés. */
export function liveOutcome(game: LiveGame, me: string): Pick<NoticeEvent, 'who' | 'won' | 'place'> {
  const ranked = liveStandings(game).filter((p) => liveScore(p) !== undefined && liveRanked(p, game.table.balls));
  const first = ranked[0];
  if (!first) return {};
  if (first.key === me) return { won: true };
  const mine = ranked.findIndex((p) => p.key === me);
  return { who: first.name, ...(mine >= 0 ? { place: { rank: mine + 1, of: ranked.length } } : {}) };
}
