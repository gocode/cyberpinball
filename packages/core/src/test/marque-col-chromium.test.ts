// Marque de l'ouverture, dans un vrai Chromium hors écran (21/11/2026). Le fuseau de fils du plateau
// (intro.js, Soie) se resserre en un col au centre de l'écran ; centrée d'un bloc, la marque « CYBER
// PINBALL » posait le P de PINBALL, vert, sur ce col vert, et il se confondait avec les fils. Depuis,
// CYBER finit à gauche du centre et PINBALL commence à droite : le col passe dans le blanc. Ici, la
// vraie scène (intro.js, intro.css, la police), mesurée dans les proportions des écrans de la borne
// et du PC, à l'image finale et pendant que la marque s'écarte.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { INTRO_TIMELINE } from '../intro';
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

const PAGE = (renderer: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<base href="${renderer}" />
<link rel="stylesheet" href="theme.css" />
<link rel="stylesheet" href="fallback.css" />
<link rel="stylesheet" href="intro.css" />
<style>body { margin: 0; } .box { position: relative; overflow: hidden; }</style>
</head><body>
<script src="police-points.js"></script>
<script src="fallback.js"></script>
<script src="intro.js"></script>
</body></html>`;

const BENCH = String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_DIR;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  // Jamais montrée : rendu hors écran.
  const win = new BrowserWindow({ show: false, frame: false, skipTaskbar: true, focusable: false, width: 2000, height: 2000, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(dir, 'page.html'));
  const spec = fs.readFileSync(path.join(dir, 'spec.json'), 'utf8');
  const out = await win.webContents.executeJavaScript('(' + (async (spec) => {
   try {
    const res = [];
    for (const [w, h] of spec.sizes) {
      for (const at of spec.times) {
        const box = document.createElement('div');
        box.className = 'box';
        box.style.width = w + 'px';
        box.style.height = h + 'px';
        document.body.append(box);
        const scene = CyberIntro.playfield(box, {}, { intro: { at, timeline: spec.timeline } });
        const title = box.querySelector('.cp-in-title');
        const cs = getComputedStyle(title);
        // fonts.load refuse la largeur en pourcentage (125 %) : son mot-clé.
        await document.fonts.load(cs.fontWeight + ' expanded ' + cs.fontSize + ' ' + cs.fontFamily);
        await document.fonts.ready;
        scene.repaint();
        const glyph = (span, i) => {
          const r = document.createRange();
          r.setStart(span.firstChild, i);
          r.setEnd(span.firstChild, i + 1);
          return r.getBoundingClientRect();
        };
        const ink = title.querySelector('.cp-ink');
        const pin = title.querySelector('.cp-pin');
        const font = parseFloat(getComputedStyle(title).fontSize);
        const ls = parseFloat(getComputedStyle(title).letterSpacing);
        const b = box.getBoundingClientRect();
        // L'espacement suit chaque lettre : le R finit avant lui.
        res.push({ w, h, at, font, center: b.left + b.width / 2, right: b.right, rEnd: glyph(ink, 4).right - ls, pStart: glyph(pin, 0).left, lEnd: glyph(pin, 6).right - ls, cStart: glyph(ink, 0).left, left: b.left });
        scene.destroy();
        box.remove();
      }
    }
    return res;
   } catch (error) {
    // executeJavaScript ne rend qu'un objet vide d'une erreur de la page : son texte, ici.
    return { error: String(error && error.stack ? error.stack : error) };
   }
  }).toString() + ')(' + spec + ')');
  if (out.error) throw new Error(out.error);
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify(out));
  app.exit(0);
}).catch((error) => {
  // Une erreur dans la page : la dire et finir, sans attendre le délai.
  console.error(error && (error.stack || error.message) ? error.stack || error.message : JSON.stringify(error));
  app.exit(1);
});
`;

interface Mesure {
  w: number;
  h: number;
  at: number;
  font: number;
  center: number;
  right: number;
  left: number;
  rEnd: number;
  pStart: number;
  lEnd: number;
  cStart: number;
}

test('marque de l’ouverture, vrai Chromium : le col de la tornade passe dans le blanc entre CYBER et PINBALL', { skip: electron ? false : 'Electron sous Windows requis', timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-marque-col-'));
  try {
    fs.writeFileSync(path.join(dir, 'page.html'), PAGE(pathToFileURL(path.join(APP, 'renderer')).href + '/'));
    // Plateau 9:16 et 3:4 de la borne, écran 16:9 du PC ; à l'image finale et pendant l'écartement (2,5 à 3,4 s).
    const spec = { timeline: INTRO_TIMELINE, sizes: [[1080, 1920], [1080, 1440], [1920, 1080]], times: [2900, INTRO_TIMELINE.end] };
    fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec));
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 110_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as Mesure[];
    assert.equal(out.length, 6);
    for (const m of out) {
      const where = `${m.w} × ${m.h} à ${m.at} ms`;
      const before = m.center - m.rEnd;
      const after = m.pStart - m.center;
      // Le col fait moins d'une demi-lettre à hauteur de la marque : un blanc d'au moins 0,6 em de chaque côté.
      assert.ok(before >= 0.6 * m.font, `${where} : le R finit ${before.toFixed(1)} px avant le centre (police ${m.font.toFixed(1)} px)`);
      assert.ok(after >= 0.6 * m.font, `${where} : le P commence ${after.toFixed(1)} px après le centre`);
      // Le blanc est centré sur le col, à l'image finale comme pendant l'écartement.
      assert.ok(Math.abs(before - after) <= 0.15 * m.font, `${where} : blanc décentré (${before.toFixed(1)} px à gauche, ${after.toFixed(1)} px à droite)`);
      // Les deux mots restent dans l'écran.
      assert.ok(m.cStart >= m.left && m.lEnd <= m.right, `${where} : la marque déborde (${m.cStart.toFixed(0)} à ${m.lEnd.toFixed(0)}, écran ${m.left.toFixed(0)} à ${m.right.toFixed(0)})`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
