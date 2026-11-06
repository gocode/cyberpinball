// Démonstration et essai hors écran de la télécommande du téléphone dans tout le menu (deuxième
// jalon, app/src/phone-remote.ts et phone-remote-menu.ts) : la vraie gestion des tables
// (library.ts) dans une fenêtre du menu hors écran, sur un bac à sable ; Menu système > Borne >
// Télécommande du téléphone montre le QR code, lu sur la capture même de l'écran ; un téléphone
// simulé (la vraie page du téléphone, hors écran, 390 × 844) l'ouvre, est accepté par Start, tient
// les boutons de la borne (Exit, un flipper tenu qui défile), tape à la place du clavier à
// l'écran, valide, envoie un fichier dans le dossier d'import (octet pour octet, nom pris : « (2) »).
// Puis des téléphones bruts (le protocole à la main) : le QR du clavier à l'écran, accepté par
// Start ; ce qui doit être refusé (fichier trop gros, mode invité, nom qui remonte les dossiers,
// morceau rejoué ou d'une autre connexion, autre hôte) ; une partie (les boutons attendent) ; le
// navigateur intégré qui prend le téléphone et le rend au menu ; l'inactivité ; Déconnecter à la
// borne ; la fermeture de Cyber Pinball. Tout sur 127.0.0.1 : jamais le vrai réseau.
//
// Lancé par docs\demo-telecommande-menu.ps1 (bureau caché, captures dans
// tmp\demo-telecommande-menu\captures), et par packages/core/src/test/telecommande.test.ts
// (CP_TELECOMMANDE_OUT : son dossier d'essai). Relevé : resultat.txt ; code de sortie 1 si une
// vérification échoue.

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const OUT = process.env.CP_TELECOMMANDE_OUT || path.join(WT, 'tmp', 'demo-telecommande-menu', 'captures');
const BASE = path.join(OUT, 'bac');
const CAPTURES = process.env.CP_TELECOMMANDE_CAPTURES !== '0';
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const phoneCore = require(path.join(WT, 'app', 'renderer', 'telephone', 'telephone-core.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { createPhoneRemote } = require(path.join(WT, 'app', 'dist', 'phone-remote.js'));
const { createAcquirer } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const jsQR = require(path.join(WT, 'node_modules', 'jsqr'));

const LANG = process.env.CP_TELECOMMANDE_LANGUE === 'en' ? 'en' : 'fr';
core.setLanguage(LANG);
const T = (text, values) => core.t(text, values);

const LOG = [];
const JOURNAL = [];
let failures = 0;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function check(ok, what, detail = '') {
  LOG.push(`${ok ? 'OK  ' : 'ÉCHEC'} ${what}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
  return ok;
}
async function until(what, test, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) {
    let value;
    try {
      value = await test();
    } catch {
      value = undefined;
    }
    if (value) return value;
    if (Date.now() > end) {
      check(false, `attendu : ${what}`);
      return undefined;
    }
    await delay(50);
  }
}
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}

// --- Téléphone brut : le protocole à la main (WebSocket masqué, messages scellés) ----------------

function rawPhone(address, keyB64, opts = {}) {
  const key = phoneCore.fromB64(keyB64);
  const mine = crypto.randomBytes(16);
  const inbox = [];
  let sent = 0;
  let closed = false;
  let socket;
  let rest = Buffer.alloc(0);
  const phone = {
    inbox,
    key,
    theirs: undefined,
    get closed() {
      return closed;
    },
    sendRaw(text) {
      socket.write(core.encodeFrame(1, Buffer.from(text), crypto.randomBytes(4)));
    },
    send(message) {
      phone.sendRaw(phoneCore.seal(phone.key, phone.theirs, { ...message, s: ++sent }));
    },
    has: (test) => inbox.some((m) => m && test(m)),
    close() {
      socket?.destroy();
    },
  };
  const req = http.request({
    host: '127.0.0.1',
    port: address.port,
    path: '/liaison',
    headers: { Host: `127.0.0.1:${address.port}`, Origin: `http://127.0.0.1:${address.port}`, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') },
  });
  req.on('response', () => (closed = true));
  req.on('error', () => (closed = true));
  req.on('upgrade', (res, s, head) => {
    socket = s;
    const onData = (chunk) => {
      rest = Buffer.concat([rest, chunk]);
      while (rest.length >= 2) {
        const op = rest[0] & 15;
        let len = rest[1] & 127;
        let at = 2;
        if (len === 126) {
          len = rest.readUInt16BE(2);
          at = 4;
        }
        if (rest.length < at + len) break;
        const payload = rest.subarray(at, at + len).toString('utf8');
        rest = rest.subarray(at + len);
        if (op === 8) {
          closed = true;
          continue;
        }
        if (op !== 1) continue;
        if (payload.startsWith('{')) {
          const plain = JSON.parse(payload);
          if (plain.t !== 'challenge') {
            inbox.push(plain);
            continue;
          }
          phone.theirs = phoneCore.fromB64(plain.n);
          phone.send({ t: 'hello', c: phoneCore.toB64(mine), device: opts.device ?? 'Essai · Node' });
          continue;
        }
        const m = phoneCore.open(phone.key, mine, payload);
        if (m?.t === 'wait' && m.k) phone.key = phoneCore.fromB64(m.k);
        inbox.push(m);
      }
    };
    s.on('data', onData);
    if (head?.length) onData(head);
    s.on('close', () => (closed = true));
  });
  req.end();
  return phone;
}

/** Un morceau d'envoi, comme la page du téléphone l'envoie (POST /envoi/<envoi>/<rang>). */
function postChunk(address, phone, id, index, plain, opts = {}) {
  const aad = core.uploadAad(opts.challenge ?? phone.theirs, id, index);
  const body = Buffer.from(phoneCore.sealBytes(phone.key, aad, plain));
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: address.port, method: 'POST', path: `/envoi/${id}/${index}`, headers: { Host: opts.host ?? `127.0.0.1:${address.port}`, Origin: `http://127.0.0.1:${address.port}`, 'Content-Type': 'application/octet-stream', 'Content-Length': body.length } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve(0));
    req.end(body);
  });
}

function get(address, url) {
  return new Promise((resolve) => {
    http
      .get({ host: '127.0.0.1', port: address.port, path: url, headers: { Host: `127.0.0.1:${address.port}` } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      })
      .on('error', (e) => resolve(e.code));
  });
}

/** Contenu d'essai reconnaissable octet pour octet, le même dans la page du téléphone. */
const PATTERN = 'function pattern(n) { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 7 + (i >> 9)) & 255; return b; }';
// eslint-disable-next-line no-new-func
const pattern = new Function(`${PATTERN}; return pattern;`)();

// --- Le scénario ------------------------------------------------------------------------------

const ZOOM = 2;
async function run(report) {
  fs.rmSync(BASE, { recursive: true, force: true });
  const root = path.join(BASE, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  const KEYS = core.interfaceKeys({ buttons: core.DEFAULT_BUTTONS });
  const ZONE = core.zoneSwitchKeys({ buttons: core.DEFAULT_BUTTONS })[0];
  const sc = { width: 1920, height: 1080 };
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);

  // Le menu, réduit à ce que la télécommande touche (frontend.ts) : la gestion des tables, une
  // partie, le mode invité, le bandeau.
  let phase = 'library';
  let guestOn = false;
  const guestMode = { get active() { return guestOn; }, allows: (door) => !guestOn || core.GUEST_DOORS[door] === true, knock: (door) => !guestOn || core.GUEST_DOORS[door] === true };
  let banner;
  let upload;
  let keyCalls = 0;
  let repeats = 0;
  const remoteOpts = { mode: () => 'loopback', log: (line) => JOURNAL.push(line), idleMs: 3_600_000 };
  const remote = createPhoneRemote(remoteOpts);
  const library = createLibrary({
    // Mode invité commutable (guestOn) : les portes de GUEST_DOORS, comme GuestMode.
    guest: guestMode,
    root,
    dataDir: L.data,
    vpxExe: () => undefined,
    tables: () => [],
    reload: () => {},
    enter: () => (phase = 'library'),
    leave: () => (phase = 'menu'),
    play: () => {},
    quit: () => {},
    keys: () => KEYS,
    zoneKeys: () => [ZONE],
    windows: () => windows,
    phoneRemote: remote,
    phoneUpload: () => upload,
    broadcast: () => send(),
    downloadsDir: () => path.join(BASE, 'Téléchargements'),
  });
  function handleKey(input, fromPhone) {
    keyCalls++;
    if (input.isAutoRepeat) repeats++;
    if (phase === 'playing') return true;
    // Comme frontend.ts : un téléphone qui attend sur l'écran affiché prend Start et Exit.
    if (!fromPhone && !input.isAutoRepeat && phase === 'library' && (remote.pendingOn('menu') || remote.pendingOn('keyboard'))) {
      if (KEYS.confirm.includes(input.code)) return (remote.accept(), send(), true);
      if (KEYS.exit.includes(input.code)) return (remote.refuse(), send(), true);
    }
    if (phase !== 'library') return false;
    const done = library.handleKey(input);
    send();
    return done;
  }
  const key = (code, extra = {}) => ({ type: 'keyDown', code, key: '', isAutoRepeat: false, shift: false, control: false, alt: false, meta: false, ...extra });
  remote.setMenu({
    phase: () => (phase === 'playing' ? 'game' : 'menu'),
    screen: () => (phase === 'library' ? (library.remoteScreen() ?? { title: '' }) : { title: 'Neon Abyss' }),
    field: () => (phase === 'library' ? library.remoteField() : undefined),
    button: (b, down, repeat) => {
      const code = b === 'zone' ? ZONE : KEYS[b][0];
      if (down) handleKey(key(code, { isAutoRepeat: repeat }), true);
      else if (phase === 'library') library.handleKeyUp({ ...key(code), type: 'keyUp' });
    },
    setText: (value) => library.remoteSet(value),
    enter: () => library.remoteEnter(),
    uploadDir: () => (guestMode.knock('phone.files') ? { dir: L.import } : { refused: T('Indisponible en mode invité.') }),
    uploading: (p) => {
      upload = p;
      send();
    },
    uploaded: (name) => {
      banner = T('Reçu du téléphone : {name}, dans le dossier d’import', { name });
      send();
    },
    changed: () => setImmediate(send),
  });
  function send() {
    if (!win.isDestroyed()) {
      const pct = upload?.size ? Math.floor((upload.received / upload.size) * 100) : 0;
      win.webContents.send('state', {
        role: 'playfield', phase, help: false, count: 0, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [],
        nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0] },
        library: phase === 'library' ? library.view() : undefined,
        banner: upload ? T('Réception depuis le téléphone · {pct} % · {name}', { pct, name: upload.name }) : banner,
      });
    }
    const surfaces = phase === 'library' ? library.remoteSurfaces() : { menu: false, keyboard: false };
    remote.show('menu', surfaces.menu);
    remote.show('keyboard', surfaces.keyboard);
    remote.menuChanged();
  }
  const onAction = (_e, action) => library.handleAction(action);
  ipcMain.on('action', onAction);
  const ready = new Promise((r) => ipcMain.once('ready', r));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: '0', zones: '[]' } });
  await ready;

  const view = () => library.view();
  const act = (label) => {
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  let step = 0;
  async function shotBorne(name) {
    send();
    await delay(350);
    const label = `borne-${String(++step).padStart(2, '0')}-${name}`;
    await report.check(win.webContents, label);
    // Première image d'une fenêtre hors écran : capturePage peut échouer (« UnknownVizError ») avant le premier dessin ; on réessaie.
    let image;
    for (let i = 0; !image; i++) {
      try {
        image = await win.capturePage();
      } catch (error) {
        if (i >= 5) throw error;
        await delay(400);
      }
    }
    if (CAPTURES) fs.writeFileSync(path.join(OUT, `${label}.png`), image.toPNG());
    return image;
  }
  /** Le QR code tel qu'on le voit sur la capture de l'écran (le téléphone le lirait ainsi). */
  function readQr(image) {
    const { width, height } = image.getSize();
    const bgra = image.toBitmap();
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = bgra[i * 4 + 2];
      rgba[i * 4 + 1] = bgra[i * 4 + 1];
      rgba[i * 4 + 2] = bgra[i * 4];
      rgba[i * 4 + 3] = 255;
    }
    return jsQR(rgba, width, height)?.data;
  }

  // 1. La racine du menu système (Exit au menu des tables) : « Télécommande du téléphone » y est,
  // et aussi dans Borne (06/11/2026 : rangée seulement dans Borne, on ne la trouvait pas).
  library.openSystem();
  check(view().actions.some((a) => a.label === T('Télécommande du téléphone')), 'la racine du menu système a l’entrée « Télécommande du téléphone »');
  await shotBorne('menu-systeme');
  act(T('Borne'));
  check(view().actions.some((a) => a.label === T('Télécommande du téléphone')), 'Menu système > Borne a aussi l’entrée « Télécommande du téléphone »');
  library.openSystem();
  act(T('Télécommande du téléphone'));
  const offer = await until('QR code sur l’écran de la télécommande', () => (remote.bar()?.phase === 'offer' ? remote.bar() : undefined));
  if (!offer) return;
  const address = remote.address();
  check(address.host === '127.0.0.1', 'essai sur 127.0.0.1 seulement', `${address.host}:${address.port}`);
  const seen = readQr(await shotBorne('qr'));
  check(seen === offer.url, 'le QR code de l’écran se lit sur la capture et donne l’adresse de la page du téléphone', seen);

  // 2. Le téléphone lit le QR, attend ; le même code des deux côtés ; Start l'accepte.
  const phone = offscreen(390 * ZOOM, 844 * ZOOM);
  phone.webContents.setZoomFactor(ZOOM);
  phone.webContents.on('console-message', (e) => e.level === 'error' && LOG.push(`téléphone (console) : ${e.message}`));
  await phone.loadURL(offer.url);
  phone.webContents.setZoomFactor(ZOOM);
  const phoneJs = (code) => phone.webContents.executeJavaScript(code, true);
  async function shotPhone(name) {
    await delay(300);
    if (CAPTURES) fs.writeFileSync(path.join(OUT, `telephone-${String(++step).padStart(2, '0')}-${name}.png`), (await phone.webContents.capturePage()).toPNG());
  }
  await until('téléphone en attente', () => phoneJs(`document.body.dataset.state === 'waiting'`));
  const phoneCode = await phoneJs(`document.getElementById('code').textContent`);
  check(remote.bar()?.phase === 'pending' && remote.bar().code === phoneCode, 'même code sur l’écran de la borne et sur le téléphone', phoneCode);
  check(remote.pendingOn('menu'), 'le téléphone attend sur l’écran de la télécommande');
  await shotBorne('code');
  handleKey(key(KEYS.confirm[0]), false);
  await until('téléphone accepté', () => phoneJs(`document.body.dataset.state === 'paired' && document.body.dataset.mode === 'menu'`));
  check(remote.connected() === 'menu', 'Start accepte le téléphone : il pilote le menu');
  check(view().heading === T('Télécommande du téléphone'), 'Start n’a rien fait d’autre sur l’écran');
  await until('écran affiché sur le téléphone', () => phoneJs(`document.getElementById('page-title').textContent === ${JSON.stringify(T('Télécommande du téléphone'))}`));
  check(true, 'le téléphone montre l’écran de la borne');
  await shotBorne('connecte');
  await shotPhone('menu');

  // 3. Les boutons de la borne, au téléphone : Exit, puis un flipper tenu qui défile.
  const mouse = (type, x, y) => phone.webContents.sendInputEvent({ type, x: Math.round(x * ZOOM), y: Math.round(y * ZOOM), button: 'left', clickCount: 1 });
  const center = async (selector) => phoneJs(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  async function hold(b, ms) {
    const at = await center(`.btn[data-b="${b}"]`);
    mouse('mouseDown', at.x, at.y);
    await delay(ms);
    mouse('mouseUp', at.x, at.y);
    await delay(120);
  }
  await hold('exit', 80);
  await until('Exit au téléphone : retour à la rubrique Borne', () => view().heading === T('Borne'));
  check(view().heading === T('Borne'), 'Exit au téléphone ferme l’écran, comme le bouton de la borne');
  const before = { repeats, cursor: view().cursor };
  await hold('next', 1300);
  const held = repeats - before.repeats;
  check(held >= 6, 'un flipper tenu au téléphone se répète, comme un vrai bouton tenu', `${held} répétitions en 1,3 s`);
  await delay(400);
  check(repeats - before.repeats === held, 'relâché, il s’arrête');
  let shown;
  await until('choix suivi sur le téléphone', async () => (shown = await phoneJs(`document.getElementById('page-host').textContent`)) === view().actions[view().cursor]?.label);
  check(shown === view().actions[view().cursor]?.label, 'le choix courant de la borne s’affiche sur le téléphone', `téléphone « ${shown} », borne « ${view().actions[view().cursor]?.label} » (${view().heading}, ${view().cursor})`);

  // 4. Le clavier à l'écran : le téléphone tape à sa place, Valider l'envoie.
  let named;
  library.openPrompt(T('Votre nom'), T('Nom du joueur'), 'Bille', (value) => (named = value ?? null));
  send();
  await until('panneau du clavier ouvert au téléphone', () => phoneJs(`!document.getElementById('keys').hidden && document.getElementById('field').value === 'Bille'`));
  check((await phoneJs(`document.getElementById('field-label').textContent`)) === T('Nom du joueur'), 'le téléphone ouvre son clavier avec le libellé et le texte de la borne');
  await phoneJs(`document.getElementById('field').focus()`);
  await phoneJs(`document.getElementById('field').setSelectionRange(5, 5)`);
  await phone.webContents.insertText(' d’Été ✓');
  await until('texte reçu dans le clavier à l’écran', () => view().editor?.value === 'Bille d’Été ✓');
  check(view().editor?.value === 'Bille d’Été ✓', 'ce qui est tapé au téléphone remplace le texte du clavier à l’écran (accents compris)', view().editor?.value);
  await shotBorne('clavier-telephone');
  await shotPhone('clavier');
  await phoneJs(`document.getElementById('key-enter').click()`);
  await until('saisie validée', () => named !== undefined);
  check(named === 'Bille d’Été ✓', 'Valider au téléphone : Entrée du clavier à l’écran', String(named));
  check(!JOURNAL.join('\n').includes('Été'), 'rien de ce qui est tapé n’entre au journal');

  // 5. Envoi d'un fichier : du téléphone au dossier d'import, octet pour octet.
  const SIZE = 3 * core.REMOTE_CHUNK + 12_345;
  const NAME = 'Neon Abyss 1.2 (VPW).zip';
  await phoneJs(`${PATTERN}; startUpload(new File([pattern(${SIZE})], ${JSON.stringify(NAME)}))`);
  await until('fichier reçu', () => phoneJs(`document.getElementById('upload').dataset.phase === 'done'`), 15_000);
  const landed = path.join(L.import, NAME);
  const same = fs.existsSync(landed) && Buffer.compare(fs.readFileSync(landed), Buffer.from(pattern(SIZE))) === 0;
  check(same, 'le fichier envoyé arrive dans le dossier d’import, octet pour octet', fs.existsSync(landed) ? `${fs.statSync(landed).size} octets` : 'absent');
  check(!fs.readdirSync(L.import).some((n) => n.endsWith('.part')), 'rien de partiel ne reste dans le dossier d’import');
  check(banner === T('Reçu du téléphone : {name}, dans le dossier d’import', { name: NAME }), 'la borne le dit dans son bandeau');
  await shotBorne('recu');
  await shotPhone('recu');
  await phoneJs(`document.getElementById('upload-button').click()`);
  await phoneJs(`${PATTERN}; startUpload(new File([pattern(1000)], ${JSON.stringify(NAME)}))`);
  await until('second envoi reçu', () => phoneJs(`document.getElementById('upload').dataset.phase === 'done'`), 10_000);
  check(fs.existsSync(path.join(L.import, 'Neon Abyss 1.2 (VPW) (2).zip')), 'même nom déjà pris : « (2) », rien n’est écrasé');
  check(fs.statSync(landed).size === SIZE, 'le premier fichier est intact');
  await phoneJs(`document.getElementById('upload-button').click()`);

  // 6. Un téléphone brut reprend la liaison avec la clé de session (page du téléphone fermée).
  const session = (await phoneJs('location.hash')).match(/#s=([A-Za-z0-9_-]{43})/)?.[1];
  phone.destroy();
  const raw = rawPhone(address, session);
  await until('reprise', () => raw.has((m) => m.t === 'ready'));
  check(raw.has((m) => m.t === 'mode' && m.mode === 'menu'), 'reprise sans nouvelle acceptation : mode menu');

  // 7. Refus de l'envoi : trop gros, mode invité, nom qui remonte les dossiers, morceaux rejoués ou d'ailleurs.
  raw.send({ t: 'up', name: 'tout.7z', size: core.REMOTE_UPLOAD_MAX + 1 });
  await until('trop gros refusé', () => raw.has((m) => m.t === 'up-no'));
  check(raw.has((m) => m.t === 'up-no' && /2/.test(m.text)), 'plus de 2 Go : refusé, avec la raison', raw.inbox.find((m) => m?.t === 'up-no')?.text);
  raw.inbox.length = 0;
  guestOn = true;
  raw.send({ t: 'up', name: 'table.zip', size: 10 });
  await until('mode invité refusé', () => raw.has((m) => m.t === 'up-no'));
  check(raw.has((m) => m.t === 'up-no' && m.text === T('Indisponible en mode invité.')), 'mode invité : envoi refusé (porte phone.files fermée)');
  guestOn = false;
  raw.inbox.length = 0;
  raw.send({ t: 'up', name: '../../Windows/evil.txt', size: 5 });
  const ready1 = await until('envoi accepté', () => raw.inbox.find((m) => m?.t === 'up-ready'));
  check((await postChunk(address, raw, ready1.id, 0, Buffer.from('salut'))) === 204, 'morceau reçu');
  await until('reçu', () => raw.has((m) => m.t === 'up-done'));
  check(raw.has((m) => m.t === 'up-done' && m.name === 'evil.txt') && fs.existsSync(path.join(L.import, 'evil.txt')) && !fs.existsSync(path.join(BASE, 'Windows')), 'un nom qui remonte les dossiers reste dans le dossier d’import (evil.txt)');
  raw.inbox.length = 0;
  raw.send({ t: 'up', name: 'deux.bin', size: core.REMOTE_CHUNK + 10 });
  const ready2 = await until('envoi accepté', () => raw.inbox.find((m) => m?.t === 'up-ready'));
  const part = remote.uploadState()?.part;
  check((await postChunk(address, raw, ready2.id, 0, Buffer.alloc(core.REMOTE_CHUNK, 1), { host: `pirate.example:${address.port}` })) === 403, 'un morceau adressé à un autre nom d’hôte est refusé');
  check((await postChunk(address, raw, ready2.id, 0, Buffer.alloc(core.REMOTE_CHUNK, 1), { challenge: crypto.randomBytes(16) })) === 403, 'un morceau scellé pour une autre connexion est refusé');
  await until('envoi abandonné', () => raw.has((m) => m.t === 'up-no'));
  check(!remote.uploadState() && part && !fs.existsSync(part), 'l’envoi est abandonné, le fichier partiel effacé');
  raw.inbox.length = 0;
  raw.send({ t: 'up', name: 'deux.bin', size: core.REMOTE_CHUNK + 10 });
  const ready3 = await until('envoi accepté', () => raw.inbox.find((m) => m?.t === 'up-ready'));
  check((await postChunk(address, raw, ready3.id, 0, Buffer.alloc(core.REMOTE_CHUNK, 2))) === 204, 'premier morceau reçu');
  check((await postChunk(address, raw, ready3.id, 0, Buffer.alloc(core.REMOTE_CHUNK, 2))) === 400, 'le même morceau rejoué est refusé');
  check(!remote.uploadState() && !fs.existsSync(path.join(L.import, 'deux.bin')), 'rien n’est rangé d’un envoi interrompu');

  // 8. Une partie : la page attend, les boutons ne font rien ; au retour, le menu.
  library.leave();
  phase = 'playing';
  send();
  await until('mode partie', () => raw.has((m) => m.t === 'mode' && m.mode === 'game'));
  check(true, 'pendant une partie, le téléphone passe en attente');
  const calls = keyCalls;
  raw.send({ t: 'btn', b: 'confirm', down: true });
  raw.send({ t: 'btn', b: 'confirm', down: false });
  await delay(300);
  check(keyCalls === calls, 'les boutons du téléphone ne font rien pendant la partie (VPX a les boutons)');
  phase = 'library';
  library.openSystem();
  send();
  await until('retour au menu', () => raw.inbox.filter((m) => m?.t === 'mode').at(-1)?.mode === 'menu');
  check(true, 'au retour, le téléphone pilote de nouveau le menu');

  // 9. Le navigateur intégré prend le téléphone (pavé tactile), puis le rend au menu.
  const site = http.createServer((q, s) => s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Forum d’essai</title><p>Essai</p>'));
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const acquirer = createAcquirer({
    dir: () => path.join(BASE, 'recus'), received: () => {}, progress: () => {}, failed: () => {}, closed: () => {},
    screen: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }), exitKeys: () => [], navKeys: () => KEYS, remote,
  });
  acquirer.show({ url: `http://127.0.0.1:${site.address().port}/`, game: 'Neon Abyss', expected: 'Table', host: 'forum' });
  await until('mode navigateur', () => raw.inbox.filter((m) => m?.t === 'mode').at(-1)?.mode === 'browser');
  check(remote.connected() === 'browser', '« Récupérer » ouvert : le téléphone passe au pavé tactile, sans nouvelle acceptation');
  acquirer.current().win.close();
  await until('retour au menu', () => raw.inbox.filter((m) => m?.t === 'mode').at(-1)?.mode === 'menu');
  check(remote.connected() === 'menu' && !raw.closed, '« Récupérer » fermé : le téléphone revient aux boutons du menu, toujours connecté');
  site.close();

  // 10. Le QR du clavier à l'écran : un autre téléphone, après la déconnexion du premier.
  raw.send({ t: 'bye' });
  await until('premier téléphone parti', () => raw.closed);
  let typed;
  library.openPrompt(T('Chercher un titre'), T('Titre du jeu'), '', (value) => (typed = value ?? null));
  send();
  const kbOffer = await until('QR du clavier à l’écran', () => (remote.bar()?.phase === 'offer' ? remote.bar() : undefined));
  const kbSeen = readQr(await shotBorne('clavier-qr'));
  check(kbSeen === kbOffer?.url, 'le QR code sous le clavier à l’écran se lit sur la capture', kbSeen);
  // L'écoute s'était arrêtée (plus de QR ni de téléphone) : elle repart, sur un autre port, celui du QR.
  const kb = rawPhone(remote.address(), kbOffer.url.split('#k=')[1], { device: 'Android · Chrome' });
  await until('en attente', () => remote.pendingOn('keyboard'));
  await shotBorne('clavier-code');
  handleKey(key(KEYS.confirm[0]), false);
  await until('accepté depuis le clavier', () => kb.has((m) => m.t === 'ready'));
  check(view().editor?.value === '', 'Start accepte le téléphone sans taper de touche dans le clavier à l’écran');
  await until('champ envoyé', () => kb.has((m) => m.t === 'field' && m.field?.label === T('Titre du jeu')));
  kb.send({ t: 'set', value: 'Comet Run' });
  kb.send({ t: 'key', key: 'Enter' });
  await until('recherche validée', () => typed !== undefined);
  check(typed === 'Comet Run', 'le téléphone accepté au clavier tape la recherche et la valide', String(typed));
  await shotBorne('clavier-tape');

  // 11. Inactivité : sans geste au menu, la liaison se coupe.
  remoteOpts.idleMs = 1500;
  await until('coupure pour inactivité', () => kb.has((m) => m.t === 'end' && m.why === 'idle'), 6000);
  check(kb.has((m) => m.t === 'end' && m.why === 'idle'), 'sans geste au menu, la liaison se coupe (inactivité)');
  remoteOpts.idleMs = 3_600_000;

  // 12. Déconnecter à la borne, puis plus rien n'écoute ; la fermeture de Cyber Pinball.
  library.openSystem();
  act(T('Borne'));
  act(T('Télécommande du téléphone'));
  const offer3 = await until('QR', () => (remote.bar()?.phase === 'offer' ? remote.bar() : undefined));
  const thirdAddress = remote.address();
  const third = rawPhone(thirdAddress, offer3.url.split('#k=')[1]);
  await until('en attente', () => remote.pendingOn('menu'));
  handleKey(key(KEYS.confirm[0]), false);
  await until('accepté', () => third.has((m) => m.t === 'ready'));
  send();
  act(T('Déconnecter le téléphone'));
  await until('déconnecté', () => third.has((m) => m.t === 'end' && m.why === 'ended'));
  check(third.has((m) => m.t === 'end' && m.why === 'ended'), '« Déconnecter le téléphone » à la borne : le téléphone l’apprend');
  library.leave();
  phase = 'menu';
  send();
  await delay(200);
  check((await get(thirdAddress, '/')) !== 200, 'plus de QR affiché ni de téléphone : plus rien n’écoute');
  check(remote.bar() === undefined, 'plus de bloc télécommande');
  phase = 'library';
  library.openSystem();
  act(T('Borne'));
  act(T('Télécommande du téléphone'));
  const offer4 = await until('QR', () => (remote.bar()?.phase === 'offer' ? remote.bar() : undefined));
  const last = rawPhone(remote.address(), offer4.url.split('#k=')[1]);
  await until('en attente', () => remote.pendingOn('menu'));
  handleKey(key(KEYS.confirm[0]), false);
  await until('accepté', () => last.has((m) => m.t === 'ready'));
  const lastAddress = remote.address();
  remote.close();
  await until('fermeture annoncée', () => last.has((m) => m.t === 'end' && m.why === 'quit'));
  check(last.has((m) => m.t === 'end' && m.why === 'quit'), 'Cyber Pinball se ferme : le téléphone l’apprend');
  check((await get(lastAddress, '/')) !== 200, 'et plus rien n’écoute');
  ipcMain.removeListener('action', onAction);
  win.destroy();
}

function writeResult() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'resultat.txt'), `${[...LOG, '', 'Journal :', ...JOURNAL].join('\n')}\n`);
}

process.prependListener('uncaughtException', (error) => {
  check(false, 'exception non rattrapée', error?.stack ?? String(error));
  writeResult();
});
ipcMain.on('i18n', (e) => (e.returnValue = { language: LANG, locale: core.localeOf(LANG), messages: core.messagesOf(LANG) }));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  setTimeout(() => {
    check(false, 'plus de trois minutes, arrêt (dernière étape ci-dessus)');
    writeResult();
    app.exit(2);
  }, 180_000).unref();
  serveMedias(() => []);
  fs.mkdirSync(OUT, { recursive: true });
  const report = new LayoutReport(OUT);
  try {
    await run(report);
  } catch (error) {
    check(false, 'exception', error.stack);
  }
  report.save();
  const layout = path.join(OUT, 'mise-en-page.txt');
  if (fs.existsSync(layout)) {
    const text = fs.readFileSync(layout, 'utf8').trim();
    check(text === 'Aucun problème de mise en page.', 'garde-fou de mise en page : rien ne chevauche, rien n’est rogné, aucun texte trop petit', text.split('\n').slice(0, 4).join(' / '));
  }
  writeResult();
  console.log(LOG.join('\n'));
  app.exit(failures ? 1 : 0);
});
