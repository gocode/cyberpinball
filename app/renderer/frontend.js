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
// Écran sans playfield (fronton, DMD, topper) : du noir hors des zones, comme le panneau d'une
// borne autour de la découpe du DMD, jamais le fond d'ambiance du menu (frontend.css).
document.documentElement.classList.toggle('annex', role !== 'playfield');

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
  node.append(face);
  const item = { node, face, hit, tilt, ratio: 1, offset: n.offset };
  fillWheelItem(item, n);
  return item;
}

/**
 * Contenu d'une place de la roue : le logo de la table, sinon son titre. Rappelé quand le
 * logo ou le titre change pour une table déjà dans la roue (média ajouté, remplacé ou
 * supprimé, table renommée : l'adresse du logo change avec le fichier, mediaUrl) ; la place
 * ne bouge pas, et l'ancien contenu reste jusqu'à ce que le nouveau logo soit prêt.
 */
function fillWheelItem(item, n) {
  item.wheel = n.wheel;
  item.title = n.title;
  const { node, tilt } = item;
  const current = () => item.wheel === n.wheel && item.title === n.title;
  const place = () => {
    if (wheelView) placeWheelItem(item, wheelView.style);
  };
  const named = () => {
    if (!current()) return;
    tilt.replaceChildren(el('div', 'wheel-name', n.title));
    node.classList.add('disc');
    item.ratio = 1;
    place();
  };
  const logo = CyberMedia.logo(n.wheel)?.cloneNode();
  if (!logo) return named();
  logo.className = 'wheel-img';
  const shown = () => {
    if (!current() || !logo.naturalWidth) return;
    if (tilt.firstChild !== logo || tilt.childNodes.length > 1) tilt.replaceChildren(logo);
    item.ratio = logo.naturalWidth / logo.naturalHeight;
    // Logo qui n'est pas un médaillon carré (large, détouré) : posé sur un disque.
    node.classList.toggle('disc', item.ratio > 1.25 || item.ratio < 0.8);
    place();
  };
  // Place neuve : le logo y est posé tout de suite, mesuré une fois chargé.
  if (!tilt.firstChild) tilt.append(logo);
  if (logo.complete && logo.naturalWidth) shown();
  else {
    logo.addEventListener('load', shown, { once: true });
    logo.addEventListener('error', named, { once: true });
  }
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
    // Table restée dans la roue dont le logo ou le titre a changé : contenu refait sur place.
    if (item.wheel !== n.wheel || item.title !== n.title) fillWheelItem(item, n);
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
  const changed = document.documentElement.classList.contains('menu-desktop') !== desktop;
  document.documentElement.classList.toggle('menu-desktop', desktop);
  document.documentElement.classList.toggle('menu-cab', !desktop);
  return changed;
}
// L'écran de chargement n'a pas la même composition en borne et au bureau : il est refait.
new ResizeObserver(() => syncMenuShape() && lastState?.phase === 'loading' && !lastState.game && role === 'playfield' && renderPlayfield(lastState)).observe(root);
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
 * Média de chargement absent : l'écran de chargement de secours (fallback.js : marque, titre,
 * fabricant, année, barre d'attente), à la place du média, sans libellé ni commandes ; `slot`
 * reçoit l'aide-mémoire du réglage de l'affichage en borne. Sans fallback.js, rien : le fond
 * du playfield reste sombre.
 */
function loadingStandIn(s, className, slot) {
  const kit = window.CyberFallback;
  if (typeof kit?.loading !== 'function') {
    dropLoadingFallback();
    return undefined;
  }
  const key = JSON.stringify([className, s.table.title, s.table.manufacturer, s.table.year, slot ? s.loadingKeys : null]);
  if (loadingFallback?.key !== key) {
    dropLoadingFallback();
    const box = el('section', `loading-fallback ${className}`);
    const handle = kit.loading(box, { title: s.table.title, manufacturer: s.table.manufacturer, year: s.table.year }, { label: false });
    if (slot) handle.slot?.append(slot);
    loadingFallback = { key, box, handle };
  }
  return loadingFallback.box;
}

/**
 * Encart du chargement au bureau, à droite du cadre du média : titre, fabricant · année,
 * l'état avec sa barre d'attente, puis les commandes de la partie (ou les boutons du menu de
 * VPX pour le réglage de l'affichage). Mêmes marges que le cadre, même hauteur ; les
 * commandes passent sur une colonne quand l'encart est étroit, et rapetissent s'il le faut
 * pour tenir sans être rognées (fitLoadingCard).
 */
function loadingCard(s) {
  const card = el('section', 'loading-card');
  const title = el('h1', 'loading-title', s.table.title);
  title.dataset.size = titleSize(s.table.title);
  const head = el('div', 'loading-head');
  head.append(title);
  if (s.table.subtitle) head.append(el('div', 'loading-meta', s.table.subtitle));
  const state = el('div', 'loading-state');
  const bar = el('div', 'loading-bar');
  bar.append(el('div', 'loading-run'));
  state.append(el('span', '', t('Chargement de la table…')), bar);
  card.append(head, state, keysGrid(s.loadingKeys.title, s.loadingKeys.rows));
  return card;
}

/**
 * Commandes de l'encart, sans rien rogner, au plus lisible qui tienne : deux colonnes sans
 * couper une touche sur deux lignes, sinon une colonne, sinon deux colonnes aux touches
 * coupées, le corps de 24 à 20 (plancher du design system) ; puis l'encart compact (marges et
 * titre réduits). En dernier recours seulement, sous le plancher (jusqu'à 15) : une commande
 * plus petite vaut mieux qu'une commande cachée.
 */
function fitLoadingCard(card) {
  const list = card?.isConnected && card.querySelector('.game-keys-list');
  if (!list) return;
  const rows = [...list.children];
  const fits = () => card.scrollHeight <= card.clientHeight + 1;
  // Un libellé ou une touche sur plus d'une ligne : plus haut qu'une fois et demie son interligne.
  const wraps = () => rows.some((row) => [...row.children].some((cell) => cell.offsetHeight > parseFloat(getComputedStyle(cell).lineHeight) * 1.5));
  const legible = [1, 0.917, 0.833];
  const tries = [
    ...legible.map((k) => [false, 2, k, false]),
    ...legible.map((k) => [false, 1, k, true]),
    ...legible.map((k) => [false, 2, k, true]),
    ...legible.map((k) => [true, 1, k, true]),
    [true, 2, 0.833, true],
    ...[0.75, 0.7, 0.65].map((k) => [true, 1, k, true]),
    [true, 2, 0.65, true],
  ];
  for (const [compact, columns, scale, wrapped] of tries) {
    card.classList.toggle('compact', compact);
    list.dataset.columns = String(columns);
    card.style.setProperty('--keys-scale', String(scale));
    // Deux colonnes trop étroites (encart étroit) : la grille n'en garde qu'une.
    if (columns === 2 && (getComputedStyle(list).gridTemplateColumns ?? '').split(' ').length < 2) continue;
    if (fits() && (wrapped || !wraps())) return;
  }
}

const refitLoadingCard = () => fitLoadingCard(root.querySelector('.loading-card'));
new ResizeObserver(refitLoadingCard).observe(root);
document.fonts?.addEventListener('loadingdone', refitLoadingCard);

/**
 * Chargement d'une table, sur le playfield. En borne, le média de chargement du jeu (Loading)
 * prend tout l'écran, seul : ni titre, ni état, ni commandes (le réglage de l'affichage garde
 * son aide-mémoire, les boutons du menu de VPX) ; sans média, l'écran de chargement de
 * secours. Au bureau, le média (ou son repli) dans le cadre 9:16 du menu, l'encart du titre
 * et des commandes à sa droite (loadingCard), la marque à sa place.
 */
function loadingScreen(s) {
  const desktop = document.documentElement.classList.contains('menu-desktop');
  if (desktop) {
    const nodes = [brand(), loadingCard(s)];
    if (!s.loading?.url) {
      const standIn = loadingStandIn(s, 'in-frame');
      if (standIn) nodes.unshift(standIn);
    } else dropLoadingFallback();
    return nodes;
  }
  // Réglage de l'affichage : les boutons du menu de VPX restent lisibles, sur le média.
  const reminder = s.loadingKeys.display ? keysGrid(s.loadingKeys.title, s.loadingKeys.rows) : undefined;
  reminder?.classList.add('display-reminder');
  const standIn = s.loading?.url ? dropLoadingFallback() : loadingStandIn(s, 'full', reminder);
  if (standIn) return [standIn];
  if (!reminder) return [];
  const o = el('section', 'loading-reminder');
  const panel = el('div', 'loading-panel');
  panel.append(reminder);
  o.append(panel);
  return [o];
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
  // Préavis d'arrêt (couche #stop, en bas du plateau) : l'écran d'attente lui laisse sa place.
  const box = el('section', s.stop ? 'attract has-stop' : 'attract');
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
  box.append(brand(), middle);
  // Pendant le préavis d'arrêt de l'horaire, sa propre invite seule : pas deux consignes à la fois.
  if (!s.stop) box.append(el('div', 'attract-hint', t('Appuyez sur un bouton pour revenir au menu')));
  return box;
}

/**
 * Mode invité : le cadenas et le mot « Invité » dans le coin, à la place de la roue dentée. Une
 * porte fermée (Exit, Tab, clic sur le cadenas, fichiers glissés…) remplace le mot par la pastille
 * « Verrouillé · mode invité » quelques secondes ; la combinaison tenue remplit l'anneau du
 * cadenas. Rien n'y dit la combinaison : seul l'écran de l'entrée « Mode invité » la montre.
 * Juste après le déverrouillage, un cadenas ouvert et « Mode invité désactivé », puis la roue.
 */
function guestLock(g) {
  const box = el('div', `guest-lock${g.hint ? ' knocked' : ''}${g.unlocking ? ' unlocking' : ''}${g.active ? '' : ' unlocked'}`);
  // Un clic frappe à la porte du menu système : le processus principal répond par l'indice.
  if (g.active) box.dataset.act = JSON.stringify({ type: 'config' });
  const label = g.hint ?? (g.unlocking ? t('Déverrouillage…') : g.active ? t('Invité') : t('Mode invité désactivé'));
  box.append(el('span', g.hint || !g.active ? 'guest-lock-pill' : 'guest-lock-label', label));
  const glyph = el('span', 'guest-lock-glyph');
  glyph.append(cyberIcon(g.active ? 'lock' : 'unlock', 'guest-lock-icon'));
  if (g.unlocking) {
    // L'anneau reprend où il en est à chaque rendu : délai négatif du temps déjà tenu.
    glyph.style.setProperty('--unlock-ms', `${g.unlocking.ms}ms`);
    glyph.style.setProperty('--unlock-delay', `${-Math.max(0, Date.now() - g.unlocking.since)}ms`);
  }
  box.append(glyph);
  return box;
}

/** Roue dentée : menu et configuration à la souris (ou Tab), même si les boutons de la borne ne répondent plus comme prévu. */
function gearButton(s) {
  // Toujours au-dessus des superpositions.
  const gear = el('button', 'gear');
  gear.append(cyberIcon('gear'));
  gear.title = t('Menu système (Tab)');
  gear.dataset.act = JSON.stringify({ type: 'config' });
  // Pastille rouge : une entrée du menu système attend l'utilisateur (mise à jour disponible…).
  if (s.attention) {
    gear.classList.add('has-attention');
    gear.title = t('Menu système (Tab) : un élément attend votre intervention');
    gear.append(el('span', 'gear-dot'));
  }
  return gear;
}

/**
 * Chaque état redessine l'écran ; les listes qui défilent restent où elles étaient
 * (library.js, revealSelection). L'écran est nommé par ce qu'il montre : un autre repart du haut.
 */
function renderPlayfield(s) {
  menuScroll.capture(root);
  drawPlayfield(s);
  const l = s.phase === 'library' ? s.library : undefined;
  revealSelection(root, l ? ['library', l.screen, l.variant ?? '', l.heading].join('|') : s.attract ? 'attract' : s.phase);
}

function drawPlayfield(s) {
  // Mode attente : la table tirée au hasard, sans la liste du menu.
  if (s.attract) {
    dropLoadingFallback();
    root.replaceChildren(attractScreen(s));
    return;
  }
  dropAttractLogo();
  // Chargement : rien du menu dessous.
  if (s.phase === 'loading' && s.table) {
    root.replaceChildren(...loadingScreen(s));
    fitLoadingCard(root.querySelector('.loading-card'));
    return;
  }
  dropLoadingFallback();
  const nodes = [];
  // Extinction, veille ou redémarrage en cours : plus rien à choisir, ni roue dentée ni cadenas.
  // Mode invité : le cadenas prend la place de la roue dentée, le menu système est fermé.
  if (!(s.phase === 'message' && s.message?.action === 'power')) nodes.push(s.guest ? guestLock(s.guest) : gearButton(s));

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
    // Exit seul dans le badge : le nom du bouton de l'aide (« Bouton 14 du joystick ») n'y tient pas ; il ferme aussi.
    cover.append(keys, footer([[t('Exit : fermer'), s.nav.exit]]));
  } else if (s.phase === 'confirmQuit') {
    cover = el('section', 'overlay');
    cover.append(el('h1', '', t('Quitter Cyber Pinball ?')), el('div', 'lead', t('Start : quitter · Exit : rester')));
  } else if (s.phase === 'message' && s.message) {
    cover = el('section', s.message.action === 'power' ? 'overlay power' : 'overlay');
    cover.append(el('h1', '', s.message.title));
    const box = el('div', 'message');
    for (const line of s.message.lines) box.append(el('p', /^\d{4}-\d\d-\d\d /.test(line) ? 'log' : '', line));
    cover.append(box);
    if (s.message.action === 'addTable') cover.append(footer([[t('Ajouter une table'), s.nav.confirm], [t('Menu'), s.nav.exit]]));
    // Partie échouée : Start mène au parcours « Ce qu'il manque pour jouer » (clic compris).
    else if (s.message.action === 'journey') cover.append(footer([[t('Start : voir ce qu’il manque pour jouer'), s.nav.confirm], [t('Exit : revenir au menu'), s.nav.exit]]));
    else if (!s.message.action) cover.append(footer([[t('Revenir au menu'), s.nav.exit]]));
  }
  // Constat bref (configuration de la borne changée, mise à jour installée) : il s'efface seul.
  // Un écran plein le recouvrirait : il passe alors dans son flux, sous la marque, au-dessus du titre.
  if (s.banner && cover) (cover.querySelector('.lib-head') ?? cover).prepend(el('div', 'banner banner-inline', s.banner));
  // Au menu des tables, en dernier : ni le menu ni son voile ne le recouvrent (frontend.css, .banner).
  else if (s.banner) nodes.push(el('div', 'banner', s.banner));
  if (cover) {
    // L'écran noir de l'extinction ne porte que son message.
    if (!cover.classList.contains('power')) cover.prepend(brand());
    nodes.push(cover);
  } else nodes.unshift(brand());
  placeChildren(nodes);
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
  return { role: p.role, node: zone, layer: CyberMedia.layer(zone, layerOptions(p.role)) };
});

/**
 * DMD du menu vivant (app/src/live-dmd.ts) : le processus principal envoie chaque image
 * changée de l'afficheur (128 × 32 nuances), ou « le média » quand c'est au tour du média DMD
 * de la table. L'afficheur se pose sur la zone du DMD, à la place dite par l'état (liveDmd :
 * dans le cadre du média FullDMD, ou la bande 4:1 sur du noir). Sans liveDmd (DMD classique,
 * partie en cours), il disparaît et la zone montre son média comme avant.
 */
const dmdZone = zones.find((z) => z.role === 'dmd');
let liveDmd;
/** Dernière image reçue : elle peut arriver avant l'état qui crée l'afficheur. */
let lastDmdShot;

function dropLiveDmd() {
  liveDmd?.matrix.destroy();
  liveDmd?.holder.remove();
  liveDmd = undefined;
}

/** La vidéo de la zone ne joue que si elle se voit : pas sous l'afficheur posé sur du noir. */
function dmdMediaActive() {
  return !liveDmd || liveDmd.framed || liveDmd.holder.hidden;
}

function syncLiveDmd(spec) {
  if (!dmdZone || !spec || typeof window.CyberFallback?.dotMatrix !== 'function') return dropLiveDmd();
  if (!liveDmd) {
    const holder = el('div', 'live-dmd');
    const box = el('div', 'live-dmd-dots');
    holder.append(box);
    dmdZone.node.append(holder);
    liveDmd = { holder, box, matrix: CyberFallback.dotMatrix(box, {}) };
    if (lastDmdShot) showDmdShot(lastDmdShot);
  }
  liveDmd.framed = spec.framed;
  liveDmd.holder.classList.toggle('framed', spec.framed);
  const a = spec.area;
  Object.assign(liveDmd.box.style, { left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.width * 100}%`, height: `${a.height * 100}%` });
}

function showDmdShot(shot) {
  lastDmdShot = shot;
  if (!liveDmd) return;
  liveDmd.holder.hidden = Boolean(shot.media);
  if (!shot.media && shot.dots) liveDmd.matrix.show(shot.dots);
  dmdZone.layer.setActive(dmdMediaActive());
}

window.cyber.onDmd?.(showDmdShot);

// ---------- Lancement en cinéma (cinema.ts, frontend.css) ----------

/**
 * Au Start d'une partie, l'état apporte la part de cette fenêtre (s.cinema) : le plateau, d'où
 * le logo s'allume et s'envole (#cinema, tourné comme la racine), et le fronton, où il se pose
 * (sa zone). La couche est posée une fois par lancement, à l'heure du Start (--cine-elapsed) :
 * la feuille de style fait le reste, sans rien demander au processus principal. Quand la
 * fenêtre de jeu de VPX paraît (s.game), elle s'efface en CINEMA_FADE_MS ; tout autre état
 * (échec, retour au menu) la retire aussitôt. Un lancement fini ne se rejoue jamais.
 */
const CINEMA_FADE_MS = 240;
const cinemaLayer = document.getElementById('cinema');
const backglassZone = zones.find((z) => z.role === 'backglass');
/** Couches posées pour le lancement en cours : { id, stages }. */
let cinemaShown;
/** Dernier lancement passé à VPX : ses états tardifs ne reposent pas la couche. */
let cinemaEnded;

/** Logo du jeu ; sans logo lisible, le médaillon de la roue avec le titre. */
function cinemaFace(view) {
  const disc = () => {
    const d = el('div', 'cine-disc');
    d.append(el('div', 'cine-disc-title', view.title));
    return d;
  };
  const logo = CyberMedia.logo(view.logo)?.cloneNode();
  if (!logo) return disc();
  logo.className = 'cine-img';
  logo.addEventListener('error', () => logo.replaceWith(disc()), { once: true });
  return logo;
}

/** Une scène de la chorégraphie : « depart » (plateau) ou « arrivee » (fronton), posée à l'heure du Start. */
function cinemaStage(view, part) {
  const stage = el('div', `cinema cinema-${part}`);
  stage.dataset.cinema = part;
  stage.style.setProperty('--cine-elapsed', String(Math.max(0, Date.now() - view.startedAt)));
  if (part === 'arrivee') stage.append(el('div', 'cine-scrim'));
  const flight = el('div', 'cine-flight');
  const logo = el('div', 'cine-logo');
  logo.append(cinemaFace(view));
  const ring = el('div', 'cine-ring');
  if (part === 'depart') {
    // Le recul de l'armement est porté à part : l'allumage et l'envol ne se recouvrent pas.
    const arm = el('div', 'cine-arm');
    arm.append(logo);
    flight.append(el('div', 'cine-trail'), arm, ring);
  } else flight.append(el('div', 'cine-trail'), logo, ring);
  stage.append(flight);
  return stage;
}

function dropCinema() {
  for (const stage of cinemaShown?.stages ?? []) {
    clearTimeout(stage.fade);
    stage.node.remove();
  }
  cinemaShown = undefined;
}

function syncCinema(s) {
  const view = s.cinema;
  if (view && view.id !== cinemaEnded) {
    if (cinemaShown?.id === view.id) return;
    dropCinema();
    const stages = [];
    if (view.depart && cinemaLayer) stages.push({ node: cinemaLayer.appendChild(cinemaStage(view, 'depart')) });
    if (view.arrivee && backglassZone) stages.push({ node: backglassZone.node.appendChild(cinemaStage(view, 'arrivee')) });
    cinemaShown = { id: view.id, stages };
    return;
  }
  if (!cinemaShown) return;
  if (!s.game) return dropCinema();
  // VPX a la main : fondu, puis la couche part ; ce lancement ne se rejoue plus.
  cinemaEnded = cinemaShown.id;
  for (const stage of cinemaShown.stages) {
    if (stage.fade) continue;
    stage.node.classList.add('cine-fin');
    stage.fade = setTimeout(() => stage.node.remove(), CINEMA_FADE_MS);
  }
}

/** Média du rôle pour la table choisie ; sans table, seul le topper garde son repli. */
function viewOf(s, part) {
  const view = s.medias?.[part];
  if (view) return view;
  return part === 'topper' ? { role: 'topper', type: 'Topper', source: 'fallback', fallback: 'topper-logo', fit: 'contain', rotation: 0, card: {} } : undefined;
}

function renderZones(s) {
  for (const z of zones) {
    z.layer.show(viewOf(s, z.role));
    z.layer.setActive(z !== dmdZone || dmdMediaActive());
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
  document.documentElement.classList.remove('loading-phase');
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
  // Éteints : du noir et le titre en discret, sans les zones par-dessus. Un FullDMD habillé
  // (le DMD de VPX dans le cadre de son média) garde son habillage : il fait partie de l'afficheur.
  const parts = [...(background ? ['playfield'] : []), ...zones.map((z) => z.role)];
  const off = parts.every((part) => (game.play?.[part] ?? (game.mode === 'off' ? 'off' : 'still')) === 'off');
  zoneLayer.classList.toggle('off', off);
  root.replaceChildren(...(off ? [gameCard(game.table)] : []));
}

/** Le fond du playfield ne joue que s'il se voit : les superpositions et la fiche sont opaques. */
function backgroundVisible(s) {
  return s.phase === 'menu' && !s.help;
}

// ---------- Horaire de la borne (arcadehours.ts, frontend.css) ----------

const nightVeil = document.getElementById('night-veil');
const stopLayer = document.getElementById('stop');
/** Durée de la descente du voile (frontend.css, .night-veil.on). */
const VEIL_MS = 4000;
/** Écrans noirs : passé la descente du voile, les médias s'arrêtent (rien ne tourne pour rien). */
let veilOpaque = false;
let veilTimer;

/**
 * Voile de nuit (s.night, 0 à 1) : sur toute la fenêtre, en attente. Il descend lentement, se
 * lève d'un coup. À 1 (écrans noirs), une fois opaque, les médias de la fenêtre s'arrêtent.
 */
function syncNight(s) {
  const level = s.game ? 0 : s.night ?? 0;
  nightVeil.style.setProperty('--night', String(level));
  nightVeil.classList.toggle('lowered', level > 0);
  if (level < 1) {
    clearTimeout(veilTimer);
    veilTimer = undefined;
    veilOpaque = false;
  } else if (!veilOpaque && !veilTimer) {
    veilTimer = setTimeout(() => {
      veilTimer = undefined;
      veilOpaque = true;
      pauseUnderVeil();
    }, VEIL_MS);
  }
}

/** Écrans noirs : vidéos et sons des médias arrêtés sous le voile opaque. */
function pauseUnderVeil() {
  if (!veilOpaque) return;
  background?.setActive(false);
  for (const z of zones) z.layer.setActive(false);
}

/** Préavis en cours : clé (heure de l'arrêt), élément du nombre, minuterie du compte. */
let stopShown;

function dropStop() {
  if (!stopShown) return;
  clearInterval(stopShown.timer);
  stopShown = undefined;
  stopLayer.replaceChildren();
}

/**
 * Préavis d'arrêt (s.stop), dessiné par le playfield au-dessus du voile : ce qui va arriver, le
 * temps restant, comment l'éviter. Nombre et jauge suivent la même échéance (s.stop.endsAt) ;
 * rien ici ne commande l'arrêt, décidé par le processus principal.
 */
function syncStop(s) {
  const stop = role === 'playfield' && !s.game && s.stop;
  if (!stop) return dropStop();
  const key = `${stop.action}:${stop.endsAt}`;
  if (stopShown?.key === key) return;
  dropStop();
  const box = el('div', 'stop-notice');
  box.append(
    cyberIcon(stop.action === 'sleep' ? 'moon' : 'power', 'stop-notice-icon'),
    el('div', 'stop-notice-label', stop.action === 'sleep' ? t('Mise en veille dans') : t('Extinction dans')),
  );
  const count = el('div', 'stop-notice-count');
  const bar = el('div', 'stop-notice-bar');
  bar.style.setProperty('--stop-ms', `${stop.ms}ms`);
  bar.style.setProperty('--stop-delay', `${-Math.max(0, stop.ms - (stop.endsAt - Date.now()))}ms`);
  box.append(count, bar, el('div', 'stop-notice-hint', t('Appuyez sur un bouton pour garder la borne allumée')));
  const tick = () => {
    const seconds = Math.max(0, Math.ceil((stop.endsAt - Date.now()) / 1000));
    count.replaceChildren(String(seconds), el('small', '', t('s')));
  };
  tick();
  stopLayer.replaceChildren(box);
  stopShown = { key, timer: setInterval(tick, 250) };
}

/** Dernier état reçu, pour le relevé des essais sans opérateur (cyberEtat). */
let lastState;

/** Ce que montre cette fenêtre, relevé par l'autopilote après chaque étape (library.ts). */
window.cyberEtat = () => ({
  phase: lastState?.phase,
  position: lastState?.position,
  attente: lastState?.attract?.title,
  // Horaire : voile de nuit (opacité) et préavis d'arrêt affiché (action, secondes restantes).
  nuit: lastState?.night ?? 0,
  preavis: stopShown ? { action: lastState?.stop?.action, secondes: Number(stopLayer.querySelector('.stop-notice-count')?.firstChild?.textContent) } : undefined,
  // Titre de l'aide-mémoire du chargement : commandes de la partie, ou réglage de l'affichage.
  commandes: lastState?.phase === 'loading' ? lastState.loadingKeys?.title : undefined,
  // Gestion des tables (fiche, prospectus et règles, médias du jeu) : l'écran et la page montrés.
  fiche: lastState?.library && {
    ecran: lastState.library.screen,
    titre: lastState.library.heading,
    sousTitre: lastState.library.subheading,
    page: lastState.library.pages && { numero: lastState.library.pages.index + 1, sur: lastState.library.pages.count, element: lastState.library.pages.page?.kind ?? 'repli', repli: lastState.library.pages.fallback },
  },
  tables: lastState?.count,
  // Roue du menu : chaque place, le logo affiché (fichier et version de son adresse) ou le titre.
  roue: [...document.querySelectorAll('.wheel-item')].map((n) => {
    const img = n.querySelector('img.wheel-img');
    return img ? decodeURIComponent(img.getAttribute('src')).replace(/^.*[\\/]/, '') : `titre : ${n.textContent}`; // i18n-ignore : relevé des essais
  }),
  // DMD du menu vivant : affiché ou non (page du média), dans le cadre du FullDMD ou sur du noir, points allumés.
  dmd: liveDmd && { visible: !liveDmd.holder.hidden, cadre: Boolean(liveDmd.framed), points: lastDmdShot?.dots ? lastDmdShot.dots.filter((v) => v > 0).length : 0 },
  // Lancement en cinéma : les scènes posées (départ, arrivée), le logo ou le médaillon, et si elles s'effacent.
  cinema: [...document.querySelectorAll('.cinema')].map((n) => ({ scene: n.dataset.cinema, visage: n.querySelector('.cine-disc') ? 'médaillon' : 'logo', fin: n.classList.contains('cine-fin') })), // i18n-ignore : relevé des essais
  couches: [...(background ? [['playfield', background]] : []), ...zones.map((z) => [z.role, z.layer])].map(([part, layer]) => ({ role: part, ...layer.state() })),
});

window.cyber.onState((s) => {
  lastState = s;
  document.documentElement.classList.toggle('in-game', Boolean(s.game));
  CyberMedia.preload(s.preload);
  // Sons de l'interface : muets pendant la partie, même si un ordre de jouer arrivait.
  window.CyberUiSounds?.setPhase(s.phase);
  // Son du menu (playfield seulement) : musique, son de lancement, son de la vidéo du plateau.
  if (role === 'playfield') {
    CyberMenuAudio.update(s.sound);
    background.setVolume(s.sound?.video ?? 0);
  }
  // Fond de partie dès que la fenêtre de jeu de VPX s'affiche ; avant, au chargement, chaque
  // écran garde les médias du jeu (le playfield, sa vidéo de chargement et les commandes).
  // L'écran de chargement de secours reste d'un état à l'autre (renderPlayfield le quitte).
  // Couleur réglée des points (DMD du menu et replis) : avant l'afficheur, qui naît à la bonne couleur ;
  // le jeton --dmd sert au repli minimal, sans fallback.js.
  window.CyberFallback?.setDmdColor?.(s.dmdColor);
  if (s.dmdColor) document.documentElement.style.setProperty('--dmd', s.dmdColor);
  syncLiveDmd(s.game ? undefined : s.liveDmd);
  // Lancement en cinéma : posé au Start, effacé quand VPX paraît (avant le fond de partie).
  syncCinema(s);
  // Horaire : voile de nuit et préavis d'arrêt, levés pendant la partie et pour l'écran noir de l'arrêt.
  const powering = s.phase === 'message' && s.message?.action === 'power';
  syncNight(powering ? { ...s, night: 0 } : s);
  syncStop(powering ? { ...s, stop: undefined } : s);
  if (s.game) return renderGame(s);
  // Extinction, veille ou redémarrage : du noir sur chaque écran, sans média ni décor ; le
  // playfield seul dit ce qui se passe (frontend.css, html.power-phase).
  const power = s.phase === 'message' && s.message?.action === 'power';
  document.documentElement.classList.toggle('power-phase', power);
  if (power) {
    zoneLayer.classList.add('off');
    if (role !== 'playfield') return root.replaceChildren();
    background.show(undefined);
    return renderPlayfield(s);
  }
  document.documentElement.classList.toggle('attract-mode', Boolean(s.attract));
  zoneLayer.classList.remove('off');
  if (role === 'playfield') {
    const loadingVideo = s.phase === 'loading' && s.loading?.url ? s.loading : undefined;
    const backdrop = loadingVideo ?? viewOf(s, 'playfield');
    // Média en fond : la liste prend un fond translucide pour rester lisible ; la vidéo de
    // chargement reste pleine, sans voile (plein écran en borne, dans le cadre au bureau).
    document.documentElement.classList.toggle('has-backdrop', Boolean(backdrop?.url));
    document.documentElement.classList.toggle('loading-video', Boolean(loadingVideo));
    // Écran de chargement (garde-fou de mise en page, layout-check.ts).
    document.documentElement.classList.toggle('loading-phase', s.phase === 'loading' && Boolean(s.table) && !s.attract);
    renderPlayfield(s);
    background.show(backdrop);
    background.setActive(Boolean(loadingVideo) || backgroundVisible(s));
  } else root.replaceChildren();
  renderZones(s);
  pauseUnderVeil();
});
window.cyber.ready();
