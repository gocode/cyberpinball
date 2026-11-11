// Page du téléphone qui pilote la borne (packages/core/src/remote.ts, app/src/phone-remote.ts).
// Deux modes, selon ce que la borne montre (body[data-mode]) :
// - browser, le navigateur intégré « Récupérer » : un pavé tactile, le clavier du téléphone quand un
//   champ de la page a le clavier, Retour, Avancer, Fermer ;
// - menu, le menu de Cyber Pinball, en quatre onglets en bas (body[data-view]) : Écran, les entrées de
//   l'écran ouvert à la borne, qu'on touche directement ; Menus, tous les menus rangés comme le menu
//   système, qu'on ouvre d'un toucher ; Communauté, les messages, les amis et les scores
//   (telephone-community.js, telephone-ranks.js), aussi pendant une partie ; Boutons, ceux de la
//   borne (Start, flippers, Exit, MagnaSave). Une seule barre en haut : ce que montre la borne, la
//   liaison, « Clavier » quand la borne attend une saisie, et le menu ⋮ (envoyer un fichier…). Et le
//   clavier du téléphone à la place du clavier à l'écran, l'envoi d'un fichier vers le dossier
//   d'import ; game pendant une partie (les boutons attendent le retour au menu, sauf dans les
//   réglages en partie, que la page peut ouvrir). Le téléphone n'envoie que des identifiants
//   (rang et version d'une entrée, identifiant d'un menu) : la borne vérifie tout (app/src/phone-remote.ts,
//   packages/core/src/remote-menus.ts). La clé vient du QR code, dans le fragment de l'adresse (#k=…) : le navigateur ne l'envoie
// jamais sur le réseau. Acceptée à la borne, la page la remplace par sa clé de session (#s=…), qui
// la laisse revenir après une coupure (page rechargée, écran verrouillé). Chaque message est scellé
// (telephone-core.js) et numéroté.
//
// Téléphone gardé (10/11/2026) : la borne garde la clé d'un téléphone accepté (ready, kept). La page
// la range dans le stockage du navigateur et dans son adresse (#g=…) : un raccourci sur l'écran
// d'accueil la porte (l'iPhone donne à ce raccourci un stockage à part), et le téléphone revient
// sans QR ni acceptation. Coupé (déconnecté à la borne, inactif, remplacé par un autre téléphone),
// il propose « Reprendre » ; Cyber Pinball fermé, il se reconnecte seul à son retour.
//
// Démonstration hors écran : window.cyberRemoteDemo fixe un état sans borne.
'use strict';

const core = window.cyberRemoteCore;
const $ = (id) => document.getElementById(id);

// --- Libellés et icônes ------------------------------------------------------

const TOOLS = {
  'nav-back': { icon: 'chevron-left', label: () => t('Retour') },
  'nav-forward': { icon: 'chevron-right', label: () => t('Avancer') },
  'nav-keyboard': { icon: 'keyboard', label: () => t('Clavier') },
  'nav-send': { icon: 'upload', label: () => t('Envoyer') },
  'nav-more': { icon: 'list', label: () => t('Plus') },
  'nav-close': { icon: 'close', label: () => t('Fermer') },
};
for (const [id, tool] of Object.entries(TOOLS)) {
  const b = $(id);
  const span = document.createElement('span');
  span.className = 'tool-label';
  span.textContent = tool.label();
  // Indisponible : la raison sous le libellé (« Après la partie »), jamais un outil caché.
  const reason = document.createElement('span');
  reason.className = 'tool-reason';
  b.replaceChildren(cyberIcon(tool.icon), span, reason);
}
$('key-backspace').replaceChildren(cyberIcon('backspace'));

/** Boutons de la borne, au menu : le nom du bouton, puis ce qu'il fait. */
const BUTTONS = {
  confirm: { icon: 'start', name: () => 'Start', what: () => t('Valider') },
  previous: { icon: 'flipper', name: () => t('Flipper gauche'), what: () => t('Précédent') },
  next: { icon: 'flipper', name: () => t('Flipper droit'), what: () => t('Suivant') },
  exit: { icon: 'exit', name: () => 'Exit', what: () => t('Retour') },
  zone: { icon: 'layers', name: () => 'MagnaSave', what: () => t('Liste / actions') },
};
for (const b of document.querySelectorAll('.btn')) {
  const def = BUTTONS[b.dataset.b];
  const text = document.createElement('span');
  text.className = 'btn-text';
  const name = document.createElement('span');
  name.className = 'btn-name';
  name.textContent = def.name();
  const what = document.createElement('span');
  what.className = 'btn-what';
  what.textContent = def.what();
  text.append(name, what);
  b.replaceChildren(cyberIcon(def.icon), text);
}
/** Onglets du menu, en bas : l'écran de la borne (ses entrées), tous les menus, la communauté, les boutons de la borne. */
const VIEWS = {
  list: { icon: 'monitor', label: () => t('Écran') },
  menus: { icon: 'gear', label: () => t('Menus') },
  jukebox: { icon: 'jukebox', label: () => t('Juke-box') },
  community: { icon: 'friends', label: () => t('Communauté') },
  buttons: { icon: 'gamepad', label: () => t('Boutons') },
};
/** Vues de la Communauté (un même onglet) : les messages, les amis, les scores ; et le fil d'un ami, plein écran. */
const COMMUNITY_VIEWS = ['messages', 'friends', 'ranks'];
const tabOf = (v) => (COMMUNITY_VIEWS.includes(v) || v === 'thread' ? 'community' : v === 'player' ? 'jukebox' : v);
for (const [name, def] of Object.entries(VIEWS)) {
  const tab = $(`tab-${name}`);
  const text = document.createElement('span');
  text.className = 'view-text';
  const label = document.createElement('span');
  label.className = 'view-label';
  label.textContent = def.label();
  // Indisponible (Menus pendant une partie) : la raison sous le libellé, l'onglet reste à sa place.
  const reason = document.createElement('span');
  reason.className = 'view-reason';
  text.append(label, reason);
  // L'icône dans sa pastille (pleine sur l'onglet choisi), et la pastille rouge d'un message non lu.
  const pill = document.createElement('span');
  pill.className = 'view-pill';
  pill.append(cyberIcon(def.icon));
  const dot = document.createElement('span');
  dot.className = 'view-dot';
  dot.hidden = true;
  pill.append(dot);
  tab.replaceChildren(pill, text);
  tab.addEventListener('click', () => setView(name === 'community' ? communityView : name));
}
$('top-more').replaceChildren(cyberIcon('list'));
$('top-more').setAttribute('aria-label', t('Plus'));
$('top-back').replaceChildren(cyberIcon('chevron-left'));
$('top-back').setAttribute('aria-label', t('Retour aux conversations'));
{
  const label = document.createElement('span');
  label.textContent = t('Clavier');
  $('top-keys').replaceChildren(cyberIcon('keyboard'), label);
}
$('views').setAttribute('aria-label', t('Vues de la télécommande'));
$('menus-up').replaceChildren(cyberIcon('chevron-left'));
$('menus-up').setAttribute('aria-label', t('Rubrique précédente'));
$('game-mark').replaceChildren(cyberIcon('play'));
$('key-backspace').setAttribute('aria-label', t('Effacer le caractère précédent'));
$('keys-hide').setAttribute('aria-label', t('Masquer le clavier'));
$('pad').setAttribute('aria-label', t('Pavé tactile'));

const FIELD_NAMES = {
  text: () => t('Texte'),
  password: () => t('Mot de passe masqué'),
  email: () => t('Adresse e-mail'),
  number: () => t('Nombre'),
  tel: () => t('Téléphone'),
  url: () => t('Adresse web'),
  search: () => t('Recherche'),
  multiline: () => t('Texte'),
};
const INPUT_MODES = { email: 'email', number: 'decimal', tel: 'tel', url: 'url', search: 'search' };

// --- États de la page --------------------------------------------------------

/**
 * Messages plein écran, par état ; `again` : l'état est final, rien ne
 * se reconnecte ; `icon` : le signe du registre au-dessus du titre.
 */
const MESSAGES = {
  connecting: { icon: 'network', title: () => t('Connexion à la borne…'), text: () => t('Le téléphone et la borne doivent être sur le même réseau local.') },
  waiting: { title: () => t('Comparez les codes'), text: () => t('Si ce code est aussi affiché sur la borne, appuyez sur Start pour accepter. Sinon, appuyez sur Exit pour refuser.') },
  lost: { icon: 'refresh', title: () => t('Reconnexion en cours…'), text: () => t('La liaison a été interrompue. Vérifiez le Wi-Fi du téléphone ; la reconnexion est automatique.') },
  refused: { icon: 'close', title: () => t('Connexion refusée'), text: () => t('La borne n’a pas accepté ce téléphone. Pour réessayer, scannez son nouveau QR code.'), again: true },
  expired: { icon: 'clock', title: () => t('QR code expiré'), text: () => t('Scannez le nouveau QR code affiché dans le bandeau de la borne.'), again: true },
  used: { icon: 'alert', title: () => t('QR code déjà utilisé'), text: () => t('Ce QR code ne peut plus servir. Scannez celui qui est maintenant affiché sur la borne.'), again: true },
  busy: { icon: 'alert', title: () => t('Un téléphone est déjà connecté'), text: () => t('Sur la borne, choisissez Déconnecter avant de connecter ce téléphone.'), again: true },
  ended: { icon: 'phone', title: () => t('Téléphone déconnecté'), text: () => t('Pour reprendre le contrôle, scannez un QR code Télécommande sur la borne.'), again: true },
  idle: { icon: 'clock', title: () => t('Télécommande déconnectée'), text: () => t('Aucun geste au menu depuis 20 minutes. Scannez un nouveau QR code sur la borne.'), again: true },
  quit: { icon: 'info', title: () => t('Cyber Pinball fermé'), text: () => t('Une fois Cyber Pinball relancé, scannez un nouveau QR code sur la borne.'), again: true },
  closed: { icon: 'info', title: () => t('Navigateur de la borne fermé'), text: () => t('Rouvrez-le sur la borne, puis scannez son QR code pour vous reconnecter.'), again: true },
  replaced: { icon: 'phone', title: () => t('Un autre téléphone a pris la main'), text: () => t('Ce téléphone ne pilote plus la borne.'), again: true },
  forgotten: { icon: 'alert', title: () => t('Ce téléphone n’est plus reconnu'), text: () => t('La borne l’a oublié. Pour le connecter de nouveau : Menu système > Borne > Télécommande du téléphone, puis scannez le QR code.'), again: true },
  invalid: { icon: 'info', title: () => t('Scannez le QR code de la borne'), text: () => t('Sur la borne : Menu système > Borne > Télécommande du téléphone, puis scannez le QR code affiché.'), again: true },
};

/**
 * Téléphone gardé : le texte de ces états, et « Reprendre » (sans QR). Cyber Pinball fermé : la page
 * se reconnecte seule à son retour.
 */
const KEPT_MESSAGES = {
  ended: () => t('La borne a déconnecté ce téléphone. Il reste gardé : touchez Reprendre pour revenir.'),
  idle: () => t('Aucun geste au menu depuis 20 minutes. Touchez Reprendre pour revenir.'),
  quit: () => t('Ce téléphone se reconnectera tout seul dès que Cyber Pinball sera relancé.'),
  closed: () => t('Touchez Reprendre pour revenir aux commandes du menu.'),
  replaced: () => t('Ce téléphone ne pilote plus la borne. Touchez Reprendre pour reprendre la main.'),
};

// --- Téléphone gardé ---------------------------------------------------------

/** Clé du téléphone gardé dans le stockage du navigateur (par adresse et port de la borne). */
const KEPT_STORE = 'cyberpinball.telecommande';
/** « Ajouter à l'écran d'accueil » déjà proposé une fois. */
const HINT_STORE = 'cyberpinball.astuce-accueil';
function stored(name) {
  try {
    return localStorage.getItem(name) ?? '';
  } catch {
    return '';
  }
}
function store(name, value) {
  try {
    if (value) localStorage.setItem(name, value);
    else localStorage.removeItem(name);
  } catch {
    // Stockage refusé (navigation privée) : l'adresse (#g=…) porte la clé.
  }
}
/** Ouverte depuis l'écran d'accueil (plein écran), plutôt que dans un onglet. */
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
/** Comment ajouter la page à l'écran d'accueil, selon le téléphone. */
function homeScreenHow() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return t('Dans Safari : touchez Partager, puis « Sur l’écran d’accueil ».');
  if (/Android/.test(ua)) return t('Dans le menu du navigateur (⋮) : « Ajouter à l’écran d’accueil ».');
  return t('Dans le menu du navigateur : « Ajouter à l’écran d’accueil ».');
}
function offerHomeScreen() {
  openSheet(t('Gardez la télécommande sous la main'), [{ id: 'ok', label: t('Compris'), run: () => undefined }], {
    text: `${t('Ce téléphone est gardé par la borne : il revient sans QR code. Ajoutez la télécommande à l’écran d’accueil pour l’ouvrir d’un geste.')}

${homeScreenHow()}`,
    // « Compris » suffit : pas d'« Annuler » en double.
    cancel: false,
  });
}

let state = 'connecting';
function setState(next, extra = {}) {
  state = next;
  document.body.dataset.state = next;
  const m = MESSAGES[next];
  if (m) {
    $('message-title').textContent = m.title();
    $('message-text').textContent = kept && KEPT_MESSAGES[next] ? KEPT_MESSAGES[next]() : m.text();
    $('message-mark').replaceChildren(...(m.icon ? [cyberIcon(m.icon)] : []));
  }
  // Téléphone gardé, coupé : il revient sans QR (sauf Cyber Pinball fermé, où il revient seul).
  $('message-action').hidden = !(kept && KEPT_MESSAGES[next] && next !== 'quit');
  $('code').hidden = !extra.code;
  if (extra.code) $('code').textContent = extra.code;
  const links = {
    connecting: t('Connexion…'),
    waiting: t('En attente'),
    paired: t('Connecté'),
    lost: t('Reconnexion…'),
  };
  $('link-text').textContent = links[next] ?? t('Déconnecté');
  if (next !== 'paired') {
    hideKeys();
    closeSheet();
  }
  syncLayout();
}

// --- Page affichée sur la borne ----------------------------------------------

let page = { title: '', host: '', canBack: false, canForward: false };
let actions = [];
let search;

function showPage(p) {
  page = { ...page, ...p };
  if (mode !== 'browser') return;
  $('page-title').textContent = page.title || page.host || '';
  $('page-host').textContent = page.title ? page.host : '';
  $('nav-back').disabled = !page.canBack;
  $('nav-forward').disabled = !page.canForward;
}

// --- Ce que la borne montre : navigateur, menu ou partie ------------------------

let mode = 'browser';
let screen = { title: '', item: '' };

function setMode(next) {
  if (!['browser', 'menu', 'game'].includes(next) || next === mode) return;
  mode = next;
  document.body.dataset.mode = next;
  releaseButtons();
  // Le clavier ouvert pour l'autre mode se replie ; celui du menu revient avec son champ (field).
  hideKeys();
  closeSheet();
  fieldShown = undefined;
  // L'écran et les menus de l'autre mode ne valent plus : la borne renvoie les siens (chargement d'ici là).
  entries = undefined;
  showScreen(screen);
  renderEntries();
  syncLayout();
}

// --- Accès direct : l'écran de la borne et tous les menus -------------------------

/** Vue choisie au menu (gardée d'une visite à l'autre) : l'écran de la borne d'abord. Un fil ne se rouvre pas seul. */
const VIEW_STORE = 'cyberpinball.vue';
const knownView = (v) => Boolean(VIEWS[v] && v !== 'community') || COMMUNITY_VIEWS.includes(v);
let view = knownView(stored(VIEW_STORE)) ? stored(VIEW_STORE) : 'list';
/** La vue de la Communauté que son onglet rouvre : la dernière montrée, les messages d'abord. */
let communityView = COMMUNITY_VIEWS.includes(view) ? view : 'messages';
/** L'écran de la borne et ses entrées (message « entries »), undefined en attendant ; les menus (message « menus »). */
let entries;
let menus;
/** Rubriques ouvertes dans la vue Menus (identifiants), de la racine à celle montrée. */
let menuPath = [];

function setView(next) {
  if (!(knownView(next) || next === 'thread' || next === 'player') || $(`tab-${tabOf(next)}`).disabled) return;
  const before = document.body.dataset.view;
  view = next;
  if (next !== 'thread' && next !== 'player') store(VIEW_STORE, next);
  if (COMMUNITY_VIEWS.includes(next)) communityView = next;
  // Un fil quitté : la borne cesse de l'envoyer (et de le marquer lu).
  if (before === 'thread' && next !== 'thread') communityLeaveThread();
  // Un bouton tenu reste tenu à la borne tant que le doigt n'est pas levé : changer de vue le relâche.
  releaseButtons();
  syncLayout();
  if (next === 'list') scrollToCurrent();
  // Scores (telephone-ranks.js) : ouverte, la table de la borne ; quittée, la borne cesse de relire les classements.
  if (next === 'ranks' && before !== 'ranks') ranksEnter();
  if (next !== 'ranks' && before === 'ranks') ranksLeave();
  if (next === 'messages' || next === 'friends') renderCommunity();
  if (next === 'jukebox' || next === 'player') renderJukebox();
}

/** Une ligne de liste : icône, libellé (et sa pastille), détail ou raison, pastille rouge, chevron d'une rubrique. */
function entryRow(item, opts) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'entry';
  if (item.quiet) b.classList.add('quiet');
  if (item.back) b.classList.add('back');
  if (opts.current) {
    b.classList.add('current');
    b.setAttribute('aria-current', 'true');
  }
  if (opts.medals) {
    // Une table : le médaillon de sa roue (sous jeton, réduit par la borne), sinon son initiale.
    b.append(tableMedal(item));
  } else if (opts.icons) {
    const mark = document.createElement('span');
    mark.className = 'entry-icon';
    if (item.icon) mark.append(cyberIcon(item.icon));
    b.append(mark);
  }
  const text = document.createElement('span');
  text.className = 'entry-text';
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = item.label;
  if (item.badge) {
    const badge = document.createElement('span');
    badge.className = 'entry-badge';
    badge.textContent = item.badge;
    label.append(' ', badge);
  }
  text.append(label);
  if (item.detail) {
    const detail = document.createElement('span');
    detail.className = 'entry-detail';
    detail.textContent = item.detail;
    text.append(detail);
  }
  b.append(text);
  if (item.attention) {
    const dot = document.createElement('span');
    dot.className = 'entry-dot';
    dot.setAttribute('aria-label', t('À voir'));
    b.append(dot);
  }
  if (opts.group) b.append(cyberIcon('chevron-right', 'entry-go'));
  b.addEventListener('click', () => {
    if (state !== 'paired') return;
    if (navigator.vibrate) navigator.vibrate(12);
    opts.run(b);
  });
  li.append(b);
  return li;
}

/** Message d'une liste vide : chargement, opération en cours, rien à toucher, menus fermés. */
function showEmpty(prefix, icon, title, text) {
  const box = $(`${prefix}-empty`);
  box.hidden = !title;
  if (!title) return;
  $(`${prefix}-empty-mark`).replaceChildren(...(icon ? [cyberIcon(icon)] : []));
  $(`${prefix}-empty-title`).textContent = title;
  $(`${prefix}-empty-text`).textContent = text ?? '';
}

/** La vue Écran : les entrées de l'écran ouvert à la borne ; toucher en fait une, comme un clic sur la borne. */
function renderEntries() {
  const list = $('entries-list');
  const e = entries;
  const note = $('entries-note');
  note.textContent = e?.note && e.items.length ? e.note : '';
  note.hidden = !note.textContent;
  if (!e) {
    list.replaceChildren();
    showEmpty('entries', 'refresh', t('Chargement de l’écran…'), t('La borne envoie ce qu’elle affiche.'));
  } else if (e.kind === 'busy') {
    list.replaceChildren();
    showEmpty('entries', 'clock', t('Opération en cours'), e.note || t('La borne travaille ; la liste revient ensuite.'));
  } else if (!e.items.length) {
    list.replaceChildren();
    showEmpty('entries', 'info', t('Rien à toucher sur cet écran'), e.note || t('Utilisez la vue Boutons.'));
  } else {
    showEmpty('entries');
    const icons = e.items.some((i) => i.icon);
    const medals = e.kind === 'wheel' && e.items.some((i) => i.art?.wheel);
    const grid = e.kind === 'wheel' && gridOn;
    const v = e.v;
    const run = (i) => (b) => {
      b.classList.add('sent');
      send({ t: 'pick', v, i });
    };
    list.classList.toggle('grid', grid);
    // Un titre avant chaque groupe, comme les sections de la borne : jamais une liste et ses options mêlées.
    let group;
    const rows = [];
    e.items.forEach((item, i) => {
      if (!grid && item.group && item.group !== group) rows.push(groupTitle(item.group));
      group = item.group;
      rows.push(grid ? tableCard(item, i === e.current, run(i)) : entryRow(item, { icons, medals, current: i === e.current, run: run(i) }));
    });
    list.replaceChildren(...rows);
    scrollToCurrent();
  }
  renderTools();
  syncLayout();
}

/** Le titre d'un groupe d'entrées (« Playlists », « Néon nocturne · YouTube »). */
function groupTitle(text) {
  const li = document.createElement('li');
  li.className = 'entry-group';
  li.textContent = text;
  return li;
}

/** Liste ou grille des tables, gardée sur le téléphone. */
const GRID_STORE = 'cyberpinball.grille';
let gridOn = stored(GRID_STORE) === '1';

/** Le médaillon d'une table (sa roue), ou son initiale sur le sarcelle ; le Juke-box garde son disque. */
function tableMedal(item, className = 'entry-medal') {
  const medal = document.createElement('span');
  medal.className = className;
  if (item.art?.wheel) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => {
      img.remove();
      medal.textContent = (item.label || '?').trim().charAt(0).toUpperCase();
    });
    img.src = item.art.wheel;
    medal.append(img);
  } else if (item.icon) medal.append(cyberIcon(item.icon));
  else medal.textContent = (item.label || '?').trim().charAt(0).toUpperCase();
  return medal;
}

/** Une table en grille : l'image de son fronton (sinon son médaillon en grand), son médaillon en coin, son titre. */
function tableCard(item, current, run) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `entry card${current ? ' current' : ''}${item.quiet ? ' quiet' : ''}`;
  if (current) b.setAttribute('aria-current', 'true');
  const pic = document.createElement('span');
  pic.className = 'card-media';
  if (item.art?.media) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove());
    img.src = item.art.media;
    pic.append(img);
    pic.append(tableMedal(item, 'card-medal'));
  } else pic.append(tableMedal(item, 'card-medal big'));
  const text = document.createElement('span');
  text.className = 'card-text';
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = item.label;
  const detail = document.createElement('span');
  detail.className = 'entry-detail';
  detail.textContent = item.detail ?? '';
  text.append(label, detail);
  b.append(pic, text);
  b.addEventListener('click', () => {
    if (state !== 'paired') return;
    if (navigator.vibrate) navigator.vibrate(12);
    run(b);
  });
  li.append(b);
  return li;
}

/** En tête du menu des tables : la collection affichée (à choisir) et le choix liste / grille. */
function renderTools() {
  const e = entries;
  const tools = $('entries-tools');
  const c = e?.kind === 'wheel' ? e.collections : undefined;
  tools.hidden = !c;
  if (!c) return;
  const shown = c.items[c.current];
  $('coll-lab').textContent = t('Collection');
  $('coll-name').textContent = shown?.label ?? screen.title;
  $('coll-count').textContent = shown?.detail ?? '';
  $('coll-go').replaceChildren(cyberIcon(c.locked ? 'lock' : 'chevron-right'));
  $('coll-select').classList.toggle('locked', Boolean(c.locked));
  $('grid-toggle').replaceChildren(cyberIcon(gridOn ? 'list' : 'layout'));
  $('grid-toggle').setAttribute('aria-label', gridOn ? t('Voir en liste') : t('Voir en grille'));
}

$('coll-select').addEventListener('click', () => {
  const c = entries?.collections;
  if (!c) return;
  const v = entries.v;
  openSheet(
    t('Collections'),
    c.locked ? [] : c.items.map((item, i) => ({ id: `c${i}`, label: item.detail ? `${item.label} · ${item.detail}` : item.label, current: i === c.current, run: () => send({ t: 'collection', v, i }) })),
    { text: c.locked ?? '', opener: $('coll-select') },
  );
});
$('grid-toggle').addEventListener('click', () => {
  gridOn = !gridOn;
  store(GRID_STORE, gridOn ? '1' : '0');
  send({ t: 'grid', on: gridOn });
  renderEntries();
});

/** L'entrée choisie à la borne a changé (flipper) : seulement son repère, la liste ne se redessine pas. */
function markCurrent() {
  const rows = $('entries-list').querySelectorAll('li:not(.entry-group) > .entry');
  rows.forEach((b, i) => {
    const on = i === entries?.current;
    b.classList.toggle('current', on);
    if (on) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
  scrollToCurrent();
}

function scrollToCurrent() {
  if (view !== 'list') return;
  $('entries-list').querySelector('.entry.current')?.scrollIntoView({ block: 'nearest' });
}

/** La rubrique montrée dans la vue Menus (les rubriques ouvertes qui n'existent plus sont refermées). */
function menuLevel() {
  let nodes = menus?.nodes ?? [];
  const trail = [];
  for (const id of menuPath) {
    const node = nodes.find((n) => n.id === id && n.entries);
    if (!node) break;
    trail.push(node);
    nodes = node.entries;
  }
  menuPath = trail.map((n) => n.id);
  return { nodes, trail };
}

/** La vue Menus : tous les menus de la borne ; une rubrique s'ouvre ici, une entrée s'ouvre à la borne. */
function renderMenus() {
  const { nodes, trail } = menuLevel();
  const root = !trail.length;
  $('menus-up').hidden = root;
  $('menus-trail').textContent = [t('Menus'), ...trail.map((n) => n.label)].join(' › ');
  const list = $('menus-list');
  if (!menus) {
    list.replaceChildren();
    showEmpty('menus', 'refresh', t('Chargement des menus…'), t('La borne envoie la liste de ses menus.'));
    return;
  }
  // À la racine, le menu des tables d'abord : toujours ouvert, même à l'invité.
  // Son icône, le plateau : celle des tables est à la rubrique Tables, juste dessous.
  const shown = root ? [{ id: 'wheel', label: t('Menu des tables'), detail: t('La roue des tables, pour choisir et jouer'), icon: 'playfield' }, ...nodes] : nodes;
  const icons = shown.some((n) => n.icon);
  list.replaceChildren(
    ...shown.map((node) =>
      entryRow(node, {
        icons,
        group: Boolean(node.entries),
        run: () => {
          if (node.entries) {
            menuPath = [...trail.map((n) => n.id), node.id];
            renderMenus();
            $('menus-list').scrollTop = 0;
            return;
          }
          send({ t: 'open', id: node.id });
          // Ce qui s'ouvre se voit dans la vue Écran.
          setView('list');
        },
      }),
    ),
  );
  if (menus.locked) showEmpty('menus', 'lock', t('Menu système verrouillé'), menus.locked);
  else if (!shown.length) showEmpty('menus', 'info', t('Rien dans cette rubrique sur cette borne'));
  else showEmpty('menus');
}

$('menus-up').addEventListener('click', () => {
  menuPath = menuPath.slice(0, -1);
  renderMenus();
});
$('game-open').addEventListener('click', () => send({ t: 'open', id: 'in-game' }));

/** Messagerie pendant la partie (la borne l'envoie : chat-menu.ts, remoteChat) ; null : rien à montrer. */
let chat = null;

/** Le fil le plus récent, ses réactions (sur le dernier message reçu) et ses phrases ; le champ pour écrire. */
function renderChat() {
  const box = $('phone-chat');
  box.hidden = !chat;
  if (!chat) return;
  $('phone-chat-name').textContent = t('Messages · {name}', { name: chat.name });
  const list = $('phone-chat-lines');
  list.replaceChildren(
    ...chat.lines.map((l) => {
      const li = document.createElement('li');
      li.className = `phone-chat-line${l.out ? ' out' : ''}`;
      const bubble = document.createElement('div');
      bubble.className = 'phone-chat-bubble';
      bubble.textContent = l.text;
      const meta = document.createElement('div');
      meta.className = 'phone-chat-meta';
      meta.textContent = l.note ? `${l.time} · ${l.note}` : l.time;
      li.append(bubble, meta);
      return li;
    }),
  );
  list.scrollTop = list.scrollHeight;
  const lastIn = [...chat.lines].reverse().find((l) => !l.out);
  const chip = (label, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'phone-chat-chip';
    b.textContent = label;
    b.addEventListener('click', run);
    return b;
  };
  $('phone-chat-chips').replaceChildren(
    ...(lastIn ? chat.reactions.map((r) => chip(r.label, () => send({ t: 'chat-react', key: chat.key, target: lastIn.id, kind: r.id }))) : []),
    ...chat.phrases.map((p) => chip(p, () => send({ t: 'chat-send', key: chat.key, text: p }))),
  );
  $('phone-chat-field').placeholder = t('Écrire à {name}…', { name: chat.name });
  $('phone-chat-send').textContent = t('Envoyer');
}

$('phone-chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const field = $('phone-chat-field');
  const text = field.value.trim();
  if (!chat || !text) return;
  send({ t: 'chat-send', key: chat.key, text });
  field.value = '';
});

/** Pendant une partie : les réglages en partie à ouvrir, ou pourquoi ils ne s'ouvrent pas. */
function renderGame() {
  const can = entries?.inGame;
  const open = $('game-open');
  open.hidden = can === undefined;
  open.disabled = can !== true;
  open.classList.toggle('primary', can === true);
  open.replaceChildren(cyberIcon('sliders'), document.createTextNode(t('Ouvrir les réglages en partie')));
  $('game-reason').hidden = typeof can !== 'string';
  $('game-reason').textContent = typeof can === 'string' ? can : '';
}

function showScreen(sc) {
  screen = { title: String(sc?.title ?? ''), item: String(sc?.item ?? ''), zone: String(sc?.zone ?? '') };
  // Ce que fait MagnaSave sur cet écran (la roue : la collection suivante), sinon la liste ou les actions.
  const zone = document.querySelector('.btn[data-b="zone"] .btn-what');
  if (zone) zone.textContent = screen.zone || BUTTONS.zone.what();
  if (mode === 'browser') return showPage({});
  renderTop();
}

/**
 * La barre du haut, au menu : l'écran de la borne et ce qui y est choisi ; dans la Communauté, son
 * titre ; dans un fil, l'ami (son retour, sa pastille, sa présence). « Clavier » quand la borne
 * attend une saisie (pas dans un fil, qui a son propre champ).
 */
function renderTop() {
  if (mode === 'browser') return;
  const shown = document.body.dataset.view;
  const top = communityTop(shown) ?? jukeboxTop(shown);
  $('page-title').textContent = top ? top.title : screen.title;
  $('page-host').textContent = top ? top.detail : screen.item;
  $('top-back').hidden = shown !== 'thread' && shown !== 'player';
  $('top-back').setAttribute('aria-label', shown === 'player' ? t('Retour au Juke-box') : t('Retour aux conversations'));
  $('top-mark').replaceChildren(...(top?.face ? [top.face] : []));
  $('top-mark').classList.toggle('face', Boolean(top?.face));
  $('top-keys').hidden = !(mode === 'menu' && fieldShown && shown !== 'thread');
  $('top-keys').setAttribute('aria-expanded', String(!$('keys').hidden));
}

// --- Liaison ---------------------------------------------------------------

/** Clé courante (QR, puis session) ; numéros des messages envoyés et reçus sur cette connexion. */
let key;
let socket;
let sent = 0;
let received = 0;
let mine; // défi de cette page pour la connexion (données associées des messages de la borne)
let theirs; // défi de la borne
let retry = 0;
let retryTimer;
let code = '';
/** La borne garde ce téléphone : sa clé ne change plus, il revient sans QR. */
let kept = false;
/** Astuce de l'écran d'accueil à montrer après le mode qui suit l'acceptation (setMode referme les feuilles). */
let hintAfterMode = false;

function readFragment() {
  const params = new URLSearchParams(location.hash.slice(1));
  // Un QR lu à l'instant l'emporte : c'est un appairage neuf.
  const k = core.fromB64(params.get('k') ?? '');
  if (k && k.length === 32) return k;
  const g = core.fromB64(params.get('g') ?? stored(KEPT_STORE));
  if (g && g.length === 32) {
    kept = true;
    store(KEPT_STORE, core.toB64(g));
    if (!params.get('g')) history.replaceState(null, '', `#g=${core.toB64(g)}`);
    return g;
  }
  const s = core.fromB64(params.get('s') ?? '');
  if (s && s.length === 32) {
    code = (params.get('c') ?? '').replace(/\D/g, '').slice(0, 4);
    return s;
  }
  return undefined;
}

/** La borne ne connaît plus ce téléphone (oublié à la borne) : sa clé est effacée. */
function forgetKey() {
  kept = false;
  store(KEPT_STORE, '');
  history.replaceState(null, '', location.pathname);
}

function send(message) {
  if (!socket || socket.readyState !== 1 || !theirs || !key) return false;
  socket.send(core.seal(key, theirs, { ...message, s: ++sent }));
  return true;
}

/** `force` : même depuis un état final (téléphone gardé qui attend le retour de Cyber Pinball). */
function connect(force = false) {
  clearTimeout(retryTimer);
  if (!force && MESSAGES[state]?.again) return;
  sent = 0;
  received = 0;
  theirs = undefined;
  mine = new Uint8Array(16);
  crypto.getRandomValues(mine);
  const ws = new WebSocket(`ws://${location.host}/liaison`);
  socket = ws;
  ws.onmessage = (e) => {
    if (ws !== socket || typeof e.data !== 'string') return;
    // En clair (un objet JSON) : le défi de la borne pour cette connexion, ou « clé inconnue » ;
    // tout le reste est scellé (base64url, jamais une accolade).
    if (e.data.startsWith('{')) {
      let hello;
      try {
        hello = JSON.parse(e.data);
      } catch {
        return ws.close();
      }
      if (hello?.t === 'unknown') {
        // Aucune des clés de la borne n'ouvre la nôtre : la borne a été relancée, ou ce téléphone oublié.
        if (kept) {
          forgetKey();
          setState('forgotten');
        } else setState('ended');
        return ws.close();
      }
      if (hello?.t !== 'challenge' || theirs) return ws.close();
      theirs = core.fromB64(hello.n ?? '');
      if (!theirs || theirs.length !== 16) return ws.close();
      // Déjà gardé et venu par un nouveau QR : l'empreinte de son ancienne clé, pour que la borne
      // remplace son entrée au lieu d'en ajouter une (remote-kept.ts, keptFingerprint).
      const old = kept ? undefined : core.fromB64(stored(KEPT_STORE));
      const prev = old && old.length === 32 ? core.toB64(core.aeadSeal(old, new Uint8Array(12), new TextEncoder().encode('cyberpinball:garde'), new Uint8Array(0))) : undefined;
      send({ t: 'hello', c: core.toB64(mine), device: core.deviceName(navigator.userAgent), ...(prev ? { prev } : {}) });
      return;
    }
    if (!theirs) return ws.close();
    const m = core.open(key, mine, e.data);
    if (!m || typeof m.s !== 'number' || m.s <= received) return ws.close();
    received = m.s;
    retry = 0;
    handle(m);
  };
  ws.onclose = () => {
    if (ws !== socket) return;
    socket = undefined;
    releaseButtons(false);
    // La borne oublie la vue Scores avec la liaison : la suivante la redemande (message « mode »).
    ranks.live = false;
    // Un envoi est lié à sa connexion : coupée, il s'arrête (la borne efface ce qu'elle avait reçu).
    if (upload && (upload.phase === 'asking' || upload.phase === 'sending')) failUpload(t('La liaison avec la borne a été coupée. Sélectionnez à nouveau le fichier pour réessayer.'), t('Envoi interrompu'));
    // Téléphone gardé et Cyber Pinball fermé : il revient seul quand la borne écoute de nouveau.
    if (kept && state === 'quit') {
      retryTimer = setTimeout(() => {
        if (state === 'quit') connect(true);
      }, 5000);
      return;
    }
    if (MESSAGES[state]?.again) return;
    setState(state === 'connecting' && !retry ? 'connecting' : 'lost');
    retry++;
    retryTimer = setTimeout(connect, Math.min(5000, 600 * retry));
  };
}

function handle(m) {
  switch (m.t) {
    case 'wait': {
      if (typeof m.k === 'string') {
        // Clé de session : elle remplace celle du QR, et reste dans l'adresse pour revenir après une coupure.
        const k = core.fromB64(m.k);
        if (k && k.length === 32) key = k;
        code = String(m.code ?? '');
        history.replaceState(null, '', `#s=${m.k}&c=${code}`);
      }
      setState('waiting', { code: m.code ?? code });
      break;
    }
    case 'ready': {
      const fresh = m.kept && !kept;
      if (m.kept) {
        // Gardé par la borne : la clé reste dans le stockage et dans l'adresse (raccourci de l'écran d'accueil).
        kept = true;
        store(KEPT_STORE, core.toB64(key));
        history.replaceState(null, '', `#g=${core.toB64(key)}`);
      }
      setState('paired');
      if (navigator.vibrate) navigator.vibrate(30);
      // Une fois, juste après l'appairage : comment le garder sous la main (après le mode, qui suit).
      if (fresh && !standalone() && !stored(HINT_STORE)) {
        store(HINT_STORE, '1');
        hintAfterMode = true;
      }
      break;
    }
    case 'mode':
      setMode(m.mode);
      // La grille des tables montrée : la borne joint l'image du fronton de chaque table.
      if (gridOn && m.mode === 'menu') send({ t: 'grid', on: true });
      // Une liaison neuve (ou une partie qui commence) : la vue Scores ouverte redemande son tableau.
      if (document.body.dataset.view === 'ranks' && m.mode !== 'browser') ranksAsk();
      // Et un fil ouvert le redemande (la borne l'oublie à chaque liaison).
      if (document.body.dataset.view === 'thread' && community.open && m.mode !== 'browser') send({ t: 'chat-open', key: community.open });
      if (hintAfterMode && state === 'paired') {
        hintAfterMode = false;
        offerHomeScreen();
      }
      break;
    case 'screen':
      showScreen(m);
      break;
    case 'entries':
      entries = {
        v: Number(m.v),
        kind: String(m.kind ?? 'none'),
        items: Array.isArray(m.items) ? m.items : [],
        current: Number.isInteger(m.current) ? m.current : -1,
        note: typeof m.note === 'string' ? m.note : '',
        inGame: m.inGame === true || typeof m.inGame === 'string' ? m.inGame : undefined,
        collections: m.collections && Array.isArray(m.collections.items) ? m.collections : undefined,
        area: m.area === 'jukebox' ? 'jukebox' : undefined,
      };
      if (typeof renderJukebox === 'function') renderJukebox();
      renderEntries();
      renderGame();
      break;
    case 'cursor':
      if (entries && m.v === entries.v && Number.isInteger(m.current)) {
        entries.current = m.current;
        markCurrent();
      }
      break;
    case 'menus':
      menus = { nodes: Array.isArray(m.nodes) ? m.nodes : [], locked: typeof m.locked === 'string' ? m.locked : '' };
      renderMenus();
      break;
    case 'ranks-tables':
    case 'ranks':
      ranksMessage(m);
      break;
    case 'community':
      communityMessage(m);
      break;
    case 'jukebox':
    case 'jb-time':
      jukeboxMessage(m);
      break;
    case 'up-ready':
      uploadReady(m);
      break;
    case 'report':
      reportOffer(m);
      break;
    case 'up-done':
      doneUpload(m.name);
      break;
    case 'up-no':
      failUpload(typeof m.text === 'string' ? m.text : t('La borne a refusé ce fichier.'));
      break;
    case 'page':
      showPage(m.page ?? {});
      actions = Array.isArray(m.actions) ? m.actions : [];
      search = m.search;
      break;
    case 'chat':
      chat = m.chat && typeof m.chat === 'object' && typeof m.chat.key === 'string' && Array.isArray(m.chat.lines) ? m.chat : null;
      renderChat();
      break;
    case 'field':
      showField(m.field);
      break;
    case 'menu':
      openSheet(t('Clic droit'), Array.isArray(m.items) ? m.items : []);
      break;
    case 'end':
      if (m.why === 'forgotten') forgetKey();
      setState(MESSAGES[m.why] ? m.why : 'ended');
      // Gardé, la clé reste dans l'adresse : la page rechargée revient sans QR.
      if (!kept) history.replaceState(null, '', location.pathname);
      socket?.close();
      break;
  }
}

// --- Pavé tactile ------------------------------------------------------------

const TAP_MS = 260;
const TAP_SLOP = 10;
const LONG_MS = 550;
const DOUBLE_MS = 320;

const pointers = new Map();
let gesture;
let pending = { dx: 0, dy: 0, ms: 0, sx: 0, sy: 0 };
let frame;
let lastTap = 0;
let longTimer;

function flush() {
  frame = undefined;
  if (pending.dx || pending.dy) send({ t: 'move', dx: Math.round(pending.dx * 10) / 10, dy: Math.round(pending.dy * 10) / 10, ms: Math.max(8, Math.round(pending.ms)) });
  if (pending.sx || pending.sy) send({ t: 'scroll', dx: Math.round(pending.sx), dy: Math.round(pending.sy) });
  pending = { dx: 0, dy: 0, ms: 0, sx: 0, sy: 0 };
}
const schedule = () => (frame ??= requestAnimationFrame(flush));

function centroid() {
  let x = 0;
  let y = 0;
  for (const p of pointers.values()) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pointers.size, y: y / pointers.size };
}

const pad = $('pad');
pad.addEventListener('pointerdown', (e) => {
  if (state !== 'paired') return;
  pad.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
  pad.classList.add('touching');
  if (pointers.size === 1) {
    gesture = { start: e.timeStamp, x: e.clientX, y: e.clientY, moved: false, fingers: 1, long: false, at: centroid() };
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      if (!gesture || gesture.moved || pointers.size !== 1) return;
      gesture.long = true;
      if (navigator.vibrate) navigator.vibrate(25);
      send({ t: 'click', button: 'right' });
    }, LONG_MS);
  } else if (gesture) {
    gesture.fingers = Math.max(gesture.fingers, pointers.size);
    gesture.at = centroid();
    clearTimeout(longTimer);
  }
  e.preventDefault();
});
pad.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p || !gesture) return;
  const dt = e.timeStamp - p.t;
  p.x = e.clientX;
  p.y = e.clientY;
  p.t = e.timeStamp;
  if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > TAP_SLOP) gesture.moved = true;
  const at = centroid();
  const dx = at.x - gesture.at.x;
  const dy = at.y - gesture.at.y;
  gesture.at = at;
  if (pointers.size >= 2) {
    pending.sx += dx;
    pending.sy += dy;
  } else if (gesture.fingers === 1) {
    pending.dx += dx;
    pending.dy += dy;
    pending.ms += Math.max(0, dt);
  }
  schedule();
});
function release(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size) {
    gesture.at = centroid();
    return;
  }
  pad.classList.remove('touching');
  clearTimeout(longTimer);
  const g = gesture;
  gesture = undefined;
  if (!g || g.long || g.moved || e.type === 'pointercancel' || e.timeStamp - g.start > TAP_MS + (g.fingers > 1 ? 120 : 0)) return;
  flush();
  if (g.fingers >= 2) {
    send({ t: 'click', button: 'right' });
    return;
  }
  const double = e.timeStamp - lastTap < DOUBLE_MS;
  lastTap = double ? 0 : e.timeStamp;
  send({ t: 'click', button: 'left', count: double ? 2 : 1 });
}
pad.addEventListener('pointerup', release);
pad.addEventListener('pointercancel', release);

// --- Clavier ---------------------------------------------------------------

const field = $('field');
let typed = '';
let fieldShown;
/**
 * Le texte du champ de la borne est repris dans celui du téléphone (essai réel du 06/11/2026 :
 * un champ rempli arrivait vide) : chaque changement envoie alors le texte entier (« set »).
 * Sinon (mot de passe, champ secret, zone riche, texte trop long) : le téléphone part d'un champ
 * vide et envoie ce qui change, à la suite de ce qu'il y a déjà (« text »).
 */
let prefilled = false;
/** Dernière saisie au téléphone : un champ renvoyé juste après ne remplace pas ce qui est en route. */
let typedAt = 0;
/** Le champ de la borne dont le texte est dans celui du téléphone. */
let openedField;
const TEXT_MAX = 512;
const sameField = (a, b) => Boolean(a && b && a.kind === b.kind && a.label === b.label);

function showField(f) {
  const before = fieldShown;
  // Au menu, le champ de la borne arrive avec son texte (un nom à corriger) et un numéro : le
  // même champ qui change de texte (tapé à la borne) ne remet pas à zéro ce qu'on tape ici.
  if (f && mode !== 'browser' && fieldShown && f.id === fieldShown.id && !$('keys').hidden) {
    fieldShown = f;
    if (typeof f.value === 'string' && f.value !== field.value) {
      field.value = f.value;
      typed = f.value;
    }
    return;
  }
  fieldShown = f || undefined;
  if (!f) {
    // Le champ a perdu le clavier sur la borne : le panneau se replie, sauf s'il a été ouvert à la main.
    if (!$('keys').dataset.manual || mode !== 'browser') hideKeys();
    syncLayout();
    return;
  }
  // Le même champ, renvoyé pendant qu'on y tape : on garde ce qui est tapé, encore en route vers la borne.
  openKeys(f, false, sameField(before, f) && !$('keys').hidden && Date.now() - typedAt < 800);
}

function openKeys(f, manual, keepText = false) {
  const kind = f?.kind ?? 'text';
  const keys = $('keys');
  keys.hidden = false;
  keys.dataset.manual = manual ? '1' : '';
  keys.dataset.kind = kind;
  document.body.classList.add('typing');
  const name = FIELD_NAMES[kind]?.() ?? t('Texte');
  const label = f?.label || name;
  $('field-label').textContent = label;
  // La nature du champ, seulement si son libellé ne la dit pas déjà (« Mot de passe » deux fois).
  $('field-mark').textContent = name;
  $('field-mark').hidden = label.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().startsWith(label.toLowerCase()) || kind === 'text' || kind === 'multiline';
  $('nav-keyboard').setAttribute('aria-expanded', 'true');
  const type = kind === 'password' ? 'password' : kind === 'multiline' ? 'text' : kind === 'number' ? 'text' : kind === 'search' ? 'search' : kind === 'email' ? 'email' : kind === 'url' ? 'url' : kind === 'tel' ? 'tel' : 'text';
  if (field.type !== type) field.type = type;
  // Au menu, un nombre est entier (nombre de LED, port) : le pavé numérique sans virgule.
  field.inputMode = mode !== 'browser' && kind === 'number' ? 'numeric' : (INPUT_MODES[kind] ?? 'text');
  field.enterKeyHint = kind === 'multiline' ? 'enter' : kind === 'search' ? 'search' : 'go';
  // Le texte du champ de la borne, quand elle le donne : toujours au menu (le clavier à l'écran),
  // dans le navigateur sauf pour un mot de passe ou un champ secret (REMOTE_FOCUS_PROBE).
  if (!keepText) {
    prefilled = typeof f?.value === 'string';
    field.value = prefilled ? f.value : '';
    typed = field.value;
  }
  openedField = f;
  // Repris, le texte entier part à chaque changement : borné comme à la borne (REMOTE_TEXT_MAX).
  if (prefilled) field.maxLength = TEXT_MAX;
  else field.removeAttribute('maxlength');
  $('key-enter').textContent = mode !== 'browser' ? t('Valider') : t('Entrée');
  // Le clavier du téléphone ne s'ouvre souvent qu'au toucher : le champ est là, un toucher suffit.
  field.focus({ preventScroll: true });
  // Le curseur à la fin du texte repris (un champ e-mail ou numérique ne le permet pas : il y reste).
  try {
    field.setSelectionRange(field.value.length, field.value.length);
  } catch {
    // Type de champ sans sélection.
  }
  releaseButtons();
  syncLayout();
}

function hideKeys() {
  $('nav-keyboard').setAttribute('aria-expanded', 'false');
  $('keys').hidden = true;
  $('keys').dataset.manual = '';
  document.body.classList.remove('typing');
  field.blur();
  syncLayout();
}

/**
 * Présentation de la page, en un seul endroit : le panneau détaillé
 * montré (saisie ou envoi, jamais les deux), la vue de saisie quand la hauteur visible manque,
 * Start sombre quand un autre vert est à l'écran, et les outils indisponibles avec leur raison.
 */
function syncLayout() {
  const body = document.body;
  const typing = !$('keys').hidden;
  body.dataset.panel = typing ? 'keys' : upload ? 'upload' : 'none';
  const visible = window.visualViewport?.height ?? window.innerHeight;
  body.dataset.layout = typing && mode === 'menu' && visible < 680 ? 'editing' : 'normal';
  body.dataset.short = String(visible < 440);
  body.dataset.compact = String(visible < 640);
  body.dataset.held = String(held.size > 0);
  // Pendant une partie : Écran (la partie, ou les réglages en partie ouverts), Boutons seulement avec
  // ces réglages, Scores toujours ; Menus après la partie. Indisponible : grisé, avec sa raison.
  const ingame = mode === 'game' && entries?.kind === 'ingame';
  body.dataset.ingame = String(ingame);
  const off = { menus: mode === 'game', buttons: mode === 'game' && !ingame, jukebox: mode === 'game' };
  for (const name of ['menus', 'buttons', 'jukebox']) {
    const tab = $(`tab-${name}`);
    tab.disabled = off[name];
    tab.querySelector('.view-reason').textContent = off[name] ? t('Après la partie') : '';
  }
  const shownView = off[tabOf(view)] ? 'list' : view;
  body.dataset.view = shownView;
  for (const v of Object.keys(VIEWS)) $(`tab-${v}`).setAttribute('aria-selected', String(v === tabOf(shownView)));
  for (const v of COMMUNITY_VIEWS) $(`seg-${v}`).setAttribute('aria-selected', String(v === shownView));
  renderTop();
  renderMini();
  // Clavier à l'écran de la borne ouvert : Start y tape la touche choisie, Valider (téléphone) envoie Entrée.
  const startWhat = document.querySelector('.btn[data-b="confirm"] .btn-what');
  if (startWhat) startWhat.textContent = mode === 'menu' && fieldShown ? t('Touche choisie') : t('Valider');
  const reason = (id, text) => {
    const b = $(id);
    b.querySelector('.tool-reason').textContent = text ?? '';
    b.disabled = Boolean(text);
  };
  const sending = upload && (upload.phase === 'asking' || upload.phase === 'sending');
  if (mode === 'browser') {
    reason('nav-keyboard');
    reason('nav-send');
  } else if (mode === 'game') {
    reason('nav-keyboard', t('Après la partie'));
    reason('nav-send', sending ? undefined : t('Après la partie'));
  } else {
    reason('nav-keyboard', fieldShown ? undefined : t('Aucun champ'));
    reason('nav-send');
  }
  // Pendant un envoi, « Envoyer » montre son pourcentage et ouvre le suivi, jamais un second choix de fichier.
  const label = $('nav-send').querySelector('.tool-label');
  if (label) label.textContent = sending && upload.phase === 'sending' ? t('Envoi {pct} %', { pct: uploadPct() }) : t('Envoyer');
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => syncLayout());

field.addEventListener('input', () => {
  // Au menu, tout le texte part : la borne le met à la place de celui du clavier à l'écran.
  if (mode !== 'browser') {
    if (field.value !== typed) send({ t: 'set', value: field.value });
    typed = field.value;
    return;
  }
  const now = field.value;
  if (now === typed) return;
  typedAt = Date.now();
  if (prefilled) {
    typed = now;
    send({ t: 'set', value: now });
    return;
  }
  const diff = core.textDiff(typed, now);
  typed = now;
  if (diff.del || diff.ins) send({ t: 'text', del: diff.del, ins: diff.ins });
});
// Effacer dans un champ vide du téléphone : la touche part quand même (le champ de la borne a
// peut-être du texte). beforeinput le dit sur la plupart des claviers ; sinon keydown, juste après.
let backspaceSent = false;
field.addEventListener('beforeinput', (e) => {
  if (mode !== 'browser') return;
  if (e.inputType === 'deleteContentBackward' && !field.value) {
    backspaceSent = true;
    send({ t: 'key', key: 'Backspace' });
  }
});
field.addEventListener('keydown', (e) => {
  if (mode !== 'browser') return;
  if (e.key === 'Backspace' && !field.value) {
    backspaceSent = false;
    setTimeout(() => backspaceSent || send({ t: 'key', key: 'Backspace' }), 0);
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    send({ t: 'key', key: 'Tab', shift: e.shiftKey });
  }
});
$('keys').addEventListener('submit', (e) => {
  e.preventDefault();
  send({ t: 'key', key: 'Enter' });
  if (mode !== 'browser') return;
  // Un champ repris garde son texte (il est encore dans celui de la borne) ; sinon on repart à vide.
  if (fieldShown?.kind !== 'multiline' && !prefilled) {
    field.value = '';
    typed = '';
  }
});
$('key-backspace').addEventListener('click', () => {
  if (field.value) {
    // La sélection, sinon le caractère avant le curseur (un émoji entier).
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    // Au menu, ou un champ repris (son texte entier part) : là où est le curseur ; sinon à la fin, comme à la borne.
    if ((mode !== 'browser' || prefilled) && (start !== end || start < field.value.length)) {
      const before = start === end ? Array.from(field.value.slice(0, start)).slice(0, -1).join('') : field.value.slice(0, start);
      field.value = before + field.value.slice(end);
      field.setSelectionRange(before.length, before.length);
    } else field.value = Array.from(field.value).slice(0, -1).join('');
    field.dispatchEvent(new Event('input'));
  } else send({ t: 'key', key: 'Backspace' });
});
$('key-tab').addEventListener('click', () => send({ t: 'key', key: 'Tab' }));
// Au menu, Annuler fait ce que fait Exit sur la borne : le clavier à l'écran se ferme sans rien garder.
$('key-cancel').addEventListener('click', () => press('exit'));
$('keys-hide').addEventListener('click', hideKeys);

// --- Boutons de la borne (mode menu) -------------------------------------------

/** Boutons tenus : relâchés à la borne quand le doigt se lève, glisse hors du bouton ou que la liaison se coupe. */
const held = new Map();

/** Flipper tenu : passé ce délai, la borne fait défiler vite (phone-remote.ts, HOLD_DELAY_MS) ; le bouton le dit. */
const FAST_MS = 400;

function buttonDown(b, el) {
  // Au menu ; pendant une partie, seulement les réglages en partie ouverts (VPX a les boutons sinon).
  if (held.has(b) || state !== 'paired' || !(mode === 'menu' || (mode === 'game' && entries?.kind === 'ingame'))) return;
  const what = el.querySelector('.btn-what');
  const fast = b === 'previous' || b === 'next' ? setTimeout(() => held.has(b) && (what.textContent = t('Défilement rapide')), FAST_MS) : undefined;
  held.set(b, { el, fast });
  el.classList.add('down');
  if (navigator.vibrate) navigator.vibrate(12);
  send({ t: 'btn', b, down: true });
  syncLayout();
}

function buttonUp(b, tell = true) {
  const h = held.get(b);
  if (!h) return;
  held.delete(b);
  clearTimeout(h.fast);
  h.el.classList.remove('down');
  const what = h.el.querySelector('.btn-what');
  if (what && (b === 'previous' || b === 'next')) what.textContent = BUTTONS[b].what();
  if (tell) send({ t: 'btn', b, down: false });
  syncLayout();
}

function releaseButtons(tell = true) {
  for (const b of [...held.keys()]) buttonUp(b, tell);
}

/** Un appui bref, d'un autre bouton de la page (Annuler du clavier). */
function press(b) {
  send({ t: 'btn', b, down: true });
  send({ t: 'btn', b, down: false });
}

for (const el of document.querySelectorAll('.btn')) {
  const b = el.dataset.b;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    buttonDown(b, el);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, () => buttonUp(b));
  // Le doigt glisse hors du bouton : relâché, comme on lâche un bouton de la borne.
  el.addEventListener('pointermove', (e) => {
    if (!held.has(b)) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) buttonUp(b);
  });
  // Pas de menu du toucher prolongé : un flipper se tient longtemps pour parcourir vite.
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// --- Envoi d'un fichier vers la borne (mode menu) -------------------------------

/**
 * L'envoi en cours : `asking` (la borne vérifie le nom, la taille, la place), `sending` (morceaux
 * scellés, envoyés l'un après l'autre en HTTP), `done` ou `error`. Chaque morceau est lié à la
 * connexion et à son rang : la borne refuse un morceau rejoué, déplacé ou venu d'ailleurs.
 */
let upload;
const encoder = new TextEncoder();

function formatSize(bytes) {
  const units = [t('o'), t('Ko'), t('Mo'), t('Go')];
  let v = bytes;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const digits = u === 0 || v >= 100 ? 0 : 1;
  return t('{n} {unit}', { n: v.toLocaleString(window.cyberI18n?.locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }), unit: units[u] });
}

function showUpload() {
  const box = $('upload');
  const u = upload;
  box.hidden = !u;
  if (!u) return syncLayout();
  box.dataset.phase = u.phase;
  const marks = { asking: 'upload', sending: 'upload', done: 'check', error: 'alert' };
  $('upload-mark').replaceChildren(cyberIcon(marks[u.phase]));
  $('upload-title').textContent =
    u.phase === 'asking' ? t('Préparation de l’envoi') : u.phase === 'done' ? t('Reçu par la borne') : u.phase === 'error' ? (u.title ?? t('Envoi impossible')) : t('Envoi vers la borne');
  $('upload-name').textContent = u.name;
  const pct = uploadPct();
  $('upload-fill').style.width = `${pct}%`;
  $('upload-track').setAttribute('aria-valuenow', String(pct));
  $('upload-track').setAttribute('aria-label', t('Progression de l’envoi'));
  $('upload-line').textContent =
    u.phase === 'asking'
      ? t('La borne vérifie le fichier et l’espace disponible.')
      : u.phase === 'sending'
        ? t('{pct} % · {sent} sur {size}', { pct, sent: formatSize(u.sent), size: formatSize(u.size) })
        : u.phase === 'done'
          ? t('Pour l’importer : Menu système > Tables > Ajouter une table.')
          : u.text;
  $('upload-button').textContent = u.phase === 'asking' || u.phase === 'sending' ? t('Annuler l’envoi') : t('OK');
  syncLayout();
}

function uploadPct() {
  return upload?.size ? Math.floor((upload.sent / upload.size) * 100) : 0;
}

function startUpload(file) {
  if (!file || (upload && (upload.phase === 'asking' || upload.phase === 'sending'))) return;
  upload = { name: file.name, size: file.size, sent: 0, phase: 'asking', file };
  showUpload();
  if (!send({ t: 'up', name: file.name, size: file.size })) failUpload(t('La liaison avec la borne a été coupée. Sélectionnez à nouveau le fichier pour réessayer.'), t('Envoi interrompu'));
}

function uploadReady(m) {
  const u = upload;
  if (!u || u.phase !== 'asking' || typeof m.id !== 'string' || !(m.chunk > 0)) return;
  u.phase = 'sending';
  u.id = m.id;
  u.chunk = m.chunk;
  u.index = 0;
  u.abort = new AbortController();
  // Les clés de cette connexion : une reconnexion en change, l'envoi s'arrête alors (ws.onclose).
  u.key = key;
  u.aad = theirs;
  showUpload();
  void pump(u);
}

async function pump(u) {
  try {
    while (upload === u && u.phase === 'sending' && u.sent < u.size) {
      const bytes = new Uint8Array(await u.file.slice(u.sent, u.sent + u.chunk).arrayBuffer());
      const label = encoder.encode(`envoi:${u.id}:${u.index}`);
      const aad = new Uint8Array(u.aad.length + label.length);
      aad.set(u.aad, 0);
      aad.set(label, u.aad.length);
      const body = core.sealBytes(u.key, aad, bytes);
      const res = await fetch(`/envoi/${u.id}/${u.index}`, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' }, cache: 'no-store', signal: u.abort.signal });
      if (upload !== u || u.phase !== 'sending') return;
      if (!res.ok) return failUpload(t('La borne a interrompu l’envoi.'));
      u.sent += bytes.length;
      u.index++;
      showUpload();
    }
    // Tout est parti : la borne range le fichier et le dit (up-done).
  } catch {
    if (upload === u && u.phase === 'sending') failUpload(t('La liaison avec la borne a été coupée. Sélectionnez à nouveau le fichier pour réessayer.'), t('Envoi interrompu'));
  }
}

// --- Rapport de la borne (Fiche technique > Envoyer un rapport) --------------------------
// La page est en HTTP : le partage du système (navigator.share) et le presse-papiers moderne n'y sont
// pas permis. On télécharge donc le fichier par un lien, on prépare un e-mail par mailto: (le résumé
// dans le message, le fichier à joindre) et on copie le résumé à l'ancienne (execCommand).

/** Un texte dans le presse-papiers ; vrai si le navigateur l'a pris. */
function copyText(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/** La borne propose son rapport : télécharger, préparer un e-mail, copier le résumé ; la feuille revient après chaque geste. */
function reportOffer(m, note) {
  if (typeof m.url !== 'string' || !m.url.startsWith('/rapport/') || typeof m.name !== 'string') return;
  const again = (text) => setTimeout(() => reportOffer(m, text), 300);
  const items = [
    {
      id: 'report-get',
      label: t('Télécharger le rapport'),
      run: () => {
        const a = document.createElement('a');
        a.href = m.url;
        a.download = m.name;
        document.body.append(a);
        a.click();
        a.remove();
        again(t('Téléchargement lancé : il est dans les téléchargements du téléphone.'));
      },
    },
  ];
  if (typeof m.mailto === 'string' && m.mailto.startsWith('mailto:')) {
    items.push({
      id: 'report-mail',
      label: t('Préparer un e-mail'),
      run: () => {
        location.href = m.mailto;
        again(t('Joignez-y le fichier téléchargé avant d’envoyer.'));
      },
    });
  }
  if (typeof m.summary === 'string' && m.summary) {
    items.push({ id: 'report-copy', label: t('Copier le résumé'), run: () => again(copyText(m.summary) ? t('Résumé copié : collez-le dans un forum ou un message.') : t('Copie refusée par le navigateur.')) });
  }
  const size = typeof m.size === 'number' ? ` · ${formatSize(m.size)}` : '';
  openSheet(t('Rapport de la borne'), items, { text: note ?? `${m.name}${size}\n${t('Téléchargez-le, puis joignez-le à un e-mail ou à un message.')}` });
}

function failUpload(text, title) {
  if (!upload) return;
  upload.abort?.abort();
  upload.phase = 'error';
  upload.text = text;
  upload.title = title;
  upload.file = undefined;
  showUpload();
}

function doneUpload(name) {
  if (!upload) return;
  upload.phase = 'done';
  upload.sent = upload.size;
  if (typeof name === 'string' && name) upload.name = name;
  upload.file = undefined;
  if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
  showUpload();
}

$('upload-button').addEventListener('click', () => {
  if (upload && (upload.phase === 'asking' || upload.phase === 'sending')) {
    send({ t: 'up-cancel' });
    upload.abort?.abort();
  }
  upload = undefined;
  showUpload();
});
// Pendant un envoi, « Envoyer » montre le suivi (et replie la saisie, sans l'annuler) ; sinon il choisit un fichier.
$('nav-send').addEventListener('click', () => {
  if (upload && (upload.phase === 'asking' || upload.phase === 'sending')) {
    if (!$('keys').hidden) hideKeys();
    return;
  }
  $('file-input').click();
});
$('file-input').addEventListener('change', () => {
  const file = $('file-input').files?.[0];
  $('file-input').value = '';
  startUpload(file);
});

// --- Barre d'outils, feuille d'actions --------------------------------------

$('nav-back').addEventListener('click', () => send({ t: 'nav', action: 'back' }));
$('nav-forward').addEventListener('click', () => send({ t: 'nav', action: 'forward' }));
// Rouvert sur le même champ : on garde ce qui y a été tapé depuis (le texte reçu à son ouverture est dépassé).
$('nav-keyboard').addEventListener('click', () => ($('keys').hidden ? openKeys(fieldShown, !fieldShown, sameField(openedField, fieldShown)) : hideKeys()));
$('nav-more').addEventListener('click', () => openSheet(t('Actions de la page'), actions, { search: true, text: page.title || page.host, opener: $('nav-more') }));
// Au menu, le menu ⋮ de la barre du haut : le clavier (si la borne attend une saisie), l'envoi d'un
// fichier, l'écran d'accueil, puis « Déconnecter ce téléphone ».
$('top-more').addEventListener('click', () => {
  const sending = upload && (upload.phase === 'asking' || upload.phase === 'sending');
  const items = [
    ...(mode === 'menu' && fieldShown ? [{ id: 'keys', label: t('Clavier : taper dans le champ ouvert à la borne'), run: () => openKeys(fieldShown, false, sameField(openedField, fieldShown)) }] : []),
    ...(mode === 'menu' || sending ? [{ id: 'send', label: sending && upload.phase === 'sending' ? t('Envoi {pct} %', { pct: uploadPct() }) : t('Envoyer un fichier à la borne'), run: () => $('nav-send').click() }] : []),
    ...(kept && !standalone() ? [{ id: 'home', label: t('Ajouter à l’écran d’accueil'), run: offerHomeScreen }] : []),
    // Android : le plein écran, à prendre ou à quitter d'ici (jamais repris de lui-même une fois quitté exprès).
    ...(document.fullscreenElement || fullscreenPossible() ? [{ id: 'fullscreen', label: document.fullscreenElement ? t('Quitter le plein écran') : t('Plein écran'), run: toggleFullscreen }] : []),
  ];
  openSheet(t('Télécommande'), items, {
    search: true,
    text: [
      mode === 'game' ? t('Les commandes reviendront à la fin de la partie.') : t('Ce téléphone pilote le menu de la borne.'),
      sending ? t('Un envoi est en cours. Déconnecter ce téléphone l’annulera.') : '',
    ]
      .filter(Boolean)
      .join(' '),
    opener: $('top-more'),
  });
});
$('top-keys').addEventListener('click', () => ($('keys').hidden ? openKeys(fieldShown, !fieldShown, sameField(openedField, fieldShown)) : hideKeys()));
// Fermer coupe la liaison : une feuille le dit et le fait confirmer.
$('nav-close').addEventListener('click', () =>
  openSheet(t('Fermer le navigateur de la borne ?'), [{ id: 'close', label: t('Fermer le navigateur') }], { text: t('La télécommande reviendra aux commandes du menu.'), opener: $('nav-close'), bye: false }),
);

let sheetOpener;
/** Feuille d'actions : `opts.search` ajoute la recherche (recherche libre) et « Déconnecter ce téléphone ». */
function openSheet(title, items, opts = {}) {
  $('sheet-title').textContent = title;
  $('sheet-text').textContent = opts.text ?? '';
  $('sheet-text').hidden = !opts.text;
  const box = $('sheet-actions');
  const list = [...items];
  if (opts.search) list.push({ id: 'bye', label: t('Déconnecter ce téléphone') });
  box.replaceChildren(
    ...list.map((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = item.danger ? 'key wide danger' : item.current ? 'key wide primary' : 'key wide';
      if (item.current) b.setAttribute('aria-current', 'true');
      b.textContent = item.label;
      b.addEventListener('click', () => {
        closeSheet();
        // Action de la page elle-même (rien ne part à la borne).
        if (item.run) item.run();
        else if (item.id === 'bye') {
          send({ t: 'bye' });
          setState('ended');
          socket?.close();
        } else if (item.id === 'close') send({ t: 'nav', action: 'close' });
        else send({ t: 'act', id: item.id });
      });
      return b;
    }),
  );
  $('sheet-cancel').hidden = opts.cancel === false;
  $('sheet-search').hidden = !(opts.search && search && mode === 'browser');
  if (opts.search && search) $('search-query').value = search.query ?? '';
  showEngines(opts.search && search && mode === 'browser');
  sheetOpener = opts.opener;
  sheetOpener?.setAttribute('aria-expanded', 'true');
  releaseButtons();
  // Derrière la feuille, rien ne réagit ni ne prend le focus.
  for (const el of document.querySelectorAll('body > :not(.sheet):not(script)')) el.inert = true;
  $('sheet').hidden = false;
  box.querySelector('button')?.focus({ preventScroll: true });
}

function closeSheet() {
  if ($('sheet').hidden) return;
  $('sheet').hidden = true;
  for (const el of document.querySelectorAll('body > [inert]')) el.inert = false;
  sheetOpener?.setAttribute('aria-expanded', 'false');
  sheetOpener?.focus({ preventScroll: true });
  sheetOpener = undefined;
}
$('sheet-cancel').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', (e) => e.target === $('sheet') && closeSheet());
$('sheet-search').addEventListener('submit', (e) => {
  e.preventDefault();
  const query = $('search-query').value.trim();
  if (query) send({ t: 'search', query, ...(engine ? { engine } : {}) });
  $('search-query').blur();
  closeSheet();
});

/** Moteur choisi dans la feuille : celui de la page de résultats affichée à son ouverture. */
let engine;
function showEngines(on) {
  const box = $('sheet-engines');
  const list = on && Array.isArray(search?.engines) ? search.engines : [];
  box.hidden = !list.length;
  engine = on ? search?.engine : undefined;
  box.replaceChildren(
    ...list.map((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'engine';
      b.dataset.engine = e.id;
      b.textContent = e.label;
      b.setAttribute('role', 'radio');
      // Comme dans le bandeau : un autre moteur relance aussitôt le même texte.
      b.addEventListener('click', () => {
        engine = e.id;
        markEngines();
        const query = $('search-query').value.trim();
        if (!query) return;
        send({ t: 'search', query, engine });
        closeSheet();
      });
      return b;
    }),
  );
  markEngines();
}
function markEngines() {
  for (const b of $('sheet-engines').children) b.setAttribute('aria-checked', String(b.dataset.engine === engine));
}

// Clavier du téléphone ouvert : la page suit la zone visible (iOS et Chrome récent ne
// raccourcissent que celle-là), le panneau du clavier et la barre restent au-dessus de lui.
if (window.visualViewport) {
  const fit = () => {
    document.body.style.height = `${window.visualViewport.height}px`;
    window.scrollTo(0, 0);
  };
  window.visualViewport.addEventListener('resize', fit);
  fit();
}

// --- Plein écran au toucher (Android) -------------------------------------------
//
// Chrome pour Android ouvre le raccourci d'une page HTTP dans un onglet, barre d'adresse comprise :
// seule une page HTTPS installable s'ouvre sans elle. La page demande donc le plein écran au premier
// toucher (l'API l'exige), et de nouveau après une sortie subie (autre application, écran verrouillé :
// la page passe en arrière-plan). Quitté exprès (le geste « glisser pour quitter » de Chrome, ou
// « Quitter le plein écran » du menu ⋮), il n'est plus repris de lui-même : le menu ⋮ le rend. Chrome
// montre son propre avertissement à chaque entrée, que la page ne peut ni masquer ni remplacer : d'où
// une demande aussi rare que possible. Le toucher fait aussi ce qu'il touche : la demande part au
// relâchement, sans rien empêcher. Rien sur l'iPhone (le raccourci y est déjà plein écran), ni quand
// le navigateur n'a pas de plein écran ou le refuse. La hauteur suit la zone visible (fit ci-dessus) : rien ne saute, le
// clavier du téléphone et les feuilles restent utilisables. Jamais dans Electron (les essais chargent
// la vraie page dans des fenêtres hors écran : un vrai plein écran les montrerait), sauf essai qui
// le simule (window.cyberFullscreenTest).
let fullscreenRefused = false;
/** Plein écran quitté exprès : plus repris au toucher (gardé d'une visite à l'autre). */
const FULLSCREEN_STORE = 'cyberpinball.plein-ecran';
let fullscreenOff = stored(FULLSCREEN_STORE) === 'non';
/** Le navigateur sait passer en plein écran, et c'est utile ici (pas l'iPhone, déjà plein écran). */
function fullscreenPossible() {
  if (fullscreenRefused || standalone()) return false;
  if (/Electron\//.test(navigator.userAgent) && !window.cyberFullscreenTest) return false;
  return Boolean(document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function');
}
function fullscreenWanted() {
  return !fullscreenOff && !document.fullscreenElement && fullscreenPossible();
}
/** Le menu ⋮ : entrer en plein écran (et le garder), ou le quitter (et ne plus le reprendre). */
function toggleFullscreen() {
  if (document.fullscreenElement) {
    leavingOnPurpose = true;
    setFullscreenOff(true);
    void document.exitFullscreen?.().catch(() => undefined);
    return;
  }
  setFullscreenOff(false);
  fullscreenRefused = false;
  askFullscreen();
}
function setFullscreenOff(off) {
  fullscreenOff = off;
  store(FULLSCREEN_STORE, off ? 'non' : '');
}
/** Sortie du plein écran : subie si la page passe en arrière-plan juste après (autre application), sinon voulue. */
let leavingOnPurpose = false;
let hiddenAfterExit = false;
let exitTimer;
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) return;
  clearTimeout(exitTimer);
  if (leavingOnPurpose || document.visibilityState === 'hidden') {
    leavingOnPurpose = false;
    return;
  }
  hiddenAfterExit = false;
  exitTimer = setTimeout(() => {
    if (!hiddenAfterExit) setFullscreenOff(true);
  }, 700);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAfterExit = true;
});
function askFullscreen() {
  if (!fullscreenWanted()) return;
  // Le champ qui a le clavier le garde : la bascule ne le replie pas.
  const focused = document.activeElement;
  Promise.resolve(document.documentElement.requestFullscreen({ navigationUI: 'hide' }))
    .then(() => {
      if (focused instanceof HTMLElement && focused !== document.body && document.activeElement !== focused) focused.focus({ preventScroll: true });
    })
    .catch(() => {
      // Refusé (réglage du navigateur, page sans geste) : on ne redemande plus pendant cette visite.
      fullscreenRefused = true;
    });
}
document.addEventListener('pointerup', askFullscreen, { capture: true, passive: true });

/** Nouvelle tentative de liaison, repartie de zéro (« Reprendre », retour de Cyber Pinball). */
function connectFresh() {
  clearTimeout(retryTimer);
  retry = 0;
  setState('connecting');
  connect();
}
$('message-action').addEventListener('click', () => connectFresh());

// Retour sur la page (écran déverrouillé, application rouverte) : la liaison se refait aussitôt.
document.addEventListener('visibilitychange', () => {
  // Téléphone verrouillé, application quittée : aucun bouton ne reste tenu à la borne.
  if (document.visibilityState === 'hidden') releaseButtons();
  if (document.visibilityState === 'visible' && !socket && !MESSAGES[state]?.again) {
    retry = 0;
    connect();
  }
});

// --- Départ ---------------------------------------------------------------

const demo = window.cyberRemoteDemo;
if (demo) {
  // Démonstration hors écran : un état figé, sans borne.
  if (demo.mode) setMode(demo.mode);
  if (demo.screen) showScreen(demo.screen);
  if (demo.view) view = demo.view;
  if (demo.grid) gridOn = true;
  if (demo.entries) {
    entries = { v: 1, kind: 'screen', current: -1, ...demo.entries };
    renderEntries();
    renderGame();
  }
  if (demo.menus) {
    menus = demo.menus;
    menuPath = demo.menuPath ?? [];
    renderMenus();
  }
  if (demo.page) showPage(demo.page);
  actions = demo.actions ?? [];
  search = demo.search;
  setState(demo.state, { code: demo.code });
  if (demo.field) showField(demo.field);
  if (demo.typed) {
    field.value = demo.typed;
    typed = demo.typed;
  }
  if (demo.sheet) openSheet(demo.sheet.title, demo.sheet.items, demo.sheet.opts);
  if (demo.down) {
    const el = document.querySelector(`.btn[data-b="${demo.down}"]`);
    held.set(demo.down, { el });
    el.classList.add('down');
    if (demo.fast) el.querySelector('.btn-what').textContent = t('Défilement rapide');
  }
  if (demo.upload) {
    upload = { ...demo.upload };
    showUpload();
  }
  if (demo.open) community.open = demo.open;
  syncLayout();
  if (demo.community) communityMessage({ t: 'community', ...demo.community });
  if (demo.jukebox) jukeboxMessage({ t: 'jukebox', ...demo.jukebox });
  if (demo.jbTime) jukeboxMessage({ t: 'jb-time', ...demo.jbTime });
  if (demo.view === 'thread') renderThread();
  if (demo.touch) {
    pad.classList.add('touching');
    pad.style.setProperty('--touch-x', `${demo.touch.x}px`);
    pad.style.setProperty('--touch-y', `${demo.touch.y}px`);
  }
} else {
  renderEntries();
  renderMenus();
  renderCommunity();
  renderJukebox();
  key = readFragment();
  if (!key) setState('invalid');
  else {
    if (code) setState('waiting', { code });
    connect();
  }
}
