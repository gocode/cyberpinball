// Médaillons vivants de la roue (13/11/2026), dans un vrai Chromium hors écran : la vraie page du menu
// (frontend.html, sa politique de sécurité, ses scripts et ses feuilles), une roue avec le Juke-box et
// la Communauté. Ce que Chromium dessine vraiment : chaque médaillon a son intérieur dans un canevas,
// posé dans le trou de l'anneau chromé (img.wheel-img, sur lequel se calent le halo et le cercle de la
// roue) ; seul le médaillon du centre s'anime, ses voisins restent sur leur première image.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { APP, menuState } from './menu-renderer';

const REPO = path.join(APP, '..');

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;

const BENCH = String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_DIR;
app.whenReady().then(async () => {
  // Jamais montrée : rendu hors écran.
  const win = new BrowserWindow({
    show: false, frame: false, skipTaskbar: true, focusable: false, width: 1080, height: 1920, useContentSize: true, enableLargerThanScreen: true,
    webPreferences: { offscreen: true, preload: path.join(dir, 'preload.cjs'), contextIsolation: false, sandbox: false },
  });
  win.setBounds({ x: 0, y: 0, width: 1080, height: 1920 });
  win.webContents.setFrameRate(30);
  const console = [];
  win.webContents.on('console-message', (event) => console.push(event.message));
  await win.loadFile(process.env.CP_PAGE, { query: { role: 'playfield' } });
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'etat.json'), 'utf8'));
  await win.webContents.executeJavaScript('window.__send(' + JSON.stringify(state) + ')');
  // Empreinte de chaque canevas (somme pondérée de ses pixels), sa place et celle de son anneau.
  const look = () => win.webContents.executeJavaScript(${'`'}[...document.querySelectorAll('.wheel-item')].filter((n) => n.querySelector('canvas.wheel-vivant')).map((n) => {
    const cv = n.querySelector('canvas.wheel-vivant');
    const ring = n.querySelector('img.wheel-img');
    const data = cv.width ? cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data : [];
    let print = 0, lit = 0;
    for (let i = 0; i < data.length; i += 4 * 97) { print = (print * 31 + data[i] + 7 * data[i + 1] + 13 * data[i + 2]) % 1000000007; if (data[i + 3] > 0) lit++; }
    const a = cv.getBoundingClientRect(), b = ring.getBoundingClientRect();
    return {
      kind: n.classList.contains('jukebox') ? 'juke-box' : n.classList.contains('community') ? 'communaute' : '?',
      center: n.classList.contains('center'),
      ring: decodeURIComponent(ring.getAttribute('src')).replace(/^.*\\//, ''),
      print, lit,
      ratio: b.width ? a.width / b.width : 0,
      offset: b.width ? Math.hypot(a.left + a.width / 2 - (b.left + b.width / 2), a.top + a.height / 2 - (b.top + b.height / 2)) / b.width : 1,
      ringOnTop: getComputedStyle(cv).gridArea === getComputedStyle(ring).gridArea && cv.compareDocumentPosition(ring) === Node.DOCUMENT_POSITION_FOLLOWING,
    };
  })${'`'});
  await new Promise((r) => setTimeout(r, 1500));
  const first = await look();
  await new Promise((r) => setTimeout(r, 900));
  const second = await look();
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify({ first, second, console }));
  app.exit(0);
});
`;

// Le pont du préchargement (preload.ts), réduit à ce que la page du menu appelle.
const PRELOAD = String.raw`
window.cyberI18n = {};
window.cyber = {
  onState: (f) => { window.__send = f; },
  ready() {}, act() {}, mediaError() {}, jukebox() {}, onDmd() {}, onJukeboxPulse() {}, onJukeboxTime() {}, pathOf: () => '',
};
`;

interface Look {
  kind: string;
  center: boolean;
  ring: string;
  print: number;
  lit: number;
  ratio: number;
  offset: number;
  ringOnTop: boolean;
}

/** Une roue : le Juke-box à gauche, la Communauté au centre, une table à droite ; puis l'inverse. */
function wheelState(center: 'juke-box' | 'communaute') {
  const state = menuState({ 'A.vpx': undefined, 'B.vpx': undefined, 'C.vpx': undefined });
  const jukebox = { key: '__jukebox', title: 'Juke-box', jukebox: true };
  const community = { key: '__communaute', title: 'Communauté', community: true };
  const [left, middle] = center === 'communaute' ? [jukebox, community] : [community, jukebox];
  state.neighbors = [
    { offset: -1, ...left },
    { offset: 0, ...middle },
    { offset: 1, key: 'C.vpx', title: 'C.vpx', wheel: undefined },
  ] as unknown as typeof state.neighbors;
  return state;
}

for (const center of ['communaute', 'juke-box'] as const) {
  test(`roue, vrai Chromium : médaillons vivants, ${center} au centre s'anime, son voisin reste sur sa première image`, { skip: electron ? false : 'Electron sous Windows requis', timeout: 120_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-medaillons-'));
    try {
      fs.writeFileSync(path.join(dir, 'etat.json'), JSON.stringify(wheelState(center)));
      fs.writeFileSync(path.join(dir, 'preload.cjs'), PRELOAD);
      const script = path.join(dir, 'banc.cjs');
      fs.writeFileSync(script, BENCH);
      const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_PAGE: path.join(APP, 'renderer', 'frontend.html') };
      delete env.ELECTRON_RUN_AS_NODE;
      const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 110_000 });
      assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
      const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as { first: Look[]; second: Look[]; console: string[] };
      assert.deepEqual(out.console.filter((m) => /Content Security Policy|Uncaught|TypeError|ReferenceError/.test(m)), [], 'aucune erreur ni refus de la page');
      assert.equal(out.first.length, 2, `deux médaillons vivants dans la roue : ${JSON.stringify(out.first)}`);
      for (const m of out.first) {
        assert.equal(m.ring, 'contour-512.webp', `${m.kind} : l'anneau chromé commun en image (halo et cercle s'y calent)`);
        assert.ok(m.ringOnTop, `${m.kind} : l'anneau couvre le canevas`);
        assert.ok(Math.abs(m.ratio - 0.8065) < 0.01, `${m.kind} : le canevas remplit le trou de l'anneau (80,65 %), mesuré ${m.ratio}`);
        assert.ok(m.offset < 0.01, `${m.kind} : canevas centré dans l'anneau (écart ${m.offset})`);
        assert.ok(m.lit > 100, `${m.kind} : l'intérieur est dessiné, même hors du centre`);
      }
      const at = (list: Look[], c: boolean) => list.find((m) => m.center === c)!;
      assert.equal(at(out.first, true).kind, center);
      assert.notEqual(at(out.first, true).print, at(out.second, true).print, 'le médaillon du centre s’anime');
      assert.equal(at(out.first, false).print, at(out.second, false).print, 'le voisin reste sur sa première image');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('médaillons vivants : le module est chargé par la page du menu avant la roue et le Juke-box, et les images fixes en viennent', () => {
  const html = fs.readFileSync(path.join(APP, 'renderer', 'frontend.html'), 'utf8');
  const at = (name: string) => html.indexOf(`<script src="${name}"></script>`);
  assert.ok(at('medaillons-vivants.js') > 0 && at('medaillons-vivants.js') < at('jukebox.js') && at('jukebox.js') < at('frontend.js'));
  const generator = fs.readFileSync(path.join(REPO, 'docs', 'design-system', 'src', 'medaillons.cjs'), 'utf8');
  assert.match(generator, /CyberMedaillons\.paint\(m\.name/, 'PNG et WebP : la première image du médaillon vivant');
  const mod = fs.readFileSync(path.join(APP, 'renderer', 'medaillons-vivants.js'), 'utf8');
  // Pas de drapeaux parmi les emojis : Windows les affiche en deux lettres.
  assert.doesNotMatch(mod, /[\u{1F1E6}-\u{1F1FF}]/u);
  // Mesures dans le repère de la page : le plateau de la borne est tourné, et getBoundingClientRect
  // (repère de l'écran) y plaçait les fils de l'en-tête du Juke-box à plat, au mauvais endroit.
  assert.doesNotMatch(mod, /\.getBoundingClientRect\(/,'positions des fils mesurées par offsetTop, pas en coordonnées d’écran');
});
