// Ouverture au démarrage (packages/core/src/intro.ts) : l'animation de Cyber Pinball de chaque
// écran de la borne. La bille part du lanceur et frappe la cible du plateau, traverse le DMD,
// puis le fronton et le topper s'allument, comme l'énergie qui monte dans la borne. Chaque
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
// plus rien ne tourne. Les styles sont dans intro.css ; couleurs, marque et matière, celles du
// design system (fallback.css).

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
   * Monte une scène : setup(root, timeline) rend { paint(e), resize?() } ; paint dessine
   * l'instant e (ms depuis le départ ; négatif : avant le départ, l'écran reste noir). Une
   * minuterie d'images la fait avancer jusqu'à timeline.end, puis s'arrête sur la dernière image.
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
    let last = NaN;
    const paint = () => {
      const e = Math.min(elapsed(), end);
      last = e;
      drawn.paint(e);
    };
    const tick = () => {
      frame = 0;
      paint();
      if (typeof intro.at !== 'number' && last < end && intro.startedAt !== undefined) frame = requestAnimationFrame(tick);
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
      /** Instant peint, et si la scène est au bout (pour les essais). */
      state: () => ({ scene: kind, at: Math.round(last), fin: last >= end }),
      problems: () => [],
      /** Redessine l'instant peint (un canevas posé avant la première peinture de la fenêtre peut ne pas être composé). */
      repaint() {
        drawn.reset?.();
        if (!Number.isNaN(last)) drawn.paint(last);
      },
      destroy() {
        cancelAnimationFrame(frame);
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

  // « Impulsion / circuit de puissance » : lanceur à droite, orbite haute et cible décentrée.
  // Un plateau mécanique à pans coupés, des rampes et slingshots sculptés, des chevrons larges.
  // Le choc reste local ; la marque HTML se pose dans un cartouche de verre sombre. Repère :
  // W la largeur, H la hauteur du canevas ; les objets ronds se mesurent en W.

  const TAU = Math.PI * 2;
  const TEAL = [54, 201, 180];
  const GREEN = [139, 226, 58];
  const INK = [230, 240, 236];
  const smooth = (k) => k * k * (3 - 2 * k);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a)})`;

  /** Chemin en fractions de W et H (miroir : symétrique autour du milieu). */
  function path2d(commands, W, H, mirror = false) {
    const p = new Path2D();
    for (const [op, ...v] of commands) {
      const a = v.map((n, i) => (i % 2 ? n * H : (mirror ? 1 - n : n) * W));
      if (op === 'M') p.moveTo(...a);
      else if (op === 'L') p.lineTo(...a);
      else if (op === 'C') p.bezierCurveTo(...a);
      else if (op === 'Q') p.quadraticCurveTo(...a);
      else if (op === 'Z') p.closePath();
    }
    return p;
  }

  function strokeIn(ctx, p, color, width, alpha) {
    if (alpha <= 0) return;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.stroke(p);
  }

  /** Lueur elliptique en dégradé radial (aucune ombre floutée sur un écran 4K). */
  function glow(ctx, x, y, rx, ry, color, alpha) {
    if (alpha <= 0 || rx <= 0 || ry <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(0.28, rgba(color, alpha * 0.48));
    g.addColorStop(0.65, rgba(color, alpha * 0.12));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function ring(ctx, x, y, rx, ry, color, width, alpha, from = 0, to = TAU) {
    if (alpha <= 0) return;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, from, to);
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** Bille : chrome noir opaque, une bande sombre, deux reflets de sources distinctes. */
  function sphere(ctx, x, y, r, energy, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    glow(ctx, x, y + r * 0.8, r * 1.7, r * 0.55, TEAL, 0.29 * energy);
    const g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.4, r * 0.02, x, y, r);
    g.addColorStop(0, '#9bcdc0');
    g.addColorStop(0.12, '#4a8277');
    g.addColorStop(0.35, '#173f36');
    g.addColorStop(0.6, '#030807');
    g.addColorStop(0.82, '#010403');
    g.addColorStop(0.94, '#21645a');
    g.addColorStop(1, '#071410');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ring(ctx, x, y, r * 0.98, r * 0.98, TEAL, r * 0.024, 0.6 * energy);
    ring(ctx, x, y, r * 0.92, r * 0.93, INK, r * 0.025, 0.8, 3.48, 4.76);
    ring(ctx, x, y, r * 0.91, r * 0.92, GREEN, r * 0.043, 0.8 * energy, 0.26, 1.55);
    glow(ctx, x - r * 0.35, y - r * 0.43, r * 0.32, r * 0.22, INK, 0.62);
    ctx.restore();
  }

  /** Batteur de verre (side 0 : gauche, 1 : droit), qui bat une fois. */
  function flipperAt(ctx, g, side, e, tl, power) {
    const { W, H } = g;
    const k = span(e, tl.flippers + side * 90, 360);
    const swing = Math.sin(k * Math.PI) ** 2 * 0.48;
    ctx.save();
    ctx.translate((side ? 0.79 : 0.21) * W, H * 0.875);
    ctx.scale(side ? -1 : 1, 1);
    ctx.rotate(0.39 - swing);
    glow(ctx, W * 0.13, W * 0.047, W * 0.22, W * 0.095, TEAL, 0.24 * power);
    ctx.save();
    ctx.translate(0, W * 0.016);
    ctx.fillStyle = '#010403';
    ctx.fill(g.flipper);
    strokeIn(ctx, g.flipper, TEAL, W * 0.002, 0.23 * power);
    ctx.restore();
    const face = ctx.createLinearGradient(0, -W * 0.04, 0, W * 0.045);
    face.addColorStop(0, '#35685c');
    face.addColorStop(0.25, '#163d32');
    face.addColorStop(0.62, '#06110e');
    face.addColorStop(1, '#286b5e');
    ctx.fillStyle = face;
    ctx.fill(g.flipper);
    strokeIn(ctx, g.flipper, TEAL, W * 0.0025, 0.5 * power);
    strokeIn(ctx, g.flipperEdge, TEAL, W * 0.015, 0.07 * power);
    strokeIn(ctx, g.flipperEdge, TEAL, W * 0.006, 0.75 * power);
    strokeIn(ctx, g.flipperEdge, INK, W * 0.0018, 0.68 * power);
    sphere(ctx, 0, 0, W * 0.018, power, 1);
    ctx.restore();
  }

  /** Accélération dans le lanceur, virage en haut, puis frappe oblique vers la cible. */
  function ballAt(k, W, H) {
    k = clamp(k);
    if (k < 0.66) return { x: W * 0.937, y: H * (0.86 - 0.71 * (k / 0.66) ** 1.65), r: W * 0.035 };
    const t = (k - 0.66) / 0.34;
    const u = 1 - t;
    return { x: W * (u ** 3 * 0.937 + 3 * u * u * t * 0.937 + 3 * u * t * t * 0.55 + t ** 3 * 0.34),
      y: H * (u ** 3 * 0.15 + 3 * u * u * t * -0.025 + 3 * u * t * t * 0.065 + t ** 3 * 0.235),
      r: W * (0.035 + 0.023 * t) };
  }

  /** Chemins précalculés : rails continus, rampes, couloirs, inserts et pièces mécaniques. */
  function playfieldGeometry(W, H, tl) {
    const path = (c, mirror = false) => path2d(c, W, H, mirror);
    const outline = [['M', 0.21, 0.90], ['L', 0.075, 0.80], ['Q', 0.045, 0.77, 0.055, 0.70],
      ['L', 0.13, 0.13], ['Q', 0.14, 0.065, 0.23, 0.055], ['L', 0.79, 0.055],
      ['Q', 0.96, 0.055, 0.975, 0.15], ['L', 0.975, 0.91]];
    const sling = [['M', 0.165, 0.715], ['Q', 0.175, 0.695, 0.20, 0.72],
      ['L', 0.36, 0.815], ['Q', 0.38, 0.839, 0.35, 0.835], ['L', 0.16, 0.805], ['Z']];
    const guide = [['M', 0.12, 0.70], ['L', 0.115, 0.80], ['Q', 0.12, 0.825, 0.18, 0.845]];
    const ramp = [['M', 0.135, 0.575], ['L', 0.19, 0.36], ['Q', 0.21, 0.32, 0.28, 0.31],
      ['L', 0.68, 0.235], ['Q', 0.77, 0.215, 0.76, 0.155]];
    const inserts = [];
    for (const side of [0, 1]) {
      // Deux flèches sous la marque, deux au-dessus des slingshots : l'invite reste dégagée.
      for (let i = 0; i < 4; i++) {
        const y = [0.775, 0.72, 0.575, 0.535][i];
        const x = side ? 0.62 : 0.38;
        inserts.push({ x, y, start: tl.inserts + i * 105 + side * 55,
          p: path([['M', x, y - 0.015], ['L', x + 0.044, y + 0.002],
            ['L', x + 0.044, y + 0.014], ['L', x, y - 0.001],
            ['L', x - 0.044, y + 0.014], ['L', x - 0.044, y + 0.002], ['Z']]) });
      }
    }
    return {
      W, H,
      rail: path(outline),
      shooter: path([['M', 0.90, 0.91], ['L', 0.90, 0.17], ['Q', 0.90, 0.10, 0.78, 0.10],
        ['L', 0.58, 0.10]]),
      shooterOuter: path([['M', 0.96, 0.91], ['L', 0.96, 0.17], ['Q', 0.96, 0.075, 0.78, 0.075],
        ['L', 0.58, 0.075]]),
      ramp: path(ramp),
      rampInner: path([['M', 0.165, 0.575], ['L', 0.22, 0.37], ['Q', 0.235, 0.345, 0.29, 0.337],
        ['L', 0.70, 0.26], ['Q', 0.80, 0.235, 0.795, 0.155]]),
      target: path([['M', 0.225, 0.185], ['L', 0.34, 0.155], ['L', 0.455, 0.205],
        ['L', 0.44, 0.275], ['L', 0.325, 0.305], ['L', 0.21, 0.255], ['Z']]),
      targetEdge: path([['M', 0.225, 0.185], ['L', 0.34, 0.155], ['L', 0.455, 0.205]]),
      lanes: Array.from({ length: 3 }, (_, i) => {
        const x = 0.54 + i * 0.095;
        return path([['M', x, 0.19], ['L', x, 0.125], ['Q', x, 0.111, x + 0.027, 0.111],
          ['Q', x + 0.055, 0.111, x + 0.055, 0.125], ['L', x + 0.055, 0.18]]);
      }),
      slings: [path(sling), path(sling, true)],
      guides: [path(guide), path(guide, true)],
      slingEdges: [false, true].map((m) => path([['M', 0.18, 0.72], ['L', 0.35, 0.821], ['L', 0.17, 0.792]], m)),
      cartouche: path([['M', 0.17, 0.335], ['L', 0.79, 0.335], ['L', 0.89, 0.365],
        ['L', 0.89, 0.49], ['L', 0.80, 0.515], ['L', 0.10, 0.515], ['L', 0.10, 0.365], ['Z']]),
      flipper: path2d([
        ['M', 0, -0.04], ['C', 0.08, -0.036, 0.19, -0.022, 0.257, -0.014],
        ['C', 0.284, -0.011, 0.284, 0.024, 0.255, 0.027],
        ['L', 0, 0.041], ['C', -0.055, 0.042, -0.055, -0.039, 0, -0.04], ['Z'],
      ], W, W),
      flipperEdge: path2d([['M', -0.025, 0.026], ['Q', 0, 0.038, 0.06, 0.03], ['L', 0.253, 0.02]], W, W),
      inserts,
      sparks: Array.from({ length: 12 }, (_, i) => ({
        angle: hash(i * 3 + 1) * TAU,
        speed: 0.04 + hash(i * 3 + 2) * 0.12,
        size: 0.002 + hash(i * 3 + 3) * 0.003,
      })),
    };
  }

  /** Peint e uniquement : aucun historique de traînée, aucun hasard, aucune horloge locale. */
  function paintPlayfield(ctx, g, e, tl) {
    const { W, H } = g;
    e = Math.min(e, tl.end);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#030807';
    ctx.fillRect(0, 0, W, H);
    if (e < 0) return ctx.restore();
    const awake = smooth(span(e, tl.wake, 420));
    const arrival = smooth(span(e, tl.impact, 360));
    const settle = smooth(span(e, tl.settle, tl.end - tl.settle));
    const power = (0.23 * awake + 0.77 * arrival) * (1 - 0.12 * settle);
    const launch = (t) => span(t, tl.launch, tl.launchLength);
    const path = (c) => path2d(c, W, H);
    const metal = ctx.createLinearGradient(0, H * 0.68, W * 0.4, H * 0.86);
    metal.addColorStop(0, '#20483f');
    metal.addColorStop(0.38, '#0e2821');
    metal.addColorStop(0.7, '#040c0a');
    metal.addColorStop(1, '#183c33');

    // La place de l'invite (0,605–0,675 H) n'a aucun décor : seuls les rails passent à ses côtés.
    ctx.save();
    glow(ctx, W * 0.35, H * 0.23, W * 0.40, H * 0.18, TEAL, 0.24 * power);
    glow(ctx, W * 0.5, H * 0.85, W * 0.5, H * 0.17, TEAL, 0.21 * power);

    // Nervures en perspective et petites traverses : matière sombre, lisible en arrêt sur image.
    for (const side of [0, 1]) {
      const x = (n) => side ? 1 - n : n;
      for (let i = 0; i < 3; i++) {
        const rib = path([['M', x(0.17 + i * 0.026), 0.30], ['L', x(0.085 + i * 0.025), 0.79]]);
        strokeIn(ctx, rib, TEAL, W * 0.002, power * (i === 0 ? 0.24 : 0.09));
      }
      for (let i = 0; i < 5; i++) {
        const y = 0.43 + i * 0.033;
        strokeIn(ctx, path([['M', x(0.105), y], ['L', x(0.135), y - 0.01]]), TEAL, W * 0.004, power * 0.26);
      }
    }
    for (const rail of [g.rail, g.shooter, g.shooterOuter]) {
      strokeIn(ctx, rail, TEAL, W * 0.025, power * 0.09);
      strokeIn(ctx, rail, TEAL, W * 0.007, power * 0.68);
      strokeIn(ctx, rail, INK, W * 0.0016, power * 0.62);
    }
    // Lanceur : ressort et sabot visibles, sans nouvelle paire de formes rondes.
    for (let i = 0; i < 7; i++) {
      const y = 0.89 + i * 0.006;
      strokeIn(ctx, path([['M', 0.916, y], ['L', 0.952, y + 0.004]]), INK, W * 0.0025, awake * 0.32);
    }
    const charge = awake * (1 - smooth(launch(e)));
    glow(ctx, W * 0.937, H * 0.86, W * 0.065, H * 0.095, GREEN, charge * 0.58);

    // Rampe oblique derrière la cible ; rails doubles et traverses donnent une vraie épaisseur.
    for (const ramp of [g.ramp, g.rampInner]) {
      strokeIn(ctx, ramp, [1, 5, 4], W * 0.025, power);
      strokeIn(ctx, ramp, TEAL, W * 0.008, power * 0.42);
      strokeIn(ctx, ramp, INK, W * 0.0018, power * 0.54);
    }
    for (let i = 0; i < 6; i++) {
      const x = 0.31 + i * 0.06;
      const y = 0.304 - i * 0.0113;
      strokeIn(ctx, path([['M', x, y], ['L', x + 0.012, y + 0.023]]), TEAL, W * 0.002, power * 0.28);
    }
    g.lanes.forEach((lane, i) => {
      const a = easeOut(span(e, tl.impact + i * 70, 180));
      strokeIn(ctx, lane, TEAL, W * 0.017, power * 0.16);
      strokeIn(ctx, lane, TEAL, W * 0.004, power * 0.75);
      ctx.fillStyle = rgba(GREEN, a * 0.8);
      ctx.fillRect(W * (0.558 + i * 0.095), H * 0.145, W * 0.02, H * 0.021);
    });

    ctx.globalAlpha = power;
    ctx.fillStyle = metal;
    ctx.fill(g.target);
    ctx.globalAlpha = 1;
    strokeIn(ctx, g.target, TEAL, W * 0.004, power * 0.7);
    strokeIn(ctx, g.targetEdge, INK, W * 0.003, power * 0.75);
    // Un seul noyau décentré, cerclé de segments techniques : ni yeux, ni berceau souriant.
    for (let i = 0; i < 3; i++) {
      ring(ctx, W * 0.34, H * 0.235, W * 0.09, W * 0.09, i === 1 ? GREEN : TEAL,
        W * 0.008, power * 0.8, i * TAU / 3 + 0.15, (i + 1) * TAU / 3 - 0.22);
    }
    for (let side = 0; side < 2; side++) {
      ctx.globalAlpha = power;
      ctx.fillStyle = metal;
      ctx.fill(g.slings[side]);
      ctx.globalAlpha = 1;
      strokeIn(ctx, g.slings[side], TEAL, W * 0.004, power * 0.6);
      strokeIn(ctx, g.slingEdges[side], TEAL, W * 0.025, power * 0.11);
      strokeIn(ctx, g.slingEdges[side], GREEN, W * 0.006, power * 0.66);
      strokeIn(ctx, g.slingEdges[side], INK, W * 0.0015, power * 0.85);
      strokeIn(ctx, g.guides[side], TEAL, W * 0.009, power * 0.55);
      strokeIn(ctx, g.guides[side], INK, W * 0.002, power * 0.7);
      for (const [x, y] of [[0.175, 0.735], [0.19, 0.79]]) {
        sphere(ctx, W * (side ? 1 - x : x), H * y, W * 0.009, power, awake);
      }
    }

    for (const lamp of g.inserts) {
      const lit = easeOut(span(e, lamp.start, 170));
      const pulse = Math.sin(Math.PI * span(e, lamp.start, 450)) ** 2;
      const a = lit * (0.56 + pulse * 0.44) * (1 - 0.25 * settle);
      ctx.fillStyle = rgba([13, 35, 26], awake);
      ctx.fill(lamp.p);
      glow(ctx, lamp.x * W, lamp.y * H, W * 0.085, H * 0.035, GREEN, a * 0.25);
      ctx.fillStyle = rgba(GREEN, a);
      ctx.fill(lamp.p);
      strokeIn(ctx, lamp.p, INK, W * 0.0015, a * 0.6);
    }
    ctx.save();
    ctx.globalAlpha = awake;
    flipperAt(ctx, g, 0, e, tl, power);
    flipperAt(ctx, g, 1, e, tl, power);
    ctx.restore();

    // Cartouche de verre et reflet de pose, toujours derrière la marque HTML.
    const brand = easeOut(span(e, tl.brand, 500));
    ctx.fillStyle = rgba([3, 8, 7], brand * 0.9);
    ctx.fill(g.cartouche);
    strokeIn(ctx, g.cartouche, TEAL, W * 0.0015, brand * 0.22);
    const flash = Math.sin(Math.PI * span(e, tl.brand, 480)) ** 2;
    glow(ctx, W * 0.5, H * 0.425, W * 0.43, H * 0.095, TEAL, flash * 0.32);
    ctx.restore();

    // Ruban continu : un tracé par couche évite les perles aux raccords en mode additif.
    if (e > tl.launch && e < tl.impact + 170) {
      const fade = 1 - smooth(span(e, tl.impact, 170));
      const tail = ballAt(launch(e - 144), W, H);
      const head = ballAt(launch(e), W, H);
      const trail = new Path2D();
      trail.moveTo(tail.x, tail.y);
      for (let i = 23; i >= 0; i--) {
        const p = ballAt(launch(e - i * 6), W, H);
        trail.lineTo(p.x, p.y);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [width, color, opacity] of [[0.065, TEAL, 0.18], [0.024, GREEN, 0.65], [0.006, INK, 0.95]]) {
        const light = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        light.addColorStop(0, rgba(color, 0));
        light.addColorStop(0.35, rgba(color, fade * opacity * 0.18));
        light.addColorStop(1, rgba(color, fade * opacity));
        ctx.lineWidth = W * width;
        ctx.strokeStyle = light;
        ctx.stroke(trail);
      }
      ctx.restore();
    }

    // Choc contenu dans le quart haut : deux fronts et quelques éclats brefs, noyau dégagé.
    const impact = span(e, tl.impact, tl.impactLength);
    if (impact > 0 && impact < 1) {
      const hit = Math.sin(Math.PI * span(e, tl.impact, 180));
      glow(ctx, W * 0.34, H * 0.235, W * 0.24, W * 0.24, INK, hit * 0.58);
      for (let i = 0; i < 2; i++) {
        const k = span(e, tl.impact + i * 55, tl.impactLength - i * 55);
        if (k <= 0 || k >= 1) continue;
        const r = W * (0.065 + easeOut(k) * (0.15 - i * 0.025));
        const a = (1 - k) ** 2 * Math.min(1, k * 18);
        ring(ctx, W * 0.34, H * 0.235, r, r, i === 1 ? INK : TEAL, W * (0.009 - i * 0.002), a * 0.85);
      }
      for (const s of g.sparks) {
        const d = W * (0.09 + s.speed * easeOut(impact));
        const x = W * 0.34 + Math.cos(s.angle) * d;
        const y = H * 0.235 + Math.sin(s.angle) * d;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(s.angle) * W * 0.012, y + Math.sin(s.angle) * W * 0.012);
        ctx.lineWidth = W * s.size;
        ctx.strokeStyle = rgba(s.size > 0.0035 ? GREEN : INK, (1 - span(e, tl.impact, 240)) ** 2);
        ctx.stroke();
      }
    }
    const ball = ballAt(launch(e), W, H);
    const shown = easeOut(span(e, tl.wake, 220));
    glow(ctx, ball.x, ball.y, ball.r * 2, ball.r * 2, TEAL, shown * 0.23);
    sphere(ctx, ball.x, ball.y, ball.r, 0.85, shown);

    const mark = easeOut(span(e, tl.rule, 400));
    if (mark > 0) {
      const rule = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
      rule.addColorStop(0, rgba(TEAL, 0));
      rule.addColorStop(0.5, rgba(TEAL, 0.52 * mark));
      rule.addColorStop(1, rgba(TEAL, 0));
      ctx.fillStyle = rule;
      ctx.fillRect(W * 0.25, H * 0.513, W * 0.5, Math.max(1, W * 0.0018));
    }
    ctx.restore();
  }

  /** Plateau au repos : cible à gauche, rampe oblique, trois passages hauts et lanceur droit.
   * Marque centrale en HTML ; l'invite entre 60,5 et 67,5 % reste sur le fond noir sarcelle. */
  function playfield(container, game, options) {
    return scene(container, 'playfield', options, (root, tl) => {
      const canvas = root.appendChild(el('canvas', 'cp-in-canvas'));
      const ctx = canvas.getContext('2d');
      const { mark, letters } = stackedLetters('cp-in-mark');
      const brand = root.appendChild(el('div', 'cp-in-brand'));
      brand.append(mark);
      const passSheen = sheen(brand);
      let geometry;
      return {
        resize() {
          const W = root.clientWidth || 1;
          const H = root.clientHeight || 1;
          // Au plus 1920 points sur le grand côté (la moitié d'un écran 4K) : les lueurs n'y perdent rien.
          const k = Math.min(1, 1920 / Math.max(W, H)) * (window.devicePixelRatio || 1);
          canvas.width = Math.max(1, Math.round(W * k));
          canvas.height = Math.max(1, Math.round(H * k));
          geometry = playfieldGeometry(canvas.width, canvas.height, tl);
          // Marque entière dans son cartouche (0,335–0,515 H) : PINBALL (6,4 em) sur 62 % de la
          // largeur, le bloc des deux lignes (2,1 em) sur 13 % de la hauteur au plus (en 3:4).
          const base = Math.min(W * 0.094, H * 0.054);
          const size = Math.min((W * 0.62) / 6.4, (H * 0.13) / 2.1);
          brand.style.setProperty('--cp-in-scale', String(base > 0 ? size / base : 1));
        },
        paint(e) {
          if (ctx && geometry) paintPlayfield(ctx, geometry, e, tl);
          // Marque : CYBER puis PINBALL, chaque mot du centre vers ses bords ; elle descend un peu en se posant.
          const enter = easeOut(span(e, tl.brand, 500));
          brand.style.opacity = String(enter);
          brand.style.transform = `translateY(calc(-50% + ${(1 - enter) * 1.4}cqh)) scale(${1.04 - 0.04 * enter})`;
          letters.forEach((letter, i) => {
            const distance = i < 5 ? Math.abs(i - 2) : Math.abs(i - 8);
            letter.style.opacity = String(easeOut(span(e, (i < 5 ? tl.brand : tl.brand + 220) + distance * 45, 330)));
          });
          passSheen(e, tl);
        },
        reset() {
          geometry = canvas.width ? playfieldGeometry(canvas.width, canvas.height, tl) : geometry;
        },
      };
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
          // La première lettre de chaque mot vacille comme un tube qui s'allume ; les suivantes montent (revue de Codex).
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
    // Discrète (15 % des points au plus, nuances 1 à 4) : la bille qui suit doit dominer (revue de Codex).
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
