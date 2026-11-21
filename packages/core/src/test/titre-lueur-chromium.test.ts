// Lueur du titre de la roue pendant son effet d'arrivée, dans un vrai Chromium hors écran (21/11/2026).
// Le titre porte sa lueur verte en filter (drop-shadow, frontend.css). L'effet d'arrivée (« s'écarte en
// se précisant ») animait filter: blur(), qui remplaçait la lueur pendant 360 ms : elle revenait d'un
// coup à la fin, en retard sur le texte (« ça fait moche »). Invariant : à mi-effet, le filtre du titre
// garde ses deux lueurs (le flou s'y ajoute, composite 'add'), et son opacité reste entre 0 et 1.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { APP, menuState } from './menu-renderer';
import { removeTempDir } from './temp-dir';

const REPO = path.join(APP, '..');

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;

/** État du menu (roue Médaillons), la table `at` au centre, sans logo : le titre en texte. */
function stateAt(at: number) {
  const wheels: Record<string, undefined> = {};
  for (let i = 0; i < 6; i++) wheels[`T${i}.vpx`] = undefined;
  const base = menuState(wheels);
  const neighbors = [-2, -1, 0, 1, 2].map((offset) => {
    const i = (((at + offset) % 6) + 6) % 6;
    return { offset, key: `T${i}.vpx`, title: `Table ${i}` };
  });
  return { ...base, count: 6, position: at + 1, table: { title: `Table ${at}`, subtitle: 'Fabricant · 1990' }, neighbors };
}

const BENCH = String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_DIR;
app.commandLine.appendSwitch('force-prefers-no-reduced-motion');
app.whenReady().then(async () => {
  // Jamais montrée : rendu hors écran.
  const win = new BrowserWindow({
    show: false, frame: false, skipTaskbar: true, focusable: false, width: 1080, height: 1920, useContentSize: true, enableLargerThanScreen: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(dir, 'preload.cjs'), contextIsolation: false, sandbox: false },
  });
  await win.loadFile(process.env.CP_PAGE, { query: { role: 'playfield' } });
  const states = JSON.parse(fs.readFileSync(path.join(dir, 'etats.json'), 'utf8'));
  const js = (code) => win.webContents.executeJavaScript(code);
  await js('window.__send(' + JSON.stringify(states[0]) + ');undefined');
  await new Promise((r) => setTimeout(r, 800));
  const repos = await js("getComputedStyle(document.querySelector('.menu .title')).filter");
  // Nouvelle table : l'effet part ; figé à mi-course (180 ms sur 360).
  const out = await js('window.__send(' + JSON.stringify(states[1]) + ');(' + String(() => {
    const t = document.querySelector('.menu .title');
    const anims = t.getAnimations();
    for (const a of anims) { a.pause(); a.currentTime = 180; }
    const cs = getComputedStyle(t);
    return { effets: anims.length, filtre: cs.filter, opacite: Number(cs.opacity), texte: t.textContent };
  }) + ')()');
  out.repos = repos;
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify(out));
  app.exit(0);
});
`;

const PRELOAD = String.raw`
window.cyberI18n = {};
window.cyber = {
  onState: (f) => { window.__send = f; },
  ready() {}, act() {}, mediaError() {}, jukebox() {}, onDmd() {}, onJukeboxPulse() {}, onJukeboxTime() {}, pathOf: () => '',
};
`;

test('titre de la roue, vrai Chromium : sa lueur reste là pendant tout l’effet d’arrivée', { skip: electron ? false : 'Electron sous Windows requis', timeout: 60_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-titre-lueur-'));
  try {
    fs.writeFileSync(path.join(dir, 'etats.json'), JSON.stringify([stateAt(0), stateAt(1)]));
    fs.writeFileSync(path.join(dir, 'preload.cjs'), PRELOAD);
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_PAGE: path.join(APP, 'renderer', 'frontend.html') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 50_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as { effets: number; filtre: string; opacite: number; texte: string; repos: string };
    assert.equal((out.repos.match(/drop-shadow/g) ?? []).length, 2, `au repos, deux lueurs : ${out.repos}`);
    assert.equal(out.texte, 'Table 1');
    assert.ok(out.effets >= 1, 'l’effet d’arrivée est parti');
    assert.equal((out.filtre.match(/drop-shadow/g) ?? []).length, 2, `à mi-effet, les deux lueurs restent : ${out.filtre}`);
    assert.match(out.filtre, /blur\(/, `à mi-effet, le flou s’y ajoute : ${out.filtre}`);
    assert.ok(out.opacite > 0 && out.opacite < 1, `à mi-effet, le titre apparaît en fondu (opacité ${out.opacite})`);
  } finally {
    removeTempDir(dir);
  }
});
