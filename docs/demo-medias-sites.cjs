// Démonstration hors écran des médias des sites communautaires (docs/recherche/
// sources-medias.md § 6) : propositions du topper et du logo de Terminator 2 avec
// VPForums puis VPUniverse, file d'attente, minuteur de VPUniverse, fichiers reçus et
// pack complet. Lancée par docs\demo-medias-sites.ps1 sur le bureau caché ; profil
// Electron à part (tmp\demo-medias-sites-profil) : la session de l'utilisateur n'est
// jamais touchée. Captures et relevé dans tmp\demo-medias-sites\captures.
//   npm run build
//   .\docs\demo-medias-sites.ps1
//
// 1. Vrais sites, en visiteur et en lecture seule : une page de résultats de VPUniverse
//    (« terminator 2 »), celle de VPForums (réservée aux membres), une vignette. Rien
//    n'est téléchargé, aucun compte n'est utilisé.
// 2. Fausses fiches imitant les deux moteurs (Invision, IP.Board 3), interceptées dans
//    la session : pas connecté (VPForums demande la connexion, VPUniverse montre ses
//    résultats), puis connecté ; une vidéo du topper sur VPUniverse, derrière un
//    minuteur de 20 s qui se déroule dans la page comme sur le site (appel au serveur,
//    décompte, puis le fichier) ; un pack complet sur VPForums, rangé à la manière de
//    Popper ; réception, mise dans le brouillon, logo du pack proposé sur l'écran du logo.
// 3. (Avant la file.) Afficheur : la borne de démonstration a un écran DMD 16:9, elle montre l'Afficheur
//    large ; l'écran de l'Afficheur (4:1) le dit et mène à l'autre. Chaque site dit
//    combien de ses résultats servent au média ouvert. « Chercher sur le web… » ouvre la
//    fenêtre « Récupérer » sur une fausse page de DuckDuckGo ; le fichier qu'on y
//    télécharge revient dans le brouillon. Enregistré, il devient l'actuel : le reprendre
//    ne change rien, l'écran le dit au lieu de le réécrire.

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-medias-sites');
const CAPTURES = path.join(BASE, 'captures');
// Profil Electron à part, vidé à chaque essai (avant le démarrage, rien ne le tient ouvert).
const PROFILE = path.join(WT, 'tmp', 'demo-medias-sites-profil');
fs.rmSync(PROFILE, { recursive: true, force: true });
app.setPath('userData', PROFILE);

const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { ACQUIRE_PARTITION, createAcquirer } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const { vpxWithInfo, zipStored } = require('./demo-fichiers.cjs');

const REAL_DOWNLOADS = 'D:\\CyberPinball\\downloads';
const T2 = 'BunvWvh9';
const FOLDER = 'Terminator 2 (Williams 1991)';
const WAIT = 20;
const LOG = [];
let servedDirs = () => [];

// Ramasse-miettes appelé pendant chaque attente : une vue cachée que plus rien ne garde
// (téléchargement direct, lecture d'une page) disparaîtrait au hasard d'un GC ; ici, à coup sûr.
require('node:v8').setFlagsFromString('--expose-gc');
const gc = require('node:vm').runInNewContext('gc');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
/** Étapes au fil de l'eau (trace.txt) : une démonstration bloquée dit où. */
function trace(text) {
  fs.mkdirSync(BASE, { recursive: true });
  fs.appendFileSync(path.join(BASE, 'trace.txt'), `${new Date().toISOString().slice(11, 19)} ${text}\n`);
}
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}
function put(file, data = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

/** Image unie (vignette d'une fausse fiche, logo du pack). */
function png(width, height, [r, g, b]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([r, g, b, 255], i * 4);
  return core.encodePng({ width, height, data });
}

function sandbox(name) {
  const root = path.join(BASE, name);
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(REAL_DOWNLOADS)) if (/^(vpsdb|vpinmdb)/.test(f)) fs.copyFileSync(path.join(REAL_DOWNLOADS, f), path.join(L.downloads, f));
  const dir = path.join(L.tables, FOLDER);
  put(path.join(dir, `${FOLDER}.vpx`), vpxWithInfo({ TableName: 'Terminator 2 - Judgment Day (Williams 1991)', AuthorName: 'g5k, VPW', TableVersion: '1.25' }));
  put(path.join(dir, `${FOLDER}.info`), JSON.stringify({ Info: { Title: 'Terminator 2', Manufacturer: 'Williams', Year: 1991, VPSId: T2 } }, null, 2));
  const screen = (fingerprint, widthPx, heightPx) => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 });
  core.saveCabinet(L.data, {
    version: 1,
    screens: [screen('pf', 1920, 1080), screen('bg', 1920, 1080), screen('dmd', 1920, 1080), screen('top', 1920, 540)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd', topper: 'top' },
    playfield: { flipperEdge: 'bottom' },
    vpx: { iniPath: '' },
    updatedAt: '',
  });
  return { root, L };
}

/**
 * Fausses fiches : recherche et fiche d'Invision (vpuniverse.com) avec le minuteur tel
 * que le site le déroule (le clic demande l'attente au serveur, la page décompte puis
 * va au fichier) ; recherche et fiche d'IP.Board 3 (vpforums.org) pour un membre.
 * Le membre est connecté si la session a ses cookies.
 */
function fakeSites(acq, counters, videos) {
  const cookies = async (domain) => (await acq.cookies.get({})).filter((c) => c.domain.replace(/^\./, '').endsWith(domain)).map((c) => `${c.name}=${c.value}`).join('; ');
  const html = (body, logged) =>
    new Response(`<!doctype html><html data-logged-in="${logged}"><meta charset="utf-8"><body style="font-family:Segoe UI;background:#1b1f2a;color:#e5e7eb;padding:40px">${body}</body></html>`, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  const attachment = (name, data) => new Response(data, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name}"` } });
  const item = (id, slug, title, cat, catLabel, author, downloads) => `
    <li class="ipsStreamItem"><div class="ipsStreamItem_container">
      <h2 class="ipsStreamItem_title"><a href="https://vpuniverse.com/files/file/${id}-${slug}/">${title}</a></h2>
      <p class="ipsStreamItem_status"><a href="https://vpuniverse.com/profile/1-${author.toLowerCase()}/">${author}</a> posted a file in <a href="https://vpuniverse.com/files/category/${cat}/">${catLabel}</a></p>
      <img src="https://vpuniverse.com/screenshots/monthly_2025_12/${slug}.thumb.png.0123.png">
      <p>Version 1.0.0</p><p>${downloads} downloads</p><time datetime="2025-12-28T08:48:57Z">December 28, 2025</time>
    </div></li>`;
  return async (request) => {
    const url = new URL(request.url);
    const host = url.hostname.replace(/^www\./, '');
    const cookie = await cookies(host);
    if (host === 'vpuniverse.com') {
      const logged = /ips4_member_id=[1-9]/.test(cookie);
      const settings = `<script>window.ipsSettings = { memberID: ${logged ? 4242 : 0} };</script>${logged ? '' : '<a id="elUserSignIn" href="/login/">Sign In</a>'}`;
      if (url.pathname.startsWith('/screenshots/')) return new Response(png(320, 90, url.pathname.includes('wheel') ? [40, 120, 200] : [180, 40, 30]), { headers: { 'content-type': 'image/png' } });
      if (url.pathname === '/search/') {
        counters.vpuSearch++;
        return html(
          `${settings}<ol>
          ${item('27996', 't2-chrome-topper', 'Terminator 2 - Judgment Day Chrome Edition Topper', '160-topper-videos', 'Topper Videos', 'Hanibal2001', 88)}
          ${item('29322', 't2-animated-wheel', 'Terminator 2 (Williams 1991) Animated Wheel APNG', '149-animated-wheel-images-apng', 'Animated Wheel Images (APNG)', 'Tarcisio', 412)}
          ${item('28887', 't3-topper', 'Terminator 3 (Stern 2003) Topper Video', '160-topper-videos', 'Topper Videos', 'Jonny', 241)}
          ${item('12517', 't2-full-dmd', 'Terminator 2 (Williams 1991) Full DMD animated', '143-fulldmd-videos', 'FullDMD Videos', 'Wizball', 530)}
          </ol>`,
          logged,
        );
      }
      const file = /^\/files\/file\/(\d+)-/.exec(url.pathname);
      if (!file) return new Response('absent', { status: 404 });
      if (!logged) return html(`${settings}<p>Create an account or sign in to download this</p>`, false);
      const r = url.searchParams.get('r');
      if (url.searchParams.get('do') === 'download' && r) {
        // Lien de la ligne : en AJAX, l'heure à attendre ; ensuite, le fichier (le serveur tient l'attente).
        if (request.headers.get('x-requested-with') === 'XMLHttpRequest') {
          counters.waitAsked++;
          const now = Math.floor(Date.now() / 1000);
          counters.allowedAt = (now + WAIT) * 1000;
          return new Response(JSON.stringify({ download: now + WAIT, currentTime: now }), { headers: { 'content-type': 'application/json' } });
        }
        if (!counters.allowedAt || Date.now() + 500 < counters.allowedAt) {
          counters.tooEarly++;
          return html('<p>Please wait</p>', true);
        }
        return attachment('T2 Chrome Topper.webm', videos.chrome);
      }
      if (url.searchParams.get('do') === 'download') {
        // Page de choix d'Invision, une seule ligne, avec le minuteur du groupe gratuit.
        return html(
          `${settings}<h1>Download</h1>
          <div class="ipsDataItem"><span>T2 Chrome Topper.webm</span>
            <a id="dl" href="${url.origin}${url.pathname}?do=download&r=1&confirm=1&t=1&csrfKey=k" data-action="download" data-wait="true">Download</a>
            <span data-role="downloadCounterContainer" class="ipsHide">Wait <span data-role="downloadCounter"></span> seconds</span>
          </div>
          <script>
            document.getElementById('dl').addEventListener('click', async (e) => {
              e.preventDefault();
              const a = e.currentTarget;
              const r = await (await fetch(a.href, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })).json();
              let left = r.download - r.currentTime;
              const counter = document.querySelector('[data-role="downloadCounter"]');
              counter.textContent = left;
              const timer = setInterval(() => { left--; counter.textContent = left; if (left === 0) { clearInterval(timer); window.location = a.href; } }, 1000);
            });
          </script>`,
          true,
        );
      }
      return html(`${settings}<h1>Fiche ${file[1]}</h1><a class="ipsButton" href="${url.origin}${url.pathname}?do=download">Download this file</a>`, true);
    }
    if (host === 'vpforums.org') {
      const logged = /member_id=[1-9]/.test(cookie);
      const signIn = '<form id="login" action="index.php?app=core&module=global&section=login&do=process"><a id="sign_in" href="index.php?app=core&module=global&section=login">Sign In</a></form>';
      if (url.searchParams.get('module') === 'search') {
        counters.vpfSearch++;
        if (!logged) return html(signIn, false);
        return html(
          `<div id="user_link">demo</div><div id="idm_category">
          <div class="idm_category_row">
            <a href="https://www.vpforums.org/index.php?s=0a1b&amp;app=downloads&amp;showfile=7001"><img class="screenshot" src="https://www.vpforums.org/index.php?app=downloads&amp;module=display&amp;section=screenshot&amp;record=1&amp;id=7001"></a>
            <a href="https://www.vpforums.org/index.php?s=0a1b&amp;app=downloads&amp;showfile=7001" title="View file named Terminator 2 (Williams 1991) (FS) (Media Pack)">Terminator 2 (Williams 1991) (FS) (Media Pack) <span>1.0</span></a>
            in <a href="https://www.vpforums.org/index.php?app=downloads&amp;showcat=35">Complete Media Packs</a>
            by <a href="https://www.vpforums.org/index.php?showuser=12">Wizball</a>
          </div></div>`,
          true,
        );
      }
      if (url.searchParams.get('section') === 'screenshot') return new Response(png(320, 90, [30, 60, 140]), { headers: { 'content-type': 'image/png' } });
      if (url.searchParams.get('do') === 'confirm_download') {
        return attachment(
          'Terminator 2 (Williams 1991) Media Pack.zip',
          zipStored({
            'POPMedia/Visual Pinball X/Wheel/Terminator 2 (Williams 1991).png': png(400, 400, [40, 160, 70]),
            'POPMedia/Visual Pinball X/Topper/Terminator 2 (Williams 1991).webm': videos.pack,
            'POPMedia/Visual Pinball X/AudioLaunch/Terminator 2 (Williams 1991).mp3': 'faux son',
          }),
        );
      }
      if (url.searchParams.get('showfile')) {
        if (!logged) return html(signIn, false);
        return html(`<div id="user_link">demo</div><h1>Media Pack</h1><a class="download_button" href="${url.origin}/index.php?app=downloads&module=display&section=download&do=confirm_download&hash=0123456789abcdef0123456789abcdef">Download</a>`, true);
      }
    }
    // Fausse recherche sur le web : un résultat qui mène à un fichier, comme un lien direct trouvé par l'utilisateur.
    if (host === 'duckduckgo.com') {
      counters.webSearch = url.searchParams.get('q');
      return html('<h1>Résultats</h1><a id="r" href="https://medias.exemple.org/t2-fulldmd.zip">Terminator 2 FullDMD video (zip)</a>', false);
    }
    if (host === 'medias.exemple.org') return attachment('t2-fulldmd.zip', zipStored({ 'T2 FullDMD.webm': videos.fulldmd }));
    return new Response('Page de démonstration absente', { status: 404 });
  };
}

/** Courte vidéo WebM (topper 4:1) dessinée hors écran : de vrais fichiers, que l'aperçu sait lire. */
async function video(text, from, to) {
  const win = offscreen(400, 300);
  await win.loadURL('data:text/html;charset=utf-8,<canvas id="c"></canvas>');
  const data = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const c = document.getElementById('c'); c.width = 640; c.height = 160;
    const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' });
    const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    rec.onstop = () => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(new Blob(parts, { type: 'video/webm' })); };
    let t = 0; rec.start();
    const tick = setInterval(() => {
      t++; const grad = g.createLinearGradient(0, 0, 640, 160);
      grad.addColorStop(0, ${JSON.stringify(from)}); grad.addColorStop(1, ${JSON.stringify(to)}); g.fillStyle = grad; g.fillRect(0, 0, 640, 160);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 40px Segoe UI';
      g.fillText(${JSON.stringify(text)}, 320 + Math.sin(t / 5) * 30, 80);
      if (t > 30) { clearInterval(tick); rec.stop(); }
    }, 40);
  })`);
  win.destroy();
  return Buffer.from(data.split(',')[1], 'base64');
}

/** Partie 1 : les vrais sites, en visiteur, lecture seule. */
async function realSites() {
  const out = [];
  const acquirer = createAcquirer({ dir: () => path.join(BASE, 'inutile'), received: () => {}, progress: () => {}, failed: () => {}, closed: () => {} });
  const vpu = await acquirer.readPage(core.siteSearchUrl('vpuniverse', 'terminator 2'), core.SITE_SEARCH_PROBES.vpuniverse);
  if (vpu?.kind !== 'hits') {
    out.push(`VPUniverse (vrai site) : ${JSON.stringify(vpu)}`);
    return out;
  }
  const hits = vpu.hits.map((h) => ({ ...h, site: 'vpuniverse' }));
  out.push(`VPUniverse (vrai site, visiteur) : ${hits.length} résultats, ${hits.filter((h) => h.category).length} avec catégorie, ${hits.filter((h) => h.thumb).length} avec vignette, ${hits.filter((h) => h.author).length} avec auteur`);
  const vps = core.loadVpsDb(REAL_DOWNLOADS);
  const t2 = vps.games.find((g) => g.id === T2);
  for (const [type, list] of Object.entries(core.siteOffers(hits, [t2], vps))) out.push(`  ${type} : ${list.map((o) => `${o.hit.title} [${o.hit.category?.label ?? '?'}, ${o.hit.author ?? '?'}]`).join(' | ')}`);
  const first = hits.find((h) => h.thumb);
  if (first) {
    const file = await acquirer.fetchImage(first.thumb, path.join(BASE, 'vignette-reelle.png'));
    out.push(`Vignette réelle : ${file ? `${fs.statSync(file).size} octets` : 'refusée'}`);
  }
  const vpf = await acquirer.readPage(core.siteSearchUrl('vpforums', 'terminator 2'), core.SITE_SEARCH_PROBES.vpforums);
  out.push(`VPForums (vrai site, visiteur) : ${JSON.stringify(vpf).slice(0, 200)}`);
  return out;
}

async function run(report, sc) {
  const { root, L } = sandbox(sc.name);
  const dir = path.join(CAPTURES, sc.name);
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  const library = createLibrary({
    root,
    dataDir: L.data,
    vpxExe: () => undefined,
    tables: () => tables,
    reload: () => (tables = core.scanTables(L.tables)),
    enter: () => (phase = 'library'),
    leave: () => (phase = 'menu'),
    play: () => {},
    quit: () => {},
    keys: () => KEYS,
    windows: () => windows,
    broadcast: () => send(),
  });
  function send() {
    if (win.isDestroyed()) return;
    win.webContents.send('state', {
      role: 'playfield', phase, help: false, count: tables.length, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [],
      nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0] },
      library: phase === 'library' ? library.view() : undefined,
    });
  }
  const onAction = (_e, action) => library.handleAction(action);
  ipcMain.on('action', onAction);
  const ready = new Promise((r) => ipcMain.once('ready', r));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: '0', zones: '[]' } });
  await ready;

  const acq = session.fromPartition(ACQUIRE_PARTITION);
  const counters = { vpuSearch: 0, vpfSearch: 0, waitAsked: 0, tooEarly: 0, allowedAt: 0 };
  const videos = { chrome: await video('T2 CHROME TOPPER', '#8a8f99', '#1b1d22'), pack: await video('T2 TOPPER DU PACK', '#7a1010', '#120607'), fulldmd: await video('T2 FULLDMD DU WEB', '#0d6b5e', '#04201c') };
  // Chaque orientation repart de zéro : pas connecté, rien reçu.
  await acq.clearStorageData({ storages: ['cookies'] });
  if (acq.protocol.isProtocolHandled('https')) acq.protocol.unhandle('https');
  acq.protocol.handle('https', fakeSites(acq, counters, videos));

  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  const log = LOG;
  const view = () => library.view();
  async function shot(name) {
    trace(`capture ${sc.name}/${name}`);
    send();
    await delay(250);
    for (let i = 0; i < 60; i++) {
      const ok = await win.webContents.executeJavaScript(`[...document.images].every((i) => i.complete) && [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error)`);
      if (ok) break;
      await delay(100);
    }
    await delay(150);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(win.webContents, `${sc.name}/${label}`);
    fs.writeFileSync(path.join(dir, `${label}.png`), (await win.capturePage()).toPNG());
    const v = view();
    log.push(`${sc.name}/${label} : ${v.heading} | ${(v.sections ?? []).flatMap((s) => s.rows.map((r) => `[${r.text}${r.detail ? ` : ${r.detail}` : ''}]`)).join(' ')} | ${(v.media?.cards ?? []).map((c) => `${c.title} (${c.code ?? ''}${c.state ? ` · ${c.state.label}` : ''})`).join(' | ')} | actions : ${v.actions.map((a) => a.label).join(' | ')}`);
  }
  const act = (label) => {
    trace(`action ${label}`);
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  async function idle(timeout = 120_000) {
    const end = Date.now() + timeout;
    await delay(100);
    while (view().busy && Date.now() < end) await delay(200);
    if (view().busy) throw new Error(`toujours occupé (${view().busy})`);
  }
  async function until(what, test, timeout = 60_000) {
    trace(`attente : ${what}`);
    const end = Date.now() + timeout;
    while (!test() && Date.now() < end) {
      gc();
      await delay(200);
    }
    if (!test()) throw new Error(`attendu en vain : ${what}`);
  }
  const card = (title) => view().media.cards.find((c) => c.title.startsWith(title));
  const pickCard = (title) => {
    trace(`carte ${title}`);
    const c = card(title);
    if (!c) throw new Error(`pas de carte « ${title} » (${view().media.cards.map((x) => x.title).join(' | ')})`);
    library.handleAction({ type: 'activate', index: c.action });
  };
  const table = () => tables.find((t) => t.file.includes(FOLDER));

  // ---------- Pas connecté : VPForums demande la connexion, VPUniverse montre ses résultats ----------
  library.openSheet(table());
  act('Médias du jeu');
  act('Topper');
  act('Voir les propositions');
  await idle();
  await shot('topper-pas-connecte');

  // ---------- Connecté (cookies posés comme après une connexion dans la fenêtre « Récupérer ») ----------
  const expires = Date.now() / 1000 + 90 * 86400;
  for (const [url, name, value] of [
    ['https://vpuniverse.com/', 'ips4_member_id', '4242'],
    ['https://vpuniverse.com/', 'ips4_login_key', 'cle'],
    ['https://vpuniverse.com/', 'ips4_device_key', 'appareil'],
    ['https://www.vpforums.org/', 'member_id', '17'],
    ['https://www.vpforums.org/', 'pass_hash', 'empreinte'],
  ]) await acq.cookies.set({ url, name, value, expirationDate: expires });
  act('Retour : Topper');
  act('Voir les propositions');
  await idle();
  await shot('topper-connecte');

  // ---------- Afficheur 4:1 sur une borne qui montre l'afficheur large ----------
  const exact = (label) => {
    const i = view().actions.findIndex((a) => a.label === label);
    if (i < 0) throw new Error(`pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  act('Retour : Topper');
  act('Retour aux médias');
  exact('Afficheur');
  act('Voir les propositions');
  await idle();
  await shot('afficheur-pas-montre');
  act('Propositions : Afficheur large');
  await idle();
  await shot('afficheur-large-propositions');

  // ---------- Recherche sur le web : le fichier téléchargé revient dans le brouillon ----------
  act('Chercher sur le web');
  await until('la fausse page de recherche', () => require('electron').webContents.getAllWebContents().some((w) => /duckduckgo\.com/.test(w.getURL()) && !w.isLoading()));
  const page = require('electron').webContents.getAllWebContents().find((w) => /duckduckgo\.com/.test(w.getURL()));
  log.push(`Recherche web : « ${counters.webSearch} »`);
  await page.executeJavaScript("document.getElementById('r').click()");
  await until('le fichier du web dans le brouillon', () => (view().sections ?? []).some((sec) => sec.rows.some((r) => /^Reçu de medias\.exemple\.org\./.test(r.text))));
  for (const w of BrowserWindow.getAllWindows()) if (w !== win) w.close();
  await delay(1000);
  await shot('afficheur-large-recu-du-web');
  act('Retour : Afficheur large');
  act('Retour aux médias');
  act('Enregistrer');
  act('Enregistrer');
  await idle();
  log.push(`medias (après le web) = ${fs.readdirSync(path.join(L.tables, FOLDER, 'medias')).sort().join(' | ')}`);
  log.push(`provenance FullDMD = ${JSON.stringify(core.mediaMemory(core.readInfo(path.join(L.tables, FOLDER, `${FOLDER}.info`))).sources?.FullDMD)}`);
  const web = path.join(L.downloads, 'sites', 'web.json');
  log.push(`web.json : ${fs.existsSync(web) ? JSON.parse(fs.readFileSync(web, 'utf8')).map((r) => `${r.key} ${r.type} ${r.url} → ${r.files.map((f) => path.basename(f.file)).join(', ')}`).join(' ; ') : 'absent'}`);

  // ---------- Reprendre le fichier actuel : rien à réécrire, l'écran le dit ----------
  exact('Afficheur large');
  act('Voir les propositions');
  await idle();
  pickCard('T2 FullDMD.webm');
  await shot('afficheur-large-deja-actuel');
  // Retour au topper, pour la file.
  act('Retour : Afficheur large');
  act('Retour aux médias');
  act('Topper');
  act('Voir les propositions');
  await idle();

  // ---------- File : vidéo de VPUniverse (minuteur), pack de VPForums ----------
  pickCard('Terminator 2 - Judgment Day Chrome Edition Topper');
  await until('le décompte du site', () => /Attente du site · \d+ s/.test(card('Terminator 2 - Judgment Day Chrome')?.state?.label ?? ''));
  pickCard('Terminator 2 (Williams 1991) (FS) (Media Pack)');
  await delay(1500);
  await shot('topper-file');
  await until('la vidéo de VPUniverse', () => view().media.cards.some((c) => c.code === 'Reçu de VPUniverse'), 60_000);
  await until('le pack de VPForums', () => view().media.cards.some((c) => c.code === 'Reçu de VPForums'), 60_000);
  // Les derniers changements de la file redessinent l'écran : on laisse les aperçus se charger.
  await delay(1500);
  await shot('topper-recus');
  log.push(`Minuteur : ${counters.waitAsked} demande(s) d’attente au serveur, ${counters.tooEarly} appel(s) au fichier avant la fin (doit être 0)`);
  log.push(`Recherches : VPUniverse ${counters.vpuSearch}, VPForums ${counters.vpfSearch} (une par visite au plus ; les résultats se gardent une demi-heure)`);

  // ---------- Le pack sert aussi aux autres écrans ----------
  act('Retour : Topper');
  act('Retour aux médias');
  act('Logo');
  act('Voir les propositions');
  await idle();
  await shot('logo-avec-pack');
  // Retirer un fichier de la file pendant l'attente du site : il la quitte, rien n'est gardé.
  pickCard('Terminator 2 (Williams 1991) Animated Wheel APNG');
  await until('le décompte du logo', () => /Attente du site/.test(card('Terminator 2 (Williams 1991) Animated Wheel')?.state?.label ?? ''));
  pickCard('Terminator 2 (Williams 1991) Animated Wheel APNG');
  await delay(2500);
  const left = card('Terminator 2 (Williams 1991) Animated Wheel')?.state?.label;
  log.push(`Retrait de la file : carte « ${left} », dossier ${fs.existsSync(path.join(L.downloads, 'sites', 'vpuniverse-29322')) ? 'encore là (erreur)' : 'effacé'}`);
  await shot('logo-retire-de-la-file');
  pickCard('Terminator 2 (Williams 1991).png');
  await shot('logo-choisi');
  act('Retour aux médias');
  await shot('medias-brouillon');
  // Enregistrement : le plan, puis les fichiers rangés dans medias\ avec leur provenance.
  act('Enregistrer');
  await shot('plan-enregistrement');
  act('Enregistrer');
  await idle();
  const m = path.join(L.tables, FOLDER, 'medias');
  log.push(`medias = ${fs.existsSync(m) ? fs.readdirSync(m).sort().join(' | ') : 'rien'}`);
  log.push(`sources = ${JSON.stringify(core.mediaMemory(core.readInfo(path.join(L.tables, FOLDER, `${FOLDER}.info`))).sources)}`);
  const receipts = path.join(L.downloads, 'sites', 'recus.json');
  log.push(`recus.json : ${fs.existsSync(receipts) ? JSON.parse(fs.readFileSync(receipts, 'utf8')).map((r) => `${r.key} → ${r.files.map((f) => `${path.basename(f.file)} (${f.type ?? 'sans type'})`).join(', ')}`).join(' ; ') : 'absent'}`);

  ipcMain.removeListener('action', onAction);
  win.destroy();
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  // Garde-fou : une démonstration qui reste bloquée s'arrête d'elle-même.
  setTimeout(() => {
    console.log(['ÉCHEC : délai dépassé (5 min)', ...LOG].join('\n'));
    app.exit(1);
  }, 300_000).unref();
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = [];
  try {
    results.push(...(await realSites()));
    for (const sc of [{ name: 'paysage', width: 1920, height: 1080 }, { name: 'portrait', width: 1080, height: 1920 }]) await run(report, sc);
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  results.push(...LOG);
  report.save();
  fs.mkdirSync(CAPTURES, { recursive: true });
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  app.quit();
});
