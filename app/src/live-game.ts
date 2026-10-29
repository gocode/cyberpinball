// Partie en direct entre amis (packages/core/src/livegame.ts) sur le réseau des bornes
// (social-net.ts) : inviter, répondre, départ commun avec compte à rebours, puis chacun lance
// la table sur sa borne et envoie son résultat. Celui qui invite tient la partie et renvoie la
// salle à tous ; un invité ne parle qu'à lui.
//
// La même version de la table se reconnaît à l'empreinte SHA-256 du .vpx, calculée sans bloquer
// le menu et gardée dans <données>\amis\empreintes.json (par chemin, taille et date). Elle vaut
// même quand les deux bornes nomment la table autrement : l'invité calcule celle des tables du
// même jeu et de celles qui ont la taille du .vpx annoncé. L'identifiant de table et les règles
// de score (packages/core/src/vpxid.ts) donnent les deux autres niveaux, « version proche » et
// « autre version » ; ils sont gardés dans <données>\amis\identifiants.json.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un réseau d'essai.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  answerGame,
  applyRoom,
  closeIfDone,
  countdownFrom,
  expireInvites,
  gameStatus,
  guestGame,
  inviteExpired,
  inviteToGame,
  liveInvite,
  LIVE_COUNTDOWN_S,
  matchLiveTable,
  newLiveGame,
  readVpxKeys,
  roomMessage,
  rulesKey,
  startGame,
  tableIdentity,
  type LiveGame,
  type LiveInvite,
  type LiveMessage,
  type LiveRecord,
  type LiveStatus,
  type LiveTable,
  type LiveTableMatch,
  type TableEntry,
  type VpxKeys,
} from '@cyberpinball/core';
import type { FriendMessage, SocialNet } from './social-net';

/** Ce que rend une partie lancée : rien si elle n'a pas démarré. */
export interface LivePlayResult {
  ok: boolean;
  seconds: number;
  records: LiveRecord[];
}

export interface LiveGamesOptions {
  net: Pick<SocialNet, 'state' | 'online' | 'send' | 'onMessage'>;
  dataDir: string;
  tables(): readonly TableEntry[];
  romsOf?(table: TableEntry): readonly string[];
  /** Billes par partie d'une de mes tables (ball-count.ts) ; undefined si inconnu. */
  ballsOf?(table: TableEntry): Promise<number | undefined>;
  /**
   * Une invitation est arrivée, au menu comme pendant une partie (seule une partie en direct en
   * cours répond « occupé ») : au joueur de choisir, quitter sa partie ou l'ignorer.
   */
  onInvite?(invite: LiveInvite): void;
  /** C'est parti : lancer la table ; `playing` quand VPX l'affiche. */
  play(table: TableEntry, playing: () => void): Promise<LivePlayResult | undefined>;
  onChange?(): void;
  now?(): Date;
  log?(line: string): void;
}

export interface LiveGames {
  /** La partie où je suis (salon, compte à rebours, partie, résultats). */
  current(): LiveGame | undefined;
  /** Ma table pour la partie en cours. */
  table(): TableEntry | undefined;
  /** Invitations reçues, sans les expirées. */
  invites(): LiveInvite[];
  /** Crée un salon sur cette table (l'empreinte du .vpx se calcule d'abord). */
  create(table: TableEntry): Promise<LiveGame>;
  /** Invite un ami dans mon salon ; false : salon plein, ami pas relié, ou partie déjà partie. */
  invite(key: string, name: string): boolean;
  /** Ce que j'ai de la table d'une invitation. */
  matchFor(invite: LiveInvite): Promise<LiveTableFound>;
  accept(id: string): Promise<LiveTableFound>;
  decline(id: string): void;
  /** Départ commun (celui qui invite). */
  start(): boolean;
  /** Celui qui invite annule ; un invité quitte la partie. */
  leave(): void;
  /** Partie finie ou annulée : on n'en parle plus. */
  close(): void;
  stop(): void;
}

/** Ce que j'ai de la table d'une invitation : le niveau, ma table, et son nombre de billes s'il est connu. */
export interface LiveTableFound {
  match: LiveTableMatch;
  table?: TableEntry;
  balls?: number;
}

/** Vérification des invitations expirées et des retardataires. */
const TICK_MS = 1000;

export function createLiveGames(opts: LiveGamesOptions): LiveGames {
  const now = () => opts.now?.() ?? new Date();
  const net = opts.net;
  const log = (line: string) => opts.log?.(line);
  const me = () => ({ key: net.state().key.publicKey, name: net.state().name });
  let game: LiveGame | undefined;
  let mine: TableEntry | undefined;
  let invites: LiveInvite[] = [];
  let launch: NodeJS.Timeout | undefined;
  const prints = createPrints(path.join(opts.dataDir, 'amis', 'empreintes.json'));
  const tableKeys = createKeys(path.join(opts.dataDir, 'amis', 'identifiants.json'));
  const changed = () => opts.onChange?.();

  const isHost = () => !!game && game.host === me().key;
  const ongoing = () => !!game && game.phase !== 'finished' && game.phase !== 'cancelled';

  /** Celui qui invite : la salle à jour pour chaque invité relié. */
  function broadcastRoom(): void {
    if (!game || !isHost()) return;
    const room = roomMessage(game);
    for (const p of game.players) if (!p.host && p.state !== 'declined' && p.state !== 'busy' && p.state !== 'expired') net.send(p.key, room);
  }

  function setGame(next: LiveGame | undefined): void {
    if (next === game) return;
    game = next;
    broadcastRoom();
    changed();
  }

  function scheduleLaunch(): void {
    if (launch) clearTimeout(launch);
    if (!game?.startAt) return;
    launch = setTimeout(() => void run(), Math.max(0, Date.parse(game.startAt) - now().getTime()));
    launch.unref?.();
  }

  /** Mon état dans la partie : appliqué chez moi si j'invite, envoyé à celui qui invite sinon. */
  function report(state: LiveStatus, result?: LivePlayResult): void {
    if (!game) return;
    const status = { state, ...(result ? { seconds: Math.round(result.seconds), records: result.records } : {}) };
    if (isHost()) setGame(gameStatus(game, me().key, status, now()));
    else {
      net.send(game.host, { t: 'game-status', game: game.id, ...status });
      changed();
    }
  }

  async function run(): Promise<void> {
    launch = undefined;
    if (!game || game.phase === 'cancelled' || !mine) return;
    const id = game.id;
    report('loading');
    const result = await opts.play(mine, () => {
      if (game?.id === id) report('playing');
    });
    if (game?.id !== id) return;
    report(result?.ok ? 'done' : 'failed', result);
  }

  /** Empreinte du fichier, identifiant de table et règles de score d'une de mes tables. */
  async function versionOf(table: TableEntry): Promise<{ print?: string; id?: string; rules?: string }> {
    const [print, keys] = await Promise.all([prints.of(table.file), tableKeys.of(table.file)]);
    const rules = rulesKey(opts.romsOf?.(table) ?? [], keys?.script);
    return { ...(print ? { print } : {}), ...(keys?.id ? { id: keys.id } : {}), ...(rules ? { rules } : {}) };
  }

  async function liveTable(table: TableEntry): Promise<LiveTable> {
    const version = await versionOf(table);
    const bytes = fileSize(table.file);
    const balls = await opts.ballsOf?.(table);
    return { table: tableIdentity(table, opts.romsOf?.(table) ?? []), ...(table.version ? { version: table.version.slice(0, 60) } : {}), ...version, ...(bytes ? { bytes } : {}), ...(balls ? { balls } : {}) };
  }

  async function matchFor(invite: LiveInvite): Promise<LiveTableFound> {
    const candidates = opts.tables().map((table) => ({ entry: table, identity: tableIdentity(table, opts.romsOf?.(table) ?? []) }));
    // Les versions seulement des tables du même jeu, ou de la taille du .vpx annoncé (le même
    // fichier sous un autre nom) : un .vpx se lit en entier.
    const theirs = invite.table;
    const sameGame = (c: (typeof candidates)[number]) => matchLiveTable(theirs, [c]).match !== 'missing';
    const sameSize = (c: (typeof candidates)[number]) => !!theirs.print && !!theirs.bytes && fileSize(c.entry.file) === theirs.bytes;
    const versions = await Promise.all(candidates.filter((c) => sameGame(c) || sameSize(c)).map(async (c) => ({ ...c, ...(await versionOf(c.entry)) })));
    const found = matchLiveTable(theirs, versions);
    const named = [theirs.table.title, theirs.table.manufacturer, theirs.table.year, theirs.table.vpsId && `VPS ${theirs.table.vpsId}`].filter(Boolean).join(', ');
    const level = { same: 'la même table', 'same-rules': 'une version proche, mêmes règles de score', 'other-version': 'une autre version, hors classement', missing: '' }[found.match]; // i18n-ignore : journal
    if (found.match === 'missing') log(`Invitation de ${invite.host.name} : « ${named} » introuvable ici (aucun jeu du même nom, aucun .vpx identique).`); // i18n-ignore : journal
    else if (found.entry) {
      const how = sameGame({ entry: found.entry, identity: tableIdentity(found.entry, opts.romsOf?.(found.entry) ?? []) }) ? '' : ", reconnue par l'empreinte de son .vpx"; // i18n-ignore : journal
      log(`Invitation de ${invite.host.name} : « ${named} » : ${level}${how}, ici « ${found.entry.title} ».`); // i18n-ignore : journal
    }
    const balls = found.entry ? await opts.ballsOf?.(found.entry) : undefined;
    if (balls && theirs.balls && balls !== theirs.balls) log(`Invitation de ${invite.host.name} : ${balls} billes par partie ici, ${theirs.balls} chez lui : score hors classement.`); // i18n-ignore : journal
    return { match: found.match, ...(found.entry ? { table: found.entry } : {}), ...(balls ? { balls } : {}) };
  }

  const unsubscribe = net.onMessage((key: string, message: FriendMessage) => {
    const m = message as LiveMessage;
    switch (m.t) {
      case 'game-invite': {
        const host = { key, name: net.state().friends.find((f) => f.key === key)?.name ?? m.game.players.find((p) => p.key === key)?.name ?? '?' };
        if (ongoing()) {
          net.send(key, { t: 'game-answer', game: m.game.id, answer: 'busy' });
          return;
        }
        const invite = liveInvite(m, host, now());
        invites = [invite, ...invites.filter((i) => i.id !== invite.id && i.host.key !== key)];
        opts.onInvite?.(invite);
        changed();
        return;
      }
      case 'game-answer':
        if (game && isHost() && m.game === game.id) setGame(answerGame(game, key, m.answer, m.match, m.balls));
        return;
      case 'game-room':
        if (game && !isHost() && key === game.host) {
          game = applyRoom(game, m);
          changed();
        }
        return;
      case 'game-start':
        if (game && !isHost() && key === game.host && game.phase === 'gathering') {
          game = countdownFrom(game, m.in, now());
          scheduleLaunch();
          changed();
        }
        return;
      case 'game-status':
        if (game && isHost() && m.game === game.id) setGame(gameStatus(game, key, m, now()));
        return;
      case 'game-cancel':
        // Celui qui invite annule ; un invité, lui, quitte la partie.
        if (game && m.game === game.id && key === game.host && !isHost()) {
          if (launch && game.phase === 'countdown') clearTimeout(launch);
          game = { ...game, phase: 'cancelled' };
          changed();
        } else if (game && isHost() && m.game === game.id) setGame(gameStatus(game, key, { state: 'left' }, now()));
        invites = invites.filter((i) => !(i.id === m.game && i.host.key === key));
        changed();
        return;
      default:
        return;
    }
  });

  const ticker = setInterval(() => {
    if (invites.some((i) => inviteExpired(i, now()))) invites = invites.filter((i) => !inviteExpired(i, now()));
    // Une invitation en attente : son temps restant à l'écran, une fois par seconde.
    if (invites.length) changed();
    if (!game) return;
    if (isHost()) setGame(closeIfDone(expireInvites(game, now()), now()));
    // Compte à rebours à l'écran : une fois par seconde.
    if (game.phase === 'countdown') changed();
  }, TICK_MS);
  ticker.unref?.();

  return {
    current: () => game,
    table: () => mine,
    invites: () => invites.filter((i) => !inviteExpired(i, now())),
    async create(table) {
      if (game && ongoing() && !isHost()) net.send(game.host, { t: 'game-cancel', game: game.id });
      const live = await liveTable(table);
      mine = table;
      setGame(newLiveGame(me(), live, displayTitle(table), now()));
      log(`Partie en direct : salon ouvert sur ${table.title}.`); // i18n-ignore : journal
      return game!;
    },
    invite(key, name) {
      if (!game || !isHost() || !net.online(key)) return false;
      const next = inviteToGame(game, { key, name }, now());
      if (!next) return false;
      const players = next.players.filter((p) => p.state === 'accepted' || p.state === 'invited').map((p) => ({ key: p.key, name: p.name }));
      if (!net.send(key, { t: 'game-invite', game: { id: next.id, table: next.table, title: next.title, players } })) return false;
      setGame(next);
      return true;
    },
    matchFor,
    async accept(id) {
      const invite = invites.find((i) => i.id === id);
      if (!invite) return { match: 'missing' };
      const found = await matchFor(invite);
      invites = invites.filter((i) => i.id !== id);
      if (found.match === 'missing') {
        net.send(invite.host.key, { t: 'game-answer', game: id, answer: 'decline', match: 'missing' });
        changed();
        return found;
      }
      net.send(invite.host.key, { t: 'game-answer', game: id, answer: 'accept', match: found.match, ...(found.balls ? { balls: found.balls } : {}) });
      mine = found.table;
      game = guestGame(invite, me(), found.match, found.balls);
      changed();
      return found;
    },
    decline(id) {
      const invite = invites.find((i) => i.id === id);
      invites = invites.filter((i) => i.id !== id);
      if (invite) net.send(invite.host.key, { t: 'game-answer', game: id, answer: 'decline' });
      changed();
    },
    start() {
      if (!game || !isHost()) return false;
      const next = startGame(game, now());
      if (next === game) return false;
      for (const p of next.players) if (!p.host && p.state === 'accepted') net.send(p.key, { t: 'game-start', game: next.id, in: LIVE_COUNTDOWN_S * 1000 });
      setGame(next);
      scheduleLaunch();
      return true;
    },
    leave() {
      if (!game) return;
      if (launch) clearTimeout(launch);
      launch = undefined;
      if (isHost()) {
        // Partie déjà partie : chacun finit la sienne, les résultats arrivent quand même.
        if (game.phase === 'gathering' || game.phase === 'countdown') {
          for (const p of game.players) if (!p.host) net.send(p.key, { t: 'game-cancel', game: game.id });
          game = { ...game, phase: 'cancelled' };
        }
      } else if (ongoing()) net.send(game.host, { t: 'game-cancel', game: game.id });
      game = undefined;
      mine = undefined;
      changed();
    },
    close() {
      if (game && ongoing()) return;
      game = undefined;
      mine = undefined;
      changed();
    },
    stop() {
      unsubscribe();
      clearInterval(ticker);
      if (launch) clearTimeout(launch);
    },
  };
}

function fileSize(file: string): number | undefined {
  try {
    return fs.statSync(file).size;
  } catch {
    return undefined;
  }
}

function displayTitle(table: TableEntry): string {
  const base = table.manufacturer && table.year ? `${table.title} (${table.manufacturer} ${table.year})` : table.title;
  return base.slice(0, 160);
}

/** Empreintes SHA-256 des .vpx, gardées par chemin, taille et date de modification. */
function createPrints(file: string): { of(vpx: string): Promise<string | undefined> } {
  return createFileCache(file, async (vpx) => {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(vpx, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) hash.update(chunk);
    return hash.digest('hex');
  });
}

/** Identifiant de table et empreinte du script (vpxid.ts), gardés de même. */
function createKeys(file: string): { of(vpx: string): Promise<VpxKeys | undefined> } {
  return createFileCache(file, async (vpx) => {
    const keys = await readVpxKeys(vpx);
    return keys.id ? keys : undefined;
  });
}

/** Ce qu'on calcule d'un .vpx, une fois par fichier (chemin, taille et date de modification). */
function createFileCache<T>(file: string, compute: (vpx: string) => Promise<T | undefined>): { of(vpx: string): Promise<T | undefined> } {
  let cache: Record<string, T> | undefined;
  const running = new Map<string, Promise<T | undefined>>();
  const load = () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, T>;
    } catch {
      cache = {};
    }
    return cache;
  };
  return {
    of(vpx) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(vpx);
      } catch {
        return Promise.resolve(undefined);
      }
      const key = `${vpx.toLowerCase()}|${stat.size}|${Math.round(stat.mtimeMs)}`;
      const known = load()[key];
      if (known) return Promise.resolve(known);
      const already = running.get(key);
      if (already) return already;
      const work = (async () => {
        try {
          const value = await compute(vpx);
          if (value === undefined) return undefined;
          const all = load();
          // Une seule valeur par fichier : l'ancienne (autre taille ou date) s'en va.
          for (const k of Object.keys(all)) if (k.startsWith(`${vpx.toLowerCase()}|`)) delete all[k];
          all[key] = value;
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, JSON.stringify(all, null, 1) + '\n', 'utf8');
          return value;
        } catch {
          return undefined;
        } finally {
          running.delete(key);
        }
      })();
      running.set(key, work);
      return work;
    },
  };
}
