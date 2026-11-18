// Communauté de la page du téléphone (telephone.js) : les messages, les amis et les scores sous un
// même onglet, et le fil d'un ami en plein écran. La borne (app/src/chat-menu.ts, remoteCommunity)
// choisit, met en forme et traduit tout ; la page ne fait que dessiner :
// - Messages : mes groupes privés en tête (leur clé est « g: » et leur identifiant : ils s'ouvrent dans
//   le même fil, « chat-send » et « chat-react » allant au groupe), puis les conversations dans l'ordre
//   de la borne (la plus récente d'abord, puis les amis sans message), le dernier message, son moment,
//   les non-lus ;
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
  /** Le profil ouvert au téléphone (clé d'un joueur), et la vue d'où on l'a ouvert. */
  profile: undefined,
  profileFrom: 'friends',
  /** Le filtre de « Joueurs » (Tous, Mon pays, À proximité, Mêmes tables), gardé par ce téléphone. */
  filter: 'all',
  /** Le salon choisi au téléphone (« monde », « pays-FR »), ou celui de la borne. */
  room: undefined,
  /** Le fil montré a déjà défilé jusqu'en bas (un message arrivé ne fait pas sauter la lecture). */
  shownKey: undefined,
};

for (const [id, label] of [
  ['seg-messages', () => t('Messages')],
  ['seg-friends', () => t('Joueurs')],
  ['seg-room', () => t('Salons')],
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

// ---------- En train d'écrire (typing.ts) ----------

/** Durée d'un tour des trois points (telephone.css, phone-typing-dot). */
const PHONE_TYPING_CYCLE_MS = 1200;

/**
 * Qui écrit (les pseudos donnés par la borne), en bas d'un fil ou d'un salon : les pseudos et trois
 * points qui s'allument l'un après l'autre ; undefined si personne. La liste est redessinée à chaque
 * envoi de la borne : les points partent avec un retard tiré de l'horloge, pour ne pas sauter.
 */
function typingItem(names, className) {
  if (!Array.isArray(names) || !names.length) return undefined;
  const li = document.createElement('li');
  li.className = `phone-typing${className ? ` ${className}` : ''}`;
  const shown = names.slice(0, 3).join(', ');
  const more = names.length - 3;
  li.setAttribute('role', 'status');
  li.setAttribute('aria-label', more > 0 ? t('{names} et {n} autres écrivent…', { names: shown, n: more }) : tn(names.length, '{names} écrit…', '{names} écrivent…', { names: shown }));
  const who = document.createElement('span');
  who.className = 'phone-typing-names';
  who.textContent = more > 0 ? `${shown} +${more}` : shown;
  const dots = document.createElement('span');
  dots.className = 'phone-typing-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.style.setProperty('--typing-phase', `${-(Date.now() % PHONE_TYPING_CYCLE_MS)}ms`);
  for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
  li.append(who, dots);
  return li;
}

/**
 * Le signal « j'écris » d'un champ du téléphone, vers la cible que rend `target` (`{ key }` : un ami ou
 * un groupe ; `{}` : le salon montré ; null : rien) : « oui » au plus une fois par seconde tant qu'il
 * reste du texte (la borne n'en relaie qu'un toutes les 3 s), « non » quand le champ se vide. Rend la
 * fonction qui l'arrête (message envoyé, fil quitté).
 */
function typingWatch(field, target) {
  let on = false;
  let last = 0;
  let to = null;
  const tell = (value) => {
    if (!to) return;
    send({ t: 'typing', ...(to.key ? { key: to.key } : {}), on: value });
  };
  const stop = () => {
    if (on) tell(false);
    on = false;
    to = null;
  };
  field.addEventListener('input', () => {
    if (state !== 'paired') return;
    const now = target();
    // La cible a changé (autre fil) : la précédente apprend qu'on n'y écrit plus.
    if (on && (!now || now.key !== to?.key)) stop();
    if (!now) return;
    if (field.value.trim()) {
      if (on && Date.now() - last < 1000) return;
      to = now;
      on = true;
      last = Date.now();
      tell(true);
    } else stop();
  });
  return stop;
}
const stopThreadTyping = typingWatch(document.getElementById('thread-field'), () => (community.data?.thread && community.data.thread.key === community.open && !community.data.thread.blocked ? { key: community.data.thread.key } : null));
const stopRoomTyping = typingWatch(document.getElementById('room-field'), () => (community.data?.room && !community.data.room.blocked ? {} : null));

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

// ---------- Joueurs (community-menu.ts, remotePeople) ----------

const PEOPLE_FILTER_STORE = 'cyberpinball.joueurs';
try {
  community.filter = localStorage.getItem(PEOPLE_FILTER_STORE) || 'all';
} catch {
  // Stockage refusé (navigation privée) : Tous.
}

/** Le drapeau d'un joueur (servi par la borne), devant son nom. */
function personFlag(src) {
  if (!src) return undefined;
  const img = document.createElement('img');
  img.className = 'person-flag';
  img.alt = '';
  img.draggable = false;
  img.src = src;
  img.addEventListener('error', () => img.remove());
  return img;
}

/** Le nom d'un joueur, son drapeau devant. */
function personName(name, flag) {
  const label = document.createElement('span');
  label.className = 'entry-label';
  const img = personFlag(flag);
  if (img) label.append(img);
  label.append(name);
  return label;
}

/** Un joueur de « Joueurs » : pastille et présence, drapeau et nom, ce qu'il fait ; un toucher ouvre son profil. */
function personRow(p) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'entry conv person';
  const text = document.createElement('span');
  text.className = 'entry-text';
  const line = document.createElement('span');
  line.className = 'entry-detail';
  line.textContent = p.detail;
  text.append(personName(p.name, p.flag), line);
  b.append(communityFace(p), text, cyberIcon('chevron-right', 'entry-go'));
  b.setAttribute('aria-label', [p.name, p.detail].filter(Boolean).join(', '));
  b.addEventListener('click', () => {
    if (state !== 'paired') return;
    if (navigator.vibrate) navigator.vibrate(12);
    communityOpenProfile(p.key);
  });
  li.append(b);
  return li;
}

/** Un bouton d'une carte ou d'un profil : icône et libellé, 48 px de haut. */
function peopleButton(label, icon, cls, run) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `people-btn${cls ? ` ${cls}` : ''}`;
  if (icon) b.append(cyberIcon(icon));
  const text = document.createElement('span');
  text.className = 'people-btn-text';
  text.textContent = label;
  b.append(text);
  b.addEventListener('click', () => {
    if (state !== 'paired' || b.disabled) return;
    if (navigator.vibrate) navigator.vibrate(12);
    run(b);
  });
  return b;
}

/** Une demande d'ami reçue : qui, depuis quand ; Accepter, Refuser, ou son profil. */
function requestCard(r) {
  const li = document.createElement('li');
  const card = document.createElement('div');
  card.className = 'people-card attention';
  const head = document.createElement('div');
  head.className = 'people-card-head';
  const text = document.createElement('span');
  text.className = 'entry-text';
  const line = document.createElement('span');
  line.className = 'entry-detail';
  line.textContent = r.detail;
  text.append(personName(r.name, r.flag), line);
  head.append(communityFace({ ...r, state: 'gone' }), text);
  const acts = document.createElement('div');
  acts.className = 'people-actions';
  acts.append(
    peopleButton(t('Accepter'), 'check', 'primary', () => send({ t: 'friend-answer', key: r.key, yes: true })),
    peopleButton(t('Refuser'), undefined, '', () => send({ t: 'friend-answer', key: r.key, yes: false })),
    peopleButton(t('Profil'), undefined, '', () => communityOpenProfile(r.key)),
  );
  card.append(head, acts);
  li.append(card);
  return li;
}

/** Un titre de section de la liste (« Demande d'ami », « Amis en ligne (2) »). */
function sectionTitle(text) {
  const li = document.createElement('li');
  li.className = 'conv-section';
  li.textContent = text;
  return li;
}

/**
 * Joueurs : les demandes reçues, les filtres de la borne en badges, puis les joueurs du filtre choisi,
 * dans les groupes de la borne ; tout joueur s'ouvre (son profil).
 */
function renderPeople(list, c) {
  const p = c.people;
  if (!p) {
    list.replaceChildren();
    showEmpty('conv', 'friends', t('Joueurs indisponibles'), t('Mettez la borne à jour pour voir les joueurs ici.'));
    return;
  }
  const filters = p.filters ?? [];
  if (!filters.some((f) => f.id === community.filter && !f.disabled)) community.filter = 'all';
  const rows = [];
  if (p.requests.length) rows.push(sectionTitle(tn(p.requests.length, 'Demande d’ami', 'Demandes d’ami')), ...p.requests.map(requestCard));
  if (p.note) rows.push(sectionTitle(p.note));
  const strip = document.createElement('li');
  strip.className = 'entry-chips people-filters';
  strip.append(
    chipStrip(
      filters.map((f) => ({
        label: f.count ? `${f.label} · ${f.count}` : f.label,
        current: f.id === community.filter,
        disabled: Boolean(f.disabled),
        run: () => {
          community.filter = f.id;
          try {
            localStorage.setItem(PEOPLE_FILTER_STORE, f.id);
          } catch {
            // Stockage refusé : le choix vaut pour cette page.
          }
          renderCommunity();
        },
      })),
      { lines: 1 },
    ),
  );
  rows.push(strip);
  const groups = p.groups[community.filter] ?? [];
  for (const g of groups) rows.push(sectionTitle(g.title), ...g.rows.map(personRow));
  list.replaceChildren(...rows);
  if (!groups.length && !p.requests.length) showEmpty('conv', 'friend-add', t('Personne ici pour l’instant'), community.filter === 'all' ? t('Les joueurs du réseau des bornes s’affichent ici dès qu’ils sont vus.') : t('Essayez le filtre « Tous ».'));
  else showEmpty('conv');
}

// ---------- Profil d'un joueur (phone-community.ts) ----------

/** Un badge officiel (niveau.js, CyberLevels.badgeSvg) et son nom, comme à la borne. */
function profileMedal(m) {
  const box = document.createElement('div');
  box.className = 'profile-medal';
  const art = document.createElement('span');
  art.className = 'profile-medal-art';
  if (window.CyberLevels) art.innerHTML = CyberLevels.badgeSvg(m.icon, m.rarity, true);
  else art.append(cyberIcon(m.icon));
  const label = document.createElement('span');
  label.className = 'profile-medal-label';
  label.textContent = m.label;
  box.append(art, label);
  return box;
}

/** Une ligne simple du profil (présence, faits) : son icône, son texte et son détail. */
function profileLine(r, cls) {
  const row = document.createElement('div');
  row.className = `profile-line${r.tone ? ` tone-${r.tone}` : ''}${cls ? ` ${cls}` : ''}`;
  if (r.icon) row.append(cyberIcon(r.icon));
  const text = document.createElement('span');
  text.className = 'profile-line-text';
  const main = document.createElement('span');
  main.textContent = r.text;
  text.append(main);
  if (r.detail) {
    const small = document.createElement('small');
    small.textContent = r.detail;
    text.append(small);
  }
  row.append(text);
  return row;
}

/** Ce qu'une action fait au toucher : sur place, à la borne, le fil au téléphone, ou après une confirmation. */
function profileRun(pr, a) {
  if (a.quiet) return;
  if (a.where === 'thread') return communityOpenThread(pr.key);
  if (a.where === 'confirm') {
    openSheet(a.label, [{ label: a.label, danger: true, run: () => send({ t: 'profile-act', key: pr.key, a: a.act }) }], { text: a.detail });
    return;
  }
  send({ t: 'profile-act', key: pr.key, a: a.act });
  // Un écran s'ouvre à la borne (inviter, sa bibliothèque) : la vue Écran le montre.
  if (a.where === 'borne') setView('list');
}

/**
 * Le profil d'un joueur, plein écran : sa pastille, son drapeau et son nom, son niveau ; les actions
 * principales (la première en vert), les autres sous « Plus » ; ses badges officiels, son activité
 * avec les « J'aime », ses groupes publics, et ce qui reste réservé à ses amis.
 */
function renderProfile() {
  const box = document.getElementById('profile-body');
  const pr = community.data?.profile;
  if (!pr || pr.key !== community.profile) {
    box.replaceChildren();
    const wait = document.createElement('p');
    wait.className = 'profile-wait';
    wait.textContent = community.data?.closed ?? t('Ouverture du profil…');
    box.append(wait);
    return;
  }
  const keepScroll = box.dataset.key === pr.key ? box.scrollTop : 0;
  box.dataset.key = pr.key;
  const parts = [];
  // En-tête : la grande pastille (anneau du palier), le drapeau et le nom, le niveau et la relation.
  const hero = document.createElement('div');
  hero.className = 'profile-hero';
  const big = avatarNode(pr.avatar, 'profile-avatar');
  const who = document.createElement('div');
  who.className = 'profile-who';
  const name = document.createElement('div');
  name.className = 'profile-name';
  const flag = personFlag(pr.flag);
  if (flag) name.append(flag);
  name.append(pr.name);
  const sub = document.createElement('div');
  sub.className = 'profile-sub';
  sub.textContent = pr.subheading;
  who.append(name, sub);
  hero.append(big, who);
  parts.push(hero);
  if (pr.flash) parts.push(profileLine({ ...pr.flash, icon: pr.flash.tone === 'warning' ? 'alert' : 'check' }, 'profile-flash'));
  // Les actions : jusqu'à quatre boutons, le principal en vert ; les autres (masquer, bloquer…) sous « Plus ».
  const main = [];
  const more = [];
  for (const a of pr.actions) (main.length < 3 && a.where !== 'confirm' && a.act !== 'activity' ? main : more).push(a);
  const acts = document.createElement('div');
  acts.className = 'profile-actions';
  for (const a of main) {
    const b = peopleButton(a.label, a.icon, a.primary ? 'primary' : a.quiet ? 'off' : '', () => profileRun(pr, a));
    if (a.quiet) b.setAttribute('aria-disabled', 'true');
    acts.append(b);
  }
  if (more.length) acts.append(peopleButton(t('Plus'), 'list', '', () => openSheet(pr.name, more.map((a) => ({ label: a.label, danger: a.where === 'confirm', run: () => profileRun(pr, a) })))));
  parts.push(acts);
  // La raison d'une action grisée (écrire à un non-ami), sous les boutons.
  for (const a of main) if (a.quiet && a.detail) parts.push(profileLine({ text: a.detail, tone: 'quiet' }, 'profile-reason'));
  for (const r of pr.rows) parts.push(profileLine(r));
  if (pr.level) {
    const lv = profileLine({ text: pr.level.text, detail: pr.level.detail, icon: 'gauge' }, 'profile-level');
    if (typeof pr.level.progress === 'number') {
      const bar = document.createElement('span');
      bar.className = 'profile-bar';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, pr.level.progress)) * 100)}%`;
      bar.append(fill);
      lv.querySelector('.profile-line-text').append(bar);
    }
    parts.push(lv);
  }
  if (pr.badges) {
    parts.push(profileSection(t('Badges'), pr.badges.detail ?? pr.badges.text));
    if (pr.badges.medals.length) {
      const band = document.createElement('div');
      band.className = 'profile-medals';
      band.append(...pr.badges.medals.map(profileMedal));
      parts.push(band);
    } else parts.push(profileLine({ text: pr.badges.text, tone: 'quiet' }));
  }
  if (pr.activity) {
    parts.push(profileSection(pr.activity.title));
    const panel = document.createElement('div');
    panel.className = 'profile-panel';
    for (const r of pr.activity.rows) {
      const row = profileLine(r, 'profile-act');
      if (r.act) {
        const like = document.createElement('button');
        like.type = 'button';
        like.className = `profile-like${r.liked ? ' on' : ''}`;
        like.append(cyberIcon(r.liked ? 'star-filled' : 'star'), String(r.likes ?? 0));
        like.setAttribute('aria-pressed', String(Boolean(r.liked)));
        like.setAttribute('aria-label', r.liked ? t('Ne plus aimer') : t('J’aime'));
        like.addEventListener('click', () => {
          if (state !== 'paired') return;
          if (navigator.vibrate) navigator.vibrate(12);
          send({ t: 'profile-act', key: pr.key, a: r.act });
        });
        row.append(like);
      }
      panel.append(row);
    }
    parts.push(panel);
  }
  if (pr.groups?.length) {
    parts.push(profileSection(t('Groupes publics')));
    const panel = document.createElement('div');
    panel.className = 'profile-panel';
    for (const g of pr.groups) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'profile-line profile-group';
      b.append(cyberIcon('group'));
      const text = document.createElement('span');
      text.className = 'profile-line-text';
      const main = document.createElement('span');
      main.textContent = g.text;
      text.append(main);
      if (g.detail) {
        const small = document.createElement('small');
        small.textContent = g.detail;
        text.append(small);
      }
      b.append(text, cyberIcon('chevron-right', 'entry-go'));
      b.addEventListener('click', () => {
        if (state !== 'paired') return;
        send({ t: 'profile-act', key: pr.key, a: g.act });
        setView('list');
      });
      panel.append(b);
    }
    parts.push(panel);
  }
  for (const n of pr.notes) parts.push(profileLine({ text: n, tone: 'quiet', icon: 'lock' }, 'profile-note'));
  box.replaceChildren(...parts);
  box.scrollTop = keepScroll;
}

/** Un intertitre du profil (« Badges », « Activité récente »), et son chiffre à droite. */
function profileSection(title, aside) {
  const h = document.createElement('div');
  h.className = 'profile-section';
  const span = document.createElement('span');
  span.textContent = title;
  h.append(span);
  if (aside) {
    const small = document.createElement('small');
    small.textContent = aside;
    h.append(small);
  }
  return h;
}

/** Ouvre le profil d'un joueur : la borne l'envoie tant qu'il est ouvert. */
function communityOpenProfile(key) {
  const from = document.body.dataset.view;
  if (from !== 'profile') community.profileFrom = COMMUNITY_VIEWS.includes(from) || from === 'thread' ? from : 'friends';
  community.profile = key;
  send({ t: 'profile-open', key });
  setView('profile');
  renderProfile();
}

/** Le profil est quitté : la borne cesse de l'envoyer. */
function communityLeaveProfile() {
  if (!community.profile) return;
  community.profile = undefined;
  send({ t: 'profile-open' });
}

/** Le nom d'un pays dans la langue de la page (Intl), sinon son code. */
function countryLabel(code) {
  try {
    return new Intl.DisplayNames([window.cyberI18n?.locale ?? 'fr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Choisir le salon montré au téléphone (la borne l'envoie aussitôt) ; sans salon : celui de la borne. */
function communityPickRoom(room) {
  community.room = room;
  community.roomShown = undefined;
  send({ t: 'room-open', ...(room ? { room } : {}) });
}

/** « Autres pays… » : tous les pays, par leur nom ; un toucher ouvre son salon. */
function openCountries(r) {
  const list = (r.countries ?? []).map((code) => ({ code, name: countryLabel(code) })).sort((a, b) => a.name.localeCompare(b.name));
  openSheet(t('Salons des pays'), list.map((c) => ({ label: c.name, run: () => communityPickRoom(`pays-${c.code}`) })));
}

/**
 * Les options d'une ligne, au toucher : réagir (la mienne choisie, la retoucher la retire), répondre
 * (le champ commence par @pseudo), voir son profil, demande d'ami, ignorer, signaler (avec la raison),
 * bloquer ; sur ma ligne, la supprimer. Bloquer et supprimer se confirment ; la borne vérifie tout.
 */
function openLineOptions(r, l) {
  if (state !== 'paired' || !l.id || l.kind === 'masked') return;
  const own = l.kind === 'own';
  const act = (a, extra) => send({ t: 'room-act', room: r.room, line: l.id, a, ...(extra ?? {}) });
  const confirm = (title, text, label, a) => openSheet(title, [{ label, danger: true, run: () => act(a) }], { text });
  const reactions = r.blocked
    ? []
    : [
        chipStrip(
          (r.reactions ?? []).map((x) => ({
            label: x.label,
            current: x.id === l.mine,
            run: () => {
              closeSheet();
              act(x.id === l.mine ? 'unreact' : `react:${x.id}`);
            },
          })),
          { lines: 1, className: 'reactions' },
        ),
      ];
  const items = own
    ? [{ label: t('Supprimer ma ligne…'), danger: true, run: () => confirm(t('Supprimer votre ligne ?'), l.text, t('Supprimer'), 'retract') }]
    : [
        ...(r.blocked
          ? []
          : [
              {
                label: t('Répondre à @{name}', { name: l.nick }),
                run: () => {
                  const field = document.getElementById('room-field');
                  field.value = `@${l.nick} `;
                  field.focus();
                },
              },
            ]),
        { label: t('Voir son profil'), run: () => communityOpenProfile(l.key) },
        ...(l.friend ? [] : [{ label: t('Envoyer une demande d’ami'), run: () => act('request') }]),
        { label: t('Ignorer {name} dans les salons', { name: l.nick }), run: () => act('ignore') },
        { label: t('Signaler ce message'), run: () => openSheet(t('Signaler ce message'), (r.reasons ?? []).map((x) => ({ label: x.label, run: () => act('report', { reason: x.id }) })), { text: l.text }) },
        { label: t('Bloquer {name}', { name: l.nick }), danger: true, run: () => confirm(t('Bloquer {name} ?', { name: l.nick }), t('Plus de demande d’ami, plus de connexion avec sa borne, ses lignes disparaissent de vos salons. Débloquer : Partage et réseau.'), t('Bloquer'), 'block') },
      ];
  openSheet(t('Ligne de {name} à {time}', { name: l.nick, time: l.time }), items, { text: l.text, top: reactions });
}

/**
 * Le salon (rooms-menu.ts, remote) : le salon à choisir en tête (le mien, Monde, ceux où l'on parle,
 * « Autres pays… »), ses dernières lignes à l'ancienne (l'heure, <pseudo> à la teinte de sa clé, le
 * texte, ses réactions dessous), des phrases d'un appui et un champ. Une ligne touchée ouvre ses
 * options. Écrire passe par la borne (« room-send »), qui vérifie les règles, les limites et le texte.
 */
function renderRoom() {
  const r = community.data?.room;
  const list = document.getElementById('room-lines');
  const status = document.getElementById('room-status');
  const chips = document.getElementById('room-chips');
  const field = document.getElementById('room-field');
  const picker = document.getElementById('room-picker');
  document.getElementById('room-send').textContent = t('Envoyer');
  if (!r) {
    list.replaceChildren();
    picker.replaceChildren();
    status.hidden = false;
    status.textContent = community.data?.closed ?? t('Partage désactivé : Partage et réseau');
    setChips(chips, []);
    field.disabled = true;
    return;
  }
  // Les salons à choisir, en badges sur une ligne ; « Autres pays… » en dernier.
  setChips(
    picker,
    [
      {
        lines: 1,
        items: [
          ...(r.rooms ?? []).map((x) => ({ label: x.present ? `${x.name} · ${x.present}` : x.name, current: x.room === r.room, run: () => communityPickRoom(x.room) })),
          ...(r.countries?.length ? [{ label: t('Autres pays…'), run: () => openCountries(r) }] : []),
        ],
      },
    ],
    r.room,
  );
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.replaceChildren(
    ...r.lines.map((l) => {
      const li = document.createElement('li');
      li.className = `room-line kind-${l.kind}${l.id && l.kind !== 'masked' ? ' pick' : ''}`;
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
      if (l.reacts) {
        const reacts = document.createElement('span');
        reacts.className = 'room-reacts';
        reacts.textContent = l.reacts;
        text.append(reacts);
      }
      li.append(time, text);
      if (l.id && l.kind !== 'masked') {
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.addEventListener('click', () => {
          // Un texte sélectionné (copier une ligne) n'ouvre rien.
          if (String(window.getSelection?.() ?? '').trim()) return;
          if (navigator.vibrate) navigator.vibrate(12);
          openLineOptions(community.data?.room ?? r, l);
        });
      }
      return li;
    }),
  );
  // Qui écrit dans le salon, sous la dernière ligne.
  const typing = typingItem(r.typing, 'room');
  if (typing) list.append(typing);
  if (atBottom || community.roomShown !== r.room) list.scrollTop = list.scrollHeight;
  community.roomShown = r.room;
  // Le constat du dernier geste (signalement envoyé…), sinon pourquoi on ne peut pas écrire, sinon l'aide.
  const line = r.notice ?? (r.blocked ? { text: r.blocked, tone: 'warning' } : { text: t('Touchez une ligne : réagir, répondre, voir le profil, signaler.'), tone: 'info' });
  status.hidden = false;
  status.textContent = line.text;
  status.className = `thread-status ${line.tone}`;
  field.disabled = Boolean(r.blocked);
  // Les phrases préparées en badges, sur deux lignes qui défilent (chipStrip, telephone.js).
  setChips(chips, [{ lines: 2, items: r.phrases.map((p) => ({ label: p, disabled: Boolean(r.blocked), run: () => send({ t: 'room-send', text: p }) })) }], r.room);
}

document.getElementById('room-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const field = document.getElementById('room-field');
  const text = field.value.trim();
  if (!text || !community.data?.room || community.data.room.blocked) return;
  send({ t: 'room-send', text });
  field.value = '';
  stopRoomTyping();
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
  // Joueurs : les demandes, les filtres et les groupes de la borne.
  if (shown === 'friends') return renderPeople(list, c);
  list.replaceChildren(...c.rows.map((r) => communityRow(r, r.last)));
  if (!c.rows.length) showEmpty('conv', 'friend-add', t('Pas encore d’ami à qui écrire'), t('Dans « Joueurs », ouvrez un profil pour envoyer une demande d’ami.'));
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
    setChips(chips, []);
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
  // Qui écrit (l'ami, des membres du groupe), sous le dernier message.
  const typing = typingItem(th.typing, 'thread');
  if (typing) lines.append(typing);
  // Ouvert : en bas, sur le dernier message ; ensuite, seulement si on y était déjà.
  if (community.shownKey !== th.key || atBottom) lines.scrollTop = lines.scrollHeight;
  community.shownKey = th.key;
  status.textContent = th.blocked ?? [th.status.text, th.status.detail].filter(Boolean).join(' · ');
  status.className = `thread-status ${th.blocked ? 'warning' : th.status.tone}`;
  field.disabled = Boolean(th.blocked);
  form.classList.toggle('off', Boolean(th.blocked));
  field.placeholder = th.blocked ? t('Indisponible') : t('Écrire à {name}…', { name: th.name });
  // Les réactions au dernier message reçu sur une ligne, puis les phrases toutes prêtes sur deux
  // (chipStrip, telephone.js) ; rien quand on ne peut pas écrire.
  const lastIn = [...th.items].reverse().find((it) => it.kind === 'line' && !it.out);
  setChips(
    chips,
    th.blocked
      ? []
      : [
          { lines: 1, className: 'reactions', items: lastIn ? th.reactions.map((r) => ({ label: r.label, run: () => send({ t: 'chat-react', key: th.key, target: lastIn.id, kind: r.id }) })) : [] },
          { lines: 2, items: th.phrases.map((p) => ({ label: p, run: () => send({ t: 'chat-send', key: th.key, text: p }) })) },
        ],
    [th.key, lastIn?.id ?? ''],
  );
}

/** Un message de la borne (« community ») : la liste, le fil ouvert, la pastille de l'onglet. */
function communityMessage(m) {
  community.data = {
    closed: typeof m.closed === 'string' ? m.closed : undefined,
    unread: Number.isInteger(m.unread) ? m.unread : 0,
    rows: Array.isArray(m.rows) ? m.rows : [],
    thread: m.thread && typeof m.thread === 'object' && typeof m.thread.key === 'string' && Array.isArray(m.thread.items) ? m.thread : undefined,
    // Joueurs (demandes, filtres, groupes), le profil ouvert et le salon par pays : gardés, sinon ces vues restent vides.
    people: m.people && typeof m.people === 'object' && Array.isArray(m.people.requests) && Array.isArray(m.people.filters) && m.people.groups && typeof m.people.groups === 'object' ? m.people : undefined,
    profile: m.profile && typeof m.profile === 'object' && typeof m.profile.key === 'string' && Array.isArray(m.profile.actions) ? m.profile : undefined,
    room: m.room && typeof m.room === 'object' && typeof m.room.name === 'string' && Array.isArray(m.room.lines) ? m.room : undefined,
  };
  renderCommunity();
  if (document.body.dataset.view === 'thread') renderThread();
  if (document.body.dataset.view === 'room') renderRoom();
  if (document.body.dataset.view === 'profile') renderProfile();
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
  stopThreadTyping();
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
  // Le profil d'un joueur : son nom et ce qu'il est (niveau, relation), sa pastille.
  if (shown === 'profile') {
    const pr = community.data?.profile;
    return pr && pr.key === community.profile ? { title: pr.name, detail: pr.subheading, face: communityFace({ ...pr, state: 'gone' }, 'top-face') } : { title: t('Profil'), detail: '' };
  }
  if (shown === 'room' && community.data?.room) return { title: community.data.room.name, detail: community.data.room.present ? tn(community.data.room.present, '{n} présent', '{n} présents') : '' };
  if (!['messages', 'friends', 'room', 'ranks'].includes(shown)) return undefined;
  const unread = community.data?.unread ?? 0;
  return { title: t('Communauté'), detail: unread ? tn(unread, '{n} message non lu', '{n} messages non lus') : '' };
}

// Retour : du lecteur au Juke-box, d'un profil à la vue qui l'a ouvert (Joueurs, un fil), d'un fil à la Communauté.
document.getElementById('top-back').addEventListener('click', () => {
  const shown = document.body.dataset.view;
  if (shown === 'player') return setView('jukebox');
  if (shown === 'profile' && community.profileFrom === 'thread' && community.open) return setView('thread');
  setView(shown === 'profile' ? community.profileFrom : communityView);
});
document.getElementById('thread-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const field = document.getElementById('thread-field');
  const text = field.value.trim();
  const th = community.data?.thread;
  if (!th || th.blocked || !text) return;
  send({ t: 'chat-send', key: th.key, text });
  field.value = '';
  stopThreadTyping();
});
