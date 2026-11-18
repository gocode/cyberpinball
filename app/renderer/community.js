// Affiche du médaillon Communauté (13/11/2026) : quand le médaillon est choisi dans la roue, comme
// celle du Juke-box (jukebox.js), derrière la roue sur le playfield (tout le plateau en borne, le
// cadre 9:16 au bureau) et à la place du média du fronton. Même mise en page que l'affiche du
// Juke-box (ses classes jb-poster…) : la marque, le grand titre, les chiffres (joueurs en ligne, de
// mon pays, amis), le salon de mon pays et sa dernière ligne, les amis en ligne, le médaillon vivant
// « Montée » (medaillons-vivants.js) ; en pied du fronton, « Start · Ouvrir la Communauté ».
// Sur le plateau seulement (18/11/2026) : mon niveau, ma place mondiale et nationale (jukebox.css, classes cm-*).
// Le processus principal choisit et traduit tout (frontend.ts, communityPoster) ; ici, on dessine.
// Le médaillon Collections (13/11/2026) a la même affiche, son médaillon « Carrousel » à la place
// (s.collectionsMedallion.poster, collections-menu.ts : collectionsPoster) : window.CyberCollections.
'use strict';

(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function brand() {
    const node = el('div', 'jb-brand', 'CYBER ');
    node.append(el('b', '', 'PINBALL'));
    return node;
  }

  /** Les nombres de la ligne des chiffres en gras, comme sur l'affiche du Juke-box. */
  function statsLine(text, className = 'jb-poster-stats') {
    const node = el('p', className);
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
   * Mon niveau et mes places (18/11/2026) : trois cases en grille commune (intitulé, valeur, détail
   * alignés d'une case à l'autre), la barre du niveau sous sa valeur, la semaine en une ligne dessous.
   * Montrées sur le plateau seulement (jukebox.css : .cm-standing).
   */
  function standingNode(st) {
    const box = el('div', 'cm-standing');
    const grid = el('div', 'cm-standing-tiles');
    grid.style.setProperty('--tiles', String(st.tiles.length));
    for (const tile of st.tiles) {
      const cell = el('div', `cm-tile${tile.quiet ? ' cm-quiet' : ''}`);
      const label = el('p', 'cm-tile-label');
      if (tile.flag && typeof flagNode === 'function') label.append(flagNode(tile.flag.code, tile.flag.src, tile.flag.name, 'cm-tile-flag'));
      label.append(el('span', '', tile.label));
      const bar = el('div', 'cm-tile-bar');
      if (tile.progress !== undefined) {
        const fill = el('span');
        fill.style.width = `${Math.round(Math.min(1, Math.max(0, tile.progress)) * 100)}%`;
        bar.append(fill);
      } else bar.classList.add('cm-none');
      cell.append(label, el('p', 'cm-tile-value', tile.value), bar, el('p', 'cm-tile-detail', tile.detail));
      grid.append(cell);
    }
    box.append(grid);
    if (st.week) box.append(statsLine(st.week, 'cm-standing-week'));
    return box;
  }

  /** L'affiche d'un médaillon : `kind`, son dessin (medaillons-vivants.js) ; `of(s)`, sa vue dans l'état. */
  function kit(kind, of) {
    /** Le médaillon vivant dans son halo ; l'image fixe faute de canevas. */
    function emblem() {
      const box = el('div', 'jb-emblem cm-emblem');
      box.setAttribute('aria-hidden', 'true');
      if (window.CyberMedaillons) box.append(el('div', 'jb-emblem-halo'), CyberMedaillons.medallion(kind, 'jb-logo'));
      else {
        const img = el('img', 'jb-logo');
        img.src = `medaillons/${kind}.png`;
        img.alt = '';
        box.append(el('div', 'jb-emblem-halo'), img);
      }
      return box;
    }

    /** Affiches déjà construites : la même reste le même nœud, son médaillon ne repart pas à chaque état. */
    const posters = new Map();

    function poster(p, className, hint) {
      const key = JSON.stringify([className, hint, p]);
      const known = posters.get(key);
      if (known) {
        window.CyberMedaillons?.revive(known);
        return known;
      }
      const box = el('section', `jb-poster cm-poster ${className}`.trim());
      box.classList.toggle('jb-poster-empty', Boolean(p.empty));
      const stage = el('div', 'jb-poster-stage');
      const head = el('header', 'jb-poster-head');
      head.append(brand(), el('span', 'jb-poster-edition', p.edition));
      const copy = el('div', 'jb-poster-copy');
      copy.append(el('p', 'jb-label', p.label), el('h1', 'jb-poster-title', p.title), statsLine(p.stats), el('div', 'jb-poster-rule'), el('p', 'jb-eyebrow', p.eyebrow));
      const heading = el('h2', 'jb-poster-heading', p.heading);
      heading.title = p.heading;
      copy.append(heading);
      if (p.detail) {
        const detail = el('p', 'jb-muted jb-poster-detail jb-ellipsis', p.detail);
        detail.title = p.detail;
        copy.append(detail);
      }
      if (p.standing?.tiles?.length) {
        box.classList.add('cm-has-standing');
        copy.append(standingNode(p.standing));
      }
      stage.append(head, copy, emblem());
      if (hint) {
        const foot = el('footer', 'jb-poster-foot');
        const go = el('span', 'jb-poster-go');
        go.append(el('span', 'jb-keycap', p.start), document.createTextNode(p.open));
        foot.append(el('span', '', p.tagline), go);
        stage.append(foot);
      }
      box.append(stage);
      posters.set(key, box);
      if (posters.size > 8) posters.delete(posters.keys().next().value);
      return box;
    }

    /** Derrière la roue (borne) ou dans le cadre du plateau (bureau). */
    function wheelPoster(s, isDesk) {
      return poster(of(s).poster, isDesk ? 'jb-wheel-poster desk' : 'jb-wheel-poster', false);
    }

    /** Dans le cadre du fronton du menu au bureau. */
    function backglassPoster(s) {
      return poster(of(s).poster, 'jb-wheel-fronton', true);
    }

    /** Le fronton de la borne : l'affiche à la place du média, tant que le médaillon est choisi. */
    const zoneNodes = new Map();
    function zone(node, part, s) {
      const content = part === 'backglass' && of(s)?.poster ? poster(of(s).poster, 'jb-fronton-poster', true) : undefined;
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

    return { wheelPoster, backglassPoster, zone };
  }

  window.CyberCommunity = kit('communaute', (s) => s.community);
  window.CyberCollections = kit('collections', (s) => s.collectionsMedallion);
})();
