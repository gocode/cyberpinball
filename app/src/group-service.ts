// Groupes, publics ou privés (packages/core/src/groups.ts) sur le réseau des bornes (social-net.ts).
//
// Les bornes des membres se relient directement par leur clé (setGroupPeers) et s'échangent ce qui
// leur manque : toutes les GROUP_SYNC_MS, et dès qu'un membre devient joignable, chacune dit d'une
// empreinte ce qu'elle a de chaque groupe (« grp-sum ») ; une empreinte différente fait dire la liste
// des lignes (« grp-have »), et l'autre envoie celles qui manquent (« grp »). Une ligne que j'écris
// part tout de suite vers les membres joignables, et chacun la relaie aux autres membres joignables :
// un membre absent la reçoit de n'importe quel membre, à son retour. Rien ne passe par une borne
// étrangère au groupe ; les messages d'un groupe ne partent que vers ses membres.
//
// Une invitation part à la borne de l'ami invité (« grp-invite » : les lignes d'appartenance, sans
// les messages), de nouveau tant qu'elle n'est pas accusée (« grp-invite-ok »). Un refus part vers
// qui a invité ; une arrivée vers tous les membres.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un réseau d'essai.

import {
  acceptInvitation,
  addMine,
  createGroup,
  createTypingBoard,
  createTypingSender,
  type TypingSender,
  declineInvitation,
  dropOutbox,
  forgetInGroups,
  GROUP_BATCH,
  GROUP_HAVE_MAX,
  GROUP_MEMBERS_MAX,
  GROUPS_MAX,
  groupDigest,
  groupSendLimit,
  groupsFile,
  groupView,
  invitationLines,
  joinPublic,
  mergeAnnounces,
  publicGroups,
  playerPublicGroups,
  signAnnounce,
  verifyAnnounce,
  GROUP_ANNOUNCE_BATCH,
  GROUP_ANNOUNCE_MS,
  type GroupAccess,
  type GroupAnnounce,
  isInvited,
  isMember,
  leaveGroup,
  loadGroups,
  markDelivered,
  markGroupRead,
  mergeGroupLines,
  myGroups,
  receiveInvitation,
  saveGroups,
  saveOrWarn,
  setGroupMuted,
  signGroupLine,
  tidyGroups,
  verifyGroupLine,
  weekEnd,
  type GroupBody,
  type GroupEntry,
  type GroupInvitation,
  type GroupLine,
  type GroupMessage,
  type GroupsState,
  type GroupView,
  type PresenceTable,
  type Reaction,
} from '@cyberpinball/core';
import { randomBytes } from 'node:crypto';
import type { FriendMessage, SocialNet } from './social-net';

/** Empreintes redites à chaque membre joignable à ce rythme (et tout de suite à un membre qui revient). */
export const GROUP_SYNC_MS = 20_000;
/** Une empreinte inchangée n'est redite à un même membre qu'après ce délai. */
const SUM_AGAIN_MS = 60_000;
/** Ménage : au démarrage, puis toutes les heures. */
const TIDY_MS = 60 * 60_000;

export interface GroupServiceOptions {
  net: Pick<SocialNet, 'state' | 'online' | 'reachable' | 'send' | 'onMessage' | 'setGroupPeers' | 'country' | 'sendGroupDirectory'>;
  dataDir: string;
  now?: () => Date;
  /** Quelque chose a changé : redessiner. */
  onChange?: () => void;
  /** Des messages nouveaux d'autres membres (pas les réactions), dans un groupe qui n'est pas en sourdine. */
  onArrive?: (view: GroupView, lines: GroupLine[]) => void;
  /** Une invitation reçue d'un ami. */
  onInvite?: (invitation: GroupInvitation, view: GroupView) => void;
  /** J'ai écrit un message dans un groupe (niveau : présence au salon). */
  onOwnLine?: () => void;
  /** Essais : le rythme des empreintes (GROUP_SYNC_MS). */
  syncMs?: number;
  log?: (line: string) => void;
}

export type GroupSendResult = { line: GroupLine } | { reason: 'disabled' | 'member' | 'text' | 'gap' | 'burst' };

export interface GroupService {
  state(): GroupsState;
  /** Mes groupes, le plus récemment actif d'abord. */
  groups(): { entry: GroupEntry; view: GroupView }[];
  view(g: string): GroupView | undefined;
  entry(g: string): GroupEntry | undefined;
  /** Les invitations reçues, la plus récente d'abord, avec ce qu'elles disent du groupe. */
  invitations(): { invitation: GroupInvitation; view: GroupView }[];
  /** Créer un groupe et inviter ces amis ; rend son identifiant, ou undefined (nom refusé, trop de groupes). */
  create(name: string, friends: readonly { key: string; name: string }[], access?: GroupAccess): string | undefined;
  /** Le créateur ouvre (public) ou ferme (privé) son groupe ; fermé, il quitte les annuaires. */
  setAccess(g: string, access: GroupAccess): boolean;
  /** Les groupes publics de l'annuaire dont je ne suis pas membre. */
  publicGroups(): { announce: GroupAnnounce; view: GroupView }[];
  /** Les groupes publics d'un joueur que cette borne connaît (son profil public) ; `mine` : j'en suis aussi. */
  publicGroupsOf(key: string): { view: GroupView; mine: boolean }[];
  /** Rejoindre un groupe public de l'annuaire ; false s'il n'y est plus, s'il est plein ou si j'en ai été retiré. */
  joinPublic(g: string): boolean;
  /** Demander leur annuaire aux bornes reliées (l'écran « Groupes » s'ouvre). */
  askDirectory(): void;
  /** Inviter des amis dans un groupe dont je suis membre ; rend le nombre d'invitations écrites. */
  invite(g: string, friends: readonly { key: string; name: string }[]): number;
  send(g: string, text: string): GroupSendResult;
  /**
   * « En train d'écrire » (typing.ts) : mon champ pour ce groupe a changé (`active` : il reste du texte).
   * Le signal part aux membres joignables, au plus toutes les 3 s ; jamais gardé ni relayé.
   */
  typing(g: string, active: boolean): void;
  /** Les membres qui écrivent en ce moment dans ce groupe (pas moi), le premier arrivé d'abord. */
  typers(g: string): { key: string; name: string }[];
  /** Réagir à un message (son id) ; null : retirer ma réaction. */
  react(g: string, target: string, kind: Reaction | null): boolean;
  /** Supprimer mon message, pour tous. */
  remove(g: string, target: string): boolean;
  /** Choisir la table de la semaine (jusqu'au dimanche 23:59 qui vient). */
  setWeek(g: string, table: PresenceTable): boolean;
  /** Retirer un membre (ou une invitation en attente) : le créateur seulement. */
  expel(g: string, key: string): boolean;
  leave(g: string): boolean;
  accept(g: string): boolean;
  decline(g: string): boolean;
  markRead(g: string): void;
  setMuted(g: string, muted: boolean): void;
  /** Comptes supprimés par leur joueur (forget.ts). */
  forget(keys: ReadonlySet<string>): void;
  /** À appeler quand le réseau change : un membre revenu reçoit tout de suite mon empreinte et mes invitations. */
  observe(): void;
  stop(): void;
}

export function createGroupService(opts: GroupServiceOptions): GroupService {
  const now = () => opts.now?.() ?? new Date();
  const log = (line: string) => opts.log?.(line);
  const myKey = () => opts.net.state().key.publicKey;
  const me = () => {
    const s = opts.net.state();
    const country = opts.net.country();
    return { key: s.key, name: s.name, ...(country ? { country } : {}) };
  };
  let state = tidyGroups(loadGroups(opts.dataDir, now()), now());
  let saveTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  /** Mes envois récents (ms) : les limites des salons. */
  const sent: number[] = [];

  function save(): void {
    saveTimer ??= setTimeout(() => {
      saveTimer = undefined;
      saveOrWarn(groupsFile(opts.dataDir), () => saveGroups(opts.dataDir, state));
    }, 300);
    saveTimer.unref?.();
  }
  function commit(next: GroupsState): void {
    if (next === state) return;
    state = next;
    save();
    syncPeers();
    opts.onChange?.();
  }

  const viewOf = (g: string): GroupView | undefined => {
    const e = state.groups[g];
    return e ? groupView(e.lines, now()) : undefined;
  };
  const send = (key: string, message: GroupMessage) => opts.net.send(key, message as FriendMessage);
  const isFriend = (key: string) => opts.net.state().friends.some((f) => f.key === key);

  /** Les bornes à rejoindre : les membres et invités de mes groupes (et de ceux quittés depuis peu, le temps d'y porter mon départ). */
  function peerKeys(): string[] {
    const keys = new Set<string>();
    for (const e of Object.values(state.groups)) {
      const v = groupView(e.lines, now());
      if (!v) continue;
      for (const m of v.members) keys.add(m.key);
      for (const i of v.invited) keys.add(i.key);
    }
    keys.delete(myKey());
    return [...keys];
  }
  let peersShown = '';
  function syncPeers(): void {
    const keys = peerKeys().sort();
    const sig = keys.join(',');
    if (sig === peersShown) return;
    peersShown = sig;
    opts.net.setGroupPeers(keys);
  }

  /** Les lignes d'un groupe qu'on donne : celles comptées (valides à leur date). */
  function validLines(g: string): GroupLine[] {
    const e = state.groups[g];
    const v = e ? groupView(e.lines, now()) : undefined;
    return e && v ? e.lines.filter((l) => v.valid.has(l.id)) : [];
  }
  const digestOf = (g: string) => groupDigest(validLines(g).map((l) => l.id));

  /** Lignes vers les membres joignables du groupe, sauf `except`. */
  function spread(g: string, lines: readonly GroupLine[], except?: string): void {
    const v = viewOf(g);
    if (!v || !lines.length) return;
    for (const key of [...v.members.map((m) => m.key), ...v.invited.map((i) => i.key)]) {
      if (key === myKey() || key === except || !opts.net.reachable(key)) continue;
      for (let i = 0; i < lines.length; i += GROUP_BATCH) send(key, { t: 'grp', lines: lines.slice(i, i + GROUP_BATCH) });
    }
  }

  /** Dernière empreinte dite à chaque membre, par groupe : `g|clé` -> empreinte et moment. */
  const told = new Map<string, { h: string; at: number }>();
  /** Dernière liste demandée (« grp-have ») à chaque membre, par groupe : pas de va-et-vient. */
  const asked = new Map<string, number>();
  /** Invitations envoyées : identifiant de ligne -> moment, pour ne les redire qu'au rythme des empreintes. */
  const invitesSent = new Map<string, number>();
  const linked = new Set<string>();

  function tick(force = false): void {
    if (stopped || !opts.net.state().enabled) return;
    const t = Date.now();
    const reachableNow = new Set<string>();
    for (const [g, e] of Object.entries(state.groups)) {
      const v = groupView(e.lines, now());
      if (!v) continue;
      const amMember = isMember(v, myKey());
      // Un groupe quitté : seulement le temps de porter mon départ (son empreinte suffit).
      if (!amMember && !e.gone) continue;
      const h = digestOf(g);
      for (const m of v.members) {
        if (m.key === myKey() || !opts.net.reachable(m.key)) continue;
        reachableNow.add(m.key);
        const k = `${g}|${m.key}`;
        const last = told.get(k);
        const fresh = !linked.has(m.key);
        // Un membre qui devient joignable reçoit d'abord mes propres lignes : il ne me compte peut-être
        // pas encore parmi les membres (arrivée par l'annuaire, sans membre en ligne) et ignorerait l'empreinte.
        if (fresh) {
          const own = validLines(g).filter((l) => l.by === myKey()).slice(-GROUP_BATCH);
          if (own.length) send(m.key, { t: 'grp', lines: own });
        }
        if (force || fresh || !last || last.h !== h || t - last.at >= SUM_AGAIN_MS) {
          send(m.key, { t: 'grp-sum', g, h });
          told.set(k, { h, at: t });
        }
      }
      if (!amMember) continue;
      announce(g, e.lines, t);
      // Mes invitations pas encore remises : à la borne de l'ami, tant qu'elle ne les a pas accusées.
      for (const i of v.invited) {
        if (i.by !== myKey() || state.delivered.includes(i.line)) continue;
        if (!isFriend(i.key) || !opts.net.reachable(i.key)) continue;
        reachableNow.add(i.key);
        const was = invitesSent.get(i.line);
        if (!force && was !== undefined && t - was < (opts.syncMs ?? GROUP_SYNC_MS) && linked.has(i.key)) continue;
        invitesSent.set(i.line, t);
        send(i.key, { t: 'grp-invite', lines: invitationLines(e.lines, now()) });
      }
    }
    // Mes refus : vers qui m'a invité, dès qu'il est joignable.
    const outSent: string[] = [];
    for (const o of state.outbox) if (opts.net.reachable(o.to) && send(o.to, { t: 'grp', lines: [o.line] })) outSent.push(o.line.id);
    if (outSent.length) commit(dropOutbox(state, outSent));
    linked.clear();
    for (const k of reachableNow) linked.add(k);
  }

  /** Annonces de mes groupes publics : l'empreinte des lignes annoncées et le moment, par groupe. */
  const announced = new Map<string, { h: string; at: number }>();
  /** Mon groupe public (ou redevenu privé) annoncé à toutes les bornes reliées, s'il a changé ou au rythme des annonces. */
  function announce(g: string, lines: readonly GroupLine[], t: number): void {
    const a = signAnnounce({ key: opts.net.state().key }, lines, now());
    if (!a) return;
    const h = groupDigest(a.lines.map((l) => l.id));
    const last = announced.get(g);
    const isPublic = groupView(a.lines, now())?.access === 'public';
    if (last && last.h === h && (!isPublic || t - last.at < GROUP_ANNOUNCE_MS)) return;
    // Aucune borne reliée : redit au prochain relevé.
    if (opts.net.sendGroupDirectory({ t: 'grp-pub', ann: [a] }) > 0) announced.set(g, { h, at: t });
  }

  const syncTimer = setInterval(() => tick(), Math.max(1000, opts.syncMs ?? GROUP_SYNC_MS));
  syncTimer.unref?.();
  const tidyTimer = setInterval(() => commit(tidyGroups(state, now())), TIDY_MS);
  tidyTimer.unref?.();

  /** Qui peut me donner des lignes d'un groupe : ses membres, ses invités, ses anciens membres (leur départ). */
  const mayWrite = (v: GroupView, key: string) => isMember(v, key) || isInvited(v, key) || v.former.has(key);

  function receiveLines(from: string, raw: readonly GroupLine[]): void {
    const byGroup = new Map<string, GroupLine[]>();
    for (const r of raw) {
      const l = verifyGroupLine(r, now());
      if (!l) continue;
      const list = byGroup.get(l.g) ?? [];
      list.push(l);
      byGroup.set(l.g, list);
    }
    let next = state;
    const spreads: { g: string; lines: GroupLine[] }[] = [];
    for (const [g, lines] of byGroup) {
      const v = viewOf(g);
      // Dans un groupe public, n'importe qui arrive : sa ligne d'arrivée (de lui) suffit à l'accepter.
      const arriving = v?.access === 'public' && lines.some((l) => l.by === from && l.body.k === 'join');
      if (!v || !(mayWrite(v, from) || arriving)) continue;
      const merged = mergeGroupLines(next, g, lines, myKey(), now());
      if (!merged.fresh.length) continue;
      next = merged.state;
      spreads.push({ g, lines: merged.fresh });
    }
    if (next === state) return;
    commit(next);
    for (const s of spreads) {
      spread(s.g, s.lines, from);
      const e = state.groups[s.g];
      const v = viewOf(s.g);
      const texts = s.lines.filter((l) => l.body.k === 'msg' && l.by !== myKey());
      if (v && e && !e.muted && !e.gone && texts.length) opts.onArrive?.(v, texts);
    }
  }

  // « En train d'écrire » : qui écrit dans chaque groupe (en mémoire), et mon signal pour chacun.
  const typingBoard = createTypingBoard(() => opts.onChange?.());
  const signals = new Map<string, TypingSender>();

  const unsubscribe = opts.net.onMessage((key, message) => {
    if (typeof message.t !== 'string' || !message.t.startsWith('grp')) return;
    const m = message as GroupMessage;
    switch (m.t) {
      case 'grp':
        // Ses messages sont là : ses trois points partent (redessiné par receiveLines s'il y a du nouveau).
        for (const l of m.lines) if (l && typeof l === 'object' && l.by === key && typeof l.g === 'string') typingBoard.clear(l.g, key);
        receiveLines(key, m.lines);
        return;
      case 'grp-typing': {
        const v = viewOf(m.g);
        // D'un membre, dans un groupe dont je suis membre : rien d'autre ne s'affiche.
        if (!v || !isMember(v, key) || !isMember(v, myKey()) || state.groups[m.g]?.gone) return;
        const name = v.members.find((x) => x.key === key)?.name ?? '';
        if (typingBoard.note(m.g, key, name, m.on)) opts.onChange?.();
        return;
      }
      case 'grp-sum': {
        const v = viewOf(m.g);
        if (!v || !isMember(v, key) || !isMember(v, myKey())) return;
        if (m.h === digestOf(m.g)) return;
        const k = `${m.g}|${key}`;
        if (Date.now() - (asked.get(k) ?? 0) < 2000) return;
        asked.set(k, Date.now());
        send(key, { t: 'grp-have', g: m.g, ids: validLines(m.g).slice(-GROUP_HAVE_MAX).map((l) => l.id) });
        return;
      }
      case 'grp-have': {
        const v = viewOf(m.g);
        // Un groupe que je viens de quitter : je donne encore ce qui manque (mon départ).
        if (!v || !isMember(v, key) || !(isMember(v, myKey()) || state.groups[m.g]?.gone)) return;
        const theirs = new Set(m.ids);
        const mine = validLines(m.g);
        // Une liste pleine ne dit que le plus récent : on ne donne que ce qui est au moins aussi récent.
        const oldest = m.ids.length >= GROUP_HAVE_MAX ? Math.min(...mine.filter((l) => theirs.has(l.id)).map((l) => Date.parse(l.at))) : -Infinity;
        const missing = mine.filter((l) => !theirs.has(l.id) && Date.parse(l.at) >= oldest);
        for (let i = 0; i < missing.length; i += GROUP_BATCH) send(key, { t: 'grp', lines: missing.slice(i, i + GROUP_BATCH) });
        // Il a des lignes que je n'ai pas : je dis les miennes à mon tour (une fois, pas de va-et-vient).
        const known = new Set(mine.map((l) => l.id));
        const k = `${m.g}|${key}`;
        if (m.ids.some((id) => !known.has(id)) && Date.now() - (asked.get(k) ?? 0) >= 2000) {
          asked.set(k, Date.now());
          send(key, { t: 'grp-have', g: m.g, ids: mine.slice(-GROUP_HAVE_MAX).map((l) => l.id) });
        }
        return;
      }
      case 'grp-invite': {
        if (!isFriend(key)) return;
        const lines = m.lines.map((l) => verifyGroupLine(l, now())).filter((l): l is GroupLine => !!l);
        const r = receiveInvitation(state, key, lines, myKey(), now());
        if (r.ack.length) send(key, { t: 'grp-invite-ok', ids: r.ack });
        commit(r.state);
        const inv = r.fresh ? state.invitations[lines[0]!.g] : undefined;
        const v = inv ? groupView(inv.lines, now()) : undefined;
        if (inv && v) opts.onInvite?.(inv, v);
        return;
      }
      case 'grp-pub': {
        const list = m.ann.map((a) => verifyAnnounce(a, now())?.announce).filter((a): a is GroupAnnounce => !!a);
        const merged = mergeAnnounces(state, list, now());
        if (!merged.fresh.length) return;
        commit(merged.state);
        // Relayées aux autres bornes reliées : elles font le tour du réseau comme une partie instantanée.
        opts.net.sendGroupDirectory({ t: 'grp-pub', ann: merged.fresh }, undefined, key);
        return;
      }
      case 'grp-pub-ask': {
        const all = Object.values(state.directory);
        for (let i = 0; i < all.length; i += GROUP_ANNOUNCE_BATCH) opts.net.sendGroupDirectory({ t: 'grp-pub', ann: all.slice(i, i + GROUP_ANNOUNCE_BATCH) }, key);
        return;
      }
      case 'grp-invite-ok':
        commit(markDelivered(state, m.ids));
        return;
    }
  });

  /** J'écris une ligne dans un groupe dont je suis membre : gardée, partie vers les membres joignables. */
  function write(g: string, body: GroupBody): GroupSendResult {
    if (!opts.net.state().enabled) return { reason: 'disabled' };
    const v = viewOf(g);
    if (!v || !isMember(v, myKey())) return { reason: 'member' };
    if (body.k === 'msg') {
      const limit = groupSendLimit(sent);
      if (limit) return { reason: limit };
    }
    const line = signGroupLine(me(), g, body, now());
    if (!line) return { reason: 'text' };
    if (body.k === 'msg') {
      sent.push(Date.now());
      if (sent.length > 50) sent.splice(0, sent.length - 50);
    }
    commit(addMine(state, line));
    spread(g, [line]);
    return { line };
  }

  function inviteLines(g: string, friends: readonly { key: string; name: string }[], v: GroupView): GroupLine[] {
    const room = GROUP_MEMBERS_MAX - v.members.length - v.invited.length;
    const out: GroupLine[] = [];
    for (const f of friends) {
      if (out.length >= room || f.key === myKey() || isMember(v, f.key) || isInvited(v, f.key) || !isFriend(f.key)) continue;
      const line = signGroupLine(me(), g, { k: 'invite', who: f.key, whoName: f.name }, now());
      if (line) out.push(line);
    }
    return out;
  }

  syncPeers();

  return {
    state: () => state,
    groups: () => myGroups(state, myKey(), now()),
    view: viewOf,
    entry: (g) => state.groups[g],
    invitations: () =>
      Object.values(state.invitations)
        .sort((a, b) => Date.parse(b.arrived) - Date.parse(a.arrived))
        .flatMap((invitation) => {
          const view = groupView(invitation.lines, now());
          return view ? [{ invitation, view }] : [];
        }),
    create(name, friends, access = 'private') {
      if (!opts.net.state().enabled || myGroups(state, myKey(), now()).length >= GROUPS_MAX) return undefined;
      // L'identifiant du groupe est celui de sa ligne de création.
      const id = randomBytes(8).toString('hex');
      const line = signGroupLine(me(), id, { k: 'create', name, ...(access === 'public' ? { access: 'public' as const } : {}) }, now(), id);
      if (!line) return undefined;
      const v = groupView([line], now())!;
      const invites = inviteLines(line.g, friends, v);
      commit(createGroup(state, [line, ...invites]));
      tick(true);
      return line.g;
    },
    invite(g, friends) {
      const v = viewOf(g);
      if (!opts.net.state().enabled || !v || !isMember(v, myKey())) return 0;
      const lines = inviteLines(g, friends, v);
      let next = state;
      for (const l of lines) next = addMine(next, l);
      commit(next);
      spread(g, lines);
      tick(true);
      return lines.length;
    },
    send: (g, text) => {
      const r = write(g, { k: 'msg', text });
      if ('line' in r) opts.onOwnLine?.();
      return r;
    },
    typing(g, active) {
      let signal = signals.get(g);
      const v = viewOf(g);
      const may = opts.net.state().enabled && !!v && isMember(v, myKey());
      if (!may && !signal?.on) return;
      // Aux membres joignables, ceux d'au moment de chaque signal (un membre qui arrive reçoit le suivant).
      if (!signal)
        signals.set(
          g,
          (signal = createTypingSender((on) => {
            for (const m of viewOf(g)?.members ?? []) if (m.key !== myKey() && opts.net.reachable(m.key)) send(m.key, { t: 'grp-typing', g, on });
          })),
        );
      signal.input(may && active);
    },
    typers: (g) => typingBoard.who(g).map(({ key, name }) => ({ key, name })),
    react: (g, target, kind) => 'line' in write(g, { k: 'react', target, kind }),
    remove(g, target) {
      const v = viewOf(g);
      const line = v?.messages.find((l) => l.id === target);
      if (!line || line.by !== myKey()) return false;
      return 'line' in write(g, { k: 'del', target });
    },
    setWeek: (g, table) => 'line' in write(g, { k: 'week', table, until: weekEnd(now()).toISOString() }),
    expel(g, key) {
      const v = viewOf(g);
      if (!v || v.creator !== myKey() || key === myKey() || !(isMember(v, key) || isInvited(v, key))) return false;
      return 'line' in write(g, { k: 'remove', who: key });
    },
    setAccess(g, access) {
      const v = viewOf(g);
      if (!v || v.creator !== myKey() || v.access === access) return false;
      const ok = 'line' in write(g, { k: 'access', access });
      if (ok) tick(true);
      return ok;
    },
    publicGroups: () => publicGroups(state, myKey(), now()),
    publicGroupsOf: (key) => playerPublicGroups(state, key, myKey(), now()),
    joinPublic(g) {
      const a = state.directory[g];
      if (!a || !opts.net.state().enabled) return false;
      const line = signGroupLine(me(), g, { k: 'join' }, now());
      if (!line) return false;
      // Refusée par le rejeu (groupe plein, retiré par le créateur, redevenu privé) : rien n'entre.
      const v = groupView([...a.lines, line], now());
      if (!v || !isMember(v, myKey())) return false;
      commit(joinPublic(state, a, line));
      spread(g, [line]);
      tick(true);
      return true;
    },
    askDirectory: () => void opts.net.sendGroupDirectory({ t: 'grp-pub-ask' }),
    leave(g) {
      const v = viewOf(g);
      if (!v || !isMember(v, myKey())) return false;
      const line = signGroupLine(me(), g, { k: 'leave' }, now());
      if (!line) return false;
      // Envoyé avant de quitter la liste : les membres joignables l'ont tout de suite, les autres par la synchronisation.
      spread(g, [line]);
      commit(leaveGroup(state, line, now()));
      return true;
    },
    accept(g) {
      const inv = state.invitations[g];
      if (!inv || !opts.net.state().enabled) return false;
      const line = signGroupLine(me(), g, { k: 'join' }, now());
      if (!line) return false;
      commit(acceptInvitation(state, g, line));
      spread(g, [line]);
      tick(true);
      return true;
    },
    decline(g) {
      const inv = state.invitations[g];
      if (!inv) return false;
      const line = signGroupLine(me(), g, { k: 'decline' }, now());
      if (!line) return false;
      commit(declineInvitation(state, g, line));
      tick(true);
      return true;
    },
    markRead: (g) => commit(markGroupRead(state, g)),
    setMuted: (g, muted) => commit(setGroupMuted(state, g, muted)),
    forget: (keys) => commit(forgetInGroups(state, keys)),
    observe: () => {
      if (stopped) return;
      tick();
    },
    stop: () => {
      stopped = true;
      unsubscribe();
      typingBoard.stop();
      clearInterval(syncTimer);
      clearInterval(tidyTimer);
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        saveOrWarn(groupsFile(opts.dataDir), () => saveGroups(opts.dataDir, state));
      }
      log('Groupes : service arrêté.'); // i18n-ignore : journal
    },
  };
}
