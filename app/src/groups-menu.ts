// Communauté > Groupes : les écrans des groupes (group-service.ts), d'après les maquettes du
// trailer (15/11/2026).
//
// - La porte de l'accueil Communauté : le nombre de groupes et la dernière nouveauté ; la pastille
//   rouge quand un message attend ou qu'une invitation est arrivée.
// - « Groupes » : mes groupes (membres en pastilles, dernier fait, non-lu), puis les groupes publics de
//   l'annuaire (un aperçu, « Rejoindre »), puis
//   « Créer un groupe », « Invitations reçues ».
// - « Créer un groupe » : le nom, les amis à inviter (cases), l'accès (privé par défaut, ou public).
// - Un groupe : la table de la semaine (Start la lance), la discussion (bulles de la messagerie,
//   réactions), le classement du groupe sur la table de la semaine (scores déjà relayés par les
//   classements), puis Écrire, Choisir la table, Inviter, Membres, Quitter.
// - Une invitation reçue : qui invite, les membres, la table de la semaine ; Accepter ou Refuser.
// Une fonction indisponible reste visible, grisée, avec sa raison.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des services d'essai.

import {
  avatarView,
  chatPhrases,
  countReactions,
  formatNumber,
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX,
  isHidden,
  isMember,
  locale,
  maskWords,
  playerFlag,
  presenceTable,
  presenceTableLabel,
  reactionChip,
  reactionLabel,
  reactionName,
  REACTION_EMOJI,
  REACTIONS,
  TYPING_SHOWN_MAX,
  sameGroupTable,
  socialAgo,
  t,
  tn,
  MOD_REASONS,
  type GroupAccess,
  type GroupLine,
  type GroupView,
  type ModReason,
  type PresenceTable,
  type Reaction,
  type RemoteGroupAct,
  type TableEntry,
} from '@cyberpinball/core';
import type { GroupService } from './group-service';
import { onGesture } from './gesture-flash';
import type { Action, Built, Row, Section } from './library';
import type { RemoteCommunityRow, RemoteGroupHead, RemoteGroups, RemoteMember, RemoteThread } from './phone-remote';
import type { SocialNet } from './social-net';

export interface GroupsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    isShowing(build: () => Built): boolean;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string, options?: { onInput?: (active: boolean) => void }): void;
  };
  net: Pick<SocialNet, 'state' | 'online' | 'reachable' | 'presenceOf' | 'avatarFile' | 'rankings' | 'livePlayers' | 'rooms' | 'report'>;
  groups: GroupService;
  /** Les tables de la borne : la table de la semaine se cherche parmi elles. */
  tables(): readonly TableEntry[];
  /** L'image de la roue d'une table (vignette), s'il y en a une. */
  wheel?(table: TableEntry): string | undefined;
  /** Lancer une table. */
  play(table: TableEntry): void;
  openProfile?(key: string, back: () => void): void;
  /** Partage et réseau : là où se réactive le partage. */
  openSharing?(back: () => void): void;
  /** Pourquoi la borne n'ouvre pas d'écran pour le téléphone (une partie en cours) ; undefined : elle peut. */
  busy?(): string | undefined;
  now?(): Date;
}

export interface GroupsMenu {
  /** Ce que dit la porte de l'accueil Communauté. */
  door(): { detail: string; attention: boolean; quiet: boolean };
  /** « Groupes », son « Retour » vers `back`. */
  open(back: () => void): void;
  /** Un groupe (notification d'un message), « Retour » vers `back`. */
  openGroup(g: string, back?: () => void): void;
  /** Un groupe public de l'annuaire (profil public d'un de ses membres) : ses membres, sa table, « Rejoindre ». */
  openPublic(g: string, back: () => void): void;
  /** Clic sur une notification : l'invitation la plus récente, sinon le groupe au dernier message non lu, sinon la liste. */
  openNews(back: () => void): void;
  /** Le groupe à l'écran (pas de notification pour ce qu'on lit déjà) ; undefined : aucun. */
  shown(): string | undefined;
  /**
   * La rubrique Communauté du téléphone : mes groupes en tête des conversations (clé « g:<id> »), et le
   * fil du groupe ouvert au téléphone (`open`), lu puisqu'il est sous les yeux.
   */
  remote(open?: string): { rows: RemoteCommunityRow[]; unread: number; thread?: RemoteThread };
  /** Pour « Messages » au téléphone : créer un groupe, les invitations reçues, les groupes publics. */
  remoteGroups(): RemoteGroups;
  /**
   * Un geste fait au téléphone : la borne retrouve le groupe (invitation, annuaire, l'un des miens),
   * l'ami à inviter, et ne fait que ce que son propre écran permettrait. « create » ouvre « Créer un
   * groupe » à la borne (le nom s'y tape, au clavier du téléphone), son « Retour » vers `back`.
   */
  remoteAct(act: RemoteGroupAct, g: string | undefined, key: string | undefined, back: () => void): void;
}

/** Messages du fil montrés au plus (les plus anciens restent sur la borne). */
const THREAD_SHOWN = 60;
/** Membres en pastilles sur une ligne de « Groupes ». */
const AVATARS_SHOWN = 6;

export function createGroupsMenu(host: GroupsMenuHost): GroupsMenu {
  const now = () => host.now?.() ?? new Date();
  const net = host.net;
  const groups = host.groups;
  const lib = host.library;
  const myKey = () => net.state().key.publicKey;
  const avatar = (key: string, name: string) => avatarView(key, name, net.avatarFile(key));
  const flag = (country: string | undefined) => playerFlag(country, locale());
  const isFriend = (key: string) => net.state().friends.some((f) => f.key === key);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ');
  const shownText = (text: string) => (net.rooms().filter ? maskWords(text) : text);
  let flash: Row | undefined;
  onGesture(() => (flash = undefined));
  const takeFlash = (): Section[] => (flash ? [{ rows: [flash] }] : []);
  let listBack: () => void = () => undefined;

  /** Pourquoi on ne peut rien faire dans les groupes en ce moment ; undefined : on peut. */
  function blocked(): string | undefined {
    if (!net.state().enabled) return t('Partage désactivé : personne ne vous voit, vous ne voyez personne');
    return undefined;
  }

  // ---------- Présence d'un membre ----------

  function presence(key: string): { text: string; on: boolean } {
    if (key === myKey()) return { text: t('Vous'), on: true };
    if (isFriend(key)) {
      if (!net.online(key)) return { text: t('Hors ligne'), on: false };
      return net.presenceOf(key)?.status === 'playing' ? { text: t('En partie'), on: true } : { text: t('En ligne'), on: true };
    }
    const beacon = net.livePlayers().find((b) => b.key === key);
    if (beacon) return { text: beacon.status === 'playing' ? t('En partie') : t('En ligne'), on: true };
    return net.reachable(key) ? { text: t('En ligne'), on: true } : { text: t('Hors ligne'), on: false };
  }
  const onlineCount = (v: GroupView) => v.members.filter((m) => m.key !== myKey() && presence(m.key).on).length;

  // ---------- Table de la semaine ----------

  const localTable = (table: PresenceTable): TableEntry | undefined => host.tables().find((e) => sameGroupTable(presenceTable(e), table));
  function untilText(iso: string): string {
    const d = new Date(iso);
    return t('jusqu’à {day} {time}', { day: d.toLocaleDateString(locale(), { weekday: 'long' }), time: time(iso) });
  }

  /** Le classement du groupe sur la table de la semaine : le meilleur score de chaque membre depuis qu'elle est choisie. */
  function ranking(v: GroupView): { key: string; name: string; country?: string; score: number; at: string }[] {
    if (!v.week) return [];
    const members = new Map(v.members.map((m) => [m.key, m]));
    const store = net.rankings();
    const since = Date.parse(v.week.at);
    const best = new Map<string, { key: string; name: string; country?: string; score: number; at: string }>();
    for (const s of store.scores) {
      const m = members.get(s.key);
      if (!m || isHidden(store, s) || Date.parse(s.at) < since || !sameGroupTable(s.table, v.week.table)) continue;
      const had = best.get(s.key);
      if (!had || s.score > had.score) best.set(s.key, { key: s.key, name: m.name, ...(m.country ? { country: m.country } : {}), score: s.score, at: s.at });
    }
    return [...best.values()].sort((a, b) => b.score - a.score);
  }

  // ---------- Ce que dit un groupe ----------

  function lastFact(v: GroupView): string {
    const last = v.messages.at(-1);
    const top = ranking(v)[0];
    if (last && last.body.k === 'msg' && (!v.week || !top || Date.parse(last.at) >= Date.parse(top.at))) {
      const who = last.by === myKey() ? t('Vous') : last.name;
      return t('{name} : « {text} » · {ago}', { name: who, text: oneLine(shownText(last.body.text)).slice(0, 60), ago: socialAgo(last.at, now()) });
    }
    if (v.week && top) return t('Table de la semaine : {table} · {name} mène avec {score}', { table: v.week.table.title, name: top.key === myKey() ? t('vous') : top.name, score: formatNumber(top.score) });
    if (v.week) return t('Table de la semaine : {table}', { table: v.week.table.title });
    return t('Pas encore de message');
  }

  function door(): ReturnType<GroupsMenu['door']> {
    if (blocked()) return { detail: t('Indisponible : partage désactivé (Partage et réseau)'), attention: false, quiet: true };
    const mine = groups.groups();
    const invites = groups.invitations();
    const unread = mine.filter((g) => g.entry.unread > 0);
    const parts: string[] = [];
    if (mine.length) parts.push(tn(mine.length, '{n} groupe', '{n} groupes'));
    if (unread.length) {
      const g = unread[0]!;
      parts.push(t('{group} : {news}', { group: g.view.name, news: tn(g.entry.unread, '{n} nouveau message', '{n} nouveaux messages') }));
    } else if (invites.length) {
      const first = invites[0]!;
      parts.push(tn(invites.length, '{n} invitation : {group}, de {name}', '{n} invitations : {group}, de {name}…', { group: first.view.name, name: inviterName(first.invitation.from, first.view) }));
    }
    if (!parts.length) {
      const open = groups.publicGroups().length;
      if (open) parts.push(tn(open, '{n} groupe public à rejoindre', '{n} groupes publics à rejoindre'));
    }
    return { detail: parts.length ? parts.join(' · ') : t('Vos cercles, publics ou privés : discussion, table de la semaine, classement'), attention: unread.length > 0 || invites.length > 0, quiet: false };
  }

  const inviterName = (from: string, v: GroupView) => net.state().friends.find((f) => f.key === from)?.name ?? v.members.find((m) => m.key === from)?.name ?? from.slice(0, 8);

  /** L'icône d'un groupe : trois joueurs s'il est public, un cadenas s'il est privé. */
  const groupIcon = (v: GroupView) => (v.access === 'public' ? ('group' as const) : ('lock' as const));
  const accessText = (v: GroupView) => (v.access === 'public' ? t('groupe public') : t('groupe privé'));

  // ---------- Groupes ----------

  function buildList(): Built {
    const actions: Action[] = [];
    const sections: Section[] = [...takeFlash()];
    const here = (at?: number) => lib.openCustom(buildList, at);
    const mine = groups.groups();
    const invites = groups.invitations();
    const problem = blocked();
    if (problem) sections.push({ rows: [{ text: problem, detail: t('Le réactiver : Partage et réseau'), tone: 'warning', icon: 'network' }] });
    const rows: Row[] = mine.map(({ entry, view }) => {
      const index = actions.push({ label: view.name, key: `group:${view.id}`, icon: groupIcon(view), run: () => openGroup(view.id, () => here(index)) }) - 1;
      const others = view.members.filter((m) => m.key !== myKey());
      const top = ranking(view)[0];
      const badges = [...(entry.unread ? [tn(entry.unread, '{n} nouveau', '{n} nouveaux')] : []), ...(top && top.key !== myKey() && Date.now() - Date.parse(top.at) < 86_400_000 ? [t('Record')] : [])];
      return {
        text: view.name,
        detail: `${tn(view.members.length, '{n} membre', '{n} membres')} · ${lastFact(view)}`,
        avatars: others.slice(0, AVATARS_SHOWN).map((m) => avatar(m.key, m.name)),
        icon: groupIcon(view),
        ...(badges.length ? { badges } : {}),
        ...(entry.unread ? { unread: true } : {}),
        action: index,
        pick: true,
      } satisfies Row;
    });
    sections.push(rows.length ? { title: t('Mes groupes'), rows } : { rows: [{ text: t('Pas encore de groupe'), detail: t('« Créer un groupe » : un nom, public ou privé, des amis à inviter'), icon: 'group', tone: 'info' }] });
    // Les groupes publics de l'annuaire, à rejoindre ; jamais un groupe privé.
    const open = problem ? [] : groups.publicGroups();
    if (open.length) {
      sections.push({
        title: t('Groupes publics'),
        rows: open.map(({ view }) => {
          const index = actions.push({ label: view.name, key: `public:${view.id}`, icon: 'group', run: () => openPublic(view.id, () => here(index)) }) - 1;
          const creator = view.members.find((m) => m.key === view.creator)?.name;
          const facts = [tn(view.members.length, '{n} membre', '{n} membres'), ...(creator ? [t('créé par {name}', { name: creator })] : []), ...(view.week ? [t('Table de la semaine : {table}', { table: view.week.table.title })] : [])];
          return { text: shownName(view.name), detail: facts.join(' · '), avatars: view.members.slice(0, AVATARS_SHOWN).map((m) => avatar(m.key, m.name)), icon: 'group', action: index, pick: true } satisfies Row;
        }),
      });
    }
    actions.push(
      problem
        ? { label: t('Créer un groupe'), icon: 'plus', tone: 'quiet', detail: t('Indisponible : {reason}', { reason: problem }), run: () => undefined }
        : { label: t('Créer un groupe'), icon: 'plus', detail: t('Public ou privé, un nom, des amis à inviter'), run: () => openCreate(() => here(Number.MAX_SAFE_INTEGER)) },
      invites.length
        ? { label: t('Invitations reçues'), icon: 'friend-request', attention: true, detail: invites.length === 1 ? t('1 invitation : {group}, de {name}', { group: invites[0]!.view.name, name: inviterName(invites[0]!.invitation.from, invites[0]!.view) }) : tn(invites.length, '{n} invitation', '{n} invitations'), run: () => openInvitations(() => here(Number.MAX_SAFE_INTEGER)) }
        : { label: t('Invitations reçues'), icon: 'friend-request', tone: 'quiet', detail: t('Aucune invitation en attente'), run: () => undefined },
    );
    if (problem && host.openSharing) actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing!(() => here()) });
    actions.push({ label: t('Retour'), icon: 'back', run: () => listBack() });
    const members = new Set(mine.flatMap((g) => g.view.members.map((m) => m.key)));
    members.delete(myKey());
    const sub = [tn(mine.length, '{n} groupe', '{n} groupes'), ...(members.size ? [tn(members.size, '{n} membre', '{n} membres')] : []), ...(invites.length ? [tn(invites.length, '{n} invitation', '{n} invitations')] : []), ...(open.length ? [tn(open.length, '{n} groupe public', '{n} groupes publics')] : [])];
    return {
      heading: t('Groupes'),
      icon: 'group',
      subheading: sub.join(' · '),
      lead: t('Vos groupes, et les groupes publics à rejoindre. Un groupe privé ne paraît nulle part : on y entre sur invitation. Discussion, table de la semaine et classement restent entre membres.'),
      sections,
      actions,
      back: () => listBack(),
      listStart: t('ouvrir le groupe'),
    };
  }

  function open(back: () => void): void {
    listBack = back;
    // L'annuaire des groupes publics se demande aux bornes reliées ; l'écran se redessine à l'arrivée.
    groups.askDirectory();
    lib.openCustom(buildList, 0);
  }

  /** Un nom de groupe public, montré à tous : le filtre de mots des salons s'y applique. */
  const shownName = (name: string) => (net.rooms().filter ? maskWords(name) : name);

  // ---------- Un groupe public de l'annuaire ----------

  /** Pourquoi on ne peut pas rejoindre ce groupe public (partage coupé, complet, retiré par son créateur) ; undefined : on peut. */
  function joinReason(view: GroupView): string | undefined {
    const problem = blocked();
    const full = view.members.length + view.invited.length >= GROUP_MEMBERS_MAX;
    const removed = view.former.get(myKey())?.how === 'removed';
    return problem ?? (full ? t('{n} membres au plus', { n: GROUP_MEMBERS_MAX }) : removed ? t('le créateur vous a retiré : il faut une invitation') : undefined);
  }

  /** Les amis à inviter dans ce groupe (ni membres ni déjà invités), et pourquoi personne (complet, tous là, partage coupé). */
  function inviteState(v: GroupView): { candidates: { key: string; name: string }[]; reason?: string } {
    const problem = blocked();
    const room = GROUP_MEMBERS_MAX - v.members.length - v.invited.length;
    const candidates = friendsSorted().filter((f) => !isMember(v, f.key) && !v.invited.some((i) => i.key === f.key));
    const reason = problem ?? (room <= 0 ? t('{n} membres au plus', { n: GROUP_MEMBERS_MAX }) : candidates.length ? undefined : t('tous vos amis sont membres ou invités'));
    return { candidates: reason ? [] : candidates, ...(reason ? { reason } : {}) };
  }

  function openPublic(g: string, back: () => void): void {
    lib.openCustom(() => {
      const found = groups.publicGroups().find((x) => x.view.id === g);
      if (!found) return { heading: t('Groupe public'), icon: 'group', sections: [{ rows: [{ text: t('Ce groupe n’est plus dans l’annuaire'), detail: t('Il est peut-être devenu privé, ou vous en êtes déjà membre'), tone: 'info' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
      const { view } = found;
      const members: Row[] = view.members.map((m) => {
        const p = presence(m.key);
        return { text: m.name, avatar: avatar(m.key, m.name), flag: flag(m.country), detail: [m.key === view.creator ? t('Créateur') : undefined, p.text].filter(Boolean).join(' · '), ...(p.on ? { tone: 'ok' as const } : {}) };
      });
      const sections: Section[] = [{ title: t('Membres'), kind: 'players', rows: members }];
      if (view.week) {
        const local = localTable(view.week.table);
        const thumb = local ? host.wheel?.(local) : undefined;
        const made = view.week.table.manufacturer && view.week.table.year ? `${view.week.table.manufacturer} ${view.week.table.year} · ` : '';
        sections.push({ title: t('Table de la semaine'), rows: [{ text: view.week.table.title, detail: made + (local ? t('déjà dans votre borne') : t('pas dans votre borne')), ...(thumb ? { thumb } : { icon: 'play' as const }), aside: local ? t('Prête') : t('Absente'), ...(local ? {} : { tone: 'quiet' as const }) }] });
      }
      const reason = joinReason(view);
      const actions: Action[] = [
        reason
          ? { label: t('Rejoindre'), icon: 'check', tone: 'quiet', detail: t('Indisponible : {reason}', { reason }), run: () => undefined }
          : {
              label: t('Rejoindre'),
              icon: 'check',
              tone: 'ok',
              detail: t('Vous voyez aussitôt la discussion, la table de la semaine et le classement'),
              run: () => {
                if (!groups.joinPublic(g)) {
                  flash = { text: t('Ce groupe n’a pas pu être rejoint'), tone: 'warning' };
                  lib.openCustom(buildList, 0);
                  return;
                }
                flash = { text: t('Bienvenue dans « {group} »', { group: view.name }), detail: t('Les messages arrivent dès qu’un membre est en ligne'), tone: 'ok' };
                // La liste d'abord : le retour du groupe la nomme.
                lib.openCustom(buildList, 0);
                openGroup(g, () => lib.openCustom(buildList, 0));
              },
            },
        { label: t('Retour'), icon: 'back', run: back },
      ];
      return {
        heading: shownName(view.name),
        icon: 'group',
        subheading: [tn(view.members.length, '{n} membre', '{n} membres'), t('groupe public')].join(' · '),
        lead: t('Rejoindre : vous voyez la discussion, la table de la semaine et le classement du groupe ; ses membres voient votre pseudo, votre pays et votre avatar.'),
        sections,
        actions,
        back,
      };
    }, 0);
  }

  // ---------- Créer un groupe ----------

  let draft: { name: string; picked: Set<string>; access: GroupAccess; back: () => void } | undefined;

  /** Mes amis, en ligne d'abord, puis par nom. */
  function friendsSorted(): { key: string; name: string }[] {
    return [...net.state().friends].sort((a, b) => Number(net.online(b.key)) - Number(net.online(a.key)) || a.name.localeCompare(b.name)).map((f) => ({ key: f.key, name: f.name }));
  }

  function openCreate(back: () => void): void {
    // Privé par défaut : le choix le plus discret, qui s'ouvre d'un appui.
    draft = { name: '', picked: new Set(), access: 'private', back };
    lib.openCustom(buildCreate, 0);
  }

  function friendRow(f: { key: string; name: string }, on: boolean, index: number, note?: string): Row {
    const p = presence(f.key);
    return { text: f.name, avatar: avatar(f.key, f.name), detail: note ?? p.text, check: on ? 'on' : 'off', ...(p.on ? { tone: 'ok' as const } : {}), action: index, pick: true };
  }

  function buildCreate(): Built {
    const d = draft!;
    const actions: Action[] = [];
    const here = () => lib.openCustom(buildCreate);
    const nameIndex = actions.push({ label: t('Nom'), key: 'name', icon: 'edit', run: () => askName(d.name, (name) => ((d.name = name), here())) }) - 1;
    const nameRow: Row = d.name
      ? { text: d.name, detail: t('Start : modifier · {n} caractères au plus', { n: GROUP_NAME_MAX }), aside: `${[...d.name].length} / ${GROUP_NAME_MAX}`, icon: 'edit', action: nameIndex, pick: true }
      : { text: t('Choisir un nom…'), detail: t('Start : écrire · {n} caractères au plus', { n: GROUP_NAME_MAX }), icon: 'edit', tone: 'info', action: nameIndex, pick: true };
    const friends = friendsSorted();
    const room = GROUP_MEMBERS_MAX - 1;
    const invite: Row[] = friends.map((f) => {
      const on = d.picked.has(f.key);
      const full = !on && d.picked.size >= room;
      const index = actions.push({ label: f.name, key: `friend:${f.key}`, run: () => (full ? undefined : (on ? d.picked.delete(f.key) : d.picked.add(f.key), here())) }) - 1;
      return friendRow(f, on, index, full ? t('{n} membres au plus', { n: GROUP_MEMBERS_MAX }) : undefined);
    });
    const accessIndex = actions.push({ label: t('Accès'), key: 'access', icon: d.access === 'public' ? 'group' : 'lock', run: () => ((d.access = d.access === 'public' ? 'private' : 'public'), here()) }) - 1;
    const accessRow: Row =
      d.access === 'public'
        ? { text: t('Ouvert à tous'), detail: t('Dans la liste des groupes publics : n’importe quel joueur le rejoint. Start : le rendre privé'), aside: t('Public'), icon: 'group', action: accessIndex, pick: true }
        : { text: t('Sur invitation seulement'), detail: t('Personne ne voit ce groupe sans y être invité ; chaque membre peut inviter ses amis. Start : le rendre public'), aside: t('Privé'), icon: 'lock', action: accessIndex, pick: true };
    const ready = Boolean(d.name);
    actions.push(
      ready
        ? { label: t('Créer le groupe'), icon: 'check', tone: 'ok', detail: d.picked.size ? tn(d.picked.size, '{n} invitation partira tout de suite', '{n} invitations partiront tout de suite') : t('Vous seul pour l’instant : invitez plus tard'), run: () => finishCreate() }
        : { label: t('Créer le groupe'), icon: 'check', tone: 'quiet', detail: t('Indisponible : choisissez d’abord un nom'), run: () => undefined },
      { label: t('Annuler'), icon: 'back', run: d.back },
    );
    return {
      heading: t('Créer un groupe'),
      icon: 'plus',
      subheading: d.picked.size ? tn(d.picked.size, '{n} ami invité', '{n} amis invités') : t('Aucun ami invité pour l’instant'),
      lead: t('Le groupe vit sur les bornes de ses membres, comme vos messages : aucun serveur, aucun compte.'),
      sections: [
        { title: t('Nom du groupe'), rows: [nameRow] },
        friends.length ? { title: t('Inviter des amis'), rows: invite } : { title: t('Inviter des amis'), rows: [{ text: t('Pas encore d’ami à inviter'), detail: t('Seuls vos amis peuvent être invités : « Trouver un joueur » dans Mes amis'), icon: 'friend-add', tone: 'info' }] },
        { title: t('Accès'), rows: [accessRow] },
      ],
      actions,
      back: d.back,
      listStart: t('cocher ou décocher'),
    };
  }

  function askName(value: string, done: (name: string) => void): void {
    lib.openPrompt(t('Nom du groupe'), t('Nom'), value, (text) => {
      const name = (text ?? '').replace(/\s+/g, ' ').trim();
      if (text !== undefined && [...name].length > GROUP_NAME_MAX) flash = { text: t('Nom trop long : {n} caractères au plus', { n: GROUP_NAME_MAX }), tone: 'warning' };
      done(text === undefined ? value : [...name].slice(0, GROUP_NAME_MAX).join(''));
    }, t('{n} caractères au plus. Le clavier à l’écran, ou votre téléphone appairé.', { n: GROUP_NAME_MAX }));
  }

  function finishCreate(): void {
    const d = draft!;
    const friends = friendsSorted().filter((f) => d.picked.has(f.key));
    const g = groups.create(d.name, friends, d.access);
    if (!g) {
      flash = { text: t('Le groupe n’a pas pu être créé'), tone: 'warning' };
      lib.openCustom(buildCreate);
      return;
    }
    flash = friends.length ? { text: tn(friends.length, 'Groupe créé · {n} invitation envoyée', 'Groupe créé · {n} invitations envoyées'), detail: t('Elles arrivent à vos amis dès que leur borne est allumée'), tone: 'ok' } : { text: t('Groupe créé'), tone: 'ok' };
    draft = undefined;
    // La liste d'abord : le retour du groupe la nomme (« Retour : Groupes »), pas l'écran quitté.
    lib.openCustom(buildList, 0);
    openGroup(g, () => lib.openCustom(buildList, 0));
  }

  // ---------- Un groupe ----------

  let current: { g: string; back: () => void } | undefined;
  const groupBuilds = new Map<string, () => Built>();
  const groupBuild = (g: string) => {
    let b = groupBuilds.get(g);
    if (!b) groupBuilds.set(g, (b = () => buildGroup(g)));
    return b;
  };

  function openGroup(g: string, back?: () => void): void {
    current = { g, back: back ?? current?.back ?? (() => lib.openCustom(buildList, 0)) };
    groups.markRead(g);
    lib.openCustom(groupBuild(g), 0);
  }

  const dayOf = (iso: string) => new Date(iso).toDateString();
  function dayLabel(iso: string): string {
    const d = new Date(iso);
    const today = now();
    if (d.toDateString() === today.toDateString()) return t('Aujourd’hui');
    if (d.toDateString() === new Date(today.getTime() - 86_400_000).toDateString()) return t('Hier');
    return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function chips(v: GroupView, line: GroupLine): string[] {
    const on = v.reactions.get(line.id);
    if (!on) return [];
    return countReactions([...on].map(([key, kind]) => ({ key, kind })), myKey()).map(reactionChip);
  }

  function buildGroup(g: string): Built {
    const v = groups.view(g);
    const up = current?.g === g ? current.back : () => lib.openCustom(buildList, 0);
    if (!v || !isMember(v, myKey())) {
      return { heading: t('Groupe'), icon: 'group', sections: [{ rows: [{ text: t('Vous n’êtes plus membre de ce groupe'), tone: 'warning', icon: 'lock' }] }], actions: [{ label: t('Retour'), icon: 'back', run: up }], back: up };
    }
    // Sous les yeux : ce qui arrive est lu.
    if (groups.entry(g)?.unread) groups.markRead(g);
    const here = () => lib.openCustom(groupBuild(g));
    const actions: Action[] = [];
    const sections: Section[] = [...takeFlash()];
    const problem = blocked();

    // La table de la semaine.
    if (v.week) {
      const week = v.week;
      const local = localTable(week.table);
      const index = actions.push({ label: t('Jouer : {table}', { table: week.table.title }), key: 'week', icon: 'play', ...(local ? {} : { tone: 'quiet' as const }), run: () => (local ? host.play(local) : undefined) }) - 1;
      const meta = weekMeta(week);
      const thumb = local ? host.wheel?.(local) : undefined;
      sections.push({ title: t('Table de la semaine'), rows: [{ text: week.table.title, detail: local ? meta : `${meta} · ${t('pas dans votre borne')}`, ...(thumb ? { thumb } : { icon: 'play' as const }), aside: local ? t('Jouer') : t('Absente'), ...(local ? {} : { tone: 'quiet' as const }), action: index, pick: true }] });
    } else {
      sections.push({ title: t('Table de la semaine'), rows: [{ text: t('Pas de table de la semaine'), detail: t('« Choisir la table de la semaine » : un membre la choisit pour tous, jusqu’à dimanche'), icon: 'play', tone: 'info' }] });
    }

    // La discussion, les plus récents en bas.
    const chat: Row[] = [];
    let day: string | undefined;
    for (const line of v.messages.slice(-THREAD_SHOWN)) {
      if (line.body.k !== 'msg') continue;
      if (dayOf(line.at) !== day) {
        day = dayOf(line.at);
        chat.push({ text: dayLabel(line.at), bubble: 'day' });
      }
      const mine = line.by === myKey();
      const text = shownText(line.body.text);
      const index = actions.push({ label: oneLine(text).slice(0, 80), key: `line:${line.id}`, icon: 'message', ...(problem ? { tone: 'quiet' as const } : {}), run: () => (problem ? undefined : openReply(g, line.id)) }) - 1;
      const c = chips(v, line);
      chat.push({ text, detail: `${mine ? t('Vous') : line.name} · ${time(line.at)}`, bubble: mine ? 'out' : 'in', ...(c.length ? { badges: c } : {}), action: index, pick: true });
    }
    // Les membres qui écrivent en ce moment : leurs badges et les trois points, sous le dernier message (typing.ts).
    const typers = groups.typers(g);
    if (!chat.length && !typers.length) chat.push({ text: t('Pas encore de message : écrivez le premier'), bubble: 'day' });
    if (typers.length) {
      const shown = typers.slice(0, TYPING_SHOWN_MAX);
      const names = shown.map((x) => x.name).join(', ');
      chat.push({
        text: typers.length > shown.length ? t('{names} et {n} autres écrivent…', { names, n: typers.length - shown.length }) : tn(typers.length, '{names} écrit…', '{names} écrivent…', { names }),
        typing: { players: shown.map((x) => ({ name: x.name, avatar: avatar(x.key, x.name) })), ...(typers.length > shown.length ? { more: typers.length - shown.length } : {}) },
      });
    }
    sections.push({ title: t('Discussion'), kind: 'chat', rows: chat });

    // Le classement du groupe sur la table de la semaine.
    if (v.week) {
      const ranks = ranking(v);
      const rows: Row[] = ranks.map((r, i) => {
        const index = actions.push({ label: r.name, key: `rank:${r.key}`, icon: 'trophy', run: () => openPlayer(r.key, here) }) - 1;
        return { text: `${i + 1}. ${r.key === myKey() ? t('Vous') : r.name}`, detail: `${formatNumber(r.score)} · ${socialAgo(r.at, now())}`, avatar: avatar(r.key, r.name), flag: flag(r.country), ...(i === 0 ? { badges: [t('Record du groupe')] } : {}), ...(r.key === myKey() ? { tone: 'info' as const } : {}), action: index, pick: true };
      });
      sections.push({ title: t('Classement du groupe'), kind: 'players', rows: rows.length ? rows : [{ text: t('Pas encore de score depuis le choix de la table'), detail: t('Les scores publiés aux classements par les membres comptent d’eux-mêmes'), icon: 'trophy', tone: 'quiet' }] });
    }

    const others = v.members.filter((m) => m.key !== myKey());
    const invite = inviteState(v);
    const unavailable = (label: string, icon: Action['icon'], reason: string): Action => ({ label, icon, tone: 'quiet', detail: t('Indisponible : {reason}', { reason }), run: () => undefined });
    actions.push(
      problem ? unavailable(t('Écrire au groupe'), 'message', problem) : { label: t('Écrire au groupe'), icon: 'message', detail: t('Phrases prêtes ou clavier à l’écran'), run: () => openReply(g) },
      problem ? unavailable(t('Choisir la table de la semaine'), 'play', problem) : { label: t('Choisir la table de la semaine'), icon: 'play', detail: v.week ? t('Remplace {table} pour tous', { table: v.week.table.title }) : t('Jusqu’à dimanche 23:59, pour tous les membres'), run: () => openChooseTable(g) },
      invite.reason
        ? unavailable(t('Inviter des amis'), 'friend-add', invite.reason)
        : { label: t('Inviter des amis'), icon: 'friend-add', detail: listNames(invite.candidates.map((f) => f.name), (names) => t('{names} ne sont pas encore membres', { names }), (name) => t('{name} n’est pas encore membre', { name })), run: () => openInvite(g) },
      { label: t('Membres'), icon: 'friends', detail: others.length ? t('{names} et vous', { names: others.map((m) => m.name).join(', ') }) : v.invited.length ? tn(v.invited.length, '{n} invitation en attente', '{n} invitations en attente') : t('Vous seul pour l’instant'), run: () => openMembers(g) },
      { label: t('Quitter le groupe'), icon: 'exit', detail: leaveDetail(v), run: () => confirmLeave(g) },
      { label: t('Retour'), icon: 'back', run: up },
    );
    const on = onlineCount(v);
    return {
      heading: v.name,
      icon: groupIcon(v),
      subheading: [tn(v.members.length, '{n} membre', '{n} membres'), ...(on ? [tn(on, '{n} en ligne', '{n} en ligne')] : []), accessText(v)].join(' · '),
      sections,
      actions,
      back: up,
    };
  }

  /** Ce que dit la table de la semaine : son fabricant et son année, jusqu'à quand, qui l'a choisie. */
  function weekMeta(week: NonNullable<GroupView['week']>): string {
    return [week.table.manufacturer && week.table.year ? `${week.table.manufacturer} ${week.table.year}` : undefined, untilText(week.until), t('choisie par {name}', { name: week.by === myKey() ? t('vous') : week.byName })].filter(Boolean).join(' · ');
  }

  /** Ce que coûte de quitter ce groupe. */
  function leaveDetail(v: GroupView): string {
    return v.creator === myKey() && v.members.some((m) => m.key !== myKey()) ? t('Vous l’avez créé : personne ne pourra plus retirer de membre') : t('Vous ne verrez plus ses messages');
  }

  /** « Lucas et Camille », « Lucas, Camille et 2 autres » : la phrase qui convient au nombre. */
  function listNames(names: readonly string[], many: (names: string) => string, one: (name: string) => string): string {
    if (names.length === 1) return one(names[0]!);
    const shown = names.length > 3 ? [...names.slice(0, 2), tn(names.length - 2, '{n} autre', '{n} autres')] : [...names];
    return many(t('{list} et {last}', { list: shown.slice(0, -1).join(', '), last: shown.at(-1)! }));
  }

  function openPlayer(key: string, back: () => void): void {
    if (key === myKey()) return;
    host.openProfile?.(key, back);
  }

  // ---------- Écrire, réagir, supprimer, signaler ----------

  function openReply(g: string, target?: string): void {
    lib.openCustom(() => buildReply(g, target), 0);
  }

  function sendResult(r: ReturnType<GroupService['send']>): void {
    if ('line' in r) return;
    flash =
      r.reason === 'gap'
        ? { text: t('Un instant : une ligne toutes les 3 secondes'), tone: 'warning' }
        : r.reason === 'burst'
          ? { text: t('Beaucoup de messages d’affilée : attendez quelques minutes'), tone: 'warning' }
          : r.reason === 'text'
            ? { text: t('Message trop long : 500 caractères au plus'), tone: 'warning' }
            : { text: t('Message pas envoyé : vous n’êtes plus membre, ou le partage est coupé'), tone: 'warning' };
  }

  function compose(g: string): void {
    const v = groups.view(g);
    lib.openPrompt(
      t('Message à {group}', { group: v?.name ?? '' }),
      t('Votre message'),
      '',
      (text) => {
        if (text !== undefined && text.trim()) sendResult(groups.send(g, text));
        openGroup(g);
      },
      t('Le clavier à l’écran, ou votre téléphone appairé : son texte s’écrit ici en direct. 500 caractères au plus.'),
      // Tant qu'il reste du texte : « en train d'écrire » chez les membres (typing.ts).
      { onInput: (active) => groups.typing(g, active) },
    );
  }

  function buildReply(g: string, target?: string): Built {
    const v = groups.view(g);
    const back = () => openGroup(g);
    const line = target ? v?.messages.find((l) => l.id === target) : undefined;
    const mine = line ? v?.reactions.get(line.id)?.get(myKey()) : undefined;
    const actions: Action[] = [];
    const sections: Section[] = [];
    if (line && line.body.k === 'msg') {
      const rows: Row[] = REACTIONS.map((r: Reaction) => {
        const on = mine === r;
        const index = actions.push({ label: reactionLabel(r), key: `react:${r}`, run: () => (groups.react(g, line.id, on ? null : r), back()) }) - 1;
        return { text: reactionName(r), emoji: REACTION_EMOJI[r], ...(on ? { current: true, detail: t('Votre réaction · Start la retire') } : {}), action: index, pick: true };
      });
      sections.push({ title: t('Réagir à « {text} »', { text: oneLine(shownText(line.body.text)).slice(0, 60) }), kind: 'reactions', rows });
    }
    const phrases: Row[] = chatPhrases().map((p) => {
      const index = actions.push({ label: p, key: `phrase:${p}`, icon: 'message', run: () => (sendResult(groups.send(g, p)), back()) }) - 1;
      return { text: p, action: index, pick: true };
    });
    sections.push({ title: t('Phrases'), kind: 'phrases', rows: phrases });
    actions.push({ label: t('Écrire un message…'), icon: 'keyboard', detail: t('Clavier à l’écran, ou votre téléphone appairé'), run: () => compose(g) });
    if (line && line.body.k === 'msg' && line.by === myKey()) {
      const quoted = oneLine(line.body.text).slice(0, 60);
      actions.push({
        label: t('Supprimer ce message…'),
        icon: 'trash',
        tone: 'warning',
        detail: t('Pour vous et pour tous les membres'),
        run: () =>
          confirm(t('Supprimer « {text} » ?', { text: quoted }), t('Le message disparaît chez chaque membre dès que sa borne reçoit le retrait. Rien ne le rétablit.'), t('Supprimer'), () => {
            if (groups.remove(g, line.id)) flash = { text: t('Message supprimé'), tone: 'ok' };
            back();
          }, () => openReply(g, target)),
      });
    }
    if (line && line.body.k === 'msg' && line.by !== myKey()) actions.push({ label: t('Signaler ce message…'), icon: 'alert', detail: t('Aux modérateurs de Cyber Pinball, chiffré pour eux seuls'), run: () => openReport(g, line) });
    actions.push({ label: t('Annuler'), icon: 'back', run: back });
    return { heading: line ? t('Répondre à {name}', { name: line.name }) : t('Écrire au groupe'), icon: 'message', subheading: v?.name, sections, actions, back, listStart: t('envoyer') };
  }

  function reasonLabel(r: ModReason): string {
    switch (r) {
      case 'insults':
        return t('Insultes ou harcèlement');
      case 'spam':
        return t('Messages en masse, publicité');
      case 'shocking':
        return t('Contenu choquant');
      case 'personal':
        return t('Données personnelles');
      case 'other':
        return t('Autre raison');
    }
  }

  function openReport(g: string, line: GroupLine): void {
    lib.openCustom(() => {
      const back = () => openReply(g, line.id);
      const actions: Action[] = MOD_REASONS.map((r) => ({
        label: reasonLabel(r),
        icon: 'alert' as const,
        run: () => {
          net.report(line, r);
          flash = { text: t('Message signalé : les modérateurs le reçoivent, chiffré'), detail: t('Ils ne voient que ce message, jamais le nom du groupe'), tone: 'ok' };
          openGroup(g);
        },
      }));
      actions.push({ label: t('Annuler'), icon: 'back', run: back });
      const text = line.body.k === 'msg' ? oneLine(shownText(line.body.text)).slice(0, 80) : '';
      return { heading: t('Signaler ce message'), icon: 'alert', lead: t('« {text} » de {name}. Les modérateurs reçoivent ce message seul, signé par son auteur ; le nom du groupe ne part pas.', { text, name: line.name }), sections: [], actions, back };
    }, 0);
  }

  function confirm(question: string, lead: string, yes: string, run: () => void, cancel: () => void): void {
    lib.openCustom(() => ({ heading: question, icon: 'alert', lead, sections: [], actions: [{ label: yes, icon: 'check', tone: 'warning', run }, { label: t('Annuler'), icon: 'back', run: cancel }], back: cancel }), 1);
  }

  function confirmLeave(g: string): void {
    const v = groups.view(g);
    confirm(t('Quitter « {group} » ?', { group: v?.name ?? '' }), t('Ses messages disparaissent de cette borne. Pour y revenir, un membre devra vous inviter de nouveau.'), t('Quitter le groupe'), () => {
      if (groups.leave(g)) flash = { text: t('Vous avez quitté « {group} »', { group: v?.name ?? '' }), tone: 'ok' };
      lib.openCustom(buildList, 0);
    }, () => openGroup(g));
  }

  // ---------- Choisir la table de la semaine ----------

  function openChooseTable(g: string): void {
    lib.openCustom(() => {
      const back = () => openGroup(g);
      const actions: Action[] = [];
      const fullTitle = (e: TableEntry) => presenceTableLabel(presenceTable(e));
      const list = [...host.tables()].sort((a, b) => a.title.localeCompare(b.title));
      const rows: Row[] = list.map((e) => {
        const index = actions.push({ label: e.title, key: `table:${e.file}`, icon: 'play', run: () => {
          if (groups.setWeek(g, presenceTable(e))) flash = { text: t('Table de la semaine : {table}', { table: e.title }), detail: t('Tous les membres la voient en tête du groupe'), tone: 'ok' };
          back();
        } }) - 1;
        const thumb = host.wheel?.(e);
        return { text: fullTitle(e), ...(thumb ? { thumb } : {}), action: index, pick: true };
      });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return {
        heading: t('Choisir la table de la semaine'),
        icon: 'play',
        subheading: groups.view(g)?.name,
        lead: t('Pour tous les membres, jusqu’à dimanche 23:59. Ceux qui ne l’ont pas la voient grisée.'),
        sections: rows.length ? [{ title: t('Vos tables ({n})', { n: rows.length }), rows }] : [{ rows: [{ text: t('Aucune table sur cette borne'), tone: 'info' }] }],
        actions,
        back,
      };
    }, 0);
  }

  // ---------- Inviter des amis ----------

  function openInvite(g: string): void {
    const picked = new Set<string>();
    const build = (): Built => {
      const v = groups.view(g);
      const back = () => openGroup(g);
      const actions: Action[] = [];
      const room = v ? GROUP_MEMBERS_MAX - v.members.length - v.invited.length : 0;
      const candidates = friendsSorted().filter((f) => v && !isMember(v, f.key) && !v.invited.some((i) => i.key === f.key));
      const rows = candidates.map((f) => {
        const on = picked.has(f.key);
        const full = !on && picked.size >= room;
        const index = actions.push({ label: f.name, key: `friend:${f.key}`, run: () => (full ? undefined : (on ? picked.delete(f.key) : picked.add(f.key), lib.openCustom(build))) }) - 1;
        return friendRow(f, on, index, full ? t('{n} membres au plus', { n: GROUP_MEMBERS_MAX }) : undefined);
      });
      actions.push(
        picked.size
          ? { label: tn(picked.size, 'Inviter {n} ami', 'Inviter {n} amis'), icon: 'check', tone: 'ok', detail: t('Les invitations partent tout de suite'), run: () => {
              const n = groups.invite(g, candidates.filter((f) => picked.has(f.key)));
              flash = { text: tn(n, '{n} invitation envoyée', '{n} invitations envoyées'), detail: t('Elles arrivent à vos amis dès que leur borne est allumée'), tone: 'ok' };
              back();
            } }
          : { label: t('Inviter'), icon: 'check', tone: 'quiet', detail: t('Indisponible : cochez au moins un ami'), run: () => undefined },
        { label: t('Annuler'), icon: 'back', run: back },
      );
      return { heading: t('Inviter des amis'), icon: 'friend-add', subheading: v?.name, lead: t('Seuls vos amis peuvent être invités. Ils voient le groupe dès qu’ils acceptent.'), sections: [{ title: t('Vos amis'), rows: rows.length ? rows : [{ text: t('Tous vos amis sont membres ou invités'), tone: 'info' }] }], actions, back, listStart: t('cocher ou décocher') };
    };
    lib.openCustom(build, 0);
  }

  // ---------- Membres ----------

  function openMembers(g: string): void {
    const build = (): Built => {
      const v = groups.view(g);
      const back = () => openGroup(g);
      const here = () => lib.openCustom(build);
      const actions: Action[] = [];
      if (!v) return { heading: t('Membres'), icon: 'friends', sections: [], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
      const creator = v.creator === myKey();
      const rows: Row[] = v.members.map((m) => {
        const p = presence(m.key);
        const facts = [m.key === v.creator ? t('Créateur') : undefined, p.text].filter(Boolean).join(' · ');
        const index = actions.push({ label: m.name, key: `member:${m.key}`, icon: 'account', run: () => (creator && m.key !== myKey() ? openMember(g, m.key, here) : openPlayer(m.key, here)) }) - 1;
        return { text: m.key === myKey() ? t('{name} (vous)', { name: m.name }) : m.name, avatar: avatar(m.key, m.name), flag: flag(m.country), detail: facts, ...(p.on ? { tone: 'ok' as const } : {}), action: index, pick: true };
      });
      const pending: Row[] = v.invited.map((i) => {
        const by = v.members.find((m) => m.key === i.by)?.name ?? '?';
        const index = actions.push({ label: i.name, key: `invited:${i.key}`, icon: 'account', run: () => (creator ? openMember(g, i.key, here) : openPlayer(i.key, here)) }) - 1;
        return { text: i.name, avatar: avatar(i.key, i.name), detail: t('Invité par {name} · en attente de sa réponse', { name: i.by === myKey() ? t('vous') : by }), tone: 'quiet', action: index, pick: true };
      });
      const e = groups.entry(g);
      // L'accès : le créateur l'ouvre ou le ferme (le curseur reste dessus) ; les autres le lisent.
      const access: Action =
        v.access === 'public'
          ? { label: t('Accès : public'), icon: 'group', detail: creator ? t('Dans la liste des groupes publics. Start : le rendre privé (il en sort aussitôt)') : t('Dans la liste des groupes publics ; seul le créateur change l’accès'), ...(creator ? {} : { tone: 'quiet' as const }), run: () => (creator ? (groups.setAccess(g, 'private'), here()) : undefined) }
          : { label: t('Accès : privé'), icon: 'lock', detail: creator ? t('Sur invitation seulement. Start : le rendre public') : t('Sur invitation seulement ; seul le créateur change l’accès'), ...(creator ? {} : { tone: 'quiet' as const }), run: () => (creator ? (groups.setAccess(g, 'public'), here()) : undefined) };
      actions.push(
        access,
        e?.muted
          ? { label: t('Notifications du groupe : coupées'), icon: 'volume-mute', detail: t('Ses messages arrivent sans carte ni son'), run: () => (groups.setMuted(g, false), here()) }
          : { label: t('Notifications du groupe : activées'), icon: 'volume', detail: t('Ses messages arrivent avec leur carte et leur son'), run: () => (groups.setMuted(g, true), here()) },
        { label: t('Retour'), icon: 'back', run: back },
      );
      return {
        heading: t('Membres'),
        icon: 'friends',
        subheading: v.name,
        lead: creator ? t('Vous avez créé ce groupe : Start sur un membre pour le retirer.') : t('Chaque membre peut inviter ses amis ; le créateur peut retirer un membre.'),
        sections: [{ title: tn(v.members.length, '{n} membre', '{n} membres'), kind: 'players', rows }, ...(pending.length ? [{ title: tn(pending.length, '{n} invitation en attente', '{n} invitations en attente'), kind: 'players', rows: pending }] : [])],
        actions,
        back,
      };
    };
    lib.openCustom(build, 0);
  }

  /** Un membre, vu par le créateur : sa fiche, ou le retirer. */
  function openMember(g: string, key: string, back: () => void): void {
    lib.openCustom(() => {
      const v = groups.view(g);
      const m = v?.members.find((x) => x.key === key);
      const i = v?.invited.find((x) => x.key === key);
      const name = m?.name ?? i?.name ?? '?';
      const actions: Action[] = [
        { label: t('Voir son profil'), icon: 'account', run: () => openPlayer(key, () => openMember(g, key, back)) },
        {
          label: m ? t('Retirer {name} du groupe…', { name }) : t('Annuler l’invitation de {name}…', { name }),
          icon: 'close',
          tone: 'warning',
          detail: m ? t('Il ne voit plus le groupe ; ses messages restent') : t('L’invitation ne vaut plus'),
          run: () =>
            confirm(m ? t('Retirer {name} du groupe ?', { name }) : t('Annuler l’invitation de {name} ?', { name }), m ? t('Pour y revenir, un membre devra l’inviter de nouveau.') : t('Un membre pourra l’inviter de nouveau.'), m ? t('Retirer') : t('Annuler l’invitation'), () => {
              if (groups.expel(g, key)) flash = { text: m ? t('{name} ne fait plus partie du groupe', { name }) : t('Invitation de {name} annulée', { name }), tone: 'ok' };
              openMembers(g);
            }, () => openMember(g, key, back)),
        },
        { label: t('Retour'), icon: 'back', run: back },
      ];
      return { heading: name, avatar: avatar(key, name), subheading: v?.name, sections: [], actions, back };
    }, 0);
  }

  // ---------- Invitations reçues ----------

  function openInvitations(back: () => void): void {
    const list = groups.invitations();
    if (list.length === 1) return openInvitation(list[0]!.invitation.g, back);
    lib.openCustom(() => {
      const actions: Action[] = [];
      const here = () => openInvitations(back);
      const rows: Row[] = groups.invitations().map(({ invitation, view }) => {
        const from = inviterName(invitation.from, view);
        const index = actions.push({ label: view.name, key: `inv:${view.id}`, icon: groupIcon(view), run: () => openInvitation(view.id, here) }) - 1;
        return { text: view.name, avatar: avatar(invitation.from, from), detail: t('De {name} · {n} membres · {ago}', { name: from, n: view.members.length, ago: socialAgo(invitation.arrived, now()) }), action: index, pick: true };
      });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return { heading: t('Invitations reçues'), icon: 'friend-request', sections: [{ rows: rows.length ? rows : [{ text: t('Aucune invitation en attente'), tone: 'info' }] }], actions, back };
    }, 0);
  }

  function openInvitation(g: string, back: () => void): void {
    lib.openCustom(() => {
      const found = groups.invitations().find((x) => x.invitation.g === g);
      if (!found) return { heading: t('Invitation'), icon: 'friend-request', sections: [{ rows: [{ text: t('Cette invitation n’est plus en attente'), tone: 'info' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
      const { invitation, view } = found;
      const from = inviterName(invitation.from, view);
      const members: Row[] = view.members.map((m) => ({ text: m.name, avatar: avatar(m.key, m.name), flag: flag(m.country), detail: [m.key === view.creator ? t('Créateur') : undefined, presence(m.key).text].filter(Boolean).join(' · ') }));
      const sections: Section[] = [{ title: t('Membres'), kind: 'players', rows: members }];
      if (view.week) {
        const local = localTable(view.week.table);
        const thumb = local ? host.wheel?.(local) : undefined;
        const made = view.week.table.manufacturer && view.week.table.year ? `${view.week.table.manufacturer} ${view.week.table.year} · ` : '';
        sections.push({ title: t('Table de la semaine'), rows: [{ text: view.week.table.title, detail: made + (local ? t('déjà dans votre borne') : t('pas dans votre borne')), ...(thumb ? { thumb } : { icon: 'play' as const }), aside: local ? t('Prête') : t('Absente'), ...(local ? {} : { tone: 'quiet' as const }) }] });
      }
      const problem = blocked();
      const actions: Action[] = [
        problem
          ? { label: t('Accepter'), icon: 'check', tone: 'quiet', detail: t('Indisponible : {reason}', { reason: problem }), run: () => undefined }
          : { label: t('Accepter'), icon: 'check', tone: 'ok', detail: t('Rejoindre {group}', { group: view.name }), run: () => {
              if (groups.accept(g)) flash = { text: t('Bienvenue dans « {group} »', { group: view.name }), detail: t('Les messages arrivent dès qu’un membre est en ligne'), tone: 'ok' };
              lib.openCustom(buildList, 0);
              openGroup(g, () => lib.openCustom(buildList, 0));
            } },
        { label: t('Refuser'), icon: 'close', detail: t('{name} n’en saura rien de plus que « refusée »', { name: from }), run: () => {
          if (groups.decline(g)) flash = { text: t('Invitation refusée'), tone: 'ok' };
          lib.openCustom(buildList, 0);
        } },
        { label: t('Retour'), icon: 'back', run: back },
      ];
      return {
        heading: view.name,
        avatar: avatar(invitation.from, from),
        subheading: view.access === 'public' ? (invitation.from === view.creator ? t('{name} vous invite dans son groupe public', { name: from }) : t('{name} vous invite dans un groupe public', { name: from })) : invitation.from === view.creator ? t('{name} vous invite dans son groupe privé', { name: from }) : t('{name} vous invite dans un groupe privé', { name: from }),
        lead: t('Accepter : vous voyez la discussion, la table de la semaine et le classement du groupe ; ses membres voient votre pseudo, votre pays et votre avatar.'),
        sections,
        actions,
        back,
      };
    }, 0);
  }

  // ---------- Au téléphone (lot 4 de la Communauté au téléphone, 18/11/2026) ----------

  /** Le constat du dernier geste fait au téléphone ; effacé au geste suivant à la borne. */
  let phoneNotice: RemoteGroups['notice'];
  onGesture(() => (phoneNotice = undefined));
  const flagSrc = (country: string | undefined) => flag(country).src;
  const member = (key: string, name: string, country: string | undefined, detail: string): RemoteMember => {
    const src = flagSrc(country);
    return { key, name, ...(src ? { flag: src } : {}), detail, ...(key === myKey() ? { me: true as const } : {}) };
  };

  /** Un groupe ouvert au téléphone : la table de la semaine et son classement, ses membres, les amis à inviter. */
  function groupHead(v: GroupView): RemoteGroupHead {
    const local = v.week ? localTable(v.week.table) : undefined;
    const ranks = v.week ? ranking(v) : [];
    const invite = inviteState(v);
    return {
      g: v.id,
      ...(v.week
        ? { week: { title: v.week.table.title, detail: weekMeta(v.week), ...(local ? (host.busy?.() ? { reason: host.busy()! } : {}) : { reason: t('pas dans votre borne') }) } }
        : { noWeek: t('« Choisir la table de la semaine » : un membre la choisit pour tous, jusqu’à dimanche') }),
      ranking: ranks.map((r, i) => {
        const src = flagSrc(r.country);
        return { rank: i + 1, name: r.key === myKey() ? t('Vous') : r.name, ...(src ? { flag: src } : {}), score: formatNumber(r.score), ...(r.key === myKey() ? { me: true as const } : {}) };
      }),
      ...(v.week && !ranks.length ? { rankingEmpty: t('Pas encore de score depuis le choix de la table') } : {}),
      members: [
        ...v.members.map((m) => member(m.key, m.name, m.country, [m.key === v.creator ? t('Créateur') : undefined, presence(m.key).text].filter(Boolean).join(' · '))),
        ...v.invited.map((i) => member(i.key, i.name, undefined, t('Invité par {name} · en attente de sa réponse', { name: i.by === myKey() ? t('vous') : (v.members.find((m) => m.key === i.by)?.name ?? '?') }))),
      ],
      invitable: invite.candidates.map((f) => member(f.key, f.name, undefined, presence(f.key).text)),
      ...(invite.reason ? { inviteReason: invite.reason } : {}),
      muted: Boolean(groups.entry(v.id)?.muted),
      leave: leaveDetail(v),
    };
  }

  /** « Messages » au téléphone : créer un groupe, les invitations reçues, les groupes publics (et les miens). */
  function remoteGroups(): RemoteGroups {
    const problem = blocked();
    const face = (key: string, name: string) => avatar(key, name);
    const facts = (view: GroupView) => {
      const creator = view.members.find((m) => m.key === view.creator)?.name;
      return [tn(view.members.length, '{n} membre', '{n} membres'), ...(creator ? [t('créé par {name}', { name: creator })] : []), ...(view.week ? [t('Table de la semaine : {table}', { table: view.week.table.title })] : [])].join(' · ');
    };
    const preview = (view: GroupView) => [
      ...(view.week ? [t('Table de la semaine : {table}', { table: view.week.table.title }) + ` · ${localTable(view.week.table) ? t('déjà dans votre borne') : t('pas dans votre borne')}`] : []),
      ...view.members.slice(0, 12).map((m) => [m.name, m.key === view.creator ? t('Créateur') : undefined, presence(m.key).text].filter(Boolean).join(' · ')),
    ];
    const invitations = problem
      ? []
      : groups.invitations().map(({ invitation, view }) => {
          const from = inviterName(invitation.from, view);
          return {
            g: view.id,
            name: view.name,
            avatar: face(invitation.from, from),
            detail: [t('{name} vous invite', { name: from }), tn(view.members.length, '{n} membre', '{n} membres'), ...(view.week ? [t('Table de la semaine : {table}', { table: view.week.table.title })] : [])].join(' · '),
          };
        });
    const directory = problem ? [] : groups.publicGroups();
    const mine = problem ? [] : groups.groups().filter((g) => g.view.access === 'public');
    return {
      ...(problem ? { blocked: problem } : {}),
      create: { detail: t('Public ou privé, un nom, des amis à inviter'), ...((problem ?? host.busy?.()) ? { reason: (problem ?? host.busy?.())! } : {}) },
      invitations,
      publics: [
        ...directory.map(({ view }) => {
          const reason = joinReason(view);
          return { g: view.id, name: shownName(view.name), detail: facts(view), avatars: view.members.slice(0, 3).map((m) => face(m.key, m.name)), ...(reason ? { reason } : {}), preview: preview(view) };
        }),
        ...mine.map(({ view }) => ({ g: view.id, name: view.name, detail: facts(view), avatars: view.members.slice(0, 3).map((m) => face(m.key, m.name)), member: true as const, preview: preview(view) })),
      ],
      ...(phoneNotice ? { notice: phoneNotice } : {}),
    };
  }

  function remoteAct(act: RemoteGroupAct, g: string | undefined, key: string | undefined, back: () => void): void {
    const say = (text: string, tone: 'ok' | 'warning' = 'ok') => (phoneNotice = { text, tone });
    if (act === 'directory') return groups.askDirectory();
    if (act === 'create') {
      // À la borne : le nom s'y tape (clavier du téléphone), les amis s'y cochent ; la liste d'abord, pour son « Retour ».
      if (blocked() || host.busy?.()) return;
      listBack = back;
      lib.openCustom(buildList, 0);
      openCreate(() => lib.openCustom(buildList, 0));
      return;
    }
    if (!g || blocked()) return;
    // Une invitation reçue, et elle seule.
    if (act === 'accept' || act === 'decline') {
      const found = groups.invitations().find((x) => x.invitation.g === g);
      if (!found) return;
      if (act === 'accept' ? groups.accept(g) : groups.decline(g)) say(act === 'accept' ? t('Bienvenue dans « {group} »', { group: found.view.name }) : t('Invitation refusée'));
      return;
    }
    // Un groupe public de l'annuaire, qu'on peut rejoindre.
    if (act === 'join') {
      const found = groups.publicGroups().find((x) => x.view.id === g);
      if (!found || joinReason(found.view)) return;
      if (groups.joinPublic(g)) say(t('Bienvenue dans « {group} »', { group: found.view.name }));
      else say(t('Ce groupe n’a pas pu être rejoint'), 'warning');
      return;
    }
    // L'un de mes groupes.
    const v = groups.view(g);
    if (!v || !isMember(v, myKey())) return;
    switch (act) {
      case 'play': {
        const local = v.week ? localTable(v.week.table) : undefined;
        if (local && !host.busy?.()) host.play(local);
        return;
      }
      case 'invite': {
        const friend = inviteState(v).candidates.find((f) => f.key === key);
        if (friend && groups.invite(g, [friend])) say(tn(1, '{n} invitation envoyée', '{n} invitations envoyées'));
        return;
      }
      case 'mute':
      case 'unmute':
        groups.setMuted(g, act === 'mute');
        return;
      case 'leave':
        if (groups.leave(g)) say(t('Vous avez quitté « {group} »', { group: v.name }));
        return;
    }
  }

  return {
    door,
    open,
    openGroup,
    openPublic,
    openNews(back) {
      listBack = back;
      const invites = groups.invitations();
      if (invites.length) return openInvitation(invites[0]!.invitation.g, () => lib.openCustom(buildList, 0));
      const unread = groups.groups().find((g) => g.entry.unread > 0);
      if (unread) return openGroup(unread.view.id, () => lib.openCustom(buildList, 0));
      lib.openCustom(buildList, 0);
    },
    shown: () => (current && lib.isShowing(groupBuild(current.g)) ? current.g : undefined),
    remote(open) {
      if (blocked()) return { rows: [], unread: 0 };
      const mine = groups.groups();
      // La pastille d'un groupe : ses initiales sur une teinte tirée de son identifiant (jamais un membre).
      const face = (id: string, name: string) => avatarView(id.repeat(4), name);
      const rows: RemoteCommunityRow[] = mine.map(({ entry, view }) => {
        const last = view.messages.at(-1);
        const on = onlineCount(view);
        return {
          key: `g:${view.id}`,
          name: view.name,
          avatar: face(view.id, view.name),
          presence: [tn(view.members.length, '{n} membre', '{n} membres'), ...(on ? [tn(on, '{n} en ligne', '{n} en ligne')] : [])].join(' · '),
          state: on ? 'online' : 'offline',
          last: lastFact(view),
          ...(last ? { when: time(last.at) } : {}),
          ...(entry.unread ? { unread: entry.unread } : {}),
          group: true,
        };
      });
      const unread = mine.reduce((n, g) => n + g.entry.unread, 0);
      const g = open?.startsWith('g:') ? open.slice(2) : undefined;
      const v = g ? groups.view(g) : undefined;
      if (!g || !v || !isMember(v, myKey())) return { rows, unread };
      // Ouvert sous les yeux, au téléphone : ce qui arrive est lu.
      if (groups.entry(g)?.unread) groups.markRead(g);
      const items: RemoteThread['items'] = [];
      let day: string | undefined;
      for (const line of v.messages.slice(-THREAD_SHOWN)) {
        if (line.body.k !== 'msg') continue;
        if (dayOf(line.at) !== day) {
          day = dayOf(line.at);
          items.push({ kind: 'day', text: dayLabel(line.at) });
        }
        const out = line.by === myKey();
        const c = chips(v, line);
        // Plusieurs auteurs dans un groupe : le pseudo de chacun au-dessus de sa bulle ; l'heure dessous.
        items.push({ kind: 'line', id: line.id, text: shownText(line.body.text), out, meta: time(line.at), bubble: out ? 'out' : 'in', ...(out ? {} : { author: line.name }), ...(c.length ? { chips: c } : {}) });
      }
      const on = onlineCount(v);
      return {
        rows,
        unread,
        thread: {
          key: `g:${v.id}`,
          name: v.name,
          avatar: face(v.id, v.name),
          presence: [tn(v.members.length, '{n} membre', '{n} membres'), accessText(v)].join(' · '),
          state: on ? 'online' : 'offline',
          status: on ? { text: tn(on, '{n} membre en ligne', '{n} membres en ligne'), detail: t('Vos messages leur arrivent tout de suite'), tone: 'ok' } : { text: t('Aucun autre membre en ligne'), detail: t('Vos messages partiront dès qu’un membre sera en ligne'), tone: 'info' },
          ...(groups.typers(v.id).length ? { typing: groups.typers(v.id).map((x) => x.name) } : {}),
          items,
          reactions: REACTIONS.map((r) => ({ id: r, label: reactionLabel(r) })),
          phrases: chatPhrases(),
          group: groupHead(v),
        },
      };
    },
    remoteGroups,
    remoteAct,
  };
}
