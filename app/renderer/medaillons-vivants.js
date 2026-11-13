// Médaillons vivants des rubriques (13/11/2026) : l'intérieur des médaillons Juke-box (« Onde ») et
// Communauté (« Montée ») dessiné en direct dans un canevas, sous l'anneau chromé commun
// (medaillons/contour.png, contour-512.webp). Dessin validé par le mainteneur sur la planche du
// 13/11/2026 : trois fils Soie en fuseau autour du rond à la note ; le même rond avec le bonhomme vert,
// et des bulles de discussion qui montent, portant des emojis ou trois points. Un reflet en haut à
// gauche donne le volume.
//
//   CyberMedaillons.wheelNodes(kind, alt)       // [canevas, anneau] pour une place de la roue
//   CyberMedaillons.medallion(kind, className)  // médaillon complet (canevas + anneau pleine définition)
//   CyberMedaillons.waves(canvas, anchor, opts) // fils d'Onde sur toute une zone (écran du Juke-box, fronton)
//   CyberMedaillons.track(canvas, bar, playing) // barre de progression en fil vert, étincelle en tête
//   CyberMedaillons.paint(kind, ctx, px, t)     // un intérieur dessiné dans un carré de px (générateur)
//
// Animation : une seule boucle pour tous les canevas. Dans la roue, seul le médaillon du centre
// s'anime ; un voisin revient à sa première image (réglage « Logos animés : tous » : tous s'animent).
// Image figée quand le système demande moins d'animations ou que la fenêtre est cachée.
// Repère des intérieurs : 300 × 300, disque de rayon 147 centré (le trou de l'anneau).

(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const D = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const frac = (v) => v - Math.floor(v);
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const mix = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const VIOLET = [170, 132, 220];
  const TEAL = [53, 200, 189];
  const SIGNAL = [139, 226, 58];
  const META = [95, 180, 207];
  /** Part du trou de l'anneau dans l'image du contour (742 px sur 920, rayon 371 : sous le chrome). */
  const HOLE = 742 / 920;

  // ---------- Pièces communes ----------

  function ring(c, r) {
    c.beginPath();
    c.arc(150, 150, r, 0, TAU);
    c.stroke();
  }

  /** Disque sarcelle éclairé d'en haut à gauche, deux sillons discrets. */
  function disc(c) {
    const g = c.createRadialGradient(91.2, 73.6, 0, 91.2, 73.6, 241);
    g.addColorStop(0, '#173c3c');
    g.addColorStop(1, '#06100f');
    c.fillStyle = g;
    c.fillRect(0, 0, 300, 300);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(113,155,155,.42)';
    ring(c, 134);
    c.strokeStyle = 'rgba(113,155,155,.26)';
    ring(c, 124);
  }

  /** Le rond central (rayon 61, liseré sarcelle), commun aux deux médaillons. */
  function label(c, k, glow) {
    const r = 61;
    const g = c.createLinearGradient(150 - r, 150 - r, 150 + r, 150 + r);
    g.addColorStop(0, '#13322e');
    g.addColorStop(1, '#06100f');
    c.save();
    c.shadowColor = 'rgba(0,0,0,.6)';
    c.shadowBlur = 10 * k;
    c.fillStyle = g;
    c.beginPath();
    c.arc(150, 150, r, 0, TAU);
    c.fill();
    c.restore();
    c.save();
    c.shadowColor = `rgba(53,200,189,${glow})`;
    c.shadowBlur = 14 * k;
    c.lineWidth = 3.5;
    c.strokeStyle = '#35c8bd';
    ring(c, r);
    c.restore();
  }

  /** Volume : ombre légère en bas à droite, reflet de verre bombé en haut à gauche, par-dessus tout. */
  function volume(c) {
    const sh = c.createRadialGradient(118, 104, 40, 150, 150, 152);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(0.7, 'rgba(0,0,0,.05)');
    sh.addColorStop(1, 'rgba(0,0,0,.42)');
    c.fillStyle = sh;
    c.fillRect(0, 0, 300, 300);
    c.save();
    c.globalCompositeOperation = 'screen';
    c.translate(104, 86);
    c.rotate(-0.62);
    const g = c.createLinearGradient(0, -58, 0, 46);
    g.addColorStop(0, 'rgba(225,255,248,.3)');
    g.addColorStop(0.45, 'rgba(225,255,248,.1)');
    g.addColorStop(1, 'rgba(225,255,248,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, 98, 54, 0, 0, TAU);
    c.fill();
    const s = c.createRadialGradient(-22, -26, 0, -22, -26, 38);
    s.addColorStop(0, 'rgba(255,255,255,.26)');
    s.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = s;
    c.beginPath();
    c.ellipse(-22, -26, 46, 24, 0, 0, TAU);
    c.fill();
    c.restore();
  }

  // ---------- Juke-box : « Onde » ----------

  const NOTE = typeof Path2D === 'function' ? new Path2D('M137 111 186 99V166H178V121L145 129V176H137Z') : undefined;

  /** Les deux croches liées, vert signal, centrées sur leur centre de masse. */
  function note(c, s, k) {
    c.save();
    c.translate(150, 150);
    c.scale(s, s);
    c.translate(-158, -143);
    c.fillStyle = '#8be23a';
    c.shadowColor = 'rgba(139,226,58,.55)';
    c.shadowBlur = 12 * k;
    c.fill(NOTE);
    c.beginPath();
    c.ellipse(132, 176, 15, 10, -20 * D, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(173, 166, 15, 10, -20 * D, 0, TAU);
    c.fill();
    c.restore();
  }

  /** Les trois fils : violet, sarcelle (trois brins chacun), vert signal (un brin lumineux). */
  const THREADS = [
    { col: VIOLET, A: 44, kx: 0.052, w: -1.25, ph: 1.2, n: 3, lw: 1.5, a: 0.8 },
    { col: TEAL, A: 54, kx: 0.04, w: 1.0, ph: 2.6, n: 3, lw: 1.5, a: 0.85 },
    { col: SIGNAL, A: 66, kx: 0.033, w: 1.65, ph: 0, n: 1, lw: 3.4, a: 1, glow: true },
  ];

  function onde(c, t, k) {
    disc(c);
    const Y = (o, x, off, amp) => {
      const u = (x - 12) / 276;
      return 150 + amp * Math.pow(Math.sin(Math.PI * clamp(u)), 1.4) * Math.sin(o.kx * x - o.w * t + o.ph + off);
    };
    const ampOf = (o) => o.A * (0.8 + 0.2 * Math.sin(t * 0.8 + o.ph));
    for (const o of THREADS) {
      const amp = ampOf(o);
      const mid = (o.n - 1) / 2;
      for (let j = 0; j < o.n; j++) {
        const off = (j - mid) * 0.3;
        const ampj = amp * (1 - Math.abs(j - mid) * 0.08);
        c.save();
        c.lineWidth = o.lw;
        c.lineCap = 'round';
        c.strokeStyle = rgba(o.col, o.a * (j === mid ? 1 : 0.5));
        if (o.glow) {
          c.shadowColor = 'rgba(139,226,58,.75)';
          c.shadowBlur = 9 * k;
        }
        c.beginPath();
        for (let x = 12; x <= 288; x += 3) {
          const y = Y(o, x, off, ampj);
          if (x === 12) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
        c.restore();
      }
    }
    // L'étincelle sur le fil vert, de gauche à droite, avec sa traîne.
    const g = THREADS[2];
    const amp = ampOf(g);
    const u = ease(frac(t / 3.6));
    for (let i = 9; i >= 0; i--) {
      const uu = u - i * 0.011;
      if (uu < 0) continue;
      const x = 12 + 276 * uu;
      const y = Y(g, x, 0, amp);
      c.save();
      c.globalAlpha = Math.sin(Math.PI * uu) * (1 - i / 10) * (i ? 0.55 : 1);
      c.fillStyle = i ? '#c8f59a' : '#ffffff';
      if (!i) {
        c.shadowColor = '#e9ffd2';
        c.shadowBlur = 12 * k;
      }
      c.beginPath();
      c.arc(x, y, i ? 1.7 : 2.9, 0, TAU);
      c.fill();
      c.restore();
    }
    label(c, k, 0.5);
    note(c, 0.86, k);
    volume(c);
  }

  // ---------- Communauté : « Montée » ----------

  /** Silhouette du joueur : ancre en haut du buste, s = demi-largeur des épaules. */
  function player(c, x, y, s, fill, outline) {
    c.beginPath();
    c.arc(x, y - 0.8 * s, 0.52 * s, 0, TAU);
    c.moveTo(x - s, y + 1.16 * s);
    c.bezierCurveTo(x - s, y + 0.44 * s, x - 0.56 * s, y, x, y);
    c.bezierCurveTo(x + 0.56 * s, y, x + s, y + 0.44 * s, x + s, y + 1.16 * s);
    c.closePath();
    c.save();
    c.shadowColor = 'transparent';
    c.lineWidth = outline;
    c.lineJoin = 'round';
    c.strokeStyle = '#0a1a19';
    c.stroke();
    c.restore();
    c.fillStyle = fill;
    c.fill();
  }

  /**
   * Bulle de discussion d'un seul tenant : une forme arrondie dont un coin du bas descend tout droit
   * en une petite pointe anguleuse, courte et plafonnée (6,5 unités), sans arrondi de ce côté.
   */
  function bubblePath(c, x, y, w, h) {
    const r = h * 0.48;
    const b = y + h;
    const e = Math.min(h * 0.19, 6.5);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, b - r);
    c.arcTo(x + w, b, x + w - r, b, r);
    c.lineTo(x + e * 1.5, b);
    c.lineTo(x, b + e);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }

  /** Bulles violettes, bleues et vertes ; jamais grises. */
  const BUBBLE_COLORS = [VIOLET, META, SIGNAL, VIOLET, META, SIGNAL, VIOLET];
  /** Amitié, compétition, scores. Pas de drapeaux : Windows les affiche en deux lettres. */
  const SAYS = ['❤️', '🏆', '😄', '🥇', '🔥', '👋', '⭐', '👑', '🎉', '🤝'];
  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; // i18n-ignore : noms de polices

  /** Une bulle centrée en (cx, cy), large de w ; `say` : un emoji, ou 'dots' (trois points). */
  function bubble(c, cx, cy, w, flip, col, a, sc, say) {
    if (a <= 0.01 || sc <= 0.01) return;
    const h = w * 0.64;
    c.save();
    c.translate(cx, cy);
    c.scale(sc * (flip ? -1 : 1), sc);
    c.globalAlpha = a;
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.22), 1));
    g.addColorStop(1, rgba(mix(col, [0, 0, 0], 0.18), 1));
    c.fillStyle = g;
    bubblePath(c, -w / 2, -h / 2, w, h);
    c.fill();
    if (flip) c.scale(-1, 1);
    if (say === 'dots') {
      c.fillStyle = 'rgba(6,18,16,.78)';
      for (let j = 0; j < 3; j++) {
        c.beginPath();
        c.arc((j - 1) * h * 0.27, 0, h * 0.085, 0, TAU);
        c.fill();
      }
    } else {
      // Vrai emoji (police de couleur du système), centré, la moitié de la hauteur : de l'air autour.
      c.font = `${(h * 0.5).toFixed(2)}px ${EMOJI_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(say, 0, h * 0.04);
    }
    c.restore();
  }

  /** Tirage fixe par bulle (mêmes couloirs et tailles à chaque image). */
  const seed = (i, s) => frac(Math.sin(i * 127.1 + s * 311.7) * 43758.5453);

  function montee(c, t, k) {
    disc(c);
    // Sept bulles, couloirs répartis au nombre d'or, départs réguliers, même vitesse : elles ne se rattrapent pas.
    for (let i = 0; i < 7; i++) {
      const ph = frac(t * 0.08 + i / 7);
      const x = 52 + 196 * frac(i * 0.618) + 5 * Math.sin(t * 1.1 + i);
      const y = 286 - 272 * ph;
      const w = 54 + 8 * seed(i, 4);
      const env = Math.sin(Math.PI * ph);
      bubble(c, x, y, w, i % 2 === 1, BUBBLE_COLORS[i], Math.min(1, 3.5 * env), 0.8 + 0.2 * env, i % 3 === 2 ? 'dots' : SAYS[i]);
    }
    label(c, k, 0.45);
    c.save();
    c.shadowColor = 'rgba(139,226,58,.5)';
    c.shadowBlur = 12 * k;
    player(c, 150, 152.6, 33, '#8be23a', 6);
    c.restore();
    volume(c);
  }

  /** Les intérieurs, et l'instant de leur première image (la plus parlante, montrée à l'arrêt). */
  const KINDS = {
    'juke-box': { draw: onde, t0: 1.1 },
    communaute: { draw: montee, t0: 4 },
  };

  /** Un intérieur dans un carré de px × px (le disque de rayon 147 le remplit). */
  function paint(kind, c, px, t = KINDS[kind].t0) {
    const k = px / 294;
    c.save();
    c.setTransform(k, 0, 0, k, -3 * k, -3 * k);
    KINDS[kind].draw(c, t, k);
    c.restore();
  }

  // ---------- Fils d'Onde sur une zone, barre de progression ----------

  /*
   * Lueurs jamais coupées (13/11/2026, la barre du Juke-box sur le PinCab : le halo du fil s'arrêtait
   * net au bord de son canevas, un rectangle sombre autour de l'onde). Règle de ce module : un flou de
   * `b` pixels CSS (shadowBlur multiplié par la densité de pixels, sinon il change d'un écran à
   * l'autre) s'étend jusqu'à 1,5 b ; tout ce qui est dessiné, lueur comprise, reste à cette distance du
   * bord. Les canevas débordent de leur élément pour la donner, et l'amplitude est plafonnée par elle.
   * Preuve : medaillons-vivants-chromium.test.ts (aucun pixel allumé au bord d'un canevas).
   */
  const reach = (blur) => 1.5 * blur;

  /** Fils de bord à bord, centrés sur la hauteur de `anchor` (le médaillon, la pochette). */
  function drawWaves(c, W, H, t, opts, geo) {
    const s = geo.unit;
    const k = opts.canvas.width / W;
    const y0 = geo.y;
    // Place laissée à la lueur de l'étincelle (la plus large) au-dessus et au-dessous des fils.
    const room = reach(12 * s) + 2.6 * s;
    const A = Math.min(geo.amp * (opts.playing() ? 0.85 : 0.07), Math.max(0, Math.min(y0, H - y0) - room));
    const tt = opts.playing() ? t : t * 0.25;
    const Y = (o, u, off) => y0 + A * (o.A / 66) * Math.pow(Math.sin(Math.PI * u), 1.1) * Math.sin(TAU * o.cyc * u - o.w * tt + o.ph + off);
    for (const o of WAVE_THREADS) {
      const mid = (o.n - 1) / 2;
      for (let j = 0; j < o.n; j++) {
        const off = (j - mid) * 0.3;
        c.save();
        c.lineCap = 'round';
        c.lineWidth = o.lw * s * (j === mid ? 1.5 : 1);
        c.strokeStyle = rgba(o.col, o.a * opts.alpha * (j === mid ? 1 : 0.5));
        if (o.glow) {
          c.shadowColor = 'rgba(139,226,58,.7)';
          c.shadowBlur = 8 * s * k;
        }
        c.beginPath();
        for (let i = 0; i <= 200; i++) {
          const u = i / 200;
          const y = Y(o, u, off);
          if (i) c.lineTo(W * u, y);
          else c.moveTo(0, y);
        }
        c.stroke();
        c.restore();
      }
    }
    if (opts.playing()) {
      const u = ease(frac(t / 4.2));
      c.save();
      c.globalAlpha = Math.sin(Math.PI * u) * opts.alpha;
      c.fillStyle = '#fff';
      c.shadowColor = '#e9ffd2';
      c.shadowBlur = 12 * s * k;
      c.beginPath();
      c.arc(W * u, Y(WAVE_THREADS[2], u, 0), 2.6 * s, 0, TAU);
      c.fill();
      c.restore();
    }
  }
  const WAVE_THREADS = [
    { col: VIOLET, A: 41, cyc: 4, w: -1.25, ph: 1.2, n: 3, lw: 1, a: 0.42 },
    { col: TEAL, A: 51, cyc: 3.1, w: 1, ph: 2.6, n: 3, lw: 1, a: 0.48 },
    { col: SIGNAL, A: 66, cyc: 2.4, w: 1.65, ph: 0, n: 1, lw: 2, a: 0.85, glow: true },
  ];

  /** La barre de progression en fil vert : ondulée sur la part jouée, plate ensuite, l'étincelle en tête. */
  /*
   * Le canevas de la barre déborde d'elle (jukebox.css, .jb-fil-trace) : 32 unités de chaque côté et
   * 64 de haut, soit 16 s de marge pour s = H / 32. Lueur du fil : 3,6 s d'amplitude + 0,9 s de trait
   * + reach(5 s) = 12 s ; étincelle : reach(8 s) + 2,6 s = 14,6 s. Les deux tiennent dans 16 s.
   */
  const TRACK_PAD = 16;

  function drawTrack(c, W, H, t, opts) {
    const fill = opts.bar.querySelector(':scope > span');
    const p = clamp((parseFloat(fill?.style.width) || 0) / 100);
    const playing = opts.playing();
    const s = H / 32;
    const k = opts.canvas.width / W;
    const y = H / 2;
    const x0 = TRACK_PAD * s;
    const x1 = W - TRACK_PAD * s;
    const xp = x0 + (x1 - x0) * p;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(230,240,236,.18)';
    c.lineWidth = 1.6 * s;
    c.beginPath();
    c.moveTo(xp, y);
    c.lineTo(x1, y);
    c.stroke();
    if (xp > x0 + s) {
      c.strokeStyle = '#8be23a';
      c.lineWidth = 1.8 * s;
      if (playing) {
        c.shadowColor = 'rgba(139,226,58,.8)';
        c.shadowBlur = 5 * s * k;
      }
      const amp = (playing ? 3.6 : 0) * s;
      c.beginPath();
      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const x = x0 + (xp - x0) * u;
        const yy = y + amp * Math.sin(Math.PI * u) * Math.sin(TAU * 2.2 * u - 2 * t);
        if (i) c.lineTo(x, yy);
        else c.moveTo(x, yy);
      }
      c.stroke();
    }
    c.restore();
    c.save();
    if (playing) {
      c.fillStyle = '#fff';
      c.shadowColor = '#e9ffd2';
      c.shadowBlur = 8 * s * k;
      c.beginPath();
      c.arc(xp, y, 2.6 * s, 0, TAU);
      c.fill();
    } else {
      c.fillStyle = 'rgba(139,226,58,.75)';
      c.beginPath();
      c.arc(xp, y, 2.2 * s, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  // ---------- Boucle ----------

  const entries = new Set();
  const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  let frame;

  /** Le canevas à la taille affichée (pixels de l'écran, plafonnés) ; false s'il n'est pas affiché. */
  function fit(e) {
    const cv = e.canvas;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) return false;
    const pw = Math.min(e.max ?? 4096, Math.round(w * DPR()));
    const ph = Math.round((pw * h) / w);
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
      e.drawnAt = undefined;
      e.geo = undefined;
    }
    return true;
  }

  function render(e, t) {
    if (!e.ctx || !fit(e)) return;
    const c = e.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, e.canvas.width, e.canvas.height);
    if (e.kind) paint(e.kind, c, e.canvas.width, t);
    else {
      const w = e.canvas.clientWidth;
      c.setTransform(e.canvas.width / w, 0, 0, e.canvas.width / w, 0, 0);
      // Position remesurée chaque seconde (disposition qui change, cinématique d'entrée).
      const now = performance.now();
      if (e.measure && (!e.geo || now - (e.geoAt ?? 0) > 1000)) {
        e.geo = e.measure();
        e.geoAt = now;
      }
      if (e.measure && !e.geo) return;
      e.draw(c, w, e.canvas.clientHeight, t, e, e.geo);
    }
  }

  function tick(now) {
    frame = undefined;
    const still = quiet() || document.hidden;
    for (const e of entries) {
      // Hors de la page : oublié au bout de 10 s (l'affiche ou l'écran gardés en mémoire le réveillent, revive).
      if (!e.canvas.isConnected) {
        e.goneSince ??= now;
        if (now - e.goneSince > 10_000) entries.delete(e);
        e.drawnAt = undefined;
        continue;
      }
      e.goneSince = undefined;
      const live = !still && e.live();
      if (live) {
        // L'animation part de la première image à l'instant où elle commence (médaillon arrivé au centre).
        if (e.drawnAt !== 'live') e.since = now;
        render(e, (e.t0 ?? 0) + (now - e.since) / 1000);
        e.drawnAt = 'live';
      } else if (e.drawnAt !== 'still') {
        // Première image, dessinée une fois (et à nouveau si la taille change).
        render(e, e.t0 ?? 0);
        if (e.canvas.width) e.drawnAt = 'still';
      }
    }
    if (entries.size) frame = requestAnimationFrame(tick);
  }

  function track(e) {
    e.canvas.medaillon = e;
    entries.add(e);
    if (!frame && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
    return e.canvas;
  }

  function canvas(className) {
    const cv = document.createElement('canvas');
    cv.className = className;
    cv.setAttribute('aria-hidden', 'true');
    return cv;
  }

  /** Dans la roue : le médaillon du centre s'anime ; tous au réglage « Logos animés : tous ». */
  function liveInWheel(cv) {
    const item = cv.closest('.wheel-item');
    if (!item) return false;
    if (item.classList.contains('center')) return true;
    const stage = cv.closest('.wheel-stage');
    return Boolean(stage) && !stage.classList.contains('logos-fixes');
  }

  /**
   * Place de la roue : le canevas (dans le trou), puis l'anneau chromé en image (img.wheel-img), qui
   * le couvre. Le halo vert et le cercle lumineux de la roue se calent sur l'anneau, comme avant.
   */
  function wheelNodes(kind, alt) {
    const cv = canvas('wheel-vivant');
    const ctx = cv.getContext?.('2d');
    if (ctx) track({ canvas: cv, ctx, kind, t0: KINDS[kind].t0, max: 640, live: () => liveInWheel(cv) });
    const img = document.createElement('img');
    img.className = 'wheel-img';
    img.src = 'medaillons/contour-512.webp';
    img.alt = alt;
    img.draggable = false;
    return [cv, img];
  }

  /** Médaillon complet hors de la roue (affiche du fronton), toujours vivant. */
  function medallion(kind, className) {
    const box = document.createElement('div');
    box.className = `medaillon-vivant ${className}`.trim();
    box.setAttribute('aria-hidden', 'true');
    const cv = canvas('medaillon-vivant-fond');
    const ctx = cv.getContext?.('2d');
    if (ctx) track({ canvas: cv, ctx, kind, t0: KINDS[kind].t0, max: 1024, live: () => true });
    const img = document.createElement('img');
    img.className = 'medaillon-vivant-anneau';
    img.src = 'medaillons/contour.png';
    img.alt = '';
    img.draggable = false;
    box.append(cv, img);
    return box;
  }

  /**
   * Fils d'Onde sur tout le canevas, centrés sur la hauteur de `anchor` ; `opts.playing()` : en
   * lecture (fils déployés, étincelle), sinon presque à plat. `opts.alpha` : intensité.
   */
  function waves(cv, anchor, opts = {}) {
    const ctx = cv.getContext?.('2d');
    if (!ctx) return cv;
    const playing = opts.playing ?? (() => true);
    const e = {
      canvas: cv,
      ctx,
      draw: drawWaves,
      alpha: opts.alpha ?? 1,
      playing,
      t0: 1,
      live: () => true,
      // Mesure dans le repère de la page (offsetTop), pas de l'écran : le plateau de la borne est
      // tourné, et getBoundingClientRect y donnait une largeur pour une hauteur. Rien tant que le
      // médaillon n'a pas de taille (écran pas encore disposé).
      measure: () => {
        const root = cv.offsetParent;
        if (!root || !anchor.offsetHeight) return undefined;
        let y = 0;
        let n = anchor;
        while (n && n !== root) {
          y += n.offsetTop;
          n = n.offsetParent;
        }
        if (n !== root) return undefined;
        y += anchor.offsetHeight / 2 - cv.offsetTop;
        return { y, amp: (opts.amp ?? 0.62) * anchor.offsetHeight, unit: cv.clientWidth / (opts.reference ?? 560) };
      },
    };
    return track(e);
  }

  /** Barre de progression (.jb-progress, sa part jouée en largeur %) redessinée en fil vert. */
  function trackBar(cv, bar, playing) {
    const ctx = cv.getContext?.('2d');
    if (!ctx) return cv;
    // Toujours redessinée : même en pause, la barre suit un déplacement dans le morceau.
    return track({ canvas: cv, ctx, draw: drawTrack, bar, playing, t0: 0, live: () => true });
  }

  /**
   * Canevas d'un nœud gardé en mémoire et remis à l'écran (affiche, écran du Juke-box, roue) : ils
   * reprennent leur animation, même oubliés après 10 s hors de la page.
   */
  function revive(root) {
    if (!root?.querySelectorAll) return;
    let added = false;
    for (const cv of root.querySelectorAll('canvas')) {
      const e = cv.medaillon;
      if (!e) continue;
      e.goneSince = undefined;
      e.geo = undefined;
      if (!entries.has(e)) {
        entries.add(e);
        added = true;
      }
    }
    if (added && !frame && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
  }

  // Taille changée (écran pivoté, fenêtre redimensionnée) : les positions des fils sont remesurées.
  window.addEventListener?.('resize', () => {
    for (const e of entries) {
      e.geo = undefined;
      e.drawnAt = undefined;
    }
  });
  document.addEventListener?.('visibilitychange', () => {
    for (const e of entries) e.drawnAt = undefined;
    if (!frame && entries.size && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
  });

  window.CyberMedaillons = { wheelNodes, medallion, waves, track: trackBar, revive, paint, HOLE, kinds: Object.keys(KINDS) };
})();
