// Banc hors écran de la couleur de chaque table (lancé par docs\demo-couleur-table.ps1) : la vraie
// page du playfield et celle du fronton (frontend.html, son preload, le protocole des médias)
// reçoivent l'état du menu des tables tel que viewFor (frontend.ts) l'enverrait, pour des tables
// inventées aux frontons très différents (docs\demo-captures-medias) : cuivre et ciel bleu, vague
// turquoise et jaune, rose et menthe, abysses bleus et magenta, et une table sans fronton, dont le
// repli prend la couleur tirée de son plateau. La teinte est mesurée comme au menu : convertisseur
// hors écran (app/src/media-convert.ts), puis packages/core/src/tabletint.ts.
//
// Pour chaque table : la borne (playfield debout, et le fronton sur son écran), le bureau (le
// fronton en fond, à côté du plateau) et le playfield couché, la mise en page pivotée ; puis la
// même table sans la couleur (réglage coupé), pour comparer. Vérifié à chaque capture :
//   - le garde-fou de mise en page (layout-check.ts) reste muet ;
//   - les zones fixes du menu (data-stable) sont au même endroit avec et sans la couleur : rien
//     ne bouge dans la mise en page ;
//   - le vert signal reste sur la sélection : l'anneau de la roue garde sa couleur ;
//   - au milieu du fondu (140 ms), la teinte est entre les deux tables (fondu, pas de saut).
// Captures, planches et relevé (couleurs.txt, mise-en-page.txt) dans le dossier « out ».
//   electron docs/demo-couleur-table.cjs <spec.json>   { "out": dossier, "only": cas (facultatif), "css": feuille ajoutée (maquette) }
// Fenêtres jamais montrées (show: false, rendu hors écran, son coupé).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const specFile = process.argv.find((a) => a.endsWith('.json'));
// Set-Content -Encoding UTF8 de Windows PowerShell 5.1 écrit un BOM : JSON.parse le refuserait.
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8').replace(/^﻿/, ''));

const { app, BrowserWindow, ipcMain } = require('electron');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
// Le protocole cyber-media:// est déclaré au chargement du module, avant que l'application soit prête.
const { serveMedias } = require(path.join(REPO, 'app', 'dist', 'media-protocol.js'));
const { checkLayout } = require(path.join(REPO, 'app', 'dist', 'layout-check.js'));
const { createConverter } = require(path.join(REPO, 'app', 'dist', 'media-convert.js'));
const { LiveDmd } = require(path.join(REPO, 'app', 'dist', 'live-dmd.js'));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setPath('userData', path.join(spec.out, '..', 'profil-couleur-table'));

const ARTWORK = path.join(REPO, 'docs', 'demo-captures-medias');
/** Tables inventées ; Midnight Circuit n'a pas de fronton : son écran montre le repli. */
const TABLES = [
  { title: 'Copper Comet', manufacturer: 'Meridian', year: '1983', slug: 'copper-comet' },
  { title: 'Thunder Reef', manufacturer: 'Gulfstream', year: '1991', slug: 'thunder-reef' },
  { title: 'Lunar Diner', manufacturer: 'Halcyon', year: '1964', slug: 'lunar-diner' },
  { title: 'Neon Abyss', manufacturer: 'Orbital Works', year: '1994', slug: 'neon-abyss' },
  { title: 'Midnight Circuit', manufacturer: 'Voltage Games', year: '1998', slug: 'midnight-circuit', noBackglass: true },
];

/** [nom, largeur, hauteur, rotation de la mise en page, présentation] */
const SCREENS = [
  ['borne', 1080, 1920, 0, 'medaillons'],
  ['bureau', 1920, 1080, 0, 'medaillons'],
  ['pivote', 3840, 2160, 90, 'bandeau'],
];

const file = (t, kind) => path.join(ARTWORK, `${t.slug}-${kind}.jpg`);
const card = (t) => ({ title: t.title, manufacturer: t.manufacturer, year: t.year });

function backglassView(t) {
  if (t.noBackglass) return { role: 'backglass', type: 'Backglass', source: 'fallback', fallback: 'backglass-card', fit: 'contain', rotation: 0, card: card(t) };
  return { role: 'backglass', type: 'Backglass', source: 'file', url: core.mediaUrl(file(t, 'backglass')), kind: 'image', fit: 'contain', rotation: 0, card: card(t) };
}

function playfieldView(t, rotation) {
  return { role: 'playfield', type: 'Playfield', source: 'file', url: core.mediaUrl(file(t, 'playfield')), kind: 'image', fit: 'cover', rotation, card: card(t) };
}

function stateFor(role, index, layout, rotation, tint, dmdColor = '#8be23a') {
  const at = (i) => TABLES[(i + TABLES.length * 10) % TABLES.length];
  const t = at(index);
  const neighbor = (offset) => {
    const n = at(index + offset);
    return { offset, key: `${n.slug}.vpx`, title: n.title, manufacturer: n.manufacturer, year: n.year };
  };
  return {
    role,
    phase: 'menu',
    help: false,
    count: TABLES.length,
    position: index + 1,
    table: { ...card(t), subtitle: `${t.manufacturer} · ${t.year}` },
    neighbors: [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(neighbor),
    menuLayout: layout,
    dmdColor,
    tint: tint?.color,
    medias: role === 'playfield' ? { playfield: playfieldView(t, rotation) } : role === 'dmd' ? { dmd: { role: 'dmd', type: 'DMD', source: 'fallback', fallback: 'dmd-dots', fit: 'contain', rotation: 0, card: card(t) } } : { backglass: backglassView(t) },
    // DMD vivant sur toute la zone (bande 4:1) : les points viennent de LiveDmd, canal « dmd ».
    liveDmd: role === 'dmd' ? { area: { x: 0, y: 0, width: 1, height: 1 }, framed: false } : undefined,
    backglass: role === 'playfield' && !t.noBackglass ? backglassView(t) : undefined,
    preload: [],
    footer: [['Flippers : choisir'], ['Start : fiche', 'Enter'], ['Exit : menu', 'Escape']],
    menuKeys: [],
    gameKeys: [],
    nav: {},
  };
}

/** Dans la page : zones fixes du menu, teinte posée, couleur de l'anneau de la sélection. */
const PROBE = String.raw`(() => {
  const html = document.documentElement;
  const stable = Object.fromEntries([...document.querySelectorAll('[data-stable]')].map((n) => {
    const r = n.getBoundingClientRect();
    return [n.dataset.stable, [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(',')];
  }));
  const ring = document.querySelector('.wheel-ring');
  return {
    stable,
    tint: getComputedStyle(html).getPropertyValue('--table-tint').trim(),
    ring: ring ? getComputedStyle(ring).borderTopColor : undefined,
  };
})()`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** « #8be23a » → « rgb(139, 226, 58) », comme la page rend une couleur calculée. */
const rgb = (hex) => (hex ? `rgb(${core.hexToRgb(hex).join(', ')})` : undefined);

app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});

async function windowFor(role, width, height, rotation, zones) {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    width,
    height,
    useContentSize: true,
    enableLargerThanScreen: true,
    backgroundColor: '#030807',
    webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.webContents.setAudioMuted(true);
  win.setBounds({ x: 0, y: 0, width, height });
  await win.loadFile(path.join(REPO, 'app', 'renderer', 'frontend.html'), { query: { role, rotation: String(rotation), zones: JSON.stringify(zones) } });
  if (spec.css) await win.webContents.insertCSS(fs.readFileSync(spec.css, 'utf8'));
  await wait(300);
  return win;
}

/** Planche : les captures d'une liste, côte à côte, réduites à `height` de haut. */
async function board(name, files, height) {
  const page = path.join(spec.out, `${name}.html`);
  const imgs = files.map((f) => `<img src="${path.basename(f)}" style="height:${height}px;display:block">`).join('');
  fs.writeFileSync(page, `<!doctype html><body style="margin:0;background:#000;display:flex;gap:12px;padding:12px;width:max-content">${imgs}</body>`);
  const win = new BrowserWindow({ show: false, width: 400, height: 300, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  await win.loadFile(page);
  await wait(400);
  const [w, h] = await win.webContents.executeJavaScript('[document.body.scrollWidth, document.body.scrollHeight]');
  win.setContentSize(w, h);
  await wait(400);
  fs.writeFileSync(path.join(spec.out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  win.destroy();
  fs.rmSync(page);
}

app.whenReady().then(async () => {
  ipcMain.on('i18n', (e) => (e.returnValue = {}));
  ipcMain.on('ready', () => {});
  ipcMain.on('key-handled', (e) => (e.returnValue = false));
  serveMedias(() => [ARTWORK]);
  fs.mkdirSync(spec.out, { recursive: true });
  const problems = [];
  const report = [];

  // Teinte de chaque table, comme au menu : fronton d'abord, sinon plateau.
  const converter = createConverter();
  const tints = [];
  for (const t of TABLES) {
    let found;
    for (const kind of t.noBackglass ? ['playfield'] : ['backglass', 'playfield']) {
      const got = await converter.mediaFrames(file(t, kind), [0], 64);
      const result = core.tableTint(got.images);
      report.push(`${t.title} (${kind}) : ${typeof result === 'string' ? `aucune teinte (${result})` : `${result.color} · DMD ${result.dmd} · teinte ${result.hue}° (mesurée ${result.measured}°)`}`);
      if (typeof result !== 'string') {
        found = result;
        break;
      }
    }
    tints.push(found);
  }

  for (const [screen, width, height, rotation, layout] of SCREENS) {
    if (spec.only && !new RegExp(spec.only).test(screen)) continue;
    const pf = await windowFor('playfield', width, height, rotation, []);
    const bg = screen === 'borne' ? await windowFor('backglass', 1920, 1080, 0, [{ role: 'backglass', zone: { x: 0, y: 0, width: 1, height: 1 } }]) : undefined;
    // DMD du menu, réglé sur « Couleur de la table » : ses points prennent la teinte DMD de la table.
    const dmd = screen === 'borne' ? await windowFor('dmd', 1024, 256, 0, [{ role: 'dmd', zone: { x: 0, y: 0, width: 1, height: 1 } }]) : undefined;
    const live = dmd ? new LiveDmd({ send: (shot) => dmd.webContents.send('dmd', shot) }) : undefined;
    const shots = [];
    // Premier état : les médias de la première table se chargent avant la première capture.
    pf.webContents.send('state', stateFor('playfield', 0, layout, rotation, tints[0]));
    bg?.webContents.send('state', stateFor('backglass', 0, layout, rotation, tints[0]));
    await wait(1500);
    for (let i = 0; i < TABLES.length; i++) {
      const t = TABLES[i];
      for (const tinted of [true, false]) {
        const tint = tinted ? tints[i] : undefined;
        pf.webContents.send('state', stateFor('playfield', i, layout, rotation, tint));
        bg?.webContents.send('state', stateFor('backglass', i, layout, rotation, tint));
        if (dmd && tinted) {
          dmd.webContents.send('state', stateFor('dmd', i, layout, rotation, tint, tint?.dmd ?? '#8be23a'));
          live.show(t.slug, { title: t.title, manufacturer: t.manufacturer, year: Number(t.year), hasMedia: false });
          live.resume();
        }
        await wait(1100);
        if (dmd && tinted) {
          fs.writeFileSync(path.join(spec.out, `borne-${t.slug}-dmd.png`), (await dmd.webContents.capturePage()).toPNG());
          live.pause();
        }
        const probe = await pf.webContents.executeJavaScript(PROBE);
        const found = await checkLayout(pf.webContents);
        for (const p of found) problems.push(`${screen} ${t.slug}${tinted ? '' : ' sans couleur'} : ${p}`);
        const name = `${screen}-${t.slug}${tinted ? '' : '-neutre'}`;
        const png = path.join(spec.out, `${name}.png`);
        fs.writeFileSync(png, (await pf.webContents.capturePage()).toPNG());
        if (bg) fs.writeFileSync(path.join(spec.out, `${name}-fronton.png`), (await bg.webContents.capturePage()).toPNG());
        if (tinted) shots.push(png);
        report.push(`${name} : teinte posée ${probe.tint || '(aucune)'} ; anneau ${probe.ring ?? '(pas d’anneau)'}`);
        if (probe.ring && !/139, 226, 58/.test(probe.ring)) problems.push(`${name} : l'anneau de la sélection n'est plus au vert signal (${probe.ring})`);
        (tinted ? (t.stableOn = probe.stable) : (t.stableOff = probe.stable));
      }
      if (JSON.stringify(t.stableOn) !== JSON.stringify(t.stableOff)) problems.push(`${screen} ${t.slug} : les zones du menu bougent avec la couleur (${JSON.stringify(t.stableOn)} / ${JSON.stringify(t.stableOff)})`);
    }
    // Fondu : de la première table à la deuxième, relevé au milieu.
    pf.webContents.send('state', stateFor('playfield', 0, layout, rotation, tints[0]));
    await wait(900);
    pf.webContents.send('state', stateFor('playfield', 1, layout, rotation, tints[1]));
    await wait(140);
    const mid = (await pf.webContents.executeJavaScript(PROBE)).tint;
    report.push(`${screen} fondu ${tints[0]?.color} → ${tints[1]?.color} : à 140 ms, ${mid}`);
    if (!mid || mid === rgb(tints[0]?.color) || mid === rgb(tints[1]?.color)) problems.push(`${screen} : pas de fondu de la teinte (${mid} à 140 ms)`);
    await board(`planche-${screen}`, shots, screen === 'pivote' ? 540 : screen === 'bureau' ? 540 : 960);
    if (bg) await board('planche-borne-fronton', TABLES.map((t) => path.join(spec.out, `borne-${t.slug}-fronton.png`)), 300);
    if (dmd) await board('planche-borne-dmd', TABLES.map((t) => path.join(spec.out, `borne-${t.slug}-dmd.png`)), 128);
    live?.dispose();
    pf.destroy();
    bg?.destroy();
    dmd?.destroy();
  }
  fs.writeFileSync(path.join(spec.out, 'couleurs.txt'), `${report.join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), `${problems.length ? problems.join('\n') : 'Aucun problème.'}\n`, 'utf8');
  console.log(report.join('\n'));
  console.log(problems.length ? `Couleur de chaque table : ${problems.length} problème(s).\n${problems.join('\n')}` : 'Couleur de chaque table : aucun problème.');
  app.exit(problems.length ? 1 : 0);
});
