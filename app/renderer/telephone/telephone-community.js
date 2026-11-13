// Communauté de la page du téléphone (telephone.js) : les messages, les amis et les scores sous un
// même onglet, et le fil d'un ami en plein écran. La borne (app/src/chat-menu.ts, remoteCommunity)
// choisit, met en forme et traduit tout ; la page ne fait que dessiner :
// - Messages : les conversations dans l'ordre de la borne (la plus récente d'abord, puis les amis
//   sans message), le dernier message, son moment, les non-lus ;
// - Joueurs : les mêmes amis, en ligne d'abord, avec leur présence, puis les autres joueurs en
//   ligne (présence publique, jamais leur table), qu'on voit sans pouvoir leur écrire ;
// - Scores : la vue des classements (telephone-ranks.js).
// Un toucher ouvre le fil (« chat-open » : la clé publique de l'ami, rien d'autre) : la borne
// l'envoie tant qu'il est ouvert et le marque lu. Les messages de l'ami à gauche, les miens à droite
// en vert ; jours et évènements (records, badges) centrés ; réactions et phrases d'un appui au-dessus
// du champ. Écrire passe par la borne (« chat-send », « chat-react »), qui vérifie l'ami, le texte,
// le mode invité et ses réglages.
//
// Chargé avant telephone.js : ses fonctions servent quand la page vit (send, setView, entryRow,
// showEmpty, syncLayout et view sont ceux de telephone.js).
'use strict';

/** Ce que la borne a envoyé (« community ») ; le fil ouvert au téléphone (clé d'un ami). */
const community = {
  data: undefined,
  open: undefined,
  /** Le fil montré a déjà défilé jusqu'en bas (un message arrivé ne fait pas sauter la lecture). */
  shownKey: undefined,
};

for (const [id, label] of [
  ['seg-messages', () => t('Messages')],
  ['seg-friends', () => t('Joueurs')],
  ['seg-room', () => t('Salon')],
  ['seg-ranks', () => t('Scores')],
]) {
  const b = document.getElementById(id);
  const text = document.createElement('span');
  text.className = 'seg-label';
  text.textContent = label();
  const count = document.createElement('span');
  count.className = 'seg-count';
  count.hidden = true;
  b.replaceChildren(text, count);
  b.addEventListener('click', () => setView(b.dataset.view));
}
document.getElementById('community-seg').setAttribute('aria-label', t('Communauté'));
document.getElementById('thread-send').textContent = t('Envoyer');

/** La pastille d'un ami et sa marque de présence (en ligne, en partie, hors ligne), comme dans les classements. */
function communityFace(row, className) {
  const face = document.createElement('span');
  face.className = `conv-face presence-${row.state === 'playing' ? 'playing' : row.state === 'online' ? 'online' : 'offline'}${className ? ` ${className}` : ''}`;
  face.append(avatarNode(row.avatar, 'conv-avatar'));
  if (row.state !== 'gone') {
    const dot = document.createElement('span');
    dot.className = 'presence-dot';
    face.append(dot);
  }
  return face;
}

/** Une conversation (ou un ami) : pastille, nom, dernier message ou présence, moment et non-lus. */
function communityRow(row, detail) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `entry conv${row.unread ? ' unread' : ''}${row.state === 'gone' ? ' quiet' : ''}`;
  const text = document.createElement('span');
  text.className = 'entry-text';
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = row.name;
  const line = document.createElement('span');
  line.className = 'entry-detail';
  line.textContent = detail;
  text.append(label, line);
  if (row.note) {
    const note = document.createElement('span');
    note.className = 'entry-detail conv-note';
    note.textContent = row.note;
    text.append(note);
  }
  b.append(communityFace(row), text);
  if (row.when || row.unread) {
    const aside = document.createElement('span');
    aside.className = 'conv-aside';
    if (row.when) {
      const when = document.createElement('span');
      when.className = 'conv-when';
      when.textContent = row.when;
      aside.append(when);
    }
    if (row.unread) {
      const n = document.createElement('span');
      n.className = 'conv-unread';
      n.textContent = String(row.unread);
      n.setAttribute('aria-label', tn(row.unread, '{n} non lu', '{n} non lus'));
      aside.append(n);
    }
    b.append(aside);
  }
  b.setAttribute('aria-label', [row.name, row.presence, detail, row.unread ? tn(row.unread, '{n} non lu', '{n} non lus') : ''].filter(Boolean).join(', '));
  b.addEventListener('click', () => {
    if (state !== 'paired') return;
    if (navigator.vibrate) navigator.vibrate(12);
    communityOpenThread(row.key);
  });
  li.append(b);
  return li;
}

/** Un joueur en ligne qui n'est pas un ami : sa pastille, son nom, « En ligne · France » ; pas de fil à ouvrir. */
function playerRow(row) {
  const li = document.createElement('li');
  const b = document.createElement('div');
  b.className = 'entry conv player';
  const text = document.createElement('span');
  text.className = 'entry-text';
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = row.name;
  const line = document.createElement('span');
  line.className = 'entry-detail';
  line.textContent = row.presence;
  text.append(label, line);
  b.append(communityFace(row), text);
  b.setAttribute('aria-label', [row.name, row.presence].join(', '));
  li.append(b);
  return li;
}

/**
 * Le salon par pays (la borne choisit : celui ouvert à la borne, sinon celui par défaut) : ses dernières
 * lignes à l'ancienne (l'heure, <pseudo> à la teinte de sa clé, le texte), des phrases d'un appui et un
 * champ. Écrire passe par la borne (« room-send »), qui vérifie les règles, les limites et le texte.
 */
function renderRoom() {
  const r = community.data?.room;
  const list = document.getElementById('room-lines');
  const status = document.getElementById('room-status');
  const chips = document.getElementById('room-chips');
  const field = document.getElementById('room-field');
  document.getElementById('room-send').textContent = t('Envoyer');
  document.getElementById('room-head').textContent = r ? r.name : t('Salon indisponible');
  if (!r) {
    list.replaceChildren();
    status.hidden = false;
    status.textContent = community.data?.closed ?? t('Partage désactivé : Partage et réseau');
    chips.replaceChildren();
    field.disabled = true;
    return;
  }
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.replaceChildren(
    ...r.lines.map((l) => {
      const li = document.createElement('li');
      li.className = `room-line kind-${l.kind}`;
      const time = document.createElement('time');
      time.textContent = l.time;
      const text = document.createElement('span');
      text.className = 'room-text';
      if (l.nick) {
        const nick = document.createElement('span');
        nick.className = 'room-nick';
        nick.textContent = l.nick;
        if (typeof l.hue === 'number') nick.style.setProperty('--h', String(l.hue));
        text.append(nick);
      }
      const say = document.createElement('span');
      say.className = l.kind === 'me' ? 'room-act' : '';
      say.textContent = l.text;
      text.append(say);
      li.append(time, text);
      return li;
    }),
  );
  if (atBottom || community.roomShown !== r.name) list.scrollTop = list.scrollHeight;
  community.roomShown = r.name;
  status.hidden = !r.blocked;
  status.textContent = r.blocked ?? '';
  field.disabled = Boolean(r.blocked);
  const chip = (label, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label;
    b.disabled = Boolean(r.blocked);
    b.addEventListener('click', run);
    return b;
  };
  chips.replaceChildren(...r.phrases.map((p) => chip(p, () => send({ t: 'room-send', text: p }))));
}

document.getElementById('room-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const field = document.getElementById('room-field');
  const text = field.value.trim();
  if (!text || !community.data?.room || community.data.room.blocked) return;
  send({ t: 'room-send', text });
  field.value = '';
});

/** Messages ou Joueurs : la liste, ou pourquoi elle est vide (chargement, messagerie fermée, aucun ami). */
function renderCommunity() {
  const list = document.getElementById('conv-list');
  const c = community.data;
  const shown = document.body.dataset.view;
  // La pastille rouge de l'onglet, et le nombre de non-lus sur « Messages ».
  const unread = c?.unread ?? 0;
  document.querySelector('#tab-community .view-dot').hidden = !unread;
  const count = document.querySelector('#seg-messages .seg-count');
  count.hidden = !unread;
  count.textContent = String(unread);
  if (!c) {
    list.replaceChildren();
    showEmpty('conv', 'refresh', t('Chargement de la messagerie…'), t('La borne envoie vos conversations.'));
    return;
  }
  if (c.closed) {
    list.replaceChildren();
    showEmpty('conv', 'lock', t('Messagerie indisponible'), c.closed);
    return;
  }
  const friends = shown === 'friends';
  const order = { online: 0, playing: 0, offline: 1, gone: 2 };
  const rows = friends ? c.rows.filter((r) => r.state !== 'gone').sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name)) : c.rows;
  list.replaceChildren(...rows.map((r) => communityRow(r, friends ? r.presence : r.last)));
  // Joueurs : les autres joueurs en ligne, après mes amis ; on ne leur écrit pas (amis seulement).
  const others = friends ? (c.players ?? []) : [];
  if (others.length) {
    const head = document.createElement('li');
    head.className = 'conv-section';
    head.textContent = t('Autres joueurs en ligne ({n})', { n: others.length });
    list.append(head, ...others.map((r) => playerRow(r)));
  }
  if (!rows.length && !others.length) showEmpty('conv', 'friend-add', friends ? t('Personne en ligne pour l’instant') : t('Pas encore d’ami à qui écrire'), t('À la borne : Amis > Trouver un joueur.'));
  else showEmpty('conv');
}

/** Le fil ouvert : jours, évènements de l'ami, bulles des deux côtés ; la ligne d'état ; réponses et champ. */
function renderThread() {
  const th = community.data?.thread;
  const lines = document.getElementById('thread-lines');
  const field = document.getElementById('thread-field');
  const form = document.getElementById('thread-form');
  const status = document.getElementById('thread-status');
  const chips = document.getElementById('thread-chips');
  if (!th || th.key !== community.open) {
    lines.replaceChildren();
    status.textContent = community.data?.closed ?? t('Ouverture du fil…');
    status.className = 'thread-status';
    chips.replaceChildren();
    field.disabled = true;
    form.classList.add('off');
    return;
  }
  const atBottom = lines.scrollHeight - lines.scrollTop - lines.clientHeight < 40;
  lines.replaceChildren(
    ...(th.items.length ? th.items : [{ kind: 'day', text: t('Pas encore de message : écrivez le premier') }]).map((it) => {
      const li = document.createElement('li');
      if (it.kind === 'day') {
        li.className = 'th-day';
        li.textContent = it.text;
        return li;
      }
      if (it.kind === 'event') {
        li.className = 'th-event';
        li.append(cyberIcon('trophy'));
        const text = document.createElement('span');
        text.textContent = `${it.text} · ${it.time}`;
        li.append(text);
        return li;
      }
      li.className = `th-line ${it.out ? 'out' : 'in'} ${it.bubble}`;
      const bubble = document.createElement('div');
      bubble.className = 'th-bubble';
      bubble.textContent = it.text;
      const meta = document.createElement('div');
      meta.className = 'th-meta';
      meta.textContent = it.meta;
      li.append(bubble, meta);
      if (it.chips?.length) {
        const r = document.createElement('div');
        r.className = 'th-reactions';
        r.textContent = it.chips.join(' · ');
        li.append(r);
      }
      return li;
    }),
  );
  // Ouvert : en bas, sur le dernier message ; ensuite, seulement si on y était déjà.
  if (community.shownKey !== th.key || atBottom) lines.scrollTop = lines.scrollHeight;
  community.shownKey = th.key;
  status.textContent = th.blocked ?? [th.status.text, th.status.detail].filter(Boolean).join(' · ');
  status.className = `thread-status ${th.blocked ? 'warning' : th.status.tone}`;
  field.disabled = Boolean(th.blocked);
  form.classList.toggle('off', Boolean(th.blocked));
  field.placeholder = th.blocked ? t('Indisponible') : t('Écrire à {name}…', { name: th.name });
  // Réactions au dernier message reçu, puis les phrases toutes prêtes ; rien quand on ne peut pas écrire.
  const lastIn = [...th.items].reverse().find((it) => it.kind === 'line' && !it.out);
  const chip = (label, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thread-chip';
    b.textContent = label;
    b.addEventListener('click', run);
    return b;
  };
  chips.replaceChildren(
    ...(th.blocked
      ? []
      : [
          ...(lastIn ? th.reactions.map((r) => chip(r.label, () => send({ t: 'chat-react', key: th.key, target: lastIn.id, kind: r.id }))) : []),
          ...th.phrases.map((p) => chip(p, () => send({ t: 'chat-send', key: th.key, text: p }))),
        ]),
  );
}

/** Un message de la borne (« community ») : la liste, le fil ouvert, la pastille de l'onglet. */
function communityMessage(m) {
  community.data = {
    closed: typeof m.closed === 'string' ? m.closed : undefined,
    unread: Number.isInteger(m.unread) ? m.unread : 0,
    rows: Array.isArray(m.rows) ? m.rows : [],
    thread: m.thread && typeof m.thread === 'object' && typeof m.thread.key === 'string' && Array.isArray(m.thread.items) ? m.thread : undefined,
    // Les autres joueurs en ligne (Joueurs) et le salon par pays (Salon) : gardés, sinon ces vues restent vides.
    players: Array.isArray(m.players) ? m.players : [],
    room: m.room && typeof m.room === 'object' && typeof m.room.name === 'string' && Array.isArray(m.room.lines) ? m.room : undefined,
  };
  renderCommunity();
  if (document.body.dataset.view === 'thread') renderThread();
  if (document.body.dataset.view === 'room') renderRoom();
  renderTop();
}

/** Ouvre le fil d'un ami : la borne l'envoie (et le marque lu) tant qu'il est ouvert. */
function communityOpenThread(key) {
  community.open = key;
  community.shownKey = undefined;
  send({ t: 'chat-open', key });
  setView('thread');
  renderThread();
}

/** Le fil est quitté (retour, autre onglet) : la borne cesse de l'envoyer. */
function communityLeaveThread() {
  if (!community.open) return;
  community.open = undefined;
  send({ t: 'chat-open' });
}

/** Ce que dit la barre du haut dans la Communauté : son titre et les non-lus, ou l'ami du fil. */
function communityTop(shown) {
  if (shown === 'thread') {
    const th = community.data?.thread;
    const row = th ?? community.data?.rows.find((r) => r.key === community.open);
    return { title: row?.name ?? '', detail: row?.presence ?? '', face: row ? communityFace(row, 'top-face') : undefined };
  }
  if (shown === 'room' && community.data?.room) return { title: community.data.room.name, detail: tn(community.data.room.present, '{n} présent', '{n} présents') };
  if (!['messages', 'friends', 'room', 'ranks'].includes(shown)) return undefined;
  const unread = community.data?.unread ?? 0;
  return { title: t('Communauté'), detail: unread ? tn(unread, '{n} message non lu', '{n} messages non lus') : '' };
}

document.getElementById('top-back').addEventListener('click', () => setView(document.body.dataset.view === 'player' ? 'jukebox' : communityView));
document.getElementById('thread-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const field = document.getElementById('thread-field');
  const text = field.value.trim();
  const th = community.data?.thread;
  if (!th || th.blocked || !text) return;
  send({ t: 'chat-send', key: th.key, text });
  field.value = '';
});
