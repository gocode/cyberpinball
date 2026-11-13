// Salons par pays (rooms.ts, décidés le 12/11/2026) à l'écran : le journal d'un salon à l'ancienne
// (une ligne par message, l'heure, le drapeau, <pseudo> à la teinte de sa clé), les présents, écrire
// (phrases rapides, clavier à l'écran, téléphone), les options d'une ligne (répondre, profil, demande
// d'ami, ignorer, bloquer), les règles acceptées une fois, la liste des salons et les réglages de la
// communauté (Menu système > Amis > Réglages de la communauté).
//
// Le salon à l'écran est annoncé au réseau (net.roomOpen) : j'y suis présent, son historique est
// demandé ; dès que son écran n'est plus affiché, je n'y suis plus.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau d'essai.

import {
  activeRooms,
  avatarView,
  cleanRoomText,
  countryCodes,
  countryName,
  flagView,
  locale,
  maskWords,
  mentions,
  relationOf,
  roomCountry,
  roomLines,
  roomOfCountry,
  t,
  tn,
  WORLD_ROOM,
  lineHidden,
  MOD_REASONS,
  MUTE_HOURS,
  pendingReports,
  roomTopic,
  sanctionOf,
  TOPIC_MAX,
  type ModReason,
  type RoomId,
  type RoomLine,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { SocialNet } from './social-net';

export interface RoomsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    isShowing(build: () => Built): boolean;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  };
  net: SocialNet;
  openProfile(key: string, back: () => void): void;
  openFriend(key: string, back: () => void): void;
  /** La table choisie dans la roue : la phrase « Quelqu'un sur … ? ». */
  currentTable(): TableEntry | undefined;
  /** Un téléphone est relié au menu : on y écrit. */
  phoneLinked(): boolean;
  now?(): Date;
}

export interface RoomsMenu {
  /** Le salon par défaut (mon pays, sinon Monde), son « Retour » vers `back`. */
  openDefault(back: () => void): void;
  openRoom(room: RoomId, back: () => void): void;
  /** Clic sur la notification d'une mention : le salon de la dernière mention, sinon le salon par défaut. */
  openMention(back: () => void): void;
  /** Le salon par défaut et ce que dit sa porte dans l'accueil Communauté. */
  door(): { label: string; detail: string; attention: boolean; quiet: boolean };
  /** Menu système > Amis > Réglages de la communauté. */
  settingsItem: ProvidedSystemItem;
  /** Nom d'un salon (« Salon France », « Salon Monde »). */
  roomName(room: RoomId): string;
  /** Le salon par défaut. */
  defaultRoom(): RoomId;
  /** Lignes non lues qui me citent, tous salons confondus. */
  unreadMentions(): number;
  /** Le salon à l'écran (téléphone) ; undefined : aucun. */
  shown(): RoomId | undefined;
  /** Écrire depuis le téléphone (ou un autre clavier) dans un salon : la raison d'un refus, en clair. */
  write(room: RoomId, text: string): string | undefined;
  /** Menu système > Amis > Modération (modérateurs seulement) : la file des signalements. */
  moderationItem: ProvidedSystemItem;
  /** Clic sur la notification d'un signalement : la file, son « Retour » vers `back`. */
  openModeration(back: () => void): void;
  /** Le salon pour le téléphone : celui à l'écran, sinon celui par défaut ; ses 60 dernières lignes. */
  remote(): { room: RoomId; name: string; present: number; lines: { time: string; nick?: string; hue?: number; text: string; kind: 'line' | 'me' | 'mention' | 'own' | 'sys' }[]; phrases: string[]; blocked?: string };
}

/** Lignes du journal montrées au plus (les plus récentes). */
const LOG_SHOWN = 120;

export function createRoomsMenu(host: RoomsMenuHost): RoomsMenu {
  const net = host.net;
  const lib = host.library;
  const now = () => host.now?.() ?? new Date();
  let current: { room: RoomId; back: () => void } | undefined;
  let notice: { text: string; tone: 'ok' | 'warning' | 'error' } | undefined;
  let lastMentionRoom: RoomId | undefined;

  const me = () => net.state();
  const myCountry = () => net.country();
  const defaultRoom = (): RoomId => net.rooms().defaultRoom ?? (myCountry() ? roomOfCountry(myCountry()!) : WORLD_ROOM);
  const roomName = (room: RoomId): string => {
    const c = roomCountry(room);
    return c ? t('Salon {country}', { country: countryName(c, locale()) }) : t('Salon Monde');
  };
  const hueOf = (key: string, name: string) => avatarView(key, name).hue;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const ignored = (key: string) => net.rooms().ignored.includes(key) || me().blocked.includes(key);
  const visible = (l: RoomLine) => !ignored(l.key);
  const shownText = (text: string) => (net.rooms().filter ? maskWords(text) : text);

  // Le salon n'est plus à l'écran : je n'y suis plus présent (vérifié toutes les 20 s, et à chaque ouverture).
  const watch = setInterval(() => {
    if (current && !lib.isShowing(buildRoom)) net.roomOpen(undefined);
  }, 20_000);
  watch.unref?.();

  // Une ligne qui cite mon pseudo, dans un salon qui n'est pas à l'écran : retenue pour la notification.
  net.onRoomLines((lines) => {
    const name = me().name;
    const hit = lines.filter((l) => visible(l) && mentions(l.text, name));
    if (hit.length) lastMentionRoom = hit.at(-1)!.room;
  });

  function unreadMentions(): number {
    const s = net.rooms();
    const name = me().name;
    return s.lines.filter((l) => l.key !== me().key.publicKey && visible(l) && mentions(l.text, name) && (!s.read[l.room] || Date.parse(l.at) > Date.parse(s.read[l.room]!))).length;
  }

  /** Pourquoi on ne peut pas écrire, en clair ; undefined : on peut. */
  function writeProblem(room: RoomId): string | undefined {
    if (!me().enabled) return t('Partage désactivé : Partage et réseau');
    const s = net.rooms();
    if (!s.enabled) return t('Salons désactivés : Réglages de la communauté');
    if (!net.status().running) return t('Pas relié au réseau des bornes pour l’instant');
    void room;
    return mySanction();
  }

  function sendReason(reason: string): string {
    switch (reason) {
      case 'rules':
        return t('Acceptez d’abord les règles des salons');
      case 'gap':
        return t('Trois secondes entre deux lignes : réessayez');
      case 'burst':
        return t('Vingt lignes en dix minutes au plus : patientez un peu');
      case 'disabled':
        return t('Salons désactivés : Réglages de la communauté');
      case 'muted':
        return mySanction() ?? t('Décision de la modération : vous ne pouvez pas écrire pour l’instant');
      default:
        return t('Ligne vide ou trop longue : 300 caractères au plus');
    }
  }

  function reasonLabel(r: ModReason): string {
    switch (r) {
      case 'insults':
        return t('Insultes ou harcèlement');
      case 'spam':
        return t('Spam ou publicité');
      case 'shocking':
        return t('Contenu choquant');
      case 'personal':
        return t('Informations personnelles');
      default:
        return t('Autre');
    }
  }

  /** Ma sanction en cours, en clair (« En sourdine jusqu'à 22:40 · raison : insultes ») ; undefined : aucune. */
  function mySanction(): string | undefined {
    const a = sanctionOf(net.moderation().acts, me().key.publicKey, now());
    if (!a) return undefined;
    const why = a.reason ? t('raison : {reason}', { reason: reasonLabel(a.reason).toLowerCase() }) : undefined;
    const head = a.kind === 'ban' ? t('Exclu des salons par la modération') : t('En sourdine jusqu’à {time}', { time: time(a.until!) });
    return [head, a.kind === 'mute' ? t('décision de la modération') : undefined, why].filter(Boolean).join(' · ');
  }

  /** Écrire : « /me … » est une action ; « /ignorer pseudo » ignore ce joueur. Rend la raison d'un refus. */
  function write(room: RoomId, raw: string): string | undefined {
    const text = cleanRoomText(raw);
    if (!text) return sendReason('text');
    const ignore = /^\/ignorer\s+(.+)$/i.exec(text);
    if (ignore) {
      const who = ignore[1]!.trim().replace(/^@/, '').toLowerCase();
      const line = [...roomLines(net.rooms(), room)].reverse().find((l) => l.name.toLowerCase() === who) ?? net.roomPresent(room).find((h) => h.name.toLowerCase() === who);
      if (!line || line.key === me().key.publicKey) return t('Personne de ce nom dans le salon');
      setIgnored(line.key, true);
      notice = { text: t('{name} est ignoré dans les salons', { name: line.name }), tone: 'ok' };
      return undefined;
    }
    const action = /^\/me\s+(.+)$/i.exec(text);
    const r = net.roomSend(room, action ? action[1]! : text, Boolean(action));
    return 'reason' in r ? sendReason(r.reason) : undefined;
  }

  function setIgnored(key: string, on: boolean): void {
    const list = net.rooms().ignored.filter((k) => k !== key);
    net.setRooms({ ignored: on ? [...list, key] : list });
  }

  // ---------- Le salon ----------

  /** Le curseur sur la dernière ligne du journal (la plus récente), s'il y en a une. */
  function lastLineAt(): number | undefined {
    const keys = buildRoom().actions.map((a) => a.key ?? '');
    for (let i = keys.length - 1; i >= 0; i--) if (keys[i]!.startsWith('line:')) return i;
    return undefined;
  }

  function openRoom(room: RoomId, back: () => void): void {
    current = { room, back };
    net.roomOpen(room);
    lib.openCustom(buildRoom, lastLineAt());
  }

  function buildRoom(): Built {
    const { room, back } = current!;
    const s = net.rooms();
    const self = me().key.publicKey;
    const lines = roomLines(s, room).filter(visible);
    const last = lines.at(-1);
    // Ce qui est à l'écran est lu.
    if (last && (!s.read[room] || Date.parse(last.at) > Date.parse(s.read[room]!))) queueMicrotask(() => net.setRooms({ read: { ...net.rooms().read, [room]: last.at } }));
    const moves = net.roomMoves(room).filter((m) => !ignored(m.key) && m.key !== self);
    const items = [...lines.map((l) => ({ at: l.at, line: l })), ...moves.map((m) => ({ at: m.at, move: m }))].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-LOG_SHOWN);
    const actions: Action[] = [];
    const sections: Section[] = [];
    if (notice) {
      sections.push({ rows: [{ text: notice.text, tone: notice.tone }] });
      notice = undefined;
    }
    // Le sujet du salon, posé par la modération.
    const acts = net.moderation().acts;
    const topic = roomTopic(acts, room, now());
    if (topic) sections.push({ kind: 'room-topic', rows: [{ text: t('Sujet : {text}', { text: topic.text! }), icon: 'pin', tone: 'info' }] });
    const rows: Row[] = items.map((it) => {
      if ('move' in it && it.move) {
        const m = it.move;
        return { text: m.join ? t('→ {name} arrive', { name: m.name }) : t('← {name} part', { name: m.name }), log: { time: time(m.at), text: m.join ? t('→ {name} arrive', { name: m.name }) : t('← {name} part', { name: m.name }), kind: 'sys' } } satisfies Row;
      }
      const l = (it as { line: RoomLine }).line;
      const own = l.key === self;
      const hidden = lineHidden(acts, l.id, now());
      const text = hidden ? t('message masqué par la modération') : shownText(l.text);
      const index = actions.push({ label: t('Ligne de {name} à {time}', { name: l.name, time: time(l.at) }), key: `line:${l.id}`, run: () => openLine(l) }) - 1;
      const kind = hidden ? 'masked' : own ? 'own' : l.me ? 'me' : mentions(l.text, me().name) ? 'mention' : 'line';
      return {
        text: `${l.name} : ${text}`,
        log: { time: time(l.at), nick: l.name, hue: hueOf(l.key, l.name), text, kind, ...(l.country ? { flag: flagView(l.country, locale()) } : {}) },
        action: index,
        pick: true,
      } satisfies Row;
    });
    if (!rows.length) rows.push({ text: t('Rien d’écrit ici ces sept derniers jours'), detail: t('Soyez le premier : « Écrire dans le salon »'), icon: 'message', tone: 'quiet' });
    sections.push({ kind: 'room', rows });
    // Les présents, dans la colonne latérale (à droite au bureau, dessous en borne).
    const present = net.roomPresent(room).filter((h) => !ignored(h.key));
    sections.push({
      title: t('Présents ({n})', { n: present.length }),
      side: true,
      kind: 'players',
      rows: present.length
        ? present.map((h) => ({
            text: h.name,
            avatar: avatarView(h.key, h.name, net.avatarFile(h.key)),
            ...(h.country ? { flag: flagView(h.country, locale()) } : {}),
            badges: h.key === self ? [t('Vous')] : relationOf(me(), h.key) === 'friend' ? [t('Ami')] : [],
          }))
        : [{ text: t('Personne pour l’instant'), tone: 'quiet' }],
    });
    // Un salon de pays vide : Monde en un geste.
    if (room !== WORLD_ROOM && present.length <= 1) actions.push({ label: t('Aller au salon Monde'), detail: t('Tous les pays, en anglais de préférence'), icon: 'globe', run: () => openRoom(WORLD_ROOM, back) });
    const problem = writeProblem(room);
    actions.push({
      label: t('Écrire dans le salon'),
      detail: problem ?? (s.rulesAt ? t('Phrases, clavier à l’écran, téléphone · 300 caractères') : t('Les règles des salons d’abord, une fois')),
      icon: 'message',
      ...(problem ? { tone: 'quiet' as const } : {}),
      run: () => (problem ? lib.openCustom(buildRoom) : s.rulesAt ? openWrite(room) : openRules(() => openWrite(room))),
    });
    // Modérateur : le sujet du salon et la file des signalements.
    if (net.amModerator()) {
      const pending = pendingReports(net.moderation()).length;
      actions.push({ label: t('Sujet du salon…'), detail: topic ? topic.text! : t('Aucun sujet · modération'), icon: 'pin', run: () => askTopic(room) });
      actions.push({ label: t('Signalements ({n})', { n: pending }), detail: t('Modération : les lignes signalées, à traiter'), icon: 'alert', ...(pending ? { attention: true } : {}), run: () => openModeration(() => openRoom(room, back)) });
    }
    actions.push({ label: t('Autres salons…'), detail: t('Monde, et les salons des autres pays'), icon: 'list', run: () => openList(() => openRoom(room, back)) });
    actions.push({ label: t('Règles des salons'), icon: 'rules', run: () => openRules(() => openRoom(room, back)) });
    actions.push({ label: t('Retour'), icon: 'back', run: () => leave(back) });
    return {
      heading: roomName(room),
      icon: 'globe',
      subheading: tn(present.length, '{n} présent', '{n} présents') + ' · ' + t('les lignes vivent sur les bornes, 7 jours au plus'),
      sections,
      actions,
      back: () => leave(back),
      variant: 'room',
      listHint: t('Flippers : parcourir · Start : options de la ligne · Exit : sortir du journal'),
    };
  }

  function leave(back: () => void): void {
    current = undefined;
    net.roomOpen(undefined);
    back();
  }

  // ---------- Écrire ----------

  function openWrite(room: RoomId): void {
    const backToRoom = () => openRoom(room, current?.back ?? (() => lib.openSystem()));
    const send = (text: string) => {
      if (!net.rooms().rulesAt) return openRules(() => openWrite(room));
      const why = write(room, text);
      if (why) notice = { text: why, tone: 'warning' };
      backToRoom();
    };
    const build = (): Built => {
      const table = host.currentTable();
      const phrases = [t('Qui veut faire une partie ?'), ...(table ? [t('Quelqu’un sur {table} ?', { table: table.title })] : []), t('Bien joué !'), t('J’arrive dans 5 minutes'), t('Merci !'), t('Bonne soirée !')];
      const mention = [...roomLines(net.rooms(), room)].reverse().find((l) => l.key !== me().key.publicKey && visible(l) && mentions(l.text, me().name));
      const actions: Action[] = [
        ...(mention ? [{ label: t('Répondre à @{name}', { name: mention.name }), detail: t('Il vous a cité à {time}', { time: time(mention.at) }), icon: 'message' as const, run: () => askText(room, `@${mention.name} `, send) }] : []),
        ...phrases.map((p, i) => ({ label: p, key: `phrase:${i}`, run: () => send(p) })),
        { label: t('Clavier à l’écran…'), detail: t('« /me … » pour une action'), icon: 'keyboard', run: () => askText(room, '', send) },
        {
          label: t('Sur le téléphone'),
          detail: host.phoneLinked() ? t('Communauté › Salon : le champ est prêt sur le téléphone') : t('Reliez un téléphone : Menu système › Télécommande du téléphone'),
          icon: 'phone',
          ...(host.phoneLinked() ? {} : { tone: 'quiet' as const }),
          run: () => lib.openCustom(build),
        },
        { label: t('Retour au salon'), icon: 'back', run: backToRoom },
      ];
      return { heading: t('Écrire dans le salon'), icon: 'message', subheading: roomName(room), lead: t('300 caractères, une ligne · @pseudo prévient le joueur · aucun lien'), sections: [], actions, back: backToRoom };
    };
    lib.openCustom(build);
  }

  function askText(room: RoomId, value: string, done: (text: string) => void): void {
    lib.openPrompt(t('Écrire dans le salon'), roomName(room), value, (text) => (text && text.trim() ? done(text) : openWrite(room)), t('Une ligne, 300 caractères au plus. « /me » pour une action, « /ignorer pseudo » pour ignorer un joueur.'));
  }

  // ---------- Une ligne ----------

  function openLine(l: RoomLine): void {
    const room = l.room;
    const backToRoom = () => openRoom(room, current?.back ?? (() => lib.openSystem()));
    const here = () => openLine(l);
    const build = (): Built => {
      const self = l.key === me().key.publicKey;
      const rel = relationOf(me(), l.key);
      const isIgnored = net.rooms().ignored.includes(l.key);
      const actions: Action[] = [];
      if (!self) {
        actions.push({ label: t('Répondre à {name}', { name: l.name }), detail: t('Votre ligne commencera par @{name}', { name: l.name }), icon: 'message', run: () => (net.rooms().rulesAt ? askText(room, `@${l.name} `, (text) => { const why = write(room, text); if (why) notice = { text: why, tone: 'warning' }; backToRoom(); }) : openRules(here)) });
        actions.push(rel === 'friend' ? { label: t('Voir sa fiche'), icon: 'friend-list', run: () => host.openFriend(l.key, here) } : { label: t('Voir son profil public'), detail: t('Pays, badges, records et activité récente'), icon: 'account', run: () => host.openProfile(l.key, here) });
        if (rel === 'none') actions.push({ label: t('Envoyer une demande d’ami'), detail: t('Il la verra dans « Demandes d’amis »'), icon: 'friend-add', run: () => { net.request({ key: l.key, name: l.name }); notice = { text: t('Demande envoyée à {name}', { name: l.name }), tone: 'ok' }; backToRoom(); } });
        actions.push(isIgnored
          ? { label: t('Ne plus ignorer {name}', { name: l.name }), icon: 'eye', run: () => { setIgnored(l.key, false); backToRoom(); } }
          : { label: t('Ignorer {name} dans les salons', { name: l.name }), detail: t('Ses lignes disparaissent de vos salons · il n’est pas prévenu'), icon: 'eye', run: () => { setIgnored(l.key, true); notice = { text: t('{name} est ignoré dans les salons', { name: l.name }), tone: 'ok' }; backToRoom(); } });
        actions.push({ label: t('Signaler ce message'), detail: t('Envoyé chiffré aux modérateurs, avec la raison ; {name} ne saura pas qui', { name: l.name }), icon: 'alert', run: () => askReason(t('Signaler ce message'), (reason) => { net.report(l, reason); notice = { text: t('Signalement envoyé aux modérateurs'), tone: 'ok' }; backToRoom(); }, here) });
        if (net.amModerator()) for (const a of decisions(l, backToRoom)) actions.push(a);
        actions.push({ label: t('Bloquer {name}', { name: l.name }), detail: t('Plus de demande, plus de connexion avec sa borne'), icon: 'lock', tone: 'warning', run: () => confirmBlock(l, here, backToRoom) });
      }
      actions.push({ label: t('Retour au salon'), icon: 'back', run: backToRoom });
      return {
        heading: l.name,
        avatar: avatarView(l.key, l.name, net.avatarFile(l.key)),
        subheading: self ? t('Votre ligne') : rel === 'friend' ? t('Votre ami') : t('Pas votre ami'),
        sections: [{ kind: 'room', rows: [{ text: `${l.name} : ${shownText(l.text)}`, log: { time: time(l.at), nick: l.name, hue: hueOf(l.key, l.name), text: shownText(l.text), kind: l.me ? 'me' : 'line', ...(l.country ? { flag: flagView(l.country, locale()) } : {}) } }] }],
        actions,
        back: backToRoom,
      };
    };
    lib.openCustom(build);
  }

  function confirmBlock(l: RoomLine, cancel: () => void, after: () => void): void {
    lib.openCustom(
      () => ({
        heading: t('Bloquer {name} ?', { name: l.name }),
        icon: 'alert',
        lead: t('Plus de demande d’ami, plus de connexion avec sa borne, ses lignes disparaissent de vos salons. Débloquer : Partage et réseau.'),
        sections: [],
        actions: [
          { label: t('Bloquer'), icon: 'lock', tone: 'warning', run: () => { net.block(l.key); notice = { text: t('{name} est bloqué', { name: l.name }), tone: 'ok' }; after(); } },
          { label: t('Annuler'), icon: 'back', run: cancel },
        ],
        back: cancel,
      }),
      1,
    );
  }

  // ---------- Modération ----------

  /** Choisir une raison (signaler, décider), puis `done`. */
  function askReason(heading: string, done: (reason: ModReason) => void, cancel: () => void): void {
    lib.openCustom(() => ({
      heading,
      icon: 'alert',
      lead: t('Pourquoi ? La raison est jointe, et dite au joueur s’il est sanctionné.'),
      sections: [],
      actions: [...MOD_REASONS.map((r) => ({ label: reasonLabel(r), key: `reason:${r}`, run: () => done(r) })), { label: t('Annuler'), icon: 'back' as const, run: cancel }],
      back: cancel,
    }));
  }

  /** Les décisions d'un modérateur sur une ligne : masquer, sourdine, exclure, lever ce qui est en cours. */
  function decisions(l: RoomLine, after: () => void): Action[] {
    const acts = net.moderation().acts;
    const decide = (act: Parameters<typeof net.moderate>[0], text: string) => {
      net.moderate(act);
      net.handleReports(l.id);
      notice = { text, tone: 'ok' };
      after();
    };
    const out: Action[] = [];
    const hide = acts.find((a) => a.kind === 'hide' && a.target === l.id && lineHidden([a], l.id, now()));
    out.push(
      hide
        ? { label: t('Ne plus masquer ce message'), detail: t('Modération · pour tous les joueurs'), icon: 'eye', run: () => decide({ kind: 'lift', target: hide.id }, t('Message de nouveau visible')) }
        : { label: t('Masquer ce message'), detail: t('Modération · pour tous les joueurs'), icon: 'eye', run: () => askReason(t('Masquer ce message'), (reason) => decide({ kind: 'hide', target: l.id, reason }, t('Message masqué pour tous')), () => openLine(l)) },
    );
    const current = sanctionOf(acts, l.key, now());
    if (current) {
      out.push({ label: t('Lever la sanction de {name}', { name: l.name }), detail: current.kind === 'ban' ? t('Exclu des salons') : t('En sourdine jusqu’à {time}', { time: time(current.until!) }), icon: 'unlock', run: () => decide({ kind: 'lift', target: current.id }, t('Sanction levée')) });
    } else {
      for (const hours of MUTE_HOURS) {
        const label = hours === 1 ? t('Sourdine 1 h') : hours === 24 ? t('Sourdine 24 h') : t('Sourdine 7 jours');
        out.push({ label, detail: t('Lecture seule dans tous les salons, et le message masqué'), icon: hours === 1 ? 'volume-low' : hours === 24 ? 'volume-mute' : 'calendar', key: `mute:${hours}`, run: () => askReason(label, (reason) => { net.moderate({ kind: 'hide', target: l.id, reason }); decide({ kind: 'mute', target: l.key, name: l.name, until: new Date(now().getTime() + hours * 3600_000).toISOString(), reason }, t('{name} en sourdine', { name: l.name })); }, () => openLine(l)) });
      }
      out.push({ label: t('Exclure des salons'), detail: t('Sans limite de durée, et le message masqué'), icon: 'close', tone: 'warning', run: () => askReason(t('Exclure des salons'), (reason) => { net.moderate({ kind: 'hide', target: l.id, reason }); decide({ kind: 'ban', target: l.key, name: l.name, reason }, t('{name} exclu des salons', { name: l.name })); }, () => openLine(l)) });
    }
    return out;
  }

  function askTopic(room: RoomId): void {
    const back = () => openRoom(room, current?.back ?? (() => lib.openSystem()));
    lib.openPrompt(t('Sujet du salon'), roomName(room), roomTopic(net.moderation().acts, room, now())?.text ?? '', (text) => {
      const clean = text === undefined ? undefined : (cleanRoomText(text) ?? '');
      if (clean !== undefined) {
        net.moderate({ kind: 'topic', room, text: [...clean].slice(0, TOPIC_MAX).join('') });
        notice = { text: clean ? t('Sujet posé') : t('Sujet retiré'), tone: 'ok' };
      }
      back();
    }, t('Une ligne, 120 caractères au plus ; vide : plus de sujet.'));
  }

  /** La file des signalements : une ligne par message signalé, les plus signalés d'abord. */
  function openModeration(back: () => void): void {
    const here = () => openModeration(back);
    lib.openCustom(() => {
      const queue = pendingReports(net.moderation());
      const actions: Action[] = [];
      const rows: Row[] = queue.map((q) => {
        const index = actions.push({ label: t('Signalement de la ligne de {name}', { name: q.line.name }), key: `report:${q.line.id}`, run: () => openReport(q.line.id, here) }) - 1;
        const reasons = [...new Set(q.reports.map((r) => reasonLabel(r.reason)))].join(', ');
        return {
          text: `${q.line.name} : ${shownText(q.line.text)}`,
          detail: [roomName(q.line.room), time(q.line.at), tn(q.reports.length, '{n} signalement', '{n} signalements'), reasons].join(' · '),
          icon: 'alert',
          tone: 'warning',
          action: index,
          pick: true,
        } satisfies Row;
      });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return {
        heading: t('Signalements'),
        icon: 'alert',
        subheading: tn(queue.length, '{n} message à traiter', '{n} messages à traiter'),
        lead: t('Vos décisions sont signées de votre clé de modérateur et appliquées par toutes les bornes. Le joueur signalé ne sait pas qui l’a signalé.'),
        sections: [{ rows: rows.length ? rows : [{ text: t('Rien à traiter'), icon: 'check', tone: 'ok' }] }],
        actions,
        back,
      };
    });
  }

  /** Un message signalé : le contexte (les lignes autour), qui l'a signalé et pourquoi, les décisions. */
  function openReport(lineId: string, back: () => void): void {
    lib.openCustom(() => {
      const q = pendingReports(net.moderation()).find((x) => x.line.id === lineId);
      if (!q) return { heading: t('Signalements'), icon: 'alert', sections: [{ rows: [{ text: t('Déjà traité'), icon: 'check', tone: 'ok' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
      const l = q.line;
      const all = roomLines(net.rooms(), l.room);
      const at = all.findIndex((x) => x.id === l.id);
      const context = at >= 0 ? all.slice(Math.max(0, at - 3), at + 3) : [l];
      const rows: Row[] = context.map((x) => ({ text: `${x.name} : ${x.text}`, log: { time: time(x.at), nick: x.name, hue: hueOf(x.key, x.name), text: x.text, kind: x.id === l.id ? 'mention' : 'line', ...(x.country ? { flag: flagView(x.country, locale()) } : {}) } }));
      const actions: Action[] = [
        ...decisions(l, back),
        { label: t('Classer sans suite'), detail: t('Rien n’est appliqué ; le signalement sort de la file'), icon: 'check', run: () => { net.handleReports(l.id); back(); } },
        { label: t('Retour'), icon: 'back', run: back },
      ];
      return {
        heading: t('Ligne de {name}', { name: l.name, time: time(l.at) }),
        avatar: avatarView(l.key, l.name, net.avatarFile(l.key)),
        subheading: [roomName(l.room), time(l.at)].join(' · '),
        sections: [
          { kind: 'room', rows },
          { title: t('Signalé par ({n})', { n: q.reports.length }), rows: q.reports.map((r) => ({ text: r.name, detail: [reasonLabel(r.reason), time(r.at)].join(' · '), icon: 'alert' as const })) },
        ],
        actions,
        back,
      };
    });
  }

  // ---------- Règles ----------

  function openRules(after: () => void): void {
    const accepted = net.rooms().rulesAt;
    lib.openCustom(() => ({
      heading: t('Règles des salons'),
      icon: 'rules',
      lead: accepted ? t('Acceptées le {date}.', { date: new Date(accepted).toLocaleDateString(locale()) }) : t('Avant votre premier message, une seule fois. Lire reste possible sans les accepter.'),
      sections: [
        {
          rows: [
            { text: t('Respect'), detail: t('Pas d’insulte, pas de harcèlement, pas de propos haineux.'), icon: 'friends' },
            { text: t('Rien de personnel'), detail: t('Ni adresse, ni téléphone, ni nom complet : les vôtres comme ceux des autres.'), icon: 'lock' },
            { text: t('Pas de publicité'), detail: t('Ni vente, ni lien, ni spam : une ligne toutes les 3 secondes au plus.'), icon: 'close' },
            { text: t('On parle flipper'), detail: t('Tables, scores, parties, réglages de borne : le reste dans la messagerie.'), icon: 'flipper' },
            { text: t('La modération veille'), detail: t('Elle pourra masquer un message, mettre en sourdine ou exclure, sur toutes les bornes.'), icon: 'alert' },
          ],
        },
      ],
      actions: accepted
        ? [{ label: t('Retour'), icon: 'back', run: after }]
        : [
            { label: t('J’accepte : écrire'), detail: t('Une fois pour tous les salons'), icon: 'check', tone: 'ok', run: () => { net.setRooms({ rulesAt: now().toISOString() }); after(); } },
            { label: t('Lire seulement'), detail: t('Le salon reste ouvert, sans écrire'), icon: 'eye', run: () => (current ? openRoom(current.room, current.back) : after()) },
          ],
      back: () => (current ? openRoom(current.room, current.back) : after()),
    }));
  }

  // ---------- La liste des salons ----------

  function openList(back: () => void): void {
    const build = (): Built => {
      const mine = myCountry() ? roomOfCountry(myCountry()!) : undefined;
      const active = activeRooms(net.rooms()).filter((r) => r.room !== WORLD_ROOM && r.room !== mine);
      const entry = (room: RoomId, detail: string): Action => {
        const c = roomCountry(room);
        const n = net.roomPresent(room).length;
        return { label: roomName(room), detail: [tn(n, '{n} présent', '{n} présents'), detail].filter(Boolean).join(' · '), ...(c ? { flag: flagView(c, locale()) } : { icon: 'globe' as const }), key: `room:${room}`, run: () => openRoom(room, () => openList(back)) };
      };
      const actions: Action[] = [
        ...(mine ? [entry(mine, t('le salon de votre pays'))] : []),
        entry(WORLD_ROOM, t('tous les pays, en anglais de préférence')),
        ...active.map((r) => entry(r.room, t('dernière ligne à {time}', { time: time(r.last.at) }))),
        { label: t('Autres pays…'), detail: t('Tous les pays, par leur nom'), icon: 'search', run: () => openCountries(() => openList(back)) },
        { label: t('Retour'), icon: 'back', run: back },
      ];
      return { heading: t('Salons'), icon: 'globe', lead: t('Des salons publics, sans serveur : tout le monde lit ; pour écrire, on accepte une fois les règles. Les lignes vivent sur les bornes, 7 jours au plus.'), sections: [], actions, back };
    };
    lib.openCustom(build);
  }

  function openCountries(back: () => void): void {
    lib.openCustom(() => ({
      heading: t('Salons des pays'),
      icon: 'globe',
      sections: [],
      actions: [...countryCodes(locale()).map((code) => ({ label: countryName(code, locale()), flag: flagView(code, locale()), key: `pays-${code}`, run: () => openRoom(roomOfCountry(code), back) })), { label: t('Retour'), icon: 'back' as const, run: back }],
      back,
    }));
  }

  // ---------- Réglages de la communauté ----------

  function openSettings(back: () => void, at?: number): void {
    const here = (n?: number) => openSettings(back, n);
    const build = (): Built => {
      const s = net.rooms();
      const social = me();
      const actions: Action[] = [
        { label: social.publicPresence !== false ? t('Apparaître en ligne pour tous : oui') : t('Apparaître en ligne pour tous : non'), detail: t('« En ligne » ou « En partie », jamais la table ; vos amis voient toujours votre présence'), icon: 'pulse', run: () => { net.setPublicPresence(social.publicPresence === false); here(0); } },
        { label: s.enabled ? t('Salons : activés') : t('Salons : désactivés'), detail: s.enabled ? t('Lire et écrire dans les salons publics') : t('Les salons restent visibles, grisés ; pour la famille'), icon: 'globe', run: () => { net.setRooms({ enabled: !s.enabled }); here(1); } },
        { label: t('Salon par défaut : {room}', { room: roomName(defaultRoom()) }), detail: t('Celui où l’on entre depuis la Communauté'), icon: 'pin', run: () => { net.setRooms({ defaultRoom: defaultRoom() === WORLD_ROOM && myCountry() ? roomOfCountry(myCountry()!) : WORLD_ROOM }); here(2); } },
        { label: s.filter ? t('Filtre de mots : activé') : t('Filtre de mots : désactivé'), detail: t('Masque les mots grossiers par des étoiles'), icon: 'filter', run: () => { net.setRooms({ filter: !s.filter }); here(3); } },
        { label: s.mentionsInGame ? t('Mentions pendant les parties : carte et son') : t('Mentions pendant les parties : rien'), detail: t('Quand on vous cite dans un salon, en haut du plateau'), icon: 'bell', run: () => { net.setRooms({ mentionsInGame: !s.mentionsInGame }); here(4); } },
        { label: tn(s.ignored.length, '{n} joueur ignoré', '{n} joueurs ignorés'), detail: s.ignored.length ? t('Start : ne plus les ignorer') : t('Leurs lignes disparaissent de vos salons'), icon: 'eye', ...(s.ignored.length ? {} : { tone: 'quiet' as const }), run: () => (s.ignored.length ? openIgnored(() => here(5)) : here(5)) },
        { label: t('Règles des salons'), detail: s.rulesAt ? t('Acceptées le {date}', { date: new Date(s.rulesAt).toLocaleDateString(locale()) }) : t('Pas encore acceptées'), icon: 'rules', run: () => openRules(() => here(6)) },
        { label: t('Retour'), icon: 'back', run: back },
      ];
      return { heading: t('Réglages de la communauté'), icon: 'sliders', subheading: t('Menu système · Amis'), lead: t('En mode invité, la communauté est fermée : le menu système l’est aussi.'), sections: [], actions, back };
    };
    lib.openCustom(build, at);
  }

  function openIgnored(back: () => void): void {
    lib.openCustom(() => {
      const names = new Map<string, string>();
      for (const l of net.rooms().lines) names.set(l.key, l.name);
      const list = net.rooms().ignored;
      return {
        heading: t('Joueurs ignorés'),
        icon: 'eye',
        sections: [],
        actions: [...list.map((key) => ({ label: t('Ne plus ignorer {name}', { name: names.get(key) ?? key.slice(0, 8) }), key: `ignored:${key}`, run: () => { setIgnored(key, false); openIgnored(back); } })), { label: t('Retour'), icon: 'back' as const, run: back }],
        back,
      };
    });
  }

  return {
    openDefault: (back) => openRoom(defaultRoom(), back),
    openRoom,
    openMention: (back) => openRoom(lastMentionRoom ?? defaultRoom(), back),
    door() {
      const room = defaultRoom();
      const s = net.rooms();
      const problem = !me().enabled ? t('Indisponible : partage désactivé (Partage et réseau)') : !s.enabled ? t('Salons désactivés : Réglages de la communauté') : undefined;
      const mentionsN = unreadMentions();
      const last = roomLines(s, room).filter(visible).at(-1);
      const present = net.roomPresent(room).length;
      return {
        label: roomName(room),
        detail: problem ?? [mentionsN ? tn(mentionsN, '{n} mention', '{n} mentions') : undefined, tn(present, '{n} présent', '{n} présents'), last ? `<${last.name}> ${shownText(last.text)}` : t('rien d’écrit ces 7 derniers jours')].filter(Boolean).join(' · '),
        attention: mentionsN > 0,
        quiet: Boolean(problem),
      };
    },
    settingsItem: {
      get detail() {
        return t('Présence, salons, filtre de mots, joueurs ignorés, règles');
      },
      run: () => openSettings(() => lib.openSystem()),
    },
    roomName,
    defaultRoom,
    unreadMentions,
    shown: () => (current && lib.isShowing(buildRoom) ? current.room : undefined),
    moderationItem: {
      get detail() {
        const n = pendingReports(net.moderation()).length;
        return n ? tn(n, '{n} message signalé à traiter', '{n} messages signalés à traiter') : t('Rien à traiter');
      },
      get attention() {
        return pendingReports(net.moderation()).length > 0;
      },
      run: () => openModeration(() => lib.openSystem()),
    },
    openModeration,
    remote() {
      const room = current && lib.isShowing(buildRoom) ? current.room : defaultRoom();
      const self = me().key.publicKey;
      const lines = roomLines(net.rooms(), room)
        .filter(visible)
        .slice(-60)
        .map((l) => ({ time: time(l.at), nick: l.name, hue: hueOf(l.key, l.name), text: shownText(l.text), kind: (l.key === self ? 'own' : l.me ? 'me' : mentions(l.text, me().name) ? 'mention' : 'line') as 'own' | 'me' | 'mention' | 'line' }));
      const problem = writeProblem(room) ?? (net.rooms().rulesAt ? undefined : t('Acceptez d’abord les règles des salons, à la borne : Écrire dans le salon'));
      const table = host.currentTable();
      return {
        room,
        name: roomName(room),
        present: net.roomPresent(room).length,
        lines,
        phrases: [t('Qui veut faire une partie ?'), ...(table ? [t('Quelqu’un sur {table} ?', { table: table.title })] : []), t('Bien joué !'), t('J’arrive dans 5 minutes'), t('Bonne soirée !')],
        ...(problem ? { blocked: problem } : {}),
      };
    },
    write: (room, text) => {
      const why = write(room, text);
      if (lib.isShowing(buildRoom)) lib.openCustom(buildRoom, lastLineAt());
      return why;
    },
  };
}
