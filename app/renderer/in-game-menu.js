// Réglages en partie (in-game-menu.ts, packages/core/src/dmdplace.ts) : une page par écran de la
// borne, transparente, par-dessus VPX en pause. Sur l'écran qui porte le DMD, son cadre : tiré à la
// souris pour le déplacer (jusque sur un autre écran), par un coin pour le redimensionner. Sur
// l'écran du plateau, le panneau, posé dans la zone du plateau et tourné vers le joueur, du côté
// opposé au DMD quand il est sur le même écran. Ce qu'elle montre arrive du processus principal,
// textes déjà traduits ; elle ne renvoie que les gestes de la souris.

const $ = (id) => document.getElementById(id);
const frame = $('frame');
const zoneBox = $('zone');
const turn = $('turn');
$('panel-icon').append(cyberIcon('dmd'));

/** Dernier état reçu. */
let state;

function act(action) {
  window.cyberInGame.act(action);
}

/** Cadre du DMD, en fractions de l'écran, là où VPX le montre. */
function renderFrame(f) {
  // Parti sur un autre écran pendant un geste : le cadre reste là, invisible, pour garder le pointeur.
  frame.hidden = !f && !drag;
  frame.classList.toggle('away', !f);
  if (!f) return;
  frame.classList.toggle('hidden-dmd', Boolean(f.hidden));
  frame.style.left = `${f.zone.x * 100}%`;
  frame.style.top = `${f.zone.y * 100}%`;
  frame.style.width = `${f.zone.width * 100}%`;
  frame.style.height = `${f.zone.height * 100}%`;
  const label = $('frame-label');
  label.textContent = f.label;
  // Étiquette sous le cadre ; dessus quand la place manque en bas ; dedans quand le DMD prend tout
  // l'écran en hauteur (la bande DMD d'une borne).
  const need = (label.offsetHeight + 16) / innerHeight;
  const below = 1 - (f.zone.y + f.zone.height);
  frame.dataset.label = below >= need ? 'below' : f.zone.y >= need ? 'above' : 'inside';
}

/** Places du panneau, vues du joueur, après celle qu'on préfère (dockFor). */
const DOCKS = ['bottom', 'top', 'middle', 'bottom-left', 'bottom-right', 'top-left', 'top-right', 'left', 'right'];

/**
 * Côté préféré du panneau, vu du joueur : à l'opposé du DMD. La hauteur du joueur dépend du sens
 * du plateau (rotation de la page : 90° met le haut du joueur à droite de l'écran).
 */
function dockFor(f, rotation) {
  const cx = f.zone.x + f.zone.width / 2;
  const cy = f.zone.y + f.zone.height / 2;
  const r = ((rotation % 360) + 360) % 360;
  const playerY = r === 90 ? 1 - cx : r === 180 ? 1 - cy : r === 270 ? cx : cy;
  return playerY < 0.5 ? 'bottom' : 'top';
}

const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/**
 * Le panneau ne cache jamais le DMD qu'on règle quand il est sur le même écran : chaque place est
 * essayée (mesurée après rotation), la première qui laisse voir le cadre et son étiquette est gardée,
 * sinon celle qui en cache le moins.
 */
function placePanel(s) {
  if (!s.frame) {
    turn.dataset.dock = 'middle';
    return;
  }
  const preferred = dockFor(s.frame, s.rotation);
  const order = [preferred, ...DOCKS.filter((d) => d !== preferred)];
  let best;
  // L'étiquette où renderFrame l'a mise, puis dans le cadre si le panneau la toucherait partout.
  for (const label of [frame.dataset.label, 'inside']) {
    frame.dataset.label = label;
    const f = frame.getBoundingClientRect();
    const l = $('frame-label').getBoundingClientRect();
    const margin = 12;
    const target = { left: Math.min(f.left, l.left) - margin, top: Math.min(f.top, l.top) - margin, right: Math.max(f.right, l.right) + margin, bottom: Math.max(f.bottom, l.bottom) + margin };
    for (const dock of order) {
      turn.dataset.dock = dock;
      const covered = overlap($('panel').getBoundingClientRect(), target);
      if (covered === 0) return;
      if (!best || covered < best.covered) best = { dock, label, covered };
    }
  }
  frame.dataset.label = best.label;
  turn.dataset.dock = best.dock;
}

/** Une ligne du menu ; `notice` : la nouvelle du bas du panneau, que la ligne ne répète pas. */
function row(item, notice) {
  const li = document.createElement('li');
  li.className = ['row', item.selected && 'selected', item.open && 'open', item.disabled && 'disabled'].filter(Boolean).join(' ');
  li.addEventListener('click', () => act({ op: 'item', index: item.index }));
  const label = document.createElement('span');
  label.className = 'row-label';
  label.textContent = item.label;
  li.append(label);
  if (item.open) {
    // Ligne ouverte : − et + à la souris.
    for (const [text, delta] of [['◀', -1], ['▶', 1]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'step';
      button.textContent = text;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        act({ op: 'step', delta });
      });
      if (delta === -1) li.append(button);
      else {
        const value = document.createElement('b');
        value.className = 'row-value';
        value.textContent = item.value;
        li.append(value, button);
      }
    }
  } else if (item.value) {
    const value = document.createElement('b');
    value.className = 'row-value';
    value.textContent = item.value;
    li.append(value);
  }
  if (item.selected && item.disabled && item.disabled !== notice) {
    const why = document.createElement('span');
    why.className = 'row-why';
    why.textContent = item.disabled;
    li.append(why);
  }
  return li;
}

function renderPanel(s) {
  zoneBox.hidden = !s.panel;
  if (!s.panel) return;
  const p = s.panel;
  zoneBox.style.left = `${s.zone.x * 100}%`;
  zoneBox.style.top = `${s.zone.y * 100}%`;
  zoneBox.style.width = `${s.zone.width * 100}%`;
  zoneBox.style.height = `${s.zone.height * 100}%`;
  // Cadre vu du joueur : couché quand le plateau l'est.
  const r = ((s.rotation % 360) + 360) % 360;
  const quarter = r === 90 || r === 270;
  const w = s.zone.width * innerWidth;
  const h = s.zone.height * innerHeight;
  turn.style.setProperty('--w', `${quarter ? h : w}px`);
  turn.style.setProperty('--h', `${quarter ? w : h}px`);
  turn.style.setProperty('--turn', `${r}deg`);
  $('title').textContent = p.title;
  $('detail').textContent = p.detail;
  $('sections').replaceChildren(
    ...p.sections.map((section) => {
      const box = document.createElement('div');
      box.className = 'section';
      if (section.title) {
        const h2 = document.createElement('h2');
        h2.textContent = section.title;
        box.append(h2);
      }
      const ol = document.createElement('ol');
      ol.className = 'rows';
      ol.append(...section.items.map((item) => row(item, p.notice)));
      box.append(ol);
      return box;
    }),
  );
  const choices = $('choices');
  choices.hidden = !p.choices;
  choices.replaceChildren(
    ...(p.choices ?? []).map((c) => {
      const li = document.createElement('li');
      li.className = c.selected ? 'selected' : '';
      li.textContent = c.label;
      return li;
    }),
  );
  for (const [id, text] of [['live', p.live], ['notice', p.notice]]) {
    $(id).hidden = !text;
    $(id).textContent = text ?? '';
  }
  $('hint').textContent = p.hint;
  $('mouse').textContent = p.mouse;
  const leaving = $('leaving');
  leaving.hidden = !p.leaving;
  if (p.leaving) {
    $('leaving-title').textContent = p.leaving.title;
    $('leaving-hint').textContent = p.hint;
    $('leaving-choices').replaceChildren(
      ...p.leaving.choices.map((c, index) => {
        const li = document.createElement('li');
        li.className = c.selected ? 'selected' : '';
        li.textContent = c.label;
        li.addEventListener('click', () => act({ op: 'leave', index }));
        return li;
      }),
    );
  }
  placePanel(s);
}

window.cyberInGame.onState((s) => {
  state = s;
  renderFrame(s.frame);
  renderPanel(s);
  document.body.classList.toggle('dirty', Boolean(s.dirty));
});

// Le DMD tiré à la souris. Le rectangle part toujours de celui du début du geste ; le processus
// principal le ramène dans l'écran, au format verrouillé, et l'aimante (sauf Alt). Le pointeur est
// aussi donné en fractions de cette fenêtre, hors de 0..1 quand il l'a quittée : tiré hors de son
// écran, le DMD passe sur l'écran visé (planDrag, packages/core/src/zones.ts).
let drag;
let pending;
frame.addEventListener('pointerdown', (event) => {
  if (state?.frame?.hidden) return;
  const handle = event.target.closest('.handle')?.dataset.handle ?? 'move';
  drag = { handle, x0: event.clientX, y0: event.clientY, r: frame.getBoundingClientRect() };
  try {
    frame.setPointerCapture(event.pointerId);
  } catch {
    // Événement rejoué sans vrai pointeur : la suite du geste arrive quand même.
  }
  act({ op: 'grab', screen: state?.screen ?? 0 });
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
  const first = !pending;
  pending = {
    op: 'drag',
    handle: h,
    rect: { x: x / innerWidth, y: y / innerHeight, width: w / innerWidth, height: hh / innerHeight },
    pointer: { x: event.clientX / innerWidth, y: event.clientY / innerHeight },
    free: event.altKey,
  };
  if (first) {
    requestAnimationFrame(() => {
      act(pending);
      pending = undefined;
    });
  }
});
document.addEventListener('pointerup', () => {
  drag = undefined;
  if (!state?.frame) frame.hidden = true;
});
