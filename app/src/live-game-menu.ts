// Partie en direct à l'écran (live-game.ts, packages/core/src/livegame.ts) : choisir la table et
// inviter un ami (depuis sa fiche, ou « Jouer avec un ami » sur la fiche d'une table), le salon
// (qui est prêt, qui a refusé, qui a une autre version), l'invitation reçue, le compte à rebours
// du départ commun, puis les résultats de chacun.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des services d'essai.

import {
  canStartGame,
  countdownLeft,
  displayName,
  formatNumber,
  language,
  LIVE_INVITE_MS,
  LIVE_MAX_PLAYERS,
  liveMatchLabel,
  livePlayerStateLabel,
  liveBallsAgainst,
  liveOtherBalls,
  liveRanked,
  liveStandings,
  playDuration,
  t,
  tn,
  type LiveGame,
  type LivePlayer,
  type GamePart,
  type LiveTableMatch,
  type TableEntry,
  type TableIdentity,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section, Tone } from './library';
import type { LiveGames } from './live-game';
import type { SocialNet } from './social-net';

export interface LiveMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    task(message: string, work: () => Promise<void> | void): Promise<void>;
    catalogFor(identity: TableIdentity): void;
  };
  net: Pick<SocialNet, 'state' | 'online' | 'presenceOf'>;
  games: LiveGames;
  tables(): readonly TableEntry[];
  /** La bibliothèque de cet ami (si elle est connue) a cette table : elle passe en tête du choix. */
  friendHas?(key: string, table: TableEntry): boolean;
  /** Cette table chez cet ami, dans sa bibliothèque partagée (« Récupérer toute la table »). */
  /** La table de l'ami dans sa bibliothèque ; `want` : les parties à cocher d'office quand on a déjà le jeu (sa version : 'table'). */
  openFriendTable?(key: string, identity: TableIdentity, back: () => void, want?: readonly GamePart[]): void;
  redraw(): void;
  now?(): Date;
}

export interface LiveMenu {
  /** Inviter cet ami : choisir la table, ouvrir le salon. */
  inviteFriend(key: string, back: () => void): void;
  /** Inviter cet ami sur cette table. */
  inviteOn(table: TableEntry, key: string, back: () => void): void;
  /** Entrée « Jouer avec un ami » de la fiche d'une table : active quand un ami est en ligne, grisée avec sa raison sinon. */
  sheetAction(table: TableEntry, back: () => void): Action;
  /** Entrée « Inviter à une partie en direct » de la fiche d'un ami : grisée s'il est hors ligne. */
  friendAction(key: string, back: () => void): Action;
  /** Une invitation reçue. */
  openInvite(id: string, back: () => void): void;
  /** La partie en cours (salon, départ, résultats), sinon la première invitation. */
  open(back: () => void): void;
  /** À appeler quand la partie change : le compte à rebours et l'annulation s'ouvrent d'eux-mêmes ; `back` : leur Retour. */
  follow(canShow: () => boolean, back: () => void): void;
  /** Action à mettre en tête de « Mes amis » quand une partie ou une invitation attend. */
  pendingAction(back: () => void): Action | undefined;
  attention(): boolean;
}

export function createLiveMenu(host: LiveMenuHost): LiveMenu {
  const now = () => host.now?.() ?? new Date();
  const games = host.games;
  const myKey = () => host.net.state().key.publicKey;
  const label = (key: string, plain: string) => displayName(plain, key);
  let flash: Row | undefined;
  const takeFlash = (): Section[] => {
    const row = flash;
    flash = undefined;
    return row ? [{ rows: [row] }] : [];
  };
  /** Écran d'où l'on est venu dans la partie en cours. */
  let gameBack: () => void = () => undefined;
  /** Ce que j'ai de la table de chaque invitation, vérifié à son ouverture. */
  const matches = new Map<string, { match: LiveTableMatch; balls?: number; scriptDiffers?: boolean }>();
  let followed: { id: string; phase: LiveGame['phase'] } | undefined;

  const stateTone = (p: LivePlayer): Tone | undefined =>
    p.state === 'accepted' || p.state === 'playing' || p.state === 'done' ? 'ok' : p.state === 'declined' || p.state === 'failed' || p.state === 'left' ? 'quiet' : p.state === 'busy' || p.state === 'expired' ? 'warning' : undefined;

  /** En partie sur sa borne : une invitation lui arrive en notification discrète sur sa table. */
  const playingNow = (key: string) => host.net.online(key) && host.net.presenceOf(key)?.status === 'playing';

  function playerRows(game: LiveGame): Row[] {
    return game.players.map((p) => ({
      text: p.key === myKey() ? t('{name} (vous)', { name: label(p.key, p.name) }) : label(p.key, p.name),
      detail: p.state === 'invited' && playingNow(p.key) ? t('Invité, en partie : notifié sur sa table, il peut quitter la sienne pour vous rejoindre') : livePlayerStateLabel(p, game.table.balls),
      icon: p.host ? 'gamepad' : 'friend-list',
      tone: stateTone(p),
      ...(p.host ? { badges: [t('Hôte')] } : {}),
    }));
  }

  function tableRow(game: Pick<LiveGame, 'title' | 'table'>): Row {
    return { text: game.title, detail: game.table.version ? t('Version : {version}', { version: game.table.version }) : undefined, icon: 'play' };
  }

  /** Le record du groupe à battre, sur cette version de la table (groupboard.ts). */
  function boardRow(): Row {
    const best = games.board()[0];
    return best
      ? { text: t('Record du groupe à battre : {score}', { score: formatNumber(best.score) }), detail: t('{name}, le {date}', { name: best.name, date: new Date(best.at).toLocaleDateString(language() === 'en' ? 'en-GB' : 'fr-FR') }), icon: 'star', tone: 'info' }
      : { text: t('Pas encore de record du groupe sur cette version'), detail: t('Le meilleur score de cette partie l’ouvrira'), icon: 'star', tone: 'quiet' };
  }

  /** Le tableau du groupe sur cette version, après la partie : les cinq meilleurs. */
  function boardSection(): Section {
    const board = games.board().slice(0, 5);
    return {
      title: t('Records du groupe sur cette version'),
      rows: board.length
        ? board.map((r, i) => ({ text: `${i + 1}. ${label(r.player, r.name)} — ${formatNumber(r.score)}`, detail: new Date(r.at).toLocaleDateString(language() === 'en' ? 'en-GB' : 'fr-FR'), icon: 'star' as const, ...(i === 0 ? { tone: 'ok' as const } : {}) }))
        : [{ text: t('Aucun score classé pour l’instant'), detail: t('Seuls les scores lisibles comptent : VPReg.stg, ou la mémoire d’une ROM que sa carte décrit'), tone: 'quiet' as const }],
    };
  }

  /** Mon nombre de billes par partie, quand il diffère de celui de celui qui invite : rien sinon. */
  const ballsRow = (mine: number | undefined, theirs: number | undefined): Row[] =>
    liveOtherBalls({ balls: mine }, theirs)
      ? [{ text: liveBallsAgainst(mine!, theirs!), detail: t('Votre score reste hors classement : réglez votre table sur {n} billes pour être classé.', { n: theirs! }), tone: 'warning', icon: 'rules' }]
      : [];

  /** Pas la même version que celui qui invite : la partie ne se joue pas (décision du 30/10/2026), il récupère la sienne. */
  const otherVersionRow = (name: string, scriptDiffers: boolean | undefined): Row =>
    scriptDiffers
      ? { text: t('Même table, autre script'), detail: t('Un .vbs posé à côté de votre table remplace son script : la partie demande le même script que {name}.', { name }), tone: 'warning', icon: 'alert' }
      : { text: t('Autre version de cette table'), detail: t('La partie se joue sur la même version pour tous : récupérez celle de {name}.', { name }), tone: 'warning', icon: 'alert' };

  // ---------- Depuis une fiche : l'entrée, toujours là ----------

  function friendAction(key: string, back: () => void): Action {
    const base = { label: t('Inviter à une partie en direct'), icon: 'gamepad' as const };
    if (!host.net.online(key)) return { ...base, detail: t('Hors ligne : invitez-le quand il sera connecté'), tone: 'quiet', run: () => undefined };
    const detail = playingNow(key) ? t('En partie : il recevra une notification discrète sur sa table') : t('Chacun sur sa borne, au même moment');
    return { ...base, detail, tone: 'ok', run: () => inviteFriend(key, back) };
  }

  function sheetAction(table: TableEntry, back: () => void): Action {
    const friends = host.net.state().friends;
    const online = friends.filter((f) => host.net.online(f.key)).length;
    const base = { label: t('Jouer avec un ami'), icon: 'gamepad' as const };
    if (!friends.length) return { ...base, detail: t('Pas encore d’ami : Menu système > Amis > Trouver un joueur'), tone: 'quiet', run: () => undefined };
    if (!online) return { ...base, detail: t('Aucun ami en ligne pour l’instant'), tone: 'quiet', run: () => undefined };
    return { ...base, detail: tn(online, '{n} ami en ligne : chacun sur sa borne, au même moment', '{n} amis en ligne : chacun sur sa borne, au même moment'), tone: 'ok', run: () => host.library.openCustom(() => buildChooseFriend(table, back)) };
  }

  /** Les amis à inviter sur cette table : ceux en ligne en tête (qui l'a aussi d'abord), les autres grisés. */
  function buildChooseFriend(table: TableEntry, back: () => void): Built {
    const has = (key: string) => host.friendHas?.(key, table) ?? false;
    const friends = [...host.net.state().friends].sort((a, b) => Number(has(b.key)) - Number(has(a.key)) || a.name.localeCompare(b.name));
    const online = friends.filter((f) => host.net.online(f.key));
    const offline = friends.filter((f) => !host.net.online(f.key));
    const reopen = () => host.library.openCustom(() => buildChooseFriend(table, back));
    const actions: Action[] = [];
    const rows: Row[] = online.map((f) => {
      const index = actions.push({ label: f.name, key: `friend:${f.key}`, icon: 'friend-list', run: () => inviteOn(table, f.key, reopen) }) - 1;
      const doing = playingNow(f.key) ? t('En partie : notifié sur sa table') : t('Dans le menu des tables');
      return { text: label(f.key, f.name), detail: [doing, has(f.key) ? t('{name} l’a aussi', { name: f.name }) : undefined].filter(Boolean).join(' · '), icon: 'friend-list', tone: 'ok', action: index, pick: true };
    });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    const sections: Section[] = [];
    if (rows.length) sections.push({ title: t('En ligne ({n})', { n: online.length }), rows });
    else sections.push({ rows: [{ text: t('Aucun ami en ligne pour l’instant'), detail: t('Ils apparaissent ici dès qu’ils allument leur borne'), tone: 'info' }] });
    if (offline.length) sections.push({ title: t('Hors ligne ({n})', { n: offline.length }), rows: offline.map((f) => ({ text: label(f.key, f.name), detail: t('Hors ligne'), icon: 'friend-list', tone: 'quiet' })) });
    return {
      heading: t('Jouer avec un ami'),
      icon: 'gamepad',
      subheading: table.title,
      lead: t('Choisissez qui inviter : il doit avoir la table aussi. Chacun joue sa partie sur sa borne, au même moment, puis les résultats arrivent.'),
      sections,
      actions,
      back,
    };
  }

  // ---------- Choisir la table ----------

  function inviteFriend(key: string, back: () => void): void {
    host.library.openCustom(() => buildChoose(key, back));
  }

  function buildChoose(key: string, back: () => void): Built {
    const friend = host.net.state().friends.find((f) => f.key === key);
    const plain = friend?.name ?? '?';
    const has = (table: TableEntry) => host.friendHas?.(key, table) ?? false;
    const tables = [...host.tables()].sort((a, b) => Number(has(b)) - Number(has(a)) || a.title.localeCompare(b.title));
    const actions: Action[] = [];
    const rows: Row[] = tables.map((table) => {
      const index = actions.push({ label: table.title, key: `table:${table.file}`, icon: 'play', run: () => inviteOn(table, key, back) }) - 1;
      return {
        text: table.manufacturer && table.year ? `${table.title} (${table.manufacturer} ${table.year})` : table.title,
        detail: [table.version, has(table) ? t('{name} l’a aussi', { name: plain }) : undefined].filter(Boolean).join(' · ') || undefined,
        tone: has(table) ? 'ok' : undefined,
        action: index,
        pick: true,
      };
    });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Partie en direct avec {name}', { name: plain }),
      icon: 'gamepad',
      lead: t('Choisissez la table : {name} doit l’avoir aussi. Chacun joue sa partie sur sa borne, au même moment, puis les résultats arrivent.', { name: plain }),
      sections: rows.length ? [{ title: t('Tables de votre borne'), rows }] : [{ rows: [{ text: t('Aucune table sur cette borne'), tone: 'info' }] }],
      actions,
      back,
    };
  }

  function inviteOn(table: TableEntry, key: string, back: () => void): void {
    const friend = host.net.state().friends.find((f) => f.key === key);
    const plain = friend?.name ?? '?';
    gameBack = back;
    void host.library.task(t('Préparation de la partie : empreinte de la table…'), async () => {
      const current = games.current();
      // Déjà un salon sur cette table : l'ami y est ajouté ; sinon un nouveau salon.
      if (!current || current.host !== myKey() || current.phase !== 'gathering' || games.table()?.file !== table.file) await games.create(table);
      flash = games.invite(key, plain)
        ? { text: t('Invitation envoyée à {name}', { name: plain }), detail: t('Elle reste valable deux minutes'), tone: 'ok' }
        : { text: host.net.online(key) ? t('Salon complet : {max} joueurs au plus', { max: LIVE_MAX_PLAYERS }) : t('{name} n’est plus en ligne', { name: plain }), tone: 'warning' };
    }).then(() => openGame());
  }

  // ---------- Le salon, le départ, les résultats ----------

  function openGame(at?: number): void {
    // Compte à rebours, et salon d'un invité : le curseur sur « Retour », un Start par mégarde ne quitte pas la partie.
    const game = games.current();
    const safe = game?.phase === 'countdown' || (game?.phase === 'gathering' && game.host !== myKey());
    host.library.openCustom(buildGame, at ?? (safe ? Number.MAX_SAFE_INTEGER : undefined));
  }

  function buildGame(): Built {
    const game = games.current();
    const back = () => gameBack();
    if (!game) return { heading: t('Partie en direct'), icon: 'gamepad', sections: [{ rows: [{ text: t('Plus de partie en cours'), tone: 'info' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
    if (game.phase === 'countdown') return buildCountdown(game, back);
    if (game.phase === 'playing' || game.phase === 'finished') return buildResults(game, back);
    if (game.phase === 'cancelled') return buildCancelled(game, back);
    const hosting = game.host === myKey();
    const actions: Action[] = [];
    const accepted = game.players.filter((p) => !p.host && p.state === 'accepted').length;
    const seats = game.players.filter((p) => !['declined', 'busy', 'expired', 'left'].includes(p.state)).length;
    if (hosting) {
      actions.push({
        label: t('Lancer la partie'),
        detail: canStartGame(game) ? tn(accepted, 'Départ dans 5 s pour vous et {n} ami', 'Départ dans 5 s pour vous et {n} amis') : t('Dès qu’un ami a accepté'),
        icon: 'start',
        tone: canStartGame(game) ? 'ok' : undefined,
        attention: canStartGame(game),
        run: () => {
          if (!games.start()) flash = { text: t('Personne n’a encore accepté'), tone: 'warning' };
          openGame();
        },
      });
      const others = host.net.state().friends.filter((f) => host.net.online(f.key) && !game.players.some((p) => p.key === f.key && ['invited', 'accepted'].includes(p.state)));
      if (seats < LIVE_MAX_PLAYERS && others.length) actions.push({ label: t('Inviter un autre ami'), detail: tn(others.length, '{n} ami en ligne', '{n} amis en ligne'), icon: 'friend-add', run: () => openAddFriend() });
      actions.push({ label: t('Annuler la partie'), detail: t('Les invités en sont prévenus'), icon: 'close', run: () => { games.leave(); back(); } });
    } else {
      actions.push({ label: t('Quitter la partie'), icon: 'close', run: () => { games.leave(); back(); } });
    }
    actions.push({ label: t('Retour'), detail: hosting ? t('Le salon reste ouvert : « Mes amis » y ramène') : t('Vous restez dans la partie'), icon: 'back', run: back });
    const hostPlayer = game.players.find((p) => p.host);
    const myself = game.players.find((p) => p.key === myKey());
    return {
      heading: t('Partie en direct'),
      icon: 'gamepad',
      subheading: game.title,
      lead: hosting ? t('Lancez quand vos amis sont prêts : un compte à rebours commun, puis la table se lance sur chaque borne.') : t('En attente du départ donné par {name}.', { name: hostPlayer?.name ?? '?' }),
      sections: [
        ...takeFlash(),
        { rows: [tableRow(game), ...(myself?.host ? [] : ballsRow(myself?.balls, game.table.balls)), boardRow()] },
        { title: t('Joueurs ({n} sur {max})', { n: seats, max: LIVE_MAX_PLAYERS }), rows: playerRows(game) },
      ],
      actions,
      back,
    };
  }

  function openAddFriend(): void {
    host.library.openCustom(() => {
      const game = games.current();
      const back = () => openGame();
      const actions: Action[] = [];
      const friends = host.net.state().friends.filter((f) => host.net.online(f.key) && !game?.players.some((p) => p.key === f.key && ['invited', 'accepted'].includes(p.state)));
      const rows: Row[] = friends.map((f) => {
        const index = actions.push({ label: label(f.key, f.name), key: `friend:${f.key}`, icon: 'friend-add', run: () => {
          flash = games.invite(f.key, f.name) ? { text: t('Invitation envoyée à {name}', { name: f.name }), tone: 'ok' } : { text: t('Invitation impossible : salon complet, ou ami plus en ligne'), tone: 'warning' };
          openGame();
        } }) - 1;
        return { text: label(f.key, f.name), detail: t('En ligne'), tone: 'ok', action: index, pick: true };
      });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return { heading: t('Inviter un autre ami'), icon: 'friend-add', subheading: game?.title, sections: rows.length ? [{ rows }] : [{ rows: [{ text: t('Aucun autre ami en ligne'), tone: 'info' }] }], actions, back };
    });
  }

  /** Le compte à rebours : un grand chiffre au centre (variante « countdown », library.css), les joueurs dessous. */
  function buildCountdown(game: LiveGame, back: () => void): Built {
    const left = countdownLeft(game, now());
    const hosting = game.host === myKey();
    return {
      heading: t('Départ commun'),
      icon: 'gamepad',
      subheading: game.title,
      variant: 'countdown',
      sections: [
        { kind: 'countdown', rows: [left > 0 ? { text: String(left), detail: t('La table se lance sur chaque borne au même moment') } : { text: t('C’est parti !') }] },
        { title: t('Joueurs'), rows: playerRows({ ...game, players: game.players.filter((p) => p.state === 'accepted' || p.state === 'loading' || p.state === 'playing') }) },
      ],
      actions: [
        { label: hosting ? t('Annuler la partie') : t('Quitter la partie'), icon: 'close', run: () => { games.leave(); back(); } },
        { label: t('Retour au menu'), detail: t('Le départ reste prévu'), icon: 'back', run: back },
      ],
      back,
    };
  }

  /**
   * Un joueur aux résultats : son score s'il est entré au tableau d'honneur (rang et score mis en
   * avant), sinon « Score non disponible », sans rang : on ne classe pas un score inconnu.
   */
  function resultRow(p: LivePlayer, place: number | undefined, compared: boolean, hostBalls: number | undefined): Row {
    const record = p.records?.[0];
    const who = p.key === myKey() ? t('{name} (vous)', { name: label(p.key, p.name) }) : label(p.key, p.name);
    const played = p.seconds !== undefined ? playDuration(p.seconds) : undefined;
    const version = p.host
      ? undefined
      : p.settings !== 'ok'
        ? t('Hors classement : réglages de l’hôte non reçus')
        : liveOtherBalls(p, hostBalls)
          ? t('Hors classement : {balls}', { balls: liveBallsAgainst(p.balls!, hostBalls!) })
          : undefined;
    const detail =
      p.state === 'done'
        ? [record ? t('Record enregistré, place {rank} du tableau', { rank: record.rank }) : t('Partie terminée'), version, played].filter(Boolean).join(' · ')
        : livePlayerStateLabel(p, hostBalls);
    return {
      text: record && place ? `${place}. ${who} — ${formatNumber(record.score)}` : record ? `${who} — ${formatNumber(record.score)}` : p.state === 'done' ? `${who} — ${t('Score non disponible')}` : who,
      detail,
      icon: record ? 'star' : 'friend-list',
      tone: p.state === 'done' ? 'ok' : p.state === 'playing' || p.state === 'loading' ? 'info' : 'quiet',
      ...(place === 1 && compared ? { badges: [t('Meilleur score connu')] } : p.state === 'playing' || p.state === 'loading' ? { badges: [t('En partie')] } : {}),
    };
  }

  function buildResults(game: LiveGame, back: () => void): Built {
    const standings = liveStandings(game);
    const finished = game.phase === 'finished';
    const hosting = game.host === myKey();
    const actions: Action[] = [];
    if (finished && hosting && games.table()) {
      const again = game.players.filter((p) => !p.host && ['done', 'failed', 'playing', 'loading', 'accepted'].includes(p.state) && host.net.online(p.key));
      if (again.length) actions.push({ label: t('Rejouer avec les mêmes joueurs'), detail: again.map((p) => p.name).join(', '), icon: 'restart', tone: 'ok', run: () => replay(again) });
    }
    actions.push({ label: finished ? t('Fermer') : t('Retour'), detail: finished ? undefined : t('Les résultats arrivent dans « Mes amis »'), icon: finished ? 'check' : 'back', run: () => { if (finished) games.close(); back(); } });
    const ranked = standings.filter((p) => p.records?.length && liveRanked(p, game.table.balls));
    const otherBalls = game.players.some((p) => !p.host && liveOtherBalls(p, game.table.balls));
    return {
      heading: finished ? t('Résultats') : t('Partie en direct en cours'),
      icon: 'gamepad',
      subheading: game.title,
      lead: t('Seuls les scores inscrits au tableau d’honneur sont disponibles.'),
      sections: [
        ...takeFlash(),
        ...(otherBalls ? [{ rows: [{ text: t('Autre nombre de billes : score hors classement'), detail: t('{n} billes par partie chez celui qui invite', { n: game.table.balls! }), tone: 'warning' as const, icon: 'rules' as const }] }] : []),
        { rows: standings.map((p) => resultRow(p, ranked.includes(p) ? ranked.indexOf(p) + 1 : undefined, standings.length > 1, game.table.balls)) },
        ...(finished ? [boardSection()] : []),
      ],
      actions,
      back,
    };
  }

  function replay(players: LivePlayer[]): void {
    const table = games.table();
    if (!table) return;
    void host.library.task(t('Préparation de la partie : empreinte de la table…'), async () => {
      games.close();
      await games.create(table);
      const sent = players.filter((p) => games.invite(p.key, p.name));
      flash = { text: tn(sent.length, 'Invitation envoyée à {n} joueur', 'Invitations envoyées à {n} joueurs'), tone: 'ok' };
    }).then(() => openGame());
  }

  function buildCancelled(game: LiveGame, back: () => void): Built {
    const hostPlayer = game.players.find((p) => p.host);
    return {
      heading: t('Partie annulée'),
      icon: 'gamepad',
      subheading: game.title,
      sections: [{ rows: [{ text: game.host === myKey() ? t('Vous avez annulé la partie') : t('{name} a annulé la partie', { name: hostPlayer?.name ?? '?' }), tone: 'info' }] }],
      actions: [{ label: t('Fermer'), icon: 'check', run: () => { games.close(); back(); } }],
      back: () => { games.close(); back(); },
    };
  }

  // ---------- Invitation reçue ----------

  function openInvite(id: string, back: () => void): void {
    const invite = games.invites().find((i) => i.id === id);
    // Ouverte d'elle-même, parfois sous un bouton déjà appuyé : le curseur sur « Répondre plus tard ».
    const show = () => host.library.openCustom(() => buildInvite(id, back), Number.MAX_SAFE_INTEGER);
    if (!invite || matches.has(id)) return show();
    // La table vérifiée d'abord : l'écran s'ouvre avec toutes ses actions, le curseur sur la première.
    void games.matchFor(invite).then(
      (m) => {
        matches.set(id, { match: m.match, ...(m.balls ? { balls: m.balls } : {}), ...(m.scriptDiffers ? { scriptDiffers: true } : {}) });
        show();
      },
      () => show(),
    );
  }

  function buildInvite(id: string, back: () => void): Built {
    const invite = games.invites().find((i) => i.id === id);
    if (!invite) {
      return { heading: t('Invitation à une partie en direct'), icon: 'gamepad', sections: [...takeFlash(), { rows: [{ text: t('Cette invitation n’est plus valable'), detail: t('Annulée, expirée (deux minutes), ou déjà répondue'), tone: 'info' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
    }
    const found = matches.get(id);
    const match = found?.match;
    const rows: Row[] = [
      tableRow(invite),
      ...(!match
        ? [{ text: t('Vérification de la table sur votre borne…'), tone: 'quiet' } as Row]
        : match === 'other-version'
          ? [otherVersionRow(invite.host.name, found?.scriptDiffers)]
          : [{ text: liveMatchLabel(match), tone: match === 'same' ? 'ok' : 'error' } as Row]),
      ...(match === 'same' ? ballsRow(found?.balls, invite.table.balls) : []),
    ];
    if (invite.players.length) rows.push({ text: t('Avec {names}', { names: invite.players.map((p) => p.name).join(', ') }), icon: 'friends' });
    const actions: Action[] = [];
    // Accepter : seulement avec la même version (même .vpx, même script).
    if (match === 'same') {
      actions.push({
        label: t('Accepter'),
        detail: t('Vous jouerez votre partie sur votre borne, au départ donné par {name}', { name: invite.host.name }),
        icon: 'check',
        tone: 'ok',
        run: async () => {
          const r = await games.accept(id);
          gameBack = back;
          if (r.match !== 'same') {
            flash = { text: liveMatchLabel(r.match), tone: 'warning' };
            return back();
          }
          openGame();
        },
      });
    }
    // Pas la même version : la sienne, prise dans sa bibliothèque (la table cochée d'office), puis une nouvelle invitation.
    if (match === 'other-version' && host.openFriendTable) {
      actions.push({
        label: t('Récupérer sa version chez {name}', { name: invite.host.name }),
        detail: t('Sa table, cochée d’office dans sa bibliothèque partagée ; puis le plan d’ajout, et une nouvelle invitation'),
        icon: 'table-add',
        tone: 'ok',
        run: () => host.openFriendTable!(invite.host.key, invite.table.table, () => openInvite(id, back), ['table']),
      });
    }
    if (match === 'missing' && host.openFriendTable) actions.push({ label: t('La récupérer chez {name}', { name: invite.host.name }), detail: t('Sa bibliothèque partagée : toute la table, puis le plan d’ajout'), icon: 'table-add', tone: 'ok', run: () => host.openFriendTable!(invite.host.key, invite.table.table, () => openInvite(id, back)) });
    if (match === 'missing') actions.push({ label: t('Trouver cette table dans le catalogue'), icon: 'search', run: () => host.library.catalogFor(invite.table.table) });
    actions.push({ label: t('Refuser'), icon: 'close', run: () => { games.decline(id); flash = { text: t('Invitation de {name} refusée', { name: invite.host.name }), tone: 'ok' }; back(); } });
    const left = Math.max(0, Math.ceil((LIVE_INVITE_MS - (now().getTime() - Date.parse(invite.receivedAt))) / 1000));
    actions.push({ label: t('Répondre plus tard'), detail: t('Encore {n} s', { n: left }), icon: 'back', run: back });
    return {
      heading: t('Invitation de {name}', { name: invite.host.name }),
      icon: 'gamepad',
      subheading: label(invite.host.key, invite.host.name),
      lead: t('Jouez chacun sur votre borne, avec un départ commun.'),
      sections: [...takeFlash(), { rows }],
      actions,
      back,
    };
  }

  return {
    inviteFriend,
    inviteOn,
    sheetAction,
    friendAction,
    openInvite,
    open(back) {
      const game = games.current();
      if (game) {
        gameBack = back;
        return openGame();
      }
      const invite = games.invites()[0];
      if (invite) openInvite(invite.id, back);
    },
    follow(canShow, back) {
      const game = games.current();
      const was = followed;
      followed = game ? { id: game.id, phase: game.phase } : undefined;
      if (!game || !canShow() || (was?.id === game.id && was.phase === game.phase)) return;
      // Le départ et l'annulation s'affichent d'eux-mêmes ; les résultats, au retour de la partie (frontend.ts).
      if (game.phase === 'countdown' || (game.phase === 'cancelled' && game.host !== myKey())) {
        gameBack = back;
        openGame();
      }
    },
    pendingAction(back) {
      const game = games.current();
      if (game) {
        const lead = game.phase === 'finished' ? t('Résultats de la partie en direct') : game.phase === 'cancelled' ? t('Partie annulée') : t('Partie en direct');
        return { label: `${lead} : ${game.title}`, icon: 'gamepad', attention: game.phase === 'finished' || game.phase === 'countdown', run: () => { gameBack = back; openGame(); } };
      }
      const invite = games.invites()[0];
      return invite ? { label: t('Invitation de {name} : {table}', { name: invite.host.name, table: invite.title }), icon: 'gamepad', attention: true, run: () => openInvite(invite.id, back) } : undefined;
    },
    attention: () => games.invites().length > 0 || games.current()?.phase === 'finished',
  };
}
