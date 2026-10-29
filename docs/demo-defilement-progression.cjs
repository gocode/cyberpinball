// Démonstration hors écran du défilement gardé pendant un téléchargement (app/renderer/scroll-keeper.js),
// dans le vrai rendu du menu (frontend.html) : écran de propositions de médias, douze cartes, la
// dernière en téléchargement. La liste est remontée à la vraie molette, puis la progression avance
// par tics : la liste ne doit pas bouger, ni le diagnostic se plaindre. Un flipper (choix changé)
// ramène la carte choisie dans la vue ; un autre écran repart du haut ; un défilement posé sans
// geste est relevé par le diagnostic. Octobre 2026, « Chargement : propositions » de The Matrix :
// chaque tic ramenait la liste sur la carte qui télécharge.
// Aucune fenêtre n'apparaît : lancé par docs\demo-defilement-progression.ps1 sur le bureau caché.
// Captures et relevé (resultat.txt) dans tmp\demo-defilement-progression.

const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
// Fenêtre hors écran de l'application (échelle 1, son coupé, guet) : CYBERPINBALL_HORS_ECRAN posé par le script.
const { createWindow } = require(path.join(WT, 'app', 'dist', 'offscreen.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const BASE = path.join(WT, 'tmp', 'demo-defilement-progression');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const failures = [];
const note = (line) => {
  lines.push(line);
  console.log(line);
};
const expect = (ok, line) => {
  note(`${ok ? 'ok ' : 'ÉCHEC'} ${line}`);
  if (!ok) failures.push(line);
};

/** Écran de propositions : douze cartes, la dernière en téléchargement (`progress`). */
function proposals(cursor, progress, heading = 'Chargement : propositions', notice = false, grown = false) {
  const cards = Array.from({ length: 12 }, (_, i) => ({
    action: i,
    title: `Proposition ${i + 1}`,
    code: 'VPUniverse',
    thumb: { kind: 'image', rotation: 0, text: '' },
    facts: 'Loading Animations · mars 2023',
    ...(grown && i === cursor ? { extra: ['Choisi, à enregistrer', 'Une ligne de plus', 'Et encore une', 'Et une dernière'] } : {}),
    ...(i === 11 ? { state: { label: `Attente du site · ${Math.round(30 - progress * 30)} s`, tone: 'info' }, progress, pending: 'Le site décompte lui-même.' } : {}),
  }));
  const sections = notice ? [{ rows: [{ text: 'Non connecté · 1 résultat visible ; le téléchargement demande votre compte (gratuit)', tone: 'warning' }] }] : [];
  const actions = [...cards.map((c) => ({ label: c.title })), { label: 'Arrêter la file' }, { label: 'Retour' }];
  // Les cartes sont la liste de contenu de l'écran : dans son cadre, avec son repère, comme
  // library.ts (zoneView) le décrit au rendu. Zones calculées par le cœur, jamais recopiées.
  const zones = core.screenZones({ sections, media: { cards } }, actions.length);
  const inList = zones.list.includes(cursor);
  const zone = {
    active: inList ? 'list' : 'actions',
    listCursor: inList ? cursor : zones.list[0],
    position: inList ? zones.list.indexOf(cursor) + 1 : undefined,
    total: zones.list.length,
    tag: inList ? { key: 'Exit', text: 'Sortir de la liste' } : { key: 'MagnaSave', text: 'Revenir à la liste' },
  };
  return {
    role: 'playfield',
    phase: 'library',
    help: false,
    count: 1,
    position: 1,
    neighbors: [],
    footer: [],
    gameKeys: [],
    menuKeys: [],
    nav: {},
    library: {
      screen: 'custom',
      heading,
      subheading: 'The Matrix',
      lead: 'Démonstration du défilement gardé.',
      back: 'Retour',
      hint: '',
      // Bandeau d'un site arrivé en cours de route, en tête de la liste (GOTG, octobre 2026).
      sections,
      cursor,
      zone,
      media: { cards },
      actions,
    },
  };
}

// Profil Chromium à part : celui d'Electron par défaut peut être tenu par une autre démonstration.
fs.rmSync(BASE, { recursive: true, force: true });
fs.mkdirSync(BASE, { recursive: true });
app.setPath('userData', path.join(BASE, 'profil'));

app.whenReady().then(async () => {
  ipcMain.on('i18n', (event) => {
    event.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) };
  });
  const report = new LayoutReport(BASE);
  const win = createWindow({
    frame: false,
    show: false,
    backgroundColor: '#030807',
    width: 1920,
    height: 1080,
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
  // Une fenêtre hors écran jamais montrée ne peint rien (ni capture, ni molette) sans cela.
  win.webContents.startPainting();
  const ready = new Promise((r) => ipcMain.once('ready', r));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: '0', zones: '[]' } });
  await ready;
  win.webContents.invalidate();
  await delay(1000);
  const js = (code) => win.webContents.executeJavaScript(code);
  const send = async (state) => {
    win.webContents.send('state', state);
    await delay(300);
  };
  const top = () => js(`Math.round(document.querySelector('.lib-content').scrollTop)`);
  const drifts = () => js('CyberScroll.takeDrifts()');
  const selectedVisible = () =>
    js(`(() => { const l = document.querySelector('.lib-content').getBoundingClientRect(); const c = document.querySelector('.media-card.selected')?.getBoundingClientRect(); return Boolean(c) && c.top >= l.top - 1 && c.bottom <= l.bottom + 1; })()`);
  // Capture, et garde-fou de mise en page (défilement sans geste compris) : avant les relevés
  // du diagnostic de la démonstration, qui les viderait.
  const shot = async (name) => {
    await report.check(win.webContents, name);
    fs.writeFileSync(path.join(BASE, `${name}.png`), (await win.capturePage()).toPNG());
  };

  try {
    await send(proposals(11, 0.1));
    const opened = await top();
    expect(opened > 0 && (await selectedVisible()), `écran ouvert : la carte qui télécharge est dans la vue (défilement ${opened})`);
    await shot('1-ouvert');

    // Vraie molette, au-dessus de la liste : l'utilisateur remonte voir les autres propositions.
    const [x, y] = await js(`(() => { const r = document.querySelector('.lib-content').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    for (let i = 0; i < 6; i++) {
      win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: 240, canScroll: true });
      await delay(60);
    }
    await delay(500);
    const wheeled = await top();
    expect(wheeled < opened, `molette : la liste remonte (${opened} → ${wheeled})`);
    expect((await drifts()).length === 0, 'molette : un geste, aucun défilement inattendu');
    await shot('2-molette');

    // Les tics de progression arrivent bien après le geste.
    await delay(2000);
    for (const progress of [0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      await send(proposals(11, progress));
      const now = await top();
      expect(now === wheeled, `progression ${Math.round(progress * 100)} % : la liste reste à ${wheeled} (${now})`);
    }
    expect((await drifts()).length === 0, 'progression : aucun défilement sans geste');
    await shot('3-progression');

    // Flipper : le choix passe à la carte d'avant, ramenée dans la vue.
    await send(proposals(10, 0.95));
    expect(await selectedVisible(), `flipper : la carte choisie est dans la vue (défilement ${await top()})`);
    expect((await drifts()).length === 0, 'flipper : le défilement vient du changement de choix');
    await shot('4-flipper');

    // Un bandeau arrive en tête de la liste : la carte choisie reste où elle était à l'écran.
    const placeOf = () => js(`Math.round(document.querySelector('.media-card.selected').getBoundingClientRect().top)`);
    const before = await placeOf();
    await send(proposals(10, 0.95, 'Chargement : propositions', true));
    const after = await placeOf();
    expect(Math.abs(after - before) <= 1 && (await selectedVisible()), `bandeau inséré au-dessus : la carte choisie ne bouge pas (${before} → ${after})`);
    expect((await drifts()).length === 0, 'bandeau : aucun défilement sans geste');
    await shot('5-bandeau');

    // La carte choisie, entière dans la vue, grandit : la liste avance juste assez pour qu'elle le reste.
    await send(proposals(10, 0.95, 'Chargement : propositions', true, true));
    expect(await selectedVisible(), `carte choisie agrandie : toujours entière dans la vue (défilement ${await top()})`);
    expect((await drifts()).length === 0, 'carte agrandie : aucun défilement sans geste');

    // Un autre écran repart du haut.
    await send(proposals(0, 0.95, 'Afficheur large : propositions'));
    expect((await top()) === 0, 'autre écran : la liste repart du haut');

    // Diagnostic : un défilement posé sans geste est relevé.
    await send(proposals(11, 0.95));
    await delay(2000);
    await drifts();
    await js(`document.querySelector('.lib-content').scrollTop = 120; true`);
    await delay(300);
    const found = await drifts();
    expect(found.length === 1, `diagnostic : défilement sans geste relevé (${found.join(' ; ')})`);
  } catch (error) {
    failures.push(String(error?.stack ?? error));
    note(`ÉCHEC ${error?.stack ?? error}`);
  }
  report.save();
  const layout = fs.readFileSync(path.join(BASE, 'mise-en-page.txt'), 'utf8').trim();
  expect(/^Aucun problème/.test(layout), `garde-fou de mise en page : ${layout.split(/\r?\n/).join(' ; ')}`);
  fs.writeFileSync(path.join(BASE, 'resultat.txt'), `${lines.join('\n')}\n${failures.length ? `${failures.length} échec(s)` : 'Aucun échec'}\n`);
  app.exit(failures.length ? 1 : 0);
});
