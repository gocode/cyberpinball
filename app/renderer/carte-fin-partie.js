// Carte de fin de partie (carte-fin-partie.ts), tournée comme la mise en page du plateau. Ce qu'elle
// montre (cartefinpartie.ts, endCardView) arrive du processus principal, textes déjà traduits : le
// score, le top 3 du pays et la ligne du joueur, sa place au monde, et les deux flips.

const frame = document.getElementById('frame');
const card = document.getElementById('card');
const rows = document.getElementById('rows');
const text = (id, value) => {
  document.getElementById(id).textContent = value ?? '';
};
document.getElementById('icon').append(cyberIcon('trophy'));
document.getElementById('left-icon').append(cyberIcon('crossed-flippers'));
document.getElementById('left-chevron').append(cyberIcon('chevron-left'));
document.getElementById('right-chevron').append(cyberIcon('chevron-right'));

/** Le cadre vu du joueur : la fenêtre est couchée quand le plateau l'est. */
function turnFrame(rotation) {
  const turn = Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0;
  const quarter = turn === 90 || turn === 270;
  frame.style.setProperty('--w', `${quarter ? window.innerHeight : window.innerWidth}px`);
  frame.style.setProperty('--h', `${quarter ? window.innerWidth : window.innerHeight}px`);
  frame.style.setProperty('--turn', `${turn}deg`);
}

function span(cls, value) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = value ?? '';
  return s;
}

/** Un vrai drapeau (jamais deux lettres) : l'image du pays, son nom en titre. */
function flag(view) {
  const img = document.createElement('img');
  img.className = 'flag';
  img.alt = view?.name ?? '';
  img.title = view?.name ?? '';
  if (view?.src) img.src = view.src;
  return img;
}

function row(cls, ...children) {
  const div = document.createElement('div');
  div.className = `row ${cls}`;
  div.append(...children);
  return div;
}

function render(state) {
  const view = state?.view;
  if (!view) {
    card.hidden = true;
    return;
  }
  turnFrame(state.rotation);
  card.classList.toggle('record', !!view.record);
  text('title', view.title);
  text('table', view.table);
  text('score', view.score);
  const list = [];
  if (view.board) {
    list.push(row('block', span('rank', ''), view.board.flag ? flag(view.board.flag) : span('flag-space', ''), span('label', view.board.title)));
    for (const l of view.board.lines) list.push(row(l.mine ? 'line mine' : 'line', span('rank', l.rank), flag(l.flag), span('name', l.name), span('points', l.score)));
  }
  if (view.world) list.push(row('world', span('label', view.world.label), span('value', view.world.value)));
  if (view.off) list.push(row('wide off', span('label', view.off)));
  if (view.note) list.push(row('wide note', span('label', view.note)));
  rows.replaceChildren(...list);
  text('left-hint', view.left?.hint);
  text('left-label', view.left?.label);
  // La raison déjà affichée au-dessus ne se répète pas sous le défi grisé.
  text('left-off', view.left?.off && view.left.off !== view.off ? view.left.off : '');
  document.getElementById('left').classList.toggle('off', !!view.left?.off);
  text('right-hint', view.right?.hint);
  text('right-label', view.right?.label);
  card.hidden = false;
}

let last;
window.cyberNotice?.onState((state) => {
  last = state;
  render(state);
});
window.addEventListener('resize', () => render(last));
