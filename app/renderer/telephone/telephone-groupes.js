// Groupes et parties en direct de la page du téléphone (lot 4 de la Communauté au téléphone,
// 18/11/2026). La borne choisit, vérifie et traduit tout (groups-menu.ts, instant-menu.ts : remote,
// remoteAct) ; la page dessine et ne renvoie que des identités que la borne vérifie (« group-act »,
// « instant-act ») :
// - Messages : « Créer un groupe » (s'ouvre à la borne) et « Groupes publics » en tête, puis les
//   invitations de groupe reçues (Accepter, Refuser), avant les conversations ;
// - Groupes publics, plein écran : chercher, Rejoindre, Aperçu, « Déjà membre » grisé ;
// - un groupe : sa table de la semaine et son classement en tête du fil, l'auteur au-dessus de chaque
//   message, son menu ⋮ (Membres, Inviter des amis, Notifications, Quitter le groupe) ;
// - Joueurs : les parties en direct ouvertes en tête (Rejoindre, ou grisée avec sa raison), « Ouvrir
//   une partie en direct » (la table choisie à la borne, « Changer », 2 à 4 joueurs), puis « Votre
//   partie » plein écran (places, heure de fermeture, Inviter des amis, Annuler).
// Une fonction indisponible reste visible, grisée, avec sa raison.
//
// Chargé après telephone-community.js et avant telephone.js : ses fonctions servent quand la page vit
// (send, state, setView, openSheet, peopleButton, sectionTitle, profileLine… sont ceux de ces pages).
'use strict';

/** La page plein écran ouverte (« publics » : Groupes publics, « instant » : Votre partie), et d'où. */
const pages = {
  kind: undefined,
  from: 'messages',
  /** Ce qu'on cherche dans les groupes publics (gardé tant que la page est ouverte). */
  query: '',
  /** « Ouvrir une partie » : la table choisie au téléphone (sinon celle de la borne), le nombre de joueurs. */
  table: undefined,
  count: 2,
  /** « Changer » : la liste des tables est demandée à la borne, la feuille s'ouvre à son arrivée. */
  picking: false,
};

/** Un bouton vert, ou grisé avec sa raison dessous (une fonction indisponible reste visible). */
function reasonLine(text) {
  return profileLine({ text, tone: 'quiet' }, 'profile-reason');
}

/** Des pastilles empilées (membres d'un groupe, joueurs d'une partie). */
function faceStack(avatars) {
  const stack = document.createElement('span');
  stack.className = 'face-stack';
  for (const a of avatars ?? []) stack.append(avatarNode(a, ''));
  return stack;
}

/** La tête d'une carte : un médaillon (pastille ou initiale), un titre, un détail, et ce qui va à droite. */
function cardHead(lead, title, detail, aside, detailClass) {
  const head = document.createElement('div');
  head.className = 'people-card-head';
  const text = document.createElement('span');
  text.className = 'entry-text';
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = title;
  text.append(label);
  if (detail) {
    const line = document.createElement('span');
    line.className = `entry-detail${detailClass ? ` ${detailClass}` : ''}`;
    line.textContent = detail;
    text.append(line);
  }
  if (lead) head.append(lead);
  head.append(text);
  if (aside) head.append(aside);
  return head;
}

/** Le médaillon d'une table : son initiale, comme sur la liste des tables sans image. */
function tableInitial(title) {
  const m = document.createElement('span');
  m.className = 'entry-medal';
  m.textContent = (title || '?').trim().charAt(0).toUpperCase();
  return m;
}

/** Le constat du dernier geste (« Bienvenue dans … »), en tête d'une liste. */
function noticeItem(notice) {
  const li = document.createElement('li');
  li.className = 'groups-notice';
  li.append(profileLine({ ...notice, icon: notice.tone === 'warning' ? 'alert' : 'check' }, 'profile-flash'));
  return li;
}

// ---------- Messages : créer, groupes publics, invitations reçues ----------

/** Ce qui va en tête de « Messages » (avant les conversations) ; rien sans les groupes de la borne. */
function groupsHead(c) {
  const g = c.groups;
  if (!g) return [];
  const rows = [];
  const acts = document.createElement('li');
  acts.className = 'groups-actions';
  const bar = document.createElement('div');
  bar.className = 'people-actions';
  const create = peopleButton(t('Créer un groupe'), 'plus', g.create.reason ? 'off' : '', () => {
    if (g.create.reason) return openSheet(t('Créer un groupe'), [], { text: g.create.reason });
    send({ t: 'group-act', a: 'create' });
    // Le nom se tape à la borne (le clavier de ce téléphone y écrit) : la vue Écran la montre.
    setView('list');
  });
  if (g.create.reason) create.setAttribute('aria-disabled', 'true');
  bar.append(create, peopleButton(t('Groupes publics'), 'group', '', () => communityOpenPage('publics')));
  acts.append(bar);
  rows.push(acts);
  if (g.notice) rows.push(noticeItem(g.notice));
  if (g.blocked) rows.push(sectionTitle(g.blocked));
  for (const inv of g.invitations) {
    const li = document.createElement('li');
    const card = document.createElement('div');
    card.className = 'people-card attention';
    const actions = document.createElement('div');
    actions.className = 'people-actions';
    actions.append(
      peopleButton(t('Accepter'), 'check', 'primary', () => send({ t: 'group-act', a: 'accept', g: inv.g })),
      peopleButton(t('Refuser'), undefined, '', () => send({ t: 'group-act', a: 'decline', g: inv.g })),
    );
    card.append(cardHead(communityFace({ avatar: inv.avatar, state: 'gone' }), inv.name, inv.detail), actions);
    li.append(card);
    rows.push(li);
  }
  if (g.invitations.length && c.rows.length) rows.push(sectionTitle(t('Conversations')));
  return rows;
}

// ---------- Groupes publics (plein écran) ----------

/** Les groupes publics : chercher par nom, rejoindre, l'aperçu ; les miens grisés « Déjà membre ». */
function renderPublics(box) {
  const g = community.data?.groups;
  const parts = [];
  const search = document.createElement('label');
  search.className = 'groups-search';
  search.append(cyberIcon('search'));
  const field = document.createElement('input');
  field.type = 'search';
  field.placeholder = t('Chercher un groupe');
  field.value = pages.query;
  field.setAttribute('aria-label', t('Chercher un groupe'));
  field.addEventListener('input', () => {
    pages.query = field.value;
    renderPublicList(list);
  });
  search.append(field);
  parts.push(search);
  if (g?.notice) parts.push(profileLine({ ...g.notice, icon: g.notice.tone === 'warning' ? 'alert' : 'check' }, 'profile-flash'));
  const list = document.createElement('div');
  list.className = 'groups-public-list';
  parts.push(list);
  // Le champ garde le focus quand la borne redessine : seule la liste change.
  const had = box.querySelector('.groups-search input');
  if (had && document.activeElement === had) {
    const old = box.querySelector('.groups-public-list');
    renderPublicList(old);
    return;
  }
  box.replaceChildren(...parts);
  renderPublicList(list);
}

function renderPublicList(list) {
  const g = community.data?.groups;
  if (!g) {
    list.replaceChildren(profileLine({ text: t('Groupes indisponibles'), tone: 'quiet' }));
    return;
  }
  if (g.blocked) {
    list.replaceChildren(profileLine({ text: g.blocked, tone: 'warning', icon: 'network' }));
    return;
  }
  const q = pages.query.trim().toLocaleLowerCase();
  const shown = g.publics.filter((p) => !q || p.name.toLocaleLowerCase().includes(q));
  if (!shown.length) {
    list.replaceChildren(profileLine({ text: q ? t('Aucun groupe public de ce nom') : t('Aucun groupe public pour l’instant'), detail: q ? '' : t('L’annuaire arrive des bornes reliées : il se remplit en quelques secondes.'), tone: 'quiet' }));
    return;
  }
  list.replaceChildren(
    ...shown.map((p) => {
      const card = document.createElement('div');
      card.className = 'people-card';
      const acts = document.createElement('div');
      acts.className = 'people-actions';
      const join = p.member
        ? peopleButton(t('Déjà membre'), 'check', 'off', () => undefined)
        : peopleButton(t('Rejoindre'), 'plus', p.reason ? 'off' : 'wash', () => (p.reason ? undefined : send({ t: 'group-act', a: 'join', g: p.g })));
      if (p.member || p.reason) join.setAttribute('aria-disabled', 'true');
      // L'aperçu : la table de la semaine et les membres, et « Rejoindre » s'il est possible.
      const preview = () => {
        const lines = document.createElement('div');
        lines.className = 'sheet-lines';
        lines.append(...p.preview.map((line) => profileLine({ text: line })));
        openSheet(p.name, p.member || p.reason ? [] : [{ label: t('Rejoindre'), current: true, run: () => send({ t: 'group-act', a: 'join', g: p.g }) }], { text: p.detail, top: [lines] });
      };
      acts.append(join, peopleButton(t('Aperçu'), 'eye', '', preview));
      card.append(cardHead(undefined, p.name, p.detail, faceStack(p.avatars)), acts);
      if (p.reason && !p.member) card.append(reasonLine(p.reason));
      return card;
    }),
  );
}

// ---------- Un groupe : table de la semaine, classement, menu ⋮ ----------

/** En tête du fil d'un groupe : la table de la semaine (« Jouer » à la borne) et son classement. */
function groupWeekItem(gh) {
  const li = document.createElement('li');
  li.className = 'th-week';
  const box = document.createElement('div');
  box.className = 'group-week';
  if (gh.week) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = `group-week-go${gh.week.reason ? ' off' : ''}`;
    play.textContent = t('Jouer');
    if (gh.week.reason) play.setAttribute('aria-disabled', 'true');
    play.addEventListener('click', () => {
      if (state !== 'paired') return;
      if (gh.week.reason) return openSheet(gh.week.title, [], { text: gh.week.reason });
      if (navigator.vibrate) navigator.vibrate(12);
      send({ t: 'group-act', a: 'play', g: gh.g });
      setView('list');
    });
    box.append(cardHead(tableInitial(gh.week.title), gh.week.title, `${t('Table de la semaine')} · ${gh.week.detail}`, play));
    for (const r of gh.ranking.slice(0, 5)) {
      const row = document.createElement('div');
      row.className = `group-rank${r.me ? ' me' : ''}`;
      const rank = document.createElement('b');
      rank.textContent = String(r.rank);
      const flag = personFlag(r.flag) ?? document.createElement('span');
      const name = document.createElement('span');
      name.className = 'group-rank-name';
      name.textContent = r.name;
      const score = document.createElement('span');
      score.className = 'group-rank-score';
      score.textContent = r.score;
      row.append(rank, flag, name, score);
      box.append(row);
    }
    if (gh.rankingEmpty) box.append(profileLine({ text: gh.rankingEmpty, tone: 'quiet' }));
  } else box.append(profileLine({ text: t('Pas de table de la semaine'), detail: gh.noWeek, tone: 'quiet', icon: 'play' }));
  li.append(box);
  return li;
}

/** Le menu ⋮ d'un groupe : Membres, Inviter des amis, Notifications, Quitter le groupe. */
function openGroupMenu(th) {
  const gh = th.group;
  openSheet(th.name, [
    { label: t('Membres'), run: () => openSheet(t('Membres'), gh.members.map((m) => ({ label: m.me ? t('{name} (toi)', { name: m.name }) : `${m.name} · ${m.detail}`, run: () => (m.me ? undefined : communityOpenProfile(m.key)) }))) },
    {
      label: t('Inviter des amis'),
      run: () =>
        gh.inviteReason
          ? openSheet(t('Inviter des amis'), [], { text: t('Indisponible : {reason}', { reason: gh.inviteReason }) })
          : openSheet(t('Inviter des amis'), gh.invitable.map((f) => ({ label: `${f.name} · ${f.detail}`, run: () => send({ t: 'group-act', a: 'invite', g: gh.g, key: f.key }) })), { text: t('Seuls tes amis peuvent être invités. Ils voient le groupe dès qu’ils acceptent.') }),
    },
    { label: gh.muted ? t('Notifications du groupe : coupées') : t('Notifications du groupe : activées'), run: () => send({ t: 'group-act', a: gh.muted ? 'unmute' : 'mute', g: gh.g }) },
    {
      label: t('Quitter le groupe'),
      danger: true,
      run: () => openSheet(t('Quitter « {group} » ?', { group: th.name }), [{ label: t('Quitter le groupe'), danger: true, run: () => (send({ t: 'group-act', a: 'leave', g: gh.g }), setView('messages')) }], { text: gh.leave }),
    },
  ]);
}

// ---------- Joueurs : les parties en direct ----------

/** Ce qui va en tête de « Joueurs » : les parties ouvertes, ma partie, ou de quoi en ouvrir une. */
function instantHead(c) {
  const ins = c.instant;
  if (!ins) return [];
  const rows = [sectionTitle(ins.games.length ? `${t('Parties en direct')} · ${tn(ins.games.length, '{n} ouverte', '{n} ouvertes')}` : t('Parties en direct'))];
  if (ins.blocked) {
    rows.push(Object.assign(document.createElement('li'), { className: 'instant-blocked' }));
    rows.at(-1).append(profileLine({ text: ins.blocked, tone: 'quiet', icon: 'network' }));
    return rows;
  }
  for (const g of ins.games) {
    const li = document.createElement('li');
    const card = document.createElement('div');
    card.className = 'people-card';
    const acts = document.createElement('div');
    acts.className = 'people-actions';
    const join = peopleButton(t('Rejoindre'), 'rocket', g.join ? 'primary' : 'off', () => {
      if (!g.join) return;
      send({ t: 'instant-act', a: 'join', id: g.id });
      // La vérification de la table et le salon se passent à la borne : la vue Écran les montre.
      setView('list');
    });
    if (!g.join) join.setAttribute('aria-disabled', 'true');
    acts.append(join);
    card.append(cardHead(tableInitial(g.title), g.title, g.detail, faceStack(g.avatars)), acts);
    if (g.reason) card.append(reasonLine(g.reason));
    li.append(card);
    rows.push(li);
  }
  const li = document.createElement('li');
  li.className = 'groups-actions';
  if (ins.mine) {
    const card = document.createElement('div');
    card.className = 'people-card attention';
    const acts = document.createElement('div');
    acts.className = 'people-actions';
    acts.append(peopleButton(t('Voir'), 'rocket', 'primary', () => communityOpenPage('instant')));
    card.append(cardHead(tableInitial(ins.mine.title), t('Ta partie : {title}', { title: ins.mine.title }), `${ins.mine.detail} · ${ins.mine.status}`), acts);
    li.append(card);
  } else if (ins.open) {
    const b = peopleButton(t('Ouvrir une partie en direct'), 'plus', ins.open.reason ? 'off' : '', () => (ins.open.reason ? openSheet(t('Ouvrir une partie en direct'), [], { text: ins.open.reason }) : openInstantSheet()));
    if (ins.open.reason) b.setAttribute('aria-disabled', 'true');
    li.append(b);
  }
  rows.push(li);
  return rows;
}

/** « Ouvrir une partie en direct » : la table (celle de la borne par défaut, « Changer »), 2 à 4 joueurs. */
function openInstantSheet() {
  const open = community.data?.instant?.open;
  if (!open) return;
  const table = pages.table ?? open.table;
  const field = document.createElement('div');
  field.className = 'instant-field';
  const text = document.createElement('span');
  text.className = 'instant-field-text';
  const label = document.createElement('span');
  label.className = 'instant-field-label';
  label.textContent = pages.table ? t('Table') : t('Table · choisie à la borne');
  const value = document.createElement('span');
  value.className = 'instant-field-value';
  value.textContent = table?.title ?? t('Choisis une table');
  text.append(label, value);
  const change = document.createElement('button');
  change.type = 'button';
  change.className = 'instant-field-go';
  change.textContent = t('Changer');
  change.addEventListener('click', () => {
    pages.picking = true;
    send({ t: 'instant-act', a: 'tables' });
    showTablePicker();
  });
  field.append(tableInitial(table?.title ?? '?'), text, change);
  const countLabel = document.createElement('div');
  countLabel.className = 'instant-field-label';
  countLabel.textContent = t('Joueurs, toi compris');
  const toggle = document.createElement('div');
  toggle.className = 'phone-toggle';
  toggle.setAttribute('role', 'radiogroup');
  for (let n = open.min; n <= open.max; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(n);
    b.className = n === pages.count ? 'on' : '';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(n === pages.count));
    b.addEventListener('click', () => {
      pages.count = n;
      for (const x of toggle.children) {
        x.className = x === b ? 'on' : '';
        x.setAttribute('aria-checked', String(x === b));
      }
    });
    toggle.append(b);
  }
  const note = document.createElement('p');
  note.className = 'instant-note';
  note.textContent = open.text;
  openSheet(
    t('Ouvrir une partie en direct'),
    table
      ? [
          {
            label: t('Ouvrir la partie'),
            current: true,
            run: () => {
              send({ t: 'instant-act', a: 'open', count: pages.count, ...(pages.table ? { table: pages.table.ref } : {}) });
              setView('list');
            },
          },
        ]
      : [],
    { top: [field, countLabel, toggle, note] },
  );
}

/** « Changer » : les tables jouables à plusieurs (VPX), dès que la borne les a envoyées. */
function showTablePicker() {
  const tables = community.data?.instant?.open?.tables;
  if (!pages.picking) return;
  if (!tables) {
    openSheet(t('Choisir la table'), [], { text: t('La borne envoie ses tables…') });
    return;
  }
  pages.picking = false;
  openSheet(
    t('Choisir la table'),
    tables.map((x) => ({
      label: x.title,
      current: x.ref === (pages.table ?? community.data?.instant?.open?.table)?.ref,
      run: () => {
        pages.table = x;
        openInstantSheet();
      },
    })),
  );
}

/** Votre partie, plein écran : les places, le départ, l'heure de fermeture, inviter des amis, l'annuler. */
function renderInstantPage(box) {
  const mine = community.data?.instant?.mine;
  if (!mine) {
    box.replaceChildren(Object.assign(document.createElement('p'), { className: 'profile-wait', textContent: t('Aucune partie ouverte : elle a commencé, ou elle est fermée.') }));
    return;
  }
  const parts = [];
  const hero = document.createElement('div');
  hero.className = 'instant-hero';
  const name = document.createElement('div');
  name.className = 'profile-name';
  name.textContent = mine.title;
  hero.append(tableInitial(mine.title), name);
  parts.push(hero);
  const slots = document.createElement('div');
  slots.className = `instant-slots n${mine.max}`;
  for (const s of mine.seats) {
    const slot = document.createElement('div');
    slot.className = 'instant-slot';
    const who = document.createElement('span');
    who.textContent = s.name;
    slot.append(avatarNode(s.avatar, ''), who);
    slots.append(slot);
  }
  for (let i = mine.seats.length; i < mine.max; i++) {
    const slot = document.createElement('div');
    slot.className = 'instant-slot free';
    const hole = document.createElement('span');
    hole.className = 'instant-hole';
    hole.append(cyberIcon('plus'));
    const who = document.createElement('span');
    who.textContent = t('Libre');
    slot.append(hole, who);
    slots.append(slot);
  }
  parts.push(slots);
  parts.push(profileLine({ text: mine.status, detail: mine.closes, icon: 'clock', tone: 'info' }, 'instant-wait'));
  const invite = document.createElement('div');
  invite.className = 'people-actions';
  const inv = peopleButton(t('Inviter des amis'), 'friend-add', mine.inviteReason ? 'off' : 'primary', () =>
    mine.inviteReason
      ? openSheet(t('Inviter des amis'), [], { text: t('Indisponible : {reason}', { reason: mine.inviteReason }) })
      : openSheet(t('Inviter des amis'), mine.invitable.map((f) => ({ label: `${f.name} · ${f.detail}`, run: () => send({ t: 'instant-act', a: 'invite', key: f.key }) }))),
  );
  if (mine.inviteReason) inv.setAttribute('aria-disabled', 'true');
  invite.append(inv);
  parts.push(invite);
  if (mine.inviteReason) parts.push(reasonLine(mine.inviteReason));
  const cancel = document.createElement('div');
  cancel.className = 'people-actions';
  const label = mine.host ? t('Annuler la partie') : t('Quitter la partie');
  cancel.append(peopleButton(label, 'close', 'danger', () => openSheet(`${label} ?`, [{ label, danger: true, run: () => send({ t: 'instant-act', a: 'cancel' }) }], { text: mine.cancel })));
  parts.push(cancel);
  parts.push(reasonLine(mine.note));
  box.replaceChildren(...parts);
}

// ---------- La page plein écran ----------

/** Ouvre une page plein écran (Groupes publics, Votre partie) ; son retour ramène à la vue d'où elle vient. */
function communityOpenPage(kind, opts = {}) {
  const from = document.body.dataset.view;
  if (from !== 'page') {
    pages.from = COMMUNITY_VIEWS.includes(from) ? from : 'messages';
    pages.parent = undefined;
  } else if (!opts.back) pages.parent = pages.kind;
  else pages.parent = undefined;
  pages.kind = kind;
  pages.query = '';
  // L'annuaire des groupes publics se demande aux bornes reliées : la page se redessine à l'arrivée.
  if (kind === 'publics') send({ t: 'group-act', a: 'directory' });
  // Mon niveau, Mes badges, le barème : la borne en envoie le détail tant que la page est ouverte.
  send({ t: 'page-open', ...(LEVEL_PAGES.includes(kind) ? { page: kind } : {}) });
  setView('page');
  renderPage();
}

function renderPage() {
  const box = document.getElementById('full-page-body');
  if (pages.kind === 'publics') renderPublics(box);
  else if (pages.kind === 'instant') renderInstantPage(box);
  else if (LEVEL_PAGES.includes(pages.kind)) renderLevelPage(box, pages.kind);
  else box.replaceChildren();
}

/** Ce que dit la barre du haut sur une page plein écran. */
function pageTop() {
  if (pages.kind === 'publics') {
    const n = community.data?.groups?.publics.length ?? 0;
    return { title: t('Groupes publics'), detail: n ? tn(n, '{n} groupe', '{n} groupes') : '' };
  }
  if (pages.kind === 'instant') {
    const mine = community.data?.instant?.mine;
    return { title: t('Ta partie'), detail: mine ? `${mine.title} · ${mine.detail}` : '' };
  }
  if (LEVEL_PAGES.includes(pages.kind)) {
    const page = community.data?.page;
    return page?.kind === pages.kind ? { title: page.view.heading, detail: page.view.subheading ?? '' } : { title: t('Mon niveau'), detail: '' };
  }
  return { title: t('Communauté'), detail: '' };
}

/** La page plein écran est quittée : la borne cesse d'en envoyer le détail (Mon niveau…). */
function communityLeavePage() {
  if (LEVEL_PAGES.includes(pages.kind)) send({ t: 'page-open' });
  pages.kind = undefined;
  pages.parent = undefined;
}
