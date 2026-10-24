// Médias des jeux dans les fenêtres du menu (tâche T2, docs/recherche/medias.md § 5.5).
// Chaque rôle affiché (fond du playfield, backglass, DMD, topper, et chaque zone d'un
// écran partagé) a sa couche : image ou vidéo en boucle, fondu enchaîné court au
// changement de table, rotation d'après le bord des flippers, `cover` pour le fond
// du playfield, `contain` sur fond noir ailleurs. Sans média, le repli intégré
// (fallback.js, tâche T3, quand il est chargé), sinon un repli minimal : le titre.
//
//   const layer = CyberMedia.layer(conteneur, { role: 'backglass', minimal });
//   layer.show(vue);                  // vue : MediaView de packages/core/src/mediaview.ts
//   layer.show(vue, { still: true }); // première image, figée (fond de partie)
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

  function videoError(video) {
    const e = video.error;
    const codes = { 1: 'lecture interrompue', 2: 'erreur réseau', 3: 'décodage impossible', 4: 'format non pris en charge' };
    return `Vidéo illisible : ${codes[e?.code] ?? 'erreur inconnue'}${e?.message ? ` (${e.message})` : ''}`;
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
      const still = opts.still ? ':figé' : '';
      if (view.url) return `${view.url}${still}`;
      const card = view.card ?? {};
      return `repli:${opts.game ? 'partie' : view.fallback}:${view.type}:${card.title}:${card.manufacturer}:${card.year}${still}`;
    }

    function fallbackContent(view, opts, slot) {
      const card = view.card ?? {};
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
      requestAnimationFrame(() => slot.node.classList.add('visible'));
      setTimeout(() => {
        for (const other of [...slots]) if (other !== slot && other !== current) retire(other);
      }, FADE_MS + 40);
    }

    function play(slot) {
      const video = slot.media;
      if (video?.tagName !== 'VIDEO') return;
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
      const slot = { key, node, url: view?.url, view };
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
        else report(view, 'Image illisible (fichier abîmé ou format non pris en charge)', { image: true });
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
          element: tag === 'VIDEO' ? 'vidéo' : tag === 'IMG' ? 'image' : tag === 'CANVAS' ? 'image figée' : slot?.view ? 'repli' : 'vide',
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
        report({ url, role: 'playfield', type: 'Wheel' }, 'Logo illisible (fichier abîmé ou format non pris en charge)');
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

  window.CyberMedia = { layer, preload, logo, beginRender, measuredRotation, fitTexts, setSink };
})();
