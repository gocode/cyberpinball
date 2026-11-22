// Roue en relief (lunettes 3D, réglage « Roue en relief ») : la roue et ses médaillons se détachent du fond, vus avec
// des lunettes à filtres colorés (anaglyphe, voir packages/core/src/anaglyph.ts pour les parties).
//
// La roue est faite de couches à plat : le fond (image ou vidéo de la table), le bandeau (verre,
// lumière, dessus), les médaillons et leurs halos, l'anneau du médaillon choisi. Le relief d'une
// couche plate se réduit à un décalage horizontal : l'œil gauche la voit décalée vers la droite,
// l'œil droit vers la gauche, d'autant plus qu'elle sort de l'écran. Chaque couche reçoit un filtre
// qui fabrique les deux vues décalées, garde de la gauche ce que laisse passer le verre rouge et de
// la droite ce que laisse passer le verre cyan, puis les additionne. L'interface n'est jamais
// dupliquée. Le fond reste au plan de l'écran (même image pour les deux yeux), passé au même mélange
// de couleurs pour que tout l'écran garde la même teinte à travers les lunettes.
//
// Limite connue : là où un seul œil voit un médaillon (une bande de la largeur du décalage, sur ses
// bords), l'autre œil voit du noir au lieu du fond ; invisible sur le fond sombre du front-end, un
// liseré sombre sur un média clair.
//
// Les filtres ne s'emboîtent jamais : seules des couches sœurs en portent un (un filtre sur le parent
// d'une couche filtrée referait le mélange une seconde fois).
//
// Pilotage : CyberRelief.apply(etat) après chaque dessin du playfield ; etat.relief ({ glasses,
// swapped }, packages/core/src/anaglyph.ts, anaglyphWheelRelief) absent : rien, la roue reste à plat.

'use strict';

(() => {
  /**
   * Écart des deux vues du médaillon choisi, en unités de la roue (1 080 de large) : environ 1 % de la
   * largeur. 18 (1,7 %) jugé trop fort avec les lunettes le 21/11/2026.
   */
  const BASE = 10;
  /** Profondeur de chaque couche, en part de BASE : le choisi devant, ses voisins un peu moins, le bandeau derrière eux. */
  const DEPTH = { center: 1, near: 0.66, mid: 0.5, far: 0.38, band: 0.3, ui: 0.25 };

  /**
   * Tout ce qui sert à la navigation autour de la roue sort de l'écran avec elle (22/11/2026) : la
   * marque, la roue dentée, le bandeau d'aide, et le cartouche (titre, fabricant · année, compteur,
   * collection), posé sur la plaque dessinée dans le bandeau, à sa profondeur. Restent au plan de
   * l'écran le fond (le média de la table) et, au bureau, les cadres chromés et le fronton en fond.
   */
  const NAVIGATION = [
    ['#root > .brand', DEPTH.ui],
    ['#root > .gear', DEPTH.band],
    ['#root > .footer.menu-help', DEPTH.ui],
    ['#root > .menu > :is(.menu-label, .menu-title, .menu-meta, .menu-count, .menu-shelf)', DEPTH.band],
  ];

  /**
   * Ce que laisse passer le verre de gauche, puis celui de droite, pour chaque paire de lunettes
   * (packages/core/src/anaglyph.ts) : matrices 4 × 5 de feColorMatrix (rouge, vert, bleu, alpha).
   * « Demi-couleur » : le verre qui ne passe qu'une couleur reçoit la luminance (le rouge seul rendrait
   * sombres les verts et les bleus de la charte, qui ne seraient vus que d'un œil).
   */
  const LUMA = '0.299 0.587 0.114 0 0';
  const NONE = '0 0 0 0 0';
  const ALPHA = '0 0 0 1 0';
  const GLASSES = {
    'red-cyan': [`${LUMA}  ${NONE}  ${NONE}  ${ALPHA}`, `${NONE}  0 1 0 0 0  0 0 1 0 0  ${ALPHA}`],
    'green-magenta': [`${NONE}  ${LUMA}  ${NONE}  ${ALPHA}`, `1 0 0 0 0  ${NONE}  0 0 1 0 0  ${ALPHA}`],
    'amber-blue': [`1 0 0 0 0  0 1 0 0 0  ${NONE}  ${ALPHA}`, `${NONE}  ${NONE}  ${LUMA}  ${ALPHA}`],
  };
  /** Les lunettes de l'état reçu (CyberRelief.apply) ; verres à l'envers : l'œil gauche porte le verre de droite. */
  let eyes = { glasses: 'red-cyan', swapped: false };

  let host;
  const made = new Set();

  /** Le filtre d'un écart (en px, arrondi au demi-pixel), pour les lunettes en vigueur, fabriqué à la première demande. */
  function filterFor(d) {
    const key = String(Math.round(d * 2) / 2).replace('.', '_').replace('-', 'm');
    const pair = GLASSES[eyes.glasses] ?? GLASSES['red-cyan'];
    const [LEFT, RIGHT] = eyes.swapped ? [pair[1], pair[0]] : pair;
    const id = `relief-${GLASSES[eyes.glasses] ? eyes.glasses : 'red-cyan'}${eyes.swapped ? '-inverse' : ''}-${key}`;
    if (!host?.isConnected) {
      host = document.createElement('div');
      host.className = 'relief-defs';
      host.setAttribute('aria-hidden', 'true');
      host.innerHTML = '<svg class="relief-defs-svg" width="0" height="0"><defs></defs></svg>';
      document.body.append(host);
      made.clear();
    }
    if (!made.has(id)) {
      const half = Math.round(d * 2) / 4;
      // Région en unités de la page, autour de la boîte de la couche (une couche sans taille, comme un
      // médaillon posé par son enfant transformé, n'aurait sinon aucune région).
      host.querySelector('defs').insertAdjacentHTML(
        'beforeend',
        `<filter id="${id}" filterUnits="userSpaceOnUse" x="-4000" y="-4000" width="12000" height="12000" color-interpolation-filters="sRGB">` +
          `<feOffset in="SourceGraphic" dx="${half}" result="g"/><feColorMatrix in="g" type="matrix" values="${LEFT}" result="gc"/>` +
          `<feOffset in="SourceGraphic" dx="${-half}" result="d"/><feColorMatrix in="d" type="matrix" values="${RIGHT}" result="dc"/>` +
          '<feComposite in="gc" in2="dc" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/></filter>',
      );
      made.add(id);
    }
    return `url(#${id})`;
  }

  /**
   * Filtre de l'ombre d'un médaillon : la forme que les deux yeux voient à la fois (ses deux vues
   * décalées, croisées), en noir. Posée juste sous lui, elle cache ce qui est derrière (ses voisins, le
   * bandeau) là où il est opaque pour les deux yeux, et le laisse voir sur la bande de son bord qu'un
   * seul œil voit : ni cerne noir, ni médaillon transparent.
   */
  function shadowFilter(d) {
    filterFor(d);
    const key = String(Math.round(d * 2) / 2).replace('.', '_').replace('-', 'm');
    const id = `relief-ombre-${key}`;
    if (!made.has(id)) {
      const half = Math.round(d * 2) / 4;
      host.querySelector('defs').insertAdjacentHTML(
        'beforeend',
        `<filter id="${id}" filterUnits="userSpaceOnUse" x="-4000" y="-4000" width="12000" height="12000">` +
          `<feOffset in="SourceAlpha" dx="${half}" result="g"/><feOffset in="SourceAlpha" dx="${-half}" result="d"/>` +
          '<feComposite in="g" in2="d" operator="in"/></filter>',
      );
      made.add(id);
    }
    return `url(#${id})`;
  }

  /** Ombre de chaque médaillon (son nœud → la copie et ce qu'elle montre), retirée avec lui. */
  const shadows = new Map();
  let watched;

  function dropShadow(item) {
    shadows.get(item)?.node.remove();
    shadows.delete(item);
  }

  /** Médaillon sorti de la roue (frontend.js, dropWheelItem) : son ombre part avec lui. */
  function watch(layer) {
    if (watched?.layer === layer) return;
    watched?.observer.disconnect();
    const observer = new MutationObserver((records) => {
      for (const r of records) for (const n of r.removedNodes) if (shadows.has(n)) dropShadow(n);
    });
    observer.observe(layer, { childList: true });
    watched = { layer, observer };
  }

  /**
   * L'ombre d'un médaillon : copie de sa boîte et de son logo, refaite quand le logo change, aux
   * mêmes variables de place (--x, --y, --s, --o) : elle glisse avec lui, par les mêmes transitions,
   * juste sous lui (z-index moins un), sous les médaillons plus proches du centre.
   */
  function shade(item, d) {
    const logo = item.querySelector(':scope > .wheel-logo');
    if (!logo) return;
    const look = `${[...logo.querySelectorAll('img')].map((i) => i.currentSrc || i.src).join('|')}|${logo.textContent}`;
    let s = shadows.get(item);
    if (!s || s.look !== look || !s.node.isConnected) {
      s?.node.remove();
      const node = document.createElement('div');
      node.setAttribute('aria-hidden', 'true');
      const copy = logo.cloneNode(true);
      for (const n of copy.querySelectorAll('[data-act]')) delete n.dataset.act;
      node.append(copy);
      s = { node, look };
      shadows.set(item, s);
    }
    if (s.node.nextSibling !== item) item.before(s.node);
    // Classes du médaillon (format du logo, Juke-box…), en jumeau sans pointeur : ni médaillon de la roue, ni centre.
    const className = `${item.className.replace(/\b(wheel-item|center|entering)\b/g, '').trim()} wheel-halo relief-ombre`;
    if (s.node.className !== className) s.node.className = className;
    for (const v of ['--x', '--y', '--s', '--o']) {
      const value = item.style.getPropertyValue(v);
      if (s.node.style.getPropertyValue(v) !== value) s.node.style.setProperty(v, value);
    }
    s.node.style.zIndex = String(Number(item.style.zIndex || 0) - 1);
    const filter = shadowFilter(d);
    if (s.node.style.filter !== filter) s.node.style.filter = filter;
  }

  const marked = new Set();
  /**
   * Une couche en relief. `blend` : mélange « écran » avec ce qui est derrière. Mélangée normalement,
   * la couche cachait ce qui est derrière sur toute sa largeur, y compris sur la bande de son bord
   * qu'un seul œil voit : l'autre œil y voyait du noir, un cerne autour de chaque médaillon (essai du
   * 22/11/2026). En « écran », chaque œil ajoute sa vue à ce qui est derrière, qui reste visible là
   * où il ne voit pas la couche ; sur le fond sombre de la roue, les couleurs de la couche restent justes.
   */
  function mark(node, filter, blend) {
    if (node.style.filter !== filter) node.style.filter = filter;
    const mode = blend ? 'screen' : '';
    if (node.style.mixBlendMode !== mode) node.style.mixBlendMode = mode;
    marked.add(node);
  }

  function clear() {
    for (const node of marked) {
      node.style.removeProperty('filter');
      node.style.removeProperty('mix-blend-mode');
    }
    marked.clear();
    for (const item of [...shadows.keys()]) dropShadow(item);
    document.documentElement.style.removeProperty('--relief-band');
    for (const node of document.querySelectorAll('.relief-verre')) node.remove();
  }

  /**
   * Le verre du bandeau, fond de la roue : il cache le média de la table derrière lui. Il quitte le fond
   * de .wheel-stage pour deux couches à lui (frontend.css) : son ombre (ce que les deux yeux voient du
   * verre, en noir, mélange normal) puis le verre en relief, mélangé en « écran » par-dessus. Le verre
   * cache ainsi le média, sans cerne noir sur la bande de son bord qu'un seul œil voit.
   */
  function glass(stage, d) {
    let pane = stage.querySelector(':scope > .relief-verre:not(.ombre)');
    let shade = stage.querySelector(':scope > .relief-verre.ombre');
    if (!pane) {
      pane = document.createElement('div');
      pane.className = 'relief-verre';
      shade = document.createElement('div');
      shade.className = 'relief-verre ombre';
      for (const n of [pane, shade]) n.setAttribute('aria-hidden', 'true');
      stage.prepend(shade, pane);
    }
    const filter = shadowFilter(d);
    if (shade.style.filter !== filter) shade.style.filter = filter;
    return pane;
  }

  function depthOf(place) {
    const a = Math.abs(Number(place));
    if (!Number.isFinite(a)) return DEPTH.far;
    return a === 0 ? DEPTH.center : a === 1 ? DEPTH.near : a === 2 ? DEPTH.mid : DEPTH.far;
  }

  function apply(s) {
    const on = Boolean(s?.relief) && s.phase === 'menu';
    document.documentElement.classList.toggle('relief', on);
    if (!on) return clear();
    eyes = { glasses: s.relief.glasses ?? 'red-cyan', swapped: Boolean(s.relief.swapped) };
    const stage = document.querySelector('.wheel-stage');
    const unit = stage ? stage.clientWidth / 1080 : 0;
    const keep = new Set();
    const put = (node, depth, blend = true) => {
      mark(node, filterFor(BASE * depth * unit), blend);
      keep.add(node);
    };
    // Le fond, au plan de l'écran : même image pour les deux yeux, même mélange de couleurs ; il cache ce qui est derrière lui.
    const back = document.getElementById('media-bg');
    if (back) put(back, 0, false);
    if (stage) {
      // Médaillons et jumeaux de leur halo : leur place dans la roue (frontend.js, placeWheelItem) ;
      // sous chaque médaillon, son ombre.
      const layer = stage.querySelector(':scope > .wheel-items');
      if (layer) watch(layer);
      for (const node of stage.querySelectorAll(':scope > .wheel-items > .wheel-item, :scope > .wheel-items > .wheel-halo:not(.relief-ombre)')) {
        const d = BASE * depthOf(node.dataset.place) * unit;
        put(node, depthOf(node.dataset.place));
        if (node.classList.contains('wheel-item')) shade(node, d);
      }
      for (const item of [...shadows.keys()]) if (!item.isConnected) dropShadow(item);
      // L'anneau, l'étincelle, l'éclat et la lueur suivent le médaillon choisi.
      for (const node of stage.querySelectorAll(':scope > .wheel-items > :is(.wheel-aura, .wheel-rim, .wheel-orbit, .wheel-glint)')) put(node, DEPTH.center);
      // Le bandeau : son verre (deux couches, glass), puis sa lumière et son dessus (pseudo-éléments,
      // frontend.css, --relief-band), en « écran » comme les médaillons ; la lueur derrière la roue de même.
      const band = BASE * DEPTH.band * unit;
      put(glass(stage, band), DEPTH.band);
      document.documentElement.style.setProperty('--relief-band', filterFor(band));
    }
    // La navigation autour de la roue.
    for (const [selector, depth] of NAVIGATION) for (const node of document.querySelectorAll(selector)) put(node, depth);
    for (const node of marked) {
      if (keep.has(node)) continue;
      node.style.removeProperty('filter');
      marked.delete(node);
    }
  }

  window.CyberRelief = { apply };
})();
