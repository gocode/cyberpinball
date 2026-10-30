// Historique des parties entre amis (demande du 30/10/2026) : chaque partie en direct finie
// (livegame.ts) est gardée sur la borne, dans <données>\amis\parties.json, pour la revoir : la table,
// la date, et chaque joueur avec son rang, son score, et pourquoi il était hors classement.
//
// Le tableau du groupe (groupboard.ts) ne garde que les meilleurs scores par version de table ;
// l'historique, lui, garde chaque partie, telle qu'elle s'est jouée. Il est fait pour servir plus
// tard aux classements (du groupe d'amis, puis national et mondial), qui ne sont pas construits :
// - chaque joueur est désigné par sa clé publique (`key`), stable d'une borne à l'autre ; son nom
//   n'est qu'un affichage, il peut changer ;
// - `board` est la version exacte de la table (boardKey : même .vpx, même script joué) : deux scores
//   ne se comparent que sur la même ;
// - `rank` et `off` disent si le score comptait (liveRanked : réglages de l'hôte reçus, même nombre
//   de billes, un seul joueur dans sa table) ; un score hors classement est gardé, jamais classé ;
// - `v` est la version du format : un champ ajouté plus tard (un pays, un tournoi) n'invalide pas
//   les parties déjà gardées, un format inconnu est laissé tel quel, sans être réécrit.
//
// Un fichier illisible n'est jamais écrasé : il est mis de côté (parties.illisible-<date>.json),
// l'historique repart vide et le journal le dit. Même règle pour le tableau du groupe (records.json).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isBallCount } from './ballcount';
import { boardKey } from './groupboard';
import { t, tn } from './i18n';
import { liveBallsAgainst, liveBehind, liveBehindLabel, liveOtherBalls, liveScore, liveStandings, type LiveGame, type LivePlayer, type LivePlayerState, type LiveTable } from './livegame';
import { normalizeName } from './social';
import { isPlayerPublicKey, parseTableIdentity } from './sharing';
import { readKeptJson } from './store';

/** Version du format de parties.json. */
export const HISTORY_VERSION = 1;

/** Pourquoi un score ne compte pas au classement. */
export type HistoryOff =
  /** Plus d'un joueur dans sa table (un Start de plus en première bille). */
  | 'multi'
  /** Réglages de l'hôte pas reçus entiers. */
  | 'settings'
  /** Un autre nombre de billes par partie que l'hôte. */
  | 'balls';

export interface HistoryPlayer {
  /** Clé publique du joueur : son identité pour les classements à venir. */
  key: string;
  /** Son nom le jour de la partie. */
  name: string;
  host?: true;
  /** Où il en était à la fin : « done » s'il a fini sa partie. */
  state: LivePlayerState;
  /** Score final (lu en direct, sinon son meilleur record entré) ; absent : inconnu. */
  score?: number;
  /** Place au classement de la partie (1 : le meilleur ; ex aequo à la même place) ; absent : pas classé. */
  rank?: number;
  /** Hors classement, et pourquoi. */
  off?: HistoryOff;
  /** Durée jouée, en secondes. */
  seconds?: number;
  /** Billes par partie de sa table, s'il le savait. */
  balls?: number;
  /** Place prise au tableau d'honneur de la table, et les initiales entrées. */
  record?: { rank: number; initials?: string };
  /** Ce que savait faire sa borne (LIVE_PROTOCOL) et sa version de Cyber Pinball, s'il les a annoncées. */
  proto?: number;
  app?: string;
}

export interface HistoryGame {
  /** La partie en direct (livegame.ts) : une partie n'entre qu'une fois. */
  id: string;
  /** Jouée le : le départ commun, sinon l'ouverture du salon (ISO). */
  at: string;
  /** Finie le, sur cette borne (ISO). */
  endedAt: string;
  /** Titre montré (« Terminator 2 (Williams 1991) »). */
  title: string;
  /** La table, telle que l'hôte l'a annoncée (sans la taille du .vpx, qui ne sert qu'à l'invitation). */
  table: Omit<LiveTable, 'bytes'>;
  /** Version exacte de la table (boardKey) ; absente sans empreinte. */
  board?: string;
  /** Clé de l'hôte. */
  host: string;
  /** Clé de cette borne : le joueur « vous ». */
  me: string;
  /** Les joueurs de la partie, dans l'ordre du classement (liveStandings). */
  players: HistoryPlayer[];
}

export interface GameHistory {
  v: number;
  /** De la plus récente à la plus ancienne. */
  games: HistoryGame[];
}

export const emptyHistory = (): GameHistory => ({ v: HISTORY_VERSION, games: [] });

/** Pourquoi le score de ce joueur ne compte pas ; undefined : il compte (le pendant de liveRanked). */
export function liveOffReason(p: Pick<LivePlayer, 'host' | 'balls' | 'settings' | 'multi'>, hostBalls?: number): HistoryOff | undefined {
  if (p.multi) return 'multi';
  if (p.host) return undefined;
  if (p.settings !== 'ok') return 'settings';
  return liveOtherBalls(p, hostBalls) ? 'balls' : undefined;
}

/** Une partie finie, telle que l'historique la garde ; undefined si elle n'est pas finie. */
export function historyEntry(game: LiveGame, me: string, now = new Date()): HistoryGame | undefined {
  if (game.phase !== 'finished') return undefined;
  const hostBalls = game.table.balls;
  const standings = liveStandings(game);
  const counted = standings.filter((p) => liveScore(p) !== undefined && !liveOffReason(p, hostBalls)).map((p) => liveScore(p)!);
  const players = standings.map((p): HistoryPlayer => {
    const score = liveScore(p);
    const off = liveOffReason(p, hostBalls);
    const record = [...(p.records ?? [])].sort((a, b) => a.rank - b.rank)[0];
    return {
      key: p.key,
      name: p.name,
      ...(p.host ? { host: true as const } : {}),
      state: p.state,
      ...(score !== undefined ? { score } : {}),
      ...(score !== undefined && !off ? { rank: 1 + counted.filter((s) => s > score).length } : {}),
      ...(off ? { off } : {}),
      ...(p.seconds !== undefined ? { seconds: p.seconds } : {}),
      ...(p.balls ? { balls: p.balls } : {}),
      ...(record ? { record: { rank: record.rank, ...(record.initials ? { initials: record.initials } : {}) } } : {}),
      ...(p.proto ? { proto: p.proto } : {}),
      ...(p.app ? { app: p.app } : {}),
    };
  });
  const { bytes: _bytes, ...table } = game.table;
  const board = boardKey(game.table);
  return { id: game.id, at: game.startAt ?? game.createdAt, endedAt: now.toISOString(), title: game.title, table, ...(board ? { board } : {}), host: game.host, me, players };
}

/** Une partie finie entre à l'historique, à sa place par date ; une seule fois. Vrai si l'historique a changé. */
export function addToHistory(history: GameHistory, game: LiveGame, me: string, now = new Date()): boolean {
  if (history.v !== HISTORY_VERSION || history.games.some((g) => g.id === game.id)) return false;
  const entry = historyEntry(game, me, now);
  if (!entry) return false;
  history.games = [entry, ...history.games].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return true;
}

// ---------------------------------------------------------------------------
// Le fichier

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const isPrint = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isKey = (v: unknown): v is string => typeof v === 'string' && isPlayerPublicKey(v);
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const isCount = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const STATES: readonly LivePlayerState[] = ['invited', 'accepted', 'declined', 'busy', 'expired', 'left', 'loading', 'playing', 'done', 'failed'];
const OFFS: readonly HistoryOff[] = ['multi', 'settings', 'balls'];

function parsePlayer(raw: unknown): HistoryPlayer | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isKey(r.key) || !name || !STATES.includes(r.state as LivePlayerState)) return undefined;
  const rec = r.record as Record<string, unknown> | undefined;
  const record = rec && typeof rec === 'object' && isCount(rec.rank, 99) && rec.rank >= 1 ? { rank: rec.rank, ...(isText(rec.initials, 8) ? { initials: rec.initials } : {}) } : undefined;
  return {
    key: r.key,
    name,
    ...(r.host === true ? { host: true as const } : {}),
    state: r.state as LivePlayerState,
    ...(isCount(r.score) ? { score: r.score } : {}),
    ...(isCount(r.rank, 99) && r.rank >= 1 ? { rank: r.rank } : {}),
    ...(OFFS.includes(r.off as HistoryOff) ? { off: r.off as HistoryOff } : {}),
    ...(isCount(r.seconds, 7 * 24 * 3600) ? { seconds: r.seconds } : {}),
    ...(isBallCount(r.balls) ? { balls: r.balls } : {}),
    ...(record ? { record } : {}),
    ...(isCount(r.proto, 1000) && r.proto >= 1 ? { proto: r.proto } : {}),
    ...(typeof r.app === 'string' && /^\d+\.\d+\.\d+[\w.+-]{0,24}$/.test(r.app) ? { app: r.app } : {}),
  };
}

/** Une partie lue du fichier, vérifiée ; undefined : laissée de côté. */
export function parseHistoryGame(raw: unknown): HistoryGame | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const tr = r.table as Record<string, unknown> | undefined;
  const identity = tr && typeof tr === 'object' ? parseTableIdentity(tr.table) : undefined;
  if (!isId(r.id) || !isIso(r.at) || !isIso(r.endedAt) || !isText(r.title, 160) || !identity?.title || !isKey(r.host) || !isKey(r.me) || !Array.isArray(r.players)) return undefined;
  const players = r.players.slice(0, 8).map(parsePlayer).filter((p): p is HistoryPlayer => !!p);
  if (!players.length) return undefined;
  const table: HistoryGame['table'] = {
    table: identity,
    ...(isText(tr!.version, 60) ? { version: tr!.version } : {}),
    ...(isPrint(tr!.print) ? { print: tr!.print } : {}),
    ...(isPrint(tr!.script) ? { script: tr!.script } : {}),
    ...(isBallCount(tr!.balls) ? { balls: tr!.balls } : {}),
  };
  const board = boardKey(table);
  return { id: r.id, at: r.at, endedAt: r.endedAt, title: r.title, table, ...(board ? { board } : {}), host: r.host, me: r.me, players };
}

/**
 * L'historique gardé sur la borne. Les parties illisibles une à une sont laissées de côté ; un
 * fichier illisible est mis de côté (`setAside`) ; un format plus récent que celui-ci est rendu
 * tel quel (`newer`) : on le montre sans l'enrichir, et addToHistory ne l'écrit pas.
 */
export function loadHistory(file: string, now = new Date()): { history: GameHistory; setAside?: string; newer?: boolean } {
  const { value, setAside } = readKeptJson(file, now);
  if (!value || typeof value !== 'object') return { history: emptyHistory(), ...(setAside ? { setAside } : {}) };
  const raw = value as Record<string, unknown>;
  const v = typeof raw.v === 'number' ? raw.v : HISTORY_VERSION;
  const games = (Array.isArray(raw.games) ? raw.games : [])
    .map(parseHistoryGame)
    .filter((g): g is HistoryGame => !!g)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { history: { v, games }, ...(v > HISTORY_VERSION ? { newer: true } : {}) };
}

export function saveHistory(file: string, history: GameHistory): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.part`, JSON.stringify(history, null, 1) + '\n', 'utf8');
  fs.renameSync(`${file}.part`, file);
}

// ---------------------------------------------------------------------------
// Textes

/** Pourquoi un joueur était hors classement, en clair. */
export function historyOffLabel(p: Pick<HistoryPlayer, 'off' | 'balls'>, hostBalls: number | undefined): string | undefined {
  switch (p.off) {
    case 'multi':
      return t('Hors classement : plus d’un joueur dans sa table');
    case 'settings':
      return t('Hors classement : réglages de l’hôte non reçus');
    case 'balls':
      return p.balls && hostBalls ? t('Hors classement : {balls}', { balls: liveBallsAgainst(p.balls, hostBalls) }) : t('Hors classement : autre nombre de billes');
    default:
      return undefined;
  }
}

/** Comment sa partie s'est terminée, quand il ne l'a pas finie ; sans score, une borne en retard le dit. */
export function historyStateLabel(p: Pick<HistoryPlayer, 'state' | 'score' | 'host' | 'proto' | 'app'>): string | undefined {
  switch (p.state) {
    case 'done':
      return p.score === undefined && !p.host && liveBehind(p) ? liveBehindLabel(p) : undefined;
    case 'failed':
      return t('La partie n’a pas démarré de son côté');
    case 'left':
      return t('A quitté la partie');
    default:
      return t('Résultat pas arrivé à temps');
  }
}

/** « 3 joueurs ». */
export const historyPlayersCount = (game: Pick<HistoryGame, 'players'>): string => tn(game.players.length, '{n} joueur', '{n} joueurs');
