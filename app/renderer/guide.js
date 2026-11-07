// Guide du jeu (packages/core/src/tableguide.ts, app/src/table-rules.ts) : une page du guide dans le
// livret des règles. L'écran est dessiné à une taille fixe, en hauteur (borne : 1080 × 1860) ou en
// largeur (bureau : 1760 × 960) selon la place, puis mis à l'échelle de la page : le plateau, ses
// coups numérotés, les étiquettes dans ses marges et le texte gardent leurs proportions.
// Appelé par library.js (renderHelp) ; t() vient de i18n.js.

const GUIDE_DESIGN = { borne: [1080, 1860], bureau: [1760, 960] };

/** Texte du guide : [3] devient la pastille du coup 3, *mot* est mis en avant ; espace fine avant : ; ! ? ». */
function guideRich(text = '') {
  const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return safe
    .replace(/ ([:;!?»])/g, ' $1')
    .replace(/« /g, '« ')
    .replace(/\[(\d+)\]/g, '<span class="gd-chip">$1</span>')
    .replace(/\*(.+?)\*/g, '<span class="gd-em">$1</span>');
}

function gdEl(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function gdSvg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * La page : un cadre qui remplit la scène, l'écran du guide dedans, construit au premier
 * affichage (il faut connaître la place pour choisir en hauteur ou en largeur).
 */
function renderGuidePage(h) {
  const box = libEl('div', 'gd-fit');
  requestAnimationFrame(() => layoutGuide(box, h));
  return box;
}

function layoutGuide(box, h) {
  if (!box.isConnected) return;
  const W = box.clientWidth;
  const H = box.clientHeight;
  if (!W || !H) return;
  const mode = H >= W ? 'borne' : 'bureau';
  const [dw, dh] = GUIDE_DESIGN[mode];
  const scale = Math.min(W / dw, H / dh);
  const screen = buildGuideScreen(h, mode);
  screen.style.transform = `translate(${(W - dw * scale) / 2}px, ${(H - dh * scale) / 2}px) scale(${scale})`;
  box.replaceChildren(screen);
  placeGuideTags(screen, h);
}

function buildGuideScreen(h, mode) {
  const p = h.page;
  const screen = gdEl('div', `gd-screen ${mode}`);

  // En-tête : surtitre, titre, « fabricant · année · page », points de page.
  const head = gdEl('div', 'gd-head');
  head.append(gdEl('div', 'gd-kicker'), gdEl('h1', 'gd-title'));
  head.firstChild.textContent = t('Guide du jeu');
  head.lastChild.textContent = h.title;
  const meta = gdEl('div', 'gd-head-meta');
  const sub = gdEl('div', 'gd-sub');
  sub.textContent = t('{sub} · {title} · page {page} sur {count}', { sub: h.sub, title: p.title, page: h.index + 1, count: h.count });
  const dots = gdEl('div', 'gd-dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < h.count; i++) dots.append(gdEl('i', i === h.index ? 'gd-on' : i < h.index ? 'gd-seen' : ''));
  meta.append(sub, dots);
  head.append(meta);

  // Plateau : l'image du .vpx (ou son dessin), les tirs, les flippers, les coups numérotés.
  const pf = gdEl('div', `gd-pf${p.all ? ' vue' : ''}`);
  pf.dataset.pf = '';
  const [areaH, maxW] = mode === 'borne' ? [1000, 560] : [880, 470];
  const pfH = Math.min(areaH, maxW / h.aspect);
  const pfW = pfH * h.aspect;
  pf.style.width = `${pfW}px`;
  pf.style.height = `${pfH}px`;
  pf.style.left = `${(mode === 'borne' ? 540 : 274 + 235) - pfW / 2}px`;
  pf.style.top = `${(mode === 'borne' ? 232 : 40) + (areaH - pfH) / 2}px`;
  const img = gdEl('div', `gd-img${h.image ? '' : ' schema'}`);
  if (h.image) img.style.backgroundImage = `url("${h.image}")`;
  pf.append(img);
  if (!h.image && h.schema) {
    const svg = gdSvg('svg', { class: 'gd-schema', viewBox: `0 0 ${h.width} ${h.height}`, preserveAspectRatio: 'none' });
    for (const s of h.schema) {
      const pts = s.pts.map((q) => q.join(',')).join(' ');
      if (s.type === 'wall' && s.pts.length >= 3) svg.append(gdSvg('polygon', { class: 'w', points: pts }));
      else if (s.type === 'ramp' && s.pts.length >= 2) svg.append(gdSvg('polyline', { class: 'r', points: pts }));
      else if (s.type === 'bumper') svg.append(gdSvg('circle', { class: 'b', cx: s.pts[0][0], cy: s.pts[0][1], r: h.width * 0.045 }));
      else if (s.type === 'kicker') svg.append(gdSvg('circle', { class: 'b', cx: s.pts[0][0], cy: s.pts[0][1], r: h.width * 0.022 }));
      else if (s.type === 'target') svg.append(gdSvg('rect', { class: 't', x: s.pts[0][0] - 14, y: s.pts[0][1] - 6, width: 28, height: 12, rx: 3 }));
    }
    pf.append(svg);
    const note = gdEl('div', 'gd-schema-note');
    note.textContent = t('Plateau dessiné d’après la table');
    pf.append(note);
  }
  const draw = gdSvg('svg', { class: 'gd-draw', viewBox: `0 0 ${h.width} ${h.height}`, preserveAspectRatio: 'none' });
  for (const path of h.paths) {
    const g = gdSvg('g');
    const k = path.second ? ' second' : '';
    g.append(
      gdSvg('path', { class: 'gd-shot-under', d: path.d }),
      gdSvg('path', { class: `gd-shot${k}`, d: path.d }),
      gdSvg('path', { class: `gd-arrow${k}`, d: 'M0 0 L-28 -14 L-22 0 L-28 14 Z', transform: `translate(${path.end.join(' ')}) rotate(${path.angle})` }),
    );
    draw.append(g);
  }
  for (const [a, b] of h.bats) draw.append(gdSvg('line', { class: 'gd-bat', x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-width': h.width * 0.025 }));
  pf.append(draw);
  for (const s of h.shots) {
    const mark = gdEl('div', `gd-mark ${s.lit ? 'gd-on' : 'gd-dim'}`);
    mark.textContent = s.n;
    mark.style.left = `${(s.x / h.width) * 100}%`;
    mark.style.top = `${(s.y / h.height) * 100}%`;
    pf.append(mark);
  }

  // Texte : titre (et légende des tirs), introduction, étapes, astuces, mise en garde, source.
  const panel = gdEl('div', 'gd-panel');
  const title = gdEl('h2', '', guideRich(p.title));
  if (h.paths.length) {
    const top = gdEl('div', 'gd-top');
    const legend = gdEl('span', 'gd-legend');
    legend.setAttribute('aria-label', t('Tirs indicatifs'));
    const phases = p.phases ?? [];
    legend.append(gdEl('span', '', `<i></i>${guideRich(phases[0] ?? t('Viser'))}`));
    if (h.paths.some((x) => x.second)) legend.append(gdEl('span', '', `<i class="b"></i>${guideRich(phases[1] ?? t('Ensuite'))}`));
    top.append(title, legend);
    panel.append(top);
  } else panel.append(title);
  if (p.intro) panel.append(gdEl('p', '', guideRich(p.intro)));
  if (p.steps?.length || p.final) {
    const ol = gdEl('ol', 'gd-steps');
    (p.steps ?? []).forEach((s, i) => ol.append(gdEl('li', '', `<span class="gd-n">${i + 1}</span><span>${guideRich(s)}</span>`)));
    if (p.final) ol.append(gdEl('li', 'final', `<span class="gd-n">★</span><span>${guideRich(p.final)}</span>`)); // i18n-ignore : signe
    panel.append(ol);
  }
  if (p.tips?.length) {
    const tips = gdEl('div', 'gd-tips');
    for (const [a, b] of p.tips) tips.append(gdEl('div', '', `<b>${guideRich(a)}</b>${guideRich(b)}`));
    panel.append(tips);
  }
  if (p.warn) {
    const warn = gdEl('div', 'gd-tip');
    warn.append(cyberIcon('alert', 'gd-tip-icon'), gdEl('span', '', guideRich(p.warn)));
    panel.append(warn);
  }
  for (const n of [p.note].flat().filter(Boolean)) panel.append(gdEl('p', 'quiet', guideRich(n)));
  // Source du guide, une fois, sur sa première page : répétée, elle prenait la place du texte.
  if (h.index === 0) {
    const src = gdEl('div', 'gd-src');
    src.append(gdEl('span', '', guideRich(h.source)));
    if (h.french) src.append(gdEl('span', 'gd-lang', guideRich(t('en français'))));
    panel.append(src);
  }

  screen.append(head, pf, panel);
  return screen;
}

/**
 * Étiquettes des coups de la page, dans les marges du plateau : de chaque côté, de haut en bas, à la
 * hauteur de leur coup quand la place le permet, sans se chevaucher (hauteur réelle de chacune),
 * remontées ensemble si la dernière dépasse le bas du plateau.
 */
function placeGuideTags(screen, h) {
  const pf = screen.querySelector('[data-pf]');
  const left = pf.offsetLeft;
  const top = pf.offsetTop;
  const w = pf.offsetWidth;
  const ht = pf.offsetHeight;
  const GAP = 14;
  const leaders = gdSvg('svg', { class: 'gd-leaders', viewBox: `0 0 ${screen.offsetWidth} ${screen.offsetHeight}` });
  for (const side of ['l', 'r']) {
    const list = h.shots.filter((s) => s.detail !== undefined && (s.x < h.width / 2) === (side === 'l')).sort((a, b) => a.y - b.y);
    const tags = list.map((s) => {
      const tag = gdEl('div', `gd-tag ${side}`);
      const name = `<span>${guideRich(s.name)}</span>`;
      const num = `<span class="n">${s.n}</span>`;
      tag.append(gdEl('b', '', side === 'l' ? name + num : num + name), gdEl('span', '', guideRich(s.detail)));
      screen.append(tag);
      tag.style.left = `${side === 'l' ? left - 20 - tag.offsetWidth : left + w + 20}px`;
      return { s, tag, height: tag.offsetHeight };
    });
    let floor = 0;
    const ys = tags.map(({ s, height }) => {
      const y = Math.max((s.y / h.height) * ht - 18, floor);
      floor = y + height + GAP;
      return y;
    });
    // Trop bas : tout remonte d'autant, sans repasser au-dessus du haut ni sur l'étiquette d'avant.
    const over = Math.max(0, floor - GAP - ht);
    let previous = 0;
    tags.forEach(({ s, tag, height }, k) => {
      const ty = top + Math.max(ys[k] - over, previous);
      previous = ty - top + height + GAP;
      tag.style.top = `${ty}px`;
      const x = left + (s.x / h.width) * w;
      const y = top + (s.y / h.height) * ht;
      const ex = side === 'l' ? left - 16 : left + w + 16;
      leaders.append(gdSvg('path', { d: `M${ex} ${ty + 17} L ${side === 'l' ? left : left + w} ${ty + 17} L ${x + (side === 'l' ? -28 : 28)} ${y}` }));
    });
  }
  screen.prepend(leaders);
}
