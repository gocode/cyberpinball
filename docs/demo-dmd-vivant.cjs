// Banc hors écran du DMD du menu vivant (lancé par docs\demo-dmd-vivant.ps1) : la vraie page
// de l'écran du DMD (frontend.html, rôle dmd, son preload, le protocole des médias) reçoit
// l'état du menu tel que frontend.ts l'enverrait (liveDmd : place des points) et les images du
// vrai programme (app/dist/live-dmd.js, packages/core/src/livedmd.ts), à une horloge arrêtée
// sur chaque page. Cas : DMD seul sur un écran 4:1, DMD seul en bande sur un écran 16:9,
// FullDMD habillé (média au cadre dessiné, les points dans le cadre), FullDMD sans média (la
// bande sur du noir), page du média, animation « chargement », menu sans table.
//   electron docs/demo-dmd-vivant.cjs <spec.json>   { "out": dossier des captures }
// Médias inventés ici (PNG dessinés point par point) ; records inventés, marqués comme tels.
// Fenêtres jamais montrées (show: false, rendu hors écran).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(process.argv.find((a) => a.endsWith('.json')), 'utf8'));

const { app, BrowserWindow, ipcMain } = require('electron');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
const { serveMedias } = require(path.join(REPO, 'app', 'dist', 'media-protocol.js'));
const { checkLayout } = require(path.join(REPO, 'app', 'dist', 'layout-check.js'));
const { LiveDmd } = require(path.join(REPO, 'app', 'dist', 'live-dmd.js'));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
// Jamais de boîte d'erreur à l'écran : l'erreur va dans la sortie, et la démonstration échoue.
for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, (error) => (console.error(error), app.exit(1)));

// ---------- Médias inventés ----------

function image(width, height, paint) {
  const data = Buffer.alloc(width * height * 4);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  };
  paint(set);
  return core.encodePng({ width, height, data });
}

/** FullDMD habillé : une illustration en dégradé en haut, un cadre doré en bas, noir dedans. */
function framedFullDmd() {
  const W = 1280;
  const H = 720;
  return image(W, H, (set) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, y < H * 0.55 ? [40 + Math.round((x / W) * 120), 20, 90 + Math.round((y / H) * 160)] : [0, 0, 0]);
    // Cadre doré de 10 px, de 5 % à 95 % de la largeur, de 58 % à 96 % de la hauteur.
    const x0 = Math.round(W * 0.05);
    const x1 = Math.round(W * 0.95);
    const y0 = Math.round(H * 0.58);
    const y1 = Math.round(H * 0.96);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x < x0 + 10 || x >= x1 - 10 || y < y0 + 10 || y >= y1 - 10) set(x, y, [214, 170, 70]);
  });
}

/** Média DMD d'une table : un damier orangé, reconnaissable sur la page du média. */
function dmdMedia() {
  return image(512, 128, (set) => {
    for (let y = 0; y < 128; y++) for (let x = 0; x < 512; x++) set(x, y, (Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? [255, 120, 20] : [60, 20, 0]);
  });
}

// ---------- Cas ----------

// Records inventés pour la démonstration (une vraie table les lit dans son VPReg.stg, highscores.ts).
const RECORDS = { file: 'démonstration', storage: 'demo', credits: 3, scores: [{ rank: 1, score: 75000000, initials: 'JUL' }, { rank: 2, score: 55000000, initials: 'CPB' }] };
const GALAXY = { title: 'Guardians of the Galaxy', manufacturer: 'Stern', year: 2017, records: RECORDS };
const TERMINATOR = { title: 'Terminator 2', manufacturer: 'Williams', year: 1991 };
const CLOCK = new Date(2026, 9, 26, 18, 42, 10, 200);

/** [nom, largeur, hauteur, zone du DMD dans l'écran, table, média, page ou animation, FullDMD] */
const BAND_16_9 = core.centeredDmdBand({ width: 1920, height: 1080 });
const FULL = { x: 0, y: 0, width: 1, height: 1 };
const CASES = [
  ['dmd-seul-4x1-titre', 1920, 480, FULL, TERMINATOR, undefined, 'title'],
  ['dmd-seul-4x1-press-start', 1920, 480, FULL, GALAXY, undefined, 'press-start'],
  ['dmd-seul-4x1-record', 1920, 480, FULL, GALAXY, undefined, 'records'],
  ['dmd-seul-4x1-horloge', 1920, 480, FULL, GALAXY, undefined, 'clock'],
  ['dmd-seul-4x1-credits', 1920, 480, FULL, GALAXY, undefined, 'credits'],
  ['dmd-seul-4x1-titre-long', 1920, 480, FULL, GALAXY, undefined, 'title', false, 3000],
  ['dmd-seul-4x1-page-media', 1920, 480, FULL, GALAXY, 'dmd', 'media'],
  ['dmd-seul-4x1-chargement', 1920, 480, FULL, GALAXY, undefined, 'chargement'],
  ['dmd-seul-bande-16x9-record', 1920, 1080, BAND_16_9, GALAXY, undefined, 'records'],
  ['fulldmd-cadre-record', 1920, 1080, FULL, GALAXY, 'fulldmd', 'records', true],
  ['fulldmd-cadre-press-start', 1920, 1080, FULL, GALAXY, 'fulldmd', 'press-start', true],
  ['fulldmd-cadre-page-media', 1920, 1080, FULL, GALAXY, 'fulldmd', 'media', true],
  ['fulldmd-sans-media-titre', 1920, 1080, FULL, TERMINATOR, undefined, 'title', true],
  ['fulldmd-sans-table', 1920, 1080, FULL, undefined, undefined, 'brand', true],
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  ipcMain.on('i18n', (e) => (e.returnValue = {}));
  ipcMain.on('ready', () => {});
  ipcMain.on('media-error', (_e, error) => console.log(`Média illisible : ${JSON.stringify(error)}`));
  const mediaDir = path.join(spec.out, 'medias');
  fs.mkdirSync(mediaDir, { recursive: true });
  const files = { fulldmd: path.join(mediaDir, 'fulldmd-cadre.png'), dmd: path.join(mediaDir, 'dmd.png') };
  fs.writeFileSync(files.fulldmd, framedFullDmd());
  fs.writeFileSync(files.dmd, dmdMedia());
  serveMedias(() => [mediaDir]);
  const problems = [];
  const report = [];
  for (const [name, width, height, zone, table, media, page, fullDmd, at = 0] of CASES) {
    const win = new BrowserWindow({
      show: false,
      frame: false,
      skipTaskbar: true,
      focusable: false,
      width,
      height,
      useContentSize: true,
      enableLargerThanScreen: true,
      backgroundColor: '#000000',
      webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true },
    });
    win.setBounds({ x: 0, y: 0, width, height });
    await win.loadFile(path.join(REPO, 'app', 'renderer', 'frontend.html'), { query: { role: 'dmd', rotation: '0', zones: JSON.stringify([{ role: 'dmd', zone }]) } });
    await wait(300);
    const file = media && files[media];
    const view = file
      ? { role: 'dmd', type: fullDmd ? 'FullDMD' : 'DMD', source: 'table', url: core.mediaUrl(file), kind: 'image', fit: 'contain', rotation: 0, card: { title: table?.title } }
      : table
        ? { role: 'dmd', type: fullDmd ? 'FullDMD' : 'DMD', source: 'fallback', fallback: 'dmd-dots', fit: 'contain', rotation: 0, card: { title: table.title, manufacturer: table.manufacturer, year: table.year } }
        : undefined;
    // Place des points, comme liveDmdView (frontend.ts) : dans le cadre du média FullDMD s'il en a un.
    const record = fullDmd && file ? core.pngFrame(file) : undefined;
    const zonePx = { width: zone.width * width, height: zone.height * height };
    const liveDmd = { area: core.liveDmdArea(record?.frame ? record : undefined, zonePx), framed: Boolean(record?.frame) };
    win.webContents.send('state', { role: 'dmd', phase: 'menu', help: false, medias: { dmd: view }, preload: [], liveDmd });
    // Le vrai programme, à une horloge arrêtée au milieu de la page voulue.
    let now = 0;
    const dmd = new LiveDmd({ now: () => now, send: (shot) => !win.isDestroyed() && win.webContents.send('dmd', shot) });
    const input = table && { ...table, hasMedia: Boolean(file), now: () => CLOCK };
    // Le programme part à 0 (show, puis resume qui repart du titre) ; l'horloge avance ensuite jusqu'à la page voulue.
    dmd.show(name, input);
    dmd.resume();
    // Points attendus à cet instant : la capture doit montrer la page demandée, pas une autre.
    let expected;
    if (page === 'chargement') {
      dmd.play('chargement');
      now = 500;
      expected = core.dmdAnimation('chargement').dots(500);
    } else {
      const program = new core.LiveDmdProgram(core.liveDmdPages(input));
      const index = program.pages.findIndex((p) => p.id === page);
      if (index < 0) problems.push(`${name} : pas de page « ${page} » dans le programme`);
      now = program.startOf(index) + (at || Math.min(300, program.pages[index].hold / 2));
      expected = program.at(now).dots;
    }
    dmd.resend();
    await wait(1500);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(spec.out, `${name}.png`), image.toPNG());
    const etat = await win.webContents.executeJavaScript('JSON.stringify(window.cyberEtat())');
    const shown = JSON.parse(etat);
    const found = await checkLayout(win.webContents);
    report.push(`${name} : DMD ${JSON.stringify(shown.dmd)} · couche ${JSON.stringify(shown.couches?.[0])}${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
    for (const p of found) problems.push(`${name} : ${p}`);
    // Ce que chaque cas doit montrer : des points (ou le média sur sa page), dans le cadre pour un FullDMD habillé.
    const wantMedia = page === 'media';
    if (!shown.dmd) problems.push(`${name} : pas d'afficheur à points`);
    else {
      if (shown.dmd.visible === wantMedia) problems.push(`${name} : afficheur ${shown.dmd.visible ? 'visible' : 'caché'} sur la page ${page}`);
      if (!wantMedia && !shown.dmd.points) problems.push(`${name} : aucun point allumé`);
      const want = expected ? expected.filter((v) => v > 0).length : 0;
      if (!wantMedia && shown.dmd.points !== want) problems.push(`${name} : ${shown.dmd.points} points allumés au lieu de ${want} (une autre page que « ${page} »)`);
      if (shown.dmd.cadre !== Boolean(record?.frame)) problems.push(`${name} : cadre du FullDMD ${shown.dmd.cadre ? 'pris' : 'ignoré'} à tort`);
    }
    dmd.dispose();
    win.destroy();
  }
  fs.writeFileSync(path.join(spec.out, 'releve.txt'), `${report.join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), `${problems.length ? problems.join('\n') : 'Aucun problème.'}\n`, 'utf8');
  console.log(report.join('\n'));
  console.log(problems.length ? `DMD vivant : ${problems.length} problème(s).\n${problems.join('\n')}` : 'DMD vivant : aucun problème.');
  app.exit(problems.length ? 1 : 0);
});
