// Écrans de gestion des tables (fiche, modification, médecin, suppression, ajout),
// décrits par le processus principal (library.ts). Ici on ne fait que dessiner,
// et renvoyer les clics de souris et les fichiers glissés sur la fenêtre.

function libEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function actOn(node, action) {
  node.dataset.act = JSON.stringify(action);
  return node;
}

function renderLibrary(v) {
  const o = libEl('section', `lib lib-${v.screen}${v.variant ? ` lib-${v.variant}` : ''}`);
  const head = libEl('header', 'lib-head');
  // Retour en tête : à la souris, inutile de descendre au bas de la liste chercher « Retour ».
  if (v.back) {
    const back = actOn(libEl('button', 'lib-back'), { type: 'back' });
    back.type = 'button';
    back.append(libEl('span', 'lib-back-arrow', '‹'), libEl('span', '', v.back));
    head.append(back);
  }
  const h1 = libEl('h1', '', v.heading);
  // Icône du titre : celle de l'entrée qui a ouvert l'écran (registre icons.js).
  if (v.icon) {
    h1.classList.add('with-icon');
    h1.prepend(cyberIcon(v.icon, 'lib-head-icon'));
  }
  head.append(h1);
  if (v.subheading) head.append(libEl('div', 'lib-sub', v.subheading));
  if (v.lead) head.append(libEl('p', 'lib-lead', v.lead));
  o.append(head);

  const body = libEl(
    'div',
    v.pages
      ? 'lib-body lib-pages'
      : v.media
        ? `lib-body lib-media${v.media.large ? ' large' : ''}`
        : v.journey
          ? 'lib-body lib-journey'
          : v.sections.length
            ? 'lib-body'
            : 'lib-body only-actions',
  );
  if (v.pages) body.append(renderPages(v.pages));
  else if (v.journey) body.append(renderJourney(v.journey));
  else if (v.media || v.sections.length) {
    const content = libEl('div', 'lib-content');
    // Médias : le message du moment, puis les cartes, puis les sections titrées.
    const sections = v.media ? [...v.sections.filter((x) => !x.title), { cards: true }, ...v.sections.filter((x) => x.title)] : v.sections;
    for (const section of sections) {
      if (section.cards) {
        content.append(renderMediaCards(v.media, v.cursor));
        continue;
      }
      const box = libEl('section', 'lib-section');
      if (section.title) box.append(libEl('h2', '', section.title));
      const list = libEl('ul', 'lib-rows');
      for (const row of section.rows) {
        const li = libEl('li', `lib-row tone-${row.tone ?? 'none'}`);
        if (row.action !== undefined) {
          li.classList.add(row.pick ? 'pick' : 'fixable');
          if (row.action === v.cursor) li.classList.add('selected');
          actOn(li, { type: 'activate', index: row.action });
        }
        const line = libEl('div', 'lib-row-line');
        if (row.icon) line.append(cyberIcon(row.icon, 'lib-row-icon'));
        line.append(libEl('span', 'lib-row-text', row.text));
        for (const badge of row.badges ?? []) line.append(libEl('span', 'badge', badge));
        li.append(line);
        if (row.detail) li.append(libEl('div', 'lib-row-detail', row.detail));
        list.append(li);
      }
      if (section.more > 0) list.append(libEl('li', 'lib-row more', tn(section.more, '… et {n} autre', '… et {n} autres')));
      box.append(list);
      content.append(box);
    }
    body.append(content);
  }

  // Prospectus et règles : les flippers tournent les pages ; les actions restent là pour la souris.
  const actions = libEl('ol', v.pages ? 'lib-actions pages-actions' : 'lib-actions');
  // Une colonne d'icônes dès qu'une action en a une : les libellés restent alignés.
  if (v.actions.some((a) => a.icon)) {
    actions.classList.add('with-icons');
    // Deux entrées d'un même menu n'ont jamais la même icône (garde-fou de mise en page).
    actions.dataset.iconMenu = '';
  }
  // Les actions montrées en cartes (un média, une page, un fichier) ou en lignes à choisir
  // (un fichier de la table, un élément de la liste d'attente) ne sont pas répétées dans la liste.
  const carded = new Set([...(v.media?.cards ?? []), ...v.sections.flatMap((s) => s.rows.filter((r) => r.pick))].map((c) => c.action).filter((a) => a !== undefined));
  v.actions.forEach((a, i) => {
    if (carded.has(i)) return;
    const li = actOn(libEl('li', `lib-action tone-${a.tone ?? 'none'}${i === v.cursor && !v.pages ? ' current' : ''}`), { type: 'activate', index: i });
    // Libellé en attribut : une démonstration clique une action par son nom, pas par son rang.
    li.dataset.label = a.label;
    const label = libEl('span', 'label', a.label);
    // Pastille rouge : cette entrée attend l'utilisateur (une mise à jour disponible…). En haut
    // à droite de son icône, sinon après le libellé.
    const dot = a.attention ? libEl('span', 'lib-attention') : undefined;
    if (dot) dot.title = t('Attend votre intervention');
    if (a.icon) {
      const glyph = libEl('span', 'lib-action-glyph');
      glyph.append(cyberIcon(a.icon, 'lib-action-icon'));
      if (dot) glyph.append(dot);
      li.append(glyph);
    } else if (dot) label.append(dot);
    li.append(label);
    if (a.detail) li.append(libEl('span', 'detail', a.detail));
    actions.append(li);
  });
  body.append(actions);
  o.append(body, libEl('footer', 'lib-hint', v.hint));

  if (v.editor) o.append(renderEditor(v.editor));
  if (v.busy) {
    const busy = libEl('div', 'lib-busy');
    busy.append(libEl('div', 'spinner'), libEl('div', '', v.busy));
    o.append(busy);
  }
  forgetMediaNodes();
  if (v.pages?.fallback !== 'info-sheet') forgetInfoCard();
  return o;
}

// ---------- Ce qu'il manque pour jouer (journey.ts) ----------

/**
 * Parcours d'une table : « Étape n sur N », une barre d'un segment par étape (réglée,
 * courante, à faire, facultative), puis les étapes numérotées, chacune avec son mot et
 * son signe d'état ; la courante est marquée d'un filet clair, jamais en vert (le vert
 * reste au geste choisi, dans la liste des actions). Un clic sur une étape déclenche
 * son premier geste.
 */
function renderJourney(j) {
  const box = libEl('div', 'lib-content journey');
  const progress = libEl('div', 'journey-progress');
  const top = libEl('div', 'journey-top');
  top.append(libEl('span', 'journey-position', j.position), libEl('span', 'journey-summary', j.summary));
  const bar = libEl('div', 'journey-bar');
  for (const s of j.steps) bar.append(libEl('i', s.state === 'done' ? 'done' : s.current ? 'current' : s.state === 'optional' ? 'optional' : ''));
  progress.append(top, bar);
  box.append(progress);
  if (j.notice) box.append(libEl('div', `journey-notice tone-${j.notice.tone}`, j.notice.text));
  const list = libEl('ol', 'journey-steps');
  for (const s of j.steps) {
    const li = libEl('li', `journey-step state-${s.state}${s.current ? ' current' : ''}`);
    if (s.action !== undefined) {
      li.classList.add('fixable');
      actOn(li, { type: 'activate', index: s.action });
    }
    const text = libEl('div', 'journey-text');
    text.append(libEl('div', 'journey-title', s.title));
    if (s.detail) text.append(libEl('div', 'journey-detail', s.detail));
    if (s.note) text.append(libEl('div', 'journey-note', s.note));
    const state = libEl('span', `journey-state tone-${s.tone}`);
    state.append(libEl('span', 'journey-sign', s.sign), libEl('span', '', s.word));
    li.append(libEl('span', 'journey-num', String(s.n)), text, state);
    list.append(li);
  }
  box.append(list);
  return box;
}

// ---------- Prospectus et règles, page par page ----------

function renderPages(p) {
  const stage = libEl('div', 'pages-stage');
  if (p.page) {
    const node = mediaNode(p.page.kind, p.page.url);
    if (p.page.kind === 'video') {
      node.loop = true;
      node.autoplay = true;
      if (node.paused) node.play().catch(() => {});
    }
    stage.append(node);
  } else if (p.fallback === 'game-controls') stage.append(renderGameKeys(p.keys ?? []));
  else stage.append(renderInfoSheet(p.card));
  return stage;
}

// Carte de fronton du prospectus généré (fallback.js), gardée d'un affichage à l'autre.
let infoCard;

function forgetInfoCard() {
  infoCard?.handle?.destroy();
  infoCard = undefined;
}

/** Prospectus généré depuis le .info : carte de fronton, fabricant, année, auteurs, description. */
function renderInfoSheet(card) {
  const sheet = libEl('div', 'info-sheet');
  const key = JSON.stringify([card.title, card.manufacturer, card.year]);
  if (infoCard?.key !== key) {
    forgetInfoCard();
    const box = libEl('div', 'info-card');
    infoCard = { key, box, handle: window.CyberFallback?.backglass(box, card, { animate: true }) };
  }
  sheet.append(infoCard.box);
  const facts = libEl('dl', 'info-facts');
  for (const [label, value] of [[t('Fabricant'), card.manufacturer], [t('Année'), card.year], [t('Auteurs'), card.authors], [t('Version'), card.version]]) {
    if (value === undefined || value === '') continue;
    facts.append(libEl('dt', '', label), libEl('dd', '', String(value)));
  }
  if (facts.childElementCount) sheet.append(facts);
  if (card.description) sheet.append(libEl('p', 'info-desc', card.description));
  sheet.append(libEl('p', 'pages-note', t('Pas de prospectus pour ce jeu : « Médias du jeu », sur la fiche, permet d’en ajouter.')));
  return sheet;
}

/** Règles absentes : les commandes de la partie, comme au chargement. */
function renderGameKeys(rows) {
  const box = libEl('div', 'game-keys pages-keys');
  box.append(libEl('h2', '', t('Commandes de la partie')));
  const list = libEl('div', 'game-keys-list');
  for (const [label, key] of rows) {
    const row = libEl('div', 'game-key');
    row.append(libEl('span', '', label), libEl('span', 'game-key-name', key));
    list.append(row);
  }
  box.append(list, libEl('p', 'pages-note', t('Pas de carte de règles pour ce jeu : « Médias du jeu », sur la fiche, permet d’en ajouter.')));
  return box;
}

// ---------- Médias d'un jeu ----------

// Images et vidéos des aperçus, gardées d'un affichage à l'autre : l'écran est redessiné
// à chaque bouton, et recharger une vidéo la ferait clignoter.
const mediaNodes = new Map();
let mediaUsed = new Set();

function mediaNode(kind, url) {
  // Le même fichier peut apparaître sur deux cartes (afficheur large servant de repli à l'afficheur).
  let n = 1;
  while (mediaUsed.has(`${kind} ${url} ${n}`)) n++;
  const key = `${kind} ${url} ${n}`;
  mediaUsed.add(key);
  let node = mediaNodes.get(key);
  if (!node) {
    node = libEl(kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'img', 'media-file');
    if (kind === 'video') {
      node.muted = true;
      node.preload = 'auto';
    } else if (kind === 'audio') {
      node.preload = 'none';
      node.loop = true;
      node.volume = 0.6;
    } else node.alt = '';
    node.src = url;
    mediaNodes.set(key, node);
  }
  return node;
}

function forgetMediaNodes() {
  for (const [key, node] of mediaNodes) {
    if (mediaUsed.has(key)) continue;
    // Un son retiré de l'écran continuerait de jouer, détaché.
    if (node.tagName === 'AUDIO') node.pause();
    mediaNodes.delete(key);
  }
  mediaUsed = new Set();
  syncAudio();
  playingAudio = null;
}

function renderThumb(t, selected = false) {
  const box = libEl('div', `media-thumb kind-${t.kind} rot-${t.rotation}`);
  if ((t.kind === 'image' || t.kind === 'video') && t.url) box.append(mediaNode(t.kind, t.url));
  else box.append(libEl('span', 'media-placeholder', t.text ?? ''));
  // Un son proposé s'écoute quand sa carte est choisie : on ne choisit pas une musique sans l'entendre.
  if (t.kind === 'audio' && t.url) {
    const audio = mediaNode('audio', t.url);
    box.append(audio);
    if (selected) {
      box.classList.add('playing');
      playingAudio = audio;
    }
  }
  return box;
}

// Son de la carte choisie : un seul à la fois, arrêté dès qu'on change de carte ou d'écran.
let playingAudio = null;

function syncAudio() {
  for (const [key, node] of mediaNodes) {
    if (!key.startsWith('audio ')) continue;
    if (node === playingAudio) {
      if (node.paused) node.play().catch(() => undefined);
    } else if (!node.paused) node.pause();
  }
}

// Une carte par média (ou par page, ou par fichier à prendre) : aperçu, nom, où il s'affiche,
// à quoi il sert, ce qui est montré aujourd'hui.
function renderMediaCards(m, cursor) {
  const list = libEl('ol', `media-cards${m.large ? ' large' : ''}`);
  for (const c of m.cards) {
    const li = libEl('li', `media-card${c.action === cursor ? ' selected' : ''}${c.note ? ' unused' : ''}`);
    if (c.action !== undefined) actOn(li, { type: 'activate', index: c.action });
    li.append(renderThumb(c.thumb, c.action === cursor));
    const text = libEl('div', 'media-text');
    const top = libEl('div', 'media-top');
    top.append(libEl('span', 'media-title', c.title));
    if (c.code) top.append(libEl('span', 'badge', c.code));
    if (c.state) top.append(libEl('span', `badge media-state tone-${c.state.tone}`, c.state.label));
    text.append(top);
    const line = (className, label, value) => {
      const div = libEl('div', className);
      if (label) div.append(libEl('span', 'media-label', label));
      div.append(value);
      text.append(div);
    };
    if (c.where) line('media-where', t('Où'), c.where);
    if (c.note) line('media-note', '', c.note);
    if (c.description) line('media-desc', t('Rôle'), c.description);
    if (c.facts) line('media-facts', '', c.facts);
    if (typeof c.progress === 'number') {
      const bar = libEl('div', 'media-progress');
      const fill = libEl('span', '');
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, c.progress)) * 100)}%`;
      bar.append(fill);
      text.append(bar);
    }
    if (c.pending) line('media-pending', '', c.pending);
    for (const extra of c.extra ?? []) line('media-extra', '', extra);
    li.append(text);
    list.append(li);
  }
  return list;
}

function renderEditor(e) {
  const box = libEl('div', `lib-editor editor-${e.kind}`);
  const panel = libEl('div', 'panel');
  panel.append(libEl('h2', '', e.label));
  if (e.value !== undefined) {
    const value = libEl('div', 'value', e.value);
    value.append(libEl('span', 'caret'));
    panel.append(value);
  }
  const keys = libEl('div', 'keys-grid');
  e.keys.forEach((k, i) => {
    const wide = k.length > 1 ? ' wide' : '';
    const button = actOn(libEl('button', `key${wide}${i === e.cursor ? ' current' : ''}${i === e.shiftKey && e.shift ? ' on' : ''}`, k), { type: 'editor', index: i });
    keys.append(button);
  });
  panel.append(keys);
  box.append(panel);
  return box;
}

// Souris : le pointeur n'apparaît que lorsqu'on s'en sert (une borne n'en a pas).
let mouseTimer;
document.addEventListener('mousemove', () => {
  document.body.classList.add('mouse');
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => document.body.classList.remove('mouse'), 4000);
});

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (target) window.cyber.act(JSON.parse(target.dataset.act));
});

// Glisser-déposer de fichiers : c'est un ajout de table.
document.addEventListener('dragover', (event) => {
  event.preventDefault();
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) document.body.classList.remove('dragging');
});
document.addEventListener('drop', (event) => {
  event.preventDefault();
  document.body.classList.remove('dragging');
  const paths = [...event.dataTransfer.files].map((f) => window.cyber.pathOf(f)).filter(Boolean);
  if (paths.length) window.cyber.act({ type: 'drop', paths });
});

/** Garde visible l'élément choisi quand la liste dépasse de l'écran. */
function revealSelection() {
  for (const node of document.querySelectorAll('.lib-row.selected, .lib-action.current, .key.current, .media-card.selected')) {
    node.scrollIntoView({ block: 'nearest' });
  }
}
