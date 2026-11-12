// Médias des jeux dans les fenêtres du menu.
// Chaque rôle affiché (fond du playfield, backglass, DMD, topper, et chaque zone d'un
// écran partagé) a sa couche : image ou vidéo en boucle, fondu enchaîné court au
// changement de table, rotation d'après le bord des flippers, `cover` pour le fond
// du playfield, `contain` sur fond noir ailleurs. Sans média, le repli intégré
// (fallback.js, quand il est chargé), sinon un repli minimal : le titre.
//
//   const layer = CyberMedia.layer(conteneur, { role: 'backglass', minimal });
//   layer.show(vue);                  // vue : MediaView de packages/core/src/mediaview.ts
//   layer.show(vue, { still: true }); // première image, figée (fond de partie)
//   layer.show(vue, { once: true, onEnd }); // vidéo jouée une fois, sa dernière image gardée (ouverture)
//   layer.setActive(false);           // vidéo en pause (écran recouvert)
//   layer.setVolume(0.4);             // son de la vidéo (muette par défaut), en fondu
//   CyberMedia.setSink(id);           // sortie audio des vidéos (menu-audio.js)
//
// Les vidéos des tables voisines sont préchargées (CyberMedia.preload) ; une vidéo
// quittée reste un moment en réserve, pour revenir en arrière sans attendre. Tout
// s'arrête quand la fenêtre est cachée. Une erreur de lecture est remontée au
// processus principal (window.cyber.mediaError), pour le médecin.

(() => {
  'use strict';

  /** Durée du fondu enchaîné, en ms (frontend.css, .media-slot). */
  const FADE_MS = 280;
  /** Au-delà, la nouvelle image s'affiche même si la vidéo n'a pas encore sa première image. */
  const READY_TIMEOUT_MS = 1500;
  /** Éléments gardés prêts (voisins préchargés, médias quittés) ; les vidéos coûtent un décodeur chacune. */
  const POOL_MAX = 8;
  const POOL_MAX_VIDEOS = 4;

  /** Composants de fallback.js (T3) pour chaque repli du catalogue. */
  const FALLBACK_KINDS = {
    'backglass-card': 'backglass',
    'dmd-dots': 'dmd',
    'topper-logo': 'topper',
    'wheel-title': 'wheel',
    'playfield-gradient': 'playfield',
    'loading-screen': 'loading',
  };

  /** Animations de l'ouverture au démarrage (intro.js) : sans fichier, ou à la place d'un fichier illisible. */
  const INTRO_KINDS = {
    'intro-playfield': 'playfield',
    'intro-backglass': 'backglass',
    'intro-topper': 'topper',
    'intro-dmd': 'dmd',
    'intro-fulldmd': 'fullDmd',
  };

  const EDGE_ROTATION = { bottom: 0, left: 90, top: 180, right: 270 };

  /** Fondu du son d'une vidéo, en ms. */
  const VOICE_FADE_MS = 500;
  /** Sortie audio des vidéos (setSinkId) ; '' : sortie par défaut. */
  let sinkId = '';

  /** Volume d'une vidéo amené en fondu à `to` ; muette à 0. */
  function voiceTo(video, to, ms = VOICE_FADE_MS) {
    clearInterval(video.voiceTimer);
    if (to > 0) video.muted = false;
    const from = video.muted ? 0 : video.volume;
    const steps = Math.max(1, Math.round(ms / 30));
    let i = 0;
    video.voiceTimer = setInterval(() => {
      i++;
      video.volume = Math.min(1, Math.max(0, from + ((to - from) * i) / steps));
      if (i < steps) return;
      clearInterval(video.voiceTimer);
      if (to <= 0) video.muted = true;
    }, 30);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- Erreurs ----------

  const reported = new Set();

  function report(view, message, details = {}) {
    if (!view?.url || reported.has(view.url)) return;
    reported.add(view.url);
    try {
      window.cyber?.mediaError?.({ url: view.url, role: view.role, type: view.found ?? view.type, message, ...details });
    } catch {
      // Hors de l'application (page de démonstration) : rien à remonter.
    }
  }

  /** Message de l'erreur, montré par le médecin (constat de la table). */
  function videoError(video) {
    const e = video.error;
    const codes = {
      1: t('lecture interrompue'),
      2: t('erreur réseau'),
      3: t('décodage impossible'),
      4: t('format non pris en charge'),
    };
    const reason = codes[e?.code] ?? t('erreur inconnue');
    return e?.message ? t('Vidéo illisible : {reason} ({message})', { reason, message: e.message }) : t('Vidéo illisible : {reason}', { reason });
  }

  // ---------- Réserve d'éléments (préchargement) ----------

  /** url -> élément <img> ou <video>, du plus ancien au plus récent. */
  const pool = new Map();

  function createElement(view) {
    if (view.kind === 'video') {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.disablePictureInPicture = true;
      if (sinkId) video.setSinkId(sinkId).catch(() => {});
      video.src = view.url;
      return video;
    }
    const img = new Image();
    img.decoding = 'async';
    img.draggable = false;
    img.src = view.url;
    return img;
  }

  function take(view) {
    const found = pool.get(view.url);
    if (found) {
      pool.delete(view.url);
      return found;
    }
    return createElement(view);
  }

  function release(url, node) {
    if (!url || !node) return;
    if (node.tagName === 'VIDEO') {
      node.pause();
      clearInterval(node.voiceTimer);
      node.muted = true;
    }
    pool.delete(url);
    pool.set(url, node);
    trimPool();
  }

  function trimPool() {
    const videos = () => [...pool.entries()].filter(([, n]) => n.tagName === 'VIDEO');
    while (pool.size > POOL_MAX || videos().length > POOL_MAX_VIDEOS) {
      const [url, node] = videos().length > POOL_MAX_VIDEOS ? videos()[0] : pool.entries().next().value;
      pool.delete(url);
      unload(node);
    }
  }

  /** Libère le décodeur d'une vidéo retirée. */
  function unload(node) {
    if (node?.tagName !== 'VIDEO') return;
    node.pause();
    node.removeAttribute('src');
    node.load();
  }

  /** Médias des tables voisines, chargés d'avance : le changement de table n'attend pas le disque. */
  function preload(views) {
    for (const view of views ?? []) {
      if (!view?.url || pool.has(view.url) || shownUrls().has(view.url)) continue;
      pool.set(view.url, createElement(view));
      trimPool();
    }
  }

  /**
   * Textes marqués data-fit (replis minimaux) : la taille baisse jusqu'à ce que le texte
   * tienne dans sa boîte, sans descendre sous 40 % ; au-delà, la coupure CSS (« … ») prend le relais.
   */
  function fitTexts(scope) {
    for (const node of scope.querySelectorAll('[data-fit]')) {
      node.style.fontSize = '';
      const base = parseFloat(getComputedStyle(node).fontSize);
      // Une ligne coupée dépasse d'une ligne entière ; les jambages des lettres, de quelques pixels seulement.
      const overflows = () => {
        const size = parseFloat(getComputedStyle(node).fontSize);
        return node.scrollHeight > node.clientHeight + size * 0.5 || node.scrollWidth > node.clientWidth + 1;
      };
      for (let scale = 0.92; overflows() && scale >= 0.4; scale -= 0.08) node.style.fontSize = `${base * scale}px`;
    }
  }

  // ---------- Couches ----------

  const layers = new Set();
  const shownUrls = () => new Set([...layers].flatMap((l) => l.urls()));

  /** Rotation d'un média orientable mesuré par le rendu (dimensions illisibles côté principal). */
  function measuredRotation(view, width, height) {
    if (!view.orient || !(width > 0 && height > 0)) return view.rotation;
    const mediaEdge = width > height ? 270 : 0;
    const turn = EDGE_ROTATION[view.orient.edge] - mediaEdge + (view.orient.halfTurn ? 180 : 0);
    return ((turn % 360) + 360) % 360;
  }

  function setRotation(frame, rotation) {
    frame.dataset.rotation = String(rotation);
  }

  /** Première image d'une vidéo ou d'une image (GIF, APNG animés compris), sur un canvas. */
  function freeze(node, view) {
    const width = node.videoWidth || node.naturalWidth;
    const height = node.videoHeight || node.naturalHeight;
    if (!(width > 0 && height > 0)) return node;
    const canvas = el('canvas', 'media-still');
    canvas.width = width;
    canvas.height = height;
    try {
      canvas.getContext('2d').drawImage(node, 0, 0, width, height);
    } catch {
      return node;
    }
    canvas.style.objectFit = view.fit;
    return canvas;
  }

  /**
   * Couche d'un rôle dans `container` (positionné, avec une taille). `minimal(view)`
   * dessine le repli quand fallback.js n'est pas chargé ; `inGame(view)` le repli
   * pendant la partie.
   */
  function layer(container, options = {}) {
    const root = el('div', `media-layer ${options.className ?? ''}`.trim());
    container.prepend(root);
    let current;
    let active = true;
    /** Volume du son des vidéos de cette couche (0 : muettes). */
    let volume = 0;
    const slots = new Set();

    /** Son de la vidéo d'une couche : celle qui est affichée, au volume de la couche. */
    function voice(slot) {
      const video = slot?.media;
      if (video?.tagName !== 'VIDEO') return;
      if (volume > 0 || !video.muted) voiceTo(video, volume);
    }

    function keyOf(view, opts) {
      if (!view) return 'vide';
      // Ouverture : une par départ, l'animation de Cyber Pinball ou le fichier de l'utilisateur.
      if (view.intro) return `ouverture:${view.intro.id}:${view.url ?? view.fallback}`; // i18n-ignore : clé interne
      const still = opts.still ? ':figé' : ''; // i18n-ignore : clé interne
      if (view.url) return `${view.url}${still}`;
      const card = view.card ?? {};
      return `repli:${opts.game ? 'partie' : view.fallback}:${view.type}:${card.title}:${card.manufacturer}:${card.year}${still}`;
    }

    function fallbackContent(view, opts, slot) {
      const card = view.card ?? {};
      const intro = INTRO_KINDS[view.fallback];
      if (intro && typeof window.CyberIntro?.[intro] === 'function') {
        const box = el('div', 'media-fallback intro-fallback');
        slot.handle = window.CyberIntro[intro](box, card, { intro: view.intro });
        // Couche déjà coupée (voile de nuit, fenêtre cachée) : la scène ne tourne pas avant d'être vue.
        slot.handle?.setActive?.(active && !document.hidden);
        // Fin de la partie jouée une fois : l'instant de l'invite (timeline.hint) s'il est donné, sinon la fin.
        const done = view.intro?.timeline?.hint ?? view.intro?.timeline?.end ?? 0;
        opts.onEnd && setTimeout(opts.onEnd, Math.max(0, done - (Date.now() - (view.intro?.startedAt ?? Date.now()))));
        return box;
      }
      const kit = window.CyberFallback;
      let kind = opts.game ? 'inGame' : FALLBACK_KINDS[view.fallback];
      if (kind === 'dmd' && view.type === 'FullDMD') kind = 'fullDmd';
      if (kit && kind && typeof kit[kind] === 'function') {
        const box = el('div', 'media-fallback');
        slot.handle = kit[kind](box, card, { animate: !opts.still });
        return box;
      }
      const box = el('div', 'media-fallback minimal');
      const content = opts.game ? options.inGame?.(view) : options.minimal?.(view);
      if (content) box.append(content);
      return box;
    }

    function retire(slot) {
      slots.delete(slot);
      slot.handle?.destroy?.();
      if (slot.media && slot.url && slot.media.tagName !== 'CANVAS') release(slot.url, slot.media);
      slot.node.remove();
    }

    /** La nouvelle couche apparaît en fondu ; les précédentes partent à la fin du fondu. */
    function reveal(slot) {
      if (slot.revealed || slot !== current) return;
      slot.revealed = true;
      clearTimeout(slot.timer);
      slot.onReveal?.();
      requestAnimationFrame(() => slot.node.classList.add('visible'));
      setTimeout(() => {
        for (const other of [...slots]) if (other !== slot && other !== current) retire(other);
      }, FADE_MS + 40);
    }

    function play(slot) {
      // Une animation de Cyber Pinball qui tourne encore (la boucle du plateau) s'arrête de même.
      slot.handle?.setActive?.(active && !document.hidden);
      const video = slot.media;
      if (video?.tagName !== 'VIDEO') return;
      // Ouverture finie : la vidéo garde sa dernière image, un nouvel état ne la relance pas.
      if (slot.once && video.ended) return;
      if (active && !document.hidden) {
        video.play().catch(() => {});
        // La vidéo affichée a son son dès qu'elle part, même avant sa première image.
        if (slot === current) voice(slot);
      } else video.pause();
    }

    function show(view, opts = {}) {
      const key = keyOf(view, opts);
      if (current?.key === key) return;
      // Une couche encore en attente de sa première image est abandonnée.
      for (const other of [...slots]) if (other !== current && !other.revealed) retire(other);

      const node = el('div', 'media-slot');
      const frame = el('div', 'media-frame');
      node.append(frame);
      const slot = { key, node, url: view?.url, view, once: Boolean(opts.once) };
      slots.add(slot);
      const previous = current;
      // L'ancienne vidéo se tait pendant le fondu enchaîné.
      if (previous?.media?.tagName === 'VIDEO' && !previous.media.muted) voiceTo(previous.media, 0, FADE_MS);
      current = slot;
      root.append(node);
      if (!previous) node.classList.add('instant');

      if (!view) {
        reveal(slot);
        return;
      }
      if (!view.url) {
        setRotation(frame, 0);
        frame.append(fallbackContent(view, opts, slot));
        fitTexts(frame);
        reveal(slot);
        return;
      }

      setRotation(frame, view.rotation);
      frame.classList.toggle('contain', view.fit !== 'cover');
      const media = take(view);
      slot.media = media;
      // Ouverture : jouée une fois, la dernière image reste (une vidéo finie garde son image).
      if (media.tagName === 'VIDEO') media.loop = !opts.once;
      if (opts.once && opts.onEnd) {
        if (media.tagName === 'VIDEO') media.addEventListener('ended', () => slot === current && opts.onEnd(), { once: true });
        else slot.onReveal = opts.onEnd;
      }
      media.classList.add('media-element');
      media.style.objectFit = view.fit;

      const ready = () => {
        if (!slots.has(slot)) return;
        const width = media.videoWidth || media.naturalWidth;
        const height = media.videoHeight || media.naturalHeight;
        setRotation(frame, measuredRotation(view, width, height));
        if (opts.still) {
          const still = freeze(media, view);
          if (still !== media) {
            frame.replaceChildren(still);
            // Pendant la partie, aucun décodeur ne reste ouvert pour une image figée.
            unload(media);
            slot.media = still;
          }
        } else {
          play(slot);
          voice(slot);
        }
        reveal(slot);
      };
      const failed = () => {
        if (!slots.has(slot)) return;
        if (media.tagName === 'VIDEO') report(view, videoError(media), { code: media.error?.code });
        else report(view, t('Image illisible (fichier abîmé ou format non pris en charge)'), { image: true });
        // Repli, sans garder l'élément illisible en réserve.
        slot.media = undefined;
        unload(media);
        pool.delete(view.url);
        frame.replaceChildren(fallbackContent({ ...view, url: undefined, fallback: view.fallback ?? fallbackOf(view) }, opts, slot));
        setRotation(frame, 0);
        fitTexts(frame);
        reveal(slot);
      };

      frame.append(media);
      if (media.tagName === 'VIDEO') {
        if (media.error) return failed();
        media.addEventListener('error', failed, { once: true });
        if (media.readyState >= 2) ready();
        else media.addEventListener('loadeddata', ready, { once: true });
        if (opts.still) media.currentTime = 0;
      } else if (media.complete && media.naturalWidth) ready();
      else if (media.complete && media.src) failed();
      else {
        media.addEventListener('load', ready, { once: true });
        media.addEventListener('error', failed, { once: true });
      }
      // Vidéo lente à démarrer : le fondu se fait quand même, sur la première image venue.
      slot.timer = setTimeout(() => !opts.still && slots.has(slot) && reveal(slot), READY_TIMEOUT_MS);
    }

    function setActive(on) {
      active = on;
      for (const slot of slots) play(slot);
    }

    function setVolume(v) {
      const next = Math.min(1, Math.max(0, Number(v) || 0));
      if (next === volume) return;
      volume = next;
      voice(current);
    }

    const handle = {
      show,
      setActive,
      setVolume,
      /** Ce que montre la couche, pour les essais : élément, fichier, lecture. */
      state: () => {
        const slot = current;
        const node = slot?.media;
        const tag = node?.tagName;
        return {
          // « marque » : l'affichage par défaut de Cyber Pinball (aucune table), « repli » : celui d'une table sans ce média.
          element: tag === 'VIDEO' ? 'vidéo' : tag === 'IMG' ? 'image' : tag === 'CANVAS' ? 'image figée' : slot?.view ? (slot.view.brand ? 'marque' : 'repli') : 'vide', // i18n-ignore : état lu par les essais
          fichier: slot?.url ? decodeURIComponent(slot.url).replace(/^.*[\\/]/, '').replace(/\?v=.*$/, '') : undefined,
          lecture: tag === 'VIDEO' ? (node.paused ? 'en pause' : 'en lecture') : undefined,
        };
      },
      /** Vidéo affichée et son volume, pour les essais. */
      sound: () => {
        const video = current?.media?.tagName === 'VIDEO' ? current.media : undefined;
        return { volume, video: video ? { muted: video.muted, volume: Math.round(video.volume * 1000) / 1000, paused: video.paused } : undefined };
      },
      urls: () => [...slots].map((s) => s.url).filter(Boolean),
      refresh: () => setActive(active),
      destroy() {
        for (const slot of [...slots]) retire(slot);
        root.remove();
        layers.delete(handle);
      },
    };
    layers.add(handle);
    return handle;
  }

  function fallbackOf(view) {
    return { Playfield: 'playfield-gradient', Backglass: 'backglass-card', DMD: 'dmd-dots', FullDMD: 'dmd-dots', Topper: 'topper-logo' }[view.type] ?? 'none';
  }

  // Fenêtre cachée (réduite, recouverte en plein écran) : toutes les vidéos en pause.
  document.addEventListener('visibilitychange', () => {
    for (const l of layers) l.refresh();
  });

  // ---------- Logos de la liste ----------

  /** url -> <img> déjà décodée, réutilisée d'un rendu à l'autre (pas de clignotement). */
  const logos = new Map();
  let generation = 0;

  /** À appeler avant chaque rendu de la liste. */
  function beginRender() {
    generation++;
  }

  /** Logo du jeu (Wheel) ; undefined si la table n'en a pas ou s'il est illisible. */
  function logo(url, className) {
    if (!url) return undefined;
    let img = logos.get(url);
    if (img?.dataset.broken) return undefined;
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.draggable = false;
      img.alt = '';
      img.src = url;
      img.addEventListener('error', () => {
        img.dataset.broken = '1';
        report({ url, role: 'playfield', type: 'Wheel' }, t('Logo illisible (fichier abîmé ou format non pris en charge)'));
        document.querySelectorAll(`img[data-logo="${CSS.escape(url)}"]`).forEach((n) => n.classList.add('broken'));
      });
      img.dataset.logo = url;
      logos.set(url, img);
      if (logos.size > 64) logos.delete(logos.keys().next().value);
    }
    // Même logo deux fois dans un rendu (table choisie et liste) : une copie.
    const node = img.dataset.generation === String(generation) ? img.cloneNode() : img;
    node.dataset.generation = String(generation);
    node.className = className ?? '';
    return node;
  }

  /** Sortie audio de toutes les vidéos (celle du fronton, choisie par menu-audio.js). */
  function setSink(id) {
    if (id === sinkId) return;
    sinkId = id ?? '';
    for (const video of document.querySelectorAll('video')) video.setSinkId(sinkId).catch(() => {});
    for (const node of pool.values()) if (node.tagName === 'VIDEO') node.setSinkId(sinkId).catch(() => {});
  }

  /**
   * Cercle du bord du médaillon dans son image (12/11/2026) : l'anneau chromé du gabarit n'est pas
   * centré sur l'image (plus épais en bas à droite), le point opaque le plus lointain donnait un
   * cercle trop large d'un côté. Sur 180 rayons, le dernier point opaque (alpha > 128) depuis le
   * centre, puis le cercle qui passe au plus près de ces points (moindres carrés). Rendu en part
   * du demi-grand côté de l'image : { r, dx, dy } (centre décalé de dx, dy). Mesuré une fois par
   * logo, sur une copie de 256 points ; { r: 1, dx: 0, dy: 0 } si l'image ne se lit pas.
   */
  const medallionReach = new Map();
  const WHOLE = { r: 1, dx: 0, dy: 0 };
  /** Cercle des moindres carrés (méthode de Kåsa : x² + y² + D x + E y + F = 0) ; undefined s'il est dégénéré. */
  function fitCircle(pts) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    for (const [x, y] of pts) {
      const z = x * x + y * y;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
    }
    const m = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, pts.length]];
    const v = [-sxz, -syz, -sz];
    const det = (q) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
    const base = det(m);
    if (!base) return undefined;
    const col = (k) => det(m.map((row, r) => row.map((c, j) => (j === k ? v[r] : c))));
    const ox = -col(0) / base / 2;
    const oy = -col(1) / base / 2;
    const r = Math.sqrt(Math.max(0, ox * ox + oy * oy - col(2) / base));
    return r > 0 ? { ox, oy, r } : undefined;
  }
  /**
   * Seuil d'opacité du bord : le chrome d'un médaillon est opaque, une ombre portée ou une lueur
   * autour de lui ne l'est qu'en partie. Avec un seuil à mi-opacité, l'ombre floue d'une wheel
   * téléchargée passait pour le bord, et l'anneau grossissait du côté de l'ombre (12/11/2026).
   */
  const OPAQUE = 240;
  /** Cercle qui passe par trois points ; undefined s'ils sont alignés. */
  function circleThrough([ax, ay], [bx, by], [cx, cy]) {
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-6) return undefined;
    const a2 = ax * ax + ay * ay;
    const b2 = bx * bx + by * by;
    const c2 = cx * cx + cy * cy;
    const ox = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const oy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    return { ox, oy, r: Math.hypot(ax - ox, ay - oy) };
  }
  /**
   * Bord du médaillon : sur 180 rayons partis du centre, le dernier pixel opaque. Un logo qui déborde
   * du disque (titre posé en travers du bas, bâton qui dépasse : Star Trek, Time Lord, 12/11/2026)
   * donne des points hors du cercle. Même s'ils ne dépassent que de quelques pixels sur un large arc,
   * ils tiraient l'anneau vers eux. Le cercle retenu est celui qui passe, à 1,5 pixel près, par le
   * plus de points (cercles candidats par trois points répartis sur le tour), puis il est affiné par
   * les moindres carrés sur ces seuls points. Si moins d'un tiers des points tombent sur un même
   * cercle, l'image n'a pas de bord rond : { r: 1 }, la place entière.
   */
  function edgeCircle(d, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const far = Math.hypot(cx, cy);
    const pts = [];
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      for (let t = far; t > 0; t -= 0.5) {
        const x = Math.floor(cx + ux * t);
        const y = Math.floor(cy + uy * t);
        if (x < 0 || y < 0 || x >= w || y >= h || d[(y * w + x) * 4 + 3] < OPAQUE) continue;
        pts.push([ux * t, uy * t]);
        break;
      }
    }
    if (pts.length < 12) return WHOLE;
    const near = 1.5;
    const on = (c, tol = near) => pts.filter((p) => Math.abs(Math.hypot(p[0] - c.ox, p[1] - c.oy) - c.r) <= tol);
    const n = pts.length;
    let best;
    let bestCount = 0;
    for (const [s1, s2] of [[n / 3, (2 * n) / 3], [n / 4, n / 2], [n / 6, n / 2], [n / 8, (3 * n) / 8]]) {
      for (let i = 0; i < n; i++) {
        const c = circleThrough(pts[i], pts[(i + Math.round(s1)) % n], pts[(i + Math.round(s2)) % n]);
        if (!c || c.r > far) continue;
        const count = on(c).length;
        if (count > bestCount) {
          best = c;
          bestCount = count;
        }
      }
    }
    if (!best || bestCount < n / 3) return WHOLE;
    // Affinage plus tolérant : un chrome pas tout à fait rond (Goonies) est moyenné de tous ses côtés.
    let c = best;
    for (let pass = 0; pass < 3; pass++) {
      const kept = on(c, 2.5);
      if (kept.length < 12) break;
      c = fitCircle(kept) ?? c;
    }
    const half = Math.max(w, h) / 2;
    return { r: Math.min(1, c.r / half), dx: c.ox / half, dy: c.oy / half };
  }
  function reach(url) {
    if (!url) return Promise.resolve(WHOLE);
    let known = medallionReach.get(url);
    if (known) return known;
    known = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        try {
          const k = 256 / Math.max(img.naturalWidth, img.naturalHeight, 1);
          const w = Math.max(1, Math.round(img.naturalWidth * k));
          const h = Math.max(1, Math.round(img.naturalHeight * k));
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, w, h);
          resolve(edgeCircle(g.getImageData(0, 0, w, h).data, w, h));
        } catch {
          resolve(WHOLE);
        }
      };
      img.onerror = () => resolve(WHOLE);
      img.src = url;
    });
    medallionReach.set(url, known);
    if (medallionReach.size > 256) medallionReach.delete(medallionReach.keys().next().value);
    return known;
  }

  /**
   * Première image d'un logo animé (APNG, GIF ou WebP animés), pour la roue qui ne laisse s'animer
   * que la table choisie (réglage « Logos animés », 12/11/2026). Promesse d'une adresse blob: de
   * cette image ; null pour un logo fixe, illisible, ou si le navigateur ne sait pas décoder
   * image par image (ImageDecoder). Calculée une fois par logo ; le fichier n'est lu en entier
   * que s'il est animé (l'en-tête suffit à le savoir).
   */
  const stills = new Map();
  const IMAGE_TYPES = { png: 'image/png', apng: 'image/apng', gif: 'image/gif', webp: 'image/webp' };
  async function decodeStill(url) {
    if (typeof ImageDecoder !== 'function' || typeof fetch !== 'function') return null;
    let decoder;
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) return null;
      const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(decodeURIComponent(url))?.[1]?.toLowerCase();
      const type = (res.headers.get('content-type') || '').split(';')[0].trim() || IMAGE_TYPES[ext] || '';
      if (!/^image\/(png|apng|gif|webp)$/.test(type) || !(await ImageDecoder.isTypeSupported(type))) {
        res.body.cancel().catch(() => {});
        return null;
      }
      decoder = new ImageDecoder({ data: res.body, type });
      await decoder.tracks.ready;
      if (!decoder.tracks.selectedTrack?.animated) return null;
      const { image } = await decoder.decode({ frameIndex: 0 });
      const canvas = document.createElement('canvas');
      canvas.width = image.displayWidth;
      canvas.height = image.displayHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      image.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? URL.createObjectURL(blob) : null;
    } catch {
      return null;
    } finally {
      decoder?.close();
    }
  }
  function still(url) {
    if (!url) return Promise.resolve(null);
    let known = stills.get(url);
    if (!known) {
      known = decodeStill(url);
      stills.set(url, known);
      if (stills.size > 128) {
        const [old, value] = stills.entries().next().value;
        stills.delete(old);
        value.then((blob) => blob && URL.revokeObjectURL(blob));
      }
    }
    return known;
  }
  /**
   * Image de la première image d'un logo animé, prête à poser (décodée) : une <img> neuve par
   * demande ; null pour un logo fixe ou illisible. Voir still.
   */
  async function stillLogo(url, className) {
    const blob = await still(url);
    if (!blob) return null;
    const img = new Image();
    img.decoding = 'async';
    img.draggable = false;
    img.alt = '';
    img.className = className ?? '';
    img.src = blob;
    try {
      await img.decode?.();
    } catch {
      return null;
    }
    return img;
  }

  window.CyberMedia = { layer, preload, logo, reach, stillLogo, beginRender, measuredRotation, fitTexts, setSink };
})();
