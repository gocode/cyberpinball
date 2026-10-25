// Démonstration hors écran de l'écran « Téléchargements » et du sélecteur de fichiers de
// Cyber Pinball, sur un bac à sable : téléchargements de toutes provenances (« Récupérer »,
// médias des sites, recherche web, VPinMediaDB, mise à jour, archive de VPX), liste
// d'attente (un fichier à installer, une table installée, un fichier gardé de côté),
// Téléchargements de Windows, Bureau et une clé USB simulée (CYBERPINBALL_LECTEURS).
// Parcours : liste, détail d'un fichier, Téléchargements de Windows, tri ; entonnoir
// « Ajouter une table » > « Reprendre un fichier téléchargé » (sélecteur, deux fichiers
// cochés), clé USB, dossier, remontée par Exit, tous les fichiers, annulation qui rend
// l'écran d'origine ; médias d'une table > « Choisir un fichier… » (filtré, un seul choix) ;
// enfin « Tout vider », confirmation (curseur sur Annuler), corbeille et liste d'attente.
// Sur trois écrans — paysage 1920×1080, le même couché (borne, playfield tourné) et portrait
// 1080×1920 —, en français, et couché en anglais. Aucune fenêtre n'apparaît : lancé par
// docs\demo-telechargements.ps1 sur le bureau caché. Captures, relevé (resultat.txt) et
// contrôle de la mise en page dans tmp\demo-telechargements\captures.
//   npm run build
//   .\docs\demo-telechargements.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-telechargements');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
let servedDirs = () => [];

const MM = 'Medieval Madness (Williams 1997)';
const SCREENS = [
  { name: 'paysage', width: 1920, height: 1080, rotation: 0 },
  { name: 'couche', width: 1920, height: 1080, rotation: 90 },
  { name: 'portrait', width: 1080, height: 1920, rotation: 0 },
];
const SCENARIOS = [...SCREENS.map((s) => ({ ...s, lang: 'fr' })), { ...SCREENS[1], lang: 'en' }];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}
function put(file, data = 'x', ageDays = 0) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  const when = new Date(Date.now() - ageDays * 24 * 3600_000);
  fs.utimesSync(file, when, when);
  return file;
}

function sandbox(name) {
  const box = path.join(BASE, name);
  const root = path.join(box, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  const kb = (n) => 'x'.repeat(1024 * n);
  const mm = put(path.join(L.tables, MM, `${MM} VPW 2.0.vpx`), kb(300));
  put(path.join(L.tables, MM, `${MM}.info`), JSON.stringify({ Info: { Title: 'Medieval Madness', Manufacturer: 'Williams', Year: 1997 } }));
  const dl = L.downloads;
  const files = {
    rom: put(path.join(dl, 'acquisition', 'mm_109c.zip'), kb(1500), 0.1),
    table: put(path.join(dl, 'acquisition', `${MM} VPW 2.0.vpx`), kb(300), 1),
    stray: put(path.join(dl, 'acquisition', 'T2 3screens fullDMD by HauntFreaks.directb2s'), kb(4200), 2),
    orphan: put(path.join(dl, 'acquisition', 'Attack from Mars (Bally 1995) VPW 1.0 avec un nom vraiment long pour voir.7z'), kb(900), 3),
    site: put(path.join(dl, 'sites', 'vpforums-123', 'fichiers', 'Wheel', 'Terminator 2 Wheel.png'), kb(340), 4),
    web: put(path.join(dl, 'sites', 'web', 'k1', 'fichiers', 'mm-backglass-1080.mp4'), kb(1800), 1.5),
    update: put(path.join(dl, 'cyberpinball', 'CyberPinball-Setup-0.1.1.exe'), kb(800), 6),
    vpx: put(path.join(dl, 'VPinballX_BGFX-10.8.1-windows-x64.zip'), kb(2000), 7),
  };
  put(path.join(dl, 'vpsdb.json'), '[]');
  put(path.join(dl, 'sites', 'recus.json'), JSON.stringify([{ key: 'vpforums:123', site: 'vpforums', title: 'Terminator 2 wheel pack', url: 'https://www.vpforums.org/index.php?app=downloads&showfile=123', type: 'Wheel', date: new Date().toISOString(), files: [{ file: files.site, type: 'Wheel', kind: 'image' }] }]));
  put(path.join(dl, 'sites', 'web.json'), JSON.stringify([{ key: 'web:k1', table: mm, type: 'Backglass', url: 'https://example.org/mm-backglass-1080.mp4', filename: 'mm-backglass-1080.mp4', date: new Date().toISOString(), files: [{ file: files.web, type: 'Backglass', kind: 'video' }] }]));
  core.saveWaitList(L.data, {
    items: [
      { id: 'mm:rom', gameId: 'mm', gameLabel: MM, kind: 'rom', fileId: 'rom', label: 'mm_109c', page: 'https://www.vpforums.org/index.php?app=downloads&showfile=1', addedAt: new Date().toISOString(), state: 'received', received: { file: files.rom, at: new Date().toISOString(), via: 'window', url: 'https://www.vpforums.org/index.php?app=downloads&showfile=1', content: 'rom' } },
      { id: 'mm:table', gameId: 'mm', gameLabel: MM, kind: 'table', fileId: 'tbl', label: 'VPW 2.0', page: 'https://vpuniverse.com/files/file/1-mm/', addedAt: new Date().toISOString(), state: 'installed', table: mm, received: { file: files.table, at: new Date().toISOString(), via: 'window', content: 'table' } },
    ],
    strays: [{ file: files.stray, at: new Date().toISOString(), via: 'window', url: 'https://vpuniverse.com/files/file/2-t2/', content: 'b2s' }],
  });
  // Téléchargements de Windows, Bureau, clé USB.
  const windows = path.join(box, 'Windows Downloads');
  put(path.join(windows, 't2_l8.zip'), kb(458), 2);
  put(path.join(windows, 'facture.pdf'), kb(80), 1);
  put(path.join(windows, 'vieux.zip'), kb(10), 90);
  const desktop = path.join(box, 'Bureau');
  put(path.join(desktop, 'notes.txt'), 'notes');
  const usb = path.join(box, 'KINGSTON');
  const williams = path.join(usb, 'Flippers', 'Williams');
  put(path.join(williams, 'Attack from Mars (Bally 1995) 2.1.vpx'), kb(400), 1);
  put(path.join(williams, 'Attack from Mars.directb2s'), kb(360), 1);
  put(path.join(williams, 'afm_113b.zip'), kb(110), 400);
  put(path.join(williams, 'Lisez-moi.txt'), 'txt', 400);
  put(path.join(williams, 'Medieval Madness', 'mm.vpx'), kb(10));
  put(path.join(usb, 'Photos', 'vacances.jpg'), kb(10));
  process.env.CYBERPINBALL_LECTEURS = JSON.stringify([
    { letter: 'E:', name: 'KINGSTON', type: 'usb', free: 12 * 1024 ** 3, path: usb },
    { letter: 'D:', name: 'Données', type: 'fixed', free: 420 * 1024 ** 3, path: path.join(box, 'D') },
  ]);
  fs.mkdirSync(path.join(box, 'D'), { recursive: true });
  return { root, L, windows, desktop, usb, williams, files };
}

async function scenario(sc, box, report) {
  const { root, L } = box;
  core.setLanguage(sc.lang);
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  for (const tb of tables) rememberScript(tb.file, { usesPinmame: true, roms: ['mm_109c'] }, L.data);
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
    downloadsDir: () => box.windows,
    desktopDir: () => box.desktop,
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
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: String(sc.rotation), zones: '[]' } });
  await ready;

  const name = `${sc.name}-${sc.lang}`;
  const dir = path.join(CAPTURES, name);
  fs.mkdirSync(dir, { recursive: true });
  const log = [];
  let step = 0;
  const view = () => library.view();
  async function settle() {
    for (let i = 0; i < 100 && view()?.busy; i++) await delay(100);
    await delay(150);
  }
  async function shot(label) {
    await settle();
    send();
    await delay(350);
    const file = `${String(step++).padStart(2, '0')}-${label}`;
    await report.check(win.webContents, `${name}/${file}`);
    fs.writeFileSync(path.join(dir, `${file}.png`), (await win.capturePage()).toPNG());
    const seen = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.lib-row.selected, .lib-action.current');
      if (!el) return 'aucun';
      const r = el.getBoundingClientRect();
      let box = el.parentElement;
      while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
      const b = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1 ? 'visible' : 'ROGNÉ';
    })()`);
    const v = view();
    log.push(`${name}/${file} : ${v?.heading} | ${v?.subheading ?? ''} | choisi ${seen} : ${v?.actions[v.cursor]?.label ?? '-'}`);
  }
  const T = (fr) => core.t(fr);
  const act = async (label) => {
    await settle();
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
    await settle();
  };
  const key = async (code, n = 1) => {
    for (let i = 0; i < n; i++) library.handleKey({ type: 'keyDown', code, key: '', shift: false, control: false, alt: false, meta: false });
    await settle();
  };
  const expect = (cond, what) => {
    if (!cond) throw new Error(`${name} : ${what}`);
  };

  // 1. Écran « Téléchargements » depuis le menu système.
  library.openSystem();
  await act(T('Téléchargements'));
  await shot('telechargements');
  expect(view().sections.flatMap((s) => s.rows).some((r) => r.text === 'mm_109c.zip' && r.note?.tone === 'warning' && r.note.sign === '!'), 'la ROM reçue n’est pas « À installer »');
  await key(KEYS.next[0], 2);
  await shot('telechargements-curseur');
  await act('Attack from Mars');
  await shot('detail-fichier');
  await key(KEYS.exit[0]);
  await act(T('Afficher Téléchargements de Windows'));
  await shot('avec-windows');
  library.handleAction({ type: 'activate', index: view().actions.findIndex((a) => a.icon === 'sort') });
  await shot('tri-nom');
  await key(KEYS.exit[0]);

  // 2. Entonnoir > « Reprendre un fichier téléchargé » : le sélecteur sur les téléchargements de Cyber Pinball.
  library.openAdd();
  await shot('entonnoir');
  await act(T('Reprendre un fichier téléchargé'));
  await shot('selecteur-cyberpinball');
  await key(KEYS.confirm[0]);
  await key(KEYS.next[0]);
  await key(KEYS.confirm[0]);
  await shot('selecteur-deux-coches');
  expect(view().subheading.includes(core.tn(2, '{n} fichier choisi', '{n} fichiers choisis')), 'deux fichiers devraient être cochés');
  // La clé USB, un dossier, la remontée par Exit.
  await act('KINGSTON (E:)');
  await shot('selecteur-cle-usb');
  await act('Flippers');
  await act('Williams');
  await shot('selecteur-dossier');
  await act(T('Afficher tous les fichiers'));
  await shot('selecteur-tous-les-fichiers');
  await key(KEYS.exit[0]);
  await shot('selecteur-exit-remonte');
  // Annuler : l'entonnoir revient tel quel.
  await act(T('Annuler'));
  await shot('annule-retour-entonnoir');
  expect(view().heading === T('Ajouter une table'), `l’annulation devrait rendre l’entonnoir (${view().heading})`);
  // Un dossier entier, depuis la clé.
  await act(T('Choisir un dossier…'));
  await act('KINGSTON (E:)');
  await act('Flippers');
  await shot('selecteur-dossier-seul');

  // 3. Médias d'une table > « Choisir un fichier… » : filtré sur le média, un seul choix.
  await act(T('Annuler'));
  library.openSheet(tables[0]);
  await act(T('Médias du jeu'));
  await act(core.mediaTypeInfo('Backglass').label);
  await act(T('Choisir un fichier…'));
  await shot('selecteur-media');
  await act(T('Annuler'));
  await shot('media-revenu');

  // 4. « Tout vider » : confirmation, curseur sur Annuler ; corbeille ; la liste d'attente suit.
  library.openSystem();
  await act(T('Téléchargements'));
  await act(T('Tout vider'));
  await shot('confirmation-vider');
  expect(view().actions[view().cursor].label === T('Annuler'), 'le curseur doit être sur Annuler');
  await act(core.tn(2, 'Mettre le fichier à la corbeille', 'Mettre les {n} fichiers à la corbeille').split(' ')[0]);
  await shot('vide');
  const left = core.downloadInventory({ downloadsDir: L.downloads, dataDir: L.data });
  expect(left.length === 0, `il reste ${left.length} fichier(s) dans la zone`);
  const list = core.loadWaitList(L.data);
  expect(list.items.find((i) => i.id === 'mm:rom').state === 'waiting', 'la ROM devrait redevenir attendue');
  expect(fs.readdirSync(box.windows).length === 3, 'Téléchargements de Windows ne doit pas être vidé');
  log.push(`${name} : zone vide, ROM redevenue attendue, Téléchargements de Windows intact, corbeille : ${fs.readdirSync(L.trash).join(', ')}`);

  ipcMain.removeListener('action', onAction);
  win.destroy();
  return log;
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  ipcMain.on('i18n', (event) => {
    event.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) };
  });
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = [];
  try {
    for (const sc of SCENARIOS) results.push(...(await scenario(sc, sandbox(`${sc.name}-${sc.lang}`), report)));
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  if (results.some((r) => r.includes('ROGNÉ'))) {
    results.push('ÉCHEC : un élément choisi n’est pas entièrement visible (voir ci-dessus).');
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  app.quit();
});
