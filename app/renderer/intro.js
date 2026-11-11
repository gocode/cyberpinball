// Ouverture au démarrage (packages/core/src/intro.ts) : l'animation de Cyber Pinball de chaque
// écran de la borne. Une étincelle monte sur le plateau pendant que la bille traverse le DMD,
// le plateau s'embrase avec le fronton, le topper s'allume, comme l'énergie qui monte dans la borne. Chaque
// animation se joue une fois et garde sa dernière image : c'est le premier bouton, côté
// processus principal, qui affiche la roue.
//
//   const h = CyberIntro.playfield(conteneur, {}, { intro: { startedAt, timeline } });
//   h.destroy();
//
// La couche de média (media.js) les monte comme un repli (fallback « intro-… ») : sans fichier
// de l'utilisateur, ou à la place d'un fichier illisible. Chaque scène peint l'image d'un
// instant (paint(ms écoulées depuis le départ)), calculée d'après le rythme reçu avec l'état
// (INTRO_TIMELINE) : une fenêtre qui la monte en retard la reprend au bon moment, et les écrans
// restent d'accord. options.intro.at fige la scène à un instant (planche des essais). Au bout,
// le plateau continue en boucle, discret (ses fils tournent lentement, sa poussière dérive), à
// cadence réduite ; les autres écrans gardent leur dernière image, sans plus rien calculer.
// options.intro.loop.off coupe la boucle (essais). Les styles sont
// dans intro.css ; couleurs, marque et matière, celles du design system (fallback.css).

(() => {
  'use strict';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const SVG = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  }

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  /** Avancement de 0 à 1 entre `from` et `from + length`. */
  const span = (e, from, length) => clamp((e - from) / length);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  /**
   * Allumage d'un tube ou d'une lampe : quelques battements avant la pleine lumière, comme à la
   * mise sous tension d'une borne. `k` de 0 à 1 ; rend l'opacité.
   */
  const FLICKER = [
    [0, 0],
    [0.14, 0.55],
    [0.24, 0.08],
    [0.42, 0.8],
    [0.54, 0.25],
    [1, 1],
  ];
  function flicker(k) {
    if (k <= 0) return 0;
    if (k >= 1) return 1;
    for (let i = 1; i < FLICKER.length; i++) {
      const [x1, y1] = FLICKER[i];
      const [x0, y0] = FLICKER[i - 1];
      if (k <= x1) return y0 + ((y1 - y0) * (k - x0)) / (x1 - x0);
    }
    return 1;
  }

  function hash(n) {
    let h = (n * 2654435761) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13;
    return h / 4294967296;
  }

  // ---------- Scène : montage, horloge, taille suivie ----------

  const scenes = new Set();

  /**
   * Monte une scène : setup(root, timeline) rend { paint(e), resize?(), loop?() } ; paint dessine
   * l'instant e (ms depuis le départ ; négatif : avant le départ, l'écran reste noir). Une
   * minuterie d'images la fait avancer jusqu'à timeline.end, puis s'arrête sur la dernière image ;
   * une scène qui a loop() continue au-delà, une image toutes les loop() ms (0 : elle s'arrête).
   */
  function scene(container, kind, options, setup) {
    const intro = options?.intro ?? {};
    const timeline = intro.timeline ?? {};
    const end = timeline.end ?? 4000;
    const root = el('div', `cp-fb cp-in cp-in-${kind}`);
    root.setAttribute('aria-hidden', 'true');
    container.append(root);
    const drawn = setup(root, timeline);
    const elapsed = () => (typeof intro.at === 'number' ? intro.at : typeof intro.startedAt === 'number' ? Date.now() - intro.startedAt : -1);
    let frame = 0;
    let timer = 0;
    let last = NaN;
    /** Écran visible : la couche de média coupe la scène sous le voile de nuit ou fenêtre cachée. */
    let running = true;
    let paintedAt = 0;
    const paint = () => {
      paintedAt = performance.now();
      const e = drawn.loop ? elapsed() : Math.min(elapsed(), end);
      last = e;
      drawn.paint(e);
    };
    const tick = () => {
      frame = 0;
      timer = 0;
      paint();
      if (!running || typeof intro.at === 'number' || intro.startedAt === undefined) return;
      if (last < end) frame = requestAnimationFrame(tick);
      else {
        // La boucle : l'image suivante à l'échéance qu'elle demande depuis celle-ci, calée sur l'affichage.
        const every = drawn.loop?.() ?? 0;
        if (every > 0) timer = setTimeout(() => (frame = requestAnimationFrame(tick)), Math.max(0, every - (performance.now() - paintedAt) - 4));
      }
    };
    const observer = new ResizeObserver(() => {
      drawn.resize?.();
      if (!Number.isNaN(last)) drawn.paint(last);
    });
    observer.observe(root);
    drawn.resize?.();
    tick();
    const handle = {
      element: root,
      update() {},
      /** Instant peint, si la scène est au bout, et si elle tourne en boucle (pour les essais). */
      state: () => ({ scene: kind, at: Math.round(last), fin: last >= end, boucle: last >= end && Boolean(drawn.loop?.()) }),
      problems: () => [],
      /** Couche active ou non (media.js) : rien ne se calcule sous le voile ni fenêtre cachée ; à la reprise, l'instant du moment. */
      setActive(on) {
        if (on === running) return;
        running = on;
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        frame = 0;
        timer = 0;
        if (on) tick();
      },
      /** Redessine l'instant peint (un canevas posé avant la première peinture de la fenêtre peut ne pas être composé). */
      repaint() {
        drawn.reset?.();
        if (!Number.isNaN(last)) drawn.paint(last);
      },
      destroy() {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        observer.disconnect();
        drawn.destroy?.();
        scenes.delete(handle);
        root.remove();
      },
    };
    scenes.add(handle);
    return handle;
  }

  /** Marque empilée, une lettre par élément : CYBER au-dessus de PINBALL en vert signal. */
  function stackedLetters(className) {
    const mark = el('div', `cp-wordmark cp-wordmark-stack ${className}`);
    const letters = [];
    for (const [word, pin] of [
      ['CYBER', false],
      ['PINBALL', true],
    ]) {
      const line = el('span', pin ? 'cp-ink cp-pin' : 'cp-ink');
      for (const c of word) letters.push(line.appendChild(el('span', 'cp-in-letter', c)));
      mark.append(line);
    }
    return { mark, letters };
  }

  /** Reflet qui passe une fois sur la marque (sheen, sheenLength), comme celui du verre des replis. */
  function sheen(holder) {
    // Sa propre zone, à la taille de la marque : elle seule coupe le reflet, jamais les lettres.
    const zone = holder.appendChild(el('div', 'cp-in-sheen-zone'));
    const node = zone.appendChild(el('div', 'cp-in-sheen'));
    return (e, tl) => {
      const k = span(e, tl.sheen, tl.sheenLength);
      node.style.opacity = k > 0 && k < 1 ? '1' : '0';
      node.style.transform = `translateX(${-60 + easeInOut(k) * 320}%)`;
    };
  }

  // ---------- Plateau ----------

  // L'ouverture « Soie » de la maquette validée (11/11/2026), reprise telle quelle : le même dessin
  // en Canvas 2D, les mêmes courbes et les mêmes instants (en secondes, comme dans la maquette).
  // Des fils en fuseau se tissent depuis le bas (0,1 à 2,4 s), une étincelle monte (1,2 à 2,4 s),
  // l'ignition anamorphique s'ouvre à 2,4 s, la marque s'écarte en se précisant (2,5 à 3,4 s), en
  // texte posé sur la taille du fuseau. Ensuite, les fils tournent lentement et la poussière dérive
  // sur trois profondeurs. Le dessin est mesuré en unités d'un plateau de 1080 × 1920 : sur un écran
  // d'autres proportions (au bureau, en largeur), l'unité suit la plus petite des deux échelles, le
  // fuseau reste au centre, la ligne d'horizon et la poussière vont d'un bord à l'autre.

  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  /** Avancement de 0 à 1 entre les instants a et b (secondes). */
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    out3: (t) => 1 - Math.pow(1 - t, 3),
    io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  };
  /** Suite pseudo-aléatoire figée par sa graine : les mêmes fils et la même poussière à chaque fois. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const RGB = {};
  function rgba(h, a) {
    let v = RGB[h];
    if (!v) v = RGB[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    return `rgba(${v[0]},${v[1]},${v[2]},${a.toFixed(3)})`;
  }
  /** Couleurs du design system : noir sarcelle, sarcelle, halo, vert signal, cœur de l'éclair. */
  const C = { void: '#030807', teal: '#36c9b4', halo: '#1c8f80', sig: '#8be23a', hot: '#e8ffd0' };

  /** Grain de pellicule, une tuile de 192 points posée en « overlay » à chaque image. */
  let grainTile;
  function grain() {
    if (grainTile) return grainTile;
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 192;
    const g = grainTile.getContext('2d');
    if (!g?.createImageData) return grainTile;
    const d = g.createImageData(192, 192);
    const r = rng(7);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = (r() * 255) | 0;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return grainTile;
  }
  function glowDot(c, x, y, r, col, a) {
    if (a <= 0.005 || r <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(0.25, rgba(col, a * 0.42));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function makeDust(n, seed) {
    const r = rng(seed);
    return Array.from({ length: n }, () => ({ x: r() * 1080, y: r() * 1920, z: [0.35, 0.6, 1][(r() * 3) | 0], s: r() }));
  }
  function drawDust(c, dust, t, col, alpha, W, H) {
    if (alpha <= 0.01) return;
    c.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      const y = (((d.y - t * 38 * d.z) % H) + H) % H;
      const x = d.x * (W / 1080) + Math.sin(t * 0.3 + d.s * 9) * 20 * d.z;
      const a = alpha * (0.12 + 0.45 * d.z) * (0.6 + 0.4 * Math.sin(t * 2 + d.s * 20));
      c.fillStyle = rgba(col, a);
      c.beginPath();
      c.arc(x, y, 1.2 + 2.4 * d.z, 0, TAU);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }
  /** Un fil sur six est vert signal, comme dans la première ouverture (sarcelle à la taille, vert vers les bords), un peu plus lumineux. */
  const SPINDLE_GREEN_EVERY = 6;
  const SPINDLE_GREEN_GAIN = 1.4;
  function makeThreads(n, seed) {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => ({ th: (i / n) * TAU + r() * 0.12, w: 0.55 + r() * 0.8, d: r(), g: i % SPINDLE_GREEN_EVERY === 3 }));
  }
  /**
   * Les fils en fuseau, resserrés à la taille (cy) : chacun se tisse depuis le bas, puis tourne.
   * visit(xs, ys, a, gs) reçoit les 37 points de chaque fil (unités), son intensité et, pour un fil
   * vert, sa part de vert à chaque point (null pour un fil sarcelle). La taille du fuseau est plus
   * serrée et sa torsion plus forte que dans la maquette (11/11/2026) : les fils se croisent au centre.
   */
  const SPINDLE_WAIST = 16;
  const SPINDLE_TWIST = 0.0016;
  const SPINDLE_X = new Float64Array(37);
  const SPINDLE_Y = new Float64Array(37);
  const SPINDLE_G = new Float64Array(37);
  const smooth = (a, b, x) => {
    const k = clamp((x - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  function spindle(threads, t, grow, ign, W, H, visit) {
    const cx = W / 2;
    const cy = H / 2;
    for (const th of threads) {
      const p = grow ? E.out3(seg(t, 0.1 + th.d * 0.7, 1.7 + th.d * 0.7)) : 1;
      if (p <= 0) continue;
      const yEnd = lerp(H + 80, -80, p);
      const base = th.th + t * 0.22;
      const depth = (Math.sin(base) + 1) / 2;
      for (let j = 0; j <= 36; j++) {
        const y = lerp(H + 80, yEnd, j / 36);
        const k = Math.abs(y - cy) / 1000;
        const wd = SPINDLE_WAIST + 560 * Math.pow(k, 1.7) * th.w;
        SPINDLE_X[j] = cx + Math.cos(base + (y - cy) * SPINDLE_TWIST) * wd;
        SPINDLE_Y[j] = y;
        if (th.g) SPINDLE_G[j] = smooth(0.04, 0.5, Math.abs(y - cy) / cy);
      }
      visit(SPINDLE_X, SPINDLE_Y, (0.08 + 0.32 * depth) * (1 + 1.8 * ign) * (th.g ? SPINDLE_GREEN_GAIN : 1), th.g ? SPINDLE_G : null);
    }
  }
  function drawSpindle(c, threads, t, grow, alpha, ign, W, H) {
    c.globalCompositeOperation = 'lighter';
    spindle(threads, t, grow, ign, W, H, (xs, ys, a0, gs) => {
      const a = a0 * alpha;
      c.beginPath();
      for (let j = 0; j <= 36; j++) {
        if (j) c.lineTo(xs[j], ys[j]);
        else c.moveTo(xs[j], ys[j]);
      }
      // Fil vert : un dégradé vertical, sarcelle à la taille, vert vers les bords.
      const tone = (k) => {
        if (!gs) return rgba(C.teal, a * k);
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, rgba(C.sig, a * k));
        g.addColorStop(0.48, rgba(C.teal, a * k));
        g.addColorStop(0.52, rgba(C.teal, a * k));
        g.addColorStop(1, rgba(C.sig, a * k));
        return g;
      };
      c.strokeStyle = tone(0.18);
      c.lineWidth = 8;
      c.stroke();
      c.strokeStyle = tone(1);
      c.lineWidth = 1.8;
      c.stroke();
    });
    c.globalCompositeOperation = 'source-over';
  }

  /** Les valeurs d'un instant t (secondes) : ignition, étincelle, éclair, ligne d'horizon, éclat, poussière. */
  function soieAt(t, H) {
    const cy = H / 2;
    const ign = t > 2.4 ? Math.exp(-(t - 2.4) * 1.5) : 0;
    const g = t > 2.4 ? E.expo(seg(t, 2.4, 2.8)) : 0;
    return {
      ign,
      halo: 0.16 + 0.3 * ign,
      spark: t > 1.2 && t < 2.45 ? lerp(H + 40, cy, E.io3(seg(t, 1.2, 2.4))) : undefined,
      flare: t > 2.4 ? 1400 * g + 1 : 0,
      horizon: t > 2.4 ? (0.16 + 0.25 * ign) * g : 0,
      flash: t > 2.4 && t < 2.65 ? 0.14 * (1 - seg(t, 2.4, 2.65)) : 0,
      dust: seg(t, 2.4, 3.6),
    };
  }

  /** Une image de l'ouverture à l'instant t (secondes), sur le contexte déjà mis à l'échelle (W × H unités). */
  function drawSoie(c, s, t, W, H) {
    const cx = W / 2;
    const cy = H / 2;
    const f = soieAt(t, H);
    c.fillStyle = C.void;
    c.fillRect(0, 0, W, H);
    const bg = c.createRadialGradient(cx, cy, 0, cx, cy, 1000);
    bg.addColorStop(0, rgba(C.halo, f.halo));
    bg.addColorStop(1, rgba(C.halo, 0));
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    drawSpindle(c, s.threads, t, true, 1, f.ign, W, H);
    c.globalCompositeOperation = 'lighter';
    // L'étincelle monte du bas jusqu'à la taille du fuseau, sa traînée derrière elle.
    if (f.spark !== undefined) {
      const y = f.spark;
      const tr = c.createLinearGradient(0, y, 0, y + 360);
      tr.addColorStop(0, rgba(C.sig, 0.75));
      tr.addColorStop(1, rgba(C.sig, 0));
      c.fillStyle = tr;
      c.fillRect(cx - 3, y, 6, 360);
      glowDot(c, cx, y, 90, C.sig, 0.55);
      glowDot(c, cx, y, 18, C.hot, 1);
    }
    // L'ignition : un éclair aplati (anamorphique), la ligne d'horizon, un éclat sur tout l'écran.
    if (f.flare > 0) {
      const R = f.flare;
      c.save();
      c.translate(cx, cy);
      c.scale(1, 0.04);
      const fg = c.createRadialGradient(0, 0, 0, 0, 0, R);
      fg.addColorStop(0, rgba(C.hot, 0.95 * f.ign));
      fg.addColorStop(0.1, rgba(C.sig, 0.7 * f.ign));
      fg.addColorStop(0.45, rgba(C.teal, 0.22 * f.ign));
      fg.addColorStop(1, rgba(C.teal, 0));
      c.fillStyle = fg;
      c.fillRect(-R, -R, 2 * R, 2 * R);
      c.restore();
      const hl = c.createLinearGradient(0, 0, W, 0);
      hl.addColorStop(0, rgba(C.teal, 0));
      hl.addColorStop(0.5, rgba(C.sig, f.horizon));
      hl.addColorStop(1, rgba(C.teal, 0));
      c.fillStyle = hl;
      c.fillRect(0, cy - 1, W, 2);
      if (f.flash > 0) {
        c.fillStyle = rgba(C.sig, f.flash);
        c.fillRect(0, 0, W, H);
      }
    }
    c.globalCompositeOperation = 'source-over';
    drawDust(c, s.dust, t, C.teal, f.dust, W, H);
  }

  // ---------- Plateau : le même dessin, tracé par la carte graphique ----------
  //
  // Le Canvas 2D trace mal 92 traits larges en addition : 160 ms par image en 4K, la borne saccade.
  // WebGL2 trace exactement le même dessin (mêmes formules, mêmes instants, mêmes couleurs) en
  // quelques millisecondes : le fond (noir, halo, étincelle, éclair, ligne d'horizon, éclat) est
  // calculé au pixel, les fils et la poussière sont des bandes et des disques additionnés, le grain
  // est la même tuile décalée au hasard à chaque image. Le Canvas 2D reste le secours sans WebGL2.

  const GL_RGB = (h) => `vec3(${[1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(5)).join(', ')})`;
  const SOIE_VERTEX_FULL = '#version 300 es\nin vec2 p;\nvoid main() { gl_Position = vec4(p, 0.0, 1.0); }';
  // Fond au pixel ; glow() reprend glowDot : a au centre, 0,42 a au quart du rayon, rien au bord.
  const SOIE_FRAGMENT_FULL = `#version 300 es
precision highp float;
uniform vec2 u_size;
uniform float u_k;
uniform float u_halo;
uniform vec2 u_spark;
uniform vec2 u_flare;
uniform float u_horizon;
uniform float u_flash;
out vec4 o;
const vec3 VOID = ${GL_RGB(C.void)};
const vec3 HALO = ${GL_RGB(C.halo)};
const vec3 TEAL = ${GL_RGB(C.teal)};
const vec3 SIG = ${GL_RGB(C.sig)};
const vec3 HOT = ${GL_RGB(C.hot)};
float glow(float d, float a) {
  return d < 0.25 ? mix(a, a * 0.42, d / 0.25) : d < 1.0 ? mix(a * 0.42, 0.0, (d - 0.25) / 0.75) : 0.0;
}
void main() {
  vec2 q = vec2(gl_FragCoord.x / u_k, u_size.y - gl_FragCoord.y / u_k);
  vec2 c = u_size * 0.5;
  vec3 col = mix(VOID, HALO, u_halo * max(0.0, 1.0 - length(q - c) / 1000.0));
  if (u_spark.y > 0.5) {
    float y = u_spark.x;
    if (abs(q.x - c.x) < 3.0 && q.y >= y && q.y < y + 360.0) col += SIG * 0.75 * (1.0 - (q.y - y) / 360.0);
    float d = length(q - vec2(c.x, y));
    col += SIG * glow(d / 90.0, 0.55) + HOT * glow(d / 18.0, 1.0);
  }
  if (u_flare.x > 0.0) {
    float ign = u_flare.y;
    float d = length(vec2(q.x - c.x, (q.y - c.y) / 0.04)) / u_flare.x;
    vec3 s0 = HOT * 0.95 * ign;
    vec3 s1 = SIG * 0.7 * ign;
    vec3 s2 = TEAL * 0.22 * ign;
    col += d < 0.1 ? mix(s0, s1, d / 0.1) : d < 0.45 ? mix(s1, s2, (d - 0.1) / 0.35) : d < 1.0 ? mix(s2, vec3(0.0), (d - 0.45) / 0.55) : vec3(0.0);
    if (abs(q.y - c.y) < 1.0) col += SIG * u_horizon * (1.0 - abs(q.x / u_size.x * 2.0 - 1.0));
    col += SIG * u_flash;
  }
  o = vec4(col, 1.0);
}`;
  // Bandes (fils) et disques (poussière) : d = (position dans la largeur, ou dans le disque ; intensité ;
  // demi-largeur en points), g = part de vert signal du fil à ce point.
  const SOIE_VERTEX_MARKS = `#version 300 es
in vec2 a_pos;
in vec4 a_d;
in float a_g;
uniform vec2 u_size;
out vec4 v_d;
out float v_g;
void main() {
  v_d = a_d;
  v_g = a_g;
  vec2 p = a_pos / u_size;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;
  const SOIE_FRAGMENT_MARKS = `#version 300 es
precision highp float;
in vec4 v_d;
in float v_g;
uniform float u_round;
out vec4 o;
const vec3 TEAL = ${GL_RGB(C.teal)};
const vec3 SIG = ${GL_RGB(C.sig)};
void main() {
  float r = u_round > 0.5 ? length(v_d.xy) : abs(v_d.x);
  float cover = clamp((1.0 - r) * v_d.w, 0.0, 1.0);
  o = vec4(mix(TEAL, SIG, v_g) * v_d.z * cover, 1.0);
}`;
  // Grain : « overlay » à 7 % sur un fond sombre, soit le fond multiplié par 0,93 à 1,07.
  const SOIE_FRAGMENT_GRAIN = `#version 300 es
precision highp float;
uniform sampler2D u_noise;
uniform vec2 u_off;
out vec4 o;
void main() {
  float g = texture(u_noise, (gl_FragCoord.xy + u_off) / 192.0).r;
  o = vec4(vec3((0.93 + 0.14 * g) * 0.5), 1.0);
}`;

  function glCompile(gl, vertex, fragment) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      console.error(`Ouverture : shader refusé : ${gl.getShaderInfoLog(shader)}`);
      return undefined;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return undefined;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'p');
    gl.bindAttribLocation(program, 0, 'a_pos');
    gl.bindAttribLocation(program, 1, 'a_d');
    gl.bindAttribLocation(program, 2, 'a_g');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`Ouverture : programme refusé : ${gl.getProgramInfoLog(program)}`);
      return undefined;
    }
    const u = {};
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) ?? 0;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(program, i)?.name;
      if (name) u[name] = gl.getUniformLocation(program, name);
    }
    return { program, u };
  }

  /** Fils : deux passes par fil (lueur de 8 unités, trait de 1,8), bandes jointes ; poussière : 70 disques. Sept nombres par sommet. */
  const MARKS_MAX = 46 * 2 * (74 + 2) + 70 * 6;

  /** Le dessin de l'ouverture tracé par WebGL2 sur `canvas` ; undefined si WebGL2 refuse. */
  function soieGL(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) return undefined;
    const full = glCompile(gl, SOIE_VERTEX_FULL, SOIE_FRAGMENT_FULL);
    const marks = glCompile(gl, SOIE_VERTEX_MARKS, SOIE_FRAGMENT_MARKS);
    const grainP = glCompile(gl, SOIE_VERTEX_FULL, SOIE_FRAGMENT_GRAIN);
    if (!full || !marks || !grainP) return undefined;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const fullVao = vao;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const marksVao = gl.createVertexArray();
    gl.bindVertexArray(marksVao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, MARKS_MAX * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    const data = new Float32Array(MARKS_MAX * 7);
    // La tuile de grain de la maquette (même graine), en niveaux de gris.
    const noise = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, noise);
    const values = new Uint8Array(192 * 192);
    const r = rng(7);
    for (let i = 0; i < values.length; i++) values[i] = (r() * 255) | 0;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 192, 192, 0, gl.RED, gl.UNSIGNED_BYTE, values);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    /** Une image : W × H unités, k points par unité, s les fils et la poussière ; grain ou non. */
    function draw(s, t, W, H, k, withGrain) {
      const f = soieAt(t, H);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(full.program);
      gl.uniform2f(full.u.u_size, W, H);
      gl.uniform1f(full.u.u_k, k);
      gl.uniform1f(full.u.u_halo, f.halo);
      gl.uniform2f(full.u.u_spark, f.spark ?? 0, f.spark === undefined ? 0 : 1);
      gl.uniform2f(full.u.u_flare, f.flare, f.ign);
      gl.uniform1f(full.u.u_horizon, f.horizon);
      gl.uniform1f(full.u.u_flash, f.flash);
      gl.bindVertexArray(fullVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Fils : bandes jointes en une seule suite de triangles (sommets répétés entre deux bandes).
      let n = 0;
      const put = (x, y, a, b, c, d, g) => {
        const i = n * 7;
        data[i] = x;
        data[i + 1] = y;
        data[i + 2] = a;
        data[i + 3] = b;
        data[i + 4] = c;
        data[i + 5] = d;
        data[i + 6] = g;
        n += 1;
      };
      const repeat = () => {
        data.copyWithin(n * 7, (n - 1) * 7, n * 7);
        n += 1;
      };
      const aa = 0.5 / k;
      spindle(s.threads, t, true, f.ign, W, H, (xs, ys, a, gs) => {
        for (const [half, alpha] of [
          [4, a * 0.18],
          [0.9, a],
        ]) {
          const e = half + aa;
          const px = e * k;
          for (let j = 0; j <= 36; j++) {
            const j0 = Math.max(0, j - 1);
            const j1 = Math.min(36, j + 1);
            let tx = xs[j1] - xs[j0];
            let ty = ys[j1] - ys[j0];
            const len = Math.hypot(tx, ty) || 1;
            tx /= len;
            ty /= len;
            const nx = -ty * e;
            const ny = tx * e;
            put(xs[j] + nx, ys[j] + ny, 1, 0, alpha, px, gs ? gs[j] : 0);
            if (j === 0 && n > 1) repeat();
            put(xs[j] - nx, ys[j] - ny, -1, 0, alpha, px, gs ? gs[j] : 0);
          }
          repeat();
        }
      });
      const strip = n;
      // Poussière : des disques, deux triangles chacun.
      if (f.dust > 0.01) {
        for (const d of s.dust) {
          const y = (((d.y - t * 38 * d.z) % H) + H) % H;
          const x = d.x * (W / 1080) + Math.sin(t * 0.3 + d.s * 9) * 20 * d.z;
          const a = f.dust * (0.12 + 0.45 * d.z) * (0.6 + 0.4 * Math.sin(t * 2 + d.s * 20));
          const rr = 1.2 + 2.4 * d.z + aa;
          const px = rr * k;
          for (const [ox, oy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, -1],
            [1, 1],
            [-1, 1],
          ]) put(x + ox * rr, y + oy * rr, ox, oy, a, px, 0);
        }
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(marks.program);
      gl.uniform2f(marks.u.u_size, W, H);
      gl.bindVertexArray(marksVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 7);
      if (strip > 2) {
        gl.uniform1f(marks.u.u_round, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, strip);
      }
      if (n > strip) {
        gl.uniform1f(marks.u.u_round, 1);
        gl.drawArrays(gl.TRIANGLES, strip, n - strip);
      }
      if (withGrain) {
        gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR);
        gl.useProgram(grainP.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, noise);
        gl.uniform1i(grainP.u.u_noise, 0);
        gl.uniform2f(grainP.u.u_off, (Math.random() * 192) | 0, (Math.random() * 192) | 0);
        gl.bindVertexArray(fullVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindVertexArray(null);
    }
    return {
      draw,
      clear() {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(...[1, 3, 5].map((i) => parseInt(C.void.slice(i, i + 2), 16) / 255), 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      lost: () => gl.isContextLost(),
      destroy: () => gl.getExtension('WEBGL_lose_context')?.loseContext(),
    };
  }

  /** Grand côté du canevas WebGL : celui de l'écran (4K au plus), réduit d'un quart si la carte ne suit pas. */
  const PLAYFIELD_LIVE_MAX = 3840;
  const PLAYFIELD_LIVE_MIN = 1920;
  /** Grand côté du canevas de secours (Canvas 2D, sans WebGL2). */
  const PLAYFIELD_FLAT_MAX = 1920;
  /** Écart entre deux images de la boucle (ms), du plus fluide au plus économe. */
  const PLAYFIELD_LOOP_STEPS = [1000 / 30, 1000 / 20, 1000 / 15];

  /**
   * Plateau : l'ouverture Soie, puis sa boucle (les fils tournent, la poussière dérive). L'invite
   * de l'application se pose en bas de l'écran (frontend.css, .intro-hint-box), à l'instant
   * timeline.hint.
   */
  function playfield(container, game, options) {
    return scene(container, 'playfield', options, (root, tl) => {
      const title = el('div', 'cp-in-title');
      title.append(el('span', 'cp-ink', 'CYBER'), document.createTextNode(' '), el('span', 'cp-pin', 'PINBALL'));
      // Mesures : k points du canevas par unité, u pixels CSS par unité, W × H unités.
      let k = 1;
      let u = 1;
      let W = 1080;
      let H = 1920;
      let size = '';
      let pattern = null;
      let shownTitle = '';
      let liveMax = PLAYFIELD_LIVE_MAX;
      root.append(title);
      let canvas = root.insertBefore(el('canvas', 'cp-in-canvas cp-in-gl'), title);
      let gl = soieGL(canvas);
      let ctx = null;
      /** Sans WebGL2 (ou contexte perdu) : le même dessin en Canvas 2D, sur un canevas plus petit. */
      const flat = () => {
        gl?.destroy();
        gl = undefined;
        canvas.remove();
        canvas = root.insertBefore(el('canvas', 'cp-in-canvas cp-in-flat'), title);
        ctx = canvas.getContext('2d');
        size = '';
      };
      if (!gl) flat();
      canvas.addEventListener('webglcontextlost', () => {
        flat();
        handle.repaint();
      });
      const s = { threads: makeThreads(46, 11), dust: makeDust(70, 35) };
      const loopTune = options?.intro?.loop;
      const still = () => typeof options?.intro?.at === 'number';
      const fit = () => {
        const cssW = root.clientWidth || 1;
        const cssH = root.clientHeight || 1;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const most = gl ? liveMax : PLAYFIELD_FLAT_MAX;
        const scale = Math.min(dpr, most / Math.max(cssW, cssH));
        const w = Math.max(2, Math.round(cssW * scale));
        const h = Math.max(2, Math.round(cssH * scale));
        const key = `${w}x${h}`;
        if (key !== size) {
          size = key;
          canvas.width = w;
          canvas.height = h;
          pattern = null;
        }
        k = Math.min(w / 1080, h / 1920);
        u = Math.min(cssW / 1080, cssH / 1920);
        W = w / k;
        H = h / k;
        const font = `${(56 * u).toFixed(2)}px`;
        if (title.style.fontSize !== font) {
          title.style.fontSize = font;
          shownTitle = '';
        }
      };
      /** La marque : elle paraît, s'écarte et se précise (2,5 à 3,4 s). */
      const setTitle = (t) => {
        const tp = E.out3(seg(t, 2.5, 3.4));
        const ls = lerp(0.06, 0.4, tp);
        const blur = (1 - tp) * 10 * u;
        const key = `${tp.toFixed(3)}:${blur.toFixed(2)}`;
        if (key === shownTitle) return;
        shownTitle = key;
        const st = title.style;
        st.opacity = tp.toFixed(3);
        st.letterSpacing = `${ls.toFixed(3)}em`;
        st.paddingLeft = `${ls.toFixed(3)}em`;
        st.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
      };
      const grainOn = () => {
        if (!ctx.createPattern) return;
        if (!pattern) pattern = ctx.createPattern(grain(), 'repeat');
        if (!pattern) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, -((Math.random() * 192) | 0), -((Math.random() * 192) | 0));
        ctx.globalAlpha = 0.07;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, canvas.width + 192, canvas.height + 192);
        ctx.restore();
      };
      /** Six images de suite trop espacées pendant l'animation : le canevas perd un quart de sa taille. */
      let lastAt = 0;
      let slow = 0;
      const pace = () => {
        const now = performance.now();
        const dt = now - lastAt;
        lastAt = now;
        if (dt > 100 || !gl) return;
        slow = dt > 26 ? slow + 1 : Math.max(0, slow - 1);
        if (slow < 6 || liveMax <= PLAYFIELD_LIVE_MIN) return;
        liveMax = Math.max(PLAYFIELD_LIVE_MIN, Math.round(liveMax * 0.75));
        slow = 0;
      };
      /**
       * Cadence de la boucle : une image toutes les PLAYFIELD_LOOP_STEPS[step] ms. Huit images de
       * suite en retard de moitié (la carte graphique ou la fenêtre ne suit pas) : un cran plus lent.
       */
      let step = 0;
      let late = 0;
      let loopAt = 0;
      const loopPace = () => {
        const now = performance.now();
        const dt = now - loopAt;
        loopAt = now;
        // Fenêtre cachée ou reprise après une pause : rien à juger.
        if (dt > 1000) return;
        late = dt > PLAYFIELD_LOOP_STEPS[step] * 1.5 ? late + 1 : Math.max(0, late - 1);
        if (late < 8 || step >= PLAYFIELD_LOOP_STEPS.length - 1) return;
        step += 1;
        late = 0;
      };
      const end = tl.end ?? 4000;
      let lastE = -1;
      const draw = (e) => {
        lastE = e;
        if (!still()) {
          if (e >= 0 && e < end) pace();
          else if (e >= end) loopPace();
        }
        fit();
        if (e < 0) {
          title.style.opacity = '0';
          shownTitle = '';
          if (gl) gl.clear();
          else if (ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = C.void;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          return;
        }
        const t = e / 1000;
        // Instant figé (planche des essais) : sans grain, pour des images comparables.
        if (gl) gl.draw(s, t, W, H, k, !still());
        else if (ctx) {
          ctx.setTransform(k, 0, 0, k, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          drawSoie(ctx, s, t, W, H);
          if (!still()) grainOn();
        }
        setTitle(t);
      };
      const handle = {
        resize() {
          size = '';
        },
        paint: draw,
        /** La boucle tant que le canevas dessine ; options.intro.loop.off la coupe (essais). */
        loop: () => ((gl || ctx) && !loopTune?.off ? PLAYFIELD_LOOP_STEPS[step] : 0),
        reset() {
          size = '';
        },
        repaint() {
          draw(lastE);
        },
        destroy() {
          gl?.destroy();
        },
      };
      return handle;
    });
  }

  // ---------- Fronton ----------

  /**
   * Fronton : ses lampes s'allument en vacillant (l'illustration de la DA, comme éclairée par
   * derrière), puis la marque, lettre par lettre, comme des tubes de néon ; un reflet passe.
   * Dernière image : la couverture de la marque (le fronton sans jeu, fallback.js).
   */
  function backglass(container, game, options) {
    return scene(container, 'backglass', options, (root, tl) => {
      root.classList.add('cp-fb-backglass', 'cp-bg-brand');
      const art = root.appendChild(el('div', 'cp-bg-art'));
      const { mark, letters } = stackedLetters('cp-bg-mark');
      root.append(mark);
      const passSheen = sheen(mark);
      return {
        paint(e) {
          art.style.opacity = String(flicker(span(e, tl.backglassPower, 650)));
          art.style.transform = `scale(${1.035 - 0.035 * easeOut(span(e, tl.backglassPower, 1800))})`;
          // La première lettre de chaque mot vacille comme un tube qui s'allume ; les suivantes montent.
          letters.forEach((letter, i) => {
            const from = tl.backglassBrand + i * 85 + (i >= 5 ? 120 : 0);
            letter.style.opacity = String(i === 0 || i === 5 ? flicker(span(e, from, 260)) : easeOut(span(e, from, 180)));
          });
          passSheen(e, tl);
        },
      };
    });
  }

  // ---------- Topper ----------

  /**
   * Topper : un trait de lumière le traverse de gauche à droite et laisse derrière lui le logo
   * et la marque (le topper sans jeu, fallback.js) ; le logo s'allume à son passage.
   */
  function topper(container, game, options) {
    return scene(container, 'topper', options, (root, tl) => {
      const body = root.appendChild(el('div', 'cp-in-reveal'));
      const kit = window.CyberFallback;
      const inner = typeof kit?.topper === 'function' ? kit.topper(body, { title: '' }, { animate: false }) : undefined;
      const bar = root.appendChild(el('div', 'cp-in-bar'));
      const passSheen = sheen(body);
      const logo = () => body.querySelector('.cp-logo');
      return {
        paint(e) {
          const k = span(e, tl.topperSweep, tl.topperSweepLength);
          const x = easeInOut(k);
          body.style.clipPath = `inset(0 ${(1 - x) * 100}% 0 0)`;
          bar.style.opacity = String(k > 0 && k < 1 ? 1 : 0);
          bar.style.left = `${x * 100}%`;
          const l = logo();
          if (l) {
            const lit = easeOut(span(e, tl.topperSweep + tl.topperSweepLength * 0.25, 420));
            l.style.opacity = String(Math.max(0.15, lit));
            l.style.transform = `scale(${0.9 + 0.1 * lit})`;
          }
          passSheen(e, tl);
        },
        destroy: () => inner?.destroy(),
      };
    });
  }

  // ---------- Afficheurs à points ----------

  const LV = () => window.CyberFallback?.points?.levels ?? { main: 14, quiet: 11, lamp: 5, flash: 15, brandCyber: 11, brandPinball: 15 };

  /** Marque empilée sur la grille : CYBER un ton dessous, PINBALL au plein éclat, centrée dans `area`. */
  function brandDots(cols, rows, area) {
    const points = window.CyberFallback?.points;
    const dots = new Uint8Array(cols * rows);
    if (!points) return dots;
    const cyber = points.text('CYBER', 'marque', LV().brandCyber);
    const pinball = points.text('PINBALL', 'marque', LV().brandPinball);
    const gap = 4;
    const top = area.y + Math.floor((area.h - (cyber.h + gap + pinball.h)) / 2);
    const blit = (bmp, x0, y0) => {
      for (let y = 0; y < bmp.h; y++) for (let x = 0; x < bmp.w; x++) {
        const tx = x0 + x;
        const ty = y0 + y;
        if (tx >= 0 && tx < cols && ty >= 0 && ty < rows && bmp.px[y * bmp.w + x]) dots[ty * cols + tx] = bmp.px[y * bmp.w + x];
      }
    };
    blit(cyber, area.x + Math.floor((area.w - cyber.w) / 2), top);
    blit(pinball, area.x + Math.floor((area.w - pinball.w) / 2), top + cyber.h + gap);
    return dots;
  }

  /** Disque lumineux qui traverse la grille de bas en haut (k de 0 à 1), sa traînée dessous : la bille. */
  function drawPass(dots, cols, rows, k, radius) {
    const cx = cols / 2;
    const cy = rows + radius - k * (rows + 2 * radius);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy) / radius;
      let level = d <= 0.45 ? 15 : d <= 0.75 ? 9 : d <= 1 ? 4 : 0;
      const behind = dy - radius;
      if (behind >= 0 && behind < radius * 2.2 && Math.abs(dx) <= Math.max(1.5, radius * 0.3)) level = Math.max(level, Math.round(8 * (1 - behind / (radius * 2.2))));
      const i = y * cols + x;
      if (level > dots[i]) dots[i] = level;
    }
  }

  /** Mise sous tension : des points s'allument au hasard, de plus en plus, puis s'éteignent avant la bille. */
  function drawPower(dots, e, from, length) {
    const k = span(e, from, length);
    if (k <= 0 || k >= 1) return;
    // Discrète (15 % des points au plus, nuances 1 à 4) : la bille qui suit doit dominer.
    const density = k < 0.7 ? (k / 0.7) * 0.15 : 0.15 * (1 - (k - 0.7) / 0.3);
    const bucket = Math.floor(e / 45);
    for (let i = 0; i < dots.length; i++) {
      if (hash(i * 7 + 3) < density) dots[i] = Math.max(dots[i], 1 + Math.floor(hash(i + bucket * 131) * 4));
    }
  }

  /**
   * La marque paraît derrière un trait qui balaie la grille de gauche à droite (k de 0 à 1) ;
   * le trait éclaire les points qu'il touche.
   */
  function drawWipe(dots, brand, cols, rows, k) {
    const edge = -4 + k * (cols + 8);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const d = edge - x;
      if (d < 0) continue;
      if (brand[i]) dots[i] = Math.max(dots[i], d < 3 ? 15 : brand[i]);
    }
    if (k > 0 && k < 1) {
      for (let y = 0; y < rows; y++) for (const dx of [0, 1]) {
        const x = Math.floor(edge) + dx;
        if (x >= 0 && x < cols) dots[y * cols + x] = Math.max(dots[y * cols + x], dx ? 7 : 4);
      }
    }
  }

  /** Reflet en biais sur les points allumés de la marque, une fois. */
  function drawShine(dots, brand, cols, rows, k) {
    if (k <= 0 || k >= 1) return;
    const pos = -rows + k * (cols + rows * 2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (brand[i] && Math.abs(x + y * 0.5 - pos) < 3) dots[i] = 15;
    }
  }

  /** Lampes du cadre (une sur deux le long du bord), dans l'ordre d'un tour en partant du bas, au milieu. */
  function frameLamps(cols, rows) {
    const lamps = [];
    for (let x = Math.floor(cols / 2); x < cols - 2; x += 2) lamps.push([x, rows - 2]);
    for (let y = rows - 4; y >= 3; y -= 2) lamps.push([cols - 2, y]);
    for (let x = cols - 4; x >= 1; x -= 2) lamps.push([x, 1]);
    for (let y = 3; y < rows - 2; y += 2) lamps.push([1, y]);
    for (let x = 1; x < Math.floor(cols / 2); x += 2) lamps.push([x, rows - 2]);
    return lamps;
  }

  function dotScene(container, kind, options, cols, rows, draw) {
    return scene(container, kind, options, (root, tl) => {
      const kit = window.CyberFallback;
      const matrix = typeof kit?.dotMatrix === 'function' ? kit.dotMatrix(root, { cols, rows }) : undefined;
      const paintDots = draw(tl);
      let shown = '';
      return {
        paint(e) {
          if (!matrix) return;
          const dots = paintDots(e);
          // Une image qui ne change pas n'est pas redessinée (tenue sur la dernière image).
          const key = dots.join('');
          if (key === shown) return;
          shown = key;
          matrix.show(dots);
        },
        reset: () => (shown = ''),
        destroy: () => matrix?.destroy(),
      };
    });
  }

  /**
   * DMD 4:1 (128 × 32) : mise sous tension (points au hasard), la bille traverse l'afficheur de
   * bas en haut, la marque se dessine derrière un trait de balayage, un reflet passe.
   */
  function dmd(container, game, options) {
    return dotScene(container, 'dmd', options, 128, 32, (tl) => {
      const brand = brandDots(128, 32, { x: 0, y: 0, w: 128, h: 32 });
      return (e) => {
        const dots = new Uint8Array(128 * 32);
        if (e < 0) return dots;
        drawPower(dots, e, tl.dmdPower, tl.dmdPass - tl.dmdPower);
        const pass = span(e, tl.dmdPass, tl.dmdPassLength);
        if (pass > 0 && pass < 1) drawPass(dots, 128, 32, pass, 4.5);
        drawWipe(dots, brand, 128, 32, span(e, tl.dmdBrand, tl.dmdBrandLength));
        drawShine(dots, brand, 128, 32, span(e, tl.sheen, tl.sheenLength));
        return dots;
      };
    });
  }

  /**
   * FullDMD (160 × 90) : le cadre de lampes s'allume d'un tour, la bille traverse l'afficheur,
   * la marque se dessine, puis PRESS START clignote deux fois et reste allumé.
   */
  function fullDmd(container, game, options) {
    const cols = 160;
    const rows = 90;
    return dotScene(container, 'fulldmd', options, cols, rows, (tl) => {
      const points = window.CyberFallback?.points;
      // Un ton sous la marque, qui doit dominer ; les mots de l'afficheur restent ceux des flippers.
      const press = points ? points.text('PRESS START', 'petit', 10) : { w: 0, h: 0, px: new Uint8Array() };
      // Marque et PRESS START forment un bloc centré dans le cadre (marges de 6 points).
      const block = 26 + 9 + press.h;
      const top = 6 + Math.floor((rows - 12 - block) / 2);
      const brand = brandDots(cols, rows, { x: 6, y: top, w: cols - 12, h: 26 });
      const lamps = frameLamps(cols, rows);
      return (e) => {
        const dots = new Uint8Array(cols * rows);
        if (e < 0) return dots;
        // Cadre : un tour de lampes, la dernière allumée au plein éclat.
        const k = span(e, tl.dmdPower, tl.dmdPass - tl.dmdPower - 60);
        const lit = Math.floor(k * lamps.length);
        lamps.forEach(([x, y], j) => {
          if (j < lit) dots[y * cols + x] = j >= lit - 3 && k < 1 ? 15 - (lit - 1 - j) * 3 : 3;
        });
        const pass = span(e, tl.dmdPass, tl.dmdPassLength);
        if (pass > 0 && pass < 1) drawPass(dots, cols, rows, pass, 7);
        drawWipe(dots, brand, cols, rows, span(e, tl.dmdBrand, tl.dmdBrandLength));
        drawShine(dots, brand, cols, rows, span(e, tl.sheen, tl.sheenLength));
        // PRESS START : deux battements (250 ms allumé, 150 ms éteint), puis allumé.
        const p = e - tl.dmdPress;
        const on = p >= 0 && (p >= 800 || p % 400 < 250);
        if (on) {
          const x0 = Math.floor((cols - press.w) / 2);
          const y0 = top + 26 + 9;
          for (let y = 0; y < press.h; y++) for (let x = 0; x < press.w; x++) if (press.px[y * press.w + x]) dots[(y0 + y) * cols + x0 + x] = press.px[y * press.w + x];
        }
        return dots;
      };
    });
  }

  window.CyberIntro = {
    playfield,
    backglass,
    topper,
    dmd,
    fullDmd,
    /** Pour les essais : chaque scène montée, son instant, et si elle est au bout. */
    scenes: () => [...scenes].map((h) => h.state()),
    repaint: () => scenes.forEach((h) => h.repaint()),
  };
})();
