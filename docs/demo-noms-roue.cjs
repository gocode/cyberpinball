// Banc hors écran des noms de la roue (lancé par docs\demo-noms-roue.ps1) : la vraie page du
// playfield (frontend.html, son preload) reçoit l'état du menu des tables tel que viewFor
// (frontend.ts) l'enverrait, dix tables SANS logo : le médaillon du centre montre le nom du jeu,
// les autres son initiale. Pour chaque roue (Médaillons, Bandeau, Minimaliste, Arche) et pour la
// liste des titres, sur la borne (playfield couché, mise en page pivotée ; écran debout) et au
// bureau (1080p, 1366 × 768, 1280 × 1024, 1024 × 768, 4K) :
//   - le corps rendu de ce qui se voit (corps de la police × échelle des transform, ramené à un
//     petit côté de 1 080 px), qui ne doit jamais passer sous 20 px ; nom au centre, initiale
//     ailleurs, jamais les deux ensemble ;
//   - le garde-fou de mise en page (layout-check.ts) au repos, puis EN PLEIN GLISSEMENT (un
//     flipper vient d'être pressé : les médaillons changent de place et de taille) ; il doit voir
//     tout texte sous 20 px que voit la mesure.
// Captures et relevé (mise-en-page.txt, corps.txt) dans le dossier « out » de la spécification.
//   electron docs/demo-noms-roue.cjs <spec.json>   { "out": dossier des captures, "only": cas à rejouer (facultatif) }
// Fenêtres jamais montrées (show: false, rendu hors écran, son coupé).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const specFile = process.argv.find((a) => a.endsWith('.json'));
// Set-Content -Encoding UTF8 de Windows PowerShell 5.1 écrit un BOM : JSON.parse le refuserait.
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8').replace(/^﻿/, ''));

const { app, BrowserWindow, ipcMain } = require('electron');
const { checkLayout } = require(path.join(REPO, 'app', 'dist', 'layout-check.js'));

app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Des noms courts, longs, d'un seul mot très long, accentués : sans logo, le médaillon les écrit.
const TABLES = [
  ['Astro Néon', 'Williams', '1992'],
  ['Bayou d’Or', 'Gottlieb', '1979'],
  ['Le très long titre d’une table imaginaire pour vérifier les débordements', 'Stern', '2020'],
  ['Z', 'Bally', '1964'],
  ['Rocket Rally', 'Data East', '1988'],
  ['Supercalifragilistique', 'Zaccaria', '1981'],
  ['Capitaine Comète et les Mystères de l’Atlantide', 'Premier', '1990'],
  ['Neon Galaxy', 'Williams', '1992'],
  ['Éclair', 'Sega', '1996'],
  ['Quatre-Vingt-Treize', 'Alvin G.', '1993'],
];

// Et la liste des titres, pour le reste du menu (bandeau d'aide, logos de la liste).
const STYLES = ['medaillons', 'bandeau', 'minimal', 'arche', 'liste'];

/** [nom, largeur, hauteur, rotation de la mise en page] */
const SCREENS = [
  // Borne : playfield 4K couché, la mise en page pivotée pour le joueur (docs\ecrans\borne.json).
  ['borne-pivotee', 3840, 2160, 90],
  ['borne-debout', 1080, 1920, 0],
  // Bureau : la zone du playfield en largeur, bandeau à droite du cadre du plateau.
  ['bureau-1080p', 1920, 1080, 0],
  ['bureau-1366x768', 1366, 768, 0],
  ['bureau-1280x1024', 1280, 1024, 0],
  ['bureau-1024x768', 1024, 768, 0],
  ['bureau-4k', 3840, 2160, 0],
];

function stateFor(style, index) {
  const at = (i) => TABLES[(i + TABLES.length * 10) % TABLES.length];
  const neighbor = (offset) => {
    const [title, manufacturer, year] = at(index + offset);
    return { offset, key: `${title}.vpx`, title, manufacturer, year };
  };
  const [title, manufacturer, year] = at(index);
  return {
    role: 'playfield',
    phase: 'menu',
    help: false,
    count: TABLES.length,
    position: index + 1,
    table: { title, manufacturer, year, subtitle: `${manufacturer} · ${year}` },
    neighbors: [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(neighbor),
    menuLayout: style,
    medias: {},
    preload: [],
    footer: [['Flippers : choisir'], ['Start : fiche', 'Enter'], ['Exit : menu', 'Escape']],
    menuKeys: [],
    gameKeys: [],
    nav: {},
  };
}

/**
 * Dans la page : corps rendu de ce que montre chaque médaillon sans logo (le nom, ou l'initiale),
 * en pixels d'un petit côté de 1 080 ; seulement ce qui se voit (opacité cumulée d'au moins 5 %).
 */
const MEASURE = String.raw`(() => {
  const px = 1080 / Math.min(innerWidth, innerHeight);
  const opacity = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  // Médaillons dont le nom et l'initiale se voient ensemble (ils se chevaucheraient).
  const both = [...document.querySelectorAll('.wheel-item')].filter((n) => [...n.querySelectorAll('.wheel-name, .wheel-initial')].filter((t) => opacity(t) >= 0.05).length > 1).length;
  const texts = [...document.querySelectorAll('.wheel-name, .wheel-initial')].filter((text) => opacity(text) >= 0.05).map((text) => {
    let m = new DOMMatrix();
    for (let e = text; e; e = e.parentElement) {
      const t = getComputedStyle(e).transform;
      if (t && t !== 'none') m = new DOMMatrix(t).multiply(m);
    }
    const size = parseFloat(getComputedStyle(text).fontSize) * Math.hypot(m.c, m.d) * px;
    const item = text.closest('.wheel-item');
    const offset = JSON.parse(item.querySelector('.wheel-hit')?.dataset.act || '{}').offset;
    const kind = text.classList.contains('wheel-name') ? 'nom' : 'initiale';
    return { offset, kind, size: Math.round(size * 10) / 10, text: text.textContent.slice(0, 24) };
  }).sort((a, b) => (a.offset ?? 9) - (b.offset ?? 9));
  return { texts, both };
})()`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});

app.whenReady().then(async () => {
  ipcMain.on('i18n', (e) => (e.returnValue = {}));
  ipcMain.on('ready', () => {});
  const problems = [];
  const sizes = [];
  fs.mkdirSync(spec.out, { recursive: true });
  for (const [screen, width, height, rotation] of SCREENS) {
    for (const style of STYLES) {
      const name = `${screen}-${style}`;
      // « only » (expression régulière) : rejouer quelques cas seulement.
      if (spec.only && !new RegExp(spec.only).test(name)) continue;
      const win = new BrowserWindow({
        show: false,
        frame: false,
        skipTaskbar: true,
        focusable: false,
        width,
        height,
        useContentSize: true,
        enableLargerThanScreen: true,
        backgroundColor: '#030807',
        webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true },
      });
      win.webContents.setAudioMuted(true);
      win.setBounds({ x: 0, y: 0, width, height });
      await win.loadFile(path.join(REPO, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: String(rotation), zones: '[]' } });
      await wait(300);
      const [w, h] = await win.webContents.executeJavaScript('[innerWidth, innerHeight]');
      if (w !== width || h !== height) problems.push(`${name} : fenêtre de ${w} × ${h} au lieu de ${width} × ${height}`);
      // Au repos, puis un flipper : relevé en plein glissement (90 ms sur 320), puis de nouveau au repos.
      const moments = [
        ['repos', 0, 1200],
        ['glissement', 1, 90],
        ['arrivee', 1, 900],
        // Au centre, un titre très long (trois lignes au plus, « … ») puis un mot indivisible (revue de Codex).
        ['titre-long', 2, 900],
        ['mot-long', 5, 900],
      ];
      let sent = -1;
      for (const [moment, index, delay] of moments) {
        if (index !== sent) win.webContents.send('state', stateFor(style, index));
        sent = index;
        await wait(delay);
        const found = await checkLayout(win.webContents);
        const { texts: measured, both } = await win.webContents.executeJavaScript(MEASURE);
        if (both) problems.push(`${name} ${moment} : ${both} médaillon(s) montrent à la fois le nom et l'initiale`);
        // Au repos : le nom au centre, l'initiale ailleurs (la liste n'a pas de médaillons).
        if (moment !== 'glissement' && style !== 'liste') {
          const wrong = measured.filter((m) => (m.offset === 0) !== (m.kind === 'nom'));
          if (wrong.length || !measured.some((m) => m.offset === 0)) problems.push(`${name} ${moment} : au centre le nom, ailleurs l'initiale (vu : ${measured.map((m) => `${m.offset} ${m.kind}`).join(', ')})`);
        }
        if (moment !== 'glissement') fs.writeFileSync(path.join(spec.out, `${name}-${moment}.png`), (await win.webContents.capturePage()).toPNG());
        const line = `${name} ${moment} : ${measured.map((m) => `${m.offset >= 0 ? '+' : ''}${m.offset ?? '·'} ${m.kind === 'nom' ? 'nom' : m.text} ${m.size}`).join(' · ')}`;
        sizes.push(line);
        const low = measured.filter((m) => m.size < 19.5);
        console.log(`${line}${low.length ? '  ← sous 20 px' : ''}${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
        // Le garde-fou doit voir ce que voit la mesure : un nom sous le plancher qu'il tait est un échec.
        if (low.length && !found.some((p) => /^texte plus petit que 20 px/.test(p))) problems.push(`${name} ${moment} : nom sous 20 px que le garde-fou ne signale pas`);
        for (const p of found) problems.push(`${name} ${moment} : ${p}`);
        if (low.length) problems.push(`${name} ${moment} : ${low.map((m) => `« ${m.text} » à ${m.size} px (place ${m.offset})`).join(', ')}`);
      }
      win.destroy();
    }
  }
  fs.writeFileSync(path.join(spec.out, 'corps.txt'), `${sizes.join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), `${problems.length ? problems.join('\n') : 'Aucun problème de mise en page.'}\n`, 'utf8');
  console.log(problems.length ? `Noms de la roue : ${problems.length} problème(s).` : 'Noms de la roue : aucun nom sous 20 px, aucun problème de mise en page.');
  app.exit(problems.length ? 1 : 0);
});
