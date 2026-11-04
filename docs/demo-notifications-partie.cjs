// Banc hors écran des notifications de la partie entre amis (essai réel du 31/10/2026 : un invité
// accepte pendant qu'on est sorti du salon, on finit avant les autres et on joue autre chose) et de
// celles qui se montrent partout (essai réel du 04/11/2026 : une invitation, un ami qui se connecte,
// aussi pendant les parties), lancé par docs\demo-notifications-partie.ps1. Les nouvelles viennent du vrai relevé et de la vraie
// file (livenotices.ts, notices.ts : textes, regroupement, tons), puis sont dessinées par les vraies
// pages, dans chacun de leurs lieux :
// - au menu des tables (frontend.html), avec les pastilles des amis et des téléchargements ;
// - dans le menu système (frontend.html, phase « library », l'écran « Mes amis ») ;
// - pendant la partie d'une autre table (game-notice.html, la fenêtre posée par-dessus VPX), à la
//   place que donne gameNoticeBounds sur chaque jeu d'écrans simulés (docs\ecrans), dans les
//   quatre sens du plateau, seule ou sous la carte d'une invitation, jamais sur la carte du départ
//   commun ; une planche par jeu d'écrans les montre à l'échelle sur le plateau.
// Chaque rendu passe le garde-fou de mise en page (chevauchement, rognure, texte sous 20 px) ; le
// relevé dans mise-en-page.txt doit rester muet.
//   electron docs/demo-notifications-partie.cjs <spec.json>   { "out": dossier des captures, "langue": "fr" | "en" }
// Noms inventés (Bruno est l'ami de démonstration). Fenêtres jamais montrées (rendu hors écran).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(process.argv.find((a) => a.endsWith('.json')), 'utf8').replace(/^﻿/, ''));

const { app, BrowserWindow, ipcMain } = require('electron');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
const { checkLayout } = require(path.join(REPO, 'app', 'dist', 'layout-check.js'));
const { serveMedias } = require(path.join(REPO, 'app', 'dist', 'media-protocol.js'));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});
for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, (error) => (console.error(error), app.exit(1)));
core.setLanguage(spec.langue === 'en' ? 'en' : 'fr');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Les nouvelles, par le vrai relevé et la vraie file

const ME = 'moi';
const TABLE = { table: { title: 'Glass Lagoon', roms: [] } };
const at = (s) => new Date(Date.parse('2026-10-31T20:00:00Z') + s * 1000);

function salon(names) {
  let g = core.newLiveGame({ key: ME, name: 'Alexis' }, TABLE, 'Glass Lagoon (Inventé 1987)', at(0));
  for (const name of names) g = core.inviteToGame(g, { key: name.toLowerCase(), name }, at(1));
  return g;
}

/** La notification que la file montrerait après ce changement de la partie. */
function noticeOf(before, after) {
  return viewOf(core.liveNotices(core.liveSnapshot(before, ME), core.liveSnapshot(after, ME), after, ME, 1000));
}

/** La notification que la file montrerait de ces évènements, hors du menu des tables (menu système, partie). */
function viewOf(events) {
  const center = core.createNoticeCenter();
  center.push(events);
  const view = center.tick(1000 + core.NOTICE_GATHER_MS, { canShow: true, away: true }).view;
  if (!view) throw new Error(`aucune notification pour ${JSON.stringify(events.map((e) => e.kind))}`);
  return view;
}

function finished(myScore) {
  let g = salon(['Bruno', 'Léa']);
  for (const key of ['bruno', 'léa']) g = core.settingsReceived(core.answerGame(g, key, 'accept', 'same'), key, true);
  g = core.startGame(g, at(10));
  for (const key of [ME, 'bruno', 'léa']) g = core.gameStatus(g, key, { state: 'playing' }, at(16));
  g = core.gameStatus(g, ME, { state: 'done', score: myScore }, at(140));
  g = core.gameStatus(g, 'léa', { state: 'done', score: 980_120 }, at(300));
  return [g, core.gameStatus(g, 'bruno', { state: 'done', score: 2_418_300 }, at(600))];
}

/** Des amis qui se connectent, par le vrai relevé du réseau des amis. */
function friendOnline(names) {
  const friends = names.map((name) => ({ key: name.toLowerCase().padEnd(64, '0'), name, since: at(0).toISOString(), events: [] }));
  const state = { ...core.newSocialState(at(0)), friends };
  const before = core.socialSnapshot(state, () => false, () => undefined);
  const after = core.socialSnapshot(state, () => true, () => undefined);
  return core.socialNotices(before, after, state, 1000);
}

function news() {
  const base = salon(['Bruno', 'Léa', 'David']);
  const both = core.answerGame(core.answerGame(base, 'bruno', 'accept', 'same'), 'léa', 'accept', 'same');
  const long = salon(['Maximilien-Alexandre', 'Anne-Charlotte', 'Bruno']);
  const longBoth = ['maximilien-alexandre', 'anne-charlotte', 'bruno'].reduce((g, k) => core.answerGame(g, k, 'accept', 'same'), long);
  const playing = (() => {
    let g = core.startGame(core.answerGame(base, 'bruno', 'accept', 'same'), at(10));
    for (const key of [ME, 'bruno']) g = core.gameStatus(g, key, { state: 'playing' }, at(16));
    return g;
  })();
  // Chaque nouvelle vient d'une file neuve (l'id « n1 ») : le menu la prendrait pour la même et garderait la précédente.
  const views = {
    acceptes: noticeOf(base, both),
    decline: noticeOf(base, core.answerGame(base, 'david', 'decline', 'missing')),
    'pas-de-reponse': noticeOf(both, core.expireInvites(both, at(200))),
    'noms-longs': noticeOf(long, longBoth),
    quitte: noticeOf(playing, core.gameStatus(playing, 'bruno', { state: 'left' }, at(60))),
    terminee: noticeOf(...finished(1_240_500)),
    gagnee: noticeOf(...finished(3_000_000)),
    // Essai réel du 04/11/2026 : l'invitation en une ligne, et un ami qui se connecte, aussi pendant les parties.
    invitation: viewOf(core.inviteNotices(new Set(), [core.liveInvite({ t: 'game-invite', game: { id: '0123456789abcdef', table: TABLE, title: 'Neon Harbor (Inventé 1986)', players: [] } }, { key: 'bruno', name: 'Bruno' }, at(0))], 1000)),
    'ami-connecte': viewOf(friendOnline(['Bruno'])),
    'amis-connectes': viewOf(friendOnline(['Bruno', 'Léa'])),
  };
  return Object.fromEntries(Object.entries(views).map(([name, view]) => [name, { ...view, id: name }]));
}

// ---------------------------------------------------------------------------
// Menu des tables et menu système (frontend.html)

const TABLES = ['Glass Lagoon', 'Neon Harbor', 'Comet Run', 'Iron Lagoon', 'Star Forge'].map((title, i) => ({ title, manufacturer: 'Inventé', year: String(1985 + i) }));
const neighbors = [-2, -1, 0, 1, 2].map((offset) => {
  const t = TABLES[(offset + TABLES.length) % TABLES.length];
  return { offset, key: t.title, title: t.title, manufacturer: t.manufacturer, year: t.year };
});

function menuState(notice) {
  const table = TABLES[0];
  return {
    role: 'playfield',
    phase: 'menu',
    help: false,
    count: TABLES.length,
    position: 1,
    table: { ...table, subtitle: `${table.manufacturer} · ${table.year}`, plays: 12 },
    neighbors,
    menuLayout: 'medaillons',
    medias: { playfield: core.defaultMediaView('playfield') },
    preload: [],
    footer: [],
    menuKeys: [],
    gameKeys: core.gameKeys(undefined),
    nav: { confirm: 'Digit1', exit: 'Escape', help: 'KeyH' },
    friendsOnline: { count: 3, title: core.t('{n} amis en ligne : {names}', { n: 3, names: 'Bruno, Léa et David' }) },
    downloads: { label: '1 · 45 %', value: 0.45, tone: 'info', icon: 'download', title: '1' },
    notice,
    zone: 'corner',
  };
}

/** Le compteur des amis, sur tout écran de Cyber Pinball (noticezone.ts). */
const COUNT = () => ({ count: 3, title: core.t('{n} amis en ligne : {names}', { n: 3, names: 'Bruno, Léa et David' }) });

/** Un écran plein de Cyber Pinball (aide, message), sa zone sur la ligne de la roue dentée. */
function overState(extra) {
  return (notice) => ({ ...menuState(notice), downloads: undefined, friendsOnline: COUNT(), zone: 'head', ...extra });
}

/** Un sous-écran profond du menu système (noticezone.ts : le compteur et toutes les notifications). */
function deepState(library) {
  return (notice) => ({ ...libraryState(notice), library: { ...libraryState(notice).library, ...library } });
}

/** « Mes amis », tel que friends-menu.ts le décrit : l'entrée de la partie en tête, puis les amis. */
function libraryState(notice) {
  const T = core.t;
  const friend = (name, detail) => ({ text: name, detail, icon: 'friend-list', tone: 'ok', badges: [T('En ligne')] });
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
    notice,
    friendsOnline: COUNT(),
    zone: 'head',
    library: {
      screen: 'custom',
      heading: T('Mes amis'),
      icon: 'friend-list',
      subheading: 'Alexis #8A12 · 3',
      back: T('Retour'),
      hint: '',
      cursor: 0,
      sections: [{ title: T('En ligne ({n})', { n: 3 }), rows: [friend('Bruno', 'Glass Lagoon'), friend('Léa', ''), friend('David', '')] }],
      actions: [{ label: `${T('Partie en direct')} : Glass Lagoon (Inventé 1987)`, icon: 'gamepad', attention: true }, { label: T('Trouver un joueur'), icon: 'friend-add' }, { label: T('Retour'), icon: 'back' }],
    },
  };
}

const SIZES = [
  [1080, 1920, '0', 'borne'],
  [1920, 1080, '90', 'borne-pivotee'],
  [1920, 1080, '0', 'bureau'],
  [1024, 768, '0', 'bureau-4-3'],
];

async function renderMenus(views, report) {
  serveMedias(() => []);
  for (const [w, h, rotation, suffix] of SIZES) {
    const win = new BrowserWindow({ show: false, frame: false, width: w, height: h, useContentSize: true, enableLargerThanScreen: true, backgroundColor: '#030807', webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true } });
    win.webContents.setAudioMuted(true);
    win.setBounds({ x: 0, y: 0, width: w, height: h });
    await win.loadFile(path.join(REPO, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation, zones: '[]' } });
    await delay(400);
    const T = core.t;
    const screens = [
      ['menu', menuState],
      ['menu-systeme', libraryState],
      // Deux sous-écrans profonds (essai réel du 04/11/2026 : « dans les autres écrans, rien ») : Amis > Partage et réseau, Médias > Médias, son et attente > Ordre des tables.
      ['partage-et-reseau', deepState({ heading: T('Partage et réseau'), icon: 'friends', subheading: '', sections: [{ title: T('Partage et réseau'), rows: [{ text: T('Limiter le débit des téléchargements…'), detail: T('Sans limite'), icon: 'download' }] }], actions: [{ label: T('Limiter le débit des téléchargements…'), icon: 'download' }, { label: T('Retour'), icon: 'back' }] })],
      // Comme menu-settings.ts (openTableOrder) : chaque ordre, sans icône, le choix actuel en vert.
      ['ordre-des-tables', deepState({ heading: T('Ordre des tables'), icon: 'sort', subheading: '', lead: T('Comment les médaillons se suivent dans la roue, et les titres dans la liste. La table choisie reste la même quand l’ordre change.'), sections: [], actions: [...core.TABLE_ORDERS.map((o, i) => ({ label: core.TABLE_ORDER_LABELS[o].charAt(0).toLocaleUpperCase() + core.TABLE_ORDER_LABELS[o].slice(1), ...(i === 0 ? { tone: 'ok' } : {}) })), { label: T('Retour') }] })],
      ['aide', overState({ help: true })],
      ['message', overState({ phase: 'message', table: undefined, message: { title: T('Installation de VPX'), lines: [T('Start ou Exit : revenir au menu.')] } })],
    ];
    for (const [where, state] of screens) {
      for (const [name, view] of Object.entries(views)) {
        const id = `${where}-${name}-${suffix}`;
        win.webContents.send('state', structuredClone(state(view)));
        await delay(700);
        fs.writeFileSync(path.join(spec.out, `${id}.png`), (await win.webContents.capturePage()).toPNG());
        const shown = await win.webContents.executeJavaScript(`(() => { const t = document.querySelector('.notice-toast'); return t ? t.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
        const count = await win.webContents.executeJavaScript(`!!document.querySelector('.friends-pill')`);
        let problems = await checkLayout(win.webContents);
        // Ce que l'écran a déjà sans la zone (le même état, sans compteur ni notification) n'est pas de la zone : dit à part.
        if (problems.length) {
          win.webContents.send('state', structuredClone({ ...state(view), zone: undefined, notice: undefined, friendsOnline: undefined }));
          await delay(500);
          const before = new Set(await checkLayout(win.webContents));
          const own = problems.filter((p) => !before.has(p));
          if (own.length < problems.length) report.push(`${id} sans la zone : déjà ${problems.length - own.length} problème(s) de l’écran lui-même, hors de ce banc`);
          problems = own;
          win.webContents.send('state', structuredClone(state(view)));
          await delay(500);
        }
        if (!shown) problems.push('notification absente');
        if (!count) problems.push('compteur des amis absent');
        else if (!shown.startsWith(view.title.slice(0, 12))) problems.push(`autre notification à l’écran : « ${shown} »`);
        report.push(`${id} : ${problems.length ? problems.join(' ; ') : 'conforme'}${shown ? ` (« ${shown} »)` : ''}`);
      }
    }
    win.destroy();
  }
}

// ---------------------------------------------------------------------------
// Pendant la partie d'une autre table (game-notice.html)

const LAYOUTS = {
  borne: { playfield: 0 },
  pincab: { playfield: 0 },
  'poste-deux-ecrans': { playfield: 2 },
  'un-ecran': { playfield: 0 },
};

function playfieldZone(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'ecrans', `${name}.json`), 'utf8').replace(/^﻿/, ''));
  return { ...core.parseSimulatedDisplays(raw, name)[LAYOUTS[name].playfield].bounds };
}

function closed(win) {
  return new Promise((resolve) => {
    win.once('closed', resolve);
    win.close();
  });
}

ipcMain.on('i18n', (e) => (e.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) }));
ipcMain.on('ready', () => {});
ipcMain.on('media-error', () => {});

async function renderNotice(bounds, state, file) {
  const win = new BrowserWindow({
    show: false,
    width: bounds.width,
    height: bounds.height,
    useContentSize: true,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'notice-preload.js'), contextIsolation: true, sandbox: true },
  });
  await win.loadFile(path.join(REPO, 'app', 'renderer', 'game-notice.html'));
  win.webContents.send('notice:state', state);
  await delay(500);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(file, image.toPNG());
  const problems = await checkLayout(win.webContents);
  await closed(win);
  return { image, problems };
}

async function renderInGame(views, report) {
  const invite = { id: '0123456789abcdef', host: { key: 'bruno', name: 'Bruno' }, table: TABLE, title: 'Neon Harbor (Inventé 1986)', players: [], receivedAt: new Date().toISOString() };
  const card = core.gameNoticeView(invite, new Date());
  const rendered = new Map();
  for (const name of Object.keys(LAYOUTS)) {
    const zone = playfieldZone(name);
    const unit = Math.min(zone.width, zone.height) / 1080;
    const size = (s) => ({ width: Math.round(s.width * unit), height: Math.round(s.height * unit) });
    const margin = Math.round(core.GAME_NOTICE_SIZE.margin * unit);
    const sheet = [];
    for (const rotation of [0, 90, 180, 270]) {
      const cardBounds = core.gameNoticeBounds(zone, rotation, size(core.GAME_NOTICE_SIZE.full), margin);
      for (const withInvite of [false, true]) {
        const below = withInvite ? Math.round((core.GAME_NOTICE_SIZE.full.height + core.GAME_NOTICE_LINE.gap) * unit) : 0;
        const bounds = core.gameNoticeBounds(zone, rotation, size(core.GAME_NOTICE_LINE), margin, 'top-left', below);
        const layers = [];
        if (withInvite) {
          const key = `invitation-${cardBounds.width}x${cardBounds.height}-${rotation}`;
          if (!rendered.has(key)) {
            const r = await renderNotice(cardBounds, { view: card, rotation }, path.join(spec.out, `${key}.png`));
            rendered.set(key, r.image);
            report.push(`${name} ${key} : ${r.problems.length ? r.problems.join(' ; ') : 'conforme'}`);
          }
          layers.push({ bounds: cardBounds, image: rendered.get(key) });
        }
        for (const [what, view] of Object.entries(views)) {
          const key = `en-partie-${what}-${bounds.width}x${bounds.height}-${rotation}`;
          if (!rendered.has(key)) {
            const r = await renderNotice(bounds, { view: { ...view, mode: 'line' }, rotation }, path.join(spec.out, `${key}.png`));
            rendered.set(key, r.image);
            report.push(`${name} ${key} : ${r.problems.length ? r.problems.join(' ; ') : 'conforme'}`);
          }
          if (what === 'terminee') sheet.push({ rotation, withInvite, zone, layers: [...layers, { bounds, image: rendered.get(key) }] });
        }
        // Dans la zone du plateau, jamais sur l'invitation, ni (seule) sur la carte du départ commun.
        const touches = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        const inside = bounds.x >= zone.x && bounds.y >= zone.y && bounds.x + bounds.width <= zone.x + zone.width && bounds.y + bounds.height <= zone.y + zone.height;
        const overlap = withInvite && touches(bounds, cardBounds);
        const onStart = !withInvite && [1, 2, 3, 4].some((rows) => touches(bounds, core.liveWaitBounds(zone, rotation, rows)));
        if (!inside || overlap || onStart) report.push(`${name} ${rotation}° ${withInvite ? 'sous l’invitation' : 'seule'} : ${!inside ? 'hors du plateau' : overlap ? 'sur l’invitation' : 'sur la carte du départ'}`);
      }
    }
    await drawSheet(name, zone, sheet);
  }
}

/** Planche d'un jeu d'écrans : le plateau dans les quatre sens, la ligne seule puis sous l'invitation, à l'échelle. */
async function drawSheet(name, zone, sheet) {
  const scale = 360 / Math.max(zone.width, zone.height);
  const cell = (s, i) => {
    const w = zone.width * scale;
    const h = zone.height * scale;
    const x = (i % 4) * (Math.max(w, h) + 24) + 12;
    const y = Math.floor(i / 4) * (Math.max(w, h) + 48) + 30;
    const label = `${s.rotation}° ${s.withInvite ? (spec.langue === 'en' ? 'under the invitation' : 'sous l’invitation') : spec.langue === 'en' ? 'alone' : 'seule'}`;
    return `<div style="position:absolute;left:${x}px;top:${y - 20}px">${label}</div><div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;border:1px solid #24504a;background:#0b1a1d">${s.layers
      .map((l) => `<img src="${l.image.toDataURL()}" style="position:absolute;left:${(l.bounds.x - zone.x) * scale}px;top:${(l.bounds.y - zone.y) * scale}px;width:${l.bounds.width * scale}px;height:${l.bounds.height * scale}px">`)
      .join('')}</div>`;
  };
  const ordered = [...sheet.filter((s) => !s.withInvite), ...sheet.filter((s) => s.withInvite)];
  const W = 4 * (360 + 24) + 24;
  const H = 2 * (360 + 48) + 40;
  const html = `<!doctype html><html><body style="margin:0;background:#050a09;width:${W}px;height:${H}px;position:relative;font:14px Segoe UI;color:#9bada7">${ordered.map(cell).join('\n')}</body></html>`;
  const win = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await delay(300);
  fs.writeFileSync(path.join(spec.out, `planche-en-partie-${name}.png`), (await win.webContents.capturePage()).toPNG());
  await closed(win);
}

app.whenReady().then(async () => {
  fs.mkdirSync(spec.out, { recursive: true });
  const report = [];
  const views = news();
  report.push(...Object.entries(views).map(([k, v]) => `texte ${k} : « ${v.title} »${v.detail ? ` · « ${v.detail} »` : ''} (${v.tone})`));
  await renderMenus(views, report);
  await renderInGame(views, report);
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), report.join('\n') + '\n');
  const bad = report.filter((l) => !l.startsWith('texte ') && !l.includes(' sans la zone : ') && !/: conforme( \(|$)/.test(l));
  console.log(`Notifications de la partie entre amis : ${report.length} relevés, ${bad.length} problème(s).`);
  for (const l of bad) console.log(`  ${l}`);
  app.exit(bad.length ? 1 : 0);
});
