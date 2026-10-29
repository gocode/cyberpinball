// Démonstration hors écran de « Santé de la borne » (lancée par docs\demo-sante.ps1), sur un
// bac à sable : cinq tables inventées (deux sans leur ROM, une qui a planté, une saine, une
// jamais analysée), un index de VPinMediaDB qui a des médias pour deux d'entre elles, VPX
// 10.8.0 installé quand Cyber Pinball connaît plus récent, deux configurations de la borne.
// Deux jeux d'écrans simulés (docs\ecrans) : la borne (playfield 4K couché, mise en page
// tournée de 90°), et le PC de développement (1920 × 1080, puis 1366 × 768), où la
// configuration retenue n'a plus aucun écran branché. En français et en anglais.
// Parcours : menu système (pastille), rubrique Borne, la page au premier relevé,
// le médecin d'une table et retour, « Médias manquants » et retour, la configuration de la
// borne et retour, « Vérifier maintenant » pendant le relevé. Captures, relevé (resultat.txt)
// et contrôle de la mise en page dans tmp\demo-sante\captures.
// --accueil : les images de la page du projet (README) ; les jeux inventés de docs\demo-jeux.cjs
// (ceux de docs\demo-captures.cjs), ROM inventée, sur les écrans de la borne seulement, en
// français et en anglais. Captures dans tmp\demo-sante-accueil\captures.
//   npm run build
//   .\docs\demo-sante.ps1 [-Accueil]

const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
/** Images de la page du projet : jeux inventés de la page, écrans de la borne seulement. */
const ACCUEIL = process.argv.includes('--accueil');
const BASE = path.join(WT, 'tmp', ACCUEIL ? 'demo-sante-accueil' : 'demo-sante');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
const { rememberScript } = require(path.join(WT, 'app', 'dist', 'vbs.js'));
const { findComponent } = require(path.join(WT, 'packages', 'installer', 'dist', 'index.js'));
// Le guet hors écran (app\src\offscreen.ts) écrit son bilan dans le dossier des captures : demo-sante.ps1 le lit.
process.env.CYBERPINBALL_CAPTURE ??= CAPTURES;
const { createWindow } = require(path.join(WT, 'app', 'dist', 'offscreen.js'));
const { GAMES, tableName, game } = require('./demo-jeux.cjs');
let servedDirs = () => [];

const GB = 1024 ** 3;
const displaysOf = (name) => core.parseSimulatedDisplays(JSON.parse(fs.readFileSync(path.join(WT, 'docs', 'ecrans', `${name}.json`), 'utf8')), name);

/** Les écrans simulés, la fenêtre du playfield et l'espace libre du lecteur des tables. */
const SCREENS = [
  { name: 'borne', displays: 'borne', width: 3840, height: 2160, rotation: 90, free: 412 * GB },
  { name: 'bureau', displays: 'pc-dev', width: 1920, height: 1080, rotation: 0, free: 6.2 * GB },
];
const SCENARIOS = ACCUEIL
  ? [{ ...SCREENS[0], lang: 'fr' }, { ...SCREENS[0], lang: 'en' }]
  : [...SCREENS.flatMap((s) => [{ ...s, lang: 'fr' }, { ...s, lang: 'en' }]), { ...SCREENS[1], name: 'bureau-1366x768', width: 1366, height: 768, lang: 'fr' }];

const MM = 'Medieval Madness (Williams 1997)';
const AFM = 'Attack from Mars (Bally 1995)';
const T2 = 'Terminator 2 (Williams 1991)';
const LONG = 'Le très long titre d’une table imaginaire pour vérifier les débordements (Stern 2020)';
const XENON = 'Xenon (Bally 1980)';
const MEDIADB = 'https://raw.githubusercontent.com/superhac/vpinmediadb/main';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function offscreen(width, height, extra = {}) {
  // Par createWindow : rendue hors écran (Use-HorsEcran), et surveillée par le guet.
  const win = createWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}
function put(file, data = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

/** Modèle de borne pour ces écrans : playfield sur le dernier, fronton sur le premier. */
function cabinetFor(displays) {
  const screens = displays.map(core.toPhysicalScreen);
  return {
    version: 1,
    screens,
    roles: { playfield: screens.at(-1).fingerprint, backglass: screens[0].fingerprint },
    playfield: { flipperEdge: 'bottom' },
    vpx: { iniPath: 'VPinballX.ini' },
    updatedAt: '',
  };
}

function sandbox(name, lang) {
  const box = path.join(BASE, name);
  const root = path.join(box, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads, L.roms]) fs.mkdirSync(d, { recursive: true });
  const table = (title, vpsId) => {
    const file = put(path.join(L.tables, title, `${title}.vpx`), 'x'.repeat(4096));
    const [, game, maker, year] = /^(.*) \(([^()]+) (\d{4})\)$/.exec(title);
    put(path.join(L.tables, title, `${title}.info`), JSON.stringify({ Info: { Title: game, Manufacturer: maker, Year: Number(year), ...(vpsId && { VPSId: vpsId }) } }));
    return file;
  };
  const entry = (id) => ({ wheel: `${MEDIADB}/${id}/wheel.png`, bg: `${MEDIADB}/${id}/bg.png`, '1k': { table: `${MEDIADB}/${id}/1k/table.png` } });
  let files;
  if (ACCUEIL) {
    // Les sept jeux inventés de la page : Midnight Circuit sans sa ROM (inventée), Lunar Diner et
    // Copper Comet sans médias, que VPinMediaDB peut fournir. Pas de rapport de plantage : la page
    // tient alors sur l'écran, de l'espace disque à VPX.
    const of = (title, vpsId) => table(tableName(game(title)), vpsId);
    files = { mm: of('Midnight Circuit', 'mdcVps1998'), afm: of('Lunar Diner', 'ldnVps1964'), comet: of('Copper Comet', 'ccmVps1983'), t2: of('Atlas Rising') };
    files.healthy = GAMES.filter((g) => !['Midnight Circuit', 'Lunar Diner', 'Copper Comet', 'Atlas Rising'].includes(g.title)).map((g) => of(g.title));
    put(path.join(L.downloads, core.MEDIADB_INDEX_FILE), JSON.stringify({ ldnVps1964: entry('ldnVps1964'), ccmVps1983: entry('ccmVps1983') }));
  } else {
    files = { mm: table(MM, 'mmVps1997'), afm: table(AFM, 'afmVps1995'), t2: table(T2), long: table(LONG), xenon: table(XENON) };
    // Une vraie collection : 200 tables électromécaniques saines, qui ne demandent aucune ROM.
    files.healthy = Array.from({ length: 200 }, (_, i) => table(`Table saine ${String(i + 1).padStart(3, '0')} (Gottlieb ${1950 + (i % 30)})`));
    put(path.join(L.tables, T2, 'crash.txt'), 'Reason: EXCEPTION_ACCESS_VIOLATION\r\n');
    // Index de VPinMediaDB déjà téléchargé : des médias pour Medieval Madness et Attack from Mars.
    put(path.join(L.downloads, core.MEDIADB_INDEX_FILE), JSON.stringify({ mmVps1997: entry('mmVps1997'), afmVps1995: entry('afmVps1995') }));
  }
  // Deux configurations de la borne ; la borne du salon est celle retenue (noms donnés par l'utilisateur : dans sa langue).
  const english = ACCUEIL && lang === 'en';
  let set = core.addConfiguration(undefined, cabinetFor(displaysOf('borne')), english ? 'Living-room cabinet' : 'Borne du salon').set;
  set = core.addConfiguration(set, cabinetFor(displaysOf('pc-dev')), english ? 'Desk' : 'Bureau').set;
  core.saveCabinetSet(L.data, { ...set, active: set.configurations[0].id });
  return { root, L, files };
}

async function scenario(sc, box, report) {
  const { root, L, files } = box;
  core.setLanguage(sc.lang);
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  // Scripts déjà lus (le relevé ne lance jamais VPX) ; celui de Xenon ne l'a jamais été.
  // Page du projet : une ROM inventée (mcirc_l3), aucune table jamais analysée.
  rememberScript(files.mm, { usesPinmame: true, roms: [ACCUEIL ? 'mcirc_l3' : 'mm_109c'] }, L.data);
  if (files.long) rememberScript(files.long, { usesPinmame: true, roms: ['t2_l8'] }, L.data);
  if (files.comet) rememberScript(files.comet, { usesPinmame: false, roms: [] }, L.data);
  rememberScript(files.afm, { usesPinmame: false, roms: [] }, L.data);
  rememberScript(files.t2, { usesPinmame: false, roms: [] }, L.data);
  for (const file of files.healthy) rememberScript(file, { usesPinmame: false, roms: [] }, L.data);
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  const displays = displaysOf(sc.displays);
  let phase = 'library';
  let vpxInstalls = 0;
  const library = createLibrary({
    // Mode invité inactif : tout passe (host.guest est obligatoire, library.ts).
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
    windows: () => windows,
    broadcast: () => send(),
    installVpx: () => vpxInstalls++,
    displays: () => displays,
    vpxVersion: () => '10.8.0-2051',
    diskSpace: () => ({ free: sc.free, total: 931 * GB }),
  });
  // Entrées que fournit frontend.ts : ici, un écran qui dit où l'on est, et dont « Retour » remonte.
  const T = (fr) => core.t(fr);
  for (const id of ['cabinet', 'vpx-settings']) {
    library.provideSystemItem(id, { run: () => library.openNotice(core.SYSTEM_ITEMS[id].label, [T('Retour')], () => library.openSystem()) });
  }
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
  const log = [];
  let step = 0;
  const view = () => library.view();
  async function settle() {
    for (let i = 0; i < 200 && (view()?.busy || library.health.running()); i++) await delay(100);
    await delay(150);
  }
  async function shot(label, { wait = true } = {}) {
    if (wait) await settle();
    send();
    await delay(400);
    const file = `${String(step++).padStart(2, '0')}-${label}`;
    await report.check(win.webContents, `${name}/${file}`);
    fs.writeFileSync(path.join(dir, `${file}.png`), (await win.capturePage()).toPNG());
    const seen = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.health-line.selected, .lib-row.selected, .lib-action.current');
      if (!el) return 'aucun';
      // Page tournée (borne) : le haut de la liste est à droite de l'écran à 90°, à gauche à 270°.
      const turn = ${sc.rotation};
      const span = (rect) => turn === 90 ? [innerWidth - rect.right, innerWidth - rect.left] : turn === 270 ? [rect.left, rect.right] : [rect.top, rect.bottom];
      const [top, bottom] = span(el.getBoundingClientRect());
      let box = el.parentElement;
      while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
      const [boxTop, boxBottom] = box ? span(box.getBoundingClientRect()) : [0, Infinity];
      // Le bilan reste accroché en haut de la liste, avec une bande pleine dessous (son ombre portée,
      // sans flou : library.css) : la ligne choisie ne doit passer ni sous l'un ni sous l'autre.
      // (Le fondu ::after d'avant n'existe plus : sa hauteur « auto » rendait toute ligne « ROGNÉE ».)
      const summary = box && box.querySelector('.health-summary');
      let free = boxTop;
      if (summary) {
        const band = parseFloat((getComputedStyle(summary).boxShadow.match(/-?[0-9.]+px/g) || [])[1]) || 0;
        free = Math.max(boxTop, span(summary.getBoundingClientRect())[1] + band);
      }
      return top >= free - 1 && bottom <= boxBottom + 1 ? 'visible' : 'ROGNÉ';
    })()`);
    const v = view();
    log.push(`${name}/${file} : ${v?.heading} | choisi ${seen} : ${v?.actions[v.cursor]?.label ?? '-'}${v?.health ? ` | ${v.health.when}` : ''}`);
  }
  const act = async (label) => {
    await settle();
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
    await settle();
  };
  const key = async (code, n = 1) => {
    for (let i = 0; i < n; i++) library.handleKey({ type: 'keyDown', code, key: '', shift: false, control: false, alt: false, meta: false });
    await settle();
  };
  const expect = (cond, what) => {
    if (!cond) throw new Error(`${name} : ${what}`);
  };
  /** Exit jusqu'à quitter l'écran : le premier sort de la liste (« Sortir de la liste »), le suivant revient. */
  const leave = async () => {
    const heading = view().heading;
    for (let i = 0; i < 3 && view().heading === heading; i++) await key(KEYS.exit[0]);
    expect(view().heading !== heading, `Exit ne quitte pas « ${heading} »`);
  };
  const HEALTH = core.SYSTEM_ITEMS.health.label;
  const onHealth = (what) => expect(view().heading === HEALTH, `${what} : on devrait revenir à « ${HEALTH} » (${view().heading})`);

  // 1. Menu système, rubrique Borne, la page : premier relevé (rien de gardé), puis le bilan.
  library.openSystemRoot();
  await shot('menu-systeme-avant-releve');
  await act(core.SYSTEM_GROUPS.borne.label);
  const started = Date.now();
  await act(HEALTH);
  log.push(`${name} : relevé de ${tables.length} tables en ${((Date.now() - started) / 1000).toFixed(1)} s (en arrière-plan, la page affichée pendant ce temps)`);
  await shot('sante');
  const h = view().health;
  expect(h, 'aucun bilan après le relevé');
  const count = (state) => h.counts.find((c) => c.state === state).n;
  log.push(`${name} : ${count('blocking')} bloquant(s), ${count('check')} à vérifier, ${count('ok')} OK`);
  expect(count('blocking') >= (ACCUEIL ? 1 : 2), ACCUEIL ? 'une table sans ROM devrait être bloquante' : 'deux tables sans ROM devraient être bloquantes');
  expect(view().actions[view().cursor].label === T('Ouvrir le médecin de la table'), 'la sélection devrait être sur la première ligne bloquante');
  // La pastille remonte jusqu'à la rubrique et à la racine.
  await leave();
  await shot('rubrique-borne-pastille');
  expect(view().actions.find((a) => a.label === HEALTH)?.attention, 'pas de pastille sur « Santé de la borne »');
  library.openSystemRoot();
  await shot('menu-systeme-pastille');
  expect(view().actions.find((a) => a.label === core.SYSTEM_GROUPS.borne.label)?.attention, 'pas de pastille sur la rubrique Borne');
  expect(library.attention(), 'pas de pastille sur la roue dentée');
  await act(core.SYSTEM_GROUPS.borne.label);
  await act(HEALTH);

  // 2. Le médecin de la table bloquée, puis retour à la page.
  library.handleAction({ type: 'activate', index: view().cursor });
  await shot('medecin');
  expect(view().heading === T('Diagnostic'), `le médecin devrait s’ouvrir (${view().heading})`);
  await act(T('Retour'));
  onHealth('Retour du médecin');
  await shot('retour-du-medecin');

  // 3. Les médias que VPinMediaDB peut fournir (avertissement du premier usage), puis retour.
  await act(T('Voir les médias manquants'));
  await shot('medias-manquants');
  await act(T('Retour'));
  onHealth('Retour de « Médias manquants »');

  // 4. La configuration de la borne, puis retour.
  await act(T('Ouvrir la configuration de la borne'));
  await shot('configuration');
  await leave();
  onHealth('Retour de la configuration');

  // 5. VPX : la ligne mène à l'installation (comptée ici, jamais lancée).
  await act(core.t('Installer VPX {version}', { version: findComponent('vpx').version }));
  expect(vpxInstalls === 1, 'l’installation de VPX n’a pas été demandée');
  library.openSystemRoot();
  await act(core.SYSTEM_GROUPS.borne.label);
  await act(HEALTH);

  // 6. « Vérifier maintenant » : le dernier bilan reste, daté, pendant la nouvelle vérification.
  library.handleAction({ type: 'activate', index: view().actions.findIndex((a) => a.label === T('Vérifier maintenant')) });
  await shot('verification-en-cours', { wait: false });
  await shot('verifie');
  // La dernière ligne (depuis « Vérifier maintenant », un cran en arrière), puis la première :
  // chacune reste entièrement visible, la première sous le bilan accroché.
  await key(KEYS.previous[0]);
  expect(view().actions[view().cursor].detail === view().health.groups.at(-1).lines.at(-1).title, 'la dernière ligne devrait être choisie');
  await shot('derniere-ligne');
  await key(KEYS.previous[0], view().cursor);
  expect(view().cursor === 0, 'la première ligne devrait être choisie');
  await shot('premiere-ligne');

  ipcMain.removeListener('action', onAction);
  win.destroy();
  return log;
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  ipcMain.on('i18n', (event) => {
    event.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) };
  });
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = [];
  try {
    for (const sc of SCENARIOS) results.push(...(await scenario(sc, sandbox(`${sc.name}-${sc.lang}`, sc.lang), report)));
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  if (results.some((r) => r.includes('ROGNÉ'))) {
    results.push('ÉCHEC : un élément choisi n’est pas entièrement visible (voir ci-dessus).');
    process.exitCode = 1;
  }
  if (!fs.readFileSync(path.join(CAPTURES, 'mise-en-page.txt'), 'utf8').startsWith('Aucun problème')) {
    results.push('ÉCHEC : le garde-fou de mise en page a relevé des problèmes (mise-en-page.txt).');
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  // app.quit() rendrait 0 même en échec : le script PowerShell n'y verrait rien.
  app.exit(process.exitCode ?? 0);
});
