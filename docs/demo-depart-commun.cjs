// Banc hors écran de l'attente du départ commun d'une partie entre amis (lancé par
// docs\demo-depart-commun.ps1) : pour chaque jeu d'écrans simulés (docs\ecrans : borne, poste à
// deux écrans, un écran), chaque sens du plateau, deux à quatre joueurs, et chaque moment de
// l'attente (un joueur charge encore, le délai des derniers, un retardataire, « Partez ! »), la
// carte telle que la pose liveWaitBounds (packages/core/src/livestart.ts), avec la vue que donne
// liveWaitView ; puis la vraie page (app/renderer/game-notice.html, son preload) rendue à cette
// taille. Chaque rendu passe le garde-fou de mise en page (chevauchement, rognure, texte sous
// 20 px) ; une planche par jeu d'écrans montre où se pose la carte, à l'échelle.
//   electron docs/demo-depart-commun.cjs <spec.json>   { "out": dossier des captures, "langue": "fr" | "en" }
// Noms inventés. Fenêtres jamais montrées (show: false, rendu hors écran).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(process.argv.find((a) => a.endsWith('.json')), 'utf8').replace(/^﻿/, ''));

const { app, BrowserWindow, ipcMain } = require('electron');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
const { checkLayout } = require(path.join(REPO, 'app', 'dist', 'layout-check.js'));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, (error) => (console.error(error), app.exit(1)));
core.setLanguage(spec.langue === 'en' ? 'en' : 'fr');

/** Rôles des écrans simulés, comme docs\demo-bande-partie.cjs. */
const LAYOUTS = {
  borne: { roles: { playfield: 0, backglass: 1, dmd: 2, topper: 3 } },
  'poste-deux-ecrans': { roles: { playfield: 2, backglass: 0 } },
  'un-ecran': { roles: { playfield: 0 } },
};

function roleRects(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'ecrans', `${name}.json`), 'utf8').replace(/^﻿/, ''));
  const displays = core.parseSimulatedDisplays(raw, name);
  const rects = {};
  for (const [role, i] of Object.entries(LAYOUTS[name].roles)) rects[role] = { ...displays[i].bounds };
  return rects;
}

const T0 = Date.parse('2026-10-31T20:00:00.000Z');
const PROTO = core.LIVE_PROTOCOL;

/** La partie vue de la borne d'Alexis (`me`), `n` joueurs, au moment `moment` de l'attente. */
function waitFor(n, moment) {
  const names = [
    ['alexis', 'Alexis'],
    ['bruno', 'Bruno'],
    ['maxi', 'Maximilien-Alexandre'],
    ['dora', 'Dora'],
  ].slice(0, n);
  let game = {
    id: '0123456789abcdef',
    host: 'alexis',
    table: { table: { title: 'Star Courier' }, print: 'a'.repeat(64), balls: 3 },
    title: 'Star Courier (Halcyon 1987)',
    players: names.map(([key, name], i) => ({ key, name, state: 'accepted', ...(i === 0 ? { host: true } : { settings: 'ok' }), proto: key === 'dora' ? 3 : PROTO })),
    phase: 'countdown',
    createdAt: new Date(T0).toISOString(),
  };
  const at = (ms) => new Date(T0 + ms);
  for (const [key] of names) game = core.gameStatus(game, key, { state: 'loading' }, at(5000));
  game = core.gameStatus(game, 'alexis', { state: 'loading', ready: true }, at(10_000));
  if (n > 2) game = core.gameStatus(game, 'maxi', { state: 'loading', ready: true }, at(12_000));
  if (moment === 'attente') return core.liveWaitView(game, 'alexis', at(14_000));
  if (moment === 'delai') return core.liveWaitView(game, 'alexis', at(10_000 + core.LIVE_READY_WAIT_MS - 12_000));
  if (moment === 'retardataire') {
    game = core.giveGo(game, 'timeout', at(10_000 + core.LIVE_READY_WAIT_MS));
    return core.liveWaitView(game, 'bruno', at(10_000 + core.LIVE_READY_WAIT_MS + 20_000), { readyAt: T0 + 10_000 + core.LIVE_READY_WAIT_MS + 19_000 });
  }
  game = core.gameStatus(game, 'bruno', { state: 'loading', ready: true }, at(30_000));
  game = core.giveGo(game, 'all-ready', at(30_000));
  return core.liveWaitView(game, 'alexis', at(31_000), { manual: moment === 'partez-manuel' });
}

ipcMain.on('i18n', (e) => (e.returnValue = {}));

function closed(win) {
  return new Promise((resolve) => {
    win.once('closed', resolve);
    win.close();
  });
}

async function render(bounds, state, file) {
  const win = new BrowserWindow({
    show: false,
    width: bounds.width,
    height: bounds.height,
    useContentSize: true,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'notice-preload.js'), contextIsolation: true, sandbox: true },
  });
  await win.loadFile(path.join(REPO, 'app', 'renderer', 'game-notice.html'));
  win.webContents.send('notice:state', state);
  await new Promise((r) => setTimeout(r, 400));
  let image;
  for (let attempt = 1; !image; attempt++) {
    try {
      image = await win.webContents.capturePage();
    } catch (error) {
      console.log(`capture ${path.basename(file)}, essai ${attempt} : ${error.message ?? error}`);
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  fs.writeFileSync(file, image.toPNG());
  const problems = await checkLayout(win.webContents);
  await closed(win);
  return { image, problems };
}

app.whenReady().then(async () => {
  fs.mkdirSync(spec.out, { recursive: true });
  const report = [];
  const rendered = new Map();
  for (const name of Object.keys(LAYOUTS)) {
    const rects = roleRects(name);
    const sheet = [];
    for (const rotation of [0, 90, 180, 270]) {
      for (let n = 2; n <= 4; n++) {
        for (const moment of ['attente', 'delai', 'retardataire', 'partez', 'partez-manuel']) {
          const view = waitFor(n, moment);
          if (!view) throw new Error(`pas de vue : ${moment}, ${n} joueurs`);
          const bounds = core.liveWaitBounds(rects.playfield, rotation, view.rows.length);
          const key = `${moment}-${bounds.width}x${bounds.height}-${rotation}-${n}`;
          if (!rendered.has(key)) {
            const { image, problems } = await render(bounds, { view, rotation }, path.join(spec.out, `${key}.png`)).catch((error) => {
              throw new Error(`${name} ${key} (${JSON.stringify(bounds)}) : ${error.message ?? error}`);
            });
            rendered.set(key, image);
            report.push(`${name} ${key} : ${problems.length ? problems.join(' ; ') : 'conforme'}`);
          }
          if (rotation === 0 && n === 3) sheet.push({ moment, bounds, image: rendered.get(key) });
        }
      }
    }
    await drawSheet(name, rects, sheet);
  }
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), report.join('\n') + '\n');
  const bad = report.filter((l) => !l.endsWith(': conforme'));
  console.log(`Départ commun : ${report.length} rendus, ${bad.length} problème(s).`);
  for (const l of bad) console.log(`  ${l}`);
  app.exit(bad.length ? 1 : 0);
});

/** Planche d'un jeu d'écrans : les écrans à l'échelle, la carte de l'attente (trois joueurs, plateau à 0°) à sa place, puis « Partez ! » à côté. */
async function drawSheet(name, rects, sheet) {
  const all = Object.values(rects);
  const minX = Math.min(...all.map((r) => r.x));
  const minY = Math.min(...all.map((r) => r.y));
  const maxX = Math.max(...all.map((r) => r.x + r.width));
  const maxY = Math.max(...all.map((r) => r.y + r.height));
  const scale = 1600 / (maxX - minX);
  const W = 1600;
  const H = Math.round((maxY - minY) * scale);
  const pick = (moment) => sheet.find((s) => s.moment === moment);
  const layers = [pick('attente')].filter(Boolean);
  const go = pick('partez');
  const html = `<!doctype html><html><body style="margin:0;background:#050a09;width:${W}px;height:${H + 40}px;position:relative;font:14px Segoe UI;color:#9bada7">
${Object.entries(rects)
  .map(([role, r]) => `<div style="position:absolute;left:${(r.x - minX) * scale}px;top:${(r.y - minY) * scale}px;width:${r.width * scale}px;height:${r.height * scale}px;box-sizing:border-box;border:1px solid #24504a;background:#0b1a1d"><span style="position:absolute;left:6px;top:4px">${role}</span></div>`)
  .join('\n')}
${layers.map((l) => `<img src="${l.image.toDataURL()}" style="position:absolute;left:${(l.bounds.x - minX) * scale}px;top:${(l.bounds.y - minY) * scale}px;width:${l.bounds.width * scale}px;height:${l.bounds.height * scale}px">`).join('\n')}
${go ? `<img src="${go.image.toDataURL()}" style="position:absolute;right:8px;bottom:8px;width:${go.bounds.width * scale}px;height:${go.bounds.height * scale}px">` : ''}
</body></html>`;
  const win = new BrowserWindow({ show: false, width: W, height: Math.max(H + 40, 50), useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  fs.writeFileSync(path.join(spec.out, `planche-${name}.png`), (await win.webContents.capturePage()).toPNG());
  await closed(win);
}
