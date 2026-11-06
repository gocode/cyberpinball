// Partie en direct entre amis (packages/core/src/livegame.ts) sur le réseau des bornes
// (social-net.ts) : inviter, répondre, départ commun avec compte à rebours, puis chacun lance
// la table sur sa borne et envoie son résultat. Celui qui invite tient la partie et renvoie la
// salle à tous ; un invité ne parle qu'à lui.
//
// La même version de la table se reconnaît à l'empreinte SHA-256 du .vpx, calculée sans bloquer
// le menu et gardée dans <données>\amis\empreintes.json (par chemin, taille et date). Elle vaut
// même quand les deux bornes nomment la table autrement : l'invité calcule celle des tables du
// même jeu et de celles qui ont la taille du .vpx annoncé. Le script joué compte aussi : un .vbs
// posé à côté de la table qui remplace son script (scriptPrint), sauf celui de Cyber Pinball.
//
// Les réglages de celui qui invite (packages/core/src/hostsettings.ts) partent vers chaque invité
// qui accepte ; l'invité les vérifie, le dit (game-settings-ok), et les passe au lancement, qui les
// pose dans le double de sa table.
//
// Départ commun (packages/core/src/livestart.ts) : chaque borne lance sa table, dit « prêt » quand
// elle est chargée (LiveStartGate.ready), et son relevé ne met le crédit et n'appuie sur Start
// qu'au « partez » de l'hôte (LiveStartGate.go), donné quand tous sont prêts.
//
// Connexion qui tombe et revient (essai réel du 01/11/2026) : rien du départ ne dépend d'un message
// unique. L'hôte renvoie la salle (« partez » compris) toutes les LIVE_RESEND_MS pendant la partie, et
// tout de suite à un invité revenu en ligne ; l'invité renvoie son état tant que la salle ne le montre
// pas (liveStatusBehind). Le journal dit chaque message du départ envoyé, reçu ou renvoyé. De même
// avant le départ (essai réel du 04/11/2026, parties à la suite) : l'hôte renvoie l'invitation tant
// que l'invité n'a pas répondu ; une invitation déjà reçue ne sonne pas deux fois, et celle à laquelle
// on a déjà répondu fait repartir la même réponse.
//
// Chaque fin d'invitation arrive aux deux bornes (essai réel du 04/11/2026 : « celui qui a invité
// peut attendre longtemps », « l'invité n'apprend pas que l'invitation est annulée ») : la réponse
// de l'invité repart à chaque renvoi de l'invitation ; celui qui invite dit pourquoi elle prend fin
// sans réponse (game-cancel `why` : annulée, partie lancée sans lui, changée de table, expirée, vu
// hors ligne) et le renvoie jusqu'à l'accusé de réception (game-cancel-ok) ou la fin des deux
// minutes ; une réponse arrivée trop tard reçoit cette fin en retour (lateAnswerEnd). Chacun
// constate aussi seul l'expiration et le départ de l'autre hors ligne. L'invité garde la fin de
// chaque invitation (inviteEnd) : son écran et sa notification la disent.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un réseau d'essai.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  addToHistory,
  answerGame,
  applyRoom,
  closeIfDone,
  addGameToBoard,
  boardFor,
  countdownFrom,
  countdownLeft,
  dropOfflineInvites,
  lateAnswerEnd,
  livePlayers,
  createSettingsReceiver,
  expireInvites,
  gameStatus,
  giveGo,
  liveGoDue,
  liveGuestGo,
  liveStatusBehind,
  liveWaitView,
  LIVE_RESEND_MS,
  guestGame,
  inviteExpired,
  inviteToGame,
  liveInvite,
  loadBoards,
  loadHistory,
  LIVE_COUNTDOWN_S,
  LIVE_ANSWER_SHOW_MS,
  LIVE_INVITE_MS,
  LIVE_PROTOCOL,
  matchLiveTable,
  newLiveGame,
  readVpxScript,
  roomMessage,
  scriptPatchState,
  settingsMessages,
  saveBoards,
  saveHistory,
  settingsReceived,
  startGame,
  tableIdentity,
  type GroupBoards,
  type GameHistory,
  type GroupRecord,
  type HistoryGame,
  type HostSetting,
  type LiveGame,
  type LiveInvite,
  type LiveInviteEnd,
  type LiveInviteEndInfo,
  type LiveManualReason,
  type LiveMessage,
  type LiveRecord,
  type LiveStatus,
  type LiveTable,
  type LiveTableMatch,
  type LiveWaitView,
  type TableEntry,
} from '@cyberpinball/core';
import type { FriendMessage, SocialNet } from './social-net';

/** Ce que rend une partie lancée : rien si elle n'a pas démarré. */
export interface LivePlayResult {
  ok: boolean;
  seconds: number;
  records: LiveRecord[];
  /** Score final lu en direct (livestate.ts), même s'il n'est pas entré au tableau de la table. */
  score?: number;
  /** Plus d'un joueur dans la table : hors classement. */
  multi?: boolean;
}

/**
 * Le départ commun, vu de la partie lancée (livestart.ts) : `ready`, ma table est chargée (le relevé
 * répond, ou sans relevé : la table à l'écran) ; `go`, « partez » est donné pour ma borne : le
 * fichier du double est à poser (vrai une fois pour toutes).
 */
export interface LiveStartGate {
  /** `manual` : ma table n'a pas de relevé (départ manuel, pas de score en direct) ; l'hôte le saura, et les résultats le diront. */
  ready(opts?: { manual?: boolean }): void;
  go(): boolean;
}

/** Où en est le joueur, d'après le relevé posé dans le script du double (livestate.ts). */
export interface LiveProgress {
  score: number;
  ball: number;
  balls: number;
  players: number;
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
  /** Réglages de ma table à envoyer aux invités (readHostSettings) ; undefined : trop gros pour voyager. */
  settingsOf?(table: TableEntry): HostSetting[] | undefined;
  /**
   * Ma table aura-t-elle un relevé de l'état de jeu (liveStateSupport) ? Sans : départ manuel, pas de
   * score en direct, et pourquoi ; dit avant la partie (choix, salon, invitation). undefined : elle en a un, ou inconnu.
   */
  manualOf?(table: TableEntry): Promise<LiveManualReason | undefined>;
  /**
   * C'est parti : lancer la table ; `playing` quand VPX l'affiche ; `settings` : ceux de l'hôte,
   * reçus (invité) ; `board` : les records du groupe sur cette version, à poser dans le double.
   */
  play(table: TableEntry, playing: () => void, settings?: HostSetting[], board?: GroupRecord[], progress?: (p: LiveProgress) => void, gate?: LiveStartGate): Promise<LivePlayResult | undefined>;
  onChange?(): void;
  now?(): Date;
  log?(line: string): void;
  /** Version de Cyber Pinball de cette borne (app.getVersion()), annoncée aux autres. */
  appVersion?: string;
}

export interface LiveGames {
  /** La partie où je suis (salon, compte à rebours, partie, résultats). */
  current(): LiveGame | undefined;
  /** Les records du groupe sur la version de la table de la partie en cours (groupboard.ts). */
  board(): GroupRecord[];
  /** Les parties entre amis finies, gardées sur la borne, de la plus récente à la plus ancienne (gamehistory.ts). */
  history(): readonly HistoryGame[];
  /** Ma table pour la partie en cours. */
  table(): TableEntry | undefined;
  /** Version stricte d'une de mes tables (empreintes du .vpx et du script joué), celle qu'annonce une invitation. */
  versionOf(table: TableEntry): Promise<{ print?: string; script?: string }>;
  /** Taille du .vpx d'une de mes tables ; undefined : illisible. */
  bytesOf(table: TableEntry): number | undefined;
  /** Une de mes tables sans relevé de l'état de jeu : pourquoi (départ manuel, pas de score en direct) ; undefined : elle en a un, ou inconnu. */
  manualOf(table: TableEntry): Promise<LiveManualReason | undefined>;
  /** L'attente du départ commun, pendant que ma table est lancée (livestart.ts) ; `manual` : ma table n'a pas de relevé. */
  waitView(opts?: { manual?: boolean }): LiveWaitView | undefined;
  /** Invitations reçues, sans les expirées. */
  invites(): LiveInvite[];
  /** Comment cette invitation reçue a pris fin (`next` : la nouvelle invitation qui la remplace) ; undefined : en cours, ou inconnue. */
  inviteEnd(id: string): (LiveInviteEndInfo & { next?: string }) | undefined;
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
  /** Celui qui invite annule (`replacedFor` : ces invités reçoivent tout de suite une autre invitation) ; un invité quitte la partie. */
  leave(opts?: { replacedFor?: readonly string[] }): void;
  /** Partie finie ou annulée : on n'en parle plus. */
  close(): void;
  stop(): void;
}

/** Ce que j'ai de la table d'une invitation : le niveau, ma table, et son nombre de billes s'il est connu. */
export interface LiveTableFound {
  match: LiveTableMatch;
  table?: TableEntry;
  balls?: number;
  /** Le même .vpx, mais un autre script joué (un .vbs à côté de la table). */
  scriptDiffers?: boolean;
  /** Ma table n'aura pas de relevé de l'état de jeu : départ manuel, pas de score en direct, et pourquoi. */
  manual?: LiveManualReason;
  /** L'invitation a pris fin pendant la vérification de la table (annulée, expirée…) : rien n'est parti (inviteEnd dit pourquoi). */
  gone?: true;
}

/** Vérification des invitations expirées et des retardataires. */
const TICK_MS = 1000;
/** Une invitation sans réponse repart à ce rythme : l'invité la lit peut-être encore, elle ne sonne pas deux fois. */
const INVITE_RESEND_MS = 10_000;

export function createLiveGames(opts: LiveGamesOptions): LiveGames {
  const now = () => opts.now?.() ?? new Date();
  const net = opts.net;
  const log = (line: string) => opts.log?.(line);
  const me = () => ({ key: net.state().key.publicKey, name: net.state().name });
  // Ce que sait faire cette borne, annoncé à l'invitation et à la réponse : une borne en retard se voit (liveBehind).
  const version = { proto: LIVE_PROTOCOL, ...(opts.appVersion ? { app: opts.appVersion } : {}) };
  let game: LiveGame | undefined;
  let mine: TableEntry | undefined;
  let invites: LiveInvite[] = [];
  /** Invité : comment chaque invitation reçue a pris fin, les plus récentes (inviteEnd). */
  const ended = new Map<string, LiveInviteEndInfo & { next?: string; host: string }>();
  /** Celui qui invite : chaque fin d'invitation dite à un invité, renvoyée jusqu'à son accusé de réception ou `until`. */
  const ends = new Map<string, { to: string; name: string; message: Extract<LiveMessage, { t: 'game-cancel' }>; at: number; until: number }>();
  /** Invité : ma réponse à chaque invitation (par partie), renvoyée si l'hôte réinvite ; les plus récentes seulement. */
  const answers = new Map<string, Extract<LiveMessage, { t: 'game-answer' }>>();
  const answerKey = (game: string, round: number | undefined) => `${game}:${round ?? 0}`;
  const answer = (to: string, message: Extract<LiveMessage, { t: 'game-answer' }>, round: number | undefined) => {
    answers.set(answerKey(message.game, round), message);
    if (answers.size > 20) answers.delete(answers.keys().next().value!);
    net.send(to, message);
  };
  let launch: NodeJS.Timeout | undefined;
  /** Invité : la réception des réglages de l'hôte, puis ces réglages, vérifiés. */
  let receiver: ReturnType<typeof createSettingsReceiver> | undefined;
  let hostSettings: HostSetting[] | undefined;
  /** Ma table lancée pour la partie `id` : quand elle a été prête (ms), « partez » reçu, partie démarrée. */
  let running: { id: string; readyAt?: number; released: boolean; started: boolean } | undefined;
  /**
   * Ce que le service retient d'une partie, rangé sous son identifiant : une autre partie en a un
   * neuf, rien n'y passe de la précédente (essai réel du 04/11/2026 : trois parties à la suite).
   */
  let perGame = freshGameState('');
  const own = (): GameState => {
    const id = game?.id ?? '';
    if (perGame.id !== id) perGame = freshGameState(id);
    return perGame;
  };
  /** La carte de l'attente avait quelque chose à montrer au dernier tour : sa fin aussi doit être portée (essai réel du 01/11/2026). */
  let waitWas = false;
  const strict = createTableVersions(opts.dataDir);
  // Le tableau du groupe : chaque partie finie y entre, une fois (groupboard.ts).
  const boardsFile = path.join(opts.dataDir, 'amis', 'records.json');
  let boards: GroupBoards | undefined;
  const loadedBoards = () => (boards ??= loadBoards(boardsFile, (where) => log(`Partie en direct : tableau du groupe illisible, mis de côté (${where}).`))); // i18n-ignore : journal
  // L'historique : chaque partie finie, une fois, avec chaque joueur (gamehistory.ts).
  const historyFile = path.join(opts.dataDir, 'amis', 'parties.json');
  let history: GameHistory | undefined;
  const loadedHistory = () => {
    if (history) return history;
    const loaded = loadHistory(historyFile, now());
    if (loaded.setAside) log(`Partie en direct : historique des parties illisible, mis de côté (${loaded.setAside}).`); // i18n-ignore : journal
    if (loaded.newer) log(`Partie en direct : historique des parties d'un format plus récent (${loaded.history.v}) : montré, plus complété.`); // i18n-ignore : journal
    return (history = loaded.history);
  };
  const remember = () => {
    if (game?.phase !== 'finished') return;
    if (addGameToBoard(loadedBoards(), game, now())) {
      try {
        saveBoards(boardsFile, loadedBoards());
        log(`Partie en direct : résultats de « ${game.title} » au tableau du groupe.`); // i18n-ignore : journal
      } catch (error) {
        log(`Partie en direct : tableau du groupe non enregistré (${(error as Error).message}).`); // i18n-ignore : journal
      }
    }
    if (addToHistory(loadedHistory(), game, me().key, now())) {
      try {
        saveHistory(historyFile, loadedHistory());
        log(`Partie en direct : « ${game.title} » à l'historique des parties.`); // i18n-ignore : journal
      } catch (error) {
        log(`Partie en direct : historique des parties non enregistré (${(error as Error).message}).`); // i18n-ignore : journal
      }
    }
  };
  const changed = () => {
    remember();
    opts.onChange?.();
  };

  const isHost = () => !!game && game.host === me().key;
  const ongoing = () => !!game && game.phase !== 'finished' && game.phase !== 'cancelled';

  /** Invité : cette invitation reçue prend fin (sans ma réponse, ou par elle) ; son écran et sa notification le diront. */
  function endInvite(invite: LiveInvite, why: LiveInviteEnd | 'answered', next?: string): void {
    invites = invites.filter((i) => i.id !== invite.id);
    ended.set(invite.id, { why, name: invite.host.name, title: invite.title, host: invite.host.key, ...(next ? { next } : {}) });
    if (ended.size > 20) ended.delete(ended.keys().next().value!);
    if (why !== 'answered') log(`Partie en direct : invitation de ${invite.host.name} (« ${invite.title} ») terminée : ${why}.`); // i18n-ignore : journal
  }

  /** Celui qui invite : la fin de son invitation dite à cet invité, renvoyée tant qu'il ne l'a pas reçue (ticker). */
  function tellEnd(to: string, name: string, id: string, why: LiveInviteEnd): void {
    const message: Extract<LiveMessage, { t: 'game-cancel' }> = { t: 'game-cancel', game: id, why };
    const sent = net.send(to, message);
    ends.set(`${to}|${id}`, { to, name, message, at: now().getTime(), until: now().getTime() + LIVE_INVITE_MS });
    log(`Partie en direct : fin de l'invitation dite à ${name} (${why})${sent ? '' : ', hors ligne : redite à son retour'}.`); // i18n-ignore : journal
  }

  /** Celui qui invite : les invitations de cette partie qui passent de « invité » à une fin sans réponse, dites à chacun. */
  function tellEnds(before: LiveGame, after: LiveGame, why: (p: LiveGame['players'][number]) => LiveInviteEnd): void {
    for (const p of after.players) {
      const was = before.players.find((x) => x.key === p.key);
      if (was?.state === 'invited' && p.state === 'expired') tellEnd(p.key, p.name, after.id, why(p));
    }
  }

  /** Celui qui invite : la salle à jour pour chaque invité relié. */
  function broadcastRoom(only?: string): void {
    if (!game || !isHost()) return;
    const room = roomMessage(game, now());
    if (!only) own().roomSentAt = now().getTime();
    for (const p of game.players) {
      if (p.host || p.state === 'declined' || p.state === 'busy' || p.state === 'expired' || (only && p.key !== only)) continue;
      const sent = net.send(p.key, room);
      // Le journal : « partez » porté à chacun, la première fois (et s'il n'a pas pu partir).
      if (room.go && !own().goSentTo.has(p.key)) {
        if (sent) own().goSentTo.add(p.key);
        log(`Départ commun : « partez » ${sent ? 'envoyé' : 'NON envoyé (hors ligne : renvoyé à son retour)'} à ${p.name}.`); // i18n-ignore : journal
      }
    }
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
    // Pour cette partie seulement : une autre, ouverte d'ici là, ne part pas à son heure.
    const id = game.id;
    launch = setTimeout(() => void (game?.id === id && run()), Math.max(0, Date.parse(game.startAt) - now().getTime()));
    launch.unref?.();
  }

  /** Mon état dans la partie : appliqué chez moi si j'invite, envoyé à celui qui invite sinon. */
  function report(state: LiveStatus, result?: LivePlayResult, live?: LiveProgress, ready?: boolean): void {
    if (!game) return;
    const status = {
      state,
      ...(ready ? { ready: true as const } : {}),
      ...(result ? { seconds: Math.round(result.seconds), records: result.records } : {}),
      ...(result?.score !== undefined ? { score: result.score } : {}),
      ...(live ? { score: live.score, ball: live.ball, ...(live.balls ? { balls: live.balls } : {}) } : {}),
      ...(result?.multi || (live && live.players > 1) ? { multi: true as const } : {}),
      ...(own().manual ? { manual: true as const } : {}),
    };
    if (isHost()) {
      setGame(gameStatus(game, me().key, status, now()));
      maybeGo();
    } else {
      // « prêt » garde son drapeau tant que ma table attend : un renvoi le redit.
      const kept = own().lastStatus?.status.ready && state === 'loading' ? { ...status, ready: true as const } : status;
      own().lastStatus = { status: kept, at: now().getTime() };
      const sent = net.send(game.host, { t: 'game-status', game: game.id, ...kept });
      // Le score en partie part souvent : seuls les messages du départ et le retour vont au journal.
      if (ready || state !== 'playing' || result || !sent) log(`Départ commun : mon état « ${ready ? 'prêt' : state} » ${sent ? 'envoyé' : 'NON envoyé (hôte hors ligne : renvoyé à son retour)'} à l'hôte.`); // i18n-ignore : journal
      changed();
    }
  }

  /** Invité : mon état renvoyé à l'hôte, tant que sa salle ne le montre pas (message perdu pendant une coupure). */
  function resendStatus(why: 'salle' | 'tour' | 'retour'): void {
    const lastStatus = own().lastStatus;
    if (!game || isHost() || !lastStatus || game.phase === 'finished' || game.phase === 'cancelled') return;
    if (!liveStatusBehind(game.players.find((p) => p.key === me().key), lastStatus.status)) return;
    if (why !== 'retour' && now().getTime() - lastStatus.at < LIVE_RESEND_MS) return;
    lastStatus.at = now().getTime();
    const sent = net.send(game.host, { t: 'game-status', game: game.id, ...lastStatus.status });
    const what = lastStatus.status.ready && lastStatus.status.state === 'loading' ? 'prêt' : lastStatus.status.state; // i18n-ignore : journal
    log(`Départ commun : mon état « ${what} » renvoyé à l'hôte (${why === 'retour' ? 'hôte revenu en ligne' : 'sa salle ne le montre pas'})${sent ? '' : ', sans succès'}.`); // i18n-ignore : journal
  }

  /** L'hôte : « partez », quand tous sont prêts ou que le délai des derniers est passé. */
  function maybeGo(): void {
    if (!game || !isHost()) return;
    const why = liveGoDue(game, now());
    if (!why) return;
    const next = giveGo(game, why, now());
    const late = next.players.filter((p) => next.goLate?.includes(p.key)).map((p) => p.name);
    log(`Partie en direct : « partez » donné (${late.length ? `sans ${late.join(', ')}, pas prêts à temps` : 'tous prêts'}).`); // i18n-ignore : journal
    setGame(next);
  }

  /**
   * « Partez » pour ma borne : donné par l'hôte ; ou, invité, sans attendre un hôte d'une version
   * sans départ commun ou resté muet ; ou la partie n'est plus (annulée : ma table n'attend pas pour
   * rien). Ma table prête, la partie est partie de mon côté.
   */
  function released(): boolean {
    const run = running;
    if (!run || run.released) return true;
    if (!game || game.id !== run.id || game.phase === 'cancelled') {
      log('Partie en direct : partie annulée pendant l’attente du départ, la table part seule.'); // i18n-ignore : journal
      run.released = true;
      return true;
    }
    const guestWhy = !isHost() && run.readyAt !== undefined ? liveGuestGo(game, run.readyAt, now()) : undefined;
    if (guestWhy) {
      log(`Partie en direct : départ sans attendre ${guestWhy === 'host-behind' ? 'les autres, l’hôte a une version sans départ commun' : 'l’hôte, plus aucune nouvelle de lui'}.`); // i18n-ignore : journal
      game = giveGo(game, guestWhy, now());
      changed();
    }
    if (!game.goAt) return false;
    run.released = true;
    if (run.readyAt !== undefined) started();
    return true;
  }

  /** Ma table prête et « partez » donné : partie de mon côté (le score arrive avec le relevé). */
  function started(): void {
    if (!running || running.started) return;
    running.started = true;
    report('playing');
  }

  async function run(): Promise<void> {
    launch = undefined;
    if (!game || game.phase === 'cancelled' || !mine) return;
    const id = game.id;
    const run: NonNullable<typeof running> = { id, released: false, started: false };
    running = run;
    report('loading');
    const gate: LiveStartGate = {
      ready: (o) => {
        if (game?.id !== id || run.readyAt !== undefined) return;
        run.readyAt = now().getTime();
        if (o?.manual) own().manual = true;
        log(`Partie en direct : ma table est prête${o?.manual ? ' (sans relevé : départ manuel, pas de score en direct)' : ''}.`); // i18n-ignore : journal
        if (run.released) started();
        else report('loading', undefined, undefined, true);
        released();
      },
      go: () => (running === run ? released() : true),
    };
    // Le score et la bille partent vers les autres à chaque changement, au plus deux fois par seconde ;
    // une nouvelle bille ou un joueur en trop, tout de suite.
    let sent: LiveProgress | undefined;
    let sentAt = 0;
    const progress = (p: LiveProgress) => {
      if (game?.id !== id || game.phase === 'finished' || game.phase === 'cancelled') return;
      const changedBall = !sent || sent.ball !== p.ball || (sent.players > 1) !== (p.players > 1);
      if (sent && sent.score === p.score && !changedBall) return;
      if (!changedBall && now().getTime() - sentAt < 500) return;
      sent = p;
      sentAt = now().getTime();
      run.started = true;
      report('playing', undefined, p);
    };
    // Ce qui suit la partie (badges, statistiques…) peut échouer : la partie jouée compte quand même, et
    // l'hôte reçoit toujours mon retour (essai réel du 01/11/2026 : une écriture refusée après la partie
    // avait interrompu run() avant son résultat ; l'hôte l'attendait encore).
    let result: LivePlayResult | undefined;
    try {
      result = await opts.play(
        mine,
        // VPX montre la table : partie démarrée seulement si « partez » était déjà là (sinon, au signal).
        () => {
          if (game?.id === id && run.released && run.readyAt !== undefined) started();
        },
        isHost() ? undefined : hostSettings,
        boardFor(loadedBoards(), game.table),
        progress,
        gate,
      );
    } catch (error) {
      log(`Partie en direct : fin de partie en erreur (${(error as Error).message}) ; mon retour part quand même.`); // i18n-ignore : journal
      result = { ok: run.started, seconds: run.readyAt !== undefined ? (now().getTime() - run.readyAt) / 1000 : 0, records: [] };
    }
    if (running === run) running = undefined;
    if (game?.id !== id) return;
    // Quitté pendant l'attente du départ (table prête, jamais partie) : il n'a pas joué, les autres ne l'attendent plus.
    if (result && run.readyAt !== undefined && !run.started && result.score === undefined) report('left', result);
    else report(result?.ok ? 'done' : 'failed', result);
  }

  const versionOf = (table: TableEntry) => strict.of(table);
  const manualOf = async (table: TableEntry): Promise<LiveManualReason | undefined> => {
    try {
      return await opts.manualOf?.(table);
    } catch {
      return undefined;
    }
  };

  async function liveTable(table: TableEntry): Promise<LiveTable> {
    const version = await versionOf(table);
    const bytes = fileSize(table.file);
    const balls = await opts.ballsOf?.(table);
    const manual = await manualOf(table);
    if (manual) log(`Partie en direct : ${table.title} n'aura pas de relevé de l'état de jeu (${manual}) : départ manuel, pas de score en direct, dit aux invités.`); // i18n-ignore : journal
    return { table: tableIdentity(table, opts.romsOf?.(table) ?? []), ...(table.version ? { version: table.version.slice(0, 60) } : {}), ...version, ...(bytes ? { bytes } : {}), ...(balls ? { balls } : {}), ...(manual ? { manual } : {}) };
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
    const level = found.match === 'same' ? 'la même version' : found.scriptDiffers ? 'le même .vpx, mais un autre script (.vbs à côté de la table) : partie refusée' : 'une autre version : partie refusée'; // i18n-ignore : journal
    if (found.match === 'missing') log(`Invitation de ${invite.host.name} : « ${named} » introuvable ici (aucun jeu du même nom, aucun .vpx identique).`); // i18n-ignore : journal
    else if (found.entry) {
      const how = sameGame({ entry: found.entry, identity: tableIdentity(found.entry, opts.romsOf?.(found.entry) ?? []) }) ? '' : ", reconnue par l'empreinte de son .vpx"; // i18n-ignore : journal
      log(`Invitation de ${invite.host.name} : « ${named} » : ${level}${how}, ici « ${found.entry.title} ».`); // i18n-ignore : journal
    }
    const balls = found.entry ? await opts.ballsOf?.(found.entry) : undefined;
    if (balls && theirs.balls && balls !== theirs.balls) log(`Invitation de ${invite.host.name} : ${balls} billes par partie ici, ${theirs.balls} chez lui : score hors classement.`); // i18n-ignore : journal
    const manual = found.entry && found.match === 'same' ? await manualOf(found.entry) : undefined;
    if (manual) log(`Invitation de ${invite.host.name} : ma table n'aura pas de relevé de l'état de jeu (${manual}) : départ manuel, pas de score en direct.`); // i18n-ignore : journal
    return { match: found.match, ...(found.entry ? { table: found.entry } : {}), ...(balls ? { balls } : {}), ...(found.scriptDiffers ? { scriptDiffers: true } : {}), ...(manual ? { manual } : {}) };
  }

  /** Hôte : mes réglages vers un invité qui accepte ; trop gros pour voyager, il jouera hors classement. */
  function sendSettings(key: string, id: string, table: TableEntry): void {
    if (!opts.settingsOf) return;
    const settings = opts.settingsOf(table);
    if (!settings) {
      log(`Partie en direct : réglages de ${table.title} trop gros pour voyager, ${key} jouera hors classement.`); // i18n-ignore : journal
      if (game) setGame(settingsReceived(game, key, false));
      return;
    }
    for (const message of settingsMessages(id, settings)) net.send(key, message);
  }

  const unsubscribe = net.onMessage((key: string, message: FriendMessage) => {
    const m = message as LiveMessage;
    switch (m.t) {
      case 'game-invite': {
        const host = { key, name: net.state().friends.find((f) => f.key === key)?.name ?? m.game.players.find((p) => p.key === key)?.name ?? '?' };
        // Renvoyée par l'hôte (ma réponse perdue, ou la sienne en route) : la même réponse repart, rien ne sonne.
        const answered = answers.get(answerKey(m.game.id, m.round));
        if (answered) {
          log(`Partie en direct : invitation de ${host.name} renvoyée, déjà répondue (${answered.answer}) : réponse renvoyée.`); // i18n-ignore : journal
          net.send(key, answered);
          return;
        }
        if (invites.some((i) => i.id === m.game.id && i.host.key === key && i.round === m.round)) return;
        // Le journal dit chaque invitation reçue, et le refus d'office : une partie qui ne part pas se comprend.
        if (ongoing()) {
          log(`Partie en direct : invitation de ${host.name} (« ${m.game.title} ») refusée d'office : déjà dans la partie ${game!.id} (${game!.phase}).`); // i18n-ignore : journal
          net.send(key, { t: 'game-answer', game: m.game.id, answer: 'busy' });
          return;
        }
        log(`Partie en direct : invitation reçue de ${host.name} (« ${m.game.title} », partie ${m.game.id}).`); // i18n-ignore : journal
        const invite = liveInvite(m, host, now());
        // Le même hôte, une autre partie (il a changé de table) : l'ancienne invitation prend fin, la nouvelle la remplace.
        for (const old of invites.filter((i) => i.id !== invite.id && i.host.key === key)) endInvite(old, 'replaced', invite.id);
        // « Changée de table » déjà dit par l'hôte (game-cancel avant la nouvelle) : elle mène à celle-ci.
        for (const e of ended.values()) if (e.host === key && e.why === 'replaced' && !e.next) e.next = invite.id;
        invites = [invite, ...invites.filter((i) => i.id !== invite.id && i.host.key !== key)];
        opts.onInvite?.(invite);
        changed();
        return;
      }
      case 'game-answer': {
        // Trop tard (invitation annulée, partie lancée, expirée, vu hors ligne) : il l'apprend, plutôt qu'attendre un départ qui ne viendra pas.
        const late = !game || !isHost() || m.game !== game.id ? 'cancelled' : lateAnswerEnd(game, m.game, key);
        if (late) {
          if (m.answer === 'accept' && !ends.has(`${key}|${m.game}`)) tellEnd(key, net.state().friends.find((f) => f.key === key)?.name ?? key, m.game, late);
          else if (m.answer === 'accept') net.send(key, ends.get(`${key}|${m.game}`)!.message);
          return;
        }
        if (!game || !isHost()) return;
        const before = game.players.find((p) => p.key === key)?.state;
        if (m.answer === 'busy') log(`Partie en direct : ${game.players.find((p) => p.key === key)?.name ?? key} occupé, invitation refusée d'office.`); // i18n-ignore : journal
        if (before === 'invited') log(`Partie en direct : ${game.players.find((p) => p.key === key)?.name ?? key} a répondu « ${m.answer} ».`); // i18n-ignore : journal
        setGame(answerGame(game, key, m.answer, m.match, m.balls, { ...(m.proto ? { proto: m.proto } : {}), ...(m.app ? { app: m.app } : {}) }, now()));
        // Il vient d'accepter : mes réglages partent vers lui, à poser dans le double de sa table.
        if (before === 'invited' && game.players.find((p) => p.key === key)?.state === 'accepted' && mine) sendSettings(key, game.id, mine);
        return;
      }
      case 'game-settings-ok':
        if (game && isHost() && m.game === game.id) {
          log(`Partie en direct : réglages ${m.ok ? 'reçus' : 'NON reçus'} par ${game.players.find((p) => p.key === key)?.name ?? key}.`); // i18n-ignore : journal
          setGame(settingsReceived(game, key, m.ok));
        }
        return;
      case 'game-settings':
      case 'game-settings-part': {
        if (!game || isHost() || key !== game.host || m.game !== game.id || !receiver) return;
        const done = receiver.take(m);
        if (!done) return;
        receiver = undefined;
        hostSettings = done.ok ? done.settings : undefined;
        log(`Partie en direct : réglages de l'hôte ${done.ok ? `reçus (${done.settings.filter((x) => x.data).map((x) => x.rel).join(', ') || 'aucun fichier : réglages d’usine'})` : 'abîmés en route : partie hors classement'}.`); // i18n-ignore : journal
        net.send(game.host, { t: 'game-settings-ok', game: game.id, ok: done.ok });
        changed();
        return;
      }
      case 'game-room':
        if (game && !isHost() && key === game.host) {
          const before = game;
          game = applyRoom(game, m, now(), me().key);
          const after = game;
          if (after.goAt && !before.goAt) log(`Départ commun : « partez » reçu de l'hôte (${after.goWhy === 'timeout' ? `délai passé, sans ${after.players.filter((p) => after.goLate?.includes(p.key)).map((p) => p.name).join(', ') || 'personne'}` : 'tous prêts'}).`); // i18n-ignore : journal
          // « game-start » perdu : la salle dit que la partie est lancée, elle part d'ici.
          if (before.phase === 'gathering' && after.phase === 'countdown') {
            log(`Départ commun : départ appris par la salle (message de départ perdu), lancement dans ${countdownLeft(after, now())} s.`); // i18n-ignore : journal
            scheduleLaunch();
          }
          resendStatus('salle');
          changed();
        }
        return;
      case 'game-start':
        // Seulement le départ de cette partie : un message de la partie d'avant n'en lance pas une autre.
        if (game && !isHost() && key === game.host && m.game === game.id && game.phase === 'gathering') {
          game = countdownFrom(game, m.in, now());
          scheduleLaunch();
          changed();
        }
        return;
      case 'game-status':
        if (game && isHost() && m.game === game.id) {
          const was = game.players.find((p) => p.key === key);
          if (m.ready && was && !was.ready) log(`Départ commun : ${was.name} prêt (reçu)${m.manual ? ', table sans relevé' : ''}.`); // i18n-ignore : journal
          const next = gameStatus(game, key, m, now());
          // Un état renvoyé, déjà connu : c'est la salle qu'il n'a pas reçue, elle repart vers lui.
          if (next === game || JSON.stringify(next) === JSON.stringify(game)) broadcastRoom(key);
          setGame(next);
          maybeGo();
        }
        return;
      case 'game-cancel': {
        // Celui qui invite annule ; un invité, lui, quitte la partie.
        const fromHost = !(game && isHost() && m.game === game.id);
        if (game && m.game === game.id && key === game.host && !isHost()) {
          if (launch && game.phase === 'countdown') clearTimeout(launch);
          if (game.phase !== 'cancelled') log(`Partie en direct : partie annulée par ${game.players.find((p) => p.host)?.name ?? key}${m.why ? ` (${m.why})` : ''}.`); // i18n-ignore : journal
          game = { ...game, phase: 'cancelled' };
        } else if (game && isHost() && m.game === game.id) setGame(gameStatus(game, key, { state: 'left' }, now()));
        const invite = invites.find((i) => i.id === m.game && i.host.key === key);
        if (invite) endInvite(invite, m.why ?? 'cancelled');
        // Reçue : celui qui invite cesse de la redire (même redite, déjà connue : l'accusé repart).
        if (fromHost) net.send(key, { t: 'game-cancel-ok', game: m.game });
        changed();
        return;
      }
      case 'game-cancel-ok':
        if (ends.delete(`${key}|${m.game}`)) log(`Partie en direct : fin de l'invitation reçue par ${net.state().friends.find((f) => f.key === key)?.name ?? key}.`); // i18n-ignore : journal
        return;
      default:
        return;
    }
  });

  const ticker = setInterval(() => {
    // Invité : une invitation expirée, ou dont l'hôte est passé hors ligne, prend fin ; son écran le dit tout de suite.
    let gone = false;
    for (const i of [...invites]) {
      const why = inviteExpired(i, now()) ? 'expired' : !net.online(i.host.key) ? 'host-offline' : undefined;
      if (why) {
        endInvite(i, why);
        gone = true;
      }
    }
    // Une invitation en attente : son temps restant à l'écran, une fois par seconde.
    if (invites.length || gone) changed();
    // Celui qui invite : chaque fin d'invitation redite jusqu'à son accusé de réception, tant qu'elle vaut.
    for (const [k, e] of ends) {
      if (now().getTime() > e.until) ends.delete(k);
      else if (now().getTime() - e.at >= LIVE_RESEND_MS && net.online(e.to)) {
        e.at = now().getTime();
        net.send(e.to, e.message);
      }
    }
    if (!game) {
      waitWas = false;
      return;
    }
    if (isHost()) {
      // Sans réponse depuis deux minutes, ou passé hors ligne : l'invitation prend fin, il l'apprend.
      const before = game;
      const offline = dropOfflineInvites(before, (k) => net.online(k), now());
      const expired = expireInvites(offline, now());
      tellEnds(before, expired, (p) => (p.offline ? 'offline' : 'expired'));
      setGame(closeIfDone(expired, now()));
      // Une réponse en tête du salon : il se redessine jusqu'à ce qu'elle en parte.
      if (game?.phase === 'gathering' && game.players.some((p) => p.answeredAt && now().getTime() - Date.parse(p.answeredAt) < LIVE_ANSWER_SHOW_MS + 2 * TICK_MS)) changed();
      maybeGo();
      // Une invitation sans réponse repart (message perdu sur une liaison qui tombe), jusqu'à sa réponse ou son expiration.
      if (game?.phase === 'gathering') {
        for (const p of game.players) {
          const sent = own().invites.get(p.key);
          if (p.state !== 'invited' || !sent || now().getTime() - sent.at < INVITE_RESEND_MS || !net.online(p.key)) continue;
          sent.at = now().getTime();
          if (!sent.told) log(`Partie en direct : invitation renvoyée à ${p.name} (pas encore de réponse ; toutes les ${INVITE_RESEND_MS / 1000} s jusqu'à sa réponse).`); // i18n-ignore : journal
          sent.told = true;
          net.send(p.key, sent.message);
        }
      }
      // La salle renvoyée pendant la partie : un « partez » perdu arrive au tour suivant ; un invité revenu en ligne l'a tout de suite.
      if (game?.phase === 'countdown' || game?.phase === 'playing') {
        for (const p of game.players) {
          if (p.host || !livePlayers(game).includes(p)) continue;
          const online = net.online(p.key);
          if (online && own().wasOnline.get(p.key) === false) {
            log(`Départ commun : ${p.name} revenu en ligne, la salle lui est renvoyée.`); // i18n-ignore : journal
            broadcastRoom(p.key);
          }
          own().wasOnline.set(p.key, online);
        }
        if (now().getTime() - own().roomSentAt >= LIVE_RESEND_MS) broadcastRoom();
      }
    } else {
      // Invité : l'hôte revenu en ligne reçoit mon état tout de suite ; sinon, renvoyé tant que sa salle ne le montre pas.
      const online = net.online(game.host);
      const back = online && own().wasOnline.get(game.host) === false;
      own().wasOnline.set(game.host, online);
      if (online) resendStatus(back ? 'retour' : 'tour');
    }
    // Invité : un hôte resté muet se voit au fil du temps.
    if (running && !running.released) released();
    // Compte à rebours, et attente du départ commun (le délai des derniers) : une fois par seconde ; et
    // une fois encore quand elle n'a plus rien à montrer, pour que la carte parte (« Partez ! » lu).
    const waiting = !!waitView();
    if (game?.phase === 'countdown' || waiting || waitWas) changed();
    waitWas = waiting;
  }, TICK_MS);
  ticker.unref?.();

  /**
   * Celui qui invite annule son salon : chacun l'apprend, redit jusqu'à l'accusé de réception ;
   * ceux qui reçoivent aussitôt une autre invitation (`replacedFor`, changement de table) : « changée de table ».
   */
  function cancelAsHost(g: LiveGame, replacedFor: readonly string[]): void {
    for (const p of g.players) {
      if (p.host || !['invited', 'accepted'].includes(p.state)) continue;
      tellEnd(p.key, p.name, g.id, p.state === 'invited' && replacedFor.includes(p.key) ? 'replaced' : 'cancelled');
    }
  }

  function waitView(opts: { manual?: boolean } = {}): LiveWaitView | undefined {
    const run = running;
    return game && run?.id === game.id ? liveWaitView(game, me().key, now(), { ...opts, ...(run.readyAt !== undefined ? { readyAt: run.readyAt } : {}) }) : undefined;
  }

  return {
    current: () => game,
    board: () => (game ? boardFor(loadedBoards(), game.table) : []),
    history: () => loadedHistory().games,
    table: () => mine,
    versionOf,
    bytesOf: (table) => fileSize(table.file),
    manualOf,
    waitView,
    invites: () => invites.filter((i) => !inviteExpired(i, now())),
    inviteEnd: (id) => {
      const e = ended.get(id);
      return e ? { why: e.why, name: e.name, title: e.title, host: e.host, ...(e.next ? { next: e.next } : {}) } : undefined;
    },
    async create(table) {
      if (game && ongoing() && !isHost()) net.send(game.host, { t: 'game-cancel', game: game.id });
      // Un salon encore ouvert : ses invités apprennent sa fin (inviteAll l'a déjà fermé d'ordinaire).
      if (game && isHost() && (game.phase === 'gathering' || game.phase === 'countdown')) cancelAsHost(game, []);
      const live = await liveTable(table);
      mine = table;
      setGame(newLiveGame({ ...me(), ...version }, live, displayTitle(table), now()));
      log(`Partie en direct : salon ouvert sur ${table.title}.`); // i18n-ignore : journal
      return game!;
    },
    invite(key, name) {
      if (!game || !isHost() || !net.online(key)) return false;
      const next = inviteToGame(game, { key, name }, now());
      if (!next) return false;
      const players = next.players.filter((p) => p.state === 'accepted' || p.state === 'invited').map((p) => ({ key: p.key, name: p.name }));
      // Une invitation voulue a son numéro : ses renvois le gardent, une nouvelle (après un refus) en prend un autre.
      const round = (own().invites.get(key)?.round ?? 0) + 1;
      const message: Extract<LiveMessage, { t: 'game-invite' }> = { t: 'game-invite', game: { id: next.id, table: next.table, title: next.title, players, ...version }, round };
      if (!net.send(key, message)) return false;
      // Réinvité dans le même salon : la fin de l'invitation d'avant ne se redit plus (elle annulerait celle-ci).
      ends.delete(`${key}|${next.id}`);
      setGame(next);
      own().invites.set(key, { message, at: now().getTime(), round });
      return true;
    },
    matchFor,
    async accept(id) {
      const invite = invites.find((i) => i.id === id);
      if (!invite) return { match: 'missing' };
      const found = await matchFor(invite);
      // Annulée pendant la vérification de la table : rien ne part.
      if (!invites.some((i) => i.id === id)) return { match: found.match, gone: true };
      endInvite(invite, 'answered');
      // Pas la même version : la partie ne se joue pas (décision du 30/10/2026), il récupère la sienne.
      if (found.match !== 'same') {
        answer(invite.host.key, { t: 'game-answer', game: id, answer: 'decline', match: found.match, ...version }, invite.round);
        changed();
        return found;
      }
      answer(invite.host.key, { t: 'game-answer', game: id, answer: 'accept', match: found.match, ...(found.balls ? { balls: found.balls } : {}), ...version }, invite.round);
      mine = found.table;
      game = guestGame(invite, { ...me(), ...version }, found.match, found.balls);
      // Les réglages de l'hôte arrivent juste après ma réponse.
      receiver = createSettingsReceiver(id);
      hostSettings = undefined;
      changed();
      return found;
    },
    decline(id) {
      const invite = invites.find((i) => i.id === id);
      if (invite) {
        endInvite(invite, 'answered');
        answer(invite.host.key, { t: 'game-answer', game: id, answer: 'decline' }, invite.round);
        log(`Partie en direct : invitation de ${invite.host.name} refusée.`); // i18n-ignore : journal
      }
      changed();
    },
    start() {
      if (!game || !isHost()) return false;
      const next = startGame(game, now());
      if (next === game) return false;
      for (const p of next.players) if (!p.host && p.state === 'accepted') net.send(p.key, { t: 'game-start', game: next.id, in: LIVE_COUNTDOWN_S * 1000 });
      // Ceux qui n'avaient pas encore répondu : la partie part sans eux, ils l'apprennent.
      tellEnds(game, next, () => 'started');
      setGame(next);
      scheduleLaunch();
      return true;
    },
    leave(opts) {
      if (!game) return;
      if (launch) clearTimeout(launch);
      launch = undefined;
      if (isHost()) {
        // Partie déjà partie : chacun finit la sienne, les résultats arrivent quand même.
        if (game.phase === 'gathering' || game.phase === 'countdown') {
          cancelAsHost(game, opts?.replacedFor ?? []);
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

/** Ce que le service retient d'une partie (createLiveGames, own()) : neuf pour chaque partie. */
interface GameState {
  id: string;
  /** Ma table joue sans relevé (départ manuel) : chaque état envoyé le dit. */
  manual: boolean;
  /** Invité : le dernier état envoyé à l'hôte (renvoyé tant que sa salle ne le montre pas), et quand. */
  lastStatus?: { status: Omit<Extract<LiveMessage, { t: 'game-status' }>, 't' | 'game'>; at: number };
  /** Hôte : à qui la salle a déjà porté « partez ». */
  goSentTo: Set<string>;
  /** Qui était en ligne au dernier tour (revenu : la salle, ou mon état, tout de suite). */
  wasOnline: Map<string, boolean>;
  roomSentAt: number;
  /** Hôte : l'invitation envoyée à chacun, et quand (renvoyée tant qu'il n'a pas répondu). */
  invites: Map<string, { message: Extract<LiveMessage, { t: 'game-invite' }>; at: number; round: number; told?: boolean }>;
}

function freshGameState(id: string): GameState {
  return { id, manual: false, goSentTo: new Set(), wasOnline: new Map(), roomSentAt: 0, invites: new Map() };
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

/**
 * Version stricte des tables de cette borne : empreinte du .vpx (gardée dans
 * <données>\amis\empreintes.json) et du script joué. La même pour l'invitation, la réponse, et la
 * bibliothèque partagée qui la donne aux amis avant qu'ils invitent (friend-content.ts).
 */
export function createTableVersions(dataDir: string): { of(table: Pick<TableEntry, 'file'>): Promise<{ print?: string; script?: string }> } {
  const prints = createPrints(path.join(dataDir, 'amis', 'empreintes.json'));
  return {
    async of(table) {
      const print = await prints.of(table.file);
      const script = scriptPrint(table.file);
      return { ...(print ? { print } : {}), ...(script ? { script } : {}) };
    },
  };
}

/** Empreintes SHA-256 des .vpx, gardées par chemin, taille et date de modification. */
function createPrints(file: string): { of(vpx: string): Promise<string | undefined> } {
  return createFileCache(file, async (vpx) => {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(vpx, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) hash.update(chunk);
    return hash.digest('hex');
  });
}

/**
 * Empreinte (SHA-256) du .vbs posé à côté de la table quand il remplace son script : un .vbs venu
 * d'ailleurs, ou celui d'une version précédente ; undefined sans .vbs, ou pour celui que Cyber
 * Pinball a tiré du script de la table (réparations PuP, d'une borne à l'autre).
 */
function scriptPrint(vpx: string): string | undefined {
  const dir = path.dirname(vpx);
  const base = path.basename(vpx, path.extname(vpx)).toLowerCase();
  let name: string | undefined;
  try {
    name = fs.readdirSync(dir).find((f) => f.toLowerCase() === `${base}.vbs`);
  } catch {
    return undefined;
  }
  if (!name) return undefined;
  try {
    const bytes = fs.readFileSync(path.join(dir, name));
    if (scriptPatchState(bytes.toString('latin1'), readVpxScript(vpx)).kind === 'ours') return undefined;
    return createHash('sha256').update(bytes).digest('hex');
  } catch {
    return undefined;
  }
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
