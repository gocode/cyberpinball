// Écran à onglets et à cartes (21/11/2026, app/src/hub-screen.ts) : l'écran de l'Arène, conçu pour que
// la Communauté le reprenne. Il prend tout l'écran du menu (la marque est ajoutée en tête par
// frontend.js) : le médaillon vivant, le grand titre et ses chiffres, la bande du niveau, la barre
// d'onglets à icônes (l'onglet ouvert plein en vert, une pastille rouge sur ce qui attend, un onglet
// pas encore disponible grisé avec sa raison), puis les sections de cartes, et les commandes en pied.
// Les onglets, les cartes et les boutons des cartes sont les actions de l'écran : la carte choisie
// s'éclaire, un clic la valide (actOn, library.js). Styles : hub.css (classes hub-*).
'use strict';

(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const icon = (name, className) => (typeof cyberIcon === 'function' ? cyberIcon(name, className) : el('span', className));
  const face = (a, className) => (typeof avatarNode === 'function' ? avatarNode(a, className) : el('span', `avatar ${className}`));
  const act = (node, index) => (typeof actOn === 'function' ? actOn(node, { type: 'activate', index }) : node);

  /** Les nombres en gras, comme la ligne des chiffres des affiches. */
  function strongNumbers(text, className) {
    const node = el('span', className);
    let at = 0;
    for (const m of String(text).matchAll(/[+−-]?\d[\d\s  .,]*/g)) {
      if (m.index > at) node.append(document.createTextNode(text.slice(at, m.index)));
      node.append(el('b', '', m[0].trimEnd()));
      at = m.index + m[0].trimEnd().length;
    }
    if (at < text.length) node.append(document.createTextNode(text.slice(at)));
    return node;
  }

  /** Le médaillon vivant de l'en-tête : le même nœud d'un rendu à l'autre, son animation ne repart pas. */
  const medals = new Map();
  function medal(kind) {
    let node = medals.get(kind);
    if (!node) {
      if (window.CyberMedaillons) node = CyberMedaillons.medallion(kind, 'hub-logo');
      else {
        node = el('img', 'hub-logo');
        node.src = `medaillons/${kind}.png`;
        node.alt = '';
      }
      medals.set(kind, node);
    }
    window.CyberMedaillons?.revive(node);
    return node;
  }

  function levelChip(level) {
    return el('span', `hub-lv tier-tint-${level.tier}`, level.text);
  }

  /**
   * La barre du niveau : l'acquis, et en hachures ce qu'une partie peut encore rapporter ; au retour
   * d'une partie, la part qu'elle vient d'ajouter en clair au bout de l'acquis.
   */
  function xpBar(progress, reach, fresh) {
    const bar = el('div', 'hub-xpbar');
    const pct = Math.max(0, Math.min(1, progress)) * 100;
    const got = el('span', 'hub-xp-got');
    got.style.width = `${pct}%`;
    bar.append(got);
    if (fresh > 0) {
      const part = Math.min(pct, fresh * 100);
      const now = el('span', 'hub-xp-fresh');
      now.style.left = `${pct - part}%`;
      now.style.width = `${part}%`;
      bar.append(now);
    }
    if (reach > 0) {
      const may = el('span', 'hub-xp-may');
      may.style.left = `${pct}%`;
      may.style.width = `${Math.max(0, Math.min(100 - pct, reach * 100))}%`;
      bar.append(may);
    }
    return bar;
  }

  function band(b) {
    const box = el('div', `hub-band tier-tint-${b.tier}`);
    const n = el('div', 'hub-band-n');
    n.append(el('small', '', b.short), el('strong', '', String(b.level)));
    const top = el('div', 'hub-band-top');
    const missing = el('span', 'hub-band-missing');
    missing.append(el('b', '', b.missing.strong), document.createTextNode(` ${b.missing.rest}`));
    top.append(el('b', 'hub-band-tier', b.tierLabel), missing);
    const bottom = el('div', 'hub-band-lines');
    b.lines.forEach((line, i) => bottom.append(el('span', i ? 'more' : '', line)));
    box.append(n, top, xpBar(b.progress, b.reach, b.fresh), bottom);
    return box;
  }

  function tabs(list, cursor) {
    const bar = el('nav', 'hub-tabs');
    for (const tab of list) {
      const node = el('div', `hub-tab${tab.current ? ' hub-on' : ''}${tab.disabled ? ' hub-off' : ''}${tab.action !== undefined && tab.action === cursor ? ' selected' : ''}`);
      node.append(icon(tab.icon, 'hub-tab-icon'), el('span', 'hub-tab-label', tab.label));
      if (tab.disabled) {
        node.append(el('span', 'hub-tab-why', tab.disabled));
        node.title = tab.disabled;
      }
      if (tab.attention) node.append(el('span', 'hub-dot'));
      if (tab.action !== undefined) act(node, tab.action);
      bar.append(node);
    }
    return bar;
  }

  function seats(list) {
    const box = el('div', 'hub-seats');
    for (const a of list) box.append(a ? face(a, 'hub-seat') : el('i', 'hub-seat hub-free', '+'));
    return box;
  }

  /**
   * Des tables en médaillons superposés (tables en commun avec un joueur) : le logo de roue de chacune,
   * son initiale faute de logo, son titre au survol ; puis ce qui suit (« +3 tables en commun »).
   */
  function tableStack(tables, note) {
    const box = el('div', 'hub-tables');
    const stack = el('span', 'hub-tables-stack');
    for (const tb of tables) {
      const disc = el('span', 'hub-table-disc');
      disc.title = tb.title;
      if (tb.src) {
        const img = el('img', 'hub-table-logo');
        img.src = tb.src;
        img.alt = '';
        img.addEventListener('error', () => img.replaceWith(el('span', 'hub-table-initial', tb.title.charAt(0).toUpperCase())));
        disc.append(img);
      } else disc.append(el('span', 'hub-table-initial', tb.title.charAt(0).toUpperCase()));
      stack.append(disc);
    }
    box.append(stack);
    if (note) box.append(el('span', 'hub-tables-note', note));
    return box;
  }

  /** La bulle du dernier message : « <Bruno> » en tête pour un groupe. */
  function bubble(b) {
    const node = el('p', `hub-bubble${b.group ? ' hub-bubble-group' : ''}`);
    // Le texte coupé à deux lignes dans son propre élément : la marge de la bulle ne laisse rien paraître de la troisième.
    const text = el('span', 'hub-bubble-text');
    if (b.who) text.append(el('b', 'hub-bubble-who', `<${b.who}> `));
    text.append(document.createTextNode(b.text));
    node.append(text);
    node.title = b.text;
    return node;
  }

  /** Le journal d'un salon : une ligne par message, l'heure, le pseudo à sa teinte, le texte coupé au bord. */
  function log(lines) {
    const box = el('div', 'hub-log');
    for (const l of lines) {
      const row = el('div', `hub-line${l.kind ? ` hub-line-${l.kind}` : ''}`);
      const nick = el('span', 'hub-nick', `<${l.nick}>`);
      nick.style.setProperty('--nick-hue', String(Number(l.hue) || 0));
      const text = el('span', 'hub-line-text', l.text);
      text.title = l.text;
      row.append(el('time', '', l.time), nick, text);
      box.append(row);
    }
    return box;
  }

  function card(c, layout, cursor, start) {
    const selected = c.action !== undefined && c.action === cursor;
    const node = el('div', `hub-card hub-layout-${layout}${c.tone ? ` hub-tone-${c.tone}` : ''}${c.quiet ? ' hub-quiet' : ''}${selected ? ' selected' : ''}`);
    if (c.action !== undefined) act(node, c.action);
    // L'image à gauche : la pastille d'un joueur (et son anneau de présence), sinon une icône dans son rond.
    if (c.avatar) node.append(face(c.avatar, `hub-card-face${c.ring ? ` hub-ring hub-ring-${c.ring}` : ''}`));
    else if (c.icon) {
      const ic = el('span', 'hub-card-ic');
      ic.append(icon(c.icon, 'hub-card-icon'));
      node.append(ic);
    }
    const main = el('div', 'hub-card-main');
    if (c.eyebrow) main.append(el('small', 'hub-card-eyebrow', c.eyebrow));
    // Le joueur, son niveau, puis ce qu'il fait (« Léa Niv. 18 vous a dépassé… ») ; sans joueur, le niveau suit le titre.
    const title = el('h3', 'hub-card-title');
    if (c.name) {
      title.append(document.createTextNode(c.name));
      if (c.level) title.append(levelChip(c.level));
      else title.append(document.createTextNode(' '));
      title.append(document.createTextNode(c.title));
    } else {
      // Le titre dans son élément : une cartouche de joueur le coupe sur une ligne (hub.css, hub-layout-people).
      const text = el('span', 'hub-card-title-text', c.title);
      text.title = c.title;
      title.append(text);
      if (c.level) title.append(levelChip(c.level));
    }
    if (c.count) title.append(el('em', 'hub-count', String(c.count)));
    main.append(title);
    if (c.seats?.length) main.append(seats(c.seats));
    if (c.mutual?.avatars?.length) {
      // Les amis en commun : leurs pastilles superposées, puis « 4 amis en commun ».
      const box = el('div', 'hub-mutual');
      const stack = el('span', 'hub-mutual-stack');
      for (const a of c.mutual.avatars) stack.append(face(a, 'hub-mutual-face'));
      box.append(stack, el('span', 'hub-tables-note', c.mutual.note));
      main.append(box);
    }
    if (c.tables?.length) main.append(tableStack(c.tables, c.tablesNote));
    if (c.bubble) main.append(bubble(c.bubble));
    if (c.lines?.length) main.append(log(c.lines));
    if (c.detail) main.append(el('p', 'hub-card-detail', c.detail));
    if (c.progress !== undefined) {
      const bar = el('div', 'hub-bar');
      const fill = el('span');
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, c.progress)) * 100)}%`;
      bar.append(fill);
      main.append(bar);
    }
    node.append(main);
    if (c.aside) node.append(el('span', `hub-card-aside${c.asideTone ? ` hub-tone-${c.asideTone}` : ''}`, c.aside));
    if (c.buttons?.length) {
      const row = el('div', 'hub-buttons');
      for (const b of c.buttons) {
        // Pas encore possible : grisé, sa raison à la suite (« Bientôt »), sans action.
        if (b.off) {
          const off = el('span', 'hub-button hub-off');
          off.append(el('span', '', b.label));
          off.append(el('span', 'hub-button-why', b.off));
          off.title = b.off;
          row.append(off);
          continue;
        }
        const btn = el('span', `hub-button${b.primary ? ' hub-go' : ''}${b.quick ? ' hub-quick' : ''}${b.action !== undefined && b.action === cursor ? ' selected' : ''}`);
        // Le bouton choisi porte la touche qui le valide.
        if (b.action === cursor && start) btn.append(el('kbd', 'hub-button-key', start));
        btn.append(el('span', '', b.label));
        if (b.xp) btn.append(el('span', 'hub-button-xp', b.xp));
        if (b.action !== undefined) act(btn, b.action);
        row.append(btn);
      }
      node.append(row);
    }
    return node;
  }

  /**
   * Un bloc (navigation par blocs, hub-screen.ts) : son liseré ; au premier niveau, il se choisit
   * (vert, et un clic y entre) ; quand on y est, son liseré reste marqué et les autres s'éteignent.
   */
  function blockify(node, block, cursor) {
    if (!block) return node;
    node.classList.add('hub-block');
    if (block.action !== undefined) {
      act(node, block.action);
      if (block.action === cursor) node.classList.add('hub-block-focus', 'selected');
    }
    if (block.entered) node.classList.add('hub-block-in');
    return node;
  }

  function eyebrow(s) {
    const head = el('div', 'hub-eyebrow');
    head.append(el('span', '', s.title));
    if (s.note) head.append(el('em', '', s.note));
    return head;
  }

  /**
   * Une section : ses cartes dans leur encart (le bloc), puis ses choix dessous, en lignes d'actions
   * hors de l'encart ; une section sans carte n'a que son titre et ses choix (« Tout voir »).
   */
  function section(s, cursor, start) {
    const box = s.cards.length ? blockify(el('section', `hub-sec hub-layout-${s.layout}`), s.block, cursor) : undefined;
    if (box) {
      if (s.title) box.append(eyebrow(s));
      const list = el('div', `hub-cards hub-layout-${s.layout}`);
      for (const c of s.cards) list.append(card(c, s.layout, cursor, start));
      box.append(list);
      if (!s.choices?.length) return box;
    }
    const group = el('section', 'hub-group');
    if (box) group.append(box);
    else if (s.title) group.append(eyebrow(s));
    group.append(choices(s.choices, cursor));
    return group;
  }

  /**
   * Une liste de choix : les lignes d'actions des autres menus (library.js, lib-action), icône, libellé,
   * détail, l'aplat vert sur le choix courant ; sans encart, chaque ligne s'atteint aux flippers.
   */
  function choices(cards, cursor) {
    const ol = el('ol', 'lib-actions with-icons hub-choices');
    ol.dataset.iconMenu = '';
    for (const c of cards) {
      const li = el('li', `lib-action tone-${c.quiet ? 'quiet' : 'none'}${c.action !== undefined && c.action === cursor ? ' current' : ''}`);
      li.dataset.label = c.title;
      const glyph = el('span', 'lib-action-glyph');
      glyph.append(icon(c.icon || 'list', 'lib-action-icon'));
      // Quelque chose attend derrière ce choix : la pastille rouge, comme dans les autres menus.
      if (c.count) glyph.append(el('span', 'lib-attention'));
      li.append(glyph, el('span', 'label', c.title));
      if (c.detail) li.append(el('span', 'detail', c.detail));
      if (c.action !== undefined) act(li, c.action);
      ol.append(li);
    }
    return ol;
  }

  /** Le pied : « Flippers : choisir · Start : valider… », la touche en vert. */
  function foot(hint) {
    const box = el('footer', 'hub-foot');
    for (const part of String(hint ?? '').split(' · ')) {
      const at = part.indexOf(' : ');
      const item = el('span');
      if (at > 0) item.append(el('kbd', '', part.slice(0, at)), document.createTextNode(part.slice(at + 3)));
      else item.textContent = part;
      box.append(item);
    }
    return box;
  }

  /** L'écran entier (renderLibrary le renvoie à la place de l'écran de menu). */
  function render(v) {
    const h = v.hub;
    const desk = document.documentElement.classList.contains('menu-desktop');
    const o = el('section', `lib lib-hub${desk ? ' hub-desk' : ''}${h.inside ? ' hub-inside' : ''}`);
    o.dataset.navOrder = (v.order ?? []).join(',');
    const head = el('header', 'hub-head');
    const titles = el('div', 'hub-titles');
    titles.append(el('h1', 'hub-title', h.title));
    if (h.facts.length) {
      const facts = el('p', 'hub-facts');
      for (const f of h.facts) facts.append(strongNumbers(f, 'hub-fact'));
      titles.append(facts);
    }
    head.append(medal(h.medallion), titles);
    if (h.band) head.append(band(h.band));
    // Un écran sans onglets (le retour de partie) : pas de barre vide.
    o.append(head);
    if (h.tabs.length) o.append(blockify(tabs(h.tabs, v.cursor), h.tabsBlock, v.cursor));
    else o.classList.add('hub-no-tabs');
    const body = el('div', 'hub-body');
    // Les blocs du contenu s'atteignent aux flippers (le choix d'un bloc l'amène dans la vue) ; depuis
    // la barre d'onglets, en en sortant (Exit) : une liste de blocs, pas un texte hors d'atteinte.
    body.dataset.choices = '';
    if (h.empty) {
      const empty = el('div', 'hub-empty');
      empty.append(el('b', '', h.empty.title), el('span', '', h.empty.detail));
      body.append(empty);
    } else if (desk && h.sections.length > 1) {
      // Au bureau, deux colonnes : la carte du moment et la suivante à gauche, le reste à droite.
      body.classList.add('hub-cols');
      const left = el('div', 'hub-col');
      const right = el('div', 'hub-col');
      const split = h.sections[0].layout === 'hero' ? 2 : Math.ceil(h.sections.length / 2);
      // Une section peut dire sa colonne (la Communauté : conversations et joueurs à gauche, salon et nouvelles à droite).
      const leftSide = (s, i) => (s.column ? s.column === 'left' : i < split);
      h.sections.forEach((s, i) => (leftSide(s, i) ? left : right).append(section(s, v.cursor, h.start)));
      body.append(left, right);
    } else for (const s of h.sections) body.append(section(s, v.cursor, h.start));
    o.append(body, foot(v.hint));
    return o;
  }

  window.CyberHub = { render };
})();
