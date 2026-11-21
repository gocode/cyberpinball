// Parties instantanées à l'écran (packages/core/src/instantgames.ts, 16/11/2026) : la porte de
// l'accueil Communauté, la liste des parties ouvertes par les autres joueurs (amis ou non), et
// « Ouvrir une partie instantanée » : la table, puis le nombre de joueurs (2 à 4, vous compris).
// La partie ouverte, son salon d'attente, le départ et les résultats sont ceux de la partie en
// direct (live-game-menu.ts) : elle part d'elle-même dès qu'elle est complète.
//
// Une partie se rejoint avec la même version de la table (même .vpx, même script) : vérifiée chez
// moi pour chaque annonce, à son arrivée ; sans elle, la ligne reste grisée avec sa raison.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des services d'essai.

import { createHash } from 'node:crypto';
import {
  avatarView,
  boardKey,
  INSTANT_MAX_PLAYERS,
  INSTANT_MIN_PLAYERS,
  INSTANT_OPEN_MS,
  instantFree,
  instantInvite,
  instantMax,
  locale,
  playerFlag,
  socialAgo,
  t,
  tn,
  type InstantGame,
  type LiveTableMatch,
  type RemoteInstantAct,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section } from './library';
import type { RemoteInstant } from './phone-remote';
import type { LiveGames } from './live-game';
import type { LiveMenu } from './live-game-menu';
import type { SocialNet } from './social-net';
import { onGesture } from './gesture-flash';

export interface InstantMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    task(message: string, work: () => Promise<void> | void): Promise<void>;
  };
  net: Pick<SocialNet, 'state' | 'status' | 'avatarFile'> & Partial<Pick<SocialNet, 'online'>>;
  games: LiveGames;
  /** La table choisie sur la roue de la borne : celle qu'« Ouvrir une partie » propose au téléphone. */
  selected?(): TableEntry | undefined;
  /** Pourquoi la borne ne peut pas ouvrir d'écran en ce moment (une partie en cours) ; undefined : elle peut. */
  busy?(): string | undefined;
  /** Le salon, le départ et les résultats de la partie en cours. */
  live: Pick<LiveMenu, 'open'>;
  tables(): readonly TableEntry[];
  /** Partage et réseau (activer le partage). */
  openSharing(back: () => void): void;
  redraw(): void;
  now?(): Date;
}

export interface InstantMenu {
  /** Ce que dit la porte de l'accueil Communauté. */
  door(): { label: string; detail: string; quiet: boolean };
  /** Les parties ouvertes, « Retour » vers `back`. */
  open(back: () => void): void;
  /** Entrée « Partie instantanée » de la fiche d'une table : le nombre de joueurs, puis la partie ouverte. */
  sheetAction(table: TableEntry, back: () => void): Action;
  /**
   * Fiche d'une table : une partie ouverte par un autre sur cette version exacte (boardKey), à
   * rejoindre ; elle passe avant « Jouer ». Undefined : aucune.
   */
  joinOn(board: string, back: () => void): Action | undefined;
  /** Parties ouvertes par d'autres en ce moment. */
  count(): number;
  /** Pour « Joueurs » au téléphone : les parties ouvertes, en ouvrir une, la mienne (instant-menu.ts reste la source). */
  remote(): RemoteInstant;
  /**
   * Un geste fait au téléphone : la borne retrouve la partie, la table (sa référence) ou l'ami, et ne
   * fait que ce que son propre écran permettrait ; rejoindre et ouvrir se passent à la borne.
   */
  remoteAct(act: RemoteInstantAct, opts: { id?: string; table?: string; count?: number; key?: string }, to: () => void): void;
}

/** La référence d'une table au téléphone : jamais son chemin. */
export const instantTableRef = (table: TableEntry): string => createHash('sha256').update(table.file).digest('hex').slice(0, 16);
/** Tables envoyées au plus pour « Changer », et combien de temps après la demande. */
const PHONE_TABLES_MAX = 400;
const PHONE_TABLES_MS = 2 * 60_000;

export function createInstantMenu(host: InstantMenuHost): InstantMenu {
  const now = () => host.now?.() ?? new Date();
  const games = host.games;
  const lib = host.library;
  const myKey = () => host.net.state().key.publicKey;
  let back: () => void = () => undefined;
  let flash: Row | undefined;
  onGesture(() => (flash = undefined));
  const flashSections = (): Section[] => (flash ? [{ rows: [flash] }] : []);

  /** Ce que j'ai de la table de chaque annonce : vérifié une fois par partie, l'écran redessiné à l'arrivée. */
  const matches = new Map<string, { match?: LiveTableMatch; scriptDiffers?: boolean }>();
  function matchOf(g: InstantGame): { match?: LiveTableMatch; scriptDiffers?: boolean } {
    const known = matches.get(g.id);
    if (known) return known;
    matches.set(g.id, {});
    void games.matchFor(instantInvite(g, now())).then(
      (m) => {
        matches.set(g.id, { match: m.match, ...(m.scriptDiffers ? { scriptDiffers: true } : {}) });
        host.redraw();
      },
      () => matches.set(g.id, { match: 'missing' }),
    );
    if (matches.size > 200) matches.delete(matches.keys().next().value!);
    return {};
  }

  /** Ma partie instantanée en cours, si j'en suis (hôte ou joueur). */
  const myInstant = () => {
    const g = games.current();
    return g?.instant && g.phase !== 'finished' && g.phase !== 'cancelled' ? g : undefined;
  };

  const unavailable = (): string | undefined => {
    const s = host.net.state();
    if (!s.enabled) return t('Indisponible : partage désactivé (Partage et réseau)');
    if (!host.net.status().running) return t('Connexion au réseau des bornes…');
    return undefined;
  };

  function door(): ReturnType<InstantMenu['door']> {
    const problem = unavailable();
    const label = t('Parties instantanées');
    if (problem) return { label, detail: problem, quiet: true };
    const mine = myInstant();
    if (mine) {
      const seats = mine.players.filter((p) => p.state === 'accepted').length;
      return { label, detail: t('Votre partie : {title} · {n} sur {max}', { title: mine.title, n: seats, max: mine.instant!.max }), quiet: false };
    }
    const n = games.instantGames().length;
    return { label, detail: n ? tn(n, '{n} partie ouverte : rejoignez-la', '{n} parties ouvertes : rejoignez-en une') : t('Aucune partie ouverte : lancez la vôtre'), quiet: false };
  }

  // ---------- Les parties ouvertes ----------

  /** Ce que j'ai de la table d'une partie ouverte (ni invitation ni récupération ici : elle se rejoint, ou pas). */
  const fitText = (match: LiveTableMatch, scriptDiffers?: boolean) =>
    match === 'same' ? t('Même version chez vous') : match === 'missing' ? t('Vous n’avez pas cette table') : scriptDiffers ? t('Même table, autre script : la partie demande le même') : t('Autre version de cette table chez vous');

  function seatsText(g: Pick<InstantGame, 'seats' | 'max'>): string {
    return t('{n} sur {max} joueurs', { n: g.seats.length, max: g.max });
  }

  function gameRow(g: InstantGame, actions: Action[]): Row {
    const found = matchOf(g);
    const same = found.match === 'same';
    const join = () => joinGame(g);
    const index = actions.push({ label: g.title, key: `instant:${g.id}`, icon: 'rocket', run: same ? join : () => undefined }) - 1;
    const fit = !found.match ? t('Vérification de la table sur votre borne…') : fitText(found.match, found.scriptDiffers);
    const free = instantFree(g);
    const others = g.seats.filter((s) => s.key !== g.key).map((s) => s.name);
    const detail = [
      t('Ouverte par {name} {ago}', { name: g.name, ago: socialAgo(g.opened, now()) }),
      seatsText(g),
      others.length ? t('avec {names}', { names: others.join(', ') }) : undefined,
      fit,
    ].filter(Boolean).join(' · ');
    return {
      text: g.title,
      avatar: avatarView(g.key, g.name, host.net.avatarFile(g.key)),
      flag: playerFlag(g.country, locale()),
      detail,
      tone: same ? 'ok' : found.match ? 'quiet' : 'info',
      badges: [tn(free, '{n} place', '{n} places')],
      action: index,
      pick: true,
    };
  }

  function build(): Built {
    const actions: Action[] = [];
    const sections: Section[] = [...flashSections()];
    const here = () => lib.openCustom(build);
    const problem = unavailable();
    const mine = myInstant();
    if (problem) {
      sections.push({ rows: [{ text: problem, icon: 'network', tone: 'quiet' }] });
      if (!host.net.state().enabled) actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    } else {
      // En tête : ma partie en cours (hôte ou joueur), sinon de quoi en ouvrir une.
      if (mine) {
        const seats = mine.players.filter((p) => p.state === 'accepted').length;
        actions.push({ label: t('Votre partie : {title}', { title: mine.title }), detail: t('{n} sur {max} joueurs · départ dès qu’elle est complète', { n: seats, max: mine.instant!.max }), icon: 'gamepad', tone: 'ok', attention: true, run: () => host.live.open(here) });
      } else {
        actions.push({ label: t('Ouvrir une partie instantanée'), detail: t('Choisissez la table et le nombre de joueurs : elle s’affiche chez tous les joueurs en ligne'), icon: 'plus', tone: 'ok', run: () => openChooseTable(here) });
      }
      const open = games.instantGames();
      if (open.length) sections.push({ title: t('Ouvertes en ce moment ({n})', { n: open.length }), kind: 'players', rows: open.map((g) => gameRow(g, actions)) });
      else sections.push({ rows: [{ text: t('Aucune partie ouverte pour l’instant'), detail: t('Ouvrez la vôtre : elle s’affiche chez tous les joueurs en ligne, et part dès qu’elle est complète'), icon: 'info', tone: 'quiet' }] });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Parties instantanées'),
      icon: 'rocket',
      lead: t('Une partie en direct ouverte à tous : chacun joue sur sa borne, la même version de la table, au même moment. Elle part d’elle-même dès qu’elle est complète.'),
      sections,
      actions,
      back,
      hint: t('Flippers : choisir · Start : rejoindre · Exit : retour'),
    };
  }

  function joinGame(g: InstantGame): void {
    void lib.task(t('Vérification de la table…'), async () => {
      const found = await games.joinInstant(g);
      if (found.match !== 'same') {
        matches.set(g.id, { match: found.match, ...(found.scriptDiffers ? { scriptDiffers: true } : {}) });
        flash = { text: fitText(found.match, found.scriptDiffers), detail: t('La partie se joue sur la même version pour tous'), tone: 'warning' };
      }
    }).then(() => {
      if (myInstant()?.id === g.id) host.live.open(() => lib.openCustom(build));
      else lib.openCustom(build);
    });
  }

  // ---------- Ouvrir une partie ----------

  /** Les tables jouables en partie en direct : celles de VPX (Pinball FX ne se lance pas à plusieurs). */
  const playable = () => host.tables().filter((table) => table.emulator === 'vpx');
  const fullTitle = (table: TableEntry) => (table.manufacturer && table.year ? `${table.title} (${table.manufacturer} ${table.year})` : table.title);

  function openChooseTable(from: () => void): void {
    lib.openCustom(() => buildChooseTable(from));
  }

  function buildChooseTable(from: () => void): Built {
    const actions: Action[] = [];
    const list = [...playable()].sort((a, b) => a.title.localeCompare(b.title));
    const reopen = () => openChooseTable(from);
    const rows: Row[] = list.map((table) => {
      const index = actions.push({ label: table.title, key: `table:${table.file}`, icon: 'play', run: () => openChooseCount(table, reopen) }) - 1;
      return { text: fullTitle(table), ...(table.version ? { detail: table.version } : {}), action: index, pick: true };
    });
    actions.push({ label: t('Retour'), icon: 'back', run: from });
    return {
      heading: t('Ouvrir une partie instantanée'),
      icon: 'rocket',
      lead: t('Choisissez la table. Ceux qui ont la même version pourront vous rejoindre.'),
      sections: rows.length ? [{ title: t('Vos tables ({n})', { n: rows.length }), rows }] : [{ rows: [{ text: t('Aucune table VPX sur cette borne'), tone: 'info' }] }],
      actions,
      back: from,
    };
  }

  function openChooseCount(table: TableEntry, from: () => void): void {
    lib.openCustom(() => buildChooseCount(table, from));
  }

  function buildChooseCount(table: TableEntry, from: () => void): Built {
    // Une liste à choisir, comme les tables : trois entrées d'une même nature, sans icône chacune.
    const actions: Action[] = [];
    const rows: Row[] = [];
    for (let n = INSTANT_MIN_PLAYERS; n <= INSTANT_MAX_PLAYERS; n++) {
      const count = n;
      const index = actions.push({ label: t('{n} joueurs', { n: count }), key: `count:${count}`, run: () => openGame(table, count) }) - 1;
      rows.push({ text: t('{n} joueurs', { n: count }), detail: tn(count - 1, 'Vous et {n} autre joueur', 'Vous et {n} autres joueurs'), action: index, pick: true });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: from });
    return {
      heading: t('Nombre de joueurs'),
      icon: 'rocket',
      subheading: fullTitle(table),
      lead: t('La partie part d’elle-même dès que ce nombre est atteint, pour tout le monde.'),
      sections: [{ title: t('Joueurs, vous compris'), rows }],
      actions,
      back: from,
    };
  }

  function openGame(table: TableEntry, max: number): void {
    void lib.task(t('Préparation de la partie : empreinte de la table…'), async () => {
      const current = games.current();
      if (current?.phase === 'finished' || current?.phase === 'cancelled') games.close();
      else if (current) games.leave();
      await games.openInstant(table, max);
    }).then(() => host.live.open(() => lib.openCustom(build)));
  }

  // ---------- Au téléphone (lot 4 de la Communauté au téléphone, 18/11/2026) ----------

  /** « Changer » demandé au téléphone (ms) : la liste des tables part pendant PHONE_TABLES_MS. */
  let tablesAt = 0;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const face = (key: string, name: string) => avatarView(key, name, host.net.avatarFile(key));

  /** Mes amis en ligne qui ne sont pas dans ma partie, si j'en suis l'hôte et qu'il reste une place ; sinon pourquoi personne. */
  function inviteState(game: NonNullable<ReturnType<typeof myInstant>>): { candidates: { key: string; name: string }[]; reason?: string } {
    if (game.host !== myKey()) return { candidates: [], reason: t('Seul celui qui a ouvert la partie invite') };
    const taken = game.players.filter((p) => p.host || p.state === 'accepted' || p.state === 'invited').length;
    if (taken >= game.instant!.max) return { candidates: [], reason: t('Complète : départ pour tout le monde') };
    const candidates = host.net
      .state()
      .friends.filter((f) => host.net.online?.(f.key) && !game.players.some((p) => p.key === f.key))
      .map((f) => ({ key: f.key, name: f.name }));
    return candidates.length ? { candidates } : { candidates, reason: t('Aucun ami en ligne pour l’instant') };
  }

  function remote(): RemoteInstant {
    const problem = unavailable();
    if (problem) return { blocked: problem, games: [] };
    const mine = myInstant();
    const busy = host.busy?.();
    const list = games.instantGames().map((g) => {
      const found = matchOf(g);
      const others = g.seats.map((s) => face(s.key, s.name));
      const reason = busy ?? (!found.match ? t('Vérification de la table sur votre borne…') : found.match !== 'same' ? fitText(found.match, found.scriptDiffers) : mine?.id === g.id ? t('Vous êtes dans cette partie') : undefined);
      return {
        id: g.id,
        title: g.title,
        detail: [t('Ouverte par {name} {ago}', { name: g.name, ago: socialAgo(g.opened, now()) }), seatsText(g)].join(' · '),
        avatars: others.slice(0, INSTANT_MAX_PLAYERS),
        free: tn(instantFree(g), '{n} place', '{n} places'),
        ...(reason ? { reason } : { join: true as const }),
      };
    });
    const out: RemoteInstant = { games: list };
    if (mine) {
      const seated = mine.players.filter((p) => p.host || p.state === 'accepted');
      const invite = inviteState(mine);
      const max = mine.instant!.max;
      const hosting = mine.host === myKey();
      const closes = new Date(Date.parse(mine.instant!.opened) + INSTANT_OPEN_MS).toISOString();
      out.mine = {
        title: mine.title,
        detail: t('{n} sur {max} joueurs', { n: seated.length, max }),
        seats: seated.map((p) => ({ name: p.key === myKey() ? t('Vous') : p.name, avatar: face(p.key, p.name), ...(p.key === myKey() ? { me: true as const } : {}) })),
        max,
        status: seated.length >= max ? t('Complète : départ pour tout le monde') : t('Départ à {n} joueurs', { n: max }),
        closes: t('Ouverte {ago} · fermée à {time} si elle n’est pas complète', { ago: socialAgo(mine.instant!.opened, now()), time: time(closes) }),
        host: hosting,
        invitable: invite.candidates.map((f) => ({ key: f.key, name: f.name, detail: t('En ligne') })),
        ...(invite.reason ? { inviteReason: invite.reason } : {}),
        cancel: hosting ? t('Elle disparaît de la liste ; ceux qui l’ont rejointe en sont prévenus') : t('Votre place se libère pour un autre joueur'),
        note: t('Le départ, la partie et les résultats se passent à la borne ; le téléphone reste la télécommande et la messagerie.'),
      };
    } else {
      const chosen = host.selected?.();
      const table = chosen && chosen.emulator === 'vpx' ? { ref: instantTableRef(chosen), title: fullTitle(chosen) } : undefined;
      const wanted = Date.now() - tablesAt < PHONE_TABLES_MS;
      out.open = {
        ...(busy ? { reason: busy } : !playable().length ? { reason: t('Aucune table VPX sur cette borne') } : {}),
        ...(table ? { table } : {}),
        ...(wanted ? { tables: [...playable()].sort((a, b) => a.title.localeCompare(b.title)).slice(0, PHONE_TABLES_MAX).map((e) => ({ ref: instantTableRef(e), title: fullTitle(e) })) } : {}),
        min: INSTANT_MIN_PLAYERS,
        max: INSTANT_MAX_PLAYERS,
        text: t('Elle s’affiche chez tous les joueurs en ligne et part d’elle-même dès qu’elle est complète ; sinon, elle se ferme au bout de {n} minutes. Vous jouez à la borne.', { n: Math.round(INSTANT_OPEN_MS / 60_000) }),
      };
    }
    return out;
  }

  function remoteAct(act: RemoteInstantAct, opts: { id?: string; table?: string; count?: number; key?: string }, to: () => void): void {
    if (unavailable()) return;
    if (act === 'tables') {
      tablesAt = Date.now();
      return;
    }
    const mine = myInstant();
    if (act === 'cancel') {
      if (mine) games.leave();
      return;
    }
    if (act === 'invite') {
      const friend = mine ? inviteState(mine).candidates.find((f) => f.key === opts.key) : undefined;
      if (friend) games.invite(friend.key, friend.name);
      return;
    }
    // Rejoindre et ouvrir se passent à la borne : pas pendant une partie.
    if (host.busy?.()) return;
    if (act === 'join') {
      const g = games.instantGames().find((x) => x.id === opts.id);
      if (g && matchOf(g).match === 'same' && mine?.id !== g.id) {
        back = to;
        joinGame(g);
      }
      return;
    }
    if (act === 'open') {
      if (mine) return;
      const table = opts.table ? playable().find((e) => instantTableRef(e) === opts.table) : host.selected?.();
      if (!table || table.emulator !== 'vpx') return;
      back = to;
      openGame(table, instantMax(opts.count ?? INSTANT_MIN_PLAYERS));
    }
  }

  return {
    remote,
    remoteAct,
    door,
    open(to) {
      back = to;
      lib.openCustom(build);
    },
    sheetAction(table, from) {
      const base = { label: t('Partie instantanée'), icon: 'rocket' as const };
      const problem = unavailable();
      if (problem) return { ...base, detail: problem, tone: 'quiet', run: () => undefined };
      if (table.emulator !== 'vpx') return { ...base, detail: t('Parties en direct : tables VPX seulement'), tone: 'quiet', run: () => undefined };
      return { ...base, detail: t('Ouverte à tous : elle part dès qu’elle est complète'), run: () => ((back = from), openChooseCount(table, from)) };
    },
    joinOn(board, from) {
      if (unavailable() || myInstant()) return undefined;
      const g = games.instantGames().find((x) => x.key !== myKey() && boardKey(x.table) === board && instantFree(x) > 0);
      if (!g) return undefined;
      return { label: t('Rejoindre la partie de {name}', { name: g.name }), detail: t('{n} sur {max} joueurs · départ dès qu’elle est complète', { n: g.seats.length, max: g.max }), icon: 'friends', tone: 'ok', attention: true, run: () => ((back = from), joinGame(g)) };
    },
    count: () => (unavailable() ? 0 : games.instantGames().filter((g) => g.key !== myKey()).length),
  };
}
