// Étape « Son de la borne » : la liste des configurations proposées et le schéma de la borne vue de
// dessus (app/src/sound-setups.ts), à la place des détails de la sortie. Le schéma montre le fronton
// et ses deux haut-parleurs, le plateau et ses exciters, deux par place (gauche, droite), à leur
// place réelle ; ce qui sonne est allumé en vert, ce qui est vérifié coché, le reste atténué.

(() => {
  const SIGNAL = '#8be23a';
  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs = {}, text) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function symbol(svg, x, y, kind, spot) {
    const on = Boolean(spot?.active);
    const absent = !spot || spot.state === 'absent';
    const stroke = on ? SIGNAL : absent ? '#24504a' : spot.check === 'pending' ? '#62776f' : spot.check === 'done' ? SIGNAL : '#9bada7';
    const dash = absent ? { 'stroke-dasharray': '5 5' } : {};
    if (on) svg.append(el('circle', { cx: x, cy: y, r: 34, fill: 'none', stroke: SIGNAL, 'stroke-opacity': 0.3, 'stroke-width': 8 }));
    if (kind === 'speaker') {
      svg.append(el('circle', { cx: x, cy: y, r: 22, fill: '#0c1a17', stroke, 'stroke-width': on ? 4 : 2.5, ...dash }));
      svg.append(el('circle', { cx: x, cy: y, r: 8, fill: 'none', stroke, 'stroke-width': 2.5, ...dash }));
    } else {
      svg.append(el('rect', { x: x - 22, y: y - 22, width: 44, height: 44, rx: 9, fill: '#0c1a17', stroke, 'stroke-width': on ? 4 : 2.5, ...dash }));
      svg.append(el('circle', { cx: x, cy: y, r: 10, fill: 'none', stroke, 'stroke-width': 2.5, ...dash }));
      svg.append(el('circle', { cx: x, cy: y, r: 3, fill: stroke }));
    }
  }

  function place(svg, y, kind, title, spot, labels) {
    const absent = !spot || spot.state === 'absent';
    const ink = absent || spot.check === 'pending' ? '#8a9e97' : '#e4eeeb';
    const second = !spot ? labels.empty : spot.state === 'absent' ? labels.absent.replace('{source}', spot.source) : spot.source;
    symbol(svg, 70, y, kind, spot);
    symbol(svg, 410, y, kind, spot);
    svg.append(el('text', { x: 240, y: y - 12, 'text-anchor': 'middle', fill: ink, 'font-size': 29, 'font-weight': 600 }, title + (spot?.check === 'done' ? ' ✓' : '')));
    svg.append(el('text', { x: 240, y: y + 28, 'text-anchor': 'middle', fill: '#aabdb7', 'font-size': 28 }, second));
  }

  /** Le schéma de la borne, d'après un CabinetView (app/src/sound-setups.ts). */
  function cabinetSvg(view) {
    const svg = el('svg', { class: 'cab', viewBox: '0 0 480 640', role: 'img' });
    svg.append(el('rect', { x: 22, y: 14, width: 436, height: 124, rx: 14, fill: '#07110f', stroke: '#24504a', 'stroke-width': 2 }));
    svg.append(el('rect', { x: 22, y: 160, width: 436, height: 420, rx: 16, fill: '#07110f', stroke: '#24504a', 'stroke-width': 2 }));
    svg.append(el('path', { d: 'M180 548 l52 16 M300 548 l-52 16', stroke: '#9bada7', 'stroke-width': 7, 'stroke-linecap': 'round' }));
    svg.append(el('text', { x: 240, y: 622, 'text-anchor': 'middle', fill: '#8a9e97', 'font-size': 28, 'letter-spacing': 3 }, view.labels.you));
    place(svg, 78, 'speaker', view.labels.fronton, view.fronton, view.labels);
    place(svg, 236, 'exciter', view.labels.haut, view.haut, view.labels);
    place(svg, 450, 'exciter', view.labels.bas, view.bas, view.labels);
    return svg;
  }

  function figure(view, check) {
    const box = document.createElement('figure');
    box.className = check ? 'setup-figure check' : 'setup-figure';
    box.append(cabinetSvg(view));
    return box;
  }

  /** Dessine la liste ou le schéma de la vérification dans #details ; rien s'il n'y a ni l'un ni l'autre. */
  window.renderSoundSetups = function renderSoundSetups(state) {
    const host = document.getElementById('details');
    if (state.setups) {
      const box = document.createElement('section');
      box.className = 'setups-view';
      const list = document.createElement('ol');
      list.className = 'setups';
      for (const item of state.setups.items) {
        const li = document.createElement('li');
        li.className = [item.selected && 'selected', item.quiet && 'quiet'].filter(Boolean).join(' ');
        const title = document.createElement('span');
        title.className = 'setup-title';
        title.textContent = item.title;
        li.append(title);
        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'setup-detail';
          detail.textContent = item.detail;
          li.append(detail);
        }
        for (const b of item.badges) {
          const badge = document.createElement('span');
          badge.className = `setup-badge ${b.tone}`;
          badge.textContent = b.text;
          li.append(badge);
        }
        list.append(li);
      }
      box.append(list);
      if (state.setups.cabinet) box.append(figure(state.setups.cabinet, false));
      host.replaceChildren(box);
    } else if (state.cabinet) {
      host.replaceChildren(figure(state.cabinet, true));
    }
  };
})();
