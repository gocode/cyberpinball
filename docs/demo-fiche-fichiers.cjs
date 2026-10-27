// Démonstration hors écran de la fiche d'une table et de sa section « Fichiers » : une table
// à peu de fichiers, une autre à beaucoup (plus de 40, noms longs, ROM liées à la
// bibliothèque, fronton mal nommé, rapport de plantage), sur trois écrans — paysage
// 1920×1080, le même couché (playfield d'une borne, menu tourné d'un quart de tour) et
// portrait 1080×1920 — en français et en anglais. Aucune fenêtre n'apparaît (rendu hors
// écran), lancé par docs\demo-fiche-fichiers.ps1 sur le bureau caché. Captures, relevé
// (resultat.txt) et contrôle de la mise en page (chevauchements, textes rognés) dans
// tmp\demo-fiche-fichiers\captures.
//   npm run build
//   .\docs\demo-fiche-fichiers.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-fiche-fichiers');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
let servedDirs = () => [];

const T2 = 'Terminator 2 - Judgment Day (Williams 1991)';
const T2_VPX = 'Terminator 2 - Judgment Day (Williams 1991) VPW 2.1 nFozzy Fleep';
const PETITE = 'Fireball (Bally 1972)';

const SCREENS = [
  { name: 'paysage', width: 1920, height: 1080, rotation: 0 },
  { name: 'couche', width: 1920, height: 1080, rotation: 90 },
  { name: 'portrait', width: 1080, height: 1920, rotation: 0 },
];
const SCENARIOS = [...SCREENS.map((s) => ({ ...s, lang: 'fr' })), ...SCREENS.filter((s) => s.name !== 'paysage').map((s) => ({ ...s, lang: 'en' }))];

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
  // Beaucoup de fichiers : trois versions, deux frontons, six ROM (dont deux liées à la
  // bibliothèque), sauvegardes, PuP-Pack, couleurs, sons, 31 musiques aux noms longs, médias.
  const t2 = path.join(L.tables, T2);
  const big = 'x'.repeat(4096);
  put(path.join(t2, `${T2_VPX}.vpx`), big.repeat(64));
  put(path.join(t2, `${T2} VPW 2.0.vpx`), big.repeat(60));
  put(path.join(t2, `${T2} g5k 1.25 mod nFozzy Fleep VR room avec un nom vraiment très long pour voir.vpx`), big.repeat(50));
  put(path.join(t2, `${T2_VPX}.directb2s`), big.repeat(8));
  put(path.join(t2, 'T2 3screens fullDMD by HauntFreaks.directb2s'), big.repeat(9));
  put(path.join(t2, `${T2_VPX}.ini`), '[Player]');
  put(path.join(t2, `${T2_VPX}.vbs`), "' script");
  put(path.join(t2, 'crash.txt'), 'plantage');
  put(path.join(t2, 'Lisez-moi.txt'), 'notes');
  put(path.join(t2, `${T2}.info`), JSON.stringify({ Info: { Title: 'Terminator 2 - Judgment Day', Manufacturer: 'Williams', Year: 1991 }, User: { StartCount: 12, LastRun: '2026-10-24T21:14:00', RunTime: 11100 } }, null, 2));
  for (const rom of ['t2_l8', 't2_l6']) {
    put(path.join(L.roms, `${rom}.zip`), `rom ${rom}`);
    fs.mkdirSync(path.join(t2, 'pinmame', 'roms'), { recursive: true });
    fs.linkSync(path.join(L.roms, `${rom}.zip`), path.join(t2, 'pinmame', 'roms', `${rom}.zip`));
  }
  for (const rom of ['t2_l4', 't2_l3', 't2_p2f', 't2_l82']) put(path.join(t2, 'pinmame', 'roms', `${rom}.zip`), `rom ${rom}`);
  put(path.join(L.roms, 't2_l3.zip'), 'rom t2_l3');
  put(path.join(t2, 'pinmame', 'nvram', 't2_l8.nv'), 'nv');
  put(path.join(t2, 'pinmame', 'cfg', 't2_l8.cfg'), 'cfg');
  put(path.join(t2, 'pupvideos', 't2', 'screens.pup'), 'pup');
  for (let i = 1; i <= 12; i++) put(path.join(t2, 'pupvideos', 't2', 'Backglass', `clip ${i}.mp4`), big);
  put(path.join(t2, 'serum', 't2_l8', 't2_l8.cRZ'), big);
  put(path.join(t2, 'altsound', 't2_l8', 'altsound.csv'), 'csv');
  for (let i = 1; i <= 31; i++) put(path.join(t2, 'music', `${String(i).padStart(2, '0')} - Hasta la vista, baby (version remasterisée longue pour l’attente).mp3`), big);
  put(path.join(t2, 'medias', 'Wheel.png'), 'png');
  put(path.join(t2, 'medias', 'Backglass.mp4'), 'mp4');
  // Peu de fichiers : la table et son fronton, dans son dossier.
  const fb = path.join(L.tables, PETITE);
  put(path.join(fb, `${PETITE}.vpx`), big.repeat(10));
  put(path.join(fb, `${PETITE}.directb2s`), big);
  return { root, L };
}

async function scenario(sc, box, report) {
  const { root, L } = box;
  core.setLanguage(sc.lang);
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const t2 = () => tables.find((t) => t.file.includes(T2_VPX));
  // Scripts déjà lus (comme après une première analyse) : ROM demandée, PinMAME.
  rememberScript(t2().file, { usesPinmame: true, roms: ['t2_l8'] }, L.data);
  rememberScript(tables.find((t) => t.title.startsWith('Fireball')).file, { usesPinmame: false, roms: [] }, L.data);
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  const library = createLibrary({
    // Mode invité inactif : tout passe (host.guest est obligatoire, library.ts).
    guest: { active: false, allows: () => true, knock: () => true },
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
  async function shot(label) {
    send();
    await delay(300);
    const file = `${String(step++).padStart(2, '0')}-${label}`;
    await report.check(win.webContents, `${name}/${file}`);
    fs.writeFileSync(path.join(dir, `${file}.png`), (await win.capturePage()).toPNG());
    // Le choisi est-il entièrement visible ? (liste qui défile : il doit y être ramené)
    const seen = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.lib-row.selected, .lib-action.current');
      if (!el) return 'aucun';
      const r = el.getBoundingClientRect();
      let box = el.parentElement;
      while (box && getComputedStyle(box).overflowY !== 'auto') box = box.parentElement;
      const b = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1 ? 'visible' : 'ROGNÉ';
    })()`);
    const v = library.view();
    log.push(`${name}/${file} : ${v.heading} | ${v.subheading ?? ''} | choisi ${seen} : ${v.actions[v.cursor]?.label ?? '-'}`);
  }
  const view = () => library.view();
  const act = (label) => {
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  const key = (code) => library.handleKey({ type: 'keyDown', code, key: '', shift: false, control: false, alt: false, meta: false });
  const T = (fr) => core.t(fr);

  // Beaucoup de fichiers.
  library.openSheet(t2());
  await shot('fiche-beaucoup');
  while (view().actions[view().cursor].label !== T('Supprimer la table')) key(KEYS.next[0]);
  await shot('fiche-curseur-en-bas');
  act(T('Fichiers de la table'));
  await shot('fichiers-debut');
  for (let i = 0; i < 18; i++) key(KEYS.next[0]);
  await shot('fichiers-milieu');
  // Le détail d'une ROM liée à la bibliothèque, à la souris (clic sur sa ligne).
  const rom = view().sections.flatMap((s) => s.rows).find((r) => r.text === 't2_l8.zip');
  library.handleAction({ type: 'activate', index: rom.action });
  await shot('detail-rom');
  act(T('Retour aux fichiers'));
  await shot('retour-aux-fichiers');
  key(KEYS.previous[0]);
  key(KEYS.previous[0]);
  for (let i = 0; i < 60 && view().cursor !== view().actions.length - 1; i++) key(KEYS.next[0]);
  await shot('fichiers-fin');
  // Le nom le plus long, en entier.
  const long = view().sections.flatMap((s) => s.rows).find((r) => r.text.includes('vraiment très long'));
  library.handleAction({ type: 'activate', index: long.action });
  await shot('detail-nom-long');
  key(KEYS.exit[0]);
  key(KEYS.exit[0]);
  await shot('fiche-retour');
  // Peu de fichiers.
  library.openSheet(tables.find((t) => t.title.startsWith('Fireball')));
  await shot('fiche-peu');
  act(T('Fichiers de la table'));
  await shot('fichiers-peu');

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
  if (results.some((r) => r.includes('ROGNÉ'))) {
    results.push('ÉCHEC : un élément choisi n’est pas entièrement visible (voir ci-dessus).');
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  app.quit();
});
