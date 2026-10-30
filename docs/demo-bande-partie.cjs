// Banc hors écran de la bande d'une partie entre amis (lancé par docs\demo-bande-partie.ps1) : pour
// chaque jeu d'écrans simulés (docs\ecrans : borne, poste à deux écrans, un écran), chaque sens du
// plateau, un à quatre joueurs, et ce que VPX occupe (rien, le fronton), la place que choisit
// liveBoardPlacement (packages/core/src/gamenotice.ts) ; puis la vraie page de la bande
// (app/renderer/game-notice.html, son preload) rendue à cette taille, avec l'état que
// game-notice.ts lui enverrait : cartes d'un écran libre, encart du plateau, points du DMD. Chaque
// rendu passe le garde-fou de mise en page (chevauchement, rognure, texte sous 20 px) ; une planche
// par jeu d'écrans montre où se pose chaque forme, à l'échelle, le plateau tourné.
//   electron docs/demo-bande-partie.cjs <spec.json>   { "out": dossier des captures, "langue": "fr" | "en" }
// Noms et scores inventés. Fenêtres jamais montrées (show: false, rendu hors écran).

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

/** Rôles des écrans simulés, comme docs\demo-medias.cjs (modele) les pose. */
const LAYOUTS = {
  borne: { roles: { playfield: 0, backglass: 1, dmd: 2, topper: 3 } },
  'poste-deux-ecrans': { roles: { playfield: 2, backglass: 0, dmd: 0 }, dmdUnderBackglass: true },
  'un-ecran': { roles: { playfield: 0 } },
};

function roleRects(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'ecrans', `${name}.json`), 'utf8').replace(/^﻿/, ''));
  const displays = core.parseSimulatedDisplays(raw, name);
  const layout = LAYOUTS[name];
  const rects = {};
  for (const [role, i] of Object.entries(layout.roles)) rects[role] = { ...displays[i].bounds };
  if (layout.dmdUnderBackglass) {
    const b = rects.backglass;
    const split = core.splitBackglassDmd({ width: b.width, height: b.height });
    for (const role of ['backglass', 'dmd']) {
      const r = core.zoneRect(split[role], b);
      rects[role] = { x: b.x + r.x, y: b.y + r.y, width: r.width, height: r.height };
    }
  }
  return rects;
}

/** Joueurs inventés, comme liveBoardView les donne : le premier en tête, le deuxième est la borne. */
function view(n) {
  const fr = spec.langue !== 'en';
  const players = [
    ['Bruno', 2_418_300, 2],
    ['Alexis', 1_240_500, 3],
    ['Maximilien-Alexandre', 980_120, 2],
    ['Dora', 310_000, 0],
  ];
  return {
    mode: 'board',
    title: fr ? 'Partie entre amis' : 'Game with friends',
    rows: players.slice(0, n).map(([name, points, ball], i) => ({
      name,
      score: points.toLocaleString(fr ? 'fr-FR' : 'en-US'),
      points,
      detail: ball ? (fr ? `Bille ${ball} sur 3` : `Ball ${ball} of 3`) : fr ? 'Partie terminée' : 'Game over',
      short: ball ? `B${ball}` : fr ? 'Fin' : 'End',
      ball,
      done: !ball,
      me: i === 1,
      lead: i === 0,
    })),
  };
}

ipcMain.on('i18n', (e) => (e.returnValue = {}));

/**
 * Fermer une fenêtre et attendre qu'elle le soit : détruite pendant que la suivante charge la même
 * page, elle emporte le processus de rendu qu'elles partagent (ERR_FAILED au chargement).
 */
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
  const image = await win.webContents.capturePage();
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
    for (const occupied of [[], ['backglass']]) {
      for (const rotation of [0, 90, 180, 270]) {
        for (let n = 1; n <= 4; n++) {
          const screens = {
            playfield: { zone: rects.playfield, rotation },
            ...(rects.dmd ? { dmd: rects.dmd } : {}),
            free: ['backglass', 'topper'].flatMap((role) => (rects[role] && !occupied.includes(role) ? [{ role, zone: rects[role] }] : [])),
          };
          const placed = core.liveBoardPlacement(screens, n);
          const v = view(n);
          const layers = [];
          if (placed.band) layers.push({ kind: placed.band.layout, role: placed.band.role, bounds: placed.band.bounds, state: { view: { ...v, layout: placed.band.layout }, rotation: placed.band.rotation } });
          if (placed.dmd) layers.push({ kind: 'dmd', role: 'dmd', bounds: placed.dmd, state: { view: { mode: 'board', layout: 'dmd', dots: Array.from(core.liveBoardDots(v)) }, rotation: 0 } });
          for (const layer of layers) {
            const key = `${layer.kind}-${layer.bounds.width}x${layer.bounds.height}-${layer.state.rotation}-${n}`;
            if (!rendered.has(key)) {
              const file = path.join(spec.out, `${key}.png`);
              const { image, problems } = await render(layer.bounds, layer.state, file);
              rendered.set(key, image);
              report.push(`${name} ${key} : ${problems.length ? problems.join(' ; ') : 'conforme'}`);
            }
            sheet.push({ ...layer, image: rendered.get(key), where: `${occupied.join('+') || 'libre'}, ${rotation}°, ${n} j.` });
          }
        }
      }
    }
    await drawSheet(name, rects, sheet);
  }
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), report.join('\n') + '\n');
  const bad = report.filter((l) => !l.endsWith(': conforme'));
  console.log(`Bande de la partie : ${report.length} rendus, ${bad.length} problème(s).`);
  for (const l of bad) console.log(`  ${l}`);
  app.exit(bad.length ? 1 : 0);
});

/**
 * Planche d'un jeu d'écrans : les écrans à l'échelle, chaque forme posée à sa place (fronton libre,
 * quatre joueurs, plateau à 0°), pour voir d'un coup d'œil qu'aucune ne touche le haut du plateau.
 */
async function drawSheet(name, rects, sheet) {
  const pick = (kind) => sheet.find((s) => s.kind === kind && s.where.startsWith('libre, 0°, 4')) ?? sheet.find((s) => s.kind === kind && s.where.includes('0°, 4'));
  const layers = ['cards', 'insert', 'dmd'].map(pick).filter(Boolean);
  const all = Object.values(rects);
  const minX = Math.min(...all.map((r) => r.x));
  const minY = Math.min(...all.map((r) => r.y));
  const maxX = Math.max(...all.map((r) => r.x + r.width));
  const maxY = Math.max(...all.map((r) => r.y + r.height));
  const scale = 1600 / (maxX - minX);
  const W = 1600;
  const H = Math.round((maxY - minY) * scale);
  const html = `<!doctype html><html><body style="margin:0;background:#050a09;width:${W}px;height:${H}px;position:relative;font:14px Segoe UI;color:#9bada7">
${Object.entries(rects)
  .map(([role, r]) => `<div style="position:absolute;left:${(r.x - minX) * scale}px;top:${(r.y - minY) * scale}px;width:${r.width * scale}px;height:${r.height * scale}px;box-sizing:border-box;border:1px solid #24504a;background:#0b1a1d"><span style="position:absolute;left:6px;top:4px">${role}</span></div>`)
  .join('\n')}
${layers.map((l) => `<img src="${l.image.toDataURL()}" style="position:absolute;left:${(l.bounds.x - minX) * scale}px;top:${(l.bounds.y - minY) * scale}px;width:${l.bounds.width * scale}px;height:${l.bounds.height * scale}px">`).join('\n')}
</body></html>`;
  const win = new BrowserWindow({ show: false, width: W, height: Math.max(H, 50), useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  fs.writeFileSync(path.join(spec.out, `planche-${name}.png`), (await win.webContents.capturePage()).toPNG());
  await closed(win);
}
