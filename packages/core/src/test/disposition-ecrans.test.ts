// Disposition des écrans (--disposition), novembre 2026 : sur le fronton de la borne, le bandeau
// d'aide du haut (« Tirez une zone pour la déplacer… ») recouvrait l'étiquette de la zone
// (« BACKGLASS · 1920 × 1080 · PLEIN ÉC… »), et le garde-fou de mise en page n'en disait rien :
// - l'étiquette était un ::before (content: attr(data-label)), sans nœud de texte à mesurer ;
// - le bandeau laissait passer la souris (pointer-events: none) : le relevé au point tombait dessous ;
// - son fond opaque l'aurait de toute façon fait passer pour une superposition voulue.
// Le même jour, sur l'écran « Mode invité », le cadenas de « Fermé en mode invité » partait seul
// au-dessus de son texte (ligne flex qui passe à la ligne), sans rien de signalé non plus.
// Trois maillons, fixés ici :
// - le garde-fou (layout-check.ts), dans un vrai Chromium hors écran : un calque opaque qui ne cache
//   qu'une partie d'un texte, même sans souris, est signalé ; un calque qui le cache en entier ne
//   l'est pas ; un texte écrit par la feuille de style l'est ; une icône seule sur sa ligne aussi,
//   vue pivotée comprise ;
// - la vraie page de l’éditeur (screen.html, banc dans disposition-ecrans-pages.test.ts), dans l'état que rendent arrange.ts et wizard.ts, sur
//   chaque jeu d'écrans simulé (borne, poste à deux écrans, un écran en 1366 × 768, en 1920 × 1080 et
//   en 4K), en français et en anglais : aucun problème, sur aucune fenêtre ;
// - le geste à la souris est dans la ligne d'aide des autres écrans, à sa place dans le flux.

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

test('disposition des écrans : le geste à la souris est dans la ligne d’aide, l’étiquette d’une zone est un texte de la page', () => {
  const wizard = fs.readFileSync(path.join(APP, 'src', 'wizard.ts'), 'utf8');
  assert.match(wizard, /hint: panelHere \? '' : t\('Tirez une zone pour la déplacer, jusque sur un autre écran · tirez un coin pour la redimensionner'\)/);
  const html = fs.readFileSync(path.join(APP, 'renderer', 'screen.html'), 'utf8');
  assert.doesNotMatch(html, /arrange-coach/, 'plus de bandeau posé par-dessus les écrans');
  const css = fs.readFileSync(path.join(APP, 'renderer', 'screen.css'), 'utf8');
  assert.doesNotMatch(css, /content:\s*attr\(/, 'aucun texte écrit par la feuille de style');
  assert.match(fs.readFileSync(path.join(APP, 'renderer', 'screen.js'), 'utf8'), /label\.className = 'zone-label'/);
});

// ---------- Le garde-fou, sur des pages témoins ----------

// Une icône du registre (icons.js), à la taille que lui donne theme.css : 1 em.
const ICON = '<svg class="icon" data-icon="lock" viewBox="0 0 24 24" style="width:1em;height:1em;flex:none"><rect x="5" y="11" width="14" height="9"/></svg>';
const LONG = 'Menu système, réglages de VPX, Bureau Windows, quitter, fichiers glissés';
const row = (text: string, width: number) => `<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;width:${width}px;font-size:24px">${ICON}<span>${text}</span></div>`;

const CASES: Record<string, string> = {
  // Le défaut du fronton : étiquette en haut à gauche, bandeau opaque sans souris sur son bout.
  bandeau: '<span style="position:fixed;left:20px;top:10px;font-size:24px">BACKGLASS · 1920 × 1080 · PLEIN ÉCRAN</span><div style="position:fixed;left:300px;top:5px;padding:6px 16px;font-size:22px;background:rgba(7,17,15,0.92);pointer-events:none">Tirez une zone pour la déplacer</div>',
  // Un calque opaque qui cache le texte en entier : une superposition voulue.
  calque: '<span style="position:fixed;left:20px;top:10px;font-size:24px">Texte du dessous</span><div style="position:fixed;inset:0 0 auto 0;height:200px;background:#000;font-size:24px">Calque du dessus</div>',
  // La ligne choisie (fond vert) d'un écran plein passe sur le titre du menu, que l'écran opaque cache déjà en entier.
  // Un en-tête collant au-dessus d'une liste qui défile : ce qui passe dessous a défilé, pas coupé.
  'entete-collant': '<div style="position:fixed;left:0;top:0;width:600px;height:200px;overflow:auto;font-size:24px"><div style="position:sticky;top:0;background:#000">Bilan</div>' + '<p data-act style="margin:0">Ligne qui défile</p>'.repeat(30) + '</div><script>document.querySelector("div").scrollTop = 45</script>',
  'ligne-choisie': '<span style="position:fixed;left:20px;top:40px;font-size:24px">ATLAS RISING</span><section style="position:fixed;inset:0;background:#000"><ul style="margin:0;padding:0;list-style:none"><li style="margin-top:30px;width:120px;background:#8be23a;color:#000;font-size:24px">Choisie</li></ul></section>',
  // L'étiquette d'avant : écrite par la feuille de style.
  pseudo: '<style>.z::before{content:attr(data-label);position:absolute;left:20px;top:10px;font-size:24px}</style><div class="z" data-label="BACKGLASS · PLEIN ÉCRAN" style="position:fixed;inset:0"></div>',
  // Un symbole seul, pas un texte : laissé.
  symbole: '<style>.v::after{content:" ✓"}</style><span class="v" style="font-size:24px">Fait</span>',
  // Le défaut du mode invité : texte trop long pour la ligne de l'icône.
  'icone-seule': row(LONG, 700),
  'icone-devant': row('Fermé', 700),
  // Même défaut dans une vue pivotée d'un quart de tour (playfield de la borne).
  'icone-pivotee': `<div style="position:fixed;left:960px;top:100px;transform-origin:0 0;transform:rotate(90deg)">${row(LONG, 700)}</div>`,
  'icone-pivotee-devant': `<div style="position:fixed;left:960px;top:100px;transform-origin:0 0;transform:rotate(90deg)">${row('Fermé', 700)}</div>`,
  // Icône au-dessus de son texte voulue : colonne.
  colonne: `<div style="display:flex;flex-direction:column;font-size:24px;width:300px">${ICON}<span>${LONG}</span></div>`,
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
  win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
  const out = {};
  for (const [name, body] of Object.entries(cases)) {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><body style="margin:0;color:#fff;background:#000">' + body));
    await new Promise((r) => setTimeout(r, 300));
    out[name] = await checkLayout(win.webContents);
  }
  fs.writeFileSync(process.env.CP_OUT, JSON.stringify(out));
  app.exit(0);
});
`;

test('garde-fou : un calque qui coupe un texte, un texte écrit par la feuille de style, une icône seule sur sa ligne', { skip: electron ? false : 'Electron sous Windows requis', timeout: 420_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-recouvrements-'));
  try {
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    fs.writeFileSync(path.join(dir, 'cas.json'), JSON.stringify(CASES));
    const env: NodeJS.ProcessEnv = { ...process.env, CP_LAYOUT_CHECK: path.join(APP, 'dist', 'layout-check.js'), CP_CASES: path.join(dir, 'cas.json'), CP_OUT: path.join(dir, 'out.json') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 400_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const found = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as Record<string, string[]>;
    const only = (name: string, pattern: RegExp) => {
      assert.equal(found[name]!.length, 1, `${name} : ${found[name]!.join(' | ')}`);
      assert.match(found[name]![0]!, pattern, name);
    };
    only('bandeau', /^caché en partie : span « BACKGLASS · 1920 × 1080 · PLEIN ÉCRAN » .* sous div « Tirez une zone pour la déplacer »/);
    assert.deepEqual(found.calque, [], 'un calque qui cache tout le texte : voulu');
    assert.deepEqual(found['entete-collant'], [], 'un en-tête collant au-dessus d’une liste qui défile : voulu');
    assert.deepEqual(found['ligne-choisie'], [], 'la ligne choisie d’un écran plein, sur le menu que cet écran cache en entier : voulu');
    only('pseudo', /^texte écrit par la feuille de style \(::before\) : div\.z /);
    assert.deepEqual(found.symbole, [], 'un symbole écrit par la feuille de style n’est pas un texte');
    only('icone-seule', /^icône seule sur sa ligne, au-dessus de son texte : svg\[lock\] et span « Menu système/);
    assert.deepEqual(found['icone-devant'], []);
    only('icone-pivotee', /^icône seule sur sa ligne, au-dessus de son texte : svg\[lock\]/);
    assert.deepEqual(found['icone-pivotee-devant'], []);
    assert.deepEqual(found.colonne, [], 'une colonne pose l’icône au-dessus exprès');
  } finally {
    removeTempDir(dir);
  }
});

// La vraie page de l’éditeur, sur chaque jeu d’écrans : disposition-ecrans-pages.test.ts.
