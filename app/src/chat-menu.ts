// Menu système > Amis > Messages : la messagerie entre amis à l'écran (chat-service.ts).
//
// - « Messages » : une ligne par ami, les conversations les plus récentes d'abord, puis les amis à
//   qui l'on n'a pas encore écrit (en ligne d'abord) ; le non-lu porte la pastille rouge et son mot.
// - Le fil d'un ami : ses messages et les miens, en bulles, avec les évènements de l'amitié
//   (records, badges) en cartes de la borne. Les flippers choisissent un message, Start ouvre
//   « Répondre » (réaction sur ce message, phrase rapide, clavier à l'écran ou téléphone),
//   MagnaSave passe à l'ami précédent ou suivant, Exit sort du fil.
// - Options d'une conversation (sourdine, effacer, bloquer) et réglages de la messagerie.
// Une fonction indisponible reste visible, grisée, avec sa raison (partage coupé, messagerie
// coupée chez soi ou chez l'ami, ami qui n'en est plus un).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau d'essai.

import {
  avatarView,
  badgeDefinition,
  badgeLabel,
  CHAT_KEEP_CHOICES,
  CHAT_REACTIONS,
  CHAT_REACTION_ICONS,
  chatPhrases,
  eventText,
  lastLine,
  locale,
  offlineText,
  pendingFor,
  presenceTableLabel,
  reactionLabel,
  reactionsOf,
  t,
  threadLines,
  tn,
  type ChatKeep,
  type ChatLine,
  type ChatReaction,
  type Conversation,
  type Friend,
  type IconName,
  type AvatarView,
} from '@cyberpinball/core';
import type { ChatService } from './chat-service';
import type { RemoteChat, RemoteCommunity, RemoteThread } from './phone-remote';
import { onGesture } from './gesture-flash';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { SocialNet } from './social-net';

export interface ChatMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    isShowing(build: () => Built): boolean;
    openSystem(): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  };
  net: SocialNet;
  chat: ChatService;
  /** Touches de la bascule des zones (MagnaSave, F6) : dans le fil, l'ami précédent ou suivant. */
  zoneKeys?(): string[];
  /** Fiche d'un ami et « Trouver un joueur » (friends-menu.ts). */
  openFriend?(key: string, back: () => void): void;
  openFind?(): void;
  /** « Partage et réseau » (friends-menu.ts) : là où se réactive le partage. */
  openSharing?(): void;
  /** Bloquer un joueur : confirmé, puis le blocage du réseau des bornes. */
  block(key: string): void;
  now?(): Date;
}

export interface ChatMenu {
  item: ProvidedSystemItem;
  /** Le fil d'un ami (fiche d'un ami : « Écrire »), son « Retour » vers `back`. */
  openThread(key: string, back?: () => void): void;
  /** Ce que dit l'action « Écrire » de la fiche d'un ami. */
  writeDetail(key: string): string;
  /** Le fil de cet ami est-il à l'écran (pas de notification pour ce qu'on lit déjà) ? */
  threadOnScreen(key: string): boolean;
  /** Clic sur la notification d'un message : le fil du dernier message non lu, sinon la liste ; « Retour » vers `back`. */
  openUnread(back?: () => void): void;
  /**
   * Pendant une partie, pour le téléphone appairé : le fil de la conversation la plus récente (ses
   * derniers messages), les réactions et les phrases ; undefined si le réglage le coupe ou s'il n'y a rien.
   */
  remoteChat(): RemoteChat | undefined;
  /**
   * La rubrique Communauté du téléphone : les conversations dans l'ordre de la liste (amis sans
   * message compris), et le fil ouvert au téléphone (`open`, la clé d'un ami), lu puisqu'il est sous
   * les yeux ; ou pourquoi la messagerie est fermée.
   */
  remoteCommunity(open?: string): RemoteCommunity;
  /** Le fil d'un ami à l'écran : sa carte, pour le fronton (pastille, présence, faits) ; undefined sinon. */
  frontonCard(): { name: string; avatar: AvatarView; presence: string; facts: string[] } | undefined;
}

/** Messages du fil montrés au plus (les plus anciens restent dans le fichier). */
const THREAD_SHOWN = 200;
/** Au téléphone : éléments du fil envoyés au plus (les plus récents), et conversations de la liste. */
const THREAD_PHONE = 80;
const COMMUNITY_SHOWN = 100;

export function createChatMenu(host: ChatMenuHost): ChatMenu {
  const now = () => host.now?.() ?? new Date();
  const net = host.net;
  const chat = host.chat;
  const lib = host.library;
  // Le pseudo seul, avec l'avatar (jamais d'étiquette accolée : l'identifiant est sur la fiche du joueur).
  const name = (_key: string, plain: string) => plain;
  const avatar = (key: string, plain: string) => avatarView(key, plain, net.avatarFile(key));
  const friendOf = (key: string): Friend | undefined => net.state().friends.find((f) => f.key === key);
  const knownName = (key: string) => friendOf(key)?.name ?? net.state().directory.find((d) => d.profile.key === key)?.profile.name ?? key.slice(0, 8);
  /** Constat de la dernière action, en tête de l'écran suivant. */
  let flash: Row | undefined;
  // Montré à chaque dessin jusqu'au geste suivant, jamais effacé par build() (gesture-flash.ts).
  onGesture(() => (flash = undefined));
  const takeFlash = (): Section[] => (flash ? [{ rows: [flash] }] : []);

  // ---------- Dates ----------

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const dayOf = (iso: string) => new Date(iso).toDateString();
  function dayLabel(iso: string): string {
    const d = new Date(iso);
    const today = now();
    if (d.toDateString() === today.toDateString()) return t('Aujourd’hui');
    if (d.toDateString() === new Date(today.getTime() - 86_400_000).toDateString()) return t('Hier');
    return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }
  /** Moment d'une conversation dans la liste : l'heure aujourd'hui, sinon le jour. */
  function shortWhen(iso: string): string {
    const d = new Date(iso);
    if (d.toDateString() === now().toDateString()) return time(iso);
    if (now().getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString(locale(), { weekday: 'short' });
    return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
  }

  // ---------- Présence et raisons ----------

  function presenceText(key: string): string {
    const f = friendOf(key);
    if (!f) return t('N’est plus dans vos amis');
    const online = net.online(key);
    if (!online) return offlineText(net.listSync(), f.lastSeen, now());
    const p = net.presenceOf(key);
    if (p?.status === 'playing' && p.table) return t('En partie : {table}', { table: presenceTableLabel(p.table) });
    return t('En ligne · Dans le menu des tables');
  }

  /** Pourquoi on ne peut pas écrire à cet ami en ce moment ; undefined : on peut. */
  function writeBlocked(key: string): string | undefined {
    if (!net.state().enabled) return t('Partage désactivé : personne ne vous voit, vous ne voyez personne');
    if (!chat.state().enabled) return t('Messagerie désactivée sur cette borne : Réglages de la messagerie');
    if (!friendOf(key)) return t('N’est plus dans vos amis : conversation en lecture seule');
    return undefined;
  }

  // ---------- Liste des conversations ----------

  function convOf(key: string): Conversation | undefined {
    return chat.state().conversations[key];
  }

  function listDetail(): string {
    if (!net.state().enabled) return t('Indisponible : partage désactivé (Partage et réseau)');
    if (!chat.state().enabled) return t('Désactivée sur cette borne · Réglages de la messagerie');
    const unread = Object.values(chat.state().conversations).reduce((n, c) => n + c.unread, 0);
    if (unread) return tn(unread, '{n} message non lu', '{n} messages non lus');
    return t('Écrire à vos amis, même absents : le message part à leur retour');
  }

  function openList(at?: number): void {
    lib.openCustom(buildList, at);
  }

  /** Les conversations dans l'ordre de la liste : la plus récente d'abord, puis les amis sans message (en ligne d'abord), puis celles d'anciens amis. */
  function listKeys(): { key: string; plain: string }[] {
    const s = net.state();
    const withLines = s.friends.filter((f) => convOf(f.key)?.lines.length).sort((a, b) => Date.parse(lastAt(b.key)) - Date.parse(lastAt(a.key)));
    const without = s.friends.filter((f) => !convOf(f.key)?.lines.length).sort((a, b) => Number(net.online(b.key)) - Number(net.online(a.key)) || a.name.localeCompare(b.name));
    // Les conversations d'anciens amis (retirés par eux) restent lisibles, après.
    const former = Object.keys(chat.state().conversations).filter((k) => !friendOf(k) && !s.blocked.includes(k) && convOf(k)?.lines.length);
    return [...withLines.map((f) => ({ key: f.key, plain: f.name })), ...without.map((f) => ({ key: f.key, plain: f.name })), ...former.map((k) => ({ key: k, plain: knownName(k) }))];
  }

  /** Ce que la liste dit d'une conversation : le dernier message, son moment, les non-lus, une note (refus, attente, ancien ami). */
  function convFacts(key: string): { sub: string; aside?: string; unread: number; note?: { text: string; sign: string; tone: 'error' | 'quiet' }; tone?: 'quiet' | 'ok' } {
    const c = convOf(key);
    const last = c ? lastLine(c) : undefined;
    const pending = c ? pendingFor(chat.state(), key).length : 0;
    const refuses = c?.accepts === false;
    const gone = !friendOf(key);
    return {
      sub: last ? `${last.out ? t('Vous : {text}', { text: oneLine(last.text!) }) : oneLine(last.text!)}` : t('Pas encore de message'),
      ...(last ? { aside: shortWhen(last.at) } : {}),
      unread: c?.unread ?? 0,
      ...(refuses
        ? { note: { text: t('N’accepte pas de messages'), sign: '✕', tone: 'error' as const } }
        : pending
          ? { note: { text: tn(pending, '{n} message en attente de sa connexion', '{n} messages en attente de sa connexion'), sign: '◷', tone: 'quiet' as const } }
          : gone
            ? { note: { text: t('N’est plus dans vos amis'), sign: '✕', tone: 'quiet' as const } }
            : {}),
      ...(gone || refuses ? { tone: 'quiet' as const } : net.online(key) ? { tone: 'ok' as const } : {}),
    };
  }

  /** La marque de présence d'un ami sur sa pastille : en ligne, en partie, hors ligne, ou plus un ami. */
  function presenceState(key: string): RemoteThread['state'] {
    if (!friendOf(key)) return 'gone';
    if (!net.online(key)) return 'offline';
    return net.presenceOf(key)?.status === 'playing' ? 'playing' : 'online';
  }

  function buildList(): Built {
    const s = net.state();
    const actions: Action[] = [];
    const sections: Section[] = [...takeFlash()];
    if (!s.enabled) sections.push({ rows: [{ text: t('Partage désactivé : personne ne vous voit, vous ne voyez personne'), detail: t('Partage et réseau : « Activer le partage »'), tone: 'warning', badges: [t('Désactivé')] }] });
    else if (!chat.state().enabled) sections.push({ rows: [{ text: t('Messagerie désactivée sur cette borne'), detail: t('Vos amis voient « N’accepte pas de messages ». Réglages de la messagerie : « Messagerie »'), tone: 'warning', badges: [t('Désactivée')] }] });
    // Les conversations, la plus récente d'abord ; puis les amis sans message, en ligne d'abord ; puis les anciens amis.
    const row = (key: string, plain: string): Row => {
      const index = actions.push({ label: name(key, plain), key: `conv:${key}`, icon: 'message', run: () => openThread(key, () => openList(index)) }) - 1;
      const f = convFacts(key);
      return {
        text: name(key, plain),
        avatar: avatar(key, plain),
        detail: presenceText(key),
        tone: f.tone,
        sub: f.sub,
        ...(f.aside ? { aside: f.aside } : {}),
        ...(f.unread ? { unread: true, badges: [tn(f.unread, '{n} non lu', '{n} non lus')] } : {}),
        ...(f.note ? { note: f.note } : {}),
        action: index,
        pick: true,
      };
    };
    const rows = listKeys().map(({ key, plain }) => row(key, plain));
    if (rows.length) sections.push({ rows });
    else sections.push({ rows: [{ text: t('Pas encore d’ami à qui écrire'), detail: t('« Trouver un joueur » : cherchez un nom dans l’annuaire, ou une borne de votre réseau local'), tone: 'info', icon: 'friend-add' }] });
    if (!rows.length && host.openFind) actions.push({ label: t('Trouver un joueur'), detail: t('Chercher un nom, voir les bornes à proximité'), icon: 'friend-add', run: () => host.openFind!() });
    actions.push({ label: t('Réglages de la messagerie'), detail: settingsDetail(), icon: 'sliders', run: () => openSettings(() => openList(Number.MAX_SAFE_INTEGER)) });
    actions.push({ label: t('Retour'), icon: 'back', run: () => lib.openSystem() });
    return {
      heading: t('Messages'),
      icon: 'message',
      subheading: t('Entre amis seulement · gardés sur cette borne, sur aucun serveur'),
      sections,
      actions,
      back: () => lib.openSystem(),
      listStart: t('ouvrir le fil'),
    };
  }

  const lastAt = (key: string) => (convOf(key) ? lastLine(convOf(key)!)?.at : undefined) ?? '1970-01-01T00:00:00Z';
  const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ');

  // ---------- Le fil d'un ami ----------

  /** Fil à l'écran : sa clé, et où revenir. */
  let thread: { key: string; back: () => void } | undefined;
  /** L'écran du fil, une seule fonction par ami : lib.isShowing la reconnaît. */
  const threadBuilds = new Map<string, () => Built>();
  const threadBuild = (key: string) => {
    let b = threadBuilds.get(key);
    if (!b) threadBuilds.set(key, (b = () => buildThread(key)));
    return b;
  };

  function openThread(key: string, back?: () => void): void {
    thread = { key, back: back ?? thread?.back ?? (() => openList()) };
    chat.markRead(key);
    // Ouvert sur le dernier message (les messages sont les premières actions du fil) : les plus récents, en bas, sous les yeux.
    const c = convOf(key);
    const messages = c ? Math.min(threadLines(c).length, THREAD_SHOWN) : 0;
    lib.openCustom(threadBuild(key), Math.max(0, messages - 1));
  }

  /** Les conversations dans l'ordre de la liste : MagnaSave passe à la voisine. */
  function neighbours(): string[] {
    const list = buildListKeys();
    return list;
  }
  function buildListKeys(): string[] {
    const s = net.state();
    const withLines = s.friends.filter((f) => convOf(f.key)?.lines.length).sort((a, b) => Date.parse(lastAt(b.key)) - Date.parse(lastAt(a.key)));
    const without = s.friends.filter((f) => !convOf(f.key)?.lines.length).sort((a, b) => Number(net.online(b.key)) - Number(net.online(a.key)) || a.name.localeCompare(b.name));
    return [...withLines, ...without].map((f) => f.key);
  }

  function statusRow(key: string): Row {
    const blocked = writeBlocked(key);
    const f = friendOf(key);
    if (blocked) return { text: blocked, tone: 'warning', icon: 'alert' };
    const c = convOf(key);
    if (c?.accepts === false) return { text: t('{name} n’accepte pas de messages', { name: f!.name }), detail: t('Ce que vous écrivez attendra qu’il rouvre sa messagerie'), tone: 'warning', icon: 'close' };
    if (!net.online(key)) return { text: t('{name} est hors ligne', { name: f!.name }), detail: t('Vos messages partiront dès que vos deux bornes seront allumées en même temps'), tone: 'info', icon: 'clock' };
    return { text: t('{name} est en ligne', { name: f!.name }), detail: t('Vos messages partent tout de suite ; « Reçu » quand sa borne les a'), tone: 'ok', icon: 'check' };
  }

  /** Un élément du fil : un jour, un évènement de l'ami (record, badge) ou un message ; la borne et le téléphone le dessinent chacun. */
  type ThreadItem =
    | { kind: 'day'; text: string }
    | { kind: 'event'; text: string; time: string; icon: IconName }
    | { kind: 'line'; line: ChatLine; meta: string; bubble: 'in' | 'out' | 'pending' | 'expired'; chips: string[] };

  /** Les messages et les évènements de l'ami, mêlés par date, un jour en tête de chaque journée. */
  function threadItems(key: string): ThreadItem[] {
    const f = friendOf(key);
    const plain = f?.name ?? knownName(key);
    const c = convOf(key) ?? { lines: [], unread: 0 };
    const reactions = reactionsOf(c);
    type Item = { at: string; line?: ChatLine; event?: Friend['events'][number] };
    const items: Item[] = [
      ...threadLines(c).slice(-THREAD_SHOWN).map((line) => ({ at: line.at, line })),
      ...(f?.events ?? []).filter((e) => e.kind !== 'played').slice(0, 20).map((event) => ({ at: event.at, event })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const out: ThreadItem[] = [];
    let day: string | undefined;
    for (const item of items) {
      if (dayOf(item.at) !== day) {
        day = dayOf(item.at);
        out.push({ kind: 'day', text: dayLabel(item.at) });
      }
      if (item.event) {
        const e = item.event;
        out.push({ kind: 'event', text: eventText(e, badgeLabel), time: time(e.at), icon: (e.kind === 'badge' ? (badgeDefinition(e.badge!)?.icon ?? 'medal') : 'star') as IconName });
        continue;
      }
      const line = item.line!;
      const r = reactions.get(line.id);
      const chips = [r?.theirs ? t('{reaction} · {name}', { reaction: reactionLabel(r.theirs), name: plain }) : undefined, r?.mine ? t('{reaction} · vous', { reaction: reactionLabel(r.mine) }) : undefined].filter((x): x is string => !!x);
      const meta = line.out
        ? line.delivery === 'received'
          ? t('{time} · Reçu', { time: time(line.at) })
          : line.delivery === 'expired'
            ? t('{time} · Non remis : {name} n’est pas venu en ligne depuis 30 jours', { time: time(line.at), name: plain })
            : c.accepts === false
              ? t('{time} · En attente : il n’accepte pas de messages', { time: time(line.at) })
              : t('{time} · En attente · partira quand {name} sera en ligne', { time: time(line.at), name: plain })
        : time(line.at);
      out.push({ kind: 'line', line, meta, bubble: line.out ? (line.delivery === 'pending' ? 'pending' : line.delivery === 'expired' ? 'expired' : 'out') : 'in', chips });
    }
    return out;
  }

  function buildThread(key: string): Built {
    const f = friendOf(key);
    const plain = f?.name ?? knownName(key);
    const up = thread?.key === key ? thread.back : () => openList();
    // Ouvert sous les yeux : ce qui arrive est lu.
    if (convOf(key)?.unread) chat.markRead(key);
    const c = convOf(key) ?? { lines: [], unread: 0 };
    const actions: Action[] = [];
    const rows: Row[] = [];
    // Les messages et les évènements de l'ami (records, badges), mêlés par date.
    const items = threadItems(key);
    const blocked = writeBlocked(key);
    for (const item of items) {
      if (item.kind === 'day') {
        rows.push({ text: item.text, bubble: 'day' });
        continue;
      }
      if (item.kind === 'event') {
        rows.push({ text: item.text, detail: item.time, icon: item.icon, bubble: 'card' });
        continue;
      }
      const { line, meta, chips } = item;
      const index = actions.push({
        label: line.text!,
        key: `line:${line.id}`,
        icon: 'message',
        ...(blocked ? { tone: 'quiet' as const, detail: t('Indisponible : {reason}', { reason: blocked }) } : {}),
        run: () => (blocked ? undefined : openReply(key, line.id)),
      }) - 1;
      rows.push({
        text: line.text!,
        detail: meta,
        bubble: item.bubble,
        ...(chips.length ? { badges: chips } : {}),
        action: index,
        pick: true,
      });
    }
    if (!items.length) rows.push({ text: t('Pas encore de message : écrivez le premier'), bubble: 'day' });
    // Écrire : toujours là, grisé avec sa raison quand on ne peut pas.
    actions.push(
      blocked
        ? { label: t('Écrire un message…'), key: 'compose', icon: 'keyboard', tone: 'quiet', detail: t('Indisponible : {reason}', { reason: blocked }), run: () => undefined }
        : { label: t('Écrire un message…'), key: 'compose', icon: 'keyboard', detail: t('Clavier à l’écran, ou votre téléphone appairé'), run: () => compose(key) },
      blocked
        ? { label: t('Réponse rapide…'), icon: 'star', tone: 'quiet', detail: t('Indisponible : {reason}', { reason: blocked }), run: () => undefined }
        : { label: t('Réponse rapide…'), icon: 'star', detail: t('Une phrase toute prête, d’un appui'), run: () => openReply(key) },
      { label: t('Options de la conversation'), icon: 'sliders', detail: c.muted ? t('Notifications coupées pour {name}', { name: plain }) : t('Couper ses notifications, effacer, bloquer'), run: () => openOptions(key) },
      ...(host.openFriend && f ? [{ label: t('Voir sa fiche'), icon: 'friend-list' as IconName, run: () => host.openFriend!(key, () => openThread(key)) }] : []),
      { label: t('Retour'), icon: 'back', run: up },
    );
    return {
      heading: name(key, plain),
      icon: 'message',
      avatar: avatar(key, plain),
      subheading: presenceText(key),
      sections: [...takeFlash(), { rows: [statusRow(key)] }, { kind: 'chat', rows }],
      actions,
      back: up,
      listStart: t('répondre'),
      listCommands: [{ key: 'MagnaSave', desk: 'F6', text: t('ami précédent · suivant') }],
      keys: (input) => {
        const magna = host.zoneKeys?.() ?? [];
        if (!magna.includes(input.code)) return false;
        if (input.type !== 'keyDown') return true;
        const list = neighbours();
        if (list.length < 2) return true;
        const dir = magna.length > 1 && magna.indexOf(input.code) === 0 ? -1 : 1;
        const at = list.indexOf(key);
        const next = list[(at + dir + list.length) % list.length]!;
        openThread(next, up);
        return true;
      },
    };
  }

  function compose(key: string, value = ''): void {
    const plain = friendOf(key)?.name ?? knownName(key);
    lib.openPrompt(
      t('Message à {name}', { name: plain }),
      t('Votre message'),
      value,
      (text) => {
        if (text !== undefined && text.trim()) {
          if (!chat.send(key, text)) flash = { text: t('Message trop long : 500 caractères au plus'), tone: 'warning' };
        }
        openThread(key);
      },
      t('Le clavier à l’écran, ou votre téléphone appairé : son texte s’écrit ici en direct. 500 caractères au plus.'),
    );
  }

  // ---------- Répondre : réaction, phrase rapide ----------

  function openReply(key: string, target?: string): void {
    lib.openCustom(() => buildReply(key, target), 0);
  }

  function buildReply(key: string, target?: string): Built {
    const plain = friendOf(key)?.name ?? knownName(key);
    const back = () => openThread(key);
    const c = convOf(key) ?? { lines: [], unread: 0 };
    const targetLine = target ? c.lines.find((l) => l.id === target) : undefined;
    const mine = target ? reactionsOf(c).get(target)?.mine : undefined;
    const actions: Action[] = [];
    const sections: Section[] = [];
    if (targetLine) {
      const rows: Row[] = CHAT_REACTIONS.map((r: ChatReaction) => {
        const on = mine === r;
        const index = actions.push({ label: reactionLabel(r), key: `react:${r}`, icon: CHAT_REACTION_ICONS[r] as IconName, run: () => { chat.react(key, target!, on ? null : r); back(); } }) - 1;
        return { text: reactionLabel(r), icon: CHAT_REACTION_ICONS[r] as IconName, ...(on ? { current: true, detail: t('Votre réaction · Start la retire') } : {}), action: index, pick: true };
      });
      sections.push({ title: t('Réagir à « {text} »', { text: oneLine(targetLine.text ?? '').slice(0, 60) }), kind: 'reactions', rows });
    }
    const phrases: Row[] = chatPhrases().map((p) => {
      const index = actions.push({ label: p, key: `phrase:${p}`, icon: 'message', run: () => { chat.send(key, p); back(); } }) - 1;
      return { text: p, action: index, pick: true };
    });
    sections.push({ title: t('Phrases'), kind: 'phrases', rows: phrases });
    actions.push({ label: t('Écrire un message…'), icon: 'keyboard', detail: t('Clavier à l’écran, ou votre téléphone appairé'), run: () => compose(key) });
    actions.push({ label: t('Annuler'), icon: 'back', run: back });
    return { heading: t('Répondre à {name}', { name: plain }), icon: 'message', avatar: avatar(key, plain), sections, actions, back, listStart: t('envoyer') };
  }

  // ---------- Options d'une conversation ----------

  function openOptions(key: string): void {
    lib.openCustom(() => buildOptions(key), 0);
  }

  function buildOptions(key: string): Built {
    const plain = friendOf(key)?.name ?? knownName(key);
    const back = () => openThread(key);
    const c = convOf(key);
    const count = c ? threadLines(c).length : 0;
    const actions: Action[] = [
      c?.muted
        ? { label: t('Rétablir ses notifications'), icon: 'volume', detail: t('Ses messages arrivent avec leur carte et leur son'), run: () => { chat.setMuted(key, false); openOptions(key); } }
        : { label: t('Couper ses notifications'), icon: 'volume-mute', detail: t('Ses messages arrivent sans carte ni son'), run: () => { chat.setMuted(key, true); openOptions(key); } },
      count
        ? { label: t('Effacer la conversation'), icon: 'trash', detail: tn(count, 'Sur cette borne seulement · {n} message', 'Sur cette borne seulement · {n} messages'), run: () => confirm(t('Effacer la conversation avec {name} ?', { name: plain }), t('Sur cette borne seulement : {name} garde la sienne.', { name: plain }), t('Effacer'), () => { chat.clear(key); flash = { text: t('Conversation avec {name} effacée', { name: plain }), tone: 'ok' }; openThread(key); }, () => openOptions(key)) }
        : { label: t('Effacer la conversation'), icon: 'trash', tone: 'quiet', detail: t('Indisponible : aucun message'), run: () => undefined },
    ];
    if (friendOf(key)) actions.push({ label: t('Bloquer {name}', { name: plain }), icon: 'lock', tone: 'warning', detail: t('Plus d’amitié, de message ni d’invitation · il n’est pas prévenu'), run: () => confirm(t('Bloquer {name} ?', { name: plain }), t('La conversation est effacée de cette borne. « Partage et réseau » le débloque.'), t('Bloquer'), () => { host.block(key); chat.clear(key); flash = { text: t('{name} bloqué : « Partage et réseau » le débloque', { name: plain }), tone: 'ok' }; openList(); }, () => openOptions(key)) });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return { heading: t('Options · {name}', { name: plain }), icon: 'sliders', avatar: avatar(key, plain), subheading: presenceText(key), sections: [], actions, back };
  }

  function confirm(question: string, lead: string, yes: string, run: () => void, cancel: () => void): void {
    lib.openCustom(() => ({ heading: question, icon: 'alert', lead, sections: [], actions: [{ label: yes, icon: 'check', tone: 'warning', run }, { label: t('Annuler'), icon: 'back', run: cancel }], back: cancel }), 1);
  }

  // ---------- Réglages de la messagerie ----------

  const keepLabel = (k: ChatKeep) => (k === 30 ? t('30 jours') : k === 365 ? t('1 an') : t('Toujours'));

  function settingsDetail(): string {
    const s = chat.state();
    return s.enabled ? t('Activée · messages gardés {keep}', { keep: keepLabel(s.keep) }) : t('Désactivée sur cette borne');
  }

  function openSettings(back: () => void, at?: number): void {
    settingsBack = back;
    lib.openCustom(buildSettings, at);
  }
  let settingsBack: () => void = () => openList();

  function buildSettings(): Built {
    const s = chat.state();
    const here = (at: number) => openSettings(settingsBack, at);
    const pending = Object.keys(s.conversations).reduce((n, k) => n + pendingFor(s, k).length, 0);
    const muted = Object.entries(s.conversations).filter(([, c]) => c.muted).map(([k]) => knownName(k));
    const conversations = Object.values(s.conversations).filter((c) => threadLines(c).length).length;
    const actions: Action[] = [
      { label: t('Messagerie'), icon: 'message', detail: s.enabled ? t('Activée · vos amis peuvent vous écrire') : t('Désactivée · vos amis voient « N’accepte pas de messages »'), run: () => { chat.setEnabled(!s.enabled); here(0); } },
      { label: t('Son des messages'), icon: 'sound', detail: s.sound ? t('Activé · au menu et en partie') : t('Désactivé'), run: () => { chat.setSound(!s.sound); here(1); } },
      { label: t('Répondre depuis le téléphone pendant une partie'), icon: 'phone', detail: s.phoneInGame ? t('Activé · le téléphone appairé lit et répond, les boutons restent à VPX') : t('Désactivé · les messages se lisent au retour au menu'), run: () => { chat.setPhoneInGame(!s.phoneInGame); here(2); } },
      { label: t('Garder les messages'), icon: 'history', detail: t('{keep} · sur cette borne seulement, puis effacés', { keep: keepLabel(s.keep) }), run: () => { const i = CHAT_KEEP_CHOICES.indexOf(s.keep); chat.setKeep(CHAT_KEEP_CHOICES[(i + 1) % CHAT_KEEP_CHOICES.length]!); here(3); } },
      conversations
        ? { label: t('Effacer toutes les conversations…'), icon: 'trash', tone: 'warning', detail: tn(conversations, 'Sur cette borne seulement · {n} conversation', 'Sur cette borne seulement · {n} conversations'), run: () => confirm(t('Effacer toutes les conversations ?'), t('Sur cette borne seulement : vos amis gardent les leurs.'), t('Tout effacer'), () => { chat.clearAll(); flash = { text: t('Conversations effacées'), tone: 'ok' }; here(4); }, () => here(4)) }
        : { label: t('Effacer toutes les conversations…'), icon: 'trash', tone: 'quiet', detail: t('Indisponible : aucune conversation'), run: () => undefined },
      { label: t('Retour'), icon: 'back', run: () => settingsBack() },
    ];
    const rows: Row[] = [
      { text: t('Messages en attente'), detail: pending ? tn(pending, '{n} message partira à la connexion de son destinataire', '{n} messages partiront à la connexion de leurs destinataires') : t('Aucun : tout est parti'), icon: 'clock', tone: pending ? 'info' : 'quiet' },
      { text: t('Amis en sourdine'), detail: muted.length ? muted.join(', ') : t('Aucun'), icon: 'volume-mute', tone: muted.length ? 'info' : 'quiet' },
      { text: t('En mode invité, pas de messagerie'), detail: t('Le menu système est fermé ; les notifications de message attendent le déverrouillage.'), icon: 'guest', tone: 'quiet' },
    ];
    return { heading: t('Messagerie'), icon: 'message', subheading: t('Menu système · Amis'), sections: [...takeFlash(), { rows }], actions, back: () => settingsBack() };
  }

  // ---------- Entrée du menu système ----------

  return {
    item: {
      get detail() {
        return listDetail();
      },
      get attention() {
        return net.state().enabled && chat.state().enabled && Object.values(chat.state().conversations).some((c) => c.unread > 0);
      },
      get tone() {
        return !net.state().enabled ? ('quiet' as const) : undefined;
      },
      run: () => (net.state().enabled ? openList() : host.openSharing ? host.openSharing() : openList()),
    },
    openThread,
    writeDetail: (key) => {
      const c = convOf(key);
      const blocked = writeBlocked(key);
      if (blocked) return t('Indisponible : {reason}', { reason: blocked });
      if (c?.unread) return tn(c.unread, '{n} message non lu', '{n} messages non lus');
      return net.online(key) ? t('Il est en ligne : le message part tout de suite') : t('Hors ligne : le message partira à son retour');
    },
    threadOnScreen: (key) => lib.isShowing(threadBuild(key)),
    frontonCard: () => {
      const key = thread?.key;
      if (!key || !lib.isShowing(threadBuild(key))) return undefined;
      const f = friendOf(key);
      if (!f) return undefined;
      const record = f.events.find((e) => e.kind === 'record');
      const facts = [
        ...(record ? [eventText(record, badgeLabel)] : []),
        t('Amis depuis le {date}', { date: new Date(f.since).toLocaleDateString(locale()) }),
      ];
      return { name: f.name, avatar: avatar(key, f.name), presence: presenceText(key), facts };
    },
    remoteChat: () => {
      const s = chat.state();
      if (!s.enabled || !s.phoneInGame || !net.state().enabled) return undefined;
      // La conversation au dernier message (un ami seulement : on lui répond).
      const key = Object.keys(s.conversations).filter((k) => friendOf(k) && threadLines(s.conversations[k]!).length).sort((a, b) => Date.parse(lastAt(b)) - Date.parse(lastAt(a)))[0];
      if (!key) return undefined;
      const c = s.conversations[key]!;
      const lines = threadLines(c).slice(-8).map((l) => ({
        id: l.id,
        text: l.text!,
        out: l.out,
        time: time(l.at),
        ...(l.out && l.delivery === 'pending' ? { note: t('En attente') } : l.out && l.delivery === 'received' ? { note: t('Reçu') } : {}),
      }));
      return { key, name: friendOf(key)!.name, lines, reactions: CHAT_REACTIONS.map((r) => ({ id: r, label: reactionLabel(r) })), phrases: chatPhrases() };
    },
    remoteCommunity: (open) => {
      const closed = !net.state().enabled ? t('Partage désactivé : personne ne vous voit, vous ne voyez personne') : !chat.state().enabled ? t('Messagerie désactivée sur cette borne : Réglages de la messagerie') : undefined;
      const rows = listKeys()
        .slice(0, COMMUNITY_SHOWN)
        .map(({ key, plain }) => {
          const f = convFacts(key);
          return {
            key,
            name: plain,
            avatar: avatar(key, plain),
            presence: presenceText(key),
            state: presenceState(key),
            last: f.sub,
            ...(f.aside ? { when: f.aside } : {}),
            ...(f.unread ? { unread: f.unread } : {}),
            ...(f.note ? { note: f.note.text } : {}),
          };
        });
      let thread: RemoteThread | undefined;
      if (open && (friendOf(open) || convOf(open)?.lines.length)) {
        // Ouvert sous les yeux, au téléphone : ce qui arrive est lu.
        if (convOf(open)?.unread) chat.markRead(open);
        const plain = friendOf(open)?.name ?? knownName(open);
        const status = statusRow(open);
        const blocked = writeBlocked(open);
        thread = {
          key: open,
          name: plain,
          avatar: avatar(open, plain),
          presence: presenceText(open),
          state: presenceState(open),
          status: { text: status.text, ...(status.detail ? { detail: status.detail } : {}), tone: status.tone === 'warning' ? 'warning' : status.tone === 'ok' ? 'ok' : 'info' },
          ...(blocked ? { blocked } : {}),
          items: threadItems(open)
            .slice(-THREAD_PHONE)
            .map((it) => (it.kind === 'line' ? { kind: 'line' as const, id: it.line.id, text: it.line.text!, out: it.line.out, meta: it.meta, bubble: it.bubble, ...(it.chips.length ? { chips: it.chips } : {}) } : it.kind === 'event' ? { kind: 'event' as const, text: it.text, time: it.time } : { kind: 'day' as const, text: it.text })),
          reactions: CHAT_REACTIONS.map((r) => ({ id: r, label: reactionLabel(r) })),
          phrases: chatPhrases(),
        };
      }
      const unread = Object.entries(chat.state().conversations).reduce((n, [k, c]) => n + (friendOf(k) ? c.unread : 0), 0);
      return { ...(closed ? { closed } : {}), unread, rows, ...(thread ? { thread } : {}) };
    },
    openUnread: (back) => {
      const unread = Object.entries(chat.state().conversations).filter(([k, c]) => c.unread > 0 && friendOf(k)).sort(([a], [b]) => Date.parse(lastAt(b)) - Date.parse(lastAt(a)));
      const key = unread[0]?.[0];
      if (key) openThread(key, back ?? (() => openList()));
      else openList();
    },
  };
}
