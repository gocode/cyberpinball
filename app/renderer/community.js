// Affiche du médaillon Communauté (13/11/2026) : quand le médaillon est choisi dans la roue, comme
// celle du Juke-box (jukebox.js), derrière la roue sur le playfield (tout le plateau en borne, le
// cadre 9:16 au bureau) et à la place du média du fronton. Même mise en page que l'affiche du
// Juke-box (ses classes jb-poster…) : la marque, le grand titre, les chiffres (joueurs en ligne, de
// mon pays, amis), le salon de mon pays et sa dernière ligne, les amis en ligne, le médaillon vivant
// « Montée » (medaillons-vivants.js) ; en pied du fronton, « Start · Ouvrir la Communauté ».
// Le processus principal choisit et traduit tout (frontend.ts, communityPoster) ; ici, on dessine.
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

  /** Le médaillon vivant « Montée » dans son halo ; l'image fixe faute de canevas. */
  function emblem() {
    const box = el('div', 'jb-emblem cm-emblem');
    box.setAttribute('aria-hidden', 'true');
    if (window.CyberMedaillons) box.append(el('div', 'jb-emblem-halo'), CyberMedaillons.medallion('communaute', 'jb-logo'));
    else {
      const img = el('img', 'jb-logo');
      img.src = 'medaillons/communaute.png';
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
    return poster(s.community.poster, isDesk ? 'jb-wheel-poster desk' : 'jb-wheel-poster', false);
  }

  /** Dans le cadre du fronton du menu au bureau. */
  function backglassPoster(s) {
    return poster(s.community.poster, 'jb-wheel-fronton', true);
  }

  /** Le fronton de la borne : l'affiche à la place du média, tant que le médaillon est choisi. */
  const zoneNodes = new Map();
  function zone(node, part, s) {
    const content = part === 'backglass' && s.community?.poster ? poster(s.community.poster, 'jb-fronton-poster', true) : undefined;
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

  window.CyberCommunity = { wheelPoster, backglassPoster, zone };
})();
