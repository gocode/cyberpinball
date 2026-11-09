import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { CURSOR_IDLE_MS, CURSOR_POLL_MS, HIDDEN_CURSOR_ATTRIBUTE, HIDDEN_CURSOR_CSS, idleCursorStart, idleCursorStep } from '../idlecursor';
import { runElectron } from './electron-run';

// Pointeur de la souris masqué quand on ne s'en sert plus, sur toutes les pages de l'application.
const REPO = path.join(__dirname, '..', '..', '..', '..');
const SOURCES = path.join(REPO, 'app', 'src');

test('pointeur inactif : visible au démarrage, masqué après le délai sans mouvement', () => {
  let s = idleCursorStart(0);
  assert.equal(s.hidden, false);
  s = idleCursorStep(s, { x: 10, y: 20 }, 100);
  assert.equal(s.hidden, false, 'le premier relevé n’est pas un mouvement, le délai court depuis le démarrage');
  s = idleCursorStep(s, { x: 10, y: 20 }, CURSOR_IDLE_MS - 1);
  assert.equal(s.hidden, false);
  s = idleCursorStep(s, { x: 10, y: 20 }, CURSOR_IDLE_MS);
  assert.equal(s.hidden, true);
  s = idleCursorStep(s, { x: 10, y: 20 }, CURSOR_IDLE_MS * 10);
  assert.equal(s.hidden, true, 'immobile, il reste masqué');
});

test('pointeur inactif : il revient au premier mouvement, et se masque de nouveau après le délai', () => {
  let s = idleCursorStep(idleCursorStart(0), { x: 0, y: 0 }, CURSOR_IDLE_MS);
  assert.equal(s.hidden, true);
  s = idleCursorStep(s, { x: 1, y: 0 }, 5000);
  assert.deepEqual([s.hidden, s.movedAt], [false, 5000]);
  s = idleCursorStep(s, { x: 1, y: 0 }, 5000 + CURSOR_IDLE_MS - 1);
  assert.equal(s.hidden, false);
  s = idleCursorStep(s, { x: 1, y: 1 }, 5000 + CURSOR_IDLE_MS);
  assert.equal(s.hidden, false, 'un mouvement relance le délai');
  s = idleCursorStep(s, { x: 1, y: 1 }, 5000 + 2 * CURSOR_IDLE_MS);
  assert.equal(s.hidden, true);
});

test('pointeur inactif : relevé assez fréquent pour qu’il revienne sans retard sensible', () => {
  assert.ok(CURSOR_POLL_MS <= 100, `${CURSOR_POLL_MS} ms`);
  assert.ok(CURSOR_IDLE_MS >= 2000 && CURSOR_IDLE_MS <= 5000, `${CURSOR_IDLE_MS} ms`);
});

test('pointeur inactif : la feuille l’emporte sur les pointeurs des pages, l’attribut seul la fait jouer', () => {
  // Origine utilisateur et !important : au-dessus de cursor: pointer, move, nwse-resize des pages.
  assert.match(HIDDEN_CURSOR_CSS, /cursor: none !important/);
  const selectors = HIDDEN_CURSOR_CSS.split('{')[0]!.split(',').map((s) => s.trim());
  for (const tail of ['', ' *', ' *::before', ' *::after']) assert.ok(selectors.includes(`html[${HIDDEN_CURSOR_ATTRIBUTE}]${tail}`), tail);
  const module = fs.readFileSync(path.join(SOURCES, 'idle-cursor.ts'), 'utf8');
  assert.match(module, /insertCSS\(HIDDEN_CURSOR_CSS, \{ cssOrigin: 'user' \}\)/);
  // Electron 44 ne retire pas une feuille insérée : le pointeur ne revenait plus (08/11/2026).
  assert.doesNotMatch(module, /removeInsertedCSS/, 'la feuille reste ; seul l’attribut bascule');
});

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

/**
 * Dans un vrai Electron, fenêtre rendue en mémoire (jamais montrée) : la page garde ses pointeurs,
 * les perd une fois l'attribut posé, les retrouve quand il est retiré, et une page rechargée
 * pendant le masquage est de nouveau masquée. Même feuille, même monde isolé et même script que
 * app/src/idle-cursor.ts.
 */
test('pointeur inactif : masqué puis rendu dans un vrai Electron, page rechargée comprise', { timeout: 90_000 }, (t) => {
  const electron = process.platform === 'win32' ? electronPath() : undefined;
  if (!electron) return t.skip('Electron sous Windows requis');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pointeur-'));
  try {
    const core = path.join(__dirname, '..', 'idlecursor.js');
    const main = path.join(dir, 'main.js');
    const report = path.join(dir, 'rapport.json');
    fs.writeFileSync(
      main,
      `const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const c = require(${JSON.stringify(core)});
app.whenReady().then(async () => {
  const seen = {};
  try {
    const win = new BrowserWindow({ show: false, skipTaskbar: true, focusable: false, webPreferences: { offscreen: true } });
    const wc = win.webContents;
    const page = 'data:text/html,' + encodeURIComponent('<html><head><style>body{cursor:pointer}#p{cursor:move}</style></head><body><p id="p">x</p></body></html>');
    const read = () => wc.executeJavaScript('[getComputedStyle(document.body).cursor, getComputedStyle(document.getElementById("p")).cursor].join("/")');
    const mark = (hidden) => wc.executeJavaScriptInIsolatedWorld(c.HIDDEN_CURSOR_WORLD, [{ code: c.hiddenCursorScript(hidden) }]);
    await win.loadURL(page);
    await wc.insertCSS(c.HIDDEN_CURSOR_CSS, { cssOrigin: 'user' });
    seen.loaded = await read();
    await mark(true);
    seen.hidden = await read();
    await mark(false);
    seen.shown = await read();
    await mark(true);
    seen.hiddenAgain = await read();
    await win.loadURL(page);
    await wc.insertCSS(c.HIDDEN_CURSOR_CSS, { cssOrigin: 'user' });
    await mark(true);
    seen.reloaded = await read();
    await mark(false);
    seen.reloadedShown = await read();
  } catch (e) {
    seen.error = String(e && e.stack || e);
  }
  fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify(seen));
  app.exit(0);
});
`,
    );
    const run = runElectron(electron, [main, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, timeout: 60_000 });
    assert.equal(run.status, 0, run.stderr);
    const seen = JSON.parse(fs.readFileSync(report, 'utf8')) as Record<string, string>;
    assert.deepEqual(seen, {
      loaded: 'pointer/move',
      hidden: 'none/none',
      shown: 'pointer/move',
      hiddenAgain: 'none/none',
      reloaded: 'none/none',
      reloadedShown: 'pointer/move',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pointeur inactif : toutes les pages, présentes et à venir, quel que soit le mode de lancement', () => {
  const module = fs.readFileSync(path.join(SOURCES, 'idle-cursor.ts'), 'utf8');
  // Toutes les pages (fenêtres et vues web), et toute page chargée pendant qu'il est masqué.
  assert.match(module, /for \(const contents of webContents\.getAllWebContents\(\)\) mark\(contents, state\.hidden\)/);
  assert.match(module, /on\('dom-ready', \(\) => void dress\(contents\)\)/);
  assert.match(module, /app\.on\('web-contents-created'/);
  assert.match(module, /insertCSS[\s\S]*?if \(state\?\.hidden\) mark\(contents, true\)/);
  // Démarré avant le menu, l'assistant et les réglages seuls.
  const main = fs.readFileSync(path.join(SOURCES, 'main.ts'), 'utf8');
  const start = main.indexOf('startIdleCursor();');
  assert.ok(start > 0, 'main.ts démarre startIdleCursor()');
  for (const mode of ['startSettingsAlone(', 'startWizard()', 'startFrontend()']) assert.ok(main.indexOf(mode, main.indexOf('app.whenReady')) > start, mode);
});
