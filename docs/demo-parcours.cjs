// Démonstration hors écran du parcours « Ce qu'il manque pour jouer » : Terminator 2,
// installée sans sa ROM (t2_l8), une révision voisine (t2_l6) déjà dans la bibliothèque.
// Fiche (« Ce qu'il manque pour jouer » en tête), médecin, échec d'une partie, puis le
// parcours : ROM à récupérer, avertissement du catalogue, fenêtre « Récupérer » sur une
// fausse fiche vpforums.org (aucune page des forums n'est chargée), ROM reçue, reprise
// depuis la liste d'attente, plan d'installation, retour au parcours, « Jouer ». Puis une
// table originale qui dessine son DMD avec FlexDMD, livrée sans son dossier ni fronton :
// rien d'obligatoire ne manque, « Jouer » est proposé tout de suite, le contenu du DMD et
// le fronton « pour aller plus loin » (playable.ts). Chaque
// état est capturé en paysage (bureau) et en portrait (borne). Vraie base VPS, copiée
// depuis D:\CyberPinball\downloads. Aucune fenêtre n'apparaît : lancé par
// docs\demo-parcours.ps1 sur le bureau caché. Captures et relevé dans tmp\demo-parcours\captures.
// --accueil : les images de la page du projet (README) ; le même parcours sur les jeux inventés
// de la page (docs\demo-jeux.cjs : Neon Abyss sans sa ROM nabyss_l4, Star Courier qui dessine
// son DMD), ROM inventées, base VPS inventée (rien n'est lu dans D:\CyberPinball), en français
// puis en anglais. Captures dans tmp\demo-parcours-accueil\captures\<langue>.
//   npm run build
//   .\docs\demo-parcours.ps1 [-Accueil]

const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain, session } = require('electron');

const WT = path.resolve(__dirname, '..');
/** Images de la page du projet : jeux inventés, base VPS inventée, en français et en anglais. */
const ACCUEIL = process.argv.includes('--accueil');
const BASE = path.join(WT, 'tmp', ACCUEIL ? 'demo-parcours-accueil' : 'demo-parcours');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { ACQUIRE_PARTITION } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
// Le guet hors écran (app\src\offscreen.ts) écrit son bilan dans le dossier des captures : demo-parcours.ps1 le lit.
process.env.CYBERPINBALL_CAPTURE ??= CAPTURES;
const { createWindow } = require(path.join(WT, 'app', 'dist', 'offscreen.js'));
const { vpxWithInfo, zipStored } = require('./demo-fichiers.cjs');
const { tableName, game } = require('./demo-jeux.cjs');
let servedDirs = () => [];
const LOG = [];

const REAL_DOWNLOADS = 'D:\\CyberPinball\\downloads';
const T = (fr, params) => core.t(fr, params);

/**
 * La table installée sans sa ROM (une révision voisine déjà sur la borne), et la table qui
 * dessine son DMD avec FlexDMD, livrée sans son dossier ni fronton : vraies pour la revue,
 * inventées pour la page du projet.
 */
const GAME = ACCUEIL
  ? {
      vpsId: 'cpNeonAb',
      name: tableName(game('Neon Abyss')),
      title: 'Neon Abyss',
      maker: game('Neon Abyss').maker,
      year: game('Neon Abyss').year,
      authors: 'Cyber Pinball',
      version: '1.2',
      rom: 'nabyss_l4',
      neighbour: 'nabyss_l3',
      romFiles: { 'nabyss_l4.rom': 'programme', 'nabys_u18.l1': 'son 1', 'nabys_u15.l1': 'son 2' },
      showfile: '99104',
      original: { vpsId: 'cpStarCo', name: tableName(game('Star Courier')), title: 'Star Courier', maker: game('Star Courier').maker, year: game('Star Courier').year, authors: 'Cyber Pinball', version: '2.0', dmd: 'starcourier', folder: 'StarCourierDMD' },
    }
  : {
      vpsId: 'BunvWvh9',
      name: 'Terminator 2 - Judgment Day (Williams 1991)',
      title: 'Terminator 2 - Judgment Day',
      maker: 'Williams',
      year: 1991,
      authors: 'G5k, VPW',
      version: '1.25',
      rom: 't2_l8',
      neighbour: 't2_l6',
      romFiles: { 't2_l8.rom': 'programme', 't2_u18.l3': 'son 1', 't2_u15.l3': 'son 2' },
      showfile: '7318',
      original: { vpsId: '34pZqivK', name: 'The Goonies Never Say Die Pinball (Original 2021)', title: 'The Goonies Never Say Die Pinball', maker: 'Original', year: 2021, authors: 'VPW', version: '1.5', dmd: 'goonies', folder: 'TheGooniesDMD' },
    };
const ORIGINAL = GAME.original;
const SCRIPT = `Option Explicit\r\nConst cGameName="${GAME.rom}"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = cGameName\r\n`;
const ORIGINAL_SCRIPT = `Option Explicit\r\nDim FlexDMD\r\nSet FlexDMD = CreateObject("FlexDMD.FlexDMD")\r\nWith FlexDMD\r\n  .GameName = "${ORIGINAL.dmd}"\r\n  .ProjectFolder = "./${ORIGINAL.folder}/"\r\nEnd With\r\n`;
const FORUM = 'https://www.vpforums.org/index.php?app=downloads&showfile=';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function offscreen(width, height, extra = {}) {
  // Par createWindow : rendue hors écran (Use-HorsEcran), et surveillée par le guet.
  const win = createWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}
function put(file, data = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

/**
 * Base VPS inventée de la page du projet : les deux jeux, leur version VPX et leur fronton, les
 * ROM du premier sur une fausse fiche vpforums.org. Vérifiée à l'instant : rien n'est téléchargé.
 */
function inventedVpsDb(downloads) {
  const at = Date.UTC(2026, 8, 14);
  const link = (url) => [{ url }];
  const vpu = (n, slug) => link(`https://vpuniverse.com/files/file/${n}-${slug}/`);
  const games = [GAME, ORIGINAL].map((g, i) => ({
    id: g.vpsId,
    name: g.title,
    manufacturer: g.maker,
    year: g.year,
    type: 'SS',
    players: 4,
    tableFiles: [{ id: `${g.vpsId}Vpx`, authors: [g.authors], version: g.version, tableFormat: 'VPX', updatedAt: at, urls: vpu(99110 + i * 10, g.title.toLowerCase().replace(/\s+/g, '-')) }],
    b2sFiles: [{ id: `${g.vpsId}B2s`, authors: [g.authors], version: '1.0', updatedAt: at, urls: vpu(99111 + i * 10, `${g.title.toLowerCase().replace(/\s+/g, '-')}-backglass`) }],
    ...(g.rom && {
      romFiles: [
        { version: g.rom, updatedAt: at, urls: link(`${FORUM}${g.showfile}`) },
        { version: g.neighbour, updatedAt: at - 400 * 86_400_000, urls: link(`${FORUM}${Number(g.showfile) - 1}`) },
      ],
    }),
    updatedAt: at,
  }));
  put(path.join(downloads, core.VPS_DB_FILE), JSON.stringify(games, null, 2));
  put(path.join(downloads, 'vpsdb.meta.json'), JSON.stringify({ lastUpdated: at, downloadedAt: new Date(at).toISOString(), checkedAt: new Date().toISOString() }, null, 2));
}

/** Racine factice : la table installée sans ROM, la révision voisine dans la bibliothèque, borne à trois écrans. */
function sandbox(base) {
  const root = path.join(base, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  if (ACCUEIL) inventedVpsDb(L.downloads);
  else for (const f of fs.readdirSync(REAL_DOWNLOADS)) if (/^vpsdb/.test(f)) fs.copyFileSync(path.join(REAL_DOWNLOADS, f), path.join(L.downloads, f));
  const folder = path.join(L.tables, GAME.name);
  const table = put(path.join(folder, `${GAME.name}.vpx`), vpxWithInfo({ TableName: GAME.title, AuthorName: GAME.authors, TableVersion: GAME.version }));
  put(path.join(folder, `${GAME.name}.directb2s`), `<DirectB2SData><Name Value="${GAME.title.replace(/ - .*/, '')}" /></DirectB2SData>`);
  put(path.join(folder, `${GAME.name}.info`), JSON.stringify({ Info: { Title: GAME.title, Manufacturer: GAME.maker, Year: GAME.year, VPSId: GAME.vpsId } }, null, 2));
  // Script déjà lu (comme après « Ajouter une table ») : VPX n'est jamais lancé.
  rememberScript(table, core.scriptFacts(SCRIPT), L.data);
  // Une autre révision du même jeu, déjà sur la borne : l'alias est proposé en second.
  put(path.join(L.roms, `${GAME.neighbour}.zip`), zipStored({ [`${GAME.neighbour}.rom`]: 'révision voisine' }));
  put(path.join(root, 'emulators', 'vpx', 'VPinballX64.exe'), '');
  const original = put(path.join(L.tables, ORIGINAL.name, `${ORIGINAL.name}.vpx`), vpxWithInfo({ TableName: ORIGINAL.title, AuthorName: ORIGINAL.authors, TableVersion: ORIGINAL.version }));
  put(path.join(L.tables, ORIGINAL.name, `${ORIGINAL.name}.info`), JSON.stringify({ Info: { Title: ORIGINAL.title, Manufacturer: ORIGINAL.maker, Year: ORIGINAL.year, VPSId: ORIGINAL.vpsId } }, null, 2));
  rememberScript(original, core.scriptFacts(ORIGINAL_SCRIPT), L.data);
  const screen = (fingerprint, widthPx, heightPx) => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 });
  core.saveCabinet(L.data, {
    version: 1,
    screens: [screen('pf', 1920, 1080), screen('bg', 1920, 1080), screen('dmd', 1920, 1080)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd' },
    playfield: { flipperEdge: 'bottom' },
    vpx: { iniPath: '' },
    updatedAt: '',
  });
  fs.mkdirSync(path.join(base, 'Téléchargements'), { recursive: true });
  return { root, L, table, folder };
}

/** Fausse fiche vpforums.org de la ROM : une page avec « Download », qui renvoie un zip factice. */
function fakeForum() {
  return async (request) => {
    const url = new URL(request.url);
    if (core.pageKey(request.url) !== `vpf:${GAME.showfile}`) return new Response('<h1>Page de démonstration absente</h1>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.searchParams.get('do') === 'download') {
      return new Response(zipStored(GAME.romFiles), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${GAME.rom}.zip"` } });
    }
    const html = `<!doctype html><meta charset="utf-8"><title>${GAME.title.replace(/ - .*/, '')} : ROM ${GAME.rom}</title>
      <body style="font-family:Segoe UI;background:#1b1f2a;color:#e5e7eb;padding:40px">
      <p style="color:#94a3b8">Fausse fiche de démonstration (${url.hostname}) : la vraie demande de se connecter.</p>
      <h1>${GAME.title} : ROM ${GAME.rom}</h1><p>Connecté en tant que <b>demo</b>.</p>
      <a class="download" href="${url.origin}${url.pathname}${url.search}&do=download" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Download this file</a>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
}

/** Le parcours entier, dans une langue (page du projet) ou dans celle du poste (revue). */
async function run(report, lang) {
  if (lang) core.setLanguage(lang);
  const base = lang ? path.join(BASE, lang) : BASE;
  const captures = lang ? path.join(CAPTURES, lang) : CAPTURES;
  const prefix = lang ? `${lang}/` : '';
  const box = sandbox(base);
  const { root, L } = box;
  const userDownloads = path.join(base, 'Téléchargements');
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const LANDSCAPE = { width: 1920, height: 1080 };
  const PORTRAIT = { width: 1080, height: 1920 };
  const win = offscreen(LANDSCAPE.width, LANDSCAPE.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  let message;
  const played = [];
  const library = createLibrary({
    // Mode invité inactif : tout passe (host.guest est obligatoire, library.ts).
    guest: { active: false, allows: () => true, knock: () => true },
    root,
    dataDir: L.data,
    vpxExe: () => path.join(root, 'emulators', 'vpx', 'VPinballX64.exe'),
    tables: () => tables,
    reload: () => (tables = core.scanTables(L.tables)),
    enter: () => (phase = 'library'),
    leave: () => (phase = 'menu'),
    play: (table) => {
      played.push(table.title);
      phase = 'menu';
    },
    quit: () => {},
    keys: () => KEYS,
    windows: () => windows,
    broadcast: () => send(),
    downloadsDir: () => userDownloads,
  });
  function send() {
    if (win.isDestroyed()) return;
    win.webContents.send('state', {
      role: 'playfield', phase, help: false, count: tables.length, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [],
      nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0] },
      message,
      library: phase === 'library' ? library.view() : undefined,
    });
  }
  const onAction = (_e, action) => library.handleAction(action);
  ipcMain.on('action', onAction);
  const ready = new Promise((r) => ipcMain.once('ready', r));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: '0', zones: '[]' } });
  await ready;

  fs.mkdirSync(captures, { recursive: true });
  let step = 0;
  const log = LOG;
  async function settle(contents) {
    for (let i = 0; i < 60; i++) {
      const ok = await contents.executeJavaScript(`[...document.images].every((i) => i.complete) && [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error)`);
      if (ok) break;
      await delay(100);
    }
    await delay(150);
  }
  async function capture(label) {
    send();
    await delay(250);
    await settle(win.webContents);
    await report.check(win.webContents, `${prefix}${label}`);
    fs.writeFileSync(path.join(captures, `${label}.png`), (await win.capturePage()).toPNG());
  }
  /** L'écran courant en paysage (bureau) ; `portrait` : aussi en portrait (borne). */
  async function shot(name, portrait = false) {
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await capture(label);
    if (portrait) {
      win.setContentSize(PORTRAIT.width, PORTRAIT.height);
      await delay(300);
      await capture(`${label}-borne`);
      win.setContentSize(LANDSCAPE.width, LANDSCAPE.height);
      await delay(300);
    }
    const v = library.view();
    if (phase === 'library' && v) {
      log.push(`${prefix}${label} : ${v.heading} | ${v.subheading ?? ''} | ${v.actions.map((a) => `${a.label}${a.detail ? ` (${a.detail})` : ''}`).join(' | ')}`);
      if (v.journey) log.push(`   ${v.journey.position} · ${v.journey.summary} : ${v.journey.steps.map((s) => `${s.n} ${s.title} [${s.word}]${s.current ? ' ←' : ''}`).join(' · ')}`);
      if (v.journey?.extras.length) log.push(`   ${v.journey.extrasTitle} : ${v.journey.extras.map((s) => `${s.title} [${s.word}]`).join(' · ')}`);
    } else log.push(`${prefix}${label} : ${phase}${message ? ` « ${message.title} »` : ''}`);
  }
  async function shotAcquire(name) {
    const open = library.catalog.acquirer.current();
    await delay(400);
    await settle(open.view.webContents);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(open.win.webContents, `${prefix}${label} (bandeau)`);
    fs.writeFileSync(path.join(captures, `${label}-bandeau.png`), (await open.win.capturePage()).toPNG());
    fs.writeFileSync(path.join(captures, `${label}-page.png`), (await open.view.webContents.capturePage()).toPNG());
    log.push(`${prefix}${label} : fenêtre « Récupérer » sur ${open.view.webContents.getURL()} ; bandeau : ${JSON.stringify(open.request)}`);
  }
  const view = () => library.view();
  const act = (label) => {
    LOG.push(`→ ${label}`);
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  async function idle(timeout = 120_000) {
    const end = Date.now() + timeout;
    await delay(150);
    while (view()?.busy && Date.now() < end) await delay(150);
    if (view()?.busy) throw new Error(`toujours occupé (${view().busy})`);
  }
  async function until(what, test, timeout = 30_000) {
    const end = Date.now() + timeout;
    while (!test() && Date.now() < end) await delay(200);
    if (!test()) throw new Error(`attendu en vain : ${what}`);
  }
  const waitList = () => core.loadWaitList(L.data);
  const main = () => tables.find((t) => t.info.Info?.VPSId === GAME.vpsId);
  const current = () => view().journey?.steps.find((s) => s.current);
  const expect = (what, ok) => {
    log.push(`${ok ? 'OK' : 'ÉCHEC'} : ${prefix}${what}`);
    if (!ok) throw new Error(what);
  };
  const MISSING = T('Ce qu’il manque pour jouer');
  const PLAY = T('Jouer');
  const ROM = GAME.rom;

  // ---------- Les trois portes d'entrée ----------
  library.openSheet(main());
  await shot('fiche-rom-absente');
  expect('la fiche met « Ce qu’il manque pour jouer » en tête', view().actions[0].label === MISSING);
  act(T('Diagnostiquer et réparer'));
  await idle();
  await shot('medecin');
  expect('le médecin propose le parcours', view().actions[0].label === MISSING);
  // Partie échouée (message de frontend.ts) : Start mène au parcours.
  phase = 'message';
  message = { title: T('La partie n’a pas pu se dérouler'), lines: [`Fermeture de VPX : « can't start game » (${ROM}).`, 'La ROM de cette table est introuvable : elle doit être dans le dossier pinmame\\roms de la table.'], action: 'journey', table: main().file };
  await shot('partie-echouee', true);
  message = undefined;
  phase = 'library';

  // ---------- Le parcours : ROM absente ----------
  library.openJourney(main().file);
  await idle();
  await shot('parcours-rom-absente', true);
  expect(`étape courante : ROM ${ROM}, à faire`, current()?.title === T('ROM {rom}', { rom: ROM }) && current()?.word === T('À faire'));
  expect(`geste conseillé : récupérer la ROM sur vpforums.org`, view().actions[0].label === T('Récupérer la ROM {rom}', { rom: ROM }) && /vpforums\.org/.test(view().actions[0].detail));
  expect('révision voisine proposée ensuite', view().actions.some((a) => a.label === T('Jouer avec {neighbour}, révision voisine', { neighbour: GAME.neighbour })));

  // « Récupérer » : avertissement du catalogue au premier usage, puis la fiche dans la fenêtre « Récupérer ».
  act(T('Récupérer la ROM {rom}', { rom: ROM }));
  await idle();
  await shot('avertissement');
  act(T('J’ai compris : ouvrir le catalogue'));
  await idle();
  await shotAcquire('recuperer-rom');
  await shot('parcours-page-ouverte');
  expect('la ROM est attendue pour cette table', waitList().items.some((i) => i.rom === ROM && i.state === 'waiting' && i.table === main().file));
  await library.catalog.acquirer.current().view.webContents.executeJavaScript(`document.querySelector('a.download').click()`);
  await until('ROM reçue', () => waitList().items.some((i) => i.rom === ROM && i.state === 'received'));
  await delay(400);
  library.catalog.acquirer.close();
  await idle();
  await shot('parcours-rom-recue', true);
  expect('ROM reçue : à installer', current()?.word === T('À installer') && view().actions[0].label === T('Installer le fichier reçu'));

  // ---------- Reprendre plus tard : depuis la liste d'attente (« Récupérés et attendus ») ----------
  // Exit (ou « ‹ Retour à la fiche » en tête) : la fiche garde le parcours en tête.
  LOG.push('→ Exit');
  library.handleAction({ type: 'back' });
  await idle();
  await shot('fiche-parcours-commence');
  // La liste d'attente est dans l'entonnoir « Ajouter une table » (menu système, rubrique Tables).
  library.openSystem();
  act(core.SYSTEM_GROUPS.tables.label);
  act(core.SYSTEM_ITEMS['add-table'].label);
  act(T('Récupérés et attendus'));
  await idle();
  await shot('liste-attente');
  // « Reprendre : ce qu’il manque pour jouer <titre> » : le début, quel que soit le titre.
  act(T('Reprendre : ce qu’il manque pour jouer {title}', { title: '' }).trim());
  await idle();
  expect('le parcours reprend au même point', current()?.word === T('À installer'));

  // ---------- Installer, revérifier, jouer ----------
  act(T('Installer le fichier reçu'));
  await idle();
  await shot('plan-installation');
  act(T('Installer'));
  await idle();
  await shot('parcours-pret', true);
  const romsDir = core.tableRomsDir(main().folder);
  expect(`${ROM} dans la bibliothèque et liée dans la table`, fs.existsSync(path.join(L.roms, `${ROM}.zip`)) && fs.existsSync(path.join(romsDir, `${ROM}.zip`)));
  expect('prête : « Jouer » est le geste conseillé', view().actions[0].label === PLAY && current()?.title === PLAY);
  expect('la ROM est marquée installée dans la liste d’attente', waitList().items.find((i) => i.rom === ROM)?.state === 'installed');
  act(PLAY);
  await delay(200);
  expect('la partie est lancée', played.length === 1);
  expect('parcours terminé, plus proposé à la reprise', !core.journeyRecord(core.loadJourneys(L.data), main().file));
  library.openSheet(main());
  await shot('fiche-apres');
  expect('la fiche ne propose plus le parcours', view().actions[0].label === PLAY);

  // ---------- Sans contenu du DMD ni fronton : « Jouer » tout de suite ----------
  const original = () => tables.find((t) => t.info.Info?.VPSId === ORIGINAL.vpsId);
  library.openSheet(original());
  await shot('goonies-fiche', true);
  expect('fiche : « Jouer » en tête, rien d’indispensable', view().actions[0].label === PLAY && !view().actions.some((a) => a.label === MISSING));
  expect('fiche : le contenu du DMD proposé « pour aller plus loin »', view().actions.some((a) => a.label === T('Pour aller plus loin')));
  act(T('Diagnostiquer et réparer'));
  await idle();
  await shot('goonies-medecin');
  expect('médecin : dossier du DMD en avertissement, pas de parcours imposé', !view().actions.some((a) => a.label === MISSING) && view().sections.some((sec) => sec.rows.some((r) => r.text.includes(ORIGINAL.folder) && r.tone === 'warning')));
  library.openJourney(original().file);
  await idle();
  await shot('goonies-parcours', true);
  const j = view().journey;
  expect('parcours : « Tout est prêt pour jouer », Jouer conseillé', view().heading === T('Tout est prêt pour jouer') && view().actions[0].label === PLAY && current()?.title === PLAY);
  expect('parcours : étape 3 sur 3, les améliorations hors décompte', j.position === T('Étape {n} sur {total}', { n: 3, total: 3 }) && j.extras.some((s) => s.title === T('Contenu du DMD') && s.word === T('Facultatif')) && j.extras.some((s) => s.title === T('Fronton')));
  act(PLAY);
  await delay(200);
  expect('la partie est lancée sans le dossier du DMD ni le fronton', played.length === 2);

  ipcMain.removeListener('action', onAction);
  win.destroy();
  log.push(`${prefix}ROM de la bibliothèque : ${JSON.stringify(fs.readdirSync(L.roms))} ; dans la table : ${JSON.stringify(fs.readdirSync(romsDir))}`);
  log.push(`${prefix}liste d’attente : ${JSON.stringify(waitList().items.map((i) => `${i.kind}:${i.rom}:${i.state}`))}`);
  log.push(`${prefix}downloads\\acquisition : ${JSON.stringify(fs.existsSync(path.join(L.downloads, 'acquisition')) ? fs.readdirSync(path.join(L.downloads, 'acquisition')) : [])}`);
  return log;
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const languages = ACCUEIL ? ['fr', 'en'] : [undefined];
  // Garde-temps : une démonstration ne reste jamais bloquée ; le relevé dit où elle en était.
  setTimeout(() => {
    LOG.push(`ÉCHEC : plus de ${5 * languages.length} minutes, arrêt (dernière étape ci-dessus).`);
    fs.mkdirSync(CAPTURES, { recursive: true });
    fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
    console.log(LOG.join('\n'));
    app.exit(2);
  }, 300_000 * languages.length).unref();
  // Langue de l'interface pour la page (preload.ts) : celle du cœur, que fixe chaque passage.
  ipcMain.on('i18n', (event) => {
    event.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) };
  });
  serveMedias(() => servedDirs());
  session.fromPartition(ACQUIRE_PARTITION).protocol.handle('https', fakeForum());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  try {
    for (const lang of languages) await run(report, lang);
  } catch (error) {
    LOG.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  if (!fs.readFileSync(path.join(CAPTURES, 'mise-en-page.txt'), 'utf8').startsWith('Aucun problème')) {
    LOG.push('ÉCHEC : le garde-fou de mise en page a relevé des problèmes (mise-en-page.txt).');
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
  console.log(LOG.join('\n'));
  // app.quit() rendrait 0 même en échec : le script PowerShell n'y verrait rien.
  app.exit(process.exitCode ?? 0);
});
