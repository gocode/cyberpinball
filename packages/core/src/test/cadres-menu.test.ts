// Zones du menu des tables qui se recouvrent (revue de Codex du 29/10/2026) : au bureau, sur un écran
// 4:3 ou 5:4, le fronton et le bandeau de la roue couvraient presque tout le cadre 9:16 du plateau.
// Le garde-fou de mise en page n'en disait rien : aucun texte ne s'y chevauchait. Deux maillons :
// - le menu (frontend.html, frontend.js) range chacun de ses cadres dans une zone (data-frame) ;
// - le garde-fou (layout-check.ts), dans un vrai Chromium hors écran : deux zones différentes qui se
//   recouvrent, ou un cadre qui sort de la zone du playfield, sont signalés ; pas deux cadres d'une
//   même zone (la roue mord sur le fronton), ni un fond qui couvre toute la zone (le média en borne).
// La disposition elle-même se vérifie sur la vraie page, de 5:4 à 4K : docs\demo-noms-roue.ps1.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP, menuRenderer, menuState } from './menu-renderer';

const REPO = path.join(APP, '..');

test('menu des tables : chaque cadre est rangé dans sa zone, le plateau d’un côté, le reste de l’autre', () => {
  const { document, send } = menuRenderer();
  const state = menuState({ 'a.vpx': undefined, 'b.vpx': undefined }, { 'a.vpx': 'Éclair', 'b.vpx': 'Neon Galaxy' });
  for (const menuLayout of ['medaillons', 'liste']) {
    send({ ...state, menuLayout, footer: [['Flippers : choisir']] });
    const zone = (selector: string) => document.querySelector(selector)?.getAttribute('data-frame');
    assert.equal(zone('#media-bg'), 'plateau', 'le média du plateau (cadre 9:16 au bureau)');
    assert.equal(zone('.menu-frame.plateau'), 'plateau');
    for (const selector of ['.menu-frame.fronton', '.menu-backglass', '.menu-nav', '.menu-label', '.menu-title', '.menu-meta', '.menu-count', '.footer.menu-help']) {
      assert.equal(zone(selector), 'menu', `${selector} (${menuLayout})`);
    }
  }
});

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

const electron = process.platform === 'win32' ? electronPath() : undefined;

/** Un cadre en position fixe : [gauche, haut, largeur, hauteur] dans une fenêtre de 1920 × 1080. */
const box = (zone: string, [x, y, w, h]: number[], style = '') => `<div data-frame="${zone}" style="position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${style}"></div>`;
const page = (...frames: string[]) => `<main id="root" style="position:fixed;inset:0"></main>${frames.join('')}`;

const PLATEAU = [64, 76, 563, 976];
const CASES: Record<string, string> = {
  // Bureau 16:9 : le fronton à droite du plateau, sans le toucher.
  'cote-a-cote': page(box('plateau', PLATEAU), box('menu', [680, 76, 1176, 676])),
  // Le défaut du 4:3, rejoué dans une fenêtre de 1920 : le fronton posé sur le plateau.
  recouvrement: page(box('plateau', PLATEAU), box('menu', [300, 76, 1176, 676])),
  // La roue mord sur le bas du fronton : même zone, voulu.
  'meme-zone': page(box('plateau', PLATEAU), box('menu', [680, 76, 1176, 676]), box('menu', [650, 434, 1236, 618])),
  // Borne : le média du plateau couvre toute la zone, le menu est posé dessus.
  fond: page(box('plateau', [0, 0, 1920, 1080]), box('menu', [420, 500, 1080, 540])),
  'hors-zone': page(box('plateau', PLATEAU), box('menu', [1500, 76, 600, 400])),
  cache: page(box('plateau', PLATEAU), box('menu', [300, 76, 1176, 676], 'display:none')),
};

const BENCH = String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const { checkLayout } = require(process.env.CP_LAYOUT_CHECK);
const cases = JSON.parse(fs.readFileSync(process.env.CP_CASES, 'utf8'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  // Jamais montrée : rendu hors écran.
  const win = new BrowserWindow({ show: false, frame: false, skipTaskbar: true, focusable: false, width: 1920, height: 1080, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  // Plus grande que la zone de travail de l'écran du poste : Windows la ramènerait dedans.
  win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
  const out = {};
  for (const [name, body] of Object.entries(cases)) {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><body style="margin:0">' + body));
    await new Promise((r) => setTimeout(r, 300));
    out[name] = await checkLayout(win.webContents);
  }
  out.window = await win.webContents.executeJavaScript('[innerWidth, innerHeight]');
  fs.writeFileSync(process.env.CP_OUT, JSON.stringify(out));
  app.exit(0);
});
`;

test('garde-fou : deux zones du menu qui se recouvrent, ou un cadre hors de la zone du playfield, sont signalés', { skip: electron ? false : 'Electron sous Windows requis', timeout: 180_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadres-'));
  try {
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    fs.writeFileSync(path.join(dir, 'cas.json'), JSON.stringify(CASES));
    const env: NodeJS.ProcessEnv = { ...process.env, CP_LAYOUT_CHECK: path.join(APP, 'dist', 'layout-check.js'), CP_CASES: path.join(dir, 'cas.json'), CP_OUT: path.join(dir, 'out.json') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { env, encoding: 'utf8', timeout: 170_000, windowsHide: true });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const found = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as Record<string, string[]>;
    assert.deepEqual(found.window, [1920, 1080]);
    assert.deepEqual(found['cote-a-cote'], []);
    assert.deepEqual(found.recouvrement, ['cadres qui se recouvrent : menu div [300, 76, 1476, 752] et plateau div [64, 76, 627, 1052]']);
    assert.deepEqual(found['meme-zone'], [], 'deux cadres d’une même zone peuvent se recouvrir');
    assert.deepEqual(found.fond, [], 'un fond qui couvre toute la zone du playfield n’est pas un cadre');
    assert.deepEqual(found['hors-zone'], ['cadre hors de la zone du playfield : menu div [1500, 76, 2100, 476]']);
    assert.deepEqual(found.cache, [], 'un cadre caché ne recouvre rien');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
