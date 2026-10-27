// Captures sans opérateur des replis intégrés (app/renderer/fallback-demo.html),
// lancées par docs/demo-replis.ps1 : chaque composant, pour chaque jeu d'exemple, à
// chaque taille, dans une fenêtre hors écran de cette taille. Sur chaque rendu, le
// garde-fou de mise en page (app/src/layout-check.ts) cherche les textes qui se
// chevauchent, sortent de la fenêtre ou sont coupés ; les afficheurs à points
// signalent eux-mêmes un texte tronqué. Une planche par composant rassemble les
// captures (une ligne par jeu, une colonne par taille). Enfin, on vérifie que les
// animations s'arrêtent quand la fenêtre est cachée. Aucune fenêtre ne s'affiche :
// tout est rendu hors écran (offscreen), pour laisser le poste libre.
//   npx electron docs/demo-replis.mjs <dossier des captures>

import { app, BrowserWindow, nativeImage } from 'electron';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { checkLayout } = require(path.join(repo, 'app', 'dist', 'layout-check.js'));
const out = path.resolve(process.argv.at(-1)?.endsWith('.mjs') ? path.join(repo, 'tmp', 'captures', 'replis') : process.argv.at(-1));
const page = pathToFileURL(path.join(repo, 'app', 'renderer', 'fallback-demo.html')).href;

const SIZES = {
  '16x9': [1280, 720],
  '4x3': [1024, 768],
  '3x1': [1200, 400],
  '4x1': [1280, 320],
  '9x16': [540, 960],
  '3x4': [720, 960],
  'petit-4x1': [512, 128],
  'petit-16x9': [480, 270],
};
const ALL = Object.keys(SIZES);
// Le dernier jeu d'exemple est « aucun jeu » : la marque (affichage par défaut, defaultMediaView).
const GAMES = [0, 1, 2, 3, 4, 5, 6];

/** Une capture : composant, jeu, taille, variante (paramètres en plus), délai avant la capture. */
const shots = [];
const add = (component, games, sizes, extra = {}, wait = 1200, suffix = '') => {
  for (const game of games) for (const size of sizes) shots.push({ component, game, size, extra, wait, suffix });
};
add('backglass', GAMES, ALL);
add('backglass', [2, 3], ['16x9', '4x1'], { anime: '0' }, 600, '-fige');
add('dmd', GAMES, ALL);
// Pages suivantes de l'afficheur : fabricant et année (ensemble ou l'un après l'autre), marque.
add('dmd', GAMES, ['4x1', 'petit-4x1', '16x9'], { page: '1' }, 1200, '-page2');
add('dmd', [1, 3], ['4x1', 'petit-4x1'], { page: '2' }, 1200, '-page3');
add('dmd', [2, 3, 4], ['4x1'], { anime: '0' }, 600, '-fige');
// Couleur réglée (« Couleur du DMD ») : la marque et un titre dans chaque préréglage (dmdcolor.ts).
for (const couleur of ['8be23a', '36c9b4', 'e6f0ec', '5fb4cf', 'f2b33d', 'ff8a1f']) add('dmd', [1, 6], ['4x1'], { couleur }, 1200, `-couleur-${couleur}`);
add('fulldmd', GAMES, ALL);
add('topper', GAMES, ALL);
for (const style of ['chrome', 'neon', 'arcade']) add('wheel', GAMES, ALL, { style }, 900, `-${style}`);
add('playfield', [1], ALL);
add('loading', GAMES, ALL);
add('loading', [2, 3], ['16x9'], { rotation: '90' }, 1200, '-pivote');
add('ingame', GAMES, ALL);

const lines = [];
const problems = [];

function waitReady(contents, timeout = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      const ready = await contents.executeJavaScript("document.body?.dataset.ready === '1'").catch(() => false);
      if (ready) resolve();
      else if (Date.now() - start > timeout) reject(new Error('page jamais prête'));
      else setTimeout(poll, 50);
    };
    poll();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Seule fabrique de fenêtres du script : rendu hors écran, jamais montrée, ni
 * focalisable, ni dans la barre des tâches. Si elle était visible ou avait le focus,
 * tout s'arrête aussitôt, sans rien capturer.
 */
function hiddenWindow(width, height) {
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    frame: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  if (win.isVisible() || win.isFocused()) {
    win.destroy();
    console.log('Replis : une fenêtre est visible ou a le focus, essai arrêté sans capture.');
    app.exit(2);
  }
  win.webContents.setFrameRate(30);
  return win;
}

async function capture(shot) {
  const [width, height] = SIZES[shot.size];
  const win = hiddenWindow(width, height);
  const query = new URLSearchParams({ composant: shot.component, jeu: String(shot.game), ...shot.extra });
  const name = `${shot.component}${shot.suffix}-jeu${shot.game}-${shot.size}`;
  try {
    await win.loadURL(`${page}?${query}`);
    await waitReady(win.webContents);
    await sleep(shot.wait);
    const found = [...(await checkLayout(win.webContents)), ...(await win.webContents.executeJavaScript('window.demoProblems()'))];
    const image = await win.webContents.capturePage();
    const dir = path.join(out, shot.component + shot.suffix);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.png`);
    fs.writeFileSync(file, image.toPNG());
    for (const p of found) problems.push(`${name} : ${p}`);
    lines.push(`${name}.png : ${found.length ? found.join(' ; ') : 'ok'}`);
    return { ...shot, name, file };
  } catch (error) {
    problems.push(`${name} : ${error.message}`);
    return null;
  } finally {
    win.destroy();
  }
}

/**
 * Planche d'un composant : une ligne par jeu, une colonne par taille (dans l'ordre de
 * SIZES), chaque capture réduite dans sa case, composée pixel par pixel.
 */
function sheet(group, results) {
  const sizes = ALL.filter((s) => results.some((r) => r.size === s));
  const games = [...new Set(results.map((r) => r.game))].sort((a, b) => a - b);
  const cellW = 236;
  const cellH = 150;
  const gap = 8;
  const W = gap + sizes.length * (cellW + gap);
  const H = gap + games.length * (cellH + gap);
  const sheetBuf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) sheetBuf.writeUInt32LE(0xff3d2f2a, i * 4);
  games.forEach((g, row) => {
    sizes.forEach((s, col) => {
      const x0 = gap + col * (cellW + gap);
      const y0 = gap + row * (cellH + gap);
      for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) sheetBuf.writeUInt32LE(0xff1c1411, ((y0 + y) * W + x0 + x) * 4);
      const r = results.find((x) => x.game === g && x.size === s);
      if (!r) return;
      const image = nativeImage.createFromPath(r.file);
      const { width, height } = image.getSize();
      const k = Math.min(cellW / width, cellH / height);
      const small = image.resize({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), quality: 'best' });
      const { width: w, height: h } = small.getSize();
      const bmp = small.toBitmap();
      const ox = x0 + Math.floor((cellW - w) / 2);
      const oy = y0 + Math.floor((cellH - h) / 2);
      for (let y = 0; y < h; y++) bmp.copy(sheetBuf, ((oy + y) * W + ox) * 4, y * w * 4, (y + 1) * w * 4);
    });
  });
  fs.writeFileSync(path.join(out, `planche-${group}.png`), nativeImage.createFromBitmap(sheetBuf, { width: W, height: H }).toPNG());
}

/**
 * Les minuteries s'arrêtent-elles quand la fenêtre est cachée, et repartent-elles
 * ensuite ? Tout reste hors écran : aucune fenêtre ne s'affiche sur le poste. Le
 * masquage est simulé dans la page (document.hidden et visibilitychange), seul signal
 * que lisent les composants.
 */
async function pauseTest() {
  const win = hiddenWindow(512, 128);
  const stats = () => win.webContents.executeJavaScript('CyberFallback.stats()');
  const setHidden = (hidden) =>
    win.webContents.executeJavaScript(
      `Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${hidden} }); document.dispatchEvent(new Event('visibilitychange'));`,
    );
  try {
    await win.loadURL(`${page}?composant=dmd&jeu=2&essai=pause`);
    await waitReady(win.webContents);
    await sleep(1000);
    const shown = await stats();
    await setHidden(true);
    await sleep(300);
    const hidden = await stats();
    await sleep(1500);
    const later = await stats();
    await setHidden(false);
    await sleep(1000);
    const back = await stats();
    const line =
      `pause : visible ${shown.frames} trames, cachée ${hidden.frames} puis ${later.frames} 1,5 s plus tard ` +
      `(minuteries en attente : ${later.scheduled}), revenue ${back.frames}`;
    lines.push(line);
    if (later.frames !== hidden.frames || later.scheduled !== 0) problems.push(`${line} : l'afficheur continue de dessiner fenêtre cachée`);
    if (back.frames <= later.frames) problems.push(`${line} : l'afficheur ne repart pas`);
  } finally {
    win.destroy();
  }
}

// Entre deux phases, aucune fenêtre n'est ouverte : sans ceci, Electron quitterait et
// les chargements suivants échoueraient (ERR_FAILED).
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  const queue = [...shots];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const r = await capture(queue.shift());
      if (r) results.push(r);
    }
  });
  await Promise.all(workers);
  for (const group of [...new Set(results.map((r) => r.component + r.suffix))]) sheet(group, results.filter((r) => r.component + r.suffix === group));
  await pauseTest().catch((error) => problems.push(`pause : ${error.message}`));
  lines.sort();
  fs.writeFileSync(path.join(out, 'releve.txt'), `${lines.join('\n')}\n`, 'utf8');
  const report = problems.length ? problems.sort().join('\n') : 'Aucun problème de mise en page.';
  fs.writeFileSync(path.join(out, 'mise-en-page.txt'), `${report}\n`, 'utf8');
  console.log(`Replis : ${results.length} captures, ${problems.length} problème${problems.length > 1 ? 's' : ''}.`);
  for (const p of problems) console.log(`Mise en page : ${p}`);
  app.exit(problems.length ? 1 : 0);
});
