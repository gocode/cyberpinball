// Affiche du médaillon Arène : quand le médaillon est choisi dans la roue, derrière la roue sur le
// playfield (tout le plateau en borne, le cadre 9:16 au bureau) et à la place du média du fronton,
// comme celles du Juke-box et de la Communauté. Dessin retenu par le mainteneur le 21/11/2026 parmi
// trois propositions (« Le B, c'est parfait ») : en tête, le médaillon vivant « Coupe »
// (medaillons-vivants.js) et le titre ; puis le podium de la table qui pique (le joueur au-dessus du
// rival, le rival en ambre, moi en vert, le joueur en dessous) et ce qu'il manque pour monter ; puis
// trois cases (niveau et sa barre, Monde, pays) ; puis qui joue en ce moment. Le tableau des records à
// points est sur le vrai DMD (livedmd.ts, arenaDmdPages). Le processus principal choisit et traduit tout
// (arena-menu.ts, poster) ; ici, on dessine. Styles : arena.css (classes ar-*).
'use strict';

(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const face = (a, className) => (typeof avatarNode === 'function' ? avatarNode(a, className) : el('span', `avatar ${className}`));

  /** « Niv. 18 » à la teinte du palier, à côté d'un nom. */
  function levelChip(level) {
    return el('span', `ar-lv tier-tint-${level.tier}`, level.text);
  }

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

  /** Le podium : la table, l'intitulé (ambre quand ma place vient d'être prise), les lignes, ce qu'il manque. */
  function podium(p) {
    const box = el('div', 'ar-board');
    const head = el('div', 'ar-board-head');
    head.append(el('span', 'ar-board-table', p.table), el('em', p.warn ? 'ar-board-why ar-warn' : 'ar-board-why', p.eyebrow));
    box.append(head);
    // Une grille commune : rang, pastille, nom et niveau, score alignés d'une ligne à l'autre.
    const rows = el('div', 'ar-rows');
    for (const r of p.rows) {
      const row = el('div', `ar-row${r.me ? ' ar-me' : ''}${r.rival ? ' ar-rival' : ''}`);
      const who = el('span', 'ar-who');
      who.append(el('span', 'ar-who-name', r.name));
      if (r.level) who.append(levelChip(r.level));
      row.append(el('span', 'ar-rank', r.rank), face(r.avatar, 'ar-row-face'), who, el('span', 'ar-score', r.score));
      rows.append(row);
    }
    box.append(rows);
    const climb = el('div', 'ar-climb');
    climb.append(el('span', '', p.climb.label), el('strong', '', p.climb.gap));
    box.append(climb);
    return box;
  }

  /** Les cases : le niveau (sa barre), Monde, pays ; une grille commune, intitulé, valeur et détail alignés. */
  function tiles(list) {
    const box = el('div', 'ar-tiles');
    box.style.setProperty('--tiles', String(list.length));
    for (const t of list) {
      const tile = el('div', `ar-tile${t.level ? ` ar-tile-level tier-tint-${t.level.tier}` : ''}`);
      const label = el('small', 'ar-tile-label');
      if (t.flag && typeof flagNode === 'function') label.append(flagNode(t.flag.code, t.flag.src, t.flag.name, 'ar-tile-flag'));
      label.append(el('span', '', t.label));
      tile.append(label, el('strong', 'ar-tile-value', t.value));
      if (t.level) tile.append(xpBar(t.level.progress, t.level.reach));
      tile.append(el('span', 'ar-tile-detail', t.detail));
      box.append(tile);
    }
    return box;
  }

  const posters = new Map();

  function poster(p, className) {
    const key = JSON.stringify([className, p]);
    const known = posters.get(key);
    if (known) {
      window.CyberMedaillons?.revive(known);
      return known;
    }
    const box = el('section', `jb-poster ar-poster ${className}`.trim());
    const stage = el('div', 'ar-stage');
    const head = el('header', 'ar-head');
    const titles = el('div', 'ar-titles');
    titles.append(el('h1', 'ar-title', p.title), el('p', 'ar-tag', p.tagline));
    head.append(emblem(), titles);
    stage.append(head);
    if (p.podium) stage.append(podium(p.podium));
    stage.append(tiles(p.tiles));
    if (p.live) {
      const live = el('div', 'ar-live');
      const stack = el('span', 'ar-stack');
      for (const a of p.live.avatars) stack.append(face(a, 'ar-face'));
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
    const mark = el('div', 'jb-emblem cm-emblem');
    mark.setAttribute('aria-hidden', 'true');
    if (window.CyberMedaillons) mark.append(el('div', 'jb-emblem-halo'), CyberMedaillons.medallion('arene', 'jb-logo'));
    else {
      const img = el('img', 'jb-logo');
      img.src = 'medaillons/arene.png';
      img.alt = '';
      mark.append(el('div', 'jb-emblem-halo'), img);
    }
    stage.append(head, copy, mark);
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
    return poster(of(s).poster, isDesk ? 'jb-wheel-poster ar-wheel ar-desk desk' : 'jb-wheel-poster ar-wheel');
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

  window.CyberArena = { wheelPoster, backglassPoster, zone };
})();
