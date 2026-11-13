// Sorties du son du Juke-box (13/11/2026), dans un vrai Chromium hors écran et muet : le moteur
// app/renderer/audio-routes.js branché sur un élément <audio> qui joue un la à 440 Hz. Web Audio ne
// s'imite pas (createMediaElementSource, MediaStreamDestination, setSinkId) : c'est ici que se prouve
// que le son traverse le graphe, une branche par sortie, que le plan se refait sans couper l'élément
// et que l'extrait d'essai démarre. Rien ne sort : la page est muette (setAudioMuted) et chaque
// branche a un gain nul ; la mesure se fait avant les gains.
//
// Le reste est lu dans les sources : jukebox.js garde le chemin d'avant (setSinkId seul) pour le
// réglage d'usine, et la page YouTube reçoit le même moteur.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { APP } from './menu-renderer';

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
app.whenReady().then(async () => {
  // Jamais montrée, jamais entendue.
  const win = new BrowserWindow({
    show: false, frame: false, skipTaskbar: true, focusable: false, width: 320, height: 240,
    webPreferences: { offscreen: true, contextIsolation: false, sandbox: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.webContents.setAudioMuted(true);
  const console = [];
  win.webContents.on('console-message', (event) => console.push(event.message));
  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(fs.readFileSync(process.env.CP_ROUTES, 'utf8'));
  const result = await win.webContents.executeJavaScript(${'`'}(async () => {
    // Un la à 440 Hz, 3 s, en WAV fabriqué ici.
    const rate = 44100, n = rate * 3, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / rate) * 12000, true);
    const audio = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
    const routes = [
      { output: 'Sortie qui n’existe pas', gain: 0, filters: [], delay: 0 },
      { output: '', gain: 0, filters: [{ type: 'lowpass', frequency: 120, Q: 0.707 }, { type: 'lowpass', frequency: 120, Q: 0.707 }], delay: 0.02 },
    ];
    const h = window.CyberAudioRoutes.attach(audio, routes);
    await audio.play();
    await new Promise((r) => setTimeout(r, 900));
    const bins = new Uint8Array(h.analyser.frequencyBinCount);
    h.analyser.getByteFrequencyData(bins);
    const binOf = (f) => Math.round(f / (h.analyser.context.sampleRate / 2) * bins.length);
    const two = window.CyberAudioRoutes.status();
    // Nouveau plan pendant la lecture : une seule branche, l'élément continue.
    h.update([{ output: '', gain: 0, filters: [], delay: 0 }]);
    const one = window.CyberAudioRoutes.status();
    const t1 = audio.currentTime;
    await new Promise((r) => setTimeout(r, 300));
    const playing = !audio.paused && audio.currentTime > t1;
    const tested = window.CyberAudioRoutes.test({ output: '', gain: 0, filters: [], delay: 0 });
    const essai = window.CyberAudioRoutes.status().essai;
    h.close();
    const closed = window.CyberAudioRoutes.status().elements;
    return { at440: bins[binOf(440)], at5k: bins[binOf(5000)], two, one, playing, tested, essai, closed };
  })()${'`'});
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify({ result, console }));
  app.exit(0);
});
`;

test('sorties du son, vrai Chromium : le morceau traverse le graphe, une branche par sortie, plan refait sans couper', { skip: electron ? false : 'Electron sous Windows requis', timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sorties-'));
  try {
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_ROUTES: path.join(APP, 'renderer', 'audio-routes.js') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 110_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as {
      result: { at440: number; at5k: number; two: { elements: number; branches: { sortie: string; filtres: number; retard: number; trouvee: boolean | null }[] }; one: { branches: unknown[] }; playing: boolean; tested: boolean; essai: string | null; closed: number };
      console: string[];
    };
    const r = out.result;
    assert.deepEqual(out.console.filter((m) => /Uncaught|TypeError|ReferenceError|NotSupportedError/.test(m)), [], 'aucune erreur de la page');
    assert.ok(r.at440 > 100, `le son passe par le graphe (niveau à 440 Hz : ${r.at440})`);
    assert.ok(r.at440 > r.at5k + 50, 'c’est bien le la qui est mesuré');
    assert.equal(r.two.elements, 1);
    assert.deepEqual(
      r.two.branches.map((b) => [b.sortie, b.filtres, b.retard]),
      [
        ['Sortie qui n’existe pas', 0, 0],
        ['', 2, 0.02],
      ],
    );
    assert.equal(r.two.branches[0]!.trouvee, false, 'sortie introuvable : dite telle (le journal le note)');
    assert.equal(r.one.branches.length, 1, 'nouveau plan : les branches refaites');
    assert.ok(r.playing, 'le morceau continue pendant le changement de plan');
    assert.ok(r.tested && r.essai === '', 'l’extrait d’essai démarre');
    assert.equal(r.closed, 0, 'élément fermé : plus rien dans le graphe');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('jukebox.js : réglage d’usine sur le chemin d’avant, sinon le graphe ; réglages suivis pendant le morceau', () => {
  const js = fs.readFileSync(path.join(APP, 'renderer', 'jukebox.js'), 'utf8');
  assert.match(js, /const menuOnly = plainRoutes\(routes\) && \(routes\?\.\[0\]\?\.output \|\| ''\) === \(order\.output \|\| ''\);\s*\n\s*if \(menuOnly \|\| !window\.CyberAudioRoutes\) return route\(media, order\.output\);/);
  assert.match(js, /m\.graph = window\.CyberAudioRoutes\.attach\(media, routes\)/);
  assert.match(js, /clip\.order = order;\s*\n\s*rerouteMedia\(order\);/, 'même morceau, réglages changés : le son suit');
  assert.match(js, /m\.graph\?\.close\(\)/, 'le graphe se ferme avec le morceau');
  const html = fs.readFileSync(path.join(APP, 'renderer', 'frontend.html'), 'utf8');
  assert.ok(html.indexOf('audio-routes.js') > 0 && html.indexOf('audio-routes.js') < html.indexOf('jukebox.js'), 'audio-routes.js chargé avant jukebox.js');
  const player = fs.readFileSync(path.join(APP, 'src', 'jukebox-player.ts'), 'utf8');
  assert.match(player, /void routeOnline\(\);/, 'le lecteur YouTube reçoit les sorties à chaque relevé');
  assert.match(player, /renderer', 'audio-routes\.js'/, 'le même moteur, lu dans le fichier du rendu');
});
