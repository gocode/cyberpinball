// Démonstration hors écran de l'entonnoir « Ajouter une table » et de l'acquisition des
// tables (docs/recherche/acquisition.md, A3 à A7) : une seule entrée du menu système,
// catalogue de la vraie base VPS et ses filtres aux boutons, fiche de Terminator 2,
// installation rapide (pages ouvertes l'une après l'autre, plan, médias de VPinMediaDB
// téléchargés depuis GitHub), puis un complément récupéré dans son navigateur (liste
// d'attente, surveillance d'un dossier Téléchargements, « Prêt à installer »), mises à jour.
// Les pages de vpuniverse.com et vpforums.org ne sont jamais chargées : la session de la fenêtre
// « Récupérer » est servie par de fausses fiches qui proposent des fichiers factices.
// Aucune fenêtre n'apparaît (rendu hors écran), lancé par docs\demo-catalogue.ps1 sur le
// bureau caché. Captures et relevé dans tmp\demo-catalogue\captures.
//   npm run build
//   .\docs\demo-catalogue.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-catalogue');
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
  for (const f of fs.readdirSync(REAL_DOWNLOADS)) if (/^(vpsdb|vpinmdb)/.test(f)) fs.copyFileSync(path.join(REAL_DOWNLOADS, f), path.join(L.downloads, f));
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
  // Ce qu'une borne en 0.1.3-essai.1 a pu garder : un pack de médias rangé comme table de
  // Terminator 2 par une version qui ne vérifiait rien (contenu non noté), table bloquée.
  const vps = core.loadVpsDb(L.downloads);
  const t2 = vps.games.find((g) => g.id === T2);
  const advice = core.recommendVersion(t2).file;
  const list = { items: [] };
  const item = core.addToWaitList(list, t2, { kind: 'table', required: true, state: 'todo', detail: '', files: [] }, advice, core.liveLinks(advice)[0].url, new Date('2026-10-24T20:00:00Z'));
  const pack = put(path.join(L.downloads, 'acquisition', 'Terminator 2 Media Pack.zip'), mediaPack());
  core.markReceived(item, pack, 'window', new Date('2026-10-24T20:05:00Z'));
  core.saveWaitList(L.data, list);
  return { root, L };
}

/** Pack de médias pour PinUP Popper : images et vidéos, aucun .vpx. */
function mediaPack() {
  return zipStored({ 'T2/Wheel/Terminator 2.png': 'png', 'T2/Backglass/Terminator 2.mp4': 'mp4', 'T2/DMD/Terminator 2.mp4': 'mp4', 'T2/Topper/Terminator 2.mp4': 'mp4', 'T2/Audio/launch.mp3': 'mp3' });
}

/**
 * Fausses fiches de forum pour les fichiers de Terminator 2 : une page avec un lien
 * « Télécharger », qui renvoie un fichier factice du bon genre (table, fronton, ROM).
 */
function fakeForum(vps) {
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
  add('pup', game.pupPackFiles);
  const content = (kind, file) => {
    if (kind === 'table') return { name: `Terminator 2 (Williams 1991) VPW ${file.version}.vpx`, data: vpxWithInfo({ TableName: 'Terminator 2 - Judgment Day (Williams 1991)', AuthorName: (file.authors ?? []).join(', '), TableVersion: file.version ?? '1.0' }) };
    if (kind === 'b2s') return { name: 'Terminator 2 (Williams 1991).directb2s', data: '<DirectB2SData><Name Value="Terminator 2" /></DirectB2SData>' };
    if (kind === 'rom') return { name: `${file.version}.zip`, data: zipStored({ [`${file.version}.rom`]: 'programme', 't2_u18.l3': 'son 1', 't2_u15.l3': 'son 2' }) };
    return { name: 'Terminator 2 PuP-Pack.zip', data: zipStored({ 'screens.pup': 'x' }) };
  };
  return async (request) => {
    const url = new URL(request.url);
    const key = core.pageKey(request.url);
    const hit = key && files.get(key);
    if (!hit) return new Response('<h1>Page de démonstration absente</h1>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    // La fiche d'une table propose aussi son pack de médias, comme sur vpuniverse.com.
    if (url.searchParams.get('media') === '1') return new Response(mediaPack(), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="Terminator 2 Media Pack.zip"' } });
    if (url.searchParams.get('do') === 'download' || url.searchParams.get('dl') === '1') {
      const { name, data } = content(hit.kind, hit.file);
      return new Response(data, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name}"` } });
    }
    const title = `${game.name} : ${hit.kind === 'rom' ? `ROM ${hit.file.version}` : (hit.file.authors ?? []).join(', ')} ${hit.kind === 'rom' ? '' : hit.file.version ?? ''}`;
    const html = `<!doctype html><meta charset="utf-8"><title>${title}</title>
      <body style="font-family:Segoe UI;background:#1b1f2a;color:#e5e7eb;padding:40px">
      <p style="color:#94a3b8">Fausse fiche de démonstration (${url.hostname}) : la vraie demande de se connecter.</p>
      <h1>${title}</h1><p>Connecté en tant que <b>demo</b>.</p>
      <a class="download" href="${url.origin}${url.pathname}${url.search ? `${url.search}&` : '?'}do=download" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Download this file</a>
      ${hit.kind === 'table' ? `<a class="media" href="${url.origin}${url.pathname}${url.search ? `${url.search}&` : '?'}media=1" style="display:inline-block;margin-left:20px;padding:14px 28px;background:#475569;color:#fff;border-radius:6px;text-decoration:none">Media pack</a>` : ''}`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
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
  session.fromPartition(ACQUIRE_PARTITION).protocol.handle('https', fakeForum(vps));

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
    if (!test()) throw new Error(`attendu en vain : ${what}`);
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

  /** Attend que la fenêtre « Récupérer » montre la fiche de cet élément, chargée. */
  async function pageOf(item) {
    await until(`fiche de ${item.kind}`, () => {
      const open = catalog().acquirer.current();
      return open && core.pageKey(open.view.webContents.getURL()) === core.pageKey(item.page) && !open.view.webContents.isLoading();
    });
  }
  const press = (group) => key(KEYS[group][0]);

  // ---------- Menu système : une seule entrée, l'entonnoir ----------
  library.openSystem();
  await shot('menu-systeme');
  act('Ajouter une table');
  await shot('entonnoir');
  act('Trouver une table en ligne');
  await shot('avertissement');
  act('J’ai compris');
  await idle();
  await shot('catalogue');

  // ---------- Filtres, aux boutons de la borne ----------
  act('Filtres');
  await idle();
  await shot('filtres');
  press('confirm'); // Jeux : tous -> sans ROM à trouver
  await shot('filtres-sans-rom');
  press('confirm'); // -> électroniques
  press('next');
  for (let i = 0; i < 3; i++) press('confirm'); // Fichiers : peu importe -> fronton -> ROM -> PuP-Pack
  await shot('filtres-fichiers-pup');
  press('next');
  press('confirm'); // Site : vpuniverse.com
  await shot('filtres-site');
  act('Voir les');
  await idle();
  await shot('catalogue-filtre');
  act('Filtres');
  await idle();
  act('Effacer les filtres');
  await shot('filtres-effaces');
  act('Voir les');
  await idle();
  act('Chercher un titre');
  for (const c of 'terminator') key(`Key${c.toUpperCase()}`, c);
  key('Enter');
  await idle();
  await shot('recherche-terminator');
  act('Terminator 2 - Judgment Day');
  await idle();
  await shot('versions-t2');

  // ---------- Réparer l'existant : le pack de médias rangé comme table (0.1.3-essai.1), détecté ----------
  const advice = core.recommendVersion(vps.games.find((g) => g.id === T2));
  act(core.versionLabel(advice.file));
  await idle();
  await shot('ce-qu-il-faut-a-corriger');
  log.push(`à corriger : ${JSON.stringify(catalog().problems().map((p) => `${p.item.kind}:${p.problem}:${p.content}`))}`);
  if (!catalog().problems().some((p) => p.item.kind === 'table' && p.content === 'media')) throw new Error('le pack de médias rangé comme table n’est pas détecté');
  act('Table : à corriger');
  await shot('element-a-corriger');
  // Aux boutons : Start sur la première action proposée, « Vider l'élément ».
  if (view().actions[view().cursor].label !== 'Vider l’élément') throw new Error(`action proposée : ${view().actions[view().cursor].label}`);
  key(KEYS.confirm[0]);
  await idle();
  await shot('table-videe');
  if (waitList().items.find((i) => i.kind === 'table').state !== 'waiting') throw new Error('la table n’est pas redevenue attendue');
  act('Terminator 2 Media Pack.zip');
  await shot('pack-de-cote');
  act('Rattacher à un autre élément');
  await idle();
  await shot('rattacher-a');
  act('Retour');
  act('Le mettre à la corbeille');
  await idle();
  await shot('pack-a-la-corbeille');
  // Exit : la liste revient au catalogue, d'où l'on retrouve la version.
  key(KEYS.exit[0]);
  await idle();
  act('Terminator 2 - Judgment Day');
  await idle();
  act(core.versionLabel(advice.file));
  await idle();

  // ---------- Fenêtre « Récupérer » : le pack de médias de la fiche n'est pas rangé comme table ----------
  act('Récupérer : Table');
  await idle();
  await shotAcquire('recuperer-table');
  const strays = () => (waitList().strays ?? []).length;
  const before = strays();
  await catalog().acquirer.current().view.webContents.executeJavaScript(`document.querySelector('a.media').click()`);
  await until('pack de médias gardé de côté', () => strays() > before);
  await idle();
  await shot('fichier-recu-a-verifier');
  if (waitList().items.find((i) => i.kind === 'table').state !== 'waiting') throw new Error('le pack de médias a été rangé comme table');
  act('Le garder de côté');
  await idle();
  catalog().acquirer.close();
  await idle();
  act('Autres versions');
  await idle();

  // ---------- Installation rapide : chaque page s'ouvre d'elle-même, puis le plan ----------
  act('Installation rapide');
  await idle();
  const quickKinds = [];
  for (let n = 0; n < 4; n++) {
    const next = waitList().items.find((i) => i.state === 'waiting' && ['table', 'b2s', 'rom'].includes(i.kind));
    if (!next || !catalog().acquirer.isOpen()) break;
    await pageOf(next);
    if (n === 0) {
      await shot('installation-rapide');
      await shotAcquire('installation-rapide-table');
    }
    quickKinds.push(next.kind);
    await download(next.kind);
  }
  log.push(`installation rapide : ${quickKinds.join(', ')} récupérés l’un après l’autre ; fenêtre ouverte à la fin : ${catalog().acquirer.isOpen()}`);
  await idle();
  for (let i = 0; i < 5 && view().heading !== 'Plan d’installation'; i++) {
    // Choix éventuels : le premier proposé.
    library.handleAction({ type: 'activate', index: 0 });
    await idle();
  }
  await shot('plan-installation-rapide');
  act('Installer');
  await idle();
  await shot('apres-installation-rapide');
  const t2Table = () => core.scanTables(L.tables).find((t) => t.info.Info?.VPSId === T2);
  log.push(`médias rangés : ${JSON.stringify(t2Table() && fs.existsSync(path.join(t2Table().folder, 'medias')) ? fs.readdirSync(path.join(t2Table().folder, 'medias')) : [])}`);

  // ---------- Chemin manuel : un complément récupéré dans son navigateur ----------
  library.openSystem();
  act('Ajouter une table');
  act('Trouver une table en ligne');
  await idle();
  act('Filtres');
  await idle();
  act('Sur la borne');
  act('Voir les');
  await idle();
  act('Terminator 2 - Judgment Day');
  await idle();
  act(core.versionLabel(core.recommendVersion(vps.games.find((g) => g.id === T2)).file));
  await idle();
  await shot('ce-qu-il-faut-installe');
  // PuP-Pack : la page s'ouvre, mais on le télécharge « dans son navigateur ».
  act('Récupérer : PuP-Pack');
  await idle();
  await shot('pup-au-choix');
  act('LTek');
  await idle();
  catalog().acquirer.close();
  await idle();
  library.openSystem();
  act('Ajouter une table');
  act('Récupérés et attendus');
  await idle();
  act('Surveiller Téléchargements');
  await shot('recuperes-et-attendus');
  put(path.join(userDownloads, 'Terminator 2 PuP-Pack 3.0.zip.crdownload'), 'en cours');
  await delay(500);
  fs.renameSync(path.join(userDownloads, 'Terminator 2 PuP-Pack 3.0.zip.crdownload'), path.join(userDownloads, 'Terminator 2 PuP-Pack 3.0.zip'));
  fs.writeFileSync(path.join(userDownloads, 'Terminator 2 PuP-Pack 3.0.zip'), zipStored({ 'screens.pup': 'ScreenNum,ScreenDes\r\n2,Backglass' }));
  await until('PuP-Pack reçu par la surveillance', () => waitList().items.some((i) => i.kind === 'pup' && i.state === 'received'), 20_000);
  await delay(300);
  await shot('recuperes-pup-recu');
  // En borne (zone du playfield en hauteur) : la liste et un élément, aux boutons.
  win.setContentSize(1080, 1920);
  await delay(300);
  // Aux flippers jusqu'au premier élément, Start pour l'ouvrir.
  for (let i = 0; i < 20 && view().cursor !== 0; i++) key(KEYS.previous[0]);
  await shot('recuperes-borne');
  key(KEYS.confirm[0]);
  await shot('element-borne');
  if (!view().heading.startsWith('PuP-Pack : ')) throw new Error(`Start sur la première ligne : ${view().heading}`);
  key(KEYS.exit[0]);
  await idle();
  win.setContentSize(sc.width, sc.height);
  await delay(300);
  // Un élément reçu, le remplacer, retirer le jeu : les écrans, sans rien changer.
  act('PuP-Pack : ');
  await shot('element-recu');
  act('Remplacer par un autre fichier');
  await idle();
  await shot('remplacer-le-pup');
  act('Retour');
  act('Retirer tout le jeu de la liste');
  await shot('retirer-le-jeu');
  act('Annuler');
  act('Retour à la liste');
  await idle();
  act('Retour');
  await idle();
  await shot('entonnoir-pret-a-installer');
  library.openSystem();
  await shot('menu-systeme-pastille');
  act('Ajouter une table');
  act('Installer : Terminator 2');
  await idle();
  for (let i = 0; i < 5 && !view().actions.some((a) => a.label === 'Installer'); i++) {
    // Choix éventuels (option du PuP-Pack) : le premier proposé.
    library.handleAction({ type: 'activate', index: 0 });
    await idle();
  }
  await shot('plan-complement');
  act('Installer');
  await idle();
  await shot('apres-complement');

  // ---------- Mises à jour, depuis l'entonnoir ----------
  library.openSystem();
  act('Ajouter une table');
  act('Mises à jour des tables');
  await idle();
  await shot('mises-a-jour');

  ipcMain.removeListener('action', onAction);
  win.destroy();
  const t2 = core.scanTables(L.tables).find((t) => t.info.Info?.VPSId === T2);
  log.push(`T2 installée : ${t2 ? path.relative(L.tables, t2.file) : 'non'}`);
  log.push(`provenance : ${t2 ? JSON.stringify(core.tableSourceOf(t2.info)) : '-'}`);
  log.push(`ROM : ${JSON.stringify(fs.readdirSync(L.roms))} ; dans la table : ${t2 ? JSON.stringify(fs.existsSync(core.tableRomsDir(t2.folder)) ? fs.readdirSync(core.tableRomsDir(t2.folder)) : []) : '-'}`);
  log.push(`dossier de la table : ${t2 ? JSON.stringify(fs.readdirSync(t2.folder)) : '-'}`);
  log.push(`liste d’attente : ${JSON.stringify(waitList().items.map((i) => `${i.kind}:${i.state}`))}`);
  log.push(`downloads\\acquisition : ${JSON.stringify(fs.existsSync(path.join(L.downloads, 'acquisition')) ? fs.readdirSync(path.join(L.downloads, 'acquisition')) : [])}`);
  log.push(`Téléchargements de l’utilisateur : ${JSON.stringify(fs.readdirSync(userDownloads))}`);
  return log;
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  // Garde-temps : une démonstration ne reste jamais bloquée ; le relevé dit où elle en était
  // (huit minutes : les médias de VPinMediaDB, environ 14 Mo, sont vraiment téléchargés).
  setTimeout(() => {
    LOG.push('ÉCHEC : plus de huit minutes, arrêt (dernière étape ci-dessus).');
    fs.mkdirSync(CAPTURES, { recursive: true });
    fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
    console.log(LOG.join('\n'));
    app.exit(2);
  }, 480_000).unref();
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
  app.quit();
});
