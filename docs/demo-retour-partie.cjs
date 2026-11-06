// Banc hors écran du retour d'une partie solo (lancé par docs\demo-retour-partie.ps1). Les vraies
// pages des fenêtres du menu (frontend.html, son preload, le protocole des médias) reçoivent
// l'état du menu des tables avec la part de chaque fenêtre dans le retour (s.bilan), tel que
// viewFor (frontend.ts) l'envoie, posée à un instant donné depuis le retour ; leurs animations
// sont figées à cet instant (document.getAnimations, currentTime 0 : l'heure de la pose) et
// chaque écran est capturé. Le DMD reçoit l'image du vrai moteur (dmdAnimation('record')) au
// même instant. Le contenu de la carte vient du vrai cœur (gameReturnCard) : un record à la
// première place, une troisième place, une table sans relevé (la durée seule), un badge.
// Les écrans d'un même instant sont assemblés en une planche (borne : fronton, DMD, plateau ;
// bureau : l'écran du bureau et le fronton). Sert aussi de maquette, relue par Codex.
//   electron docs/demo-retour-partie.cjs <spec.json>   { "root": racine des tables (demo-moments.cjs), "out": dossier des captures, "montages": [noms, facultatif] }
// Contrôles : garde-fou de mise en page (layout-check.ts) ; chaque fenêtre montre sa scène
// (plateau, fronton) ou aucune ; aucune couche du retour n'a de fond clair ; la carte d'une
// table sans relevé ne montre aucun score. Fenêtres jamais montrées (show: false, rendu hors
// écran, son coupé).

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

const NEON = 'Neon Galaxy (Williams 1992)';
const LONG = 'Le très long titre d’une table imaginaire pour vérifier les débordements du chargement et des écrans (Stern 2020)';
const FULL = { x: 0, y: 0, width: 1, height: 1 };
/** Fin d'une liste d'instants : la carte sur le départ, son fondu figé à +120 ms. */
const FIN = 'fin';

/** Tableaux d'honneur inventés, avant et après la partie (rien d'une vraie table). */
const board = (scores) => ({ file: 'VPReg.stg', storage: 'Imaginaire', scores: scores.map(([score, initials], i) => ({ rank: i + 1, score, initials })) });
const BEFORE = board([[75_000_000, 'AAA'], [52_000_000, 'BBB'], [31_500_000, 'CCC'], [20_000_000, 'DDD']]);
/** Ce que sait le retour de chaque partie (GameReturnFacts), pour le vrai cœur. */
const FACTS = {
  record: { ok: true, forced: false, seconds: 754, before: BEFORE, after: board([[84_520_310, 'JUL'], [75_000_000, 'AAA'], [52_000_000, 'BBB'], [31_500_000, 'CCC']]), entered: [{ rank: 1, score: 84_520_310, initials: 'JUL' }], badges: ['grand-champion'] },
  place: { ok: true, forced: false, seconds: 412, before: BEFORE, after: board([[75_000_000, 'AAA'], [52_000_000, 'BBB'], [44_210_000, 'JUL'], [31_500_000, 'CCC']]), entered: [{ rank: 3, score: 44_210_000, initials: 'JUL' }, { rank: 4, score: 31_500_000, initials: 'ZOE' }] },
  duree: { ok: true, forced: false, seconds: 1325, entered: [] },
  badge: { ok: true, forced: false, seconds: 3725, entered: [], badges: ['hour-on-table'] },
  premier: { ok: true, forced: false, seconds: 95, before: { file: 'VPReg.stg', storage: 'Imaginaire', scores: [] }, after: board([[1_234_560, 'AAA']]), entered: [{ rank: 1, score: 1_234_560, initials: 'AAA' }] },
};

/**
 * Montages : fenêtres (rôle, taille, rotation du plateau, zones), table jouée, partie (FACTS),
 * instants (ms depuis le retour). Borne : plateau debout, fronton et DMD sur leurs écrans ;
 * plateau couché et tourné ; bureau : plateau dans la fenêtre 16:9, fronton sur un second écran.
 */
const BORNE = [
  { role: 'backglass', width: 1920, height: 1080, zones: [{ role: 'backglass', zone: FULL }] },
  { role: 'dmd', width: 1920, height: 480, zones: [{ role: 'dmd', zone: FULL }] },
  { role: 'playfield', width: 1080, height: 1920 },
];
const SETUPS = [
  { name: 'borne-record', table: NEON, facts: 'record', windows: BORNE, times: [120, 300, 520, 760, 1000, 1300, 3000, FIN] },
  { name: 'borne-place', table: NEON, facts: 'place', windows: BORNE, times: [3000] },
  { name: 'borne-premier', table: NEON, facts: 'premier', windows: BORNE, times: [3000] },
  { name: 'borne-duree', table: NEON, facts: 'duree', windows: BORNE, times: [120, 3000, FIN] },
  { name: 'borne-badge', table: NEON, facts: 'badge', windows: BORNE, times: [3000] },
  { name: 'borne-sans-logo', table: LONG, facts: 'record', windows: BORNE, times: [1000, 3000] },
  { name: 'borne-pivotee', table: NEON, facts: 'record', windows: [{ role: 'playfield', width: 3840, height: 2160, rotation: 90 }], times: [1000, 3000] },
  { name: 'borne-pivotee-duree', table: NEON, facts: 'duree', windows: [{ role: 'playfield', width: 3840, height: 2160, rotation: 90 }], times: [3000] },
  {
    name: 'bureau',
    table: NEON,
    facts: 'record',
    windows: [
      { role: 'backglass', width: 1366, height: 768, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'playfield', width: 1920, height: 1080 },
    ],
    times: [520, 1000, 3000],
  },
  { name: 'bureau-duree', table: NEON, facts: 'duree', windows: [{ role: 'playfield', width: 1920, height: 1080 }], times: [3000] },
  { name: 'bureau-4-3', table: LONG, facts: 'place', windows: [{ role: 'playfield', width: 1024, height: 768 }], times: [3000] },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});

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

/** État d'une fenêtre au menu des tables, comme viewFor (frontend.ts) : la table jouée choisie, sa roue. */
function stateFor(role, roles, medias, tables, table, bilan) {
  const index = tables.indexOf(table);
  const describe = (t) => ({ title: t.title, manufacturer: t.manufacturer, year: t.year, subtitle: [t.manufacturer, t.year].filter(Boolean).join(' · '), plays: 3, wheel: role === 'playfield' ? medias.wheel(t) : undefined });
  const neighbors = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((offset) => {
    const t = tables[(index + offset + tables.length * 10) % tables.length];
    return { offset, key: `${t.file}:${offset}`, title: t.title, manufacturer: t.manufacturer, year: t.year, wheel: role === 'playfield' ? medias.wheel(t) : undefined };
  });
  return {
    role,
    phase: 'menu',
    help: false,
    count: tables.length,
    position: index + 1,
    table: describe(table),
    neighbors,
    menuLayout: 'medaillons',
    medias: Object.fromEntries(roles.map((r) => [r, medias.roleMedia(table, r)])),
    preload: [],
    bilan,
    liveDmd: roles.includes('dmd') ? { area: core.liveDmdArea(undefined, { width: 1920, height: 480 }), framed: false } : undefined,
    footer: [['Flippers : choisir'], ['Start : fiche', 'Digit1'], ['Exit : menu', 'Escape']],
    menuKeys: [],
    gameKeys: core.gameKeys(undefined),
    loadingKeys: { title: '', rows: [], display: false },
    nav: { confirm: 'Digit1', exit: 'Escape', help: 'KeyH' },
  };
}

/** Fige les animations de la page à l'heure de leur pose ; le fondu de départ à +`fade` ms. */
const FREEZE = (fade) => `(() => {
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = a.animationName === 'cine-fin' ? ${fade} : 0;
  }
  // Aucune couche du retour n'a de fond clair (règle « jamais d'écran clair »).
  const light = [];
  for (const el of document.querySelectorAll('[data-bilan], [data-bilan] *')) {
    const c = getComputedStyle(el).backgroundColor.match(/[\\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    const alpha = c.length > 3 ? c[3] : 1;
    const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    if (alpha > 0.05 && lum > 0.3) light.push(el.className.baseVal ?? el.className);
  }
  return { light, etat: window.cyberEtat().bilan };
})()`;

/** Planche d'un instant : les captures posées comme sur la borne, ou comme au bureau. */
async function sheet(name, title, files) {
  const img = (role, style) => (files[role] ? `<figure style="${style}"><img src="${encodeURI(files[role])}"><figcaption>${role}</figcaption></figure>` : '');
  const pivot = name.includes('pivotee');
  const borne = name.startsWith('borne') && !pivot;
  const solo = !files.backglass;
  const width = borne ? 1300 : 1240;
  const height = borne ? 1780 : pivot ? 800 : solo ? 820 : 1150;
  const body = borne
    ? img('backglass', 'left:250px;top:80px;width:800px') + img('dmd', 'left:250px;top:550px;width:800px') + img('playfield', 'left:369px;top:770px;width:562px')
    : pivot || solo
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
  ipcMain.on('action', () => {});
  const tables = core.scanTables(path.join(spec.root, 'tables'));
  const byTitle = (title) => tables.find((t) => `${t.title} (${t.manufacturer} ${t.year})` === title || path.basename(t.file, '.vpx') === title);
  const dataDir = path.join(spec.out, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const allowed = new Set();
  serveMedias(() => [...allowed]);
  const problems = [];
  let id = 0;
  for (const setup of SETUPS.filter((s) => !spec.montages?.length || spec.montages.includes(s.name))) {
    const table = byTitle(setup.table);
    if (!table) {
      problems.push(`${setup.name} : table introuvable (${setup.table})`);
      continue;
    }
    const playfield = setup.windows.find((w) => w.role === 'playfield');
    const medias = new core.MenuMedias({ root: spec.root, dataDir, rotation: playfield?.rotation ?? 0, b2s: false });
    for (const dir of medias.allowedDirs(tables)) allowed.add(dir);
    const card = core.gameReturnCard(FACTS[setup.facts]);
    if (!card) {
      problems.push(`${setup.name} : pas de carte pour la partie ${setup.facts}`);
      continue;
    }
    for (const at of setup.times) {
      id++;
      const leaving = at === FIN;
      const T = leaving ? 3000 : at;
      const tag = leaving ? 'fin' : String(T).padStart(4, '0');
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
        // Le menu d'abord (médias, roue) ; puis le retour, à l'instant voulu.
        win.webContents.send('state', stateFor(w.role, roles, medias, tables, table, undefined));
        await wait(1200);
        const plateau = w.role === 'playfield';
        const fronton = roles.includes('backglass') && card.celebrate;
        const bilan = plateau || fronton ? { title: table.title, manufacturer: table.manufacturer, year: table.year, logo: medias.wheel(table), ...card, id, startedAt: Date.now() - T, ms: card.celebrate ? core.GAME_RETURN_MS.record : core.GAME_RETURN_MS.plain, plateau, fronton } : undefined;
        const state = stateFor(w.role, roles, medias, tables, table, bilan);
        win.webContents.send('state', state);
        if (roles.includes('dmd')) win.webContents.send('dmd', { media: false, dots: card.celebrate ? core.dmdAnimation('record', { label: core.dmdScore(card.record.value), head: card.record.dmd }).dots(T) : core.blankDots() });
        if (leaving) {
          await wait(50);
          // La page retire la couche quand son fondu est fini (minuteur de 240 ms) : à figer aussi, le temps de la capture.
          await win.webContents.executeJavaScript('window.setTimeout = () => 0; true');
          win.webContents.send('state', { ...state, bilan: bilan && { ...bilan, leaving: true } });
        }
        await wait(50);
        const seen = await win.webContents.executeJavaScript(FREEZE(120));
        await wait(300);
        const shot = await capture(win);
        const where = `${setup.name} ${leaving ? 'départ +120 ms' : `${T} ms`} ${w.role}`;
        const want = [plateau && 'plateau', fronton && 'fronton'].filter(Boolean).join(',');
        const got = seen.etat.map((s) => s.scene).join(',');
        if (got !== want) problems.push(`${where} : scène ${got || 'aucune'} au lieu de ${want || 'aucune'}`);
        if (leaving && seen.etat.some((s) => !s.fin)) problems.push(`${where} : la carte ne s'efface pas`);
        // Une table sans relevé : la durée seule, jamais un score.
        const shown = seen.etat.find((s) => s.scene === 'plateau');
        if (shown && !card.record && /\d{1,3}([  ,.]\d{3}){2,}/.test(`${shown.chiffre} ${shown.faits.join(' ')}`)) problems.push(`${where} : un score affiché sans relevé (${shown.chiffre})`);
        if (seen.light.length) problems.push(`${where} : fond clair dans le retour (${seen.light.join(', ')})`);
        const found = await checkLayout(win.webContents);
        for (const p of found) problems.push(`${where} : ${p}`);
        files[w.role] = `${setup.name}-${tag}-${w.role}.png`;
        fs.writeFileSync(path.join(spec.out, files[w.role]), shot.toPNG());
        console.log(`${where} : ${got || 'aucune scène'}${shown ? ` (${shown.titre} · ${shown.chiffre}${shown.ecart ? ` · ${shown.ecart}` : ''}${shown.faits.length ? ` · ${shown.faits.join(', ')}` : ''})` : ''}${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
        win.destroy();
      }
      const label = leaving ? 'la carte s’en va (+120 ms)' : `${T} ms depuis le retour`;
      fs.writeFileSync(path.join(spec.out, `planche-${setup.name}-${tag}.png`), (await sheet(setup.name, `${setup.name} · ${label}`, files)).toPNG());
    }
  }
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), `${problems.length ? problems.join('\n') : 'Aucun problème.'}\n`, 'utf8');
  console.log(problems.length ? `Retour de partie : ${problems.length} problème(s).\n${problems.join('\n')}` : 'Retour de partie : chaque écran montre sa part, aucun problème de mise en page.');
  app.exit(problems.length ? 1 : 0);
});
