// Démonstration sans opérateur de l'import des médias : captures du plan d'ajout
// d'une archive rangée à la Popper, puis de la reprise d'une installation de
// Popper factice (choix du dossier, plan, copie, bilan). La fenêtre n'est jamais
// montrée (show: false, offscreen: true ; show, focus et consorts neutralisés).
// Bac à sable : tmp\demo-import-medias ; captures : tmp\captures\import-medias.
// Après npm run build : npx electron docs/demo-import-medias.js
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow, dialog } = require('electron');

const W = path.resolve(__dirname, '..');
const T = path.join(W, 'tmp', 'demo-import-medias');
const core = require(path.join(W, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(W, 'app', 'dist', 'library.js'));

const write = (f, c = 'x') => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, c);
};

function sandbox() {
  fs.rmSync(T, { recursive: true, force: true });
  const root = path.join(T, 'root');
  const tables = path.join(root, 'tables');
  const afm = 'Attack from Mars (Bally 1995)';
  const mm = 'Medieval Madness (Williams 1997)';
  write(path.join(tables, afm, 'AFM_VPW_2.0.vpx'));
  write(path.join(tables, afm, 'medias', `(Wheel) ${afm}.png`), 'ancien');
  write(path.join(tables, mm, `${mm}.vpx`));
  write(path.join(tables, 'Fathom (Bally 1981)', 'Fathom (Bally 1981).vpx'));
  write(path.join(tables, 'Fathom (Bally 1981) LED', 'Fathom LED.vpx'));
  write(path.join(root, 'downloads', 'vpsdb.json'), JSON.stringify([{ id: 'BunvWvh9', name: 'Terminator 2: Judgment Day', manufacturer: 'Williams', year: 1991 }]));
  write(path.join(root, 'downloads', 'vpsdb.meta.json'), JSON.stringify({ checkedAt: new Date().toISOString(), downloadedAt: new Date().toISOString() }));
  for (const d of ['import', 'trash', 'data', 'media']) fs.mkdirSync(path.join(root, d), { recursive: true });

  // Installation de Popper factice.
  const pop = path.join(T, 'vPinball', 'PinUPSystem', 'POPMedia', 'Visual Pinball X');
  for (const [type, ext] of [['Wheel', 'png'], ['Backglass', 'mp4'], ['DMD', 'mp4'], ['Topper', 'mp4'], ['PlayField', 'f4v'], ['Loading', 'mp4'], ['Audio', 'mp3'], ['GameHelp', 'png']]) {
    write(path.join(pop, type, `${mm}.${ext}`), 'x'.repeat(250_000));
  }
  write(path.join(pop, 'GameHelp', `${mm}01.png`), 'x'.repeat(90_000));
  write(path.join(pop, 'Wheel', 'AFM_VPW_2.0.png'), 'x'.repeat(40_000));
  write(path.join(pop, 'Backglass', 'AFM_VPW_2.0.flv'));
  write(path.join(pop, 'Wheel', 'Fathom.png'));
  write(path.join(pop, 'Wheel', 'Funhouse (Williams 1990).png'));
  write(path.join(pop, 'Wheel', 'Twilight Zone (Bally 1993).png'));
  write(path.join(T, 'vPinball', 'PinUPSystem', 'POPMedia', 'Future Pinball', 'Wheel', 'Gorgar.png'));
  write(path.join(T, 'vPinball', 'PinUPSystem', 'PUPVideos', 'afm_113b', 'Backglass', 'intro.mp4'));

  // Archive d'une table avec ses médias rangés à la Popper.
  const t2 = 'Terminator 2 (Williams 1991)';
  const pack = path.join(T, 'pack');
  write(path.join(pack, `${t2}.vpx`));
  write(path.join(pack, `${t2}.directb2s`));
  const pv = path.join(pack, 'POPMedia', 'Visual Pinball X');
  write(path.join(pv, 'Wheel', `${t2}.png`));
  write(path.join(pv, 'Backglass', `${t2}.mp4`));
  write(path.join(pv, 'Menu', `${t2}.mp4`));
  write(path.join(pv, 'PlayField', `${t2}.flv`));
  write(path.join(pv, 'GameHelp', `${t2}.png`));
  write(path.join(pv, 'GameHelp', `${t2}01.png`));
  write(path.join(pack, 'medias', 'bg.png'));
  const zip = path.join(T, 'Terminator2.zip');
  execFileSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, '-C', pack, '.']);
  return { root, zip, pinup: path.join(T, 'vPinball', 'PinUPSystem') };
}

app.setPath('userData', path.join(T + '-profil'));
app.whenReady().then(async () => {
  const { root, zip, pinup } = sandbox();
  const out = path.join(W, 'tmp', 'captures', 'import-medias');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  // Le choix d'un dossier passe par une boîte de dialogue : remplacée, rien ne s'ouvre.
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pinup] });
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 2200,
    webPreferences: { offscreen: true, preload: path.join(W, 'app', 'dist', 'preload.js'), contextIsolation: true },
  });
  // Rien ne doit apparaître ni prendre le focus : neutralisé sur cette fenêtre.
  for (const m of ['show', 'showInactive', 'focus', 'moveTop', 'setAlwaysOnTop', 'setFullScreen', 'maximize', 'restore']) win[m] = () => undefined;
  const tablesDir = path.join(root, 'tables');
  let library;
  const send = () =>
    win.webContents.send('state', {
      role: 'playfield',
      phase: 'library',
      count: 0,
      position: 0,
      neighbors: [],
      footer: [],
      gameKeys: [],
      menuKeys: [],
      nav: {},
      library: library.view(),
    });
  library = createLibrary({
    root,
    dataDir: path.join(root, 'data'),
    vpxExe: () => undefined,
    tables: () => core.scanTables(tablesDir),
    reload: () => undefined,
    enter: () => undefined,
    leave: () => undefined,
    play: () => undefined,
    quit: () => app.quit(),
    keys: () => ({}),
    windows: () => new Map([['playfield', win]]),
    broadcast: () => !win.isDestroyed() && send(),
  });
  await win.loadFile(path.join(W, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: '0' } });
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const idle = async () => {
    for (let i = 0; i < 600 && library.view()?.busy; i++) await delay(100);
    await delay(400);
  };
  const shot = async (name) => {
    send();
    await delay(500);
    fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(library.view(), null, 2));
    console.log('capture', name, win.isVisible() ? 'VISIBLE !' : 'cachée');
  };

  // 1. Ajout d'une archive dont les médias sont rangés à la Popper.
  library.handleAction({ type: 'drop', paths: [zip] });
  await idle();
  await shot('1-plan-ajout-archive');
  library.leave();

  // 2. Reprise d'une installation de Popper.
  library.systemItems.find((i) => i.label.startsWith('Reprendre les médias')).run();
  await idle();
  await shot('2-reprise-source');
  const choose = library.view().actions.findIndex((a) => a.label.startsWith('Choisir un dossier'));
  library.handleAction({ type: 'activate', index: choose });
  await idle();
  await shot('3-reprise-plan');
  library.handleAction({ type: 'activate', index: 0 });
  await idle();
  await shot('4-reprise-faite');
  const listing = [];
  for (const d of fs.readdirSync(tablesDir)) {
    const m = path.join(tablesDir, d, 'medias');
    if (fs.existsSync(m)) listing.push(`${d}: ${fs.readdirSync(m).join(' | ')}`);
  }
  fs.writeFileSync(path.join(out, 'resultat.txt'), listing.join('\n') + '\n\ncorbeille: ' + JSON.stringify(fs.readdirSync(path.join(root, 'trash'), { recursive: true })) + '\n');
  app.quit();
}).catch((e) => {
  console.error(e);
  app.exit(1);
});
