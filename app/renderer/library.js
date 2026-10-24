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
  const o = libEl('section', `lib lib-${v.screen}`);
  const head = libEl('header', 'lib-head');
  head.append(libEl('h1', '', v.heading));
  if (v.subheading) head.append(libEl('div', 'lib-sub', v.subheading));
  if (v.lead) head.append(libEl('p', 'lib-lead', v.lead));
  o.append(head);

  const body = libEl(
    'div',
    v.pages
      ? 'lib-body lib-pages'
      : v.adjust
      ? `lib-body adjust-body${v.adjust.menu ? '' : ' no-actions'}`
      : v.media
        ? `lib-body lib-media${v.media.large ? ' large' : ''}`
        : v.sections.length
          ? 'lib-body'
          : 'lib-body only-actions',
  );
  if (v.pages) body.append(renderPages(v.pages));
  else if (v.adjust) body.append(renderAdjust(v.adjust));
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
          li.classList.add('fixable');
          if (row.action === v.cursor) li.classList.add('selected');
          actOn(li, { type: 'activate', index: row.action });
        }
        const line = libEl('div', 'lib-row-line');
        line.append(libEl('span', 'lib-row-text', row.text));
        for (const badge of row.badges ?? []) line.append(libEl('span', 'badge', badge));
        li.append(line);
        if (row.detail) li.append(libEl('div', 'lib-row-detail', row.detail));
        list.append(li);
      }
      if (section.more > 0) list.append(libEl('li', 'lib-row more', `… et ${section.more} autre${section.more > 1 ? 's' : ''}`));
      box.append(list);
      content.append(box);
    }
    body.append(content);
  }

  // Prospectus et règles : les flippers tournent les pages ; les actions restent là pour la souris.
  const actions = libEl('ol', v.pages ? 'lib-actions pages-actions' : 'lib-actions');
  // Les actions montrées en cartes (un média, une page, un fichier) ne sont pas répétées dans la liste.
  const carded = new Set((v.media?.cards ?? []).map((c) => c.action).filter((a) => a !== undefined));
  v.actions.forEach((a, i) => {
    if (carded.has(i)) return;
    const li = actOn(libEl('li', `lib-action tone-${a.tone ?? 'none'}${i === v.cursor && !v.pages ? ' current' : ''}`), { type: 'activate', index: i });
    // Libellé en attribut : une démonstration clique une action par son nom, pas par son rang.
    li.dataset.label = a.label;
    li.append(libEl('span', 'label', a.label));
    if (a.detail) li.append(libEl('span', 'detail', a.detail));
    actions.append(li);
  });
  // Ajuster la vue : les actions n’apparaissent qu’avec le menu d’Exit.
  if (!v.adjust || v.adjust.menu) body.append(actions);
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
  for (const [label, value] of [['Fabricant', card.manufacturer], ['Année', card.year], ['Auteurs', card.authors], ['Version', card.version]]) {
    if (value === undefined || value === '') continue;
    facts.append(libEl('dt', '', label), libEl('dd', '', String(value)));
  }
  if (facts.childElementCount) sheet.append(facts);
  if (card.description) sheet.append(libEl('p', 'info-desc', card.description));
  sheet.append(libEl('p', 'pages-note', 'Pas de prospectus pour ce jeu : « Médias du jeu », sur la fiche, permet d’en ajouter.'));
  return sheet;
}

/** Règles absentes : les commandes de la partie, comme au chargement. */
function renderGameKeys(rows) {
  const box = libEl('div', 'game-keys pages-keys');
  box.append(libEl('h2', '', 'Commandes de la partie'));
  const list = libEl('div', 'game-keys-list');
  for (const [label, key] of rows) {
    const row = libEl('div', 'game-key');
    row.append(libEl('span', '', label), libEl('span', 'game-key-name', key));
    list.append(row);
  }
  box.append(list, libEl('p', 'pages-note', 'Pas de carte de règles pour ce jeu : « Médias du jeu », sur la fiche, permet d’en ajouter.'));
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
    if (c.where) line('media-where', 'Où', c.where);
    if (c.note) line('media-note', '', c.note);
    if (c.description) line('media-desc', 'Rôle', c.description);
    if (c.facts) line('media-facts', '', c.facts);
    if (c.pending) line('media-pending', '', c.pending);
    for (const extra of c.extra ?? []) line('media-extra', '', extra);
    li.append(text);
    list.append(li);
  }
  return list;
}

// « Ajuster la vue » : un réglage par carte, la carte choisie montre sa jauge et son aide.
function renderAdjust(a) {
  const box = libEl('div', `lib-content adjust${a.menu ? ' dimmed' : ''}`);
  if (a.notice) box.append(libEl('p', `adjust-notice tone-${a.notice.tone}`, a.notice.text));
  for (const note of a.notes) box.append(libEl('p', `adjust-notice tone-${note.tone}`, note.text));
  const list = libEl('ol', 'adjust-items');
  a.items.forEach((item, i) => {
    const li = actOn(libEl('li', `adjust-item${item.active ? ' active' : ''}${item.inactive ? ' inactive' : ''}`), { type: 'adjust', index: i });
    const top = libEl('div', 'adjust-top');
    top.append(libEl('span', 'adjust-label', item.label), libEl('span', `badge state-${item.stateId}`, item.state));
    li.append(top);
    const line = libEl('div', 'adjust-line');
    if (item.active) line.append(actOn(libEl('button', 'adjust-step', '−'), { type: 'key', code: a.keys.previous }));
    line.append(libEl('span', 'adjust-value', item.value));
    if (item.active) line.append(actOn(libEl('button', 'adjust-step', '+'), { type: 'key', code: a.keys.next }));
    li.append(line);
    if (item.options) {
      const options = libEl('div', 'adjust-options');
      item.options.forEach((label, k) => options.append(libEl('span', `adjust-option${k === item.at ? ' current' : ''}`, label)));
      li.append(options);
    } else {
      const gauge = libEl('div', 'adjust-gauge');
      const knob = libEl('span', 'knob');
      knob.style.left = `${(item.at / Math.max(1, item.steps - 1)) * 100}%`;
      gauge.append(knob);
      const ends = libEl('div', 'adjust-ends');
      ends.append(libEl('span', '', item.min), libEl('span', '', item.max));
      li.append(gauge, ends);
    }
    li.append(libEl('div', 'adjust-general', `Réglage général : ${item.general}`));
    if (item.inactive) li.append(libEl('p', 'adjust-help warn', item.inactive));
    if (item.active) li.append(libEl('p', 'adjust-help', item.help));
    list.append(li);
  });
  box.append(list, libEl('div', 'adjust-file', a.file));
  return box;
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
    const button = actOn(libEl('button', `key${wide}${i === e.cursor ? ' current' : ''}${k === 'Maj' && e.shift ? ' on' : ''}`, k), { type: 'editor', index: i });
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
  for (const node of document.querySelectorAll('.lib-row.selected, .lib-action.current, .key.current, .adjust-item.active, .media-card.selected')) {
    node.scrollIntoView({ block: 'nearest' });
  }
}
