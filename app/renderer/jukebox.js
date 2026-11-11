// Juke-box à l'écran (app/src/jukebox-player.ts, packages/core/src/jukebox-screens.ts) : le médaillon
// de la roue et son affiche, la liste sur le plateau (borne) ou dans le cadre 9:16 (bureau) à ses deux
// niveaux (les playlists, la gestion en tête ; les morceaux de la playlist ouverte), le clip sur le
// fronton avec son cartel, la pochette ou le visualiseur d'un son seul.
// Les zones et leurs cotes suivent les maquettes validées par le mainteneur le 09/11/2026 :
// en borne, à la référence 1080 × 1920 ; au bureau, 1920 × 1080 ; le fronton, 1920 × 1080. Une
// unité (--jp) les met à l'échelle de l'écran réel (la 4K double tout sans changer la composition).
//
//   CyberJukebox.playfield(s)          // nœuds du plateau en mode Juke-box (liste, lecteur au bureau)
//   CyberJukebox.wheelPoster(s, desk)  // affiche du médaillon choisi, derrière la roue
//   CyberJukebox.backglassPoster(s)    // la même, dans le cadre du fronton du menu au bureau
//   CyberJukebox.zone(node, role, s)   // zone d'un écran annexe : clip, affiche ou rien (false)
//   CyberJukebox.logo(classe, { wheel }) // médaillon sur le gabarit commun (allégé dans la roue)
//   CyberJukebox.status()              // ce que joue la fenêtre, pour les essais sans opérateur
//
// La lecture se fait dans la fenêtre du clip : le son et la vidéo muette d'un morceau sur la borne,
// lus ensemble (le son mène, la vidéo le suit), ou le fichier local. Le lecteur YouTube (en ligne)
// est une vue posée par le processus principal sur le cadre du clip : cette page lui en dit la place.

(() => {
  'use strict';

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = (name, className) => cyberIcon(name, className);
  const act = (node, action) => {
    node.dataset.act = JSON.stringify({ type: 'jukebox', ...action });
    return node;
  };

  /** Marque « CYBER PINBALL », PINBALL en vert signal. */
  function brand() {
    const node = el('div', 'jb-brand', 'CYBER ');
    node.append(el('b', '', 'PINBALL'));
    return node;
  }

  // ---------- Logo du médaillon ----------

  /**
   * Médaillon du Juke-box : le gabarit commun des médaillons de la roue (l'anneau chromé,
   * docs/design-system/src/medaillons.cjs), son centre rempli par le logo « Sillon » du 10/11/2026
   * (juke-box.svg : vinyle à sillons, deux croches vert signal dans un label sarcelle, six pistes de
   * son violettes) ; une illustration, pas un pictogramme du registre (celui-là est « jukebox »,
   * icons.js). Dans la roue, la version allégée (512 px, WebP) ; en grand (affiche du fronton,
   * animations), la pleine définition (920 px).
   */
  function logo(className = 'jb-logo', { wheel = false } = {}) {
    const img = el('img', className);
    img.src = wheel ? 'medaillons/juke-box-512.webp' : 'medaillons/juke-box.png';
    img.alt = t('Juke-box');
    img.draggable = false;
    return img;
  }

  // ---------- Pochettes dessinées (morceau sans image) ----------

  /** Six couples de couleurs, comme les pochettes des maquettes ; jamais clairs. */
  const PAIRS = [
    ['#9771d2', '#35bfc0'],
    ['#ed8b42', '#b75572'],
    ['#4488bb', '#45c6aa'],
    ['#bb557d', '#6c71cc'],
    ['#bf993c', '#5979a9'],
    ['#6c98b6', '#8b66ba'],
  ];

  function hash(text) {
    let h = 2166136261;
    for (const c of String(text)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    return h >>> 0;
  }

  /** Vignette d'un morceau : son image, sinon une scène abstraite tirée de sa clé (soleil, horizon, sillons). */
  function art(image, seed, className = 'jb-art') {
    const box = el('div', className);
    const [a, b] = PAIRS[hash(seed) % PAIRS.length];
    box.style.setProperty('--art-a', a);
    box.style.setProperty('--art-b', b);
    box.dataset.scene = String(hash(`${seed}·`) % 3);
    if (image) {
      const img = el('img', 'jb-art-img');
      img.alt = '';
      img.src = image;
      img.addEventListener('error', () => img.remove(), { once: true });
      box.append(img);
    }
    return box;
  }

  // ---------- Affiche (médaillon, fronton au repos) ----------

  /** « 4 playlists · 86 morceaux · 5 h 42 » : les nombres (et les durées) en gras. */
  function statsLine(text) {
    const node = el('p', 'jb-poster-stats');
    let at = 0;
    for (const m of String(text).matchAll(/\d+(?:[ \u00a0\u202f]h[ \u00a0\u202f]\d+)?/g)) {
      if (m.index > at) node.append(document.createTextNode(text.slice(at, m.index)));
      node.append(el('strong', '', m[0]));
      at = m.index + m[0].length;
    }
    if (at < text.length) node.append(document.createTextNode(text.slice(at)));
    return node;
  }

  /**
   * Disque de l'affiche : le logo, un halo qui respire, une orbite et un grand vinyle qui tournent
   * lentement derrière lui (transformations et opacité seulement : léger pour la carte graphique).
   */
  function emblem() {
    const box = el('div', 'jb-emblem');
    box.setAttribute('aria-hidden', 'true');
    box.append(el('div', 'jb-emblem-vinyl'), el('div', 'jb-emblem-halo'), el('div', 'jb-emblem-rail'), el('div', 'jb-emblem-orbit'), logo('jb-logo'), el('div', 'jb-emblem-wave'));
    return box;
  }

  /**
   * Ambiance pendant la musique (plateau en borne, fronton d'un son seul) : un grand vinyle qui tourne
   * lentement, un halo qui suit les graves (pouls du son, jukebox-pulse) ou respire doucement quand le
   * son ne se mesure pas (lecteur YouTube), quelques particules qui montent. Derrière tout le reste,
   * discret : la liste reste parfaitement lisible.
   */
  function ambiance() {
    const box = el('div', 'jb-ambiance');
    box.setAttribute('aria-hidden', 'true');
    const dust = el('div', 'jb-amb-dust');
    for (let i = 0; i < 9; i++) {
      const dot = el('i');
      dot.style.left = `${8 + ((i * 37) % 84)}%`;
      dot.style.animationDelay = `${-i * 0.9}s`;
      dot.style.animationDuration = `${7 + (i % 4)}s`;
      dust.append(dot);
    }
    box.append(el('div', 'jb-amb-vinyl'), el('div', 'jb-amb-halo'), dust);
    return box;
  }

  /** Pouls du son : posé sur les ambiances seulement (pas sur toute la page), une quinzaine de fois par seconde. */
  let pulseQuiet;
  window.cyber?.onJukeboxPulse?.((pulse) => {
    const boxes = document.querySelectorAll('.jb-ambiance');
    for (const box of boxes) {
      box.style.setProperty('--jb-bass', String(Math.min(1, Math.max(0, Number(pulse?.bass) || 0))));
      box.style.setProperty('--jb-high', String(Math.min(1, Math.max(0, Number(pulse?.high) || 0))));
      box.classList.add('jb-pulse');
    }
    clearTimeout(pulseQuiet);
    pulseQuiet = setTimeout(() => document.querySelectorAll('.jb-ambiance.jb-pulse').forEach((b) => b.classList.remove('jb-pulse')), 600);
  });

  /** Affiches déjà construites : la même affiche reste le même nœud, ses animations ne repartent pas à chaque état. */
  const posters = new Map();

  /**
   * L'affiche du Juke-box (piste « Sillon » du 10/11/2026) :
   * le grand titre face au disque éclairé, les chiffres de la bibliothèque, la dernière écoute (ou
   * l'invitation). `hint` : le rappel « Start · Ouvrir le Juke-box » en pied (médaillon choisi sur la roue).
   */
  function poster(p, className = '', hint = false) {
    const key = JSON.stringify([className, hint, p]);
    const known = posters.get(key);
    if (known) return known;
    const box = el('section', `jb-poster ${className}`.trim());
    box.classList.toggle('jb-poster-empty', Boolean(p.empty));
    const stage = el('div', 'jb-poster-stage');
    const head = el('header', 'jb-poster-head');
    head.append(brand(), el('span', 'jb-poster-edition', t('La musique habite ici')));
    const copy = el('div', 'jb-poster-copy');
    copy.append(el('p', 'jb-label', t('Votre borne. Votre musique.')), el('h1', 'jb-poster-title', t('JUKE-BOX')), statsLine(p.stats), el('div', 'jb-poster-rule'), el('p', 'jb-eyebrow', p.eyebrow));
    const heading = el('h2', 'jb-poster-heading', p.heading);
    heading.title = p.heading;
    copy.append(heading);
    if (p.detail) {
      const detail = el('p', 'jb-muted jb-poster-detail jb-ellipsis', p.detail);
      detail.title = p.detail;
      copy.append(detail);
    }
    stage.append(head, copy, emblem());
    if (hint) {
      const foot = el('footer', 'jb-poster-foot');
      const go = el('span', 'jb-poster-go');
      go.append(el('span', 'jb-keycap', t('Start')), document.createTextNode(t('Ouvrir le Juke-box')));
      foot.append(el('span', '', t('Vos playlists prennent la scène.')), go);
      stage.append(foot);
    }
    box.append(stage);
    posters.set(key, box);
    // Quelques affiches au plus (roue, fronton, bureau) : les plus anciennes sont oubliées.
    if (posters.size > 8) posters.delete(posters.keys().next().value);
    return box;
  }

  // ---------- Commandes ----------

  /**
   * Start tenu : l'anneau qui se remplit en JUKEBOX_MANAGE_HOLD_MS (une seconde), parti de l'instant de
   * l'appui (horloge du processus principal) : redessiné en cours d'appui, il ne repart pas de zéro.
   */
  function holdRing(hold) {
    const ring = el('span', 'jb-hold-ring');
    ring.style.setProperty('--hold-ms', `${hold.ms}ms`);
    ring.style.animationDelay = `${-Math.max(0, Math.min(hold.ms, Date.now() - hold.since))}ms`;
    return ring;
  }

  let holdShown;

  function command(c, desk) {
    const node = el('span', `jb-command${c.disabled ? ' jb-disabled' : ''}${c.id === 'manage' ? ' jb-command-manage' : ''}`);
    const key = el('span', 'jb-key', desk ? c.desk : c.cab);
    if (c.id === 'manage' && holdShown) {
      key.classList.add('jb-holding');
      key.append(holdRing(holdShown));
    }
    node.append(key, el('span', 'jb-command-action', c.action));
    if (c.id === 'manage') act(node, { op: 'manage' });
    else if (c.id === 'start') act(node, { op: 'start' });
    else if (c.id === 'magnasave') act(node, { op: 'playlist', dir: 1 });
    else if (c.id === 'exit') act(node, { op: 'exit' });
    return node;
  }

  function commands(view, desk) {
    const box = el('div', 'jb-zone jb-help');
    for (const c of view.commands) box.append(command(c, desk));
    return box;
  }

  // ---------- Liste des morceaux ----------

  const SOURCE = {
    online: ['globe', () => t('En ligne'), () => t('En ligne')],
    download: ['download', () => t('Sur la borne'), () => t('Sur la borne')],
    file: ['folder', () => t('Fichier local'), () => t('Fichier')],
  };
  const MARK = { download: 'download', waiting: 'clock', unavailable: 'close', offline: 'alert', ad: 'globe' };

  function sourceMark(source) {
    const [name, label] = SOURCE[source] ?? SOURCE.download;
    const box = el('span', 'jb-source');
    box.title = label();
    box.setAttribute('aria-label', label());
    box.append(icon(name));
    return box;
  }

  /**
   * Ligne fixe « Gestion du Juke-box », en tête de la liste : même hauteur et mêmes colonnes qu'un
   * morceau, l'icône du Juke-box à la place de la miniature, un chevron à la place de la durée.
   */
  function manageRow(r) {
    const row = el('div', `jb-row jb-manage${r.focus ? ' is-focus' : ''}`);
    act(row, { op: 'row', key: r.key });
    const badge = el('div', 'jb-art jb-manage-icon');
    badge.append(icon('jukebox'));
    if (holdShown) {
      row.classList.add('jb-holding');
      badge.append(holdRing(holdShown));
    }
    const text = el('div', 'jb-row-text');
    const title = el('span', 'jb-title jb-ellipsis', r.title);
    title.title = r.title;
    const line = el('span', 'jb-artist jb-ellipsis', r.line);
    line.title = r.line;
    text.append(title, line);
    const go = el('span', 'jb-manage-go');
    go.append(icon('chevron-right'));
    row.append(el('span', 'jb-num'), badge, text, el('span', 'jb-manage-none'), go);
    return row;
  }

  /** Pochettes d'une playlist : la mosaïque de ses quatre premières, une seule en grand, sinon la scène dessinée. */
  function mosaic(images, seed) {
    if (!images || images.length < 4) return art(images?.[0], seed);
    const box = el('div', 'jb-art jb-mosaic');
    for (const image of images.slice(0, 4)) {
      const img = el('img', 'jb-mosaic-img');
      img.alt = '';
      img.src = image;
      img.addEventListener('error', () => (img.style.visibility = 'hidden'), { once: true });
      box.append(img);
    }
    return box;
  }

  /** Repères des sources des morceaux d'une playlist (en ligne, sur la borne, fichier). */
  function sourceMarks(sources) {
    const box = el('span', 'jb-sources');
    for (const source of sources ?? []) box.append(sourceMark(source));
    return box;
  }

  /**
   * Une playlist, au niveau des playlists : mêmes hauteur et colonnes qu'un morceau ; la mosaïque de ses
   * pochettes, son nom, « 24 morceaux · 1 h 36 », les repères de ses sources, un chevron (Start l'ouvre).
   */
  function playlistRow(r) {
    const row = el('div', `jb-row jb-playlist-row${r.focus ? ' is-focus' : ''}${r.playing ? ' jb-playing' : ''}`);
    act(row, { op: 'row', key: r.key });
    const num = el('span', 'jb-num');
    if (r.playing) num.append(icon(r.playing === 'pause' ? 'pause' : 'play'));
    else num.textContent = r.num;
    const text = el('div', 'jb-row-text');
    const title = el('span', 'jb-title jb-ellipsis', r.title);
    title.title = r.title;
    const line = el('span', 'jb-artist jb-ellipsis', r.line);
    line.title = r.line;
    text.append(title, line);
    const go = el('span', 'jb-manage-go');
    go.append(icon('chevron-right'));
    row.append(num, mosaic(r.mosaic, r.key), text, sourceMarks(r.sources), go);
    return row;
  }

  /**
   * Ligne fixe d'une playlist ouverte (Tout lire, Lecture aléatoire, Répétition) : mêmes hauteur et
   * colonnes qu'un morceau, son icône sur une pastille (verte quand son mode est en vigueur).
   */
  function actionRow(r) {
    const row = el('div', `jb-row jb-manage jb-action${r.focus ? ' is-focus' : ''}${r.on ? ' jb-on' : ''}`);
    act(row, { op: 'row', key: r.key });
    const badge = el('div', 'jb-art jb-manage-icon');
    badge.append(icon(r.action));
    const text = el('div', 'jb-row-text');
    const title = el('span', 'jb-title jb-ellipsis', r.title);
    title.title = r.title;
    const line = el('span', 'jb-artist jb-ellipsis', r.line);
    line.title = r.line;
    text.append(title, line);
    row.append(el('span', 'jb-num'), badge, text, el('span', 'jb-manage-none'), el('span', 'jb-manage-none'));
    return row;
  }

  function trackRow(r) {
    if (r.manage) return manageRow(r);
    if (r.action) return actionRow(r);
    if (r.kind === 'playlist') return playlistRow(r);
    const row = el('div', `jb-row${r.focus ? ' is-focus' : ''}${r.playing ? ' jb-playing' : ''}${r.disabled ? ' jb-disabled' : ''}`);
    if (r.disabled) row.setAttribute('aria-disabled', 'true');
    act(row, { op: 'row', key: r.key });
    const num = el('span', 'jb-num');
    if (r.playing) num.append(icon(r.playing === 'pause' ? 'pause' : 'play'));
    else num.textContent = r.num;
    const text = el('div', 'jb-row-text');
    const title = el('span', 'jb-title jb-ellipsis', r.title);
    title.title = r.title;
    const line = el('span', `${r.mark ? 'jb-reason' : 'jb-artist'} jb-ellipsis${r.mark ? ` mark-${r.mark}` : ''}`);
    if (r.mark) line.append(icon(MARK[r.mark] ?? 'info', 'jb-reason-icon'));
    line.append(document.createTextNode(r.line));
    line.title = r.line;
    text.append(title, line);
    if (r.percent !== undefined) {
      const bar = el('div', 'jb-progress jb-row-progress');
      const fill = el('span');
      fill.style.width = `${Math.max(0, Math.min(100, r.percent))}%`;
      bar.append(fill);
      text.append(bar);
    }
    row.append(num, art(r.image, r.key), text, sourceMark(r.source), el('span', 'jb-duration', r.duration));
    return row;
  }

  function legend() {
    const box = el('span', 'jb-legend');
    for (const source of ['online', 'download', 'file']) {
      const [name, , short] = SOURCE[source];
      const part = el('span', 'jb-legend-item');
      part.append(icon(name), document.createTextNode(short()));
      box.append(part);
    }
    return box;
  }

  /**
   * Le chemin vers la gestion, avec les pastilles du bandeau : aucune playlist, Start sur « Gestion du
   * Juke-box » (juste au-dessus) ; une playlist vide, Start maintenu, d'où que l'on soit.
   */
  function emptyHelp(view) {
    const p = el('p', 'jb-empty-instructions');
    const pill = (key, action) => {
      const c = el('span', 'jb-command');
      c.append(el('span', 'jb-key', key), el('span', 'jb-command-action', action));
      return c;
    };
    const first = el('span', 'jb-empty-line');
    if (view.empty === 'library') first.append(pill(t('Start'), t('Gestion du Juke-box')));
    else first.append(pill(t('Start maintenu'), t('Gestion des playlists')));
    p.append(first, el('span', 'jb-empty-line', view.empty === 'library' ? t('Importer de YouTube, ou une nouvelle playlist') : t('Ajouter des fichiers, ou importer de YouTube')));
    return p;
  }

  function emptyList(view, desk) {
    const box = el('div', 'jb-empty');
    const bubble = el('div', 'jb-bubble');
    bubble.append(icon('music'));
    box.append(bubble);
    if (view.empty === 'library') {
      box.append(el('h2', '', t('Votre musique, à portée de flipper.')), el('p', 'jb-muted', t('Importez votre première playlist YouTube.')));
    } else {
      box.append(el('h2', '', t('Le prochain morceau est à vous.')), el('p', 'jb-muted', t('Cette playlist est vide. Ajoutez des morceaux depuis la gestion du Juke-box.')));
    }
    if (!desk) box.append(emptyHelp(view));
    return box;
  }

  // ---------- Temps du morceau en cours ----------

  const fmt = (s) => {
    if (!Number.isFinite(s) || s < 0) return '–:––';
    const v = Math.floor(s);
    const h = Math.floor(v / 3600);
    const m = Math.floor((v % 3600) / 60);
    const ss = String(v % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  let lastTime;

  /** Barre et temps du morceau en cours, partout où ils sont dessinés (sans redessiner la liste). */
  function showTime(time) {
    lastTime = time;
    for (const box of document.querySelectorAll('[data-jb-time]')) {
      if (!time || box.dataset.jbTime !== time.key) continue;
      const duration = time.duration ?? Number(box.dataset.jbDuration);
      const fill = box.querySelector('.jb-progress > span');
      if (fill) fill.style.width = `${duration > 0 ? Math.min(100, (time.position / duration) * 100) : 0}%`;
      const now = box.querySelector('[data-jb-now]');
      if (now) now.textContent = fmt(time.position);
      const total = box.querySelector('[data-jb-total]');
      if (total && duration > 0) total.textContent = fmt(duration);
      const both = box.querySelector('[data-jb-both]');
      if (both) both.textContent = `${fmt(time.position)} / ${duration > 0 ? fmt(duration) : '–:––'}`;
    }
  }

  window.cyber?.onJukeboxTime?.((time) => showTime(time));

  function progress(now) {
    const bar = el('div', 'jb-progress');
    const fill = el('span');
    const t0 = lastTime?.key === now.key ? lastTime : undefined;
    const d = t0?.duration ?? now.duration;
    fill.style.width = `${t0 && d > 0 ? Math.min(100, (t0.position / d) * 100) : 0}%`;
    bar.append(fill);
    return bar;
  }

  // ---------- Plateau, en borne ----------

  /** Les zones fixes du plateau en borne : elles restent d'un état à l'autre, seul leur contenu change. */
  let cab;

  function cabView(s) {
    const view = s.jukebox.player;
    if (!cab) {
      const node = el('section', 'jb jb-cab');
      const head = el('header', 'jb-zone jb-head');
      head.append(brand(), el('span', 'jb-badge', t('JUKE-BOX')));
      const playlist = el('div', 'jb-zone jb-playlist');
      const list = el('div', 'jb-zone jb-list');
      const now = el('div', 'jb-zone jb-now');
      const help = el('div', 'jb-zone jb-help');
      for (const [zone, name] of [[head, 'en-tete'], [playlist, 'playlist'], [list, 'liste'], [now, 'lecture'], [help, 'commandes']]) zone.dataset.stable = `juke-box-${name}`;
      node.append(ambiance(), head, playlist, list, now, help);
      cab = { node, playlist, list, now, help };
    }
    // L'ambiance ne s'anime que pendant la musique (pas en pause).
    cab.node.classList.toggle('jb-playing', Boolean(view.now && !view.now.paused));
    fillPlaylist(cab.playlist, view);
    fillList(cab.list, view, false);
    fillNow(cab.now, view, s, false);
    cab.help.replaceChildren(...view.commands.map((c) => command(c, false)));
    return cab.node;
  }

  /**
   * Fil d'Ariane d'une playlist ouverte : « ‹ Playlists › Néon nocturne », où « Playlists » remonte
   * (clic ; Exit aux boutons).
   */
  function crumb(view, className) {
    const box = el('nav', className);
    if (view.level === 'tracks') {
      const up = act(el('span', 'jb-crumb-up'), { op: 'up' });
      up.append(icon('chevron-left'), document.createTextNode(t('Playlists')));
      const here = el('span', 'jb-crumb-here jb-ellipsis', view.header.crumb ?? '');
      here.title = view.header.crumb ?? '';
      box.append(up, el('span', 'jb-crumb-sep', '›'), here);
    } else box.append(el('span', 'jb-crumb-here jb-ellipsis', view.header.crumb ?? t('Playlists')));
    return box;
  }

  /** En-tête du niveau : « Juke-box · 4 playlists » et PLAYLISTS, ou la playlist ouverte ; le fil d'Ariane dessous. */
  function fillPlaylist(box, view) {
    const top = el('div', 'jb-between');
    const names = el('div', 'jb-playlist-names');
    names.append(el('p', 'jb-label', view.header.label));
    const name = el('h1', 'jb-playlist-name jb-ellipsis', view.header.title.toLocaleUpperCase());
    name.title = view.header.title;
    names.append(name);
    top.append(names);
    if (view.header.badge) top.append(el('span', 'jb-badge', view.header.badge));
    // Le fil d'Ariane, dans une playlist seulement : au niveau des playlists, le titre suffit.
    box.replaceChildren(top, ...(view.level === 'tracks' ? [crumb(view, 'jb-crumb')] : []));
  }

  function fillList(box, view, desk) {
    const nodes = [];
    // Lignes fixes au-dessus d'une invitation : leur nombre, pour la place qui reste (jukebox.css).
    box.style.removeProperty('--fixed-rows');
    if (!desk) {
      const head = el('div', 'jb-track-head');
      head.append(el('span', '', view.list.head), view.empty ? el('span', '', '') : view.list.around ? el('span', 'jb-around', view.list.around) : legend());
      nodes.push(head);
    }
    // Aucune playlist, playlist vide : les lignes fixes en tête (on y crée, importe, ajoute), l'invitation dessous.
    if (view.empty && view.list.rows.length) {
      const rows = el('div', 'jb-rows');
      box.style.setProperty('--fixed-rows', String(view.list.rows.length));
      rows.dataset.defile = '';
      rows.append(...view.list.rows.map(trackRow));
      const invite = emptyList(view, desk);
      invite.classList.add('jb-empty-under');
      // Sous les quatre lignes fixes d'une playlist vide : l'invitation, sans sa pastille, tient dans la place qui reste.
      if (view.list.rows.length > 1) invite.classList.add('jb-empty-compact');
      nodes.push(rows, invite);
    } else if (view.empty) nodes.push(emptyList(view, desk));
    else {
      const rows = el('div', `jb-rows${view.list.after ? ' continues' : ''}${view.list.before ? ' scrolled' : ''}`);
      rows.dataset.defile = '';
      rows.append(...view.list.rows.map(trackRow));
      nodes.push(rows);
    }
    box.replaceChildren(...nodes);
  }

  /**
   * Molette sur la liste (souris, pavé tactile) : la sélection avance ou recule d'une ligne par cran, et la
   * fenêtre de la liste suit. Un cran de souris vaut 100 à 120 ; les petits pas d'un pavé tactile s'additionnent jusqu'à un cran.
   */
  let wheelSum = 0;
  function wheelable(node) {
    node.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        wheelSum += event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
        while (Math.abs(wheelSum) >= 100) {
          const dir = wheelSum > 0 ? 1 : -1;
          wheelSum -= dir * 100;
          window.cyber?.act?.({ type: 'jukebox', op: 'wheel', dir });
        }
      },
      { passive: false },
    );
  }

  /** Pied de la liste au bureau : « Sélection · 13 / 21 », puis ↑ et ↓ cliquables (une fenêtre de lignes). */
  function selectionFoot(view) {
    const foot = el('p', 'jb-fine jb-desk-selection', view.list.head);
    if (!view.list.around) return foot;
    const up = act(el('span', 'jb-page', '↑'), { op: 'page', dir: -1 });
    const down = act(el('span', 'jb-page', '↓'), { op: 'page', dir: 1 });
    up.title = t('Lignes précédentes');
    down.title = t('Lignes suivantes');
    const text = view.list.around.replace(/^↑\s*/, '').replace(/\s*↓$/, '');
    foot.append(document.createTextNode(' · '), up, document.createTextNode(` ${text} `), down);
    return foot;
  }

  function nowText(now, desk) {
    const text = el('div', 'jb-now-text');
    const eyebrow = el('div', `jb-eyebrow jb-meta${now.ad ? ' warning' : ''}`);
    eyebrow.append(icon(now.ad ? 'globe' : now.paused ? 'pause' : 'play'), document.createTextNode(desk && !now.ad ? `${now.paused ? t('En pause') : t('En lecture')} · ${now.position}` : now.label));
    const title = el('h2', 'jb-now-title jb-ellipsis', now.title);
    title.title = now.title;
    const line = el('p', 'jb-muted jb-ellipsis', [now.artist, now.album].filter(Boolean).join(' · '));
    // Le mode de lecture de sa playlist : ⤮ aléatoire, ⟳ en boucle (⟳1 : le morceau) ; rien dans l'ordre sans répétition.
    if (!desk && now.mode && (now.mode.shuffle || now.mode.repeat !== 'none')) {
      const modes = el('span', 'jb-modes');
      if (now.mode.shuffle) modes.append(modeMark('shuffle', t('Lecture aléatoire')));
      if (now.mode.repeat !== 'none') modes.append(modeMark(now.mode.repeat === 'track' ? 'repeat-one' : 'repeat', now.mode.repeat === 'track' ? t('Répétition : morceau') : t('Répétition : playlist')));
      eyebrow.append(modes);
    }
    text.append(eyebrow, title, line);
    return text;
  }

  function modeMark(name, label) {
    const mark = el('span', 'jb-mode');
    mark.title = label;
    mark.setAttribute('aria-label', label);
    mark.append(icon(name));
    return mark;
  }

  /** Au bureau, les boutons ⤮ et ⟳ de la carte du morceau : allumés quand le mode est en vigueur. */
  function modeButton(op, name, label, on) {
    const button = el('button', `jb-button jb-icon-button${on ? ' jb-on' : ''}`, '');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.append(icon(name));
    return act(button, { op });
  }

  function fillNow(box, view, s, desk) {
    const now = view.now;
    box.classList.toggle('jb-idle', !now);
    if (!now) {
      box.replaceChildren(el('p', 'jb-muted jb-now-idle', t('Aucune lecture en cours')));
      delete box.dataset.jbTime;
      return;
    }
    box.dataset.jbTime = now.key;
    box.dataset.jbDuration = String(now.duration ?? '');
    const time = el('div', 'jb-time');
    if (desk) {
      time.append(el('span', '', ''), el('span', '', now.ad ? t('Lecture du morceau suspendue') : now.origin));
      time.firstChild.dataset.jbBoth = '';
    } else if (now.ad) time.append(el('span', '', t('Lecture du morceau suspendue')), el('span', '', t('YouTube en ligne')));
    else {
      const a = el('span', '', '0:00');
      a.dataset.jbNow = '';
      const b = el('span', '', now.duration ? fmt(now.duration) : '–:––');
      b.dataset.jbTotal = '';
      // Entre les deux temps, comment mettre en pause : Start sur ce morceau (le bandeau le dit aussi sur sa ligne).
      time.append(a, el('span', 'jb-now-hint jb-ellipsis', now.paused ? t('Start sur ce morceau : reprendre') : t('Start sur ce morceau : pause')), b);
    }
    if (desk) {
      const top = el('div', 'jb-between');
      const pause = el('button', 'jb-button', '');
      pause.type = 'button';
      pause.append(icon(now.paused ? 'play' : 'pause'), document.createTextNode(now.paused ? t('Reprendre') : t('Pause')));
      // Pause ou reprise du morceau en cours, à tout niveau (Start, lui, ouvrirait la playlist choisie).
      act(pause, { op: 'pause' });
      const buttons = el('div', 'jb-now-buttons');
      const repeat = now.mode?.repeat ?? 'playlist';
      buttons.append(
        modeButton('shuffle', 'shuffle', now.mode?.shuffle ? t('Lecture aléatoire : oui') : t('Lecture aléatoire : non'), Boolean(now.mode?.shuffle)),
        modeButton('repeat', repeat === 'track' ? 'repeat-one' : 'repeat', repeat === 'track' ? t('Répétition : morceau') : repeat === 'none' ? t('Répétition : aucune') : t('Répétition : playlist'), repeat !== 'none'),
        pause,
      );
      top.append(nowText(now, true), buttons);
      // La barre se clique : le morceau reprend à cet endroit.
      const bar = progress(now);
      bar.classList.add('jb-seekable');
      bar.addEventListener('click', (event) => {
        const r = bar.getBoundingClientRect();
        if (r.width > 0) window.cyber?.act?.({ type: 'jukebox', op: 'seek-to', fraction: (event.clientX - r.left) / r.width });
      });
      box.replaceChildren(top, bar, time);
    } else {
      // La vignette du morceau en cours ; sans fronton, le clip lui-même (CyberJukebox, place « thumb »).
      const thumb = s.jukebox.clip?.place === 'thumb' ? clipHolder(s) : art(now.image, now.key, 'jb-art jb-now-art');
      const text = nowText(now, false);
      text.append(progress(now), time);
      box.replaceChildren(thumb, text);
    }
    // Flipper tenu : la position en grand sur la carte, le temps du morceau qui défile avec la barre.
    box.classList.toggle('jb-seeking', Boolean(now.seeking));
    if (now.seeking) {
      const big = el('div', 'jb-seek-big', '');
      big.dataset.jbBoth = '';
      box.append(big);
    }
    if (lastTime) showTime(lastTime);
  }

  // ---------- Plateau, au bureau ----------

  let desk;

  function deskView(s) {
    const view = s.jukebox.player;
    if (!desk) {
      const node = el('section', 'jb jb-desk');
      const frame = el('div', 'jb-zone jb-frame');
      const head = el('header', 'jb-zone jb-head');
      const manage = el('button', 'jb-button', '');
      manage.type = 'button';
      manage.append(icon('list'), document.createTextNode(t('Gestion du Juke-box')));
      act(manage, { op: 'manage' });
      head.append(brand(), manage);
      const clip = el('div', 'jb-zone jb-clip-zone');
      const now = el('div', 'jb-zone jb-now');
      const help = el('div', 'jb-zone jb-help');
      for (const [zone, name] of [[frame, 'liste'], [head, 'en-tete'], [clip, 'clip'], [now, 'lecture'], [help, 'commandes']]) zone.dataset.stable = `juke-box-${name}`;
      node.append(frame, head, clip, now, help);
      desk = { node, frame, clip, now, help, manage };
    }
    const top = el('div', 'jb-between');
    top.append(el('span', 'jb-label jb-ellipsis', view.header.label), el('span', 'jb-fine', view.header.badge ?? ''));
    const name = el('h1', 'jb-desk-name jb-ellipsis', view.header.title.toLocaleUpperCase());
    name.title = view.header.title;
    const list = el('div', 'jb-desk-list');
    fillList(list, view, true);
    wheelable(list);
    // Au bureau, la place du fil d'Ariane reste (vide au niveau des playlists) : la liste ne bouge pas d'un niveau à l'autre.
    const nodes = [top, name, view.level === 'tracks' ? crumb(view, 'jb-crumb jb-fine') : el('div', 'jb-crumb jb-crumb-none jb-fine'), el('div', 'jb-rule')];
    nodes.push(list);
    if (!view.empty) nodes.push(selectionFoot(view));
    desk.frame.replaceChildren(...nodes);
    // Le clip : la vidéo, la pochette, ou l'affiche quand rien ne joue.
    const holder = clipHolder(s);
    if (holder.parentNode !== desk.clip) desk.clip.replaceChildren(holder);
    if (view.now) fillNow(desk.now, view, s, true);
    else {
      desk.now.classList.add('jb-idle');
      delete desk.now.dataset.jbTime;
      const box = el('div', 'jb-stack');
      if (view.empty === 'library') box.append(el('h2', '', t('Aucune playlist')), el('p', 'jb-muted', t('Gestion du Juke-box → Créer ou importer une playlist')), el('p', 'jb-fine', t('Téléphone et fenêtre Récupérer également disponibles.')));
      else box.append(el('h2', '', t('Aucune lecture en cours')), el('p', 'jb-muted', view.level === 'playlists' ? t('Entrée : ouvrir la playlist choisie') : t('Entrée : jouer le morceau choisi')));
      desk.now.replaceChildren(box);
    }
    desk.help.replaceChildren(...view.commands.map((c) => command(c, true)));
    return desk.node;
  }

  // ---------- Clip ----------

  /**
   * Le clip, gardé d'un état à l'autre : un élément vidéo ou son retiré de la page s'arrêterait.
   * Il porte la lecture (ordre du processus principal, renouvelé à chaque morceau) et ce qui se
   * pose dessus : cartel du changement de morceau, repère de pause, pochette d'un son seul.
   */
  let clip;

  function clipHolder(s) {
    if (!clip) {
      const node = el('div', 'jb-clip');
      const stage = el('div', 'jb-clip-stage');
      const over = el('div', 'jb-clip-over');
      node.append(stage, over);
      clip = { node, stage, over, order: undefined, media: undefined };
      new ResizeObserver(() => reportClip()).observe(node);
    }
    syncClip(s.jukebox.clip);
    return clip.node;
  }

  /** Place du clip dans la fenêtre, pour la vue du lecteur YouTube (pixels de la page). */
  function reportClip() {
    if (!clip?.order || clip.order.kind !== 'online') return;
    const r = clip.node.isConnected ? clip.node.getBoundingClientRect() : undefined;
    window.cyber?.jukebox?.({ type: 'clip', rect: r && r.width > 1 ? { x: r.left, y: r.top, width: r.width, height: r.height } : undefined });
  }

  /** Rôle de cette fenêtre (son adresse) : seul le plateau joue la musique du menu. */
  const windowRole = new URLSearchParams(location.search).get('role') ?? 'playfield';

  /** Sortie du son : celle du fronton, par la musique du menu (menu-audio.js), qui la retrouve par son nom. */
  function route(media, output) {
    if (windowRole !== 'playfield') window.CyberMenuAudio?.update({ video: 0, output });
    window.CyberMenuAudio?.route?.(media);
  }

  const send = (msg) => window.cyber?.jukebox?.(msg);

  function stopMedia() {
    const m = clip?.media;
    if (!m) return;
    clearInterval(m.levelsTimer);
    m.context?.close().catch(() => {});
    for (const media of [m.audio, m.video]) {
      if (!media) continue;
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
    m.video?.remove();
    clip.media = undefined;
  }

  /** Niveaux du son, pris avant la sortie (captureStream), pour le spectre du DMD et le visualiseur. */
  function listen(m, source) {
    try {
      if (typeof source.captureStream !== 'function') return;
      const start = () => {
        if (m.context || clip?.media !== m) return;
        let stream;
        try {
          stream = source.captureStream();
        } catch {
          // Son illisible pour la mesure : le DMD garde son mouvement doux.
          return;
        }
        if (!stream.getAudioTracks().length) return;
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.7;
        context.createMediaStreamSource(stream).connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);
        m.context = context;
        m.levelsTimer = setInterval(() => {
          analyser.getByteFrequencyData(bins);
          // 24 bandes sur une échelle logarithmique, de 60 Hz à 12 kHz environ.
          const levels = [];
          const nyquist = context.sampleRate / 2;
          for (let b = 0; b < 24; b++) {
            const lo = Math.floor((60 * Math.pow(200, b / 24) / nyquist) * bins.length);
            const hi = Math.max(lo + 1, Math.floor((60 * Math.pow(200, (b + 1) / 24) / nyquist) * bins.length));
            let peak = 0;
            for (let i = lo; i < Math.min(hi, bins.length); i++) peak = Math.max(peak, bins[i]);
            levels.push(Math.round((peak / 255) * 1000) / 1000);
          }
          m.levels = levels;
          send({ type: 'levels', id: m.id, levels });
          paintVisualizer(levels);
        }, 66);
      };
      source.addEventListener('playing', start, { once: true });
    } catch {
      // Sans mesure du son : le DMD garde son mouvement doux.
    }
  }

  function startMedia(order) {
    stopMedia();
    const m = { id: order.id };
    clip.media = m;
    const report = (media) => {
      let last = 0;
      media.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - last < 240) return;
        last = now;
        send({ type: 'time', id: order.id, position: media.currentTime, duration: Number.isFinite(media.duration) ? media.duration : undefined, paused: media.paused });
      });
      media.addEventListener('ended', () => send({ type: 'ended', id: order.id }));
      media.addEventListener('error', () => send({ type: 'error', id: order.id, message: media.error?.message || String(media.error?.code ?? '') }));
    };
    if (order.kind === 'local') {
      // Le son mène : la vidéo muette le suit, recalée quand elle s'en écarte.
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.volume = order.volume;
      audio.src = order.audio;
      route(audio, order.output);
      report(audio);
      m.audio = audio;
      if (order.video) {
        const video = el('video', 'jb-video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = order.video;
        clip.stage.replaceChildren(video);
        m.video = video;
        const follow = () => {
          if (Math.abs(video.currentTime - audio.currentTime) > 0.25 && Number.isFinite(audio.currentTime)) video.currentTime = audio.currentTime;
        };
        audio.addEventListener('play', () => video.play().catch(() => {}));
        audio.addEventListener('pause', () => video.pause());
        audio.addEventListener('seeked', follow);
        audio.addEventListener('timeupdate', follow);
        // Une vidéo plus courte que le son garde sa dernière image ; illisible, la pochette prend sa place.
        video.addEventListener('error', () => {
          video.remove();
          m.video = undefined;
          paintStill(order);
        });
      }
      listen(m, audio);
      audio.play().catch(() => {});
    } else if (order.kind === 'file' && order.video) {
      const video = el('video', 'jb-video');
      video.crossOrigin = 'anonymous';
      video.playsInline = true;
      video.preload = 'auto';
      video.volume = order.volume;
      video.src = order.video;
      clip.stage.replaceChildren(video);
      route(video, order.output);
      report(video);
      m.video = video;
      listen(m, video);
      video.play().catch(() => {});
    } else if (order.kind === 'file') {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.volume = order.volume;
      audio.src = order.audio;
      route(audio, order.output);
      report(audio);
      m.audio = audio;
      listen(m, audio);
      audio.play().catch(() => {});
    }
  }

  function setPaused(paused) {
    const m = clip?.media;
    if (!m) return;
    const lead = m.audio ?? m.video;
    if (!lead) return;
    if (paused && !lead.paused) lead.pause();
    else if (!paused && lead.paused) lead.play().catch(() => {});
  }

  let stillKey;

  /** Ce qui se voit sans vidéo : la pochette agrandie (image du morceau, du fichier ou du dossier), sinon le visualiseur. */
  function paintStill(order, now) {
    const key = JSON.stringify([order?.id, order?.image, now?.key, now?.title]);
    if (stillKey === key && clip.stage.querySelector('.jb-audio')) return;
    stillKey = key;
    const box = el('div', 'jb-audio');
    const cover = order?.image ? art(order.image, now?.key ?? 'pochette', 'jb-art jb-audio-art') : visualizer();
    const text = el('div', 'jb-audio-text');
    if (now) {
      text.append(el('p', 'jb-label', order?.kind === 'file' ? t('Fichier local · son seul') : t('Son seul · {playlist}', { playlist: now.playlist })), el('h1', 'jb-audio-title jb-ellipsis', now.title));
      if (now.artist) text.append(el('h2', 'jb-ellipsis', now.artist));
      text.append(el('p', 'jb-muted jb-ellipsis', now.album ? t('Album {album}', { album: now.album }) : order?.image ? t('Pochette du morceau') : t('Sans pochette · visualiseur du Juke-box')));
    }
    box.append(ambiance(), cover, text);
    clip.stage.replaceChildren(box);
  }

  function visualizer() {
    const box = el('div', 'jb-visualizer');
    for (let i = 0; i < 21; i++) {
      const bar = el('span');
      bar.style.setProperty('--h', String(0.12 + ((i * 67) % 280) / 400));
      box.append(bar);
    }
    return box;
  }

  function paintVisualizer(levels) {
    const bars = clip?.stage.querySelectorAll('.jb-visualizer > span');
    if (!bars?.length) return;
    bars.forEach((bar, i) => bar.style.setProperty('--h', String(Math.max(0.06, levels[Math.min(levels.length - 1, Math.floor((i * levels.length) / bars.length))] ?? 0))));
  }

  let cardShown;

  /** Synchronise le clip avec ce que dit l'état : lecture (nouvel ordre), pause, cartel, affiche. */
  function syncClip(c) {
    if (!c) return;
    const order = c.order;
    const now = c.now;
    clip.node.dataset.place = c.place;
    if (!order) {
      if (clip.order) stopMedia();
      clip.order = undefined;
      clip.node.classList.remove('online');
      // La même affiche reste en place : ses animations (vinyle, halo) ne repartent pas à chaque état.
      const idle = c.place === 'thumb' ? art(undefined, 'repos', 'jb-art') : poster(c.poster, `jb-clip-poster place-${c.place}`);
      if (clip.stage.firstChild !== idle || clip.stage.childNodes.length !== 1) clip.stage.replaceChildren(idle);
      stillKey = undefined;
      clip.over.replaceChildren();
      return;
    }
    if (clip.order?.id !== order.id) {
      clip.order = order;
      clip.node.classList.toggle('online', order.kind === 'online');
      stillKey = undefined;
      if (order.kind === 'online') {
        stopMedia();
        // Le lecteur YouTube (une vue du processus principal) se pose ici : dessous, du noir.
        clip.stage.replaceChildren(el('div', 'jb-online-ground'));
        requestAnimationFrame(reportClip);
      } else startMedia(order);
    } else clip.order = order;
    // Son seul (ou vidéo absente) : la pochette, sinon le visualiseur.
    if (order.kind !== 'online' && !clip.media?.video) paintStill(order, now);
    setPaused(order.paused);
    // Flipper tenu : le morceau reprend à la position voulue (le son mène, la vidéo le suit).
    if (c.seek && clip.seekId !== c.seek.id) {
      clip.seekId = c.seek.id;
      const m = clip.media;
      for (const media of [m?.audio, m?.video]) if (media && Number.isFinite(c.seek.to)) media.currentTime = c.seek.to;
    }
    // Repères posés sur le clip : la pause, et le cartel du changement de morceau (4 s).
    const over = [];
    if (order.paused && order.kind !== 'online') {
      const badge = el('div', 'jb-clip-badge');
      badge.append(icon('pause'), document.createTextNode(t('En pause')));
      over.push(badge);
    }
    if (c.card && now && c.place !== 'thumb' && Date.now() < c.card.until && (clip.media?.video || cardShown === c.card.id)) {
      cardShown = c.card.id;
      const card = el('div', 'jb-card');
      card.append(el('div', 'jb-eyebrow jb-ellipsis', c.card.eyebrow), el('h1', 'jb-card-title jb-ellipsis', now.title));
      const line = el('p', 'jb-ellipsis', now.artist ?? '');
      if (now.album) line.append(el('span', 'jb-muted', ` · ${now.album}`));
      card.append(line);
      over.push(card);
    }
    clip.over.replaceChildren(...over);
    if (order.kind === 'online') requestAnimationFrame(reportClip);
  }

  // ---------- Entrée depuis la roue (jukebox-entrance.ts) ----------

  /**
   * Animation d'entrée sur un écran : la classe jb-entree, et le temps déjà écoulé depuis le Start
   * (--jb-entree-t, en délai négatif) pour que les trois écrans restent d'accord, même posés en retard.
   * Sans entrée dans l'état (finie, ou un bouton l'a interrompue), la classe part : chaque élément
   * est aussitôt dans son état final, qui est son état normal.
   */
  function entrance(node, s) {
    const e = s.jukebox?.entrance;
    if (!e) {
      if (node.classList.contains('jb-entree')) node.classList.remove('jb-entree');
      delete node.dataset.entree;
      return;
    }
    if (node.dataset.entree === String(e.id)) return;
    node.dataset.entree = String(e.id);
    node.style.setProperty('--jb-entree-t', `${-Math.max(0, Date.now() - e.startedAt)}ms`);
    node.classList.remove('jb-entree');
    void node.offsetWidth;
    node.classList.add('jb-entree');
  }

  /**
   * Départ du disque sur le plateau en borne (entrée A) : l'affiche de la roue, posée par-dessus la
   * liste, s'efface pendant que son disque s'allume, recule et file vers le fronton. Couche décorative
   * (aucun clic, rognée par le plateau) ; retirée dès que l'entrée est finie ou interrompue.
   */
  function departure(node, s) {
    const e = s.jukebox?.entrance;
    let layer = node.querySelector(':scope > .jb-entree-depart'); // i18n-ignore : sélecteur CSS
    if (!e) {
      layer?.remove();
      return;
    }
    if (layer?.dataset.entree === String(e.id)) return;
    layer?.remove();
    layer = el('div', 'jb-entree-depart');
    layer.dataset.entree = String(e.id);
    layer.dataset.bleed = '';
    layer.setAttribute('aria-hidden', 'true');
    const disc = logo('jb-entree-disc');
    disc.alt = '';
    layer.append(poster(e.poster, 'jb-wheel-poster jb-entree-poster'), el('div', 'jb-entree-ray'), el('div', 'jb-entree-wave'), disc);
    node.append(layer);
  }

  // ---------- Écrans annexes (fronton) et affiche ----------

  /** Contenu du Juke-box posé dans une zone (le fronton) ; false : la zone montre son média. */
  const zoneNodes = new Map();

  function zone(node, part, s) {
    const j = s.jukebox;
    let content;
    if (part === 'backglass' && j?.clip?.place === 'zone') content = clipHolder(s);
    else if (part === 'backglass' && j?.cover) content = coverCard(j.cover);
    else if (part === 'backglass' && j?.wheel) content = poster(j.wheel.poster, 'jb-fronton-poster', true);
    const old = zoneNodes.get(node);
    if (!content) {
      if (old) {
        old.wrap.remove();
        zoneNodes.delete(node);
      }
      return false;
    }
    let wrap = old?.wrap;
    if (!wrap) {
      wrap = el('div', 'jb-zone-fill');
      node.append(wrap);
      zoneNodes.set(node, { wrap });
    }
    if (wrap.firstChild !== content) wrap.replaceChildren(content);
    entrance(wrap, s);
    return true;
  }

  /** Fronton d'une autre fenêtre que celle du clip (bureau à deux écrans) : le morceau en cours, sinon l'affiche. */
  function coverCard(c) {
    if (!c.now) return poster(c.poster, 'jb-fronton-poster');
    const box = el('section', 'jb-poster jb-fronton-poster'); // i18n-ignore : classes CSS
    const audio = el('div', 'jb-audio');
    const text = el('div', 'jb-audio-text');
    text.append(el('p', 'jb-label', c.now.label), el('h1', 'jb-audio-title jb-ellipsis', c.now.title));
    if (c.now.artist) text.append(el('h2', 'jb-ellipsis', c.now.artist));
    if (c.now.album) text.append(el('p', 'jb-muted jb-ellipsis', t('Album {album}', { album: c.now.album })));
    audio.append(art(c.now.image, c.now.key, 'jb-art jb-audio-art'), text);
    box.append(audio);
    return box;
  }

  /** Affiche du médaillon choisi, derrière la roue (borne) ou dans le cadre du plateau (bureau). */
  function wheelPoster(s, isDesk) {
    return poster(s.jukebox.wheel.poster, isDesk ? 'jb-wheel-poster desk' : 'jb-wheel-poster');
  }

  /** La même, dans le cadre du fronton du menu au bureau : identité à gauche, textes à droite. */
  function backglassPoster(s) {
    return poster(s.jukebox.wheel.poster, 'jb-wheel-fronton', true);
  }

  function playfield(s) {
    const isDesk = s.jukebox.layout === 'desk';
    document.documentElement.classList.toggle('jukebox-desk', isDesk);
    if (isDesk) cab = undefined;
    else desk = undefined;
    // Start tenu : l'anneau de la ligne « Gestion » et de son rappel (manageHold de la vue).
    holdShown = s.jukebox?.player?.manageHold;
    const node = isDesk ? deskView(s) : cabView(s);
    entrance(node, s);
    if (!isDesk) departure(node, s);
    if (lastTime) showTime(lastTime);
    return [node];
  }

  /**
   * Lecture en fond (bureau, gestion des playlists ouverte depuis le lecteur) : le clip quitte l'écran
   * mais reste dans la page, caché : un élément vidéo retiré de la page s'arrêterait.
   */
  function background(s) {
    let parking = document.getElementById('jb-parking');
    if (!parking) {
      parking = el('div');
      parking.id = 'jb-parking';
      parking.hidden = true;
      document.body.append(parking);
    }
    const holder = clipHolder(s);
    if (holder.parentNode !== parking) parking.replaceChildren(holder);
  }

  /**
   * Contrôle de débordement en production (playfield, Juke-box et sa gestion) : une fois par ouverture,
   * ce qui dépasse de la fenêtre (page plus large ou plus haute, élément visible hors de la fenêtre) va au
   * journal, nommé avec ses dimensions. Rien quand tout tient. Un élément rogné par son conteneur ne se
   * voit pas hors de la fenêtre : c'est ce conteneur qui compte.
   */
  function overflowCheck(where) {
    const vw = innerWidth;
    const vh = innerHeight;
    const T = 2;
    const out = [];
    const page = document.documentElement;
    if (page.scrollWidth > vw + T || page.scrollHeight > vh + T) out.push(`page ${page.scrollWidth} × ${page.scrollHeight} pour une fenêtre de ${vw} × ${vh}`); // i18n-ignore : journal
    for (const node of document.querySelectorAll('#root *')) {
      if (out.length >= 4) break;
      const r = node.getBoundingClientRect();
      if (r.width < T || r.height < T || (r.left >= -T && r.top >= -T && r.right <= vw + T && r.bottom <= vh + T)) continue;
      if (node.closest('.cinema, [data-bleed]')) continue;
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      let clipped = false;
      for (let e = node.parentElement; e && e.id !== 'root'; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (/hidden|auto|scroll|clip/.test(s.overflowX + s.overflowY)) {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      const name = `${node.tagName.toLowerCase()}${node.classList.length ? '.' + [...node.classList].slice(0, 2).join('.') : ''}`;
      out.push(`${name} ${Math.round(r.width)} × ${Math.round(r.height)} en ${Math.round(r.left)}, ${Math.round(r.top)}`);
    }
    if (out.length) window.cyber?.jukebox?.({ type: 'overflow', text: `${where}, fenêtre ${vw} × ${vh} (devicePixelRatio ${devicePixelRatio}) : ${out.join(' ; ')}` }); // i18n-ignore : journal
  }

  let checked;

  /** Une fois par ouverture du Juke-box ou de sa gestion (la phase change), après le rendu. */
  function checkOnce(s) {
    const key = s.phase === 'jukebox' || s.phase === 'library' ? s.phase : undefined;
    if (key === checked) return;
    checked = key;
    if (key) requestAnimationFrame(() => requestAnimationFrame(() => overflowCheck(key === 'jukebox' ? 'Juke-box' : 'Menu système ou gestion'))); // i18n-ignore : journal
  }

  /** Mode Juke-box quitté : la lecture s'arrête, les zones gardées sont oubliées. */
  function leave() {
    stopMedia();
    if (clip) {
      clip.order = undefined;
      clip.node.remove();
    }
    clip = undefined;
    cab = undefined;
    desk = undefined;
    lastTime = undefined;
    stillKey = undefined;
    document.documentElement.classList.remove('jukebox-desk');
  }

  window.CyberJukebox = {
    playfield,
    checkOnce,
    background,
    wheelPoster,
    backglassPoster,
    zone,
    logo,
    leave,
    /** Le clip de cette fenêtre joue-t-il ? (fenêtres annexes : rien à arrêter quand l'état n'en parle plus) */
    playing: () => Boolean(clip?.order),
    status: () => ({
      clip: clip ? { place: clip.node.dataset.place, ordre: clip.order?.id, source: clip.order?.kind, video: Boolean(clip.media?.video), son: Boolean(clip.media?.audio), pause: Boolean(clip.order?.paused), cartel: Boolean(clip.over.querySelector('.jb-card')), niveaux: clip.media?.levels?.length ?? 0 } : undefined,
      temps: lastTime,
    }),
  };
})();
