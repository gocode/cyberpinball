// Page du téléphone qui pilote la borne (packages/core/src/remote.ts, app/src/phone-remote.ts).
// Deux modes, selon ce que la borne montre (body[data-mode]) :
// - browser, le navigateur intégré « Récupérer » : un pavé tactile, le clavier du téléphone quand un
//   champ de la page a le clavier, Retour, Avancer, Fermer ;
// - menu, le menu de Cyber Pinball : les boutons de la borne (Start, flippers, Exit, MagnaSave), le
//   clavier du téléphone à la place du clavier à l'écran, l'envoi d'un fichier vers le dossier
//   d'import ; game pendant une partie (les boutons attendent le retour au menu). La clé vient du QR code, dans le fragment de l'adresse (#k=…) : le navigateur ne l'envoie
// jamais sur le réseau. Acceptée à la borne, la page la remplace par sa clé de session (#s=…), qui
// la laisse revenir après une coupure (page rechargée, écran verrouillé) tant que le navigateur
// intégré reste ouvert. Chaque message est scellé (telephone-core.js) et numéroté.
//
// Démonstration hors écran (docs/demo-telecommande.cjs) : window.cyberRemoteDemo fixe un état sans borne.
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
 * Messages plein écran, par état (textes revus par Codex) ; `again` : l'état est final, rien ne
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
  invalid: { icon: 'info', title: () => t('Scannez le QR code de la borne'), text: () => t('Ouvrez la télécommande avec le QR code affiché dans le navigateur de la borne.'), again: true },
};

let state = 'connecting';
function setState(next, extra = {}) {
  state = next;
  document.body.dataset.state = next;
  const m = MESSAGES[next];
  if (m) {
    $('message-title').textContent = m.title();
    $('message-text').textContent = m.text();
    $('message-mark').replaceChildren(...(m.icon ? [cyberIcon(m.icon)] : []));
  }
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
  showScreen(screen);
  syncLayout();
}

function showScreen(sc) {
  screen = { title: String(sc?.title ?? ''), item: String(sc?.item ?? ''), zone: String(sc?.zone ?? '') };
  // Ce que fait MagnaSave sur cet écran (la roue : la collection suivante), sinon la liste ou les actions.
  const zone = document.querySelector('.btn[data-b="zone"] .btn-what');
  if (zone) zone.textContent = screen.zone || BUTTONS.zone.what();
  if (mode === 'browser') return showPage({});
  $('page-title').textContent = screen.title;
  $('page-host').textContent = screen.item;
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

function readFragment() {
  const params = new URLSearchParams(location.hash.slice(1));
  const s = core.fromB64(params.get('s') ?? '');
  if (s && s.length === 32) {
    code = (params.get('c') ?? '').replace(/\D/g, '').slice(0, 4);
    return s;
  }
  const k = core.fromB64(params.get('k') ?? '');
  return k && k.length === 32 ? k : undefined;
}

function send(message) {
  if (!socket || socket.readyState !== 1 || !theirs || !key) return false;
  socket.send(core.seal(key, theirs, { ...message, s: ++sent }));
  return true;
}

function connect() {
  clearTimeout(retryTimer);
  if (MESSAGES[state]?.again) return;
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
        // Aucune des clés de la borne n'ouvre la nôtre : la borne a été relancée, ou le navigateur rouvert.
        setState('ended');
        return ws.close();
      }
      if (hello?.t !== 'challenge' || theirs) return ws.close();
      theirs = core.fromB64(hello.n ?? '');
      if (!theirs || theirs.length !== 16) return ws.close();
      send({ t: 'hello', c: core.toB64(mine), device: core.deviceName(navigator.userAgent) });
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
    // Un envoi est lié à sa connexion : coupée, il s'arrête (la borne efface ce qu'elle avait reçu).
    if (upload && (upload.phase === 'asking' || upload.phase === 'sending')) failUpload(t('La liaison avec la borne a été coupée. Sélectionnez à nouveau le fichier pour réessayer.'), t('Envoi interrompu'));
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
    case 'ready':
      setState('paired');
      if (navigator.vibrate) navigator.vibrate(30);
      break;
    case 'mode':
      setMode(m.mode);
      break;
    case 'screen':
      showScreen(m);
      break;
    case 'up-ready':
      uploadReady(m);
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
    case 'field':
      showField(m.field);
      break;
    case 'menu':
      openSheet(t('Clic droit'), Array.isArray(m.items) ? m.items : []);
      break;
    case 'end':
      setState(MESSAGES[m.why] ? m.why : 'ended');
      history.replaceState(null, '', location.pathname);
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

function showField(f) {
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
  openKeys(f, false);
}

function openKeys(f, manual) {
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
  field.value = mode !== 'browser' && typeof f?.value === 'string' ? f.value : '';
  typed = field.value;
  $('key-enter').textContent = mode !== 'browser' ? t('Valider') : t('Entrée');
  // Le clavier du téléphone ne s'ouvre souvent qu'au toucher : le champ est là, un toucher suffit.
  field.focus({ preventScroll: true });
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
 * Présentation de la page, en un seul endroit (revue de Codex du 06/11/2026) : le panneau détaillé
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
  body.dataset.held = String(held.size > 0);
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
  if (fieldShown?.kind !== 'multiline') {
    field.value = '';
    typed = '';
  }
});
$('key-backspace').addEventListener('click', () => {
  if (field.value) {
    // La sélection, sinon le caractère avant le curseur (un émoji entier).
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    if (mode !== 'browser' && (start !== end || start < field.value.length)) {
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
  if (held.has(b) || state !== 'paired' || mode !== 'menu') return;
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
$('nav-keyboard').addEventListener('click', () => ($('keys').hidden ? openKeys(fieldShown, !fieldShown) : hideKeys()));
$('nav-more').addEventListener('click', () =>
  mode === 'browser'
    ? openSheet(t('Actions de la page'), actions, { search: true, text: page.title || page.host, opener: $('nav-more') })
    : openSheet(t('Télécommande'), [], {
        search: true,
        text: [
          mode === 'game' ? t('Les commandes reviendront à la fin de la partie.') : t('Ce téléphone pilote le menu de la borne.'),
          upload && (upload.phase === 'asking' || upload.phase === 'sending') ? t('Un envoi est en cours. Déconnecter ce téléphone l’annulera.') : '',
        ]
          .filter(Boolean)
          .join(' '),
        opener: $('nav-more'),
      }),
);
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
      b.className = item.danger ? 'key wide danger' : 'key wide';
      b.textContent = item.label;
      b.addEventListener('click', () => {
        closeSheet();
        if (item.id === 'bye') {
          send({ t: 'bye' });
          setState('ended');
          socket?.close();
        } else if (item.id === 'close') send({ t: 'nav', action: 'close' });
        else send({ t: 'act', id: item.id });
      });
      return b;
    }),
  );
  $('sheet-search').hidden = !(opts.search && search && mode === 'browser');
  if (opts.search && search) $('search-query').value = search.query ?? '';
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
  if (query) send({ t: 'search', query });
  $('search-query').blur();
  closeSheet();
});

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
  syncLayout();
  if (demo.touch) {
    pad.classList.add('touching');
    pad.style.setProperty('--touch-x', `${demo.touch.x}px`);
    pad.style.setProperty('--touch-y', `${demo.touch.y}px`);
  }
} else {
  key = readFragment();
  if (!key) setState('invalid');
  else {
    if (code) setState('waiting', { code });
    connect();
  }
}
