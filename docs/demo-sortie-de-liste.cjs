// Démonstration hors écran des listes de contenu à deux zones (packages/core/src/listzones.ts) :
// sur quatre écrans réels — « Ajouter à un jeu » (liste de jeux, triée par nom), « Médias du jeu »,
// la galerie de choix d'un fichier (frontons d'un jeu) et la bibliothèque d'un ami —, la liste dans
// son cadre, son repère « Exit · Sortir de la liste » ; Exit ramène aux actions de l'écran (sur
// « Retour »), MagnaSave (ou F6) ramène dans la liste à la position quittée, un second Exit quitte
// l'écran ; un flipper tenu reste dans la liste, s'arrête à son bout, saute de lettre en lettre
// sur une liste triée par nom. Tables inventées (docs\demo-captures.cjs, et trente de plus sans
// médias), bibliothèque de l'ami et fiches des sites simulées : aucun réseau.
// Deux formes : borne (playfield 1920×1080 couché, rendu tourné d'un quart de tour) et poste
// (paysage 1920×1080), en français et en anglais. Aucune fenêtre n'apparaît : lancé par
// docs\demo-sortie-de-liste.ps1 sur le bureau caché. Captures, relevé (resultat.txt) et contrôle de
// la mise en page dans tmp\demo-sortie-de-liste\captures.
//   npx electron docs\demo-sortie-de-liste.cjs <racine des tables inventées>

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-sortie-de-liste');
const CAPTURES = path.join(BASE, 'captures');
const SOURCE = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs')) ?? path.join(BASE, 'root'));
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { createFileGallery } = require(path.join(WT, 'app', 'dist', 'file-gallery.js'));
const { createFriendLibraryMenu } = require(path.join(WT, 'app', 'dist', 'friend-library-menu.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
let servedDirs = () => [];

const SCENARIOS = [
  { name: 'borne', width: 1920, height: 1080, rotation: 90, lang: 'fr' },
  { name: 'borne', width: 1920, height: 1080, rotation: 90, lang: 'en' },
  { name: 'poste', width: 1920, height: 1080, rotation: 0, lang: 'fr' },
  { name: 'poste', width: 1920, height: 1080, rotation: 0, lang: 'en' },
];

/** Trente jeux inventés de plus, sans médias : une longue liste triée par nom. */
const MORE = [
  'Aurora Drift', 'Basalt Kings', 'Cinder Plaza', 'Cobalt Harbor', 'Crystal Forge', 'Delta Voyager', 'Ember Tide', 'Frost Signal',
  'Galaxy Bazaar', 'Granite Rush', 'Harbor Lights', 'Iron Lagoon', 'Jade Express', 'Kestrel Peak', 'Lantern Bay', 'Magnet Mesa',
  'Nova Caravan', 'Onyx Garden', 'Pebble Quest', 'Prism Rally', 'Quartz Canyon', 'Radar Ranch', 'Saffron Skies', 'Tidal Engine',
  'Umbra Station', 'Velvet Orbit', 'Willow Speedway', 'Xenon Parade', 'Yonder Valley', 'Zephyr Arcade',
];
const MAKERS = ['Orbital Works', 'Halcyon', 'Meridian', 'Voltage Games', 'Gulfstream'];
const GAME_ID = 'demoNeon01';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}
function put(file, data = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

/** Bac à sable : les tables inventées (copiées), trente de plus, un fichier téléchargé, la base VPS d'un jeu. */
function sandbox(name) {
  const box = path.join(BASE, name);
  const root = path.join(box, 'root');
  fs.rmSync(box, { recursive: true, force: true });
  fs.cpSync(SOURCE, root, { recursive: true });
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  MORE.forEach((title, i) => {
    const maker = MAKERS[i % MAKERS.length];
    const year = 1975 + ((i * 7) % 45);
    const folder = path.join(L.tables, `${title} (${maker} ${year})`);
    put(path.join(folder, `${title} (${maker} ${year}).vpx`));
    put(path.join(folder, `${title} (${maker} ${year}).info`), JSON.stringify({ Info: { Title: title, Manufacturer: maker, Year: year } }, null, 2));
  });
  // Un fichier téléchargé, à ajouter à un jeu : aucun n'est « probable », la liste reste triée par nom.
  put(path.join(L.downloads, 'acquisition', 'pack-sons-flipper.zip'), 'x'.repeat(4096));
  // Le premier jeu inventé, rattaché à la base VPS : douze frontons au choix (galerie de fichiers).
  const neon = core.scanTables(L.tables).find((t) => t.title === 'Neon Abyss');
  const info = JSON.parse(fs.readFileSync(neon.file.replace(/\.vpx$/i, '.info'), 'utf8'));
  info.Info.VPSId = GAME_ID;
  fs.writeFileSync(neon.file.replace(/\.vpx$/i, '.info'), JSON.stringify(info, null, 2));
  return { root, L, neon };
}

/** Frontons proposés pour la galerie : auteurs et dates inventés, vignettes prises aux frontons des tables inventées. */
function backglassFiles(L) {
  const shots = core.scanTables(L.tables).map((t) => path.join(t.folder, 'medias', `(Backglass) ${path.basename(t.folder)}.png`)).filter((f) => fs.existsSync(f));
  const jpgs = core.scanTables(L.tables).flatMap((t) => ['webp', 'jpg'].map((ext) => path.join(t.folder, 'medias', `(Backglass) ${path.basename(t.folder)}.${ext}`))).filter((f) => fs.existsSync(f));
  const art = [...shots, ...jpgs];
  const authors = ['Atelier Lumen', 'PixelForge', 'NeonSmith', 'Kaleido', 'Backbox Studio', 'Vectrix', 'Glasshouse', 'Arcadia', 'Moiré', 'Halftone', 'Spectra', 'Lightbox'];
  const files = authors.map((a, i) => ({
    id: `b2s${i}`,
    authors: [a],
    version: `1.${i}`,
    features: i % 3 === 0 ? ['FullDMD'] : i % 3 === 1 ? ['2Screens'] : [],
    updatedAt: Date.UTC(2025, i % 12, 3 + i),
    imgUrl: `https://virtualpinballspreadsheet.github.io/vps-db/img/${GAME_ID}_b2s_${i}.webp`,
    urls: [{ url: `https://example.invalid/fichiers/${i}-fronton/` }],
  }));
  const thumbs = new Map(files.map((f, i) => [f.imgUrl, art[i % art.length]]));
  return { files, thumbs };
}

async function scenario(sc, box, report, log) {
  const { root, L } = box;
  core.setLanguage(sc.lang);
  const T = (fr, params) => core.t(fr, params);
  let tables = core.scanTables(L.tables);
  servedDirs = () => [...core.allowedMediaDirs({ root, dataDir: L.data, tables }), ...tables.map((t) => path.join(t.folder, 'medias'))];
  for (const tb of tables) rememberScript(tb.file, { usesPinmame: false, roms: [] }, L.data);
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const ZONE = core.zoneSwitchKeys(undefined);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  const library = createLibrary({
    guest: { active: false, allows: () => true, knock: () => true },
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
    zoneKeys: () => ZONE,
    windows: () => windows,
    broadcast: () => send(),
    downloadsDir: () => path.join(box.root, '..', 'Windows Downloads'),
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

  const name = `${sc.name}-${sc.lang}`;
  const dir = path.join(CAPTURES, name);
  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  const view = () => library.view();
  const chosen = () => view()?.actions[view().cursor]?.label;
  async function settle() {
    for (let i = 0; i < 100 && view()?.busy; i++) await delay(100);
    await delay(200);
  }
  async function shot(label) {
    await settle();
    send();
    await delay(400);
    const file = `${String(step++).padStart(2, '0')}-${label}`;
    await report.check(win.webContents, `${name}/${file}`);
    fs.writeFileSync(path.join(dir, `${file}.png`), (await win.capturePage()).toPNG());
    const v = view();
    const z = v?.zone;
    log.push(`${name}/${file} : ${v?.heading} | zone : ${z ? `${z.active}${z.position ? ` ${z.position}/${z.total}` : ` (${z.total})`}${z.letter ? ` lettre ${z.letter}` : ''}` : 'aucune'} | choisi : ${chosen() ?? '-'}`);
  }
  const act = async (label) => {
    await settle();
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
    await settle();
  };
  const input = (type, code, isAutoRepeat = false) => ({ type, code, key: '', isAutoRepeat, shift: false, control: false, alt: false, meta: false });
  const press = async (code, n = 1) => {
    for (let i = 0; i < n; i++) {
      library.handleKey(input('keyDown', code));
      library.handleKeyUp(input('keyUp', code));
    }
    await settle();
  };
  /** Bouton tenu : appui, répétitions toutes les 33 ms après 500 ms (comme Windows), capture pendant qu'il est tenu, relâchement. Rend la zone vue pendant qu'il était tenu. */
  const holdKey = async (code, ms, label) => {
    library.handleKey(input('keyDown', code));
    const start = Date.now();
    await delay(500);
    while (Date.now() - start < ms) {
      library.handleKey(input('keyDown', code, true));
      await delay(33);
    }
    if (label) await shot(label);
    const held = zone();
    library.handleKeyUp(input('keyUp', code));
    await settle();
    return held;
  };
  const expect = (cond, what) => {
    if (!cond) throw new Error(`${name} : ${what}`);
  };
  const zone = () => view()?.zone;
  const [RIGHT, EXIT] = [KEYS.next[0], KEYS.exit[0]];
  const MAGNA = ZONE[0];

  /**
   * Le parcours commun d'une liste : ouverte dans la liste, quelques éléments plus bas ; Exit ramène
   * aux actions, MagnaSave à la même place de la liste, et un second Exit quitte l'écran.
   */
  async function zones(tag, down) {
    const heading = view().heading;
    expect(zone()?.active === 'list', `${tag} : l’écran devrait s’ouvrir dans la liste`);
    await shot(`${tag}-liste`);
    await press(RIGHT, down);
    const there = chosen();
    await shot(`${tag}-plus-bas`);
    await press(EXIT);
    expect(view().heading === heading, `${tag} : Exit dans la liste ne doit pas quitter l’écran`);
    expect(zone()?.active === 'actions', `${tag} : Exit dans la liste devrait ramener aux actions`);
    await shot(`${tag}-exit-actions`);
    await press(MAGNA);
    expect(zone()?.active === 'list' && chosen() === there, `${tag} : MagnaSave devrait ramener à « ${there} » (${chosen()})`);
    await shot(`${tag}-magnasave-retour`);
    await press(MAGNA);
    expect(zone()?.active === 'actions', `${tag} : MagnaSave devrait rebasculer vers les actions`);
    await press('F6');
    expect(zone()?.active === 'list' && chosen() === there, `${tag} : F6 devrait faire comme MagnaSave`);
    await press(EXIT);
    await press(EXIT);
    expect(view().heading !== heading, `${tag} : un second Exit devrait quitter l’écran`);
  }

  // 1. Liste de jeux : Téléchargements > Fichiers téléchargés > le fichier > « Ajouter à un autre jeu… » : 37 tables triées par nom.
  library.openSystem();
  await act(T('Tables'));
  await act(T('Téléchargements'));
  // Le gestionnaire de téléchargements (download-center.ts) mène à l'inventaire, « Fichiers téléchargés ».
  await act(T('Fichiers téléchargés'));
  await act('pack-sons-flipper.zip');
  await act(T('Ajouter à un autre jeu…'));
  await zones('jeux', 5);
  await act(T('Ajouter à un autre jeu…'));
  // Flipper tenu : de lettre en lettre, puis arrêté au bout de la liste (jamais sur les actions).
  await holdKey(RIGHT, 2200, 'jeux-tenu-lettres');
  expect(zone()?.active === 'list', 'un flipper tenu doit rester dans la liste');
  await holdKey(RIGHT, 6000, 'jeux-tenu-au-bout');
  expect(zone()?.active === 'list' && zone()?.position === zone()?.total, `un flipper tenu doit s’arrêter au bout de la liste (${zone()?.position}/${zone()?.total})`);
  await press(RIGHT);
  expect(zone()?.active === 'actions', 'un appui au bout de la liste passe aux actions, comme avant');
  await shot('jeux-appui-au-bout');

  // 2. « Médias du jeu » d'une table inventée.
  library.openSheet(tables.find((t) => t.title === 'Midnight Circuit'));
  await act(T('Médias du jeu'));
  await zones('medias', 3);
  await act(T('Médias du jeu'));
  // Liste qui n'est pas triée par nom (l'ordre des écrans) : flipper tenu, de trois en trois, arrêté au bout.
  const fast = await holdKey(RIGHT, 2200, 'medias-tenu-rapide');
  expect(fast?.active === 'list' && !fast.letter && fast.position === fast.total, `liste pas triée : de trois en trois jusqu’au bout, sans lettre (${zone()?.position}/${zone()?.total})`);
  await press(EXIT);
  await press(EXIT);

  // 3. Galerie de choix d'un fichier : les frontons du jeu, en tuiles.
  const { files, thumbs } = backglassFiles(L);
  const gallery = createFileGallery({
    siteFiles: { want() {}, state: (url) => (url ? { url, downloads: 900 + url.length * 37, rating: { value: 4.5, count: 12 } } : undefined), shot: () => undefined },
    vpsThumb: (url) => thumbs.get(url),
    redraw: () => send(),
  });
  library.openSheet(box.neon);
  const sheet = view().heading;
  library.openCustom(() =>
    gallery.build({
      kind: 'b2s',
      files,
      heading: T('Fronton (.directb2s)'),
      subheading: 'Neon Abyss (Orbital Works 1994)',
      lead: sc.lang === 'en' ? 'Pick a backglass: Start gets it.' : 'Choisissez un fronton : Start le récupère.',
      pick: () => {},
      back: () => library.openSheet(box.neon),
      after: [{ label: T('Retour'), icon: 'back', run: () => library.openSheet(box.neon) }],
    }),
  );
  await settle();
  await zones('galerie', 4);
  expect(view().heading === sheet, 'le second Exit de la galerie devrait revenir à la fiche');

  // 4. Bibliothèque d'un ami : ses tables (sur votre borne, absentes), une liste en deux sections.
  const mine = core.scanTables(L.tables);
  const friendTables = [
    ...mine.map((t, i) => ({ id: `t${i}`, table: { title: t.title, manufacturer: t.manufacturer, year: t.year }, version: 'VPW 1.2', medias: [{ id: `m${i}`, type: 'Backglass', kind: 'image', format: 'png', bytes: 1_200_000 }] })),
    ...['Comet Lounge', 'Maple Rocket', 'Sonar Ballroom', 'Tundra Express'].map((title, i) => ({ id: `x${i}`, table: { title, manufacturer: 'Halcyon', year: 1990 + i }, medias: [] })),
  ];
  const friends = createFriendLibraryMenu({
    // La vraie gestion des tables et son gestionnaire de téléchargements, comme friends-menu.ts les branche.
    library,
    net: { state: () => ({ friends: [{ key: 'bruno', name: 'Bruno' }] }), online: () => true },
    // Rien ne se télécharge dans cette démonstration : les réceptions échouent comme hors ligne.
    content: {
      library: () => ({ state: 'ready', library: { at: new Date().toISOString(), tables: friendTables } }),
      refresh() {},
      fetch: async (_key, _id, medias) => ({ received: [], failed: medias.map((media) => ({ media, reason: 'offline' })) }),
      tableFiles: async () => 'offline',
      fetchTable: async (_key, _id, folder, files) => ({ dir: path.join(L.data, 'reçu', folder), received: [], failed: files.map((file) => ({ file, reason: 'offline' })) }),
      fetchFile: async () => ({ reason: 'offline' }),
      tableDir: (folder) => path.join(L.data, 'reçu', folder),
      receivedDir: () => L.data,
      stop() {},
    },
    downloads: library.downloads,
    live: { inviteOn() {} },
    tables: () => tables,
    root: () => root,
    redraw: () => send(),
  });
  library.openSystem();
  const system = view().heading;
  friends.open('bruno', () => library.openSystem());
  await settle();
  await zones('ami', 6);
  expect(view().heading === system, 'le second Exit de la bibliothèque devrait revenir au menu système');
  friends.open('bruno', () => library.openSystem());
  await settle();
  // Liste en deux sections triées chacune (sur votre borne, absentes) : flipper tenu, de lettre en lettre, section par section.
  const byLetter = await holdKey(RIGHT, 2200, 'ami-tenu-lettres');
  expect(byLetter?.active === 'list' && byLetter.letter, 'sections triées par nom : saut par lettre, dans la liste');
  expect(!zone()?.letter, 'l’initiale s’efface quand le flipper est relâché');

  ipcMain.removeListener('action', onAction);
  win.destroy();
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  ipcMain.on('i18n', (event) => {
    event.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) };
  });
  serveMedias(() => servedDirs());
  fs.rmSync(CAPTURES, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const log = [];
  try {
    for (const sc of SCENARIOS) await scenario(sc, sandbox(`${sc.name}-${sc.lang}`), report, log);
  } catch (error) {
    log.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), log.join('\n') + '\n', 'utf8');
  console.log(log.join('\n'));
  app.exit(process.exitCode ?? 0);
});
