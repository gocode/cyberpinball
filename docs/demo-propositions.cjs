// Démonstration hors écran des propositions de chaque média et de la recherche
// approfondie, avec le vrai VPinMediaDB et la vraie base VPS (connexion à Internet
// nécessaire), dans un bac à sable (tmp\demo-propositions). Aucune fenêtre
// n'apparaît : rendu hors écran (show: false, offscreen: true), lancé par
// docs\demo-propositions.ps1 sur le bureau caché. Captures, relevé (resultat.txt) et
// contrôle de la mise en page dans tmp\demo-propositions\captures.
//   npm run build
//   .\docs\demo-propositions.ps1
// La table du bac à sable est le cas qui échouait : « GOTG_2.1.1.vpx », titre traduit
// en « Gardiens de la galaxie », sans identifiant VPS. Le .vpx porte son nom
// d'origine dans TableInfo (comme la vraie table), le script déclare son PuP-Pack, et
// le pack a son fronton dans screens.pup, ses fonds et sa musique dans triggers.pup, un
// cadre dans PupImages ; le .vpx range aussi son plateau, sa carte de règles, le
// fronton et le logo de sa pièce VR (GameStg). Parcours : plan automatique (« Quel jeu
// est-ce ? » et ses raisons), propositions du fronton, choix d'une autre version,
// jeux retenus, recherche d'un titre au clavier, musique, plateau, règles, logo,
// afficheur large, fronton tout allumé du .directb2s (sa copie au nom du site écartée,
// un autre .directb2s proposé), plan d'enregistrement, provenance dans le .info.

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-propositions');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { directb2s, vpxGameData, vpxImage, vpxWithInfo } = require('./demo-fichiers.cjs');
// Protocole des médias (cyber-media:), déclaré avant que l'application soit prête : sans lui, aucun aperçu ne s'affiche.
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
let servedDirs = () => [];

const FOLDER = 'GOTG_2.1.1';
/** Vrai PuP-Pack de la borne, s'il est là : ses vidéos et musiques rendent les aperçus réalistes. */
const REAL_PACK = 'D:\\CyberPinball\\tables\\GOTG_2.1.1\\pupvideos\\gotg_2020';

const SCENARIOS = [
  { name: 'paysage', width: 1920, height: 1080, rotation: 0 },
  { name: 'portrait', width: 1080, height: 1920, rotation: 0 },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}

function put(file, data = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

/** Image dessinée hors écran (fronton du PuP-Pack). */
async function drawing(width, height, text, color) {
  const win = offscreen(400, 300);
  await win.loadURL(`data:text/html;charset=utf-8,<canvas id="c" width="${width}" height="${height}"></canvas>`);
  const data = await win.webContents.executeJavaScript(`(() => { const c = document.getElementById('c'); const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, ${width}, ${height}); grad.addColorStop(0, '${color}'); grad.addColorStop(1, '#0b1020');
    g.fillStyle = grad; g.fillRect(0, 0, ${width}, ${height});
    g.fillStyle = '#fff'; g.font = 'bold ${Math.round(height / 6)}px Segoe UI';
    const fit = Math.min(1, ${width * 0.9} / g.measureText(${JSON.stringify(text)}).width);
    g.font = 'bold ' + Math.floor(${height / 6} * fit) + 'px Segoe UI'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(${JSON.stringify(text)}, ${width / 2}, ${height / 2});
    return c.toDataURL('image/png'); })()`);
  win.destroy();
  return Buffer.from(data.split(',')[1], 'base64');
}

/** Lueur ronde sur fond transparent (morceau d'image allumée d'un flasher du .directb2s). */
async function glow(size, color) {
  const win = offscreen(400, 300);
  await win.loadURL(`data:text/html;charset=utf-8,<canvas id="c" width="${size}" height="${size}"></canvas>`);
  const data = await win.webContents.executeJavaScript(`(() => { const c = document.getElementById('c'); const g = c.getContext('2d');
    const grad = g.createRadialGradient(${size / 2}, ${size / 2}, 0, ${size / 2}, ${size / 2}, ${size / 2});
    grad.addColorStop(0, '${color}'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, ${size}, ${size}); return c.toDataURL('image/png'); })()`);
  win.destroy();
  return Buffer.from(data.split(',')[1], 'base64');
}

async function sandbox(name, shared) {
  const root = path.join(BASE, name, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads]) fs.mkdirSync(d, { recursive: true });
  // Index de VPinMediaDB et base VPS : ceux de la borne s'ils sont là, sinon téléchargés au premier passage.
  for (const dir of [shared, 'D:\\CyberPinball\\downloads'].filter(Boolean)) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (/^(vpinmdb|vpsdb)/.test(f) && !fs.existsSync(path.join(L.downloads, f))) fs.copyFileSync(path.join(dir, f), path.join(L.downloads, f));
  }
  const folder = path.join(L.tables, FOLDER);
  // Images rangées dans la table, comme chez l'auteur : plateau (IMAG), atlas du Visual Light
  // Mapper (jamais proposé), carte que désignent les règles, fronton et logo de la pièce VR.
  const vpx = put(
    path.join(folder, `${FOLDER}.vpx`),
    vpxWithInfo(
      { TableName: 'Guardians Of The Galaxy', AuthorName: 'Pincredibles', TableVersion: '2.1.1', ReleaseDate: '11.06.2022', TableRules: 'Voir la carte : ![Règles](GOTG Rules)' },
      {
        GameData: vpxGameData('Playfield_GOTG'),
        Image0: vpxImage('Playfield_GOTG', 1024, 2048, await drawing(1024, 2048, 'PLATEAU DU .VPX', '#0e7490')),
        Image1: vpxImage('VLM.Nestmap0', 512, 512, await drawing(512, 512, 'ATLAS', '#64748b')),
        Image2: vpxImage('GOTG Rules', 1600, 800, await drawing(1600, 800, 'CARTE DE RÈGLES DU .VPX', '#b45309')),
        Image3: vpxImage('Pincab_Backglass', 1280, 1024, await drawing(1280, 1024, 'FRONTON VR DU .VPX', '#be123c')),
        Image4: vpxImage('VR_Logo', 800, 300, await drawing(800, 300, 'LOGO VR', '#15803d')),
      },
    ),
  );
  put(path.join(folder, `${FOLDER}.info`), JSON.stringify({ Info: { Title: 'Gardiens de la galaxie 2.1.1' }, User: { StartCount: 1 } }, null, 2));
  // Script déjà lu par le médecin : PuP-Pack et dossier du DMD.
  const stat = fs.statSync(vpx);
  put(
    path.join(L.data, 'cache', 'scripts.json'),
    JSON.stringify({ [vpx.toLowerCase()]: { size: stat.size, mtimeMs: stat.mtimeMs, v: 3, facts: { usesPinmame: false, roms: [], dmdFolder: 'GOTG.UltraDMD', pup: { packNames: ['gotg_2020'], playlistAdd: false } } } }),
  );
  const pack = path.join(folder, 'pupvideos', 'gotg_2020');
  put(path.join(pack, 'PuPFrames', 'GuardiansBackglass2.png'), await drawing(2048, 1302, 'FRONTON DU PUP-PACK', '#7c3aed'));
  put(path.join(pack, 'PupImages', 'GOTG-4x3.png'), await drawing(1024, 768, 'CADRE PUPIMAGES 4:3', '#4338ca'));
  // .directb2s que VPX charge, avec deux flashers ; sa copie au nom du site (écartée) ; un autre fronton.
  const flash = await glow(420, 'rgba(255,240,200,0.95)');
  const b2s = directb2s(await drawing(1280, 1024, 'FRONTON DU .DIRECTB2S', '#1d4ed8'), [
    { name: 'GOTG_flasher19', x: 60, y: 520, width: 420, height: 420, png: flash },
    { name: 'GOTG_flasher20', x: 800, y: 520, width: 420, height: 420, png: flash },
  ]);
  put(path.join(folder, `${FOLDER}.directb2s`), b2s);
  put(path.join(folder, '1655488120_GuardiansoftheGalaxy(Stern2017).directb2s'), b2s);
  put(path.join(folder, 'GOTG autre fronton.directb2s'), directb2s(await drawing(1280, 1024, 'AUTRE .DIRECTB2S', '#047857')));
  put(path.join(pack, 'screens.pup'), 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos\r\n0,Topper,,,0,off,,\r\n2,Backglass,PuPFrames,GuardiansBackglass2.png,0,ForceBack,,\r\n5,FullDMD,,,0,ForceBack,,\r\n7,Musique,,,0,MusicOnly,,\r\n');
  // Déclencheurs : fond de l'écran 5 au démarrage et en attente, musique de l'écran 7 ; la scène d'un mode est écartée.
  put(
    path.join(pack, 'triggers.pup'),
    [
      'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile,Volume,Priority,Length,Counter,RestSeconds,Loop,Defaults',
      '1,1,Démarrage,D0,5,BGDefault,default.mp4,100,1,0,0,0,SetBG,',
      '2,1,Attente,E454,5,DMDAttract,xattract1.mp4,100,1,0,0,0,SetBG,',
      '3,1,Mode Groot,M5,2,BGDefault,default.mp4,100,1,0,0,0,SetBG,',
      '4,1,Musique,D0,7,Topper,,100,1,0,0,0,Loop,',
    ].join('\r\n') + '\r\n',
  );
  for (const rel of ['BGDefault\\default.mp4', 'DMDAttract\\xattract1.mp4', 'Topper\\Song-1.mp3', 'Topper\\Song-12.mp3', 'Topper\\m_wait.mp3']) {
    const from = path.join(REAL_PACK, rel);
    if (fs.existsSync(from)) put(path.join(pack, rel), fs.readFileSync(from));
  }
  const screen = (fingerprint, widthPx, heightPx) => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 });
  core.saveCabinet(L.data, {
    version: 1,
    screens: [screen('pf', 1920, 1080), screen('bg', 1920, 1080), screen('dmd', 1920, 1080)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd' },
    playfield: { flipperEdge: 'bottom' },
    vpx: { iniPath: '' },
    updatedAt: '',
  });
  return { root, L };
}

async function scenario(sc, box, report) {
  const { root, L } = box;
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  const library = createLibrary({
    root,
    dataDir: L.data,
    vpxExe: () => undefined,
    tables: () => tables,
    reload: () => (tables = core.scanTables(L.tables)),
    enter: () => (phase = 'library'),
    leave: () => (phase = 'menu'),
    play: () => {},
    quit: () => {},
    keys: () => KEYS,
    windows: () => windows,
    broadcast: () => send(),
  });
  function send() {
    if (win.isDestroyed()) return;
    win.webContents.send('state', {
      role: 'playfield', phase, help: false, count: tables.length, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [],
      nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0] },
      library: phase === 'library' ? library.view() : undefined,
    });
  }
  const onAction = (_e, action) => library.handleAction(action);
  ipcMain.on('action', onAction);
  const ready = new Promise((r) => ipcMain.once('ready', r));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: String(sc.rotation), zones: '[]' } });
  await ready;

  const dir = path.join(CAPTURES, sc.name);
  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  const log = [];
  async function shot(name) {
    send();
    await delay(250);
    for (let i = 0; i < 60; i++) {
      const ok = await win.webContents.executeJavaScript(`[...document.images].every((i) => i.complete) && [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error)`);
      if (ok) break;
      await delay(100);
    }
    await delay(150);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(win.webContents, `${sc.name}/${label}`);
    fs.writeFileSync(path.join(dir, `${label}.png`), (await win.capturePage()).toPNG());
    const v = library.view();
    log.push(`${label} : ${v.heading} | ${v.subheading ?? ''} | ${v.actions.map((a) => `${a.label}${a.detail ? ` (${a.detail})` : ''}`).join(' | ')}`);
  }
  const view = () => library.view();
  const act = (label) => {
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${sc.name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  const key = (code, k = '') => library.handleKey({ type: 'keyDown', code, key: k, shift: false, control: false, alt: false, meta: false });
  async function idle(timeout = 600_000) {
    const end = Date.now() + timeout;
    await delay(100);
    while (view().busy && Date.now() < end) await delay(200);
    if (view().busy) throw new Error(`${sc.name} : toujours occupé (${view().busy})`);
  }
  const gotg = () => tables.find((t) => t.file.includes(FOLDER));

  // ---------- Plan automatique : le jeu n'est pas sûr, la recherche approfondie donne ses raisons ----------
  library.openSheet(gotg());
  act('Médias du jeu');
  act('Chercher les médias');
  if (view().actions.some((a) => a.label.startsWith('J’ai compris'))) act('J’ai compris');
  await idle();
  await shot('plan-automatique');
  act('Pas le bon jeu');
  await shot('quel-jeu');
  act('Retour');
  act('Annuler');

  // ---------- Propositions du fronton ----------
  act('Fronton');
  await shot('fronton');
  act('Voir les propositions');
  await idle();
  await shot('fronton-propositions');
  key(KEYS.next[0]);
  key(KEYS.next[0]);
  await shot('fronton-troisieme');
  // Une autre version que celle du plan automatique : la deuxième proposition.
  library.handleAction({ type: 'activate', index: 1 });
  await idle();
  await shot('fronton-choisi');
  act('Voir les propositions');
  await idle();
  await shot('fronton-propositions-choisi');

  // ---------- Jeux retenus, recherche d'un titre au clavier ----------
  act('Autres jeux');
  await idle();
  await shot('jeux-retenus');
  act('Chercher un autre titre');
  for (const c of 'medieval') key(`Key${c.toUpperCase()}`, c);
  await shot('saisie-titre');
  key('Enter');
  await idle();
  await shot('fronton-apres-recherche');
  act('Autres jeux');
  await idle();
  await shot('jeux-apres-recherche');
  // Medieval Madness n'est pas ce jeu : on le retire.
  act('Medieval Madness');
  act('Retour aux propositions');
  await idle();
  act('Retour : Fronton');
  act('Retour aux médias');

  // ---------- Musique et plateau ----------
  act('Musique');
  act('Voir les propositions');
  await idle();
  await shot('musique-propositions');
  library.handleAction({ type: 'activate', index: 0 });
  await idle();
  act('Retour aux médias');
  act('Plateau');
  act('Voir les propositions');
  await idle();
  await shot('plateau-propositions');
  act('Retour : Plateau');
  act('Retour aux médias');

  // ---------- Images du .vpx et déclencheurs du PuP-Pack ----------
  for (const [label, name] of [['Règles', 'regles'], ['Logo', 'logo'], ['Afficheur large', 'afficheur-large']]) {
    act(label);
    act('Voir les propositions');
    await idle();
    await shot(`${name}-propositions`);
    act(`Retour : ${label}`);
    act('Retour aux médias');
  }

  // ---------- .directb2s : fronton tout allumé, autre fichier du dossier ----------
  act('Fronton');
  act('Voir les propositions');
  await idle();
  const litAt = view().actions.findIndex((a) => a.label.startsWith('Fronton tout allumé'));
  if (litAt < 0) throw new Error(`${sc.name} : pas de « Fronton tout allumé » (${view().actions.map((a) => a.label).join(' | ')})`);
  for (let i = 0; i < 40 && view().cursor !== litAt; i++) key(KEYS.next[0]);
  await shot('fronton-tout-allume');
  act('Retour : Fronton');
  act('Retour aux médias');
  await shot('medias-brouillon');

  // ---------- Enregistrement ----------
  act('Enregistrer');
  await shot('plan-enregistrement');
  act('Enregistrer');
  await shot('medias-enregistres');

  ipcMain.removeListener('action', onAction);
  win.destroy();
  return log;
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = [];
  let shared;
  try {
    for (const sc of SCENARIOS) {
      const box = await sandbox(sc.name, shared);
      const log = await scenario(sc, box, report);
      shared = box.L.downloads;
      results.push(...log.map((l) => `${sc.name}/${l}`));
      const m = path.join(box.L.tables, FOLDER, 'medias');
      const files = fs.existsSync(m) ? fs.readdirSync(m).sort().map((f) => `${f} (${core.formatSize(fs.statSync(path.join(m, f)).size)})`) : [];
      results.push(`${sc.name} : medias = ${files.join(' | ') || 'rien'}`);
      results.push(`${sc.name} : sources = ${JSON.stringify(core.mediaMemory(core.readInfo(path.join(box.L.tables, FOLDER, `${FOLDER}.info`))).sources)}`);
      results.push(`${sc.name} : PuP-Pack intact = ${fs.existsSync(path.join(box.L.tables, FOLDER, 'pupvideos', 'gotg_2020', 'PuPFrames', 'GuardiansBackglass2.png'))}`);
    }
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  app.quit();
});
