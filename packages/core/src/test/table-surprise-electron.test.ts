/** Vrai rendu Chromium, fenêtres en mémoire uniquement. Aucun frontend ni moteur de jeu démarré. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { removeTempDir } from './temp-dir';
import { REPO_ROOT } from './i18n-scan';
const electron = require(require.resolve('electron', { paths: [REPO_ROOT] })) as string;
const BENCH = String.raw`
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_SURPRISE_DIR;
const repo = process.env.CP_SURPRISE_REPO;
app.setPath('userData', path.join(dir, 'user-data'));
const { createWindow } = require(path.join(repo, 'app/dist/offscreen.js'));
app.whenReady().then(async () => {
  const results = [];
  const errors = [];
  const css = ['theme.css', 'frontend.css', 'table-surprise.css'].map(n => fs.readFileSync(path.join(repo, 'app/renderer', n), 'utf8')).join('\n');
  const html = path.join(dir, 'page.html');
  fs.writeFileSync(html, '<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>'+css+'</style></head><body><div id="root"></div><div id="table-surprise" hidden role="status"></div></body></html>');
  const win = createWindow({ width: 1920, height: 1080, frame: false, webPreferences: { offscreen: true, contextIsolation: false, sandbox: true } });
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message', event => { if (/Uncaught|TypeError|ReferenceError/.test(event.message)) errors.push(event.message); });
  await win.loadFile(html);
  await win.webContents.executeJavaScript('window.cyber = { mediaError() {} }; void 0;');
  for (const n of ['i18n.js', 'media.js', 'table-surprise.js']) await win.webContents.executeJavaScript(fs.readFileSync(path.join(repo, 'app/renderer', n), 'utf8') + '\n;void 0;');
  for (const [width, height, rotation] of [[3840,2160,0],[3840,2160,90],[3840,2160,180],[3840,2160,270],[1920,1080,90]]) {
    win.setContentSize(width, height);
    const result = await win.webContents.executeJavaScript('('+ (async function(width, height, rotation) {
      // setContentSize est asynchrone : sur une machine chargée, la page garde un moment l'ancienne taille.
      for (const until = Date.now() + 5000; (innerWidth !== width || innerHeight !== height) && Date.now() < until;) await new Promise(resolve => setTimeout(resolve, 20));
      document.documentElement.dataset.rotation = String(rotation);
      const api = window.CyberTableSurprise;
      api.render({ token: rotation+width, phase: 'spinning', entries: [{id:'a',title:'Galaxy'}, {id:'b',title:'Ocean',wheel:'data:image/png;base64,broken'}], selected:'b',duration:70 });
      await new Promise(resolve => setTimeout(resolve, 110));
      api.render({ token: rotation+width, phase: 'release', entries: [{id:'a',title:'Galaxy'}, {id:'b',title:'Ocean',wheel:'data:image/png;base64,broken'}], selected:'b',duration:70 });
      await new Promise(resolve => setTimeout(resolve, 50));
      const root = document.getElementById('table-surprise');
      const rect = root.getBoundingClientRect();
      const panel = root.querySelector('.surprise-panel').getBoundingClientRect();
      const out = { width, height, rotation, rect: {x:rect.x,y:rect.y,width:rect.width,height:rect.height}, panel: {x:panel.x,y:panel.y,width:panel.width,height:panel.height}, chosen:root.querySelector('.surprise-chosen').textContent, text:root.textContent, items:root.querySelectorAll('.surprise-item').length, hidden:root.hidden };
      api.render(undefined);
      out.cancelled = root.hidden && root.children.length === 0;
      return out;
    }).toString()+')('+width+','+height+','+rotation+')');
    results.push(result);
  }
  // Petits fichiers synthétiques ; le même composant Wheel décode chaque format dans Chromium.
  const formats = await win.webContents.executeJavaScript('('+ (async function() {
    const images = [
      ['PNG', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='],
      ['APNG', 'data:image/apng;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACGFjVEwAAAABAAAAALQt6aAAAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAAAEACgAAWn8w0AAAAA1JREFUeJxj+M/A8B8ABQAB/4mZPR0AAAAASUVORK5CYII='],
      ['GIF', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='],
      ['SVG', 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')],
    ];
    const out = [];
    for (const [format, wheel] of images) {
      window.CyberTableSurprise.render({token:format,phase:'release',entries:[{id:'a',title:format,wheel}],selected:'a',duration:3000});
      const chosen = document.querySelector('#table-surprise .surprise-chosen');
      const img = chosen.querySelector('img');
      await img.decode();
      out.push({format, decoded:img.naturalWidth > 0, title:chosen.textContent});
    }
    window.CyberTableSurprise.render(undefined);
    return out;
  }).toString()+')()');
  const reduced = await win.webContents.executeJavaScript('('+ (function() {
    const original = window.matchMedia;
    try {
      window.matchMedia = () => ({matches:true});
      window.CyberTableSurprise.render({token:998,phase:'spinning',entries:[{id:'a',title:'Galaxy'},{id:'b',title:'Ocean'}],selected:'b',duration:3000});
      return document.querySelector('#table-surprise .surprise-chosen').textContent;
    } finally { window.matchMedia = original; window.CyberTableSurprise.render(undefined); }
  }).toString()+')()');
  // Démonstration neutre, capturée en mémoire, aucun média personnel ou adulte.
  await win.webContents.executeJavaScript("document.documentElement.dataset.rotation='90'; window.CyberTableSurprise.render({token:999,phase:'release',entries:[{id:'a',title:'Galaxy'},{id:'b',title:'Ocean'}],selected:'a',duration:3000});");
  await new Promise(resolve => setTimeout(resolve, 100));
  const capture = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, 'table-surprise.png'), capture.toPNG());
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ results, formats, reduced, errors, visible:win.isVisible(), focused:win.isFocused() }));
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
`;
test('S18–S20 / S30 : overlay Electron isolé, 4K et quatre orientations, logo corrompu, titre et annulation', { timeout: 100_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-surprise-render-'));
  try {
    fs.writeFileSync(path.join(dir, 'bench.cjs'), BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_SURPRISE_DIR: dir, CP_SURPRISE_REPO: REPO_ROOT, CYBERPINBALL_HORS_ECRAN: '1', ELECTRON_ENABLE_LOGGING: '0' };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron, [path.join(dir, 'bench.cjs'), `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 90_000 });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
    assert.deepEqual(out.errors, []);
    assert.equal(out.visible, false); assert.equal(out.focused, false);
    assert.deepEqual(out.formats.map((r: { format: string }) => r.format), ['PNG', 'APNG', 'GIF', 'SVG']);
    for (const r of out.formats) { assert.equal(r.decoded, true); assert.equal(r.title, r.format); }
    assert.equal(out.reduced, 'Ocean');
    for (const r of out.results) {
      assert.equal(r.hidden, false); assert.equal(r.cancelled, true); assert.equal(r.items, 3); assert.match(r.chosen, /Ocean/); assert.match(r.text, /Relâche/);
      assert.ok(Math.abs(r.rect.x) < 2 && Math.abs(r.rect.y) < 2, JSON.stringify(r));
      assert.ok(Math.abs(r.rect.width-r.width) < 2 && Math.abs(r.rect.height-r.height) < 2, JSON.stringify(r));
      assert.ok(r.panel.width > 0 && r.panel.height > 0 && r.panel.x >= -2 && r.panel.y >= -2 && r.panel.x+r.panel.width <= r.width+2 && r.panel.y+r.panel.height <= r.height+2, JSON.stringify(r));
    }
    // Conserver une preuve seulement à la demande du développeur, hors du dépôt par défaut.
    if (process.env.CYBERPINBALL_SURPRISE_CAPTURE) fs.copyFileSync(path.join(dir, 'table-surprise.png'), process.env.CYBERPINBALL_SURPRISE_CAPTURE);
  } finally { removeTempDir(dir); }
});
