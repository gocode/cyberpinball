// Démonstration hors écran de l'écran du navigateur intégré (fenêtre « Récupérer »), sur les
// écrans simulés de la borne (docs\ecrans\borne.json : playfield 4K couché et tourné,
// fronton, DMD, topper). Pour chaque choix (Automatique, Playfield, Fronton, DMD, Topper),
// depuis « Comptes des sites » : le choix dans le menu, avec son aperçu, puis « Se connecter »
// ouvre « Récupérer » sur une fausse page de connexion (aucun site n'est chargé). Vérifié :
// la fenêtre couvre exactement l'écran du rôle choisi. Puis le DMD débranché : repli sur
// l'écran automatique, dit dans le bandeau. Chaque ouverture a sa vue d'ensemble de la borne
// (borne-<choix>.png : les quatre écrans à l'échelle, la fenêtre sur le sien). Aucune fenêtre
// n'apparaît (rendu hors écran), lancé par docs\demo-ecran-navigateur.ps1 sur le bureau caché.
// Captures et relevé dans tmp\demo-ecran-navigateur\captures.
//   npm run build
//   .\docs\demo-ecran-navigateur.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-ecran-navigateur');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { createConfigurationsMenu } = require(path.join(WT, 'app', 'dist', 'configurations-menu.js'));
const { browserScreenFor } = require(path.join(WT, 'app', 'dist', 'browser-screen.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { ACQUIRE_PARTITION } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const LOG = [];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}

/** Écrans simulés de la borne (CYBERPINBALL_DISPLAYS, posé par Use-HorsEcran borne). */
function borneDisplays() {
  const file = process.env.CYBERPINBALL_DISPLAYS;
  if (!file || !/borne\.json$/i.test(file)) throw new Error(`écrans simulés de la borne attendus (CYBERPINBALL_DISPLAYS = ${file ?? 'absent'})`);
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

/** Modèle de la borne simulée : playfield couché sur le téléviseur 4K (flippers à gauche de l'image), fronton, DMD, topper. */
function sandbox(displays) {
  const root = path.join(BASE, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  const screens = displays.map(core.toPhysicalScreen);
  const fp = (i) => screens[i].fingerprint;
  core.saveCabinet(L.data, {
    version: 1,
    screens,
    roles: { playfield: fp(0), backglass: fp(1), dmd: fp(2), topper: fp(3) },
    playfield: { flipperEdge: 'left' },
    vpx: { iniPath: path.join(BASE, 'VPinballX.ini') },
    updatedAt: '',
  });
  return { root, L };
}

/** Fausse page de connexion, à la taille de la fenêtre : on voit qu'elle remplit l'écran. */
function fakeLogin(request) {
  const host = new URL(request.url).hostname;
  const html = `<!doctype html><meta charset="utf-8"><title>${host}</title>
<style>html,body{margin:0;height:100%;background:#16202a;color:#e8eef2;font:24px/1.4 Segoe UI,sans-serif}
body{display:grid;place-items:center;background-image:linear-gradient(#ffffff10 1px,transparent 1px),linear-gradient(90deg,#ffffff10 1px,transparent 1px);background-size:80px 80px;box-sizing:border-box;border:6px solid #3d8bfd}
form{background:#22303c;padding:24px 32px;border-radius:8px;display:grid;gap:12px;min-width:320px}
input{font:inherit;padding:6px 10px}#size{position:fixed;right:16px;bottom:10px;font-size:18px;color:#9fb3c8}</style>
<form><b>Page de connexion simulée : ${host}</b><input placeholder="Identifiant"><input type="password" placeholder="Mot de passe"></form>
<div id="size"></div><script>const s=()=>document.getElementById('size').textContent=innerWidth+' × '+innerHeight;s();onresize=s;</script>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function run(report) {
  const all = borneDisplays();
  const { root, L } = sandbox(all);
  const model = core.loadCabinet(L.data);
  /** Écrans branchés ; la dernière étape débranche le DMD. */
  let plugged = all;
  const assignments = () => {
    const matched = core.matchScreens(model.screens, plugged).matched;
    return Object.fromEntries(Object.entries(model.roles).flatMap(([role, f]) => (matched.get(f) ? [[role, matched.get(f)]] : [])));
  };
  const rotation = () => core.playfieldRotation(model, assignments().playfield);
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const sc = { width: 1920, height: 1080 };
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  let configurations;
  const library = createLibrary({
    // Mode invité inactif : tout passe (host.guest est obligatoire, library.ts).
    guest: { active: false, allows: () => true, knock: () => true },
    root,
    dataDir: L.data,
    vpxExe: () => undefined,
    tables: () => [],
    reload: () => {},
    enter: () => (phase = 'library'),
    leave: () => (phase = 'menu'),
    play: () => {},
    quit: () => {},
    keys: () => KEYS,
    windows: () => windows,
    // Le même calcul que le menu (frontend.ts) : écrans des rôles, réglage relu à chaque ouverture.
    browserScreen: () => browserScreenFor(assignments(), rotation(), core.loadCabinet(L.data)?.browserScreen, () => []),
    openBrowserScreen: (back) => configurations.openBrowserScreen(undefined, back),
    broadcast: () => send(),
    downloadsDir: () => path.join(BASE, 'Téléchargements'),
  });
  configurations = createConfigurationsMenu({
    loc: { pointerFile: path.join(BASE, 'root.json'), root: undefined, dataDir: L.data, vpxIni: path.join(BASE, 'VPinballX.ini'), legacyDataDir: L.data, sandbox: true },
    displays: () => plugged,
    library,
    relaunch: () => {},
  });
  function send() {
    if (win.isDestroyed()) return;
    win.webContents.send('state', {
      role: 'playfield', phase, help: false, count: 0, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [],
      nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0] },
      library: phase === 'library' ? library.view() : undefined,
    });
  }
  const onAction = (_e, action) => library.handleAction(action);
  ipcMain.on('action', onAction);
  const ready = new Promise((r) => ipcMain.once('ready', r));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: '0', zones: '[]' } });
  await ready;

  const acq = session.fromPartition(ACQUIRE_PARTITION);
  await acq.clearStorageData();
  acq.protocol.handle('https', fakeLogin);

  fs.mkdirSync(CAPTURES, { recursive: true });
  let step = 0;
  const view = () => library.view();
  async function shot(name) {
    send();
    await delay(300);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(win.webContents, label);
    fs.writeFileSync(path.join(CAPTURES, `${label}.png`), (await win.capturePage()).toPNG());
    const v = view();
    LOG.push(`${label} : ${v.heading} | ${v.subheading ?? ''} | ${v.actions.map((a) => `${a.label}${a.detail ? ` (${a.detail})` : ''}`).join(' | ')}`);
    for (const s of v.sections) for (const r of s.rows) LOG.push(`    ${r.text}${r.badges?.length ? ` [${r.badges.join(', ')}]` : ''} : ${r.detail ?? ''}`);
  }
  const act = (label) => {
    LOG.push(`→ ${label}`);
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  async function idle(timeout = 60_000) {
    const end = Date.now() + timeout;
    await delay(150);
    while (view().busy && Date.now() < end) await delay(150);
    if (view().busy) throw new Error(`toujours occupé (${view().busy})`);
  }
  const acquirer = () => library.catalog.acquirer;

  /** Vue d'ensemble : les écrans simulés à l'échelle 1/4, la fenêtre « Récupérer » sur le sien. */
  async function overview(label, bar, page, at, barHeight) {
    const k = 0.25;
    const minX = Math.min(...all.map((d) => d.bounds.x));
    const minY = Math.min(...all.map((d) => d.bounds.y));
    const width = Math.max(...all.map((d) => d.bounds.x + d.bounds.width)) - minX;
    const height = Math.max(...all.map((d) => d.bounds.y + d.bounds.height)) - minY;
    const nameOf = (d) => Object.entries(model.roles).filter(([, f]) => f === core.toPhysicalScreen(d).fingerprint).map(([r]) => core.browserRoleLabel(r)).join(' + ');
    const box = (b) => `left:${(b.x - minX) * k}px;top:${(b.y - minY) * k}px;width:${b.width * k}px;height:${b.height * k}px`;
    const screens = all
      .map((d) => {
        const on = plugged.includes(d);
        return `<div class="screen${on ? '' : ' off'}" style="${box(d.bounds)}"><span>${nameOf(d)} · ${d.bounds.width} × ${d.bounds.height}${on ? '' : ' · débranché'}</span></div>`;
      })
      .join('');
    // La fenêtre se capture en entier : on n'en garde que le bandeau (sa hauteur suit l'écran,
    // ligne sur l'écran comprise), puis la page du site en dessous, à la hauteur qui reste.
    const barH = barHeight;
    const top = bar.crop({ x: 0, y: 0, width: at.width, height: barH });
    const rest = page.crop({ x: 0, y: 0, width: at.width, height: Math.min(page.getSize().height, at.height - barH) });
    const win = `<div class="win" style="${box(at)}"><img src="${top.toDataURL()}" style="height:${barH * k}px"><img src="${rest.toDataURL()}" style="height:${(at.height - barH) * k}px"></div>`;
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#000;width:${width * k}px;height:${height * k}px;position:relative;font:14px Segoe UI,sans-serif}
.screen{position:absolute;box-sizing:border-box;border:2px solid #2d3b45;background:#0b1114;color:#7f97a6;display:flex;align-items:flex-end;padding:4px 8px}
.screen.off{border-style:dashed;background:#000;color:#a85a5a}.win{position:absolute;display:flex;flex-direction:column;outline:3px solid #2bd47d;outline-offset:-3px}
.win img{width:100%;display:block}span{z-index:2;background:#000a;padding:1px 6px;border-radius:3px}</style>${screens}${win}`;
    const page2 = offscreen(width * k, height * k);
    await page2.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await delay(300);
    fs.writeFileSync(path.join(CAPTURES, `${label}-borne.png`), (await page2.capturePage()).toPNG());
    page2.destroy();
  }

  /** « Se connecter » depuis « Comptes des sites » : la fenêtre doit couvrir l'écran de `expected`. */
  async function openAndCheck(name, expected) {
    act('Se connecter');
    let open;
    for (let i = 0; i < 50 && !(open = acquirer().current()); i++) await delay(100);
    if (!open) throw new Error('fenêtre « Récupérer » pas ouverte');
    for (let i = 0; i < 50 && open.view.webContents.isLoading(); i++) await delay(100);
    await delay(500);
    const label = `${String(step++).padStart(2, '0')}-recuperer-${name}`;
    await report.check(open.win.webContents, `${label} (bandeau)`);
    const bar = await open.win.capturePage();
    const page = await open.view.webContents.capturePage();
    fs.writeFileSync(path.join(CAPTURES, `${label}-bandeau.png`), bar.toPNG());
    fs.writeFileSync(path.join(CAPTURES, `${label}-page.png`), page.toPNG());
    const bounds = open.win.getBounds();
    const wanted = assignments()[expected].bounds;
    const same = ['x', 'y', 'width', 'height'].every((k) => bounds[k] === wanted[k]);
    const note = open.screenNote ?? '';
    LOG.push(`${label} : fenêtre ${JSON.stringify(bounds)} ; écran attendu (${expected}) ${JSON.stringify(wanted)} : ${same ? 'OK' : 'ÉCART'} ; ligne d'écran : ${note || '(aucune)'}`);
    if (!same) throw new Error(`« Récupérer » pas sur l'écran ${expected}`);
    // Hauteur donnée par le processus principal (acquire-window.ts), qui pose la page juste en dessous.
    const barHeight = await open.win.webContents.executeJavaScript(`parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bar-height'))`);
    if (!(barHeight > 0)) throw new Error('hauteur du bandeau inconnue (--bar-height)');
    await overview(label, bar, page, bounds, barHeight);
    acquirer().close();
    for (let i = 0; i < 50 && acquirer().isOpen(); i++) await delay(100);
    await idle();
    return note;
  }

  // ---------- Comptes des sites > Écran du navigateur intégré ----------
  library.openSystem();
  act('Ajouter une table');
  act('Comptes des sites');
  await idle();
  await shot('comptes');
  act('Écran du navigateur intégré');
  await shot('choix-automatique');
  // Désigné aux boutons (flipper droit) : la ligne d'aperçu du playfield se surligne, de travers.
  library.handleKey({ type: 'keyDown', code: KEYS.next[0], key: '' });
  await shot('choix-playfield-designe');
  act('Retour');
  await idle();

  // Automatique : le playfield est tourné, la fenêtre va sur le fronton (le plus grand des autres).
  await openAndCheck('automatique', 'backglass');
  const choices = [
    ['Playfield', 'playfield'],
    ['Fronton', 'backglass'],
    ['DMD', 'dmd'],
    ['Topper', 'topper'],
  ];
  for (const [label, role] of choices) {
    act('Écran du navigateur intégré');
    act(label);
    await idle();
    const note = await openAndCheck(role, role);
    if ((role === 'playfield') !== /de travers/.test(note)) throw new Error(`ligne d'écran inattendue pour ${role} : ${note}`);
  }

  // La configuration redit le choix (dernier : Topper), puis on choisit le DMD et on le débranche.
  configurations.openManager();
  act('« Borne »');
  await shot('configuration');
  act('Écran du navigateur intégré');
  act('DMD');
  await shot('configuration-dmd');
  plugged = all.filter((d) => d !== all[2]);
  LOG.push('— DMD débranché —');
  library.openSystem();
  act('Ajouter une table');
  act('Comptes des sites');
  await idle();
  act('Écran du navigateur intégré');
  await shot('choix-dmd-debranche');
  act('Retour');
  await idle();
  const note = await openAndCheck('dmd-debranche', 'backglass');
  if (!/DMD n’est pas branché/.test(note)) throw new Error(`repli non dit dans le bandeau : ${note}`);

  ipcMain.removeListener('action', onAction);
  win.destroy();
  await acq.clearStorageData();
  LOG.push(`cabinet.json : browserScreen = ${core.loadCabinet(L.data).browserScreen}`);
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  // Garde-temps : une démonstration ne reste jamais bloquée ; le relevé dit où elle en était.
  setTimeout(() => {
    LOG.push('ÉCHEC : plus de trois minutes, arrêt (dernière étape ci-dessus).');
    fs.mkdirSync(CAPTURES, { recursive: true });
    fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
    console.log(LOG.join('\n'));
    app.exit(2);
  }, 180_000).unref();
  // Langue et catalogue des fenêtres (préchargement), comme language.ts dans l'application.
  ipcMain.on('i18n', (event) => {
    event.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) };
  });
  serveMedias(() => []);
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  try {
    await run(report);
  } catch (error) {
    LOG.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
  console.log(LOG.join('\n'));
  // app.quit() rendrait 0 même en échec : le script PowerShell n'y verrait rien.
  app.exit(process.exitCode ?? 0);
});
