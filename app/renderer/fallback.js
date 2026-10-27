// Replis intégrés : l'habillage des écrans quand un jeu n'a pas ses médias
// (docs/recherche/medias.md, § 5.1, colonne « Repli »). Chaque composant se dessine
// dans un conteneur à partir du seul { title, manufacturer, year } : CSS, SVG et canvas,
// avec les polices OFL de polices/ ; les afficheurs à points écrivent avec la police à
// points de la marque (police-points.js, chargé avant ce script). Couleurs et matière
// sont celles du design system (docs/design-system) : voir fallback.css.
//
//   const h = CyberFallback.backglass(conteneur, jeu, { animate: true });
//   h.update(autreJeu);   // même composant, autre jeu
//   h.destroy();          // retire le composant et arrête ses minuteries
//
// Le conteneur doit avoir une taille et une position autre que static. Chaque
// composant suit cette taille (ResizeObserver) ; dans une vue pivotée (playfield
// tourné), il se met en page dans les dimensions vues du joueur.
//
// Légèreté, car VPX tourne en même temps : les animations CSS ne touchent que
// transform et opacity (composées par le GPU, sans redessin) ; le reste suit des
// minuteries lentes ; les afficheurs sont dessinés sur une grille de 128 × 32 points
// puis agrandis sous un masque de points (trois copies d'image par trame). Tout
// s'arrête quand la fenêtre est cachée. options.animate = false fige le composant.

(() => {
  'use strict';

  // Langue de l'interface (i18n.js, chargé avant ce script dans frontend.html). La page de
  // démonstration fallback-demo.html le charge sans i18n.js : les textes y restent en français.
  const t = typeof window.t === 'function' ? window.t : (source, params) => source.replace(/\{(\w+)\}/g, (whole, name) => (params && Object.hasOwn(params, name) ? String(params[name]) : whole));

  /**
   * Couleurs de la direction artistique (docs/design-system) : sarcelle lumineuse des
   * filets et bleu des métadonnées. Les mêmes pour tous les jeux : un repli reste calme
   * et ne prétend pas montrer les couleurs d'une table qu'on n'a pas.
   */
  const BORNE = { primary: '#36c9b4', secondary: '#5fb4cf' };
  /**
   * Couleur des points par défaut, celle de la DA (DEFAULT_DMD_COLOR, packages/core/src/dmdcolor.ts) ;
   * la couleur réglée dans le menu la remplace (setDmdColor).
   */
  const DMD_COLOR = '#8be23a';
  let dmdColor = DMD_COLOR;
  /** Afficheurs qui suivent la couleur réglée (ceux sans options.color). */
  const tinted = new Set();

  // ---------- Outils ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function hash(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
  }

  const clean = (v) => (v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim());
  /** Espaces insécables de la typographie française : « : » ou « ? » ne commencent jamais une ligne. */
  const bind = (text) => text.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

  function normalize(game) {
    const g = game ?? {};
    return { title: bind(clean(g.title)), manufacturer: bind(clean(g.manufacturer)), year: clean(g.year) };
  }

  const validColor = (c) => (typeof c === 'string' && CSS.supports('color', c) ? c : undefined);

  /** Couleurs d'un jeu : celles de la borne, pour tous. */
  const palette = () => ({ ...BORNE });

  /** « Williams · 1991 », « Williams », « 1991 » ou rien ; le point reste avec le fabricant. */
  const metaOf = (g) => [g.manufacturer, g.year].filter(Boolean).join('\u00a0· ');

  // Chargement des polices dès le départ : un texte ajusté à sa boîte se mesure de nouveau
  // quand sa police arrive (relayoutAll). Les afficheurs à points n'en ont pas besoin : leur
  // police est dessinée point par point (police-points.js).
  const FONTS = ['"CP Saira"', '"CP Bebas Neue"', '"CP Orbitron"', '"CP Audiowide"'];
  const fontsReady = Promise.all(FONTS.map((f) => document.fonts.load(`16px ${f}`, 'AÉé'))).catch(() => {}); // i18n-ignore : glyphes d'essai des polices

  // ---------- Minuteries, arrêtées quand la fenêtre est cachée ----------

  const tasks = new Set();
  let frames = 0;

  /**
   * Appelle fn tout de suite, puis après le délai (ms) qu'elle renvoie, tant que la
   * fenêtre est visible ; fn renvoie null pour s'arrêter. Renvoie de quoi l'arrêter.
   */
  function run(fn) {
    const task = { id: 0, live: true };
    task.step = () => {
      task.id = 0;
      if (!task.live || document.hidden) return;
      const next = fn();
      if (next === null || next === undefined) {
        task.live = false;
        tasks.delete(task);
      } else if (task.live) task.id = setTimeout(task.step, Math.max(16, next));
    };
    tasks.add(task);
    task.step();
    return () => {
      task.live = false;
      clearTimeout(task.id);
      tasks.delete(task);
    };
  }

  document.addEventListener('visibilitychange', () => {
    document.documentElement.classList.toggle('cp-fb-hidden', document.hidden);
    for (const task of tasks) {
      if (document.hidden) {
        clearTimeout(task.id);
        task.id = 0;
      } else if (!task.id) task.step();
    }
  });
  document.documentElement.classList.toggle('cp-fb-hidden', document.hidden);

  // ---------- Textes ajustés à leur boîte ----------

  /**
   * Plus grande taille de police (px) pour laquelle le texte tient dans sa boîte, sans
   * couper de mot. Mesures en dimensions de mise en page, indifférentes à la rotation.
   * Renvoie false si même la taille minimale déborde. Avec breakable, un mot démesuré
   * (« Supercalifragilisticexpialidocious » sur un écran en hauteur) qui rendrait le
   * texte minuscule peut être coupé, si cela l'agrandit nettement. Seuls les mots de
   * 14 lettres et plus reçoivent des points de coupe ; les autres restent entiers.
   */
  function fitText(box, text, limits = {}) {
    const ink = text.firstElementChild ?? text;
    if (ink.dataset.text !== undefined) {
      ink.textContent = ink.dataset.text;
      delete ink.dataset.text;
    }
    const ok = fitSize(box, text, limits);
    if (!limits.breakable) return ok;
    const size = parseFloat(text.style.fontSize);
    const whole = ink.textContent;
    const cut = whole.replace(/[^\s\u00a0]{14,}/g, (word) => [...word].join('\u200b'));
    if (cut === whole || size >= 0.16 * Math.min(box.clientWidth, box.clientHeight)) return ok;
    ink.dataset.text = whole;
    ink.textContent = cut;
    fitSize(box, text, limits);
    if (parseFloat(text.style.fontSize) >= size * 1.5) return true;
    ink.textContent = whole;
    delete ink.dataset.text;
    return fitSize(box, text, limits);
  }

  function fitSize(box, text, { min = 6, max = 2000 }) {
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!W || !H || !text.textContent) return true;
    const fits = () => text.scrollWidth <= text.clientWidth + 0.5 && text.offsetWidth <= W + 0.5 && text.offsetHeight <= H + 0.5;
    let lo = min;
    let hi = Math.max(min, Math.min(max, H * 1.2));
    text.style.fontSize = `${hi}px`;
    if (fits()) return true;
    text.style.fontSize = `${lo}px`;
    if (!fits()) return false;
    while (hi - lo > 0.25) {
      const mid = (lo + hi) / 2;
      text.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid;
    }
    text.style.fontSize = `${lo}px`;
    return true;
  }

  /** Taille de police (px) d'une boîte déjà ajustée. */
  const sizeOf = (box) => parseFloat(box.firstElementChild.style.fontSize) || Infinity;

  /** Boîte de texte ajustable : <div class="cp-fit"><span><span class="cp-ink">…</span></span></div>. */
  function fitBox(className, text) {
    const box = el('div', `cp-fit ${className}`);
    const span = el('span');
    span.append(el('span', 'cp-ink', text));
    box.append(span);
    return box;
  }

  /** Marque sur une ligne, ajustable : « CYBER » puis « PINBALL » en vert signal. */
  function wordmarkBox(className) {
    const box = el('div', `cp-fit cp-one-line cp-wordmark ${className}`);
    const span = el('span');
    span.append(el('span', 'cp-ink', 'CYBER '), el('span', 'cp-ink cp-pin', 'PINBALL'));
    box.append(span);
    return box;
  }

  /** Décor commun aux écrans dessinés : verre fumé, rails de lumière, reflet de passage. */
  const glass = () => [el('div', 'cp-glass'), el('div', 'cp-rail cp-rail-a'), el('div', 'cp-rail cp-rail-b'), el('div', 'cp-sweep')];

  // ---------- Composant : racine, taille suivie, minuteries ----------

  const mounted = new Set();
  const relayoutAll = () => {
    for (const layout of mounted) layout();
  };
  document.fonts.addEventListener('loadingdone', relayoutAll);
  fontsReady.then(relayoutAll);

  /**
   * Monte un composant : setup(ctx) prépare ce qui ne dépend pas du jeu et renvoie
   * render(jeu), rappelé à chaque update. ctx.fit(boîte, limites) ajuste un texte
   * (limites { min, max } en px, max pouvant être une fonction), ctx.run(fn) lance
   * une minuterie, ctx.onResize(fn) suit la taille.
   */
  function component(container, kind, game, options, setup) {
    const opts = options ?? {};
    const root = el('div', `cp-fb cp-fb-${kind}`);
    const animate = opts.animate !== false;
    root.classList.toggle('cp-fb-static', !animate);
    container.append(root);
    let fits = [];
    let resizers = [];
    let stops = [];
    let failures = [];
    const disposers = [];
    const observer = new ResizeObserver(() => layout());
    const ctx = {
      root,
      animate,
      options: opts,
      fit(box, limits) {
        fits.push([box, box.firstElementChild, limits]);
        observer.observe(box);
        return box;
      },
      run(fn) {
        if (!animate) return;
        stops.push(run(fn));
      },
      onResize(fn) {
        resizers.push(fn);
      },
      onDestroy(fn) {
        disposers.push(fn);
      },
    };
    function layout() {
      for (const fn of resizers) fn();
      failures = [];
      for (const [box, text, limits] of fits) {
        const max = typeof limits?.max === 'function' ? limits.max() : limits?.max;
        if (!fitText(box, text, { ...limits, max })) failures.push(`texte trop long pour sa place : « ${text.textContent} »`); // i18n-ignore : diagnostic des essais de mise en page
      }
    }
    const render = setup(ctx);
    observer.observe(root);
    mounted.add(layout);
    const clear = () => {
      for (const stop of stops) stop();
      for (const [box] of fits) observer.unobserve(box);
      stops = [];
      fits = [];
      resizers = [];
    };
    const handle = {
      element: root,
      update(next) {
        clear();
        const g = normalize(next);
        const colors = palette(next);
        root.style.setProperty('--cp-primary', colors.primary);
        root.style.setProperty('--cp-secondary', colors.secondary);
        render(g, colors);
        layout();
      },
      /** Défauts de mise en page constatés au dernier rendu (vide si tout tient). */
      problems: () => [...failures, ...(ctx.problems?.() ?? [])],
      destroy() {
        clear();
        for (const fn of disposers) fn();
        observer.disconnect();
        mounted.delete(layout);
        root.remove();
      },
    };
    handle.update(game);
    return handle;
  }

  // ---------- Afficheur à points (DMD) ----------

  /**
   * 16 nuances, comme le DMD vivant du menu (packages/core/src/livedmd.ts) : une courbe douce, car
   * l'œil voit mieux les écarts dans le sombre. Le point éteint n'est pas une nuance de la couleur
   * (un voile vert ou orange sur toute la grille) : il garde un gris neutre, à peine visible (OFF_DOT).
   */
  const LEVELS_16 = Array.from({ length: 16 }, (_, v) => (v ? 0.12 + 0.88 * Math.pow(v / 15, 1.6) : 0));
  const OFF_DOT = [14, 18, 17];
  /** Nuances des pages dessinées ici : celles de DMD_LEVEL (livedmd.ts). */
  const LEVEL = { main: 14, quiet: 11, secondary: 11, lamp: 5, flash: 15, brandCyber: 11, brandPinball: 15 };
  const FRAME = 40;

  function rgb(color) {
    const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = validColor(color) ?? dmdColor;
    probe.fillRect(0, 0, 1, 1);
    return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }

  /**
   * Grille de cols × rows points, chaque point valant 0 à 15. Dessin : la grille est écrite dans
   * un petit canvas d'un pixel par point, agrandie sans lissage, puis couverte d'un masque noir
   * percé d'un trou rond par point, et d'un léger halo.
   */
  class Matrix {
    constructor(root, cols, rows, color) {
      this.cols = cols;
      this.rows = rows;
      this.buffer = new Uint8Array(cols * rows);
      this.canvas = el('canvas', 'cp-dmd-canvas');
      this.canvas.setAttribute('role', 'img');
      root.append(this.canvas);
      this.small = document.createElement('canvas');
      this.small.width = cols;
      this.small.height = rows;
      this.smallCtx = this.small.getContext('2d');
      this.image = this.smallCtx.createImageData(cols, rows);
      this.mask = document.createElement('canvas');
      this.setColor(color);
    }

    setColor(color) {
      const [r, g, b] = rgb(color);
      this.lut = LEVELS_16.map((f, v) => (v ? [Math.round(r * f), Math.round(g * f), Math.round(b * f)] : OFF_DOT));
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
      const H = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
      if (W === this.canvas.width && H === this.canvas.height && this.pitch) return;
      this.canvas.width = W;
      this.canvas.height = H;
      this.pitch = Math.min(W / this.cols, H / this.rows);
      this.w = this.pitch * this.cols;
      this.h = this.pitch * this.rows;
      this.x = (W - this.w) / 2;
      this.y = (H - this.h) / 2;
      this.mask.width = Math.ceil(this.w);
      this.mask.height = Math.ceil(this.h);
      const m = this.mask.getContext('2d');
      m.fillStyle = '#000';
      m.fillRect(0, 0, this.mask.width, this.mask.height);
      m.globalCompositeOperation = 'destination-out';
      m.beginPath();
      const r = this.pitch * 0.41;
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const cx = (x + 0.5) * this.pitch;
          const cy = (y + 0.5) * this.pitch;
          m.moveTo(cx + r, cy);
          m.arc(cx, cy, r, 0, Math.PI * 2);
        }
      }
      m.fill();
      this.draw();
    }

    clear() {
      this.buffer.fill(0);
    }

    /** Copie une image de points (bitmap) en (x, y), la plus forte nuance l'emportant. */
    blit(bmp, x0, y0) {
      for (let y = 0; y < bmp.h; y++) {
        const ty = y0 + y;
        if (ty < 0 || ty >= this.rows) continue;
        for (let x = 0; x < bmp.w; x++) {
          const tx = x0 + x;
          if (tx < 0 || tx >= this.cols) continue;
          const v = bmp.px[y * bmp.w + x];
          const i = ty * this.cols + tx;
          if (v > this.buffer[i]) this.buffer[i] = v;
        }
      }
    }

    draw() {
      if (!this.pitch) return;
      const data = this.image.data;
      for (let i = 0; i < this.buffer.length; i++) {
        const c = this.lut[this.buffer[i]];
        data[i * 4] = c[0];
        data[i * 4 + 1] = c[1];
        data[i * 4 + 2] = c[2];
        data[i * 4 + 3] = 255;
      }
      this.smallCtx.putImageData(this.image, 0, 0);
      const ctx = this.canvas.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.small, this.x, this.y, this.w, this.h);
      ctx.drawImage(this.mask, this.x, this.y);
      // Halo : la même grille agrandie avec lissage, ajoutée faiblement.
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2;
      ctx.drawImage(this.small, this.x, this.y, this.w, this.h);
      frames++;
    }
  }

  /**
   * Afficheur à la couleur donnée (options.color), sinon à la couleur réglée dans le menu, qu'il
   * suit ensuite (setDmdColor) jusqu'à sa destruction.
   */
  function tintedMatrix(root, cols, rows, color, onDestroy) {
    const matrix = new Matrix(root, cols, rows, color ?? dmdColor);
    if (color === undefined) {
      tinted.add(matrix);
      onDestroy(() => tinted.delete(matrix));
    }
    return matrix;
  }

  /** Couleur réglée (« Couleur du DMD », medias.json) : tous les afficheurs qui la suivent sont redessinés. */
  function setDmdColor(color) {
    const c = validColor(color);
    if (!c || c === dmdColor) return;
    dmdColor = c;
    for (const matrix of tinted) {
      matrix.setColor(c);
      matrix.draw();
    }
  }

  // Textes en points : la police du DMD vivant, « Saira Points » (police-points.js, copie de
  // packages/core/src/dmdfont.ts) : petit (5 × 7), grand (9 × 14), marque (11 × 11), agrandis au
  // besoin d'un facteur entier au plus proche voisin, comme l'horloge du DMD vivant.

  /** Polices : { height, spacing, scale, glyphs: Map(signe → image de points 0/1) }. */
  const POINTS = (() => {
    const source = typeof CYBER_POINTS === 'object' ? CYBER_POINTS : {}; // police-points.js, chargé avant
    const fonts = {};
    for (const [name, f] of Object.entries(source)) {
      const glyphs = new Map();
      for (const [c, rows] of Object.entries(f.glyphs)) {
        const w = rows[0].length;
        const px = new Uint8Array(w * rows.length);
        rows.forEach((row, y) => [...row].forEach((ch, x) => (px[y * w + x] = ch === '#' ? 1 : 0)));
        glyphs.set(c, { w, h: rows.length, px });
      }
      fonts[name] = { height: f.height, spacing: f.spacing, glyphs };
    }
    return fonts;
  })();

  /** Une taille de la police, agrandie ×scale (points carrés de scale × scale). */
  const pointsFont = (name, scale = 1) => ({ ...POINTS[name], height: POINTS[name].height * scale, spacing: POINTS[name].spacing * scale, scale });

  /** Texte tel qu'un DMD l'écrit (dmdText de dmdfont.ts) : capitales sans accent, signes inconnus en « ? ». */
  function dmdText(raw) {
    const plain = String(raw)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/ß/g, 'SS')
      .replace(/[Ææ]/g, 'AE')
      .replace(/[Œœ]/g, 'OE')
      .replace(/[Øø]/g, 'O')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
    const known = POINTS.petit?.glyphs;
    return [...plain].map((c) => (!known || known.has(c) ? c : '?')).join('');
  }

  const glyphOf = (f, c) => f.glyphs.get(c) ?? f.glyphs.get('?') ?? f.glyphs.values().next().value;

  /** Largeur en points d'un texte (textWidth de dmdfont.ts). */
  function measure(text, f) {
    let w = 0;
    for (const c of text) w += glyphOf(f, c).w * f.scale + f.spacing;
    return Math.max(0, w - f.spacing);
  }

  /** Image de points d'une ligne de texte : { w, h, px }, chaque point allumé à la nuance level. */
  function rasterize(text, f, level = LEVEL.main) {
    const w = Math.max(1, measure(text, f));
    const h = f.height;
    const px = new Uint8Array(w * h);
    let x0 = 0;
    for (const c of text) {
      const g = glyphOf(f, c);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < g.w * f.scale; x++) {
          if (g.px[Math.floor(y / f.scale) * g.w + Math.floor(x / f.scale)] && x0 + x < w) px[y * w + x0 + x] = level;
        }
      }
      x0 += g.w * f.scale + f.spacing;
    }
    return { w, h, px };
  }

  /** Découpe des mots en n lignes, la plus large étant la plus étroite possible. */
  function splitLines(words, n, width) {
    if (n === 1) return [words.join(' ')];
    let best = null;
    let bestW = Infinity;
    const walk = (start, left, acc) => {
      if (left === 1) {
        const lines = [...acc, words.slice(start).join(' ')];
        const w = Math.max(...lines.map(width));
        if (w < bestW) {
          bestW = w;
          best = lines;
        }
        return;
      }
      for (let end = start + 1; end <= words.length - left + 1; end++) walk(end, left - 1, [...acc, words.slice(start, end).join(' ')]);
    };
    walk(0, n, []);
    return best;
  }

  /** Écart entre deux lignes : deux points, agrandis avec la police. */
  const lineGap = (f) => 2 * f.scale;

  /**
   * Mise en page d'un texte dans une zone de points : la première taille de la liste (la plus
   * grande d'abord) qui le fait tenir, chacune en 1 à maxLines lignes. null si rien ne tient.
   * sizes : [{ font, maxLines }].
   */
  function layoutText(text, area, sizes, level) {
    const words = text.split(' ').filter(Boolean);
    if (!words.length) return null;
    for (const { font: f, maxLines } of sizes) {
      const widths = new Map();
      const width = (s) => {
        if (!widths.has(s)) widths.set(s, measure(s, f));
        return widths.get(s);
      };
      for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
        const lines = splitLines(words, n, width);
        const h = n * f.height + lineGap(f) * (n - 1);
        if (Math.max(...lines.map(width)) <= area.w && h <= area.h) return { font: f, lines, level };
      }
    }
    return null;
  }

  /**
   * Comme layoutText, en coupant au besoin les mots démesurés en 2 puis 3 morceaux
   * (« SUPERCALIFRAGILISTICEXPIALIDOCIOUS » sur 122 points de large) : chaque taille essaie ses
   * coupes avant de céder la place à la suivante, plus petite.
   */
  function layoutCut(text, area, sizes, level) {
    for (const size of sizes) {
      for (const parts of [1, 2, 3]) {
        const cut =
          parts === 1
            ? text
            : text
                .split(' ')
                .map((w) => {
                  if (w.length < 12) return w;
                  const step = Math.ceil(w.length / parts);
                  return Array.from({ length: parts }, (_, i) => w.slice(i * step, (i + 1) * step)).join(' ');
                })
                .join(' ');
        if (parts > 1 && cut === text) break;
        const lay = layoutText(cut, area, [{ ...size, maxLines: Math.max(size.maxLines, parts) }], level);
        if (lay) return lay;
      }
    }
    return null;
  }

  /** Dernier recours, figé : le petit, coupé où il faut, tronqué de « ... » s'il reste du texte. */
  function layoutTruncated(text, area, level) {
    const f = pointsFont('petit');
    const maxLines = Math.max(1, Math.floor((area.h + lineGap(f)) / (f.height + lineGap(f))));
    const lines = [];
    let line = '';
    for (const c of text) {
      if (measure(line + c, f) > area.w) {
        lines.push(line.trimEnd());
        line = c.trimStart();
      } else line += c;
    }
    if (line) lines.push(line);
    const truncated = lines.length > maxLines;
    if (truncated) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last && measure(`${last}...`, f) > area.w) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last.trimEnd()}...`;
    }
    return { font: f, lines, level, truncated };
  }

  /** Images de points d'une mise en page, et sa hauteur totale. */
  function rasterLayout(lay) {
    const bmps = lay.lines.map((l) => rasterize(l, lay.font, lay.level));
    const gap = lineGap(lay.font);
    const h = bmps.reduce((sum, b) => sum + b.h, 0) + gap * (bmps.length - 1);
    return { bmps, h, gap };
  }

  /** Pose une mise en page centrée dans la zone, à partir de y si donné. */
  function blitLayout(matrix, ras, area, top) {
    let y = top ?? area.y + Math.floor((area.h - ras.h) / 2);
    for (const b of ras.bmps) {
      matrix.blit(b, area.x + Math.floor((area.w - b.w) / 2), y);
      y += b.h + ras.gap;
    }
  }

  /** Page qui défile : une ligne trop longue passe de droite à gauche. */
  function scrollPage(matrix, bmp, speed) {
    const travel = matrix.cols + bmp.w;
    return {
      hold: (travel / speed) * 1000,
      scroll: true,
      paint(elapsed) {
        matrix.clear();
        matrix.blit(bmp, matrix.cols - Math.floor((elapsed / 1000) * speed), Math.floor((matrix.rows - bmp.h) / 2));
      },
    };
  }

  /** Marges du DMD vivant : 3 points de chaque côté, 1 en haut et en bas. */
  const textArea = (matrix) => ({ x: 3, y: 1, w: matrix.cols - 6, h: matrix.rows - 2 });

  /**
   * Page de texte pour l'afficheur 128 × 32 : en grand sur une ou deux lignes s'il y tient, sinon
   * en petit sur trois, sinon défilant en grand (animé) ou coupé en petit (figé).
   */
  function textPage(matrix, text, hold, animate, problems) {
    const area = textArea(matrix);
    const sizes = [
      { font: pointsFont('grand'), maxLines: 2 },
      { font: pointsFont('petit'), maxLines: 3 },
    ];
    const lay = layoutText(text, area, sizes, LEVEL.main);
    if (lay) {
      const ras = rasterLayout(lay);
      return still(matrix, hold, () => blitLayout(matrix, ras, area));
    }
    if (animate) return scrollPage(matrix, rasterize(text, pointsFont('grand'), LEVEL.main), 40);
    let lay2 = layoutCut(text, area, sizes, LEVEL.main);
    if (!lay2) {
      lay2 = layoutTruncated(text, area, LEVEL.main);
      if (lay2.truncated) problems.push(`texte tronqué sur l'afficheur figé : « ${text} »`); // i18n-ignore : diagnostic des essais de mise en page
    }
    const ras = rasterLayout(lay2);
    return still(matrix, hold, () => blitLayout(matrix, ras, area));
  }

  /** Page fixe : une image de la grille, montrée hold ms. */
  function still(matrix, hold, paint) {
    matrix.clear();
    paint();
    const image = matrix.buffer.slice();
    return {
      hold,
      paint() {
        matrix.buffer.set(image);
      },
    };
  }

  /** Fabricant et année sur une même page s'ils y tiennent (le fabricant un ton dessous), sinon une page chacun. */
  function metaPages(matrix, g, animate, problems) {
    const maker = dmdText(g.manufacturer);
    const year = dmdText(g.year);
    if (maker && year) {
      const top = { x: 3, y: 1, w: matrix.cols - 6, h: 14 };
      const bottom = { x: 3, y: 17, w: matrix.cols - 6, h: 14 };
      const makerLay = layoutText(maker, top, [{ font: pointsFont('grand'), maxLines: 1 }, { font: pointsFont('petit'), maxLines: 1 }], LEVEL.secondary);
      const yearLay = layoutText(year, bottom, [{ font: pointsFont('grand'), maxLines: 1 }], LEVEL.main);
      if (makerLay && yearLay) {
        const a = rasterLayout(makerLay);
        const b = rasterLayout(yearLay);
        return [
          still(matrix, 3500, () => {
            blitLayout(matrix, a, top);
            blitLayout(matrix, b, bottom);
          }),
        ];
      }
    }
    return [maker, year].filter(Boolean).map((text) => textPage(matrix, text, 3000, animate, problems));
  }

  /**
   * La marque empilée dans sa police, comme la page de la marque du DMD vivant (brandPage de
   * livedmd.ts) : CYBER un ton dessous, PINBALL au plein éclat, centrés dans la zone.
   */
  function blitBrand(matrix, area) {
    const f = pointsFont('marque');
    const cyber = rasterize('CYBER', f, LEVEL.brandCyber);
    const pinball = rasterize('PINBALL', f, LEVEL.brandPinball);
    const gap = 4;
    const top = area.y + Math.floor((area.h - (cyber.h + gap + pinball.h)) / 2);
    matrix.blit(cyber, area.x + Math.floor((area.w - cyber.w) / 2), top);
    matrix.blit(pinball, area.x + Math.floor((area.w - pinball.w) / 2), top + cyber.h + gap);
  }

  /** Page de la marque sur l'afficheur 128 × 32 : 3 lignes libres en haut et en bas, 4 entre les mots. */
  function brandPage(matrix, hold) {
    return still(matrix, hold, () => blitBrand(matrix, { x: 0, y: 0, w: matrix.cols, h: matrix.rows }));
  }

  /** Transition d'une image à l'autre : balayage avec un trait lumineux, ou poussée vers le haut. */
  function transition(matrix, from, to, k, kind) {
    const { cols, rows } = matrix;
    const out = matrix.buffer;
    if (kind === 0) {
      const edge = Math.floor(k * (cols + 1));
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          out[i] = x < edge ? to[i] : x === edge ? LEVEL.flash : from[i];
        }
      }
    } else {
      const shift = Math.floor(k * rows);
      for (let y = 0; y < rows; y++) {
        const src = y + shift;
        for (let x = 0; x < cols; x++) out[y * cols + x] = src < rows ? from[src * cols + x] : to[(src - rows) * cols + x];
      }
    }
  }

  /** Enchaîne des pages sur la grille : pages fixes sans redessin, défilement et transitions à 25 images/s. */
  function sequence(ctx, matrix, pages, first = 0) {
    const TRANSITION = 600;
    let index = Math.abs(Math.trunc(first)) % pages.length || 0;
    let mode = 'page';
    let start = performance.now();
    let expected = start;
    let from = null;
    let to = null;
    let kind = 0;
    pages[index].paint(0);
    matrix.draw();
    if (!ctx.animate || (pages.length === 1 && !pages[0].scroll)) return;
    ctx.run(() => {
      const now = performance.now();
      // Fenêtre cachée puis revenue : on reprend où l'on en était.
      if (now - expected > 250) start += now - expected;
      const elapsed = now - start;
      let delay = FRAME;
      if (mode === 'page') {
        const page = pages[index];
        if (elapsed >= page.hold) {
          if (pages.length === 1) {
            start = now;
            page.paint(0);
          } else {
            page.paint(page.hold);
            from = matrix.buffer.slice();
            index = (index + 1) % pages.length;
            pages[index].paint(0);
            to = matrix.buffer.slice();
            mode = 'transition';
            start = now;
            transition(matrix, from, to, 0, kind);
          }
        } else {
          page.paint(elapsed);
          if (!page.scroll) delay = page.hold - elapsed;
        }
      } else {
        const k = elapsed / TRANSITION;
        if (k >= 1) {
          mode = 'page';
          start = now;
          kind = 1 - kind;
          pages[index].paint(0);
        } else transition(matrix, from, to, k, kind);
      }
      matrix.draw();
      expected = now + delay;
      return delay;
    });
  }

  /**
   * Afficheur 4:1 : titre, puis fabricant et année, puis la marque, en boucle ; sans titre, la marque.
   * options.color : couleur des points (sinon la couleur réglée) ; options.page : page de départ (0 = titre).
   */
  function dmd(container, game, options) {
    return component(container, 'dmd', game, options, (ctx) => {
      const matrix = tintedMatrix(ctx.root, 128, 32, ctx.options.color, ctx.onDestroy);
      let problems = [];
      ctx.problems = () => problems;
      ctx.root.setAttribute('aria-hidden', 'true');
      return (g) => {
        problems = [];
        ctx.onResize(() => matrix.resize());
        const title = dmdText(g.title);
        const pages = [title ? textPage(matrix, title, 5000, ctx.animate, problems) : brandPage(matrix, 5000)];
        if (ctx.animate) {
          pages.push(...metaPages(matrix, g, true, problems));
          if (title) pages.push(brandPage(matrix, 2500));
        }
        matrix.resize();
        sequence(ctx, matrix, pages, ctx.options.page);
      };
    });
  }

  /** Afficheur large 16:9 : même grille de points, plus fine ; titre, fabricant et année, cadre de lampes. */
  function fullDmd(container, game, options) {
    return component(container, 'fulldmd', game, options, (ctx) => {
      const matrix = tintedMatrix(ctx.root, 160, 90, ctx.options.color, ctx.onDestroy);
      let problems = [];
      ctx.problems = () => problems;
      ctx.root.setAttribute('aria-hidden', 'true');
      return (g) => {
        problems = [];
        ctx.onResize(() => matrix.resize());
        const inner = { x: 6, y: 6, w: matrix.cols - 12, h: matrix.rows - 12 };
        const title = dmdText(g.title);
        matrix.clear();
        if (!title) blitBrand(matrix, inner);
        else {
          const metaText = dmdText(metaOf(g));
          const metaArea = { w: inner.w, h: 30 };
          // Le grand agrandi ×3 ou ×2 pour un titre court, à sa taille pour un long, le petit en dernier.
          const sizes = [3, 2, 1].map((scale) => ({ font: pointsFont('grand', scale), maxLines: scale === 1 ? 4 : 3 })).concat({ font: pointsFont('petit'), maxLines: 6 });
          // Le fabricant en petit doublé s'il laisse le titre plus grand que lui, sinon en petit.
          let meta = null;
          let lay = null;
          let titleArea = inner;
          let reserved = 0;
          for (const metaFont of metaText ? [pointsFont('petit', 2), pointsFont('petit')] : [null]) {
            const metaLay = metaFont && layoutCut(metaText, metaArea, [{ font: metaFont, maxLines: 3 }], LEVEL.secondary);
            if (metaFont && !metaLay) continue;
            meta = metaLay ? rasterLayout(metaLay) : null;
            reserved = meta ? meta.h + 7 : 0;
            titleArea = { x: inner.x, y: inner.y, w: inner.w, h: inner.h - reserved };
            lay = layoutCut(title, titleArea, sizes, LEVEL.main);
            if (lay && (!metaLay || lay.font.height > metaLay.font.height)) break;
          }
          if (metaText && !meta) {
            const metaLay = layoutTruncated(metaText, metaArea, LEVEL.secondary);
            if (metaLay.truncated) problems.push(`fabricant tronqué : « ${metaText} »`); // i18n-ignore : diagnostic des essais de mise en page
            meta = rasterLayout(metaLay);
            reserved = meta.h + 7;
            titleArea = { x: inner.x, y: inner.y, w: inner.w, h: inner.h - reserved };
            lay = layoutCut(title, titleArea, sizes, LEVEL.main);
          }
          if (!lay) {
            lay = layoutTruncated(title, titleArea, LEVEL.main);
            if (lay.truncated) problems.push(`titre tronqué : « ${title} »`); // i18n-ignore : diagnostic des essais de mise en page
          }
          const ras = rasterLayout(lay);
          // Titre, filet et fabricant forment un bloc centré verticalement.
          const total = ras.h + reserved;
          const top = inner.y + Math.floor((inner.h - total) / 2);
          blitLayout(matrix, ras, titleArea, top);
          if (meta) {
            const ruleY = top + ras.h + 3;
            const ruleW = Math.min(inner.w, 60);
            for (let x = 0; x < ruleW; x += 2) matrix.buffer[ruleY * matrix.cols + inner.x + Math.floor((inner.w - ruleW) / 2) + x] = LEVEL.lamp;
            blitLayout(matrix, meta, inner, ruleY + 4);
          }
        }
        const base = matrix.buffer.slice();
        // Cadre de lampes fixe et faible : un point sur deux le long du bord.
        const { cols } = matrix;
        for (let x = 1; x < cols - 1; x += 2) matrix.buffer[1 * cols + x] = LEVEL.lamp;
        for (let y = 3; y < matrix.rows - 1; y += 2) matrix.buffer[y * cols + cols - 2] = LEVEL.lamp;
        for (let x = cols - 4; x >= 1; x -= 2) matrix.buffer[(matrix.rows - 2) * cols + x] = LEVEL.lamp;
        for (let y = matrix.rows - 4; y >= 3; y -= 2) matrix.buffer[y * cols + 1] = LEVEL.lamp;
        const lit = matrix.buffer.slice();
        // Seul mouvement, comme le reflet du fronton : un éclat qui traverse le texte toutes les 12 s.
        let shine = -1;
        const paint = () => {
          matrix.buffer.set(lit);
          if (shine >= 0) {
            for (let y = inner.y; y < inner.y + inner.h; y++) {
              for (let x = inner.x; x < inner.x + inner.w; x++) {
                const i = y * cols + x;
                if (base[i] && Math.abs(x + y * 0.5 - shine) < 3) matrix.buffer[i] = LEVEL.flash;
              }
            }
          }
          matrix.draw();
        };
        matrix.resize();
        paint();
        let first = true;
        ctx.run(() => {
          if (first) {
            first = false;
            return 4000;
          }
          shine = shine < 0 ? inner.x : shine + 4;
          if (shine > inner.x + inner.w + inner.h) shine = -1;
          paint();
          return shine >= 0 ? FRAME : 12000;
        });
      };
    });
  }

  /**
   * Afficheur à points nu, pour des images calculées ailleurs (DMD du menu vivant : le
   * processus principal envoie chaque image, 128 × 32 nuances de 0 à 15). Il suit la taille
   * de son conteneur, garde sa dernière image, et la couleur réglée sauf options.color.
   *   const m = CyberFallback.dotMatrix(conteneur, { color });
   *   m.show(points);   // Uint8Array de cols × rows nuances
   *   m.destroy();
   */
  function dotMatrix(container, options = {}) {
    const root = el('div', 'cp-fb cp-fb-dotmatrix');
    root.setAttribute('aria-hidden', 'true');
    container.append(root);
    let dispose = () => {};
    const matrix = tintedMatrix(root, options.cols ?? 128, options.rows ?? 32, options.color, (fn) => (dispose = fn));
    const observer = new ResizeObserver(() => matrix.resize());
    observer.observe(root);
    matrix.resize();
    let redraw;
    return {
      element: root,
      show(dots) {
        if (!dots || dots.length !== matrix.buffer.length) return;
        matrix.buffer.set(dots);
        matrix.draw();
        // Une image posée avant la première peinture de la fenêtre peut ne jamais être composée
        // (fenêtre hors écran, page fixe envoyée une seule fois) : un second tracé peu après.
        clearTimeout(redraw);
        redraw = setTimeout(() => matrix.draw(), 120);
      },
      setColor(color) {
        matrix.setColor(color);
        matrix.draw();
      },
      destroy() {
        clearTimeout(redraw);
        dispose();
        observer.disconnect();
        root.remove();
      },
    };
  }

  // ---------- Composants HTML ----------

  /**
   * Marque empilée, comme la couverture du design system (docs/design-system/src/couverture.html) :
   * « CYBER » au-dessus de « PINBALL » en vert signal, Saira légère élargie, très espacée.
   */
  function stackedWordmark(className) {
    const mark = el('div', `cp-wordmark cp-wordmark-stack ${className}`);
    mark.append(el('span', 'cp-ink', 'CYBER'), el('span', 'cp-ink cp-pin', 'PINBALL'));
    return mark;
  }

  /**
   * Fronton : sans jeu (menu système, réglages, aide : defaultMediaView), la couverture de la
   * marque ; avec un jeu, son titre en grand lisible de loin, filet sarcelle, fabricant et année,
   * sous un cadre de verre fumé.
   */
  function backglass(container, game, options) {
    return component(container, 'backglass', game, options, (ctx) => (g) => {
      ctx.root.classList.toggle('cp-bg-brand', !g.title);
      if (!g.title) {
        // L'illustration de la DA (bille et batteurs sarcelle, fronton-marque.webp), fondue vers le
        // noir sous la marque ; composition revue par le directeur artistique (27/10/2026).
        ctx.root.replaceChildren(el('div', 'cp-bg-art'), stackedWordmark('cp-bg-mark'));
        return;
      }
      const body = el('div', 'cp-bg-body');
      // Titre court : pas plus haut que la moitié du petit côté, pour rester une carte et non un mot géant.
      const title = ctx.fit(fitBox('cp-bg-title cp-game-title', g.title), { breakable: true, max: () => 0.5 * Math.min(ctx.root.clientWidth, ctx.root.clientHeight) });
      body.append(title);
      const meta = metaOf(g);
      // Le fabricant reste en retrait du titre : au plus un gros tiers de sa taille.
      if (meta) body.append(el('div', 'cp-rule'), ctx.fit(fitBox('cp-bg-meta cp-meta-text', meta), { max: () => 0.36 * sizeOf(title) }));
      ctx.root.classList.toggle('cp-no-meta', !meta);
      ctx.root.replaceChildren(...glass(), el('div', 'cp-frame'), el('div', 'cp-corners'), body);
    });
  }

  /**
   * Logo de Cyber Pinball : l'icône de l'application (icone.svg, rendue en .ico par
   * scripts/icone.mjs), bille comète dans sa plaque. Fixe : le reflet du verre suffit.
   */
  function brandLogo() {
    const logo = el('img', 'cp-logo');
    logo.src = 'icone.svg';
    logo.alt = '';
    logo.decoding = 'sync';
    return logo;
  }

  /**
   * Topper : logo et marque de Cyber Pinball, avec le titre du jeu (le fabricant et l'année
   * sont déjà sur le fronton et dans le menu ; au-dessus de la borne, c'est le jeu qu'on cherche).
   */
  function topper(container, game, options) {
    return component(container, 'topper', game, options, (ctx) => (g) => {
      const body = el('div', 'cp-tp-body');
      const text = el('div', 'cp-tp-text');
      const word = ctx.fit(wordmarkBox('cp-tp-word'));
      text.append(word);
      if (g.title) text.append(el('div', 'cp-rule'), ctx.fit(fitBox('cp-tp-title cp-game-title', g.title), { breakable: true, max: () => 1.4 * sizeOf(word) }));
      ctx.root.classList.toggle('cp-no-meta', !g.title);
      body.append(brandLogo(), text);
      ctx.root.replaceChildren(...glass(), body);
    });
  }

  const WHEEL_STYLES = ['chrome', 'neon', 'arcade'];

  /** Logo du jeu en texte stylisé, sur fond transparent, pour la liste du menu. */
  function wheel(container, game, options) {
    return component(container, 'wheel', game, options, (ctx) => (g) => {
      const style = WHEEL_STYLES.includes(ctx.options.style) ? ctx.options.style : WHEEL_STYLES[hash(`${g.title}|style`) % WHEEL_STYLES.length];
      // Sans titre, la marque telle quelle (wordmarkBox), jamais écrite dans le style d'un jeu.
      ctx.root.replaceChildren(g.title ? ctx.fit(fitBox(`cp-wh-title cp-wh-${style}`, g.title), { breakable: true }) : ctx.fit(wordmarkBox('cp-wh-title')));
    });
  }

  /** Fond calme : verre fumé, une nappe sarcelle qui dérive lentement, reflet de passage. */
  function backdrop(root) {
    root.append(el('div', 'cp-glass'), el('div', 'cp-pf-haze'), el('div', 'cp-sweep'), el('div', 'cp-pf-vignette'));
  }

  /** Fond du plateau derrière la liste : verre fumé discret, sans faux visuel de table. */
  function playfield(container, game, options) {
    return component(container, 'playfield', game, options, (ctx) => () => {
      ctx.root.replaceChildren();
      backdrop(ctx.root);
    });
  }

  /**
   * Écran de chargement de secours : marque, titre, fabricant et année, barre d'attente,
   * « Chargement de la table… » (sans lui avec l'option label: false). handle.slot reçoit ce
   * que l'appelant veut montrer dessous (un aide-mémoire).
   */
  function loading(container, game, options) {
    let slot;
    const handle = component(container, 'loading', game, options, (ctx) => {
      slot = el('div', 'cp-ld-slot');
      return (g) => {
        ctx.root.replaceChildren();
        backdrop(ctx.root);
        const body = el('div', 'cp-ld-body');
        const bar = el('div', 'cp-ld-bar');
        bar.append(el('div', 'cp-ld-run'));
        const title = ctx.fit(fitBox('cp-ld-title cp-game-title', g.title || t('Table sans titre')), { breakable: true });
        body.append(ctx.fit(wordmarkBox('cp-ld-brand')), title);
        const meta = metaOf(g);
        if (meta) body.append(ctx.fit(fitBox('cp-ld-meta cp-meta-text', meta), { max: () => 0.36 * sizeOf(title) }));
        body.append(bar);
        if (ctx.options.label !== false) body.append(ctx.fit(fitBox('cp-ld-label cp-one-line', t('Chargement de la table…'))));
        body.append(slot);
        ctx.root.append(body);
      };
    });
    handle.slot = slot;
    return handle;
  }

  /**
   * Écran « en partie » pour les écrans que VPX n'occupe pas : sombre et discret.
   * Le bloc de texte change de place chaque minute, pour ne pas marquer l'écran.
   */
  function inGame(container, game, options) {
    return component(container, 'ingame', game, options, (ctx) => (g) => {
      const card = el('div', 'cp-ig-card');
      const title = ctx.fit(fitBox('cp-ig-title cp-game-title', g.title || t('Partie en cours')), { breakable: true });
      card.append(ctx.fit(wordmarkBox('cp-ig-brand')), title);
      const meta = metaOf(g);
      if (meta) card.append(ctx.fit(fitBox('cp-ig-meta cp-meta-text', meta), { max: () => 0.45 * sizeOf(title) }));
      if (g.title) card.append(ctx.fit(fitBox('cp-ig-state cp-one-line', t('Partie en cours'))));
      ctx.root.replaceChildren(card);
      let fx = 0.5;
      let fy = 0.5;
      // Glissement lent d'une place à l'autre ; placement immédiat au départ et quand la taille change.
      const place = (slide) => {
        const x = (ctx.root.clientWidth - card.offsetWidth) * fx;
        const y = (ctx.root.clientHeight - card.offsetHeight) * fy;
        card.classList.toggle('cp-ig-slide', slide);
        card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      };
      ctx.onResize(() => place(false));
      let first = true;
      ctx.run(() => {
        if (!first) {
          fx = Math.random();
          fy = Math.random();
          place(true);
        }
        first = false;
        return 60000;
      });
    });
  }

  window.CyberFallback = {
    backglass,
    dmd,
    fullDmd,
    dotMatrix,
    setDmdColor,
    topper,
    wheel,
    playfield,
    loading,
    inGame,
    palette,
    /** Pour les essais : minuteries en cours et trames dessinées depuis le chargement. */
    stats: () => ({ tasks: tasks.size, scheduled: [...tasks].filter((task) => task.id).length, frames }),
  };
})();
