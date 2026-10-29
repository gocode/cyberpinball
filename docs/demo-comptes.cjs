// Démonstration hors écran des comptes des sites et du téléchargement direct
// (docs/recherche/acquisition.md, § 14) : écran « Comptes des sites » (connexion gardée
// d'après les cookies de la session « Récupérer »), réglage « Téléchargement direct »,
// puis, depuis « Ce qu'il faut » de Terminator 2 : table sur vpuniverse.com téléchargée
// sans montrer la page, ROM sur vpforums.org par la page de confirmation, fronton à
// plusieurs fichiers renvoyé vers la fenêtre visible, site où l'on n'est pas connecté.
// Les fiches sont fausses, imitant les trois moteurs (Invision, IP.Board 3, XenForo) :
// aucune page des forums n'est chargée. Aucune fenêtre n'apparaît (rendu hors écran),
// lancé par docs\demo-comptes.ps1 sur le bureau caché. Captures et relevé dans
// tmp\demo-comptes\captures.
//   npm run build
//   .\docs\demo-comptes.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-comptes');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { ACQUIRE_PARTITION } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const { vpxWithInfo, zipStored } = require('./demo-fichiers.cjs');
let servedDirs = () => [];
const LOG = [];

const REAL_DOWNLOADS = 'D:\\CyberPinball\\downloads';
const T2 = 'BunvWvh9';
const GOTG = 'GOTG_2.0';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
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

function sandbox() {
  const root = path.join(BASE, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(REAL_DOWNLOADS)) if (/^vpsdb/.test(f)) fs.copyFileSync(path.join(REAL_DOWNLOADS, f), path.join(L.downloads, f));
  // Une table installée sans provenance, plus ancienne que celle de VPS : une mise à jour à trouver.
  const gotg = path.join(L.tables, GOTG);
  put(path.join(gotg, `${GOTG}.vpx`), vpxWithInfo({ TableName: 'Guardians Of The Galaxy', AuthorName: 'Pincredibles', TableVersion: '2.0' }));
  put(path.join(gotg, `${GOTG}.info`), JSON.stringify({ Info: { Title: 'Guardians of the Galaxy', Manufacturer: 'Stern', Year: 2017, VPSId: 'q86TI2sS' } }, null, 2));
  const screen = (fingerprint, widthPx, heightPx) => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 });
  core.saveCabinet(L.data, {
    version: 1,
    screens: [screen('pf', 1920, 1080), screen('bg', 1920, 1080), screen('dmd', 1920, 1080)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd' },
    playfield: { flipperEdge: 'bottom' },
    vpx: { iniPath: '' },
    updatedAt: '',
  });
  fs.mkdirSync(path.join(BASE, 'Téléchargements'), { recursive: true });
  return { root, L };
}

/**
 * Fausses fiches imitant les forums : Invision (vpuniverse.com) avec ipsSettings.memberID,
 * IP.Board 3 (vpforums.org) avec #user_link et a.download_button, puis une page
 * #files ; le membre est connecté si la session a ses cookies (les requêtes interceptées
 * ne les portent pas : on les lit dans la session).
 */
function fakeForum(vps, acq) {
  const cookies = async (domain) => (await acq.cookies.get({})).filter((c) => c.domain.replace(/^\./, '').endsWith(domain)).map((c) => `${c.name}=${c.value}`).join('; ');
  const game = vps.games.find((g) => g.id === T2);
  const files = new Map();
  const add = (kind, list) => {
    for (const f of list ?? []) for (const l of f.urls ?? []) {
      const key = core.pageKey(l.url);
      if (key && !files.has(key)) files.set(key, { kind, file: f });
    }
  };
  add('table', game.tableFiles);
  add('b2s', game.b2sFiles);
  add('rom', game.romFiles);
  const attachment = (name, data) => new Response(data, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name}"` } });
  const page = (html, logged) => new Response(`<!doctype html><html data-logged-in="${logged}"><meta charset="utf-8"><body style="font-family:Segoe UI;background:#1b1f2a;color:#e5e7eb;padding:40px">${html}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  return async (request) => {
    const url = new URL(request.url);
    const cookie = await cookies(url.hostname.replace(/^www\./, ''));
    const key = core.pageKey(request.url);
    const hit = key && files.get(key);
    // vpforums.org : page de confirmation puis fichier.
    if (url.hostname.endsWith('vpforums.org') && url.searchParams.get('do') === 'confirm_download') {
      return page(`<div id="user_link">demo</div><h1>Download</h1><ul id="files"><li><a href="${url.origin}/index.php?app=downloads&do=dl&id=7318&file=1">t2_l8.zip</a></li></ul>`, true);
    }
    if (url.hostname.endsWith('vpforums.org') && url.searchParams.get('do') === 'dl') return attachment('t2_l8.zip', zipStored({ 't2_l8.rom': 'programme', 't2_u18.l3': 'son' }));
    if (!hit) return new Response('<h1>Page de démonstration absente</h1>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.hostname.endsWith('vpuniverse.com')) {
      const logged = /ips4_member_id=[1-9]/.test(cookie);
      if (url.searchParams.get('do') === 'download') {
        return attachment(`Terminator 2 (Williams 1991) VPW ${hit.file.version}.vpx`, vpxWithInfo({ TableName: 'Terminator 2 - Judgment Day (Williams 1991)', AuthorName: (hit.file.authors ?? []).join(', '), TableVersion: hit.file.version ?? '1.0' }));
      }
      const head = `<script>window.ipsSettings = { memberID: ${logged ? 4242 : 0} };</script><p style="color:#94a3b8">Fausse fiche Invision (vpuniverse.com)</p><h1>${game.name} : ${(hit.file.authors ?? []).join(', ')}</h1>`;
      if (!logged) return page(`${head}<a id="elUserSignIn" href="/login/">Sign In</a>`, false);
      if (hit.kind === 'b2s') {
        // Plusieurs fichiers : la page de choix d'Invision.
        return page(`${head}<div class="ipsDataItem"><a href="${url.origin}${url.pathname}?do=download&r=1&csrfKey=k">FullDMD.directb2s</a></div><div class="ipsDataItem"><a href="${url.origin}${url.pathname}?do=download&r=2&csrfKey=k">2screens.directb2s</a></div>`, true);
      }
      return page(`${head}<a class="ipsButton" href="${url.origin}${url.pathname}?do=download&csrfKey=k">Download this file</a>`, true);
    }
    // vpforums.org : la fiche, avec le bouton pour un membre.
    const logged = /member_id=[1-9]/.test(cookie);
    return page(logged
      ? `<div id="user_link">demo</div><h1>ROM ${hit.file.version}</h1><a class="download_button" href="${url.origin}/index.php?app=downloads&module=display&section=download&do=confirm_download&id=7318&hash=0123456789abcdef0123456789abcdef">Download</a>`
      : `<a id="sign_in" href="/index.php?app=core&module=global&section=login">Sign In</a><h1>ROM</h1>`, logged);
  };
}

async function run(report) {
  const box = sandbox();
  const { root, L } = box;
  const userDownloads = path.join(BASE, 'Téléchargements');
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const sc = { width: 1920, height: 1080 };
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
    downloadsDir: () => userDownloads,
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

  const vps = core.loadVpsDb(L.downloads);
  session.fromPartition(ACQUIRE_PARTITION).protocol.handle('https', fakeForum(vps, session.fromPartition(ACQUIRE_PARTITION)));

  fs.mkdirSync(CAPTURES, { recursive: true });
  let step = 0;
  // Relevé tenu au fil du parcours : un échec garde ce qui précède.
  const log = LOG;
  async function settle(contents) {
    for (let i = 0; i < 60; i++) {
      const ok = await contents.executeJavaScript(`[...document.images].every((i) => i.complete) && [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error)`);
      if (ok) break;
      await delay(100);
    }
    await delay(150);
  }
  async function shot(name) {
    send();
    await delay(250);
    await settle(win.webContents);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(win.webContents, label);
    fs.writeFileSync(path.join(CAPTURES, `${label}.png`), (await win.capturePage()).toPNG());
    const v = library.view();
    log.push(`${label} : ${v.heading} | ${v.subheading ?? ''} | ${v.actions.map((a) => `${a.label}${a.detail ? ` (${a.detail})` : ''}`).join(' | ')}`);
  }
  /** Fenêtre « Récupérer » : le bandeau et la page, capturés chacun. */
  async function shotAcquire(name) {
    const open = catalog().acquirer.current();
    await delay(400);
    await settle(open.view.webContents);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(open.win.webContents, `${label} (bandeau)`);
    fs.writeFileSync(path.join(CAPTURES, `${label}-bandeau.png`), (await open.win.capturePage()).toPNG());
    fs.writeFileSync(path.join(CAPTURES, `${label}-page.png`), (await open.view.webContents.capturePage()).toPNG());
    log.push(`${label} : fenêtre « Récupérer » sur ${open.view.webContents.getURL()} ; bandeau : ${JSON.stringify(open.request)} ; état : ${open.status}`);
  }
  const view = () => library.view();
  const act = (label) => {
    LOG.push(`→ ${label}`);
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  const key = (code, k = '') => library.handleKey({ type: 'keyDown', code, key: k, shift: false, control: false, alt: false, meta: false });
  async function idle(timeout = 300_000) {
    const end = Date.now() + timeout;
    await delay(150);
    while (view().busy && Date.now() < end) await delay(150);
    if (view().busy) throw new Error(`toujours occupé (${view().busy})`);
  }
  const waitList = () => core.loadWaitList(L.data);
  async function until(what, test, timeout = 30_000) {
    const end = Date.now() + timeout;
    while (!test() && Date.now() < end) await delay(200);
    if (!test()) throw new Error(`attendu en vain : ${what} ; écran : ${view().heading} ; ${JSON.stringify(view().sections.flatMap((x) => x.rows.map((r) => r.text))).slice(0, 600)} ; fenêtre « Récupérer » : ${library.catalog.acquirer.isOpen() ? library.catalog.acquirer.current().status : 'fermée'}`);
  }
  // Le catalogue est un module de la bibliothèque : on lit la fenêtre « Récupérer » par la vue d'ensemble.
  const catalog = () => library.catalog;

  /** Clique le lien de la fausse fiche, attend le fichier reçu, ferme la fenêtre. */
  async function download(kind) {
    const before = waitList().items.filter((i) => i.state === 'received').length;
    await catalog().acquirer.current().view.webContents.executeJavaScript(`document.querySelector('a.download').click()`);
    await until(`${kind} reçu`, () => waitList().items.filter((i) => i.state === 'received').length > before);
    await delay(300);
  }

  const acq = session.fromPartition(ACQUIRE_PARTITION);
  const inDays = (d) => Math.floor(Date.now() / 1000) + d * 86400;
  // La session « Récupérer » garde ses cookies d'un lancement à l'autre : on part d'une session vide.
  await acq.clearStorageData();
  // Connecté à vpuniverse.com (« se souvenir de moi » coché), pas encore à vpforums.org.
  for (const [name, value] of [['ips4_member_id', '4242'], ['ips4_login_key', 'clé'], ['ips4_device_key', 'appareil']]) {
    await acq.cookies.set({ url: 'https://vpuniverse.com/', name, value, expirationDate: inDays(90) });
  }

  // ---------- Comptes des sites ----------
  library.openSystem();
  act('Ajouter une table');
  act('Comptes des sites');
  await idle();
  await shot('comptes');
  act('Téléchargement direct');
  await idle();
  await shot('comptes-direct');

  // ---------- Ce qu'il faut pour Terminator 2 ----------
  library.openSystem();
  act('Ajouter une table');
  act('Trouver une table en ligne');
  act('J’ai compris');
  await idle();
  act('Chercher un titre');
  for (const c of 'terminator 2') key(c === ' ' ? 'Space' : `Key${c.toUpperCase()}`, c);
  key('Enter');
  await idle();
  act('Terminator 2 - Judgment Day');
  await idle();
  act(core.versionLabel(core.recommendVersion(vps.games.find((g) => g.id === T2)).file));
  await idle();

  // Table : téléchargée directement, sans fenêtre.
  act('Récupérer : Table');
  await idle();
  await until('table reçue', () => waitList().items.some((i) => i.kind === 'table' && i.state === 'received'));
  log.push(`fenêtre « Récupérer » ouverte pour la table : ${catalog().acquirer.isOpen()}`);
  await delay(300);
  await shot('table-directe');

  // ROM : pas connecté à vpforums.org, la page s'ouvre et le dit.
  act('Récupérer : ROM');
  await idle();
  await shotAcquire('rom-pas-connecte');
  catalog().acquirer.close();
  await idle();
  // Connexion à vpforums.org, puis de nouveau : par la page de confirmation, sans fenêtre.
  for (const [name, value] of [['member_id', '17'], ['pass_hash', 'empreinte']]) await acq.cookies.set({ url: 'https://www.vpforums.org/', name, value, expirationDate: inDays(365) });
  log.push(`cookies vpforums.org posés : ${JSON.stringify((await acq.cookies.get({})).filter((c) => c.domain.endsWith('vpforums.org')).map((c) => [c.name, c.value, c.domain]))} ; état : ${JSON.stringify(core.siteState(core.sourceSite('vpforums'), (await acq.cookies.get({})).filter((c) => c.domain.endsWith('vpforums.org')).map((c) => ({ name: c.name, value: c.value, expirationDate: c.expirationDate }))))}`);
  act('Récupérer : ROM');
  await idle();
  await until('ROM reçue', () => waitList().items.some((i) => i.kind === 'rom' && i.state === 'received'));
  log.push(`fenêtre ouverte pour la ROM, une fois connecté : ${catalog().acquirer.isOpen()}`);
  await delay(300);
  await shot('rom-directe');

  // Fronton : plusieurs fichiers sur la fiche, la page s'ouvre pour choisir.
  act('Récupérer : Fronton');
  await idle();
  library.handleAction({ type: 'activate', index: 0 });
  await idle();
  await shotAcquire('fronton-plusieurs-fichiers');
  catalog().acquirer.close();
  await idle();
  await shot('ce-qu-il-faut');

  // Comptes : les deux sites connectés ; déconnexion de vpforums.org.
  library.openSystem();
  act('Ajouter une table');
  act('Comptes des sites');
  await idle();
  await shot('comptes-deux-connectes');
  act('Se déconnecter : vpforums.org');
  await idle();
  await shot('comptes-deconnecte');
  log.push(`cookies vpforums.org après déconnexion : ${(await acq.cookies.get({})).filter((c) => c.domain.endsWith('vpforums.org')).length}`);

  ipcMain.removeListener('action', onAction);
  win.destroy();
  await acq.clearStorageData();
  log.push(`liste d’attente : ${JSON.stringify(waitList().items.map((i) => `${i.kind}:${i.state}:${i.received ? path.basename(i.received.file) : ''}`))}`);
  log.push(`réglage : ${JSON.stringify({ direct: waitList().directDownload })}`);
  return log;
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  // Garde-temps : une démonstration ne reste jamais bloquée ; le relevé dit où elle en était.
  setTimeout(() => {
    LOG.push('ÉCHEC : plus de cinq minutes, arrêt (dernière étape ci-dessus).');
    fs.mkdirSync(CAPTURES, { recursive: true });
    fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
    console.log(LOG.join('\n'));
    app.exit(2);
  }, 300_000).unref();
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = LOG;
  try {
    await run(report);
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  // app.quit() rendrait 0 même en échec : le script PowerShell n'y verrait rien.
  app.exit(process.exitCode ?? 0);
});
