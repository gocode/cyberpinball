// Démonstration hors écran de la récupération d'une table chez un ami (app/src/friend-library-menu.ts),
// retours du 01/11/2026 à la borne, aux boutons seulement (flippers, Start, Exit) :
// - l'écran des parties s'ouvre dans la liste, sur la première partie ; chaque ligne dit « Cochée » ou
//   « Non cochée », et toute partie non cochée comment la cocher ; la ROM puis le PuP-Pack, chacun par
//   Start, son attestation, puis retour sur sa ligne, cochée ; les flippers descendent de la liste à
//   « Récupérer les n parties cochées » ;
// - la réception lancée une fois : son écran (barre, « Lancée à … : rien d'autre à faire »), puis
//   « Continuer en arrière-plan » : la fiche de la table la montre, la ligne de la table dans la
//   bibliothèque de l'ami aussi (badge, barre) ; Start sur cette ligne mène à la réception, jamais à
//   une seconde ; l'ami se déconnecte (« En attente de Bruno »), revient, la table arrive (« Reçue ·
//   à installer », « Installer dans ma bibliothèque » d'abord, ici comme dans Téléchargements) ;
// - un média refusé par les contrôles de l'ami est sauté, avec sa raison exacte (« média refusé par
//   les contrôles : … »), et le reste de la table arrive.
// La vraie gestion des tables, son gestionnaire de téléchargements et le vrai transport d'un ami
// (download-sources.ts) ; l'ami et ses fichiers sont simulés (fetchFile écrit le partiel) : aucun
// réseau, VPX n'est jamais lancé. Borne (playfield 1920×1080 couché, rendu tourné d'un quart de
// tour) et poste (paysage 1920×1080), en français et en anglais. Aucune fenêtre n'apparaît : lancé
// par docs\demo-reception-ami.ps1 sur le bureau caché. Captures, relevé (resultat.txt) et contrôle
// de la mise en page dans tmp\demo-reception-ami\captures.
//   npx electron docs\demo-reception-ami.cjs

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-reception-ami');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { createFriendLibraryMenu } = require(path.join(WT, 'app', 'dist', 'friend-library-menu.js'));
const { friendTransport } = require(path.join(WT, 'app', 'dist', 'download-sources.js'));
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

/** Mes tables inventées ; l'ami en a deux, dont une que je n'ai pas. */
const MINE = [
  { title: 'Neon Abyss', maker: 'Orbital Works', year: 1994 },
  { title: 'Midnight Circuit', maker: 'Halcyon', year: 1989 },
];
const THEIRS = { id: 'comet', table: { title: 'Comet Lounge', manufacturer: 'Voltage Games', year: 1992 }, version: 'VPW 1.2', medias: [] };
const KB = 1024;
/** Les fichiers de sa table, par partie : la table d'abord (la plus lourde), la ROM, le PuP-Pack, les sons. */
const FILES = [
  { id: 'f1', rel: 'Comet Lounge (Voltage Games 1992) VPW 1.2.vpx', bytes: 2600 * KB, part: 'table' },
  { id: 'f2', rel: 'Comet Lounge (Voltage Games 1992) VPW 1.2.directb2s', bytes: 900 * KB, part: 'b2s' },
  { id: 'f3', rel: 'roms/comet_l2.zip', bytes: 300 * KB, part: 'rom' },
  { id: 'f4', rel: 'pupvideos/comet_l2/intro.mp4', bytes: 3200 * KB, part: 'pup' },
  { id: 'f5', rel: 'altsound/comet_l2/altsound.csv', bytes: 1400 * KB, part: 'altsound' },
  { id: 'f6', rel: 'medias/(GameInfo) Comet Lounge (Voltage Games 1992).png', bytes: 600 * KB, part: 'media' },
];
/** Refusé par les contrôles de l'ami à l'envoi : sauté, avec sa raison, sans arrêter la table. */
const REFUSED = 'f6';

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
  const T = (fr, params) => core.t(fr, params);
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

  // ---------- L'ami simulé : en ligne ou non, et ce qu'il envoie ----------
  let online = true;
  /** « hold » : le premier fichier s'arrête à 85 % (la réception tourne) ; « go » : tout arrive. */
  const gate = { mode: 'hold', waiters: new Set() };
  const release = () => {
    for (const w of gate.waiters) w();
    gate.waiters.clear();
  };
  const net = { state: () => ({ friends: [{ key: 'bruno', name: 'Bruno' }] }), online: () => online };
  const content = {
    library: () => ({ state: 'ready', library: { at: new Date().toISOString(), tables: [THEIRS, { id: 'neon', table: { title: 'Neon Abyss', manufacturer: 'Orbital Works', year: 1994 }, version: 'VPW 1.2', medias: [] }] } }),
    refresh() {},
    tableVersions: () => new Map(),
    fetch: async (_key, _id, medias) => ({ received: [], failed: medias.map((media) => ({ media, reason: 'offline' })) }),
    tableFiles: async () => FILES,
    fetchTable: async (_key, _id, folder, files) => ({ dir: path.join(L.data, 'amis', 'tables', folder), received: [], failed: files.map((file) => ({ file, reason: 'offline' })) }),
    // Le partiel grandit sur le disque, comme chez friend-content.ts : la file en lit la taille.
    fetchFile: async (_key, _table, id, target, part, onBytes, signal, expect) => {
      const bytes = expect ?? 0;
      if (id === REFUSED && gate.mode === 'go') return { reason: 'refused' };
      fs.mkdirSync(path.dirname(part), { recursive: true });
      let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
      const grow = (to) => {
        if (to <= have) return;
        fs.appendFileSync(part, Buffer.alloc(to - have));
        have = to;
        onBytes?.(have);
      };
      for (;;) {
        if (signal?.aborted) return { reason: 'cancelled' };
        if (!online) return { reason: 'offline' };
        if (gate.mode === 'go') break;
        grow(Math.floor(bytes * 0.85));
        await new Promise((r) => {
          gate.waiters.add(r);
          signal?.addEventListener('abort', r, { once: true });
        });
      }
      grow(bytes);
      fs.mkdirSync(path.dirname(target.dest), { recursive: true });
      fs.renameSync(part, target.dest);
      return { file: target.dest, bytes, sha256: '0'.repeat(64) };
    },
    tableDir: (folder) => path.join(L.data, 'amis', 'tables', `demo-${Date.now()}`, folder),
    receivedDir: () => path.join(L.data, 'amis', 'recus'),
    stop() {},
  };
  library.downloads.setTransport('friend', friendTransport(content, net));
  // Comme friends-menu.ts : la file connaît l'ami (son nom, son écran de retour).
  library.downloads.friends({ has: (key) => key === 'bruno', name: (key) => (key === 'bruno' ? 'Bruno' : undefined) });
  const manager = library.downloads.manager;
  const friends = createFriendLibraryMenu({ library, net, content, downloads: library.downloads, live: { inviteOn() {} }, tables: () => tables, root: () => root, redraw: () => send() });

  const name = `${sc.name}-${sc.lang}`;
  const dir = path.join(CAPTURES, name);
  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  const view = () => library.view();
  const chosen = () => view()?.actions[view().cursor]?.label;
  const zone = () => view()?.zone;
  const rows = () => (view()?.sections ?? []).flatMap((s) => s.rows);
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
    log.push(`${name}/${file} : ${v?.heading} | zone : ${zone() ? zone().active : 'aucune'} | choisi : ${chosen() ?? '-'} | file : ${manager.jobs().map((j) => `${j.state}${j.delivered ? '/rendu' : ''}`).join(', ') || 'vide'}`);
    for (const s of v?.sections ?? []) for (const r of s.rows) log.push(`   [${s.title ?? ''}] ${r.text}${r.badges?.length ? ` {${r.badges.join(', ')}}` : ''} — ${r.detail ?? ''}${r.note ? ` (${r.note.sign} ${r.note.text})` : ''}${r.progress ? ` [barre ${r.progress.value === undefined ? '…' : Math.round(r.progress.value * 100) + ' %'}]` : ''}`);
  }
  const input = (type, code) => ({ type, code, key: '', isAutoRepeat: false, shift: false, control: false, alt: false, meta: false });
  const press = async (code, n = 1) => {
    for (let i = 0; i < n; i++) {
      library.handleKey(input('keyDown', code));
      library.handleKeyUp(input('keyUp', code));
    }
    await settle();
  };
  const expect = (cond, what) => {
    if (!cond) throw new Error(`${name} : ${what}`);
  };
  const until = async (cond, what, ms = 15000) => {
    for (const end = Date.now() + ms; Date.now() < end; await delay(100)) if (cond()) return;
    throw new Error(`${name} : ${what} (attendu ${ms} ms)`);
  };
  const [RIGHT, START, EXIT] = [KEYS.next[0], KEYS.confirm[0], KEYS.exit[0]];
  const MAGNA = ZONE[0];
  /** Flipper droit jusqu'à l'élément dont le libellé commence par `label` (au plus 20 appuis). */
  const reach = async (label) => {
    for (let i = 0; i < 20 && !chosen()?.startsWith(label); i++) await press(RIGHT);
    expect(chosen()?.startsWith(label), `les flippers devraient mener à « ${label} » (${chosen()})`);
  };
  const cometLine = `${THEIRS.table.title} (${THEIRS.table.manufacturer} ${THEIRS.table.year})`;
  const badgeOf = (text) => rows().find((r) => r.text === text)?.badges ?? [];
  const noteOf = (text) => rows().find((r) => r.text === text)?.note?.text;

  // 1. La bibliothèque de l'ami, la table qu'on n'a pas, puis « Récupérer toute la table ».
  library.openSystem();
  friends.open('bruno', () => library.openSystem());
  await settle();
  await shot('bibliotheque');
  await reach(cometLine);
  await press(START);
  expect(chosen() === T('Récupérer toute la table'), `fiche de la table : « Récupérer toute la table » d’abord (${chosen()})`);
  await shot('fiche-table');
  await press(START);
  await until(() => view()?.actions.length > 2, 'les parties de sa table');
  await settle();

  // 2. L'écran des parties : dans la liste, sur la table ; la ROM, son attestation, cochée.
  expect(zone()?.active === 'list' && chosen() === core.partLabel('table'), `l’écran des parties s’ouvre dans la liste, sur la table (${zone()?.active}, ${chosen()})`);
  expect(badgeOf(core.partLabel('rom'))[0] === T('Non cochée'), 'la ROM, non cochée');
  await shot('parties-ouverture');
  await reach(core.partLabel('rom'));
  await shot('parties-sur-la-rom');
  await press(START);
  expect(view().heading === T('La ROM : vos droits'), `Start sur la ROM : l’attestation (${view().heading})`);
  await shot('attestation');
  await press(START);
  expect(chosen() === T('Prendre la ROM'), `attestation cochée : le curseur sur « Prendre la ROM » (${chosen()})`);
  await shot('attestation-cochee');
  await press(START);
  expect(view().heading === T('Récupérer toute la table') && chosen() === core.partLabel('rom'), `retour sur la ligne de la ROM (${chosen()})`);
  expect(badgeOf(core.partLabel('rom'))[0] === T('Cochée'), 'la ROM, cochée');
  await shot('parties-rom-cochee');
  // Le PuP-Pack, même règle : non coché, il dit comment le prendre ; Start, son attestation, coché.
  expect(noteOf(core.partLabel('pup')) === T('Disponible, à cocher vous-même : Start, puis l’attestation de vos droits'), `le PuP-Pack dit comment le prendre (${noteOf(core.partLabel('pup'))})`);
  await reach(core.partLabel('pup'));
  await press(START);
  expect(view().heading === T('Le PuP-Pack : vos droits'), `Start sur le PuP-Pack : son attestation (${view().heading})`);
  await shot('attestation-pup');
  await press(START);
  expect(chosen() === T('Prendre le PuP-Pack'), `attestation cochée : le curseur sur « Prendre le PuP-Pack » (${chosen()})`);
  await press(START);
  expect(chosen() === core.partLabel('pup') && badgeOf(core.partLabel('pup'))[0] === T('Cochée'), `retour sur la ligne du PuP-Pack, cochée (${chosen()})`);
  await shot('parties-pup-coche');
  const getAll = core.tn(6, 'Récupérer la partie cochée', 'Récupérer les {n} parties cochées');
  await reach(getAll);
  expect(zone()?.active === 'actions', 'les flippers passent de la liste aux actions');
  await shot('parties-actions');
  await press(MAGNA);
  expect(zone()?.active === 'list' && chosen() === core.partLabel('media'), `MagnaSave ramène dans la liste, sur la dernière partie quittée (${chosen()})`);
  await press(MAGNA);
  expect(chosen()?.startsWith(getAll) || chosen() === T('Retour'), `MagnaSave rebascule vers les actions (${chosen()})`);
  await reach(getAll);

  // 3. La réception, lancée une fois ; puis en arrière-plan, visible sur la table et dans la bibliothèque.
  await press(START);
  expect(view().heading === T('Réception de la table'), `écran de la réception (${view().heading})`);
  await until(() => rows().some((r) => r.text === T('Réception en cours') && r.progress?.value > 0.15), 'la réception avance');
  await shot('reception');
  expect(chosen() === T('Continuer en arrière-plan'), `sortie évidente : « Continuer en arrière-plan » d’abord (${chosen()})`);
  await press(START);
  expect(chosen() === T('Voir la réception de la table') && !view().actions.some((a) => a.label === T('Récupérer toute la table')), `la fiche montre la réception, plus rien pour la relancer (${chosen()})`);
  await shot('fiche-en-cours');
  await press(EXIT);
  expect(badgeOf(cometLine)[0] === T('Réception en cours'), `la ligne de la table : « Réception en cours » (${badgeOf(cometLine)})`);
  await reach(cometLine);
  await shot('bibliotheque-en-cours');
  for (let i = 0; i < 3; i++) {
    await reach(cometLine);
    await press(START);
    expect(view().heading === T('Réception de la table'), `Start sur la table : sa réception (${view().heading})`);
    await press(EXIT);
  }
  expect(manager.jobs().length === 1, `une seule réception dans la file (${manager.jobs().length})`);

  // 4. L'ami se déconnecte : en attente ; il revient, tout arrive : reçue, à installer.
  online = false;
  release();
  await until(() => manager.jobs()[0]?.state === 'waiting', 'en attente de l’ami');
  await settle();
  expect(badgeOf(cometLine)[0] === T('En attente de {name}', { name: 'Bruno' }), `« En attente de Bruno » (${badgeOf(cometLine)})`);
  await shot('bibliotheque-en-attente');
  online = true;
  gate.mode = 'go';
  manager.poke();
  await until(() => manager.jobs()[0]?.state === 'done', 'la table reçue');
  await settle();
  expect(badgeOf(cometLine)[0] === T('Reçue · à installer'), `« Reçue · à installer » (${badgeOf(cometLine)})`);
  await shot('bibliotheque-recue');
  await reach(cometLine);
  await press(START);
  expect(view().actions.map((a) => a.label).join('|') === [T('Installer dans ma bibliothèque'), T('Récupérer de nouveau'), T('Retour')].join('|'), `reçue : ${view().actions.map((a) => a.label).join(' | ')}`);
  expect(rows().some((r) => r.text === T('Reçue, pas encore installée')), 'reçue, pas encore installée');
  const skipped = rows().find((r) => r.text === core.tn(1, '{n} fichier sauté', '{n} fichiers sautés'));
  expect(skipped?.detail === T('média refusé par les contrôles : {file}', { file: FILES[5].rel }), `le média refusé, sauté avec sa raison (${skipped?.detail})`);
  await shot('reception-recue');
  expect(manager.jobs().length === 1, 'toujours une seule réception');

  // 5. Téléchargements (menu système) : la fiche de la table reçue, la suite d'abord.
  library.downloads.open();
  await settle();
  await shot('telechargements');
  await reach(manager.jobs()[0].title);
  await press(START);
  expect(chosen() === T('Installer dans ma bibliothèque'), `fiche du téléchargement fini : « Installer dans ma bibliothèque » d’abord (${chosen()})`);
  expect(rows().some((r) => r.detail?.includes(T('Reçue, pas encore installée'))), 'la fiche dit « Reçue, pas encore installée »');
  expect(!view().actions.some((a) => a.label.startsWith(T('Revenir à {screen}', { screen: '' }).trim())), 'plus de « Revenir à… » sur un travail fini qui a sa suite');
  await shot('telechargements-fiche');

  manager.stop();
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
