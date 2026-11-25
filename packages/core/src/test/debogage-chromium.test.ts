// Mode débogage dans un vrai Electron hors écran (23/11/2026) : la vraie fenêtre (app/src/debogage.ts, posée comme celle des
// notifications de partie : transparente, sans focus, clics traversants), la vraie page (renderer/debogage.html, .js,
// .css) et le vrai calcul (packages/core/src/debogage.ts), sur des écrans simulés. Ce que le test prouve :
//   - éteint, rien ne tourne : pas de fenêtre, VPX n'est pas prié de dire sa cadence ;
//   - allumé, la fenêtre naît dans le coin haut droit de l'écran choisi, dans cet écran, sans focus ; la page se dessine sans
//     refus de la politique de sécurité (aucun style en ligne), aucun texte sous 20 px, rien de coupé par le bord ;
//   - en partie, la cadence relue dans vpinball.log (ligne « Cadence live ») apparaît, l'à-coup et sa cause aussi, et VPX est
//     prié de la dire (CYBERPINBALL_CADENCE_DIRECTE) ;
//   - la mesure ne coûte presque rien : une seconde de mesure et de dessin se compte en quelques millisecondes ;
//   - le rapport reçoit les mesures, sans chemin ni nom de compte ; « Joindre aux rapports : non » les retire.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { APP } from './menu-renderer';
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

const BENCH = String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_DIR;
const repo = process.env.CP_REPO;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
// La dernière fenêtre fermée ne ferme pas l'essai : c'est justement ce qu'il vérifie.
app.on('window-all-closed', () => undefined);
const facts = {};
const save = (etape) => { facts.etape = etape; fs.writeFileSync(path.join(dir, 'faits.json'), JSON.stringify(facts, null, 1)); };
const done = (code) => {
  save('fin');
  app.exit(code);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Attend (au plus 20 s) que la page de la fenêtre dise ce qu'on attend : une fenêtre neuve met un instant à se charger, plus sur un poste chargé. */
const pageHas = async (win, text) => {
  for (let i = 0; i < 100; i++) {
    try {
      const text_ = await win.webContents.executeJavaScript("document.getElementById('panel').textContent");
      if (text_.includes(text)) return true;
    } catch (e) {
      // Page pas encore chargée.
    }
    await wait(200);
  }
  return false;
};
app.whenReady().then(async () => {
  try {
    const core = require(path.join(repo, 'packages', 'core', 'dist', 'index.js'));
    // Offscreen windows never claim real desktop priority: keepOffscreen disables later
    // setAlwaysOnTop calls, and Windows can report false for a never-shown HWND. Record the
    // requested constructor policy while retaining the real offscreen window and renderer.
    const offscreen = require(path.join(repo, 'app', 'dist', 'offscreen.js'));
    const createWindow = offscreen.createWindow;
    const requestedOptions = new WeakMap();
    offscreen.createWindow = (options) => {
      const created = createWindow(options);
      requestedOptions.set(created, options);
      return created;
    };
    const { createDebug } = require(path.join(repo, 'app', 'dist', 'debogage.js'));
    core.setLanguage('fr');
    // Une borne simulée : playfield couché (1080 × 1920), backglass, DMD.
    const zones = {
      playfield: { zone: { x: 0, y: 0, width: 1080, height: 1920 }, rotation: 0 },
      backglass: { zone: { x: 1100, y: 0, width: 1920, height: 1080 }, rotation: 0 },
      dmd: { zone: { x: 1100, y: 1100, width: 1280, height: 390 }, rotation: 0 },
    };
    const displays = Object.entries(zones).map(([role, p]) => ({ gdiName: '\\\\.\\' + role, friendlyName: role, devicePath: role, bounds: p.zone, rotation: 0, primary: role === 'playfield' }));
    let phase = 'menu';
    const log = [];
    const vpxLog = path.join(dir, 'vpinball.log');
    fs.writeFileSync(vpxLog, 'avant\n');
    const host = {
      dataDir: dir,
      version: '0.0.0-essai',
      place: (role) => zones[role],
      displays: () => displays,
      phase: () => phase,
      vr: () => false,
      windows: () => new Map(),
      table: () => 'Midnight Circuit',
      gpu: () => ({ name: 'GPU inventé', vramMb: 8192 }),
      log: (line) => log.push(line),
    };
    const debug = createDebug(host);
    const overlays = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible !== undefined && w.webContents.getURL().endsWith('debogage.html'));

    // 1. Éteint : rien.
    debug.tick();
    facts.eteint = { windows: overlays().length, env: debug.env(), view: debug.view() ?? null };

    save('1');
    // 2. Allumé en détaillé, automatique : le backglass.
    debug.update({ mode: 'detailed' });
    await wait(2500);
    const win = overlays()[0];
    facts.allume = { windows: overlays().length, layout: debug.view()?.layout ?? null };
    if (win) {
      facts.allume.pret = await pageHas(win, 'ÉCRANS');
      const b = win.getBounds();
      facts.allume.bounds = b;
      facts.allume.focusable = win.isFocusable();
      facts.allume.onTop = win.isAlwaysOnTop();
      facts.allume.requestedOnTop = requestedOptions.get(win)?.alwaysOnTop;
      facts.allume.title = win.getTitle();
      await wait(800);
      facts.page = await win.webContents.executeJavaScript('(' + (() => {
        const panel = document.getElementById('panel');
        const r = panel.getBoundingClientRect();
        const frame = document.getElementById('frame').getBoundingClientRect();
        let small = 99;
        for (const el of panel.querySelectorAll('*')) {
          if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          small = Math.min(small, parseFloat(getComputedStyle(el).fontSize));
        }
        return { hidden: panel.hidden, text: panel.textContent.slice(0, 80), w: innerWidth, h: innerHeight, panel: { x: r.x, y: r.y, w: r.width, h: r.height }, frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height }, smallest: small, inlineStyle: [...document.querySelectorAll('[style]')].filter((el) => el.id !== 'frame').length, rows: panel.querySelectorAll('.sec').length };
      }).toString() + ')()');
    }

    save('2');
    // 3. Ce que ça coûte : cinquante secondes de mesure et de vue.
    const times = [];
    for (let i = 0; i < 50; i++) {
      const t0 = process.hrtime.bigint();
      debug.tick();
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    facts.cout = { mean: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1] };
    facts.heapMb = process.memoryUsage().heapUsed / 1048576;

    save('3');
    // 4. Un écran choisi : le DMD ne porte que la bande.
    debug.update({ screen: 'dmd' });
    await wait(1500);
    facts.dmd = { layout: debug.view()?.layout ?? null, windows: overlays().length, bounds: overlays()[0]?.getBounds() ?? null };
    debug.update({ screen: 'auto' });

    save('4');
    // 5. En partie : la cadence vient du journal de VPX.
    phase = 'playing';
    debug.gameBegin({ pid: undefined, vpxLog });
    facts.env = debug.env();
    let t = 100;
    for (let s = 0; s < 12; s++) {
      fs.appendFileSync(vpxLog, '[2026-11-23 20:00:' + String(s).padStart(2, '0') + '.000] I: Cadence live: fps=' + (s === 9 ? 96 : 118) + '.0 p50=8ms p99=' + (s === 9 ? 64 : 11) + 'ms max=' + (s === 9 ? 850 : 14) + 'ms stalls=' + (s === 9 ? 1 : 0) + ' mem=2100MB\n');
      if (s === 9) fs.appendFileSync(vpxLog, 'Cadence: stall of 850 ms at 9.0s; main thread in MPCLIENT.DLL 7 ; under ntdll 3\n');
      debug.tick();
      await wait(120);
    }
    await wait(1200);
    const view = debug.view();
    facts.partie = { layout: view?.layout ?? null, blocks: view?.blocks.map((b) => b.kind) ?? [], head: view?.head ?? null, parts: view?.parts.map((p) => p.text) ?? [] };
    const cad = view?.blocks.find((b) => b.kind === 'cadence');
    facts.partie.cadence = cad ? { value: cad.value, status: cad.status, alert: cad.alert ?? null, bars: cad.bars.length, stallBars: cad.bars.filter((b) => b.stall).length } : null;
    const w2 = overlays().at(-1);
    if (w2) {
      facts.partie.pret = await pageHas(w2, 'CADENCE DE VPX');
      facts.partie.page = await w2.webContents.executeJavaScript('document.getElementById("panel").textContent.slice(0, 200)');
      facts.partie.focusable = w2.isFocusable();
    }

    save('5');
    // 6. Le rapport : les mesures, sans chemin.
    const json = debug.report();
    facts.rapport = { present: Boolean(json), longueur: json ? json.length : 0, chemin: json ? /[A-Z]:\\\\|Users/.test(json) : null, reglage: debug.settings() };
    debug.update({ attach: false });
    facts.rapport.apresRetrait = debug.report() ?? null;

    save('6');
    // 7. Éteint de nouveau : tout part.
    debug.update({ mode: 'off' });
    await wait(1500);
    facts.fin = { windows: overlays().length, env: debug.env() };
    facts.journal = log;
    done(0);
  } catch (error) {
    facts.erreur = String(error && error.stack || error);
    done(1);
  }
});
`;

test('mode débogage dans un vrai Electron : éteint = rien, allumé = fenêtre sans focus dans son coin, cadence lue en partie, coût négligeable, rapport', { skip: electron ? false : 'Electron indisponible', timeout: 180_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debogage-electron-'));
  try {
    fs.writeFileSync(path.join(dir, 'bench.cjs'), BENCH);
    const run = runElectron(electron!, [path.join(dir, 'bench.cjs'), `--user-data-dir=${path.join(dir, 'donnees')}`], { dir, timeout: 150_000, env: { ...process.env, CP_DIR: dir, CP_REPO: REPO, CYBERPINBALL_HORS_ECRAN: '1', ELECTRON_ENABLE_LOGGING: '0' } });
    const facts = JSON.parse(fs.readFileSync(path.join(dir, 'faits.json'), 'utf8'));
    assert.ok(!facts.erreur, `${facts.erreur ?? ''}\n${run.stderr.slice(-800)}`);

    // Éteint : rien ne tourne.
    assert.equal(facts.eteint.windows, 0, 'éteint : aucune fenêtre');
    assert.deepEqual(facts.eteint.env, {}, 'éteint : VPX n’est pas prié de dire sa cadence');
    assert.equal(facts.eteint.view, null);

    // Allumé : la fenêtre, dans le coin haut droit du backglass, sans focus.
    assert.equal(facts.allume.windows, 1, 'une seule fenêtre');
    assert.equal(facts.allume.layout, 'detailed');
    const b = facts.allume.bounds;
    assert.ok(b.x >= 1100 && b.y >= 0 && b.x + b.width <= 1100 + 1920 && b.y + b.height <= 1080, `dans l’écran du backglass : ${JSON.stringify(b)}`);
    assert.ok(b.x + b.width >= 1100 + 1920 - 30, 'collée au bord droit (à sa marge près)');
    assert.equal(facts.allume.focusable, false, 'jamais le focus : VPX garde la main');
    assert.equal(facts.allume.requestedOnTop, true, 'overlay requests priority above VPX; hidden HWND state is not a desktop stacking test');

    // La page : dessinée, rien de coupé, aucun style en ligne (la politique de sécurité les refuserait), rien sous 20 px.
    const page = facts.page;
    assert.equal(page.hidden, false);
    assert.match(page.text, /DÉBOGAGE/);
    assert.equal(page.inlineStyle, 0, 'aucun attribut style dans la page');
    assert.ok(page.smallest >= 20, `texte le plus petit : ${page.smallest} px`);
    assert.ok(page.panel.x >= 0 && page.panel.y >= 0 && page.panel.x + page.panel.w <= page.w && page.panel.y + page.panel.h <= page.h, `le panneau tient dans la fenêtre ${JSON.stringify(page.panel)} / ${page.w} × ${page.h}`);
    assert.ok(page.rows >= 2, 'des blocs dessinés');

    // Le coût : une seconde de mesure et de vue.
    assert.ok(facts.cout.mean < 15, `une seconde de mesure coûte ${facts.cout.mean.toFixed(2)} ms en moyenne (au plus 15)`);

    // Le DMD : une bande, en bas de son écran.
    assert.equal(facts.dmd.layout, 'bar');
    assert.equal(facts.dmd.windows, 1);
    assert.ok(facts.dmd.bounds.y + facts.dmd.bounds.height === 1100 + 390, 'en bas de l’écran du DMD');

    // En partie : VPX est prié de dire sa cadence, le journal est lu.
    assert.deepEqual(facts.env, { CYBERPINBALL_CADENCE_DIRECTE: '1' });
    assert.equal(facts.partie.layout, 'detailed');
    assert.ok(facts.partie.blocks.includes('cadence'));
    assert.equal(facts.partie.cadence.value, '118');
    assert.match(facts.partie.cadence.alert.text, /850 ms.*antivirus/);
    assert.ok(facts.partie.cadence.stallBars >= 1, 'la seconde à-coup est marquée');
    assert.match(facts.partie.page, /CADENCE DE VPX/);
    assert.equal(facts.partie.focusable, false);

    // Le rapport.
    assert.equal(facts.rapport.present, true);
    assert.equal(facts.rapport.chemin, false, 'rien de personnel dans le fichier joint');
    assert.equal(facts.rapport.apresRetrait, null, '« Joindre aux rapports : non » retire le fichier');

    // Éteint de nouveau : tout part.
    assert.equal(facts.fin.windows, 0);
    assert.deepEqual(facts.fin.env, {});
  } finally {
    removeTempDir(dir);
  }
});
