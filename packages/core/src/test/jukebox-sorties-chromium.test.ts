// Sorties du son du Juke-box (13/11/2026), dans un vrai Chromium hors écran et muet : le moteur
// app/renderer/audio-routes.js branché sur un élément <audio> qui joue un la à 440 Hz. Web Audio ne
// s'imite pas (createMediaElementSource, captureStream, setSinkId) : c'est ici que se prouve qu'une
// horloge par sortie tient (chaque sortie sa copie du morceau, dans son propre contexte), que les
// copies suivent lecture, pause et saut sans variation de vitesse audible, que la page YouTube passe
// son flux aux autres sorties, que le plan se refait sans couper l'élément et que l'extrait d'essai
// démarre. Rien ne sort : la page est muette (setAudioMuted) et chaque sortie a un gain nul ; la
// mesure se fait avant les gains. Le reste est lu dans les sources : jukebox.js garde le chemin
// d'avant (setSinkId seul) pour le réglage d'usine, et la page YouTube reçoit le même moteur.

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
   const step = { at: 'début' };
   try {
    const wait =(ms) => new Promise((r) => setTimeout(r, ms));
    // Un la à 440 Hz, 8 s, en WAV fabriqué ici.
    const rate = 44100, n = rate * 8, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / rate) * 12000, true);
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    const routes = [
      { output: 'Sortie qui n’existe pas', gain: 0, filters: [], delay: 0 },
      { output: '', gain: 0, filters: [{ type: 'lowpass', frequency: 120, Q: 0.707 }, { type: 'lowpass', frequency: 120, Q: 0.707 }], delay: 0.02 },
    ];
    const R = window.CyberAudioRoutes;
    // Morceau local : une copie par sortie supplémentaire, chacune dans son contexte.
    const audio = new Audio(url);
    const h = R.attach(audio, routes);
    await audio.play();
    await wait(2500);
    const two = R.status();
    audio.pause();
    await wait(450);
    const paused = R.status().branches[1].lecture;
    audio.currentTime = 5;
    await audio.play();
    await wait(1200);
    const afterSeek = { lead: audio.currentTime, copie: R.status().branches[1].position, ecartMs: R.status().branches[1].ecartMs, vitesse: R.status().branches[1].vitesse };
    h.update([{ output: '', gain: 0, filters: [], delay: 0 }]);
    const one = R.status();
    const t1 = audio.currentTime;
    await wait(300);
    const playing = !audio.paused && audio.currentTime > t1;
    h.close();
    // Page YouTube : une seule vidéo, les autres sorties par son flux.
    const video = new Audio(url);
    const hv = R.attach(video, routes, { flux: true });
    await video.play();
    await wait(1500);
    const flux = R.status();
    hv.close();
    const tested = R.test({ output: '', gain: 0, filters: [], delay: 0 });
    const essai = R.status().essai;
    await wait(200);
    const closed = R.status().elements;
    return { two, paused, afterSeek, one, playing, flux, tested, essai, closed };
   } catch (e) {
    return { error: step.at + ' : ' + String(e && (e.stack || e.message || e.name || e)) };
   }
  })()${'`'}).catch((e) => ({ error: 'rejet : ' + String(e && (e.message || e)) }));
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify({ result, console }));
  app.exit(0);
});
`;

test('sorties du son, vrai Chromium : une horloge par sortie, copies alignées sans variation de vitesse, plan refait sans couper', { skip: electron ? false : 'Electron sous Windows requis', timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sorties-'));
  try {
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_ROUTES: path.join(APP, 'renderer', 'audio-routes.js') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 110_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as {
      result: Record<string, unknown> & { paused: boolean; playing: boolean; tested: boolean; essai: string | null; closed: number };
      console: string[];
    };
    const r = out.result;
    assert.equal((r as { error?: string }).error, undefined, 'la page du banc a planté');
    type B = { sortie: string; filtres: number; retard: number; trouvee: boolean | null; copie: boolean; flux: boolean; ecartMs: number | null; vitesse: number; lecture: boolean | null; niveau: number | null };
    const two = (r.two as { elements: number; branches: B[] }).branches;
    assert.deepEqual(out.console.filter((m) => /Uncaught|TypeError|ReferenceError|NotSupportedError/.test(m)), [], 'aucune erreur de la page');
    assert.deepEqual(two.map((b) => [b.sortie, b.filtres, b.retard, b.copie, b.flux]), [
      ['Sortie qui n’existe pas', 0, 0, false, false],
      ['', 2, 0.02, true, false],
    ], 'la première sortie mène, la seconde a sa copie du morceau');
    assert.equal(two[0]!.trouvee, false, 'sortie introuvable : dite telle');
    for (const b of two) assert.ok((b.niveau ?? 0) > 100, `le son arrive sur « ${b.sortie} » (niveau ${b.niveau})`);
    assert.ok(two[1]!.ecartMs !== null && Math.abs(two[1]!.ecartMs) < 60, `la copie suit le morceau (écart ${two[1]!.ecartMs} ms)`);
    assert.ok(Math.abs(two[1]!.vitesse - 1) <= 0.001, `vitesse de la copie corrigée d’un millième au plus (${two[1]!.vitesse})`);
    assert.equal(r.paused, false, 'pause : la copie s’arrête aussi');
    const s = r.afterSeek as { lead: number; copie: number; ecartMs: number; vitesse: number };
    assert.ok(Math.abs(s.lead - s.copie) < 0.1, `après un saut, la copie rejoint le morceau (${s.lead} / ${s.copie})`);
    assert.ok(Math.abs(s.vitesse - 1) <= 0.001);
    assert.equal((r.one as { branches: B[] }).branches.length, 1, 'nouveau plan : une seule sortie');
    assert.ok(r.playing, 'le morceau continue pendant le changement de plan');
    const flux = (r.flux as { branches: B[] }).branches;
    assert.deepEqual(flux.map((b) => [b.copie, b.flux]), [[false, false], [true, true]], 'page YouTube : la seconde sortie reçoit le flux de la vidéo');
    for (const b of flux) assert.ok((b.niveau ?? 0) > 100, `flux : le son arrive sur « ${b.sortie} » (niveau ${b.niveau})`);
    assert.ok(r.tested && r.essai === '', 'l’extrait d’essai démarre');
    assert.equal(r.closed, 0, 'tout fermé : plus rien dans le graphe');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('audio-routes.js : jamais de MediaStreamDestination lu par un <audio> (Chromium le recale : le son ralentit et accélère)', () => {
  const js = fs.readFileSync(path.join(APP, 'renderer', 'audio-routes.js'), 'utf8');
  assert.doesNotMatch(js, /createMediaStreamDestination|srcObject/);
  assert.match(js, /setSinkId\(id\)/, 'chaque contexte posé sur la carte de sa sortie');
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
