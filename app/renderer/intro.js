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
// options.intro.loop règle la boucle (essais : vitesses et amplitudes comparées). Les styles sont
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

  // Dessinée par un shader WebGL2 plein écran (window.CyberIntroShaders.playfield, intro-shaders.js,
  // conçu avec Codex) : lumière, profondeur et grain calculés au pixel, image fonction du seul
  // instant. La marque lui est donnée en texture, au cadrage de l'écran : R « CYBER », G
  // « PINBALL » (nets), B les deux floutés (lueurs) ; les fils, en tableaux uniformes
  // (CyberIntroShaders.playfieldUniforms). Pendant l'animation, le canevas compte au plus 1920
  // points sur son grand côté (la moitié d'un écran 4K), moins si la carte graphique ne suit pas
  // (images espacées de plus de 26 ms). Puis la boucle (CyberIntroShaders.playfieldFrame), à la même
  // taille, donc sans saut de netteté, à 20 images par seconde au plus, 15 puis 10 si la carte
  // graphique ne suit pas : le mouvement est assez lent pour rester fluide. Canevas réduit (écran
  // plus grand que 1920 points) : à la fin, les lettres de la marque paraissent nettes en fondu, dans
  // un canevas 2D à pleine résolution posé dessus, et le shader ne garde que leur lueur. Sans WebGL2
  // (ou shader refusé), la marque en HTML, immobile.

  /** Où se pose la marque dans la texture : centre, largeur de PINBALL, hauteur du bloc au plus. */
  const PLAYFIELD_BRAND = { y: 0.79, width: 0.72, maxHeight: 0.12 };
  /** Grand côté du canevas pendant l'animation, et le plus petit auquel on descend si la carte peine. */
  const PLAYFIELD_LIVE_MAX = 1920;
  const PLAYFIELD_LIVE_MIN = 960;
  /** Écart entre deux images de la boucle (ms), du plus fluide au plus économe. */
  const PLAYFIELD_LOOP_STEPS = [1000 / 20, 1000 / 15, 1000 / 10];
  /** Fondu des lettres nettes posées sur un canevas réduit, à la fin (intro.css, .cp-in-letters). */
  const PLAYFIELD_LETTERS_FADE = 450;
  const BRAND_FONT = "'CP Saira', 'Segoe UI', sans-serif"; // i18n-ignore : pile de polices

  /** Programme du shader sur un triangle plein écran ; undefined si WebGL2 refuse. */
  function glProgram(gl, fragment) {
    const vertex = '#version 300 es\nin vec2 p;\nvoid main() { gl_Position = vec4(p, 0.0, 1.0); }';
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
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`Ouverture : programme refusé : ${gl.getProgramInfoLog(program)}`);
      return undefined;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return program;
  }

  /**
   * Masque de la marque à la taille du canevas (W × H) : la marque du design system
   * (.cp-wordmark-stack : Saira 300, chasse 125 %, espacement 0,28 em, interligne 1,35). Avec
   * `into`, les lettres seules dans ce canevas, aux couleurs que le shader leur donne (INK, LIME),
   * sur fond transparent : la marque nette posée sur un canevas réduit.
   */
  function brandMask(W, H, into) {
    const c = into ?? document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    if (!into) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }
    const font = (size) => `300 expanded ${size}px ${BRAND_FONT}`;
    const spaced = (size) => {
      ctx.font = font(size);
      ctx.fontStretch = 'expanded';
      ctx.letterSpacing = `${size * 0.28}px`;
    };
    // PINBALL sur `width` de la largeur, le bloc des deux lignes sur `maxHeight` de la hauteur au plus.
    spaced(100);
    const per = ctx.measureText('PINBALL').width / 100;
    const size = Math.min((W * PLAYFIELD_BRAND.width) / per, (H * PLAYFIELD_BRAND.maxHeight) / 2.1);
    spaced(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // L'espacement suit aussi la dernière lettre : on le rend à gauche pour centrer le mot.
    const x = W / 2 + size * 0.14;
    const yC = H * PLAYFIELD_BRAND.y - size * 0.675;
    const yP = H * PLAYFIELD_BRAND.y + size * 0.675;
    const words = (cyber, pinball) => {
      ctx.fillStyle = cyber;
      ctx.fillText('CYBER', x, yC);
      ctx.fillStyle = pinball;
      ctx.fillText('PINBALL', x, yP);
    };
    if (into) {
      words('#e6f0ec', '#8be23a');
      return c;
    }
    ctx.globalCompositeOperation = 'lighter';
    words('#f00', '#0f0');
    ctx.filter = `blur(${Math.max(1, size * 0.35)}px)`;
    words('#00f', '#00f');
    ctx.filter = 'none';
    return c;
  }

  /**
   * Plateau : l'animation du shader, puis sa dernière image, immobile, en pleine résolution.
   * L'invite de l'application se pose vers 64 % de la hauteur, sur une zone que le shader laisse sombre.
   */
  function playfield(container, game, options) {
    return scene(container, 'playfield', options, (root, tl) => {
      const canvas = root.appendChild(el('canvas', 'cp-in-gl'));
      // Les lettres nettes, sur un canevas réduit, une fois la marque formée (créées au besoin).
      let crisp;
      let crispSize = '';
      const { mark } = stackedLetters('cp-in-mark');
      const fallback = root.appendChild(el('div', 'cp-in-brand'));
      fallback.append(mark);
      const source = window.CyberIntroShaders?.playfield;
      const gl = source ? canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }) : null;
      const program = gl ? glProgram(gl, source) : undefined;
      let working = Boolean(program);
      let texture;
      let size = '';
      let fontsAsked = false;
      const uniform = (name) => (program ? gl.getUniformLocation(program, name) : null);
      const u = { res: uniform('u_res'), time: uniform('u_time'), brand: uniform('u_brand'), thread: uniform('u_thread'), rise: uniform('u_rise'), sway: uniform('u_sway'), overlay: uniform('u_overlay') };
      const loopTune = options?.intro?.loop;
      if (working) {
        gl.useProgram(program);
        for (const [name, values] of Object.entries(window.CyberIntroShaders.playfieldUniforms ?? {})) {
          gl.uniform4fv(gl.getUniformLocation(program, name), new Float32Array(values));
        }
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        canvas.addEventListener('webglcontextlost', () => {
          working = false;
          root.classList.add('cp-in-flat');
        });
      } else {
        root.classList.add('cp-in-flat');
      }
      let liveMax = PLAYFIELD_LIVE_MAX;
      let lastAt = 0;
      let slow = 0;
      /** Six images de suite trop espacées : le canevas de l'animation perd un quart de sa taille. */
      const pace = () => {
        const now = performance.now();
        const dt = now - lastAt;
        lastAt = now;
        if (dt > 100) return;
        slow = dt > 26 ? slow + 1 : Math.max(0, slow - 1);
        if (slow < 6 || liveMax <= PLAYFIELD_LIVE_MIN) return;
        liveMax = Math.max(PLAYFIELD_LIVE_MIN, Math.round(liveMax * 0.75));
        slow = 0;
      };
      /** Taille du canevas : la même pendant l'animation et la boucle (au plus PLAYFIELD_LIVE_MAX). */
      const fit = () => {
        const W = root.clientWidth || 1;
        const H = root.clientHeight || 1;
        const dpr = window.devicePixelRatio || 1;
        const k = Math.min(1, liveMax / Math.max(W, H)) * dpr;
        const w = Math.max(1, Math.round(W * k));
        const h = Math.max(1, Math.round(H * k));
        const key = `${w}x${h}`;
        if (key === size) return;
        size = key;
        canvas.width = w;
        canvas.height = h;
        uploadBrand();
      };
      const uploadBrand = () => {
        if (!working) return;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, brandMask(canvas.width, canvas.height));
        // La police de la marque peut arriver après le premier tracé : texture refaite, image repeinte.
        if (!fontsAsked && document.fonts && !document.fonts.check(`300 expanded 100px ${BRAND_FONT}`)) {
          fontsAsked = true;
          document.fonts.load(`300 expanded 100px ${BRAND_FONT}`).then(() => {
            size = '';
            crispSize = '';
            handle.repaint();
          }, () => undefined);
        }
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
      /**
       * Lettres nettes : sur un canevas réduit, à partir de la fin, un canevas 2D à la taille de
       * l'écran, en fondu ; rend 1 quand le fondu est fini (le shader ne peint plus les lettres).
       */
      const letters = (e) => {
        const dpr = window.devicePixelRatio || 1;
        const W = Math.round((root.clientWidth || 1) * dpr);
        const H = Math.round((root.clientHeight || 1) * dpr);
        const still = typeof options?.intro?.at === 'number';
        if (!(canvas.width < W - 1 && e >= tl.end)) {
          crisp?.classList.remove('cp-in-shown');
          return 0;
        }
        if (!crisp) crisp = root.insertBefore(el('canvas', 'cp-in-letters'), canvas.nextSibling);
        const key = `${W}x${H}`;
        if (key !== crispSize) {
          crispSize = key;
          brandMask(W, H, crisp);
        }
        // Instant figé (planche) : posées d'emblée ; sinon en fondu (intro.css).
        crisp.classList.toggle('cp-in-still', still);
        crisp.classList.add('cp-in-shown');
        return still || e >= tl.end + PLAYFIELD_LETTERS_FADE ? 1 : 0;
      };
      let lastE = -1;
      const draw = (e) => {
        lastE = e;
        if (!working) return;
        if (e >= 0 && e < tl.end) pace();
        else if (e >= tl.end) loopPace();
        fit();
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);
        gl.uniform2f(u.res, canvas.width, canvas.height);
        gl.uniform1f(u.time, clamp(e, 0, tl.end));
        gl.uniform1f(u.overlay, letters(e));
        const moving = window.CyberIntroShaders.playfieldFrame?.(Math.max(0, e), loopTune);
        if (moving) {
          gl.uniform4fv(u.thread, moving.u_thread);
          gl.uniform3fv(u.rise, moving.u_rise);
          gl.uniform3fv(u.sway, moving.u_sway);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(u.brand, 0);
        if (e < 0) {
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        } else gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      const handle = {
        resize() {
          size = '';
        },
        paint: draw,
        /** La boucle tant que le shader dessine ; options.intro.loop.off la coupe (essais). */
        loop: () => (working && !loopTune?.off ? PLAYFIELD_LOOP_STEPS[step] : 0),
        reset() {
          size = '';
          crispSize = '';
        },
        repaint() {
          draw(lastE);
        },
        destroy() {
          gl?.getExtension('WEBGL_lose_context')?.loseContext();
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
