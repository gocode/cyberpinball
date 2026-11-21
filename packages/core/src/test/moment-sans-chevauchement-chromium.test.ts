// Le moment d'un badge ou d'un niveau (app/renderer/niveau.js) passe sur l'écran des tables sous son
// voile, dans un vrai Chromium hors écran, en borne (plateau tourné) et au bureau. Constaté le
// 18/11/2026 (démonstration de Mon compte) : le garde-fou de mise en page voyait le compteur de la
// file (« 2 / 6 ») sur la roue dentée et la pastille des badges, et le niveau sur le titre de la table.
// Deux causes :
// - le voile repartait de zéro à chaque badge (la classe du déroulé ôtée puis remise) : la roue se
//   rallumait un instant sous le badge suivant ;
// - le garde-fou ne voyait pas ce voile, frère de la colonne qui porte le texte (il ne cherchait un
//   fond opaque que parmi les ancêtres) ; une exception pour tout le moment l'avait ensuite rendu aveugle.
// Ici : tout le déroulé (départ, puis trois badges dont le dernier fait monter le niveau) est relevé
// par le vrai garde-fou toutes les 300 ms ; le voile reste opaque d'un badge à l'autre ; et sans voile,
// le garde-fou signale bien le texte du moment posé sur la roue (il n'est pas aveugle).

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

const BENCH = String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { checkLayout } = require(process.env.CP_LAYOUT_CHECK);
const dir = process.env.CP_DIR;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'etat.json'), 'utf8'));
  const moment = JSON.parse(fs.readFileSync(path.join(dir, 'moment.json'), 'utf8'));
  // Borne : écran paysage, plateau tourné d'un quart de tour (comme les écrans simulés de la borne) ; bureau : à plat.
  const modes = { borne: '270', bureau: '0' };
  const wins = {};
  for (const [mode, rotation] of Object.entries(modes)) {
    // Jamais montrée : rendu hors écran.
    const win = new BrowserWindow({
      show: false, frame: false, skipTaskbar: true, focusable: false, width: 1920, height: 1080, useContentSize: true, enableLargerThanScreen: true,
      webPreferences: { offscreen: true, preload: path.join(dir, 'preload.cjs'), contextIsolation: false, sandbox: false },
    });
    win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
    await win.loadFile(process.env.CP_PAGE, { query: { role: 'playfield', rotation } });
    await win.webContents.executeJavaScript('window.__send(' + JSON.stringify(state) + ')');
    wins[mode] = win;
  }
  await wait(1500);
  const out = {};
  for (const mode of Object.keys(modes)) out[mode] = { before: await checkLayout(wins[mode].webContents), samples: [] };
  const look = ${'`'}(() => {
    const q = (s) => document.querySelector(s);
    const veil = q('#level-moment .lm-veil');
    const r = (s) => { const e = q(s); if (!e) return undefined; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); };
    // Opacité vue d'un élément : la sienne et celles de ses ancêtres.
    const seen = (e) => { let o = 1; for (let n = e; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    const texts = [...document.querySelectorAll('#level-moment .lm-column *')].filter((e) => e.childElementCount === 0 && e.textContent.trim());
    return {
      on: Boolean(q('#level-moment.lm-on')),
      queue: q('.lm-queue')?.textContent ?? '',
      name: q('.lm-name')?.textContent ?? '',
      veil: veil ? Number(getComputedStyle(veil).opacity) : -1,
      text: Math.max(0, ...texts.map(seen)),
      gear: r('#root .gear'), queueBox: r('.lm-queue'),
    };
  })()${'`'};
  for (const mode of Object.keys(modes)) await wins[mode].webContents.executeJavaScript('window.__send(' + JSON.stringify({ ...state, levelMoment: moment }) + ')');
  const t0 = Date.now();
  while (Date.now() - t0 < 21000) {
    for (const mode of Object.keys(modes)) {
      const at = Date.now() - t0;
      const problems = await checkLayout(wins[mode].webContents);
      out[mode].samples.push({ at, problems, ...(await wins[mode].webContents.executeJavaScript(look)) });
    }
    await wait(300);
  }
  // Sans voile (comme quand il repartait de zéro) : le texte du moment est sur la roue, le garde-fou doit le dire.
  for (const mode of Object.keys(modes)) {
    await wins[mode].webContents.executeJavaScript("document.querySelector('#level-moment .lm-veil').style.cssText = 'animation: none; opacity: 0'");
    await wait(100);
    out[mode].unveiled = await checkLayout(wins[mode].webContents);
    out[mode].unveiledLook = await wins[mode].webContents.executeJavaScript(look);
  }
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify(out));
  app.exit(0);
});
`;

// Le pont du préchargement (preload.ts), réduit à ce que la page appelle : le reste ne fait rien.
const PRELOAD = String.raw`
window.cyberI18n = {};
window.cyber = new Proxy({ onState: (f) => { window.__send = f; }, pathOf: () => '' }, { get: (t, k) => (k in t ? t[k] : () => undefined) });
`;

/** Le moment d'un compte neuf : le niveau de départ, puis trois badges ; le dernier fait passer au niveau 11. */
function momentView() {
  const lv = (level: number, progress: number) => ({ level, progress, into: Math.round(progress * 1200), need: 1200, tier: 'habitue', tierLabel: 'Habitué' });
  const badge = (id: string, label: string, rarity: string, backdrop: string) => ({ id, label, detail: 'Un exploit inventé pour l’essai', rarity, rarityLabel: rarity === 'common' ? 'Commun' : 'Rare', icon: 'medal', backdrop, shape: rarity === 'common' ? 'round' : 'hex', xp: rarity === 'common' ? 50 : 150 });
  return {
    key: 'essai-moment',
    start: true,
    badges: [badge('a', 'Premier pas', 'common', 'shock'), badge('b', 'Grand voyageur', 'rare', 'rays'), badge('c', 'Lève-tôt', 'common', 'rise')],
    from: lv(10, 0.82),
    to: lv(11, 0.1),
    avatar: { initials: 'AB', hue: 140, level: 11 },
    sounds: {},
    texts: { unlocked: 'Badge débloqué', secret: 'Secret dévoilé', level: 'Niveau', start: 'Votre niveau de départ', startDetail: 'Calculé sur vos parties d’avant les niveaux', badgesSoFar: '3 badges déjà mérités', continue: 'Un bouton pour continuer' },
  };
}

interface Sample {
  at: number;
  problems: string[];
  on: boolean;
  queue: string;
  name: string;
  veil: number;
  text: number;
  gear?: number[];
  queueBox?: number[];
}
interface Mode {
  before: string[];
  samples: Sample[];
  unveiled: string[];
  unveiledLook: Sample;
}

test('moment des badges, vrai Chromium, borne et bureau : rien ne se chevauche, le voile reste d’un badge à l’autre, et le garde-fou voit ce qu’il cache', { skip: electron ? false : 'Electron sous Windows requis', timeout: 180_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-moment-'));
  try {
    const state = {
      ...menuState({ 'a.vpx': undefined, 'b.vpx': undefined, 'c.vpx': undefined }, { 'a.vpx': 'Éclair', 'b.vpx': 'Neon Galaxy', 'c.vpx': 'Orbite' }),
      // La roue dentée avec sa pastille rouge, la carte du joueur et la pastille des badges : le coin d'état du constat.
      attention: true,
      zone: 'corner',
      player: { name: 'Pilote', avatar: { initials: 'AB', hue: 140, level: 11 }, level: 11, label: 'Niveau 11', progress: 0.1, title: 'Mon niveau' },
      badges: { count: 3, total: 40, title: 'Mes badges' },
    };
    fs.writeFileSync(path.join(dir, 'etat.json'), JSON.stringify(state));
    fs.writeFileSync(path.join(dir, 'moment.json'), JSON.stringify(momentView()));
    fs.writeFileSync(path.join(dir, 'preload.cjs'), PRELOAD);
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_PAGE: path.join(APP, 'renderer', 'frontend.html'), CP_LAYOUT_CHECK: path.join(APP, 'dist', 'layout-check.js') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 170_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as Record<'borne' | 'bureau', Mode>;
    for (const [mode, o] of Object.entries(out)) {
      // Le banc a bien montré tout le moment : le départ, puis chaque badge et son rang dans la file.
      assert.ok(o.samples.every((s) => s.on), `${mode} : le moment reste ouvert`);
      assert.ok(o.samples.some((s) => s.name === 'Niveau 11'), `${mode} : le niveau de départ`);
      for (const q of ['1 / 3', '2 / 3', '3 / 3']) assert.ok(o.samples.some((s) => s.queue === q), `${mode} : le badge ${q}`);
      // Le moment n'ajoute aucun problème de mise en page, à aucun instant. Au bureau, hors du sujet de ce
      // banc : ses textes, mesurés sur la colonne 9:16 (607 px de large dans 1 080 de haut), passent sous
      // le plancher de 20 px (constaté le 18/11/2026, en attente d'une décision de design) ; tout le reste compte.
      const small = (p: string) => mode === 'bureau' && p.startsWith('texte plus petit que 20 px');
      const added = o.samples.flatMap((s) => s.problems.filter((p) => !o.before.includes(p) && !small(p)).map((p) => `${s.at} ms : ${p}`));
      assert.deepEqual(added, [], `${mode} : problèmes de mise en page pendant le moment`);
      // Aucun texte du moment ne se voit avant que le voile soit complet. (Hors écran, Chromium tient
      // parfois toutes les animations en attente quelques secondes : on ne compte pas en millisecondes.)
      const early = o.samples.filter((s) => s.text >= 0.05 && s.veil < 0.99).map((s) => `${s.at} ms : texte ${s.text}, voile ${s.veil}`);
      assert.deepEqual(early, [], `${mode} : du texte du moment sur une roue mal voilée`);
      // Une fois posé, le voile ne repart pas de zéro au badge suivant (la roue se rallumait un instant).
      const full = o.samples.findIndex((s) => s.veil >= 0.99);
      assert.ok(full >= 0, `${mode} : le voile se pose`);
      const dim = o.samples.slice(full).filter((s) => s.veil < 0.99).map((s) => `${s.at} ms : ${s.veil}`);
      assert.deepEqual(dim, [], `${mode} : le voile reste opaque d’un badge à l’autre`);
    }
    // Sans voile, en borne, le compteur de la file est sur la roue dentée : le garde-fou le signale.
    const borne = out.borne;
    const [g, q] = [borne.unveiledLook.gear!, borne.unveiledLook.queueBox!];
    assert.ok(g && q && q[0]! < g[2]! && g[0]! < q[2]! && q[1]! < g[3]! && g[1]! < q[3]!, `en borne, la file du moment est posée sur la roue dentée : ${JSON.stringify({ gear: g, queue: q })}`);
    assert.ok(
      borne.unveiled.some((p) => /^chevauchement : .*lm-queue/.test(p)),
      `sans voile, le garde-fou voit la file sur la roue dentée : ${JSON.stringify(borne.unveiled)}`,
    );
  } finally {
    removeTempDir(dir);
  }
});
