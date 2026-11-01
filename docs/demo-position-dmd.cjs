// Banc hors écran des réglages en partie (lancé par docs\demo-position-dmd.ps1) : le menu que les deux
// MagnaSave ouvrent pendant une partie, « Position du DMD » en tête (packages/core/src/dmdplace.ts,
// app/src/in-game-menu.ts). Pour chaque jeu d'écrans simulés (docs\ecrans : borne, poste à deux
// écrans, un écran) et chaque sens du plateau, la vraie page (app/renderer/in-game-menu.html, son
// preload) rendue à la taille de chaque écran, avec l'état que in-game-menu.ts lui enverrait, piloté
// par les vraies touches (dmdMenuKey) : menu ouvert, position ouverte, choix de l'écran, DMD masqué
// et ligne grisée, question avant de quitter, partie sans fenêtre du DMD, menu de VPX impossible.
// Chaque rendu passe le garde-fou de mise en page (chevauchement, rognure, texte sous 20 px) ; une
// planche par jeu d'écrans montre les écrans à l'échelle, le panneau et le cadre du DMD à leur place.
//   electron docs/demo-position-dmd.cjs <spec.json>   { "out": dossier des captures, "langue": "fr" | "en" }
// Fenêtres jamais montrées (show: false, rendu hors écran). VPX n'est jamais lancé.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(process.argv.find((a) => a.endsWith('.json')), 'utf8').replace(/^﻿/, ''));

const { app, BrowserWindow, ipcMain } = require('electron');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
const { checkLayout } = require(path.join(REPO, 'app', 'dist', 'layout-check.js'));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
// Sur le bureau caché, le compositeur graphique refuse parfois la capture (UnknownVizError) : rendu logiciel.
app.disableHardwareAcceleration();
for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, (error) => (console.error(error), app.exit(1)));

const lang = spec.langue === 'en' ? 'en' : 'fr';
core.setLanguage(lang);
ipcMain.on('i18n', (e) => (e.returnValue = { language: lang, locale: core.localeOf(lang), messages: core.messagesOf(lang) }));

/** Rôles des écrans simulés ; `dmd` : la zone du DMD sur son écran (fractions). */
const LAYOUTS = {
  borne: { roles: { playfield: 0, backglass: 1, dmd: 2, topper: 3 }, rotations: [0, 90, 270], dmd: core.FULL_ZONE },
  'poste-deux-ecrans': { roles: { playfield: 2, backglass: 0, dmd: 0 }, rotations: [0], dmd: core.splitBackglassDmd({ width: 1920, height: 1080 }).dmd },
  'un-ecran': { roles: { playfield: 0, dmd: 0 }, rotations: [0, 270], dmd: { x: 0.36, y: 0.04, width: 0.28, height: 0.07, aspect: 4 } },
};

function screensOf(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'ecrans', `${name}.json`), 'utf8').replace(/^﻿/, ''));
  const displays = core.parseSimulatedDisplays(raw, name);
  const layout = LAYOUTS[name];
  const order = [...new Set(['playfield', 'backglass', 'dmd', 'topper'].map((r) => layout.roles[r]).filter((i) => i !== undefined))];
  return order.map((i, n) => {
    const roles = Object.entries(layout.roles).filter(([, j]) => j === i).map(([r]) => r);
    return { fingerprint: `fp${i}`, label: `${n + 1} · ${roles.join(' + ')} (${displays[i].bounds.width} × ${displays[i].bounds.height})`, bounds: displays[i].bounds };
  });
}

const KEYS = { previous: ['ShiftLeft'], next: ['ShiftRight'], confirm: ['Digit1'], exit: ['Escape'], up: ['ControlLeft'], down: ['ControlRight'] };
const press = (host, s, code, n = 1) => {
  for (let i = 0; i < n; i++) core.dmdMenuKey(host, s, { code });
};

/** Les états montrés, chacun obtenu par les touches depuis le menu ouvert. */
function states(name, screens) {
  const layout = LAYOUTS[name];
  const dmdScreen = screens.findIndex((s) => s.fingerprint === `fp${layout.roles.dmd}`);
  const general = { screen: dmdScreen, zone: layout.dmd, hidden: false };
  const host = (over = {}) => ({ screens, keys: KEYS, table: 'Medieval Madness (Williams 1997)', configuration: 'Borne du salon', ownPlace: false, general, live: true, ...over });
  const start = (spot = general) => core.startDmdMenu(spot);
  const out = [];
  {
    const h = host();
    out.push({ key: 'ouvert', host: h, s: start() });
  }
  {
    const h = host({ ownPlace: true });
    const s = start();
    press(h, s, 'ShiftRight');
    press(h, s, 'Digit1');
    press(h, s, 'ShiftRight', 40);
    out.push({ key: 'position', host: h, s });
  }
  {
    const h = host();
    const s = start();
    press(h, s, 'Digit1');
    press(h, s, 'ShiftRight');
    out.push({ key: 'ecran', host: h, s });
  }
  {
    const h = host();
    const s = start();
    s.item = 5;
    press(h, s, 'Digit1');
    s.item = 1;
    press(h, s, 'Digit1');
    out.push({ key: 'masque', host: h, s });
  }
  {
    const h = host();
    const s = start();
    // Réduit (un DMD qui prend tout son écran ne se déplace pas), puis Exit : la question.
    press(h, s, 'NumpadSubtract', 30);
    press(h, s, 'Escape');
    if (!s.leaving) throw new Error(`${name} : Exit après un changement n'a pas posé la question`);
    out.push({ key: 'quitter', host: h, s });
  }
  {
    const h = host({ live: core.t('VPX n’a pas ouvert de fenêtre pour le DMD dans cette partie (DMD éteint ou incrusté dans le plateau) : la place choisie se verra à la prochaine partie.'), vpxMenuBlocked: core.t('Aucune touche du clavier n’ouvre le menu de VPX : un bouton de la borne a pris F12.') });
    const s = start();
    s.item = 8;
    out.push({ key: 'sans-fenetre', host: h, s });
  }
  {
    const h = host({ ownPlace: true });
    const s = start();
    s.item = 6;
    core.markDmdSaved(s, core.t('Enregistré pour cette table dans la configuration « {name} » : elle s’ouvrira ainsi à chaque partie.', { name: 'Borne du salon' }));
    out.push({ key: 'enregistre', host: h, s });
  }
  return out;
}

/**
 * Fermer une fenêtre et attendre qu'elle le soit : détruite pendant que la suivante charge la même
 * page, elle emporte le processus de rendu qu'elles partagent.
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
    webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'in-game-preload.js'), contextIsolation: true, sandbox: true },
  });
  await win.loadFile(path.join(REPO, 'app', 'renderer', 'in-game-menu.html'));
  win.webContents.send('in-game:state', state);
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(file, image.toPNG());
  const problems = await checkLayout(win.webContents);
  // Le panneau ne cache jamais le DMD qu'on règle, ni son étiquette (in-game-menu.js, placePanel).
  const hidden = await win.webContents.executeJavaScript(`(() => {
    const zone = document.getElementById('zone');
    const frame = document.getElementById('frame');
    if (zone.hidden || frame.hidden) return 0;
    const a = document.getElementById('panel').getBoundingClientRect();
    const covered = (b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return covered(frame.getBoundingClientRect()) + covered(document.getElementById('frame-label').getBoundingClientRect());
  })()`);
  if (hidden > 0) problems.push(`le panneau cache le DMD (${Math.round(hidden)} px²)`);
  await closed(win);
  return { image, problems };
}

app.whenReady().then(async () => {
  fs.mkdirSync(spec.out, { recursive: true });
  const report = [];
  for (const name of Object.keys(LAYOUTS)) {
    const screens = screensOf(name);
    const panelScreen = 0;
    for (const rotation of LAYOUTS[name].rotations) {
      for (const { key, host, s } of states(name, screens)) {
        const panel = core.dmdMenuPanel(host, s, core.dmdMenuKeyNames(host.keys));
        const layers = [];
        for (let i = 0; i < screens.length; i++) {
          const frame = core.dmdMenuFrame(host, s, i);
          if (i !== panelScreen && !frame) continue;
          const state = { screen: i, frame, dirty: core.dmdMenuDirty(s), ...(i === panelScreen && { panel, zone: { x: 0, y: 0, width: 1, height: 1 }, rotation }) };
          const file = path.join(spec.out, `${name}-${rotation}-${key}-ecran${i + 1}.png`);
          const { image, problems } = await render(screens[i].bounds, state, file);
          report.push(`${name} ${rotation}° ${key} écran ${i + 1} : ${problems.length ? problems.join(' ; ') : 'conforme'}`);
          layers.push({ bounds: screens[i].bounds, image });
        }
        if (rotation === LAYOUTS[name].rotations[0]) await drawSheet(`${name}-${key}`, screens, layers);
      }
    }
  }
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), report.join('\n') + '\n');
  const bad = report.filter((l) => !l.endsWith(': conforme'));
  console.log(`Réglages en partie : ${report.length} rendus, ${bad.length} problème(s).`);
  for (const l of bad) console.log(`  ${l}`);
  app.exit(bad.length ? 1 : 0);
});

/** Planche d'un jeu d'écrans : les écrans à l'échelle, le panneau et le cadre du DMD posés. */
async function drawSheet(name, screens, layers) {
  const all = screens.map((s) => s.bounds);
  const minX = Math.min(...all.map((r) => r.x));
  const minY = Math.min(...all.map((r) => r.y));
  const maxX = Math.max(...all.map((r) => r.x + r.width));
  const maxY = Math.max(...all.map((r) => r.y + r.height));
  const scale = 1600 / (maxX - minX);
  const W = 1600;
  const H = Math.round((maxY - minY) * scale);
  const html = `<!doctype html><html><body style="margin:0;background:#050a09;width:${W}px;height:${H}px;position:relative;font:14px Segoe UI;color:#9bada7">
${screens
  .map((s) => `<div style="position:absolute;left:${(s.bounds.x - minX) * scale}px;top:${(s.bounds.y - minY) * scale}px;width:${s.bounds.width * scale}px;height:${s.bounds.height * scale}px;box-sizing:border-box;border:1px solid #24504a;background:#0b1a1d"><span style="position:absolute;left:6px;top:4px">${s.label}</span></div>`)
  .join('\n')}
${layers.map((l) => `<img src="${l.image.toDataURL()}" style="position:absolute;left:${(l.bounds.x - minX) * scale}px;top:${(l.bounds.y - minY) * scale}px;width:${l.bounds.width * scale}px;height:${l.bounds.height * scale}px">`).join('\n')}
</body></html>`;
  const win = new BrowserWindow({ show: false, width: W, height: Math.max(H, 50), useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  fs.writeFileSync(path.join(spec.out, `planche-${name}.png`), (await win.webContents.capturePage()).toPNG());
  await closed(win);
}
