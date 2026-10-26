// Démonstration hors écran de l'écran « PuP-Pack » d'une fiche (options d'un PuP-Pack), dans
// tous ses états : option du bureau en place et option conseillée pour la borne, liste
// longue parcourue jusqu'en bas, option appliquée (réussite relue sur le disque), échec
// (fichier de l'option introuvable : rien ne change), et choix pas net entre deux options.
// Le pack est le témoin de Guardians of the Galaxy (gotg_2020, packages\core\src\test\
// fixtures.ts), la borne celle du modèle (docs\demo-pup-options.ps1 -Cabinet). Paysage,
// couché (playfield d'une borne), portrait, en français et en anglais. Aucune fenêtre
// n'apparaît (rendu hors écran) ; captures, relevé (resultat.txt) et contrôle de la mise en
// page dans tmp\demo-pup-options\captures.
//   npm run build
//   .\docs\demo-pup-options.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-pup-options');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { gotgPack } = require(path.join(WT, 'packages', 'core', 'dist', 'test', 'fixtures.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
let servedDirs = () => [];

const CABINET = process.env.CYBERPINBALL_MODELE_BORNE || 'D:\\CyberPinball\\data\\cabinet.json';
const GOTG = 'GOTG_2.1.1';
const DOUTE = 'Exemple à deux options (Original 2026)';

const SCREENS = [
  { name: 'paysage', width: 1920, height: 1080, rotation: 0 },
  { name: 'couche', width: 1920, height: 1080, rotation: 90 },
  { name: 'portrait', width: 1080, height: 1920, rotation: 0 },
];
const SCENARIOS = [...SCREENS.map((s) => ({ ...s, lang: 'fr' })), { ...SCREENS[0], lang: 'en' }];

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
  const root = path.join(BASE, name, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  // Borne du modèle, sans ses boutons (comme Copy-ModeleBorne) : fronton, FullDMD 16:9.
  const cabinet = JSON.parse(fs.readFileSync(CABINET, 'utf8').replace(/^\uFEFF/, ''));
  delete cabinet.buttons;
  delete cabinet.navigation;
  for (const c of cabinet.configurations ?? []) {
    delete c.buttons;
    delete c.navigation;
  }
  fs.writeFileSync(path.join(L.data, 'cabinet.json'), JSON.stringify(cabinet, null, 2));
  // GOTG, l'option 0 (bureau) en place : l'option 2 (FullDMD) convient mieux à la borne.
  const gotg = path.join(L.tables, GOTG);
  put(path.join(gotg, `${GOTG}.vpx`), 'vpx');
  put(path.join(gotg, `${GOTG}.info`), JSON.stringify({ Info: { Title: 'Gardiens de la galaxie 2.1.1' } }, null, 2));
  fs.mkdirSync(path.join(gotg, 'pupvideos', 'gotg_2020'), { recursive: true });
  gotgPack(path.join(gotg, 'pupvideos', 'gotg_2020'), 0);
  // Deux options que rien ne départage pour cette borne : à essayer.
  const doute = path.join(L.tables, DOUTE);
  put(path.join(doute, `${DOUTE}.vpx`), 'vpx');
  put(path.join(doute, `${DOUTE}.info`), JSON.stringify({ Info: { Title: 'Exemple à deux options', Year: 2026 } }, null, 2));
  const screens = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos\r\n0,Topper,,,0,ForceON,,\r\n2,Backglass,,,0,ForceBack,,\r\n5,FullDMD,,,0,ForceBack,,\r\n';
  for (const name of ['Option 1 - Cabinet Overlay A', 'Option 2 - Cabinet Overlay B']) {
    put(path.join(doute, 'pupvideos', 'exemple', 'PuP-Pack_Options', name, 'screens.pup'), screens);
    put(path.join(doute, 'pupvideos', 'exemple', 'PuP-Pack_Options', name, 'playlists.pup'), `playlists ${name}`);
  }
  put(path.join(doute, 'pupvideos', 'exemple', 'screens.pup'), screens);
  put(path.join(doute, 'pupvideos', 'exemple', 'playlists.pup'), 'playlists Option 1 - Cabinet Overlay A');
  return { root, L };
}

async function scenario(sc, box, report) {
  const { root, L } = box;
  core.setLanguage(sc.lang);
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const byFolder = (name) => tables.find((t) => path.basename(t.folder) === name);
  // Scripts déjà lus (comme après une première analyse) : VPX n'est jamais lancé.
  rememberScript(byFolder(GOTG).file, { usesPinmame: false, roms: [], pup: { packNames: ['gotg_2020'], playlistAdd: false } }, L.data);
  rememberScript(byFolder(DOUTE).file, { usesPinmame: false, roms: [], pup: { packNames: ['exemple'], playlistAdd: false } }, L.data);
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  const library = createLibrary({
    root,
    dataDir: L.data,
    vpxExe: () => 'C:\\Visual Pinball\\VPinballX64.exe',
    tables: () => tables,
    reload: () => (tables = core.scanTables(L.tables)),
    enter: () => (phase = 'library'),
    leave: () => (phase = 'menu'),
    play: () => {},
    adjustDisplay: async () => ({ ok: true }),
    tableSettings: () => {},
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
  win.webContents.on('console-message', (e) => console.log(`Console : ${e.message}`));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: String(sc.rotation), zones: '[]' } });
  await ready;

  const name = `${sc.name}-${sc.lang}`;
  const dir = path.join(CAPTURES, name);
  fs.mkdirSync(dir, { recursive: true });
  const log = [];
  let step = 0;
  const view = () => library.view();
  async function shot(label) {
    send();
    await delay(300);
    const file = `${String(step++).padStart(2, '0')}-${label}`;
    await report.check(win.webContents, `${name}/${file}`);
    fs.writeFileSync(path.join(dir, `${file}.png`), (await win.capturePage()).toPNG());
    // Le choisi est-il entièrement visible, hors du fondu du bord ? Et la liste, coupée net ou en fondu ?
    const seen = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.lib-row.selected, .lib-action.current');
      const list = document.querySelector('.lib-actions');
      const fade = list ? [list.classList.contains('more-above') ? 'fondu en haut' : '', list.classList.contains('more-below') ? 'fondu en bas' : ''].filter(Boolean).join(', ') : '';
      const cut = list && list.scrollHeight > list.clientHeight + 2 && !fade ? 'COUPÉE NET' : fade || 'tout visible';
      if (!el) return 'aucun choisi · liste ' + cut;
      const r = el.getBoundingClientRect();
      let box = el.parentElement;
      while (box && getComputedStyle(box).overflowY !== 'auto') box = box.parentElement;
      const b = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      const pad = box ? parseFloat(getComputedStyle(box).scrollPaddingTop) || 0 : 0;
      const top = box && box.classList.contains('more-above') ? b.top + pad : b.top;
      const bottom = box && box.classList.contains('more-below') ? b.bottom - pad : b.bottom;
      return (r.top >= top - 1 && r.bottom <= bottom + 1 ? 'choisi visible' : 'choisi ROGNÉ') + ' · liste ' + cut;
    })()`);
    const v = view();
    const rows = v.sections.flatMap((s) => s.rows.map((r) => `${r.text} = ${r.detail ?? ''}`)).join(' / ');
    log.push(`${name}/${file} : ${v.heading} | ${seen} | ${v.actions[v.cursor]?.label ?? '-'}\n    ${v.lead ?? ''}\n    ${rows}`);
  }
  const act = (label) => {
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  const key = (code) => library.handleKey({ type: 'keyDown', code, key: '', shift: false, control: false, alt: false, meta: false });
  const T = (fr) => core.t(fr);

  // Fiche : « PuP-Pack » signale qu'une autre option convient mieux.
  library.openSheet(byFolder(GOTG));
  await shot('fiche');
  act('PuP-Pack');
  await shot('options-bureau-en-place');
  // Liste longue : jusqu'à la dernière option, puis « Retour à la fiche ».
  while (!view().actions[view().cursor].label.startsWith('Option 4')) key(KEYS.next[0]);
  await shot('liste-derniere-option');
  while (view().actions[view().cursor].label !== T('Retour à la fiche')) key(KEYS.next[0]);
  await shot('liste-tout-en-bas');
  // L'option 2 appliquée : relue sur le disque, elle est en place.
  act('Option 2');
  await shot('option-2-appliquee');
  // Un fichier de l'option 3 a disparu du pack : rien n'est touché, le message dit lequel.
  fs.rmSync(path.join(byFolder(GOTG).folder, 'pupvideos', 'gotg_2020', 'PuP-Pack_Options', 'Option 3 - 2 Screen 5x4', 'triggers.pup'));
  act('Option 3');
  await shot('echec-fichier-manquant');
  // Deux options que rien ne départage pour la borne.
  library.openSheet(byFolder(DOUTE));
  act('PuP-Pack');
  await shot('pas-de-choix-net');

  ipcMain.removeListener('action', onAction);
  win.destroy();
  return log;
}

// Entre deux fenêtres hors écran, aucune n'est ouverte : l'application ne doit pas quitter.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  // Langue et catalogue des fenêtres (préchargement), comme language.ts dans l'application.
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
  if (results.some((r) => r.includes('ROGNÉ') || r.includes('COUPÉE NET'))) {
    results.push('ÉCHEC : un élément choisi n’est pas entièrement visible, ou une liste est coupée net (voir ci-dessus).');
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  app.quit();
});
