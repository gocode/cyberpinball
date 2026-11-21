// Affiche du médaillon Arène (21/11/2026, planche « Engagement » validée) : quand le médaillon est
// choisi dans la roue, derrière la roue sur le playfield (tout le plateau en borne, le cadre 9:16 au
// bureau) et à la place du média du fronton, comme celles du Juke-box et de la Communauté. De haut en
// bas : le médaillon vivant « Coupe » (medaillons-vivants.js), le titre, la jauge du niveau (et en
// hachures ce qu'une partie peut encore rapporter), un tableau des records à points dans la police du
// DMD (police-points.js) dont les pages tournent toutes les six secondes, la plus pressante d'abord,
// puis qui joue en ce moment et quelques puces. Le processus principal choisit et traduit tout
// (arena-menu.ts, poster) ; ici, on dessine. Styles : arena.css (classes ar-*).
'use strict';

(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /** Une page tourne toutes les six secondes (arena.ts, ARENA_PAGE_MS). */
  const PAGE_MS = 6000;

  // ---------- Le tableau à points ----------

  /** Colonnes et lignes de points : cinq lignes de la petite police, une marge de deux points tout autour (la lueur n'est jamais coupée). */
  const COLS = 128;
  const ROWS = 48;
  const PITCH = 8;

  const plain = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  const glyphOf = (font, ch) => font.glyphs[ch] ?? font.glyphs[ch.toUpperCase()] ?? font.glyphs[' '];
  function widthOf(font, s) {
    let w = 0;
    for (const ch of s) w += glyphOf(font, ch)[0].length + font.spacing;
    return Math.max(0, w - font.spacing);
  }
  /** Le texte raccourci jusqu'à tenir dans `max` points (un point final dit qu'il est coupé). */
  function fit(font, s, max) {
    if (widthOf(font, s) <= max) return s;
    let cut = s;
    while (cut.length > 1 && widthOf(font, `${cut}.`) > max) cut = cut.slice(0, -1).trimEnd();
    return `${cut}.`;
  }

  /** Les points allumés d'une page : 2 plein, 1 à moitié (l'intitulé, ma ligne), 0 éteint. */
  function dotsOf(page) {
    const font = typeof CYBER_POINTS !== 'undefined' ? CYBER_POINTS.petit : undefined;
    const grid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    if (!font) return grid;
    const lh = font.height + 2;
    const lines = page.lines.slice(0, 5);
    const top = Math.max(2, Math.floor((ROWS - lines.length * lh + 2) / 2));
    lines.forEach((line, li) => {
      const y0 = top + li * lh;
      // Deux cellules (le nom à gauche, le score à droite) : le nom cède la place au score.
      const right = line.cells.find((c) => c.align === 'right');
      const rightText = right ? plain(right.text) : '';
      const rightWidth = right ? widthOf(font, rightText) : 0;
      for (const cell of line.cells) {
        const room = cell.align === 'right' || cell.align === 'center' || !right ? COLS - 4 : COLS - 4 - rightWidth - 6;
        const s = cell === right ? rightText : fit(font, plain(cell.text), room);
        const w = widthOf(font, s);
        let x = cell.align === 'right' ? COLS - 2 - w : cell.align === 'center' ? Math.floor((COLS - w) / 2) : 2;
        for (const ch of s) {
          const g = glyphOf(font, ch);
          g.forEach((r, gy) => {
            for (let gx = 0; gx < r.length; gx++) if (r[gx] === '#' && grid[y0 + gy] && x + gx >= 0 && x + gx < COLS) grid[y0 + gy][x + gx] = line.dim ? 1 : 2;
          });
          x += g[0].length + font.spacing;
        }
      }
    });
    return grid;
  }

  function paintBoard(cv, page) {
    const c = cv.getContext?.('2d');
    if (!c) return;
    const grid = dotsOf(page);
    c.fillStyle = '#010302';
    c.fillRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const v = grid[y][x];
        c.beginPath();
        c.arc(x * PITCH + PITCH / 2, y * PITCH + PITCH / 2, PITCH * 0.38, 0, Math.PI * 2);
        c.shadowBlur = v === 2 ? 6 : 0;
        c.shadowColor = 'rgba(139,226,58,.8)';
        c.fillStyle = v === 2 ? '#9cf04a' : v === 1 ? '#3f6e1c' : '#0b1a0c';
        c.fill();
      }
  }

  /** Les tableaux affichés : tous tournent ensemble, au même rythme (une affiche refaite garde la page). */
  const boards = new Set();
  let turn = 0;
  let timer;

  function showPage(b) {
    const at = b.pages.length ? turn % b.pages.length : 0;
    if (b.shown === at && b.drawn) return;
    b.shown = at;
    b.drawn = true;
    const page = b.pages[at];
    paintBoard(b.canvas, page);
    b.foot.textContent = page.foot;
    b.dots.forEach((d, i) => d.classList.toggle('ar-on', i === at));
  }

  function tick() {
    for (const b of boards) if (!b.canvas.isConnected) boards.delete(b);
    if (!boards.size) {
      clearInterval(timer);
      timer = undefined;
      return;
    }
    if (document.hidden) return;
    turn++;
    for (const b of boards) showPage(b);
  }

  function board(pages) {
    const box = el('div', 'ar-dmd');
    const frame = el('div', 'ar-dmd-frame');
    const canvas = el('canvas', 'ar-dmd-dots');
    canvas.width = COLS * PITCH;
    canvas.height = ROWS * PITCH;
    canvas.setAttribute('aria-hidden', 'true');
    frame.append(canvas);
    const foot = el('div', 'ar-dmd-foot');
    const text = el('span', 'ar-dmd-text');
    const dotsBox = el('span', 'ar-dots');
    const dots = pages.map(() => dotsBox.appendChild(el('i')));
    foot.append(text, dotsBox);
    box.append(frame, foot);
    const b = { canvas, foot: text, dots, pages, shown: -1, drawn: false };
    boards.add(b);
    showPage(b);
    if (!timer) timer = setInterval(tick, PAGE_MS);
    box.arBoard = b;
    return box;
  }

  // ---------- L'affiche ----------

  /** La barre du niveau : l'acquis, et en hachures ce qu'une partie peut encore rapporter. */
  function xpBar(progress, reach) {
    const bar = el('div', 'ar-xpbar');
    const got = el('span', 'ar-xp-got');
    const pct = Math.max(0, Math.min(1, progress)) * 100;
    got.style.width = `${pct}%`;
    bar.append(got);
    if (reach > 0) {
      const may = el('span', 'ar-xp-may');
      may.style.left = `${pct}%`;
      may.style.width = `${Math.max(0, Math.min(1 - pct / 100, reach)) * 100}%`;
      bar.append(may);
    }
    return bar;
  }

  function emblem() {
    const box = el('div', 'ar-emblem');
    box.setAttribute('aria-hidden', 'true');
    if (window.CyberMedaillons) box.append(CyberMedaillons.medallion('arene', 'ar-logo'));
    else {
      const img = el('img', 'ar-logo');
      img.src = 'medaillons/arene.png';
      img.alt = '';
      box.append(img);
    }
    return box;
  }

  const posters = new Map();

  function poster(p, className, foot) {
    const key = JSON.stringify([className, foot, p]);
    const known = posters.get(key);
    if (known) {
      window.CyberMedaillons?.revive(known);
      for (const b of known.arBoards ?? []) {
        boards.add(b);
        b.drawn = false;
        showPage(b);
      }
      if (known.arBoards?.length && !timer) timer = setInterval(tick, PAGE_MS);
      return known;
    }
    const box = el('section', `jb-poster ar-poster ${className}`.trim());
    const stage = el('div', 'ar-stage');
    const titles = el('div', 'ar-titles');
    titles.append(el('h1', 'ar-title', p.title), el('p', 'ar-tag', p.tagline));
    const level = el('div', `ar-level tier-tint-${p.level.tier}`);
    level.append(el('span', 'ar-level-chip', p.level.chip), xpBar(p.level.progress, p.level.reach), el('span', 'ar-level-after', p.level.after));
    stage.append(emblem(), titles, level);
    const made = [];
    if (p.pages.length) {
      const b = board(p.pages);
      stage.append(b);
      made.push(b.arBoard);
    }
    if (p.live) {
      const live = el('div', 'ar-live');
      const stack = el('span', 'ar-stack');
      for (const a of p.live.avatars) stack.append(typeof avatarNode === 'function' ? avatarNode(a, 'ar-face') : el('span', 'avatar ar-face'));
      live.append(el('span', 'ar-pulse'), stack, el('span', 'ar-live-text', p.live.text));
      stage.append(live);
    }
    if (p.chips.length) {
      const chips = el('div', 'ar-chips');
      for (const c of p.chips) {
        const chip = el('span', `ar-chip${c.hot ? ' ar-hot' : ''}`);
        chip.append(typeof cyberIcon === 'function' ? cyberIcon(c.icon, 'ar-chip-icon') : el('span'), el('span', '', c.text));
        chips.append(chip);
      }
      stage.append(chips);
    }
    box.append(stage);
    box.arBoards = made;
    posters.set(key, box);
    if (posters.size > 8) posters.delete(posters.keys().next().value);
    return box;
  }

  // ---------- Le fronton ----------

  /** Les nombres en gras, comme la ligne des chiffres des autres affiches (community.js). */
  function statsLine(text) {
    const node = el('p', 'jb-poster-stats');
    let at = 0;
    for (const m of String(text).matchAll(/\d+/g)) {
      if (m.index > at) node.append(document.createTextNode(text.slice(at, m.index)));
      node.append(el('strong', '', m[0]));
      at = m.index + m[0].length;
    }
    if (at < text.length) node.append(document.createTextNode(text.slice(at)));
    return node;
  }

  /**
   * Au fronton (et dans son cadre au bureau, au-dessus de la roue) : la mise en page des affiches du
   * Juke-box et de la Communauté (jukebox.css, .jb-poster) : la marque, le niveau, le grand titre, ce
   * qu'il manque, puis la page la plus pressante en une phrase ; le médaillon à droite.
   */
  function frontonPoster(p, className, foot) {
    const key = JSON.stringify(['fronton', className, foot, p]);
    const known = posters.get(key);
    if (known) {
      window.CyberMedaillons?.revive(known);
      return known;
    }
    const box = el('section', `jb-poster ar-fronton-poster ${className}`.trim()); // i18n-ignore : classes CSS
    const stage = el('div', 'jb-poster-stage');
    const head = el('header', 'jb-poster-head');
    const brand = el('div', 'jb-brand', 'CYBER ');
    brand.append(el('b', '', 'PINBALL'));
    head.append(brand, el('span', 'jb-poster-edition', p.tagline));
    const copy = el('div', 'jb-poster-copy');
    const heading = el('h2', 'jb-poster-heading', p.headline.heading);
    heading.title = p.headline.heading;
    const level = `jb-label ar-fronton-level tier-tint-${p.level.tier}`; // i18n-ignore : classes CSS
    copy.append(el('p', level, p.level.chip), el('h1', 'jb-poster-title', p.title), statsLine(p.level.after), el('div', 'jb-poster-rule'), el('p', 'jb-eyebrow', p.headline.eyebrow), heading);
    const emblem = el('div', 'jb-emblem cm-emblem');
    emblem.setAttribute('aria-hidden', 'true');
    if (window.CyberMedaillons) emblem.append(el('div', 'jb-emblem-halo'), CyberMedaillons.medallion('arene', 'jb-logo'));
    else {
      const img = el('img', 'jb-logo');
      img.src = 'medaillons/arene.png';
      img.alt = '';
      emblem.append(el('div', 'jb-emblem-halo'), img);
    }
    stage.append(head, copy, emblem);
    if (foot) {
      const end = el('footer', 'jb-poster-foot');
      const go = el('span', 'jb-poster-go');
      go.append(el('span', 'jb-keycap', p.start), document.createTextNode(p.open));
      end.append(el('span', '', p.tagline), go);
      stage.append(end);
    }
    box.append(stage);
    posters.set(key, box);
    if (posters.size > 8) posters.delete(posters.keys().next().value);
    return box;
  }

  const of = (s) => s.arena;

  /** Derrière la roue (borne) ou dans le cadre du plateau (bureau). */
  function wheelPoster(s, isDesk) {
    return poster(of(s).poster, isDesk ? 'jb-wheel-poster ar-wheel ar-desk desk' : 'jb-wheel-poster ar-wheel', false);
  }

  /** Dans le cadre du fronton du menu au bureau. */
  function backglassPoster(s) {
    return frontonPoster(of(s).poster, 'jb-wheel-fronton', false);
  }

  /** Le fronton de la borne : l'affiche à la place du média, tant que le médaillon est choisi. */
  const zoneNodes = new Map();
  function zone(node, part, s) {
    const content = part === 'backglass' && of(s)?.poster ? frontonPoster(of(s).poster, 'jb-fronton-poster', true) : undefined;
    const old = zoneNodes.get(node);
    if (!content) {
      if (old) {
        old.remove();
        zoneNodes.delete(node);
      }
      return false;
    }
    let wrap = old;
    if (!wrap) {
      wrap = el('div', 'jb-zone-fill');
      node.append(wrap);
      zoneNodes.set(node, wrap);
    }
    if (wrap.firstChild !== content) wrap.replaceChildren(content);
    return true;
  }

  window.CyberArena = { wheelPoster, backglassPoster, zone, PAGE_MS };
})();
