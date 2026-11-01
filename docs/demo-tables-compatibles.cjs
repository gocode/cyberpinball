// Démonstration hors écran du choix de la table d'une partie en direct (packages/core/src/livechoice.ts,
// app/src/live-game-menu.ts) : avec deux amis, Bruno et Émile, en tête la table que tous deux ont
// dans la même version, puis celle à vérifier (une version encore en route chez Émile), puis les
// indisponibles, grisées avec qui bloque (« Autre version chez Bruno », « Bruno n'a pas cette
// table ») ; puis le même choix avec Bruno seul. Tables inventées sans médias, bibliothèques des
// amis simulées : aucun réseau, VPX n'est jamais lancé. Borne (playfield couché, rendu tourné
// d'un quart de tour) et poste, en français et en anglais. Aucune fenêtre n'apparaît : lancé par
// docs\demo-tables-compatibles.ps1 sur le bureau caché. Captures, relevé (resultat.txt) et
// contrôle de la mise en page dans tmp\demo-tables-compatibles\captures.
//   npx electron docs\demo-tables-compatibles.cjs

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-tables-compatibles');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { createLiveMenu } = require(path.join(WT, 'app', 'dist', 'live-game-menu.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
let servedDirs = () => [];

const SCENARIOS = [
  { name: 'borne', width: 1920, height: 1080, rotation: 90, lang: 'fr' },
  { name: 'borne', width: 1920, height: 1080, rotation: 90, lang: 'en' },
  { name: 'poste', width: 1920, height: 1080, rotation: 0, lang: 'fr' },
];

/** Mes tables inventées, et leur empreinte (une lettre répétée : la version). */
const MINE = [
  { title: 'Neon Abyss', maker: 'Orbital Works', year: 1994, print: 'a' },
  { title: 'Midnight Circuit', maker: 'Halcyon', year: 1989, print: 'b' },
  { title: 'Glass Lagoon', maker: 'Meridian', year: 1997, print: 'c' },
  { title: 'Comet Lounge', maker: 'Voltage Games', year: 1992, print: 'd' },
  { title: 'Saffron Skies', maker: 'Gulfstream', year: 1985, print: 'e' },
];
const P = (c) => c.repeat(64);
const identity = (m) => ({ title: m.title, manufacturer: m.maker, year: m.year });
/**
 * Bruno : Neon Abyss et Comet Lounge à l'identique, Midnight Circuit dans une autre version, pas
 * Glass Lagoon. Émile : Neon Abyss, Midnight Circuit et Glass Lagoon à l'identique, Comet Lounge
 * sa version encore en route. Saffron Skies : ni l'un ni l'autre.
 */
const FRIENDS = {
  bruno: { name: 'Bruno', tables: [['Neon Abyss', P('a')], ['Midnight Circuit', P('f')], ['Comet Lounge', P('d')]] },
  emile: { name: 'Émile', tables: [['Neon Abyss', P('a')], ['Midnight Circuit', P('b')], ['Glass Lagoon', P('c')], ['Comet Lounge', 'pending']] }, // i18n-ignore : nom d'un joueur fictif
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}

/** Bac à sable : les tables inventées, chacune un .vpx et son .info. */
function sandbox(name) {
  const root = path.join(BASE, name, 'root');
  fs.rmSync(path.join(BASE, name), { recursive: true, force: true });
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  for (const m of MINE) {
    const folder = path.join(L.tables, `${m.title} (${m.maker} ${m.year})`);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `${m.title} (${m.maker} ${m.year}) VPW 1.2.vpx`), 'x');
    fs.writeFileSync(path.join(folder, `${m.title} (${m.maker} ${m.year}) VPW 1.2.info`), JSON.stringify({ Info: { Title: m.title, Manufacturer: m.maker, Year: m.year } }, null, 2));
  }
  return { root, L };
}

async function scenario(sc, box, report, log) {
  const { root, L } = box;
  core.setLanguage(sc.lang);
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
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
    downloadsDir: () => path.join(root, '..', 'Windows Downloads'),
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

  const byTitle = new Map(MINE.map((m) => [m.title, m]));
  const live = createLiveMenu({
    library,
    net: {
      state: () => ({ key: { publicKey: 'moi' }, name: 'Alice', friends: Object.entries(FRIENDS).map(([key, f]) => ({ key, name: f.name })) }),
      online: () => true,
      presenceOf: () => ({ status: 'menu', since: new Date().toISOString() }),
      listSync: () => 'settled',
    },
    // Rien ne part : la démonstration s'arrête au choix de la table.
    games: {
      current: () => undefined,
      board: () => [],
      history: () => [],
      table: () => undefined,
      versionOf: async (table) => ({ print: P(byTitle.get(table.title)?.print ?? 'z') }),
      bytesOf: () => undefined,
      // Toutes avec un relevé : la démonstration ne montre que l'ordre des tables.
      manualOf: async () => undefined,
      waitView: () => undefined,
      invites: () => [],
      create: async () => {
        throw new Error('pas de partie dans cette démonstration');
      },
      invite: () => false,
      matchFor: async () => ({ match: 'missing' }),
      accept: async () => ({ match: 'missing' }),
      decline: () => {},
      start: () => false,
      leave: () => {},
      close: () => {},
      stop: () => {},
    },
    tables: () => tables,
    identityOf: (table) => core.tableIdentity(table, []),
    friendTables: (key) => ({
      key,
      name: FRIENDS[key].name,
      library: 'ready',
      tables: FRIENDS[key].tables.map(([title, print]) => ({ table: identity(byTitle.get(title)), ...(print === 'pending' ? { pending: true } : { print }) })),
    }),
    openFriendTable: () => {},
    redraw: () => send(),
  });

  const name = `${sc.name}-${sc.lang}`;
  const dir = path.join(CAPTURES, name);
  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  const view = () => library.view();
  async function shot(label) {
    await delay(300);
    send();
    await delay(400);
    const file = `${String(step++).padStart(2, '0')}-${label}`;
    await report.check(win.webContents, `${name}/${file}`);
    fs.writeFileSync(path.join(dir, `${file}.png`), (await win.capturePage()).toPNG());
    const v = view();
    log.push(`${name}/${file} : ${v?.heading}`);
    for (const s of v?.sections ?? []) for (const r of s.rows) log.push(`   [${s.title ?? ''}] ${r.text} — ${r.detail ?? ''} (${r.tone ?? '-'})`);
  }
  const expect = (cond, what) => {
    if (!cond) throw new Error(`${name} : ${what}`);
  };

  // 1. Deux amis : la même version chez tous en tête, puis à vérifier, puis les indisponibles.
  library.openSystem();
  live.inviteFriends(['bruno', 'emile'], () => library.openSystem());
  await delay(200);
  const titles = () => (view()?.sections ?? []).map((s) => s.title);
  const T = (fr, params) => core.t(fr, params);
  expect(titles().join('|') === [T('Même version chez tous ({n})', { n: 1 }), T('À vérifier ({n})', { n: 1 }), T('Indisponibles ({n})', { n: 3 })].join('|'), `sections : ${titles().join(' | ')}`);
  await shot('deux-amis');
  // 2. Bruno seul : deux tables à l'identique, une autre version, deux absentes.
  live.inviteFriend('bruno', () => library.openSystem());
  await delay(200);
  await shot('bruno-seul');

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
