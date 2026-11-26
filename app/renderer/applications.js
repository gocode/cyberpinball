// Rubrique Applications (26/11/2026, d'après les maquettes validées).
// - L'affiche du médaillon au focus dans la roue : celle de la Communauté (community.js, CyberPosterKit),
//   son médaillon « Écran » (medaillons-vivants.js).
// - La grille (Start sur le médaillon) : les tuiles au fronton ; au playfield, la fiche de l'application
//   choisie, les commandes et le QR du téléphone. Sans fronton (ou au bureau), la grille prend la place
//   de la fiche. Au DMD, le nom de l'application choisie.
// - L'application ouverte : au fronton (si elle est sur le playfield) son affiche « En cours » ; au
//   playfield les boutons de la borne et le téléphone ; l'écran s'assombrit après 30 s sans geste.
// Le processus principal choisit et traduit tout (applications-menu.ts, AppsView) ; ici, on dessine.
'use strict';

(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const icon = (name, className) => (typeof cyberIcon === 'function' ? cyberIcon(name, className) : el('span', className));

  // ---------- L'affiche du médaillon ----------

  const kit = window.CyberPosterKit ? window.CyberPosterKit('applications', (s) => s.applications) : undefined;

  // ---------- Morceaux ----------

  function brand() {
    const node = el('div', 'ap-brand', 'CYBER ');
    node.append(el('b', '', 'PINBALL'));
    return node;
  }

  /** L'icône relevée sur le site, ou la tuile composée : initiales sur la couleur de l'application. */
  function appIcon(face, size, extra = '') {
    const box = el('div', `ap-icon${face.icon ? ' has-image' : ' gen'}${extra ? ` ${extra}` : ''}`);
    box.style.setProperty('--ap-c', face.color);
    box.style.setProperty('--ap-size', String(size));
    if (face.icon) {
      const img = el('img');
      img.src = face.icon;
      img.alt = '';
      img.draggable = false;
      // Icône illisible (fichier effacé) : les initiales à la place.
      img.addEventListener('error', () => {
        box.classList.remove('has-image');
        box.classList.add('gen');
        box.replaceChildren(el('span', 'ap-initials', face.initials));
      });
      // Un favicon trop petit pour remplir la tuile (APP_ICON_MIN du cœur) : en pastille sur la tuile composée, net plutôt qu'agrandi flou.
      img.addEventListener('load', () => box.classList.toggle('ap-mini', Math.min(img.naturalWidth, img.naturalHeight) < 96));
      box.append(img);
    } else box.append(el('span', 'ap-initials', face.initials));
    return box;
  }

  function status(online) {
    const box = el('div', 'ap-status');
    box.append(el('span', `ap-dot${online.on ? '' : ' ap-off'}`), el('span', '', online.text));
    return box;
  }

  function head(v) {
    const box = el('header', 'ap-head');
    const where = el('div', 'ap-where-title');
    where.append(icon('layout', 'ap-where-icon'), el('span', '', v.heading));
    box.append(brand(), where, status(v.online));
    return box;
  }

  function banner(text) {
    const box = el('div', 'ap-banner');
    box.append(icon('alert', 'ap-banner-icon'), el('span', '', text));
    return box;
  }

  function commands(list) {
    const box = el('footer', 'ap-cmds');
    for (const c of list) {
      const cmd = el('span', 'ap-cmd');
      cmd.append(el('span', 'ap-key', c.key), el('span', '', c.text));
      box.append(cmd);
    }
    return box;
  }

  /** Les tuiles : un clic ouvre (ou ajoute), comme Start. */
  function grid(v, act) {
    const box = el('div', 'ap-grid');
    v.tiles.forEach((tile, i) => {
      const node = act(el('div', `ap-tile${i === v.current ? ' ap-focus' : ''}${tile.off ? ' ap-off' : ''}${tile.local ? ' local' : ''}`), tile.action);
      node.style.setProperty('--ap-c', tile.color);
      const name = el('h3', 'ap-name', tile.name);
      name.title = tile.name;
      const where = el('div', 'ap-tile-where');
      where.append(icon(tile.off ? 'alert' : tile.whereIcon, 'ap-tile-where-icon'), el('span', '', tile.off ?? tile.where));
      node.append(appIcon(tile, 150, tile.off ? 'ap-off' : ''), name, where);
      box.append(node);
    });
    const add = act(el('div', `ap-tile add${v.current === v.tiles.length ? ' ap-focus' : ''}`), v.add.action);
    const plus = el('div', 'ap-plus');
    plus.append(icon('plus', 'ap-plus-icon'));
    add.append(plus, el('h3', 'ap-name', v.add.label), el('div', 'ap-tile-where', v.add.detail));
    box.append(add);
    return box;
  }

  /** Le fronton : la grille ; ou, l'application ouverte sur le playfield, son affiche « En cours ». */
  function fronton(v, act) {
    const box = el('section', `ap-screen ap-fronton${v.dim ? ' ap-dim' : ''}`); // i18n-ignore : classes CSS
    if (v.mode === 'open' && v.open) {
      const now = el('div', 'ap-now');
      const copy = el('div', 'ap-now-copy');
      copy.append(el('p', 'ap-eyebrow', v.open.label), el('h1', 'ap-now-name', v.open.name), el('p', 'ap-muted', v.open.where));
      now.append(appIcon(v.open, 300), copy);
      box.append(head(v), now, commands(v.open.buttons.map((b) => ({ key: b.key, text: b.text }))));
      return box;
    }
    box.append(head(v));
    if (v.banner) box.append(banner(v.banner));
    box.append(grid(v, act), commands(v.commands));
    return box;
  }

  function pager(p) {
    const box = el('div', 'ap-pager');
    for (let i = 0; i < p.count; i++) box.append(el('i', i === p.at ? 'ap-on' : ''));
    box.append(el('i', `add-page${p.at === p.count ? ' ap-on' : ''}`, '+'));
    return box;
  }

  function rubric(v) {
    const box = el('div', 'ap-rubric');
    const disc = el('div', 'ap-disc');
    if (window.CyberMedaillons) disc.append(CyberMedaillons.medallion('applications', 'ap-disc-logo'));
    else {
      const img = el('img', 'ap-disc-logo');
      img.src = 'medaillons/applications.png';
      img.alt = '';
      disc.append(img);
    }
    const copy = el('div', 'ap-rubric-copy');
    copy.append(el('h2', '', v.heading), el('p', 'ap-muted', v.count));
    box.append(disc, copy);
    return box;
  }

  function fiche(v) {
    const box = el('div', 'ap-hero');
    if (v.fiche) {
      const f = v.fiche;
      const name = el('h1', 'ap-hero-name', f.name);
      name.title = f.name;
      const facts = el('dl', 'ap-facts');
      for (const fact of f.facts) {
        const dt = el('dt');
        dt.append(icon(fact.icon, 'ap-fact-icon'), el('span', '', fact.label));
        const dd = el('dd', '', fact.value);
        dd.title = fact.value;
        facts.append(dt, dd);
      }
      box.append(appIcon(f, 260), name, pager(f.pager), facts);
    } else if (v.addCard) {
      const plus = el('div', 'ap-plus ap-plus-big'); // i18n-ignore : classes CSS
      plus.append(icon('plus', 'ap-plus-icon'));
      box.append(plus, el('h1', 'ap-hero-name', v.addCard.label), el('p', 'ap-muted ap-hero-detail', v.addCard.detail));
    }
    return box;
  }

  function keysList(list) {
    const box = el('div', 'ap-keys');
    for (const k of list) {
      const key = el('div', 'ap-keys-key');
      key.append(el('span', 'ap-key', k.key));
      const act = el('div', 'ap-keys-act');
      act.append(el('span', '', k.text));
      if (k.small) act.append(el('small', '', k.small));
      box.append(key, act);
    }
    return box;
  }

  /** Le playfield (écran du front-end, dessiné par library.js) : la fiche, ou la grille sans fronton. */
  function render(lib, act, remote) {
    const v = lib.apps;
    // Au bureau (html.menu-desktop, posé par frontend.js), la maquette du bureau : ap-desktop, propre à cette feuille.
    const desktop = document.documentElement.classList.contains('menu-desktop');
    const box = el('section', `lib lib-apps ap-screen ap-playfield${v.fronton ? '' : ' ap-solo'}${desktop ? ' ap-desktop' : ''}${v.dim ? ' ap-dim' : ''}`); // i18n-ignore : classes CSS
    box.append(head(v));
    if (v.mode === 'open' && v.open) {
      const now = el('div', 'ap-now ap-now-small');
      const copy = el('div', 'ap-now-copy');
      copy.append(el('p', 'ap-eyebrow', v.open.label), el('h1', 'ap-now-name', v.open.name), el('p', 'ap-muted', v.open.where));
      now.append(appIcon(v.open, 160), copy);
      box.append(now, el('h2', 'ap-section-title', v.open.buttonsTitle), keysList(v.open.buttons));
    } else if (v.fronton) {
      box.append(rubric(v));
      if (v.banner) box.append(banner(v.banner));
      box.append(fiche(v), keysList(v.commands));
    } else {
      if (v.banner) box.append(banner(v.banner));
      box.append(grid(v, act), commands(v.commands));
    }
    if (remote) {
      remote.classList.add('ap-remote');
      box.append(remote);
    }
    else box.append(el('p', 'ap-muted ap-remote-note', v.remote.text));
    if (v.mode === 'open' && v.open) box.append(el('p', 'ap-muted ap-dim-note', v.open.note));
    return box;
  }

  // ---------- Fronton et DMD ----------

  const zoneNodes = new Map();
  const dmds = new Map();

  function dropDmd(node) {
    const d = dmds.get(node);
    if (!d) return;
    d.handle.destroy();
    dmds.delete(node);
  }

  function zone(node, part, s) {
    const v = s.phase === 'library' ? s.library?.apps : undefined;
    // Le DMD : « APPLICATIONS » et le nom choisi, sur la grille de points.
    if (part === 'dmd' && v && window.CyberFallback) {
      const title = `${v.dmd.label} ${v.dmd.name}`.toUpperCase();
      let d = dmds.get(node);
      if (!d) {
        d = { handle: CyberFallback.dmd(node, { title }, { animate: false }), title };
        dmds.set(node, d);
      } else if (d.title !== title) {
        d.handle.update({ title });
        d.title = title;
      }
      return true;
    }
    dropDmd(node);
    let content;
    if (part === 'backglass' && v?.fronton) {
      content = fronton(v, (n, index) => (typeof actOn === 'function' ? actOn(n, { type: 'activate', index }) : n));
    }
    if (!content && kit && part === 'backglass' && s.applications?.poster) return kit.zone(node, part, s);
    if (kit) kit.zone(node, part, { ...s, applications: undefined });
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
      wrap = el('div', 'jb-zone-fill ap-zone');
      node.append(wrap);
      zoneNodes.set(node, wrap);
    }
    wrap.replaceChildren(content);
    return true;
  }

  window.CyberApplications = {
    wheelPoster: (s, isDesk) => kit.wheelPoster(s, isDesk),
    backglassPoster: (s) => kit.backglassPoster(s),
    zone,
    render,
  };
})();
