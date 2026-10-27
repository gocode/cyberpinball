// Démonstration hors écran des parties d'un jeu, sur un bac à sable qui reprend la borne du
// 27/10/2026 : The Matrix installé depuis le .vpx de la fiche 18478 mais rattaché à la
// version 1.0.0, la version 1.0.14 encore « attendue », et le PuP-Pack de la même fiche gardé
// de côté. Au démarrage, la liste d'attente se range seule (rien à corriger) ; « Installer :
// The Matrix » ouvre un plan d'ajout à la table installée (complément, PuP-Pack dans
// pupvideos) ; puis la fiche > « Parties du jeu », le PuP-Pack, « Remplacer depuis
// Téléchargements », « Retirer de la table » ; enfin Téléchargements > le zip > « Ajouter à un
// autre jeu… ». Paysage 1920×1080 et portrait 1080×1920 en français, couché en anglais. Aucune
// fenêtre n'apparaît : lancé par docs\demo-parties-du-jeu.ps1 sur le bureau caché. Captures,
// relevé (resultat.txt) et contrôle de la mise en page dans tmp\demo-parties-du-jeu\captures.
//   .\docs\demo-parties-du-jeu.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { zipStored } = require('./demo-fichiers.cjs');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-parties-du-jeu');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
let servedDirs = () => [];

const FOLDER = 'The Matrix (Original 2023)';
const VPX = 'VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx';
const page = (n, slug) => `https://vpuniverse.com/files/file/${n}-${slug}/`;
const PAGE = 'the-matrix-pup-pack-wtable-vp-cooks-pup-by-enthusiast';
const MATRIX = {
  id: 'OUvOEgWRhf',
  name: 'The Matrix',
  manufacturer: 'Original',
  year: 2023,
  type: 'SS',
  tableFiles: [
    { id: 'Z6TQHOOYU-', tableFormat: 'VPX', authors: ['VP_Cooks', 'JPSalas'], version: '1.0.0', updatedAt: 1679419452027, urls: [{ url: page(13658, 'vp_cooks-the-matrix') }] },
    { id: 'r5a2h31Gz8', tableFormat: 'VPX', authors: ['Enthusiast', 'VP_Cooks', 'JPSalas', 'MerlinRTP'], version: '1.0.14', updatedAt: 1709998917834, urls: [{ url: page(18478, PAGE) }] },
  ],
  pupPackFiles: [{ id: 'pupMatrix', authors: ['Enthusiast'], version: '1.0.14', urls: [{ url: page(18478, PAGE) }] }],
  b2sFiles: [
    { id: 'b2sA', authors: ['Fabouh'], features: ['FullDMD'], updatedAt: 1700000000000, urls: [{ url: page(22480, 'the-matrix-full-dmd') }] },
    { id: 'b2sB', authors: ['HauntFreaks'], features: ['2Screens'], updatedAt: 1690000000000, urls: [{ url: page(14000, 'the-matrix-b2s') }] },
  ],
};
const SCREENS = [
  { name: 'paysage', width: 1920, height: 1080, rotation: 0, lang: 'fr' },
  { name: 'portrait', width: 1080, height: 1920, rotation: 0, lang: 'fr' },
  { name: 'couche', width: 1920, height: 1080, rotation: 90, lang: 'en' },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}
function put(file, data = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

function sandbox(name) {
  const box = path.join(BASE, name);
  const root = path.join(box, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  const folder = path.join(L.tables, FOLDER);
  const table = put(path.join(folder, VPX), 'x'.repeat(4096));
  const source = { origin: 'VPS', vpsGameId: MATRIX.id, vpsFileId: 'Z6TQHOOYU-', version: '1.0.0', authors: ['VP_Cooks', 'JPSalas'], page: page(13658, 'vp_cooks-the-matrix'), installedAt: '2026-10-27T15:35:42.995Z' };
  put(path.join(folder, `${FOLDER}.info`), JSON.stringify({ Info: { Title: 'The Matrix', Manufacturer: 'Original', Year: 2023, VPSId: MATRIX.id }, CyberPinball: { source } }, null, 2));
  // Une autre table, pour réaffecter.
  put(path.join(L.tables, 'Star Trek (Stern 2013)', 'Star Trek LE.vpx'), 'x');
  put(path.join(L.downloads, 'vpsdb.json'), JSON.stringify([MATRIX]));
  put(path.join(L.downloads, 'vpsdb.meta.json'), JSON.stringify({ checkedAt: new Date().toISOString(), downloadedAt: new Date().toISOString() }));
  const acq = path.join(L.downloads, 'acquisition');
  const zip = put(
    path.join(acq, 'TheMatrixPupPackv1.0.14.zip'),
    zipStored({ 'TheMatrix/screens.pup': 'ScreenNum,ScreenDes\r\n0,Topper\r\n', 'TheMatrix/playlists.pup': 'x', 'TheMatrix/BackGlass/intro.mp4': 'x'.repeat(2048), 'TheMatrix/3 Screen - FullDMD.bat': '@echo off' }),
  );
  const vpxCopy = path.join(acq, VPX);
  const at = '2026-10-27T15:30:02.204Z';
  core.saveWaitList(L.data, {
    items: [
      { id: `${MATRIX.id}:Z6TQHOOYU-`, gameId: MATRIX.id, gameLabel: 'The Matrix (Original 2023)', kind: 'table', fileId: 'Z6TQHOOYU-', label: 'VP_Cooks, JPSalas 1.0.0', version: '1.0.0', authors: ['VP_Cooks', 'JPSalas'], page: page(13658, 'vp_cooks-the-matrix'), pageKey: 'vpu:13658', addedAt: '2026-10-27T15:27:29.721Z', state: 'installed', received: { file: vpxCopy, at, via: 'window', url: `${page(18478, PAGE)}?do=download&r=187406&confirm=1`, content: 'table' } },
      { id: `${MATRIX.id}:r5a2h31Gz8`, gameId: MATRIX.id, gameLabel: 'The Matrix (Original 2023)', kind: 'table', fileId: 'r5a2h31Gz8', label: 'Enthusiast, VP_Cooks, JPSalas… 1.0.14', version: '1.0.14', authors: MATRIX.tableFiles[1].authors, updatedAt: 1709998917834, page: page(18478, PAGE), pageKey: 'vpu:18478', addedAt: '2026-10-27T15:28:18.831Z', state: 'waiting' },
    ],
    noticeAcceptedAt: '2026-10-22T16:11:46.151Z',
    strays: [{ file: zip, via: 'window', url: `${page(18478, PAGE)}?do=download&r=187407&confirm=1`, content: 'pup', summary: '2 fichiers .pup, 1 vidéo, aucun .vpx', at: '2026-10-27T15:33:17.716Z' }],
  });
  return { root, L, table, zip, folder };
}

async function scenario(sc, box, report, log) {
  const { root, L } = box;
  core.setLanguage(sc.lang);
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  for (const tb of tables) rememberScript(tb.file, { usesPinmame: false, roms: [] }, L.data);
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
    downloadsDir: () => path.join(box.L.downloads, '..', 'Windows Downloads'),
    guest: { active: false, allows: () => true, knock: () => true },
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
  let step = 0;
  const view = () => library.view();
  async function settle() {
    for (let i = 0; i < 200 && view()?.busy; i++) await delay(100);
    await delay(200);
  }
  async function shot(label) {
    await settle();
    send();
    await delay(350);
    const file = `${String(step++).padStart(2, '0')}-${label}`;
    await report.check(win.webContents, `${name}/${file}`);
    fs.writeFileSync(path.join(dir, `${file}.png`), (await win.capturePage()).toPNG());
    const v = view();
    const rows = (v?.sections ?? []).flatMap((s) => s.rows.map((r) => `${r.text}${r.badges?.length ? ` [${r.badges.join(', ')}]` : ''}${r.detail ? ` — ${r.detail}` : ''}`));
    log.push(`${name}/${file} : ${v?.heading} | ${v?.subheading ?? ''} | curseur : ${v?.actions[v.cursor]?.label ?? '-'}\n    ${rows.join('\n    ')}\n    actions : ${(v?.actions ?? []).map((a) => a.label).join(' | ')}`);
  }
  const T = (fr, params) => core.t(fr, params);
  const act = async (label) => {
    await settle();
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
    await settle();
  };
  const expect = (cond, what) => {
    if (!cond) throw new Error(`${name} : ${what}`);
  };
  const rowsText = () => (view()?.sections ?? []).flatMap((s) => s.rows.map((r) => `${r.text} ${r.detail ?? ''} ${(r.badges ?? []).join(' ')}`)).join('\n');

  // 1. La liste d'attente s'est rangée seule au démarrage : rien à corriger, rien de côté.
  await delay(500);
  library.openAdd();
  await act(T('Récupérés et attendus'));
  await shot('recuperes-et-attendus');
  const list = core.loadWaitList(L.data);
  expect(!list.strays?.length, 'le PuP-Pack ne devrait plus être de côté');
  expect(list.items.find((i) => i.fileId === 'r5a2h31Gz8')?.state === 'installed', 'la 1.0.14 devrait être installée');
  expect(list.items.some((i) => i.kind === 'pup' && i.state === 'received'), 'le PuP-Pack devrait être reçu, à installer');
  expect(!rowsText().includes(T('À corriger')), 'rien ne devrait être à corriger');
  const info = JSON.parse(fs.readFileSync(path.join(box.folder, `${FOLDER}.info`), 'utf8'));
  expect(info.CyberPinball.source.vpsFileId === 'r5a2h31Gz8' && info.CyberPinball.source.version === '1.0.14', 'la provenance de la table devrait être la 1.0.14');

  // 2. Téléchargements > le zip : le jeu probable, puis n'importe quel jeu.
  library.openSystem();
  await act(T('Tables'));
  await act(T('Téléchargements'));
  await shot('telechargements');
  await act('TheMatrixPupPackv1.0.14.zip');
  await shot('telechargement-fichier');
  await act(T('Ajouter à un autre jeu…'));
  await shot('ajouter-a-un-jeu');
  library.openAdd();
  await act(T('Récupérés et attendus'));

  // 3. Installer : un plan d'ajout à la table installée, le PuP-Pack dans son pupvideos.
  await act(T('Installer : {game}', { game: 'The Matrix (Original 2023)' }));
  await shot('plan-pup-pack');
  expect(view().sections.some((s) => s.title === T('Complément pour : {folder}', { folder: FOLDER })), 'le plan devrait compléter la table installée');
  await act(T('Installer'));
  await shot('apres-installation');
  expect(fs.existsSync(path.join(box.folder, 'pupvideos', 'TheMatrix', 'screens.pup')), 'le PuP-Pack devrait être dans pupvideos');

  // 4. Fiche > Parties du jeu > PuP-Pack.
  tables = core.scanTables(L.tables);
  const matrix = tables.find((x) => x.title === 'The Matrix');
  library.openSheet(matrix);
  await shot('fiche');
  await act(T('Parties du jeu'));
  await shot('parties-du-jeu');
  await act('PuP-Pack');
  await shot('partie-pup-pack');
  await act(T('{verb} depuis Téléchargements', { verb: T('Remplacer') }));
  await shot('remplacer-depuis-telechargements');
  library.handleKey({ type: 'keyDown', code: KEYS.exit[0], key: '', shift: false, control: false, alt: false, meta: false });
  await settle();
  await act(T('Retirer de la table'));
  await shot('retirer-confirmation');
  expect(view().actions[view().cursor].label === T('Annuler'), 'le curseur doit être sur Annuler');
  await act(T('Retirer de la table'));
  await shot('retire');
  expect(!fs.existsSync(path.join(box.folder, 'pupvideos', 'TheMatrix')), 'le PuP-Pack devrait être à la corbeille');
  // Le fronton : absent, deux fichiers sur VPS.
  await act(T('Fronton (.directb2s)'));
  await shot('partie-fronton-absent');
  await act(T('Récupérer sur le web'));
  await shot('fronton-au-choix');

  ipcMain.removeListener('action', onAction);
  win.destroy();
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
    for (const sc of SCREENS) await scenario(sc, sandbox(`${sc.name}-${sc.lang}`), report, results);
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  app.quit();
});
