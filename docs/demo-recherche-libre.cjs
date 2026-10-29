// Démonstration hors écran de la recherche libre d'un média (docs/recherche/sources-medias.md
// § 7) : « Chercher moi-même sur le web… » sur l'écran d'un média de Guardians of the Galaxy,
// la fenêtre « Récupérer » et son bandeau de recherche, une page vidéo, un téléchargement en
// cours, puis les écrans « Reçu » et l'affectation, écrite aussitôt. Lancée par
// docs\demo-recherche-libre.ps1 sur le bureau caché ; profil Electron à part
// (tmp\demo-recherche-libre-profil). Faux sites seulement, interceptés dans la session de
// « Récupérer » : rien n'est demandé à un vrai site. Captures et relevé dans
// tmp\demo-recherche-libre\captures.
//   npm run build
//   .\docs\demo-recherche-libre.ps1
//
// 1. Musique du jeu, sans fichier : « Chercher moi-même sur le web… » ouvre la recherche
//    préremplie ; le bandeau change de texte et de moteur ; une page YouTube imitée (flux
//    découpé : « Récupérer le son » par yt-dlp, la première fois téléchargé depuis GitHub),
//    une page qui lit une vidéo directement (« Télécharger cette vidéo »). Échap ferme ;
//    rouverte, la fenêtre reprend la page. Puis « Récupérer le son » avec un faux yt-dlp
//    (CYBERPINBALL_YTDLP, script Node) : progression dans le bandeau, écran « Reçu ». Le vrai
//    yt-dlp et le vrai GitHub ne servent que dans les tests manuels.
// 2. Un son WebM servi lentement : téléchargement en cours (bandeau et écran du média), puis
//    l'écran « Reçu » (son de la vidéo, à extraire en WAV), la découpe (forme d'onde, extrait
//    à écouter, début, fin, fondu), l'affectation : medias\(Audio) ….wav, provenance notée.
// 3. Logo : un JPEG, converti en PNG puis affecté (l'ancien logo à la corbeille).
// 4. Topper : une page web sauvée sous un nom .mp3 (refusée), un pack de plusieurs fichiers
//    (choix, puis affectation), un fichier arrivé dans Téléchargements de Windows.

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session, webContents } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-recherche-libre');
const CAPTURES = path.join(BASE, 'captures');
const PROFILE = path.join(WT, 'tmp', 'demo-recherche-libre-profil');
fs.rmSync(PROFILE, { recursive: true, force: true });
app.setPath('userData', PROFILE);

const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { ACQUIRE_PARTITION } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const { vpxWithInfo, zipStored } = require('./demo-fichiers.cjs');

const FOLDER = 'Guardians of the Galaxy (Stern 2017)';
const LOG = [];
let servedDirs = () => [];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
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
function png(width, height, [r, g, b]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([r, g, b, 255], i * 4);
  return core.encodePng({ width, height, data });
}

function sandbox(name) {
  const root = path.join(BASE, name);
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  const dir = path.join(L.tables, FOLDER);
  put(path.join(dir, `${FOLDER}.vpx`), vpxWithInfo({ TableName: 'Guardians of the Galaxy (Stern 2017)', AuthorName: 'demo', TableVersion: '1.0' }));
  put(path.join(dir, `${FOLDER}.info`), JSON.stringify({ Info: { Title: 'Guardians of the Galaxy', Manufacturer: 'Stern', Year: 2017 } }, null, 2));
  // Un ancien logo, gris : la conversion du JPEG le remplacera (il part à la corbeille).
  put(path.join(dir, 'medias', `(Wheel) ${FOLDER}.png`), png(300, 150, [70, 76, 84]));
  const screen = (fingerprint, widthPx, heightPx) => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 });
  core.saveCabinet(L.data, {
    version: 1,
    screens: [screen('pf', 1920, 1080), screen('bg', 1920, 1080), screen('dmd', 1920, 1080), screen('top', 1920, 540)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd', topper: 'top' },
    playfield: { flipperEdge: 'bottom' },
    vpx: { iniPath: '' },
    updatedAt: '',
  });
  const windows = path.join(root, 'Téléchargements');
  fs.mkdirSync(windows, { recursive: true });
  return { root, L, windows };
}

/** Vrais fichiers de démonstration, faits hors écran : un son WebM (opus), un logo JPEG, deux vidéos WebM. */
async function makeMedia() {
  const win = offscreen(400, 300, { autoplayPolicy: 'no-user-gesture-required' });
  await win.loadURL('data:text/html;charset=utf-8,<canvas id="c"></canvas>');
  const dataUrl = (s) => Buffer.from(s.split(',')[1], 'base64');
  // Une petite mélodie de 6 s, enregistrée en WebM comme le rendrait une page vidéo.
  const audio = await win.webContents.executeJavaScript(`new Promise(async (resolve, reject) => {
    const ctx = new AudioContext(); await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
    const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    rec.onstop = () => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(new Blob(parts, { type: 'audio/webm' })); };
    const notes = [392, 440, 494, 523, 587, 523, 494, 440, 392, 330, 392, 440];
    const t0 = ctx.currentTime + 0.15;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f;
      const at = t0 + i * 0.5;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.6, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.46);
      o.connect(g).connect(dest); o.start(at); o.stop(at + 0.5);
    });
    rec.start(); setTimeout(() => rec.stop(), 6400);
  })`);
  const jpg = await win.webContents.executeJavaScript(`(() => {
    const c = document.getElementById('c'); c.width = 640; c.height = 320; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 640, 320); grad.addColorStop(0, '#1d1147'); grad.addColorStop(1, '#b0185b');
    g.fillStyle = grad; g.fillRect(0, 0, 640, 320); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd54a'; g.font = 'bold 72px Segoe UI'; g.fillText('GUARDIANS', 320, 130);
    g.fillStyle = '#ffffff'; g.font = 'bold 38px Segoe UI'; g.fillText('OF THE GALAXY', 320, 205);
    return c.toDataURL('image/jpeg', 0.9);
  })()`);
  win.destroy();
  return { audio: dataUrl(audio), jpg: dataUrl(jpg), topper: await video('GOTG TOPPER', '#3a1c71', '#d76d77'), short: await video('GOTG TOPPER COURT', '#0f2027', '#2c5364'), windows: await video('GOTG DU NAVIGATEUR', '#134e5e', '#71b280') };
}

/** Courte vidéo WebM 4:1 dessinée hors écran. */
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

/** Faux sites : moteur de recherche, YouTube imité, site de médias. */
function fakeSites(media, counters) {
  const page = (title, body) =>
    new Response(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:Segoe UI;background:#f4f4f6;color:#1d1d1f;padding:36px 48px;font-size:18px;line-height:1.6">${body}</body></html>`, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  const attachment = (name, data, type = 'application/octet-stream') => new Response(data, { headers: { 'content-type': type, 'content-disposition': `attachment; filename="${name}"`, 'content-length': String(data.length) } });
  /** Réponse lente : le téléchargement dure quelques secondes, le temps de le voir avancer. */
  const slow = (name, data, steps = 12, every = 450) => {
    let i = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        if (i >= steps) return controller.close();
        await delay(every);
        const size = Math.ceil(data.length / steps);
        controller.enqueue(new Uint8Array(data.subarray(i * size, (i + 1) * size)));
        i++;
      },
    });
    return new Response(stream, { headers: { 'content-type': 'audio/webm', 'content-disposition': `attachment; filename="${name}"`, 'content-length': String(data.length) } });
  };
  const youtube = fs.readFileSync(path.join(WT, 'packages', 'core', 'test-pages', 'youtube-video.html'), 'utf8')
    .replace(/Me at the zoo/g, 'Guardians of the Galaxy pinball - attract mode music')
    .replace('PT0M19S', 'PT2M47S')
    .replace('<body dir="ltr">', '<body dir="ltr" style="font-family:Roboto,Segoe UI;background:#0f0f0f;color:#f1f1f1;padding:24px 40px">')
    .replace('<div class="html5-video-container">', '<div class="html5-video-container" style="width:960px;height:540px;background:#000;display:flex;align-items:center;justify-content:center;color:#888">▶ lecteur (flux découpé, blob:)');
  return async (request) => {
    const url = new URL(request.url);
    const host = url.hostname;
    if (host === 'duckduckgo.com') {
      const q = url.searchParams.get('q') ?? '';
      counters.queries.push(`${url.searchParams.get('ia') ?? 'web'} : ${q}`);
      const link = (href, text, note) => `<li style="margin:14px 0"><a href="${href}" style="color:#1a0dab;font-size:20px">${text}</a><div style="color:#4d5156;font-size:15px">${note}</div></li>`;
      return page(
        `${q} at DuckDuckGo`,
        `<div style="color:#5f6368">Résultats de démonstration pour « ${q} »</div><ol style="list-style:none;padding:0">
        ${link('https://medias.exemple.org/fiche-son', 'Guardians of the Galaxy - attract music (WebM)', 'medias.exemple.org · son 6 s')}
        ${link('https://www.youtube.com/watch?v=gotgdemo01', 'Guardians of the Galaxy pinball - attract mode music - YouTube', 'youtube.com · 2:47')}
        ${link('https://medias.exemple.org/video-directe', 'Guardians of the Galaxy - topper animé', 'medias.exemple.org · vidéo lue par la page')}
        ${link('https://medias.exemple.org/gotg-logo.jpg', 'Guardians of the Galaxy logo (JPEG)', 'medias.exemple.org · image 640 × 320')}
        ${link('https://medias.exemple.org/theme.mp3', 'Guardians theme.mp3 (lien mort)', 'medias.exemple.org · le site renvoie sa page')}
        ${link('https://medias.exemple.org/topper-pack.zip', 'GotG topper pack (zip)', 'medias.exemple.org · deux vidéos, un lisez-moi, un logo')}
        </ol>`,
      );
    }
    if (host === 'www.youtube.com' && url.pathname === '/watch') return new Response(youtube, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (host === 'medias.exemple.org') {
      if (url.pathname === '/fiche-son') return page('Guardians of the Galaxy - attract music', '<h1>Guardians of the Galaxy - attract music</h1><p><a id="dl" href="/gotg-attract.webm">Télécharger (WebM, 6 s)</a></p>');
      if (url.pathname === '/gotg-attract.webm') return slow('gotg-attract.webm', media.audio);
      if (url.pathname === '/video-directe') return page('Guardians of the Galaxy - topper animé', '<h1>Guardians of the Galaxy - topper animé</h1><video controls muted src="/medias/gotg-topper.webm" style="width:960px;background:#000"></video>');
      if (url.pathname === '/medias/gotg-topper.webm') return new Response(media.topper, { headers: { 'content-type': 'video/webm', 'content-length': String(media.topper.length) } });
      if (url.pathname === '/gotg-logo.jpg') return attachment('gotg-logo.jpg', media.jpg, 'image/jpeg');
      if (url.pathname === '/theme.mp3') return attachment('Guardians theme.mp3', Buffer.from('<!DOCTYPE html><html><head><title>Dropbox - Error</title></head><body>Lien expiré</body></html>'), 'audio/mpeg');
      if (url.pathname === '/topper-pack.zip') {
        return attachment(
          'gotg-topper-pack.zip',
          zipStored({
            'GotG topper.webm': media.topper,
            'GotG topper (court).webm': media.short,
            'lisez-moi.txt': 'Topper animé de démonstration.',
            'POPMedia/Visual Pinball X/Wheel/Guardians of the Galaxy (Stern 2017).png': png(400, 200, [40, 160, 70]),
          }),
        );
      }
    }
    return new Response('Page de démonstration absente', { status: 404 });
  };
}

/**
 * Faux yt-dlp (script Node, lancé par Electron en mode Node) : relit ses arguments comme le
 * vrai, décompte une progression puis rend le son de démonstration sous le nom que yt-dlp lui
 * donnerait (WebM Opus : le format de repli quand la page n'a pas de M4A).
 */
function writeFakeYtDlp(source) {
  const file = path.join(BASE, 'faux-yt-dlp.js');
  put(file, `
const fs = require('node:fs');
const args = process.argv.slice(2);
const out = args[args.indexOf('-o') + 1];
if (!args.includes('--no-playlist') || args[args.length - 2] !== '--') { console.error('ERROR: arguments inattendus'); process.exit(2); }
const dest = out.replace('%(title).80B', 'Guardians of the Galaxy pinball - attract mode music').replace('%(id)s', 'gotgdemo01').replace('%(ext)s', 'webm');
const data = fs.readFileSync(${JSON.stringify(source)});
let n = 0;
const tick = setInterval(() => {
  n++;
  console.log('${core.YTDLP_PROGRESS_MARK}' + Math.round((data.length * n) / 8) + '|' + data.length + '|NA|24000|' + (8 - n));
  if (n < 8) return;
  clearInterval(tick);
  fs.writeFileSync(dest, data);
  console.log('${core.YTDLP_FILE_MARK}' + dest);
}, 450);
`);
  return file;
}

async function run(report, sc, media) {
  const { root, L, windows: winDownloads } = sandbox(sc.name);
  const fakeYtDlp = writeFakeYtDlp(put(path.join(BASE, 'gotg-attract-source.webm'), media.audio));
  const dir = path.join(CAPTURES, sc.name);
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  const library = createLibrary({
    // Mode invité inactif : tout passe (host.guest est obligatoire, library.ts).
    guest: { active: false, allows: () => true, knock: () => true },
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
    downloadsDir: () => winDownloads,
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
  const counters = { queries: [] };
  if (acq.protocol.isProtocolHandled('https')) acq.protocol.unhandle('https');
  acq.protocol.handle('https', fakeSites(media, counters));
  const acquirer = () => library.catalog.acquirer;

  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  const view = () => library.view();
  const label = (name) => `${String(step++).padStart(2, '0')}-${name}`;
  async function settleImages(contents) {
    for (let i = 0; i < 60; i++) {
      const ok = await contents.executeJavaScript(`[...document.images].every((i) => i.complete) && [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error)`);
      if (ok) break;
      await delay(100);
    }
  }
  async function shot(name) {
    trace(`capture ${sc.name}/${name}`);
    send();
    await delay(300);
    await settleImages(win.webContents);
    await delay(150);
    const l = label(name);
    await report.check(win.webContents, `${sc.name}/${l}`);
    fs.writeFileSync(path.join(dir, `${l}.png`), (await win.capturePage()).toPNG());
    const v = view();
    LOG.push(`${sc.name}/${l} : ${v.heading} | ${v.subheading ?? ''} | ${(v.sections ?? []).flatMap((s) => s.rows.map((r) => `[${r.text}${r.detail ? ` : ${r.detail}` : ''}]`)).join(' ')} | ${(v.media?.cards ?? []).map((c) => `${c.title} (${c.code ?? ''}${c.state ? ` · ${c.state.label}` : ''})`).join(' | ')} | actions : ${v.actions.map((a) => a.label + (a.detail ? ` [${a.detail}]` : '')).join(' | ')}`);
  }
  /** Fenêtre « Récupérer » : bandeau et page réunis dans une image, à la taille de l'écran couvert. */
  async function shotBrowser(name) {
    const open = acquirer().current();
    if (!open) throw new Error('fenêtre « Récupérer » fermée');
    for (let i = 0; i < 50 && open.view.webContents.isLoading(); i++) await delay(100);
    // Le bandeau a reçu son premier état (fenêtre qui vient de s'ouvrir) : sinon la capture le montre vide.
    for (let i = 0; i < 50 && !(await open.win.webContents.executeJavaScript(`document.getElementById('game').textContent`)); i++) await delay(100);
    await delay(400);
    const l = label(`recuperer-${name}`);
    await report.check(open.win.webContents, `${sc.name}/${l} (bandeau)`);
    const bounds = open.win.getBounds();
    const barH = await open.win.webContents.executeJavaScript(`parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bar-height')) || 96`);
    const bar = (await open.win.capturePage()).crop({ x: 0, y: 0, width: bounds.width, height: barH });
    const pageImg = await open.view.webContents.capturePage();
    const rest = pageImg.crop({ x: 0, y: 0, width: Math.min(bounds.width, pageImg.getSize().width), height: Math.min(pageImg.getSize().height, bounds.height - barH) });
    const composer = offscreen(bounds.width, bounds.height);
    await composer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><style>body{margin:0;background:#000}img{display:block;width:${bounds.width}px}</style><img src="${bar.toDataURL()}"><img src="${rest.toDataURL()}">`)}`);
    await delay(300);
    fs.writeFileSync(path.join(dir, `${l}.png`), (await composer.capturePage()).toPNG());
    composer.destroy();
    const state = await open.win.webContents.executeJavaScript(`({ grab: !document.getElementById('grab-audio').hidden, primary: (document.querySelector('button.grab.primary') || {}).id || '', query: document.getElementById('query').value, engine: [...document.querySelectorAll('.engine.on')].map((b) => b.textContent).join(), video: document.getElementById('video').hidden ? '' : document.getElementById('video-text').textContent + ' — ' + document.getElementById('video-hint').textContent, get: !document.getElementById('video-get').hidden, home: document.getElementById('home').textContent, downloads: [...document.querySelectorAll('.download')].map((d) => d.textContent).join(' / '), status: document.getElementById('status').textContent })`);
    LOG.push(`${sc.name}/${l} : page ${open.view.webContents.getURL()} ; bandeau ${barH} px ; ${JSON.stringify(state)}`);
    return state;
  }
  const act = (text) => {
    trace(`action ${text}`);
    const i = view().actions.findIndex((a) => a.label === text || a.label.startsWith(text));
    if (i < 0) throw new Error(`pas d’action « ${text} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  const exact = (text) => {
    const i = view().actions.findIndex((a) => a.label === text);
    if (i < 0) throw new Error(`pas d’action « ${text} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  /** Le curseur sur cette action, sans la lancer (flipper droit). */
  const point = (text) => {
    const i = view().actions.findIndex((a) => a.label.startsWith(text));
    if (i < 0) throw new Error(`pas d’action « ${text} »`);
    for (let n = 0; n < 40 && library.view().cursor !== i; n++) library.handleKey({ type: 'keyDown', code: KEYS.next[0], key: '' });
  };
  async function idle(timeout = 60_000) {
    const end = Date.now() + timeout;
    await delay(100);
    while (view().busy && Date.now() < end) await delay(150);
    if (view().busy) throw new Error(`toujours occupé (${view().busy})`);
  }
  async function until(what, test, timeout = 30_000) {
    trace(`attente : ${what}`);
    const end = Date.now() + timeout;
    while (!(await test()) && Date.now() < end) await delay(150);
    if (!(await test())) throw new Error(`attendu en vain : ${what}`);
  }
  const page = () => acquirer().current()?.view.webContents;
  const goto = async (url) => {
    trace(`page ${url}`);
    await page().loadURL(url).catch(() => undefined);
    await until(`la page ${url}`, () => !page().isLoading());
  };
  const click = (selector) => page().executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const closeBrowser = async () => {
    page().sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await until('la fenêtre « Récupérer » fermée par Échap', () => !acquirer().isOpen());
  };
  const table = () => tables.find((t) => t.file.includes(FOLDER));
  const mediasDir = () => path.join(L.tables, FOLDER, 'medias');
  const received = () => /^Reçu/.test(view().heading);

  // ---------- 1. Musique du jeu : recherche libre ----------
  library.openSheet(table());
  act('Médias du jeu');
  exact('Musique du jeu');
  point('Chercher moi-même sur le web');
  await shot('musique-sans-fichier');
  act('Chercher moi-même sur le web');
  await until('la recherche préremplie', () => Boolean(page()) && /duckduckgo\.com/.test(page().getURL()) && !page().isLoading());
  await shot('musique-recherche-ouverte');
  const first = await shotBrowser('recherche-preremplie');
  if (first.query !== 'Guardians of the Galaxy table music vpinball') throw new Error(`champ de recherche : « ${first.query} »`);
  // Le bandeau : un autre texte, puis le moteur « Vidéos ».
  // Le bandeau de la fenêtre ouverte (une fenêtre rouverte après Échap en a un nouveau).
  const barOf = () => acquirer().current().win.webContents;
  await barOf().executeJavaScript(`(() => { const q = document.getElementById('query'); q.focus(); q.value = 'guardians of the galaxy pinball attract music'; document.getElementById('search').requestSubmit(); })()`);
  await until('la nouvelle recherche', () => /attract/.test(page().getURL()) && !page().isLoading());
  await barOf().executeJavaScript(`[...document.querySelectorAll('.engine')].find((b) => b.dataset.engine === 'videos').click()`);
  await until('le moteur Vidéos', () => /ia=videos/.test(page().getURL()) && !page().isLoading());
  const typed = await shotBrowser('recherche-videos');
  if (typed.engine !== 'Vidéos' || !/attract/.test(typed.query)) throw new Error(`bandeau après la recherche : ${JSON.stringify(typed)}`);
  // Page vidéo de YouTube (imitée) : flux découpé, rien à télécharger sans outil externe.
  await goto('https://www.youtube.com/watch?v=gotgdemo01');
  await until('la ligne de la page vidéo', async () => (await barOf().executeJavaScript(`!document.getElementById('video').hidden && /attract mode music/.test(document.getElementById('video-text').textContent)`)), 10_000);
  const yt = await shotBrowser('page-youtube');
  if (yt.get) throw new Error('« Télécharger cette vidéo » proposé sur YouTube');
  if (!yt.grab || yt.primary !== 'grab-audio' || !/première fois/i.test(yt.video)) throw new Error(`yt-dlp mal proposé sur YouTube : ${JSON.stringify(yt)}`);
  if (!/attract/.test(yt.query)) throw new Error(`le champ de recherche a perdu le dernier texte cherché : « ${yt.query} »`);
  // Page qui lit une vidéo directement : « Télécharger cette vidéo ».
  await goto('https://medias.exemple.org/video-directe');
  await until('la ligne de la vidéo directe', async () => (await barOf().executeJavaScript(`!document.getElementById('video-get').hidden`)), 10_000);
  await shotBrowser('page-video-directe');
  // Échap ferme ; rouverte, la fenêtre reprend la page et son historique.
  await closeBrowser();
  act('Chercher moi-même sur le web');
  await until('la page reprise', () => Boolean(page()) && /video-directe/.test(page().getURL()) && !page().isLoading());
  LOG.push(`Reprise après Échap : ${page().getURL()} ; « Précédent » : ${page().navigationHistory.canGoBack() ? 'oui' : 'non'}`);
  if (!page().navigationHistory.canGoBack()) throw new Error('page reprise sans historique');

  // ---------- 1 bis. « Récupérer le son » d'une page YouTube, par un faux yt-dlp ----------
  process.env.CYBERPINBALL_YTDLP = fakeYtDlp;
  await goto('https://www.youtube.com/watch?v=gotgdemo01');
  await until('les boutons de yt-dlp', async () => (await barOf().executeJavaScript(`!document.getElementById('grab-audio').hidden`)), 10_000);
  await barOf().executeJavaScript(`document.getElementById('grab-audio').click()`);
  await until('la récupération en cours', async () => (await barOf().executeJavaScript(`[...document.querySelectorAll('.download')].some((d) => /%/.test(d.textContent))`)), 10_000);
  await shotBrowser('yt-dlp-en-cours');
  await until('l’écran « Reçu » du son de YouTube', () => received() && /youtube\.com/.test(view().subheading ?? ''), 30_000);
  await idle();
  await closeBrowser();
  await shot('recu-son-youtube');
  act('Garder pour plus tard');
  delete process.env.CYBERPINBALL_YTDLP;
  act('Chercher moi-même sur le web');
  await until('la page YouTube reprise', () => Boolean(page()) && /youtube\.com\/watch/.test(page().getURL()) && !page().isLoading());

  // ---------- 2. Un son WebM, servi lentement ----------
  await goto('https://medias.exemple.org/fiche-son');
  await click('#dl');
  await until('le téléchargement en cours', async () => (await barOf().executeJavaScript(`document.querySelectorAll('.download').length`)) > 0, 10_000);
  await delay(1500);
  await shotBrowser('telechargement-en-cours');
  await shot('musique-telechargement-en-cours');
  await until('l’écran « Reçu »', () => received(), 30_000);
  await idle();
  await closeBrowser();
  await shot('recu-son-de-video');
  act('Découper puis affecter');
  await idle();
  await until('l’extrait prêt', () => view().media?.cards?.[0]?.state?.label === 'À écouter', 30_000);
  await shot('decouper');
  act('Début plus tard');
  act('Fin plus tôt');
  act('Fondu de fin');
  await until('l’extrait réglé', () => view().media?.cards?.[0]?.state?.label === 'À écouter' && /0:01 → 0:0[45]/.test(view().media.cards[0].title), 30_000);
  point('Affecter cet extrait');
  await shot('decouper-regle');
  act('Affecter cet extrait');
  await idle();
  await shot('musique-affectee');
  const music = fs.readdirSync(mediasDir()).filter((f) => f.startsWith('(Audio)'));
  const wav = music[0] ? core.wavInfo(fs.readFileSync(path.join(mediasDir(), music[0]))) : undefined;
  LOG.push(`Musique : ${music.join(', ')} ; ${wav ? `${wav.channels} voie(s), ${wav.sampleRate} Hz, ${wav.seconds.toFixed(2)} s` : 'WAV illisible'} ; provenance ${JSON.stringify(core.mediaMemory(core.readInfo(path.join(L.tables, FOLDER, `${FOLDER}.info`))).sources?.Audio)}`);
  if (!wav || wav.seconds < 2 || wav.seconds > 5) throw new Error('extrait absent ou de mauvaise longueur');

  // ---------- 3. Logo : un JPEG converti en PNG ----------
  act('Retour aux médias');
  exact('Logo');
  act('Chercher moi-même sur le web');
  await until('la recherche du logo', () => Boolean(page()) && /wheel/.test(decodeURIComponent(page().getURL())) && !page().isLoading());
  await click('a[href$="gotg-logo.jpg"]');
  await until('l’écran « Reçu » du logo', () => received(), 20_000);
  await idle();
  await closeBrowser();
  await shot('recu-logo-jpeg');
  act('Convertir en PNG');
  await idle();
  await shot('logo-affecte');
  const logos = fs.readdirSync(mediasDir()).filter((f) => f.startsWith('(Wheel)'));
  const trashed = fs.readdirSync(L.trash, { recursive: true }).filter((f) => String(f).endsWith('.png'));
  LOG.push(`Logo : ${logos.join(', ')} (${core.decodePng(fs.readFileSync(path.join(mediasDir(), logos[0])))?.width ?? '?'} px de large) ; corbeille : ${trashed.join(', ')}`);

  // ---------- 4. Topper : refusé, plusieurs fichiers, Téléchargements de Windows ----------
  act('Retour aux médias');
  exact('Topper');
  act('Chercher moi-même sur le web');
  await until('la recherche du topper', () => Boolean(page()) && /topper/.test(decodeURIComponent(page().getURL())) && !page().isLoading());
  await click('a[href$="theme.mp3"]');
  await until('l’écran du fichier refusé', () => /rien d’utilisable/.test(view().heading), 20_000);
  await shot('recu-refuse');
  act('Retour à la recherche');
  await until('la recherche rouverte', () => acquirer().isOpen() && !page().isLoading());
  await click('a[href$="topper-pack.zip"]');
  await until('l’écran des fichiers reçus', () => /fichiers$/.test(view().heading), 20_000);
  await closeBrowser();
  await shot('recu-plusieurs');
  act('GotG topper (court).webm');
  await shot('recu-topper');
  act('Affecter à « Topper »');
  await idle();
  await shot('topper-affecte');
  // Le navigateur de l'utilisateur : un fichier arrive dans Téléchargements de Windows pendant la recherche.
  act('Chercher moi-même sur le web');
  await until('la recherche reprise', () => acquirer().isOpen());
  await closeBrowser();
  await delay(300);
  put(path.join(winDownloads, 'GotG du navigateur.webm.crdownload'), media.windows.subarray(0, 100));
  await delay(300);
  fs.renameSync(path.join(winDownloads, 'GotG du navigateur.webm.crdownload'), path.join(winDownloads, 'GotG du navigateur.webm'));
  fs.writeFileSync(path.join(winDownloads, 'GotG du navigateur.webm'), media.windows);
  put(path.join(winDownloads, 'facture.pdf'), '%PDF-1.4 rien à voir');
  await until('l’écran « Reçu » depuis Téléchargements de Windows', () => received() && /Téléchargements de Windows/.test(view().subheading ?? ''), 20_000);
  await shot('recu-telechargements-windows');
  LOG.push(`Recherches tapées ou choisies : ${counters.queries.join(' | ')}`);
  LOG.push(`medias = ${fs.readdirSync(mediasDir()).sort().join(' | ')}`);
  const web = path.join(L.downloads, 'sites', 'web.json');
  LOG.push(`web.json : ${JSON.parse(fs.readFileSync(web, 'utf8')).map((r) => `${r.type} ${r.windows ? 'Windows' : r.url} → ${r.files.map((f) => path.basename(f.file)).join(', ')}${r.convert?.length ? ` ; à convertir : ${r.convert.map((c) => path.basename(c.file)).join(', ')}` : ''}`).join(' ; ')}`);

  ipcMain.removeListener('action', onAction);
  for (const w of BrowserWindow.getAllWindows()) if (w !== win) w.destroy();
  win.destroy();
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  setTimeout(() => {
    console.log(['ÉCHEC : délai dépassé (6 min)', ...LOG].join('\n'));
    app.exit(1);
  }, 360_000).unref();
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = [];
  try {
    const media = await makeMedia();
    LOG.push(`Fichiers de démonstration : son WebM ${media.audio.length} o, logo JPEG ${media.jpg.length} o, vidéos ${media.topper.length} / ${media.short.length} / ${media.windows.length} o`);
    for (const sc of [{ name: 'paysage', width: 1920, height: 1080 }, { name: 'portrait', width: 1080, height: 1920 }]) await run(report, sc, media);
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  results.push(...LOG);
  report.save();
  fs.mkdirSync(CAPTURES, { recursive: true });
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  void webContents;
  app.quit();
});
