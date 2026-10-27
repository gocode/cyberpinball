// Démonstration hors écran du parcours « Ce qu'il manque pour jouer » : Terminator 2,
// installée sans sa ROM (t2_l8), une révision voisine (t2_l6) déjà dans la bibliothèque.
// Fiche (« Ce qu'il manque pour jouer » en tête), médecin, échec d'une partie, puis le
// parcours : ROM à récupérer, avertissement du catalogue, fenêtre « Récupérer » sur une
// fausse fiche vpforums.org (aucune page des forums n'est chargée), ROM reçue, reprise
// depuis la liste d'attente, plan d'installation, retour au parcours, « Jouer ». Puis une
// table originale qui dessine son DMD avec FlexDMD, livrée sans son dossier ni fronton :
// rien d'obligatoire ne manque, « Jouer » est proposé tout de suite, le contenu du DMD et
// le fronton « pour aller plus loin » (playable.ts). Chaque
// état est capturé en paysage (bureau) et en portrait (borne). Vraie base VPS, copiée
// depuis D:\CyberPinball\downloads. Aucune fenêtre n'apparaît : lancé par
// docs\demo-parcours.ps1 sur le bureau caché. Captures et relevé dans tmp\demo-parcours\captures.
//   npm run build
//   .\docs\demo-parcours.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-parcours');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { ACQUIRE_PARTITION } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
const { vpxWithInfo, zipStored } = require('./demo-fichiers.cjs');
let servedDirs = () => [];
const LOG = [];

const REAL_DOWNLOADS = 'D:\\CyberPinball\\downloads';
const T2 = 'BunvWvh9';
const TABLE = 'Terminator 2 - Judgment Day (Williams 1991)';
const SCRIPT = 'Option Explicit\r\nConst cGameName="t2_l8"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = cGameName\r\n';
/** Table originale (sans ROM) dont le script dessine le DMD avec FlexDMD, livrée sans son dossier ni fronton. */
const GOONIES = 'The Goonies Never Say Die Pinball (Original 2021)';
const GOONIES_VPS = '34pZqivK';
const GOONIES_SCRIPT = 'Option Explicit\r\nDim FlexDMD\r\nSet FlexDMD = CreateObject("FlexDMD.FlexDMD")\r\nWith FlexDMD\r\n  .GameName = "goonies"\r\n  .ProjectFolder = "./TheGooniesDMD/"\r\nEnd With\r\n';

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

/** Racine factice : Terminator 2 installée sans ROM, t2_l6 dans la bibliothèque, borne à trois écrans. */
function sandbox() {
  const root = path.join(BASE, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(REAL_DOWNLOADS)) if (/^vpsdb/.test(f)) fs.copyFileSync(path.join(REAL_DOWNLOADS, f), path.join(L.downloads, f));
  const folder = path.join(L.tables, TABLE);
  const table = put(path.join(folder, `${TABLE}.vpx`), vpxWithInfo({ TableName: 'Terminator 2 - Judgment Day', AuthorName: 'G5k, VPW', TableVersion: '1.25' }));
  put(path.join(folder, `${TABLE}.directb2s`), '<DirectB2SData><Name Value="Terminator 2" /></DirectB2SData>');
  put(path.join(folder, `${TABLE}.info`), JSON.stringify({ Info: { Title: 'Terminator 2 - Judgment Day', Manufacturer: 'Williams', Year: 1991, VPSId: T2 } }, null, 2));
  // Script déjà lu (comme après « Ajouter une table ») : VPX n'est jamais lancé.
  rememberScript(table, core.scriptFacts(SCRIPT), L.data);
  // Une autre révision du même jeu, déjà sur la borne : l'alias est proposé en second.
  put(path.join(L.roms, 't2_l6.zip'), zipStored({ 't2_l6.rom': 'révision voisine' }));
  put(path.join(root, 'emulators', 'vpx', 'VPinballX64.exe'), '');
  const goonies = put(path.join(L.tables, GOONIES, `${GOONIES}.vpx`), vpxWithInfo({ TableName: 'The Goonies Never Say Die Pinball', AuthorName: 'VPW', TableVersion: '1.5' }));
  put(path.join(L.tables, GOONIES, `${GOONIES}.info`), JSON.stringify({ Info: { Title: 'The Goonies Never Say Die Pinball', Manufacturer: 'Original', Year: 2021, VPSId: GOONIES_VPS } }, null, 2));
  rememberScript(goonies, core.scriptFacts(GOONIES_SCRIPT), L.data);
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
  return { root, L, table, folder };
}

/** Fausse fiche vpforums.org de la ROM t2_l8 : une page avec « Download », qui renvoie un zip factice. */
function fakeForum() {
  return async (request) => {
    const url = new URL(request.url);
    if (core.pageKey(request.url) !== 'vpf:7318') return new Response('<h1>Page de démonstration absente</h1>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.searchParams.get('do') === 'download') {
      return new Response(zipStored({ 't2_l8.rom': 'programme', 't2_u18.l3': 'son 1', 't2_u15.l3': 'son 2' }), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="t2_l8.zip"' } });
    }
    const html = `<!doctype html><meta charset="utf-8"><title>Terminator 2 : ROM t2_l8</title>
      <body style="font-family:Segoe UI;background:#1b1f2a;color:#e5e7eb;padding:40px">
      <p style="color:#94a3b8">Fausse fiche de démonstration (${url.hostname}) : la vraie demande de se connecter.</p>
      <h1>Terminator 2 - Judgment Day : ROM t2_l8</h1><p>Connecté en tant que <b>demo</b>.</p>
      <a class="download" href="${url.origin}${url.pathname}${url.search}&do=download" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Download this file</a>`;
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
  const LANDSCAPE = { width: 1920, height: 1080 };
  const PORTRAIT = { width: 1080, height: 1920 };
  const win = offscreen(LANDSCAPE.width, LANDSCAPE.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  let message;
  const played = [];
  const library = createLibrary({
    // Mode invité inactif : tout passe (host.guest est obligatoire, library.ts).
    guest: { active: false, allows: () => true, knock: () => true },
    root,
    dataDir: L.data,
    vpxExe: () => path.join(root, 'emulators', 'vpx', 'VPinballX64.exe'),
    tables: () => tables,
    reload: () => (tables = core.scanTables(L.tables)),
    enter: () => (phase = 'library'),
    leave: () => (phase = 'menu'),
    play: (table) => {
      played.push(table.title);
      phase = 'menu';
    },
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
      message,
      library: phase === 'library' ? library.view() : undefined,
    });
  }
  const onAction = (_e, action) => library.handleAction(action);
  ipcMain.on('action', onAction);
  const ready = new Promise((r) => ipcMain.once('ready', r));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: '0', zones: '[]' } });
  await ready;
  session.fromPartition(ACQUIRE_PARTITION).protocol.handle('https', fakeForum());

  fs.mkdirSync(CAPTURES, { recursive: true });
  let step = 0;
  const log = LOG;
  async function settle(contents) {
    for (let i = 0; i < 60; i++) {
      const ok = await contents.executeJavaScript(`[...document.images].every((i) => i.complete) && [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error)`);
      if (ok) break;
      await delay(100);
    }
    await delay(150);
  }
  async function capture(label) {
    send();
    await delay(250);
    await settle(win.webContents);
    await report.check(win.webContents, label);
    fs.writeFileSync(path.join(CAPTURES, `${label}.png`), (await win.capturePage()).toPNG());
  }
  /** L'écran courant en paysage (bureau) ; `portrait` : aussi en portrait (borne). */
  async function shot(name, portrait = false) {
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await capture(label);
    if (portrait) {
      win.setContentSize(PORTRAIT.width, PORTRAIT.height);
      await delay(300);
      await capture(`${label}-borne`);
      win.setContentSize(LANDSCAPE.width, LANDSCAPE.height);
      await delay(300);
    }
    const v = library.view();
    if (phase === 'library' && v) {
      log.push(`${label} : ${v.heading} | ${v.subheading ?? ''} | ${v.actions.map((a) => `${a.label}${a.detail ? ` (${a.detail})` : ''}`).join(' | ')}`);
      if (v.journey) log.push(`   ${v.journey.position} · ${v.journey.summary} : ${v.journey.steps.map((s) => `${s.n} ${s.title} [${s.word}]${s.current ? ' ←' : ''}`).join(' · ')}`);
      if (v.journey?.extras.length) log.push(`   ${v.journey.extrasTitle} : ${v.journey.extras.map((s) => `${s.title} [${s.word}]`).join(' · ')}`);
    } else log.push(`${label} : ${phase}${message ? ` « ${message.title} »` : ''}`);
  }
  async function shotAcquire(name) {
    const open = library.catalog.acquirer.current();
    await delay(400);
    await settle(open.view.webContents);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(open.win.webContents, `${label} (bandeau)`);
    fs.writeFileSync(path.join(CAPTURES, `${label}-bandeau.png`), (await open.win.capturePage()).toPNG());
    fs.writeFileSync(path.join(CAPTURES, `${label}-page.png`), (await open.view.webContents.capturePage()).toPNG());
    log.push(`${label} : fenêtre « Récupérer » sur ${open.view.webContents.getURL()} ; bandeau : ${JSON.stringify(open.request)}`);
  }
  const view = () => library.view();
  const act = (label) => {
    LOG.push(`→ ${label}`);
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  async function idle(timeout = 120_000) {
    const end = Date.now() + timeout;
    await delay(150);
    while (view()?.busy && Date.now() < end) await delay(150);
    if (view()?.busy) throw new Error(`toujours occupé (${view().busy})`);
  }
  async function until(what, test, timeout = 30_000) {
    const end = Date.now() + timeout;
    while (!test() && Date.now() < end) await delay(200);
    if (!test()) throw new Error(`attendu en vain : ${what}`);
  }
  const waitList = () => core.loadWaitList(L.data);
  const t2 = () => tables.find((t) => t.info.Info?.VPSId === T2);
  const current = () => view().journey?.steps.find((s) => s.current);
  const expect = (what, ok) => {
    log.push(`${ok ? 'OK' : 'ÉCHEC'} : ${what}`);
    if (!ok) throw new Error(what);
  };

  // ---------- Les trois portes d'entrée ----------
  library.openSheet(t2());
  await shot('fiche-rom-absente');
  expect('la fiche met « Ce qu’il manque pour jouer » en tête', view().actions[0].label === 'Ce qu’il manque pour jouer');
  act('Diagnostiquer et réparer');
  await idle();
  await shot('medecin');
  expect('le médecin propose le parcours', view().actions[0].label === 'Ce qu’il manque pour jouer');
  // Partie échouée (message de frontend.ts) : Start mène au parcours.
  phase = 'message';
  message = { title: 'La partie n’a pas pu se dérouler', lines: ['Fermeture de VPX : « can\'t start game » (t2_l8).', 'La ROM de cette table est introuvable : elle doit être dans le dossier pinmame\\roms de la table.'], action: 'journey', table: t2().file };
  await shot('partie-echouee', true);
  message = undefined;
  phase = 'library';

  // ---------- Le parcours : ROM absente ----------
  library.openJourney(t2().file);
  await idle();
  await shot('parcours-rom-absente', true);
  expect('étape courante : ROM t2_l8, à faire', current()?.title === 'ROM t2_l8' && current()?.word === 'À faire');
  expect('geste conseillé : récupérer la ROM sur vpforums.org', view().actions[0].label === 'Récupérer la ROM t2_l8' && /vpforums\.org/.test(view().actions[0].detail));
  expect('révision voisine proposée ensuite', view().actions.some((a) => a.label === 'Jouer avec t2_l6, révision voisine'));

  // « Récupérer » : avertissement du catalogue au premier usage, puis la fiche dans la fenêtre « Récupérer ».
  act('Récupérer la ROM t2_l8');
  await idle();
  await shot('avertissement');
  act('J’ai compris');
  await idle();
  await shotAcquire('recuperer-rom');
  await shot('parcours-page-ouverte');
  expect('la ROM est attendue pour cette table', waitList().items.some((i) => i.rom === 't2_l8' && i.state === 'waiting' && i.table === t2().file));
  await library.catalog.acquirer.current().view.webContents.executeJavaScript(`document.querySelector('a.download').click()`);
  await until('ROM reçue', () => waitList().items.some((i) => i.rom === 't2_l8' && i.state === 'received'));
  await delay(400);
  library.catalog.acquirer.close();
  await idle();
  await shot('parcours-rom-recue', true);
  expect('ROM reçue : à installer', current()?.word === 'À installer' && view().actions[0].label === 'Installer le fichier reçu');

  // ---------- Reprendre plus tard : depuis la liste d'attente (« Récupérés et attendus ») ----------
  // Exit (ou « ‹ Retour à la fiche » en tête) : la fiche garde le parcours en tête.
  LOG.push('→ Exit');
  library.handleAction({ type: 'back' });
  await idle();
  await shot('fiche-parcours-commence');
  // La liste d'attente est dans l'entonnoir « Ajouter une table ».
  library.openSystem();
  act('Ajouter une table');
  act('Récupérés et attendus');
  await idle();
  await shot('liste-attente');
  act('Reprendre : ce qu’il manque pour jouer');
  await idle();
  expect('le parcours reprend au même point', current()?.word === 'À installer');

  // ---------- Installer, revérifier, jouer ----------
  act('Installer le fichier reçu');
  await idle();
  await shot('plan-installation');
  act('Installer');
  await idle();
  await shot('parcours-pret', true);
  const romsDir = core.tableRomsDir(t2().folder);
  expect('t2_l8 dans la bibliothèque et liée dans la table', fs.existsSync(path.join(L.roms, 't2_l8.zip')) && fs.existsSync(path.join(romsDir, 't2_l8.zip')));
  expect('prête : « Jouer » est le geste conseillé', view().actions[0].label === 'Jouer' && current()?.title === 'Jouer');
  expect('la ROM est marquée installée dans la liste d’attente', waitList().items.find((i) => i.rom === 't2_l8')?.state === 'installed');
  act('Jouer');
  await delay(200);
  expect('la partie est lancée', played.length === 1);
  expect('parcours terminé, plus proposé à la reprise', !core.journeyRecord(core.loadJourneys(L.data), t2().file));
  library.openSheet(t2());
  await shot('fiche-apres');
  expect('la fiche ne propose plus le parcours', view().actions[0].label === 'Jouer');

  // ---------- Sans contenu du DMD ni fronton : « Jouer » tout de suite ----------
  const goonies = () => tables.find((t) => t.info.Info?.VPSId === GOONIES_VPS);
  library.openSheet(goonies());
  await shot('goonies-fiche', true);
  expect('fiche : « Jouer » en tête, rien d’indispensable', view().actions[0].label === 'Jouer' && !view().actions.some((a) => a.label === 'Ce qu’il manque pour jouer'));
  expect('fiche : le contenu du DMD proposé « pour aller plus loin »', view().actions.some((a) => a.label === 'Pour aller plus loin'));
  act('Diagnostiquer et réparer');
  await idle();
  await shot('goonies-medecin');
  expect('médecin : dossier du DMD en avertissement, pas de parcours imposé', !view().actions.some((a) => a.label === 'Ce qu’il manque pour jouer') && view().sections.some((sec) => sec.rows.some((r) => /TheGooniesDMD/.test(r.text) && r.tone === 'warning')));
  library.openJourney(goonies().file);
  await idle();
  await shot('goonies-parcours', true);
  const j = view().journey;
  expect('parcours : « Tout est prêt pour jouer », Jouer conseillé', view().heading === 'Tout est prêt pour jouer' && view().actions[0].label === 'Jouer' && current()?.title === 'Jouer');
  expect('parcours : étape 3 sur 3, les améliorations hors décompte', j.position === 'Étape 3 sur 3' && j.extras.some((s) => s.title === 'Contenu du DMD' && s.word === 'Facultatif') && j.extras.some((s) => s.title === 'Fronton'));
  act('Jouer');
  await delay(200);
  expect('la partie est lancée sans le dossier du DMD ni le fronton', played.length === 2);

  ipcMain.removeListener('action', onAction);
  win.destroy();
  log.push(`ROM de la bibliothèque : ${JSON.stringify(fs.readdirSync(L.roms))} ; dans la table : ${JSON.stringify(fs.readdirSync(romsDir))}`);
  log.push(`liste d’attente : ${JSON.stringify(waitList().items.map((i) => `${i.kind}:${i.rom}:${i.state}`))}`);
  log.push(`downloads\\acquisition : ${JSON.stringify(fs.existsSync(path.join(L.downloads, 'acquisition')) ? fs.readdirSync(path.join(L.downloads, 'acquisition')) : [])}`);
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
  try {
    await run(report);
  } catch (error) {
    LOG.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
  console.log(LOG.join('\n'));
  app.quit();
});
