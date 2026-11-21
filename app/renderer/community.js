// Affiche du médaillon Communauté (13/11/2026) : quand le médaillon est choisi dans la roue, comme
// celle du Juke-box (jukebox.js), derrière la roue sur le playfield (tout le plateau en borne, le
// cadre 9:16 au bureau) et à la place du média du fronton. Même mise en page que l'affiche du
// Juke-box (ses classes jb-poster…) : la marque, le grand titre, les chiffres (joueurs en ligne, de
// mon pays, amis), le salon de mon pays et sa dernière ligne, les amis en ligne, le médaillon vivant
// « Montée » (medaillons-vivants.js) ; en pied du fronton, « Start · Ouvrir la Communauté ».
// Depuis le 21/11/2026, le plateau a sa propre affiche (communityWheelPoster, community.css) ; le fronton garde celle-ci.
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

  // ---------- L'affiche de la Communauté sur le plateau (21/11/2026) ----------
  // D'après la planche « Engagement » validée : le médaillon, le titre, le message qui m'attend (qui m'a
  // écrit, sa bulle), mes amis en ligne (l'anneau de leur palier, celui de leur présence autour, ce
  // qu'ils font ; des joueurs suggérés quand personne n'est là), le salon de mon pays dont les lignes
  // défilent, puis les puces (groupes, demandes d'ami). Styles : community.css (classes co-*).

  const face = (a, className) => (typeof avatarNode === 'function' ? avatarNode(a, className) : el('span', `avatar ${className}`));
  const icon = (name, className) => (typeof cyberIcon === 'function' ? cyberIcon(name, className) : el('span', className));

  function said(m) {
    const box = el('div', 'co-said');
    if (m.avatar) box.append(face(m.avatar, 'co-said-face'));
    else {
      const ic = el('span', 'co-said-ic');
      ic.append(icon(m.icon || 'message', 'co-said-icon'));
      box.append(ic);
    }
    const head = el('p', 'co-said-head', `${m.name} · ${m.when}`);
    const bubble = el('p', `co-bubble${m.group ? ' co-bubble-group' : ''}`);
    const text = el('span', 'co-bubble-text');
    if (m.who) text.append(el('b', 'co-bubble-who', `<${m.who}> `));
    text.append(document.createTextNode(m.text));
    bubble.append(text);
    bubble.title = m.text;
    box.append(head, bubble);
    return box;
  }

  function person(p) {
    const box = el('div', 'co-person');
    box.append(face(p.avatar, `co-face co-ring-${p.ring}`));
    const name = el('p', 'co-person-name');
    name.append(el('b', '', p.name));
    if (p.level) name.append(el('span', `co-lv tier-tint-${p.level.tier}`, p.level.text));
    box.append(name, el('p', `co-person-status${p.ring === 'playing' ? ' co-go' : ''}`, p.status));
    return box;
  }

  /** Le salon : son nom (et le drapeau), ses présents, ses lignes qui défilent vers le haut, en boucle. */
  function room(r) {
    const box = el('div', 'co-room');
    const head = el('div', 'co-room-head');
    const name = el('span', 'co-room-name');
    if (r.flag && typeof flagNode === 'function') name.append(flagNode(r.flag.code, r.flag.src, r.flag.name, 'co-room-flag'));
    name.append(document.createTextNode(r.name));
    head.append(name);
    if (r.present) head.append(el('span', '', r.present));
    box.append(head);
    if (r.problem || r.quiet || !r.lines.length) {
      box.append(el('p', 'co-room-quiet', r.problem || r.quiet || ''));
      return box;
    }
    const view = el('div', 'co-room-view');
    const track = el('div', 'co-room-track');
    const line = (l) => {
      const row = el('div', 'co-line');
      const nick = el('span', 'co-nick', `<${l.nick}>`);
      nick.style.setProperty('--nick-hue', String(Number(l.hue) || 0));
      row.append(el('time', '', l.time), nick, el('span', 'co-line-text', l.text));
      return row;
    };
    for (const l of r.lines) track.append(line(l));
    // Plus de lignes que la fenêtre n'en montre : elles défilent, la liste répétée pour boucler sans saut.
    if (r.lines.length > 2) {
      for (const l of r.lines) track.append(line(l));
      track.classList.add('co-scrolling');
      track.style.setProperty('--lines', String(r.lines.length));
    }
    view.append(track);
    box.append(view);
    return box;
  }

  function emblem() {
    const box = el('div', 'co-emblem');
    box.setAttribute('aria-hidden', 'true');
    if (window.CyberMedaillons) box.append(CyberMedaillons.medallion('communaute', 'co-logo'));
    else {
      const img = el('img', 'co-logo');
      img.src = 'medaillons/communaute.png';
      img.alt = '';
      box.append(img);
    }
    return box;
  }

  const wheelPosters = new Map();
  function communityWheelPoster(s, isDesk) {
    const p = s.community.poster;
    const className = isDesk ? 'jb-wheel-poster co-wheel co-desk desk' : 'jb-wheel-poster co-wheel'; // i18n-ignore : classes CSS
    const key = JSON.stringify([className, p]);
    const known = wheelPosters.get(key);
    if (known) {
      window.CyberMedaillons?.revive(known);
      return known;
    }
    const box = el('section', `jb-poster co-poster ${className}`);
    const stage = el('div', 'co-stage');
    const titles = el('div', 'co-titles');
    titles.append(el('h1', 'co-title', p.title), el('p', 'co-tag', p.tagline));
    stage.append(emblem(), titles);
    if (p.empty) {
      const empty = el('div', 'co-empty');
      empty.append(el('b', '', p.heading), el('span', '', p.detail || ''));
      stage.append(empty);
    } else {
      if (p.said) stage.append(said(p.said));
      if (p.people?.length) {
        const people = el('div', 'co-people');
        people.style.setProperty('--people', String(p.people.length));
        for (const x of p.people) people.append(person(x));
        stage.append(people);
      }
      if (p.room) stage.append(room(p.room));
      if (p.chips?.length) {
        const chips = el('div', 'co-chips');
        for (const c of p.chips) {
          const chip = el('span', `co-chip${c.hot ? ' co-hot' : ''}`);
          chip.append(icon(c.icon, 'co-chip-icon'), el('span', '', c.text));
          chips.append(chip);
        }
        stage.append(chips);
      }
    }
    box.append(stage);
    wheelPosters.set(key, box);
    if (wheelPosters.size > 8) wheelPosters.delete(wheelPosters.keys().next().value);
    return box;
  }

  const community = kit('communaute', (s) => s.community);
  // Le fronton garde la mise en page des affiches du Juke-box ; le plateau a la sienne.
  window.CyberCommunity = { ...community, wheelPoster: communityWheelPoster };
  window.CyberCollections = kit('collections', (s) => s.collectionsMedallion);
})();
