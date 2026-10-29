// Partie en direct entre amis (docs/recherche/partage-medias.md, § 13 et § 14) : un joueur en
// invite jusqu'à trois autres sur une table ; chacun joue sa propre partie sur sa borne, au même
// moment, après un compte à rebours commun ; les résultats de chacun arrivent à la fin.
//
// Celui qui invite tient la partie : il reçoit les réponses et l'état de chacun, et renvoie à tous
// la salle à jour (game-room). Les invités n'ont pas besoin d'être amis entre eux.
//
// Avant le départ, chaque invité dit ce qu'il a de la table de celui qui invite (décision du
// 29/10/2026 : personne n'est refusé, seul le classement change) :
// - « same » : la même table, le même .vpx (empreinte SHA-256) ou le même identifiant de table
//   (vpxid.ts : objets et physique, sans images, sons ni script) ; classé.
// - « same-rules » : une version proche, mêmes règles de score (même ROM, ou même script hors
//   options) ; classé, la physique peut différer.
// - « other-version » : le même jeu (sameTable : identifiant VPS, ROM, titre et année), d'autres
//   règles ; il joue avec les autres, son score reste hors classement.
// - « missing » : il ne l'a pas, il ne peut que refuser (il la récupère chez l'ami ou par le
//   catalogue).
//
// Pendant la partie, le score n'est pas lisible (VPX n'écrit ses records qu'à la fin) : chacun
// envoie sa durée de jeu et les records entrés au tableau d'honneur de la table. Voir le score,
// la bille et le DMD des autres en direct est l'étape suivante (§ 13.3), à décider en maquette.
//
// Ici, seulement ce qui se décide sur des données ; le service est dans app/src/live-game.ts.

import { randomBytes } from 'node:crypto';
import { t } from './i18n';
import { normalizeName } from './social';
import { isPlayerPublicKey, parseTableIdentity, sameTable, type TableIdentity } from './sharing';

/** Joueurs au plus, celui qui invite compris (§ 13.2). */
export const LIVE_MAX_PLAYERS = 4;
/** Une invitation sans réponse expire après ce délai. */
export const LIVE_INVITE_MS = 2 * 60_000;
/** Compte à rebours du départ commun, en secondes. */
export const LIVE_COUNTDOWN_S = 5;
/** Résultats attendus au plus ce délai après le premier joueur revenu ; au-delà, la partie se clôt. */
export const LIVE_RESULTS_WAIT_MS = 15 * 60_000;

export interface LiveTable {
  table: TableIdentity;
  /** Ce qui distingue la version (« VPW 1.2 »), d'après le nom du fichier. */
  version?: string;
  /** Empreinte SHA-256 du .vpx : deux bornes ont la même version quand elle est la même. */
  print?: string;
  /**
   * Taille du .vpx, en octets : l'invité ne calcule l'empreinte que des tables de cette taille,
   * pour reconnaître le même fichier sous un autre nom (une table reçue d'un ami, renommée
   * d'après VPS à l'installation).
   */
  bytes?: number;
  /** Identifiant de table (vpxid.ts) : la même table, même renommée ou réenregistrée. */
  id?: string;
  /** Règles de score (rulesKey) : « rom:… » ou « vbs:<empreinte du script hors options> ». */
  rules?: string;
}

/** Ce que l'invité a de cette table. */
export type LiveTableMatch = 'same' | 'same-rules' | 'other-version' | 'missing';

/** Un score qui compte au classement : la même table, ou les mêmes règles de score. */
export function liveRanked(p: Pick<LivePlayer, 'host' | 'match'>): boolean {
  return p.host === true || p.match === undefined || p.match === 'same' || p.match === 'same-rules';
}

export type LivePlayerState =
  /** Invitation envoyée, pas encore de réponse. */
  | 'invited'
  | 'accepted'
  | 'declined'
  /** Occupé : déjà dans une partie, en jeu, ou une autre invitation à l'écran. */
  | 'busy'
  | 'expired'
  /** Parti du salon, ou partie arrêtée de son côté. */
  | 'left'
  | 'loading'
  | 'playing'
  | 'done'
  /** La partie n'a pas démarré de son côté (VPX absent, écrans à revoir…). */
  | 'failed';

export interface LiveRecord {
  score: number;
  /** Place au tableau d'honneur de sa table (1 : le meilleur score). */
  rank: number;
  initials?: string;
}

export interface LivePlayer {
  key: string;
  name: string;
  state: LivePlayerState;
  host?: boolean;
  match?: LiveTableMatch;
  /** Invité le (ISO), pour l'expiration. */
  invitedAt?: string;
  /** Fin de partie : durée jouée et records entrés. */
  seconds?: number;
  records?: LiveRecord[];
}

export type LivePhase = 'gathering' | 'countdown' | 'playing' | 'finished' | 'cancelled';

export interface LiveGame {
  id: string;
  host: string;
  table: LiveTable;
  /** Titre montré (« Terminator 2 (Williams 1991) »). */
  title: string;
  players: LivePlayer[];
  phase: LivePhase;
  createdAt: string;
  /** Départ commun (ISO, horloge de cette borne). */
  startAt?: string;
  /** Premier joueur revenu (ISO), pour clore la partie si un autre ne répond plus. */
  firstDoneAt?: string;
}

/** Une invitation reçue, telle que l'invité la voit. */
export interface LiveInvite {
  id: string;
  host: { key: string; name: string };
  table: LiveTable;
  title: string;
  players: { key: string; name: string }[];
  receivedAt: string;
}

export type LiveAnswer = 'accept' | 'decline' | 'busy';
export type LiveStatus = 'loading' | 'playing' | 'done' | 'failed' | 'left';

export type LiveMessage =
  | { t: 'game-invite'; game: { id: string; table: LiveTable; title: string; players: { key: string; name: string }[] } }
  | { t: 'game-answer'; game: string; answer: LiveAnswer; match?: LiveTableMatch }
  | { t: 'game-room'; game: string; phase: LivePhase; players: LivePlayer[] }
  /** Départ dans `in` millisecondes, à compter de la réception. */
  | { t: 'game-start'; game: string; in: number }
  | { t: 'game-status'; game: string; state: LiveStatus; seconds?: number; records?: LiveRecord[] }
  | { t: 'game-cancel'; game: string };

// ---------------------------------------------------------------------------
// Messages reçus

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const isPrint = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const STATES: readonly LivePlayerState[] = ['invited', 'accepted', 'declined', 'busy', 'expired', 'left', 'loading', 'playing', 'done', 'failed'];
const PHASES: readonly LivePhase[] = ['gathering', 'countdown', 'playing', 'finished', 'cancelled'];
const MATCHES: readonly LiveTableMatch[] = ['same', 'same-rules', 'other-version', 'missing'];
const isRules = (v: unknown): v is string => typeof v === 'string' && /^(rom:[a-z0-9_,-]{1,196}|vbs:[0-9a-f]{64})$/.test(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

function parseLiveTable(raw: unknown): LiveTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const table = parseTableIdentity(r.table);
  if (!table?.title) return undefined;
  const version = typeof r.version === 'string' && r.version.length <= 60 && !/[\x00-\x1f\x7f]/.test(r.version) ? r.version : undefined;
  const bytes = typeof r.bytes === 'number' && Number.isSafeInteger(r.bytes) && r.bytes > 0 ? r.bytes : undefined;
  return {
    table,
    ...(version ? { version } : {}),
    ...(isPrint(r.print) ? { print: r.print } : {}),
    ...(bytes ? { bytes } : {}),
    ...(isPrint(r.id) ? { id: r.id } : {}),
    ...(isRules(r.rules) ? { rules: r.rules } : {}),
  };
}

function parsePeer(raw: unknown): { key: string; name: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  return typeof r.key === 'string' && isPlayerPublicKey(r.key) && name ? { key: r.key, name } : undefined;
}

function parseRecords(raw: unknown): LiveRecord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .slice(0, 8)
    .map((r) => {
      if (!r || typeof r !== 'object') return undefined;
      const x = r as Record<string, unknown>;
      const score = x.score, rank = x.rank;
      if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0 || typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || rank > 99) return undefined;
      const initials = typeof x.initials === 'string' && /^[A-Z0-9 .!?-]{1,8}$/.test(x.initials) ? x.initials : undefined;
      return { score, rank, ...(initials ? { initials } : {}) };
    })
    .filter((r): r is LiveRecord => !!r);
}

const seconds = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 7 * 24 * 3600 ? Math.round(v) : undefined);

function parsePlayer(raw: unknown): LivePlayer | undefined {
  const peer = parsePeer(raw);
  if (!peer) return undefined;
  const r = raw as Record<string, unknown>;
  if (!STATES.includes(r.state as LivePlayerState)) return undefined;
  const records = parseRecords(r.records);
  const s = seconds(r.seconds);
  return {
    ...peer,
    state: r.state as LivePlayerState,
    ...(r.host === true ? { host: true } : {}),
    ...(MATCHES.includes(r.match as LiveTableMatch) ? { match: r.match as LiveTableMatch } : {}),
    ...(s !== undefined ? { seconds: s } : {}),
    ...(records?.length ? { records } : {}),
  };
}

/** Message d'une partie en direct, vérifié champ par champ ; undefined : ignoré. */
export function parseLiveMessage(m: Record<string, unknown>): LiveMessage | undefined {
  switch (m.t) {
    case 'game-invite': {
      const g = m.game as Record<string, unknown> | undefined;
      if (!g || typeof g !== 'object' || !isId(g.id)) return undefined;
      const table = parseLiveTable(g.table);
      const title = typeof g.title === 'string' && g.title.length > 0 && g.title.length <= 160 && !/[\x00-\x1f\x7f]/.test(g.title) ? g.title : undefined;
      const players = (Array.isArray(g.players) ? g.players.slice(0, LIVE_MAX_PLAYERS) : []).map(parsePeer).filter((p): p is { key: string; name: string } => !!p);
      return table && title ? { t: 'game-invite', game: { id: g.id, table, title, players } } : undefined;
    }
    case 'game-answer':
      if (!isId(m.game) || (m.answer !== 'accept' && m.answer !== 'decline' && m.answer !== 'busy')) return undefined;
      return { t: 'game-answer', game: m.game, answer: m.answer, ...(MATCHES.includes(m.match as LiveTableMatch) ? { match: m.match as LiveTableMatch } : {}) };
    case 'game-room': {
      if (!isId(m.game) || !PHASES.includes(m.phase as LivePhase) || !Array.isArray(m.players)) return undefined;
      const players = m.players.slice(0, LIVE_MAX_PLAYERS).map(parsePlayer).filter((p): p is LivePlayer => !!p);
      return { t: 'game-room', game: m.game, phase: m.phase as LivePhase, players };
    }
    case 'game-start':
      return isId(m.game) && typeof m.in === 'number' && m.in >= 0 && m.in <= 60_000 ? { t: 'game-start', game: m.game, in: m.in } : undefined;
    case 'game-status': {
      if (!isId(m.game) || !['loading', 'playing', 'done', 'failed', 'left'].includes(m.state as string)) return undefined;
      const s = seconds(m.seconds);
      const records = parseRecords(m.records);
      return { t: 'game-status', game: m.game, state: m.state as LiveStatus, ...(s !== undefined ? { seconds: s } : {}), ...(records?.length ? { records } : {}) };
    }
    case 'game-cancel':
      return isId(m.game) ? { t: 'game-cancel', game: m.game } : undefined;
    default:
      return undefined;
  }
}

/** Invitation reçue d'un pair (sa clé authentifiée par la connexion). */
export function liveInvite(message: Extract<LiveMessage, { t: 'game-invite' }>, host: { key: string; name: string }, now = new Date()): LiveInvite {
  return { id: message.game.id, host, table: message.game.table, title: message.game.title, players: message.game.players.filter((p) => p.key !== host.key), receivedAt: now.toISOString() };
}

export function inviteExpired(invite: Pick<LiveInvite, 'receivedAt'>, now = new Date()): boolean {
  return now.getTime() - Date.parse(invite.receivedAt) > LIVE_INVITE_MS;
}

// ---------------------------------------------------------------------------
// La table

/**
 * Ma table qui correspond à celle de l'invitation : la même version d'abord (même empreinte),
 * sinon le même jeu dans une autre version ; « missing » si je n'ai pas ce jeu. Le même fichier
 * est la même table, quel que soit le nom que chaque borne lui donne : une table reçue d'un ami
 * prend à l'installation le nom du jeu chez VPS (« Game of Thrones (Limited Edition) » chez l'un,
 * « Game of Thrones LE » chez l'autre).
 */
export function matchLiveTable<T>(theirs: LiveTable, mine: readonly { entry: T; identity: TableIdentity; print?: string; id?: string; rules?: string }[]): { match: LiveTableMatch; entry?: T } {
  const exact = mine.find((m) => (theirs.print && m.print === theirs.print) || (theirs.id && m.id === theirs.id));
  if (exact) return { match: 'same', entry: exact.entry };
  const rules = theirs.rules ? mine.find((m) => m.rules === theirs.rules) : undefined;
  if (rules) return { match: 'same-rules', entry: rules.entry };
  const same = mine.filter((m) => sameTable(theirs.table, m.identity));
  // Sans rien pour comparer les versions (une borne d'avant l'empreinte), le même jeu passe pour la même table.
  const known = (x: { print?: string; id?: string; rules?: string }) => !!(x.print || x.id || x.rules);
  if (same[0]) return { match: known(theirs) && known(same[0]) ? 'other-version' : 'same', entry: same[0].entry };
  return { match: 'missing' };
}

// ---------------------------------------------------------------------------
// La partie, côté de celui qui invite

export function newLiveGame(host: { key: string; name: string }, table: LiveTable, title: string, now = new Date()): LiveGame {
  return {
    id: randomBytes(8).toString('hex'),
    host: host.key,
    table,
    title,
    players: [{ key: host.key, name: host.name, state: 'accepted', host: true, match: 'same' }],
    phase: 'gathering',
    createdAt: now.toISOString(),
  };
}

const setPlayer = (game: LiveGame, key: string, change: (p: LivePlayer) => LivePlayer): LiveGame => ({ ...game, players: game.players.map((p) => (p.key === key ? change(p) : p)) });

/** Invite un ami (de nouveau, s'il avait refusé ou laissé expirer) ; undefined : salon plein ou partie partie. */
export function inviteToGame(game: LiveGame, peer: { key: string; name: string }, now = new Date()): LiveGame | undefined {
  if (game.phase !== 'gathering') return undefined;
  const there = game.players.find((p) => p.key === peer.key);
  if (there) {
    if (['accepted', 'invited'].includes(there.state)) return game;
    return setPlayer(game, peer.key, (p) => ({ key: p.key, name: peer.name, state: 'invited', invitedAt: now.toISOString() }));
  }
  if (game.players.filter((p) => !['declined', 'busy', 'expired', 'left'].includes(p.state)).length >= LIVE_MAX_PLAYERS) return undefined;
  return { ...game, players: [...game.players, { key: peer.key, name: peer.name, state: 'invited', invitedAt: now.toISOString() }] };
}

/** Réponse d'un invité ; ignorée s'il n'est pas invité ou si la partie est partie. */
export function answerGame(game: LiveGame, key: string, answer: LiveAnswer, match?: LiveTableMatch): LiveGame {
  const p = game.players.find((x) => x.key === key);
  if (!p || p.host || game.phase !== 'gathering' || p.state !== 'invited') return game;
  // Sans la table, accepter ne mène à rien : compté comme un refus.
  const state: LivePlayerState = answer === 'accept' && match !== 'missing' ? 'accepted' : answer === 'busy' ? 'busy' : 'declined';
  return setPlayer(game, key, (x) => ({ ...x, state, ...(match ? { match } : {}) }));
}

/** Invitations restées sans réponse trop longtemps : expirées. */
export function expireInvites(game: LiveGame, now = new Date()): LiveGame {
  const stale = game.players.filter((p) => p.state === 'invited' && p.invitedAt && now.getTime() - Date.parse(p.invitedAt) > LIVE_INVITE_MS);
  return stale.length ? { ...game, players: game.players.map((p) => (stale.includes(p) ? { ...p, state: 'expired' } : p)) } : game;
}

/** Au moins un invité a accepté : celui qui invite peut donner le départ. */
export function canStartGame(game: LiveGame): boolean {
  return game.phase === 'gathering' && game.players.some((p) => !p.host && p.state === 'accepted');
}

/** Départ commun : compte à rebours ; les invitations sans réponse tombent. */
export function startGame(game: LiveGame, now = new Date()): LiveGame {
  if (!canStartGame(game)) return game;
  return {
    ...game,
    phase: 'countdown',
    startAt: new Date(now.getTime() + LIVE_COUNTDOWN_S * 1000).toISOString(),
    players: game.players.map((p) => (p.state === 'invited' ? { ...p, state: 'expired' } : p)),
  };
}

/** Joueurs de la partie elle-même : ceux qui ont accepté, puis joué (ou essayé). */
export function livePlayers(game: Pick<LiveGame, 'players'>): LivePlayer[] {
  return game.players.filter((p) => ['accepted', 'loading', 'playing', 'done', 'failed', 'left'].includes(p.state));
}

/** État d'un joueur pendant la partie ; la partie se clôt quand tous sont revenus. */
export function gameStatus(game: LiveGame, key: string, status: { state: LiveStatus; seconds?: number; records?: LiveRecord[] }, now = new Date()): LiveGame {
  const p = game.players.find((x) => x.key === key);
  if (!p || (game.phase !== 'countdown' && game.phase !== 'playing') || !livePlayers(game).includes(p)) {
    // Parti avant le départ : il sort du salon.
    if (p && status.state === 'left' && game.phase === 'gathering' && !p.host) return setPlayer(game, key, (x) => ({ ...x, state: 'left' }));
    return game;
  }
  if (p.state === 'done' || p.state === 'failed') return game;
  let next = setPlayer(game, key, (x) => ({ ...x, state: status.state, ...(status.seconds !== undefined ? { seconds: status.seconds } : {}), ...(status.records?.length ? { records: status.records } : {}) }));
  if (next.phase === 'countdown' && (status.state === 'loading' || status.state === 'playing')) next = { ...next, phase: 'playing' };
  if ((status.state === 'done' || status.state === 'failed' || status.state === 'left') && !next.firstDoneAt) next = { ...next, firstDoneAt: now.toISOString() };
  return closeIfDone(next, now);
}

/** Tous revenus, ou attente des derniers trop longue : la partie est finie. */
export function closeIfDone(game: LiveGame, now = new Date()): LiveGame {
  if (game.phase !== 'playing' && game.phase !== 'countdown') return game;
  const playing = livePlayers(game);
  const back = (p: LivePlayer) => ['done', 'failed', 'left'].includes(p.state);
  const late = game.firstDoneAt && now.getTime() - Date.parse(game.firstDoneAt) > LIVE_RESULTS_WAIT_MS;
  return playing.every(back) || late ? { ...game, phase: 'finished' } : game;
}

/** Salon tel qu'on l'envoie aux invités. */
export function roomMessage(game: LiveGame): Extract<LiveMessage, { t: 'game-room' }> {
  return { t: 'game-room', game: game.id, phase: game.phase, players: game.players.map(({ invitedAt: _invitedAt, ...p }) => p) };
}

/** Côté invité : la salle reçue de celui qui invite remplace la sienne. */
export function applyRoom(game: LiveGame, room: Extract<LiveMessage, { t: 'game-room' }>): LiveGame {
  if (room.game !== game.id || game.phase === 'cancelled') return game;
  // Le départ se compte à la réception de game-start, pas à la salle.
  const phase = room.phase === 'countdown' && game.phase === 'gathering' ? 'gathering' : room.phase;
  return { ...game, phase, players: room.players };
}

/** Côté invité : la partie telle qu'il la suit après avoir accepté. */
export function guestGame(invite: LiveInvite, me: { key: string; name: string }, match: LiveTableMatch): LiveGame {
  return {
    id: invite.id,
    host: invite.host.key,
    table: invite.table,
    title: invite.title,
    players: [{ ...invite.host, state: 'accepted', host: true, match: 'same' }, { ...me, state: 'accepted', match }],
    phase: 'gathering',
    createdAt: invite.receivedAt,
  };
}

/** Départ reçu : dans `ms` millisecondes. */
export function countdownFrom(game: LiveGame, ms: number, now = new Date()): LiveGame {
  return { ...game, phase: 'countdown', startAt: new Date(now.getTime() + ms).toISOString() };
}

/** Secondes avant le départ (0 : c'est parti). */
export function countdownLeft(game: Pick<LiveGame, 'startAt'>, now = new Date()): number {
  return game.startAt ? Math.max(0, Math.ceil((Date.parse(game.startAt) - now.getTime()) / 1000)) : 0;
}

// ---------------------------------------------------------------------------
// Textes

export function livePlayerStateLabel(p: Pick<LivePlayer, 'state' | 'match'>): string {
  switch (p.state) {
    case 'invited':
      return t('Invité, en attente de sa réponse');
    case 'accepted':
      return p.match === 'other-version' ? t('Prêt, autre version : score hors classement') : p.match === 'same-rules' ? t('Prêt, version proche : mêmes règles de score') : t('Prêt');
    case 'declined':
      return p.match === 'missing' ? t('N’a pas cette table') : t('A refusé');
    case 'busy':
      return t('Occupé pour l’instant');
    case 'expired':
      return t('Pas de réponse');
    case 'left':
      return t('A quitté la partie');
    case 'loading':
      return t('Chargement de la table');
    case 'playing':
      return t('En partie');
    case 'done':
      return t('Partie terminée');
    case 'failed':
      return t('La partie n’a pas démarré de son côté');
  }
}

export function liveMatchLabel(match: LiveTableMatch): string {
  switch (match) {
    case 'same':
      return t('Vous avez cette table');
    case 'same-rules':
      return t('Vous avez une version proche : mêmes règles de score, votre score compte au classement');
    case 'other-version':
      return t('Vous avez cette table dans une autre version : vous jouez ensemble, votre score reste hors classement');
    case 'missing':
      return t('Vous n’avez pas cette table : récupérez-la par le catalogue, puis demandez une nouvelle invitation');
  }
}

/**
 * Classement de fin : d'abord ceux qui ont un record entré et comptent au classement (liveRanked :
 * la même table ou les mêmes règles, le meilleur score d'abord), puis ceux qui ont joué (une autre
 * version : hors classement, même avec un record), puis les autres. Le score de la partie n'est
 * connu que s'il est entré au tableau d'honneur de la table.
 */
export function liveStandings(game: Pick<LiveGame, 'players'>): LivePlayer[] {
  const best = (p: LivePlayer) => Math.max(-1, ...(p.records ?? []).map((r) => r.score));
  const order = (p: LivePlayer) => (p.records?.length && liveRanked(p) ? 0 : p.state === 'done' ? 1 : 2);
  return livePlayers(game).sort((a, b) => order(a) - order(b) || best(b) - best(a) || (b.seconds ?? 0) - (a.seconds ?? 0));
}
