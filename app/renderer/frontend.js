// Affiche l'état envoyé par le processus principal (frontend.ts). Chaque
// fenêtre connaît son rôle par l'URL ; toute la logique reste côté principal.

const params = new URLSearchParams(location.search);
const role = params.get('role') ?? 'playfield';
const root = document.getElementById('root');
// Rôles annexes de cet écran, chacun dans sa zone (fractions de l'écran) : backglass et
// DMD sur le même fronton, ou DMD incrusté dans le playfield (sans pivoter, comme dans VPX).
const parts = JSON.parse(params.get('zones') ?? '[]');
const zoneLayer = document.getElementById('zones');
// Zone du playfield sur son écran (poste de bureau : la table d'un côté) : la page s'y tient.
const playfieldZone = JSON.parse(params.get('playfield') ?? 'null');
if (playfieldZone) {
  for (const [key, value] of Object.entries({ x: playfieldZone.x, y: playfieldZone.y, w: playfieldZone.width, h: playfieldZone.height })) {
    document.documentElement.style.setProperty(`--pf-${key}`, String(value));
  }
}
// Rotation de la mise en page pour un joueur au bord des flippers (frontend.css).
document.documentElement.dataset.rotation = params.get('rotation') ?? '0';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Marque « CYBER PINBALL », PINBALL en vert signal (theme.css, .brand .pin). */
function brand(className = 'brand') {
  const node = el('div', className, 'CYBER ');
  node.append(el('span', 'pin', 'PINBALL'));
  return node;
}

function keysTable(title, rows) {
  const box = el('div');
  box.append(el('h2', '', title));
  const table = el('table');
  for (const [label, key] of rows) {
    const tr = el('tr');
    tr.append(el('td', '', label), el('td', '', key));
    table.append(tr);
  }
  box.append(table);
  return box;
}

/**
 * Commandes en grille compacte, sur plusieurs colonnes quand la place le permet : au
 * chargement, elles laissent voir la vidéo du jeu ou le titre, même long.
 */
function keysGrid(title, rows) {
  const box = el('div', 'game-keys');
  box.append(el('h2', '', title));
  const list = el('div', 'game-keys-list');
  for (const [label, key] of rows) {
    const row = el('div', 'game-key');
    row.append(el('span', '', label), el('span', 'game-key-name', key));
    list.append(row);
  }
  box.append(list);
  return box;
}

/** Pied de page : chaque commande est aussi cliquable (code de la touche équivalente). */
/**
 * Bandeau d'aide : « Start : fiche » (« Start: game page » en anglais, sans espace avant
 * les deux-points) devient une touche cerclée « START » suivie de « fiche ».
 * Un libellé sans « : » reste du texte.
 */
function footer(parts) {
  const box = el('div', 'footer');
  for (const [label, code] of parts) {
    const hint = el('span', 'hint');
    const m = /^(.+?) ?: (.+)$/.exec(label);
    if (m) hint.append(el('span', `cap${/^start\b/i.test(m[1]) ? ' start' : ''}`, m[1]), el('span', 'what', m[2]));
    else hint.append(el('span', 'what', label));
    if (code) hint.dataset.act = JSON.stringify({ type: 'key', code });
    box.append(hint);
  }
  return box;
}

/** Corps du titre de la table choisie : la zone du titre a une hauteur fixe, un titre long y prend un corps plus petit. */
function titleSize(title) {
  return title.length <= 22 ? 'l' : title.length <= 44 ? 'm' : 's';
}

// ---------- Roue des tables : les logos glissent d'une place à l'autre ----------

/**
 * Roues dessinées (réglage « Présentation du menu »), toutes posées sur un bandeau de
 * 1080 × 540 qui porte aussi le titre et la barre d'aide (frontend.css) ; toute autre
 * valeur donne la liste des titres.
 */
const WHEEL_STYLES = ['medaillons', 'bandeau', 'minimal', 'arche'];

/*
 * Médaillons (bandeau de 1080 × 540) : les logos de la communauté VPin sont des médaillons
 * carrés (image ronde cerclée de chrome, nom du jeu en bas). Sept visibles, de −3 à +3, qui
 * se chevauchent ; ±4 hors du bandeau, d'où ils entrent. Le centre est plus haut, sous
 * l'anneau vert (frontend.css, .wheel-ring), les voisins descendent le long de l'arc.
 */
const WHEELS = {
  medaillons: {
    face: [275, 275],
    x: [-90, 112, 222, 352, 540, 728, 858, 968, 1170],
    y: [222, 214, 188, 170, 150, 170, 188, 214, 222],
    box: [[120, 120], [134, 134], [152, 152], [170, 170], [275, 275], [170, 170], [152, 152], [134, 134], [120, 120]],
    opacity: [0, 0.82, 0.94, 1, 1, 1, 0.94, 0.82, 0],
  },
  // Cinq médaillons espacés sur une lame de verre droite ; ±3 attendent hors du bandeau.
  bandeau: {
    face: [275, 275],
    x: [-300, -90, 125, 330, 540, 750, 955, 1170, 1380],
    y: [160, 160, 160, 160, 160, 160, 160, 160, 160],
    box: [[150, 150], [150, 150], [170, 170], [190, 190], [280, 280], [190, 190], [170, 170], [150, 150], [150, 150]],
    opacity: [0, 0, 1, 1, 1, 1, 1, 0, 0],
  },
  // Cinq médaillons sur un simple filet lumineux : la table reste dégagée.
  minimal: {
    face: [275, 275],
    x: [-300, -90, 135, 330, 540, 750, 945, 1170, 1380],
    y: [170, 170, 170, 170, 170, 170, 170, 170, 170],
    box: [[140, 140], [140, 140], [160, 160], [170, 170], [250, 250], [170, 170], [160, 160], [140, 140], [140, 140]],
    opacity: [0, 0, 0.9, 1, 1, 1, 0.9, 0, 0],
  },
  // Cinq médaillons le long d'une arche de métal et de verre, comme un fronton.
  arche: {
    face: [275, 275],
    x: [-300, -60, 140, 330, 540, 750, 940, 1140, 1380],
    y: [420, 360, 277, 214, 190, 214, 277, 360, 420],
    box: [[140, 140], [140, 140], [150, 150], [170, 170], [250, 250], [170, 170], [150, 150], [140, 140], [140, 140]],
    opacity: [0, 0, 1, 1, 1, 1, 1, 0, 0],
  },
};

/**
 * Pose d'un logo à une place : le logo garde la boîte du centre et prend une échelle,
 * d'après son format, pour tenir sans déformation dans la boîte de sa place.
 */
function wheelPose(style, offset, ratio) {
  const g = WHEELS[style];
  const last = (g.x.length - 1) / 2;
  const i = Math.max(-last, Math.min(last, offset)) + last;
  const [w, h] = g.box[i];
  const [fw, fh] = g.face;
  return {
    x: g.x[i],
    y: g.y[i],
    s: Math.min(w, h * ratio) / Math.min(fw, fh * ratio),
    o: g.opacity[i],
  };
}

/**
 * Roue gardée d'un état à l'autre : chaque table garde son logo, qui glisse vers sa nouvelle
 * place (transitions de transform et d'opacité, frontend.css). Un nouvel appui pendant le
 * glissement repart de la pose visible ; une table qui sort s'efface, puis son logo est retiré.
 */
let wheelView;

/**
 * Logo d'une table dans la roue ; sans logo lisible, le titre en texte.
 * La zone cliquable (.wheel-hit) est le cœur du logo : les médaillons voisins se chevauchent,
 * pas leurs zones cliquables.
 */
function wheelItem(n) {
  const node = el('div', 'wheel-item');
  const face = el('div', 'wheel-logo');
  const hit = el('div', 'wheel-hit');
  const tilt = el('div', 'wheel-tilt');
  hit.append(tilt);
  face.append(hit);
  const item = { node, face, hit, ratio: 1, offset: n.offset };
  const named = () => {
    tilt.replaceChildren(el('div', 'wheel-name', n.title));
    node.classList.add('disc');
    item.ratio = 1;
    if (wheelView) placeWheelItem(item, wheelView.style);
  };
  const logo = CyberMedia.logo(n.wheel)?.cloneNode();
  if (logo) {
    logo.className = 'wheel-img';
    tilt.append(logo);
    const measured = () => {
      if (!logo.naturalWidth) return;
      item.ratio = logo.naturalWidth / logo.naturalHeight;
      // Logo qui n'est pas un médaillon carré (large, détouré) : posé sur un disque.
      node.classList.toggle('disc', item.ratio > 1.25 || item.ratio < 0.8);
      if (wheelView) placeWheelItem(item, wheelView.style);
    };
    if (logo.complete) measured();
    else logo.addEventListener('load', measured, { once: true });
    logo.addEventListener('error', named, { once: true });
  } else {
    tilt.append(el('div', 'wheel-name', n.title));
    node.classList.add('disc');
  }
  node.append(face);
  return item;
}

function placeWheelItem(item, style, hidden = item.leaving) {
  const p = wheelPose(style, item.offset, item.ratio);
  const st = item.node.style;
  st.setProperty('--x', String(p.x));
  st.setProperty('--y', String(p.y));
  st.setProperty('--s', p.s.toFixed(4));
  st.setProperty('--o', String(hidden ? 0 : p.o));
  // La table choisie passe devant ses voisines (et l'anneau des Médaillons, z-index 19, entre eux).
  st.zIndex = String(20 - 2 * Math.min(4, Math.abs(item.offset)));
  if (p.o > 0 && !hidden) item.hit.dataset.act = JSON.stringify({ type: 'wheel', offset: item.offset });
  else delete item.hit.dataset.act;
}

function wheelStage(s, style) {
  if (!wheelView) {
    const stage = el('div', 'wheel-stage');
    const layer = el('div', 'wheel-items');
    // Anneau vert fixe de la table choisie (Médaillons) : les logos glissent dessous et dedans.
    layer.append(el('div', 'wheel-ring'));
    stage.append(layer);
    wheelView = { stage, layer, items: new Map(), style };
  }
  const v = wheelView;
  v.style = style;
  v.stage.className = `wheel-stage roue-${style}`;
  const live = new Set();
  for (const n of s.neighbors) {
    live.add(n.key);
    let item = v.items.get(n.key);
    if (item?.leaving) {
      clearTimeout(item.leaving);
      item.leaving = undefined;
    }
    if (item && Math.abs(n.offset - item.offset) > 2) {
      // Moins de neuf tables, en boucle : la table passe d'un bord à l'autre. Elle n'y glisse
      // pas en travers de la roue : elle repart, sans transition, de l'extérieur du bord d'arrivée.
      const last = (WHEELS[style].x.length - 1) / 2;
      item.offset = Math.sign(n.offset) * last;
      item.node.classList.add('jump');
      placeWheelItem(item, style, true);
      void item.node.offsetWidth;
      item.node.classList.remove('jump');
      item.offset = n.offset;
    } else if (item) {
      item.offset = n.offset;
    } else {
      item = wheelItem(n);
      v.items.set(n.key, item);
      v.layer.append(item.node);
      // Logo nouveau (saut de plusieurs tables) : il apparaît à sa place, sans glisser.
      if (v.stage.isConnected) {
        placeWheelItem(item, style, true);
        void item.node.offsetWidth;
      }
    }
    placeWheelItem(item, style);
  }
  for (const [key, item] of v.items) {
    if (live.has(key) || item.leaving) continue;
    item.leaving = setTimeout(() => {
      item.node.remove();
      v.items.delete(key);
    }, 500);
    placeWheelItem(item, style);
  }
  return v.stage;
}

/** Liste : sept lignes fixes, la table choisie toujours sur celle du milieu. */
function tableList(s) {
  const list = el('ul', 'wheel');
  for (const n of s.neighbors) {
    if (Math.abs(n.offset) > 3) continue;
    const li = el('li', n.offset === 0 ? 'current' : '');
    li.style.gridRow = String(n.offset + 4);
    li.dataset.act = JSON.stringify({ type: 'wheel', offset: n.offset });
    li.append(logoSlot(n), el('span', 'name', n.title));
    if (n.version) li.append(el('span', 'v', n.version));
    list.append(li);
  }
  return list;
}

/**
 * Disposition du menu : « cab » quand la zone du playfield, vue du joueur, est en hauteur
 * (média plein écran), « desktop » sinon (média dans un cadre 9:16 à gauche). Posée sur
 * html, car le fond du playfield (#media-bg) est hors de la racine.
 */
function syncMenuShape() {
  const desktop = root.offsetWidth > root.offsetHeight;
  document.documentElement.classList.toggle('menu-desktop', desktop);
  document.documentElement.classList.toggle('menu-cab', !desktop);
}
new ResizeObserver(syncMenuShape).observe(root);
syncMenuShape();

/**
 * Menu des tables gardé d'un état à l'autre : ses zones de taille fixe (frontend.css)
 * restent en place, seul leur contenu change, et la roue y glisse (wheelStage). En borne,
 * le nom et fabricant · année seulement : la table filmée reste la vedette.
 */
let menuView;

function menuPanel(s) {
  if (!menuView) {
    const node = el('section', 'menu');
    // Voile décoratif : sous les zones du menu (frontend.css) ; layout-check.ts vérifie qu'il ne passe jamais dessus.
    const scrim = el('div', 'menu-scrim');
    scrim.dataset.veil = '';
    const nav = el('div', 'menu-nav');
    const title = el('div', 'menu-title');
    const text = el('div', 'title');
    title.append(text);
    title.dataset.act = JSON.stringify({ type: 'wheel', offset: 0 });
    const meta = el('div', 'menu-meta');
    const counter = el('div', 'menu-count');
    // Zones dont la position ne doit pas changer d'une table à l'autre (layout-check.ts, essais sans opérateur).
    nav.dataset.stable = 'navigation';
    title.dataset.stable = 'titre';
    meta.dataset.stable = 'fabricant';
    counter.dataset.stable = 'compteur';
    // Bureau, roues à bandeau : le fronton du jeu en fond, et les cadres chromés (frontend.css).
    const backglass = el('div', 'menu-backglass');
    // Classes des cadres : noms de la feuille de style (frontend.css), pas du texte affiché.
    const frames = [el('div', 'menu-frame plateau'), el('div', 'menu-frame fronton')]; // i18n-ignore : classes CSS
    node.append(scrim, ...frames, backglass, nav, el('div', 'menu-label', t('Table sélectionnée')), title, meta, counter);
    menuView = { node, nav, text, meta, counter, backglass };
  }
  const v = menuView;
  const style = WHEEL_STYLES.includes(s.menuLayout) ? s.menuLayout : undefined;
  v.node.className = `menu layout-${style ? 'wheel' : 'list'}${style ? ` menu-${style} menu-band` : ''}`;
  // Sur html : le bandeau d'aide, hors du menu, se place aussi d'après la roue (frontend.css).
  document.documentElement.dataset.menuLayout = s.menuLayout;
  if (style) document.documentElement.dataset.menuBand = style;
  else delete document.documentElement.dataset.menuBand;
  showBackglass(v.backglass, s.backglass?.url);
  v.node.dataset.stableShape = style ?? 'list';
  if (style) {
    const stage = wheelStage(s, style);
    if (v.nav.firstChild !== stage) v.nav.replaceChildren(stage);
  } else {
    v.nav.replaceChildren(tableList(s));
  }
  v.text.textContent = s.table.title;
  v.text.dataset.size = titleSize(s.table.title);
  v.meta.textContent = s.table.subtitle ?? '';
  // Dans une boîte flexible, l'espace en tête d'un texte nu disparaîtrait : un seul élément de texte.
  const count = el('span');
  count.append(el('b', '', String(s.position).padStart(String(s.count).length, '0')), ` / ${s.count}`);
  v.counter.replaceChildren(count);
  return v.node;
}

/**
 * Fronton du jeu choisi en fond (bureau) : la nouvelle image remplace l'ancienne une fois
 * chargée, sans passer par un fond vide ; sans fronton, la place reste sombre.
 */
function showBackglass(holder, url) {
  if (holder.dataset.url === (url ?? '')) return;
  holder.dataset.url = url ?? '';
  if (!url) {
    holder.replaceChildren();
    return;
  }
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.onload = () => {
    if (holder.dataset.url === url) holder.replaceChildren(img);
  };
  img.src = url;
}

/**
 * Enfants de la racine, sans déplacer ceux qui y sont déjà dans le bon ordre : un nœud
 * retiré du document, même un instant, perd ses transitions (la roue cesserait de glisser).
 */
function placeChildren(nodes) {
  const keep = new Set(nodes);
  for (const child of [...root.children]) if (!keep.has(child)) child.remove();
  let next = root.firstChild;
  for (const node of nodes) {
    if (node === next) next = next.nextSibling;
    else root.insertBefore(node, next);
  }
}

/**
 * Case du logo dans la liste : le logo du jeu (Wheel), sinon l'initiale du titre. La case
 * a toujours la même taille, pour que les titres restent alignés quand la liste défile.
 */
function logoSlot(n) {
  const slot = el('span', 'logo-slot');
  const logo = CyberMedia.logo(n.wheel, 'list-logo');
  if (logo) slot.append(logo);
  else slot.append(el('span', 'initial', (n.title.match(/[\p{L}\p{N}]/u) ?? ['·'])[0].toUpperCase()));
  return slot;
}

/** Écran de chargement de secours (fallback.js) gardé d'un état à l'autre : ses animations ne repartent pas de zéro. */
let loadingFallback;

function dropLoadingFallback() {
  loadingFallback?.handle.destroy();
  loadingFallback = undefined;
}

/**
 * Chargement d'une table, sur le playfield : les commandes de la partie, toujours lisibles.
 * Avec la vidéo de chargement du jeu (Loading), elle passe en fond, les commandes dans un
 * bandeau par-dessus ; sans elle, l'écran de chargement de secours (fallback.js : titre,
 * fabricant, année, barre d'attente) avec les commandes dessous ; sans fallback.js, le titre
 * et les commandes sur fond noir.
 */
function loadingScreen(s) {
  const keys = keysGrid(t('Commandes de la partie'), s.gameKeys);
  if (s.loading?.url) {
    dropLoadingFallback();
    const o = el('section', 'overlay over-video');
    const panel = el('div', 'loading-panel');
    panel.append(el('h1', '', s.table.title), el('div', 'lead', t('Chargement de la table…')), keys);
    o.append(panel);
    return o;
  }
  const kit = window.CyberFallback;
  if (typeof kit?.loading === 'function') {
    const key = JSON.stringify([s.table.title, s.table.manufacturer, s.table.year, s.gameKeys]);
    if (loadingFallback?.key !== key) {
      dropLoadingFallback();
      const box = el('section', 'overlay loading-fallback');
      const handle = kit.loading(box, { title: s.table.title, manufacturer: s.table.manufacturer, year: s.table.year });
      handle.slot?.append(keys);
      loadingFallback = { key, box, handle };
    }
    return loadingFallback.box;
  }
  const o = el('section', 'overlay');
  o.append(el('h1', '', s.table.title), el('div', 'lead', t('Chargement de la table…')), keys);
  return o;
}

/** Logo de secours du mode attente (fallback.js), gardé tant que la table montrée ne change pas. */
let attractLogo;

function dropAttractLogo() {
  attractLogo?.handle.destroy();
  attractLogo = undefined;
}

/**
 * Mode attente, sur le playfield : la table tirée au hasard, son logo (sinon son titre en
 * logo de secours), fabricant et année, et l'invite à appuyer sur un bouton. Le fond du
 * playfield joue son média ; les autres écrans montrent les siens.
 */
function attractScreen(s) {
  const a = s.attract;
  const box = el('section', 'attract');
  const middle = el('div', 'attract-middle');
  const logo = CyberMedia.logo(a.wheel, 'attract-image');
  const kit = window.CyberFallback;
  if (logo) {
    dropAttractLogo();
    const holder = el('div', 'attract-logo');
    holder.append(logo);
    middle.append(holder);
  } else if (typeof kit?.wheel === 'function') {
    const key = JSON.stringify([a.title, a.manufacturer, a.year]);
    if (attractLogo?.key !== key) {
      dropAttractLogo();
      const holder = el('div', 'attract-logo');
      attractLogo = { key, holder, handle: kit.wheel(holder, { title: a.title, manufacturer: a.manufacturer, year: a.year }) };
    }
    middle.append(attractLogo.holder);
  } else {
    middle.append(el('div', 'attract-title', a.title));
  }
  if (a.subtitle) middle.append(el('div', 'attract-subtitle', a.subtitle));
  box.append(brand(), middle, el('div', 'attract-hint', t('Appuyez sur un bouton pour revenir au menu')));
  return box;
}

function renderPlayfield(s) {
  // Mode attente : la table tirée au hasard, sans la liste du menu.
  if (s.attract) {
    dropLoadingFallback();
    root.replaceChildren(attractScreen(s));
    return;
  }
  dropAttractLogo();
  // Chargement : rien du menu dessous (la vidéo de chargement se voit à travers le bandeau).
  if (s.phase === 'loading' && s.table) {
    root.replaceChildren(loadingScreen(s));
    return;
  }
  dropLoadingFallback();
  const nodes = [];
  // Roue dentée : menu et configuration à la souris (ou Tab), même si les boutons
  // de la borne ne répondent plus comme prévu. Toujours au-dessus des superpositions.
  const gear = el('button', 'gear', '⚙');
  gear.title = t('Menu et configuration (Tab)');
  gear.dataset.act = JSON.stringify({ type: 'config' });
  nodes.push(gear);

  if (s.table) {
    CyberMedia.beginRender();
    nodes.push(menuPanel(s));
  }
  // Bandeau d'aide : au bureau sous les informations de la table ; en borne, absent du menu des tables.
  const help = footer(s.footer);
  if (s.table) help.classList.add('menu-help');
  nodes.push(help);

  // Écran plein par-dessus le menu (fiche, aide, confirmation, message) : il porte la marque
  // en tête, dans son flux (frontend.css, .brand) ; sinon, la marque du menu.
  let cover;
  if (s.phase === 'library' && s.library) {
    cover = renderLibrary(s.library);
  } else if (s.help) {
    cover = el('section', 'overlay');
    cover.append(el('h1', '', t('Commandes')));
    const keys = el('div', 'keys');
    keys.append(keysTable(t('Dans le menu'), s.menuKeys), keysTable(t('Pendant une partie'), s.gameKeys));
    cover.append(keys, footer([[s.nav.help ? t('{key} ou Exit : fermer', { key: s.nav.helpLabel }) : t('Exit : fermer'), s.nav.help ?? s.nav.exit]]));
  } else if (s.phase === 'confirmQuit') {
    cover = el('section', 'overlay');
    cover.append(el('h1', '', t('Quitter Cyber Pinball ?')), el('div', 'lead', t('Start : quitter · Exit : rester')));
  } else if (s.phase === 'message' && s.message) {
    cover = el('section', 'overlay');
    cover.append(el('h1', '', s.message.title));
    const box = el('div', 'message');
    for (const line of s.message.lines) box.append(el('p', /^\d{4}-\d\d-\d\d /.test(line) ? 'log' : '', line));
    cover.append(box);
    if (s.message.action === 'addTable') cover.append(footer([[t('Ajouter une table'), s.nav.confirm], [t('Menu'), s.nav.exit]]));
    else if (!s.message.action) cover.append(footer([[t('Revenir au menu'), s.nav.exit]]));
  }
  // Constat bref (configuration de la borne changée, mise à jour installée) : il s'efface seul.
  // Un écran plein le recouvrirait : il passe alors dans son flux, sous la marque, au-dessus du titre.
  if (s.banner && cover) (cover.querySelector('.lib-head') ?? cover).prepend(el('div', 'banner banner-inline', s.banner));
  else if (s.banner) nodes.splice(1, 0, el('div', 'banner', s.banner));
  if (cover) {
    cover.prepend(brand());
    nodes.push(cover);
  } else nodes.unshift(brand());
  placeChildren(nodes);
  revealSelection();
}

/** Repli minimal d'un écran annexe (sans fallback.js) : le titre de la table sur fond noir. */
function minimalCard(part, card) {
  const box = el('section', `secondary ${part}`);
  if (part === 'topper') {
    box.append(brand('title'));
  } else if (card?.title) {
    const title = el('div', 'title', card.title);
    title.dataset.fit = '';
    box.append(title);
    const subtitle = [card.manufacturer, card.year].filter(Boolean).join(' · ');
    if (subtitle) box.append(el('div', 'subtitle', subtitle));
  }
  return box;
}

/** Repli minimal pendant la partie : le titre en discret, en bas de l'écran. */
function gameCard(card) {
  const box = el('section', 'game');
  if (card?.title) box.append(el('div', 'game-title', card.title));
  return box;
}

// Sans fallback.js, le fond du playfield reste noir : le titre est déjà dans le menu.
const layerOptions = (part) => ({ minimal: (view) => (part === 'playfield' ? undefined : minimalCard(part, view.card)), inGame: (view) => gameCard(view.card) });

/**
 * Fond du playfield : son média en `cover`, tourné d'après le bord des flippers, sous la
 * liste du menu. Hors de la racine pivotée : la rotation du média se compte dans le repère
 * de l'écran (comme les incrustations).
 */
const background = role === 'playfield' ? CyberMedia.layer(document.getElementById('media-bg'), { ...layerOptions('playfield'), className: 'background' }) : undefined;
if (background) CyberMenuAudio.attachVideo(background);

/**
 * Chaque rôle annexe dans sa zone de l'écran, avec sa couche de média. Les zones sont
 * créées une fois (elles viennent de l'URL) : une vidéo n'est jamais recréée par un
 * nouvel état.
 */
const zones = parts.map((p) => {
  const zone = el('div', `zone zone-${p.role}`);
  zone.style.left = `${p.zone.x * 100}%`;
  zone.style.top = `${p.zone.y * 100}%`;
  zone.style.width = `${p.zone.width * 100}%`;
  zone.style.height = `${p.zone.height * 100}%`;
  zoneLayer.append(zone);
  return { role: p.role, layer: CyberMedia.layer(zone, layerOptions(p.role)) };
});

/** Média du rôle pour la table choisie ; sans table, seul le topper garde son repli. */
function viewOf(s, part) {
  const view = s.medias?.[part];
  if (view) return view;
  return part === 'topper' ? { role: 'topper', type: 'Topper', source: 'fallback', fallback: 'topper-logo', fit: 'contain', rotation: 0, card: {} } : undefined;
}

function renderZones(s) {
  for (const z of zones) {
    z.layer.show(viewOf(s, z.role));
    z.layer.setActive(true);
  }
}

/**
 * Fond de partie : ce que montre l'écran derrière VPX, et seul quand VPX ne l'occupe pas
 * (topper, backglass sans .directb2s, DMD absent). Lecture de chaque rôle décidée par le
 * processus principal (momentScreen) : la première image du média, figée (par défaut, et
 * toujours pour le playfield et les écrans que VPX occupe) ; le média animé ; ou du noir
 * avec le titre en discret.
 */
function renderGame(s) {
  const game = s.game;
  dropLoadingFallback();
  document.documentElement.classList.remove('loading-video');
  const show = (layer, part) => {
    const view = game.medias?.[part] ?? viewOf(s, part);
    const play = game.play?.[part] ?? (game.mode === 'off' ? 'off' : 'still');
    if (play === 'off' || !view) return layer.show(undefined);
    const still = play !== 'animated';
    layer.show(view, { still, game: !view.url });
    layer.setActive(!still);
  };
  if (background) show(background, 'playfield');
  for (const z of zones) show(z.layer, z.role);
  // Éteints : du noir et le titre en discret, sans les zones par-dessus.
  zoneLayer.classList.toggle('off', game.mode === 'off');
  root.replaceChildren(...(game.mode === 'off' ? [gameCard(game.table)] : []));
}

/** Le fond du playfield ne joue que s'il se voit : les superpositions et la fiche sont opaques. */
function backgroundVisible(s) {
  return s.phase === 'menu' && !s.help;
}

/** Dernier état reçu, pour le relevé des essais sans opérateur (cyberEtat). */
let lastState;

/** Ce que montre cette fenêtre, relevé par l'autopilote après chaque étape (library.ts). */
window.cyberEtat = () => ({
  phase: lastState?.phase,
  position: lastState?.position,
  attente: lastState?.attract?.title,
  // Gestion des tables (fiche, prospectus et règles, médias du jeu) : l'écran et la page montrés.
  fiche: lastState?.library && {
    ecran: lastState.library.screen,
    titre: lastState.library.heading,
    sousTitre: lastState.library.subheading,
    page: lastState.library.pages && { numero: lastState.library.pages.index + 1, sur: lastState.library.pages.count, element: lastState.library.pages.page?.kind ?? 'repli', repli: lastState.library.pages.fallback },
  },
  couches: [...(background ? [['playfield', background]] : []), ...zones.map((z) => [z.role, z.layer])].map(([part, layer]) => ({ role: part, ...layer.state() })),
});

window.cyber.onState((s) => {
  lastState = s;
  document.documentElement.classList.toggle('in-game', Boolean(s.game));
  CyberMedia.preload(s.preload);
  // Son du menu (playfield seulement) : musique, son de lancement, son de la vidéo du plateau.
  if (role === 'playfield') {
    CyberMenuAudio.update(s.sound);
    background.setVolume(s.sound?.video ?? 0);
  }
  // Fond de partie dès que la fenêtre de jeu de VPX s'affiche ; avant, au chargement, chaque
  // écran garde les médias du jeu (le playfield, sa vidéo de chargement et les commandes).
  if (s.game) return renderGame(s);
  dropLoadingFallback();
  document.documentElement.classList.toggle('attract-mode', Boolean(s.attract));
  zoneLayer.classList.remove('off');
  if (role === 'playfield') {
    const loadingVideo = s.phase === 'loading' && s.loading?.url ? s.loading : undefined;
    const backdrop = loadingVideo ?? viewOf(s, 'playfield');
    // Média en fond : la liste prend un fond translucide pour rester lisible ; la vidéo de
    // chargement reste pleine, sous le bandeau des commandes.
    document.documentElement.classList.toggle('has-backdrop', Boolean(backdrop?.url));
    document.documentElement.classList.toggle('loading-video', Boolean(loadingVideo));
    renderPlayfield(s);
    background.show(backdrop);
    background.setActive(Boolean(loadingVideo) || backgroundVisible(s));
  } else root.replaceChildren();
  renderZones(s);
});
window.cyber.ready();
