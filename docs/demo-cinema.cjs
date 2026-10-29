// Banc hors écran du lancement en cinéma (lancé par docs\demo-cinema.ps1). Les vraies pages des
// fenêtres du menu (frontend.html, son preload, le protocole des médias) reçoivent l'état du
// chargement avec la part de chaque fenêtre (s.cinema), tel que viewFor (frontend.ts) l'envoie,
// posée à un instant donné depuis le Start ; leurs animations sont figées à cet instant
// (document.getAnimations, currentTime 0 : l'heure de la pose) et chaque écran est capturé. Le DMD
// reçoit l'image du vrai moteur (dmdAnimation('lancement')) au même instant. Le passage de relais :
// l'état de la partie, et le fondu figé à +120 ms. Les écrans d'un même instant sont assemblés en
// une planche (borne : fronton, DMD, plateau ; bureau : l'écran du bureau et le fronton).
//   electron docs/demo-cinema.cjs <spec.json>   { "root": racine des tables (demo-moments.cjs), "out": dossier des captures, "montages": [noms, facultatif] }
// Contrôles : garde-fou de mise en page (layout-check.ts) ; chaque fenêtre montre sa scène (départ,
// arrivée) ou aucune ; aucune couche du cinéma n'a de fond clair. Fenêtres jamais montrées
// (show: false, rendu hors écran, son coupé).

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
const LONG = 'Le très long titre d’une table imaginaire pour vérifier les débordements du chargement et des écrans (Stern 2020)';
const FULL = { x: 0, y: 0, width: 1, height: 1 };
/** Fin d'une liste d'instants : le passage de relais, le fondu figé à +120 ms. */
const RELAIS = 'relais';

/**
 * Montages : fenêtres (rôle, taille, rotation du plateau, zones), table lancée, instants (ms
 * depuis le Start). Borne : plateau debout, fronton et DMD sur leurs écrans ; plateau couché et
 * tourné ; bureau : plateau dans la fenêtre 16:9, fronton sur un second écran ; replis.
 */
const SETUPS = [
  {
    name: 'borne',
    table: NEON,
    windows: [
      { role: 'backglass', width: 1920, height: 1080, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'dmd', width: 1920, height: 480, zones: [{ role: 'dmd', zone: FULL }] },
      { role: 'playfield', width: 1080, height: 1920 },
    ],
    times: [120, 300, 520, 700, 1000, 1300, 3000, RELAIS],
  },
  {
    name: 'borne-sans-logo',
    table: LONG,
    windows: [
      { role: 'backglass', width: 1920, height: 1080, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'dmd', width: 1920, height: 480, zones: [{ role: 'dmd', zone: FULL }] },
      { role: 'playfield', width: 1080, height: 1920 },
    ],
    times: [520, 3000],
  },
  {
    name: 'borne-pivotee',
    table: NEON,
    windows: [{ role: 'playfield', width: 3840, height: 2160, rotation: 90 }],
    times: [120, 520],
  },
  {
    name: 'bureau',
    table: NEON,
    windows: [
      { role: 'backglass', width: 1366, height: 768, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'playfield', width: 1920, height: 1080 },
    ],
    times: [120, 520, 1300, 3000, RELAIS],
  },
  {
    name: 'bureau-sans-fronton',
    table: NEON,
    windows: [{ role: 'playfield', width: 1920, height: 1080 }],
    times: [520, 3000],
  },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Une fenêtre détruite après chaque montage : l'application ne doit pas s'arrêter avec elle.
app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});

/** Capture d'une fenêtre hors écran ; une capture refusée (UnknownVizError) se refait après une image. */
async function capture(win) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await win.webContents.capturePage();
    } catch (error) {
      if (attempt >= 3) throw error;
      win.webContents.invalidate();
      await wait(250);
    }
  }
}

/** État d'une fenêtre au chargement, comme viewFor (frontend.ts). */
function stateFor(role, roles, medias, table, cinema) {
  const describe = { title: table.title, manufacturer: table.manufacturer, year: table.year, subtitle: [table.manufacturer, table.year].filter(Boolean).join(' · ') };
  return {
    role,
    phase: 'loading',
    help: false,
    count: 7,
    position: 3,
    table: describe,
    neighbors: [],
    menuLayout: 'medaillons',
    medias: Object.fromEntries(roles.map((r) => [r, medias.roleMedia(table, r)])),
    preload: [],
    cinema,
    loading: role === 'playfield' ? medias.typeMedia(table, 'playfield', 'Loading') : undefined,
    liveDmd: roles.includes('dmd') ? { area: core.liveDmdArea(undefined, { width: 1920, height: 480 }), framed: false } : undefined,
    footer: [],
    menuKeys: [],
    gameKeys: core.gameKeys(undefined),
    loadingKeys: { title: 'Commandes de la partie', rows: core.gameKeys(undefined), display: false },
    nav: {},
  };
}

/** L'état de la partie : VPX a paru (fond de partie figé). */
function gameFor(state, roles, medias, table) {
  return {
    ...state,
    phase: 'playing',
    cinema: undefined,
    game: { role: state.role, table: state.table, file: table.file, mode: 'still', medias: state.medias, play: Object.fromEntries(roles.map((r) => [r, 'still'])) },
  };
}

/** Fige les animations de la page à l'heure de leur pose ; le fondu du relais à +`fade` ms. */
const FREEZE = (fade) => `(() => {
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = a.animationName === 'cine-fin' ? ${fade} : 0;
  }
  // Aucune couche du cinéma n'a de fond clair (règle « jamais d'écran clair »).
  const light = [];
  for (const el of document.querySelectorAll('.cinema, .cinema *')) {
    const c = getComputedStyle(el).backgroundColor.match(/[\\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    const alpha = c.length > 3 ? c[3] : 1;
    const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    if (alpha > 0.05 && lum > 0.3) light.push(el.className);
  }
  return { light, etat: window.cyberEtat().cinema, elapsed: document.querySelector('.cinema')?.style.getPropertyValue('--cine-elapsed') };
})()`;

/** Planche d'un instant : les captures (fichiers du dossier de sortie) posées comme sur la borne, ou comme au bureau. */
async function sheet(name, title, files) {
  const img = (role, style) => (files[role] ? `<figure style="${style}"><img src="${encodeURI(files[role])}"><figcaption>${role}</figcaption></figure>` : '');
  const borne = name.startsWith('borne') && !name.includes('pivotee');
  const width = borne ? 1300 : 1240;
  const height = borne ? 1780 : name.includes('pivotee') ? 800 : 1150;
  const body = borne
    ? img('backglass', 'left:250px;top:80px;width:800px') + img('dmd', 'left:250px;top:550px;width:800px') + img('playfield', 'left:369px;top:770px;width:562px')
    : name.includes('pivotee')
      ? img('playfield', 'left:20px;top:80px;width:1200px')
      : img('backglass', 'left:320px;top:80px;width:600px') + img('playfield', 'left:20px;top:440px;width:1200px');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #010302; color: #e6f0ec; font: 600 26px Segoe UI, sans-serif; }
    h1 { position: absolute; left: 20px; top: 14px; margin: 0; font-size: 30px; }
    figure { position: absolute; margin: 0; } figure img { width: 100%; display: block; box-shadow: 0 0 0 2px #24504a; }
    figcaption { position: absolute; left: 6px; top: 4px; font-size: 14px; letter-spacing: .12em; color: #9bada7; background: rgba(0,0,0,.6); padding: 1px 6px; text-transform: uppercase; }
  </style><h1>${title}</h1>${body}`;
  const win = new BrowserWindow({ show: false, frame: false, width, height, useContentSize: true, enableLargerThanScreen: true, backgroundColor: '#010302', webPreferences: { offscreen: true } });
  win.setBounds({ x: 0, y: 0, width, height });
  const page = path.join(spec.out, 'planche.html');
  fs.writeFileSync(page, html, 'utf8');
  await win.loadFile(page);
  await wait(400);
  const image = await capture(win);
  win.destroy();
  fs.rmSync(page, { force: true });
  return image;
}

app.whenReady().then(async () => {
  ipcMain.on('i18n', (e) => (e.returnValue = {}));
  ipcMain.on('ready', () => {});
  ipcMain.on('media-error', (_e, error) => console.log(`Média illisible : ${JSON.stringify(error)}`));
  const tables = core.scanTables(path.join(spec.root, 'tables'));
  const byTitle = (title) => tables.find((t) => `${t.title} (${t.manufacturer} ${t.year})` === title || path.basename(t.file, '.vpx') === title);
  const dataDir = path.join(spec.out, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const allowed = new Set();
  serveMedias(() => [...allowed]);
  const problems = [];
  let launch = 0;
  for (const setup of SETUPS.filter((s) => !spec.montages?.length || spec.montages.includes(s.name))) {
    const table = byTitle(setup.table);
    if (!table) {
      problems.push(`${setup.name} : table introuvable (${setup.table})`);
      continue;
    }
    const playfield = setup.windows.find((w) => w.role === 'playfield');
    const medias = new core.MenuMedias({ root: spec.root, dataDir, rotation: playfield?.rotation ?? 0, b2s: false });
    for (const dir of medias.allowedDirs(tables)) allowed.add(dir);
    const hasBackglass = setup.windows.some((w) => (w.zones ?? []).some((z) => z.role === 'backglass'));
    for (const at of setup.times) {
      launch++;
      const relay = at === RELAIS;
      const T = relay ? 3000 : at;
      const files = {};
      for (const w of setup.windows) {
        const roles = [...(w.role === 'playfield' ? ['playfield'] : []), ...(w.zones ?? []).map((z) => z.role)];
        const win = new BrowserWindow({
          show: false,
          frame: false,
          skipTaskbar: true,
          focusable: false,
          width: w.width,
          height: w.height,
          useContentSize: true,
          enableLargerThanScreen: true,
          backgroundColor: '#030807',
          webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true },
        });
        win.webContents.setAudioMuted(true);
        win.setBounds({ x: 0, y: 0, width: w.width, height: w.height });
        await win.loadFile(path.join(REPO, 'app', 'renderer', 'frontend.html'), { query: { role: w.role, rotation: String(w.rotation ?? 0), zones: JSON.stringify(w.zones ?? []) } });
        // Les médias de la table se chargent d'abord (vidéo de chargement, fronton) ; puis la chorégraphie, à l'instant voulu.
        win.webContents.send('state', stateFor(w.role, roles, medias, table, undefined));
        await wait(1200);
        const cinema = { title: table.title, manufacturer: table.manufacturer, year: table.year, logo: medias.wheel(table), id: launch, startedAt: Date.now() - T, depart: w.role === 'playfield', arrivee: roles.includes('backglass') };
        const state = stateFor(w.role, roles, medias, table, cinema.depart || cinema.arrivee ? cinema : undefined);
        win.webContents.send('state', state);
        if (roles.includes('dmd')) win.webContents.send('dmd', { media: false, dots: core.dmdAnimation('lancement', { label: table.title }).dots(T) });
        if (relay) {
          await wait(50);
          // La page retire la couche quand son fondu est fini (minuteur de 240 ms) : à figer aussi, le temps de la capture.
          await win.webContents.executeJavaScript('window.setTimeout = () => 0; true');
          win.webContents.send('state', gameFor(state, roles, medias, table));
        }
        await wait(50);
        const seen = await win.webContents.executeJavaScript(FREEZE(120));
        await wait(300);
        const shot = await capture(win);
        const where = `${setup.name} ${relay ? 'relais' : `${T} ms`} ${w.role}`;
        // Ce que montre la fenêtre : sa scène, ou rien ; au relais, la scène qui s'efface.
        const want = relay ? (cinema.depart || cinema.arrivee ? 'fin' : '') : [cinema.depart && 'depart', cinema.arrivee && 'arrivee'].filter(Boolean).join(',');
        const got = relay ? (seen.etat.length && seen.etat.every((s) => s.fin) ? 'fin' : seen.etat.length ? 'sans fondu' : '') : seen.etat.map((s) => s.scene).join(',');
        if (got !== want) problems.push(`${where} : scène ${got || 'aucune'} au lieu de ${want || 'aucune'}`);
        const face = seen.etat[0]?.visage;
        if (face && face !== (cinema.logo ? 'logo' : 'médaillon')) problems.push(`${where} : ${face} au lieu du ${cinema.logo ? 'logo' : 'médaillon'}`);
        if (seen.light.length) problems.push(`${where} : fond clair dans le cinéma (${seen.light.join(', ')})`);
        const found = await checkLayout(win.webContents);
        for (const p of found) problems.push(`${where} : ${p}`);
        files[w.role] = `${setup.name}-${relay ? 'relais' : String(T).padStart(4, '0')}-${w.role}.png`;
        fs.writeFileSync(path.join(spec.out, files[w.role]), shot.toPNG());
        console.log(`${where} : ${got || 'aucune scène'}${face ? ` (${face})` : ''}, posée à ${seen.elapsed || '-'} ms${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
        win.destroy();
      }
      const label = relay ? 'VPX prend la main (+120 ms) : coup de bobine, fondu' : `${T} ms depuis le Start`;
      const title = `${setup.name} · ${label}${hasBackglass ? '' : ' · sans fronton'}${medias.wheel(table) ? '' : ' · sans logo'}`;
      fs.writeFileSync(path.join(spec.out, `planche-${setup.name}-${relay ? 'relais' : String(T).padStart(4, '0')}.png`), (await sheet(setup.name, title, files)).toPNG());
    }
  }
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), `${problems.length ? problems.join('\n') : 'Aucun problème.'}\n`, 'utf8');
  console.log(problems.length ? `Cinéma : ${problems.length} problème(s).` : 'Cinéma : chaque écran montre sa part, aucun problème de mise en page.');
  app.exit(problems.length ? 1 : 0);
});
