// Replis intégrés : l'habillage des écrans quand un jeu n'a pas ses médias
// (docs/recherche/medias.md, § 5.1, colonne « Repli »). Chaque composant se dessine
// dans un conteneur à partir du seul { title, manufacturer, year }, sans aucune
// image : CSS, SVG et canvas, avec les polices OFL de polices/. Couleurs et matière
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

  /**
   * Couleurs de la direction artistique (docs/design-system) : sarcelle lumineuse des
   * filets et bleu des métadonnées. Les mêmes pour tous les jeux : un repli reste calme
   * et ne prétend pas montrer les couleurs d'une table qu'on n'a pas.
   */
  const BORNE = { primary: '#36c9b4', secondary: '#5fb4cf' };
  /** Orangé des afficheurs à plasma d'origine (jeton dmd, réservé aux afficheurs). */
  const DMD_COLOR = '#ff8a1f';
  const BRAND = 'CYBER PINBALL';

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
  const upper = (text) => text.toLocaleUpperCase('fr-FR');

  // Chargement des polices dès le départ : les afficheurs dessinent sur canvas, où
  // une police pas encore chargée serait remplacée sans prévenir.
  const FONTS = ['"CP Saira"', '"CP Bebas Neue"', '"CP Press Start"', '"CP Orbitron"', '"CP Audiowide"'];
  const fontsReady = Promise.all(FONTS.map((f) => document.fonts.load(`16px ${f}`, 'AÉé'))).catch(() => {});

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
    };
    function layout() {
      for (const fn of resizers) fn();
      failures = [];
      for (const [box, text, limits] of fits) {
        const max = typeof limits?.max === 'function' ? limits.max() : limits?.max;
        if (!fitText(box, text, { ...limits, max })) failures.push(`texte trop long pour sa place : « ${text.textContent} »`);
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
        observer.disconnect();
        mounted.delete(layout);
        root.remove();
      },
    };
    handle.update(game);
    return handle;
  }

  // ---------- Afficheur à points (DMD) ----------

  /** Intensité de chaque nuance : point éteint, faible, moyen, plein (4 nuances, comme les DMD d'origine). */
  const LEVELS = [0.07, 0.34, 0.67, 1];
  const FRAME = 40;

  function rgb(color) {
    const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = validColor(color) ?? DMD_COLOR;
    probe.fillRect(0, 0, 1, 1);
    return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }

  /**
   * Grille de cols × rows points, chaque point valant 0 à 3. Dessin : la grille est
   * écrite dans un petit canvas d'un pixel par point, agrandie sans lissage, puis
   * couverte d'un masque noir percé d'un trou rond par point, et d'un léger halo.
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
      this.lut = LEVELS.map((f) => [Math.round(r * f), Math.round(g * f), Math.round(b * f)]);
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

  // Textes en points : dessinés avec une police dans un canvas de travail, puis
  // ramenés aux 4 nuances (Bebas Neue lissée) ou à 2 (Press Start 2P, police pixel
  // dessinée à sa taille native de 8 px, un point par pixel).
  const inkCanvas = document.createElement('canvas');
  const inkCtx = inkCanvas.getContext('2d', { willReadFrequently: true });
  /** Sous SHARP points de haut, les lettres sont espacées de 2 points et posées en 2 nuances (voir rasterize). */
  const SHARP = 24;
  const BEBAS = (size) => ({ family: '"CP Bebas Neue", "Segoe UI", sans-serif', size, spacing: size < SHARP ? 2 : 1 });
  const PIXEL = { family: '"CP Press Start", Consolas, monospace', size: 8, spacing: 0, crisp: true };

  function setFont(ctx, f) {
    ctx.font = `${f.size}px ${f.family}`;
    ctx.letterSpacing = `${f.spacing}px`;
  }

  function measure(text, f) {
    setFont(inkCtx, f);
    const m = inkCtx.measureText(text);
    return { w: Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight), h: Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) };
  }

  /**
   * Image de points d'une ligne de texte, rognée à l'encre : { w, h, px }. La police
   * pixel est dessinée 8 fois plus grande et lue au centre de chaque pixel de police :
   * à sa taille native, un décalage d'un demi-pixel doublerait chaque trait au seuillage.
   */
  function rasterize(text, f) {
    const scale = f.crisp ? 8 : 1;
    const big = { ...f, size: f.size * scale, spacing: f.spacing * scale };
    setFont(inkCtx, big);
    const m = inkCtx.measureText(text);
    const pad = 2;
    const w = Math.max(1, Math.ceil((m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / scale) + pad * 2);
    const h = Math.max(1, Math.ceil((m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / scale) + pad * 2);
    inkCanvas.width = w * scale;
    inkCanvas.height = h * scale;
    setFont(inkCtx, big);
    inkCtx.fillStyle = '#fff';
    inkCtx.fillText(text, (pad + Math.round(m.actualBoundingBoxLeft / scale)) * scale, (pad + Math.round(m.actualBoundingBoxAscent / scale)) * scale);
    const data = inkCtx.getImageData(0, 0, w * scale, h * scale).data;
    const px = new Uint8Array(w * h);
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    const half = scale >> 1;
    for (let i = 0; i < px.length; i++) {
      const sx = (i % w) * scale + half;
      const sy = Math.floor(i / w) * scale + half;
      const a = data[(sy * w * scale + sx) * 4 + 3];
      // Petites tailles : point allumé ou éteint, sans nuance intermédiaire, qui boucherait
      // l'intérieur des lettres à diagonales (W, M, N) et collerait les lettres entre elles.
      const v = f.crisp || f.size < SHARP ? (a >= 128 ? 3 : 0) : a >= 170 ? 3 : a >= 100 ? 2 : a >= 45 ? 1 : 0;
      px[i] = v;
      if (v) {
        const x = i % w;
        const y = (i - x) / w;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    if (x1 < 0) return { w: 0, h: 0, px: new Uint8Array(0) };
    const tw = x1 - x0 + 1;
    const th = y1 - y0 + 1;
    const out = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++) out.set(px.subarray((y + y0) * w + x0, (y + y0) * w + x0 + tw), y * tw);
    return { w: tw, h: th, px: out };
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

  /**
   * Mise en page d'un texte dans une zone de points, en Bebas Neue, de la plus grande
   * taille à la plus petite, en 1 à maxLines lignes. null si rien ne tient.
   */
  function layoutText(text, area, { maxSize, minSize, maxLines }) {
    const words = text.split(' ').filter(Boolean);
    if (!words.length) return null;
    for (let size = maxSize; size >= minSize; size--) {
      const f = BEBAS(size);
      const widths = new Map();
      const width = (s) => {
        if (!widths.has(s)) widths.set(s, measure(s, f).w);
        return widths.get(s);
      };
      for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
        const lines = splitLines(words, n, width);
        const sizes = lines.map((l) => measure(l, f));
        const gap = Math.max(1, Math.round(size * 0.14));
        const h = sizes.reduce((sum, m) => sum + m.h, 0) + gap * (n - 1);
        if (Math.max(...sizes.map((m) => m.w)) <= area.w && h <= area.h) return { font: f, lines, gap };
      }
    }
    return null;
  }

  /**
   * Comme layoutText, en coupant au besoin les mots démesurés en 2 puis 3 morceaux
   * (« SUPERCALIFRAGILISTICEXPIALIDOCIOUS » sur 160 points de large).
   */
  function layoutCut(text, area, limits) {
    const direct = layoutText(text, area, limits);
    if (direct) return direct;
    for (const parts of [2, 3]) {
      const cut = text
        .split(' ')
        .map((w) => {
          if (w.length < 12) return w;
          const step = Math.ceil(w.length / parts);
          return Array.from({ length: parts }, (_, i) => w.slice(i * step, (i + 1) * step)).join(' ');
        })
        .join(' ');
      if (cut === text) break;
      const lay = layoutText(cut, area, { ...limits, maxLines: Math.max(limits.maxLines, parts) });
      if (lay) return lay;
    }
    return null;
  }

  /** Repli en police pixel (8 points par signe), coupé au besoin, tronqué en dernier recours. */
  function layoutPixel(text, area) {
    const perLine = Math.max(1, Math.floor(area.w / 8));
    const maxLines = Math.max(1, Math.floor((area.h + 2) / 10));
    const lines = [];
    let line = '';
    for (let word of text.split(' ').filter(Boolean)) {
      while (word.length > perLine) {
        if (line) lines.push(line);
        lines.push(word.slice(0, perLine));
        word = word.slice(perLine);
        line = '';
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= perLine) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    const truncated = lines.length > maxLines;
    if (truncated) {
      lines.length = maxLines;
      lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, perLine - 1)}…`;
    }
    return { font: PIXEL, lines, gap: 2, truncated };
  }

  /** Images de points d'une mise en page, et sa hauteur totale. */
  function rasterLayout(lay) {
    const bmps = lay.lines.map((l) => rasterize(l, lay.font));
    const h = bmps.reduce((sum, b) => sum + b.h, 0) + lay.gap * (bmps.length - 1);
    return { bmps, h, gap: lay.gap };
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
      paint(t) {
        matrix.clear();
        matrix.blit(bmp, matrix.cols - Math.floor((t / 1000) * speed), Math.floor((matrix.rows - bmp.h) / 2));
      },
    };
  }

  /**
   * Page de texte pour l'afficheur 128 × 32 : texte fixe s'il tient lisiblement,
   * sinon défilant (animé) ou en police pixel (figé).
   */
  function textPage(matrix, text, hold, animate, problems) {
    const area = { x: 2, y: 1, w: matrix.cols - 4, h: matrix.rows - 2 };
    const lay = layoutText(text, area, { maxSize: 34, minSize: 13, maxLines: 2 });
    if (lay) {
      const ras = rasterLayout(lay);
      return still(matrix, hold, () => blitLayout(matrix, ras, area));
    }
    if (animate) {
      let size = 30;
      while (size > 12 && measure(text, BEBAS(size)).h > matrix.rows - 6) size--;
      return scrollPage(matrix, rasterize(text, BEBAS(size)), 40);
    }
    // Figé : plus petit et sur trois lignes, puis en police pixel, tronqué en dernier recours.
    let lay2 = layoutCut(text, area, { maxSize: 12, minSize: 9, maxLines: 3 });
    if (!lay2) {
      lay2 = layoutPixel(text, area);
      if (lay2.truncated) problems.push(`texte tronqué sur l'afficheur figé : « ${text} »`);
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

  /** Fabricant et année sur une même page s'ils y tiennent, sinon une page chacun. */
  function metaPages(matrix, g, animate, problems) {
    const maker = upper(g.manufacturer);
    const year = g.year;
    if (maker && year) {
      const top = { x: 2, y: 1, w: matrix.cols - 4, h: 13 };
      const bottom = { x: 2, y: 16, w: matrix.cols - 4, h: 15 };
      const makerLay = layoutText(maker, top, { maxSize: 18, minSize: 12, maxLines: 1 });
      const yearLay = layoutText(year, bottom, { maxSize: 24, minSize: 12, maxLines: 1 });
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
   * Logo de Cyber Pinball en points (comme l'icône) : bille cerclée, reflet en haut à
   * gauche, deux flippers dessous. Image de points { w, h, px } de h lignes.
   */
  function logoBitmap(h) {
    const w = Math.round(h * 0.9);
    const px = new Uint8Array(w * h);
    const r = h * 0.3;
    const cx = (w - 1) / 2;
    const cy = r + 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        let v = 0;
        if (d <= r) v = d > r - 1 ? 3 : 1;
        if (Math.hypot(x - (cx - r * 0.4), y - (cy - r * 0.4)) < r * 0.2) v = 3;
        px[y * w + x] = v;
      }
    }
    // Flippers : segments épais du pivot (bord) vers la pointe (centre), un peu plus bas.
    const flipper = (ax, ay, bx, by) => {
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = ax + (bx - ax) * t;
        const y = ay + (by - ay) * t;
        const thick = 1.4 - 0.8 * t;
        for (let yy = Math.floor(y - thick); yy <= Math.ceil(y + thick); yy++) {
          for (let xx = Math.floor(x - thick); xx <= Math.ceil(x + thick); xx++) {
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || Math.hypot(xx - x, yy - y) > thick + 0.2) continue;
            px[yy * w + xx] = Math.max(px[yy * w + xx], t < 0.15 ? 3 : 2);
          }
        }
      }
    };
    const top = h * 0.74;
    const tip = h - 2;
    flipper(1.5, top, cx - 2, tip);
    flipper(w - 2.5, top, cx + 2, tip);
    return { w, h, px };
  }

  /** Page de la marque : le logo en points et « CYBER PINBALL » à côté (sinon le texte seul). */
  function brandPage(matrix, hold, animate, problems) {
    const logo = logoBitmap(matrix.rows - 4);
    const x0 = 3;
    const area = { x: x0 + logo.w + 5, y: 1, w: matrix.cols - (x0 + logo.w + 5) - 3, h: matrix.rows - 2 };
    const lay = layoutText(BRAND, area, { maxSize: 22, minSize: 11, maxLines: 2 });
    if (!lay) return textPage(matrix, BRAND, hold, animate, problems);
    const ras = rasterLayout(lay);
    return still(matrix, hold, () => {
      matrix.blit(logo, x0, Math.floor((matrix.rows - logo.h) / 2));
      blitLayout(matrix, ras, area);
    });
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
          out[i] = x < edge ? to[i] : x === edge ? 3 : from[i];
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
      const t = now - start;
      let delay = FRAME;
      if (mode === 'page') {
        const page = pages[index];
        if (t >= page.hold) {
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
          page.paint(t);
          if (!page.scroll) delay = page.hold - t;
        }
      } else {
        const k = t / TRANSITION;
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
   * Afficheur 4:1 : titre, puis fabricant et année, puis la marque, en boucle.
   * options.color : couleur des points ; options.page : page de départ (0 = titre).
   */
  function dmd(container, game, options) {
    return component(container, 'dmd', game, options, (ctx) => {
      const matrix = new Matrix(ctx.root, 128, 32, ctx.options.color ?? DMD_COLOR);
      let problems = [];
      ctx.problems = () => problems;
      ctx.root.setAttribute('aria-hidden', 'true');
      let generation = 0;
      return (g) => {
        const current = ++generation;
        problems = [];
        ctx.onResize(() => matrix.resize());
        // Les pages se calculent une fois les polices prêtes (sinon, police de secours).
        fontsReady.then(() => {
          if (current !== generation || !ctx.root.isConnected) return;
          const pages = [g.title ? textPage(matrix, upper(g.title), 5000, ctx.animate, problems) : brandPage(matrix, 5000, ctx.animate, problems)];
          if (ctx.animate) {
            pages.push(...metaPages(matrix, g, true, problems));
            if (g.title) pages.push(brandPage(matrix, 2500, true, problems));
          }
          matrix.resize();
          sequence(ctx, matrix, pages, ctx.options.page);
        });
      };
    });
  }

  /** Afficheur large 16:9 : même grille de points, plus fine ; titre, fabricant et année, cadre de lampes. */
  function fullDmd(container, game, options) {
    return component(container, 'fulldmd', game, options, (ctx) => {
      const matrix = new Matrix(ctx.root, 160, 90, ctx.options.color ?? DMD_COLOR);
      let problems = [];
      ctx.problems = () => problems;
      ctx.root.setAttribute('aria-hidden', 'true');
      let generation = 0;
      return (g) => {
        const current = ++generation;
        problems = [];
        ctx.onResize(() => matrix.resize());
        fontsReady.then(() => {
          if (current !== generation || !ctx.root.isConnected) return;
          const inner = { x: 6, y: 6, w: matrix.cols - 12, h: matrix.rows - 12 };
          const metaText = upper(metaOf(g));
          let meta = null;
          if (metaText) {
            const lay = layoutCut(metaText, { w: inner.w, h: 36 }, { maxSize: 18, minSize: 10, maxLines: 3 }) ?? layoutPixel(metaText, { w: inner.w, h: 38 });
            if (lay.truncated) problems.push(`fabricant tronqué : « ${metaText} »`);
            meta = rasterLayout(lay);
          }
          const reserved = meta ? meta.h + 7 : 0;
          const titleArea = { x: inner.x, y: inner.y, w: inner.w, h: inner.h - reserved };
          const title = upper(g.title || BRAND);
          let lay = layoutCut(title, titleArea, { maxSize: 64, minSize: 12, maxLines: 3 });
          if (!lay) {
            lay = layoutPixel(title, titleArea);
            if (lay.truncated) problems.push(`titre tronqué : « ${title} »`);
          }
          const ras = rasterLayout(lay);
          // Titre, filet et fabricant forment un bloc centré verticalement.
          const total = ras.h + reserved;
          const top = inner.y + Math.floor((inner.h - total) / 2);
          matrix.clear();
          blitLayout(matrix, ras, titleArea, top);
          if (meta) {
            const ruleY = top + ras.h + 3;
            const ruleW = Math.min(inner.w, 60);
            for (let x = 0; x < ruleW; x += 2) matrix.buffer[ruleY * matrix.cols + inner.x + Math.floor((inner.w - ruleW) / 2) + x] = 1;
            blitLayout(matrix, meta, inner, ruleY + 4);
          }
          const base = matrix.buffer.slice();
          // Cadre de lampes fixe et faible : un point sur deux le long du bord.
          const { cols } = matrix;
          for (let x = 1; x < cols - 1; x += 2) matrix.buffer[1 * cols + x] = 1;
          for (let y = 3; y < matrix.rows - 1; y += 2) matrix.buffer[y * cols + cols - 2] = 1;
          for (let x = cols - 4; x >= 1; x -= 2) matrix.buffer[(matrix.rows - 2) * cols + x] = 1;
          for (let y = matrix.rows - 4; y >= 3; y -= 2) matrix.buffer[y * cols + 1] = 1;
          const lit = matrix.buffer.slice();
          // Seul mouvement, comme le reflet du fronton : un éclat qui traverse le titre toutes les 12 s.
          let shine = -1;
          const paint = () => {
            matrix.buffer.set(lit);
            if (shine >= 0) {
              for (let y = inner.y; y < inner.y + inner.h; y++) {
                for (let x = inner.x; x < inner.x + inner.w; x++) {
                  const i = y * cols + x;
                  if (base[i] && Math.abs(x + y * 0.5 - shine) < 3) matrix.buffer[i] = 3;
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
        });
      };
    });
  }

  // ---------- Composants HTML ----------

  /** Fronton : titre en grand lisible de loin, filet sarcelle, fabricant et année, sous un cadre de verre fumé. */
  function backglass(container, game, options) {
    return component(container, 'backglass', game, options, (ctx) => (g) => {
      const body = el('div', 'cp-bg-body');
      // Titre court : pas plus haut que la moitié du petit côté, pour rester une carte et non un mot géant.
      const title = ctx.fit(fitBox('cp-bg-title cp-game-title', g.title || BRAND), { breakable: true, max: () => 0.5 * Math.min(ctx.root.clientWidth, ctx.root.clientHeight) });
      body.append(title);
      const meta = metaOf(g);
      // Le fabricant reste en retrait du titre : au plus un gros tiers de sa taille.
      if (meta) body.append(el('div', 'cp-rule'), ctx.fit(fitBox('cp-bg-meta cp-meta-text', meta), { max: () => 0.36 * sizeOf(title) }));
      ctx.root.classList.toggle('cp-no-meta', !meta);
      ctx.root.replaceChildren(...glass(), el('div', 'cp-frame'), el('div', 'cp-corners'), body);
    });
  }

  /**
   * Logo de Cyber Pinball, celui de l'icône (scripts/icone.mjs) : bille noire chromée et
   * deux flippers sombres à liseré sarcelle, dans un cadre de verre fumé ; en couches
   * animées par le GPU.
   */
  function brandLogo() {
    const ns = 'http://www.w3.org/2000/svg';
    const logo = el('div', 'cp-logo');
    logo.setAttribute('aria-hidden', 'true');
    const svg = (cls, inner) => {
      const s = document.createElementNS(ns, 'svg');
      s.setAttribute('viewBox', '0 0 100 100');
      s.setAttribute('class', cls);
      s.innerHTML = inner;
      return s;
    };
    logo.append(
      svg(
        'cp-logo-frame',
        '<defs><linearGradient id="cp-logo-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10241f"/><stop offset="0.7" stop-color="#030807"/></linearGradient>' +
          '<linearGradient id="cp-logo-trail" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#36c9b4" stop-opacity="0"/><stop offset="1" stop-color="#7fe3d4" stop-opacity="0.95"/></linearGradient></defs>' +
          '<rect x="8.8" y="8.8" width="82.4" height="82.4" rx="15.5" fill="url(#cp-logo-bg)" stroke="#2f7f72" stroke-width="2.4"/>' +
          // Traînée de la bille, venue du coin haut droit.
          '<path d="M84 14 Q72 28 60 38 L50 27 Q66 20 84 14 Z" fill="url(#cp-logo-trail)"/>',
      ),
      el('div', 'cp-logo-ball'),
      // Flippers effilés de l'icône : pivot (23,5 ; 70,5) de rayon 5,8, pointe (44,5 ; 79) de rayon 3.
      svg('cp-logo-flip cp-logo-flip-l', '<path d="M25.68 65.12 L45.63 76.22 A3 3 0 0 1 43.37 81.78 L21.32 75.88 A5.8 5.8 0 0 1 25.68 65.12 Z"/>'),
      svg('cp-logo-flip cp-logo-flip-r', '<path d="M74.32 65.12 L54.37 76.22 A3 3 0 0 0 56.63 81.78 L78.68 75.88 A5.8 5.8 0 0 0 74.32 65.12 Z"/>'),
    );
    return logo;
  }

  /** Topper : logo animé et marque de Cyber Pinball, avec le fabricant et l'année du jeu. */
  function topper(container, game, options) {
    return component(container, 'topper', game, options, (ctx) => (g) => {
      const body = el('div', 'cp-tp-body');
      const text = el('div', 'cp-tp-text');
      const word = ctx.fit(wordmarkBox('cp-tp-word'));
      text.append(word);
      const meta = metaOf(g);
      if (meta) text.append(el('div', 'cp-rule'), ctx.fit(fitBox('cp-tp-meta cp-meta-text', meta), { max: () => 0.75 * sizeOf(word) }));
      ctx.root.classList.toggle('cp-no-meta', !meta);
      body.append(brandLogo(), text);
      ctx.root.replaceChildren(...glass(), body);
    });
  }

  const WHEEL_STYLES = ['chrome', 'neon', 'arcade'];

  /** Logo du jeu en texte stylisé, sur fond transparent, pour la liste du menu. */
  function wheel(container, game, options) {
    return component(container, 'wheel', game, options, (ctx) => (g) => {
      const style = WHEEL_STYLES.includes(ctx.options.style) ? ctx.options.style : WHEEL_STYLES[hash(`${g.title}|style`) % WHEEL_STYLES.length];
      ctx.root.replaceChildren(ctx.fit(fitBox(`cp-wh-title cp-wh-${style}`, g.title || BRAND), { breakable: true }));
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
   * Écran de chargement de secours : marque, titre, fabricant et année, barre d'attente.
   * handle.slot reçoit ce que l'appelant veut montrer dessous (les commandes de la partie).
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
        const title = ctx.fit(fitBox('cp-ld-title cp-game-title', g.title || 'Table sans titre'), { breakable: true });
        body.append(ctx.fit(wordmarkBox('cp-ld-brand')), title);
        const meta = metaOf(g);
        if (meta) body.append(ctx.fit(fitBox('cp-ld-meta cp-meta-text', meta), { max: () => 0.36 * sizeOf(title) }));
        body.append(bar, ctx.fit(fitBox('cp-ld-label cp-one-line', 'Chargement de la table…')), slot);
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
      const title = ctx.fit(fitBox('cp-ig-title cp-game-title', g.title || 'Partie en cours'), { breakable: true });
      card.append(ctx.fit(wordmarkBox('cp-ig-brand')), title);
      const meta = metaOf(g);
      if (meta) card.append(ctx.fit(fitBox('cp-ig-meta cp-meta-text', meta), { max: () => 0.45 * sizeOf(title) }));
      if (g.title) card.append(ctx.fit(fitBox('cp-ig-state cp-one-line', 'Partie en cours')));
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
    topper,
    wheel,
    playfield,
    loading,
    inGame,
    palette,
    /** Pour les essais : minuteries en cours et trames dessinées depuis le chargement. */
    stats: () => ({ tasks: tasks.size, scheduled: [...tasks].filter((t) => t.id).length, frames }),
  };
})();
