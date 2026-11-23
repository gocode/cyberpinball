// Mode débogage (app/src/debogage.ts) : la page dessine ce que le processus principal lui envoie, textes déjà
// traduits (packages/core/src/debogage.ts, buildDebugView) ; elle ne calcule rien et ne reçoit aucun geste.

const frame = document.getElementById('frame');
const panel = document.getElementById('panel');
const line = document.getElementById('line');

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** La classe d'un ton : « av » (ralenti) ou « ko » (bloquant) ; rien quand tout va bien. */
const toneClass = (tone) => (tone === 'av' || tone === 'ko' ? tone : '');

function add(node, ...cls) {
  for (const c of cls) if (c) node.classList.add(c);
  return node;
}

/** Le cadre vu du joueur, à l'échelle de l'écran : dessiné pour un petit côté de 1 080 px. */
function placeFrame(state) {
  const turn = Number.isFinite(state.rotation) ? ((state.rotation % 360) + 360) % 360 : 0;
  frame.style.setProperty('--w', `${state.design.width}px`);
  frame.style.setProperty('--h', `${state.design.height}px`);
  frame.style.setProperty('--turn', `${turn}deg`);
  frame.style.setProperty('--unit', String(state.unit));
}

function renderLine(view, bar) {
  line.classList.toggle('bar', bar);
  const dot = el('i', `dot ${toneClass(view.tone)}`);
  const nodes = [dot];
  view.parts.forEach((part, index) => {
    if (index) nodes.push(el('i', 'sep'));
    const span = el('span', toneClass(part.tone));
    span.append(document.createTextNode(part.text));
    if (part.muted) span.append(document.createTextNode(' '), el('span', 'mu', part.muted));
    nodes.push(span);
  });
  line.replaceChildren(...nodes);
  line.hidden = false;
  panel.hidden = true;
}

function secTitle(title, sub) {
  const head = el('div', 'sec-title');
  head.append(el('span', '', title));
  if (sub) head.append(el('small', '', sub));
  return head;
}

function alertBox(alert) {
  const box = el('div', `alert ${toneClass(alert.tone)}`);
  box.append(cyberIcon('alert'), el('div', '', alert.text));
  return box;
}

function cadenceBlock(block) {
  const sec = el('div', 'sec');
  sec.append(secTitle(block.title, block.sub));
  const top = el('div', 'cad-top');
  const value = el('div', `cad-value ${toneClass(block.tone)}`, block.value);
  value.append(el('small', '', block.unit));
  const state = el('div', 'cad-state');
  state.append(el('b', toneClass(block.statusTone), block.status), document.createTextNode(block.about));
  top.append(value, state);
  sec.append(top);
  // Les barres de la minute : une par seconde, échelle de zéro à la fréquence visée ; repère au-dessus d'une seconde à-coup.
  const graph = el('div', 'graph');
  const bars = block.bars.slice(-60);
  const empty = 60 - bars.length;
  for (let i = 0; i < empty; i++) graph.append(el('div', 'col'));
  bars.forEach((bar, i) => {
    const col = el('div', `col${i === bars.length - 1 ? ' last' : ''}`);
    const fill = el('div', `fill ${toneClass(bar.tone)}`);
    // Hauteur : la part de la fréquence visée, sous le haut du graphe (12 px de marge pour la ligne et les repères).
    fill.style.setProperty('height', `calc(${Math.max(3 / 84, Math.min(1, bar.v / block.scale))} * (100% - 12px))`);
    col.append(fill);
    if (bar.stall) col.append(el('div', 'mark'));
    graph.append(col);
  });
  sec.append(graph);
  const axis = el('div', 'axis');
  for (const label of block.axis) axis.append(el('span', '', label));
  sec.append(axis);
  const stats = el('div', 'stats');
  for (const stat of block.stats) {
    const span = el('span', '', `${stat.label} `);
    span.append(el('b', toneClass(stat.tone), stat.value));
    stats.append(span);
  }
  sec.append(stats);
  if (block.alert) sec.append(alertBox(block.alert));
  return sec;
}

function screensBlock(block) {
  const sec = el('div', 'sec');
  sec.append(secTitle(block.title, block.sub));
  const grid = el('div', `grid c${block.cols.length}`);
  block.cols.forEach((col, i) => grid.append(el('span', `col${i ? ' num' : ''}`, col)));
  if (block.cols.length === 3) grid.lastChild.classList.remove('num');
  for (const row of block.rows) {
    const name = el('span', `cell n${row.absent ? ' absent' : ''}`, row.name);
    if (row.detail) name.append(el('small', '', row.detail));
    grid.append(name);
    row.cells.forEach((cell, i) => grid.append(el('span', `cell${block.cols.length === 3 && i === 1 ? '' : ' num'} ${toneClass(cell.tone)}${row.absent ? ' absent' : ''}`, cell.text)));
  }
  sec.append(grid);
  if (block.alert) sec.append(alertBox(block.alert));
  return sec;
}

function kvBlock(block) {
  const sec = el('div', 'sec');
  sec.append(secTitle(block.title, block.sub));
  const grid = el('div', 'kv');
  for (const row of block.rows) {
    grid.append(el('span', `k${row.total ? ' total' : ''}`, row.k), el('span', 's', row.s ?? ''), el('span', `v${row.total ? ' total' : ''} ${toneClass(row.tone)}`, row.v));
  }
  sec.append(grid);
  return sec;
}

function stateIcon(state) {
  if (state === 'ok') return cyberIcon('check');
  if (state === 'current') return cyberIcon('clock');
  return el('i', 'wait-dot');
}
function chronoBlock(block) {
  const sec = el('div', 'sec');
  sec.append(secTitle(block.title, block.sub));
  const grid = el('div', 'chrono');
  for (const row of block.rows) {
    const key = el('span', 'k', row.k);
    if (row.small) key.append(el('small', '', row.small));
    const icon = el('span', '');
    icon.append(stateIcon(row.state));
    // Chaque ligne est un bloc à part pour porter son état.
    const wrap = el('div', row.state === 'current' ? 'current' : row.state === 'wait' ? 'wait' : '');
    wrap.append(icon, key, el('span', 'v', row.v));
    grid.append(wrap);
  }
  sec.append(grid);
  if (block.note) sec.append(el('div', 'note', block.note));
  return sec;
}

function renderPanel(view) {
  const head = el('div', 'head');
  head.append(el('span', 'name', view.head.name), el('span', 'ctx', view.head.context), el('span', 'time', view.head.time));
  const blocks = view.blocks.map((block) => {
    if (block.kind === 'cadence') return cadenceBlock(block);
    if (block.kind === 'screens') return screensBlock(block);
    if (block.kind === 'chrono') return chronoBlock(block);
    return kvBlock(block);
  });
  panel.classList.toggle('reduced', view.layout === 'reduced');
  panel.replaceChildren(head, ...blocks);
  panel.hidden = false;
  line.hidden = true;
}

window.cyberNotice.onState((state) => {
  const view = state?.view;
  if (!view) {
    panel.hidden = true;
    line.hidden = true;
    return;
  }
  placeFrame(state);
  if (view.layout === 'bar') renderLine(view, true);
  else if (view.layout === 'compact') renderLine(view, false);
  else renderPanel(view);
});
