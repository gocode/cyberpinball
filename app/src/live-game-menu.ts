// Partie en direct à l'écran (live-game.ts, packages/core/src/livegame.ts) : choisir la table et
// inviter un ami (depuis sa fiche, ou « Jouer avec un ami » sur la fiche d'une table), le salon
// (qui est prêt, qui a refusé, qui a une autre version), l'invitation reçue, le compte à rebours
// du départ commun, puis les résultats de chacun. Le choix de la table met en tête celles que
// chaque invité a dans la même version (livechoice.ts) ; les autres sont grisées avec leur raison.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des services d'essai.

import {
  canStartGame,
  countdownLeft,
  formatNumber,
  friendsListLine,
  language,
  LIVE_INVITE_MS,
  LIVE_ANSWER_SHOW_MS,
  LIVE_MAX_PLAYERS,
  liveMatchLabel,
  livePlayerStateLabel,
  liveBallsAgainst,
  liveBehind,
  liveBehindLabel,
  liveCandidate,
  liveChoiceDetail,
  liveFitLabel,
  liveManualLabel,
  liveManualScoreLabel,
  liveOtherBalls,
  liveRanked,
  liveScore,
  liveStandings,
  liveTableChoices,
  liveWaitView,
  playDuration,
  t,
  tn,
  type AvatarView,
  type FriendsShelf,
  type LiveFriendFit,
  type LiveFriendTables,
  type LiveGame,
  type LiveManualReason,
  type LiveMineTable,
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
    /** Cet écran décrit est affiché. */
    isShowing?(build: () => Built): boolean;
  };
  net: Pick<SocialNet, 'state' | 'online' | 'presenceOf' | 'listSync'>;
  games: LiveGames;
  tables(): readonly TableEntry[];
  /** Ce qu'on sait des tables de cet ami (sa bibliothèque partagée, la version de chacune) : le choix de la table en tient compte. */
  friendTables(key: string): LiveFriendTables;
  /** Le jeu d'une de mes tables (titre, fabricant, année, VPS, ROM). */
  identityOf(table: TableEntry): TableIdentity;
  /** La table de l'ami dans sa bibliothèque ; `want` : les parties à cocher d'office quand on a déjà le jeu (sa version : 'table'). */
  openFriendTable?(key: string, identity: TableIdentity, back: () => void, want?: readonly GamePart[]): void;
  redraw(): void;
  /** Pastille d'un joueur (avatar.ts) : son avatar, sinon ses initiales ; absente : pas de pastille. */
  avatar?(key: string, plain: string): AvatarView;
  now?(): Date;
}

export interface LiveMenu {
  /** Inviter cet ami : choisir la table (celles qu'il a dans la même version en tête), ouvrir le salon. */
  inviteFriend(key: string, back: () => void): void;
  /** Inviter ces amis ensemble : une table est jouable si elle l'est chez tous. */
  inviteFriends(keys: readonly string[], back: () => void): void;
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
  /** L'écran de la partie (salon, départ, résultats) est ouvert : ses nouvelles s'y voient déjà (menu-notices.ts). */
  onScreen(): boolean;
  /** L'écran de cette invitation est ouvert : elle s'y voit déjà (menu-notices.ts). */
  inviteOnScreen(id: string): boolean;
  /** La partie est finie et ses résultats pas encore montrés : ils s'ouvrent au retour d'une partie d'une autre table. */
  unseenResults(): boolean;
  /**
   * Collection « Avec mes amis en ligne » (collections.ts) : mes tables qu'au moins un ami en
   * ligne a dans la même version, et si la liste est sûre.
   */
  playableWithFriends(tables: readonly TableEntry[]): FriendsShelf;
}

export function createLiveMenu(host: LiveMenuHost): LiveMenu {
  const now = () => host.now?.() ?? new Date();
  const games = host.games;
  const myKey = () => host.net.state().key.publicKey;
  /** La pastille d'un joueur, à poser dans sa ligne (ou son titre). */
  const face = (key: string, plain: string): { avatar?: AvatarView } => (host.avatar ? { avatar: host.avatar(key, plain) } : {});
  let flash: Row | undefined;
  const takeFlash = (): Section[] => {
    const row = flash;
    flash = undefined;
    return row ? [{ rows: [row] }] : [];
  };
  /** Écran d'où l'on est venu dans la partie en cours. */
  let gameBack: () => void = () => undefined;
  /** Ce que j'ai de la table de chaque invitation, vérifié à son ouverture. */
  const matches = new Map<string, { match: LiveTableMatch; balls?: number; scriptDiffers?: boolean; manual?: LiveManualReason }>();
  let followed: { id: string; phase: LiveGame['phase'] } | undefined;
  /** La dernière partie dont les résultats, finis, ont été montrés. */
  let resultsSeen: string | undefined;
  /** L'écran de l'invitation ouverte en dernier, et laquelle (inviteOnScreen). */
  let inviteScreen: { id: string; build: () => Built } | undefined;

  const stateTone = (p: LivePlayer): Tone | undefined =>
    p.state === 'accepted' || p.state === 'playing' || p.state === 'done' || (p.state === 'loading' && p.ready) ? 'ok' : p.state === 'declined' || p.state === 'failed' || p.state === 'left' ? 'quiet' : p.state === 'busy' || p.state === 'expired' ? 'warning' : undefined;

  /** En partie sur sa borne : une invitation lui arrive en notification discrète sur sa table. */
  /** La liste des amis se fait encore (friendpresence.ts) : un ami absent n'est pas sûr. */
  const searching = () => ['searching', 'updating'].includes(host.net.listSync());
  const playingNow = (key: string) => host.net.online(key) && host.net.presenceOf(key)?.status === 'playing';

  /**
   * Celui qui invite : chaque réponse (ou fin sans réponse) des dernières secondes, en tête du salon
   * (essai réel du 04/11/2026 : « on n'a pas l'impression d'en être informé, on peut attendre
   * longtemps ») ; un refus dit que sa place est libérée.
   */
  function answerRows(game: LiveGame): Row[] {
    const recent = game.players.filter((p) => !p.host && p.answeredAt && now().getTime() - Date.parse(p.answeredAt) < LIVE_ANSWER_SHOW_MS);
    return recent.map((p): Row => {
      const name = p.name;
      if (p.state === 'accepted') return { text: t('{name} a accepté votre invitation', { name }), detail: t('Lancez la partie quand vous voulez'), tone: 'ok', icon: 'check' };
      const freed = t('Sa place est libérée : invitez un autre ami, ou changez de table');
      const text =
        p.state === 'busy' ? t('{name} est occupé pour l’instant', { name })
        : p.state === 'expired' ? (p.offline ? t('{name} est passé hors ligne : invitation retirée', { name }) : t('Pas de réponse de {name} en deux minutes', { name }))
        : p.match === 'missing' ? t('{name} n’a pas cette table', { name })
        : p.match === 'other-version' ? t('{name} n’a pas la même version', { name })
        : t('{name} a refusé votre invitation', { name });
      return { text, detail: freed, tone: 'warning', icon: 'alert' };
    });
  }

  function playerRows(game: LiveGame): Row[] {
    return game.players.map((p) => {
      // Une borne en retard (pas de départ automatique ni de score en direct chez elle) : dit tout de suite, pas pris pour un bug.
      const behind = p.key !== myKey() && p.state !== 'invited' && p.state !== 'declined' && liveBehind(p);
      const state = p.state === 'invited' && playingNow(p.key) ? t('Invité, en partie : notifié sur sa table, il peut quitter la sienne pour vous rejoindre') : livePlayerStateLabel(p, game.table.balls);
      return {
        text: p.key === myKey() ? t('{name} (vous)', { name: p.name }) : p.name,
        ...face(p.key, p.name),
        detail: behind ? `${state} · ${liveBehindLabel(p)}` : state,
        icon: p.host ? 'gamepad' : 'friend-list',
        tone: behind ? 'warning' : stateTone(p),
        ...(p.host ? { badges: [t('Hôte')] } : {}),
      };
    });
  }

  function tableRow(game: Pick<LiveGame, 'title' | 'table'>): Row {
    return { text: game.title, detail: game.table.version ? t('Version : {version}', { version: game.table.version }) : undefined, icon: 'play' };
  }

  /**
   * Une table sans relevé de l'état de jeu (départ manuel, pas de score en direct) : dit avant la
   * partie, avec sa raison, sans la cacher ni l'interdire (essai réel du 01/11/2026, 2001 - A Space Odyssey).
   */
  const manualRows = (reason: LiveManualReason | undefined): Row[] => {
    if (!reason) return [];
    const label = liveManualLabel(reason);
    return [{ text: label.text, detail: label.detail, tone: 'warning', icon: 'alert' }];
  };

  /** Le relevé prévu de mes tables, calculé à la demande (script lu une fois par fichier) : le choix se redessine à l'arrivée. */
  const mineManual = new Map<string, { reason?: LiveManualReason; done: boolean }>();
  function manualOfMine(table: TableEntry): LiveManualReason | undefined {
    const known = mineManual.get(table.file);
    if (known) return known.reason;
    mineManual.set(table.file, { done: false });
    void games.manualOf(table).then(
      (reason) => {
        mineManual.set(table.file, { ...(reason ? { reason } : {}), done: true });
        if (reason) host.redraw();
      },
      () => mineManual.set(table.file, { done: true }),
    );
    return undefined;
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
        ? board.map((r, i) => ({ text: `${i + 1}. ${r.name} — ${formatNumber(r.score)}`, detail: new Date(r.at).toLocaleDateString(language() === 'en' ? 'en-GB' : 'fr-FR'), icon: 'star' as const, ...(i === 0 ? { tone: 'ok' as const } : {}) }))
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

  // ---------- La table, chez mes invités ----------

  /**
   * Version stricte de mes tables, calculée à la demande (une empreinte se lit une fois par
   * fichier, live-game.ts la garde) : le choix se redessine à chaque arrivée. Relue en arrière-plan
   * après une minute (un .vbs posé à côté), la dernière connue restant montrée.
   */
  const mineVersions = new Map<string, { at: number; bytes?: number; version?: { print?: string; script?: string }; running?: boolean }>();
  function versionOfMine(table: TableEntry, bytes: number | undefined): { print?: string; script?: string; pending?: true } {
    let known = mineVersions.get(table.file);
    if (known && known.bytes !== bytes) known = undefined;
    if (!known || (!known.running && Date.now() - known.at > 60_000)) {
      const next: NonNullable<typeof known> = { at: Date.now(), ...(bytes ? { bytes } : {}), ...(known?.version ? { version: known.version } : {}), running: true };
      mineVersions.set(table.file, next);
      const done = (version: { print?: string; script?: string }) => {
        if (mineVersions.get(table.file) !== next) return;
        mineVersions.set(table.file, { at: Date.now(), ...(bytes ? { bytes } : {}), version });
        host.redraw();
      };
      void games.versionOf(table).then(done, () => done({}));
      known = next;
    }
    return known.version ?? { pending: true };
  }

  /** Mes tables pour une partie avec ces amis : jouables avec tous en tête, puis à vérifier, puis indisponibles. */
  function choicesFor(tables: readonly TableEntry[], keys: readonly string[]) {
    return choicesOf(tables, keys).choices;
  }

  /** Les choix, et si une de mes empreintes se calcule encore (l'ordre va changer). */
  function choicesOf(tables: readonly TableEntry[], keys: readonly string[]) {
    const friends = keys.map((k) => host.friendTables(k));
    const mine = tables.map((table): LiveMineTable<TableEntry> => {
      const bytes = games.bytesOf(table);
      const base = { entry: table, title: table.title, identity: host.identityOf(table), ...(bytes ? { bytes } : {}) };
      // Mon empreinte seulement pour une table qu'un ami a peut-être (même jeu, même taille) : les autres sont absentes chez lui sans rien lire.
      return friends.some((f) => f.library === 'ready' && f.tables.some((x) => liveCandidate(base, x))) ? { ...base, ...versionOfMine(table, bytes) } : base;
    });
    return { choices: liveTableChoices(mine, friends), pending: mine.some((m) => m.pending) };
  }

  /**
   * Choix ouvert avant que mes empreintes soient connues : les tables se rangent à leur arrivée, et
   * l'écran se rouvre alors une fois, le curseur sur la première (il restait sur une table « à
   * vérifier » descendue parmi les indisponibles).
   */
  let settling: { id: string; pending: boolean } | undefined;

  /** Ce qu'a cet ami de cette table. */
  const fitFor = (table: TableEntry, key: string): LiveFriendFit => choicesFor([table], [key])[0]!.friends[0]!;
  const fitRank = (f: LiveFriendFit) => ({ same: 0, unknown: 1, 'other-version': 2, missing: 3 })[f.fit];
  const fitTone = (f: LiveFriendFit): Tone => (f.fit === 'same' ? 'ok' : f.fit === 'unknown' ? 'warning' : 'quiet');

  /** « Récupérer sa version chez … » : sa table, cochée d'office dans sa bibliothèque partagée. */
  const fetchVersion = (key: string, table: TableEntry, back: () => void) => host.openFriendTable?.(key, host.identityOf(table), back, ['table']);

  // ---------- Depuis une fiche : l'entrée, toujours là ----------

  function friendAction(key: string, back: () => void): Action {
    const base = { label: t('Inviter à une partie en direct'), icon: 'gamepad' as const };
    if (!host.net.online(key)) return { ...base, detail: searching() ? t('Hors ligne pour l’instant : la recherche des amis continue') : t('Hors ligne : invitez-le quand il sera connecté'), tone: 'quiet', run: () => undefined };
    const detail = playingNow(key) ? t('En partie : il recevra une notification discrète sur sa table') : t('Chacun sur sa borne, au même moment');
    return { ...base, detail, tone: 'ok', run: () => inviteFriend(key, back) };
  }

  function sheetAction(table: TableEntry, back: () => void): Action {
    const friends = host.net.state().friends;
    const online = friends.filter((f) => host.net.online(f.key)).length;
    const base = { label: t('Jouer avec un ami'), icon: 'gamepad' as const };
    if (!friends.length) return { ...base, detail: t('Pas encore d’ami : Menu système > Amis > Trouver un joueur'), tone: 'quiet', run: () => undefined };
    if (!online) return { ...base, detail: searching() ? t('Recherche des amis…') : t('Aucun ami en ligne pour l’instant'), tone: 'quiet', run: () => undefined };
    return { ...base, detail: tn(online, '{n} ami en ligne : chacun sur sa borne, au même moment', '{n} amis en ligne : chacun sur sa borne, au même moment'), tone: 'ok', run: () => host.library.openCustom(() => buildChooseFriend(table, back)) };
  }

  /**
   * Les amis à inviter sur cette table : ceux en ligne en tête, qui l'a dans la même version
   * d'abord ; ceux qui ne l'ont pas, ou dans une autre version, grisés avec leur raison ; les autres hors ligne.
   */
  function buildChooseFriend(table: TableEntry, back: () => void): Built {
    const all = [...host.net.state().friends];
    const fits = new Map(all.filter((f) => host.net.online(f.key)).map((f) => [f.key, fitFor(table, f.key)]));
    const online = all.filter((f) => fits.has(f.key)).sort((a, b) => fitRank(fits.get(a.key)!) - fitRank(fits.get(b.key)!) || a.name.localeCompare(b.name));
    const offline = all.filter((f) => !fits.has(f.key)).sort((a, b) => a.name.localeCompare(b.name));
    const reopen = () => host.library.openCustom(() => buildChooseFriend(table, back));
    const actions: Action[] = [];
    const manual = manualRows(manualOfMine(table));
    const rows: Row[] = online.map((f) => {
      const fit = fits.get(f.key)!;
      const fetch = fit.fit === 'other-version' && host.openFriendTable;
      const run = fit.fit === 'same' || fit.fit === 'unknown' ? () => inviteOn(table, f.key, reopen) : fetch ? () => fetchVersion(f.key, table, reopen) : () => undefined;
      const index = actions.push({ label: f.name, key: `friend:${f.key}`, icon: 'friend-list', run }) - 1;
      const doing = playingNow(f.key) ? t('En partie : notifié sur sa table') : t('Dans le menu des tables');
      const detail = [doing, liveFitLabel(fit), fetch ? t('Start : récupérer sa version chez {name}', { name: f.name }) : undefined].filter(Boolean).join(' · ');
      return { text: f.name, ...face(f.key, f.name), detail, icon: 'friend-list', tone: fitTone(fit), action: index, pick: true };
    });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    const sections: Section[] = manual.length ? [{ rows: manual }] : [];
    // La liste est-elle sûre ? Un ami encore cherché n'est pas donné pour absent.
    const sync = friendsListLine(host.net.listSync(), online.length);
    if (sync) sections.push({ rows: [{ text: sync.text, detail: sync.detail, tone: sync.tone, icon: 'network', ...(sync.busy ? { progress: { tone: 'info', busy: true } } : {}) }] });
    if (rows.length) sections.push({ title: t('En ligne ({n})', { n: online.length }), rows });
    else sections.push({ rows: [{ text: t('Aucun ami en ligne pour l’instant'), detail: t('Ils apparaissent ici dès qu’ils allument leur borne'), tone: 'info' }] });
    if (offline.length) sections.push({ title: t('Hors ligne ({n})', { n: offline.length }), rows: offline.map((f) => ({ text: f.name, ...face(f.key, f.name), detail: searching() ? t('Hors ligne pour l’instant : la recherche des amis continue') : t('Hors ligne'), icon: 'friend-list', tone: 'quiet' })) });
    return {
      heading: t('Jouer avec un ami'),
      icon: 'gamepad',
      subheading: table.title,
      lead: t('Choisissez qui inviter : en tête, ceux qui ont cette table dans la même version. Chacun joue sa partie sur sa borne, au même moment, puis les résultats arrivent.'),
      sections,
      actions,
      back,
    };
  }

  // ---------- Choisir la table ----------

  function inviteFriend(key: string, back: () => void): void {
    inviteFriends([key], back);
  }

  function inviteFriends(keys: readonly string[], back: () => void): void {
    settling = { id: keys.join(','), pending: false };
    host.library.openCustom(() => buildChoose(keys, back));
  }

  const nameOf = (key: string) => host.net.state().friends.find((f) => f.key === key)?.name ?? '?';
  const fullTitle = (table: TableEntry) => (table.manufacturer && table.year ? `${table.title} (${table.manufacturer} ${table.year})` : table.title);

  /**
   * Le choix de la table pour ces amis : en tête celles que tous ont dans la même version ; puis
   * celles à vérifier (une borne qui ne dit pas ses versions : signalée, pas refusée) ; puis les
   * indisponibles, grisées avec qui bloque et pourquoi. Une autre version chez un ami garde
   * « Récupérer sa version chez … » ; une table qu'un ami n'a pas ne lance rien.
   */
  function buildChoose(keys: readonly string[], back: () => void): Built {
    const plain = keys.map(nameOf).join(', ');
    const reopen = () => host.library.openCustom(() => buildChoose(keys, back));
    const { choices, pending } = choicesOf(host.tables(), keys);
    if (settling?.id === keys.join(',')) {
      if (pending) settling.pending = true;
      else {
        if (settling.pending) setImmediate(reopen);
        settling = undefined;
      }
    }
    const actions: Action[] = [];
    const row = (c: (typeof choices)[number]): Row => {
      const other = c.fit === 'blocked' && host.openFriendTable ? c.friends.find((f) => f.fit === 'other-version') : undefined;
      const run = c.fit !== 'blocked' ? () => inviteAll(c.entry, keys, back) : other ? () => fetchVersion(other.key, c.entry, reopen) : () => undefined;
      const index = actions.push({ label: c.entry.title, key: `table:${c.entry.file}`, icon: 'play', run }) - 1;
      // Jouable, mais sans relevé : la marque et sa raison, jamais cachée.
      const manual = c.fit !== 'blocked' ? manualOfMine(c.entry) : undefined;
      const marked = manual ? liveManualLabel(manual) : undefined;
      return {
        text: fullTitle(c.entry),
        detail: [c.entry.version, liveChoiceDetail(c), marked ? `${marked.text} : ${marked.detail}` : undefined, other ? t('Start : récupérer sa version chez {name}', { name: other.name }) : undefined].filter(Boolean).join(' · '),
        tone: c.fit === 'same' ? 'ok' : c.fit === 'unknown' ? 'warning' : 'quiet',
        ...(marked ? { badges: [t('Départ manuel')] } : {}),
        action: index,
        pick: true,
      };
    };
    const same = choices.filter((c) => c.fit === 'same');
    const unsure = choices.filter((c) => c.fit === 'unknown');
    const blocked = choices.filter((c) => c.fit === 'blocked');
    const sections: Section[] = [];
    if (!choices.length) sections.push({ rows: [{ text: t('Aucune table sur cette borne'), tone: 'info' }] });
    if (same.length) sections.push({ title: t('Même version chez tous ({n})', { n: same.length }), rows: same.map(row) });
    else if (choices.length && !unsure.length) sections.push({ rows: [{ text: t('Aucune table en commun dans la même version'), detail: t('Récupérez la version d’un ami (Start sur une table grisée), ou laissez-le prendre la vôtre dans votre bibliothèque partagée.'), tone: 'info' }] });
    if (unsure.length) sections.push({ title: t('À vérifier ({n})', { n: unsure.length }), rows: unsure.map(row) });
    if (blocked.length) sections.push({ title: t('Indisponibles ({n})', { n: blocked.length }), rows: blocked.map(row) });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Partie en direct avec {name}', { name: plain }),
      icon: 'gamepad',
      lead:
        keys.length > 1
          ? t('Choisissez la table : en tête, celles que {names} ont tous dans la même version que vous. Les autres sont grisées, avec leur raison. Chacun joue sa partie sur sa borne, au même moment.', { names: plain })
          : t('Choisissez la table : en tête, celles que {name} a dans la même version que vous. Les autres sont grisées, avec leur raison. Chacun joue sa partie sur sa borne, au même moment.', { name: plain }),
      sections,
      actions,
      back,
    };
  }

  function inviteOn(table: TableEntry, key: string, back: () => void): void {
    inviteAll(table, [key], back);
  }

  /** Un salon sur cette table (celui ouvert dessus, sinon un nouveau : l'ancien est annulé, ses invités prévenus), puis chaque invitation. */
  function inviteAll(table: TableEntry, keys: readonly string[], back: () => void): void {
    gameBack = back;
    void host.library.task(t('Préparation de la partie : empreinte de la table…'), async () => {
      const current = games.current();
      // Déjà un salon sur cette table : les amis y sont ajoutés ; sinon un nouveau salon.
      if (!current || current.host !== myKey() || current.phase !== 'gathering' || games.table()?.file !== table.file) {
        if (current?.phase === 'finished' || current?.phase === 'cancelled') games.close();
        // Changer de table : les mêmes invités reçoivent aussitôt la nouvelle invitation (« changée de table », pas « annulée »).
        else if (current?.host === myKey()) games.leave({ replacedFor: keys });
        await games.create(table);
      }
      const sent = keys.filter((key) => games.invite(key, nameOf(key)));
      const missed = keys.filter((key) => !sent.includes(key));
      if (keys.length === 1) {
        const plain = nameOf(keys[0]!);
        flash = sent.length
          ? { text: t('Invitation envoyée à {name}', { name: plain }), detail: t('Elle reste valable deux minutes'), tone: 'ok' }
          : { text: host.net.online(keys[0]!) ? t('Salon complet : {max} joueurs au plus', { max: LIVE_MAX_PLAYERS }) : t('{name} n’est plus en ligne', { name: plain }), tone: 'warning' };
      } else {
        const text = tn(sent.length, 'Invitation envoyée à {n} ami', 'Invitations envoyées à {n} amis');
        flash = missed.length
          ? { text, detail: t('Pas d’invitation pour {names} : plus en ligne, ou salon complet', { names: missed.map(nameOf).join(', ') }), tone: 'warning' }
          : { text, detail: t('Elles restent valables deux minutes'), tone: 'ok' };
      }
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
      // Une autre table pour les mêmes invités : celles qu'ils ont tous dans la même version en tête.
      const guests = game.players.filter((p) => !p.host && ['invited', 'accepted', 'declined'].includes(p.state) && host.net.online(p.key)).map((p) => p.key);
      if (guests.length) actions.push({ label: t('Changer de table'), detail: t('Les tables qu’ils ont aussi dans la même version en tête ; ils reçoivent une nouvelle invitation'), icon: 'tables', run: () => inviteFriends(guests, () => openGame()) });
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
        ...(hosting && answerRows(game).length ? [{ rows: answerRows(game) }] : []),
        { rows: [tableRow(game), ...manualRows(game.table.manual), ...(myself?.host ? [] : ballsRow(myself?.balls, game.table.balls)), boardRow()] },
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
      const table = games.table();
      const free = host.net.state().friends.filter((f) => host.net.online(f.key) && !game?.players.some((p) => p.key === f.key && ['invited', 'accepted'].includes(p.state)));
      const fits = new Map(free.map((f) => [f.key, table ? fitFor(table, f.key) : undefined]));
      const rank = (key: string) => (fits.get(key) ? fitRank(fits.get(key)!) : 0);
      const friends = free.sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name));
      const rows: Row[] = friends.map((f) => {
        const fit = fits.get(f.key);
        const invite = () => {
          flash = games.invite(f.key, f.name) ? { text: t('Invitation envoyée à {name}', { name: f.name }), tone: 'ok' } : { text: t('Invitation impossible : salon complet, ou ami plus en ligne'), tone: 'warning' };
          openGame();
        };
        // Sans la même version, il ne pourrait que refuser : grisé, avec sa raison (et sa version à récupérer).
        const fetch = fit?.fit === 'other-version' && table && host.openFriendTable ? () => fetchVersion(f.key, table, () => openAddFriend()) : undefined;
        const run = !fit || fit.fit === 'same' || fit.fit === 'unknown' ? invite : (fetch ?? (() => undefined));
        const index = actions.push({ label: f.name, key: `friend:${f.key}`, icon: 'friend-add', run }) - 1;
        return {
          text: f.name,
          ...face(f.key, f.name),
          detail: fit ? [liveFitLabel(fit), fetch ? t('Start : récupérer sa version chez {name}', { name: f.name }) : undefined].filter(Boolean).join(' · ') : t('En ligne'),
          tone: fit ? fitTone(fit) : 'ok',
          action: index,
          pick: true,
        };
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
  /**
   * Un joueur aux résultats : son score de la partie (lu en direct, sinon entré au tableau de la
   * table), son rang dans la partie, et pourquoi il est hors classement ; jamais sa place au tableau
   * de sa table, qui ne dit rien de la partie (essai du 30/10/2026 : « place 1 du tableau » pour les deux).
   */
  function resultRow(p: LivePlayer, place: number | undefined, compared: boolean, hostBalls: number | undefined): Row {
    const score = liveScore(p);
    const who = p.key === myKey() ? t('{name} (vous)', { name: p.name }) : p.name;
    const played = p.seconds !== undefined ? playDuration(p.seconds) : undefined;
    const reason = p.manual && score === undefined
      ? liveManualScoreLabel()
      : p.multi
      ? t('Hors classement : plusieurs joueurs dans sa table')
      : p.host
        ? undefined
        : p.settings !== 'ok'
          ? t('Hors classement : réglages de l’hôte non reçus')
          : liveOtherBalls(p, hostBalls)
            ? t('Hors classement : {balls}', { balls: liveBallsAgainst(p.balls!, hostBalls!) })
            : undefined;
    const detail = p.state === 'done' ? [reason ?? t('Partie terminée'), played].filter(Boolean).join(' · ') : livePlayerStateLabel(p, hostBalls);
    return {
      ...face(p.key, p.name),
      text: score !== undefined && place ? `${place}. ${who} — ${formatNumber(score)}` : score !== undefined ? `${who} — ${formatNumber(score)}` : p.state === 'done' ? `${who} — ${t('Score non disponible')}` : who,
      detail,
      icon: score !== undefined ? 'star' : 'friend-list',
      tone: p.state === 'done' || (p.state === 'loading' && p.ready) ? 'ok' : p.state === 'playing' || p.state === 'loading' ? 'info' : 'quiet',
      ...(place === 1 && compared ? { badges: [t('Meilleur score connu')] } : p.state === 'playing' || p.state === 'loading' ? { badges: [t('En partie')] } : {}),
    };
  }

  function buildResults(game: LiveGame, back: () => void): Built {
    const standings = liveStandings(game);
    const finished = game.phase === 'finished';
    if (finished) resultsSeen = game.id;
    const hosting = game.host === myKey();
    const actions: Action[] = [];
    if (finished && hosting && games.table()) {
      const again = game.players.filter((p) => !p.host && ['done', 'failed', 'playing', 'loading', 'accepted'].includes(p.state) && host.net.online(p.key));
      if (again.length) actions.push({ label: t('Rejouer avec les mêmes joueurs'), detail: again.map((p) => p.name).join(', '), icon: 'restart', tone: 'ok', run: () => replay(again) });
      if (again.length) actions.push({ label: t('Autre table, mêmes joueurs'), detail: t('Les tables qu’ils ont aussi dans la même version en tête'), icon: 'tables', run: () => inviteFriends(again.map((p) => p.key), () => openGame()) });
    }
    actions.push({ label: finished ? t('Fermer') : t('Retour'), detail: finished ? undefined : t('Les résultats arrivent dans « Mes amis »'), icon: finished ? 'check' : 'back', run: () => { if (finished) games.close(); back(); } });
    const ranked = standings.filter((p) => liveScore(p) !== undefined && liveRanked(p, game.table.balls));
    const otherBalls = game.players.some((p) => !p.host && liveOtherBalls(p, game.table.balls));
    // Départ commun pas encore donné : pourquoi la partie n'a pas démarré (livestart.ts) ; le statut de chacun est dans sa ligne.
    const wait = game.phase === 'playing' ? (games.waitView() ?? liveWaitView(game, myKey(), now())) : undefined;
    const waitRow: Row[] = wait && !wait.go ? [{ text: wait.title, detail: [wait.lead, wait.note].filter(Boolean).join(' · '), tone: 'info', icon: 'clock' }] : [];
    return {
      heading: finished ? t('Résultats') : t('Partie en direct en cours'),
      icon: 'gamepad',
      subheading: game.title,
      lead: t('Les scores arrivent à mesure que chacun finit sa partie.'),
      sections: [
        ...takeFlash(),
        ...(waitRow.length ? [{ rows: waitRow }] : []),
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
    const build = () => buildInvite(id, back);
    inviteScreen = { id, build };
    const show = () => host.library.openCustom(build, Number.MAX_SAFE_INTEGER);
    if (!invite || matches.has(id)) return show();
    // La table vérifiée d'abord : l'écran s'ouvre avec toutes ses actions, le curseur sur la première.
    void games.matchFor(invite).then(
      (m) => {
        matches.set(id, { match: m.match, ...(m.balls ? { balls: m.balls } : {}), ...(m.scriptDiffers ? { scriptDiffers: true } : {}), ...(m.manual ? { manual: m.manual } : {}) });
        show();
      },
      () => show(),
    );
  }

  /**
   * L'invitation a pris fin pendant que son écran était ouvert : il le dit, avec qui et pourquoi, et
   * un retour (essai réel du 04/11/2026 : l'invité restait sur « Accepter / Refuser » sans savoir
   * qu'elle était annulée) ; changée de table, la nouvelle invitation est à un bouton.
   */
  function buildInviteEnded(id: string, back: () => void): Built {
    const end = games.inviteEnd(id);
    const name = end?.name ?? '?';
    const said: Record<string, { text: string; detail?: string }> = {
      cancelled: { text: t('Invitation annulée par {name}', { name }) },
      started: { text: t('{name} a lancé la partie sans vous', { name }), detail: t('Votre réponse n’est pas arrivée avant le départ') },
      replaced: { text: t('{name} a changé de table', { name }), detail: t('Une nouvelle invitation vous attend') },
      expired: { text: t('Invitation expirée'), detail: t('Pas de réponse en deux minutes') },
      offline: { text: t('Invitation retirée par {name}', { name }), detail: t('Votre borne semblait hors ligne de son côté') },
      'host-offline': { text: t('{name} est passé hors ligne', { name }), detail: t('Son invitation est retirée') },
    };
    const r = end && end.why !== 'answered' ? said[end.why]! : { text: t('Cette invitation n’est plus valable'), detail: t('Annulée, expirée (deux minutes), ou déjà répondue') };
    const next = end?.next && games.invites().some((i) => i.id === end.next) ? end.next : undefined;
    const actions: Action[] = [
      ...(next ? [{ label: t('Voir la nouvelle invitation'), icon: 'gamepad' as const, tone: 'ok' as const, run: () => openInvite(next, back) }] : []),
      { label: t('Retour'), icon: 'back', run: back },
    ];
    return {
      heading: end ? t('Invitation de {name}', { name }) : t('Invitation à une partie en direct'),
      icon: 'gamepad',
      ...(end?.title ? { subheading: end.title } : {}),
      sections: [...takeFlash(), { rows: [{ text: r.text, ...(r.detail ? { detail: r.detail } : {}), tone: 'warning', icon: 'close' }] }],
      actions,
      back,
    };
  }

  function buildInvite(id: string, back: () => void): Built {
    const invite = games.invites().find((i) => i.id === id);
    if (!invite) return buildInviteEnded(id, back);
    const found = matches.get(id);
    const match = found?.match;
    const rows: Row[] = [
      tableRow(invite),
      ...(liveBehind(invite.host) ? [{ text: t('Ancienne version chez {name}', { name: invite.host.name }), detail: liveBehindLabel(invite.host), tone: 'warning', icon: 'alert' } as Row] : []),
      ...(!match
        ? [{ text: t('Vérification de la table sur votre borne…'), tone: 'quiet' } as Row]
        : match === 'other-version'
          ? [otherVersionRow(invite.host.name, found?.scriptDiffers)]
          : [{ text: liveMatchLabel(match), tone: match === 'same' ? 'ok' : 'error' } as Row]),
      ...(match === 'same' ? ballsRow(found?.balls, invite.table.balls) : []),
      // Sans relevé chez lui ou chez moi : départ manuel, pas de score en direct, dit avant d'accepter.
      ...manualRows(found?.manual ?? invite.table.manual),
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
          // Annulée pendant la vérification : l'écran dit déjà pourquoi (buildInviteEnded).
          if (r.gone) return;
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
      ...face(invite.host.key, invite.host.name),
      subheading: invite.host.name,

      lead: t('Jouez chacun sur votre borne, avec un départ commun.'),
      sections: [...takeFlash(), { rows }],
      actions,
      back,
    };
  }

  function playableWithFriends(tables: readonly TableEntry[]): FriendsShelf {
    const files = new Set<string>();
    const friends = host.net.state().friends;
    if (!friends.length) return { state: 'none', files };
    const online = friends.filter((f) => host.net.online(f.key));
    if (!online.length) return { state: searching() ? 'searching' : 'offline', files };
    let unsure = false;
    for (const f of online) {
      for (const c of choicesFor(tables, [f.key])) {
        const fit = c.friends[0]?.fit;
        if (fit === 'same') files.add(c.entry.file.toLowerCase());
        else if (fit === 'unknown') unsure = true;
      }
    }
    // Rien de sûr encore, et une bibliothèque attendue ou une empreinte en calcul : on cherche.
    return { state: !files.size && unsure ? 'searching' : 'ready', files };
  }

  return {
    playableWithFriends,
    inviteFriend,
    inviteFriends,
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
    onScreen: () => host.library.isShowing?.(buildGame) ?? false,
    inviteOnScreen: (id) => inviteScreen?.id === id && (host.library.isShowing?.(inviteScreen.build) ?? false),
    unseenResults: () => {
      const game = games.current();
      return game?.phase === 'finished' && game.id !== resultsSeen;
    },
  };
}
