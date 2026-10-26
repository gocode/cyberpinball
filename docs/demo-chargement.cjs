// Banc hors écran de l'écran de chargement d'une table (lancé par docs\demo-chargement.ps1) :
// la vraie page du playfield (frontend.html, son preload, le protocole des médias) reçoit
// l'état du chargement tel que viewFor (frontend.ts) l'enverrait, pour chaque cas : borne
// (média plein écran, rien d'autre ; écran debout ou couché et pivoté) et bureau (cadre 9:16
// et encart), vidéo de chargement en paysage ou en portrait, sans média (repli), titre très
// long, commandes nombreuses aux noms longs (boutons de joystick), réglage de l'affichage,
// à plusieurs tailles d'écran. Chaque cas est capturé, et le garde-fou de mise en page
// (layout-check.ts) relève chevauchements, rognures et les règles du chargement.
//   electron docs/demo-chargement.cjs <spec.json>   { "root": racine des tables (demo-moments.cjs), "out": dossier des captures }
// Fenêtres jamais montrées (show: false, rendu hors écran, son coupé).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const specFile = process.argv.find((a) => a.endsWith('.json'));
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));

const { app, BrowserWindow, ipcMain } = require('electron');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
// Le protocole cyber-media:// est déclaré au chargement du module, avant que l'application soit prête.
const { serveMedias } = require(path.join(REPO, 'app', 'dist', 'media-protocol.js'));
const { checkLayout } = require(path.join(REPO, 'app', 'dist', 'layout-check.js'));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const NEON = 'Neon Galaxy (Williams 1992)';
const ROCKET = 'Rocket Rally (Data East 1988)';
const LONG = 'Le très long titre d’une table imaginaire pour vérifier les débordements du chargement et des écrans (Stern 2020)';

// Tous les boutons sur un joystick (Pinscape, KL25Z) : les noms de touches les plus longs.
const DEVICE = `SDLJoy_${'0123456789abcdef'.repeat(2)}_0`;
const JOYSTICK = Object.fromEntries(core.BUTTONS.map((b, i) => [b.id, core.joystickCode(DEVICE, i + 1)]));

/** [nom, largeur, hauteur, rotation de la mise en page, table, options] */
const CASES = [
  // Bureau : la zone du playfield en largeur.
  ['bureau-1080p-video', 1920, 1080, 0, NEON],
  ['bureau-1080p-portrait', 1920, 1080, 0, ROCKET],
  ['bureau-1080p-sans-media-titre-long', 1920, 1080, 0, LONG],
  ['bureau-1080p-joystick', 1920, 1080, 0, NEON, { buttons: JOYSTICK }],
  ['bureau-1080p-reglage', 1920, 1080, 0, NEON, { display: true, buttons: JOYSTICK }],
  ['bureau-1366x768-joystick', 1366, 768, 0, LONG, { buttons: JOYSTICK }],
  ['bureau-1280x720', 1280, 720, 0, NEON],
  ['bureau-1280x1024-joystick', 1280, 1024, 0, LONG, { buttons: JOYSTICK }],
  ['bureau-1024x768-joystick', 1024, 768, 0, ROCKET, { buttons: JOYSTICK }],
  ['bureau-2560x1080', 2560, 1080, 0, NEON, { buttons: JOYSTICK }],
  ['bureau-4k', 3840, 2160, 0, LONG],
  // Borne : la zone du playfield en hauteur (écran debout, ou couché et la mise en page pivotée).
  ['borne-debout-video', 1080, 1920, 0, NEON],
  ['borne-debout-portrait', 1080, 1920, 0, ROCKET],
  ['borne-debout-sans-media', 1080, 1920, 0, LONG],
  ['borne-debout-reglage', 1080, 1920, 0, NEON, { display: true }],
  ['borne-pivotee-video', 3840, 2160, 90, NEON],
  ['borne-pivotee-sans-media', 3840, 2160, 90, LONG],
  ['borne-pivotee-reglage-sans-media', 3840, 2160, 90, LONG, { display: true, buttons: JOYSTICK }],
  ['borne-pivotee-270-video', 1920, 1080, 270, ROCKET],
];

function stateFor(medias, table, options = {}) {
  const loading = medias.typeMedia(table, 'playfield', 'Loading');
  const rows = options.display ? core.displayKeys(options.buttons) : core.gameKeys(options.buttons);
  return {
    role: 'playfield',
    phase: 'loading',
    help: false,
    count: 7,
    position: 3,
    table: { title: table.title, manufacturer: table.manufacturer, year: table.year, subtitle: [table.manufacturer, table.year].filter(Boolean).join(' · ') },
    neighbors: [],
    menuLayout: 'medaillons',
    medias: { playfield: medias.roleMedia(table, 'playfield') },
    preload: [],
    loading,
    footer: [],
    menuKeys: [],
    gameKeys: rows,
    loadingKeys: options.display ? { title: 'Réglage de l’affichage', rows, display: true } : { title: 'Commandes de la partie', rows, display: false },
    nav: {},
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Une fenêtre détruite après chaque cas : l'application ne doit pas s'arrêter avec elle.
app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});

app.whenReady().then(async () => {
  ipcMain.on('i18n', (e) => (e.returnValue = {}));
  ipcMain.on('ready', () => {});
  ipcMain.on('media-error', (_e, error) => console.log(`Média illisible : ${JSON.stringify(error)}`));
  const tables = core.scanTables(path.join(spec.root, 'tables'));
  const byTitle = (title) => tables.find((t) => `${t.title} (${t.manufacturer} ${t.year})` === title || t.title === title || path.basename(t.file, '.vpx') === title);
  const dataDir = path.join(spec.out, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const allowed = new Set();
  serveMedias(() => [...allowed]);
  const problems = [];
  for (const [name, width, height, rotation, title, options] of CASES) {
    const table = byTitle(title);
    if (!table) {
      problems.push(`${name} : table introuvable (${title})`);
      continue;
    }
    const medias = new core.MenuMedias({ root: spec.root, dataDir, rotation, b2s: false });
    for (const dir of medias.allowedDirs(tables)) allowed.add(dir);
    const win = new BrowserWindow({
      show: false,
      // Sans cadre, comme les fenêtres du menu : Windows ne la ramène pas à la zone de travail de l'écran du poste.
      frame: false,
      skipTaskbar: true,
      focusable: false,
      width,
      height,
      useContentSize: true,
      // Écran debout (1080 × 1920) : plus haut que l'écran du poste, la fenêtre garde sa taille.
      enableLargerThanScreen: true,
      backgroundColor: '#030807',
      webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true },
    });
    win.webContents.setAudioMuted(true);
    win.setBounds({ x: 0, y: 0, width, height });
    await win.loadFile(path.join(REPO, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: String(rotation), zones: '[]' } });
    await wait(300);
    const [w, h] = await win.webContents.executeJavaScript('[innerWidth, innerHeight]');
    if (w !== width || h !== height) problems.push(`${name} : fenêtre de ${w} × ${h} au lieu de ${width} × ${height}`);
    win.webContents.send('state', stateFor(medias, table, options));
    await wait(2200);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(spec.out, `${name}.png`), image.toPNG());
    const found = await checkLayout(win.webContents);
    const shape = await win.webContents.executeJavaScript(`[document.documentElement.className, document.querySelector('#root').innerText.replace(/\\s+/g, ' ').trim().slice(0, 160), document.querySelector('.loading-card .game-keys-list')?.dataset.columns, document.querySelector('.loading-card')?.style.getPropertyValue('--keys-scale')]`);
    // Encart du bureau : nombre de colonnes et corps des commandes retenus (fitLoadingCard).
    console.log(`${name} : ${shape[0]}${shape[2] ? ` · ${shape[2]} colonne(s) à ${shape[3]}` : ''} · texte : « ${shape[1]} »${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
    for (const p of found) problems.push(`${name} : ${p}`);
    win.destroy();
  }
  const shots = fs.readdirSync(spec.out).filter((f) => f.endsWith('.png')).length;
  if (shots !== CASES.length) problems.push(`${shots} captures pour ${CASES.length} cas`);
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), `${problems.length ? problems.join('\n') : 'Aucun problème de mise en page.'}\n`, 'utf8');
  console.log(problems.length ? `Chargement : ${problems.length} problème(s).` : 'Chargement : aucun problème de mise en page.');
  app.exit(problems.length ? 1 : 0);
});
