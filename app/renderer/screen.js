// Affiche l'état envoyé par le processus principal. Aucune logique ici : tout
// est décidé dans main.ts, ce qui garde les écrans synchronisés.

const $ = (id) => document.getElementById(id);

// Étapes où un seul écran porte la question, les autres restent en retrait.
const STEP_PHASES = ['buttons', 'buttonsSummary', 'navigation', 'navigationSummary', 'plunger', 'tilt', 'assign', 'orient', 'flip', 'size', 'arrange', 'sound', 'channels', 'gate'];

function text(id, value) {
  $(id).textContent = value ?? '';
}

function list(title, items, classFor) {
  const section = document.createElement('div');
  const h = document.createElement('h2');
  h.textContent = title;
  const ul = document.createElement('ul');
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = typeof item === 'string' ? item : item.message;
    if (classFor) li.className = classFor(item);
    ul.append(li);
  }
  section.append(h, ul);
  return section;
}

// Étape « Boutons » : tous les boutons de la borne, et les actions. Tout est cliquable :
// une erreur de relevé se corrige à la souris, sans les boutons de la borne.
function renderButtons(state) {
  const list = $('buttons');
  const actions = $('actions');
  list.hidden = !state.buttons;
  actions.hidden = !state.actions;
  list.replaceChildren();
  actions.replaceChildren();
  for (const [index, b] of (state.buttons ?? []).entries()) {
    const li = document.createElement('li');
    li.className = `${b.state}${b.selected ? ' selected' : ''}${b.tried ? ' tried' : ''}`;
    li.dataset.act = JSON.stringify({ type: 'button', index });
    const label = document.createElement('span');
    label.textContent = b.label;
    const key = document.createElement('b');
    key.textContent = b.key;
    li.append(label, key);
    list.append(li);
  }
  for (const a of state.actions ?? []) {
    const button = document.createElement('button');
    button.textContent = a.label;
    button.className = a.selected ? 'selected' : '';
    button.dataset.act = JSON.stringify({ type: 'buttons', action: a.id });
    actions.append(button);
  }
}

// Étape « Lanceur » : la position du lanceur telle que VPX la lira, de l'avant (-1/3) à tiré
// à fond (1), le repos au quart de la piste ; le plus grand recul depuis le dernier tir.
const GAUGE_REST = 0.25;
function renderGauge(state) {
  const g = state.phase === 'plunger' ? state.gauge : undefined;
  const box = $('gauge');
  box.hidden = !g;
  if (!g) return;
  const at = (p) => GAUGE_REST + p * (1 - GAUGE_REST);
  const fill = $('gauge-fill');
  const from = Math.min(at(0), at(g.position));
  fill.style.left = `${from * 100}%`;
  fill.style.width = `${Math.abs(at(g.position) - at(0)) * 100}%`;
  const peak = $('gauge-peak');
  peak.hidden = !(g.peak > 0.02);
  peak.style.left = `${at(g.peak) * 100}%`;
  box.classList.toggle('missing', Boolean(g.missing));
  text('gauge-label', g.label);
}

// Étape « Tilt » : le balancier vu de dessus, dans l'anneau du contact (rayon 1), comme
// l'affiche VPX en partie (PlumbOverlay) ; l'anneau s'allume à chaque contact, « TILT » dessous.
// Le balancier de la borne n'a pas de position à montrer : l'anneau s'allume seulement.
function renderPlumb(state) {
  const p = state.phase === 'tilt' ? state.plumb : undefined;
  const box = $('plumb');
  box.hidden = !p;
  if (!p) return;
  const ring = $('plumb-ring');
  ring.classList.toggle('contact', Boolean(p.contact));
  ring.classList.toggle('missing', Boolean(p.missing));
  const bob = $('plumb-bob');
  const rod = $('plumb-rod');
  bob.hidden = !p.simulated;
  rod.hidden = !p.simulated;
  if (p.simulated) {
    // Centre à 50 %, l'anneau au bord : x et y vont de -1 à 1.
    bob.style.left = `${50 + p.x * 50}%`;
    bob.style.top = `${50 + p.y * 50}%`;
    rod.style.width = `${Math.hypot(p.x, p.y) * 50}%`;
    rod.style.transform = `rotate(${Math.atan2(p.y, p.x)}rad)`;
  }
  // Au contact, « TILT » sous l'anneau, à la place de sa légende : rien ne recouvre le point.
  text('plumb-label', p.label);
  const caption = $('plumb-caption');
  caption.classList.toggle('contact', Boolean(p.contact));
  text('plumb-caption', p.contact ? 'TILT' : p.caption);
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (target) window.cyber.act(JSON.parse(target.dataset.act));
});

// Le pointeur n'apparaît que quand on bouge la souris.
let pointerTimer;
document.addEventListener('mousemove', () => {
  document.body.classList.add('pointer');
  clearTimeout(pointerTimer);
  pointerTimer = setTimeout(() => document.body.classList.remove('pointer'), 3000);
});

// Parts d'écran (rôles qui partagent cet écran) : cadres en fractions de l'image, sans
// rotation, là où VPX les affichera. La disposition proposée est en pointillés.
function renderZones(state) {
  const layer = $('zones');
  layer.style.setProperty('--screen-color', state.color);
  layer.replaceChildren(
    ...(state.zones ?? []).map((part) => {
      const box = document.createElement('div');
      box.className = ['zone', part.candidate && 'candidate', part.editable && 'editable', part.selected && 'selected'].filter(Boolean).join(' ');
      box.style.left = `${part.zone.x * 100}%`;
      box.style.top = `${part.zone.y * 100}%`;
      box.style.width = `${part.zone.width * 100}%`;
      box.style.height = `${part.zone.height * 100}%`;
      // L'étiquette est un vrai texte de la page, pas un ::before : le garde-fou de mise en page
      // (layout-check.ts) la voit, et voit ce qui la recouvrirait.
      const label = document.createElement('span');
      label.className = 'zone-label';
      label.textContent = part.label;
      box.append(label);
      if (part.editable) {
        box.dataset.role = part.role;
        // Coins à tirer pour redimensionner ; le reste de la zone se tire pour la déplacer.
        for (const corner of ['nw', 'ne', 'sw', 'se']) {
          const handle = document.createElement('div');
          handle.className = `handle ${corner}`;
          handle.dataset.handle = corner;
          box.append(handle);
        }
      }
      return box;
    }),
  );
}

// Étiquette d'une zone : dans le premier coin de sa zone que rien de l'écran ne recouvre (textes,
// boutons, panneau de la disposition, étiquettes déjà posées). En haut à gauche d'ordinaire ;
// sur un playfield pivoté de 270°, le panneau rangé « en haut » de l'écran tourné passe à gauche
// et coupait l'étiquette du playfield (novembre 2026). Sans coin libre, celui qui en cache le moins.
const LABEL_CORNERS = ['nw', 'ne', 'sw', 'se'];
function screenObstacles() {
  const root = $('screen');
  const rects = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) {
    if (!n.textContent.trim() || !n.parentElement.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    rects.push(...range.getClientRects());
  }
  for (const el of root.querySelectorAll('button, .arrange, .panel, .quit-dialog')) if (el.checkVisibility({ checkVisibilityCSS: true })) rects.push(el.getBoundingClientRect());
  return rects.filter((r) => r.width > 1 && r.height > 1);
}
const overlapArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
function placeZoneLabels() {
  const labels = [...document.querySelectorAll('#zones .zone-label')];
  if (!labels.length) return;
  const obstacles = screenObstacles();
  for (const label of labels) {
    let best = LABEL_CORNERS[0];
    let least = Infinity;
    for (const corner of LABEL_CORNERS) {
      label.dataset.corner = corner;
      const r = label.getBoundingClientRect();
      const area = obstacles.reduce((sum, o) => sum + overlapArea(r, o), 0);
      if (area < least) [best, least] = [corner, area];
      if (area === 0) break;
    }
    label.dataset.corner = best;
    obstacles.push(label.getBoundingClientRect());
  }
}
// La fenêtre changée de taille (ou, à chaque rendu, les polices chargées), les textes ont bougé.
window.addEventListener('resize', placeZoneLabels);

// Étape « Disposition » : une zone tirée à la souris. Le rectangle part toujours de
// celui du début du geste (pas d'erreur qui s'accumule) ; le processus principal le
// ramène dans l'écran, au format verrouillé, et l'aimante (sauf Alt). Le pointeur est
// aussi donné en fractions de cette fenêtre, hors de 0..1 quand il l'a quittée (elle le
// garde jusqu'au relâchement) : tirée hors de son écran, la zone passe sur l'écran visé.
// Jamais de coordonnées du bureau : en DIP ici, en pixels physiques côté principal.
let drag;
let pendingDrag;
document.addEventListener('pointerdown', (event) => {
  const zone = event.target.closest('.zone.editable');
  if (!zone) return;
  const r = zone.getBoundingClientRect();
  const handle = event.target.closest('.handle')?.dataset.handle ?? 'move';
  drag = { role: zone.dataset.role, handle, x0: event.clientX, y0: event.clientY, r };
  try {
    zone.setPointerCapture(event.pointerId);
  } catch {
    // Événement rejoué sans vrai pointeur : la suite du geste arrive quand même au document.
  }
  window.cyber.act({ type: 'arrange', op: 'select', role: drag.role });
  event.preventDefault();
});
document.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.x0;
  const dy = event.clientY - drag.y0;
  const { left, top, width, height } = drag.r;
  const h = drag.handle;
  const x = h === 'move' || h === 'nw' || h === 'sw' ? left + dx : left;
  const y = h === 'move' || h === 'nw' || h === 'ne' ? top + dy : top;
  const w = h === 'move' ? width : h === 'nw' || h === 'sw' ? width - dx : width + dx;
  const hh = h === 'move' ? height : h === 'nw' || h === 'ne' ? height - dy : height + dy;
  const first = !pendingDrag;
  pendingDrag = {
    role: drag.role,
    handle: h,
    rect: { x: x / innerWidth, y: y / innerHeight, width: w / innerWidth, height: hh / innerHeight },
    pointer: { x: event.clientX / innerWidth, y: event.clientY / innerHeight },
    free: event.altKey,
  };
  if (first) {
    requestAnimationFrame(() => {
      window.cyber.act({ type: 'arrange', op: 'drag', ...pendingDrag });
      pendingDrag = undefined;
    });
  }
});
document.addEventListener('pointerup', () => {
  drag = undefined;
});

function actButton(label, act, className) {
  const button = document.createElement('button');
  button.textContent = label;
  button.dataset.act = JSON.stringify(act);
  if (className) button.className = className;
  return button;
}

// Panneau de l'étape « Disposition », sur l'écran du playfield : chaque ligne est
// cliquable, et la ligne ouverte a ses boutons (◀ ▶, − +, Valider, Annuler).
function renderArrange(state) {
  const box = $('arrange');
  const a = state.arrange;
  document.body.classList.toggle('arranging', state.phase === 'arrange');
  box.hidden = !a;
  box.replaceChildren();
  box.classList.toggle('dock-top', a?.dock === 'top');
  box.classList.toggle('dock-bottom', a?.dock === 'bottom');
  if (!a) return;
  const title = document.createElement('h2');
  title.textContent = a.title;
  const detail = document.createElement('p');
  detail.className = 'arrange-detail';
  detail.textContent = a.detail;
  const items = document.createElement('ol');
  items.className = 'arrange-items';
  a.items.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = [item.selected && 'selected', item.open && 'open', item.disabled && 'disabled'].filter(Boolean).join(' ');
    li.dataset.act = JSON.stringify({ type: 'arrange', op: 'item', index });
    const label = document.createElement('span');
    label.textContent = item.label;
    const value = document.createElement('b');
    value.textContent = item.value;
    li.append(label, value);
    items.append(li);
  });
  box.append(title, detail, items);
  const open = a.items.find((i) => i.open);
  if (open) {
    const controls = document.createElement('div');
    controls.className = 'arrange-controls';
    const current = a.choices?.find((c) => c.selected);
    controls.append(actButton('◀', { type: 'arrange', op: 'step', delta: -1 }));
    if (current) {
      const span = document.createElement('span');
      span.textContent = current.label;
      controls.append(span);
    }
    controls.append(actButton('▶', { type: 'arrange', op: 'step', delta: 1 }), actButton(t('Valider'), { type: 'arrange', op: 'confirm' }, 'primary'), actButton(t('Annuler'), { type: 'arrange', op: 'cancel' }));
    box.append(controls);
  }
  for (const [text, className] of [[a.notice, 'arrange-notice'], [a.hint, 'arrange-hint'], [a.mouse, 'arrange-mouse'], [a.order, 'arrange-order']]) {
    if (!text) continue;
    const p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    box.append(p);
  }
  if (a.findings?.length) box.append(list(t('Points à vérifier'), a.findings, (f) => `finding-${f.severity}`));
}

/**
 * Le panneau ne défile pas (une borne n'a pas de molette) : tant qu'il déborde, le
 * corps rapetisse d'un cran. Au dernier cran, le garde-fou de l'autopilote signale
 * ce qui reste coupé.
 */
function fitPanel(panel) {
  panel.classList.remove('dense', 'denser');
  for (const size of ['dense', 'denser']) {
    if (panel.scrollHeight <= panel.clientHeight + 1) return;
    panel.classList.remove('dense', 'denser');
    panel.classList.add(size);
  }
}

// « Quitter sans enregistrer » : le bouton à chaque étape, la question (ce qui serait
// perdu, où l'on va) et l'écran de sortie, par-dessus tout le reste.
function renderQuit(state) {
  const q = state.quit;
  const button = $('quit');
  button.hidden = !q?.button;
  button.textContent = q?.button ?? '';
  // Le geste qui marche à cette étape, toujours dit : sans lui, personne ne sait qu'Exit maintenu sort.
  if (q?.how && !q.holding) {
    const how = document.createElement('small');
    how.className = 'quit-how';
    how.textContent = q.how;
    button.append(how);
  }
  button.classList.toggle('holding', Boolean(q?.holding));
  const box = $('quit-dialog');
  const shown = q?.dialog ?? (q?.leaving && { title: t('Sortie sans enregistrer'), destination: q.leaving });
  box.hidden = !shown;
  box.replaceChildren();
  if (!shown) return;
  const title = document.createElement('h2');
  title.textContent = shown.title;
  box.append(title);
  if (shown.lines) box.append(list(shown.lead || t('Changements'), shown.lines));
  const destination = document.createElement('p');
  destination.className = 'quit-destination';
  destination.textContent = shown.destination;
  box.append(destination);
  if (!q.dialog) return;
  const choices = document.createElement('div');
  choices.className = 'quit-choices';
  choices.append(actButton(t('Quitter sans enregistrer'), { type: 'quit', op: 'yes' }, 'primary'), actButton(t('Continuer'), { type: 'quit', op: 'no' }));
  const hint = document.createElement('p');
  hint.className = 'quit-hint';
  hint.textContent = q.dialog.hint;
  box.append(choices, hint);
}

function render(state) {
  const root = $('screen');
  renderQuit(state);
  renderZones(state);
  renderArrange(state);
  root.classList.toggle('arrange-step', state.phase === 'arrange');
  root.style.setProperty('--screen-color', state.color);
  root.classList.toggle('highlight', Boolean(state.highlight));
  root.classList.toggle('dim', STEP_PHASES.includes(state.phase) && !state.highlight);
  root.classList.toggle('measuring', state.measure !== undefined);
  // Panneau (récapitulatif, résultat) : sur le playfield, sauf quand l'état en décide (étape « Boutons »).
  const report = state.report ?? (['summary', 'done'].includes(state.phase) && state.assignedRole === 'playfield');
  root.classList.toggle('report', report);
  root.classList.toggle('buttons', ['buttons', 'buttonsSummary', 'navigation', 'navigationSummary', 'plunger', 'tilt'].includes(state.phase));
  // Lanceur et tilt : une colonne de réglages sous la jauge ou le balancier.
  root.classList.toggle('plunger', state.phase === 'plunger' || state.phase === 'tilt');
  renderButtons(state);
  renderGauge(state);
  renderPlumb(state);
  root.classList.toggle('orient', ['orient', 'flip'].includes(state.phase) && state.highlight);
  root.classList.toggle('sound', ['sound', 'channels'].includes(state.phase) && state.highlight);
  for (const angle of [90, 180, 270]) root.classList.toggle(`rot-${angle}`, state.rotation === angle);

  text('number', state.number);
  text('name', state.name);
  text('details', state.details);
  text('hint', state.hint);
  $('notice').hidden = !state.notice;
  text('notice', state.notice);

  $('edge').hidden = !(['orient', 'flip'].includes(state.phase) && state.highlight);
  $('measure').hidden = state.measure === undefined;
  text('measure', state.measure);
  if (STEP_PHASES.includes(state.phase)) {
    text('prompt', state.highlight ? state.prompt : (state.assignedLabel ?? ''));
    text('step', state.step);
  } else {
    text('prompt', state.title ?? state.assignedLabel ?? t('Aucun rôle'));
    text('step', state.phase === 'summary' ? t('Récapitulatif') : t('Configuration enregistrée'));
  }

  // Le récapitulatif et le résultat s'affichent sur l'écran du playfield, qui est
  // celui que le joueur regarde ; les autres écrans montrent seulement leur rôle.
  const panel = $('panel');
  panel.replaceChildren();
  panel.hidden = !report;
  if (!panel.hidden) {
    // Colonne de gauche : les rôles (ou les boutons) ; à droite : le diff. Les points à vérifier,
    // puis le fichier écrit et sa sauvegarde, vont là où le panneau reste le moins haut : sous la
    // gauche, sous la droite ou sur toute la largeur. Toujours à gauche, vingt et un boutons et
    // leurs points à vérifier étaient coupés quand la droite restait presque vide (boutons de la
    // porte, 12/11/2026).
    const columns = state.columns ?? {};
    const left = document.createElement('div');
    left.append(list(columns.left ?? t('Rôles'), state.summary));
    const right = document.createElement('div');
    right.append(list(columns.right ?? (state.phase === 'summary' ? t('Modifications prévues') : t('Modifications écrites')), state.lines));
    panel.append(left, right);
    // Les colonnes s'étirent à la hauteur de la rangée : c'est le bas de leur contenu qui compte.
    const bottom = (box) => box.lastElementChild?.getBoundingClientRect().bottom ?? 0;
    const place = (nodes) => {
      let best;
      for (const box of [left, right, panel]) {
        // Sur toute la largeur : sous les deux colonnes, d'un bord à l'autre.
        for (const node of nodes) node.classList.toggle('wide', box === panel);
        box.append(...nodes);
        const height = Math.max(bottom(left), bottom(right), bottom(panel));
        if (!best || height < best.height) best = { box, height };
      }
      for (const node of nodes) node.classList.toggle('wide', best.box === panel);
      best.box.append(...nodes);
    };
    if (state.findings.length) place([list(t('Points à vérifier'), state.findings, (f) => `finding-${f.severity}`)]);
    const paths = [];
    if (state.target) {
      const target = document.createElement('p');
      target.innerHTML = t('Fichier : <code></code>');
      target.querySelector('code').textContent = state.target;
      paths.push(target);
    }
    if (state.backup) {
      const backup = document.createElement('p');
      backup.innerHTML = t('Ancienne version : <code></code>');
      backup.querySelector('code').textContent = state.backup;
      paths.push(backup);
    }
    for (const path of paths) place([path]);
    fitPanel(panel);
  }
  placeZoneLabels();
  document.fonts.ready.then(placeZoneLabels);
}

window.cyber.onState(render);
window.cyber.ready();
