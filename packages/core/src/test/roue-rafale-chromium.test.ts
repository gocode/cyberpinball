// Roue en rafale, dans un vrai Chromium hors écran (13/11/2026). En faisant défiler vite les
// médaillons, on voyait des médaillons « se dédoubler ». Le halo vert de la table choisie était
// porté par une copie du médaillon, logo compris, posée derrière la roue : à chaque nouvelle table au
// centre, cette copie repartait de la place VISÉE par la table (la fin de son glissement précédent),
// pas de la place où on la voyait ; en rafale, copie et médaillon glissaient décalés, deux logos.
// Invariant vérifié image par image, pendant une rafale d'appuis plus rapide que le glissement :
// un même logo n'est jamais dessiné à deux endroits de la roue.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import * as zlib from 'node:zlib';
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

/** Bloc PNG : longueur, type, données, CRC du type et des données. */
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([head, body, crc]);
}

/** PNG uni de 32 × 32, opaque : un médaillon carré. */
function png(r: number, g: number, b: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(32, 0);
  ihdr.writeUInt32BE(32, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const line = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 32 }, () => [r, g, b, 255]).flat())]);
  const idat = zlib.deflateSync(Buffer.concat(Array.from({ length: 32 }, () => line)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const TABLES = 14;

/** État du menu, la table `at` au centre, neuf places (quatre de chaque côté), en boucle. */
function stateAt(at: number) {
  const wheels: Record<string, string> = {};
  for (let i = 0; i < TABLES; i++) wheels[`T${i}.vpx`] = `cyber-media://medias/T${i}.png`;
  const base = menuState(wheels);
  const neighbors = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((offset) => {
    const i = (((at + offset) % TABLES) + TABLES) % TABLES;
    return { offset, key: `T${i}.vpx`, title: `T${i}`, wheel: `cyber-media://medias/T${i}.png` };
  });
  return { ...base, count: TABLES, position: at + 1, table: { title: `T${at}`, subtitle: '' }, neighbors };
}

// Horloge des glissements tenue par le banc, pas par l'écran : un rendu hors écran ne produit pas ses
// images à un rythme sûr. Après chaque état, toutes les animations de la page (transitions des
// médaillons comprises) sont figées, puis avancées de 10 ms en 10 ms ; à chaque pas, chaque logo
// dessiné (affiché, visible, opacité cumulée sensible) est relevé avec sa boîte : deux dessins d'un
// même logo à plus de 2 px l'un de l'autre = dédoublement.
const SAMPLER = String.raw`
window.__bad = []; window.__steps = 0;
const check = () => {
  const seen = new Map();
  for (const img of document.querySelectorAll('.wheel-items img.wheel-img')) {
    const cs = getComputedStyle(img);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let o = 1;
    for (let n = img; n && !n.classList.contains('wheel-items'); n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    if (o < 0.05) continue;
    const r = img.getBoundingClientRect();
    const k = img.getAttribute('src');
    const prev = seen.get(k);
    if (!prev) { seen.set(k, r); continue; }
    const d = Math.hypot(prev.x - r.x, prev.y - r.y) + Math.abs(prev.width - r.width);
    if (d > 2) window.__bad.push({ logo: k.replace(/^.*\//, ''), ecart: Math.round(d), pas: window.__steps });
  }
};
window.__step = (state, ms) => {
  if (state) window.__send(state);
  for (let t = 0; t < ms; t += 10) {
    for (const a of document.getAnimations()) {
      if (a.playState === 'finished') continue;
      a.pause();
      a.currentTime = (Number(a.currentTime) || 0) + 10;
    }
    window.__steps++;
    check();
  }
};
// Rien à rendre au banc (une fonction ne se transmet pas).
undefined;
`;

const BENCH = String.raw`
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_DIR;
// Les glissements comme sur une borne, même si le poste demande moins d'animations.
app.commandLine.appendSwitch('force-prefers-no-reduced-motion');
protocol.registerSchemesAsPrivileged([{ scheme: 'cyber-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);
app.whenReady().then(async () => {
  protocol.handle('cyber-media', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname).replace(/^\//, '');
    const file = path.join(dir, 'medias', name);
    if (!fs.existsSync(file)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' } });
  });
  // Jamais montrée : rendu hors écran.
  const win = new BrowserWindow({
    show: false, frame: false, skipTaskbar: true, focusable: false, width: 1080, height: 1920, useContentSize: true, enableLargerThanScreen: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(dir, 'preload.cjs'), contextIsolation: false, sandbox: false },
  });
  win.setBounds({ x: 0, y: 0, width: 1080, height: 1920 });
  const errors = [];
  win.webContents.on('console-message', (event) => { if (event.level === 'error' || event.level === 3) errors.push(event.message); });
  await win.loadFile(process.env.CP_PAGE, { query: { role: 'playfield' } });
  const states = JSON.parse(fs.readFileSync(path.join(dir, 'etats.json'), 'utf8'));
  const send = (s) => win.webContents.executeJavaScript('window.__send(' + JSON.stringify(s) + ')');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await send(states[0]);
  // Logos chargés et posés.
  for (let i = 0; i < 50; i++) {
    await wait(100);
    const n = await win.webContents.executeJavaScript("document.querySelectorAll('.wheel-items img.wheel-img').length");
    if (n >= 7) break;
  }
  await wait(600);
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir, 'releve.js'), 'utf8'));
  // Rafale vers la droite, puis vers la gauche : un appui toutes les 70 ms (le glissement en dure 320).
  for (const s of states.slice(1)) await win.webContents.executeJavaScript('window.__step(' + JSON.stringify(s) + ', 70)');
  await win.webContents.executeJavaScript('window.__step(null, 900)');
  const out = await win.webContents.executeJavaScript('({ bad: window.__bad, steps: window.__steps, calme: matchMedia("(prefers-reduced-motion: reduce)").matches })');
  out.errors = errors;
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify(out));
  app.exit(0);
});
`;

const PRELOAD = String.raw`
window.cyberI18n = {};
window.cyber = {
  onState: (f) => { window.__send = f; },
  ready() {}, act() {}, mediaError() {}, jukebox() {}, onDmd() {}, onJukeboxPulse() {}, onJukeboxTime() {}, pathOf: () => '',
};
`;

test('roue, vrai Chromium : en rafale, un médaillon n’est jamais dessiné deux fois', { skip: electron ? false : 'Electron sous Windows requis', timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-roue-rafale-'));
  try {
    fs.mkdirSync(path.join(dir, 'medias'));
    for (let i = 0; i < TABLES; i++) fs.writeFileSync(path.join(dir, 'medias', `T${i}.png`), png((i * 53) % 256, (i * 97) % 256, (i * 151) % 256));
    // Douze appuis à droite, puis huit à gauche.
    const path_ = [0, ...Array.from({ length: 12 }, (_, i) => i + 1), ...Array.from({ length: 8 }, (_, i) => 11 - i)];
    fs.writeFileSync(path.join(dir, 'etats.json'), JSON.stringify(path_.map(stateAt)));
    fs.writeFileSync(path.join(dir, 'releve.js'), SAMPLER);
    fs.writeFileSync(path.join(dir, 'preload.cjs'), PRELOAD);
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_PAGE: path.join(APP, 'renderer', 'frontend.html') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 110_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as { bad: { logo: string; ecart: number; image: number }[]; steps: number; calme: boolean; errors: string[] };
    assert.equal(out.calme, false, 'glissements actifs pendant l’essai');
    // Vingt appuis de 70 ms, puis l'arrêt : 230 pas de 10 ms.
    assert.equal(out.steps, 230, 'relevé à chaque pas');
    assert.deepEqual(out.bad.slice(0, 8), [], `${out.bad.length} pas où un logo est dessiné à deux endroits`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Fluidité (13/11/2026) : un appui dans la roue ne lit jamais la mise en page ni les styles
// calculés. Chaque lecture au milieu de l'appui (largeur de la scène, durée du glissement, taille du
// logo, largeur de l'écran pour le titre) obligeait Chromium à recalculer toute la page, deux ou trois
// fois par appui : 14 à 19 ms de travail au lieu de 5. Ce qui doit mesurer le fait après l'image
// (afterPaint) ou dans un délai (setTimeout), une fois le glissement parti.
test('roue : le chemin d’un appui ne force aucun calcul de mise en page', () => {
  const js = fs.readFileSync(path.join(APP, 'renderer', 'frontend.js'), 'utf8');
  /** Corps d'une fonction de frontend.js, accolades appariées, sans ses rappels différés. */
  const body = (name: string) => {
    const at = js.indexOf(`\nfunction ${name}(`);
    assert.ok(at >= 0, `fonction ${name} introuvable`);
    let i = js.indexOf('{', at);
    const start = i;
    for (let depth = 0; ; i++) {
      if (js[i] === '{') depth++;
      else if (js[i] === '}' && --depth === 0) break;
    }
    let text = js.slice(start, i + 1);
    // Rappels différés (après l'image, après un délai) : hors du chemin de l'appui.
    for (const deferred of ['afterPaint(', 'setTimeout(']) {
      for (let k = text.indexOf(deferred); k >= 0; k = text.indexOf(deferred)) {
        let j = k + deferred.length;
        for (let depth = 1; depth > 0; j++) {
          if (text[j] === '(') depth++;
          else if (text[j] === ')') depth--;
        }
        text = text.slice(0, k) + text.slice(j);
      }
    }
    return text;
  };
  const LAYOUT = /\.(offset(Width|Height|Top|Left)|client(Width|Height)|scroll(Top|Left|Width|Height)|innerText)\b|getBoundingClientRect|getComputedStyle/;
  for (const name of ['wheelStage', 'placeWheelItem', 'haloSync', 'wheelMoved', 'wheelPulse', 'fitMedallion', 'menuPanel']) {
    const text = body(name).replace(/rootWidth \|\| root\.offsetWidth/g, 'rootWidth');
    assert.doesNotMatch(text, LAYOUT, `${name} lit la mise en page pendant l'appui`);
  }
});
