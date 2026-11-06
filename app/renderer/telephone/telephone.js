// Page du téléphone qui pilote la borne (packages/core/src/remote.ts, app/src/phone-remote.ts) :
// un pavé tactile, le clavier du téléphone quand un champ de la page a le clavier, Retour, Avancer,
// Fermer. La clé vient du QR code, dans le fragment de l'adresse (#k=…) : le navigateur ne l'envoie
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
  'nav-more': { icon: 'list', label: () => t('Plus') },
  'nav-close': { icon: 'close', label: () => t('Fermer') },
};
for (const [id, tool] of Object.entries(TOOLS)) {
  const b = $(id);
  const span = document.createElement('span');
  span.textContent = tool.label();
  b.replaceChildren(cyberIcon(tool.icon), span);
}
$('key-backspace').replaceChildren(cyberIcon('backspace'));
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
  ended: { icon: 'phone', title: () => t('Téléphone déconnecté'), text: () => t('Pour reprendre le contrôle, scannez le QR code affiché sur la borne.'), again: true },
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
}

// --- Page affichée sur la borne ----------------------------------------------

let page = { title: '', host: '', canBack: false, canForward: false };
let actions = [];
let search;

function showPage(p) {
  page = { ...page, ...p };
  $('page-title').textContent = page.title || page.host || '';
  $('page-host').textContent = page.title ? page.host : '';
  $('nav-back').disabled = !page.canBack;
  $('nav-forward').disabled = !page.canForward;
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
  fieldShown = f || undefined;
  if (!f) {
    // Le champ a perdu le clavier sur la borne : le panneau se replie, sauf s'il a été ouvert à la main.
    if (!$('keys').dataset.manual) hideKeys();
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
  field.inputMode = INPUT_MODES[kind] ?? 'text';
  field.enterKeyHint = kind === 'multiline' ? 'enter' : kind === 'search' ? 'search' : 'go';
  field.value = '';
  typed = '';
  // Le clavier du téléphone ne s'ouvre souvent qu'au toucher : le champ est là, un toucher suffit.
  field.focus({ preventScroll: true });
}

function hideKeys() {
  $('nav-keyboard').setAttribute('aria-expanded', 'false');
  $('keys').hidden = true;
  $('keys').dataset.manual = '';
  document.body.classList.remove('typing');
  field.blur();
}

field.addEventListener('input', () => {
  const now = field.value;
  const diff = core.textDiff(typed, now);
  typed = now;
  if (diff.del || diff.ins) send({ t: 'text', del: diff.del, ins: diff.ins });
});
// Effacer dans un champ vide du téléphone : la touche part quand même (le champ de la borne a
// peut-être du texte). beforeinput le dit sur la plupart des claviers ; sinon keydown, juste après.
let backspaceSent = false;
field.addEventListener('beforeinput', (e) => {
  if (e.inputType === 'deleteContentBackward' && !field.value) {
    backspaceSent = true;
    send({ t: 'key', key: 'Backspace' });
  }
});
field.addEventListener('keydown', (e) => {
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
  if (fieldShown?.kind !== 'multiline') {
    field.value = '';
    typed = '';
  }
});
$('key-backspace').addEventListener('click', () => {
  if (field.value) {
    field.value = Array.from(field.value).slice(0, -1).join('');
    field.dispatchEvent(new Event('input'));
  } else send({ t: 'key', key: 'Backspace' });
});
$('key-tab').addEventListener('click', () => send({ t: 'key', key: 'Tab' }));
$('keys-hide').addEventListener('click', hideKeys);

// --- Barre d'outils, feuille d'actions --------------------------------------

$('nav-back').addEventListener('click', () => send({ t: 'nav', action: 'back' }));
$('nav-forward').addEventListener('click', () => send({ t: 'nav', action: 'forward' }));
$('nav-keyboard').addEventListener('click', () => ($('keys').hidden ? openKeys(fieldShown, !fieldShown) : hideKeys()));
$('nav-more').addEventListener('click', () => openSheet(t('Actions de la page'), actions, { search: true, text: page.title || page.host, opener: $('nav-more') }));
// Fermer coupe la liaison : une feuille le dit et le fait confirmer.
$('nav-close').addEventListener('click', () =>
  openSheet(t('Fermer le navigateur de la borne ?'), [{ id: 'close', label: t('Fermer le navigateur'), danger: true }], { text: t('La télécommande sera déconnectée.'), opener: $('nav-close'), bye: false }),
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
  $('sheet-search').hidden = !(opts.search && search);
  if (opts.search && search) $('search-query').value = search.query ?? '';
  sheetOpener = opts.opener;
  sheetOpener?.setAttribute('aria-expanded', 'true');
  $('sheet').hidden = false;
  box.querySelector('button')?.focus({ preventScroll: true });
}

function closeSheet() {
  if ($('sheet').hidden) return;
  $('sheet').hidden = true;
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
  if (document.visibilityState === 'visible' && !socket && !MESSAGES[state]?.again) {
    retry = 0;
    connect();
  }
});

// --- Départ ---------------------------------------------------------------

const demo = window.cyberRemoteDemo;
if (demo) {
  // Démonstration hors écran : un état figé, sans borne.
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
