// Démonstration et essai hors écran de la télécommande du téléphone (app/src/phone-remote.ts) :
// le navigateur intégré « Récupérer » s'ouvre sur une fausse page de connexion (un serveur d'essai
// sur 127.0.0.1, aucun site réel) ; un téléphone simulé, la vraie page du téléphone dans une
// fenêtre hors écran de 390 × 844, lit le QR code, est accepté par Start, déplace le pointeur au
// pavé, touche le champ, tape au clavier du téléphone (accents, émoji, effacement), passe au mot de
// passe, valide par Entrée, ouvre un lien par un appui long (clic droit), revient en arrière, puis se
// déconnecte. Ensuite, des téléphones bruts (le protocole à la main) vérifient ce qui doit être
// refusé : autre nom d'hôte, autre origine, QR déjà servi, Exit qui refuse, touche interdite, trame
// rejouée ; puis Fermer coupe tout. Tout sur 127.0.0.1 : jamais le vrai réseau.
//
// Lancé par docs\demo-telecommande.ps1 (bureau caché, captures dans tmp\demo-telecommande\captures),
// et par packages/core/src/test/telecommande.test.ts (CP_TELECOMMANDE_OUT : son dossier d'essai).
// Relevé : resultat.txt ; code de sortie 1 si une vérification échoue.

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const OUT = process.env.CP_TELECOMMANDE_OUT || path.join(WT, 'tmp', 'demo-telecommande', 'captures');
const CAPTURES = process.env.CP_TELECOMMANDE_CAPTURES !== '0';
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const phoneCore = require(path.join(WT, 'app', 'renderer', 'telephone', 'telephone-core.js'));
const { createAcquirer } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const { createPhoneRemote } = require(path.join(WT, 'app', 'dist', 'phone-remote.js'));
const { qrRows } = require(path.join(WT, 'app', 'dist', 'remote-qr.js'));
const jsQR = require(path.join(WT, 'node_modules', 'jsqr'));

const LOG = [];
const JOURNAL = [];
let failures = 0;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function check(ok, what, detail = '') {
  LOG.push(`${ok ? 'OK  ' : 'ÉCHEC'} ${what}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
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
    await delay(60);
  }
}

// --- Site d'essai : une page de connexion, une page de fichiers ---------------------------------

// Langue de la démonstration (CP_TELECOMMANDE_LANGUE : fr ou en) : celle de Cyber Pinball et du site d'essai.
const LANG = process.env.CP_TELECOMMANDE_LANGUE === 'en' ? 'en' : 'fr';
core.setLanguage(LANG);
const T = (text) => core.t(text);
const SITE =
  LANG === 'en'
    ? { lang: 'en', title: 'Sign in — Test forum', header: 'Test forum · table files', signIn: 'Sign in', user: 'Username or email', pass: 'Password', button: 'Sign in', done: 'Signed in: ', intro: 'Once signed in, the file page offers its download.', link: 'Table files page', filesTitle: 'Files — Test forum', file: 'Table file (12.4 MB) — Download' }
    : { lang: 'fr', title: 'Connexion — Forum d’essai', header: 'Forum d’essai · fichiers de tables', signIn: 'Connexion', user: 'Identifiant ou e-mail', pass: 'Mot de passe', button: 'Se connecter', done: 'Connecté : ', intro: 'Après la connexion, la page du fichier propose son téléchargement.', link: 'Page des fichiers de la table', filesTitle: 'Fichiers — Forum d’essai', file: 'Fichier de la table (12,4 Mo) — Télécharger' };

const LOGIN = `<!doctype html><html lang="${SITE.lang}"><meta charset="utf-8"><title>${SITE.title}</title>
<style>body{margin:0;font:22px/1.4 Segoe UI,sans-serif;background:#eef2f5;color:#1d2733}header{background:#2b4c7e;color:#fff;padding:18px 40px;font-size:26px}
main{display:grid;grid-template-columns:520px 1fr;gap:40px;padding:40px}form{background:#fff;border-radius:10px;padding:28px;display:grid;gap:14px;box-shadow:0 2px 12px #0002}
label{font-size:18px;color:#4a5a6a}input{font:inherit;padding:10px 12px;border:1px solid #b8c4d0;border-radius:6px}input:focus{outline:3px solid #6aa0ff}
button{font:inherit;padding:10px;border:0;border-radius:6px;background:#2b4c7e;color:#fff}#done{color:#1d7a35;font-weight:600}a{color:#2b4c7e;font-size:24px}
.tall{height:2600px;background:linear-gradient(#eef2f5,#d6dee6)}</style>
<header>${SITE.header}</header>
<main><form id="f"><b>${SITE.signIn}</b><label for="user">${SITE.user}</label><input id="user" autocomplete="username">
<label for="pass">${SITE.pass}</label><input id="pass" type="password" autocomplete="current-password"><button>${SITE.button}</button><div id="done"></div></form>
<div><p>${SITE.intro}</p><p><a id="link" href="/fichiers">${SITE.link}</a></p></div></main>
<div class="tall"></div>
<script>document.getElementById('f').addEventListener('submit',(e)=>{e.preventDefault();window.sent={user:user.value,pass:pass.value};document.getElementById('done').textContent=${JSON.stringify(SITE.done)}+user.value;});</script></html>`;
const FILES = `<!doctype html><html lang="${SITE.lang}"><meta charset="utf-8"><title>${SITE.filesTitle}</title>
<style>body{margin:0;font:22px/1.4 Segoe UI,sans-serif;background:#eef2f5;color:#1d2733}header{background:#2b4c7e;color:#fff;padding:18px 40px;font-size:26px}main{padding:40px}</style>
<header>${SITE.header}</header><main><h1>Neon Abyss 1.2</h1><p>${SITE.file}</p></main></html>`;

function siteServer() {
  const server = http.createServer((req, res) => {
    const body = req.url.startsWith('/fichiers') ? FILES : LOGIN;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// --- Téléphone brut : le protocole à la main (WebSocket masqué, messages scellés) ----------------

function rawPhone(address, keyB64, opts = {}) {
  const key = phoneCore.fromB64(keyB64);
  const mine = crypto.randomBytes(16);
  const inbox = [];
  let theirs;
  let sent = 0;
  let closed = false;
  let socket;
  let rest = Buffer.alloc(0);
  const frames = [];
  const phone = {
    inbox,
    frames,
    get closed() {
      return closed;
    },
    key,
    status: 0,
    sendRaw(text) {
      socket.write(core.encodeFrame(1, Buffer.from(text), crypto.randomBytes(4)));
    },
    send(message) {
      const frame = phoneCore.seal(phone.key, theirs, { ...message, s: ++sent });
      frames.push(frame);
      phone.sendRaw(frame);
    },
    close() {
      socket?.destroy();
    },
  };
  const req = http.request({
    host: '127.0.0.1',
    port: address.port,
    path: '/liaison',
    headers: { Host: opts.host ?? `127.0.0.1:${address.port}`, Origin: opts.origin ?? `http://127.0.0.1:${address.port}`, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') },
  });
  req.on('response', (res) => {
    phone.status = res.statusCode;
    closed = true;
  });
  req.on('error', () => (closed = true));
  req.on('upgrade', (res, s, head) => {
    phone.status = res.statusCode;
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
        // En clair (un objet JSON) : le défi de la borne, ou « clé inconnue » ; sinon une trame scellée.
        if (payload.startsWith('{')) {
          const plain = JSON.parse(payload);
          if (plain.t !== 'challenge') {
            inbox.push(plain);
            continue;
          }
          theirs = phoneCore.fromB64(plain.n);
          phone.send({ t: 'hello', c: phoneCore.toB64(mine), device: opts.device ?? 'Essai · Node' });
          continue;
        }
        const m = phoneCore.open(phone.key, mine, payload);
        if (m?.t === 'wait' && m.k) phone.key = phoneCore.fromB64(m.k);
        inbox.push(m);
      }
    };
    s.on('data', onData);
    // Le défi de la borne a pu arriver avec la réponse 101 (« head ») : lu d'abord.
    if (head?.length) onData(head);
    s.on('close', () => (closed = true));
  });
  req.end();
  return phone;
}

function get(address, url, host) {
  return new Promise((resolve) => {
    http
      .get({ host: '127.0.0.1', port: address.port, path: url, headers: { Host: host ?? `127.0.0.1:${address.port}` } }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      })
      .on('error', (e) => resolve({ status: 0, error: e.code }));
  });
}

// --- Captures ---------------------------------------------------------------------------------

function offscreen(width, height) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  win.setContentSize(width, height);
  return win;
}

/** La fenêtre « Récupérer » entière : bandeau, page du site, et le pointeur du téléphone par-dessus. */
async function shotBorne(acquirer, remote, name) {
  if (!CAPTURES) return;
  const open = acquirer.current();
  const bounds = open.win.getBounds();
  await delay(250);
  const pageBounds = open.view.getBounds();
  const bar = (await open.win.capturePage()).crop({ x: 0, y: 0, width: bounds.width, height: pageBounds.y });
  const page = await open.view.webContents.capturePage();
  const pointer = remote.pointerView();
  const shown = pointer && !pointer.webContents.isDestroyed() && pointer.getVisible();
  const pointerImg = shown ? await pointer.webContents.capturePage() : undefined;
  const pb = shown ? pointer.getBounds() : undefined;
  const composer = offscreen(bounds.width, bounds.height);
  const html = `<!doctype html><style>body{margin:0;background:#000;position:relative;width:${bounds.width}px;height:${bounds.height}px;overflow:hidden}img{position:absolute;display:block}</style>
<img src="${bar.toDataURL()}" style="left:0;top:0"><img src="${page.toDataURL()}" style="left:0;top:${pageBounds.y}px">${pointerImg ? `<img src="${pointerImg.toDataURL()}" style="left:${pb.x}px;top:${pb.y}px">` : ''}`;
  await composer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await delay(300);
  fs.writeFileSync(path.join(OUT, `borne-${name}.png`), (await composer.capturePage()).toPNG());
  composer.destroy();
}

async function shotPhone(phone, name) {
  if (!CAPTURES) return;
  await delay(250);
  fs.writeFileSync(path.join(OUT, `telephone-${name}.png`), (await phone.webContents.capturePage()).toPNG());
}

// --- Le scénario --------------------------------------------------------------------------------

const ZOOM = 2;
async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const site = await siteServer();
  const siteUrl = `http://127.0.0.1:${site.address().port}/connexion`;
  const remote = createPhoneRemote({ mode: () => 'loopback', log: (line) => JOURNAL.push(line) });
  const dir = path.join(OUT, 'recus');
  const acquirer = createAcquirer({
    dir: () => dir,
    received: () => {},
    progress: () => {},
    failed: () => {},
    closed: () => {},
    screen: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
    exitKeys: () => [],
    navKeys: () => ({ previous: ['ShiftLeft'], next: ['ShiftRight'], confirm: ['Digit1'] }),
    remote,
  });
  acquirer.show(
    LANG === 'en'
      ? { url: siteUrl, game: 'Neon Abyss (Orbital Works 1994)', expected: 'Table: Neon Abyss 1.2', host: 'test forum, account required' }
      : { url: siteUrl, game: 'Neon Abyss (Orbital Works 1994)', expected: 'Table : Neon Abyss 1.2', host: 'forum d’essai, compte nécessaire' },
  );
  const open = acquirer.current();
  const page = open.view.webContents;
  const bandeau = open.win.webContents;
  const pageJs = (code) => page.executeJavaScript(code, true);

  // 1. Le QR code dans le bandeau : il porte l'adresse de la page du téléphone et sa clé.
  const offer = await until('QR code dans le bandeau', () => (remote.bar()?.phase === 'offer' ? remote.bar() : undefined));
  if (!offer) return;
  const address = remote.address();
  check(address.host === '127.0.0.1', 'essai sur 127.0.0.1 seulement', `${address.host}:${address.port}`);
  const matrix = offer.qr;
  const scale = 6;
  const n = matrix.length + 8;
  const rgba = new Uint8ClampedArray(n * scale * n * scale * 4).fill(255);
  matrix.forEach((row, y) => [...row].forEach((bit, x) => {
    if (bit !== '1') return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + 4) * scale + dy) * n * scale + (x + 4) * scale + dx) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
    }
  }));
  const decoded = jsQR(rgba, n * scale, n * scale);
  check(decoded?.data === offer.url, 'le QR code se lit et donne l’adresse de la page du téléphone', decoded?.data);
  check(/^http:\/\/127\.0\.0\.1:\d+\/#k=[A-Za-z0-9_-]{43}$/.test(offer.url), 'la clé est dans le fragment de l’adresse (jamais envoyée au serveur)');
  check(JSON.stringify(qrRows(offer.url)) === JSON.stringify(matrix), 'même matrice que remote-qr.ts');
  await until('bandeau dessiné', () => bandeau.executeJavaScript(`!document.getElementById('remote').hidden && !document.getElementById('remote-qr').hidden`));
  await until('page chargée', () => pageJs(`document.readyState === 'complete' && !!document.getElementById('user')`));
  await shotBorne(acquirer, remote, '1-qr');

  // 2. Ce que sert la borne : la page, ses en-têtes ; rien d'autre, à personne d'autre.
  const home = await get(address, '/');
  check(home.status === 200 && /default-src 'none'/.test(home.headers['content-security-policy'] ?? ''), 'page du téléphone servie avec une politique de sécurité stricte');
  check(home.headers['cache-control'] === 'no-store' && home.headers['referrer-policy'] === 'no-referrer', 'ni cache, ni référent');
  check((await get(address, '/../package.json')).status === 404, 'aucun autre fichier servi');
  check((await get(address, '/', `pirate.example:${address.port}`)).status === 403, 'autre nom d’hôte refusé (rebond DNS)');
  const catalogue = await get(address, '/catalogue.js');
  check(catalogue.status === 200 && /window\.cyberI18n/.test(catalogue.body), 'catalogue de la langue servi');
  const wrongOrigin = rawPhone(address, offer.url.split('#k=')[1], { origin: 'http://pirate.example' });
  await until('autre origine refusée', () => wrongOrigin.closed);
  check(wrongOrigin.status === 403, 'liaison d’une autre origine refusée', String(wrongOrigin.status));

  // 3. Le téléphone lit le QR code : il attend d'être accepté, le même code des deux côtés.
  const phone = offscreen(390 * ZOOM, 844 * ZOOM);
  phone.webContents.setZoomFactor(ZOOM);
  phone.webContents.on('console-message', (e) => LOG.push(`téléphone (console) : ${e.message}`));
  await phone.loadURL(offer.url);
  phone.webContents.setZoomFactor(ZOOM);
  const phoneJs = (code) => phone.webContents.executeJavaScript(code, true);
  await until('téléphone en attente', () => phoneJs(`document.body.dataset.state === 'waiting'`));
  const pending = remote.bar();
  const phoneCode = await phoneJs(`document.getElementById('code').textContent`);
  check(pending?.phase === 'pending' && pending.code === phoneCode, 'même code sur la borne et sur le téléphone', `${pending?.code} / ${phoneCode}`);
  check(/^#s=[A-Za-z0-9_-]{43}&c=\d{4}$/.test(await phoneJs('location.hash')), 'le téléphone a remplacé la clé du QR par sa clé de session');
  const second = rawPhone(address, offer.url.split('#k=')[1]);
  await until('QR déjà servi', () => second.inbox.length);
  if (!second.inbox.length) LOG.push(`second téléphone : statut ${second.status}, fermé ${second.closed}`);
  check(second.inbox[0]?.t === 'end' && second.inbox[0]?.why === 'used', 'un second téléphone avec le même QR : « déjà utilisé »', JSON.stringify(second.inbox[0]));
  await until('bandeau : téléphone à accepter', () => bandeau.executeJavaScript(`document.getElementById('remote').dataset.phase === 'pending'`));
  await shotBorne(acquirer, remote, '2-accepter');
  await shotPhone(phone, '1-attente');

  // 4. Start à la borne l'accepte.
  bandeau.sendInputEvent({ type: 'keyDown', keyCode: '1' });
  bandeau.sendInputEvent({ type: 'keyUp', keyCode: '1' });
  await until('téléphone accepté', () => phoneJs(`document.body.dataset.state === 'paired'`));
  check(remote.bar()?.phase === 'paired', 'Start accepte le téléphone');
  await until('titre de la page sur le téléphone', () => phoneJs(`document.getElementById('page-title').textContent.includes(${JSON.stringify(SITE.signIn === 'Connexion' ? 'Connexion' : 'Sign in')})`));
  check(await phoneJs(`document.getElementById('nav-back').disabled`), 'Retour grisé : aucune page précédente');
  await shotPhone(phone, '2-pave');

  // Gestes du pavé : des glissés de souris dans la fenêtre du téléphone (événements de pointeur).
  // Le pavé, mesuré à chaque geste : il rétrécit quand le panneau du clavier est ouvert.
  let padBox;
  const measurePad = async () => (padBox = await phoneJs(`(() => { const r = document.getElementById('pad').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`));
  await measurePad();
  const mouse = (type, x, y, extra = {}) => phone.webContents.sendInputEvent({ type, x: Math.round(x * ZOOM), y: Math.round(y * ZOOM), button: 'left', clickCount: 1, ...extra });
  async function drag(dx, dy) {
    await measurePad();
    const x0 = padBox.x + padBox.w / 2 - dx / 2;
    const y0 = padBox.y + padBox.h / 2 - dy / 2;
    mouse('mouseDown', x0, y0);
    // Lentement (6 px toutes les 25 ms) : on vise, sans l'accélération d'un glissé rapide ; au
    // moins 12 pas (300 ms) : un geste plus court et plus petit qu'un doigt serait un toucher (clic).
    const steps = Math.max(12, Math.ceil(Math.hypot(dx, dy) / 6));
    for (let i = 1; i <= steps; i++) {
      await delay(25);
      mouse('mouseMove', x0 + (dx * i) / steps, y0 + (dy * i) / steps, { button: 'left' });
    }
    await delay(40);
    mouse('mouseUp', x0 + dx, y0 + dy);
    await delay(120);
  }
  async function pointTo(selector) {
    const target = await pageJs(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; })()`);
    await measurePad();
    const area = open.view.getBounds();
    const slow = Math.max(area.width, area.height) / 1100 * 0.9;
    for (let i = 0; i < 10; i++) {
      const at = remote.pointerAt();
      const ex = target.x - at.x;
      const ey = target.y - at.y;
      if (Math.hypot(ex, ey) < 6) return true;
      // Un glissé lent au plus de la taille du pavé ; le reste au tour suivant.
      const k = Math.min(1, (padBox.w * 0.8) / Math.max(1, Math.abs(ex / slow)), (padBox.h * 0.8) / Math.max(1, Math.abs(ey / slow)));
      await drag((ex / slow) * k, (ey / slow) * k);
    }
    const at = remote.pointerAt();
    const ok = Math.hypot(target.x - at.x, target.y - at.y) < 6;
    if (!ok) LOG.push(`pointeur : visé ${JSON.stringify(target)}, atteint ${JSON.stringify(at)}, pavé ${JSON.stringify(padBox)}, téléphone ${await phoneJs('document.body.dataset.state')}, borne ${remote.bar()?.phase}`);
    return ok;
  }
  async function tap() {
    await measurePad();
    const x = padBox.x + padBox.w / 2;
    const y = padBox.y + padBox.h / 2;
    mouse('mouseDown', x, y);
    await delay(60);
    mouse('mouseUp', x, y);
    await delay(400);
  }

  // 5. Le pointeur va au champ Identifiant, un toucher clique : le clavier du téléphone s'ouvre.
  check(await pointTo('#user'), 'le pavé amène le pointeur sur le champ');
  await tap();
  check(await pageJs(`document.activeElement && document.activeElement.id === 'user'`), 'un toucher du pavé clique : le champ a le clavier');
  await until('panneau du clavier ouvert', () => phoneJs(`!document.getElementById('keys').hidden`));
  check((await phoneJs(`document.getElementById('field-label').textContent`)) === SITE.user, 'le téléphone montre le libellé du champ de la borne');
  await phoneJs(`document.getElementById('field').focus()`);
  await phone.webContents.insertText('Bille d’Été ✓ 🎉');
  await until('texte reçu dans le champ', () => pageJs(`document.getElementById('user').value === 'Bille d’Été ✓ 🎉'`));
  check((await pageJs(`document.getElementById('user').value`)) === 'Bille d’Été ✓ 🎉', 'accents et émoji arrivent tels quels', await pageJs(`document.getElementById('user').value`));
  // Effacer deux fois (l'émoji, puis l'espace), puis un point d'exclamation.
  await phoneJs(`document.getElementById('key-backspace').click(); document.getElementById('key-backspace').click();`);
  await phone.webContents.insertText('!');
  await until('effacement', () => pageJs(`document.getElementById('user').value === 'Bille d’Été ✓!'`));
  check((await pageJs(`document.getElementById('user').value`)) === 'Bille d’Été ✓!', 'Effacer retire un caractère entier (émoji compris)', await pageJs(`document.getElementById('user').value`));
  await shotBorne(acquirer, remote, '3-identifiant');
  await shotPhone(phone, '3-identifiant');

  // 6. « Champ suivant » : le mot de passe ; le téléphone passe en champ masqué.
  await phoneJs(`document.getElementById('key-tab').click()`);
  await until('mot de passe actif', () => pageJs(`document.activeElement && document.activeElement.id === 'pass'`));
  await until('champ masqué sur le téléphone', () => phoneJs(`document.getElementById('field').type === 'password'`));
  check(await phoneJs(`document.getElementById('field').type === 'password' && document.getElementById('field').value === ''`), 'mot de passe : champ masqué, vide, sur le téléphone');
  await phoneJs(`document.getElementById('field').focus()`);
  await phone.webContents.insertText('sécret-42');
  await until('mot de passe reçu', () => pageJs(`document.getElementById('pass').value === 'sécret-42'`));
  check((await pageJs(`document.getElementById('pass').value`)) === 'sécret-42', 'le mot de passe tapé au téléphone arrive dans le champ');
  await shotBorne(acquirer, remote, '4-mot-de-passe');
  await shotPhone(phone, '4-mot-de-passe');
  // 7. Entrée : le formulaire part.
  await phoneJs(`document.getElementById('key-enter').click()`);
  await until('formulaire envoyé', () => pageJs(`!!window.sent`));
  check(JSON.stringify(await pageJs('window.sent')) === JSON.stringify({ user: 'Bille d’Été ✓!', pass: 'sécret-42' }), 'Entrée envoie le formulaire de la page');
  check(!JOURNAL.join('\n').includes('sécret') && !JOURNAL.join('\n').includes('Bille d’Été'), 'rien de ce qui est tapé n’entre au journal');
  await shotBorne(acquirer, remote, '5-connecte');

  // 8. Appui long sur le lien : le menu de la page part au téléphone, « Ouvrir le lien ».
  check(await pointTo('#link'), 'le pointeur va sur le lien');
  await measurePad();
  {
    const x = padBox.x + padBox.w / 2;
    const y = padBox.y + padBox.h / 2;
    mouse('mouseDown', x, y);
    await delay(800);
    mouse('mouseUp', x, y);
  }
  await until('menu du clic droit sur le téléphone', () => phoneJs(`!document.getElementById('sheet').hidden && document.getElementById('sheet-actions').textContent.includes(${JSON.stringify(T('Ouvrir le lien'))})`));
  await shotPhone(phone, '5-clic-droit');
  await phoneJs(`[...document.querySelectorAll('#sheet-actions button')].find((b) => b.textContent === ${JSON.stringify(T('Ouvrir le lien'))}).click()`);
  await until('page des fichiers', () => page.getURL().includes('/fichiers'));
  check(page.getURL().includes('/fichiers'), 'appui long, « Ouvrir le lien » : la page suit', page.getURL());
  await until('Retour actif', () => phoneJs(`!document.getElementById('nav-back').disabled`));

  // 9. Retour, Avancer.
  await phoneJs(`document.getElementById('nav-back').click()`);
  await until('retour', () => page.getURL().includes('/connexion'));
  check(page.getURL().includes('/connexion'), 'Retour revient à la page précédente');
  await until('Avancer actif', () => phoneJs(`!document.getElementById('nav-forward').disabled`));
  await phoneJs(`document.getElementById('nav-forward').click()`);
  await until('avancer', () => page.getURL().includes('/fichiers'));
  check(page.getURL().includes('/fichiers'), 'Avancer reprend la page suivante');
  await phoneJs(`document.getElementById('nav-more').click()`);
  await until('feuille Plus', () => phoneJs(`!document.getElementById('sheet').hidden`));
  await shotPhone(phone, '6-plus');
  await phoneJs(`document.getElementById('sheet-cancel').click(); document.getElementById('nav-close').click()`);
  await until('confirmation de fermeture', () => phoneJs(`!document.getElementById('sheet').hidden`));
  await shotPhone(phone, '7-fermer');
  await phoneJs(`document.getElementById('sheet-cancel').click()`);
  await shotBorne(acquirer, remote, '6-pilote');

  // 10. Le téléphone se déconnecte : un QR neuf, une autre clé.
  await phoneJs(`document.getElementById('nav-more').click()`);
  await phoneJs(`[...document.querySelectorAll('#sheet-actions button')].find((b) => b.textContent === ${JSON.stringify(T('Déconnecter ce téléphone'))}).click()`);
  const fresh = await until('QR neuf', () => (remote.bar()?.phase === 'offer' ? remote.bar() : undefined));
  check(fresh && fresh.url !== offer.url, 'déconnecté : un QR neuf, avec une autre clé');
  check(await phoneJs(`document.body.dataset.state === 'ended'`), 'le téléphone dit « Téléphone déconnecté »');
  await shotPhone(phone, '8-deconnecte');
  phone.destroy();

  // 11. Exit à la borne refuse un téléphone qui attend ; la fenêtre reste ouverte.
  const refused = rawPhone(address, fresh.url.split('#k=')[1], { device: 'Refusé · Essai' });
  await until('téléphone brut en attente', () => remote.bar()?.phase === 'pending');
  bandeau.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  bandeau.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await until('refus reçu', () => refused.inbox.some((m) => m?.t === 'end'));
  check(refused.inbox.some((m) => m?.t === 'end' && m.why === 'refused'), 'Exit refuse le téléphone qui attend');
  check(acquirer.isOpen(), 'Exit qui refuse ne ferme pas le navigateur');

  // 12. Un téléphone brut, accepté par le bouton du bandeau : défilement, touche interdite, trame rejouée, reprise.
  const offer2 = await until('QR après refus', () => (remote.bar()?.phase === 'offer' ? remote.bar() : undefined));
  const raw = rawPhone(address, offer2.url.split('#k=')[1]);
  await until('en attente', () => remote.bar()?.phase === 'pending');
  await until('bouton Accepter', () => bandeau.executeJavaScript(`!document.getElementById('remote-accept').hidden`));
  await bandeau.executeJavaScript(`document.getElementById('remote-accept').click()`);
  await until('accepté par le bouton', () => raw.inbox.some((m) => m?.t === 'ready'));
  check(remote.bar()?.phase === 'paired', 'le bouton « Accepter » du bandeau accepte');
  page.loadURL(siteUrl);
  await until('page de connexion', () => pageJs(`document.readyState === 'complete' && !!document.getElementById('user')`));
  // Un instant après le chargement, comme un doigt : Chromium perd une molette reçue juste à la fin du chargement.
  await delay(500);
  raw.send({ t: 'scroll', dx: 0, dy: -400 });
  await until('défilement', () => pageJs('window.scrollY > 0'));
  check((await pageJs('window.scrollY')) > 0, 'deux doigts : la page défile', String(await pageJs('window.scrollY')));
  raw.sendRaw(raw.frames[raw.frames.length - 1]);
  await until('trame rejouée refusée', () => raw.closed);
  check(raw.closed, 'une trame rejouée coupe la liaison');
  check(remote.bar()?.phase === 'paired', 'la liaison coupée ne déconnecte pas le téléphone accepté');
  // Reprise : la clé de session suffit, sans nouvelle acceptation (page rechargée, Wi-Fi retrouvé).
  const back = rawPhone(address, phoneCore.toB64(raw.key));
  await until('reprise', () => back.inbox.some((m) => m?.t === 'ready'));
  check(back.inbox.some((m) => m?.t === 'ready'), 'la clé de session reprend la liaison sans nouvelle acceptation');
  back.send({ t: 'key', key: 'Escape' });
  await until('touche interdite', () => back.closed);
  check(back.closed && acquirer.isOpen(), 'Échap n’est pas une touche du téléphone : liaison coupée, navigateur ouvert');
  const intruder = rawPhone(address, phoneCore.toB64(crypto.randomBytes(32)));
  await until('clé inconnue', () => intruder.inbox.length || intruder.closed);
  check(intruder.inbox[0]?.t === 'unknown', 'une clé inconnue ne pilote rien');

  // 13. Fermer depuis le téléphone : le navigateur se ferme, la liaison et l'écoute s'arrêtent.
  const last = rawPhone(address, phoneCore.toB64(raw.key));
  await until('reprise avant fermeture', () => last.inbox.some((m) => m?.t === 'ready'));
  last.send({ t: 'nav', action: 'close' });
  await until('fermeture annoncée', () => last.inbox.some((m) => m?.t === 'end'));
  check(last.inbox.some((m) => m?.t === 'end' && m.why === 'closed'), 'Fermer : le téléphone apprend que le navigateur est fermé');
  await until('navigateur fermé', () => !acquirer.isOpen());
  check(!acquirer.isOpen(), 'Fermer ferme le navigateur intégré');
  const after = await get(address, '/');
  check(after.status === 0, 'plus rien n’écoute après la fermeture', after.error);
  check(remote.bar() === undefined, 'plus de bloc télécommande');
  site.close();
}

function writeResult() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'resultat.txt'), `${[...LOG, '', 'Journal :', ...JOURNAL].join('\n')}\n`);
}

// Une exception non rattrapée arrête l'essai (offscreen.ts) : le relevé est écrit avant.
process.prependListener('uncaughtException', (error) => {
  check(false, 'exception non rattrapée', error?.stack ?? String(error));
  writeResult();
});

// Catalogue de la langue du bandeau, comme le menu (language.ts).
ipcMain.on('i18n', (e) => (e.returnValue = { language: LANG, locale: core.localeOf(LANG), messages: core.messagesOf(LANG) }));
// La dernière fenêtre fermée (Fermer, à la fin) ne doit pas arrêter l'essai avant son relevé.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  try {
    await run();
  } catch (error) {
    check(false, 'exception', error.stack);
  }
  writeResult();
  console.log(LOG.join('\n'));
  app.exit(failures ? 1 : 0);
});
